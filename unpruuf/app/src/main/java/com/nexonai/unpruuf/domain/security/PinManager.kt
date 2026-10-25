package com.nexonai.unpruuf.domain.security

import android.content.Context
import android.os.SystemClock
import com.nexonai.unpruuf.domain.network.CryptoManager
import dagger.hilt.android.qualifiers.ApplicationContext
import java.security.SecureRandom
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec
import javax.inject.Inject
import javax.inject.Singleton

/** LOCKED: too many wrong tries in a row — the PIN was not even compared; see [PinManager.lockRemainingMs].
 *  STORE_LOST: the stored PIN hashes are encrypted under a phone key that no longer exists (phone restored,
 *  lock screen reset on some devices). No PIN can match any more; the user must clear the app's data. */
enum class PinResult { NORMAL, PANIC, WRONG, LOCKED, STORE_LOST }

/**
 * Speichert gesalzene PBKDF2-Hashes der normalen PIN und der Panik-PIN.
 * Die PINs selbst werden nie im Klartext gespeichert.
 *
 * Two protections against somebody who has the phone:
 *  - Wrong tries are counted. From the 5th wrong try in a row the PIN pad locks for 30 s, doubling
 *    with every further wrong try up to 1 h. Nothing is compared while locked.
 *  - The hashes are stored encrypted under the phone's Keystore key (same as the identity keys), so
 *    a copy of the app's files alone does not allow guessing the PINs offline; the Keystore key
 *    stays on the device. Older installs with plain hashes are converted on the first correct PIN.
 *
 * Limit that remains: the lock-out counter lives in the app's own storage, timed by the device's wall clock
 * and by its monotonic clock. Moving the date does not shorten a pause (until the phone is restarted);
 * someone with root on the phone can reset the counter. This is protection for a lost or briefly seized
 * phone, not against a forensic lab.
 */
@Singleton
class PinManager @Inject constructor(
    @ApplicationContext context: Context,
    private val crypto: CryptoManager
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
            .putString("pin_hash", seal(hash(pin, salt)))
            .putString("panic_hash", seal(hash(panicPin, salt)))
            .remove("fail_count").remove("locked_until").remove("locked_for").remove("locked_rt")
            .apply()
    }

    /** Milliseconds until the PIN pad accepts a try again; 0 when it is not locked. */
    fun lockRemainingMs(now: Long = System.currentTimeMillis(), elapsed: Long = SystemClock.elapsedRealtime()): Long =
        remainingLockMs(
            wallUntil = prefs.getLong("locked_until", 0L), wallNow = now,
            lockedForMs = prefs.getLong("locked_for", 0L), elapsedAtLock = prefs.getLong("locked_rt", -1L), elapsedNow = elapsed
        )

    fun check(input: String, now: Long = System.currentTimeMillis()): PinResult {
        if (lockRemainingMs(now) > 0) return PinResult.LOCKED
        val salt = prefs.getString("salt", null)?.let { deB64(it) } ?: return PinResult.WRONG
        val candidate = hash(input, salt)
        val stored = prefs.getString("pin_hash", null)
        val panic = prefs.getString("panic_hash", null)
        if (stored != null && stored.startsWith(SEALED) && open(stored) == null) return PinResult.STORE_LOST
        val result = when {
            constantTimeEquals(candidate, open(stored)) -> PinResult.NORMAL
            constantTimeEquals(candidate, open(panic)) -> PinResult.PANIC
            else -> PinResult.WRONG
        }
        if (result == PinResult.WRONG) {
            val fails = prefs.getInt("fail_count", 0) + 1
            val edit = prefs.edit().putInt("fail_count", fails)
            lockDelayMs(fails)?.let {
                edit.putLong("locked_until", now + it)
                // The same pause on the monotonic clock: moving the date forward in the settings does not shorten it.
                edit.putLong("locked_for", it).putLong("locked_rt", SystemClock.elapsedRealtime())
            }
            // commit(): the count must be on disk before the app can be killed and tried again.
            edit.commit()
        } else {
            val edit = prefs.edit().remove("fail_count").remove("locked_until").remove("locked_for").remove("locked_rt")
            // Convert a plain hash from an older install to the encrypted form.
            if (stored != null && !stored.startsWith(SEALED)) edit.putString("pin_hash", seal(stored))
            if (panic != null && !panic.startsWith(SEALED)) edit.putString("panic_hash", seal(panic))
            edit.apply()
        }
        return result
    }

    private fun seal(hashB64: String): String =
        SEALED + android.util.Base64.encodeToString(crypto.encrypt(hashB64.toByteArray(Charsets.UTF_8)), android.util.Base64.NO_WRAP)

    private fun open(stored: String?): String? {
        if (stored == null) return null
        if (!stored.startsWith(SEALED)) return stored
        return runCatching { String(crypto.decrypt(deB64(stored.removePrefix(SEALED))), Charsets.UTF_8) }.getOrNull()
    }

    companion object {
        private const val SEALED = "k1:"
        private const val FREE_TRIES = 4
        private const val FIRST_LOCK_MS = 30_000L
        private const val MAX_LOCK_MS = 60 * 60 * 1000L

        /**
         * What is left of a lock-out, from two clocks. The wall clock survives a restart of the phone but can be
         * moved by hand; the monotonic clock ([elapsedAtLock] was `elapsedRealtime()` when the lock started) cannot,
         * but starts again at a restart (then [elapsedNow] < [elapsedAtLock] and only the wall clock counts).
         * The longer remaining time wins.
         */
        fun remainingLockMs(wallUntil: Long, wallNow: Long, lockedForMs: Long, elapsedAtLock: Long, elapsedNow: Long): Long {
            val wall = (wallUntil - wallNow).coerceAtLeast(0L)
            val since = elapsedNow - elapsedAtLock
            val monotonic = if (elapsedAtLock >= 0 && since >= 0) (lockedForMs - since).coerceAtLeast(0L) else 0L
            return maxOf(wall, monotonic)
        }

        /** Pause after the [fails]-th wrong try in a row: none for the first four, then 30 s, 60 s, 2 min ... up to 1 h. */
        fun lockDelayMs(fails: Int): Long? {
            if (fails <= FREE_TRIES) return null
            val doublings = (fails - FREE_TRIES - 1).coerceAtMost(12)
            return (FIRST_LOCK_MS shl doublings).coerceAtMost(MAX_LOCK_MS)
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
