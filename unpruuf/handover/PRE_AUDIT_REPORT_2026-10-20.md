# Vorab-Durchlauf vor dem externen Audit: Node-Server und Android-App (pro, group)

Stand: 20.10.2026, Branch `ccr-5d2d7367-ue57ar`, Commit `5869a3f`. Vertraulich, nur intern. Enthält Angriffsdetails.
Tester: unpruuf security tester. Kein Audit und kein Zertifikat: Hier steht, was ich gefunden habe und was ich nicht prüfen konnte.

Statuslabels: **GETESTET** (selbst ausgeführt und gesehen), **GELESEN** (nur aus dem Code geschlossen), **ANGENOMMEN** (nicht prüfbar).

Erinnerung F1: Das Audit soll das Endformat (Wire v2) prüfen. Zwei Befunde unten (M4, L12) hängen direkt am Paketformat und sollten in denselben Umstieg.

---

## 1. Zusammenfassung

| Schweregrad | Anzahl |
|---|---|
| Critical | 0 |
| High | 1 |
| Medium | 11 |
| Low | 12 |
| Info | 7 |

**Die drei wichtigsten Punkte**

1. **H1: Der Schlüssel der verschlüsselten Kontakt-Datenbank liegt im Klartext gleich daneben** (`app/.../di/AppModule.kt:48-60`). In dieser Datenbank liegen die privaten Schlüssel pro Kontakt, der Ratchet-Zustand (Root-, Ketten- und übersprungene Nachrichtenschlüssel), die Routing-Seeds, Node-Adressen, Namen und der Schreibschlüssel des Temp-Nodes. Die Aussage „private Schlüssel liegen nie im Klartext auf der Platte“ (`SECURITY_CLAIMS.md:161`, Brief A5) stimmt für Pro und Group so nicht.
2. **M1 bis M3: Drei Server-Schwächen, die jeder ausnutzen kann, der eine Node-Adresse kennt.** Die Lese-Bremse hängt am Host-Header, den der Anrufer selbst setzt (umgehbar und vergiftbar). Ein `/fetchMany` mit 64-mal demselben vollen Tag blockiert den ganzen Server, also alle 250 Nodes (8 Anfragen, 7,6 s Stillstand). Der Cursor in `/fetchMany` verrät jedem Fremden den serverweiten Einwurf-Zähler in Echtzeit und zeigt, welche Adressen zum selben Server gehören.
3. **M4: Ein Node-Betreiber kann die stündlich wechselnden Tags eines Kontakts über Tage verketten.** Die App fragt bei jedem Abruf das ganze 26-Stunden-Fenster ab und bündelt mehrere Kontakte in eine Anfrage. „Tags können nicht verknüpft werden“ (A3, B3) gilt gegenüber dem Netz, aber nicht gegenüber dem Betreiber. Zusammen mit F1 ergibt das eine Zeitleiste pro Gesprächskanal.

**Nicht abgedeckt:** echte Telefone (normal und gerootet), echtes Tor (PoW, Bridges, Snowflake, 24-Stunden-Mitschnitt), Release-APK (es gibt keine im Repo, nur Debug-APKs), Docker-Lauf, Server mit 250 Nodes, Speicher-Forensik des Server-Prozesses, Online-Prüfung der Tor-Hashes, iOS, Control, Officer-App, Press, unpruuf Compliance-Teile. Tor-Integration, Bridges, Feed-Krypto und `TorManager` habe ich nur überflogen.

---

## 2. Befunde

### H1 – SQLCipher-Schlüssel im Klartext in SharedPreferences
- **Schweregrad:** High
- **Persona:** gerootetes Telefon; Forensik-Abzug eines entsperrten oder nach dem ersten Entsperren gesperrten Telefons; Gerätewechsel-Übertragung (siehe M9)
- **Wo:** `app/src/main/java/com/nexonai/unpruuf/di/AppModule.kt:26-27, 48-60`; Daten: `data/model/Contact.kt:110-130`, `data/db/RatchetStateEntity.kt:17-31`; Schreibweg `screens/qrpair/QrPairViewModel.kt:463-467`
- **Was ich getan habe:** den Code gelesen.
- **Beweis:** `getOrCreateDbKey` legt 32 Zufallsbytes als Base64 unter `shared_prefs/db_key_store.xml`, Schlüssel `db_key`, ab. Es gibt kein `CryptoManager.encrypt` und kein `SealedStrings`. Der Wert geht direkt als Passphrase in `SupportFactory(passphrase)`. In der Datenbank liegen im Klartext (Base64): `myPairMessageKey`, `myPairRatchetPrivateKey`, `myPairRoutingSeed`, `tempNodeOwnerSecret`, `theirNodeAddresses`, `displayName` sowie der ganze Ratchet-Zustand (`dhsPrivateKey`, `rootKey`, `sendChainKey`, `recvChainKey`, `skippedKeysJson`).
- **Warum es zählt:** Wer die App-Dateien kopiert, hat Datenbank und Schlüssel zusammen. Er liest alle Kontakte und kann Nachrichten im aktuellen Empfangsfenster entschlüsseln.
- **Widerlegt:** `SECURITY_CLAIMS.md:157` („contacts store is SQLCipher-encrypted“: technisch ja, wirksam nein), `:161` („Private key material … never stored in plaintext at rest“), Brief Android §1.5 und A5, CLAIMS D2.
- **Fix-Vorschlag:** Den DB-Schlüssel mit `CryptoManager` (Tink, Keystore) versiegeln, wie die anderen Geheimnisse (`k1:`-Präfix). Den alten Klartextwert beim ersten Start migrieren und danach die Datenbank mit `PRAGMA rekey` auf einen neuen Schlüssel umstellen, weil der alte Schlüssel in alten Dateiblöcken liegen kann. Danach M9 und M10 schließen. Ein Unit-Test sollte festhalten, dass `db_key_store.xml` kein Klartextfeld mehr hat.
- **Status:** GELESEN (der Code ist eindeutig; ein Gerätetest muss die Datei auf dem Telefon zeigen)

### M1 – Lese-Bremse pro Node hängt am Host-Header, den der Anrufer setzt
- **Schweregrad:** Medium
- **Persona:** böswilliger Kontakt oder jeder, der eine einzige Node-Adresse kennt
- **Wo:** `node-mesh-server/src/middleware/rateLimit.ts:63-71, 47-60`; `routes/node.ts:91, 162, 174`; `tor/torControl.ts:152` (alle Onions zeigen auf denselben lokalen Port)
- **Was ich getan habe:** lokale Instanz (Tor aus), 60 Anfragen mit festem und mit wechselndem Host; danach 540 Fantasie-Hosts und dann eine noch nie gesehene echte Adresse. Skript `scratchpad/tests/t2_rate.js`.
- **Beweis:**
  ```
  burst 60 on one host -> 200s: 30
  60 with rotating Host -> 200s: 60
  after 540 junk hosts: fresh real node address N2, 40 quick reads -> 200s: 0
  attacker drains overflow via another new host; N2 now -> 429
  ```
