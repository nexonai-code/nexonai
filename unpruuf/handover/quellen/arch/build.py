import sys,re
sys.path.insert(0,'/home/user/nexonai/design')
from kit import page,section,hero,chip,E

CAP=[
("Two parts: the app on your phone and your own server. No accounts. No phone numbers.","Două părți: aplicația de pe telefon și serverul tău. Fără conturi. Fără numere de telefon."),
("Your contact has the same: their own app, their own server. Nothing sits in the middle, and NexonAI runs no server.","Contactul tău are la fel: propria aplicație, propriul server. Nimic la mijloc, iar NexonAI nu operează niciun server."),
("You never send directly. You put the sealed package into your own mailbox.","Nu trimiți niciodată direct. Pui pachetul sigilat în propria ta cutie poștală."),
("You give your contact the pick-up details, directly, once.","Îi dai contactului datele de ridicare, direct, o singură dată."),
("Your contact picks it up through Tor. The package carries no names, and the server knows no identities.","Contactul îl ridică prin Tor. Pachetul nu poartă nume, iar serverul nu cunoaște nicio identitate."),
("Nothing stays. After 24 hours at most, it is gone. A passage, not a storage.","Nimic nu rămâne. După cel mult 24 de ore dispare. Un loc de trecere, nu un depozit."),
("Replies work the same way in the other direction: their own server, your pick-up.","Răspunsurile merg la fel, în sens invers: serverul lor, ridicarea ta."),
("The server sees sealed packages. No names, no contents.","Serverul vede pachete sigilate. Fără nume, fără conținut."),
]
SCENES=[0,7,14,22,29,39,46,55,62]   # start times, last = end
LAB={ # svg labels en/ro
 'you':('Your phone','Telefonul tău'),'yours':('Your server','Serverul tău'),
 'them':('Contact\'s phone','Telefonul contactului'),'theirs':('Contact\'s server','Serverul contactului'),
 'own':('run by you','operat de tine'),'own2':('run by them','operat de ei'),
 'nocentral':('no central server','fără server central'),
 'direct':('direct, once','direct, o singură dată'),
 'sealed':('sealed','sigilat'),
 'tor':('Tor','Tor'),
 'gone':('gone after 24 h at most','dispărut după cel mult 24 h'),
 'sch':('Schematic illustration. Not audited, not certified.','Ilustrație schematică. Neauditat, necertificat.'),
}
def T(key,x,y,cls='lbl',anchor='middle',idn=None):
    en,ro=LAB[key]; i=f' id="{idn}"' if idn else ''
    return (f'<g{i} class="{cls}"><text data-l="en" x="{x}" y="{y}" text-anchor="{anchor}">{en}</text>'
            f'<text data-l="ro" x="{x}" y="{y}" text-anchor="{anchor}">{ro}</text></g>')

def phone(id_,cx,cy,lab):
    return (f'<g id="{id_}" class="el"><rect x="{cx-26}" y="{cy-46}" width="52" height="92" rx="9" fill="#fff" stroke="#307098" stroke-width="3"/>'
            f'<rect x="{cx-20}" y="{cy-36}" width="40" height="66" rx="3" fill="#e3eef6"/><circle cx="{cx}" cy="{cy+38}" r="3" fill="#307098"/>'
            f'<rect x="{cx-12}" y="{cy-22}" width="24" height="8" rx="4" fill="#90c8e8"/><rect x="{cx-12}" y="{cy-8}" width="18" height="8" rx="4" fill="#307098"/>'
            f'{T(lab,cx,cy+72)}</g>')
def server(id_,cx,cy,lab,win):
    return (f'<g id="{id_}" class="el"><polygon points="{cx-66},{cy-32} {cx},{cy-72} {cx+66},{cy-32}" fill="#0f2a3a"/>'
            f'<rect x="{cx-56}" y="{cy-32}" width="112" height="82" fill="#fff" stroke="#0f2a3a" stroke-width="3"/>'
            f'<rect x="{cx-26}" y="{cy-14}" width="52" height="30" rx="4" fill="#e3eef6" stroke="#307098" stroke-width="2"/>'
            f'<rect x="{cx-12}" y="{cy+24}" width="24" height="26" fill="#307098"/>'
            f'{T(lab,cx,cy+78)}</g>')
