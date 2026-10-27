# Changelog

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
