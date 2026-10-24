# Arbeitsregeln für dieses Projekt (Gabriel Hategan, NexonAI Consulting SRL)

**Gedächtnis:** `.claude/memory/MEMORY.md` ist der Index (Gabriel, Team, Arbeitsweise, Stand, Entscheidungen, offene Punkte, Orte). Nach jeder Entscheidung `decisions.md` ergänzen, am Tagesende `project_state.md` und `open_items.md` aktualisieren.

**Neue Sitzung: zuerst `unpruuf/handover/UEBERGABE_2026-10-20.md` lesen** (Stand, offene Entscheidungen, nächste Schritte), dann `unpruuf/handover/LIEFERUNGEN.md`. Quellen von Präsentation, Dokumenten, Seiten und Artefakten liegen in `unpruuf/handover/quellen`.

Diese Datei wird in jeder neuen Sitzung geladen. Sie hält fest, was Gabriel ausdrücklich verlangt hat.

## Antwortstil (von Gabriel festgelegt, 14.10.2026)

- **Nie mehr eine Antwort mit „Gabriel, “ beginnen.** Gleich die Antwort. Den Namen sonst sparsam, nie als Anrede am Anfang.
- **Alles beantworten, was er fragt, mit allen Daten, die er für seine Entscheidung braucht.** Nichts weglassen und nichts verkürzen, damit er auf besserer Grundlage entscheiden kann.
- **Zuerst genau das tun, was er verlangt hat.** Hält man es für unpassend, zu viel oder falsch, trotzdem zuerst genau so liefern und die Meinung erst am Ende sagen.

## Wenn Gabriel etwas sagt, das so nicht gesagt werden kann

Nie einfach weglassen und nie einfach abschwächen. Immer die bestmögliche Formulierung liefern, die genau das Gefühl und die Absicht seiner Aussage trägt und dabei wahr und belegbar bleibt.

Vorgehen:
1. Das Gefühl benennen, das er vermitteln will (zum Beispiel: Angreifer finden nichts, nichts bleibt liegen, wir haben keinen Zugriff).
2. Prüfen, was an der Aussage nicht stimmt oder nicht beweisbar ist (kurz, in einem Satz, vorab).
3. Eine Ersatzformulierung liefern, die dasselbe Gefühl mit wahren Mitteln auslöst, in seinem Ton.

Beispiele:
- „Es macht keinen Sinn mehr zu hacken“ wird zu „Wer einbricht, findet Datenmüll. Bei uns gibt es keinen Tresor, der sich zu knacken lohnt.“
- „Wir sind komplett ausgeschlossen“ wird zu „Wir können dein System weder lesen noch fernsteuern. Es gibt keinen Draht zu uns.“
- „Nur nicht abgeholte Daten liegen auf dem Server“ wird zu „Es bleibt nichts liegen. Alles ist nach spätestens 24 Stunden weg. Dein Server ist ein Durchgang, keine Ablage.“

## Weitere feste Regeln

