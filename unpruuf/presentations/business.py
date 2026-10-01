from common import *
D = "unpruuf Business"
S = []

# 1 cover
S.append(("cover", sec("cover", f'''<div style="position:absolute;left:0;top:0;width:24px;height:1080px;background:{TEAL}"></div>
{eyebrow("NexonAI Consulting SRL", ON_DARK_MUTED)}
<div style="flex:1"></div>
<h1 style="font-family:{DISPLAY};font-size:120px;font-weight:800;line-height:1.05;color:{ON_DARK}">unpruuf Business</h1>
<p style="font-size:44px;line-height:1.3;color:{ON_DARK}">Sistemul tău de comunicare. Al nimănui altcuiva.</p>
<p style="font-size:32px;line-height:1.4;color:{ON_DARK_MUTED}">Fără furnizor. Fără cont. Fără ID. Infrastructura ta, cheile tale, nodurile tale.</p>
{notes("Mesajul central: nu vindem un serviciu de mesagerie. Construim pentru client propriul sistem de comunicare, pe care NexonAI nu îl operează.")}''', bg=DARK, color=ON_DARK, extra="display:flex;flex-direction:column;gap:32px")))

# 2 problem
S.append(("problema", sec("problema", f'''{head("Problema", "Fiecare mesager are un proprietar")}
{row(card("Serverul furnizorului", "Toate mesajele trec prin infrastructura altcuiva."),
     card("Cont și număr de telefon", "Fiecare utilizator este identificabil de la prima zi."),
     card("Metadate", "Cine, cu cine, când și cât de des — vizibil pentru furnizor."))}
<p style="font-size:32px;line-height:1.4;color:{MUTED}">Chiar și cu criptare cap la cap, furnizorul rămâne a treia parte care poate fi obligată să predea date.</p>
{footer(D, 2)}''')))

# 3 tool (statement)
S.append(("instrumentul", sec("instrumentul", f'''{eyebrow("Instrumentul", ON_DARK)}
<h2 style="font-family:{DISPLAY};font-size:96px;font-weight:800;line-height:1.08;color:{ON_DARK}">Serverul tău.<br>Sute de noduri proprii.</h2>
<ul style="font-size:44px;line-height:1.35;color:{ON_DARK}">
<li>Nicăieri înregistrate.</li>
<li>Doar tu poți scrie pe ele.</li>
<li>Doar cine este invitat cunoaște o adresă.</li>
</ul>
{footer(D, 3, ON_DARK)}
{notes("Serverul este instrumentul: cu el, fiecare utilizator își creează propriul sistem de comunicare anonim. NexonAI nu găzduiește nimic.")}''', bg=TEAL, color=ON_DARK, extra="display:flex;flex-direction:column;justify-content:center;gap:40px")))

# 4 how it works (diagram)
box = lambda l, t, w, h, title, sub, main=False: (
    f'<div style="position:absolute;left:{l}px;top:{t}px;width:{w}px;height:{h}px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:4px;'
    f'background:{LIGHT2 if main else CARD};border:{2 if main else 1}px solid {TEAL if main else LINE};border-radius:16px">\n'
    f'<p style="font-family:{DISPLAY};font-size:36px;font-weight:700;color:{DARK};text-align:center">{title}</p>\n'
    f'<p style="font-size:24px;color:{MUTED};text-align:center">{sub}</p>\n</div>')