def env(id_):
    return (f'<g id="{id_}" class="env" opacity="0"><rect x="-20" y="-13" width="40" height="26" rx="3" fill="#fff" stroke="#307098" stroke-width="2.5"/>'
            f'<polyline points="-20,-13 0,3 20,-13" fill="none" stroke="#307098" stroke-width="2.5"/><circle cx="0" cy="3" r="4" fill="#a8500f"/></g>')

AX,BX=170,790; SY=118; PY=322
svg=f'''<svg id="stage" viewBox="0 0 960 540" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Architecture animation">
<defs><radialGradient id="glow"><stop offset="0" stop-color="#90c8e8" stop-opacity=".9"/><stop offset="1" stop-color="#90c8e8" stop-opacity="0"/></radialGradient></defs>
<rect width="960" height="540" fill="#f2f4f6"/>
<g id="nocentral" class="el" opacity="0"><path d="M400 235 q-30 0 -30 -28 q0 -30 34 -30 q10 -28 48 -24 q34 4 38 30 q36 -4 40 24 q2 28 -30 28 Z" fill="none" stroke="#a8500f" stroke-width="3" stroke-dasharray="7 6" transform="translate(-10 -115)"/>
<line x1="395" y1="68" x2="545" y2="140" stroke="#a8500f" stroke-width="4"/>{T('nocentral',480,176,'lbl warn')}</g>
<g id="tunnel" class="el" opacity="0"><rect x="380" y="205" width="200" height="54" rx="27" fill="#0f2a3a"/><rect id="tglow" x="392" y="215" width="176" height="34" rx="17" fill="none" stroke="#90c8e8" stroke-width="3" stroke-dasharray="14 10"/>
<text x="480" y="238" text-anchor="middle" class="mono" fill="#90c8e8">Tor</text></g>
<line id="link" x1="{AX+70}" y1="{PY-40}" x2="{BX-70}" y2="{PY-40}" stroke="#307098" stroke-width="3" stroke-dasharray="3 10" stroke-linecap="round" opacity="0"/>
<g id="linklbl" opacity="0">{T('direct',480,PY-4,'lbl')}</g>
{server('sA',AX,SY,'yours',1)}{phone('pA',AX,PY,'you')}
{server('sB',BX,SY,'theirs',1)}{phone('pB',BX,PY,'them')}
<g id="badgeA" class="el" opacity="0">{T('own',AX,SY-98,'tag')}</g><g id="badgeB" class="el" opacity="0">{T('own2',BX,SY-98,'tag')}</g>
<g id="stA" opacity="0" transform="translate({AX},{SY+1}) scale(.55)"><rect x="-20" y="-13" width="40" height="26" rx="3" fill="#fff" stroke="#307098" stroke-width="3"/><polyline points="-20,-13 0,3 20,-13" fill="none" stroke="#307098" stroke-width="3"/></g>
<g id="stB" opacity="0" transform="translate({BX},{SY+1}) scale(.55)"><rect x="-20" y="-13" width="40" height="26" rx="3" fill="#fff" stroke="#307098" stroke-width="3"/><polyline points="-20,-13 0,3 20,-13" fill="none" stroke="#307098" stroke-width="3"/></g>
<line id="lnA" x1="{AX}" y1="{SY+86}" x2="{AX}" y2="{PY-52}" stroke="#307098" stroke-width="3" stroke-dasharray="3 9" stroke-linecap="round" opacity="0"/><line id="lnB" x1="{BX}" y1="{SY+86}" x2="{BX}" y2="{PY-52}" stroke="#307098" stroke-width="3" stroke-dasharray="3 9" stroke-linecap="round" opacity="0"/>
<g id="parts"></g>
<circle id="halo" r="34" fill="url(#glow)" opacity="0"/>
<g id="card" opacity="0"><rect x="-22" y="-14" width="44" height="28" rx="5" fill="#307098"/><rect x="-14" y="-7" width="10" height="10" fill="#fff"/><rect x="2" y="-7" width="12" height="3" fill="#90c8e8"/><rect x="2" y="-1" width="12" height="3" fill="#90c8e8"/></g>
{env('e1')}{env('e2')}{env('e3')}
<g id="clock" opacity="0" transform="translate({AX+98},{SY-20})"><circle r="16" fill="#fff" stroke="#307098" stroke-width="3"/><line id="hand" x1="0" y1="0" x2="0" y2="-10" stroke="#307098" stroke-width="3" stroke-linecap="round"/><line x1="0" y1="0" x2="7" y2="3" stroke="#307098" stroke-width="3" stroke-linecap="round"/></g>
<g id="goneL" opacity="0">{T('gone',AX+10,SY-98,'lbl')}</g>
<g id="endcard" opacity="0"><rect x="0" y="0" width="960" height="540" fill="#0f2a3a"/>
<g class="endt"><text data-l="en" x="480" y="236" text-anchor="middle" class="big">The server sees sealed packages.</text><text data-l="ro" x="480" y="236" text-anchor="middle" class="big">Serverul vede pachete sigilate.</text>
<text data-l="en" x="480" y="290" text-anchor="middle" class="big sky">No names. No contents.</text><text data-l="ro" x="480" y="290" text-anchor="middle" class="big sky">Fără nume. Fără conținut.</text>
{T('sch',480,470,'lbl endsm')}</g></g>
</svg>'''

