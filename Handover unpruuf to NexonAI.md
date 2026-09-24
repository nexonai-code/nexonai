# Handover: unpruuf → NexonAI

Zusammenfassung dieses Chats für die beiden neuen Arbeits-Sessions (Norbert/iOS, Gabriel/Android).
Ziel: beide sollen ohne Rückfragen wissen, wo das Projekt herkommt, wo es steht, und wie hier
zusammengearbeitet wird.

---

## 1. Was gerade passiert ist (kurz)

`unpruuf` lag bisher als Unterordner in einem fremden Repo (`nexonaicons/YuE`), das eigentlich ein
unverwandtes ML-Research-Projekt war (case-vault, finetune, inference etc. als Geschwister-Ordner).
Für einen sauberen Neustart wurde daraus ein **eigenständiges, privates Repo** erzeugt:

- Neues Repo: **`nexon-code/nexonai`**
- Nur die tatsächlich von Git getrackten `unpruuf/`-Dateien wurden exportiert (326 Dateien) —
  automatisch ohne `node_modules/`, `build/`, `.gradle/`, `.idea/`, `local.properties` und jede
  Laufzeit-/Secret-Datei (SQLite-DBs, Identity-JSONs, License-Private-Key). Explizit nach Secrets
  gesucht — nichts gefunden.
- **Ein einziger sauberer Erstcommit** statt der kompletten alten Historie — bewusste Entscheidung
  für "ohne Altlasten". Die alte, ausführliche Commit-Historie existiert im Ursprungsrepo weiter,
  falls sie je gebraucht wird.
- Struktur: Repo-Root hat eine eigene `README.md` ("NexonAI — GRAL architecture apps", Dach für
  künftige GRAL-Apps), `unpruuf/` ist ein **Unterordner** darin (nicht der Repo-Root selbst) — so
  bekommt jede künftige GRAL-App ihren eigenen Top-Level-Ordner, ohne zu kollidieren.
- Über GitHub Desktop gepusht (`main`-Branch), dann zwei Arbeits-Branches erstellt und auf GitHub
  veröffentlicht: **`android`** (Gabriel) und **`ios`** (Norbert).
- Zwei neue Claude-Code-Sessions erstellt, je eine pro Branch (IDs siehe Abschnitt 8).

---

## 2. Repo-Struktur

```
nexonai/                      (Repo-Root)
  README.md                   Dach-Übersicht: NexonAI / GRAL-Architektur, Liste der Apps
  unpruuf/                    Das eigentliche Projekt — alles hier drunter
    README.md                 Einstieg: Directory-Map, Build-Anleitung pro Komponente
    HANDOFF.md                ZUERST LESEN — Arbeitskontext, wer wer ist, was gilt
    STATUS.md                 Vollständiger technischer Stand — die Quelle der Wahrheit
    CHANGELOG.md               Auslieferungshistorie, neueste zuerst
    NODE_MESH_SPEC.md          Spec für die Business/Node-Mesh-Produktlinie
    CROSS_PLATFORM_PLAN.md     Wire-Protokoll/Design für iOS↔Android-Interop
    SECURITY_CLAIMS.md         Bedrohungsmodell — was geschützt ist, was explizit nicht
    EDITIONS.md                 Standard/Pro/Client-Editionen, Pairing-Regeln
    COMPLIANCE.md, PATENT_DISCLOSURE.md, MARKETING.md, BRANDING.md   Business-Referenz
    app/                        Android-App (Kotlin, Jetpack Compose) — Gabriels Bereich
    ios/                        iOS-App (Swift) — Norberts Bereich
    server/                     Node.js Relay-Server (optional für Android, Pflicht für iOS)
    relay-android/              Nativer Android-Relay (eigener Gradle-Root)
    node-mesh-server/           Business/Node-Mesh-Server (Owner-only Write, Read-only Fetch)
    license-tool/                Offline-Ed25519-Lizenzsystem für Standard/Pro
    relaypool-tool/               Kleines Utility für Relay-Pool-Verwaltung
```

---

## 3. Pflichtlektüre beim Start jeder Session

