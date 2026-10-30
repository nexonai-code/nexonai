# What we actually offer, and how we compare

Internal comparison for the team, 26 October 2026. It does two things: it states what unpruuf really does today, with the honest status of each point, and it sets that next to the competitors we named on 12 October (SimpleX, Session, Briar, Cwtch, Threema OnPrem, Wire, Matrix/Element for messengers; SecureDrop, GlobaLeaks, EQS Integrity Line for reporting channels). It is a capability comparison, not a win/loss analysis: there is no CRM, no deal and no customer conversation behind it yet, so nothing here says how we fare in a real sale.

How to read the evidence tags: **[repo]** read in our code, tests or evidence scripts; **[checked]** found by a web search on 26 October 2026 (the sources were often aggregators and blogs, listed at the end, so treat them as leads, not proof); **[general]** general knowledge about the product, not rechecked today; **[unknown]** we could not establish it. Nothing marked [general] or [unknown] belongs in customer material before someone has checked it on the vendor's own pages.

## 1. What we actually offer today

One system, three products, one free guest app. Server always at the customer, no identities, Tor from the start.

| Product | What it is | State, honestly |
|---|---|---|
| **unpruuf Business** (main product) | Internal messenger for companies. Phone app (Android; editions Standard, Pro, Group) plus the customer's own node server (250 onion addresses per licence), Control on the admin PC, node lists and a company feed to distribute them. | Built and unit-tested. Not auditable by anyone but us yet, not tested on phones or against real Tor in the last rounds. |
| **unpruuf Compliance** | Reporting channel: reporter app (also a browser fallback), officer dashboard with cases, statuses and coloured deadlines, one company QR code, RO/EN interface. | Built and unit-tested. Not on a device, not audited. |
| **unpruuf Press** | The same for newsrooms, one contact code per research. | Pilot. Never tested with a real source. |
| **unpruuf Client** (free) | Guest app: invited by a Pro user with a scan, can only talk to the inviter's server with a time-limited grant. | Built and unit-tested on Android; the phone test is outstanding; the grant cannot yet be revoked early. |

What is behind these products **[repo]**:

- **No identities.** No phone number, e-mail, user name or account. A contact exists only on the phone, added by scanning a code in person. The server holds encrypted packets, no names, no addresses of senders.
- **Server at the customer.** NexonAI runs no servers. One licence is one server with 250 onion addresses; any number of servers can run in parallel. The node API is reachable only through the server's own Tor onion service.
- **Short lifetime.** A packet waits at most 24 hours (default 6) and is gone for everyone afterwards; the files are overwritten within about a minute. Messages are not stored on the phone's disk; only the contacts database is (SQLCipher).
- **Encryption.** Double Ratchet (X25519, HKDF, XChaCha20-Poly1305) inside an outer AES-256-GCM layer; fixed 4096-byte packets on the wire; safety-number check per contact.
- **Phone hardening.** PIN with lock-out, panic PIN that wipes contacts, keys and node lists, screenshot blocking, no analytics or Google services (checked by evidence script 04), root gate, builds that expire after about 180 days, key for the contacts database sealed under the phone's key.
- **Tor details.** Own SOCKS5 client with a separate circuit per contact (levels 1 and 3, built, not yet seen against real Tor), company bridges (obfs4, Snowflake wired, not verified on a device), proof-of-work defence on the onion service.
- **Operation.** Control installs, updates and unlocks servers over SSH, hands out licences and node lists; `export-list` on the server; licence model per server and per device, offline signed codes.
- **Checks we ran ourselves.** Node server 139 tests, relay 72, Control 63, officer app 32, Android 247 unit tests (Standard edition, the other editions pass the same suite); evidence scripts 99 passed, 0 failed, one finding (F1). Our own security audit R1 (25 October): 17 findings, none Critical or High, 13 fixed and verified, 3 Medium design decisions open (F1, M5, M8). **This is not an independent audit.**