lbl = lambda l, t, w, text, align="left": f'<p style="position:absolute;left:{l}px;top:{t}px;width:{w}px;font-size:24px;color:{MUTED};text-align:{align}">{text}</p>'
S.append(("functionare", sec("functionare", f'''{head("Cum funcționează", "Fiecare scrie doar pe nodurile sale")}
{box(128, 520, 360, 140, "Telefon A", "doar client Tor")}
{box(1432, 520, 360, 140, "Telefon B", "doar client Tor")}
{box(780, 330, 360, 140, "Nodurile lui A", "adresă onion fixă", True)}
{box(780, 720, 360, 140, "Nodurile lui B", "adresă onion fixă", True)}
<x-connector x1="488" y1="560" x2="780" y2="420" head="end" style="color:{MUTED};border-width:3px"></x-connector>
<x-connector x1="1140" y1="420" x2="1432" y2="560" head="end" style="color:{MUTED};border-width:3px"></x-connector>
<x-connector x1="1432" y1="620" x2="1140" y2="770" head="end" style="color:{MUTED};border-width:3px"></x-connector>
<x-connector x1="780" y1="770" x2="488" y2="620" head="end" style="color:{MUTED};border-width:3px"></x-connector>
{lbl(220, 425, 380, "depune (cheie de scriere)")}
{lbl(1300, 425, 380, "preia (cod de preluare)")}
{lbl(1300, 745, 420, "depune (cheie de scriere)")}
{lbl(180, 745, 380, "preia (cod de preluare)")}
{lbl(780, 572, 360, "totul prin Tor", "center")}
{footer(D, 4)}
{notes("A scrie pe nodurile proprii, B preia de acolo. Drumul înapoi trece prin nodurile lui B. Nimeni nu scrie pe nodurile altcuiva.")}''')))

# 5 two codes
big = lambda title, body, accent: (f'<div style="flex:1;display:flex;flex-direction:column;gap:20px;background:{CARD};padding:48px;border-top:8px solid {accent};border-radius:16px">\n'
    f'<h3 style="font-family:{DISPLAY};font-size:44px;font-weight:700;line-height:1.15;color:{DARK}">{title}</h3>\n'
    f'<p style="font-size:32px;line-height:1.4;color:{MUTED}">{body}</p>\n</div>')
S.append(("doua-coduri", sec("doua-coduri", f'''{head("Identificare", "Două coduri. Atât.")}
{row(big("Codul de preluare", "Găsește mesajul fără să numească pe nimeni. Se schimbă din oră în oră, calculat independent de ambele părți.", TEAL),
     big("Cheia de decriptare", "Face conținutul lizibil. O au doar cei doi parteneri de conversație — nimeni altcineva.", ORANGE))}
<p style="font-size:32px;line-height:1.4;color:{MUTED}">Aplicația nu știe cu cine vorbește. Are nevoie doar de un cod pentru a găsi și de unul pentru a decripta.</p>
{footer(D, 5)}''', bg=LIGHT2)))

# 6 what does not exist
gone = lambda t: f'<p style="font-family:{DISPLAY};font-size:56px;font-weight:700;line-height:1.2;color:{DARK};text-decoration:line-through {ORANGE}">{t}</p>'
S.append(("nu-exista", sec("nu-exista", f'''{head("Ce nu există", "Nimic de identificat")}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:28px 64px">
{gone("ID de utilizator")}
{gone("Număr de telefon")}
{gone("Cont")}
{gone("Adresă onion pe telefon")}
{gone("Furnizor")}
{gone("Lucruri comune între contacte")}
</div>
<p style="font-size:32px;line-height:1.4;color:{MUTED}">Fiecare asociere primește chei noi și noduri proprii. Doi contacți care își compară codurile QR nu găsesc nimic comun.</p>
{footer(D, 6)}''')))

# 7 hundreds of nodes
num = lambda n, t, c: (f'<div style="flex:1;display:flex;flex-direction:column;gap:12px">\n'
    f'<p style="font-family:{DISPLAY};font-size:120px;font-weight:800;line-height:1;color:{c}">{n}</p>\n'
    f'<p style="font-size:32px;line-height:1.35;color:{DARK}">{t}</p>\n</div>')
