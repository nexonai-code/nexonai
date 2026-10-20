from openpyxl import Workbook
from openpyxl.styles import Font,PatternFill,Alignment,Border,Side
from openpyxl.utils import get_column_letter
SP='/tmp/claude-0/-home-user-nexonai/dd345a09-6039-5c13-9173-147314f838d9/scratchpad/'
# (firma, ort, region, mitarb, umsatz, inhaber, was, web, kontakt_allg, person_name, person_rolle, person_quelle, kanal, signal, fit, sig, reach, schritt, quellen)
L=[
("Scandia Food SA","Sibiu","Sibiu","781 (2023, Termene); Presse: über 1.000","508,9 Mio. Lei (2023)","Elga Comert SRL 58,3 %, weitere Gesellschafter",
 "Konservenhersteller (Scandia Sibiu, Bucegi, Sadu u. a.), dazu Wurst, Fisch, Tiefkühlprodukte.","https://www.scandia.ro",
 "office@scandia.ro · +40 269 208 600 · Str. Podului 133, Sibiu (Quelle: scandia.ro/contact)",
 "Andrei Ursulescu","Director General und Administrator","Forbes Romania, Profit.ro (Presse, Stand nicht aktuell geprüft)",
 "Auf der Firmenseite kein Kanal gefunden (beweist nichts).","Wächst: kauft Agra's (Alba Iulia) und eine Fabrik für Tiefkühlprodukte. Neue Standorte bringen neue Kollegen.",4,5,3,
 "Brief oder Mail an die Geschäftsleitung, Betreff Meldekanal. Über office@scandia.ro bitten, an den Generaldirektor oder die Personal-/Rechtsabteilung weiterzuleiten.",
 "https://www.scandia.ro/contact/ ; https://profit.ro/povesti-cu-profit/retail/scandia-food-cumpara-o-fabrica-si-intra-in-categoria-de-produse-congelate-20428123 ; https://termene.ro/articole/topul-celor-mai-mari-firme-din-sibiu"),
("Punctual Comimpex SRL","Cluj-Napoca","Cluj","141 (2023, Termene); 86 (2016)","1,063 Mrd. Lei (2023), Plan 2024: 1,2 Mrd.","Vasile Mureșan, 100 %",
 "Großhändler für Zigaretten (rund 99 % des Geschäfts), Kaffee und Telefonkarten.","(keine Website gefunden)",
 "Keine öffentlichen Kontaktdaten gefunden. Adresse und Telefon über mfinante.ro oder Handelsregister (CUI) holen.",
 "Vasile Mureșan","Inhaber und Administrator","ZF (Wirtschaftspresse)",
 "Nicht geprüft.","Wächst stark, gründergeführt, reguliertes Geschäft, keine Konzernvorgaben. Größe passt zur seit 17.12.2023 verpflichteten Gruppe.",5,4,2,
 "Über das eigene Netz einen Weg zum Inhaber suchen (Cluj). Alternativ Brief an die Firmenadresse aus dem Handelsregister.",
 "https://www.zf.ro/companii/distribuitorul-de-tigari-punctual-comimpex-din-cluj-napoca-a-ajuns-19867314 ; https://termene.ro/articole/topul-celor-mai-mari-20-de-companii-din-judetul-cluj"),
("Transavia SA","Sântimbru (bei Alba Iulia)","Alba","rund 2.240 (2024, Termene); 2.350 (Forbes, Ende 2023)","1,115 Mrd. Lei (2024), Gewinn 277 Mio.","Familie Popa, 100 % rumänisch",
 "Geflügelproduzent mit eigener Kette von Futter bis Fertigprodukt (Fragedo, Bravis, Durdulan u. a.), seit 2025 auch Tierfutter.","https://www.transavia.ro",
 "contact@transavia.ro · +40 258 813 295 · Str. Blajului 244 D, Sântimbru (Mo bis Fr 8 bis 16 Uhr). Datenschutz: contact.gdpr@transavia.ro (Quelle: transavia.ro/contact)",
 "Dr. ing. Ioan Popa","Gründer (laut Firmenseite); Generaldirektor nicht ermittelt","transavia.ro/despre-noi",
 "Auf der Firmenseite kein Kanal gefunden (beweist nichts). Wegen der Größe vermutlich schon versorgt.","Expansion, in 9 Kreisen vertreten, größter Geflügelproduzent. Sitz direkt bei Alba Iulia.",3,4,4,
 "Persönlicher Weg über das Netz in Alba. Mail an contact@transavia.ro mit Bitte um Weiterleitung an Recht/Personal.",
 "https://www.transavia.ro/contact/ ; https://www.transavia.ro/despre-noi/ ; https://alba24.ro/firma-transavia-din-alba-pe-locul-4-in-topul-companiilor-din-romania-cu-cele-mai-mari-profituri-inregistrate-in-2024-lista-1078889.html"),
("Autoworld SRL","Cluj-Napoca","Cluj","184 (2023, Termene); andere Quelle 38 (2025). Bitte prüfen.","(2023 nicht ermittelt)","Familie Mezei (Ioan Mezei übergibt Anteile an seine Söhne)",
 "Autohändler (Audi, Volkswagen, Volvo, Toyota, Mazda, MG) als Familienbetrieb, Neu- und Gebrauchtwagen, Service.","https://www.autoworld.ro",
 "Allgemeine Daten auf der Firmenseite nicht abrufbar. Adresse laut Registerprofil: Calea Florești 145, Cluj-Napoca. VW-Service: +40 371 521 915 (Ayvens-Liste, bitte prüfen).",
 "Ioan Mezei (Gründer); Söhne als neue Gesellschafter, Namen nicht ermittelt","Gründer / Familie","Profit.ro",
 "Nicht geprüft.","Generationswechsel in der Gesellschafterstruktur, mehrere Marken und Standorte.",4,3,3,
 "Anruf in der Zentrale, nach Geschäftsleitung oder Personal fragen. Mitarbeiterzahl vorher klären (Pflicht ab 50).",
 "https://www.autoworld.ro ; https://profit.ro/povesti-cu-profit/auto-transporturi/antreprenorul-ioan-mezei-le-cedeaza-fiilor-sai-parti-sociale-la-autoworld-de-aproape-70-000-de-lei-14475586"),
("Farmec SA","Cluj-Napoca","Cluj","719 (2025, Termene)","399 Mio. Lei (2025)","Zu rund 85 % Mitarbeiter und frühere Mitarbeiter",
 "Kosmetikhersteller (u. a. Gerovital), Fabrik und eigene Läden in Cluj.","farmec.ro (nicht abrufbar, nicht geprüft)",
 "Keine Kontaktdaten abrufbar. Sitz laut Termene: Str. Henri Barbusse 16, Cluj-Napoca.",
 "Mircea Turdean","Director General (seit über zehn Jahren)","Forbes Romania, Revista Biz",
 "Nicht geprüft.","Bekannte Marke, viele Beschäftigte sind zugleich Gesellschafter, das macht Vertraulichkeit sensibel.",4,3,3,
 "Brief an die Generaldirektion. Kontaktdaten vorher auf der Firmenseite oder im Handelsregister prüfen.",
 "https://termene.ro/en/firma/199150-FARMEC-SA ; https://www.revistabiz.ro/cifra-de-afaceri-farmec-a-depasit-in-premiera-pragul-de-71-mil-euro-in-2023/"),
("Elit SRL (Marke Elit, mezeluri.ro)","Oarda de Jos, Alba Iulia (Werk auch in Cugir)","Alba","rund 2.000 (Firmenseite); 1.966 (2025, Termene)","(nicht ermittelt)","(nicht ermittelt)",
 "Wurst- und Fleischwarenhersteller, 5 eigene Werke, eigene Läden und Regionallager.","https://mezeluri.ro",
 "office@elitcugir.ro · 0258 753 311 und 0258 869 650 · Str. Biruinței 46, Oarda de Jos, Alba Iulia (Quelle: mezeluri.ro/contact)",
 "Oradan Adrian Cristian","Director General","mezeluri.ro/integritate",
 "VORHANDEN: Meldekanal per E-Mail (avertizori.elit@elitcugir.ro) und Post, Zuständig: Rechtsabteilung (Quelle: mezeluri.ro/integritate).","Hat die Pflicht erfüllt, aber nur per E-Mail. Ansatz: Aufwertung, nicht Erstkunde. Sitz in Alba Iulia.",3,3,4,
 "Nur mit Aufwertungs-Angebot (Meldungen ohne E-Mail-Spuren, Rückfragen ohne Namen). Niedrigere Priorität als Firmen ohne Kanal.",
 "https://mezeluri.ro/integritate/ ; https://mezeluri.ro/contact/"),
("Con-A Operations SRL (Con-A Gruppe)","Șelimbăr (bei Sibiu)","Sibiu","541 (2023, Termene)","772,6 Mio. Lei (2023)","Con-A SRL 51 %, weitere Personen; Gruppe laut EMIS im Besitz von Mircea Bulboacă",
 "Bauunternehmen der Con-A Gruppe (Hochbau, Industriebau, Straßen).","https://www.con-a.ro (zur Zeit nicht erreichbar)",
 "Sitz laut Registerlisten: Str. Mihai Viteazu 2B, Șelimbăr. Telefon und E-Mail nicht gefunden.",
 "Mircea Bulboacă","Präsident und Alleingesellschafter der Gruppe (EMIS, nicht frei einsehbar)","EMIS-Profil (Suchtreffer)",
 "Nicht geprüft.","Große Baustellen, viele Subunternehmer und Beschäftigte, Gewinn 2023 verdoppelt (ZF).",4,3,2,
 "Kontaktdaten zuerst von der Firmenseite oder dem Handelsregister holen. Über Bau- und Handelskammer in Sibiu einsteigen.",
 "https://zfenglish.com/companies/builder-con-a-operations-doubles-profit-to-ron55-6m-in-2023-22346414 ; https://termene.ro/articole/topul-celor-mai-mari-firme-din-sibiu"),
("TH Trucks SRL","Gilău (bei Cluj-Napoca)","Cluj","388 (2023, Termene)","755,9 Mio. Lei (2023)","Chita Gheorghe Ioan 50 %, Turbo's Hoet Group NV 50 %",
 "Autorisierter DAF-Händler und Importeur (auch Isuzu, Tatra Phoenix, VDL Bus), Service, Teile, Reifen, Standorte in Rumänien und Moldau.","https://www.thtrucks.ro",
 "office@thtrucks.ro · +40 372 200 000 · Sitz: Gilău, Str. Lunii 2 (Quelle: thtrucks.ro/sediul-central). HR: thtrucks.ro/contact-hr",
 "Chita Gheorghe Ioan","Gesellschafter 50 % (Termene); keine Führungsperson auf der Seite genannt","Termene",
 "Auf der Firmenseite kein Kanal gefunden (beweist nichts). Ausländischer Partner kann einen haben.","Mehrere Standorte in zwei Ländern, mittelgroß.",3,2,4,
 "Mail an office@thtrucks.ro mit Bitte um Weiterleitung an Geschäftsführung oder Personal. Namen der Verkäufer auf der Seite nicht verwenden.",
 "https://www.thtrucks.ro/sediul-central/ ; https://www.thtrucks.ro"),
("Konsta Splendid SRL","Mediaș","Sibiu","198 (2023), 186 (2025) (Termene)","296,5 Mio. Lei (2023), 232 Mio. (2025)","Alleingesellschafter (Name nicht bestätigt; ein Treffer nennt Florin Stancu)",
 "Großhandel mit Lebensmitteln, Getränken und Tabak (CAEN 4639), gegründet 1994.","(keine Website gefunden)",
 "Keine öffentlichen Kontaktdaten gefunden. Sitz: Șoseaua Ighișului 2A, Mediaș (Termene).",
 "nicht ermittelt","ein Administrator, Name nicht öffentlich einsehbar","Termene",
 "Nicht geprüft.","Genau die Größenklasse, die seit 17.12.2023 einen Kanal braucht. Ein Gesellschafter, kurzer Entscheidungsweg.",5,2,1,
 "Name und Kontakt über Handelsregister oder das eigene Netz klären. Größter Größen-Fit, schlechteste Erreichbarkeit.",
 "https://termene.ro/firma/6630072"),
("Compa SA","Sibiu","Sibiu","1.792 (2023, Termene)","767 Mio. Lei (2023)","Privatpersonen und Firmen (u. a. Deac Ioan 19,45 %)",
 "Industrie-Zulieferer: Werkzeuge, Formen, Kfz-Bauteile, Federn, Stanzteile, Wärmebehandlung, Messtechnik.","https://www.compa.ro",
 "office@compa.ro · +40 269 230 888 · Str. Henri Coandă 8, Sibiu. Generaldirektion: +40 269 237 878. Personal: +40 751 294 117 (Quelle: compa.ro/en/contact)",
 "nicht ermittelt","Generaldirektor und Personalabteilung nur mit Rufnummern genannt","compa.ro",
 "Auf der Firmenseite kein Kanal gefunden (beweist nichts). Wegen der Größe vermutlich schon versorgt.","Kein besonderes Signal gefunden.",3,1,4,
 "Niedrige Priorität. Bei Bedarf Anruf bei der Personalabteilung.",
 "https://www.compa.ro/en/contact ; https://termene.ro/articole/topul-celor-mai-mari-firme-din-sibiu"),
]
for i,r in enumerate(L): pass
L.sort(key=lambda r:-(r[14]+r[15]+r[16]))
wb=Workbook()
H=PatternFill('solid',fgColor='307098');F=Font(bold=True,color='FFFFFF',name='Calibri');thin=Side(style='thin',color='D9DFE3');B=Border(left=thin,right=thin,top=thin,bottom=thin)
def head(ws,cols,widths):
    ws.append(cols)
    for c in ws[1]: c.fill=H;c.font=F;c.alignment=Alignment(wrap_text=True,vertical='center');c.border=B
    for i,w in enumerate(widths,1): ws.column_dimensions[get_column_letter(i)].width=w
    ws.freeze_panes='C2';ws.row_dimensions[1].height=34
