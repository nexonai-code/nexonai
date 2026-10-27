# v13 — 2026-10-27

**Einstieg mit Tile-Feld:** Hinter der Überschrift liegt jetzt ein Feld aus Kacheln (Canvas, `hero-field.js`) statt des Fotos. Die Kacheln sind wie Federn mit ihren Nachbarn verbunden. Der Mauszeiger schickt Wellen durch das Feld, Klick drückt es ein und lässt es beim Loslassen zurückschlagen, Wischen und Tippen auf dem Handy wirken ebenso. Nach einigen Sekunden beruhigt sich das Feld, die Animation stoppt dann und braucht keine Rechenleistung mehr. Auf dem Handy fällt ab und zu ein sanfter Tropfen ins Feld, weil es dort kein Hovern gibt.

**Bewegung reduzieren:** Ist im System „Bewegung reduzieren“ gesetzt, steht das Feld still (eingefrorenes Wellenmuster), der Mauszeiger hebt nur die Kacheln darunter an. Der Schalter „Feldbewegung an/aus“ unten rechts im Einstieg überschreibt die Systemeinstellung (DE/EN/RO, per Tastatur bedienbar).

Geändert: `index.html` (Canvas, Schalter, ein Skript; der Hinweis „Konzeptillustration“ entfällt, weil das Foto nicht mehr angezeigt wird), `styles.css` (Abschnitt v13 am Ende), neu `hero-field.js`. Texte, Farben und alle anderen Bereiche unverändert. Das Foto `assets/original-1.webp` bleibt in der Datei; zurück zur alten Ansicht: in `index.html` `has-field` aus der Klasse des Einstiegs entfernen.

Geprüft in Chromium (Desktop, Handy-Breite, Bewegung reduziert): keine Konsolenfehler, kein seitliches Scrollen. Nicht geprüft: echtes Handy, Safari, Firefox.

# v12 — 2026-10-22

**Umbenennung:** „safeline“ heißt auf der Seite jetzt „unpruuf Compliance“, „safeline Press“ heißt „unpruuf Press“. Der Anker #safeline ist zu #compliance geworden. Die CSS-Klasse safeline-art bleibt (technisch).

Basis: die Datei web.zip (Stand v8 laut CHANGELOG). Die Änderungen v9 bis v11 waren in dieser Basis nicht enthalten; Logo und Blau sind hier neu nachgebaut, nicht aus v11 übernommen.

**Header und Footer mit NexonAI-Logo:** statt der Wortmarke „unpruuf. by NexonAI“ steht das NexonAI-Consulting-Logo (assets/nexonai-logo.png), daneben getrennt durch eine feine Linie „unpruuf.“. Gleiches im Footer. Favicon aus dem Zeichen des Logos (assets/favicon.png). Auf dem Handy kleinere Größe.

**Blau statt Grün:** Akzent #307098 (Knöpfe, Links, Kennzeichen), hell auf Dunkel #90c8e8, dunkle Flächen #0f2a3a, Hover #235577; Flächen und Linien in kühlem Grau-Blau. Gilt für Stylesheets, Illustrationen (SVG), Inline-Farben, theme-color und die Rechtsseiten. Orange/Bernstein für Hinweise bleibt. Das Foto im Einstieg ist unverändert.

Neu im Bereich „Wie es funktioniert“ (#how, direkt nach den drei Karten, #no-number): „Nie wieder die Telefonnummer herausgeben“ mit drei Karten (ein Code statt Nummer, ein Code pro Person, Löschen und es ist vorbei) und der ehrlichen Grenze darunter (Erhaltenes bleibt, andere Kanäle unberührt). DE, EN und RO, vorhandene Stile, keine neuen Dateien. Nichts anderes geändert.

# v8 — 2026-10-17

Vorfälle-Bereich kompakt: jeder Fall, die Vergleichstabelle und die Quellen sind Aufklapp-Punkte (zu Beginn geschlossen). Fall-Texte auf je 3 Sätze gekürzt (passiert / mit uns / was bleibt). Kürzere Einleitung, keine Gruppenerklärungen, Kernaussagen nur als Überschriften.

Neuer Bereich „Was passiert ist, und was mit uns passiert wäre“ (#incidents), dreisprachig DE/EN/RO, vor „Einsatzbereiche“.
- 10 Fälle in 4 Gruppen (Telefonnummern und Betreiber, zentrale Server und Updates, Geräte und Protokolle, Menschen und Dokumente), je mit „Was passiert ist“, „Mit uns“ und „Was bleibt“.
- Vergleichstabelle Signal, Threema, Telegram, WhatsApp, unpruuf; drei Kernaussagen; 14 Quellen mit Links.
- Navigation: Eintrag im Ressourcen-Menü und im mobilen Menü.
- Aussagen zu unpruuf sind als eigene, nicht auditierte Analyse gekennzeichnet. Grenzen werden je Fall offen genannt.
- Neue Stile (inc-*) am Ende von styles.css.
- Audit-Roadmap vollständig entfernt: PDF, Download-Kacheln (Ressourcen, Kontaktbereich), Navigationsbezeichnung („FAQ“), Hinweise in Sicherheitskarte 08, Ressourcen-Text und FAQ „Auditiert?“. Die Seite sagt weiter offen: Pilotphase, noch nicht unabhängig auditiert.

# v7 — 2026-10-16

Freigegebenen kurzen Architekturvergleich unter dem Einstieg ergänzt: zwei Bildspalten, drei Plattform-Abhängigkeiten und vier unpruuf-Eigenschaften. Zwei eigene lokal gespeicherte SVG-Illustrationen und lokalisierte Bildbeschreibungen. Neue Inhalte und Links auf Deutsch, Englisch und Rumänisch. Die Illustrationen stellen logische Kommunikationsbereiche dar, keine garantierten dedizierten Server pro Person.

# v6 — 2026-10-16

Navigation und Seitenfolge weiter an der Referenz orientiert. Acht Security-Prinzipien, drei belegte Cyberrisiko-Kennzahlen, drei Einsatzbereiche, FAQ und Abschluss-CTA ergänzt. Neue Inhalte vollständig auf DE/EN/RO. Die Quellen sind direkt im Risikobereich verlinkt; Prozentwerte werden mit ihrer Bezugsgröße gezeigt.

Keine fremden Kundenreferenzen, Zertifizierungen, Audits oder Garantien übernommen. Bestehende 20 Lösungsdetails und Entwicklungskennzeichnungen erhalten. Rechtlicher Hinweis zu externen Links angepasst.

# v5 — 2026-10-16

Neue Seitenführung nach dem Aufbau von Threema: Hero, Hauptprodukte, Architekturprinzipien, Einsatzbereiche, Funktionsweise, Entwicklungsstand, Kontakt und Footer.

Alle 20 Lösungen, drei Sprachen, Statusangaben, PDF und Kontaktfunktionen aus v4 erhalten. Selbst gehostete Assets ausgelagert. Rechtstexte optisch angepasst; Beschreibung des lokalen Entwurfsformulars berichtigt. Offene Unternehmens- und Hostingangaben bleiben offen.
