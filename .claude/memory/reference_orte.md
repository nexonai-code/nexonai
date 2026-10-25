---
name: Orte und Befehle
type: reference
---
- Übergabe: `unpruuf/handover/UEBERGABE_2026-10-22.md`, `LIEFERUNGEN.md`, `NEUER_CHAT_PROMPT.md`; Quellen von Decks und Seiten in `unpruuf/handover/quellen`.
- Android: `unpruuf/app`; Tests `./gradlew --offline :app:test<Flavor>DebugUnitTest` (Standard, Client, Pro, Group, Whistleblower, Press); APKs mit `-Pandroid.injected.build.abi=arm64-v8a -Pandroid.injected.testOnly=false`.
- Server: `unpruuf/node-mesh-server`; Officer-Dashboard: `unpruuf/officer-app`; Web-Reporter: `unpruuf/web-reporter`; Control: `unpruuf/control`.
- Decks: `unpruuf/presentations` (decks2.py, decks2_en.py, export2.py, render.js mit NODE_PATH=/opt/node22/lib/node_modules). Website: `unpruuf/website`.
- Doku: `STATUS.md`, `SECURITY_CLAIMS.md`, `GUEST_LOCKERS_BUILD_SPEC.md`, `NODE_MESH_SPEC.md`, `CHANGELOG.md`.
- Schlüssel (Test und Release) liegen nur bei Gabriel, nie im Git.
