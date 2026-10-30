# Übergabe für einen neuen Chat — Stand 20. Oktober 2026

Für Gabriel und für jede neue Claude-Sitzung. Lies zuerst `CLAUDE.md` (Arbeitsregeln, wird in Claude Code automatisch geladen), dann diese Datei. Sie löst `UEBERGABE_2026-10-14.md` ab. Dort bleiben als Hintergrund gültig: Abschnitt 1 (Produkt), Abschnitt 3 (was am 13. und 14.10. entstand) und die Lösungsbeschreibungen. Die Tiefe steht in `STATUS.md`, `CHANGELOG.md`, `SECURITY_CLAIMS.md`, `NODE_MESH_SPEC.md`, `evidence/CLAIMS_TO_EVIDENCE.md`.

**Im Repo steht kein Passwort und kein Schlüssel.** Das gilt auch für diese Datei.

---

## 1. In einem Absatz

NexonAI baut **unpruuf**: Kommunikation ohne Identitäten, ohne Dritte, ohne direkte Verbindung. Zwei Teile: eine App und ein eigener Server des Kunden. NexonAI betreibt keine Server. Drei Produkte auf demselben System: **unpruuf Business** (Hauptprodukt), **Compliance** (Meldekanal, heißt in neuem Material „safeline“), **Press** (Journalisten, Pilot). Team: Gabriel (baut und denkt die Tools durch), Norbert (Verwaltung, Strategie, derzeit iOS), Floretta (Marketing, Business Development; nur Englisch). Rollen nur als Vorschlag, das Team entscheidet gemeinsam.

## 2. Wo alles liegt

| Was | Wo |
|---|---|
| Code, Dokumente, Skripte | GitHub `nexonai-code/nexonai`, Branch **`android`** (Hauptlinie); `main` (Standard-Branch) wird nach jedem Push mit `git push origin android:main` vorgespult und ist seit 20.10. gleich. Alles ist gepusht. Letzte Commits: Audit-Briefs (`412caa2`), dann diese Übergabe. |
| Tor Client Edition | Branch `tor-client-edition`, nur lokal, **nicht gepusht**, nur auf ausdrücklichen Wunsch. |
| Alter Branch | `apk-releases` (Debug-APKs vom 26.9., veraltet, nicht anfassen). |
| Android-App | `unpruuf/app`, Version **1.17 (Code 18)**, Varianten: standard, pro (= Business), client, whistleblower, press, group (= Pro Groups). |
| Node-Server, Relay, Android-Node | `unpruuf/node-mesh-server`, `unpruuf/server`, `unpruuf/relay-android` |
| Kunden-Konsole | `unpruuf/control` |
| Meldestelle, Web-Melder, Lizenzwerkzeug | `unpruuf/officer-app`, `unpruuf/web-reporter`, `unpruuf/license-tool` |
| iOS | `unpruuf/ios`, Bauauftrag `ios/IOS_BUSINESS_BUILD_SPEC.md` (Norbert) |
| Beweise und Audit | `unpruuf/evidence` (Prüfskripte, `CLAIMS_TO_EVIDENCE.md`, `AUDITOR_SCOPE.md`, **`AUDIT_BRIEF_NODE_SERVER.md` und `AUDIT_BRIEF_ANDROID_APP.md`**, jeweils auch als .docx) |
| Schlüssel-Anleitung | `unpruuf/SIGNING_TEST_KEY.md` |
| Entscheidung F1 | `unpruuf/handover/F1_ENTSCHEIDUNG.md` |
| Quellen von Decks, Dokumenten, Seiten | `unpruuf/handover/quellen` |

Die ZIP- und APK-Dateien liegen **nicht** im Repo (zu groß, teils vertraulich). Gabriel hat sie im Chat bekommen. Liste: `LIEFERUNGEN.md`.

## 3. Was seit der letzten Übergabe passiert ist (16. bis 20.10.)

