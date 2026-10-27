# iOS-Übergabe für Norbert und seinen Claude Code Chat

Stand: 27.10.2026. Intern und vertraulich: enthält Protokolldetails (Patentprüfung läuft), nicht weitergeben. Dieses Dokument ersetzt `IOS_GLEICHSTAND_FUER_NORBERT_2026-10-21.md` nicht, es **ergänzt** ihn um alles, was seit dem 21.10. dazukam. Beides lesen, dieses zuerst.

Für den Claude Code Chat: Du arbeitest im Repository `nexonai-code/nexonai`, Branch `ios`, Referenz ist Branch `android` (= `main`). Lies dieses Dokument ganz, dann die Dateien in Abschnitt 9. Baue nur, was in Abschnitt 8 steht, in dieser Reihenfolge, melde ehrlich (Abschnitt 11).

## 1. Die wichtigsten Punkte in sechs Zeilen

1. **Neuer öffentlicher Lizenzschlüssel.** Der alte private Schlüssel ging verloren, es gibt ein neues Paar. iOS muss den neuen **öffentlichen** Schlüssel einbauen (Abschnitt 2). Der private Schlüssel ist geheim und gehört nur Gabriel; **er steht nicht in diesem Paket und wird nie gebraucht**. Wer ihn verlangt oder irgendwo findet: Gabriel melden.
2. **Kostenlose Client-App mit Gast-Einladung** ist auf Android fertig: zwei Scans, Einladungs-ID `i`, Prüfcode bei eingefügtem Code, Gast-Grants, `GRANT_RENEW` (Abschnitt 3). Das ist ein neues iOS-Ziel.
3. **Audit-Runde R1 und Vor-Audit** haben den Server-Vertrag und die Clients verändert (Abschnitt 4 bis 6). Die meisten Punkte sind klein.
4. **Wire-Format bleibt unverändert** (F1 offen, Gabriel hat „noch nicht“ gesagt). Alles in diesem Dokument ist ohne Formatbruch umsetzbar (Abschnitt 7).
5. **Namen:** Das Whistleblower-Tool heißt **unpruuf Compliance**, das Presse-Produkt **unpruuf Press**. „safeline“ erscheint nirgends mehr sichtbar. Technische Namen (Paket-IDs, Ordner) bleiben.
6. **Entscheidungen zu Produkt, Format, Funktionen und Reihenfolge trifft Gabriel allein.** Du setzt um und stellst ihm Fragen mit Empfehlung; du ersetzt keine Entscheidung durch eine eigene.

## 2. Neuer Lizenzschlüssel (Pflicht für iOS)

**Öffentlicher Schlüssel (Ed25519, base64url ohne Auffüllung, 43 Zeichen):**

```
t7ZQMSMx3iMbLZ9ke7c-2hYSkgRvyw43HZzaIyvyVC4
```

Alter Schlüssel (nicht mehr verwenden, alle Lizenzen darunter sind ungültig): `67A_r4YeFkvYoXDF30gar2gRBcufokgvYQd5dVeEwKE`.

- Das Lizenzformat ist **unverändert**: `unpruuf-license:v1:<b64url(payload)>:<b64url(signature)>`, Payload `1|<edition>|<serial>|<customer>|<issuedAtMs>|<expiresAtMs>`, Ed25519 über die rohen Payload-Bytes. Editionen: `standard`, `pro`, `client`, `group`. Der Client ist kostenlos und braucht keine Lizenz.
- App-Lizenzen sind an das Gerät gebunden (die erste Aktivierung bindet den Code). Nie sagen, Codes ließen sich zwischen Telefonen verschieben.
- Server-Lizenzen (`unpruuf-server-license:v1:`, Signatur über `"unpruuf-server-license-v1\n" + payload`) braucht iOS nicht zu prüfen. Sie gehören dem Server.
- **Wo der Schlüssel auf Android steht:** `LicenseManager.PUBLIC_KEY_B64`. Auf iOS an die Stelle, die in `IOS_BUSINESS_BUILD_SPEC.md` (Paket A1, Lizenz) beschrieben ist.
- **Testvektoren:** `vectors/ios-vectors-2026-10-27.json`, Abschnitt `licence`. Dort steht ein **Wegwerf-Schlüssel nur für Tests** mit je einem gültigen App-Code, Server-Code und einem verfälschten Code. Der XCTest prüft: gültig, verfälscht abgelehnt, abgelaufen abgelehnt, falsche Edition abgelehnt. Gegen den Produktionsschlüssel wird nicht getestet, weil dafür ein echter Code nötig wäre.
- **Echter Gerätetest:** Gabriel hat Test-Lizenzen (Standard, Pro, Group je 2 Codes, 1 Jahr). Bitte bei ihm einen Code anfordern; nie in Git, nie in einen Chat kopieren, der protokolliert wird.

