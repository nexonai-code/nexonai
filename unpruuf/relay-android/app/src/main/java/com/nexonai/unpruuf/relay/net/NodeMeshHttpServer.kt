package com.nexonai.unpruuf.relay.net

import com.nexonai.unpruuf.relay.core.BlobStore
import com.nexonai.unpruuf.relay.core.NodeMeshStore
import com.nexonai.unpruuf.relay.core.RelayConstants
import com.nexonai.unpruuf.relay.core.RelayEventLog
import fi.iki.elonen.NanoHTTPD
import java.io.ByteArrayOutputStream
import java.security.MessageDigest

/**
 * unpruuf Business Node-Mesh node on Android — byte-for-byte the same HTTP contract as
 * node-mesh-server/src/routes/node.ts, so the unpruuf app's NodeMeshClient can't tell an Android
 * node from a Windows/Linux one:
 *
 *   GET  /health        unauthenticated, `{"ok":true}`
 *   PUT  /deposit       OWNER ONLY (`Authorization: Bearer <ownerSecret>`),
 *                       `{"routing_tag":"...","ciphertext":"<base64>","ttl"?:<ms>}` → 201
 *   GET  /fetch?tag=    read-only, no auth (the routing tag is the credential) → `{"blobs":[...]}`
 *   POST /fetchMany     read-only, `{"tags":[...],"waitMs"?:<ms>}` → `{"blobs":{"<tag>":[...]}}`
 *   GET  /pool          OWNER ONLY → `{"addresses":["<this node's onion>"]}` (one node per tablet)
 *
 * Nothing ever deletes on read; only the TTL sweep (RelayService) removes rows. Always bound to
 * 127.0.0.1 — Node-Mesh is onion-only, there is no LAN mode for it. No CORS headers either: no
 * browser client exists for this product.
 */
