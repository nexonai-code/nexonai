package com.nexonai.unpruuf.domain.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GuestRenewalTest {
    private val now = 1_800_000_000_000L
    private val day = 24L * 3600 * 1000
    private fun onion(c: Char) = c.toString().repeat(56) + ".onion"
    private fun grant(daysLeft: Long) =
        GuestGrant.issue("owner-secret", GuestGrant.Spec(GuestGrant.newGrantId(), now + daysLeft * day, 60, 1024L * 1024))

    @Test fun `policy survives encoding, stopping keeps the settings`() {
        val p = GuestRenewal.Policy(7, GuestInvite.Quota.NORMAL, true)
        assertEquals("7:NORMAL", GuestRenewal.encodePolicy(p))
        assertEquals(p, GuestRenewal.decodePolicy("7:NORMAL"))
        val stopped = GuestRenewal.decodePolicy("!14:HIGH")!!
        assertFalse(stopped.renewing)
        assertEquals(14, stopped.validityDays)
        assertEquals("!14:HIGH", GuestRenewal.encodePolicy(stopped))
        for (bad in listOf(null, "", "7", "0:NORMAL", "31:NORMAL", "7:HUGE", "x:NORMAL", "7:NORMAL:1")) assertNull(bad, GuestRenewal.decodePolicy(bad))
    }

    @Test fun `renewal is due a quarter of the validity after the last one`() {
        val p = GuestRenewal.Policy(7, GuestInvite.Quota.NORMAL, true)
        assertTrue(GuestRenewal.due(p, null, now))
        assertFalse(GuestRenewal.due(p, now - 41 * 3600_000L, now))
        assertTrue(GuestRenewal.due(p, now - 42 * 3600_000L, now))
        assertFalse(GuestRenewal.due(p.copy(renewing = false), null, now))
        // never more often than every 6 hours, even for a 1-day grant
        val short = GuestRenewal.Policy(1, GuestInvite.Quota.LIGHT, true)
        assertFalse(GuestRenewal.due(short, now - 5 * 3600_000L, now))
        assertTrue(GuestRenewal.due(short, now - 6 * 3600_000L, now))
    }

    @Test fun `a renewal round trip keeps addresses together with their grants`() {
        val a = GuestRenewal.Entry(onion('a'), grant(7)); val b = GuestRenewal.Entry(onion('b'), grant(7))
        val parsed = GuestRenewal.parseSignal(GuestRenewal.encodeSignal(listOf(a, b)), now)!!
        assertEquals(listOf(a, b), parsed)
    }

    @Test fun `unusable entries are dropped, nothing usable gives null`() {
        val good = GuestRenewal.Entry(onion('a'), grant(7))
        val payload = GuestRenewal.SIGNAL_PREFIX + listOf(
            "evil.example.com,${grant(7)}",       // not an onion
            "${onion('b')},not-a-grant",           // not a grant
            "${onion('c')},${grant(-1)}",          // already expired
            "${good.address},${good.token}",
            "${good.address},${grant(7)}",         // duplicate address
            "${onion('d')}"                        // no token
        ).joinToString(";")
        assertEquals(listOf(good), GuestRenewal.parseSignal(payload, now))
        assertNull(GuestRenewal.parseSignal(GuestRenewal.SIGNAL_PREFIX + "evil.example.com,${grant(7)}", now))
        assertNull(GuestRenewal.parseSignal("UNPRUUF_OTHER_V1:x", now))
        assertNull(GuestRenewal.parseSignal(GuestRenewal.SIGNAL_PREFIX, now))
    }

    @Test fun `at most as many entries as a contact has nodes`() {
        val entries = listOf('a', 'b', 'c', 'd', 'e').map { GuestRenewal.Entry(onion(it), grant(7)) }
        assertEquals(NodeMeshManager.NODE_POOL_MAX_SIZE, GuestRenewal.parseSignal(GuestRenewal.encodeSignal(entries), now)!!.size)
    }

    @Test fun `a renewal fits in one packet with room to spare`() {
        val entries = listOf('a', 'b', 'c').map { GuestRenewal.Entry(onion(it), GuestGrant.issue("s", GuestGrant.Spec(GuestGrant.newGrantId(), now + 7 * day, 120, 2L * 1024 * 1024, ByteArray(64)))) }
        assertTrue(GuestRenewal.encodeSignal(entries).toByteArray().size < 2000)
    }
}
