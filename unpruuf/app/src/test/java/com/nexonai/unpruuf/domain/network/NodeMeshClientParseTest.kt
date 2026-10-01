package com.nexonai.unpruuf.domain.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NodeMeshClientParseTest {
    private val onion = "a".repeat(56) + ".onion"

    @Test
    fun `cursor is read from a fetchMany reply and absent on old nodes`() {
        assertEquals(42L, NodeMeshClient.parseCursor("""{"cursor":42,"blobs":{"t":[]}}"""))
        assertNull(NodeMeshClient.parseCursor("""{"blobs":{"t":[]}}"""))
    }

    @Test
    fun `control address comes with the pool reply of a sealed server`() {
        assertEquals(onion, NodeMeshClient.parseControlAddress("""{"control":"$onion","addresses":["$onion"]}"""))
        assertNull(NodeMeshClient.parseControlAddress("""{"addresses":["$onion"]}"""))
        assertEquals(listOf(onion), NodeMeshClient.parsePoolAddresses("""{"control":"$onion","addresses":["$onion"]}"""))
    }

    @Test
    fun `lock status`() {
        assertTrue(NodeMeshClient.parseLocked("""{"locked":true}"""))
        assertFalse(NodeMeshClient.parseLocked("""{"locked":false}"""))
    }
}