ws=wb.active;ws.title='Leads'
cols=['Rang','Firma','Ort','Region','Mitarbeiter','Umsatz','Inhaber','Was die Firma macht','Website','Allgemeine Kontaktdaten (öffentlich)','Ansprechpartner (Name)','Rolle','Quelle Ansprechpartner','Meldekanal vorhanden?','Aufhänger (Signal)','Fit 1-5','Signal 1-5','Erreichbarkeit 1-5','Summe','Nächster Schritt','Quellen']
head(ws,cols,[6,26,20,9,24,22,28,40,28,48,24,28,26,36,44,7,7,10,8,44,60])
for n,r in enumerate(L,1):
    (firma,ort,reg,ma,um,inh,was,web,kont,pn,pr,pq,kan,sig,fit,sg,rea,sch,quel)=r
    ws.append([n,firma,ort,reg,ma,um,inh,was,web,kont,pn,pr,pq,kan,sig,fit,sg,rea,fit+sg+rea,sch,quel])
    row=ws.max_row
    for c in ws[row]: c.alignment=Alignment(wrap_text=True,vertical='top');c.border=B
    if web.startswith('http'):
        cell=ws.cell(row=row,column=9);cell.hyperlink=web.split(' ')[0];cell.font=Font(color='307098',underline='single')
    ws.row_dimensions[row].height=150
