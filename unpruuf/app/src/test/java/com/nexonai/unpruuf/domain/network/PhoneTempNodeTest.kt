package com.nexonai.unpruuf.domain.network

import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import java.net.HttpURLConnection
import java.net.URL
import java.util.Base64
import kotlin.concurrent.thread

private class FakeOnionHost(var up: Boolean = true, var fail: Boolean = false) : OnionHost {
    var added: String? = null
    var removed: String? = null
    var forwardedPort = -1
    override suspend fun add(localPort: Int): String? {
        if (fail) return null
        forwardedPort = localPort
        added = "a".repeat(56) + ".onion"
        return added
    }
    override fun remove(address: String) { removed = address }
    override fun isUp() = up
}

class PhoneTempNodeTest {
    private var clock = 1_000_000L
    private val host = FakeOnionHost()
    private val node = PhoneTempNode(host) { clock }

    @After fun tearDown() { node.stop() }

    private fun started(): PhoneTempNode.StartResult.Started =
        runBlocking { node.start("contact-1") } as PhoneTempNode.StartResult.Started

    private class Resp(val status: Int, val body: String)

    private fun call(method: String, path: String, body: String? = null, auth: String? = null, port: Int = node.localPort()): Resp {
        val c = URL("http://127.0.0.1:$port$path").openConnection() as HttpURLConnection
        c.requestMethod = method
        c.connectTimeout = 3000; c.readTimeout = 8000
        if (auth != null) c.setRequestProperty("Authorization", auth)
        if (body != null) { c.doOutput = true; c.setRequestProperty("Content-Type", "application/json"); c.outputStream.use { it.write(body.toByteArray()) } }
        val code = c.responseCode
        val text = (if (code >= 400) c.errorStream else c.inputStream)?.use { String(it.readBytes()) } ?: ""
        return Resp(code, text)
    }

    private fun b64(n: Int, fill: Int = 7) = Base64.getEncoder().encodeToString(ByteArray(n) { fill.toByte() })
    private fun depositBody(tag: String, ct: String = b64(100), ttl: Long? = null) =
        """{"routing_tag":"$tag","ciphertext":"$ct"${if (ttl != null) ""","ttl":$ttl""" else ""}}"""
    private fun deposit(st: PhoneTempNode.StartResult.Started, tag: String, ct: String = b64(100), ttl: Long? = null) =
        call("PUT", "/deposit", depositBody(tag, ct, ttl), "Bearer ${st.ownerSecret}")

    // ── start / stop ──
    @Test fun startNeedsTor() = runBlocking {
        host.up = false
        val r = node.start("c") as PhoneTempNode.StartResult.Failed
        assertEquals(PhoneTempNode.Reason.TOR_NOT_READY, r.reason)
        assertEquals(PhoneTempNode.State.Off, node.state.value)
        assertEquals(-1, node.localPort())
    }

    @Test fun failedOnionLeavesNothingRunning() = runBlocking {
        host.fail = true
        val r = node.start("c") as PhoneTempNode.StartResult.Failed
        assertEquals(PhoneTempNode.Reason.ONION_FAILED, r.reason)
        assertEquals(PhoneTempNode.State.Off, node.state.value)
        assertEquals(-1, node.localPort())
    }

    @Test fun startRunsAndStopRemovesEverything() {
        val st = started()
        assertTrue(st.address.endsWith(".onion"))
        assertTrue(st.ownerSecret.length >= 32)
        assertEquals(node.localPort(), host.forwardedPort)
        assertTrue(node.isOwn(st.address))
        assertFalse(node.isOwn("b".repeat(56) + ".onion"))
        assertEquals("contact-1", node.runningFor())
        assertEquals(201, deposit(st, "tag1").status)
        val port = node.localPort()
        node.stop()
        assertEquals(st.address, host.removed)
        assertEquals(PhoneTempNode.State.Off, node.state.value)
        assertFalse(node.isOwn(st.address))
        assertNull(node.runningFor())
        assertTrue("the server is closed", runCatching { call("GET", "/health", port = port) }.isFailure)
        node.stop() // twice is fine
    }

