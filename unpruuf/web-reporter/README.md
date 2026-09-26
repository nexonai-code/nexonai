# unpruuf Web Reporter

A no-install, any-browser way to submit a whistleblower report — for a reporter who can't or
won't install the Android app. **Weaker anonymity guarantees than the app — this exists because
Gabriel explicitly wants a fallback channel for that case, with the tradeoffs disclosed up
front, not because it matches the app's security bar.** The page itself states this in a banner
every visitor sees before they can start a report.

## What it is

A static page (`public/index.html` + a bundled `bundle.js`) that runs the same Double Ratchet /
cross-platform pairing protocol as the Android app and the officer-app, reimplemented in
browser-safe TypeScript (`src/`) — pure `@noble/*` primitives, no Node built-ins, no server-side
logic of its own. It talks directly to the relay over CORS (see `../server/src/app.ts`'s CORS
middleware).

**Verified independently from the Android/officer-app crypto**, not just copy-pasted: X25519,
HKDF-SHA256 and XChaCha20-Poly1305 (`@noble/curves`, `@noble/hashes`) are the same primitives
officer-app already cross-checked against a real Tink jar; the one part that differs here — AES-
256-GCM via `@noble/ciphers/aes.js`'s pure-JS `gcm` instead of Node's built-in `crypto` module —
was separately confirmed to produce byte-identical output to a real `javax.crypto.Cipher` run.
On top of that, **this app's own modules and officer-app's were run against each other** over a
real relay instance (report → officer decrypts it → officer replies → this app decrypts the
reply) — two independently-written implementations agreeing end-to-end, not one codebase
trusting its own math.

## Quick start (Windows)

1. Double-click `install.bat` (first time only).
2. Double-click `start.bat`. Open `http://localhost:5173` — or give that machine's LAN address
   (`http://<ip>:5173`) to anyone else on the same Wi-Fi.
3. A reporter needs two things to start: the officer's pairing code, and the relay's address —
   the officer's dashboard (`../officer-app/`) shows both.

## Known gaps (disclosed on the page itself, repeated here for the record)

- **No Tor.** Talks plain HTTP(S) to the relay. A network observer between the reporter and the
  relay learns that this browser is talking to that relay (not what's said) — the Android app's
  Tor hidden-service path hides that too. The page tells reporters to consider Tor Browser for
  that reason.
- **No RAM-only/wipe-on-background guarantee.** Everything (identity, ratchet session, message
  history) lives in `localStorage` until the "Delete everything from this browser" button is
  used. The app instead keeps messages only in RAM with a 5-minute TTL.
- **No root/jailbreak-equivalent device-compromise detection**, no screenshot blocking, no PIN
  lock — none of the app's anti-forensics layer exists here, because a browser tab can't provide
  it.
- **One case per browser at a time** — starting a new report overwrites the current one in
  `localStorage` (v1 scope; not a technical limit, just not built yet).
- End-to-end encryption itself is NOT weaker here — a relay operator or network observer still
  cannot read report content either way. The gaps above are all about metadata/device exposure,
  not about the crypto.

## Files

```
src/                 Browser-safe crypto/wire/pairing port (see each file's doc comment for
                      which officer-app file it mirrors) + main.ts (UI wiring, localStorage)
public/               index.html, styles.css, and the built bundle.js (via `npm run build`)
build.js              esbuild bundler (IIFE, self-contained — no CDN dependency at runtime)
serve.js              Zero-dependency static file server (no server-side logic of its own)
```
