import os,subprocess,json
from colors import PAL,rgb,hsl,cmyk,ratio,PAIRS,H
ROOT=os.path.abspath('NexonAI_CI_2026-10-19')
CH='/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
U=lambda p:'file://'+ROOT+'/'+p
fonts=''.join(f'@font-face{{font-family:"Open Sans";src:url("{U("03_Fonts/OpenSans_web_woff2/OpenSans-"+n+".woff2")}");font-weight:{w}}}' for w,n in ((400,'Regular'),(500,'Medium'),(600,'SemiBold'),(700,'Bold'),(800,'ExtraBold')))
fonts+=f'@font-face{{font-family:"DejaVu Sans Mono";src:url("{U("03_Fonts/OpenSans_web_woff2/DejaVuSansMono.woff2")}");font-weight:400}}'
LOGO=U('01_Logo/Full_logo_transparent/nexonai-logo-1000w.png')
PLATE=U('01_Logo/Full_logo_on_white_plate/nexonai-logo-plate-600w.png')
SYM=U('01_Logo/Symbol_transparent/nexonai-symbol-512.png')
SYMW=U('01_Logo/Symbol_on_white/nexonai-symbol-white-256.png')
css=fonts+'''
@page{size:A4;margin:18mm 16mm 18mm 16mm;@bottom-left{content:"NexonAI Brand Guidelines · October 2026";font:7.5pt "DejaVu Sans Mono";color:#7a8a93}@bottom-right{content:counter(page);font:7.5pt "DejaVu Sans Mono";color:#7a8a93}}
@page:first{margin:0;@bottom-left{content:none}@bottom-right{content:none}}
*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font:9.6pt/1.55 "Open Sans",Arial,sans-serif;color:#172733}
h2{font:800 20pt/1.2 "Open Sans";color:#0f2a3a;border-top:1.2mm solid #307098;padding-top:3.5mm;margin:0 0 5mm;break-after:avoid;letter-spacing:-.01em}
h3{font:700 11.5pt/1.3 "Open Sans";color:#307098;margin:6mm 0 2mm;break-after:avoid}
p{margin:0 0 3mm}.sec{margin-bottom:9mm}.grid2,.grid3{break-inside:avoid}table{break-inside:auto}.pb{page-break-before:always}
.cover{width:210mm;height:297mm;background:#0f2a3a;color:#fff;padding:22mm 20mm;position:relative;overflow:hidden;page-break-after:always;display:flex;flex-direction:column}
.cover:before{content:"";position:absolute;right:-60mm;top:-40mm;width:170mm;height:170mm;border-radius:50%;background:rgba(144,200,232,.08)}
.cover img{width:62mm;border-radius:3mm;background:#fff;padding:5mm}
.cover .e{font:600 8.5pt "DejaVu Sans Mono";letter-spacing:.14em;color:#90c8e8;margin-top:auto}
.cover h1{font:800 44pt/1.05 "Open Sans";letter-spacing:-.03em;margin:6mm 0 0}.cover h1 i{font-style:normal;color:#90c8e8}
.cover .m{font:8.5pt "DejaVu Sans Mono";color:#90c8e8;margin:12mm 0 4mm}
.toc li{display:flex;padding:2.2mm 0;border-bottom:1px solid #d9dfe3;font-size:10.5pt;list-style:none}.toc ol{padding:0;margin:6mm 0}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:5mm}.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}
.box{border:1px solid #d9dfe3;border-radius:3mm;padding:5mm;background:#fff;break-inside:avoid}.box.dark{background:#0f2a3a;color:#fff}.box.paper{background:#f2f4f6}
.lab{font:600 7pt "DejaVu Sans Mono";letter-spacing:.1em;text-transform:uppercase;color:#505b63;margin-top:2mm}
.sw{border:1px solid #d9dfe3;border-radius:3mm;overflow:hidden;break-inside:avoid;font-size:8pt;line-height:1.4}.sw div.c{height:17mm}.sw div.t{padding:2.5mm 3mm}.sw b{font-size:9pt}
.mono{font-family:"DejaVu Sans Mono";font-size:7.2pt;color:#505b63}
table{width:100%;border-collapse:collapse;font-size:8.6pt;margin:2mm 0 5mm}th{font:600 7pt "DejaVu Sans Mono";letter-spacing:.07em;text-transform:uppercase;text-align:left;background:#f2f4f6;color:#505b63;padding:2mm 3mm;border-bottom:1px solid #d9dfe3}td{padding:2.2mm 3mm;border-bottom:1px solid #d9dfe3;vertical-align:top}tr{break-inside:avoid}
.ok{color:#307098;font-weight:700}.no{color:#a8500f;font-weight:700}
.clear{position:relative;display:inline-block;background:#fff;border:1px dashed #5597c7;padding:7.2mm}.clear img{display:block;width:70mm}
.clear:after{content:"";position:absolute;inset:7.2mm;border:1px solid rgba(48,112,152,.35)}
.bad{position:relative;border:1px solid #d9dfe3;border-radius:3mm;height:30mm;display:flex;align-items:center;justify-content:center;background:#fff;overflow:hidden}.bad img{width:42mm}.bad:after{content:"";position:absolute;left:3mm;top:3mm;width:5mm;height:5mm;border-radius:50%;background:#a8500f}
.btn{display:inline-block;background:#307098;color:#fff;font:700 9pt "Open Sans";padding:3.2mm 6mm;border-radius:1mm}
.eb{font:700 7.5pt "DejaVu Sans Mono";letter-spacing:.14em;text-transform:uppercase;color:#307098}
.pilot{display:inline-block;background:#f8e7d6;color:#a8500f;font:600 7pt "DejaVu Sans Mono";letter-spacing:.06em;text-transform:uppercase;padding:1mm 2mm}
'''
def swatch(n,h,r):
    R,G,B=rgb(h);hh,s,l=hsl(h);c,m,y,k=cmyk(h)
    return f'<div class="sw"><div class="c" style="background:{h}"></div><div class="t"><b>{n}</b><br><span class="mono">{h}<br>RGB {R} {G} {B}<br>HSL {hh} {s}% {l}%<br>CMYK {c} {m} {y} {k}</span><div style="margin-top:1.5mm;color:#505b63">{r}</div></div></div>'
