# Allgemeine Arbeitsregeln (Gabriel Hategan, NexonAI Consulting SRL)

Gilt für alle Projekte in diesem Repo.

## Antwortstil und Umgang mit Wünschen (14.10.2026, von Gabriel festgelegt)

- Antworten nie mit „Gabriel, “ beginnen. Direkt mit der Antwort anfangen.
- Verlangt Gabriel etwas, zuerst genau das vollständig liefern. Eigene Meinung (passt nicht, zu viel, Risiko, bessere Idee) erst am Ende, klar abgesetzt. Nicht bremsen, nicht kürzen, nicht vorab umlenken.
- Gabriel will alles wissen, was er fragt, um Entscheidungen auf besserer Datenlage zu treffen. Vollständige Information hat Vorrang vor Priorisierung.
- Keine Zuweisungen an Gabriel, Norbert und Floretta in Dokumenten, Artefakten oder Übersichten (16.10.2026, von Gabriel festgelegt). Keine Felder wie „Owner“, „Verantwortlich“, „Zuständig“ und keine Aufgabenverteilung nach Personen. Entscheidungen und offene Punkte als „das Team“ formulieren.

## Design für Artefakte und Seiten (16.10.2026, von Gabriel festgelegt)

- Alle Artefakte und Webseiten werden im NexonAI-Design gebaut. Das Design stammt aus der NexonAI-Consulting-Website und liegt als Kit in `design/` (`nexonai.css`, `kit.py`, `assets/`, `README.md`).
- Aufbau eines Artefakts: Kopfleiste mit Logo und Sprachwahl, grauer Statusstreifen, Abschnitte im Wechsel `--surface` und `--surface-low`, weiße Karten mit 16 px Radius, Fußzeile mit Logo. Schrift: Open Sans, Beschriftungen in DejaVu Sans Mono. Akzent: Türkis `#0f6b62`, Warnungen und Pilot in `#a8500f`. Nur helle Darstellung.
- Neue Artefakte mit `design/kit.py` bauen (`page`, `hero`, `section`, `card`, `E`). Ältere Artefakte im alten Stil werden auf Wunsch umgestellt.

## Geltungsbereich

- Die unpruuf-Regeln (Sprachen EN + RO, Aufbau der Kundenmaterialien, Briefkastenbild ohne Zahlen, Lizenzmodell, safeline, GDPR-Formulierungen usw.) stehen in `unpruuf/CLAUDE.md` und gelten **nur für unpruuf**.
- Neue Projekte außerhalb von unpruuf (zum Beispiel der Kurier-Motor „Conditional Handover Engine“ vom 14.10.2026) sind nicht an die unpruuf-Regeln gebunden. Sprache und Aufbau dort nach Gabriels Vorgabe im jeweiligen Auftrag.
