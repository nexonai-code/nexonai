# Claims → evidence

Status 14 October 2026, source `android` branch. **Internal and for an auditor.** It names protocol details; the
patent check is still running, so it does not go to customers or the public.

How to read it. Every statement unpruuf makes about itself is listed with the thing that backs it and how anyone can
re-check it. The wording in the second column is the wording we may use. Where the evidence does not carry a claim,
the row says so (FINDING) and the claim must not be made until it is fixed.

| Status | Meaning |
|---|---|
| **PROVEN HERE** | An automated check in this folder passes on this source. Run `node 00-run-all.js` to repeat it. |
| **TEST** | A unit test in the repository pins it. |
| **READ** | A reviewer has to read the named code; the script only points at it. |
| **AUDIT** | Needs an independent specialist (cryptography, penetration test). We cannot vouch for it ourselves. |
| **MEASURE** | Needs a measurement we have not made. |
| **FINDING** | The evidence does **not** support the older wording. |
| **NOT CLAIMED** | We do not say this, and no one should say it for us. |

Scripts: `01` server surface · `02` server storage · `03` server code scan · `04` app scan · `05` routing tags ·
`06` pairing and packets · `07` Tor hashes · `08` packet header · `09` libraries. All are plain Node.js, no install beyond
building the node server once (`run-evidence.bat` / `run-evidence.sh`).

---

## A. "The server is dumb: it can do exactly what we say"

| # | Claim (allowed wording) | Evidence | Status |
|---|---|---|---|
| A1 | The node server offers seven requests: health, pool, lock-status, unlock, deposit, fetch, fetchMany. Nothing else answers; no request deletes, wipes, lists or exports. | `01`: registered routes equal the documented list; 14 unknown paths × 5 methods answer 404 even with the owner secret. | PROVEN HERE |
| A2 | Only the owner writes. A contact, a stranger and a wrong secret are refused (401). | `01`; also `node-mesh-server/src/app.test.ts`. | PROVEN HERE, TEST |
| A3 | Reading never changes anything. Only time removes packets. | `01`: a second fetch gives the same answer and the row count is unchanged; `02`: only the sweep removes rows. | PROVEN HERE |
| A4 | A deposit can ask for a shorter life, never a longer one; at most 24 hours, set by the node's profile. | `01`: a 10-day request is stored with 6 h (standard profile); `node-mesh-server/src/profiles.test.ts`. | PROVEN HERE, TEST |
| A5 | The server stores, per packet, a routing tag, the encrypted packet and two times. Nothing else. | `02`: one data table, exactly five columns, every row printed. | PROVEN HERE |
| A6 | The server keeps no sender address, no user agent, no owner secret. | `02`: those strings (127.0.0.1, two other addresses, a user agent, the secret) are searched in every byte of the database files: not found. `03`: no code reads the caller's address, port, user agent or forwarded-for header. | PROVEN HERE |
| A7 | Expired packets are overwritten, not just unlinked. | `02`: after expiry the packet bytes are absent from database and write-ahead log (`secure_delete`). | PROVEN HERE |
| A8 | The server makes no outbound connection except the one-time download of Tor; no telemetry. | `03`: only one `https.get` in the code (`torDownload.ts`); every URL in the code is the Tor archive or localhost; every `fetch(` is a relative address inside the local setup pages. This is **code**, not a capture of a running server. | PROVEN HERE (code); AUDIT (capture) |
| A9 | The server never logs a tag, a packet or a secret. | `03`: no logging call prints such a value in request handling or storage. The setup tools are listed for hand review. | PROVEN HERE (code) |
| A10 | The settings an operator can change do not give the server more capabilities. | Settings found in the code: `NODE_PROFILE` (1/6/24 h), `NODE_MESH_STORE` (disk/ram), `NODE_MESH_KEY_STORAGE` (sealed/disk), `NODE_SLOT`, `NODE_MESH_NODES`, ports, `NODE_MESH_REQUIRE_SIGNED`, `NODE_MESH_TOR`, bridge and feed settings. None adds a route (`01`). Two settings **lower** protection: `KEY_STORAGE=disk` (keys readable on disk, no lock after restart) and `NODE_MESH_TOR=0` (for tests only). The auditor should walk every variable in `config.ts` and `index.ts`. | READ |
| A11 | The server a customer runs is the one NexonAI released, unchanged. | Signed list of file hashes, checked at start and hourly; `verify-release` checks a copy from outside; tests in `integrity.test.ts`. The audit report should name the **release fingerprint** it covers so that a customer can compare. Limit: a server already compromised can lie about itself; real remote proof needs hardware and is not built. | TEST; AUDIT (fingerprint binding) |
| A12 | The Tor program the server downloads is the genuine one. | `07`: the three programs that download Tor pin SHA-256 values and compare them before extracting; `--online` compares them with the Tor Project's signed list and verifies the PGP signature (primary fingerprint EF6E 286D DA85 EA2A 4BA7 DE68 4E2C 6E87 9329 8290 — compare with torproject.org). Closed on 14 October 2026; before that the download was not checked. | PROVEN HERE |
| A13 | The server's libraries have no known vulnerability at release time. | `09`: `npm audit` of production libraries. On 14 October 2026 four were found in the node server and the relay (one critical in `proxy-addr`, three moderate in `qs`) and fixed; now 0. A clean result is valid for the day it is run. | PROVEN HERE (today) |
| A14 | The server has three direct libraries: express, better-sqlite3, qrcode. | `03`. 133 production packages including nested; an auditor should review them or ask for a software bill of materials. | PROVEN HERE; READ |
| A15 | The server does not announce its web framework. | `app.disable("x-powered-by")`, `01` sees no header (added 14 October 2026). | PROVEN HERE |

