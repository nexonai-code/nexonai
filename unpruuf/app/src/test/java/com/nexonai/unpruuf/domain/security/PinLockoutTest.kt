package com.nexonai.unpruuf.domain.security

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PinLockoutTest {
    @Test fun firstFourWrongTriesAreFree() {
        for (n in 1..4) assertNull("try $n", PinManager.lockDelayMs(n))
    }

    @Test fun fifthWrongTryLocksForThirtySecondsAndItDoublesFromThere() {
        assertEquals(30_000L, PinManager.lockDelayMs(5))
        assertEquals(60_000L, PinManager.lockDelayMs(6))
        assertEquals(120_000L, PinManager.lockDelayMs(7))
        assertEquals(240_000L, PinManager.lockDelayMs(8))
    }

    @Test fun neverLocksLongerThanOneHour() {
        assertEquals(60 * 60 * 1000L, PinManager.lockDelayMs(30))
        assertEquals(60 * 60 * 1000L, PinManager.lockDelayMs(10_000))
    }
}
