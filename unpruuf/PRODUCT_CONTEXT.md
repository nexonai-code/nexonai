# unpruuf — Product Context (for LLM use)

**Purpose of this document.** A single, self-contained primer so any LLM —
a support assistant, a sales-copy drafter, an internal Q&A tool — can answer
questions about unpruuf accurately, without needing the rest of the repo.
It condenses `STATUS.md` (feature status), `SECURITY_CLAIMS.md` (what's
actually provable vs. best-effort vs. explicitly not claimed), `EDITIONS.md`
(Standard/Pro/Client) and `MARKETING.md` (positioning) into one place.

**One rule above all others when using this document:** never say more than
`SECURITY_CLAIMS.md` supports. unpruuf's whole credibility argument is
precision — pairing every strong claim with its actual scope and its
assumptions. Do not round "best-effort" up to "guaranteed," don't claim
something is shipped if the status below says 🟡 or ⛔, and don't say
"audited" — it hasn't been. When unsure, say what's known and flag the gap
rather than filling it in.

**Do not use `PATENT_DISCLOSURE.md`'s content in anything public-facing.**
That document is a confidential invention disclosure prepared for patent
counsel; public disclosure of its mechanisms before filing can destroy
patent rights outside the US. It exists, it's not summarized here, and any
answer touching "is this patented / patent-pending" should say only that
patent filing is under evaluation with counsel — nothing more specific.

---

## 1. What unpruuf is, in one sentence

**unpruuf isn't built to hide what you said. It's built so there's nothing
left to prove you said it.** A serverless, peer-to-peer, Tor-based encrypted
messenger — two devices talk directly to each other, with no company, server,
or account anywhere in the middle, and no message ever touches disk.

Category note: unpruuf is deliberately narrower than mainstream messengers
(no group chat, limited offline delivery) because both of those require
infrastructure — a membership list, a mailbox — that the "no server, ever"
guarantee removes by design. It should be positioned as a structural privacy
guarantee, not as "a messenger with more features."

**Status: active beta.** Functionally complete for 1:1 text/photo/file
messaging on Android; not yet independently audited; iOS exists as an
early, unverified build (see §8).

---

## 2. Who builds it

Built by **NexonAI**. Package `com.nexonai.unpruuf`. Internal architecture
name: **GRAL**. Primary, most mature platform: **Android**. An iOS build and
an optional self-hosted relay server also exist (§8).

---

## 3. Products & editions

One Android codebase ships as **three separately installable editions**
(different install IDs, so all three can run on one phone at once). They
share 100% of the protocol/security code — only pairing rules and app color
differ.

| Edition | Price | Color | Who it's for | Can pair with |
|---|---|---|---|---|
| **Standard** | €14.99/month | Teal | Individuals wanting the full private-messenger experience | Standard, Pro |
| **Pro** | €49/month | Gold | Power users / businesses — the hub that can reach everyone | Standard, Pro, unlimited Clients |
| **Client** | **Free** | Blue | The counterpart a Pro user hands out to their own contacts | Pro only (unlimited Pro accounts) |

- Client↔Client and Standard↔Client are both blocked. Pro is the only
  edition that can add anyone.
- The Pro↔Client relationship is **many-to-many**, not 1:1: one Client can be
  paired with any number of different Pro accounts, and one Pro account can
  invite any number of Clients.
- Client being free is deliberate — it's meant to be handed out widely by a
  Pro user (e.g. to their own customers/contacts) at no cost to them.
- Pairing rules are enforced in app logic (`AppEdition.canAdd()`), not
  cryptographically — see §6's limits.

---

## 4. Architecture at a glance

- **Transport:** direct Tor v3 hidden service per device (receiving) + a
  same-Wi-Fi LAN fast path (NSD discovery + direct TCP). No relay/server in
  the default path.
- **Identity:** no username, no phone number, no account. Identity is a
  locally generated key pair; you become reachable only by showing a QR code.
  Each contact gets its own **hourly-rotating** on-wire identifier so two of
  your contacts can't correlate that they're both talking to you.
- **Encryption:** full **Double Ratchet** (X25519 DH ratchet + HKDF chain
  keys + XChaCha20-Poly1305, Signal-style skipped-key cache) inside an outer
  AES-256-GCM transport envelope. Forward secrecy is **bidirectional** — a
  later compromise of either device doesn't expose past messages either
  direction.
