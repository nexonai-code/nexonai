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

    @Test fun movingTheDateForwardDoesNotShortenAPause() {
        // Locked for 30 s at wall 1_000_000 / monotonic 5_000; the date is moved a day ahead, 2 s really pass.
        val day = 86_400_000L
        assertEquals(28_000L, PinManager.remainingLockMs(1_030_000L, 1_000_000L + day + 2_000L, 30_000L, 5_000L, 7_000L))
    }

    @Test fun theLongerOfTheTwoClocksWins() {
        // The date is moved back an hour: the wall clock now says a long time is left, and that is what counts.
        assertEquals(3_630_000L, PinManager.remainingLockMs(1_030_000L, 1_030_000L - 3_630_000L, 30_000L, 5_000L, 5_000L))
    }

    @Test fun afterARestartOnlyTheWallClockCounts() {
        // elapsedRealtime started again (now < at lock): the monotonic part is void.
        assertEquals(10_000L, PinManager.remainingLockMs(1_030_000L, 1_020_000L, 30_000L, 900_000L, 3_000L))
        assertEquals(0L, PinManager.remainingLockMs(1_030_000L, 1_040_000L, 30_000L, 900_000L, 3_000L))
    }

    @Test fun anOldInstallWithoutTheMonotonicFieldsStillWorks() {
        assertEquals(5_000L, PinManager.remainingLockMs(1_005_000L, 1_000_000L, 0L, -1L, 100L))
        assertEquals(0L, PinManager.remainingLockMs(0L, 1_000_000L, 0L, -1L, 100L))
    }

    @Test fun anExpiredPauseIsOver() {
        assertEquals(0L, PinManager.remainingLockMs(1_030_000L, 1_031_000L, 30_000L, 5_000L, 40_000L))
    }
}
