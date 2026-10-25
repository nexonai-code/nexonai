package com.nexonai.unpruuf.domain.network

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Pins [GuestGrant] to the same bytes the node verifies (shared vectors, see guest-grants/). */
class GuestGrantTest {

    private data class Vec(val name: String, val grantIdHex: String, val notAfterMs: Long, val per: Int, val bytes: Long, val scopeHex: String, val token: String)

    private fun hex(s: String): ByteArray = ByteArray(s.length / 2) { s.substring(it * 2, it * 2 + 2).toInt(16).toByte() }

    private fun vectors(): Pair<String, List<Vec>> {
        val text = javaClass.classLoader!!.getResourceAsStream("guest-grant-vectors.json")!!.bufferedReader().readText()
        val secret = Regex(""""ownerSecret"\s*:\s*"([^"]*)"""").find(text)!!.groupValues[1]
        val cases = Regex("""\{\s*"name"\s*:\s*"([^"]*)",\s*"grantIdHex"\s*:\s*"([^"]*)",\s*"notAfterMs"\s*:\s*(\d+),\s*"depositsPerHour"\s*:\s*(\d+),\s*"bytesPerHour"\s*:\s*(\d+),\s*"scopeHex"\s*:\s*"([^"]*)",\s*"token"\s*:\s*"([^"]*)"""")
            .findAll(text).map {
                val g = it.groupValues
                Vec(g[1], g[2], g[3].toLong(), g[4].toInt(), g[5].toLong(), g[6], g[7])
            }.toList()
        return secret to cases
    }

    @Test
    fun `issue reproduces every shared vector byte for byte`() {
        val (secret, cases) = vectors()
        assertTrue("vectors must not be empty", cases.size >= 3)
        for (c in cases) {
            val token = GuestGrant.issue(secret, GuestGrant.Spec(hex(c.grantIdHex), c.notAfterMs, c.per, c.bytes, hex(c.scopeHex)))
            assertEquals(c.name, c.token, token)
        }
    }

    @Test
    fun `parse reads back the fields of every vector`() {
        val (_, cases) = vectors()
        for (c in cases) {
            val info = GuestGrant.parse(c.token)!!
            assertArrayEquals(c.name, hex(c.grantIdHex), info.grantId)
            assertEquals(c.notAfterMs, info.notAfterMs)
            assertEquals(c.per, info.depositsPerHour)
            assertEquals(c.bytes, info.bytesPerHour)
            assertArrayEquals(hex(c.scopeHex), info.scope)
        }
    }

    @Test
    fun `a different owner secret gives a different mac`() {
        val (secret, cases) = vectors()
        val c = cases.first()
        val other = GuestGrant.issue(secret + "x", GuestGrant.Spec(hex(c.grantIdHex), c.notAfterMs, c.per, c.bytes, hex(c.scopeHex)))
        assertFalse(other == c.token)
        assertEquals(c.token.substringBefore('.'), other.substringBefore('.'))
    }

    @Test
    fun `malformed tokens are rejected`() {
        assertNull(GuestGrant.parse(""))
        assertNull(GuestGrant.parse("abc"))
        assertNull(GuestGrant.parse("abc."))
        assertNull(GuestGrant.parse(".abc"))
        assertNull(GuestGrant.parse("a.b.c"))
        assertNull(GuestGrant.parse("AAAA.BBBB"))
        val (_, cases) = vectors()
        assertNull(GuestGrant.parse(cases.first().token + ".extra"))
    }

    @Test
    fun `needsRenewal is true inside the window and for unreadable tokens`() {
        val (_, cases) = vectors()
        val t = cases.first()
        assertFalse(GuestGrant.needsRenewal(t.token, t.notAfterMs - 10L * 24 * 3600 * 1000))
        assertTrue(GuestGrant.needsRenewal(t.token, t.notAfterMs - 3600 * 1000))
        assertTrue(GuestGrant.needsRenewal(t.token, t.notAfterMs + 1))
        assertTrue(GuestGrant.needsRenewal("garbage", 0))
    }

    @Test
    fun `header has the Guest scheme`() {
        assertEquals("Guest abc.def", GuestGrant.authorizationHeader("abc.def"))
    }

    @Test
    fun `issue refuses invalid input`() {
        val ok = GuestGrant.Spec(ByteArray(16), 1, 1, 1)
        GuestGrant.issue("s", ok)
        for (bad in listOf(ok.copy(grantId = ByteArray(15)), ok.copy(scope = ByteArray(65)), ok.copy(depositsPerHour = 70000), ok.copy(bytesPerHour = 5_000_000_000L), ok.copy(notAfterMs = -1))) {
            val failed = runCatching { GuestGrant.issue("s", bad) }.isFailure
            assertTrue(failed)
        }
    }

    @Test
    fun `grant list round-trips, stays index-aligned and drops junk`() {
        val (_, cases) = vectors()
        val a = cases[0].token
        val c = cases[2].token
        val encoded = GuestGrant.encodeList(listOf(a, "", c))
        assertEquals(listOf(a, "", c), GuestGrant.decodeList(encoded, 3))
        assertEquals(listOf(a, ""), GuestGrant.decodeList(encoded, 2))
        assertEquals(listOf(a, "", ""), GuestGrant.decodeList("$a;;junk", 3))
    }
}
