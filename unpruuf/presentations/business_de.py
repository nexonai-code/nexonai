from common import *
D = "unpruuf Business"
S = []

# 1 cover
S.append(("cover", sec("cover", f'''<div style="position:absolute;left:0;top:0;width:24px;height:1080px;background:{TEAL}"></div>
{eyebrow("NexonAI Consulting SRL", ON_DARK_MUTED)}
<div style="flex:1"></div>
<h1 style="font-family:{DISPLAY};font-size:120px;font-weight:800;line-height:1.05;color:{ON_DARK}">unpruuf Business</h1>
<p style="font-size:44px;line-height:1.3;color:{ON_DARK}">Ihr Kommunikationssystem. Und niemandes sonst.</p>
<p style="font-size:32px;line-height:1.4;color:{ON_DARK_MUTED}">Kein Anbieter. Kein Konto. Keine ID. Ihre Infrastruktur, Ihre Schlüssel, Ihre Nodes.</p>
{notes("Kernbotschaft: Wir verkaufen keinen Messenger-Dienst. Wir bauen dem Kunden sein eigenes Kommunikationssystem, das NexonAI nicht betreibt.")}''', bg=DARK, color=ON_DARK, extra="display:flex;flex-direction:column;gap:32px")))

# 2 problem
S.append(("problema", sec("problema", f'''{head("Das Problem", "Jeder Messenger hat einen Eigentümer")}
{row(card("Server des Anbieters", "Alle Nachrichten laufen über fremde Infrastruktur."),
     card("Konto und Telefonnummer", "Jeder Nutzer ist vom ersten Tag an identifizierbar."),
     card("Metadaten", "Wer, mit wem, wann und wie oft — sichtbar für den Anbieter."))}
<p style="font-size:32px;line-height:1.4;color:{MUTED}">Auch mit Ende-zu-Ende-Verschlüsselung bleibt der Anbieter der Dritte, der zur Herausgabe von Daten verpflichtet werden kann.</p>
{footer(D, 2)}''')))

# 3 tool (statement)
S.append(("instrumentul", sec("instrumentul", f'''{eyebrow("Das Werkzeug", ON_DARK)}
<h2 style="font-family:{DISPLAY};font-size:96px;font-weight:800;line-height:1.08;color:{ON_DARK}">Ihr Server.<br>Hunderte eigene Nodes.</h2>
<ul style="font-size:44px;line-height:1.35;color:{ON_DARK}">
<li>Nirgends registriert.</li>
<li>Nur Sie können darauf schreiben.</li>
<li>Nur wer eingeladen ist, kennt eine Adresse.</li>
</ul>
{footer(D, 3, ON_DARK)}
{notes("Der Server ist das Werkzeug: Damit baut sich jeder Nutzer sein eigenes anonymes Kommunikationssystem. NexonAI hostet nichts.")}''', bg=TEAL, color=ON_DARK, extra="display:flex;flex-direction:column;justify-content:center;gap:40px")))

# 4 how it works (diagram)
box = lambda l, t, w, h, title, sub, main=False: (
    f'<div style="position:absolute;left:{l}px;top:{t}px;width:{w}px;height:{h}px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:4px;'
    f'background:{LIGHT2 if main else CARD};border:{2 if main else 1}px solid {TEAL if main else LINE};border-radius:16px">\n'
    f'<p style="font-family:{DISPLAY};font-size:36px;font-weight:700;color:{DARK};text-align:center">{title}</p>\n'
    f'<p style="font-size:24px;color:{MUTED};text-align:center">{sub}</p>\n</div>')
