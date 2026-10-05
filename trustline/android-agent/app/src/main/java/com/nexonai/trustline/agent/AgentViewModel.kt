package com.nexonai.trustline.agent

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.nexonai.trustline.agent.core.Crypto
import com.nexonai.trustline.agent.core.JObj
import com.nexonai.trustline.agent.core.Json
import com.nexonai.trustline.agent.core.Protocol
import com.nexonai.trustline.agent.core.Signer
import com.nexonai.trustline.agent.core.bool
import com.nexonai.trustline.agent.core.get
import com.nexonai.trustline.agent.core.jo
import com.nexonai.trustline.agent.core.list
import com.nexonai.trustline.agent.core.long
import com.nexonai.trustline.agent.core.obj
import com.nexonai.trustline.agent.core.str
import com.nexonai.trustline.agent.data.KeystoreSigner
import com.nexonai.trustline.agent.data.StateStore
import com.nexonai.trustline.agent.net.NetworkException
import com.nexonai.trustline.agent.net.RelayClient
import com.nexonai.trustline.agent.net.RelayException
import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

enum class Phase { Loading, Setup, Waiting, Locked, Main }

sealed class SendOutcome {
    class Receipt(val id: String, val code: String, val seq: Long) : SendOutcome()
    object Queued : SendOutcome()
    class Rejected(val reasons: List<String>) : SendOutcome()
    class Failed(val text: String) : SendOutcome()
}

class NewForm(
    val recipient: Protocol.Recipient, val amount: String, val currency: String, val purpose: String, val reference: String,
    val screeningRef: String, val originator: JObj, val beneficiary: JObj,
)

/**
 * Holds the agent's state: enrolment, the signed relay session, caches of the directory / inbox / outbox, and the offline queue.
 * Everything that touches persistent state runs under one lock.
 */
class AgentViewModel(app: Application) : AndroidViewModel(app) {
    private val store = StateStore(app)
    private val lock = Mutex()
    private var state: MutableMap<String, Any?> = linkedMapOf()
    private var client: RelayClient? = null
    private var signer: Signer? = null
    private var pollJob: Job? = null
    val speaker = Speaker(app)

    var phase by mutableStateOf(Phase.Loading)
    var lockReason by mutableStateOf("")
    var busy by mutableStateOf(false)
    var message by mutableStateOf<String?>(null)
    var profile by mutableStateOf<JObj>(emptyMap())
    var inbox by mutableStateOf<List<JObj>>(emptyList())
    var outbox by mutableStateOf<List<JObj>>(emptyList())
    var directory by mutableStateOf<List<Protocol.Recipient>>(emptyList())
    var queue by mutableStateOf<List<JObj>>(emptyList())
    var settings by mutableStateOf<JObj>(emptyMap())
    var lastSync by mutableStateOf(0L)
    var online by mutableStateOf(true)
    var speak by mutableStateOf(false)
    var localStatus by mutableStateOf<Map<String, String>>(emptyMap())
    var enrolPrefill by mutableStateOf<Pair<String, String>?>(null)
    var keyInfo by mutableStateOf("")

    // ------------------------------------------------------------------ small helpers
    private fun nowMs(): Long = client?.nowMs ?: System.currentTimeMillis()
    private fun agentId(): String = profile["agentId"].str()
    private fun persist() = store.save(state)
    fun say(text: String) { if (speak) speaker.say(text) }
    fun notify(text: String) { message = text }
    fun dismissMessage() { message = null }
    val relayUrl: String get() = state["relay"].str()
    val signKid: String get() = state["signKid"].str()
    val encKid: String get() = state["encKid"].str()
    val deviceName: String get() = state["deviceName"].str()
    val activationCode: String get() = state["code"].str()

    private fun normalizeUrl(u: String): String {
        var s = u.trim().trimEnd('/')
        if (s.isEmpty()) throw IllegalArgumentException("Enter the relay address.")
        if (!s.startsWith("http://") && !s.startsWith("https://")) s = "http://$s"
        return s
    }

    private fun setupClient() {
        client = RelayClient(state["relay"].str()).also { it.offsetMs = state["offsetMs"].long() }
        signer = KeystoreSigner.existing(state["signAlias"].str())
        keyInfo = (signer as? KeystoreSigner)?.let { if (it.hardwareBacked()) "hardware-backed key" else "software key" } ?: ""
    }

