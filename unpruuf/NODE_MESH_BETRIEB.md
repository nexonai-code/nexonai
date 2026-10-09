# unpruuf Business — Betrieb Ihrer eigenen Nodes

Diese Anleitung ist für die Person, die bei Ihnen die unpruuf-Nodes einrichtet und betreibt.
Technischer Hintergrund: `NODE_MESH_SPEC.md`.

## Das Prinzip in drei Sätzen

1. Jede Person betreibt **eigene** Nodes. NexonAI betreibt keinen einzigen — wir liefern nur die
   Software.
2. Sie schreiben Ihre Nachrichten nur auf **Ihre eigenen** Nodes; Ihre Kontakte holen sie dort ab
   (nur lesend). Umgekehrt holen Sie bei den Nodes Ihrer Kontakte ab.
3. Ein Node sieht nie Inhalt, nie Absender-IP, nie wer mit wem spricht — und nie beide Richtungen
   eines Gesprächs, **solange Ihre Nodes und die Ihrer Kontakte von verschiedenen Stellen
   betrieben werden**. Hostet eine Stelle die Nodes beider Seiten, sieht sie beide Richtungen
   (weiterhin verschlüsselt). Das ist eine Frage der Aufstellung, keine Kryptographie-Garantie.

## Wie viele Nodes?

| Anzahl | Empfehlung |
|---|---|
| 1 | Funktioniert. **Aber:** ändert sich die Adresse dieses einen Nodes (Umzug, neue Hardware), müssen alle Kontakte **neu pairen** — es gibt keinen automatischen Weg. |
| **2** | **Empfohlen als Minimum.** Fällt einer aus oder zieht um, läuft alles über den anderen weiter; Adressänderungen werden automatisch an Kontakte verteilt. |
| 3 | Maximum. Beste Ausfallsicherheit. |

Jeder Node auf einem eigenen Gerät: Windows-PC, Linux-Server, Docker oder ein Android-Gerät.

## Einrichtung

**Windows:** `install.bat`, dann `start.bat`. Beim ersten Start wählen Sie:

- **Slot 1, 2 oder 3** — jeder Ihrer Nodes bekommt einen anderen Slot. Dadurch laufen die
  täglichen Wartungen nie gleichzeitig.
- **Profil** — wie lange Nachrichten auf dem Node liegen, wenn der Kontakt sie noch nicht geholt
  hat:

| Profil | Dauer | Wann |
|---|---|---|
| `standard` | 6 Stunden | Normalfall |
| `high-security` | 1 Stunde | So wenig gespeicherte Daten wie möglich. Kontakte müssen innerhalb einer Stunde online sein. |
| `offline-tolerant` | 24 Stunden | Kontakte sind oft lange offline |

Danach öffnet sich die Einrichtungsseite mit einem QR-Code. In der unpruuf-App:
**Einstellungen → Business Node-Mesh → QR scannen.**

**Linux:** `./start.sh <slot> <profil>` · **Docker:** `docker compose up -d`, Einrichtungsseite
unter `http://localhost:8790`.

**Android-Gerät als Node:** App „unpruuf Relay“ installieren, oben **Business Node** wählen,
Profil und Slot setzen, den angezeigten QR mit der unpruuf-App scannen. Gerät am Strom lassen und
die Akku-Optimierung für die App ausschalten (die App fragt danach).

## Die Server-Lizenz

Jeder Node-Server läuft mit einer Lizenz. Sie bekommen von uns **einen Lizenzcode je Server**.

1. Beim ersten Start zeigt die Einrichtungsseite „Lizenz erforderlich“. Code einfügen, **Lizenz
   aktivieren**. Der Server startet sofort.
2. Der Code legt fest, **wie viele Nodes** dieser Server betreibt (normal 250, mehr gibt es nicht) und **bis wann**. Der Server startet immer alle — die Zahl lässt sich nicht einstellen.
3. 30 Tage vor Ablauf weist die Einrichtungsseite darauf hin. Den Verlängerungscode einfach dort
   einfügen — der Server läuft dabei weiter.