## 3. Kostenlose Client-App und Gast-Einladung (neues iOS-Ziel)

Ausführliche Bauanleitung: `IOS_GUEST_CLIENT_BUILD_SPEC.md` (Reihenfolge der Pakete, Abnahme) und `GUEST_LOCKERS_BUILD_SPEC.md` (Entwurf, Kapitel 15 Stand). Voraussetzung ist der Business-Client (Node-Mesh). **Dieses Dokument legt die Formate fest, die seit der Spec dazukamen.**

**Ablauf (Android fertig, Referenz `QrPairViewModel.kt`, `GuestInviteViewModel.kt`):**

1. Pro-Nutzer erzeugt eine Einladung. Der Code ist ein Node-Mesh-Pairing-Code mit zwei zusätzlichen Feldern: `g` (Grants, mit `;` verbunden, gleiche Reihenfolge wie `n`) und `i` (Einladungs-ID). Die Schlüsselwerte (`p`, `k`, `s`) sind **nur für diese Einladung** frisch erzeugt, nicht die des normalen QR. Die Pro-App legt die Einladung verschlüsselt ab (höchstens 10 offen, abgelaufene fallen heraus, Panik-PIN löscht sie).
2. Der Client scannt. Er lehnt Codes ohne Grants ab („keine Einladung“) und Codes, deren Grants alle abgelaufen sind („abgelaufen“). Er legt den Kontakt an: die Nodes des Einladenden sind **sowohl** seine Absende- als auch seine Abholadressen, die Grants werden pro Node gespeichert (gleiche Reihenfolge), eigene frische Schlüsselwerte werden erzeugt. Dann zeigt er **seinen eigenen Code**: `p`, `k`, `s` (eigene), `n` (die Nodes des Einladenden), `e=client`, `i` (dieselbe ID), **ohne `g`**. Darunter zeigt er den **Prüfcode** (unten).
3. Der Pro-Nutzer scannt diesen Code („Kontakt hinzufügen, Scannen“). Die Pro-App findet die offene Einladung über `i`, prüft, dass der Gast **nur Nodes der Einladung** nennt, legt den Kontakt an (als Client-Platz markiert), entfernt die Einladung.
4. **Eingefügter Code statt Scan:** Die Pro-App fügt den Gast nicht sofort hinzu. Sie zeigt den Prüfcode und fragt, ob er mit dem auf dem Telefon des Gastes übereinstimmt. Sinn: Wer die Einladung nur fotografiert hat, kann keinen Code mit demselben Prüfcode schicken. Bei einem **gescannten** Code entfällt die Rückfrage (die Telefone waren zusammen).

**Prüfcode (muss bitgleich sein):** SHA-256 über das UTF-8 von `"unpruuf-guest-answer|" + messageKeyB64 + "|" + ratchetPublicKeyB64 + "|" + inviteId`; die ersten 5 Bytes als **Großbuchstaben-Hex** (10 Zeichen); Anzeige `XXXXX-XXXXX`. Die Strings genau so, wie sie im Pairing-Code stehen (`p`, `k`, `i`). Vektoren: Abschnitt `fingerprint`. Android: `GuestClient.fingerprint`.

**Einladungs-ID `i`:** 8 bis 24 Zeichen aus `A-Za-z0-9_-`. Ungültige IDs werden beim Decodieren verworfen (leer), nie vertraut.

