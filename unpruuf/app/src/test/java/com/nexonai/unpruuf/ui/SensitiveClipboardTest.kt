package com.nexonai.unpruuf.ui

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SensitiveClipboardTest {
    @Test fun ourOwnClipIsCleared() = assertTrue(SensitiveClipboard.shouldClear(true, "CODE", "CODE"))

    @Test fun somethingTheUserCopiedInBetweenIsLeftAlone() = assertFalse(SensitiveClipboard.shouldClear(true, "shopping list", "CODE"))

    @Test fun anUnreadableClipboardInTheBackgroundIsCleared() = assertTrue(SensitiveClipboard.shouldClear(false, null, "CODE"))

    @Test fun anEmptyClipboardIsClearedHarmlessly() = assertTrue(SensitiveClipboard.shouldClear(true, null, "CODE"))
}
