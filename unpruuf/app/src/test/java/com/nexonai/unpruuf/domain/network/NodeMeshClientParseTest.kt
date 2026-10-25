package com.nexonai.unpruuf.domain.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
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
    fun `only v3 onion addresses are node addresses`() {
        assertTrue(NodeMeshClient.isNodeAddress(onion))
        assertFalse(NodeMeshClient.isNodeAddress("firma.example"))
        assertFalse(NodeMeshClient.isNodeAddress("firma.example:80"))
        assertFalse(NodeMeshClient.isNodeAddress("10.0.0.5"))
        assertFalse(NodeMeshClient.isNodeAddress("abcdefghijklmnop.onion"))
        assertFalse(NodeMeshClient.isNodeAddress("${onion}:80"))
    }

    @Test
    fun `a plain host name never becomes a node connection`() {
        val prefix = NodeMeshManager.NODE_ADDRESS_PREFIX
        assertNull(NodeMeshManager.parseAddressConnectionString(prefix + "firma.example"))
        assertEquals(onion, NodeMeshManager.parseAddressConnectionString(prefix + onion))
        assertNull(NodeMeshManager.parseOwnerConnectionString("unpruuf-node-owner:v1:" + "firma.example:80:Secret_0123456789abcdef"))
        assertNotNull(NodeMeshManager.parseOwnerConnectionString("unpruuf-node-owner:v1:" + "$onion:Secret_0123456789abcdef"))
        val file = listOf("unpruuf-node-list:v1", "name: A", "secret: abcdefghijklmnopqrstuvwxyz012345", "count: 1", "", "firma.example").joinToString("\n")
        assertNull(NodeListFile.parse(file))
    }

    @Test
    fun `more is read only from the head of a reply`() {
        assertTrue(NodeMeshClient.parseMore("""{"cursor":42,"more":true,"blobs":{"t":["YQ=="]}}"""))
        assertFalse(NodeMeshClient.parseMore("""{"cursor":42,"blobs":{"t":["YQ=="]}}"""))
        assertFalse(NodeMeshClient.parseMore("""{"blobs":{"t":[]}}"""))
        assertFalse(NodeMeshClient.parseMore("""{"cursor":1,"blobs":{"more":["true"]}}"""))
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
