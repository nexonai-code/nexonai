# Übergabe für einen neuen Chat — Stand 22. Oktober 2026

Für Gabriel und für jede neue Claude-Sitzung. Beschreibt den Stand nach den Sitzungen vom 21. und 22.10.2026. Ersetzt die Übergabe vom 20.10. als erste Lektüre (die Datei `UEBERGABE_2026-10-20.md` bleibt für die Zeit davor gültig). **Die `CLAUDE.md` im Wurzelordner verweist noch auf die Übergabe vom 20.10.; für den aktuellen Stand gilt diese Datei.** Danach `LIEFERUNGEN.md`, bei Bedarf `F1_ENTSCHEIDUNG.md`.

---

## 1. In einem Absatz

NexonAI (Gabriel Hategan, alleiniger Mitarbeiter, Alba Iulia) baut **unpruuf**: Kommunikation ohne Identitäten, mit Server beim Kunden. Produkte: **unpruuf Business** (Hauptprodukt), **safeline** (Compliance), **safeline Press** (Journalisten, Pilot). Hauptlinie ist der Branch `android`. `main` ist per Vorspulen auf demselben Stand (Regel: nach jedem Push `git push origin android:main`). Stand zum Ende: `android` = `main` = `682b5ce`, Arbeitsbaum sauber. Alles ist getestet gegen Module und Tests, **nichts auf einem echten Telefon und nichts gegen das echte Tor-Netz**. Nicht auditiert.

## 2. Zuerst wissen

1. **Der Telefon-Test fehlt.** Press (Pairing, Meldung, Antwort) und alles andere lief nur in Tests. Vor dem Pilot bei Alba Carolina TV zuerst Pro und Press auf dem Pixel 9 Pro durchspielen.
2. **F1 ist offen, und es gibt einen Widerspruch.** Gabriel sagte, ausgehende Pakete seien alle 4096 Byte und es „läuft schon“. Im Code steht die Länge weiter im Klartext im gespeicherten Paket (für den Server-Betreiber lesbar, für Beobachter im Netz nicht). `F1_ENTSCHEIDUNG.md`: Gabriel hat „noch nicht“ gesagt, **am Wire-Format nichts ändern**, bis das Team zugestimmt hat. Vorher nicht „alle Pakete gleich groß, Länge verborgen“ behaupten.
3. **Zwei `CLAUDE.md`-Regelwerke.** Wurzel `CLAUDE.md` (von `android`) und `unpruuf/CLAUDE.md` (von der Press-Linie) gelten beide und widersprechen sich teils (250 Nodes gegen 250 Nodes mit je 100 Slots; Bildsprache Briefkasten gegen Kurier). Das Zusammenlegen hat der Sicherheitsfilter der Sitzung blockiert und wurde nicht umgangen. Das Team legt sie zusammen. Die neueren Regeln (Kurier-Bild seit 14.10., Antwortstil, keine Zuweisungen an Personen) stehen im `unpruuf/CLAUDE.md` und in der Übergabe vom 21.10. der Press-Sitzung.
4. **Die Website ist nicht die v11.** `unpruuf/website/` (v12) wurde auf Basis der `web.zip` von Gabriel gebaut (Stand v8). Logo und Blau sind neu gebaut, nicht aus v11 übernommen. Gabriels `unpruuf_Website_2026-10-19_v11.zip` liegt nur in seinem Chat. Nicht live, Impressum und Datenschutz haben offene Platzhalter.
5. **Sicherheitstest-Bericht bleibt bei Gabriel**, nicht im Git. Befunde im Chat nicht in Dateien schreiben, die committet werden.
6. **Release-Passwort** noch nicht geändert (`passwort-aendern.bat`). Test- und Release-Schlüssel liegen nur bei Gabriel (`*.jks`, `keystore.properties`, `release.properties` bleiben außerhalb von Git).

## 3. Was in den beiden Sitzungen entstand

