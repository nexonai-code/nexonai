package com.nexonai.unpruuf.domain.network

import com.nexonai.unpruuf.domain.network.NodeMeshManager.Companion.ParsedNodeConnection
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NodePoolTest {

    private fun node(n: Int, server: String) = ParsedNodeConnection("node$n.onion", server)

    @Test
    fun `nodes are spread over different servers first`() {
        val pool = listOf(node(1, "a"), node(2, "a"), node(3, "a"), node(4, "b"), node(5, "c"))
        repeat(200) {
            val picked = NodeMeshManager.chooseNodes(pool, 3)
            assertEquals(3, picked.size)
            // one node per server whenever three servers exist
            assertEquals(setOf("a", "b", "c"), picked.map { addr -> pool.first { it.address == addr }.ownerSecret }.toSet())
        }
    }

    @Test
    fun `one server still fills all three slots`() {
        val pool = listOf(node(1, "a"), node(2, "a"), node(3, "a"), node(4, "a"))
        val picked = NodeMeshManager.chooseNodes(pool, 3)
        assertEquals(3, picked.size)
        assertEquals(3, picked.toSet().size)
    }

    @Test
    fun `small pool returns what exists`() {
        assertEquals(listOf("node1.onion"), NodeMeshManager.chooseNodes(listOf(node(1, "a")), 3))
        assertTrue(NodeMeshManager.chooseNodes(emptyList(), 3).isEmpty())
    }

    @Test
    fun `contacts share nodes - the pick does not look at how often a node is used`() {
        // 30 nodes on 3 servers, 300 contacts: every node ends up carrying several contacts, and
        // load is spread roughly evenly (random, not stuck on the first nodes of the list)
        val pool = (1..30).map { node(it, "s${it % 3}") }
        val count = HashMap<String, Int>()
        val random = kotlin.random.Random(42)
        repeat(300) { NodeMeshManager.chooseNodes(pool, 3, random).forEach { count[it] = (count[it] ?: 0) + 1 } }
        assertEquals(30, count.size)
        // 900 picks over 30 nodes = 30 each on average; nobody is empty, nobody carries a third of it all
        assertTrue(count.values.min() >= 10)
        assertTrue(count.values.max() <= 60)
    }

    @Test
    fun `two contacts rarely get the same three nodes`() {
        val pool = (1..30).map { node(it, "s${it % 3}") }
        val random = kotlin.random.Random(7)
        val sets = (1..100).map { NodeMeshManager.chooseNodes(pool, 3, random).toSet() }.toSet()
        assertTrue(sets.size > 90)
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
