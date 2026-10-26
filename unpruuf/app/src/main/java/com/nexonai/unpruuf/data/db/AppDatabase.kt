package com.nexonai.unpruuf.data.db

import androidx.room.Database
import androidx.room.RoomDatabase
import com.nexonai.unpruuf.data.model.Contact
import com.nexonai.unpruuf.data.model.GroupEntity

@Database(
    entities = [Contact::class, RatchetStateEntity::class, GroupEntity::class],
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
    // v10: per-contact own pairing values for Node-Mesh (Contact.myPairMessageKey/
    // myPairRatchetPrivateKey/myPairRatchetPublicKey/myPairRoutingSeed/myNodeAddresses), so no
    // two contacts share a key, seed or node. Same destructive-migration precedent again.
    // v11: Whistleblower case fields (Contact.caseNumber/caseStatus/caseOpenedAt/caseAckDueAt/
    // caseFeedbackDueAt/caseUpdatedAt/intakeStartedAt/intakeLastSentAt). The first version with a
    // REAL migration (MIGRATION_10_11, plain ADD COLUMNs) — contacts survive this update.
    // v12: Contact.messageTtlHours (per-chat packet lifetime on the nodes: 1 / 6 / 24 h). Plain
    // nullable ADD COLUMN (MIGRATION_11_12) — contacts survive.
    // v13: new table "chat_groups" for the Pro Groups edition (local groups, see GroupEntity). A plain
    // CREATE TABLE (MIGRATION_12_13) — contacts and everything else survive.
    // v14: Contact.tempNodeOnPhone (the Temp Node of this chat runs on this phone, Pro Groups).
    // Plain ADD COLUMN with a default (MIGRATION_13_14) — contacts survive.
    // v15: Contact.guestGrants (the Client app's guest grants for this inviter, see GuestClient).
    // One nullable ADD COLUMN (MIGRATION_14_15) — contacts survive.
    // v16: Contact.guestRenewal / guestRenewedAtMs (GRANT_RENEW, Pro side). Two nullable ADD COLUMNs
    // (MIGRATION_15_16) — contacts survive.
    version = 16,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun contactDao(): ContactDao
    abstract fun ratchetStateDao(): RatchetStateDao
    abstract fun groupDao(): GroupDao
}

/** v10 → v11: only nullable columns added, so existing contacts are kept (no re-pairing). */
val MIGRATION_10_11 = object : androidx.room.migration.Migration(10, 11) {
    override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
        listOf(
            "caseNumber TEXT", "caseStatus TEXT", "caseOpenedAt INTEGER", "caseAckDueAt INTEGER",
            "caseFeedbackDueAt INTEGER", "caseUpdatedAt INTEGER", "intakeStartedAt INTEGER", "intakeLastSentAt INTEGER"
        ).forEach { db.execSQL("ALTER TABLE contacts ADD COLUMN $it") }
    }
}

/** v11 → v12: one nullable column, existing contacts are kept. */
val MIGRATION_11_12 = object : androidx.room.migration.Migration(11, 12) {
    override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE contacts ADD COLUMN messageTtlHours INTEGER")
    }
}

/** v12 → v13: the local groups table (Pro Groups). */
val MIGRATION_12_13 = object : androidx.room.migration.Migration(12, 13) {
    override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE IF NOT EXISTS `chat_groups` (`id` TEXT NOT NULL, `name` TEXT NOT NULL, " +
                "`code` TEXT NOT NULL, `memberIds` TEXT NOT NULL, `createdAt` INTEGER NOT NULL, PRIMARY KEY(`id`))"
        )
    }
}

/** v13 → v14: one flag column, existing contacts are kept. */
val MIGRATION_13_14 = object : androidx.room.migration.Migration(13, 14) {
    override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE contacts ADD COLUMN tempNodeOnPhone INTEGER NOT NULL DEFAULT 0")
    }
}

/** v15 → v16: two nullable columns for the owner's automatic guest renewal, existing contacts are kept. */
val MIGRATION_15_16 = object : androidx.room.migration.Migration(15, 16) {
    override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE contacts ADD COLUMN guestRenewal TEXT")
        db.execSQL("ALTER TABLE contacts ADD COLUMN guestRenewedAtMs INTEGER")
    }
}

/** v14 → v15: one nullable column (guest grants of the free Client app), existing contacts are kept. */
val MIGRATION_14_15 = object : androidx.room.migration.Migration(14, 15) {
    override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE contacts ADD COLUMN guestGrants TEXT")
    }
}
