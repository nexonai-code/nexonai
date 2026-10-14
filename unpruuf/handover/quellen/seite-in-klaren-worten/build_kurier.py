import re, sys, os
from html import escape as E

SRC = open('build.py', encoding='utf-8').read()
# reuse the look and the language logic of the "plain words" page
exec(re.search(r"JS = r'''.*?'''\n", SRC, re.S).group(0))
exec(re.search(r"CSS = '''.*?'''\n", SRC, re.S).group(0))
CSS += '''
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:18px 20px}
.card h3{font-size:18px;margin-bottom:6px}
.card p{font-size:16px;color:var(--dim)}
.fn{font-size:14px;color:var(--dim);max-width:62ch}
'''

LOGO_DARK = open('logo_dark.b64').read()
MODE = sys.argv[1] if len(sys.argv) > 1 else 'artifact'
LOGO_SRC = ('data:image/png;base64,' + LOGO_DARK) if MODE == 'artifact' else 'assets/nexonai-logo.png'
if MODE == 'artifact':
    FONT_LINKS = '''<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600&display=swap">'''
else:
    FONT_LINKS = '<link rel="stylesheet" href="fonts.css">'


def T(en, ro):
    return f'<span data-l="en">{en}</span><span data-l="ro">{ro}</span>'


def p(en, ro):
    return f'<p>{T(en, ro)}</p>'


def row(le, lr, body, cls=''):
    return f'<div class="row {cls}"><div class="lab">{T(le, lr)}</div><div class="txt">{body}</div></div>'


def section(sid, eyebrow, h2, body):
    return f'''<section id="{sid}"><div class="sh"><div class="eyebrow">{T(*eyebrow)}</div><h2>{T(*h2)}</h2></div><div class="rows">{body}</div></section>
'''


def steps(items):
    return '<ol class="steps">' + ''.join(f'<li>{T(*s)}</li>' for s in items) + '</ol>'


# ------------------------------------------------------------ diagrams
def grid(x, y, cols, rows, size, gap, hi=None):
    out = []
    for r in range(rows):
        for c in range(cols):
            cx, cy = x + c * (size + gap), y + r * (size + gap)
            on = hi == (r, c)
            out.append(f'<rect x="{cx}" y="{cy}" width="{size}" height="{size}" rx="2" fill="{"var(--accent)" if on else "var(--accent-soft)"}" stroke="currentColor" stroke-width="{1.6 if on else 1}"/>')
    return ''.join(out)


def svg_lockers(lang):
    L = {
        'en': dict(label='Diagram: one parcel locker with about 100 compartments, in front of the other lockers of the service. One compartment is highlighted. A service has 250 lockers.',
                   c1='one locker', c2='about 100 compartments', c3='one compartment opens only', c4='with its own pickup code',
                   m1='250 lockers per service', m2='all yours, on your own servers'),
        'ro': dict(label='Schemă: un automat de colete cu aproximativ 100 de compartimente, în fața celorlalte automate ale serviciului. Un compartiment este evidențiat. Un serviciu are 250 de automate.',
                   c1='un automat', c2='circa 100 de compartimente', c3='un compartiment se deschide doar', c4='cu propriul cod de ridicare',
                   m1='250 de automate per serviciu', m2='toate ale tale, pe serverele tale'),
    }[lang]
    ghosts = ''.join(f'<rect x="{60 + d * 16}" y="{40 - d * 12}" width="214" height="214" rx="10" fill="var(--surface)" stroke="currentColor" stroke-width="1.5" opacity="{0.55 - d * 0.12}"/>' for d in (3, 2, 1))
    return f'''<svg data-l="{lang}" viewBox="0 0 860 300" role="img" aria-label="{E(L['label'])}" xmlns="http://www.w3.org/2000/svg">
{ghosts}
<rect x="60" y="40" width="214" height="214" rx="10" fill="var(--surface)" stroke="currentColor" stroke-width="2.2"/>
{grid(74, 54, 10, 10, 15, 4.6, hi=(3, 6))}
<text x="167" y="282" text-anchor="middle" font-size="15" font-weight="600" fill="currentColor">{E(L['c1'])}</text>
<line x1="276" y1="105" x2="420" y2="105" stroke="currentColor" stroke-width="1.5"/>
<text x="430" y="101" font-size="15" font-weight="600" fill="currentColor">{E(L['c2'])}</text>
<line x1="203" y1="119" x2="420" y2="170" stroke="var(--accent)" stroke-width="1.8"/>
<text x="430" y="166" font-size="15" fill="currentColor">{E(L['c3'])}</text>
<text x="430" y="186" font-size="15" fill="currentColor">{E(L['c4'])}</text>
<text x="430" y="40" font-size="22" font-weight="800" fill="var(--accent)" style="font-family:var(--f-display)">{E(L['m1'])}</text>
<text x="430" y="62" font-size="14" fill="var(--dim)">{E(L['m2'])}</text>
</svg>'''


