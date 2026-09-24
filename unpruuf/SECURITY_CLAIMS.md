# unpruuf — Security Claims: What We Can Actually Prove

This document separates what unpruuf can state with **rigorous confidence**
from what is **best-effort protection**, and lists what we **explicitly do
not** guarantee. The goal is precision, not marketing. Every claim below
states the assumption it depends on — a security claim without its
assumptions is not a claim, it's an advertisement.

Claims are grouped into three tiers by the *kind* of confidence behind them,
followed by an honest limitations section.

---

## Tier 1 — Mathematical / physical guarantees

These rest on hard math or physics, not on "we tried our best." Each still
has a stated assumption — nothing is unconditional.

### 1.1 Breaking the message encryption by brute force is not just "hard" — it exceeds the energy budget of the solar system

Messages are encrypted with **AES-256-GCM**. The key space is 2²⁵⁶ ≈
1.16 × 10⁷⁷ possible keys. This is not "a very large number that a fast enough
computer could eventually search" — it is bounded by physics, not engineering:

- The Landauer limit sets the minimum energy to flip one bit at room
  temperature (~300 K): `kT·ln2 ≈ 2.87 × 10⁻²¹ joules` per elementary operation
  (`k` = Boltzmann's constant).
- Enumerating 2²⁵⁶ keys requires at least `2²⁵⁶ × 2.87 × 10⁻²¹ J ≈ 3.3 × 10⁵⁶ J`.
- The Sun will radiate roughly `1.2 × 10⁴⁴ J` over its **entire ~10-billion-year
  lifetime** (luminosity ≈ 3.8 × 10²⁶ W × ~3 × 10¹⁷ seconds).
- **3.3 × 10⁵⁶ J is about a trillion times more energy than the Sun will ever
  produce.**

So: exhaustively searching the AES-256 key space is not merely impractical —
no energy source in the solar system could power the computation, even
running at the theoretical thermodynamic minimum, with zero energy lost to
inefficiency.

**This depends on:**
- AES-256 having no mathematical shortcut (no known break exists after ~20
  years of public cryptanalysis; this is unproven but well-tested).
- The key being generated with real randomness and never disclosed.
- A correct implementation (a side-channel or implementation bug can leak a
  key far cheaper than brute force — the math above says nothing about buggy
  code).
- **Quantum computing caveat:** a sufficiently large fault-tolerant quantum
  computer running Grover's algorithm would reduce the effective search space
  from 2²⁵⁶ to roughly 2¹²⁸ — still astronomically infeasible (2¹²⁸ ≈
  3.4 × 10³⁸), but worth stating precisely rather than ignoring.

### 1.2 Packet size leaks exactly zero bits of message length

Every packet sent — regardless of whether it holds "hi" or a long paragraph
— is padded to exactly **4096 bytes** before transmission (`NetworkObfuscation.padPacket`).
This is not "hard to tell apart" — it is a deterministic function: two
different plaintexts of different length produce **bit-identical packet
sizes**. A passive observer watching packet sizes on the wire learns nothing
about message length: the mutual information between "packet size" and
"message length" is exactly 0 bits, for any message up to the maximum
payload (4088 bytes).

**This depends on:** the message fitting within the fixed packet size. It does
for text and control signals, which are exactly what this guarantee still
covers without qualification. Files and photos are chunked across *multiple*
4096-byte packets sent back-to-back (see `RatchetFrame`) — each individual
packet is still exactly 4096 bytes and reveals nothing on its own, but an
observer counting packets in a burst learns the *approximate* size of a
chunked transfer (packet count × ~4000 bytes), and can distinguish "a text
message" from "an attachment" by that count. This guarantee is therefore
precise for single-packet messages and approximate — bucketed, not exact —
for multi-packet ones. Also about *length* leakage specifically, not *timing*
leakage (see Tier 3).

### 1.3 Per-contact wire-ID is computationally indistinguishable from random

The identifier presented on the wire to each contact is
`HMAC-SHA256(pair_secret, contactId + hour)`, where `pair_secret` is a
SHA-256 hash of both parties' message keys. Under the standard cryptographic
assumption that HMAC-SHA256 is a secure pseudorandom function (the basis of
virtually all modern authentication protocols, including TLS), an observer
who does not know the pair secret cannot distinguish this ID from a
uniformly random 256-bit string — and therefore cannot link the same device's
IDs across two different contacts, or predict next hour's ID from this hour's.

**This depends on:** HMAC-SHA256's PRF security assumption (industry-standard,
not proven in the absolute mathematical sense but unbroken and foundational
to modern cryptography), and both message keys staying secret.

