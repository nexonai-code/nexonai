package com.nexonai.unpruuf.domain.network

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GuestInviteTest {
    private val nodes = listOf(GuestInvite.OwnNode("a.onion", "secretA"), GuestInvite.OwnNode("b.onion", "secretB"), GuestInvite.OwnNode("c.onion", "secretC"))
    private val now = 1_800_000_000_000L

    @Test
    fun `one grant per node with expiry, limits and a fresh id each`() {
        val grants = GuestInvite.issueGrants(nodes, now, 7, GuestInvite.Quota.NORMAL)
        assertEquals(3, grants.size)
        val infos = grants.map { GuestGrant.parse(it)!! }
        for (i in infos) {
            assertEquals(now + 7L * 24 * 3600 * 1000, i.notAfterMs)
            assertEquals(60, i.depositsPerHour)
            assertEquals(1024L * 1024, i.bytesPerHour)
            assertEquals(0, i.scope.size)
        }
        assertEquals(3, infos.map { it.grantId.joinToString("") }.toSet().size)
    }

    @Test
    fun `a second invitation gets different grant ids`() {
        val a = GuestInvite.issueGrants(nodes, now, 7, GuestInvite.Quota.NORMAL).map { GuestGrant.parse(it)!!.grantId.joinToString("") }
        val b = GuestInvite.issueGrants(nodes, now, 7, GuestInvite.Quota.NORMAL).map { GuestGrant.parse(it)!!.grantId.joinToString("") }
        assertTrue(a.intersect(b.toSet()).isEmpty())
    }

    @Test
    fun `grants are signed per node and never contain an owner secret`() {
        val grants = GuestInvite.issueGrants(nodes, now, 14, GuestInvite.Quota.LIGHT)
        for ((i, g) in grants.withIndex()) {
            assertFalse(g.contains(nodes[i].ownerSecret))
        }
        // The same fields signed for another node must differ in the mac.
        val id = GuestGrant.parse(grants[0])!!
        val other = GuestGrant.issue("secretB", GuestGrant.Spec(id.grantId, id.notAfterMs, id.depositsPerHour, id.bytesPerHour, id.scope))
        assertNotEquals(grants[0], other)
    }

    @Test
    fun `scope is passed through per node`() {
        val scope = GuestScope.encode(listOf(GuestScope.Entry(3, 10, 12)))
        val grants = GuestInvite.issueGrants(nodes, now, 7, GuestInvite.Quota.HIGH, scopeFor = { if (it == 1) scope else ByteArray(0) })
        assertArrayEquals(ByteArray(0), GuestGrant.parse(grants[0])!!.scope)
        assertArrayEquals(scope, GuestGrant.parse(grants[1])!!.scope)
    }

    @Test
    fun `validity is limited and an empty node list is refused`() {
        assertTrue(runCatching { GuestInvite.issueGrants(nodes, now, 0, GuestInvite.Quota.NORMAL) }.isFailure)
        assertTrue(runCatching { GuestInvite.issueGrants(nodes, now, 31, GuestInvite.Quota.NORMAL) }.isFailure)
        assertTrue(runCatching { GuestInvite.issueGrants(emptyList(), now, 7, GuestInvite.Quota.NORMAL) }.isFailure)
        assertTrue(GuestInvite.VALIDITY_DAYS_OPTIONS.all { it in 1..30 })
    }

    @Test
    fun `scope encode decode and range checks`() {
        val entries = listOf(GuestScope.Entry(0, 0, 9), GuestScope.Entry(249, 0, 99))
        val bytes = GuestScope.encode(entries)
        assertEquals("0000000900f90063", bytes.joinToString("") { "%02x".format(it) })
        assertEquals(entries, GuestScope.decode(bytes))
        assertTrue(GuestScope.allows(entries, 0, 9))
        assertFalse(GuestScope.allows(entries, 0, 10))
        assertFalse(GuestScope.allows(entries, 1, 0))
        assertNull(GuestScope.decode(byteArrayOf(0, 0, 0)))
        assertNull(GuestScope.decode(byteArrayOf(0, 0xfa.toByte(), 0, 0)))
        assertNull(GuestScope.decode(byteArrayOf(0, 0, 10, 9)))
        assertTrue(runCatching { GuestScope.Entry(250, 0, 0) }.isFailure)
        assertTrue(runCatching { GuestScope.Entry(0, 5, 4) }.isFailure)
        assertTrue(runCatching { GuestScope.Entry(0, 0, 100) }.isFailure)
    }

    @Test
    fun `the slot-scope vector carries the scope entries`() {
        val text = javaClass.classLoader!!.getResourceAsStream("guest-grant-vectors.json")!!.bufferedReader().readText()
        val token = Regex(""""name"\s*:\s*"slot-scope".*?"token"\s*:\s*"([^"]*)"""", RegexOption.DOT_MATCHES_ALL).find(text)!!.groupValues[1]
        val info = GuestGrant.parse(token)!!
        assertEquals(listOf(GuestScope.Entry(0, 0, 9), GuestScope.Entry(249, 0, 99)), GuestScope.decode(info.scope))
    }
}
