# -*- coding: utf-8 -*-
"""unpruuf Business and unpruuf Compliance decks, German and Romanian, state 2026-10-06.

One file, both languages: every text exists as (de, ro). Run `python3 decks2.py` — it writes
business_de/, business/, compliance_de/, compliance/ (project/deck.json + project/slides/*.html),
the same layout the earlier decks used. Render: see README.md.
"""
from common import *


def build_business(lang):
    i = 0 if lang == "de" else 1
    P = lambda de, ro: (de, ro)[i]
    D = "unpruuf Business"
    S = []
    n = [0]

    def nxt():
        n[0] += 1
        return n[0]

    box = lambda l, t, w, h, title, sub, main=False: (
        f'<div style="position:absolute;left:{l}px;top:{t}px;width:{w}px;height:{h}px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:4px;'
        f'background:{LIGHT2 if main else CARD};border:{2 if main else 1}px solid {TEAL if main else LINE};border-radius:16px">\n'
        f'<p style="font-family:{DISPLAY};font-size:36px;font-weight:700;color:{DARK};text-align:center">{title}</p>\n'
        f'<p style="font-size:24px;color:{MUTED};text-align:center">{sub}</p>\n</div>')
    lbl = lambda l, t, w, text, align="left": f'<p style="position:absolute;left:{l}px;top:{t}px;width:{w}px;font-size:24px;color:{MUTED};text-align:{align}">{text}</p>'
    big = lambda title, body, accent: (f'<div style="flex:1;display:flex;flex-direction:column;gap:20px;background:{CARD};padding:48px;border-top:8px solid {accent};border-radius:16px">\n'
        f'<h3 style="font-family:{DISPLAY};font-size:44px;font-weight:700;line-height:1.15;color:{DARK}">{title}</h3>\n'
        f'<p style="font-size:32px;line-height:1.4;color:{MUTED}">{body}</p>\n</div>')
    gone = lambda t: f'<p style="font-family:{DISPLAY};font-size:56px;font-weight:700;line-height:1.2;color:{DARK};text-decoration:line-through {ORANGE}">{t}</p>'
    num = lambda nn, t, c: (f'<div style="flex:1;display:flex;flex-direction:column;gap:12px">\n'
        f'<p style="font-family:{DISPLAY};font-size:120px;font-weight:800;line-height:1;color:{c}">{nn}</p>\n'
        f'<p style="font-size:32px;line-height:1.35;color:{DARK}">{t}</p>\n</div>')
    pill = lambda t, b: (f'<div style="display:flex;flex-direction:column;gap:8px;padding:28px 32px;background:{CARD};border-left:8px solid {TEAL};border-radius:12px">\n'
        f'<h3 style="font-family:{DISPLAY};font-size:36px;font-weight:700;color:{DARK}">{t}</h3>\n<p style="font-size:28px;line-height:1.35;color:{MUTED}">{b}</p>\n</div>')
    small = lambda t, b: (f'<div style="flex:1;display:flex;flex-direction:column;gap:12px;background:{CARD};padding:32px;border:1px solid {LINE};border-radius:16px">\n'
        f'<h3 style="font-family:{DISPLAY};font-size:36px;font-weight:700;line-height:1.15;color:{DARK}">{t}</h3>\n<p style="font-size:26px;line-height:1.4;color:{MUTED}">{b}</p>\n</div>')
    body = lambda t, c=MUTED, sz=32: f'<p style="font-size:{sz}px;line-height:1.4;color:{c}">{t}</p>'

    # 1 cover
    nxt()
    S.append(("cover", sec("cover", f'''<div style="position:absolute;left:0;top:0;width:24px;height:1080px;background:{TEAL}"></div>
{eyebrow("NexonAI Consulting SRL", ON_DARK_MUTED)}
<div style="flex:1"></div>
<h1 style="font-family:{DISPLAY};font-size:120px;font-weight:800;line-height:1.05;color:{ON_DARK}">unpruuf Business</h1>
<p style="font-size:44px;line-height:1.3;color:{ON_DARK}">{P("Ihr Kommunikationssystem. Und niemandes sonst.", "Sistemul tău de comunicare. Al nimănui altcuiva.")}</p>
<p style="font-size:32px;line-height:1.4;color:{ON_DARK_MUTED}">{P("Kein Anbieter. Kein Konto. Keine ID. Ihre Infrastruktur, Ihre Schlüssel, Ihre Nodes.", "Fără furnizor. Fără cont. Fără ID. Infrastructura ta, cheile tale, nodurile tale.")}</p>
{notes(P("Kernbotschaft: Wir verkaufen keinen Messenger-Dienst. Wir liefern dem Kunden sein eigenes Kommunikationssystem. NexonAI betreibt keine Server, die Server gehören immer dem Kunden.", "Mesajul central: nu vindem un serviciu de mesagerie. Livrăm clientului propriul sistem de comunicare. NexonAI nu operează servere, serverele aparțin întotdeauna clientului."))}''', bg=DARK, color=ON_DARK, extra="display:flex;flex-direction:column;gap:32px")))

    # 2 problem
    k = nxt()
    S.append(("problema", sec("problema", f'''{head(P("Das Problem", "Problema"), P("Jeder Messenger hat einen Eigentümer", "Fiecare mesager are un proprietar"))}
{row(card(P("Server des Anbieters", "Serverul furnizorului"), P("Alle Nachrichten laufen über fremde Infrastruktur.", "Toate mesajele trec prin infrastructura altcuiva.")),
     card(P("Konto und Telefonnummer", "Cont și număr de telefon"), P("Jeder Nutzer ist vom ersten Tag an identifizierbar.", "Fiecare utilizator este identificabil de la prima zi.")),
     card("Metadaten" if i == 0 else "Metadate", P("Wer, mit wem, wann und wie oft: sichtbar für den Anbieter.", "Cine, cu cine, când și cât de des: vizibil pentru furnizor.")))}
{body(P("Auch mit Ende-zu-Ende-Verschlüsselung bleibt der Anbieter der Dritte, der zur Herausgabe von Daten verpflichtet werden kann.", "Chiar și cu criptare cap la cap, furnizorul rămâne a treia parte care poate fi obligată să predea date."))}
{footer(D, k)}''')))

    # 3 tool
    k = nxt()
    S.append(("instrumentul", sec("instrumentul", f'''{eyebrow(P("Das Werkzeug", "Instrumentul"), ON_DARK)}
<h2 style="font-family:{DISPLAY};font-size:96px;font-weight:800;line-height:1.08;color:{ON_DARK}">{P("Ihr Server.<br>250 eigene Adressen.", "Serverul tău.<br>250 de adrese proprii.")}</h2>
<ul style="font-size:44px;line-height:1.35;color:{ON_DARK}">
<li>{P("Nirgends registriert.", "Nicăieri înregistrate.")}</li>
<li>{P("Nur Sie können darauf schreiben.", "Doar tu poți scrie pe ele.")}</li>
<li>{P("Nur wer eingeladen ist, kennt eine Adresse.", "Doar cine este invitat cunoaște o adresă.")}</li>
</ul>
{footer(D, k, ON_DARK)}
{notes(P("Der Server ist das Werkzeug: Damit baut sich jeder Kunde sein eigenes Kommunikationssystem. Er erzeugt immer die volle lizenzierte Zahl an Adressen, höchstens 250. NexonAI hostet nichts.", "Serverul este instrumentul: cu el, fiecare client își construiește propriul sistem de comunicare. Generează întotdeauna numărul complet licențiat de adrese, cel mult 250. NexonAI nu găzduiește nimic."))}''', bg=TEAL, color=ON_DARK, extra="display:flex;flex-direction:column;justify-content:center;gap:40px")))

    # 4 how it works (diagram): app -> 3 servers -> contact
    k = nxt()
    srv = lambda y, name, prov: box(780, y, 380, 130, name, prov, True)
    S.append(("functionare", sec("functionare", f'''{head(P("So funktioniert es", "Cum funcționează"), P("Jede Nachricht liegt auf drei Servern", "Fiecare mesaj stă pe trei servere"))}
{box(128, 560, 340, 140, P("Ihre App", "Aplicația ta"), P("reiner Tor-Client", "doar client Tor"))}
{box(1452, 560, 340, 140, P("Ihr Kontakt", "Contactul tău"), P("holt bei allen 3 ab", "ridică de la toate 3"))}
{srv(330, "Server A", P("Anbieter 1", "Furnizor 1"))}
{srv(560, "Server B", P("Anbieter 2", "Furnizor 2"))}
{srv(790, "Server C", P("Anbieter 3", "Furnizor 3"))}
<x-connector x1="468" y1="610" x2="780" y2="395" head="end" style="color:{MUTED};border-width:3px"></x-connector>
<x-connector x1="468" y1="630" x2="780" y2="625" head="end" style="color:{MUTED};border-width:3px"></x-connector>
<x-connector x1="468" y1="650" x2="780" y2="855" head="end" style="color:{MUTED};border-width:3px"></x-connector>
<x-connector x1="1160" y1="395" x2="1452" y2="610" head="end" style="color:{TEAL};border-width:3px;border-style:dashed"></x-connector>
<x-connector x1="1160" y1="625" x2="1452" y2="630" head="end" style="color:{TEAL};border-width:3px;border-style:dashed"></x-connector>
<x-connector x1="1160" y1="855" x2="1452" y2="650" head="end" style="color:{TEAL};border-width:3px;border-style:dashed"></x-connector>
{lbl(160, 760, 330, P("ablegen in alle 3<br>(nur Sie, Schreibschlüssel)", "depune în toate 3<br>(doar tu, cheie de scriere)"))}
{lbl(1330, 760, 480, P("abholen mit der Paketnummer", "ridică cu numărul de colet"), "left")}
{lbl(780, 960, 380, P("alles über Tor", "totul prin Tor"), "center")}
{footer(D, k)}
{notes(P("Jede Nachricht geht an alle drei Nodes des Kontakts, auf drei verschiedenen Servern. Fällt einer oder fallen sogar zwei aus, ist die Nachricht noch da. Der Kontakt prüft alle drei. Der Rückweg läuft über die Nodes des Kontakts.", "Fiecare mesaj merge la toate cele trei noduri ale contactului, pe trei servere diferite. Dacă unul sau chiar două cad, mesajul este încă acolo. Contactul le verifică pe toate trei. Drumul înapoi trece prin nodurile contactului."))}''')))

    # 5 two keys
    k = nxt()
    S.append(("doua-coduri", sec("doua-coduri", f'''{head(P("Identifikation", "Identificare"), P("Zwei Dinge. Mehr nicht.", "Două lucruri. Nimic mai mult."))}
{row(big(P("Die Paketnummer", "Numărul de colet"), P("Findet das Paket, ohne jemanden zu nennen. Wechselt stündlich, beide Seiten berechnen sie selbst.", "Găsește coletul, fără să numească pe nimeni. Se schimbă în fiecare oră, ambele părți îl calculează singure."), TEAL),
     big(P("Der Schlüssel", "Cheia"), P("Macht den Inhalt lesbar. Nur die beiden Gesprächspartner haben ihn, und er ändert sich bei jeder Nachricht.", "Face conținutul lizibil. Doar cei doi interlocutori o au, iar ea se schimbă la fiecare mesaj."), ORANGE))}
{body(P("Die App weiß nicht, mit wem sie spricht. Sie braucht nur eine Nummer zum Finden und einen Schlüssel zum Entschlüsseln.", "Aplicația nu știe cu cine vorbește. Are nevoie doar de un număr pentru găsire și o cheie pentru decriptare."))}
{footer(D, k)}''', bg=LIGHT2)))

    # 6 what does not exist
    k = nxt()
    S.append(("nu-exista", sec("nu-exista", f'''{head(P("Was es nicht gibt", "Ce nu există"), P("Nichts, was identifiziert", "Nimic care identifică"))}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:28px 64px">
{gone(P("Benutzer-ID", "ID de utilizator"))}
{gone(P("Telefonnummer", "Număr de telefon"))}
{gone(P("Konto", "Cont"))}
{gone(P("Onion-Adresse auf dem Handy", "Adresă onion pe telefon"))}
{gone(P("Anbieter", "Furnizor"))}
{gone(P("Gemeinsames zwischen Kontakten", "Ceva comun între contacte"))}
</div>
{body(P("Jedes Pairing bekommt neue Schlüssel und eigene Nodes. Zwei Kontakte, die ihre QR-Codes vergleichen, finden nichts Gemeinsames.", "Fiecare asociere primește chei noi și noduri proprii. Două contacte care își compară codurile QR nu găsesc nimic în comun."))}
{footer(D, k)}''')))

    # 7 scale
    k = nxt()
    S.append(("sute-noduri", sec("sute-noduri", f'''{head(P("Skalierung", "Scalare"), P("250 Nodes je Server, 3 je Kontakt", "250 de noduri pe server, 3 pe contact"))}
{row(num("250", P("Nodes pro Server, in einem Prozess. Die Zahl legt die Lizenz fest, einstellen lässt sie sich nicht.", "noduri pe server, într-un singur proces. Numărul îl stabilește licența, nu se poate seta."), TEAL),
     num("3", P("eigene Nodes für jeden neuen Kontakt, auf 3 Servern verteilt", "noduri proprii pentru fiecare contact nou, repartizate pe 3 servere"), ORANGE),
     num("250", P("Kontakte mit komplett eigenen Adressen bei 3 Servern", "de contacte cu adrese complet proprii, la 3 servere"), TEAL), gap=64)}
{body(P("Eine Datei pro Server: Die App importiert alle Adressen als Liste und gibt jedem Kontakt seine eigenen. Ein beschlagnahmter Node betrifft nur wenige Kontakte, nicht alle.", "Un fișier pe server: aplicația importă toate adresele ca listă și îi dă fiecărui contact adresele lui. Un nod confiscat afectează doar câteva contacte, nu pe toate."))}
{footer(D, k)}
{notes(P("Gemessen ohne Live-Tor-Netz: 500 Nodes in einem Prozess rund 85 MB RAM. Die Netzlast auf einem echten VPS ist noch nicht gemessen. 250 Kontakte gilt bei drei Servern mit je 250 Nodes, weil jeder Kontakt einen Node je Server bekommt.", "Măsurat fără rețeaua Tor reală: 500 de noduri într-un proces, aproximativ 85 MB RAM. Încărcarea rețelei pe un VPS real nu este încă măsurată. 250 de contacte este valabil la trei servere cu câte 250 de noduri, fiindcă fiecare contact primește un nod pe server."))}''')))

    # 8 resilience (new)
    k = nxt()
    S.append(("rezilienta", sec("rezilienta", f'''{head(P("Ausfallsicherheit", "Reziliență"), P("Drei Server, drei Anbieter, kein Ausfall", "Trei servere, trei furnizori, nicio întrerupere"))}
{row(num("3 × 250", P("750 Adressen auf 3 getrennten Servern", "750 de adrese pe 3 servere separate"), TEAL),
     num("2", P("Server dürfen ausfallen, jede Nachricht kommt an", "servere pot cădea, fiecare mesaj ajunge"), ORANGE),
     num("3", P("Anbieter, gern in verschiedenen Ländern", "furnizori, de preferat în țări diferite"), TEAL), gap=64)}
{body(P("Jede Nachricht geht in alle drei Briefkästen des Kontakts, der Kontakt prüft alle drei. Hosting für drei kleine Server: ab ca. 10 Euro im Monat (Richtwert).", "Fiecare mesaj merge în toate cele trei cutii ale contactului, iar contactul le verifică pe toate trei. Găzduire pentru trei servere mici: de la aproximativ 10 euro pe lună (valoare orientativă)."))}
{footer(D, k)}
{notes(P("Die Empfehlung drei Anbieter, zwei Länder ist Sache des Kunden: Die App kann nicht prüfen, ob drei Server beim selben Hoster liegen. Nach einem Neustart ist jeder Server gesperrt, bis die App ihn freigibt. Solange einer gesperrt ist, tragen die anderen.", "Recomandarea trei furnizori, două țări rămâne la latitudinea clientului: aplicația nu poate verifica dacă trei servere sunt la același furnizor. După o repornire, fiecare server rămâne blocat până când aplicația îl deblochează. Cât timp unul este blocat, ceilalți preiau."))}''', bg=LIGHT2)))

    # 9 lists (new)
    k = nxt()
    S.append(("liste", sec("liste", f'''{head(P("Server-Listen", "Liste de servere"), P("Sie bestimmen, welche Server welche Kontakte tragen", "Dumneavoastră stabiliți ce servere poartă ce contacte"))}
{row(card(P("Liste importieren", "Importați o listă"), P("Der Server speichert seine Adressen als Datei. Die App importiert sie als Liste, zum Beispiel pro Kunde oder Standort.", "Serverul își salvează adresele într-un fișier. Aplicația îl importă ca listă, de exemplu pe client sau pe locație.")),
     card(P("Liste wählen", "Alegeți lista"), P("Beim Hinzufügen eines Kontakts wählen Sie eine Liste. Die App sucht daraus automatisch 3 Nodes aus.", "La adăugarea unui contact alegeți o listă. Aplicația alege automat 3 noduri din ea.")),
     card(P("Mehrere Server pro Liste", "Mai multe servere pe listă"), P("Liegen mehrere Server in einer Liste, haben die drei Nodes eines Kontakts verschiedene Betreiber.", "Dacă o listă conține mai multe servere, cele trei noduri ale unui contact au operatori diferiți."), bg=LIGHT2))}
{body(P("So ist jederzeit nachvollziehbar, welche Server welchen Kontakt tragen.", "Astfel se poate urmări oricând ce servere poartă ce contact."))}
{footer(D, k)}
{notes(P("Eine Liste mit nur einem Server legt alle drei Nodes eines Kontakts auf dieselbe Maschine. Deshalb mehrere Server in eine Liste legen.", "O listă cu un singur server pune toate cele trei noduri ale unui contact pe aceeași mașină. De aceea, mai multe servere într-o listă."))}''')))

    # 10 what the node sees
    k = nxt()
    S.append(("ce-vede", sec("ce-vede", f'''{head("Der Node" if i == 0 else "Nodul", P("Was der Node sieht — und was nicht", "Ce vede nodul și ce nu"))}
{row(card(P("Sieht", "Vede"), P("Verschlüsselte Blöcke fester Größe unter stündlich wechselnden Nummern. Löscht sie selbst nach 1 bis 24 Stunden.", "Blocuri criptate de dimensiune fixă, sub numere care se schimbă din oră în oră. Le șterge singur după 1 până la 24 de ore.")),
     card(P("Sieht nicht", "Nu vede"), P("Den Inhalt. Den Absender. Den Empfänger. Die IP-Adresse. Wer zu wem gehört.", "Conținutul. Expeditorul. Destinatarul. Adresa IP. Cine aparține cui."), bg=DARK, border=DARK, tcolor=ON_DARK, bcolor=ON_DARK_MUTED))}
{body(P("Ein beschlagnahmter oder gestohlener Server enthält nichts Lesbares und läuft nach einem Neustart erst weiter, wenn Ihre App ihn freigibt.", "Un server confiscat sau furat nu conține nimic lizibil și, după o repornire, funcționează din nou doar după ce aplicația dumneavoastră îl deblochează."))}
{footer(D, k)}''')))

    # 11 server in practice (6 cards)
    k = nxt()
    c36 = lambda t, b: card(t, b, pad=32)
    S.append(("server", sec("server", f'''{head(P("Der Server in der Praxis", "Serverul în practică"), P("Installation ohne Kommandozeile", "Instalare fără linie de comandă"))}
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:28px">
{c36(P("Überall", "Oriunde"), P("Windows, Linux, Docker, als .exe oder ein Android-Tablet als Node.", "Windows, Linux, Docker, ca .exe sau o tabletă Android ca nod."))}
{c36(P("Einrichtung", "Configurare"), P("install.bat und start.bat. Die Einrichtungsseite nimmt den Lizenzcode an und zeigt den QR-Code.", "install.bat și start.bat. Pagina de configurare primește codul de licență și afișează codul QR."))}
{c36(P("Liste für die App", "Listă pentru aplicație"), P("Ein Klick speichert alle Adressen des Servers als Datei für die eigene App.", "Un clic salvează toate adresele serverului într-un fișier pentru propria aplicație."))}
{c36(P("Übersicht", "Prezentare generală"), P("Eine eigene Seite zeigt Nodes, Pakete und Auslastung. Nur Mengen, nie Inhalte.", "O pagină proprie arată noduri, colete și încărcare. Doar cantități, niciodată conținut."))}
{c36(P("Profile", "Profile"), P("Standard 6 Stunden, hohe Sicherheit 1 Stunde, offline-tolerant 24 Stunden.", "Standard 6 ore, securitate ridicată 1 oră, tolerant la offline 24 de ore."))}
{c36("Temp Node", P("Nur für ein Gespräch, nur im Arbeitsspeicher. Geschlossen = weg.", "Doar pentru o conversație, doar în memoria de lucru. Închis = dispărut."))}
</div>
{footer(D, k)}''', bg=LIGHT2)))

    # 12 six layers
    k = nxt()
    S.append(("securitate", sec("securitate", f'''{head(P("Eingebaute Sicherheit", "Securitate integrată"), P("Sechs Schichten, kein Versprechen", "Șase straturi, nicio promisiune"))}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px 32px">
{pill(P("Tor verpflichtend", "Tor obligatoriu"), P("Der Node sieht nie eine IP-Adresse.", "Nodul nu vede niciodată o adresă IP."))}
{pill("Proof-of-Work", P("Den Node zu überfluten kostet den Angreifer Rechenleistung.", "Inundarea nodului costă atacatorul putere de calcul."))}
{pill(P("Nur der Besitzer schreibt", "Doar proprietarul scrie"), P("Niemand sonst kann auf Ihren Nodes ablegen.", "Nimeni altcineva nu poate depune pe nodurile dumneavoastră."))}
{pill("Double Ratchet", P("Neue Schlüssel für jede Nachricht, alte bleiben geschützt.", "Chei noi pentru fiecare mesaj, cele vechi rămân protejate."))}
{pill(P("Versiegelte Server-Schlüssel", "Chei de server sigilate"), P("Auf der Platte nur verschlüsselt. Nach einem Neustart gesperrt, bis Ihre App freigibt.", "Pe disc doar criptate. După o repornire, blocate până când aplicația dumneavoastră deblochează."))}
{pill(P("Gleichmäßiger Takt", "Ritm uniform"), P("Die App fragt in festem Rhythmus ab und legt Scheinverkehr ab. Echte Nachrichten fallen nicht auf.", "Aplicația interoghează într-un ritm fix și depune trafic fals. Mesajele reale nu se remarcă."))}
</div>
{footer(D, k)}''', extra="display:flex;flex-direction:column;gap:40px")))

    # 13 compliance by architecture
    k = nxt()
    S.append(("conformitate", sec("conformitate", f'''{eyebrow(P("Compliance durch Architektur", "Conformitate prin arhitectură"), "#F0B27A")}
<h2 style="font-family:{DISPLAY};font-size:72px;font-weight:800;line-height:1.12;color:{ON_DARK}">{P("Es gibt keinen Anbieter, der zur Herausgabe von Daten verpflichtet werden kann.", "Nu există un furnizor care să poată fi obligat să predea date.")}</h2>
<div style="display:flex;gap:48px">
<p style="flex:1;font-size:32px;line-height:1.4;color:{ON_DARK_MUTED}">{P("NexonAI betreibt keine Server und verarbeitet keine Daten im Auftrag des Kunden.", "NexonAI nu operează servere și nu prelucrează date în numele clientului.")}</p>
<p style="flex:1;font-size:32px;line-height:1.4;color:{ON_DARK_MUTED}">{P("Datenschutz durch Technikgestaltung (Art. 25 DSGVO).", "Protecția datelor începând cu momentul conceperii (art. 25 GDPR).")}</p>
<p style="flex:1;font-size:32px;line-height:1.4;color:{ON_DARK_MUTED}">{P("Die Daten bleiben ausschließlich in der eigenen Infrastruktur.", "Datele rămân exclusiv în infrastructura proprie.")}</p>
</div>
{footer(D, k, ON_DARK_MUTED)}
{notes(P("Vorsichtig formulieren: Wir sagen nicht, dass Durchsuchungen oder Anordnungen sinnlos sind. Wir sagen, dass es keinen Anbieter gibt, der etwas herausgeben könnte, und dass ein beschlagnahmter Node nichts Lesbares enthält. Rechtliche Einschätzung durch einen Anwalt bestätigen lassen.", "Formulați prudent: nu spunem că percheziția sau ordinele sunt inutile. Spunem că nu există un furnizor care să poată preda ceva și că un nod confiscat nu conține nimic lizibil. Evaluarea juridică se confirmă cu un avocat."))}''', bg=DARK, color=ON_DARK, extra="display:flex;flex-direction:column;justify-content:center;gap:48px")))

    # 14 licence (new)
    k = nxt()
    tier = lambda nn, c: (f'<div style="flex:1;display:flex;flex-direction:column;gap:8px;background:{CARD};padding:32px;border-top:8px solid {c};border-radius:16px">\n'
        f'<p style="font-family:{DISPLAY};font-size:96px;font-weight:800;line-height:1;color:{c}">{nn}</p>\n'
        f'<p style="font-size:28px;line-height:1.35;color:{DARK}">{P("Nodes pro Server", "noduri pe server")}</p>\n</div>')
    S.append(("licenta", sec("licenta", f'''{head(P("Lizenz", "Licență"), P("Gestaffelt nach Größe, offline geprüft", "Eșalonată pe mărime, verificată offline"))}
{row(tier("5", TEAL), tier("25", ORANGE), tier("100", TEAL), tier("250", ORANGE), gap=24)}
{body(P("Ein Lizenzcode pro Server. Er wird nur auf dem Server geprüft, nichts wird an uns gesendet. Läuft die Lizenz ab, nimmt der Server keine neuen Nachrichten an, vorhandene bleiben abholbar.", "Un cod de licență pe server. Se verifică doar pe server, nimic nu este trimis către noi. Dacă licența expiră, serverul nu mai primește mesaje noi, cele existente rămân disponibile."))}
{body(P("Apps: Lizenz pro Nutzer, Laufzeit von einem Monat bis zu einem Jahr, ebenfalls offline geprüft.", "Aplicații: licență pe utilizator, valabilitate de la o lună până la un an, verificată tot offline."), DARK, 28)}
{footer(D, k)}
{notes(P("Die Staffeln 5, 25, 100, 250 sind geplant, die Preise sind offen. Für den Kunden zählt die Zahl der Kontakte mit eigenen Adressen, nicht die der Nodes. Ein Code lässt sich technisch auf mehreren Servern starten, die Begrenzung auf einen Server steht im Vertrag.", "Eșaloanele 5, 25, 100, 250 sunt planificate, prețurile sunt deschise. Pentru client contează numărul de contacte cu adrese proprii, nu cel al nodurilor. Tehnic, un cod poate porni pe mai multe servere, limitarea la un singur server este prevăzută în contract."))}''', bg=LIGHT2)))

    # 15 for whom
    k = nxt()
    S.append(("pentru-cine", sec("pentru-cine", f'''{head(P("Für wen", "Pentru cine"), P("Überall, wo Vertraulichkeit Pflicht ist", "Oriunde confidențialitatea este obligatorie"))}
{row(small(P("Kanzleien", "Cabinete de avocatură"), P("Mandanten-Kommunikation unter Berufsgeheimnis.", "Comunicare cu clienții sub secret profesional.")),
     small(P("Gesundheit", "Sănătate"), P("Patientendaten ohne Drittanbieter.", "Date despre pacienți fără furnizori terți.")),
     small(P("Steuern", "Fiscalitate"), P("Sensible Finanzunterlagen.", "Documente financiare sensibile.")),
     small(P("Führung", "Conducere"), P("Strategie, Fusionen, Übernahmen.", "Strategie, fuziuni, achiziții.")),
     small(P("Behörden", "Autorități"), P("Interne Kommunikation ohne fremde Cloud.", "Comunicare internă fără cloud străin.")), gap=24)}
{footer(D, k)}''')))

    # 16 status
    k = nxt()
    S.append(("stadiu", sec("stadiu", f'''{head(P("Aktueller Stand", "Stadiul actual"), P("Gebaut und getestet. Nächster Schritt: echte Geräte.", "Construit și testat. Următorul pas: dispozitive reale."))}
{row(card(P("Fertig", "Gata"), P("Server: 70 automatische Tests, echtes Tor. Tablet-Node: 15 Tests. App: 80 Tests in allen 4 Editionen.", "Server: 70 de teste automate, Tor real. Nod pe tabletă: 15 teste. Aplicația: 80 de teste în toate cele 4 ediții.")),
     card(P("Als Nächstes", "Urmează"), P("Test auf echten Geräten. Messung auf einem echten VPS. Unabhängiges Sicherheits-Audit.", "Test pe dispozitive reale. Măsurare pe un VPS real. Audit independent de securitate."), bg=LIGHT2))}
{body(P("Keine Architektur schützt vor einem Handy mit Spionage-Software oder einem Partner, der Screenshots macht.", "Nicio arhitectură nu protejează împotriva unui telefon cu software spion sau a unui partener care face capturi de ecran."), MUTED, 28)}
{footer(D, k)}''', bg=LIGHT)))

    # 17 next steps
    S.append(("pasi", sec("pasi", f'''{eyebrow(P("Nächste Schritte", "Pașii următori"), ON_DARK)}
<h2 style="font-family:{DISPLAY};font-size:96px;font-weight:800;line-height:1.08;color:{ON_DARK}">{P("Ein Pilot.<br>Ihr System.", "Un pilot.<br>Sistemul vostru.")}</h2>
<ol style="font-size:36px;line-height:1.45;color:{ON_DARK}">
<li>{P("Bedarf und Kommunikationswege analysieren", "Analiza nevoilor și a căilor de comunicare")}</li>
<li>{P("Eigene Server und Apps installieren, Lizenz einspielen", "Instalarea serverelor și a aplicațiilor proprii, activarea licenței")}</li>
<li>{P("Pilot mit einem Team, dann ausrollen", "Pilot cu o echipă, apoi extindere")}</li>
</ol>
<p style="font-size:32px;color:{ON_DARK}">NexonAI Consulting SRL · nexonai.consulting@gmail.com · +40 773 829 646</p>''', bg=TEAL, color=ON_DARK, extra="display:flex;flex-direction:column;justify-content:center;gap:40px")))

    sections = {
        "s1": {"description": P("Das Problem: Jeder Messenger hat einen Eigentümer.", "Problema: fiecare mesager are un proprietar."), "start": "cover"},
        "s2": {"description": P("Die Lösung: eigene Server, drei Nodes je Kontakt, zwei Dinge zur Identifikation.", "Soluția: servere proprii, trei noduri pe contact, două lucruri pentru identificare."), "start": "instrumentul"},
        "s3": {"description": P("Ausfallsicherheit, Listen, Sicherheit und Compliance durch Architektur.", "Reziliență, liste, securitate și conformitate prin arhitectură."), "start": "rezilienta"},
        "s4": {"description": P("Lizenz, für wen, Stand und nächste Schritte.", "Licență, pentru cine, stadiu și pașii următori."), "start": "licenta"},
    }
    return S, sections


