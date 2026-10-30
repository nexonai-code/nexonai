package com.nexonai.unpruuf.domain.network

/**
 * Named groups of this device's own nodes ("lists"). When a contact is added you pick ONE list and
 * the contact gets three nodes from it (picked at random, spread over as many different servers of
 * that list as possible — see [NodeMeshManager.chooseNodes]). Contacts of one list share its nodes.
 * That makes it explicit which servers can carry which contacts, e.g. one list per customer or site.
 *
 * Rules: every node address belongs to exactly one list; a list with no nodes does not exist; a
 * list can hold the nodes of several servers (so one contact's three nodes need not all sit at one
 * hosting provider). This file is pure — storage lives in [NodeMeshManager].
 */
data class NodeList(val id: String, val name: String, val addresses: List<String>)

object NodeLists {
    const val DEFAULT_NAME = "Standard"
    const val MAX_NAME = 60

    /** Names are shown and stored on one line; no separators that the storage format uses. */
    fun cleanName(raw: String): String =
        raw.replace(Regex("[\\r\\n\\t;|]+"), " ").trim().take(MAX_NAME)

    // One line per list: id <TAB> name <TAB> addr;addr;…   (addresses never contain ';' or tabs)
    fun serialize(lists: List<NodeList>): String =
        lists.joinToString("\n") { "${it.id}\t${cleanName(it.name)}\t${it.addresses.joinToString(";")}" }

    fun parse(raw: String): List<NodeList> =
        raw.split("\n").mapNotNull { line ->
            val p = line.split("\t")
            if (p.size != 3 || p[0].isBlank()) return@mapNotNull null
            NodeList(p[0], cleanName(p[1]).ifEmpty { DEFAULT_NAME }, p[2].split(";").filter { it.isNotBlank() })
        }

    /**
     * Makes the lists match the real pool: addresses that no longer exist are dropped, a node that
     * sits in no list (e.g. added by scanning an owner QR, or from before lists existed) goes into
     * the list called [DEFAULT_NAME], empty lists vanish, and a node can only be in one list.
     */
    fun reconcile(lists: List<NodeList>, pool: List<String>, newId: () -> String): List<NodeList> {
        val inPool = pool.toSet()
        val seen = mutableSetOf<String>()
        val cleaned = lists.map { l ->
            l.copy(addresses = l.addresses.filter { it in inPool && seen.add(it) })
        }.toMutableList()
        val unlisted = pool.filter { it !in seen }
        if (unlisted.isNotEmpty()) {
            val i = cleaned.indexOfFirst { it.name == DEFAULT_NAME }
            if (i >= 0) cleaned[i] = cleaned[i].copy(addresses = cleaned[i].addresses + unlisted)
            else cleaned += NodeList(newId(), DEFAULT_NAME, unlisted)
        }
        return cleaned.filter { it.addresses.isNotEmpty() }
    }

    /** Moves [addresses] into list [listId], creating it as [newName] if it does not exist yet. */
    fun assign(lists: List<NodeList>, addresses: List<String>, listId: String, newName: String): List<NodeList> {
        val moving = addresses.toSet()
        val without = lists.map { it.copy(addresses = it.addresses.filter { a -> a !in moving }) }
        val target = without.find { it.id == listId }
        val updated = if (target != null) {
            without.map { if (it.id == listId) it.copy(addresses = it.addresses + addresses.distinct()) else it }
        } else {
            without + NodeList(listId, cleanName(newName).ifEmpty { DEFAULT_NAME }, addresses.distinct())
        }
        return updated.filter { it.addresses.isNotEmpty() }
    }

    fun listOf(lists: List<NodeList>, address: String): NodeList? = lists.find { address in it.addresses }

    fun rename(lists: List<NodeList>, listId: String, name: String): List<NodeList> {
        val clean = cleanName(name)
        return if (clean.isEmpty()) lists else lists.map { if (it.id == listId) it.copy(name = clean) else it }
    }

    fun replaceAddress(lists: List<NodeList>, old: String, new: String): List<NodeList> =
        lists.map { l -> l.copy(addresses = l.addresses.map { if (it == old) new else it }) }
}
