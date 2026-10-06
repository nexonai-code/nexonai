package com.nexonai.unpruuf.domain.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Node lists and the file a server exports for them. The fixture below is the real output of the
 * server's buildNodeListFile (node-mesh-server/src/nodeList.ts), so this also proves the Kotlin
 * parser and the TypeScript writer agree.
 */
class NodeListsTest {
    private val fixture = "unpruuf-node-list:v1\nname: Acme GmbH · Server 1\nsecret: Owner_secret_0123456789-AB\n" +
        "control: ctrlbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.onion\ncount: 4\n\n" +
        (1..4).joinToString("") { "node00${it}aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.onion\n" }

    private fun addr(i: Int) = "node00${i}aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.onion"

    @Test
    fun serverFileParsesWithNameSecretControlAndAllAddresses() {
        val f = NodeListFile.parse(fixture)!!
        assertEquals("Acme GmbH · Server 1", f.name)
        assertEquals("Owner_secret_0123456789-AB", f.ownerSecret)
        assertEquals("ctrlbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.onion", f.control)
        assertEquals((1..4).map { addr(it) }, f.addresses)
    }

    @Test
    fun windowsLineEndingsBomAndDuplicatesAreFine() {
        val f = NodeListFile.parse("﻿" + fixture.replace("\n", "\r\n") + addr(1) + "\r\n")!!
        assertEquals(4, f.addresses.size)
    }

    @Test
    fun malformedFilesAreRefused() {
        assertNull(NodeListFile.parse(""))
        assertNull(NodeListFile.parse(fixture.replace("v1", "v2")))
        assertNull(NodeListFile.parse(fixture.replace("Owner_secret_0123456789-AB", "short")))
        assertNull(NodeListFile.parse(fixture.replace("count: 4", "count: 9")))
        assertNull(NodeListFile.parse(fixture + "not an address!\n"))
        assertNull(NodeListFile.parse(fixture.substringBefore("\n\n") + "\n\n"))
        assertNull(NodeListFile.parse("x".repeat(NodeListFile.MAX_CHARS + 1)))
    }

    @Test
    fun aNameWithLineBreaksCannotInjectHeaderLines() {
        val f = NodeListFile.parse(fixture.replace("Acme GmbH · Server 1", "A secret: Evil_secret_0123456789"))!!
        assertEquals("Owner_secret_0123456789-AB", f.ownerSecret)
    }

    @Test
    fun serializeRoundTripsAndDropsSeparators() {
        val lists = listOf(NodeList("id-1", "Kunde A", listOf("a.onion", "b.onion")), NodeList("id-2", "Wien;Zürich", listOf("c.onion")))
        val back = NodeLists.parse(NodeLists.serialize(lists))
        assertEquals("Kunde A", back[0].name)
        assertEquals(listOf("a.onion", "b.onion"), back[0].addresses)
        assertEquals("Wien Zürich", back[1].name)
    }

    @Test
    fun reconcilePutsUnlistedNodesInStandardDropsGhostsAndEmptyLists() {
        var n = 0
        val lists = listOf(
            NodeList("l1", "Kunde A", listOf("a", "b", "ghost")),
            NodeList("l2", "Leer", listOf("gone"))
        )
        val out = NodeLists.reconcile(lists, listOf("a", "b", "c", "d"), { "new${n++}" })
        assertEquals(listOf("Kunde A", NodeLists.DEFAULT_NAME), out.map { it.name })
        assertEquals(listOf("a", "b"), out[0].addresses)
        assertEquals(listOf("c", "d"), out[1].addresses)
        // running it again changes nothing
        assertEquals(out, NodeLists.reconcile(out, listOf("a", "b", "c", "d"), { "new${n++}" }))
        // no pool at all: no lists
        assertTrue(NodeLists.reconcile(out, emptyList(), { "x" }).isEmpty())
    }

    @Test
    fun aNodeBelongsToExactlyOneListEvenIfTheStoredDataSaysOtherwise() {
        val out = NodeLists.reconcile(
            listOf(NodeList("l1", "A", listOf("x", "y")), NodeList("l2", "B", listOf("y", "z"))),
            listOf("x", "y", "z"), { "n" }
        )
        assertEquals(listOf("x", "y"), out[0].addresses)
        assertEquals(listOf("z"), out[1].addresses)
    }

