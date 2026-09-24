package com.nexonai.unpruuf.relay.net

import android.util.Base64
import com.nexonai.unpruuf.relay.core.BlobStore
import com.nexonai.unpruuf.relay.core.RelayConstants
import com.nexonai.unpruuf.relay.core.RelayEventLog
import fi.iki.elonen.NanoHTTPD
import java.security.MessageDigest

/**
 * Serves the exact same wire contract as unpruuf/server/src/app.ts + routes/relay.ts +
 * middleware/auth.ts, so the main unpruuf app's RelayClient.kt — written against the Node
 * server — talks to this Android relay unchanged:
 *
 *   GET  /health              unauthenticated, `{"ok":true}`
 *   POST /v1/relay            `{"tag":"...","blob":"<base64>"}` → 201 `{"stored":true}`
 *   GET  /v1/fetch?tag=...    → 200 `{"blobs":["...", ...]}`, deletes them (delete-on-fetch)
 *   POST /v1/fetchMany        `{"tags":["...", ...],"waitMs":<optional>}` → 200
 *                             `{"blobs":{"<tag>":["...", ...], ...}}`, deletes them; blocks the
 *                             calling thread up to `waitMs` (capped) if nothing is queued yet
 *
 * Bound to 127.0.0.1 only by the caller (see RelayService) — reachable exclusively through the
 * Tor hidden service RelayTorManager publishes, never on the LAN, matching the Node server's
 * own `app.listen(PORT, "127.0.0.1", ...)`.
 */
