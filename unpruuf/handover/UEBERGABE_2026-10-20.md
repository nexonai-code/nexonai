# Übergabe für einen neuen Chat — Stand 20. Oktober 2026

Für Gabriel und für jede neue Claude-Sitzung. Diese Datei beschreibt die Sitzung vom 17. bis 20. Oktober 2026 (Branch `ccr-9a899f8d-xrqsp0`). Davor gilt `UEBERGABE_2026-10-14.md` (liegt auf dem Branch `android`, siehe Punkt 2). Lies zuerst `CLAUDE.md` im Wurzelordner und `unpruuf/CLAUDE.md`, dann diese Datei.

---

## 1. In einem Absatz

NexonAI baut **unpruuf**: Kommunikation ohne Identitäten, ohne Dritte. Zwei Teile: App und eigener Server des Kunden, NexonAI betreibt keine Server. Produkte: **unpruuf Business** (Hauptprodukt, getestet), **safeline** (Compliance, getestet), **safeline Press** (Pilot). Ein Server hat 250 virtuelle Nodes mit je bis zu 100 Slots (25.000 Fächer), beliebig viele Server parallel, 1 Lizenz = 1 Server. In dieser Sitzung entstanden: Website, Whitepaper, Gast-Briefkästen für eine kostenlose Client-App, CI-Paket, Leadliste, Krankenhaus-Ideen (EN und DE), Architektur- und Compliance-Videos, Dokumentvorlagen. Das Design der Artefakte ist seit 19.10. das Logo-Blau.

## 2. Zuerst wissen (Warnungen)

1. **Zwei Branches laufen auseinander.** Diese Sitzung arbeitet auf `ccr-9a899f8d-xrqsp0`. Parallel gibt es `origin/android` mit anderen, neueren Commits (Courier-Seite, Security-Fixes, `SealedStrings`, F1-Entscheidung, Audit-Briefs, Übergabe vom 14.10.). Gemeinsamer Vorfahre: Commit `a9335870`. Auf `android` fehlen: Gast-Briefkästen, Design-Kit, die aufgeteilten CLAUDE.md-Dateien (Wurzel und `unpruuf/`), Regel 250×100. Auf diesem Branch fehlen: alles von `android`. **Vor dem nächsten größeren Schritt zusammenführen** (Konflikte vor allem in `CLAUDE.md`, `unpruuf/CLAUDE.md`). Das Team entscheidet, welcher Branch Hauptlinie ist.
2. **F1 (Länge im Klartext im gespeicherten Paket).** Auf `android` steht im Dokument `handover/F1_ENTSCHEIDUNG.md` Stand 19.10.: offen, „noch nicht“, nichts ändern. Gabriel hat in dieser Sitzung gesagt, bei ihnen seien alle ausgehenden Pakete 4096 Byte und „läuft schon“. In diesem Branch-Stand ist `padPacket` unverändert (Längenfeld im Klartext). **Widerspruch klären**, bevor ein Auditor oder ein Kunde Aussagen wie „alle Pakete gleich groß, Länge verborgen“ bekommt. Whitepaper v1.3 und Website sagen „alle Pakete gleich groß“ (stimmt für den Beobachter im Netz, nicht für den Betreiber).
3. **Der 250×100-Server ist nicht im Repo.** Im Repo liegt der ältere Einzel-Node-Server (`unpruuf/node-mesh-server`). Das Gast-Modul ist dort gebaut und getestet, muss aber in den echten 250×100-Server portiert werden.
4. **Arbeitsdateien dieser Sitzung liegen sonst nur im flüchtigen Arbeitsordner.** Die Quellen (Skripte) liegen deshalb jetzt in `unpruuf/handover/quellen/` (Punkt 4). Die fertigen ZIPs hat Gabriel im Chat bekommen, sie liegen nicht im Repo (außer Website v11).

## 3. Wo alles liegt

| Was | Wo |
|---|---|
| Regeln | `CLAUDE.md` (Wurzel: Antwortstil, Design) und `unpruuf/CLAUDE.md` (nur unpruuf) |
| Design-Kit (blau) | `design/` (`nexonai.css`, `kit.py`, `assets/`, `README.md`). Artefakte immer damit bauen |
| Gast-Briefkästen | Bauauftrag `unpruuf/GUEST_LOCKERS_BUILD_SPEC.md` (Abschnitt 15 = Baustand), Format `unpruuf/guest-grants/{FORMAT.md,vectors.json}`, iOS-Auftrag `unpruuf/ios/IOS_GUEST_CLIENT_BUILD_SPEC.md` |
| Server-Teil Gäste | `unpruuf/node-mesh-server/src/guest/*` (`guestGrant.ts`, `guestQuota.ts`, `guestScope.ts`, `vectors.ts`), Tests `guest.test.ts`, Anbindung in `middleware/depositAuth.ts`, `routes/node.ts`, `app.ts`, `config.ts`, `index.ts` |
| Android Gäste | `domain/network/{GuestGrant,GuestScope,GuestInvite}.kt`, `NodeMeshClient.depositAsGuest`, `screens/qrpair/{GuestInviteScreen,GuestInviteViewModel,NodeMeshPairing,QrPairScreen}.kt`, Route `guest_invite` in `AppNavigation.kt` |
| Quellen der Lieferungen | `unpruuf/handover/quellen/` (siehe Punkt 4) |

