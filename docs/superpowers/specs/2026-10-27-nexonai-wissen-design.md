# NexonAI Wissen: Spezifikation

Stand: 27.10.2026 · Status: Entwurf zur Freigabe

## 1. Ziel

Eine Wissensbasis im Repo `nexonai`, damit Claude in jeder Cloud-Sitzung sofort weiß, was NexonAI baut und anbietet: Produkte, Apps, Lösungen, Web und Material, Kunden, Piloten, Preise und Angebote, Partner, Entscheidungen und Regeln.

Der Hauptnutzer ist Claude, Gabriel ist Nebennutzer.

Erfolg heißt:
- Claude fragt seltener nach.
- Claude hat Status, Zusagen, Preise, Namen und Regeln richtig im Kopf.
- Claude findet den passenden Code und das passende Material ohne langes Suchen.
- Gabriel muss nichts pflegen. Er sieht den Stand auf einer privaten Seite (RO/EN, auch am Handy).

## 2. Festgelegte Rahmenbedingungen

| Punkt | Festlegung |
|---|---|
| Quellen | Repo `nexonai` (Code, Docs, `CLAUDE.md`) und Google Drive (freigegebene Ordner) |
| Was aus Drive ins Repo darf | nur Fakten und Links, keine Volltexte |
| Ort | Ordner `wissen/` im Repo, Werkzeug ist NexonGraph (`nexongraph/`) |
| Pflege | ausschließlich durch Claude, Gabriel ändert über den Chat |
| Sprache der Karten | Englisch |
| Sprache der Seite für Gabriel | Rumänisch und Englisch (Umschalter) |
| Design der Seite | NexonAI-Design nach `CLAUDE.md` (Blau `#307098`, Open Sans, DejaVu Sans Mono, nur hell) |
| Personen | keine Zuweisungen an Gabriel, Norbert oder Floretta, keine Felder wie „Owner“ oder „Verantwortlich“, offene Punkte als „das Team“ |

## 3. Inhalt: Karten

Jede Karte ist eine Markdown-Datei mit Kopfdaten (YAML-Frontmatter) und Stichpunkten darunter. Es gibt eine Karte je Sache.

### 3.1 Bereiche und Ordner

| Ordner | `type` | Eine Karte je … | Wichtige Felder |
|---|---|---|---|
| `wissen/produkte/` | `product` | Produkt oder Edition | `status`, `products` (Editionen), `code`, `material`, `claims_allowed`, `claims_forbidden` |
| `wissen/apps/` | `app` | App oder Baustein | `status`, `code` (Repo-Pfade), `build`, `start`, `products` |
| `wissen/loesungen/` | `solution` | Branchenlösung | `status`, `products`, `industry` |
| `wissen/material/` | `material` | Website, Seite, Whitepaper, Präsentation, Film, Artefakt | `status`, `url` oder `path`, `languages`, `version`, `products` |
| `wissen/kunden/` | `customer` | Kunde oder Interessent | `status`, `industry`, `country`, `contacts` (Rollen), `products`, `drive` |
| `wissen/piloten/` | `pilot` | Pilotprojekt | `status`, `customer`, `products`, `start`, `end`, `goals`, `results` |
| `wissen/angebote/` | `offer` | Angebot oder Preisstand | `status`, `customer`, `products`, `price`, `currency`, `valid_until`, `drive` |
| `wissen/partner/` | `partner` | Partner oder Lieferant | `status`, `role` (z. B. Hosting, Vertrieb), `products`, `drive` |
| `wissen/entscheidungen/` | `decision` | Entscheidung oder Regel | `status` (`valid`/`superseded`), `date`, `scope` (z. B. `unpruuf`, `all`), `supersedes` |
| `wissen/gabriel/` | `profile`, `preference` | Profil (eine Karte) und je Vorliebe/Arbeitsregel eine Karte | `status` (`valid`/`superseded`), `date`, `topic`, `supersedes`; Beispiele: Antwortstil, Sprache, Format der Lieferungen (.bat, ZIP), was er nicht will, Arbeitszeiten, persönliche Änderungen |
| `wissen/eingang/` | beliebig | Dokument, dessen Zuordnung unklar ist | `question` |

### 3.2 Pflichtfelder für alle Karten

```yaml
---
type: product            # siehe Tabelle oben
id: unpruuf-compliance   # eindeutig, klein, mit Bindestrichen, gleich Dateiname ohne .md
title: unpruuf Compliance
status: tested           # erlaubte Werte je type, siehe 3.3
updated: 2026-10-27      # Datum der letzten inhaltlichen Änderung
summary: Reporting channel without identities, server run by the customer.
---
```