class RelayHttpServer(
    port: Int,
    private val blobStore: BlobStore,
    private val getAuthToken: () -> String
) : NanoHTTPD("127.0.0.1", port) {

    override fun serve(session: IHTTPSession): Response {
        return runCatching { route(session) }.getOrElse {
            jsonResponse(HttpStatus(500, "Internal Server Error"), """{"error":"internal error"}""")
        }
    }

    private fun route(session: IHTTPSession): Response {
        if (session.method == Method.GET && session.uri == "/health") {
            return jsonResponse(Response.Status.OK, """{"ok":true}""")
        }
        if (!isAuthorized(session)) {
            return jsonResponse(Response.Status.UNAUTHORIZED, """{"error":"unauthorized"}""")
        }
        return when {
            session.method == Method.POST && session.uri == "/v1/relay" -> handleRelay(session)
            session.method == Method.GET && session.uri == "/v1/fetch" -> handleFetch(session)
            session.method == Method.POST && session.uri == "/v1/fetchMany" -> handleFetchMany(session)
            else -> jsonResponse(Response.Status.NOT_FOUND, """{"error":"not found"}""")
        }
    }

    private fun isAuthorized(session: IHTTPSession): Boolean {
        // NanoHTTPD lowercases header names internally, so "authorization" (not
        // "Authorization") is the correct lookup key here.
        val header = session.headers["authorization"] ?: return false
        return timingSafeEquals(header, "Bearer ${getAuthToken()}")
    }

    private fun handleRelay(session: IHTTPSession): Response {
        // Checked via the header BEFORE parseBody() reads/buffers anything — parseBody has no
        // size cap of its own, so an authenticated caller could otherwise send an oversized
        // body to pressure memory ahead of the MAX_BLOB_BYTES check further down ever running.
        val contentLength = session.headers["content-length"]?.toLongOrNull()
        if (contentLength == null || contentLength <= 0 || contentLength > RelayConstants.MAX_RELAY_REQUEST_BYTES) {
            return jsonResponse(
                HttpStatus(413, "Payload Too Large"),
                """{"error":"request body must be 1..${RelayConstants.MAX_RELAY_REQUEST_BYTES} bytes"}"""
            )
        }
        val files = HashMap<String, String>()
        // NanoHTTPD's documented idiom for reading a raw (non-multipart) request body: after
        // parseBody(files), the body text lands under the "postData" key.
        runCatching { session.parseBody(files) }
        val body = files["postData"].orEmpty()

        val tag = extractJsonString(body, "tag")
        if (tag == null || !RelayConstants.TAG_REGEX.matches(tag)) {
            return jsonResponse(Response.Status.BAD_REQUEST, """{"error":"invalid tag"}""")
        }
        val blob = extractJsonString(body, "blob")
        if (blob.isNullOrEmpty()) {
            return jsonResponse(Response.Status.BAD_REQUEST, """{"error":"invalid blob"}""")
        }
        val decodedLength = runCatching { Base64.decode(blob, Base64.DEFAULT).size }.getOrNull()
            ?: return jsonResponse(Response.Status.BAD_REQUEST, """{"error":"blob is not valid base64"}""")
        if (decodedLength == 0 || decodedLength > RelayConstants.MAX_BLOB_BYTES) {
            return jsonResponse(
                HttpStatus(413, "Payload Too Large"),
                """{"error":"blob must be 1..${RelayConstants.MAX_BLOB_BYTES} bytes"}"""
            )
        }
        if (!blobStore.put(tag, blob)) {
            RelayEventLog.logRejected(tag, "queue full")
            return jsonResponse(HttpStatus(429, "Too Many Requests"), """{"error":"tag queue full"}""")
        }
        RelayEventLog.logStored(tag, decodedLength)
        return jsonResponse(Response.Status.CREATED, """{"stored":true}""")
    }

    private fun handleFetch(session: IHTTPSession): Response {
        val tag = session.parameters["tag"]?.firstOrNull()
        if (tag == null || !RelayConstants.TAG_REGEX.matches(tag)) {
            return jsonResponse(Response.Status.BAD_REQUEST, """{"error":"invalid tag"}""")
        }
        val stored = blobStore.takeAll(tag)
        if (stored.isNotEmpty()) {
            val now = System.currentTimeMillis()
            val totalBytes = stored.sumOf { it.blob.length }
            val avgDwellMs = stored.sumOf { now - it.createdAt } / stored.size
            RelayEventLog.logFetched(tag, stored.size, totalBytes, avgDwellMs)
        }
        val json = "{\"blobs\":[" + stored.joinToString(",") { "\"${it.blob}\"" } + "]}"
        return jsonResponse(Response.Status.OK, json)
    }

    // Batched + optionally long-polling sibling of GET /v1/fetch — wire-identical to the Node
    // relay's POST /v1/fetchMany (see server/src/routes/relay.ts), so a client with several
    // contacts can check every expected tag in one round-trip instead of one per tag, and can
    // let this thread block for a while instead of blindly re-polling every few seconds.
    private fun handleFetchMany(session: IHTTPSession): Response {
        val contentLength = session.headers["content-length"]?.toLongOrNull()
        if (contentLength == null || contentLength <= 0 || contentLength > RelayConstants.MAX_FETCH_MANY_REQUEST_BYTES) {
            return jsonResponse(
                HttpStatus(413, "Payload Too Large"),
                """{"error":"request body must be 1..${RelayConstants.MAX_FETCH_MANY_REQUEST_BYTES} bytes"}"""
            )
        }
        val files = HashMap<String, String>()
        runCatching { session.parseBody(files) }
        val body = files["postData"].orEmpty()

        val tags = extractJsonStringArray(body, "tags")
        if (tags == null || tags.isEmpty() || tags.size > RelayConstants.MAX_FETCH_MANY_TAGS) {
            return jsonResponse(
                Response.Status.BAD_REQUEST,
                """{"error":"tags must be a non-empty array of at most ${RelayConstants.MAX_FETCH_MANY_TAGS}"}"""
            )
        }
        if (!tags.all { RelayConstants.TAG_REGEX.matches(it) }) {
            return jsonResponse(Response.Status.BAD_REQUEST, """{"error":"invalid tag in list"}""")
        }
        val requestedWait = extractJsonNumber(body, "waitMs") ?: 0L
        val wait = requestedWait.coerceIn(0L, RelayConstants.MAX_WAIT_MS)

        fun takeAllOnce(): Map<String, List<BlobStore.StoredBlob>> = tags.associateWith { blobStore.takeAll(it) }

        var taken = takeAllOnce()
        if (wait > 0 && taken.values.all { it.isEmpty() }) {
            blobStore.waitForAny(tags, wait)
            taken = takeAllOnce()
        }
        for ((tag, stored) in taken) {
            if (stored.isNotEmpty()) {
                val now = System.currentTimeMillis()
                val totalBytes = stored.sumOf { it.blob.length }
                val avgDwellMs = stored.sumOf { now - it.createdAt } / stored.size
                RelayEventLog.logFetched(tag, stored.size, totalBytes, avgDwellMs)
            }
        }
        val json = "{\"blobs\":{" + tags.joinToString(",") { tag ->
            val blobsJson = taken[tag].orEmpty().joinToString(",") { "\"${it.blob}\"" }
            "\"$tag\":[$blobsJson]"
        } + "}}"
        return jsonResponse(Response.Status.OK, json)
    }

    private fun jsonResponse(status: Response.IStatus, body: String): Response =
        newFixedLengthResponse(status, "application/json", body)

    // Every blob/tag this app ever handles is base64/wire-tag alphabet — no JSON-special
    // characters to escape — so a small regex extractor is enough, same reasoning
    // RelayClient.kt's own hand-rolled JSON parsing on the client side already uses.
    private fun extractJsonString(json: String, key: String): String? =
        Regex("\"$key\"\\s*:\\s*\"([^\"]*)\"").find(json)?.groupValues?.get(1)

    // Same reasoning as extractJsonString above: tags are wire-tag alphabet only, never
    // containing JSON-special characters, so this stays a small regex extractor rather than a
    // full JSON parser.
    private fun extractJsonStringArray(json: String, key: String): List<String>? {
        val inner = Regex("\"$key\"\\s*:\\s*\\[([^\\]]*)\\]").find(json)?.groupValues?.get(1) ?: return null
        if (inner.isBlank()) return emptyList()
        return Regex("\"([^\"]*)\"").findAll(inner).map { it.groupValues[1] }.toList()
    }

    private fun extractJsonNumber(json: String, key: String): Long? =
        Regex("\"$key\"\\s*:\\s*(-?\\d+)").find(json)?.groupValues?.get(1)?.toLongOrNull()

    // Same digest-then-constant-time-compare approach as middleware/auth.ts's
    // timingSafeEqual, so a mismatch always takes the same time regardless of where the
    // first differing byte is.
    private fun timingSafeEquals(a: String, b: String): Boolean {
        val da = MessageDigest.getInstance("SHA-256").digest(a.toByteArray(Charsets.UTF_8))
        val db = MessageDigest.getInstance("SHA-256").digest(b.toByteArray(Charsets.UTF_8))
        return MessageDigest.isEqual(da, db)
    }

    /** NanoHTTPD's built-in Status enum doesn't define every code this server needs (413, 429)
     *  across all library versions — Response.IStatus is the library's own documented
     *  extension point for exactly this. */
    private class HttpStatus(private val code: Int, private val desc: String) : Response.IStatus {
        override fun getRequestStatus(): Int = code
        override fun getDescription(): String = "$code $desc"
    }
}