## 4. Was in dieser Sitzung geliefert wurde

Alle ZIPs gingen an Gabriel im Chat. Namensschema `<Name>_<Datum>_v<N>.zip` mit `CHANGELOG.md`.

| Lieferung | Datei oder Link | Quelle im Repo |
|---|---|---|
| Website (v8 bis v11: Vorfälle-Bereich mit Dropdowns, ohne Audit-Roadmap, NexonAI-Logo oben links und als Favicon, blaues Design) | `unpruuf_Website_2026-10-19_v11.zip` | `quellen/site/unpruuf_Website_2026-10-19_v11.zip` |
| Whitepaper v1.3 (EN + RO, mit Client-App/Gäste, Ghost Mode, Kapazitäts-Anhang) | `unpruuf_Whitepaper_2026-10-18_v4.zip` | `quellen/wp/{content,build}.py` |
| Gast-Briefkästen (Bauauftrag, Server, Android-Kern, Einlade-Bildschirm, iOS-Auftrag für Norbert) | Commits `2a1da27`, `ca6efe2`, `ede3e83` | siehe Punkt 3 |
| CI-Paket (Logos, Farben, Schriften, Vorlagen, 9-seitige Richtlinie) | `NexonAI_CI_2026-10-19_v1.zip` | `quellen/ci/` |
| Leadliste safeline (Rumänien, Umkreis Alba Iulia/Sibiu/Cluj, mit Ansprechpartnern und Anschreiben RO/EN) | `unpruuf_Leads_safeline_2026-10-19_v1.xlsx` | `quellen/leads/build.py` |
| Hospital Use Cases (EN, Team-Artefakt) | https://claude.ai/artifact/XCbYQh7Z8UGUCU1fuCtCRL | `quellen/hosp/` |
| Krankenhaus-Ideen Deutschland (DE, HinSchG, KRITIS, NIS2UmsuCG) | https://claude.ai/artifact/SHEua54VTVpR93MaNVyU2w | `quellen/hosp/build_de.py` |
| Architektur-Animation (interaktiv, EN/RO) und Videos | https://claude.ai/artifact/GeinMWzZomAMj5DiBefYV3, `unpruuf_Architekturvideo_2026-10-19_v1.zip` | `quellen/arch/` |
| Compliance-Video (safeline, 72 s, EN + RO, ohne Ton) | `safeline_Compliance_Video_2026-10-19_v1.zip` | `quellen/comp/` |
| Dokumentvorlagen: Dokument + Brief (DE/EN/RO), Oferta + Factura (RO), Proposal + Invoice (EN) | `NexonAI_Vorlagen_Komplett_2026-10-19_v2.zip` | `quellen/tpl/` (`build.py`, `build2.py` RO, `build3.py` EN) |
| Higgsfield-Prompts für ein Architekturvideo, Aussagen für das erste Audit | nur im Chat | siehe Punkt 7 |
| Auf `android` (andere Sitzung): Audit-Briefs Node-Server und Android-App | https://claude.ai/artifact/TYwYRrCDA4d1YZFDNpD8q6 | Commit `412caa2` |

## 5. Entscheidungen und Regeln dieser Sitzung

