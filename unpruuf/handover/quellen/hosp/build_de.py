import sys,re
sys.path.insert(0,'/home/user/nexonai/design')
from kit import page,section,hero,chip
def tag(t): return f'<span class="ht">{t}</span>'
def idea(i,title,text,uses,fit):
    lab={"s":"Stark","m":"Mit Vorbehalt","n":"Lassen"}[fit]
    return f'<div class="nx-card idea"><div class="idea-top"><span class="hid">{i}</span><span class="fit {fit}">{lab}</span></div><h3>{title}</h3><p>{text}</p><div class="uses">{"".join(tag(u) for u in uses)}</div></div>'
A=[
("H1","Interne Meldestelle nach HinSchG","Pflicht ab 50 Beschäftigten, für 50 bis 249 seit dem 17.12.2023. Themen: Korruption im Gesundheitswesen (§§ 299a, 299b StGB), Abrechnungsbetrug, Gewalt gegen Pflegekräfte, Mobbing, Arbeitsschutz. Viele Häuser nutzen heute eine Anwalts-Ombudsstelle oder einen Software-Dienst. Unser Unterschied: der Server gehört dem Haus.",["safeline"],"s"),
("H2","Notfallkanal bei Cyberangriff","Ein Kommunikationsweg auf Servern außerhalb des Klinik-Netzes, über Mobilfunk erreichbar. Wenn Mail, Intranet und KIS verschlüsselt sind, koordiniert der Krisenstab darüber. Besonders für Häuser mit KRITIS-Pflichten und Meldeprozessen für IT-Störungen.",["Business"],"s"),
("H3","Wiederherstellungs-Schlüssel mit Mehr-Personen-Freigabe","Admin-Passwörter und Backup-Schlüssel versiegelt hinterlegt, Freigabe erst, wenn zwei von drei Verantwortlichen zustimmen (k-aus-n-Regel). Vier-Augen-Prinzip für den Ernstfall.",["Übergabe-Engine"],"s"),
("H4","Datenschutzvorfall melden mit 72-Stunden-Uhr","Beschäftigte melden eine Panne an den Datenschutzbeauftragten, die Frist nach Art. 33 DSGVO läuft sichtbar mit. Fristverwaltung gibt es bei safeline schon.",["safeline"],"s"),
("H5","Patientenbeschwerden und Patientenfürsprecher","Beschwerdemanagement ist für Krankenhäuser verpflichtend. Ein anonymer Kanal per QR-Code auf der Station, mit eigenem Beauftragten und getrennt vom Personalkanal.",["safeline"],"s"),
]
B=[
("H6","Anonyme Beinahe-Fehler-Meldungen (CIRS)","Die Richtlinie verlangt, dass Meldungen freiwillig, anonym und sanktionsfrei möglich sein sollen. Die meisten Häuser haben schon ein System. Unser Mehrwert wäre echte Anonymität auf dem eigenen Server und ein Rückfragekanal ohne Namen.",["safeline"],"m"),
("H7","Kanal für Betriebs- oder Personalrat","Vertrauliche Beratung, die der Arbeitgeber nicht mitliest, wenn der Server bei der Arbeitnehmervertretung steht. Mitbestimmung bei der Einführung jedes Tools klären.",["Business","safeline"],"m"),
("H8","Klinische Ethikberatung","Vertrauliche Fälle (Therapiebegrenzung, Konflikte, Vorwürfe) ohne Mailverteiler und ohne Spuren beraten.",["Business"],"m"),
("H9","Anonyme Fragen an die Leitung","Beschäftigte fragen zu Dienstplänen, Überstunden, Ausstattung. Die Leitung antwortet offen, ohne zu wissen, wer gefragt hat.",["Business"],"m"),
("H10","Meldungen zu Arzneimitteln und Medizinprodukten","An die Arzneimittelkommission oder den Sicherheitsbeauftragten des Hauses, mit Fallverwaltung.",["safeline"],"m"),
("H11","Geschäftsführung, Aufsichtsrat, Recht, Personal","Übernahmen, Personalfragen, Verhandlungen mit Kassen und Lieferanten. Sensibel, aber fern der klinischen Arbeit.",["Business"],"m"),
("H12","Integrität bei Vergabe und Industriekontakten","Hinweise auf Absprachen, überteuerte Geräte und unzulässige Zuwendungen von Herstellern, bei Compliance oder Recht.",["safeline"],"m"),
("H13","Alleinarbeit absichern","Ambulante Pflege, Rettungsdienst, Nachtdienst. Eine Lebenszeichen-Regel alarmiert die Leitstelle, wenn eine Rückmeldung ausbleibt.",["Übergabe-Engine"],"m"),
("H14","Klinikverbünde und Träger-Gruppen","Jeder Standort mit eigenem Server, die zentrale Compliance sieht nur, was sie soll. Ob eine konzernweite Meldestelle zulässig ist, ist juristisch umstritten und muss geprüft werden.",["safeline","Business"],"m"),
]
N=[
("Klinische Alltagskommunikation","Dienstübergabe, Anordnungen, Befundbesprechung. Dafür gibt es in Deutschland geregelte Wege (KIM, TI-Messenger mit gematik-Zulassung), und unser System hat bewusst keine Identitäten und archiviert nichts. Medizinische Dokumentation braucht zuordenbare Absender und Aufbewahrung."),
("Befundübergabe und Zweitmeinung","Mit der elektronischen Patientenakte, KIM und etablierten Teleradiologie-Netzen gibt es Lösungen. Große Bildserien sind für kleine Pakete über Tor ohnehin zu groß."),
("Alles mit Diagnose- oder Therapienähe","Das würde Fragen zum Medizinprodukterecht aufwerfen."),
("Echtzeit-Chat mit Angehörigen","Dafür braucht ihr Identitäten."),
]
grid=lambda items:'<div class="nx-grid g2">'+''.join(idea(*i) for i in items)+'</div>'
def fact(big,text,src): return f'<div class="nx-card"><div class="big">{big}</div><p>{text}</p><p class="src">{src}</p></div>'
a=lambda u,t:f'<a href="{u}" target="_blank" rel="noopener">{t}</a>'
facts='<div class="nx-grid g3">'+''.join([
 fact('HinSchG','Interne Meldestelle ab 50 Beschäftigten, für 50 bis 249 seit 17.12.2023. Bußgeld laut Quellen bis 20.000 Euro. Ob anonyme Kanäle Pflicht sind, ist in den Quellen uneinheitlich, § 16 HinSchG im Wortlaut prüfen. Krankenhaus-Sonderregeln wurden nicht gefunden.',a('https://www.computerwoche.de/a/hinweisgeberschutzgesetz-das-ist-jetzt-zu-tun,3613787','Computerwoche')),
 fact('KRITIS und § 75c','Schwelle: 30.000 vollstationäre Fälle je Standort. Jedes Krankenhaus ist seit 1.1.2022 nach § 75c SGB V zu IT-Sicherheit nach Stand der Technik verpflichtet (B3S). Eine Verordnung nach dem KRITIS-Dachgesetz ist 2026 im Entwurf.',a('https://www.tuvsud.com/de-de/dienstleistungen/auditierung-und-zertifizierung/gesundheitswesen/it-sicherheitssystem','TÜV SÜD')+' · '+a('https://www.dkgev.de/fileadmin/Mediapool/1_DKG/1.3_Politik/Stellungnahmen/2026-06-16_DKG-Stellungnahme_RefE_Kritisverordnung_BMI_final.pdf','DKG, 16.06.2026')),
 fact('NIS2UmsuCG','Seit 6.12.2025 in Kraft, Registrierung beim BSI bis 6.3.2026, rund zwei Drittel der betroffenen Firmen waren zum Stichtag nicht registriert. Wie genau Krankenhäuser eingestuft werden, wurde nicht belegt.',a('https://www.heuking.de/de/news-events/newsletter-fachbeitraege/artikel/ab-jetzt-gilts-nis2-umsetzungsgesetz-in-kraft.html','Heuking')+' · '+a('https://www.klgates.com/de-DE/thought-leadership/Neue-Cyber-Security-Regeln-in-DeutschlandRegistrierungspflicht-Lauft-Am-6-Marz-2026-Ab-3-5-2026','K&L Gates')),
 fact('QM-Richtlinie','Patientenorientiertes Beschwerdemanagement ist verpflichtend. Ein Fehlermeldesystem wie CIRS ist nicht vorgegeben, Meldungen sollen aber freiwillig, anonym und sanktionsfrei möglich sein.',a('https://www.g-ba.de/presse/pressemitteilungen/586','G-BA')),
 fact('Lukaskrankenhaus','Neuss, 2016: Nach dem Ransomware-Angriff lief das Haus offline, Operationen wurden abgesagt, in den ersten 36 Stunden konnten keine Notfälle aufgenommen werden.',a('https://www.computerwoche.de/article/2791586/so-verlief-die-ransomware-attacke-im-lukaskrankenhaus.html','Computerwoche')),
 fact('KIM und TI-Messenger','Für die Kommunikation im Gesundheitswesen gibt es die gematik-Dienste KIM (sichere Mail) und den TI-Messenger. Eine Pflicht für Krankenhäuser ließ sich aus den Quellen nicht ableiten.',a('https://www.apotheke-adhoc.de/nachrichten/detail/e-health/ti-messenger-gedisa-partner-erhaelt-zulassung/','apotheke adhoc')),
])+'</div>'
notgo=''.join(f'<div class="nx-card"><h3>{t}</h3><p>{d}</p></div>' for t,d in N)
qs=["Wer ist heute Ihre interne Meldestelle: intern besetzt, externe Ombudsperson oder Software-Dienst? Was kostet das?","Wie viele Meldungen kommen im Jahr, und wie viele davon anonym?","Wie funktioniert Ihr CIRS, und wer liest die Meldungen?","Was nutzen Sie, wenn die IT ausfällt? Papier, Telefon, Messenger?","Fällt Ihr Haus unter die KRITIS-Schwelle, und welche Nachweise verlangen Sie von Lieferanten (B3S, ISO 27001, Lieferkettenprüfung)?","Wer entscheidet über ein neues Meldetool: Compliance, Datenschutz, Qualitätsmanagement, IT-Sicherheit, Geschäftsführung? Wann wird der Betriebs- oder Personalrat eingebunden?","Wo würde ein Server laufen, im eigenen Rechenzentrum oder bei einem Hoster, und wer würde ihn betreiben?","Was müsste ein Produkt mitbringen, das getestet, aber noch nicht unabhängig auditiert ist, damit Sie es im Pilot ausprobieren?","Welche Daten dürfen das Haus unter keinen Umständen verlassen?"]
qh='<ol class="q">'+''.join(f'<li>{q}</li>' for q in qs)+'</ol>'
body=hero(chip('Interne Ideensammlung · Deutschland'),'Was ein Krankenhaus in Deutschland mit unserem System tun kann.','Vierzehn Ideen, sortiert danach, wie gut sie zu dem passen, was das System wirklich ist: Server des Kunden, keine Identitäten, Pakete, die nach spätestens 24 Stunden verschwinden. Fünf passen stark, neun brauchen Vorsicht, vier Richtungen lassen wir. Deutschland ist ein besetzter Markt mit eigenen Regeln, deshalb unterscheidet sich die Liste von der für Rumänien.')
body+=section('fakten',chip('Ausgangslage'),'Sechs Fakten, die den Rahmen setzen.','Alle Rechtsangaben stammen aus Fachquellen und brauchen vor dem ersten Gespräch einen Anwaltscheck.',facts)
body+=section('stark',chip('Starke Passung'),'Wo das System direkt passt.','Die Meldestelle ist Pflicht und hat einen Käufer. Der Notfallkanal beantwortet einen Schmerz, den jede Klinikleitung kennt.',grid(A),alt=True)
body+=section('vorbehalt',chip('Mit Vorbehalt'),'Gute Ideen, die Anpassung brauchen.','',grid(B))
body+=section('lassen',chip('Lassen'),'Richtungen, die wir nicht gehen.','',f'<div class="nx-grid g2">{notgo}</div>',alt=True)
reco='''<div class="nx-grid g2">
<div class="nx-card"><h3>Stärkste Richtung</h3><p>safeline als interne Meldestelle (H1) zusammen mit dem Notfallkanal (H2), dazu der Beschwerdekanal (H5). Meldestelle und Beschwerdemanagement sind Pflicht und haben einen Käufer. Der Notfallkanal hat einen belegten Schmerz. Alles läuft ohne Identitäten, ohne Archivproblem und ohne Medizinprodukte-Frage.</p></div>
<div class="nx-card"><h3>Riskanteste Annahme</h3><p>Dass ein deutsches Haus ein ungeprüftes Produkt von einem rumänischen Anbieter kauft, obwohl es Anwalts-Ombudsstellen und eingeführte Hinweisgeber-Software gibt. Dazu kommen Nachweise (B3S, ISO 27001, Lieferkettenprüfung) und die Mitbestimmung von Betriebs- oder Personalrat bei jedem neuen Tool.</p></div>
<div class="nx-card"><h3>Voraussetzungen für Deutschland</h3><p>Deutschsprachige Unterlagen (Website, Impressum, Datenschutz, Vertrag), juristische Klärung zur Auftragsverarbeitung (NexonAI ist normalerweise keiner, solange kein Datenzugriff besteht, ein Jurist muss es bestätigen) und möglichst eine Referenz aus dem Pilot.</p></div>
<div class="nx-card"><h3>Nächster Schritt</h3><p>Drei Gespräche mit Datenschutz oder Compliance, Qualitätsmanagement und IT-Sicherheit, am besten bei einem privaten oder kirchlichen Haus, dazu ein Gespräch mit einer Arbeitnehmervertretung. Zuerst fragen, wie Hinweise heute ankommen. Eine Seite für Krankenhäuser kommt danach.</p></div>
<div class="nx-card"><h3>Geparkt</h3><p>Alleinarbeit (H13) und Klinikverbünde (H14). Beide sind gut, brauchen aber entweder die App auf privaten Telefonen oder eine juristische Klärung zur Konzernlösung.</p></div></div>'''
body+=section('position',chip('Position'),'Wo wir anfangen würden.','',reco)
body+=section('fragen',chip('Gespräche'),'Fragen für die ersten drei Häuser.','In dieser Reihenfolge fragen. Die ersten beiden zeigen den echten Ablauf, bevor ein Produkt zur Sprache kommt.',qh,alt=True)
body+='<section class="nx-section"><div class="nx-wrap"><p class="nx-note">Stand: safeline und Business sind getestet und funktionieren. Press, Ghost Mode und die Client-App sind keine fertigen Produkte. Kein unabhängiges Audit, keine Zertifizierung. Die Rechtsangaben stammen aus Sekundärquellen. Zusammengestellt am 19. Oktober 2026.</p></div></section>'
html=page('Krankenhaus-Ideen Deutschland',('INTERN','Ideensammlung · Krankenhäuser DE','Ideensammlung · Krankenhäuser DE'),[('fakten','Fakten','Fakten'),('stark','Stark','Stark'),('vorbehalt','Vorbehalt','Vorbehalt'),('lassen','Lassen','Lassen'),('position','Position','Position'),('fragen','Fragen','Fragen')],body,footer_note=('© 2026 NexonAI Consulting SRL. Nicht auditiert, nicht zertifiziert.','© 2026 NexonAI Consulting SRL. Nicht auditiert, nicht zertifiziert.'))
html=re.sub(r'<div class="nx-lang".*?</div></div></header>','</div></header>',html,flags=re.S)
html=html.replace('<span>gabriel@nexonai.ro</span><span>+40 773 829 646</span>','<span>unpruuf@nexonai.ro</span>')
html=html.replace('<span>EN / RO</span>','<span>DE</span>')
css='''<style>
.nx-grid.g2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:20px}
.nx-grid.g3{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:20px}
.idea{display:flex;flex-direction:column;gap:10px;min-width:0}.idea h3{font-size:19px;line-height:1.3;margin:0}.idea p{margin:0;color:var(--on-variant);line-height:1.6}
.idea-top{display:flex;justify-content:space-between;align-items:center}
.hid{font:700 12px "DejaVu Sans Mono",monospace;letter-spacing:.08em;color:var(--primary)}
.fit{font:600 10px "DejaVu Sans Mono",monospace;letter-spacing:.08em;text-transform:uppercase;padding:3px 8px;border-radius:999px}
.fit.s{background:#e3eef6;color:#1f5578}.fit.m{background:#f8e7d6;color:#a8500f}.fit.n{background:#e3e8eb;color:#505b63}
.uses{display:flex;flex-wrap:wrap;gap:6px;margin-top:auto}.ht{font:600 10px "DejaVu Sans Mono",monospace;letter-spacing:.06em;text-transform:uppercase;background:var(--surface-mid);color:var(--on-variant);padding:3px 8px;border-radius:6px}
.big{font:800 24px "Open Sans",sans-serif;letter-spacing:-.02em;color:var(--primary);margin-bottom:8px}.nx-card p{line-height:1.6}.src{font-size:13px;color:var(--on-variant)}.src a{color:var(--primary);text-decoration:underline}
.q{margin:0;padding-left:22px;display:grid;gap:12px;max-width:760px;font-size:16px;line-height:1.6}.nx-note{max-width:820px;font-size:13px;line-height:1.6;color:var(--on-variant)}
</style>'''
out='<meta name="claude:viewport-fit-sides" content="cover">\n'+html+css
open('krankenhaus_de.html','w').write(out);print(len(out))
