---
name: Projektstand
type: project
updated: 2026-10-25
---
- Produkte auf einem System: unpruuf Business (Hauptprodukt), unpruuf Compliance (Meldekanal, früher safeline), unpruuf Press (Pilot), kostenlose Client-App. Technische Namen mit "safeline" bleiben absichtlich.
- Kern: zwei Teile, App und eigener Server des Kunden (NexonAI betreibt keine Server). Keine Identitäten, Tor von Anfang an. Nicht auditiert.
- Übergabe: `unpruuf/handover/UEBERGABE_2026-10-25.md`. Stand `android` = `main`.
- Branch `android` = Hauptlinie, `main` wird nachgezogen. Tor Client Edition auf `tor-client-edition`, nur auf Wunsch pushen.
- 25.10.: v32 geliefert (Projekt + 7 APKs, neuer Debug-Schlüssel). Audit-Runde R1 vom anderen Lauf zusammengeführt (Tor-Stream-Isolation, versiegelter DB-Schlüssel, Setup-Token, Start-Skripte). Prüfcode für eingefügte Gast-Codes, nur v3-Onion-Adressen.
- Zuletzt gebaut (22.-24.10.): Client-Import für Gast-Einladungen (Zwei-Scan-Austausch, Room v15, Tests grün, nicht auf Telefon getestet); Rename zu Compliance/Press; Website v13; Business-Deck mit Folie "keine Telefonnummer"; Konzept Spamschutz (Entwurf, nichts gebaut).
- Noch nicht gebaut bei Gästen: automatische Verlängerung (GRANT_RENEW), Gästeliste, Control, Gast-Auth im Android-Node, iOS.
- Server müssen für Gäste `NODE_MESH_GUEST_GRANTS=1` setzen (Standard aus).
