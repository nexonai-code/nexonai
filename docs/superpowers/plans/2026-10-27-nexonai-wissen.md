# NexonAI Wissen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Wissensbasis aus Karten in `wissen/`, die NexonGraph mit dem Code verknüpft. Dazu kommen Kurzlage, Prüfung, Pflege-Wächter und Sitzungs-Hooks, ein wöchentlicher Pflege-Lauf mit Drive-Abgleich und Gabriels RO/EN-Seite.

**Architecture:** Karten sind Markdown-Dateien mit YAML-Frontmatter. Ein neuer Karten-Leser (`cards.py`) ist die einzige Stelle, die das Format kennt. Alles andere baut darauf auf: Extraktor, Prüfung, Kurzlage, Seite und Wächter. Die Pipeline von NexonGraph 1.0 bleibt und bekommt Karten als weitere Quelle. Hooks in `.claude/settings.json` rufen kleine Shell-Skripte auf, die nur NexonGraph-Befehle starten.

**Tech Stack:** Python ≥3.10, NexonGraph 1.0 (`nexongraph/`), PyYAML (neu), networkx, pytest, Playwright (nur zur Prüfung der Seite), Claude-Code-Hooks, Claude-Cloud-Aufträge, Google-Drive-Verbindung.

**Spec:** `docs/superpowers/specs/2026-10-27-nexonai-wissen-design.md`

## Global Constraints

- Karten liegen unter `wissen/<bereich>/<id>.md`. Die Bereichsordner sind `produkte`, `apps`, `loesungen`, `material`, `kunden`, `piloten`, `angebote`, `partner`, `entscheidungen` und `eingang`.
- Pflichtfelder jeder Karte: `type`, `id`, `title`, `status`, `updated` (ISO-Datum `JJJJ-MM-TT`) und `summary`.
- `type` ∈ {`product`, `app`, `solution`, `material`, `customer`, `pilot`, `offer`, `partner`, `decision`}.
- Statuswerte genau wie in Spec 3.3.
- `id` besteht aus Kleinbuchstaben, Ziffern und `-` und ist gleich dem Dateinamen ohne `.md`.
- Kanten aus Kartenfeldern: `products` → `concerns`, `customer` → `for_customer`, `supersedes` → `supersedes`, `partner` → `with_partner`, `material` → `has_material`, `code` → `implemented_in`. Herkunft ist immer EXTRACTED.
- Karten sind auf Englisch. Die Kurzlage ist auf Englisch. Die Oberfläche von Gabriels Seite ist Rumänisch und Englisch.
- Nie auf Karten: Volltexte aus Drive, Gesundheits-, Ausweis-, Bank- und Zugangsdaten, private Kontaktdaten. Keine Felder `owner`, `responsible` oder `assignee` und keine Zuweisungen an Gabriel, Norbert oder Floretta.
- Design der Seite: Blau `#307098`, dunkle Flächen `#0f2a3a`, Warnung `#a8500f`, Open Sans und DejaVu Sans Mono, nur hell, keine externen Abhängigkeiten.
- Drive-Quelle: Ordner „Claude“ in „Meine Ablage“ von `gabriel@nexonai.ro`. Nur Fakten und Links ins Repo.
- Nichts darf eine Sitzung verhindern: Hooks geben bei Fehlern eine Zeile aus und enden mit Code 0. Ausnahme ist die eine gewollte Blockierung des Wächters.

## Review Focus

1. **Kaputtes Frontmatter** (fehlendes `---`, Tabs, ungültiges YAML): Der Build läuft weiter. `check` meldet `parse-error` mit Datei.
2. **Datum im falschen Format** (`27.10.2026`, `2026-10`): `check` meldet `bad-date`. Keine Ausnahme in `brief`, `check` oder Export.
3. **Wächter ohne Startstand** (frischer Clone, kein `.git/wissen-session-base`, Detached HEAD): keine Blockierung, kein Absturz.
4. **Start-Hook ohne Netz oder bei pip-Fehler:** eine Zeile „Wissensbasis nicht verfügbar: …“, Exit-Code 0.
5. **Negierte verbotene Begriffe** („not certified“, „nicht zertifiziert“): kein `forbidden-term`. „certified“ allein wird gemeldet.

