# iOS auf Android-Niveau bringen: Aufgabenliste für Norbert

Stand: 21.10.2026. Intern und vertraulich (enthält Protokolldetails, Patentprüfung läuft; nicht weitergeben). Grundlage: Branch `android` ab Commit `0ae69ee` gegen `origin/ios` (Stand 24.9.). Die Bauanleitung `ios/IOS_BUSINESS_BUILD_SPEC.md` (geschrieben nach Android-Stand 13.10., Commit 449ee02) bleibt die Hauptreferenz. Dieses Dokument ergänzt sie um alles, was seitdem auf Android dazugekommen ist, und um die Lücken, die wir beim Lesen des iOS-Codes gefunden haben. Alles ist ein Vorschlag, das Team entscheidet gemeinsam.

## 1. Reihenfolge in Kurzform

1. Zweig angleichen (Abschnitt 2), damit du gegen den aktuellen Stand arbeitest.
2. Sicherheits-Angleichung bestehender iOS-Teile (Abschnitt 4). Klein, unabhängig, sofort machbar.
3. Spec-Arbeitspakete A0 bis C3 aus `IOS_BUSINESS_BUILD_SPEC.md` (Abschnitt 3), mit den Nachträgen aus Abschnitt 5.
4. Pro Groups (Paket D) erst nach Teamentscheidung 9.4.
5. F1 erst nach Teamentscheid (Abschnitt 6). Bis dahin am Wire-Format nichts ändern.
6. Audit-Tauglichkeit und Verteilung (Abschnitte 7 und 8).

## 2. Zweig angleichen

- `origin/ios` hat 12 Commits, die in `android` fehlen (Podfile mit iOS-17-Ziel, `Info.plist` nach `UnpruufApp/UnpruufApp/Info.plist` verschoben, `pod-install-xcode27-workaround.sh`, `ios/.gitignore`, `server/mac/lib/ensure-node.sh`, Änderungen an `start-mac.command`, CHANGELOG-Einträge). `android` ist 72 Commits weiter.
- Probelauf der Zusammenführung (`git merge-tree`): einziger Konflikt ist `unpruuf/CHANGELOG.md`; die README führt sich selbst zusammen.
- Vorschlag: `git fetch origin && git checkout ios && git merge origin/android`, im CHANGELOG beide Einträge behalten (nach Datum sortieren), danach Pods neu installieren und bauen. Nicht rebasen, nicht erzwingen.
- Danach: prüfen, dass `main` und `android` auf demselben Stand sind (Regel: nach jedem Push auf `android` auch `git push origin android:main`, nur Vorspulen).

## 3. Arbeitspakete aus der Spec (unverändert gültig)

A0 bis A4 (Grundgerüst, Lizenz, Nodes, Pairing, Senden/Empfangen), B1 bis B6 (Cover-Verkehr, Sealed Unlock, Lebensdauer 1/6/24 h, Temp Node, Knotenlisten, Feed, Bridges), C1 bis C3 (Oberfläche, Texte, Tests), D (Pro Groups, nur nach Entscheidung 9.4). Einzelheiten, Konstanten, Formate und Testvektoren stehen in der Spec, Abschnitte 4.1 bis 4.18 und 5 bis 8. Die Testvektoren (zum Beispiel pairRouting `fdeab9ac…1108`, Epoche 0 → `qniWxa+fOYCYmgFWACBsQ/5QcuOZCh7UmHD07Bws6D4=`) müssen bit-genau stimmen, bevor irgendetwas mit Android gepaart wird.

## 4. Sicherheits-Angleichung der bestehenden iOS-Teile

Beim Lesen des iOS-Codes gefunden. Jede Zeile: Befund, Android-Stand, was auf iOS zu tun ist.

