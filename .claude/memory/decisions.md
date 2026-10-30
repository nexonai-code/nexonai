---
name: Entscheidungen
type: project
---
Neueste oben. Details in `CLAUDE.md` und `unpruuf/handover/`.
- 2026-10-30: **iOS 9.1 entschieden: Business ist eine eigene App** (drittes Ziel UnpruufBusiness, Bundle-ID `com.nexonai.unpruuf.business`, Name "unpruuf Business", Consumer-App bleibt unangetastet). Mail an Norbert gesendet. Android-Name "unpruuf Pro" wird später auf Business nachgezogen (nur Textwert). 9.2 bis 9.7 offen.
- 2026-10-28: **Absturz-Ursache gefunden: Tor 0.4.8.16 zu alt.** Das Tor-Netz verlangt Desc=3/Microdesc=3, alte Tor-Version beendet den ganzen App-Prozess. Umstieg auf tor-android 0.4.9.8 (App und Android-Node), Kotlin-stdlib der Bibliothek ausgeschlossen, AAR-Metadaten-Prüfung aus. 0.4.9.9+ braucht Java 24, das geht erst mit neuerem AGP.
- 2026-10-27: **Neuer Lizenzschluessel** (alter private-key.json verloren, nirgends auffindbar). Neues Paar, oeffentlicher Schluessel `t7ZQMSMx3iMbLZ9ke7c-2hYSkgRvyw43HZzaIyvyVC4` in App, relay-android, Node-Server, Control und iOS-Doku. Alte Lizenzen (Schluessel `67A_r4Y…`) ungueltig. Privater Schluessel einmalig als Datei an Gabriel, hier geloescht. Werkzeuge: `rotate-public-key.js`, `public-key.js`, Startmenue-Eintraege.
- 2026-10-26: **Produktentwicklung entscheidet allein Gabriel** (Team-Vorbehalt bei F1, Format und Audit-Befunden entfällt; Gabriel entscheidet, Norbert setzt iOS um). GRANT_RENEW gebaut (automatische Verlängerung von Gast-Grants, neuer Nachrichtentyp, Room v16).
- 2026-10-25: Sicherheitsprüfung 24.10.: Punkte 2 (Rückfrage mit Prüfcode bei eingefügtem Gast-Code) und 3 (nur v3-Onion-Adressen) behoben und gebaut; Punkt 1 (Gast vor Ablauf sperren) wartet auf das Team (Format).
- 2026-10-24: Memory-Struktur unter `.claude/memory/` angelegt.
- 2026-10-23: Spamschutz-Konzept als Entwurf; Stufe A (nichts am Wire-Format) zuerst empfohlen, B und C zusammen mit F1 entscheiden. Wartet auf das Team.
- 2026-10-22: safeline entfällt in allem Sichtbaren: unpruuf Compliance und unpruuf Press.
- 2026-10-19: F1 offen, Paketformat nicht ändern bis das Team zustimmt (Länge im Klartext sichtbar).
- 2026-10-14: Bildsprache Kurierdienst mit Paketautomaten statt Postamt in neuem Material.
- 2026-10-13: Lizenz-Vorrat statt Pool, "unpruuf Control" beim Kunden.
- 2026-10-08: 1 Server-Lizenz = 1 Server = 250 Nodes; App-Lizenzen gerätegebunden.
