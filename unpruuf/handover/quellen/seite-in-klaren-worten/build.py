from html import escape as E

LOGO_DARK = open('logo_dark.b64').read()
import sys
MODE = sys.argv[1] if len(sys.argv) > 1 else 'artifact'
LOGO_SRC = ('data:image/png;base64,' + LOGO_DARK) if MODE == 'artifact' else 'assets/nexonai-logo.png'
if MODE == 'artifact':
    FONT_LINKS = '''<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600&display=swap">'''
else:
    FONT_LINKS = '<link rel="stylesheet" href="fonts.css">'



def T(en, ro):
    """Both languages inline; CSS shows one."""
    return f'<span data-l="en">{en}</span><span data-l="ro">{ro}</span>'


def row(label_en, label_ro, body_html, cls=''):
    return f'''<div class="row {cls}"><div class="lab">{T(label_en, label_ro)}</div><div class="txt">{body_html}</div></div>'''


def p(en, ro):
    return f'<p>{T(en, ro)}</p>'


def section(sid, eyebrow, h2, body):
    return f'''<section id="{sid}">
<div class="sh"><div class="eyebrow">{T(*eyebrow)}</div><h2>{T(*h2)}</h2></div>
<div class="rows">
{body}
</div>
</section>
'''


# ---------------------------------------------------------------- diagram
def svg_flow(lang):
    L = {
        'en': dict(label='Diagram: Anna writes to Ben. Her phone puts a sealed package into her own mailbox. Ben\'s phone looks into that mailbox and takes the package. The two phones are never connected.',
                   anna="Anna's phone", ben="Ben's phone", box="Anna's mailbox", box2='on her organisation\'s server',
                   a1='puts in the sealed package', a2='looks in, asks for its label', a3='hands over the package',
                   none='no direct connection', pk='sealed'),
        'ro': dict(label='Schemă: Anna îi scrie lui Ben. Telefonul ei pune un pachet sigilat în propria cutie poștală. Telefonul lui Ben se uită în acea cutie și ia pachetul. Cele două telefoane nu sunt niciodată conectate.',
                   anna='Telefonul Annei', ben='Telefonul lui Ben', box='Cutia poștală a Annei', box2='pe serverul organizației ei',
                   a1='pune pachetul sigilat', a2='se uită, cere după etichetă', a3='predă pachetul',
                   none='nicio conexiune directă', pk='sigilat'),
    }[lang]
    return f'''<svg data-l="{lang}" viewBox="0 0 860 330" role="img" aria-label="{E(L['label'])}" xmlns="http://www.w3.org/2000/svg">
<defs>
<marker id="ah-{lang}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--accent)"/></marker>
</defs>
<!-- no direct line -->
<path d="M95 146 C 95 -10, 765 -10, 765 146" fill="none" stroke="var(--warm)" stroke-width="2" stroke-dasharray="6 6"/>
<g transform="translate(430 29)"><circle r="14" fill="var(--bg)" stroke="var(--warm)" stroke-width="2"/><path d="M-6 -6 L6 6 M6 -6 L-6 6" stroke="var(--warm)" stroke-width="2.5" stroke-linecap="round"/></g>
<text x="430" y="72" text-anchor="middle" font-size="14" fill="var(--warm)" font-weight="600">{E(L['none'])}</text>
<!-- phones -->
<g>
<rect x="30" y="150" width="130" height="110" rx="16" fill="var(--surface)" stroke="currentColor" stroke-width="2"/>
<rect x="46" y="166" width="98" height="62" rx="6" fill="var(--accent-soft)"/>
<circle cx="95" cy="244" r="4" fill="currentColor" opacity=".5"/>
<text x="95" y="292" text-anchor="middle" font-size="15" font-weight="600" fill="currentColor">{E(L['anna'])}</text>
</g>
<g>
<rect x="700" y="150" width="130" height="110" rx="16" fill="var(--surface)" stroke="currentColor" stroke-width="2"/>
<rect x="716" y="166" width="98" height="62" rx="6" fill="var(--accent-soft)"/>
<circle cx="765" cy="244" r="4" fill="currentColor" opacity=".5"/>
<text x="765" y="292" text-anchor="middle" font-size="15" font-weight="600" fill="currentColor">{E(L['ben'])}</text>
</g>
<!-- mailbox -->
<g>
<rect x="350" y="140" width="160" height="130" rx="8" fill="var(--surface)" stroke="currentColor" stroke-width="2"/>
<rect x="368" y="160" width="124" height="14" rx="3" fill="var(--accent-soft)" stroke="currentColor" stroke-width="1.5"/>
<rect x="368" y="184" width="124" height="14" rx="3" fill="var(--accent-soft)" stroke="currentColor" stroke-width="1.5"/>
<rect x="368" y="208" width="124" height="14" rx="3" fill="var(--accent)" stroke="currentColor" stroke-width="1.5"/>
<rect x="368" y="232" width="124" height="14" rx="3" fill="var(--accent-soft)" stroke="currentColor" stroke-width="1.5"/>
<text x="430" y="292" text-anchor="middle" font-size="15" font-weight="600" fill="currentColor">{E(L['box'])}</text>
<text x="430" y="312" text-anchor="middle" font-size="12.5" fill="var(--dim)">{E(L['box2'])}</text>
</g>
<!-- arrows -->
<line x1="164" y1="205" x2="344" y2="205" stroke="var(--accent)" stroke-width="2.5" marker-end="url(#ah-{lang})"/>
<text x="254" y="190" text-anchor="middle" font-size="13" fill="currentColor">{E(L['a1'])}</text>
<line x1="696" y1="180" x2="516" y2="180" stroke="var(--accent)" stroke-width="2.5" stroke-dasharray="3 5" marker-end="url(#ah-{lang})"/>
<text x="606" y="166" text-anchor="middle" font-size="13" fill="currentColor">{E(L['a2'])}</text>
<line x1="516" y1="230" x2="696" y2="230" stroke="var(--accent)" stroke-width="2.5" marker-end="url(#ah-{lang})"/>
<text x="606" y="250" text-anchor="middle" font-size="13" fill="currentColor">{E(L['a3'])}</text>
</svg>'''