1. **PIN ohne Sperre bei Fehlversuchen.** `Services/PinManager.swift`: PBKDF2-HMAC-SHA256 mit 120 000 Runden, Hashes und Salz im Keychain, `check` liefert normal, panic oder wrong, aber kein Zähler. Android sperrt ab dem 5. Fehlversuch 30 Sekunden, verdoppelt danach, höchstens 1 Stunde. Auf iOS: Zähler und Sperrzeit im Keychain (`ThisDeviceOnly`), Sperre übersteht App-Neustart, Anzeige der Restzeit. Texte siehe Abschnitt 5.
2. **Panik-PIN löscht zu wenig.** `AppEnvironment.wipeContactsAndMessages()` löscht nur Nachrichten, Kontakte und Compliance-Dienst; `wipeAll()` ist ungenutzt. Android löscht bei Panik: Kontakte, Ratchet-Sitzungen, Onion-Schlüssel, Gruppen, eigene Nodes samt Besitzer-Geheimnissen, Knotenlisten, Feed-Quellen, Relay-Einrichtung, Organisations-QR, Relay-Pool-Manifest, Bridges. Bleiben dürfen nur Identitätsschlüssel, Lizenz und die PINs. Auf iOS dasselbe Löschset definieren, in einer Funktion bündeln, per Test belegen (Keychain-Einträge und Dateien nach der Panik leer).
3. **Gespeicherte Geheimnisse unter dem Gerätschlüssel.** Android verschlüsselt Besitzer-Geheimnisse und ähnliche Werte zusätzlich unter dem telefongebundenen Schlüssel (SealedStrings). iOS: `KeychainStore` nutzt `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`; das ist ein guter Anfang. Prüfen, dass kein Geheimnis in `UserDefaults`, Dateien oder Logs liegt; Besitzer-Geheimnisse der eigenen Nodes im Keychain statt in Dateien ablegen. Kontaktdatei `contacts.enc` (AES-GCM, Schlüssel im Keychain) bleibt.
4. **Bilder nicht blind decodieren.** `Views/ChatView.swift:180` ruft `UIImage(data: message.content)` ohne Prüfung. Android liest zuerst nur die Größe und lehnt Bilder über 50 Millionen Pixel oder über 20 000 Pixel Kantenlänge ab, verkleinert auf höchstens 2048. Auf iOS mit `CGImageSource` erst die Eigenschaften lesen, dann mit `kCGImageSourceCreateThumbnailFromImageAlways` und Maximalgröße 2048 decodieren.
5. **Zwischenablage.** `UIPasteboard.general.string =` in `Compliance/CaseDetailView.swift:86` und `Views/SettingsView.swift:294`. Android markiert Kopien als sensibel und leert sie nach 60 Sekunden, wenn noch unverändert. Auf iOS `UIPasteboard.general.setItems(_, options: [.localOnly: true, .expirationDate: jetzt + 60 s])`, kein Universal Clipboard.
6. **Tastatur lernt mit.** `.autocorrectionDisabled()` steht nur in `CasesHomeView`, `SettingsView`, `RelayListRows`. Für das Nachrichtenfeld und alle Eingaben von Codes, PINs und Adressen: `autocorrectionDisabled`, `textInputAutocapitalization(.never)`, `keyboardType(.asciiCapable)` wo sinnvoll, `textContentType(.oneTimeCode)` nur wenn nötig. Zusätzlich im AppDelegate `application(_:shouldAllowExtensionPointIdentifier:)` mit `false` für `.keyboard`, damit Drittanbieter-Tastaturen draußen bleiben (Vorschlag, Team entscheidet; Nachteil: Nutzer, die eine eigene Tastatur brauchen).
7. **Bildschirmaufnahme und App-Umschalter.** Nichts davon im Code gefunden (kein `isCaptured`, keine Schutzschicht). Android setzt FLAG_SECURE überall, auch in Dialogen. Auf iOS: bei `UIScreen.isCaptured` (und `UIScreen.capturedDidChangeNotification`) Inhalt durch eine Sperrfläche ersetzen; beim Wechsel in `willResignActive` eine undurchsichtige Fläche über das Fenster legen, damit der Snapshot im App-Umschalter leer ist; Screenshots lassen sich auf iOS nicht verhindern, nur erkennen (`userDidTakeScreenshotNotification`): Hinweis anzeigen, nichts versprechen.
8. **Info.plist.** Nur Kamera und Face-ID-Texte, Version 1.01. Ergänzen: Datenschutztexte nur für das, was wirklich genutzt wird; `ITSAppUsesNonExemptEncryption` passend setzen (Abschnitt 8); `UIFileSharingEnabled` und `LSSupportsOpeningDocumentsInPlace` aus lassen.
9. **Backups.** iCloud/iTunes-Backups schließen: alle Dateien mit `isExcludedFromBackup = true`, Keychain bleibt `ThisDeviceOnly`.

