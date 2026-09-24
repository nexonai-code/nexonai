package com.nexonai.unpruuf.relay.core

import android.content.Context

/**
 * Persists this relay's censorship-circumvention (Tor bridge) setting. Direct Kotlin port of
 * the main messenger app's `domain/network/BridgeManager.kt` — same two bridge kinds, same
 * split logic, same reasoning: a relay needs this even more than a personal messenger,
 * since a relay someone can't reach Tor to run at all is useless to everyone depending on it,
 * not just its owner.
 *
 * Two bridge kinds:
 *  - Vanilla (`IP:PORT FINGERPRINT`): work WITHOUT a pluggable transport, help against simple
 *    IP-blocking of known Tor relays.
 *  - Pluggable transports (obfs4/snowflake/meek/webtunnel/scramblesuit): need the IPtProxy
 *    client (see [com.nexonai.unpruuf.relay.net.RelayPluggableTransportManager]) — only
 *    obfs4/snowflake are actually started by that class; the others are recognized here so a
 *    pasted meek/webtunnel line is correctly excluded from the vanilla set rather than sent to
 *    Tor as a malformed vanilla bridge, even though this app doesn't run their PT clients yet.
 */
class RelayBridgeManager(context: Context) {

    private val prefs = context.getSharedPreferences("relay_bridges", Context.MODE_PRIVATE)

    private val ptPrefixes = listOf("obfs4", "snowflake", "meek", "meek_lite", "webtunnel", "scramblesuit")

    fun isEnabled(): Boolean = prefs.getBoolean("enabled", false)

    fun setEnabled(enabled: Boolean) {
        prefs.edit().putBoolean("enabled", enabled).apply()
    }

    fun getBridgeText(): String = prefs.getString("lines", "") ?: ""

    fun setBridgeText(text: String) {
        prefs.edit().putString("lines", text).apply()
    }

    private fun allLines(): List<String> =
        getBridgeText().lines().map { it.trim() }.filter { it.isNotEmpty() }

    /** Bridge lines usable right now, without any pluggable transport. */
    fun usableVanillaLines(): List<String> =
        allLines().filter { line -> ptPrefixes.none { line.startsWith(it, ignoreCase = true) } }

    /** Lines that need a pluggable transport client running to be usable. */
    fun pluggableTransportLines(): List<String> =
        allLines().filter { line -> ptPrefixes.any { line.startsWith(it, ignoreCase = true) } }
}