---

### Task 1: Karten-Leser

**Files:**
- Create: `nexongraph/nexongraph/cards.py`
- Modify: `nexongraph/pyproject.toml`, `nexongraph/requirements.txt` (PyYAML ≥ 6.0 ergänzen)
- Test: `nexongraph/tests/test_cards.py`

**Interfaces:**
- Produces:
  - `CARD_DIR = "wissen"`
  - `AREAS: dict[str, str]`: Ordner → type, z. B. `{"produkte": "product", …, "eingang": ""}`
  - `TYPES: set[str]`
  - `STATUSES: dict[str, set[str]]`
  - `REQUIRED = ("type", "id", "title", "status", "updated", "summary")`
  - `REF_FIELDS: dict[str, str]` (Feld → Beziehung, siehe Global Constraints, ohne `code`)
  - `@dataclass Card: id: str; type: str; title: str; status: str; updated: date | None; summary: str; fields: dict; body: str; rel: str`
  - `class CardError(Exception)` mit `rel: str`, `rule: str`, `message: str`
  - `parse_card(text: str, rel: str) -> Card | None`: `None`, wenn kein Frontmatter mit `type` vorhanden ist. `CardError(rule="parse-error")` bei kaputtem YAML.
  - `load_cards(root: Path) -> tuple[list[Card], list[CardError]]`: liest `root/wissen/**/*.md`. Übersprungen werden `wissen/site/`, `README.md` und Dateien mit `_` am Anfang.
  - `refs(card: Card) -> list[tuple[str, str]]`: Paare (Beziehung, Ziel-ID) aus `REF_FIELDS`. Einzelwerte und Listen werden beide akzeptiert.

- [ ] **Step 1: Write the failing tests**

```python
def test_parse_card_fields(): # Pflichtfelder und Extrafelder
    c = parse_card("---\ntype: product\nid: unpruuf-press\ntitle: unpruuf Press\nstatus: pilot\nupdated: 2026-10-27\nsummary: s\nproducts: [unpruuf-business]\ncode: unpruuf/officer-app\n---\n- point\n", "wissen/produkte/unpruuf-press.md")
    assert c.id == "unpruuf-press" and c.updated == date(2026, 10, 27) and c.fields["code"] == "unpruuf/officer-app"
    assert refs(c) == [("concerns", "unpruuf-business")]
    assert c.body.strip() == "- point"

def test_no_frontmatter_is_not_a_card(): assert parse_card("# Title\ntext", "wissen/x.md") is None
def test_broken_yaml_raises(): # "type: product\n\tid: x" zwischen --- → CardError rule "parse-error"
def test_bad_date_keeps_card(): # updated: 27.10.2026 → Card mit updated None, fields["updated"] == "27.10.2026"
def test_load_cards_skips_site_and_readme(tmp_path): # wissen/site/index.md, wissen/README.md werden nicht geladen; eine Karte + ein Fehler werden gemeldet
```

- [ ] **Step 2: Run** `cd nexongraph && pytest tests/test_cards.py -q` → FAIL (Modul fehlt)
- [ ] **Step 3: Implement `cards.py`** mit `yaml.safe_load`. Datumsfelder: `datetime.date` übernehmen, ISO-Strings parsen, alles andere ergibt `None`.
- [ ] **Step 4: Run** `pytest tests/test_cards.py -q` → PASS
- [ ] **Step 5: Commit** `feat(nexongraph): card reader for wissen/`

### Task 2: Karten im Graphen und Suchfilter

**Files:**
- Create: `nexongraph/nexongraph/extract_cards.py`
- Modify: `nexongraph/nexongraph/pipeline.py` (Karten laden; `wissen/`-Dateien, die Karten sind, nicht zusätzlich als Dokument extrahieren; `wissen/site/` überspringen)
- Modify: `nexongraph/nexongraph/cli.py` (`search --kind a,b`)
- Test: `nexongraph/tests/test_extract_cards.py`