| Bereich | Ergebnis |
|---|---|
| Branches | `ccr-9a899f8d-xrqsp0` (Press, Gast-Briefkästen, Design-Kit) in `android` zusammengeführt. Officer-App komplett von der Press-Linie. Gast-Anbindung auf den aktuellen Node-Server portiert (`depositAuth.ts` folgt dem rotierenden Besitzer-Geheimnis, 423 bei gesperrtem Server). Android: Gast-Einladung ohne `userId`. Der Hilfsbranch `merge-press` kann gelöscht werden. |
| Sicherheit | **OFF-1:** Officer-Dashboard hört nur auf `127.0.0.1`, Host-Prüfung, Schutz gegen fremde Seiten, kein CORS, optionales Passwort (`OFFICER_BIND_HOST`, `OFFICER_ALLOWED_HOSTS`, `OFFICER_DASHBOARD_PASSWORD`, ab 12 Zeichen; ohne Passwort startet es nicht im Netz). **OFF-2:** Identitätsdatei 0600. Temp Node: Verbindungen nach `stop()` werden verworfen (`PhoneTempNode.acceptLoop`). |
| Tests (gemessen 22.10.) | Node-Server 123 bestanden, 1 übersprungen. App 181 je Edition (Standard, Pro, Client, Group, Whistleblower, Press). Officer-App 28. Android-Node 15. |
| APKs | Sieben Debug-APKs (arm64, Testschlüssel `77:D3:B8:93…D3`, nicht `testOnly`), Stand `3c111f1`, **vor** dem Temp-Node-Fix. |
| iOS | `unpruuf/ios/IOS_GLEICHSTAND_FUER_NORBERT_2026-10-21.md`, per Mail an norbert@nexonai.ro geschickt. |
| Decks | Neue Folie „Nie wieder die Telefonnummer herausgeben“ als Folie 7 im Business-Deck (RO, DE, neu EN, 18 Folien). Quelle `presentations/decks2.py`, Englisch in `decks2_en.py`. Testzahlen in Business und Compliance korrigiert. Export in `presentations/export/`. |
| Website | `unpruuf/website/` v12: NexonAI-Logo, Blau, neuer Abschnitt (DE/EN/RO). |
| Artefakt | Tagesabschluss: https://claude.ai/artifact/JZh8xsHJ7wyLEMsMowipZD |

Alle ZIPs und APKs gingen an Gabriel im Chat und liegen nicht im Repo (siehe `LIEFERUNGEN.md`).

## 4. Offen, in Reihenfolge

1. **Telefon-Test** mit Pro und Press (Pixel 9 Pro, Galaxy S23 Ultra). Danach neue APKs mit dem Temp-Node-Fix bauen (`-Pandroid.injected.build.abi=arm64-v8a -Pandroid.injected.testOnly=false`).
2. **Website:** Gabriel schickt `unpruuf_Website_2026-10-19_v11.zip`, dann Stand abgleichen. Hosting-Adresse klären, Platzhalter in Impressum und Datenschutz füllen.
3. **Tippseite mit echten Codes:** braucht `tip-page-codes.txt` aus Gabriels Press-App (`start-press.bat`, Investigații, „Descarcă lista de coduri“), Redaktionsname, Sprache. Den Tippseiten-Baukasten gibt es nur im ZIP `unpruuf_PressOberflaeche_2026-10-21_v1.zip` (Gabriel hat es hochgeladen). Der Press-Ein-Seiter muss aktualisiert werden (Tippseite und Code pro Recherche sind jetzt gebaut); die Quelle (`safeline_Press_EinSeiter_2026-10-21_v1.zip`) fehlt.
4. **Befunde aus dem Sicherheitstest:** AND-1 (SQLCipher-Schlüssel im Klartext), REL-1 und REL-2 (Relay ohne Gesamtgrenze, Pakete im Log), AND-4, AND-3, AND-2, CLM-1/A19, SRV-1. Reihenfolge war Gabriel nicht bestätigt.
5. **F1** und die zwei Regelwerke im Team klären, vor dem Audit.
6. **Material:** Statusfolien nennen jetzt korrekte Zahlen; Postamt-Bild ist noch nicht auf das Kurier-Bild umgestellt. Rumänisch ist nirgends von einem Muttersprachler geprüft. Die Online-Links in `presentations/README.md` zeigen die alten Artefakte.
7. **iOS** liegt bei Norbert (Zweig `ios` mit `android` zusammenführen, Sicherheitsangleichung, Pro Groups erst nach Teamentscheid).
8. **Audit:** erste Runde Node-Server und Android-App (Briefs in `unpruuf/evidence/`), Code vorher einfrieren; iOS nicht dabei.

