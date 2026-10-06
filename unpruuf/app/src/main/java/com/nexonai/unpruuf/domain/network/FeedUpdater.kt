package com.nexonai.unpruuf.domain.network

import javax.inject.Inject
import javax.inject.Singleton

/**
 * Fetches the company lists from the rotating onion address and applies them. Called when the user
 * taps "Update now" and about once an hour in the background (P2PNetworkManager). Blocking network
 * code: call from a background thread.
 */
@Singleton
class FeedUpdater @Inject constructor(
    private val nodeMeshManager: NodeMeshManager,
    private val client: NodeMeshClient
) {
    /** What one attempt did, as a short line for the screen. */
    fun updateSource(source: FeedSource, nowMs: Long = System.currentTimeMillis()): FeedSource {
        val code = source.toCode() ?: return finish(source, nowMs, source.lastSeq, "The saved feed code is not valid. Remove the source and add it again.")
        // Try the likely address first; a phone clock that is a little off falls back to the neighbour period.
        var blob: String? = null
        for (address in FeedCrypto.candidateAddresses(code, nowMs)) {
            blob = client.fetchFeedList(address)
            if (blob != null) break
        }
        if (blob == null) return finish(source, nowMs, source.lastSeq, "Not reachable (no Tor yet, or the feed is offline). Will try again.")
        val opened = FeedCrypto.openList(blob, code.contentKey, code.signPublicKey)
            ?: return finish(source, nowMs, source.lastSeq, "Rejected: the list is not genuinely from this company. Nothing changed.")
        if (opened.seq < source.lastSeq) return finish(source, nowMs, source.lastSeq, "Rejected: the list is older than the one already installed. Nothing changed.")
        if (opened.seq == source.lastSeq) return source.copy(lastUpdatedMs = nowMs, lastResult = "Up to date (version ${opened.seq}).")

        val files = FeedCrypto.splitLists(opened.plaintext).map { NodeListFile.parse(it) ?: return finish(source, nowMs, source.lastSeq, "Rejected: the list is damaged. Nothing changed.") }
        if (files.isEmpty()) return finish(source, nowMs, source.lastSeq, "Rejected: the list is empty. Nothing changed.")
        return when (val r = nodeMeshManager.applyFeedLists(source.id, files)) {
            is NodeMeshManager.FeedApplyResult.Ok ->
                source.copy(lastSeq = opened.seq, lastUpdatedMs = nowMs, lastResult = "Updated to version ${opened.seq}: ${r.lists} list(s), ${r.newNodes} new node(s), ${r.removedNodes} removed.")
            is NodeMeshManager.FeedApplyResult.NoRoom ->
                finish(source, nowMs, source.lastSeq, "Not applied: needs room for ${r.needed} more nodes, only ${r.free} free. Delete a list you no longer use.")
        }
    }

    private fun finish(source: FeedSource, nowMs: Long, seq: Long, message: String): FeedSource =
        source.copy(lastSeq = seq, lastUpdatedMs = nowMs, lastResult = message)

    /** Updates every followed feed and stores the outcome. */
    fun updateAll(): List<FeedSource> = nodeMeshManager.getFeedSources().map { s ->
        val updated = updateSource(s)
        nodeMeshManager.updateFeedSource(updated)
        updated
    }

    fun updateOne(id: String): FeedSource? {
        val s = nodeMeshManager.getFeedSources().find { it.id == id } ?: return null
        val updated = updateSource(s)
        nodeMeshManager.updateFeedSource(updated)
        return updated
    }
}