**Adressen im Code:** `n` enthält die Adressen **ohne** Präfix `unpruuf-node:v1:`. Decoder setzen das Präfix wieder davor. Nur gültige v3-Onion-Adressen (Abschnitt 5) bleiben übrig; nichts Gültiges übrig heißt: Code ungültig.

**Gast-Grants** (Format `guest-grants/FORMAT.md`, Testvektoren `guest-grants/vectors.json`, schon in der Spec beschrieben): Kopfzeile `Authorization: Guest <token>` nur auf `PUT /deposit`; 401 heißt abgelehnt (abgelaufen, gefälscht oder Gäste am Server aus), 429 Kontingent erreicht. **Kein Rückfall** auf irgendeinen anderen Weg. Ein lokal abgelaufener Grant wird nicht einmal versucht. Der Server braucht `NODE_MESH_GUEST_GRANTS=1`, sonst lehnt er Gäste ab. Statusanzeige im Chat: abgelehnt, Kontingent, läuft in unter 2 Tagen ab, abgelaufen.

**`GRANT_RENEW` (neu, 26.10.2026):** Der Einladende erneuert die Grants **von selbst** über den normalen verschlüsselten Kanal. Klartext der Nachricht:

```
UNPRUUF_GRANTRENEW_V1:<adresse>,<token>;<adresse>,<token>;...
```

- Höchstens 3 Einträge. Adresse = v3-Onion **ohne** Präfix. Token = Grant wie in `FORMAT.md`.
- Der Client nimmt sie **nur von einem Kontakt an, der schon Gast-Grants hat**. Er verwirft jeden Eintrag, dessen Adresse keine v3-Onion ist, dessen Token nicht lesbar oder abgelaufen ist, und doppelte Adressen. Bleibt nichts übrig: ignorieren (der Kontakt behält, was er hat).
- Bleibt etwas übrig: **beide** Adresslisten (Absenden und Abholen) und die gespeicherten Tokens werden durch genau diese Einträge ersetzt (gleiche Reihenfolge). Dadurch folgt der Gast auch gewechselten Nodes. Der Hinweis „abgelehnt“ verschwindet.
- Lesen braucht keinen Grant, deshalb kommt eine Erneuerung auch an, wenn die alten Grants schon abgelaufen sind.
- Timing der Pro-Seite (nur falls iOS einmal Pro-Einladungen bekommt): Erneuerung ein Viertel der Laufzeit nach der letzten (7 Tage: alle 42 Stunden), mindestens 6 Stunden Abstand, neue Grant-IDs, Planer alle 30 Minuten. Pro-Nutzer können pro Gast „Erneuerung stoppen“ (weiches Sperren). Das braucht iOS **nicht**, solange es keine Pro-Einladungen gibt.
- Vektoren: Abschnitt `grantRenew` (8 Fälle). Android: `GuestRenewal.kt`, `GuestRenewalTest.kt`.

**Datenbank:** Gast-Grants sind Geheimnisse: Keychain `ThisDeviceOnly`, pro Einladendem ein Satz, nie in Backups, beim Löschen des Kontakts mitlöschen.

**Nicht gebaut (auch nicht auf Android):** harter Widerruf eines Grants auf dem Server, Gästeliste in der Pro-App, Control kennt Gäste nicht, der Android-Node prüft keine Gast-Tokens.

## 4. Node-Server-Vertrag: was die Clients wissen müssen (Vor-Audit M1 bis M3, L-Reihe)

