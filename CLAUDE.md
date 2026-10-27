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
- Persönliche Vorlieben und Änderungen von Gabriel (Antwortstil, Lieferformat, Sprache, was er nicht will) sofort als `preference`-Karte in `wissen/gabriel/` pflegen, ersetzte auf `superseded`.
- Aus Google Drive (Ordner „Claude“ von gabriel@nexonai.ro) kommen nur Fakten und Links ins Repo, nie Volltexte. Ablauf: `wissen/DRIVE-SYNC.md`.
