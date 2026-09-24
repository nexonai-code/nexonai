package com.nexonai.unpruuf.relay.core

import android.content.Context
import android.util.Base64
import java.security.SecureRandom

/**
 * This relay instance's persisted identity: the bearer token clients must present on every
 * request, this device's Tor hidden-service private key, and the operator-configurable TTL.
 * Mirrors unpruuf/server/src/identity.ts (a JSON file there; SharedPreferences here — same
 * "generate once, persist, survive restarts" contract, just Android's idiomatic storage).
 */
class RelayIdentity(context: Context) {

    private val prefs = context.getSharedPreferences("relay_identity", Context.MODE_PRIVATE)

    /** Bearer token required on every /v1/relay and /v1/fetch call. Generated once, on first
     *  read, and persisted — restarting the app must never strand already-paired clients. */
    val authToken: String
        get() = prefs.getString(KEY_AUTH_TOKEN, null) ?: generateAndStoreToken()

    /** How long a queued blob is kept before the sweep deletes it — the "reset" the user
     *  configures in Settings. Defaults to RelayConstants.DEFAULT_TTL_HOURS until changed. */
    var ttlHours: Int
        get() = prefs.getInt(KEY_TTL_HOURS, RelayConstants.DEFAULT_TTL_HOURS)
        set(value) {
            val clamped = value.coerceIn(RelayConstants.MIN_TTL_HOURS, RelayConstants.MAX_TTL_HOURS)
            prefs.edit().putInt(KEY_TTL_HOURS, clamped).apply()
        }

    /** Tor hidden-service private key — persisted so this relay keeps the SAME onion address
     *  (and therefore the same connection string) across restarts, instead of generating a new
     *  identity every launch and stranding every already-paired client. */
    var torPrivKey: String?
        get() = prefs.getString(KEY_TOR_PRIVKEY, null)
        set(value) { prefs.edit().putString(KEY_TOR_PRIVKEY, value).apply() }

    /** Forces a fresh token — "credentials compromised, rotate them" (mirrors identity.ts's
     *  --regenerate flag). Every device paired with the OLD token loses access immediately;
     *  the UI must make that consequence explicit before calling this. */
    fun regenerateToken(): String {
        val token = randomToken()
        prefs.edit().putString(KEY_AUTH_TOKEN, token).apply()
        return token
    }

    private fun generateAndStoreToken(): String {
        val token = randomToken()
        prefs.edit().putString(KEY_AUTH_TOKEN, token).apply()
        return token
    }

    private fun randomToken(): String {
        val bytes = ByteArray(32)
        SecureRandom().nextBytes(bytes)
        return Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    }

    private companion object {
        const val KEY_AUTH_TOKEN = "auth_token"
        const val KEY_TTL_HOURS = "ttl_hours"
        const val KEY_TOR_PRIVKEY = "tor_privkey"
    }
}