    private fun loadCaches() {
        profile = state["profile"].obj()
        inbox = state["inbox"].list().map { it.obj() }
        outbox = state["outbox"].list().map { it.obj() }
        directory = state["directory"].list().map { Protocol.Recipient.from(it) }
        queue = state["queue"].list().map { it.obj() }
        settings = state["settings"].obj()
        lastSync = state["lastSync"].long()
        speak = state["speak"].bool()
        localStatus = state["localStatus"].obj().mapValues { it.value.str() }
    }

    private fun queueList(): MutableList<JObj> = state["queue"].list().map { it.obj() }.toMutableList()
    private fun putQueue(q: List<JObj>) { state["queue"] = q; queue = q }
    private fun codes(): MutableMap<String, Any?> = LinkedHashMap(state["codes"].obj())
    private fun receipts(): MutableMap<String, Any?> = LinkedHashMap(state["receipts"].obj())
    private fun setLocalStatus(id: String, status: String) {
        val m = LinkedHashMap(state["localStatus"].obj()); m[id] = status; state["localStatus"] = m
        localStatus = m.mapValues { it.value.str() }
    }

    fun payoutCodeFor(id: String): String? {
        val visible = receipts().containsKey(id) || outbox.any { it["id"].str() == id }
        return if (visible) state["codes"].obj()[id] as? String else null
    }

    // ------------------------------------------------------------------ startup and enrolment
    fun start() {
        if (phase != Phase.Loading) return
        viewModelScope.launch(Dispatchers.IO) {
            state = store.load()
            if (state["profile"] is Map<*, *>) {
                setupClient(); loadCaches()
                phase = Phase.Main
            } else if (state.str("code").isNotEmpty() && state["signAlias"] != null) {
                setupClient(); phase = Phase.Waiting; pollEnrol()
            } else phase = Phase.Setup
        }
    }

    private fun Map<String, Any?>.str(k: String): String = this[k].str()

    fun enrol(relayUrl: String, code: String, device: String) {
        viewModelScope.launch(Dispatchers.IO) {
            busy = true
            try {
                val url = normalizeUrl(relayUrl)
                if (code.trim().length < 6) throw IllegalArgumentException("Enter the activation code from your operator.")
                val c = RelayClient(url)
                c.publicGet("/api/info")
                val alias = "tl_sign_" + Crypto.hex(Crypto.randomBytes(4))
                val sg = KeystoreSigner.generate(alias)
                val enc = Crypto.genEcKeyPair()
                val encPub = Crypto.b64e(enc.public.encoded)
                c.publicPost("/api/agent/enroll", jo("code" to code.trim(), "signPub" to sg.publicSpki(), "encPub" to encPub, "deviceName" to device.trim().ifEmpty { "Android phone" }))
                state = linkedMapOf(
                    "relay" to url, "code" to code.trim(), "signAlias" to alias, "signKid" to sg.signKid, "encKid" to Crypto.keyId(encPub),
                    "encPriv" to Crypto.b64e(enc.private.encoded), "deviceName" to device.trim(), "queue" to emptyList<Any?>(), "codes" to jo(), "receipts" to jo(), "localStatus" to jo())
                persist(); setupClient(); loadCaches()
                phase = Phase.Waiting
                pollEnrol()
            } catch (e: IllegalArgumentException) { notify(e.message ?: "Check your input.")
            } catch (e: NetworkException) { notify("Cannot reach the relay. Check the address and your connection.")
            } catch (e: RelayException) { notify(e.message ?: "Relay error.")
            } catch (e: Exception) { notify("Enrolment failed: ${e.message}")
            } finally { busy = false }
        }
    }