def key_icon(x, y):
    return f'<g transform="translate({x} {y})" fill="none" stroke="var(--warm)" stroke-width="2.2" stroke-linecap="round"><circle cx="0" cy="0" r="6"/><path d="M6 0 H22 M16 0 V6 M21 0 V5"/></g>'


def svg_flow(lang):
    L = {
        'en': dict(label='Diagram: Anna\'s phone puts a locked parcel into a compartment of one of her lockers. Ben\'s phone shows the pickup code at that locker and receives the parcel. Both phones hold the second key; the locker holds none. The phones are never connected.',
                   anna="Anna's phone", ben="Ben's phone", locker="Anna's locker", sub='her own server', a1='locks the parcel, puts it in', a2='shows the pickup code', a3='hands over the parcel',
                   none='no direct connection', k='second key', nk='no key'),
        'ro': dict(label='Schemă: telefonul Annei pune un colet încuiat într-un compartiment al unuia dintre automatele ei. Telefonul lui Ben arată codul de ridicare la acel automat și primește coletul. Ambele telefoane au a doua cheie; automatul nu are niciuna. Telefoanele nu sunt niciodată conectate.',
                   anna='Telefonul Annei', ben='Telefonul lui Ben', locker='Automatul Annei', sub='serverul ei propriu', a1='încuie coletul, îl pune înăuntru', a2='arată codul de ridicare', a3='predă coletul',
                   none='nicio conexiune directă', k='a doua cheie', nk='fără cheie'),
    }[lang]
    return f'''<svg data-l="{lang}" viewBox="0 0 860 340" role="img" aria-label="{E(L['label'])}" xmlns="http://www.w3.org/2000/svg">
<defs><marker id="ak-{lang}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--accent)"/></marker></defs>
<path d="M95 146 C 95 -10, 765 -10, 765 146" fill="none" stroke="var(--warm)" stroke-width="2" stroke-dasharray="6 6"/>
<g transform="translate(430 29)"><circle r="14" fill="var(--bg)" stroke="var(--warm)" stroke-width="2"/><path d="M-6 -6 L6 6 M6 -6 L-6 6" stroke="var(--warm)" stroke-width="2.5" stroke-linecap="round"/></g>
<text x="430" y="72" text-anchor="middle" font-size="14" font-weight="600" fill="var(--warm)">{E(L['none'])}</text>
<g><rect x="30" y="150" width="130" height="110" rx="16" fill="var(--surface)" stroke="currentColor" stroke-width="2"/><rect x="46" y="166" width="98" height="62" rx="6" fill="var(--accent-soft)"/><circle cx="95" cy="244" r="4" fill="currentColor" opacity=".5"/>
<text x="95" y="286" text-anchor="middle" font-size="15" font-weight="600" fill="currentColor">{E(L['anna'])}</text></g>
<g><rect x="700" y="150" width="130" height="110" rx="16" fill="var(--surface)" stroke="currentColor" stroke-width="2"/><rect x="716" y="166" width="98" height="62" rx="6" fill="var(--accent-soft)"/><circle cx="765" cy="244" r="4" fill="currentColor" opacity=".5"/>
<text x="765" y="286" text-anchor="middle" font-size="15" font-weight="600" fill="currentColor">{E(L['ben'])}</text></g>
{key_icon(58, 316)}<text x="90" y="321" font-size="13" fill="var(--warm)" font-weight="600">{E(L['k'])}</text>
{key_icon(728, 316)}<text x="760" y="321" font-size="13" fill="var(--warm)" font-weight="600">{E(L['k'])}</text>
<g><rect x="350" y="120" width="160" height="150" rx="8" fill="var(--surface)" stroke="currentColor" stroke-width="2"/>
{grid(362, 132, 6, 6, 18, 5.5, hi=(2, 3))}
<text x="430" y="292" text-anchor="middle" font-size="15" font-weight="600" fill="currentColor">{E(L['locker'])}</text>
<text x="430" y="311" text-anchor="middle" font-size="12.5" fill="var(--dim)">{E(L['sub'])} · {E(L['nk'])}</text></g>
<line x1="164" y1="196" x2="344" y2="196" stroke="var(--accent)" stroke-width="2.5" marker-end="url(#ak-{lang})"/>
<text x="254" y="180" text-anchor="middle" font-size="13" fill="currentColor">{E(L['a1'])}</text>
<line x1="696" y1="176" x2="516" y2="176" stroke="var(--accent)" stroke-width="2.5" stroke-dasharray="3 5" marker-end="url(#ak-{lang})"/>
<text x="606" y="160" text-anchor="middle" font-size="13" fill="currentColor">{E(L['a2'])}</text>
<line x1="516" y1="226" x2="696" y2="226" stroke="var(--accent)" stroke-width="2.5" marker-end="url(#ak-{lang})"/>
<text x="606" y="246" text-anchor="middle" font-size="13" fill="currentColor">{E(L['a3'])}</text>
</svg>'''


