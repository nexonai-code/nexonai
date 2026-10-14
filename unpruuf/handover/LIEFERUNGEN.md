# Lieferungen und Artefakte — Stand 14. Oktober 2026

Die ZIP-Dateien hat Gabriel im Chat bekommen. Sie liegen nicht im Repo (zu groß). Was daraus neu gebaut werden kann, steht in `quellen/`.

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
