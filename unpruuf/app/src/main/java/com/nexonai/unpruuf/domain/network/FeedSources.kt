package com.nexonai.unpruuf.domain.network

/**
 * A company list feed this device follows: the feed code (address seed, content key, signing public
 * key, period) plus what the last fetch did. Stored by [NodeMeshManager]; the keys inside stay on
 * this device and are never shown again.
 */
data class FeedSource(
    val id: String,
    val name: String,
    val periodHours: Int,
    val addressSeed: String, // base64url
    val contentKey: String, // base64url
    val signPublicKey: String, // base64url
    /** Highest list version accepted so far — an older one is never taken (no rollback). */
    val lastSeq: Long = -1,
    val lastUpdatedMs: Long = 0,
    /** One line for the screen: what the last attempt did. */
    val lastResult: String = ""
) {
    fun toCode(): FeedCrypto.FeedCode? = FeedCrypto.parseFeedCode(
        "${FeedCrypto.FEED_CODE_PREFIX}1|$name|$periodHours|$addressSeed|$contentKey|$signPublicKey"
    )

    companion object {
        private fun clean(s: String) = s.replace(Regex("[\\r\\n\\t]+"), " ")

        fun serialize(sources: List<FeedSource>): String = sources.joinToString("\n") {
            listOf(it.id, clean(it.name), it.periodHours, it.addressSeed, it.contentKey, it.signPublicKey, it.lastSeq, it.lastUpdatedMs, clean(it.lastResult))
                .joinToString("\t")
        }

        fun parse(raw: String): List<FeedSource> = raw.split("\n").mapNotNull { line ->
            val p = line.split("\t")
            if (p.size != 9 || p[0].isBlank()) return@mapNotNull null
            val period = p[2].toIntOrNull() ?: return@mapNotNull null
            FeedSource(p[0], p[1], period, p[3], p[4], p[5], p[6].toLongOrNull() ?: -1, p[7].toLongOrNull() ?: 0, p[8])
        }

        /** Builds a source from a pasted feed code. Null if the code is not valid. */
        fun fromCode(text: String, id: String): FeedSource? {
            val c = FeedCrypto.parseFeedCode(text) ?: return null
            val enc = java.util.Base64.getUrlEncoder().withoutPadding()
            return FeedSource(id, c.name, c.periodHours, enc.encodeToString(c.addressSeed), enc.encodeToString(c.contentKey), enc.encodeToString(c.signPublicKey))
        }
    }
}

/**
 * What a feed update does to the device's lists, worked out before anything is changed. Each list in
 * the feed becomes (or updates) one managed list named like the list file; addresses the feed no
 * longer has leave the pool; a managed list the feed no longer has is removed with its nodes.
 */
object FeedApply {
    /** A managed list: the app's list [listId] follows the feed list called [feedName] of [sourceId]. */
    data class Managed(val listId: String, val sourceId: String, val feedName: String)

    data class ListChange(
        val listId: String,
        val feedName: String,
        val file: NodeListFile.Parsed,
        val isNew: Boolean,
        val removeAddresses: List<String>
    )

    data class Plan(val changes: List<ListChange>, val removeLists: List<NodeList>, val newNodes: Int, val removedNodes: Int)

    fun plan(
        sourceId: String,
        files: List<NodeListFile.Parsed>,
        managed: List<Managed>,
        lists: List<NodeList>,
        pool: Set<String>,
        newId: () -> String
    ): Plan {
        val mine = managed.filter { it.sourceId == sourceId }
        val byName = mine.associateBy { it.feedName }
        val seenIds = mutableSetOf<String>()
        val changes = files.map { f ->
            val m = byName[f.name]
            val listId = m?.listId?.takeIf { id -> lists.any { it.id == id } } ?: newId()
            seenIds += listId
            val existing = lists.find { it.id == listId }?.addresses.orEmpty()
            ListChange(listId, f.name, f, existing.isEmpty() && lists.none { it.id == listId }, existing.filter { it !in f.addresses })
        }
        val gone = mine.filter { it.listId !in seenIds }.mapNotNull { m -> lists.find { it.id == m.listId } }
        val feedAddresses = files.flatMap { it.addresses }.toSet()
        val newNodes = feedAddresses.count { it !in pool }
        val removedNodes = (changes.flatMap { it.removeAddresses } + gone.flatMap { it.addresses }).toSet().size
        return Plan(changes, gone, newNodes, removedNodes)
    }
}
