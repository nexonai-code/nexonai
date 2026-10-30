package com.nexonai.unpruuf.domain.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TorIsolationTest {
    private val secretA = ByteArray(32) { it.toByte() }
    private val secretB = ByteArray(32) { (it + 1).toByte() }

    @Test fun theSameContactAlwaysGetsTheSameKey() =
        assertEquals(TorIsolation.keyFor(secretA, "contact-1"), TorIsolation.keyFor(secretA, "contact-1"))

    @Test fun differentContactsGetDifferentKeys() =
        assertNotEquals(TorIsolation.keyFor(secretA, "contact-1"), TorIsolation.keyFor(secretA, "contact-2"))

    @Test fun differentDevicesGetDifferentKeysForTheSameContact() =
        assertNotEquals(TorIsolation.keyFor(secretA, "contact-1"), TorIsolation.keyFor(secretB, "contact-1"))

    @Test fun theKeyIsShortPlainHexAndDoesNotContainTheContactId() {
        val key = TorIsolation.keyFor(secretA, "contact-1")
        assertEquals(32, key.length)
        assertTrue(key.all { it in '0'..'9' || it in 'a'..'f' })
        assertFalse(key.contains("contact"))
        // Short enough for a SOCKS user name, which must be 1..255 bytes.
        assertTrue(key.toByteArray().size in 1..255)
    }
}
