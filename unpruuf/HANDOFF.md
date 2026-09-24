# unpruuf — Session Handoff Briefing

**Read this file first in a new chat.** It captures the working context, decisions, and open
threads that aren't fully captured by `STATUS.md`/`CHANGELOG.md` alone — those two are the
authoritative *project state* record; this file is the *how we work together and where things
stood* record, written for a new Claude session (possibly a different chat, same repo/branch) to
pick this project straight back up without re-deriving everything from scratch.

---

## 1. What this project is

`unpruuf` — a privacy-focused, serverless-by-default P2P messenger. Package
`com.nexonai.unpruuf`, architecture codename **GRAL**, built for **NexonAI** (the user, Gabriel
Hategan, runs NexonAI Consulting SRL — email `nexonai.consulting@gmail.com`). Three surfaces:

- **Android** (`unpruuf/app/`) — the original, most feature-complete app. Three Gradle-flavor
  editions (Standard/Pro/Client) with an offline Ed25519 license system.
- **iOS** (`unpruuf/ios/`) — a newer, deliberately-narrower "cross-platform companion" app. No
  editions, no license system, relay-mandatory (can't do direct P2P — iOS won't sustain a
  background hidden service). One universal app.
- **Relay server** (`unpruuf/server/` Node.js, `unpruuf/relay-android/` native Android relay) —
  an optional (Android) / mandatory (iOS) blind store-and-forward mailbox. Never sees plaintext.
  Runs via Docker/Linux, Windows, or macOS (`start-mac.command` + a SwiftUI menu bar app for
  convenient operation, `server/mac/MenuBarApp/`).