- **Warum es zählt:** Die Bremse lässt sich mit wechselnden Host-Namen beliebig umgehen. Wer nach einem Neustart als Erster 512 Fantasienamen schickt, presst alle echten Nodes in einen gemeinsamen Notfall-Topf und kann das Lesen für den ganzen Server lahmlegen. Die Map wird nie geleert.
- **Widerlegt:** A19 und S8 („read limit per node address … cannot stop reading for all nodes“).
- **Fix-Vorschlag:** Jeder Onion bekommt seinen eigenen lokalen Port (`ADD_ONION … Port=80,127.0.0.1:<port_i>`), und der Schlüssel der Bremse ist `req.socket.localPort`. Kurzfristig: Host-Header gegen die eigene Adressliste prüfen, Unbekanntes mit 421 abweisen und nicht als neuen Schlüssel anlegen. Zusätzlich `MaxStreams`/`MaxStreamsCloseCircuit` beim `ADD_ONION` setzen.
- **Status:** GETESTET (über Loopback; dass Tor den Host-Header unverändert durchreicht, ist ANGENOMMEN, weil HTTP Ende-zu-Ende durch den Onion läuft)

### M2 – `/fetchMany` mit doppelten Tags blockiert den ganzen Server
- **Schweregrad:** Medium
- **Persona:** böswilliger Kontakt, der einen gefüllten Tag kennt (zum Beispiel nach einem Anhang); Kollege mit Schreibschlüssel
- **Wo:** `routes/node.ts:174-207` (keine Entdopplung, keine Obergrenze für Antwortgröße), `store/nodeStore.ts:88-94` (synchrones `.all()`)
- **Was ich getan habe:** einen Tag mit 1500 Paketen à 4096 Byte gefüllt (der 1501. ergab wie vorgesehen 429), dann `fetchMany` mit 1, 16 und 64 Kopien, danach 8 solche Anfragen parallel und `/health` gemessen. Skripte `t3_amp.js`, `t3b_block.js`.
- **Beweis:**
  ```
  fetchMany with 64 copies of the tag: status 200, response 8.2 MB, 1071 ms
  /health latency while 8 amplified fetchMany run: 7584 ms 200
  /health latency idle: 5 ms
  ```
- **Warum es zählt:** Acht Anfragen frieren alle 250 Nodes eines Servers für 7,6 Sekunden ein. Zusammen mit M1 gibt es keine Bremse dagegen.
- **Fix-Vorschlag:** Tags entdoppeln; höchstens N Pakete oder Bytes pro Antwort (zum Beispiel 256 Pakete oder 2 MB) und den Rest über den Cursor nachladen; teure Abfragen bei der Bremse höher zählen.
- **Status:** GETESTET

### M3 – Globaler Cursor verrät Fremden den Einwurf-Zähler des Servers und verbindet alle Adressen
- **Schweregrad:** Medium
- **Persona:** jeder, der eine Adresse kennt (ohne Tag, ohne Geheimnis)
- **Wo:** `routes/node.ts:189-206`, `store/nodeStore.ts:111-114`
- **Was ich getan habe:** `fetchMany` mit einem erfundenen Tag und `since:0` über zwei verschiedene Host-Namen geschickt; dann hat der Besitzer 3 Pakete unter 3 fremden Tags eingeworfen.
- **Beweis:**
  ```
  stranger, no tag knowledge: cursor via address A = 1512 , via address B = 1512
  after owner deposits 3 packets on 3 unrelated tags: cursor via A = 1515 , via B = 1515
  ```
- **Warum es zählt:** Wer eine Adresse kennt, sieht in Echtzeit, wann und wie viel auf dem ganzen Server eingeworfen wird, und kann prüfen, welche Adressen zum selben Server gehören. Das ist genau die Frage, die S5 dem Auditor stellt („whether addresses can be linked from outside“). `/lock-status` verrät zusätzlich Neustarts.
- **Fix-Vorschlag:** Den Cursor nur aus den angefragten Tags ableiten (höchste ID der zurückgegebenen Pakete, sonst das gesendete `since` zurückgeben) oder einen undurchsichtigen, pro Anfrage verschlüsselten Cursor verwenden. Die Android-Logik (`P2PNetworkManager.kt:883-913`) funktioniert mit beidem.
- **Status:** GETESTET

### M4 – Ein Node-Betreiber kann die Tags eines Kontakts über die Zeit verketten
- **Schweregrad:** Medium (mit F1 zusammen: eine Zeitleiste pro Gesprächskanal)
- **Persona:** Betreiber des Nodes, auf dem der Kontakt schreibt (Firmen-Admin, Hosting, Beschlagnahme eines laufenden Servers)
- **Wo:** `app/.../P2PNetworkManager.kt:846-853, 861-864, 892-895`; `IdentityManager.kt:569-573`
- **Was ich getan habe:** den Code gelesen.
- **Beweis:** Bei jedem Abruf fragt die App pro Kontakt alle 26 Tags des Fensters ab (aktuelle Stunde und 25 zurück). Eine Stunde später sind 25 davon dieselben. Pro Adresse werden alle Kontakte zusammengelegt (`tagsByAddress`) und in Blöcken zu 64 Tags gesendet. Der `since`-Cursor einer Adresse verbindet aufeinanderfolgende Abrufe zusätzlich.
- **Warum es zählt:** Der Betreiber sieht keine Namen, kann aber jeden Kanal über Tage verfolgen und erkennen, welche Kanäle dasselbe Telefon abfragt.
- **Widerlegt:** A3 und B3 („cannot be linked across contacts“, „change every hour“) gegenüber dem Betreiber; Brief §1.3.
- **Fix-Vorschlag:** Nur Tags abfragen, für die noch etwas kommen kann (nach dem ersten vollständigen Abruf nur die aktuelle und die nächste Stunde, mit Cursor); jeden Kontakt einzeln und über getrennte Tor-Streams abfragen; Abrufe zeitlich streuen. Das sollte mit F1 zusammen entschieden werden, weil das Audit das Endformat sehen soll.
- **Status:** GELESEN

