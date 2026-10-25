# Audit process: from the decision to order to a report we can show customers

How we prepare, order, run and close an independent security review of the node server and the Business app, so that the result is credible, nobody is surprised and our claims match what the auditor confirmed. No auditor, price or date is known today; nothing here invents them.

**Suggested owner:** Norbert for contract and auditor, Gabriel as technical contact (a proposal; the team decides together) · **Last updated:** 25 October 2026 · **Review cadence:** after every audit and before each new round

## Purpose

- Hand the auditor a frozen, verifiable state and the right documents, so that their time goes to what we do not already know.
- Keep every claim we make to customers inside what the report says (confirmed, not confirmed, not tested).
- Fix findings in an orderly way and have them retested.
- Never say "certified", "unbreakable" or "GDPR compliant" on the basis of an audit report.

## Scope

**Round one (in):** node server and the Business app (`pro`, then `group`), the build and release chain, the Tor and bridge integration, inputs from outside, and a cryptography review by a specialist.

**Later rounds (out for now, to be named in the contract):** unpruuf Control, Officer app, Press, unpruuf Compliance-specific parts, iOS.

**Not covered by any round:** Tor and the operating systems, the customer's hosting provider, a compromised phone, a global observer, legal assessment.

## Who does what (RACI, suggested)

| Step | Responsible | Accountable | Consulted | Informed |
|---|---|---|---|---|
| 0 Gate: are we ready | Gabriel | Team | Norbert | Floretta |
| 1 Decide to order | Team | Team | | |
| 2 Prepare the hand-over | Gabriel | Gabriel | Norbert | |
| 3 Shortlist and quotes | Norbert | Team | Floretta (introductions), Gabriel | |
| 4 Select and sign | Norbert | Team | Gabriel, a lawyer | Floretta |
| 5 Kick-off | Gabriel | Gabriel | Norbert | Team |
| 6 During the audit | Gabriel | Gabriel | Norbert | Team |
| 7 Draft report | Gabriel | Gabriel | Norbert | Team |
| 8 Fix and retest | Gabriel | Gabriel | Norbert (iOS) | Team |
| 9 Final report and use of it | Team | Team | Floretta (wording) | |
| 10 Close | Team | Team | | |

## Process flow

```
 0 Gate ──> 1 Decide ──> 2 Prepare ──> 3 Quotes ──> 4 Contract ──> 5 Kick-off
   ^                                                                    │
   │ not ready: finish                                                  v
   │ the checklist                                            6 During the audit
   │                                                 (triage, interim notices, questions)
   │                                                                    │
 10 Close <── 9 Final report, summary ── 8 Fix and retest ── 7 Draft report
```

## Detailed steps

### Step 0: Gate, are we ready?
- **Who:** Gabriel, checked by the team.
- **When:** before any quote is requested or paid for.
- **How:** go through the page "Audit readiness". The audit starts only when: the wire-format decision (F1, M6) is made and, if yes, built on all clients; M5 is decided or stated as a limit; the release tag, signed file list and record exist (`PROCESS_RELEASE`); the device tests and the Tor test are done and the two-phone run with a capture has been made; the evidence report on the tag shows 0 failed; the briefs match the code. If the team chooses to start earlier, that is a team decision, written down, and the briefs say what is still open.
- **Output:** a dated note "ready" or the list of what is missing.

### Step 1: Decide to order
- **Who:** the team.
- **How:** decide the budget and date window, round one as the scope, whether iOS is inside or outside it, and who the single technical contact is. Remember that a build expires about 180 days after compilation; the tag chosen for the audit must have enough life left, or be rebuilt.
- **Output:** the decision, the budget, the date window.

### Step 2: Prepare the hand-over
- **Who:** Gabriel.
- **How:** one folder, one list, nothing else: the tag; the release record (fingerprints, hashes, test numbers); both briefs, current, with the section on our own findings; `NODE_MESH_SPEC.md`, `SECURITY_CLAIMS.md`, `CLAIMS_TO_EVIDENCE.md`; the evidence report; build instructions (and the reproducible-build note, once it exists); the bill of materials (to build); test licences for a 250-node server and for the apps, pairing codes, node lists; the list of the phones we can lend or the auditor's own; a contact sheet. **Never** in it: the release key, `private-key.json`, any customer data.
- **Output:** the hand-over folder and a one-page index.

### Step 3: Shortlist and quotes
- **Who:** Norbert, with Floretta for introductions.
- **How:** criteria: experience with Tor onion services, Android cryptography and review of ratchet protocols; an anonymised sample report; references; no business relationship with us. Send a one-page summary without protocol details first, the briefs only after the NDA. Ask every candidate for: scope as in the briefs, method, team and who does the cryptography review, time frame, fixed price, retest included, how severities are rated, how disclosure is handled, whether the report may be quoted.
- **Output:** a comparison table of quotes. Do not name an auditor in material before the contract.

### Step 4: Select and sign
- **Who:** Norbert, with a lawyer reading the contract.
- **How:** the contract names: the tag and the scope, the exclusions (Control, Officer app, Press, unpruuf Compliance parts, iOS), the deliverables (report with severities and evidence; a coverage statement per claim; the release fingerprint reviewed; a draft for factual correction; interim notice of serious findings; the retest in the price; a short summary we may show customers; permission to quote that summary and the coverage statement word for word), confidentiality that covers the protocol details while the patent check runs, rules for disclosure, no change of scope without writing, one contact on each side with a response time. Ask the lawyer about the patent before the briefs leave the house.
- **Output:** the signed contract and NDA.