lbl = lambda l, t, w, text, align="left": f'<p style="position:absolute;left:{l}px;top:{t}px;width:{w}px;font-size:24px;color:{MUTED};text-align:{align}">{text}</p>'
S.append(("functionare", sec("functionare", f'''{head("So funktioniert es", "Jeder schreibt nur auf eigene Nodes")}
{box(128, 520, 360, 140, "Handy A", "reiner Tor-Client")}
{box(1432, 520, 360, 140, "Handy B", "reiner Tor-Client")}
{box(780, 330, 360, 140, "Nodes von A", "feste Onion-Adresse", True)}
{box(780, 720, 360, 140, "Nodes von B", "feste Onion-Adresse", True)}
<x-connector x1="488" y1="560" x2="780" y2="420" head="end" style="color:{MUTED};border-width:3px"></x-connector>
<x-connector x1="1140" y1="420" x2="1432" y2="560" head="end" style="color:{MUTED};border-width:3px"></x-connector>
<x-connector x1="1432" y1="620" x2="1140" y2="770" head="end" style="color:{MUTED};border-width:3px"></x-connector>
<x-connector x1="780" y1="770" x2="488" y2="620" head="end" style="color:{MUTED};border-width:3px"></x-connector>
{lbl(220, 425, 380, "ablegen (Schreibschlüssel)")}
{lbl(1300, 425, 380, "abholen (Abhol-Code)")}
{lbl(1300, 745, 420, "ablegen (Schreibschlüssel)")}
{lbl(180, 745, 380, "abholen (Abhol-Code)")}
{lbl(780, 572, 360, "alles über Tor", "center")}
{footer(D, 4)}
{notes("A schreibt auf seine eigenen Nodes, B holt dort ab. Der Rückweg läuft über die Nodes von B. Niemand schreibt auf fremde Nodes.")}''')))

# 5 two codes
big = lambda title, body, accent: (f'<div style="flex:1;display:flex;flex-direction:column;gap:20px;background:{CARD};padding:48px;border-top:8px solid {accent};border-radius:16px">\n'
    f'<h3 style="font-family:{DISPLAY};font-size:44px;font-weight:700;line-height:1.15;color:{DARK}">{title}</h3>\n'
    f'<p style="font-size:32px;line-height:1.4;color:{MUTED}">{body}</p>\n</div>')
S.append(("doua-coduri", sec("doua-coduri", f'''{head("Identifikation", "Zwei Codes. Mehr nicht.")}
{row(big("Der Abhol-Code", "Findet die Nachricht, ohne jemanden zu nennen. Wechselt stündlich, beide Seiten berechnen ihn selbst.", TEAL),
     big("Der Schlüssel", "Macht den Inhalt lesbar. Ihn haben nur die beiden Gesprächspartner — sonst niemand.", ORANGE))}
<p style="font-size:32px;line-height:1.4;color:{MUTED}">Die App weiß nicht, mit wem sie spricht. Sie braucht nur einen Code zum Finden und einen zum Entschlüsseln.</p>
{footer(D, 5)}''', bg=LIGHT2)))

# 6 what does not exist
gone = lambda t: f'<p style="font-family:{DISPLAY};font-size:56px;font-weight:700;line-height:1.2;color:{DARK};text-decoration:line-through {ORANGE}">{t}</p>'
S.append(("nu-exista", sec("nu-exista", f'''{head("Was es nicht gibt", "Nichts, was identifiziert")}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:28px 64px">
{gone("Benutzer-ID")}
{gone("Telefonnummer")}
{gone("Konto")}
{gone("Onion-Adresse auf dem Handy")}
{gone("Anbieter")}
{gone("Gemeinsames zwischen Kontakten")}
</div>
<p style="font-size:32px;line-height:1.4;color:{MUTED}">Jedes Pairing bekommt neue Schlüssel und eigene Nodes. Zwei Kontakte, die ihre QR-Codes vergleichen, finden nichts Gemeinsames.</p>
{footer(D, 6)}''')))

# 7 hundreds of nodes
num = lambda n, t, c: (f'<div style="flex:1;display:flex;flex-direction:column;gap:12px">\n'
    f'<p style="font-family:{DISPLAY};font-size:120px;font-weight:800;line-height:1;color:{c}">{n}</p>\n'
    f'<p style="font-size:32px;line-height:1.35;color:{DARK}">{t}</p>\n</div>')
