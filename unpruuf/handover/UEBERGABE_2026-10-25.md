# Übergabe für einen neuen Chat — Stand 25. Oktober 2026

Für Gabriel und für jede neue Claude-Sitzung. Beschreibt den Stand nach den Sitzungen vom 22. bis 25.10.2026. Ersetzt die Übergabe vom 22.10. als erste Lektüre; die älteren bleiben als Geschichte. Kurzfassung in `.claude/memory/` (Index `MEMORY.md`).

---

## 1. In einem Absatz

unpruuf: Kommunikation ohne Identitäten, Server beim Kunden, Tor von Anfang an. Produkte **unpruuf Business** (Hauptprodukt), **unpruuf Compliance** (Meldekanal), **unpruuf Press** (Pilot), dazu die kostenlose **unpruuf Client**-App für Gäste. Stand `android` = `main` = `f484321`. Letzte Lieferung `unpruuf_2026-10-25_v32.zip` (Projekt plus alle sieben APKs). Nicht auditiert; die erste interne Audit-Runde (R1) ist eingearbeitet.

## 2. Zuerst wissen

1. **Das Projekt-ZIP enthält immer alle APKs** (Festlegung 25.10.). Erst APKs bauen, dann ein ZIP mit allem. Keine getrennten Lieferungen mehr.
2. **Schlüssel fehlen in der Umgebung.** Der Container wurde am 25.10. zurückgesetzt: Android-SDK neu unter `/opt/android-sdk`, `local.properties` neu, Test- und Release-Schlüssel weg (waren nie im Git). Die v32-APKs tragen deshalb einen **neuen Debug-Schlüssel** (Zertifikat `431e9992…`) und lassen sich nicht über bestehende Installationen legen. Für den bekannten Testschlüssel (`77:D3…`) muss Gabriel `unpruuf-test.jks` + `keystore.properties` aus `unpruuf_Testschluessel_2026-10-19.zip` hochladen, dann v33 bauen.
3. **Zwei Linien liefen parallel.** Ein zweiter Lauf hat am 24./25.10. das Sicherheitsaudit R1 gepusht (21 Commits: 13 von 17 Befunden behoben, Tor-Stream-Isolation pro Kontakt, versiegelter Datenbankschlüssel, Zugangstoken für Setup-Seiten, Start-Skripte gegen Befehlsinjektion, Design-Kit `unpruuf/design/`). Beide Linien sind in `22aeec1` zusammengeführt; alle Varianten bauen, 252 Unit-Tests je Variante grün. Das Audit-Register (`.security-audit/`) bleibt bei Gabriel, nicht im Git.
4. **F1 bleibt offen** (Paketlänge im Klartext). Nichts am Format ändern, bis das Team zugestimmt hat. Die Audit-Linie hat dazu ein Entscheidungsblatt gebaut (`F1_ENTSCHEIDUNG.md`, M4 ist kompatibel).
5. **Nichts davon lief auf einem Telefon.** Client-Import (Zwei-Scan-Austausch), Prüfcode, Audit-Fixes: nur Unit-Tests. Vor dem nächsten Pilot zuerst Pro, Client und Press auf echten Geräten.
6. **Ergebnisse von Sicherheitstests bleiben im Chat**, nie in committeten Dateien.

## 3. Was vom 22. bis 25.10. entstand

| Bereich | Ergebnis |
|---|---|
| Client-Import | Gast-Einladung per Scan annehmen, eigener Code zurück, Pro bindet den Gast über die Einladungs-ID `i`. Gast sendet nur mit Grants, Banner bei abgelehnt/Kontingent/Ablauf. Room v15 (`guestGrants`). Panic-Wipe löscht offene Einladungen. |
| Prüfung der letzten Version (24.10.) | Drei mittlere Punkte. Behoben: Rückfrage mit Prüfcode bei eingefügtem Gast-Code (`GuestClient.fingerprint`, Dialog in Pro, Anzeige unter dem Gast-QR), nur v3-Onion-Adressen (Decode, Parse, vor jeder Verbindung). Offen: Gast vor Ablauf sperren (Format, Team). |
| Audit R1 (andere Linie) | 13 von 17 Befunden, siehe `CHANGELOG.md` vom 25.10. Offen gelassen: SEC-004 (F1), SEC-005 (M5), SEC-006 (M8), SEC-0xx laut Changelog. |
| Konzepte | Spamschutz für offene Eingänge (`handover/KONZEPT_SPAMSCHUTZ_2026-10-23.md`, Artefakt). Stufe A ohne Formatänderung empfohlen. Nichts gebaut. |
| Gedächtnis | `.claude/memory/` mit Index, Gabriel, Team, Arbeitsweise, Stand, Entscheidungen, offene Punkte, Orte. Pflicht: nach jeder Entscheidung und am Tagesende pflegen. |
| Lieferung | `unpruuf_2026-10-25_v32.zip`: Projekt ohne Schlüssel plus sieben APKs (arm64, Debug, neuer Schlüssel). |

## 4. Offene Entscheidungen des Teams

- F1 (Paketformat).
- Gast-Grant vor Ablauf widerrufen (Sperrliste auf dem Server oder kürzere Laufzeit, Standard 7 Tage?).
- Spamschutz Stufe A bauen? Frist für unangenommene Fälle (Vorschlag 7 Tage)?
- Idee „alle Organe des Staates“ (Polizei, Drogenhilfe): zuerst Compliance für Kommunen, dann ein Pilot bei einer Stelle. Rechtslage anonymer Meldungen in Rumänien vorher prüfen.

## 5. Nächste Schritte (Vorschlag)

1. Testschlüssel hochladen, v33 mit bekanntem Schlüssel bauen.
2. Telefontest Pro + Client (Einladung, zwei Scans, Nachricht in beide Richtungen, Gast-Banner) und Press.
3. Gast-Funktionen fertig: automatische Verlängerung (`GRANT_RENEW`), Gästeliste in Pro, Control, Gast-Auth im Android-Node. iOS-Folgen (Feld `i`, Zwei-Scan, Prüfcode) an Norbert.
4. Restliche Audit-Befunde nach Teamentscheidung.
5. AND-8: `fallbackToDestructiveMigration()` entfernen, Migrationstest.

## 6. Orte

Übergaben und Lieferliste in `unpruuf/handover/`; Build-Befehle in `.claude/memory/reference_orte.md`; Spezifikationen `GUEST_LOCKERS_BUILD_SPEC.md` (§15.1), `NODE_MESH_SPEC.md`, `SECURITY_CLAIMS.md`; Design `unpruuf/design/NEXONAI_DESIGN.md`.
