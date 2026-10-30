package com.nexonai.unpruuf.domain.network

import org.junit.Assert.assertEquals
import org.junit.Test

class MessageTtlTest {

    @Test
    fun `only 1, 6 and 24 hours exist`() {
        assertEquals(listOf(1, 6, 24), MessageTtl.STEPS_HOURS)
    }

    @Test
    fun `nothing stored means 24 hours, and a value that is not a step becomes 24 too`() {
        assertEquals(24, MessageTtl.normalize(null))
        assertEquals(24, MessageTtl.normalize(0))
        assertEquals(24, MessageTtl.normalize(5))
        assertEquals(24, MessageTtl.normalize(48))
        assertEquals(1, MessageTtl.normalize(1))
        assertEquals(6, MessageTtl.normalize(6))
    }

    @Test
    fun `the deposit ttl is in milliseconds`() {
        assertEquals(3_600_000L, MessageTtl.toMillis(1))
        assertEquals(6 * 3_600_000L, MessageTtl.toMillis(6))
        assertEquals(24 * 3_600_000L, MessageTtl.toMillis(null))
    }
}