ws.auto_filter.ref=ws.dimensions
# --- drafts
SIG_RO={
"Scandia Food SA":"Am citit că Scandia Food își extinde activitatea, inclusiv prin preluări, ceea ce înseamnă colegi noi din firme noi.",
"Punctual Comimpex SRL":"Punctual Comimpex a crescut puternic în ultimii ani și are o echipă de câteva sute de oameni în distribuție.",
"Transavia SA":"Transavia este prezentă în 9 județe și are peste 2.000 de colegi, iar compania continuă să crească.",
"Autoworld SRL":"Autoworld este o afacere de familie cu mai multe mărci și locații în Cluj-Napoca.",
"Farmec SA":"Farmec este un brand cunoscut, iar mulți dintre colegi sunt și acționari ai companiei.",
"Elit SRL (Marca Elit, mezeluri.ro)":"Am văzut pe site-ul dumneavoastră că aveți deja un canal de raportare prin e-mail, conform Legii 361/2022.",
"Con-A Operations SRL (Grupul Con-A)":"Grupul Con-A coordonează șantiere mari, cu mulți colegi și subcontractori.",
"TH Trucks SRL":"TH Trucks are centre în România și Moldova, deci echipe în mai multe locații.",
"Konsta Splendid SRL":"Konsta Splendid are aproximativ 190 de angajați, exact intervalul care are obligația unui canal intern din 17 decembrie 2023.",
"Compa SA":"Compa are o echipă mare și multe departamente tehnice.",
}
SIG_EN={
"Scandia Food SA":"I read that Scandia Food is expanding, including through acquisitions, which means new colleagues from new companies.",
"Punctual Comimpex SRL":"Punctual Comimpex has grown strongly in recent years and has a team of several hundred people in distribution.",
"Transavia SA":"Transavia is present in 9 counties with more than 2,000 colleagues, and the company keeps growing.",
"Autoworld SRL":"Autoworld is a family business with several brands and locations in Cluj-Napoca.",
"Farmec SA":"Farmec is a well-known brand, and many colleagues are also shareholders of the company.",
"Elit SRL (Marca Elit, mezeluri.ro)":"I saw on your website that you already have a reporting channel by e-mail under Law 361/2022.",
"Con-A Operations SRL (Grupul Con-A)":"The Con-A group runs large construction sites with many colleagues and subcontractors.",
"TH Trucks SRL":"TH Trucks has centres in Romania and Moldova, so teams in several locations.",
"Konsta Splendid SRL":"Konsta Splendid has about 190 employees, exactly the band that has needed an internal reporting channel since 17 December 2023.",
"Compa SA":"Compa has a large team and many technical departments.",
}
def ro_body(f):
    s=SIG_RO.get(f) or SIG_RO.get(f.replace('Con-A Operations SRL (Con-A Gruppe)','Con-A Operations SRL (Grupul Con-A)').replace('(Marke Elit, mezeluri.ro)','(Marca Elit, mezeluri.ro)'))
    elit='Elit' in f
    mid=("Un canal prin e-mail poate lăsa urme: adresa expeditorului, jurnalele serverului de e-mail, cine are acces la căsuță. safeline merge pe serverul dumneavoastră, fără conturi, iar persoana care raportează nu trebuie să se identifice, dar poate primi răspunsuri și rămâne anonimă."
         if elit else
         "Legea 361/2022 cere un canal intern de raportare pentru firmele cu cel puțin 50 de angajați. safeline este un astfel de canal: rulează pe serverul dumneavoastră, fără conturi și fără numere de telefon. Cine raportează nu trebuie să se identifice, dar poate primi răspunsuri și rămâne anonim. NexonAI nu operează servere și nu vede mesajele.")
    return f"""Stimate Domn / Stimată Doamnă,

{s}

{mid}

Un lucru în care suntem deschiși: safeline este testat și funcționează, dar nu a fost încă auditat independent. Căutăm câteva companii din zonă pentru un pilot de 60 până la 90 de zile, cu ajutor la instalarea pe propriul server.

Dacă subiectul este de interes, vă propun o discuție de 20 de minute, la dumneavoastră sau online.

Cu stimă,
Gabriel Hategan
NexonAI Consulting SRL, Alba Iulia
unpruuf@nexonai.ro"""
def en_body(f):
    s=SIG_EN.get(f) or SIG_EN.get(f.replace('Con-A Gruppe','Grupul Con-A').replace('(Marke Elit, mezeluri.ro)','(Marca Elit, mezeluri.ro)'))
    elit='Elit' in f
    mid=("An e-mail channel can leave traces: the sender address, mail server logs, who has access to the mailbox. safeline runs on your own server, without accounts, and the person reporting does not have to identify themselves, yet can receive replies and stay anonymous."
         if elit else
         "Law 361/2022 requires an internal reporting channel for companies with at least 50 employees. safeline is such a channel: it runs on your own server, without accounts or phone numbers. The person reporting does not have to identify themselves, yet can receive replies and stay anonymous. NexonAI runs no servers and does not see the messages.")
    return f"""Dear Sir or Madam,

{s}

{mid}

One thing we say openly: safeline is tested and works, but it has not yet been independently audited. We are looking for a few companies in the region for a pilot of 60 to 90 days, with help setting it up on your own server.

If this is of interest, I suggest a 20-minute conversation, at your site or online.

Kind regards,
Gabriel Hategan
NexonAI Consulting SRL, Alba Iulia
unpruuf@nexonai.ro"""
for name,fn,subj in (('Anschreiben RO',ro_body,'Canal de raportare conform Legii 361/2022, pe serverul dumneavoastră'),('Anschreiben EN',en_body,'Whistleblowing channel under Law 361/2022, on your own server')):
    w=wb.create_sheet(name);head(w,['Rang','Firma','An (Rolle / Name laut Recherche)','Betreff','Text','Kanal'],[6,28,34,48,100,36]);w.freeze_panes='C2'
    for n,r in enumerate(L,1):
        f=r[0]
        w.append([n,f,f"{r[10]} ({r[11]})",subj,fn(f),'E-Mail: '+('siehe Kontaktdaten im Blatt Leads' if '@' in r[8] else 'zuerst Kontaktdaten beschaffen')])
        for c in w[w.max_row]: c.alignment=Alignment(wrap_text=True,vertical='top');c.border=B
        w.row_dimensions[w.max_row].height=300