- **Lese-Limit je Adresse (M1):** jede Adresse des Servers hat einen eigenen Eimer; unbekannte Host-Namen teilen sich einen. `429` mit `Retry-After`: Back-off einhalten, nicht schneller nachfragen.
- **`/fetchMany` (M2):** wiederholte Tags werden einmal gelesen. Eine Antwort enthält höchstens **256 Pakete**. Eine abgeschnittene Antwort enthält `"more":true`; der Client fragt ab dem Cursor weiter, **höchstens 8 Fortsetzungen** pro Abfrage. Eine Abfrage gilt nur als vollständig, wenn keine Antwort abgeschnitten war.
- **Cursor (M3):** wird nur aus den **angefragten** Tags berechnet, nicht aus dem Zähler des ganzen Servers. Der Client kombiniert Cursor so: vollständig = der größte, abgeschnitten = der kleinste der abgeschnittenen. Android: `NodeMeshClient.parseMore`, `P2PNetworkManager.pollNodeMeshOnce`.
- **Einheitliche 404 (L3):** unbekannter Pfad oder Methode gibt immer `{"error":"not found"}`; genaue Pfade (`/deposit/` oder `/DEPOSIT` sind 404). Keine Auswertung von Antwort-Köpfen nötig.
- **Antwort-Köpfe begrenzen (L5):** Antwortzeile höchstens 8 KB, höchstens 64 Kopfzeilen, sonst Antwort verwerfen.
- **Weiter wie in der Liste vom 21.10.:** `507` bei vollem Speicher, `400` bei ungültigem Base64, nur kanonisches Base64 senden.

## 5. Eingaben von außen härten

- **Nur v3-Onion-Adressen (M7, Android jetzt erledigt):** 56 Zeichen aus `a-z2-7` plus `.onion`, alles klein. Gilt für Pairing-Code (`n`), Knotenlisten, Besitzer-Strings, NODEMIGRATE, TEMPNODE, `GRANT_RENEW`. Zusätzlich vor **jeder** Verbindung erneut prüfen (verhindert, dass ein Besitzer-Geheimnis oder Grant über einen Tor-Ausgang an einen normalen Host geht). Android prüft nur die Form; eine Prüfsummenprüfung ist erlaubt und strenger, die Vektoren enthalten echte Adressen mit gültiger Prüfsumme und ungültige Fälle.
- **Chunks (L5):** Übertragungen mit mehr als 2048 Teilen ablehnen; beim Entpacken `size` und `offset` prüfen, bevor Speicher reserviert wird.
- **Knotenlisten (L6):** Parser linear (Menge statt wiederholter `contains`), mehr als 5000 Adressen ablehnen.
- **Temp Node (L11):** Verbindung hat 5 Sekunden, ihre Anfrage zu liefern; der Long-Poll wartet erst danach.
- **Zwischenablage (L4):** nach 60 s leeren, auch wenn sie nicht gelesen werden kann; nur belassen, wenn lesbar und anderer Inhalt.

## 6. Empfangsseite und Datenschutz auf dem Gerät

- **Fenster (M4, kompatibel, kein Formatbruch):** `NodeMeshWindow.kt`. Das volle Fenster von 26 Stunden-Epochen nur beim ersten Abruf nach App-Start, nach einem fehlgeschlagenen oder abgeschnittenen Abruf oder wenn die Uhr zurückgeht. Sonst von der Epoche vor dem letzten vollständigen Abruf bis jetzt (2 oder 3 Epochen im Dauerbetrieb). **Eine Anfrage je (Kontakt, Node-Adresse)** statt einer je Adresse, damit eine Anfrage nie Tags mehrerer Kontakte nennt; Anfragen über bis zu 1,5 s verteilt; Cursor je (Kontakt, Adresse).
- **Tor-Stromtrennung je Kontakt (Android Stufe 1 und 3):** SOCKS5 mit Benutzername/Passwort nach RFC 1929 (Passwort leer genug, der Name zählt): Benutzername = Schlüssel-Hash der Kontakt-ID unter einem Gerätegeheimnis (32 Hex-Zeichen), bleibt auf dem Gerät. Host wird als **Name** gesendet (nichts lokal auflösen). Schlägt fehl, wenn der Proxy die Anmeldung auslässt (geschlossen scheitern). Anfragen ohne Kontakt (Pool-Listen, Feeds) nutzen die gemeinsame Gruppe. **Eine Abfrageschleife je Kontakt** mit eigenem Zufallsstart und Jitter. Referenz: `Socks5.kt`, `TorIsolation.kt`, `Socks5Test.kt`. **Frage an dich:** erlaubt der iOS-Tor-Stack (Arti/C-Tor/Tor.framework) pro Verbindung einen SOCKS-Benutzernamen? Wenn nein: melden, nichts nachbauen.
- **Datenbankschlüssel (H1):** Android versiegelt ihn jetzt unter dem telefongebundenen Schlüssel. Auf iOS gilt: `ContactStore.fileKey` darf **keinen neuen Schlüssel still anlegen**, solange eine alte Datei existiert (sonst überschreibt das nächste Speichern die alte Datei); und die Panik-PIN-Länge (mindestens 4 Ziffern) gehört in die ViewModel-Schicht, nicht nur in die Ansicht.
- **Backups (M9):** alle App-Dateien aus iCloud/iTunes-Backups ausschließen; Keychain bleibt `ThisDeviceOnly`.
- **Panik-Löschung (M10):** löscht zusätzlich einen offenen Pairing-Code, leert die Sendewarteschlange und halb empfangene Chunks, danach `secure_delete` und Bereinigung der Datenbank.
- **PIN-Sperre (L10):** Pause auch auf der **monotonen Uhr** messen, nicht nur nach Datum (Datum vorstellen verkürzt sonst die Pause); ein Neustart zählt nur noch die Wanduhr.

