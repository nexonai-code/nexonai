package com.nexonai.unpruuf.domain.network

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.concurrent.Semaphore
import java.util.concurrent.atomic.AtomicLong
import javax.inject.Inject
import javax.inject.Singleton

/**
 * A Temp Node that runs on THIS phone, for one chat (Pro Groups). The same node contract a server
 * speaks (`node-mesh-server/src/routes/node.ts`, `relay-android`'s NodeMeshHttpServer), so the
 * contact's app cannot tell it from any other node:
 *
 *   GET  /health        `{"ok":true}`
 *   PUT  /deposit       OWNER ONLY (`Authorization: Bearer <secret>`) → 201
 *   GET  /fetch?tag=    read-only
 *   POST /fetchMany     read-only, `waitMs` long-poll, `since` cursor
 *   GET  /pool          OWNER ONLY
 *
 * What makes it a "Temp" Node: the address is a fresh onion service that exists only while it runs
 * (the key is never stored), the packets live only in memory, and [stop] removes address and packets.
 *
 * What it is NOT: a server. It is reachable only while this phone is awake and online; when the phone
 * is off, nothing waits for the contact. The app therefore starts it only on request, shows that it is
 * running (the Tor notification says so), and the existing heartbeat falls back to the normal servers
 * when it cannot be reached.
 *
 * Only one runs at a time. The HTTP server listens on 127.0.0.1 only; Tor maps the onion port to it.
 */

/** Creates and removes the onion address. Implemented over Tor's control connection (see [TorOnionHost]). */
interface OnionHost {
    /** A new onion service forwarding virtual port 80 to 127.0.0.1:[localPort]; its `….onion` address, or null. */
    suspend fun add(localPort: Int): String?
    fun remove(address: String)
    fun isUp(): Boolean
}

class TorOnionHost(private val tor: TorManager) : OnionHost {
    override suspend fun add(localPort: Int): String? = tor.addEphemeralOnion(80, localPort)
    override fun remove(address: String) = tor.removeEphemeralOnion(address)
    override fun isUp(): Boolean = tor.isReady.value
}