4. Läuft die Lizenz ab, nimmt der Server **keine neuen Nachrichten** mehr an. Bereits abgelegte
   Pakete können weiter abgeholt werden, es geht nichts verloren.

Der Code wird nur auf Ihrem Rechner geprüft. Er sendet nichts an uns, und wir sehen nicht, wo er läuft.
Der Betrieb liegt vollständig bei Ihnen: Ihr Server, Ihre Schlüssel, Ihre Daten.

## Node-Listen: welche Server für welche Kontakte

1. Auf der Einrichtungsseite Ihres Servers: **„Liste als Datei speichern“**.
2. Die Datei auf Ihr eigenes Handy bringen (Kabel oder ein vertrauter Weg) und in der App öffnen:
   **Einstellungen → Node-Listen → Datei auswählen → Importieren**. Danach die Datei löschen: sie enthält
   Ihren Schreibschlüssel.
3. Jeder Server (oder jede Gruppe von Servern) wird eine **Liste** mit Namen, z. B. „Kunde A“ oder „Wien“.
4. Beim **Hinzufügen eines Kontakts** wählen Sie eine Liste. Der Kontakt bekommt drei Nodes daraus, zufällig
   gewählt. So legen Sie sauber fest, welche Server welche Kontakte tragen können.
5. Tipp: Legen Sie mehrere Server in eine Liste. Dann liegen die drei Nodes eines Kontakts bei
   verschiedenen Betreibern, und niemand sieht alle drei.

## Teilen sich Kontakte Nodes?

Ja, und das ist Absicht. Jeder Kontakt bekommt drei Nodes aus der gewählten Liste, zufällig und auf möglichst
verschiedene Server verteilt. Mehrere Kontakte dürfen auf denselben Nodes liegen.

Warum: Ein Node, der nur zu einem einzigen Kontakt gehört, wäre das Erkennungszeichen genau dieses Gesprächs. Wer ihn
beobachtet, sieht dessen Menge und Zeitpunkte. Tragen viele Gespräche einen Node gemeinsam, vermischt sich der Verkehr,
und der Node kann ihn keinem Gespräch zuordnen. Die Gespräche trennen die Schlüssel und die stündlich wechselnden
Paketadressen, nicht der Node.

Was das für Sie heißt:

- Ein Server mit 250 Nodes trägt weit mehr als 83 Kontakte. Eine feste Obergrenze gibt es nicht.
- Je mehr aktive Leute dieselben Nodes nutzen, desto besser die Vermischung. Bei sehr wenigen Nutzern ist der Effekt klein.
- Die drei Nodes eines Kontakts liegen auf verschiedenen Servern, sobald die Liste mehrere Server enthält. Dann sieht
  kein einzelner Server das ganze Gespräch.
- Ein ausgefallener Node betrifft alle Kontakte, die ihn nutzen. Deshalb hat jeder Kontakt drei.
- Tragfähigkeit: Ein Node nimmt im Schnitt 5 Abfragen pro Sekunde an. Die App fragt etwa alle 20 Sekunden. Das ergibt
  rechnerisch rund 100 gleichzeitig aktive Nutzer pro Node. Das ist eine Rechnung aus dem Code, kein Lasttest.

## Wie lange bleiben Pakete liegen?

- **Pro Chat einstellbar:** In jedem Business-Chat gibt es oben die Uhr: 1, 6 oder 24 Stunden. Das gilt für das, was
  Sie in diesem Chat senden. Standard sind 24 Stunden. Ihr Kontakt muss die Pakete in dieser Zeit abholen.
- Der Node hält ein Paket nie länger, als sein Profil erlaubt (höchstens 24 Stunden), egal was angefragt wird.
- Der Node sieht die gewählte Zeit. Es gibt bewusst nur drei Stufen, damit sie Chats nicht unterscheidbar macht.
- Nach Ablauf wird das Paket überschrieben und gelöscht. Lesen löscht nie.

