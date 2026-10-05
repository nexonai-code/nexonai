package com.nexonai.trustline.agent.core

import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.UUID

/** Builders and checks for instructions, events, payout codes and incoming items (see docs/PROTOCOL.md). */
object Protocol {
    private const val ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
    private val ISO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC)

    fun iso(epochMs: Long): String = ISO.format(Instant.ofEpochMilli(epochMs))
    fun parseIso(s: String): Long = Instant.parse(s).toEpochMilli()
    fun newUuid(): String = UUID.randomUUID().toString()

    fun normalizeCode(c: String): String = c.uppercase().filter { it.isLetterOrDigit() }
    fun codeHash(instructionId: String, code: String): String = Crypto.sha256Hex(instructionId + ":" + normalizeCode(code))
    fun formatCode(c: String): String = normalizeCode(c).chunked(4).joinToString("-")
    fun generateCode(): String {
        val sb = StringBuilder()
        while (sb.length < 12) {
            val b = Crypto.randomBytes(1)[0].toInt() and 0xff
            if (b < 224) sb.append(ALPHABET[b % 32])
        }
        return sb.toString()
    }

    fun pkgHash(pkg: Any?): String = Crypto.sha256Hex(Json.canon(pkg))

    class NewInstruction(
        val recipient: Recipient, val amount: String, val currency: String, val purpose: String, val reference: String,
        val screeningRef: String, val originator: JObj, val beneficiary: JObj,
    )

    /** One reachable recipient agent from the relay directory. */
    class Recipient(
        val agentId: String, val agentName: String, val city: String, val country: String,
        val operatorId: String, val operatorName: String, val operatorEncPub: String, val operatorEncKid: String,
        val deviceEncPub: String, val deviceEncKid: String,
    ) {
        companion object {
            fun from(j: Any?) = Recipient(
                j["agent"]["id"].str(), j["agent"]["name"].str(), j["agent"]["city"].str(), j["agent"]["country"].str(),
                j["operator"]["id"].str(), j["operator"]["name"].str(), j["operator"]["encPub"].str(), j["operator"]["encKid"].str(),
                j["device"]["encPub"].str(), j["device"]["encKid"].str())
        }
    }

    class Built(val id: String, val code: String, val instruction: JObj, val sig: String, val pkg: JObj)

    fun buildInstruction(
        n: NewInstruction, signer: Signer, myAgentId: String, myCountry: String, myOperatorId: String,
        myOperatorEncPub: String, myOperatorEncKid: String, nowMs: Long,
    ): Built {
        val id = newUuid()
        val code = generateCode()
        val created = iso(nowMs)
        val payload = jo("instruction" to id, "originator" to n.originator, "beneficiary" to n.beneficiary)
        val pkg = Crypto.encryptPackage(payload, id, listOf(
            Crypto.Recipient(myOperatorEncKid, myOperatorEncPub),
            Crypto.Recipient(n.recipient.operatorEncKid, n.recipient.operatorEncPub),
            Crypto.Recipient(n.recipient.deviceEncKid, n.recipient.deviceEncPub)))
        val ins = jo(
            "v" to "1", "id" to id, "createdAt" to created, "expiresAt" to iso(nowMs + 7L * 24 * 3600 * 1000),
            "amount" to jo("value" to n.amount, "currency" to n.currency), "payout" to jo("value" to n.amount, "currency" to n.currency),
            "corridor" to jo("from" to myCountry, "to" to n.recipient.country), "reference" to n.reference, "purpose" to n.purpose,
            "codeHash" to codeHash(id, code), "pkgHash" to pkgHash(pkg),
            "screening" to jo("done" to true, "ref" to n.screeningRef, "at" to created),
            "sender" to jo("agent" to myAgentId, "operator" to myOperatorId),
            "recipient" to jo("agent" to n.recipient.agentId, "operator" to n.recipient.operatorId))
        return Built(id, code, ins, Crypto.signObject(signer, ins), pkg)
    }

    fun buildEvent(type: String, instructionId: String, agentId: String, nowMs: Long, signer: Signer, codeHash: String? = null): Pair<JObj, String> {
        val ev = jo("t" to type, "instruction" to instructionId, "agent" to agentId, "at" to iso(nowMs), "nonce" to newUuid())
        if (codeHash != null) ev["codeHash"] = codeHash
        return ev to Crypto.signObject(signer, ev)
    }

    /** Verifies the signature chain of an incoming item: operator key -> agent certificate -> instruction, plus the package fingerprint. */
    fun verifyIncoming(item: Any?): Boolean {
        val cert = item["senderCert"]
        if (cert !is Map<*, *>) return false
        val ins = item["instruction"]
        val opPub = item["senderOperator"]["signPub"].str()
        return Crypto.verifyObject(opPub, cert, item["senderCertSig"].str()) &&
            cert["agent"].str() == ins["sender"]["agent"].str() &&
            Crypto.verifyObject(cert["signPub"].str(), ins, item["sig"].str()) &&
            pkgHash(item["package"]) == ins["pkgHash"].str()
    }
}
