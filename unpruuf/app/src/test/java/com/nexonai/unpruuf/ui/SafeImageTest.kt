package com.nexonai.unpruuf.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class SafeImageTest {
    @Test fun ordinaryPhotosAreDecodedAtReducedSize() {
        assertEquals(1, SafeImage.sampleSizeFor(1600, 1200))
        assertEquals(1, SafeImage.sampleSizeFor(4000, 3000))
        assertEquals(2, SafeImage.sampleSizeFor(8000, 6000))
        assertEquals(2, SafeImage.sampleSizeFor(6000, 6000))
    }

    @Test fun absurdOrBrokenSizesAreRefused() {
        assertEquals(0, SafeImage.sampleSizeFor(0, 100))
        assertEquals(0, SafeImage.sampleSizeFor(-5, 100))
        assertEquals(0, SafeImage.sampleSizeFor(30_000, 30_000))
        assertEquals(0, SafeImage.sampleSizeFor(25_000, 10))
        assertEquals(0, SafeImage.sampleSizeFor(9_000, 9_000))
    }
}
