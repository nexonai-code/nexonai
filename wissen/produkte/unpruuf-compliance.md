---
type: product
id: unpruuf-compliance
title: unpruuf Compliance
status: tested
updated: '2026-10-30'
summary: 'Whistleblowing channel without identities: reporter app or browser, case officer app with EU 2019/1937 deadlines (7 days / 3 months).'
code:
- unpruuf/officer-app
---
- Formerly called safeline (dropped 25.10.2026).
- Web reporter in the browser has no Tor and weaker protection, says so on its first screen.
- Officer dashboard deletes a single case permanently (since 30.10.2026): the officer types the case number back, the server checks it again. A deletion log keeps only case number and time of deletion (no content), read-only in the dashboard, so the organisation can show that and when it deleted (retention, Law 361/2022, Directive Art. 18).
- Officer dashboard exports a single case (since 30.10.2026): printable, self-contained HTML file (RO or EN) or JSON, with case number, category, received date, both deadlines with their state, status changes since 30.10.2026 and the whole conversation. No case keys.
- Limits: deleted content can still exist in backups or copies of the data folder made before the deletion; the deletion log and case numbers are not encrypted at rest. No notes field exists in the officer app, so exports contain none.