Verweise auf andere Karten laufen immer über deren `id`. Beispiele: `products: [unpruuf-compliance]`, `customer: clinic-alba`, `supersedes: [naming-safeline]`.
Verweise auf Code laufen über Repo-Pfade. Beispiel: `code: [unpruuf/officer-app]`.
Verweise auf Drive sind Listen mit Titel, Link und Änderungsdatum: `drive: [{title, url, modified, id}]`.

### 3.3 Erlaubte Statuswerte

| `type` | Werte |
|---|---|
| `product`, `app`, `solution`, `material` | `planned`, `in-progress`, `pilot`, `tested`, `live`, `paused`, `retired` |
| `customer` | `lead`, `talking`, `offer-sent`, `pilot`, `customer`, `paused`, `lost` |
| `pilot` | `planned`, `running`, `done`, `stopped` |
| `offer` | `draft`, `sent`, `accepted`, `declined`, `expired` |
| `partner` | `candidate`, `active`, `paused`, `ended` |
| `decision`, `preference` | `valid`, `superseded` |
| `profile` | `valid` |

### 3.4 Was nie auf eine Karte kommt

- Volltexte aus Drive.
- Gesundheits-, Ausweis-, Bank- oder Zugangsdaten.
- Private Kontaktdaten von Kundenpersonen. Erlaubt sind Rolle und Firma, z. B. „Compliance Officer, Klinik X“.
- Zuweisungen an Gabriel, Norbert oder Floretta.

### 3.5 Erstbefüllung

Claude legt die ersten Karten aus diesen Quellen an:
- `CLAUDE.md` und `unpruuf/CLAUDE.md` als Regeln und Entscheidungen.
- Die unpruuf-Docs: `PRODUCT_CONTEXT.md`, `EDITIONS.md`, `STATUS.md`, `SECURITY_CLAIMS.md`, `COMPLIANCE.md`, `MARKETING.md`, `BRANDING.md`.
- Die Ordner im Repo, aus denen die Apps hervorgehen.
- Die bekannten Artefakte und Materialien: Whitepaper, Präsentationen, Film, Landingpage, Lösungsseiten.
- Die freigegebenen Drive-Ordner für Kunden, Angebote, Partner und Piloten.

Was nicht eindeutig ist, landet in `wissen/eingang/` und wird Gabriel als Frage gestellt.

## 4. Werkzeug: Erweiterungen an NexonGraph

NexonGraph 1.0 (`nexongraph/`) bleibt die Grundlage. Neu kommt hinzu:

### 4.1 Karten-Extraktor (`extract_cards.py`)
- Erkennt Markdown-Dateien mit `type:` im Frontmatter als Karte.
- Knotenart ist der `type`, z. B. `product` oder `customer`. Die Knoten-ID ist `card::<id>`.
- Felder mit Karten-IDs werden zu Kanten mit fester Beziehung, alle mit der Herkunft EXTRACTED:

| Feld | Beziehung |
|---|---|
| `products` | `concerns` |
| `customer` | `for_customer` |
| `supersedes` | `supersedes` |
| `partner` | `with_partner` |
| `material` | `has_material` |

- `code`-Pfade werden zu Kanten `implemented_in`. Sie zeigen auf die Datei bzw. auf alle Dateien unter einem Ordner, gebündelt über einen Ordner-Knoten `dir::<pfad>`.
- Unbekannte IDs werden nicht verworfen. Sie erzeugen einen Prüffehler, siehe 4.3.

### 4.2 Kurzlage (`nexongraph brief`)
Ausgabe auf Englisch, höchstens etwa 60 Zeilen. Zuerst Gabriels gültige Vorlieben (kompakt, eine Zeile je Karte), danach:
- Produkte und Apps mit Status.
- Laufende Piloten.
- Offene Angebote mit Frist, überfällige zuerst.
- Neue oder geänderte Karten der letzten 7 Tage.
- Gültige Regeln der letzten 30 Tage.
- Offene Fragen aus `wissen/eingang/`.
- Ergebnisse der Prüfung (4.3).
- Stand des Drive-Abgleichs.