Full technical status: `STATUS.md` (huge, section-numbered, the single source of truth — read it,
don't take this file's summaries as a substitute for it). Delivery history: `CHANGELOG.md`
(newest first — the 2026‑09‑02 entries, numbered (1) through (10), are this session's). Wire
protocol / cross-platform design: `CROSS_PLATFORM_PLAN.md`. Threat model: `SECURITY_CLAIMS.md`.
Editions: `EDITIONS.md`.

## 2. The people, in the logs and in the app

- **Gabriel** — the user talking to Claude, runs Android, his device/contact shows as **"RT"** in
  Norbert's iOS contact list (their own local nickname for him, not a fixed convention — don't
  assume "RT" always means Gabriel in future sessions, check who's asking).
- **Norbert Hategan Benker** (`norbertbenker@MacBookPro`) — runs the Mac that hosts the shared
  relay (`~/unpruuf/server/`, onion `wnin3btpj635yzkmfs4eyp7m5diuy5gym7hteakky2w3gfpboeryu7qd
  .onion`) and two physical iPhones used for testing: an **iPhone 12 ("i12")** and an
  **iPhone 16 ("i16")**, both paired to each other AND to Gabriel's Android — all three currently
  share this one Mac relay instance (see §5's regression note — sharing one relay this way is not
  itself a bug, wire tags are per-contact-pair and don't collide, but it made earlier log reading
  genuinely confusing more than once, see §4.3).
- Local Xcode project path on Norbert's Mac: `unpruuf/UnpruufApp/UnpruufApp/` (no `Sources`
  segment — see §3's rsync note). Relay path: `~/unpruuf/server/`.

## 3. Critical environment fact: what has and hasn't actually run

This is the single most important thing to internalize before touching either mobile codebase:

- **Android**: this sandbox has **no Android SDK**. The entire Kotlin codebase has **never been
  compiled or run** in this environment, ever, across the whole project's history. Every ✅ in
  `STATUS.md` for Android is a code-review-level claim, sometimes backed by an isolated
  cross-check (e.g. running the exact same crypto formula in Node or a standalone Java program to
  verify a Kotlin function's math), never by an actual build. Treat every Android change as
  "structurally reviewed, balanced braces/parens confirmed, **not compiler-verified**" — say so
  explicitly when delivering Android changes, and always invite the user to paste back the exact
  Android Studio error text so it can be fixed immediately (this loop has worked well all
  project).
- **iOS**: the opposite. Gabriel has direct access to Norbert's Mac + Xcode + i12/i16. Across this
  session and prior ones, the iOS app was actually built, installed, and debugged against real
  device console logs, repeatedly — this is how essentially every real bug in this project's
  history was actually found (never by code review alone). **When working on iOS, always ask for
  the real Xcode console log after a change, and don't declare a fix "done" from reasoning alone**
  — this session in particular (§4.3) is a case study in why: five-plus rounds of "should be
  fixed" turned out wrong or incomplete before a genuinely correct root cause surfaced, each round
  only advanceable because a real log was demanded and read carefully instead of guessed past.
- **Node/relay server**: fully runnable and testable in this sandbox (`npm test`, `npm run build`
  all work here) — the one part of the stack with a real, if partial, feedback loop available
  directly in this environment. The relay's own log lines (`STORED`/`FETCHED`, plus
  `mac/status.command`'s queue count) are a genuinely reliable ground truth for cross-referencing
  against device logs — lean on them.

## 4. This session's actual work (chronological)

Full detail is in `CHANGELOG.md`'s 2026‑09‑02 entries (1) through (10), newest on top — this is a
narrative index into those, not a replacement for reading them.

### 4.1 iOS Tor reconnect-after-backgrounding — bugs #10 through #15, the long arc's end

Continuing from a prior session (bugs #1–9 already fixed there). This session:
- #10–12: symptom triage (fresh-instance-per-retry, delay experiments, "never tear down"
  structural fix) — each helped but didn't fully solve it.
- **#13, the real root cause**: read `iCepa/Tor.framework`'s actual GitHub source directly (not
  guessed) — its `TORController.connect()` uses a private, **class-level shared** dispatch queue;
  a second real connection attempt in the same process reliably fails, silently (returns `NO`
  without populating the `NSError` — hence the useless `nilError` text always seen in logs). A
  genuine framework bug, not fixable from the app side. Checked for a newer framework version
  (none exists) and for Arti (Tor Project's Rust rewrite — no stable API, ruled out).
- **The fix**: built `TorControlConnection.swift`, a from-scratch, minimal Tor control-protocol
  client (`AUTHENTICATE`/`GETINFO` only) on Apple's `Network.framework` (`NWConnection`),
  replacing *only* `Tor.framework`'s broken `TORController` class. `Tor.TorThread`/
  `TorConfiguration` (the actual Tor daemon) are untouched and were never the problem.
- **#14**: first version of the new client still failed with the same `nilError` text — added real
  diagnostics (full `NWConnection` state logging + real `NSError` domain/code/userInfo) instead of
  guessing again.
- **#15, the actual final fix**: diagnostics revealed `NWConnection` going into
  `.waiting(POSIXErrorCode.ENOENT)` on the very first attempt (socket file doesn't exist yet, Tor
  hasn't booted) — a state the code didn't handle at all, so its completion handler never fired
  and the retry loop deadlocked forever, even though Tor went on to boot fine moments later. Fixed
  by treating `.waiting` as a failure so the existing retry loop gets to try again.
- **Verified on real hardware**: multiple background→foreground cycles, clean reconnects every
  time, zero failures. **Closed.**

### 4.2 Message-loss-on-backgrounding (user-reported, real, closed)

A message sent immediately before backgrounding could be silently lost forever — gone from the
sender's chat (RAM wipe-on-background, by design) AND never reaching the relay (the app never
requested extra background execution time from iOS, so the process could be suspended
mid-delivery). Fixed with `beginBackgroundTask` + `RelayService.waitForPendingDeliveries(timeout:)`,
deferring `AppEnvironment.stop()` until the outbound queue drains or a 25s budget runs out.
**Verified on real hardware**: relay POST completes after `.background` fires and before `stop()`
runs. **Closed.**

### 4.3 The big one: Android→iOS cross-platform messages never arrived — a UUID case bug

This was the largest, most consequential thread of the session — the **first real Android↔iOS
message exchange ever tested in this project's history**, and it found a real, previously
invisible protocol-compatibility bug.

**The symptom, as first reported**: Gabriel (Android) sends to Norbert's i16 (iOS). Messages
leave Android, arrive and sit on the relay (confirmed via the relay's own `STORED` log lines and
`mac/status.command`'s queue count), but never show up on i16 — no error, nothing, just silence.

**False leads ruled out along the way** (worth knowing so a future session doesn't re-walk them):
- A huge burst of ~700 `STORED` events under one tag looked alarming at first, but turned out to
  be unrelated i12↔i16 **photo** traffic sharing the same Mac relay — not Gabriel's messages at
  all. Lesson: when multiple people/pairings share one relay instance, always ask *which pairing's
  traffic* a burst actually belongs to before theorizing about it.
- Reviewed the entire crypto/protocol stack byte-for-byte between Android and iOS looking for a
  mismatch: wire-tag HMAC formula, X3DH-lite bootstrap, outer AES-256-GCM envelope, packet
  padding, pairing-QR JSON payload, UUID→16-byte compact encoding. **All of these check out
  identical.** This was useful — it ruled out a huge class of hypotheses — but the actual bug was
  one level more subtle than any of them (see below).
- Confirmed the relay address itself was correctly configured on both ends (Settings → My relays
  on i16 matched exactly what Gabriel's Android was pushing to) and that Tor showed "connected" —
  neither was the cause.
- A relay-side circuit timeout (`Rend stream is 120 seconds late`) looked plausible for a while,
  but `mac/status.command` later showing messages stuck in queue for **56+ minutes** (not just a
  bad few seconds) ruled out "just a transient Tor hiccup" as the full explanation.

**The actual root cause, found via targeted diagnostics**: added unconditional logging to
`RelayService.pollOnce()` (every poll attempt now logs the tag it queries and the blob count that
comes back, even zero — previously a successful-but-empty fetch logged nothing at all, which is
exactly what made every earlier round of this investigation ambiguous). The next real-device log
showed it directly: iOS was polling under a **completely different wire tag** than the one
Gabriel's Android was actually storing messages under.

Root cause of *that*: **`UUID.uuidString` on Swift always returns UPPERCASE hex**
(`FC7FDEDD-...`), **while Kotlin/Java's `UUID.toString()` always returns lowercase**
(`fc7fdedd-...`). Both platforms' wire-tag functions HMAC the literal `"userId:generation"`
string into the tag, and HMAC is byte-exact — the same UUID in different letter case produces a
completely different tag. This only ever breaks the **cross-platform** case: a same-platform
pairing (Swift↔Swift or Kotlin↔Kotlin) is always internally case-consistent with itself, so
nothing before this session's actual Android↔iOS test could ever have caught it.

**The fix** (`ios/UnpruufCore/Sources/UnpruufCore/Identity.swift`, `myWireTag`/`expectedWireTag`):
lowercase the userId component right at the two functions that build these HMAC messages, rather
than migrating every already-stored `Identity.userId`/`Contact.id` value. This fixes an *existing*
broken pairing immediately on the next build, no re-pairing needed, since Kotlin's side was
already lowercase — this just makes Swift's match it. **iOS-only change, no Android-side fix
needed.**

**Verified on real hardware**: after the fix, i16 polled under the exact tag (`…xrLxs4E=`)
Gabriel's Android had been storing under all along, and fetched **8 queued blobs in one poll** —
the entire backlog from the whole debugging session. 4 of those 8 decrypted successfully
(`ingestPacket returned true`); 4 didn't. One of the successful ones turned out to be an **old
queued delete-contact signal** from earlier same-session testing of the Android delete-contact fix
(§4.4) — it correctly deleted the "RT" contact on i16 once finally delivered, which is *expected*
behavior given a stale queued signal, not a new bug. **Android→i16 was subsequently re-paired
fresh and confirmed working** ("verbindung android zu i16 läuft" — Gabriel's own words).

**⚠️ Open as of hand-off**: right after this, Gabriel reported the *previously rock-solid* pure
iOS↔iOS path (i12↔i16) had stopped working too — i16 showed "delivered", i12 stuck on "sending",
nothing arriving either direction. Not yet diagnosed. The user's own next step, in progress: a
clean restart of the Mac relay and both iPhones, to rule out accumulated stuck state (many Tor
circuits, relay backlog, and contact churn happened in a short window) before assuming a real
regression. **A new session should ask for the result of that restart first**, and if it's still
broken, ask for fresh logs from **both** i12 and i16 (the asymmetric delivered/sending status
means one side's send path and the other's poll/ingest path both need checking) plus the relay
log for the same window. Don't assume this is caused by the `Identity.swift` fix above without
evidence — that fix only touches the lowercasing of a string already used the same way on both
sides for same-platform pairings, so it shouldn't logically affect Swift↔Swift tags, but this
needs to be *confirmed* with a real log, not assumed safe.

### 4.4 Android: ported the iOS contact-deletion bug to its Android equivalent

Reviewed which iOS fixes from this session are actually portable to Android (most are
iOS/`Tor.framework`-specific and don't apply — Android uses a different Tor library and a
foreground-service background model with no equivalent of iOS's "wipe on background"). Found ONE
genuine, previously-undiscovered Android bug of the **identical class** as an iOS bug fixed
earlier (independently re-derived, not copy-pasted): `P2PNetworkManager.attemptDelivery()`/
`attemptChunkTrainDelivery()` detected a cross-platform (iOS-interop) contact via a **live**
`contactDao` lookup, re-run on every delivery retry. `sendDeleteContact()` enqueues the delete
signal and immediately deletes the contact row in the same coroutine — so by delivery time the
lookup returns `null`, and `null?.crossPlatform` is `null`, not `true`, silently skipping the
cross-platform branch and falling through to a dead onion/global-relay path. The delete signal
never reached the iOS side. **Fixed** by snapshotting `crossPlatformWireId`/
`crossPlatformRelayCandidates` into `PendingDelivery` at enqueue time, mirroring the iOS
`RelayService.PendingDelivery` pattern exactly. Shipped as `unpruuf_update.zip`, Android version
bumped to **1.02**. **Not build-verified** (see §3) — never got explicit Android Studio
confirmation, but §4.3's own delete-signal delivery (the stale signal that deleted "RT" on i16)
is indirect real-world evidence this fix works, since that signal was successfully generated,
queued, and eventually delivered by Android once the iOS-side tag bug stopped blocking it.

### 4.5 Android/iOS feature comparison (informational only)

A point-in-time Gegenüberstellung was produced in chat (not written to a file) covering:
architecture (Android true P2P + optional relay vs iOS relay-mandatory), who can host a relay
(only Android, never iOS — confirmed, iOS can't sustain background service), feature parity table
(Android has root/jailbreak detection, build-expiry gate, censorship-circumvention bridges, full
license system — iOS has none of those), and the environment asymmetry from §3. Regeneratable from
`STATUS.md` directly if asked again; nothing new was discovered producing it.

## 5. Open threads — things asked but not yet answered/resolved

1. **i12↔i16 regression** (§4.3's last paragraph) — **the most urgent open item**, mid-restart as
   of hand-off. Ask for the result first.
2. **QR-code "copy" button**: proposed adding a "copy my code as text" button next to the pairing
   QR in `PairingView.swift` (iOS), so two people who aren't physically together can exchange
   pairing codes as text instead of screenshotting a QR image. The app already supports *pasting*
   a received code (`showManualPaste`) but has no way to *copy out* your own. **Not built — user
   hasn't confirmed they want this.**
3. **TestFlight / distribution to testers**: asked whether the user has an Apple Developer Program
   membership (required for TestFlight; the Mac relay side doesn't strictly need one). **Unanswered.**

## 6. Where things stand right now (snapshot)

- iOS Tor connectivity + backgrounding: **solid, real-hardware-verified**, both major bug classes
  from §4.1/§4.2 closed out this session.
- iOS↔iOS messaging (text, pairing, contact deletion, backgrounding): was real-hardware-verified
  working earlier this session, **but see §4.3's open regression** — status as of hand-off is
  "was working, now uncertain, user is restarting hardware to check."
- iOS↔Android interop: **the core wire-tag bug is found and fixed, and one real message exchange
  (Android→i16) was confirmed delivered end-to-end after the fix** — this is the single biggest
  proof point of the whole session. Not yet stress-tested (many messages, both directions, over
  time, across backgrounding) — only proven for the minimal case so far.
- iOS camera photos: work (user-confirmed) but slow — capped at ~600KB/1600px because
  `SocksHTTPClient` opens a fresh Tor connection per 4KB packet; Android does 2MB/2048px with a
  persistent-connection design. Known, not-yet-fixed performance gap.
- Android: functionally the richest surface (editions, licensing, root detection, censorship
  circumvention, mature P2P+relay hybrid) but **completely unverified against a real compiler** in
  this environment for the whole project's history — see §3. The one delivery this session
  (§4.4) has indirect real-world evidence of working (see there) but no direct build confirmation.
- Everything above is already committed and pushed to `claude/unpruuf-app-e73i94` on GitHub — a
  fresh Claude Code session opened against that same repo/branch already has all of it without
  needing this file uploaded separately. This file matters most for a *fresh chat with no repo
  access* (e.g. a plain claude.ai conversation), or as a fast-start briefing even when repo access
  does exist.

## 7. How delivery actually works — READ BEFORE SHIPPING ANYTHING

The user does **not** `git pull`. They integrate every change by extracting a ZIP handed to them
and overwriting their local folder. This is not optional/aesthetic — it is the *only* way code
reaches them. Consequences:

- **Never** consider a task finished after just editing files and committing. It is finished only
  after: commit → push → **a ZIP delivered via `SendUserFile`**.
- Use the **`ship` skill** (`Skill({skill: "ship"})`) for Android/iOS/server deliveries — it knows
  the exact ZIP-naming convention (`unpruuf_update.zip` / `ios_update.zip` / `node_update.zip` /
  `relay_android_update.zip` / combinations), the required excludes (build artifacts, `.gradle`,
  `.idea`, and — load-bearing, security-critical — `license-tool/private-key.json` and
  `license-tool/*.csv`, which must **never** leave this machine), and the CHANGELOG.md English
  entry format (**What was done** / **Bug / cause** / **Fix**, newest on top). For iOS-only
  deliveries the same shape was followed by hand this session (`ios_update.zip`), since the ship
  skill's steps are generic enough to match without invoking it every time — just keep the same
  filename convention and exclude list (also strip `unpruuf/server/node_modules/*` and any
  `.build`/`DerivedData` dirs if zipping the whole `unpruuf/` tree, not just `ios/`).
- Every commit ends with these two trailers (exact text matters, the session ID is tied to this
  conversation):
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01EPQTfTkyFuzLTnE8bYdh1w
  ```
  **A new chat gets its own, different session URL from its own system prompt — use that one, not
  this literal string.** Always check the current session's own instructions for the exact
  trailer text.
- Branch: `claude/unpruuf-app-e73i94` on `nexonaicons/YuE` (GitHub). Push there, not to `main`.
- Android app version: two-digit scheme `1.01`, `1.02`, ... — bump `versionCode`+`versionName` in
  `app/build.gradle.kts` and the "Current: **1.0X**" line in `STATUS.md`'s Versioning section on
  every delivery that touches `unpruuf/app/`. Currently at **1.02**.
- **Standing instruction from the user, explicit, applies to every future Swift/Kotlin file
  delivered in chat**: *"gib mir immer den ganzen Text der Dateien, den ich ersetzen soll"* /
  *"gib mir IMMER den Text zum kopieren"* — always paste the **complete** file content in the chat
  reply (in a code block), never a partial diff/snippet, for any file the user needs to
  copy-paste-replace locally. This is independent of and in addition to shipping the ZIP, and the
  user has now repeated this instruction twice — treat it as a hard rule, not a one-off request.
- The user writes mostly in **German** and this session has been conducted in German throughout
  (code/comments/commits stay English per the existing codebase convention — only chat replies to
  the user are German). Match that unless they switch.
- iOS local integration path Norbert uses: `rsync -av <extracted>/unpruuf/ios/UnpruufApp/Sources/
  /Users/norbertbenker/unpruuf/UnpruufApp/UnpruufApp/` — the destination has **no trailing
  "Sources" segment** (the real local Xcode project tree is `unpruuf/UnpruufApp/UnpruufApp/`, not
  matching the ZIP's `unpruuf/ios/UnpruufApp/Sources/` layout one-for-one). A **new** Swift file
  (not just a modified one) additionally needs to be manually added to the Xcode project/target in
  Xcode itself (⌘⇧O / drag into the navigator) — rsync alone won't make Xcode compile it. This
  session's new files live in a **separate Swift package**, `UnpruufCore` (e.g. `Identity.swift`,
  `TorControlConnection.swift` is in the app target though, not the package — check each file's
  actual path under `unpruuf/ios/` before assuming which target it belongs to), which is *not*
  under `UnpruufApp/Sources/` in Xcode's navigator at all — Norbert had to be told to use ⌘⇧O
  (Open Quickly) to find `Identity.swift` the first time, since scrolling the visible tree didn't
  show it.

## 8. Real-hardware debugging method that has worked all session — keep using it

When a report comes in ("X doesn't arrive"/"Y doesn't work"), the pattern that has actually found
every real bug this project has ever had, repeatedly, including the big one in §4.3:

1. Ask for the **exact** real device console log (Xcode) covering the moment of the failure — not
   a summary, not "does it work", the actual log text.
2. Cross-reference against the **relay's own log** (`STORED`/`FETCHED` lines) and/or
   `mac/status.command`'s queue count — this is independent ground truth for "did the message
   genuinely reach/leave the relay", which narrows whether the bug is send-side, transport-side,
   or receive-side.
3. If the log doesn't show enough to distinguish hypotheses (as happened repeatedly in §4.3 —
   silent code paths, missing log lines for the "nothing happened" case), **add targeted
   diagnostic logging first**, ship it, and ask for a fresh log — don't keep guessing blind. This
   directly is what found the UUID case bug: the log literally couldn't tell "wrong tag" from
   "right tag, nothing there yet" until logging was made unconditional.
4. Read the actual upstream framework source when something looks like a framework bug rather than
   an app bug (worked for the `Tor.framework` `TORController` shared-queue bug in §4.1) — don't
   assume, fetch and read.
5. Don't declare victory until the user reports the real-device result back. Several rounds in
   this session looked "definitely fixed" by reasoning alone and were only partially right or
   wrong outright once tested for real.
