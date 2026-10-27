---
type: app
id: officer-app
title: unpruuf Compliance officer app
status: tested
updated: '2026-10-27'
summary: 'Case officer side of unpruuf Compliance: Double Ratchet peer over the relay plus local case dashboard with EU 2019/1937 deadlines.'
products:
- unpruuf-compliance
- unpruuf-press
code:
- unpruuf/officer-app
run: start.bat / start-press.bat
---
- Node/TypeScript, encrypted SQLite, Windows-first (install.bat, start.bat).
- Press edition: no deadlines, retention settings, one code per research (start-press.bat).
- Known gap: a single case cannot yet be deleted or exported from the dashboard.
