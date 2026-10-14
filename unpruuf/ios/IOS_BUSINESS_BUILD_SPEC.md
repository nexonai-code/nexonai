# unpruuf Business for iOS — Build Specification

**For:** Claude Code, running on the Mac of whoever carries the iOS work (today: Norbert, as the team's proposal).
**Status of this file:** written 13.10.2026 from the Android code at commit `449ee02` (branch `android`). The Android app is the reference. When this file and the Android code disagree, the Android code wins; say so and tell the team.
**INTERNAL.** It contains protocol details. The patent check is still running. Do not put any of it into customer material, public repos, store texts, marketing or screenshots.

---

## 0. Rules for you (Claude Code)

1. **You have a Mac and Xcode. The earlier iOS code was written without one.** So: build after every work package, run `swift test` in `UnpruufCore` after every change to it, and only write "works" for what you actually ran. Report what you did not run (real device, real Tor, Android interop) under **Not checked**.
2. **Additive only.** The existing iOS app (consumer relay mode) and the Compliance edition (`unpruuf Compliance`, relay-based, talks to `officer-app`) were verified on two real iPhones and must keep working unchanged. New code goes into new files and a new target. Touch existing files only where a work package says so, and keep that edit small.
3. **Never change a wire format.** Everything below is already fixed by the Android app and the node server. iOS has to match byte for byte. If something cannot be matched, stop and ask.
4. **Port the logic, do not invent it.** For each package the Android source file is named. Read it before writing the Swift.
5. **Tests first for `UnpruufCore`.** Pure logic (tags, QR, list parsing, licence, feed crypto) goes into `UnpruufCore` with unit tests, including the known-answer values in section 4.4.
6. **No dummy code, no empty files, no TODO stubs in delivered code.** If a package is not finished, say which part is missing; do not leave placeholder functions.
7. **Words in the app.** English and Romanian (String Catalog). Reuse the Romanian wording from `app/src/main/res/values-ro/strings.xml` where the Android string is the same. Never write "certified", "unbreakable", "GDPR-compliant", "first", "safer than", "audited". Honest status: not audited; Pilot where applicable.
8. **No NexonAI server.** The iOS app talks only to servers the customer runs. No analytics, no crash reporter that phones home, no APNs (see 6.1).
9. **Commit style:** small commits per work package, message in English, ends with the attribution lines the session gives you. Do not push the `tor-client-edition` branch. Do not open pull requests unless asked.
10. **Ask the team** (Gabriel, Norbert, Floretta decide together) at the points listed in section 9. Do not decide those yourself.

---

## 1. Goal

Today iOS speaks the old **relay mode** (`CROSS_PLATFORM_PLAN.md`): wire tags, "Wechsel", one relay per contact. The Android Business app (flavor `pro`, called "Pro", sold as **unpruuf Business**) moved on to the **Node-Mesh**: owner-only deposit on the user's own servers, read-only fetch from the contact's servers, 250 onion addresses per customer server, three nodes per contact, per-contact keys, cover traffic, node lists, company feed, sealed servers.

**Build the iOS client for unpruuf Business** so that an iPhone and an Android Pro phone can pair by QR and talk to each other through the customer's node servers, with the same behaviour and the same limits.

iOS is **client only**. It never hosts a node or a Temp Node (iOS cannot keep an onion service alive in the background).

### Out of scope
- Hosting nodes on iPhone (also: no phone-hosted Temp Node).
- unpruuf Compliance / safeline iOS: stays relay-based (the `officer-app` still reads a relay). No change.
- safeline Press on iOS.
- Tor Client Edition (client authorization): separate branch, not now.
- Group chat: only as the optional phase D (section 5), after the team says yes.

---

## 2. What exists on iOS today (facts)

`unpruuf/ios/` — about 7,500 lines Swift, no `.xcodeproj` in the repo (it lives on the Mac, path in `HANDOFF.md`).

`UnpruufCore` (Swift package, tests via `swift test`) — **reuse as is**:
- `Ratchet/DoubleRatchet.swift`, `Ratchet/RatchetHeader.swift`, `X3DHBootstrap.swift` — Double Ratchet, XChaCha20-Poly1305 (CryptoSwift), matches Android/Tink.
- `RatchetFrame.swift` — single / chunk-start / chunk-cont frames with explicit chunk index.
- `OuterEnvelope.swift` — AES-256-GCM, `iv(12) || ciphertext || tag(16)`.
- `NetworkObfuscation.swift` — pad to 4096 bytes (`[size:4][offset:4][pad][payload][pad]`), `unpadPacket`.
- `MessagePayload.swift` — type byte + payload: 0 text, 1 file, 2 image.
- `Identity.swift` — `pairSecret(contactMsgKey:)`, global message key and X25519 key pair. **Global keys only** (Node-Mesh needs per-contact keys, see 4.3).
- `PairingPayload.swift` (relay QR), `ControlSignals.swift` (Wechsel), `RelayConnectionString.swift`, `OfficerCase.swift` — relay mode, leave alone.

`UnpruufApp`:
- `Services/TorController.swift`, `TorControlConnection.swift` — Tor.framework (CocoaPods `Tor ~> 409`), confirmed on hardware. **Read its numbered notes before touching anything near it.**
- `Services/SocksHTTPClient.swift` — hand-rolled SOCKS5 + HTTP/1.1 over `Network.framework`. Narrow on purpose (three relay endpoints). The Node-Mesh needs a wider client (4.7); build a new one, do not bend this one.
- `Services/RelayService.swift` — send queue, poll loop, `ingestPacket`, `createSession`. Pattern to mirror for `NodeMeshService`.
- `Services/ContactStore.swift`, `KeychainStore.swift`, `InMemoryMessageStore.swift`, `PinManager.swift`, `AppLockManager.swift` — reuse.
- Views: PIN + panic PIN, Face ID opt-in, wipe on background, 5-minute message TTL in RAM, safety number, QR scan (VisionKit `DataScannerViewController`, paste fallback), QR display.

Known: messages arrive only while the app is open (accepted since `CROSS_PLATFORM_PLAN.md`).

---

## 3. Target shape (proposal — confirm in 9.1)

A **third target `UnpruufBusiness`** next to `UnpruufApp` and `UnpruufCompliance`, created the way the README describes for Compliance (duplicate target, own `Info-Business.plist`, own bundle id). Shared code stays shared. Node-Mesh code lives in:

```
UnpruufCore/Sources/UnpruufCore/NodeMesh/
    NodeMeshRouting.swift        tags, pair secret, epochs
    NodeMeshPairingPayload.swift QR v2
    NodeConnectionStrings.swift  owner / address strings, lists
    NodeListFile.swift           unpruuf-node-list:v1
    MessageTtl.swift
    AppLicense.swift             unpruuf-license:v1 (Ed25519)
    FeedCrypto.swift             (phase C)
UnpruufApp/Sources/Business/
    NodeMeshHTTPClient.swift     over Tor SOCKS
    NodeMeshStore.swift          own nodes, lists, feed sources, cursors
    NodeMeshService.swift        send queue, poll, ingest, cover traffic
    BusinessContact.swift        or extend Contact with optional fields
    Views/…                      pairing, node lists, settings, chat extras
```

`Contact` needs new optional fields (decoder must tolerate old files): `nodeMesh: Bool`, `theirRoutingSeed`, `theirNodeAddresses`, `myPairMessageKey`, `myPairRatchetPrivateKey`, `myPairRatchetPublicKey`, `myPairRoutingSeed`, `myNodeAddresses`, `messageTtlHours`, `tempNodeAddress`, `tempNodeOwnerSecret`, `tempNodeActive`, `theirTempNodeAddress`. A Node-Mesh contact has **no user id**; use a local random UUID as `id`.

---

## 4. Protocol reference (exact)

Android sources in brackets. Paths are under `app/src/main/java/com/nexonai/unpruuf/`.

### 4.1 Constants
| Name | Value | Source |
|---|---|---|
| Packet size | 4096 bytes (outer ciphertext ≤ 4088) | `NetworkObfuscation` |
| Routing rotation | 1 hour (protocol constant) | `P2PNetworkManager.NODE_MESH_ROTATION_INTERVAL_MS` |
| Client window | `MAX_TTL` = 24 h → `ceil(24/1)+1 = 25` epochs back + current = **26 tags per contact** | `nodeMeshToleranceEpochs` |
| Nodes per contact | 3 | `NodeMeshManager.NODE_POOL_MAX_SIZE` |
| Own nodes per device | 1000 | `OWN_NODES_MAX` |
| Poll rhythm | 20 s ± 5 s jitter, long-poll `waitMs` 20 000 | `startNodeMeshPoll` |
| Tags per `fetchMany` | ≤ 64 | `MAX_FETCH_MANY_TAGS_PER_CALL` |
| Cover traffic | Poisson, mean 15 min per contact, clamp 20 s … 60 min | `startNodeMeshCoverTraffic` |
| Pool refresh | every 6 h (`GET /pool`) | `NODE_POOL_REFRESH_INTERVAL_MS` |
| Feed refresh | every 1 h | `FEED_REFRESH_INTERVAL_MS` |
| Locked-server check | every 15 min | `LOCKED_SERVER_CHECK_INTERVAL_MS` |
| Temp Node heartbeat | 2 min, 3 failures in a row → fall back | `TEMP_NODE_HEARTBEAT_*` |
| Message TTL steps | 1 / 6 / 24 h, default 24 | `MessageTtl` |
| Onion port | 80 | `NodeMeshClient.NODE_PORT` |
| Timeouts | connect 40 s; socket `max(40 s, waitMs + 15 s)`; health 15 s; feed 60 s | `NodeMeshClient` |
| Max HTTP response | 12 MB | `NodeMeshClient` |

### 4.2 Strings
- Owner string (local only, **never** in a QR or sent to a contact): `unpruuf-node-owner:v1:<address>:<ownerSecret>`. Split at the **last** colon. Secret is base64url.
- Address string (contact-facing, no secret): `unpruuf-node:v1:<address>`.
- Lists of strings are joined with `;`. An address may contain `:`; it never contains `;`.
- Node address: v3 onion `^[a-z2-7]{56}\.onion$`.

### 4.3 Per-contact values and the pairing QR (v2)
Every pairing generates **fresh** values, shown only in that one QR (`IdentityManager.pendingNodeMeshPairing`):
- message key (32 random bytes) → `p`
- X25519 ratchet key pair → public key `k`, private key kept on the contact
- routing seed (32 random bytes) → `s`
- three own nodes chosen from the selected list (4.14) → `n`
- edition → `e` = `"pro"`

The pending set is stored (encrypted) until a scan binds it to a contact, so leaving the screen between showing and scanning does not strand a contact. After binding, the next QR gets new values.

QR JSON (single letters, one line): `{"v":2,"p":"<b64>","k":"<b64>","s":"<b64>","n":"<addr1>;<addr2>;<addr3>","e":"pro"}`. `n` entries have the `unpruuf-node:v1:` prefix **stripped**. Base64 is standard alphabet with padding, no line wraps. No user id. A v1 QR (extra `"u"`) must still be read and `u` ignored. A QR with no `"s"` is not a Node-Mesh QR (the relay QR has `"u"` and no `"s"`). Parser: `screens/qrpair/NodeMeshPairing.kt`; a test pins round trip and rejections (`NodeMeshPairingTest.kt`) — port those cases.

Edition rule (`AppEdition.canAdd`), for `pro`: may add `standard`, `pro`, `client`; may **not** add `whistleblower`, `press`, `officer`, `group`. Show the Android texts (EN/RO) when blocked.

Duplicate scan: detected by the contact's message key.

### 4.4 Routing tag
```
mySeed      = 32-byte routing seed I generated for THIS contact (s in my QR)
theirSeed   = routing seed from THEIR QR
pairRouting = SHA-256( min(mySeed, theirSeed) || max(theirSeed, mySeed) )     // unsigned byte-wise compare, shorter-is-smaller on equal prefix
epoch       = floor(unixMillis / 3_600_000)
tag         = Base64_standard_with_padding( HMAC-SHA256( key = pairRouting, message = UTF8("routing:" + epoch) ) )
```
Sources: `IdentityManager.nodeMeshPairSecret`, `nodeMeshRoutingTag`, `nodeMeshToleranceEpochs`. Tags contain `+`, `/`, `=`; percent-encode them in a query string; in JSON bodies they go as is.

**Known-answer values (computed independently, must match):**
```
mySeed    = bytes 0x00..0x1f   (base64 AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=)
theirSeed = bytes 0x20..0x3f   (base64 ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8=)
pairRouting (hex) = fdeab9acf3710362bd2658cdc9a29e8f9c757fcf9811603a8c447cd1d9151108
epoch 0       -> qniWxa+fOYCYmgFWACBsQ/5QcuOZCh7UmHD07Bws6D4=
epoch 1       -> TFjsTryxfpoP1ajZrzDr652y7UjXAZEsRAD6+Jp4NCM=
epoch 486000  -> H4Bv8LlIENqyyxB1C8oGzRT9nmG9c4wjzKnsvXS9hFM=
```
Swapping the two seeds must give the same tags. Put these in `NodeMeshRoutingTests`.

For **sending**, I compute the tag for the current epoch with `(mySeed_for_contact, theirSeed)`. For **receiving**, I compute the 26 tags with the same two seeds and ask the **contact's** nodes (the contact deposits under the same shared tag on their own nodes).

### 4.5 Message crypto (same as relay mode, with per-contact keys)
- `pairSecret = SHA-256( min(myMsgKeyForContact, theirMsgKey) || max(...) )` — same function as `Identity.pairSecret`, but `mine` is the **per-contact** message key (`p` from my QR for that contact), not the global one.
- Ratchet bootstrap: `shared = HKDF-SHA256(X25519(myRatchetPriv, theirRatchetPub), salt = pairSecret, info = X3DH_INFO, 32)` (already in `X3DHBootstrap`). Initiator decided by comparing the two X25519 **public** keys (unsigned bytes): smaller public key → `initSender`, else `initReceiver`. Same as `RelayService.createSession`, except the key pair is the **per-contact** one. [`ratchet/RatchetSessionManager.kt`]
- Associated data for Double Ratchet encrypt/decrypt = `pairSecret`.
- Send pipeline: `MessagePayload` bytes → Double Ratchet encrypt → `RatchetFrame.split` + `encode` (one packet per frame) → **outer AES-GCM with the contact's message key** (`k = base64decode(theirMsgKey)`, their `p`) → `padPacket` → 4096 bytes. Reject if the encrypted frame is larger than 4088.
- Receive pipeline: `unpadPacket` → outer AES-GCM decrypt with **my per-contact message key** → plaintext. Because the sender is known from the tag you polled, pick the key by contact.

### 4.6 Delivery (send)
For each 4096-byte packet, in order, per contact (one message at a time per contact; frames of a message strictly in order):
1. Tag = routing tag of the **current** epoch, snapshotted when the message is enqueued.
2. Deposit to **every** reachable node in `myNodeAddresses` of that contact (the three I gave them), not first-success-wins. Success if at least one accepted.
3. `ttl` in the request = chosen chat lifetime in ms (4.12). The node may shorten, never lengthen.
4. If not delivered: retry with back-off (3 s … 15 s as in `P2PNetworkManager.BACKOFF_*`), forever, until the app is closed; the queue lives in memory only (RAM-only product). Show the queue honestly in the UI (one check mark when at least one node accepted).
5. Snapshot the tag and the node list at enqueue time. A contact deleted while packets are queued must still get its delete signal out (real bug found on Android, `attemptDelivery` comment).

### 4.7 Node HTTP contract (through Tor SOCKS5, `Host: <address>`, port 80)
Server: `node-mesh-server/src/routes/node.ts`, `README.md` (API). Android client: `NodeMeshClient.kt`.

| Call | Auth | Body / query | Answer |
|---|---|---|---|
| `PUT /deposit` | `Authorization: Bearer <ownerSecret>` | `{"routing_tag":"…","ciphertext":"<b64>","ttl":<ms>}` (`ttl` optional) | `201`; `400` bad tag/ttl, `413` size, `429` tag queue full, `402` licence expired, `423` server locked |
| `POST /fetchMany` | none | `{"tags":[…],"waitMs":N,"since":N}` (`waitMs`, `since` optional) | `{"cursor":N,"blobs":{"<tag>":["<b64>",…]}}`; without `since`: `{"blobs":{…}}`; long-poll max 55 s |
| `GET /fetch?tag=<urlencoded>` | none | — | `{"blobs":[…]}` (not needed; use `fetchMany`) |
| `GET /pool` | Bearer owner secret | — | `{"control"?:"x.onion","addresses":[…]}` |
| `GET /health` | none | — | `2xx` if alive |
| `GET /lock-status` | none (control address) | — | `{"locked":true|false}` |
| `POST /unlock` | Bearer owner secret (control address) | — | `{"addresses":[…]}` |
| `GET /list` | none (feed address) | — | text file (phase C) |

Notes: reading is rate limited (about 5/s, burst 30) — one batched request per node address. Never delete anything on a node; cleanup is the node's TTL. Ciphertext in JSON is standard base64 without line breaks.

Build **`NodeMeshHTTPClient`** as a small actor over the existing SOCKS5 code path (copy the SOCKS handshake, not the three-endpoint logic): custom headers, request body, `Content-Length` response, byte-exact status/header parsing, size cap, per-call timeout. For tests, inject a transport protocol; a loopback transport (plain TCP to `127.0.0.1`) is allowed **in the test target only**, never in a release build.

### 4.8 Receiving (poll)
Mirror `pollNodeMeshOnce` / `pollNodeMeshAddress`:
1. Every cycle (20 s ± 5 s, same rhythm whether a chat is open or not): for each Node-Mesh contact build `addresses = theirNodeAddresses + theirTempNodeAddress` and `tags = 26 tags` (4.4).
2. Group by **node address** across all contacts: one `fetchMany` per distinct address (chunks of ≤ 64 tags; only a single-chunk call long-polls), all addresses concurrently.
3. Cursor per address (memory only): tags already covered by the cursor are fetched with `since = cursor`; tags that just entered the window (a new hour) once with `since = 0`. A node that answers without `cursor` (Android node) → drop the cursor and do full fetches.
4. Every returned blob → `ingest(tag, blob)`.
5. Forget cursors of addresses no contact uses any more.

**iOS difference, intended:** iOS cannot poll in the background, so poll once immediately when the app becomes active and then run the rhythm while active. Everything the contact deposited in the last 24 h is still on their nodes and arrives on that first poll. State the limit in the UI: "Messages wait on the sender's servers for the lifetime they chose (at most 24 h); open the app to receive."

### 4.9 Ingest
Mirror `ingestPacket` / `ingestPacketInner`:
1. **Hash dedup first.** SHA-256 of the 4096-byte packet; reserve the hash before processing (LRU set); a repeat returns "handled" without processing. This is mandatory: every packet sits on up to three nodes and in several tags, and the ratchet cannot decrypt the same message twice.
2. Resolve sender from the tag (the contact whose 26 tags contain it). Unknown tag → drop.
3. `unpad` → outer decrypt with my per-contact key. Failure → drop (not an error).
4. Plaintext equals `UNPRUUF_DUMMY_V1` → cover packet, drop, count as handled.
5. Control signals (plain UTF-8 after outer decrypt, **before** ratchet decode):
   | Signal | Effect |
   |---|---|
   | `UNPRUUF_REVOKE_V1` | wipe this contact's messages |
   | `UNPRUUF_DELETE_CONTACT_V1` | wipe messages, delete contact and ratchet state, drop queued packets for it |
   | `UNPRUUF_NODEMIGRATE_V1:<unpruuf-node:v1:old>;<unpruuf-node:v1:new>` | in `theirNodeAddresses` replace `old` by `new`, de-duplicate, keep at most 3 |
   | `UNPRUUF_TEMPNODE_V1:<unpruuf-node:v1:addr>` | set `theirTempNodeAddress` |
   | `UNPRUUF_TEMPNODE_OFF_V1` | clear `theirTempNodeAddress` |
   Ignore the onion / identity / Wechsel / relay-owner signals for Node-Mesh contacts.
6. Otherwise `RatchetFrame.decode` → single frame, or reassemble chunk frames by explicit index (one reassembly slot per sender) → Double Ratchet decrypt (AAD `pairSecret`) → `MessagePayload.decode`.
7. Store text / file / image in the RAM message store, mark unread, local notification text generic ("New message", no sender, no content). Type 3 (group) only in phase D; before that: ACK-and-drop.

### 4.10 Cover traffic
While the app is active and Tor is ready: pick a random Node-Mesh contact; wait an exponentially distributed time with mean `15 min / numberOfContacts`, clamped to 20 s … 60 min; build `outerEncrypt("UNPRUUF_DUMMY_V1", contactKey)` (no ratchet), pad to 4096, deposit with the **same tag, the same three nodes and the same ttl** as a real message of that chat. [`sendNodeMeshCover`]
Honest limit to show in Settings and to keep in all texts: on iOS cover traffic runs only while the app is open, so it hides less than on Android. Do not claim more.

### 4.11 Sealed servers (unlock)
`GET /pool` returns `control` on sealed servers. Store `control` per pool source. Every 15 min while Tor is ready: `GET /lock-status` on each control address; if `locked`, show a warning card in Settings (EN/RO text from Android: "server restarted, unlock only if it is yours; if in doubt set up a new server") and send `POST /unlock` **only after the user confirms**. On success merge the returned addresses into the pool. [`NodeMeshManager.findLockedServers`, `unlockServer`]

### 4.12 Chat lifetime
Clock icon in the chat bar, steps 1 h / 6 h / 24 h, default 24 h, stored on the contact (`messageTtlHours`), sent as `ttl` in ms in every deposit **including cover packets** of that contact. [`MessageTtl.kt`]

### 4.13 Temp Node (client side only)
iOS can **use** a Temp Node but never host one.
- Chat menu "Temp Node": scan or paste an owner string (`unpruuf-node-owner:v1:…`) printed by `start-tempnode` (or shown by an Android node). Store address + secret on the contact.
- Announce to the contact: send `UNPRUUF_TEMPNODE_V1:<unpruuf-node:v1:address>` as an ordinary packet through the **standard** nodes. Switching off: clear the registration locally first, then send `UNPRUUF_TEMPNODE_OFF_V1`.
- Delivery routing (`depositForNodeMesh`): no Temp Node → standard nodes. Registered but not confirmed → deposit to both. A successful deposit via the Temp Node sets `tempNodeActive = true`. Active → Temp Node only; a failed single deposit falls back to the standard nodes for that packet.
- Heartbeat every 2 min: `GET /health` on each registered Temp Node; success sets active; 3 failures in a row clear it.
- Receiving: poll `theirTempNodeAddress` in addition to the standard list (4.8).
- A contact's **phone-hosted** Temp Node (Pro Groups, Android) speaks the same contract; nothing special to do.

### 4.14 Node lists and the pool
- A *list* is a named group of own nodes. A node is in exactly one list; an empty list does not exist; default list name `Standard`; name ≤ 60 chars, no tabs/newlines/`;`/`|`. [`NodeLists.kt`]
- Adding a contact requires choosing a list (pre-selected when there is exactly one). Changing the list starts a fresh pairing (new keys). The QR gets 3 nodes: random, **one per server first** (server = distinct owner secret), then random fill. Nodes are shared between contacts on purpose. [`NodeMeshManager.chooseNodes`]
- Import a node list **file** (Files picker, share sheet, or pasted text) → new list, or add to an existing one. Format:
  ```
  unpruuf-node-list:v1
  name: Acme · Server 1
  secret: <ownerSecret>
  control: <control onion>        (sealed servers only)
  count: 250
  bridge: obfs4 …                 (optional, repeatable, max 10)
  <empty line>
  <address>                       (one per line)
  ```
  Validation: address `^[A-Za-z0-9._:-]{3,120}$`, secret `^[A-Za-z0-9_-]{16,128}$`, `count` must equal the number of addresses, max 400 000 characters. [`NodeListFile.kt` + its tests; the Kotlin parser is pinned against the real server output — do the same]
- Scan an owner QR (`unpruuf-node-owner:v1:…`) of a server's setup page → add that node, remember it as a *pool source*, then `GET /pool` to import its sibling addresses; repeat every 6 h.
- Delete a list: removes its nodes from the device; show how many contacts used them.
- The file and the owner QR carry the write key. Store the secrets in the Keychain (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`), never in `UserDefaults`, never in iCloud backup, exclude the app data from backup.

### 4.15 App licence
Format `unpruuf-license:v1:<base64url(payload)>:<base64url(signature)>`; payload `1|<edition>|<serial>|<customer>|<issuedAtMs>|<expiresAtMs>`; signature = Ed25519 over the payload bytes, 64 bytes; public key (base64url) `67A_r4YeFkvYoXDF30gar2gRBcufokgvYQd5dVeEwKE`. The edition field must equal the build's edition (`pro` for this target). States: not configured / valid / expiring soon (≤ 30 days) / expired / invalid. Rules to port from `domain/license/LicenseManager.kt`: self-binding to the first device, and the clock high-water mark ("now" = max(stored, system time), never decreases). On iOS bind to a random install id kept in the Keychain (not `identifierForVendor`, it changes on reinstall of the last app of a vendor). No network, no telemetry. Licence format is **not** to be changed.

### 4.16 Company feed (phase C)
Spec: `NODE_MESH_SPEC.md` §16, Android `FeedCrypto.kt`, `FeedSources.kt`, `FeedUpdater.kt`, server `node-mesh-server/src/feed/`.
- Feed code `unpruuf-feed:v1:1|<name>|<period h>|<address seed>|<content key>|<signing public key>` (base64url fields). Scan by QR or paste.
- Address for an epoch: `epoch = floor(unixMs / (periodHours*3_600_000))`; `seed_e = HKDF-SHA256(ikm = addressSeed, salt = "unpruuf-feed-v1", info = "onion-epoch:" + epoch, 32)`; Ed25519 public key of `seed_e`; Tor v3 address = base32(pubkey ‖ checksum[2] ‖ 0x03) + ".onion" with `checksum = SHA3-256(".onion checksum" ‖ pubkey ‖ 0x03)[0..<2]`. Try the current epoch first and, within 45 min of a boundary, the neighbour.
- **SHA3-256 is not in CryptoKit before iOS 18.** Either require iOS 18 for this package or port the small Keccak in `FeedCrypto.kt`. Test it against the Kotlin test vectors.
- `GET /list` → file with `seq`, `issued`, `iv`, `data`, `sig`. Verify the Ed25519 signature first (`"unpruuf-feed-list-v1\n" seq "\n" issued "\n" iv "\n" data`), then AES-256-GCM decrypt with AAD `unpruuf-feed-v1:<seq>`, reject `seq` lower than the stored one, split the node-list files at `\n=====\n`. Each list becomes or updates a managed list of the same name; dropped addresses leave the pool; all-or-nothing against the 1000-node limit.

### 4.17 Connection paths and the company bridge (phase C)
Spec: `NODE_MESH_SPEC.md` §20, Android `ConnectionPaths.kt`, `BridgeManager.kt`, `TorManager.runAssistant`. Direct → company bridge (only if the list has `bridge:` lines) → obfs4 (Tor Browser's public default bridges) → Snowflake, with the time budgets 30 / 40 / 45 / 90 s, remembered for the next start only. On iOS this needs the pluggable transports (IPtProxy / Lyrebird / Snowflake) next to Tor.framework. Tested on Android only against a normal network; say so.

### 4.18 Node migration (own nodes)
Not needed in the first version: iOS does not run servers. Receiving the migrate signal (4.9) is required.

---

## 5. Work packages (do them in this order)

**A — Foundation (must be finished and verified first)**
- A0. Build the current iOS project on the Mac, run `swift test`, note the result. Fix nothing that is not yours.
- A1. `NodeMeshRouting` + KAT tests (4.4). **Done when** the three KAT values pass.
- A2. `NodeConnectionStrings`, `NodeListFile`, `MessageTtl`, `NodeMeshPairingPayload` + tests ported from Android (`NodeMeshPairingTest`, node list tests, `NodeLists`). **Done when** a node-list file produced by the real server (`node-mesh-server`, `nodeList.ts`) parses.
- A3. `AppLicense` + tests with a real code from `license-tool` (`node license-tool/issue.js --edition pro …`) and a tampered one.
- A4. Extend `Identity` or add `PairIdentity` for per-contact values; ratchet bootstrap with per-contact keys. **Done when** a packet that Android built with fixed keys (a small JVM test writes it as a hex fixture, committed under `UnpruufCore/Tests/…/Fixtures`) decrypts in Swift to the expected text, and a packet built by Swift decrypts in the same JVM test. Random nonces mean you compare plaintext, not ciphertext. The existing approach in `officer-app/scripts/check-android-intake.js` is a model.

**B — Business app (the actual product)**
- B1. `NodeMeshHTTPClient` + transport protocol + tests against the real server (`NODE_MESH_TOR=0` loopback transport in the test target).
- B2. `NodeMeshStore` (Keychain), node list import (file, paste, owner QR), pool import via `GET /pool`, lists UI.
- B3. Pairing screen: choose list → show QR → scan theirs → create contact (+ edition rules, safety number as today).
- B4. `NodeMeshService`: send queue (4.6), poll (4.8), ingest (4.9), cover traffic (4.10), chat lifetime (4.12), sealed-server unlock (4.11). Reuse chat UI from `ChatView`.
- B5. Licence screen and gate (4.15). Settings: status of Tor, nodes, lists, limits text (4.8, 4.10).
- B6. Target `UnpruufBusiness`, `Info-Business.plist`, String Catalog EN + RO, app name, icons.
- **Done when (B):** two simulators/devices talk to each other through a local node server, and **one iPhone talks to one Android Pro phone** through a real server over Tor in both directions, including a chunked file (> 4 KB) and a message sent while the other side was offline (< 24 h). Anything less is reported as Not checked.

**C — Company features**
- C1. Temp Node client (4.13). C2. Company feed (4.16). C3. Connection paths and bridge (4.17).

**D — Optional, only after the team says yes (9.4): Pro Groups**
Android: `domain/group/*`, `MessagePayload` type 3. A group is a local list plus a shared group code; one group message = one ordinary 1:1 message per member.
- Payload type `3`: `[0x03][groupId: 8 bytes][memberCount: 1 byte][UTF-8 text]`.
- Group code: 12 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` + 2 check characters, written `XXXX-XXXX-XXXX-XX`. Check = two weighted sums over the alphabet index `v`: `sum = Σ v`, `weighted = Σ (i+1)·v` (i from 0), characters `ALPHABET[sum % 32]`, `ALPHABET[weighted % 32]`. Group id = first 8 bytes of SHA-256(`"unpruuf-group-id-v1:" + code without dashes, uppercase`).
- Limits: max 10 members, text only, name ≤ 40, text ≤ 2000, random stagger up to 3.5 s between the per-member sends, members only from Node-Mesh contacts of the same edition (`group`; pairs only with other `group` installs; licence edition `group`).
- Receive decision and notices: `GroupInbox.decide` and its tests. Port `GroupCodeTest`/`GroupInboxTest` cases.
- Not before: customer documents 1, 4, 5 still say "no groups".

---

## 6. iOS platform constraints and how they are handled

1. **No background receive.** iOS suspends the app; Tor cannot be kept alive. Receive on open (4.8). No APNs, no push provider: it would tell Apple and a push server when messages arrive. `BGAppRefreshTask` is not planned. If the team wants a different trade-off, that is decision 9.3.
2. **Cover traffic only while open** (4.10). Say so.
3. **Local notifications** only while the app runs, generic text. No content, no sender.
4. **RAM-only messages** stay (existing `InMemoryMessageStore`, 5-minute TTL on iOS today). Keep the wipe on background and panic PIN behaviour; wipe node secrets only on "wipe everything".
5. **Tor.framework** as today (CocoaPods; open the `.xcworkspace`; User Script Sandboxing = No on project and target). New target must get the same Pod and build settings.
6. **Keychain, not UserDefaults,** for owner secrets, per-contact private keys, licence state. Exclude from backup and from iCloud Keychain sync (`kSecAttrSynchronizable = false`, `ThisDeviceOnly`).
7. **Export compliance / App Store:** the app uses encryption (declare it). Entering licence codes inside an app can conflict with App Store rules; see 9.2.
8. **No jailbreak or expiry gate** is ported (Android has both). Product decision first, see `README` Phase iOS-8. Not part of this work.

---

## 7. Test plan

| Level | What | Where |
|---|---|---|
| Unit | KAT tags, QR parse/round trip/rejects, node list parse (also the real server's output), licence valid/tampered/expired/wrong edition, message TTL, signals, list rules, group code (phase D) | `UnpruufCore/Tests` via `swift test` |
| Integration | Client against the real `node-mesh-server` on the Mac: `cd node-mesh-server && npm install && npm run build && NODE_MESH_TOR=0 node dist/index.js --ephemeral` (no licence needed in ephemeral mode; it prints an owner string; API on loopback, port per the slot table in its README — check the printed output). Cover: deposit, fetchMany with cursor and long-poll, wrong secret, oversize, bad tag. 402/423 are covered by the server's own tests; unit-test the client's handling of those status codes with a fake transport | UnpruufApp test target, loopback transport |
| Crypto interop | A packet built on Android with fixed keys opens in Swift and the reverse (compare plaintext) | JVM test writes a fixture, Swift test reads it, and the reverse |
| Device | iPhone ↔ Android Pro over real Tor: pairing by QR both ways, text both ways, 100 KB image (chunks), offline-then-open delivery, chat lifetime 1 h, Temp Node, sealed-server unlock after a server restart | Norbert + Gabriel, written checklist in `ios/BUSINESS_DEVICE_TEST.md` (you create it, with expected results) |

After each package: `swift test`, an Xcode build of all three targets, and a short entry in `unpruuf/CHANGELOG.md` in the existing style: **What was done / Checked / Not checked / Known limits**.

---

## 8. Texts and claims

- Allowed: "fertige Produkte … Server immer beim Kunden, keine Identitäten, Tor von Anfang an" style statements; the architecture "supports the principles" (data minimisation, storage limitation, confidentiality).
- Not allowed: certified, audited, unbreakable, GDPR-compliant, first, unique, safer than X.
- Status line in About/Settings: "Not independently audited."
- Do not mention the numbers 250 or 100 in any user-facing text except the node-list screens where they are a fact of the file.
- Say what iOS cannot do (receive in background, cover traffic only while open, no node hosting) in plain words.

---

## 9. Decisions the team must make (do not decide these yourself)

1. **Third target** `UnpruufBusiness` (proposal, section 3) versus changing the consumer target.
2. **Distribution:** TestFlight, Apple Business Manager custom app, or public App Store — and whether a licence code entered in the app is acceptable there.
3. **Receive only while open** (no push) accepted for Business, or a different trade-off.
4. **Pro Groups on iOS:** now, after Business works on a device, or later.
5. **iOS licence binding** (Keychain install id as proposed in 4.15).
6. **Company bridge / Snowflake on iOS** (phase C3) — now or later.
7. **Packet length (evidence finding F1, 14.10.2026).** The first 8 bytes of a padded packet carry the payload length in the clear, so a node operator can read message lengths. Closing it changes the wire format (pad first, then encrypt) in every client. Build iOS exactly as 4.5 describes (same as Android today) and expect that format to change; do not change it on iOS alone. Details: `evidence/CLAIMS_TO_EVIDENCE.md` row C5.

---

## 10. Report back (what you hand over after each package)

1. Files added and changed (paths).
2. Commands run and their result (build, `swift test` counts, integration tests).
3. **Checked / Not checked / Known limits** — exactly as in the CHANGELOG style.
4. Anything in this file that turned out wrong or unclear, with the Android file and line that shows the truth.
5. The next package you propose.

---

## 11. Pointers

`NODE_MESH_SPEC.md` (protocol, decisions, v1–v6 history) · `NODE_MESH_BETRIEB.md` (customer operation) · `EDITIONS.md` · `CROSS_PLATFORM_PLAN.md` (why iOS is foreground-only) · `ios/README.md` (existing build steps and Tor gotchas) · `HANDOFF.md` (Norbert's Mac paths) · `SECURITY_CLAIMS.md` (what may be claimed) · `node-mesh-server/README.md` (API) · `control/README.md` (the customer's console for servers and licences).
