package com.nexonai.unpruuf.domain.network

import com.nexonai.unpruuf.domain.network.NodeMeshManager.Companion.ParsedNodeConnection
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NodePoolTest {

    private fun node(n: Int, server: String) = ParsedNodeConnection("node$n.onion", server)

    @Test
    fun `new contact gets the least used nodes`() {
        val pool = (1..6).map { node(it, "s1") }
        val usage = mapOf("node1.onion" to 2, "node2.onion" to 1, "node3.onion" to 1)
        val picked = NodeMeshManager.chooseNodes(pool, usage, 3)
        assertEquals(listOf("node4.onion", "node5.onion", "node6.onion"), picked)
    }

    @Test
    fun `nodes are spread over different servers first`() {
        val pool = listOf(node(1, "a"), node(2, "a"), node(3, "a"), node(4, "b"), node(5, "c"))
        val picked = NodeMeshManager.chooseNodes(pool, emptyMap(), 3)
        assertEquals(listOf("node1.onion", "node4.onion", "node5.onion"), picked)
    }

    @Test
    fun `one server still fills all three slots`() {
        val pool = listOf(node(1, "a"), node(2, "a"), node(3, "a"), node(4, "a"))
        assertEquals(3, NodeMeshManager.chooseNodes(pool, emptyMap(), 3).size)
    }

    @Test
    fun `small pool returns what exists`() {
        assertEquals(listOf("node1.onion"), NodeMeshManager.chooseNodes(listOf(node(1, "a")), emptyMap(), 3))
        assertTrue(NodeMeshManager.chooseNodes(emptyList(), emptyMap(), 3).isEmpty())
    }

    @Test
    fun `ten contacts on thirty nodes never share a node`() {
        val pool = (1..30).map { node(it, "s${it % 3}") }
        val usage = HashMap<String, Int>()
        val all = mutableListOf<String>()
        repeat(10) {
            val picked = NodeMeshManager.chooseNodes(pool, usage, 3)
            picked.forEach { usage[it] = (usage[it] ?: 0) + 1 }
            all += picked
        }
        assertEquals(30, all.toSet().size)
    }

    @Test
    fun `pool answer keeps only v3 onion addresses`() {
        val a = "a".repeat(56) + ".onion"
        val b = "b".repeat(56) + ".onion"
        val body = """{"addresses":["$a","$b","evil.example.com","$a"]}"""
        assertEquals(listOf(a, b), NodeMeshClient.parsePoolAddresses(body))
        assertTrue(NodeMeshClient.parsePoolAddresses("{}").isEmpty())
    }
}