m=wb.create_sheet('Methode und Grenzen')
for line in ["Methode",
"Kein Kundenstamm vorhanden, daher Profil aus Produkt und Gesetz abgeleitet: rumänische Inhaber (kein Konzernkanal), mindestens 50 Beschäftigte, Entscheider erreichbar, Gebiet Alba, Sibiu, Cluj.",
"Pflicht: Richtlinie 2019/1937, Gesetz 361/2022. Ab 250 Beschäftigte seit Dezember 2022, 50 bis 249 seit 17.12.2023.",
"Score: Fit (Größe, Eigentum, Branche), Signal (was gerade passiert), Erreichbarkeit (öffentliche Kontaktdaten, benannte Person). Summe sortiert die Liste.",
"",
"Grenzen",
"Mitarbeiter- und Umsatzzahlen stammen aus Termene.ro und Presse, teils 2023, teils 2025, und widersprechen sich zum Teil (Autoworld, Transavia, Elit). Vor dem Kontakt nachprüfen.",
"Es wurden nur öffentlich auf Firmenseiten und in der Presse gefundene Kontaktdaten übernommen. Es gibt keine persönlichen E-Mail-Adressen oder Telefonnummern von Entscheidern. Nichts wurde geraten.",
"Ansprechpartner sind Personen, die in der Presse oder auf Firmenseiten als Gründer, Inhaber oder Generaldirektor genannt werden. Ob sie für Meldekanäle zuständig sind, ist nicht geprüft. In der Praxis entscheiden Geschäftsführung, Recht oder Personal.",
"Der Satz „Kein Kanal gefunden“ bedeutet nur, dass auf der Firmenseite nichts steht. Ein Kanal kann intern existieren (zum Beispiel bei einem Anwalt).",
"Eine Firma (Elit) hat nachweislich einen Kanal per E-Mail. Sie bleibt als Aufwertungs-Kandidat in der Liste.",
"Die Anschreiben sind Entwürfe. Das Rumänisch hat kein Muttersprachler geprüft. Keine Bußgeldhöhen nennen: Die Quellen widersprechen sich.",
"Vor Versand an Einzelpersonen Art. 6 DSGVO und rumänisches Recht zu Werbe-Mails prüfen. Firmen-Funktionsadressen (office@) sind unkritischer als persönliche Adressen.",
"Stand der Recherche: 19.10.2026."]:
    m.append([line])
    if line in ('Methode','Grenzen'): m.cell(row=m.max_row,column=1).font=Font(bold=True,size=13,color='307098')
    m.cell(row=m.max_row,column=1).alignment=Alignment(wrap_text=True,vertical='top')
m.column_dimensions['A'].width=140
wb.save(SP+'unpruuf_Leads_safeline_2026-10-19_v1.xlsx')
print([ (n+1,r[0],r[14]+r[15]+r[16]) for n,r in enumerate(L)])
