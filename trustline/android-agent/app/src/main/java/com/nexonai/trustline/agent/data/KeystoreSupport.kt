package com.nexonai.trustline.agent.data

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import com.nexonai.trustline.agent.core.Crypto
import com.nexonai.trustline.agent.core.Signer
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** The device signing key lives in the Android Keystore (hardware-backed where available) and never leaves the device. */
class KeystoreSigner private constructor(private val alias: String) : Signer {
    private fun keyStore(): KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    fun publicSpki(): String = Crypto.b64e(keyStore().getCertificate(alias).publicKey.encoded)
    override val signKid: String by lazy { Crypto.keyId(publicSpki()) }

    override fun signRaw(data: ByteArray): String {
        val priv = keyStore().getKey(alias, null) as PrivateKey
        val s = Signature.getInstance("SHA256withECDSA")
        s.initSign(priv)
        s.update(data)
        return Crypto.b64e(Crypto.derToRaw(s.sign()))
    }

    /** True when the key is protected by dedicated secure hardware (TEE or StrongBox). */
    fun hardwareBacked(): Boolean = try {
        val priv = keyStore().getKey(alias, null) as PrivateKey
        val info = java.security.KeyFactory.getInstance(priv.algorithm, "AndroidKeyStore").getKeySpec(priv, android.security.keystore.KeyInfo::class.java)
        info.isInsideSecureHardware
    } catch (e: Exception) { false }

    companion object {
        fun existing(alias: String): KeystoreSigner? =
            if (KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.containsAlias(alias)) KeystoreSigner(alias) else null

        fun generate(alias: String): KeystoreSigner {
            fun spec(strongBox: Boolean) = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
                .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                .setDigests(KeyProperties.DIGEST_SHA256)
                .apply { if (strongBox && Build.VERSION.SDK_INT >= 28) setIsStrongBoxBacked(true) }
                .build()
            val kpg = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
            try {
                kpg.initialize(spec(true))
                kpg.generateKeyPair()
            } catch (e: Exception) {
                kpg.initialize(spec(false))
                kpg.generateKeyPair()
            }
            return KeystoreSigner(alias)
        }

        fun delete(alias: String) {
            runCatching { KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(alias) }
        }
    }
}

/** Encrypts the app's local state (including the Channel B decryption key) with a Keystore-held AES-256-GCM key. */
object SecureBox {
    private const val ALIAS = "trustline_state_key_v1"

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (!ks.containsAlias(ALIAS)) {
            val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            gen.init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build())
            gen.generateKey()
        }
        return ks.getKey(ALIAS, null) as SecretKey
    }

    fun encrypt(plain: ByteArray): ByteArray {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, key())
        return c.iv + c.doFinal(plain)
    }

    fun decrypt(blob: ByteArray): ByteArray {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, blob.copyOfRange(0, 12)))
        return c.doFinal(blob, 12, blob.size - 12)
    }

    fun delete() {
        runCatching { KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(ALIAS) }
    }
}