# ---------------------------------------------------------------- content
sections = []

sections.append(section('identity', ('Identity', 'Identitate'), ('There are no identities.', 'Nu există identități.'),
    row('What it is', 'Ce este',
        p('No account. No username. No phone number. No e-mail address. Nowhere in the system is there a list of who uses it.',
          'Fără cont. Fără nume de utilizator. Fără număr de telefon. Fără adresă de e-mail. Nicăieri în sistem nu există o listă cu cine îl folosește.')) +
    row('How it works', 'Cum funcționează',
        p('To add a colleague, you show a code on your screen and they scan it. That code has no name in it. It is made new for that one person and for nobody else. The name you see in your chat list is one you typed yourself, and it exists only on your phone.',
          'Ca să adaugi un coleg, îi arăți un cod pe ecran, iar el îl scanează. Codul nu conține niciun nume. Este creat nou pentru acea persoană și pentru nimeni altcineva. Numele pe care îl vezi în lista de conversații l-ai scris tu și există doar pe telefonul tău.') +
        p('Two of your contacts cannot find out that they both talk to you by comparing notes. The codes and keys you gave them have nothing in common.',
          'Două dintre contactele tale nu pot afla, comparând notițe, că vorbesc amândouă cu tine. Codurile și cheile pe care li le-ai dat nu au nimic în comun.')) +
    row('What it means', 'Ce înseamnă',
        p('What does not exist cannot be stolen, sold or handed over. Whoever gets into the system finds no list of people to go after.',
          'Ce nu există nu poate fi furat, vândut sau predat. Cine pătrunde în sistem nu găsește nicio listă de oameni de urmărit.')) +
    row('Good to know', 'De reținut',
        p('The person you add knows who you are, because you met them. The system does not.',
          'Persoana pe care o adaugi știe cine ești, pentru că v-ați întâlnit. Sistemul nu știe.'), 'note')
))

sections.append(section('third-party', ('Data', 'Date'), ('No outside party holds your data.', 'Nicio parte terță nu are datele tale.'),
    row('What it is', 'Ce este',
        p('Your messages do not pass through a cloud, a provider\'s account or a company in the middle. There is no central place where everybody\'s data collects.',
          'Mesajele tale nu trec printr-un cloud, printr-un cont la un furnizor sau printr-o firmă la mijloc. Nu există un loc central în care să se adune datele tuturor.')) +
    row('How it works', 'Cum funcționează',
        p('The mailboxes sit on servers that your own organisation runs or rents itself. NexonAI runs no servers. We supply the software. We are not part of the path and we receive nothing.',
          'Cutiile poștale se află pe servere pe care organizația ta le operează sau le închiriază singură. NexonAI nu operează servere. Furnizăm software-ul. Nu facem parte din traseu și nu primim nimic.') +
        p('We can neither read your system nor control it. There is no wire to us.',
          'Nu putem nici să vă citim sistemul, nici să-l controlăm de la distanță. Nu există niciun fir către noi.')) +
    row('What it means', 'Ce înseamnă',
        p('Your data stays with you. No contract with an outside service is needed to keep it that way, because there is no outside service.',
          'Datele rămân la tine. Nu ai nevoie de un contract cu un serviciu extern ca să rămână așa, pentru că nu există un serviciu extern.')) +
    row('Good to know', 'De reținut',
        p('A hosting company that rents you a machine supplies the hardware, like a landlord. What lies on that machine is sealed, so the landlord cannot read messages either. Without servers of your own, someone else would be involved, and this page would no longer hold in full.',
          'O firmă de găzduire care îți închiriază o mașină oferă hardware-ul, ca un proprietar de imobil. Ce se află pe mașină este sigilat, deci nici proprietarul nu poate citi mesajele. Fără servere proprii ar fi implicat altcineva, iar această pagină nu ar mai fi valabilă în întregime.'), 'note')
))

