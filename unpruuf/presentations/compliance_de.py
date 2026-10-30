from common import *
D = "unpruuf Compliance"
S = []

box = lambda l, t, w, h, title, sub, main=False: (
    f'<div style="position:absolute;left:{l}px;top:{t}px;width:{w}px;height:{h}px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:4px;'
    f'background:{LIGHT2 if main else CARD};border:{2 if main else 1}px solid {TEAL if main else LINE};border-radius:16px">\n'
    f'<p style="font-family:{DISPLAY};font-size:32px;font-weight:700;color:{DARK};text-align:center">{title}</p>\n'
    f'<p style="font-size:24px;color:{MUTED};text-align:center">{sub}</p>\n</div>')
lbl = lambda l, t, w, text, align="left": f'<p style="position:absolute;left:{l}px;top:{t}px;width:{w}px;font-size:24px;color:{MUTED};text-align:{align}">{text}</p>'
gone = lambda t: f'<p style="font-family:{DISPLAY};font-size:56px;font-weight:700;line-height:1.2;color:{DARK};text-decoration:line-through {ORANGE}">{t}</p>'

# 1 cover
S.append(("cover", sec("cover", f'''<div style="position:absolute;left:0;top:0;width:24px;height:1080px;background:{ORANGE}"></div>
{eyebrow("NexonAI Consulting SRL", ON_DARK_MUTED)}
<div style="flex:1"></div>
<h1 style="font-family:{DISPLAY};font-size:120px;font-weight:800;line-height:1.05;color:{ON_DARK}">unpruuf Compliance</h1>
<p style="font-size:44px;line-height:1.3;color:{ON_DARK}">Anonymer Meldekanal durch Architektur.</p>
<p style="font-size:32px;line-height:1.4;color:{ON_DARK_MUTED}">Nach EU-Richtlinie 2019/1937 und dem jeweiligen nationalen Gesetz. Betrieben von der Organisation, nicht von einem Anbieter.</p>''', bg=DARK, color=ON_DARK, extra="display:flex;flex-direction:column;gap:32px")))

# 2 obligation (timeline)
step = lambda n, t, b, c: (f'<div style="flex:1;display:flex;flex-direction:column;gap:12px;border-top:8px solid {c};padding:32px 0 0 0">\n'
    f'<p style="font-family:{DISPLAY};font-size:72px;font-weight:800;line-height:1;color:{c}">{n}</p>\n'
    f'<h3 style="font-family:{DISPLAY};font-size:36px;font-weight:700;line-height:1.2;color:{DARK}">{t}</h3>\n'
    f'<p style="font-size:28px;line-height:1.4;color:{MUTED}">{b}</p>\n</div>')
S.append(("obligatia", sec("obligatia", f'''{head("Die Pflicht", "Interner Meldekanal mit klaren Fristen")}
<p style="font-size:32px;line-height:1.4;color:{MUTED}">Organisationen mit 50 oder mehr Beschäftigten müssen einen internen Meldekanal anbieten.</p>
{row(step("Tag 0", "Die Meldung kommt an", "Der Fall öffnet sich im Dashboard, beide Fristen laufen automatisch.", TEAL),
     step("7 Tage", "Eingangsbestätigung", "Art. 9 Abs. 1 Buchst. b der Richtlinie.", ORANGE),
     step("3 Monate", "Rückmeldung an den Hinweisgeber", "Art. 9 Abs. 1 Buchst. f der Richtlinie.", TEAL), gap=48)}
{footer(D, 2)}''')))

# 3 problem
S.append(("problema", sec("problema", f'''{head("Das Problem klassischer Lösungen", "Anonymität hängt an einem Versprechen")}
{row(card("SaaS-Plattformen", "Der Anbieter könnte Inhalt und Metadaten technisch mitlesen."),
     card("E-Mail und Telefon", "Adresse, Nummer und Uhrzeit verraten den Hinweisgeber."),
     card("Vertrag", "Das Vertrauen steckt in einem Dokument, nicht in der Technik."))}
<p style="font-size:32px;line-height:1.4;color:{MUTED}">Wer Repressalien fürchtet, meldet nicht über einen Kanal, dem er vertrauen muss.</p>
{footer(D, 3)}''')))

# 4 tool (statement)
S.append(("instrumentul", sec("instrumentul", f'''{eyebrow("Das Werkzeug", ON_DARK)}
<h2 style="font-family:{DISPLAY};font-size:96px;font-weight:800;line-height:1.08;color:{ON_DARK}">Ihr Relay.<br>Auf Ihrer Hardware.</h2>
<ul style="font-size:44px;line-height:1.35;color:{ON_DARK}">
<li>Ein Tablet oder Laptop der Organisation.</li>
<li>NexonAI hostet nichts.</li>
<li>Mehrere getrennte Kanäle, jeder mit eigenen Schlüsseln.</li>
</ul>
{footer(D, 4, ON_DARK)}
{notes("Mehrere Kanäle bedeuten mehrere Relays, jedes mit eigenem Dashboard und eigenen Schlüsseln, zum Beispiel pro Standort oder Abteilung.")}''', bg=TEAL, color=ON_DARK, extra="display:flex;flex-direction:column;justify-content:center;gap:40px")))

