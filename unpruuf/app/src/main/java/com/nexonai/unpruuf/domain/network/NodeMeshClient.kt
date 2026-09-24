package com.nexonai.unpruuf.domain.network

import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.InetSocketAddress
import java.net.Proxy
import java.net.Socket
import javax.inject.Inject
import javax.inject.Singleton

/**
 * HTTP client for the unpruuf Business Node-Mesh server (`node-mesh-server/`, see
 * NODE_MESH_SPEC.md), reached only through Tor — same [Proxy.Type.SOCKS] + unresolved-address
 * pattern [RelayClient] already uses for the consumer relay. Hand-rolled for the same reason
 * [RelayClient] is: two/three tiny JSON endpoints, no need for a full HTTP client dependency.
 *
 * Deliberately a SEPARATE class from [RelayClient] rather than a generalization of it: the two
 * products speak related but not identical contracts (owner-only auth here vs. a shared bearer
 * token there; no delete-on-fetch here at all), and NODE_MESH_SPEC.md §0 is explicit that the
 * Business line is a distinct product, not a variant of the consumer relay's.
 */
@Singleton
class NodeMeshClient @Inject constructor(
    private val torManager: TorManager
) {
    companion object {
        // Virtual port a Node-Mesh node's Tor hidden service listens on — same convention as
        // RelayClient.RELAY_PORT (see node-mesh-server's own eventual torrc, not yet built in
        // this phase — see node-mesh-server/README.md's status note).
        private const val NODE_PORT = 80
        private const val CONNECT_TIMEOUT_MS = 40_000
        private const val SOCKET_TIMEOUT_MS = 40_000
        // Mirrors RelayClient's own FETCH_MANY_TIMEOUT_MARGIN_MS — a long-poll fetchMany can
        // legitimately hold the connection open close to its requested waitMs.
        private const val FETCH_MANY_TIMEOUT_MARGIN_MS = 15_000
        // Same sizing rationale as RelayClient.MAX_RESPONSE_BYTES — worst case a full chunked
        // transfer's blobs come back in one fetch/fetchMany response.
        private const val MAX_RESPONSE_BYTES = 12 * 1024 * 1024
        // Deliberately shorter than SOCKET_TIMEOUT_MS — a heartbeat that takes as long as a
        // real request to fail defeats the point of pinging on a short, frequent interval (see
        // P2PNetworkManager.startTempNodeHeartbeat()).
        private const val HEALTH_CHECK_TIMEOUT_MS = 15_000
    }

    /**
     * Deposits one already-encrypted blob under [routingTag] on this device's OWN node at
     * [nodeAddress], authenticated with [ownerSecret] — never a value shared with a contact (see
     * NodeMeshManager's doc comment). [ttlMs], if given, may only ask for a SHORTER lifetime than
     * the node's own configured default; the server enforces the cap, this call just forwards
     * the request.
     */
    fun deposit(nodeAddress: String, ownerSecret: String, routingTag: String, ciphertext: ByteArray, ttlMs: Long? = null): Boolean {
        val blob = android.util.Base64.encodeToString(ciphertext, android.util.Base64.NO_WRAP)
        val body = if (ttlMs != null) {
            """{"routing_tag":"$routingTag","ciphertext":"$blob","ttl":$ttlMs}"""
        } else {
            """{"routing_tag":"$routingTag","ciphertext":"$blob"}"""
        }
        val response = runCatching {
            request(nodeAddress, "PUT", "/deposit", body, ownerSecret = ownerSecret)
        }.getOrNull()
        return response != null && response.status in 200..299
    }

    /** Pulls (without deleting — NODE_MESH_SPEC.md §4) every blob currently queued for
     *  [routingTag] on a CONTACT's node at [nodeAddress]. No auth: the tag itself is the
     *  credential (see node-mesh-server/README.md's API table). */
    fun fetch(nodeAddress: String, routingTag: String): List<ByteArray> {
        // Same '+' percent-encoding fix RelayClient.fetch already needed — routing tags are
        // standard-alphabet base64/HMAC output and can contain '+', which a raw query string
        // would otherwise silently decode back as a space server-side.
        val encodedTag = java.net.URLEncoder.encode(routingTag, "UTF-8")
        val response = runCatching { request(nodeAddress, "GET", "/fetch?tag=$encodedTag", null) }
            .getOrNull() ?: return emptyList()
        if (response.status !in 200..299) return emptyList()
        return parseBlobsArray(response.body).mapNotNull {
            runCatching { android.util.Base64.decode(it, android.util.Base64.NO_WRAP) }.getOrNull()
        }
    }

    /**
     * Batched + optionally long-polling sibling of [fetch] — identical wire contract to
     * [RelayClient.fetchMany] (see node-mesh-server/src/routes/node.ts's `/fetchMany`, built to
     * match on purpose). Checks every tag in [tags] on a CONTACT's node at [nodeAddress] in one
     * round-trip; with [waitMs] > 0, lets the node hold the connection open until any tag has a
     * new blob or the timeout elapses. No auth needed, same as [fetch].
     */
    fun fetchMany(nodeAddress: String, tags: List<String>, waitMs: Long = 0): Map<String, List<ByteArray>> {
        if (tags.isEmpty()) return emptyMap()
        val tagsJson = tags.joinToString(",") { "\"$it\"" }
        val body = if (waitMs > 0) """{"tags":[$tagsJson],"waitMs":$waitMs}""" else """{"tags":[$tagsJson]}"""
        val socketTimeoutMs = (waitMs + FETCH_MANY_TIMEOUT_MARGIN_MS).coerceAtLeast(SOCKET_TIMEOUT_MS.toLong()).toInt()
        val response = runCatching {
            request(nodeAddress, "POST", "/fetchMany", body, socketTimeoutMs = socketTimeoutMs)
        }.getOrNull() ?: return emptyMap()
        if (response.status !in 200..299) return emptyMap()
        return parseBlobsMapBody(response.body).mapValues { (_, blobsB64) ->
            blobsB64.mapNotNull { runCatching { android.util.Base64.decode(it, android.util.Base64.NO_WRAP) }.getOrNull() }
        }
    }

    /**
     * Temp Node liveness probe (NODE_MESH_SPEC.md §7 step 7's heartbeat) — hits the node's
     * unauthenticated `GET /health` (see node-mesh-server/src/app.ts). Deliberately its own tiny
     * method rather than reusing [fetch]/[fetchMany] with a throwaway tag: a health check isn't
     * about routing_tag data at all, and `/health` needs no tag gymnastics to express "is this
     * node up right now".
     */
    fun healthCheck(nodeAddress: String): Boolean {
        val response = runCatching {
            request(nodeAddress, "GET", "/health", null, socketTimeoutMs = HEALTH_CHECK_TIMEOUT_MS)
        }.getOrNull() ?: return false
        return response.status in 200..299
    }

    // Identical shape to RelayClient's own parseBlobsArray — every blob is pure base64, no
    // JSON-special characters, no real parser needed.
    private fun parseBlobsArray(body: String): List<String> {
        val match = Regex(""""blobs"\s*:\s*\[(.*?)]""", RegexOption.DOT_MATCHES_ALL).find(body) ?: return emptyList()
        val inner = match.groupValues[1].trim()
        if (inner.isEmpty()) return emptyList()
        return inner.split(",").map { it.trim().removeSurrounding("\"") }.filter { it.isNotEmpty() }
    }

    // Identical shape to RelayClient's own parseBlobsMapBody — see that class's doc comment for
    // why tags are never regex-interpolated (a tag containing '+' would otherwise be misread as
    // a regex quantifier).
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
        address: String,
        method: String,
        path: String,
        body: String?,
        ownerSecret: String? = null,
        socketTimeoutMs: Int = SOCKET_TIMEOUT_MS
    ): HttpResponse {
        val proxy = Proxy(Proxy.Type.SOCKS, InetSocketAddress("127.0.0.1", torManager.socksPort))
        Socket(proxy).use { socket ->
            socket.soTimeout = socketTimeoutMs
            socket.connect(InetSocketAddress.createUnresolved(address, NODE_PORT), CONNECT_TIMEOUT_MS)

            val bodyBytes = body?.toByteArray(Charsets.UTF_8)
            val out = socket.getOutputStream()
            val head = StringBuilder()
                .append("$method $path HTTP/1.1\r\n")
                .append("Host: $address\r\n")
            // Only /deposit needs this — /fetch and /fetchMany are unauthenticated by design
            // (NODE_MESH_SPEC.md §8), so callers simply pass no ownerSecret for those.
            if (ownerSecret != null) head.append("Authorization: Bearer $ownerSecret\r\n")
            head.append("Connection: close\r\n")
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

    // Identical byte-exact line reader to RelayClient's own — see that class's doc comment.
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
