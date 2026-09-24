package com.nexonai.unpruuf.data.db

import androidx.room.Database
import androidx.room.RoomDatabase
import com.nexonai.unpruuf.data.model.Contact

@Database(
    entities = [Contact::class, RatchetStateEntity::class],
    // v3: Contact.ratchetPublicKey (EC, one-time-ECIES) replaced by
    // Contact.x25519RatchetPublicKey (X25519, full Double Ratchet) + new
    // ratchet_state table. Destructive migration wipes contacts on update —
    // all contacts must be re-paired (both devices) after this version.
    // v4: added crossPlatform/myRelayConnectionString/theirRelayConnectionString/
    // myGeneration/theirGeneration for iOS-interop cross-platform mode (see
    // CROSS_PLATFORM_PLAN.md). Same destructive-migration precedent as v2→v3 —
    // all contacts must be re-paired after this update.
    // v5: added Contact.isVerified (safety-number verification, see
    // ContactDetailScreen.kt/IdentityManager.safetyNumber). Same destructive-migration
    // precedent again — all contacts must be re-paired after this update.
    // v6: Contact.id is now a local-only random UUID instead of the peer's self-reported
    // pairing userId (fixes a silent-overwrite issue — see SECURITY_CLAIMS.md); added
    // remoteUserId/myWireIdentity/theirWireIdentity for per-contact wire-tag identity instead
    // of the global IdentityManager.userId. Same destructive-migration precedent again.
    // v7: added Contact.manualRelayOwner (manual override for the per-contact relay-owner
    // rhythm — see IdentityManager.relayOwnerIsMine()/P2PNetworkManager.switchRelayOwner()).
    // Same destructive-migration precedent again — all contacts must be re-paired.
    // v8: added Contact.nodeMesh/theirNodeMeshRoutingSeed/theirNodeAddresses for the unpruuf
    // Business Node-Mesh product line (see NODE_MESH_SPEC.md) — a separate transport, not a
    // variant of the existing onion/relay/cross-platform ones. Same destructive-migration
    // precedent again — all contacts must be re-paired.
    // v9: added Contact.tempNodeAddress/tempNodeOwnerSecret/tempNodeActive/
    // theirTempNodeAddress for Node-Mesh's Temp Node feature (NODE_MESH_SPEC.md §7) — a
    // per-chat, one-off additional own node, distinct from NodeMeshManager's global standard
    // pool. Same destructive-migration precedent again — all contacts must be re-paired.
    version = 9,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun contactDao(): ContactDao
    abstract fun ratchetStateDao(): RatchetStateDao
}
