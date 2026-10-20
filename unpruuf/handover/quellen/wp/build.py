import base64,sys,subprocess,os,shutil
from content import *
FONTS='/tmp/claude-0/-home-user-nexonai/dd345a09-6039-5c13-9173-147314f838d9/scratchpad/site_v8/assets/'
LOGO='/home/user/nexonai/design/assets/nexonai-logo.webp'
b64=lambda p: base64.b64encode(open(p,'rb').read()).decode()
def ff(i,w,fam='Open Sans',fmt='truetype'): return f'@font-face{{font-family:"{fam}";src:url(data:font/ttf;base64,{b64(FONTS+f"font-{i}.ttf")}) format("truetype");font-weight:{w}}}'
CSS=ff(0,'400')+ff(1,'500 600')+ff(2,'700 900')+ff(3,'400 700','DejaVu Mono')+'''
:root{--primary:#0f6b62;--primary-d:#094e47;--tint:#e7efec;--warm:#a8500f;--warm-t:#f8e7d6;--surface:#f7faf9;--low:#f1f4f3;--ink:#12201e;--var:#46564f;--line:#d5dedb;--sans:"Open Sans",Arial,sans-serif;--mono:"DejaVu Mono",monospace}
@page{size:A4;margin:20mm 18mm 20mm 18mm;@bottom-left{content:string(foot);font:7.5pt var(--mono);color:#7a8985}@bottom-right{content:counter(page);font:7.5pt var(--mono);color:#7a8985}}
@page:first{margin:0;@bottom-left{content:none}@bottom-right{content:none}}
*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font:9.6pt/1.55 var(--sans);color:var(--ink);background:#fff}
.foot{string-set:foot content();display:none}
h1,h2,h3,p{margin:0}
.cover{height:297mm;width:210mm;background:var(--primary-d);color:#fff;padding:22mm 20mm;display:flex;flex-direction:column;page-break-after:always;position:relative;overflow:hidden}
.cover:before{content:"";position:absolute;right:-60mm;top:-40mm;width:170mm;height:170mm;border-radius:50%;background:rgba(196,231,221,.08)}
.cover:after{content:"";position:absolute;left:-40mm;bottom:-50mm;width:130mm;height:130mm;border-radius:50%;background:rgba(196,231,221,.06)}
.logo{width:52mm;height:21mm;position:relative;overflow:hidden;background:#fff;border-radius:3mm}
.logo img{position:absolute;max-width:none;width:119.46%;left:-10.1%;top:-30%;mix-blend-mode:multiply}
.cover .eyebrow{font:600 8.5pt var(--mono);letter-spacing:.14em;color:#c4e7dd;margin-top:auto}
.cover h1{font:800 66pt/1 var(--sans);letter-spacing:-.03em;margin-top:8mm}
.cover h1 i{font-style:normal;color:#c4e7dd}
.cover .sub{font:600 18pt/1.3 var(--sans);margin-top:7mm;max-width:130mm;color:#e7efec}
.cover .meta{font:8.5pt var(--mono);color:#c4e7dd;margin-top:14mm}
.cover .st{margin-top:5mm;font-size:9pt;line-height:1.5;max-width:125mm;border:1px solid rgba(196,231,221,.4);border-radius:3mm;padding:3.5mm 4.5mm;color:#e7efec;margin-bottom:6mm}
.toc{page-break-after:always}
.toc h2,.sec h2{font:800 20pt/1.2 var(--sans);color:var(--primary-d);margin-bottom:5mm;letter-spacing:-.01em}
.toc ol{list-style:none;margin:6mm 0 0;padding:0}.toc li{display:flex;justify-content:space-between;padding:2.4mm 0;border-bottom:1px solid var(--line);font-size:10.5pt}
.toc li a{color:var(--ink);text-decoration:none}.toc li span{font:8.5pt var(--mono);color:var(--primary)}
.sec{margin-bottom:11mm}.sec.pb{page-break-before:always}
.sec h2{break-after:avoid;border-top:1.2mm solid var(--primary);padding-top:3.5mm;margin-top:2mm}.sec{break-inside:auto}
h3{font:700 11.5pt/1.3 var(--sans);color:var(--primary-d);margin:6mm 0 2mm;break-after:avoid}
p{margin:0 0 3mm}
ul.l{margin:2mm 0 4mm;padding:0;list-style:none}ul.l li{position:relative;padding-left:5mm;margin-bottom:2mm}ul.l li:before{content:"";position:absolute;left:0;top:2.2mm;width:2mm;height:2mm;border-radius:50%;background:var(--primary)}
.callout{border-left:1.2mm solid var(--warm);background:var(--warm-t);padding:3.5mm 5mm;border-radius:0 3mm 3mm 0;margin:4mm 0;font-size:9.6pt;break-inside:avoid}
table{width:100%;border-collapse:collapse;margin:3mm 0 5mm;font-size:8.8pt;line-height:1.45}
th{font:600 7pt var(--mono);letter-spacing:.07em;text-transform:uppercase;text-align:left;color:var(--var);background:var(--low);padding:2.4mm 3mm;border-bottom:1px solid var(--line)}
td{padding:2.6mm 3mm;border-bottom:1px solid var(--line);vertical-align:top}td:first-child{font-weight:600;width:28%}
tr{break-inside:avoid}
.ref{font:600 6.5pt var(--mono);margin-left:.6mm}.ref a{color:var(--primary);text-decoration:none}
.flow{margin:4mm 0 5mm;break-inside:avoid}
.gl dt{font-weight:700;color:var(--primary-d);margin-top:3mm}.gl dd{margin:0 0 1mm}
ol.src{padding-left:6mm;font-size:8.3pt;line-height:1.45}ol.src li{margin-bottom:1.6mm;overflow-wrap:anywhere}ol.src a{color:var(--primary);text-decoration:none}
.note{font-size:8.3pt;color:var(--var)}
'''
def flow_svg(L):
    f=UI['flow']; g=lambda k:f[k][L]
    return f'''<svg class="flow" viewBox="0 0 700 200" xmlns="http://www.w3.org/2000/svg" font-family="Open Sans,Arial,sans-serif">
<defs><marker id="ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#0f6b62"/></marker></defs>
<rect x="8" y="55" width="150" height="90" rx="14" fill="#fff" stroke="#0f6b62" stroke-width="2"/><text x="83" y="105" text-anchor="middle" font-size="12.5" font-weight="700" fill="#094e47">{g("me")}</text>
<rect x="272" y="30" width="170" height="140" rx="14" fill="#e7efec" stroke="#0f6b62" stroke-width="2"/><text x="357" y="62" text-anchor="middle" font-size="15" font-weight="700" fill="#094e47">{g("srv")}</text>
<g fill="#fff" stroke="#0f6b62" stroke-width="1.5"><rect x="290" y="78" width="40" height="30" rx="4"/><rect x="335" y="78" width="40" height="30" rx="4"/><rect x="380" y="78" width="40" height="30" rx="4"/><rect x="290" y="116" width="40" height="30" rx="4"/><rect x="335" y="116" width="40" height="30" rx="4"/><rect x="380" y="116" width="40" height="30" rx="4"/></g>
<rect x="552" y="55" width="140" height="90" rx="14" fill="#fff" stroke="#0f6b62" stroke-width="2"/><text x="622" y="105" text-anchor="middle" font-size="12.5" font-weight="700" fill="#094e47">{g("ct")}</text>
<line x1="160" y1="100" x2="270" y2="100" stroke="#0f6b62" stroke-width="2.2" marker-end="url(#ar)"/><text x="215" y="90" text-anchor="middle" font-size="11" fill="#46564f">{g("a")}</text>
<line x1="550" y1="100" x2="444" y2="100" stroke="#0f6b62" stroke-width="2.2" marker-end="url(#ar)"/><text x="497" y="90" text-anchor="middle" font-size="11" fill="#46564f">{g("b")}</text>
<text x="357" y="190" text-anchor="middle" font-size="11" fill="#a8500f" font-weight="600">{g("c")}</text><text x="357" y="14" text-anchor="middle" font-size="11" fill="#46564f">{g("d")}</text></svg>'''
def cell(x,L):
    return x if isinstance(x,str) else x[L]
