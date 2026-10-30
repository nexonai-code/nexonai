# Comparison with the competition: the position after the independent audit

Scenario document, 26 October 2026. It redoes the comparison of the same day under one assumption: **the independent audit is finished and passed, and everything we say is backed by proof we can hand over.** That is not the situation today. Today we have an internal audit (R1/R2) and an evidence package, no independent report, and three open design decisions. This page shows what we may say, and against whom, once the premise is true, and which proof each statement needs, so that nobody says it a day earlier than the proof exists. For the real state today see `COMPETITIVE_COMPARISON_2026-10-26.md`. Competitor facts carry the same tags as there: **[checked]** by a web search on 26 October (low to medium source quality), **[general]** general knowledge not rechecked, **[unknown]**.

## 1. The premise, exactly

The scenario holds only if all of this is true, and the page must not be used before:

1. **Independent audit, round one, finished** on a frozen tag: node server and Business app (pro, then group), build and release chain, Tor and bridge integration, inputs from outside, cryptography review by a specialist. The report names the release fingerprint it reviewed.
2. **Result:** no Critical and no High finding open; every Medium fixed and retested, or accepted with a written reason and an expiry date; the auditor's coverage statement confirms our claims one by one (confirmed, not confirmed, not tested).
3. **We may quote:** the agreed short summary and the coverage statement, word for word. No certificate exists and none is claimed.
4. **The three open points are closed:** F1 (the length inside the encrypted part, random padding, control signals in the ratchet), M5 (the shared write key stated honestly and rate-limited), M8 (the release manifest covers `node_modules`, the native module and `tor-bin`; the exe is signed).
5. **Tested, not only read:** two phones (one rooted), a server on a VPS with the real Tor network, a 24-hour capture, the Windows scripts and exe; protocols exist.
6. **Scope limit that stays:** Control, the Officer app, Press, the Compliance parts and iOS were **not** in round one. Everything below about those is written as "not covered yet".

## 2. What we may say then, and the proof behind each sentence

The rule: a sentence goes into customer material only with its proof in hand. The numbers refer to `evidence/CLAIMS_TO_EVIDENCE.md`.