**Interfaces:**
- Consumes: `Card`, `load_cards`, `refs` (Task 1)
- Produces:
  - `cards_extraction(cards: list[Card], files: set[str]) -> dict`. Knoten `card::<id>` mit `kind=card.type`, `label=title`, `status`, `summary`, `source_file=card.rel`, `updated` (ISO), Body als `text`. Dazu Kanten aus `refs` und aus `code`. Ein `code`-Pfad, der eine Datei ist, ergibt eine Kante auf die Datei. Ist er ein Ordner, entsteht ein Knoten `dir::<pfad>` (`kind="folder"`) mit `contains`-Kanten auf die Dateien darunter, die schon im Graphen sind, und `implemented_in` zeigt auf den Ordner-Knoten. Unbekannte Ziel-IDs ergeben keine Kante.
  - Graph-Knoten haben jetzt die Arten `product`, `app`, `solution`, `material`, `customer`, `pilot`, `offer`, `partner`, `decision` und `folder`.
  - CLI: `nexongraph search "<text>" --kind customer,offer`

- [ ] **Step 1: Write the failing tests**

```python
def test_card_edges(): # Karten app (code: ["src/a.py", "src"]) und product, die sich über products referenzieren
    ex = cards_extraction([app, product], files={"src/a.py", "src/b.py"})
    assert ("card::relay-app", "card::unpruuf-business", "concerns") in edges(ex)
    assert ("card::relay-app", "src/a.py", "implemented_in") in edges(ex)
    assert ("card::relay-app", "dir::src", "implemented_in") in edges(ex)
    assert ("dir::src", "src/b.py", "contains") in edges(ex)

def test_unknown_ref_creates_no_edge(): # products: [nope] → keine Kante auf card::nope, kein Knoten card::nope

def test_build_with_cards(tmp_path): # Projekt mit src/a.py und wissen/apps/relay-app.md, build(..., semantic=False)
    G = load_graph(...); assert G.nodes["card::relay-app"]["kind"] == "app"
    assert G.has_edge("card::relay-app", "src/a.py")
    assert "wissen/apps/relay-app.md" not in G  # nicht doppelt als Dokument

def test_broken_card_does_not_break_build(tmp_path): # zusätzlich wissen/kunden/bad.md mit kaputtem YAML → build läuft, meta["errors"] enthält "bad.md"
def test_search_kind_filter(tmp_path): # main(["search","relay","--dir",root,"--kind","app"]) gibt nur app-Treffer aus (capsys)
```

- [ ] **Step 2: Run** `pytest tests/test_extract_cards.py -q` → FAIL
- [ ] **Step 3: Implement** `cards_extraction` und den Einbau in `build()`: Karten nach der Datei-Extraktion und vor `resolve` per `add_extraction` einfügen. `CardError`s in `errors` aufnehmen. `EXTRACTOR_VERSION` auf `"2"` setzen. Die Knotenfarben im Viewer bleiben nach Bereichen. Die Formen: Karten als Raute, ergänzen in `static/viewer.html` (`KORDER` und die i18n-Namen für die neuen Arten in DE/EN).
- [ ] **Step 4: Run** `pytest -q` (alle Tests) → PASS
- [ ] **Step 5: Commit** `feat(nexongraph): cards as graph nodes, folder nodes, search --kind`

### Task 3: Prüfung `nexongraph check`

**Files:**
- Create: `nexongraph/nexongraph/check.py`
- Modify: `nexongraph/nexongraph/cli.py` (`check [dir] [--today JJJJ-MM-TT]`, Exit 1 bei Fehlern)
- Test: `nexongraph/tests/test_check.py`

**Interfaces:**
- Consumes: `load_cards`, `Card`, `TYPES`, `STATUSES`, `REQUIRED`, `REF_FIELDS` (Task 1)
- Produces:
  - `@dataclass Issue: level: str ("error"|"warning"); rel: str; rule: str; message: str`
  - `check(root: Path, today: date) -> list[Issue]`, sortiert nach level, rel und rule.
  - Regeln (der Name ist der Wert von `rule`) mit Stufe:

| rule | Stufe | Bedingung |
|---|---|---|
| `parse-error` | error | `CardError` aus `load_cards` |
| `missing-field` | error | ein Feld aus `REQUIRED` fehlt oder ist leer |
| `bad-type` | error | `type` nicht in `TYPES` (außer in `eingang/`) oder Ordner passt nicht zu `AREAS` |
| `bad-status` | error | `status` nicht in `STATUSES[type]` |
| `bad-date` | error | `updated`, `valid_until`, `start`, `end` oder `date` vorhanden, aber kein ISO-Datum |
| `id-mismatch` | error | `id` ≠ Dateiname oder enthält Zeichen außerhalb `[a-z0-9-]` |
| `duplicate-id` | error | gleiche `id` in zwei Dateien |
| `unknown-ref` | error | ID in einem `REF_FIELDS`-Feld ohne Karte |
| `missing-code-path` | error | Pfad in `code` existiert nicht unter `root` |
| `forbidden-field` | error | Feld `owner`, `responsible` oder `assignee` vorhanden |
| `offer-expired` | warning | `type: offer`, `status: sent`, `valid_until` < today |
| `pilot-overdue` | warning | `type: pilot`, `status: running`, `end` < today |
| `stale` | warning | `status` ∈ {in-progress, pilot, running, talking, offer-sent} und `updated` älter als 90 Tage |
| `decision-conflict` | error | zwei Karten `decision`, `status: valid`, gleiches `scope` und gleiches `topic` |
| `status-conflict` | error | Material-Karte mit `states: {produkt-id: status}`, deren Status von der Produktkarte abweicht |
| `forbidden-term` | error | Begriff aus `forbidden_terms` gültiger Entscheidungen (Standard, falls keine: `safeline`, `certified`, `GDPR-compliant`, `unbreakable`) als ganzes Wort in title, summary, body von `customer`-, `material`-, `offer`- und `solution`-Karten. Ausgenommen, wenn direkt `not `, `nicht ` oder `ne` davor steht (Groß- und Kleinschreibung egal). |
| `inbox-open` | warning | Karte in `eingang/` |

- [ ] **Step 1: Write the failing tests.** Eine Testfunktion je Regel nach dem Muster unten. Jede Regel bekommt eine Fehlerkarte (Regel wird gemeldet) und eine korrekte Karte (keine Meldung).

```python
def test_offer_expired(tmp_path):
    write(tmp_path, "angebote/o1.md", type="offer", status="sent", valid_until="2026-10-01")
    assert rules(check(tmp_path, date(2026, 10, 27))) == {"offer-expired"}
def test_forbidden_term_negation(tmp_path): # summary "not certified" → keine Meldung; "certified by TÜV" → forbidden-term
def test_bad_date(tmp_path): # updated: 27.10.2026 → {"bad-date"}
def test_clean_set_has_no_issues(tmp_path): # je eine korrekte Karte aller 9 Arten mit gültigen Verweisen → []
def test_cli_exit_codes(tmp_path): # mit Fehler → SystemExit 1; nur Warnungen → 0; Ausgabe "ERROR <rel> <rule>: <message>"
```

- [ ] **Step 2: Run** `pytest tests/test_check.py -q` → FAIL
- [ ] **Step 3: Implement** `check.py`, eine kleine Funktion je Regel, `check` sammelt die Ergebnisse. Ausgabezeilen: `ERROR|WARN <rel> <rule>: <message>`.
- [ ] **Step 4: Run** `pytest -q` → PASS
- [ ] **Step 5: Commit** `feat(nexongraph): card check with 17 rules`

### Task 4: Kurzlage `nexongraph brief` und Drive-Stand

**Files:**
- Create: `nexongraph/nexongraph/brief.py`, `nexongraph/nexongraph/drive_state.py`
- Modify: `nexongraph/nexongraph/cli.py` (`brief [dir] [--today]`)
- Test: `nexongraph/tests/test_brief.py`