**Rotation instant is also per-contact, not just the value (2026‑09‑16):**
`hour` above used to mean the literal wall-clock hour — the same for every
contact, so while the *IDs* were unlinkable, the *moment* they all changed
was identical and synchronized across every contact, on the hour, every hour.
`IdentityManager.pairRotationOffsetSeconds()` now phase-shifts each contact's
bucket by a deterministic 0–3599s offset derived from that pair's own
`pair_secret` — both devices compute the identical offset without exchanging
anything new (it falls straight out of material already fixed at pairing).
Removes the "several of this device's wire-IDs changed at the same instant"
timing signal an observer watching multiple paths at once could otherwise
have noticed, on top of the values already being unlinkable. Cross-platform
(relay) contacts are unaffected — they already rotate on an explicit
generation counter (`wechsel()`), never a wall-clock bucket.

**`contactId` above is also now per-contact, not a global value (2026‑09‑17):**
The `contactId` fed into the HMAC used to be `IdentityManager.userId` — one
value, generated once at install, presented identically to every contact
this device ever pairs with. The wire-ID *output* was still unlinkable
per-contact (different `pair_secret` per contact), but `userId` itself was
sent in the clear in every pairing QR and stored as-is by every contact —
so any two of your contacts comparing notes (or a QR someone photographed
once) could trivially confirm "this is the same person" by that field
alone, no cryptanalysis needed. Right after pairing completes, both devices
now generate a fresh random per-contact identity locally and exchange it
over the pairing's own already-encrypted channel (a `NEW_IDENTITY` control
signal, same shape as the existing onion-update/Wechsel signals); the
wire-ID HMAC uses that from then on. `userId` is now purely a *pairing-time*
value — what a NEW contact's QR shows before that exchange happens — and is
user-renewable at any time (Settings → "Pairing identity" → Renew) without
affecting any existing contact, since they've already moved off it. This
also closes a related gap: `Contact.id` (the local database row key) is no
longer the value a scanned QR claims to be, so a spoofed/re-issued QR
claiming an existing contact's pairing identity can no longer silently
overwrite their stored keys via Room's insert-replace behavior — it's
rejected with a warning instead (see `handleScannedQr` in
`QrPairViewModel.kt`).

**Known gap, not yet closed:** LAN (same-Wi-Fi) peer discovery still
broadcasts the global, pre-renewal `userId` as its mDNS/NSD service name
(`unpruuf_<first 8 chars>`), visible to anyone on the same Wi-Fi network —
this is a coarser, LAN-local version of the same correlation class the fix
above addresses for the wire-tag. Not addressed in this pass; would need
per-contact LAN service registration, a larger change against Android's NSD
framework limits. See `STATUS.md` §3.

---

## Tier 2 — Architectural guarantees (true by absence, verifiable in code)

These are not probabilistic — they are facts about what the software does
and does not do, verifiable by reading the source. "There is no X" is a
strong, checkable claim precisely because it's an absence, not a defense.

| Claim | Why it's provable |
|---|---|
| **There is no server that can be subpoenaed, hacked, or seized to obtain messages.** | The codebase contains zero backend API calls for messaging — only direct Tor/LAN sockets between two devices. There is no infrastructure to compromise because none exists. |
| **unpruuf itself never writes message content to disk.** | Messages live only in `InMemoryMessageStore`, a Kotlin `Map` in process RAM. There is no file I/O, no database table, no cache path for message bytes anywhere in the send/receive/store code. (Only *contacts* — not messages — are persisted, and that store is SQLCipher-encrypted.) |
| **Deleting a chat overwrites the RAM buffer with zeros before dropping the reference.** | `RamMessage.zeroize()` explicitly writes `0` into every byte of the content array before nulling it, rather than just dereferencing it and hoping the garbage collector clears it. |
| **The app never learns or stores a self-chosen username.** | There is no username field, model, or UI for it — a contact is identified only by a key pair and a name *they* assign locally. |
| **Every edition presents a different on-wire ID to every contact.** | The identity sent over the socket is derived per-(contact, hour), not the same for all contacts — verifiable in `IdentityManager.myWireId()` and its call sites. |
| **Private key material is never stored in plaintext at rest.** | The ratchet identity private key, Tor hidden-service private keys, per-contact onion private keys, and our message-decryption key are encrypted before being written to disk. iOS has always done this via the hardware-backed Keychain (`KeychainStore.swift`). Android closed the same gap on 2026-08-27: these values are now encrypted with `CryptoManager`'s Android Keystore-backed AEAD before being written to `SharedPreferences` — see `IdentityManager.kt`. Before this date, Android stored these values in plain `SharedPreferences`, readable via root or an `adb backup`; this row was not yet true for Android. |