What we do **not** offer today **[repo]**: calls or voice messages; a desktop messenger; sync across several devices; federation with other networks; push notifications through Google or Apple (by design); a Romanian interface in the Business app (English only); measured numbers for battery and delivery latency over Tor; an iOS app at the same level as Android (an iOS build exists and worked between two iPhones through a relay, but iOS to Android is unproven); any independent audit, certificate or legal opinion.

## 2. Messengers: unpruuf Business against the field

| | **unpruuf Business** | **SimpleX** | **Session** | **Briar** | **Cwtch** | **Threema OnPrem** | **Wire** | **Matrix / Element** |
|---|---|---|---|---|---|---|---|---|
| Identifier needed | none [repo] | none, by their own claim [checked] | random ID, no phone or e-mail [checked] | none [checked] | none [general] | random Threema ID, no phone number required [general] | e-mail or phone [general] | account on a server [general] |
| Who runs the server | the customer, always [repo] | anyone; self-hosting possible [checked] | a decentralised node network run by others [checked] | no server, devices connect directly [checked] | no central server [general] | the customer (OnPrem) [general] | Wire, or on-premise for large customers [checked] | any operator; self-hosting common [general] |
| Network anonymity | Tor onion services, no exit [repo] | optional Tor access [general] | own onion routing, not Tor [checked] | Tor, Bluetooth, Wi-Fi [checked] | Tor [general] | none by design [general] | none by design [general] | none by design [general] |
| End-to-end encryption | Double Ratchet [repo] | double ratchet [general] | Signal protocol lineage [general] | own protocol [general] | own protocol [general] | own protocol; independent reviews exist [general] | Proteus/MLS [general] | Olm/Megolm [general] |
| Independent audit | **none** [repo] | Trail of Bits 2022 and 2024 [checked] | Quarkslab 2021; a 2026 academic paper reports seven vulnerabilities, fix status not established [checked] | Cure53 2017; later audits reported, sources disagree [checked] | not established [unknown] | reviews published, not rechecked [general] | 2018 audits documented; nothing newer found [checked] | not rechecked [general] |
| Group chat | Pro Groups, up to 10 including you [repo] | yes [general] | yes [general] | yes [general] | yes [general] | yes [general] | yes [general] | yes [general] |
| Calls | **no** [repo] | yes [general] | yes [general] | no [general] | no [general] | yes [general] | yes [general] | yes [general] |
| Desktop client | **no** [repo] | yes [general] | yes [general] | yes, beta [general] | yes [general] | yes [general] | yes [general] | yes [general] |
| Admin console, licences, roll-out | Control, licence codes, feed [repo] | none [general] | none [general] | none [general] | none [general] | yes [general] | yes [general] | via the server software [general] |
| Price model | licence per server and per device | free, donations [general] | free [general] | free [general] | free [general] | not found; ask the vendor [checked] | aggregators list about €6 to €9 per user and month, on-premise on request [checked] | free software; hosting and support paid [general] |

### Where we have a case

- **Server and data stay with the customer, and the server learns nothing about people.** That combination is the one we can state in one sentence: no identities, server at the customer, Tor from the start. SimpleX is closest in spirit and is free; Briar and Cwtch go further on "no server at all". We must not claim that any single part is ours alone.
- **A finished admin story for companies.** Licences, roll-out of 250 addresses, node lists and feed, unlocking after a restart, bridges, one place to see all servers. The free privacy messengers have none of this; Threema OnPrem and Wire have an admin story but need an identity or a vendor relation.
- **Three products on one system.** One server and one licence logic serve internal chat, a reporting channel and a newsroom channel.

### Where we are weaker, and where a prospect will say so

