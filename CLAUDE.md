# Arbeitsregeln für dieses Projekt (Gabriel Hategan, NexonAI Consulting SRL)

Diese Datei wird in jeder neuen Sitzung geladen. Sie hält fest, was Gabriel ausdrücklich verlangt hat.

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
- Lieferungen mit mehreren Dateien als ZIP mit CHANGELOG.md, Namensschema `unpruuf_<Datum>_v<N>.zip`, bei Sondereditionen mit dem Editionsnamen im Dateinamen (zum Beispiel `unpruuf_TorClientEdition_<Datum>_v<N>.zip`). Branch `android` für die Hauptlinie. Die Tor Client Edition liegt auf dem Branch `tor-client-edition` und wird nur auf ausdrücklichen Wunsch gepusht.
- Dokumente im Chat nur als Text anzeigen, ohne Erklärungen drumherum. Kurze Antworten, Du-Ansprache, Gabriel beim Namen nennen.
- Ehrlichkeit zuerst: nicht auditiert, Pilot, nicht gegen echtes Tor getestet, solange das stimmt. Nie „zertifiziert“, „unknackbar“ oder „DSGVO-konform“ behaupten.
- Protokolldetails nicht öffentlich nennen (Patentprüfung läuft).
- Floretta (Marketing) spricht nur Englisch. Alles, was für Floretta bestimmt ist oder an dem sie beteiligt ist (Erklärungen, Texte, Briefings, Kampagnen, Seiten), automatisch auf Englisch liefern, ohne Nachfrage. Für Gabriel selbst bleibt die Antwort im Chat auf Deutsch.
- Vor jeder Aussage über Gesetze und Fristen (zum Beispiel das EU-Hinweisgebergesetz) die Fakten prüfen. Stand der Prüfung vom 8.10.2026: Die EU-Richtlinie 2019/1937 gilt für Unternehmen ab 50 Beschäftigten bereits. In Rumänien gilt das Gesetz 361/2022 seit Dezember 2022 (50 bis 249 Beschäftigte: seit 17.12.2023). Es gibt keine neue Frist zum Jahresende.
- „Kontakte gibt es nicht“ und „Server startet alle 24 Stunden neu und löscht damit alles“ stimmen so nicht. Kontakte gibt es nur lokal auf dem Gerät, ohne Verzeichnis im System. Gelöscht wird durch den Ablauf der Lebensdauer (höchstens 24 Stunden), nicht durch einen Neustart.