sections.append(section('direct', ('Connection', 'Conexiune'), ('Your phone never talks directly to anyone.', 'Telefonul tău nu vorbește niciodată direct cu nimeni.'),
    row('What it is', 'Ce este',
        p('Two phones never connect to each other. Neither phone ever learns where the other one is.',
          'Două telefoane nu se conectează niciodată între ele. Niciunul nu află vreodată unde se află celălalt.')) +
    row('How it works', 'Cum funcționează',
        p('Think of letterboxes. When I write to you, I do not walk to your door. I put the sealed letter into my own mailbox, in my own post office. When we first meet, I tell you once where my mailbox is and give you the key to the lock that belongs to the two of us. From then on your phone looks into my mailbox now and then and takes what is meant for you.',
          'Gândește-te la cutii poștale. Când îți scriu, nu merg la ușa ta. Pun scrisoarea sigilată în propria mea cutie, în propriul meu oficiu poștal. La prima întâlnire îți spun o singură dată unde este cutia mea și îți dau cheia lacătului care aparține nouă doi. De atunci, telefonul tău se uită din când în când în cutia mea și ia ce îți este destinat.') +
        p('When you answer, you do the same in your mailbox, and my phone looks there. I never address anyone else. I only put something on my own server and let someone know where to look.',
          'Când răspunzi, faci la fel în cutia ta, iar telefonul meu se uită acolo. Eu nu adresez niciodată pe altcineva. Pun doar ceva pe propriul meu server și spun cuiva unde să se uite.')) +
    row('What it means', 'Ce înseamnă',
        p('Each mailbox holds only what its owner wrote. So no single mailbox ever contains a whole conversation, and nobody can see a line drawn between two phones, because there is none.',
          'Fiecare cutie conține doar ce a scris proprietarul ei. Astfel, nicio cutie nu conține vreodată o conversație întreagă și nimeni nu poate vedea o linie între două telefoane, pentru că nu există.')) +
    row('Good to know', 'De reținut',
        p('Someone who could watch all mailboxes and all networks at the same moment could still compare the times when things happen. That is a limit of every system of this kind.',
          'Cine ar putea urmări simultan toate cutiile și toate rețelele ar putea totuși compara momentele în care se întâmplă lucruri. Este o limită a oricărui sistem de acest fel.'), 'note')
))

sections.append(section('owner', ('Access', 'Acces'), ('Even you, as the owner, cannot read it.', 'Nici tu, ca proprietar, nu poți citi.'),
    row('What it is', 'Ce este',
        p('The server is built so that its owner has no access to the content. Not you, not your IT staff, not us.',
          'Serverul este construit astfel încât proprietarul lui să nu aibă acces la conținut. Nici tu, nici personalul tău IT, nici noi.')) +
    row('How it works', 'Cum funcționează',
        p('A message is sealed on the phone before it leaves it. The seal opens only on the phones of the two people who are talking. The server only ever holds sealed packages. It has no key to open them. A package disappears by itself after the time chosen for that chat, 24 hours at most.',
          'Mesajul este sigilat pe telefon înainte să plece de pe el. Sigiliul se deschide doar pe telefoanele celor doi oameni care vorbesc. Serverul păstrează doar pachete sigilate. Nu are nicio cheie ca să le deschidă. Un pachet dispare singur după timpul ales pentru acea conversație, cel mult 24 de ore.')) +
    row('What it means', 'Ce înseamnă',
        p('Whoever breaks in finds digital scrap. There is no vault here that is worth cracking. Nothing is left lying around: everything is gone after a day at the latest. Your server is a passage, not a storage.',
          'Cine sparge găsește gunoi digital. Aici nu există niciun seif care să merite forțat. Nu rămâne nimic la vedere: totul dispare după cel mult o zi. Serverul tău este un loc de trecere, nu un depozit.') +
        p('If someone asks the organisation for data from the server, there are sealed packages that nobody can open, and none of them is older than a day.',
          'Dacă cineva cere organizației date de pe server, există pachete sigilate pe care nimeni nu le poate deschide, iar niciunul nu este mai vechi de o zi.')) +
    row('What an owner can see', 'Ce poate vedea un proprietar',
        p('That packages arrive and leave, when, and roughly how big they are. No words, no names.',
          'Că sosesc și pleacă pachete, când, și cam cât de mari sunt. Fără cuvinte, fără nume.')) +
    row('Good to know', 'De reținut',
        p('The phones are a different matter. Someone who holds an unlocked phone sees what is on it. That is why the app has a PIN, a panic PIN that wipes everything, and messages that live only in memory and vanish after a few minutes. What an authority or a court may demand from an organisation is a legal question. What we can state is what exists on the server: sealed packages that are gone within a day.',
          'Telefoanele sunt altceva. Cine ține un telefon deblocat vede ce se află pe el. De aceea aplicația are PIN, un PIN de panică ce șterge tot și mesaje care trăiesc doar în memorie și dispar după câteva minute. Ce poate cere o autoritate sau o instanță de la o organizație este o chestiune juridică. Ce putem afirma este ce există pe server: pachete sigilate, care dispar în cel mult o zi.'), 'note')
))