- **No independent audit.** SimpleX, Wire, Briar and Session can show reports (with their own findings). We can show an internal audit and an evidence package. Until the independent audit is done, this is the first objection.
- **Fewer features.** No calls, no desktop client, no multi-device, groups capped at ten, English-only Business app. Anyone who needs those will choose another product, and we should say so.
- **Tor is slow and unmeasured.** We have no battery or latency figures; the competitors using clearnet or their own routing feel faster. Do not promise instant delivery.
- **One person builds it.** Prospects in compliance or government will ask about continuity. The answer is the audit, source escrow and a documented hand-over, none of which exist as an offer yet.
- **Open design decisions.** F1 (a node operator can read the length of a stored packet and tell cover traffic from messages), M5 (one write key per server for all company devices) and M8 (release fingerprint covers only part of the executed code) are known and written down. They are also what an auditor will find first.

## 3. Reporting channels: Compliance and Press against the field

| | **unpruuf Compliance / Press** | **SecureDrop** | **GlobaLeaks** | **EQS Integrity Line** |
|---|---|---|---|---|
| For whom | companies and authorities (Compliance), newsrooms (Press) [repo] | news organisations [checked] | anyone setting up a whistleblowing channel [checked] | companies, mostly regulated sectors [checked] |
| Reporter needs | the app, or a browser page, and the organisation's code [repo] | Tor Browser and a codename [general] | a browser, with Tor optional [general] | a web form; anonymity is a setting [general] |
| Where the data lives | on the organisation's own server and officer laptop [repo] | on servers the newsroom controls [general] | on the organisation's server, or hosted [general] | at the vendor, in the EU [general] |
| Two-way conversation with an anonymous reporter | yes, in the app [repo] | yes, via the journalist interface [general] | yes [general] | yes [general] |
| Case handling | statuses, coloured deadlines, export and delete of a single case [repo] | document handling for journalists [general] | rich case workflow, free software [checked] | full workflow and reporting for compliance teams [general] |
| Languages | RO and EN [repo] | many [general] | many [general] | many [general] |
| Independent audit | **none** [repo] | audits published, not rechecked [general] | audits reported, not rechecked [general] | vendor certifications claimed, not rechecked [general] |
| Price | licence [repo] | free software, hardware and staff cost [general] | free software; hosting and support paid [checked] | about €3,000 a year as a starting figure on one aggregator [checked] |
| Pilot references | **none** | many [general] | many [general] | many [general] |

- **Where we have a case:** the reporter can use an app with PIN, panic wipe and no account instead of a web form (a browser page exists as a fallback); the whole system stays at the organisation; the same system also serves internal chat. The fit is an organisation that has to provide a reporting channel under Directive 2019/1937 and does not want to hand the reports to a vendor (a municipality or a small company, for example); whether that satisfies the law in a given case is for its lawyer.
- **Where we are weaker:** no references, no audit, no certification, a smaller feature set than the established tools, and the organisation has to run a server. A compliance department that wants "a hosted tool with a contract and a certificate" will choose EQS or a similar vendor, and we should not fight that.
- **Law reminder:** Romania's Law 361/2022 applies from 50 employees; whether anonymous reports are mandatory is not settled (amendment pending). Never present anonymous reporting as a legal requirement without checking the current text.

## 4. In the conversation with a prospect

The trap-question idea is to ask what shows the difference, not to claim a win. Suggested, for the team to refine:

| If they name | Their strength (say it first) | The question | What to avoid |
|---|---|---|---|
| **SimpleX** | free, audited twice, no identifiers, active community | "Who runs your servers, and who administers licences, updates and lists for 300 people?" | calling it less secure; it is not our claim to make |
| **Session** | easy to start, no phone number | "Who operates the nodes your messages pass through, and can you name them?" (and note the 2026 academic findings only as questions, until the fix status is known) | repeating the paper as fact |
| **Briar / Cwtch** | no server at all, works offline (Briar), strong privacy design | "Do you need a company admin, licences and a reporting channel on the same system?" | claiming we hide more; they hide differently |
| **Threema OnPrem / Wire** | mature, support, audits, calls, desktop | "Do you need an account or vendor tie at all? What does the server learn about who talks to whom?" | pricing talk before we have our own price list |
| **Matrix / Element** | federation, open ecosystem, many features | "Do you want people to discover each other, or only people you invited in person?" | calling federation a weakness; for some it is the point |
| **SecureDrop / GlobaLeaks** | proven in newsrooms and public bodies, free | "Do you also need an internal channel, and who will run the server and the updates?" | claiming to replace them |
| **EQS and similar vendors** | full compliance suite, contract, support | "Where do the reports live, and can you show that the vendor cannot read them?" | promising legal compliance; that is the lawyer's call |

Allowed in customer material: "finished products for compliance, press and companies on one system, server always at the customer, no identities, Tor from the start." Not allowed: "first", "only", "unique", "safer than", "certified", "unbreakable", "GDPR-compliant". Wording on the audit follows `PROCESS_AUDIT_2026-10-25.md` step 9. Before naming competitors in public material, ask a lawyer (trademark and comparative-advertising rules).

## 5. What would turn this into evidence

1. **Independent audit and the three open decisions** (F1, M5, M8): `AUDIT_PLAN_2026-10-26.md`. It changes the first column of every table above.
2. **Device and real-Tor tests** with numbers for battery and delivery time, so the "slow" objection has an answer.
3. **Check the [general] and [unknown] cells** on the vendors' own pages (audit dates, price, desktop, calls). A short list of the cells that matter most: Threema OnPrem price and audit, Wire on-premise price, Cwtch status, Session's fix status for the 2026 findings, EQS price and certification.
4. **Real data:** once there are deals, record the competitor and the reason for a win or loss in the CRM; this document then becomes a win/loss analysis with sample sizes. Interview the first pilot customers about what they compared us with.
5. **A Romanian version** for Romanian prospects, and the Business app interface in Romanian, if the team wants this market.

## Sources (web check of 26 October 2026)

- SimpleX: [Wikipedia](https://en.wikipedia.org/wiki/SimpleX_Chat), [Trail of Bits library](https://new.trailofbits.com/library/simplex-chat/), [SimpleX blog on the 2024 review](https://forgejo.multed.com/android-apps-mirrors/SimpleX-Chat/src/branch/master/blog/20241014-simplex-network-v6-1-security-review-better-calls-user-experience.md).
- Session: [Wikipedia](https://en.wikipedia.org/wiki/Session_(software)), [ePrint 2026/773, practical attacks on Session and the Oxen blockchain](https://eprint.iacr.org/2026/773).
- Briar: [OTF page](https://www.opentech.fund/?p=9029), [HotHardware](https://hothardware.com/news/briar-darknet-messenger-client-for-android-secures-chats-with-direct-peer-to-peer-connectivity), a guide with the later audits ([privacygear](https://privacygear.pages.dev/en/guides/briar-guide/); another source disputes them).
- Wire: [CyberScoop on the 2018 audit](https://cyberscoop.com/wire-messaging-app-security-audit/), price listings on [Capterra](https://www.capterra.com/p/170279/Wire/) and [toolradar](https://toolradar.com/tools/wire/pricing).
- Threema OnPrem: [Capterra listing](https://www.capterra.co.uk/software/1039025/threema-onprem) (no price found).
- Reporting tools: [comparison blog](https://ethicsportal.pages.dev/blog/best-whistleblower-software/), [SourceForge comparison](https://www.sourceforge.net/software/compare/GlobaLeaks-vs-SecureDrop), [G2 on EQS](https://www.g2.com/compare/eqs-integrity-line-vs-whistleblower-software).
- Our own side: `STATUS.md`, `SECURITY_CLAIMS.md`, `EDITIONS.md`, `handover/UEBERGABE_2026-10-25.md`, `evidence/REPORT.md`, the security audit register R1/R2.
