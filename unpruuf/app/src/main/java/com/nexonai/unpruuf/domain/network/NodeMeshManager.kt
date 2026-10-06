package com.nexonai.unpruuf.domain.network

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Settings for this device's OWN Node-Mesh nodes (unpruuf Business — see NODE_MESH_SPEC.md).
 * Structurally different from [RelayManager] in exactly the way the spec calls for: a relay's
 * address+token pair is meant to be shared with every contact so they can push to it; a
 * Node-Mesh node's address+ownerSecret pair is the opposite — the address is what gets
 * advertised (contacts poll it), the owner secret NEVER leaves this device (see
 * `node-mesh-server/README.md`'s API table). That split is why this class deliberately keeps
 * two separate string formats/prefixes instead of one, unlike [RelayManager]'s single
 * `unpruuf-relay:v1:<address>:<token>` shape — reusing that shape here would make it trivially
 * easy to accidentally paste an owner-secret-bearing string into a pairing QR.
 */
@Singleton
class NodeMeshManager @Inject constructor(
    @ApplicationContext context: Context
) {
    private val prefs = context.getSharedPreferences("node_mesh", Context.MODE_PRIVATE)

    /** Every own-node connection this device is configured with (address + owner secret),
     *  `;`-joined in the `NODE_OWNER_PREFIX` form — set up once per node via [addMyNode]
     *  (typically by scanning/pasting the string a Node-Mesh server prints on first start,
     *  analogous to [RelayManager]'s relay setup flow). */
    fun getMyNodePool(): List<ParsedNodeConnection> =
        parseNodeConnectionStringList(prefs.getString("my_nodes", "") ?: "")
            .mapNotNull { parseOwnerConnectionString(it) }
            .take(OWN_NODES_MAX)

    private fun getMyNodeConnectionStrings(): List<String> =
        parseNodeConnectionStringList(prefs.getString("my_nodes", "") ?: "")

    /**
     * Adds one of this device's own nodes from a scanned/pasted `unpruuf-node-owner:v1:...`
     * string (what a Node-Mesh server prints at setup — see `node-mesh-server/README.md`).
     * Returns false (and stores nothing) if [raw] doesn't parse, or if the pool is already at
     * [OWN_NODES_MAX]. Deduplicates by address — re-adding the same node (e.g. after rotating
     * its owner secret) replaces the old entry rather than creating a second one. The scanned
     * node is also remembered as a pool source, so its sibling nodes can be imported (see
     * [importSiblings]).
     */
    fun addMyNode(raw: String): Boolean {
        val parsed = parseOwnerConnectionString(raw) ?: return false
        if (!addMyNodes(listOf(parsed.address), parsed.ownerSecret)) return false
        val sources = getPoolSources().filter { it.address != parsed.address } + parsed
        prefs.edit().putString("pool_sources", sources.joinToString(";") { buildOwnerConnectionString(it) }).apply()
        return true
    }

    /** Adds every address in [addresses] under one owner secret (one server's nodes). Returns
     *  false if nothing could be added because the pool is full. */
    fun addMyNodes(addresses: List<String>, ownerSecret: String, listId: String? = null): Boolean {
        val incoming = addresses.map { it.trim() }.filter { it.isNotEmpty() }.distinct()
        if (incoming.isEmpty()) return false
        val existing = getMyNodeConnectionStrings().mapNotNull { parseOwnerConnectionString(it) }
        val kept = existing.filter { e -> incoming.none { it == e.address } }
        val room = OWN_NODES_MAX - kept.size
        if (room <= 0) return false
        val added = incoming.take(room)
        val updated = (kept + added.map { ParsedNodeConnection(it, ownerSecret) })
            .map { buildOwnerConnectionString(it) }
        prefs.edit().putString("my_nodes", updated.joinToString(";")).apply()
        // Nodes that came along with an existing list (siblings of a known server) stay in it.
        if (listId != null) saveNodeLists(NodeLists.assign(loadNodeLists(), added, listId, NodeLists.DEFAULT_NAME))
        return true
    }

    /** The node strings scanned from servers' setup pages — each one can list its siblings. */
    fun getPoolSources(): List<ParsedNodeConnection> =
        parseNodeConnectionStringList(prefs.getString("pool_sources", "") ?: "")
            .mapNotNull { parseOwnerConnectionString(it) }

    /** Asks each pool source for every node its server runs and adds the ones not known yet.
     *  A server that doesn't answer (offline, or an older node without GET /pool) is skipped —
     *  the node scanned from it stays usable on its own. Returns how many nodes were added. */
    suspend fun importSiblings(client: NodeMeshClient): Int {
        val before = getMyNodePool().size
        for (source in getPoolSources()) {
            val info = client.listPoolWithControl(source.address, source.ownerSecret) ?: continue
            addMyNodes(info.addresses, source.ownerSecret, NodeLists.listOf(getNodeLists(), source.address)?.id)
            info.controlAddress?.let { setControlAddress(source.address, it) }
        }
        return getMyNodePool().size - before
    }

    // ─── Sealed servers (node-mesh-server NODE_MESH_KEY_STORAGE=sealed) ──────────────────────
    // Such a server keeps its node keys only encrypted under the owner secret: after a restart
    // its nodes stay offline until this app unlocks it over the server's control address. The
    // control address comes with GET /pool and is stored per pool source (= per server).

    /** A restarted server waiting for its owner. [sourceAddress] identifies it in the pool. */
    data class LockedServer(val sourceAddress: String, val controlAddress: String, val nodeCount: Int)

    fun getControlAddresses(): Map<String, String> =
        (prefs.getString("control_addresses", "") ?: "").split(";")
            .mapNotNull { e -> e.split("=").takeIf { it.size == 2 && it[0].isNotBlank() && it[1].isNotBlank() }?.let { it[0] to it[1] } }
            .toMap()

    private fun setControlAddress(sourceAddress: String, controlAddress: String) {
        val updated = getControlAddresses() + (sourceAddress to controlAddress)
        prefs.edit().putString("control_addresses", updated.entries.joinToString(";") { "${it.key}=${it.value}" }).apply()
    }

    /** Asks every known control address whether its server is locked. Sends nothing secret. */
    fun findLockedServers(client: NodeMeshClient): List<LockedServer> {
        val sources = getPoolSources().associateBy { it.address }
        val pool = getMyNodePool()
        return getControlAddresses().mapNotNull { (sourceAddress, control) ->
            val source = sources[sourceAddress] ?: return@mapNotNull null
            if (client.lockStatus(control) != true) return@mapNotNull null
            LockedServer(sourceAddress, control, pool.count { it.ownerSecret == source.ownerSecret })
        }
    }

    /** Sends the owner secret of [server] to its control address. Only call after the user
     *  confirmed it. True if the server accepted it and its nodes are coming back online. */
    fun unlockServer(client: NodeMeshClient, server: LockedServer): Boolean {
        val source = getPoolSources().find { it.address == server.sourceAddress } ?: return false
        val addresses = client.unlock(server.controlAddress, source.ownerSecret) ?: return false
        if (addresses.isNotEmpty()) addMyNodes(addresses, source.ownerSecret)
        return true
    }

    /**
     * Picks up to [NODE_POOL_MAX_SIZE] own nodes for a new contact FROM ONE LIST: the least-used
     * ones first ([usage] = how many existing contacts already have each address), spread over as
     * many different servers (owner secrets) of that list as possible, ties broken at random. With
     * enough nodes every contact ends up on nodes no other contact knows.
     */
    fun chooseNodesForNewContact(listId: String, usage: Map<String, Int>): List<String> {
        val members = getNodeLists().find { it.id == listId }?.addresses?.toSet() ?: return emptyList()
        return chooseNodes(getMyNodePool().filter { it.address in members }.shuffled(), usage, NODE_POOL_MAX_SIZE)
    }

    // ─── Node lists (named groups of own nodes — see NodeLists.kt) ─────────────────────────────
    // Stored beside the flat pool, never instead of it: the pool (address + owner secret) is what
    // deposits use, the lists only decide which nodes a NEW contact is given.

    private fun loadNodeLists(): List<NodeList> = NodeLists.parse(prefs.getString("node_lists", "") ?: "")

    private fun saveNodeLists(lists: List<NodeList>) {
        prefs.edit().putString("node_lists", NodeLists.serialize(lists)).apply()
    }

    private fun newListId(): String = java.util.UUID.randomUUID().toString()

    /** The lists, always consistent with the real pool (a node that has no list yet — scanned by
     *  owner QR, or from before lists existed — lands in "Standard"). */
    fun getNodeLists(): List<NodeList> {
        val stored = loadNodeLists()
        val reconciled = NodeLists.reconcile(stored, getMyNodePool().map { it.address }, ::newListId)
        if (reconciled != stored) saveNodeLists(reconciled)
        return reconciled
    }

    /** How many different servers (distinct owner secrets) the nodes of [list] sit on. */
    fun serverCount(list: NodeList): Int {
        val members = list.addresses.toSet()
        return getMyNodePool().filter { it.address in members }.map { it.ownerSecret }.distinct().size
    }

    /** Contacts the list can carry with nodes of their own — see [NodeLists.capacity]. */
    fun listCapacity(list: NodeList): Int {
        val members = list.addresses.toSet()
        val sizes = getMyNodePool().filter { it.address in members }.groupingBy { it.ownerSecret }.eachCount().values.toList()
        return NodeLists.capacity(sizes)
    }

    // ─── Company list feeds (FeedCrypto.kt, FeedSources.kt) ──────────────────────────────────────
    // A feed keeps lists up to date: each list in the feed becomes a managed list on this device.

    fun getFeedSources(): List<FeedSource> = FeedSource.parse(prefs.getString("feed_sources", "") ?: "")

    private fun saveFeedSources(list: List<FeedSource>) {
        prefs.edit().putString("feed_sources", FeedSource.serialize(list)).apply()
    }

    /** Adds the feed a pasted feed code describes. Null if the code is not valid or already added. */
    fun addFeedSource(code: String): FeedSource? {
        val source = FeedSource.fromCode(code, newListId()) ?: return null
        val existing = getFeedSources()
        if (existing.any { it.addressSeed == source.addressSeed }) return null
        saveFeedSources(existing + source)
        return source
    }

    fun updateFeedSource(updated: FeedSource) {
        saveFeedSources(getFeedSources().map { if (it.id == updated.id) updated else it })
    }

    /** Forgets the feed; the lists it filled stay (as ordinary lists) until you delete them. */
    fun removeFeedSource(id: String) {
        saveFeedSources(getFeedSources().filter { it.id != id })
        saveManaged(getManaged().filter { it.sourceId != id })
    }

    private fun getManaged(): List<FeedApply.Managed> =
        (prefs.getString("feed_lists", "") ?: "").split("\n").mapNotNull { line ->
            val p = line.split("\t")
            if (p.size == 3) FeedApply.Managed(p[0], p[1], p[2]) else null
        }

    private fun saveManaged(list: List<FeedApply.Managed>) {
        prefs.edit().putString("feed_lists", list.joinToString("\n") { "${it.listId}\t${it.sourceId}\t${it.feedName}" }).apply()
    }

    sealed class FeedApplyResult {
        data class Ok(val lists: Int, val newNodes: Int, val removedNodes: Int) : FeedApplyResult()
        data class NoRoom(val needed: Int, val free: Int) : FeedApplyResult()
    }

    /**
     * Makes this device's lists match what the company published (all or nothing). Each feed list
     * updates the managed list of the same name, new addresses come in with the list's write key,
     * addresses the company dropped leave the pool, and a managed list the company dropped is
     * removed with its nodes. Contacts that were given a removed node keep their other nodes.
     */
    fun applyFeedLists(sourceId: String, files: List<NodeListFile.Parsed>): FeedApplyResult {
        val plan = FeedApply.plan(sourceId, files, getManaged(), getNodeLists(), getMyNodePool().map { it.address }.toSet(), ::newListId)
        val free = OWN_NODES_MAX - getMyNodePool().size + plan.removedNodes
        if (plan.newNodes > free) return FeedApplyResult.NoRoom(plan.newNodes, free)

        val managed = getManaged().filter { it.sourceId != sourceId || plan.changes.any { c -> c.listId == it.listId } }.toMutableList()
        plan.removeLists.forEach { l -> l.addresses.forEach { removeMyNode(it) } }
        for (c in plan.changes) {
            c.removeAddresses.forEach { removeMyNode(it) }
            addMyNodes(c.file.addresses, c.file.ownerSecret)
            saveNodeLists(NodeLists.assign(getNodeLists(), c.file.addresses, c.listId, c.feedName))
            val first = c.file.addresses.first()
            val sources = getPoolSources().filter { it.address !in c.file.addresses } + ParsedNodeConnection(first, c.file.ownerSecret)
            prefs.edit().putString("pool_sources", sources.joinToString(";") { buildOwnerConnectionString(it) }).apply()
            c.file.control?.let { setControlAddress(first, it) }
            if (managed.none { it.listId == c.listId }) managed += FeedApply.Managed(c.listId, sourceId, c.feedName)
        }
        saveManaged(managed)
        saveNodeLists(getNodeLists())
        return FeedApplyResult.Ok(plan.changes.size, plan.newNodes, plan.removedNodes)
    }

    sealed class ImportResult {
        /** [added] = nodes that were new on this device, [total] = nodes now in the list. */
        data class Ok(val listId: String, val listName: String, val added: Int, val total: Int) : ImportResult()
        /** Not all of the file's nodes fit under [OWN_NODES_MAX] — nothing was imported. */
        data class NoRoom(val needed: Int, val free: Int) : ImportResult()
        object UnknownList : ImportResult()
    }

    /**
     * Takes over every node of a server's list file. All or nothing: if they do not all fit under
     * [OWN_NODES_MAX] nothing is changed. [targetListId] = add to that existing list, null = make a
     * new list called [name]. Nodes that were already known (same address) just get the file's
     * secret and move into the target list. The first address is remembered as the server's pool
     * source, so later "look for more nodes on this server" refreshes keep working.
     */
    fun importNodeList(file: NodeListFile.Parsed, name: String, targetListId: String?): ImportResult {
        val lists = getNodeLists()
        if (targetListId != null && lists.none { it.id == targetListId }) return ImportResult.UnknownList
        val known = getMyNodePool().map { it.address }.toSet()
        val fresh = file.addresses.count { it !in known }
        val free = OWN_NODES_MAX - known.size
        if (fresh > free) return ImportResult.NoRoom(fresh, free)

        val listId = targetListId ?: newListId()
        if (!addMyNodes(file.addresses, file.ownerSecret)) return ImportResult.NoRoom(fresh, free)
        saveNodeLists(NodeLists.assign(getNodeLists(), file.addresses, listId, name))

        val first = file.addresses.first()
        val sources = getPoolSources().filter { it.address !in file.addresses } + ParsedNodeConnection(first, file.ownerSecret)
        prefs.edit().putString("pool_sources", sources.joinToString(";") { buildOwnerConnectionString(it) }).apply()
        file.control?.let { setControlAddress(first, it) }

        val finalList = getNodeLists().first { it.id == listId }
        return ImportResult.Ok(listId, finalList.name, fresh, finalList.addresses.size)
    }

    fun renameNodeList(listId: String, name: String) {
        saveNodeLists(NodeLists.rename(getNodeLists(), listId, name))
    }

    /** Removes the list AND its nodes from this device. Returns how many nodes went with it. */
    fun deleteNodeList(listId: String): Int {
        val list = getNodeLists().find { it.id == listId } ?: return 0
        list.addresses.forEach { removeMyNode(it) }
        saveNodeLists(getNodeLists().filter { it.id != listId })
        return list.addresses.size
    }

    /**
     * NODE_MESH_SPEC.md §6 — one of this device's own nodes changed address (e.g. server moved),
     * keeping the same owner secret (the node's own persisted identity, unaffected by its
     * network address). Returns false if [oldAddress] isn't currently configured. Only updates
     * LOCAL config — the caller is responsible for announcing the change to contacts (see
     * P2PNetworkManager.sendNodeMigrationSignal/sendNodeMigrationSignalToAll), which must run
     * AFTER this so the announcement itself goes out under the already-updated pool (see that
     * function's doc comment for why that ordering alone satisfies "never announce over the
     * node that's changing", with no extra logic needed here).
     */
    fun migrateMyNode(oldAddress: String, newAddress: String): Boolean {
        val existing = getMyNodeConnectionStrings().mapNotNull { parseOwnerConnectionString(it) }
        val match = existing.find { it.address == oldAddress } ?: return false
        val updated = existing.map {
            if (it.address == oldAddress) ParsedNodeConnection(newAddress, match.ownerSecret) else it
        }
        prefs.edit().putString("my_nodes", updated.map { buildOwnerConnectionString(it) }.joinToString(";")).apply()
        val sources = getPoolSources().map {
            if (it.address == oldAddress) ParsedNodeConnection(newAddress, it.ownerSecret) else it
        }
        prefs.edit().putString("pool_sources", sources.joinToString(";") { buildOwnerConnectionString(it) }).apply()
        saveNodeLists(NodeLists.replaceAddress(loadNodeLists(), oldAddress, newAddress))
        return true
    }

    /** Removes one of this device's own nodes by address (e.g. permanently decommissioning it —
     *  a full removal, not an address change — see [migrateMyNode] for that instead). */
    fun removeMyNode(address: String) {
        val remaining = getMyNodeConnectionStrings()
            .mapNotNull { parseOwnerConnectionString(it) }
            .filter { it.address != address }
            .map { buildOwnerConnectionString(it) }
        prefs.edit().putString("my_nodes", remaining.joinToString(";")).apply()
        val sources = getPoolSources().filter { it.address != address }
        prefs.edit().putString("pool_sources", sources.joinToString(";") { buildOwnerConnectionString(it) }).apply()
    }

    /** The address-only list this device advertises to a new contact at pairing time — never
     *  includes an owner secret, see this class's doc comment for why that split exists at all. */
    fun getMyAdvertisedAddresses(): List<String> = getMyNodePool().map { it.address }

    /** True once at least one own node is configured — mirrors [RelayManager.isUsable] as the
     *  gate a Node-Mesh pairing QR screen checks before offering to generate a code. */
    fun isUsable(): Boolean = getMyNodePool().isNotEmpty()

    companion object {
        /** Local-only format, address + owner secret together — NEVER put in a QR or any
         *  contact-facing string. Deliberately a different prefix from [NODE_ADDRESS_PREFIX] so
         *  the two can never be confused for each other even by a parsing bug. */
        private const val NODE_OWNER_PREFIX = "unpruuf-node-owner:v1:"

        /** Contact-facing format — address only, no secret. What a Node-Mesh pairing QR's node
         *  list (analogous to [RelayManager]'s relay pool field) is built from. */
        const val NODE_ADDRESS_PREFIX = "unpruuf-node:v1:"

        /** How many own nodes one CONTACT gets (and how many of theirs I poll) — NODE_MESH_SPEC.md
         *  §5's "up to 3 own nodes" redundancy recommendation, now applied per contact. */
        const val NODE_POOL_MAX_SIZE = 3

        /** How many own nodes this device can hold in total, across all servers and lists (four
         *  full servers of 250 nodes). */
        const val OWN_NODES_MAX = 1000

        data class ParsedNodeConnection(val address: String, val ownerSecret: String)

        /** Parses `unpruuf-node-owner:v1:<address>:<ownerSecret>` — same right-to-left split as
         *  [RelayManager.parseConnectionString] (the address may itself contain a colon, e.g.
         *  `host:port`; the secret never does, since it's base64url — see
         *  node-mesh-server/src/nodeIdentity.ts's generateSecret()). */
        fun parseOwnerConnectionString(raw: String): ParsedNodeConnection? {
            val trimmed = raw.trim()
            if (!trimmed.startsWith(NODE_OWNER_PREFIX)) return null
            val rest = trimmed.substring(NODE_OWNER_PREFIX.length)
            val lastColon = rest.lastIndexOf(':')
            if (lastColon <= 0 || lastColon == rest.length - 1) return null
            val address = rest.substring(0, lastColon)
            val ownerSecret = rest.substring(lastColon + 1)
            if (address.isEmpty() || ownerSecret.isEmpty()) return null
            return ParsedNodeConnection(address, ownerSecret)
        }

        /** Pure core of [chooseNodesForNewContact]: least-used first (stable for equal usage, so
         *  the caller's shuffle decides ties), one node per server before any server repeats. */
        fun chooseNodes(pool: List<ParsedNodeConnection>, usage: Map<String, Int>, count: Int): List<String> {
            val ordered = pool.sortedBy { usage[it.address] ?: 0 }
            val picked = mutableListOf<ParsedNodeConnection>()
            for (node in ordered) {
                if (picked.size >= count) break
                if (picked.none { it.ownerSecret == node.ownerSecret }) picked += node
            }
            for (node in ordered) {
                if (picked.size >= count) break
                if (node !in picked) picked += node
            }
            return picked.map { it.address }
        }

        fun buildOwnerConnectionString(parsed: ParsedNodeConnection): String =
            "$NODE_OWNER_PREFIX${parsed.address}:${parsed.ownerSecret}"

        /** Parses a bare `unpruuf-node:v1:<address>` (no secret) — what a Node-Mesh pairing QR's
         *  node list carries, and all a contact ever needs: no auth is required to fetch
         *  (NODE_MESH_SPEC.md §8), the address alone is enough to know where to poll. */
        fun parseAddressConnectionString(raw: String): String? {
            val trimmed = raw.trim()
            if (!trimmed.startsWith(NODE_ADDRESS_PREFIX)) return null
            val address = trimmed.substring(NODE_ADDRESS_PREFIX.length)
            return address.ifEmpty { null }
        }

        fun buildAddressConnectionString(address: String): String = "$NODE_ADDRESS_PREFIX$address"

        /** Joins full connection strings (either format) with `;` — same separator convention as
         *  [RelayManager.buildConnectionStringList]; safe for the same reason (neither an
         *  address nor a base64url secret can contain `;`). */
        fun buildNodeConnectionStringList(list: List<String>): String =
            list.map { it.trim() }.filter { it.isNotEmpty() }.take(NODE_POOL_MAX_SIZE).joinToString(";")

        fun parseNodeConnectionStringList(raw: String): List<String> =
            raw.split(";").map { it.trim() }.filter { it.isNotEmpty() }
    }
}
