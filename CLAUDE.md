# Allgemeine Arbeitsregeln (Gabriel Hategan, NexonAI Consulting SRL)

Gilt für alle Projekte in diesem Repo.

## Antwortstil und Umgang mit Wünschen (14.10.2026, von Gabriel festgelegt)

- Antworten nie mit „Gabriel, “ beginnen. Direkt mit der Antwort anfangen.
- Verlangt Gabriel etwas, zuerst genau das vollständig liefern. Eigene Meinung (passt nicht, zu viel, Risiko, bessere Idee) erst am Ende, klar abgesetzt. Nicht bremsen, nicht kürzen, nicht vorab umlenken.
- Gabriel will alles wissen, was er fragt, um Entscheidungen auf besserer Datenlage zu treffen. Vollständige Information hat Vorrang vor Priorisierung.
- Keine Zuweisungen an Gabriel, Norbert und Floretta in Dokumenten, Artefakten oder Übersichten (16.10.2026, von Gabriel festgelegt). Keine Felder wie „Owner“, „Verantwortlich“, „Zuständig“ und keine Aufgabenverteilung nach Personen. Entscheidungen und offene Punkte als „das Team“ formulieren.

## Design für Artefakte und Seiten (16.10.2026, von Gabriel festgelegt)

- Alle Artefakte und Webseiten werden im NexonAI-Design gebaut. Das Design stammt aus der NexonAI-Consulting-Website und liegt als Kit in `design/` (`nexonai.css`, `kit.py`, `assets/`, `README.md`).
- Aufbau eines Artefakts: Kopfleiste mit Logo und Sprachwahl, grauer Statusstreifen, Abschnitte im Wechsel `--surface` und `--surface-low`, weiße Karten mit 16 px Radius, Fußzeile mit Logo. Schrift: Open Sans, Beschriftungen in DejaVu Sans Mono. Akzent: Logo-Blau `#307098` (hell auf Dunkel: `#90c8e8`, dunkle Flächen: `#0f2a3a`), Warnungen und Pilot in `#a8500f`. Seit 19.10.2026 Blau statt Türkis, passend zum CI-Paket. Nur helle Darstellung.
- Neue Artefakte mit `design/kit.py` bauen (`page`, `hero`, `section`, `card`, `E`). Ältere Artefakte im alten Stil werden auf Wunsch umgestellt.

## Geltungsbereich

- Die unpruuf-Regeln (Sprachen EN + RO, Aufbau der Kundenmaterialien, Briefkastenbild ohne Zahlen, Lizenzmodell, Produktnamen, GDPR-Formulierungen usw.) stehen in `unpruuf/CLAUDE.md` und gelten **nur für unpruuf**.
- Neue Projekte außerhalb von unpruuf (zum Beispiel der Kurier-Motor „Conditional Handover Engine“ vom 14.10.2026) sind nicht an die unpruuf-Regeln gebunden. Sprache und Aufbau dort nach Gabriels Vorgabe im jeweiligen Auftrag.

## Wissensbasis (27.10.2026, von Gabriel festgelegt)

- Das Wissen über NexonAI steht als Karten in `wissen/` (Produkte, Apps, Lösungen, Material, Kunden, Piloten, Angebote, Partner, Entscheidungen, Gabriel). Format und Pflichtfelder: `wissen/README.md`. NexonGraph verknüpft die Karten mit dem Code.
- Beim Sitzungsstart baut `scripts/wissen-start.sh` den Graphen und zeigt die Kurzlage. Die Kurzlage zuerst lesen, besonders „Gabriel's preferences“.
- Vor jeder Aufgabe zu einem Produkt, einer App, einer Lösung, einem Material, einem Kunden, einem Piloten, einem Angebot oder einem Partner zuerst nachschlagen: `nexongraph query "<Frage>"`, `nexongraph explain "<Name>"`, `nexongraph search "<Wörter>" --kind <art>`. Erst danach Dateien lesen oder Gabriel fragen.
- Am Ende jeder Arbeitssitzung die betroffenen Karten aktualisieren (`status`, `updated`, Fakten, Links), `nexongraph check .` ohne Fehler, mit der Arbeit committen. Der Stop-Hook `scripts/wissen-guard.sh` erinnert daran.
- Neue Regeln aus dem Chat sofort als `decision`-Karte mit Datum anlegen, ersetzte auf `superseded` setzen.
- Gabriel und Norbert arbeiten im selben Claude- und GitHub-Konto. Wer gerade schreibt, zeigt die Kurzlage („Active person“): Umgebungsvariable `NEXON_PERSON`, sonst die lokale Datei `.nexon-person` (auf Norberts Mac von `nexongraph/install.command` angelegt, nie committen), sonst Gabriel. Sagt jemand im Chat, wer er ist („hier ist Norbert“), gilt das für die Sitzung.
- Persönliche Vorlieben und Änderungen der aktiven Person (Antwortstil, Lieferformat, Sprache, was sie nicht will) sofort als `preference`-Karte in `wissen/<person>/` pflegen (`gabriel/`, `norbert/`), ersetzte auf `superseded`. Gemeinsame Regeln gelten für beide.
- Steht in der Kurzlage „Questions for <Name>“, diese Fragen früh in der Sitzung stellen, nicht alle auf einmal, die Antworten als `preference`-Karten speichern und die beantwortete Frage aus `open_questions` im Profil entfernen.
- Floretta hat keinen Zugang zu Claude. Sie bekommt die Wissensseite als einzelne Datei (`lieferungen/03_Material/Wissensseite/NexonAI_Wissen.html`) über Drive.
- Aus Google Drive (Ordner „Claude“ von gabriel@nexonai.ro) kommen nur Fakten und Links ins Repo, nie Volltexte. Ablauf: `wissen/DRIVE-SYNC.md`.

## Lieferungen (27.10.2026, von Gabriel festgelegt)

- Jede fertige Lieferung (ZIP, PDF, PPTX, DOCX) zusätzlich unter `lieferungen/` im Repo ablegen, Ordner wie in Drive („Claude“), nur die letzte Version, ältere über die Git-Historie. Dateien über 50 MB nur in Drive, in `lieferungen/README.md` vermerken. Mit der Arbeit committen und pushen.
