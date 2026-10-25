package com.nexonai.unpruuf.domain.network

import org.junit.Assert.assertEquals
import org.junit.Test

class NodeMeshWindowTest {
    private val current = 500_000L
    private val full = (0..25).map { current - it } // newest first, 26 epochs, as nodeMeshToleranceEpochs gives

    @Test fun firstPollAfterTheAppStartedAsksForTheFullWindow() {
        assertEquals(full, NodeMeshWindow.epochs(current, null, full))
    }

    @Test fun inTheSteadyStateOnlyTheEpochBeforeAndTheCurrentOneAreAsked() {
        assertEquals(listOf(current, current - 1), NodeMeshWindow.epochs(current, current, full))
    }

    @Test fun anHourLaterThreeEpochsCoverTheBoundary() {
        assertEquals(listOf(current, current - 1, current - 2), NodeMeshWindow.epochs(current, current - 1, full))
    }

    @Test fun afterAGapTheWindowReachesBackToTheLastCompletePoll() {
        // Last complete poll 5 hours ago: from 6 epochs back (one before it) up to now.
        assertEquals((0..6).map { current - it }, NodeMeshWindow.epochs(current, current - 5, full))
    }

    @Test fun aGapLongerThanTheRetentionIsTheFullWindowNeverMore() {
        assertEquals(full, NodeMeshWindow.epochs(current, current - 30, full))
        assertEquals(full, NodeMeshWindow.epochs(current, current - 24, full))
        assertEquals(26, NodeMeshWindow.epochs(current, current - 24, full).size)
    }

    @Test fun aClockThatWentBackwardsFallsBackToTheFullWindow() {
        assertEquals(full, NodeMeshWindow.epochs(current, current + 3, full))
    }

    @Test fun neverEmptyAndAlwaysIncludesTheCurrentEpoch() {
        for (last in listOf(null, current - 40, current - 10, current - 1, current, current + 1)) {
            val w = NodeMeshWindow.epochs(current, last, full)
            assertEquals("last=$last", current, w.first())
            assertEquals("last=$last", w.sortedDescending(), w)
        }
    }
}