## 5. Nachträge zur Spec (Android-Änderungen seit 13.10.)

Diese Verhaltensweisen sind auf Android Stand der Technik und gehören auf iOS, damit beide sich gleich verhalten.

**Node-Server-Vertrag (Clients müssen damit umgehen können):**
- Ablage mit `507` (Speicher voll, Gesamtgrenze) antwortet der Server, wenn der Speicher voll ist. Der Client behandelt das wie „Node nicht erreichbar für Ablage“: Nachricht bleibt im Speicher, nächster Node, nach Wartezeit erneut. Kein Dauerfeuer.
- Strenge Base64-Prüfung beim Ablegen: Antwort `400` bei ungültigem Base64. Der Client sendet nur kanonisches Base64 (Standardalphabet, mit Auffüllung).
- Lese-Limit je Adresse mit `429` und Retry-After: Der Client hält Back-off ein (mindestens die angegebene Zeit, danach wieder der normale Takt) und fragt nicht schneller nach.

**Eingaben von außen härten (Befunde AND-2, AND-3, AND-5 des Sicherheitstests):**
- AND-2: Node-Adressen aus Pairing-Feld `n`, NODEMIGRATE, TEMPNODE und Knotenlisten nur akzeptieren, wenn sie gültige v3-Onion-Adressen sind (56 Zeichen Base32 plus `.onion`, geprüfte Prüfsumme und Versionsbyte). Sonst verwerfen. Hintergrund: Eine Nicht-Onion-Adresse würde über einen Tor-Exit im Klartext gehen.
- AND-3: `totalChunks` einer Nachricht begrenzen (Obergrenze festlegen, Android-Wert aus `RatchetFrame.kt` übernehmen), höchstens ein offener Zusammensetzungs-Slot je Absender, Rest verwerfen. Sonst kann ein Giftpaket eine Absturz-Schleife auslösen und bleibt bis zu 24 Stunden auf dem Node.
- AND-5: Kein Rückfall auf den Standard-SOCKS-Port 9050. Läuft kein eigenes Tor, wird nichts gesendet (geschlossen scheitern). Eine Anfrage mit Besitzer-Geheimnis darf nie an einen fremden lokalen Prozess gehen.
- AND-4: Panik löscht auch das Relay-Pool-Manifest und die Bridges (siehe Abschnitt 4, Punkt 2).

**Texte (EN und RO, falls iOS dieselben Schlüssel nutzt):** `lock_err_locked`, `lock_err_locked_min`, `lock_err_store_lost`. Die Wortlaute stehen in `app/src/main/res/values/strings.xml` und `values-ro/strings.xml`. „Store lost“ erscheint, wenn die gesicherten PIN-Daten nicht mehr lesbar sind; dann bleibt nur Zurücksetzen. Keine Zusagen im Text, die der Code nicht trägt.

**Aussagen:** Nie „zertifiziert“, „unknackbar“, „DSGVO-konform“, „als Erste“, „einzigartig“. Nicht auditiert. Nachrichten, die nicht gesendet werden können, warten nur im Speicher; wird die App beendet, sind sie weg (so sagen). Lebensdauer: nach Ablauf (höchstens 24 Stunden, Standard 6) ist ein Paket für niemanden mehr lesbar und wird binnen etwa einer Minute auch aus den Dateien überschrieben.

**Lizenz:** App-Lizenzen sind an das Gerät gebunden (erste Aktivierung bindet den Code); Server-Codes nicht. Die App hält höchstens 1000 eigene Nodes. Kontakt-Pool: je Kontakt 3 Nodes aus der gewählten Liste. Lizenzformat `unpruuf-license:v1` unverändert, Ed25519-Pubkey `67A_r4YeFkvYoXDF30gar2gRBcufokgvYQd5dVeEwKE`.

**Control (Kunden-Admin-PC):** Node-Listen kommen als ZIP aus „unpruuf Control“; iOS importiert Datei für Datei (`unpruuf-node-list:v1`). Der Lizenz-Vorrat wird in Control verwaltet, kein neues Lizenzformat, iOS bleibt unberührt.

