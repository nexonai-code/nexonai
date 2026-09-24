# unpruuf — Changelog (delivery history)

Newest delivery on top. Each entry: **what was done**, **which bug appeared**,
and **how it was fixed**. Full current state: `STATUS.md`.

---

## 2026‑09‑24 · node-mesh-server: standalone Windows binary (NODE_MESH_SPEC.md §8, last open piece — spec now fully built)

**What was done**

`node-mesh-server` gets a standalone `unpruuf-node-mesh.exe` build — the last
piece NODE_MESH_SPEC.md still listed as unbuilt (§8's "kein Windows-Build
existiert bisher"). Same technique `../server/` already uses for its own
`unpruuf-relay.exe`, adapted with no changes to the underlying mechanism:
Node's own Single Executable Application (SEA) feature — `esbuild` bundles
the app into one JS file, Node prepares a "blob", `postject` injects it into
a copy of the exact Node binary running the build. `better-sqlite3`'s
compiled native addon can't be embedded in the blob (SEA only embeds
JavaScript), so it ships as a small sibling file (`native/better_sqlite3.node`)
and gets loaded back via `module.createRequire()` + better-sqlite3's own
`new Database(path, { nativeBinding })` override.

App-only, no `unpruuf/app/` change — no version bump.

**What was added**

- `src/sea-entry.ts` — the exe's actual entry point (sets the native
  binding override, then requires `./index`).
- `src/sqliteNativeBinding.ts` (+ test) — the override hook `nodeStore.ts`
  now checks before falling back to `better-sqlite3`'s normal
  auto-discovery, unchanged for every other entry point (`npm start`,
  `npm test`, `ts-node`).
- `build-exe.js` — the build script (`npm run build:exe`), producing
  `build/unpruuf-node-mesh/{dist/unpruuf-node-mesh.exe, native/}`.
- `start-windows.bat` — the simpler Node.js-required alternative, for
  parity with `../server/`'s own two options.
- `EXE_BUILD.md` — full explanation and verification notes, same honest
  posture as `../server/`'s own doc for the identical mechanism.

**Verification**