## B. "There are no identities"

| # | Claim (allowed wording) | Evidence | Status |
|---|---|---|---|
| B1 | The Business pairing code carries no user id. Its fields: version, message key, ratchet key, routing seed, up to three node addresses, edition. | `06`: the fields written are exactly `v,p,k,s,n,e`; `NodeMeshPairingTest` pins "no user id". | PROVEN HERE, TEST |
| B2 | Message key, ratchet key and routing seed are new for every pairing. Two contacts comparing codes find nothing in common (except that nodes are shared on purpose). | `06` reads `pendingNodeMeshPairing` (SecureRandom, 32 bytes each); `05`: 300 contacts → 300 different seeds and tags. | PROVEN HERE |
| B3 | A package is addressed by a tag that only the two partners can compute and that changes every hour; tags of different contacts cannot be linked. | `05`: formula equals the Android code; fixed values match; 300 tags in one hour all different; 26 tags of a window all different; 1-bit share 0.5007 over 4000 tags. **A demonstration.** The real argument rests on HMAC-SHA256 being a pseudo-random function. | PROVEN HERE (construction); AUDIT (assumption) |
| B4 | The contact record has no field for phone number, e-mail or account. | `06`: field list printed and checked. | PROVEN HERE |
| B5 | The app has no permission for contacts, location, phone, SMS, microphone, accounts, calendar or storage. It asks for nine: network state, camera, Wi-Fi multicast, foreground service (×2), internet, notifications, battery-optimisation exemption, wake lock. | `04`. | PROVEN HERE |
| B6 | No analytics, crash reporting, advertising, push or Google Play services library is part of the app. | `04`: dependency scan of both apps; no import of telephony, location, contacts, accounts, Google services or Firebase in the source. | PROVEN HERE |
| B7 | The app opens network connections only through Tor, except a same-Wi-Fi shortcut that exists only while a direct (onion) contact exists: never in the whistleblower edition, never for Business contacts. | `04`: every client socket goes through the Tor SOCKS proxy except one; the one open listening socket exists only behind `lanDiscoveryNeeded()`, which returns false for whistleblower and ignores Node-Mesh contacts. No ready-made HTTP client, no WebView. **Static.** A capture on a running phone is the runtime proof. | PROVEN HERE (code); AUDIT (capture) |
| B8 | The Android device id is read once, hashed, and used only for the local licence check. | `04`. | PROVEN HERE |
| B9 | On a network that blocks Tor, the app can use bridges. The Snowflake path then contacts a broker through a CDN front and STUN servers. | `04` note. This is third-party contact; "the app talks only to Tor" is true for the direct path and must be worded carefully for the fallback. | NOTE |
| B10 | Notifications show "New message" only; the app is hidden from screenshots and the app switcher; backup and clear-text traffic are off. | `04` (manifest, `FLAG_SECURE`). Notification text: read `showMessageNotification`. On a device: take a screenshot, open the app switcher. | PROVEN HERE (settings); READ |
| B11 | There is no address book in the system and nothing like a user directory on any server. | `02` (what the server holds), `06` (what the contact record holds). | PROVEN HERE |

## C. Cryptography and packets

