package com.nexonai.unpruuf.relay.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Android node's licence check against codes signed by the real vendor tool
 * (license-tool/lib.js signServerLicense) with a throw-away key — so this also proves the Kotlin
 * verifier and the Node signer agree byte for byte. "Now" is fixed at 2027-01-15.
 */
class NodeLicenseTest {
    private val pub = "vL6H2md5Ia--OhwPBcz7tF4RQ3xUlWhJRWzknPVEAZY"
    private val valid = "unpruuf-server-license:v1:MXxTUlYtMXxBY21lIEdtYkh8MjUwfDE3OTk4ODQ4MDAwMDB8MTgzMTUwNzIwMDAwMA:sOGJNfPVuZXjXB0yeSqBpdeJryJpyy0vB_dFWnQyr7WxsrbRWTFXsXuDrxRJrvQG-W44JrWTtiu1ZJTAeIEZBQ"
    private val soon = "unpruuf-server-license:v1:MXxTUlYtMnxBY21lIEdtYkh8MjUwfDE3OTk4ODQ4MDAwMDB8MTgwMDgzNTIwMDAwMA:A24tjXYP_1i-WwcrUQNlHVpIP-2fp7Xx5ZcOCLutRoJBXJFSRenzZBL0choPEHDcYpR7Flf0-F9M-2n1i8FrDA"
    private val expired = "unpruuf-server-license:v1:MXxTUlYtM3xBY21lIEdtYkh8MjUwfDE3NjU0MTEyMDAwMDB8MTc5OTk3MTE5OTAwMA:6_2Y4pQQlJmHBYLH3cNK0VsxLaJAGraiB96VG7DKXd-DzOUlLwBPL_fvrg_jtKHlr3MkH7YVSxksovHoV30kDA"
    private val appLicense = "unpruuf-license:v1:MXxwcm98WHxBfDF8Mg:89kCbe5o9cUT4a19SspxxtfMH1O-uboICAZWTORZoGWzozqZHgXpgqfqeEXlFqXBu399YEvtyHcb7b05apj0Cg"
    private val noDomain = "unpruuf-server-license:v1:MXxTfEF8NXwxfDE3OTk5NzEyMDAwMDA:cwTIY_WaxzwQhmZkRTOG5N7mo7p1bCYjLYdu57gMR8sQh9m6f9IHK-AoUbXH1RjV9QwPMiKES0uVupNsdC2iDg"
    private val now = 1_799_971_200_000L // 2027-01-15T00:00:00Z

    private class MemoryStore(var code: String? = null) : NodeLicense.CodeStore {
        override fun read() = code
        override fun write(code: String) { this.code = code }
    }

    private fun guard(store: MemoryStore = MemoryStore()) = NodeLicense.Guard(store, pub) { now }

    @Test
    fun genuineCodeVerifiesAndCarriesItsFields() {
        val info = NodeLicense.verify(valid, pub)!!
        assertEquals("Acme GmbH", info.customer)
        assertEquals("SRV-1", info.serial)
        assertEquals(250, info.maxNodes)
    }

    @Test
    fun tamperedForeignAppAndUndomainedCodesAreRefused() {
        assertNull(NodeLicense.verify(valid.dropLast(3) + "AAA", pub))
        assertNull(NodeLicense.verify(valid, "Zm9yZWlnbi1rZXktZm9yZWlnbi1rZXktZm9yZWlnbi0"))
        assertNull(NodeLicense.verify(appLicense, pub))
        assertNull(NodeLicense.verify(noDomain, pub))
        assertNull(NodeLicense.verify("", pub))
        assertNull(NodeLicense.verify("unpruuf-server-license:v1:abc", pub))
    }

    @Test
    fun statusFollowsTheClock() {
        assertEquals(NodeLicense.Status.MISSING, guard().status())
        assertEquals(NodeLicense.Status.VALID, guard(MemoryStore(valid)).status())
        assertEquals(NodeLicense.Status.EXPIRING, guard(MemoryStore(soon)).status())
        assertEquals(10L, guard(MemoryStore(soon)).summary().daysLeft)
        assertEquals(NodeLicense.Status.EXPIRED, guard(MemoryStore(expired)).status())
        assertEquals(NodeLicense.Status.INVALID, guard(MemoryStore("garbage")).status())
    }

    @Test
    fun withoutOrAfterTheLicenceDepositsAreBlockedButAnExpiredNodeStillStarts() {
        assertEquals("license_missing", guard().depositBlocked())
        assertFalse(guard().activated())
        assertEquals("license_expired", guard(MemoryStore(expired)).depositBlocked())
        assertTrue(guard(MemoryStore(expired)).activated())
        assertNull(guard(MemoryStore(valid)).depositBlocked())
        assertNull(guard(MemoryStore(soon)).depositBlocked())
    }

    @Test
    fun applyStoresAGenuineCodeAndRejectsTheRestWithoutTouchingStorage() {
        val store = MemoryStore()
        val g = guard(store)
        assertTrue(g.apply("nonsense") is NodeLicense.ApplyResult.Invalid)
        assertTrue(g.apply(appLicense) is NodeLicense.ApplyResult.WrongType)
        assertNull(store.code)
        assertTrue(g.apply("  " + valid + "\n") is NodeLicense.ApplyResult.Ok)
        assertEquals(valid, store.code)
        assertEquals(NodeLicense.Status.VALID, g.status())
        // a renewal pasted over an expiring licence takes effect at once
        val renewing = guard(MemoryStore(soon))
        assertEquals(NodeLicense.Status.EXPIRING, renewing.status())
        assertNotNull(renewing.apply(valid))
        assertEquals(NodeLicense.Status.VALID, renewing.status())
    }
}
