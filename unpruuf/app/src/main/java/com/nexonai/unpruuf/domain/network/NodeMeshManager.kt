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
            .take(NODE_POOL_MAX_SIZE)

    private fun getMyNodeConnectionStrings(): List<String> =
        parseNodeConnectionStringList(prefs.getString("my_nodes", "") ?: "")

    /**
     * Adds one of this device's own nodes from a scanned/pasted `unpruuf-node-owner:v1:...`
     * string (what a Node-Mesh server prints at setup — see `node-mesh-server/README.md`).
     * Returns false (and stores nothing) if [raw] doesn't parse, or if the pool is already at
     * [NODE_POOL_MAX_SIZE]. Deduplicates by address — re-adding the same node (e.g. after
     * rotating its owner secret) replaces the old entry rather than creating a second one.
     */
    fun addMyNode(raw: String): Boolean {
        val parsed = parseOwnerConnectionString(raw) ?: return false
        val existing = getMyNodeConnectionStrings().mapNotNull { parseOwnerConnectionString(it) }
        val withoutDuplicate = existing.filter { it.address != parsed.address }
        if (withoutDuplicate.size >= NODE_POOL_MAX_SIZE) return false
        val updated = (withoutDuplicate + parsed).map { buildOwnerConnectionString(it) }
        prefs.edit().putString("my_nodes", updated.joinToString(";")).apply()
        return true
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

        /** Same redundancy cap as [RelayManager.RELAY_POOL_MAX_SIZE] — NODE_MESH_SPEC.md §5's
         *  "up to 3 own nodes" recommendation. */
        const val NODE_POOL_MAX_SIZE = 3

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
