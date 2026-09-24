# unpruuf Business — Node-Mesh Architektur
## Implementierungs-Briefing für Claude Code

**Status:** Architektur-Spezifikation für den Business-Zweig von unpruuf, noch **nicht
implementiert**. Ersetzt/erweitert den aktuellen "optionaler Relay, TTL-begrenzt,
Opt-in"-Mechanismus aus `PRODUCT_CONTEXT.md` für alle Business-/Compliance-Deployments. Der
bestehende Android-P2P-Chat bleibt als eigenständiges Produkt unverändert bestehen (siehe
Abschnitt 0).

**Versionsgeschichte dieses Dokuments:**
- **v1 (Entwurf):** Aus einer Architektur-Diskussion mit Claude Chat. Modell: Sender legt
  Nachrichten auf den Nodes des **Empfängers** ab; Empfänger holt bei sich selbst ab.
- **v2:** Nach fachlicher Prüfung mit Claude Code umgedreht: Sender legt Nachrichten auf den
  **eigenen** Nodes ab; Empfänger holt beim **Absender** ab. Grund und Abwägung siehe
  Abschnitt 1. Zusätzlich: Schreibzugriff wird Owner-only (nie mit Kontakten geteilt), Abholen
  wird rein lesend (kein Delete-on-Fetch mehr, Aufräumen nur über TTL).
- **v3:** Alle in v2's Abschnitt 12 noch offenen Punkte entschieden — Rotation/TTL-Entkopplung
  bestätigt (mit Formel statt fixer Zahl), konkrete Default-Werte festgelegt, Reset gegenüber
  TTL-Cleanup präzise abgegrenzt, Ein-Node-Migrationslücke mit einer bewusst ehrlichen (nicht
  erfundenen) Antwort geschlossen. Keine offenen Punkte mehr — Abschnitt 12 dient seitdem als
  Entscheidungs-Log, nicht mehr als offene Liste.
- **Phase 1 gebaut:** `unpruuf/node-mesh-server/` existiert — Abschnitt 8's API (`PUT /deposit`,
  `GET /fetch`, `POST /fetchMany`), Owner-only-Auth, TTL-only Cleanup, vollständig getestet
  (`npm test`, 24/24). Android/iOS-Client, gebündeltes Tor-Prozessmanagement, Windows/Linux-
  Binary, Temp Node, Adressmigration, redundantes Multi-Node-Deposit waren noch **nicht** gebaut.
- **Phase 2a gebaut:** Android-Fundament-Bausteine — `IdentityManager.myNodeMeshRoutingSeed`/
  `nodeMeshPairSecret`/`nodeMeshEpoch`/`nodeMeshRoutingTag`/`nodeMeshToleranceEpochs`
  (Abschnitt 2/3's Krypto, echtes zweites eigenständiges Secret, nie mit `pairSecret`/Ratchet-Salt
  vermischt), `NodeMeshManager.kt` (eigener Node-Pool dieses Geräts, zwei getrennte
  String-Formate für Owner-Secret vs. Kontakt-Adressliste), `NodeMeshClient.kt` (HTTP-Client für
  `/deposit`/`/fetch`/`/fetchMany`), `Contact.nodeMesh`/`theirNodeMeshRoutingSeed`/
  `theirNodeAddresses` (`AppDatabase` v7 → v8).