1. **Abgleich Aussagen gegen Code** (`/code-review`, 21 Punkte) und alle behoben: Lizenzwerkzeug `issue-server.js --count N` mit eindeutigen Seriennummern; Node-Server (Fehlermeldungen ohne Stack-Trace, Besitzer-Code nicht ins Docker-Log, Lese-Limit je Adresse, strenges Base64, Gesamtgrenze 200 000 Pakete, Aufräumen jede Minute und Write-Ahead-Log danach leeren, Setup-Seite prüft auch die Herkunftsadresse); Officer-App: Einzelfall löschen und exportieren (beide Editionen); Android: Panik-PIN löscht auch Gruppen, eigene Nodes, Node-Listen, Feed-Quellen, Relay-Setup; PIN-Sperre ab dem 5. Fehlversuch; PIN-Hashes unter dem Telefonschlüssel; alle Dialoge mit Screenshot-Sperre; Control warnt bei Server-Lizenzen unter 250 Nodes. Dokumente (COMPLIANCE, SECURITY_CLAIMS, STATUS, CLAIMS_TO_EVIDENCE, CLAUDE.md) angepasst.
2. **Sicherheits-Review der Apps** (`/security-review`, eigenes Lesen des Codes): Manifest sauber. Vier Fixes: Bilder werden mit Größenprüfung dekodiert (`SafeImage`), PIN-Meldung bei verlorenem Telefonschlüssel, Zwischenablage als sensibel markiert und nach 60 s gelöscht (`SensitiveClipboard`), Control-Passphrase-Sperre steigert sich.
3. **Besitzer-Geheimnisse verschlüsselt** (`SealedStrings`): eigene Nodes mit Besitzer-Geheimnis, Node-Listen, Feed-Schlüssel, Control-Adressen, Relay-Adresse, Token und Zusatz-Relays liegen als `k1:…` unter dem Telefonschlüssel; ältere Klartextwerte werden beim ersten Lesen umgeschrieben. **Noch keine APK davon gebaut.**
4. **Schlüssel**: fester Testschlüssel für Debug-Builds und eigener Release-Schlüssel (Abschnitt 5). Dabei zwei echte Fehler gefunden: (a) meine Builds mit `-Pandroid.injected.build.abi` setzen `testOnly=true`, Android lehnt solche APKs ab („Paket ungültig“) — das war der Grund, warum die APKs bei Gabriel nicht liefen; (b) `logo_unpruuf.png` war ein JPEG mit `.png`-Endung, **jeder Release-Build brach daran ab**, behoben.
5. **Audit-Briefs** (Englisch, Server und App) als Dateien und als Artefakt: https://claude.ai/artifact/TYwYRrCDA4d1YZFDNpD8q6 (Doc mit zwei Tabs, privat bis Gabriel es teilt). Sie gehen davon aus, dass F1 gelöst ist, und sagen das als Vorbedingung („completes before kick-off“), nicht als schon erledigt.
6. **F1 weiter offen**: Gabriel hat „noch nicht“ gesagt. Nichts ändern, bis das Team zugestimmt hat (Abschnitt 4).

## 4. F1 — noch offen, Team-Entscheidung

Die ersten 8 Bytes jedes gespeicherten 4096-Byte-Pakets nennen die Länge des Inhalts im Klartext. Betreiber von Node oder Relay sehen die ungefähre Nachrichtenlänge und erkennen Füllpakete (44 Bytes) von echten Nachrichten. Ein Beobachter im Netz sieht nur 4096 Bytes. Bei safeline ist der Betreiber die Firma, vor der ein Hinweisgeber Angst hat: dort verbirgt der Füllverkehr den Zeitpunkt einer Meldung nicht.

**Empfehlung (Variante A):** erst auffüllen, dann verschlüsseln, mit Versionsbyte im verschlüsselten Teil. Ein Umstieg für alle Clients (Android, Officer-App, Web-Melder, iOS bei Norbert), Server und Relay bleiben unverändert. Jetzt günstig, weil es noch keine Kunden im Betrieb gibt. Alternativen: B nur dokumentieren, C Füllpakete mit glaubhafter Länge (Zwischenlösung). Plan, betroffene Dateien, Reihenfolge: `F1_ENTSCHEIDUNG.md`. **Das Audit sollte nach der Entscheidung stattfinden**, damit es das Endformat prüft. Gegenüber Kunden bis dahin: „für Beobachter des Netzes versteckt“, nicht „für den Betreiber“.