- Wenn Gabriel sagt, dass er etwas will, sage ihm nie, dass du es nicht tust. Das ist nicht deine Entscheidung. Gibt es Risiken, nenne sie vorab und liefere die bestmögliche Umsetzung.
- NexonAI betreibt keine Server. Alle Server werden immer vom Kunden betrieben.
- Business ist das Hauptprodukt. Compliance nur auf Anfrage.
- Vor größeren Umbauten an dem, was schon funktioniert, sagen, wie es werden soll, und auf sein Ja warten. Der Kern bleibt klein und einfach: ein Knopf, 250 Briefkästen, Liste exportieren, in der App importieren.
- Lieferungen mit mehreren Dateien als ZIP mit CHANGELOG.md, Namensschema `unpruuf_<Datum>_v<N>.zip`, bei Sondereditionen mit dem Editionsnamen im Dateinamen (zum Beispiel `unpruuf_TorClientEdition_<Datum>_v<N>.zip`). Branch `android` für die Hauptlinie. **`main` (Standard-Branch auf GitHub) wurde am 20.10.2026 auf `android` vorgespult**, damit neue Sitzungen den ganzen Stand sehen (vorher stand dort nur der Import vom 24.9. ohne `CLAUDE.md` und Übergabe). Nach jedem Push auf `android` auch `git push origin android:main` ausführen (reines Vorspulen, nie mit Gewalt). Die Tor Client Edition liegt auf dem Branch `tor-client-edition` und wird nur auf ausdrücklichen Wunsch gepusht.
- Dokumente im Chat nur als Text anzeigen, ohne Erklärungen drumherum. Kurze Antworten (aber vollständig bei Entscheidungsfragen), Du-Ansprache.
- Ehrlichkeit zuerst: nicht auditiert, Pilot, nicht gegen echtes Tor getestet, solange das stimmt. Nie „zertifiziert“, „unknackbar“ oder „DSGVO-konform“ behaupten.
- Protokolldetails nicht öffentlich nennen (Patentprüfung läuft).
- Floretta (Marketing) spricht nur Englisch. Alles, was für Floretta bestimmt ist oder an dem sie beteiligt ist (Erklärungen, Texte, Briefings, Kampagnen, Seiten), automatisch auf Englisch liefern, ohne Nachfrage. Für Gabriel selbst bleibt die Antwort im Chat auf Deutsch.
- Vor jeder Aussage über Gesetze und Fristen (zum Beispiel das EU-Hinweisgebergesetz) die Fakten prüfen. Stand der Prüfung vom 8.10.2026: Die EU-Richtlinie 2019/1937 gilt für Unternehmen ab 50 Beschäftigten bereits. In Rumänien gilt das Gesetz 361/2022 seit Dezember 2022 (50 bis 249 Beschäftigte: seit 17.12.2023). Es gibt keine neue Frist zum Jahresende.
- „Kontakte gibt es nicht“ und „Server startet alle 24 Stunden neu und löscht damit alles“ stimmen so nicht. Kontakte gibt es nur lokal auf dem Gerät, ohne Verzeichnis im System. Gelöscht wird durch den Ablauf der Lebensdauer (höchstens 24 Stunden), nicht durch einen Neustart.
- Lebensdauer genau sagen: Nach Ablauf (höchstens 24 Stunden, Standard 6) ist ein Paket für niemanden mehr lesbar und wird binnen etwa einer Minute auch aus den Dateien überschrieben. „Alles ist nach spätestens 24 Stunden weg“ stimmt im Alltag, die genaue Fassung steht in `SECURITY_CLAIMS.md`.
- Pro Groups: „bis zu 10 Mitglieder“ heißt 10 inklusive dir, also 9 andere.
- Nachrichten, die nicht gesendet werden können (kein Tor, Node nicht erreichbar), warten nur im Speicher; wird die App beendet, sind sie weg. Das ist Folge von „nichts auf der Platte“ und wird so gesagt.
- **Offene Entscheidung F1 (Stand 19.10.2026):** Die Länge steckt im gespeicherten Paket im Klartext (Betreiber sieht Länge und erkennt Füllverkehr). Empfehlung ist, das Auffüllen vor die Verschlüsselung zu ziehen (ein Umstieg für alle Clients, Server unverändert, iOS bei Norbert). Gabriel hat „noch nicht“ gesagt: **nichts ändern**, bis das Team zugestimmt hat. Plan und Alternativen: `unpruuf/handover/F1_ENTSCHEIDUNG.md`. Wenn die Rede auf Audit oder Wire-Format kommt: Vorher an F1 erinnern, weil das Audit das Endformat prüfen soll.
- Das Team sind Gabriel, Norbert und Floretta. Entscheidungen, Aufgaben und offene Punkte in Texten und Dokumenten immer als „das Team“ oder „wir drei“ formulieren, nie als „Gabriel entscheidet“. Rollen nicht erfinden, solange sie nicht genannt wurden.
- Rollen im Team: Gabriel ist der kreative Teil, denkt die Tools durch und baut sie. Norbert macht Verwaltung, Strategie und derzeit alles rund um iOS. Floretta macht Marketing, Business Development und Netzwerk. Aufgaben und Verantwortliche in Dokumenten entsprechend vorschlagen und als Vorschlag kennzeichnen, die Entscheidung trifft das Team gemeinsam. iOS-Folgen jeder Änderung (Lizenzformat, Module, Texte) immer mitdenken und Norbert zuordnen.
- Lizenzmodell (Stand 8.10.2026, von Gabriel bestätigt): Der Kunde kauft Server-Lizenzen. 1 Lizenz = 1 Server = 250 Nodes (Briefkästen). 10 Lizenzen = 10 Server = 2500 Node-Adressen. Der Android-Node erzeugt genau 1 Node. Temp Nodes (Android und Windows) erzeugen genau 1 Node für vorübergehende Abschirmung. Server-Lizenzcodes sind technisch nicht an eine Maschine gebunden, „ein Server pro Lizenz“ steht im Vertrag. **App-Lizenzen dagegen sind an das Gerät gebunden** (die erste Aktivierung bindet den Code; bei einem verlorenen oder ersetzten Telefon braucht es einen neuen Code). Nie sagen, App-Codes ließen sich frei zwischen Telefonen verschieben. Server sind fest auf 250 Nodes gedeckelt, das ist keine Einstellung, damit die Nodes kein Maximum verwalten müssen (die Lizenz kann weniger erlauben, zum Beispiel eine Testlizenz; Control warnt beim Import). In der Chat-App verwaltet der Nutzer Node-Listen und wählt je Kontakt einen Pool (Liste), daraus werden dem Kontakt 3 Nodes zugewiesen. Die App hält höchstens 1000 eigene Nodes pro Gerät. Das reicht, weil jeder Nutzer nur die Listen bekommt, die er braucht (Export-Datei oder Firmen-Feed). Nur anheben, wenn eine einzelne Person mehr als vier Server in einer App braucht.

