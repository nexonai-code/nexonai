# TrustLine - working prototype

TrustLine is a closed network of licensed network operators (money service businesses) and their agents.
The **TrustLine Relay** forwards signed payment instructions between them. It never sees customer names:
originator and beneficiary data (Channel B) is encrypted end to end for the sending operator, the receiving operator and the receiving agent.
Every step is written to a hash-chained, signed log that an auditor can verify offline.

This package contains all four parts of the architecture:

| Part | What it is | Where |
|---|---|---|
| 1. Agent app | Android app (Kotlin / Jetpack Compose), Android Studio project + ready-built debug APK. A browser version for PCs is included. | `android-agent/`, `TrustLine-Agent-debug.apk`, `http://<relay>/agent.html` |
| 2. Operator portal | Web portal for network operators: agents, device approval, connections, Channel B decryption, log sealing. Master keys stay in the operator's browser. | `http://<relay>/operator.html` |
| 3. TrustLine Relay + admin console | Node.js server (no dependencies, SQLite). Due diligence with four-eyes approval, mandatory checks, limits, block lists, freeze/revoke. | `server/`, `http://<relay>/admin.html` |
| 4. Audit log + Offline Auditor Tool | Relay log and per-operator logs, cross-referenced by hash. The auditor is a single HTML file that works without internet. | `server/public/auditor.html` |

**This is a demonstration prototype for legal review. It is not a production payment system.** See "Limits" below.

## Quick start on Windows (PC or VPS)

1. Unzip the package anywhere (for example `C:\TrustLine`).
2. Double-click `windows\1-INSTALL.bat` (downloads a private Node.js, no admin rights needed).
3. Double-click `windows\2-START.bat`. Keep the window open. It prints the addresses to use.
4. Open `http://localhost:8080/` in a browser.
5. Double-click `windows\3-LOAD-DEMO-DATA.bat`. It creates two fictional operators, connections, agents and some history, and opens `server\data\DEMO-ACCESS.txt` with all logins.

Other helpers: `4-OPEN-FIREWALL.bat` (run as administrator, lets the phone reach the relay), `5-RESET-DATA.bat` (deletes everything), `6-RUN-TESTS.bat` (self test, 11 end-to-end tests).

On a VPS: install the same way, open the port in the provider's firewall, and put an HTTPS reverse proxy in front for real use (or set `tls.keyFile` / `tls.certFile` in `server\data\config.json`).

## Android phone

Option A: install `TrustLine-Agent-debug.apk` (allow "install unknown apps"). Option B: open the folder `android-agent` in Android Studio (Hedgehog or newer) and press Run.

The phone and the relay must reach each other (same Wi-Fi, or the VPS address). Cleartext HTTP is allowed in this demo build so a LAN relay works; use HTTPS in any real deployment.

## Demo walkthrough (about 10 minutes)

1. **Admin console** (`/admin.html`, admin1 / admin2, passwords in `server\data\ADMIN-CREDENTIALS.txt`): show the two admitted operators. Propose a suspension with admin1, approve with admin2 (four-eyes), then reinstate.
2. **Operator portal** (`/operator.html`, login in `DEMO-ACCESS.txt`): show the agents, the connection to the partner operator, the signed connection record. Open an instruction and decrypt Channel B (names exist only here and at the agents).
3. **Enrol the Android phone**: in the operator portal open an agent, click the activation code, scan the QR code with the app (or type the code). The phone shows two key fingerprints; compare them in the portal and approve the device.
4. **Send an instruction** from the phone (Send tab). The app signs it with the hardware key, encrypts Channel B, and shows the one-time payout code.
5. **Pay out** at the other agent (PC browser at `/agent.html`, code in `DEMO-ACCESS.txt`): the instruction arrives, enter the payout code, payout is recorded. A wrong code five times freezes the instruction.
6. **Mandatory checks**: try an amount above the limit (the demo history already contains a rejected 9,000 USD attempt).
7. **Revocation**: in the operator portal revoke the phone. Its next request is refused and the app locks.
8. **Audit**: in the operator portal seal and export the log, in the admin console export the relay log. Open the Offline Auditor (`/auditor.html`, or the downloaded single file), load both exports: chains, signatures, certificates and double payouts are verified without any server. Edit one character in an export and load it again: the auditor reports the break.

## Features implemented

- Closed network: operator admission by two TrustLine admins (four-eyes), suspension, reinstatement, block lists (countries, corridors, currencies), limits.
- Operator master keys generated in the browser, passphrase-protected backup, certification of agent device keys, signed connection records between operators.
- One active device per agent; revocation freezes open instructions.
- Instruction checks: sender, connection, block list, mandatory fields, uniqueness and expiry, limits.
- Channel A (signed, no names) and Channel B (end-to-end encrypted, three recipients).
- One-time payout code, transmitted only as a hash; wrong-code counter.
- Statuses: INSTRUCTED, CONFIRMED, PAID_OUT, CANCELLED, EXPIRED, DISPUTED, frozen flag.
- Android: hardware-backed signing key where available, encrypted local state, QR enrolment, offline queue, offline window (default 24 h), optional offline payouts with a limit set by the operator, voice prompts, clock-offset handling.
- Hash-chained relay log and operator logs, cross-referenced; operator seals; Offline Auditor Tool.

## Limits (please read before showing this to a lawyer)

- Prototype quality. The Android UI was compiled and its crypto verified against the web implementation by automated tests, but it has not been tested on a physical device in this build. Expect rough edges.
- Demo HTTP without TLS by default. Production needs HTTPS and a hardened server.
- Exchange rates and the purpose-code list are placeholders. The ISO 20022 external purpose list and real FX handling must be confirmed with the lawyer.
- The web agent works online only. Offline queueing exists in the Android app.
- Operators' public keys are supplied by the relay; operators do not yet pin each other's keys out of band.
- No integration with real payment rails, sanctions lists or identity providers. The sanctions screening reference is a text field.
- SMS fallback and Channel B through the operator's own software are described in the concept annex and are not implemented.

## Folder overview

```
windows/          install and start scripts (.bat)
server/           relay, admin console, operator portal, web agent, auditor, tests
android-agent/    Android Studio project (Kotlin, Compose)
docs/PROTOCOL.md  message formats and cryptography, for reviewers and developers
```

Requirements: Windows 10/11 or Windows Server 2019+, x64. Android 8.0 (API 26) or newer.