### 4.3 Prüfung (`nexongraph check`)
Meldet, mit Datei und Grund:
- Fehlende Pflichtfelder.
- Ungültiger `status` oder `type`.
- `id` passt nicht zum Dateinamen.
- Doppelte IDs.
- Verweis auf unbekannte Karte.
- `code`-Pfad existiert nicht.
- Angebot mit `valid_until` in der Vergangenheit und Status `sent`.
- Pilot mit `end` in der Vergangenheit und Status `running`.
- Karte seit über 90 Tagen nicht aktualisiert, bei Status `in-progress`, `pilot`, `running`, `talking` oder `offer-sent`.
- Widersprüche: zwei gültige Entscheidungen zum selben `scope` und Thema; ein Produkt, das in Material als „tested“ und auf seiner Karte als `pilot` geführt wird.
- Verbotene Begriffe aus den Regeln auf Kunden- oder Material-Karten, z. B. „safeline“, „certified“, „GDPR-compliant“.
- Hinweis, falls das Repo öffentlich ist (über die GitHub-Verbindung prüfbar, sonst übersprungen).

Rückgabewert: 0 ohne Fehler, 1 mit Fehlern. Warnungen ändern den Rückgabewert nicht.

### 4.4 Export für Gabriels Seite (`nexongraph export-site`)
Erzeugt eine eigenständige HTML-Seite und schreibt sie nach `wissen/site/index.html`. Inhalt siehe Abschnitt 6.

### 4.5 MCP und Abfragen
Die bestehenden Befehle `query`, `search`, `explain` und `path` funktionieren unverändert mit Karten.
`search` bekommt einen Filter nach Art: `--kind customer,offer`.

## 5. Arbeitsweise von Claude (Hauptzweck)

### 5.1 Sitzungsstart (automatisch)
`.claude/settings.json` im Repo trägt einen SessionStart-Hook ein, der `scripts/wissen-start.sh` ausführt:
1. NexonGraph installieren, falls es fehlt (`pip install -e nexongraph`, ohne Rückfrage).
2. Den Graphen über Repo und `wissen/` bauen, inkrementell.
3. `nexongraph brief` ausgeben. Die Ausgabe landet im Kontext der Sitzung.

Läuft der Start nicht durch, kommt eine Zeile „Wissensbasis nicht verfügbar: <Grund>“. Die Sitzung startet trotzdem.

### 5.2 Feste Regeln in `CLAUDE.md` (neuer Abschnitt „Wissensbasis“)
- Vor jeder Aufgabe zu einem Produkt, einer App, einer Lösung, einem Material, einem Kunden, einem Piloten, einem Angebot oder einem Partner zuerst im Graphen nachschlagen (`nexongraph query/explain/search`).
- Am Ende jeder Arbeitssitzung die betroffenen Karten aktualisieren (`status`, `updated`, Fakten, Links) und mit der Arbeit committen.
- Neue Regeln aus dem Chat sofort als `decision`-Karte mit Datum anlegen. Ersetzte Regeln auf `superseded` setzen.
- Persönliche Vorlieben und Änderungen von Gabriel (Antwortstil, Lieferformat, Sprache, was er nicht will) sofort als `preference`-Karte in `wissen/gabriel/` pflegen; ersetzte auf `superseded`.
- Nichts aus Drive als Volltext ins Repo.

### 5.3 Pflege-Wächter (automatisch)
Ein Stop-Hook führt `scripts/wissen-guard.sh` aus:
- Er vergleicht die Änderungen der Sitzung (git diff gegen den Stand beim Start) mit den Kartenänderungen.
- Hat die Sitzung Dateien außerhalb von `wissen/` geändert, deren Pfad in einem `code`- oder `path`-Feld einer Karte vorkommt, ohne diese Karte zu ändern, meldet er die Karte. Der Stop wird einmal blockiert, mit dem Hinweis „Karten nachziehen: …“.
- Neue Ordner unter einem Produktordner ohne passende App-Karte werden ebenfalls gemeldet.
- Eine Markierungsdatei verhindert eine Endlosschleife: höchstens eine Blockierung je Stand.

### 5.4 Wöchentlicher Pflege-Lauf
Ein geplanter Auftrag (Claude-Cloud, eine neue Sitzung je Lauf, mit Google-Drive-Verbindung) läuft montags früh und arbeitet in dieser Reihenfolge:
1. Drive abgleichen (Abschnitt 7).
2. `nexongraph check` ausführen und behebbare Fehler korrigieren.
3. Die Seite für Gabriel neu exportieren und veröffentlichen.
4. Committen und pushen.

Gabriel bekommt nur dann eine kurze Meldung, wenn eine Frage offen ist oder ein Widerspruch nicht lösbar war.

## 6. Gabriels Seite

- **Art:** privates Artefakt auf claude.ai im NexonAI-Design, RO/EN-Umschalter, nutzbar in Handy-Breite.
- **Aktualisierung:** nach jedem Pflege-Lauf und auf Zuruf.
- **Bereiche:**

