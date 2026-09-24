# unpruuf — Cross-Platform (iOS + Android) Plan: Node & Rotation Behavior

**Naming, stated explicitly so it doesn't drift across documents:** **GRAL**
is the architecture — the underlying design (serverless-by-default P2P,
Double Ratchet forward secrecy, RAM-only messages, per-contact identity
isolation) that everything in this family is built on. **unpruuf**, in all
its variants, is the app — Standard, Pro, and Client today; the
cross-platform relay-mandatory mode described in this document; and, in
turn, any vertical-branded product built on top of it (e.g. the enterprise
compliance/whistleblower and healthcare lines scoped separately). None of
those variants are a departure from GRAL — the cross-platform mode below is
GRAL adapted for a transport that doesn't assume a persistent listener, not
a different architecture wearing the same name.

Two separate product lines going forward, not one unified app. This document
fixes the design decided for each, so it survives past this conversation.
Companion docs: `STATUS.md` (current Android feature status), `EDITIONS.md`
(Standard/Pro/Client flavor rules — unrelated to the split below).

---

## The two product lines (both GRAL, different transport constraints)

| | **unpruuf Pro** (existing) | **Cross-platform** (new, not yet built) |
|---|---|---|
| Platforms | Android only | iOS **and** Android, must talk to each other |
| Primary transport | Direct P2P over Tor hidden service + LAN | Always via a relay node — never assumes a persistent P2P listener |
| Wire-ID / onion rotation | Automatic, hourly (unchanged) | Manual, button-triggered ("Wechsel") |
| Relay/node role | Opt-in fallback only, off by default | Mandatory — the only delivery path |
| Reachability while backgrounded | Yes (foreground service + wakelock) | No — app must be open to receive (accepted trade-off) |

**Why split instead of unify:** iOS cannot sustain a persistent background
Tor hidden service or an automatic hourly clock-driven rotation the way
Android can (see the iOS-constraints discussion this plan follows from).
Forcing Android onto the iOS-compatible minimum would mean giving up a
working, already-shipped, stronger property (automatic rotation, true P2P)
for no reason — Android users who don't need iOS interop shouldn't pay for
that constraint. So: **unpruuf Pro stays exactly as it is today**, and the
new node/rotation model below is a **separate mode**, used only when a
conversation needs to work across both platforms. Both are GRAL; they
differ in how GRAL's guarantees get delivered given what each platform
actually allows.

---

## unpruuf Pro (Android-only) — unchanged except the relay's file scope

No changes from what's already shipped in this repo, except one confirmed
scope expansion:
- Direct P2P over Tor hidden services + LAN/NSD fallback — unchanged.
- Automatic hourly wire-ID rotation (`IdentityManager.myWireId`/
  `expectedWireId`), ±2h clock-skew tolerance — unchanged.
- Relay (`unpruuf/server/`) stays **opt-in, off by default**, tried only
  after direct delivery fails — but now covers **file/photo transfers
  too**, not just text/control messages. This was the open question this
  doc originally flagged ("node ... for fallback and for file transfer");
  now resolved and shipped: `RatchetFrame.Frame.ChunkCont` carries an
  explicit chunk index, so relay-delivered pieces reassemble correctly
  regardless of arrival order (across retries, transports, or an hourly
  wire-tag rotation boundary mid-transfer). The relay's per-tag capacity
  and the app's HTTP client response cap were both raised to cover the
  app's largest allowed file (5 MB). See `CHANGELOG.md` for the delivery
  that made this change and how it was verified.

---

## Cross-platform mode — full node & rotation behavior

### 1. Relay is not optional here
Every message goes through a relay node. No direct P2P assumption, because
iOS can never guarantee a live listener. The app must be open to receive —
accepted trade-off — but delivery is then immediate (no APNs push needed,
no metadata leak to Apple, since instant polling on open covers it).

### 2. Wire-ID / onion rotation: manual "Wechsel", not automatic
- The shared factor/key established at initial pairing is **permanent** —
  never re-exchanged, no new pairing ceremony on rotation.
- A **"Wechsel" button per contact** recomputes a new wire tag using the
  **same formula, same shared factor** — just executed on demand instead of
  on an hourly clock tick.
- **Finalized, implemented in the iOS app (`unpruuf/ios/`):** Android's
  hourly bucket assumes both clocks independently agree on the current hour
  — exactly the assumption cross-platform mode drops. What replaces it: a
  **per-pair monotonic generation counter**, starting at 0 at pairing,
  tracked **per direction** (each side's own outgoing generation, and its
  best-known copy of the contact's generation — see
  `unpruuf/ios/UnpruufApp/Sources/Services/Contact.swift`'s
  `myGeneration`/`theirGeneration`). Same wire-tag formula as Android
  (`HMAC(pairSecret, "userId:X")`), `X` = `generation` instead of `hour`.