    private fun pollEnrol() {
        pollJob?.cancel()
        pollJob = viewModelScope.launch(Dispatchers.IO) {
            while (phase == Phase.Waiting) {
                try {
                    val r = client!!.publicGet("/api/agent/enroll/status?code=" + URLEncoder.encode(state.str("code"), "UTF-8"))
                    when (r["status"].str()) {
                        "certified" -> {
                            lock.withLock {
                                state["profile"] = jo("agentId" to r["agentId"], "agent" to r["agent"], "operator" to r["operator"], "limits" to r["limits"],
                                    "cert" to r["cert"], "certSig" to r["certSig"], "relay" to r["relay"])
                                persist(); loadCaches()
                            }
                            phase = Phase.Main
                            say("This device is approved.")
                            syncOnce()
                            return@launch
                        }
                        "rejected", "revoked" -> { notify("Your operator did not approve this device."); resetDevice(); return@launch }
                    }
                } catch (e: Exception) { /* keep polling */ }
                delay(3000)
            }
        }
    }

    fun resetDevice() {
        pollJob?.cancel()
        viewModelScope.launch(Dispatchers.IO) {
            lock.withLock {
                KeystoreSigner.delete(state.str("signAlias"))
                store.wipe()
                state = linkedMapOf(); client = null; signer = null
                profile = emptyMap(); inbox = emptyList(); outbox = emptyList(); directory = emptyList(); queue = emptyList(); localStatus = emptyMap(); lastSync = 0
                lockReason = ""; phase = Phase.Setup
            }
        }
    }

    // ------------------------------------------------------------------ synchronisation
    suspend fun syncLoop() {
        while (true) {
            if (phase == Phase.Main) syncOnce()
            delay(15_000)
        }
    }

    fun syncNow() { viewModelScope.launch(Dispatchers.IO) { busy = true; try { syncOnce() } finally { busy = false } } }

    suspend fun syncOnce() = lock.withLock {
        if (phase != Phase.Main) return@withLock
        val c = client ?: return@withLock
        val sg = signer ?: return@withLock
        try {
            flushQueueLocked(c, sg)
            val me = c.signedCall("GET", "/api/agent/me", null, sg, agentId())
            val p = LinkedHashMap(state["profile"].obj())
            p["limits"] = me["limits"]; p["agent"] = me["agent"]; p["operator"] = me["operator"]
            state["profile"] = p; state["settings"] = me["settings"]
            state["directory"] = c.signedCall("GET", "/api/agent/directory", null, sg, agentId())["recipients"].list()
            val inb = c.signedCall("GET", "/api/agent/inbox", null, sg, agentId())["items"].list()
            state["inbox"] = inb
            state["outbox"] = c.signedCall("GET", "/api/agent/outbox", null, sg, agentId())["items"].list()
            state["lastSync"] = System.currentTimeMillis(); state["offsetMs"] = c.offsetMs
            // drop local status overrides the relay has caught up with
            val ls = LinkedHashMap(state["localStatus"].obj())
            for ((id, st) in ls.entries.toList()) {
                val server = (state["inbox"].list() + state["outbox"].list()).firstOrNull { it["id"].str() == id }
                if (server != null && server["status"].str() == st) ls.remove(id)
            }
            state["localStatus"] = ls
            persist(); loadCaches(); online = true
            autoConfirm(c, sg, inb)
        } catch (e: NetworkException) {
            online = false
        } catch (e: RelayException) {
            handleRelayError(e)
        }
    }

    private fun handleRelayError(e: RelayException) {
        when (e.code) {
            "device_revoked" -> lockReason = "Your operator revoked this device key."
            "agent_revoked" -> lockReason = "Your operator revoked this agent."
            "operator_suspended" -> lockReason = "Your network operator is suspended by TrustLine."
            "clock" -> { notify("The relay rejected the request time. Check the phone clock."); return }
            else -> { online = true; return }
        }
        phase = Phase.Locked
    }

    private fun autoConfirm(c: RelayClient, sg: Signer, items: List<Any?>) {
        for (it in items) {
            if (it["status"].str() != "INSTRUCTED" || it["frozen"].bool()) continue
            if (it["instruction"]["recipient"]["agent"].str() != agentId()) continue
            if (!Protocol.verifyIncoming(it)) continue
            val (ev, sig) = Protocol.buildEvent("CONFIRM", it["id"].str(), agentId(), c.nowMs, sg)
            try { c.signedCall("POST", "/api/agent/events", jo("event" to ev, "sig" to sig), sg, agentId()) } catch (e: Exception) { /* retried on the next sync */ }
        }
    }