| Bereich | Inhalt |
|---|---|
| Lage | Produkte mit Status, laufende Piloten, offene Angebote mit Frist (überfällig in `#a8500f`), Änderungen der letzten 7 Tage, offene Fragen |
| Produkte & Apps | je Produkt Status, Funktionen, Grenzen, erlaubte und verbotene Aussagen, Material, zugehörige Apps und Code-Ordner |
| Lösungen | je Lösung Problem, Produkt, Status |
| Kunden · Piloten · Angebote · Partner | Listen mit Status, ein Klick öffnet die Karte mit den Drive-Links |
| Regeln & Entscheidungen | gültige Regeln mit Datum, ersetzte eingeklappt |
| Über mich | Gabriels Profil und Vorlieben mit Datum, Änderungsverlauf |
| Graph | interaktive Ansicht wie `graph.html` |
| Suche | über alle Karten |

- **Grenzen:** kein Bearbeiten auf der Seite, keine Drive-Volltexte, keine Personen-Zuweisungen.
- **Sprache:** Die Oberfläche ist RO/EN. Karteninhalte erscheinen auf Englisch. Feste Begriffe wie Status und Bereiche werden übersetzt.

## 7. Drive-Abgleich

- **Quellen:** `wissen/drive-quellen.md` listet die freigegebenen Drive-Ordner mit Ordner-ID und Bereich. Der Bereich ist einer von `customer`, `offer`, `partner`, `pilot` oder `material`.
- **Ablauf:**
  1. Über die Google-Drive-Verbindung die Dateien der freigegebenen Ordner auflisten.
  2. Neu oder geändert gegenüber `wissen/.drive-stand.json` (Drive-ID → Änderungsdatum)? Dann den Inhalt lesen, Fakten herausziehen (Kunde, Datum, Preis, Zusagen, Fristen) und die passende Karte anlegen oder ergänzen. Der Drive-Link wird in `drive` eingetragen.
  3. `wissen/.drive-stand.json` aktualisieren.
- **Zuordnung unklar:** Karte in `wissen/eingang/` mit Feld `question`.
- **Widerspruch** (z. B. Preis auf Karte ≠ Preis im neuen Angebot): Nichts wird überschrieben. Die Karte bekommt einen Eintrag unter `conflicts`, der in Kurzlage, Prüfung und auf der Seite erscheint.
- **Drive nicht erreichbar:** Die Karten bleiben unverändert. Die Kurzlage zeigt „Drive sync pending since <Datum>“.

## 8. Datenschutz

- Das Repo muss privat bleiben, die Prüfung warnt sonst (4.3).
- Auf den Karten stehen nur Fakten und Links, siehe 3.4.
- Der Graph und die Seite enthalten nur, was auf den Karten und im Repo steht.
- Die Seite ist ein privates Artefakt. Teilen ist nur über das Teilen-Menü von claude.ai möglich, und das entscheidet Gabriel.

## 9. Tests

- **Karten-Extraktor:** Frontmatter wird gelesen, Felder werden zu Kanten, `code`-Pfade zu `implemented_in`, unbekannte IDs werden gemeldet.
- **Prüfung:** je Regel ein Test mit einer Fehlerkarte und einer korrekten Karte.
- **Kurzlage:** feste Testkarten, erwartete Abschnitte und Reihenfolge (überfällige Angebote zuerst).
- **Pflege-Wächter:** Testrepo mit Code-Änderung ohne Kartenänderung ergibt eine Blockierung; mit Kartenänderung keine; nur eine Blockierung je Stand.
- **Export der Seite:** HTML ohne externe Abhängigkeiten, RO/EN-Umschalter, keine JS-Fehler, keine waagrechte Scrollleiste bei 390 px Breite (geprüft mit Playwright).
- **Probelauf:** mit dem echten Repo nach der Erstbefüllung. Die Prüfung muss ohne Fehler durchlaufen.

## 10. Nicht enthalten

- Bearbeiten von Karten durch Gabriel auf der Seite.
- Volltextsuche in Drive-Dokumenten. Bei Bedarf liest Claude live über die Drive-Verbindung.
- Gmail und Kalender als Quellen. Das ist später möglich, aber nicht Teil dieses Plans.
- Mehrere Benutzer, Rechte und Rollen.

## 11. Offene Punkte für das Team

- Welche Drive-Ordner freigegeben werden, also der Inhalt von `wissen/drive-quellen.md`. Ohne diese Liste läuft der Drive-Abgleich nicht.
- Ob die Seite zusätzlich als Datei ins Repo kommt oder nur als Artefakt veröffentlicht wird. Vorgeschlagen: beides, siehe 4.4 und 6.