## Wo liegen die Pakete: Platte oder nur Arbeitsspeicher?

- **Standard: auf der Platte** (SQLite-Datei). Pakete überleben einen Neustart bis zu ihrem Ablauf.
- **Nur Arbeitsspeicher:** `NODE_MESH_STORE=ram` (die `start.bat` fragt beim ersten Start). Pakete liegen nur im RAM,
  nichts wird auf die Platte geschrieben. Ein Neustart oder Stromausfall leert alles, was noch wartet. Der Schlüssel
  bleibt davon getrennt: er liegt weiter verschlüsselt auf der Platte (siehe unten).
- Die Übersichtsseite zeigt, welche Variante läuft.
- Der Temp Node liegt immer nur im Arbeitsspeicher.

## Listen-Dienst für Mitarbeiter (aktuelle Node-Listen automatisch)

Für Firmen: Ihre Mitarbeiter sollen immer die aktuellen Node-Listen haben, ohne dass Sie Dateien verteilen.

1. Auf einem Ihrer Server `start-feed.bat` starten. Die Einrichtungsseite öffnet sich (`http://localhost:8841`).
2. **Einrichten:** Firmenname, Wechselzeit (z. B. alle 6 Stunden) und ein Passwort wählen. Es erscheint der **Feed-Code**
   (QR und Text). Den Code nur an Mitarbeiter geben, er ist ein Geheimnis.
3. **Veröffentlichen:** die Dateien wählen, die Ihre Node-Server mit „Liste als Datei speichern“ ausgeben, Passwort
   eingeben, fertig. Jede Veröffentlichung ersetzt die vorherige.
4. **Mitarbeiter:** in der App unter Einstellungen → Node-Listen → Firmen-Feeds den Feed-Code einfügen. Die App holt die
   Listen selbst (etwa stündlich) und legt sie als eigene Listen an.

Wie es geschützt ist: Die Onion-Adresse des Dienstes ändert sich alle paar Stunden. Nur Apps mit dem Feed-Code rechnen sie
aus. Die Liste ist verschlüsselt und von Ihnen signiert: Eine App nimmt nur Listen an, die wirklich von Ihrer Firma kommen,
und nie eine ältere als die, die sie schon hat. Der Server hält die Schlüssel zum Lesen und Signieren nur unter Ihrem
Passwort.

Wichtig zu wissen: Entfernt die Firma einen Node aus der Liste, verschwindet er bei den Mitarbeitern. Bei einem
ausgeschiedenen Mitarbeiter tauschen Sie den Schreibschlüssel des Servers (Einrichtungsseite) und veröffentlichen die neue Liste.

## Der QR-Code ist Ihr Schreibschlüssel

- Nur in **Ihre eigene** unpruuf-App scannen.
- **Nie** an Kontakte weitergeben — die brauchen ihn nicht. Sie bekommen die Adresse Ihrer Nodes
  automatisch beim Pairing, und damit können sie nur lesen.
- Verdacht, dass er in falsche Hände geraten ist? PC-Node: auf der Einrichtungsseite
  „Schreibschlüssel erneuern“. Android-Node: „Owner key → Rotate“. Danach den neuen QR in Ihre App
  scannen. Kontakte sind davon nicht betroffen, die Node-Adresse bleibt gleich.

## Temp Node — für ein einzelnes, besonders sensibles Gespräch

Auf einem beliebigen zweiten Gerät `start-tempnode.bat` starten, in der App im Chat **Temp Node**
wählen und den QR scannen. Ab dann läuft Ihr ausgehender Verkehr in diesem einen Chat nur noch
über dieses Gerät. Alles liegt nur im Arbeitsspeicher; Fenster schließen = Node und Adresse sind
weg, und die App fällt automatisch auf Ihre normalen Nodes zurück (auch wenn das Gerät einfach
ausfällt — nach drei verpassten Lebenszeichen).

## Was der Node selbst erledigt

