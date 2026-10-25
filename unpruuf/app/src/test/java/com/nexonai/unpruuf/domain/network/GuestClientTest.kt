package com.nexonai.unpruuf.domain.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GuestClientTest {
    private val now = 1_800_000_000_000L
    private val day = 24L * 3600 * 1000
    private val nodes = listOf("unpruuf-node:v1:aaa.onion:80", "unpruuf-node:v1:bbb.onion:80", "unpruuf-node:v1:ccc.onion:80")

    private fun grant(daysLeft: Long, secret: String = "owner-secret-1"): String =
        GuestGrant.issue(secret, GuestGrant.Spec(GuestGrant.newGrantId(), now + daysLeft * day, 60, 1024L * 1024))

    @Test fun `a normal pairing code without grants is not an invitation`() {
        val r = GuestClient.check(nodes, emptyList(), now)
        assertEquals(GuestClient.Problem.NOT_AN_INVITATION, (r as GuestClient.Check.Refused).problem)
        val r2 = GuestClient.check(nodes, listOf("", "", ""), now)
        assertEquals(GuestClient.Problem.NOT_AN_INVITATION, (r2 as GuestClient.Check.Refused).problem)
    }

    @Test fun `an invitation whose grants have all run out is refused as expired`() {
        val r = GuestClient.check(nodes, nodes.map { grant(-1) }, now)
        assertEquals(GuestClient.Problem.EXPIRED, (r as GuestClient.Check.Refused).problem)
    }

    @Test fun `valid grants are kept in their slots and a stale one is dropped`() {
        val g0 = grant(7); val g2 = grant(7)
        val r = GuestClient.check(nodes, listOf(g0, grant(-2), g2), now) as GuestClient.Check.Ok
        assertEquals(nodes, r.nodeAddresses)
        assertEquals(listOf(g0, "", g2), r.grants)
        assertEquals(now + 7 * day, r.expiresAtMs)
    }

    @Test fun `a grant that does not read as a grant is treated as missing`() {
        val g = grant(7)
        val r = GuestClient.check(nodes, listOf("not-a-grant", g, ""), now) as GuestClient.Check.Ok
        assertEquals(listOf("", g, ""), r.grants)
    }

    @Test fun `grants are never matched to a node they were not issued for`() {
        // More addresses than grants: the extra node simply has no grant.
        val g = grant(3)
        val r = GuestClient.check(nodes, listOf(g), now) as GuestClient.Check.Ok
        assertEquals(listOf(g, "", ""), r.grants)
    }

    @Test fun `status follows the latest grant`() {
        assertNull(GuestClient.status(null, now))
        assertNull(GuestClient.status("", now))
        val long = GuestGrant.encodeList(listOf(grant(7), ""))
        assertEquals(GuestClient.Status.ACTIVE, GuestClient.status(long, now))
        val soon = GuestGrant.encodeList(listOf(grant(1), grant(-1)))
        assertEquals(GuestClient.Status.EXPIRING, GuestClient.status(soon, now))
        val gone = GuestGrant.encodeList(listOf(grant(-1), grant(-3)))
        assertEquals(GuestClient.Status.EXPIRED, GuestClient.status(gone, now))
        assertEquals(GuestClient.Status.EXPIRED, GuestClient.status("garbage", now))
    }

    @Test fun `grantsFor keeps the list aligned with the addresses`() {
        val a = grant(5); val b = grant(5)
        assertEquals(listOf(a, "", b), GuestClient.grantsFor(GuestGrant.encodeList(listOf(a, "", b)), 3))
        assertEquals(listOf(a, ""), GuestClient.grantsFor(a, 2))
        assertEquals(listOf("", ""), GuestClient.grantsFor(null, 2))
    }

    @Test fun `expiry is the latest of all grants`() {
        val s = GuestGrant.encodeList(listOf(grant(2), grant(9), ""))
        assertEquals(now + 9 * day, GuestClient.expiryMs(s))
        assertNull(GuestClient.expiryMs("x;y"))
    }

    @Test fun `a grant that was issued for one owner never claims to be another's, the node decides`() {
        // The guest cannot verify the MAC (only the node can); it only reads expiry. Two owners'
        // grants therefore both read as valid here, which is why the node stays the authority.
        val a = grant(5, "secret-a"); val b = grant(5, "secret-b")
        assertTrue(GuestGrant.parse(a) != null && GuestGrant.parse(b) != null)
        assertTrue(a != b)
    }
}