### Step 5: Kick-off
- **Who:** Gabriel.
- **How:** freeze the scope on the tag. Send the hand-over folder under the NDA. A walkthrough call: architecture, the known findings (briefs, section 9), the limits we state ourselves, what is not tested. Agree the channel, the response times and the weekly status. Provide access for the auditor's own tests (the auditor runs the server for the capture; we supply licences and phones where needed).
- **Output:** minutes, the schedule, the contact list.

### Step 6: During the audit
- **Who:** Gabriel.
- **How:** answer questions the same working day and keep a log (question, answer, date). Triage each finding within two working days: confirm or dispute with evidence, rate our own view, decide the fix and write it in the findings register (ID, severity, status, owner, tag of the fix). Serious findings are announced by the auditor straight away; we stop shipping to customers if a high or critical one concerns the shipped code. Fixes are made on a branch from the tag and collected for one fix release. The tag under review is never changed.
- **Output:** findings register, question log, weekly status to the team.

### Step 7: Draft report
- **Who:** Gabriel.
- **How:** check facts only: versions, names, descriptions of how something works, that the claims and their wording are quoted correctly. We do not argue conclusions or severity into place; a disagreement is written down and put to the auditor. Check that the report treats the protocol details as confidential in anything that may be shown outside.
- **Output:** a list of factual corrections, sent back within the agreed days.

### Step 8: Fix and retest
- **Who:** Gabriel; Norbert for iOS.
- **How:** release the fixes with `PROCESS_RELEASE` (new tag, new record, new fingerprint), give the auditor the new tag and the list of fixed IDs, and ask for the retest. Findings we decide not to fix are stated as known limits in the briefs and in `SECURITY_CLAIMS.md`, with the reason.
- **Output:** the retest result and, from the auditor, a retest note.

### Step 9: Final report and how we use it
- **Who:** the team; Floretta for customer wording.
- **How:** read the final report and the coverage statement. Check that its fingerprint equals our record. Update `SECURITY_CLAIMS.md`, `CLAIMS_TO_EVIDENCE.md` and the briefs to say what was confirmed, not confirmed or not tested; remove or soften every claim the report did not confirm, in every material (website, decks, one-pagers). Quote only the agreed summary and coverage statement, word for word, with the date and the version reviewed. Wording we may use: "independently reviewed, version X, report summary available". Wording we do not use: "certified", "unbreakable", "GDPR compliant", "safer than".
- **Output:** a short customer summary, updated claims, a list of material changed.

### Step 10: Close
- **Who:** the team.
- **How:** lessons learned (what the auditor found that our own review did not; what took time); archive the report in a restricted place; plan the next round (Control, Officer app, Press and unpruuf Compliance parts, iOS) and a repeat rule (for example after any change of the wire format, and at least once a year; the team decides); update this document.
- **Output:** notes, the archive entry, the next round in the calendar.

## Exceptions and edge cases

| Scenario | What to do |
|---|---|
| The audit would start before F1 is closed | Only by a written team decision. The briefs say what is open; expect the finding and a second round. |
| A critical or high finding hits shipped code | Stop new deliveries; fix and release (`PROCESS_RELEASE`); tell customers as the disclosure terms say; do not wait for the final report. |
| We disagree on a severity | Put our reasons and evidence to the auditor in writing. We do not ask for a change of the rating without new facts. |
| The auditor cannot test over real Tor in their network | They run a server of their own on a VPS; we supply licences and phones; the capture is made there. |
| Scope creep or a request for more material | Written agreement before anything else changes; Control and the Officer app stay in a later round unless the contract says otherwise. |
| The price or time frame is exceeded | Stop and decide as a team; the contract fixes both, a change needs a signature. |
| The auditor wants to publish findings | Only as agreed in the contract (time, content, protocol details excluded). |
| A claim in material is shown to be wrong | Correct it everywhere at once, then tell the customers who got it. |
| Patent filing is not settled | The briefs do not leave the house; offer the one-page summary only. |
| Fixes would change the audited tag | They never do. Fixes get a new tag; the report names which tag it covers. |

## Metrics

| Metric | Target | How to measure |
|---|---|---|
| Findings at draft vs. open after retest, by severity | no high or critical open after the retest | findings register |
| Time to triage a finding | at most 2 working days | register dates |
| Questions answered the same working day | at least 90 % | question log |
| Claims confirmed, not confirmed, not tested | all stated; the unconfirmed ones corrected in material | coverage statement against our claims table |
| Days from order to final report | as in the contract; deviations noted | dates |
| Cost against the fixed price | 100 % | invoices |
| Material changed after the report | all within 2 weeks | list from step 9 |

## Related documents

- `unpruuf/evidence/AUDITOR_SCOPE.md` (older proposal of 14 October: still lists Control and the Officer app as work packages 5 and 6; to be aligned with round one)
- `unpruuf/evidence/AUDIT_BRIEF_NODE_SERVER.md`, `AUDIT_BRIEF_ANDROID_APP.md`, `CLAIMS_TO_EVIDENCE.md`, `README.md`
- `unpruuf/handover/PROCESS_RELEASE_2026-10-25.md`, `F1_DECISION_SHEET_2026-10-25.md`, `PRE_AUDIT_REPORT_2026-10-20.md`
- The page "Audit readiness" (the shared checklist)
- `CLAUDE.md` (honesty rules; patent: protocol details stay private)
