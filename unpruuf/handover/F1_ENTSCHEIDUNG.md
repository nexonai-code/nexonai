# F1: Länge im Klartext im gespeicherten Paket. Stand und Plan

**Stand 19.10.2026: offen. Gabriel hat „noch nicht“ gesagt. Nichts ändern, bis das Team (Gabriel, Norbert, Floretta) zugestimmt hat.** Internes Dokument (Protokolldetails, Patentprüfung läuft).

## Befund

`padPacket` schreibt `[Nutzlastlänge: 4 Bytes][Versatz: 4 Bytes]` im Klartext vor die Zufallsfüllung. Wer ein gespeichertes Paket lesen kann (Betreiber von Node oder Relay, Beschlagnahme des Servers), sieht die ungefähre Nachrichtenlänge und erkennt Füllpakete (44) von echten Nachrichten. Ein Beobachter im Netz sieht nur 4096 Bytes. Bei safeline ist der Betreiber die Firma, vor der ein Hinweisgeber Angst hat: Der Füllverkehr verbirgt dort den Zeitpunkt einer Meldung nicht. Belege: `evidence/08-packet-header.js`, `PacketMetadataTest.kt`, `CLAIMS_TO_EVIDENCE.md` C5, C6, E1, E3.

## Empfehlung (Variante A)

Erst auffüllen, dann verschlüsseln:

`Paket = IV(12) + AES-GCM( Version(1) + Länge(4) + Nachricht + Zufallsfüllung ) + Tag(16) = 4096 Bytes`

- Alles Sichtbare ist Zufall; echt und Füllverkehr sind nicht zu unterscheiden; Länge und Art (Chat/Steuersignal) verborgen.
- Nutzlast grob 4063 statt 4060 Bytes (vor dem Bau mit Tests nachrechnen).
- Versionsbyte im verschlüsselten Teil: künftige Formatänderungen ohne Umstieg aller Clients.
- Node-Server und Relay-Server unverändert (blind, 4096 Bytes).
- Auch der Pfad der Meldung an den Officer (`OfficerCase.sealIntake`, Pfad ohne Kontaktschlüssel) braucht die Änderung.

## Betroffene Stellen

- Android: `NetworkObfuscation.kt`, rund zwölf Aufrufe in `P2PNetworkManager.kt`, Tests (`PacketMetadataTest`, `NetworkObfuscationTest`, `RatchetFrameTest`, `OfficerCaseTest`). Gabriel/Claude.
- Officer-App: `wire/networkObfuscation.ts`, `officer/sendRatchet.ts`, `officer/pollAndIngest.ts`. Web-Reporter: `networkObfuscation.ts`, `main.ts`, `public/bundle.js`.
- iOS (Norbert, Vorschlag): `NetworkObfuscation.swift`, `OuterEnvelope.swift`, `RatchetFrame.swift`, `ComplianceService.swift`, `RelayService.swift`, Tests. Dafür eine genaue Beschreibung mit Prüfwerten (KAT) schreiben.
- Belege und Dokumente: `evidence/06`, `08`, `CLAIMS_TO_EVIDENCE.md` (C5, C6, E1, E3), `SECURITY_CLAIMS.md` §1.2, `STATUS.md`, `PRODUCT_CONTEXT.md`, `MARKETING.md`, `COMPLIANCE.md`.

## Kosten und Alternativen

- Umstieg ohne Übergang: alte und neue Versionen verstehen sich danach nicht mehr. Jetzt günstig (keine Kunden im Betrieb). Nach dem ersten Kunden braucht es einen Übergang (neues Format zuerst versuchen, sonst das alte).
- **B. Nur dokumentieren:** kostet nichts; der Auditor führt F1 als Befund; Behebung später mit Übergang.
- **C. Füllpakete mit glaubhafter Längenangabe:** kein Umstieg, aber die Länge echter Nachrichten bleibt sichtbar und die Nachahmung ist nur statistisch. Höchstens als Übergang.

## Reihenfolge, wenn „Ja“

Android, Officer-App, Web-Reporter samt Tests und Belegen; iOS-Beschreibung an Norbert; Test auf Geräten; erst dann der Auditor (damit er das Endformat prüft).