def figure(svgs, cap):
    return '<figure class="fig">' + ''.join(svgs) + '<figcaption>' + cap + '</figcaption></figure>'


sections = []

# 1 -- the service
sections.append(section('service', ('The idea', 'Ideea'), ('You run your own courier service.', 'Îți conduci propriul serviciu de curierat.'),
    row('What it is', 'Ce este',
        p('Imagine a courier service that belongs only to you. It has parcel lockers, like the easybox lockers many people know. You own 250 of them. Each locker has about 100 compartments.',
          'Imaginează-ți un serviciu de curierat care aparține doar ție. Are automate de colete, ca easybox-urile pe care le știu mulți. Ai 250 dintre ele. Fiecare automat are circa 100 de compartimente.') +
        p('No other courier is involved. Nobody delivers for you, and nobody keeps a list of your parcels.',
          'Niciun alt curier nu este implicat. Nimeni nu livrează în locul tău și nimeni nu ține o listă cu coletele tale.')) +
    row('Picture', 'Imagine', figure([svg_lockers('en'), svg_lockers('ro')],
        T('One locker with its compartments, in front of the other lockers of the service.', 'Un automat cu compartimentele lui, în fața celorlalte automate ale serviciului.')), 'wide') +
    row('How it works', 'Cum funcționează',
        p('A parcel is never handed to a person. It is put into a compartment of one of your lockers and waits there until the right person comes. After one day at most, the compartment empties by itself.',
          'Un colet nu este predat niciodată unei persoane. Este pus într-un compartiment al unuia dintre automatele tale și așteaptă acolo până vine persoana potrivită. După cel mult o zi, compartimentul se golește singur.')) +
    row('What it means', 'Ce înseamnă',
        p('The service is yours. NexonAI supplies the lockers and the app. We do not run them, see them or open them. We can neither read your system nor control it. There is no wire to us.',
          'Serviciul este al tău. NexonAI furnizează automatele și aplicația. Nu le operăm, nu le vedem și nu le deschidem. Nu putem nici să vă citim sistemul, nici să-l controlăm de la distanță. Nu există niciun fir către noi.')) +
    row('Good to know', 'De reținut',
        p('The 100 compartments per locker is a planning figure from our calculation. It has not yet been measured under real load. The 250 lockers are what one service has.',
          'Cele 100 de compartimente per automat sunt o cifră de planificare, din calculul nostru. Nu a fost încă măsurată sub încărcare reală. Cele 250 de automate sunt cât are un serviciu.'), 'note')
))