core=[p for p in PAL if p[0] in('NexonAI Blue','Logo Blue','Sky','Navy','Ink','Paper')]
more=[p for p in PAL if p[0] not in [c[0] for c in core]]
contrast=''.join(f'<tr><td>{a}</td><td>{b}</td><td>{ratio(H[a],H[b])}</td><td class="{"ok" if ratio(H[a],H[b])>=4.5 else "no"}">{"AA" if ratio(H[a],H[b])>=4.5 else ("large text only" if ratio(H[a],H[b])>=3 else "fail")}</td></tr>' for a,b in PAIRS)
html=f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><title>NexonAI Brand Guidelines</title><style>{css}</style></head><body>
<div class="cover"><img src="{LOGO}"><div class="e">BRAND GUIDELINES · OCTOBER 2026</div><h1>One look.<br><i>Used the same way.</i></h1><div class="m">Version 1.0 · NexonAI Consulting SRL</div></div>
<div class="sec"><h2>Contents</h2><div class="toc"><ol><li>1. Brand at a glance</li><li>2. Logo</li><li>3. Colour</li><li>4. Typography</li><li>5. Interface elements</li><li>6. Applications</li><li>7. Words and claims</li><li>8. Files in this package</li></ol></div></div>
<div class="sec"><h2>1. Brand at a glance</h2>
<p>NexonAI Consulting SRL builds communication and reporting systems for professions that work with sensitive content, on servers that belong to the customer. The look is calm, clear and technical without being cold: white space, one blue, plain language.</p>
<div class="grid3"><div class="box"><div class="eb">Colour</div><p>One blue, taken from the logo. Navy for depth. Orange only for warnings and pilots.</p></div><div class="box"><div class="eb">Type</div><p>Open Sans for text, DejaVu Sans Mono for small labels.</p></div><div class="box"><div class="eb">Tone</div><p>Short sentences. What the customer can do, not how it works. Honest about status.</p></div></div>
<h3>Names</h3>
<table><tr><th>Write</th><th>Not</th><th>Note</th></tr>
<tr><td>NexonAI Consulting SRL</td><td>Nexon AI, NEXONAI</td><td>Legal name in contracts and the legal notice. "NexonAI" alone in running text.</td></tr>
<tr><td>unpruuf</td><td>Unpruuf, UNPRUUF</td><td>Always lowercase, also at the start of a sentence in headings. Products: unpruuf Business.</td></tr>
<tr><td>safeline, safeline Press</td><td>SafeLine, Safe Line</td><td>Reporting channel and its press edition. A trademark check is still open.</td></tr>
<tr><td>Ghost Mode, unpruuf Control, unpruuf Client</td><td></td><td>Capitalise the second word of feature names as shown.</td></tr></table></div>
<div class="sec pb"><h2>2. Logo</h2>
<p>The logo is the NX monogram with the wordmark NEXONAI CONSULTING. It is the sender mark of every document, page and message. The master file is a transparent PNG at 1447 px width. There is no vector master; for large-format print have the logo redrawn as a vector first.</p>
<div class="grid2"><div class="box"><img src="{LOGO}" style="width:100%"><div class="lab">Full logo on light backgrounds</div></div><div class="box dark" style="display:flex;flex-direction:column;justify-content:center"><img src="{PLATE}" style="width:100%"><div class="lab" style="color:#90c8e8">Full logo on white plate, for dark or busy backgrounds</div></div></div>
<h3>Symbol</h3>
<div class="grid3"><div class="box" style="text-align:center"><img src="{SYM}" style="height:30mm"><div class="lab">Symbol, transparent</div></div><div class="box" style="text-align:center"><img src="{SYMW}" style="height:30mm;border:1px solid #d9dfe3"><div class="lab">Symbol on white, for icons and avatars</div></div><div class="box"><p>Use the symbol alone where the full logo would be too small: favicon, app icon, avatar, stamps. Never on a dark background without the white square.</p></div></div>
<h3>Clear space and minimum size</h3>
<div class="grid2"><div><div class="clear"><img src="{LOGO}"></div></div><div><p>Keep a free zone around the logo equal to the height of the letter N in NEXONAI. Nothing else, no text, edge or image detail, enters this zone.</p>
<table><tr><th>Use</th><th>Minimum width</th></tr><tr><td>Full logo, screen</td><td>200 px</td></tr><tr><td>Full logo, print</td><td>35 mm</td></tr><tr><td>Symbol, screen</td><td>16 px</td></tr><tr><td>Symbol, print</td><td>6 mm</td></tr></table><p>Below the minimum, switch to the symbol.</p></div></div></div>
<div class="sec"><h3>Do not</h3><div class="grid3">
<div><div class="bad"><img src="{LOGO}" style="transform:scaleX(1.5)"></div><div class="lab">Stretch or squash</div></div>
<div><div class="bad"><img src="{LOGO}" style="filter:hue-rotate(110deg)"></div><div class="lab">Recolour</div></div>
<div><div class="bad" style="background:#0f2a3a"><img src="{LOGO}"></div><div class="lab">Place on dark without the white plate</div></div>
<div><div class="bad"><img src="{LOGO}" style="transform:rotate(-12deg)"></div><div class="lab">Rotate</div></div>
<div><div class="bad"><img src="{LOGO}" style="filter:drop-shadow(2mm 2mm 1.5mm rgba(0,0,0,.5))"></div><div class="lab">Add shadows or effects</div></div>
<div><div class="bad" style="background:repeating-linear-gradient(45deg,#90c8e8,#90c8e8 4mm,#307098 4mm,#307098 8mm)"><img src="{LOGO}"></div><div class="lab">Place on busy or low-contrast backgrounds</div></div></div></div>
<div class="sec"><h2>3. Colour</h2>
<p>The blue comes from the logo. NexonAI Blue is the darker logo blue, strong enough for white text. Logo Blue is the lighter bar of the mark, meant for large areas. Sky is the light blue for highlights on dark backgrounds.</p>
<div class="grid3">{''.join(swatch(*p) for p in core)}</div>
<h3>Supporting colours</h3>
<div class="grid3">{''.join(swatch(*p) for p in more)}</div>
<h3>Proportions</h3>
<p>Mostly white and Paper. NexonAI Blue for actions and accents, in small amounts. Navy for one dark section per page. Orange only for warnings, pilot and not-yet-tested labels, never decoratively.</p>
<div style="display:flex;height:9mm;border-radius:2mm;overflow:hidden;border:1px solid #d9dfe3"><div style="flex:55;background:#fff"></div><div style="flex:20;background:#f2f4f6"></div><div style="flex:12;background:#307098"></div><div style="flex:9;background:#0f2a3a"></div><div style="flex:4;background:#90c8e8"></div></div>
<h3>Contrast</h3>
<table><tr><th>Text</th><th>On</th><th>Ratio</th><th>WCAG</th></tr>{contrast}</table>
<p class="mono">CMYK values are a simple screen-to-print conversion for orientation. Proof before print; no Pantone matching has been done.</p></div>
<div class="sec"><h2>4. Typography</h2>
<div class="grid2"><div class="box"><div style="font:800 30pt/1.1 'Open Sans';letter-spacing:-.03em">Open Sans</div><div style="font:400 11pt 'Open Sans';color:#505b63;margin-top:2mm">Text, headings, interface. Free under the SIL Open Font License.</div><div style="font:400 13pt/1.5 'Open Sans';margin-top:4mm">Aa Bb Cc 0123456789 ăâîșț</div></div><div class="box"><div style="font:400 20pt/1.1 'DejaVu Sans Mono'">DejaVu Sans Mono</div><div style="font:400 9.5pt 'Open Sans';color:#505b63;margin-top:2mm">Small labels, status, technical text.</div><div style="font:400 11pt/1.5 'DejaVu Sans Mono';margin-top:4mm">AA 0123456789</div></div></div>
<h3>Weights</h3><div style="font-size:15pt;line-height:1.5"><span style="font-weight:400">Regular 400</span> &nbsp; <span style="font-weight:500">Medium 500</span> &nbsp; <span style="font-weight:600">SemiBold 600</span> &nbsp; <span style="font-weight:700">Bold 700</span> &nbsp; <span style="font-weight:800">ExtraBold 800</span></div>
<h3>Scale (web)</h3>
<table><tr><th>Level</th><th>Size</th><th>Weight</th><th>Notes</th></tr>
<tr><td>H1</td><td>43 to 66 px, line 1.08</td><td>700</td><td>Letter-spacing -0.052 em. One per page.</td></tr>
<tr><td>H2</td><td>32 to 49 px</td><td>700</td><td></td></tr>
<tr><td>H3</td><td>21 px, line 1.3</td><td>700</td><td></td></tr>
<tr><td>Body</td><td>16 px, line 1.65</td><td>400</td><td>Ink on white or Paper.</td></tr>
<tr><td>Label (eyebrow)</td><td>11 px, mono</td><td>700</td><td>Uppercase, letter-spacing 0.14 em, NexonAI Blue (Sky on Navy).</td></tr>
<tr><td>Button</td><td>14 px</td><td>700</td><td></td></tr></table>
<p>Fallbacks: Open Sans, then Segoe UI, Arial. DejaVu Sans Mono, then Consolas. Install the static TTFs in <span class="mono">03_Fonts</span> on every machine that makes NexonAI documents. In Word and PowerPoint use Open Sans for text and Open Sans Bold for headings.</p>
<h3>Specimen</h3>
<div class="box paper"><div class="eb">The structural difference</div><div style="font:700 26pt/1.1 'Open Sans';letter-spacing:-.04em;margin:2mm 0">Your own system.<br>Your rules.</div><p>We build secure, anonymous communication for professions that handle sensitive content. Every customer runs their own servers.</p></div></div>
<div class="sec"><h2>5. Interface elements</h2>
<div class="grid2"><div class="box"><div class="eb">Buttons</div><p style="margin-top:3mm"><span class="btn">Discover products &nbsp;↗</span></p><p class="mono">Fill NexonAI Blue, white text, radius 4 px, height 50 px, hover Navy.</p></div>
<div class="box"><div class="eb">Cards</div><p style="margin-top:3mm">White, 1 px Line border, radius 16 px, padding 24 px. Panels use Paper without border.</p></div>
<div class="box dark"><div class="eb" style="color:#90c8e8">Dark section</div><p style="margin-top:3mm;font:700 15pt 'Open Sans'">Navy background, white text, Sky for accents.</p></div>
<div class="box"><div class="eb">Status label</div><p style="margin-top:3mm"><span class="pilot">Pilot</span> &nbsp; <span class="pilot">Not audited</span></p><p class="mono">Pilot Tint background, Pilot Orange text, mono uppercase.</p></div></div>
<p>Page structure: header with the NexonAI logo top left and language switch, sections alternating white and Paper, one Navy section at most per page, footer with the logo. The website, the whitepaper and the presentations follow this structure.</p></div>
<div class="sec"><h2>6. Applications</h2>
<div class="grid2"><div><img src="{U('04_Templates/linkedin-banner-1584x396.png')}" style="width:100%;border-radius:2mm;border:1px solid #d9dfe3"><div class="lab">LinkedIn banner 1584 x 396</div></div><div><img src="{U('04_Templates/social-share-1200x630.png')}" style="width:100%;border-radius:2mm;border:1px solid #d9dfe3"><div class="lab">Link preview 1200 x 630</div></div></div>
<h3>Website</h3><p>Header: NexonAI logo at 64 px height on white, 50 px on phones. Favicon: the NX symbol on white. Colours and fonts from <span class="mono">05_Web/brand.css</span>.</p>
<h3>Documents</h3><p>Whitepaper and guides: A4, 16 mm margins, Navy cover with the logo on the white plate, H2 with a 1.2 mm NexonAI Blue rule, tables with Paper header rows, footer line in mono 7.5 pt.</p>
<h3>Email signature</h3><p>See <span class="mono">04_Templates/email-signature.html</span>: logo left, a 2 px NexonAI Blue rule, name, role, address line.</p></div>
<div class="sec"><h2>7. Words and claims</h2>
<h3>Voice</h3><ul><li>Plain words, short sentences, active verbs.</li><li>Say what the customer can do and what changes for them. Technology only on request or in an appendix.</li><li>German, English and Romanian equal in rank. Customer material always in English and Romanian.</li></ul>
<h3>Claims we make, and claims we never make</h3>
<table><tr><th>Say</th><th>Never say</th></tr>
<tr><td>Every customer runs their own servers. NexonAI runs none and sees no traffic.</td><td>"Unbreakable", "unhackable", "impossible to read"</td></tr>
<tr><td>Not independently audited. Not certified.</td><td>"Certified", "audited", "secure by design" as a guarantee</td></tr>
<tr><td>The architecture supports the principles of the GDPR (Art. 5, 25, 32).</td><td>"GDPR compliant"</td></tr>
<tr><td>Finished products for compliance, press and companies on one system.</td><td>"The first", "unique", "safer than X"</td></tr>
<tr><td>Status labels: tested, pilot, concept.</td><td>Presenting a concept or pilot as a finished product</td></tr></table>
<p>Anonymous reports in Romania: do not state that they are mandatory unless the current text of Law 361/2022 has been checked. Protocol details are not published while the patent review is running.</p></div>
<div class="sec"><h2>8. Files in this package</h2>
<table><tr><th>Folder</th><th>Content</th></tr>
<tr><td>01_Logo</td><td>Full logo transparent (200 to 1400 px), on white plate (300 to 1200 px, plus JPG), symbol transparent and on white (16 to 1024 px), favicon set, master 1447 px.</td></tr>
<tr><td>02_Colors</td><td>colors.json, brand-colors.css, GIMP/Inkscape palette, contrast table.</td></tr>
<tr><td>03_Fonts</td><td>Open Sans variable and static TTF, web woff2, DejaVu Sans Mono, licences, fonts.css.</td></tr>
<tr><td>04_Templates</td><td>LinkedIn banner, share image, avatar, email signature.</td></tr>
<tr><td>05_Web</td><td>brand.css with tokens and base components.</td></tr></table>
<h3>Open points</h3><ul><li>No vector master of the logo exists. A vector redraw is needed for large print, embroidery and signage.</li><li>No Pantone matching, no print proofs.</li><li>Older artefacts, decks and the design kit in the repository still use the previous green. They are to be switched to this blue.</li></ul></div>
</body></html>'''
open('/tmp/guide.html','w').write(html)
out=ROOT+'/NexonAI_Brand_Guidelines_2026-10.pdf'
r=subprocess.run([CH,'--headless','--no-sandbox','--disable-gpu','--no-pdf-header-footer',f'--print-to-pdf={out}','file:///tmp/guide.html'],capture_output=True,text=True);print(r.stderr[-120:])
