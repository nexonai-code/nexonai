# NexonGraph

Macht aus einem Ordner einen Wissensgraphen: Code, Markdown, PDF, Word und HTML.
Statt Dateien zu durchsuchen, fragst du den Graphen: Wer ruft wen auf? Was hängt woran? Welches Dokument beschreibt welchen Teil? Wie hängen zwei Dinge zusammen?

Eigenentwicklung der NexonAI Consulting SRL, angelehnt an die Idee von Graphify. Der Code wurde nicht übernommen.

## Installieren und starten (Windows)

1. Ordner `nexongraph` irgendwohin entpacken, z. B. `C:\Programme-NexonAI\nexongraph`.
2. `install.bat` doppelklicken. Fehlt Python 3.10+, bietet die Datei die Installation per winget an. Am Ende liegt eine Verknüpfung „NexonGraph“ auf dem Desktop.
3. `start.bat` (oder die Desktop-Verknüpfung) startet die Oberfläche im Browser.

| Datei | Zweck |
|---|---|
| `install.bat` | Python prüfen, Programmumgebung `.venv` anlegen, Bausteine installieren, Selbsttest, Desktop-Verknüpfung |
| `start.bat` | Oberfläche starten (http://127.0.0.1:8765, nur auf diesem Rechner erreichbar) |
| `Ordner_bauen.bat` | Ordner auf die Datei ziehen: Graph bauen und `graph.html` öffnen, ohne Oberfläche |
| `KI_verbinden.bat` | NexonGraph in Claude Code (Skill + MCP), Claude Desktop und Cursor (MCP) eintragen |
| `deinstallieren.bat` | Einträge entfernen, `.venv` und Verknüpfung löschen |

macOS: `install.command` doppelklicken (fragt im nexonai-Repo, wer an diesem Mac arbeitet), dann `start.command`. `KI_verbinden.command` trägt NexonGraph in Claude und Cursor ein. Linux: `python3 -m venv .venv && .venv/bin/pip install -e .`, dann `.venv/bin/nexongraph`.

## Was herauskommt

Im Projektordner entsteht `nexongraph-out/` (oder, wenn so eingestellt, ein Ordner im Benutzerprofil, damit der Projektordner unberührt bleibt):

| Datei | Inhalt |
|---|---|
| `graph.html` | Interaktiver Graph, funktioniert offline in jedem Browser: Suche, Filter, Bereiche, Details per Klick, Weg zwischen zwei Knoten |
| `REPORT.md` | Das Wichtigste: zentrale Knoten, Bereiche mit Kopplung, überraschende Verbindungen, Begründungen aus dem Code (WHY/NOTE/SECURITY …), Import-Zyklen, unsichere Verbindungen, lohnende Fragen |
| `graph.json` | Der ganze Graph für Abfragen, Skripte und KI-Assistenten |
| `cache/` | Zwischenergebnisse je Datei. Neu bauen verarbeitet nur Geändertes |

## Wie der Graph entsteht

| Quelle | Wie | Modell nötig |
|---|---|---|
| Python | Standardbibliothek `ast`: Klassen, Funktionen, Methoden, Importe, Aufrufe, Vererbung, Dekoratoren, Docstrings | nein |
| JavaScript, TypeScript, Java, Kotlin, Go, C#, PHP, Ruby, Rust, C, C++, Swift, Scala, Lua, Dart, Bash, PowerShell, SQL | tree-sitter (lokal); ohne tree-sitter ein Regex-Fallback | nein |
| Markdown, Text, reStructuredText, PDF, Word, HTML | Dokument → Abschnitte nach Überschriften (PDF: je Seite), Links, Erwähnungen von Code-Namen und Dateien, gemeinsame Begriffe zwischen Dokumenten | nein |
| Dokumente, semantisch | Begriffe und Beziehungen je Abschnitt; was nicht wörtlich im Text steht, wird verworfen | ja, optional |

Jede Verbindung trägt ihre Herkunft:

- **EXTRACTED**: steht so im Quelltext (Import, direkter Aufruf, Link).
- **INFERRED**: von NexonGraph aufgelöst (z. B. `self.save()` → Methode der eigenen Klasse, Erwähnung eines Funktionsnamens in der Doku).
- **AMBIGUOUS**: mehrere Kandidaten. Steht im Bericht und sollte geprüft werden.

Bereiche entstehen per Louvain-Clustering, ihre Namen ohne Modell (Ordner + zentraler Knoten).

## Sprachmodell (optional)

Einstellbar in der Oberfläche unter „Einstellungen“:

| Anbieter | Daten bleiben lokal |
|---|---|
| Kein Modell (Standard) | ja |
| Ollama | ja |
| Lokaler OpenAI-kompatibler Server (LM Studio, vLLM, llama.cpp) | ja |
| OpenAI, Anthropic Claude, Google Gemini, OpenRouter | nein, Textauszüge gehen an den Anbieter |

Mit Modell kommen zwei Dinge dazu: der semantische Durchlauf über Dokumente und „Fragen (Modell)“, also Antworten in Sätzen mit Quellenangaben `Datei:Zeile`.
Bei Online-Anbietern zeigt die Oberfläche eine Warnung, und der Statusstreifen wird orange.
Der API-Schlüssel liegt in `%APPDATA%\NexonGraph\config.json`. Alternativ setzt du die Umgebungsvariable `NEXONGRAPH_API_KEY`.

## Kommandozeile

```
nexongraph build <Ordner> [--semantic | --no-semantic] [--open]
nexongraph query "<Frage>" --dir <Ordner>        Teilgraph als Text
nexongraph search "<Wörter>" --dir <Ordner>
nexongraph explain "<Name>" --dir <Ordner>
nexongraph path "<A>" "<B>" --dir <Ordner>
nexongraph ask "<Frage>" --dir <Ordner>          Antwort mit dem eingestellten Modell
nexongraph report --dir <Ordner>
nexongraph watch <Ordner>                         bei Änderungen neu bauen
nexongraph serve                                  Oberfläche
nexongraph mcp [--dir <Ordner>]                   MCP-Server (stdio)
nexongraph install | uninstall                    Claude Code, Claude Desktop, Cursor
```

## KI-Assistenten

`KI_verbinden.bat` (oder in der Oberfläche „KI-Assistenten verbinden“) trägt diese Dinge ein:

- **Claude Code:** Skill `~/.claude/skills/nexongraph/SKILL.md` und den MCP-Server `nexongraph` (wenn die `claude`-Kommandozeile installiert ist).
- **Claude Desktop und Cursor:** MCP-Server in `claude_desktop_config.json` bzw. `~/.cursor/mcp.json`. Vorher wird eine Sicherung angelegt.

Der MCP-Server bietet diese Werkzeuge: `list_projects`, `query`, `search`, `explain`, `path`, `report`.

## Dateien ausschließen

Eine Datei `.nexongraphignore` im Projektordner, eine Zeile je Muster:

```
geheim/*
*.min.js
alte_akten
```

Automatisch übersprungen werden `.git`, `node_modules`, `.venv`, `build`, `dist`, `bin`, `obj`, `nexongraph-out` und versteckte Ordner.

## Sicherheit

- Die Oberfläche hört nur auf `127.0.0.1`. Jeder API-Aufruf braucht ein Sitzungs-Token, das nur in der eigenen Seite steht.
- Ohne Modell oder mit lokalem Modell verlässt nichts den Rechner.
- `graph.html` lädt nichts aus dem Internet (keine CDN, keine Schriften von außen).

## Entwicklung

```
pip install -e .[test]
pytest -q
```

Aufbau: `scan` → `extract_*` (mit Cache) → `build` (zusammenführen, Namen auflösen, Erwähnungen) → `concepts` (Begriffe, optional Modell) → `analyze` (Bereiche, Zentralität, Überraschungen, Zyklen, Fragen) → `export` (Layout, JSON, HTML) → `report`.