# 2 -- a parcel
flow = [
    ("Anna writes. Her phone packs the message into a parcel and locks it with a second key that only Ben's phone has.",
     'Anna scrie. Telefonul ei împachetează mesajul într-un colet și îl încuie cu o a doua cheie pe care o are doar telefonul lui Ben.'),
    ('Her phone puts the parcel into a compartment of one of her own lockers. Only Anna can put things into her lockers.',
     'Telefonul ei pune coletul într-un compartiment al unuia dintre propriile ei automate. Doar Anna poate pune ceva în automatele ei.'),
    ('Anna told Ben once which lockers are hers. Anna and Ben can both work out today\'s pickup code for the compartment. Nobody else can. The code changes every hour.',
     'Anna i-a spus lui Ben o dată care automate sunt ale ei. Anna și Ben pot calcula amândoi codul de ridicare de azi pentru compartiment. Nimeni altcineva nu poate. Codul se schimbă în fiecare oră.'),
    ("Ben's phone goes to the locker, shows the pickup code and receives the parcel.",
     'Telefonul lui Ben merge la automat, arată codul de ridicare și primește coletul.'),
    ("With the second key, Ben's phone opens the parcel and shows the message under the name Ben gave Anna in his own address book. Without that key it would be a locked box.",
     'Cu a doua cheie, telefonul lui Ben deschide coletul și arată mesajul sub numele pe care Ben i l-a dat Annei în propriul carnet de adrese. Fără acea cheie ar fi o cutie încuiată.'),
    ('The compartment empties by itself when its time is up: 1, 6 or 24 hours, as chosen for this chat. Ben\'s answer travels the same way, through Ben\'s lockers.',
     'Compartimentul se golește singur când expiră timpul: 1, 6 sau 24 de ore, cum s-a ales pentru această conversație. Răspunsul lui Ben merge la fel, prin automatele lui Ben.'),
]
sections.append(section('parcel', ('A message', 'Un mesaj'), ('How a parcel travels.', 'Cum călătorește un colet.'),
    row('Picture', 'Imagine', figure([svg_flow('en'), svg_flow('ro')],
        T("Anna's phone puts a locked parcel into her locker, and Ben's phone fetches it there. The phones are never connected.",
          'Telefonul Annei pune un colet încuiat în automatul ei, iar telefonul lui Ben îl ia de acolo. Telefoanele nu sunt niciodată conectate.')), 'wide') +
    row('Step by step', 'Pas cu pas', steps(flow)) +
    row('If Ben is offline', 'Dacă Ben este offline',
        p('The parcel waits in its compartment. If Ben opens the app before the time is up, he gets it.',
          'Coletul așteaptă în compartiment. Dacă Ben deschide aplicația înainte să expire timpul, îl primește.'))
))

# 3 -- three things
rows3 = [
    (('The right locker', 'Automatul potrivit'), ('Which of the lockers holds the parcel. Anna tells Ben once.', 'Care dintre automate ține coletul. Anna îi spune lui Ben o dată.')),
    (('The pickup code', 'Codul de ridicare'), ('Opens one compartment. Only Anna and Ben can work it out, and it changes every hour.', 'Deschide un compartiment. Doar Anna și Ben îl pot calcula, iar el se schimbă în fiecare oră.')),
    (('The second key', 'A doua cheie'), ('Opens the parcel itself. It exists only on the two phones.', 'Deschide coletul însuși. Există doar pe cele două telefoane.')),
]
who3 = [
    (('Only the locker', 'Doar automatul'), ('Nothing. No compartment opens without its code.', 'Nimic. Niciun compartiment nu se deschide fără codul lui.')),
    (('Locker and pickup code', 'Automat și cod de ridicare'), ('Gets the locked parcel. Cannot open it. Taking it changes nothing: the parcel stays in its compartment until its time is up.', 'Primește coletul încuiat. Nu îl poate deschide. Ridicarea nu schimbă nimic: coletul rămâne în compartiment până expiră timpul.')),
    (('Locker, code and second key', 'Automat, cod și a doua cheie'), ('Reads the message. That is only Anna\'s phone and Ben\'s phone.', 'Citește mesajul. Acestea sunt doar telefonul Annei și telefonul lui Ben.')),
    (('You, as owner of the service', 'Tu, ca proprietar al serviciului'), ('You hold the lockers. You can see that parcels arrive, when, and roughly how big they are. You cannot open them, because the second key is only on the two phones.', 'Ții automatele. Vezi că sosesc colete, când, și cam cât de mari sunt. Nu le poți deschide, pentru că a doua cheie se află doar pe cele două telefoane.')),
]
def tbl(head, rows_):
    return ('<div class="tablewrap"><table><thead><tr><th>' + T(*head[0]) + '</th><th>' + T(*head[1]) + '</th></tr></thead><tbody>'
            + ''.join(f'<tr><th scope="row">{T(*a)}</th><td>{T(*b)}</td></tr>' for a, b in rows_) + '</tbody></table></div>')

