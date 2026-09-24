package com.nexonai.unpruuf.data.db

import androidx.room.*
import com.nexonai.unpruuf.data.model.Contact
import kotlinx.coroutines.flow.Flow

@Dao
interface ContactDao {
    @Query("SELECT * FROM contacts ORDER BY displayName ASC")
    fun getAllContacts(): Flow<List<Contact>>

    @Query("SELECT * FROM contacts")
    suspend fun getAllContactsOnce(): List<Contact>

    @Query("SELECT * FROM contacts WHERE id = :id")
    suspend fun getContactById(id: String): Contact?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(contact: Contact)

    @Delete
    suspend fun delete(contact: Contact)

    @Query("DELETE FROM contacts WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("UPDATE contacts SET lastSeen = :timestamp WHERE id = :id")
    suspend fun updateLastSeen(id: String, timestamp: Long)

    @Query("UPDATE contacts SET displayName = :name WHERE id = :id")
    suspend fun updateDisplayName(id: String, name: String)

    @Query("UPDATE contacts SET isVerified = :verified WHERE id = :id")
    suspend fun setVerified(id: String, verified: Boolean)

    @Query("UPDATE contacts SET onionAddress = :onion WHERE id = :id")
    suspend fun updateOnionAddress(id: String, onion: String)

    // Cross-platform (iOS-interop) contacts only — see CROSS_PLATFORM_PLAN.md.

    /** Applies an incoming WECHSEL signal: the contact's new outgoing generation and the
     *  relay they're now reachable at. */
    @Query("UPDATE contacts SET theirGeneration = :generation, theirRelayConnectionString = :relay WHERE id = :id")
    suspend fun updateWechselInfo(id: String, generation: Long, relay: String)

    /** Bumps MY OWN outgoing generation for this contact — called after sending a WECHSEL
     *  signal under the old (about-to-be-stale) generation. */
    @Query("UPDATE contacts SET myGeneration = myGeneration + 1 WHERE id = :id")
    suspend fun bumpMyGeneration(id: String)

    /** Applies an incoming NEW_IDENTITY signal — the contact's own freshly-generated
     *  per-contact wire identity, replacing reliance on their pairing-time remoteUserId. */
    @Query("UPDATE contacts SET theirWireIdentity = :identity WHERE id = :id")
    suspend fun updateTheirWireIdentity(id: String, identity: String)

    /** Existence/impersonation check for QR re-scans — see QrPairViewModel.handleScannedQr. */
    @Query("SELECT * FROM contacts WHERE remoteUserId = :remoteUserId LIMIT 1")
    suspend fun getContactByRemoteUserId(remoteUserId: String): Contact?

    /** Sets or clears (pass null) the manual relay-owner override — see
     *  P2PNetworkManager.switchRelayOwner()/IdentityManager.relayOwnerIsMine(). [owner] is
     *  "mine", "theirs", or null to fall back to the automatic rhythm. */
    @Query("UPDATE contacts SET manualRelayOwner = :owner WHERE id = :id")
    suspend fun updateManualRelayOwner(id: String, owner: String?)

    /** unpruuf Business / Node-Mesh only (NODE_MESH_SPEC.md §6) — applies an incoming node
     *  address-migration signal by replacing the contact's whole advertised node list with
     *  [addresses] (already resolved/deduped by the caller — see
     *  P2PNetworkManager's NODE_MIGRATE_SIGNAL_PREFIX handling). */
    @Query("UPDATE contacts SET theirNodeAddresses = :addresses WHERE id = :id")
    suspend fun updateTheirNodeAddresses(id: String, addresses: String?)

    // ─── Temp Node (NODE_MESH_SPEC.md §7) — Node-Mesh only ─────────────────────────────────

    /** Registers a freshly scanned/pasted temp node for this one chat — always starts
     *  unconfirmed (see P2PNetworkManager's dual-deposit-until-first-success handling). */
    @Query("UPDATE contacts SET tempNodeAddress = :address, tempNodeOwnerSecret = :ownerSecret, tempNodeActive = 0 WHERE id = :id")
    suspend fun updateTempNode(id: String, address: String, ownerSecret: String)

    /** Explicit deactivation (§7 step 8's "sauberer Übergang zurück auf Standard-Nodes") —
     *  unlike the automatic heartbeat-timeout fallback in [setTempNodeActive], this drops the
     *  registration entirely rather than leaving it around to retry. */
    @Query("UPDATE contacts SET tempNodeAddress = NULL, tempNodeOwnerSecret = NULL, tempNodeActive = 0 WHERE id = :id")
    suspend fun clearTempNode(id: String)

    /** Flips the confirmed/active state — see Contact.tempNodeActive's doc comment for the
     *  single-state-machine reasoning (one flag drives both first-activation via a successful
     *  deposit and any later resume via a successful heartbeat, as well as auto-fallback on
     *  heartbeat timeout). Does not touch tempNodeAddress/tempNodeOwnerSecret — an automatic
     *  fallback keeps the registration so the heartbeat loop keeps retrying it. */
    @Query("UPDATE contacts SET tempNodeActive = :active WHERE id = :id")
    suspend fun setTempNodeActive(id: String, active: Boolean)

    /** Receive side of the UNPRUUF_TEMPNODE_V1/UNPRUUF_TEMPNODE_OFF_V1 signals — [address] null
     *  clears it (the OFF signal). */
    @Query("UPDATE contacts SET theirTempNodeAddress = :address WHERE id = :id")
    suspend fun updateTheirTempNodeAddress(id: String, address: String?)
}