- The new generation + relay is sent to the contact as
  `UNPRUUF_WECHSEL_V1:<generation>:<relayConnectionString>`, wrapped in the
  same outer per-contact AES-GCM envelope every other packet uses (checked
  for a prefix match *before* Double Ratchet decode, same position in the
  receive path as `REVOKE`/`DELETE_CONTACT` — see
  `unpruuf/ios/UnpruufCore/Sources/UnpruufCore/ControlSignals.swift`) — sent
  under the sender's *current* (about-to-be-stale) generation, since the
  recipient doesn't know about the rotation yet. Addressed to whichever
  relay the recipient is currently known to be polling.
- The receive side tolerates a ±1 generation window (mirrors Android's ±2h
  clock-skew tolerance) since rotation isn't synchronized by a shared clock
  — a message sent just before the sender's own Wechsel could still arrive
  tagged with the prior generation.
- **Security rationale:** automatic hourly rotation existed to defend
  against a passive observer on the open network correlating traffic. Once
  delivery always goes through a known, trusted node, that specific threat
  model is far less relevant — and because the relay is store-and-forward,
  there's no synchronization window problem to solve either (see next
  section) the way there would be for raw P2P.

### 3. Trusted node list, liveness-checked, auto-selected
- The user maintains a list of trusted relay nodes.
- On rotation, the app checks which candidates are currently reachable and
  picks the first live one.
- Only the side that changes it needs to know the new value — it tells the
  contact via the existing channel, exactly like the onion/ID update above.
  The receiving side never has to independently guess or compute a match.

### 4. Node assignment is per contact, not global
- Each contact carries its own current node — not one global relay setting
  for the whole app.
- A **permanent node** is the baseline; it can be temporarily overridden.

### 5. Temp node (ephemeral, per-conversation relay)
- **"Temp Node" button** on a contact opens the existing QR scanner.
- Scan a connection-string QR from *any* freshly started relay — including
  one spun up on the spot from a laptop (`server/start-windows.bat`, a few
  seconds to a working node with its own onion + token).
- Propagated to the contact the same way as any node/ID change.
- The **permanent node is never overwritten** — kept in the background.
- Reverts to the permanent node automatically on **either**:
  - the temp assignment's TTL expiring (agreed at propagation time, no
    extra coordination needed to revert — both sides compute it
    independently), or
  - repeated unreachability of the temp node (liveness-based fallback).
- Use case: a single sensitive or time-boxed conversation gets a
  fully disposable relay — delete `relay-identity.json`/`relay.sqlite`
  after, and it never existed. Doesn't touch the permanent trusted-node
  list at all.

### 6. Tor stays as transport — not dropped for iOS
What's actually impossible on iOS is a **persistent background** hidden
service, not Tor itself. Since "app must be open to receive" is already
accepted, Tor can run **foreground-scoped**: started when the app opens,
paused/stopped when backgrounded — via an embeddable framework
(`Tor.framework`/`IPtProxy`, the same approach Orbot/Onion Browser use in
the App Store today). This keeps: Tor for talking to the relay, Tor for
direct sends while foregrounded, and even a temporary same-session onion
service enabling true P2P when both parties happen to be open at once.

### 7. Ownership & legal posture (informs "trusted node" in practice)
- NexonAI never operates node infrastructure and never has access to any
  node's data — pure software vendor role.
- Every node is owned and operated by whoever deployed it (the
  "operator") — Gabriel, a client, anyone running `start-windows.bat` or
  the Docker deployment on their own infrastructure.
- Legal responsibility for what a given node processes follows the
  operator who runs it, mirroring the technical decentralization exactly.
  See chat log for the GDPR analysis this rests on (Art. 2(2)(c), Art.
  4(7)/(8), Recital 18 and 26 of Regulation (EU) 2016/679) — worth a
  one-time confirmation from counsel before this is stated publicly as a
  compliance position, especially the "software vendor, not
  controller/processor" reading of Recital 18.

---

## Pairing QR format (cross-platform mode)