- **Storage:** messages exist **only in RAM**, zeroized on background/lock/
  5-minute TTL. Only the encrypted contact list persists on disk
  (SQLCipher/AES-256) — contacts, never message content.
- **Traffic shape:** every packet padded to a fixed 4096 bytes (message
  length hides completely for single-packet messages); randomized dummy/
  cover traffic to obscure timing.
- **Reliability:** ACK'd delivery queue with progressive backoff, path
  warm-up, network-change recovery (reactive + a proactive periodic
  self-check — see §7), hidden-service keep-alive, foreground service +
  battery-exemption request to survive Android Doze.
- **Duress:** PIN lock + a separate panic PIN that instantly wipes all
  contacts and keys, indistinguishable from a fresh install.
- **Censorship circumvention:** Tor bridge support (vanilla bridges working;
  obfs4/Snowflake wired but unverified against a real build — see §7).

---

## 5. The seven structural differentiators (positioning language)

Use these when explaining *why* unpruuf is different, not just *that* it is:

1. **No server, anywhere, ever** — nothing exists to breach, subpoena, or backdoor.
2. **No phone number, email, or account** — identity is a local key pair, shared via QR.
3. **RAM-only messages** — zeroized on background/lock/TTL, never written to disk.
4. **Per-contact identity that rotates hourly** — contacts can't correlate you with each other.
5. **A panic PIN** — near-unheard-of in consumer messaging.
6. **Bidirectional forward secrecy** — a later device compromise, on either side, can't decrypt past messages.
7. **Nothing to see on the wire or lock screen** — fixed-size packets, decoy traffic, anonymous notifications.

Head-to-head positioning: no mainstream competitor (WhatsApp, Signal,
Telegram) combines *all* of: no server, no account, no on-disk message
storage, rotating per-contact identity, and a duress wipe. Signal is
correctly respected for protocol quality but still requires a phone number
and a central relay; Telegram's default chats aren't even E2E encrypted;
WhatsApp inherits Signal's protocol inside Meta's infrastructure. Always
pair a superlative ("most private") with the reasoning — never state it bare.

---

## 6. What can actually be claimed (security precision)

Three tiers — get this distinction right, it's the entire credibility model:

**Tier 1 — provable (math/code, not opinion):**
- AES-256-GCM brute force is physically infeasible (bounded by the Landauer
  limit — more energy than the Sun will radiate in its lifetime), assuming
  no implementation bug and a real random key.