- **Design blau statt türkis** (19.10.): Akzent `#307098`, hell auf dunkel `#90c8e8`, dunkle Flächen `#0f2a3a`, Warnung/Pilot `#a8500f`. In `CLAUDE.md` und `design/` umgesetzt (Commit `cb91bf2`). Ältere Artefakte sind noch türkis, Umstellung auf Wunsch.
- **Lizenzmodell erweitert** (17.10.): 250 virtuelle Nodes mit je bis zu 100 Slots pro Server, beliebig viele Server parallel, 1 Lizenz = 1 Server. Steht in `unpruuf/CLAUDE.md`.
- **Gast-Briefkästen**: kostenlose Client-App nur auf Einladung. Gast-Token ist zustandslos (HMAC, HKDF-SHA256, `Authorization: Guest <b64url(grant)>.<b64url(mac)>`), Server-Option `GUEST_GRANTS` standardmäßig aus, Kontingent im Speicher, nichts Persistentes. Verlängerung per `GRANT_RENEW`-Nachricht ist **nicht gebaut**.
- **Ghost Mode**: das Telefon wird vorübergehend zum Briefkasten mit eigener Adresse, beim Schreiben kein ausgehender Verkehr, nur beim Abholen.
- **Keine Zuweisungen an Gabriel, Norbert, Floretta** in Dokumenten und Artefakten, nur „das Team“.
- **Antwortstil**: nie mit „Gabriel, “ beginnen, erst das Verlangte liefern, eigene Meinung zuletzt und abgesetzt.
- **Rumänien**: Gesetz 361/2022 (50 bis 249 Beschäftigte seit 17.12.2023), Bußgeldhöhen in den Quellen widersprüchlich, nie nennen. Rechnungen zwischen rumänischen Firmen laufen über RO e-Factura (seit 1.7.2024 Gültigkeitsbedingung), Übermittlungsfrist uneinheitlich: Buchhalter fragen.
- **Deutschland (Krankenhaus-Artefakt)**: HinSchG ab 50 Beschäftigten, Anonymität nach § 16 und Mitbestimmung des Betriebsrats vom Anwalt prüfen lassen.

## 6. Stand Gast-Briefkästen

- Server (Einzel-Node-Server): Gast-Token, Kontingent, Scope-Prüfung, 37 Tests bestehen.
- Android: Kotlin-Kern (Token, Scope, Einladung) mit 15 JVM-Tests bestanden. **Dateien, die Android-Klassen nutzen, sind nie kompiliert** (kein Android SDK in der Sitzung): in Android Studio bauen.
- iOS: Bauauftrag für Norberts Claude Code liegt vor, nichts gebaut.
- Offen: Portierung in den 250×100-Server, Speichern und Importieren der Token im Client, Verlängerung (`GRANT_RENEW`), Gast-Richtlinie in Control, Prüfskripte (Evidence).

## 7. Aussagen für das erste Audit (Ergebnis des Brainstorms, 19.10.)

Server: S1 keine Schlüssel, Inhalt nicht lesbar. S2 Paket nach höchstens 24 h unwiederbringlich weg (Speicher, Platte, Logs, Swap). S3 keine Identitäten. S4 nur über Tor erreichbar, keine IP-Logs. S5 alle Pakete gleich groß, nichts verrät die Länge (Prüfstein für F1). S6 die 250 virtuellen Nodes entstehen deterministisch, ohne Zustand pro Nutzer, nicht verknüpfbar. S7 keine ausgehenden Verbindungen, keine Telemetrie. S8 Lizenz offline.
App: A1 aller Verkehr über Tor, bei Ausfall nichts gesendet. A2 keine Identität. A3 Node-Listen enthalten keine Geheimnisse. A4 schreibt nur auf eigenen Node, liest nur von den Nodes des Kontakts. A5 Schlüssel nur im Keystore, lokale Daten verschlüsselt. A6 Ghost Mode: beim Schreiben kein ausgehender Verkehr.
„Was wir nicht behaupten“: Timing und Metadaten, beschlagnahmtes oder infiziertes Gerät, Angriffe auf Tor, Perfect Forward Secrecy solange nicht belegt, Gast-Briefkästen und Press. Wortlaut: „Durchgang, keine Ablage“ statt „reiner Durchlauf“.

## 8. Offene Punkte, nächste Schritte (Vorschlag)

1. **Branches zusammenführen** (Punkt 2) und Hauptlinie festlegen.
2. **F1 klären** (Widerspruch zwischen „läuft schon“ und `F1_ENTSCHEIDUNG.md`), danach Aussagen S5/S6 belegen. Auditor erst auf eingefrorenem Commit.
3. **250×100-Server ins Repo** bringen oder bestätigen, wo er liegt, dann das Gast-Modul portieren.
4. **Echter Tor-Test** der App und des Servers (Aussage A1, S4), bevor Videos und Seiten „über Tor“ öffentlich versprechen.
5. **Client**: Token speichern/importieren, `GRANT_RENEW`, Control-Richtlinie. Android in Android Studio kompilieren.
6. **Rumänisch** von einem Muttersprachler prüfen lassen (Website, Whitepaper, Videos, Vorlagen).
7. **Firmendaten** für die Vorlagen: CUI, Reg.-Nr., USt-IdNr., Adresse, Bank, IBAN, BIC einmal in die `dotx`-Vorlagen eintragen oder nachreichen.
8. **Juristisch**: Markenrecherche „safeline“ (Kollision mit Chaitin-Firewall), Impressum und Datenschutz (nur Deutsch), HinSchG § 16 und Betriebsrat (DE), Anonymität nach Gesetz 361/2022 (RO).
9. **Vertrieb**: Leadliste abarbeiten, ersten Piloten finden (privates oder kirchliches Haus in DE, Firmen im Raum Alba Iulia/Sibiu/Cluj), Videos auf 15-Sekunden-Schnitt für Mails kürzen.
10. Ältere Artefakte auf Blau umstellen, wenn gewünscht. Fußzeile der Website auf Wortmarke prüfen.