sections.append(section('keys', ('Keys', 'Chei'), ('Locker, pickup code, second key.', 'Automat, cod de ridicare, a doua cheie.'),
    row('Three things', 'Trei lucruri', tbl((('Thing', 'Element'), ('What it does', 'Ce face')), rows3), 'wide') +
    row('Who can do what', 'Cine ce poate', tbl((('Someone who has', 'Cine are'), ('can', 'poate')), who3), 'wide')
))

# 4 -- consequences
cards = [
    (('No identities', 'Fără identități'), ('The lockers know compartments and codes. They know no names, no phone numbers, no accounts.', 'Automatele cunosc compartimente și coduri. Nu cunosc nume, numere de telefon sau conturi.')),
    (('No outside party', 'Nicio parte terță'), ('The lockers are yours, on your own servers. Nobody in the middle holds your data.', 'Automatele sunt ale tale, pe serverele tale. Nimeni la mijloc nu are datele tale.')),
    (('No direct connection', 'Fără legătură directă'), ('The phones never meet. They only ever meet at a locker.', 'Telefoanele nu se întâlnesc niciodată. Se întâlnesc doar la un automat.')),
    (('Not even you can read it', 'Nici tu nu poți citi'), ('Whoever breaks in finds digital scrap. There is no vault here worth cracking. Everything is gone after a day at most. Your service is a passage, not a storage.', 'Cine sparge găsește gunoi digital. Aici nu există niciun seif care să merite forțat. Totul dispare după cel mult o zi. Serviciul tău este un loc de trecere, nu un depozit.')),
]
cards_html = '<div class="cards">' + ''.join(f'<div class="card"><h3>{T(*a)}</h3><p>{T(*b)}</p></div>' for a, b in cards) + '</div>'
sections.append(section('why', ('Consequences', 'Consecințe'), ('What follows from this.', 'Ce rezultă de aici.'),
    row('Four results', 'Patru rezultate', cards_html, 'wide') +
    row('Good to know', 'De reținut',
        p('A phone that someone holds unlocked shows what is on it. That is why the app has a PIN, a panic PIN that wipes everything, and messages that live only in memory and vanish after a few minutes. What an authority or a court may demand from an organisation is a legal question. What we can state is what exists on the lockers: locked parcels that are gone within a day.',
          'Un telefon ținut deblocat arată ce se află pe el. De aceea aplicația are PIN, un PIN de panică ce șterge tot și mesaje care trăiesc doar în memorie și dispar după câteva minute. Ce poate cere o autoritate sau o instanță de la o organizație este o chestiune juridică. Ce putem afirma este ce există în automate: colete încuiate, care dispar în cel mult o zi.'), 'note')
))

# 5 -- many services
sections.append(section('many', ('Growing', 'Creștere'), ('Run as many services as you like, side by side.', 'Rulează câte servicii vrei, unul lângă altul.'),
    row('What it is', 'Ce este',
        p('You can run several courier services at the same time. Each one is another set of lockers. Ten services are 2,500 lockers.',
          'Poți rula mai multe servicii de curierat în același timp. Fiecare este un alt set de automate. Zece servicii înseamnă 2.500 de automate.')) +
    row('How it works', 'Cum funcționează',
        p('For every contact the app picks three lockers, from different services where possible. If up to two of them are out of order, the parcel still arrives. When you need more room you add a service. Nothing is rebuilt.',
          'Pentru fiecare contact, aplicația alege trei automate, de la servicii diferite, pe cât se poate. Dacă până la două sunt defecte, coletul ajunge totuși. Când ai nevoie de mai mult loc, adaugi un serviciu. Nu se reconstruiește nimic.') +
        p('One app can hold the lockers of several services at once, up to four full services on one phone.',
          'O singură aplicație poate ține automatele mai multor servicii simultan, până la patru servicii întregi pe un telefon.')) +
    row('Use them together', 'Folosește-le împreună',
        p('Everybody only ever puts parcels into their own lockers and fetches from the lockers of the others. So it works across services, and across organisations: people on different services can write to each other.',
          'Fiecare pune colete doar în propriile automate și ridică din automatele celorlalți. Așa că funcționează între servicii și între organizații: oamenii de pe servicii diferite își pot scrie.'))
))