- **Phase 2b gebaut (dieses Dokument, Status-Update):** Ende-zu-Ende funktionsfähig. Neuer
  Pairing-QR/-Screen (`NodeMeshPairing.kt`, dritter Chip in `QrPairScreen.kt`, eigenes,
  Edition-unabhängiges Format — kein Onion, kein Wire-Identity-Konzept, siehe Abschnitt 2), neue
  Settings-Sektion "Business Node-Mesh" zum Einrichten eigener Nodes, und die vollständige
  `P2PNetworkManager`-Anbindung: senden legt auf ALLEN eigenen erreichbaren Nodes ab
  (`depositToOwnNodes`, Abschnitt 5's Redundanz-Regel wörtlich umgesetzt), ein eigener,
  von `startRelayPoll` unabhängiger Poll-Loop (`pollNodeMeshOnce`) fragt bei jedem Node-Mesh-
  Kontakt dessen eigene Nodes über das per Formel berechnete Toleranzfenster ab (gebündelt via
  `fetchMany`, kein Delete-on-Fetch — Abschnitt 4). `resolveSender` wurde um einen
  Node-Mesh-Zweig erweitert, der den bestehenden Dedup-Mechanismus (`ingestPacket`) unverändert
  mitnutzt, indem der Routing-Tag an derselben Parameter-Position wie sonst die Wire-ID
  übergeben wird — kein neuer Ingest-Pfad nötig. Onion-spezifische Signale
  (`sendMainOnionUpdate`/`sendVerifiedOnionUpdate`) werden für Node-Mesh-Kontakte übersprungen;
  identitätsbasierte Signale (NEW_IDENTITY, Wechsel, Relay-Owner-Wechsel) gelten für Node-Mesh
  schon architektonisch nicht (kein Identity-/Relay-Pool-Konzept) und werden dafür nie ausgelöst.
  **Noch nicht gebaut:** Temp Node, Adressmigration (Abschnitt 6), redundante Multi-Node-Poll-
  Optimierung analog zu `fetchMany`-Batching über mehrere Kontakte hinweg (aktuell ein
  `fetchMany`-Aufruf pro Kontakt-Node, nicht gebündelt über Kontakte). Nicht build-verifiziert
  (kein Android-SDK hier) — auf Klammern-/Konsistenz-Balance geprüft.
- **Phase 3 (Teil 1+2) gebaut — v1.13:** Adressmigration (Abschnitt 6) und `fetchMany`-Bündelung
  über mehrere Kontakte hinweg. Adressmigration: `NodeMeshManager.migrateMyNode()` ersetzt lokal
  Adresse bei gleichbleibendem Owner-Secret (die Node-Identität hängt nicht von ihrer
  Netzwerkadresse ab); die Ankündigung an Kontakte (`sendNodeMigrationSignal`/
  `sendNodeMigrationSignalToAll`, neues `UNPRUUF_NODEMIGRATE_V1:`-Signal) läuft über die normale
  Zustellungs-Queue, die ohnehin jeden aktuell konfigurierten eigenen Node versucht und einzelne
  Fehlschläge toleriert — solange `migrateMyNode` VOR dem Versenden läuft, ist "nie über den sich
  ändernden Node selbst ankündigen" damit automatisch erfüllt, ganz ohne Sonderfall. Empfangsseite
  in `ingestPacketInner` ersetzt beim Kontakt gezielt die alte durch die neue Adresse (nicht die
  ganze Liste), dedupliziert, deckelt auf `NODE_POOL_MAX_SIZE`. Neue Settings-UI: pro eigenem Node
  ein "Migrate"-Button mit Inline-Eingabefeld. `fetchMany`-Bündelung: `pollNodeMeshOnce()` sammelt
  jetzt vor dem Abfragen alle Toleranzfenster-Tags ALLER Node-Mesh-Kontakte, gruppiert nach
  eindeutiger Node-**Adresse** (nicht mehr pro Kontakt), und macht genau einen `fetchMany`-Aufruf
  pro eindeutiger Adresse — exakt das bewährte `tagsByTarget`-Muster aus `pollRelayOnce()` (v1.09).
  Degradiert kostenlos auf "ein Aufruf pro Kontakt", falls Nodes wirklich pro Person eindeutig
  sind — reiner Gewinn, keine Regression.
- **Phase 3c gebaut — v1.14: Temp Node (Abschnitt 7).** Letztes Stück von Phase 3, damit
  NODE_MESH_SPEC.md vollständig umgesetzt. Siehe Abschnitt 7's neuer **[v4]**-Block für die
  Implementierungsentscheidungen im Detail (Pairing-Reihenfolge vereinfacht, ein einziger
  Zustands-Flag für Bestätigung+Wiederaufnahme, Dual-Deposit bis zur ersten Bestätigung).
  `node-mesh-server`: neuer `EPHEMERAL=1`/`--ephemeral`-Modus (`npm run start:tempnode`) —
  Identität und Message-Store beide nur im Prozessspeicher, nie auf Platte, jeder Neustart eine
  neue Node-Identität (`npm test` weiterhin 24/24). Android: `Contact.tempNodeAddress`/
  `tempNodeOwnerSecret`/`tempNodeActive`/`theirTempNodeAddress` (`AppDatabase` v8 → v9), neuer
  Chat-Screen-Dialog "Temp Node" (Scan/Paste desselben `unpruuf-node-owner:v1:...`-Formats wie
  Settings' Standard-Node-Setup, nur kontakt-gebunden), zwei neue Steuersignale
  (`UNPRUUF_TEMPNODE_V1:`/`UNPRUUF_TEMPNODE_OFF_V1`), `P2PNetworkManager.depositForNodeMesh`
  (routet Deposits durch den Temp Node, sobald aktiv, mit Fallback-Sicherheitsnetz auf den
  Standard-Pool bei einem einzelnen fehlgeschlagenen Versuch), `startTempNodeHeartbeat()`
  (2-Minuten-Intervall, 3 Fehlschläge in Folge lösen den automatischen Fallback aus),
  `theirTempNodeAddress` zusätzlich zur Standard-Adressliste in `pollNodeMeshOnce()` abgefragt.
  Nicht build-verifiziert (kein Android-SDK hier) — auf Klammern-/Konsistenz-Balance geprüft;
  `node-mesh-server`-Änderung echt getestet (`npm test`).
- **Windows-Binary gebaut — v1.14 (node-mesh-server).** Abschnitt 8's zuvor einzig noch offener
  Baustein. `node-mesh-server/build-exe.js` + neue `src/sea-entry.ts`/`src/sqliteNativeBinding.ts`
  — identische Node-SEA-Technik wie `unpruuf/server/`s `unpruuf-relay.exe` (siehe Abschnitt 8's
  neuer **[v4]**-Absatz und `node-mesh-server/EXE_BUILD.md` für den vollen Verifikationsstatus).
  Echt end-to-end auf Linux gebaut UND ausgeführt: `/health`/`/deposit`/`/fetch`/`/fetchMany` alle
  gegen die reale gebaute Binary getestet, `EPHEMERAL`-Modus nachweislich ohne Datei-Spuren.
  `npm test` weiterhin grün (jetzt 26/26, zwei neue Tests für den nativen-Binding-Override). Nicht
  verifiziert: ein echter Lauf auf echtem Windows (kein Windows-Rechner verfügbar). **Damit ist
  NODE_MESH_SPEC.md vollständig implementiert** — keine offenen Punkte aus Abschnitt 12/den
  Phase-Status-Notizen mehr übrig.

Alles hier Beschriebene ist neu gegenüber dem aktuellen Repo-Stand. Wo v1→v2→v3 etwas geändert
hat, ist das mit **[v2]**/**[v3]** markiert.

---

## 0. Scope-Abgrenzung — zwei Produkte, ein Krypto-Kern

| | Android P2P Chat (bestehend) | unpruuf Business / Node-Mesh (neu) |
|---|---|---|
| Transport | Direktes Tor-Rendezvous zwischen zwei Geräten, LAN-Fastpath | Ausschließlich über Node(s), nie direkt |
| Node | Optional, Opt-in-Fallback | **Mandatory** |
| Plattformen | Android | Windows, Linux, Android als Node-Host; Windows, Linux, Android, iOS als Client |
| iOS | Nicht unterstützt | Client-only (kann nie selbst Node sein) |

**Wichtig:** Double Ratchet (X25519-DH-Ratchet + HKDF-Kettenschlüssel + XChaCha20-Poly1305) und
die gesamte Nachrichten-Verschlüsselungslogik bleiben identisch und werden als gemeinsame
Bibliothek genutzt — nicht duplizieren. Was sich ändert, ist ausschließlich die
**Transport-/Routing-Schicht** darunter.

---

## 1. Grundprinzip [v2: Schreib-/Leserichtung umgedreht]

Zwei Kontakte kommunizieren nie direkt miteinander und lernen sich netzwerkseitig nie kennen.
Jeder betreibt seine eigene Node-Infrastruktur (**nie von NexonAI gehostet** — der Kunde
betreibt seine eigenen Nodes, das ist die rechtliche und vertrauenstechnische Grundlage).

**Jeder schreibt ausschließlich auf seinen EIGENEN Nodes. Jeder holt ausschließlich bei den
Nodes SEINER KONTAKTE ab.** Absender A legt eine Nachricht auf A's eigenen Nodes ab. Empfänger
B pollt A's Nodes und holt sie dort ab.

**Warum umgedreht gegenüber v1 (A legt bei B ab, B holt bei sich selbst ab):**

| | v1: Schreiben beim Empfänger | v2: Schreiben bei sich selbst |
|---|---|---|
| Sendezuverlässigkeit | Hängt vom Kontakt: ist SEIN Node gerade down, schlägt MEIN Senden fehl | Entkoppelt: mein Schreiben gelingt praktisch immer, da eigene Infrastruktur |
| Datenhoheit | Mein Node speichert fremde Inhalte, die andere ungefragt bei mir ablegen | Mein Node speichert ausschließlich, was ich selbst verfasst und freigegeben habe |
| Schreibzugriff auf meinen Node | Muss für jeden Kontakt offen/autorisiert sein (geteiltes Geheimnis) | Braucht **niemand außer mir selbst** — siehe Abschnitt 8 |
| "Nur halbe Konversation pro Node" | Gilt (nur Eingehendes) | Gilt genauso (nur Ausgehendes) — **keine neue Eigenschaft, bleibt in beiden Modellen erhalten** |

Die Richtungstrennung (Abschnitt 4) ist in beiden Modellen strukturell gleich stark. Der
eigentliche Gewinn von v2 ist die Verschiebung der Kontrolle: Sende-Zuverlässigkeit und
Datenhoheit liegen jetzt vollständig bei der schreibenden Seite selbst, und — am wichtigsten —
der Schreib-Zugriff auf einen Node muss nie mehr mit einem Kontakt geteilt werden (siehe
Abschnitt 8).

**Wichtige Einschränkung dieser Eigenschaft:** "Kein Node sieht beide Richtungen" gilt nur,
solange A's und B's Nodes von wirklich unabhängigen Parteien betrieben werden. Teilen sich zwei
Kunden denselben Node-Hosting-Anbieter, oder betreibt eine Firma die Nodes mehrerer ihrer
Mitarbeiter auf derselben Infrastruktur, sieht dieser eine Betreiber wieder beide Richtungen.
Das ist eine Annahme über die Deployment-Topologie, keine kryptographische Garantie — sollte in
der Kundenkommunikation so benannt werden, nicht als absolute Eigenschaft verkauft werden.
Ebenfalls wichtig: das ist eine Aussage über **Node-Kompromittierung** (was auf der Platte
steht), nicht über **Netzwerk-Traffic-Analyse** — ein globaler passiver Beobachter kann Timing
zwischen "A schreibt auf A's Node" und "B pollt A's Node kurz danach" weiterhin korrelieren, das
bleibt das allgemeine, ungelöste Tor-Problem (siehe `SECURITY_CLAIMS.md` Punkt 7).

Beim Pairing tauschen beide Kontakte aus:

- dass es sie gibt (Pairing-Geheimnis, wie bisher per QR-Code)
- **die eigenen** Node-Adressen (damit der Kontakt weiß, wo er später pollen muss)
- mit welchem Code sie die Nachrichten des jeweils anderen wiederfinden (Abhol-Code, s.
  Abschnitt 3)

---

## 2. Zwei Codes, zwei getrennte Aufgaben — nicht vermischen

Das ist der wichtigste Punkt der gesamten Spezifikation, unverändert gegenüber v1:

| | Abhol-Code (Routing-Tag) | Verschlüsselungs-Schlüssel (Ratchet) |
|---|---|---|
| Aufgabe | Sagt dem Node, welche Nachricht für wen bestimmt ist | Macht die Nachricht lesbar |
| Sichtbar für Node | Ja (das ist sein einziger Ablage-Schlüssel) | Nie |
| Rotiert | Ja, regelmäßig | Läuft unabhängig über den bestehenden Ratchet weiter |
| Bei Kompromittierung | Angreifer sieht nur, dass irgendein Umschlag abgeholt wurde — nichts über Inhalt oder Identität | Angreifer kann diese und künftige Nachrichten lesen (daher Ratchet, nicht statischer Schlüssel) |

**Implementierungsregel [v2 verschärft]:** `shared_pairing_secret` (für Routing) und der
Ratchet-Bootstrap-Seed werden als **zwei eigenständige Secrets beim Pairing etabliert**, nicht
als ein gemeinsames Wurzelsekret mit domain-separierten HKDF-`info`-Strings. Das bestehende
Android-P2P-Produkt macht Letzteres (`IdentityManager.pairSecret()` speist sowohl den Wire-Tag
als auch den Ratchet-Salt, nur mit unterschiedlichem Kontext-String) — für den Business-Zweig,
der als neue, eigenständige Spezifikation ohnehin frisch gebaut wird, ist die strengere Variante
vorzuziehen: kein gemeinsames Wurzelsekret, aus dem beides abgeleitet wird.

### Ableitung des Abhol-Codes

```
epoch_counter   = floor(unix_time / rotation_interval)
routing_tag     = HKDF(shared_pairing_secret, info = "routing" || epoch_counter)
```

- `shared_pairing_secret`: beim Pairing einmalig etabliertes, vom Ratchet-Seed unabhängiges
  Geheimnis.
- Epochen-Zähler statt roher Systemzeit verwenden — robuster gegen Uhr-Drift zwischen Geräten.
- `routing_tag` wird beim Ablegen UND beim Abholen verwendet, nie die Nachricht selbst.
- **[v2]** Der Routing-Tag ist jetzt zusätzlich das einzige Zugriffs-Credential für's Abholen
  (siehe Abschnitt 8) — er muss also aus einem Raum stammen, der gegen Brute-Force praktisch
  unangreifbar ist. HMAC-SHA256-Output erfüllt das (2²⁵⁶ Möglichkeiten); mit der bestehenden
  Tag-Zeichenklasse (`[A-Za-z0-9+/=_-]{1,64}`) aus dem heutigen Relay-Code weit übererfüllt.

---

## 3. Rotation ↔ TTL — entkoppelt, mit Formel [v3: bestätigt + präzisiert]

**v1-Vorschlag war:** `rotation_interval ≥ TTL` als harte Invariante, damit beim Poll nie mehr
als zwei Tags (aktuell + vorherig) geprüft werden müssen.

**Bestätigt für v3: Nicht koppeln.** Rotation und TTL bleiben unabhängig konfigurierbar, wie im
bestehenden Android-P2P-Produkt (`IdentityManager.currentHourBucket()` rotiert stündlich,
unabhängig vom Relay-TTL-Default von 6h). Der Grund für die v1-Kopplung — "sonst müssen zu viele
Tags pro Poll geprüft werden" — ist mit `POST /v1/fetchMany` (siehe `CHANGELOG.md`, v1.09)
hinfällig: beliebig viele Tags werden in **einem** Request gebündelt, der Kostenunterschied
zwischen 2 und 7 Tags ist marginal. Eine harte Kopplung würde dagegen einen echten Zielkonflikt
erzwingen: lange TTL (gut für Offline-Zustellung) würde zwangsläufig lange Rotation erzwingen
(schlechter für Unlinkability). Entkoppelt bekommt man beides gleichzeitig.

**Toleranzfenster-Formel [v3, neu — ersetzt den fixen "2 Tags"-Vorschlag aus v1]:** Statt eine
feste Anzahl Tags zu prüfen, wird das Toleranzfenster aus dem tatsächlichen Verhältnis von TTL
zu Rotation abgeleitet — dann ist es für JEDE Kombination aus `rotation_interval`/TTL korrekt,
egal welche Werte ein Deployment wählt:

```
tolerance_window_epochs = ceil(TTL / rotation_interval) + 1
```

Das `+1` deckt Geräte-Uhr-Drift zwischen den Peers ab (siehe Abschnitt 2's Epochen-Zähler-
Begründung). Der Poller fragt `epoch_counter` sowie die `tolerance_window_epochs` vorherigen
Epochen ab, alle in einem `fetchMany`-Request.

**Konkrete Defaults [v3, festgelegt]:**
- `rotation_interval`: **1 Stunde** — identischer Default wie das bestehende Android-Produkt,
  bewusst konsistent statt eine zweite, unbegründete Zahl einzuführen.
- `TTL`: **6 Stunden** — ebenfalls konsistent mit dem bestehenden Relay-Default
  (`server/src/config.ts`'s `DEFAULT_TTL_HOURS`).
- Daraus: `tolerance_window_epochs = ceil(6/1) + 1 = 7` Tags pro Poll-Runde (Default).
- Beide Werte bleiben **pro Kunden-Deployment konfigurierbar** (nicht hart codiert) —
  unterschiedliche Compliance-Anforderungen brauchen unterschiedliche Werte; die Formel bleibt
  dabei automatisch korrekt, ohne dass irgendwo ein zweiter, von Hand synchron zu haltender
  Toleranzwert gepflegt werden müsste.

**Zu implementieren:**
- Konfigurierbarer `rotation_interval` und `TTL`, unabhängig voneinander; Toleranzfenster wird
  **berechnet**, nie separat konfiguriert.
- Beim Poll alle Tags im berechneten Toleranzfenster in **einem** gebündelten Request abfragen
  (Node-Mesh-Äquivalent von `fetchMany`), Ergebnisse zusammenführen.

---

## 4. Nachrichtenfluss [v2: Richtung + Cleanup-Mechanismus geändert]

```
1. Sender verschlüsselt Nachricht mit aktuellem Ratchet-Schlüssel.
2. Sender berechnet routing_tag für den aktuellen epoch_counter.
3. Sender legt Ciphertext + TTL bei ALLEN erreichbaren EIGENEN Nodes ab
   (bis zu 3, siehe Abschnitt 5) — Owner-only-Schreibzugriff, siehe Abschnitt 8.
4. Empfänger pollt periodisch (oder erhält Push-Trigger) bei den Nodes SEINES KONTAKTS,
   fragt routing_tag(aktuell) und alle Tags im Toleranzfenster ab (Abschnitt 3), gebündelt
   in einem Request.
5. Empfänger dedupliziert über Message-ID (nicht über Tag — mehrere eigene Nodes des Kontakts
   können dieselbe Nachricht halten).
6. **[v2] Kein Delete-on-Fetch mehr.** Abholen ist rein lesend — der Fetch-Endpunkt braucht
   dafür keine Schreib-/Löschrechte, die an den Kontakt vergeben werden müssten (siehe
   Abschnitt 8, Begründung).
7. Läuft die TTL ab: Node löscht automatisch, unabhängig davon, ob/wie oft die Nachricht
   zwischendurch gelesen wurde.
```

**Trade-off durch Punkt 6 [v2]:** Eine bereits gelesene Nachricht bleibt bis zum TTL-Ablauf auf
dem Node liegen (kein sofortiges Aufräumen nach erfolgreicher Zustellung). Dafür bekommt der
Kontakt beim Abholen nie mehr als Lesezugriff — niemand außer dem Node-Besitzer selbst kann je
etwas von diesem Node löschen. Bei kurzer, deployment-üblicher TTL (Stunden, nicht Tage) ist der
zusätzliche Speicherbedarf gering und der Sicherheitsgewinn (kein Fremd-Löschrecht) wiegt das
klar auf.

**Wichtig — kein Message-ID-Leak an den Node** (unverändert aus v1): Die Message-ID selbst muss
Teil des verschlüsselten Envelopes sein, nicht ein Klartext-Feld auf Node-Ebene, sonst kann der
Node über wiederholte IDs Muster über Zeit korrelieren. Dedup passiert client-seitig nach
Entschlüsselung.

**Richtungstrennung** (aus v1 übernommen, jetzt spiegelverkehrt — siehe Abschnitt 1's Tabelle):
Da A ausschließlich auf A's eigenen Nodes ablegt und B ausschließlich auf B's eigenen, hält kein
einziger Node je beide Richtungen eines Gesprächs. A's eigene Nodes sehen nur A's ausgehenden
Verkehr an alle Kontakte, nie eingehende Antworten. In Kombination mit der TTL-basierten
Löschung nach Abschnitt 4 hält ein Node zu keinem Zeitpunkt mehr als Fragmente einer einzigen
Richtung — nie ein vollständiges Gespräch. Eine vollständige Kompromittierung eines einzelnen
Knotens liefert einem Angreifer daher nie Frage-Antwort-Muster (mit der Einschränkung aus
Abschnitt 1 zur Betreiber-Unabhängigkeit), sondern höchstens Timing/Volumen einer Richtung.

---

## 5. Redundanz — bis zu 3 eigene Nodes, versetzter Reset [v3: Reset-Umfang präzisiert]

- Jeder Kontakt kann bis zu 3 **eigene** Nodes betreiben (Windows, Linux oder Android-Gerät).
  **Empfehlung [v3, neu]:** mindestens **2** Nodes für jedes Deployment, dem Migrationsfähigkeit
  wichtig ist — Begründung siehe Abschnitt 6. Ein einzelner Node bleibt funktional gültig, verliert
  dabei aber die Fähigkeit, die eigene Adresse später zu wechseln, ohne Kontakte manuell neu zu
  pairen.
- Sender legt Nachrichten bei **allen erreichbaren eigenen** Nodes ab (nicht nur primär +
  Failover) — überlebt eine Nachricht auch, wenn einer der eigenen drei Nodes ausfällt, nachdem
  geschrieben, aber bevor der Kontakt abgeholt hat.
- **Reset-Definition [v3, präzisiert — löst die in v2 offene Überschneidung mit TTL-Cleanup]:**
  Reset ist **ausschließlich** periodische Verbindungs-/Socket-Hygiene — abgelaufene Tor-Circuits
  und offene Handles zurücksetzen, damit ein lange laufender Prozess nicht langsam
  Ressourcen-Lecks anhäuft. **Reset rührt nie Nachrichtendaten an** (das ist vollständig
  TTL-Cleanups Aufgabe, siehe Abschnitt 8 — keine Überschneidung mehr) **und nie
  Rate-Limit-Zähler** (die laufen als Token-Bucket, der sich kontinuierlich selbst erneuert und
  keinen diskreten Reset braucht). Diese enge Definition erklärt auch, warum der Versatz
  überhaupt nötig ist: ein Verbindungs-Rebuild verursacht kurz eine kleine Erreichbarkeits-Delle
  — bei gleichzeitigem Reset aller drei Nodes wären kurzzeitig alle drei betroffen, versetzt bleibt
  immer mindestens einer ungestört. (Zähler-Bereinigung allein bräuchte diesen Versatz gar nicht
  — sie ist instantan und unterbricht nichts.)
  - **Ändert nie die Node-Adresse.**
  - Die Nodes eines Kontakts resetten **zeitlich versetzt**, nie gleichzeitig.
  - Versatz-Implementierung bei 3 Nodes: z. B. Node 1 bei Minute 0, Node 2 bei Minute 20, Node 3
    bei Minute 40 eines konfigurierbaren Zyklus (Default 24h, s. u.). Bei 2 Nodes entsprechend
    Minute 0 / Minute 30 pro 24h-Zyklus.

**Default [v3, festgelegt]:** Reset-Intervall 24h, konfigurierbar pro Deployment. Da Reset jetzt
nachweislich nie Nachrichtendaten anfasst, ist die in v2 befürchtete Kollision mit einem laufenden
Zustellfenster strukturell ausgeschlossen — keine weitere Abstimmung mit TTL/Rotation nötig.

---

## 6. Adressmigration eines eigenen Nodes [v2: vereinfacht sich durch die neue Richtung]

Ändert einer der drei eigenen Nodes seine Adresse (z. B. Server-Umzug), gilt:

1. **Nie über den wechselnden Node selbst kommunizieren** — Henne-Ei-Problem, der Kontakt weiß
   ja noch nicht, wo er suchen soll.
2. Migrations-Nachricht ("meine Node-X-Adresse ist jetzt Y") wird als ganz normale,
   verschlüsselte Nachricht über die **eigenen verbleibenden funktionierenden Nodes** (die
   anderen zwei) abgelegt — läuft durch denselben Mechanismus wie jede reguläre Nachricht, kein
   Sondercode nötig. **[v2]** Läuft jetzt sogar noch natürlicher als in v1: es ist buchstäblich
   eine normale ausgehende Nachricht (ich schreibe sie auf meine eigenen, noch funktionierenden
   Nodes, mein Kontakt pollt die ja sowieso schon).
3. Alte Adresse bleibt für ein Übergangsfenster (empfohlen: mindestens eine TTL-Länge) parallel
   aktiv, falls der Kontakt offline war und die Migrationsnachricht erst später abholt.
4. **Nie alle drei eigenen Nodes gleichzeitig migrieren** — mindestens einer muss während der
   gesamten Migration erreichbar bleiben, sonst gibt es keinen Kanal mehr, über den die neue
   Adresse zugestellt werden könnte.

**Ein-Node-Deployments [v3, entschieden]:** Ein Redirect-Stub am alten Endpunkt wurde geprüft und
bewusst verworfen — er würde voraussetzen, dass am alten Standort noch etwas laufen gelassen
werden kann, was bei den realistischen Migrationsgründen (Hardware-Tausch, ISP-Kündigung,
Hoster-Wechsel) oft genau die Situation ist, die nicht mehr gegeben ist. Ein unzuverlässiger
Mechanismus, der manchmal funktioniert, ist schlechter als gar keiner, weil er falsche Sicherheit
suggeriert. Stattdessen, ehrlich dokumentiert:

- Migrationsfähigkeit **ohne Kontakteingriff** braucht mindestens 2 Nodes (siehe Abschnitt 5's
  Empfehlung). Das ist der reguläre, empfohlene Weg.
- Bei einer **bewussten** Ein-Node-Installation gibt es keinen automatischen Migrationspfad —
  das ist eine akzeptierte, dokumentierte Einschränkung, keine zu lösende Lücke. Verliert der
  einzige Node seine Adresse, muss der Besitzer die neue Adresse **außerhalb des Systems**
  mitteilen (z. B. ein neuer Pairing-QR-Code, analog zum Erst-Pairing) — Kontakte pairen dann
  gezielt neu, statt automatisch zu migrieren.
- Diese Einschränkung gehört in die Kunden-facing Dokumentation (Abschnitt 11), nicht nur hierher
  — ein Ein-Node-Kunde muss das VOR dem Deployment wissen, nicht erst beim ersten Adresswechsel
  entdecken.

---

## 7. Temp Node (Premium-Feature) [v2: Bootstrap-Problem löst sich von selbst]

Für Ausnahmefälle: im laufenden Chat einen temporären eigenen Node auf beliebiger eigener
Hardware aktivieren (Zweithandy, Tablet, Laptop) — ausschließlich für diesen einen Chat, als
zusätzlicher eigener Schreibziel-Node für Nachrichten an genau diesen Kontakt.

**Ablauf:**
1. Nutzer wählt in der Chat-Ansicht "Temp Node aktivieren".
2. App generiert Pairing-Code für den Temp Node, zeigt QR-Code.
3. Zweitgerät (Node-Tool) scannt den Code, registriert sich als zusätzlicher eigener Temp Node,
   gültig nur für Nachrichten an diesen einen Kontakt.
4. Ankündigung ("ich habe jetzt einen Temp Node unter Adresse Z, nutze ihn für diesen Chat")
   wird als ganz normale, verschlüsselte Nachricht über die **bestehenden Standard-Nodes**
   abgelegt.
5. **[v2, gelöst]** Das in v1 offene Henne-Ei-Problem ("läuft die Bestätigung über den noch
   unbewiesenen Temp Node, oder über die Standard-Nodes?") entfällt durch die neue Richtung von
   selbst: die Ankündigung ist eine ganz normale ausgehende Nachricht auf den eigenen
   Standard-Nodes, die der Kontakt ohnehin schon pollt — der Kontakt braucht keinerlei vorherigen
   Kontakt zum Temp Node, um die Ankündigung zu bekommen.
6. Ab Bestätigung durch den Kontakt (z. B. erste erfolgreiche eigene Nachricht über den Temp
   Node in diese Richtung): Standard-Nodes für diesen einen Chat pausieren, nicht parallel
   weiterlaufen lassen. Ausschließlich der Temp Node trägt ab jetzt den ausgehenden Verkehr
   dieses einen Chats.
7. **Heartbeat/Timeout, nicht nur "Tool geschlossen":** Beide Seiten pingen den Temp Node in
   festem Intervall. Bleiben N aufeinanderfolgende Heartbeats aus (Timeout konfigurierbar,
   Vorschlag: 3 × Heartbeat-Intervall), fällt der Chat automatisch auf die drei Standard-Nodes
   zurück — nicht erst beim expliziten Schließen der Temp-Node-App.
8. Beim regulären Schließen des Temp-Node-Tools: sauberer Übergang zurück auf Standard-Nodes,
   Temp-Node-Session-Daten werden gelöscht (RAM-only, wie der reguläre Node-Speicher auch).

**[v4: Implementierungsentscheidungen — gebaut]**

- **Pairing-Reihenfolge vereinfacht.** Schritt 2 oben beschreibt "Telefon zeigt QR zuerst, Node-
  Tool scannt". Gebaut wurde stattdessen die exakt umgekehrte, aber funktional gleichwertige
  Reihenfolge: das Node-Tool (`node-mesh-server` mit `EPHEMERAL=1`) generiert beim Start ganz
  normal seine eigene Identität (wie ein Standard-Node auch) und druckt den fertigen
  `unpruuf-node-owner:v1:<address>:<secret>`-String; das Telefon scannt/pastet genau diesen
  String im neuen Chat-Screen-Dialog "Temp Node" — dasselbe Format, dieselbe
  `NodeMeshManager.parseOwnerConnectionString`-Funktion, die auch Settings' Standard-Node-Setup
  schon nutzt, nur hier kontakt-gebunden statt global gespeichert. Grund: das Node-Tool ist eine
  Kommandozeilen-/Docker-Binary ohne Kamera — eine zweite, für diese eine Funktion neu gebaute
  QR-Scan-Fähigkeit dort wäre erheblicher Zusatzaufwand für keinen funktionalen Gewinn, da beide
  Richtungen exakt dieselben zwei Informationen (Adresse + Secret) austauschen müssen.
- **Ein einziger Zustands-Flag statt getrennter Bestätigungs-/Wiederaufnahme-Logik.**
  `Contact.tempNodeActive` wird durch GENAU EINE Übergangsregel gesteuert: jeder erfolgreiche
  Kontakt zum Temp Node — ob ein echtes Deposit (Erstbestätigung, §7 Schritt 6) oder ein
  erfolgreicher Heartbeat (Wiederaufnahme nach einem automatischen Fallback, §7 Schritt 7) —
  setzt ihn auf `true`; nur `TEMP_NODE_HEARTBEAT_FAILURE_THRESHOLD` (3) aufeinanderfolgende
  Heartbeat-Fehlschläge setzen ihn zurück auf `false`. Die Spezifikation nennt "erste
  erfolgreiche Nachricht" ausdrücklich als Beispiel ("z. B."), nicht als exklusiven Mechanismus —
  einen erfolgreichen Heartbeat für den Wiederaufnahme-Fall gleichwertig zu behandeln ist damit
  eine bewusste, spezifikationskonforme Lesart, kein Sonderfall.
- **Solange nicht bestätigt: Dual-Deposit statt reinem Warten.** Zwischen Registrierung und
  erster Bestätigung sendet `P2PNetworkManager.depositForNodeMesh` jede Nachricht sowohl an den
  Temp Node als auch an den Standard-Pool — sonst gäbe es nie ein "erstes erfolgreiches Deposit",
  das die Bestätigung auslösen könnte. Die Ankündigungs-Nachricht selbst (Schritt 4) geht dadurch
  im Prinzip ebenfalls an beide, nicht nur an die Standard-Nodes wie im Wortlaut oben — harmlos,
  da Mehrfachzustellung über den bestehenden `ingestPacket`-Dedup ohnehin schon abgefangen wird,
  und der eigentliche Zweck von Schritt 4 (nie über den noch unbewiesenen Node bootstrappen) durch
  das gleichzeitige Standard-Node-Deposit weiterhin erfüllt ist.
- **Heartbeat-Fehlerzähler ist reiner Prozessspeicher**, nicht in `Contact` persistiert — nur der
  Heartbeat-Loop selbst braucht die Zwischenzahl zwischen 1 und dem Schwellenwert, kein anderer
  Codepfad liest sie.

---

## 8. Node-Server — Anforderungen an die Implementierung [v3: implementierungsreif]

**Plattformen:** Windows-Binary, Linux-Binary/Docker, Android-APK. Gleiches Wire-Format
über alle drei (Grundprinzip aus dem bestehenden Relay-Pool-Feature beibehalten — byte-für-byte
kompatibel).

**Implementierungs-Basis [v3, neu]:** Der bestehende Node-Code (`unpruuf/server/` für Node.js,
`unpruuf/relay-android/` für Kotlin) ist der richtige Ausgangspunkt, nicht ein Neubau von Null.
TTL-Sweep, `fetchMany`-Batching/Long-Poll (siehe unten), Tag-Validierung und das Wire-Format sind
bereits gebaut, getestet und funktionieren identisch auf beiden Plattformen. Was sich ändert, ist
gezielt: (a) `/deposit`'s Auth-Modell (Owner-Secret statt geteiltes Bearer-Token), (b) `/fetch`
verliert seine Lösch-Wirkung.

**[v4, gebaut] Windows-Binary.** `node-mesh-server/build-exe.js` erzeugt eine eigenständige
`unpruuf-node-mesh.exe`, die kein separat installiertes Node.js zum AUSFÜHREN braucht (nur einmal
zum Bauen) — exakt dieselbe Node-"Single Executable Application"-Technik, die `unpruuf/server/`
schon für `unpruuf-relay.exe` nutzt (Bündelung via `esbuild`, `postject`-Injektion in eine Kopie
der echten Node-Binary, `better-sqlite3`s natives Addon als Sibling-Datei neben der `.exe`, da SEA
nur JavaScript einbetten kann). Siehe `node-mesh-server/EXE_BUILD.md` für die volle Erklärung und
den Verifikationsstatus — end-to-end auf Linux gebaut UND ausgeführt (nicht nur gebaut): `/health`,
`/deposit`, `/fetch`, `/fetchMany` antworteten korrekt gegen die echte gebaute Binary, `EPHEMERAL`-
Modus hinterließ nachweislich keine Datei. Nicht verifiziert: ein echter Lauf auf echtem Windows
(kein Windows-Rechner zum Bauen/Testen verfügbar) — der Mechanismus selbst ist Node/OS-agnostisch
und wurde real durchlaufen, nur die Windows-spezifische Ausführung des fertigen Binaries nicht.

**API-Oberfläche:**

- `PUT /deposit` — `{ routing_tag, ciphertext, ttl }` → legt Nachricht ab.
  **Owner-only: verlangt ein lokales Owner-Secret, das NIE an Kontakte weitergegeben wird**
  (generiert beim Ersteinrichten des Node-Tools, bleibt zwischen dem Node und der/den eigenen
  App-Instanz(en) desselben Besitzers). Kein Kontakt, kein Fremder kann je auf diesen Endpunkt
  schreiben — fundamental kleinere Angriffsfläche als ein für alle Kontakte offener
  Schreibzugriff, egal ob mit oder ohne geteiltem Token.
- `GET /fetch?tag=<routing_tag>` → gibt alle unter diesem Tag liegenden Nachrichten zurück.
  **Rein lesend, löscht nichts.** Kein Auth-Token nötig — der `routing_tag` selbst ist bereits
  das Zugriffs-Credential, da er aus dem Pairing-Geheimnis abgeleitet und praktisch nicht
  erratbar ist (siehe Abschnitt 2). Ein Bearer-Token wäre hier redundant.
- `POST /fetchMany` — `{ "tags": [...], "waitMs"?: number }` → `{ "blobs": { "<tag>": ["<base64
  ciphertext>", ...], ... } }`. **[v3, präzisiert]** Identisches Wire-Format zum bestehenden
  `POST /v1/fetchMany` (`server/src/routes/relay.ts`, v1.09) — gleiche Feldnamen, gleiches
  Long-Poll-Verhalten (`waitMs`, resolved sobald irgendeiner der angefragten Tags eine neue
  Nachricht hat oder das Timeout erreicht ist). Ein Request für alle Tags im per Formel
  berechneten Toleranzfenster (Abschnitt 3) statt einem Request pro Tag.
- Interner Cleanup-Job: entfernt abgelaufene TTL-Einträge, unabhängig vom Reset-Zyklus — **der
  einzige Löschmechanismus, seit Fetch nicht mehr löscht** (Abschnitt 5 hat den Reset-Umfang klar
  davon abgegrenzt).
- Reset-Endpoint (intern getriggert, nicht von außen aufrufbar, Owner-only wie `/deposit`):
  reine Verbindungs-/Socket-Hygiene wie in Abschnitt 5 präzisiert, rührt nie Nachrichtendaten an.

**Speicher-Dimensionierung [v3, neu — Konsequenz aus "kein Delete-on-Fetch"]:** Ohne
Delete-on-Fetch bleibt eine bereits gelesene Nachricht bis TTL-Ablauf liegen, statt sofort Platz
freizugeben — ein Tag kann daher innerhalb einer TTL-Periode mehr Einträge ansammeln als im
bestehenden Relay-Modell. Der bestehende Per-Tag-Cap (`MAX_BLOBS_PER_TAG`, aktuell 1500 im
Node-Relay) ist als Ausgangswert weiterhin sinnvoll, sollte aber im Node-Mesh-Kontext gegen die
gewählten TTL/Rotation-Defaults durchgerechnet werden, statt unverändert übernommen zu werden.

**Der Node darf strukturell nie folgendes speichern oder loggen:**
- Sender-IP über die Zustellung der einzelnen Nachricht hinaus
- Message-Metadaten außerhalb von `routing_tag` + `ttl` + Ciphertext
- Irgendeine Zuordnung "dieser routing_tag gehört zu Kontakt X" — der Node kennt nur den
  Tag, nie die Identität dahinter

**Rate-Limiting/Missbrauchsschutz [v2, Risiko deutlich reduziert]:** Da `/deposit` jetzt
Owner-only ist, entfällt das v1-Risiko "jeder mit der Adresse kann Spam ablegen" komplett — kein
Fremder kann überhaupt schreiben. Verbleibendes, kleineres Risiko: `/fetch`/`/fetchMany` mit
massenhaft geratenen Tags zu bombardieren, um per Brute-Force gültige Tags zu finden — bei
HMAC-SHA256-Tag-Länge praktisch aussichtslos, aber ein moderates Rate-Limit auf die
Lese-Endpunkte kostet nichts und ist als Tiefenverteidigung sinnvoll.

---

## 9. Sicherheitsanforderungen — explizite Checkliste [v3, final]

- [ ] Ratchet-Schlüssel und Routing-Tag werden aus **zwei eigenständigen Secrets** abgeleitet
      (siehe Abschnitt 2), nie einem gemeinsamen Wurzelsekret.
- [ ] Node speichert nie eine Zuordnung Tag → Identität.
- [ ] Message-ID (für Dedup) ist Teil des verschlüsselten Payloads, nie Klartext-Feld.
- [ ] Rotation des Routing-Tags läuft unabhängig von TTL und von der Ratchet-Rotation
      (Abschnitt 3 — bewusst NICHT gekoppelt; Toleranzfenster wird stattdessen per Formel
      berechnet).
- [ ] `/deposit` akzeptiert ausschließlich mit dem lokalen Owner-Secret authentifizierte
      Schreibvorgänge — nie ein mit Kontakten geteiltes Token, nie offen ohne Auth.
- [ ] `/fetch`/`/fetchMany` sind rein lesend — kein Delete-on-Fetch, keine Löschrechte werden je
      an einen Kontakt vergeben. Aufräumen ausschließlich über TTL-Ablauf.
- [ ] Reset rührt ausschließlich Verbindungs-/Socket-Zustand an — nie Nachrichtendaten, nie
      Rate-Limit-Zähler, nie eine Node-Adresse (Abschnitt 5).
- [ ] Adressmigration läuft nie über den migrierenden Node selbst; Ein-Node-Deployments haben
      dokumentiert **keinen** automatischen Migrationspfad (Abschnitt 6) — das steht auch in der
      kundenseitigen Dokumentation, nicht nur hier.
- [ ] Temp Node pausiert Standard-Nodes für den betroffenen Chat vollständig, kein
      Parallelbetrieb.
- [ ] Temp Node fällt bei Heartbeat-Timeout automatisch zurück, nicht nur bei explizitem
      Schließen.
- [ ] Verifizieren, dass die Ablage-Logik strikt "nur auf eigenen Nodes" einhält — jede
      Implementierung, die eingehende Nachrichten zusätzlich irgendwo spiegelt (z. B. als
      Sync-Mechanismus für Mehrgeräte-Nutzung), hebelt die Richtungstrennung aus Abschnitt 4 aus
      und muss über einen separaten, klar gekennzeichneten Pfad laufen, nie über den
      Standard-Zustellpfad.
- [ ] Per-Tag-Speicher-Cap (Abschnitt 8) gegen die gewählten TTL/Rotation-Defaults durchgerechnet,
      nicht unverändert aus dem bestehenden Relay übernommen.

---

## 10. Bewusst nicht Teil dieser Spezifikation

- Kein Gruppenchat (weiterhin Architekturentscheidung, siehe bestehendes Produktwissen).
- Kein zentral von NexonAI betriebener Node — widerspricht dem Grundprinzip dieses gesamten
  Dokuments.
- Kein Ersatz für das bestehende Android-P2P-Produkt — Node-Mesh ist der Business-Zweig,
  keine Migration des bisherigen Consumer-Produkts.

---

## 11. Auswirkung auf bestehende Dokumentation

Die vier "Was X wirklich bedeutet"-Kapitel (`Contact`, `Sending`, `Message`, `Node`) beschreiben
aktuell das Direct-P2P-Modell mit optionalem Relay. Für den Business-Zweig braucht es eine
eigene, an dieses Dokument angelehnte Fassung — nicht die bestehenden vier Kapitel überschreiben
(die gelten weiter für das Android-P2P-Produkt), sondern als eigenständige Business-Variante
ergänzen, sobald implementiert. Muss explizit die Ein-Node-Einschränkung aus Abschnitt 6 enthalten
— ein Kunde, der sich für ein Ein-Node-Deployment entscheidet, muss das vor dem Kauf/Deployment
wissen, nicht erst beim ersten Adresswechsel entdecken.

---

## 12. Entscheidungs-Log — alle Punkte final geklärt [v3]

Kein offener Punkt mehr vor Implementierungsstart. Zur Nachvollziehbarkeit, was wann warum
entschieden wurde:

| Punkt | Entscheidung | Abschnitt |
|---|---|---|
| Schreib-/Leserichtung | Jeder schreibt auf eigene Nodes, holt bei Kontakten ab (v1 war umgekehrt) | 1 |
| Routing-/Ratchet-Secrets | Zwei eigenständige Secrets ab Pairing, kein gemeinsames Wurzelsekret | 2 |
| Rotation ↔ TTL | Bewusst entkoppelt; Toleranzfenster per Formel `ceil(TTL/rotation)+1` berechnet | 3 |
| Default `rotation_interval` | 1 Stunde (konsistent mit bestehendem Android-Produkt) | 3 |
| Default `TTL` | 6 Stunden (konsistent mit bestehendem Relay-Default) | 3 |
| Deposit-Endpunkt | Owner-only, lokales Secret, nie mit Kontakten geteilt | 8 |
| Fetch-Endpunkt | Rein lesend, kein Delete-on-Fetch, Tag selbst ist das Zugriffs-Credential | 4, 8 |
| Aufräumen | Ausschließlich TTL-Ablauf | 4, 8 |
| Reset-Umfang | Nur Verbindungs-/Socket-Hygiene; nie Nachrichten, nie Rate-Limit-Zähler, nie Adresse | 5 |
| Default Reset-Intervall | 24h, versetzt pro Node | 5 |
| Redundanz-Empfehlung | Mindestens 2 eigene Nodes für Migrationsfähigkeit | 5 |
| Ein-Node-Migration | Kein automatischer Pfad — dokumentierte Einschränkung, manuelles Re-Pairing | 6 |
| Temp-Node-Bootstrap | Löst sich durch die neue Schreibrichtung von selbst, kein Sondercode nötig | 7 |
| Implementierungs-Basis | Bestehender `server/`/`relay-android/`-Code, gezielt angepasst, nicht neu gebaut | 8 |
| Per-Tag-Speicher-Cap | Ausgangswert vom bestehenden Relay übernehmen, gegen neue Defaults durchrechnen | 8, 9 |

---

*unpruuf Business · NexonAI Consulting SRL · Alba Iulia, Romania*
