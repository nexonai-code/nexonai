package com.nexonai.unpruuf.domain.network

import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.DataInputStream
import java.net.ServerSocket
import java.net.Socket
import kotlin.concurrent.thread

/** [Socks5] against a small in-process SOCKS server that records what the client sent. */
class Socks5Test {
    private val servers = mutableListOf<ServerSocket>()

    @After fun closeAll() { servers.forEach { runCatching { it.close() } } }

    private class Seen {
        @Volatile var greeting: ByteArray? = null
        @Volatile var user: String? = null
        @Volatile var pass: String? = null
        @Volatile var host: String? = null
        @Volatile var port: Int = -1
        @Volatile var afterHandshake: String? = null
    }

    /** Behaviour of the fake proxy. */
    private data class Mode(
        val method: Int? = null,          // what it answers to the greeting; null = the offered one
        val authOk: Boolean = true,
        val connectStatus: Int = 0,
        val boundAtyp: Int = 1,           // 1 ipv4, 3 name, 4 ipv6
        val hang: Boolean = false,
        val version: Int = 5
    )

    private fun start(mode: Mode = Mode(), seen: Seen = Seen()): Pair<Int, Seen> {
        val server = ServerSocket(0, 1, java.net.InetAddress.getByName("127.0.0.1")).also { servers += it }
        thread(isDaemon = true) {
            runCatching {
                server.accept().use { s ->
                    val input = DataInputStream(s.getInputStream())
                    val out = s.getOutputStream()
                    if (mode.hang) { Thread.sleep(30_000); return@use }
                    val g = ByteArray(3).also { input.readFully(it) }
                    seen.greeting = g
                    val chosen = mode.method ?: (g[2].toInt() and 0xFF)
                    out.write(byteArrayOf(mode.version.toByte(), chosen.toByte())); out.flush()
                    if (chosen == 0xFF) return@use
                    if (chosen == 0x02) {
                        input.readUnsignedByte()
                        val ulen = input.readUnsignedByte()
                        seen.user = String(ByteArray(ulen).also { input.readFully(it) })
                        val plen = input.readUnsignedByte()
                        seen.pass = String(ByteArray(plen).also { input.readFully(it) })
                        out.write(byteArrayOf(1, if (mode.authOk) 0 else 1)); out.flush()
                        if (!mode.authOk) return@use
                    }
                    val h = ByteArray(4).also { input.readFully(it) }
                    require(h[3].toInt() == 3) { "client must send a name" }
                    val nlen = input.readUnsignedByte()
                    seen.host = String(ByteArray(nlen).also { input.readFully(it) })
                    seen.port = (input.readUnsignedByte() shl 8) or input.readUnsignedByte()
                    val bound = when (mode.boundAtyp) {
                        1 -> byteArrayOf(1, 0, 0, 0, 0, 0, 0)
                        4 -> byteArrayOf(4) + ByteArray(16) + byteArrayOf(0, 0)
                        else -> byteArrayOf(3, 3, 'a'.code.toByte(), 'b'.code.toByte(), 'c'.code.toByte(), 0, 0)
                    }
                    out.write(byteArrayOf(5, mode.connectStatus.toByte(), 0) + bound); out.flush()
                    if (mode.connectStatus == 0) {
                        // After the handshake the stream belongs to the caller's protocol.
                        val line = ByteArray(5).also { input.readFully(it) }
                        seen.afterHandshake = String(line)
                        out.write("pong!".toByteArray()); out.flush()
                    }
                }
            }
        }
        return server.localPort to seen
    }

    private val onion = "a".repeat(56) + ".onion"

    @Test fun connectsWithAUserNameAndSendsTheHostAsAName() {
        val (port, seen) = start()
        Socks5.connect("127.0.0.1", port, onion, 80, "u-1234").use { s ->
            s.getOutputStream().write("ping!".toByteArray()); s.getOutputStream().flush()
            val reply = ByteArray(5).also { DataInputStream(s.getInputStream()).readFully(it) }
            assertEquals("pong!", String(reply))
        }
        assertArrayEquals(byteArrayOf(5, 1, 2), seen.greeting) // only the user-name method is offered
        assertEquals("u-1234", seen.user)
        assertEquals("u-1234", seen.pass)
        assertEquals(onion, seen.host)
        assertEquals(80, seen.port)
        assertEquals("ping!", seen.afterHandshake)
    }

