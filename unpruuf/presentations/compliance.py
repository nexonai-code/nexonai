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
<p style="font-size:44px;line-height:1.3;color:{ON_DARK}">Canal de raportare anonim prin arhitectură.</p>
<p style="font-size:32px;line-height:1.4;color:{ON_DARK_MUTED}">Conform Directivei (UE) 2019/1937 și Legii nr. 361/2022. Operat de organizație, nu de un furnizor.</p>''', bg=DARK, color=ON_DARK, extra="display:flex;flex-direction:column;gap:32px")))

# 2 obligation (timeline)
step = lambda n, t, b, c: (f'<div style="flex:1;display:flex;flex-direction:column;gap:12px;border-top:8px solid {c};padding:32px 0 0 0">\n'
    f'<p style="font-family:{DISPLAY};font-size:72px;font-weight:800;line-height:1;color:{c}">{n}</p>\n'
    f'<h3 style="font-family:{DISPLAY};font-size:36px;font-weight:700;line-height:1.2;color:{DARK}">{t}</h3>\n'
    f'<p style="font-size:28px;line-height:1.4;color:{MUTED}">{b}</p>\n</div>')
S.append(("obligatia", sec("obligatia", f'''{head("Obligația", "Canal intern de raportare, cu termene clare")}
<p style="font-size:32px;line-height:1.4;color:{MUTED}">Organizațiile cu 50 sau mai mulți angajați trebuie să ofere un canal intern de raportare.</p>
{row(step("Ziua 0", "Raportul sosește", "Cazul se deschide în panou, cu ambele termene pornite automat.", TEAL),
     step("7 zile", "Confirmarea primirii", "Art. 9 alin. (1) lit. b) din directivă.", ORANGE),
     step("3 luni", "Răspuns către avertizor", "Art. 9 alin. (1) lit. f) din directivă.", TEAL), gap=48)}
{footer(D, 2)}''')))

# 3 problem
S.append(("problema", sec("problema", f'''{head("Problema soluțiilor clasice", "Anonimatul depinde de o promisiune")}
{row(card("Platforme SaaS", "Furnizorul ar putea citi tehnic conținutul și metadatele."),
     card("E-mail și telefon", "Adresa, numărul și ora apelului identifică avertizorul."),
     card("Contract", "Încrederea stă într-un document, nu în tehnologie."))}