## 7. Wire-Format und F1

- **Nichts am Paketformat ändern.** F1 (Nutzlastlänge im Klartext) ist offen; Gabriel hat „noch nicht“ gesagt. Entscheidungsblatt: `F1_DECISION_SHEET_2026-10-25.md`, Hintergrund `F1_ENTSCHEIDUNG.md`.
- M4 (Abschnitt 6) und alles in diesem Dokument ist **kompatibel**; alte und neue Apps verstehen sich weiter. Nur M6 und L12 würden brechen und hängen an F1.
- `GRANT_RENEW`, `i`, Prüfcode sind **zusätzlich** innerhalb des bestehenden Formats; sie brauchen keinen neuen Pakettyp auf dem Draht (Steuersignale im verschlüsselten Kanal wie NODEMIGRATE).
- Vor dem Audit wird F1 entschieden, weil das Audit das Endformat prüfen soll. Wenn die Rede auf Audit oder Wire-Format kommt: Gabriel an F1 erinnern.

## 8. Reihenfolge der Arbeit (Vorschlag, Gabriel entscheidet)

1. Zweig angleichen (`git fetch origin && git checkout ios && git merge origin/android`, nicht rebasen, nicht erzwingen).
2. Neuer öffentlicher Lizenzschlüssel + Lizenz-Testvektoren (Abschnitt 2). Klein, sofort.
3. Sicherheits-Angleichung aus Abschnitt 4 der Liste vom 21.10. (PIN-Sperre, Panik, Bildschirm, Zwischenablage, Tastatur, Backups) zusammen mit Abschnitt 5 und 6 oben (Onion-Prüfung, Chunk-Grenzen, H1-Entsprechung, monotone Sperrzeit).
4. Business-Grundpakete A0 bis C3 aus `IOS_BUSINESS_BUILD_SPEC.md`, mit den Nachträgen.
5. Empfangsseite M4 und Server-Vertrag (Abschnitt 4 und 6); Tor-Stromtrennung nur nach der Frage zum Tor-Stack.
6. Client-Edition (Abschnitt 3) als dritte Zielgruppe, erst wenn der Business-Client läuft.
7. Pro Groups (Paket D) und F1 nur auf Gabriels Ansage.

## 9. Dateien in diesem Paket (und im Repository)

