---
name: Projektstand
type: project
updated: 2026-10-25
---
- Produkte auf einem System: unpruuf Business (Hauptprodukt), unpruuf Compliance (Meldekanal, früher safeline), unpruuf Press (Pilot), kostenlose Client-App. Technische Namen mit "safeline" bleiben absichtlich.
- Kern: zwei Teile, App und eigener Server des Kunden (NexonAI betreibt keine Server). Keine Identitäten, Tor von Anfang an. Nicht auditiert.
- Übergabe: `unpruuf/handover/UEBERGABE_2026-10-25.md`. Stand `android` = `main`.
- Branch `android` = Hauptlinie, `main` wird nachgezogen. Tor Client Edition auf `tor-client-edition`, nur auf Wunsch pushen.
- 27.10.: iOS-Übergabe für Norbert geliefert (`unpruuf_iOS_Norbert_2026-10-27_v1.zip`, Dokument `ios/IOS_UEBERGABE_FUER_NORBERT_2026-10-27.md`, Vektoren `ios/vectors/`). Norbert braucht den neuen öffentlichen Lizenzschlüssel; privater Schlüssel nie weitergeben.
- 27.10.: v34 geliefert (Projekt + 7 APKs) und neuer Windows-Installer, beide mit dem NEUEN Lizenzschlüssel; Testlizenzen als Datei. Alte Lizenzen ungültig.
- 27.10.: Windows-Installer gebaut (Setup.exe mit Node.js, portables ZIP) über GitHub-Workflow `windows-installer.yml` auf Windows-Runner; Quelle `unpruuf/windows-installer/`. Nicht signiert. Neu bauen: Actions > Windows installer > Run workflow (oder per Tool `run_workflow`).
- 26.10.: v33 geliefert (Projekt + 7 APKs) mit GRANT_RENEW. Gast-Funktionen offen: harter Widerruf, Gästeliste, Control, Gast-Auth im Android-Node, iOS.
- 26.10.: `unpruuf_Windows_2026-10-26_v1.zip` (alle Windows-Komponenten, README EN/RO, CHANGELOG).
- 25.10.: v32 geliefert (Projekt + 7 APKs, neuer Debug-Schlüssel). Audit-Runde R1 vom anderen Lauf zusammengeführt (Tor-Stream-Isolation, versiegelter DB-Schlüssel, Setup-Token, Start-Skripte). Prüfcode für eingefügte Gast-Codes, nur v3-Onion-Adressen.
- Zuletzt gebaut (22.-24.10.): Client-Import für Gast-Einladungen (Zwei-Scan-Austausch, Room v15, Tests grün, nicht auf Telefon getestet); Rename zu Compliance/Press; Website v13; Business-Deck mit Folie "keine Telefonnummer"; Konzept Spamschutz (Entwurf, nichts gebaut).
- Noch nicht gebaut bei Gästen: automatische Verlängerung (GRANT_RENEW), Gästeliste, Control, Gast-Auth im Android-Node, iOS.
- Server müssen für Gäste `NODE_MESH_GUEST_GRANTS=1` setzen (Standard aus).
