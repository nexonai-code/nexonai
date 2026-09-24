package com.nexonai.unpruuf.domain.relay

import android.content.Context
import android.util.Base64
import com.google.crypto.tink.subtle.Ed25519Verify
import com.nexonai.unpruuf.domain.network.RelayManager
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/** The parsed, already-signature-verified contents of an imported relay-pool manifest. */
data class RelayPoolManifestInfo(
    val org: String,
    val issuedAtMs: Long,
    val relays: List<String>
)

/**
 * Offline import of a company-issued relay-pool manifest — see unpruuf/relaypool-tool/ for the
 * offline signer (keygen.js's private key never leaves that tool, and is a SEPARATE key pair
 * from LicenseManager's — a leaked relay-pool key only lets someone hand out bogus relay
 * ADDRESSES, never a valid app license, and vice versa). Format:
 * `unpruuf-relaypool:v1:<base64url(payload)>:<base64url(signature)>`, payload
 * `1|<org>|<issuedAtMs>|<relay1>;<relay2>;...` — same hand-rolled pipe-delimited style as
 * LicenseManager/RelayManager, verified with Tink's Ed25519Verify (cross-checked against
 * relaypool-tool's Node-side signer before shipping — a manifest signed with Node's own
 * `crypto.sign` verifies correctly here).
 *
 * Deliberately not device-bound and not gated behind any "enterprise account" concept — any
 * user who has the manifest text (received however the company distributes it: email, intranet,
 * printed card) can import it; see the plan's confirmed decision to keep v1 unrestricted. On
 * success, REPLACES (not merges) the locally configured backup relay pool via
 * [RelayManager.setExtraConnectionStrings] — re-importing an updated manifest is how a company
 * rotates its server list without asking every employee to hand-edit Settings.
 */
@Singleton
class RelayPoolManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val relayManager: RelayManager
) {
    private val prefs = context.getSharedPreferences("relay_pool_manifest", Context.MODE_PRIVATE)

    private val _lastImported = MutableStateFlow(loadStored())
    val lastImported: StateFlow<RelayPoolManifestInfo?> = _lastImported.asStateFlow()

    /** Verifies and applies [code]. Returns null on success, or a short user-facing reason on
     *  failure (nothing is changed in that case). */
    fun importManifest(code: String): String? {
        val info = parseAndVerify(code) ?: return "This relay-pool code isn't valid."
        relayManager.setExtraConnectionStrings(info.relays)
        prefs.edit()
            .putString(KEY_ORG, info.org)
            .putLong(KEY_ISSUED_AT, info.issuedAtMs)
            .putString(KEY_RELAYS, info.relays.joinToString(";"))
            .apply()
        _lastImported.value = info
        return null
    }

    private fun loadStored(): RelayPoolManifestInfo? {
        val org = prefs.getString(KEY_ORG, null) ?: return null
        val issuedAt = prefs.getLong(KEY_ISSUED_AT, -1L)
        val relays = RelayManager.parseConnectionStringList(prefs.getString(KEY_RELAYS, "") ?: "")
        if (issuedAt < 0 || relays.isEmpty()) return null
        return RelayPoolManifestInfo(org, issuedAt, relays)
    }

    private fun parseAndVerify(code: String): RelayPoolManifestInfo? {
        val trimmed = code.trim()
        if (!trimmed.startsWith(PREFIX)) return null
        val rest = trimmed.substring(PREFIX.length)
        val sep = rest.lastIndexOf(':')
        if (sep <= 0 || sep == rest.length - 1) return null
        val payload = decodeBase64Url(rest.substring(0, sep)) ?: return null
        val signature = decodeBase64Url(rest.substring(sep + 1)) ?: return null
        if (signature.size != 64) return null

        val publicKey = decodeBase64Url(PUBLIC_KEY_B64) ?: return null
        val verified = runCatching { Ed25519Verify(publicKey).verify(signature, payload) }.isSuccess
        if (!verified) return null

        val fields = String(payload, Charsets.UTF_8).split("|")
        if (fields.size != 4 || fields[0] != "1") return null
        val org = fields[1]
        if (org.isBlank()) return null
        val issuedAtMs = fields[2].toLongOrNull() ?: return null
        val relays = RelayManager.parseConnectionStringList(fields[3])
        if (relays.isEmpty() || relays.any { RelayManager.parseConnectionString(it) == null }) return null
        return RelayPoolManifestInfo(org, issuedAtMs, relays)
    }

    private fun decodeBase64Url(s: String): ByteArray? = runCatching {
        val rem = s.length % 4
        val padded = if (rem == 0) s else s + "====".substring(rem)
        Base64.decode(padded, Base64.URL_SAFE or Base64.NO_WRAP)
    }.getOrNull()

    companion object {
        private const val PREFIX = "unpruuf-relaypool:v1:"
        private const val KEY_ORG = "org"
        private const val KEY_ISSUED_AT = "issued_at_ms"
        private const val KEY_RELAYS = "relays"

        // Public half of a SEPARATE Ed25519 key pair from LicenseManager's — see
        // relaypool-tool/keygen.js. Safe to be public; only verifies, never signs. Must match
        // the constant in RelayPoolManager.swift on iOS exactly (both platforms verify manifests
        // issued by the same relaypool-tool key).
        const val PUBLIC_KEY_B64 = "jyPHi5C8bldr8B5p4lGz65Id3Rxqe0UFgov1A9r5y1A"
    }
}
