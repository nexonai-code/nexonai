# Lieferungen und Artefakte — Stand 22. Oktober 2026

**Umbenennung 22.10.2026:** „safeline“ heißt jetzt „unpruuf Compliance“, „safeline Press“ heißt „unpruuf Press“. Ältere Einträge unten nennen noch die alten Namen und Dateinamen (`safeline_EN/RO`), weil sie so ausgeliefert wurden.

Die ZIP-Dateien hat Gabriel im Chat bekommen. Sie liegen nicht im Repo (zu groß). Was daraus neu gebaut werden kann, steht in `quellen/`.

## Neu gebaut am 22.10. mit den neuen Namen (im Chat an Gabriel geschickt)

| Datei | Ersetzt | Hinweis |
|---|---|---|
| `unpruuf_Loesungsbeschreibungen_2026-10-22_v4.zip` | `…2026-10-13_v3.zip` | 18 Dateien DE/EN/RO, Dashboard-Aussage korrigiert |
| `unpruuf_Control_2026-10-22_v2.zip` | `…2026-10-13_v1.zip` | Server-Paket unsigniert |
| `unpruuf_OfficerApp_2026-10-22_v2.zip` | `…2026-10-09_v1.zip` | beide Editionen, Dashboard abgesichert |
| `unpruuf_Beleg-Paket_2026-10-22_v2.zip` | `…2026-10-14_v1.zip` | Auditor-Umfang aktualisiert |
| `unpruuf_TeamBriefing_2026-10-22_v2.zip` | Team-Briefing EN/RO vom 11.10. | Text ersetzt |
| `unpruuf_UAB-Pitch-Kurz_2026-10-22_v12.zip` | `…2026-10-14_v11.zip` | nur PPTX, kein PDF |
| `unpruuf_Compliance_Kundendeck_2026-10-22_v1.zip` | `safeline`-Deck EN/RO | |
| `unpruuf_iOS_Norbert_2026-10-27_v1.zip` | die iOS-Liste vom 21.10. | iOS-Übergabe für Norbert und seinen Claude Code Chat: `00_START_HIER_IOS_UEBERGABE.md`, Bauanleitungen, Testvektoren (neu: Prüfcode, GRANT_RENEW, Pairing mit `g` und `i`, Adressen, Lizenz mit Wegwerf-Schlüssel), Android-Referenzquellen und -tests, CHANGELOG. Nur der öffentliche Lizenzschlüssel `t7ZQMSMx…`, kein privater. Dieselben Dateien im Repo: `unpruuf/ios/IOS_UEBERGABE_FUER_NORBERT_2026-10-27.md`, `unpruuf/ios/vectors/`. |
| `unpruuf_2026-10-27_v34.zip` (Projekt + alle sieben APKs), `unpruuf-Setup-2026.10.27.exe` (neu gebaut mit neuem Schlüssel, SHA-256 `F8EE7933…B07F`) | v33 und der Installer vom Morgen | **Neuer Lizenzschlüssel** (öffentlicher Schlüssel `t7ZQMSMx…VC4`): alle Lizenzen des alten Schlüssels sind ungültig. Dazu `Testlizenzen_2026-10-27.txt` (Server 5 Nodes, je 2 Standard/Pro/Group) und `private-key.json` einmalig an Gabriel, hier gelöscht. APKs: neuer Debug-Schlüssel wie v32/v33. |
| `unpruuf-Setup-2026.10.27.exe` (erste Fassung, alter Schlüssel, überholt), `unpruuf-Windows-portable-2026.10.27.zip`, `SHA256.txt` | `unpruuf_Windows_2026-10-26_v1.zip` | **Windows-Installer** mit eingebautem Node.js (gebaut auf einem Windows-Runner, Workflow `.github/workflows/windows-installer.yml`, Quelle `unpruuf/windows-installer/`): Node-Server, Compliance, Press, Control, Lizenz-Tool, Web-Reporter, Relay. Installer 35 MB, ZIP 56 MB. Nicht digital signiert. Stille Installation, Start-Proben und Deinstallation auf dem Runner bestanden. Setup SHA-256 `1937DC0E…D409`, ZIP `FC52E6E6…496C`. |
| `unpruuf_Windows_2026-10-26_v1.zip` | `unpruuf_Control_2026-10-22_v2.zip`, `unpruuf_OfficerApp_2026-10-22_v2.zip` | Alles, was auf Windows läuft, in einem Paket: Node-Server, Officer-App (Compliance + Press), Control mit Server-Bundle (unsigniert), Lizenz-Tool mit GUI, Web-Reporter, Relay, Relaypool-Tool. Mit Audit-Runde R1. Tests auf Linux grün, nicht auf Windows gelaufen. Ohne Schlüssel und ohne `.exe` (auf Windows bauen). |
| `unpruuf_2026-10-26_v33.zip` (Projekt + alle sieben APKs) | v32 | GRANT_RENEW (automatische Verlängerung von Gast-Grants, Room v16). Gleicher neuer Debug-Schlüssel wie v32 (`431e9992…`): v32 lässt sich überinstallieren, ältere Installationen mit dem alten Testschlüssel nicht. |
| `unpruuf_2026-10-25_v32.zip` (Projekt + alle sieben APKs im selben ZIP) | v31 und die APKs vom 22.10. | Client-Import, Audit-Runde R1 (13 von 17), Prüfcode für eingefügte Gast-Codes, nur Onion-Adressen. **APKs mit neuem Debug-Schlüssel** (Container-Reset, Testschlüssel nicht mehr in der Umgebung): nicht über bestehende Installationen installierbar. |
| `unpruuf_2026-10-22_v31.zip` und sieben APKs | v30 und APKs vom 21.10. | mit Temp-Node-Fix |