def build(L,code):
    t=lambda k:T[k][L]
    h=[]
    h.append(f'<div class="cover"><div class="logo"><img src="data:image/webp;base64,{b64(LOGO)}"></div><div class="eyebrow">{t("cover_eyebrow")}</div><h1>unpruuf<i>.</i></h1><div class="sub">{t("cover_sub")}</div><div class="meta">{t("cover_meta")} · NexonAI Consulting SRL</div><div class="st" style="margin-top:6mm">{t("cover_status")}</div></div>')
    toc=''.join(f'<li><a href="#{i}">{ti[L]}</a></li>' for i,ti,_ in S)
    toc+=f'<li><a href="#cap">{UI["cap"][L]}</a></li><li><a href="#gloss">{UI["gloss"][L]}</a></li><li><a href="#sources">{UI["src"][L]}</a></li>'
    h.append(f'<div class="toc"><h2>{t("toc")}</h2><ol>{toc}</ol></div>')
    for n,(i,ti,blocks) in enumerate(S):
        o=f'<div class="sec" id="{i}"><h2>{ti[L]}</h2>'
        for b in blocks:
            k=b[0]
            if k=='p': o+=f'<p>{b[1][L]}</p>'
            elif k=='h3': o+=f'<h3>{b[1][L]}</h3>'
            elif k=='ul': o+='<ul class="l">'+''.join(f'<li>{x[L]}</li>' for x in b[1])+'</ul>'
            elif k=='callout': o+=f'<div class="callout">{b[1][L]}</div>'
            elif k=='svg': o+=flow_svg(L)
            elif k=='table':
                head=''.join(f'<th>{x[L]}</th>' for x in b[1])
                rows=''
                for r in b[2]:
                    rows+='<tr>'+''.join(f'<td>{cell(c,L)}</td>' for c in r)+'</tr>'
                o+=f'<table><thead><tr>{head}</tr></thead><tbody>{rows}</tbody></table>'
        h.append(o+'</div>')
    caprows=''.join('<tr>'+''.join(f'<td>{cell(x,L)}</td>' for x in r)+'</tr>' for r in CAP_ROWS)
    caph=''.join(f'<th>{cell(x,L)}</th>' for x in CAP_HEAD)
    h.append(f'<div class="sec" id="cap"><h2>{UI["cap"][L]}</h2><p>{CAP_INTRO[L]}</p><table><thead><tr>{caph}</tr></thead><tbody>{caprows}</tbody></table><p class="note">{CAP_NOTE[L]}</p></div>')
    gl='<dl class="gl">'+''.join(f'<dt>{g[0 if L==0 else 1]}</dt><dd>{g[2 if L==0 else 3]}</dd>' for g in GLOSS)+'</dl>'
    h.append(f'<div class="sec" id="gloss"><h2>{UI["gloss"][L]}</h2>{gl}</div>')
    src='<ol class="src">'+''.join(f'<li id="src{i+1}"><b>{d}</b><br><a href="{u}">{u}</a></li>' for i,(d,u) in enumerate(SRC))+'</ol>'
    h.append(f'<div class="sec" id="sources"><h2>{UI["src"][L]}</h2><p class="note">{UI["srcnote"][L]}</p>{src}</div>')
    html=f'<!doctype html><html lang="{code}"><head><meta charset="utf-8"><title>unpruuf Whitepaper</title><style>{CSS}.foot{{string-set:foot "{t("footer")}"}}</style></head><body><span class="foot">x</span>{"".join(h)}</body></html>'
    return html
OUT='/tmp/claude-0/-home-user-nexonai/dd345a09-6039-5c13-9173-147314f838d9/scratchpad/wp/out'
os.makedirs(OUT,exist_ok=True)
CH='/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
for L,code,name in ((0,'en','EN'),(1,'ro','RO')):
    p=f'{OUT}/wp_{code}.html'; open(p,'w').write(build(L,code))
    pdf=f'{OUT}/unpruuf_Whitepaper_2026-10-18_{name}.pdf'
    r=subprocess.run([CH,'--headless','--no-sandbox','--disable-gpu','--no-pdf-header-footer',f'--print-to-pdf={pdf}',f'file://{p}'],capture_output=True,text=True)
    print(name,r.stderr[-200:])