# ---- message flow
flow_steps = [
    ('Anna\'s phone seals the message. Only Ben\'s phone can open the seal.',
     'Telefonul Annei sigilează mesajul. Doar telefonul lui Ben poate deschide sigiliul.'),
    ('It does not send the package to Ben. It puts it into Anna\'s own mailbox, on her organisation\'s server, under a label. Only Anna and Ben can work out today\'s label, and it changes every hour.',
     'Nu trimite pachetul lui Ben. Îl pune în propria cutie poștală a Annei, pe serverul organizației ei, sub o etichetă. Doar Anna și Ben pot calcula eticheta de azi, iar ea se schimbă în fiecare oră.'),
    ('Ben\'s phone looks into Anna\'s mailbox regularly and asks only for packages with their label. Nobody else knows which ones those are.',
     'Telefonul lui Ben se uită regulat în cutia Annei și cere doar pachetele cu eticheta lor. Nimeni altcineva nu știe care sunt acelea.'),
    ('Ben\'s phone takes the package, opens the seal and shows the message under the name Ben gave Anna in his own address book. On the phone it exists only in memory and disappears when he leaves the app or after a few minutes.',
     'Telefonul lui Ben ia pachetul, deschide sigiliul și arată mesajul sub numele pe care Ben i l-a dat Annei în propriul carnet de adrese. Pe telefon există doar în memorie și dispare când iese din aplicație sau după câteva minute.'),
    ('In Anna\'s mailbox the package waits until its time is up, 1, 6 or 24 hours as chosen for this chat. Then it is gone. Ben\'s answer travels the same way in the other direction, through Ben\'s mailbox.',
     'În cutia Annei pachetul așteaptă până expiră timpul, 1, 6 sau 24 de ore, cum s-a ales pentru această conversație. Apoi dispare. Răspunsul lui Ben merge la fel în sens invers, prin cutia lui Ben.'),
]
steps_html = '<ol class="steps">' + ''.join(f'<li>{T(*s)}</li>' for s in flow_steps) + '</ol>'

who_rows = [
    (("Anna's phone", 'Telefonul Annei'), ('Everything she wrote and received. Her own address book.', 'Tot ce a scris și a primit. Propriul ei carnet de adrese.')),
    (("Ben's phone", 'Telefonul lui Ben'), ('Everything he wrote and received. Anna under the name he gave her.', 'Tot ce a scris și a primit. Pe Anna sub numele pe care i l-a dat.')),
    (("Anna's mailbox", 'Cutia Annei'), ('A sealed package, the label it carries today, when it arrived and roughly how big it is. No names, no words.', 'Un pachet sigilat, eticheta de azi, când a sosit și cam cât de mare este. Fără nume, fără cuvinte.')),
    (("Ben's mailbox", 'Cutia lui Ben'), ('Nothing about this message. It holds only what Ben wrote himself.', 'Nimic despre acest mesaj. Conține doar ce a scris Ben însuși.')),
    (('NexonAI', 'NexonAI'), ('Nothing. We run no servers and are not on the path.', 'Nimic. Nu operăm servere și nu suntem pe traseu.')),
]
who_html = ('<div class="tablewrap"><table><thead><tr><th>' + T('Who', 'Cine') + '</th><th>' + T('knows', 'știe') + '</th></tr></thead><tbody>'
            + ''.join(f'<tr><th scope="row">{T(*a)}</th><td>{T(*b)}</td></tr>' for a, b in who_rows) + '</tbody></table></div>')

CAP = T("Anna writes to Ben. The package goes into Anna's mailbox and Ben fetches it from there. The two phones are never connected.",
        'Anna îi scrie lui Ben. Pachetul intră în cutia Annei, iar Ben îl ia de acolo. Cele două telefoane nu sunt niciodată conectate.')
figure = '<figure class="fig">' + svg_flow('en') + svg_flow('ro') + '<figcaption>' + CAP + '</figcaption></figure>'

