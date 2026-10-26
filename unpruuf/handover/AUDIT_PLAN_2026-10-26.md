# Plan: getting unpruuf through the audit with a good result

Written 26 October 2026 for the team, after the internal security audit R1 (25 October: 17 findings, 13 verified fixed, 4 open) and the pre-audit of 20 October. It says what has to happen, in which order, who could take it (as a proposal, the team decides), what "done" means for each step, and where the result could still go wrong. Effort figures are estimates in working days for one person, not promises.

"A good result" means, in plain words: the auditor finds no Critical and no High finding; every Medium is either fixed or accepted by the team with a reason and an expiry date; the coverage statement confirms the claims in `SECURITY_CLAIMS.md` that we put in the briefs; and we can quote the summary. It does not mean "certified" or "unbreakable", and we will never say that.

## Where we stand (26 October)

| Area | State | Source |
|---|---|---|
| Internal gate | FAILED: SEC-004 (F1 with M6, L12), SEC-005 (M5), SEC-006 (M8) open, all Medium, all design decisions | register R2 |
| Code findings | 13 verified fixed at `a9a9fa8`; no live secret; 0 dependency advisories | register R2 |
| Pre-audit items | H1, M1–M4, M7, M9–M11, L1–L11 fixed; F1/M6/L12, M5, M8 open; device tests open | `PRE_AUDIT_REPORT_2026-10-20.md` |
| Evidence scripts | 99 passed, 0 failed, 1 finding (F1) on `4c76d38` | `evidence/REPORT.md` |
| Tests | node server 139, relay 72, Control 63, officer 32, app 247 per edition, all green | CHANGELOG |
| Not yet done | phone tests, real Tor run, Windows run of scripts and exe, Docker builds, iOS parity, Press with a real source | handover |
| Readiness checklist | items I01–I16 on the "Audit readiness" page, mostly open | artifact |

## Phase 0: decide (this week, 1 meeting of the three of us)

Nothing below moves until these three decisions are taken. Each can be "fix now" or "accept with an expiry date"; an accepted risk is honest only if the briefs say it too.

| Decision | Options | Proposal | Consequence for the audit |
|---|---|---|---|
| **F1 + M6 + L12** (length readable in the stored packet, control signals outside the ratchet, zero padding) | A+: pad with random bytes before encrypting, length inside, control signals as ratchet messages, persisted sequence numbers. One wire-format change for every client, server unchanged. B: leave it, state it in the briefs. | **A+**, decided now, built before the audit. The audit checks the final wire format; changing it after the report means a second audit of the core. | Without A+ the auditor will write that the node operator can tell cover traffic from messages and that a captured pairing code allows redirecting a contact. That reads as Medium/High in a report customers will see. |
| **M5** (one write key per server for all company devices) | 1: state the limit honestly plus a per-key rate limit on `/deposit`. 2: per-device write credentials, individually revocable (the guest-grant machinery is the base). | **1 now, 2 after the audit.** Per-device credentials touch every client and the licence story; too much before the audit. | Honest statement plus rate limit turns M5 into an accepted design decision the auditor confirms, not a finding. |
| **M8** (release fingerprint covers a tenth of the executed code) | Extend `release-manifest.txt` to `node_modules` and `tor-bin`, pin or build the native SQLite module, sign the exe the same way, `REQUIRE_SIGNED=1` never passes an exe automatically. | **Do it**, 2–3 days, no client impact. | "The customer runs the reviewed program" is a claim in brief S7 and CLAIMS A11; without M8 the auditor marks it "not confirmed". |

**Done when:** the three decisions are written in `handover/F1_ENTSCHEIDUNG.md` and in the register (fixed or accepted with expiry, approver named). Owner proposal: the team together; Gabriel writes it down.

## Phase 1: build what was decided (2–3 weeks)

