import os,subprocess,base64
from PIL import Image
ROOT=os.path.abspath('NexonAI_CI_2026-10-19')
T=ROOT+'/04_Templates'
CH='/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
fonts=f'''@font-face{{font-family:"Open Sans";src:url("file://{ROOT}/03_Fonts/OpenSans_web_woff2/OpenSans-Regular.woff2");font-weight:400}}
@font-face{{font-family:"Open Sans";src:url("file://{ROOT}/03_Fonts/OpenSans_web_woff2/OpenSans-Bold.woff2");font-weight:700}}
@font-face{{font-family:"Open Sans";src:url("file://{ROOT}/03_Fonts/OpenSans_web_woff2/OpenSans-ExtraBold.woff2");font-weight:800}}
@font-face{{font-family:"DejaVu Sans Mono";src:url("file://{ROOT}/03_Fonts/OpenSans_web_woff2/DejaVuSansMono.woff2");font-weight:400}}'''
plate=f'file://{ROOT}/01_Logo/Full_logo_on_white_plate/nexonai-logo-plate-800w.png'
logo=f'file://{ROOT}/01_Logo/Full_logo_transparent/nexonai-logo-800w.png'
def shot(html,w,h,out):
    p='/tmp/_t.html';open(p,'w').write(html)
    subprocess.run([CH,'--headless','--no-sandbox','--disable-gpu','--hide-scrollbars',f'--window-size={w},{h+200}',f'--screenshot={out}','file://'+p],capture_output=True)
    im=Image.open(out);print(out,im.size)
    Image.open(out).crop((0,0,w,h)).save(out)
base=f'<style>{fonts}*{{box-sizing:border-box;margin:0}}html,body{{width:100%;height:100%;margin:0}}body{{font-family:"Open Sans",Arial,sans-serif;color:#172733}}</style>'
# LinkedIn banner
shot(f'''<html><head>{base}<style>body{{background:#0f2a3a;position:relative;overflow:hidden;height:396px}}
.p{{position:absolute;left:150px;top:98px;height:200px}}.t{{position:absolute;left:660px;top:104px;color:#fff;font-weight:800;font-size:46px;line-height:1.12;letter-spacing:-.02em;max-width:820px}}
.t i{{font-style:normal;color:#90c8e8}}.m{{position:absolute;left:660px;top:300px;font:400 15px "DejaVu Sans Mono";letter-spacing:.14em;color:#90c8e8;text-transform:uppercase}}
.c{{position:absolute;right:-120px;top:-160px;width:520px;height:520px;border-radius:50%;background:rgba(144,200,232,.08)}}</style></head><body><div class="c"></div><img class="p" src="{plate}"><div class="t">Confidential communication.<br><i>Your own system.</i></div><div class="m">NexonAI Consulting SRL · Alba Iulia</div></body></html>''',1584,396,T+'/linkedin-banner-1584x396.png')
# OG / social share image
shot(f'''<html><head>{base}<style>body{{background:#f2f4f6;position:relative;height:630px}}
.l{{position:absolute;left:80px;top:70px;height:150px}}.h{{position:absolute;left:80px;top:290px;font-weight:800;font-size:76px;line-height:1.06;letter-spacing:-.035em;max-width:1000px}}
.h i{{font-style:normal;color:#307098}}.m{{position:absolute;left:80px;bottom:60px;font:400 18px "DejaVu Sans Mono";letter-spacing:.14em;color:#505b63;text-transform:uppercase}}
.b{{position:absolute;right:0;top:0;bottom:0;width:26px;background:#307098}}</style></head><body><div class="b"></div><img class="l" src="{logo}"><div class="h">Your own system.<br><i>Your rules.</i></div><div class="m">Secure communication on your own servers</div></body></html>''',1200,630,T+'/social-share-1200x630.png')
# avatar
sym=Image.open(ROOT+'/01_Logo/Symbol_on_white/nexonai-symbol-white-1024.png').convert('RGB').resize((1080,1080),Image.LANCZOS)
sym.save(T+'/social-avatar-1080.png')
# email signature
sig=Image.open(ROOT+'/01_Logo/Full_logo_transparent/nexonai-logo-400w.png');sig.save(T+'/nexonai-logo-signature.png')
open(T+'/email-signature.html','w').write('''<!-- NexonAI email signature. Upload nexonai-logo-signature.png where your mail program can reach it, or embed it in the signature editor, and replace the bracketed text. -->
<table cellpadding="0" cellspacing="0" style="font-family:'Open Sans',Segoe UI,Arial,sans-serif;font-size:13px;line-height:1.5;color:#172733;border-collapse:collapse">
<tr>
<td style="padding:0 18px 0 0;vertical-align:top"><img src="nexonai-logo-signature.png" width="200" alt="NexonAI Consulting" style="display:block;border:0"></td>
<td style="padding:0 0 0 18px;border-left:2px solid #307098;vertical-align:top">
<div style="font-weight:700;font-size:14px;color:#172733">[First Last]</div>
<div style="color:#505b63">[Role]</div>
<div style="margin-top:8px"><a href="mailto:[name]@nexonai.ro" style="color:#307098;text-decoration:none">[name]@nexonai.ro</a> &nbsp;·&nbsp; [+40 ...]</div>
<div style="color:#505b63">NexonAI Consulting SRL · Alba Iulia, Romania</div>
</td></tr></table>
''')
open(T+'/README.txt','w').write('''Templates
- linkedin-banner-1584x396.png, social-share-1200x630.png (link previews), social-avatar-1080.png (profile picture).
- email-signature.html with nexonai-logo-signature.png.
- The banner and share image use the website headline. Change the text, keep fonts, colours and logo as in the guidelines.
''')