**Interfaces:**
- Consumes: `load_cards` (Task 1), `check` (Task 3)
- Produces:
  - `drive_state.py`:
    - `load_state(root: Path) -> dict`: `{"last_sync": str | None, "pending_since": str | None, "files": {drive_id: modified_iso}}` aus `wissen/.drive-stand.json`. Fehlt die Datei oder ist sie kaputt, kommt der Leerzustand zurück.
    - `save_state(root: Path, state: dict) -> None`
    - `changed_files(state: dict, listing: list[dict]) -> list[dict]`: Einträge `{id, title, modified, url}`, die neu sind oder ein anderes `modified` haben.
    - `mark_synced(state: dict, items: list[dict], today: date) -> dict`: setzt `last_sync` und löscht `pending_since`.
    - `mark_pending(state: dict, today: date) -> dict`: setzt `pending_since`, falls es noch leer ist.
  - `brief(root: Path, today: date, max_lines: int = 60) -> str` mit diesen Überschriften in dieser Reihenfolge, leere Abschnitte entfallen:
    `# NexonAI brief <JJJJ-MM-TT>`, `## Products & apps`, `## Running pilots`, `## Open offers`, `## Changed (7 days)`, `## New rules (30 days)`, `## Open questions`, `## Check`, `## Drive sync`.
    - Angebote mit Status `draft` oder `sent`: überfällige zuerst, markiert mit `OVERDUE`.
    - `## Check` zeigt die Anzahl der Fehler und Warnungen und höchstens 5 Zeilen.
    - `## Drive sync` zeigt `last <Datum>`, `pending since <Datum>` oder `never`.
    - Bei mehr als `max_lines` Zeilen wird gekürzt, zuletzt kommt `… (n more lines, run nexongraph brief --full)`.

- [ ] **Step 1: Write the failing tests**

```python
def test_brief_order_and_overdue(tmp_path): # zwei Angebote (eins überfällig), ein laufender Pilot, ein Produkt
    out = brief(tmp_path, date(2026, 10, 27))
    assert out.index("## Products & apps") < out.index("## Running pilots") < out.index("## Open offers")
    assert out.split("## Open offers")[1].splitlines()[1].startswith("- OVERDUE")
def test_brief_drive_never_and_pending(tmp_path): # ohne .drive-stand.json → "never"; mark_pending → "pending since 2026-10-27"
def test_changed_files(): # gleiches modified → nicht geändert; neues id → geändert
def test_brief_survives_broken_cards(tmp_path): # kaputte Karte → brief läuft, "## Check" zeigt 1 error
def test_brief_truncates(tmp_path): # 80 Produkte, max_lines=60 → höchstens 60 Zeilen, letzte enthält "more lines"
```

- [ ] **Step 2: Run** `pytest tests/test_brief.py -q` → FAIL
- [ ] **Step 3: Implement** `drive_state.py`, `brief.py` und den CLI-Befehl (`--full` hebt `max_lines` auf).
- [ ] **Step 4: Run** `pytest -q` → PASS
- [ ] **Step 5: Commit** `feat(nexongraph): brief and drive sync state`

### Task 5: Pflege-Wächter, Sitzungs-Hooks und Regeln in CLAUDE.md

**Files:**
- Create: `nexongraph/nexongraph/guard.py`, `scripts/wissen-start.sh`, `scripts/wissen-guard.sh`, `.claude/settings.json`
- Modify: `nexongraph/nexongraph/cli.py` (`guard [dir]`), `CLAUDE.md` (neuer Abschnitt „Wissensbasis“, Wortlaut aus Spec 5.2), `.gitignore` (`nexongraph-out/`)
- Test: `nexongraph/tests/test_guard.py`

**Interfaces:**
- Consumes: `load_cards` (Task 1), `brief` (Task 4)
- Produces:
  - `session_base(root: Path) -> str | None`: Inhalt von `.git/wissen-session-base`, nur wenn es ein gültiger Commit ist.
  - `changed_paths(root: Path, base: str) -> set[str]`: `git diff --name-only <base>` plus die nicht versionierten Dateien (`git ls-files --others --exclude-standard`).
  - `stale_cards(root: Path, base: str) -> list[str]`: Meldungen der Form `card <rel>: code changed in <pfad>, card not updated` und `new folder <pfad> has no card`. Ein neuer Ordner zählt, wenn eine geänderte Datei in einem Ordner direkt unter dem Repo-Wurzelordner oder unter `unpruuf/` liegt, den kein `code`-Pfad einer Karte abdeckt und der im Base-Commit nicht existierte. `wissen/`, `docs/`, `scripts/` und `.claude/` sind ausgenommen.
  - `guard_main(root: Path) -> int`: 0 oder 2. Code 2 heißt: die Meldungen gehen auf stderr, eingeleitet mit „Karten nachziehen:“, und ein Hash der Meldungen wird in `.git/wissen-guard-last` geschrieben. Bei gleichem Hash wie beim letzten Mal gibt die Funktion 0 zurück. Ohne `session_base` ebenfalls 0.
  - `scripts/wissen-start.sh`:
    1. `git rev-parse HEAD > .git/wissen-session-base`
    2. Falls `nexongraph` fehlt: `pip install -q -e nexongraph`
    3. `nexongraph build . --no-semantic > /dev/null`
    4. `nexongraph brief .`
    5. Bei jedem Fehler: `echo "Wissensbasis nicht verfügbar: <Schritt>"` und `exit 0`.
  - `scripts/wissen-guard.sh`: `nexongraph guard .`, der Exit-Code wird durchgereicht. Fehlt `nexongraph`, gilt `exit 0`.
  - `.claude/settings.json`: `{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"bash scripts/wissen-start.sh","timeout":300}]}],"Stop":[{"hooks":[{"type":"command","command":"bash scripts/wissen-guard.sh","timeout":60}]}]}}`