### M5 – „Nur der Besitzer schreibt“ heißt in der Praxis: jeder Mitarbeiter mit der Node-Liste
- **Schweregrad:** Medium (Aussage und Design)
- **Persona:** böswilliger oder ausgeschiedener Kollege; Dieb eines Mitarbeitertelefons
- **Wo:** `node-mesh-server/src/nodeList.ts:1-20` (Liste enthält `secret:`), `NODE_MESH_BETRIEB.md:116-134` („Bei einem ausgeschiedenen Mitarbeiter tauschen Sie den Schreibschlüssel“), `routes/node.ts:99, 122`
- **Was ich getan habe:** Code und Betriebsdoku gelesen; Grenzen lokal geprüft (`isFull` bei 200 000, 507).
- **Beweis:** Ein einziger Schreibschlüssel pro Server, den alle Apps der Firma halten. Damit kann jeder Mitarbeiter: alle 250 Adressen und die Steueradresse abfragen (`/pool`), den gemeinsamen Speicher bis 200 000 Pakete füllen (danach bekommen alle anderen 507) und den Server entsperren. Einzelne Geräte lassen sich nicht sperren; es hilft nur eine Rotation mit Neuverteilung an alle.
- **Warum es zählt:** Ein einziger unzufriedener Mitarbeiter kann den Firmenserver bis zum Ablauf der Lebensdauer zum Schweigen bringen.
- **Widerlegt:** Brief Server §1.4 und S1 sowie A2, sinngemäß („only the owner can write“).
- **Fix-Vorschlag:** Kurzfristig die Aussage ehrlich fassen („jedes Gerät der Firma mit der Liste“). Danach eine Obergrenze pro Schreibschlüssel und Zeit (Token-Bremse auf `/deposit`), und als spätere Stufe Schreibschlüssel pro Gerät (abgeleitet und einzeln widerrufbar), ohne Lizenzformat-Änderung, iOS mitdenken (Norbert).
- **Status:** GELESEN (507 bei vollem Speicher ist durch `app.test.ts` und Skript 01 belegt)

### M6 – Steuersignale laufen nicht durch den Double Ratchet
- **Schweregrad:** Medium
- **Persona:** jemand, der einen Pairing-Code kennt (zum Beispiel über einen Messenger geschickt) und auf dem Node des Kontakts schreiben darf (Kollege mit Firmenliste, siehe M5)
- **Wo:** `app/.../P2PNetworkManager.kt:1379-1495`; Schlüssel: `IdentityManager.kt:482-485`, `NodeMeshPairing.kt:15-16` (Feld `p`)
- **Was ich getan habe:** den Code gelesen.
- **Beweis:** `DELETE_CONTACT_SIGNAL`, `REVOKE_SIGNAL`, `NODE_MIGRATE`, `TEMP_NODE`, Onion- und Identitäts-Updates werden nach der äußeren AES-GCM-Schicht ausgewertet. Deren Schlüssel ist der statische Nachrichtenschlüssel aus dem Pairing-Code. Es gibt keine Ratchet-Authentisierung und keine dauerhafte Wiederholungs-Sperre: `processedPacketHashes` lebt nur im Speicher, und gelesene Pakete bleiben bis zum Ablauf abholbar.
- **Warum es zählt:** Wer einen Pairing-Code abfängt und schreiben darf, kann einen Kontakt beim Gegenüber löschen oder dessen Abholadresse auf einen eigenen Node umbiegen (`NODE_MIGRATE`, `TEMP_NODE`). Die Inhalte bleiben geschützt, die Erreichbarkeit nicht.
- **Fix-Vorschlag:** Steuersignale als Ratchet-Nachrichten senden (eigener Payload-Typ) oder mit einem aus der Ratchet-Sitzung abgeleiteten MAC signieren; Folgenummern dauerhaft speichern. Passt in den Wire-v2-Umstieg (F1), iOS mitdenken.
- **Status:** GELESEN

