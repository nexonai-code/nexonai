# unpruuf — Invention Disclosure (for Patent Counsel Review)

**Purpose of this document:** a technical description of the specific
engineering mechanisms in unpruuf that may be patentable, written for a
patent attorney to evaluate novelty/non-obviousness and draft real claims
from. **This is not a legal opinion, not a claim of patentability, and not
itself a patent application** — it is an inventor's technical disclosure,
the standard starting point before an attorney searches prior art and files.

**Inventor(s):** [fill in — legal name(s) of the person(s) who actually
conceived each mechanism below]
**Assignee (if applicable):** NexonAI
**Date of this disclosure:** 2026-07-11
**Project:** unpruuf — serverless P2P encrypted messenger, Android,
package `com.nexonai.unpruuf`

---

## Read this first: timing

Patent rights are **first-to-file**, and most jurisdictions outside the US
(including the EPO/Europe) require **absolute novelty** — any public
disclosure of a mechanism before a patent application is filed can destroy
patent rights in those jurisdictions permanently, with no grace period. The
US gives a 1-year grace period after the inventor's own public disclosure,
but only in the US.

**This project has already publicly disclosed some implementation detail**
(see the disclosure log at the end of this document). If any of the
mechanisms below are to be pursued, filing — at minimum a provisional
application in the US — should happen **before** any further public
technical write-up, blog post, expanded documentation, or open-sourcing of
the relevant code paths.

---

## Executive summary

Four candidate inventions are disclosed, in order of how strong their
novelty/non-obviousness case appears:

| # | Invention | Category | Strength (informal) |
|---|---|---|---|
| A | Per-contact, hourly-rotating, symmetric-pair-derived wire identifier | Method (anti-correlation identity scheme) | Strongest |
| B | Debounced network-change recovery with immediate path re-warm and queue re-flush | Method/process (P2P reliability over Tor hidden services) | Strong |
| C | Dual-tier hidden-service publication for backward-compatible reliability migration | Method/process (system migration without breaking existing peers) | Moderate |
| D | Combined system: rotating identity + fixed-size padding + per-message forward secrecy + RAM-only storage, applied together | System/combination claim | Depends on A–C; worth attorney's view |

None of these claim any cryptographic primitive itself (AES-256-GCM, ECDH,
HMAC-SHA256, Tor) as novel — those are prior art and are used as
off-the-shelf building blocks. The candidate novelty is in the specific
**process** built on top of them.

---

## A. Per-contact, hourly-rotating wire identifier derived from a symmetric pair-secret

### Problem in the prior art
In peer-to-peer or federated messaging systems, a device typically presents
a single, stable identifier (a username, a public key, a phone number, or a
single node address) to every party it communicates with. Any two parties
who both talk to the same device can compare that identifier and determine
they are both in contact with the same person — even if message *content*
is fully end-to-end encrypted. This is a metadata-correlation problem that
content encryption alone does not solve. Existing approaches to reducing
this (e.g., rotating public keys via a ratchet, or one-time onion addresses)
either require ongoing key exchange overhead, break resumability, or (in
Tor-hidden-service-per-contact schemes) impose one hidden service per
contact, which the same project found unreliable at scale on mobile
devices (see Invention C).

### Summary of the mechanism
Each pair of devices (A, B) that have exchanged long-term symmetric message
keys during initial pairing derives a **pair-secret** as:

```
pair_secret = SHA-256( min(keyA, keyB) || max(keyA, keyB) )
```

using an order-independent byte comparison so both sides compute the
identical value regardless of which side is "A" or "B" without any
additional handshake message. A **wire identifier** presented on the
network layer is then derived per **(pair, current hour)**:

```
wire_id(self→peer, hour) = HMAC-SHA256( pair_secret, self_user_id || ":" || hour )
```

where `hour = floor(unix_time / 3600)`. Both sides can independently
compute the *other* side's expected current wire ID (and the previous/next
hour's, to tolerate clock skew) without any further communication, because
both hold the same `pair_secret` and both know the epoch hour.

The key properties, believed non-obvious in combination:
1. **No stable identifier is ever transmitted for routing/authentication.**
   The value on the wire changes every hour, per contact.
2. **Different contacts of the same device see cryptographically unrelated
   identifiers**, because each pair's `pair_secret` differs (it depends on
   the pairwise key material of *that* relationship only) — two colluding
   contacts gain zero information by comparing the IDs they each see.