sections.append(section('message', ('A message', 'Un mesaj'), ('What happens when a message is sent.', 'Ce se întâmplă când se trimite un mesaj.'),
    row('Picture', 'Imagine', figure, 'wide') +
    row('Step by step', 'Pas cu pas', steps_html) +
    row('If Ben is offline', 'Dacă Ben este offline',
        p('The package waits in Anna\'s mailbox. If Ben opens the app before its time is up, he gets it.',
          'Pachetul așteaptă în cutia Annei. Dacă Ben deschide aplicația înainte să expire timpul, îl primește.')) +
    row('Who knows what', 'Cine ce știe', who_html, 'wide')
))

# ---- unpruuf Compliance
sl_steps = [
    ('The organisation shows one code for everybody: on a poster, on the intranet, on a card. Never one code per person, because a personal code could point to a person.',
     'Organizația afișează un singur cod pentru toți: pe un poster, pe intranet, pe un card. Niciodată un cod per persoană, pentru că un cod personal ar putea duce la o persoană.'),
    ('A reporter scans it with the unpruuf Compliance app. No account, no name, no phone number.',
     'Persoana care raportează îl scanează cu aplicația unpruuf Compliance. Fără cont, fără nume, fără număr de telefon.'),
    ('The app opens the case by itself. It hands the reporting office a sealed introduction, so that the office can answer. Nobody copies or pastes anything.',
     'Aplicația deschide singură cazul. Predă biroului de raportare o prezentare sigilată, ca biroul să poată răspunde. Nimeni nu copiază și nu lipește nimic.'),
    ('On the office\'s laptop the case appears with a random case number. The office sends a confirmation of receipt back, and the reporter sees it in the app under My case. The law gives 7 days for that confirmation.',
     'Pe laptopul biroului apare cazul cu un număr de caz aleatoriu. Biroul trimite înapoi confirmarea de primire, iar persoana care raportează o vede în aplicație, la Cazul meu. Legea dă 7 zile pentru această confirmare.'),
    ('Both sides write in the case. The status (new, confirmed, in progress, closed) and the deadlines are tracked in the office\'s dashboard. Feedback is due within 3 months.',
     'Ambele părți scriu în caz. Starea (nou, confirmat, în lucru, închis) și termenele sunt urmărite în panoul biroului. Răspunsul pe fond este datorat în cel mult 3 luni.'),
]
sl_steps_html = '<ol class="steps">' + ''.join(f'<li>{T(*s)}</li>' for s in sl_steps) + '</ol>'

split = f'''<div class="split">
<div class="col"><h3>{T('What unpruuf Compliance does', 'Ce face unpruuf Compliance')}</h3>
<ul>
<li>{T('Opens a case from a scan, with no registration', 'Deschide un caz dintr-o scanare, fără înregistrare')}</li>
<li>{T('Gives every case a random number and its own keys', 'Dă fiecărui caz un număr aleatoriu și chei proprii')}</li>
<li>{T('Sends the receipt and every status change back', 'Trimite înapoi confirmarea și fiecare schimbare de stare')}</li>
<li>{T('Tracks the legal deadlines', 'Urmărește termenele legale')}</li>
<li>{T('Captures no identity unless the reporter gives one', 'Nu captează nicio identitate, decât dacă persoana o indică')}</li>
</ul></div>
<div class="col"><h3>{T('What stays with the organisation', 'Ce rămâne la organizație')}</h3>
<ul>
<li>{T('The legal basis for handling the data', 'Temeiul juridic al prelucrării datelor')}</li>
<li>{T('Informing people who are named in a report', 'Informarea persoanelor menționate într-o raportare')}</li>
<li>{T('How long a case is kept, and deleting what is no longer needed', 'Cât timp se păstrează un caz și ștergerea a ceea ce nu mai este necesar')}</li>
<li>{T('Reporting a data breach to the authority where required', 'Notificarea unei încălcări a securității datelor către autoritate, când este cazul')}</li>
<li>{T('The contract with the hosting provider', 'Contractul cu furnizorul de găzduire')}</li>
</ul></div>
</div>'''

