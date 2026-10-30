# Independent security review: Node server

**Audit brief, part 1 of 2** (part 2: Android app)
NexonAI Consulting SRL, Alba Iulia, Romania. Draft of 19 October 2026, revised on 25 October 2026 after our own pre-audit (section 9).
**Confidential.** This brief contains protocol details while a patent check is running. Share it only under a confidentiality agreement.

## 1. What we want to be able to say afterwards

1. The node server can do exactly what its documentation says and nothing more, under every documented setting.
2. The server holds nothing about people: no names, no addresses of senders, no contact lists, no secrets of users. It is a pass-through, not an archive.
3. The server talks to nobody except through Tor. Customers run it on their own machine, and no NexonAI system is involved.
4. One licence creates up to 250 node addresses (onion services) on one server. Each is a way in to the same store. Writing needs the owner secret, which every company device that holds the node list also holds (section 6).
5. The program a customer runs is the program that was reviewed. The report names its fingerprint. (The signed file list covers the program files only, see M8 in section 9.)

We do not expect a certificate. We expect a report with findings and severities, a statement of what was and was not covered, and the release fingerprint of what was reviewed.

## 2. The system in one page

- Program: `node-mesh-server` (TypeScript on Node.js 22, Express, better-sqlite3, QR code library). It starts and controls its own Tor process (Tor Expert Bundle, pinned SHA-256, PGP-verifiable).
- Seven requests exist: `GET /health`, `GET /pool`, `GET /lock-status`, `POST /unlock`, `PUT /deposit`, `GET /fetch`, `POST /fetchMany`.
- Writing (`/deposit`) needs the owner secret. Reading (`/fetch`, `/fetchMany`) needs only a routing tag, which acts as the credential. Reading never deletes. Only the expiry of a packet removes it (1, 6 or 24 hours by profile).
- A packet is stored with five columns: id, tag, packet, created, expires. Packets are 4096 bytes and end-to-end encrypted by the clients.
- By default the node keys and the owner secret are stored sealed: encrypted on disk, the server stays locked after a restart until the owner unlocks it from the app. Settings can lower this (see section 4, S10).
- A separate setup page (port 8790 by default) shows the owner code and the node list. It answers only to this computer or a private network address, only with a local Host header and, since 25 October 2026, only with an access token (32 random bytes, new at every start, written to a 0600 file in the data folder and printed only to an interactive terminal). Docker and the customer tool publish it to the host's loopback only.
- Out of this brief: the customer tool "unpruuf Control" (install and management), the officer app, the feed and bridge helper servers. They are separate briefs.

## 3. Preconditions NexonAI completes before kick-off

- A tagged release with a signed file list (`release-manifest.txt`) and its fingerprint, built with the release key.
- Wire format v2 on all clients (message length moved inside the encrypted part, version byte). The server does not change because it stores blind 4096-byte packets. The auditor sees only uniform random-looking packets. **Status on 25 October 2026: not done.** Today the payload length stands in the clear in the first bytes of each stored packet (our finding F1, decision pending). The audit should start after this is closed, so that it sees the final format.
- The evidence package re-run on the tag (`evidence/run-evidence.bat` or `.sh`), with its report attached. Status on 25 October 2026: 97 automated checks pass, 0 fail, plus one open finding (F1).
- A list of the known limits in section 6, so the audit time goes to what we do not already know.

## 4. Claims to test

IDs refer to `evidence/CLAIMS_TO_EVIDENCE.md`, which holds the full wording and the scripts.