# 5 how it works
S.append(("functionare", sec("functionare", f'''{head("So funktioniert es", "Das Relay sieht weder Inhalt noch Identität")}
{box(128, 400, 360, 110, "Melder-App", "Android, über Tor")}
{box(1432, 400, 360, 110, "Officer-Dashboard", "Laptop, über Tor")}
{box(780, 580, 360, 110, "Eigenes Relay", "blinder Briefkasten", True)}
{box(800, 790, 320, 100, "Web-Melder", "Browser, ohne Installation")}
<x-connector x1="488" y1="440" x2="1432" y2="440" head="end" style="color:{MUTED};border-width:3px;border-style:dashed"></x-connector>
<x-connector x1="488" y1="490" x2="780" y2="620" head="both" style="color:{MUTED};border-width:3px"></x-connector>
<x-connector x1="1432" y1="490" x2="1140" y2="620" head="both" style="color:{MUTED};border-width:3px"></x-connector>
<x-connector x1="960" y1="790" x2="960" y2="690" head="both" style="color:{MUTED};border-width:3px"></x-connector>
{lbl(700, 390, 520, "Pairing-Code, einmalig", "center")}
{lbl(260, 600, 360, "senden / abholen")}
{lbl(1300, 600, 360, "senden / abholen")}
{footer(D, 5)}
{notes("Einzige Ausnahme vom Relay: der Pairing-Code, einmalig beim Öffnen des Falls ausgetauscht. Danach läuft alles über das Relay, Ende-zu-Ende verschlüsselt.")}''')))

# 6 what does not exist
S.append(("nu-exista", sec("nu-exista", f'''{head("Was es nicht gibt", "Nichts, was identifiziert")}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:28px 64px">
{gone("Konto")}
{gone("E-Mail-Adresse")}
{gone("Telefonnummer")}
{gone("Sichtbares App-Icon")}
{gone("Onion-Adresse auf dem Handy")}
{gone("Anbieter, der mitliest")}
</div>
<p style="font-size:32px;line-height:1.4;color:{MUTED}">Die App hat kein sichtbares Icon und kein Branding, damit ein Blick aufs Handy den Hinweisgeber nicht verrät.</p>
{footer(D, 6)}''', bg=LIGHT2)))

# 7 who sees what (table)
S.append(("cine-vede", sec("cine-vede", f'''{head("Sicherheitsmodell", "Wer sieht was")}
<table style="font-size:28px;color:{DARK}">
<tr><th style="width:40%">Wer</th><th style="width:15%">Inhalt</th><th style="width:15%">Identität</th><th style="width:30%">Warum</th></tr>
<tr><td>Relay-Betreiber</td><td>Nein</td><td>Nein</td><td>Nur verschlüsselte Blöcke</td></tr>
<tr style="background:{LIGHT2}"><td>Netz, Seite des Hinweisgebers</td><td>Nein</td><td>Nein</td><td>Tor</td></tr>
<tr><td>Netz, Seite des Officers</td><td>Nein</td><td>Nein</td><td>Tor</td></tr>
<tr style="background:{LIGHT2}"><td>Netz, Web-Melder</td><td>Nein</td><td>Teilweise</td><td>Kein Tor standardmäßig</td></tr>
<tr><td>Compliance-Officer</td><td>Ja</td><td>Nur wenn genannt</td><td>Lokal verschlüsselte Fallakte</td></tr>
</table>
{footer(D, 7)}''')))

# 8 dashboard (mock, marked as example)
mrow = lambda a, b, c, d, bg: f'<tr style="background:{bg}"><td>{a}</td><td>{b}</td><td>{c}</td><td>{d}</td></tr>'
S.append(("panou", sec("panou", f'''{head("Officer-Dashboard", "Fallakten mit Fristen, nicht nur ein Chat")}
<div style="display:flex;gap:48px">
<div style="flex:3;display:flex;flex-direction:column;gap:16px;background:{CARD};padding:32px;border:1px solid {LINE};border-radius:16px">
<p style="font-size:24px;letter-spacing:2px;text-transform:uppercase;color:{MUTED};font-weight:600">Beispiel zur Veranschaulichung</p>
<table style="font-size:26px;color:{DARK}">
<tr><th style="width:22%">Fall</th><th style="width:26%">Status</th><th style="width:26%">Bestätigung</th><th style="width:26%">Rückmeldung</th></tr>
{mrow("[Fall 1]", "Neu", "noch 6 Tage", "noch 89 Tage", CARD)}
{mrow("[Fall 2]", "Bestätigt", "erledigt", "noch 61 Tage", LIGHT2)}
{mrow("[Fall 3]", "In Arbeit", "erledigt", "noch 12 Tage", CARD)}
</table>
</div>
<ul style="flex:2;font-size:32px;line-height:1.45;color:{DARK}">
<li>Fristen starten automatisch</li>
<li>Status: Neu, Bestätigt, In Arbeit, Abgeschlossen</li>
<li>Lokal verschlüsselt, mit Passwort geschützt</li>
<li>Oberfläche auch komplett auf Rumänisch</li>
</ul>
</div>
{footer(D, 8)}''', bg=LIGHT2)))