Nicht neu gebaut (Quellen fehlen): Business-Pitch und Press-Pitch (13.10.), Compliance-Video, Press-Ein-Seiter, alle Online-Artefakte und Dokumente aus früheren Sitzungen.

## Seit 21.10. (im Chat an Gabriel geschickt, nicht im Repo)

| Datei | Inhalt | Stand |
|---|---|---|
| `unpruuf_2026-10-21_v30.zip` | Gesamtes Projekt (Branch `android`, Stand `3c111f1`), ohne Schlüsseldateien | 21.10. |
| `unpruuf-<pro,press,standard,client,group,whistleblower,node>-debug-arm64.apk` (sieben Dateien) | Debug-APKs, Testschlüssel, nicht `testOnly`, Stand `3c111f1` (vor dem Temp-Node-Fix `83bbb5a`) | 21.10. |
| `unpruuf_Folie_KeineNummer_2026-10-22_v1.zip` | Folie „Nie wieder die Telefonnummer herausgeben“, EN + RO, PDF, PPTX, PNG | 22.10. |
| `unpruuf_Business_2026-10-22_v2.zip` | Business-Deck RO + DE mit neuer Folie 7 | 22.10. |
| `unpruuf_Business_2026-10-22_v3.zip` | Business-Deck EN + RO | 22.10. |
| `unpruuf_Decks_2026-10-22_v4.zip` | Business EN + RO, Compliance RO + DE, Testzahlen korrigiert | 22.10. |
| `unpruuf_Website_2026-10-22_v12.zip` | Website mit NexonAI-Logo, Blau, neuem Abschnitt (liegt auch in `unpruuf/website/`) | 22.10. |

Artefakt: Tagesabschluss 22.10.: https://claude.ai/artifact/JZh8xsHJ7wyLEMsMowipZD

Von Gabriel hochgeladen (nicht von mir erzeugt): `unpruuf_PressOberflaeche_2026-10-21_v1.zip` (Tippseiten-Baukasten v2, ältere Officer-App), `web.zip` (Website, Stand v8), Übergabe der Press-Sitzung vom 21.10.

## Seit 16.10. (im Chat an Gabriel geschickt, nicht im Repo)

