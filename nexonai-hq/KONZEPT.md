# NexonAI HQ – Konzept lokales Multi-Agent-System

Stand: 2026-10-16 · Autor: Claude für Gabriel Hategan (CEO)

## 1. Ziel
Ein "virtuelles Unternehmen" auf dem eigenen Rechner: gemeinsames Wissen, fünf Abteilungen mit je einem Agenten, eine Sekretärin als zentrale Anlaufstelle, Gabriel als CEO mit Freigabe-Hoheit. Sensible Daten bleiben lokal; unkritische Aufgaben dürfen optional an Online-APIs (Claude, OpenAI, Gemini, OpenRouter).

## 2. Organigramm

```
                    GABRIEL (CEO)
                         |
                  SEKRETÄRIN "Nora"        <- einziger Gesprächspartner im Alltag
        (Gespräch, Aufgaben verteilen, Protokolle, Briefing)
                         |
   +--------+---------+--------+-----------+----------+
   |        |         |        |           |          |
  WEB   MARKETING  DEVELOPMENT PROGRAMMING  TESTING
 Agent    Agent      Agent       Agent       Agent
   \_________ gemeinsames Wissen (RAG) _________/
```

## 3. Agenten (Rollen)

| Agent | Aufgabe | Wissen (eigene Sammlung) | Modell-Klasse |
|---|---|---|---|
| Sekretärin Nora | Alles besprechen, Ideen sortieren, Aufgaben an Abteilungen delegieren, Tages-/Wochenbriefing, Protokoll, Rückfragen an CEO | Alle Sammlungen lesend, Protokolle, Kalender-Notizen | mittel (Chat-stark) |
| Web | Website-Texte, Struktur, SEO, Landingpages, Hosting-Checks | Brand, Website, SEO | mittel |
| Marketing | Positionierung, Kampagnen, LinkedIn, Angebote, Mailings | Brand, Zielgruppen, Angebote, Wettbewerb | mittel |
| Development | Architektur, Anforderungen, Specs, Produkt-Roadmap | Architektur, Specs, Entscheidungen (ADR) | stark |
| Programming | Code schreiben/ändern, Reviews, Skripte | Code-Standards, Repos | Coder-Modell |
| Testing | Testpläne, Testfälle, Bugreports, Abnahme | Specs, Testprotokolle, Bugs | mittel/Coder |
| CEO (Gabriel) | Freigaben, Prioritäten, Strategie | – | Mensch |

Regel: Agenten arbeiten nie direkt "nach draußen" (Mail senden, veröffentlichen, pushen). Alles Externe geht über **Freigabe durch Gabriel**.

## 4. Gemeinsames Wissen (die wichtigste Komponente)

Ein Ordner = die Wahrheit. Alles als Markdown/PDF/DOCX, wird automatisch indexiert.

```
NexonAI-Wissen/
  00_Firma/        Vision, Angebote, Preise, Zielgruppen (Berufsgeheimnisträger), Tonalität
  01_Kunden/       je Kunde ein Ordner  [NUR lokal, nie an Online-API]
  02_Web/
  03_Marketing/
  04_Development/  Architektur, Entscheidungen, Specs
  05_Programming/  Code-Standards, Repo-Notizen
  06_Testing/
  07_Protokolle/   Chats/Beschlüsse, von Nora automatisch geschrieben
  99_Inbox/        Gabriel wirft alles hier rein – Nora sortiert ein
```

- **Gemeinsam:** 00, 07 + Abteilungswissen lesen alle.
- **Getrennt:** jeder Agent bekommt zusätzlich seine eigene Sammlung.
- **Vertraulichkeits-Stufen** pro Ordner: `LOKAL` (nie Cloud), `FREI` (darf an Online-API). Kundendaten sind immer LOKAL.

## 5. Hybrid-Regel (Datenschutz = euer Verkaufsargument)

| Datenklasse | Darf wohin |
|---|---|
| Kundendaten, Verträge, Interna | nur lokales Modell |
| Eigene Marketing-/Web-Texte, öffentlicher Code | lokal oder Online (Gabriel entscheidet je Agent) |
| Schwere Denkaufgaben, unkritisch | Online-API (Claude/OpenRouter) als "Turbo" |