3. **No additional round trip or synchronization message is required** to
   rotate — both sides derive the same value independently from a shared
   secret plus wall-clock time, so rotation is "free" (no re-keying
   handshake, no ratchet state to keep synchronized, no risk of the two
   sides' rotation states diverging).
4. **The scheme is stateless and self-healing** — a device that was offline
   for days can resume correct correlation immediately upon reconnecting,
   with no recovery handshake, because the current wire ID is a pure
   function of (pair_secret, current hour).

### What appears novel/non-obvious
The combination of (a) a symmetric, order-independent pair-secret derived
from existing pairing key material with no new exchange, (b) time-bucketed
HMAC rotation requiring no additional messages to stay synchronized, and
(c) applying this specifically to solve cross-contact correlation in a
serverless P2P transport (as opposed to, e.g., a federated server rotating
routing tokens) is the candidate claim. Rotating identifiers exist elsewhere
(e.g., MAC address randomization, Tor's own rotating rendezvous/onion
descriptors) but not, to the inventor's knowledge, as a **per-relationship**,
**handshake-free**, **HMAC-of-shared-secret-and-time** identity scheme in a
P2P messenger.

### Known prior art to search against (starting points for counsel)
- Signal Protocol "sealed sender" (hides sender from the *server* — a
  different problem, since Signal has a server; does not address
  cross-contact correlation on a serverless device-to-device link).
- Tor hidden-service descriptor rotation and rendezvous point selection.
- Bluetooth/Wi-Fi MAC address randomization schemes.
- Off-the-Record (OTR) and Signal's Double Ratchet key rotation (rotates
  *encryption* keys, not a separate routing-layer identifier).
- Briar (P2P messenger over Tor) and SimpleX Chat (queue-based, uses
  disposable per-connection addresses) — worth a direct feature comparison,
  as these are the closest competing serverless-messenger prior art.

### Implementation reference (for counsel, not for the application text)
`IdentityManager.kt` — `pairSecret()`, `hmac()`, `myWireId()`,
`expectedWireId()`, `currentHourBucket()`.

---

## B. Debounced network-change recovery with immediate path re-warm and delivery-queue re-flush

### Problem in the prior art
A device receiving messages via a Tor hidden service must keep its hidden
service's introduction points published to remain reachable. When the
underlying network changes (e.g., mobile data ↔ Wi-Fi), Tor's existing
circuits become stale, and simply waiting for Tor's normal circuit
management to notice can leave a device unreachable for a long, unpredictable
period. The naive fix — forcing Tor to rebuild all circuits and republish the
hidden service on every network-change event — has a side effect that is not
obvious from the reliability goal alone: on rapid, repeated switches (a
common real-world pattern, e.g., mobile → Wi-Fi → mobile within seconds),
each forced rebuild also destroys the *sending* path's warm circuits, so
naive per-event recovery can make outbound message latency *worse*, not
better, especially compounding across multiple rapid switches.

### Summary of the mechanism
1. **Debounce, not react-per-event:** network-change events within a short
   window (empirically 2.5 s) are coalesced into a single recovery action,
   rather than one recovery per raw OS network-change callback. Each new
   event within the window cancels and reschedules the pending recovery.
2. **Forced full rebuild, exactly once per settled burst:** after the
   debounce window elapses, the Tor control connection is instructed to
   briefly disable and re-enable networking (`DisableNetwork 1` → wait →
   `DisableNetwork 0`), which forces both (a) hidden-service descriptor
   republication (fixing inbound reachability) and (b) full client circuit
   rebuild — accepted as a controlled, one-time cost rather than something
   to avoid, because avoiding it leaves receiving broken.
3. **Immediate, targeted post-recovery action** (the part believed novel):
   rather than waiting for the application's periodic keep-alive/retry
   loops (which run on a much slower cadence, e.g., 20 s/60 s) to notice the
   network is healthy again, the recovery process **immediately and
   proactively**: (a) re-establishes ("warms") the outbound circuit to
   whichever contact's chat is currently open in the UI, and (b) re-triggers
   the outbound delivery queue's flush routine immediately, rather than
   letting it wait for its own backoff timer. This collapses "how long
   until sending recovers after a network switch" from the order of
   minutes (waiting on independent periodic loops to coincide) to seconds.
4. **Progressive backoff with wake-interrupt in the delivery queue**,
   composed with the above: the delivery queue retries failed sends with a
   backoff that starts fast (3 s) and grows on repeated failure (up to 15 s
   cap), but any backoff wait is immediately interrupted by either a new
   outgoing message being enqueued *or* by the network-recovery signal in
   (3) — so the recovery signal in (3) doesn't just trigger one flush, it
   also resets a queue that might otherwise be deep into a long backoff wait.

