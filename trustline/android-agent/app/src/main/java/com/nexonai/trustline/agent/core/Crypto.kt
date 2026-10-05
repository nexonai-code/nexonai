package com.nexonai.trustline.agent.core

import java.security.KeyFactory
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.SecureRandom
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.security.spec.PKCS8EncodedKeySpec
import java.security.spec.X509EncodedKeySpec
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/** Signs data with the device signing key. Implemented by the Android Keystore (real device) and by a software key (tests). */
interface Signer {
    /** SHA-256 over the SPKI public key, first 16 hex chars. */
    val signKid: String
    /** Returns the raw (r||s, 64 bytes) ECDSA P-256 / SHA-256 signature, base64. */
    fun signRaw(data: ByteArray): String
}

/**
 * All cryptography of the TrustLine protocol on the JVM/Android side. Formats are identical to
 * server/public/tlcrypto.js: SPKI DER public keys (base64), raw r||s ECDSA signatures (base64),
 * ECDH P-256 + HKDF-SHA256 + AES-256-GCM for Channel B packages.
 */
object Crypto {
    private val rng = SecureRandom()

    fun randomBytes(n: Int): ByteArray = ByteArray(n).also { rng.nextBytes(it) }
    fun b64e(b: ByteArray): String = Base64.getEncoder().encodeToString(b)
    fun b64d(s: String): ByteArray = Base64.getDecoder().decode(s)
    fun hex(b: ByteArray): String = b.joinToString("") { String.format("%02x", it.toInt() and 0xff) }
    fun sha256(b: ByteArray): ByteArray = MessageDigest.getInstance("SHA-256").digest(b)
    fun sha256Hex(s: String): String = hex(sha256(s.toByteArray(Charsets.UTF_8)))
    fun keyId(spkiB64: String): String = hex(sha256(b64d(spkiB64))).substring(0, 16)

    // ---------------------------------------------------------------- ECDSA (raw <-> DER)
    fun derToRaw(der: ByteArray): ByteArray {
        var i = 0
        require(der[i++].toInt() == 0x30) { "bad DER signature" }
        var len = der[i++].toInt() and 0xff
        if (len and 0x80 != 0) { i += len and 0x7f }
        fun readInt(): ByteArray {
            require(der[i++].toInt() == 0x02) { "bad DER integer" }
            val l = der[i++].toInt() and 0xff
            val v = der.copyOfRange(i, i + l)
            i += l
            return v
        }
        val r = readInt()
        val s = readInt()
        fun fit(v: ByteArray): ByteArray {
            var start = 0
            while (start < v.size - 1 && v[start].toInt() == 0) start++
            val t = v.copyOfRange(start, v.size)
            require(t.size <= 32) { "integer too large" }
            return ByteArray(32 - t.size) + t
        }
        return fit(r) + fit(s)
    }

    fun rawToDer(raw: ByteArray): ByteArray {
        require(raw.size == 64) { "raw signature must be 64 bytes" }
        fun enc(v: ByteArray): ByteArray {
            var start = 0
            while (start < v.size - 1 && v[start].toInt() == 0) start++
            var t = v.copyOfRange(start, v.size)
            if (t[0].toInt() and 0x80 != 0) t = byteArrayOf(0) + t
            return byteArrayOf(0x02, t.size.toByte()) + t
        }
        val body = enc(raw.copyOfRange(0, 32)) + enc(raw.copyOfRange(32, 64))
        return byteArrayOf(0x30, body.size.toByte()) + body
    }

