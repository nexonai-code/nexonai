package com.nexonai.unpruuf.relay.net

import com.nexonai.unpruuf.relay.core.BlobStore
import com.nexonai.unpruuf.relay.core.NodeMeshStore
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.net.HttpURLConnection
import java.net.ServerSocket
import java.net.URL
import java.util.Base64

/**
 * Drives the Android node over real HTTP with the exact request shapes the unpruuf app's
 * NodeMeshClient sends, and checks the same contract node-mesh-server's app.test.ts pins for the
 * PC node: owner-only deposit, read-only fetch, TTL may only shorten, relay routes don't exist.
 */
class NodeMeshHttpServerTest {

    private class MemoryStore : NodeMeshStore {
        private data class Row(val tag: String, val blob: String, val createdAt: Long, val expiresAt: Long)
        private val rows = mutableListOf<Row>()

        @Synchronized
        override fun putNodeMesh(tag: String, blobBase64: String, expiresAt: Long): Boolean {
            rows.add(Row(tag, blobBase64, System.currentTimeMillis(), expiresAt))
            return true
        }

        @Synchronized
        override fun readNodeMesh(tag: String, now: Long): List<BlobStore.StoredBlob> =
            rows.filter { it.tag == tag && it.expiresAt > now }.map { BlobStore.StoredBlob(it.blob, it.createdAt) }

        override fun waitForAny(tags: List<String>, timeoutMs: Long) {
            Thread.sleep(minOf(timeoutMs, 50))
        }
    }

    private val owner = "owner-secret-123"
    private val nodeTtlMs = 6 * 60 * 60 * 1000L
    private lateinit var server: NodeMeshHttpServer
    private var port = 0

    @Before
    fun start() {
        port = ServerSocket(0).use { it.localPort }
        server = NodeMeshHttpServer(port, MemoryStore(), { owner }, { nodeTtlMs })
        server.start()
    }

    @After
    fun stop() = server.stop()

    private data class Resp(val code: Int, val body: String)

    private fun call(method: String, path: String, body: String? = null, auth: String? = null): Resp {
        val conn = URL("http://127.0.0.1:$port$path").openConnection() as HttpURLConnection
        conn.requestMethod = method
        auth?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
        if (body != null) {
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.outputStream.use { it.write(body.toByteArray()) }
        }
        val code = conn.responseCode
        val stream = if (code >= 400) conn.errorStream else conn.inputStream
        return Resp(code, stream?.bufferedReader()?.readText().orEmpty())
    }

    private val blob = Base64.getEncoder().encodeToString(ByteArray(4096) { it.toByte() })
    private fun deposit(tag: String, ttl: Long? = null, auth: String? = owner): Resp {
        val body = if (ttl != null) """{"routing_tag":"$tag","ciphertext":"$blob","ttl":$ttl}"""
        else """{"routing_tag":"$tag","ciphertext":"$blob"}"""
        return call("PUT", "/deposit", body, auth)
    }

    @Test
    fun healthIsOpen() {
        assertEquals(Resp(200, """{"ok":true}"""), call("GET", "/health"))
    }

    @Test
    fun depositRequiresTheOwnerSecret() {
        assertEquals(401, deposit("tagA", auth = null).code)
        assertEquals(401, deposit("tagA", auth = "contact-guess").code)
        assertEquals(201, deposit("tagA").code)
    }

    @Test
    fun fetchIsReadOnlyAndNeedsNoAuth() {
        deposit("tagB")
        val first = call("GET", "/fetch?tag=tagB")
        val second = call("GET", "/fetch?tag=tagB")
        assertEquals(200, first.code)
        assertTrue(first.body.contains(blob))
        assertEquals("reading must never delete", first, second)
    }

    @Test
    fun fetchManyMatchesTheSharedWireShape() {
        deposit("tagC")
        val resp = call("POST", "/fetchMany", """{"tags":["tagC","tagEmpty"]}""")
        assertEquals(200, resp.code)
        assertEquals("""{"blobs":{"tagC":["$blob"],"tagEmpty":[]}}""", resp.body)
    }

    @Test
    fun ttlCanOnlyShortenNeverExtend() {
        assertEquals(201, deposit("tagShort", ttl = 1).code)
        Thread.sleep(20)
        assertFalse(call("GET", "/fetch?tag=tagShort").body.contains(blob))

        assertEquals(201, deposit("tagLong", ttl = nodeTtlMs * 100).code)
        assertTrue(call("GET", "/fetch?tag=tagLong").body.contains(blob))
    }

    @Test
    fun rejectsBadInput() {
        assertEquals(400, deposit("bad tag!").code)
        val tooBig = Base64.getEncoder().encodeToString(ByteArray(4097))
        assertEquals(413, call("PUT", "/deposit", """{"routing_tag":"t","ciphertext":"$tooBig"}""", owner).code)
        assertEquals(400, call("PUT", "/deposit", """{"routing_tag":"t","ciphertext":"%%%"}""", owner).code)
        assertEquals(400, call("GET", "/fetch?tag=").code)
    }

    @Test
    fun consumerRelayRoutesDoNotExistOnANode() {
        assertEquals(404, call("POST", "/v1/relay", """{"tag":"x","blob":"$blob"}""", owner).code)
        assertEquals(404, call("GET", "/v1/fetch?tag=x", auth = owner).code)
    }

    @Test
    fun readEndpointsAreRateLimited() {
        val codes = (1..60).map { call("GET", "/fetch?tag=flood").code }
        assertTrue("burst must pass", codes.take(25).all { it == 200 })
        assertTrue("sustained flood must hit 429", codes.contains(429))
        // Owner writes are never throttled by the read bucket.
        assertEquals(201, deposit("afterFlood").code)
    }
}
