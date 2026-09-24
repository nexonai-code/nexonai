package com.nexonai.unpruuf.data.db

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Persisted Double Ratchet session state for one contact (see
 * `domain/network/ratchet/DoubleRatchet.kt` and `RatchetSessionManager`).
 *
 * Unlike chat messages (RAM-only, wiped after 5 minutes — see InMemoryMessageStore) this is
 * long-lived session metadata that MUST survive an app restart for forward secrecy to keep
 * working: every ratchet encrypt/decrypt call advances these fields and the previous values are
 * overwritten immediately, never kept around. Lives in the same SQLCipher-encrypted database as
 * [com.nexonai.unpruuf.data.model.Contact].
 */
@Entity(tableName = "ratchet_state")
data class RatchetStateEntity(
    @PrimaryKey val contactId: String,
    /** Base64 raw X25519 keys — our current ratchet keypair. */
    val dhsPrivateKey: String,
    val dhsPublicKey: String,
    /** Base64 raw X25519 public key — the peer's current ratchet key, null until learned. */
    val dhr: String?,
    /** Base64 32-byte root key. */
    val rootKey: String,
    val sendChainKey: String?,
    val recvChainKey: String?,
    val sendCount: Int = 0,
    val recvCount: Int = 0,
    val previousChainLength: Int = 0,
    /** JSON object: `"<base64 dhPub>:<n>" -> "<base64 message key>"`, bounded by DoubleRatchet.MAX_SKIPPED_KEYS. */
    val skippedKeysJson: String = "{}",
)