    /** Sends queued items in order. Stops at the first network failure. Rejected items stay in the queue marked as rejected. */
    private fun flushQueueLocked(c: RelayClient, sg: Signer) {
        val q = queueList()
        var changed = false
        for (idx in q.indices) {
            val item = q[idx]
            if (item["rejected"].bool()) continue
            try {
                val res = c.signedCall("POST", item["path"].str(), item["body"], sg, agentId())
                q[idx] = item + mapOf("done" to true)
                changed = true
                if (item["kind"].str() == "instruction") {
                    val r = receipts(); r[item["instructionId"].str()] = res["receipt"]["seq"].long(); state["receipts"] = r
                }
            } catch (e: RelayException) {
                if (e.code in setOf("device_revoked", "agent_revoked", "operator_suspended", "clock")) throw e
                q[idx] = item + mapOf("rejected" to true, "error" to (if (e.reasons.isNotEmpty()) e.reasons.joinToString(" ") else e.message))
                changed = true
            } finally {
                if (changed) { putQueue(q.filter { !it["done"].bool() }); persist() }
            }
        }
        if (changed) { putQueue(q.filter { !it["done"].bool() }); persist() }
    }

    fun dismissQueueItem(qid: String) {
        viewModelScope.launch(Dispatchers.IO) { lock.withLock { putQueue(queueList().filter { it["qid"].str() != qid }); persist() } }
    }

    // ------------------------------------------------------------------ offline rules
    private fun limit(k: String): Long = ((profile["limits"][k].str().toDoubleOrNull() ?: 0.0) * 100).toLong()
    private fun windowExceeded(): Boolean {
        val hours = profile["limits"]["offlineHours"].long().coerceAtLeast(1)
        return lastSync > 0 && System.currentTimeMillis() - lastSync > hours * 3600_000L
    }
    fun offlineWindowText(): String {
        val hours = profile["limits"]["offlineHours"].long().coerceAtLeast(1)
        if (lastSync == 0L) return "never synchronised"
        val left = hours * 3600_000L - (System.currentTimeMillis() - lastSync)
        return if (left <= 0) "exceeded: connect to synchronise" else "${left / 3600_000} h ${(left / 60_000) % 60} min left offline"
    }

    // ------------------------------------------------------------------ send an instruction
    suspend fun sendInstruction(f: NewForm): SendOutcome = lock.withLock {
        val c = client ?: return@withLock SendOutcome.Failed("Not connected.")
        val sg = signer ?: return@withLock SendOutcome.Failed("Device key missing.")
        if (windowExceeded()) return@withLock SendOutcome.Failed("The offline window is used up. Connect to the internet to synchronise first.")
        val op = profile["operator"]
        val built = Protocol.buildInstruction(
            Protocol.NewInstruction(f.recipient, f.amount, f.currency, f.purpose, f.reference, f.screeningRef, f.originator, f.beneficiary),
            sg, agentId(), profile["agent"]["country"].str(), op["id"].str(), op["encPub"].str(), op["encKid"].str(), c.nowMs)
        val body = jo("instruction" to built.instruction, "sig" to built.sig, "package" to built.pkg)
        val c2 = codes(); c2[built.id] = built.code; state["codes"] = c2
        val item = jo("qid" to Protocol.newUuid(), "kind" to "instruction", "instructionId" to built.id, "path" to "/api/agent/instructions", "body" to body,
            "created" to Protocol.iso(c.nowMs), "summary" to "${f.amount} ${f.currency} to ${f.recipient.agentName}", "rejected" to false, "error" to "")
        val q = queueList(); q.add(item); putQueue(q); persist()
        try {
            val res = c.signedCall("POST", "/api/agent/instructions", body, sg, agentId())
            putQueue(queueList().filter { it["qid"].str() != item["qid"].str() })
            val r = receipts(); val seq = res["receipt"]["seq"].long(); r[built.id] = seq; state["receipts"] = r
            persist(); online = true
            SendOutcome.Receipt(built.id, built.code, seq)
        } catch (e: NetworkException) {
            online = false
            SendOutcome.Queued
        } catch (e: RelayException) {
            handleRelayError(e)
            putQueue(queueList().filter { it["qid"].str() != item["qid"].str() })
            val cc = codes(); cc.remove(built.id); state["codes"] = cc; persist()
            if (e.reasons.isNotEmpty()) SendOutcome.Rejected(e.reasons) else SendOutcome.Failed(e.message ?: "Relay error.")
        }
    }

