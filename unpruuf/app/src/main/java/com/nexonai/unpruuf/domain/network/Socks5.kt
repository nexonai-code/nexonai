package com.nexonai.unpruuf.domain.network

import java.io.DataInputStream
import java.io.IOException
import java.net.InetSocketAddress
import java.net.Socket

/**
 * A SOCKS5 client for Tor's SocksPort with optional user name and password (RFC 1929).
 *
 * Tor keeps streams with different SOCKS credentials on different circuits (stream isolation), which
 * is how the app keeps the requests of one contact apart from those of another towards a node
 * operator. The platform's `Socket(Proxy)` could do that only through `java.net.Authenticator`, which
 * is process-wide state and would touch every other connection of the app; this client has none.
 *
 * Fails closed: if credentials are given, only the user-name method is offered, so a proxy that
 * answers "no authentication" is refused instead of silently carrying the request without isolation.
 * The target host goes to Tor as a name (address type 3), never resolved on the phone.
 */
object Socks5 {
    class Socks5Exception(message: String) : IOException(message)

    private const val VERSION: Int = 5
    private const val METHOD_NONE = 0x00
    private const val METHOD_USER_PASS = 0x02
    private const val METHOD_REFUSED = 0xFF
    private const val CMD_CONNECT = 0x01
    private const val ATYP_IPV4 = 0x01
    private const val ATYP_NAME = 0x03
    private const val ATYP_IPV6 = 0x04

    /**
     * Opens a connection to [host]:[port] through the SOCKS5 proxy at [proxyHost]:[proxyPort] and returns the
     * connected socket, ready for the caller's own protocol. [handshakeTimeoutMs] bounds connect and handshake;
     * the socket's read timeout is left at 0 for the caller to set.
     */
    fun connect(
        proxyHost: String,
        proxyPort: Int,
        host: String,
        port: Int,
        username: String? = null,
        handshakeTimeoutMs: Int = 40_000
    ): Socket {
        val nameBytes = host.toByteArray(Charsets.US_ASCII)
        require(nameBytes.isNotEmpty() && nameBytes.size <= 255) { "host name must be 1..255 bytes" }
        require(port in 1..65535) { "port out of range" }
        val user = username?.toByteArray(Charsets.US_ASCII)
        if (user != null) require(user.isNotEmpty() && user.size <= 255) { "user name must be 1..255 bytes" }

        val socket = Socket()
        try {
            socket.soTimeout = handshakeTimeoutMs
            socket.connect(InetSocketAddress(proxyHost, proxyPort), handshakeTimeoutMs)
            val out = socket.getOutputStream()
            val input = DataInputStream(socket.getInputStream())

            // Greeting: with credentials we offer ONLY the user-name method.
            out.write(byteArrayOf(VERSION.toByte(), 1, (if (user != null) METHOD_USER_PASS else METHOD_NONE).toByte()))
            out.flush()
            val greeting = ByteArray(2).also { input.readFully(it) }
            if (greeting[0].toInt() != VERSION) throw Socks5Exception("not a SOCKS5 proxy")
            val chosen = greeting[1].toInt() and 0xFF
            if (chosen == METHOD_REFUSED) throw Socks5Exception("proxy refused the offered method")
            if (user != null && chosen != METHOD_USER_PASS) throw Socks5Exception("proxy did not accept user name authentication")
            if (user == null && chosen != METHOD_NONE) throw Socks5Exception("proxy asked for authentication")

            if (user != null) {
                // RFC 1929: the password is the user name again (Tor looks only at the pair as a whole).
                val auth = ByteArray(3 + user.size + user.size)
                auth[0] = 1
                auth[1] = user.size.toByte()
                user.copyInto(auth, 2)
                auth[2 + user.size] = user.size.toByte()
                user.copyInto(auth, 3 + user.size)
                out.write(auth)
                out.flush()
                val reply = ByteArray(2).also { input.readFully(it) }
                if (reply[0].toInt() != 1 || reply[1].toInt() != 0) throw Socks5Exception("proxy rejected the credentials")
            }

            val request = ByteArray(7 + nameBytes.size)
            request[0] = VERSION.toByte()
            request[1] = CMD_CONNECT.toByte()
            request[2] = 0
            request[3] = ATYP_NAME.toByte()
            request[4] = nameBytes.size.toByte()
            nameBytes.copyInto(request, 5)
            request[5 + nameBytes.size] = (port ushr 8).toByte()
            request[6 + nameBytes.size] = port.toByte()
            out.write(request)
            out.flush()

            val head = ByteArray(4).also { input.readFully(it) }
            if (head[0].toInt() != VERSION) throw Socks5Exception("malformed SOCKS5 reply")
            val status = head[1].toInt() and 0xFF
            // The bound address that follows is read and dropped, so the caller's data starts clean.
            when (head[3].toInt() and 0xFF) {
                ATYP_IPV4 -> input.skipFully(4 + 2)
                ATYP_IPV6 -> input.skipFully(16 + 2)
                ATYP_NAME -> input.skipFully((input.readUnsignedByte()) + 2)
                else -> throw Socks5Exception("malformed SOCKS5 reply")
            }
            if (status != 0) throw Socks5Exception("connect refused by the proxy (code 0x%02x)".format(status))

            socket.soTimeout = 0
            return socket
        } catch (e: Exception) {
            runCatching { socket.close() }
            throw e
        }
    }

    private fun DataInputStream.skipFully(n: Int) {
        val skipped = ByteArray(n)
        readFully(skipped)
    }
}