Android's existing pairing QR (`QrPairViewModel.kt`) encodes an onion
address — meaningless for a peer with no direct address. iOS's format
(`unpruuf/ios/UnpruufCore/Sources/UnpruufCore/PairingPayload.swift`) is the
authoritative spec for cross-platform mode, ported byte-for-byte on Android
by `screens/qrpair/CrossPlatformPairing.kt`:
```json
{"v":2,"u":"<compact userId>","p":"<myMessageKey b64>","k":"<x25519 ratchet pubkey b64>","n":"<relay1>[;<relay2>]"}
```
`n` plays the role Android's `o` (onion address) does — "the address(es)
others should use to reach me" — here, up to
`RelayConnectionString.maxPoolSize` / `RelayManager.RELAY_POOL_MAX_SIZE`
(2) `;`-joined `unpruuf-relay:v1:...` connection strings instead of one
direct onion. **v2** (bumped from v1): `n` used to be exactly one
connection string; it's now a small failover pool — the sender tries each
entry in order and stops at the first success, while the receiver polls
every entry every round (a relay's fetch is delete-on-fetch, so a message
could have landed on either one). A v1 QR (a single entry, no `;`) still
parses correctly — one entry is already a valid one-element list. Same
compact single-letter-key rationale as Android's QR v3 (shorter payload →
lower QR version → larger/easier-to-scan modules).

