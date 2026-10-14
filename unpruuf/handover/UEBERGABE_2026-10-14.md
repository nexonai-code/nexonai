# Übergabe für einen neuen Chat — Stand 14. Oktober 2026

Für Gabriel und für jede neue Claude-Sitzung. Lies zuerst `CLAUDE.md` (Arbeitsregeln, wird in Claude Code automatisch geladen), dann diese Datei. Die Tiefe steht in `STATUS.md`, `CHANGELOG.md`, `SECURITY_CLAIMS.md`, `NODE_MESH_SPEC.md`.

---

## 1. In einem Absatz

NexonAI baut **unpruuf**: Kommunikation ohne Identitäten, ohne Dritte, ohne direkte Verbindung. Zwei Teile: eine App und ein eigener Server des Kunden (Briefkastenbild). NexonAI betreibt keine Server. Drei Produkte auf demselben System: **unpruuf Business** (interne Kommunikation, Hauptprodukt), **Compliance** (Meldekanal; bisher „safeline“, siehe Punkt 5), **Press** (Journalisten, Pilot). Team: Gabriel (baut und denkt die Tools durch), Norbert (Verwaltung, Strategie, derzeit alles rund um iOS), Floretta (Marketing, Business Development; spricht nur Englisch). Rollen nur als Vorschlag, das Team entscheidet gemeinsam.

## 2. Wo alles liegt

| Was | Wo |
|---|---|
| Code, Dokumente, Skripte | GitHub `nexonai-code/nexonai`, Branch **`android`** (Hauptlinie). Letzter Stand: Commit „iOS spec: note packet-length finding F1“ und danach die Übergabe. |
| Tor Client Edition | Branch `tor-client-edition`, nur lokal, **nicht gepusht** (nur auf ausdrücklichen Wunsch). Offene Aufgabe #40 in der alten Liste. |
| Android-App | `unpruuf/app`, Version **1.17 (Code 18)**, Flavors: standard, pro (= Business), client, whistleblower, press, group (= Pro Groups). Datenbank v14. |
| Node-Server | `unpruuf/node-mesh-server` (Tor eingebaut, 250 Adressen pro Server, Lizenz offline). |
| Android als Node | `unpruuf/relay-android` |
| Kunden-Konsole | `unpruuf/control` (neu, 13.10.) |
| Meldestelle (Windows) | `unpruuf/officer-app`, Web-Melder `unpruuf/web-reporter`, Lizenzwerkzeug `unpruuf/license-tool` |
| iOS | `unpruuf/ios` (altes Relay-Modell, auf zwei echten iPhones getestet) und **`ios/IOS_BUSINESS_BUILD_SPEC.md`** (Bauauftrag für Norberts Claude Code) |
| Beweise | `unpruuf/evidence` (Prüfskripte, Tabelle Aussage → Beweis, Prüfauftrag) |
| Quellen von Präsentation, Dokumenten, Seiten, Artefakten | `unpruuf/handover/quellen` (neu, vorher nur im Arbeitsordner einer Sitzung) |
| Basistexte (Briefkastenbild) und Logo | `unpruuf/handover/quellen/basistexte-und-logo` |

Abgeschlossene Lieferungen als Dateien und Artefakt-Links: `LIEFERUNGEN.md`.

## 3. Was in den letzten zwei Tagen entstanden ist

**13. Oktober**
- Sechs Lösungsbeschreibungen (System, safeline, Press, Business, Sicherheitsfunktionen, Pro Groups), v3.
- **Pro Groups** als eigene Edition: lokale Gruppen mit Gruppencode, jede Nachricht geht einzeln an jedes Mitglied. Bis zu 10 Mitglieder, nur Text, kein Gruppenserver. Paart nur mit anderen Pro-Groups-Installationen.
- **Rumänische Oberfläche** der Haupt-App, alle Meldungen in Ressourcen (EN + RO, je 445 Texte).
- **Temp Node auf dem Telefon** (nur Pro Groups): das Telefon startet für einen Chat selbst einen Node.
- **unpruuf Control** v1: Konsole des Kunden auf seinem Admin-PC. Fügt Server per SSH hinzu, installiert den Node-Server in Docker, zeigt den Zustand, entsperrt nach Neustart, verteilt Lizenzcodes aus einem Vorrat. Buchführung, kein Kopierschutz.
- NexonAI-Logo in den Folienfüßen. Event-Präsentation **UAB-Pitch-Kurz v11** (EN + RO), Business-Pitch v2, Press-Pitch v2.
- Artefakt „Build Log“ (EN).