S.append(("sute-noduri", sec("sute-noduri", f'''{head("Skalierung", "Hunderte Nodes, je 3 pro Kontakt")}
{row(num("500", "Nodes auf einem Server, in einem einzigen Prozess", TEAL),
     num("3", "eigene Nodes für jeden neuen Kontakt", ORANGE),
     num("0", "Gemeinsamkeiten zwischen zwei Kontakten, bei genug Nodes im Pool", TEAL), gap=64)}
<p style="font-size:32px;line-height:1.4;color:{MUTED}">Ein QR-Scan pro Server: Die App holt sich die übrigen Nodes selbst und gibt jedem Kontakt seine eigenen. Ein beschlagnahmter Node betrifft nur wenige Kontakte, nicht alle.</p>
{footer(D, 7)}
{notes("Gemessen ohne Live-Tor-Netz: 500 Nodes in einem Prozess rund 85 MB RAM. Die Netzlast auf einem echten VPS wird noch gemessen.")}''')))

# 8 what the node sees
S.append(("ce-vede", sec("ce-vede", f'''{head("Der Node", "Was der Node sieht — und was nicht")}
{row(card("Sieht", "Verschlüsselte Blöcke fester Größe unter stündlich wechselnden Codes. Löscht sie selbst nach 1 bis 24 Stunden.", bg=CARD),
     card("Sieht nicht", "Den Inhalt. Den Absender. Den Empfänger. Die IP-Adresse. Wer zu wem gehört.", bg=DARK, border=DARK, tcolor=ON_DARK, bcolor=ON_DARK_MUTED))}
<p style="font-size:32px;line-height:1.4;color:{MUTED}">Ein beschlagnahmter Node enthält nichts Lesbares.</p>
{footer(D, 8)}''')))

# 9 server in practice
S.append(("server", sec("server", f'''{head("Der Server in der Praxis", "Installation ohne Kommandozeile")}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:32px">
{card("Überall", "Windows, Linux, Docker, als .exe oder ein Android-Tablet als Node.", pad=36)}
{card("Einrichtung", "install.bat und start.bat. Die Einrichtungsseite zeigt den QR-Code für die eigene App.", pad=36)}
{card("Profile", "Standard 6 Stunden, hohe Sicherheit 1 Stunde, offline-tolerant 24 Stunden.", pad=36)}
{card("Temp Node", "Nur für ein Gespräch, nur im Arbeitsspeicher. Geschlossen = weg.", pad=36)}
</div>
{footer(D, 9)}''', bg=LIGHT2)))

# 10 security built in
pill = lambda t, b: (f'<div style="display:flex;flex-direction:column;gap:8px;padding:28px 32px;background:{CARD};border-left:8px solid {TEAL};border-radius:12px">\n'
    f'<h3 style="font-family:{DISPLAY};font-size:36px;font-weight:700;color:{DARK}">{t}</h3>\n<p style="font-size:28px;line-height:1.35;color:{MUTED}">{b}</p>\n</div>')
S.append(("securitate", sec("securitate", f'''{head("Eingebaute Sicherheit", "Fünf Schichten, kein Versprechen")}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px 32px">
{pill("Tor verpflichtend", "Der Node sieht nie eine IP-Adresse.")}
{pill("Proof-of-Work", "Den Node zu überfluten kostet den Angreifer Rechenleistung.")}
{pill("Nur der Besitzer schreibt", "Niemand sonst kann auf Ihren Nodes ablegen.")}
{pill("Double Ratchet", "Neue Schlüssel für jede Nachricht, alte bleiben geschützt.")}
{pill("Eigene Schlüssel pro Kontakt", "Jedes Pairing hat eigene Schlüssel und Nodes.")}
</div>
{footer(D, 10)}''', extra="display:flex;flex-direction:column;gap:40px")))