JS = r'''
(function(){
var DUR=62, S=%s;
function $(i){return document.getElementById(i)}
function cl(x){return x<0?0:x>1?1:x}
function sm(t,a,b){var x=cl((t-a)/(b-a));return x*x*(3-2*x)}
function lerp(a,b,x){return a+(b-a)*x}
function ops(id,o){var e=$(id);if(e)e.setAttribute('opacity',o)}
function mv(id,x,y,s){var e=$(id);if(e)e.setAttribute('transform','translate('+x+','+y+')'+(s?' scale('+s+')':''))}
var AX=%d,BX=%d,SY=%d,PY=%d;
function poly(pts,u){var L=[],tot=0,i;for(i=1;i<pts.length;i++){var d=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);L.push(d);tot+=d}
 var t=u*tot;for(i=0;i<L.length;i++){if(t<=L[i]||i==L.length-1){var k=cl(t/L[i]);return [lerp(pts[i][0],pts[i+1][0],k),lerp(pts[i][1],pts[i+1][1],k)]}t-=L[i]}}
var PICK=[[AX+60,SY+10],[375,232],[585,232],[BX-48,PY-38]];
var REPL=[[BX-60,SY+10],[585,232],[375,232],[AX+48,PY-38]];
function inTunnel(p){return p[0]>385&&p[0]<575&&p[1]>200&&p[1]<265}
function render(t){
 t=Math.max(0,Math.min(DUR-.001,t));
 var i,sc=0;for(i=0;i<S.length-1;i++){if(t>=S[i])sc=i}
 // base elements
 ops('pA',sm(t,.3,1.6));ops('sA',sm(t,.3,1.6));
 ops('badgeA',sm(t,2.8,3.8)*(1-sm(t,53.5,54.5)*0));
 ops('lnA',sm(t,1.8,3)*.9);ops('lnB',sm(t,9.5,10.5)*.9);ops('pB',sm(t,7.3,8.6));ops('sB',sm(t,7.3,8.6));ops('badgeB',sm(t,9,10));
 var nc=sm(t,10.5,11.8)*(1-sm(t,13.2,14));ops('nocentral',nc);
 // write
 var w=sm(t,14.5,18);var e1=$('e1');
 if(t>=14.5&&t<18.2){ops('e1',cl((t-14.5)/.6)*(1-sm(t,17.6,18.2)));mv('e1',AX,lerp(PY-60,SY+1,w),lerp(1,.55,sm(t,16.8,18)))}else ops('e1',0);
 // stored envelope A
 var storedA=(t>=18)&&(t<41.3)?1:0;ops('stA',storedA*(1-sm(t,39.8,41.2)));
 // halo for seal
 ops('halo',t>=14.5&&t<16?.9*(1-sm(t,15,16)):0);mv('halo',AX,PY-60);
 // handover
 var lk=sm(t,22.3,23.2)*(1-sm(t,28,29));ops('link',lk);ops('linklbl',lk);
 var h=sm(t,23,27);ops('card',(t>=23&&t<27.6)?1:0);mv('card',lerp(AX+70,BX-70,h),PY-40+Math.sin(h*Math.PI)*-30);
 // tunnel
 var tun=sm(t,29,30)*(1-sm(t,38,39))+sm(t,50,51)*(1-sm(t,54.5,55.5));ops('tunnel',Math.max(tun,0));
 var tg=$('tglow');if(tg)tg.setAttribute('stroke-dashoffset',-(t*30)%%24);
 // pickup A -> B (envelope copy e2)
 if(t>=30&&t<38.6){var u=sm(t,30.8,37.8);var p=poly(PICK,u);ops('e2',(inTunnel(p)?0:1)*cl((t-30.4)/.5)*(1-sm(t,37.9,38.6)));mv('e2',p[0],p[1],.8)}else ops('e2',0);
 // dissolve at A
 var d=sm(t,39.8,43.6);var pa=$('parts');
 if(t>=39.8&&t<44.5){var h2='';for(var k=0;k<16;k++){var a=k*2.4,r=18+d*60+k*2;var x=AX+Math.cos(a)*r*1.1,y=SY+1-d*50+Math.sin(a)*r*.5;var o=(1-d)*.95;h2+='<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="'+(3.5-d*1.5).toFixed(1)+'" fill="#90c8e8" opacity="'+o.toFixed(2)+'"/>'}pa.innerHTML=h2}else pa.innerHTML='';
 // clock
 ops('clock',sm(t,39,40)*(1-sm(t,44,45.5)));var hd=$('hand');if(hd)hd.setAttribute('transform','rotate('+(t*120)+')');ops('goneL',sm(t,42.5,43.8)*(1-sm(t,45,46)));
 // reply: B writes to own server, A picks up
 var w2=sm(t,46.8,50);
 if(t>=46.5&&t<50.2){ops('e3',cl((t-46.5)/.6)*(1-sm(t,49.6,50.2)));mv('e3',BX,lerp(PY-60,SY+1,w2),lerp(1,.55,sm(t,48.8,50)))}
 else if(t>=50.4&&t<54.8){var u2=sm(t,50.8,54.2);var p2=poly(REPL,u2);ops('e3',(inTunnel(p2)?0:1)*cl((t-50.4)/.5)*(1-sm(t,54.2,54.8)));mv('e3',p2[0],p2[1],.8)}else ops('e3',0);
 ops('stB',(t>=50&&t<56)?1*(1-sm(t,54.6,55.6)):0);
 // end card
 ops('endcard',sm(t,55,56.2));
 // dim stage when end
 // caption + dots
 var capEls=document.querySelectorAll('.cap');for(i=0;i<capEls.length;i++){var on=(i===sc&&sc<7);capEls[i].style.opacity=on?1:0;capEls[i].style.visibility=on?'visible':'hidden'}
 var cw=document.querySelector('.capwrap');if(cw)cw.style.opacity=(sc<7)?1:0;var dots=document.querySelectorAll('.dot');for(i=0;i<dots.length;i++){dots[i].setAttribute('aria-current',i===sc?'true':'false')}
 var pr=$('prog');if(pr)pr.style.width=(t/DUR*100)+'%%';
 var tm=$('tm');if(tm){var s=Math.floor(t);tm.textContent='0:'+(s<10?'0':'')+s+' / 1:02'}
}
window.__setT=render;
var T0=0,playing=true,last=null;
function tick(ts){if(last==null)last=ts;var dt=(ts-last)/1000;last=ts;if(playing&&!window.__manual){T0+=dt;if(T0>=DUR)T0=0;render(T0)}requestAnimationFrame(tick)}
window.__play=function(p){playing=p;var b=$('pp');if(b)b.textContent=p?'❚❚':'▶'};
document.addEventListener('click',function(ev){var t=ev.target;
 if(t.id==='pp'){window.__play(!playing)}
 else if(t.id==='rs'){T0=0;render(0);window.__play(true)}
 else if(t.classList.contains('dot')){T0=S[+t.dataset.i]+.01;render(T0)}
 else if(t.id==='bar'){}
});
render(0);requestAnimationFrame(tick);
})();
''' % (str(SCENES),AX,BX,SY,PY)

