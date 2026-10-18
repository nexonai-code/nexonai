package com.nexonai.unpruuf.domain.network

import java.nio.ByteBuffer

/**
 * Scope of a guest grant on the multi-slot server (250 virtual nodes per server, up to 100 slots
 * per node). Mirrors node-mesh-server/src/guest/guestScope.ts and the shared vector "slot-scope".
 *
 * Entries are 4 bytes, big-endian: node u16 (0..249), slotFrom u8 (0..99), slotTo u8 (slotFrom..99).
 * An empty scope means "this node, no slot restriction" (single-node server); a multi-slot server
 * refuses empty scopes.
 */
object GuestScope {
    const val VIRTUAL_NODES_PER_SERVER = 250
    const val SLOTS_PER_NODE = 100
    const val ENTRY_BYTES = 4

    data class Entry(val node: Int, val slotFrom: Int, val slotTo: Int) {
        init {
            require(node in 0 until VIRTUAL_NODES_PER_SERVER) { "node out of range" }
            require(slotFrom in 0 until SLOTS_PER_NODE && slotTo in slotFrom until SLOTS_PER_NODE) { "slot range out of range" }
        }
    }

    fun encode(entries: List<Entry>): ByteArray {
        val bb = ByteBuffer.allocate(entries.size * ENTRY_BYTES)
        for (e in entries) {
            bb.putShort(e.node.toShort())
            bb.put(e.slotFrom.toByte())
            bb.put(e.slotTo.toByte())
        }
        return bb.array()
    }

    /** Null for a malformed scope. */
    fun decode(bytes: ByteArray): List<Entry>? {
        if (bytes.size % ENTRY_BYTES != 0) return null
        val bb = ByteBuffer.wrap(bytes)
        val out = ArrayList<Entry>()
        while (bb.remaining() >= ENTRY_BYTES) {
            val node = bb.getShort().toInt() and 0xFFFF
            val from = bb.get().toInt() and 0xFF
            val to = bb.get().toInt() and 0xFF
            val entry = runCatching { Entry(node, from, to) }.getOrNull() ?: return null
            out.add(entry)
        }
        return out
    }

    fun allows(entries: List<Entry>, node: Int, slot: Int): Boolean =
        entries.any { it.node == node && slot in it.slotFrom..it.slotTo }
}