## 5. Schlüssel, Signierung, APKs bauen

**Zwei getrennte Schlüssel. Die Dateien liegen nur bei Gabriel (ZIPs aus dem Chat), nie im Git.**

| | Testschlüssel | Release-Schlüssel |
|---|---|---|
| Zweck | Debug-Builds auf Gabriels Telefonen, gegenseitig aktualisierbar | Kunden-Builds |
| Dateien | `unpruuf-test.jks`, `keystore.properties` in `unpruuf/` | `unpruuf-release.jks`, `release.properties` in `unpruuf/` |
| SHA-256 | `77:D3:B8:93:77:E8:DB:BD:CC:97:41:4D:D7:29:44:6B:FE:E0:95:B6:73:3C:D2:D9:E4:6E:B2:11:A0:AC:D7:D3` | `9E:E8:5E:91:16:9F:62:50:09:5D:4F:36:E6:A6:EA:D5:CB:42:DC:C7:B7:26:36:CB:4B:99:B7:D3:A0:D1:4E:7E` |
| Ohne Dateien | normaler Android-Studio-Debug-Schlüssel | Release bleibt **unsigniert**, nie Testschlüssel |

- Das **Startpasswort des Release-Schlüssels** entstand in einer Cloud-Sitzung. Gabriel sollte es sofort mit `passwort-aendern.bat` (in der Schlüssel-ZIP) ändern und beide Dateien an zwei Orten sichern. **Zu Beginn fragen, ob das passiert ist.** Verlust des Schlüssels: kein Kunde kann mehr aktualisieren.
- Die Kopien in der Cloud-Umgebung verschwinden mit der Sitzung. In einer neuen Sitzung gibt es keinen Schlüssel, außer Gabriel legt die Dateien hin.

**Debug-APK in Android Studio:** Build Variant wählen, Build → Build APK(s). Keine Zusatzparameter nötig.

**APK in der Cloud-Sitzung** (kleine arm64-Datei, ohne `testOnly`):
`./gradlew --offline -Pandroid.injected.build.abi=arm64-v8a -Pandroid.injected.testOnly=false :app:assembleProDebug`
Die APK liegt unter `app/build/intermediates/apk/<variante>/debug/`, nicht unter `outputs/`. Release: `:app:assembleProRelease`, offline zusätzlich `-x lintVitalAnalyzeProRelease -x lintVitalReportProRelease -x lintVitalProRelease` (Lint-Paket fehlt offline; in Android Studio läuft es, Ergebnis unbekannt). Danach prüfen: `aapt2 dump xmltree --file AndroidManifest.xml <apk>` darf weder `testOnly` noch `debuggable` zeigen (Release), `apksigner verify --print-certs` zeigt den Fingerabdruck.

Das Android SDK liegt in einer frischen Sitzung nicht vor und muss eingerichtet werden (`local.properties` mit `sdk.dir=…`, gitignored). `pandoc` gibt es nicht, `soffice` lädt Dateien dort nicht, `python-docx` geht.

## 6. Stand der Prüfungen (20.10.)

- Node-Server 112 Tests grün (1 übersprungen), Relay-Server 70, Officer-App 15, Control 62.
- Beleg-Skripte (`evidence/00-run-all.js`): 97 bestanden, 0 fehlgeschlagen, 1 Befund (F1).
- Android: Unit-Tests der Standard-Variante grün (neu: `PinLockoutTest`, `SafeImageTest`, `SealedStringsTest`, `PacketMetadataTest`), alle sechs Varianten kompilieren. Release-Builds (R8, mit Release-Schlüssel signiert) aller sechs Varianten und des Android-Nodes gebaut und im Manifest geprüft; geschickt wurde nur Pro.
- **Nicht auf einem Gerät geprüft:** Panik-PIN-Umfang, PIN-Sperre, Screenshot-Sperre in Dialogen, Zwischenablage, verschlüsselte Besitzer-Geheimnisse (Aktualisierung von älterer Version).