**Re-verified 2026‑09‑16** (user question: "is the QR the Android app/relay
generates actually right for iOS, or are there two different codes"): yes,
by design — confirmed both sides directly. `QrPairScreen.kt` has a
Pro-only "Android contact" / "iOS / cross-platform" toggle switching which
QR is shown/generated; scanning always tries the onion format first, then
this cross-platform format, so either device can be in either mode. Compared
Android's `crossPlatformPayloadToJson`/`jsonToCrossPlatformPayload`
(`CrossPlatformPairing.kt`) against iOS's `PairingPayload.toJSON`/
`fromJSON` line by line: identical keys (`v`/`u`/`p`/`k`/`n`), identical
compact-UUID encoding, identical `;`-joined pool cap, identical escape
rules. The relay connection string itself (`unpruuf-relay:v1:...`, what
fills `n`) is produced the same way regardless of which relay generated it
— `unpruuf/server/` (Node) or `unpruuf/relay-android/` — both implement the
same wire format from `RelayManager`/`RelayPoolManager`, so it doesn't
matter which relay either side is pointed at.

**Pool cap raised on Android 2026‑09‑17 (iOS still to follow):** Android's
`RelayManager.RELAY_POOL_MAX_SIZE` is now **3** (primary + two fallbacks),
together with carrying the pool in the *standard* pairing QR as well (see
`STATUS.md`). iOS's `RelayConnectionString.maxPoolSize` is still 2. Until it
is raised to match, an iOS peer parsing a three-entry `n` keeps only the first
two — `fromJSON` already does `.prefix(maxPoolSize)`, so the third entry is
simply unused, never mis-parsed, and nothing breaks in either direction. Raise
it on iOS to get the third fallback there too.

**Batched poll + relay-owner rhythm added on Android 2026‑09‑17, v1.09 (iOS not
started):** `pollRelayOnce()` on Android now collects every contact's expected
tags per distinct relay target and fetches each target with one `POST
/v1/fetchMany` call (new endpoint, wire-identical on `server/` and
`relay-android/`) instead of one `GET /v1/fetch` per tag, plus a per-contact
rhythm (`IdentityManager.relayOwnerIsMine()`, `Contact.manualRelayOwner`) that
skips checking a contact's fallback pool entries most rounds instead of
checking the full pool every round. iOS's `RelayService.pollOnce` still issues
one `GET /v1/fetch` per tag per pool entry every round — functionally correct,
just without either optimization. Nothing here changes the wire format
`RelayService.swift` already speaks (`/v1/fetch` and `/v1/relay` are
untouched, still fully supported by both relays), so this is purely an
Android-side efficiency gap versus a compatibility one — an iOS device talks
to either relay exactly as before. Building the iOS equivalent (call
`/v1/fetchMany` instead of looping `/v1/fetch`) is the natural next step to
close it.

Each device's own pool (what actually goes into `n`) is
`RelayManager.getMyRelayPool()` / `AppEnvironment.myRelayPool`: the
locally-configured primary relay first, then up to one backup relay —
either hand-entered in Settings or filled in by importing a signed,
company-issued relay-pool manifest (see `unpruuf/relaypool-tool/README.md`
and `RelayPoolManager` on both platforms) — deduped and capped at 2.

## Business/Mandatory pairing unification (Android, v1.10)

**This pairing format is no longer iOS-interop-only.** Since v1.10, Android
uses it for Android↔Android pairing too, whenever `RelayManager.RelayMode.
MANDATORY` is on — the "Business" / Node-bundled product line, where the
customer runs their own relay(s) and never wants an onion address exchanged
or stored for a contact at all, on either platform. iOS needed **zero
changes** for this: it already only ever spoke this format (there's no
onion-based pairing on iOS to begin with — `PairingViewModel` has always
been relay-mandatory), so Android simply started using iOS's own format for
its own equivalent mode instead of maintaining a second, Android-only
"no-onion" design.

What changed, Android-side only:
- `QrPairScreen.kt`: when Mandatory is on, the QR screen defaults straight
  to the cross-platform-format QR (no manual Pro-only toggle needed) — a
  small "RELAY-ONLY PAIRING — MANDATORY MODE IS ON" label replaces the
  "Android contact / iOS cross-platform" chooser in that case. The manual
  toggle for genuine iOS interop on Standard/Client (Pro-gated) is
  unchanged when Mandatory is off.
- `CrossPlatformPairingPayload` (`CrossPlatformPairing.kt`) gained an
  optional `e` (edition) field, `{"v":2,"u":"...","p":"...","k":"...",
  "n":"...","e":"<edition>"}`. Needed because two REAL Android editions can
  now pair this way and `AppEdition.canAdd()` (Client-can-only-add-Pro etc.)
  still has to be enforced — a rule that was previously trivially true by
  construction (this format was Pro-only, so "both sides Pro" was the only
  possible case). Missing `e` (any iOS-generated QR, or a pre-v1.10 Android
  one) defaults to `standard`, which keeps the existing Pro-gated
  iOS-interop path's edition check passing exactly as before. iOS's
  `parseFlatJSON` already ignores unrecognized keys, so this needed no iOS
  change to stay wire-compatible — confirmed by reading that function, not
  assumed.
- `QrPairViewModel.handleScannedCrossPlatformQr`'s Pro-only gate is now
  waived specifically when `RelayManager.isMandatory()` is true on the
  scanning device — the deliberate manual "iOS / cross-platform" toggle
  outside Mandatory mode still requires Pro, unchanged.
- Everything downstream (`P2PNetworkManager`'s `crossPlatform`-gated
  branches: generation-counter tag rotation, relay-only routing, the
  `wechsel()` manual-switch signal and its chat UI button) already keyed
  purely off `Contact.crossPlatform` — platform-agnostic by construction —
  so none of it needed to change to also serve two Android devices.
- The Standard (non-Mandatory) onion-based pairing flow (`QrPairViewModel.
  handleScannedQr`) is completely untouched — this only affects pairings
  made while Mandatory is on.

**Not build-verified** — no Android SDK in this environment; iOS side is a
documentation-only change (no Swift logic touched) plus manual review that
`parseFlatJSON` really does ignore unknown keys, confirmed by reading the
function, not assumed.

## What's shared vs. what's new

**Reused as-is, no new mechanism:** connection-string format
(`unpruuf-relay:v1:<address>:<token>`, already implemented on all three
sides — server, Android, iOS), the encrypted-message channel used to
propagate any node/ID change, the relay server itself (`unpruuf/server/`,
already built with auth token + configurable TTL + Windows/Docker
deployment). iOS's QR scanning uses its own native `VisionKit` scanner
rather than Android's `ScanContract`/`PortraitCaptureActivity` — same role,
platform-native implementation.

**Built (iOS, `unpruuf/ios/`, first working shell — see that folder's
`README.md` for exactly what's covered and what's deferred):**
identity, mutual-QR pairing, contact list, text-only chat, Tor connectivity,
relay push/poll, the "Wechsel" rotation flow (per-pair generation counter,
see "Wire-ID / onion rotation" above), manual per-contact relay config.
Written and delivered without any way to compile or run it here — see the
iOS README's "known risk areas" for what's most likely to need fixing first.

**Genuinely new, still not built:**
- Per-contact node assignment + permanent/temp override **on Android** —
  iOS already has the per-contact model (`myRelayConnectionString`/
  `theirRelayConnectionString` in `Contact.swift`); Android needs the
  matching companion support before the two platforms can actually pair
  with each other.
- ~~Trusted-node list UI~~ — built at the ordered-fallback level (2-entry
  pool in the pairing QR + local Settings + signed company manifest import,
  see above). **Still not built:** liveness checking and auto-select /
  auto-reorder among the pool's entries — today's fallback is a fixed,
  manually-set order (primary, then backup), tried/polled every round
  regardless of which one has actually been reachable recently.
- Temp-node TTL/liveness-based auto-revert logic.
- File/photo/voice attachments and PIN/Panic-PIN on iOS (the crypto/wire
  format already supports attachments — `MessagePayload`/`RatchetFrame` are
  full ports — just not wired into the iOS UI yet).

---

*This document captured a design decision before any of it was built. As of
the iOS delivery above, the "Wire-ID / onion rotation" and "Pairing QR
format" sections are no longer just a plan — they describe what
`unpruuf/ios/` actually implements. The remaining "genuinely new" items are
still just a plan.*