@Singleton
class PhoneTempNode(
    private val host: OnionHost,
    private val now: () -> Long = System::currentTimeMillis,
) {
    @Inject constructor(tor: TorManager) : this(TorOnionHost(tor))

    sealed class State {
        object Off : State()
        object Starting : State()
        data class Running(val contactId: String, val address: String, val startedAt: Long) : State()
    }

    sealed class StartResult {
        data class Started(val address: String, val ownerSecret: String) : StartResult()
        data class Failed(val reason: Reason) : StartResult()
    }

    enum class Reason { TOR_NOT_READY, ALREADY_RUNNING, ONION_FAILED, SERVER_FAILED }

    companion object {
        const val MAX_BLOB_BYTES = 4096
        const val MAX_BLOBS_PER_TAG = 1500
        const val MAX_BLOBS_TOTAL = 3000
        const val MAX_TTL_MS = 24L * 60 * 60 * 1000
        const val MAX_WAIT_MS = 55_000L
        const val MAX_TAGS = 64
        private const val MAX_REQUEST_BODY = 8192
        private const val MAX_HEADER_BYTES = 16 * 1024
        private const val MAX_PARALLEL = 12
        private const val READ_TIMEOUT_MS = 70_000
        private val TAG_REGEX = Regex("^[A-Za-z0-9+/=_-]{1,64}$")
        private const val READ_BURST = 30.0
        private const val READ_REFILL_PER_SEC = 5.0
    }

    private val _state = MutableStateFlow<State>(State.Off)
    val state: StateFlow<State> = _state.asStateFlow()

    private class Blob(val seq: Long, val b64: String, val expiresAt: Long)

    private val lock = Object()
    private val blobs = HashMap<String, ArrayDeque<Blob>>()
    private val seq = AtomicLong(0)
    private var total = 0

    @Volatile private var server: ServerSocket? = null
    @Volatile private var ownerSecret: String = ""
    @Volatile private var address: String? = null
    private val permits = Semaphore(MAX_PARALLEL)
    private var tokens = READ_BURST
    private var lastRefill = System.nanoTime()

    fun isRunning(): Boolean = _state.value is State.Running

    /** True when [nodeAddress] is this phone's running Temp Node (so deposits can stay local). */
    fun isOwn(nodeAddress: String?): Boolean = nodeAddress != null && nodeAddress == address && isRunning()

    fun runningFor(): String? = (_state.value as? State.Running)?.contactId

    /** Local port of the HTTP server (for tests). */
    fun localPort(): Int = server?.localPort ?: -1

    suspend fun start(contactId: String): StartResult {
        synchronized(lock) {
            if (_state.value !is State.Off) return StartResult.Failed(Reason.ALREADY_RUNNING)
            _state.value = State.Starting
        }
        if (!host.isUp()) { _state.value = State.Off; return StartResult.Failed(Reason.TOR_NOT_READY) }
        val ss = try {
            ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
        } catch (e: Exception) {
            _state.value = State.Off; return StartResult.Failed(Reason.SERVER_FAILED)
        }
        val onion = try { host.add(ss.localPort) } catch (e: Exception) { null }
        if (onion == null) {
            runCatching { ss.close() }
            _state.value = State.Off
            return StartResult.Failed(Reason.ONION_FAILED)
        }
        val secretBytes = ByteArray(24).also { SecureRandom().nextBytes(it) }
        synchronized(lock) {
            blobs.clear(); total = 0
            ownerSecret = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(secretBytes)
            address = onion
            server = ss
            _state.value = State.Running(contactId, onion, now())
        }
        Thread({ acceptLoop(ss) }, "phone-temp-node").apply { isDaemon = true; start() }
        return StartResult.Started(onion, ownerSecret)
    }

    /** Removes the address, closes the server and forgets every packet. Safe to call when off. */
    fun stop() {
        val addr: String?
        val ss: ServerSocket?
        synchronized(lock) {
            addr = address; ss = server
            address = null; server = null; ownerSecret = ""
            blobs.clear(); total = 0
            _state.value = State.Off
            lock.notifyAll()
        }
        runCatching { ss?.close() }
        if (addr != null) runCatching { host.remove(addr) }
    }

    /** Wipes the waiting packets (not the node). Called when the app locks and wipes everything else. */
    fun wipePackets() = synchronized(lock) { blobs.clear(); total = 0; lock.notifyAll() }

    /** A deposit from this phone's own app (no HTTP, no Tor). */
    fun localDeposit(tag: String, ciphertext: ByteArray, ttlMs: Long?): Boolean {
        if (!isRunning() || !TAG_REGEX.matches(tag) || ciphertext.isEmpty() || ciphertext.size > MAX_BLOB_BYTES) return false
        val b64 = java.util.Base64.getEncoder().encodeToString(ciphertext)
        return put(tag, b64, ttlMs)
    }

    private fun put(tag: String, b64: String, requestedTtlMs: Long?): Boolean = synchronized(lock) {
        sweepLocked()
        val ttl = (requestedTtlMs ?: MAX_TTL_MS).coerceIn(1, MAX_TTL_MS)
        val q = blobs.getOrPut(tag) { ArrayDeque() }
        if (q.size >= MAX_BLOBS_PER_TAG || total >= MAX_BLOBS_TOTAL) return false
        q.addLast(Blob(seq.incrementAndGet(), b64, now() + ttl))
        total++
        lock.notifyAll()
        true
    }

    private fun sweepLocked() {
        val t = now()
        val it = blobs.entries.iterator()
        while (it.hasNext()) {
            val e = it.next()
            val before = e.value.size
            e.value.removeAll { b -> b.expiresAt <= t }
            total -= before - e.value.size
            if (e.value.isEmpty()) it.remove()
        }
    }

    private fun readLocked(tag: String, since: Long): List<Blob> {
        val t = now()
        return blobs[tag].orEmpty().filter { it.expiresAt > t && it.seq > since }
    }

    // ───────────── HTTP ─────────────

    private fun acceptLoop(ss: ServerSocket) {
        while (!ss.isClosed) {
            val s = try { ss.accept() } catch (e: Exception) { break }
            // stop() clears `server` before it closes the socket, but a connection that arrived in
            // that instant can still be accepted: drop it, never serve it.
            if (server !== ss) { runCatching { s.close() }; break }
            if (!permits.tryAcquire()) { runCatching { s.close() }; continue }
            Thread({ try { handle(s) } finally { runCatching { s.close() }; permits.release() } }, "phone-temp-node-conn")
                .apply { isDaemon = true; start() }
        }
    }

    private class Request(val method: String, val path: String, val query: String, val headers: Map<String, String>, val body: String?)

    private fun handle(s: Socket) {
        s.soTimeout = READ_TIMEOUT_MS
        val out = s.getOutputStream()
        val req = try { parse(s.getInputStream()) } catch (e: BadRequest) { respond(out, e.status, """{"error":"${e.message}"}"""); return } catch (e: Exception) { return }
        val (status, body) = try { route(req) } catch (e: Exception) { 500 to """{"error":"internal error"}""" }
        respond(out, status, body)
    }

    private class BadRequest(val status: Int, msg: String) : Exception(msg)

    private fun parse(input: InputStream): Request {
        val head = ByteArrayOutputStream()
        var state = 0
        while (true) {
            val b = input.read()
            if (b < 0) throw BadRequest(400, "bad request")
            head.write(b)
            if (head.size() > MAX_HEADER_BYTES) throw BadRequest(431, "headers too large")
            state = when {
                b == '\r'.code && (state == 0 || state == 2) -> state + 1
                b == '\n'.code && (state == 1 || state == 3) -> state + 1
                else -> 0
            }
            if (state == 4) break
        }
        val lines = head.toString(Charsets.ISO_8859_1.name()).split("\r\n").filter { it.isNotEmpty() }
        val first = lines.firstOrNull()?.split(" ") ?: throw BadRequest(400, "bad request")
        if (first.size < 2) throw BadRequest(400, "bad request")
        val headers = HashMap<String, String>()
        for (l in lines.drop(1)) { val i = l.indexOf(':'); if (i > 0) headers[l.substring(0, i).trim().lowercase()] = l.substring(i + 1).trim() }
        val target = first[1]
        val q = target.indexOf('?')
        val path = if (q >= 0) target.substring(0, q) else target
        val query = if (q >= 0) target.substring(q + 1) else ""
        var body: String? = null
        val len = headers["content-length"]?.toIntOrNull()
        if (len != null) {
            if (len < 0 || len > MAX_REQUEST_BODY) throw BadRequest(413, "request body too large")
            val buf = ByteArray(len)
            var n = 0
            while (n < len) { val r = input.read(buf, n, len - n); if (r < 0) throw BadRequest(400, "bad request"); n += r }
            body = String(buf, Charsets.UTF_8)
        }
        return Request(first[0], path, query, headers, body)
    }

    private fun route(r: Request): Pair<Int, String> = when {
        r.method == "GET" && r.path == "/health" -> 200 to """{"ok":true}"""
        r.method == "PUT" && r.path == "/deposit" -> deposit(r)
        r.method == "GET" && r.path == "/fetch" -> readLimited { fetch(r) }
        r.method == "POST" && r.path == "/fetchMany" -> readLimited { fetchMany(r) }
        r.method == "GET" && r.path == "/pool" -> pool(r)
        else -> 404 to """{"error":"not found"}"""
    }

    private fun authorized(r: Request): Boolean {
        val secret = ownerSecret
        if (secret.isEmpty()) return false
        val got = MessageDigest.getInstance("SHA-256").digest((r.headers["authorization"] ?: "").toByteArray())
        val want = MessageDigest.getInstance("SHA-256").digest("Bearer $secret".toByteArray())
        return MessageDigest.isEqual(got, want)
    }

    private fun readLimited(block: () -> Pair<Int, String>): Pair<Int, String> {
        val ok = synchronized(lock) {
            val n = System.nanoTime()
            tokens = minOf(READ_BURST, tokens + (n - lastRefill) / 1e9 * READ_REFILL_PER_SEC)
            lastRefill = n
            if (tokens < 1.0) false else { tokens -= 1.0; true }
        }
        return if (ok) block() else 429 to """{"error":"rate limit exceeded"}"""
    }

    private fun deposit(r: Request): Pair<Int, String> {
        if (!authorized(r)) return 401 to """{"error":"unauthorized"}"""
        val body = r.body ?: return 413 to """{"error":"request body must be 1..$MAX_REQUEST_BODY bytes"}"""
        val tag = jsonString(body, "routing_tag")
        if (tag == null || !TAG_REGEX.matches(tag)) return 400 to """{"error":"invalid routing_tag"}"""
        val ct = jsonString(body, "ciphertext")
        if (ct.isNullOrEmpty()) return 400 to """{"error":"invalid ciphertext"}"""
        val size = runCatching { java.util.Base64.getDecoder().decode(ct).size }.getOrNull()
            ?: return 400 to """{"error":"ciphertext is not valid base64"}"""
        if (size == 0 || size > MAX_BLOB_BYTES) return 413 to """{"error":"ciphertext must be 1..$MAX_BLOB_BYTES bytes"}"""
        val ttl = jsonNumber(body, "ttl")
        if (ttl != null && ttl <= 0) return 400 to """{"error":"invalid ttl"}"""
        // A deposit may only SHORTEN the retention, never extend it.
        return if (put(tag, ct, ttl)) 201 to """{"stored":true}""" else 429 to """{"error":"tag queue full"}"""
    }

    private fun pool(r: Request): Pair<Int, String> {
        if (!authorized(r)) return 401 to """{"error":"unauthorized"}"""
        val a = address
        return 200 to "{\"addresses\":[${if (a != null) "\"$a\"" else ""}]}"
    }

    private fun fetch(r: Request): Pair<Int, String> {
        val tag = r.query.split("&").map { it.split("=", limit = 2) }.firstOrNull { it[0] == "tag" }?.getOrNull(1)
            ?.let { java.net.URLDecoder.decode(it, "UTF-8") }
        if (tag == null || !TAG_REGEX.matches(tag)) return 400 to """{"error":"invalid tag"}"""
        val list = synchronized(lock) { sweepLocked(); readLocked(tag, 0) }
        return 200 to "{\"blobs\":[" + list.joinToString(",") { "\"${it.b64}\"" } + "]}"
    }

    private fun fetchMany(r: Request): Pair<Int, String> {
        val body = r.body ?: return 413 to """{"error":"request body must be 1..$MAX_REQUEST_BODY bytes"}"""
        val tags = jsonStringArray(body, "tags")
        if (tags == null || tags.isEmpty() || tags.size > MAX_TAGS) return 400 to """{"error":"tags must be a non-empty array of at most $MAX_TAGS"}"""
        if (!tags.all { TAG_REGEX.matches(it) }) return 400 to """{"error":"invalid tag in list"}"""
        val wait = (jsonNumber(body, "waitMs") ?: 0L).coerceIn(0L, MAX_WAIT_MS)
        val since = jsonNumber(body, "since") ?: 0L
        val deadline = System.nanoTime() + wait * 1_000_000
        var result: Map<String, List<Blob>>
        var cursor: Long
        synchronized(lock) {
            while (true) {
                sweepLocked()
                result = tags.associateWith { readLocked(it, since) }
                cursor = seq.get()
                val remainingMs = (deadline - System.nanoTime()) / 1_000_000
                if (result.values.any { it.isNotEmpty() } || remainingMs <= 0 || server == null) break
                try { lock.wait(remainingMs) } catch (e: InterruptedException) { break }
            }
        }
        val out = "{\"cursor\":$cursor,\"blobs\":{" + tags.joinToString(",") { t ->
            "\"$t\":[" + result[t].orEmpty().joinToString(",") { "\"${it.b64}\"" } + "]"
        } + "}}"
        return 200 to out
    }

    private fun respond(out: java.io.OutputStream, status: Int, body: String) {
        val bytes = body.toByteArray(Charsets.UTF_8)
        val reason = when (status) { 200 -> "OK"; 201 -> "Created"; 400 -> "Bad Request"; 401 -> "Unauthorized"; 404 -> "Not Found"; 413 -> "Payload Too Large"; 429 -> "Too Many Requests"; 431 -> "Request Header Fields Too Large"; else -> "Error" }
        val head = "HTTP/1.1 $status $reason\r\nContent-Type: application/json\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n"
        runCatching { out.write(head.toByteArray(Charsets.US_ASCII)); out.write(bytes); out.flush() }
    }

    // Tags and base64 never contain JSON-special characters: small extractors are enough (same approach as the other nodes).
    private fun jsonString(json: String, key: String): String? =
        Regex("\"$key\"\\s*:\\s*\"([^\"]*)\"").find(json)?.groupValues?.get(1)

    private fun jsonStringArray(json: String, key: String): List<String>? {
        val inner = Regex("\"$key\"\\s*:\\s*\\[([^\\]]*)\\]").find(json)?.groupValues?.get(1) ?: return null
        if (inner.isBlank()) return emptyList()
        return Regex("\"([^\"]*)\"").findAll(inner).map { it.groupValues[1] }.toList()
    }

    private fun jsonNumber(json: String, key: String): Long? =
        Regex("\"$key\"\\s*:\\s*(-?\\d+)").find(json)?.groupValues?.get(1)?.toLongOrNull()
}
