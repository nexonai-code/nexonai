import os,shutil,json,colorsys,subprocess
from PIL import Image,ImageDraw
import numpy as np
SP='/tmp/claude-0/-home-user-nexonai/dd345a09-6039-5c13-9173-147314f838d9/scratchpad/'
OUT=SP+'ci/NexonAI_CI_2026-10-19'
if os.path.exists(OUT): shutil.rmtree(OUT)
for d in ['01_Logo/Full_logo_transparent','01_Logo/Full_logo_on_white_plate','01_Logo/Symbol_transparent','01_Logo/Symbol_on_white','01_Logo/Favicon','01_Logo/Master','02_Colors','03_Fonts','04_Templates','05_Web']:
    os.makedirs(f'{OUT}/{d}')
src=Image.open(SP+'design_assets/logo.png').convert('RGBA')
a=np.array(src);ys,xs=np.where(a[...,3]>10)
box=(xs.min(),ys.min(),xs.max()+1,ys.max()+1)
full=src.crop(box)                         # trimmed, transparent
pad=int(full.size[0]*0.0)                  # no padding: clear space is documented, not baked in
# symbol
mx=np.where(a[:,:640,3]>10)
sym=src.crop((mx[1].min(),mx[0].min(),mx[1].max()+1,mx[0].max()+1))
print('full',full.size,'symbol',sym.size)
def save_w(im,w,path):
    h=round(im.size[1]*w/im.size[0]); im.resize((w,h),Image.LANCZOS).save(path,optimize=True)
full.save(f'{OUT}/01_Logo/Master/nexonai-logo-master-{full.size[0]}px.png',optimize=True)
for w in (1400,1000,800,600,400,300,200):
    save_w(full,w,f'{OUT}/01_Logo/Full_logo_transparent/nexonai-logo-{w}w.png')
# plate version: white rounded plate with clear space (for dark or busy backgrounds)
def plate(im,w,margin=0.09):
    m=round(w*margin); iw=w-2*m; ih=round(im.size[1]*iw/im.size[0])
    tile=Image.new('RGBA',(w,ih+2*m),(0,0,0,0)); d=ImageDraw.Draw(tile)
    d.rounded_rectangle((0,0,w-1,ih+2*m-1),radius=round(w*0.05),fill=(255,255,255,255))
    tile.alpha_composite(im.resize((iw,ih),Image.LANCZOS),(m,m)); return tile
for w in (1200,800,600,400,300):
    plate(full,w).save(f'{OUT}/01_Logo/Full_logo_on_white_plate/nexonai-logo-plate-{w}w.png',optimize=True)
# white background JPG for Office/print drafts
jb=Image.new('RGB',(1200,round(full.size[1]*1200/full.size[0])+160),(255,255,255))
l=full.resize((1200-160,round(full.size[1]*1040/full.size[0])),Image.LANCZOS);jb.paste(l,(80,80),l);jb.save(f'{OUT}/01_Logo/Full_logo_on_white_plate/nexonai-logo-on-white-1200w.jpg',quality=95)
# symbol
for s in (1024,512,256,192,128,96,64,48,32,16):
    sq=Image.new('RGBA',(sym.size[0],sym.size[0]) if sym.size[0]>=sym.size[1] else (sym.size[1],sym.size[1]),(0,0,0,0))
    sq.alpha_composite(sym,((sq.size[0]-sym.size[0])//2,(sq.size[1]-sym.size[1])//2))
    sq.resize((s,s),Image.LANCZOS).save(f'{OUT}/01_Logo/Symbol_transparent/nexonai-symbol-{s}.png',optimize=True)
    side=max(sym.size); w2=round(side*1.16)
    wh=Image.new('RGBA',(w2,w2),(255,255,255,255)); wh.alpha_composite(sym,((w2-sym.size[0])//2,(w2-sym.size[1])//2))
    wh.resize((s,s),Image.LANCZOS).save(f'{OUT}/01_Logo/Symbol_on_white/nexonai-symbol-white-{s}.png',optimize=True)
# favicon set
fv=Image.open(f'{OUT}/01_Logo/Symbol_on_white/nexonai-symbol-white-512.png').convert('RGB')
fv.save(f'{OUT}/01_Logo/Favicon/favicon.ico',sizes=[(16,16),(32,32),(48,48),(64,64)])
for n,s in (('favicon-32.png',32),('favicon-192.png',192),('favicon-512.png',512),('apple-touch-icon-180.png',180)):
    fv.resize((s,s),Image.LANCZOS).save(f'{OUT}/01_Logo/Favicon/{n}')
open(f'{OUT}/01_Logo/Favicon/favicon-links.html','w').write('<link rel="icon" href="/favicon.ico" sizes="any">\n<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">\n<link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png">\n<link rel="apple-touch-icon" href="/apple-touch-icon-180.png">\n')
full.save('/tmp/ci_full.png'); sym.save('/tmp/ci_sym.png')
json.dump({'full':list(full.size),'sym':list(sym.size)},open(SP+'ci/dims.json','w'))