### What appears novel/non-obvious
The novelty is not "detect network change and reconnect" (well known) but
the specific **composition**: debounce → forced one-time dual-purpose
rebuild → immediate targeted re-warm of only the actively-relevant circuit
→ immediate interrupt-and-reset of an independently-running adaptive-backoff
delivery queue, engineered specifically because the straightforward
per-event reconnect strategy was tried first and found to make sending
worse under realistic repeated-switch conditions. The insight that a single
recovery signal must reach and reset *two independent subsystems*
(hidden-service publication and the delivery-queue's own backoff state)
immediately, rather than each recovering independently on its own schedule,
is the crux of the claim.

### Known prior art to search against
- Orbot's (Guardian Project) network-change handling (the `DisableNetwork`
  toggle technique itself is adapted from Orbot's known approach — counsel
  should confirm this specific technique is not separately patented or is
  in the public domain / prior art already).
- General mobile OS "network change → reconnect" patterns in messaging apps
  (WhatsApp/Signal reconnect logic) — these apps have a central server to
  reconnect *to*, which is a materially different problem than republishing
  a *receiving* hidden service while independently preserving a *sending*
  path's warmth.
- Tor Project documentation/source on hidden-service descriptor republication
  triggers.

### Implementation reference
`TorManager.kt` — `registerNetworkCallback()`, `bounceTorNetwork()`,
`networkChanged` (SharedFlow). `P2PNetworkManager.kt` — the
`torManager.networkChanged.collect { ... }` handler, `flushQueue()`
backoff/wake-interrupt logic.

---

## C. Dual-tier hidden-service publication for backward-compatible reliability migration

### Problem in the prior art
A P2P system that identifies each device by a Tor hidden-service address
faces a design tension: publishing **one** hidden service per contact
maximizes address-level unlinkability between contacts (no shared address
to correlate), but on mobile devices under aggressive OS power management,
keeping *many* hidden services simultaneously warm and reachable was found
to be unreliable in practice (introduction points for some services would
silently go stale while others stayed healthy, producing inconsistent,
hard-to-diagnose delivery failures). The straightforward fix — collapsing
to a **single** main hidden-service address per device for reliability —
directly breaks reachability for every contact that was already paired
under the old, per-contact scheme, since those contacts have no knowledge
of the new main address and are still sending to their old, no-longer
-published address.

### Summary of the mechanism
On startup, a device publishes:
1. Its current **main hidden service** (used for all new pairings going
   forward, shown in the pairing QR code), **and**
2. Every **legacy per-contact hidden service** it ever created for a prior
   pairing under the old scheme — by re-deriving each from its persisted
   private key and republishing it under the *same* onion address it had
   before, deduplicated by private key so an address published to multiple
   legacy contacts is only re-added to Tor once.

Both sets of hidden services route to the same local receiving port, so
inbound handling is identical regardless of which address a given contact
still uses to reach the device. New pairings are steered exclusively to the
main address; old pairings continue working, unmodified, indefinitely,
without requiring the user to re-pair. A pairing address that has not yet
been confirmed as an established contact is persisted **immediately upon
creation** (not only upon confirmation), specifically so that a
just-in-progress pairing that is interrupted by an app/device restart is
still recoverable — closing a race condition where a pairing could
otherwise become one-directionally broken depending on restart timing.

### What appears novel/non-obvious
The claim is the **migration mechanism** itself: a system that changes its
own addressing scheme for new relationships while transparently and
indefinitely honoring the old scheme for existing relationships, by
persisting and replaying every historical per-relationship credential at
every startup — allowing a live, already-deployed P2P identity scheme to be
changed without a flag day, without server-side coordination (there is no
server), and without breaking any existing pairing. This is a more general
pattern than Tor specifically (it is about protocol/addressing migration in
a decentralized system with no central coordinator), and may be worth
claiming at that more general level in addition to the Tor-specific
embodiment.

### Known prior art to search against
- Protocol version negotiation schemes in federated/decentralized protocols
  (e.g., Matrix, XMPP capability negotiation) — these typically negotiate
  via a live handshake rather than by silently republishing every legacy
  address unconditionally; worth a careful comparison.
- Key-rotation/backward-compatibility patterns in messaging protocols
  generally (e.g., Signal's prekey handling) — different problem (message
  key rotation vs. transport-address rotation) but adjacent enough that
  counsel should check.

### Implementation reference
`TorManager.kt` — `setupHiddenService()`, `restoreContactServices()`,
`createPairingOnion()` (immediate persistence), `confirmPairing()`,
`ensureMainOnion()`.

