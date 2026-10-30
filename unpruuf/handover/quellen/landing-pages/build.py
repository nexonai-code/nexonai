# -*- coding: utf-8 -*-
from html import escape as E

T = {
"de": dict(code="DE", name="Deutsch", doc_lang="de",
 eyebrow="unpruuf Business",
 h1="Du bekommst eigene Briefkästen.",
 sub="Jeder wirft nur in seine eigenen ein. Der andere holt nur ab. Und die Briefkästen wissen nicht, wer wer ist.",
 h_parts="Zwei Teile, ein System",
 parts=[("Das Programm","Läuft auf einem Windows-PC, Laptop oder Server. Es erzeugt 250 anonyme Briefkästen. Sie gehören dir, wir haben keinen Zugriff."),
        ("Die App","Auf dem Handy. Mit ihr schreibst du und holst du ab.")],
 h_flow="So läuft ein Gespräch",
 steps=[("Einmal koppeln","Zwei Menschen koppeln ihre Apps per QR-Code. Dabei tauschen sie die Adressen von je 3 Briefkästen, keine Namen und keine Nummern."),
        ("Nur in die eigenen schreiben","Ab dann schreibt jeder nur in seine eigenen Briefkästen."),
        ("Nur abholen","Der andere holt dort nur ab. Das geht in beide Richtungen.")],
 svg=dict(aria="Anna schreibt in ihre drei Briefkästen, Ben holt dort ab. Ben schreibt in seine drei Briefkästen, Anna holt dort ab.",
          a="Anna", b="Ben", boxA="Annas Briefkästen", boxB="Bens Briefkästen", write="schreibt", pick="holt ab"),
 cap="Jede Richtung hat ihre eigenen Briefkästen.",
 h_why="Darum",
 why=[("Keine direkte Verbindung","Zwischen den beiden gibt es keine direkte Verbindung."),
      ("Briefkästen ohne Gesicht","Die Briefkästen wissen nicht, wem sie gehören und wer abholt."),
      ("Verschlüsselt und flüchtig","Alles ist verschlüsselt, und nach spätestens 24 Stunden ist es weg.")],
 h_cta="Mehr erfahren", cta="Schreib uns oder ruf an.",
 foot="NexonAI Consulting SRL · Alba Iulia"),
"en": dict(code="EN", name="English", doc_lang="en",
 eyebrow="unpruuf Business",
 h1="You get your own mailboxes.",
 sub="Everyone drops only into their own. The other person only picks up. And the mailboxes do not know who is who.",
 h_parts="Two parts, one system",
 parts=[("The program","Runs on a Windows PC, laptop or server. It creates 250 anonymous mailboxes. They belong to you, and we have no access."),
        ("The app","On the phone. You write and pick up with it.")],
 h_flow="How a conversation works",
 steps=[("Pair once","Two people pair their apps by QR code. In doing so they swap the addresses of 3 mailboxes each, no names and no numbers."),
        ("Write only into your own","From then on, each person writes only into their own mailboxes."),
        ("Only pick up","The other person only picks up from there. This works in both directions.")],
 svg=dict(aria="Anna writes into her three mailboxes, Ben picks up there. Ben writes into his three mailboxes, Anna picks up there.",
          a="Anna", b="Ben", boxA="Anna's mailboxes", boxB="Ben's mailboxes", write="writes", pick="picks up"),
 cap="Each direction has its own mailboxes.",
 h_why="That is why",
 why=[("No direct connection","There is no direct connection between the two."),
      ("Mailboxes without a face","The mailboxes do not know who owns them or who picks up."),
      ("Encrypted and short-lived","Everything is encrypted, and after 24 hours at the latest it is gone.")],
 h_cta="Learn more", cta="Write to us or call.",
 foot="NexonAI Consulting SRL · Alba Iulia"),
"ro": dict(code="RO", name="Română", doc_lang="ro",
 eyebrow="unpruuf Business",
 h1="Primiți cutii poștale proprii.",
 sub="Fiecare depune doar în ale sale. Celălalt doar ridică. Iar cutiile nu știu cine este cine.",
 h_parts="Două părți, un singur sistem",
 parts=[("Programul","Rulează pe un PC cu Windows, un laptop sau un server. Creează 250 de cutii poștale anonime. Ele vă aparțin, iar noi nu avem acces."),
        ("Aplicația","Pe telefon. Cu ea scrieți și ridicați.")],
 h_flow="Cum decurge o conversație",
 steps=[("Asociere, o singură dată","Două persoane își asociază aplicațiile prin cod QR. Cu această ocazie își schimbă adresele a câte 3 cutii poștale, fără nume și fără numere."),
        ("Scrieți doar în cutiile proprii","De acum înainte, fiecare scrie doar în propriile cutii."),
        ("Celălalt doar ridică","Cealaltă persoană doar ridică de acolo. Funcționează în ambele sensuri.")],
 svg=dict(aria="Anna scrie în cele trei cutii ale ei, Ben ridică de acolo. Ben scrie în cele trei cutii ale lui, Anna ridică de acolo.",
          a="Anna", b="Ben", boxA="Cutiile Annei", boxB="Cutiile lui Ben", write="scrie", pick="ridică"),
 cap="Fiecare sens are propriile cutii.",
 h_why="De aceea",
 why=[("Nicio legătură directă","Între cei doi nu există nicio legătură directă."),
      ("Cutii fără chip","Cutiile nu știu cui aparțin și cine ridică."),
      ("Criptat și trecător","Totul este criptat, iar după cel mult 24 de ore dispare.")],
 h_cta="Aflați mai mult", cta="Scrieți-ne sau sunați.",
 foot="NexonAI Consulting SRL · Alba Iulia"),
}