    fun verifyRaw(spkiB64: String, data: ByteArray, sigRawB64: String): Boolean = try {
        val pub = KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(b64d(spkiB64)))
        val sig = Signature.getInstance("SHA256withECDSA")
        sig.initVerify(pub)
        sig.update(data)
        sig.verify(rawToDer(b64d(sigRawB64)))
    } catch (e: Exception) { false }

    fun verifyObject(spkiB64: String, obj: Any?, sigB64: String): Boolean =
        verifyRaw(spkiB64, Json.canon(obj).toByteArray(Charsets.UTF_8), sigB64)

    fun signObject(signer: Signer, obj: Any?): String = signer.signRaw(Json.canon(obj).toByteArray(Charsets.UTF_8))

    // ---------------------------------------------------------------- key pairs
    fun genEcKeyPair(): KeyPair = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
    fun privateFromPkcs8(b: ByteArray): PrivateKey = KeyFactory.getInstance("EC").generatePrivate(PKCS8EncodedKeySpec(b))

    // ---------------------------------------------------------------- hybrid encryption of Channel B packages
    class Recipient(val keyId: String, val encPub: String)

    private fun ecdh(priv: PrivateKey, peerSpki: ByteArray): ByteArray {
        val pub = KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(peerSpki))
        return KeyAgreement.getInstance("ECDH").run { init(priv); doPhase(pub, true); generateSecret() }
    }

    /** HKDF-SHA256 (RFC 5869) with an empty salt, one 32-byte output block. */
    private fun hkdf(secret: ByteArray, info: ByteArray): ByteArray {
        val hmac = Mac.getInstance("HmacSHA256")
        hmac.init(SecretKeySpec(ByteArray(32), "HmacSHA256"))
        val prk = hmac.doFinal(secret)
        hmac.init(SecretKeySpec(prk, "HmacSHA256"))
        hmac.update(info)
        hmac.update(byteArrayOf(1))
        return hmac.doFinal()
    }

    private fun gcm(mode: Int, key: ByteArray, iv: ByteArray, aad: ByteArray, data: ByteArray): ByteArray {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(mode, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        c.updateAAD(aad)
        return c.doFinal(data)
    }

    fun encryptPackage(payload: Any?, aad: String, recipients: List<Recipient>): JObj {
        val contentKey = randomBytes(32)
        val iv = randomBytes(12)
        val ct = gcm(Cipher.ENCRYPT_MODE, contentKey, iv, aad.toByteArray(), Json.canon(payload).toByteArray(Charsets.UTF_8))
        val rcpts = recipients.map { r ->
            val eph = genEcKeyPair()
            val secret = ecdh(eph.private, b64d(r.encPub))
            val kek = hkdf(secret, "TrustLine-B-v1|${r.keyId}".toByteArray())
            val iv2 = randomBytes(12)
            val wk = gcm(Cipher.ENCRYPT_MODE, kek, iv2, "$aad|${r.keyId}".toByteArray(), contentKey)
            jo("k" to r.keyId, "epk" to b64e(eph.public.encoded), "iv" to b64e(iv2), "wk" to b64e(wk))
        }
        return jo("v" to 1L, "aad" to aad, "iv" to b64e(iv), "ct" to b64e(ct), "rcpts" to rcpts)
    }

    fun decryptPackage(pkg: Any?, myKeyId: String, encPrivPkcs8: ByteArray): JObj {
        val aad = pkg["aad"].str()
        val r = pkg["rcpts"].list().firstOrNull { it["k"].str() == myKeyId } ?: throw IllegalStateException("Not a recipient of this package")
        val secret = ecdh(privateFromPkcs8(encPrivPkcs8), b64d(r["epk"].str()))
        val kek = hkdf(secret, "TrustLine-B-v1|$myKeyId".toByteArray())
        val contentKey = gcm(Cipher.DECRYPT_MODE, kek, b64d(r["iv"].str()), "$aad|$myKeyId".toByteArray(), b64d(r["wk"].str()))
        val pt = gcm(Cipher.DECRYPT_MODE, contentKey, b64d(pkg["iv"].str()), aad.toByteArray(), b64d(pkg["ct"].str()))
        return Json.parse(String(pt, Charsets.UTF_8)).obj()
    }
}

/** Software signer for unit tests (the real device uses the Android Keystore). */
class SoftSigner(private val pair: KeyPair) : Signer {
    val spki: String = Crypto.b64e(pair.public.encoded)
    override val signKid: String = Crypto.keyId(spki)
    override fun signRaw(data: ByteArray): String {
        val s = Signature.getInstance("SHA256withECDSA")
        s.initSign(pair.private)
        s.update(data)
        return Crypto.b64e(Crypto.derToRaw(s.sign()))
    }
}
