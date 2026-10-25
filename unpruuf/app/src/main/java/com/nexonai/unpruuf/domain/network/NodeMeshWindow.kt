package com.nexonai.unpruuf.domain.network

/**
 * Which hourly routing-tag epochs a poll asks a node for.
 *
 * The full window (24 h of retention plus margin, 26 epochs) is only needed when the phone may have
 * missed something: the first poll after the app started, after a failed poll, or after the clock went
 * backwards. In the steady state everything older than the last successful poll has already been
 * downloaded, so asking for 26 tags in every request would only tell the node operator which tags
 * belong together (pre-audit M4). The narrow window is the epoch before the last successful poll up to
 * now: the epoch before covers a sender whose clock runs behind, the range up to now covers the time
 * the phone was away.
 */
object NodeMeshWindow {
    /**
     * @param current the epoch of this moment
     * @param lastSuccessful the epoch in which the last COMPLETE poll of this contact on this node
     *   succeeded; null if there is none (memory only, so null after every app start)
     * @param fullWindow all epochs of the full window, newest first (what the old code always asked for)
     * @return epochs to ask for, newest first
     */
    fun epochs(current: Long, lastSuccessful: Long?, fullWindow: List<Long>): List<Long> {
        if (lastSuccessful == null || lastSuccessful > current) return fullWindow
        val oldest = lastSuccessful - 1
        val count = current - oldest + 1
        if (count >= fullWindow.size) return fullWindow
        return (0 until count).map { current - it }
    }
}
