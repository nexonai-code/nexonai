package com.nexonai.unpruuf.domain.network.ratchet

import com.google.crypto.tink.subtle.Hkdf
import com.google.crypto.tink.subtle.X25519
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.security.SecureRandom

/**
 * Exercises the ratchet exactly the way [com.nexonai.unpruuf.domain.network.ratchet.RatchetSessionManager]
 * will use it: an X3DH-lite bootstrap (mirroring the pairing handshake) followed by ordinary,
 * out-of-order and lost-message delivery.
 */
class DoubleRatchetTest {

    private val rotationFactor = ByteArray(32).also { SecureRandom().nextBytes(it) }
    private val ad = "routing-tag".toByteArray()

    /** Mirrors the HKDF(DH(a,b), salt=rotationFactor) bootstrap planned for pairing. */
    private fun sharedSecret(myPriv: ByteArray, theirPub: ByteArray): ByteArray {
        val dh = X25519.computeSharedSecret(myPriv, theirPub)
        return Hkdf.computeHkdf("HmacSha256", dh, rotationFactor, "unpruuf-x3dh-lite".toByteArray(), 32)
    }

    private fun pairedSessions(): Pair<DoubleRatchet.RatchetState, DoubleRatchet.RatchetState> {
        val a = DoubleRatchet.generateKeyPair() // long-term key, "initiator"
        val b = DoubleRatchet.generateKeyPair() // ephemeral key, "partner"
        val sharedA = sharedSecret(a.privateKey, b.publicKey)
        val sharedB = sharedSecret(b.privateKey, a.publicKey)
        assertArrayEquals("both sides derive the same X3DH-lite secret", sharedA, sharedB)
        val stateB = DoubleRatchet.initSender(sharedB, b, a.publicKey)
        val stateA = DoubleRatchet.initReceiver(sharedA, a)
        return stateA to stateB
    }

    @Test
    fun `first message from the sender-init side bootstraps the receiver-init side`() {
        val (stateA, stateB) = pairedSessions()
        val msg = DoubleRatchet.encrypt(stateB, "hello from B".toByteArray(), ad)
        val plaintext = DoubleRatchet.decrypt(stateA, msg.header, msg.ciphertext, ad)
        assertEquals("hello from B", String(plaintext))
    }

    @Test
    fun `receiver-init side cannot send before receiving anything`() {
        val (stateA, _) = pairedSessions()
        assertThrows(DoubleRatchet.RatchetError::class.java) {
            DoubleRatchet.encrypt(stateA, "too early".toByteArray(), ad)
        }
    }

    @Test
    fun `messages round-trip back and forth across many DH ratchet steps`() {
        val (stateA, stateB) = pairedSessions()
        val first = DoubleRatchet.encrypt(stateB, "kickoff".toByteArray(), ad)
        DoubleRatchet.decrypt(stateA, first.header, first.ciphertext, ad)

        repeat(10) { i ->
            val fromB = DoubleRatchet.encrypt(stateB, "b-$i".toByteArray(), ad)
            assertEquals("b-$i", String(DoubleRatchet.decrypt(stateA, fromB.header, fromB.ciphertext, ad)))
            val fromA = DoubleRatchet.encrypt(stateA, "a-$i".toByteArray(), ad)
            assertEquals("a-$i", String(DoubleRatchet.decrypt(stateB, fromA.header, fromA.ciphertext, ad)))
        }
    }

    @Test
    fun `out-of-order messages within one chain still decrypt`() {
        val (stateA, stateB) = pairedSessions()
        val first = DoubleRatchet.encrypt(stateB, "kickoff".toByteArray(), ad)
        DoubleRatchet.decrypt(stateA, first.header, first.ciphertext, ad)

        val sent = (0 until 4).map { i -> DoubleRatchet.encrypt(stateB, "ooo-$i".toByteArray(), ad) }
        for (idx in listOf(3, 1, 0, 2)) {
            val m = sent[idx]
            assertEquals("ooo-$idx", String(DoubleRatchet.decrypt(stateA, m.header, m.ciphertext, ad)))
        }
    }

    @Test
    fun `a message lost in transit is recovered later via the skipped-key cache`() {
        val (stateA, stateB) = pairedSessions()
        val first = DoubleRatchet.encrypt(stateB, "kickoff".toByteArray(), ad)
        DoubleRatchet.decrypt(stateA, first.header, first.ciphertext, ad)

        val lost = DoubleRatchet.encrypt(stateB, "lost".toByteArray(), ad)
        val arrives = DoubleRatchet.encrypt(stateB, "arrives".toByteArray(), ad)
        val later = DoubleRatchet.encrypt(stateB, "later".toByteArray(), ad)

        assertEquals("arrives", String(DoubleRatchet.decrypt(stateA, arrives.header, arrives.ciphertext, ad)))
        assertEquals("later", String(DoubleRatchet.decrypt(stateA, later.header, later.ciphertext, ad)))
        assertEquals("lost", String(DoubleRatchet.decrypt(stateA, lost.header, lost.ciphertext, ad)))
    }

    @Test
    fun `decrypting with the wrong associated data fails`() {
        val (stateA, stateB) = pairedSessions()
        val first = DoubleRatchet.encrypt(stateB, "kickoff".toByteArray(), ad)
        DoubleRatchet.decrypt(stateA, first.header, first.ciphertext, ad)

        val msg = DoubleRatchet.encrypt(stateB, "tamper-me".toByteArray(), ad)
        assertThrows(Exception::class.java) {
            DoubleRatchet.decrypt(stateA, msg.header, msg.ciphertext, "wrong-tag".toByteArray())
        }
    }

    @Test
    fun `ratchet header round-trips through its wire encoding`() {
        val header = RatchetHeader(ByteArray(32) { it.toByte() }, previousChainLength = 7, messageNumber = 42)
        assertEquals(header, RatchetHeader.decode(header.encode()))
    }
}
