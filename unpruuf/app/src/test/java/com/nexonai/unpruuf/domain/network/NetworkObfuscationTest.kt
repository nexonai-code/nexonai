package com.nexonai.unpruuf.domain.network

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.security.SecureRandom

/**
 * [NetworkObfuscation] pads every outgoing packet to a fixed [NetworkObfuscation.PACKET_SIZE] so
 * an observer on the wire can't tell messages apart by size. These tests cover the pad/unpad
 * round-trip at the boundary sizes where an off-by-one in the offset/length header would first
 * show up (empty payload, exactly the largest payload that still fits, and one byte over).
 */
class NetworkObfuscationTest {

    private val rng = SecureRandom()

    private fun randomPayload(size: Int): ByteArray = ByteArray(size).also { rng.nextBytes(it) }

    @Test
    fun `empty payload round-trips`() {
        val padded = NetworkObfuscation.padPacket(ByteArray(0))
        assertEquals(NetworkObfuscation.PACKET_SIZE, padded.size)
        assertArrayEquals(ByteArray(0), NetworkObfuscation.unpadPacket(padded))
    }

    @Test
    fun `typical payload round-trips`() {
        val payload = randomPayload(512)
        val padded = NetworkObfuscation.padPacket(payload)
        assertEquals(NetworkObfuscation.PACKET_SIZE, padded.size)
        assertArrayEquals(payload, NetworkObfuscation.unpadPacket(padded))
    }

    @Test
    fun `largest payload that still fits round-trips`() {
        val payload = randomPayload(NetworkObfuscation.PACKET_SIZE - 8)
        val padded = NetworkObfuscation.padPacket(payload)
        assertEquals(NetworkObfuscation.PACKET_SIZE, padded.size)
        assertArrayEquals(payload, NetworkObfuscation.unpadPacket(padded))
    }

    @Test
    fun `payload one byte over the limit is rejected`() {
        assertThrows(IllegalArgumentException::class.java) {
            NetworkObfuscation.padPacket(randomPayload(NetworkObfuscation.PACKET_SIZE - 7))
        }
    }

    @Test
    fun `unpadding a packet with the wrong size is rejected`() {
        assertThrows(IllegalArgumentException::class.java) {
            NetworkObfuscation.unpadPacket(ByteArray(NetworkObfuscation.PACKET_SIZE - 1))
        }
    }

    @Test
    fun `padded packets never reveal payload size by their own size`() {
        val small = NetworkObfuscation.padPacket(randomPayload(1))
        val large = NetworkObfuscation.padPacket(randomPayload(NetworkObfuscation.PACKET_SIZE - 8))
        assertEquals(small.size, large.size)
    }

    @Test
    fun `dummy packets are exactly one packet size`() {
        assertEquals(NetworkObfuscation.PACKET_SIZE, NetworkObfuscation.generateDummyPacket().size)
    }
}