| Pfad im ZIP | Bedeutung |
|---|---|
| `00_START_HIER_IOS_UEBERGABE.md` | dieses Dokument |
| `specs/IOS_BUSINESS_BUILD_SPEC.md` | Bauanleitung Business-Client, Pakete A0 bis D, Berichtsformat |
| `specs/IOS_GUEST_CLIENT_BUILD_SPEC.md` | Bauanleitung Client-App mit Gast-Grants |
| `specs/IOS_GLEICHSTAND_FUER_NORBERT_2026-10-21.md` | Liste vom 21.10. (Sicherheits-Angleichung, Nachträge) |
| `specs/GUEST_LOCKERS_BUILD_SPEC.md` | Entwurf Gast-Briefkästen, Kapitel 15 mit Stand |
| `specs/NODE_MESH_SPEC.md` | Node-Mesh-Spezifikation |
| `specs/SECURITY_CLAIMS.md` | was behauptet werden darf |
| `specs/F1_ENTSCHEIDUNG.md`, `F1_DECISION_SHEET_2026-10-25.md` | offene Entscheidung zum Paketformat |
| `specs/AUDIT_BRIEF_ANDROID_APP.md` | was das Audit prüft (iOS kommt später) |
| `specs/FORMAT_guest-grants.md`, `vectors/guest-grants-vectors.json` | Gast-Grant-Format und Testvektoren |
| `vectors/ios-vectors-2026-10-27.json` | neue Testvektoren (Prüfcode, GRANT_RENEW, Pairing mit `g` und `i`, Adressen, Lizenz mit Wegwerf-Schlüssel) |
| `reference-android/main/...` | Android-Quellen als Referenz (Namen und Pfade wie im Repository) |
| `reference-android/test/...` | zugehörige Tests, darunter `NorbertVectorsTest.kt`, das die neuen Vektoren gegen den Android-Code beweist |
| `CHANGELOG.md` | vollständiger Änderungsverlauf |

Lesereihenfolge für den Chat: dieses Dokument, `specs/IOS_BUSINESS_BUILD_SPEC.md`, `specs/IOS_GUEST_CLIENT_BUILD_SPEC.md`, `vectors/`, danach die Android-Quellen zu dem Paket, das gerade gebaut wird.

## 10. Aussagen und Regeln (gelten auch für Texte in der App)

- Nie „zertifiziert“, „unknackbar“, „DSGVO-konform“, „als Erste“, „einzigartig“, „sicherer als“. **Nicht auditiert**, Pilotphase; Press ist Pilot und nicht mit einer echten Quelle getestet.
- NexonAI betreibt keine Server. Alle Server betreibt der Kunde.
- Nachrichten, die nicht gesendet werden können (kein Tor, Node nicht erreichbar), warten nur im Speicher; wird die App beendet, sind sie weg.
- Lebensdauer genau: Nach Ablauf (höchstens 24 Stunden, Standard 6) ist ein Paket für niemanden mehr lesbar und wird binnen etwa einer Minute auch aus den Dateien überschrieben.
- Rumänien, anonyme Meldungen: Stand ungeklärt, nie behaupten, sie seien vorgeschrieben.
- Geheimnisse (private Schlüssel, Lizenzcodes echter Kunden, Passwörter, Apple-Zertifikate) nie in Git, nie in Dokumente, nie in einen Chat kopieren. Apple-Signierung ist getrennt von den Android-Schlüsseln (die hat nur Gabriel).
- Nach jedem Push auf `android` zieht Gabriels Seite `main` nach; auf `ios` arbeitest du, Zusammenführung aus `android` nie rebasen.

## 11. Zurückmelden

Format wie in der Spec (Abschnitt „Report format“): pro Paket Ergebnis, offene Punkte, Abweichungen von der Spec, Testnachweis. Ehrlich: grün, rot, übersprungen; nichts als „fertig“ bezeichnen, was nicht auf Simulator oder Gerät lief. Tor lief bisher nicht gegen das echte Netz; das nicht beschönigen. Echter Gerätetest Android Pro ↔ iPhone: Pairing per QR, Senden in beide Richtungen, Panik-PIN, Sperre nach Fehlversuchen, Gast-Einladung (Client auf iPhone, Pro auf Android), Erneuerung über eine abgelaufene Grant-Zeit hinweg.

## 12. Offene Fragen an Gabriel (nicht selbst entscheiden)

1. Wann genau soll die Client-Edition auf iOS starten (vor oder nach dem Business-Client)?
2. Tor-Stack auf iOS: Welcher ist vorgesehen, und erlaubt er SOCKS-Benutzernamen pro Verbindung?
3. Verteilung (App Store, TestFlight, Lizenzcode-Eingabe in der App vs. App-Store-Regeln): offene Punkte 9.1 bis 9.7 der Spec.
4. F1 vor dem Audit.
5. Wer baut das iOS-Beweisskript für `evidence/` (Vorschlag: gemeinsam, sobald Abschnitt 4 der Liste vom 21.10. steht).
