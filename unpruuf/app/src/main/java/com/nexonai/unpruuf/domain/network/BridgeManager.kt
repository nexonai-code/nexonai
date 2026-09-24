package com.nexonai.unpruuf.domain.network

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Speichert die Zensur-Umgehungs-Einstellung (Tor-Bridges).
 *
 * Zwei Bridge-Arten:
 *  - Vanilla ("IP:PORT FINGERPRINT"): funktionieren OHNE Pluggable Transport,
 *    helfen gegen einfaches IP-Blocking bekannter Tor-Relays. Werden jetzt
 *    schon angewendet.
 *  - Pluggable Transports (obfs4/snowflake/meek/webtunnel): brauchen die
 *    IPtProxy-Binaries. Werden gespeichert, aber erst im spaeteren
 *    Snowflake-Update aktiv (siehe [needsPluggableTransport]).
 */
@Singleton
class BridgeManager @Inject constructor(
    @ApplicationContext context: Context
) {
    private val prefs = context.getSharedPreferences("bridges", Context.MODE_PRIVATE)

    private val PT_PREFIXES = listOf("obfs4", "snowflake", "meek", "meek_lite", "webtunnel", "scramblesuit")

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

    /** Bridge-Zeilen, die JETZT ohne PT funktionieren (Vanilla). */
    fun usableVanillaLines(): List<String> =
        allLines().filter { line -> PT_PREFIXES.none { line.startsWith(it, ignoreCase = true) } }

    /** Zeilen, die einen Pluggable Transport benoetigen (noch inaktiv). */
    fun pluggableTransportLines(): List<String> =
        allLines().filter { line -> PT_PREFIXES.any { line.startsWith(it, ignoreCase = true) } }

    fun needsPluggableTransport(): Boolean =
        isEnabled() && usableVanillaLines().isEmpty() && pluggableTransportLines().isNotEmpty()
}
