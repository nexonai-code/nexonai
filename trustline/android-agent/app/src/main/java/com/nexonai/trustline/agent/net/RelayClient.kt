package com.nexonai.trustline.agent.net

import com.nexonai.trustline.agent.core.Crypto
import com.nexonai.trustline.agent.core.Json
import com.nexonai.trustline.agent.core.Protocol
import com.nexonai.trustline.agent.core.Signer
import com.nexonai.trustline.agent.core.get
import com.nexonai.trustline.agent.core.list
import com.nexonai.trustline.agent.core.str
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** The relay answered with an error. [reasons] lists the failed mandatory checks of a rejected instruction. */
class RelayException(val status: Int, val code: String, message: String, val reasons: List<String> = emptyList()) : Exception(message)

/** The relay could not be reached (no signal, DNS, timeout). */
class NetworkException(message: String, cause: Throwable? = null) : Exception(message, cause)

/** HTTP client for the TrustLine relay. Agent requests are signed with the device key (see docs/PROTOCOL.md). */
class RelayClient(baseUrl: String) {
    private val base = baseUrl.trim().trimEnd('/')

    /** relay time minus phone time, learned from the X-Server-Time header; keeps signatures valid on a wrong phone clock. */
    @Volatile var offsetMs: Long = 0

    val nowMs: Long get() = System.currentTimeMillis() + offsetMs

    fun publicGet(path: String): Any? = exec("GET", path, emptyMap(), null)
    fun publicPost(path: String, body: Any?): Any? = exec("POST", path, emptyMap(), Json.stringify(body))

    fun signedCall(method: String, path: String, body: Any?, signer: Signer, agentId: String): Any? {
        val raw = if (body == null) "" else Json.stringify(body)
        val ts = Protocol.iso(nowMs)
        val sig = signer.signRaw("$method\n$path\n$ts\n${Crypto.sha256Hex(raw)}".toByteArray(Charsets.UTF_8))
        val headers = mapOf("X-Agent" to agentId, "X-Key" to signer.signKid, "X-Ts" to ts, "X-Sig" to sig)
        return exec(method, path, headers, if (body == null) null else raw)
    }

    private fun exec(method: String, path: String, headers: Map<String, String>, rawBody: String?): Any? {
        val conn = try { URL(base + path).openConnection() as HttpURLConnection } catch (e: Exception) { throw NetworkException("Bad relay address", e) }
        try {
            conn.requestMethod = method
            conn.connectTimeout = 10_000
            conn.readTimeout = 20_000
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("Accept", "application/json")
            for ((k, v) in headers) conn.setRequestProperty(k, v)
            if (rawBody != null) {
                conn.doOutput = true
                conn.outputStream.use { it.write(rawBody.toByteArray(Charsets.UTF_8)) }
            }
            val code = conn.responseCode
            conn.getHeaderField("X-Server-Time")?.let { runCatching { offsetMs = Protocol.parseIso(it) - System.currentTimeMillis() } }
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            val json = if (text.isBlank()) null else runCatching { Json.parse(text) }.getOrNull()
            if (code !in 200..299) {
                val reasons = json["reasons"].list().map { it["text"].str() }
                throw RelayException(code, json["error"].str().ifEmpty { "http_$code" }, json["message"].str().ifEmpty { "Request failed ($code)" }, reasons)
            }
            return json
        } catch (e: IOException) {
            throw NetworkException(e.message ?: "No connection", e)
        } finally {
            conn.disconnect()
        }
    }
}
