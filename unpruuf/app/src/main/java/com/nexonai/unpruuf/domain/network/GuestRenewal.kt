package com.nexonai.unpruuf.domain.network

/**
 * GRANT_RENEW (GUEST_LOCKERS_BUILD_SPEC.md §4 point 4, §15.2). Pure JVM, unit-tested.
 *
 * The owner app (Pro) keeps a guest's access alive by sending new grants through the normal
 * encrypted chat channel, long before the old ones run out. The message carries the node
 * addresses WITH their grants (`address,token` pairs), not just tokens: that way a renewal also
 * moves a guest to new nodes when the owner's nodes changed, and an index mismatch can never put
 * a grant on the wrong node. Only the guest app (a contact that holds guest grants) acts on it.
 */
object GuestRenewal {
    const val SIGNAL_PREFIX = "UNPRUUF_GRANTRENEW_V1:"
    private const val DAY_MS = 24L * 3600 * 1000
    private const val MIN_INTERVAL_MS = 6L * 3600 * 1000

    /** What the owner promised this guest: validity of every renewed grant and the sending limit. */
    data class Policy(val validityDays: Int, val quota: GuestInvite.Quota, val renewing: Boolean)

    /** `7:NORMAL` while renewing, `!7:NORMAL` after "stop renewing". Null/garbage = no policy. */
    fun encodePolicy(p: Policy): String = (if (p.renewing) "" else "!") + "${p.validityDays}:${p.quota.name}"

    fun decodePolicy(raw: String?): Policy? {
        if (raw.isNullOrBlank()) return null
        val renewing = !raw.startsWith("!")
        val parts = raw.removePrefix("!").split(":")
        if (parts.size != 2) return null
        val days = parts[0].toIntOrNull()?.takeIf { it in 1..30 } ?: return null
        val quota = GuestInvite.Quota.values().firstOrNull { it.name == parts[1] } ?: return null
        return Policy(days, quota, renewing)
    }

    /**
     * Renew a quarter of the validity after the last renewal (at least every 6 hours apart). A 7-day
     * grant is therefore replaced every 42 hours, so up to two lost renewals in a row (owner app
     * closed, node down) still leave the guest with valid grants. There is no acknowledgement
     * channel, which is why the owner repeats instead of waiting for one.
     */
    fun due(policy: Policy, lastRenewedAtMs: Long?, nowMs: Long): Boolean {
        if (!policy.renewing) return false
        val interval = (policy.validityDays * DAY_MS / 4).coerceAtLeast(MIN_INTERVAL_MS)
        return lastRenewedAtMs == null || nowMs - lastRenewedAtMs >= interval
    }

    data class Entry(val address: String, val token: String)

    fun encodeSignal(entries: List<Entry>): String =
        SIGNAL_PREFIX + entries.joinToString(";") { "${it.address},${it.token}" }

    /**
     * The entries of a received renewal that are safe to use: a v3 onion address and a grant that
     * reads as a grant and has not run out. Anything else is dropped; null if nothing is left (the
     * contact then keeps what it has). At most [NodeMeshManager.NODE_POOL_MAX_SIZE] entries.
     */
    fun parseSignal(payload: String, nowMs: Long): List<Entry>? {
        if (!payload.startsWith(SIGNAL_PREFIX)) return null
        val out = ArrayList<Entry>()
        for (raw in payload.removePrefix(SIGNAL_PREFIX).split(";")) {
            val parts = raw.split(",")
            if (parts.size != 2) continue
            val address = parts[0].trim()
            val token = parts[1].trim()
            if (!NodeMeshClient.isNodeAddress(address)) continue
            val info = GuestGrant.parse(token) ?: continue
            if (info.notAfterMs <= nowMs) continue
            if (out.any { it.address == address }) continue
            out.add(Entry(address, token))
            if (out.size == NodeMeshManager.NODE_POOL_MAX_SIZE) break
        }
        return out.takeIf { it.isNotEmpty() }
    }
}
