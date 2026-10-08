package com.nexonai.unpruuf.domain.network

/**
 * How long a packet for one contact may wait on a Node-Mesh node. Only three steps, on purpose:
 * the node sees the lifetime that was asked for, so a free-form value would be one more thing that
 * tells chats apart. The node caps it at its own profile (never longer), and the receiver's poll
 * window already covers 24 h, so every step is safe for delivery as long as the receiver is online
 * within that time.
 */
object MessageTtl {
    val STEPS_HOURS = listOf(1, 6, 24)
    const val DEFAULT_HOURS = 24

    /** The stored value made valid: anything that is not a step becomes the default. */
    fun normalize(hours: Int?): Int = if (hours in STEPS_HOURS) hours!! else DEFAULT_HOURS

    /** The deposit's ttl in milliseconds. */
    fun toMillis(hours: Int?): Long = normalize(hours) * 60L * 60L * 1000L
}