    @Test fun withoutAUserNameItOffersNoAuthentication() {
        val (port, seen) = start()
        Socks5.connect("127.0.0.1", port, onion, 80, null).close()
        assertArrayEquals(byteArrayOf(5, 1, 0), seen.greeting)
        assertEquals(null, seen.user)
    }

    @Test fun aProxyThatSkipsAuthenticationIsRefusedWhenCredentialsWereGiven() {
        val (port, _) = start(Mode(method = 0x00))
        assertThrows(Socks5.Socks5Exception::class.java) { Socks5.connect("127.0.0.1", port, onion, 80, "u-1") }
    }

    @Test fun aProxyThatAsksForAuthenticationWhenNoneWasGivenIsRefused() {
        val (port, _) = start(Mode(method = 0x02))
        assertThrows(Socks5.Socks5Exception::class.java) { Socks5.connect("127.0.0.1", port, onion, 80, null) }
    }

    @Test fun refusedCredentialsFail() {
        val (port, seen) = start(Mode(authOk = false))
        assertThrows(Socks5.Socks5Exception::class.java) { Socks5.connect("127.0.0.1", port, onion, 80, "u-1") }
        assertEquals("u-1", seen.user)
        assertEquals(null, seen.host) // no connect request after a refused login
    }

    @Test fun noAcceptableMethodFails() {
        val (port, _) = start(Mode(method = 0xFF))
        assertThrows(Socks5.Socks5Exception::class.java) { Socks5.connect("127.0.0.1", port, onion, 80, "u-1") }
    }

    @Test fun everyConnectErrorCodeFails() {
        for (code in listOf(1, 2, 3, 4, 5, 6, 7, 8, 0xF0, 0xF6)) {
            val (port, _) = start(Mode(connectStatus = code))
            val e = assertThrows(Socks5.Socks5Exception::class.java) { Socks5.connect("127.0.0.1", port, onion, 80, "u-1") }
            assertTrue(e.message!!.contains("0x%02x".format(code)))
        }
    }

    @Test fun aReplyWithAnotherVersionIsNotSocks5() {
        val (port, _) = start(Mode(version = 4))
        assertThrows(Socks5.Socks5Exception::class.java) { Socks5.connect("127.0.0.1", port, onion, 80, null) }
    }

    @Test fun allBoundAddressTypesAreReadAndDropped() {
        for (atyp in listOf(1, 3, 4)) {
            val (port, seen) = start(Mode(boundAtyp = atyp))
            Socks5.connect("127.0.0.1", port, onion, 80, "u-1").use { s ->
                s.getOutputStream().write("ping!".toByteArray()); s.getOutputStream().flush()
                assertEquals("pong!", String(ByteArray(5).also { DataInputStream(s.getInputStream()).readFully(it) }))
            }
            assertEquals("ping!", seen.afterHandshake)
        }
    }

    @Test fun aProxyThatNeverAnswersTimesOut() {
        val (port, _) = start(Mode(hang = true))
        val started = System.nanoTime()
        assertThrows(java.io.IOException::class.java) { Socks5.connect("127.0.0.1", port, onion, 80, "u-1", handshakeTimeoutMs = 400) }
        assertTrue((System.nanoTime() - started) / 1_000_000 < 5_000)
    }

    @Test fun nothingListeningFails() {
        val free = ServerSocket(0).use { it.localPort }
        assertThrows(java.io.IOException::class.java) { Socks5.connect("127.0.0.1", free, onion, 80, "u-1", handshakeTimeoutMs = 1000) }
    }

    @Test fun badArgumentsAreRefusedBeforeAnythingIsOpened() {
        assertThrows(IllegalArgumentException::class.java) { Socks5.connect("127.0.0.1", 9, "", 80, null) }
        assertThrows(IllegalArgumentException::class.java) { Socks5.connect("127.0.0.1", 9, "x".repeat(256), 80, null) }
        assertThrows(IllegalArgumentException::class.java) { Socks5.connect("127.0.0.1", 9, onion, 0, null) }
        assertThrows(IllegalArgumentException::class.java) { Socks5.connect("127.0.0.1", 9, onion, 80, "") }
        assertThrows(IllegalArgumentException::class.java) { Socks5.connect("127.0.0.1", 9, onion, 80, "u".repeat(256)) }
    }

    @Test fun theSocketHasNoReadTimeoutLeftOverFromTheHandshake() {
        val (port, _) = start()
        Socks5.connect("127.0.0.1", port, onion, 80, "u-1", handshakeTimeoutMs = 700).use { s ->
            assertEquals(0, s.soTimeout)
            assertFalse(s.isClosed)
        }
    }
}
