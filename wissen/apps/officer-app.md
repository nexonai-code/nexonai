---
type: app
id: officer-app
title: unpruuf Compliance officer app
status: tested
updated: '2026-10-30'
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
- Compliance edition (since 30.10.2026): delete one case with typed case number (`DELETE /api/cases/:id`, body `confirmCaseNumber`), deletion log table `deletion_log` (case number + time only, `GET /api/deletion-log`, view "Jurnal de ștergeri"), export one case as printable HTML or JSON (`GET /api/cases/:id/export`, `?format=json`, `?lang=en`, code in `src/web/caseExport.ts`). Status changes are logged per case (`case_status_log`) since then.
- Press edition unchanged: delete without typed number and without deletion log, JSON export as before.
- Tests: `npm test`, 29 pass (30.10.2026).