def diagram(s):
    # Two lanes. Lane 1: A writes into A's boxes, B picks up. Lane 2: B writes into B's boxes, A picks up.
    def lane(y, left, right, boxes, cls):
        bx = "".join(f'<rect class="mb {cls}" x="{300+i*44}" y="{y-20}" width="36" height="40" rx="5"/><path class="mbl" d="M{306+i*44} {y-6}h24M{306+i*44} {y+2}h16"/>' for i in range(3))
        return f'''
<g>
  <rect class="pp" x="14" y="{y-26}" width="104" height="52" rx="10"/><text class="pt" x="66" y="{y+6}" text-anchor="middle">{left}</text>
  <path class="ar" d="M120 {y} H292" marker-end="url(#h)"/><text class="al" x="206" y="{y-10}" text-anchor="middle">{s['write']}</text>
  {bx}
  <text class="bl" x="354" y="{y+40}" text-anchor="middle">{boxes}</text>
  <path class="ar d" d="M586 {y} H446" marker-end="url(#h)"/><text class="al" x="516" y="{y-10}" text-anchor="middle">{s['pick']}</text>
  <rect class="pp" x="588" y="{y-26}" width="104" height="52" rx="10"/><text class="pt" x="640" y="{y+6}" text-anchor="middle">{right}</text>
</g>'''
    return f'''<svg viewBox="0 0 706 250" role="img" aria-label="{E(s['aria'])}"><defs><marker id="h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="mk"/></marker></defs>
{lane(60, s['a'], s['b'], s['boxA'], 'ma')}
{lane(188, s['b'], s['a'], s['boxB'], 'mb2')}
</svg>'''

def block(k, t, first):
    parts = "".join(f'<div class="part"><h3>{E(a)}</h3><p>{E(b)}</p></div>' for a,b in t['parts'])
    steps = "".join(f'<li><span class="n">{i+1}</span><div><h3>{E(a)}</h3><p>{E(b)}</p></div></li>' for i,(a,b) in enumerate(t['steps']))
    why = "".join(f'<div class="why"><h3>{E(a)}</h3><p>{E(b)}</p></div>' for a,b in t['why'])
    hid = "" if first else " hidden"
    return f'''<div class="lang" data-l="{k}" lang="{t['doc_lang']}"{hid}>
<section class="hero"><div class="in"><div class="eyebrow">{E(t['eyebrow'])}</div><h1>{E(t['h1'])}</h1><p class="sub">{E(t['sub'])}</p></div></section>
<main class="in">
<section><h2>{E(t['h_parts'])}</h2><div class="parts">{parts}</div></section>
<section><h2>{E(t['h_flow'])}</h2>
<ol class="steps">{steps}</ol>
<figure class="fig">{diagram(t['svg'])}<figcaption>{E(t['cap'])}</figcaption></figure></section>
<section><h2>{E(t['h_why'])}</h2><div class="whys">{why}</div></section>
<section class="cta"><h2>{E(t['h_cta'])}</h2><p>{E(t['cta'])}</p><p class="contact"><span>gabriel@nexonai.ro</span><span>+40 773 829 646</span></p></section>
</main>
<footer class="in">{E(t['foot'])}</footer>
</div>'''