1. **`unpruuf/HANDOFF.md`** — zuerst. Wer die Leute in den Docs sind, wie hier gearbeitet wird,
   der wichtigste technische Fakt (siehe Abschnitt 4).
2. **`unpruuf/STATUS.md`** — danach. Die vollständige, autoritative Quelle für den technischen
   Ist-Zustand. Im Zweifel gewinnt dieses Dokument.
3. Je nach Bereich zusätzlich: `NODE_MESH_SPEC.md` (Business-Linie), `CROSS_PLATFORM_PLAN.md`
   (Wire-Protokoll iOS↔Android), `SECURITY_CLAIMS.md` (Threat Model).

---

## 4. Wichtigster technischer Fakt — für beide Seiten relevant

**Weder der Android- noch der iOS-Code wurde in der bisherigen Arbeitsumgebung je kompiliert**
(kein Android SDK, kein Xcode dort verfügbar). Jede Änderung wurde strukturell geprüft
(Klammern-/Typ-Balance von Hand), aber **nie build-verifiziert**, bis ein Mensch es tatsächlich
kompiliert. Das gilt unverändert auch für die neuen Sessions, außer ihr baut in einer Umgebung mit
echtem SDK/Xcode. Immer den genauen Fehlertext zurückmelden, falls beim Bauen etwas auffällt —
das lässt sich meist sofort beheben.

Bekannte Lücke: am Repo-Root von `unpruuf/` liegt nur `gradlew.bat`, kein Unix-`gradlew` — die
Android-App wurde bisher nur über Android Studios eigene Gradle-Integration gebaut, nie über die
Kommandozeile auf Linux/Mac. Bei Bedarf `gradle wrapper` neu generieren.

---

## 5. Aktueller technischer Stand (Node-Mesh / Business-Linie)

Aus diesem Chat heraus wurde die komplette Business/Node-Mesh-Produktlinie neu gebaut, Schritt für
Schritt (Details jeweils in `CHANGELOG.md` und `NODE_MESH_SPEC.md`):

- **v1.09** — gebündeltes Relay-Poll (`fetchMany`), adaptives Poll-Intervall, Relay-Owner-Rhythmus.
- **v1.10** — Business/Mandatory-Pairing vereinheitlicht: Android↔Android unter Mandatory-Modus
  nutzt jetzt dasselbe onion-lose Pairing-Format wie Cross-Platform (iOS-Interop).
- **`node-mesh-server/`** (neues, eigenständiges Node.js-Paket, Phase 1) — Owner-only Deposit,
  read-only Fetch/FetchMany, TTL-only Cleanup. Voll getestet.
- **Phase 2a/2b (Android)** — Fundament + Ende-zu-Ende: eigener Pairing-QR-Modus "Business
  (Node-Mesh)", eigener Poll-Loop, Versand auf alle eigenen Nodes gleichzeitig.
- **Phase 3 — v1.13**: Adressmigration eines eigenen Nodes (Kontakte werden automatisch
  benachrichtigt) + `fetchMany`-Bündelung über mehrere Kontakte hinweg (ein Aufruf pro
  eindeutiger Node-Adresse statt pro Kontakt).
- **Phase 3c — v1.14**: **Temp Node** — ein per-Chat, einmaliger Zusatz-Node (z. B. Zweitgerät auf
  Reisen), inkl. Bestätigungs-/Heartbeat-Logik mit automatischem Fallback auf die Standard-Nodes.
- **Windows-Binary für `node-mesh-server`** — eigenständige `unpruuf-node-mesh.exe`, kein
  separates Node.js zum Ausführen nötig (Node SEA + esbuild + postject, gleiche Technik wie beim
  bestehenden `unpruuf-relay.exe`). **Echt gebaut UND ausgeführt** (Linux als Windows-Ersatz, da
  keine Windows-Maschine verfügbar war) — alle Endpunkte real getestet. **Nicht verifiziert:**
  ein echter Lauf auf echtem Windows.

**Damit ist `NODE_MESH_SPEC.md` laut eigener Versionshistorie vollständig umgesetzt** — keine
offenen Punkte mehr aus der Spec selbst. Was als Nächstes ansteht, ist Sache der beiden neuen
Sessions (Android-Feinschliff bei Gabriel, iOS-Anbindung bei Norbert) — `STATUS.md` sagt, was für
den jeweiligen Bereich sonst noch offen ist.