# 9 two ways to report
S.append(("doua-cai", sec("doua-cai", f'''{head("Zwei Meldewege", "Maximaler Schutz oder ohne Installation")}
{row(card("Die App", "Über Tor, Nachrichten nur im Arbeitsspeicher, kein sichtbares Icon. Empfohlen bei Risiko von Repressalien."),
     card("Der Browser", "Ohne Installation, gleiche Verschlüsselung. Schwächerer Schutz: kein Tor standardmäßig. Sichtbarer Warnhinweis.", bg=LIGHT2))}
{footer(D, 9)}''')))

# 10 legal
leg = lambda a, b: (f'<div style="flex:1;display:flex;flex-direction:column;gap:12px;background:{CARD};padding:36px;border-top:8px solid {TEAL};border-radius:12px">\n'
    f'<p style="font-family:{DISPLAY};font-size:36px;font-weight:700;color:{TEAL}">{a}</p>\n<p style="font-size:28px;line-height:1.4;color:{DARK}">{b}</p>\n</div>')
S.append(("cadru-legal", sec("cadru-legal", f'''{head("Rechtsrahmen", "Software, die den Prozess unterstützt")}
{row(leg("Art. 9 (1) b)", "Eingangsbestätigung in 7 Tagen — Frist wird automatisch berechnet."),
     leg("Art. 9 (1) f)", "Rückmeldung in 3 Monaten — Frist wird automatisch berechnet."),
     leg("Art. 16", "Vertraulichkeit der Identität — durch die Architektur."))}
<p style="font-size:28px;line-height:1.4;color:{MUTED}">Keine Rechtsberatung und keine Zertifizierung. Ob das nationale Umsetzungsgesetz vollständig erfüllt ist, bestätigt die Rechtsabteilung der Organisation.</p>
{footer(D, 10)}''')))

# 11 installation
S.append(("instalare", sec("instalare", f'''{head("Installation", "Drei Schritte, ohne Kommandozeile")}
{row(step("1", "Das Relay", "Die Relay-App auf einem Android-Tablet oder einem Laptop.", TEAL),
     step("2", "Das Dashboard", "install.bat und start.bat auf dem Laptop des Officers.", ORANGE),
     step("3", "Bekanntmachen", "QR-Code oder Melde-Link für die Beschäftigten.", TEAL), gap=48)}
{footer(D, 11)}''', bg=LIGHT2)))

# 12 status
S.append(("stadiu", sec("stadiu", f'''{head("Aktueller Stand", "Getestet. Nächster Schritt: echte Geräte.")}
{row(card("Fertig", "Verschlüsselung Byte für Byte geprüft. Zwei unabhängige Umsetzungen gegeneinander getestet. App: 59 Tests."),
     card("Als Nächstes", "Test auf echten Geräten. Zugang für mehrere Officer. Export von Fällen. Unabhängiges Audit.", bg=LIGHT2))}
{footer(D, 12)}''')))

# 13 next steps
S.append(("pasi", sec("pasi", f'''{eyebrow("Nächste Schritte", ON_DARK)}
<h2 style="font-family:{DISPLAY};font-size:96px;font-weight:800;line-height:1.08;color:{ON_DARK}">Ein Pilot.<br>Ihr Kanal.</h2>
<ol style="font-size:36px;line-height:1.45;color:{ON_DARK}">
<li>Anforderungen und internen Prozess analysieren</li>
<li>Relay und Dashboard installieren</li>
<li>Pilot, dann Start für die Beschäftigten</li>
</ol>
<p style="font-size:32px;color:{ON_DARK}">NexonAI Consulting SRL · nexonai.consulting@gmail.com · +40 773 829 646</p>''', bg=TEAL, color=ON_DARK, extra="display:flex;flex-direction:column;justify-content:center;gap:40px")))

sections = {
    "s1": {"description": "Die gesetzliche Pflicht und das Problem klassischer Lösungen.", "start": "cover"},
    "s2": {"description": "Die Lösung: das Relay der Organisation, nichts, was identifiziert.", "start": "instrumentul"},
    "s3": {"description": "Dashboard, Meldewege und Rechtsrahmen.", "start": "panou"},
    "s4": {"description": "Installation, Stand und nächste Schritte.", "start": "instalare"},
}
print(write_deck("compliance_de", "unpruuf Compliance (DE)", S, sections))