---

## D. Combined system claim (worth counsel's independent assessment)

Considered together, rather than individually, the system:
- presents a different, unlinkable, handshake-free rotating identifier per
  contact (A),
- pads every message to a fixed size regardless of content length (prior
  art technique, but integrated here),
- encrypts every outgoing message under a single-use key derived via ECDH
  and immediately discards the one-time private key (ECIES — prior art
  technique, integrated here),
- and stores message plaintext only in volatile memory, zeroized on a
  defined set of triggers (background, lock, deletion, TTL expiry),

is a single architecture whose *stated design goal* — that no observer,
including a colluding pair of the user's own contacts, and including
forensic examination of a later-seized device, can link identity, timing,
length, or historical content across messages or contacts — may be
claimable as an integrated system/method even though several of its layers
individually use known primitives. Combination claims of this kind are
inherently the most fact-sensitive and benefit most from an attorney's
independent read; this disclosure flags it rather than asserting it.

### Implementation reference
`NetworkObfuscation.kt` (padding), `CryptoManager.kt`
(`encryptForwardSecret`/`decryptForwardSecret`), `InMemoryMessageStore.kt`
(RAM-only + zeroization), plus A above for identifiers.

---

## What is likely NOT independently patentable (flagged so counsel's time isn't spent here)

- Use of AES-256-GCM, ECDH/secp256r1, HKDF, HMAC-SHA256, SQLCipher, or Tor
  hidden services themselves — all well-established prior art.
- The general concept of "a messenger with no central server" — an
  abstract idea/concept, not a technical process.
- The Standard/Pro/Client edition pairing-rule matrix (`AppEdition.canAdd()`)
  — this is a business/access-control rule enforced in application logic,
  not a technical mechanism; very likely fails as an abstract idea under
  *Alice*/§101 regardless of dressing.
- Fixed-size packet padding alone — a known traffic-analysis-resistance
  technique in the literature (e.g., Tor's own cell padding, VPN padding
  schemes).

---

## Public disclosure log (for counsel's timing assessment)

Documents and dates where implementation detail of the above mechanisms has
already been described, to the project's knowledge:

| Date | Document/venue | What was disclosed |
|---|---|---|
| 2026-07-09 | `CHANGELOG.md` entries (this repo) | General description of per-edition ports, delivery reliability, wire-ID rotation existing |
| 2026-07-09 | `CHANGELOG.md` | One-onion-per-device change and the `restoreContactServices` fix (Invention C, in general terms) |
| 2026-07-10 | `CHANGELOG.md` | Network-change debounce + re-warm/re-flush description (Invention B, in general terms) |
| 2026-07-10 | `CHANGELOG.md`, `SECURITY_CLAIMS.md` | Forward-secrecy (ECIES-per-message) design and its explicit scope |
| 2026-07-11 | `MARKETING.md`, published marketing Artifact | High-level, non-implementation-detail description of "hourly rotating identity" and "forward secrecy" as customer-facing features (no algorithm detail) |

**Repository visibility:** confirm with counsel whether the `nexonaicons/YuE`
GitHub repository (and its commit history) is public or private, and since
when — if any window of public visibility included the source files
referenced above, that is a public disclosure event for timing purposes.

**Recommendation:** treat 2026-07-09 (the earliest CHANGELOG description of
Invention B/C) as the working "disclosure clock start" until counsel
confirms otherwise, and prioritize filing (at minimum a US provisional)
promptly, before any further public detail is added to documentation,
marketing, or an open-source release.

---

## Suggested next steps

1. Engage a patent attorney or agent registered to practice before the
   USPTO, ideally with a software/cryptography/telecom background.
2. Provide this document plus read access to the referenced source files
   (`IdentityManager.kt`, `TorManager.kt`, `P2PNetworkManager.kt`,
   `NetworkObfuscation.kt`, `CryptoManager.kt`).
3. Ask counsel to run a prior-art/novelty search specifically against Briar,
   SimpleX Chat, Session (Oxen), and Signal's sealed sender, since these are
   the nearest public prior art for a serverless/rotating-identity messenger.
4. If counsel confirms viable subject matter, file a US provisional
   application first (fast, inexpensive, preserves a filing date) before
   deciding on full utility/PCT filing.
5. Pause further public technical disclosure of Inventions A–C's exact
   mechanisms until at least the provisional is filed.

---

*Companion documents: `SECURITY_CLAIMS.md` (security/cryptography scope),
`STATUS.md` (feature status), `CHANGELOG.md` (dated disclosure history).*