    @Test
    fun assignMovesNodesIntoAnExistingOrNewListAndDeletesLeftoverEmptyOnes() {
        val lists = listOf(NodeList("l1", "A", listOf("x", "y")), NodeList("l2", "B", listOf("z")))
        val moved = NodeLists.assign(lists, listOf("z"), "l1", "ignored")
        assertEquals(1, moved.size)
        assertEquals(listOf("x", "y", "z"), moved[0].addresses)
        val created = NodeLists.assign(lists, listOf("y"), "l3", "Neu")
        assertEquals("Neu", created.first { it.id == "l3" }.name)
        assertEquals(listOf("x"), created.first { it.id == "l1" }.addresses)
        assertEquals("l3", NodeLists.listOf(created, "y")!!.id)
    }

    @Test
    fun renameKeepsTheOldNameForABlankOne_andMigrationKeepsMembership() {
        val lists = listOf(NodeList("l1", "A", listOf("x", "y")))
        assertEquals("A", NodeLists.rename(lists, "l1", "  ")[0].name)
        assertEquals("Kunde", NodeLists.rename(lists, "l1", "Kunde")[0].name)
        assertEquals(listOf("x", "y2"), NodeLists.replaceAddress(lists, "y", "y2")[0].addresses)
    }

    @Test
    fun aContactsThreeNodesComeFromOneListSpreadOverItsServers() {
        // two servers in the list, a third server outside it
        val pool = listOf(
            NodeMeshManager.Companion.ParsedNodeConnection("a1", "S1"), NodeMeshManager.Companion.ParsedNodeConnection("a2", "S1"),
            NodeMeshManager.Companion.ParsedNodeConnection("b1", "S2"), NodeMeshManager.Companion.ParsedNodeConnection("b2", "S2"),
            NodeMeshManager.Companion.ParsedNodeConnection("c1", "S3")
        )
        val members = setOf("a1", "a2", "b1", "b2")
        val picked = NodeMeshManager.chooseNodes(pool.filter { it.address in members }, emptyMap(), 3)
        assertEquals(3, picked.size)
        assertTrue(picked.all { it in members })
        assertEquals(2, picked.map { addr -> pool.first { it.address == addr }.ownerSecret }.distinct().size)
        // least-used nodes win inside the list
        val usage = mapOf("a1" to 5, "b1" to 5, "a2" to 0, "b2" to 0)
        assertEquals(setOf("a2", "b2"), NodeMeshManager.chooseNodes(pool.filter { it.address in members }, usage, 2).toSet())
        assertNotNull(picked.firstOrNull())
    }

    @Test
    fun capacityIsHowManyContactsGetNodesOfTheirOwn() {
        assertEquals(0, NodeLists.capacity(emptyList()))
        assertEquals(1, NodeLists.capacity(listOf(5)))          // 5 nodes: one contact, the next shares
        assertEquals(8, NodeLists.capacity(listOf(25)))         // one server of 25
        assertEquals(33, NodeLists.capacity(listOf(100)))
        assertEquals(83, NodeLists.capacity(listOf(250)))       // one full server
        assertEquals(166, NodeLists.capacity(listOf(250, 250))) // two servers: triples may share a server
        assertEquals(250, NodeLists.capacity(listOf(250, 250, 250))) // the 3 x 250 case: one node per server per contact
        assertEquals(25, NodeLists.capacity(listOf(25, 25, 25)))
    }

    @Test
    fun anUnbalancedListIsLimitedByItsSmallServers() {
        // 250 + 25 + 25: each contact needs a node on three different servers, the two small ones run out at 25
        assertEquals(25, NodeLists.capacity(listOf(250, 25, 25)))
        assertEquals(100, NodeLists.capacity(listOf(100, 100, 100, 5)))
        assertEquals(0, NodeLists.capacity(listOf(0, 0, 0)))
    }
}