# 11 compliance by architecture
S.append(("conformitate", sec("conformitate", f'''{eyebrow("Compliance durch Architektur", "#F0B27A")}
<h2 style="font-family:{DISPLAY};font-size:72px;font-weight:800;line-height:1.12;color:{ON_DARK}">Es gibt keinen Anbieter, der zur Herausgabe von Daten verpflichtet werden kann.</h2>
<div style="display:flex;gap:48px">
<p style="flex:1;font-size:32px;line-height:1.4;color:{ON_DARK_MUTED}">NexonAI hostet nichts und verarbeitet keine Daten im Auftrag des Kunden.</p>
<p style="flex:1;font-size:32px;line-height:1.4;color:{ON_DARK_MUTED}">Datenschutz durch Technikgestaltung (Art. 25 DSGVO).</p>
<p style="flex:1;font-size:32px;line-height:1.4;color:{ON_DARK_MUTED}">Die Daten bleiben ausschließlich in der eigenen Infrastruktur.</p>
</div>
{footer(D, 11, ON_DARK_MUTED)}
{notes("Vorsichtig formulieren: Wir sagen nicht, dass Durchsuchungen oder Anordnungen sinnlos sind. Wir sagen, dass es keinen Anbieter gibt, der etwas herausgeben könnte, und dass ein beschlagnahmter Node nichts Lesbares enthält.")}''', bg=DARK, color=ON_DARK, extra="display:flex;flex-direction:column;justify-content:center;gap:48px")))

# 12 for whom
small = lambda t, b: (f'<div style="flex:1;display:flex;flex-direction:column;gap:12px;background:{CARD};padding:32px;border:1px solid {LINE};border-radius:16px">\n'
    f'<h3 style="font-family:{DISPLAY};font-size:36px;font-weight:700;line-height:1.15;color:{DARK}">{t}</h3>\n<p style="font-size:26px;line-height:1.4;color:{MUTED}">{b}</p>\n</div>')
S.append(("pentru-cine", sec("pentru-cine", f'''{head("Für wen", "Überall, wo Vertraulichkeit Pflicht ist")}
{row(small("Kanzleien", "Mandanten-Kommunikation unter Berufsgeheimnis."),
     small("Gesundheit", "Patientendaten ohne Drittanbieter."),
     small("Steuern", "Sensible Finanzunterlagen."),
     small("Führung", "Strategie, Fusionen, Übernahmen."),
     small("Behörden", "Interne Kommunikation ohne fremde Cloud."), gap=24)}
{footer(D, 12)}''')))

# 13 status
S.append(("stadiu", sec("stadiu", f'''{head("Aktueller Stand", "Gebaut und getestet. Nächster Schritt: echte Geräte.")}
{row(card("Fertig", "Server: 41 automatische Tests, echtes Tor. App: 59 Tests in allen 4 Editionen. Tablet-Node: 9 Tests."),
     card("Als Nächstes", "Test auf echten Geräten. Messung auf einem echten VPS. Unabhängiges Sicherheits-Audit.", bg=LIGHT2))}
<p style="font-size:28px;line-height:1.4;color:{MUTED}">Keine Architektur schützt vor einem Handy mit Spionage-Software oder einem Partner, der Screenshots macht.</p>
{footer(D, 13)}''', bg=LIGHT)))

# 14 next steps
S.append(("pasi", sec("pasi", f'''{eyebrow("Nächste Schritte", ON_DARK)}
<h2 style="font-family:{DISPLAY};font-size:96px;font-weight:800;line-height:1.08;color:{ON_DARK}">Ein Pilot.<br>Ihr System.</h2>
<ol style="font-size:36px;line-height:1.45;color:{ON_DARK}">
<li>Bedarf und Kommunikationswege analysieren</li>
<li>Eigenen Server und Apps installieren</li>
<li>Pilot mit einem Team, dann ausrollen</li>
</ol>
<p style="font-size:32px;color:{ON_DARK}">NexonAI Consulting SRL · nexonai.consulting@gmail.com · +40 773 829 646</p>''', bg=TEAL, color=ON_DARK, extra="display:flex;flex-direction:column;justify-content:center;gap:40px")))

sections = {
    "s1": {"description": "Das Problem: Jeder Messenger hat einen Eigentümer.", "start": "cover"},
    "s2": {"description": "Die Lösung: eigener Server, eigene Nodes, zwei Codes.", "start": "instrumentul"},
    "s3": {"description": "Sicherheit und Compliance durch Architektur.", "start": "ce-vede"},
    "s4": {"description": "Für wen, aktueller Stand und nächste Schritte.", "start": "pentru-cine"},
}
print(write_deck("business_de", "unpruuf Business (DE)", S, sections))
