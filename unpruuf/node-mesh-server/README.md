# unpruuf-node-mesh

Node server for the unpruuf **Business** product line — see `../NODE_MESH_SPEC.md` for the full
architecture. **Not** the same product as `../server/` (the consumer app's optional store-and-
forward relay), and not a drop-in replacement for it — that product is unchanged and keeps
running exactly as before. This is a separate server for a separate, mandatory-node product line.

**Status: Phase 1 of the spec**, plus the server-side half of §7's Temp Node and a standalone
Windows `.exe` build (see below). This package implements the core Node server API (`/deposit`,
`/fetch`, `/fetchMany`) exactly as specified, fully tested (`npm test`). It does **not** yet
include: a bundled Tor process manager (Windows/macOS start scripts that also manage Tor itself,
like `../server/` has) or a Linux standalone binary build. See `NODE_MESH_SPEC.md` §12 for the
full picture of what this is one piece of.

## Temp Node mode

`EPHEMERAL=1` (or `--ephemeral`) starts this process as a one-off Temp Node (NODE_MESH_SPEC.md
§7): a fresh owner secret generated in memory and an in-memory (`:memory:`) message store —
**nothing touches disk**, and every restart is a brand new node identity, unlike the default mode's
persisted `node-mesh-identity.json`/`node-mesh.sqlite`. The generated owner secret is printed once
at startup; give that string (in the exact `unpruuf-node-owner:v1:<address>:<secret>` shape the
app already understands for a standard node) to the app's Temp Node screen for the one chat this
instance is meant to serve.

```bash
npm run start:tempnode   # same as: EPHEMERAL=1 node dist/index.js
```

## What makes this different from `../server/`

| | `../server/` (consumer relay) | `node-mesh-server/` (this package) |
|---|---|---|
| Who writes | Any paired contact (shared bearer token) | **Only the node's own owner** (a secret never shared with contacts) |
| Who reads | The node owner, delete-on-fetch | Any contact who knows a valid routing tag, **read-only** |
| Cleanup | Delete-on-fetch + TTL sweep | **TTL sweep only** — fetch never deletes |
| Auth on read | Bearer token required | None — the routing tag itself is the credential |

Same wire-format conventions otherwise (base64 blobs, `POST /fetchMany`'s `{tags, waitMs}` →
`{blobs: {tag: [...]}}` shape, tag character class) — a client that already speaks the consumer
relay's `/v1/fetchMany` needs almost no new parsing logic to also speak this.

## API

Only meant to be reached over this node's own Tor hidden service. `/health` is unauthenticated
and reveals nothing.

- `PUT /deposit` — `{ "routing_tag": "...", "ciphertext": "<base64>", "ttl"?: <ms> }` →
  `201 { "stored": true }`. **Owner-only**: requires `Authorization: Bearer <ownerSecret>`. This
  secret is generated once (`node-mesh-identity.json`) and configured into the owner's own app
  instance(s) — it must never be given to a contact. `ttl` may only shorten this node's own
  configured default, never lengthen it.
- `GET /fetch?tag=<routing_tag>` → `200 { "blobs": ["<base64>", ...] }`. **Read-only, no auth** —
  the tag itself, HKDF-derived from a pairing secret, is the access credential. Never deletes.
- `POST /fetchMany` — `{ "tags": [...], "waitMs"?: <ms, capped at MAX_WAIT_MS> }` →
  `200 { "blobs": { "<tag>": ["<base64>", ...], ... } }`. Batched, optionally long-polling sibling
  of `/fetch`. Read-only, same as `/fetch`.

Cleanup is TTL-only, on a periodic internal sweep — there is no delete endpoint and no
delete-on-fetch anywhere. See `NODE_MESH_SPEC.md` §4/§8 for why.

## Development

```bash
npm install
npm test    # compiles + runs the node:test suite (store, HTTP layer, rate limiter)
npm run dev # ts-node, plain HTTP on 127.0.0.1:8788 — no Tor, no auth wrapper beyond the owner secret
```

## Deployment

- **`npm run build && npm start`** behind your own Tor hidden service — works everywhere Node.js
  runs.
- **Windows, no Node.js required on the machine that runs it:** see `EXE_BUILD.md` — produces a
  standalone `unpruuf-node-mesh.exe` (same Node "Single Executable Application" technique
  `../server/` already uses for `unpruuf-relay.exe`). Also the natural way to run a Temp Node
  (`EPHEMERAL=1`, above) from a second Windows machine without installing anything on it first.
- Docker/macOS packaging: not yet built out for this package — `../server/`'s scripts are the
  reference to adapt once this reaches that phase.
