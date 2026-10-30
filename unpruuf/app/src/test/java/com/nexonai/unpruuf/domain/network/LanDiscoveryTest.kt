package com.nexonai.unpruuf.domain.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LanDiscoveryTest {

    @Test
    fun `announced name never contains the app name or the user id`() {
        val userId = "a1b2c3d4-e5f6-7890-abcd-ef0123456789"
        val name = LanDiscovery.serviceName(userId, 480_000L)
        assertEquals(16, name.length)
        assertTrue(name.all { it in "0123456789abcdef" })
        assertFalse(name.contains("unpruuf"))
        assertFalse(name.contains(userId.take(8)))
        assertFalse(LanDiscovery.SERVICE_TYPE.contains("unpruuf"))
    }

    @Test
    fun `name changes every hour and differs per device`() {
        assertNotEquals(LanDiscovery.serviceName("device-a", 1L), LanDiscovery.serviceName("device-a", 2L))
        assertNotEquals(LanDiscovery.serviceName("device-a", 1L), LanDiscovery.serviceName("device-b", 1L))
        assertEquals(LanDiscovery.serviceName("device-a", 7L), LanDiscovery.serviceName("device-a", 7L))
    }

    @Test
    fun `a contact still matches across an hour boundary`() {
        val announcedLastHour = LanDiscovery.serviceName("peer", 99L)
        assertTrue(announcedLastHour in LanDiscovery.candidateNames("peer", 100L))
        assertFalse(LanDiscovery.serviceName("stranger", 100L) in LanDiscovery.candidateNames("peer", 100L))
    }
}