| # | Task | Who (proposal) | Days | Done when |
|---|---|---|---|---|
| 1.1 | Wire format v2 (A+): `NetworkObfuscation` pads with random bytes to 4096 before the outer encryption, length inside; control signals (`DELETE_CONTACT`, `REVOKE`, `NODE_MIGRATE`, `TEMP_NODE`, identity and `Wechsel`) sent as ratchet payloads; sequence numbers persisted in Room; receiving side accepts v1 only while no system is live (none is) | Gabriel | 5–7 | unit tests for pad/unpad and every signal; `evidence/08-packet-header.js` reports 0 findings; `RatchetFrame`, `MessagePayload` vectors updated |
| 1.2 | Same change in the officer app and web-reporter (`outerEnvelope.ts`, `handleOuterControl`, `pollAndIngest.ts`) | Gabriel | 2–3 | officer 32+ tests green, a message from the Android app to the officer app round-trips in a local test |
| 1.3 | Known-answer vectors and a one-page format description for iOS (`unpruuf/ios/`), handed to Norbert | Gabriel → Norbert | 1 + Norbert's port | iOS core tests pass the vectors |
| 1.4 | M5: `/deposit` token bucket per write key (server), honest wording in `SECURITY_CLAIMS.md` S1/A2 and in both briefs ("every company device that holds the list can write") | Gabriel | 1 | server test for the bucket; claims and briefs updated |
| 1.5 | M8: manifest over `node_modules` (with the hash of `better_sqlite3.node`) and `tor-bin`; Dockerfile builds the native module from source or pins its hash; exe hash in a signed sidecar; `verify-release` checks all of it | Gabriel | 2–3 | `verify-release` fails when one byte in `node_modules` changes; `integrity.test.ts` covers it |
| 1.6 | Repository hygiene found on the way: add the missing `server/tor/torrc` (or remove the old relay's Docker path from the delivery), decide whether the consumer relay stays in scope at all | Gabriel | 0.5 | `docker compose build` works for both servers on a normal machine |
| 1.7 | Release key: change the password (`passwort-aendern.bat`), confirm that test and release keys live only with Gabriel, outside git | Gabriel | 0.5 | noted in `SIGNING_TEST_KEY.md` with the date |

**Done when:** `security-verify` (full) passes the gate, the evidence run shows 0 findings, and all suites are green on one tag. That tag is the audit candidate.

## Phase 2: test what has only been read (1–2 weeks, overlaps with Phase 1)

The pre-audit report lists what a device test must cover. Nothing of it has run on a phone yet.

| # | Test | Who (proposal) | Days | Done when |
|---|---|---|---|---|
| 2.1 | Two phones (one rooted), Android 12 and 13+: H1 migration from a v3 install, panic PIN (image search for contact remnants), clipboard clear after 60 s, FLAG_SECURE in the app switcher, clock set forward during the lockout | Gabriel | 2 | a short protocol per item: tested, result, screenshot where harmless |
| 2.2 | Node server on a real VPS with Docker and the real Tor network: onion up, PoW on, 250 addresses, app imports the node list, two phones exchange messages, bridge and Snowflake from a network that blocks Tor | Gabriel (+ Norbert for a second network) | 2 | `NODE_MESH_BETRIEB.md` updated with what was seen; latency and battery numbers noted (honest, not marketing) |
| 2.3 | Tor isolation levels 1 and 3 against real Tor: confirm separate circuits per contact (Tor control port `GETINFO circuit-status`) | Gabriel | 0.5 | noted in `TOR_ISOLATION_PROPOSAL`; claim promoted from "built" to "observed" |
| 2.4 | Windows: `install.bat`, `start.bat`, `export-list.bat`, the three validated `.bat` files with a hostile paste (must refuse), the exe build and `verify-release.bat` | Gabriel | 1 | protocol; any failure becomes a fix in Phase 1 |
| 2.5 | relay-android dependency scan (Gradle tree resolved on a machine with network) | Gabriel | 0.5 | OSV result in the register's next run |
| 2.6 | 24-hour capture of a server's traffic with a packet logger: only 4096-byte packets, no plaintext, nothing after expiry | Gabriel | 1 (elapsed 24 h) | capture summary in `evidence/`; this is what the auditor will repeat |

**Done when:** every item has a protocol, and every "GELESEN" in the pre-audit report that matters for a claim has become "GETESTET" or the claim is reworded.

## Phase 3: freeze, prove, package (1 week)

| # | Task | Who (proposal) | Done when |
|---|---|---|---|
| 3.1 | Code freeze on the audit tag; release process (`PROCESS_RELEASE_2026-10-25.md`) run once end to end: signed manifest, fingerprint recorded, APKs with the release key | Gabriel | tag exists, `verify-release` green on a clean machine |
| 3.2 | Full `security-verify` on the tag; sign-off report in `.security-audit/report/`; the team confirms the sign-off in writing (the tool cannot) | Gabriel + the team | gate PASSED on a full run |
| 3.3 | Evidence run on the tag (`evidence/00-run-all.js --tests`), report attached to the briefs | Gabriel | 0 failed, 0 findings |
| 3.4 | `SECURITY_CLAIMS.md`, `evidence/CLAIMS_TO_EVIDENCE.md`, both audit briefs: every claim matches the final format and the test protocols; nothing claimed that was only read | Gabriel | each claim has a status: tested / read / needs an auditor |
| 3.5 | `evidence/AUDITOR_SCOPE.md` aligned with round one: node server and Business app (pro, then group), the build and release chain, Tor and bridge integration, inputs from outside, cryptography review; Control, Officer app, Press, Compliance parts and iOS named as later rounds | Gabriel | the scope file says the same as the briefs and the process document |
| 3.6 | Hand-over package: tag, briefs, claims, evidence report, scope, threat model (one page: who the attacker is and is not), test protocols, the register's sign-off report. Never the release key, `private-key.json` or customer data | Gabriel | ZIP checked against the list in `PROCESS_AUDIT_2026-10-25.md` step 2 |
| 3.7 | Lawyer: patent question before the briefs leave the house (what the auditor may see of the protocol under NDA) | Norbert | written answer |

## Phase 4: choose and contract the auditor (runs in parallel from Phase 1, 3–4 weeks elapsed)

| # | Task | Who (proposal) | Done when |
|---|---|---|---|
| 4.1 | Shortlist of three firms with published reports on messengers or Tor-based systems and a cryptographer on staff (the Double Ratchet variant, the reduced session start and the outer layer need one); ask each for a sample report | Floretta (contacts), Norbert (evaluation) | three quotes with scope, days, price, retest included, earliest start |
| 4.2 | Contract and NDA per `PROCESS_AUDIT_2026-10-25.md` step 4: fixed tag, exclusions named, severity scale, coverage statement per claim, draft for factual correction, interim notice of serious findings, retest in the price, a summary we may quote word for word, confidentiality over the protocol while the patent runs | Norbert, with the lawyer | signed |
| 4.3 | Kick-off (step 5): one contact per side, response time one working day for questions, two for classifying findings | Gabriel as technical contact | kick-off notes |

## Phase 5: during and after the audit (2–4 weeks, then 1–2 weeks for fixes)

| # | Task | Done when |
|---|---|---|
| 5.1 | Every finding classified within two working days; fixes only on a new tag through the release process; the audited tag is never touched | register updated per finding |
| 5.2 | Draft report: we correct facts, never severities | corrections sent in writing |
| 5.3 | Fix round and retest for everything High and above, and for Mediums the team does not accept | retest report |
| 5.4 | Wording: quote only the agreed summary and the coverage statement; "independently reviewed, version X, summary available"; never "certified", "unbreakable", "GDPR-compliant", "safer than" | all customer material checked by Floretta against the list |
| 5.5 | Lessons learned, archive, next round planned (Control, Officer app, Press and Compliance parts, iOS) | note in the handover |

## Calendar (if Phase 0 is decided this week)

| Week | What |
|---|---|
| 1 (27 Oct) | Phase 0 decisions; auditor shortlist started; M8 and M5 built |
| 2–3 | Wire format v2 on Android, officer app, web-reporter; iOS vectors to Norbert; Windows and phone tests begin |
| 4 | VPS and real-Tor run, 24-hour capture, isolation check; quotes in, auditor chosen |
| 5 | Freeze, full verify, evidence, claims and briefs aligned, hand-over package; contract signed |
| 6–9 | Audit |
| 10–11 | Fix round, retest, final report, wording |

Earliest realistic date for a final report: mid-January 2027, if the auditor can start in week 6. If F1 is postponed instead, the audit can start three weeks earlier, but the report will carry F1 as a finding and the core will have to be audited again after the format change. The team should weigh that against the calendar.

## What could still make the result bad, and the counter-move

| Risk | Counter-move |
|---|---|
| F1 left open "for now" and then found by the auditor | decide A+ in Phase 0; it is the one item that changes the report's tone |
| Claims the auditor cannot confirm because they were only read | Phase 2 protocols; reword anything untested before the briefs go out |
| Scope creep: the auditor looks at Control, Officer app or Press and reports on them | exclusions named in the contract (3.5, 4.2); those parts get their own round |
| iOS diverges from the audited format | Norbert's port on the same vectors (1.3) before the audit starts, or iOS named as out of scope |
| A finding in a dependency during the audit | keep `npm audit`, OSV and the Gradle scan running weekly until the tag is frozen; pin by lock file (done for the relay in R1) |
| The auditor cannot reproduce the build | release process run once on a clean machine (3.1); the exe signed (M8) |
| Press shown as a product while untested with a real source | keep Press out of round one and out of the summary; the pilot is honest as a pilot |

## Open points that the plan needs the team for

1. Phase 0: the three decisions.
2. Budget and time window for the auditor (the quotes will tell; a cryptography review by a specialist is the expensive part).
3. Whether the old consumer relay (`unpruuf/server`) stays a product or is retired before the audit; if retired, it leaves the scope and the register.
4. Who holds the release key and the licence key, and where the register and the audit report are archived (not in git, per the rule of 22 October).

---

NexonAI Consulting SRL, Alba Iulia · internal · pilot phase, not independently audited.