**14. Oktober**
- **iOS-Bauauftrag** für Norberts Claude Code: Business-Client (Node-Mesh) für iPhone, damit iPhone und Android Pro sich paaren können.
- Landing Page als normale Webseite (RO/EN, GDPR-Seiten), v4. Das Design-Artefakt hat keine `index.html`; sie wurde daraus erzeugt.
- Feature-Tabelle als Artefakt, EN und RO, auf Stand 14.10.
- **Beleg-Paket** (`evidence/`): neun Prüfskripte, 99 Prüfungen bestanden, ein Befund (F1). Dabei: Tor-Download wird jetzt gegen feste SHA-256-Werte geprüft, vier bekannte Lücken in Server-Bibliotheken behoben (eine kritische), Server sendet kein `X-Powered-By` mehr.
- **„unpruuf in plain words“**: erklärende Seite (nicht technisch, EN + RO, hell, Rumänisch automatisch für Besucher aus Rumänien) als Artefakt und als Webseiten-ZIP.

## 4. Befund F1 — wichtig, noch offen

Die ersten 8 Bytes jedes gespeicherten 4096-Byte-Pakets nennen die Länge des Inhalts **im Klartext** (`NetworkObfuscation.padPacket`). Ein Node- oder Relay-Betreiber kann Nachrichtenlängen lesen und Tarn-Ablagen (44 Bytes) von echten Nachrichten unterscheiden. Ein Beobachter des Netzes sieht nur 4096-Byte-Pakete.

- **Korrigiert** (Wortlaut): `SECURITY_CLAIMS.md` §1.2, `STATUS.md`, `PRODUCT_CONTEXT.md`, `MARKETING.md`, beide Feature-Tabellen.
- **Nicht korrigiert (prüfen):** die Whitepaper-Artefakte, Blueprint, ältere Seiten. Dort kann noch „Nachrichtenlänge versteckt“ stehen. Decks und Landing Page sagen es nicht.
- **Lösung:** Länge in den verschlüsselten Teil legen (erst auffüllen, dann verschlüsseln). Ändert das Dateiformat in Android, iOS, Officer-App, Web-Melder und Relay. Braucht ein Ja des Teams. Bis dahin gegenüber Kunden: „Nachrichtenlänge ist für Beobachter des Netzes versteckt“, nicht „für den Betreiber“.

## 5. Offene Entscheidungen (Team)

1. **Name der Meldelösung.** `CLAUDE.md` sagt „safeline“ (seit 10.10.). Am 14.10. hat Gabriel für die Erklärseite „unpruuf Compliance“ verlangt. Der Name „SafeLine“ kollidiert mit einer Open-Source-Firewall (Chaitin). Offen: Regel in `CLAUDE.md` anpassen? Markenrecherche und Jurist vor Veröffentlichung.
2. **F1** (siehe oben): Dateiformat ändern, wann.
3. **iOS** (steht auch im Bauauftrag, Abschnitt 9): dritter Xcode-Target `UnpruufBusiness`, Vertrieb (TestFlight / Apple Business Manager / App Store, und ob Lizenzcode in der App erlaubt ist), Empfang nur bei offener App, Pro Groups auf iOS, Lizenzbindung per Keychain-ID, Bridges auf iOS.
4. **Pro Groups freigeben?** Solange nicht, sagen die Kundendokumente 1, 4, 5 noch „keine Gruppen“.
5. **Landing Page und Event-Deck** erwähnen Pro Groups und Control noch nicht.
6. **Impressum und Datenschutz** sind nur Deutsch; Englisch und Rumänisch fehlen. Der Newsletter (Mail an unpruuf@nexonai.ro) muss in der Datenschutzerklärung stehen.

## 6. Was nie getestet wurde (ehrlich sagen)

- Pro Groups und Temp Node auf dem Telefon: nie auf echten Telefonen.
- Control: nie gegen einen echten Server (Docker-Build, apt, sshd); Windows-`.bat` nie gelaufen; Release nicht signiert (privater Schlüssel liegt nicht hier).
- Rumänische Texte: kein Muttersprachler hat sie gelesen.
- PPTX-Dateien: nie in PowerPoint geöffnet (nur das PDF geprüft). Telefonbilder in Decks sind Nachbauten.
- Press: Pilot, nie mit einer echten Quelle.
- Snowflake und öffentliche Bridges: nie in einem Netz, das Tor wirklich blockiert.
- Kein unabhängiges Audit, nicht zertifiziert. Nie „zertifiziert“, „unknackbar“, „DSGVO-konform“, „als Erste“ sagen.
- Das Officer-Dashboard kann einen einzelnen Fall noch nicht löschen oder exportieren (offen nennen).

