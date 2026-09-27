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

    /**
     * Off by default — mirrors `unpruuf/server`'s `RELAY_BIND_HOST` env var: when true, the
     * embedded HTTP server binds `0.0.0.0` instead of `127.0.0.1`, reachable directly by
     * anything on the same Wi-Fi (an officer-app dashboard or a browser-based reporter, neither
     * of which speaks Tor — see `unpruuf/officer-app/README.md`'s "Known gaps"), not just
     * through the Tor hidden service. A deliberate, explicit demo/LAN opt-in — leave this off
     * for any real deployment, since it exposes the relay's queue to anyone on that network
     * (still bearer-token-gated, but no longer hidden-service-anonymous on the receiving end).
     */
    var lanAccessEnabled: Boolean
        get() = prefs.getBoolean(KEY_LAN_ACCESS, false)
        set(value) { prefs.edit().putBoolean(KEY_LAN_ACCESS, value).apply() }

    /** Which product this device serves: false = consumer relay (shared token, delete-on-fetch),
     *  true = unpruuf Business Node-Mesh node (owner-only write, read-only fetch, TTL-only
     *  cleanup — NODE_MESH_SPEC.md). Never both at once: they're different trust models. */
    var nodeMeshMode: Boolean
        get() = prefs.getBoolean(KEY_NODE_MESH_MODE, false)
        set(value) { prefs.edit().putBoolean(KEY_NODE_MESH_MODE, value).apply() }

    /** Node-Mesh write key — goes ONLY into the owner's own unpruuf app, never to a contact.
     *  Deliberately separate from [authToken]: a relay token is meant to be shared, this is not. */
    val nodeMeshOwnerSecret: String
        get() = prefs.getString(KEY_NODE_MESH_OWNER_SECRET, null) ?: regenerateNodeMeshOwnerSecret()

    fun regenerateNodeMeshOwnerSecret(): String {
        val secret = randomToken()
        prefs.edit().putString(KEY_NODE_MESH_OWNER_SECRET, secret).apply()
        return secret
    }

    var nodeMeshProfile: String
        get() = prefs.getString(KEY_NODE_MESH_PROFILE, null)
            ?.takeIf { it in RelayConstants.NODE_MESH_PROFILES }
            ?: RelayConstants.NODE_MESH_DEFAULT_PROFILE
        set(value) {
            require(value in RelayConstants.NODE_MESH_PROFILES) { "unknown profile $value" }
            prefs.edit().putString(KEY_NODE_MESH_PROFILE, value).apply()
        }

    val nodeMeshTtlHours: Int
        get() = RelayConstants.NODE_MESH_PROFILES.getValue(nodeMeshProfile)

    /** Which of the owner's (up to 3) nodes this is — only decides where in the 24h cycle this
     *  node's hygiene Reset runs (NODE_MESH_SPEC.md §5). */
    var nodeMeshSlot: Int
        get() = prefs.getInt(KEY_NODE_MESH_SLOT, 1).coerceIn(1, 3)
        set(value) { prefs.edit().putInt(KEY_NODE_MESH_SLOT, value.coerceIn(1, 3)).apply() }

    /** Separate onion key for Node-Mesh mode: a device switching from relay to node gets a new
     *  address, so relay clients can't accidentally land on a node (or the other way round). */
    var nodeMeshTorPrivKey: String?
        get() = prefs.getString(KEY_NODE_MESH_TOR_PRIVKEY, null)
        set(value) { prefs.edit().putString(KEY_NODE_MESH_TOR_PRIVKEY, value).apply() }

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
        const val KEY_LAN_ACCESS = "lan_access_enabled"
        const val KEY_NODE_MESH_MODE = "node_mesh_mode"
        const val KEY_NODE_MESH_OWNER_SECRET = "node_mesh_owner_secret"
        const val KEY_NODE_MESH_PROFILE = "node_mesh_profile"
        const val KEY_NODE_MESH_SLOT = "node_mesh_slot"
        const val KEY_NODE_MESH_TOR_PRIVKEY = "node_mesh_tor_privkey"
    }
}
