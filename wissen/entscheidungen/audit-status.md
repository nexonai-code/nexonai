---
type: decision
id: audit-status
title: Security status after internal audit R1
status: valid
updated: '2026-10-27'
summary: 'Internal static audit R1/R2 on 25.10.2026: 17 findings (0 critical, 0 high, 6 medium, 7 low, 4 info), 13 fixed and verified, 4 open; gate failed; not an independent audit.'
date: '2026-10-25'
scope: unpruuf
topic: audit
products:
- unpruuf-business
- unpruuf-compliance
- unpruuf-press
material:
- audit-r1-report
---
- Open: SEC-004/F1 packet length readable, control signals outside the ratchet, zero padding; SEC-005/M5 one shared write key per server; SEC-006/M8 release fingerprint too narrow; SEC-015 info.
- Still to do: full verify, Windows run of .bat files, Docker builds, device tests, real Tor run.
- Allowed wording now: 'pilot phase, not independently audited'. After an independent round: 'independently reviewed, version X, summary on request'.
- Never: certified, unbreakable, GDPR-compliant, 100% secure, first, only, safer than, or 'audited' without version and scope.