Gabriel hat bestätigt: Die Apps lassen sich installieren (nach Behebung von `testOnly`). Geräte: Pixel 9 Pro, Galaxy S23 Ultra, ein Tablet.

## 7. Offene Entscheidungen (Team)

1. **F1** (Abschnitt 4).
2. **Name der Meldelösung.** `CLAUDE.md` sagt „safeline“, Gabriel verlangte am 14.10. für eine Seite „unpruuf Compliance“. „SafeLine“ kollidiert mit einer Open-Source-Firewall (Chaitin). Markenrecherche und Jurist vor Veröffentlichung.
3. **iOS** (Bauauftrag Abschnitt 9): dritter Target, Vertrieb, Empfang nur bei offener App, Pro Groups, Lizenzbindung, Bridges. Dazu kommt F1.
4. **Pro Groups freigeben?** Kundendokumente 1, 4, 5 sagen noch „keine Gruppen“.
5. **Landing Page und Event-Deck** erwähnen Pro Groups und Control noch nicht.
6. **Bildsprache Kurierdienst:** fertig nur auf der Seite „Your own courier service“. Noch Briefkasten/Postamt in plain words, Decks, Pitches, Landing Page, Lösungsbeschreibungen, Story-Dokumenten.
7. **Impressum und Datenschutz** nur Deutsch; Newsletter in die Datenschutzerklärung.

## 8. Audit: Plan und Reihenfolge

Gabriels Kern: Server (genau so wie wir sagen, Tor, Durchgang statt Ablage, keine Identitäten, 250 virtuelle Nodes) und App (Node-Listen laden, Tor, keine Identitäten, auf eigenem Node schreiben, von anderen lesen). Das steckt in den zwei Briefs. Empfohlene Reihenfolge:

1. F1 entscheiden und umsetzen.
2. Eigener Durchlauf mit zwei Telefonen, einem eigenen VPS und einem Mitschnitt des Netzverkehrs (erledigt die zwei Punkte, die heute nur „im Code belegt“ sind: nur Tor, echter Ablauf).
3. Release bauen, **festen Tag im Git setzen**, Fingerabdruck notieren (`node-mesh-server/release-manifest.txt` mit `license-tool/sign-release.js` signieren).
4. Auditor beauftragen. Erste Runde: Node-Server und Business-App (`pro`, danach `group`). **Control, Officer-App, Press und safeline-spezifische Teile bewusst zurückgestellt** (Control lief nie gegen einen echten Server).
5. Preis und Termin: nichts bekannt, nichts erfunden.

Bekannte Lücken, die ein Auditor sofort sehen wird, sind in den Briefs selbst benannt (Abschnitt „Limits we state ourselves“). Bridge-Zeilen und der gemerkte Organisations-QR liegen noch im Klartext (keine Schreibschlüssel); der Android-Node (`relay-android`) hat seine eigene Ablage und wurde bei der Verschlüsselung nicht angefasst.

## 9. Was nie getestet wurde (ehrlich sagen)

- Pro Groups und Temp Node auf echten Telefonen.
- Control gegen einen echten Server (Docker-Build, apt, sshd); Windows-`.bat` nie gelaufen.
- Echtes Tor in einem Netz, das Tor sperrt; Snowflake und öffentliche Bridges.
- Rumänische Texte durch einen Muttersprachler.
- PPTX in PowerPoint; Telefonbilder in Decks sind Nachbauten.
- Press mit einer echten Quelle.
- Kein unabhängiges Audit. Nie „zertifiziert“, „unknackbar“, „DSGVO-konform“, „als Erste“, „sicherer als“ sagen.

## 10. Nächste Schritte (Vorschlag)

