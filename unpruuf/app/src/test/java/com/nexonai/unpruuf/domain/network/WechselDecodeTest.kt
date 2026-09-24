package com.nexonai.unpruuf.domain.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Regression coverage for a real bug: [P2PNetworkManager.parseWechselSignal] used to split the
 * "<generation>:<newRelayConnectionString>" payload at the LAST colon instead of the FIRST. A
 * real relay connection string (`unpruuf-relay:v1:address:token`) contains multiple internal
 * colons, so the old code always grabbed only the trailing auth token as "the relay" and
 * everything else as "the generation" — which then failed `toLongOrNull()`, silently no-opping
 * the whole branch. No test caught this until now. Matches iOS's ControlSignals.decodeWechsel,
 * which has always split at the first colon.
 */
class WechselDecodeTest {

    private val realRelay = "unpruuf-relay:v1:abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuv.onion:tok3n"

    @Test
    fun `decodes a real multi-colon relay connection string correctly`() {
        val result = P2PNetworkManager.parseWechselSignal("7:$realRelay")
        assertEquals(7L to realRelay, result)
    }

    @Test
    fun `the old last-colon split would have failed this exact case`() {
        // Documents the bug directly: splitting at the LAST colon on this payload yields
        // "7:unpruuf-relay:v1:abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuv.onion" as
        // the "generation" (not a valid Long) and "tok3n" as "the relay" (not a valid connection
        // string) — both defensive checks would have rejected it, silently.
        val rest = "7:$realRelay"
        val lastColon = rest.lastIndexOf(':')
        val brokenGeneration = rest.substring(0, lastColon).toLongOrNull()
        assertNull("last-colon split must not yield a parseable generation", brokenGeneration)
    }

    @Test
    fun `rejects a missing colon`() {
        assertNull(P2PNetworkManager.parseWechselSignal("7"))
    }

    @Test
    fun `rejects a non-numeric generation`() {
        assertNull(P2PNetworkManager.parseWechselSignal("abc:$realRelay"))
    }

    @Test
    fun `rejects an empty relay portion`() {
        assertNull(P2PNetworkManager.parseWechselSignal("7:"))
    }

    @Test
    fun `rejects a relay portion that isn't a valid connection string`() {
        assertNull(P2PNetworkManager.parseWechselSignal("7:not-a-relay-string"))
    }

    @Test
    fun `accepts generation zero`() {
        val result = P2PNetworkManager.parseWechselSignal("0:$realRelay")
        assertEquals(0L to realRelay, result)
    }
}
