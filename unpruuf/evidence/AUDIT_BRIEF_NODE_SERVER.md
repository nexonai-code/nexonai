# Independent security review: Node server

**Audit brief, part 1 of 2** (part 2: Android app)
NexonAI Consulting SRL, Alba Iulia, Romania. Draft of 19 October 2026.
**Confidential.** This brief contains protocol details while a patent check is running. Share it only under a confidentiality agreement.

## 1. What we want to be able to say afterwards

1. The node server can do exactly what its documentation says and nothing more, under every documented setting.
2. The server holds nothing about people: no names, no addresses of senders, no contact lists, no secrets of users. It is a pass-through, not an archive.
3. The server talks to nobody except through Tor. Customers run it on their own machine, and no NexonAI system is involved.
4. One licence creates up to 250 node addresses (onion services) on one server. Each is a way in to the same store, and only the owner can write.
5. The program a customer runs is the program that was reviewed. The report names its fingerprint.

We do not expect a certificate. We expect a report with findings and severities, a statement of what was and was not covered, and the release fingerprint of what was reviewed.

## 2. The system in one page

- Program: `node-mesh-server` (TypeScript on Node.js 22, Express, better-sqlite3, QR code library). It starts and controls its own Tor process (Tor Expert Bundle, pinned SHA-256, PGP-verifiable).
- Seven requests exist: `GET /health`, `GET /pool`, `GET /lock-status`, `POST /unlock`, `PUT /deposit`, `GET /fetch`, `POST /fetchMany`.
- Writing (`/deposit`) needs the owner secret. Reading (`/fetch`, `/fetchMany`) needs only a routing tag, which acts as the credential. Reading never deletes. Only the expiry of a packet removes it (1, 6 or 24 hours by profile).
- A packet is stored with five columns: id, tag, packet, created, expires. Packets are 4096 bytes and end-to-end encrypted by the clients.
- By default the node keys and the owner secret are stored sealed: encrypted on disk, the server stays locked after a restart until the owner unlocks it from the app. Settings can lower this (see section 4, S10).
- A separate setup page (port 8790 by default) shows the owner code and the node list. It answers only to this computer or a private network address and only with a local Host header. Docker and the customer tool publish it to the host's loopback only.
- Out of this brief: the customer tool "unpruuf Control" (install and management), the officer app, the feed and bridge helper servers. They are separate briefs.

## 3. Preconditions NexonAI completes before kick-off

- A tagged release with a signed file list (`release-manifest.txt`) and its fingerprint, built with the release key.
- Wire format v2 on all clients (message length moved inside the encrypted part, version byte). The server does not change because it stores blind 4096-byte packets. The auditor sees only uniform random-looking packets.
- The evidence package re-run on the tag (`evidence/run-evidence.bat` or `.sh`), with its report attached. Status at the time of writing: 97 automated checks pass, 0 fail.
- A list of the known limits in section 6, so the audit time goes to what we do not already know.

## 4. Claims to test

IDs refer to `evidence/CLAIMS_TO_EVIDENCE.md`, which holds the full wording and the scripts.

| # | Claim | What we ask the auditor to do | Our evidence now |
|---|---|---|---|
| S1 | Exactly seven requests exist. Everything else answers 404 for every method. Only the owner can deposit. Nothing deletes except expiry. | Read every route, middleware and configuration variable (`app.ts`, `routes/node.ts`, `middleware/`, `config.ts`, `index.ts`). Black-box test with malformed and oversized input, wrong methods, header tricks, timing of the owner-secret check. | A1 to A4, A15; script `01` |
| S2 | The server stores nothing about people. No sender address, user agent, owner secret or contact list reaches a file, a log or the database. | Run traffic, then inspect database, write-ahead log, process memory, logs and temporary files. Review every logging call. | A5, A6, A9; scripts `02`, `03` |
| S3 | A packet is unreadable after its lifetime and removed from the files within about a minute. | Verify with disk inspection after expiry, after a crash and after a restart. State the limits of secure deletion on the file system and storage used. | A7, A16; script `02`, store tests |
| S4 | The server contacts nobody except through Tor. The only outbound request is the one-time Tor download. | Capture all traffic of a clean server on a machine you control for 24 hours with a few phones using it. Expect Tor's own traffic only. Check the Tor download pinning. | A8, A12, A20 (code only; no capture yet) |
| S5 | One licence creates up to 250 onion services in one process, each with its own key. Only the owner can list them. | Start a full server. Confirm the count equals the licence, each address answers, keys are separate, the list is owner-only. Assess whether addresses can be linked from outside. Measure resource use. | Licence and node tests; E4 is unmeasured |
| S6 | After a restart a sealed server stays locked. The keys on disk are encrypted under a key derived from the owner secret. | Review `nodeIdentity.ts` and the unlock route: key derivation, authentication, brute-force limits, the control address and the look-alike risk (someone imitating the unlock address). | F1 (operation), tests |
| S7 | Licence checks are offline and send nothing. The signed file list detects changed program files. | Review `license.ts`, `integrity.ts` and `verify-release`. State what a compromised server can fake about itself. | F2, A11 |
| S8 | The server cannot be filled or flooded without limit: strict base64, 4096 bytes per packet, 1500 packets per tag, 200 000 in total, read limit per node address, size limit on requests. | Try exhaustion (with written permission, on your own machine). Assess the shared limit on `/unlock` and the effect of someone who knows one address. | A17 to A19; app tests |
| S9 | The setup page cannot be reached from outside. | Test the default, Docker and customer-tool installs. Judge the dependence on the host port mapping. | A20 |
| S10 | Operator settings never give the server more capabilities. Two lower protection: key storage on disk and Tor switched off for tests. | Walk every environment variable and setting in `config.ts` and `index.ts` and confirm the effect in A10. | A10 |
| S11 | Libraries and download chain are sound. | Review the 3 direct and about 130 total production packages, install scripts, the Tor download pinning. Ask us for a software bill of materials. | A12 to A14; script `09` |

## 5. How we would like the work done

1. Source review of the files named in S1, S6, S7 and S9, plus the Tor handling (`tor/`). The scope is limited to the server and excludes tests and tools.
2. Black-box tests of the running server over Tor and over its loopback port.
3. A clean-machine run with a 24-hour capture (S4).
4. A look at the build and release chain: how the release file list is made and checked.

We can provide the repository tag, build instructions, a licence for a server of 250 nodes, two Android phones with the app to generate traffic, and answers to your questions. You provide the machine you control and the capture.

## 6. Limits we state ourselves

- Whoever seizes or controls a running server sees packet counts, timing, tags, sizes (all 4096 bytes) and the times of deposits and reads. They do not see content, names or user addresses. The customer's hosting provider can read a running server's memory.
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