caps=''.join(f'<div class="cap" style="opacity:0;visibility:hidden"><span data-l="en">{a}</span><span data-l="ro">{b}</span></div>' for a,b in CAP)
dots=''.join(f'<button class="dot" data-i="{i}" aria-label="Scene {i+1}"></button>' for i in range(8))
CSS='''
.anim{position:relative;container-type:inline-size;aspect-ratio:16/9;width:100%;background:#f2f4f6;border-radius:16px;overflow:hidden;border:1px solid rgba(195,204,210,.5)}
.anim svg{position:absolute;inset:0;width:100%;height:100%}
.anim .lbl text{font:600 15px "Open Sans",sans-serif;fill:#172733}.anim .lbl.warn text{fill:#a8500f}
.anim .tag text{font:700 11px "DejaVu Sans Mono",monospace;fill:#307098;text-transform:uppercase;letter-spacing:.08em}
.anim .mono{font:700 18px "DejaVu Sans Mono",monospace}
.anim .big{font:800 40px "Open Sans",sans-serif;fill:#fff}.anim .big.sky{fill:#90c8e8}.anim .endsm text{fill:#90c8e8;font:500 14px "DejaVu Sans Mono",monospace}
.capwrap{position:absolute;left:0;right:0;bottom:0;padding:2.2cqw 3cqw;background:linear-gradient(0deg,rgba(15,42,58,.94),rgba(15,42,58,.78));color:#fff;min-height:9cqw}
.cap{position:absolute;left:3cqw;right:3cqw;top:50%;transform:translateY(-50%);font:600 2.3cqw/1.35 "Open Sans",sans-serif;transition:opacity .35s}.novid .cap{transition:none}
.ctl{display:flex;align-items:center;gap:12px;margin-top:14px;flex-wrap:wrap}
.ctl button{font:600 14px "Open Sans",sans-serif;border:1px solid #c3ccd2;background:#fff;color:#172733;border-radius:8px;padding:8px 14px;cursor:pointer;min-width:44px}
.ctl .dot{width:14px;height:14px;min-width:14px;padding:0;border-radius:50%;background:#d9dfe3;border:0}.ctl .dot[aria-current=true]{background:#307098}
.barw{flex:1;min-width:120px;height:6px;background:#e3e8eb;border-radius:3px;overflow:hidden}.barw i{display:block;height:100%;background:#307098;width:0}
#tm{font:12px "DejaVu Sans Mono",monospace;color:#505b63}
'''
def stage(ctl=True):
    c=(f'<div class="ctl"><button id="pp" type="button" aria-label="Play/Pause">❚❚</button><button id="rs" type="button" aria-label="Restart">↺</button>{dots}<div class="barw"><i id="prog"></i></div><span id="tm">0:00 / 1:02</span></div>') if ctl else ''
    return f'<div class="anim" id="anim">{svg}<div class="capwrap">{caps}</div></div>{c}'

