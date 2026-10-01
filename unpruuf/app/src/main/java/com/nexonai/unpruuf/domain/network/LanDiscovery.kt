package com.nexonai.unpruuf.domain.network

import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * How two directly paired devices find each other on the same Wi-Fi WITHOUT announcing the app.
 *
 * Before: every edition announced `_unpruuf._tcp` as `unpruuf_<first 8 chars of the userId>` in
 * every network it joined — anyone on the same Wi-Fi (office, hotel) could see "unpruuf runs
 * here" and recognise the same phone again in the next network.
 *
 * Now:
 *  - The service type is the generic `_http._tcp` — the most common type on any LAN.
 *  - The instance name is [serviceName]: 16 hex chars of HMAC(userId, hour). Only someone who
 *    already knows this device's userId (= a direct contact, who got it at pairing) can compute
 *    it; to everyone else it is a random name that changes every hour.
 *  - Announced at all only while a direct (onion) contact exists and never in the whistleblower
 *    edition — see P2PNetworkManager's LAN loop.
 */
object LanDiscovery {
    const val SERVICE_TYPE = "_http._tcp."
    const val ROTATION_MS = 60 * 60 * 1000L

    fun epoch(nowMs: Long = System.currentTimeMillis()): Long = nowMs / ROTATION_MS

    fun serviceName(userId: String, epoch: Long): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(userId.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        val out = mac.doFinal("unpruuf-lan-v2:$epoch".toByteArray(Charsets.UTF_8))
        return out.take(8).joinToString("") { "%02x".format(it) }
    }

    /** Names a contact with [remoteUserId] may be announcing right now — this hour and the last,
     *  so a device whose clock is a little behind (or that hasn't re-announced yet) still matches. */
    fun candidateNames(remoteUserId: String, epoch: Long): List<String> =
        listOf(serviceName(remoteUserId, epoch), serviceName(remoteUserId, epoch - 1), serviceName(remoteUserId, epoch + 1))
}