sections.append(section('compliance', ('Reports', 'Raportări'), ('unpruuf Compliance: the reporting channel.', 'unpruuf Compliance: canalul de raportare.'),
    row('What it is', 'Ce este',
        p('unpruuf Compliance is the reporting channel for organisations. Employees and others can report a concern safely, and the office that handles reports can answer without knowing who wrote.',
          'unpruuf Compliance este canalul de raportare pentru organizații. Angajații și alte persoane pot raporta o problemă în siguranță, iar biroul care tratează raportările poate răspunde fără să știe cine a scris.') +
        p('EU Directive 2019/1937 requires organisations with 50 or more employees to offer such a channel. In Romania this is Law 361/2022.',
          'Directiva UE 2019/1937 cere organizațiilor cu 50 sau mai mulți angajați să ofere un astfel de canal. În România este Legea 361/2022.')) +
    row('How a report goes', 'Cum decurge o raportare', sl_steps_html) +
    row('Each report stands alone', 'Fiecare raportare este separată',
        p('Two reports from one phone look like two unrelated people. A reporter may give their name if they wish. A reporter can remove a case from their own phone at any time; the office keeps its record.',
          'Două raportări de pe același telefon arată ca doi oameni fără legătură. Persoana care raportează își poate da numele, dacă dorește. Poate șterge un caz de pe propriul telefon oricând; biroul își păstrează evidența.')) +
    row('Who does what', 'Cine ce face', split, 'wide') +
    row('Good to know', 'De reținut',
        p('Deleting or exporting a single case from the office\'s dashboard is not built yet. Cases on the office laptop are protected by a password that cannot be recovered. unpruuf Compliance supports the principles of data protection. The organisation remains the one responsible, and its data protection officer or lawyer decides how it fits.',
          'Ștergerea sau exportul unui singur caz din panoul biroului nu este încă construit. Cazurile de pe laptopul biroului sunt protejate cu o parolă care nu poate fi recuperată. unpruuf Compliance sprijină principiile protecției datelor. Organizația rămâne responsabilă, iar responsabilul ei cu protecția datelor sau juristul ei hotărăște cum se potrivește.'), 'note')
))

nav = [('identity', ('No identities', 'Fără identități')), ('third-party', ('No outside party', 'Nicio parte terță')),
       ('direct', ('No direct line', 'Fără legătură directă')), ('owner', ('Not even the owner', 'Nici proprietarul')),
       ('message', ('A message', 'Un mesaj')), ('compliance', ('Compliance', 'Conformitate'))]
nav_html = ''.join(f'<a href="#{i}">{T(*t)}</a>' for i, t in nav)

limits = f'''<section id="limits">
<div class="sh"><div class="eyebrow">{T('Honest status', 'Stadiu sincer')}</div><h2>{T('What this page does not say.', 'Ce nu spune această pagină.')}</h2></div>
<ul class="limits">
<li>{T('Nobody has audited unpruuf independently yet. It is not certified.', 'Nimeni nu a auditat încă unpruuf în mod independent. Nu este certificat.')}</li>
<li>{T('A phone that someone holds unlocked shows what is on it.', 'Un telefon ținut deblocat arată ce se află pe el.')}</li>
<li>{T('Someone who could watch every network at once could still compare when things happen.', 'Cine ar putea urmări toate rețelele simultan ar putea totuși compara momentele în care se întâmplă lucruri.')}</li>
<li>{T('We do not say that using unpruuf makes an organisation compliant with data protection law. How it is used and run decides that.', 'Nu afirmăm că folosirea unpruuf face o organizație conformă cu legea protecției datelor. Aceasta depinde de felul în care este folosit și operat.')}</li>
</ul>
</section>'''

JS = r'''
(function(){
  var root=document.documentElement, btns=[].slice.call(document.querySelectorAll('.lang button'));
  function get(){try{return localStorage.getItem('unpruuf-plain-lang');}catch(e){return null;}}
  function put(l){try{localStorage.setItem('unpruuf-plain-lang',l);}catch(e){}}
  function set(l){
    root.setAttribute('data-lang',l); root.setAttribute('lang',l);
    btns.forEach(function(b){b.setAttribute('aria-pressed', b.getAttribute('data-set')===l ? 'true':'false');});
  }
  /* Order: link (#ro / #en), then the visitor's own earlier choice, then Romania, then English.
     "Romania" = the browser's first language is Romanian, or the device clock is set to Bucharest time.
     A page without a server cannot see the country of a visitor's connection. */
  function detect(){
    var h=(location.hash||'').replace('#','');
    if(h==='ro'||h==='en') return h;
    var saved=get(); if(saved==='ro'||saved==='en') return saved;
    var first=((navigator.languages&&navigator.languages[0])||navigator.language||'').toLowerCase();
    if(first.indexOf('ro')===0) return 'ro';
    var tz=''; try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'';}catch(e){}
    if(tz==='Europe/Bucharest') return 'ro';
    return 'en';
  }
  set(detect());
  btns.forEach(function(b){b.addEventListener('click',function(){var n=b.getAttribute('data-set');set(n);put(n);});});
})();
'''

