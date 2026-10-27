---
type: app
id: relay-server
title: unpruuf relay server
status: tested
updated: '2026-10-27'
summary: 'Blind store-and-forward mailbox (Node.js/TypeScript): optional for Android, mandatory for iOS; never sees plaintext.'
code:
- unpruuf/server
build: npm install && npm test
---
- Runs via Docker/Linux, Windows (start-windows.bat, standalone .exe) or macOS (menu bar app).
- npm install && npm test; bearer token per relay, operator-set TTL.