- Eigene, feste Tor-Adresse — ändert sich bei Neustarts nicht.
- Schlüssel liegen nur verschlüsselt auf der Platte. **Nach einem Neustart ist der Server gesperrt**,
  bis Sie ihn in der App entsperren (Einstellungen → Eigene Nodes → Entsperren). Ein beschlagnahmter,
  ausgeschalteter Server kann so nicht unter Ihren Adressen weiterlaufen. Nur entsperren, wenn Sie
  wissen, warum er neu gestartet ist — im Zweifel einen neuen Server aufsetzen.
- Die App legt zusätzlich in zufälligen Abständen leere Tarn-Pakete ab und fragt immer im selben
  Takt ab. Wer den Node beobachtet, sieht nicht, wann wirklich geschrieben oder ein Chat geöffnet wird.
- Schutz gegen Überflutung: Tor-Proof-of-Work (Windows/Linux/Docker) plus Begrenzung der
  Leseanfragen (alle Plattformen). **Android-Nodes haben keinen Tor-Proof-of-Work** — wo
  Überflutungsschutz wichtig ist, einen PC/Server-Node verwenden.
- Stürzt Tor ab, startet der Node es selbst neu — mit derselben Adresse.
- Abgelaufene Nachrichten werden automatisch und überschreibend gelöscht. Lesen löscht nie.

## Prüfen, ob der Server das Original von NexonAI ist

Jede Version von NexonAI enthält eine signierte Liste aller Programmdateien (`release-manifest.txt`). Der Server prüft sich damit beim Start und danach jede Stunde selbst.

- **Übersichtsseite, Zeile „Programm“:**
  - grün „unverändert, signiert“ mit Version und **Fingerprint**: alle Dateien stimmen mit der Liste von NexonAI überein.
  - rot „VERÄNDERT“: eine Datei wurde geändert, fehlt oder ist neu dazugekommen. Das Banner oben warnt. Neu von NexonAI laden und vergleichen, bevor der Server weiter benutzt wird.
  - gelb „nicht signiert“: Entwicklungsstand ohne Liste. Kein Alarm, aber auch kein Nachweis.
- **Fingerprint vergleichen:** NexonAI veröffentlicht zu jeder Version den Fingerprint (16 Vierergruppen). Er muss mit dem auf Ihrer Übersichtsseite übereinstimmen.
- **Von außen prüfen (Prüfer, Kunde):** `verify-release.bat` (Windows) oder `./verify-release.sh` (Linux) auf einer Kopie der Dateien. Dort kann der veröffentlichte Fingerprint eingegeben werden; das Skript sagt, ob er stimmt. Dafür muss der Server nicht laufen.
- **Streng starten:** `NODE_MESH_REQUIRE_SIGNED=1` lässt den Server nur starten, wenn alles stimmt.

**Was das nicht kann:** Ein Server, der gerade gehackt läuft, kann über sich selbst lügen. Die Prüfung findet Dateien, die auf der Platte verändert wurden, und erlaubt einen Vergleich von außen. Sie beweist nicht, dass ein laufender Rechner sauber ist. Dazu gehören ein gehärteter Rechner (Container, schreibgeschütztes Dateisystem), der Arbeitsspeicher-Modus und ein Neustart-Plan. Nicht abgedeckt sind `node_modules` und der Datenordner. Bei der einzelnen `.exe` zeigt die Seite nur deren SHA-256, den Sie mit dem veröffentlichten vergleichen.

## Was Sie wissen sollten

- Keine unabhängige Sicherheitsprüfung (Audit) bisher. Die Eigenschaften sind so gebaut und im
  Quellcode nachvollziehbar, aber nicht zertifiziert.
- Ein weltweiter Beobachter, der gleichzeitig das Netz beider Seiten mitschneidet, kann zeitliche
  Muster (wann geschrieben, wann abgeholt) weiterhin in Beziehung setzen — ein allgemeines,
  ungelöstes Problem jedes Tor-Dienstes.
- Keine Konten, keine Mehrgeräte-Nutzung: Eine unpruuf-Identität lebt auf genau einem Gerät.
