package com.nexonai.unpruuf.domain.network

import java.security.SecureRandom

/**
 * Builds the guest grants for an invitation (GUEST_LOCKERS_BUILD_SPEC.md §4, §7.1). Pure JVM, so
 * the rules below are unit-tested without Android.
 *
 * One grant per own node, a NEW random grant id per invitation and per node, nothing in a grant
 * that identifies the guest. The owner secret only signs; it is never part of the output.
 */
object GuestInvite {
    /** Operator cap on the node is 30 days by default; stay clearly below it so a clock that runs
     *  a little ahead of the node's never makes a fresh grant look too long. */
    val VALIDITY_DAYS_OPTIONS = listOf(7, 14, 28)
    const val DEFAULT_VALIDITY_DAYS = 7
    private const val DAY_MS = 24L * 3600 * 1000

    /** Limits per guest and node. Presets, not free numbers: nobody should have to guess. */
    enum class Quota(val depositsPerHour: Int, val bytesPerHour: Long) {
        LIGHT(30, 512L * 1024),
        NORMAL(60, 1024L * 1024),
        HIGH(120, 2L * 1024 * 1024)
    }

    data class OwnNode(val address: String, val ownerSecret: String)

    fun expiryMs(nowMs: Long, validityDays: Int): Long {
        require(validityDays in 1..30) { "validity must be 1 to 30 days" }
        return nowMs + validityDays * DAY_MS
    }

    /**
     * Index-aligned with [nodes]. [scopeFor] returns the scope bytes for node index i (empty for a
     * single-node server; slot ranges via [GuestScope.encode] for a multi-slot server).
     */
    fun issueGrants(
        nodes: List<OwnNode>,
        nowMs: Long,
        validityDays: Int,
        quota: Quota,
        scopeFor: (Int) -> ByteArray = { ByteArray(0) },
        random: SecureRandom = SecureRandom()
    ): List<String> {
        require(nodes.isNotEmpty()) { "no own node configured" }
        val notAfter = expiryMs(nowMs, validityDays)
        return nodes.mapIndexed { i, node ->
            GuestGrant.issue(
                node.ownerSecret,
                GuestGrant.Spec(
                    grantId = GuestGrant.newGrantId(random),
                    notAfterMs = notAfter,
                    depositsPerHour = quota.depositsPerHour,
                    bytesPerHour = quota.bytesPerHour,
                    scope = scopeFor(i)
                )
            )
        }
    }
}
