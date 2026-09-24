package com.nexonai.unpruuf.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "contacts")
data class Contact(
    // A locally-generated random UUID, NOT the peer's self-reported pairing userId (see
    // remoteUserId below) — the peer fully controls what it puts in its own QR, so keying our
    // own DB row by that value let anyone who knew/guessed a contact's remoteUserId silently
    // overwrite them via Room's OnConflictStrategy.REPLACE (fixed 2026-09-17, see
    // SECURITY_CLAIMS.md). Generated once at insert time and never changes for this row.
    @PrimaryKey val id: String,
    val onionAddress: String,
    val publicKey: String,
    val rotationFactor: String,
    val displayName: String,
    val isClientSlot: Boolean = false,
    val addedAt: Long = System.currentTimeMillis(),
    val lastSeen: Long = 0L,
    // This contact's static X25519 identity public key (raw 32 bytes, Base64),
    // learned at pairing time via QR. Only ever used once, to bootstrap this
    // contact's Double Ratchet root key — see RatchetSessionManager. Every
    // message after that uses the ratchet's own evolving keys, not this one.
    val x25519RatchetPublicKey: String = "",
    // Cross-platform (iOS-interop) contacts only — see CROSS_PLATFORM_PLAN.md. When true,
    // onionAddress is unused/empty and P2PNetworkManager routes this contact through
    // theirRelayConnectionString exclusively (no LAN/Tor-direct attempt), tagged with
    // generation counters instead of the hourly clock bucket every other contact uses.
    val crossPlatform: Boolean = false,
    // Which relay(s) reach ME, for this contact — learned from my own RelayManager config
    // at pairing time, sent to the contact in the cross-platform QR's "n" field.
    // NOTE: despite the singular name (kept as-is deliberately — see below), this holds a
    // RelayManager.buildConnectionStringList()-joined POOL of up to RELAY_POOL_MAX_SIZE (2)
    // full connection strings, ';'-separated — not necessarily just one. Column name and type
    // (String?) are unchanged from before the relay pool existed on purpose: a pre-existing
    // single-entry value is already a valid one-element list (contains no ';'), so no Room
    // schema migration was needed to add pool support. Use
    // RelayManager.parseConnectionStringList(...) to read it as a List<String>.
    val myRelayConnectionString: String? = null,
    // Which relay(s) reach THEM — from the cross-platform QR's "n" field at pairing, replaced
    // wholesale whenever a WECHSEL control signal arrives (see
    // P2PNetworkManager.ingestPacketInner) with that signal's single new relay. Same ';'-joined-
    // pool convention and same deliberately-unchanged column name/type as myRelayConnectionString
    // above.
    val theirRelayConnectionString: String? = null,
    // My own outgoing generation counter for this contact — bumped by P2PNetworkManager.wechsel().
    val myGeneration: Long = 0L,
    // My best-known copy of the contact's outgoing generation — updated by an incoming
    // WECHSEL signal. resolveSender()/startRelayPoll() check a ±1 window around this.
    val theirGeneration: Long = 0L,
    // Set once the user has compared IdentityManager.safetyNumber(...) for this contact with
    // them out of band (a call, a voice message — NOT the same channel the pairing code was
    // shared over) and it matched. Purely a local trust indicator, never sent over the wire and
    // never required to message this contact — see screens/contactdetail/ContactDetailScreen.kt.
    val isVerified: Boolean = false,
    // The pairing-time identity this contact's QR claimed to be (what used to also be [id],
    // before id became a local-only random UUID — see its doc comment). Kept only as a
    // permanent fallback for wire-tag resolution (a contact paired on an older build, or the
    // brief window before myWireIdentity/theirWireIdentity below have been exchanged) and to
    // detect a re-scanned QR trying to impersonate an existing contact.
    val remoteUserId: String = "",
    // This device's own freshly-generated, per-contact identity — replaces the global,
    // every-contact-identical IdentityManager.userId as the "who" component of this contact's
    // outgoing wire-tag HMAC once set. Generated locally at pairing time; never sent anywhere
    // except to this one contact, so two contacts comparing notes no longer see the same value
    // for "who you are" the way they would with the old global userId. Null until generated.
    val myWireIdentity: String? = null,
    // This contact's own freshly-generated, per-contact identity, learned from their
    // NEW_IDENTITY control signal (see P2PNetworkManager) sent right after pairing completes.
    // Null until that signal has been received — resolveSender()/pollRelayOnce() fall back to
    // remoteUserId until then, and keep trying it afterward too (self-healing if the signal is
    // ever lost, no state machine needed).
    val theirWireIdentity: String? = null,
    // Manual override for which side's relay list is the active one for this contact — "mine",
    // "theirs", or null for the automatic rhythm (see IdentityManager.relayOwnerIsMine()).
    // Set locally via ContactDetailViewModel.switchRelayOwner() and mirrored to the contact with
    // a RELAY_OWNER_SWITCH_V1 control signal so both sides poll the same list without either one
    // guessing; see P2PNetworkManager's handling of that signal for how a value received FROM a
    // contact is stored here already resolved to this device's own "mine"/"theirs" perspective.
    val manualRelayOwner: String? = null,

    // ─── unpruuf Business / Node-Mesh (see NODE_MESH_SPEC.md) ───────────────────────────────
    // A completely separate transport from everything above — no onion, no legacy relay, no
    // wire-tag-with-identity scheme. When true, onionAddress/myRelayConnectionString/
    // theirRelayConnectionString/crossPlatform are all unused/false for this contact; routing
    // runs entirely on the fields below instead. Mutually exclusive with crossPlatform in
    // practice (a contact is either the consumer app's cross-platform mode or the Business
    // Node-Mesh — never both), though nothing currently enforces that at the type level.
    val nodeMesh: Boolean = false,
    // This contact's Node-Mesh routing seed (IdentityManager.myNodeMeshRoutingSeedBase64's
    // counterpart), learned at pairing time via QR. Combined with my own seed via
    // IdentityManager.nodeMeshPairSecret() to derive the shared routing_tag sequence for this
    // pair — see that function's doc comment for why this is a genuinely separate secret from
    // [publicKey] (the message key), not a reuse of it.
    val theirNodeMeshRoutingSeed: String = "",
    // Which node(s) THEY told me to poll for their outgoing messages — from the Node-Mesh
    // pairing QR's node-address list (NodeMeshManager.NODE_ADDRESS_PREFIX entries, ';'-joined,
    // same pool convention as myRelayConnectionString/theirRelayConnectionString above). No
    // owner secret in these — see NodeMeshManager's doc comment for why that split exists.
    // Set at pairing time; NODE_MESH_SPEC.md §6's UNPRUUF_NODEMIGRATE_V1 signal (see
    // P2PNetworkManager) is what updates one entry in place if one of their nodes moves.
    val theirNodeAddresses: String? = null,

    // ─── Temp Node (NODE_MESH_SPEC.md §7, Node-Mesh only) ───────────────────────────────────
    // Exceptional, per-chat, one-off additional own node — e.g. a second device run just for
    // this one contact while traveling. Independent of the standard node pool in
    // NodeMeshManager (which is global, shared across every Node-Mesh contact); these four
    // fields are the whole per-chat override, deliberately scoped to a single Contact row
    // rather than living in NodeMeshManager's SharedPreferences-backed pool.

    // MY OWN temp node's address + owner secret for this one contact, set via
    // ChatViewModel.activateTempNode() by scanning/pasting the exact same
    // unpruuf-node-owner:v1:<address>:<secret> string a standard node prints — see
    // NodeMeshManager.parseOwnerConnectionString(). Null when no temp node is registered.
    val tempNodeAddress: String? = null,
    val tempNodeOwnerSecret: String? = null,
    // False while registered-but-unconfirmed (P2PNetworkManager dual-deposits to both the temp
    // node and the standard pool during this window) or after N consecutive heartbeat failures
    // (auto-fallback — see startTempNodeHeartbeat()). True once any deposit or heartbeat to the
    // temp node has succeeded — see that function's doc comment for the single-state-machine
    // reasoning (one flag drives both first-activation and any later resume, spec §7 step 6/7).
    // Governs the whole outgoing-routing decision for this contact: true = temp-node-only
    // (§7 step 6's "Standard-Nodes ... pausieren"), false = standard pool as normal.
    val tempNodeActive: Boolean = false,
    // THEIR announced temp node for this chat, learned from an incoming UNPRUUF_TEMPNODE_V1
    // signal (cleared by UNPRUUF_TEMPNODE_OFF_V1). Always polled alongside their standard
    // theirNodeAddresses in pollNodeMeshOnce() rather than switched to exclusively — fetch has
    // no delete-on-fetch side effect, so polling both costs an extra request but never risks
    // missing a message during the other side's own activation/fallback transitions.
    val theirTempNodeAddress: String? = null
)
