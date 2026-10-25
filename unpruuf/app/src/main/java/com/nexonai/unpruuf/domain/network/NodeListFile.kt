package com.nexonai.unpruuf.domain.network

/**
 * The node-list file a Business Node server exports from its setup page
 * (node-mesh-server/src/nodeList.ts) — everything this app needs to take over all nodes of one
 * server in one go:
 *
 *   unpruuf-node-list:v1
 *   name: Acme GmbH · Server 1
 *   secret: <owner secret>          ← the write key for every node on that server
 *   control: <control onion>        ← sealed servers only
 *   count: 250
 *   bridge: obfs4 …                 ← optional, repeatable: the company's own Tor bridge
 *   <empty line>
 *   <address>                       ← one per line
 *
 * Plain text, hand-rolled parser (no JSON) so it also runs in plain JVM unit tests. It contains
 * the owner secret, so it is exactly as sensitive as the owner QR: this app only reads it, never
 * writes one.
 */
object NodeListFile {
    const val HEADER = "unpruuf-node-list:v1"

    /** Addresses are v3 onions only (see [NodeMeshClient.isNodeAddress]); the secret is url-safe text, no spaces. */
    private val SECRET_RE = Regex("^[A-Za-z0-9_-]{16,128}$")
    private val KEY_VALUE = Regex("^([a-z]+):\\s?(.*)$")

    /** Refuse absurd inputs before parsing — a real file is ~70 bytes per node. */
    const val MAX_CHARS = 400_000

    /** Ten servers of 250 nodes make 2500 addresses; more than twice that in one file is not a list. */
    const val MAX_ADDRESSES = 5_000

    data class Parsed(
        val name: String,
        val ownerSecret: String,
        val control: String?,
        val addresses: List<String>,
        /** The company's own Tor bridge lines (valid ones only, see [ConnectionPaths]). */
        val bridges: List<String> = emptyList()
    )

    /** The list inside [text], or null for anything that is not a well-formed node list. */
    fun parse(text: String): Parsed? {
        if (text.length > MAX_CHARS) return null
        val lines = text.removePrefix("﻿").split(Regex("\r?\n"))
        if (lines.firstOrNull()?.trim() != HEADER) return null
        val header = mutableMapOf<String, String>()
        val bridgeLines = mutableListOf<String>()
        var i = 1
        while (i < lines.size && lines[i].isNotBlank()) {
            val m = KEY_VALUE.matchEntire(lines[i]) ?: return null
            if (m.groupValues[1] == "bridge") bridgeLines += m.groupValues[2].trim()
            else header[m.groupValues[1]] = m.groupValues[2].trim()
            i++
        }
        // A set, not list.contains: a file of 60 000 lines must not cost minutes (the old version was quadratic).
        val seen = LinkedHashSet<String>()
        i++
        while (i < lines.size) {
            val a = lines[i].trim()
            i++
            if (a.isEmpty()) continue
            if (!NodeMeshClient.isNodeAddress(a)) return null
            seen += a
            if (seen.size > MAX_ADDRESSES) return null
        }
        val addresses = seen.toList()
        val secret = header["secret"] ?: return null
        if (!SECRET_RE.matches(secret)) return null
        if (addresses.isEmpty()) return null
        header["count"]?.let { if (it.toIntOrNull() != addresses.size) return null }
        val control = header["control"]?.takeIf { it.isNotEmpty() }
        if (control != null && !NodeMeshClient.isNodeAddress(control)) return null
        return Parsed(NodeLists.cleanName(header["name"] ?: ""), secret, control, addresses, ConnectionPaths.cleanCompanyBridgeLines(bridgeLines))
    }
}