    @Test fun onlyOneAtATime() = runBlocking {
        started()
        val r = node.start("other") as PhoneTempNode.StartResult.Failed
        assertEquals(PhoneTempNode.Reason.ALREADY_RUNNING, r.reason)
        assertEquals("contact-1", node.runningFor())
    }

    @Test fun everyStartIsANewAddressSecretAndEmpty() = runBlocking {
        val a = started()
        node.localDeposit("t", ByteArray(10) { 1 }, null)
        node.stop()
        val b = started()
        assertNotEquals(a.ownerSecret, b.ownerSecret)
        assertEquals("nothing survives a restart of the node", """{"blobs":[]}""", call("GET", "/fetch?tag=t").body)
    }

    // ── contract ──
    @Test fun healthNeedsNoAuth() {
        started()
        assertEquals(200, call("GET", "/health").status)
        assertEquals("""{"ok":true}""", call("GET", "/health").body)
        assertEquals(404, call("GET", "/nope").status)
    }

    @Test fun depositIsOwnerOnly() {
        val st = started()
        assertEquals(401, call("PUT", "/deposit", depositBody("t")).status)
        assertEquals(401, call("PUT", "/deposit", depositBody("t"), "Bearer nope").status)
        assertEquals(401, call("PUT", "/deposit", depositBody("t"), st.ownerSecret).status)
        assertEquals(201, deposit(st, "t").status)
    }

    @Test fun depositValidation() {
        val st = started()
        assertEquals(400, deposit(st, "bad tag!").status)
        assertEquals(400, deposit(st, "t", "!!!not-base64!!!").status)
        assertEquals(400, deposit(st, "t", "").status)
        assertEquals(413, deposit(st, "t", b64(PhoneTempNode.MAX_BLOB_BYTES + 1)).status)
        assertEquals(201, deposit(st, "t", b64(PhoneTempNode.MAX_BLOB_BYTES)).status)
        assertEquals(400, deposit(st, "t", ttl = 0).status)
        assertEquals(413, call("PUT", "/deposit", "x".repeat(9000), "Bearer ${st.ownerSecret}").status)
    }

    @Test fun fetchReturnsBlobsAndNeverDeletes() {
        val st = started()
        deposit(st, "tagA", b64(50, 1)); deposit(st, "tagA", b64(60, 2)); deposit(st, "tagB", b64(70, 3))
        val first = call("GET", "/fetch?tag=tagA")
        assertEquals(200, first.status)
        assertEquals("""{"blobs":["${b64(50, 1)}","${b64(60, 2)}"]}""", first.body)
        assertEquals("reading does not delete", first.body, call("GET", "/fetch?tag=tagA").body)
        assertEquals("""{"blobs":[]}""", call("GET", "/fetch?tag=unknown").body)
        assertEquals(400, call("GET", "/fetch").status)
        assertEquals(400, call("GET", "/fetch?tag=%20bad").status)
    }

    @Test fun tagsWithPlusAndSlashWork() {
        val st = started()
        val tag = "ab+/cd=_-x"
        deposit(st, tag)
        assertTrue(call("GET", "/fetch?tag=" + java.net.URLEncoder.encode(tag, "UTF-8")).body.contains(b64(100)))
    }

    @Test fun fetchManyCursorOnlyGivesNewBlobs() {
        val st = started()
        deposit(st, "t1", b64(10, 1))
        val a = call("POST", "/fetchMany", """{"tags":["t1","t2"],"since":0}""")
        assertEquals(200, a.status)
        val cursor = NodeMeshClient.parseCursor(a.body)!!
        assertTrue(cursor >= 1)
        deposit(st, "t2", b64(10, 2)); deposit(st, "t1", b64(10, 3))
        val b = call("POST", "/fetchMany", """{"tags":["t1","t2"],"since":$cursor}""")
        assertFalse("old blob is not sent again", b.body.contains(b64(10, 1)))
        assertTrue(b.body.contains(b64(10, 2)) && b.body.contains(b64(10, 3)))
        assertTrue(NodeMeshClient.parseCursor(b.body)!! > cursor)
        val c = call("POST", "/fetchMany", """{"tags":["t1","t2"],"since":${NodeMeshClient.parseCursor(b.body)}}""")
        assertEquals(0, "\"${b64(10, 1)}\"".toRegex().findAll(c.body).count())
    }

