package com.nexonai.unpruuf.domain.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Coverage for [RelayManager]'s relay-pool list helpers (added alongside the 2-entry pairing
 * pool feature — see CROSS_PLATFORM_PLAN.md). Deliberately only exercises the companion-object
 * pure functions ([RelayManager.buildConnectionStringList]/[RelayManager.parseConnectionStringList]/
 * [RelayManager.parseConnectionString]), never an actual [RelayManager] instance — that needs a
 * real `Context` (`SharedPreferences`), which this project's plain-JUnit unit tests don't set up
 * (no Robolectric here, matching every other test in this package).
 */
class RelayManagerListTest {

    private val relay1 = "unpruuf-relay:v1:abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuv.onion:tok3n1"
    private val relay2 = "unpruuf-relay:v1:zyxwvutsrqponmlkjihgfedcba765432zyxwvutsrqponmlkjihgf.onion:tok3n2"
    private val relay3 = "unpruuf-relay:v1:thirdrelay0123456789abcdefghijklmnopqrstuvwxyz012345.onion:tok3n3"

    @Test
    fun `builds and parses a two-entry list round-trip`() {
        val joined = RelayManager.buildConnectionStringList(listOf(relay1, relay2))
        assertEquals("$relay1;$relay2", joined)
        assertEquals(listOf(relay1, relay2), RelayManager.parseConnectionStringList(joined))
    }

    @Test
    fun `build caps at RELAY_POOL_MAX_SIZE even with more entries given`() {
        val joined = RelayManager.buildConnectionStringList(listOf(relay1, relay2, relay3))
        assertEquals("$relay1;$relay2", joined)
    }

    @Test
    fun `build drops blank entries and trims whitespace`() {
        val joined = RelayManager.buildConnectionStringList(listOf("  $relay1  ", "", "   ", relay2))
        assertEquals("$relay1;$relay2", joined)
    }

    @Test
    fun `parse handles a single pre-pool entry (no semicolon) as a valid one-element list`() {
        assertEquals(listOf(relay1), RelayManager.parseConnectionStringList(relay1))
    }

    @Test
    fun `parse handles an empty string as an empty list`() {
        assertTrue(RelayManager.parseConnectionStringList("").isEmpty())
    }

    @Test
    fun `parse drops empty segments from a trailing or double semicolon`() {
        assertEquals(listOf(relay1, relay2), RelayManager.parseConnectionStringList("$relay1;;$relay2;"))
    }

    @Test
    fun `parse does not itself validate entries — malformed text passes through`() {
        // By design (see RelayManager.parseConnectionStringList's doc comment) — callers that
        // need only well-formed entries filter with parseConnectionString() themselves, so one
        // bad entry in a list doesn't silently drop the still-good ones here.
        assertEquals(listOf(relay1, "not-a-relay-string"), RelayManager.parseConnectionStringList("$relay1;not-a-relay-string"))
    }

    @Test
    fun `parseConnectionString accepts a bare onion address`() {
        val parsed = RelayManager.parseConnectionString(relay1)
        assertEquals("abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuv.onion", parsed?.address)
        assertEquals("tok3n1", parsed?.authToken)
    }

    @Test
    fun `parseConnectionString accepts a host colon port address`() {
        val raw = "unpruuf-relay:v1:example.com:8443:tok3n"
        val parsed = RelayManager.parseConnectionString(raw)
        assertEquals("example.com:8443", parsed?.address)
        assertEquals("tok3n", parsed?.authToken)
    }

    @Test
    fun `parseConnectionString rejects a missing prefix`() {
        assertNull(RelayManager.parseConnectionString("not-a-relay-string"))
    }

    @Test
    fun `parseConnectionString rejects a missing auth token`() {
        assertNull(RelayManager.parseConnectionString("unpruuf-relay:v1:onlyaddress.onion:"))
    }
}