### M7 – Node-Adressen sind nicht auf .onion beschränkt; der Schreibschlüssel kann im Klartext über einen Tor-Exit gehen
- **Schweregrad:** Medium
- **Persona:** feindliches Dokument (Pairing-Code oder Node-Liste); Fehlkonfiguration (`NODE_MESH_TOR=0` mit öffentlicher Adresse); Betreiber eines Tor-Exits
- **Wo:** `app/.../NodeListFile.kt:25`, `NodeMeshManager.kt:367-376, 401-406`, `NodeMeshPairing.kt:51-55`, `NodeMeshClient.kt:254-268`
- **Was ich getan habe:** den Code gelesen.
- **Beweis:** Die Adressprüfung lässt `^[A-Za-z0-9._:-]{3,120}$` zu, also auch `firma.example:80`. `request()` spricht reines HTTP über Tor-SOCKS und hängt `Authorization: Bearer <owner secret>` an. Nur `/pool`-Antworten werden auf v3-Onions gefiltert (`NodeMeshClient.kt:46`).
- **Warum es zählt:** Mit einer Klartext-Adresse sieht der Exit-Betreiber den Schreibschlüssel des ganzen Servers und alle Pakete. Die App spricht dann auch mit Servern, die nicht der Kunde betreibt.
- **Widerlegt:** Brief Android §1.2 und A2 („to the customer's own servers only“).
- **Fix-Vorschlag:** Überall, wo Adressen hereinkommen (Pairing, Node-Liste, Feed, `NODE_MIGRATE`, `TEMP_NODE`), nur `^[a-z2-7]{56}\.onion$` annehmen; die Ausnahme für LAN-Tests nur im Debug-Build.
- **Status:** GELESEN

### M8 – Release-Fingerabdruck deckt nicht ab, was tatsächlich läuft
- **Schweregrad:** Medium (Aussage und Lieferkette)
- **Persona:** bösartige Abhängigkeit; Eingriff in einen Server zwischen zwei Neustarts
- **Wo:** `node-mesh-server/src/integrity.ts:25-27, 63-79, 160-163`; `index.ts:54`; `node_modules/better-sqlite3/package.json:33`
- **Was ich getan habe:** Code gelesen; Paketsperrdatei ausgewertet.
- **Beweis:** Abgedeckt sind nur `dist/*.js` und `package.json`. Nicht abgedeckt: 133 Produktionspakete in `node_modules`, darunter das native SQLite-Modul, und `tor-bin`. Das native Modul lädt `prebuild-install` beim `npm ci` von GitHub, ohne Hash (die Integrität in `package-lock.json` gilt nur für das npm-Paket, nicht für die nachgeladene `.node`-Datei). Bei der Einzeldatei-Version (`exe`) gibt es gar keine Signaturprüfung, und `NODE_MESH_REQUIRE_SIGNED=1` lässt `exe` trotzdem durch (`index.ts:54`).
- **Warum es zählt:** „Das Programm des Kunden ist das geprüfte Programm“ stimmt nur für etwa ein Zehntel des ausgeführten Codes.
- **Widerlegt:** Brief Server §1.5 und S7, CLAIMS A11.
- **Fix-Vorschlag:** `node_modules` (mit Hash der `.node`-Datei) und `tor-bin` in die Liste aufnehmen; im Dockerfile `npm ci --build-from-source` oder die `.node`-Datei gegen einen festen Hash prüfen; die `exe` mit derselben Ed25519-Signatur versehen (Hash der exe in einer signierten Datei daneben) und `REQUIRE_SIGNED` dafür nicht automatisch bestehen lassen.
- **Status:** GELESEN

### M9 – Gerätewechsel-Übertragung ist nicht abgeschaltet
- **Schweregrad:** Medium (solange H1 offen ist; danach Low)
- **Persona:** jemand mit einem kurz entsperrten Telefon, der es auf ein eigenes Gerät überträgt
- **Wo:** `app/src/main/AndroidManifest.xml:18-20` (nur `allowBackup="false"`, kein `dataExtractionRules`); `targetSdk 34` (`app/build.gradle.kts:17`)
- **Was ich getan habe:** Manifest und zusammengeführtes Manifest gelesen; Android-Dokumentation geprüft.
- **Beweis:** Ab Android 12 schaltet `allowBackup="false"` Cloud- und adb-Backup ab, die Übertragung von Gerät zu Gerät aber nicht. Dafür braucht es eine `<device-transfer>`-Regel in `dataExtractionRules` ([Android: backup-leaks](https://developer.android.com/topic/security/risks/backup-leaks?hl=id), [Auto Backup](https://developer.android.com/identity/data/autobackup)). Übertragen würden `db_key_store.xml` (Klartext, H1) und die Datenbank; Keystore-versiegelte Werte wären auf dem neuen Gerät nicht lesbar.
- **Widerlegt:** B10 („backup … off“) in dieser Allgemeinheit.
- **Fix-Vorschlag:** `android:dataExtractionRules` mit `<cloud-backup>` und `<device-transfer>`, die alles ausschließen; Gerätetest mit dem Übertragungswerkzeug eines Herstellers (manche Hersteller halten sich nicht daran).
- **Status:** GELESEN, Gerätetest offen

### M10 – Panik-PIN: Lücken beim Löschen
- **Schweregrad:** Medium
- **Persona:** jemand, der die Panik-PIN erzwingt und das Telefon später mit Root untersucht
- **Wo:** `app/.../screens/lock/LockViewModel.kt:101-117`; `IdentityManager.kt:511-539` (`pending_nm_pairing`); `di/AppModule.kt` (kein `secure_delete`)
- **Was ich getan habe:** den Code gelesen.
- **Beweis:** (a) `wipeEverything()` löscht `pending_nm_pairing` nicht: Der gerade gezeigte Pairing-Code mit Nachrichtenschlüssel, privatem Ratchet-Schlüssel, Routing-Seed und den gewählten Node-Adressen bleibt erhalten. (b) Kontakte und Ratchet-Sitzungen werden mit `DELETE` entfernt, ohne `PRAGMA secure_delete` und ohne WAL-Checkpoint. Die Zeilen können in freien Seiten oder im WAL wiederherstellbar bleiben, und wegen H1 ist der Schlüssel zur Hand. (c) Die Warteschlange `deliveryQueue` und `chunkReassembly` im Speicher werden nicht geleert. (d) Die Panik-PIN selbst hat keine Mindestlänge (`LockViewModel.kt:51` prüft nur die normale PIN).
- **Widerlegt:** A6 und D3 („removes what we say it removes“), sinngemäß.
- **Fix-Vorschlag:** `clearPendingNodeMeshPairing()` in den Wipe aufnehmen; SQLCipher mit `PRAGMA secure_delete=ON` öffnen und nach dem Wipe `wal_checkpoint(TRUNCATE)` und `VACUUM` ausführen (oder die Datenbank löschen und mit neuem Schlüssel neu anlegen, das ist sauberer); Speicher-Queues leeren; Mindestlänge auch für die Panik-PIN.
- **Status:** GELESEN

### M11 – Setup-Seite: Die Prüfung auf private Adressen lässt im Docker-Fall die Nachbar-Container herein
- **Schweregrad:** Medium
- **Persona:** ein anderer (kompromittierter) Container auf demselben VPS; jemand im selben LAN, wenn `ADMIN_BIND` geöffnet ist
- **Wo:** `node-mesh-server/src/admin/adminApp.ts:68-90`; `Dockerfile:27` (`ADMIN_BIND=0.0.0.0`); `control/src/provision.ts:110` (`docker run` ohne eigenes Netz)
- **Was ich getan habe:** Host-Header-Varianten lokal getestet (alle fremden Werte ergaben 403, siehe „Was gehalten hat“); `isLocalPeer` mit Adressen aufgerufen; Docker-Fall gelesen.
- **Beweis:** `isLocalPeer("172.17.0.1") == true`, `isLocalPeer("10.1.2.3") == true`. Den Host-Header setzt der Anrufer selbst (`Host: localhost:8790`). Im Container lauscht die Seite auf 0.0.0.0; jeder Container im Standard-Bridge-Netz erreicht `<container-ip>:8790` und bekommt über `/status.json` den Besitzercode.
- **Warum es zählt:** Der Host-Check schützt gegen DNS-Rebinding im Browser, aber nicht gegen einen direkten Anrufer. Die Brief-Grenze („hängt an der Port-Zuordnung“) deckt diesen Weg nicht ab.
- **Fix-Vorschlag:** Im Container auf eine eigene Docker-Netzschnittstelle binden oder `--network` mit isoliertem Netz verwenden; zusätzlich ein Einmal-Token in der Setup-URL (nur auf der Konsole des Hosts angezeigt) als zweiter Faktor; `isLocalPeer` im Nicht-Docker-Betrieb nur auf Loopback.
- **Status:** GELESEN (Docker war hier nicht verfügbar), Peer-Prüfung GETESTET

### L1 – Gemeinsame Töpfe: Ein Fremder sperrt `/pool` und `/unlock` für den Besitzer
- **Schweregrad:** Low
- **Persona:** jeder, der eine Adresse (oder im gesperrten Zustand die Steueradresse) kennt
- **Wo:** `routes/node.ts:92-93, 99, 106, 111`
- **Beweis:** `stranger 10x /lock-status, then owner GET /pool -> 429` und `stranger 6x wrong /unlock, then owner right secret -> 429`. Bei 0,2 pro Sekunde hält ein Fremder das Entsperren dauerhaft zu.
- **Fix-Vorschlag:** `/lock-status` eigener Topf; `/unlock` und `/pool` erst nach erfolgreicher Prüfung zählen lassen oder getrennte Töpfe für Erfolg und Misserfolg; im gesperrten Zustand zusätzlich die Setup-Seite als Ausweg nennen (gibt es schon).
- **Status:** GETESTET

### L2 – Ein gestoppter oder beschlagnahmter Server behält abgelaufene Pakete
- **Schweregrad:** Low (Aussage)
- **Persona:** jemand, der einen ausgeschalteten Server mitnimmt
- **Wo:** `index.ts:268-271` (Sweep nur im laufenden Prozess, erster Lauf 60 s nach dem Start)
- **Beweis:** Paket mit 15 s Lebensdauer eingeworfen, Server gestoppt, 20 s gewartet: `server stopped, packet expired 5s ago: node-mesh.sqlite FOUND`. Nach dem Neustart war es nach etwa 53 s weg.
- **Warum es zählt:** „Nach spätestens etwa einer Minute aus den Dateien“ gilt nur, solange der Server läuft. Die Pakete bleiben verschlüsselt.
- **Fix-Vorschlag:** Beim Start sofort einmal fegen (vor dem Öffnen der API); in `SECURITY_CLAIMS` den Satz „solange der Server läuft“ ergänzen.
- **Status:** GETESTET

### L3 – Der Server verrät Express trotzdem
- **Schweregrad:** Low (Aussage)
- **Wo:** `app.ts` (kein eigener 404-Handler)
- **Beweis:** `POST /nothing` → 404 mit Express-Standard-HTML `<pre>Cannot POST /nothing</pre>`, `Content-Security-Policy: default-src 'none'`, `X-Content-Type-Options: nosniff`. `OPTIONS /fetchMany` → `200 Allow: POST`. ETag `W/"…"`. Routen ignorieren Groß- und Kleinschreibung und den Schrägstrich am Ende (`PUT /DEPOSIT` → 201).
- **Widerlegt:** A15 („does not announce its web framework“) und Brief S1 („Everything else answers 404 for every method“: OPTIONS und HEAD antworten 200).
- **Fix-Vorschlag:** Eigener Fallback `app.use((_q, r) => r.status(404).json({error:"not found"}))` nach dem Router; `app.set("etag", false)`; Router mit `caseSensitive: true, strict: true`; OPTIONS ausdrücklich mit 404 beantworten.
- **Status:** GETESTET

### L4 – Zwischenablage wird im Hintergrund nicht geleert
- **Schweregrad:** Low
- **Persona:** andere App, Tastatur-Verlauf, späterer Nutzer des Telefons
- **Wo:** `app/.../ui/SensitiveClipboard.kt:67-75`
- **Beweis:** `clearIfStillOurs` liest zuerst `primaryClip`. Ab Android 10 bekommt eine App, die nicht im Vordergrund ist, beim Lesen `null`. Dann gilt `current != text` und es wird nichts gelöscht. Der übliche Ablauf (kopieren, in eine andere App wechseln, einfügen) lässt den Code also liegen.
- **Widerlegt:** A7 und `SECURITY_CLAIMS` Tier 3 („removed after 60 s if still ours“) im Normalfall.
- **Fix-Vorschlag:** Statt zu vergleichen, `ClipboardManager.addPrimaryClipChangedListener` merken und beim Ablauf ohne Lesen `clearPrimaryClip()` aufrufen, wenn seitdem kein Wechsel kam; Gerätetest auf Android 10, 12 und 13 oder neuer.
- **Status:** GELESEN, Gerätetest offen

### L5 – Unbegrenzte Größen in Paket- und HTTP-Parsern der App
- **Schweregrad:** Low (Speicher-DoS)
- **Persona:** böswilliger Kontakt (`totalChunks`); böswilliger Node-Betreiber (Paketkopf, HTTP-Kopfzeilen)
- **Wo:** `RatchetFrame.kt:66-72`, `P2PNetworkManager.kt:386-392, 1511`; `NetworkObfuscation.kt:108-116`; `NodeMeshClient.kt:295-307`
- **Beweis (JVM gegen die kompilierten App-Klassen, `scratchpad/jvm/Probe.java`):**
  ```
  RatchetFrame.decode(ChunkStart totalChunks=Int.MAX): accepted -> ChunkStart totalChunks=2147483647
  unpad(2147483647,0): OutOfMemoryError
  unpad(200000000,0): ArrayIndexOutOfBoundsException   (nach einer 200-MB-Zuteilung)
  ```
  `readLine` im Node-Client sammelt Kopfzeilen ohne Längengrenze. Die Aufrufer fangen `Throwable` ab (`runCatching`); ein App-Absturz ist deshalb unwahrscheinlich. Große Zuteilungen und ein `ChunkReassembly` mit Millionen Plätzen, das bis zum nächsten Start im Speicher bleibt, sind aber möglich.
- **Fix-Vorschlag:** `totalChunks` auf das Maximum eines 5-MB-Anhangs begrenzen (etwa 1400); in `unpadPacket` `0 <= size`, `0 <= offset` und `8 + offset + size <= 4096` prüfen; Kopfzeilen auf 8 KB und 64 Zeilen begrenzen.
- **Status:** GETESTET (Decoder auf der JVM), Folgen GELESEN

### L6 – Node-Listen-Parser ist quadratisch und läuft im Hauptthread
- **Schweregrad:** Low
- **Persona:** feindliches Dokument (Node-Liste, Firmen-Feed)
- **Wo:** `app/.../NodeListFile.kt:62`; `screens/nodelists/NodeListsViewModel.kt:109-110`
- **Beweis:** Der gleiche Algorithmus (`includes` pro Zeile) in der Server-Fassung `parseNodeListFile`: 396 074 Zeichen (unter `MAX_CHARS` 400 000), 64 704 Adressen, **7197 ms** auf diesem Rechner. Auf einem Telefon im Hauptthread folgt ein „App reagiert nicht“.
- **Fix-Vorschlag:** `LinkedHashSet` zur Entdopplung; Parsen in `Dispatchers.Default`; Obergrenze für die Zahl der Adressen (250 pro Liste, passend zur Serverobergrenze).
- **Status:** GETESTET (JS-Gegenstück), Kotlin GELESEN

### L7 – Protokoll des Servers bewahrt eine Verkehrs-Zeitleiste
- **Schweregrad:** Low
- **Wo:** `index.ts:270` (`[sweep] removed N expired blob(s)`), dazu Lizenz-Zeilen mit Kundenname
- **Beweis:** Die Zeile kommt pro Minute, in der etwas ablief. In `docker logs` oder im Journal bleibt so über Monate stehen, wie viel Verkehr wann lief, länger als 24 Stunden.
- **Fix-Vorschlag:** Nur Summen pro Tag oder gar nicht protokollieren; Zahlen bleiben auf der Übersichtsseite (nur Speicher).
- **Status:** GETESTET (Zeile gesehen)

### L8 – Datenbank-Dateien sind für andere lokale Nutzer lesbar
- **Schweregrad:** Low
- **Wo:** `store/nodeStore.ts:35`, `index.ts:34`
- **Beweis:** `node-mesh.sqlite` und `-wal` mit `-rw-r--r--`, Datenordner `drwxr-xr-x` (Identität und Lizenz korrekt `0600`).
- **Fix-Vorschlag:** `process.umask(0o077)` am Start, Datenordner mit `0700` anlegen.
- **Status:** GETESTET

### L9 – Die Liste der Einstellungen, die Schutz senken, ist unvollständig
- **Schweregrad:** Low (Aussage)
- **Wo:** `config.ts`, `index.ts`, `tor/onionService.ts:110`
- **Beweis:** Neben `KEY_STORAGE=disk` und `NODE_MESH_TOR=0` senken auch: `ADMIN_BIND` (Setup-Seite mit Besitzercode im Netz), `NODE_MESH_PRINT_OWNER_CODE=1` (Schreibschlüssel ins Log), `NODE_MESH_MAX_BLOBS` (hebt die 200 000 an, die als fest beschrieben sind), `TOR_EXE_PATH` und `NODE_MESH_TOR_BIN_DIR` (beliebiges Tor-Programm ohne Hash-Prüfung), `NODE_MESH_PUBLIC_ADDRESS` (mit Klartext-Adresse siehe M7).
- **Widerlegt:** A10 und S10 („Two settings lower protection“).
- **Fix-Vorschlag:** Liste in CLAIMS A10 und Brief S10 ergänzen; beim Start jede dieser Einstellungen laut melden.
- **Status:** GELESEN

### L10 – PIN-Sperre lässt sich ohne Root über die Uhr aushebeln
- **Schweregrad:** Low (Aussage)
- **Persona:** Dieb mit entsperrtem Telefon
- **Wo:** `domain/security/PinManager.kt:62-63, 80`
- **Beweis:** `locked_until` vergleicht mit `System.currentTimeMillis()`. Wer in den Android-Einstellungen die Uhr vorstellt, hebt die Sperre auf. Abschnitt 6 nennt „device clock“, `SECURITY_CLAIMS` und A6 erwecken aber den Eindruck, dass es Root braucht.
- **Fix-Vorschlag:** Sperrzeit zusätzlich an `SystemClock.elapsedRealtime()` binden (überlebt keinen Neustart, ein Neustart verlangt aber ohnehin das Entsperren des Telefons); Zähler mit `commit()` statt `apply()` schreiben; Wortlaut anpassen.
- **Status:** GELESEN

### L11 – Phone Temp Node: 12 Verbindungen à 70 s legen ihn still
- **Schweregrad:** Low
- **Persona:** der eine Kontakt, der die Adresse kennt
- **Wo:** `app/.../PhoneTempNode.kt:83-84, 201-213`
- **Beweis:** `Semaphore(12)`, `soTimeout 70 000`. Zwölf langsame Verbindungen (oder zwölf Lang-Abrufe) sperren alle weiteren.
- **Fix-Vorschlag:** Kurze Lese-Zeitgrenze für den Kopf (5 s), Lang-Abruf getrennt zählen.
- **Status:** GELESEN

### L12 – Die „Zufallsfüllung“ besteht hinter der Nachricht aus Nullen (gehört zu F1)
- **Schweregrad:** Low (heute dieselbe Information wie F1; wichtig für die F1-Umsetzung)
- **Wo:** `app/.../NetworkObfuscation.kt:95-106`
- **Beweis (JVM, `Probe.java`):** `padPacket(300 B payload) x200: trailing zero bytes min=1944 max=3774 of 4096`. `System.arraycopy(pad, 0, result, 8, offset)` kopiert nur `offset` Füllbytes vor die Nachricht; dahinter bleibt das Feld leer. `CLAIMS_TO_EVIDENCE.md:78` und `F1_ENTSCHEIDUNG.md:7` sprechen von „random padding“ bzw. „Zufallsfüllung“.
- **Warum es zählt:** Die Länge ist auch ohne die ersten 8 Bytes am Nullschwanz ablesbar. Wer F1 nur halb umsetzt (Kopf verschlüsseln, Füllung außen lassen), behält das Leck.
- **Fix-Vorschlag:** Im F1-Umstieg zuerst auffüllen (mit Zufall bis 4096) und dann verschlüsseln; die anderen Implementierungen (iOS, Officer-App, Web-Reporter, Relay) auf denselben Fehler prüfen.
- **Status:** GETESTET (F1 selbst nicht neu)

### Info
- **I1** `/deposit` hat keine Bremse für falsche Geheimnisse: 500 Versuche in 438 ms, alle 401, kein 429. Bei 256 Bit Geheimnis nicht ausnutzbar; eine Bremse ist trotzdem gute Praxis. GETESTET.
- **I2** Der Server erzwingt nicht genau 4096 Byte, sondern 1 bis 4096. Die einheitliche Größe ist eine Eigenschaft der Clients, nicht des Servers (Brief §2 „Packets are 4096 bytes“). GETESTET.
- **I3** Entsperren schickt das Besitzer-Geheimnis selbst an die Steueradresse. Wer den gestoppten Server samt Steuerschlüssel hat und sich als Server ausgibt, erhält es. Das ist als Grenze bekannt (CLAIMS F1). Härtungsidee: Die App schickt nur einen aus dem Geheimnis abgeleiteten Siegel-Schlüssel, dann verliert ein Imitator die Node-Schlüssel, aber nicht den Schreibschlüssel. GELESEN.
- **I4** Biometrisches Entsperren ohne `CryptoObject` (`LockViewModel.kt:87-90`): auf einem gerooteten Telefon mit Hook-Werkzeugen umgehbar. Gilt ohnehin als Grenze. GELESEN.
- **I5** Pairing-Code-Felder (`p`, `k`, `s`) werden vor `contactDao.insert` nicht auf Länge geprüft (`QrPairViewModel.kt:449-473`). Ein kaputter Code erzeugt einen Kontakt ohne Sitzung. GELESEN.
- **I6** Doku veraltet: `SECURITY_CLAIMS.md:206` („release key … not created yet“), obwohl er seit 19.10. existiert (`SIGNING_TEST_KEY.md`). Der eingecheckte `REPORT.md` meldet 96 Prüfungen, der Brief 97; mein Lauf ergab 97. GELESEN.
- **I7** Zusammengeführtes Manifest (proDebug) hat 11 Berechtigungen, nicht 9: `USE_BIOMETRIC` und `USE_FINGERPRINT` kommen aus `androidx.biometric`. Harmlos, aber A1 und B5 nennen „nine“. GETESTET (Debug-Manifest; Release ANGENOMMEN gleich).

---

## 3. Aussagen in den Briefs, die der Code nicht stützt

| Quelle | Aussage | Was stimmt | Befund |
|---|---|---|---|
| Server §1.4, S1, CLAIMS A2 | Nur der Besitzer schreibt | Jedes Gerät mit der Firmenliste schreibt; Ex-Mitarbeiter bis zur Rotation | M5 |
| Server §1.5, S7, A11 | Kunde läuft, was geprüft wurde | Fingerabdruck ohne `node_modules`, native Datei, `tor-bin`; exe unsigniert | M8 |
| Server S1 | Alles andere antwortet 404 für jede Methode | OPTIONS 200 mit `Allow`, HEAD 200, Groß- und Kleinschreibung egal | L3 |
| Server S3, A16 | Aus den Dateien binnen etwa einer Minute | Nur solange der Server läuft | L2 |
| Server S5 | (Frage: Adressen von außen verknüpfbar?) | Ja, über den globalen Cursor und `/lock-status`, für jeden Fremden | M3 |
| Server S8, A19 | Lesebremse pro Node-Adresse | Pro Host-Header, frei wählbar, vergiftbar | M1 |
| Server S8 | Nicht ohne Grenze flutbar | Ein `/fetchMany` mit doppelten Tags blockiert alle Nodes | M2 |
| Server S9, A20 | Nur mit lokalem Host-Header | Host-Header schützt nur gegen DNS-Rebinding; Container-Nachbarn kommen durch | M11 |
| Server S10, A10 | Zwei Einstellungen senken Schutz | Mindestens sieben | L9 |
| Server S2, A9 | Nichts über Menschen in Logs | Keine Personen, aber eine dauerhafte Verkehrs-Zeitleiste | L7 |
| Server A15 | Verrät das Framework nicht | Express-404-Seite, ETag, Allow | L3 |
| Android §1.5, A5, `SECURITY_CLAIMS:161` | Schlüssel durch den Keystore geschützt, nie im Klartext | DB-Schlüssel im Klartext; Kontaktschlüssel und Ratchet-Zustand darin | H1 |
| Android B10 | Backup aus | Gerät-zu-Gerät-Übertragung an | M9 |
| Android A3, B3 | Tags nicht über Kontakte verknüpfbar | Gegenüber dem Betreiber über Abrufmuster verkettbar | M4 |
| Android §1.2, A2 | Nur zu den eigenen Servern des Kunden | Klartext-Adressen werden angenommen; Schreibschlüssel über Exit | M7 |
| Android A6, D3 | Panik-PIN entfernt das Genannte | Offener Pairing-Code bleibt; gelöschte Zeilen wiederherstellbar | M10 |
| Android A7 | Zwischenablage nach 60 s geleert | Nicht, wenn die App im Hintergrund ist | L4 |
| Android A8 | Äußere Schicht mit Kontaktschlüssel | Stimmt, aber Steuersignale hängen nur an dieser statischen Schicht | M6 |
| Android A9 | Eingaben sicher behandelt | Unbegrenzte Größen; quadratischer Parser | L5, L6 |
| Android A1, B5 | Neun Berechtigungen | Elf im zusammengeführten Manifest | I7 |
| Android A6 (Text), `SECURITY_CLAIMS` Tier 3 | Zähler nur mit Root zurücksetzbar | Uhr vorstellen genügt | L10 |
| `CLAIMS_TO_EVIDENCE:78`, `F1_ENTSCHEIDUNG:7` | Zufallsfüllung | Hinter der Nachricht Nullen | L12 |
| `SECURITY_CLAIMS:206` | Release-Schlüssel noch nicht angelegt | Existiert seit 19.10. | I6 |

---

## 4. Was gehalten hat

Server (GETESTET auf eigener Instanz, Tor aus, Wegwerf-Lizenzschlüssel nur in einer Kopie im Scratchpad):
- Genau die sieben Routen; unbekannte Pfade 404; falsche Methoden auf echten Pfaden 404 (außer OPTIONS und HEAD, siehe L3).
- Authentisierung: ohne, mit falschem, kleingeschriebenem `bearer`, doppeltem Leerzeichen oder nacktem Geheimnis jeweils 401.
- Zeitvergleich des Besitzer-Geheimnisses: kein messbarer Unterschied (je 4000 Messungen, Median 366,9 / 365,4 / 368,7 µs für ganz falsch, nur letztes Zeichen falsch, zu kurz).
- Strenges Base64 (`@@@@`, Base64url-Zeichen, Zeilenumbruch abgelehnt), 4097 Byte → 413, 17-KB-Körper → 413, kaputtes JSON → kurzes JSON ohne Stacktrace, Tag-Regeln (65 Zeichen, Leerzeichen, Array) → 400.
- TTL: negativ und als Text abgelehnt; 10 Tage und 1e308 werden auf das Profil gekappt (Skript 01 und Code).
- 1500 Pakete pro Tag: der 1501. ergibt 429.
- Datenbank und WAL enthalten weder Geheimnis noch User-Agent noch `X-Forwarded-For`; Marker-Paket war im laufenden Betrieb 64 s nach dem Einwurf (TTL 3 s) aus allen Dateien verschwunden, Tag ebenso.
- Versiegelter Neustart: `locked:true`, `/deposit` und `/pool` 423, Setup-Seite zeigt keinen Besitzercode, `/unlock` falsch 401, richtig 200, danach Einwurf 201.
- Ohne Terminal kein Besitzercode im Log; kein 43-Zeichen-Geheimnis im Log gefunden.
- Setup-Seite: sieben Host-Varianten getestet, nur Loopback-Namen mit Port erlaubt; ohne `x-unpruuf-admin` 403 für Export, Rotation, Entsperren; CSP, `X-Frame-Options: DENY`, `no-store` gesetzt; HTML in Bridge-Zeilen abgewiesen; Lizenz-Müll abgewiesen.
- Server-Unit-Tests: 113, davon 112 bestanden, 1 übersprungen, 0 fehlgeschlagen. Beweisskripte: 97 bestanden, 0 fehlgeschlagen, 1 Befund (F1). `npm audit` Produktion: 0. Einziges Installationsskript: `better-sqlite3`.
- Tor-Download: Hash vor dem Entpacken, unbekannte Plattform verweigert (GELESEN; Online-Abgleich nicht gemacht).

Android:
- Unit-Tests `proDebug` 166/166 und `groupDebug` 166/166 grün (GETESTET).
- Ratchet: Entschlüsselung arbeitet auf einer frischen Kopie und speichert nur bei Erfolg; ein gefälschtes oder wiederholtes Paket verdirbt die Sitzung nicht (GELESEN). Übersprungene Schlüssel auf 1000 begrenzt.
- Äußere Schicht: frische 12-Byte-IV aus `SecureRandom` pro Paket; alle Schlüssel aus `SecureRandom` (GELESEN).
- PIN: PBKDF2 mit 120 000 Runden, Hashes unter Keystore versiegelt, zeitkonstanter Vergleich, Panik ungleich PIN erzwungen (GELESEN).
- Benachrichtigung: nur „New message“, `VISIBILITY_SECRET` (GELESEN).
- Manifest (Quelle): `allowBackup=false`, Klartext-Verkehr aus, nur die Start-Activity exportiert, Dienste und Empfänger nicht exportiert; die exportierten Tooling-Activities im Debug-Manifest kommen nur aus `debugImplementation` (GETESTET am Debug-Manifest).
- Bilder: Größe wird vor dem Dekodieren gelesen, Grenzen 50 Mio. Pixel und 20 000 px (GELESEN, `SafeImageTest` grün).
- Gruppen: Nachricht nur angezeigt, wenn der Absender Mitglied ist; Hinweisliste auf 20 begrenzt (GELESEN).
- Logging: ein einziges `Log.d`, nur im Debug-Build, ohne Inhalt (GELESEN).
- Im Repository liegen keine Signaturschlüssel, Keystores oder `release.properties` (GETESTET mit `git ls-files` und Verzeichnisliste).

---

## 5. Abdeckung

**Ausgeführt (GETESTET):** Node-Server-Build; `node evidence/00-run-all.js` (offline); Server-Unit-Tests; eigene Black-Box-Skripte gegen `127.0.0.1:18788/18790` (Oberfläche, Methoden, Pfade, Header, Körper, Bremsen, Verstärkung, Timing, Forensik vor und nach Ablauf, Stopp und Neustart, Setup-Seite); Gradle `testProDebugUnitTest` und `testGroupDebugUnitTest` offline; JVM-Probe gegen kompilierte App-Klassen (`NetworkObfuscation`, `RatchetFrame`); Auswertung des zusammengeführten Debug-Manifests. Lasten waren klein und nur lokal (höchstens 1500 Pakete, 8 parallele Anfragen, 4000 × 3 Timing-Anfragen).

**Gelesen:** `app.ts`, `routes/node.ts`, `middleware/*`, `config.ts`, `index.ts`, `nodeIdentity.ts`, `store/nodeStore.ts`, `admin/adminApp.ts` (Routen und Prüfungen), `license.ts`, `integrity.ts`, `tor/torDownload.ts`, `tor/torProcess.ts`, `tor/onionService.ts`, Teile von `tor/torControl.ts`, `nodeList.ts`, Dockerfile, compose; Android: Manifest, `build.gradle.kts`, `AppModule`, `CryptoManager`, `NetworkObfuscation`, `DoubleRatchet`, `RatchetSessionManager`, `RatchetFrame`, `IdentityManager` (Schlüssel und Tags), `P2PNetworkManager` (Empfang, Abruf, Füllverkehr), `NodeMeshClient` (Transport), `NodeMeshManager` (Parser), `NodeListFile`, `NodeMeshPairing`, `QrPairViewModel` (Node-Mesh-Annahme), `PinManager`, `SealedStrings`, `LockViewModel`, `SafeImage`, `SensitiveClipboard`, `PhoneTempNode`, `GroupInbox`, `GroupCode`, Teile von `MainActivity` und `ConnectionPaths`.

**Nicht angefasst:** Telefone (normal, gerootet, zwei Hersteller, Android 12 und 13+), FLAG_SECURE und Dialoge am Gerät, Gerät-zu-Gerät-Übertragung, Forensik-Abbild eines Telefons, Release-APK (keines vorhanden; debuggable/testOnly/R8 also nicht geprüft), echtes Tor und PoW, Bridges, Snowflake, IPtProxy, `TorManager` im Detail, Feed-Krypto und `FeedUpdater`, 24-Stunden-Mitschnitt, echter VPS, Docker-Lauf, Server mit 250 Nodes, Langsam-Verbindungs-Angriffe auf den Server, Speicher-Forensik des Server-Prozesses, Online-Abgleich der Tor-Hashes und PGP, iOS, Control, Officer-App, Press, unpruuf Compliance-spezifische Teile, Lizenz-Tool.

**Was ein Gerätetest mindestens abdecken muss:** H1 (Inhalt von `shared_prefs/db_key_store.xml` mit Root, Öffnen der DB mit diesem Schlüssel), M9 (Übertragung von Gerät zu Gerät), M10 (Abbild nach Panik-PIN auf Kontaktreste durchsuchen), L4 (Zwischenablage nach 60 s im Hintergrund), A7 (Bildschirmfoto mit offenem Dialog, App-Umschalter), L10 (Uhr vorstellen während der Sperre), A4 (Abbild nach Nutzung auf Nachrichtentext durchsuchen).

**Nebenwirkungen meines Laufs:** `evidence/REPORT.md` und `REPORT.json` hat das Beweisskript überschrieben; ich habe sie per `git checkout` auf den eingecheckten Stand zurückgesetzt (meine Fassung liegt in `scratchpad/evidence-run/`). Versehentlich angelegt: `/server1.pid` (4 Byte, enthält eine PID) im Wurzelverzeichnis. Das Löschen hat eine Sicherheitsprüfung blockiert; bitte von Hand entfernen. Das Repository ist sonst unverändert (`git status` leer).

---

## 6. Vorschlag für neue dauerhafte Prüfungen (für `unpruuf/evidence/`, nur Vorschlag)
- `10-server-abuse.js`: Host-Rotation darf die Bremse nicht vervielfachen (M1); `fetchMany` mit 64 gleichen Tags muss abgewiesen oder entdoppelt werden (M2); der Cursor darf ohne passenden Tag nicht wachsen (M3); 404 ist JSON ohne `Allow` und ETag (L3).
- `11-app-at-rest.js`: Quellprüfung, dass `getOrCreateDbKey` über `CryptoManager` läuft (H1), dass `dataExtractionRules` mit `device-transfer` existiert (M9) und dass `wipeEverything` `clearPendingNodeMeshPairing` aufruft (M10).
- Unit-Tests: `RatchetFrame` mit `totalChunks` über der Grenze → `null`; `unpadPacket` mit kaputtem Kopf → definierte Ausnahme ohne große Zuteilung; Node-Adressen ohne `.onion` → abgelehnt.