| # | Claim | What we ask the auditor to do | Our evidence now |
|---|---|---|---|
| S1 | Exactly seven requests exist. Everything else answers 404 for every method. Only the owner can deposit. Nothing deletes except expiry. | Read every route, middleware and configuration variable (`app.ts`, `routes/node.ts`, `middleware/`, `config.ts`, `index.ts`). Black-box test with malformed and oversized input, wrong methods, header tricks, timing of the owner-secret check. | A1 to A4, A15; script `01`; since 25 Oct: JSON 404 for every unknown path and method, no ETag, exact paths, HEAD and OPTIONS answer 404 (tests) |
| S2 | The server stores nothing about people. No sender address, user agent, owner secret or contact list reaches a file, a log or the database. | Run traffic, then inspect database, write-ahead log, process memory, logs and temporary files. Review every logging call. | A5, A6, A9; scripts `02`, `03`; since 25 Oct the per-minute sweep log line is gone, remaining log lines are start, licence, integrity, settings and Tor state |
| S3 | A packet is unreadable after its lifetime and removed from the files within about a minute while the server runs (a stopped server keeps expired packets until its next start, which sweeps once straight away). | Verify with disk inspection after expiry, after a crash and after a restart. State the limits of secure deletion on the file system and storage used. | A7, A16; script `02`, store tests |
| S4 | The server contacts nobody except through Tor. The only outbound request is the one-time Tor download. | Capture all traffic of a clean server on a machine you control for 24 hours with a few phones using it. Expect Tor's own traffic only. Check the Tor download pinning. | A8, A12, A20 (code only; no capture yet) |
| S5 | One licence creates up to 250 onion services in one process, each with its own key. Only the owner can list them. | Start a full server. Confirm the count equals the licence, each address answers, keys are separate, the list is owner-only. Assess whether addresses can be linked from outside (before 25 Oct the `/fetchMany` cursor was a server-wide counter and linked them; it now comes from the requested tags only). Measure resource use. | Licence and node tests; cursor tests; E4 is unmeasured |
| S6 | After a restart a sealed server stays locked. The keys on disk are encrypted under a key derived from the owner secret. | Review `nodeIdentity.ts` and the unlock route: key derivation, authentication, brute-force limits, the control address and the look-alike risk (someone imitating the unlock address). | F1 (operation), tests |
| S7 | Licence checks are offline and send nothing. The signed file list detects changed program files (`dist/*.js` and `package.json`; it does not cover `node_modules`, the native SQLite file or the Tor program, M8 open). | Review `license.ts`, `integrity.ts` and `verify-release`. State what a compromised server can fake about itself and what the list does not cover. | F2, A11 |
| S8 | The server cannot be filled or flooded without limit: strict base64, 4096 bytes per packet, 1500 packets per tag, 200 000 in total, read limit per node address, size limit on requests. Since 25 Oct: only addresses the server really serves get their own read bucket (made-up Host values share one), `/fetchMany` reads repeated tags once and answers with at most 256 packets, `/lock-status`, `/pool` and `/unlock` have separate buckets. | Try exhaustion (with written permission, on your own machine). Assess the limit on `/unlock` and the effect of someone who knows one address. | A17 to A19; app tests; tests for Host rotation, repeated tags and the cut answer |
| S9 | The setup page cannot be reached from outside. Since 25 Oct it also needs an access token (new at every start), so a neighbouring container cannot read the owner code by sending a loopback Host header. | Test the default, Docker and customer-tool installs. Judge the dependence on the host port mapping and the token handling (file `admin-token`, link printed to a terminal only, cookie after the first visit). | A20; adminApp tests; Control test with a rotating token |
| S10 | Operator settings never give the server more capabilities. Settings that lower protection are printed at every start, one line each (`loweredProtection.ts`): key storage on disk, Tor off, setup page beyond loopback, owner code in the log, a changed packet ceiling, an own Tor program or folder, a public address that is not a v3 onion, unsigned start allowed. | Walk every environment variable and setting in `config.ts` and `index.ts` and confirm the effect in A10. | A10 |
| S11 | Libraries and download chain are sound. | Review the 3 direct and about 130 total production packages, install scripts, the Tor download pinning. Ask us for a software bill of materials. | A12 to A14; script `09` |

## 5. How we would like the work done

1. Source review of the files named in S1, S6, S7 and S9, plus the Tor handling (`tor/`). The scope is limited to the server and excludes tests and tools.
2. Black-box tests of the running server over Tor and over its loopback port.
3. A clean-machine run with a 24-hour capture (S4).
4. A look at the build and release chain: how the release file list is made and checked.

