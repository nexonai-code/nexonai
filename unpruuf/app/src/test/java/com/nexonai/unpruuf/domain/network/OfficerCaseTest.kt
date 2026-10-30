package com.nexonai.unpruuf.domain.network

import com.google.crypto.tink.subtle.X25519
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.util.Base64

class OfficerCaseTest {

    @Test
    fun `case signal from the officer-app parses`() {
        val info = OfficerCase.parseCaseSignal(
            """{"n":"HW-7Q4M-2X9D","s":"in_progress","o":1700000000000,"a":1700604800000,"f":1707776000000,"t":1700100000000}"""
        )!!
        assertEquals("HW-7Q4M-2X9D", info.number)
        assertEquals("in_progress", info.status)
        assertEquals(1700000000000L, info.openedAt)
        assertEquals(1707776000000L, info.feedbackDueAt)
        assertEquals(1700100000000L, info.updatedAt)
    }

    @Test
    fun `malformed or unknown case signals are rejected`() {
        assertNull(OfficerCase.parseCaseSignal("""{"n":"HW-0000-1111","s":"closed"}"""))
        assertNull(OfficerCase.parseCaseSignal("""{"n":"HW-7Q4M-2X9D","s":"deleted"}"""))
        assertNull(OfficerCase.parseCaseSignal("not json"))
    }

    @Test
    fun `intake tag changes every hour and is the same for everyone with the QR`() {
        val key = ByteArray(32) { it.toByte() }
        assertEquals(OfficerCase.intakeTag(key, 470000), OfficerCase.intakeTag(key.copyOf(), 470000))
        assertNotEquals(OfficerCase.intakeTag(key, 470000), OfficerCase.intakeTag(key, 470001))
        assertTrue(OfficerCase.intakeTag(key, 1).length <= 64)
    }

    @Test
    fun `sealed intake fits one packet and hides the plaintext`() {
        val officerPriv = X25519.generatePrivateKey()
        val officerPub = X25519.publicFromPrivate(officerPriv)
        val plain = OfficerCase.encodeIntakePlaintext("6f1c2c38-0c1e-4b5e-9a0f-0d6c8e2b1a77", "{\"v\":2}")
        val sealed = OfficerCase.sealIntake(officerPub, ByteArray(32) { 7 }, plain)
        assertEquals(32 + 12 + plain.size + 16, sealed.size)
        assertTrue(sealed.size <= NetworkObfuscation.PACKET_SIZE - 8)
        assertTrue(!String(sealed, Charsets.ISO_8859_1).contains("UNPRUUF_INTAKE"))
    }

    /** Writes a vector the officer-app's interop check opens (officer-app/scripts/check-android-intake.js). */
    @Test
    fun `write interop vector for the officer-app`() {
        val officerPriv = X25519.generatePrivateKey()
        val officerPub = X25519.publicFromPrivate(officerPriv)
        val messageKey = ByteArray(32) { (it * 3 + 1).toByte() }
        val plain = OfficerCase.encodeIntakePlaintext("6f1c2c38-0c1e-4b5e-9a0f-0d6c8e2b1a77", "{\"v\":2,\"u\":\"x\"}")
        val sealed = OfficerCase.sealIntake(officerPub, messageKey, plain)
        val b64 = Base64.getEncoder()
        val out = File(System.getProperty("java.io.tmpdir"), "unpruuf-intake-vector.json")
        out.writeText(
            """{"officerPriv":"${b64.encodeToString(officerPriv)}","officerPub":"${b64.encodeToString(officerPub)}",""" +
                """"messageKey":"${b64.encodeToString(messageKey)}","sealed":"${b64.encodeToString(sealed)}",""" +
                """"hour":470000,"tag":"${OfficerCase.intakeTag(messageKey, 470000)}"}"""
        )
    }
}