- Fixed 4096-byte padding leaks **zero bits** of message length for
  single-packet messages (multi-packet file/photo transfers leak
  *approximate* size via packet count, not exact length — stated precisely
  in `SECURITY_CLAIMS.md` §1.2, don't round this up to "hidden").
- The per-contact wire ID is computationally indistinguishable from random
  (HMAC-SHA256 PRF assumption).

**Tier 2 — architectural (true by absence, verifiable in source):**
- No server exists to subpoena/hack/seize.
- unpruuf's own code never writes message content to disk.
- Deleting a chat overwrites RAM with zeros before dropping the reference.
- No username field/model/UI exists anywhere.

**Tier 3 — best-effort (real, but not absolute — say so):**
- Timing-correlation resistance (randomized, not constant-rate).
- `FLAG_SECURE` screenshot blocking (OS-enforced, not physics — a second
  camera or an OEM bypass bug isn't stopped by it).
- PIN lock (a short PIN has genuinely low entropy — see the explicit table
  in `SECURITY_CLAIMS.md` §4; don't imply PBKDF2 rescues a 4-digit PIN).
- The optional relay (§8) — architecturally blind to content/identity, but
  sees the wire tag, timing, and sender IP unless mitigated by its own
  hidden service.

**Explicitly NOT claimed — say these proactively when relevant, don't wait to be asked:**
- No independent third-party security audit has happened.
- A compromised/rooted device defeats every app-layer protection.
- Global Tor-level traffic correlation by a nation-state-class passive
  adversary is not solved — by unpruuf or by anyone; this is an
  industry-wide open problem inherited from Tor itself.
- Edition pairing rules (Standard/Pro/Client) are app policy, not a
  cryptographic boundary — a modified client could ignore them.
- Address isolation is **partial**: pairings made before a device had one
  "main onion" still use their own legacy per-contact onion until either
  side sends the in-app migration message (now also proactively prompted —
  see §7). The wire-ID still rotates hourly regardless, so identity
  isolation is unaffected — only address isolation has this gap.

---

## 7. Current status snapshot

Legend: ✅ done & working · 🟡 partial / has a caveat · ⛔ not started.

| Area | Status | One-line note |
|---|---|---|
| Core P2P messaging (Tor + LAN) | ✅ | ACK'd delivery queue, adaptive retry/backoff, delivery ticks. |
| End-to-end encryption | ✅ | Bidirectional Double Ratchet, verified via standalone crypto tests. |
| RAM-only storage / anti-forensics | ✅ | 5-min TTL, wipe on background/lock, `FLAG_SECURE`, anonymous notifications. |
| Identity/contact isolation (ID) | ✅ | Hourly-rotating per-contact wire ID. |
| Identity/contact isolation (address) | 🟡 | Legacy per-contact onions still exist for old pairings; migration is now proactively prompted, not just a manual button. |
| Traffic-analysis resistance | 🟡 | Fixed padding ✅; timing resistance is randomized-decoy, not constant-rate. |
| Duress / access control (PIN, panic PIN) | ✅ | Both shipped and working. |
| Background/mobile reliability | ✅ | Wakelock, battery-exemption prompt, 20s HS keep-alive, network-switch recovery (reactive + a proactive periodic self-check independent of OS network-change events). |
| Editions (Standard/Pro/Client) | ✅ | Full pairing matrix, per-edition color/port. |
| Censorship circumvention | 🟡 | Vanilla Tor bridges ✅; obfs4/Snowflake wired but **unverified against a real compiled build** (no Android SDK in the dev environment that wrote it). |
| Optional relay (offline delivery) | ✅ | Off by default; blind store-and-forward, bearer-token auth, TTL-bounded. |
| iOS app | 🟡 | Early build, relay-mandatory mode, **unverified end-to-end** — see §8. |
| Independent security audit | ⛔ | Not performed. Every security claim rests on internal engineering analysis. |
| Group chat | ⛔ (by design) | Structurally out of scope for the current 1:1, no-membership-infrastructure model. |
| Voice messages | ⛔ | Not built yet. |
| EXIF/metadata stripping (gallery images) | ⛔ | Not built yet (camera-captured photos have no EXIF to begin with). |

---

## 8. Platforms in detail

### Android — primary, most mature
Full feature set from §7. Three Gradle-flavor editions from one codebase.
Requires a physical device to test reliably (Tor hidden services are flaky
on emulators). This is the platform every other claim in this document
describes unless stated otherwise.

### iOS — early, unverified
A **separate app** (`unpruuf/ios/`), not a port of Android — iOS can't sustain
a persistent background hidden service, so it uses a **relay-mandatory**
mode instead: identical Double-Ratchet crypto core (ported, with its own
test suite), but messages always go through a self-hosted relay rather than
a direct hidden-service connection. **Cannot yet talk to Android** — Android
has no matching cross-platform/relay-mandatory support built yet. Written
without access to a Mac/Xcode/Swift toolchain, so treat every iOS claim as
"implemented, not yet confirmed by an actual compile or test run" until
that changes.

### Relay server — optional, self-hosted, off by default
A blind store-and-forward mailbox (`unpruuf/server/`) for exactly one case:
the recipient is offline when you send. Only ever sees already-encrypted,
opaque blobs addressed by the same rotating wire tag the direct path uses —
never plaintext, never contact identity. Requires a bearer token per
instance; delete-on-fetch; TTL-bounded. Runs via Docker or a standalone
Windows `.exe` (no separate Node.js/Tor install needed for the person
running it). This is what iOS's relay-mandatory mode also depends on.

---

## 9. What's most important right now

In rough priority order, reflecting what's actually tracked as open work:

1. **Independent security audit** — the single biggest gap between "we
   believe this is very private" and "this is proven." Nothing else on this
   list matters as much for credibility with a security-literate audience.
2. **obfs4/Snowflake verification on a real Android build** — currently
   wired in code but never compiled/run against a real Android SDK; needed
   before claiming censorship-circumvention as shipped, not just "wired."
3. **Full address isolation for legacy contacts** — architecture is done
   (main onion + migration message + proactive in-app prompt); depends on
   users on both sides actually running it, which is a UX/adoption question
   now, not an engineering one.
4. **iOS ↔ Android interop** — doesn't exist yet; Android needs
   relay-mandatory-mode support before the two platforms can talk to each
   other at all.
5. **Constant-rate cover traffic** — current timing resistance is
   randomized, not a formal constant-rate guarantee.
6. **Automated test coverage** — delivery-queue backoff, packet padding,
   ratchet/chunking, and relay HTTP framing are covered; wire-ID resolution
   (`IdentityManager`) is not yet unit-tested.

---

## 10. Explicit non-goals / limits (state these unprompted when relevant)

- **No group chat**, by design — see §1's category note.
- **No indefinite offline mailbox** by default — the optional relay is
  TTL-bounded and opt-in, not a permanent inbox.
- **Not audited.** Beta software. Say this plainly; it's more credible to a
  security-literate audience than silence.
- **A compromised device defeats everything** — no app can protect against
  a rooted/malware-infected OS reading its memory directly.
- **Global network-level traffic correlation is unsolved** — inherited from
  Tor, not an unpruuf-specific gap.

---

## 11. Quick-answer FAQ

**"Is unpruuf end-to-end encrypted?"** Yes — bidirectional Double Ratchet
(X25519 + HKDF + XChaCha20-Poly1305), same cryptographic family Signal uses,
inside an outer AES-256-GCM transport layer.

**"Does unpruuf have a server?"** No, none, ever, for messaging. An
*optional*, self-hosted, blind, off-by-default relay exists only to hold an
encrypted blob temporarily when the recipient is offline — it's not a
backend and can't read anything.

**"Can unpruuf read my messages?"** No — there is no NexonAI-operated
infrastructure in the message path at all to read anything from.

**"Has unpruuf been audited?"** No. This should always be said directly,
not hedged around.

**"Is it better than Signal?"** Different category, not a strict upgrade —
see §1 and §5. Signal's protocol is excellent; unpruuf's difference is
architectural (no server, no account, no on-disk storage), which Signal
doesn't attempt.

**"What does it cost?"** Standard €14.99/mo, Pro €49/mo, Client free — see §3.

**"Is it patented?"** Under evaluation with patent counsel — do not say
more than that (see the note at the top of this document).

**"Can I use it in [heavily censored country]?"** Vanilla Tor bridges work
today; obfs4/Snowflake (for deep-packet-inspection-based blocking) is wired
but not yet verified against a real build — say "in progress," not "supported."

---

## 12. Source-of-truth map

If a question needs more depth than this document, the authoritative repo
docs are (all in `unpruuf/`):

| File | What it's for |
|---|---|
| `STATUS.md` | Full feature-by-feature status table + fix history. |
| `SECURITY_CLAIMS.md` | The rigorous technical backing behind every security claim, tiered by confidence, with explicit limits. **Nothing in public copy should say more than this supports.** |
| `EDITIONS.md` | Full Standard/Pro/Client pairing-rule and build detail. |
| `MARKETING.md` | Positioning, head-to-head comparison table, public-copy guidance. |
| `CROSS_PLATFORM_PLAN.md` | The iOS/relay-mandatory-mode design this was built from. |
| `CHANGELOG.md` | Dated history of every delivered change, newest first. |
| `server/README.md` | Relay server scope, API, credentials/TTL model. |
| `ios/README.md` | iOS build setup + known risk areas. |
| `PATENT_DISCLOSURE.md` | **Confidential, legal-use only — never summarize or quote this in anything public-facing** (see the note at the top of this document). |

---

## 13. Keeping this document current

This is a snapshot, not a live feed. Re-derive it (or at minimum re-check
§7's status table and §9's priority list) whenever `STATUS.md` or
`CHANGELOG.md` picks up a materially new entry — a shipped feature, a status
flip from 🟡 to ✅, or a new open item. Stale status claims are exactly the
kind of overclaiming §6 warns against.

---

*Companion documents: see §12. Generated as a standalone LLM-context primer
by NexonAI's development assistant; last synced against `STATUS.md` as of
2026-08-14.*