Pro Agent ein Schalter: **Lokal / Online / Auto**. Standard = Lokal.

## 6. Technik-Stack (ohne eigene Entwicklung startklar)

| Schicht | Wahl | Warum |
|---|---|---|
| Modell-Runtime | **Ollama** | läuft lokal, 1 Installer, Windows ok |
| Oberfläche + Agenten + Wissen | **Open WebUI** | Chat-UI, "Modelle" = Agenten mit eigenem System-Prompt, Knowledge-Sammlungen (RAG), Online-APIs parallel einbindbar, Mehrbenutzer später |
| Automatisierung (Phase 2) | **n8n** | Nora verteilt Aufgaben, Freigabe-Workflow, Briefing per Mail/Telegram |
| Code-Agent (Phase 2) | **Aider / Continue** mit lokalem Coder-Modell | Programming/Testing direkt am Repo |
| Start/Install | `.bat`-Dateien | kein CLI nötig |

Modelle (Richtwerte, je nach Hardware):

| Hardware | Chat/Sekretärin | Coder |
|---|---|---|
| 16 GB RAM, ohne GPU | 7–8B (Qwen3 8B / Llama 3.1 8B) – langsam, nur Basis | Qwen2.5-Coder 7B |
| GPU 12–16 GB VRAM | 14B (Qwen3 14B) | Qwen2.5-Coder 14B |
| GPU 24 GB VRAM / 64 GB RAM | 30B-Klasse | Qwen2.5-Coder 32B |
| Embeddings (RAG) | nomic-embed-text (klein, überall ok) | |

## 7. Ablauf im Alltag

1. Gabriel spricht mit **Nora** ("Wir brauchen eine Landingpage für Kanzleien").
2. Nora fasst zusammen, fragt nach, schreibt Protokoll in `07_Protokolle`.
3. Nora erstellt Aufträge: Marketing (Text), Web (Struktur), Development (Anforderungen).
4. Agenten liefern Entwürfe → landen in einer **Freigabe-Liste** bei Gabriel.
5. Gabriel: ✔ freigeben / ✎ ändern / ✖ verwerfen. Erst dann geht etwas raus.
6. Abends: Nora-Briefing "Was ist heute passiert, was ist offen".

## 8. Phasen

| Phase | Inhalt | Aufwand |
|---|---|---|
| **1 – Fundament** | Ollama + Open WebUI per `.bat`, Wissensordner, 6 Agenten mit Prompts, Wissen einlesen | 1 Tag |
| 2 – Zusammenarbeit | n8n: Nora delegiert automatisch, Freigabe-Liste, Briefing | 2–3 Tage |
| 3 – Code-Team | Programming/Testing am echten Repo, Testläufe automatisch | 3–5 Tage |
| 4 – Härtung | Backup, Zugriffsrechte, Audit-Log, Kunden-Mandanten | laufend |

## 9. Ehrliche Risiken

- **Hardware entscheidet alles.** Kleine lokale Modelle sind bei Code und langen Texten klar schwächer als Claude/GPT. Daher der Hybrid-Schalter.
- **Mehr Agenten ≠ besser.** Sechs Rollen mit sauberem Wissen schlagen zwanzig Agenten ohne. Erst Qualität des Wissens, dann Automatisierung.
- **Agenten halluzinieren.** Darum Freigabe-Pflicht und Quellenangabe aus der Wissensbasis.
- **Wissenspflege** ist der eigentliche Aufwand (Inbox-Disziplin, Nora sortiert).

## 10. Offene Punkte (bitte klären)
1. Welche Hardware (CPU, RAM, GPU/VRAM)? → bestimmt Modellwahl.
2. Windows-Rechner, nur du oder später Norbert/Kunden mit Zugriff?
3. Online-API als Turbo erlaubt (ja/nein, welche Anbieter)?
4. Sprache der Agenten: Deutsch, Rumänisch, Englisch?
