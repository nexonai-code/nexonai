package com.nexonai.unpruuf.domain.license

import android.content.Context
import android.provider.Settings
import android.util.Base64
import com.google.crypto.tink.subtle.Ed25519Verify
import com.nexonai.unpruuf.domain.AppEdition
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton

/** The parsed, already-signature-verified contents of a license code. */
data class LicenseInfo(
    val edition: String,
    val serial: String,
    val customer: String,
    val issuedAtMs: Long,
    val expiresAtMs: Long
)

sealed class LicenseState {
    object NotConfigured : LicenseState()
    data class Valid(val info: LicenseInfo, val daysLeft: Long) : LicenseState()
    data class ExpiringSoon(val info: LicenseInfo, val daysLeft: Long) : LicenseState()
    data class Expired(val info: LicenseInfo) : LicenseState()
    data class Invalid(val reason: String) : LicenseState()
}

/**
 * Offline license check — no server, ever (see unpruuf/license-tool/ for the offline
 * generator that issues codes; keygen.js's own private key never leaves that tool). A
 * license code is `unpruuf-license:v1:<base64url(payload)>:<base64url(signature)>`, where
 * payload is `1|<edition>|<serial>|<customer>|<issuedAtMs>|<expiresAtMs>` — same hand-rolled,
 * pipe-delimited style as RelayManager's connection string, deliberately not JSON so there's
 * nothing to canonicalize before verifying. [PUBLIC_KEY_B64] is the public half of an Ed25519
 * key pair; verified with Tink's `Ed25519Verify` (already a dependency — see CryptoManager),
 * which this file's Node-vs-Tink compatibility was cross-checked against before shipping.
 *
 * Deliberately does NOT try to enforce a global seat count — that is structurally impossible
 * without a server (no device can know what any other device is doing). What this DOES
 * enforce, entirely offline: (1) a code must carry a genuine signature from the license
 * authority's private key — no one can forge a new expiry date without it; (2) a code
 * self-binds to the first device it's activated on ([deviceFingerprint]) — copying one
 * activated seat's app data onto a second device is detected and rejected; (3) the expiry
 * clock can't be defeated by simply turning the system clock back — see [trustedNowMs].
 * Enforcing "exactly N seats sold" stays a contractual matter, not a technical one.
 */