S.append(("sute-noduri", sec("sute-noduri", f'''{head("Scalare", "Sute de noduri, câte 3 pentru fiecare contact")}
{row(num("500", "noduri pe un singur server, într-un singur proces", TEAL),
     num("3", "noduri proprii pentru fiecare contact nou", ORANGE),
     num("0", "lucruri comune între doi contacți, cu un grup suficient de mare", TEAL), gap=64)}
<p style="font-size:32px;line-height:1.4;color:{MUTED}">O singură scanare QR per server: aplicația preia singură celelalte noduri și dă fiecărui contact nodurile lui. Un nod confiscat atinge doar câțiva contacți, nu pe toți.</p>
{footer(D, 7)}
{notes("Măsurat fără rețeaua Tor live: 500 de noduri într-un proces aproximativ 85 MB RAM. Sarcina de rețea pe un VPS real urmează să fie măsurată.")}''')))

# 8 what the node sees
S.append(("ce-vede", sec("ce-vede", f'''{head("Nodul", "Ce vede nodul — și ce nu")}
{row(card("Vede", "Blocuri criptate de mărime fixă, sub coduri care se schimbă din oră în oră. Le șterge singur după 1 până la 24 de ore.", bg=CARD),
     card("Nu vede", "Conținutul. Expeditorul. Destinatarul. Adresa IP. Cine aparține de cine.", bg=DARK, border=DARK, tcolor=ON_DARK, bcolor=ON_DARK_MUTED))}
<p style="font-size:32px;line-height:1.4;color:{MUTED}">Un nod confiscat nu conține nimic de citit.</p>
{footer(D, 8)}''')))

# 9 server in practice
S.append(("server", sec("server", f'''{head("Serverul în practică", "Instalare fără linie de comandă")}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:32px">
{card("Oriunde", "Windows, Linux, Docker, fișier .exe sau o tabletă Android ca nod.", pad=36)}
{card("Configurare", "install.bat și start.bat. Pagina de configurare arată codul QR pentru propria aplicație.", pad=36)}
{card("Profiluri", "Standard 6 ore, securitate ridicată 1 oră, tolerant offline 24 de ore.", pad=36)}
{card("Nod temporar", "Doar pentru o conversație, doar în memorie. Închis = dispărut.", pad=36)}
</div>
{footer(D, 9)}''', bg=LIGHT2)))

# 10 security built in
pill = lambda t, b: (f'<div style="display:flex;flex-direction:column;gap:8px;padding:28px 32px;background:{CARD};border-left:8px solid {TEAL};border-radius:12px">\n'
    f'<h3 style="font-family:{DISPLAY};font-size:36px;font-weight:700;color:{DARK}">{t}</h3>\n<p style="font-size:28px;line-height:1.35;color:{MUTED}">{b}</p>\n</div>')
S.append(("securitate", sec("securitate", f'''{head("Securitate integrată", "Cinci straturi, nicio promisiune")}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px 32px">
{pill("Tor obligatoriu", "Nodul nu vede niciodată o adresă IP.")}
{pill("Proof-of-Work", "Supraîncărcarea nodului costă atacatorul putere de calcul.")}
{pill("Scriere doar de proprietar", "Nimeni altcineva nu poate depune pe nodurile tale.")}
{pill("Double Ratchet", "Chei noi pentru fiecare mesaj, mesajele vechi rămân protejate.")}
{pill("Chei proprii per contact", "Fiecare asociere are propriile chei și noduri.")}
</div>
{footer(D, 10)}''', extra="display:flex;flex-direction:column;gap:40px")))

