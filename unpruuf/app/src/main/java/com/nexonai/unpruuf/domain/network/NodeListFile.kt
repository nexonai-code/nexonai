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
 *   <empty line>
 *   <address>                       ← one per line
 *
 * Plain text, hand-rolled parser (no JSON) so it also runs in plain JVM unit tests. It contains
 * the owner secret, so it is exactly as sensitive as the owner QR: this app only reads it, never
 * writes one.
 */
object NodeListFile {
    const val HEADER = "unpruuf-node-list:v1"

    /** Same bounds as the server side: addresses and secret are url-safe text, no spaces. */
    private val ADDRESS_RE = Regex("^[A-Za-z0-9._:-]{3,120}$")
    private val SECRET_RE = Regex("^[A-Za-z0-9_-]{16,128}$")
    private val KEY_VALUE = Regex("^([a-z]+):\\s?(.*)$")

    /** Refuse absurd inputs before parsing — a real file is ~70 bytes per node. */
    const val MAX_CHARS = 400_000

    data class Parsed(
        val name: String,
        val ownerSecret: String,
        val control: String?,
        val addresses: List<String>
    )

    /** The list inside [text], or null for anything that is not a well-formed node list. */
    fun parse(text: String): Parsed? {
        if (text.length > MAX_CHARS) return null
        val lines = text.removePrefix("﻿").split(Regex("\r?\n"))
        if (lines.firstOrNull()?.trim() != HEADER) return null
        val header = mutableMapOf<String, String>()
        var i = 1
        while (i < lines.size && lines[i].isNotBlank()) {
            val m = KEY_VALUE.matchEntire(lines[i]) ?: return null
            header[m.groupValues[1]] = m.groupValues[2].trim()
            i++
        }
        val addresses = mutableListOf<String>()
        i++
        while (i < lines.size) {
            val a = lines[i].trim()
            i++
            if (a.isEmpty()) continue
            if (!ADDRESS_RE.matches(a)) return null
            if (a !in addresses) addresses += a
        }
        val secret = header["secret"] ?: return null
        if (!SECRET_RE.matches(secret)) return null
        if (addresses.isEmpty()) return null
        header["count"]?.let { if (it.toIntOrNull() != addresses.size) return null }
        val control = header["control"]?.takeIf { it.isNotEmpty() }
        if (control != null && !ADDRESS_RE.matches(control)) return null
        return Parsed(NodeLists.cleanName(header["name"] ?: ""), secret, control, addresses)
    }
}
