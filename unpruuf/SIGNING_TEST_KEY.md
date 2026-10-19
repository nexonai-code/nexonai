# Fester Testschlüssel (Debug-Builds)

**Zweck:** Alle Debug-APKs, die mit diesem Schlüssel gebaut werden, lassen sich auf dem Telefon gegenseitig aktualisieren, egal ob sie in Android Studio auf dem PC oder in der Cloud gebaut wurden. Ohne festen Schlüssel meldet Android „App nicht installiert“, sobald zwei Builds verschiedene Debug-Schlüssel haben.

**Nur für Tests.** Nie für Kunden, nie für den Play Store. Ein Kunden-Release braucht einen eigenen, getrennt aufbewahrten Release-Schlüssel (noch nicht angelegt).

## So wird er benutzt

1. Zwei Dateien in den Ordner `unpruuf/` legen (dorthin, wo `settings.gradle.kts` liegt):
   - `unpruuf-test.jks` (der Schlüssel)
   - `keystore.properties` (Pfad und Passwort)
2. In Android Studio: File → Sync Project with Gradle Files, danach wie gewohnt bauen.
3. Fehlen die Dateien, baut Gradle ganz normal mit dem Android-Studio-Debug-Schlüssel. Nichts bricht.

Beide Dateien stehen in `.gitignore` und gehören nie ins Repository. Die Konfiguration steht in `app/build.gradle.kts` und `relay-android/app/build.gradle.kts` (`signingConfigs`, nur für den Build-Typ `debug`).

## Kennzahlen

- Alias: `nexonai-test`, RSA 3072, gültig bis 2051
- SHA-256-Fingerabdruck: `77:D3:B8:93:77:E8:DB:BD:CC:97:41:4D:D7:29:44:6B:FE:E0:95:B6:73:3C:D2:D9:E4:6E:B2:11:A0:AC:D7:D3`

Prüfen, womit eine APK signiert ist: `apksigner verify --print-certs datei.apk` (Android SDK, build-tools).

## Einmalig nötig

Wer vorher eine unpruuf mit anderem Schlüssel auf dem Telefon hat, deinstalliert sie einmal. Danach laufen alle Updates mit diesem Schlüssel durch.