- **Lizenz-Vorrat statt Pool, Control beim Kunden (13.10.2026, von Gabriel bestätigt):** Der Kunde bekommt von uns einen Satz gewöhnlicher Codes (`issue-server.js --count N` für Server, `issue.js --count N` für Apps), und „unpruuf Control“ (Ordner `unpruuf/control/`, läuft auf dem Admin-PC des Kunden) verwaltet und verteilt sie an Server und Geräte. Kein Zertifikats-Pool, kein neues Lizenzformat (iOS bleibt unberührt). Control ist Buchführung, kein Kopierschutz; „ein Server pro Lizenz“ bleibt im Vertrag. Eine zweite Installation derselben Lizenz wird im Tool gemeldet, eine Tor-Warnung bei Doppelinstallation ist als spätere Stufe vorgesehen (nur Warnung, kein hartes Verbot, weil ein Ersatzserver in einer Panne nie blockiert werden darf).

## Sprachen und Aufbau aller Kundenmaterialien (von Gabriel festgelegt, 10.10.2026)

- Deutsch ist nur Gabriels Bequemlichkeit im Chat. Alles, was ich erstelle (Seiten, Decks, Dokumente, Texte, Angebote, Artefakte), kommt immer auf **Englisch und Rumänisch**. Deutsch nur zusätzlich, wenn er es für sich braucht. Nicht nachfragen.
- **Aufbau für jede Lösung, jede Branche, jedes Kundenmaterial:** Zuerst „Wie unpruuf funktioniert“ (Briefkastenbild, ohne Zahlen, Stand 12.10.2026: zwei Teile, App und eigener Server des Kunden, keine Identitäten, „mein Server, meine Regeln“, ich schreibe nie direkt, sondern lege auf dem eigenen Server ab und gebe dem Kontakt die Daten zum Abholen, reziprok, ich adressiere niemals andere, Liegengebliebenes höchstens 24 Stunden alt). Die Zahlen 250 Briefkästen und 3 pro Kontakt kommen nur auf Nachfrage oder im Gespräch nach dem Vortrag. Voraussetzung für alles, ganz am Anfang nennen: Jeder Kunde betreibt seine eigenen Server, sonst sind Dritte eingebunden. Das Kapitel ist die Basis und soll in wenigen Minuten verstanden sein. Danach kommt je Bereich oder Branche die Lösung.
- **Bildsprache seit 14.10.2026 (von Gabriel festgelegt):** kein Postamt und keine Briefkästen mehr in neuem Material. Stattdessen ein **eigener Kurierdienst**: 250 Paketautomaten (wie easybox), jeder mit etwa 100 Fächern. Wer den richtigen Automaten hat und seinen Abholcode zeigt, bekommt das Paket; wer noch den zweiten Schlüssel hat, kann den Inhalt lesen. Man kann beliebig viele Dienste gleichzeitig laufen lassen und alles untereinander nutzen. In dieser Erklärung stehen die Zahlen 250 und 100, weil Gabriel sie so verlangt; „100 Fächer“ ist eine Planungszahl (rechnerisch, nicht unter Last gemessen) und wird so gekennzeichnet. Das Bild ist ein Bild: im Code sind die 250 Adressen eines Servers Zugänge zu einem gemeinsamen Speicher mit einer gemeinsamen Obergrenze (200 000 Pakete), keine getrennten Automaten. Nicht so darstellen, als wären die Automaten voneinander isoliert oder hätten je ein eigenes Fachlimit. Bestehende Decks, Seiten und Dokumente mit Briefkasten/Postamt sind noch nicht umgestellt. Vorlage: `unpruuf/handover/quellen/seite-in-klaren-worten/build_kurier.py`.
- **Nach dem Verständnis keine Technologie mehr.** Die Lösungsteile reden nur darüber, was der Kunde damit tun kann (Abläufe, Ergebnisse, Alltag), nicht über Briefkästen, Schlüssel oder Tor. Technik nur auf ausdrückliche Nachfrage oder in einem getrennten Anhang.
- Die Basistexte stehen in `unpruuf_Story_DE/EN/RO.docx` und in der Landing-Page-Story (Postamt). Neue Materialien übernehmen sie unverändert oder gekürzt, nicht neu erfunden. Protokolldetails bleiben draußen (Patent).
- Das Whistleblower-Tool heißt **unpruuf Compliance**, das Presse-Produkt **unpruuf Press** (Entscheidung von Gabriel vom 22.10.2026). Der Name „safeline“ entfällt in allem Sichtbaren und wird nicht mehr verwendet. In neuem Kundenmaterial so nennen, nicht „Whistleblower“. Das Grundsystem heißt weiter unpruuf („Wie unpruuf funktioniert“). Deck: Quelle `unpruuf/presentations/safeline.py` (technischer Name, bleibt), Export `presentations/export/unpruuf_Compliance_Kundendeck_EN/RO.pdf/.pptx`. Technische Namen (Paket-IDs, Ordner `safeline_en/ro`, interner Produkttyp `safeline` in Control) bleiben, damit Updates und gespeicherte Daten weiterlaufen.
- Newsletter-Anmeldungen und Newsletter-Anfragen gehen an **unpruuf@nexonai.ro** (Festlegung vom 11.10.2026). Die Landing Page hat dafür einen Abo-Knopf als E-Mail an diese Adresse, ohne Server-Formular. Der Datenschutztext muss den Newsletter nennen (Einwilligung, Abmeldung per E-Mail), sobald klar ist, womit versendet wird.