| Datei | Inhalt | Stand |
|---|---|---|
| `unpruuf_2026-10-16_v29.zip` | Gesamtes Projekt (Hauptlinie, Branch `android`, Stand b48cf18) | 16.10. |
| `unpruuf-<variante>-arm64_2026-10-19_v3.apk` (sechs Dateien) | Debug-APKs mit Testschlüssel, mit den Sicherheits-Fixes, **ohne** verschlüsselte Besitzer-Geheimnisse. Die Dateien ohne `_v2`/`_v3` (16.10.) und die ersten vom 19.10. tragen `testOnly` und lassen sich nicht installieren. | 19.10. |
| `unpruuf-node-android-arm64_2026-10-19_v2.apk` | Android-Node, Debug | 19.10. |
| `unpruuf-pro-RELEASE-arm64_2026-10-19.apk` | Pro als Release (R8, Release-Schlüssel). Die anderen Release-Varianten wurden gebaut, aber nicht geschickt. | 19.10. |
| `unpruuf_Testschluessel_2026-10-19.zip` | Testschlüssel + Anleitung | 19.10. |
| `unpruuf_Release-Schluessel_2026-10-19.zip` | Release-Schlüssel, `passwort-aendern.bat`, Anleitung. **Vertraulich.** | 19.10. |
| `unpruuf_AuditBriefs_2026-10-19_v1.zip` | Audit-Briefs Server und App, Englisch, .docx und .md | 19.10. |

Neues Artefakt: Audit briefs: node server and Android app (Doc, zwei Tabs, privat): https://claude.ai/artifact/TYwYRrCDA4d1YZFDNpD8q6

## Aktuelle ZIPs (jeweils neueste Version)

| Datei | Inhalt | Stand |
|---|---|---|
| `unpruuf_ProGroupsEdition_2026-10-13_v4.zip` | Gesamtes Android-Projekt (Android Studio) mit Pro Groups, Rumänisch, Temp Node auf dem Telefon | 13.10. |
| `unpruuf_Control_2026-10-13_v1.zip` | unpruuf Control (Kunden-Konsole) | 13.10. |
| `unpruuf_Beleg-Paket_2026-10-14_v1.zip` | Prüfskripte, Tabelle Aussage → Beweis, Prüfauftrag, Patch | 14.10. |
| `unpruuf_Landing_2026-10-14_v4.zip` | Landing Page als Webseite, RO/EN, mit GDPR-Seiten | 14.10. |
| `unpruuf_PlainWords_2026-10-14_v2.zip` | „unpruuf in plain words“ als Webseite, hell, RO/EN (Postamt-Bild) | 14.10. |
| `unpruuf_Courier_2026-10-14_v1.zip` | „Your own courier service“ als Webseite, hell, RO/EN (Kurier-Bild) | 14.10. |
| `unpruuf_UAB-Pitch-Kurz_2026-10-14_v11.zip` | Event-Präsentation EN + RO (PPTX + PDF) | 13.10. |
| `unpruuf_Business-Pitch_2026-10-13_v2.zip` | Business-Pitch, EN + RO, Sprechtexte | 13.10. |
| `unpruuf_SafelinePress-Pitch_2026-10-13_v2.zip` | Press-Pitch, EN + RO, Sprechtexte | 13.10. |
| `unpruuf_Loesungsbeschreibungen_2026-10-13_v3.zip` | Sechs Lösungsbeschreibungen | 13.10. |
| `unpruuf_Wettbewerbsvergleich_2026-10-12_v1.zip` | Wettbewerbsvergleich | 12.10. |
| `unpruuf_TorClientEdition_2026-10-11_v5.zip` | Tor Client Edition (Sonderversion, nur lokal) | 11.10. |
| `unpruuf_Officer-App_2026-10-09_v1.zip` | Officer-App (Meldestelle) | 9.10. |

Bis 11.10.: `unpruuf_2026-10-11_v28.zip` ist die letzte Hauptlieferung vor Pro Groups.

## Artefakte (alle privat, Link nur für Gabriel)