    @Test fun theNodeMeshClientParsesOurAnswers() {
        // The client's parsers are private; run them on our real answers through reflection.
        val st = started()
        deposit(st, "ta", b64(33, 5)); deposit(st, "tb", b64(44, 6))
        val body = call("POST", "/fetchMany", """{"tags":["ta","tb","tc"],"since":0}""").body
        val unsafeClass = Class.forName("sun.misc.Unsafe")
        val unsafe = unsafeClass.getDeclaredField("theUnsafe").apply { isAccessible = true }.get(null)
        val client = unsafeClass.getMethod("allocateInstance", Class::class.java).invoke(unsafe, NodeMeshClient::class.java)
        val m = NodeMeshClient::class.java.getDeclaredMethod("parseBlobsMapBody", String::class.java).apply { isAccessible = true }
        @Suppress("UNCHECKED_CAST")
        val parsed = m.invoke(client, body) as Map<String, List<String>>
        assertEquals(listOf(b64(33, 5)), parsed["ta"])
        assertEquals(listOf(b64(44, 6)), parsed["tb"])
        assertEquals(emptyList<String>(), parsed["tc"])
        val one = call("GET", "/fetch?tag=ta").body
        val p1 = NodeMeshClient::class.java.getDeclaredMethod("parseBlobsArray", String::class.java).apply { isAccessible = true }
        @Suppress("UNCHECKED_CAST")
        assertEquals(listOf(b64(33, 5)), p1.invoke(client, one) as List<String>)
        assertEquals(listOf(node.state.value.let { (it as PhoneTempNode.State.Running).address }), NodeMeshClient.parsePoolAddresses(call("GET", "/pool", auth = "Bearer ${st.ownerSecret}").body))
    }

    @Test fun fetchManyValidation() {
        started()
        assertEquals(400, call("POST", "/fetchMany", """{"tags":[]}""").status)
        assertEquals(400, call("POST", "/fetchMany", """{"nothing":1}""").status)
        assertEquals(400, call("POST", "/fetchMany", """{"tags":["ok","bad tag"]}""").status)
        val many = (1..PhoneTempNode.MAX_TAGS + 1).joinToString(",") { "\"t$it\"" }
        assertEquals(400, call("POST", "/fetchMany", """{"tags":[$many]}""").status)
        assertEquals(413, call("POST", "/fetchMany", "x".repeat(9000)).status)
    }

    @Test fun longPollWakesWhenSomethingArrives() {
        val st = started()
        var answer: Resp? = null
        val t = thread { answer = call("POST", "/fetchMany", """{"tags":["wait1"],"waitMs":8000,"since":0}""") }
        Thread.sleep(400)
        val t0 = System.nanoTime()
        deposit(st, "wait1", b64(20, 9))
        t.join(6000)
        assertNotNull(answer)
        assertTrue(answer!!.body.contains(b64(20, 9)))
        assertTrue("answered long before the 8 s limit", (System.nanoTime() - t0) / 1_000_000 < 4000)
    }

    @Test fun longPollGivesUpEmptyAfterTheWait() {
        started()
        val t0 = System.nanoTime()
        val r = call("POST", "/fetchMany", """{"tags":["nothing"],"waitMs":700,"since":0}""")
        val ms = (System.nanoTime() - t0) / 1_000_000
        assertEquals(200, r.status)
        assertTrue(ms in 600..4000)
        assertFalse(r.body.contains("=="))
    }

    @Test fun longPollEndsWhenTheNodeStops() {
        started()
        var answer: Resp? = null
        val t = thread { answer = runCatching { call("POST", "/fetchMany", """{"tags":["x"],"waitMs":20000,"since":0}""") }.getOrNull() }
        Thread.sleep(300)
        node.stop()
        t.join(5000)
        assertFalse("the waiting request was released", t.isAlive)
    }

    @Test fun poolIsOwnerOnly() {
        val st = started()
        assertEquals(401, call("GET", "/pool").status)
        assertEquals(200, call("GET", "/pool", auth = "Bearer ${st.ownerSecret}").status)
    }