## 5. Technik und Stolpersteine

- **Android bauen:** `cd unpruuf && ./gradlew --offline :app:test<Flavor>DebugUnitTest` (Flavors: Standard, Pro, Client, Group, Whistleblower, Press). Debug-APKs über `-Pandroid.injected.testOnly=false`, sonst „App nicht installiert“. APKs liegen unter `app/build/intermediates/apk/<flavor>/debug/`. Lint-vital offline überspringen. Nie Gradle in `head` pipen. Der Test `PhoneTempNodeTest` war wackelig und ist behoben (Ursache: spät angenommene Verbindung).
- **Node-Server:** `cd unpruuf/node-mesh-server && npm install && npm test`. **Officer-App:** `cd unpruuf/officer-app && npm install && npm test`. Start: `OFFICER_EDITION=press npm start` oder `start-press.bat`.
- **Decks:** `cd unpruuf/presentations && python3 decks2.py`, rendern mit `NODE_PATH=/opt/node22/lib/node_modules node render.js <ordner> <png-ordner>` (Playwright, Chromium unter `/opt/pw-browsers/chromium`), exportieren mit `python3 export2.py <png-wurzel> export`. Dem Export nur die Ordner geben, die sich geändert haben. `export2.py` kennt jetzt `business_en`. Die Schrift im Render ist eine Ersatzschrift (Fonts von Google werden nicht geladen).
- **LibreOffice** kann in dieser Umgebung keine PPTX öffnen („source file could not be loaded“). PDF und Bilder daher über Chromium rendern.
- **Website:** statisch, kein Build, drei Sprachen im selben HTML (`data-i18n-de/en/ro`). Screenshot-Prüfung mit Playwright (`document.documentElement.dataset.lang`).
- **Artefakte:** pro Sitzung höchstens 10 Überwachungen; Kommentare erreichen die Sitzung nicht mehr.
- **Git:** Arbeit auf `android`, danach `git push origin android:main` (nur Vorspulen). Commit-Trailer `Co-Authored-By` und `Claude-Session`. `rm -rf` mit Variablen oder Platzhaltern wird blockiert, nur explizite Pfade.
- **Die `CLAUDE.md` selbst darf die Sitzung nicht überschreiben** (Filter „Selbstveränderung“). Änderungen an Regeln legt Gabriel selbst an oder gibt sie ausdrücklich frei.

## 6. Regeln, die immer gelten (Kurzfassung, Details in `CLAUDE.md`)

Nie eine Antwort mit „Gabriel, “ beginnen. Erst genau liefern, was er verlangt, Meinung zuletzt. Alles beantworten, was er fragt. Kundenmaterial Englisch und Rumänisch, Floretta nur Englisch, Deutsch nur für Gabriel. Zuerst „Wie unpruuf funktioniert“, danach keine Technik. Nie „zertifiziert“, „unknackbar“, „DSGVO-konform“, „als Erste“, „einzigartig“, „sicherer als“. Nicht auditiert, Press ist Pilot. Protokolldetails nicht öffentlich (Patentprüfung). „Das Team“ statt Namen bei Entscheidungen. Vor größeren Umbauten sagen, wie es werden soll, und auf sein Ja warten. NexonAI betreibt keine Server. Mehrere Dateien als ZIP mit `CHANGELOG.md` (`unpruuf_<Datum>_v<N>.zip`). Lebensdauer genau sagen: nach Ablauf (höchstens 24 Stunden) für niemanden lesbar und nach etwa einer Minute überschrieben.

## 7. So startest du

Sitzung im Repo öffnen und den Prompt aus `NEUER_CHAT_PROMPT.md` einfügen (er verweist auf diese Datei). Ohne Repo: den Prompt einfügen und diese Datei, `CLAUDE.md`, `unpruuf/CLAUDE.md`, `LIEFERUNGEN.md` und `F1_ENTSCHEIDUNG.md` anhängen.