Built and **run** end-to-end on Linux (this repo's dev environment) as a
stand-in for Windows — not just built, actually exercised:
- The full SEA pipeline (bundle → blob → inject) produced a working single
  executable.
- Ran it directly (not via `npm start`/`ts-node`) and hit every endpoint for
  real: `PUT /deposit` with a real owner secret, `GET /fetch`, and
  `POST /fetchMany` all round-tripped a real blob correctly; `GET /health`
  responded.
- Confirmed the native-addon loading trick works — this *is* the real
  SQLite write+read round trip above, not a separate claim.
- Confirmed `EPHEMERAL=1` mode leaves no `node-mesh-identity.json`/
  `node-mesh.sqlite` file behind (checked directory contents before/after).
- `npm test`: 26/26 (24 existing + 2 new for the native-binding override).

**Not verified:** actually running the resulting `.exe` on a real Windows
machine, or reaching it through a real Tor hidden service — no Windows
machine was available to build or test on directly. The build mechanism
itself (SEA, `postject`, the native-addon trick) is Node/OS-agnostic and was
exercised for real, including every HTTP endpoint; what's untested is
Windows-specific execution of the final binary.

---

## 2026‑09‑23 · Node-Mesh Temp Node (Phase 3, part 3 of NODE_MESH_SPEC.md — spec now fully built), v1.14

**What was done**

Temp Node (NODE_MESH_SPEC.md §7): an exceptional, per-chat, one-off additional
own node — e.g. a second device run just for one contact while traveling.
This was the last of the three Phase 3 items and the last unbuilt piece of
NODE_MESH_SPEC.md overall (aside from the Windows-binary packaging noted in
§8, which was already out of scope for every earlier delivery too).

**node-mesh-server**

- New `EPHEMERAL=1` / `--ephemeral` startup mode (`npm run start:tempnode`):
  identity is generated fresh in memory every start and the message store
  runs on `:memory:` SQLite — nothing touches disk at all, matching §7 step
  8's "Temp-Node-Session-Daten werden gelöscht (RAM-only)". A normal
  (non-ephemeral) node is unaffected — same on-disk identity/DB as before.
  `npm test` still 24/24.

**Android app**

- `Contact.tempNodeAddress` / `tempNodeOwnerSecret` / `tempNodeActive` /
  `theirTempNodeAddress` (`AppDatabase` v8 → v9, destructive migration).
- New "Temp Node" dialog on the chat screen (Node-Mesh contacts only): scan
  or paste the exact same `unpruuf-node-owner:v1:<address>:<secret>` string
  a standard node's Settings setup already accepts — just stored
  contact-scoped here instead of in the global pool, no new QR format
  needed. Shows none/pending/active state; a "Deactivate" action for §7
  step 8's explicit clean shutdown.
- Two new control signals: `UNPRUUF_TEMPNODE_V1:<address>` (announcement,
  sent/received) and `UNPRUUF_TEMPNODE_OFF_V1` (deactivation).
- `P2PNetworkManager.depositForNodeMesh()`: routes a contact's outgoing
  Node-Mesh deposits through their Temp Node once confirmed (§7 step 6's
  "standard nodes pause for this one chat"), dual-deposits to both while
  unconfirmed, and falls back to the standard pool for any single failed
  temp-node attempt so a message is never lost while active.
- `startTempNodeHeartbeat()`: pings every registered Temp Node every 2
  minutes; 3 consecutive failures trigger automatic fallback to the
  standard pool, a later successful heartbeat resumes it — one state flag
  (`tempNodeActive`) drives both first-activation and any later resume, see
  NODE_MESH_SPEC.md §7's new [v4] note for the full reasoning.
- `pollNodeMeshOnce()` now also polls a contact's announced
  `theirTempNodeAddress` alongside their standard node addresses.

**Bug or cause**

None — new functionality. Existing behavior for non-Node-Mesh and
non-Temp-Node contacts is unchanged.

**Fix**

N/A.

---

## 2026‑09‑23 · Node-Mesh address migration + cross-contact fetchMany bundling (Phase 3, part 1+2 of NODE_MESH_SPEC.md), v1.13

**What was done**

Two independent pieces of Phase 3 (see `NODE_MESH_SPEC.md` §6): a device can
now change one of its own node's network address without breaking existing
Node-Mesh contacts, and the poll loop now batches fetches by node address
across every Node-Mesh contact instead of one `fetchMany` call per contact.
Temp Node (§7) remains the one open item from the original Phase 3 list.

**Address migration**

- `NodeMeshManager.migrateMyNode(oldAddress, newAddress)`: replaces the
  address of one own node in local config, keeping the same owner secret —
  a node's identity is its owner secret, not its network address.
- `P2PNetworkManager`: new `UNPRUUF_NODEMIGRATE_V1:` control signal.
  `sendNodeMigrationSignal`/`sendNodeMigrationSignalToAll` announce a
  migration through the normal delivery queue, which already tries every
  currently-configured own node and tolerates individual failures — as long
  as `migrateMyNode()` runs *before* the announcement is enqueued, this
  alone guarantees the announcement never goes out over the node that's
  changing, with no special-casing needed. Receive side in
  `ingestPacketInner` swaps just the one changed address in the sending
  contact's advertised list (not a full replace), dedupes, and caps at
  `NodeMeshManager.NODE_POOL_MAX_SIZE`.
- `ContactDao.updateTheirNodeAddresses()`: applies the swap.
- `SettingsViewModel`/`SettingsScreen`: a "Migrate" action next to each own
  node's "Remove" button, with an inline new-address field.

**Cross-contact fetchMany bundling**

- `pollNodeMeshOnce()` no longer issues one `fetchMany` call per Node-Mesh
  contact. It now collects every contact's tolerance-window routing tags
  into a map keyed by distinct node **address**, then issues exactly one
  `fetchMany` call per distinct address (chunked at
  `MAX_FETCH_MANY_TAGS_PER_CALL`), all concurrently — the same
  `tagsByTarget` pattern `pollRelayOnce()` already proved out for the
  consumer relay in v1.09. This only pays off when several contacts happen
  to share node infrastructure (e.g. a company hosting several employees'
  nodes); it degrades to exactly the previous one-call-per-contact behavior
  otherwise, so it's a pure improvement, never a regression.

**Bug or cause**

None — this is new functionality, not a fix. No existing behavior changed
for contacts that aren't Node-Mesh, and no schema change this round.

**Fix**

N/A.

---

## 2026‑09‑23 · Node-Mesh end-to-end on Android (Phase 2b of NODE_MESH_SPEC.md), v1.12

**What was done**

Completes the slice started by the previous delivery (Phase 2a's foundation
pieces): a Node-Mesh contact can now actually be paired and can actually
send/receive a message, end to end. No schema change this round — reuses
`Contact.nodeMesh`/`theirNodeMeshRoutingSeed`/`theirNodeAddresses` from
`AppDatabase` v8 as-is.

**What was added**

- `NodeMeshPairing.kt` (new file): the Node-Mesh pairing QR payload and its
  compact JSON codec, structurally its own third format alongside the
  existing onion-based and cross-platform ones — no onion, no wire-identity
  concept in the tag at all (see `IdentityManager.nodeMeshRoutingTag`'s doc
  comment for why routing needs none here). Carries an `appEdition` field
  (same pattern the previous v1.10 delivery added to the cross-platform
  payload) so `AppEdition.canAdd()` stays enforced.
- `QrPairViewModel.kt`: `myNodeMeshQrPayload()` (null until at least one own
  node is configured) and `handleScannedNodeMeshQr()` — gated on
  `NodeMeshManager.isUsable()`, not on edition or Mandatory relay mode,
  since Business/Node-Mesh is an orthogonal product line
  (`NODE_MESH_SPEC.md` §0), not a variant of the relay-mandatory choice.
  Deliberately does **not** send a NEW_IDENTITY signal for these contacts —
  there's no identity concept to announce.
- `QrPairScreen.kt`: a third, always-visible "Business (Node-Mesh)"
  `FilterChip`, independent of the existing Android/iOS toggle and of
  Mandatory-mode's forced state. Scan/paste dispatch now tries onion, then
  cross-platform, then Node-Mesh format in sequence, same three-way
  shape-based dispatch pattern the existing two already used pairwise.
- `SettingsViewModel.kt`/`SettingsScreen.kt`: new "Business Node-Mesh"
  section — add/remove this device's own nodes by pasting/scanning the
  `unpruuf-node-owner:v1:...` string a node-mesh-server prints on first
  start. Only ever displays addresses, never the owner secret, matching
  `NodeMeshManager`'s whole reason for keeping two separate string formats.
- `P2PNetworkManager.kt`, the core wiring:
  - `PendingDelivery` gained a `nodeMeshRoutingTag` field, snapshotted at
    enqueue time in every send site that needed it (`enqueueRatchetMessage`,
    `sendRevokeSignal`, `sendDeleteContact`) — same "don't trust a live
    contactDao lookup to survive until actual send time" reasoning already
    established for `crossPlatformWireId` (a contact row can be deleted by
    `sendDeleteContact` in the same coroutine that enqueues its own delete
    signal).
  - `attemptDelivery`/`attemptChunkTrainDelivery` gained a Node-Mesh branch,
    checked before any contact lookup: deposits to **every** reachable node
    in this device's own pool (`depositToOwnNodes`), not first-success-wins
    — `NODE_MESH_SPEC.md` §5's redundancy rule taken literally, a
    deliberately different posture from the relay path's failover.
  - New, fully independent poll loop (`startNodeMeshPoll`/
    `pollNodeMeshOnce`), parallel to the existing relay poll loop, not a
    branch inside it — the two transports share almost nothing (owner-secret
    vs. no-auth-at-all, different client class). For each Node-Mesh contact,
    computes the tolerance-window tags and batches them into one
    `fetchMany` call per one of the contact's own advertised nodes.
  - `resolveSender` gained a Node-Mesh branch that reuses the *existing*
    `ingestPacket` dedup wrapper unchanged: the poll loop passes the routing
    tag in the same parameter position a wire ID normally occupies (both
    are just "an opaque string that resolves to a contact"), so no new
    ingest path or dedup mechanism was needed.
  - `sendMainOnionUpdate`/`sendVerifiedOnionUpdate` now return early for
    Node-Mesh contacts — announcing an onion to a contact that has no onion
    concept at all was a latent, never-triggered gap before this (nothing
    previously called these for a transport without a live onion).
    `sendNewIdentitySignal`/`switchRelayOwner`/`wechsel` needed no change:
    the first is simply never called for Node-Mesh contacts by its only
    caller, and the other two are already gated by conditions (a populated
    relay pool, `crossPlatform == true`) that are structurally false for
    Node-Mesh contacts.

**Not build-verified** — no Android SDK in this environment. Reviewed for
well-formed Kotlin and brace/paren balance by hand on every touched/new
file.

**Still not built** (tracked in `NODE_MESH_SPEC.md` §12's Phase 2b entry):
Temp Node, address migration, and batching `fetchMany` calls *across*
contacts the way the relay poll loop already does for shared relay targets
— today's Node-Mesh poll issues one `fetchMany` call per contact's own
node, not bundled further, since each contact's nodes are typically unique
to them rather than pooled.

---

## 2026‑09‑23 · Node-Mesh Android foundation pieces (Phase 2a of NODE_MESH_SPEC.md), v1.11

**What was done**

First Android-side slice of the Business/Node-Mesh product line, continuing
directly from the previous delivery's server (`node-mesh-server/`). This is
foundational plumbing only — the crypto primitives, a manager for this
device's own node pool, and an HTTP client for the new server's API — not
yet a usable end-to-end feature. No pairing UI, no `P2PNetworkManager`
integration yet; a Node-Mesh contact can't actually send or receive a
message after this delivery alone.

**What was added**

- `IdentityManager.kt`: `myNodeMeshRoutingSeed` (a fresh, independent
  32-byte per-device secret, persisted the same way `myMessageKey` already
  is), `nodeMeshPairSecret()` (symmetric sort-then-hash combiner, same shape
  as the existing `pairSecret()` but fed this new seed instead of the
  message key), `nodeMeshEpoch()`/`nodeMeshRoutingTag()` (the spec's
  `routing_tag = HKDF(shared_pairing_secret, "routing"||epoch)`, implemented
  as HMAC-SHA256 like every other rotating tag in this class),
  `nodeMeshToleranceEpochs()` (the spec's `ceil(TTL/rotation)+1` formula).
  Deliberately never touches `pairSecret`, `myMessageKey`, or the ratchet's
  X3DH-lite salt — satisfies `NODE_MESH_SPEC.md` §2's "two genuinely
  independent secrets" requirement by construction, not by convention.
- `NodeMeshManager.kt` (new file): manages this device's own configured
  node pool (up to 3, matching the existing relay pool's redundancy cap).
  Deliberately keeps TWO separate connection-string formats —
  `unpruuf-node-owner:v1:<address>:<secret>` (local-only, holds the owner
  secret, never leaves this device) and `unpruuf-node:v1:<address>`
  (contact-facing, address only, what a pairing QR would carry) — instead
  of reusing the existing relay's single address+token format, specifically
  so there's no way to accidentally paste an owner-secret-bearing string
  into a pairing QR.
- `NodeMeshClient.kt` (new file): hand-rolled HTTP-over-Tor-SOCKS client for
  the new server's `/deposit` (owner-secret authenticated), `/fetch` and
  `/fetchMany` (no auth — the routing tag itself is the credential),
  structurally mirroring `RelayClient.kt`'s proven raw-socket approach
  (including its own hard-won `+`-in-query-string percent-encoding fix and
  regex-based tag-map parsing that never interpolates a tag into a regex
  pattern).
- `Contact.kt`: `nodeMesh`, `theirNodeMeshRoutingSeed`, `theirNodeAddresses`
  fields. `AppDatabase` v7 → **v8**, destructive migration (same precedent
  as every previous schema bump) — all contacts must be re-paired after
  this update.

**Not build-verified** — no Android SDK in this environment. Reviewed for
well-formed Kotlin and brace/paren balance by hand on every touched/new
file.

**Next (Phase 2b, not in this delivery):** the Node-Mesh pairing QR/screen,
a Settings UI for configuring this device's own nodes, and the
`P2PNetworkManager` send/poll integration (write to all of this device's
own reachable nodes; poll a contact's advertised nodes over the tolerance
window, batched via `/fetchMany`) — without these three, nothing built in
this delivery is reachable from the app's UI yet.

---

## 2026‑09‑23 · New unpruuf-node-mesh server (Business line, Phase 1 of NODE_MESH_SPEC.md)

**What was done**

First buildable, fully-tested piece of the new Node-Mesh architecture for the
Business/Compliance product line, designed together with the user across
several turns (see `NODE_MESH_SPEC.md` for the full spec and its decision
log). Core idea: unlike the consumer app's optional relay, every device
writes exclusively to its own node(s) and contacts poll a sender's nodes to
fetch — never the reverse — which lets the write endpoint be locked to a
secret that's never shared with anyone, and lets fetch be pure read-only with
no delete-on-fetch capability handed to a contact at all.

New package: `unpruuf/node-mesh-server/`. **Separate from, and does not
touch, `unpruuf/server/`** — the existing consumer relay is a different
product line and is completely unchanged by this delivery.

**Design decisions baked into this delivery** (see `NODE_MESH_SPEC.md` for
the reasoning behind each):
- `PUT /deposit` requires `Authorization: Bearer <ownerSecret>` — a secret
  generated once per node and configured only into the node owner's own app
  instance(s), never handed to a contact. No contact, no stranger who merely
  learns a node's address can ever write to it.
- `GET /fetch` / `POST /fetchMany` need no auth token at all — the routing
  tag itself (HKDF-derived from a pairing secret in the full client design,
  not yet wired up client-side) is the read credential. Neither route
  deletes anything.
- The only deletion path is a periodic TTL sweep. A "Reset" cycle exists on
  its own staggered schedule (for later multi-node deployments) but is
  scoped narrowly to connection/socket hygiene — verified in the spec
  discussion to never overlap with TTL cleanup or touch message data.
- `POST /fetchMany`'s wire format (`{tags, waitMs}` →
  `{blobs: {tag: [...]}}`, long-poll via `waitMs`) is intentionally
  identical to the consumer relay's own `POST /v1/fetchMany` (v1.09) so a
  client that already speaks that contract needs minimal new parsing.

**Verification**

Fully build- and test-verified in this sandbox: `npm test` compiles via
`tsc` and runs 24 `node:test` cases covering the store layer (delete-on-fetch
explicitly proven to never happen, TTL expiry, the `MAX_BLOBS_PER_TAG` cap,
long-poll arrival and timeout behavior), the HTTP layer (owner-secret auth
required/rejected/cross-instance-isolated, all three routes' validation
paths), and the rate limiter (token-bucket capacity/refill behavior in
isolation). Also smoke-tested the real entrypoint (`node dist/index.js`)
end to end against `/health`, not just the in-process test harness.

**Explicitly not included in this delivery** — later phases, tracked in
`NODE_MESH_SPEC.md` §12: Android/iOS client-side integration (new pairing
format, write-to-own-node send logic, redundant multi-node deposit, routing
tag derivation with a genuinely separate pairing secret), bundled Tor
process management (the consumer relay's Windows/macOS start scripts have
no counterpart here yet), a Windows/Linux standalone binary build, the Temp
Node feature, and the address-migration protocol.

---

## 2026‑09‑18 · Business/Mandatory pairing unification: no onion ever, Android↔Android, v1.10

**What was done**

Requested after a brainstorming discussion about traffic-analysis resistance:
the user noticed that `RelayManager.RelayMode.MANDATORY` already means a
device's onion address is never actually *used* for a given contact, and
asked why it's still *exchanged and stored* at all in that case — pointing
out that the existing cross-platform (iOS-interop) pairing format already
does exactly what they wanted (no onion, ever — just a shared key and a
relay pool). The agreed fix: stop treating "no onion" as an iOS-only special
case. Android↔Android pairing now uses the *exact same* pairing format as
iOS whenever Mandatory relay mode is on — the "Business" / Node-bundled
product line the user described (customer buys/runs their own Node relay(s)
and app, wants zero onion data ever collected for a contact, on either
platform). Two real Android editions can now pair this way, not just
"Android talking to a Pro iOS user", so the format gained one new field and
one gate had to be reconsidered — see below.

**Design note, for the record:** this is *not* a new anonymity property by
itself. A device's own onion was already unused for delivery in Mandatory
mode before this change — a network observer or the relay operator saw
nothing different either way. What changes is purely *data at rest*: an
onion address, once dropped from the pairing exchange entirely, can't turn
up in a later device seizure/forensic read of the Contact table for that
pairing. Separately discussed and **explicitly not solved** by this or any
of the relay-batching work: global passive Tor-level traffic correlation
remains an open, industry-wide limitation (see `SECURITY_CLAIMS.md` point 7)
and the relay operator still sees rotating wire-tag push/fetch timing
regardless of whether an onion was ever exchanged.

**Fix**

- `CrossPlatformPairingPayload` (`CrossPlatformPairing.kt`) gained an
  optional `e` (edition) field — `{"v":2,"u":"...","p":"...","k":"...",
  "n":"...","e":"<edition>"}`. Needed because `AppEdition.canAdd()`
  (Client-can-only-add-Pro, etc.) previously didn't need enforcing on this
  path at all — it was Pro-only both ways by construction, so "both sides
  Pro" was the only possible outcome. Now that real Standard/Client-edition
  Android devices can reach this path too (via Mandatory, not the manual
  Pro toggle), the rule needs real enforcement, which needs to know the
  sender's edition. Missing `e` (any iOS-generated QR, or a QR from before
  this field existed) defaults to `standard` — keeps the existing Pro-gated
  iOS-interop check passing exactly as it did before this field existed.
- `QrPairViewModel.handleScannedCrossPlatformQr`: the `AppEdition.isPro`
  gate is now waived specifically when `RelayManager.isMandatory()` is true
  on the scanning device, and a new `AppEdition.canAdd(payload.appEdition)`
  check (mirroring the onion-based flow's own check) was added right after
  it. The deliberate manual "iOS / cross-platform" toggle outside Mandatory
  mode still requires Pro, completely unchanged.
- `QrPairScreen.kt`: when Mandatory is on, the QR screen now defaults
  straight to the cross-platform-format QR — no manual toggle needed. The
  Pro-only "Android contact / iOS cross-platform" `FilterChip` row is
  replaced by a plain "RELAY-ONLY PAIRING — MANDATORY MODE IS ON" label in
  that case, so a non-Pro Business/Mandatory user isn't confused by an "iOS"
  label that has nothing to do with their Android↔Android pairing.
- Everything downstream — `P2PNetworkManager`'s generation-counter tag
  rotation, relay-only routing, the `wechsel()` manual relay-switch signal
  and its `ChatScreen` button — already keyed purely off `Contact.
  crossPlatform`, with no platform-specific logic anywhere in that chain,
  so none of it needed to change to also correctly serve two Android
  devices paired this way.
- iOS needed **zero functional changes** — it already only ever
  generates/reads this exact format (`PairingViewModel` has always been
  relay-mandatory; there's no onion-based pairing on iOS to begin with) —
  confirmed by reading `PairingPayload.swift`'s `parseFlatJSON`, which
  already ignores any JSON key it doesn't recognize, including the new `e`
  field. Added a doc-comment note there for anyone reading that file cold,
  no logic touched.
- The Standard (non-Mandatory) onion-based pairing flow
  (`QrPairViewModel.handleScannedQr`) is completely untouched — this only
  changes pairings made while Mandatory relay mode is on.
- `CROSS_PLATFORM_PLAN.md`/`STATUS.md` updated with the full design
  (§13's header and pairing-QR row, new "Business/Mandatory pairing
  unification" section).

**Not build-verified** — no Android SDK in this environment; reviewed for
well-formed Kotlin and brace/paren balance by hand. iOS: documentation-only
change, no Swift logic touched, so nothing there needed re-verification
beyond confirming `parseFlatJSON`'s unknown-key tolerance by reading it.

---

## 2026‑09‑17 · Batched relay poll + adaptive interval + relay-owner rhythm, v1.09

**What was done**

Closes the "known follow-up" flagged at the bottom of the v1.08 entry below:
`pollRelayOnce()` issued `contacts × relays × identity candidates × time
buckets` separate `GET /v1/fetch` calls every 6 seconds, continuously,
whether or not anyone was even looking at a chat — reported as real battery
drain on always-on relay-MANDATORY devices. Three changes, all requested
together in one message ("setzt alle 3 um. Bearbeite auch den Node wie es
nötig ist"):

1. **`POST /v1/fetchMany`** — a new batch(+optional long-poll) endpoint,
   added to **both** relay implementations, wire-identical:
   - `server/src/routes/relay.ts` (Node): `{"tags":[...],"waitMs":<optional>}`
     → `{"blobs":{"<tag>":[...], ...}}`. `BlobStore.waitForAny()` backs the
     long-poll with a process-local `EventEmitter`, resolved the instant any
     of the requested tags receives a blob (`put()` now emits on success) or
     after `waitMs`, whichever first. New `config.ts` constants
     `MAX_FETCH_MANY_TAGS` (64) and `MAX_WAIT_MS` (55s, safely under typical
     reverse-proxy idle timeouts).
   - `relay-android/`: same contract in `RelayHttpServer.kt`, backed by a
     `CountDownLatch`-per-waiting-call registry in `BlobStore.kt` (NanoHTTPD
     blocks each request on its own thread, so a blocking wait needs no
     event loop there, unlike Node's single-threaded one).
   - Android app's `RelayClient.kt` gained `fetchMany()`; `request()`'s
     previously-fixed 40s socket timeout is now parameterized, since a
     long-poll response can legitimately take close to `waitMs` to arrive.
2. **`pollRelayOnce()` batched per relay target**: collects every contact's
   expected tags into one set **per distinct relay address**, then issues
   one `fetchMany` call per target per round instead of one `fetch` call per
   tag — typically collapsing to one round-trip per configured relay server,
   total, regardless of contact count. Distinct targets are polled
   concurrently (`coroutineScope` + `async`), so a long-poll wait is paid
   once, not once per target.
3. **Adaptive interval**: `startRelayPoll()` now picks its sleep-between-
   rounds and its `fetchMany` `waitMs` based on whether a chat is currently
   open or recently closed (`isChatActiveOrRecent()`, reusing the existing
   warmup grace window) — tight interval + longer wait while active, long
   interval + short wait in the background. A long-poll response returns the
   instant a blob actually arrives regardless of `waitMs`, so this only ever
   trades round-trip count for latency in the case where nothing was queued
   anyway.
4. **Relay-owner rhythm**, addressing the user's own proposed scheme ("Der
   den den Kontakt initiiert hat, dessen Server werden benutzt... in
   bestimmten Rhythmus wechseln sie auf die Liste des anderen"):
   `IdentityManager.relayOwnerIsMine()` derives, per contact per 6-hour
   period, from already-shared pair material (no new round-trip), whether
   this device does a "deep" check of its full relay pool this round or just
   the primary entry — the one virtually all traffic lands on anyway, since
   a sender's push always tries pool entry 0 first and only fails over on
   failure. A lexical tie-break on the two sides' wire identities alone
   would pick the same side forever, so a per-period HMAC coin-flip is XORed
   on top to make it an actual rotation, not a permanent assignment. New
   `Contact.manualRelayOwner` (`AppDatabase` v6 → **v7**, destructive
   migration, same precedent as every schema bump this project has made) and
   a `RELAY_OWNER_SWITCH_V1` control signal let either side pin one
   contact's active list manually and mirror that choice to the other
   device; a small Automatic / Mine / Theirs control was added to Contact
   Detail, shown only for contacts that actually have relay addresses.

**Fix / verification**

- Node relay (`server/`): fully build- and test-verified in this sandbox —
  `npm test` passes 70/70, including 8 new `/v1/fetchMany` cases (immediate
  hit, immediate empty, long-poll-then-arrives-early, long-poll-timeout, the
  tag-count/shape validation paths, and the missing-auth-header path).
- Android (`app/`, `relay-android/`): **not build-verified** — no Android SDK
  in this sandbox. Reviewed for well-formed Kotlin and brace/paren balance
  by hand (one false-positive from `'{'`/`'}'` char literals in
  `RelayClient.parseBlobsMapBody`, traced and confirmed harmless).
- Deliberately did **not** attempt the fully signal-free version of the
  relay-owner scheme where both sides derive a shared address purely from
  local secrets with no announce step at all — same reasoning as v1.07's
  verified-onion rotation: the safer, still-effective version (mostly-local
  derivation, a small explicit signal only for the manual-override case)
  was chosen over hand-rolling more cryptographic machinery unverified in
  this environment.
- iOS: not touched. `RelayService.pollOnce` keeps calling `GET /v1/fetch`
  once per tag per pool entry every round — still fully wire-compatible
  with either relay (neither existing endpoint changed), just without
  either the batching or the rhythm optimization. See
  `CROSS_PLATFORM_PLAN.md`.

---

## 2026‑09‑17 · Android: relay pool travels in the pairing QR, v1.08

**What was done**

The standard Android↔Android pairing QR now carries the device's relay pool,
so two people who don't share a hand-configured relay can still reach each
other through one. Pool cap raised from 2 to 3 (primary + two fallbacks), with
a second backup field in Settings.

**Bug / cause**

Found while writing up the relay business case, and it was worse than a
missing feature — the relay path between two standard Android contacts was
effectively dead unless both sides had manually entered the *same* relay. The
sender pushed to `relayManager.getRelayOnion()` (its OWN relay) and the
receiver polled its OWN, and the standard QR (`v/u/o/p/r/e/k`) carried no
relay field at all, so the two were never told where to meet. Only
cross-platform (iOS) contacts did it correctly, advertising their pool per
contact in the QR's `n` field.

**Fix**

- `QrPairViewModel.kt`: `QrPairingPayload` gains `relayConnectionStrings`,
  version 4 → **5**. `payloadToJson` writes a compact `n` field — each entry
  with the constant `unpruuf-relay:v1:` prefix stripped (~17 chars each,
  re-added on parse), `;`-joined — and **omits the field entirely when no
  relay is configured**, so non-relay users keep exactly the QR size they had.
  Address and token stay verbatim, because an address may legitimately contain
  a colon (`host:port`) and guessing a `.onion` suffix back on would be
  ambiguous. Measured: a ~320-char payload grows to ~530 with two relays and
  ~650 with three, i.e. the jump is carrying them at all, not the count.
  Backward compatible both ways — unknown keys are ignored and a missing `n`
  parses as "no relay advertised", so no forced re-pairing.
- `handleScannedQr` now stores both sides' pools on the contact
  (`myRelayConnectionString` / `theirRelayConnectionString`, fields that
  already existed for cross-platform). Mine must be stored per contact rather
  than read live later, because they keep pushing to whatever I showed them
  even after I reconfigure.
- `P2PNetworkManager.kt`: `crossPlatformRelayCandidates` renamed
  `relayCandidates` and populated for **every** contact at enqueue time (which
  also fixes the delete-signal race for standard contacts, not just
  cross-platform ones). New `relayTargetsFor()`/`pushToRelays()` helpers; all
  four relay push sites (`attemptDelivery` mandatory + fallback,
  `attemptChunkTrainDelivery` forceRelay + fallback) now push to the contact's
  advertised relays in order, falling back to the global relay for pre-v5
  pairings. `pollRelayOnce()` is now one unified loop for both contact kinds,
  polling the relays this device advertised *to that contact* — cross-platform
  keeps its deliberate no-global-fallback behaviour.
- `RelayManager.RELAY_POOL_MAX_SIZE` 2 → 3; Settings gains a second backup
  relay field.
- iOS caveat: `RelayConnectionString.maxPoolSize` is still 2 there, so an iOS
  peer keeps only the first two entries of a three-entry pool — unused, not
  mis-parsed. See `CROSS_PLATFORM_PLAN.md`.
- **Known follow-up, not in this release:** receive-side polling cost. Each
  cycle issues `contacts × relays × identity candidates × time buckets`
  separate fetches every 6 s, and raising the pool to 3 multiplies the relay
  factor accordingly. A batched fetch endpoint (one request carrying all tags)
  plus an adaptive interval is the fix — see the CHANGELOG entry that
  implements it, or `STATUS.md` if it is still open.
- **Not build-verified** — no Android SDK in this environment. Reviewed for
  well-formed Kotlin, brace/paren balance, and every renamed call site traced
  by hand.

---

## 2026‑09‑17 · Android: daily-rotating onion for verified contacts, v1.07

**What was done**

Second, separate onion address for `isVerified` (safety-number-confirmed)
contacts only, re-derived and rotated once a day, on top of the shared
main/pairing onion from the previous release. Discussed and scoped with the
user across several turns, explicitly trading away a "zero new messages,
ever" design (which would have needed hand-rolled Ed25519 point
multiplication + SHA3-256 — real elliptic-curve library code, too much
unverifiable risk to ship from this environment) for a "derives
deterministically, announces once per rotation over the existing encrypted
channel, self-tests before announcing" design instead.

**Bug / cause**

Not a bug — a requested hardening. Even after the previous release's
per-contact wire-ID work, verified contacts still shared one onion address
forever (see `SECURITY_CLAIMS.md` Tier 3 item 8): any two of them comparing
notes could confirm "same device," permanently, with no cryptanalysis
needed. This narrows that from "forever" to "until the next daily
rotation."

**Fix**

- New `Ed25519OnionDerivation.kt`: `HMAC-SHA256(factor, dayBucket)` ->
  `SHA-512` -> RFC 8032 §5.1.5 clamping -> the 64-byte expanded Ed25519 key
  Tor's `ADD_ONION` control command accepts as `ED25519-V3:<base64>`.
  Isolated, heavily commented — the one piece of this change with genuine
  cryptographic implementation risk.
- `IdentityManager.kt`: `verifiedOnionFactor` (32 random bytes, generated
  once, encrypted at rest like other secrets, never sent anywhere) +
  `currentDayBucket()` + small persisted markers for which service ID/day
  is currently registered.
- `TorManager.kt`: `ensureVerifiedOnion()` — derives today's key, registers
  it via `ADD_ONION`, only THEN `DEL_ONION`s yesterday's service (so a
  failed registration never leaves contacts with no working address at
  all). Cheap no-op once today's onion is already current — no Tor
  round-trip needed to check. The verified onion also now rides the
  existing `getMyOnionAddresses()` list, so it gets the existing 20s
  keep-alive pings and the existing automatic-Tor-bounce-on-repeated-
  failure recovery for free.
- `P2PNetworkManager.kt`: `rotateVerifiedOnionIfDue()` (piggybacked on the
  existing 4-minute periodic reachability loop — day-granularity rotation
  needs no finer resolution) self-tests a freshly-rotated onion (same
  self-connect technique `isSelfReachableViaTor()` already uses) before
  announcing it to every verified contact via new
  `sendVerifiedOnionUpdate()`/`VERIFIED_ONION_UPDATE_SIGNAL_PREFIX` — same
  shape as the existing main-onion-update signal, writes to the same
  `contact.onionAddress` field on receipt, no new Contact field or schema
  migration needed. `notifyContactVerified()` handles the first-ever
  verification case (creates the verified onion if it doesn't exist yet,
  sends to just that one contact immediately instead of waiting for the
  next cycle) — called from `ContactDetailViewModel.verify()` right after
  a safety-number match.
- **Not a QR/wire-format change, no schema migration** — no forced
  re-pairing this time (unlike the last two releases).
- **Not build-verified, and more than the usual caveat applies here**: the
  Ed25519 derivation specifically has not been exercised against a live Tor
  control port. A subtle mistake in it would fail differently than
  everything else built this session — not loudly (delivery just breaking),
  but potentially silently (Tor accepting a slightly-malformed key that
  just doesn't reliably work). The self-test-before-announcing step exists
  specifically to catch this early; still, please confirm actual rotation
  and reachability on two real devices before trusting this for anything
  sensitive. See `SECURITY_CLAIMS.md` Tier 3 item 8a.
- Also answered, not built: (1) confirmed that a relay-mandatory contact
  needs no onion of yours at all, direct or shared — the reliability
  problem that killed per-contact onion rotation doesn't apply once dialing
  is skipped entirely; RelayMode is currently a global toggle, not
  per-contact. (2) Validated a proposed third-party business model (selling
  small bundles of randomly-assigned relay addresses from a shared pool) as
  a good fit for the *existing* `relaypool-tool`/`RelayPoolManager` signed
  relay-list import feature — no code changes needed for that to already
  work.

---

## 2026‑09‑17 · Android: per-contact wire identity, QR re-scan overwrite fix, v1.06

**What was done**

`IdentityManager.userId` used to be one global value, baked into every
contact's wire-tag identically and stored verbatim as the local database
key for that contact. Two problems followed from that: (1) any two of a
user's contacts comparing notes could trivially confirm they're both
talking to the same person by that one field, no cryptanalysis needed, and
(2) since a scanned QR's claimed `userId` became the contact's own local
database primary key, a spoofed or re-issued QR claiming an existing
contact's identity could silently overwrite their stored keys via Room's
insert-replace behavior — including resetting a safety-number-verified
contact back to unverified, with no warning. Both are fixed in the same
pass, by design discussed with the user: the pairing-time `userId` (and
onion address) stays as a renewable "pairing identity," decoupled from a
brand-new, per-contact identity generated and exchanged right after
pairing completes.

**Bug / cause**

Not originally reported as a bug — surfaced during a user question about
why the same `userId` appeared identical across contacts, which traced back
to `Contact.id = payload.userId` (the scanned QR's claim, used unchecked as
both the local primary key AND the wire-tag salt for that contact).

**Fix**

- `Contact.kt` / `AppDatabase.kt` (v6, destructive migration — all contacts
  re-paired, same precedent as v2→v5): `Contact.id` is now a locally
  generated random UUID, never something a scanned QR controls. Added
  `remoteUserId` (the contact's pairing-time claimed identity — kept only
  as a fallback and for overwrite detection), `myWireIdentity` (this
  device's fresh per-contact identity), `theirWireIdentity` (the contact's,
  learned via signal).
- `IdentityManager.kt`: `myWireId()`/`expectedWireId()` take an explicit
  `identity` parameter instead of always using the global `userId`. Added
  `newWireIdentity()` (fresh per-contact UUID) and `regenerateUserId()`
  (renews the pairing-time value only; existing contacts are unaffected
  since they've already moved off it). `userId` changed from a `by lazy`
  property to a manually-cached getter so it can actually be regenerated.
- `P2PNetworkManager.kt`: new `NEW_IDENTITY` control signal — sent once,
  right after a contact is created, always tagged under the pairing-time
  fallback identity so the receiver (who doesn't know the new identity yet)
  can still resolve it. `resolveSender()`/`pollRelayOnce()` now try a
  contact's `theirWireIdentity` first and permanently also try
  `remoteUserId` as a self-healing fallback — no "was the signal
  acknowledged" state machine needed. Also fixed a regression this same
  change would otherwise have caused: LAN (same-Wi-Fi) peer matching keyed
  on `contact.id`/`contactId`, which relied on it equalling the peer's
  broadcast `userId` — now correctly keyed on `remoteUserId` at all three
  call sites.
- `QrPairViewModel.kt`: `handleScannedQr`/`handleScannedCrossPlatformQr`
  check for an existing contact by `remoteUserId` before inserting — a key
  mismatch is rejected with a warning instead of silently overwriting; an
  identical re-scan is a no-op instead of a duplicate. Generates
  `myWireIdentity` at insert time and sends the `NEW_IDENTITY` signal right
  after the contact + ratchet session are created.
- `SettingsScreen.kt`/`SettingsViewModel.kt`: new "Pairing identity" →
  Renew action (Security section, with a confirm dialog) — regenerates only
  `IdentityManager.userId`; deliberately does not touch the Tor onion
  address, same reasoning `SECURITY_CLAIMS.md` §8 already documents for not
  re-fragmenting reachability.
- Not a QR wire-format change (no new/changed field in the QR JSON itself)
  and not a re-pairing requirement on its own — but the Room schema bump
  forces one anyway this time, per the project's existing destructive-
  migration precedent.
- **Known gap, not fixed here:** LAN/mDNS discovery still broadcasts the
  global (pre-renewal) `userId` as its service name — see `STATUS.md` §3
  and `SECURITY_CLAIMS.md` §1.3 for the honest caveat.
- **Not build-verified** — no Android SDK in this environment. Reviewed for
  well-formed Kotlin, brace/paren balance, and every call site of the
  changed `myWireId`/`PendingDelivery`/`lanPeers` signatures traced by hand.

---

## 2026‑09‑16 · Android: staggered per-contact wire-ID rotation, v1.05

**What was done**

Implemented the scoped "ID rotation at handshake" improvement discussed
previously: onion-mode contacts' hourly-rotating wire-ID no longer rolls
over at the same synchronized wall-clock instant (the top of every hour)
for every contact. Each contact's rotation is now phase-shifted by a
deterministic offset derived from that pair's own secret — established the
moment the pairing's handshake completed, requiring no new data exchange.
Also verified, on request: the Android app's cross-platform (iOS) pairing
QR format, and confirmed it's correct and already handles both Android- and
iOS-side pairing as two distinct, by-design QR codes — no code change was
needed there, see `CROSS_PLATFORM_PLAN.md`.

**Bug / cause**

Not a bug — a hardening request. Before this, `IdentityManager.
currentHourBucket()` was a pure wall-clock hour, identical for every
contact. `pairSecret` already made the *values* unlinkable per contact, but
an observer watching several of this device's network paths at once could
still notice several wire-IDs changing in lockstep at the exact same
instant, every hour — a timing signal on top of the (already unlinkable)
values themselves.

**Fix**

- `IdentityManager.kt`: added `pairRotationOffsetSeconds(contactMsgKeyB64)`
  — a deterministic 0–3599s offset from `SHA-256(pairSecret)`, identical on
  both devices without exchanging anything new. `currentHourBucket()` now
  takes an optional `offsetSeconds` parameter. `myWireId()`'s default `hour`
  parameter now resolves to this contact's own phase-shifted bucket instead
  of the shared global one.
- `P2PNetworkManager.kt`: `resolveSender()` and `pollRelayOnce()`'s onion
  branch now compute the phase-shifted bucket per contact inside their
  loops, instead of one shared `hour` computed once outside the loop.
- Cross-platform (relay) contacts are untouched — they already rotate on an
  explicit generation counter (`wechsel()`), never a wall-clock bucket.
- **Not a QR/pairing-format change** — no new field, no schema migration,
  existing contacts keep working across the update with no re-pairing.
  **Is** a wire-timing change: both devices need this build for their
  onion-mode contacts' rotation instants to line up (the existing ±2h
  receive-side drift tolerance covers the transition).
- See `SECURITY_CLAIMS.md` §1.3 for the updated claim text.
- **Not build-verified** — same standing caveat as recent Android
  deliveries (no Android SDK in this environment). Reviewed for well-formed
  Kotlin, brace/paren balance, and reasoned through by hand against every
  existing caller of `myWireId`/`currentHourBucket`.

---

## 2026‑09‑16 · Android: in-app Eclipse-mark logos + Settings letterhead card, v1.04

**What was done**

Follow-up to the launcher-icon item below: replaced the static
`logo_unpruuf.png` Home-screen asset with a Compose-drawn version of the
same "Eclipse" mark, and fixed the visual mismatch between the real
(square, white-background) NexonAI logo and the app's dark theme in
Settings → About.

**Details**

- New `ui/components/EclipseMark.kt`: draws `BRANDING.md`'s canonical
  100×100 path directly with Compose `Canvas`/`Path`/`arcTo` (same geometry
  as the launcher-icon vector drawables, just as draw calls instead of
  XML), gradient stroke, `color` parameter defaulting to
  `MaterialTheme.colorScheme.primary` — so it automatically takes the
  current edition's accent instead of being a fixed asset.
- `HomeScreen.kt`: replaced the `logo_unpruuf.png` `Image` with
  `EclipseMark` + the `unpruuf` wordmark (bold accent-colored "un" + plain
  "pruuf", same pattern `ContactsScreen.kt`'s `TopAppBar` already uses),
  laid out per `BRANDING.md`'s freestanding-mark convention (mark, wordmark
  bottom-aligned to its lower-right).
- `SettingsScreen.kt`: the existing `logo_nexonai.jpg` `Image` (NexonAI's
  own asset — not redrawn, different company's logo) is now wrapped in a
  light "letterhead card" (`#F7F5F1` surface, rounded corners, a 2px dark
  rule beneath the mark, small monospace "NexonAI" caption) instead of
  sitting directly on the screen's dark surface, where it previously read
  as a mismatched crop. Only this footer card is light — the rest of the
  Settings screen keeps the normal dark theme, per the user's own
  suggestion between "just the footer" and "the whole page," left to
  judgment.
- `logo_unpruuf.png` left in place but now unreferenced (release builds'
  `isShrinkResources` drops it); not deleted since nothing required it.
- Version bumped 1.03 → **1.04** (`app/build.gradle.kts`, `versionCode`
  4 → 5) per the project's versioning convention — any change under
  `unpruuf/app/` bumps it.
- **Not build-verified** — same standing caveat as the launcher-icon entry
  below (no Android SDK in this environment). Reviewed for well-formed
  Kotlin and brace/paren balance only.

---

## 2026‑09‑16 · Android: real launcher icons (the "Eclipse" mark), v1.03

**What was done**

Shipped the queued item from `BRANDING.md` ("replace the launcher icons with
this mark, on the next app update"): all three editions now use the actual
"Eclipse" brand mark instead of the old placeholder tiles. Also added
`COMPLIANCE.md` (GDPR/DSGVO positioning reference, grounded in the same
verified-architecture standard as `SECURITY_CLAIMS.md`) — no code change,
documentation only.

**Details**

- `app/src/{main,pro,client}/res/drawable/ic_launcher_foreground.xml`: the
  Eclipse mark drawn as a **vector drawable** (Android adaptive-icon
  foreground) — `BRANDING.md`'s canonical 100×100 path, scaled 0.75× and
  re-centered into the 108dp adaptive-icon canvas so it isn't clipped by the
  OS's mask. No PNG asset needed or exists; this environment has no
  image-rasterization tool, and none was needed since vector drawables are
  natively supported. Replaces the old `ic_launcher_foreground.png` in all
  three flavors (removed — a `.png` and `.xml` with the same resource name
  in the same `drawable/` folder is a build error, not just redundant).
- Colors: the open question `BRANDING.md` flagged ("ask before implementing")
  was put to the user — **per-edition color, not one shared mark**. Standard:
  near-black squircle (`#111827`) + white-gradient mark. Pro: white squircle
  + gold-gradient mark (`#b8860b`, from `BRANDING.md`'s own "Tier colors on
  white" table). Client: white squircle + blue-gradient mark (`#0284c7`),
  same table. `app/src/{pro,client}/res/values/ic_launcher_background.xml`
  override `main`'s near-black default to white for these two flavors.
- App version bumped **1.02 → 1.03** (`versionCode` 3 → 4) per the project's
  versioning convention — every delivery touching `unpruuf/app/` bumps both.
- Legacy per-density `mipmap-*/ic_launcher*.png` fallbacks (pre-adaptive-icon)
  were deliberately left untouched — `minSdk` is 26, the same floor adaptive
  icons require, so they're unreachable on every device the app runs on, but
  removing them wasn't necessary for this change.
- **Not build-verified** — no Android SDK in this environment (standing
  caveat, see `STATUS.md`). Reviewed for well-formed XML and hand-checked
  geometry only. Please confirm the actual rendered icon looks right (a real
  device, emulator, or Android Studio's resource preview) before treating
  this as visually final — vector-drawable gradient-on-stroke via
  `<aapt:attr>` is correct per the Android vector-drawable spec (API 24+,
  well under this project's `minSdk 26`) but has not been seen rendered.
- **Not touched**: the in-app logo images (`logo_unpruuf.png` on the Home
  screen, `logo_nexonai.jpg` in Settings → About) still use the old
  placeholder art — no new raster asset existed to replace them with, and
  this wasn't part of the specifically queued launcher-icon item. See
  `BRANDING.md`'s updated "Launcher icons" section for the full detail and
  remaining gaps.

---

## 2026‑09‑02 (9) · Fix: Android→iOS cross-platform messages never arrived (UUID case mismatch)

**What was done**

The very first real Android↔iOS cross-platform message exchange in this project's history was
tested end to end this session (Gabriel on Android, Norbert on iOS, sharing one self-hosted macOS
relay). Diagnosed and fixed a real bug that made every message from the Android side invisible on
iOS, despite the relay confirming they were correctly stored.

**Bug / cause**

Added unconditional diagnostic logging to `RelayService.pollOnce()` (every poll attempt now logs
the tag it queries and how many blobs came back, even zero) to see what iOS was actually asking
the relay for. The next real-device log showed it plainly: iOS was polling under a completely
different wire tag than the one the Android sender's messages were actually stored under, every
single time, with the relay's own status confirming the messages genuinely sat there waiting.

Root cause: `UUID.uuidString` on Swift always returns UPPERCASE hex (`FC7FDEDD-...`), while
Kotlin/Java's `UUID.toString()` always returns lowercase (`fc7fdedd-...`). Both `Identity.
myWireTag`/`expectedWireTag` (iOS) and `IdentityManager.myWireId`/`expectedWireId` (Android) HMAC
the literal `"userId:generation"` string — and HMAC is byte-exact, so the same UUID rendered in
different case produces a completely different tag. This only ever breaks the cross-platform case:
a same-platform pairing (Swift↔Swift or Kotlin↔Kotlin) is always internally case-consistent with
itself, so this bug was invisible until an actual Android↔iOS pairing was tested for the first
time.

**Fix**

Lowercase the userId component right at the two functions that build these HMAC messages
(`Identity.swift`), rather than migrating every already-stored `Identity.userId`/`Contact.id`
value. This fixes an existing broken pairing (the one that surfaced it) immediately on the next
build — no re-pairing needed — since Kotlin's `UUID.toString()` was already lowercase; this just
makes Swift's match it. No Android-side change needed.

**Verified 2026‑09‑02, real hardware (diagnostics only, fix not yet re-tested)**: the tag mismatch
was directly observed by comparing the relay's `STORED …xrLxs4E=` line against iOS's own
`[Relay] pollOnce: ... tag=...eknGyy8=` line for the same contact at the same time — two different
tags for what should be the same wire identity. The lowercase fix itself is not yet re-verified on
a device.

## 2026‑09‑02 (8) · Android: fix deleting a cross-platform (iOS) contact silently failing to notify the other device

**What was done**

Ported a bug fix found on the iOS app this session over to the equivalent Android code path — the
Android cross-platform (iOS-interop) delivery queue had the identical class of bug.

**Bug / cause**

`P2PNetworkManager.attemptDelivery()`/`attemptChunkTrainDelivery()` detected a cross-platform
contact with a live `contactDao.getContactById(id)?.crossPlatform == true` check, re-run on every
delivery attempt. `sendDeleteContact()` enqueues the delete signal and then immediately deletes the
contact row in the same coroutine (by design — the user shouldn't have to wait). By the time the
delivery worker actually tried to send that queued signal, `getContactById` returned `null`, and
`null?.crossPlatform` evaluates to `null` (not `true`) — so the cross-platform branch was silently
skipped, and the item fell through to the onion/global-relay path, which has no usable destination
for an iOS peer (no onion address, and the global relay is a different, usually-unconfigured relay).
The delete signal never actually left the device: the contact vanished locally on Android but stayed
on the iOS side forever. This is the exact same shape of bug found and fixed in iOS's own
`RelayService.swift` (`PendingDelivery` re-reading `contactStore` on every retry) earlier this
session.

**Fix**

Added `crossPlatformWireId`/`crossPlatformRelayCandidates` fields to `PendingDelivery`, computed and
snapshotted once at enqueue time (`sendDeleteContact()`, `enqueueRatchetMessage()`) instead of
re-derived from a contact row that may no longer exist by delivery time. `attemptDelivery()` and
`attemptChunkTrainDelivery()` now check these snapshotted fields *before* any `contactDao` lookup,
so a cross-platform contact's delete signal (or an in-flight message/chunk train) keeps retrying
correctly even after the local contact row is gone.

**How to apply**

Only `app/src/main/java/com/nexonai/unpruuf/domain/network/P2PNetworkManager.kt` changed. Not
verified against a real build (no Android SDK in this environment, same limitation as the rest of
this project's Android work) — reviewed for structural correctness (balanced braces/parens) and
consistency with the existing, already-correct pattern the direct (onion-based) delivery path uses
via `onionOverride`. Please rebuild and test: delete a cross-platform (iOS) contact from Android and
confirm it disappears on the iOS side too.

## 2026‑09‑02 (7) · Fix: a message sent right before backgrounding could be lost forever

**What was done**

User report: wrote a message on one device, immediately backgrounded the app, waited 30 minutes,
opened the second device — the message never arrived, and was gone from the relay's own queue too,
not just from the sender's chat.

Root cause: `.background` called `AppEnvironment.stop()` the instant it fired. That both resets
`TorController.isReady` — which `RelayService.attemptAllPending`'s delivery loop gates on — and
wipes every RAM message (`messageStore.wipeAll()`, by design, mirrors the Android app's
background wipe). A delivery still queued or mid-flight at that exact moment was cut off with no
way to retry and nothing left in the UI to even show it had failed. Compounding it: the app never
requested any extra background execution time from iOS, so the process could be suspended within
seconds of backgrounding regardless — often before a fresh Tor SOCKS connection + HTTP POST to the
relay has any realistic chance to complete.

**Fix**: `.background` now requests the standard `beginBackgroundTask` grace window and defers
`stop()` until either `RelayService`'s new `waitForPendingDeliveries` reports the outbound queue
is empty, or that window is about to run out (25s budget) — whichever comes first — instead of
cutting delivery off unconditionally. Guards against the case where the user returns to the app
before the deferred `stop()` fires (a fast background→foreground round-trip could otherwise stop a
session `env.start()` had already restarted).

**Verified 2026‑09‑02, real hardware.** Message sent, app backgrounded immediately — the real
device log shows the relay POST (`returned 201`) completing *after* `[Scene] phase changed to
background` and before `stop()` ran, and the message arrived on the second device within
seconds.

## 2026‑09‑02 (6) · Fix: `NWConnection` deadlocked on `.waiting` instead of retrying

**What was done**

The custom `TorControlConnection` from (5) still failed on real hardware, same `nilError` text as
before — surprising, since that class has zero Objective-C bridging, so it couldn't be the same
synthesized-NSError artifact found in `Tor.framework`. Added full diagnostics first (every
`NWConnection` state transition, plus the real `NSError` domain/code/`userInfo` on failure instead
of just the error's bare description) rather than guessing again.

The next real-device log revealed the actual bug: the very first connect attempt after
backgrounding — made before Tor has even booted, so the control-socket file doesn't exist yet —
put `NWConnection` into `.waiting(POSIXErrorCode.ENOENT)`, a state `TorControlConnection.connect()`
didn't handle at all (fell into `default: break`, doing nothing). Since that state never called the
completion handler, `TorController`'s retry loop — entirely driven by that completion firing —
silently deadlocked forever on its very first attempt. Meanwhile Tor went on to boot, open its
control listener, and bootstrap to 100%, completely unnoticed: `NWConnection` does not itself
re-poll a Unix-domain socket path that didn't exist at connect time, even once the path starts
existing — its automatic `.waiting` retry is designed for real network-path changes (Wi-Fi drop,
cellular takeover), not this.

**Fix**: `.waiting` is now treated as a failure for this class's purposes — same handling as a real
`.failed`, cancelling the connection and calling completion with the error. `TorController`'s
existing retry loop (a fresh `TorControlConnection`/`NWConnection` every 0.5s, up to 40 attempts)
then does what it was already built to do: try again with a fresh connection once the socket
actually exists.

**Verified 2026‑09‑02, real hardware.** The next attempt after the expected first-attempt ENOENT
connected the instant Tor opened its control listener, authenticated, and bootstrapped to 100% —
and, critically, **three separate background→foreground cycles in the same run** all hit
`start(): reusing existing authenticated controller, re-polling bootstrap status` →
`ready! port=…` immediately, with zero reconnect failures. This closes out the fifteen-real-bug
Tor-connectivity debugging arc that ran across this session and 2026‑08‑29: the reconnect-after-
backgrounding bug is fixed.

## 2026‑09‑02 (5) · Fix (final): replace `Tor.framework`'s broken `TORController` with a custom control-connection client

**What was done**

The (4) structural fix below turned out to be insufficient on its own: real-hardware logs showed the
*very first* reconnect after backgrounding still hitting the same wall whenever it needed even one
retry, proving the underlying limitation applies to `Tor.framework`'s connection object itself, not
specifically to background/foreground timing. Read `iCepa/Tor.framework`'s actual `Tor/TORController.m`
source on GitHub directly (not guessed) to find the real root cause: `-connect:` backs every attempt
with `dispatch_io_create(..., [[self class] controlQueue], ...)` — a **private, class-level shared
serial dispatch queue**, the same one for every `TORController` instance ever created in the process.
Once that queue has backed one real channel, a second `dispatch_io_create` call against it reliably
returns `NULL`, and the framework's own `-connect:` then returns `NO` **without ever populating the
`NSError`** (an API-contract violation — this is exactly why Swift showed the uninformative `nilError`
instead of a real one), leaking the raw socket on that path too. A genuine bug in the framework itself,
confirmed from source, not fixable from anything on this side of its public API. Checked for a newer
framework release (none — 409.11.2 is still the latest tag) and for a viable alternative Tor engine
(Arti, Tor Project's own Rust rewrite, has no stable API yet and would need hand-written FFI bindings —
not a safe swap for a shipping app).

**The fix**: since `Tor.TorThread`/`TorConfiguration` (actually running Tor) were never the problem —
only `Tor.TorController`, the thin control-socket client — `TorController.swift` no longer uses
`Tor.framework`'s `TORController` at all. A brand-new file, `TorControlConnection.swift`, is a small,
independently-implemented Tor control-protocol client (`AUTHENTICATE`/`GETINFO` only — the only two
commands this app actually needs) built on Apple's own `Network.framework` (`NWConnection` over the
same Unix-domain control socket), which has no shared-queue limitation of this kind — a completely
separate connection path, not another consumer of the broken one. Tor itself is completely untouched by
this change and keeps working exactly as already proven on real hardware; only the connection *to* it
was ever broken.

**Not yet verified on a device** — this is the next real-hardware test to run: rebuild, background the
app, reopen it, and capture the Xcode console log.

## 2026‑09‑02 (4) · Fix (structural): stop tearing down the Tor control connection at all

**What was done**

Real-hardware data disproved the (3) delay experiment below: across three background/foreground
cycles and ~20+ seconds of continuous retrying, not one attempt ever succeeded. Worse, the same
`nilError` failure showed up on a plain fresh app launch too, the moment its very first connection
attempt needed even one retry past the expected initial `ENOENT` (socket file not written yet) —
proving this was never really about backgrounding specifically, just about needing a *second* real
`dispatch_io_create()` call at all, ever, in the process.

**New theory, better supported by that evidence**: the control connection is a purely
intra-process Unix-domain socket — both ends (Tor's own thread and our control client) live in the
same process. Backgrounding freezes the whole process, Tor's thread included; there's no real
network path for an OS-level timeout to sever, and the engine itself was already proven (see the
second real-bug note in `TorController.swift`) to keep running untouched through a
background/foreground cycle. So the connection `stop()` used to tear down almost certainly never
actually broke on its own — the app was destroying a working connection and then hitting the
`dispatch_io_create` framework limitation trying to rebuild it.

**Fix**: `stop()` no longer touches the control connection at all (only resets the UI-facing
`isReady`/`socksPort`). `start()` tracks whether a connection has ever successfully authenticated
(`hasAuthenticated`, distinct from merely having an in-flight, not-yet-confirmed attempt) and, if
so, just re-polls that same existing connection for current bootstrap status instead of
reconnecting — sidestepping the framework limitation entirely rather than working around it.

**Not yet verified on a device** — this is the next real-hardware test to run.

## 2026‑09‑02 (3) · Investigate: Tor reconnect after backgrounding — real framework bug found, fix still experimental

**What was done**

The (2) fix below (fresh `TORController` per retry) turned out to be necessary but not
sufficient — real-hardware logs from two more test runs (i12 and i16, both after that fix) showed
every single retry after the first still failing with the same uninformative `nilError`, even
though Tor's own log now confirmed a genuine new connection reaching the daemon on every attempt.

**Real research, not a guess**: read `iCepa/Tor.framework`'s actual source (`TORController.m`) on
GitHub directly. Confirmed: the failure is `dispatch_io_create()` returning `NULL` inside the
framework's own `-connect:` method, which then does `if (!_channel) return NO;` **without ever
populating the `NSError`** — an API-contract violation on the framework's part, which is exactly
why Swift shows a generic, uninformative error instead of a real one. Also confirmed the raw
socket is leaked (never closed) on that failure path — a genuine bug in the framework itself, not
fixable from the app side. Ruled out a retain cycle on the read-loop's completion block (it
correctly uses `weak self`, confirmed from source).

**What's still unknown**: why `dispatch_io_create` reliably fails on the *second* real connection
attempt within a process, every time, while the very first one (a fresh app launch) always
succeeds. No documented limit or shared-queue conflict was found in the source to explain it
definitively.

**Experimental change**: a 2-second delay before the first reconnect attempt after the app resumes
from being suspended in the background, testing the hypothesis that `dispatch_io_create` is being
called before iOS has fully restored the process's GCD/dispatch_io subsystem. Unlike the ten
previously-fixed real bugs in this file, this one is **not yet confirmed** — needs a real-hardware
background/foreground test to know if it actually helps.

## 2026‑09‑02 (2) · Fix: Tor never reconnected after backgrounding the app (real hardware)

**What was done**

Real bug found on real hardware, closing out a ten-bug arc in `TorController.swift`: a fresh app
launch connected to Tor fine, but backgrounding the app and reopening it reliably failed every
single retry with an uninformative `nilError`, exhausting the ~20s retry budget every time.

**Root cause**

`connectAndAuthenticate` retried `controller.connect()` on the SAME `Tor.TorController` instance
across every attempt. Tor's own log showed the real story: exactly one `New control connection
opened.` line no matter how many Swift-side retries followed — the daemon only ever actually
accepted the very first attempt. That first `connect()` reached the daemon but errored on our side
anyway, and every subsequent `connect()` call on that same once-attempted object then failed
immediately without the daemon seeing it again — the identical one-shot limitation already known
for `TORThread` (only tolerates one instance per process), just for `TORController.connect()`
specifically. This only ever surfaces on a *second* connection attempt (background → foreground),
which is exactly why a fresh launch never showed it in nine prior real-hardware debugging sessions.

**Fix**

Construct a brand-new `TORController` for every retry attempt instead of reusing one that already
failed. Not yet re-verified on a device — the reporting device's own real-hardware Xcode console
log (captured mid-session) was what pinned this down.

## 2026‑09‑02 (1) · Add: a second, independent relay for "two separate people" testing

**What was done**

New `server/mac/start-relay-b.command` (plus `install-relay-b-service.command`,
`uninstall-relay-b-service.command`, `show-code-b.command`, `status-b.command`) run a second,
fully independent relay instance on the same Mac — its own identity, its own onion address, its
own port (8788 instead of 8787), everything under `server/instances/b/` instead of `server/`
itself. Shares only the read-only `tor` binary and the same `dist/` build; no mutable state is
shared between the two (verified: creating an instance-b identity leaves the main instance's own
`--status-json` output completely unaffected).

**Why**: to test pairing two iPhones against two *different* relays, as if each phone belonged to
a separate person, instead of both sharing the one relay they'd been using so far. Point one
phone's Settings → "My relays" at the main relay's connection string and the other phone's at this
second one's — each phone's QR then advertises a different relay.

**Scope note**: Terminal-only, not wired into the menu bar app (which still only manages the main
relay) — this is a testing convenience, not a new product surface.

## 2026‑09‑01 (8) · Fix: deleting a contact never actually reached the other device

**What was done**

Real bug found on real hardware: deleting a contact on one iPhone was supposed to notify the other
side (`ControlSignals.deleteContact`) so their copy gets removed too, but the other device's
contact was left behind indefinitely, even with Tor connected the whole time on both ends and
normal messaging working fine.

**Root cause**

`ContactListViewModel.remove` fired the signal send as an un-awaited `Task`, then immediately
called `contactStore.remove` on the next line. Both run on the main actor, so the synchronous
removal always completed before the just-spawned Task got a chance to run at all (Swift's
cooperative scheduling doesn't preempt currently-running synchronous code). By the time
`sendControlSignal` actually executed, the contact was already gone from `contactStore` — its own
lookup guard failed silently, and the signal was never sent. Making it worse, `RelayService`'s
delivery-retry loop *also* re-looked-up the contact from `contactStore` on every attempt, so even a
signal that did make it into the queue before this would have retried forever against a contact
that no longer existed, and could never succeed.

**Fix**

1. `ContactListViewModel.remove` is now `async` and `await`s the signal send *before* removing the
   contact locally — the contact still exists at the moment `sendControlSignal` needs to read its
   encryption key and generation.
2. `RelayService`'s `PendingDelivery` now snapshots the wire tag and destination relay list at
   enqueue time instead of re-reading `contactStore` on every retry — a queued item (most
   importantly the delete-contact signal itself) now keeps retrying correctly using its own
   snapshot, completely independent of whether the contact it was for still exists.

## 2026‑09‑01 (7) · Verified: menu bar app's background service, real hardware, end to end

**What was done**

Confirmed the actual root cause of the green-dot-but-nothing-running saga: a stale onion hostname
file (left on disk on purpose after a clean stop — see mac/README.md — and also after an abnormal
kill) was being read as "running", so once the relay had ever published once, the status dot
stayed green and the Start button never came back even with the background service fully stopped.
Fixed by having `launchctl`'s loaded/not-loaded state decide running-vs-stopped first; the onion
file now only narrows down *which* running sub-state once launchctl already confirms the service
is loaded.

**A second real bug found in the same investigation**: `start()`/`stop()` had no guard against a
second overlapping call (e.g. a double click landing before the first click's `isBusy` had
re-rendered the disabled button). A second `install-service.command` run's own `launchctl bootout`
of any existing registration would kill the first call's freshly-started relay out from under it —
exactly matching a real log trace captured mid-investigation: Tor bootstrapped to 100%, the relay
started serving, then received a clean `[shutdown]`-triggered stop moments later with no crash or
error in between. Fixed with an `isBusy` re-entry guard on both methods.

**Also fixed**: Start/Stop previously discarded `install-service.command`'s/
`uninstall-service.command`'s exit code and output entirely — a failure looked identical to success
from the UI. Now sets `lastError` with the exit code and full output on failure.

**Verified 2026‑09‑01, real hardware, end to end**: `lsof -i :8787` shows a genuine `node` process
listening; `launchctl list` shows `com.nexonai.unpruuf.relay` registered and matching that same
PID. The background service — auto-start at login, auto-restart on crash, survives logout/reboot —
is now confirmed actually working, not just displaying a misleading green dot.

## 2026‑09‑01 (6) · Fix: "Open log" doing nothing + a hard timeout on all shell calls

**What was done**

`NSWorkspace.activateFileViewerSelecting` was silently failing to bring Finder forward for this
`LSUIElement` (menu-bar-only) app — no error, just no visible effect, indistinguishable from a
broken button. Switched both "reveal in Finder" actions (server folder, log file) to shell out to
`open -R` instead — the same mechanism Finder's own "Reveal in Finder" uses. Also added a fallback
to the containing folder (with a visible message) when the log file doesn't exist yet, instead of
a silent no-op.

**Separately**: added a 15s hard timeout to every `runShell` call, force-terminating the child
process and resuming with an error instead of blocking indefinitely. This matters because a wrong
or unreachable folder (once, accidentally the Xcode project's own folder) combined with a real
macOS/cloud-sync (OneDrive/Google Drive) hang left the whole Mac needing a hard power-cycle earlier
in the same session — Force Quit couldn't even recover it.

**Also added**: a spinner (`isRefreshing` + `ProgressView`) on the manual refresh button — clicking
it previously gave no visible feedback for the ~1-2s a real `node` invocation takes, reading as "did
nothing."

## 2026‑09‑01 (5) · Verified: macOS relay menu bar app, real hardware

**What was done**

First real build-and-run of `server/mac/MenuBarApp/`, on the same Mac that hosts the relay used in
the 2026‑08‑29 iPhone-to-iPhone test. Confirmed working end to end: green status dot, onion address
and TTL displayed, empty-queue text, Start/Stop and Show QR/code all exercised successfully.

**Bugs found and fixed to get there**

1. `RelayController` used `Result<_, String>` throughout — plain `String` doesn't conform to
   `Error` in Swift, so this failed to compile with "Type 'String' does not conform to protocol
   'Error'". Fixed with a small `RelayError` wrapper type.
2. No timeout existed on the app's shell-out calls. During setup the wrong folder was picked once
   (accidentally the Xcode project's own folder instead of `server/`) and — combined with what was
   most likely a real macOS/cloud-sync hang (this Mac runs both OneDrive and Google Drive; a
   File Provider hang enumerating cloud placeholder files is a known real issue, and matches the
   symptom far better than anything in this app's own code) — the whole Mac became unresponsive to
   Force Quit and needed a hard power-cycle. Added a 15s hard timeout to every `runShell` call that
   force-terminates the child process and resumes with an error instead of blocking indefinitely,
   regardless of the actual root cause.
3. A merge gap: the delivered `server/src/mac-start.ts` (with `--status-json`/`--show-code-json`)
   didn't make it into the operator's local `server/` folder on the first attempt — only
   `server/mac/MenuBarApp/` had been copied — so the compiled `dist/mac-start.js` didn't recognize
   the new flags and silently ran the full interactive relay-start flow instead. No code fix; this
   is a delivery-process note for future server/ deliveries (a full-folder overwrite, not a
   Finder-drag merge, avoided a repeat).

**Also added**: a spinner (`isRefreshing` + `ProgressView`) on the manual refresh button — clicking
it previously gave no visible feedback for the ~1-2s a real `node` invocation takes, reading as "did
nothing."

## 2026‑09‑01 (2) · Add: macOS menu bar app for the relay

**What was done**

A new `server/mac/MenuBarApp/` — a small SwiftUI menu bar app (macOS 13+, `MenuBarExtra`) that
gives the relay a green/yellow/red status dot plus Start/Stop and "show QR code again", replacing
the need to open Terminal for routine operation. It deliberately does not reimplement any relay
logic: Start/Stop shell out to the existing `install-service.command`/`uninstall-service.command`,
and the status dot polls the relay's own `node dist/mac-start.js --status-json` (new, see below).

**New read-only JSON subcommands on `mac-start.ts`**

Added `--status-json` and `--show-code-json`, machine-readable siblings of the existing
`--status`/`--show-code` (same underlying data, JSON instead of formatted text/QR-art) — so a GUI
never has to scrape terminal-formatted output or re-implement `buildConnectionString`'s wire
format by hand. Same safety guarantee as the originals: read-only, safe to run continuously
alongside an already-running relay. Covered by the existing test suite (62/62 passing) plus manual
smoke tests of all three JSON shapes (not-set-up, published, and the connection-string payload).

**Why a menu bar app specifically, not a full window**

The relay already runs unattended in the background via launchd (`install-service.command`) — the
gap this closes is purely "how do I check on it / restart it without Terminal", which a
glanceable menu bar indicator answers more directly than a window that has to be opened and
remembered.

**Not yet verified:** not run on a device (Swift can't be compiled in this environment) — see
`server/mac/MenuBarApp/README.md`'s "Known risk areas" for what's most likely to need a fix once
it's actually built.

## 2026‑09‑01 (1) · Fix: missing `import Combine` in `ArchivedRelayStore.swift`

**What was done**

The first real on-device build of the 2026‑08‑31 relay-list/Tor-light/deletion-confirmation work
failed with "Type 'ArchivedRelayStore' does not conform to protocol" — `ArchivedRelayStore` uses
`ObservableObject`/`@Published`, both declared in Combine, but the file only imported `Foundation`.
Added `import Combine`. Confirms `ContactStore.swift`/`RelayPoolManager.swift` (which already had
the correct pair of imports) as the pattern the rest of the service layer should follow.

**Not yet verified:** fixed but not yet rebuilt on the device — pending confirmation from the same
build session that surfaced it.

## 2026‑08‑31 (3) · Add: confirm before deleting a contact, with the option to keep their relay

**What was done**

Swipe-to-delete on a contact went straight to deleting, no confirmation at all, and always
discarded the contact's relay address along with everything else. It now asks first — "Delete
Contact & Relay" / "Delete Contact, Keep Relay for Later" / "Cancel" — and "keep relay" archives
their address (labeled with their name at time of deletion) into a new **Settings → Archived
relays** section, with Copy and Delete-forever per entry.

**What "keep" deliberately does and doesn't do**

Archiving only ever preserves the address as a plain reference. Deleting the contact still always
sends them `ControlSignals.deleteContact` and zeroizes the shared message history — "keep relay"
changes what happens to *one piece of data on this device*, not whether the relationship actually
ends. If that person comes back, re-pairing is still a fresh QR scan either way: only that
re-establishes the real cryptographic identity and Double Ratchet session, so the archive is a
lookup aid, not a shortcut back into a live contact — the confirmation dialog's own message and
the section's footer both say so explicitly, to avoid the reasonable-sounding but wrong
expectation that "keep relay" partially un-deletes them.

**New `ArchivedRelayStore`**

A small `Codable`-backed `UserDefaults` store, separate from the contact's own record (which is
genuinely gone after deletion) — same storage trust level `AppEnvironment`'s own relay strings
already use, not a new weaker place for this data to live. De-duplicates by connection string, so
re-deleting the same contact twice can't pile up repeats.

**Not yet verified:** not run on a device (Swift can't be compiled in this environment).

## 2026‑08‑31 (2) · Tor light: consistent placement + colour-blind palette; redesigned relay lists

**Light placement, made consistent**

Moved from wherever fit best per-screen (leading in the contact list, centred in a chat) to
**trailing on every screen** — contact list, every chat, and now Settings too. A chat's leading
slot is the system back button, so trailing is the one corner every screen actually has in
common; better to be predictable everywhere than "correct" on one screen and different on others.

**Colour-blind-friendly palette**

Settings → Appearance now has a picker: Red/Green (default, the "traffic light" most people
expect) or **Blue/Orange**. Red-green is the axis the most common forms of colour blindness
(protanopia/deuteranopia) can't reliably distinguish — it's also the one pair a stoplight
metaphor makes almost unavoidable as a default. Blue/orange was chosen deliberately rather than
guessed: it's the pairing accessibility guidelines recommend precisely because it sits on a
different axis from *both* red-green and the much rarer blue-yellow (tritanopia) defect — no
single two-colour choice is universal, but this one has the broadest coverage. Stored as a plain
`@AppStorage` preference (shared between `TorStatusLight` and the Settings picker via the same
key) rather than routed through `AppEnvironment`, since it's a per-device display preference with
no business logic attached.

**Relay lists redesigned: "My relays" and "Contacts' relays"**

Replaced the fixed "My relay" / "Backup relay" text fields with one dynamic **"My relays"**
section: a primary row always shown, a backup row that appears once the primary has something
saved, each with an optional local-only label (e.g. "Mac at home", "Windows VM backup") to tell
two of the operator's own relays apart, and a Delete button (with confirmation) on any filled row.
Deleting the primary while a backup exists promotes the backup into the primary slot rather than
leaving a gap. Once both are filled, a note explains the 2-relay cap is a QR size limit, not a
missing feature — the requested "empty row appears once the current one has content" pattern,
bounded by that real constraint (`RelayConnectionString.maxPoolSize`).

Added a new **"Contacts' relays"** section: one row per relay address a paired contact has told
this device, grouped by contact, editable directly, with an "add a backup relay for X" row per
contact who has fewer than the maximum. **Deliberately implemented as a live view over each
contact's own stored data (`Contact.theirRelayConnectionStrings`), not a separate list** — the
request described maintaining two lists in sync by hand (delete the contact, then remember to also
delete its relay entry elsewhere); a second, independently-stored list would be exactly the kind
of duplicated source of truth this session's earlier bugs kept coming from. Deriving it live means
deleting a contact (existing swipe-to-delete) removes its section here automatically, with nothing
to keep in sync and no way for the two to drift apart. Editing here is explicitly a **manual local
correction** — it does not notify the contact, unlike the existing synchronized "Rotate my
identity" (Wechsel) action inside each chat, and the footer text says so. Deleting a contact's
*only* relay gets a stronger confirmation ("they can't reach you until...") rather than an ordinary
one — a direct callback to this session's earlier empty-relay-pool bug, now guarded at edit time
too, not just at pairing time.

**Implementation note on both new list UIs:** each row (`MyRelayRow`, `ContactRelayRow` in the new
`RelayListRows.swift`) is a small `View` owning its own `@State` for the text field, keyed with an
explicit `.id(...)` tied to the row's *current stored* value. That's what lets typing survive the
parent re-rendering on unrelated changes, while still picking up an external change (the "Import"
button, or a Wechsel signal arriving from a contact while Settings happens to be open) instead of
silently showing stale text — a plain `@State` without the identity key would only pick up an
external change if the row happened to be recreated for unrelated reasons.

**Not yet verified:** none of this has run on a device (Swift can't be compiled in this
environment). Scope note: the light was added to the contact list, every chat, and Settings — not
to the pairing sheet or the contact-verification sheet, which are one-time-use flows rather than
places a stuck message would be noticed.

## 2026‑08‑31 · Add: always-visible Tor status light in the iOS app

**What was done**

A small indicator — green when Tor is connected, red when it isn't — now sits in the navigation
bar of both the contact list (top left, beside the settings gear) and every chat (beside the
contact's name, since the top-left slot there belongs to the back button).

**Why it matters more than it looks**

"Why is my message stuck?" and "is Tor up?" are the same question in this app: both sending and
receiving return early when `TorController.isReady` is false (`RelayService.attemptAllPending` and
`pollOnce`). Until now that state was only visible in Settings — so noticing it meant leaving the
conversation where the problem was showing. This session's debugging repeatedly ran into exactly
that gap.

**Implementation note worth keeping**

`TorStatusLight` takes the `TorController` as an `@ObservedObject` parameter rather than reading
it off `AppEnvironment`. That is deliberate: a computed lookup through a *nested*
`ObservableObject` never fires the enclosing view's `objectWillChange` — the same SwiftUI trap
already documented on `ContactListViewModel` and worked around the same way in `SettingsView`.
Because the observation lives in the light itself, no parent needs to observe anything for it to
stay current. `ChatView` gained a `torController` parameter for the same reason.

**Known limitation, stated rather than hidden:** red/green is the most common form of colour
blindness. The state is exposed as a VoiceOver accessibility label, and Settings → Status still
spells it out in words, but the light alone does not carry the state without colour. A shape
change would fix that at the cost of the "light" metaphor that makes it readable at a glance.

**Not yet verified:** not run on a device (Swift can't be compiled in this environment).

## 2026‑08‑31 · Add: send camera photos from the iOS app

**What was done**

The receive side and the chunked transport already existed (`MessagePayload`'s attachment type,
`RatchetFrame`'s splitting) — only the sending UI was missing, and received photos were rendered
as the literal text "🖼 Photo.jpg" with no way to look at them. Both are now built:

- `CameraPicker.swift` — `UIImagePickerController` wrapper; the camera button is hidden entirely
  where no camera exists (Simulator) rather than shown greyed out.
- `ImagePreparer.swift` — re-encodes every outgoing photo through a fresh graphics context.
- `ChatViewModel.sendImage` — prepares, wraps in the existing attachment payload, and hands it to
  the same delivery queue text uses.
- `ChatView` now renders photos as actual images, tappable to full screen.
- `FullscreenImageView.swift` — viewer, deliberately with no save/share action.

**Privacy: EXIF is stripped, unconditionally**

Every photo is re-encoded even when it is already small enough. Drawing through a graphics context
drops EXIF (**including GPS location**), XMP and embedded thumbnails, and bakes orientation into
the pixels so the stripped copy isn't rotated. Doing this only for oversized images would leak
location from small ones — same reasoning, and same always-re-encode rule, as the Android side.
The full-screen viewer offers no "Save to Photos": the rest of the app is built so message content
never reaches persistent storage, and that button would quietly undo it for the one message type
where it matters most.

**A pre-existing warning in the code, now resolved rather than inherited**

`AppLockManager.swift` carried an explicit note: Android needs a bounded "external-intent grace"
because its camera is a *separate Activity*, so launching it backgrounds the app and trips
"user left → wipe RAM + lock" — every attach attempt used to return to a PIN screen with the photo
dropped. The note said to port that grace "when a picker is actually wired up — don't rediscover
that bug blind." Checked rather than copied: iOS presents `UIImagePickerController` **in-process**,
so the app stays foreground and `scenePhase` reaches at most `.inactive`, which `UnpruufApp`
ignores by design (confirmed on real hardware, where the Face ID prompt produces exactly that
transition). The grace is therefore **not** ported — it would weaken the background-wipe guarantee
for nothing. The comment now records the finding and states the symptom that would disprove it.

**Size budget deliberately smaller than Android's**

Android caps photos at 2 MB / 2048 px. Here they are capped at ~600 KB / 1600 px, because
`SocksHTTPClient` opens a *fresh Tor connection per 4096-byte packet* — 2 MB would be ~525
separate round-trips (roughly 4–9 minutes for one photo) versus ~154 (~1–2.5 minutes). This is a
local sender-side policy, **not** a wire-format change: an Android peer sending a 2 MB photo is
still received correctly, since a fetch returns every queued chunk in a single request and only
sending is per-chunk. The right way to raise it is connection reuse in `SocksHTTPClient`, noted
there as the follow-up.

**Also fixed while building it:** the first draft stacked two `.fullScreenCover` modifiers on one
view — a known SwiftUI trap where only one reliably takes effect. Both presentations now share a
single cover driven by one enum, which additionally makes "camera and photo viewer can never be
open at once" true by construction.

**Not yet verified:** none of this has run on a device — no camera exists in this environment and
Swift cannot be compiled here. Photo library sending was deliberately left out (the request was
the camera); it needs no extra Info.plist permission via `PHPickerViewController` if wanted later.

## 2026‑08‑31 · Add: macOS relay can run unattended — background service, watchdog, status, QR reprint

**What was done**

Four gaps that all shared one root cause — the relay assumed someone was sitting in front of the
Terminal window it was printing to:

1. **Background service.** `mac/install-service.command` installs the relay as a launchd agent:
   it survives closing the Terminal, starts at login, and is restarted by launchd if it dies.
   `mac/uninstall-service.command` removes it, deliberately leaving identity, onion address and
   queued messages intact so contacts never have to re-pair. The installer **refuses** to run
   before `start-mac.command` has been run once — the first run asks how long to keep undelivered
   messages, and a launchd process has no terminal to answer in; it would have silently taken the
   default without the operator ever knowing they'd been asked.
2. **Tor watchdog** (`keepTorAlive` in `torProcess.ts`). A Tor process that died *after*
   publishing its hostname used to be completely invisible: the HTTP server kept running, the
   console kept printing nothing, and the freshly advertised onion was silently unreachable. It is
   now supervised, restarted with a delay, and logged. Restarts are bounded (5 by default) —
   a Tor that dies instantly and repeatedly is a configuration problem, and retrying forever
   would bury the cause in noise. The onion address survives a restart (its keys live in the data
   directory), so paired contacts are unaffected.
3. **`--status`** (and `mac/status.command`): onion address, TTL, and what is currently queued,
   read from the relay's own files. Works *while the relay runs in the background*, which is
   exactly when there is no console to look at. SQLite's WAL mode allows this second reader
   alongside the live writer.
4. **`--show-code`** (and `mac/show-code.command`): reprints the QR and connection string. It was
   previously only printed at startup, so pointing a new device at a running relay meant
   restarting it — which drops every message currently waiting to be collected.

Also added a 30-minute heartbeat line to the running relay (uptime + queue summary), so a long
quiet stretch is visibly "alive and idle" rather than ambiguous.

**Supporting changes**

`BlobStore.stats()` (aggregate queue depth, distinct tags, age of the oldest item — deliberately
never tags or blobs, so status output stays consistent with the relay's blindness to who is
talking to whom), and `relayStatus.ts` for the read-only file-based views.

**Scope note**

The watchdog, status and QR-reprint logic all live in shared modules (`torProcess.ts`,
`relayStatus.ts`), not in the macOS entrypoint, so `windows-start.ts` can adopt all three by
wiring the same three calls. That was deliberately not done here: it was scoped to macOS, and the
Windows path is currently working and untestable from this environment.

**Verified**

Full suite passes (62/62 — 12 new tests covering queue stats, onion-address reading including the
empty-file transient, queue/uptime formatting, and the watchdog's restart, give-up and
don't-fight-a-deliberate-shutdown behaviours, the last three against real short-lived child
processes). `--status` and `--show-code` were also run end-to-end against a simulated configured
relay and rendered correctly. **Not verified on a real Mac**: the launchd install/uninstall
scripts themselves — they are shell scripts this environment cannot execute.

## 2026‑08‑30 · Add: live activity log in the relay's own console (all platforms)

**What was done**

The Node relay (`server/`) printed nothing at all after startup — a perfectly healthy relay and a
completely broken one looked identical from the operator's window. It now prints one line per
event, the same information the Android relay app already showed on its "RECENT ACTIVITY" card:

```
[relay] 21:18:05  STORED   …SUFFIX99  4.0 KB queued
[relay] 21:18:06  FETCHED  …SUFFIX99  2 messages picked up, 8.0 KB, waited 1s
[relay] 21:18:06  REJECTED …s space!  rejected: invalid tag
```

- **STORED** — a message arrived and is queued.
- **FETCHED** — the recipient collected it, with how long it sat waiting. That dwell time is the
  fastest way to separate "the recipient is offline" from "nothing is arriving at all".
- **REJECTED** — with the actual reason (bad tag, oversized blob, queue full).

**Note on scope:** this was requested as "give the Mac relay what the Windows relay has" — but the
Windows relay did not have it either. No platform did; all three (Docker/Linux, Windows, macOS)
share `app.ts`/`routes/relay.ts`, so this is implemented once, centrally, and every platform gets
it. The feature being remembered was the Android relay *app*'s activity card.

**Design decisions worth knowing**

- **Empty polls are deliberately not logged.** Every connected client polls every 20 seconds; that
  would bury real events within seconds. A quiet window with clients connected therefore means
  "nothing to deliver", not "nothing is working" — documented in both READMEs so it isn't
  mistaken for a fault.
- **Privacy stance is inherited from the Android version, not relaxed.** Only a *last-8-character*
  tag suffix, a size, and timing are recorded — never the blob, never a full tag, never the auth
  token. A regression test asserts a full tag can't reach the formatted output. One honest
  difference from Android's in-memory ring buffer: this writes to stdout, which persists if the
  operator redirects it to a file or runs under a service manager — stated plainly in the READMEs;
  nothing here writes a log file on its own.
- Malformed requests get their tag truncated the same way before printing, so a hostile client
  can't write long arbitrary strings into the operator's console.

**Supporting change**

`BlobStore.takeAllWithMeta()` was added so a fetch can report each blob's real queued-at time;
`takeAll()` now delegates to it, so there is still only one copy of the take-and-delete
transaction. Without it the "waited" figure could only have been guessed at.

**Verified**

Full suite passes (51/51 — 9 new tests covering suffixing, base64 length, duration formatting,
each event shape, and the no-full-tag privacy guard). Also exercised end-to-end against a real
running server: STORED/FETCHED/REJECTED all rendered correctly, the dwell time was accurate, and
an empty poll on an unrelated tag correctly printed nothing.

## 2026‑08‑29 · Delivery: iOS messaging works end-to-end + macOS relay (13 real bugs fixed)

**What was done**

The milestone delivery of this session: **two real iPhones now exchange messages in both
directions**, over Tor, through a relay the user hosts on their own Mac. Both halves of that were
built and debugged here from scratch.

*New capability — macOS relay (`server/mac/`, `start-mac.command`):* the Node relay previously ran
on Docker/Linux and Windows only. It now runs natively on macOS with the same double-click
experience: manages its own Tor child process, auto-downloads the correct Tor Expert Bundle
(Apple Silicon or Intel), and prints the QR code plus connection string. The platform-agnostic Tor
process handling was factored out into `torProcess.ts`, shared with the Windows path so the two
cannot drift apart.

*iOS: thirteen distinct real bugs found and fixed*, every one from real device logs rather than
review — nine on the Tor-connectivity path, three on the relay transport path, one in the macOS
relay's Tor binary handling. Each has its own detailed entry below. The ones most worth knowing:

- iOS `stop()` was sending Tor's `SIGNAL SHUTDOWN` on every background transition, killing the
  actual Tor daemon while appearing not to.
- Relay calls used the relay's *local* port (8787) instead of the onion's exposed virtual port
  (80), so no relay call could ever connect.
- The wire tag was put into the fetch URL un-percent-encoded; standard base64 contains `+`, which
  every query parser decodes back as a space — silently breaking *receiving* for roughly half of
  all contacts while sending kept working. Android had already found and fixed this exact bug; the
  iOS port never picked it up.
- Pairing was possible before a relay was configured, permanently freezing an empty relay address
  into that contact — it could then never receive, silently, forever.
- macOS kills unsigned binaries on Apple Silicon: both the downloaded `tor` **and** every `.dylib`
  it loads need an ad-hoc code signature.

*UX hardening from what the debugging exposed:* pairing is now blocked (buttons disabled, with an
explanation) until a relay is set; a message that cannot be sent shows why instead of sitting on
"Sending…" indefinitely; and the Double Ratchet's one-time "who may send first" asymmetry is
stated at pairing time rather than looking like a fault.

**Bug / cause · Fix**

See the individual dated entries below — each carries its own root cause, the fix, and what was or
wasn't verified.

**How to apply**

- **macOS relay:** extract, go to `unpruuf/server/`, run `./start-mac.command` from Terminal (or
  double-click — see `server/mac/README.md` for the one-time Gatekeeper approval an unsigned
  script needs). Keep the window open; closing it stops the relay.
- **iOS:** rebuild `UnpruufApp` from this ZIP's `ios/` folder on **both** devices, then Clean
  Build Folder → Run.
- **Order matters on first setup:** enter the relay connection string in Settings → "My relay"
  on both devices *before* pairing. Pairing is now disabled until you do.
- **Existing contacts paired before a relay was set are not repairable** — delete and re-pair them
  on **both** devices (one-sided re-pairing desynchronises the Double Ratchet).
- On a fresh pairing, one device is told to let the other write first — that is expected, one-time,
  and explained in-app.

## 2026‑08‑29 · Verified end-to-end, plus: surface the Double Ratchet's one-time send-direction bootstrap

**Verified**

Messaging between two real iPhones works in both directions for the first time — the full path
(Tor → relay on the user's own Mac → Tor → contact) carrying real, Double-Ratchet-encrypted
traffic, with `[Relay] fetched N blob(s)` / `ingestPacket returned true` confirming
decryption on the receiving side. This closes the arc that started with "Connecting to Tor…"
never resolving.

**What happened next**

After a fresh re-pairing, one device could send and the other could not — its messages sat on
"Sending…" indefinitely. The new send-path logging identified it immediately:
`RatchetError(message: "no sending chain yet — must receive at least one message first")`.

- **Not a bug:** `createSession` deliberately gives exactly one of the two devices a sending
  chain up front (`initSender`) and the other none (`initReceiver`) — the latter only gets one
  once it has decrypted an inbound message, which is textbook Double Ratchet and already
  documented in `DoubleRatchet.swift`. It cannot be removed: making both sides initiators would
  have them derive the **same** sending chain from the same DH output and encrypt different
  plaintexts under the same message keys.
- **The real defect was that it was invisible.** Which side gets which role is decided by a key
  comparison, so from the user's side it's arbitrary — and the failure was indistinguishable from
  a network problem. Fixed by surfacing it in three places: the pairing confirmation now tells the
  receiver-role device to ask their contact to write first (and that it only applies to the first
  message); `RamMessage` gained a `failureReason`, set by `sendMessage`'s catch for anything that
  never reached the delivery queue; and the chat bubble shows that reason in place of an
  indefinite "Sending…".
- **Deliberately not done here:** auto-resolving it by having the initiator side send an invisible
  ratchet packet right after pairing. That would make the constraint disappear entirely for users,
  but it adds a packet shape to the wire that the Android app must also understand — a
  coordinated cross-platform change, per `CROSS_PLATFORM_PLAN.md`'s rule that wire-level changes
  need every device updated together. Left as a separate, deliberate step.
- **Not yet verified:** these three UI/state changes have not yet been tested on real hardware.

## 2026‑08‑29 · Fix: pairing without a relay configured created a permanently deaf contact

**What happened**

After the wire-tag encoding fix below, receiving started working — but only in one direction:
iPhone 16 received fine, iPhone 12 received nothing, even though **both** devices showed
"Delivered" for their outgoing messages (so both blobs really were sitting on the relay).
iPhone 12's poll logs were completely silent: no errors, no fetches, nothing.

- **Bug:** `PairingView` hides the "Your code" QR when no relay is configured, but leaves the
  "Scan a contact's code" / "Paste code text instead" buttons active — so a contact could be
  paired *before* the user set their own relay. `PairingViewModel.handleScanned` then stored
  `myRelayConnectionStrings: env.myRelayPool`, i.e. an **empty list**. `RelayService.pollOnce`
  iterates exactly that list, so it did nothing at all for that contact: no request, no error, no
  log — that device could never receive from them, permanently, while *sending* to them kept
  working perfectly (sending uses *their* pool, which was populated). Setting the relay in
  Settings afterwards doesn't repair it either — the empty pool is stored per-contact at pairing
  time and never revisited.
- **Fix:** refuse to pair at all when the user has no relay of their own configured, with an
  explicit message saying why. Also log the empty-pool case in `pollOnce`, so an
  already-broken contact from before this fix reports itself instead of looking like an idle
  relay. Existing broken contacts need a **mutual re-pair** (both sides re-scan, which resets the
  Double Ratchet on both ends together).
- **UX, so the order can't be got wrong in the first place:** `PairingView` now *disables* both
  the "Scan a contact's code" and "Paste code text instead" buttons until a relay is set — it
  previously only hid the QR, leaving the scan/paste path wide open — and its empty state now
  says what to do ("Set your relay first", pointing at Settings → My relay) and why it can't be
  fixed retroactively. The check uses `myRelayPool`, matching exactly what pairing would store,
  rather than `defaultRelayConnectionString` as the old QR-hiding condition did. Confirmed by the
  user as the actual cause on their device: pairing had been done before the relay was set.
- Also added the send-path logging that was missing entirely (`sendMessage`'s silently swallowed
  encryption failure, per-candidate delivery attempts) — a "Sending…" that never resolves had no
  diagnostic trail at all before this.
- **Not yet verified:** this fix has not yet been tested on real hardware.

## 2026‑08‑29 · Fix: iOS never received anything — un-encoded `+` in the fetch URL's wire tag

**What happened**

With the port-80 fix in place, two real iPhones (both Tor-connected, same relay configured) could
finally *send*: iPhone 12 showed "Delivered" ~10s after sending, proving the relay accepted and
stored the blob (HTTP 201). But nothing ever arrived on the other device, in either direction.

- **Bug:** `RelayService.pollOnce()` interpolated the wire tag straight into the fetch URL
  (`/v1/fetch?tag=\(tag)`) with no percent-encoding. `Identity.hmac` returns **standard**-alphabet
  base64 (not URL-safe), so roughly half of all wire tags contain a `+`. A literal `+` in a query
  string is decoded back as a **space** by every standard query parser (the Node relay's
  included) — the application/x-www-form-urlencoded convention, not a relay bug. The corrupted tag
  then fails the relay's `TAG_RE` and returns 400, and `pollOnce`'s `statusCode == 200` guard
  silently `continue`d past it. Sending was unaffected because `POST /v1/relay` carries the tag in
  the JSON **body**, never in a URL — which is exactly why "Delivered" worked while receiving
  never did, in both directions, for a pair whose tag contains a `+`.
- **Fix:** percent-encode the tag before putting it in the URL. Note `.urlQueryAllowed` would NOT
  work — it deliberately permits `+`, the one character causing the corruption; `.alphanumerics`
  encodes `+`, `/` and `=` alike, which is what a base64 tag needs.
- **This is a known bug the Android client already hit and fixed** — `RelayClient.kt`'s
  `URLEncoder.encode(wireTag, "UTF-8")` carries a long comment describing the identical failure
  ("silently returned an empty list for roughly half of all wire tags"). The iOS port never
  picked that fix up. Also added diagnostic logging to `pollOnce` (non-200 responses, blob counts,
  ingest results) so a future receive-side failure isn't silent again.
- **Not yet verified:** this fix has not yet been tested on real hardware.

## 2026‑08‑29 · Fix: iOS relay calls used the wrong onion port (8787 instead of 80) — messages never sent or received

**What happened**

Two real iPhones, both showing "Tor connected", successfully mutual-QR-paired, then a test
message stayed stuck without ever sending or being received on the other side — a completely
symmetric failure (both push and poll silently failed) even though the underlying Tor
connectivity itself was already fully confirmed working (see this session's earlier nine Tor
bug fixes).

- **Bug:** `RelayService.swift`'s `splitHostPort()` defaulted a bare `.onion` address (the normal
  case — a relay connection string carries no explicit port) to port **8787**, which is
  `server/src/config.ts`'s `PORT` — the *local* `127.0.0.1` port the relay's Express app listens
  on inside the machine running it, never exposed to the outside. The hidden service's actual
  *virtual* port, the only one a Tor client can ever reach, is fixed at **80** by every relay
  torrc builder (`HiddenServicePort 80 127.0.0.1:<localPort>`) — confirmed against the
  already-working Android client's own `RelayClient.kt` (`RELAY_PORT = 80`, same reasoning
  documented there). Every relay call (`POST /v1/relay` to send, `GET /v1/fetch` to poll) tried
  to reach `<onion>:8787`, which the hidden service was never told to expose, so the SOCKS
  CONNECT failed outright on both ends — silently, since `attemptDelivery`/`pollOnce` both just
  `continue` past an unreachable candidate.
- **Fix:** default to port 80 instead, matching the Android client and every relay torrc.
- **Not yet verified:** this fix has not yet been tested on real hardware.

## 2026‑08‑29 · Verified: macOS relay runs end-to-end on real Apple Silicon hardware

After the three fixes below (npm cache permissions were the user's own environment, not a code
bug; then the two code-signing fixes), `start-mac.command` was run for real on an Apple Silicon
MacBook Pro: `npm install`/build succeeded, Tor bootstrapped 0% → 100%, the hidden service
published (`7vhbiq2djgwtkck52phc3bt3hwrldiwufjhakxmu27fogpwkbhsakkad.onion` in this run), and the
QR code + connection string printed correctly. The recursive code-signing fix also picked up
`pluggable_transports/lyrebird` and `conjure-client` automatically, confirming it generalizes
beyond just `tor` + `libevent`. This closes out the macOS relay deployment as genuinely working,
not just compiled/tested-in-isolation. **Not yet verified**: an iPhone actually pushing/fetching
a message through this relay — the natural next test.

## 2026‑08‑29 · Fix: macOS relay's Tor still failed after signing only `tor` itself (dylib needs signing too)

**What happened**

The previous fix (ad-hoc signing `tor`) was tested on real Apple Silicon hardware: the SIGKILL
was gone, but Tor now failed one step later with `dyld[...]: Library not loaded:
@executable_path/libevent-2.1.7.dylib ... missing code signature`, exiting with `signal SIGABRT`.

- **Bug:** dyld enforces the same "must have a code signature" requirement on every `.dylib` a
  signed binary loads, not just the binary itself. Signing only `tor` left
  `libevent-2.1.7.dylib` (loaded via `@executable_path`) unsigned, so dyld refused to load it.
- **Fix:** replaced the single-file `codesign` call with `adHocSignAllMachOFiles()` in
  `torDownload.ts`, which recursively ad-hoc-signs every `.dylib` and every executable file under
  the extracted `mac/tor/` directory — covers `tor`, `libevent-2.1.7.dylib`, and any
  pluggable-transport binaries the bundle may carry under a subdirectory. Updated
  `mac/README.md`'s troubleshooting section with the equivalent one-off manual `find` +
  `codesign` command for anyone hitting this on an already-downloaded copy.
- **Verified:** full test suite still passes (41/41). Not yet re-tested on real hardware whether
  Tor now actually starts and publishes a hidden service with this fix in place — the manual
  `find`+`codesign` workaround was given to the user to try immediately, in parallel.

## 2026‑08‑29 · Fix: macOS relay's downloaded Tor binary killed by the kernel (unsigned, Apple Silicon)

**What happened**

On a real Apple Silicon Mac, `start-mac.command` downloaded and extracted the Tor Expert Bundle
successfully, but starting Tor failed immediately: `tor process exited (signal SIGKILL) before
publishing a hostname`, with zero Tor log output beforehand — a dead giveaway of a kernel-level
kill (`SIGKILL` can't be caught or logged around), not Tor itself choosing to exit.

- **Bug:** the freshly-downloaded `tor` binary has no code signature at all. macOS's kernel
  (AMFI) refuses to run any unsigned binary on Apple Silicon, killing it before it executes a
  single instruction — which is exactly why no Tor log line ever appeared.
- **Fix:** `torDownload.ts`'s shared `ensureTorBinaryGeneric()` now ad-hoc code-signs the binary
  on macOS right after extraction (`codesign --sign - --force`) — no real Developer ID needed,
  just *a* signature, which is all AMFI actually checks for here. No-op on Windows/Linux. Also
  documented the one-off manual fix (same `codesign` command) in `mac/README.md`'s
  troubleshooting section for anyone hitting this from an already-downloaded binary.
- **Verified:** full test suite still passes (41/41). The actual `codesign`+launch has not been
  re-tested on real hardware yet after this fix — the manual workaround was confirmed effective
  first (unblocking the user immediately), and this code fix mechanizes the exact same command.

## 2026‑08‑29 · Delivery: iOS Tor background-reconnect fix + macOS relay deployment

**What was done**
- Packaged as one ZIP: the iOS `TorController.swift` fix for the ninth real Tor
  bug found this session, and the new macOS relay deployment
  (`server/mac/`, `start-mac.command`). See the two detailed entries
  immediately below for the full root-cause writeups and verification notes.

**Bug / cause**
- See "Fix: iOS Tor died on every background/foreground cycle" and
  "Add: macOS relay deployment" below — both found and fixed earlier in this
  same session.

**Fix**
- See the two entries below.

**How to apply**
- iOS: rebuild `UnpruufApp` from this ZIP's `ios/` folder on both iPhones —
  the fix is a two-line change in `TorController.swift`'s `stop()` (remove
  the `controller?.disconnect()` call).
- macOS: extract the ZIP, go into `unpruuf/server/`, double-click
  `start-mac.command` (see `unpruuf/server/mac/README.md` for the one-time
  Gatekeeper "unidentified developer" approval an unsigned script needs).

## 2026‑08‑29 · Fix: iOS Tor died on every background/foreground cycle (disconnect() sent SIGNAL SHUTDOWN)

**What happened**

Even after the eighth fix (duplicate `reconnectController()` guard), backgrounding the app and
reopening it reliably got stuck on "Connecting to Tor…" for the full ~20s retry budget and then
gave up, every single time — while a full app relaunch connected fine every time. Confirmed on
real hardware across four consecutive test cycles.

- **Bug:** `TorController.swift`'s `stop()` called `controller?.disconnect()` on every background
  transition. Read `iCepa/Tor.framework`'s own `TORController.m` source directly (not guessed) to
  find out what that actually does: `-disconnect` sends Tor's own control-protocol `SIGNAL
  SHUTDOWN` command (`sendCommand:TORCommandSignalShutdown`) *before* closing the local socket.
  `SIGNAL SHUTDOWN` tells the real Tor **daemon** to shut down — not just this app's connection to
  it. So every single background/foreground cycle was silently killing the actual Tor process,
  while the `TORThread` Swift wrapper object itself (per the second real-bug fix) survived
  untouched, giving the false impression the engine was still running. The next
  `reconnectController()` then spent its whole retry budget trying to reach a control socket
  nothing was listening on anymore, then gave up with no visible error — exactly matching the
  reported symptom, including the ~20s stall matching the retry budget almost exactly.
- **Fix:** stop calling `disconnect()` at all. Dropping the `controller` reference lets ARC
  deallocate it via `TORController`'s own `-dealloc`, which (confirmed via the same source read)
  only closes the local dispatch I/O channel (`dispatch_io_close(_channel, DISPATCH_IO_STOP)`) —
  no command is sent to Tor, which sees an ordinary client disconnect and is unaffected. This is
  the behavior `stop()` was always supposed to have, per the "engine persists for the process's
  life" design from the second real-bug fix.
- **Not yet verified:** this fix has not yet been tested on real hardware.
- **Separately flagged, not yet investigated:** the same test round that found this bug also hit
  a stuck "Sending…" when actually sending a message through a configured relay, with Tor still
  showing connected — likely a distinct bug in the relay/message-send path, to be investigated
  once this Tor-connectivity fix is confirmed working.

## 2026‑08‑29 · Add: macOS relay deployment (`server/mac/`, `start-mac.command`)

**What was done**

`unpruuf/server/` (the Node relay) already ran on Windows (`start-windows.bat`) and Docker/Linux,
but had no non-Docker macOS path. Added one, mirroring the Windows deployment shape:

- `src/mac-start.ts` — macOS entrypoint (same shape as `windows-start.ts`): manages its own Tor
  child process, prints the QR code / connection string, same `--ttl` / `--regenerate` /
  `--tor-exe` flags.
- `src/macTor.ts` — locates the `tor` binary: explicit override → `TOR_EXE_PATH` env var →
  bundled `mac/tor/tor` → bare `tor` on PATH (covers a Homebrew install, `brew install tor`).
- `src/torDownload.ts` — added `ensureTorBinaryMac()`, arch-aware (Apple Silicon `aarch64` vs.
  Intel `x86_64`) download of the official Tor Project Expert Bundle for macOS, reusing the same
  download/extract pipeline the Windows path already had (refactored into one shared
  `ensureTorBinaryGeneric()` instead of duplicating it).
- `start-mac.command` — double-click launcher (Terminal script); `mac/README.md` documents the
  one-time Gatekeeper "unidentified developer" approval an unsigned script needs on macOS.
- Refactored `windowsTor.ts`'s platform-agnostic half (`buildTorrc`, `startTor`,
  `waitForHostname`) out into `torProcess.ts`, shared by both `windowsTor.ts` and `macTor.ts`, so
  the two platforms' Tor-process logic can't drift apart — `windowsTor.ts`'s existing exports and
  its test file are unchanged from the caller's point of view.
- New `macTor.test.ts` (covers `resolveTorExePath`'s override/env/fallback resolution order —
  the shared `torProcess.ts` logic is already covered by the existing `windowsTor.test.ts`, so
  it isn't duplicated here).

**Verified**

- Full test suite passes (41/41, including the 3 new macTor tests) with a clean
  `npm install && npm test` in this environment.
- The macOS Tor Expert Bundle download+extract was run for real against the actual Tor Project
  archive (both the `x86_64` and `aarch64` URLs return `200 OK`; the `x86_64` one was actually
  downloaded and extracted end-to-end): the resulting `tor` binary is confirmed a genuine
  `Mach-O 64-bit x86_64 executable` (via `file`), mode `0755`.

**Not yet verified:** actually running `start-mac.command` end-to-end on a real Mac (this
environment is Linux) — starting Tor, publishing a hidden service, and serving real relay
traffic through it. The one part that's genuinely platform-specific and untested is whether the
downloaded `tor` binary actually launches and behaves correctly on macOS; everything else
(the build, the download pipeline, the shared Tor-process logic) is the same
already-working/tested code the Windows path runs.

## 2026‑08‑29 · Fix: iOS app stuck at "Connecting to Tor" forever (empty control-port cookie)

**What happened**

On real hardware, `Settings` kept showing "Connecting to Tor…" indefinitely, even on runs where
the Tor process itself logged `Bootstrapped 100% (done): Done`. Confirmed as a real code bug,
not a network/device issue.

- **Bug:** `ios/UnpruufApp/Sources/Services/TorController.swift`'s `connectAndAuthenticate()`
  called `controller.authenticate(with: Data())` — an empty cookie — despite
  `config.cookieAuthentication = true`. Cookie authentication requires the actual bytes Tor
  writes to `control_auth_cookie` in its data directory; an empty (or any wrong) cookie makes
  `authenticate` fail every single time. The failure callback returned silently with no retry
  and no surfaced error, so `pollBootstrap()` — the only code path that ever sets
  `isReady = true` — was never reached. From the UI this reads exactly like "stuck connecting
  to Tor forever," even though Tor's own bootstrap has nothing to do with it.
- **Fix:** read `control_auth_cookie` from the same data directory Tor was configured with and
  pass its real contents to `authenticate(with:)`. Added a bounded retry (now 40 × 0.5s = 20s
  total, up from a 20-attempt/10s budget that only covered the connect step) covering the
  connect step, the cookie file not existing yet, and an authenticate failure — instead of
  silently giving up after the first case.
- **Not yet verified:** this fix has not yet been run on real hardware (no Mac/Xcode available
  in this environment) — needs a real build to confirm the status flips to "Tor connected."

## 2026‑08‑29 · Fix: iOS crash "There can only be one TORThread per process" on background/reopen

**What happened**

The cookie fix above got tested on real hardware: Tor bootstrapped, but after backgrounding
the app and reopening it, the app crashed with `NSInternalInconsistencyException: There can
only be one TORThread per process`, then hung on the PIN screen on the next relaunch (Tor's
data directory was left in an inconsistent state by the abrupt kill).

- **Bug:** `Tor.framework`'s `TORThread` asserts `_thread == nil` in its own
  `-initWithArguments:` — Tor's underlying engine can only ever be instantiated **once per
  process, for that process's entire lifetime**. `TorController.swift`'s original design
  (`stop()` calling `thread?.cancel(); thread = nil`, `start()` creating a brand new
  `Tor.TorThread(...)` every time) directly violates that: the first `start()` after app
  launch works fine, but the first background→foreground cycle tries to create a *second*
  `TORThread` in the same process and crashes immediately.
- **Fix:** split "the Tor engine" from "the control connection" (`ios/UnpruufApp/Sources/
  Services/TorController.swift`). `Tor.TorThread` is now created exactly once per process and
  never cancelled again. `start()`/`stop()` only tear down and rebuild the `Tor.TorController`
  control-socket connection (a new `reconnectController()` helper) — Tor.framework does support
  reconnecting that freely, it's only the engine object itself that's a one-shot.
- **Not yet verified:** needs a real-hardware run through a full background→foreground cycle to
  confirm the crash is actually gone and the status correctly flips to "Tor connected" both on
  first launch and after reopening.

## 2026‑08‑29 · Fix: iOS Tor control connection never had anything to connect to

**What happened**

With both fixes above applied and diagnostic logging added, a real-device run showed the crash
was gone (confirmed) but the status was still stuck. The new logs made the cause unambiguous:
`controller.connect()` failed on every single attempt (40/40) with POSIX `ENOENT` ("No such
file or directory"), for the entire 20-second retry budget — and Tor's own log never once
mentioned opening a control port or control socket, only the SOCKS listener.

- **Bug:** `TorController.swift` built a `TORController(socketURL:)` pointing at a guessed path
  (`<dataDirectory>/control_port`), but never told `TORConfiguration` to actually make Tor
  create a socket there. Fetched the real `TORConfiguration.h` from `iCepa/Tor.framework` on
  GitHub to check rather than guess again: it exposes a settable `controlSocket: NSURL?`
  property (never set in our code) and a readonly `cookie: NSData?` that the framework
  generates itself once cookie auth is configured. Without `controlSocket` set, Tor was never
  asked to listen anywhere — the path we were polling for could never appear, no matter how
  long we waited.
- **Fix:** set `config.controlSocket` to the same URL passed to `TORController`, and switched
  from manually reading `control_auth_cookie` off disk to `TORConfiguration`'s own `cookie`
  property, captured once in `start()` — removes a second, redundant way to get the cookie
  wrong.
- **Not yet verified:** this is the third fix in the same debugging session against the same
  real device; needs a fresh run to confirm `connect()` now succeeds and the status reaches
  "Tor connected."

## 2026‑08‑29 · Fix: iOS control socket path too long for AF_UNIX on Darwin

**What happened**

The `controlSocket` fix above got tested and Tor's own log finally gave the real, unambiguous
reason `connect()` was still failing every attempt:

```
[warn] Unix socket path '".../Library/Caches/tor/control_port"' is too long to fit.
[warn] Failed to parse/validate config: Failed to bind one of the listener ports.
[err] Reading config failed--see warnings above.
```

- **Bug:** AF_UNIX socket paths are capped at ~104 bytes (`sockaddr_un.sun_path`) on Darwin. An
  iOS sandbox container path alone (`/var/mobile/Containers/Data/Application/<36-char-UUID>/`)
  already accounts for ~78 of those bytes before any app-chosen subpath. This file's original
  `<Caches>/tor/control_port` came to 110 bytes total — over the limit before our own filename
  even started, so Tor could never bind a listener there no matter how long the app waited.
- **Fix:** the length limit only applies to the socket file itself, not regular files, so only
  the control socket moved — to `FileManager.default.temporaryDirectory` with a 2-character
  filename (`tc`) — while `dataDirectory` (holding everything else Tor needs: descriptors, the
  auth cookie internals, etc.) stays exactly where it was.
- **Not yet verified:** this is the fourth fix in the same real-device debugging session; needs
  a fresh run to confirm `connect()` finally succeeds end to end.

## 2026‑08‑29 · Fix: iOS Tor rejected the control socket's directory as "too permissive"

**What happened**

The socket-path-length fix above got tested. The path length problem was gone, but Tor's log
gave the next real blocker:

```
[warn] Permissions on directory .../tmp are too permissive.
[warn] Before Tor can create a control socket in ".../tmp/tc", the directory ".../tmp" needs to
exist, and to be accessible only by the user account that is running Tor.
```

- **Bug:** Tor refuses to place a control socket in a directory unless that directory is private
  to the current user (mode `0700`) — a security check ("anybody who can list a socket can
  connect to it"). iOS's shared per-app `tmp` root doesn't meet that, so binding failed exactly
  the same way as the previous two bugs (silently, forever, no matter how long the app waited).
- **Fix:** create a dedicated one-character subdirectory under `tmp` with explicit `0700`
  permissions set both at creation and via a follow-up `setAttributes` call, and put the socket
  there instead of directly in `tmp`. Added a log line printing the resulting directory's actual
  POSIX permissions for the next verification pass.
- **Not yet verified:** this is the fifth fix in the same real-device debugging session against
  the same physical iPhone; needs a fresh run to confirm `connect()` finally succeeds.

## 2026‑08‑29 · Fix: iOS Tor authentication used a cookie that didn't match Tor's own

**What happened**

`connect()` finally succeeded for the first time — Tor's own log showed `Opening Control
listener` / `Opened Control listener connection (ready)`, real progress after five fixes. But
`authenticate` then failed, and Tor's log was explicit about why: `Got mismatched
authentication cookie`.

- **Bug:** the third 2026‑08‑29 fix (control socket) had also switched cookie retrieval from
  reading the real `control_auth_cookie` file to `TORConfiguration.cookie`, a readonly property
  read once right after creating the configuration, before the Tor thread even started. That
  value does not reliably match the cookie the Tor *process* actually ends up using once it
  runs — hence "mismatched authentication cookie" on every attempt.
- **Fix:** reverted to reading the real `control_auth_cookie` file from `dataDirectory` — the
  same approach as the very first 2026‑08‑29 fix — but now reading it only *after* `connect()`
  succeeds, which is proof Tor has actually been running long enough for the file to exist
  (unlike the first attempt, which never got that far because of the socket bugs found since).
- **Verified 2026‑08‑29, real hardware:** `authenticate` succeeded, `pollBootstrap` tracked
  Tor's real bootstrap percentages, and Settings' Status field genuinely flipped to "Tor
  connected" — the first time this has ever been confirmed end to end, closing out a six-bug
  debugging arc against the same physical iPhone in one session (empty cookie → TORThread
  singleton crash → missing control socket → socket path too long → socket directory
  permissions → wrong cookie source).

**Bonus cleanup found in the same log:** `env.start()` was being called from two places
(`UnpruufApp.swift`'s scenePhase handler *and* `ContactListView.swift`'s `.task`), causing a
harmless but wasteful second `reconnectController()` attempt on every launch that spent its
full 20-second retry budget failing before giving up — the already-successful `isReady`/
`socksPort` state was never affected, but it wastes time and floods the console. Removed the
redundant call in `ContactListView.swift`; the scenePhase-driven call in `UnpruufApp.swift`
already covers app launch (SwiftUI's `scenePhase` always transitions to `.active` shortly after
launch) and foreground/background cycles.

## 2026‑08‑29 · Fix: iOS reopening (without reinstalling) got stuck on a stale control socket

**What happened**

After the six-bug arc above got "Tor connected" fully verified, a new, precisely reproducible
symptom showed up: a fresh install connects immediately, but simply reopening that same install
(no reinstall) gets stuck on "Connecting to Tor…" forever.

- **Bug:** `tmp` is not wiped when the app relaunches — only RAM/messages are, per this app's
  foreground-scoped design. The control-socket special file `TorController.swift` creates at a
  fixed path (`tmp/t/c`) from the *previous* run's Tor process can still be sitting there when a
  *new* run's Tor tries to bind at the exact same path. A fresh install never hits this because
  its `tmp` starts empty; every subsequent reopen without reinstalling can.
- **Fix:** unlink any file already present at `controlSocketURL` before Tor is configured, on
  every `start()`. Added a log line reporting whether a stale file was actually found and
  removed, for the next verification pass.
- **Not yet verified:** needs a real-hardware test that specifically reopens (not reinstalls)
  the app to confirm this was the actual cause.

## 2026‑08‑29 · Fix: iOS second scenePhase-triggered reconnect competed with a working connection

**What happened**

Testing the stale-socket fix produced a log where the *first* connection attempt actually
succeeded (`authenticate callback: success=true`) — but a second `reconnectController()` fired
moments later and spent its whole retry budget failing with `nilError`. This didn't crash
anything (removing the earlier `ContactListView.swift` duplicate `.task { env.start() }` call
was still correct and necessary), but it's wasteful and confusing in the logs, and a genuinely
bad idea: it's a second live `TORController` competing against the same Tor engine as the first,
already-working one.

- **Bug:** SwiftUI's `scenePhase` can report `.active` more than once for a single foreground
  session without an intervening `.background` — a known, if surprising, platform behavior, not
  a bug in `UnpruufApp.swift`'s scenePhase handler itself. Every `.active` report calls
  `env.start()`, and since `thread != nil` by then, each one calls `reconnectController()`,
  which unconditionally built a brand new `Tor.TorController`.
- **Fix:** `reconnectController()` now no-ops if `self.controller` is already set, logging that
  it skipped a duplicate call. Only `stop()` (a real backgrounding) clears `controller`, so a
  genuine reconnect still happens when it should.
- **Separately, in the same log:** Tor's own bootstrap stalled at 67% (`loading_descriptors`)
  for the rest of the test — a real Tor networking condition (unloaded relay descriptors),
  unrelated to any bug in this file. `pollBootstrap` has no timeout and keeps polling every
  second indefinitely, so this should resolve on its own if the network catches up; not
  something to "fix" in code.
- **Not yet verified:** needs a fresh real-hardware run to confirm only one
  `reconnectController()` call happens per foreground session now.

## 2026‑08‑27 · Fix: app stuck at "Connecting to Tor" after updating (regression from the Android key-encryption fix)

**What happened**

A user reported the app no longer connects to Tor after updating — stuck indefinitely on
"Connecting to Tor". Root cause: a regression introduced by the earlier same-day fix that
encrypts identity keys at rest (`IdentityManager.kt`).

- **Bug:** `decryptSecret()` called `Base64.decode(stored, ...)` before its try/catch. For
  `x25519_ratchet_priv_key` and `msg_key`, the pre-fix plaintext values already happened to be
  Base64, so this worked. But `tor_priv_key` and the per-contact onion keys were never Base64 —
  `TorManager.setupHiddenService()` stores Tor's own ADD_ONION reply verbatim, in the format
  `"ED25519-V3:<...>"`, and `:` isn't a valid Base64 character. On any device upgrading from
  before the encryption fix, reading back that stored key threw `IllegalArgumentException`
  *outside* the try/catch — an exception that propagated out of `getTorPrivKey()` into
  `TorManager`'s `runCatching { setupHiddenService() }`, which swallowed it silently. The
  hidden service was therefore never (re-)published after updating, while Tor itself kept
  bootstrapping normally — which is exactly what "stuck at Connecting to Tor" looks like from
  the outside: the app has no way to tell the user the *onion* setup step, not Tor itself,
  is what's failing.
- **Fix:** the `Base64.decode` call is now inside the same try/catch as the AEAD decrypt. A
  value that isn't Base64 at all (legacy `tor_priv_key`/contact-onion plaintext) now falls
  back to being treated as raw UTF-8 text, exactly recovering the original stored string, the
  same way a value that IS Base64 but isn't AEAD ciphertext (legacy ratchet key/msg_key) already
  fell back to its decoded bytes. Fresh installs and already-migrated devices are unaffected —
  this only changes behavior for the one previously-crashing case.

## 2026‑08‑27 · Security review of relay-android + license-tool/relaypool-tool: edition-bypass and relay DoS fixed

**What happened**

A targeted security review of `relay-android/` (the standalone optional-relay app) and the
offline `license-tool/`/`relaypool-tool/` keygen/issue/verify scripts found and fixed two
issues; everything else in scope — including the Ed25519 signing/verification in both tools,
the relay's auth gate, its blindness to message content, path-traversal safety of its
tag-keyed blob storage, and `RootDetector` gating — checked out clean.

- **Bug: a Standard license unlocked the Pro build (and vice versa).**
  `LicenseManager.parseAndVerify()` checked that a license's signature was genuine and that its
  `edition` field was one of the three known values, but never compared that field against the
  edition actually running (`AppEdition.current`) — even though `license-tool/issue.js`'s own
  `--edition` flag documentation states LicenseManager "checks and rejects a mismatch." It
  didn't. A customer who legitimately bought a cheaper Standard license (€14.99/mo) could
  activate it in the Pro build (€49/mo, per `EDITIONS.md`'s pricing) and it would verify fine —
  no signature forgery needed, just installing the other edition's APK. **Fix:** reject unless
  `edition == AppEdition.current`, in `LicenseManager.kt`.
- **Bug: the relay had no cap on total distinct wire tags, and buffered a request body before
  checking its size.** `BlobStore` capped blobs *per tag* (1500, ≈6 MB) but nothing capped how
  many distinct tags existed — anyone holding the relay's shared bearer token (any paired
  contact, or the token if it later leaks) could push unlimited distinct tags and grow the
  on-disk queue without bound. Separately, `RelayHttpServer.handleRelay()` called NanoHTTPD's
  `parseBody()` — which has no size cap of its own — before checking the decoded blob's size,
  so an authenticated caller could send an oversized POST body to pressure memory ahead of that
  check ever running. **Fix:** added a global `MAX_TOTAL_BLOBS` cap (50,000 ≈ 200 MB) in
  `BlobStore.put()`, and a `Content-Length`-based `MAX_RELAY_REQUEST_BYTES` (8192) check in
  `RelayHttpServer.handleRelay()` before the body is read. Note: the reference Node relay
  (`unpruuf/server/src/store/blobStore.ts`) has the identical missing-global-cap gap and was
  *not* fixed here — this review's scope was `relay-android/` and the tools only.

## 2026‑08‑27 · Security review of `domain/network/`: Android key storage + four P2P bugs fixed

**What happened**

A targeted security review of `IdentityManager.kt` and `P2PNetworkManager.kt` (see PR #3)
found and fixed five issues before they shipped:

- **Bug: Android stored private key material in plaintext.** The ratchet identity private
  key, Tor hidden-service private keys, per-contact onion private keys, and our
  message-decryption key were written to plain `SharedPreferences` — readable via root or
  an `adb backup`. iOS already used the hardware-backed Keychain for the equivalent values.
  **Fix:** these are now encrypted at rest with the app's existing `CryptoManager` (Tink,
  Android Keystore-backed AEAD) before being persisted; a pre-existing plaintext value is
  adopted once and immediately re-persisted encrypted. See the updated row in
  `SECURITY_CLAIMS.md` § Tier 2.
- **Bug: `openTorSocket` leaked a socket/fd on every failed connect.** Hit constantly on
  mobile Tor (pooled sends, 20s keepalive, reachability probes) — leaked fds accumulate in
  a long-running foreground service. **Fix:** close the socket on the error path.
- **Bug: deleting a contact orphaned its queued deliveries.** A still-undelivered item (e.g.
  a mid-transfer image) stayed in the delivery queue forever once the contact row it needed
  for an onion address was gone — retried every backoff round with no path to succeed.
  **Fix:** purge the queue for that contact on delete, both the local and peer-initiated path.
- **Bug: unauthenticated incoming connections were unbounded.** Anyone who had learned our
  onion address — not just paired contacts — could open unlimited concurrent connections
  and hold them open, exhausting the fd budget shared with our own outgoing Tor sockets.
  **Fix:** cap concurrent accepted connections with a semaphore (64); excess connections are
  closed immediately.
- **Bug: a race in the lost-ACK packet dedup could corrupt chunk reassembly.** The same
  retried packet can legitimately arrive concurrently via direct delivery and the relay
  poll; the dedup check-then-insert left a window where both paths could pass the "not yet
  seen" check and race on the chunk-reassembly state. **Fix:** reserve the packet hash
  before processing, not after.

## 2026‑08‑27 · First real run — Tor bootstraps to 100% in the iOS Simulator

**What happened**

Following the first successful build (see the entry below), the app was actually launched — not
just compiled — on the iPhone 17 Simulator. Real, runtime-observed results:

- **PIN setup screen** appeared correctly on first launch (mandatory, as designed), completed
  without incident, navigated into the main app.
- **No crash.** The full app — Tor, Settings, the newer relay-pool UI from 2026‑08‑25 ("Backup
  relay", "Company relay list: No company relay list imported") — all rendered correctly.
- **Tor genuinely bootstrapped to 100%**, observed directly in Tor's own log output inside the app
  process:
  ```
  Bootstrapped 0% (starting): Starting
  Bootstrapped 5% (conn): Connecting to a relay
  ...
  Bootstrapped 75% (enough_dirinfo): Loaded enough directory info to build circuits
  Bootstrapped 90% (ap_handshake_done): Handshake finished with a relay to build circuits
  Bootstrapped 95% (circuit_create): Establishing a Tor circuit
  Bootstrapped 100% (done): Done
  ```
  Later, in response to a simulated network change, Tor reacted live: `Our IP address has changed.
  Rotating keys...` — confirming the integration isn't just a one-shot startup call but a real,
  reactive Tor process running inside the app.

This is the actual, no-longer-theoretical answer to `TorController.swift`'s own doc comment, which
has called this file "the single highest-risk file in this delivery" since the day it was written.
It no longer is.

**Log noise seen alongside this that is NOT a bug** (standard iOS Simulator artifacts, present in
essentially any app that shows a keyboard in the Simulator): `CHHapticPattern` "no such file"
errors (the Simulator has no real haptic hardware), `UIRemoteKeyboardPlaceholderView` Auto Layout
constraint conflicts (Apple's own system keyboard, internal to UIKit), a duplicate
`UIAccessibilityLoaderWebShared` class warning (WebKit/WebCore accessibility bundles), and failed
"CA Event" analytics telemetry calls. None of these come from this project's code.

**Still not verified**: an actual SOCKS-proxied connection carrying real app traffic (relay
push/poll, QR pairing, message delivery) — that needs a running relay server (`unpruuf/server/`)
configured in Settings → "My relay", which hasn't happened yet, plus a real device for the
camera-based QR scanner (unavailable in the Simulator). See `STATUS.md` §11 for the updated
per-feature status.

---

## 2026‑08‑26 · First successful full `UnpruufApp` build — 13 real bugs found and fixed

**What happened**

Continuing the same day's real-hardware push: after `Tor.framework` was confirmed to link (see
the entry below) and the app's own source (`UnpruufApp/Sources/`) was dropped into the Xcode
project, a real, multi-round debugging pass against actual compiler errors ended in:

```
Build Succeeded
```

— the first time the complete `UnpruufApp` target (every Service, ViewModel, View, plus
`Tor.framework`/`CryptoSwift`/the local `UnpruufCore` package) has ever compiled and linked
together as one app. Only 61 warnings remain, all non-blocking (see below).

**Every real bug found, in the order the compiler surfaced them:**

1. **Two Xcode-template duplicates**: a fresh Xcode project generates its own `UnpruufAppApp.swift`
   (with `@main`) and `ContentView.swift` — both collide with/are unused by this project's own
   `UnpruufApp.swift` (`@main struct UnpruufApp`) and `RootView`. Deleted both.
2. **Missing `import Combine`** in 7 files that use `ObservableObject`/`@Published` without also
   importing `SwiftUI` (which would otherwise re-export it): `AppEnvironment.swift`,
   `RelayPoolManager.swift`, `RelayService.swift`, `ContactDetailViewModel.swift`,
   `ContactListViewModel.swift`, `LockViewModel.swift`, `PairingViewModel.swift`.
3. **Missing `import UnpruufCore`** in 2 files that call into it without importing it:
   `ContactDetailViewModel.swift` (`Identity.safetyNumber(...)`), `SettingsView.swift` (relay-pool
   manifest/pairing types).
4. **Missing `import Vision`** in `QRScannerView.swift` — uses `Vision`-framework barcode-symbology
   types via `VisionKit`, but only imported the latter.
5. **`AppEnvironment.swift` double-initialized `keychain`**: `let keychain = KeychainStore()` at
   the property declaration already initializes it, so `init()`'s `self.keychain = keychain`
   re-assignment is invalid Swift ("immutable value may only be initialized once"). Fixed by
   declaring the property without an inline default, leaving `init()` as the single place that
   creates and shares one `KeychainStore` instance.
6. **`RelayPoolManifest.Info` (in `UnpruufCore`) had no public initializer**: Swift never
   synthesizes a `public` memberwise initializer even when every field is `public` — the
   synthesized one stays `internal`, making `Info(...)` inaccessible from `UnpruufApp` (a separate
   module) despite the type and its fields being public. Added an explicit
   `public init(org:issuedAtMs:relays:)`.
7. **`Tor.framework` 409.11.2 renamed all three of its Objective-C classes**, dropping the
   all-caps `TOR` prefix: `TORThread`→`TorThread`, `TORController`→`TorController`,
   `TORConfiguration`→`TorConfiguration`. The renamed `TorController` collides with
   `TorController.swift`'s own wrapper class of the same name — fixed by module-qualifying every
   reference to the framework's `TorThread`/`TorController` (`Tor.TorThread`, `Tor.TorController`);
   `TorConfiguration` needed only the plain rename (no collision). This is the single highest-value
   find of the day — the exact risk `TorController.swift`'s own doc comment had flagged as
   "highest risk, unverified" since the file was first written.
8. **Two apparent errors that were actually a stale Xcode module cache, not code bugs**:
   `AppLockManager.swift`/`KeychainStore.swift` kept showing "missing import of defining module
   'Combine'" even after every real import was confirmed present — resolved by Clean Build Folder
   (⇧⌘K), not a code change. A reminder that not every red error in the issue navigator is a real
   bug once bigger changes (like adding CocoaPods) have happened mid-session.

**Two unrelated tooling gotchas hit along the way** (not code bugs): `xcode-select` pointed at the
standalone Command Line Tools instead of a full Xcode.app install (blocks `swift test`, needs
`XCTest.framework`); Xcode's "User Script Sandboxing" (on by default since Xcode 15) blocked
CocoaPods' framework-embed script (`Sandbox: rsync deny(1) file-write-create ...`) until disabled
at both the PROJECT and TARGET level.

**Remaining 61 warnings, all confirmed non-blocking**: the vendored `Tor`/libevent C sources' own
old-style K&R parameter declarations (pre-existing in the library, not this project's code), a
handful of `onChange(of:perform:)` iOS-17 deprecation notices, and Swift 6 `Sendable`-concurrency
advisories on `TorController`.

**What this does and doesn't prove**: every file in the app now genuinely compiles and links
together — a large, real jump from "never checked by any compiler." It does **not** yet prove the
app runs correctly: it hasn't been launched on a device or simulator, so Tor actually bootstrapping,
QR pairing, and message delivery all remain unverified runtime behavior. See `STATUS.md` §11 for
the updated per-feature status.

---

## 2026‑08‑26 · Tor.framework confirmed real — first successful UnpruufApp build

**What happened**

Continuing the real-hardware verification from earlier today: Norbert got as far as adding
`Tor.framework` to a fresh `UnpruufApp` Xcode project (`ios/README.md` step 5, previously the
single highest-flagged risk in the whole iOS delivery — its distribution mechanism had never
been confirmed). It's now settled for real:

- **`iCepa/Tor.framework`** (the actual, current repo name), **CocoaPods-only** — no SPM support
  at all, contrary to what could have been guessed. `pod 'Tor', '~> 409'` resolves to a
  precompiled `.xcframework` (409.11.2), no build-from-source step.
- Its `TORThread`/`TORConfiguration`/`TORController` class names — the ones `TorController.swift`
  was written against — are confirmed to still be current.
- Build result: **Build Succeeded**, with 49 warnings, all inside `Tor.framework`'s own vendored
  C sources (`event.h`/libevent, old-style K&R parameter declarations) — pre-existing in the
  library, not this project's code, and not build-blocking.

**Two real gotchas hit and fixed along the way** (both environment/tooling, not code bugs):
1. `xcode-select` pointed at the standalone Command Line Tools instead of a full Xcode.app
   install — `swift test` needs `XCTest.framework`, which only ships with the latter.
2. Xcode's "User Script Sandboxing" (on by default since Xcode 15) blocked CocoaPods' framework-
   embed script with `Sandbox: rsync deny(1) file-write-create ...` — fixed by setting it to "No"
   at both the PROJECT and TARGET level, then a Clean Build Folder.

`ios/README.md` and `TorController.swift`'s own doc comment updated with the confirmed, exact
steps (see `STATUS.md` §11 for the per-feature status).

**Caveat, so this doesn't get overstated**: this build doesn't yet include the app's own source
(`UnpruufApp/Sources/`) — only the default Xcode template plus the linked frameworks/packages
(`UnpruufCore`, `CryptoSwift`, `Tor`). It proves the framework links; it does not yet prove
`TorController.swift`'s actual `TORThread`/`TORController` calls compile. That's the next
milestone once the real source is dropped into the project.

---

## 2026‑08‑26 · First real `swift test` run on actual hardware — 56/56 pass

**What happened**

`UnpruufCore` (the iOS crypto/protocol package) has been written since 2026‑08‑14 with a
standing caveat on nearly every line of documentation: no Mac/Xcode/Swift toolchain available in
the environment that wrote it, so nothing had ever actually been compiled, let alone tested. That
changed today — a real run on a real Mac:

```
Executed 56 tests, with 0 failures (0 unexpected) in 0.107 seconds
```

Every suite passed, including `DoubleRatchetTests` — the direct answer to the single
highest-flagged risk in the whole iOS delivery: whether CryptoSwift's `AEADXChaCha20Poly1305` API
actually matches what `DoubleRatchet.swift` assumed (see that file's own doc comment, unchanged
since it was written). It does. XChaCha20-Poly1305 encrypt/decrypt round-trips correctly, matching
the wire framing Tink produces on the Android side.

**Getting there**: the first attempt failed with `error: no such module 'XCTest'` in every test
file — not a code bug, but `xcode-select` pointing at the standalone Command Line Tools instead of
a full Xcode.app install (`XCTest.framework` only ships with the latter). Fixed by installing
Xcode from the App Store and `sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer`.

**Caveat, so this doesn't get overstated**: that run was against an older commit, predating
2026‑08‑25's relay-pool-redundancy work. `RelayPoolManifestTests.swift` (the CryptoKit Ed25519
verifier — the one piece of iOS crypto in this project that had *never* been checked by any
compiler at all) wasn't part of it, nor were the larger `PairingPayloadTests`/
`RelayConnectionStringTests` from that same session (56 tests ran; the current branch has 76).
Next step: check out `claude/unpruuf-app-e73i94` and re-run `swift test` to cover those too. See
`STATUS.md` §11 for the updated per-feature status.

---

## 2026‑08‑25 · Redundant relay addresses + company-managed relay list (iOS + Android)

**What was done**

Cross-platform (iOS-interop) pairing already lets every person publish their own relay
address(es) — there's never a requirement that two contacts share a common server. The real gap
was that `n` (the pairing QR's relay field) was exactly one connection string: if that one relay
went down, the person was unreachable until someone manually re-paired. There was also no way for
a company running its own relay(s) to hand employees a ready-made server list.

- **Bug fix, prerequisite**: `P2PNetworkManager.kt`'s Wechsel-signal decoder split the payload at
  the *last* colon instead of the *first* — a real relay connection string has several internal
  colons, so the split always grabbed the wrong substring, `toLongOrNull()` silently failed, and
  the whole branch no-opted. No test caught this. Fixed (`parseWechselSignal`), with a new
  regression test (`WechselDecodeTest.kt`) proving the old split would have failed on a real
  connection string. Needed first because this feature reuses the same Wechsel channel to
  announce updated relay info.
- **Wire format (v2)**: `n` is now up to 2 `;`-joined `unpruuf-relay:v1:...` connection strings
  instead of one (`PairingPayload.swift`, `CrossPlatformPairing.kt`). A v1 QR (single entry, no
  `;`) still parses fine — one entry is already a valid one-element list. See
  `CROSS_PLATFORM_PLAN.md`'s "Pairing QR format" section for the full spec.
- **Local relay pool**: Settings on both platforms gained an optional "Backup relay" field
  alongside the existing primary relay — `RelayManager.getMyRelayPool()` / `AppEnvironment.
  myRelayPool` compose the two (deduped, capped at 2) into what a new pairing QR advertises.
- **Contact storage — no schema break**: `Contact.myRelayConnectionString`/
  `theirRelayConnectionString` keep their exact names and types (`String?` on Android, `String`
  on iOS) but now hold a `;`-joined pool blob instead of one entry. A pre-existing single value is
  already a valid one-element list, so no Room migration was needed; iOS decodes old and new
  shapes via a manual `Codable` fallback (same pattern as `Contact.isVerified`'s existing
  handling).
- **Send/poll failover**: a relay fetch is delete-on-fetch, so the asymmetry matters — a *sender*
  tries its candidate relays in order and stops at the first success (`RelayService.
  attemptDelivery`, `P2PNetworkManager.attemptDelivery`/`attemptChunkTrainDelivery`), while a
  *receiver* must poll **every** configured address **every round**, since an incoming message
  could have landed on either one (`RelayService.pollOnce`, `P2PNetworkManager.pollRelayOnce`).
- **Signed company relay-pool manifest**: new `unpruuf/relaypool-tool/` (structural sibling of
  `license-tool/`, but a *separate* Ed25519 key pair — a leaked relay-pool key only lets someone
  hand out bogus relay addresses, never a license, and vice versa). Format
  `unpruuf-relaypool:v1:<base64url(payload)>:<base64url(signature)>`, payload
  `1|<org>|<issuedAtMs>|<relay1>;<relay2>;...`. Verified on Android by the new
  `domain/relay/RelayPoolManager.kt` (Tink `Ed25519Verify`) and on iOS by the new
  `UnpruufCore/RelayPoolManifest.swift` (CryptoKit `Curve25519.Signing` — the first Ed25519
  verifier in this project's iOS code) + `UnpruufApp/Services/RelayPoolManager.swift`. Import is
  deliberately unrestricted in v1 (no device binding, no new "enterprise account" concept) — any
  user holding the manifest text can import it in Settings → "Company relay list", and
  re-importing an updated manifest replaces the previous list wholesale. Settings on both
  platforms gained an import field for it.

**Verified for real in this sandbox** (no Mac/Xcode, no Android SDK/emulator available — see
`STATUS.md`): generated a real Ed25519 key pair with `relaypool-tool/keygen.js`, issued and
verified a real manifest with `issue.js`/`verify.js` (Node's own `crypto` module), then
independently re-verified that same Node-signed manifest against a compiled Java program calling
Tink's `Ed25519Verify` directly — confirming the exact byte-level logic `RelayPoolManager.kt`
uses. The CryptoKit (iOS) side of that cross-runtime check could not be run for real, no Swift
toolchain here — `RelayPoolManifestTests.swift` signs and verifies inline with CryptoKit's own
key pair instead, and was verified by manual review only. `RelayManagerListTest.kt` covers the
pool build/parse helpers with real JUnit-style assertions (also not executed — no Android SDK —
but reviewed against the exact `RelayManager.kt` logic it targets).

**Not built**: liveness checking or auto-reordering among a pool's entries — today's fallback
tries/polls the configured addresses in a fixed order every round, regardless of which one has
actually been reachable recently.

---

## 2026‑08‑24 · iOS security/feature parity pass (PIN, wipe-on-background, TTL, safety number, version)

**What was done**

An updated plan for `unpruuf/ios/` (still, as of this entry, never compiled or run — same
constraint the original delivery had) found the feature gap between iOS and Android had been
widening since the iOS shell landed: Android gained PIN/panic PIN, biometric unlock, wipe-on-
background, message TTL, safety-number verification, and app versioning, none of which had
reached iOS. This entry closes that gap for everything that's pure local-device behavior (no wire
format involved, so no interop risk from doing it now rather than after real-toolchain
verification):

- **Wipe-on-background + message TTL** (`AppEnvironment.swift`, `InMemoryMessageStore.swift`):
  `AppEnvironment.stop()` now wipes RAM messages on backgrounding — previously only stopped
  Tor/polling, so messages silently survived being backgrounded, contradicting the app's own
  RAM-only anti-forensics promise. `InMemoryMessageStore` gained the same 5-minute TTL + 15-second
  sweep loop Android's has (`MESSAGE_TTL_MS`/`SWEEP_INTERVAL_MS`), a `Task` loop mirroring
  Android's coroutine loop.
- **PIN + panic PIN** (new `Services/PinManager.swift`, `Services/AppLockManager.swift`,
  `ViewModels/LockViewModel.swift`, `Views/PinLockView.swift`, `Views/PinSetupView.swift`,
  `Views/RootView.swift`): salted-hash PIN storage (hand-rolled single-block PBKDF2-HMAC-SHA256
  via CryptoKit, 120,000 iterations — same iteration count as Android, doesn't need to byte-match
  since this hash is purely local, never on the wire), a lock screen shown until unlocked, and a
  setup screen shown until a PIN exists at all (mandatory, not opt-in-forever — matches Android).
  The panic PIN wipes contacts + messages (new `AppEnvironment.wipeContactsAndMessages()`) but
  deliberately leaves this device's own identity and the PIN itself untouched, so the device stays
  usable afterward — same as Android's `LockViewModel.wipeEverything()`. Along the way, fixed a
  misleading doc comment on the pre-existing `AppEnvironment.wipeAll()`, which actually goes
  further (wipes identity too) than what the Android panic path it claimed to mirror does.
- **Biometric unlock** (`PinLockView.swift`, `SettingsView.swift`): opt-in Face ID/Touch ID via
  `LocalAuthentication`, biometric-only (no device-passcode fallback, same reasoning as Android's
  `BiometricPrompt` config), can only stand in for the normal PIN, never the panic PIN.
- **Safety-number contact verification** (`Identity.swift`'s new `safetyNumber()`, `Contact.swift`'s
  new `isVerified` field, `ViewModels/ContactDetailViewModel.swift`, `Views/ContactDetailView.swift`):
  port of Android's most recent security feature — a 6-digit code derived from both devices'
  X25519 ratchet identity keys, meant to be compared over a different channel than the pairing
  QR/relay string. Particularly relevant for cross-platform (iOS↔Android) pairing specifically,
  since that's the least build-verified pairing path in the whole system. Reachable via a leading
  swipe action on any contact row in `ContactListView`. New XCTest coverage in
  `IdentityTests.swift` (symmetry, format, distinctness across different contacts) — written,
  same as the rest of `UnpruufCoreTests`, but not run (no Swift toolchain here).
- **App version display** (`Info.plist`'s new `CFBundleShortVersionString`/`CFBundleVersion`,
  shown in `SettingsView.swift`): mirrors Android's Settings → "App version" row. Keep
  `CFBundleShortVersionString` in step with Android's `versionName` ("1.01", "1.02", ...) on every
  delivery that touches either platform.
- **Housekeeping**: gave the iOS-delivery CHANGELOG entry above (previously missing its own
  dated header entirely, silently appended after the prior entry) a real header with a
  best-estimate date, clearly marked as an estimate rather than a confirmed one.

**Deliberately not done in this pass** (see the current iOS plan for reasoning): jailbreak
detection and a build-expiry gate (Phase iOS-8 — flagged as needing a product decision, not just
build work, since iOS's App Store distribution model changes what those gates would even be
defending against) and attachment send UI (Phase iOS-6 — the wire format already supports it, only
the picker/UI is missing; deferred for scope, not because it's risky).

**How to apply**
Cannot be built, run, or verified in this environment — no macOS/Xcode/Swift toolchain here, same
as every prior iOS delivery. First real verification needs an actual Mac: `swift test` inside
`UnpruufCore` (never run once, including the tests this entry adds), then a full Xcode build and
manual walkthrough of each new screen.

---

## 2026‑08‑23 (12) · In-app version display + versioning scheme + branding notes

**What was done**
- Added a **versioning scheme**: `1.01`, `1.02`, `1.03`, ... — requested so
  the user can always see which build they're running. `app/build.gradle.kts`
  bumped to `versionCode = 2` / `versionName = "1.01"` (this delivery).
  Documented in `STATUS.md`'s new "Versioning" section, and the `ship` skill
  now bumps both fields on every future delivery that touches `unpruuf/app/`
  — this isn't a one-off, it's part of the standing delivery checklist.
- Added a new **"App version"** row in Settings, right under "App edition",
  showing `BuildConfig.VERSION_NAME` (carries the per-edition suffix, e.g.
  `1.01-pro`).
- Confirmed with the user that the green "Compliance" tier in the new
  "Eclipse" logo mockup (see the previous entry's `BRANDING.md`) refers to
  **Case Vault**, not a 4th unpruuf edition — updated `BRANDING.md`.
- Per the user's explicit request, marked the launcher-icon replacement
  (the new logo mark, adaptive-icon squircle form) as **queued for the next
  app update** in `BRANDING.md` — not done in this delivery, since the exact
  per-edition color treatment (keep Standard/Pro/Client's distinct teal/
  gold/blue tint, or ship one black/white icon for all three) is still an
  open question to confirm before implementing.

**How to apply**
- Update the app; check Settings → App version shows `1.01`.

---

## 2026‑08‑23 (11) · Safety-number verification for remotely-paired contacts

**Why**
- Requested after the copy/paste debug pairing flow (entry (2026‑08‑21) in
  section 3 of `STATUS.md`) turned out to still have a gap: it lets testers
  pair without meeting in person, but there was no way to check that a
  pasted code wasn't tampered with in transit (e.g. over a compromised chat
  app) — the UI already warned about this but offered no mitigation. A live
  network challenge-response was ruled out because Tor P2P devices aren't
  guaranteed to be online at the same moment; a Signal-style safety number
  both sides can compute offline and compare over a different channel (a
  phone call) doesn't have that requirement.

**What was added**
- `IdentityManager.safetyNumber()`: a 6-digit code (`"123 456"`), derived
  by sorting both contacts' static X25519 ratchet identity public keys into
  a fixed order and SHA-256 hashing them — same shape as the existing
  `pairSecret()`, so both devices compute the identical code regardless of
  who's "mine" vs "theirs". If a pasted/scanned pairing code was tampered
  with, the ratchet key baked into it changes and so does this code.
- New per-contact `isVerified` flag (`Contact.kt`, Room schema bumped to
  v5 — destructive migration, all contacts must be re-paired after this
  update, same precedent as the v2→v3 and v3→v4 bumps).
- New contact-detail screen (tap the new shield icon next to any contact
  in the contact list): shows this device's own safety number for that
  contact, a field to enter the code they read out over a call, and a
  **Save button** that compares the two and — only on a match — persists
  `isVerified = true`. A mismatch is shown but never silently saved.
- Reachable for *any* contact, not just ones added via the debug
  copy/paste flow — so the same check works as an optional extra layer on
  top of a normal in-person QR pairing too, generalizing beyond the
  original remote-tester motivation (as intended: the plan was to build
  this once and reuse it for the Pro edition if it turned out to be good).

**How to apply**
- Update the app on both devices. Existing contacts are wiped by the v5
  Room migration and must be re-paired (QR scan, or the debug copy/paste
  flow) — this is expected, not a bug, and matches how prior schema bumps
  were handled.

---

## 2026‑08‑21 (10) · Relay delivery latency: 30s poll interval → 6s + instant on chat-open

**Bug**
- Reported after the '+' fetch-encoding fix (entry (8)) landed: delivery now works, but is
  "laaaangsam" — messages sitting queued for a reported 20, 30, even 35 seconds before
  arriving. Traced to `startRelayPoll()` in `P2PNetworkManager.kt`: the background poll loop
  only checked the relay mailbox once every fixed 30 seconds
  (`while (isActive) { delay(30_000); ... }`). A message pushed right after a poll round just
  ran has to wait almost the full 30s for the next one, plus however long the Tor fetch
  round-trip itself takes on top — matches the reported numbers closely. Fine when the relay
  was only an occasional offline fallback; not fine now that `MANDATORY` mode can make it the
  *only* delivery path for a contact.

**Fix**
- Poll interval dropped from 30s to `RELAY_POLL_INTERVAL_MS = 6_000L`. The poll round itself
  was pulled out of the loop into a reusable `pollRelayOnce()`, plus a new public
  `pollRelayNow()` that runs one round immediately, outside the loop's own cadence —
  `setActiveChat()` now calls it the moment a chat is opened, so the very case that matters
  most (you open a chat to see if anything arrived) doesn't wait for the loop to tick at all,
  only for the Tor fetch RTT. Trade-off, stated plainly: this poll loop runs continuously in
  the background (tied to the foreground services, not to a chat being open), so 6s instead
  of 30s is a real increase in background Tor traffic/battery use — judged worth it for a mode
  whose entire point is "the relay is now the only path, so it needs to behave like one".

**How to apply**
- Update the messenger app. Nothing to re-pair; test again with Node Pflicht — should now
  land within a few seconds instead of tens of seconds, and near-instantly if you have the
  chat open when it's sent.

---

## 2026‑08‑21 (9) · Fix: relay-android wouldn't compile (`Unresolved reference: BuildConfig`)

**Bug**
- Reported build failure: `:app:compileDebugKotlin` in `relay-android` failed with `Unresolved
  reference: BuildConfig` at `MainActivity.kt:48` and `:78`. Cause: when the root-detection
  gate was added to `relay-android` earlier this session, `MainActivity.kt` started calling
  `BuildConfig.DEBUG`, but `relay-android/app/build.gradle.kts`'s `buildFeatures` block was
  never given `buildConfig = true` — AGP 8 doesn't generate the `BuildConfig` class at all
  unless that's explicitly turned on (the main `unpruuf/app/build.gradle.kts` already has it,
  which is why the same pattern compiles fine there; only `relay-android`'s copy was missing
  it). Never compiled here to catch it — same standing caveat as every Android delivery this
  session.

**Fix**
- Added `buildConfig = true` next to the existing `compose = true` in
  `relay-android/app/build.gradle.kts`'s `buildFeatures` block. No source change needed.

**How to apply**
- Update `relay-android/`, re-sync Gradle, rebuild.

---

## 2026‑08‑21 (8) · Real fix: relay fetch silently dropped tags containing '+'

**Bug**
- Reported: 3 phones, sender in Node **Pflicht** (mandatory) mode, all three pointed at the
  same relay tablet via the same scanned QR. Messages piled up on the relay (queued count
  went up) but neither recipient ever received anything — ruling out the config-mismatch
  explanation in the previous entry.
- Root cause found in `RelayClient.kt`: `push()` sends the wire tag inside the JSON POST body,
  so it always arrives byte-exact. `fetch()` instead built `"/v1/fetch?tag=$wireTag"` by raw
  string interpolation — **no URL-encoding**. The wire tag is standard-alphabet base64
  (`IdentityManager.hmac()` uses `Base64.NO_WRAP`, not URL-safe), so it can contain `+`. Left
  un-encoded in a query string, every standard query-parameter decoder — NanoHTTPD's
  `java.net.URLDecoder` on relay-android, `qs` on the Node relay — turns a literal `+` back
  into a **space**, per `application/x-www-form-urlencoded` convention. A space isn't in
  `TAG_REGEX`, so the relay 400s the fetch, and `RelayClient.fetch()` silently returned an
  empty list. A 44-char base64 HMAC digest has roughly a 49% chance of containing at least one
  `+`, so this wasn't rare — it explains total, reproducible non-delivery in this exact test,
  and has been present ever since the relay-fallback feature existed (Mandatory mode just made
  it impossible to miss, since delivery now depends on the relay 100% of the time instead of
  rarely).

**Fix**
- `fetch()` now percent-encodes the wire tag with `java.net.URLEncoder.encode(wireTag,
  "UTF-8")` before building the query string. `push()` was never affected (JSON body, not a
  URL) and needed no change. No server-side change needed on either relay backend —
  percent-decoding `%2B` back to `+` is standard and unambiguous everywhere.

**How to apply**
- Update the messenger app only (`unpruuf/app/`, single file `RelayClient.kt`) — the relay
  tablet doesn't need reinstalling. Test again with Node **Pflicht**; the new activity log on
  the relay's own screen should now show matching "fetched" lines shortly after each "stored"
  one.

---

## 2026‑08‑21 (7) · Fingerprint button repositioned + relay activity log with timing

**What was done**
- `PinLockScreen.kt`: the fingerprint-unlock button sat above the number pad at 52dp with a
  default-size icon — too small, and in the wrong spot (banking-app convention is below the
  pad). Moved it to below the pad, enlarged to 72dp with an explicit 34dp icon. No behavior
  change — same `BiometricPrompt` call, same auto-prompt-on-open, still strictly a PIN
  stand-in with no path to the panic PIN.
- `relay-android/`: new on-device activity log so the relay's own screen shows what's actually
  passing through it, without adb/logcat. New `RelayEventLog` (in-memory ring buffer, 200
  entries) records three event kinds — **stored** (a push arrived), **fetched** (a device
  picked up 1+ queued blobs), **rejected** (a tag's queue was already full) — each with a
  timestamp, a short tag suffix (just enough to tell two conversations apart, never the full
  tag or the blob itself — the relay stays exactly as blind as before), size, and for
  **fetched** entries the average dwell time (`now − created_at`, the "how long did it sit
  queued" number that was asked for). `BlobStore.takeAll` now returns `StoredBlob(blob,
  createdAt)` instead of a bare blob string so `RelayHttpServer` can compute that dwell time —
  its only other caller was already updated. New "RECENT ACTIVITY" card in `RelayScreen.kt`,
  newest first, with a Clear button; empty until something actually passes through.

**Root cause of the reported bug (server had messages, neither phone received them)**
- Traced `P2PNetworkManager.startRelayPoll()`: for normal (non-cross-platform) contacts it
  only polls the relay mailbox `if (relayManager.isUsable())` — that check reads the
  **polling device's own** Settings → Relay configuration (its own onion + token, mode ≠ OFF),
  not anything about the sender. A sender in Node **Pflicht** (mandatory) mode pushes
  successfully regardless of what the receiving devices have configured — but if a receiving
  device's own relay is OFF, or points at a different relay/token than the sender pushed to,
  that device never polls the right mailbox and never sees the message, even though it's
  sitting on the server the whole time. This matches the report exactly (pile-up on the
  server, nothing on either phone) and is very likely just a configuration mismatch rather
  than a code defect: **all three phones need Settings → Relay pointed at the same relay
  (same scanned/pasted connection string) with mode not set to Off** for mandatory-mode
  messages to actually arrive. The new activity log makes this checkable directly — a phone
  that isn't polling the right relay will simply never show a "fetched" line for the sender's
  "stored" ones.

**How to apply**
- Update the messenger app and the relay-android tool. Nothing to re-enter. Check the relay's
  own "Recent activity" card after a test send to confirm store vs. fetch timing, and confirm
  all three phones' Settings → Relay show the identical connection string.

---

## 2026‑08‑21 (6) · License gate skipped entirely in debug builds

**What was done**
- A license self-binds to the first device it's activated on (by design — see
  `license-tool/README.md`), so every fresh test install on a new device needed its own
  distinct code. One line in `MainActivity.kt`: `licensed` is now also `true` whenever
  `BuildConfig.DEBUG`, so debug builds of Standard/Pro skip `LicenseLockScreen` entirely,
  same as Client already does. Release builds are completely unaffected — this only changes
  what a locally-built debug APK does.

**How to apply**
- Update the app. Nothing to re-enter, no data touched — a debug install just no longer shows
  the license screen at all.

---

## 2026‑08‑21 (5) · Debug-only copy/paste pairing (remote testers, no QR scan)

**What was done**
- Pairing has always required an in-person QR scan — no way to pair with a tester who isn't
  physically present. `QrPairScreen.kt` now offers a text alternative, **gated to
  `BuildConfig.DEBUG` only** (not in release builds — an in-person scan is a real
  physical-proximity check that a code copy/pasted over a message or email doesn't have; the
  debug-only restriction is deliberate, not a placeholder to loosen later without thinking
  about it again).
- "Copy code (debug)" button next to your own QR (both the normal Android/onion QR and the
  Pro cross-platform QR) — puts the exact same JSON string the QR encodes on the clipboard, to
  paste into any messaging channel.
- "Paste their code" field next to "Scan their code" — feeds a pasted string through the
  identical dispatch the camera scanner already uses (`jsonToPayload` first, then
  `jsonToCrossPlatformPayload`), landing on the exact same "name this contact" dialog and
  `handleScannedQr`/`handleScannedCrossPlatformQr` calls a real scan would. No new
  contact-creation code path — only a new input source feeding the existing one.
- Explicit warning shown under the paste field about what's given up by not scanning in
  person, same "state it plainly" convention as the rest of this project's security copy.

**How to apply**
- Update the app. Since this only changes UI in a debug build, it doesn't require re-pairing
  or touch the DB — existing contacts are unaffected either way.

---

## 2026‑08‑21 (4) · License Tool GUI (Windows, no command line)

**What was done**
- New `license-tool/gui/` — a local browser-based front end for issuing and tracking license
  codes, so Gabriel doesn't need to run `issue.js` by hand anymore. Same signing logic
  (`../lib.js`, unchanged), same offline guarantee — a tiny Express server bound to
  `127.0.0.1` only, no network call anywhere.
- `start-windows.bat`: double-click, installs its one dependency (Express) on first run,
  starts the server, opens the default browser to it automatically.
- Form: edition, customer, count, years, serial prefix, start-at → issues on submit, shows the
  code(s) with a copy button. Every issued code is appended to `gui/data/customers.json`
  (gitignored, not zipped) and shown in a running table below the form — a lightweight
  "customer database" without needing an actual database.
- Actually run end-to-end here (Node is available in this environment, unlike the Android
  side): started the server, hit `/api/issue` and `/api/customers` for real, and verified one
  of the generated codes with the existing `verify.js` — genuine signature check, not just "the
  server responded 200."

**How to apply**
- Extract the ZIP, go to `license-tool/gui/`, run `start-windows.bat`. Needs
  `license-tool/private-key.json` to already exist one folder up (same key as before — this
  doesn't rotate anything). CLI tools (`issue.js`/`verify.js`/`keygen.js`) are untouched and
  still work exactly as before; the GUI is an alternative front end, not a replacement.

---

## 2026‑08‑21 (3) · License signing key rotated (old key was lost)

**What was done**
- The Ed25519 key pair generated when the licensing system was built (2026‑08‑19) never
  persisted anywhere outside that session's ephemeral sandbox — confirmed lost (no
  `private-key.json` on Gabriel's machine, none in this fresh environment either; it's
  gitignored and excluded from every ZIP on purpose, so this isn't a leak, just a loss).
- Generated a fresh key pair with `license-tool/keygen.js` and updated
  `LicenseManager.PUBLIC_KEY_B64` in the app to the new public key. **Every license code
  issued under the old key stops working** — acceptable now (pre-launch beta, no codes handed
  to real customers yet), but this must not happen again once real seats are sold: back up
  `private-key.json` somewhere durable and offline the moment it's generated (keygen.js prints
  this warning itself).
- Issued two personal test licenses under the new key (`DEV-0001`, 3-year validity, standard
  and pro), verified with `license-tool/verify.js` before handing over — real signature
  verification, not just "the tool ran without an error."

**How to apply**
- Update the app (new `PUBLIC_KEY_B64`). Any previously-entered license code will now show as
  invalid — re-enter one of the new `DEV-0001` codes (delivered separately, not in this ZIP).
- The new `private-key.json` is being sent directly, not committed and not zipped (same as
  before) — keep it somewhere safe. `license-tool/README.md` covers issuing further codes
  offline, without needing me in the loop.

---

## 2026‑08‑21 (2) · Build-freshness expiry, 3-way relay mode, fingerprint unlock

**What was done**
- **Build-freshness gate**: every build now stops running ~6 months (180 days) after it was
  compiled — `BuildConfig.BUILD_EXPIRY_MS`, computed once at Gradle configuration time and baked
  into every install of that build. Checked right after the root-detection gate in
  `MainActivity.onCreate()` (same outermost-first placement, same re-check on foreground-return),
  new full-screen `AppExpiredScreen`, no bypass. Applies to every edition, including the free
  Client edition — independent of `LicenseManager`, which is about paid usage, not build
  staleness.
- **Relay mode is now 3-way, not on/off**: `RelayManager.RelayMode` (`OFF` / `AUTO` /
  `MANDATORY`) replaces the old `isEnabled()` boolean. `OFF` unchanged. `AUTO` keeps today's
  behavior (LAN → Tor-direct → relay fallback only once direct fails) and adds a new trigger:
  any file/photo transfer over 2 MB (`RELAY_SIZE_THRESHOLD_BYTES` in `P2PNetworkManager`) skips
  straight to the relay instead of attempting a slow/fragile direct Tor transfer first. `MANDATORY`
  is new: every contact (not just cross-platform ones) skips LAN/Tor-direct entirely and routes
  through the relay only — the exact same shape cross-platform (iOS-interop) contacts already
  used unconditionally, now available globally for testing the relay path in isolation. Settings
  → Relay (optional) is now three `FilterChip`s instead of a switch, meant to be flipped back
  and forth freely. `attemptDelivery`/`attemptChunkTrainDelivery` in `P2PNetworkManager` gained
  the `MANDATORY`/size-threshold branches; the existing cross-platform branches are untouched.
- **Fingerprint unlock, alongside the PIN, never instead of it**: new `androidx.biometric`
  dependency; `MainActivity` changed from `ComponentActivity` to `FragmentActivity` (required
  host for `BiometricPrompt`, itself a `ComponentActivity` subclass — no other behavior change).
  Opt-in via a new Settings → Security toggle (only shown if the device actually has usable
  biometric hardware). When enabled, `PinLockScreen` auto-prompts once on appearing and shows a
  fingerprint button next to the number pad; success calls the same unlock path as a correct
  normal PIN. Deliberately cannot touch the panic-PIN path at all — there's no biometric
  equivalent of a duress PIN, so biometric success only ever maps to `PinResult.NORMAL`'s
  behavior, never the wipe-and-open-empty path.

**How to apply**
- Update the messenger app. No DB/wire-protocol change — safe to roll out independently of the
  relay-android/root-detection delivery from earlier today.
- **Not verified here**: real-device confirmation that `FragmentActivity` + Compose + Hilt
  compile and run cleanly together (standard combination, but unverifiable without an SDK here),
  that the fingerprint prompt actually appears on a device with an enrolled fingerprint, and —
  by definition — that the 6-month expiry actually triggers (can only be tested by temporarily
  shortening the constant during local testing, not simulated here).

---

## 2026‑08‑21 · Root-detection gate (messenger + relay refuse to run on a rooted device)

**What was done**
- New `RootDetector` (plain Kotlin object, zero new Gradle dependencies, no network call —
  deliberately not Google Play Integrity, which would mean phoning Google on every launch):
  combines several independent signals (`su` binary present, `su -c id` actually executable,
  a known root-manager package installed, Magisk filesystem artifacts, `Build.TAGS` containing
  `test-keys`, a writable `/system`) and requires at least one *strong* signal (a working `su`
  exec, or `su` binary + a root app together) before reporting root — a single weak signal
  alone (e.g. `test-keys` on a legitimate custom ROM) doesn't lock out a real user.
- Always returns "not rooted" on debug builds (`BuildConfig.DEBUG`) and on recognized Android
  emulator fingerprints — the AVD trips several of the above heuristics by design; this keeps
  local development/testing unaffected.
- Checked as the first thing `MainActivity.onCreate()` does in both the messenger app and
  `relay-android`, before Tor/the P2P listener/`RelayService` ever start — a rooted device never
  reaches the point where an onion identity or key material is even generated. On root: a new
  full-screen `RootBlockedScreen` (same visual language as `LicenseLockScreen`) is shown instead
  of everything else, no dismiss, no bypass in release builds. Re-checked on every
  foreground-return too (piggybacked on the messenger's existing `ProcessLifecycleOwner`
  observer that already re-locks with PIN there; a plain `onResume()` override in
  `relay-android`, which has no equivalent observer) — root status realistically only changes
  via a reboot, which restarts the process anyway, so per-launch + per-resume is enough; no new
  polling loop.
- No shared Android module exists between `app/` and `relay-android/` (two fully separate
  Gradle projects) — `RootDetector.kt` is written once and copied byte-for-byte into both, in
  their own packages; documented as an intentional duplication, not an oversight. Note for
  later: drop the same file in verbatim once a Case Vault Android client exists.
- `SECURITY_CLAIMS.md` updated in place — stays tier "Best-effort, not proof" (heuristic root
  detection can in principle be defeated by a determined root-hiding framework like Magisk
  Hide/Zygisk/Shamiko), not upgraded to a stronger claim than that.

**How to apply**
- Update both the messenger app and `relay-android` — this doesn't touch the DB schema or wire
  protocol, so it's safe to roll out independently/at different times on different devices.
- **Not verified on a real rooted device or against a real root-hiding module in this
  environment** — no Android SDK, no rooted test device, no emulator here. Before this reaches
  real users: confirm on an actual Magisk-rooted phone that the block screen shows, and
  separately confirm the normal Android Studio emulator still launches normally (the
  debug-build + emulator-fingerprint carve-outs are what should prevent that from breaking).

---

## 2026‑08‑19 (2) · Android cross-platform mode — iOS-interop companion for Pro

**What was done**
- Built the Android-side companion to the already-shipped iOS cross-platform
  ("GRAL relay-mandatory") mode, so Android Pro can pair with and message
  iOS unpruuf users — see `CROSS_PLATFORM_PLAN.md` for the shared design;
  this was its documented next step (`STATUS.md` previously flagged this
  interop as blocked specifically on Android's missing companion support).
- `Contact` gained `crossPlatform`/`myRelayConnectionString`/
  `theirRelayConnectionString`/`myGeneration`/`theirGeneration`; DB bumped
  to v4 (destructive migration, same precedent as v2→v3 — all contacts must
  be re-paired after this update).
- New cross-platform pairing QR (`CrossPlatformPairing.kt`), byte-for-byte
  matching iOS's already-implemented `PairingPayload.swift` format
  (`{"v":1,"u","p","k","n"}` — `n` is a relay connection string instead of
  an onion). `QrPairScreen` gets a Pro-only toggle between the existing
  Android-onion QR and this one; the scanner tries the onion format first,
  falls back to cross-platform. Gated to Pro on both ends.
- `P2PNetworkManager` gained: a `UNPRUUF_WECHSEL_V1:<generation>:<relay>`
  control signal (same prefix-signal pattern as the existing main-onion
  update signal); a cross-platform branch in `resolveSender`/`startRelayPoll`
  using a ±1 generation window instead of the ±2h hour window normal
  contacts use; an early relay-mandatory branch in `attemptDelivery`/
  `attemptChunkTrainDelivery` that skips LAN/Tor-direct entirely for these
  contacts and pushes straight to `theirRelayConnectionString`; and a new
  `wechsel()` method for manual wire-tag rotation (a "Wechsel" button in
  `ChatScreen`, cross-platform contacts only).
- No changes needed to `IdentityManager`, `RatchetFrame`, `MessagePayload`,
  `NetworkObfuscation`, `CryptoManager`, `DoubleRatchet`, or `RelayClient` —
  all were already transport-agnostic enough to reuse as-is, confirmed by
  reading each before writing any new code rather than assuming.
- **Verified the actual interop point, not just reasoned about it**: the
  generation-based wire tag is the one formula that has to match byte-for-
  byte between Android and iOS for pairing to work at all. Computed a fixed
  HMAC-SHA256 test vector in Node, then independently in a plain Java
  program calling the exact same `MessageDigest`/`Mac` JCA APIs
  `IdentityManager.kt` calls under the hood — both produced the identical
  tag, including a check that `pairSecret` is genuinely symmetric regardless
  of which side computes it first.

**Design note (scope, decided before building)**
- Matches iOS's own "first working shell" cut exactly, not a superset: no
  trusted-node list, no temp-node/TTL, text-chat is what's verified
  (attachments should work through the same reused chunk-framing but
  weren't specifically exercised this round). Going further wasn't needed
  for actual interop and isn't built on either platform yet — see
  `CROSS_PLATFORM_PLAN.md`'s own "genuinely new, still not built" list.

**How to apply**
- Update the messenger app on Pro devices that need iOS interop. Wire-level
  change (new DB columns, new control signal) — existing contacts survive
  the update (only the Room migration is destructive to CONTACTS, not the
  app itself), but any NEW cross-platform pairing needs both sides on this
  build or newer, plus a relay already configured in Settings (the outgoing
  cross-platform QR needs a relay connection string to put in it).
- **Not verified against real iOS code in this environment** — only
  `CROSS_PLATFORM_PLAN.md`'s description of the iOS implementation was
  available here, not the Swift source itself for a side-by-side check.
  First real pairing attempt against an actual iOS build is the genuine test.

---

## 2026‑08‑19 · Offline license/expiry system (no license server)

**What was done**
- Built the offline licensing scheme discussed in chat: Standard/Pro editions now require a
  signed, expiring license (Client stays free, unaffected — see `AppEdition.isClient`).
- `unpruuf/license-tool/` — a standalone Node.js tool (no dependencies beyond Node's own
  `crypto`, no network calls): `keygen.js` generates the one Ed25519 key pair that signs every
  license, `issue.js` mints 1 or N signed codes at once (e.g. a 350-seat batch) with a CSV
  manifest, `verify.js` checks a code offline exactly like the app does. See its README for
  the full design, including the hard, honest limit: no offline scheme can enforce a global
  seat count — only issuing exactly N codes can, which is a contractual matter, not a
  technical one. Codes look like `unpruuf-license:v1:<payload>:<signature>`.
- `LicenseManager.kt` (new) — verifies a code's Ed25519 signature with Tink's `Ed25519Verify`
  (already a dependency, no new Gradle changes), then three offline-only protections layered
  on top: (1) each code self-binds to the first device it's activated on (`ANDROID_ID` hash),
  so a copied/cloned app-data folder is rejected on a second device; (2) "now" is a persisted
  high-water mark that never decreases, so turning the system clock back stops working once
  the device has ever seen a later date; (3) an expiry warning starts 30 days out.
- Settings → License (new section, Standard/Pro builds only): shows status/serial/customer/
  days-left, lets the user paste an activation or renewal code.
- `MainActivity` now hard-gates reaching the app (`LicenseLockScreen`, new) behind a
  Valid/ExpiringSoon license state for Standard/Pro — PIN, panic-PIN, and RAM message data are
  completely untouched by this; an expired/missing license only blocks the chat list, nothing
  is wiped.
- **Verified the actual crypto, not just reasoned about it**: generated a real key pair,
  issued test licenses with Node, and cross-checked them against Tink's `Ed25519Verify` in a
  standalone Java test (compiled/run for real against the exact `tink` artifact this app uses)
  — including a tamper test (flipped byte → correctly rejected) and a wrong-payload test.
  All passed before this got wired into the app. Given no way to compile the Android app
  itself here, this was the one part of the scheme that could be independently verified, and
  it was, rather than assumed to just work because it's a standard algorithm.

**Design note (asked about first, before building)**
- A pure client-side/offline system cannot verify "exactly 350 devices are active" — there is
  no coordination point between devices. What this scheme technically enforces is narrower:
  a code can't be forged, and one activated seat can't be silently duplicated onto a second
  device. The "350" cap itself is enforced by only ever issuing 350 codes (`license-tool`'s
  own manifest is the audit trail), not by anything the app can check.

**How to apply**
- Update the messenger app. The private key that signs licenses (`license-tool/private-key.json`)
  was generated during this delivery and handed over separately (NOT inside this ZIP, NOT
  committed to git — see `license-tool/.gitignore` and the `ship` skill's explicit excludes for
  why) — keep it somewhere safe and offline; whoever holds it can mint unlimited valid licenses.
  A Standard/Pro build with no license entered yet will show the activation screen on first
  launch — enter a code generated by `license-tool/issue.js` to unlock it.

---

## 2026‑08‑18 · Relay set-up nudge in the "still connecting" hint + relay-android Gradle wrapper fix

**What was done**
- Reviewed how `unpruuf-relay`'s store-and-forward relay is already wired into
  the main app (`P2PNetworkManager.attemptDelivery`/`attemptChunkTrainDelivery`:
  LAN → direct Tor (90s timeout) → relay push, automatically, if one is
  configured; `startRelayPoll()` checks every 30s on the receiving side). This
  is architecturally the same pattern as Briar's "Mailbox" concept — already
  built, just off by default and easy to leave undiscovered.
- `ChatScreen`'s "Still connecting…" hint (added 2026‑08‑16) now also shows,
  only when no relay is configured, a tappable "Set up a relay to avoid this
  wait — Settings ›" line that jumps straight to Settings → Relay. A
  configured relay would very likely have turned the 5-10 minute cold-path
  wait from that report into ~90s, so this points at the fix at the exact
  moment it would have helped, instead of leaving it buried in Settings.
- **`relay-android` Gradle sync fix**: the project shipped without a Gradle
  wrapper — `gradlew`, `gradlew.bat`, and `gradle/wrapper/gradle-wrapper.jar`
  were all missing (only `gradle-wrapper.properties` existed). That alone is
  enough to make Android Studio's Gradle sync fail on a fresh checkout,
  depending on IDE settings. Regenerated the full wrapper (targeting the
  already-pinned Gradle 8.6, matching `gradle-wrapper.properties`). Verified
  end-to-end from a clean state: `./gradlew help` and a full
  `:app:dependencies` resolution (Compose, `tor-android`/`jtorctl`, IPtProxy,
  zxing, nanohttpd, coroutines — every declared dependency against every
  declared repo, including the two Guardian Project Maven repos) both
  succeed with no errors. `:app:assembleDebug` was NOT run here (no Android
  SDK in this environment — that step needs `local.properties`, which
  Android Studio generates automatically per machine and must never be
  shipped) — everything short of that is confirmed clean.

**Fix / cause**
- Chat UI: presentational only, reads existing `messages`/`deliveredIds`
  state plus `RelayManager.isUsable()` (new one-line getter on
  `ChatViewModel`) — no networking or delivery-queue code touched.
- Relay project: missing wrapper binary/scripts, not a dependency or config
  bug — nothing in `build.gradle.kts`/`settings.gradle.kts` needed changing.

**How to apply**
- Update the messenger app for the new hint (no pairing/protocol impact).
- Re-import `relay-android/` in Android Studio (or re-open the project) after
  taking the new ZIP — the restored wrapper should let Gradle sync complete.
  If sync still fails, please paste the exact error text; "some Gradle sync
  error" without the message narrows down nothing further from here.

---

## 2026‑08‑16 (5) · UX: honest "still connecting" hint for a slow cold mobile↔mobile path (no bug — confirmed working, just slow and silent about it)

**What was done**
- Investigated a report of "can't send at all anymore, neither to Wi‑Fi nor
  mobile contacts" that survived a full app restart. Turned out NOT to be a
  bug: after restart, sending started working on its own after ~5 minutes,
  receiving after another ~5, then everything was instant — a real,
  unassisted recovery, not a stuck/dead state. This matches a limitation
  already on record (see the 2026‑08‑15 (8) entry): a cold mobile↔mobile Tor
  rendezvous can genuinely take several minutes, and the delivery queue's
  own retry-with-backoff (by design) just keeps trying until it lands.

**Bug / cause**
- Not a networking bug — a feedback gap. The status pill reflects the
  device's own hidden-service self-reachability, which can (and did) settle
  to "TOR ACTIVE" well before the FIRST rendezvous circuit to a specific
  contact finishes building. So for several minutes, everything LOOKED
  broken (pill says active, message just sits at the clock, nothing visibly
  happening) while the app was actually doing exactly what it's supposed to.

**Fix** (`ChatScreen.kt`, UI-only — no networking or delivery-queue code touched)
- Added a small "Still connecting… first message on mobile data can take a
  few minutes" hint above the message list, shown once an outgoing message
  has been undelivered for 25s+ (well before the 90s connect timeout would
  even have failed once). Purely presentational: reads the same
  messages/deliveredIds state the message bubbles' own ✓✓/··· indicator
  already reads, changes no behavior.

**How to apply**
- Update the device(s) you want the hint on. No pairing/protocol impact,
  safe to roll out independently of the other devices. **Unverified on real
  hardware** as always — please confirm the hint appears/disappears at the
  right times and doesn't get in the way.

---

## 2026‑08‑16 (4) · Fix a regression from the previous delivery: the new legacy-onion recovery bounce could fire during an active network-change recovery and break EVERYTHING, not just the legacy pairing

**What was done**
- Fixed a self-inflicted regression from the immediately preceding delivery
  (legacy-onion recovery bounce), reported as: mobile↔mobile completely dead
  in BOTH directions, and — after switching back to Wi‑Fi — a **brand-new,
  freshly re-paired contact** stuck at the clock indefinitely, even after an
  app restart. That's strictly worse than the bug that delivery was fixing,
  and a fresh pairing was never supposed to be affected by legacy-onion
  logic at all.

**Bug / cause**
- The previous fix added an independent path that asks Tor for a recovery
  bounce (`forceBounce()`, a full `DisableNetwork` cycle that tears down
  EVERY circuit the device has) once a legacy per-contact onion fails 3
  checks in a row. It was rate-limited to at most once per 2 minutes, but
  missing one more guard: it could still fire WHILE
  `verifyReachabilityAfterNetworkChange`'s own loop was already actively
  recovering from the very same network switch (that loop runs checks every
  20-45s for up to 4 minutes right after a switch — plenty of time for an
  unrelated, already-flaky legacy onion on the device to rack up 3
  consecutive failures inside that same window). Two independent bounce
  triggers firing close together around exactly the moment the device is
  reconnecting is much worse than either alone — a bounce mid-connect kills
  whatever ELSE was in progress too, including a totally unrelated, healthy,
  freshly-paired contact's connection attempt. This matches the report
  precisely: right after a network switch is exactly when this could fire,
  and it doesn't care which contact it disrupts.

**Fix** (`P2PNetworkManager.kt`)
- `recordLegacyOnionProbe` now does nothing at all — doesn't even accumulate
  a failure streak — while `reachabilityCheckJob` (the main network-change
  recovery loop) is active. Legacy-onion failures only count once things
  have settled and that loop is idle again (i.e. from the periodic 4-minute
  check), which is also a more honest measurement: churn during an active
  network transition was never a good signal that a legacy onion is
  *actually* stuck versus just still catching up.

**How to apply**
- Update both/all devices. **Unverified on real hardware** — please retest
  the exact sequence from the report: switch both devices to mobile data,
  confirm mobile↔mobile sending in both directions, then switch back to
  Wi‑Fi and confirm the tablet and the just-re-paired phone both work
  immediately. Apologies for the regression — this file's own history shows
  this class of "recovery mechanism accidentally fights the thing it's
  recovering" bug has come up more than once, and this delivery adds the
  guard that specific pattern needs (matching the one
  `startPeriodicReachabilityCheck` already uses for the same reason).

---

## 2026‑08‑16 (3) · Fix: mobile↔mobile sending to an old contact still stuck — a legacy onion going unreachable was never noticed or recovered

**What was done**
- Fixed a repeat of the mobile↔mobile sending problem, reported again after the
  previous 90s-timeout fix: with both devices on mobile data, sending to a
  contact paired **before** this app's main-onion model stayed stuck for 5+
  minutes with no message arriving, while the sending device's own status
  pill still read "TOR ACTIVE" the entire time and receiving from that same
  contact worked fine.

**Bug / cause**
- The key new detail versus the previous report: this was specifically an
  **old/legacy-paired contact**. This app has two ways a device publishes its
  receiving address: a single shared "main onion" for every contact paired on
  the current build, and, for backward compatibility, separate legacy
  per-contact onions kept alive for contacts paired before that model
  existed. The self-reachability check that decides whether to bounce and
  recover Tor was fixed in a previous delivery to gate its verdict on the
  MAIN onion only — that fixed a real bounce-loop bug, but as a side effect
  it stopped the app from EVER re-checking or recovering a legacy onion
  specifically: legacy onions were still probed for "warmth," but a probe
  failure could no longer trigger any recovery action, only fail to affect
  the (already main-onion-only) verdict. So if a legacy onion went
  unreachable — plausible on mobile, the hardest network path this app
  handles — while the main onion stayed healthy, nothing in the app ever
  noticed. The status pill (main-onion-based) kept reading fine, and the
  contact that specific legacy onion belonged to just stayed silently
  unreachable until some unrelated event (e.g. a full Tor restart)
  happened to fix it by accident.

**Fix** (`P2PNetworkManager.kt`)
- Added a small, deliberately decoupled recovery path: legacy-onion probe
  results (previously discarded — fire-and-forget) now feed a per-onion
  consecutive-failure counter. Once one onion fails 3 checks in a row, the
  app asks Tor for one recovery bounce — independent of, and separately
  rate-limited from (at most once per 2 minutes), the main gate's own retry
  logic, specifically so this can't reintroduce either of the two bounce-loop
  regressions that logic was already hardened against. The visible status
  pill and the main verdict are untouched by this change.

**A more permanent fix you can apply right now, on either phone**
- Open Contacts — if a banner reads "N contacts may have an outdated address
  for this device," tap **Update now**. That sends your current main-onion
  address to every legacy-paired contact, so they migrate to the same
  already-verified-healthy address your own status pill is based on — this
  removes the legacy-onion class of bug for that pairing entirely, not just
  adds a slower safety net for it. No re-pairing needed.

**How to apply**
- Update both devices. **Unverified on real hardware** (cannot compile/run
  Android here) — please retest mobile↔mobile specifically with an OLD
  contact this time (a freshly re-paired contact was never affected by this
  particular bug, since new pairings only ever use the main onion). If it's
  still stuck after ~2-3 minutes even now, try the "Update now" banner above
  before reporting back — it should make the underlying issue moot for that
  contact regardless of whether the code-level recovery kicks in.

---

## 2026‑08‑16 (2) · unpruuf Relay (Android): add Tor bridges, incl. obfs4/Snowflake

**What was done**
- Added censorship-circumvention support to the new `unpruuf/relay-android/`
  app from the previous delivery — a toggle + bridge-lines field, exactly
  mirroring the main messenger app's Settings → Censorship Circumvention.
  Direct ports of that app's own files, adapted to this app's simpler
  single-hidden-service `RelayTorManager`:
  - `core/RelayBridgeManager.kt` — port of `domain/network/BridgeManager.kt`
    (persists the enable flag + bridge-lines text; splits vanilla vs.
    pluggable-transport lines).
  - `net/RelayPluggableTransportManager.kt` — port of
    `domain/network/PluggableTransportManager.kt` (same IPtProxy
    `Controller`/`SnowflakeProxy` API surface already confirmed against a
    real Android Studio build on the messenger app).
  - `RelayTorManager.applyBridges()`/`reapplyBridges()` — port of
    `TorManager`'s same-named functions: vanilla bridges apply directly;
    obfs4/Snowflake lines only get plugged in (`ClientTransportPlugin ...
    socks5 127.0.0.1:<port>`) once IPtProxy actually reports a live local
    port for that transport, otherwise Tor falls back to `UseBridges 0`
    rather than being left half-configured. `reapplyBridges()` re-sends the
    config and forces Tor to rebuild its connection immediately, so a
    saved change doesn't need an app restart.
  - `ui/RelayScreen.kt` — new "Censorship circumvention" card (switch +
    bridge-lines field + "Save & reconnect"), same content/wording as the
    messenger app's equivalent section.
- Added the `com.netzarchitekten:IPtProxy:5.5.1` dependency and an
  `IPtProxy.**` Proguard keep rule (its package isn't under
  `info.guardianproject.*`, so the existing keep rule wouldn't have
  covered it in a minified build).

**Why this matters for a relay specifically**
- More than for a personal messenger: a relay that nobody in a censored
  network can even reach Tor with to run is useless to everyone who was
  depending on it, not just its own operator.

**Bug / cause**
- Not a fix — an added feature, requested directly as a follow-up to the
  new relay app.

**Fix**
- N/A.

**How to apply**
- Update `unpruuf/relay-android/` only — no change to the messenger app or
  the Node relay. **Unverified here** as always (same inherited caveat as
  the messenger app's own obfs4/Snowflake wiring: "still unconfirmed
  whether `controller.port(\"snowflake\")` is really how a running
  `SnowflakeProxy`'s port is read" — see `RelayPluggableTransportManager.kt`'s
  doc comment). If bridges don't work end-to-end, that line is the first
  place to check.

---

## 2026‑08‑16 (1) · New app: unpruuf Relay for Android — native Kotlin relay server, no Node.js/laptop needed

**What was done**
- Added `unpruuf/relay-android/` — a new, standalone Android app that runs
  the optional relay directly on a phone: start the app, it boots Tor and
  the relay's HTTP server and shows a QR code (+ copyable text) to pair the
  messenger app to it, and it exposes a configurable **message-expiry
  ("reset") setting** plus a manual "Reset now" button, as requested.
- **Not a Node.js embed.** Considered embedding the existing
  `unpruuf/server/` TypeScript code via `nodejs-mobile`, but rejected it:
  that server depends on `better-sqlite3` (a compiled native Node addon),
  and cross-compiling native Node addons against `nodejs-mobile`'s Node ABI
  for every Android CPU architecture is a well-documented blocker similar
  projects regularly get stuck on — not something that could be verified
  without a working Android build environment here. Asked the user this
  question directly before building; they confirmed the native rewrite.
- Instead, the same small wire contract (`POST /v1/relay`, `GET /v1/fetch`,
  `GET /health`, bearer-token auth, TTL expiry, connection-string format) is
  reimplemented natively in Kotlin, **wire-compatible byte-for-byte** with
  the Node relay — the main app's existing `RelayClient.kt`/`RelayManager.kt`
  talk to this Android relay with zero changes:
  - **Tor**: reuses the exact same mechanism
    (`info.guardianproject:tor-android` + `jtorctl`, `TorService` +
    `TorControlConnection.addOnion`) the main messenger app's own
    `TorManager.kt` already uses — the highest-confidence part of this
    delivery, since it's the same pattern already reasoned through
    carefully elsewhere in this project, not new code written from
    scratch. Publishes one fixed hidden service on the required virtual
    port 80 (`RelayClient.kt` hard-codes `RELAY_PORT = 80` when dialing a
    relay — matched exactly).
  - **HTTP server**: NanoHTTPD, a small, extremely well-established
    pure-Java embedded server (no NDK/native build risk) — chosen over
    hand-rolling HTTP/1.1 request parsing, which is far more
    correctness-sensitive on the *serving* side than on `RelayClient.kt`'s
    hand-rolled *client* side (which only ever constructs one fixed request
    shape it wrote itself).
  - **Storage**: plain `SQLiteOpenHelper` (no Room/SQLCipher) mirroring the
    Node version's own plain-SQLite choice — the queue holds only
    already-Double-Ratchet-encrypted ciphertext the relay is
    architecturally blind to, so at-rest encryption of the queue adds no
    real confidentiality.
- UI: QR + copyable connection string, a stepped message-expiry control
  (1h steps near the default, whole-day steps once well past it — reaching
  30 days doesn't take ninety taps), live queued-message count, "Reset now"
  (immediate manual wipe, clearly separate from the automatic TTL sweep),
  and a secondary "Rotate access token" action with an explicit warning
  that it breaks every already-paired device.
- Own Gradle project (`unpruuf/relay-android/`, package
  `com.nexonai.unpruuf.relay`), same AGP/Kotlin/Compose/tor-android
  dependency versions as the main messenger app for consistency. Ships
  without a binary `gradle-wrapper.jar` (can't be hand-authored as text) —
  Android Studio generates it on first open, documented in the new
  `relay-android/README.md`.
- Updated the `ship` skill's ZIP command to also exclude
  `relay-android/`'s future build artifacts.

**Known limitation, disclosed up front (see `relay-android/README.md`)**
- This first version does **not** yet have the main messenger app's
  network-change resilience (the whole fix history earlier in this
  CHANGELOG). It publishes its hidden service once; a phone that changes
  networks often may need the app restarted to republish reliably.
  Deliberately scoped out to stay focused on what was actually asked —
  worth building if this app sees real use.

**Bug / cause**
- Not a fix — a new app, built from the ground up this session.

**Fix**
- N/A.

**How to apply**
- This is a NEW, separate app — no impact on the existing messenger or the
  existing Node relay. Open `unpruuf/relay-android/` in Android Studio as
  its own project (see its README for the one-time Gradle-wrapper note).
  **Entirely unverified — cannot compile or run any of this here.** This is
  the largest single piece of new code delivered this session; please paste
  the exact Android Studio error text for anything that doesn't build, and
  it'll be fixed immediately, same as every other delivery.

---

## 2026‑08‑15 (8) · Fix: mobile↔mobile sending dead in one direction — connect timeout too short for the double-carrier path

**What was done**
- Fixed the reported asymmetry with BOTH devices on mobile data: one device
  could receive but not send ("···" forever), the other could send but got
  nothing back — and the moment the stuck device returned to Wi‑Fi, every
  queued message arrived at once.

**Bug / cause**
- That last detail located it: instant delivery from Wi‑Fi proves the
  receiver's hidden service was published and healthy the whole time — so
  the only broken piece was the SENDER's mobile Tor client establishing a
  connection to a MOBILE-hosted hidden service. That is the hardest path
  Tor has: both ends behind carrier NAT, high latency on both sides, and
  (right after the receiver's network switch) a freshly republished
  descriptor to fetch. That rendezvous regularly needs more than the 40s
  connect timeout contact traffic used — so every attempt timed out, the
  queue retried, and every retry timed out again. The reverse direction
  worked because the other device's hidden service had been warm and stable
  on mobile for much longer.

**Fix** (`P2PNetworkManager.kt`)
- Fresh connections to a contact's onion (both pooled send paths) now get a
  90s connect timeout (`TOR_CONNECT_TIMEOUT_MS`) instead of 40s. Because
  connections are pooled, this price is paid once per connection, not per
  message — one patient connect, then everything rides the open connection
  at round-trip speed. Probe timeouts (keep-alive, self-check) are
  unchanged at 40s so the reachability machinery keeps its cadence, and
  stale-pool detection stays at 15s so a dead pooled socket still fails
  fast before the fresh connect takes over.

**How to apply**
- Update both devices; no protocol change. **Unverified on real hardware.**
  Please retest specifically mobile↔mobile in both directions. Expect the
  FIRST message on a cold path to possibly take up to ~1.5 minutes on this
  worst-case path — but then to stay fast while the connection lives. If
  mobile↔mobile still fails consistently even with this, the honest answer
  is that this carrier pair needs the relay as designed fallback for the
  worst paths (Settings → "Use relay when contact is offline") — that's
  exactly the case it exists for.

---

## 2026‑08‑15 (7) · Fix: receiving on mobile data completely dead — self-check bounce loop was destroying its own hidden service

**What was done**
- Fixed the reported total receive failure on mobile data (sender stuck on
  "···", no notification on the receiver, Tor pill ACTIVE, and switching the
  receiver to Wi‑Fi delivered everything instantly — those four facts
  together located the bug precisely).

**Bug / cause**
- Self-inflicted: a self-connect through one's own hidden service is the
  slowest, flakiest path Tor has — from a mobile-data client it regularly
  times out even while actual contacts could connect fine. The reachability
  machinery treated every failed self-check as proof of unreachability and
  answered with a full `DisableNetwork` bounce, tearing down the
  just-published hidden service. Two amplifiers made this fatal on mobile:
  the periodic check re-entered every 4 minutes, and the `.all{}` verdict
  required EVERY own onion (main + each legacy per-contact one) to answer
  within 40s — on a slow carrier that's chronically false-negative. Result:
  the device bounced its own Tor in a near-permanent loop; its hidden
  service never had a stable published window; receiving was effectively
  dead while Tor itself looked "active" (isReady is deliberately untouched
  by bounces) and sending kept working (client circuits rebuild fast).

**Fix** (`P2PNetworkManager.kt`, receiver-side only)
1. **Main-onion-gated verdict**: `isSelfReachableViaTor()` now requires only
   the MAIN onion to answer — the address every current pairing dials —
  with ONE retry before failing (a single timed-out mobile self-connect is
   usually a false negative). Legacy onions are still probed in parallel for
   warmth but can no longer fail the verdict. The earlier `.any{}` bug (a
   legacy onion masking a dead main onion) stays fixed: only the main
   onion's answer counts.
2. **Two-strikes bouncing**: a failed check re-checks once before the
   disruptive bounce is allowed; after a bounce the next judgment waits 45s
   so the republish plus a slow mobile self-connect get a realistic window.
3. **Honest status pill**: the contact list's pill now has a third state —
   RECONNECTING (amber) whenever Tor runs but the last self-check failed and
   the self-heal loop is active. "TOR ACTIVE" alone never said whether
   anyone could actually reach the device; now the difference is visible on
   screen, which also makes future reports like this one diagnosable at a
   glance.

**How to apply**
- Update the app on the mobile-data device (the fix is receiver-side; wire
  protocol unchanged, but keep both devices current as usual). **Unverified
  on real hardware** — but the diagnosis is built directly on the four
  answers above, and every change makes the remedy strictly less
  destructive. Please retest receiving on mobile data and watch the new
  pill: mostly "TOR ACTIVE" with occasional short "RECONNECTING" is healthy;
  permanently "RECONNECTING" would mean the carrier path genuinely can't
  publish the hidden service — worth checking Android's per-app settings
  then (Mobile data → allow unrestricted background usage, Data Saver off
  for unpruuf).

---

## 2026‑08‑15 (6) · "Quiet Ink" UI redesign (approved mockups, implemented in Compose)

**What was done**
Implemented the approved design proposal (see the published mockup page) as a
pure visual pass — no navigation, state, or network logic touched:

- **Theme** (`Color.kt`, `Theme.kt`): grey inks replaced with teal-biased
  near-blacks in three elevation levels (ink `#0E1517` → surface `#151E20` →
  raised `#1B2629`), hairline `#243134`, soft text `#E9EEED`. Refined
  per-edition accents (Standard seafoam `#45D0BB`, Pro gold `#E3B341`,
  Client blue `#64A9EE`), each paired with a DEEP SURFACE form
  (`primaryContainer`/`secondaryContainer`) used for own bubbles, pills and
  banners — the accent itself stays reserved for state and action. New
  "technical voice": `labelSmall`/`labelMedium` are now monospace with
  letter-spacing, which automatically restyles every timestamp, delivery
  stamp, status line and badge across the app.
- **Contacts**: app bar shows the wordmark (accented "un") + a live
  TOR ACTIVE / CONNECTING pill (state from `TorManager.isReady`, exposed via
  `ContactsViewModel.torActive`). Contact rows: initials avatar with the
  unread dot, and the raw onion-address snippet replaced by the transport
  actually in use ("direct · via tor" / "same wi-fi · lan" — new
  `P2PNetworkManager.isLanPeer()`). FAB is now the QR-scan action (the
  duplicate app-bar scan icon was removed).
- **Chat**: own bubbles on the deep accent surface instead of full accent;
  18dp/6dp bubble corners; delivery stamp as monospace with the ✓✓ tick in
  the accent (pending is now "···"); and the RAM wipe made visible — a quiet
  "older messages wiped from RAM" ghost marker where history ends
  (auto-scroll index adjusted for the extra list item).
- **Lock screen**: full redesign — dimmed wordmark, PIN dots, a real number
  pad (✓ submits at ≥4 digits, ⌫ deletes; 12-digit max unchanged). Reveals
  nothing about the app; normal PIN and panic PIN remain visually identical.
  The "B2" build marker is kept.
- **Pairing**: eyebrow headings, a live "tor active — your code is ready" /
  "connecting to tor…" status line, "Scan their code" primary button, and
  the mutual-ceremony explainer line.
- **Settings**: edition chip (gold PRO etc.) in the app bar, monospace
  uppercase section eyebrows.
- Home and the remaining screens inherit the new theme automatically.

**Bug / cause**
- Not a fix — the approved redesign ("Ja, setz es um in Compose").

**Fix**
- N/A. Functional surface unchanged; one deliberate UI removal: the contact
  list's duplicate scan icon (the FAB covers adding).

**How to apply**
- Update the app (both devices can update independently — nothing wire-level
  changed). **Unverified visually and uncompiled here** as always; this
  delivery is UI-only, so any mistake shows up as a compile error or a wrong
  color, not a broken message path. If Android Studio reports anything,
  paste the exact error text.

---

## 2026‑08‑15 (5) · Fix: an in-flight image/file transfer blocked every text behind it (~5 min stalls); chunks now windowed

**What was done**
Directly addresses the report "after a few messages and an image everything
hung, nothing reached the mobile device for ~5 minutes, then it all arrived
and was instant afterwards":

1. **Texts no longer wait behind file transfers.** The delivery queue was
   strictly ordered per contact, and a photo/file is a train of 4096-byte
   chunks, each of which paid a full ACK round-trip — several seconds each
   on the slow Wi‑Fi → mobile direction. Every text queued after the image
   sat behind the ENTIRE train: a few hundred KB × seconds per chunk is
   exactly a multi-minute stall, and once the train finished, everything
   flushed and felt instant — matching the report point for point. Each
   flush round now delivers all single-packet items (texts, control
   signals) first, then chunk trains. Safe reordering: a text is its own
   Double-Ratchet message (the receiver's skipped-key cache is built for
   messages overtaking each other), and chunk reassembly is index-based
   per message. Chunk trains themselves stay strictly prefix-ordered, so
   the "messageId on the last chunk" delivery-tick contract is unchanged.
2. **Chunk trains are pipelined in windows of 8.** Instead of one chunk per
   ACK round-trip, up to 8 chunks (~33 KB — far below TCP buffer sizes, no
   deadlock risk) are written back-to-back over the pooled connection, then
   their ACKs collected. The receiver's read→ingest→ACK loop is completely
   unchanged — packets simply queue in the TCP buffers instead of each
   waiting out a round-trip. On a high-latency path this cuts transfer time
   roughly by the window factor; combined with (1), a photo no longer makes
   the chat feel frozen even while it uploads. Retry of an unACKed window
   is safe against the delivered-but-ACK-lost case thanks to the lost-ACK
   dedup shipped in (3): the receiver re-ACKs duplicates without
   reprocessing.

**Bug / cause**
- See (1) — head-of-line blocking by design of the strictly-ordered queue,
  made visible by the (much) higher per-chunk latency toward a
  mobile-hosted hidden service. Was flagged as a known cost in delivery
  (2)'s notes ("big files still bounded by per-chunk ACK round-trips");
  the real-device report confirmed it's the dominant remaining stall.

**Fix**
- See above. No wire-format change (same per-packet framing and per-packet
  ACKs); receiver code untouched by the windowing.

**How to apply**
- Update both devices. **Unverified on real hardware** as always — the
  queue rework is the most delicate change in this delivery; please retest
  in this order: (a) texts both directions, (b) send an image, then
  IMMEDIATELY several texts — the texts should arrive promptly WHILE the
  image is still transferring, (c) the image itself should arrive
  noticeably faster than before, (d) a file as attachment, (e) a network
  switch during an image transfer (expect the transfer to resume/finish
  after the switch — chunks retry).

---

## 2026‑08‑15 (4) · Fix: attaching a photo/file kicked the app to the PIN screen and dropped the pick

**What was done**
- Fixed the reported dead end: tapping "Take photo" or "Attach file", then
  picking something, landed on the PIN entry screen and nothing was sent.

**Bug / cause**
- The camera and the system file picker are EXTERNAL activities — launching
  them puts the whole app into the background. The process-lifecycle
  observer in `MainActivity` treats every background transition as "user
  left the app": it zeroizes all RAM messages and locks the app. So the
  moment the picker opened, the app locked itself behind it; the PIN screen
  replaced the whole UI, which also disposed the chat screen — and with it
  the registered ActivityResult callback — so the picked photo/file had
  nothing left to deliver its result to and was silently dropped. (QR
  pairing never hit this because the QR scanner is an in-app activity in
  the same process — the app never actually goes background there, which is
  exactly what the observer's original comment assumed for everything.)

**Fix**
- A bounded "external intent grace" in `AppLockManager`: the chat screen
  arms it immediately before launching the camera/picker
  (`ChatViewModel.beginExternalPickerGrace()`), and the background observer
  skips its wipe+lock for exactly that one round-trip. Safety limits, so
  this can't become a hole:
  - The grace expires after 5 minutes. If the user never comes back, a
    scheduled job performs the skipped wipe+lock in the background at
    expiry, and `onStart` double-checks on return (came back too late →
    wipe+lock right then, PIN required as usual).
  - Screen-off (`ScreenLockReceiver`) ignores the grace entirely —
    pocketing the phone mid-picker still wipes and locks immediately.
  - The grace lives only in RAM (like the whole lock state) and is armed
    only by an explicit in-app tap on attach/camera — a fresh process
    always starts without one.
  - Message exposure while in the picker stays bounded by the existing
    5-minute RAM TTL regardless.

**How to apply**
- Update the app (receiver side doesn't matter for this one — it's purely
  local UI/lock behavior, but keeping both devices on the same version
  stays the rule). **Unverified on real hardware** as always. Please
  retest: camera → photo → should send; attach → file/image → should send;
  and as a counter-check, pressing the power button while the picker is
  open should still bring you back to the PIN screen (that lock is
  intentional).

---

## 2026‑08‑15 (3) · Hardening after real-device feedback: self-check timeout reverted to 40s, lost-ACK dedup (poison-message prevention)

**What was done**
Follow-up to (2) below, prompted by the report "mobile → Wi‑Fi sends
perfectly; Wi‑Fi → mobile takes a few up to 10 seconds": the asymmetry
itself is the expected hard direction (the receiver's hidden service lives
on a mobile radio that idles between packets — a few seconds of radio wake +
Tor round-trip is a physics floor, and ~10s outliers are cold connections
after idle). But walking that path uncovered two real risks worth fixing
immediately:

1. **Self-check timeout back to 40s** (`SELF_CHECK_TIMEOUT_MS`,
   `P2PNetworkManager.kt`). Delivery (2) had shortened the reachability
   probe's timeout to 25s on the reasoning that a healthy own hidden
   service answers quickly — contradicting what `sendViaTor`'s own comment
   has documented all along: an onion rendezvous from a mobile-data client
   often needs MORE than 25s even when healthy. A mobile device could
   therefore declare ITSELF unreachable when merely slow, and the retry
   loop would "fix" that with repeated full Tor bounces — periodically
   nuking that device's circuits, which would hit exactly the direction the
   user reported as slow. Probing all onions in parallel (kept) is what
   fixed the check's duration; the per-probe timeout now matches real
   sends again.
2. **Lost-ACK dedup** (`ingestPacket()`). If a packet is delivered and
   processed but its ACK is lost (timeout or connection cut at the wrong
   moment — a real tail risk on a slow mobile path, where ACKs of up to
   ~10s were just observed against a 15s reuse timeout), the sender retries
   the same bytes. A real message can't be decrypted twice — the Double
   Ratchet has consumed that key — so the retry would fail forever, never
   be ACKed, and (the queue being strictly ordered per contact) permanently
   jam every later message to that contact behind it. This poison-message
   scenario has existed since the ACK queue was introduced; connection
   pooling made it slightly more likely, so it's now closed properly: the
   receiver keeps a bounded LRU of SHA-256 hashes of processed packets
   (2048 entries — more than a full 5 MB file's chunks) and re-ACKs a
   duplicate without reprocessing. Retries resend byte-identical packets,
   and distinct packets can't collide (fresh random AES-GCM IV per packet),
   so the hash is a safe identity.

**Bug / cause**
- (1) was introduced in delivery (2) — caught by re-examining it against
  the code's own documented mobile-rendezvous timing before it caused
  visible damage. (2) is a long-latent design gap, not a new regression.

**Fix**
- See above. No wire-format change; receiver-side only + one constant.

**How to apply**
- Update both devices. **Unverified on real hardware** (no Android SDK
  here); both changes are small and deliberately conservative. On the
  remaining Wi‑Fi → mobile latency: a few seconds steady-state is expected
  physics for a mobile-hosted hidden service; if it regularly exceeds
  ~10s even with the chat open on both sides, report back — the next lever
  would be tuning how the warm-up cadence interacts with the mobile radio,
  which should be decided on real numbers (the debug build logs
  `sendViaTorPooled: ... elapsedMs=...` per send).

---

## 2026‑08‑15 (2) · Optimization: persistent per-contact connections, legacy-onion cleanup, parallel checks, image downscale + EXIF stripping

**What was done**
Four optimizations, in the order proposed and approved ("Mach es in deiner
Reihenfolge"):

1. **Persistent per-contact Tor connections** (`P2PNetworkManager.kt`).
   Previously EVERY packet — every message, and every 4096-byte chunk of a
   file — opened a fresh Tor connection: SOCKS connect → onion rendezvous
   (up to ~20s cold, seconds even warm) → one packet → close. Now the
   receive loop serves many packets per accepted connection, and the send
   side keeps one connection per contact open and reuses it
   (`sendViaTorPooled`); the active chat's existing 20s warm-up dummies ride
   the same connection and double as its keep-open heartbeat. Follow-up
   messages cost one ACK round-trip instead of a fresh rendezvous — this
   directly targets the recurring "~20 seconds even right after a message
   just went through" complaint. File/photo transfers reuse one connection
   for ALL their chunks (previously ~one rendezvous per 4 KB — the dominant
   cost of a transfer). A stale pooled connection is detected by its failed
   exchange (bounded by a 15s reuse timeout, not the 40s setup timeout) and
   replaced with a fresh connection within the same send attempt, so the
   failure mode equals the old per-packet behavior — never worse. The pool
   is dropped wholesale on every network change.
2. **Legacy-onion cleanup** (`TorManager.restoreContactServices()`). Onion
   keys whose contact no longer exists — deleted contacts, plus onions from
   pairings started but never completed under the pre-main-onion flow (their
   keys were persisted immediately under the onion's own serviceId; nothing
   calls that flow anymore) — are now removed for good instead of being
   republished forever. Every such orphan cost keep-alive traffic every 20s,
   slowed the reachability check, and kept an address alive that no contact
   knows. If the contacts DB can't be read, nothing is deleted and
   everything is published (the old behavior) — deletion only happens on
   positive knowledge.
3. **Parallel self-checks** (`P2PNetworkManager.kt`). Both the 20s
   hidden-service keep-alive and `isSelfReachableViaTor()` used to probe the
   device's own onions SEQUENTIALLY with a 40s timeout each — with legacy
   onions present, one reachability verdict could take minutes. Both now
   probe all onions in parallel, and the reachability probe got its own 25s
   timeout (a healthy own hidden service answers well within that; only
   real sends keep the full 40s). Probes deliberately stay on fresh
   one-shot connections — a pooled connection would trivially "pass" the
   very thing the probe exists to test.
4. **Outgoing images: automatic downscale + metadata stripping**
   (`ChatViewModel.kt`). Images sent via the photo path are now re-encoded
   before sending: EXIF orientation applied to the pixels, downscaled to at
   most 2048px on the long edge, JPEG-recompressed stepwise until under the
   2 MB cap — instead of rejecting oversized photos outright. Passing
   through a Bitmap strips ALL metadata the source file carried (EXIF
   including GPS position, XMP, embedded thumbnails), which closes the
   gallery-image metadata leak that STATUS.md tracked as open. Fewer bytes
   also means proportionally fewer 4096-byte chunks — combined with (1),
   photo sending gets much faster. Trade-offs, accepted deliberately:
   animated GIFs are flattened to a still, PNG transparency becomes a solid
   JPEG background, camera photos are re-encoded once more (they had no
   EXIF to strip, but now also get downscaled). Attachments sent via the
   FILE path stay byte-exact by design.

**Bug / cause**
- Not bug fixes — performance/battery/privacy optimizations. (1) and (3)
  directly address the recurring ~20s cold-start reports; (2) removes the
  most plausible remaining amplifier of them; (4) closes a documented
  privacy gap.

**Fix**
- See above. No wire-format change: the per-packet framing
  (wireId + length + packet → ACK) is untouched — only how many packets ride
  one connection changed, and each side degrades gracefully if the other
  still closes per-packet.

**How to apply**
- Update BOTH devices (as always). No re-pairing needed. **Unverified on
  real hardware** — this environment can't compile/run Android code; the
  connection-reuse design was reasoned through carefully against the
  existing socket/ACK/queue code, and its failure path deliberately
  collapses to the previous per-packet behavior. Please test in this order:
  (a) normal text both directions, (b) rapid back-to-back messages — the
  second and later ones should now go out near-instantly while the chat is
  open, (c) a Wi‑Fi↔mobile switch, (d) a photo — should send noticeably
  faster and arrive correctly rotated, (e) if anything misbehaves, paste
  the exact symptom/error and I'll fix it immediately.

---

## 2026‑08‑15 (1) · Fix: reachability retry loop could restart itself indefinitely instead of giving up after ~150s

**What was done**
- Fixed `verifyReachabilityAfterNetworkChange()` in `P2PNetworkManager.kt` so
  it no longer cancels and restarts itself every time its own retry attempts
  bounce Tor.

**Bug / cause**
- `TorManager.forceBounce()` always emits `networkChanged` when it finishes
  (by design — other listeners re-warm the send path and flush the delivery
  queue on every bounce, which is correct). `P2PNetworkManager` also listens
  on `networkChanged` and, among other things, calls
  `verifyReachabilityAfterNetworkChange()` on every emission. But that
  function is exactly the one whose own retry loop calls `forceBounce()` —
  so every bounce the loop triggered as part of trying to fix things fed
  straight back into cancelling and restarting the very same loop, resetting
  its check interval back to 20s and its 150s give-up deadline back to full,
  every single time. A loop that was documented and intended to try for at
  most ~150s and then stop could, in practice, keep re-triggering itself
  indefinitely as long as `isSelfReachableViaTor()` kept failing —
  repeatedly tearing down all of Tor's circuits (`DisableNetwork 1→0`) far
  more often, and for far longer, than intended. Reported for real: near-
  continuous ~20-second cold-start delays on sending, even moments after a
  previous message had just gone through, and one Wi‑Fi/mobile switch that
  took over 20 minutes to recover from instead of the ~2.5-minute ceiling
  this mechanism was always meant to have. Both symptoms line up exactly
  with a retry loop whose 150s cap was silently not being honored.

**Fix**
- `verifyReachabilityAfterNetworkChange()` now no-ops if a check is already
  in flight (`reachabilityCheckJob?.isActive == true`) instead of
  unconditionally cancelling and restarting it. The already-running loop's
  own bounce attempts still fire exactly as before — they're still useful,
  still retrying the actual fix — they just no longer reset the loop's own
  clock. A genuinely new network change arriving mid-retry no longer resets
  the timer either; the in-flight loop's own periodic checks already pick up
  the new network's state on their next iteration, and `TorManager`'s
  existing 2.5s debounce on rapid real network changes already collapses
  most of those into a single bounce before this is even reached.

**How to apply**
- Update the app; no re-pairing needed, no protocol change. **Unverified on
  real hardware** (this environment can't compile/run Kotlin) — reasoned
  through directly from the `MutableSharedFlow`/`collect` wiring in
  `TorManager.kt`/`P2PNetworkManager.kt`, not guessed. Please retest both
  reported symptoms: repeated sends shortly after each other should no
  longer regularly cold-start, and a Wi‑Fi↔mobile switch should recover
  within roughly 2.5 minutes at the outside, not 20+. If ~20s delays still
  happen often even after this fix, the next suspect is a persistently
  unreachable legacy per-contact onion making `isSelfReachableViaTor()`'s
  `.all {}` check fail on every attempt — tapping "Update now" on the
  Contacts screen's migration banner (see the 2026‑08‑14 (5) entry below)
  reduces exposure to that by moving contacts off their legacy onion.

---

## 2026‑08‑14 (6) · New doc: `PRODUCT_CONTEXT.md` — LLM-facing product primer

**What was done**
- Added `unpruuf/PRODUCT_CONTEXT.md`: a single, self-contained document that
  condenses `STATUS.md`, `SECURITY_CLAIMS.md`, `EDITIONS.md` and
  `MARKETING.md` into one primer meant to be fed directly to an LLM (support
  assistant, sales-copy drafter, internal Q&A tool) so it can answer product
  questions accurately without needing the rest of the repo. Covers: what
  unpruuf is, editions/pricing, architecture at a glance, the security-claims
  tiering (provable / architectural / best-effort / explicitly-not-claimed),
  a condensed current-status snapshot, platform detail (Android/iOS/relay),
  current priorities, explicit non-goals, and a quick-answer FAQ. Explicitly
  excludes `PATENT_DISCLOSURE.md`'s content and flags it as confidential,
  legal-use-only, given the public-disclosure risk to patent rights
  documented in that file itself.

**Bug / cause**
- Not a bug fix — a new reference document, requested directly.

**Fix**
- N/A.

**How to apply**
- No code change, no rebuild needed. Feed `PRODUCT_CONTEXT.md` to whichever
  LLM/tool needs product context. Re-sync it whenever `STATUS.md` or
  `CHANGELOG.md` gains a materially new entry (see the document's own §13).

---

## 2026‑08‑14 (5) · Stability: proactive reachability re-check + proactive legacy-onion migration prompt

**What was done**
- Two follow-ups to the network-switch reliability work in entries (1)-(4)
  below, requested after those fixes were confirmed working on real devices:
  1. **Proactive reachability re-check.** Previously, the self-verifying
     reachability check (`verifyReachabilityAfterNetworkChange()`) only ever
     ran *reactively*, triggered by an OS network-change callback. Added
     `startPeriodicReachabilityCheck()` in `P2PNetworkManager.kt`: every 4
     minutes, independent of any network-change event, it re-runs the same
     real self-connect check and — if it fails — kicks off the same
     bounce/retry loop the reactive path already uses. Skips the check (not
     the loop) while a reactive recovery from an actual network-change event
     is already running, so the two never fight each other the way the
     earlier over-aggressive-bounce regression did.
  2. **Proactive legacy-onion migration prompt.** The existing
     `sendMainOnionUpdate()` fix (migrates a contact off this device's old
     per-contact onion) was only reachable via a manual per-chat "Sync"
     button — easy to never notice. `TorManager` now exposes
     `legacyPairedContactIds` (a `StateFlow` mirroring which contacts this
     device still separately republishes a legacy per-contact onion for —
     populated by the same `restoreContactServices()` that already
     re-publishes them on every startup). The Contacts screen combines that
     with the live contact list and shows a dismissible banner ("N contacts
     may have an outdated address for this device — Update now / Not now")
     whenever it's non-empty, migrating every affected contact in one tap
     instead of requiring a per-contact button press to be noticed.

**Bug / cause**
- Not a bug fix — both are proactive hardening requested after "Jetzt
  scheint es erstmal zu gehen... Was kann man noch verbessern, um die
  Verbindung noch sicherer, noch stabiler zu machen?" (the network-switch
  fix chain in entries (1)-(4) is confirmed working; this closes two gaps
  those fixes didn't cover: silent staleness with no network-change event
  at all, and a migration path that existed but required the user to find
  it themselves).

**Fix**
- See "What was done" above. Both are additive: no wire-protocol change, no
  change to the existing reactive network-change path, no re-pairing needed.
  `sendMainOnionUpdate()`'s own defensive checks (onion-shape validation
  before ever writing to the DB) are unchanged and still apply to messages
  sent via this new proactive path.

**How to apply**
- Update the app; no re-pairing needed. **Unverified on real hardware** —
  this environment can't run/compile Kotlin — reasoned through carefully
  against the existing (already device-confirmed) reachability-check and
  `sendMainOnionUpdate()` code paths, which this reuses rather than
  duplicates. Please retest: (a) that a genuinely stale connection recovers
  within a few minutes even with no Wi‑Fi/mobile switch involved, and (b) that
  the Contacts screen banner appears for a device that has an old pairing and
  that "Update now" clears it.

---

## 2026‑08‑14 (4) · Fix: reachability check could report "fine" while the onion that matters was still down

**What was done**
- Fixed a false-positive in the reachability check the last two fixes
  added — it could conclude "we're reachable again" and stop retrying,
  while the specific onion address a contact was actually trying to
  reach was still unpublished.

**Bug / cause**
- Reported: two phones, both on mobile data; one (an S23) switches back
  to Wi‑Fi. After that: it can send fine, but can't receive from the
  other phone (still on mobile) at all.
- Cause: a device can have more than one onion address — the main one
  (what fresh pairings use) plus any leftover legacy per-contact ones.
  `isSelfReachableViaTor()` used `.any {}` — true the moment *any one* of
  them answered. If a legacy onion happened to come back up while the
  main onion (the one the actual contact was using) stayed down, the
  retry loop wrongly declared victory and stopped bouncing — silently
  leaving the one address that mattered broken.

**Fix**
- Changed to `.all {}` — every onion address this device has must answer
  before the check counts as reachable. A device with only the main
  onion (the common case for a fresh pairing) behaves exactly as before;
  this only changes anything for devices that also carry legacy
  per-contact onions.

**How to apply**
- Update the device(s) that saw this. No wire-protocol change, no
  re-pairing needed. Please retest the exact scenario again — this is a
  well-reasoned fix for a real logic gap, but which onion address the
  S23 in this report actually has (main-only vs. also legacy) wasn't
  confirmed, so it's not certain this is the *whole* explanation.

---

## 2026‑08‑14 (3) · Fix: ~1 minute receive latency on mobile data, every message

**What was done**
- Tightened the own-hidden-service keep-alive interval from 60s to 20s.

**Bug / cause**
- Reported for real: after the previous two fixes, sending on mobile data
  worked fine, but *receiving* consistently took about a minute per
  message — steady-state, not just right after a network switch, and not
  helped by having just sent a message moments before (sending and
  receiving use different Tor circuits/introduction points, so a warm
  send path doesn't keep the receive path warm).
- The ~1-minute figure lines up almost exactly with `startOnionKeepAlive`'s
  60s interval — the mechanism that keeps this device's own hidden
  service warm by self-connecting to it periodically. On mobile data
  specifically (unlike Wi‑Fi, which Android doesn't throttle the same
  way), the receive path apparently goes cold *between* those pings, so
  an incoming message has to wait out roughly one keep-alive cycle before
  the introduction points are live again.

**Fix**
- `startOnionKeepAlive()`'s interval: 60s → 20s, matching
  `startActiveChatWarmup`'s already-established cadence for the send-side
  equivalent. Trades a bit more background battery/network use for
  meaningfully lower worst-case receive latency on mobile — reasonable
  for a messaging app where "does the message actually arrive promptly"
  is the whole point.

**How to apply**
- Update the device(s) that saw this. No wire-protocol change, no
  re-pairing needed. Please retest receiving on mobile data again —
  reasoned through the timing correlation (60s interval ≈ 1 min observed
  delay), not independently verified beyond that on a real device.

---

## 2026‑08‑14 (2) · Fix v2 regression: sending stuck for minutes after a network switch

**What was done**
- Fixed the previous delivery's reachability-verification loop actively
  fighting the delivery it was trying to help.

**Bug / cause**
- Reported for real: receiving on mobile data now worked almost instantly
  (the fix helped there), but sending was then stuck for close to 5
  minutes.
- Cause: the verification loop checked every 5s and re-bounced Tor
  (`DisableNetwork 1→0`) on every failure. A bounce tears down **all** of
  Tor's circuits, not just the hidden-service publish path — and that
  publish is documented to normally take 10-30s on its own. Checking
  every 5s meant the loop was almost always re-bouncing Tor before the
  *previous* bounce had a real chance to finish, which also killed
  whatever outgoing send happened to be in flight at that moment
  (including the delivery queue's own retries) — the fix meant to help
  reachability was itself the thing repeatedly interrupting sends.

**Fix**
- The check interval now starts at 20s (comfortably past the documented
  publish time) and backs off further from there (up to 45s), so each
  bounce gets a real, mostly-uninterrupted window to succeed or genuinely
  fail before another one is even considered. Total give-up ceiling
  extended slightly (~2.5 min) to still allow a few real attempts at the
  new, slower pace.

**How to apply**
- Update the device(s) that saw this. No wire-protocol change, no
  re-pairing needed. Please retest the same network switches again — this
  is reasoned through the mechanics of what went wrong (confirmed by the
  report, not guessed), but the exact new timing still can't be verified
  without a real device.

---

## 2026‑08‑14 · Fix v2: still no messages after Wi‑Fi → mobile switch — make the recovery self-verifying

**What was done**
- Replaced the previous fix's fixed bounce schedule with one that actively
  proves the network-change recovery actually worked, and keeps retrying
  until it does (or gives up after ~2 minutes).

**Bug / cause**
- Reported again on a **fresh install and fresh pairing** (not stale state
  from an older build) — confirming the earlier fix (gate the bounce on
  `NET_CAPABILITY_VALIDATED`) genuinely wasn't enough on its own, not just
  under-tested. Two-device test: tablet stayed on Wi‑Fi throughout: phone
  switched Wi‑Fi → mobile data — nothing arrived at the phone anymore, and
  everything sent from it took minutes.
- The previous fix bounced Tor once (plus one blind extra bounce ~20s
  later) and just hoped that was enough — with no way to know whether the
  hidden service actually came back up. If the timing was still off (a
  validated network isn't a guarantee the *hidden-service publish path*
  specifically is ready yet — that's a separate, slower step), nothing
  would ever try again.

**Fix**
- `P2PNetworkManager` now reacts to a network change by actively checking:
  a **real self-connect through the published hidden service** — the same
  code path a contact's incoming connection takes, reusing the same
  self-connect technique the existing keep-alive already uses, just with
  the result actually checked instead of fire-and-forget. If that check
  fails, it asks `TorManager` for another bounce (new
  `TorManager.forceBounce()`) and tries again with backoff (5s → 20s cap),
  until the self-connect succeeds or ~2 minutes pass.
- Simplified `TorManager`'s own bounce scheduling back to one bounce per
  detected switch — the blind "bounce twice at fixed delays" guess from
  the previous fix is no longer needed now that something actually
  verifies the result and asks for more if needed.

**Also worth checking, separately from this code fix:** Android has a
per-app "unrestricted mobile data" setting (distinct from the battery-
optimization exemption this app already asks for), sometimes tied to Data
Saver, that can throttle or block an app's network access specifically on
cellular data while leaving Wi‑Fi untouched — which would produce exactly
this symptom (fine on Wi‑Fi, broken on mobile) with no code fix able to
help at all. Worth a quick look in Settings → Apps → unpruuf → Mobile
data & Wi‑Fi while re-testing this.

**How to apply**
- Update the device(s) that saw this. No wire-protocol change, no
  re-pairing needed. Please re-test the exact same Wi‑Fi → mobile switch
  — this is reasoned through the code and the individual pieces (bounce,
  self-connect, backoff) are each proven patterns already used elsewhere
  in this app, but the *combination* reacting to a real network handoff
  can't be verified without a real device.

---

## 2026‑08‑13 (7) · build-exe.js: run npm install automatically if needed

**What was done**
- `npm run build:exe` now checks for its own dependencies first and runs
  `npm install` itself if they're missing, instead of failing partway
  through with a confusing error.

**Bug / cause**
- Real error from a real Windows run: `tsc` not found, right after the
  previous EINVAL fix. Cause: `node_modules` wasn't installed yet in the
  `server` folder for this delivery (a fresh ZIP replaces the whole
  folder, so a new `npm install` is needed each time dependencies
  change — this delivery added `esbuild`/`postject`). `npm run build`'s
  `tsc` call failed since there was nothing in `node_modules/.bin` to
  find.

**Fix**
- `build-exe.js` now checks whether `node_modules/typescript` exists
  before doing anything else, and runs `npm install` itself first if not.

**How to apply**
- Get the updated `server/` folder, run `npm run build:exe` again — no
  separate manual `npm install` needed now, the script handles it.

---

## 2026‑08‑13 (6) · Fix build-exe.js: EINVAL spawning npm.cmd on Windows

**What was done**
- Fixed `npm run build:exe` failing on its very first step on a real
  Windows machine.

**Bug / cause**
- Real error from a real Windows run: `Error: spawnSync npm.cmd EINVAL`.
  `build-exe.js` spawned `npm.cmd` (npm's actual executable name on
  Windows — it's a batch script, not a real `.exe`) directly via
  `execFileSync`. Windows can only run batch scripts through a shell
  (`cmd.exe`), not by executing them directly the way a real `.exe` can
  be — spawning one without `shell: true` fails this way. The Linux
  testing this was verified against before shipping used `npm` (no
  `.cmd`, a real executable there), which is exactly why this didn't show
  up until a real Windows run.

**Fix**
- `run()` now takes an options bag and the `npm run build` call passes
  `{ shell: true }` on Windows (`{ shell: false }`, i.e. unchanged
  behavior, on Linux/Docker — nothing else uses this path). Simplified to
  just `"npm"` instead of manually picking `npm`/`npm.cmd` — with
  `shell: true`, the shell itself resolves that the same way typing
  `npm run build` at a real prompt would. The later `postject`/`node`
  steps spawn a real `.exe` (Node itself) and don't need this.

**How to apply**
- Get the updated `server/` folder, re-run `npm run build:exe`. This
  only affects the exe-build tooling — no change to the relay itself, no
  wire-protocol impact, nothing to re-pair.

---

## 2026‑08‑13 (5) · Relay node: standalone .exe (no Node.js install needed to run it)

**What was done**
- New `npm run build:exe` produces a single `unpruuf-relay.exe` that needs
  **no Node.js install on the machine that runs it** — only Node.js has to
  be present once, to build it (e.g. on Gabriel's machine), then the
  resulting `.exe` can be handed to anyone else with nothing to install at
  all. Combined with the previous delivery's automatic Tor download, the
  full relay setup for a recipient is now: double-click, done.
- This was built and verified for real this time, not just reasoned
  through — see `server/EXE_BUILD.md`'s "What's actually been verified vs.
  not" section for exactly what was and wasn't testable without a real
  Windows machine.

**Bug / cause**
- Not a bug fix — a follow-up to "Das kann ich keinem zumuten" (I can't ask
  this of anyone) about the remaining Node.js-install step after the Tor
  download was already automated.
- One real bug *was* found and fixed along the way, caught only by actually
  running the built exe end-to-end against a real download: the Tor
  auto-download's file-copy step used `fs.copyFileSync` in a loop, which
  throws `EISDIR` on the bundle's `pluggable_transports/` subdirectory
  (obfs4proxy/snowflake-client binaries) — not just files. Switched to
  `fs.cpSync` with `recursive: true`. Confirmed fixed by re-running the
  real download afterward.

**Fix**
- Uses Node's own "Single Executable Application" feature: bundles the app
  into one file (`esbuild`), then `postject` injects it into a copy of the
  Node binary that ran the build — a real `node.exe` with the app baked
  in, not an emulation. Verified this whole pipeline works, live, against
  a trivial test program before touching the real app.
- The one thing that can't be embedded this way is `better-sqlite3`'s
  compiled native addon — new `sea-entry.ts`/`sqliteNativeBinding.ts`
  handle loading it back from a sibling file at runtime. This needed a
  real fix along the way too: a plain `require()` inside a SEA blob only
  resolves Node's own built-ins and throws `ERR_UNKNOWN_BUILTIN_MODULE`
  for anything else (confirmed directly) — `module.createRequire()` gives
  back an unrestricted one, which gets handed to `better-sqlite3` through
  its own supported `nativeBinding` constructor option. Verified with a
  real SQLite write+read round-trip through the built exe, not just "it
  didn't crash."
- `blobStore.ts` needed one small, backward-compatible change (an optional
  native-binding override, unused — and behaviorally identical to
  before — by every other entry point: Docker, `npm start`,
  `start-windows.bat`).

**How to apply**
- This is opt-in tooling, not a change to the existing relay itself —
  `start-windows.bat`/Docker deployments are completely unaffected. To
  build the exe: `npm install && npm run build:exe` on a Windows machine
  with Node.js, then see `server/EXE_BUILD.md` for what to hand out and
  what still needs a real Windows run to confirm.

---

## 2026‑08‑13 (4) · Relay node (Windows): auto-download Tor instead of a manual step

**What was done**
- `start-windows.bat` now downloads and installs Tor itself on first run.
  Setting up the relay node is down to: install Node.js, double-click the
  `.bat`. Nothing else to find or extract by hand.

**Bug / cause**
- Feedback: "Das kann ich keinem zumuten" (I can't ask this of anyone) — the
  manual step (find the Tor Expert Bundle on torproject.org, extract it into
  a specific folder) was too much friction, made worse by the download page
  itself: it now shows only a big, prominent Tor Browser button, with the
  Expert Bundle buried in a small technical table further down. The
  reporter only found the Browser option — this turns out to be a common
  complaint (confirmed via the Tor Project's own forum, a thread titled
  exactly "Downloading Tor Expert Bundle for Windows (x86_64)").

**Fix**
- New `torDownload.ts`: if `windows/tor/tor.exe` isn't there yet,
  downloads the official Windows Expert Bundle straight from
  `archive.torproject.org` (verified this URL by fetching the actual
  current download page, not guessed), extracts it with Windows' own
  built-in `tar.exe` (no new npm dependency), and installs it into
  `windows/tor/` — exactly where the existing manual instructions already
  said to put it, so nothing else in the codebase had to change.
  `--tor-exe`/`TOR_EXE_PATH` still work exactly as before and skip the
  download entirely if you'd rather point at your own copy (e.g. one
  already inside a Tor Browser install).
- If the download or extraction fails (blocked network, very old Windows),
  it prints the exact URL and target folder so the previous manual path
  still works as a fallback — this isn't a hard requirement, just a
  friction-remover.
- New tests for the pure part of this (`torDownload.test.ts`) — the
  network download and `tar.exe` extraction themselves aren't something
  `npm test` can exercise here, same reasoning as `windowsTor.test.ts`'s
  existing real-Tor-process tests.

**How to apply**
- Get the updated `server/` folder, run `start-windows.bat` as before.
  First run will take a bit longer (downloading Tor, one time only). No
  wire-protocol change — devices already paired to this relay don't need
  to do anything.

---

## 2026‑08‑13 (3) · Fix: no messages received at all after switching from Wi‑Fi to mobile data

**What was done**
- Changed when `TorManager` bounces Tor after a network change (the mechanism
  that forces the hidden service to republish so the device stays reachable).

**Bug / cause**
- Reported on a Pixel 9 Pro: switching from Wi‑Fi to mobile data left the
  device completely unreachable — no incoming messages ever arrived — while
  sending recovered on its own after about 1-2 minutes.
- Cause: the bounce fired on `onAvailable()`, which Android calls as soon as
  it considers a network the new default — for a cellular radio waking up
  and attaching to a tower, that can be *before* the link actually has
  working connectivity. Bouncing Tor at that moment makes the one hidden-
  service republish attempt fail. Sending recovers anyway because Tor's own
  client-side circuit building keeps retrying on its own; the hidden-service
  descriptor has no equivalent automatic retry, so it just stays stale for
  that network path — explaining exactly the asymmetry reported (sending:
  slow but works; receiving: nothing, ever).

**Fix**
- The bounce now waits for Android's own `NET_CAPABILITY_VALIDATED` signal
  (its DNS+HTTP probe confirming the new network genuinely works) before
  firing, instead of the bare "network is now default" signal. An 8s
  timeout fallback still bounces even if that validation signal never
  arrives, so networks where Android's validation heuristic is unreliable
  don't regress to no-bounce-at-all.
- Added one bounded follow-up bounce ~20s after the first, as a cheap
  safety net in case even the validated bounce still lands too early on a
  slow-attaching cellular link.

**How to apply**
- Update the device(s) that saw this. No wire-protocol change, no
  re-pairing needed. Please re-test the exact Wi‑Fi → mobile switch that
  triggered this — this is reasoned through the code, not verified against
  a real cellular handoff (can't be, in this environment).

**What was done**
- Fixed all 8 compile errors reported by an actual Android Studio build of
  `PluggableTransportManager.kt` (the dependency itself now resolved after
  the previous fix in this file's history — this is the next layer down:
  the Kotlin code calling into it).

**Bug / cause**
- `object : IPtProxy.OnTransportEvents` didn't resolve. `OnTransportEvents`
  turns out to be a top-level type directly in the `IPtProxy` package, not
  nested inside a class also named `IPtProxy` the way the project's own
  README sample implied (that sample apparently doesn't match the actual
  package layout of the `5.5.1` version this app depends on).
- `controller.port(name)` does exist (confirmed — no "unresolved reference"
  against it) but returns `Long`, not `Int` as guessed, causing a type
  mismatch.
- `SnowflakeProxy.frontDomain` and `proxy.port` don't exist at all
  (confirmed unresolved) — `capacity`/`brokerUrl`/`relayUrl`/`stunServer`
  do exist and were left as-is.

**Fix**
- Import `OnTransportEvents` directly (not nested under `IPtProxy.`) and
  reference it unqualified in the callback object literal.
- `controller.port(...)` results converted with `.toInt()`.
- Removed `frontDomain` (an optional domain-fronting field with no
  confirmed real name — dropping it doesn't break basic Snowflake
  connectivity, just one obfuscation refinement). Set `capacity = 0`
  (client-only — the earlier `1L` would have opted this device into acting
  as a public Snowflake relay for others without the user's consent, which
  isn't something to do silently).
- Replaced `proxy.port` with `controller.port("snowflake")`, on the theory
  both transports expose their port through the same `Controller` call
  obfs4 already confirmed works. **This one is still unconfirmed** — flagged
  clearly in the file's doc comment as the most likely remaining thing to
  need a fix if Snowflake specifically doesn't come up, isolated to one line.

**How to apply**
- Update Android, clean Gradle sync + rebuild. If Snowflake bridges don't
  actually connect (obfs4 should now be on solid ground), paste back
  whatever `controller.port("snowflake")` actually returns/throws, or the
  result of Ctrl-clicking into `SnowflakeProxy` in Android Studio. No
  wire-protocol change, no re-pairing needed.

---

## 2026‑08‑13 · Fix obfs4/Snowflake build failure: wrong Gradle coordinate + wrong API shape

**What was done**
- Fixed the Gradle dependency for IPtProxy (obfs4/Snowflake pluggable transports,
  from the 2026-08-12 "Pro improvements" delivery): it now resolves.
- Rewrote `PluggableTransportManager.kt`'s calls into IPtProxy to match the
  library's real API shape.

**Bug / cause**
- `implementation("org.torproject:iptproxy:3.4.0")` failed to resolve
  (`Could not find org.torproject:iptproxy:3.4.0` — confirmed from the
  Android Studio build log). That coordinate never existed — I guessed it
  without being able to verify against any package registry, and it was
  simply wrong on both the group and the version. Real research this time
  (fetching the project's own README from github.com/tladesignz/IPtProxy)
  found the actual Maven Central coordinate is `com.netzarchitekten:IPtProxy`,
  currently at `5.5.1`. The same wrong guess also meant the Kotlin code
  calling into it (`IPtProxy.IPtProxy.startObfs4Proxy(...)`, a static
  function) was calling an API that doesn't exist either — IPtProxy's real
  shape is a `Controller` class (constructed with a state directory,
  logging flags, and an `OnTransportEvents` callback) plus a `SnowflakeProxy`
  class configured via mutable properties, confirmed against the same
  README's Kotlin usage example.

**Fix**
- `app/build.gradle.kts`: coordinate corrected to
  `com.netzarchitekten:IPtProxy:5.5.1`.
- `PluggableTransportManager.kt`: rewritten around the confirmed
  `Controller`/`OnTransportEvents`/`SnowflakeProxy` classes. **Still not
  100% confirmed:** the exact method to start a named transport
  (`controller.start(name, bridges)`) and to read back its local port
  (`controller.port(name)`, `proxy.port`) — the project's own docs don't
  spell these two out in prose, only the constructor/property shapes above.
  These are this file's best-informed guess, clearly flagged in its doc
  comment. All existing safety behavior is unchanged: a transport that
  fails to start (wrong method name included) is simply absent from the
  result, and `TorManager.applyBridges()` falls back to `UseBridges 0`
  exactly as before.

**How to apply**
- Update Android, do a clean Gradle sync. The dependency itself should now
  resolve. If `controller.start`/`controller.port`/`proxy.port` show as
  unresolved in Android Studio, autocomplete on `controller.` (or
  Ctrl/Cmd-click into the `Controller` class) will show the real method
  names immediately — paste those back and it's a one-file fix, same as
  before. No wire-protocol change, no re-pairing needed.

---

## 2026‑08‑14 · iOS: first working app shell (UnpruufCore + UnpruufApp)

*Date is a best estimate, not a confirmed one — this entry originally shipped with no dated
header at all, landing sometime between the 2026‑08‑13 and 2026‑08‑19 entries surrounding it
(fixed 2026‑08‑24, alongside an updated iOS plan — see that entry for detail).*

**What was done**

A first working shell of the iOS app designed in `CROSS_PLATFORM_PLAN.md`,
delivered at `unpruuf/ios/`. This is a **new, separate app** for the
relay-mandatory cross-platform mode — not a port of Android Pro's direct-P2P
design, since iOS can't sustain a persistent background hidden service.
Android is unchanged by this delivery (its own cross-platform-mode companion
work — per-contact node assignment, "Wechsel," trusted-node list — is
deliberately scoped as a separate future task, so **iOS cannot yet pair with
Android**, only with another instance of itself).

- **`UnpruufCore`** (Swift Package, zero UIKit/SwiftUI/Tor dependency): direct
  ports of `DoubleRatchet.kt`, `RatchetHeader.kt`, `RatchetFrame.kt`,
  `MessagePayload.kt`, `NetworkObfuscation.kt`, and the AES-GCM half of
  `CryptoManager.kt`, using CryptoKit for every primitive it has natively
  (X25519, HKDF, HMAC-SHA256, AES-GCM) plus CryptoSwift for the one gap —
  XChaCha20-Poly1305 (CryptoKit only has the 12-byte-nonce IETF variant).
  Also new: `Identity.swift` (wire-tag math adapted for manual rotation —
  see below), `ControlSignals.swift`, `RelayConnectionString.swift`, and
  `PairingPayload.swift` (the new cross-platform QR format). An XCTest
  suite mirrors the existing Kotlin JUnit suite case-for-case.
- **Wire-tag rotation, finalized:** `CROSS_PLATFORM_PLAN.md` said rotation
  becomes "manual, same formula" but never specified what replaces Android's
  hour bucket. This delivery finalizes it: a per-pair, per-direction
  monotonic **generation counter**, propagated via a new
  `UNPRUUF_WECHSEL_V1:<generation>:<relayConnectionString>` control signal
  sent through the same outer envelope every other packet uses. Written
  back into `CROSS_PLATFORM_PLAN.md` as the authoritative spec.
- **`UnpruufApp`** (loose Swift source, not a pre-built `.xcodeproj` — see
  "How to apply"): Keychain-backed identity/ratchet-session storage, an
  AES-GCM-encrypted contacts file (no SQLCipher-for-iOS dependency needed),
  RAM-only messages, a hand-rolled SOCKS5+HTTP/1.1 client for the relay
  (`SocksHTTPClient.swift` — iOS's `URLSession` has no supported SOCKS5
  proxy path), a `TorController.swift` wrapping Guardian Project's
  `Tor.framework`, and SwiftUI screens for pairing (native `VisionKit` QR
  scanning, no third-party dependency), the contact list, text chat, and
  settings.

**Bug / cause** — not a bug fix; this is new-platform work following
`CROSS_PLATFORM_PLAN.md`'s design, which explicitly called itself "a design
decision, not a build" until now.

**Fix** — n/a (see "What was done").

**How to apply**

This delivery **cannot be compiled or run in the environment that produced
it** — no Mac, Xcode, or Swift toolchain was available. Everything here is a
careful, best-effort port, most confident in `UnpruufCore` (a direct,
mechanical translation of already-working, already-tested Kotlin) and least
confident in `TorController.swift` and `SocksHTTPClient.swift` (genuinely
new code with no equivalent to copy from, written against APIs that
couldn't be verified). See `unpruuf/ios/README.md` for the exact Xcode
setup recipe and a ranked list of what's most likely to need fixing first.
**Paste back the exact compiler error for anything that doesn't build** —
each risk area is deliberately isolated to one file so a fix stays
contained. `swift test` inside `unpruuf/ios/UnpruufCore/` is the fastest way
to validate the core once any Mac is available, and doesn't need a full
Xcode project.

---

## 2026‑08‑12 · Pro improvements: send-timing debug logs, backoff/padding tests, in-app onion migration, obfs4/Snowflake wiring

**What was done** — items 2–5 of the "top 5 things to improve unpruuf Pro" list
(item 1, real-device verification of the merged Double Ratchet/relay/chunking
code, is out of scope here — it needs an actual phone, which this environment
doesn't have):

1. **Debug-only Tor send timing** (`P2PNetworkManager.attemptDelivery`) — in
   debug builds only (`BuildConfig.DEBUG`), every Tor send now logs its
   elapsed time and whether the target contact's circuit was expected to be
   pre-warmed (`isWarmPath`), via `Log.d`. **Local logcat only, never
   transmitted anywhere** — this exists purely so future warm-up interval
   tuning can be based on real numbers from real devices instead of guesses.
   Release builds are unaffected (the whole block is skipped).
2. **Automated tests for the delivery queue and packet padding** — two areas
   that had zero test coverage, unlike the newer ratchet/chunking/relay code:
   - `flushQueue()`'s inline backoff-doubling was extracted into a pure
     `P2PNetworkManager.nextBackoff()` so it's unit-testable without
     Tor/coroutines/Android. New: `P2PNetworkManagerBackoffTest.kt`.
   - New: `NetworkObfuscationTest.kt` — pad/unpad round-trips at the boundary
     sizes (empty, largest payload that still fits, one byte over the limit,
     wrong packet size on unpad).
   - **Scope note:** wire-ID resolution (`IdentityManager`) was *not* added
     to this pass — it's built directly on `Context`/`SharedPreferences`, so
     testing it properly would mean adding Robolectric as a new test
     dependency, which wasn't done without being able to verify it actually
     works in this environment. Flagging this rather than silently skipping
     it.
3. **In-app "send updated connection info"** — closes the address-isolation
   gap in `SECURITY_CLAIMS.md` §8 without requiring delete + re-pair:
   - New `ContactDao.updateOnionAddress()`.
   - New `P2PNetworkManager.sendMainOnionUpdate()`: sends the device's
     current main onion (`TorManager.ensureMainOnion()`) to a contact over
     the already-encrypted channel, as a new prefixed control signal
     (`UNPRUUF_MAIN_ONION_V1:`). The receiving side validates the address is
     a well-formed v3 onion ID before writing it (`ingestPacket()`).
   - New sync icon button in the chat screen's top bar
     (`ChatViewModel.sendConnectionInfoUpdate()`); non-destructive, no
     confirmation dialog. Delete + re-pair still works too, unchanged.
4. **obfs4/Snowflake pluggable-transport wiring** via IPtProxy, using the
   hook that was already sitting in `TorManager.applyBridges()`:
   - New `PluggableTransportManager.kt` — the only file that calls directly
     into the IPtProxy library, deliberately isolated so a fix stays
     contained if its API doesn't match what actually resolves.
   - `TorManager.applyBridges()` now starts whichever PT client(s) the
     user has bridge lines configured for, and only adds
     `ClientTransportPlugin`/PT `Bridge` lines for a transport that actually
     reports a live local port. The existing safety fallback — `UseBridges 0`
     if nothing usable is actually available — is fully preserved; Tor is
     never left in a half-configured bridge state.
   - New Gradle dependency `org.torproject:iptproxy:3.4.0`.
   - **⚠️ Unverified against a real build.** This environment has no Android
     SDK/Gradle, so neither the IPtProxy API calls in
     `PluggableTransportManager.kt` nor the Maven coordinate itself could be
     compiled or confirmed. **If Android Studio reports an error here, paste
     it back — the fix is contained to that one file** (or the version
     number in `app/build.gradle.kts`) and won't touch anything else.

**Bug / cause** — not a bug fix; these are the four concrete improvement
items from the prioritized "top 5" review, each addressing a real gap
identified by reading the current code (missing timing data, zero test
coverage on foundational delivery logic, a manual-only fix for the address-
isolation trade-off, and an unfinished censorship-circumvention hook).

**Fix** — see the four numbered points above.

**How to apply**
- Update both devices. Items 1–3 don't change the wire protocol — no
  re-pairing needed.
- Item 4 changes Gradle dependencies — **do a clean Gradle sync first** and
  report any resolution/compile error from `org.torproject:iptproxy` or
  `PluggableTransportManager.kt` so it can be fixed immediately. If obfs4/
  Snowflake bridges aren't configured (Settings → Censorship
  Circumvention), none of this new code path runs at all.
- STATUS.md and SECURITY_CLAIMS.md §8 updated to reflect all four changes.

---

## 2026‑08‑12 · Inconsistent send delay (20s to several minutes)

**What was done**
- The active-chat warm-up now keeps warming the most recently open chat's
  send path for 2 minutes after that chat is left, instead of stopping the
  instant it's closed.

**Bug / cause**
- Sending to Pro sometimes took ~20s, sometimes 1–2 minutes, sometimes
  several minutes — inconsistently, not reliably improving after the first
  successful send. Cause: `ChatViewModel.onCleared()` calls
  `setActiveChat(null)` the moment a chat screen is left (switching to the
  contacts list, briefly backgrounding), which immediately stopped the
  every-20s warm-up for that contact. Coverage then fell back to the much
  sparser randomized dummy-traffic loop (every 45–240s, with a random skip
  built in for traffic-analysis resistance) — nowhere near frequent enough
  to keep a Tor circuit from going idle. The next real message then paid a
  full cold-start, and if that attempt was slow enough to hit the (correctly
  generous, previously tuned) 40s connect timeout, the delivery queue's
  retry — another up-to-40s attempt plus backoff — is exactly how a single
  slow send stretches into minutes.

**Fix**
- Leaving a chat now starts a 2-minute grace window during which that
  contact keeps getting warmed every 20s, same as while the chat was open.
  Purely additive — doesn't touch the connect timeout (already correctly
  tuned in an earlier fix) or reduce dummy-traffic coverage for other
  contacts.

**How to apply**
- Update both devices. No re-pairing needed — this only changes when warm-up
  runs, not the wire protocol.

---

## 2026‑08‑07 (4) · File/photo transfers now work over the relay too

**What was done**
- Chunked file/photo transfers are now relay-eligible, on top of text and
  control signals — closes the gap `server/README.md`'s "Scope" section
  used to document deliberately: a large file whose direct delivery keeps
  failing (peer offline, Tor unreachable) now falls back to the relay
  chunk-by-chunk, exactly like a text message already did.
- `RatchetFrame.Frame.ChunkCont` now carries an **explicit chunk index**
  instead of relying on arrival order — required for this to be safe (see
  "Bug / cause"). `RatchetFrame.split`/`encode`/`decode` updated to match;
  this is a wire-format change (see "How to apply").
- Receive-side reassembly (`P2PNetworkManager.ChunkReassembly`) now
  buffers pieces by index in a pre-sized slot array instead of an
  append-in-arrival-order list, and tolerates a duplicate/retransmitted
  chunk arriving twice.
- Relay capacity raised to match: `MAX_BLOBS_PER_TAG` 200 → 1500 (server),
  covering the ~1311 chunks a full 5 MB file produces.
- `RelayClient`'s HTTP response size cap raised: 512 KB → 12 MB — a fully
  relay-delivered 5 MB file's `GET /v1/fetch` response (all chunks
  base64'd into one JSON array) is itself ~7 MB, far past the old cap.

**Bug / cause**
- Two real bugs found while working through this change, before either
  shipped:
  1. **Silent reordering risk.** `ChunkCont` frames had no index — the
     previous design safely relied on direct delivery's guaranteed
     in-order arrival (the delivery queue never attempts a later frame to
     a contact once an earlier one has failed that round). That guarantee
     doesn't hold once the relay is in the mix: it's a *polled* mailbox,
     and a transfer spanning an hourly wire-tag rotation could have its
     later chunks fetched *before* its earlier ones, since the receive
     poll loop doesn't check tags in chronological order. Appending
     pieces in arrival order would have silently corrupted the
     reassembled file with no error. Fixed by adding the explicit index
     and switching reassembly to index-based buffering.
  2. **Fetch response truncation.** `RelayClient`'s `MAX_RESPONSE_BYTES`
     was 512 KB — sized for a handful of small text-message blobs, never
     revisited for a scenario where a whole file sits in the relay at
     once. A response over that cap was silently treated as empty
     (`n = 0`), meaning every chunk relayed for a large file would have
     been dropped without any error surfaced anywhere. Fixed by raising
     the cap with a documented, computed worst case instead of guessing.

**Fix**
- See "What was done" for each. Verified by real execution, not just
  reasoning: `RatchetFrameTest` gained cases for out-of-order arrival
  (frames shuffled before reassembly), duplicate-chunk tolerance, the
  exact 5 MB/1311-chunk boundary, and malformed-index rejection — run
  standalone against the real compiled code (10/10 passing). Server-side
  `blobStore.test.ts` gained a regression test asserting the capacity
  constant can never quietly drop back below the worst-case chunk count
  (32/32 `npm test` passing).

**How to apply**
- Update **all** devices — this is a wire-format change
  (`RatchetFrame.Frame.ChunkCont`'s encoding gained a 4-byte index field).
  A device on the previous version cannot decode chunked transfers from
  an updated one and vice versa; single-packet text messages are
  unaffected either way. No re-pairing needed — only the chunk framing
  changed, not the ratchet/pairing layer. If a self-hosted relay is in
  use, no server action needed — `MAX_BLOBS_PER_TAG` takes effect on next
  restart with no data migration.

---

## 2026‑08‑07 (3) · New doc: cross-platform (iOS+Android) node/rotation plan

**What was done**
- Added `CROSS_PLATFORM_PLAN.md`, capturing the design worked out for a
  future iOS+Android-compatible product line, kept separate from unpruuf
  Pro rather than unifying onto it. Covers: why Pro (Android-only, direct
  P2P, automatic hourly wire-ID rotation) stays exactly as shipped and
  unaffected; the new cross-platform mode's mandatory-relay model, manual
  per-contact "Wechsel" onion/ID rotation (same shared factor/key, no
  re-pairing, propagated as a normal encrypted message), trusted-node list
  with liveness-based auto-selection, per-contact node assignment with a
  temp-node override that self-reverts on TTL expiry or unreachability,
  why Tor is not dropped for iOS (only the persistent background listener
  is impossible, not Tor itself — foreground-scoped via an embeddable Tor
  framework stays viable), and the GDPR ownership posture (NexonAI as pure
  software vendor, never operating node infrastructure — each node's legal
  responsibility follows its operator).

**Bug / cause**
- Not a bug — a planning document, no code changed. Written down because
  the design was worked out across a long conversation and needed a
  durable home before it's lost to scrollback.

**Fix**
- N/A — see `CROSS_PLATFORM_PLAN.md` for the full spec. One open question
  is flagged explicitly in the doc rather than silently assumed: whether
  unpruuf Pro's relay should now also carry file/photo transfers (it
  currently deliberately does not — see `server/README.md` "Scope").

**How to apply**
- Documentation only, nothing to update on any device. None of the
  "genuinely new" items listed in the doc are implemented yet — it's the
  spec to build against when cross-platform work starts.

---

## 2026‑08‑07 (2) · Windows relay: two real bugs the previous delivery's fake test missed

**What was done**
- Fixed `windowsTor.ts` so the Windows relay actually starts against a real `tor` binary. The
  previous delivery's own validation used a hand-written bash script standing in for `tor.exe`
  that just wrote a fake hostname file — it never exercised real Tor at all, so it couldn't have
  caught either bug below. This delivery replaces that with the real `tor` binary (installed via
  `apt-get install tor` in this session) end to end.

**Bug / cause**
- **Bug 1 — Tor refused to start at all.** `startTor()` created the hidden-service directory
  with plain `fs.mkdirSync(dir, { recursive: true })`. Real Tor enforces that a
  `HiddenServiceDir` be mode `0700`; `mkdirSync`'s own `mode` option is silently masked by the
  process umask (confirmed directly: a directory created with `{ mode: 0o700 }` still came out
  `0755` here), so Tor rejected it every time with "Permissions on directory ... are too
  permissive" and refused to start. The fake shim never created a real directory Tor would
  validate, so this was invisible until a real binary was used.
- **Bug 2 — even when Tor did fail, the reason was invisible.** `windows-start.ts` only piped
  and displayed the Tor child process's `stderr`. Spawning the real binary directly and
  inspecting which stream each line arrived on confirmed Tor writes its own
  notice/warning/error log lines to **stdout** by default — so every diagnostic Tor ever
  printed, including the exact reason it just failed to start (bug 1's own error message), was
  silently discarded. On top of that, nothing watched for the Tor process exiting early: a
  crashed Tor would leave the app waiting out the full 60-second hostname timeout before showing
  a generic "did not publish a hostname" message instead of the real cause.

**Fix**
- `startTor()` now calls `fs.chmodSync(dir, 0o700)` explicitly on both the hidden-service and
  Tor data directories after creating them, instead of trusting `mkdirSync`'s `mode` option.
- `windows-start.ts` now captures **both** `stdout` and `stderr` from the Tor process into the
  same log stream shown to the user. `waitForHostname()` also now accepts the child process and
  a running log-tail buffer: if Tor exits before publishing a hostname, it rejects immediately
  (not after the full timeout) with the actual captured Tor output, not a generic message.
- Verified for real, not simulated: `apt-get install tor` in this session, then
  `windows-start.js --tor-exe /usr/sbin/tor` run directly (the code is OS-agnostic Node.js
  aside from the tor binary name default — the same orchestration path Windows uses). First run
  reproduced bug 1 exactly (real "too permissive" rejection). After the fix, the same run
  produced a **real** `.onion` hostname from the real `tor` binary's real hidden-service key
  generation, real `Bootstrapped 0%/5%/10%/14%...` progress lines now visible in the console,
  and live `curl` calls against the running instance confirmed the printed token is genuinely
  enforced (200 with it, 401 without) — the same checks as the previous delivery, this time
  against real Tor instead of a shim. Added three regression tests exercising the exact
  mechanics of both fixes (directory mode, early-exit rejection with log tail attached) —
  31/31 `npm test` passing.

**How to apply**
- Update the Windows relay server if you already tried running it. Nothing on the app side or
  the wire format changed — this only fixes the relay's own Tor startup on Windows/Linux hosts.

---

## 2026‑08‑07 · Windows relay, auth token, configurable TTL, QR pairing for the relay

**What was done**
- **Windows relay server.** `server/start-windows.bat` runs the same relay as the Docker
  deployment, but as a plain Node.js process on Windows that manages its own Tor child process
  (`src/windowsTor.ts`) instead of a Docker + Tor-sidecar setup — no Docker needed. See
  `server/windows/README.md` for the one-time Tor Expert Bundle setup.
- **Access token per relay instance.** Previously the relay had no auth at all — anyone who
  learned its address could push/pull for any tag. Every relay instance now generates a random
  bearer token on first run (`src/identity.ts`), persisted across restarts, required via
  `Authorization: Bearer <token>` on `/v1/relay` and `/v1/fetch` (`src/middleware/auth.ts`,
  compared with `crypto.timingSafeEqual` rather than `===`). `/health` stays unauthenticated.
  `--regenerate` issues a fresh token when needed (e.g. suspected leak).
- **Configurable TTL.** How long the relay holds an undelivered message before dropping it is
  now asked interactively on first setup (default still 6h) instead of a fixed constant
  (`BlobStore` takes `ttlHours` in its constructor now). Change it later with
  `--regenerate --ttl <hours>` or by deleting `relay-identity.json`.
- **QR pairing for the relay.** The server prints a QR code (`qrcode-terminal`, straight to the
  console — no image file) *and* the same information as a plain copyable string, both encoding
  address + token together: `unpruuf-relay:v1:<address>:<token>` (`src/connectionString.ts`). In
  the app, Settings → Relay gained a "Scan QR code" button (same ZXing/`PortraitCaptureActivity`
  pattern already used for contact pairing) alongside a paste field — replacing the old
  onion-address-only text field, since a bare address is no longer enough on its own.
- **Docker deployment** picks up the same token/TTL mechanism automatically (`RELAY_DATA_DIR`
  now covers the identity file too, not just the SQLite DB) — no docker-compose.yml changes
  needed, the generated token is printed once to `docker compose logs relay`.

**Bug / cause**
- Not a bug fix — this closes a real gap the relay shipped with two deliveries ago
  (`server/README.md`'s own "no login/auth beyond knowing the tag" disclosure) and adds the
  Windows deployment path + TTL control that were asked for directly, rather than something that
  broke.

**Fix**
- See "What was done." Verified by real execution throughout, not just review: 28/28 `npm test`
  cases (blobStore TTL/auth, HTTP-layer 401s including a same-store-different-token isolation
  test, identity persistence/regeneration, Tor torrc generation and hostname-file polling), a
  full `windows-start.ts` dry run against a fake `tor.exe` shim that actually spawned the real
  orchestration code end-to-end (Tor spawn → hostname wait → QR/text print → graceful shutdown),
  live `curl` calls against that running instance proving the printed token is the one the server
  actually enforces (200 with it, 401 without), and a standalone Kotlin harness proving
  `RelayManager.parseConnectionString` parses that exact real server output identically to the
  TypeScript side, plus 8 round-trip/edge cases matching the TS test suite one-for-one.

**How to apply**
- Update **all** devices, and update any relay server you're already running. A previously
  configured relay onion address (from before this delivery) is **not** enough anymore — no
  auth token exists for it yet, so every relay needs to be (re)started once under this version to
  generate one, and every app needs to re-scan/re-paste its connection string. Nothing else about
  pairing (contacts) or the wire format changes; this only touches the optional relay path, which
  stays off unless you've explicitly turned it on.

---

## 2026‑08‑06 · Critical: no message ever decrypted after the previous delivery

**What was done**
- Fixed the Double Ratchet's X3DH-lite root-key salt and per-message AAD, both
  of which were computing a *different* value on each device instead of the
  same shared one — see "Bug / cause" below.

**Bug / cause**
- Reported by the user: pairing worked, but messages didn't arrive in
  *either* direction after installing the previous delivery.
- Root cause: `RatchetSessionManager.deriveSharedSecret` salted the X3DH-lite
  HKDF with `identityManager.myMessageKey` — **this device's own** key. But
  `myMessageKey` is per-device and is *not* shared between the two sides of a
  pairing (each device generates its own and gives a copy to the other, who
  stores it as `Contact.publicKey`). So device A salted with A's key, device
  B salted with B's key — two different salts, therefore two different root
  keys, from the very first message. Compounding it, `P2PNetworkManager`'s
  ratchet associated-data used `contact.publicKey` decoded raw — again
  per-device (A's copy of B's key vs. B's copy of A's key), so even a
  matching root key would still have failed AEAD verification on every
  message. Pairing itself was unaffected because it doesn't touch either
  code path — only real message encrypt/decrypt did, which is exactly the
  "pairing works, nothing arrives" symptom reported.
- This is a real gap in the previous delivery's own verification: the
  `DoubleRatchetTest`/`RatchetFrameTest` suites validate the ratchet
  *algorithm* in isolation with manually-supplied, already-matching shared
  secrets — they never exercised `RatchetSessionManager`'s actual key
  derivation against two independently-generated device identities, which is
  the only place this mismatch could show up. Caught only by the user
  actually running two paired phones.

**Fix**
- `IdentityManager.pairSecret(contactMsgKeyB64)` — previously private,
  already used correctly to derive the rotating wire-ID — is the *only*
  value in that class genuinely equal on both devices (it hashes both
  devices' keys together in a fixed, sorted order, so which side computes it
  doesn't matter). Made it public and switched both the ratchet's HKDF salt
  and its AEAD associated data to use it instead of the per-device values
  they were using before.
- Verified end-to-end with a standalone two-device simulation (not just
  reasoning): reproduced the exact bug (old salt/AAD differ between two
  independently-generated identities, decrypt fails), then confirmed the fix
  (new salt/AAD match, and a full encrypt-on-A/decrypt-on-B plus
  encrypt-on-B/decrypt-on-A round trip succeeds) — run against the real
  `DoubleRatchet.kt` algorithm code, not a reimplementation of it.

**How to apply**
- Update **all** devices to this delivery — the previous one cannot
  exchange messages at all, so there's no working state to preserve anyway.
- **Any contact paired under the previous delivery must be deleted and
  re-paired.** The wrong root key was computed and saved to disk at pairing
  time (`RatchetSessionManager.createSession`, called once, right when the
  contact is added) — updating the code doesn't retroactively fix a session
  that already exists in the database with the mismatched key baked in. A
  contact paired for the *first time* on this delivery doesn't need anything
  special; it's specifically anyone paired between the previous delivery and
  this one that needs a fresh pairing.

---

## 2026‑08‑05 · Full bidirectional forward secrecy, image/file sending, optional relay

**What was done**
- **Double Ratchet.** Replaced the sender-only one-time-ECIES scheme with a
  full Double Ratchet (X25519 DH ratchet + HKDF root/chain-key derivation +
  XChaCha20-Poly1305, built on the Tink `subtle` primitives already used
  elsewhere in this codebase — no new native dependency). Bootstraps from a
  single X25519 DH agreement at pairing time (`RatchetSessionManager`,
  `IdentityManager.myX25519RatchetKeyPair`), with the sender/receiver role
  decided deterministically by comparing the two devices' X25519 public keys
  (safe here because pairing is mutual/synchronous — both phones show and
  scan a QR at once — unlike a one-directional handshake). A Signal-style
  skipped-message-key cache handles out-of-order or lost messages. Ratchet
  state lives in a new encrypted Room table (`RatchetStateEntity`/`RatchetStateDao`,
  DB version 2→3), wiped alongside a contact on revoke/delete/panic-wipe.
- **Image and file sending.** The old transport had a hard 4096-byte packet
  cap with no chunking, so anything beyond a short text message was silently
  undeliverable (see the now-closed STATUS.md "on hold" item 8). Added
  `RatchetFrame` outer-packet chunking (message split into ≤4000-byte
  ciphertext pieces, each its own individually-ACKed, queued delivery,
  reassembled on receipt) plus a `MessagePayload` envelope tagging TEXT vs.
  FILE vs. IMAGE. `ChatScreen` gained a camera button
  (`TakePicturePreview` — the bitmap never touches disk, staying consistent
  with this app's RAM-only content rule) and a file/gallery picker with
  MIME-type sniffing to auto-tag picked photos as IMAGE. Images render as
  inline thumbnails with a tap-to-expand fullscreen viewer; other files stay
  a "📎 filename" chip.
- **Optional store-and-forward relay.** New `unpruuf/server/` — a small
  Node.js/TypeScript relay (Express + better-sqlite3) meant to run as its
  own Tor hidden service. It is deliberately "blind": it only ever stores
  already Double-Ratchet-encrypted blobs, addressed by the exact same
  rotating wire tag (`IdentityManager.myWireId`) the direct P2P path already
  uses, with delete-on-fetch and a 6h TTL. `P2PNetworkManager` now falls
  back to it only after direct LAN/Tor delivery fails, and only for
  single-packet messages (text, revoke, delete-contact) — chunked file/photo
  transfers always go direct, since the relay is a polled mailbox with no
  ordering guarantee between two separate pushes, and chunk reassembly
  depends on strict in-order delivery (see `server/README.md` "Scope" for
  the full reasoning). Off by default; enable in Settings → "Use relay when
  contact is offline" with a relay `.onion` address.

**Bug / cause**
- The gaps this closes were the same three the previous delivery's own
  `STATUS.md` documented as open: receiver-side forward secrecy (§2, "🟡 Not
  yet"), image/file sending (§"On hold" item 8, blocked on the fixed
  4096-byte packet cap), and no way to reach an offline contact besides
  waiting for the direct-delivery queue's retries.

**Fix**
- See "What was done" above for each. All three are additive to the existing
  transport (LAN/Tor direct delivery, the ACK+queue reliability layer, and
  the rotating wire-ID scheme are all unchanged and still the primary path)
  rather than replacements, so a device that never enables the relay and
  never sends a file behaves exactly as before, just with stronger forward
  secrecy on every message.
- Validated by real execution rather than by reasoning alone: `DoubleRatchetTest`
  (7 cases — two-party exchange in both directions, out-of-order delivery,
  a simulated lost message forcing the skipped-key path, X3DH-lite root-key
  agreement) and `RatchetFrameTest` (6 cases including a 2MB/525-frame photo
  round-trip) both compiled and ran standalone against this project's exact
  pinned Tink version. The relay's Node/TypeScript test suite (9 cases:
  FIFO queueing, per-tag isolation, capacity limits, TTL sweep, and the full
  HTTP layer) ran for real (`npm test`). `RelayClient`'s hand-rolled
  HTTP/1.1 framing (no OkHttp dependency in this module) was additionally
  verified against the real running relay server via a standalone Kotlin
  harness before being trusted in the app.

**How to apply**
- Update **all** devices and **all** paired contacts before relying on any
  of this. The wire format changed (ratchet header + chunk framing replace
  the old one-time-ECIES envelope) — devices still on the previous version
  cannot decrypt messages from an updated device, and vice versa. If a
  pairing misbehaves after updating, delete the contact and re-pair (this
  regenerates the ratchet session cleanly). The relay is opt-in and needs no
  action unless you want it — see `server/README.md` for how to deploy one.
- A full `./gradlew` build wasn't run for this delivery (no Android SDK in
  this environment, consistent with prior deliveries) — every new algorithm
  and protocol piece was instead verified by real standalone execution (see
  above). If Android Studio reports a compile error, paste the exact text
  and it'll be fixed immediately.

---

## 2026‑07‑13 · Network-change recovery could silently never fire

**What was done**
- `TorManager.bounceTorNetwork()` now waits up to ~10s for the Tor control
  connection to become available (reusing the existing `awaitControlConnection()`
  helper) instead of checking once and giving up immediately. It also now
  **always** emits the `networkChanged` signal that tells the P2P layer to
  re-warm the send path and re-flush the delivery queue, even if the Tor
  `DisableNetwork` toggle itself couldn't run this time.

**Bug / cause**
- Two Pro-edition phones, different mobile carriers: Pixel 9 Pro XL stayed on
  mobile data throughout; Galaxy S23 Ultra switched Wi‑Fi → mobile. Both
  directions of messaging then got stuck on 🕓 for 5+ minutes, even with
  battery usage already set to Unrestricted on the S23 Ultra. Cause: right
  after a network handoff, the bound Tor service can be transiently
  unavailable. `bounceTorNetwork()` checked `torService?.torControlConnection`
  exactly once and returned immediately if it was null at that instant —
  silently skipping the Tor bounce **and** never emitting `networkChanged`.
  With no retry scheduled, recovery only had a chance to happen if another
  network-change event fired by coincidence; on a since-stable mobile
  connection, it usually just didn't. One root cause explains both directions
  failing: the switching device's hidden service was never forced to
  republish (can't receive) and its own client circuits were never forced to
  rebuild (can't send).

**Fix**
- Give the control connection a real window (~10s) to reappear before giving
  up on the low-level bounce, and decouple that from notifying the app layer:
  `networkChanged` now fires unconditionally, so the delivery queue's own
  retry/backoff logic always gets a chance to recover even in the rare case
  where the Tor-level bounce itself couldn't run.

**How to apply**
- Update all devices. No re-pairing needed — this only touches the recovery
  path after a network change, not the wire protocol.

---

## 2026‑07‑11 · Smaller QR payload for weak-autofocus cameras (pairing)

**What was done**
- Shrunk the pairing QR code's data payload by roughly a third: single-letter
  JSON keys instead of full field names, the 16-byte user ID encoded as
  compact unpadded Base64 (22 chars) instead of the 36-char dashed UUID
  string, the redundant `.onion` suffix stored once and re-appended on parse,
  and two unused fields (`displayName`, `timestampMs` — never actually read
  anywhere) dropped from the wire format entirely. ~477 chars → ~320 chars.
- The QR image is now rendered with `FilterQuality.None` so Compose doesn't
  apply bilinear smoothing when scaling the bitmap up to fill the display
  card — module edges stay sharp black/white instead of blurring into gray
  gradients. The display card also grew from 240dp to 280dp.

**Bug / cause**
- Pairing worked instantly on a Galaxy S22 and a Pixel 9 Pro XL, but was very
  slow or failed outright on a Galaxy S23 Ultra and a Honor 5X. Cause: the old
  payload (onion address + 2 keys + rotation factor + verbose JSON) needed a
  version-13 QR code (69×69 modules). At the QR code's fixed on-screen size,
  that's a lot of very small modules for a camera with a weaker
  autofocus/macro system to resolve — especially scanning one phone screen
  with another (a known hard case: screen pixel grids can moiré against each
  other at close range). Bilinear scaling of the bitmap made this worse by
  softening the module edges the decoder needs to read cleanly.

**Fix**
- Smaller payload → smaller QR version (13 → 10, 69×69 → 57×57 modules, ~30%
  fewer modules) → each module covers more physical screen area at the same
  card size → much more forgiving of a weaker camera/autofocus. Crisp
  (unfiltered) rendering removes the extra blur on top of that.

**How to apply**
- This is a QR **wire-format change** (short keys the old parser doesn't
  recognize). **Update all devices and re-pair every contact** — an old QR
  code or an old app trying to read a new QR (or vice versa) will now show a
  clear "Couldn't read this code — make sure both devices are updated"
  message instead of silently doing nothing.

---

## 2026‑07‑10 · Forward secrecy for sent messages (SECURITY_CLAIMS.md item 1)

**What was done**
- Every outgoing chat message is now wrapped in a one-time encryption layer:
  the sender generates a fresh, single-use EC keypair (secp256r1), derives
  that message's key via ECDH against the recipient's static public key
  (exchanged once at pairing, in the QR), encrypts, and discards the
  one-time private key immediately — it is never stored, not even in RAM
  beyond that single function call.
- Each device now also has its own static EC keypair (`IdentityManager.myRatchetKeyPair`,
  persisted like the other identity keys) used only to *decrypt* incoming
  messages; its public half is now included in the QR pairing payload
  (`ratchetPublicKeyBase64`) and stored per-contact (`Contact.ratchetPublicKey`).
- Control traffic (revoke, delete-contact, dummy/cover traffic, hidden-service
  keep-alive) is unchanged — only real chat message content goes through the
  new layer, to keep the already-hardened delivery/reliability machinery
  untouched.

**Why this design (not a full Double Ratchet)**
- A hand-rolled bidirectional ratchet (independent send/receive chains plus
  periodic DH re-keying) was drafted and checked by hand — it had subtle,
  real correctness bugs under interleaved send/receive timing (two different
  chain-key mismatches were found by manual trace, each requiring another
  layer of fixing). Without the ability to run and test on real interleaved
  bidirectional traffic here, shipping that risked silently undecryptable
  messages — worse than the status quo. The simpler, stateless per-message
  scheme above has no state machine to get out of sync, so it's provably
  correct by construction, at the cost of only protecting the sender's side
  (see the honest scope below).

**Exact scope — please read**
- ✅ If your device is compromised *after* you sent messages, those sent
  messages cannot be decrypted from it — the one-time keys are already gone.
- ⚠️ If the *recipient's* device is compromised later, messages sent *to*
  them (past or future) remain decryptable, since their decryption key is
  long-term by design. Full protection against that needs a real Double
  Ratchet — tracked as a future item, not yet built.

**How to apply**
- Requires a schema change (`Contact.ratchetPublicKey`, DB version 2, destructive
  migration) and a new QR field. **Update all devices and re-pair every
  contact** — old pairings (and the local contact list) will not carry a
  ratchet key and cannot send/receive real messages until re-paired.

---

## 2026‑07‑10 · UI/UX requests: start screen, unread dot, beta notice, unified icon

**What was done**
- Contacts is now the **start screen** after PIN entry. The former Home screen
  (Tor/security status) moved to **Settings → "Network & security status"**.
- Contacts with a new incoming message now show a small **green dot** on their
  avatar; it clears automatically when the chat is opened.
- A one-time **"Beta version"** dialog is shown right after unlocking, on the
  current build of every edition.
- All three editions now share the **same unpruuf logo** as the app icon,
  distinguished only by a **colored ring** (Standard = teal, Pro = gold,
  Client = blue) — replacing the previous plain-tile Pro/Client icons.

**Bug / cause** — none; these were feature/UX requests, not bug fixes.

**How to apply**
- Update all devices. Existing installs will show the beta notice once on
  next unlock. The new launcher icon appears after reinstalling (Android
  caches launcher icons; if the old one still shows, reinstall the app).

---

## 2026‑07‑10 · Fast recovery after network switches (mobile ↔ Wi‑Fi)

**What was done**
- Debounced the network-change handler: on rapid switches
  (mobile → Wi‑Fi → mobile) Tor is bounced only **once**, 2.5 s after things
  settle, instead of once per switch.
- After the bounce, Tor now emits a `networkChanged` event; the P2P layer
  reacts immediately by re-warming the open chat's send path and re-flushing
  the delivery queue — no waiting for the periodic 20 s/60 s loops.

**Bug / cause**
- After switching mobile → Wi‑Fi → mobile, sending took "forever" again. Cause:
  every network change bounces Tor (`DisableNetwork 1→0`) to re-publish the
  hidden service for **receiving** — but that kills **all** circuits, so
  **sending** is ice-cold afterwards. Two switches did it twice, and you end up
  back on slow mobile with fully cold send paths.

**Fix**
- One debounced bounce per burst of switches + an immediate re-warm & re-flush
  afterwards, so the send path recovers in seconds instead of minutes.

**How to apply**
- Update/restart all devices. After a network switch, give it ~10–15 s to
  re-warm, then send.

---

## 2026‑07‑09 · Faster sending over mobile data

**What was done**
- Raised the Tor onion send timeout from 25 s to 40 s.
- Added "active chat" warm-keeping: while a chat is open, the Tor send path to
  that contact is kept warm every 20 s (`setActiveChat` + a warm-up loop;
  stopped when the chat is left).

**Bug / cause**
- Receiving over mobile data was instant, but **sending** took 10–20 s or
  sometimes failed entirely. Cause: a fresh outgoing Tor circuit to the target
  onion is "cold" on mobile (several rendezvous roundtrips + the radio has to
  wake up). The 25 s timeout cut off slow-but-legitimate connects → "never".

**Fix**
- The 40 s timeout gives the cold start enough time (the queue retries anyway).
- The warm-up keeps the circuit ready while the chat is open → fast sending
  when the user types.

**How to apply**
- Update/restart all devices. Open a chat, wait ~15 s, then send — after that
  the active chat feels fluid.

---

## 2026‑07‑09 · Project skills + full docs

**What was done**
- Added two Claude Code skills to the repo: `ship` (ZIP delivery workflow) and
  `unpruuf-playbook` (architecture, rules, debugging checklist).
- Fully updated `STATUS.md` including a troubleshooting log (14 bugs).

**Bug / cause** — none; pure documentation/automation.

---

## 2026‑07‑09 · Send regression fixed (existing contacts)

**What was done**
- Re-enabled `restoreContactServices()`.

**Bug / cause**
- After the "one onion per device" change, **nothing sent at all** (every
  edition). Cause: the per-contact onions of existing pairings were no longer
  published after a restart → all legacy contacts pointed at dead onions.

**Fix**
- Both old per-contact onions **and** the new main onion are published again →
  existing and new pairings work. No re-pairing needed.

---

## 2026‑07‑09 · Reliable QR + wait state

**What was done**
- `ensureMainOnion()`: the main onion is actively created for the QR when needed.
- QR screen shows "Waiting for Tor network…" and only renders a valid QR.

**Bug / cause**
- Pro's QR was "not read": after the onion change the QR often held
  `pending.onion` (read only passively) → the other side rejected it.

**Fix**
- Active onion creation + retry until a real `.onion` is available.

---

## 2026‑07‑09 · One onion per device (reliability)

**What was done**
- Switched receiving to **one main onion per device** (QR uses it); the
  per-contact wire-ID rotation is kept.

**Bug / cause**
- Shifting "one direction works, the other doesn't" failures. Cause: keeping
  several hidden services reachable at once per device is fragile on
  Doze/mobile devices.

**Fix**
- Only one hidden service per device to keep warm → much more robust.
  (Address isolation partly reduced; ID isolation fully retained.)

---

## 2026‑07‑08/09 · Reliable receiving in background/mobile

**What was done**
- Partial wakelock in the Tor service, one-time battery-optimization exemption,
  60 s hidden-service keep-alive (self-connection).

**Bug / cause**
- Receiving on mobile/background was slow or dead. Cause: Android Doze throttles
  the Tor process → hidden-service circuits die.

**Fix**
- Keep the CPU awake + Doze exemption + actively keep the onion warm. (Samsung
  additionally: set the app to "Unrestricted", out of deep sleep.)

---

## 2026‑07‑08 · UI fixes: PIN button & portrait

**What was done**
- PIN screens: button in a Scaffold `bottomBar` (always visible).
- App + QR scanner locked to portrait (`PortraitCaptureActivity`).

**Bug / cause**
- The PIN "Save" button was off-screen; the QR scanner rotated to landscape and
  the name dialog was lost (activity recreation).

**Fix**
- The bottom bar respects the keyboard/system insets; the portrait lock prevents
  the recreation.

---

## 2026‑07‑07/08 · Editions, ports & delivery reliability

**What was done**
- Standard/Pro/Client as Gradle flavors (color, icon, pairing rules).
- Per-edition local receive port; ACK + delivery queue; per-contact rotating
  wire-ID; smart dummy traffic; anonymous notifications.

**Bug / cause & fix** (selection)
- Only worked on the same Wi-Fi → read the SOCKS port lazily.
- Network switch: receiving dead → bounce Tor (`DisableNetwork 1→0`).
- Co-installed editions received nothing → per-edition port
  (54321/54322/54323), virtual onion port stays 54321.
- Notification showed sender + content → single anonymous notification.

---

*Earlier work (scaffolding, GRAL architecture, RAM-only, PIN/panic PIN,
bidirectional deletion, logos, English UI conversion) — see the Git history and
`STATUS.md`.*
