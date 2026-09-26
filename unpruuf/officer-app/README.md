# unpruuf Officer App

The compliance officer's side of **unpruuf Whistleblower** — a real Double Ratchet peer
(byte-for-byte wire-compatible with the Android app, cross-checked against a real Tink jar and
proven end-to-end against a live relay — see "How this was verified" below), plus a local case
management dashboard that makes this an actual EU Directive 2019/1937 whistleblowing channel,
not just an anonymous chat.

Windows-first (`install.bat` / `start.bat`), but plain Node/TypeScript underneath — runs on
Linux/macOS the same way (`npm install && npm run build && npm start`).

## What this is NOT

Not a variant of the blind relay in `../server/`. The relay never sees plaintext or identity —
this app is the opposite: it holds the officer's real private keys and decrypts everything
addressed to them. Keep the two conceptually separate.

## Quick start (Windows)

1. Get a relay running first — either `../relay-android` on a tablet/phone, or `../server` on
   this same laptop/another machine. Either one prints a connection string
   (`unpruuf-relay:v1:<address>:<token>`) and a QR code.
2. Double-click `install.bat` (first time only).
3. Double-click `start.bat`. It asks for:
   - the relay's connection string (paste what the relay printed)
   - the relay's **reachable address** on your network, e.g. `http://192.168.1.50:8787` — see
     "Known gaps" below for why this is a separate value from the connection string
   - your officer password (protects the case database; there is no recovery if you forget it)
4. Open `http://localhost:3000` — your pairing QR is on the dashboard's first screen.

## How a case gets started

1. A reporter scans your dashboard's QR in the unpruuf app (Whistleblower edition).
2. Their app immediately shows **their own** code with a "copy" button — there's no way for
   your laptop dashboard to scan their phone back, so this replaces the second half of
   unpruuf's usual mutual-QR pairing ceremony.
3. They share that code with you however they're comfortable (in person, a drop box, whatever
   channel your organization sets up) — you paste it into "Add a case" on the dashboard.
4. Their actual report arrives moments later (or is already queued if they sent it right after
   scanning) — no separate action needed, the poll loop picks it up automatically.

## Architecture in one paragraph

Every case is a normal unpruuf Double Ratchet session (`src/crypto/`, `src/wire/` — direct ports
of the Android app's `domain/network/ratchet/*` and `domain/network/{RatchetFrame,
NetworkObfuscation, MessagePayload, CryptoManager}.kt`), always relay-mandatory (this product
line never does direct P2P — see the Android app's `AppEdition.WHISTLEBLOWER` /
`RelayManager.isMandatory()`). `src/officer/pollAndIngest.ts` polls the relay for every case's
expected wire tags (`POST /v1/fetchMany`, one round-trip for every case), decrypts what comes
back, and files it into `src/store/caseStore.ts` — an encrypted-at-rest SQLite database that
also tracks each case's EU Art. 9 deadlines (acknowledge within 7 days, follow up within 3
months).

## How this was verified

- **Crypto interop**: X25519, HKDF-SHA256, and XChaCha20-Poly1305 (`src/crypto/primitives.ts`)
  were cross-checked byte-for-byte against a real `com.google.crypto.tink:tink:1.11.0` jar
  (Java, the exact library the Android app uses) for fixed test vectors before this was written
  — not assumed compatible. AES-256-GCM (the outer envelope) was cross-checked the same way
  against `javax.crypto.Cipher`.
- **Protocol round trip**: a full pairing → report → officer reply → reporter decrypts cycle was
  run against a real `../server` relay instance in this repo's own dev sandbox, simulating the
  Android side with this app's own (wire-identical) crypto modules. All checks passed. This is
  NOT the same as running the real Android app — see "Known gaps".
- **TypeScript build**: `npm run build` compiles clean, no errors — unlike the Android/iOS apps,
  this one has a real toolchain to build-verify in.

## Known gaps (read before a real deployment, not just a demo)

- **No Tor.** `src/relay/relayClient.ts` talks plain HTTP(S) to the relay's reachable address.
  Both `../server` and `../relay-android` deliberately bind their listener to `127.0.0.1` only
  and are meant to be reached via their Tor hidden service — real security posture, not an
  oversight. For a demo on one Wi-Fi network, opening the relay's bind host to the LAN (see
  `../server`'s `RELAY_BIND_HOST` env var) is a documented, explicit simplification. A real
  deployment should run this process behind a Tor client instead — `../server/src/windowsTor.ts`
  already has a proven Tor-bootstrap implementation to adapt; not done this session.
- **Single relay only.** `sendReply.ts` always pushes to this process's one configured relay,
  not to whichever relay(s) a reporter's own pairing code advertised. Correct for a
  single-shared-relay demo; a real multi-relay-pool router is a fast-follow.
- **Not build-verified against the real Android app** — the E2E test above simulates the
  Android/iOS side with this app's own TypeScript crypto, which is wire-identical by
  construction, but a genuine phone-to-laptop run over a real relay hasn't happened yet. Do that
  before relying on this for anything real.
- **Chunked attachments are not persisted across a restart.** `pollAndIngest.ts` buffers an
  in-progress multi-packet transfer (e.g. a photo) in memory only; a restart mid-transfer loses
  it. Text reports (the whole point of v1) are unaffected — they always fit in one packet.
- **Sensitive case metadata (existence, timestamps) is not itself encrypted** — only message
  bodies and crypto secrets are (see `caseStore.ts`'s doc comment). Someone with read access to
  `data/cases.sqlite` (but not the password) learns "N cases exist, opened on these dates,"
  nothing more.
- **The dashboard has no login of its own.** `OFFICER_PASSWORD` protects data at rest, not the
  HTTP server — don't expose `PORT` (default 3000) beyond localhost/a trusted LAN.
- **No "Wechsel" (relay-rotation) UI** — a case's generation counter stays 0 unless the reporter's
  own app rotates it, which the poll loop tolerates (small generation window) but the officer
  side can't trigger.

## Files

```
src/crypto/        X25519, HKDF, HMAC, XChaCha20-Poly1305, Double Ratchet — direct Kotlin ports
src/wire/          Packet padding, chunk framing, message payload — direct Kotlin ports
src/pairing/       Cross-platform (relay-mandatory) QR payload codec — direct Kotlin port
src/relay/         HTTP client for the relay's wire API + connection-string codec
src/officer/       Officer identity, case intake, ratchet bootstrap, poll/ingest, send-reply
src/store/         Encrypted-at-rest SQLite case store + EU deadline logic
src/web/           Express dashboard API + static vanilla-JS UI (src/web/public/)
```