## 9. Nicht getestet (ehrlich sagen)

Android-Dateien mit Android-Klassen (nicht kompiliert). Tor gegen das echte Netz. Rumänische Texte. Dokumentvorlagen nur in LibreOffice als PDF geprüft, nicht in Word. Videos nur als Einzelbilder angesehen. Press ist Pilot. Kein unabhängiges Audit, nichts „zertifiziert“, „DSGVO-konform“, „unknackbar“, „als Erste“, „sicherer als“.

## 10. Technik und Stolpersteine

- Bau der Lieferungen: Skripte in `quellen/`, Python mit `python-docx`, `Pillow`, `openpyxl`, `fontTools`; Videos mit Playwright (Node, `/opt/node-tools`) und `ffmpeg`; Chromium unter `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Fenster höher als das Ziel einstellen und danach zuschneiden. Schriften vorher installieren (`~/.fonts`: Open Sans, DejaVu Sans Mono aus dem CI-Paket).
- Zeitgesteuerte Animationen (`quellen/arch`, `quellen/comp`) laufen über `window.__setT(t)`, damit Einzelbilder reproduzierbar sind; Video = 25 Bilder je Sekunde, dann `ffmpeg`.
- Artefakte: neue Seiten mit `design/kit.py` (`page`, `hero`, `section`, `card`, `E`), dann Artifact-Tool. Die Sitzung hält höchstens 10 Überwachungen (Watches); beim Veröffentlichen eines elften Artefakts erst eine ältere beenden. Beendet wurde in dieser Sitzung `HDZZsGfLvMvLBEGcmr8hVs`.
- Android: nur reine Kotlin-Tests per temporärem Gradle-Projekt (`/tmp/kt`), Node-Server: `cd unpruuf/node-mesh-server && npm install && npm test`.
- Python-Platzhalterfelder in den Vorlagen: eckige Klammern, kursiv, grau; gemischter Text wird über `rich()` gesetzt (Fehler „letztes Zeichen fehlt“ war in v1, in v2 behoben).

## 11. So startest du

**Claude Code im Repo:** Sitzung im Repo öffnen (CLAUDE.md wird geladen), dann den Prompt unten einfügen.

**Normaler Chat:** Prompt einfügen und diese Datei, `CLAUDE.md`, `unpruuf/CLAUDE.md` sowie je nach Thema `unpruuf/GUEST_LOCKERS_BUILD_SPEC.md`, `unpruuf/handover/F1_ENTSCHEIDUNG.md` (Branch `android`) anhängen.

### Prompt für den neuen Chat

```
Hallo, ich bin Gabriel Hategan, NexonAI Consulting SRL, Alba Iulia. Wir arbeiten seit Wochen zusammen an unpruuf. Du kennst mich als alten, ehrlichen Freund: kurze Antworten, Du-Ansprache, nie mit "Gabriel, " beginnen, erst genau das liefern, was ich verlange, eigene Meinung zuletzt und klar abgesetzt. Wenn ich sage "mach xy", stellst du nicht in Frage, warum.

Lies zuerst:
1. CLAUDE.md (Wurzel) und unpruuf/CLAUDE.md
2. unpruuf/handover/UEBERGABE_2026-10-20.md (Stand, Warnungen, offene Punkte)
3. Auf dem Branch android: unpruuf/handover/UEBERGABE_2026-10-14.md, LIEFERUNGEN.md, F1_ENTSCHEIDUNG.md

Wichtig vorab:
- Die Branches ccr-9a899f8d-xrqsp0 und android sind auseinandergelaufen, zuerst klären/zusammenführen.
- F1 (Länge im Klartext): Widerspruch zwischen "läuft schon" und F1_ENTSCHEIDUNG.md klären, bevor etwas "alle Pakete gleich groß" behauptet.
- Kundenmaterial EN + RO, zuerst "Wie unpruuf funktioniert" (Briefkasten, ohne Zahlen). Nie zertifiziert, DSGVO-konform, unknackbar, als Erste, sicherer als. Nicht auditiert, Press ist Pilot.
- Artefakte im NexonAI-Blau mit design/kit.py. Keine Zuweisungen an Personen, nur "das Team".
- Mehrere Dateien als ZIP mit CHANGELOG.md.

Heute will ich: [HIER EINTRAGEN]
```