nav = [('service', ('The idea', 'Ideea')), ('parcel', ('A parcel', 'Un colet')), ('keys', ('Keys', 'Chei')), ('why', ('Consequences', 'Consecințe')), ('many', ('Many services', 'Mai multe servicii'))]
nav_html = ''.join(f'<a href="#{i}">{T(*t)}</a>' for i, t in nav)

limits = f'''<section id="limits"><div class="sh"><div class="eyebrow">{T('Honest status', 'Stadiu sincer')}</div><h2>{T('What this page does not say.', 'Ce nu spune această pagină.')}</h2></div>
<ul class="limits">
<li>{T('Nobody has audited unpruuf independently yet. It is not certified.', 'Nimeni nu a auditat încă unpruuf în mod independent. Nu este certificat.')}</li>
<li>{T('Someone who could watch every network at once could still compare when things happen.', 'Cine ar putea urmări toate rețelele simultan ar putea totuși compara momentele în care se întâmplă lucruri.')}</li>
<li>{T('We do not say that using unpruuf makes an organisation compliant with data protection law. How it is used and run decides that.', 'Nu afirmăm că folosirea unpruuf face o organizație conformă cu legea protecției datelor. Aceasta depinde de felul în care este folosit și operat.')}</li>
</ul></section>'''

body = f'''<div class="wrap">
<div class="top"><div class="logo"><img alt="NexonAI Consulting" src="{LOGO_SRC}"></div>
<div class="lang" role="group" aria-label="Language / Limba"><button type="button" data-set="en" aria-pressed="true">EN</button><button type="button" data-set="ro" aria-pressed="false">RO</button></div></div>
<header class="hero">
<div class="eyebrow">{T('For organisations', 'Pentru organizații')}</div>
<h1>{T('Your own courier service', 'Propriul tău serviciu de curierat')}</h1>
<p class="lede">{T('unpruuf works like parcel lockers that only you own. Here is how a parcel travels, and who can open what.', 'unpruuf funcționează ca niște automate de colete care aparțin doar ție. Iată cum călătorește un colet și cine ce poate deschide.')}</p>
<div class="chips"><span class="chip">{T('Status 14 October 2026', 'Stadiul la 14 octombrie 2026')}</span><span class="chip">{T('Tested by us', 'Testat de noi')}</span><span class="chip">{T('No independent audit yet', 'Fără audit independent încă')}</span><span class="chip">{T('Not certified', 'Necertificat')}</span></div>
</header>
<p class="cond">{T('<b>One condition for everything on this page.</b> Every organisation runs its own servers. If someone else runs them, that someone is involved, and what follows no longer holds in full.',
                    '<b>O condiție pentru tot ce urmează.</b> Fiecare organizație își operează propriile servere. Dacă le operează altcineva, acel altcineva este implicat, iar ce urmează nu mai este valabil în întregime.')}</p>
<nav class="toc" aria-label="Sections">{nav_html}</nav>
{''.join(sections)}
{limits}
<footer><div><h2>{T('Questions?', 'Întrebări?')}</h2><small>NexonAI Consulting SRL · Alba Iulia</small></div>
<div class="c"><span>gabriel@nexonai.ro</span><span>+40 773 829 646</span></div></footer>
</div>
<script>{JS}</script>
'''

head_common = f'''<title>Your own courier service</title>
{{META}}{FONT_LINKS}
<style>{CSS}</style>
'''
if MODE == 'artifact':
    html = head_common.replace('{META}', '<meta name="claude:viewport-fit-sides" content="cover">\n') + body
    out = 'unpruuf-courier.html'
else:
    html = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
            '<meta name="description" content="unpruuf explained as your own courier service: parcel lockers, pickup code and second key. English and Romanian.">\n'
            + head_common.replace('{META}', '') + '</head>\n<body>\n' + body + '</body>\n</html>\n')
    out = 'site-kurier/index.html'
os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
open(out, 'w', encoding='utf-8').write(html)
print(out, len(html))