    // ── lifetime and limits ──
    @Test fun packetsExpireAndTtlCanOnlyShorten() {
        val st = started()
        deposit(st, "short", ttl = 60_000)
        deposit(st, "huge", ttl = 10L * 24 * 3600 * 1000) // asks for 10 days
        deposit(st, "default")
        assertTrue(call("GET", "/fetch?tag=short").body.contains(b64(100)))
        clock += 61_000
        assertEquals("""{"blobs":[]}""", call("GET", "/fetch?tag=short").body)
        clock += 23L * 3600 * 1000
        assertTrue(call("GET", "/fetch?tag=huge").body.contains(b64(100)))
        clock += 2L * 3600 * 1000 // 24 h + a bit after the deposit: nothing may be left
        assertEquals("""{"blobs":[]}""", call("GET", "/fetch?tag=huge").body)
        assertEquals("""{"blobs":[]}""", call("GET", "/fetch?tag=default").body)
    }

    @Test fun localDepositFollowsTheSameRules() {
        started()
        assertTrue(node.localDeposit("tagL", ByteArray(100) { 4 }, 30_000))
        assertFalse(node.localDeposit("bad tag", ByteArray(10), null))
        assertFalse(node.localDeposit("tagL", ByteArray(0), null))
        assertFalse(node.localDeposit("tagL", ByteArray(PhoneTempNode.MAX_BLOB_BYTES + 1), null))
        assertTrue(call("GET", "/fetch?tag=tagL").body.contains(Base64.getEncoder().encodeToString(ByteArray(100) { 4 })))
        clock += 31_000
        assertEquals("""{"blobs":[]}""", call("GET", "/fetch?tag=tagL").body)
    }

    @Test fun localDepositWhenNotRunningIsRefused() {
        assertFalse(node.localDeposit("t", ByteArray(10), null))
    }

    @Test fun perTagAndTotalLimits() {
        started()
        repeat(PhoneTempNode.MAX_BLOBS_PER_TAG) { assertTrue(node.localDeposit("full", ByteArray(8), null)) }
        assertFalse("a tag is capped", node.localDeposit("full", ByteArray(8), null))
        var n = PhoneTempNode.MAX_BLOBS_PER_TAG
        var i = 0
        while (n < PhoneTempNode.MAX_BLOBS_TOTAL) { assertTrue(node.localDeposit("other${i++ / 1000}", ByteArray(8), null)); n++ }
        assertFalse("the whole store is capped", node.localDeposit("another", ByteArray(8), null))
        clock += 25L * 3600 * 1000
        assertTrue("expired packets make room again", node.localDeposit("another", ByteArray(8), null))
    }

    @Test fun wipePacketsKeepsTheNodeRunning() {
        val st = started()
        deposit(st, "w")
        node.wipePackets()
        assertEquals("""{"blobs":[]}""", call("GET", "/fetch?tag=w").body)
        assertTrue(node.isRunning())
        assertEquals(201, deposit(st, "w").status)
    }

    @Test fun readsAreRateLimited() {
        started()
        val codes = (1..60).map { call("GET", "/fetch?tag=r").status }
        assertTrue(codes.first() == 200)
        assertTrue("a burst beyond the limit is refused", codes.any { it == 429 })
    }

    @Test fun garbageDoesNotCrashTheServer() {
        started()
        val s = java.net.Socket("127.0.0.1", node.localPort())
        s.getOutputStream().write("not http at all\r\n\r\n".toByteArray()); s.getOutputStream().flush()
        runCatching { s.getInputStream().readBytes() }
        s.close()
        val s2 = java.net.Socket("127.0.0.1", node.localPort())
        s2.getOutputStream().write(("GET /health HTTP/1.1\r\nX-Big: " + "a".repeat(20000)).toByteArray()); s2.getOutputStream().flush()
        runCatching { s2.getInputStream().readBytes() }
        s2.close()
        assertEquals(200, call("GET", "/health").status)
    }

    @Test fun listensOnLoopbackOnly() {
        started()
        val addrs = java.net.NetworkInterface.getNetworkInterfaces().toList().flatMap { it.inetAddresses.toList() }
            .filter { !it.isLoopbackAddress && it is java.net.Inet4Address }
        for (a in addrs) {
            val refused = runCatching { java.net.Socket().use { it.connect(java.net.InetSocketAddress(a, node.localPort()), 800) } }.isFailure
            assertTrue("not reachable on ${a.hostAddress}", refused)
        }
    }
}
