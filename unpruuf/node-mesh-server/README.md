# unpruuf-node-mesh

Node server for the unpruuf **Business** product line — architecture in `../NODE_MESH_SPEC.md`.
A separate product from `../server/` (the consumer app's optional relay); that one is unchanged.

## Schnellstart (Windows)

1. `install.bat` doppelklicken (einmalig — braucht Node.js LTS von nodejs.org).
2. `start.bat` doppelklicken. Beim ersten Start fragt es:
   - **Slot 1, 2 oder 3** — welcher deiner bis zu 3 eigenen Nodes das ist.
   - **Profil** — wie lange Nachrichten auf dem Node liegen (standard 6 h / high-security 1 h /
     offline-tolerant 24 h).
3. **Lizenz:** Ohne Lizenz zeigt der Server nur die Einrichtungsseite. Den Lizenzcode von NexonAI
   dort einfügen („Lizenz erforderlich“), dann startet alles ohne Neustart. Der Code wird nur auf
   diesem Rechner geprüft. Die Lizenz legt die Zahl der Nodes (höchstens 250) und die Laufzeit fest;
   der Server startet immer alle lizenzierten Nodes — es gibt keine Einstellung dafür.
4. Der Server lädt Tor einmalig herunter, erstellt die `.onion`-Adressen und öffnet im Browser
   die **Einrichtungsseite** mit dem Owner-QR.
5. In der unpruuf-App: **Einstellungen → Business Node-Mesh → QR scannen**. Ein Scan reicht:
   Die App holt sich alle anderen Nodes dieses Servers selbst (`GET /pool`) und gibt jedem neuen
   Kontakt 3 Nodes daraus (zufällig, auf verschiedene Server verteilt; Kontakte teilen sich Nodes).

Der Owner-QR ist dein **Schreibschlüssel** — nur in die eigene App, nie an Kontakte. Kontakte
bekommen die Node-Adresse automatisch beim Pairing.

**Nach jedem Neustart ist der Server gesperrt** (Schlüssel liegen nur verschlüsselt auf der Platte).
In der App erscheint unter Einstellungen → Eigene Nodes **„Server gesperrt → Entsperren“** — antippen,
bestätigen, fertig. Nur entsperren, wenn du weißt, warum er neu gestartet ist.

**Temp Node** (für genau einen Chat, nur im Arbeitsspeicher): `start-tempnode.bat`, dann in der
App im Chat **Temp Node** wählen und den QR von der Einrichtungsseite scannen.

Ohne Node.js auf dem Zielrechner: siehe `EXE_BUILD.md` (fertiger Ordner mit `.exe` + denselben
`start.bat`/`start-tempnode.bat`).

## Lizenz

- Ein Code je Server (`unpruuf-server-license:v1:…`): Kunde, Seriennummer, **max. Nodes**, **Ablaufdatum**.
  Wird offline geprüft, nichts wird gesendet, kein Gerät wird erfasst.
- Eintragen: Einrichtungsseite, oder Datei `license.txt` im Datenordner, oder `NODE_MESH_LICENSE`
  (Container). Sind mehrere da, gilt die mit der längsten Laufzeit — eine Verlängerung wirkt also sofort.
- **Die Zahl der Nodes ist keine Einstellung.** Der Server startet immer genau so viele, wie die Lizenz erlaubt (normal und höchstens 250). `NODE_MESH_NODES` wird ignoriert.
- 30 Tage vor Ablauf warnen Einrichtungsseite, Übersicht und Log. **Nach Ablauf** werden neue
  Nachrichten abgelehnt (HTTP 402), das Abholen vorhandener Pakete geht weiter. Verlängerungscode
  einfügen, fertig, kein Neustart.
- Temp Node braucht keine Lizenz.
- Ausgestellt wird mit `../license-tool/` (`issue-server.js` oder die GUI).
- Ehrlich: Der Server ist lesbarer Code auf dem Rechner des Kunden. Die Prüfung hält ehrliche Kunden
  ehrlich und macht den Vertrag im Produkt sichtbar. Sie ist kein Kopierschutz.

## Node-Liste für die App

Auf der Einrichtungsseite: **„Liste als Datei speichern“**. Die Datei (`unpruuf-nodes-server-N.txt`,
Format `unpruuf-node-list:v1`, siehe `src/nodeList.ts`) enthält alle Adressen dieses Servers, den
Schreibschlüssel und bei versiegelten Servern die Control-Adresse. In der App: **Einstellungen →
Node-Listen → Datei auswählen**. Die Datei ist so sensibel wie der Owner-QR: nur aufs eigene Handy,
danach löschen. Gesperrte Server exportieren nicht.

## Listen-Dienst (Firmen-Feed)

`start-feed.bat` (oder `npm run start:feed`): ein kleiner Dienst, der Mitarbeitern die aktuellen Node-Listen gibt, unter einer
Onion-Adresse, die sich alle paar Stunden ändert (nur die App rechnet sie aus). Einrichtungsseite `http://localhost:8841`,
Ports 8840 (Dienst, nur Onion) und 8841. Aufbau und Format: `../NODE_MESH_SPEC.md` §16, Anleitung: `../NODE_MESH_BETRIEB.md`.
Code in `src/feed/`. Nicht gegen ein echtes Tor getestet; Tor-Client-Autorisierung ist nicht enthalten.

## Linux / Docker

```bash
./start.sh 1 standard          # slot, profile — setup page on http://localhost:8790
./start-tempnode.sh            # Temp Node — setup page on http://localhost:8810
docker compose up -d           # container, setup page on the host's http://localhost:8790
```

## What the node does on its own

| | |
|---|---|
| **Tor onion service** | Mandatory and fully managed: downloads the pinned Tor Expert Bundle once, runs its own Tor, publishes the node via the control port (`ADD_ONION`). The public API only listens on `127.0.0.1` — "the node never learns a sender IP" is structural, not a logging policy. |
| **Many nodes, one process** | Always the full licensed number (normally 250, never more; not a setting): one Tor process publishes that many onion services, all mapped to the same local API and store. Each is a separate address to the outside; the owner's app hands different ones to different contacts. |
| **Stable addresses** | One onion key per node, kept in `data/node-<slot>/node-mesh-identity.json` (file mode 600) and reused on every start; restarts and the daily Reset never change any address. A licence for more nodes later adds new addresses and keeps the existing ones. |
| **Sealed keys (default)** | `NODE_MESH_KEY_STORAGE=sealed`: owner secret and node keys are stored **only encrypted** (AES-256-GCM under the owner secret, which is never written down). After a restart the server is **locked** — only a control onion is online, nodes stay offline. Unlock in the app (Settings → Your own nodes → **Unlock**) or paste the owner code on the setup page; the nodes come back under the same addresses. A seized, powered-off server can't be run on under your addresses. `NODE_MESH_KEY_STORAGE=disk` = old behaviour (plain file, unattended restarts). Old plain files are sealed in place on first start. |
| **Proof-of-work DoS defense** | Tor's onion-service PoW (`PoWDefensesEnabled=1`) is always on — flooding the node with connections costs the attacker CPU per attempt. The pinned bundle's Tor 0.4.9 ships the `pow` module (verified with `tor --list-modules`). |
| **Self-healing** | If Tor crashes or the control connection drops, Tor restarts with backoff and re-adds the same key → same address. Tor also exits on its own if this process dies (`__OwningControllerProcess`), so no orphaned Tor keeps running. |
| **Per-deposit TTL** | A deposit may carry `ttl` (ms) and gets at most the node's own profile TTL, never more. The app sends 1, 6 or 24 h per chat. |
| **Profiles** | `NODE_PROFILE=standard\|high-security\|offline-tolerant` (6 h / 1 h / 24 h). Max 24 h, because every unpruuf client polls a window sized for 24 h — so any profile is always fully covered without the client knowing which one a contact runs. Unknown names refuse to start. |
| **Slots** | `NODE_SLOT=1\|2\|3`: staggered daily Reset at minute 0 / 20 / 40 (UTC-aligned, so nodes on different machines stagger correctly), own default ports and data folder per slot — all three can even run on one machine. |
| **Reset (hygiene only)** | Closes idle HTTP sockets, verifies the onion is still registered (re-adds it with the same key if not), checkpoints SQLite. Never touches messages, rate-limit counters or the address (NODE_MESH_SPEC.md §5). |
| **Cleanup** | TTL sweep every 5 min is the only deletion path; expired rows are already invisible to reads. SQLite `secure_delete` overwrites swept ciphertext instead of leaving it in free pages. |
| **Overview page** | `http://localhost:8790/overview` (slot 1; 8800/8810 for slots 2/3), same loopback-only protection as the setup page, refreshes every 5 s. Shows at a glance: traffic-light banner (all fine / Tor not ready / nodes missing / **locked**), nodes online (registered with Tor vs. configured), packets stored, new messages and fetches of the last 24 h as a bar chart, Tor state, key storage, profile, uptime, refused requests, and every node address with a copy button. Counts only (`src/metrics.ts`, memory only): the node still records nothing about who deposits or fetches. |
| **Setup page** | Separate port (never part of the onion's port mapping), bound to `127.0.0.1`, loopback `Host` header required (blocks DNS-rebinding pages from reading the owner secret). Shows owner QR, Tor state, profile, slot, stored packet count, and a "rotate owner secret" button (custom-header CSRF guard; takes effect immediately, address unchanged). |
| **Release integrity** | `release-manifest.txt` (signed list of SHA-256 hashes of `dist/**/*.js` and `package.json`, Ed25519, own signing domain) is checked at start and hourly. Overview and setup page show "Programm": unchanged / VERÄNDERT / not signed, with the release fingerprint. `NODE_MESH_REQUIRE_SIGNED=1` refuses to start unless it matches. `verify-release.bat` / `.sh` checks a copy from the outside and can compare a published fingerprint. A self-check: it finds files changed on disk, it cannot prove a running machine is clean. |
| **Packets in RAM only** | `NODE_MESH_STORE=ram`: waiting packets live in memory only (SQLite `:memory:`), nothing is written to the disk; a restart drops them. Default `disk` keeps them until their TTL. The overview and the setup page show which one runs. (Keys are a separate matter: sealed on disk.) |
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
- `POST /fetchMany` — `{ "tags": [...], "waitMs"?, "since"? }` → `{ "blobs": { "<tag>": [...] } }`.
  Read-only, optional long-poll (max 55 s). With `since` (a cursor from the previous reply): only
  newer blobs, reply `{ "cursor": N, "blobs": {...} }`.
- `GET /pool` → `{ "control"?, "addresses": [...] }` — every node address this server runs (plus the
  control address on sealed servers). **Owner-only**; the app calls it after the owner QR is
  scanned. Contacts never see this list.
- `GET /lock-status` → `{ "locked": bool }` and `POST /unlock` (Bearer owner secret) — sealed
  servers only, reached over the control onion. Locked servers answer owner routes with `423`.
- `GET /health` → `{ "ok": true }`.

Read endpoints share a global token bucket (burst 30, 5/s) — every request arrives from local Tor,
so there is no client IP to key on.

## Verified

- `npm test` — 84/84 (incl. the licence check and the list feed; HTTP contract incl. owner-only `/pool`, node-count bounds, migration of a
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

> Measured before the node count became fixed at the licensed number (max 250). The tool sets `NODE_MESH_NODES`, which the server now ignores, so re-measuring needs a build with a test key. The numbers up to 250 nodes still hold.

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
