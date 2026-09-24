package com.nexonai.unpruuf.domain.network.ratchet

import com.google.crypto.tink.subtle.Hkdf
import com.google.crypto.tink.subtle.X25519
import com.google.crypto.tink.subtle.XChaCha20Poly1305
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Textbook Double Ratchet (Signal spec: https://signal.org/docs/specifications/doubleratchet/),
 * built directly on Tink's `subtle` primitives (X25519, HKDF, XChaCha20-Poly1305) so it needs
 * no extra native dependency and no Android framework class — every symbol here is plain
 * JVM/Kotlin, which keeps it runnable under a regular JUnit test.
 *
 * This file is deliberately app-agnostic: it knows nothing about contacts, pairing or QR
 * codes. Bootstrapping the very first root key from the unpruuf pairing handshake is
 * [com.nexonai.unpruuf.domain.network.ratchet.RatchetSessionManager]'s job, not this one's.
 */
object DoubleRatchet {

    /** Bounded so a malicious/broken peer can't force unbounded memory growth. */
    const val MAX_SKIPPED_KEYS = 1000

    private const val DH_KEY_LEN = 32
    private const val ROOT_KDF_INFO = "unpruuf-ratchet-root-v1"
    private const val CHAIN_KDF_MAC = "HmacSha256"

    class RatchetError(message: String) : Exception(message)

    data class KeyPair(val privateKey: ByteArray, val publicKey: ByteArray)

    /**
     * Mutable ratchet session state for one direction of one contact. All fields are
     * intentionally `var`/mutable — [encrypt] and [decrypt] advance them in place, and the
     * caller ([RatchetSessionManager]) is responsible for persisting the result after every
     * call so forward secrecy survives an app restart (old keys are simply overwritten).
     */
    class RatchetState(
        var dhsPrivateKey: ByteArray,
        var dhsPublicKey: ByteArray,
        var dhr: ByteArray?,
        var rootKey: ByteArray,
        var sendChainKey: ByteArray?,
        var recvChainKey: ByteArray?,
        var sendCount: Int = 0,
        var recvCount: Int = 0,
        var previousChainLength: Int = 0,
        val skippedKeys: MutableMap<String, ByteArray> = mutableMapOf(),
    )

    data class EncryptedMessage(val header: RatchetHeader, val ciphertext: ByteArray)

    fun generateKeyPair(): KeyPair {
        val priv = X25519.generatePrivateKey()
        return KeyPair(priv, X25519.publicFromPrivate(priv))
    }

    /**
     * Initialise as the party that already knows the peer's ratchet public key (the QR
     * scanner role in [com.nexonai.unpruuf.screens.qrpair.QrPairViewModel]). Performs the
     * initial sending DH step immediately, so this side can send right away.
     */
    fun initSender(sharedRootKey: ByteArray, ownKeyPair: KeyPair, theirPublicKey: ByteArray): RatchetState {
        val state = RatchetState(
            dhsPrivateKey = ownKeyPair.privateKey,
            dhsPublicKey = ownKeyPair.publicKey,
            dhr = theirPublicKey,
            rootKey = sharedRootKey,
            sendChainKey = null,
            recvChainKey = null,
        )
        val (rk, ck) = kdfRootKey(state.rootKey, dh(state.dhsPrivateKey, theirPublicKey))
        state.rootKey = rk
        state.sendChainKey = ck
        return state
    }

    /**
     * Initialise as the party that does NOT yet know the peer's ratchet public key (the QR
     * "initiator" role, before the partner's first message arrives). Cannot send until
     * [decrypt] has processed at least one inbound message — that is correct Double Ratchet
     * behaviour, not a bug: only [decrypt] discovers [theirPublicKey] and completes the
     * matching sending chain via the standard DH-ratchet step.
     */
    fun initReceiver(sharedRootKey: ByteArray, ownKeyPair: KeyPair): RatchetState =
        RatchetState(
            dhsPrivateKey = ownKeyPair.privateKey,
            dhsPublicKey = ownKeyPair.publicKey,
            dhr = null,
            rootKey = sharedRootKey,
            sendChainKey = null,
            recvChainKey = null,
        )

    fun encrypt(state: RatchetState, plaintext: ByteArray, associatedData: ByteArray): EncryptedMessage {
        val chainKey = state.sendChainKey
            ?: throw RatchetError("no sending chain yet — must receive at least one message first")
        val (nextChainKey, messageKey) = kdfChainKey(chainKey)
        state.sendChainKey = nextChainKey
        val header = RatchetHeader(state.dhsPublicKey, state.previousChainLength, state.sendCount)
        state.sendCount += 1
        val ciphertext = aead(messageKey).encrypt(plaintext, associatedData + header.encode())
        return EncryptedMessage(header, ciphertext)
    }

    fun decrypt(state: RatchetState, header: RatchetHeader, ciphertext: ByteArray, associatedData: ByteArray): ByteArray {
        val fullAd = associatedData + header.encode()

        trySkippedKey(state, header)?.let { messageKey ->
            return aead(messageKey).decrypt(ciphertext, fullAd)
        }

        if (state.dhr == null || !header.dhPub.contentEquals(state.dhr)) {
            skipMessageKeys(state, header.previousChainLength)
            dhRatchetStep(state, header.dhPub)
        }

        skipMessageKeys(state, header.messageNumber)
        val chainKey = state.recvChainKey ?: throw RatchetError("receiving chain not established")
        val (nextChainKey, messageKey) = kdfChainKey(chainKey)
        state.recvChainKey = nextChainKey
        state.recvCount += 1
        return aead(messageKey).decrypt(ciphertext, fullAd)
    }

    // ---- DH ratchet ---------------------------------------------------------

    private fun dhRatchetStep(state: RatchetState, theirNewPublicKey: ByteArray) {
        state.previousChainLength = state.sendCount
        state.sendCount = 0
        state.recvCount = 0
        state.dhr = theirNewPublicKey

        val (rk1, recvChain) = kdfRootKey(state.rootKey, dh(state.dhsPrivateKey, theirNewPublicKey))
        state.rootKey = rk1
        state.recvChainKey = recvChain

        val newKeyPair = generateKeyPair()
        state.dhsPrivateKey = newKeyPair.privateKey
        state.dhsPublicKey = newKeyPair.publicKey

        val (rk2, sendChain) = kdfRootKey(state.rootKey, dh(state.dhsPrivateKey, theirNewPublicKey))
        state.rootKey = rk2
        state.sendChainKey = sendChain
    }

    // ---- Skipped message keys (out-of-order delivery) ------------------------

    private fun skipMessageKeys(state: RatchetState, until: Int) {
        val chainKey = state.recvChainKey ?: return // nothing received on this chain yet
        if (until - state.recvCount > MAX_SKIPPED_KEYS) {
            throw RatchetError("too many skipped messages (${until - state.recvCount})")
        }
        var ck = chainKey
        while (state.recvCount < until) {
            val (nextChainKey, messageKey) = kdfChainKey(ck)
            ck = nextChainKey
            state.skippedKeys[skippedKeyId(state.dhr!!, state.recvCount)] = messageKey
            if (state.skippedKeys.size > MAX_SKIPPED_KEYS) {
                throw RatchetError("skipped-key cache overflow")
            }
            state.recvCount += 1
        }
        state.recvChainKey = ck
    }

    private fun trySkippedKey(state: RatchetState, header: RatchetHeader): ByteArray? {
        val id = skippedKeyId(header.dhPub, header.messageNumber)
        return state.skippedKeys.remove(id)
    }

    private fun skippedKeyId(dhPub: ByteArray, n: Int): String =
        Base64.getEncoder().encodeToString(dhPub) + ":" + n

    // ---- Primitives -----------------------------------------------------------

    private fun dh(privateKey: ByteArray, publicKey: ByteArray): ByteArray =
        X25519.computeSharedSecret(privateKey, publicKey)

    /** KDF_RK: derives a fresh root key + chain key from the running root key and a new DH output. */
    private fun kdfRootKey(rootKey: ByteArray, dhOutput: ByteArray): Pair<ByteArray, ByteArray> {
        val out = Hkdf.computeHkdf(
            "HmacSha256",
            dhOutput,
            rootKey,
            ROOT_KDF_INFO.toByteArray(Charsets.UTF_8),
            64,
        )
        return out.copyOfRange(0, 32) to out.copyOfRange(32, 64)
    }

    /** KDF_CK: advances a symmetric chain by one step, yielding (nextChainKey, messageKey). */
    private fun kdfChainKey(chainKey: ByteArray): Pair<ByteArray, ByteArray> {
        val nextChainKey = hmac(chainKey, byteArrayOf(0x02))
        val messageKey = hmac(chainKey, byteArrayOf(0x01))
        return nextChainKey to messageKey
    }

    private fun hmac(key: ByteArray, data: ByteArray): ByteArray {
        val mac = Mac.getInstance(CHAIN_KDF_MAC)
        mac.init(SecretKeySpec(key, CHAIN_KDF_MAC))
        return mac.doFinal(data)
    }

    private fun aead(messageKey: ByteArray) = XChaCha20Poly1305(messageKey)
}
