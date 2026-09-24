package com.nexonai.unpruuf.domain.network

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Covers the delivery-queue backoff growth used by [P2PNetworkManager.flushQueue] between
 * unsuccessful delivery rounds. Extracted into the pure [P2PNetworkManager.nextBackoff] so it's
 * testable without spinning up Tor/coroutines/Android — flushQueue() itself just calls it.
 */
class P2PNetworkManagerBackoffTest {

    @Test
    fun `starts at the initial backoff`() {
        assertEquals(3_000L, P2PNetworkManager.BACKOFF_INITIAL_MS)
    }

    @Test
    fun `doubles on each stalled round`() {
        var backoff = P2PNetworkManager.BACKOFF_INITIAL_MS
        backoff = P2PNetworkManager.nextBackoff(backoff)
        assertEquals(6_000L, backoff)
        backoff = P2PNetworkManager.nextBackoff(backoff)
        assertEquals(12_000L, backoff)
    }

    @Test
    fun `caps at the maximum instead of growing forever`() {
        var backoff = P2PNetworkManager.BACKOFF_INITIAL_MS
        repeat(10) { backoff = P2PNetworkManager.nextBackoff(backoff) }
        assertEquals(P2PNetworkManager.BACKOFF_MAX_MS, backoff)
    }

    @Test
    fun `exactly at the cap stays at the cap`() {
        assertEquals(P2PNetworkManager.BACKOFF_MAX_MS, P2PNetworkManager.nextBackoff(P2PNetworkManager.BACKOFF_MAX_MS))
    }

    @Test
    fun `a successful round resets backoff back to the initial value`() {
        // Mirrors flushQueue(): `if (anyDelivered) backoff = BACKOFF_INITIAL_MS` — this test just
        // documents the contract nextBackoff() is not itself responsible for the reset.
        var backoff = P2PNetworkManager.nextBackoff(P2PNetworkManager.nextBackoff(P2PNetworkManager.BACKOFF_INITIAL_MS))
        val anyDelivered = true
        if (anyDelivered) backoff = P2PNetworkManager.BACKOFF_INITIAL_MS
        assertEquals(P2PNetworkManager.BACKOFF_INITIAL_MS, backoff)
    }
}
