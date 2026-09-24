package com.nexonai.unpruuf.domain.network

import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.InetSocketAddress
import java.net.Proxy
import java.net.Socket
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Minimal HTTP/1.1 client for the optional relay (see server/README.md), reached only through
 * Tor — same [Proxy.Type.SOCKS] + unresolved-address pattern [P2PNetworkManager.sendViaTor]
 * already uses, so the relay's .onion hostname is never resolved locally. Hand-rolled instead
 * of adding OkHttp: the protocol is two tiny JSON endpoints and the rest of this app already
 * talks raw sockets for the same reason.
 */
@Singleton
class RelayClient @Inject constructor(
    private val torManager: TorManager
) {
    companion object {
        // Virtual port the relay's Tor hidden service listens on (see server/tor/torrc) —
        // unrelated to P2PNetworkManager.ONION_PORT, a different service entirely.
        private const val RELAY_PORT = 80
        private const val CONNECT_TIMEOUT_MS = 40_000
        private const val SOCKET_TIMEOUT_MS = 40_000
        // fetchMany's long-poll can hold the connection open on the relay's side for up to its
        // requested waitMs before answering — this margin is added on top so the socket's own
        // read timeout never fires first and mistakes an honest, still-waiting relay for a hang.
        private const val FETCH_MANY_TIMEOUT_MARGIN_MS = 15_000
        // A GET /v1/fetch response holds every queued blob for a tag as one JSON array. Chunked
        // file/photo transfers are relay-eligible (see P2PNetworkManager.enqueueRatchetMessage),
        // so this has to cover the worst case: a full 5 MB file (ChatViewModel.MAX_FILE_BYTES),
        // split at RatchetFrame.CIPHERTEXT_CHUNK_SIZE into ~1311 chunks, each up to 4096 raw
        // bytes base64-encoded (~5464 chars) plus JSON quoting/commas — ~7.2 MB of body. 12 MB
        // leaves real headroom without being large enough to be its own problem on a phone.
        private const val MAX_RESPONSE_BYTES = 12 * 1024 * 1024
    }

    /**
     * Pushes one already-encrypted, padded outer packet to [relayOnion] under [wireTag].
     * [wireTag] and the base64 of [padded] are both drawn from base64's `[A-Za-z0-9+/=]`
     * alphabet (see [IdentityManager.myWireId]/`android.util.Base64`) — none of those
     * characters need JSON string-escaping, so this hand-rolled body is safe to build by
     * direct interpolation. No kotlinx.serialization codegen here: the `kotlin("plugin.
     * serialization")` compiler plugin isn't applied to this module (see QrPairViewModel's
     * own hand-rolled JSON for the existing precedent) — a class annotated `@Serializable`
     * without it fails to compile.
     */
    fun push(relayOnion: String, authToken: String, wireTag: String, padded: ByteArray): Boolean {
        val blob = android.util.Base64.encodeToString(padded, android.util.Base64.NO_WRAP)
        val body = """{"tag":"$wireTag","blob":"$blob"}"""
        val response = runCatching { request(relayOnion, authToken, "POST", "/v1/relay", body) }.getOrNull()
        return response != null && response.status in 200..299
    }

    /** Pulls and returns every packet currently queued for [wireTag] on [relayOnion]. */
    fun fetch(relayOnion: String, authToken: String, wireTag: String): List<ByteArray> {
        // wireTag is standard-alphabet base64 (see IdentityManager.hmac's Base64.NO_WRAP, not
        // URL-safe) and can contain '+'. Left un-encoded in a query string, a literal '+' is
        // decoded back as a SPACE by every standard query-parameter parser (NanoHTTPD's
        // java.net.URLDecoder included, same for the Node relay's `qs`) — application/
        // x-www-form-urlencoded convention, not a bug on the relay's side. That corrupted tag
        // then fails TAG_REGEX and 400s, so this silently returned an empty list for roughly
        // half of all wire tags (any containing '+') even though push() — which sends the tag
        // in the JSON body, never the URL — always stored it correctly. Percent-encoding here
        // is the fix; a plain push()'d tag with no '+' round-trips identically either way.
        val encodedTag = java.net.URLEncoder.encode(wireTag, "UTF-8")
        val response = runCatching { request(relayOnion, authToken, "GET", "/v1/fetch?tag=$encodedTag", null) }
            .getOrNull() ?: return emptyList()
        if (response.status !in 200..299) return emptyList()
        return parseBlobsArray(response.body).mapNotNull {
            runCatching { android.util.Base64.decode(it, android.util.Base64.NO_WRAP) }.getOrNull()
        }
    }

    /**
     * Batched + optionally long-polling sibling of [fetch] — checks every tag in [tags] in one
     * round-trip instead of one request per tag (see server/src/routes/relay.ts's POST
     * /v1/fetchMany), and, when [waitMs] > 0, lets the relay hold the connection open for up to
     * that long before answering if nothing was queued for any of them yet. Always returns an
     * entry for every tag in [tags], with an empty list for ones nothing arrived on.
     */
    fun fetchMany(relayOnion: String, authToken: String, tags: List<String>, waitMs: Long = 0): Map<String, List<ByteArray>> {
        if (tags.isEmpty()) return emptyMap()
        // Same alphabet as push()'s wireTag — base64 standard alphabet, never needs JSON
        // string-escaping.
        val tagsJson = tags.joinToString(",") { "\"$it\"" }
        val body = if (waitMs > 0) """{"tags":[$tagsJson],"waitMs":$waitMs}""" else """{"tags":[$tagsJson]}"""
        val socketTimeoutMs = (waitMs + FETCH_MANY_TIMEOUT_MARGIN_MS).coerceAtLeast(SOCKET_TIMEOUT_MS.toLong()).toInt()
        val response = runCatching {
            request(relayOnion, authToken, "POST", "/v1/fetchMany", body, socketTimeoutMs)
        }.getOrNull() ?: return emptyMap()
        if (response.status !in 200..299) return emptyMap()
        return parseBlobsMapBody(response.body).mapValues { (_, blobsB64) ->
            blobsB64.mapNotNull { runCatching { android.util.Base64.decode(it, android.util.Base64.NO_WRAP) }.getOrNull() }
        }
    }

    // Pulls the base64 strings out of a {"blobs":["...","..."]} body. Every blob is pure base64
    // (no quotes/backslashes/brackets), so this doesn't need a real JSON parser.
    private fun parseBlobsArray(body: String): List<String> {
        val match = Regex(""""blobs"\s*:\s*\[(.*?)]""", RegexOption.DOT_MATCHES_ALL).find(body) ?: return emptyList()
        val inner = match.groupValues[1].trim()
        if (inner.isEmpty()) return emptyList()
        return inner.split(",").map { it.trim().removeSurrounding("\"") }.filter { it.isNotEmpty() }
    }

    // Pulls {"blobs":{"<tag>":["...", ...], ...}} into a map. Tags are never regex-interpolated
    // here (a wire tag can contain '+', which would otherwise be misread as a regex quantifier),
    // so this matches each "<key>":[...] entry generically instead of searching per-tag.
    private fun parseBlobsMapBody(body: String): Map<String, List<String>> {
        val blobsKeyIdx = body.indexOf("\"blobs\"")
        if (blobsKeyIdx < 0) return emptyMap()
        val innerOpen = body.indexOf('{', blobsKeyIdx)
        if (innerOpen < 0) return emptyMap()
        val outerClose = body.lastIndexOf('}')
        val innerClose = if (outerClose > innerOpen) body.lastIndexOf('}', outerClose - 1) else -1
        if (innerClose < innerOpen) return emptyMap()
        val inner = body.substring(innerOpen + 1, innerClose)

        val result = LinkedHashMap<String, List<String>>()
        val entryRegex = Regex(""""([^"]*)"\s*:\s*\[([^\]]*)\]""")
        for (match in entryRegex.findAll(inner)) {
            val tag = match.groupValues[1]
            val arrayInner = match.groupValues[2].trim()
            result[tag] = if (arrayInner.isEmpty()) emptyList()
                else arrayInner.split(",").map { it.trim().removeSurrounding("\"") }.filter { it.isNotEmpty() }
        }
        return result
    }

    private data class HttpResponse(val status: Int, val body: String)

    private fun request(
        onion: String,
        authToken: String,
        method: String,
        path: String,
        body: String?,
        socketTimeoutMs: Int = SOCKET_TIMEOUT_MS
    ): HttpResponse {
        val proxy = Proxy(Proxy.Type.SOCKS, InetSocketAddress("127.0.0.1", torManager.socksPort))
        Socket(proxy).use { socket ->
            socket.soTimeout = socketTimeoutMs
            socket.connect(InetSocketAddress.createUnresolved(onion, RELAY_PORT), CONNECT_TIMEOUT_MS)

            val bodyBytes = body?.toByteArray(Charsets.UTF_8)
            val out = socket.getOutputStream()
            val head = StringBuilder()
                .append("$method $path HTTP/1.1\r\n")
                .append("Host: $onion\r\n")
                .append("Authorization: Bearer $authToken\r\n")
                .append("Connection: close\r\n")
            if (bodyBytes != null) {
                head.append("Content-Type: application/json\r\n")
                head.append("Content-Length: ${bodyBytes.size}\r\n")
            }
            head.append("\r\n")
            out.write(head.toString().toByteArray(Charsets.US_ASCII))
            if (bodyBytes != null) out.write(bodyBytes)
            out.flush()

            val input = socket.getInputStream()
            val statusLine = readLine(input) ?: return HttpResponse(0, "")
            val status = statusLine.split(" ").getOrNull(1)?.toIntOrNull() ?: 0

            var contentLength = -1
            while (true) {
                val line = readLine(input) ?: break
                if (line.isEmpty()) break
                val idx = line.indexOf(':')
                if (idx > 0 && line.substring(0, idx).equals("Content-Length", ignoreCase = true)) {
                    contentLength = line.substring(idx + 1).trim().toIntOrNull() ?: -1
                }
            }

            val n = contentLength.takeIf { it in 0..MAX_RESPONSE_BYTES } ?: 0
            val bodyOut = readNBytes(input, n)
            return HttpResponse(status, String(bodyOut, Charsets.UTF_8))
        }
    }

    // Reads one CRLF-terminated header line as raw bytes (not through a Reader, so it can never
    // buffer ahead past the header/body boundary — the body is read separately, byte-exact,
    // right after). Returns null only at EOF with nothing read.
    private fun readLine(input: InputStream): String? {
        val buf = ByteArrayOutputStream()
        while (true) {
            val b = input.read()
            if (b == -1) return if (buf.size() == 0) null else buf.toString("ISO-8859-1")
            if (b == '\n'.code) {
                val bytes = buf.toByteArray()
                val len = if (bytes.isNotEmpty() && bytes.last() == '\r'.code.toByte()) bytes.size - 1 else bytes.size
                return String(bytes, 0, len, Charsets.ISO_8859_1)
            }
            buf.write(b)
        }
    }

    private fun readNBytes(input: InputStream, n: Int): ByteArray {
        val out = ByteArray(n)
        var total = 0
        while (total < n) {
            val r = input.read(out, total, n - total)
            if (r < 0) break
            total += r
        }
        return if (total == n) out else out.copyOf(total)
    }
}