CSS = '''
:root{
  /* Layout: one reading column; each section is label/text rows divided by hairlines, like a printed explainer. Light only. */
  color-scheme:light;
  --bg:#F4F7F6; --surface:#FFFFFF; --ink:#12201E; --dim:#46564F; --line:#D5DEDB;
  --deep:#E1EFEC; --on-deep:#12201E; --on-deep-dim:#3C5450;
  --accent:#0F6B62; --accent-soft:#DDEFEC; --warm:#A8500F; --warm-soft:#F8E7D6; --warm-ink:#5E300A;
  --f-display:"Archivo","Segoe UI",system-ui,sans-serif; --f-body:"IBM Plex Sans","Segoe UI",system-ui,sans-serif;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--ink);font-family:var(--f-body);font-size:17px;line-height:1.6;margin:0;
  padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:0 56px}
[data-l="ro"]{display:none}
html[data-lang="ro"] [data-l="ro"]{display:revert}
html[data-lang="ro"] [data-l="en"]{display:none}
.wrap{max-width:1040px;margin-inline:auto}
a{color:var(--accent)}
a:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
h1,h2,h3{font-family:var(--f-display);text-wrap:balance;margin:0}
p{margin:0 0 12px;max-width:62ch}
p:last-child{margin-bottom:0}

.top{display:flex;flex-wrap:wrap;gap:12px 24px;align-items:center;justify-content:space-between;padding-block:16px}
.logo img{height:46px;width:auto;display:block}
.lang{display:flex;gap:4px;background:var(--line);border-radius:10px;padding:3px}
.lang button{font:600 13px/1 var(--f-body);letter-spacing:.06em;color:var(--dim);background:transparent;border:0;border-radius:8px;padding:9px 14px;min-height:36px;cursor:pointer}
.lang button[aria-pressed="true"]{background:var(--accent);color:#fff}

.hero{background:var(--deep);color:var(--on-deep);border:1px solid var(--line);border-radius:18px;padding:clamp(28px,5vw,56px);display:flex;flex-direction:column;gap:22px}
.hero .eyebrow{color:var(--on-deep-dim)}
.hero h1{font-weight:800;font-size:clamp(34px,6vw,60px);line-height:1.05;letter-spacing:-.02em}
.hero .lede{font-size:clamp(18px,2.2vw,21px);line-height:1.5;color:var(--on-deep-dim);max-width:36em;margin:0}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{font-size:13px;font-weight:600;letter-spacing:.03em;padding:5px 12px;border-radius:999px;border:1px solid rgba(18,32,30,.28);color:var(--on-deep);background:rgba(255,255,255,.55)}
.cond{background:var(--warm-soft);color:var(--warm-ink);border-radius:12px;padding:16px 20px;margin-top:20px;max-width:none}
.cond b{font-weight:600}
.idea{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-top:20px}
.idea>div{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:18px 20px}
.idea h3{font-size:18px;margin-bottom:6px}
.idea p{color:var(--dim);font-size:16px}

nav.toc{display:flex;flex-wrap:wrap;gap:8px;padding-block:24px 8px}
nav.toc a{font-size:14px;font-weight:500;color:var(--ink);text-decoration:none;border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:7px 14px}
nav.toc a:hover{border-color:var(--accent)}

.eyebrow{font-size:13px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
section{padding-block:56px 0;min-width:0}
.sh{display:flex;flex-direction:column;gap:8px;margin-bottom:20px;max-width:760px}
.sh h2{font-weight:700;font-size:clamp(26px,3.6vw,38px);line-height:1.12;letter-spacing:-.01em}
.rows{border-top:1px solid var(--line)}
.row{display:grid;grid-template-columns:minmax(120px,200px) minmax(0,1fr);gap:8px 40px;padding-block:20px;border-bottom:1px solid var(--line)}
.lab{font-size:13px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);padding-top:3px}
.txt{min-width:0}
.row.note{background:var(--warm-soft);border-radius:12px;border-bottom:0;margin-top:14px;padding-inline:20px}
.row.note .lab{color:var(--warm)}
.row.note .txt{color:var(--warm-ink)}
.row.wide{grid-template-columns:1fr}
.row.wide .lab{padding-top:0}

.steps{margin:0;padding:0;list-style:none;counter-reset:s;display:flex;flex-direction:column;gap:14px;max-width:70ch}
.steps li{counter-increment:s;display:grid;grid-template-columns:32px minmax(0,1fr);gap:14px;align-items:start}
.steps li::before{content:counter(s);width:32px;height:32px;border-radius:50%;background:var(--accent);color:var(--surface);font:700 15px/32px var(--f-display);text-align:center}

.fig{margin:0;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px}
.fig svg{width:100%;height:auto;display:block;color:var(--ink);font-family:var(--f-body)}
.fig svg[data-l="ro"]{display:none}
html[data-lang="ro"] .fig svg[data-l="ro"]{display:block}
html[data-lang="ro"] .fig svg[data-l="en"]{display:none}
.fig figcaption{font-size:15px;color:var(--dim);margin-top:10px}

.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
table{border-collapse:collapse;width:100%;min-width:520px;font-size:16px}
th,td{text-align:left;vertical-align:top;padding:12px 16px;border-bottom:1px solid var(--line)}
thead th{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);font-weight:600}
tbody th{font-weight:600;width:22%}
tr:last-child th,tr:last-child td{border-bottom:0}

.split{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
.col{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:20px}
.col h3{font-size:18px;margin-bottom:10px}
.col ul{margin:0;padding-left:1.1rem;display:flex;flex-direction:column;gap:7px}

.limits{margin:0;padding:24px 24px 24px 2.6rem;display:flex;flex-direction:column;gap:10px;background:var(--surface);border:1px solid var(--line);border-radius:14px}
.limits li{max-width:68ch}

footer{margin-top:56px;background:var(--deep);color:var(--on-deep);border:1px solid var(--line);border-radius:18px;padding:32px clamp(24px,4vw,40px);display:flex;flex-wrap:wrap;gap:12px 40px;justify-content:space-between;align-items:center}
footer h2{font-weight:700;font-size:24px}
footer .c{display:flex;flex-direction:column;gap:2px;font-size:18px;font-weight:500;user-select:all}
footer small{display:block;color:var(--on-deep-dim);font-size:14px;margin-top:6px}

@media (max-width:720px){
  .row{grid-template-columns:1fr;gap:6px}
  .row.note{padding-inline:16px}
  body{font-size:16px}
}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
'''