- [ ] **Step 1: Write the failing tests** (je Test ein Git-Repo in `tmp_path` mit einer Karte `code: [app]`)

```python
def test_code_change_without_card_blocks_once(repo): # app/x.py ändern
    assert guard_main(repo) == 2 and guard_main(repo) == 0
def test_code_change_with_card_passes(repo): # app/x.py und wissen/apps/a.md ändern → 0
def test_new_top_folder_reported(repo): # newapp/main.py anlegen → Meldung "new folder newapp has no card"
def test_no_base_no_block(repo): # .git/wissen-session-base fehlt → 0
def test_detached_head_and_bad_base(repo): # Base "deadbeef" → 0, keine Ausnahme
def test_start_script_never_fails(tmp_path): # wissen-start.sh in einem Ordner ohne Git und mit kaputtem PATH: Exit 0, Ausgabe beginnt mit "Wissensbasis nicht verfügbar"
```

- [ ] **Step 2: Run** `pytest tests/test_guard.py -q` → FAIL
- [ ] **Step 3: Implement** `guard.py` (Git per `subprocess.run`, mit Timeout und `check=False`), die beiden Skripte (`set -u`, ohne `set -e`, jeder Schritt mit `|| { echo …; exit 0; }`), `settings.json` und den Abschnitt in `CLAUDE.md`.
- [ ] **Step 4: Run** `pytest -q` → PASS. Danach `bash scripts/wissen-start.sh` im Repo ausführen: Erwartet wird eine Kurzlage mit `# NexonAI brief` und Exit 0.
- [ ] **Step 5: Commit** `feat: session hooks, upkeep guard and knowledge-base rules`

### Task 6: Seite für Gabriel `nexongraph export-site`

**Files:**
- Create: `nexongraph/nexongraph/site.py`, `nexongraph/nexongraph/static/site.html`
- Modify: `nexongraph/nexongraph/cli.py` (`export-site [dir] [--out wissen/site] [--today]`)
- Test: `nexongraph/tests/test_site.py`, Prüfung im Browser über `nexongraph/tests/site_check.js` (Playwright)

**Interfaces:**
- Consumes: `load_cards` (Task 1), `check` (Task 3), `brief`-Logik für überfällige Angebote (Task 4), `render_viewer` und `viewer_payload` (NexonGraph 1.0), `graph.json` aus Task 2
- Produces:
  - `site_payload(root: Path, today: date) -> dict`: `{"built", "cards": [{id,type,title,status,updated,summary,fields,body}], "overdue": [ids], "issues": [...], "drive": state}`
  - `export_site(root: Path, out_dir: Path, today: date) -> Path`: schreibt `index.html` (Template `site.html`, die Daten ersetzen `/*__DATA__*/null`) und `graph.html` (Viewer) nach `out_dir` und gibt den Pfad von `index.html` zurück.
  - Seite:
    - Tabs: Lage, Produkte & Apps, Lösungen, Kunden, Piloten, Angebote, Partner, Regeln, Graph (Link auf `graph.html`), Suche.
    - Sprachumschalter RO/EN, Standard RO.
    - Die Statuswerte sind in beiden Sprachen übersetzt.
    - Karteninhalt bleibt Englisch. Body als Markdown, mit demselben kleinen Renderer wie `app.html`.
    - Überfällige Angebote in `#a8500f`.
    - Ersetzte Regeln sind eingeklappt.
    - Drive-Links öffnen in einem neuen Tab.
    - Nur helles Design. Kopfleiste mit Logo als Data-URI, grauer Statusstreifen, Fußzeile mit Logo. Ohne den Satz „Not audited, not certified“, weil es ein internes Werkzeug ist.

