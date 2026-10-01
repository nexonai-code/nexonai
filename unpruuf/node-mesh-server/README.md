# unpruuf-node-mesh

Node server for the unpruuf **Business** product line — architecture in `../NODE_MESH_SPEC.md`.
A separate product from `../server/` (the consumer app's optional relay); that one is unchanged.

## Schnellstart (Windows)

1. `install.bat` doppelklicken (einmalig — braucht Node.js LTS von nodejs.org).
2. `start.bat` doppelklicken. Beim ersten Start fragt es:
   - **Slot 1, 2 oder 3** — welcher deiner bis zu 3 eigenen Nodes das ist.
   - **Profil** — wie lange Nachrichten auf dem Node liegen (standard 6 h / high-security 1 h /
     offline-tolerant 24 h).
   - **Anzahl Nodes** (1–500, Enter = 10) — so viele eigene `.onion`-Adressen betreibt dieser
     eine Server, alle in einem Prozess mit einem Tor.
3. Der Server lädt Tor einmalig herunter, erstellt die `.onion`-Adressen und öffnet im Browser
   die **Einrichtungsseite** mit dem Owner-QR.
4. In der unpruuf-App: **Einstellungen → Business Node-Mesh → QR scannen**. Ein Scan reicht:
   Die App holt sich alle anderen Nodes dieses Servers selbst (`GET /pool`) und gibt jedem neuen
   Kontakt eigene Nodes daraus.

Der Owner-QR ist dein **Schreibschlüssel** — nur in die eigene App, nie an Kontakte. Kontakte
bekommen die Node-Adresse automatisch beim Pairing.

**Temp Node** (für genau einen Chat, nur im Arbeitsspeicher): `start-tempnode.bat`, dann in der
App im Chat **Temp Node** wählen und den QR von der Einrichtungsseite scannen.

Ohne Node.js auf dem Zielrechner: siehe `EXE_BUILD.md` (fertiger Ordner mit `.exe` + denselben
`start.bat`/`start-tempnode.bat`).

## Linux / Docker

```bash
./start.sh 1 standard 10       # slot, profile, nodes — setup page on http://localhost:8790
./start-tempnode.sh            # Temp Node — setup page on http://localhost:8810
docker compose up -d           # container, setup page on the host's http://localhost:8790
```

## What the node does on its own

| | |
|---|---|
| **Tor onion service** | Mandatory and fully managed: downloads the pinned Tor Expert Bundle once, runs its own Tor, publishes the node via the control port (`ADD_ONION`). The public API only listens on `127.0.0.1` — "the node never learns a sender IP" is structural, not a logging policy. |
| **Many nodes, one process** | `NODE_MESH_NODES=1..500` (default 1; `start.bat`/`start.sh` default 10): one Tor process publishes that many onion services, all mapped to the same local API and store. Each is a separate address to the outside; the owner's app hands different ones to different contacts. |
| **Stable addresses** | One onion key per node is stored in `data/node-<slot>/node-mesh-identity.json` (`onionKeys`, file mode 600) and reused on every start; restarts and the daily Reset never change any address. Raising `NODE_MESH_NODES` later adds new addresses and keeps the existing ones. |
| **Proof-of-work DoS defense** | Tor's onion-service PoW (`PoWDefensesEnabled=1`) is always on — flooding the node with connections costs the attacker CPU per attempt. The pinned bundle's Tor 0.4.9 ships the `pow` module (verified with `tor --list-modules`). |
| **Self-healing** | If Tor crashes or the control connection drops, Tor restarts with backoff and re-adds the same key → same address. Tor also exits on its own if this process dies (`__OwningControllerProcess`), so no orphaned Tor keeps running. |
| **Profiles** | `NODE_PROFILE=standard\|high-security\|offline-tolerant` (6 h / 1 h / 24 h). Max 24 h, because every unpruuf client polls a window sized for 24 h — so any profile is always fully covered without the client knowing which one a contact runs. Unknown names refuse to start. |
| **Slots** | `NODE_SLOT=1\|2\|3`: staggered daily Reset at minute 0 / 20 / 40 (UTC-aligned, so nodes on different machines stagger correctly), own default ports and data folder per slot — all three can even run on one machine. |
| **Reset (hygiene only)** | Closes idle HTTP sockets, verifies the onion is still registered (re-adds it with the same key if not), checkpoints SQLite. Never touches messages, rate-limit counters or the address (NODE_MESH_SPEC.md §5). |
| **Cleanup** | TTL sweep every 5 min is the only deletion path; expired rows are already invisible to reads. SQLite `secure_delete` overwrites swept ciphertext instead of leaving it in free pages. |
| **Setup page** | Separate port (never part of the onion's port mapping), bound to `127.0.0.1`, loopback `Host` header required (blocks DNS-rebinding pages from reading the owner secret). Shows owner QR, Tor state, profile, slot, stored packet count, and a "rotate owner secret" button (custom-header CSRF guard; takes effect immediately, address unchanged). |
| **Temp Node** | `EPHEMERAL=1` / `--ephemeral`: owner secret, onion key and messages exist only in memory — the key goes to Tor over the control port, never through a `HiddenServiceDir`. Tor's own working folder is a temp dir deleted on exit. Every start = new address. |

## Ports (defaults per slot)

| Slot | API (loopback, behind the onion) | Setup page |
|---|---|---|
| 1 | 8788 | 8790 |
| 2 | 8798 | 8800 |
| 3 | 8808 | 8810 |

Override with `PORT` / `ADMIN_PORT`. Other env vars: `NODE_MESH_DATA_DIR`, `TOR_EXE_PATH` (use an
existing Tor binary instead of downloading), `ADMIN_BIND` (Docker only), `NODE_MESH_TOR=0` +
`NODE_MESH_PUBLIC_ADDRESS` (only if you run your own hidden service in front of `PORT` — never a
LAN shortcut; the app always reaches nodes through Tor).

## API (identical on the Android node — `../relay-android`, Business Node mode)

- `PUT /deposit` — `{ "routing_tag", "ciphertext": "<base64>", "ttl"?: <ms> }` → `201`.
  **Owner-only** (`Authorization: Bearer <ownerSecret>`). `ttl` may only shorten the profile's TTL.
- `GET /fetch?tag=<routing_tag>` → `{ "blobs": [...] }`. Read-only, no auth — the tag is the
  credential. Never deletes.
- `POST /fetchMany` — `{ "tags": [...], "waitMs"? }` → `{ "blobs": { "<tag>": [...] } }`.
  Read-only, optional long-poll (max 55 s).
- `GET /pool` → `{ "addresses": [...] }` — every node address this server runs. **Owner-only**;
  the app calls it after the owner QR is scanned. Contacts never see this list.
- `GET /health` → `{ "ok": true }`.

Read endpoints share a global token bucket (burst 30, 5/s) — every request arrives from local Tor,
so there is no client IP to key on.

## Verified

- `npm test` — 41/41 (HTTP contract incl. owner-only `/pool`, node-count bounds, migration of a
  single-key identity file, store, rate limiter, profiles/slots, Tor control protocol
  against a fake control port, torrc, setup page incl. DNS-rebinding refusal and CSRF-guarded owner-secret rotation).
- Real Tor 0.4.9.11 in the dev sandbox: onion created with PoW via `ADD_ONION`; same address after
  a restart; `kill -9` of Tor → automatic restart with the same address; Temp Node left no key on
  disk and its temp folder was gone after exit; no orphaned Tor after shutdown.
- Standalone binary (`npm run build:exe`) built and run on Linux with the same Tor: onion, setup
  page and owner code all worked from the single executable.

- Multi-node, real Tor: 3 nodes in one process got 3 different onion addresses; after a restart
  all 3 came back unchanged; `/pool` answered only with the owner secret (401 without).

## Measured: nodes per server (2026-10-01, `tools/measure_nodes.py`)

RAM after start, one process vs. separate processes, dev sandbox (4 vCPU, 16 GB):

| Nodes | Processes | Node.js | Tor | Total RAM | Idle CPU |
|---|---|---|---|---|---|
| 1 | 1 | 66 MB | 12 MB | 78 MB | 0 % |
| 10 | 1 | 66 MB | 13 MB | 79 MB | 0 % |
| 100 | 1 | 67 MB | 14 MB | 80 MB | 0 % |
| 500 | 1 | 67 MB | 19 MB | 85 MB | 0.1 % |
| 10 | 10 | 664 MB | 124 MB | 788 MB | 2.4 % |

**Limit of this measurement:** the sandbox stops Tor at the network handshake, so these onions were
registered but never published to the Tor network. A live onion service additionally keeps
introduction circuits open and re-uploads its descriptor regularly — that per-node network and
memory load is NOT in these numbers and must be measured on a real VPS (`python3
tools/measure_nodes.py` after `npm run build`). What the numbers do show: the software itself is
not the limit, and one process with N nodes costs about a tenth of N separate processes.

## Not verified

- Tor reaching 100 % bootstrap: the dev sandbox's network policy stops every Tor connection at the
  handshake (same as for officer-app) — publishing to the real Tor network must be confirmed on a
  normal internet connection.
- A real Windows run of `start.bat` / the `.exe`, and the Docker image (the sandbox's Docker
  build couldn't reach the npm registry). `docker compose up` on a normal machine is the check.