We can provide the repository tag, build instructions, a licence for a server of 250 nodes, two Android phones with the app to generate traffic, and answers to your questions. You provide the machine you control and the capture.

## 6. Limits we state ourselves

- Whoever seizes or controls a running server sees packet counts, timing, tags, sizes (all 4096 bytes), the times of deposits and reads and, until F1 is closed, the payload length written in each packet. They do not see content, names or user addresses. The customer's hosting provider can read a running server's memory.
- The owner secret is one per server. Every company device that holds the node list, and every device of a departed employee until the secret is rotated, can write to all 250 addresses and fill the shared store (200 000 packets); then deposits are refused for everybody. Per-device write keys are not built (pre-audit M5).
- `/unlock` has to derive the key to test a secret, so its attempts are limited as a whole: a stranger who knows the control address can delay unlocking from the app. The setup page is the owner's way around it.
- Someone who observes both ends of the network at once can correlate timing. This is a property of Tor and is not claimed to be solved.
- A routing tag is the credential for reading. Whoever learns a tag can read that tag's packets (they are encrypted) and can use up the read limit of one address.
- The 250 addresses of one server are entry points to one store with one ceiling. They are not 250 machines.
- The licence is bookkeeping. An expired licence stops deposits only; reading continues.
- Sealed keys protect a stopped server. A running server holds keys in memory.
- The setup page depends on the host's port mapping staying on the loopback (Docker and the customer tool do this).

## 7. Out of scope

Tor and the operating system, the customer's hosting provider, a compromised phone or server host, a global observer, legal assessment (GDPR, Directive 2019/1937), the Android and iOS apps (part 2), the customer tool, the officer app, the feed and bridge helper servers.

## 8. Deliverables

- Report with findings, severities, evidence and recommendations.
- A statement of what was covered and what was not.
- The release fingerprint of what was reviewed.
- A re-test of fixed findings, which we would like to include in the order.
- Permission for NexonAI to quote the summary and the coverage statement in customer material. We will not quote more without your agreement.

Timing, price and contact: to be agreed.

## 9. What our own pre-audit found (25 October 2026)

Before this brief went out we ran an internal adversarial review of the server and the app (code reading and tests on a local instance, no device, no real Tor). The findings below are told here so that your time goes to what we do not already know. The detailed report is available under the confidentiality agreement.

| ID | Finding | Status on 25 October 2026 |
|---|---|---|
| F1, L12 | Payload length readable in the stored packet; padding is zeros behind the message | **Open**, decision pending. Fix: pad first, then encrypt (wire format v2) |
| M1 | Read limit keyed by the Host header the caller sets | Fixed, tested |
| M2 | `/fetchMany` with repeated tags blocked the whole server (8 requests, 7.6 s) | Fixed, tested |
| M3 | `/fetchMany` cursor showed the server-wide deposit counter and linked addresses | Fixed, tested |
| M11 | Setup page reachable by neighbouring containers with a forged Host header | Fixed with an access token, tested; real Docker network not tested |
| L1 | A stranger could lock the owner out of `/pool` | Fixed |
| L2, L3, L7, L8, L9 | Expired packets kept on a stopped server; framework visible in error pages; traffic timeline in logs; database files readable by other users; incomplete list of weakening settings | Fixed |
| Dependencies | `body-parser` advisory (high, denial of service) | Fixed (1.20.9) |
| M5 | One owner secret per server: every company device with the node list can write and fill the shared store | **Open**, design question (per-device write keys), stated in section 6 |
| M8 | Release fingerprint does not cover `node_modules`, the native SQLite file, the Tor program; the single-file build is unsigned | **Open** |
| I3 | Unlock sends the owner secret to the control address (a stolen control key could imitate the server) | Known limit |

Not covered by our own review: real Tor, a 24-hour capture, a full 250-node server, Docker and VPS runs, memory forensics of the server process.
