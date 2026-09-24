package com.nexonai.unpruuf.domain.network

import android.content.Context
import com.google.crypto.tink.Aead
import com.google.crypto.tink.KeyTemplates
import com.google.crypto.tink.KeysetHandle
import com.google.crypto.tink.aead.AeadConfig
import com.google.crypto.tink.integration.android.AndroidKeysetManager
import dagger.hilt.android.qualifiers.ApplicationContext
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CryptoManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    companion object {
        private const val KEYSET_NAME = "unpruuf_master_keyset"
        private const val PREF_FILE_NAME = "unpruuf_keyset_prefs"
        private const val MASTER_KEY_URI = "android-keystore://unpruuf_master_key"
    }

    init {
        AeadConfig.register()
    }

    private val keysetHandle: KeysetHandle by lazy {
        AndroidKeysetManager.Builder()
            .withSharedPref(context, KEYSET_NAME, PREF_FILE_NAME)
            .withKeyTemplate(KeyTemplates.get("XCHACHA20_POLY1305"))
            .withMasterKeyUri(MASTER_KEY_URI)
            .build()
            .keysetHandle
    }

    private val aead: Aead by lazy {
        keysetHandle.getPrimitive(Aead::class.java)
    }

    fun encrypt(plaintext: ByteArray, associatedData: ByteArray = ByteArray(0)): ByteArray {
        return aead.encrypt(plaintext, associatedData)
    }

    fun decrypt(ciphertext: ByteArray, associatedData: ByteArray = ByteArray(0)): ByteArray {
        return aead.decrypt(ciphertext, associatedData)
    }

    fun generateDatabaseKey(): ByteArray {
        val key = ByteArray(32)
        java.security.SecureRandom().nextBytes(key)
        return key
    }

    /**
     * Encrypts [plaintext] with a contact's 32-byte receive key using AES-256-GCM.
     * Output layout: 12-byte IV || ciphertext || 16-byte GCM tag.
     */
    fun encryptForContact(plaintext: ByteArray, contactKey32: ByteArray): ByteArray {
        val iv = ByteArray(12).also { SecureRandom().nextBytes(it) }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(contactKey32, "AES"), GCMParameterSpec(128, iv))
        val ciphertext = cipher.doFinal(plaintext)
        return iv + ciphertext
    }

    /**
     * Decrypts a message that was encrypted with [myKey32] (our own receive key).
     */
    fun decryptWithKey(data: ByteArray, myKey32: ByteArray): ByteArray {
        require(data.size > 12) { "Data too short" }
        val iv = data.copyOf(12)
        val ciphertext = data.copyOfRange(12, data.size)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(myKey32, "AES"), GCMParameterSpec(128, iv))
        return cipher.doFinal(ciphertext)
    }

    // Forward secrecy used to live here as a per-message one-time ECIES layer
    // (sender-side only — see CHANGELOG.md 2026-07-10). It's been replaced by a
    // full bidirectional Double Ratchet — see domain/network/ratchet/DoubleRatchet.kt
    // and RatchetSessionManager, which now own message-layer encryption entirely.
}
