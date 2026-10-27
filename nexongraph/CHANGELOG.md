# Changelog

## 1.2.0 (27.10.2026)

- Personen: Gabriel und Norbert im selben Konto. Die aktive Person kommt aus `NEXON_PERSON` oder der lokalen Datei `.nexon-person`, sonst Gabriel. Bereiche `wissen/gabriel/` und `wissen/norbert/`. Die Kurzlage zeigt nur die Vorlieben der aktiven Person und deren offene Fragen („Questions for …“). Gleiche Themen bei zwei Personen gelten nicht mehr als Widerspruch.
- Seite: „Despre noi / About us“ mit allen Personen, Vorlieben und offenen Fragen. `export-site --no-graph --name` erzeugt eine einzelne Datei zum Weitergeben (für Floretta).
- macOS: `install.command` (fragt im Repo, wer an diesem Mac arbeitet), `start.command`, `KI_verbinden.command`. Das Start-Skript der Wissensbasis braucht kein `timeout` mehr.

## 1.1.0 (27.10.2026)

Wissensbasis für NexonAI.

- Karten in `wissen/`: Markdown mit Kopfdaten für Produkte, Apps, Lösungen, Material, Kunden, Piloten, Angebote, Partner, Entscheidungen und Gabriel (Profil und Vorlieben). Die Karten werden Knoten im Graphen, mit Verbindungen untereinander und zum Code (Datei- und Ordner-Knoten).
- `nexongraph check`: 18 Regeln, darunter Pflichtfelder, Statuswerte, Datumsformat, unbekannte Verweise, fehlende Code-Pfade, keine Personen-Zuweisungen, abgelaufene Angebote, überfällige Piloten, veraltete Karten, widersprüchliche Regeln und Vorlieben, Status-Widersprüche, verbotene Begriffe (mit Ausnahme für Verneinungen) und offene Konflikte.
- `nexongraph brief`: Kurzlage für den Sitzungsstart. Zuerst kommen Gabriels Vorlieben, danach Produkte und Apps, Piloten, Angebote (überfällige zuerst), Änderungen, neue Regeln, offene Fragen, die Prüfung und der Drive-Stand.
- `nexongraph guard` und die Hooks `scripts/wissen-start.sh` und `scripts/wissen-guard.sh` (`.claude/settings.json`): Der Graph und die Kurzlage entstehen beim Sitzungsstart. Wurde Code geändert und die Karte nicht, wird das Ende der Sitzung einmal angehalten.
- `nexongraph export-site`: eigenständige RO/EN-Seite im NexonAI-Design mit Graph.
- `nexongraph search --kind`; Drive-Stand `wissen/.drive-stand.json`; Abhängigkeit PyYAML.

## 1.0.0 (27.10.2026)

Erste Version.

- Code-Graph: Python über `ast`. Über 20 weitere Sprachen über tree-sitter, mit Regex-Fallback, falls tree-sitter fehlt.
- Namensauflösung: Importe (Python-Module, relative JS/TS-Pfade, Java/Kotlin/C#/Go/Rust-Pakete, C-Includes), Aufrufe (gleiche Datei, importierte Symbole, Modul-Alias, `self`/`this`, Basisklassen, eindeutige Namen) und Vererbung. Jede Kante trägt die Herkunft EXTRACTED, INFERRED oder AMBIGUOUS.
- Dokumente: Markdown, Text, reStructuredText, PDF, Word und HTML, jeweils in Abschnitte zerlegt. Dazu Links, Erwähnungen von Code-Namen und Dateien sowie gemeinsame Begriffe zwischen Dokumenten.
- Optionaler semantischer Durchlauf mit Ollama, einem lokalen OpenAI-kompatiblen Server, OpenAI, Anthropic, Gemini oder OpenRouter. Der Durchlauf wird je Textstück zwischengespeichert. Begriffe, die nicht im Text stehen, werden verworfen.
- Analyse: Bereiche (Louvain), zentrale Knoten, überraschende Verbindungen, Import-Zyklen, unsichere Kanten, Hinweise aus Kommentaren (WHY/NOTE/SECURITY …) und vorgeschlagene Fragen.
- Ausgabe: `graph.html` (offline, NexonAI-Design, DE/EN, Suche, Filter, Weg-Suche, Details), `REPORT.md` und `graph.json`.
- Inkrementelles Bauen über einen Cache je Datei, außerdem automatisches Neubauen bei Änderungen (watch).
- Weboberfläche: Projekte, Bauen mit Fortschritt und Abbrechen, Graph, Bericht, Suche, Fragen mit Modell, Weg-Suche und Einstellungen. Die Oberfläche läuft nur lokal und ist durch ein Sitzungs-Token geschützt.
- MCP-Server (stdio) mit `list_projects`, `query`, `search`, `explain`, `path` und `report`.
- Anbindung an Claude Code (Skill + MCP), Claude Desktop und Cursor.
- Windows-Dateien: `install.bat`, `start.bat`, `Ordner_bauen.bat`, `KI_verbinden.bat` und `deinstallieren.bat`.
