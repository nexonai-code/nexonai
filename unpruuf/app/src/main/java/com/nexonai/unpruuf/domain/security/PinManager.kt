package com.nexonai.unpruuf.domain.security

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import java.security.SecureRandom
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec
import javax.inject.Inject
import javax.inject.Singleton

enum class PinResult { NORMAL, PANIC, WRONG }

/**
 * Speichert gesalzene PBKDF2-Hashes der normalen PIN und der Panik-PIN.
 * Die PINs selbst werden nie im Klartext gespeichert.
 */
@Singleton
class PinManager @Inject constructor(
    @ApplicationContext context: Context
) {
    private val prefs = context.getSharedPreferences("pin_store", Context.MODE_PRIVATE)

    fun isPinSet(): Boolean =
        prefs.contains("pin_hash") && prefs.contains("panic_hash")

    // Opt-in, off by default. Biometric unlock can only ever stand in for the NORMAL PIN —
    // there is no biometric equivalent of the panic PIN (no "duress fingerprint" gesture), so
    // this flag never affects panic-PIN behavior; see LockViewModel.biometricUnlock().
    fun isBiometricEnabled(): Boolean = prefs.getBoolean("biometric_enabled", false)
    fun setBiometricEnabled(enabled: Boolean) {
        prefs.edit().putBoolean("biometric_enabled", enabled).apply()
    }

    fun setPins(pin: String, panicPin: String) {
        val salt = ByteArray(16).also { SecureRandom().nextBytes(it) }
        val saltB64 = b64(salt)
        prefs.edit()
            .putString("salt", saltB64)
            .putString("pin_hash", hash(pin, salt))
            .putString("panic_hash", hash(panicPin, salt))
            .apply()
    }

    fun check(input: String): PinResult {
        val salt = prefs.getString("salt", null)?.let { deB64(it) } ?: return PinResult.WRONG
        val candidate = hash(input, salt)
        return when {
            constantTimeEquals(candidate, prefs.getString("pin_hash", null)) -> PinResult.NORMAL
            constantTimeEquals(candidate, prefs.getString("panic_hash", null)) -> PinResult.PANIC
            else -> PinResult.WRONG
        }
    }

    private fun hash(pin: String, salt: ByteArray): String {
        val spec = PBEKeySpec(pin.toCharArray(), salt, 120_000, 256)
        val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        return b64(factory.generateSecret(spec).encoded)
    }

    private fun constantTimeEquals(a: String, b: String?): Boolean {
        if (b == null || a.length != b.length) return false
        var diff = 0
        for (i in a.indices) diff = diff or (a[i].code xor b[i].code)
        return diff == 0
    }

    private fun b64(b: ByteArray) = android.util.Base64.encodeToString(b, android.util.Base64.NO_WRAP)
    private fun deB64(s: String) = android.util.Base64.decode(s, android.util.Base64.NO_WRAP)
}