    // ------------------------------------------------------------------ events: pay out, cancel
    private fun sendEventLocked(type: String, instructionId: String, codeHash: String?, summary: String): String? {
        val c = client ?: return "Not connected."
        val sg = signer ?: return "Device key missing."
        val (ev, sig) = Protocol.buildEvent(type, instructionId, agentId(), c.nowMs, sg, codeHash)
        val body = jo("event" to ev, "sig" to sig)
        return try {
            c.signedCall("POST", "/api/agent/events", body, sg, agentId())
            online = true
            null
        } catch (e: NetworkException) {
            online = false
            val q = queueList()
            q.add(jo("qid" to Protocol.newUuid(), "kind" to "event", "type" to type, "instructionId" to instructionId, "path" to "/api/agent/events", "body" to body,
                "created" to Protocol.iso(c.nowMs), "summary" to summary, "rejected" to false, "error" to ""))
            putQueue(q)
            "QUEUED"
        } catch (e: RelayException) {
            handleRelayError(e)
            if (e.reasons.isNotEmpty()) e.reasons.joinToString(" ") else (e.message ?: "Relay error.")
        }
    }

    /** Returns null on success, or a message for the agent. */
    suspend fun payout(item: JObj, codeInput: String): String? = lock.withLock {
        val ins = item["instruction"]
        val id = ins["id"].str()
        if (item["frozen"].bool()) return@withLock "This instruction is frozen. Do not pay out."
        if (!Protocol.verifyIncoming(item)) return@withLock "The signature check failed. Do not pay out."
        if (localStatus[id] == "PAID_OUT" || item["status"].str() == "PAID_OUT") return@withLock "Already paid out."
        if (Protocol.codeHash(id, codeInput) != ins["codeHash"].str()) { say("Wrong code"); return@withLock "The code does not match this instruction." }
        if (windowExceeded()) return@withLock "The offline window is used up. Connect to the internet first."
        val amountMinor = ((ins["payout"]["value"].str().toDoubleOrNull() ?: 0.0) * 100).toLong()
        val res = sendEventLocked("PAID_OUT", id, ins["codeHash"].str(), "Payout ${ins["payout"]["value"].str()} ${ins["payout"]["currency"].str()}")
        when (res) {
            null -> { setLocalStatus(id, "PAID_OUT"); persist(); null }
            "QUEUED" -> {
                val allowed = profile["limits"]["offlinePayout"].bool()
                val usd = if (ins["payout"]["currency"].str() == "USD") amountMinor else Long.MAX_VALUE
                if (!allowed || usd > limit("offlineLimit")) {
                    // undo the queueing: offline payouts are off or above the limit
                    putQueue(queueList().filter { !(it["kind"].str() == "event" && it["instructionId"].str() == id && it["type"].str() == "PAID_OUT") })
                    persist()
                    if (!allowed) "No connection. Offline payouts are not enabled for you." else "No connection. This amount is above your offline payout limit."
                } else { setLocalStatus(id, "PAID_OUT"); persist(); "Saved offline. The payout is sent to the relay when you are online again." }
            }
            else -> res
        }
    }

    suspend fun cancel(item: JObj): String? = lock.withLock {
        val id = item["id"].str()
        val res = sendEventLocked("CANCEL", id, null, "Cancel ${item["instruction"]["amount"]["value"].str()}")
        when (res) {
            null -> { setLocalStatus(id, "CANCELLED"); persist(); null }
            "QUEUED" -> { setLocalStatus(id, "CANCELLED"); persist(); "Saved offline. The cancellation is sent when you are online again." }
            else -> res
        }
    }

    fun decrypt(item: JObj): JObj? = runCatching {
        Crypto.decryptPackage(item["package"], state["encKid"].str(), Crypto.b64d(state["encPriv"].str()))
    }.getOrNull()

    fun toggleSpeak(on: Boolean) {
        speak = on; state["speak"] = on
        viewModelScope.launch(Dispatchers.IO) { lock.withLock { persist() } }
        if (on) speaker.say("Voice prompts on")
    }

    fun refreshAfterAction() { syncNow() }

    override fun onCleared() { speaker.shutdown(); super.onCleared() }
}