- [ ] **Step 1: Write the failing tests**

```python
def test_export_files(tmp_path): # Projekt mit 3 Karten → index.html und graph.html existieren, keine "http" in <script src> oder <link href>
def test_payload_overdue(tmp_path): # Angebot sent, valid_until gestern → id in payload["overdue"]
def test_no_drive_fulltext_fields(tmp_path): # payload enthält nur die Felder der Karten, keine Dateiinhalte aus drive
```

- [ ] **Step 2: Run** `pytest tests/test_site.py -q` → FAIL
- [ ] **Step 3: Implement** `site.py` und `site.html`.
- [ ] **Step 4: Run** `pytest -q` → PASS. Dann `node tests/site_check.js wissen/site/index.html` ausführen. Der Check öffnet die Seite bei 1440 px und 390 px, klickt durch alle Tabs und beide Sprachen und meldet JS-Fehler sowie `scrollWidth > innerWidth`. Erwartet: `errors [] overflow false`.
- [ ] **Step 5: Commit** `feat(nexongraph): RO/EN knowledge page export`

### Task 7: Grundgerüst und Erstbefüllung der Karten

**Files:**
- Create:
  - `wissen/README.md`: Kartenformat, Pflichtfelder, Statuswerte, Bereiche, auf Englisch. Das ist die Referenz für spätere Pflege.
  - `wissen/drive-quellen.md`: Ordner „Claude“, Meine Ablage, Konto `gabriel@nexonai.ro`, Bereich `mixed`
  - `wissen/.drive-stand.json`: Leerzustand
  - Karten in allen neun Bereichen
- Test: `nexongraph check .` (keine Fehler)

**Interfaces:**
- Consumes: Kartenformat (Task 1), `check` (Task 3), `brief` (Task 4)
- Produces: die Karten, auf die Task 8 und 9 aufbauen

- [ ] **Step 1: Quellen lesen.** `CLAUDE.md`, `unpruuf/CLAUDE.md`, `unpruuf/{PRODUCT_CONTEXT,EDITIONS,STATUS,SECURITY_CLAIMS,COMPLIANCE,MARKETING,BRANDING,README}.md`, die Ordnerstruktur, `nexongraph/README.md` und die Liste der veröffentlichten Artefakte (`Artifact list`).
- [ ] **Step 2: Karten schreiben.** Mindestens diese:
  - **Produkte:** `unpruuf-business`, `unpruuf-compliance`, `unpruuf-press`
  - **Apps:** `android-app`, `relay-server`, `relay-android`, `officer-app`, `license-tool`, `nexongraph`, sowie `ios-client` mit Status nach `STATUS.md`
  - **Lösungen:** Polizei, Klinik, Hinweisgeber und die weiteren aus dem Lösungs-Artefakt
  - **Material:** Website, Landingpage-Design, Whitepaper v7 EN/RO, Compliance-Film, Präsentationen (Auditor RO, Compliance EN), Kundenleitfaden, Vergleichsseite, Polizei-Konzept. Jeweils mit Artefakt-Link oder Pfad.
  - **Entscheidungen:** je Regel aus beiden `CLAUDE.md` eine Karte, z. B. `naming-unpruuf-compliance` (25.10.2026) oder `design-blue` (19.10.2026). Dazu `claims-forbidden` mit `forbidden_terms`.
  - **Kunden, Piloten, Angebote, Partner:** nur, was belegbar im Repo oder in Drive steht. Nichts erfinden. Bereiche ohne Belege bekommen keine Karte. Die Ordner bleiben mit `.gitkeep` angelegt.
