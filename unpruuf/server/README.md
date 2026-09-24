# unpruuf-relay

Opt-in, blind store-and-forward mailbox for unpruuf. It exists for exactly one case: the
recipient's device is offline (no LAN peer, Tor hidden service unreachable) when you send a
short text message. It is **not** a general message backend — the app is still onion-to-onion
P2P by default, and this relay only ever sees already Double-Ratchet-encrypted, outer-AES-wrapped
opaque blobs addressed by the same rotating wire tag the direct P2P path already uses
(`IdentityManager.myWireId` in the Android app). It never learns who a contact is, and it never
sees plaintext.

Disabled by default. Users opt in per-device under Settings → "Use relay when contact is
offline" and either scan the QR code this server prints at startup or paste the connection
string shown next to it.

## Scope

- Every outer packet is relay-eligible, including one chunk of a larger file/photo transfer:
  each `RatchetFrame.Frame.ChunkCont` carries its own explicit index (not implied by arrival
  order), so the app's receive-side reassembly is correct even if the relay delivers pieces out
  of order — across retries, across a wire-tag rotation boundary, or mixed with some chunks that
  went direct and others that didn't. Direct delivery is still always tried first; the relay is
  only a fallback for whatever direct couldn't get through.
- Delete-on-fetch (`GET /v1/fetch` atomically returns and removes everything queued for a tag —
  no read log, no history).
- TTL sweep: operator-configurable at setup (default 6h — see "Credentials & TTL" below).
- Per-tag queue cap (1500 blobs — comfortably above the ~1311 chunks a full 5 MB file produces
  at `RatchetFrame.CIPHERTEXT_CHUNK_SIZE`) and a 4096-byte per-blob cap (the same `PACKET_SIZE`
  the direct P2P path already enforces) bound what a caller can make the relay store — a fully
  loaded tag is still a fixed, modest ~6 MB on disk, not unbounded.

## Credentials & TTL

Every relay instance generates a random access token the first time it runs
(`relay-identity.json` — treat it like a password, back it up, don't commit it) and requires
`Authorization: Bearer <token>` on every `/v1/relay` and `/v1/fetch` call. Without this, anyone
who learned the relay's address could use it — the wire tag it's addressed by is a rotating
identifier, not a secret. Restarting the server reuses the same token and TTL; nothing needs
re-pairing. To force a new token, run with `--regenerate` (Windows) or delete
`relay-identity.json` (Docker/Linux) — every device then needs to scan/paste the new one.

The TTL (how long an undelivered blob is kept) is asked interactively on first setup and then
reused. There's no hard requirement it match the app's ±2h wire-tag resolution tolerance — a
longer TTL just means a contact who's offline for days still gets the message once they're back;
it costs disk, not correctness.

The connection string / QR encodes both the address and the token together:
`unpruuf-relay:v1:<address>:<token>` (see `src/connectionString.ts` — the Android app's
`RelayManager.parseConnectionString` is a byte-for-byte Kotlin port of the same format).

## API

Only meant to be reached over the relay's own Tor hidden service. `/health` is unauthenticated;
everything else requires the bearer token described above.

- `POST /v1/relay` — `{ "tag": "<wire tag>", "blob": "<base64>" }` → `201 { "stored": true }`.
- `GET /v1/fetch?tag=<wire tag>` → `200 { "blobs": ["<base64>", ...] }`, and deletes them.
- `POST /v1/fetchMany` — `{ "tags": ["<wire tag>", ...], "waitMs": <optional, capped at
  `MAX_WAIT_MS`> }` → `200 { "blobs": { "<wire tag>": ["<base64>", ...], ... } }`, and deletes
  them. Batched sibling of `GET /v1/fetch` for a client checking several tags at once (e.g. one
  device polling several contacts' hour ± tolerance windows across a relay pool); with `waitMs` >
  0 the request long-polls — holds the connection open until any of the given tags receives a
  blob, or the timeout elapses, whichever comes first — instead of the caller re-polling on a
  fixed interval. Up to `MAX_FETCH_MANY_TAGS` tags per call. Wire-identical on `relay-android/`.
- `GET /health` → `200 { "ok": true }`.

## Development

```bash
npm install
npm test           # compiles + runs the node:test suite (blobStore, HTTP layer, identity, Tor helpers)
npm run dev         # ts-node, plain HTTP on 127.0.0.1:8787 — no Tor, no auth, for local iteration only
```

## Deployment

**Windows** (no Docker) — see `windows/README.md`. Double-click `start-windows.bat`; it manages
its own Tor process and prints the QR/connection string to the console on every run.

**Windows, no Node.js install needed either** — see `EXE_BUILD.md`. Build a standalone
`unpruuf-relay.exe` once (needs Node.js for that one build step), then hand it out to anyone who
should just be able to double-click and go, with nothing to install at all.

**macOS** (no Docker) — see `mac/README.md`. Double-click `start-mac.command` (one-time Gatekeeper
approval needed, since it's an unsigned script); it manages its own Tor process the same way the
Windows path does and prints the QR/connection string to the terminal on every run. Works on both
Apple Silicon and Intel Macs — the Tor Expert Bundle auto-download picks the right build.

**Docker / Linux:**

```bash
docker compose up -d --build
```

Builds two containers: `relay` (the Node app, `network_mode: none` — no network access at all
except loopback) and `tor` (shares `relay`'s network namespace via `network_mode:
service:relay`, so it can reach `127.0.0.1:8787` directly without either container ever being
exposed on a Docker bridge network or clearnet). The auth token is generated on first start and
printed once to the logs (`docker compose logs relay`); the onion hostname is written to the
`relay-hs` volume:

```bash
docker compose logs relay | grep 'auth token'
docker compose exec tor cat /var/lib/tor/unpruuf_relay/hostname
```

Build the connection string by hand for this path: `unpruuf-relay:v1:<hostname>:<token>`, then
paste it into the app's Settings screen (or generate a QR for it yourself — the format is just
that one string).