## 6. F1: Länge im gespeicherten Paket (offene Teamentscheidung)

Heute steht die Nutzlastlänge im Klartext im gespeicherten Paket (`[size:4][offset:4]`); der Betreiber sieht Länge und kann Füllverkehr erkennen. Empfehlung: Auffüllen vor die äußere Verschlüsselung ziehen (Wire-Format v2, ein Umstieg für alle Clients, Server unverändert). **Das Team hat noch nicht zugestimmt: am Format nichts ändern.** Betroffene iOS-Dateien im Fall der Zustimmung: `NetworkObfuscation.swift`, `OuterEnvelope.swift`, `RatchetFrame.swift`, `ComplianceService.swift`, `RelayService.swift` samt Tests. Plan und Alternativen: `unpruuf/handover/F1_ENTSCHEIDUNG.md`. Was du schon jetzt tun kannst: Padding und Umschlag in genau einer Stelle kapseln, damit die Umstellung später klein bleibt. Testvektoren für v2 liefern wir nach der Entscheidung.

## 7. Audit-Tauglichkeit

- Die erste Audit-Runde deckt Node-Server und Android-App ab (Briefs in `unpruuf/evidence/AUDIT_BRIEF_NODE_SERVER.md` und `AUDIT_BRIEF_ANDROID_APP.md`). iOS ist nicht dabei. Es soll später prüfbar sein.
- Vorschlag: ein Nachweisskript für iOS in `unpruuf/evidence/` (Testvektoren, Keychain-Klassen, keine Klartext-Geheimnisse im Dateisystem, Panik-Löschset, keine Netzwerkziele außer Tor). Wir schreiben es mit dir, sobald Abschnitt 4 steht.
- Die iOS-Compliance-Ausgabe spricht mit der Officer-App; dort ist ein Befund offen (OFF-1, Dashboard lauscht auf allen Netzwerkkarten) und wird auf der Officer-Seite behoben. Kein iOS-Aufwand, aber nicht vor der Behebung an echte Fälle gehen.

## 8. Signierung und Verteilung (Entscheidungen 9.1 bis 9.7 der Spec, weiter offen)

- Apple-Signierung und TestFlight sind getrennt von den Android-Schlüsseln. Die Android-Schlüssel (Test- und Release-Schlüssel) haben nur Gabriel; nie in Git, nie per Mail.
- Offene Entscheidungen, wie in der Spec nummeriert: 9.1 drittes Ziel „UnpruufBusiness“, 9.2 Verteilung (Lizenzcode-Eingabe in der App kann gegen App-Store-Regeln verstoßen), 9.3 Empfang nur bei geöffneter App (kein APNs, kein Hintergrundempfang), 9.4 Pro Groups, 9.5 Lizenzbindung an das Gerät, 9.6 Bridges und Snowflake, 9.7 F1. Für 9.2 bis 9.3 brauchen wir deine Einschätzung zum App-Store-Weg (Ad-hoc, TestFlight, Enterprise, B2B-Apple-Business-Manager).
- Exportkonformität: Die App nutzt Verschlüsselung (angeben).

## 9. Prüfen und zurückmelden

- Nach jedem Paket: Tests laufen lassen, Ergebnis ehrlich melden (grün, rot, übersprungen), nichts als „fertig“ bezeichnen, was nicht auf Gerät oder Simulator gelaufen ist.
- Echter Gerätetest (Android Pro ↔ iPhone): Pairing per QR, Senden in beide Richtungen, Panik-PIN, Sperre nach Fehlversuchen, Tastatur, Screen-Capture, Bild-Wächter. Tor lief bisher nicht gegen das echte Netz; auch nicht beschönigen.
- Rückmeldeformat wie in der Spec, Abschnitt „Report format“: pro Paket Ergebnis, offene Punkte, Abweichungen von der Spec, Testnachweis.

## 10. Ergänzende Verbesserungsvorschläge (Vorschlag, Team entscheidet)

1. Ein einziges Löschset als gemeinsame Liste für Android und iOS (Datei in der Spec), damit die Panik-PIN nicht auseinanderläuft.
2. Gemeinsame Testvektor-Datei im Repo, gegen die beide Clients in CI laufen.
3. Vor dem iOS-Audit F1 klären, damit das Audit das Endformat prüft.