class NodeMeshHttpServer(
    port: Int,
    private val blobStore: NodeMeshStore,
    private val getOwnerSecret: () -> String,
    private val getTtlMs: () -> Long,
    private val getOnionAddress: () -> String? = { null }
) : NanoHTTPD("127.0.0.1", port) {

    private val readLimit = TokenBucket(RelayConstants.NODE_MESH_READ_BURST, RelayConstants.NODE_MESH_READ_REFILL_PER_SEC)

    override fun serve(session: IHTTPSession): Response {
        val response = runCatching { route(session) }
            .getOrElse { json(HttpStatus(500, "Internal Server Error"), """{"error":"internal error"}""") }
        // One request per connection. Error paths (401/413/…) answer before reading the body;
        // on a kept-alive socket NanoHTTPD would then parse those leftover body bytes as the
        // next request and hand a keep-alive client a stale 400 (reproduced in
        // NodeMeshHttpServerTest). Every real client arrives through Tor with Connection: close
        // anyway, so closing costs nothing.
        response.closeConnection(true)
        return response
    }

    private fun route(session: IHTTPSession): Response {
        val uri = session.uri
        return when {
            session.method == Method.GET && uri == "/health" -> json(Response.Status.OK, """{"ok":true}""")
            session.method == Method.PUT && uri == "/deposit" -> handleDeposit(session)
            session.method == Method.GET && uri == "/fetch" -> rateLimited { handleFetch(session) }
            session.method == Method.POST && uri == "/fetchMany" -> rateLimited { handleFetchMany(session) }
            session.method == Method.GET && uri == "/pool" -> handlePool(session)
            else -> json(Response.Status.NOT_FOUND, """{"error":"not found"}""")
        }
    }

    private fun rateLimited(block: () -> Response): Response =
        if (readLimit.tryTake()) block() else json(HttpStatus(429, "Too Many Requests"), """{"error":"rate limit exceeded"}""")

    private fun handleDeposit(session: IHTTPSession): Response {
        // NanoHTTPD lowercases header names.
        val auth = session.headers["authorization"] ?: ""
        if (!timingSafeEquals(auth, "Bearer ${getOwnerSecret()}")) {
            return json(Response.Status.UNAUTHORIZED, """{"error":"unauthorized"}""")
        }
        val body = readBody(session, RelayConstants.MAX_RELAY_REQUEST_BYTES)
            ?: return json(HttpStatus(413, "Payload Too Large"), """{"error":"request body must be 1..${RelayConstants.MAX_RELAY_REQUEST_BYTES} bytes"}""")

        val tag = jsonString(body, "routing_tag")
        if (tag == null || !RelayConstants.TAG_REGEX.matches(tag)) {
            return json(Response.Status.BAD_REQUEST, """{"error":"invalid routing_tag"}""")
        }
        val ciphertext = jsonString(body, "ciphertext")
        if (ciphertext.isNullOrEmpty()) {
            return json(Response.Status.BAD_REQUEST, """{"error":"invalid ciphertext"}""")
        }
        // java.util.Base64 (API 26+, = minSdk) rather than android.util.Base64, so the JVM
        // contract test runs this exact code path.
        val decodedLength = runCatching { java.util.Base64.getDecoder().decode(ciphertext).size }.getOrNull()
            ?: return json(Response.Status.BAD_REQUEST, """{"error":"ciphertext is not valid base64"}""")
        if (decodedLength == 0 || decodedLength > RelayConstants.MAX_BLOB_BYTES) {
            return json(HttpStatus(413, "Payload Too Large"), """{"error":"ciphertext must be 1..${RelayConstants.MAX_BLOB_BYTES} bytes"}""")
        }
        val nodeTtlMs = getTtlMs()
        val requestedTtl = jsonNumber(body, "ttl")
        if (requestedTtl != null && requestedTtl <= 0) {
            return json(Response.Status.BAD_REQUEST, """{"error":"invalid ttl"}""")
        }
        // A deposit may only SHORTEN the node's retention, never extend it — same as the PC node.
        val ttlMs = requestedTtl?.coerceAtMost(nodeTtlMs) ?: nodeTtlMs
        if (!blobStore.putNodeMesh(tag, ciphertext, System.currentTimeMillis() + ttlMs)) {
            RelayEventLog.logRejected(tag, "queue full")
            return json(HttpStatus(429, "Too Many Requests"), """{"error":"tag queue full"}""")
        }
        RelayEventLog.logStored(tag, decodedLength)
        return json(Response.Status.CREATED, """{"stored":true}""")
    }

    private fun handlePool(session: IHTTPSession): Response {
        val auth = session.headers["authorization"] ?: ""
        if (!timingSafeEquals(auth, "Bearer ${getOwnerSecret()}")) {
            return json(Response.Status.UNAUTHORIZED, """{"error":"unauthorized"}""")
        }
        val list = getOnionAddress()?.let { "\"$it\"" } ?: ""
        return json(Response.Status.OK, "{\"addresses\":[$list]}")
    }

    private fun handleFetch(session: IHTTPSession): Response {
        val tag = session.parameters["tag"]?.firstOrNull()
        if (tag == null || !RelayConstants.TAG_REGEX.matches(tag)) {
            return json(Response.Status.BAD_REQUEST, """{"error":"invalid tag"}""")
        }
        val blobs = blobStore.readNodeMesh(tag)
        return json(Response.Status.OK, "{\"blobs\":[" + blobs.joinToString(",") { "\"${it.blob}\"" } + "]}")
    }

    private fun handleFetchMany(session: IHTTPSession): Response {
        val body = readBody(session, RelayConstants.MAX_FETCH_MANY_REQUEST_BYTES)
            ?: return json(HttpStatus(413, "Payload Too Large"), """{"error":"request body must be 1..${RelayConstants.MAX_FETCH_MANY_REQUEST_BYTES} bytes"}""")
        val tags = jsonStringArray(body, "tags")
        if (tags == null || tags.isEmpty() || tags.size > RelayConstants.MAX_FETCH_MANY_TAGS) {
            return json(Response.Status.BAD_REQUEST, """{"error":"tags must be a non-empty array of at most ${RelayConstants.MAX_FETCH_MANY_TAGS}"}""")
        }
        if (!tags.all { RelayConstants.TAG_REGEX.matches(it) }) {
            return json(Response.Status.BAD_REQUEST, """{"error":"invalid tag in list"}""")
        }
        val wait = (jsonNumber(body, "waitMs") ?: 0L).coerceIn(0L, RelayConstants.MAX_WAIT_MS)

        fun readAll(): Map<String, List<BlobStore.StoredBlob>> = tags.associateWith { blobStore.readNodeMesh(it) }

        var result = readAll()
        if (wait > 0 && result.values.all { it.isEmpty() }) {
            blobStore.waitForAny(tags, wait)
            result = readAll()
        }
        val out = "{\"blobs\":{" + tags.joinToString(",") { tag ->
            "\"$tag\":[" + result[tag].orEmpty().joinToString(",") { "\"${it.blob}\"" } + "]"
        } + "}}"
        return json(Response.Status.OK, out)
    }

    /** Reads exactly Content-Length bytes straight from the socket — never through
     *  parseBody(), which spools PUT bodies into a temp file on disk. Null if missing/too big. */
    private fun readBody(session: IHTTPSession, maxBytes: Long): String? {
        val length = session.headers["content-length"]?.toLongOrNull() ?: return null
        if (length <= 0 || length > maxBytes) return null
        val input = session.inputStream
        val out = ByteArrayOutputStream(length.toInt())
        val buf = ByteArray(4096)
        var remaining = length.toInt()
        while (remaining > 0) {
            val n = input.read(buf, 0, minOf(buf.size, remaining))
            if (n < 0) return null
            out.write(buf, 0, n)
            remaining -= n
        }
        return out.toString(Charsets.UTF_8.name())
    }

    private fun json(status: Response.IStatus, body: String): Response =
        newFixedLengthResponse(status, "application/json", body)

    // Tags/base64 never contain JSON-special characters — small regex extractors are enough,
    // same approach as RelayHttpServer and the app's own NodeMeshClient.
    private fun jsonString(json: String, key: String): String? =
        Regex("\"$key\"\\s*:\\s*\"([^\"]*)\"").find(json)?.groupValues?.get(1)

    private fun jsonStringArray(json: String, key: String): List<String>? {
        val inner = Regex("\"$key\"\\s*:\\s*\\[([^\\]]*)\\]").find(json)?.groupValues?.get(1) ?: return null
        if (inner.isBlank()) return emptyList()
        return Regex("\"([^\"]*)\"").findAll(inner).map { it.groupValues[1] }.toList()
    }

    private fun jsonNumber(json: String, key: String): Long? =
        Regex("\"$key\"\\s*:\\s*(-?\\d+)").find(json)?.groupValues?.get(1)?.toLongOrNull()

    private fun timingSafeEquals(a: String, b: String): Boolean {
        val da = MessageDigest.getInstance("SHA-256").digest(a.toByteArray(Charsets.UTF_8))
        val db = MessageDigest.getInstance("SHA-256").digest(b.toByteArray(Charsets.UTF_8))
        return MessageDigest.isEqual(da, db)
    }

    private class HttpStatus(private val code: Int, private val desc: String) : Response.IStatus {
        override fun getRequestStatus(): Int = code
        override fun getDescription(): String = "$code $desc"
    }

    /** Global token bucket — every onion request arrives from local Tor, there is no client IP
     *  to key on. Same model as node-mesh-server's middleware/rateLimit.ts. */
    private class TokenBucket(private val capacity: Double, private val refillPerSecond: Double) {
        private var tokens = capacity
        private var lastRefill = System.nanoTime()

        @Synchronized
        fun tryTake(): Boolean {
            val now = System.nanoTime()
            tokens = minOf(capacity, tokens + (now - lastRefill) / 1e9 * refillPerSecond)
            lastRefill = now
            if (tokens < 1.0) return false
            tokens -= 1.0
            return true
        }
    }
}