@Singleton
class LicenseManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val prefs = context.getSharedPreferences("license", Context.MODE_PRIVATE)

    private val _state = MutableStateFlow<LicenseState>(LicenseState.NotConfigured)
    val state: StateFlow<LicenseState> = _state.asStateFlow()

    init {
        _state.value = computeState()
    }

    /** Client edition is free (see AppEdition/EDITIONS.md) — no license is asked of it. */
    val requiresLicense: Boolean get() = !AppEdition.isClient

    /**
     * Verifies and stores [code]. Returns null on success, or a short user-facing reason on
     * failure (nothing is stored in that case). Re-entering the SAME device's already-bound
     * license, or a renewal code for the same serial, both succeed normally — the device-bind
     * check only ever rejects a code arriving already bound to a DIFFERENT device.
     */
    fun applyLicenseCode(code: String): String? {
        if (parseAndVerify(code) == null) return "This license code isn't valid."
        val boundHash = prefs.getString(KEY_DEVICE_HASH, null)
        val thisHash = deviceFingerprint()
        if (boundHash != null && boundHash != thisHash) {
            return "This license is already activated on a different device."
        }
        prefs.edit()
            .putString(KEY_CODE, code)
            .putString(KEY_DEVICE_HASH, boundHash ?: thisHash)
            .apply()
        _state.value = computeState()
        return null
    }

    fun refresh() {
        _state.value = computeState()
    }

    private fun computeState(): LicenseState {
        val code = prefs.getString(KEY_CODE, null) ?: return LicenseState.NotConfigured
        val info = parseAndVerify(code)
            ?: return LicenseState.Invalid("The stored license failed re-verification.")
        val boundHash = prefs.getString(KEY_DEVICE_HASH, null)
        if (boundHash != null && boundHash != deviceFingerprint()) {
            return LicenseState.Invalid("This license is activated on a different device.")
        }
        val now = trustedNowMs()
        val daysLeft = (info.expiresAtMs - now) / MS_PER_DAY
        return when {
            now >= info.expiresAtMs -> LicenseState.Expired(info)
            daysLeft <= EXPIRING_SOON_DAYS -> LicenseState.ExpiringSoon(info, daysLeft)
            else -> LicenseState.Valid(info, daysLeft)
        }
    }

    private fun parseAndVerify(code: String): LicenseInfo? {
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
        if (fields.size != 6 || fields[0] != "1") return null
        val edition = fields[1]
        if (edition != AppEdition.STANDARD && edition != AppEdition.PRO && edition != AppEdition.CLIENT) return null
        // A genuinely-signed license for one edition must not unlock a build of another —
        // otherwise a cheaper Standard code activates the Pro build just as well, since
        // nothing else here is edition-gated. license-tool/issue.js's own --edition flag
        // documents this as enforced; it wasn't actually checked until this line existed.
        if (edition != AppEdition.current) return null
        val issuedAtMs = fields[4].toLongOrNull() ?: return null
        val expiresAtMs = fields[5].toLongOrNull() ?: return null
        return LicenseInfo(edition, fields[2], fields[3], issuedAtMs, expiresAtMs)
    }

    // A signed license means nothing if "now" can just be lied to by turning the device clock
    // back — so this never trusts System.currentTimeMillis() alone. It remembers the highest
    // timestamp it has ever seen (persisted, never decreases) and uses THAT as "now" whenever
    // it's later than the current clock reading. Rolling the clock back stops helping the
    // moment the app has seen a later date even once; it does nothing on a device that has
    // never run past the expiry date in the first place (nothing to roll back from yet) — an
    // inherent limit of any clock check that doesn't call out to a trusted third party, which
    // is exactly the "no server" constraint this whole scheme works under.
    private fun trustedNowMs(): Long {
        val storedHighWater = prefs.getLong(KEY_TRUSTED_NOW, 0L)
        val now = maxOf(storedHighWater, System.currentTimeMillis())
        if (now > storedHighWater) prefs.edit().putLong(KEY_TRUSTED_NOW, now).apply()
        return now
    }

    // ANDROID_ID survives app reinstalls and factory-default app data, but resets on a factory
    // reset and can differ across user profiles on the same physical device — a reasonable,
    // permission-free "which device is this" signal without needing IMEI/hardware serial (both
    // restricted APIs on modern Android, and overkill for "was this app-data folder copied to
    // a second phone").
    private fun deviceFingerprint(): String {
        val androidId = runCatching {
            Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
        }.getOrNull().orEmpty()
        val digest = MessageDigest.getInstance("SHA-256").digest(androidId.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }

    private fun decodeBase64Url(s: String): ByteArray? = runCatching {
        val rem = s.length % 4
        val padded = if (rem == 0) s else s + "====".substring(rem)
        Base64.decode(padded, Base64.URL_SAFE or Base64.NO_WRAP)
    }.getOrNull()

    companion object {
        private const val PREFIX = "unpruuf-license:v1:"
        private const val EXPIRING_SOON_DAYS = 30L
        private const val MS_PER_DAY = 24L * 60 * 60 * 1000

        private const val KEY_CODE = "code"
        private const val KEY_DEVICE_HASH = "device_hash"
        private const val KEY_TRUSTED_NOW = "trusted_now_high_water_ms"

        // Public half of the Ed25519 key pair from license-tool/keygen.js. Safe to be public —
        // it can only VERIFY signatures, never create new ones. Rotating it (running keygen.js
        // again) invalidates every license issued under the old key; every future app build
        // would need the new value here.
        const val PUBLIC_KEY_B64 = "67A_r4YeFkvYoXDF30gar2gRBcufokgvYQd5dVeEwKE"
    }
}