| # | Claim (allowed wording) | Evidence | Status |
|---|---|---|---|
| C1 | Messages are encrypted with a Double Ratchet (X25519, HKDF, XChaCha20-Poly1305) inside an outer AES-256-GCM layer with a fresh random 12-byte IV. | `06` reads the outer layer; ratchet in `ratchet/DoubleRatchet.kt`; cross-checked between Kotlin and TypeScript (`officer-app/scripts/check-android-intake.js`, `web-reporter/scripts/check-interop.js`). The ratchet is our own implementation on library primitives. | TEST; **AUDIT** |
| C2 | Starting a session uses the two exchanged keys and a salt from both message keys. There is no signed identity: trust comes from scanning the code in person or over a channel the users trust. | Design; `RatchetSessionManager.deriveSharedSecret`. A cryptographer should review it as a protocol (it is a reduced form of X3DH). | **AUDIT** |
| C3 | Guessing an AES-256 key by brute force is physically impossible. | `SECURITY_CLAIMS.md` §1.1. Mathematics; depends on a correct implementation and a random key. | READ |
| C4 | Every packet is exactly 4096 bytes on the wire. | `08`, `NetworkObfuscationTest`. | PROVEN HERE, TEST |
| C5 | ~~Message length is hidden.~~ A network observer sees only 4096-byte packets. **Whoever can read a stored packet (a node or relay operator) reads its payload length in the first 8 bytes.** | `08` re-implements the padding and shows the number; `PacketMetadataTest.kt` shows it with the real ratchet, framing and padding classes (4 tests pass). | **FINDING F1** |
| C6 | ~~A cover packet cannot be told from a real message.~~ To a network observer it cannot. To a node operator it can: a cover packet shows 44, every real message more. | `PacketMetadataTest`: shortest real message is longer than a cover packet. | **FINDING F1** |

**F1 in one paragraph.** `padPacket` puts `[payload length: 4 bytes][position: 4 bytes]` in front of the random padding.
Those eight bytes are not encrypted, and the node stores the packet as received. The way to close it is to move the length
inside the encrypted part (pad first, then encrypt), which changes the wire format in Android, iOS, the officer app, the
web reporter and the relay, so it needs the team's decision. Until then: do not say "message length is hidden" without
"from anyone watching the network", and do not say that cover packets hide real traffic from a node operator.
Corrected already in `SECURITY_CLAIMS.md`, `STATUS.md`, `PRODUCT_CONTEXT.md`, `MARKETING.md`.

## D. On the phone

| # | Claim (allowed wording) | Evidence | Status |
|---|---|---|---|
| D1 | Messages are kept in memory only, never on disk. | Design (`InMemoryMessageStore`); `SECURITY_CLAIMS.md` Tier 2. An auditor takes a forensic image of a phone after use. | READ; AUDIT |
| D2 | Contacts are stored in an encrypted database (SQLCipher, AES-256). | Dependency present (`04`). How the key is kept (Android Keystore) needs review. | READ; AUDIT |
| D3 | The panic PIN wipes contacts and keys and opens an empty app. | Device test. | AUDIT |

## E. What a node or a network observer learns (metadata)

| # | Claim (allowed wording) | Evidence | Status |
|---|---|---|---|
| E1 | A node sees: an encrypted packet, a routing tag that changes every hour, the requested life, the times of deposit and pick-up, the number of requests, **and the payload length (F1)**. It does not see content, names, contact lists or user IP addresses (everything goes through Tor). | `02`, `03`, `08`. | PROVEN HERE |
| E2 | Someone who watches both sides of the network at once can still correlate timing. | Stated limit, not solved (every Tor service). | NOT CLAIMED |
| E3 | Cover packets hide when real messages are sent. | Not measured. Against a node operator F1 weakens it. | MEASURE; FINDING F1 |
| E4 | About 100 active users per node. | Calculated from the code (5 reads/s, one request per 20 s). Never loaded in a test. | MEASURE |

## F. Operation

| # | Claim (allowed wording) | Evidence | Status |
|---|---|---|---|
| F1 | After a restart a sealed server stays locked until its owner unlocks it; the keys are encrypted on disk. | Code and tests in `node-mesh-server`; limit: someone who has the server can imitate the unlock address and wait for the owner. | TEST; AUDIT (threat model) |
| F2 | Licences are checked offline and send nothing. | `04` (the licence code has no network call), licence tests. | PROVEN HERE (code) |
| F3 | unpruuf Control stores server SSH keys in a vault (scrypt + AES-256-GCM) and pins host keys. | 60 tests against a simulated server. New attack surface: it holds keys to every server. Never run against a real server. | TEST; **AUDIT** |
| F4 | The private signing key for licences and releases is kept safe. | Organisational: who holds it, how it is backed up, what happens if it leaks. | AUDIT (process) |

## G. What we do **not** claim

Certified. Audited (until a report exists). Unbreakable. GDPR-compliant (the architecture supports the principles; the
organisation is the controller). Protection if the phone itself is compromised. Protection against a global observer.
Protection if the hosting provider reads a running server's memory. Anything about Tor itself or the operating system.
That a first, unique or safer-than-others product exists. That anonymous reports are required by law in Romania (unclear).