- [ ] **Step 3: Prüfen.** `nexongraph check .` muss `0 errors` melden. Gemeldete Fehler beheben und erneut prüfen.
- [ ] **Step 4: Kurzlage ansehen.** `nexongraph brief .`: Prüfen, ob Produkte mit Status, Regeln und `Drive sync: never` erscheinen.
- [ ] **Step 5: Commit** `docs(wissen): initial knowledge cards`

### Task 8: Drive-Abgleich (erster Lauf und Ablaufbeschreibung)

**Files:**
- Create: `wissen/DRIVE-SYNC.md` (Ablauf aus Spec 7 als Schrittfolge für Claude, auf Englisch)
- Modify: Karten aus Drive, `wissen/.drive-stand.json`

**Interfaces:**
- Consumes: `drive_state.changed_files`, `mark_synced`, `mark_pending` (Task 4), Kartenformat (Task 1), Google-Drive-Verbindung (`search_files`, `read_file_content`, `get_file_metadata`)

- [ ] **Step 1: Zugriff prüfen.** Mit der Drive-Verbindung den Ordner „Claude“ suchen. Ist das verbundene Konto nicht `gabriel@nexonai.ro` oder der Ordner nicht sichtbar, hier anhalten. Gabriel bekommt eine Zeile, welches Konto verbunden ist und was zu tun ist (Ordner mit dem verbundenen Konto teilen oder `gabriel@nexonai.ro` als Verbindung einrichten). Dazu `mark_pending` schreiben.
- [ ] **Step 2: Auflisten** (rekursiv) und `changed_files` gegen den Stand ermitteln.
- [ ] **Step 3: Für jede geänderte Datei** den Inhalt lesen und nur Fakten auf die passende Karte schreiben (Kunde, Datum, Preis, Zusagen, Fristen, Drive-Link in `drive`). Unklare Zuordnung kommt nach `wissen/eingang/` mit `question`. Abweichungen werden unter `conflicts` eingetragen, nicht überschrieben.
- [ ] **Step 4:** `mark_synced`, dann `nexongraph check .` (0 Fehler) und `nexongraph brief .` (`Drive sync: last <heute>`).
- [ ] **Step 5: Commit** `docs(wissen): first drive sync`

### Task 9: Seite veröffentlichen und wöchentlicher Pflege-Lauf

**Files:**
- Modify: `wissen/site/*` (Export), `nexongraph/CHANGELOG.md` (1.1.0), `nexongraph/pyproject.toml` und `nexongraph/nexongraph/__init__.py` (Version `1.1.0`)

**Interfaces:**
- Consumes: `export_site` (Task 6), die Karten (Task 7/8)

- [ ] **Step 1: Seite exportieren und veröffentlichen.** `nexongraph export-site .`, dann mit dem Artifact-Werkzeug veröffentlichen: `file_path=wissen/site/index.html`, `files={"graph.html": "wissen/site/graph.html"}`, privat. Die URL wird in `wissen/material/knowledge-page.md` eingetragen.
- [ ] **Step 2: Geplanten Auftrag anlegen** mit `create_trigger`:
  - neue Sitzung je Lauf
  - montags 06:47 `Europe/Bucharest` (`CRON_TZ=Europe/Bucharest 47 6 * * 1`)
  - Verbindung: Google Drive
  - Prompt (eigenständig): Repo `nexonai` auf dem Arbeitszweig. Dann `wissen/DRIVE-SYNC.md` befolgen, `nexongraph check .` ausführen und behebbare Fehler korrigieren, `nexongraph export-site .` ausführen und das Artefakt unter der URL aus `wissen/material/knowledge-page.md` aktualisieren, über die GitHub-Verbindung prüfen, ob das Repo privat ist (sonst Warnung an Gabriel), committen und pushen. Gabriel nur bei offenen Fragen oder unlösbaren Widersprüchen kurz melden, auf Deutsch.
  - Die Trigger-ID wird in `wissen/README.md` eingetragen.
- [ ] **Step 3: Gesamtprüfung.**
  - `pytest -q` → alle grün
  - `bash scripts/wissen-start.sh` → Kurzlage
  - `nexongraph check .` → 0 Fehler
  - Seiten-Check (Task 6, Step 4) → ohne Fehler
- [ ] **Step 4: Changelog und Version auf 1.1.0, Commit und Push** `feat: NexonAI knowledge base 1.1.0`