---

## Tier 3 — Best-effort protections (real, but not absolute)

These measurably reduce risk and are engineered carefully, but they are
probabilistic or depend on external conditions we don't fully control. Be
precise: "best-effort" is not "weak" — it's honest about the difference
between a proof and a strong mitigation.

- **Traffic-timing resistance (dummy/cover traffic).** Randomized cover
  packets make it harder to tell *when* real communication happens, but the
  schedule is per-device randomization, not a constant-rate channel with a
  formal anonymity guarantee. A well-resourced adversary correlating timing
  across many observation points could still gain statistical signal over a
  long enough window.
- **Screenshot / screen-recording block (`FLAG_SECURE`).** This is a real
  OS-enforced flag that blocks the standard screenshot API and the
  recent-apps thumbnail. It does not stop a second camera photographing the
  screen, and there have been OEM-specific `FLAG_SECURE` bypass bugs on some
  Android skins over the years (patched over time, but the flag is an OS
  contract, not a law of physics).
- **PIN lock.** Protects against casual/opportunistic access to an unlocked
  or found device. It does **not** resist offline brute force to the same
  degree as the crypto above — see the explicit math in the Limitations
  section, because the PIN's own entropy is the limiting factor, not the
  hashing.
- **Battery-optimization exemption + hidden-service keep-alive.** These
  measurably improve message delivery reliability under Android Doze and on
  mobile data, but reliability still depends on the OS, the carrier network,
  and the Tor network's current health — none of which unpruuf controls.
- **Optional store-and-forward relay.** Off by default; a user who enables it
  trusts a relay operator (themselves, by default — see `server/README.md`)
  to run the mailbox honestly. The relay is architecturally blind to contact
  identity and message content (it stores only already-Double-Ratchet-
  encrypted blobs addressed by the same rotating wire tag the direct path
  uses), but it *can* see the tag itself, timing of pushes/fetches, and
  sender IP (mitigated by the relay only being reachable over its own Tor
  hidden service). Every relay instance also requires a random bearer token
  (generated once, handed to each app out-of-band via QR/copy-paste) on
  every request, so an outsider who merely learns the relay's address —
  without the token — gets a flat 401 and can't even probe whether a given
  tag has anything queued. Chunked file/photo transfers are relay-eligible
  too (each chunk carries its own index, so out-of-order relay delivery no
  longer corrupts reassembly) — the same §1.2 caveat about a large transfer
  being distinguishable from a text message by packet *count* therefore
  applies at the relay as well, not only to a raw network observer: an
  authenticated relay operator sees roughly how many blobs one tag holds.
  This is a best-effort convenience for offline delivery, not a component
  the rest of this document's Tier-1 guarantees depend on — those all hold
  with the relay left disabled, which is the default.
- **Bidirectional contact/chat deletion.** Delivered through the same
  retrying queue as messages — it will eventually reach the other device
  once it's reachable, but "instant" is not guaranteed if the peer is
  offline; it's guaranteed *eventually*, not guaranteed *immediately*.

---

## What we explicitly do NOT claim

Being precise about strengths only matters if we're equally precise about
limits. These are known, real gaps — not hidden ones.