# standalone for video
vid=f'''<!doctype html><html data-lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap">
<style>html,body{{margin:0;background:#f2f4f6}}.anim{{border-radius:0;border:0}}html[data-lang=ro] [data-l=en]{{display:none}}html[data-lang=en] [data-l=ro]{{display:none}}{CSS}</style></head><body class="novid">{stage(False)}<script>{JS}</script></body></html>'''
open('anim_video.html','w').write(vid)

body=hero(chip(E('Architecture animation','Animație arhitectură')),E('How unpruuf works, in one minute.','Cum funcționează unpruuf, într-un minut.'),
 E('Two parts, an app and your own server. Nothing in the middle. Press play, or jump to a scene.','Două părți: aplicația și serverul tău. Nimic la mijloc. Apasă play sau sari la o scenă.'),
 '')
body+=f'<section class="nx-section"><div class="nx-wrap">{stage(True)}</div></section>'
body+=section('notes',chip(E('What this shows','Ce arată')),E('Read this before you share it.','Citește înainte să distribui.'),'',
 '<div class="nx-grid g2"><div class="nx-card"><h3>'+E('A schematic, not a proof','O schemă, nu o dovadă')+'</h3><p>'+E('The animation explains the idea. It is not audited, and Tor use has not yet been tested against the real network. Do not use it as evidence of security.','Animația explică ideea. Nu este auditată, iar utilizarea Tor nu a fost încă testată pe rețeaua reală. Nu o folosi ca dovadă de securitate.')+'</p></div>'
 '<div class="nx-card"><h3>'+E('Deliberately left out','Lăsat intenționat deoparte')+'</h3><p>'+E('No numbers, no protocol details, no claims beyond the customer story. Romanian text needs a native review before customers see it.','Fără cifre, fără detalii de protocol, fără afirmații dincolo de povestea pentru clienți. Textul în română necesită o verificare nativă înainte să-l vadă clienții.')+'</p></div></div>',alt=True)
html=page('unpruuf Architecture Animation',('INTERNAL','Architecture animation','Animație arhitectură'),[('notes','Notes','Note')],body)
html=html.replace('<span>gabriel@nexonai.ro</span><span>+40 773 829 646</span>','<span>unpruuf@nexonai.ro</span>')
html=html.replace('<span>EN / RO</span>','<span>EN / RO</span>')
html=re.sub(r'(</main>)',r'<style>'+CSS.replace('\\','\\\\')+r'</style><script>'+JS.replace('\\','\\\\')+r'</script>\1',html,count=1)
open('architecture.html','w').write(html)
print(len(html))
