package com.nexonai.unpruuf.relay.core

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * In-memory, session-only activity log for the relay operator's own screen — never persisted,
 * never sent anywhere. The relay is architecturally blind to message content (see BlobStore's
 * own comment: everything stored here is already Double-Ratchet ciphertext) and this log stays
 * true to that — it only ever records metadata the relay already legitimately handles: a short
 * tag suffix (just enough to see a STORE and its later FETCH are the same conversation), size,
 * and timing. Purpose: let the relay's operator see, right on the phone, whether pushes are
 * actually arriving and how long they sit before being picked up — no adb/logcat needed.
 */
object RelayEventLog {
    enum class Kind { STORED, FETCHED, REJECTED }

    data class Entry(
        val atMs: Long,
        val kind: Kind,
        val tagSuffix: String,
        val bytes: Int,
        val count: Int = 1,
        val avgDwellMs: Long? = null,
        val note: String? = null
    )

    private const val MAX_ENTRIES = 200
    private val _entries = MutableStateFlow<List<Entry>>(emptyList())
    val entries: StateFlow<List<Entry>> = _entries

    // Long enough to tell two different tags apart at a glance, short enough that it's useless
    // for anyone but the operator correlating their own relay's traffic.
    private fun suffix(tag: String): String = if (tag.length <= 8) tag else tag.takeLast(8)

    @Synchronized
    private fun add(entry: Entry) {
        _entries.value = (listOf(entry) + _entries.value).take(MAX_ENTRIES)
    }

    fun logStored(tag: String, bytes: Int) {
        add(Entry(atMs = System.currentTimeMillis(), kind = Kind.STORED, tagSuffix = suffix(tag), bytes = bytes))
    }

    fun logRejected(tag: String, note: String) {
        add(Entry(atMs = System.currentTimeMillis(), kind = Kind.REJECTED, tagSuffix = suffix(tag), bytes = 0, note = note))
    }

    /** [avgDwellMs] is how long the fetched blob(s) sat queued before this pickup — the
     *  "how long did it take" number Gabriel asked for. Null for an empty fetch (nothing to
     *  measure) — callers should skip logging those entirely rather than pass 0. */
    fun logFetched(tag: String, count: Int, totalBytes: Int, avgDwellMs: Long) {
        add(
            Entry(
                atMs = System.currentTimeMillis(),
                kind = Kind.FETCHED,
                tagSuffix = suffix(tag),
                bytes = totalBytes,
                count = count,
                avgDwellMs = avgDwellMs
            )
        )
    }

    fun clear() {
        _entries.value = emptyList()
    }
}
