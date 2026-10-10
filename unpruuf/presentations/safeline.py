# -*- coding: utf-8 -*-
"""safeline deck (whistleblower channel), English and Romanian, state 2026-10-10.

Structure (Gabriel's rule): first "How unpruuf works" (the post-office picture), then the
solution for the customer. After the first part there is no more technology talk, only what the
organisation, the employee and the compliance officer can DO.
Run `python3 safeline.py` -> safeline_en/ and safeline_ro/ (project/deck.json + slides/*.html).
Render and export: see README.md (render.js, export2.py).
"""
import shutil
from common import *


def build(lang):
    i = 0 if lang == "en" else 1
    P = lambda en, ro: (en, ro)[i]
    D = "safeline"
    S = []
    n = [0]

    def nxt():
        n[0] += 1
        return n[0]

    box = lambda l, t, w, h, title, sub="", main=False: (
        f'<div style="position:absolute;left:{l}px;top:{t}px;width:{w}px;height:{h}px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:4px;'
        f'background:{LIGHT2 if main else CARD};border:{2 if main else 1}px solid {TEAL if main else LINE};border-radius:16px">\n'
        f'<p style="font-family:{DISPLAY};font-size:34px;font-weight:700;color:{DARK};text-align:center">{title}</p>\n'
        + (f'<p style="font-size:24px;color:{MUTED};text-align:center">{sub}</p>\n' if sub else "") + '</div>')
    lbl = lambda l, t, w, text, align="left": f'<p style="position:absolute;left:{l}px;top:{t}px;width:{w}px;font-size:26px;color:{MUTED};text-align:{align}">{text}</p>'
    body = lambda t, c=MUTED, sz=32: f'<p style="font-size:{sz}px;line-height:1.4;color:{c}">{t}</p>'
    step = lambda nn, t, b, c: (f'<div style="flex:1;display:flex;flex-direction:column;gap:12px;border-top:8px solid {c};padding:32px 0 0 0">\n'
        f'<p style="font-family:{DISPLAY};font-size:72px;font-weight:800;line-height:1;color:{c}">{nn}</p>\n'
        f'<h3 style="font-family:{DISPLAY};font-size:38px;font-weight:700;line-height:1.2;color:{DARK}">{t}</h3>\n'
        f'<p style="font-size:28px;line-height:1.4;color:{MUTED}">{b}</p>\n</div>')
    gone = lambda t: f'<p style="font-family:{DISPLAY};font-size:56px;font-weight:700;line-height:1.2;color:{DARK};text-decoration:line-through {ORANGE}">{t}</p>'
    big = lambda title, text, accent: (f'<div style="flex:1;display:flex;flex-direction:column;gap:20px;background:{CARD};padding:48px;border-top:8px solid {accent};border-radius:16px">\n'
        f'<h3 style="font-family:{DISPLAY};font-size:44px;font-weight:700;line-height:1.15;color:{DARK}">{title}</h3>\n'
        f'<p style="font-size:32px;line-height:1.4;color:{MUTED}">{text}</p>\n</div>')
    arrow = lambda x1, y1, x2, y2, c=MUTED, dash=False: (
        f'<x-connector x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" head="end" style="color:{c};border-width:3px{";border-style:dashed" if dash else ""}"></x-connector>')

    # 1 cover
    nxt()
    S.append(("cover", sec("cover", f'''<div style="position:absolute;left:0;top:0;width:24px;height:1080px;background:{ORANGE}"></div>
{eyebrow("NexonAI Consulting SRL", ON_DARK_MUTED)}
<div style="flex:1"></div>
<h1 style="font-family:{DISPLAY};font-size:140px;font-weight:800;line-height:1.05;color:{ON_DARK}">safeline</h1>
<p style="font-size:48px;line-height:1.3;color:{ON_DARK}">{P("The reporting channel that only your organisation runs.", "Canalul de raportare pe care îl operează doar organizația dumneavoastră.")}</p>
<p style="font-size:32px;line-height:1.4;color:{ON_DARK_MUTED}">{P("For employees who have something to report. For the officer who has to handle it by the deadline.", "Pentru angajații care au ceva de raportat. Pentru responsabilul care trebuie să rezolve la termen.")}</p>
{notes(P("Open with the one sentence. Then explain how the system works in three slides, and only then talk about what safeline does for the organisation. Say up front: this is a pilot, not audited, not certified.", "Începeți cu o singură propoziție. Apoi explicați cum funcționează sistemul în trei diapozitive și abia după aceea vorbiți despre ce face safeline pentru organizație. Spuneți de la început: este un pilot, neauditat, necertificat."))}''', bg=DARK, color=ON_DARK, extra="display:flex;flex-direction:column;gap:32px")))

    # 2 what you need
    k = nxt()
    S.append(("how-1", sec("how-1", f'''{eyebrow(P("How unpruuf works", "Cum funcționează unpruuf"), ON_DARK_MUTED)}
<h2 style="font-family:{DISPLAY};font-size:88px;font-weight:800;line-height:1.1;color:{ON_DARK}">{P("What do you need to communicate securely?<br>A system of your own.", "Ce vă trebuie ca să comunicați în siguranță?<br>Propriul sistem.")}</h2>
<p style="font-size:40px;line-height:1.4;color:{ON_DARK}">{P("Every customer gets their own secure, anonymous system, and only they manage it.", "Fiecare client primește propriul sistem, sigur și anonim, pe care îl administrează doar el.")}</p>
<div style="display:flex;gap:48px">
<div style="flex:1;background:rgba(255,255,255,.08);padding:36px;border-radius:16px"><h3 style="font-family:{DISPLAY};font-size:44px;font-weight:700;color:{ON_DARK}">{P("A phone", "Un telefon")}</h3><p style="font-size:30px;line-height:1.4;color:{ON_DARK_MUTED}">{P("To write and read.", "Pentru scris și citit.")}</p></div>
<div style="flex:1;background:rgba(255,255,255,.08);padding:36px;border-radius:16px"><h3 style="font-family:{DISPLAY};font-size:44px;font-weight:700;color:{ON_DARK}">{P("Your own post office", "Propria poștă")}</h3><p style="font-size:30px;line-height:1.4;color:{ON_DARK_MUTED}">{P("A PC, laptop or, better, a server.", "Un PC, un laptop sau, mai bine, un server.")}</p></div>
</div>
{footer(D, k, ON_DARK_MUTED)}''', bg=TEAL, color=ON_DARK, extra="display:flex;flex-direction:column;justify-content:center;gap:40px")))

    # 3 mailboxes diagram
    k = nxt()
    mb = lambda x, y, c: "".join(f'<div style="position:absolute;left:{x+j*74}px;top:{y}px;width:60px;height:72px;background:{c[0]};border:2px solid {c[1]};border-radius:8px"></div>' for j in range(3))
    S.append(("how-2", sec("how-2", f'''{head(P("How unpruuf works", "Cum funcționează unpruuf"), P("250 mailboxes. 3 for every contact.", "250 de cutii poștale. 3 pentru fiecare contact."))}
{box(128, 440, 260, 120, "Anna")}
{mb(700, 444, (LIGHT2, TEAL))}
{box(1532, 440, 260, 120, "Ben")}
{arrow(390, 500, 690, 500, TEAL)}
{arrow(1520, 500, 940, 500, TEAL, True)}
{lbl(430, 440, 260, P("puts it in", "depune"), "center")}
{lbl(1000, 440, 500, P("picks it up", "ridică"), "center")}
{lbl(560, 530, 600, P("Anna's 3 mailboxes", "Cele 3 cutii ale Annei"), "center")}
{box(128, 720, 260, 120, "Ben")}
{mb(700, 724, ("#F8E7D6", ORANGE))}
{box(1532, 720, 260, 120, "Anna")}
{arrow(390, 780, 690, 780, ORANGE)}
{arrow(1520, 780, 940, 780, ORANGE, True)}
{lbl(560, 810, 600, P("Ben's 3 mailboxes", "Cele 3 cutii ale lui Ben"), "center")}
{body(P("On each of your post offices you have 250 mailboxes. For every contact you pick 3 and give them those addresses.", "Pe fiecare oficiu poștal aveți 250 de cutii. Pentru fiecare contact alegeți 3 și le dați adresele lor."), MUTED, 30)}
{footer(D, k)}
{notes(P("Everyone writes only into their own mailboxes. The other person only picks up. The mailboxes do not know who owns them or who picks up. Do not go into keys or protocol details (patent pending).", "Fiecare scrie doar în propriile cutii. Celălalt doar ridică. Cutiile nu știu cui aparțin și cine ridică. Nu intrați în detalii despre chei sau protocol (brevet în curs)."))}''', extra="display:flex;flex-direction:column;gap:32px")))

    # 4 big difference
    k = nxt()
    S.append(("how-3", sec("how-3", f'''{head(P("How unpruuf works", "Cum funcționează unpruuf"), P("I never address anyone else.", "Nu adresez niciodată pe altcineva."))}
{body(P("I put something on my own devices and tell someone where it is. That is why there is no direct line between two people, and nothing the system could hand over.", "Pun ceva pe propriile mele dispozitive și îi spun cuiva unde se află. De aceea nu există o legătură directă între două persoane și nimic ce sistemul ar putea preda."), DARK, 36)}
{row(big(P("Junk instead of a vault", "Gunoi în loc de seif"), P("Whoever breaks in finds junk, at most 24 hours old. There is no vault worth cracking.", "Cine sparge găsește gunoi, vechi de cel mult 24 de ore. Nu există niciun seif care să merite forțat."), ORANGE),
     big(P("Even the operator is blind", "Nici operatorul nu vede"), P("The server holds no key and no names. If a court asks, there is nothing readable to hand over.", "Serverul nu are nicio cheie și niciun nume. Dacă o instanță cere, nu există nimic lizibil de predat."), TEAL),
     big(P("The intelligence is on the devices", "Inteligența se află pe dispozitive"), P("Whoever gets access to the infrastructure finds nothing useful.", "Cine ajunge la infrastructură nu găsește nimic util."), ORANGE))}
{footer(D, k)}
{notes(P("Careful wording: we do not say a search or a court order is pointless. We say there is nothing readable to hand over.", "Formulați prudent: nu spunem că o percheziție sau un ordin judecătoresc este inutil. Spunem că nu există nimic lizibil de predat."))}''', bg=LIGHT2)))

    # 5 obligation
    k = nxt()
    S.append(("duty", sec("duty", f'''{head(P("The duty", "Obligația"), P("An internal reporting channel with fixed deadlines", "Un canal intern de raportare cu termene fixe"))}
{body(P("EU Directive 2019/1937: organisations with 50 or more employees must offer an internal reporting channel. In Romania this is Law 361/2022.", "Directiva UE 2019/1937: organizațiile cu 50 sau mai mulți angajați trebuie să ofere un canal intern de raportare. În România, aceasta este Legea 361/2022."))}
{row(step(P("Day 0", "Ziua 0"), P("The report arrives", "Raportarea sosește"), P("The case opens, both deadlines start by themselves.", "Cazul se deschide, ambele termene pornesc singure."), TEAL),
     step(P("7 days", "7 zile"), P("Confirm receipt", "Confirmarea primirii"), P("The reporter gets the confirmation with the case number.", "Avertizorul primește confirmarea împreună cu numărul cazului."), ORANGE),
     step(P("3 months", "3 luni"), P("Give feedback", "Feedback"), P("The reporter hears what was done.", "Avertizorul află ce s-a făcut."), TEAL), gap=48)}
{footer(D, k)}
{notes(P("Checked 2026-10-08: the directive already applies to organisations with 50 or more employees. In Romania Law 361/2022 has applied since December 2022; for 50 to 249 employees since 17 December 2023. There is no new deadline at year end. Not legal advice.", "Verificat la 08.10.2026: directiva se aplică deja organizațiilor cu 50 sau mai mulți angajați. În România, Legea 361/2022 se aplică din decembrie 2022; pentru 50 până la 249 de angajați, din 17 decembrie 2023. Nu există un termen nou la sfârșitul anului. Nu este consultanță juridică."))}''')))

    # 6 problem
    k = nxt()
    S.append(("problem", sec("problem", f'''{head(P("The problem", "Problema"), P("Most channels ask people to trust someone", "Majoritatea canalelor cer oamenilor să aibă încredere în cineva"))}
{row(card(P("A platform", "O platformă"), P("Somebody else runs it and could read along.", "Altcineva o operează și ar putea citi.")),
     card(P("Email or phone", "E-mail sau telefon"), P("Address, number and time give the reporter away.", "Adresa, numărul și ora îl trădează pe avertizor.")),
     card(P("A promise", "O promisiune"), P("The protection sits in a contract, not in how it is built.", "Protecția stă într-un contract, nu în felul în care este construit.")))}
{body(P("People who fear retaliation do not report through a channel they have to trust. safeline is built so that nobody has to.", "Cine se teme de represalii nu raportează printr-un canal în care trebuie să aibă încredere. safeline este construit astfel încât nimeni să nu fie nevoit."))}
{footer(D, k)}''')))

    # 7 safeline in one picture
    k = nxt()
    S.append(("flow", sec("flow", f'''{eyebrow(P("safeline", "safeline"), ON_DARK_MUTED)}
<h2 style="font-family:{DISPLAY};font-size:80px;font-weight:800;line-height:1.1;color:{ON_DARK}">{P("One code on the wall.<br>One case in the dashboard.", "Un cod pe perete.<br>Un caz în panou.")}</h2>
<div style="display:flex;gap:48px">
<div style="flex:1;border-top:8px solid {ON_DARK};padding-top:28px"><p style="font-family:{DISPLAY};font-size:64px;font-weight:800;color:{ON_DARK}">1</p><h3 style="font-family:{DISPLAY};font-size:40px;font-weight:700;color:{ON_DARK}">{P("Scan", "Scanează")}</h3><p style="font-size:30px;line-height:1.4;color:{ON_DARK_MUTED}">{P("The employee scans the organisation's one QR code and writes.", "Angajatul scanează codul QR unic al organizației și scrie.")}</p></div>
<div style="flex:1;border-top:8px solid {ON_DARK};padding-top:28px"><p style="font-family:{DISPLAY};font-size:64px;font-weight:800;color:{ON_DARK}">2</p><h3 style="font-family:{DISPLAY};font-size:40px;font-weight:700;color:{ON_DARK}">{P("Case opens", "Se deschide cazul")}</h3><p style="font-size:30px;line-height:1.4;color:{ON_DARK_MUTED}">{P("The officer sees a new case with a number and running deadlines.", "Responsabilul vede un caz nou, cu număr și termene în curs.")}</p></div>
<div style="flex:1;border-top:8px solid {ON_DARK};padding-top:28px"><p style="font-family:{DISPLAY};font-size:64px;font-weight:800;color:{ON_DARK}">3</p><h3 style="font-family:{DISPLAY};font-size:40px;font-weight:700;color:{ON_DARK}">{P("Answer", "Răspunde")}</h3><p style="font-size:30px;line-height:1.4;color:{ON_DARK_MUTED}">{P("The officer replies and sets the status. The reporter sees it on their phone.", "Responsabilul răspunde și setează starea. Avertizorul o vede pe telefon.")}</p></div>
</div>
{footer(D, k, ON_DARK_MUTED)}
{notes(P("This is the sentence to remember: one code on the wall, one case in the dashboard. From here on we talk about what people can do, not about technology.", "Aceasta este propoziția de ținut minte: un cod pe perete, un caz în panou. De aici încolo vorbim despre ce pot face oamenii, nu despre tehnologie."))}''', bg=DARK, color=ON_DARK, extra="display:flex;flex-direction:column;justify-content:center;gap:48px")))

    # 8 for the employee
    k = nxt()
    S.append(("employee", sec("employee", f'''{head(P("For the employee", "Pentru angajat"), P("Report without giving yourself away", "Raportezi fără să te dai de gol"))}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:28px 64px">
{gone(P("Account", "Cont"))}{gone(P("Email address", "Adresă de e-mail"))}
{gone(P("Phone number", "Număr de telefon"))}{gone(P("Visible app icon", "Pictogramă vizibilă"))}
</div>
{row(card(P("Scan and write", "Scanează și scrie"), P("One code, the same for everyone. Nothing to type, nothing to copy.", "Un singur cod, același pentru toți. Nimic de tastat, nimic de copiat.")),
     card(P("A case number", "Un număr de caz"), P("A random number, never consecutive. It comes back by itself, together with the confirmation.", "Un număr aleatoriu, niciodată consecutiv. Se întoarce singur, împreună cu confirmarea.")),
     card(P("See where it stands", "Vezi cum stă cazul"), P("Status and deadlines appear in “My cases” on your phone. Two reports from one phone look like two different people.", "Starea și termenele apar în „Cazurile mele” pe telefon. Două raportări de pe același telefon arată ca două persoane diferite."), bg=LIGHT2))}
{footer(D, k)}
{notes(P("If someone loses their phone, they lose their case numbers unless they wrote them down. The browser option needs no installation but protects less; it shows a visible warning.", "Cine își pierde telefonul își pierde numerele de caz, dacă nu le-a notat. Varianta din browser nu cere instalare, dar protejează mai puțin; afișează un avertisment vizibil."))}''', extra="display:flex;flex-direction:column;gap:36px")))

    # 9 for the officer (dashboard)
    k = nxt()
    mrow = lambda a, b, c, d, bg: f'<tr style="background:{bg}"><td>{a}</td><td>{b}</td><td>{c}</td><td>{d}</td></tr>'
    S.append(("officer", sec("officer", f'''{head(P("For the compliance officer", "Pentru responsabilul de conformitate"), P("Case files with deadlines, not just a chat", "Dosare de caz cu termene, nu doar un chat"))}
<div style="display:flex;gap:48px">
<div style="flex:3;display:flex;flex-direction:column;gap:16px;background:{CARD};padding:32px;border:1px solid {LINE};border-radius:16px">
<p style="font-size:24px;letter-spacing:2px;text-transform:uppercase;color:{MUTED};font-weight:600">{P("Illustrative example", "Exemplu ilustrativ")}</p>
<table style="font-size:26px;color:{DARK}">
<tr><th style="width:26%">{P("Case", "Caz")}</th><th style="width:24%">{P("Status", "Stare")}</th><th style="width:25%">{P("Receipt", "Confirmare")}</th><th style="width:25%">{P("Feedback", "Feedback")}</th></tr>
{mrow("HW-…-A", P("New", "Nou"), P("6 days left", "încă 6 zile"), P("89 days left", "încă 89 de zile"), CARD)}
{mrow("HW-…-B", P("Confirmed", "Confirmat"), P("done", "îndeplinit"), P("61 days left", "încă 61 de zile"), LIGHT2)}
{mrow("HW-…-C", P("In progress", "În lucru"), P("done", "îndeplinit"), P("12 days left", "încă 12 zile"), CARD)}
</table>
</div>
<ul style="flex:2;font-size:32px;line-height:1.45;color:{DARK}">
<li>{P("Cases appear by themselves, with a case number.", "Cazurile apar singure, cu număr de caz.")}</li>
<li>{P("Both legal deadlines run automatically.", "Ambele termene legale curg automat.")}</li>
<li>{P("Reply, set a category, change the status. The reporter sees it at once.", "Răspunzi, setezi o categorie, schimbi starea. Avertizorul o vede imediat.")}</li>
<li>{P("The case files stay on the officer's laptop, protected by a password.", "Dosarele rămân pe laptopul responsabilului, protejate cu parolă.")}</li>
</ul>
</div>
{footer(D, k)}''', bg=LIGHT2)))

    # 10 for the organisation
    k = nxt()
    S.append(("organisation", sec("organisation", f'''{head(P("For the organisation", "Pentru organizație"), P("A channel you own and can show", "Un canal pe care îl dețineți și îl puteți arăta"))}
{row(card(P("Yours, not a vendor's", "Al dumneavoastră, nu al unui furnizor"), P("It runs on your own hardware. NexonAI runs no servers.", "Rulează pe hardware-ul dumneavoastră. NexonAI nu operează servere.")),
     card(P("One channel per site", "Un canal pe locație"), P("Separate channels for locations or departments, each with its own officer.", "Canale separate pentru locații sau departamente, fiecare cu propriul responsabil.")),
     card(P("Deadlines under control", "Termene sub control"), P("Nothing slips: every open case shows what is due and when.", "Nimic nu se pierde: fiecare caz deschis arată ce scadent este și când."), bg=LIGHT2))}
{body(P("You announce one code, on the notice board or in the intranet. There is no list of who has reported, because nobody is registered.", "Anunțați un singur cod, pe panou sau în intranet. Nu există o listă cu cine a raportat, pentru că nimeni nu este înregistrat."))}
{footer(D, k)}''')))

    # 11 who sees what (plain language)
    k = nxt()
    S.append(("who", sec("who", f'''{head(P("Honest answer", "Răspuns sincer"), P("Who sees what", "Cine vede ce"))}
<table style="font-size:30px;color:{DARK}">
<tr><th style="width:36%">{P("Who", "Cine")}</th><th style="width:30%">{P("Sees the report", "Vede raportarea")}</th><th style="width:34%">{P("Knows who wrote it", "Știe cine a scris")}</th></tr>
<tr><td>{P("The compliance officer", "Responsabilul de conformitate")}</td><td>{P("Yes", "Da")}</td><td>{P("Only if the reporter says so", "Doar dacă avertizorul o spune")}</td></tr>
<tr style="background:{LIGHT2}"><td>{P("Your IT administrator", "Administratorul IT")}</td><td>{P("No", "Nu")}</td><td>{P("No", "Nu")}</td></tr>
<tr><td>{P("Colleagues, management", "Colegii, conducerea")}</td><td>{P("No", "Nu")}</td><td>{P("No", "Nu")}</td></tr>
<tr style="background:{LIGHT2}"><td>NexonAI</td><td>{P("No, we have no access", "Nu, nu avem acces")}</td><td>{P("No", "Nu")}</td></tr>
</table>
{body(P("The browser option protects less than the app: someone who sees the network traffic may learn that a report was sent. The app is the recommended way when retaliation is a risk.", "Varianta din browser protejează mai puțin decât aplicația: cine vede traficul de rețea poate afla că s-a trimis o raportare. Aplicația este calea recomandată când există risc de represalii."), MUTED, 28)}
{footer(D, k)}
{notes(P("Do not claim more. We say: nobody outside the officer can read it, and the system holds no identities. We do not say it is impossible to find out who someone is, for example if the reporter writes their name.", "Nu pretindeți mai mult. Spunem: nimeni în afară de responsabil nu o poate citi, iar sistemul nu conține identități. Nu spunem că este imposibil să afli cine este cineva, de exemplu dacă avertizorul își scrie numele."))}''')))

    # 12 getting started
    k = nxt()
    S.append(("start", sec("start", f'''{head(P("Getting started", "Primii pași"), P("Three steps, no command line", "Trei pași, fără linie de comandă"))}
{row(step("1", P("Set up", "Instalare"), P("Run install and start on the organisation's server or laptop, enter the licence code. The same for the officer's laptop.", "Rulați install și start pe serverul sau laptopul organizației și introduceți codul de licență. La fel pe laptopul responsabilului."), TEAL),
     step("2", P("Announce", "Anunțați"), P("Put the one QR code on the notice board or in the intranet.", "Puneți codul QR unic pe panou sau în intranet."), ORANGE),
     step("3", P("Pilot", "Pilot"), P("Start with one location. Look at the first cases together, then roll out.", "Începeți cu o locație. Priviți împreună primele cazuri, apoi extindeți."), TEAL), gap=48)}
{footer(D, k)}''', bg=LIGHT2)))

    # 13 status
    k = nxt()
    S.append(("status", sec("status", f'''{head(P("Where we stand", "Unde ne aflăm"), P("Tested by us. Not audited. Not certified.", "Testat de noi. Neauditat. Necertificat."))}
{row(card(P("Done", "Gata"), P("Reporting, case numbers, status and deadlines run between the app, the browser and the dashboard. Encryption was checked byte for byte against a second, independent implementation.", "Raportarea, numerele de caz, starea și termenele funcționează între aplicație, browser și panou. Criptarea a fost verificată octet cu octet față de o a doua implementare independentă.")),
     card(P("Next", "Urmează"), P("Tests on real devices, access for more than one officer, case export, an independent audit.", "Teste pe dispozitive reale, acces pentru mai mulți responsabili, export de cazuri, un audit independent."), bg=LIGHT2))}
{body(P("safeline supports your process. It is not legal advice and not a certification. Whether the national law is fully met is for your legal department to confirm.", "safeline sprijină procesul dumneavoastră. Nu este consultanță juridică și nici certificare. Dacă legea națională este îndeplinită complet, confirmă departamentul juridic."), MUTED, 28)}
{footer(D, k)}''')))

    # 14 contact
    S.append(("contact", sec("contact", f'''{eyebrow(P("Next steps", "Pașii următori"), ON_DARK)}
<h2 style="font-family:{DISPLAY};font-size:96px;font-weight:800;line-height:1.08;color:{ON_DARK}">{P("One pilot.<br>Your channel.", "Un pilot.<br>Canalul dumneavoastră.")}</h2>
<p style="font-size:40px;line-height:1.4;color:{ON_DARK}">{P("We look at your organisation together and set up the pilot.", "Analizăm împreună organizația dumneavoastră și punem în funcțiune pilotul.")}</p>
<p style="font-size:32px;color:{ON_DARK}">NexonAI Consulting SRL · gabriel@nexonai.ro · +40 773 829 646</p>''', bg=TEAL, color=ON_DARK, extra="display:flex;flex-direction:column;justify-content:center;gap:40px")))

    sections = {
        "s1": {"description": P("How unpruuf works: the post-office picture in three slides.", "Cum funcționează unpruuf: imaginea cu poșta, în trei diapozitive."), "start": "how-1"},
        "s2": {"description": P("The duty and the problem.", "Obligația și problema."), "start": "duty"},
        "s3": {"description": P("safeline for employee, officer and organisation.", "safeline pentru angajat, responsabil și organizație."), "start": "flow"},
        "s4": {"description": P("Honest status and next steps.", "Stadiu sincer și pașii următori."), "start": "who"},
    }
    return S, sections


if __name__ == "__main__":
    for lang in ("en", "ro"):
        folder = f"safeline_{lang}"
        shutil.rmtree(os.path.join(folder, "project", "slides"), ignore_errors=True)
        S, sec_ = build(lang)
        print(folder, write_deck(folder, "safeline" + (" (RO)" if lang == "ro" else " (EN)"), S, sec_))