1. **Forward secrecy — now bidirectional.** As of this update, every chat
   session runs a full Double Ratchet (X25519 DH ratchet + HKDF root/chain-key
   derivation + XChaCha20-Poly1305, with a Signal-style skipped-message-key
   cache bounded per contact for out-of-order/lost messages). The session
   bootstraps from a single X25519 DH agreement seeded at pairing time (see
   `RatchetSessionManager`), and every message after that advances the chain
   in both directions — a key used to encrypt or decrypt one message is
   overwritten immediately after, never derivable again from anything that
   persists on the device.

   - ✅ **If the SENDING device is compromised later, messages it previously
     SENT cannot be decrypted from that device** (as before).
   - ✅ **If the RECEIVING device is compromised later, messages it previously
     RECEIVED cannot be decrypted from that device either** — this closes the
     gap the previous sender-only scheme (shipped 2026-07-10, one-time-ECIES)
     left open. Only the ratchet state needed for the *next* message survives
     in the encrypted contacts DB; every key that decrypted a *past* message
     is already gone.

   This was verified the same way the rest of this codebase's crypto is
   verified before being trusted: the ratchet, its header framing, and the
   chunked outer-packet transport it rides on were each compiled and executed
   standalone against the exact pinned Tink version this project uses (not
   just reasoned about on paper), including two-party exchange in both
   directions, out-of-order delivery, and a simulated lost message forcing
   the skipped-key path.
2. **A compromised or rooted device defeats everything.** Every guarantee
   above assumes the app is running on an uncompromised OS. A malicious
   keyboard, a modified OS bypassing `FLAG_SECURE`, root access reading
   process memory live, or malware with accessibility-service access can
   observe plaintext regardless of what the app does — no app-layer
   cryptography defends against a compromised layer underneath it. As of
   2026-08-21, unpruuf and the relay refuse to run at all on a device that
   heuristically looks rooted (`RootDetector`, checked before Tor/the
   listener/the relay ever start — see `CHANGELOG.md`) — this narrows the
   practical risk considerably, but it is still Best-effort, not proof: a
   determined root-hiding framework (Magisk Hide, Zygisk + Shamiko) can in
   principle defeat on-device heuristics like these.
3. **RAM is not disk, but RAM is not absolutely unrecoverable either.**
   "Never written to disk" is true of unpruuf's own code. It is not a claim
   that message bytes can *never* physically touch persistent storage under
   any OS circumstance (e.g., a live forensic RAM-dump tool on an unlocked
   device, or unusual OS-level memory management) — those are outside the
   app's control by definition.
4. **A short PIN has limited entropy — the math, plainly stated.** A 4-digit
   PIN has exactly 10,000 possible values. PBKDF2 with 120,000 iterations
   makes each *guess* computationally expensive, but 10,000 total guesses is
   still a small, exhaustible number for an attacker with the stored hash
   (e.g., from a compromised device). Longer PINs matter a lot here — the
   app supports up to 12 digits (10¹² possibilities), which is a meaningfully
   different proposition:

   | PIN length | Possible values |
   |---|---|
   | 4 digits | 10,000 |
   | 6 digits | 1,000,000 |
   | 8 digits | 100,000,000 |
   | 12 digits (max) | 1,000,000,000,000 |

   A 4-digit PIN is convenient, not strong. This document exists to make sure
   nobody assumes PBKDF2 iteration count alone rescues a short PIN — it slows
   an attacker down per guess, it does not create entropy that was never
   there.
5. **The panic PIN is a duress feature, not a cryptographic one — and this
   document itself is public knowledge of it.** Any duress-PIN scheme has an
   inherent limitation: a coercive adversary aware such a mechanism might
   exist can force disclosure of *both* PINs and test the "wrong" one first,
   or otherwise prevent the wipe from completing (e.g., by keeping the
   device powered and imaging it before unlock). This is a known, general
   limitation of duress mechanisms, not something unique to unpruuf.
6. **Edition pairing rules (Standard/Pro/Client) are policy, not cryptography.**
   The rule "Client can only pair with Pro" is enforced by app logic
   (`AppEdition.canAdd()`), checked at scan time. It is not backed by a
   cryptographic protocol restriction — a modified/rebuilt client could
   ignore this check. It prevents accidental misuse in the shipped app; it
   is not a security boundary against a deliberately altered client.
7. **Global Tor-level traffic correlation is not solved — by us or by anyone.**
   A global passive adversary capable of observing traffic at both the entry
   and exit points of the Tor network can, in principle, correlate timing to
   deanonymize circuits. This is a known, unsolved, industry-wide limitation
   of the entire Tor network, not a gap specific to unpruuf. We inherit Tor's
   protections and Tor's open research problems alike.