blocks = "\n".join(block(k, t, k=="de") for k,t in T.items())
btns = "".join(f'<button type="button" data-set="{k}" aria-pressed="{"true" if k=="de" else "false"}">{t["code"]}</button>' for k,t in T.items())
titles = {k: t['h1'] for k,t in T.items()}

html = f'''<title>unpruuf Briefkästen</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>
/* Layout: one dark opening statement, then a calm light reading column: two parts, a three-step path with a two-lane drawing, three reasons, contact. */
:root{{
  --bg:#F2F5F4; --surface:#FFFFFF; --ink:#12201E; --dim:#4A5A56; --line:#D5DEDB;
  --accent:#0F6B62; --accent-soft:#DDEFEC; --warm:#B95A16; --warm-soft:#F8E7D6;
  --hero:#0E2A2E; --hero-ink:#EAF3F1; --hero-dim:#9FC0C0;
  --display:"Archivo","Segoe UI",system-ui,sans-serif; --body:"IBM Plex Sans","Segoe UI",system-ui,sans-serif;
}}
@media (prefers-color-scheme: dark){{:root:not([data-theme="light"]){{
  --bg:#0B1719; --surface:#12262A; --ink:#E6F0EE; --dim:#9DB5B2; --line:#25403F;
  --accent:#5CC3B6; --accent-soft:#17363A; --warm:#F0A56B; --warm-soft:#3A2A1C;
  --hero:#071113; --hero-ink:#EAF3F1; --hero-dim:#8FB3B3; color-scheme:dark}}}}
:root[data-theme="dark"]{{
  --bg:#0B1719; --surface:#12262A; --ink:#E6F0EE; --dim:#9DB5B2; --line:#25403F;
  --accent:#5CC3B6; --accent-soft:#17363A; --warm:#F0A56B; --warm-soft:#3A2A1C;
  --hero:#071113; --hero-ink:#EAF3F1; --hero-dim:#8FB3B3; color-scheme:dark}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--ink);font:17px/1.6 var(--body)}}
.in{{max-width:900px;margin-inline:auto;padding-inline:20px}}
.bar{{position:absolute;top:0;left:0;right:0;z-index:2;padding-top:max(16px,env(safe-area-inset-top,0px))}}
.bar .in{{display:flex;justify-content:space-between;align-items:center}}
.mark{{display:flex;align-items:center;gap:10px;color:var(--hero-ink);font:700 1.05rem var(--display)}}
.sw{{display:flex;gap:4px;background:rgba(255,255,255,.08);border-radius:10px;padding:3px}}
.sw button{{border:0;background:transparent;color:var(--hero-dim);font:600 .8rem var(--body);letter-spacing:.06em;padding:6px 12px;border-radius:8px;cursor:pointer}}
.sw button[aria-pressed="true"]{{background:var(--hero-ink);color:#0E2A2E}}
.sw button:focus-visible{{outline:2px solid var(--hero-ink);outline-offset:2px}}
.hero{{background:var(--hero);color:var(--hero-ink);padding-block:104px 72px}}
.eyebrow{{font:600 .8rem var(--body);letter-spacing:.14em;text-transform:uppercase;color:var(--hero-dim)}}
h1{{font:800 clamp(2.3rem,7.2vw,4.4rem)/1.04 var(--display);letter-spacing:-.02em;margin:14px 0 0;text-wrap:balance;max-width:16ch}}
.sub{{font-size:clamp(1.1rem,2.6vw,1.4rem);color:var(--hero-dim);max-width:34em;margin:22px 0 0}}
h2{{font:700 clamp(1.5rem,4vw,2rem)/1.15 var(--display);margin:0 0 18px;text-wrap:balance}}
h3{{font:600 1.08rem/1.3 var(--body);margin:0 0 4px}}
p{{margin:0}}
main section{{margin-top:64px}}
.parts{{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}}
.part{{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:20px;min-width:0}}
.part p{{color:var(--dim)}}
.steps{{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:18px}}
.steps li{{display:grid;grid-template-columns:44px 1fr;gap:14px;align-items:start}}
.n{{width:44px;height:44px;border-radius:50%;background:var(--accent);color:var(--surface);display:grid;place-items:center;font:700 1.1rem var(--display)}}
.steps p{{color:var(--dim)}}
.fig{{margin:30px 0 0;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px;overflow-x:auto}}
.fig svg{{display:block;width:100%;min-width:560px;height:auto}}
.fig figcaption{{color:var(--dim);font-size:.95rem;margin-top:6px;padding-inline:4px}}
.pp{{fill:var(--accent-soft);stroke:var(--accent);stroke-width:1.6}}
.pt{{fill:var(--ink);font:600 15px var(--body)}}
.mb{{stroke-width:1.6}}
.mb.ma{{fill:var(--accent-soft);stroke:var(--accent)}}
.mb.mb2{{fill:var(--warm-soft);stroke:var(--warm)}}
.mbl{{stroke:var(--dim);stroke-width:1.4;fill:none;stroke-linecap:round}}
.bl{{fill:var(--dim);font:500 13px var(--body)}}
.ar{{stroke:var(--accent);stroke-width:2.2;fill:none}}
.ar.d{{stroke-dasharray:6 5}}
.mk{{fill:var(--accent)}}
.al{{fill:var(--dim);font:600 12.5px var(--body);letter-spacing:.04em}}
.whys{{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}}
.why{{border-top:3px solid var(--warm);padding-top:12px;min-width:0}}
.why p{{color:var(--dim)}}
.cta{{background:var(--hero);color:var(--hero-ink);border-radius:14px;padding:28px;margin-bottom:56px}}
.cta h2{{margin-bottom:8px}}
.cta p{{color:var(--hero-dim)}}
.contact{{display:flex;flex-wrap:wrap;gap:6px 26px;margin-top:14px;color:var(--hero-ink)!important;font:600 1.1rem var(--body)}}
.contact span{{user-select:all;overflow-wrap:anywhere}}
footer{{color:var(--dim);font-size:.9rem;padding-block:0 40px}}
[hidden]{{display:none!important}}
</style>
<div class="bar"><div class="in"><div class="mark"><svg width="26" height="26" viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="14" fill="#EAF3F1"/><circle cx="19" cy="13" r="10" fill="#0E2A2E"/></svg>unpruuf</div>
<div class="sw" role="group" aria-label="Language">{btns}</div></div></div>
{blocks}
<script>
(function(){{
  var sets=[].slice.call(document.querySelectorAll('.lang')),btns=[].slice.call(document.querySelectorAll('[data-set]'));
  function show(k){{
    sets.forEach(function(b){{b.hidden=b.getAttribute('data-l')!==k}});
    btns.forEach(function(b){{b.setAttribute('aria-pressed',b.getAttribute('data-set')===k?'true':'false')}});
    document.documentElement.setAttribute('lang',k);
    try{{localStorage.setItem('lp-lang',k)}}catch(e){{}}
  }}
  btns.forEach(function(b){{b.addEventListener('click',function(){{show(b.getAttribute('data-set'))}})}});
  var k=null;
  try{{k=localStorage.getItem('lp-lang')}}catch(e){{}}
  if(!k){{var n=(navigator.language||'de').slice(0,2).toLowerCase();k=(n==='ro'||n==='en'||n==='de')?n:'en'}}
  if(k!=='de')show(k);
}})();
</script>
'''
open('landing-so-funktionierts.html','w',encoding='utf-8').write(html)
print(len(html))
