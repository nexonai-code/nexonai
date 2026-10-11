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
 *    IPtProxy-Binaries ([PluggableTransportManager]).
 *
 * Dazu die automatische Verbindung (Standard: an): die App probiert selbst die Wege direkt,
 * Firmen-Bridge, obfs4, Snowflake ([ConnectionPaths]) und merkt sich den, der funktioniert hat.
 * Die Firmen-Bridge kommt aus der Node-Liste oder dem Firmen-Feed (Zeilen "bridge:").
 * Die handgepflegten Zeilen oben (Schalter "Tor-Bridges verwenden") haben immer Vorrang.
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

    // ─── Automatische Verbindung ───

    fun isAutomatic(): Boolean = prefs.getBoolean("auto", true)

    fun setAutomatic(on: Boolean) {
        prefs.edit().putBoolean("auto", on).apply()
    }

    /** Der Weg, der beim letzten Mal funktioniert hat (nur fuer den naechsten App-Start). */
    fun lastPath(): TorPath? =
        prefs.getString("lastPath", null)?.let { name -> TorPath.values().firstOrNull { it.name == name } }

    fun setLastPath(path: TorPath?) {
        prefs.edit().apply { if (path == null) remove("lastPath") else putString("lastPath", path.name) }.apply()
    }

    // ─── Firmen-Bridge (aus Node-Liste / Firmen-Feed) ───

    /** Die Bridge-Zeilen der Firma, eine pro Zeile gespeichert. */
    fun companyLines(): List<String> =
        ConnectionPaths.cleanCompanyBridgeLines((prefs.getString("company", "") ?: "").lines())

    /** Fuegt Zeilen aus einer Liste hinzu (ohne Duplikate). Gibt zurueck, ob sich etwas geaendert hat. */
    fun addCompanyLines(lines: List<String>): Boolean {
        val before = companyLines()
        val after = ConnectionPaths.cleanCompanyBridgeLines(before + lines)
        if (after == before) return false
        prefs.edit().putString("company", after.joinToString("\n")).apply()
        return true
    }

    fun clearCompanyLines() {
        prefs.edit().remove("company").apply()
    }
}
