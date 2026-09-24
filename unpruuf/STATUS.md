# unpruuf — Project Status

Privacy-focused, serverless P2P messenger for Android.
Package: `com.nexonai.unpruuf` · Architecture: **GRAL** · Built by **NexonAI**

> **No servers. No accounts. No message storage. No metadata on disk.**
> Two phones talk directly over Tor hidden services (or the local network on
> the same Wi-Fi). Messages live only in RAM. Three editions
> (Standard/Pro/Client) from one codebase.

---

## Legend
✅ Done & working  🟡 Partial / follow-up  ⛔ Not started

---

## Versioning

Two-digit scheme requested by the user: **1.01, 1.02, 1.03, ...** — shown
in-app under **Settings → App version** (`BuildConfig.VERSION_NAME`, includes
the per-edition suffix, e.g. `1.01-pro`). Current: **1.14**.

Every delivered ZIP bumps both fields in `app/build.gradle.kts`'s
`defaultConfig`: `versionCode` (+1, must strictly increase) and `versionName`
(next number in the 1.0X sequence). This is now part of the `ship` skill's
checklist, not a one-off.

---

## 1. Core Messaging

| Feature | Status | Notes |
|---|---|---|
| Serverless P2P transport | ✅ | No backend. Each contact = a direct connection. |
| Tor hidden services | ✅ | Each device runs a hidden service to receive. |
| LAN fallback (same Wi-Fi) | ✅ | NSD discovery + direct TCP for instant local delivery. |
| Works over **any** internet | ✅ | Mobile data, foreign Wi-Fi, network switches. |
| Network-change resilience | ✅ | On switch, Tor is bounced (DisableNetwork 1→0) so the hidden service re-publishes. |
| Reliable delivery (ACK + queue) | ✅ | Messages retry until the recipient confirms (ACK). |
| Fast, adaptive retries | ✅ | 40 s Tor setup timeout (15 s on connection reuse) + progressive 3→15 s backoff + instant wake on new message. |
| Path warm-up | ✅ | Opening a chat + background cover traffic pre-warm the Tor circuit → no ~20 s cold-start. |
| Persistent per-contact connections | ✅ | One reused Tor connection per contact (receive side serves many packets per connection); warm-up dummies keep it open. Follow-up messages cost one ACK round-trip instead of a fresh onion rendezvous; a file's chunks all share one connection. Stale connections fall back to a fresh one within the same send attempt. |
| Idempotent delivery (lost-ACK dedup) | ✅ | Receiver re-ACKs a retried, already-processed packet (bounded SHA-256 LRU) instead of letting it fail Double-Ratchet decryption forever — prevents a lost ACK from permanently jamming a contact's strictly-ordered queue ("poison message"). |
| Delivery status in chat | ✅ | 🕓 waiting · ✓✓ confirmed by the other device. |
| End-to-end encryption | ✅ | Double Ratchet (see section 2) over an outer AES-256-GCM transport layer, per-contact symmetric key shared via QR. |
| Fixed-size packet padding | ✅ | Every packet 4096 bytes → message length hidden. |
| Chunked transfer (files/photos) | ✅ | Payloads over one packet split into multiple outer packets, each carrying an explicit chunk index, reassembled on receipt (order-independent) — reuses the existing ACK/delivery-queue reliability layer instead of a new transport. Chunks ride the pooled connection in windows of 8 (one ACK round per window, not per chunk), and texts/control signals are always delivered BEFORE queued chunk trains — a running file transfer no longer blocks the chat. |
| Optional store-and-forward relay | ✅ | Off by default (`RelayManager.RelayMode.OFF`, 2026‑08‑21). A self-hosted, blind Tor-hidden-service mailbox (`unpruuf/server/`) that only ever sees already-encrypted blobs addressed by the same rotating wire tag as the direct path. Three modes, switchable anytime in Settings → Relay: **Off** (never used); **Auto** — tried after direct LAN/Tor delivery fails (covers everything, including chunked file/photo transfers, since chunks carry an explicit index and no longer depend on arrival order), plus now goes straight to the relay for any transfer over 2 MB instead of attempting a slow/fragile direct Tor transfer first; **Mandatory** — every contact skips LAN/Tor-direct entirely, relay only (same shape cross-platform contacts already use unconditionally, made available globally for testing). Requires a bearer token generated per relay instance (not just knowledge of the wire tag) and has an operator-configurable TTL. Runs via Docker (Linux) or a plain Node.js process that manages its own Tor on Windows (`start-windows.bat`) — pairing an app to a relay is scan-a-QR-or-paste-a-string, same UX as pairing a contact. |
| Relay pool travels in the pairing QR | ✅ (2026‑09‑17) | Until v1.08 the standard Android↔Android QR carried no relay field at all: the sender pushed to its OWN globally configured relay and the receiver polled ITS own, so the relay path only ever delivered when both sides happened to have configured the very same relay — otherwise it silently did nothing. The QR (`v5`) now carries the device's relay pool in a compact `n` field (constant `unpruuf-relay:v1:` prefix stripped, `;`-joined), exactly like the cross-platform QR always did, and both sides store each other's pool at pairing time. Sending goes to the relays the contact advertised, tried in order; polling checks every relay this device advertised to that contact. Pool cap raised 2 → 3 (primary + two fallbacks). Contacts paired before v1.08 keep working via the old global-relay fallback. Nothing is added to the QR when no relay is configured, so non-relay users keep the small QR they had. |
| Batched relay poll + adaptive interval + relay-owner rhythm | ✅ (2026‑09‑17, v1.09) | Fixes the "known follow-up" flagged in the row above (`contacts × relays × identity candidates × time buckets` separate fetches every 6s). Three changes together: (1) **`POST /v1/fetchMany`** — new batch(+optional long-poll) endpoint on both relay implementations (`server/src/routes/relay.ts`, `relay-android`'s `RelayHttpServer.kt`), wire-identical; `pollRelayOnce()` now collects every contact's expected tags **per distinct relay target** and fetches each target once per round instead of once per tag. (2) **Adaptive interval** — `startRelayPoll()` picks a tight interval + longer long-poll wait while a chat is open/recently closed, a long interval + short wait otherwise (`RELAY_POLL_INTERVAL_ACTIVE_MS`/`_IDLE_MS`, `RELAY_POLL_WAIT_MS_ACTIVE`/`_IDLE`) — a long-poll response still returns the instant a blob arrives regardless of the wait cap, so this only trades latency for round-trips in the case where nothing was queued anyway. (3) **Relay-owner rhythm** — `IdentityManager.relayOwnerIsMine()` derives, per contact per 6h period, whether this device does a "deep" check of its full relay pool or just the primary entry (where almost all traffic lands, since a sender always tries pool entry 0 first) — deterministic from already-shared pair material, no extra round-trip to agree; `Contact.manualRelayOwner` (AppDatabase v7) + a new `RELAY_OWNER_SWITCH_V1` control signal let either side pin one contact's active list manually instead, mirrored to the other device, with a small Automatic/Mine/Theirs control in Contact Detail. **Not build-verified** — no Android SDK in this environment; the Node relay side (`server/`) IS build- and test-verified (`npm test`, 70/70 passing, including new fetchMany cases: immediate hit, immediate empty, long-poll-then-arrives, long-poll-timeout, and the validation paths). |

## 2. Privacy & Anti-Forensics

| Feature | Status | Notes |
|---|---|---|
| RAM-only messages | ✅ | Never written to disk. |
| 5-minute message TTL | ✅ | While the app is open, messages wipe after 5 min. |
| Wipe on background / close | ✅ | Leaving the app zeroizes all RAM messages. |
| Wipe on screen lock | ✅ | Screen-off zeroizes RAM and re-locks the app. |
| Encrypted contacts DB | ✅ | SQLCipher (AES-256). Only contacts stored, never messages. |
| Screenshot blocking | ✅ | `FLAG_SECURE` — no screenshots, hidden in app switcher. |
| Anonymous notifications | ✅ | Only "New message received" — never sender, never content, nothing on the lock screen. |
| Forward secrecy (bidirectional) | ✅ | Full Double Ratchet (X25519 DH ratchet + HKDF chain keys + XChaCha20-Poly1305, Signal-style skipped-message-key cache for out-of-order/lost messages). Replaces the earlier sender-only one-time-ECIES scheme. A later compromise of *either* device no longer exposes past messages sent to or from it. See `SECURITY_CLAIMS.md` §1. |
| Image / file sending | ✅ | Chunked transport (outer packets split/reassembled, direct delivery only — see item 8 below) + camera capture + inline thumbnails. Outgoing images are auto-downscaled (≤2048 px long edge, JPEG) instead of rejected when oversized. |
| Image metadata stripping | ✅ | Every image sent via the photo path is re-encoded through a Bitmap — strips ALL source metadata (EXIF incl. GPS, XMP, thumbnails), with EXIF orientation applied to the pixels first. File-path attachments stay byte-exact by design. |

## 3. Identity & Contact Isolation

| Feature | Status | Notes |
|---|---|---|
| No own username | ✅ | Each contact names *you* on their side. |
| Contact self-naming + rename | ✅ | Name on scan; rename later in list or chat. |
| Per-contact wire-ID (hourly rotation) | ✅ (2026‑09‑16: staggered) | You present a different, hourly-rotating on-wire ID to each contact → contacts can't correlate you by ID. Each contact's hour boundary is now also phase-shifted by a deterministic per-pair offset (`IdentityManager.pairRotationOffsetSeconds()`, derived from that pair's own secret — no new pairing/QR needed) instead of every contact rolling over at the same synchronized wall-clock instant. See `SECURITY_CLAIMS.md` §1.3. |
| Per-contact wire identity (not the global userId) | ✅ (2026‑09‑17) | `IdentityManager.userId` used to be baked into every contact's wire-tag HMAC identically — any two of your contacts comparing notes would see the literal same "who" value for you. Right after pairing, both devices now exchange a freshly-generated, per-contact identity (`Contact.myWireIdentity`/`theirWireIdentity`) over the already-live encrypted channel, and wire-tags use that instead. `userId` is now purely a *pairing-time* value (what your own QR shows to someone new) — renewable on demand in Settings → "Pairing identity" → Renew, which doesn't affect any existing contact. See `SECURITY_CLAIMS.md` §1.3. |
| QR re-scan overwrite protection | ✅ (2026‑09‑17) | Contact rows are now keyed by a local-only random id, not the value a scanned QR claims to be — a QR encoding an existing contact's pairing identity with *different* keys is rejected with a warning instead of silently replacing their (possibly already safety-number-verified) keys. An identical re-scan of an already-added contact is a no-op, not a duplicate. |
| Per-contact onion address | 🟡 | New pairings share the device's main onion (for reliability); older pairings keep their per-contact onion. Address isolation is therefore partial — ID isolation is full. The contact list now proactively surfaces a "N contacts may have an outdated address" banner (one tap migrates all of them) instead of requiring the user to notice the per-chat sync button on their own. |
| Verified onion — separate, daily-rotating address for verified contacts | 🟡 (2026‑09‑17, **not tested against real Tor**) | A second onion (`TorManager.ensureVerifiedOnion()`), distinct from the shared main/pairing onion above — only `isVerified` contacts (safety-number confirmed) are ever moved onto it, and its Ed25519 key is re-derived deterministically once a day (`Ed25519OnionDerivation`, from a device-local `IdentityManager.verifiedOnionFactor` that's never sent anywhere) instead of staying fixed forever. Announced to verified contacts once at verification and again on every actual rotation — self-tested (a self-connect probe) before ever being announced, so a bad derivation surfaces as "nothing got announced" rather than silently breaking a contact's reachability. Narrows, does not eliminate, the "two of your verified contacts could compare addresses" gap: they still share one address at any given moment, just one that changes daily instead of forever. See `SECURITY_CLAIMS.md` §1.3 for the honest limits (why contacts DON'T independently compute the rotated address themselves — that would need hand-rolled Ed25519 point math + SHA3-256, judged too risky to ship unverified) and the standing **please confirm on two real devices before trusting this for anything sensitive** caveat. |
| LAN (same-Wi-Fi) discovery still broadcasts the global userId | 🟡 (known gap, 2026‑09‑17) | The mDNS/NSD service name used for same-Wi-Fi discovery (`registerService`/`discoverPeers`) is still `unpruuf_<first 8 chars of IdentityManager.userId>` — unlike the wire-tag (now per-contact, see above), this is still one value, visible to anyone on the same Wi-Fi network, not just paired contacts. Renewing the pairing identity in Settings also changes this. Not fixed in this pass — would need per-contact LAN service registration, a bigger change with real Android NSD framework limits to work through first. |
| Copy/paste pairing (debug builds only) | ✅ (2026‑08‑21) | Pairing normally requires an in-person QR scan. Debug builds add a "copy code"/"paste their code" fallback in `QrPairScreen` for testers who can't be scanned in person — same dispatch and contact-creation path as a real scan, just fed from clipboard text instead of a camera. Not present in release builds on purpose: skips the physical-proximity check a QR scan gives you. |
| Safety-number verification | ✅ (2026‑08‑23) | Tap the shield icon next to any contact to see a 6-digit code (`IdentityManager.safetyNumber()`, derived from both devices' static X25519 identity keys) and enter the code they read back to you over a different channel (a call). Matches are saved as a local "Verified" flag on the contact; mismatches are shown but never saved. Works offline on both sides — no live network round-trip — so it fits the same always-online-not-guaranteed constraint as the rest of the P2P design. Mainly closes the trust gap in the copy/paste debug pairing flow above, but works for any contact, including ones added by a normal QR scan. |

## 4. Traffic Analysis Resistance

| Feature | Status | Notes |
|---|---|---|
| Smart dummy / cover traffic | ✅ | Randomized cover packets to all contacts; also keeps paths warm. Recipient drops them silently. |
| Message-size hiding | ✅ | Fixed 4096-byte packets. |
| Timing correlation resistance | 🟡 | v1 (randomized), not a constant-rate channel. |

## 5. Duress & Access Control

| Feature | Status | Notes |
|---|---|---|
| PIN lock | ✅ | Opens only after PIN (PBKDF2-salted hash, never stored in clear). |
| Panic PIN | ✅ | Separate PIN instantly wipes all contacts + keys, opens the app empty. |
| Re-lock on background/lock | ✅ | PIN required again after leaving app or screen-off. |
| Delete chat (revoke) | ✅ | Wipes messages on both sides, keeps the contact. |
| Bidirectional contact deletion | ✅ | Deleting a contact deletes it on the other phone too (queued, retried). |
| Root-detection gate | ✅ (2026‑08‑21) | On a device that heuristically looks rooted, the app refuses to run — full-screen block before Tor/the listener ever start, no bypass in release builds. Same gate ships in `unpruuf-relay` (relay-android). Best-effort, not proof — see `SECURITY_CLAIMS.md`. Not yet verified on a real rooted device. |
| Build-freshness gate | ✅ (2026‑08‑21) | A build stops running ~6 months (180 days) after it was compiled — `BuildConfig.BUILD_EXPIRY_MS`, checked right after the root gate, same no-bypass full-screen block. Applies to every edition, including the free Client edition; independent of the license system below. |
| Fingerprint unlock | ✅ (2026‑08‑21) | Opt-in (Settings → Security, only shown if the device has usable biometric hardware). Alongside the PIN, never instead of it — can only trigger the normal-unlock path, never the panic-PIN path (no biometric equivalent of a duress PIN exists). Auto-prompts once when the PIN screen appears, plus a manual fingerprint button below the number pad (72dp, moved down from above the pad and enlarged 2026‑08‑21 after it was reported too small/misplaced). |

## 6. Reliability on background / mobile devices

| Feature | Status | Notes |
|---|---|---|
| Foreground services | ✅ | Tor + P2P listener run in the background. |
| Partial wakelock | ✅ | Keeps CPU alive so Tor's hidden-service circuits survive Doze. |
| Battery-optimization prompt | ✅ | One-time request to exempt the app from Doze. |
| Hidden-service keep-alive | ✅ | Every 20 s the device self-connects to its own onion(s) — in parallel across onions — to keep the descriptor published + intro points warm. Onions belonging to deleted contacts / abandoned pairings are cleaned up at startup instead of being republished forever. |
| Proactive reachability re-check | ✅ | Independent of any network-change event, every 4 min the device verifies (not just pings) that it can still reach itself through Tor, and self-heals (re-bounce retry loop) if not — catches silent staleness (carrier idle timeout, expired circuit) that no OS callback ever announces. |

> **Samsung/One UI note:** even with the above, Samsung is aggressive. Set the
> app to **Battery → Unrestricted** and keep it **out of "Deep sleep" apps**.

## 7. Editions (Standard / Pro / Client)

Built from one codebase via Gradle product flavors. See `EDITIONS.md`.

| Feature | Status | Notes |
|---|---|---|
| Three editions (flavors) | ✅ | `standardDebug` / `proDebug` / `clientDebug`. |
| Colour + icon per edition | ✅ | Standard = teal (logo), Pro = gold tile, Client = blue tile; Home badge; edition in Settings. |
| Pairing rules | ✅ | Pro adds anyone (invites Client); Standard adds Standard+Pro, not Client; Client only connects to Pro. |
| Per-edition receive port | ✅ | Local ports 54321/54322/54323 so co-installed editions don't collide; virtual onion port stays 54321. |

## 8. Censorship Circumvention

| Feature | Status | Notes |
|---|---|---|
| Bridge UI + vanilla bridges | ✅ | Settings → Censorship Circumvention. Vanilla `IP:Port Fingerprint` bridges work now. |
| Safe by design | ✅ | PT-only bridges aren't activated without transport binaries → can't break Tor. |
| obfs4 / Snowflake | 🟡 | Wired via `IPtProxy` (`PluggableTransportManager.kt`, plugged into `TorManager.applyBridges()`). **Unverified against a real build** — this environment has no Android SDK, so the IPtProxy API calls and the `org.torproject:iptproxy` Gradle coordinate could not be compiled/confirmed. Falls back to `UseBridges 0` (unchanged, safe) if the PT client fails to start. meek not wired. |

## 9. Branding & UX

| Feature | Status | Notes |
|---|---|---|
| App icons | ✅ (2026‑09‑16) | The "Eclipse" mark from `BRANDING.md`, replacing the old placeholder tiles — drawn as an adaptive-icon vector (`ic_launcher_foreground.xml`, no PNG asset needed) rather than a raster export, since this environment has no image-rasterization tool. Standard: near-black squircle (`#111827`) + white-gradient mark. Pro: white squircle + gold-gradient mark (`#b8860b`, `BRANDING.md`'s "Tier colors on white"). Client: white squircle + blue-gradient mark (`#0284c7`). Not yet build-verified (see the Android caveat elsewhere in this doc) — the geometry was hand-derived (scaled/recentered from `BRANDING.md`'s canonical 100×100 path into Android's 108dp adaptive-icon safe zone) and reviewed for well-formed XML, not rendered. |
| In-app logos | ✅ (2026‑09‑16) | Same Eclipse mark, now also drawn in-app via a new `EclipseMark.kt` Compose `Canvas`/`Path` composable (no PNG) instead of the old `logo_unpruuf.png` static asset — takes the current edition's accent color automatically. Home screen: mark + `unpruuf` wordmark (BRANDING.md's freestanding layout). Settings → About: the real NexonAI company logo (`logo_nexonai.jpg`, unchanged — different company's asset, not redrawn) is now wrapped in a light "letterhead card" (off-white surface, dark rule, small monospace caption) instead of sitting bare on the dark theme, per user request that it no longer look mismatched. Not build-verified (same standing caveat). |
| Full English UI | ✅ | All visible text English. |
| Portrait-locked + scrollable screens | ✅ | App + QR scanner locked to portrait. |
| "Quiet Ink" design system | ✅ | Teal-biased ink surfaces in three elevation levels, refined per-edition accents with deep-surface companions, monospace "technical voice" for all status/timestamps, Tor status pill in the contact list, number-pad lock screen, RAM-wipe ghost marker in chat. Pure restyling — no logic changes. |

---

## 10. unpruuf Relay (Android)

A **separate app**, `unpruuf/relay-android/`, running the optional relay
directly on a phone — no laptop, Docker, or Node.js needed. Package
`com.nexonai.unpruuf.relay`, own Gradle project. Wire-compatible
byte-for-byte with `unpruuf/server/` (the Node relay) — the messenger app's
`RelayClient.kt`/`RelayManager.kt` work against either unchanged. See
`relay-android/README.md` for the full write-up, including why this is a
native Kotlin reimplementation rather than an embedded Node.js runtime.

| Feature | Status | Notes |
|---|---|---|
| Tor hidden service | ✅ | Reuses the main messenger app's own `TorManager` mechanism (`tor-android`/`jtorctl`), simplified to one fixed onion. |
| Relay HTTP API | ✅ | `/v1/relay`, `/v1/fetch`, `/health` via NanoHTTPD — same JSON shapes, status codes, and bearer-token auth as the Node version. |
| QR + connection string | ✅ | Same `unpruuf-relay:v1:<onion>:<token>` format; scan or paste into the messenger app's Settings → Relay. |
| Configurable message expiry ("reset") | ✅ | Stepped hours control (1h→whole-day steps), applied on the next 15-min sweep; plus an immediate manual "Reset now". |
| Token rotation | ✅ | Secondary action, explicit warning that it breaks already-paired devices. |
| Root-detection gate | ✅ (2026‑08‑21) | Same `RootDetector`/block-screen as the messenger app, own copy in this project (no shared module between them). Refuses to start `RelayService` on a device that heuristically looks rooted. |
| Recent-activity log | ✅ (2026‑08‑21) | On-device diagnostics, no adb/logcat needed — new "RECENT ACTIVITY" card on the main screen shows every stored/fetched/rejected event with a timestamp, short tag suffix, size, and (for fetched) average dwell time before pickup. In-memory only (`RelayEventLog`, 200-entry ring buffer), never persisted, still blind to actual message content — added to diagnose reports of messages queuing on the relay but never reaching either recipient; see 2026‑08‑21 changelog entry for the root-cause finding (receivers must have Settings → Relay pointed at the same relay as the sender, with mode ≠ Off). |
| Censorship circumvention (bridges, obfs4/Snowflake) | ✅ | Direct port of the messenger app's `BridgeManager`/`PluggableTransportManager`/`TorManager.applyBridges()` — same IPtProxy wiring, same safe-fallback-to-unbridged behavior, applied live via "Save & reconnect". |
| Network-change resilience | ⛔ | Not built this pass — publishes once; see README for why this was scoped out and what's needed if this app sees real use. |
| Verified against a real build | 🟡 | Still no way to run/compile the Kotlin here, but `./gradlew help` and a full `:app:dependencies` resolution (every declared dependency, both Guardian Project Maven repos included) now run clean from a genuine fresh checkout — see the 2026‑08‑18 changelog entry. The project shipped without a Gradle wrapper (`gradlew`/`gradlew.bat`/`gradle-wrapper.jar` all missing), which alone can make Android Studio's sync fail; that's fixed. |

### 10a. unpruuf Relay (Node, `server/`) — deployment platforms

Same one relay app, several ways to run it as a self-managed node without Docker Desktop.

**Operator activity log (2026‑08‑30, all platforms):** the relay prints one console line per
event — `STORED` (message arrived and queued), `FETCHED` (recipient collected it, plus how long
it waited), `REJECTED` (with the reason). Routine empty polls are deliberately not logged, since
every client polls every 20s. Same information and same privacy rules as the Android relay app's
"RECENT ACTIVITY" card: last-8-character tag suffix, size and timing only — never the blob, a
full tag, or the token. Implemented once in `routes/relay.ts`/`relayEventLog.ts`, so Docker,
Windows and macOS all have it.

| Platform | Status | Notes |
|---|---|---|
| Docker / Linux | ✅ | `docker compose up -d --build` — two containers, Tor sidecar shares the relay's network namespace, no bridge/clearnet exposure. |
| Windows (`start-windows.bat`) | ✅ | No Docker — the Node process manages its own Tor child process (`windowsTor.ts`); Tor Expert Bundle auto-downloads on first run. |
| Windows standalone `.exe` (`build:exe`) | 🟡 | Node SEA build verified end-to-end on Linux as a stand-in (bundle→blob→inject, native-addon loading, Tor auto-download all confirmed working); not yet run on a real Windows machine. |
| macOS (`start-mac.command`) | ✅ (2026‑08‑29 verified on real hardware; unattended-operation features added 2026‑08‑31, scripts not yet run on a Mac) | **Unattended operation (2026‑08‑31):** `mac/install-service.command` runs it as a launchd agent (survives closing the Terminal, starts at login, restarted by launchd on crash); `mac/uninstall-service.command` removes it while leaving identity/onion/queue intact so contacts needn't re-pair. The installer refuses to run before an interactive first start, since that run asks the TTL question launchd could never answer. Tor is now supervised (`keepTorAlive`) — a Tor dying *after* publishing its hostname used to be invisible; restarts are bounded and the onion survives them. `--status`/`mac/status.command` and `--show-code`/`mac/show-code.command` answer "is it working?" and "what do I scan?" from the relay's own files, which is the only way to ask once it runs in the background. Plus a 30-minute uptime/queue heartbeat. Watchdog, status and QR-reprint live in shared modules so `windows-start.ts` can adopt them unchanged — deliberately not done yet (scoped to macOS; Windows path works and is untestable here). **The launchd scripts themselves have not been run on a real Mac.** | Mirrors the Windows non-Docker path (`macTor.ts`, shares `torProcess.ts` with `windowsTor.ts`), arch-aware Tor Expert Bundle auto-download (Apple Silicon `aarch64` / Intel `x86_64`). Three real bugs found and fixed getting here, in order: (1) an unrelated pre-existing broken `~/.npm` cache — EACCES, not this project's fault, fixed by the user via `sudo chown -R $(whoami) ~/.npm`; (2) the downloaded `tor` binary killed outright with `signal SIGKILL` on Apple Silicon (unsigned Mach-O), fixed by ad-hoc code-signing it; (3) `libevent-2.1.7.dylib` then refused to load (`missing code signature`, `signal SIGABRT`) since dyld requires every loaded `.dylib` to be signed too, not just the main binary — fixed by `adHocSignAllMachOFiles()`, recursively signing every `.dylib`/executable under `mac/tor/` (also picked up `pluggable_transports/lyrebird` and `conjure-client` for free). **Verified end-to-end on real hardware**: `npm run build` → Tor bootstraps 0%→100%, hidden service published, QR + connection string printed. `mac/README.md` covers the one-time Gatekeeper approval an unsigned `.command` script needs. Full test suite passes (41/41). **Verified 2026‑08‑29**: two real iPhones exchanged messages **in both directions** through this relay over Tor — the first time the Node relay has been confirmed carrying real iOS traffic on a self-hosted machine. |

## 11. iOS (Cross-Platform / GRAL relay mode)

A **separate app**, `unpruuf/ios/`, implementing the relay-mandatory
cross-platform mode designed in `CROSS_PLATFORM_PLAN.md` — not a port of
Android Pro, since iOS can't sustain a persistent background hidden service.
Originally written with no way to compile or run it in the environment that
wrote it (no Mac/Xcode/Swift toolchain there). **That changed 2026‑08‑26**:
the full `UnpruufApp` target — every Service, ViewModel, and View, plus
`Tor.framework` and `CryptoSwift` actually linked in — **compiled
successfully for the first time ever**, on a real Mac, after a real,
multi-round debugging pass against real compiler errors (see the
2026‑08‑26 `CHANGELOG.md` entries for the full list of what was actually
wrong vs. what was just unverified).

**Then, 2026‑08‑29: the app was proven to actually work, end to end.** Two
real iPhones (iPhone 12 and iPhone 16), each running Tor in-process, paired
by mutual QR scan and exchanged messages **in both directions** through a
relay the user hosts on their own Mac (`server/` via `start-mac.command` —
see §10a). That single session found and fixed **thirteen** distinct real
bugs that no amount of review had caught: nine on the Tor-connectivity path
(see the `Tor connectivity` row), three on the relay transport path (see
`Relay push/poll`), and one in the macOS relay's own Tor binary handling.
Every one was found from real device logs, not by guessing. What is now
genuinely proven: Tor bootstraps and stays connected across
background/foreground cycles, QR pairing works, and Double-Ratchet-encrypted
messages are pushed, fetched, and **decrypted** on the far side.

Still unproven at this level: iOS↔**Android** interop (both ends here were
iOS), attachments/images over the relay, and any multi-day/real-world usage.
See `unpruuf/ios/README.md` for the from-scratch Xcode setup recipe and the
known risk areas, roughly in the order they're likely to need attention.

**One protocol behaviour worth knowing before testing a fresh pairing:** the
Double Ratchet's bootstrap is deliberately asymmetric — exactly one of the
two devices can send first, and the other must receive one message before it
can send anything. This is correct, unavoidable (making both sides initiators
would reuse message keys), and one-time per pairing. Which side gets which
role is decided by a key comparison, so it is arbitrary from the user's
point of view; the app now says so explicitly at pairing time and in the
chat, instead of leaving the first message on "Sending…" forever.

| Feature | Status | Notes |
|---|---|---|
| **Full `UnpruufApp` build** | ✅ (2026‑08‑26, real hardware, runtime-verified) | **Build Succeeded**, then genuinely **launched and run** on a real Mac (Xcode, iPhone 17 Simulator) — every Service/ViewModel/View file, `Tor.framework`, `CryptoSwift`, and the local `UnpruufCore` package all compile, link, and execute together as one app for the first time ever. Getting to a clean build required fixing ~13 real, previously-unknown issues, all found by the compiler, not by review: missing `import Combine` in 7 files (`AppEnvironment`, `RelayPoolManager`, `RelayService`, `ContactDetailViewModel`, `ContactListViewModel`, `LockViewModel`, `PairingViewModel`), a missing `import UnpruufCore` in 2 files (`ContactDetailViewModel`, `SettingsView`), a missing `import Vision` in `QRScannerView`, a double-initialization bug in `AppEnvironment`'s `keychain` property, a missing `public init` on `UnpruufCore`'s `RelayPoolManifest.Info` (Swift never synthesizes a public memberwise initializer even when every field is public), and the `Tor.framework` rename covered in the row below. Two apparent errors (in `AppLockManager.swift`/`KeychainStore.swift`) turned out to be a stale Xcode module cache, not real bugs — resolved by Clean Build Folder. Only 61 warnings remain, all non-blocking (the vendored `Tor`/libevent C sources' own K&R-style declarations, a handful of `onChange(of:perform:)` iOS-17 deprecations, Swift 6 `Sendable`-concurrency advisories). **Then actually run**: PIN setup screen appeared and completed correctly on first launch, no crash, navigated into the main app, and the Settings screen (including this session's newer "Backup relay"/"Company relay list" UI) rendered correctly — see the `Tor connectivity` row below for what the runtime Tor log itself showed. See `CHANGELOG.md`'s 2026‑08‑26/27 entries for the full account. **Verified 2026‑08‑29**: a full pairing + message-delivery cycle between **two real iPhones** (iPhone 12 and iPhone 16), over Tor, through a self-hosted macOS relay — mutual QR pairing, then messages flowing in both directions with real Double-Ratchet decryption confirmed in the logs. |
| Crypto/protocol core (`UnpruufCore`) | ✅ (2026‑08‑26, real hardware) | Double Ratchet, wire framing, packet padding, outer AES-GCM envelope, identity/wire-tag math — direct ports of the Android/Kotlin implementation. **`swift test` genuinely run for the first time**, on a real Mac (Xcode 26, arm64e-apple-macos14.0): 56/56 tests passed, including every `DoubleRatchetTests` case — this is the real answer to the CryptoSwift `AEADXChaCha20Poly1305` API-surface risk flagged in `DoubleRatchet.swift`'s own doc comment ever since it was written: the assumed API matched, XChaCha20-Poly1305 encrypt/decrypt round-trips correctly. That run was against an **older commit** (pre-2026‑08‑25 relay-pool work) — `RelayPoolManifestTests.swift` (the CryptoKit Ed25519 verifier, the one piece of iOS crypto in this whole project that had *never* been checked by any compiler) and the newer, larger `PairingPayloadTests`/`RelayConnectionStringTests` weren't part of that run. **Still needed:** check out `claude/unpruuf-app-e73i94` (or whatever branch/tag has since superseded it) and re-run `swift test` to cover those. |
| Mutual-QR pairing | 🟡 (compiles, 2026‑08‑26) | New QR format (relay + wire-tag based, not onion-based — see `CROSS_PLATFORM_PLAN.md`'s "Pairing QR format"). Camera scan via native `VisionKit`+`Vision` (a real missing `import Vision` in `QRScannerView.swift` was caught and fixed by the first real build). Compiles as part of the full app target now; not yet exercised on a device. |
| Text chat | 🟡 (compiles, 2026‑08‑26) | Send/receive over the relay, Double-Ratchet-encrypted, with the same chunked outer framing as Android (so attachments are a UI-only follow-up, not a protocol change). Compiles; not yet exercised on a device. |
| Tor connectivity | ✅ (2026‑08‑29, real hardware, "Tor connected" confirmed in the app UI) | `TorController.swift` wraps `iCepa/Tor.framework` (CocoaPods-only, `pod 'Tor', '~> 409'`, confirmed real distribution). A real, previously-unknown API break was found and fixed to get here: 409.11.2 renamed all three Objective-C classes, dropping the all-caps `TOR` prefix (`TORThread`→`TorThread` etc.), and the renamed `TorController` collides with this file's own wrapper class of the same name — every framework reference is module-qualified (`Tor.TorThread`, `Tor.TorController`) to disambiguate; `TorConfiguration` needed only the rename (no collision). **Then genuinely run**: launched in the iOS Simulator, Tor's own log showed a real bootstrap sequence end to end — `Bootstrapped 0%` → `5%` (connecting to a relay) → `30%` (loading consensus) → `75%` (enough directory info) → `100% (done): Done`, then later reacted live to a simulated network change with `Our IP address has changed. Rotating keys...`. This is the actual, no-longer-theoretical answer to the single highest-flagged risk in the whole iOS delivery. **Regression found 2026‑08‑29**: on a later real-device run, `connectAndAuthenticate()` was found to pass an empty cookie to `authenticate(with:)` instead of reading the real `control_auth_cookie` file — authentication silently failed every time, leaving `isReady` stuck false (UI shows "Connecting to Tor…" forever) regardless of Tor's own bootstrap state. Fixed (read the real cookie file; see `CHANGELOG.md`'s 2026‑08‑29 entry). **Second regression found the same day**: testing that fix on hardware surfaced a real crash — `Tor.framework`'s `TORThread` only tolerates one instance per process, but `stop()`/`start()` were cancelling and recreating it on every background/foreground cycle, crashing with `NSInternalInconsistencyException: There can only be one TORThread per process` the moment the app was reopened, then hanging on the PIN screen on the next relaunch (corrupted Tor data directory from the abrupt kill). Fixed by creating the engine once per process and only tearing down/rebuilding the `TORController` control connection on background/foreground — see `CHANGELOG.md`'s second 2026‑08‑29 entry. **Third bug found the same day, with diagnostic logging added to pin it down**: the crash was confirmed gone, but `connect()` still failed every single retry with POSIX `ENOENT` — `TorConfiguration.controlSocket` (verified against the real `TORConfiguration.h` on GitHub) was never set, so Tor was never told to create a control socket at the path we were polling for; also switched to the configuration's own `cookie` property instead of reading `control_auth_cookie` off disk by hand. **Fourth bug, found from Tor's own log once `controlSocket` was set**: `Unix socket path ... is too long to fit` / `Failed to bind one of the listener ports` — AF_UNIX paths are capped at ~104 bytes on Darwin, and the iOS sandbox container path alone eats ~78 of those, so `<Caches>/tor/control_port` (110 bytes) could never bind. Fixed by moving only the control socket (not the data directory, which has no such limit) to `FileManager.default.temporaryDirectory` with a 2-character filename. **Fifth bug, from Tor's log once the path was short enough**: `Permissions on directory ... are too permissive` — Tor refuses to bind a control socket in a directory that isn't private (mode 0700) to the current user, which iOS's shared per-app `tmp` root isn't. Fixed by creating a dedicated one-character subdirectory under `tmp` with explicit `0700` permissions. **`connect()` succeeded for the first time after that** — real progress, Tor's log showed the control listener actually opening. **Sixth bug**: `authenticate` then failed with Tor logging `Got mismatched authentication cookie` — the third fix's switch to `TORConfiguration.cookie` (read before Tor's thread even started) doesn't reliably match what Tor actually uses once running. Reverted to reading the real `control_auth_cookie` file, now done only after `connect()` succeeds. **Verified 2026‑08‑29, real hardware**: `authenticate` succeeded, bootstrap tracked live through the real percentages to 100%, and the app's own Settings → Status field genuinely showed **"Tor connected"** — the first time this has ever been confirmed end to end, not just inferred from Tor's own log. Closes out a six-real-bug debugging arc against the same physical iPhone in one session. See `CHANGELOG.md`'s six 2026‑08‑29 entries for the full sequence. A minor, harmless cleanup found in the same log: `env.start()` was being called from two places (`UnpruufApp.swift`'s scenePhase handler and `ContactListView.swift`'s `.task`), wasting a full 20s retry cycle on every launch without affecting the already-correct `isReady` state — removed the redundant call. **Regression found the same day, precisely reproducible**: a fresh install connects immediately, but reopening that same install without reinstalling gets stuck on "Connecting to Tor…" forever. Root cause: `tmp` survives an app relaunch (unlike RAM/messages), so a stale control-socket file from the previous run's Tor process can already be sitting at the fixed path the new run tries to bind. Fixed by unlinking any file at that path on every `start()` — see `CHANGELOG.md`'s seventh 2026‑08‑29 entry. **Eighth bug, same day**: that fix's own test log showed the first connection succeeding, then a *second* `reconnectController()` competing against it — `scenePhase` can report `.active` more than once per foreground session, and each report called `start()`/`reconnectController()` unconditionally. Fixed by making `reconnectController()` a no-op when a controller already exists; only `stop()` clears it. **Verified 2026‑08‑29 on real hardware** with `scenePhase` transition logging added: a clean launch logs `active` → (Face ID prompt) → `inactive` → `active`, and that second `active` hits exactly the intended `reconnectController: already have a controller, skipping duplicate call` instead of building a competing connection. The `inactive` phase (any system prompt — Face ID, camera permission) is correctly ignored, never reaching `stop()`. The same run also confirmed **no spurious `.background`** occurs on a device left in the foreground — earlier sessions' apparently-random Tor teardowns traced to Xcode's own wireless-debugging/CoreDevice tunnel dropping (a "Waiting to reconnect… tunnel connection failed" dialog), not to app code. **Ninth bug, same day, confirmed by reading `iCepa/Tor.framework`'s own `TORController.m` source directly (not guessed)**: even with the eighth fix, backgrounding and reopening the app reliably got stuck on "Connecting to Tor…" for the full ~20s retry budget every single time, while a full relaunch connected fine every time. Root cause: `stop()`'s `controller?.disconnect()` sends Tor's own control-protocol `SIGNAL SHUTDOWN` command before closing the socket — that kills the actual Tor **daemon**, not just this app's connection to it, silently undoing the "engine persists for the process's life" guarantee the second bug's fix was supposed to provide (the `TORThread` wrapper object survives; the real Tor process underneath it does not). Fixed by never calling `disconnect()` — dropping the `controller` reference lets ARC deallocate it via `-dealloc`, which (confirmed via the same source read) only closes the local I/O channel and leaves Tor itself running. **Verified 2026‑08‑29 on real hardware**, closing out a nine-bug arc against the same two physical iPhones in one session. **Also verified**: a real SOCKS-proxied connection genuinely carrying app traffic — relay push and poll both work over this Tor connection, and two iPhones exchanged messages in both directions through a self-hosted macOS relay (see the `Relay push/poll` row for the three further bugs that had to be fixed on that path). **Tenth real bug found 2026‑09‑02, real hardware**: a fresh launch connected fine, but backgrounding the app and reopening it reliably failed every retry with an uninformative `nilError`, exhausting the ~20s retry budget every time — Tor's own log showed exactly one `New control connection opened.` line no matter how many Swift-side retries followed, meaning the daemon only ever accepted the very first attempt. Root cause: `connectAndAuthenticate` retried `controller.connect()` on the SAME `TORController` instance across every attempt, and a `TORController` that has already attempted (and failed) a connection can't just retry on itself — the identical one-shot limitation already known for `TORThread`, just for `connect()` specifically, and only surfacing on a *second* attempt (background/foreground), which is why nine prior real-hardware sessions never hit it. Fixed by constructing a fresh `TORController` per retry attempt. **Turned out insufficient on its own** — real-hardware logs from two more test runs (i12, i16) after this fix showed EVERY retry still failing, though now Tor's own log confirmed a genuine new daemon-side connection on every single attempt (proving this fix's premise was right, just not the whole story). Read `iCepa/Tor.framework`'s actual source on GitHub directly to go further: confirmed the failure is `dispatch_io_create()` returning `NULL` inside the framework's own `-connect:`, which then returns NO **without ever populating the NSError** (an API-contract violation on the framework's part — explains the uninformative `nilError`) and leaks the raw socket on that path (a real framework bug, not fixable from the app side). Ruled out a retain cycle on the read-loop's completion block (confirmed via source: correctly uses `weak self`). Still unknown: why `dispatch_io_create` reliably fails on the *second* real connection attempt in a process, every time, while the first (fresh launch) always succeeds — no documented limit or shared-queue conflict found in the source to explain it. **That delay experiment was disproved by real-hardware data**: across three background/foreground cycles and ~20+ seconds of continuous retrying, not one attempt ever succeeded — and the same failure showed up on a plain fresh launch too, the moment its first connection needed even one retry, proving this was never really about backgrounding specifically. **Structural fix added 2026‑09‑02**: the connection is purely intra-process (both ends live in the same process, which the engine was already proven to keep running through backgrounding), so it almost certainly never actually broke on its own — the app was destroying a working connection and then hitting the framework limitation trying to rebuild it. `stop()` no longer tears the connection down at all (only resets UI state); `start()` tracks whether a connection has ever authenticated successfully and, if so, just re-polls the existing one instead of reconnecting. **Turned out still insufficient**: real-hardware logs showed the *very first* reconnect after backgrounding failing the same way whenever it needed even one retry, proving the limitation lives in `Tor.framework`'s connection object itself, not specifically in background/foreground timing. **Root cause confirmed 2026‑09‑02 by reading `iCepa/Tor.framework`'s actual `Tor/TORController.m` source on GitHub directly**: `-connect:` backs every attempt with `dispatch_io_create(..., [[self class] controlQueue], ...)` — a private, **class-level shared serial dispatch queue**, the same one for every `TORController` instance ever created in the process; once it has backed one real channel, a second `dispatch_io_create` call against it reliably returns `NULL`, and `-connect:` then returns `NO` **without ever populating the `NSError`** (an API-contract violation — the source of the uninformative `nilError`), leaking the raw socket on that path too. A genuine framework bug, not fixable from the app side. No newer framework release exists (409.11.2 is still the latest tag); Arti (Tor Project's own Rust rewrite) has no stable API yet and would need hand-written FFI bindings, ruled out as unsafe for a shipping app. **Final fix, 2026‑09‑02**: `Tor.TorThread`/`TorConfiguration` (actually running Tor) were never the problem, only `Tor.TorController`. `TorController.swift` no longer uses `Tor.framework`'s `TORController` at all — a new file, `TorControlConnection.swift`, is a small, independently-implemented Tor control-protocol client (`AUTHENTICATE`/`GETINFO` only) built on Apple's own `Network.framework` (`NWConnection` over the same Unix-domain socket), which has no shared-queue limitation of this kind. Tor itself is untouched by this change. **Turned out still failing, same `nilError` text** — surprising, since this new class has zero Objective-C bridging, so it couldn't be the same synthesized-NSError artifact found in `Tor.framework`. Added full diagnostics (every `NWConnection` state transition, plus the real `NSError` domain/code/`userInfo` on failure, not just the error's bare description) to see the actual reason rather than guess again. **Real bug found from that diagnostic log, 2026‑09‑02**: the very first connect attempt after backgrounding — made before Tor has even booted, so the control-socket file doesn't exist yet — put `NWConnection` into `.waiting(POSIXErrorCode.ENOENT)`, a state `TorControlConnection.connect()` didn't handle at all. Since `.waiting` never called the completion handler, `TorController`'s retry loop — entirely driven by that completion firing — silently deadlocked forever on its very first attempt, while Tor went on to boot, open its control listener, and bootstrap to 100% completely unnoticed. `NWConnection` does not itself re-poll a Unix-domain socket path that didn't exist at connect time, even once the path starts existing — its automatic `.waiting` retry is designed for real network-path changes (Wi-Fi drop, cellular takeover), not this. **Fix**: `.waiting` is now treated as a failure for this class's purposes, same as a real `.failed` — cancels the connection and calls completion with the error, so `TorController`'s existing retry loop (a fresh connection every 0.5s, up to 40 attempts) does what it was already built to do: try again once the socket actually exists. **Verified 2026‑09‑02, real hardware.** The next attempt after the expected first-attempt ENOENT connected the instant Tor opened its control listener, authenticated, and bootstrapped to 100% — and, critically, three separate background→foreground cycles in the same run all hit `start(): reusing existing authenticated controller, re-polling bootstrap status` → `ready! port=…` immediately, with zero reconnect failures. This closes out the fifteen-real-bug Tor-connectivity debugging arc that ran across this session and 2026‑08‑29 — the reconnect-after-backgrounding bug is fixed. |
| Relay push/poll | ✅ (2026‑08‑29, real hardware, two iPhones, both directions) | Hand-rolled SOCKS5 + HTTP/1.1 client (`SocksHTTPClient.swift`) since iOS's `URLSession` has no supported SOCKS5 proxy path — see that file's doc comment for why a general solution was deliberately avoided. **Real bug found on real hardware**: two paired iPhones, both Tor-connected, sent a test message that never arrived — `RelayService.swift`'s `splitHostPort()` defaulted a bare `.onion` address to port 8787 (the relay's *local* Express port, `server/src/config.ts`'s `PORT`) instead of port 80 (the hidden service's actual exposed virtual port, per every relay torrc and the already-working Android `RelayClient.kt`'s `RELAY_PORT = 80`) — every relay call silently failed to even connect, symmetrically breaking both send and receive. Fixed by defaulting to port 80. **Second real bug, found right after**: with port 80 in place, sending finally worked (iPhone 12 showed "Delivered", relay returned 201) but nothing ever arrived, in either direction — `pollOnce()` interpolated the wire tag into `/v1/fetch?tag=…` **un-percent-encoded**, and `Identity.hmac` returns standard-alphabet base64, so a tag containing `+` (roughly half of them) arrives at the relay as a space, fails `TAG_RE`, 400s, and gets silently skipped by the `statusCode == 200` guard. Sending was immune because `POST /v1/relay` carries the tag in the JSON body, not a URL. **This is the identical bug the Android client already found and fixed** (`RelayClient.kt`'s `URLEncoder.encode`, with a long comment describing the same symptom) — the iOS port never picked it up. Fixed with `.alphanumerics` percent-encoding (note `.urlQueryAllowed` would NOT work: it permits `+`), plus diagnostic logging so a receive-side failure can't be silent again. **Third bug, same session**: pairing was possible before a relay was configured, storing an empty per-contact relay pool that `pollOnce` iterates zero times — that contact could then never receive, permanently and silently, while sending to them kept working. Fixed by refusing such a pairing (and disabling the scan/paste buttons until a relay is set); the user confirmed this was the actual cause on their device. **Verified 2026‑08‑29 on real hardware**: after re-pairing, messages flow **in both directions** between two iPhones over Tor via the user's own macOS relay, with `fetched N blob(s)` / `ingestPacket returned true` confirming real decryption. One follow-up surfaced and handled: the Double Ratchet's deliberate bootstrap asymmetry (only `initSender`'s side can send before receiving anything) made the non-initiator's first message hang on "Sending…" with no explanation — now shown explicitly at pairing time and as a per-message `failureReason` in the chat, rather than being auto-resolved by an invisible handshake packet, which would be a coordinated wire-level change with Android. Those three UI/state changes are **not yet re-verified** on hardware. **Real bug found from a user report, 2026‑09‑02**: a message sent immediately before backgrounding the app could be lost forever — never arrived on the other device, and gone from the relay's own queue too. Root cause: `.background` called `AppEnvironment.stop()` instantly, which resets `TorController.isReady` (gates `RelayService.attemptAllPending`'s delivery loop) and wipes RAM messages, cutting off a delivery still queued or mid-flight with no retry and nothing left in the UI to show it failed — compounded by the app never requesting extra background execution time from iOS, so the process could be suspended within seconds regardless, often before a fresh Tor SOCKS connection + relay POST completes. Fixed with `beginBackgroundTask` plus a new `RelayService.waitForPendingDeliveries`: `.background` now gives the outbound queue up to 25s to actually drain before `stop()` runs, instead of cutting it off unconditionally. **Verified 2026‑09‑02, real hardware**: message sent, app backgrounded immediately — the relay POST (`returned 201`) completed after `[Scene] phase changed to background` and before `stop()` ran, and the message arrived on the second device within seconds. |
| "Wechsel" rotation | 🟡 (compiles, 2026‑08‑26) | Per-contact generation counter + relay update, implemented both send and receive side. Compiles; not yet exercised on a device. |
| Trusted-node list / temp-node | 🟡 (2026‑08‑25) | Built at the ordered-fallback level — see §14: a 2-entry relay pool (`n` in the pairing QR, v2), a local backup-relay Settings field, and signed company-manifest import. Still no liveness check or auto-reorder among the pool — see §14's own caveat. |
| Tor status light | ✅ (2026‑09‑01, real hardware, both iPhones) | Indicator in the navigation bar's trailing (top-right) corner of the contact list, every chat, and Settings — deliberately the *same* corner on every screen (a chat's leading slot is the back button, so trailing is the one corner every screen has in common). Both sending and receiving gate on `TorController.isReady`, so this is the same question as "why is my message stuck?" — previously answerable only by leaving the conversation and opening Settings. `TorStatusLight` observes the `TorController` it is handed rather than reaching through `AppEnvironment`, since a computed lookup through a nested `ObservableObject` never triggers a re-render (the trap already documented on `ContactListViewModel`). **Colour palette is user-selectable** (Settings → Appearance): default Red/Green, or Blue/Orange for colour blindness — chosen deliberately as the pairing accessibility guidelines recommend, since it clears both the common red-green defect and the rarer blue-yellow one. State is also exposed via VoiceOver and spelled out in words in Settings → Status either way. **Verified 2026‑09‑01**: built and run on both real iPhones, green light showing while Tor is connected. Getting to this build required one real fix first — see the `ArchivedRelayStore` note below. |
| Contact deletion confirmation + relay archive | 🟡 (added 2026‑08‑31, delete-signal bug fixed 2026‑09‑01, awaiting re-test on a device) | Swipe-to-delete on a contact previously deleted immediately, with no confirmation, and always discarded their relay address. Now asks first — Delete Contact & Relay / Delete Contact, Keep Relay for Later / Cancel. "Keep" archives the address (`ArchivedRelayStore`, `Codable`-backed `UserDefaults`) into a new Settings → Archived relays section (Copy/Delete-forever per entry); it does NOT change what deletion itself does — `ControlSignals.deleteContact` still sends and message history still zeroizes either way, and a returning contact still needs a fresh QR pairing regardless (only that re-establishes the real cryptographic session). The dialog's own message and the section footer both say this explicitly, since "keep relay" reasonably-but-wrongly sounds like it partially un-deletes the contact. **Real bug found 2026‑09‑01 (build)**: `ArchivedRelayStore.swift` used `ObservableObject`/`@Published` (Combine) but only imported `Foundation` — fixed by adding `import Combine`. **Real bug found 2026‑09‑01 (real hardware, two-iPhone test)**: deleting a contact never actually notified the other device — `ContactListViewModel.remove` fired the `deleteContact` signal as an un-awaited `Task` and then immediately removed the contact locally; both run on the main actor, so the synchronous removal always finished first, and by the time the signal-send actually ran, `contactStore` no longer had the contact its own lookup needed — it failed silently, every time, with no retry ever able to succeed since `RelayService`'s retry loop *also* re-looked-up the (now-gone) contact on each attempt. Fixed by (1) making `remove` `async` and awaiting the signal send before the local removal, and (2) having `RelayService`'s `PendingDelivery` snapshot the wire tag and relay list at enqueue time instead of re-reading `contactStore` on every retry, so a queued delivery no longer depends on the contact it was for still existing. Not yet re-verified on a device. |
| Relay management UI | ✅ (redesigned 2026‑08‑31, verified on-screen 2026‑09‑01, real hardware) | Settings now has two dynamic sections instead of fixed text fields. **"My relays"**: primary + optional backup (capped at `RelayConnectionString.maxPoolSize` = 2, a real QR-size limit, explained in-UI once both are filled), each with an optional local-only label (e.g. "Mac at home" vs. "Windows VM backup") to tell the operator's own relays apart, Delete with confirmation, and primary-deletion promotes the backup rather than leaving a gap. **"Contacts' relays"**: one row per relay address a contact has shared, grouped by contact, editable as a manual local correction (does not notify the contact — unlike the existing per-chat "Rotate my identity"/Wechsel), with an "add a backup relay" row per contact below the cap. Deliberately a *live view* over `Contact.theirRelayConnectionStrings`, not a second stored list — deleting a contact elsewhere removes its section here automatically, avoiding the kind of duplicated-source-of-truth bug this session's other fixes kept tracing back to. Deleting a contact's only relay gets a stronger confirmation, directly reusing the lesson from the empty-relay-pool pairing bug fixed earlier the same day. **Verified 2026‑09‑01**: the redesigned Settings screen confirmed rendering correctly on real hardware; the individual Save/Delete/add-a-row interactions haven't been walked through one by one yet. |
| macOS relay menu bar app | ✅ (2026‑09‑01, real hardware, background service confirmed) | `server/mac/MenuBarApp/` — a SwiftUI `MenuBarExtra` (macOS 13+) giving the relay a green/yellow/red status dot plus Start/Stop and "show QR code again", so routine operation no longer needs Terminal. Deliberately orchestrates the *existing* `install-service.command`/`uninstall-service.command` and a new pair of read-only JSON subcommands on `mac-start.ts` (`--status-json`, `--show-code-json`, siblings of the existing text/QR-art `--status`/`--show-code`) rather than reimplementing any relay logic in Swift. The two new subcommands are covered by the existing test suite (62/62 passing after the change) plus manual smoke tests of all three JSON shapes. **Real bugs found and fixed getting to a genuinely working build**: (1) `Result<_, String>` throughout `RelayController` — plain `String` doesn't conform to `Error` — fixed with a small `RelayError` wrapper. (2) No timeout on the shell-out calls, so picking the wrong folder (once, accidentally the Xcode project's own folder) combined with a real macOS/cloud-sync (OneDrive/Google Drive) hang left the whole Mac needing a hard power-cycle — added a 15s hard timeout with forced termination on every `runShell` call, regardless of root cause. (3) `NSWorkspace.activateFileViewerSelecting` silently failed to bring Finder forward for this `LSUIElement` (menu-bar-only) app — switched both "reveal in Finder" actions to shell out to `open -R` instead, plus a fallback + visible message when the log file doesn't exist yet. (4) The onion hostname file is deliberately left on disk after a clean stop (and survives an abnormal kill too) so contacts don't need to re-pair — `refresh()` was treating its mere presence as "running", so once the relay had ever published once, the status dot stayed green and the Start button never reappeared even with the background service fully stopped and nothing listening on the port. Fixed by having `launchctl`'s loaded/not-loaded state decide running-vs-stopped first; the onion file only narrows down which running sub-state once launchctl already confirms the service is loaded. (5) `start()`/`stop()` had no guard against a second overlapping call (e.g. a double click landing before the first click's `isBusy` re-rendered the disabled button) — a second `install-service.command` run's own `launchctl bootout` of any existing registration would kill the first call's freshly-started relay out from under it, producing a real-hardware log trace of "bootstrapped Tor to 100%, started serving, then a clean `[shutdown]` moments later with no crash in between." Fixed with an `isBusy` re-entry guard. **Verified 2026‑09‑01, real hardware, end to end**: `lsof -i :8787` shows a genuine `node` process listening, `launchctl list` shows `com.nexonai.unpruuf.relay` registered and matching that same PID — the background service (auto-start at login, auto-restart on crash, survives logout/reboot) is confirmed actually working, not just displaying a misleading green dot. |
| Camera photos | 🟡 (built 2026‑08‑31, not yet run on a device) | Camera button in the chat (`CameraPicker.swift`, hidden where no camera exists), photos rendered inline and tappable to full screen, viewer deliberately without a save/share action (message content is never meant to reach persistent storage). Every photo is re-encoded through a graphics context **unconditionally** — strips EXIF incl. **GPS**, XMP and thumbnails, orientation baked into the pixels — matching Android's always-re-encode rule; doing it only for oversized images would leak location from small ones. Capped at ~600 KB / 1600 px rather than Android's 2 MB / 2048 px: `SocksHTTPClient` opens a fresh Tor connection per 4096-byte packet, so 2 MB means ~525 round-trips (~4–9 min) against ~154 (~1–2.5 min). That is a sender-side policy, not a wire change — a 2 MB photo from Android is still received fine, since a fetch returns all chunks in one request. Raising it properly means connection reuse in `SocksHTTPClient`. **Resolved a pre-existing warning rather than inheriting it:** `AppLockManager`'s note to port Android's "external-intent grace" was checked, not copied — Android's camera is a separate Activity (backgrounds the app → wipe+lock), iOS's picker is in-process (`.inactive` only, which is ignored by design), so the grace would weaken the background-wipe guarantee for nothing. |
| File / photo-library / voice attachments | ⛔ | Wire format already supports all of them (ported `MessagePayload`/`RatchetFrame`); only the camera path is wired into the UI. Photo-library sending needs no extra Info.plist permission if done via `PHPickerViewController`. |
| PIN / Panic PIN | 🟡 (2026‑08‑24) | Built: salted PBKDF2-HMAC-SHA256 storage (`PinManager.swift`, hand-rolled via CryptoKit — no CommonCrypto dependency), a mandatory-on-first-run setup screen, a lock screen shown until unlocked. Panic PIN wipes contacts+messages via the new, correctly-scoped `AppEnvironment.wipeContactsAndMessages()` (preserves this device's own identity, matching Android) — the old `wipeAll()` was more destructive than Android's actual panic path and is now documented as such, kept only as a possible future "reset this device entirely" action. |
| Biometric unlock | 🟡 (2026‑08‑24) | Face ID/Touch ID via `LocalAuthentication`, opt-in, biometric-only (no device-passcode fallback), stands in for the normal PIN only — never the panic PIN. |
| Message TTL / wipe-on-background | 🟡 (2026‑08‑24) | `InMemoryMessageStore` now sweeps every 15s and drops messages older than 5 minutes, same figures as Android. `AppEnvironment.stop()` (called on backgrounding) now also wipes RAM messages — previously only stopped Tor/polling, so messages silently survived backgrounding until this fix. |
| Safety-number contact verification | ✅ (crypto, 2026‑08‑26) / 🟡 (UI compiles, 2026‑08‑26) | `Identity.safetyNumber()` ported from Android's `IdentityManager.safetyNumber()`. `IdentityTests`' safety-number cases (symmetry, six-digit grouping, changes per contact) genuinely ran and passed on real hardware — see the `UnpruufCore` row above. The SwiftUI entry point (leading swipe action on a contact in `ContactListView` → `ContactDetailView`) now compiles as part of the full app build (a real missing `import UnpruufCore` in `ContactDetailViewModel.swift` was caught and fixed); not yet exercised on a device. |
| App version display | 🟡 (2026‑08‑24) | `Info.plist`'s `CFBundleShortVersionString`/`CFBundleVersion`, shown in `SettingsView.swift` — kept in step with Android's `versionName` scheme ("1.01", ...). |
| **iOS ↔ Android interop** | 🟡 (2026‑09‑02, real hardware, first real test found and fixed a real bug) | Android now has the matching companion support (see §13 below) — same scope cut as iOS's own first shell (one manual relay per contact, no trusted-node list, no temp-node, text-only verified). **First-ever real Android↔iOS message exchange tested this session**: an Android sender's messages were correctly pushed to and stored on the shared relay, but the iOS receiver never surfaced them — confirmed via diagnostic logging in `RelayService.pollOnce` that iOS was polling under a completely different wire tag than what the message was actually stored under, every time. Root cause: `UUID.uuidString` is uppercase on Swift, lowercase on Kotlin/Java's `UUID.toString()` — both sides HMAC the literal `"userId:generation"` string into the wire tag, so the same UUID in different case produces a different tag entirely. Only breaks cross-platform pairings; same-platform ones are always internally case-consistent, which is why this was never caught by iOS-only or Android-only testing. Fixed by lowercasing the userId component in `Identity.myWireTag`/`expectedWireTag` (iOS-only fix, no Android change needed, no re-pairing needed for already-broken contacts). **Fix not yet re-verified on real hardware** — next test: same two devices, confirm the message actually arrives. |

**Update, 2026‑08‑26:** the blanket "never compiled or run, anywhere" statement that used to sit
here is no longer true — `UnpruufCore`'s `swift test` ran for real on a Mac (see that row above),
the first genuine compiler/test verification of any iOS code in this project. The remaining 🟡
rows below are still unverified for a real reason though: they live in `UnpruufApp` (the actual
SwiftUI app — Tor, pairing UI, chat), a separate target that needs a full Xcode build, not just
`swift test` on the `UnpruufCore` package alone. See the updated iOS plan (2026‑08‑24) for why
that's the recommended next step.

## 12. Licensing (offline, no server)

Standard/Pro require a signed license; Client is free and never sees any of this (see
`AppEdition`/`LicenseManager.requiresLicense`). No license server exists or is planned — see
`unpruuf/license-tool/README.md` for the full design rationale, including the hard limit this
is honest about: an offline scheme can prove a code is genuine and bind it to one device, but
it structurally CANNOT enforce a global seat count (no device knows what any other is doing).
"Exactly N seats" stays a contractual limit enforced by only issuing N codes, not a technical one.

| Feature | Status | Notes |
|---|---|---|
| Signed license codes | ✅ | Ed25519, `unpruuf-license:v1:<payload>:<sig>`. Verified on-device with Tink's `Ed25519Verify` (already a dependency) against `LicenseManager.PUBLIC_KEY_B64`. Cross-checked Node's signer against Tink's verifier directly (not just reasoned about) before shipping — see the 2026‑08‑19 changelog entry. |
| Offline batch issuing | ✅ | `unpruuf/license-tool/` (`keygen.js`/`issue.js`/`verify.js`) — no dependencies beyond Node's built-in `crypto`, no network calls. Issues 1 or N (e.g. 350) codes at once with a CSV manifest for the vendor's own bookkeeping. |
| Device binding | ✅ | A code self-binds to the SHA-256 of `Settings.Secure.ANDROID_ID` on first activation; a copy of the same app-data/license onto a second device is detected and rejected. Does not, and cannot, detect a still-unactivated code being reused on a different device — the FIRST device to activate it wins the binding. |
| Clock-rollback resistance | 🟡 | "Trusted now" is a persisted high-water mark (`max(stored, System.currentTimeMillis())`), never decreasing — defeats turning the clock back once the device has ever seen a later date. Does NOT anchor to an external trusted time source (e.g. Tor consensus timestamps) — scoped out for now, see `LicenseManager.trustedNowMs()`'s own comment for why and what a stronger version would need. |
| Expiry warning + hard gate | ✅ | Settings → License always shows status/serial/customer/days-left. `MainActivity` hard-blocks reaching the app (`LicenseLockScreen`) for any state except Valid/ExpiringSoon — PIN, panic-PIN, and all RAM message data are completely unaffected by license state. |
| Debug-build bypass | ✅ (2026‑08‑21) | Debug builds skip the license gate entirely (`BuildConfig.DEBUG` in `MainActivity`) — device-binding otherwise meant every fresh test install needed its own distinct code. Release builds enforce the gate exactly as above, untouched. |
| Renewal | 🟡 | Same offline flow as activation — `issue.js` again for the same serial, paste the new code into Settings → License. Fully manual; no push/notification when a renewal is due beyond the in-app "expires in N days" line once ExpiringSoon starts (30 days out). |
| Verified against a real build | ⛔ | Same limitation as the rest of this project — no Android SDK here to compile the Kotlin. What COULD be verified without one was: the Ed25519 cross-compatibility (Node signer → Tink verifier, run for real, not assumed) and the license-tool's own Node code (keygen/issue/verify all actually run, including a tamper test). |

## 13. Android cross-platform mode (iOS-interop companion, + Business/Mandatory pairing since v1.10)

The Android-side companion to §11's iOS cross-platform mode — see
`CROSS_PLATFORM_PLAN.md` for the shared design. Deliberately matches iOS's
own "first working shell" scope, not a superset of it: no trusted-node list,
no temp-node, text-chat is the verified target (attachments should work
through the same reused chunk-framing code but weren't specifically tested).
**Since v1.10, this is no longer iOS-interop-only**: Android↔Android pairing
under `RelayManager.RelayMode.MANDATORY` uses this exact same no-onion
format too — see `CROSS_PLATFORM_PLAN.md`'s "Business/Mandatory pairing
unification" section for the full design and why iOS needed zero changes.

| Feature | Status | Notes |
|---|---|---|
| Data model (`Contact.crossPlatform`/`myRelayConnectionString`/`theirRelayConnectionString`/`myGeneration`/`theirGeneration`) | 🟡 | New Room columns, DB bumped to v4 — destructive migration (same precedent as v2→v3): all contacts must be re-paired after this update. |
| Cross-platform pairing QR | 🟡 (v2, 2026‑08‑25; edition field + Android↔Android use v1.10) | Format (`CrossPlatformPairing.kt`), byte-for-byte matching iOS's `PairingPayload.swift` (`{"v":2,"u","p","k","n"}`) — `n` is now up to 2 `;`-joined relay connection strings instead of exactly one (see §14). Scanner tries the existing onion-based QR first, falls back to this format. Gate is `AppEdition.isPro` **unless** `RelayManager.isMandatory()` is true on the scanning device (v1.10) — Mandatory mode waives the Pro requirement, since it's now also the Business/Node-bundled edition's normal pairing path, not just iOS interop. A new optional `e` (edition) field lets `AppEdition.canAdd()` still be enforced when two real Android editions pair this way; missing on any iOS-generated or pre-v1.10 QR, defaulting to `standard`. |
| Wire tag (generation-based) | ✅ | No changes to `IdentityManager` — `myWireId`/`expectedWireId` already take a generic `Long`; cross-platform contacts pass a generation counter instead of an hour bucket. **Actually cross-verified**, not just reasoned about: a fixed HMAC-SHA256 test vector was computed in Node and independently in a plain Java program calling the exact same `MessageDigest`/`Mac` JCA APIs `IdentityManager.kt` uses — both produced the identical tag. |
| "Wechsel" rotation | 🟡 (fixed 2026‑08‑25) | Manual per-contact button (`ChatScreen`, cross-platform contacts only) → `P2PNetworkManager.wechsel()`. Sent as a direct one-shot relay push (not through the general delivery queue) specifically to avoid a race where the generation counter could bump before the announcing packet itself was sent under the old value — see that function's doc comment. A real bug (last-colon instead of first-colon split, silently no-opping every incoming Wechsel) was found and fixed — see §14. Announces (and now correctly stores) the new relay, on top of rotating the generation. |
| Relay-mandatory send/receive | 🟡 | `P2PNetworkManager.attemptDelivery`/`attemptChunkTrainDelivery`/`resolveSender`/`startRelayPoll`/`pollRelayOnce` all gained an early cross-platform branch — no LAN/Tor-direct attempt for these contacts, relay is the only path, per-contact (not the global `RelayManager` config). As of 2026‑08‑25, send tries each pool entry in order and stops at the first success; poll checks every pool entry every round (see §14). Reuses `RelayClient`/`RatchetFrame`/`MessagePayload`/`NetworkObfuscation`/`CryptoManager`/`DoubleRatchet` unchanged — all already transport-agnostic. |
| Trusted-node list / temp-node | 🟡 (2026‑08‑25) | Built at the ordered-fallback level — see §14. Still no liveness check or auto-reorder among the pool. |
| File/photo/voice attachments over this path | 🟡 (unverified) | The chunk-framing reuse means it should work through the same code path with no extra code, but wasn't specifically exercised — text-only chat is what this delivery's verification actually covers. |
| Verified against a real build | ⛔ | Same limitation as the rest of the Android/iOS work this session — no Android SDK here. What COULD be verified was: the wire-tag formula (see above, genuinely cross-checked) and balanced-braces/structural review of every changed file. Not verified: actual compile success, the Room migration in real operation, or a real handshake against the actual iOS Swift code (only `CROSS_PLATFORM_PLAN.md`'s description of it was available here, not the Swift source itself for a side-by-side check). |

## 14. Relay-pool redundancy + company-managed relay list (2026‑08‑25)

Closes two gaps in §11/§13's "one manually-configured relay per contact" scope cut: no failover
if that one relay goes down, and no way for a company running its own relay(s) to hand out a
ready-made server list. Does **not** touch the already-solved "no common server between two
contacts" case — cross-platform pairing has always had each person publish their own address(es);
this only makes "address(es)" actually plural. Full design: `CROSS_PLATFORM_PLAN.md`'s "Pairing
QR format" section.

| Feature | Status | Notes |
|---|---|---|
| 2-entry relay pool (pairing QR `n`, v2) | 🟡 | `PairingPayload.swift` / `CrossPlatformPairing.kt`, capped at `RelayConnectionString.maxPoolSize` / `RelayManager.RELAY_POOL_MAX_SIZE` (2). A v1 QR (single entry) still parses — one entry is already a valid one-element list. |
| Local backup-relay setting | 🟡 | Settings on both platforms: primary relay (existing field) + one optional backup. `RelayManager.getMyRelayPool()` / `AppEnvironment.myRelayPool` compose what a new pairing QR advertises (dedup, cap 2). |
| Contact storage | 🟡 | `Contact.myRelayConnectionString`/`theirRelayConnectionString` — same column names/types as before (`String?` Android, `String` iOS), now holding a `;`-joined pool. **No Room migration** — a pre-existing single value is already a valid one-element list. iOS decodes old/new shapes via manual `Codable` fallback. |
| Send/poll failover | 🟡 | Sender tries pool entries in order, stops at first success (`RelayService.attemptDelivery`, `P2PNetworkManager.attemptDelivery`/`attemptChunkTrainDelivery`). Receiver polls **every** entry **every round** — delete-on-fetch means a message could be at either address (`RelayService.pollOnce`, `P2PNetworkManager.pollRelayOnce`). **Android-side cost addressed in v1.09** (see §1's "Batched relay poll + adaptive interval + relay-owner rhythm" row): tags across all of a target's entries are now batched into one `fetchMany` call, and a per-contact rhythm skips the fallback entries most rounds instead of checking all of them every time. **iOS (`RelayService.pollOnce`) still polls every pool entry every round** with no batching/rhythm equivalent — not touched in this release, flagged as the remaining optimization target for that platform. |
| Signed relay-pool manifest | ✅ (crypto), 🟡 (app wiring) | `unpruuf/relaypool-tool/` — structural sibling of `license-tool/`, **separate** Ed25519 key pair (not shared with `LicenseManager`'s). Format `unpruuf-relaypool:v1:<base64url(payload)>:<base64url(sig)>`, payload `1\|<org>\|<issuedAtMs>\|<relay1>;<relay2>;...`. Android: `domain/relay/RelayPoolManager.kt` (Tink `Ed25519Verify`). iOS: `UnpruufCore/RelayPoolManifest.swift` (CryptoKit `Curve25519.Signing` — first Ed25519 verifier in this project's iOS code) + `UnpruufApp/Services/RelayPoolManager.swift`. Import UI in Settings → "Company relay list" on both platforms. Unrestricted in v1 — any user with the manifest text can import it, no device binding, no new "enterprise account" concept (confirmed decision). Re-import replaces the previous list wholesale. |
| Wechsel decode bug fix | ✅ | Prerequisite fix, not new scope: `P2PNetworkManager`'s Wechsel-signal parser split on the *last* colon instead of the *first* — a real relay connection string has multiple internal colons, so this silently broke every real-world Wechsel on Android (no crash, no test coverage, found by comparing against iOS's always-correct `firstIndex(of: ":")`). Fixed as `parseWechselSignal`, with a regression test proving the old split fails on a real string. |
| Verified for real in this sandbox | 🟡 | Generated a genuine Ed25519 key pair with `relaypool-tool/keygen.js`; issued and verified a real manifest with `issue.js`/`verify.js` (Node's own `crypto`); independently re-verified that same Node-signed manifest against a compiled Java program calling Tink's `Ed25519Verify` directly (the exact algorithm `RelayPoolManager.kt` uses) — all three steps genuinely executed, not assumed. **Not verified**: the CryptoKit (iOS) side of that same cross-check — no Swift toolchain here, so `RelayPoolManifestTests.swift` (signs+verifies inline with CryptoKit's own key pair) was reviewed manually only, same limitation as every other iOS file in this project. Also not verified: actual Android compile (`RelayManagerListTest.kt` reviewed manually against `RelayManager.kt`, not run — no Android SDK), the Room storage change under real `sqlite`, or a real device-to-device pairing/failover cycle. |
| Not built | ⛔ | Liveness checking or auto-reordering among a pool's entries — today's fallback tries/polls the configured addresses in a fixed order every round regardless of which one has actually been reachable recently. |

---

## Troubleshooting log — issues found & how they were fixed

A record of the real bugs hit during testing and their resolutions, so the
reasoning isn't lost.

### Networking / delivery
1. **Only worked on the same Wi-Fi.**
   *Cause:* the Tor SOCKS port was cached once at service-bind time, when it's
   still 0/-1 (TorService only sets it after bootstrap). Every Tor send hit a
   dead local port; LAN hid it.
   *Fix:* read `socksPort` lazily from the running TorService on each send.

2. **After a network switch, the device could send but not receive.**
   *Cause:* TorService doesn't react to network changes; the hidden-service
   introduction points die and the descriptor isn't re-published.
   *Fix:* on default-network change, bounce Tor via the control port
   (`DisableNetwork 1` → 1 s → `0`) to force re-publish. `isReady` is left
   untouched (an earlier version that flipped it caused a permanent hang).

3. **Messages silently lost / "fire and forget".**
   *Fix:* receiver ACK byte + a delivery queue that retries until confirmed;
   chat shows 🕓 / ✓✓.

4. **One direction instant, the other 1–2 min.**
   *Cause:* 45 s Tor connect timeout + fixed 20 s backoff compounded on a
   slow-to-reach receiver.
   *Fix:* 25 s timeout, progressive 3→15 s backoff, and a wake signal so a new
   message isn't stuck behind a prior failed contact's sleep.

5. **~20 s delay on the first message (cold Tor circuit).**
   *Fix:* warm the path when a chat is opened + background cover traffic warms
   all contacts.

6. **Receiving unreliable in the background / on mobile (Doze).**
   *Cause:* Android Doze throttles the background Tor process; the hidden
   service goes idle.
   *Fix:* partial wakelock in the Tor foreground service + one-time
   battery-optimization exemption + a 60 s hidden-service keep-alive
   (self-connect to own onion). Plus manual Samsung battery settings.

15. **Frequent ~20 s cold-start delays even between back-to-back messages;
    one network switch took 20+ minutes to recover.**
    *Cause:* the reachability retry loop's own bounce attempts re-emitted
    `networkChanged`, which was also collected by the same code that starts
    that very loop — cancelling and restarting it on every one of its own
    bounces, resetting its 150s give-up deadline back to full each time. A
    loop meant to try for at most ~150s could keep re-triggering itself
    indefinitely instead.
    *Fix:* the loop now no-ops instead of restarting if it's already
    running, so its own bounces no longer reset its clock.

16. **Attaching a photo/file kicked the app to the PIN screen; the pick was
    dropped.**
    *Cause:* camera/file picker are external activities → whole app
    backgrounds → the background observer wiped RAM + locked; the PIN
    screen disposed the chat (and its ActivityResult callback), so the
    result had nowhere to go.
    *Fix:* a bounded (5 min, RAM-only) "external intent grace" armed right
    before launching camera/picker skips exactly that one wipe+lock;
    expiry and screen-off still wipe+lock as before.

17. **Sending an image stalled ALL messages to that contact for ~5 minutes.**
    *Cause:* head-of-line blocking — the strictly-ordered queue delivered a
    photo's chunk train one ACK round-trip per 4 KB chunk (seconds each
    toward a mobile-hosted hidden service); every text queued after the
    image waited for the whole train.
    *Fix:* single-packet items are delivered before queued chunk trains
    (safe: own ratchet message + index-based reassembly), and chunks are
    pipelined in windows of 8 per ACK round.

18. **Receiving on mobile data completely dead (Tor "active", sending fine,
    instantly OK on Wi‑Fi).**
    *Cause:* self-inflicted — self-connect checks are chronically
    false-negative on mobile data, and every failure triggered a full Tor
    bounce that tore down the just-published hidden service; with the 4-min
    periodic check and the every-onion-must-answer verdict, the device
    bounced itself in a near-permanent loop.
    *Fix:* verdict gated on the main onion only (one retry included), a
    bounce needs two consecutive failures and gets a 45s settle window,
    and the status pill gained an honest RECONNECTING state.

19. **Both devices on mobile: one direction dead ("can receive, can't
    send"), queued messages delivered instantly after switching to Wi‑Fi.**
    *Cause:* the instant Wi‑Fi delivery proved the receiver's hidden
    service was healthy — the mobile-client → mobile-hosted-HS rendezvous
    (double carrier NAT, fresh descriptor) simply needs longer than the
    40s connect timeout, so every attempt timed out.
    *Fix:* fresh connects to a contact's onion now get 90s
    (`TOR_CONNECT_TIMEOUT_MS`) — paid once per pooled connection, not per
    message. Probe and stale-pool timeouts unchanged.

20. **Both devices on mobile, sending to an OLD (legacy-paired) contact
    stuck 5+ min — status pill said TOR ACTIVE the whole time, receiving
    from that contact worked fine.**
    *Cause:* item 18's fix made the reachability verdict (and therefore all
    recovery) gate on the main onion only. That's correct for the verdict,
    but it meant a legacy per-contact onion going unreachable on its own —
    plausible on mobile — was never re-checked or recovered by anything;
    the main onion staying healthy hid it completely.
    *Fix:* legacy-onion probe results (previously discarded) now feed a
    per-onion failure streak; 3 consecutive failures asks for one recovery
    bounce, independently rate-limited (max once/2min) from item 18's own
    retry logic so it can't reintroduce that regression. Unaffected: the
    status pill and main verdict. A contact's own "Update now" banner
    (Contacts screen) migrates them off their legacy onion entirely, which
    fixes this class of bug for that pairing permanently.

21. **Regression from item 20 itself: mobile↔mobile dead both directions,
    then even a brand-new re-paired contact stuck at the clock after
    switching back to Wi‑Fi.**
    *Cause:* item 20's recovery bounce could fire while item 18/19's own
    network-change recovery loop was already active for the same switch —
    two independent bounces close together, one of them killing an
    unrelated, healthy, freshly-paired contact's in-progress connection.
    *Fix:* legacy-onion failures no longer even accumulate while that loop
    is active; only count once it's idle (periodic 4-min check only).

22. **"Can't send at all, to anyone, survives app restart" — turned out NOT
    a bug: recovered on its own after 5-10 min, then instant.**
    *Cause:* not networking — a feedback gap. The status pill reflects
    self-reachability, which settles before a first rendezvous circuit to a
    specific contact finishes on a genuinely slow cold mobile↔mobile path
    (already-known limitation, item 19). Nothing in the UI said "still
    connecting" during that window, so a slow-but-working cold start looked
    identical to a stuck one.
    *Fix (UI only):* `ChatScreen` shows "Still connecting… first message on
    mobile data can take a few minutes" once an outgoing message has been
    undelivered 25s+. No networking/delivery-queue code touched.

### Editions
7. **Co-installed editions: one could send but not receive.**
   *Cause:* all editions listened on local port 54321; only one could bind it.
   *Fix:* per-edition local port (54321/54322/54323); the virtual onion port
   stays 54321 so cross-device messaging is unchanged.

### Pairing
8. **"One direction works, the reverse doesn't", shifting after every
   restart.**
   *Cause:* a per-contact pairing onion's key was only persisted at scan time;
   depending on timing the onion the peer stored wasn't re-published after a
   restart.
   *Fix (iteration):* first persist the onion immediately; ultimately moved to
   **one main onion per device** for the QR (only one hidden service to keep
   alive).

9. **Pro's QR "not read" by others.**
   *Cause:* after the one-onion switch the QR read the onion passively; if not
   yet set it became `pending.onion`, which the scanner rejects.
   *Fix:* `ensureMainOnion()` actively creates/publishes the main onion for the
   QR; the QR screen shows a "Waiting for Tor…" state and only renders a valid
   QR.

10. **Sudden total send failure across all editions.**
    *Cause:* the one-onion refactor removed `restoreContactServices()`, so
    after a restart the per-contact onions of **existing** pairings were no
    longer published — every already-paired contact pointed at a dead onion.
    *Fix:* re-enabled `restoreContactServices()` — existing per-contact onions
    **and** the new main onion are both published (backward compatible, no
    re-pairing needed).

### Security / privacy
11. **Notification leaked sender name and message content.**
    *Fix:* single anonymous notification ("New message received"),
    `VISIBILITY_SECRET`, no sender/preview; Tor status notification no longer
    shows the onion address.

### UI
12. **PIN "Save" button off-screen, couldn't finish setup.**
    *Fix:* Scaffold `bottomBar` with `navigationBarsPadding` + `imePadding` —
    button always visible above the keyboard/system bars.

13. **QR scanner rotated to landscape and lost the name-entry field.**
    *Cause:* orientation change recreated the activity, dropping Compose state.
    *Fix:* locked MainActivity to portrait + a portrait-only capture activity.

### Build
14. **`receiveMessage` suspend-call compile error.**
    *Fix:* made `receiveMessage` a `suspend fun` (it's always called from a
    coroutine).

---

## What still needs to be done

1. **🟡 obfs4 / Snowflake** via `IPtProxy` — wired, but unverified against a
   real build (no Android SDK in this environment). Check Android Studio's
   sync/build output first if this is a concern.
2. **🟡 One-onion migration for legacy contacts** — a contact paired before
   this device had a main onion can now be moved onto it in-app: either the
   chat's "Send updated connection info" button, or the contact list's new
   proactive banner (surfaces automatically, one tap migrates every affected
   contact at once — `sendMainOnionUpdate()`), instead of only via delete +
   re-pair. Delete + re-pair still works too. Still 🟡 because the migration
   itself has to be triggered by a user, on both sides, before address
   isolation is fully restored for a given pairing.
3. **🟡 LAN discovery hardening** — the NSD service name still broadcasts a
   stable ID prefix (same-network only).
4. **🟡 Constant-rate cover traffic** — stronger timing resistance.
5. **🟡 Optimized adaptive app icons** for Pro/Client.
6. **🟡 Automated tests** — delivery-queue backoff and packet padding now
   covered (`P2PNetworkManagerBackoffTest`, `NetworkObfuscationTest`; ratchet
   + chunking + relay HTTP framing already covered separately — see item 7's
   tests and the standalone `RelayClient` HTTP-framing validation). Wire-ID
   resolution (`IdentityManager`) still untested — it's built directly on
   `Context`/`SharedPreferences`, not cleanly unit-testable without adding
   Robolectric, which hasn't been done.
7. **✅ EXIF/metadata stripping** — done for the image path: every outgoing
   image is re-encoded through a Bitmap (strips EXIF/GPS/XMP/thumbnails,
   orientation applied to pixels first). Only note: attachments deliberately
   sent as generic FILEs remain byte-exact, metadata included — that path is
   for exact file delivery on purpose.
8. **⛔ Voice messages** (record instead of typing, encrypted playback in chat).
   Same chunked-transport path as images/files, plus a recorder/player UI.
9. **🟡 Root-detection gate, real-device verification** — built and wired in
   both the messenger and `unpruuf-relay` (2026‑08‑21), but only reasoned
   through here, not run on an actual rooted phone or a real Magisk Hide/
   Shamiko setup, and the Android Studio emulator carve-out hasn't been
   confirmed on a real emulator either. Do that before this reaches real
   users. Once a Case Vault Android client exists, drop the same
   `RootDetector.kt`/`RootBlockedScreen.kt` pair into it too.
10. **🟡 Fingerprint unlock + `FragmentActivity` change, real-device
    verification** — built 2026‑08‑21, but `MainActivity` switching from
    `ComponentActivity` to `FragmentActivity` (required for `BiometricPrompt`)
    and the new `androidx.biometric` dependency haven't been confirmed to
    compile and run here (no SDK). Confirm a normal build + the fingerprint
    prompt on a device with an enrolled fingerprint before this reaches real
    users.
11. **🟡 Build-freshness gate (6-month expiry), real verification** —
    built 2026‑08‑21; can't be tested end-to-end here since it can't wait
    6 months. Confirm by temporarily shortening `BUILD_EXPIRY_MS` in a local
    build before relying on it.
12. **🟡 Relay `MANDATORY` mode / 2 MB `AUTO` trigger, real-device
    verification** — built 2026‑08‑21, logic traced by hand against the
    existing cross-platform relay-mandatory branch it mirrors. First real
    3-phone test (2026‑08‑21) confirmed the push side works (messages
    reliably queue on the relay) and surfaced a real bug on the fetch side —
    `RelayClient.fetch()` wasn't URL-encoding the wire tag, so any tag
    containing `+` was silently dropped by the relay (see CHANGELOG entry
    (8)); fixed, not yet re-verified against real devices after the fix.
    Still to confirm: a large (>2 MB) file transfer actually routes through
    the relay in `AUTO`. Same 3-phone test also surfaced a latency issue —
    the background relay poll ran every fixed 30s, so delivery could lag
    20–35s; dropped to 6s plus an immediate poll on chat-open (2026‑08‑21,
    see CHANGELOG) — not yet re-verified against real devices.

---

## Build & Run

1. Open `unpruuf/` in Android Studio; let Gradle sync.
2. **Build Variants** → pick `standardDebug` / `proDebug` / `clientDebug`.
3. Run on a physical device (Tor + foreground services; emulators are flaky for onion services).
4. First launch: set a **PIN** and a **Panic PIN**; allow the battery exemption.
5. Pair: each device shows its QR (Add contact) — wait for "Tor active" first — the other scans and names the contact.

> Both devices must run the **same app version**. After a wire-level change,
> update both, restart both apps. If an old pairing misbehaves, delete the
> contact and re-pair.

---

## Threat Model (short)

**Protects against:** server-side surveillance (no server), message-storage
seizure (RAM-only), screenshots (`FLAG_SECURE`), lock-screen leaks (anonymous
notifications), seizure while locked (PIN + wipe), coerced unlock (panic PIN),
contact correlation by ID (per-contact rotating wire-ID), message-size analysis
(fixed padding).

**Not yet fully covered:** DPI-based Tor blocking (Snowflake/obfs4 now wired
but unverified against a real build), global timing correlation, and full
address isolation for legacy contacts that haven't yet sent/received the new
"updated connection info" message.

---

*Last updated: 2026-08-16 (2) · GRAL v3.0 · unpruuf Standard/Pro/Client 1.0.0*
