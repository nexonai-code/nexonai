package com.nexonai.unpruuf.domain.network.ratchet

import com.google.crypto.tink.subtle.Hkdf
import com.google.crypto.tink.subtle.X25519
import com.nexonai.unpruuf.data.db.RatchetStateDao
import com.nexonai.unpruuf.data.db.RatchetStateEntity
import com.nexonai.unpruuf.data.model.Contact
import com.nexonai.unpruuf.domain.network.IdentityManager
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Glues the pure [DoubleRatchet] algorithm to unpruuf's contact/pairing model.
 *
 * Pairing here is **mutual QR exchange**: both devices show their own code on the same
 * [com.nexonai.unpruuf.screens.qrpair.QrPairScreen] and each scans the other's, so by the time
 * either side can send anything, BOTH already know both X25519 identity keys — unlike a
 * one-sided handshake, there's no async "wait for the other side's first message" bootstrap
 * needed. [createSession] runs the X3DH-lite root-key derivation and the initial DH-ratchet step
 * synchronously, right after [Contact] is inserted.
 *
 * A single DH alone can't decide *who* performs the initial sending step — Double Ratchet needs
 * that asymmetry. Since both sides already know both public keys, the tie is broken with a
 * symmetric, deterministic comparison both devices compute identically: the smaller of the two
 * raw public keys is the sender-init side.
 */
@Singleton
class RatchetSessionManager @Inject constructor(
    private val dao: RatchetStateDao,
    private val identityManager: IdentityManager,
) {
    private val locks = ConcurrentHashMap<String, Mutex>()
    private fun lockFor(contactId: String): Mutex = locks.getOrPut(contactId) { Mutex() }

    /** Creates (or re-creates, on re-pairing) this device's ratchet session for [contact]. */
    suspend fun createSession(contact: Contact) {
        val my = identityManager.myX25519RatchetKeyPair
        val theirPub = android.util.Base64.decode(contact.x25519RatchetPublicKey, android.util.Base64.NO_WRAP)
        val shared = deriveSharedSecret(my.privateKey, theirPub, contact.publicKey)

        val state = if (compareUnsigned(my.publicKey, theirPub) < 0) {
            DoubleRatchet.initSender(shared, DoubleRatchet.KeyPair(my.privateKey, my.publicKey), theirPub)
        } else {
            DoubleRatchet.initReceiver(shared, DoubleRatchet.KeyPair(my.privateKey, my.publicKey))
        }
        dao.upsert(toEntity(contact.id, state))
    }

    suspend fun deleteSession(contactId: String) {
        dao.deleteByContactId(contactId)
    }

    /** Encrypt an outgoing message body for [contactId]; throws if no session exists yet. */
    suspend fun encrypt(contactId: String, plaintext: ByteArray, associatedData: ByteArray): DoubleRatchet.EncryptedMessage =
        lockFor(contactId).withLock {
            val entity = requireNotNull(dao.getByContactId(contactId)) {
                "no ratchet session for contact $contactId — pairing never completed?"
            }
            val state = fromEntity(entity)
            val message = DoubleRatchet.encrypt(state, plaintext, associatedData)
            dao.upsert(toEntity(contactId, state))
            message
        }

    /** Decrypt an inbound message body for [contactId]; throws if no session exists yet. */
    suspend fun decrypt(contactId: String, header: RatchetHeader, ciphertext: ByteArray, associatedData: ByteArray): ByteArray =
        lockFor(contactId).withLock {
            val entity = requireNotNull(dao.getByContactId(contactId)) {
                "no ratchet session for contact $contactId — pairing never completed?"
            }
            val state = fromEntity(entity)
            val plaintext = DoubleRatchet.decrypt(state, header, ciphertext, associatedData)
            dao.upsert(toEntity(contactId, state))
            plaintext
        }

    // ─── X3DH-lite ──────────────────────────────────────────────────────────

    private fun deriveSharedSecret(myPrivateKey: ByteArray, theirPublicKey: ByteArray, contactMsgKeyB64: String): ByteArray {
        val dh = X25519.computeSharedSecret(myPrivateKey, theirPublicKey)
        // Salted with IdentityManager.pairSecret() — the pair's actual shared secret, symmetric
        // because both devices compute it from the same two message keys sorted into a fixed
        // order (see that function's doc comment). Deliberately NOT identityManager.myMessageKey
        // alone: that's this device's OWN key, different from the contact's own myMessageKey, so
        // using it here would make each side derive a DIFFERENT salt and therefore a different
        // root key — the bug that shipped in the previous delivery and broke decryption in both
        // directions despite pairing itself succeeding (pairing doesn't touch this code path).
        // Also NOT Contact.rotationFactor: despite the name, that field isn't a per-pair secret
        // at all — it's derived purely from the current hour and is identical for every device.
        return Hkdf.computeHkdf("HmacSha256", dh, identityManager.pairSecret(contactMsgKeyB64), X3DH_INFO, 32)
    }

    private fun compareUnsigned(a: ByteArray, b: ByteArray): Int {
        val n = minOf(a.size, b.size)
        for (i in 0 until n) {
            val d = (a[i].toInt() and 0xFF) - (b[i].toInt() and 0xFF)
            if (d != 0) return d
        }
        return a.size - b.size
    }

    // ─── Entity <-> DoubleRatchet.RatchetState mapping ─────────────────────────

    private fun fromEntity(entity: RatchetStateEntity): DoubleRatchet.RatchetState = DoubleRatchet.RatchetState(
        dhsPrivateKey = decode(entity.dhsPrivateKey),
        dhsPublicKey = decode(entity.dhsPublicKey),
        dhr = entity.dhr?.let { decode(it) },
        rootKey = decode(entity.rootKey),
        sendChainKey = entity.sendChainKey?.let { decode(it) },
        recvChainKey = entity.recvChainKey?.let { decode(it) },
        sendCount = entity.sendCount,
        recvCount = entity.recvCount,
        previousChainLength = entity.previousChainLength,
        skippedKeys = decodeSkippedKeys(entity.skippedKeysJson),
    )

    private fun toEntity(contactId: String, state: DoubleRatchet.RatchetState): RatchetStateEntity = RatchetStateEntity(
        contactId = contactId,
        dhsPrivateKey = encode(state.dhsPrivateKey),
        dhsPublicKey = encode(state.dhsPublicKey),
        dhr = state.dhr?.let { encode(it) },
        rootKey = encode(state.rootKey),
        sendChainKey = state.sendChainKey?.let { encode(it) },
        recvChainKey = state.recvChainKey?.let { encode(it) },
        sendCount = state.sendCount,
        recvCount = state.recvCount,
        previousChainLength = state.previousChainLength,
        skippedKeysJson = encodeSkippedKeys(state.skippedKeys),
    )

    private fun decodeSkippedKeys(json: String): MutableMap<String, ByteArray> {
        val obj = JSONObject(json)
        val map = mutableMapOf<String, ByteArray>()
        obj.keys().forEach { key -> map[key] = decode(obj.getString(key)) }
        return map
    }

    private fun encodeSkippedKeys(keys: Map<String, ByteArray>): String =
        JSONObject().apply { keys.forEach { (k, v) -> put(k, encode(v)) } }.toString()

    private fun encode(bytes: ByteArray): String = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
    private fun decode(s: String): ByteArray = android.util.Base64.decode(s, android.util.Base64.NO_WRAP)

    companion object {
        private val X3DH_INFO = "unpruuf-x3dh-lite-v1".toByteArray(Charsets.UTF_8)
    }
}