8. **Address isolation is now partial, by a deliberate reliability trade-off —
   and closing the gap is now in-app, not just delete + re-pair.**
   New pairings share one main onion address per device (see
   `STATUS.md`/`CHANGELOG.md` — this was changed to fix real delivery
   failures on Doze/mobile). The per-contact **wire-ID still rotates
   hourly and differs per contact** (Tier 1.3 above still holds), but two
   colluding contacts could in principle notice they're talking to the same
   onion address. This is disclosed, not hidden. A contact paired before
   this device had a main onion still uses its own legacy per-contact onion
   until told otherwise; either side can now send an in-app "updated
   connection info" message (chat screen, `sendMainOnionUpdate()`) to move
   that pairing onto the current main onion, instead of requiring the older
   delete-and-re-pair workaround. The receiving side validates the new
   address's shape before accepting it. This doesn't change the underlying
   trade-off above — it only makes adopting it, or reverting a legacy
   pairing's isolation loss, something either party can do without losing
   the pairing's message history or re-doing the QR ceremony.
8a. **Verified contacts get a second, daily-rotating onion — narrows, does
   not close, the gap above (2026‑09‑17, not yet tested against real Tor).**
   `TorManager.ensureVerifiedOnion()` maintains a SEPARATE onion address from
   the shared main/pairing one, only ever handed to contacts whose safety
   number you've confirmed (`Contact.isVerified`). Its Ed25519 identity key
   is re-derived once a day from a device-local secret
   (`IdentityManager.verifiedOnionFactor`, 32 random bytes, never
   transmitted) via `Ed25519OnionDerivation` — standard RFC 8032 seed
   expansion (SHA-512 + clamping), the same scheme Tor's own key generation
   uses. Self-tested (a real self-connect probe) before ever being announced
   to a contact, specifically so a derivation mistake surfaces as "nothing
   got announced this round" in logs rather than silently breaking
   reachability. **Deliberately not** a zero-signal design: a contact does
   NOT independently compute the new address each day — that would require
   them to also do the Ed25519 public-key point multiplication and the
   SHA3-256 checksum Tor's v3 address format needs, real elliptic-curve
   library code this project decided not to hand-roll and ship unverified.
   Instead, each rotation is announced once, over the already-encrypted
   channel, the same way the legacy-onion migration above already works.
   Net effect: two verified contacts can still, at any given moment, notice
   they share an address — but that shared value now changes daily instead
   of forever, bounding how long such a comparison stays valid. **Please
   confirm actual rotation + reachability on two real devices before relying
   on this for anything sensitive** — this is the one piece of this
   session's work with genuine cryptographic implementation risk that
   could not be exercised against a live Tor control port in the
   environment that wrote it.
9. **No independent security audit has been performed.** Every claim in this
   document is derived from reading the current source code and applying
   established cryptographic reasoning — it has not been reviewed by an
   external, independent security firm. Treat this as an engineering
   self-assessment, not a certification.

---

## Everything above assumes

- The app the user is running is the genuine, unmodified build from this
  codebase (build/supply-chain integrity is out of scope for this document).
- The device's OS and hardware are not already compromised.
- Both parties' devices individually protect their own key material (a leak
  on one side affects that side's guarantees regardless of what the other
  side does correctly).
- Cryptographic primitives (AES-256-GCM, HMAC-SHA256, PBKDF2, ECDH over
  secp256r1) remain unbroken by public cryptanalysis, as they have been for
  their respective histories to date.

---

## One-line honest summary

**unpruuf can prove, with math or with code, that there is no server to
attack, that message length and per-contact identity leak no information to
a passive observer, that its core encryption is unbreakable by brute force in
any physically realizable sense, and that a later compromise of either your
own device or your contact's device cannot unlock messages already sent or
received between you — provided the device it runs on is not itself
compromised beforehand and the PIN is chosen with real entropy.**

---

*Companion documents: `STATUS.md` (feature status + fix history), `EDITIONS.md`
(Standard/Pro/Client). This document should be revisited whenever a claim
above changes — e.g., once per-contact address isolation is restored.*