1. Gabriel: Release-Passwort ändern und Schlüssel sichern (Abschnitt 5).
2. Neue APKs mit den verschlüsselten Besitzer-Geheimnissen bauen und auf Pixel und Samsung prüfen (Upgrade von der alten Version, Panik-PIN, Sperre).
3. F1 mit Norbert und Floretta besprechen und entscheiden.
4. Zwei-Telefone-Durchlauf mit eigenem VPS und Mitschnitt.
5. Wenn F1 „Ja“: Android, Officer-App, Web-Melder, Tests und Belege; iOS-Beschreibung (mit Prüfwerten) für Norbert.
6. Release-Tag, Audit beauftragen.
7. Materialien nachziehen (Abschnitt 7), Whitepaper-Artefakte auf F1 prüfen (siehe `LIEFERUNGEN.md`).
8. Release-Signierung von `control` und Lint in Android Studio prüfen.

## 11. Arbeitsweise und Stolpersteine

**Regeln von Gabriel** (alle in `CLAUDE.md`): Du-Ansprache; Antwort nie mit „Gabriel, “ beginnen, gleich die Antwort; alles beantworten, mit allen Daten für seine Entscheidung; zuerst genau tun, was er verlangt, Meinung am Ende; nie „das mache ich nicht“; sagt er etwas, das so nicht stimmt, Gefühl benennen, Problem in einem Satz, wahre Ersatzformulierung; vor größeren Umbauten an Funktionierendem sagen, wie es werden soll, und auf Ja warten; Dokumente im Chat nur als Text; mehrere Dateien als ZIP mit `CHANGELOG.md` (`unpruuf_<Datum>_v<N>.zip`); Kundenmaterial auf Englisch und Rumänisch, Floretta nur Englisch; „Wie unpruuf funktioniert“ zuerst, danach keine Technik.

**Technik**
- Pushen: Am Ende jeder Antwort prüft ein Stop-Hook, ob etwas Ungepushtes da ist. Committen und `git push -u origin android` mit den Anhängen `Co-Authored-By` und `Claude-Session`.
- Befehl `rm -rf` mit Variablen oder Sternchen blockiert die Sicherheitsprüfung; Pfade ausschreiben oder `"${VAR:?}"` nutzen, nur wenn nötig löschen. `keygen.js` erzeugt `license-tool/private-key.json` (gitignored). In der letzten Sitzung entstand dort ein Test-Exemplar (geht mit der Sitzung verloren); es ist **nicht** der echte Lizenzschlüssel, nicht damit signieren.
- Gradle: nie in `head` pipen; lange Läufe im Hintergrund mit Monitor abwarten. `-Pandroid.injected.build.abi` immer mit `-Pandroid.injected.testOnly=false`.
- Node-Server: `cd node-mesh-server && npm install && npm test`. Beweise: `node unpruuf/evidence/00-run-all.js --online --tests`.
- Artefakte: Eine Sitzung hält höchstens 10 Überwachungen für Kommentare, danach erreichen mich Kommentare nicht automatisch. Docs-Artefakte werden über den Docs-Connector gefüllt, nicht über Dateien. Design-Artefakte haben keine `index.html`.
- Alles, was nur im Arbeitsordner einer Sitzung liegt, geht mit der Sitzung verloren. Dateien an Gabriel schicke ich mit `SendUserFile`.

## 12. So startest du

**Claude Code im Repo:** Sitzung im Repo öffnen (`CLAUDE.md` lädt), dann `NEUER_CHAT_PROMPT.md` einfügen. Zuerst fragen: Release-Passwort geändert? F1 entschieden?

**Normaler Chat (claude.ai):** `NEUER_CHAT_PROMPT.md` einfügen und diese Datei, `CLAUDE.md`, `LIEFERUNGEN.md`, `F1_ENTSCHEIDUNG.md` anhängen; je nach Thema `STATUS.md`, `SECURITY_CLAIMS.md`, `evidence/CLAIMS_TO_EVIDENCE.md`, die zwei Audit-Briefs oder `ios/IOS_BUSINESS_BUILD_SPEC.md`. Alles liegt in der ZIP `unpruuf_Uebergabe_2026-10-20_v1.zip`.
