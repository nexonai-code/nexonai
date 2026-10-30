package com.nexonai.unpruuf.domain.security

import android.content.SharedPreferences
import java.util.Base64

/** Where [SealedStrings] keeps its (already sealed) text. A small seam so the logic can be tested without Android. */
interface StringStore {
    fun get(key: String): String?
    fun put(key: String, value: String)
}

class SharedPrefsStore(private val prefs: SharedPreferences) : StringStore {
    override fun get(key: String): String? = prefs.getString(key, null)
    override fun put(key: String, value: String) { prefs.edit().putString(key, value).apply() }
}

/**
 * Text values that must not lie around in the clear in the app's settings file: owner secrets of the
 * user's own nodes, relay tokens, feed keys. Each value is encrypted with the phone-bound key
 * (`CryptoManager`, Android Keystore) and stored as `k1:<base64>`.
 *
 * Values written before 2026-10-19 are plain text. They are still read correctly, and rewritten
 * encrypted the first time they are read, so an update needs no separate migration step.
 *
 * If a sealed value cannot be opened (the phone key is gone after a restore) the default comes back,
 * the same behaviour as the identity keys that live under the same phone key.
 */
class SealedStrings(
    private val store: StringStore,
    private val seal: (ByteArray) -> ByteArray,
    private val open: (ByteArray) -> ByteArray
) {
    fun get(key: String, default: String = ""): String {
        val raw = store.get(key) ?: return default
        if (!raw.startsWith(PREFIX)) {
            store.put(key, sealed(raw))
            return raw
        }
        return runCatching {
            String(open(Base64.getDecoder().decode(raw.removePrefix(PREFIX))), Charsets.UTF_8)
        }.getOrDefault(default)
    }

    fun put(key: String, value: String) = store.put(key, sealed(value))

    private fun sealed(plain: String): String =
        PREFIX + Base64.getEncoder().encodeToString(seal(plain.toByteArray(Charsets.UTF_8)))

    companion object {
        const val PREFIX = "k1:"
    }
}
