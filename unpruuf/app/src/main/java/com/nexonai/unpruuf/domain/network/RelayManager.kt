package com.nexonai.unpruuf.domain.network

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Settings for the optional store-and-forward relay fallback (see server/README.md). Off by
 * default, consistent with the app's zero-infrastructure-by-default posture.
 *
 * [RelayMode.OFF]: never used, same as before this existed. [RelayMode.AUTO]: the direct
 * LAN/Tor path is tried first as usual; the relay is used only as a fallback once direct
 * delivery has failed (a contact appears offline), or proactively for transfers over
 * [P2PNetworkManager]'s size threshold, where a slow/fragile direct Tor transfer is less
 * reliable than the relay mailbox. [RelayMode.MANDATORY]: LAN/Tor are skipped entirely for
 * every contact — the same shape cross-platform (iOS-interop) contacts already use
 * unconditionally, made available globally for testing the relay path in isolation. Meant to
 * be switched back and forth freely, not a one-way setting.
 *
 * A relay requires both an address AND an auth token (see server/src/middleware/auth.ts) —
 * both come from the relay operator's printed QR code / connection string (see
 * server/src/connectionString.ts, [parseConnectionString] below is its Kotlin counterpart and
 * MUST stay in sync with it byte-for-byte).
 */
@Singleton
class RelayManager @Inject constructor(
    @ApplicationContext context: Context
) {
    private val prefs = context.getSharedPreferences("relay", Context.MODE_PRIVATE)

    enum class RelayMode { OFF, AUTO, MANDATORY }

    fun getMode(): RelayMode =
        runCatching { RelayMode.valueOf(prefs.getString("mode", null) ?: "") }
            .getOrDefault(RelayMode.OFF)

    fun setMode(mode: RelayMode) {
        prefs.edit().putString("mode", mode.name).apply()
    }

    fun getRelayOnion(): String = prefs.getString("onion", "") ?: ""
    fun getAuthToken(): String = prefs.getString("auth_token", "") ?: ""

    /**
     * Parses a scanned or pasted connection string (`unpruuf-relay:v1:<address>:<token>`) and
     * stores both fields together, so the app is never left with a mismatched address/token
     * pair. Returns false (and stores nothing) if [raw] isn't a valid connection string.
     */
    fun applyConnectionString(raw: String): Boolean {
        val parsed = parseConnectionString(raw) ?: return false
        prefs.edit()
            .putString("onion", parsed.address)
            .putString("auth_token", parsed.authToken)
            .apply()
        return true
    }

    /** True only when the relay is enabled (mode != OFF) AND a full, usable address+token pair
     *  is configured. */
    fun isUsable(): Boolean =
        getMode() != RelayMode.OFF && getRelayOnion().endsWith(".onion") && getAuthToken().isNotEmpty()

    /** Convenience for [P2PNetworkManager]'s delivery logic — true only when relay use should
     *  bypass LAN/Tor-direct entirely for every contact, not just as a fallback. */
    fun isMandatory(): Boolean = getMode() == RelayMode.MANDATORY

    /** Reconstructs the connection string for the CURRENTLY configured relay — the inverse of
     *  [applyConnectionString]. Used by cross-platform pairing (see CrossPlatformPairing.kt) to
     *  put "how to reach me" into a QR code; callers must check [isUsable] first. */
    fun connectionString(): String = "$PREFIX${getRelayOnion()}:${getAuthToken()}"

    /** Backup relay(s), beyond the primary configured above — either hand-entered in Settings or
     *  populated from an imported, signed relay-pool manifest (see `RelayPoolManager`). Stored
     *  as one `;`-joined string, same trick used for a contact's own relay pool
     *  (`Contact.theirRelayConnectionString`, reinterpreted) and for the wire format itself. */
    fun getExtraConnectionStrings(): List<String> =
        parseConnectionStringList(prefs.getString("extra_connection_strings", "") ?: "")

    fun setExtraConnectionStrings(list: List<String>) {
        prefs.edit().putString("extra_connection_strings", buildConnectionStringList(list)).apply()
    }

    /** The full pool a new pairing QR advertises: my primary relay first (if usable), then
     *  backups, deduped and capped at [RELAY_POOL_MAX_SIZE] — never more than the QR format
     *  itself allows, so callers don't have to re-check that invariant. */
    fun getMyRelayPool(): List<String> {
        val primary = if (isUsable()) listOf(connectionString()) else emptyList()
        return (primary + getExtraConnectionStrings()).distinct().take(RELAY_POOL_MAX_SIZE)
    }

    companion object {
        private const val PREFIX = "unpruuf-relay:v1:"

        /** Max entries carried in a pairing QR's own relay pool — a deliberate tradeoff between
         *  failover redundancy and QR payload size (see CrossPlatformPairing.kt's doc comment).
         *
         *  Raised 2 → 3 on 2026‑09‑17 (primary + two fallbacks), together with carrying the pool
         *  in the *standard* pairing QR as well (see QrPairViewModel's `n` field). Measured cost:
         *  one entry is ~106 chars once the constant `unpruuf-relay:v1:` prefix is stripped, so a
         *  ~320-char QR payload grows to ~530 with two relays and ~650 with three — i.e. going
         *  from two to three is nearly free, the jump is carrying them at all. Nothing is added
         *  when no relay is configured, so users who don't use one keep the small QR they had.
         *
         *  iOS caveat: `RelayConnectionString.maxPoolSize` on the iOS side is still 2. Until it
         *  is raised to match, an iOS peer parsing an Android QR keeps only the first two entries
         *  — the third is simply unused, not mis-parsed (see CROSS_PLATFORM_PLAN.md). */
        const val RELAY_POOL_MAX_SIZE = 3

        data class ParsedConnection(val address: String, val authToken: String)

        /**
         * Kotlin port of server/src/connectionString.ts's parseConnectionString — see that
         * file's doc comment for the format rationale. Keep both in lockstep if the format ever
         * changes; there's no shared code between the two runtimes to enforce it automatically.
         */
        fun parseConnectionString(raw: String): ParsedConnection? {
            val trimmed = raw.trim()
            if (!trimmed.startsWith(PREFIX)) return null
            val rest = trimmed.substring(PREFIX.length)
            // The address itself may contain no colons (a bare .onion) or one (host:port) — the
            // auth token is always the LAST segment, so split from the right.
            val lastColon = rest.lastIndexOf(':')
            if (lastColon <= 0 || lastColon == rest.length - 1) return null
            val address = rest.substring(0, lastColon)
            val authToken = rest.substring(lastColon + 1)
            if (address.isEmpty() || authToken.isEmpty()) return null
            return ParsedConnection(address, authToken)
        }

        /** Joins full `unpruuf-relay:v1:...` connection strings with `;` — safe because neither
         *  a bare/host:port address nor a base64url auth token can contain `;` (see
         *  server/src/identity.ts's generateToken() alphabet). Drops blank entries and caps at
         *  [RELAY_POOL_MAX_SIZE], so callers never have to re-check invariants after the fact. */
        fun buildConnectionStringList(list: List<String>): String =
            list.map { it.trim() }.filter { it.isNotEmpty() }.take(RELAY_POOL_MAX_SIZE).joinToString(";")

        /** Splits a `;`-joined list back into individual connection strings — does NOT validate
         *  each one with [parseConnectionString]; callers that need only well-formed entries
         *  should filter with that themselves (kept separate so a partially-malformed list
         *  doesn't lose its still-good entries here). */
        fun parseConnectionStringList(raw: String): List<String> =
            raw.split(";").map { it.trim() }.filter { it.isNotEmpty() }
    }
}