| Name | Link | Stand |
|---|---|---|
| Your own courier service (RO/EN, hell, Kurier-Bild) | https://claude.ai/artifact/Y9BqJfVbTDwcoefosisYSG | 14.10. |
| unpruuf in plain words (RO/EN, hell, Postamt-Bild) | https://claude.ai/artifact/Lo8tByz9KQzoAE2kyTtXLq | 14.10. |
| unpruuf Feature Table (EN) | https://claude.ai/artifact/7WZiifds6Z7oULfTvwCcNg | 14.10. |
| unpruuf Tabel de funcții (RO) | https://claude.ai/artifact/EwU5ecHEFMvU5GabkAk9Th | 14.10. |
| unpruuf Landing Page RO/EN (Design-Canvas, Quelle der Landing-Seite) | https://claude.ai/artifact/41wh67aKcpBbmeP4c3bptZ | 12.10. |
| unpruuf Build Log (EN, alles vom 13.10.) | https://claude.ai/artifact/GPQ5aLabLfREkw48EDC6sR | 13.10. |
| unpruuf and safeline: team briefing | https://claude.ai/artifact/RGVAGfmPnrpv1oHZgiarBD | 11.10. |
| How unpruuf works | https://claude.ai/artifact/PvcJFcok35LwxpkgH7EVSp | 8.10. |
| unpruuf Business Whitepaper (EN) | https://claude.ai/artifact/UPyZaVfBh83ENBubYo96jK | 8.10. **auf F1 prüfen** |
| unpruuf Business Whitepaper | https://claude.ai/artifact/CBwGPexHC3ZT4CdTGrBRTz | 8.10. **auf F1 prüfen** |
| unpruuf Business Blueprint | https://claude.ai/artifact/LaYMg4br29Ju5ubRXmmyRZ | 8.10. **auf F1 prüfen** |
| unpruuf Editions and White-Label | https://claude.ai/artifact/Su9CAsXCX31844ThAPBjcM | 8.10. |
| unpruuf Briefkästen | https://claude.ai/artifact/FxTrshGUFH62PZuWY9Mqd7 | 9.10. |
| Cum funcționează unpruuf | https://claude.ai/artifact/CoGYdu2MjRyrArrYvJxvnM | 8.10. |
| Canal sigur de raportare | https://claude.ai/artifact/PSQwPEnWKRr8YKU5gg5d5o | 13.10. |
| unpruuf pentru avertizori | https://claude.ai/artifact/6SnToeh8bAZ484e94HK44R | 1.10. |
| Funktionsumfang unpruuf (DE, ersetzt durch die Feature Table) | https://claude.ai/artifact/BFwXVzUuGcZjRX2FuoC7Ke | 8.10. |
| Änderungen 6. / 8. Oktober (DE) | https://claude.ai/artifact/9rbG9uRztcJFYcRAwCoDK8 / https://claude.ai/artifact/NANMmNoNeYnjaoCWaTJQG8 | 8.10. |
| TrustLine (Architektur-Papier für Norbert u. a.) | https://claude.ai/artifact/DcquR1aSABxUGgMeBiVoFH | 5.10. |

Weitere Artefakte (über 40) stehen in Gabriels Artefakt-Liste in claude.ai. Die mit **auf F1 prüfen** behaupten möglicherweise noch, dass die Nachrichtenlänge verborgen sei.

## Quellen im Repo (`handover/quellen`)

| Ordner | Was |
|---|---|
| `uab-event-deck/v11`, `v8` | Skripte der Event-Präsentation (Inhalte, Baukasten `kit.py`, Folien-Export), `ausgabe_v11/` die fertigen EN/RO-Dateien |
| `loesungsbeschreibungen` | Generator der sechs Dokumente (`build.py`, `content1-4.py`) |
| `artefakte` | Generator der Feature-Tabelle EN und RO |
| `seite-in-klaren-worten` | Generator von „plain words“ (`build.py artifact` oder `build.py site`), fertige helle Seite |
| `landing-pages` | `landing-v4` (statische Seiten), Skripte der älteren Story-Seite |
| `basistexte-und-logo` | `unpruuf_Story_*.docx` (Basistexte, Briefkastenbild) und NexonAI-Logo (hell/dunkel) |
| `../presentations` | Skripte der Business-, Compliance- und safeline-Decks (schon im Repo) |
