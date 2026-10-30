package com.nexonai.unpruuf.domain.network

import com.nexonai.unpruuf.domain.network.ratchet.DoubleRatchet
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.ByteBuffer
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * What a node (or relay) operator can read from a stored packet WITHOUT any key.
 *
 * A stored packet is [NetworkObfuscation.padPacket]'s output: `[payloadSize:4][offset:4][pad][payload][pad]`,
 * 4096 bytes. The two numbers at the front are NOT encrypted. This test builds packets with the real
 * ratchet, framing and padding code (the outer AES-GCM is the same three JDK calls as
 * `CryptoManager.encryptForContact`, which needs an Android Context and so cannot be constructed here)
 * and pins what an operator can see.
 *
 * It documents a KNOWN LIMIT (see evidence/CLAIMS_TO_EVIDENCE.md, finding F1): the operator can read each
 * packet's payload length, which grows with the message length, and cover packets are shorter than
 * any real message. If the wire format is changed to close this (length inside the encrypted part), this
 * test must change with it and the claims can be widened.
 */
class PacketMetadataTest {
    private val random = SecureRandom()

    private fun outerEncrypt(plaintext: ByteArray, key: ByteArray): ByteArray {
        val iv = ByteArray(12).also { random.nextBytes(it) }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        return iv + cipher.doFinal(plaintext)
    }

    /** The packet exactly as an app deposits it for a text message. */
    private fun realPacket(text: String): ByteArray {
        val alice = DoubleRatchet.generateKeyPair()
        val bob = DoubleRatchet.generateKeyPair()
        val root = ByteArray(32).also { random.nextBytes(it) }
        val state = DoubleRatchet.initSender(root, alice, bob.publicKey)
        val aad = ByteArray(32).also { random.nextBytes(it) }
        val message = DoubleRatchet.encrypt(state, MessagePayload.encodeText(text), aad)
        val frame = RatchetFrame.encode(RatchetFrame.split(message.header, message.ciphertext).single())
        return NetworkObfuscation.padPacket(outerEncrypt(frame, ByteArray(32).also { random.nextBytes(it) }))
    }

    private fun coverPacket(): ByteArray =
        NetworkObfuscation.padPacket(outerEncrypt("UNPRUUF_DUMMY_V1".toByteArray(Charsets.UTF_8), ByteArray(32).also { random.nextBytes(it) }))

    /** What anyone holding the stored bytes can read: the first four bytes. */
    private fun visiblePayloadSize(packet: ByteArray): Int = ByteBuffer.wrap(packet).int

    @Test
    fun `every stored packet is exactly 4096 bytes`() {
        assertEquals(4096, realPacket("hi").size)
        assertEquals(4096, realPacket("x".repeat(3000)).size)
        assertEquals(4096, coverPacket().size)
    }

    @Test
    fun `KNOWN LIMIT the payload length is readable without a key and follows the message length`() {
        val short = visiblePayloadSize(realPacket("hi"))
        val long = visiblePayloadSize(realPacket("x".repeat(3000)))
        assertNotEquals(short, long)
        // The difference equals the difference in message length: the length leaks to whoever holds the packet.
        assertEquals(3000 - 2, long - short)
    }

    @Test
    fun `KNOWN LIMIT a cover packet can be told from a real message by its visible payload length`() {
        val cover = visiblePayloadSize(coverPacket())
        // 12 (iv) + 16 ("UNPRUUF_DUMMY_V1") + 16 (GCM tag)
        assertEquals(44, cover)
        val shortestReal = visiblePayloadSize(realPacket(""))
        assertTrue("the shortest real message ($shortestReal) is longer than a cover packet ($cover)", shortestReal > cover)
    }

    @Test
    fun `the position of the payload inside the packet is random, the content around it is random`() {
        val offsets = (1..20).map { ByteBuffer.wrap(realPacket("hi")).also { it.int }.int }.toSet()
        assertTrue("offsets should vary between packets", offsets.size > 1)
    }
}