---

## 6. Branch- und Account-Setup

- **Gleiches GitHub-Konto** (`nexon-code`) und **gleiches Claude-Konto** für Gabriel und Norbert —
  keine Collaborator-Einladung nötig, aber dafür Branch-Disziplin umso wichtiger (siehe Abschnitt 7).
- `main` = sauberer, zusammengeführter Stand. **Nie direkt bearbeiten.**
- `android` → Gabriel, arbeitet an `unpruuf/app/` (und ggf. `unpruuf/relay-android/`).
- `ios` → Norbert, arbeitet an `unpruuf/ios/`.
- Zusammenführen ausschließlich über Pull Requests auf GitHub (`android`/`ios` → `main`).

---

## 7. Spielregeln

1. **Nie direkt auf `main` arbeiten** — jede Änderung läuft über den eigenen Branch.
2. **Beim Start jeder Session den richtigen Branch bestätigen** — Gabriel `android`, Norbert
   `ios`. Die beiden unten verlinkten Sessions sind bereits korrekt auf ihrem Branch erstellt;
   bei jeder weiteren neuen Session das nochmal explizit prüfen.
3. **Eigenen Commit-Namen setzen** (einmalig pro Projektordner, da der GitHub-Login gleich ist):
   ```bash
   git config user.name "Gabriel Hategan"
   git config user.email "<gabriels-email>"
   ```
   entsprechend bei Norbert mit seinem eigenen Namen.
4. **Nicht gleichzeitig auf demselben Branch arbeiten** — sollte ohnehin nicht vorkommen, da
   `android` und `ios` unterschiedliche Ordner anfassen. Falls doch: vorher immer Fetch/Pull.
5. **Zusammenführen über Pull Requests**, nicht manuell — GitHub → Pull requests → New pull
   request → `android`/`ios` → `main` → beschreiben → mergen.
6. **Vor jedem Session-Start kurz prüfen:** richtiger Branch? lokaler Stand aktuell?

---

## 8. Die zwei neuen Sessions

| Wer | Branch | Bereich | Session-ID |
|---|---|---|---|
| Norbert | `ios` | `unpruuf/ios/` | `session_01M471Zca1k7sF7Dqyh446eo` |
| Gabriel | `android` | `unpruuf/app/` | `session_011VtD8gnvrbSGnHENw4gQdz` |

Beide wurden direkt mit `source_url = https://github.com/nexon-code/nexonai` und dem jeweils
korrekten `source_revision` (Branch) erstellt — kein manuelles Auswählen mehr nötig, einfach in
der Claude-App öffnen.

---

## 9. Vorschlag: erster Prompt für jede neue Session

**Für Norbert (iOS-Session):**
> Lies zuerst `unpruuf/HANDOFF.md`, danach `unpruuf/STATUS.md`. Du arbeitest auf dem Branch `ios`
> an der iOS-App (`unpruuf/ios/`) — relay-mandatory, kein direktes P2P, siehe
> `CROSS_PLATFORM_PLAN.md` für das Wire-Protokoll gegenüber Android. Bestätige kurz, dass du den
> aktuellen Stand (Architektur, was schon gebaut ist, was für iOS noch offen ist) verstanden hast,
> bevor wir mit der eigentlichen Arbeit anfangen. Committe ausschließlich auf `ios`, niemals auf
> `main`.

**Für Gabriel (Android-Session):**
> Lies zuerst `unpruuf/HANDOFF.md`, danach `unpruuf/STATUS.md`. Du arbeitest auf dem Branch
> `android` an der Android-App (`unpruuf/app/`) und ggf. `unpruuf/relay-android/`. Bestätige kurz,
> dass du den aktuellen Stand (Architektur, Editions, was zuletzt gebaut wurde — insbesondere die
> Node-Mesh/Temp-Node-Arbeit, siehe `NODE_MESH_SPEC.md`) verstanden hast, bevor wir mit der
> eigentlichen Arbeit anfangen. Committe ausschließlich auf `android`, niemals auf `main`.
