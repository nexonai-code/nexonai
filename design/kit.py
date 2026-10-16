"""NexonAI design kit for Artifacts and pages.

Usage:
    import sys; sys.path.insert(0, "<repo>/design")
    from kit import E, page, section, hero, card
    body = hero(...) + section(...)
    open("out.html", "w").write(page("Title", status=("INTERNAL", "tagline", "tagline"), nav=[("id", "EN", "RO")], body=body))
Publish out.html with the Artifact tool. Light look only. Two languages (EN, RO) switch through data-l.
"""
import base64, os
HERE = os.path.dirname(os.path.abspath(__file__))

def _b64(path):
    return base64.b64encode(open(os.path.join(HERE, path), "rb").read()).decode()

def E(en, ro):
    return f'<span data-l="en">{en}</span><span data-l="ro">{ro}</span>'

def B(en, ro):
    return f'<div data-l="en">{en}</div><div data-l="ro">{ro}</div>'

ICON_SHIELD = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z"/></svg>'

def chip(text_html, icon=ICON_SHIELD, tag=False):
    return f'<div class="nx-chip{" tag" if tag else ""}">{icon}{text_html}</div>'

def hero(chip_html, h1_html, lead_html, extra_html=""):
    return (f'<section class="nx-section nx-hero"><div class="nx-wrap"><div class="nx-head">{chip_html}'
            f'<h1 class="nx-h1">{h1_html}</h1><p class="nx-lead">{lead_html}</p></div>{extra_html}</div></section>')

def section(id_, chip_html, h2_html, lead_html, body_html, alt=False):
    lead = f'<p class="nx-lead">{lead_html}</p>' if lead_html else ""
    return (f'<section class="nx-section{" alt" if alt else ""}" id="{id_}"><div class="nx-wrap">'
            f'<div class="nx-head">{chip_html}<h2 class="nx-h2">{h2_html}</h2>{lead}</div>{body_html}</div></section>')

def card(inner_html):
    return f'<div class="nx-card">{inner_html}</div>'

def page(title, status, nav, body, footer_note=None):
    brand, en, ro = status
    logo = f'<span class="nx-logo" aria-label="NexonAI Consulting"><img src="data:image/webp;base64,{_b64("assets/nexonai-logo.webp")}" alt="NexonAI Consulting" width="887" height="444"></span>'
    nav_html = "".join(f'<a href="#{i}">{E(a, b)}</a>' for i, a, b in nav)
    css = open(os.path.join(HERE, "nexonai.css"), encoding="utf-8").read()
    font = _b64("assets/DejaVuMono-subset.woff2")
    footer_note = footer_note or ("© 2026 NexonAI Consulting SRL. Not audited, not certified.", "© 2026 NexonAI Consulting SRL. Neauditat, necertificat.")
    js = """(function(){
  function setLang(l){document.documentElement.setAttribute('data-lang',l);document.documentElement.lang=l;
    document.querySelectorAll('.nx-lang button').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.l===l?'true':'false');});
    try{localStorage.setItem('nx-lang',l);}catch(e){}}
  document.querySelectorAll('.nx-lang button').forEach(function(b){b.addEventListener('click',function(){setLang(b.dataset.l);});});
  var l=null;try{l=localStorage.getItem('nx-lang');}catch(e){}
  if(l!=='en'&&l!=='ro'){l=(navigator.language||'').toLowerCase().indexOf('ro')===0?'ro':'en';}
  setLang(l);})();"""
    return f"""<title>{title}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700;800&display=swap">
<style>@font-face{{font-family:"DejaVu Sans Mono";src:url("data:font/woff2;base64,{font}") format("woff2");font-weight:400 700;font-display:swap}}
{css}</style>
<header class="nx-header"><div class="nx-header-in">{logo}<nav class="nx-nav" aria-label="Navigation">{nav_html}</nav><div class="nx-lang" role="group" aria-label="Language"><button type="button" data-l="en" aria-pressed="true">EN</button><button type="button" data-l="ro" aria-pressed="false">RO</button></div></div></header>
<div class="nx-status"><div class="nx-status-in"><span class="nx-status-brand"><i></i>{brand}</span><span>{E(en, ro)}</span><span>EN / RO</span></div></div>
<main>{body}</main>
<footer class="nx-footer"><div class="nx-footer-in">
<div class="nx-footer-row">{logo}<div style="display:flex;flex-wrap:wrap;gap:24px"><span>gabriel@nexonai.ro</span><span>+40 773 829 646</span><span>Alba Iulia, Romania</span></div></div>
<div class="nx-footer-row"><span>{E(*footer_note)}</span></div></div></footer>
<script>{js}</script>
"""
