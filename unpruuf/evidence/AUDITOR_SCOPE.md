# Proposed scope for an independent security review

Status 14 October 2026. A proposal for the team to send to an auditor. **Internal.** It contains protocol details
(patent check running); share it only under a confidentiality agreement.

## What we want to be able to say afterwards

1. The node server can do exactly what its documentation says and nothing more, under every documented setting.
2. The system holds no identities: not on the server, not in the pairing code, not in a packet.
3. The encryption and the key handling are sound, as designed.
4. The software a customer runs is the software that was reviewed (the report names its fingerprint).

We do not expect a certificate. We expect a report with findings, a statement of what was and was not covered, and
the release fingerprint of what was reviewed.

## Hand-over

| Item | Where |
|---|---|
| Source, tag and release fingerprint to review | `git` tag chosen together; fingerprint from `node-mesh-server/release-manifest.txt` (sign it first with `license-tool/sign-release.js`) |
| Claims and the existing evidence | `evidence/CLAIMS_TO_EVIDENCE.md`, `evidence/REPORT.md` (re-run `00-run-all.js` on the tag) |
| Protocol description | `NODE_MESH_SPEC.md`, `SECURITY_CLAIMS.md` |
| Builds | node server (`npm run build`), Android APK from the tag, reproducible build notes if available |
| Test devices | two Android phones with the Business app, one node server on a VPS the auditor controls, one Tor client |

## Work packages

**1. Node server, source review and black box.** Walk every route, middleware and configuration variable
(`config.ts`, `index.ts`, `app.ts`, `routes/node.ts`, `store/nodeStore.ts`, `middleware/`, `tor/`, `admin/`). Confirm the
seven requests are all there is (evidence 01), that nothing about callers is read or stored (02, 03), the effect of each
setting (A10 in the claims table), request-size and rate limits, the sealed-key scheme and the unlock route, the setup
page (loopback only, host-header check). Run the server on a clean machine and capture its network traffic for a day:
the only outbound traffic should be the Tor program's own.

**2. Protocol and cryptography.** Review the Double Ratchet (our own code on library primitives), the session start
without signed identities, the outer AES-GCM layer (random 96-bit IV per packet, per-contact key), the routing-tag
construction (evidence 05) and its use as the only credential for reading, the key handling on the phone. Decide whether
the reduced X3DH is acceptable for the stated threat model. **Finding F1** (length visible in a stored packet) is
already known; please assess its effect and our proposed fix (length inside the encrypted part).

**3. Android app, static and dynamic.** Manifest and permissions (evidence 04), dependency review of the libraries
named there, a traffic capture of a running phone for several hours with Business contacts (expected: Tor only; the
same-Wi-Fi shortcut must not appear), memory and storage inspection after use (messages must not be on disk), behaviour of
the panic PIN, screenshot and app-switcher protection, notification content, behaviour on a rooted device.

**4. Supply chain and release.** Tor download (pinned and signed, evidence 07), npm dependencies and their
installation scripts, the release manifest and its signature (`integrity.ts`), how the signing key is kept, how
a customer verifies a release (`verify-release`).

**5. unpruuf Control (new).** The vault (scrypt, AES-GCM), SSH handling (key per server, pinned host keys), the local
web page (loopback, token, CSRF header, idle lock), the Docker install it performs on a server. Control holds keys to every
server of a customer, so it is the most valuable target in the system.

**6. Officer app (unpruuf Compliance).** Local case database encryption, password handling, what remains after closing it, the
known gap (no delete or export of a single case).

## Out of scope

Tor itself and the operating systems; the customer's hosting provider; a compromised phone; a global passive observer
(stated as a limit); legal assessment (GDPR, Directive 2019/1937) — a lawyer or data protection officer does that.

## Questions we would like answered in the report

- Is every claim in `CLAIMS_TO_EVIDENCE.md` supported, partly supported or not supported? Please mark each.
- Which settings, if any, weaken the system, and should they exist?
- Is the way node addresses are shared between contacts (three random nodes from a list, shared across contacts) acceptable?
- Does the cover traffic help against a node operator, given F1? After F1 is fixed?
- What would you test first on a real deployment?

## What NexonAI gives the auditor

Full source, a build, the claims table, the scripts, and answers to questions. What NexonAI does not do: edit the code
during the review without telling the auditor, or describe the result as a certificate.

## Before sending

- Close or decide F1 (wire-format change) so that the review covers the version customers will run.
- Sign a release and record its fingerprint.
- Run `evidence/00-run-all.js --online --tests` on that tag and attach `REPORT.md`.
- A real-device and real-Tor test of Business and Pro Groups (not done yet) so that the auditor does not spend time on bugs.