def build_compliance(lang):
    i = 0 if lang == "de" else 1
    P = lambda de, ro: (de, ro)[i]
    D = "unpruuf Compliance"
    S = []
    n = [0]

    def nxt():
        n[0] += 1
        return n[0]

    box = lambda l, t, w, h, title, sub, main=False: (
        f'<div style="position:absolute;left:{l}px;top:{t}px;width:{w}px;height:{h}px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:4px;'
        f'background:{LIGHT2 if main else CARD};border:{2 if main else 1}px solid {TEAL if main else LINE};border-radius:16px">\n'
        f'<p style="font-family:{DISPLAY};font-size:32px;font-weight:700;color:{DARK};text-align:center">{title}</p>\n'
        f'<p style="font-size:24px;color:{MUTED};text-align:center">{sub}</p>\n</div>')
    lbl = lambda l, t, w, text, align="left": f'<p style="position:absolute;left:{l}px;top:{t}px;width:{w}px;font-size:24px;color:{MUTED};text-align:{align}">{text}</p>'
    gone = lambda t: f'<p style="font-family:{DISPLAY};font-size:56px;font-weight:700;line-height:1.2;color:{DARK};text-decoration:line-through {ORANGE}">{t}</p>'
    body = lambda t, c=MUTED, sz=32: f'<p style="font-size:{sz}px;line-height:1.4;color:{c}">{t}</p>'
    step = lambda nn, t, b, c: (f'<div style="flex:1;display:flex;flex-direction:column;gap:12px;border-top:8px solid {c};padding:32px 0 0 0">\n'
        f'<p style="font-family:{DISPLAY};font-size:72px;font-weight:800;line-height:1;color:{c}">{nn}</p>\n'
        f'<h3 style="font-family:{DISPLAY};font-size:36px;font-weight:700;line-height:1.2;color:{DARK}">{t}</h3>\n'
        f'<p style="font-size:28px;line-height:1.4;color:{MUTED}">{b}</p>\n</div>')
    leg = lambda a, b: (f'<div style="flex:1;display:flex;flex-direction:column;gap:12px;background:{CARD};padding:36px;border-top:8px solid {TEAL};border-radius:12px">\n'
        f'<p style="font-family:{DISPLAY};font-size:36px;font-weight:700;color:{TEAL}">{a}</p>\n<p style="font-size:28px;line-height:1.4;color:{DARK}">{b}</p>\n</div>')

    # 1 cover
    nxt()
    S.append(("cover", sec("cover", f'''<div style="position:absolute;left:0;top:0;width:24px;height:1080px;background:{ORANGE}"></div>
{eyebrow("NexonAI Consulting SRL", ON_DARK_MUTED)}
<div style="flex:1"></div>
<h1 style="font-family:{DISPLAY};font-size:120px;font-weight:800;line-height:1.05;color:{ON_DARK}">unpruuf Compliance</h1>
<p style="font-size:44px;line-height:1.3;color:{ON_DARK}">{P("Anonymer Meldekanal durch Architektur.", "Canal de raportare anonim prin arhitectură.")}</p>
<p style="font-size:32px;line-height:1.4;color:{ON_DARK_MUTED}">{P("Nach EU-Richtlinie 2019/1937 und dem jeweiligen nationalen Gesetz. Betrieben von der Organisation, nicht von einem Anbieter.", "Conform Directivei UE 2019/1937 și legii naționale. Operat de organizație, nu de un furnizor.")}</p>''', bg=DARK, color=ON_DARK, extra="display:flex;flex-direction:column;gap:32px")))

    # 2 obligation
    k = nxt()
    S.append(("obligatia", sec("obligatia", f'''{head(P("Die Pflicht", "Obligația"), P("Interner Meldekanal mit klaren Fristen", "Canal intern de raportare cu termene clare"))}
{body(P("Organisationen mit 50 oder mehr Beschäftigten müssen einen internen Meldekanal anbieten.", "Organizațiile cu 50 sau mai mulți angajați trebuie să ofere un canal intern de raportare."))}
{row(step(P("Tag 0", "Ziua 0"), P("Die Meldung kommt an", "Raportarea sosește"), P("Der Fall öffnet sich im Dashboard, beide Fristen laufen automatisch.", "Cazul se deschide în panou, ambele termene curg automat."), TEAL),
     step(P("7 Tage", "7 zile"), P("Eingangsbestätigung", "Confirmarea primirii"), P("Art. 9 Abs. 1 Buchst. b der Richtlinie.", "Art. 9 alin. (1) lit. b) din directivă."), ORANGE),
     step(P("3 Monate", "3 luni"), P("Rückmeldung an den Hinweisgeber", "Feedback către avertizor"), P("Art. 9 Abs. 1 Buchst. f der Richtlinie.", "Art. 9 alin. (1) lit. f) din directivă."), TEAL), gap=48)}
{footer(D, k)}''')))

    # 3 problem
    k = nxt()
    S.append(("problema", sec("problema", f'''{head(P("Das Problem klassischer Lösungen", "Problema soluțiilor clasice"), P("Anonymität hängt an einem Versprechen", "Anonimatul depinde de o promisiune"))}
{row(card(P("SaaS-Plattformen", "Platforme SaaS"), P("Der Anbieter könnte Inhalt und Metadaten technisch mitlesen.", "Furnizorul ar putea citi tehnic conținutul și metadatele.")),
     card(P("E-Mail und Telefon", "E-mail și telefon"), P("Adresse, Nummer und Uhrzeit verraten den Hinweisgeber.", "Adresa, numărul și ora îl trădează pe avertizor.")),
     card(P("Vertrag", "Contract"), P("Das Vertrauen steckt in einem Dokument, nicht in der Technik.", "Încrederea stă într-un document, nu în tehnică.")))}
{body(P("Wer Repressalien fürchtet, meldet nicht über einen Kanal, dem er vertrauen muss.", "Cine se teme de represalii nu raportează printr-un canal în care trebuie să aibă încredere."))}
{footer(D, k)}''')))

    # 4 tool
    k = nxt()
    S.append(("instrumentul", sec("instrumentul", f'''{eyebrow(P("Das Werkzeug", "Instrumentul"), ON_DARK)}
<h2 style="font-family:{DISPLAY};font-size:96px;font-weight:800;line-height:1.08;color:{ON_DARK}">{P("Ihr Briefkasten.<br>Auf Ihrer Hardware.", "Cutia dumneavoastră poștală.<br>Pe hardware-ul dumneavoastră.")}</h2>
<ul style="font-size:44px;line-height:1.35;color:{ON_DARK}">
<li>{P("Ein Server, Laptop oder Tablet der Organisation.", "Un server, laptop sau tabletă a organizației.")}</li>
<li>{P("NexonAI hostet nichts.", "NexonAI nu găzduiește nimic.")}</li>
<li>{P("Mehrere getrennte Kanäle, jeder mit eigenen Schlüsseln.", "Mai multe canale separate, fiecare cu chei proprii.")}</li>
</ul>
{footer(D, k, ON_DARK)}
{notes(P("Mehrere Kanäle bedeuten mehrere Nodes, jeder mit eigenem Dashboard und eigenen Schlüsseln, zum Beispiel pro Standort oder Abteilung.", "Mai multe canale înseamnă mai multe noduri, fiecare cu panou propriu și chei proprii, de exemplu pe locație sau departament."))}''', bg=TEAL, color=ON_DARK, extra="display:flex;flex-direction:column;justify-content:center;gap:40px")))

    # 5 how it works
    k = nxt()
    S.append(("functionare", sec("functionare", f'''{head(P("So funktioniert es", "Cum funcționează"), P("Der Briefkasten sieht weder Inhalt noch Identität", "Cutia poștală nu vede nici conținutul, nici identitatea"))}
{box(128, 430, 360, 130, P("Melder-App", "Aplicația avertizorului"), P("Android, über Tor", "Android, prin Tor"))}
{box(1432, 430, 360, 130, "Officer-Dashboard" if i == 0 else "Panoul responsabilului", P("Laptop, über Tor", "Laptop, prin Tor"))}
{box(780, 640, 360, 130, P("Ihr Node", "Nodul dumneavoastră"), P("blinder Briefkasten", "cutie poștală oarbă"), True)}
{box(780, 850, 360, 100, "Web-Melder" if i == 0 else "Raportare web", P("Browser, ohne Installation", "Browser, fără instalare"))}
<x-connector x1="488" y1="520" x2="780" y2="680" head="both" style="color:{MUTED};border-width:3px"></x-connector>
<x-connector x1="1432" y1="520" x2="1140" y2="680" head="both" style="color:{MUTED};border-width:3px"></x-connector>
<x-connector x1="960" y1="850" x2="960" y2="770" head="both" style="color:{MUTED};border-width:3px"></x-connector>
{lbl(180, 640, 420, P("meldet, erhält die Fallnummer", "raportează, primește numărul cazului"))}
{lbl(1300, 640, 480, P("holt ab, antwortet", "preia, răspunde"))}
{footer(D, k)}
{notes(P("Es gibt keinen direkten Weg zwischen Hinweisgeber und Officer: alles läuft über den Node der Organisation, Ende-zu-Ende verschlüsselt. Der Hinweisgeber braucht nur den einen QR-Code der Organisation.", "Nu există o cale directă între avertizor și responsabil: totul trece prin nodul organizației, criptat cap la cap. Avertizorul are nevoie doar de codul QR unic al organizației."))}''')))

    # 6 one QR (new)
    k = nxt()
    S.append(("qr-unic", sec("qr-unic", f'''{head(P("Ein Code für alle", "Un singur cod pentru toți"), P("Ein QR-Code für die ganze Organisation", "Un cod QR pentru întreaga organizație"))}
{row(card(P("Aushang statt Einzelcodes", "Afiș în loc de coduri individuale"), P("Der QR-Code hängt am Schwarzen Brett oder steht im Intranet. Jeder Beschäftigte scannt denselben.", "Codul QR stă pe panou sau în intranet. Fiecare angajat scanează același cod.")),
     card(P("Keine Zuordnung möglich", "Nicio asociere posibilă"), P("Ein Code pro Person ließe die Organisation Codes und Personen zuordnen. Genau das darf ein Meldekanal nie erlauben.", "Un cod pe persoană ar permite organizației să lege codurile de persoane. Exact asta nu are voie să permită un canal de raportare.")),
     card(P("Die App erledigt den Rest", "Aplicația face restul"), P("Nach dem Scan sendet die App die Meldung automatisch. Nichts abtippen, nichts kopieren.", "După scanare, aplicația trimite raportarea automat. Nimic de tastat, nimic de copiat."), bg=LIGHT2))}
{footer(D, k)}''')))

    # 7 case number (new)
    k = nxt()
    S.append(("caz", sec("caz", f'''{head(P("Der Fall", "Cazul"), P("Fallnummer und Status auf dem Gerät", "Număr de caz și stare pe dispozitiv"))}
<div style="display:flex;gap:48px;align-items:stretch">
<div style="flex:2;display:flex;flex-direction:column;gap:20px;background:{CARD};padding:40px;border:1px solid {LINE};border-radius:16px">
<p style="font-size:24px;letter-spacing:2px;text-transform:uppercase;color:{MUTED};font-weight:600">{P("Beispiel zur Veranschaulichung", "Exemplu ilustrativ")}</p>
<p style="font-family:{DISPLAY};font-size:64px;font-weight:800;line-height:1;color:{TEAL};white-space:nowrap">HW-7K4M-Q9XD</p>
<p style="font-size:28px;line-height:1.4;color:{DARK}">{P("Eingang bestätigt · in Bearbeitung · abgeschlossen", "Primire confirmată · în lucru · închis")}</p>
</div>
<ul style="flex:3;font-size:32px;line-height:1.45;color:{DARK}">
<li>{P("Die Nummer ist zufällig, nie fortlaufend: sie verrät nicht, wie viele Meldungen es gibt.", "Numărul este aleatoriu, niciodată consecutiv: nu arată câte raportări există.")}</li>
<li>{P("Die Bestätigung kommt automatisch zurück, ohne dass der Hinweisgeber seine Identität nennt.", "Confirmarea se întoarce automat, fără ca avertizorul să-și dezvăluie identitatea.")}</li>
<li>{P("Statusänderungen und Fristen erscheinen in „Meine Fälle“ auf dem Gerät.", "Schimbările de stare și termenele apar în „Cazurile mele” pe dispozitiv.")}</li>
<li>{P("Jeder Fall hat eigene Schlüssel: zwei Meldungen vom selben Handy sehen aus wie zwei verschiedene Personen.", "Fiecare caz are chei proprii: două raportări de pe același telefon arată ca două persoane diferite.")}</li>
</ul>
</div>
{footer(D, k)}
{notes(P("Der Gerätewechsel ist eine Grenze: Wer das Handy verliert, verliert die Fallnummern, außer er hat sie sich notiert.", "Schimbarea dispozitivului este o limită: cine pierde telefonul pierde și numerele de caz, dacă nu le-a notat."))}''', bg=LIGHT2)))

    # 8 what does not exist
    k = nxt()
    S.append(("nu-exista", sec("nu-exista", f'''{head(P("Was es nicht gibt", "Ce nu există"), P("Nichts, was identifiziert", "Nimic care identifică"))}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:28px 64px">
{gone(P("Konto", "Cont"))}
{gone(P("E-Mail-Adresse", "Adresă de e-mail"))}
{gone(P("Telefonnummer", "Număr de telefon"))}
{gone(P("Sichtbares App-Icon", "Pictogramă vizibilă"))}
{gone(P("Code pro Mitarbeiter", "Cod pe angajat"))}
{gone(P("Anbieter, der mitliest", "Furnizor care citește"))}
</div>
{body(P("Die App hat kein sichtbares Icon und kein Branding, damit ein Blick aufs Handy den Hinweisgeber nicht verrät.", "Aplicația nu are pictogramă vizibilă și nici branding, ca o privire pe telefon să nu îl trădeze pe avertizor."))}
{footer(D, k)}''', bg=LIGHT2)))

    # 9 who sees what
    k = nxt()
    S.append(("cine-vede", sec("cine-vede", f'''{head(P("Sicherheitsmodell", "Model de securitate"), P("Wer sieht was", "Cine vede ce"))}
<table style="font-size:28px;color:{DARK}">
<tr><th style="width:40%">{P("Wer", "Cine")}</th><th style="width:15%">{P("Inhalt", "Conținut")}</th><th style="width:15%">{P("Identität", "Identitate")}</th><th style="width:30%">{P("Warum", "De ce")}</th></tr>
<tr><td>{P("Node-Betreiber", "Operatorul nodului")}</td><td>{P("Nein", "Nu")}</td><td>{P("Nein", "Nu")}</td><td>{P("Nur verschlüsselte Blöcke", "Doar blocuri criptate")}</td></tr>
<tr style="background:{LIGHT2}"><td>{P("Netz, Seite des Hinweisgebers", "Rețea, partea avertizorului")}</td><td>{P("Nein", "Nu")}</td><td>{P("Nein", "Nu")}</td><td>Tor</td></tr>
<tr><td>{P("Netz, Seite des Officers", "Rețea, partea responsabilului")}</td><td>{P("Nein", "Nu")}</td><td>{P("Nein", "Nu")}</td><td>Tor</td></tr>
<tr style="background:{LIGHT2}"><td>{P("Netz, Web-Melder", "Rețea, raportare web")}</td><td>{P("Nein", "Nu")}</td><td>{P("Teilweise", "Parțial")}</td><td>{P("Kein Tor standardmäßig", "Fără Tor implicit")}</td></tr>
<tr><td>{P("Compliance-Officer", "Responsabil de conformitate")}</td><td>{P("Ja", "Da")}</td><td>{P("Nur wenn genannt", "Doar dacă este indicată")}</td><td>{P("Lokal verschlüsselte Fallakte", "Dosar criptat local")}</td></tr>
</table>
{footer(D, k)}''')))

    # 10 dashboard
    k = nxt()
    mrow = lambda a, b, c, d, bg: f'<tr style="background:{bg}"><td>{a}</td><td>{b}</td><td>{c}</td><td>{d}</td></tr>'
    S.append(("panou", sec("panou", f'''{head("Officer-Dashboard" if i == 0 else "Panoul responsabilului", P("Fallakten mit Fristen, nicht nur ein Chat", "Dosare de caz cu termene, nu doar un chat"))}
<div style="display:flex;gap:48px">
<div style="flex:3;display:flex;flex-direction:column;gap:16px;background:{CARD};padding:32px;border:1px solid {LINE};border-radius:16px">
<p style="font-size:24px;letter-spacing:2px;text-transform:uppercase;color:{MUTED};font-weight:600">{P("Beispiel zur Veranschaulichung", "Exemplu ilustrativ")}</p>
<table style="font-size:26px;color:{DARK}">
<tr><th style="width:26%">{P("Fall", "Caz")}</th><th style="width:24%">Status</th><th style="width:25%">{P("Bestätigung", "Confirmare")}</th><th style="width:25%">{P("Rückmeldung", "Feedback")}</th></tr>
{mrow("HW-…-A", P("Neu", "Nou"), P("noch 6 Tage", "încă 6 zile"), P("noch 89 Tage", "încă 89 de zile"), CARD)}
{mrow("HW-…-B", P("Bestätigt", "Confirmat"), P("erledigt", "îndeplinit"), P("noch 61 Tage", "încă 61 de zile"), LIGHT2)}
{mrow("HW-…-C", P("In Arbeit", "În lucru"), P("erledigt", "îndeplinit"), P("noch 12 Tage", "încă 12 zile"), CARD)}
</table>
</div>
<ul style="flex:2;font-size:32px;line-height:1.45;color:{DARK}">
<li>{P("Fälle entstehen automatisch, mit Fallnummer", "Cazurile apar automat, cu număr de caz")}</li>
<li>{P("Fristen starten automatisch", "Termenele pornesc automat")}</li>
<li>{P("Status wird an das Gerät zurückgemeldet", "Starea este raportată înapoi pe dispozitiv")}</li>
<li>{P("Lokal verschlüsselt, mit Passwort geschützt", "Criptat local, protejat cu parolă")}</li>
</ul>
</div>
{footer(D, k)}''', bg=LIGHT2)))

    # 11 two ways
    k = nxt()
    S.append(("doua-cai", sec("doua-cai", f'''{head(P("Zwei Meldewege", "Două căi de raportare"), P("Maximaler Schutz oder ohne Installation", "Protecție maximă sau fără instalare"))}
{row(card(P("Die App", "Aplicația"), P("Über Tor, Nachrichten nur im Arbeitsspeicher, kein sichtbares Icon. Empfohlen bei Risiko von Repressalien.", "Prin Tor, mesaje doar în memoria de lucru, fără pictogramă vizibilă. Recomandată când există risc de represalii.")),
     card(P("Der Browser", "Browserul"), P("Ohne Installation, gleiche Verschlüsselung. Schwächerer Schutz: kein Tor standardmäßig. Sichtbarer Warnhinweis.", "Fără instalare, aceeași criptare. Protecție mai slabă: fără Tor implicit. Avertisment vizibil."), bg=LIGHT2))}
{footer(D, k)}''')))

    # 12 legal
    k = nxt()
    S.append(("cadru-legal", sec("cadru-legal", f'''{head(P("Rechtsrahmen", "Cadrul legal"), P("Software, die den Prozess unterstützt", "Software care sprijină procesul"))}
{row(leg("Art. 9 (1) b)", P("Eingangsbestätigung in 7 Tagen: Frist wird automatisch berechnet.", "Confirmarea primirii în 7 zile: termenul se calculează automat.")),
     leg("Art. 9 (1) f)", P("Rückmeldung in 3 Monaten: Frist wird automatisch berechnet.", "Feedback în 3 luni: termenul se calculează automat.")),
     leg("Art. 16", P("Vertraulichkeit der Identität: durch die Architektur.", "Confidențialitatea identității: prin arhitectură.")))}
{body(P("Keine Rechtsberatung und keine Zertifizierung. Ob das nationale Umsetzungsgesetz vollständig erfüllt ist, bestätigt die Rechtsabteilung der Organisation.", "Nu este consultanță juridică și nici certificare. Dacă legea națională de transpunere este îndeplinită complet, confirmă departamentul juridic al organizației."), MUTED, 28)}
{footer(D, k)}''')))

    # 13 installation
    k = nxt()
    S.append(("instalare", sec("instalare", f'''{head(P("Installation", "Instalare"), P("Drei Schritte, ohne Kommandozeile", "Trei pași, fără linie de comandă"))}
{row(step("1", P("Der Node", "Nodul"), P("install.bat und start.bat auf einem Server, Laptop oder Android-Tablet. Lizenzcode auf der Einrichtungsseite eintragen.", "install.bat și start.bat pe un server, laptop sau tabletă Android. Codul de licență se introduce pe pagina de configurare."), TEAL),
     step("2", P("Das Dashboard", "Panoul"), P("install.bat und start.bat auf dem Laptop des Officers.", "install.bat și start.bat pe laptopul responsabilului."), ORANGE),
     step("3", P("Bekanntmachen", "Comunicare"), P("Den einen QR-Code der Organisation aushängen oder ins Intranet stellen.", "Codul QR unic al organizației se afișează sau se pune în intranet."), TEAL), gap=48)}
{footer(D, k)}''', bg=LIGHT2)))

    # 14 status
    k = nxt()
    S.append(("stadiu", sec("stadiu", f'''{head(P("Aktueller Stand", "Stadiul actual"), P("Getestet. Nächster Schritt: echte Geräte.", "Testat. Următorul pas: dispozitive reale."))}
{row(card(P("Fertig", "Gata"), P("Verschlüsselung Byte für Byte geprüft. Zwei unabhängige Umsetzungen gegeneinander getestet. Meldung, Fallnummer und Status laufen zwischen App, Browser und Dashboard. App: 80 Tests.", "Criptarea verificată octet cu octet. Două implementări independente testate una față de cealaltă. Raportarea, numărul de caz și starea circulă între aplicație, browser și panou. Aplicația: 80 de teste.")),
     card(P("Als Nächstes", "Urmează"), P("Test auf echten Geräten. Zugang für mehrere Officer. Export von Fällen. Unabhängiges Audit.", "Test pe dispozitive reale. Acces pentru mai mulți responsabili. Export de cazuri. Audit independent."), bg=LIGHT2))}
{footer(D, k)}''')))

    # 15 next steps
    S.append(("pasi", sec("pasi", f'''{eyebrow(P("Nächste Schritte", "Pașii următori"), ON_DARK)}
<h2 style="font-family:{DISPLAY};font-size:96px;font-weight:800;line-height:1.08;color:{ON_DARK}">{P("Ein Pilot.<br>Ihr Kanal.", "Un pilot.<br>Canalul vostru.")}</h2>
<ol style="font-size:36px;line-height:1.45;color:{ON_DARK}">
<li>{P("Anforderungen und internen Prozess analysieren", "Analiza cerințelor și a procesului intern")}</li>
<li>{P("Node und Dashboard installieren", "Instalarea nodului și a panoului")}</li>
<li>{P("Pilot, dann Start für die Beschäftigten", "Pilot, apoi lansare pentru angajați")}</li>
</ol>
<p style="font-size:32px;color:{ON_DARK}">NexonAI Consulting SRL · nexonai.consulting@gmail.com · +40 773 829 646</p>''', bg=TEAL, color=ON_DARK, extra="display:flex;flex-direction:column;justify-content:center;gap:40px")))

    sections = {
        "s1": {"description": P("Die gesetzliche Pflicht und das Problem klassischer Lösungen.", "Obligația legală și problema soluțiilor clasice."), "start": "cover"},
        "s2": {"description": P("Die Lösung: der Node der Organisation, ein QR-Code für alle, nichts, was identifiziert.", "Soluția: nodul organizației, un cod QR pentru toți, nimic care identifică."), "start": "instrumentul"},
        "s3": {"description": P("Sicherheitsmodell, Dashboard, Meldewege und Rechtsrahmen.", "Model de securitate, panou, căi de raportare și cadru legal."), "start": "cine-vede"},
        "s4": {"description": P("Installation, Stand und nächste Schritte.", "Instalare, stadiu și pașii următori."), "start": "instalare"},
    }
    return S, sections


if __name__ == "__main__":
    for lang, bf, cf, bt, ct in (
        ("de", "business_de", "compliance_de", "unpruuf Business (DE)", "unpruuf Compliance (DE)"),
        ("ro", "business", "compliance", "unpruuf Business", "unpruuf Compliance"),
    ):
        import shutil
        for folder in (bf, cf):
            shutil.rmtree(os.path.join(folder, "project", "slides"), ignore_errors=True)
        S, sec_ = build_business(lang)
        print(bf, write_deck(bf, bt, S, sec_))
        S, sec_ = build_compliance(lang)
        print(cf, write_deck(cf, ct, S, sec_))