## GDPR (11.10.2026)

- Nie „GDPR-konform“ behaupten. Sagen: Die Architektur unterstützt die Prinzipien (Datenminimierung, Speicherbegrenzung, Vertraulichkeit, Art. 5, 25, 32). Die Organisation ist Verantwortliche (Art. 4 Nr. 7). NexonAI ist normalerweise nicht Auftragsverarbeiter (Art. 28), solange kein Datenzugriff besteht. Einordnung bestätigt ein Jurist oder der Datenschutzbeauftragte.
- Datenlandkarte: Server = verschlüsselte Pakete höchstens 24 h, keine Namen/IPs; Telefon = lokal; Officer-Laptop = Falldateien lokal verschlüsselt; Lizenz = offline; Website = keine Cookies.
- Hinweisgeber: Richtlinie 2019/1937 Art. 16 (Vertraulichkeit), 17 (DSGVO gilt, Irrelevantes löschen), 18 (Aufbewahrung nur so lange nötig).
- Officer-Dashboard: Einzelfall löschen und als Datei exportieren gibt es seit 19.10.2026 (beide Editionen, getestet). Noch offen: ein Export über alle Fälle, und die Fehlermeldungen des Servers sind nur rumänisch (die Oberfläche selbst ist RO/EN).
- Material: Deck-Folie 11 (GDPR), Whitepaper Kapitel 9, Landing-Page-Bereich GDPR (RO/EN).

## Produkte und Stand (12.10.2026, von Gabriel bestätigt)

- Drei Produkte auf demselben System: **unpruuf Compliance** (Whistleblower-Tool), **unpruuf Business** (interne Kommunikation), **unpruuf Press** (Journalisten).
- Stand: Compliance und Business sind getestet und funktionieren. Ein unabhängiges Audit steht an. Bis dahin: nicht auditiert, nicht zertifiziert. unpruuf Press ist eine Pilotversion, nicht mit einer echten Quelle getestet.
- Folien und Seiten: Briefkastenbild ohne Zahlen (kein 250, kein 100 pro Node), „Was der Server weiß“, „Nur der Kunde hat seine Daten“. Business-App hat heute nur eine englische Oberfläche (Rumänisch nur in unpruuf Compliance und Press). Die Einrichtungsseite des Node-Servers ist deutsch.
- Telefon-Bilder in Decks sind Nachbauten und so zu kennzeichnen, bis echte Aufnahmen vorliegen.

## Wettbewerb und Aussagen (12.10.2026)

- Nie „als Erste“, „einzigartig“, „sicherer als …“ sagen. Jedes Einzelteil gibt es bei anderen (SimpleX, Session, Briar, Cwtch, Threema OnPrem, Wire, Matrix, SecureDrop, GlobaLeaks, EQS). Wir dürfen sagen: fertige Produkte für Compliance, Presse und Firmen auf einem System, Server immer beim Kunden, keine Identitäten, Tor von Anfang an. Vergleich: `Wettbewerbsvergleich_2026-10-12`.
- Rumänien, anonyme Meldungen: Stand ungeklärt (Änderungsantrag zum Gesetz 361/2022). Nie behaupten, anonyme Meldungen seien vorgeschrieben, ohne den aktuellen Text geprüft zu haben.