## 7. Nächste Schritte (Vorschlag, nach Wirkung)

1. **F1 entscheiden** und, wenn ja, Dateiformat ändern (vor dem Audit).
2. **Echter Test**: Business und Pro Groups auf 3–4 echten Telefonen, Control auf einem echten VPS. Alles andere baut darauf.
3. **Release signieren** (`license-tool/sign-release.js`, dann `npm run bundle` in `control`), Fingerabdruck notieren.
4. **Audit beauftragen**: `evidence/AUDITOR_SCOPE.md` ist der Prüfauftrag.
5. **Namen klären** (Compliance/safeline) und die Regel in `CLAUDE.md` angleichen.
6. **Materialien nachziehen**: Pro Groups und Control in Landing Page und Deck, Kundendokumente 1/4/5, Impressum/Datenschutz EN + RO, Whitepaper-Artefakte auf F1 prüfen.
7. **Norbert**: iOS-Bauauftrag starten (Paket A bis B), Entscheidungen aus Abschnitt 9 des Auftrags im Team treffen.
8. Dashboard: einzelnen Fall löschen/exportieren bauen (GDPR-Lücke).

## 8. Arbeitsweise, Stolpersteine

**Regeln, die Gabriel festgelegt hat** (alle in `CLAUDE.md`): Du-Ansprache, Gabriel beim Namen, kurze Antworten; nie „das mache ich nicht“; sagt er etwas, das so nicht stimmt, dann Gefühl benennen, Problem in einem Satz, bessere wahre Formulierung; vor größeren Umbauten sagen, wie es werden soll, auf Ja warten; Dokumente im Chat nur als Text; mehrere Dateien als ZIP mit `CHANGELOG.md`, Schema `unpruuf_<Datum>_v<N>.zip`; **alle Kundenmaterialien auf Englisch und Rumänisch**, Floretta-Material nur Englisch; Aufbau immer zuerst „Wie unpruuf funktioniert“ (Briefkasten, ohne Zahlen, Voraussetzung: Kunde betreibt eigene Server), danach keine Technik; Gesetze und Fristen vor jeder Aussage prüfen.

**Technik**
- Android bauen: Android SDK nötig (in einer frischen Sitzung nicht vorhanden). Tests: `./gradlew --offline :app:testStandardDebugUnitTest`. Nie Gradle in `head` pipen (bricht ab); `pkill -f` beendet die eigene Shell.
- Node-Server: `cd node-mesh-server && npm install && npm run build && npm test` (106 bestanden, 1 übersprungen). Beweise: `cd evidence && node 00-run-all.js --online --tests`.
- Präsentationen: Python (python-pptx) + Playwright für PDF; Skripte in `handover/quellen/uab-event-deck` und `unpruuf/presentations`. Die Telefonbilder (Nachbauten) liegen in den ausgelieferten ZIPs, nicht in den Skripten.
- Artefakte: Meine Sitzung kann höchstens 10 Überwachungen für Kommentare halten; danach erreichen mich Kommentare nicht automatisch. Veröffentlichen mit derselben URL aktualisiert. Design-Artefakte haben keine `index.html`; für eine echte Webseite Quellen in statisches HTML umwandeln (so entstanden Landing v4 und „plain words“).
- Alles, was nur im Arbeitsordner einer Sitzung liegt, geht mit der Sitzung verloren. Deshalb `handover/quellen`.

## 9. So startest du

**Claude Code im Repo:** neue Sitzung im Repo öffnen (`CLAUDE.md` wird geladen), dann `NEUER_CHAT_PROMPT.md` einfügen.

**Normaler Chat (claude.ai):** `NEUER_CHAT_PROMPT.md` einfügen und diese Datei, `CLAUDE.md` und je nach Thema `STATUS.md`, `SECURITY_CLAIMS.md`, `evidence/CLAIMS_TO_EVIDENCE.md` oder `ios/IOS_BUSINESS_BUILD_SPEC.md` anhängen. Alles liegt im ZIP `unpruuf_Uebergabe_2026-10-14_v1.zip`.