html = f'''<title>unpruuf in plain words</title>
<meta name="claude:viewport-fit-sides" content="cover">
{FONT_LINKS}
<style>{CSS}</style>
<div class="wrap">
<div class="top">
  <div class="logo"><img alt="NexonAI Consulting" src="{LOGO_SRC}"></div>
  <div class="lang" role="group" aria-label="Language / Limba"><button type="button" data-set="en" aria-pressed="true">EN</button><button type="button" data-set="ro" aria-pressed="false">RO</button></div>
</div>
<header class="hero">
  <div class="eyebrow">{T('For organisations', 'Pentru organizații')}</div>
  <h1>{T('unpruuf in plain words', 'unpruuf pe înțelesul tuturor')}</h1>
  <p class="lede">{T('What it is and how it works, one question at a time. No technical background needed.', 'Ce este și cum funcționează, pe rând. Nu ai nevoie de cunoștințe tehnice.')}</p>
  <div class="chips"><span class="chip">{T('Status 14 October 2026', 'Stadiul la 14 octombrie 2026')}</span><span class="chip">{T('Tested by us', 'Testat de noi')}</span><span class="chip">{T('No independent audit yet', 'Fără audit independent încă')}</span><span class="chip">{T('Not certified', 'Necertificat')}</span></div>
</header>
<p class="cond">{T('<b>One condition for everything on this page.</b> Every organisation runs its own servers. If someone else runs them, that someone is involved, and what follows no longer holds in full.',
                    '<b>O condiție pentru tot ce urmează.</b> Fiecare organizație își operează propriile servere. Dacă le operează altcineva, acel altcineva este implicat, iar ce urmează nu mai este valabil în întregime.')}</p>
<div class="idea">
  <div><h3>{T('Two parts', 'Două părți')}</h3><p>{T('A phone to write on, and a server of your own: your own post office.', 'Un telefon cu care scrii și un server propriu: propriul tău oficiu poștal.')}</p></div>
  <div><h3>{T('My server, my rules', 'Serverul meu, regulile mele')}</h3><p>{T('Everything sits on your own side. Nobody in the middle has a say.', 'Totul rămâne de partea ta. Nimeni la mijloc nu are cuvânt de spus.')}</p></div>
  <div><h3>{T('No names', 'Fără nume')}</h3><p>{T('The system knows mailboxes and locks, not people.', 'Sistemul cunoaște cutii poștale și lacăte, nu oameni.')}</p></div>
</div>
<nav class="toc" aria-label="Sections">{nav_html}</nav>
{''.join(sections)}
{limits}
<footer>
  <div><h2>{T('Questions?', 'Întrebări?')}</h2><small>NexonAI Consulting SRL · Alba Iulia</small></div>
  <div class="c"><span>gabriel@nexonai.ro</span><span>+40 773 829 646</span></div>
</footer>
</div>
<script>{JS}</script>
'''
if MODE == 'site':
    i = html.index('<div class="wrap">')
    head = html[:i].replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
    html = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
            '<meta name="description" content="What unpruuf is and how it works, in plain words. English and Romanian.">\n'
            + head + '</head>\n<body>\n' + html[i:] + '</body>\n</html>\n')
out = 'unpruuf-plain-words.html' if MODE == 'artifact' else 'site/index.html'
import os
os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
open(out, 'w', encoding='utf-8').write(html)
print(len(html))