<p style="font-size:32px;line-height:1.4;color:{MUTED}">Cine se teme de represalii nu raportează pe un canal în care trebuie să aibă încredere.</p>
{footer(D, 3)}''')))

# 4 tool (statement)
S.append(("instrumentul", sec("instrumentul", f'''{eyebrow("Instrumentul", ON_DARK)}
<h2 style="font-family:{DISPLAY};font-size:96px;font-weight:800;line-height:1.08;color:{ON_DARK}">Releul vostru.<br>Pe hardware-ul vostru.</h2>
<ul style="font-size:44px;line-height:1.35;color:{ON_DARK}">
<li>O tabletă sau un laptop al organizației.</li>
<li>NexonAI nu găzduiește nimic.</li>
<li>Mai multe canale separate, fiecare cu cheile lui.</li>
</ul>
{footer(D, 4, ON_DARK)}
{notes("Mai multe canale înseamnă mai multe relee, fiecare cu propriul panou și propriile chei, de exemplu pe sedii sau departamente.")}''', bg=TEAL, color=ON_DARK, extra="display:flex;flex-direction:column;justify-content:center;gap:40px")))

# 5 how it works
S.append(("functionare", sec("functionare", f'''{head("Cum funcționează", "Releul nu vede nici conținut, nici identitate")}
{box(128, 400, 360, 110, "Aplicația avertizor", "Android, prin Tor")}
{box(1432, 400, 360, 110, "Panoul responsabilului", "laptop, prin Tor")}
{box(780, 580, 360, 110, "Releul organizației", "cutie poștală oarbă", True)}
{box(800, 790, 320, 100, "Raportor web", "browser, fără instalare")}
<x-connector x1="488" y1="440" x2="1432" y2="440" head="end" style="color:{MUTED};border-width:3px;border-style:dashed"></x-connector>
<x-connector x1="488" y1="490" x2="780" y2="620" head="both" style="color:{MUTED};border-width:3px"></x-connector>
<x-connector x1="1432" y1="490" x2="1140" y2="620" head="both" style="color:{MUTED};border-width:3px"></x-connector>
<x-connector x1="960" y1="790" x2="960" y2="690" head="both" style="color:{MUTED};border-width:3px"></x-connector>
{lbl(700, 390, 520, "cod de asociere, o singură dată", "center")}
{lbl(260, 600, 360, "trimite / preia")}
{lbl(1300, 600, 360, "trimite / preia")}
{footer(D, 5)}
{notes("Singura excepție de la releu: codul de asociere, schimbat o singură dată la deschiderea cazului. După aceea totul trece prin releu, criptat cap la cap.")}''')))

# 6 what does not exist
S.append(("nu-exista", sec("nu-exista", f'''{head("Ce nu există", "Nimic de identificat")}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:28px 64px">
{gone("Cont")}
{gone("Adresă de e-mail")}
{gone("Număr de telefon")}
{gone("Pictogramă vizibilă pe telefon")}
{gone("Adresă onion pe telefon")}
{gone("Furnizor care citește")}
</div>
<p style="font-size:32px;line-height:1.4;color:{MUTED}">Aplicația nu are pictogramă sau marcă vizibilă, ca o privire pe telefon să nu trădeze avertizorul.</p>
{footer(D, 6)}''', bg=LIGHT2)))

# 7 who sees what (table)
S.append(("cine-vede", sec("cine-vede", f'''{head("Model de securitate", "Cine vede ce")}
<table style="font-size:28px;color:{DARK}">
<tr><th style="width:40%">Cine</th><th style="width:15%">Conținut</th><th style="width:15%">Identitate</th><th style="width:30%">De ce</th></tr>
<tr><td>Operatorul releului</td><td>Nu</td><td>Nu</td><td>Doar blocuri criptate</td></tr>
<tr style="background:{LIGHT2}"><td>Rețea, partea avertizorului</td><td>Nu</td><td>Nu</td><td>Tor</td></tr>
<tr><td>Rețea, partea responsabilului</td><td>Nu</td><td>Nu</td><td>Tor</td></tr>
<tr style="background:{LIGHT2}"><td>Rețea, raportor web</td><td>Nu</td><td>Parțial</td><td>Fără Tor implicit</td></tr>
<tr><td>Responsabilul de conformitate</td><td>Da</td><td>Nu, doar dacă o spune avertizorul</td><td>Dosar local criptat</td></tr>
</table>
{footer(D, 7)}''')))

# 8 dashboard (mock, marked as example)
mrow = lambda a, b, c, d, bg: f'<tr style="background:{bg}"><td>{a}</td><td>{b}</td><td>{c}</td><td>{d}</td></tr>'
S.append(("panou", sec("panou", f'''{head("Panoul responsabilului", "Dosare cu termene, nu doar un chat")}
<div style="display:flex;gap:48px">
<div style="flex:3;display:flex;flex-direction:column;gap:16px;background:{CARD};padding:32px;border:1px solid {LINE};border-radius:16px">
<p style="font-size:24px;letter-spacing:2px;text-transform:uppercase;color:{MUTED};font-weight:600">Exemplu ilustrativ</p>
<table style="font-size:26px;color:{DARK}">
<tr><th style="width:22%">Caz</th><th style="width:26%">Stare</th><th style="width:26%">Confirmare</th><th style="width:26%">Răspuns</th></tr>
{mrow("[Caz 1]", "Nou", "încă 6 zile", "încă 89 zile", CARD)}
{mrow("[Caz 2]", "Confirmat", "făcut", "încă 61 zile", LIGHT2)}
{mrow("[Caz 3]", "În lucru", "făcut", "încă 12 zile", CARD)}
</table>
</div>
<ul style="flex:2;font-size:32px;line-height:1.45;color:{DARK}">
<li>Termenele pornesc automat</li>
<li>Stare: Nou, Confirmat, În lucru, Închis</li>
<li>Criptat local, protejat prin parolă</li>
<li>Integral în limba română</li>
</ul>
</div>
{footer(D, 8)}''', bg=LIGHT2)))

# 9 two ways to report
S.append(("doua-cai", sec("doua-cai", f'''{head("Două căi de raportare", "Protecție maximă sau fără instalare")}
{row(card("Aplicația", "Prin Tor, mesajele doar în memorie, fără pictogramă vizibilă. Recomandată când există risc de represalii."),
     card("Browserul", "Fără instalare, aceeași criptare. Protecție mai slabă: fără Tor implicit. Avertisment vizibil pe pagină.", bg=LIGHT2))}
{footer(D, 9)}''')))

# 10 legal
leg = lambda a, b: (f'<div style="flex:1;display:flex;flex-direction:column;gap:12px;background:{CARD};padding:36px;border-top:8px solid {TEAL};border-radius:12px">\n'
    f'<p style="font-family:{DISPLAY};font-size:36px;font-weight:700;color:{TEAL}">{a}</p>\n<p style="font-size:28px;line-height:1.4;color:{DARK}">{b}</p>\n</div>')
S.append(("cadru-legal", sec("cadru-legal", f'''{head("Cadrul legal", "Software care sprijină procesul")}
{row(leg("Art. 9 (1) b)", "Confirmarea primirii în 7 zile — termen calculat automat."),
     leg("Art. 9 (1) f)", "Răspuns către avertizor în 3 luni — termen calculat automat."),
     leg("Art. 16", "Confidențialitatea identității — asigurată prin arhitectură."))}
