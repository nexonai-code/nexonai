package com.nexonai.unpruuf.domain.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NodeMeshAddressTest {
    private val onion = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.onion"

    @Test fun `only a v3 onion name is an address`() {
        assertTrue(NodeMeshManager.isOnionV3Address(onion))
        for (bad in listOf("", "evil.example.com", "127.0.0.1", "$onion:80", "x.onion", onion.dropLast(7) + "1.onion",
            "A".repeat(56) + ".onion", "$onion\r\nHost: evil", " $onion")) {
            assertFalse(bad, NodeMeshManager.isOnionV3Address(bad))
        }
    }

    @Test fun `a stored connection string yields the address only when it is an onion`() {
        assertEquals(onion, NodeMeshManager.parseAddressConnectionString(NodeMeshManager.NODE_ADDRESS_PREFIX + onion))
        assertEquals(onion, NodeMeshManager.parseAddressConnectionString(" " + NodeMeshManager.NODE_ADDRESS_PREFIX + onion.uppercase() + " "))
        assertNull(NodeMeshManager.parseAddressConnectionString(NodeMeshManager.NODE_ADDRESS_PREFIX + "evil.example.com"))
        assertNull(NodeMeshManager.parseAddressConnectionString(NodeMeshManager.NODE_ADDRESS_PREFIX))
        assertNull(NodeMeshManager.parseAddressConnectionString(onion))
    }
}
