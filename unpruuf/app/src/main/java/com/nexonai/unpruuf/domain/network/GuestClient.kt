package com.nexonai.unpruuf.domain.network

/**
 * The Client app's side of a guest invitation (GUEST_LOCKERS_BUILD_SPEC.md §7.2): what is checked
 * before an invitation is accepted, and what state its grants are in later. Pure JVM, no Android
 * classes, so it runs in plain unit tests.
 *
 * Grants are index-aligned with the inviter's node addresses. Nothing here ever falls back to
 * another node or path: a grant is used for the node it belongs to, or not at all.
 */
object GuestClient {

    enum class Problem {
        /** The code has no usable grant at all: it is a normal pairing code, not an invitation. */
        NOT_AN_INVITATION,
        /** Every grant in the code has already expired. */
        EXPIRED
    }

    sealed class Check {
        data class Ok(val nodeAddresses: List<String>, val grants: List<String>, val expiresAtMs: Long) : Check()
        data class Refused(val problem: Problem) : Check()
    }

    /**
     * [nodeAddresses] and [grants] come from the invitation code. Keeps only nodes whose grant
     * reads as a grant and has not expired; the rest of the slots stay empty so the lists stay
     * index-aligned. Needs at least one usable node.
     */
    fun check(nodeAddresses: List<String>, grants: List<String>, nowMs: Long): Check {
        if (grants.none { it.isNotEmpty() }) return Check.Refused(Problem.NOT_AN_INVITATION)
        val usable = nodeAddresses.indices.map { i ->
            grants.getOrNull(i)?.takeIf { it.isNotEmpty() && (GuestGrant.parse(it)?.notAfterMs ?: 0L) > nowMs } ?: ""
        }
        if (usable.none { it.isNotEmpty() }) return Check.Refused(Problem.EXPIRED)
        val expiry = usable.filter { it.isNotEmpty() }.maxOf { GuestGrant.parse(it)!!.notAfterMs }
        return Check.Ok(nodeAddresses, usable, expiry)
    }

    enum class Status {
        /** At least one grant is valid and none is about to run out. */
        ACTIVE,
        /** The last valid grant runs out within the renewal window: ask the inviter for a new one. */
        EXPIRING,
        /** No grant is valid any more: nothing can be sent until the inviter issues a new invitation. */
        EXPIRED
    }

    /** [stored] is the contact's `guestGrants` column. Null or empty means not a guest contact. */
    fun status(stored: String?, nowMs: Long, renewWindowMs: Long = 2L * 24 * 3600 * 1000): Status? {
        if (stored.isNullOrEmpty()) return null
        val latest = stored.split(";").mapNotNull { GuestGrant.parse(it)?.notAfterMs }.maxOrNull() ?: return Status.EXPIRED
        return when {
            latest <= nowMs -> Status.EXPIRED
            latest - nowMs <= renewWindowMs -> Status.EXPIRING
            else -> Status.ACTIVE
        }
    }

    /** The grants of a guest contact, index-aligned with [addressCount] node addresses. */
    fun grantsFor(stored: String?, addressCount: Int): List<String> =
        (stored ?: "").split(";").let { parts -> List(addressCount) { parts.getOrNull(it) ?: "" } }

    /** The latest expiry over all grants (ms), or null if none reads as a grant. */
    fun expiryMs(stored: String?): Long? =
        stored?.split(";")?.mapNotNull { GuestGrant.parse(it)?.notAfterMs }?.maxOrNull()
}