| What we say | Proof we hand over | Covers | Does not cover |
|---|---|---|---|
| "The server learns no names, no addresses of senders and no keys of the owner." (A5, A6) | audit coverage statement; evidence 02 (storage forensics: one table, five columns, no address or user agent found); code scan 03 (no code reads the caller's address) | node server at the audited fingerprint | a server someone modified (see next row) |
| "The server you run is the one we released." (A11, A12) | fingerprint in the audit report; signed release manifest over program files, libraries, native module and Tor; `verify-release`; the exe signature | releases from the audited tag | other tags until re-reviewed |
| "A packet is gone for everyone after at most 24 hours and is overwritten within about a minute." (A4, A7, A16) | audit dynamic test; evidence 02 before/after expiry; 24-hour capture | node server, every documented setting | a copy someone made while it was still readable |
| "The server makes no outbound connection except the one-time Tor download; no telemetry." (A8) | evidence 03; audit network capture | node server | the customer's own machine and hosting |
| "Only the owner writes; the shared write key is a known limit." (A2, M5 wording) | audit statement; app and server tests; the limit written in our own briefs | node server | per-person revocation (a later stage) |
| "The packet length is not readable from a stored packet." (F1 closed) | audit cryptography review; known-answer vectors; evidence 08 with 0 findings | wire format version 2 | traffic analysis beyond the packet |
| "Messages are end-to-end encrypted with a Double Ratchet and a second outer layer." | audit cryptography review; vectors; unit tests (Android 247, officer 32, node 139) | Android Business app, node server | iOS until it passes the same vectors |
| "All traffic goes through Tor; one documented exception on the same Wi-Fi." | evidence 04; audit dynamic test; observed circuits per contact | Business app | the user's network, Tor itself |
| "A lost phone gives up little: PIN with lock-out, panic wipe, sealed database key, no screenshots, no backup." | device-test protocols (H1, M9, M10, clipboard, lock-out); audit device tests | Android Business app on tested models | a rooted or forensically examined phone beyond what was tested |
| "No analytics, no Google services, no ad libraries." | evidence 04 and 09; dependency list; clean OSV and npm audit at the tag | all code at the tag | later changes |
| "Our dependencies had no known vulnerability at release." (A13) | evidence 09 and the OSV scan on the release day | the tag | after release day |

What we do **not** say even then: "unbreakable", "certified", "GDPR-compliant", "100 % secure", "first", "only", "safer than X", and nothing about Compliance, Press, Control, the Officer app or iOS that the report does not cover.

## 3. Messengers: where we stand then

Columns for the competitors are unchanged from the daily comparison; only our column and the audit row change.

| | **unpruuf Business, after the audit** | **SimpleX** | **Session** | **Briar** | **Threema OnPrem** | **Wire** | **Matrix / Element** |
|---|---|---|---|---|---|---|---|
| Independent audit | **yes: round one on version X, summary and coverage statement available** | Trail of Bits 2022 and 2024 [checked] | Quarkslab 2021; a 2026 academic paper reports seven vulnerabilities, fix status unknown [checked] | Cure53 2017, later audits reported, sources disagree [checked] | reviews published, not rechecked [general] | 2018 audits documented, nothing newer found [checked] | not rechecked [general] |
| Server | the customer's own, always | anyone's [checked] | node network run by others [checked] | none [checked] | the customer's [general] | Wire's, or on-premise [checked] | any operator [general] |
| Identifier | none | none by their claim [checked] | random ID [checked] | none [checked] | random ID [general] | e-mail or phone [general] | account [general] |
| Network anonymity | Tor onion services | optional Tor [general] | own onion routing [checked] | Tor, Bluetooth, Wi-Fi [checked] | none [general] | none [general] | none [general] |
| Company administration | Control, licences, lists, feed, unlocking | none [general] | none [general] | none [general] | yes [general] | yes [general] | via server software [general] |
| Calls, desktop, multi-device | **no** | yes [general] | yes [general] | partly [general] | yes [general] | yes [general] | yes [general] |

What the audit changes: it moves us from **"the first objection"** to **"parity on the entry requirement."** SimpleX, Briar, Wire and Session can show reports too; a report does not make us better than they are, it makes us comparable. The thing that stays ours is the combination: server always at the customer, no identities, Tor from the start, a finished administration and three products on one system. Say that, show the report, and stop there.

What the audit does **not** change: no calls, no desktop client, no multi-device, groups of ten, English-only Business app, one developer, and Tor's speed unless the device tests have produced honest numbers we can show.

## 4. Reporting channels: the position then

| | **unpruuf Compliance / Press** | **SecureDrop** | **GlobaLeaks** | **EQS Integrity Line** |
|---|---|---|---|---|
| Audit status | **the protocol and the node server are covered by the round-one report; the Compliance app, the Officer app and Press are not** | audits published, not rechecked [general] | audits reported, not rechecked [general] | certifications claimed, not rechecked [general] |
| References | pilot only | many [general] | many [general] | many [general] |
| Data location | the organisation's own server | the newsroom's [general] | own or hosted [general] | vendor, EU [general] |

The honest line for reporting channels, even after the audit: "the transport, the server and the shared protocol have been independently reviewed; the Compliance and Press applications are the subject of the next round." If Gabriel decides to put the Compliance app and the Officer app into round one (the scope is his to set), this section changes to "covered", and the offer to the first municipality or company becomes much stronger. That is the single scope decision that changes this comparison the most.

## 5. The conversation

With the audit in hand, the opening move changes from defending to inviting a check. One question, then the report.

| If they name | Their strength | What we ask or show | What we avoid |
|---|---|---|---|
| **SimpleX** | free, audited twice, no identifiers | "Who administers licences, updates and lists for 300 people? Here is our report and our fingerprint." | calling it weaker |
| **Session** | easy to start | "Who operates the nodes your messages pass through?" and nothing about their 2026 paper until the fix status is known | repeating the paper as fact |
| **Briar / Cwtch** | no server at all, offline | "Do you need an admin console and a reporting channel on the same system?" | claiming to hide more |
| **Threema OnPrem / Wire** | mature, support, calls, desktop | "Do you need an account or a vendor tie at all? What does the server learn about who talks to whom?" Show the coverage statement | price talk before our price list exists |
| **Matrix / Element** | federation, many features | "Do you want people to find each other, or only people you invited in person?" | calling federation a weakness |
| **SecureDrop / GlobaLeaks** | proven, free | "Do you also need an internal channel, and who runs the server and the updates?" | claiming to replace them |
| **EQS and similar** | full suite, contract, certificate | "Where do the reports live, and can the vendor read them? Here is who can read ours and the proof." | promising legal compliance (the lawyer's call) |

The proof pack for every serious conversation: the agreed audit summary and coverage statement; the release fingerprint and the way to check it (`verify-release`); the claims table with its proof column (section 2); the evidence report; the test protocols; the written limits (M5, the audit scope). Anything not in that pack is not said.

## 6. Wording ladder

| Level | Sentence | Needs |
|---|---|---|
| Allowed now, before any audit | "finished products for compliance, press and companies on one system; server always at the customer; no identities; Tor from the start; pilot phase, not independently audited" | nothing new |
| Allowed after round one | "independently reviewed, version X, summary available on request" | the signed contract that lets us quote, the final report, the tag |
| Allowed after a second round | the same for Control, the Officer app, Compliance and Press, each named | that round's report |
| Never | certified, unbreakable, GDPR-compliant, 100 % secure, first, only, safer than, "audited" without version and scope | no proof can make these true |

## 7. What must still be true before this page is used

1. The decisions on F1, M5 and M8 are taken and built (`AUDIT_PLAN_2026-10-26.md`, phases 0 and 1). The product decisions are Gabriel's; the recommendation is A+ for F1.
2. The device and real-Tor tests exist as protocols, with honest numbers for battery and delivery time.
3. The contract allows us to quote the summary and the coverage statement.
4. The final report is in hand, the fixes are retested, and the tag in the report is the tag we ship.
5. The competitor cells marked [general] or [unknown] have been checked on the vendors' own pages (Threema OnPrem price and audit, Wire on-premise price, Cwtch status, Session's fix status, EQS price and certification).
6. This page is then rewritten with the real report's wording, not this scenario's.

---

Scenario drafted before the audit exists. Competitor facts as tagged; sources as in the comparison of the same day.