<p style="font-size:28px;line-height:1.4;color:{MUTED}">Nu este consultanță juridică și nici certificare. Conformitatea completă cu Legea nr. 361/2022 o confirmă departamentul juridic al organizației.</p>
{footer(D, 10)}''')))

# 11 installation
S.append(("instalare", sec("instalare", f'''{head("Instalare", "Trei pași, fără linie de comandă")}
{row(step("1", "Releul", "Aplicația de releu pe o tabletă Android sau pe un laptop.", TEAL),
     step("2", "Panoul", "install.bat și start.bat pe laptopul responsabilului.", ORANGE),
     step("3", "Comunicarea", "Codul QR sau linkul de raportare pentru angajați.", TEAL), gap=48)}
{footer(D, 11)}''', bg=LIGHT2)))

# 12 status
S.append(("stadiu", sec("stadiu", f'''{head("Stadiu actual", "Testat. Următorul pas: dispozitive reale.")}
{row(card("Gata", "Criptarea verificată octet cu octet. Două implementări independente testate una față de cealaltă. Aplicația: 59 de teste."),
     card("Urmează", "Test pe dispozitive reale. Acces pentru mai mulți responsabili. Export de cazuri. Audit independent.", bg=LIGHT2))}
{footer(D, 12)}''')))

# 13 next steps
S.append(("pasi", sec("pasi", f'''{eyebrow("Pașii următori", ON_DARK)}
<h2 style="font-family:{DISPLAY};font-size:96px;font-weight:800;line-height:1.08;color:{ON_DARK}">Un pilot.<br>Canalul vostru.</h2>
<ol style="font-size:36px;line-height:1.45;color:{ON_DARK}">
<li>Analiza cerințelor și a procesului intern</li>
<li>Instalarea releului și a panoului</li>
<li>Pilot, apoi lansarea către angajați</li>
</ol>
<p style="font-size:32px;color:{ON_DARK}">NexonAI Consulting SRL · nexonai.consulting@gmail.com · [telefon]</p>''', bg=TEAL, color=ON_DARK, extra="display:flex;flex-direction:column;justify-content:center;gap:40px")))

sections = {
    "s1": {"description": "Obligația legală și problema soluțiilor clasice.", "start": "cover"},
    "s2": {"description": "Soluția: releul organizației, fără nimic de identificat.", "start": "instrumentul"},
    "s3": {"description": "Panou, căi de raportare și cadrul legal.", "start": "panou"},
    "s4": {"description": "Instalare, stadiu și pașii următori.", "start": "instalare"},
}
print(write_deck("compliance", "unpruuf Compliance", S, sections))
