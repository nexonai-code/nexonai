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
- Schutz gegen Überflutung: Tor-Proof-of-Work (Windows/Linux/Docker) plus Begrenzung der
  Leseanfragen (alle Plattformen). **Android-Nodes haben keinen Tor-Proof-of-Work** — wo
  Überflutungsschutz wichtig ist, einen PC/Server-Node verwenden.
- Stürzt Tor ab, startet der Node es selbst neu — mit derselben Adresse.
- Abgelaufene Nachrichten werden automatisch und überschreibend gelöscht. Lesen löscht nie.

## Was Sie wissen sollten

- Keine unabhängige Sicherheitsprüfung (Audit) bisher. Die Eigenschaften sind so gebaut und im
  Quellcode nachvollziehbar, aber nicht zertifiziert.
- Ein weltweiter Beobachter, der gleichzeitig das Netz beider Seiten mitschneidet, kann zeitliche
  Muster (wann geschrieben, wann abgeholt) weiterhin in Beziehung setzen — ein allgemeines,
  ungelöstes Problem jedes Tor-Dienstes.
- Keine Konten, keine Mehrgeräte-Nutzung: Eine unpruuf-Identität lebt auf genau einem Gerät.
