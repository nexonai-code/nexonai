import os,shutil,glob
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from colors import write
OUT='NexonAI_CI_2026-10-19'
F=OUT+'/03_Fonts'
var='/tmp/fnt/OpenSans[wdth,wght].ttf'
os.makedirs(F+'/OpenSans_static',exist_ok=True);os.makedirs(F+'/OpenSans_web_woff2',exist_ok=True)
shutil.copy(var,F+'/OpenSans-Variable.ttf')
shutil.copy('/tmp/fnt/OFL.txt',F+'/OFL-OpenSans.txt')
names={400:'Regular',500:'Medium',600:'SemiBold',700:'Bold',800:'ExtraBold'}
for w,n in names.items():
    f=TTFont(var)
    inst=instancer.instantiateVariableFont(f,{'wght':w,'wdth':100},updateFontNames=True)
    inst.save(f'{F}/OpenSans_static/OpenSans-{n}.ttf')
    inst2=TTFont(f'{F}/OpenSans_static/OpenSans-{n}.ttf');inst2.flavor='woff2';inst2.save(f'{F}/OpenSans_web_woff2/OpenSans-{n}.woff2')
for n in ('DejaVuSansMono','DejaVuSansMono-Bold'):
    shutil.copy(f'/usr/share/fonts/truetype/dejavu/{n}.ttf',f'{F}/{n}.ttf')
    t=TTFont(f'{F}/{n}.ttf');t.flavor='woff2';t.save(f'{F}/OpenSans_web_woff2/{n}.woff2')
shutil.copy('/usr/share/doc/fonts-dejavu-core/copyright',F+'/LICENSE-DejaVu.txt')
open(F+'/fonts.css','w').write('\n'.join(f'@font-face{{font-family:"Open Sans";src:url("OpenSans_web_woff2/OpenSans-{n}.woff2") format("woff2");font-weight:{w};font-display:swap}}' for w,n in names.items())+'\n@font-face{font-family:"DejaVu Sans Mono";src:url("OpenSans_web_woff2/DejaVuSansMono.woff2") format("woff2");font-weight:400;font-display:swap}\n@font-face{font-family:"DejaVu Sans Mono";src:url("OpenSans_web_woff2/DejaVuSansMono-Bold.woff2") format("woff2");font-weight:700;font-display:swap}\n')
open(F+'/README.txt','w').write('''NexonAI fonts
Text: Open Sans (SIL Open Font License 1.1, see OFL-OpenSans.txt). Variable font plus static Regular, Medium, SemiBold, Bold, ExtraBold.
Labels and technical text: DejaVu Sans Mono (free licence, see LICENSE-DejaVu.txt).
Install the static TTFs on every computer that makes NexonAI documents (Word, PowerPoint, Canva). Use the woff2 files and fonts.css on websites.
Fallbacks when a font is missing: Open Sans -> Segoe UI, Arial, sans-serif. DejaVu Sans Mono -> Consolas, monospace.
''')
write(OUT+'/02_Colors')
open(OUT+'/05_Web/brand.css','w').write('''/* NexonAI web tokens and base components. Fonts: see ../03_Fonts/fonts.css */
@import url("../02_Colors/brand-colors.css");
:root{--nx-sans:"Open Sans","Segoe UI",Arial,sans-serif;--nx-mono:"DejaVu Sans Mono",Consolas,monospace}
body{margin:0;font:16px/1.65 var(--nx-sans);color:var(--nx-ink);background:#fff}
h1{font-size:clamp(43px,4.6vw,66px);font-weight:700;line-height:1.08;letter-spacing:-.052em}
h2{font-size:clamp(32px,3.5vw,49px);font-weight:700;line-height:1.15}
h3{font-size:21px;font-weight:700;line-height:1.3}
.eyebrow{font:700 11px/1.5 var(--nx-mono);letter-spacing:.14em;text-transform:uppercase;color:var(--nx-nexonai-blue)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:24px;padding:14px 24px;min-height:50px;background:var(--nx-nexonai-blue);color:#fff;border:1px solid transparent;border-radius:4px;font:700 14px var(--nx-sans)}
.btn:hover{background:var(--nx-navy)}
.card{background:#fff;border:1px solid var(--nx-line);border-radius:16px;padding:24px}
.panel{background:var(--nx-paper)}
.dark{background:var(--nx-navy);color:#fff}.dark .eyebrow{color:var(--nx-sky)}
.pilot{background:var(--nx-pilot-tint);color:var(--nx-pilot-orange);font:600 11px var(--nx-mono);letter-spacing:.06em;text-transform:uppercase;padding:4px 8px}
''')
