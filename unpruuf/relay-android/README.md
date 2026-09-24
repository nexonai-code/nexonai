# unpruuf Relay (Android)

A standalone Android app version of `unpruuf/server/` — the optional, blind store-and-forward
mailbox for unpruuf (see the main project's `server/README.md` for what the relay is and isn't).
This app lets you run a relay directly on a phone: no laptop, no Docker, no Node.js install —
open the app, and it starts the server, publishes a Tor hidden service, and shows a QR code the
messenger app can pair to.

**This is a separate app from the messenger.** Package `com.nexonai.unpruuf.relay`, own Gradle
project, own APK. It doesn't send or receive chat messages itself — it's infrastructure other
unpruuf users can optionally point their own app at (Settings → "Use relay when contact is
offline") when a direct connection isn't available.

## Why native Kotlin instead of embedding the existing Node server

The existing relay is a small TypeScript/Node app using `better-sqlite3` (a compiled native
Node addon) and its own downloaded desktop Tor binary — neither fits Android directly.
Embedding real Node.js on Android (via `nodejs-mobile`) was considered and rejected: getting
`better-sqlite3` cross-compiled against `nodejs-mobile`'s Node ABI for every Android CPU
architecture is a well-known blocker that similar projects regularly get stuck on, and it isn't
something that could be verified without a working Android build environment.

Instead, this app reimplements the same small wire contract — `POST /v1/relay`,
`GET /v1/fetch`, `GET /health`, bearer-token auth, TTL-based expiry — natively in Kotlin:

- **Tor**: the exact same mechanism (`info.guardianproject:tor-android` + `jtorctl`) the main
  unpruuf messenger app already uses for its own hidden service, reused here for a single fixed
  service instead of a per-contact one. This is the highest-confidence part of this app — it's
  not new code, it's the same pattern already reasoned through carefully elsewhere in this
  project.
- **HTTP server**: [NanoHTTPD](https://github.com/NanoHttpd/nanohttpd), a small, extremely
  well-established pure-Java embedded HTTP server (no native/NDK code, no separate ABI builds).
  Chosen over hand-rolling HTTP/1.1 parsing — the app's own `RelayClient.kt` can get away with
  hand-rolled HTTP because it only ever constructs one fixed kind of request itself; a *server*
  has to correctly parse arbitrary incoming requests, which is exactly the kind of
  correctness-sensitive code worth using a proven library for instead of guessing at by hand in
  an environment with no way to compile or test it.
- **Storage**: plain Android `SQLiteOpenHelper` (no Room, no SQLCipher) — mirrors the Node
  version's own choice of plain SQLite. Everything stored is already Double-Ratchet-encrypted
  ciphertext this relay is architecturally blind to, so at-rest encryption of the queue itself
  wouldn't add real confidentiality.

The wire format is identical to the Node relay, byte-for-byte — the main unpruuf app's
`RelayClient.kt`/`RelayManager.kt` talk to this Android relay with **zero changes**, exactly as
they would to a Docker or Windows-`.exe` relay instance.

## What the app does

1. On launch, starts a foreground service that boots Tor and publishes one fixed hidden service
   (this identity — and therefore the connection string below — stays the same across restarts).
2. Shows a QR code (and the same string as selectable text, with a copy button) of
   `unpruuf-relay:v1:<onion>:<authToken>` — scan or paste this into the unpruuf app under
   Settings → Relay, exactly like pairing against a desktop-hosted relay.
3. Lets you set **message expiry** ("when the reset happens") — how many hours an undelivered
   message is kept before being deleted automatically. Adjustable any time, takes effect on the
   next sweep (every 15 minutes) without needing a restart.
4. A **"Reset now"** button clears every currently queued message immediately, independent of
   the TTL.
5. A secondary **"Rotate"** action on the access token, for "credentials might be compromised" —
   clearly labeled as breaking every device already paired with this relay, since it does.
6. **Censorship circumvention (Tor bridges, incl. obfs4/Snowflake).** A toggle + bridge-lines
   field, exactly mirroring the main messenger app's Settings → Censorship Circumvention:
   vanilla `IP:Port Fingerprint` bridges work directly, and obfs4/Snowflake lines start the
   corresponding local IPtProxy client and only get plugged into Tor once that client actually
   reports a live port — otherwise Tor falls back to a direct (unbridged) connection rather than
   being left half-configured. "Save & reconnect" applies a change immediately, without needing
   the app restarted. This matters even more for a relay than for a personal messenger: a relay
   nobody in a censored network can reach Tor to run is useless to everyone depending on it.

## Known limitations of this first version

- **No network-change resilience yet.** The main messenger app has an entire history of fixes
  (see the root `CHANGELOG.md`) for keeping a Tor hidden service reliably published across
  Wi‑Fi↔mobile-data switches. This first version of the relay app does NOT yet replicate that —
  it publishes once and relies on Tor's own reconnect behavior. If you're running this on a
  phone that changes networks often, the relay's hidden service may need the app restarted
  after a switch to republish reliably. Worth building if this app sees real use; scoped out of
  this delivery to stay focused on what was actually asked (start the server, show the QR,
  make the reset configurable).
- **Battery/Doze**: same as the main app — for a relay meant to stay reachable, grant the
  battery-optimization exemption when asked on first launch, and ideally keep the app open or
  the phone plugged in if it's meant to be a "real," continuously-available relay rather than an
  occasional one.
- Not independently audited, same disclosure as everything else in this project (see the main
  project's `SECURITY_CLAIMS.md`).

## Build & run

1. Open `unpruuf/relay-android/` in Android Studio **as its own project** (not as part of the
   main `unpruuf/` messenger project — they're separate Gradle builds, same as `unpruuf/ios/`
   is separate from the Android messenger).
2. If Android Studio reports the Gradle wrapper is missing (this project ships without the
   binary `gradle-wrapper.jar`, since it can't be hand-authored as text), let Android Studio
   generate it — it'll offer to on first open, matching `gradle-wrapper.properties`' pinned
   Gradle 8.6.
3. Run on a physical device (Tor hidden services are unreliable on emulators, same caveat as
   the main app).
4. Grant the battery-optimization exemption when asked.
5. The QR code appears once Tor finishes bootstrapping (10–30s on first start).

## Pairing it to the messenger app

In the main unpruuf app: Settings → Relay (optional) → enable → scan this app's QR code (or
paste the connection string). Both devices' unpruuf app now try direct delivery first, always,
and fall back to this relay only if that fails.