# 11 compliance by architecture
S.append(("conformitate", sec("conformitate", f'''{eyebrow("Conformitate prin arhitectură", "#F0B27A")}
<h2 style="font-family:{DISPLAY};font-size:72px;font-weight:800;line-height:1.12;color:{ON_DARK}">Nu există niciun furnizor care să poată fi obligat să predea date.</h2>
<div style="display:flex;gap:48px">
<p style="flex:1;font-size:32px;line-height:1.4;color:{ON_DARK_MUTED}">NexonAI nu găzduiește nimic și nu prelucrează date în numele clientului.</p>
<p style="flex:1;font-size:32px;line-height:1.4;color:{ON_DARK_MUTED}">Protecția datelor din faza de proiectare (art. 25 GDPR).</p>
<p style="flex:1;font-size:32px;line-height:1.4;color:{ON_DARK_MUTED}">Datele rămân exclusiv în infrastructura proprie.</p>
</div>
{footer(D, 11, ON_DARK_MUTED)}
{notes("Formulare atentă: nu spunem că citațiile sau ordinele judecătorești sunt inutile. Spunem că nu există un furnizor care să predea ceva și că un nod confiscat nu conține nimic lizibil.")}''', bg=DARK, color=ON_DARK, extra="display:flex;flex-direction:column;justify-content:center;gap:48px")))

# 12 for whom
small = lambda t, b: (f'<div style="flex:1;display:flex;flex-direction:column;gap:12px;background:{CARD};padding:32px;border:1px solid {LINE};border-radius:16px">\n'
    f'<h3 style="font-family:{DISPLAY};font-size:36px;font-weight:700;line-height:1.15;color:{DARK}">{t}</h3>\n<p style="font-size:26px;line-height:1.4;color:{MUTED}">{b}</p>\n</div>')
S.append(("pentru-cine", sec("pentru-cine", f'''{head("Pentru cine", "Oriunde confidențialitatea este o obligație")}
{row(small("Avocați", "Comunicare cu clienții protejată de secretul profesional."),
     small("Sănătate", "Date medicale fără furnizor terț."),
     small("Fiscal", "Documente financiare sensibile."),
     small("Conducere", "Decizii strategice, fuziuni, achiziții."),
     small("Autorități", "Comunicare internă fără cloud străin."), gap=24)}
{footer(D, 12)}''')))

# 13 status
S.append(("stadiu", sec("stadiu", f'''{head("Stadiu actual", "Construit și testat. Următorul pas: dispozitive reale.")}
{row(card("Gata", "Server: 41 de teste automate, Tor real. Aplicație: 59 de teste în toate cele 4 ediții. Nod pe tabletă: 9 teste."),
     card("Urmează", "Test pe dispozitive reale. Măsurarea pe un VPS real. Audit de securitate independent.", bg=LIGHT2))}
<p style="font-size:28px;line-height:1.4;color:{MUTED}">Nicio arhitectură nu protejează un telefon compromis de programe spion sau un partener care face capturi de ecran.</p>
{footer(D, 13)}''', bg=LIGHT)))

# 14 next steps
S.append(("pasi", sec("pasi", f'''{eyebrow("Pașii următori", ON_DARK)}
<h2 style="font-family:{DISPLAY};font-size:96px;font-weight:800;line-height:1.08;color:{ON_DARK}">Un pilot.<br>Sistemul vostru.</h2>
<ol style="font-size:36px;line-height:1.45;color:{ON_DARK}">
<li>Analiza nevoilor și a fluxurilor de comunicare</li>
<li>Instalarea serverului propriu și a aplicațiilor</li>
<li>Pilot cu o echipă, apoi extindere</li>
</ol>
<p style="font-size:32px;color:{ON_DARK}">NexonAI Consulting SRL · nexonai.consulting@gmail.com · [telefon]</p>''', bg=TEAL, color=ON_DARK, extra="display:flex;flex-direction:column;justify-content:center;gap:40px")))

sections = {
    "s1": {"description": "Problema: fiecare mesager are un proprietar.", "start": "cover"},
    "s2": {"description": "Soluția: serverul propriu, nodurile proprii, două coduri.", "start": "instrumentul"},
    "s3": {"description": "Securitate și conformitate prin arhitectură.", "start": "ce-vede"},
    "s4": {"description": "Pentru cine, stadiu actual și pașii următori.", "start": "pentru-cine"},
}
print(write_deck("business", "unpruuf Business", S, sections))
