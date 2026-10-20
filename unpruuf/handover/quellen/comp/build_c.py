CAP=[
("Someone in your company sees something wrong. They want to speak up, but they are afraid of being identified. Many say nothing.","Cineva din firma ta vede ceva greșit. Vrea să semnaleze, dar se teme că va fi identificat. Mulți tac."),
("safeline gives your people a safe way to report. And it gives your compliance team a clear way to handle every report.","safeline oferă oamenilor tăi o cale sigură de a raporta. Iar echipei de conformitate îi oferă un mod clar de a gestiona fiecare raport."),
("safeline has two parts: an app and your own server. The server belongs to your company. No outside provider sits in the middle.","safeline are două părți: o aplicație și propriul tău server. Serverul aparține firmei tale. Niciun furnizor extern nu se află la mijloc."),
("There are no accounts and no phone numbers. The system does not ask who the person is.","Nu există conturi și nu există numere de telefon. Sistemul nu întreabă cine este persoana."),
("The employee writes the report in the app. It is sealed and placed in a mailbox on your server. It is never sent directly to a person.","Angajatul scrie raportul în aplicație. Acesta este sigilat și pus într-o cutie poștală de pe serverul tău. Nu este trimis niciodată direct unei persoane."),
("Your compliance officer collects the report from the mailbox. The server only sees sealed packages. No names, no contents.","Responsabilul de conformitate ridică raportul din cutia poștală. Serverul vede doar pachete sigilate. Fără nume, fără conținut."),
("The officer can ask questions and reply. The reporter never has to give a name.","Responsabilul poate pune întrebări și răspunde. Persoana care raportează nu trebuie să-și spună niciodată numele."),
("Each report becomes a case with deadlines and a clear status. The team always knows what is open and what is due.","Fiecare raport devine un caz, cu termene și un status clar. Echipa știe mereu ce este deschis și ce este scadent."),
("Nothing stays on the server. After 24 hours at most, it is gone. The server is a passage, not a storage.","Nimic nu rămâne pe server. După cel mult 24 de ore dispare. Serverul este un loc de trecere, nu un depozit."),
("","")]
S=[0,6,12,19,26,34,42,50,58,65,72]
LAB={'emp':('Employee','Angajat'),'off':('Compliance officer','Responsabil conformitate'),'srv':('Your company server','Serverul firmei tale'),
'nop':('no outside provider','fără furnizor extern'),'noacc':('no accounts','fără conturi'),'nophone':('no phone numbers','fără numere de telefon'),
'sealed':('sealed','sigilat'),'sees':('The server sees','Serverul vede'),'s1':('sealed packages','pachete sigilate'),'s2':('no names','fără nume'),'s3':('no contents','fără conținut'),
'anon':('anonymous','anonim'),'open':('Open','Deschis'),'rev':('In review','În analiză'),'closed':('Closed','Închis'),'case':('Case','Caz'),'dl':('deadline','termen'),
'gone':('gone after 24 h at most','dispărut după cel mult 24 h'),'sch':('Schematic illustration. Not audited, not certified.','Ilustrație schematică. Neauditat, necertificat.'),
'q':('speak up?','să spună?')}
def T(key,x,y,cls='lbl',idn=None,anchor='middle'):
    en,ro=LAB[key];i=f' id="{idn}"' if idn else ''
    return f'<g{i} class="{cls}"><text data-l="en" x="{x}" y="{y}" text-anchor="{anchor}">{en}</text><text data-l="ro" x="{x}" y="{y}" text-anchor="{anchor}">{ro}</text></g>'
PX,PY=170,318;SX,SY=480,128;LX,LY=790,318
def phone(cx,cy):
    return (f'<g id="phone" opacity="0"><rect x="{cx-26}" y="{cy-46}" width="52" height="92" rx="9" fill="#fff" stroke="#307098" stroke-width="3"/><rect x="{cx-20}" y="{cy-36}" width="40" height="66" rx="3" fill="#e3eef6"/><circle cx="{cx}" cy="{cy+38}" r="3" fill="#307098"/><rect x="{cx-12}" y="{cy-22}" width="24" height="8" rx="4" fill="#90c8e8"/><rect x="{cx-12}" y="{cy-8}" width="18" height="8" rx="4" fill="#307098"/>{T("emp",cx,cy+72)}</g>')
def server(cx,cy):
    return (f'<g id="srv" opacity="0"><polygon points="{cx-66},{cy-32} {cx},{cy-72} {cx+66},{cy-32}" fill="#0f2a3a"/><rect x="{cx-56}" y="{cy-32}" width="112" height="82" fill="#fff" stroke="#0f2a3a" stroke-width="3"/><rect x="{cx-26}" y="{cy-14}" width="52" height="30" rx="4" fill="#e3eef6" stroke="#307098" stroke-width="2"/><rect x="{cx-12}" y="{cy+24}" width="24" height="26" fill="#307098"/>{T("srv",cx,cy+78)}</g>')
def laptop(cx,cy):
    return (f'<g id="lap" opacity="0"><rect x="{cx-64}" y="{cy-48}" width="128" height="84" rx="8" fill="#fff" stroke="#0f2a3a" stroke-width="3"/><rect x="{cx-56}" y="{cy-40}" width="112" height="68" rx="3" fill="#e3eef6"/><polygon points="{cx-82},{cy+36} {cx+82},{cy+36} {cx+70},{cy+48} {cx-70},{cy+48}" fill="#0f2a3a"/>{T("off",cx,cy+72)}</g>')
def env(i,sc=1):
    return f'<g id="{i}" opacity="0"><rect x="-20" y="-13" width="40" height="26" rx="3" fill="#fff" stroke="#307098" stroke-width="2.5"/><polyline points="-20,-13 0,3 20,-13" fill="none" stroke="#307098" stroke-width="2.5"/><circle cx="0" cy="3" r="4" fill="#a8500f"/></g>'
def cross(x,y,w=44,col='#a8500f'):
    return f'<line x1="{x-w/2}" y1="{y-w/2}" x2="{x+w/2}" y2="{y+w/2}" stroke="{col}" stroke-width="5" stroke-linecap="round"/><line x1="{x-w/2}" y1="{y+w/2}" x2="{x+w/2}" y2="{y-w/2}" stroke="{col}" stroke-width="5" stroke-linecap="round"/>'
svg=f'''<svg id="stage" viewBox="0 0 960 540" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="safeline animation">
<defs><radialGradient id="glow"><stop offset="0" stop-color="#90c8e8" stop-opacity=".9"/><stop offset="1" stop-color="#90c8e8" stop-opacity="0"/></radialGradient></defs>
<rect width="960" height="540" fill="#f2f4f6"/>
<line id="l1" x1="{PX+50}" y1="{PY-50}" x2="{SX-70}" y2="{SY+40}" stroke="#307098" stroke-width="3" stroke-dasharray="3 9" stroke-linecap="round" opacity="0"/>
<line id="l2" x1="{SX+70}" y1="{SY+40}" x2="{LX-90}" y2="{LY-60}" stroke="#307098" stroke-width="3" stroke-dasharray="3 9" stroke-linecap="round" opacity="0"/>
<line id="l0" x1="{PX+50}" y1="{PY}" x2="{LX-95}" y2="{LY}" stroke="#307098" stroke-width="3" stroke-dasharray="3 9" stroke-linecap="round" opacity="0"/>
{phone(PX,PY)}{laptop(LX,LY)}{server(SX,SY)}
<g id="warn" opacity="0" transform="translate({PX},{PY-84})"><polygon points="0,-22 24,18 -24,18" fill="#fff" stroke="#a8500f" stroke-width="4" stroke-linejoin="round"/><rect x="-2.5" y="-9" width="5" height="16" fill="#a8500f"/><circle cx="0" cy="12" r="2.8" fill="#a8500f"/></g>
<g id="who" opacity="0" transform="translate({PX+90},{PY-90})"><circle cx="0" cy="0" r="30" fill="#fff" stroke="#a8500f" stroke-width="3" stroke-dasharray="6 5"/><text x="0" y="12" text-anchor="middle" font-family="Open Sans" font-weight="800" font-size="36" fill="#a8500f">?</text></g>
<g id="shield" opacity="0" transform="translate(480,250)"><circle r="60" fill="url(#glow)"/><path d="M0 -34 -28 -22 v22 c0 20 28 34 28 34 s28 -14 28 -34 v-22 Z" fill="#307098"/><polyline points="-12,2 -3,12 14,-10" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></g>
<g id="nop" opacity="0"><path d="M690 140 q-30 0 -30 -28 q0 -30 34 -30 q10 -28 48 -24 q34 4 38 30 q36 -4 40 24 q2 28 -30 28 Z" fill="none" stroke="#a8500f" stroke-width="3" stroke-dasharray="7 6" transform="translate(30 -20) scale(.7)"/><line x1="715" y1="60" x2="840" y2="125" stroke="#a8500f" stroke-width="4"/>{T("nop",800,158,"lbl warn")}</g>
<g id="noid" opacity="0"><g transform="translate({PX-60},{PY-165})"><rect x="-28" y="-20" width="56" height="40" rx="5" fill="#fff" stroke="#307098" stroke-width="3"/><circle cx="-12" cy="-4" r="7" fill="#90c8e8"/><rect x="-24" y="6" width="24" height="8" rx="4" fill="#90c8e8"/><rect x="4" y="-8" width="20" height="5" fill="#d9dfe3"/><rect x="4" y="2" width="20" height="5" fill="#d9dfe3"/>{cross(0,0,50)}</g>
<g transform="translate({PX+100},{PY-165})"><rect x="-22" y="-26" width="44" height="52" rx="7" fill="#fff" stroke="#307098" stroke-width="3"/><circle cx="-10" cy="-12" r="3" fill="#307098"/><circle cx="0" cy="-12" r="3" fill="#307098"/><circle cx="10" cy="-12" r="3" fill="#307098"/><circle cx="-10" cy="0" r="3" fill="#307098"/><circle cx="0" cy="0" r="3" fill="#307098"/><circle cx="10" cy="0" r="3" fill="#307098"/><circle cx="0" cy="13" r="3" fill="#307098"/>{cross(0,0,50)}</g>
{T("noacc",PX-60,PY-123,"lbl warn")}{T("nophone",PX+100,PY-123,"lbl warn")}</g>
<g id="seen" opacity="0"><rect x="360" y="215" width="240" height="116" rx="14" fill="#fff" stroke="#d9dfe3" stroke-width="2"/>{T("sees",480,238,"tag")}
<g transform="translate(398,270)"><rect x="-17" y="-11" width="34" height="22" rx="3" fill="#fff" stroke="#307098" stroke-width="2.5"/><polyline points="-17,-11 0,2 17,-11" fill="none" stroke="#307098" stroke-width="2.5"/></g>{T("s1",432,276,"lbl",None,"start")}
<g transform="translate({398},{296})">{cross(0,0,16)}</g>{T("s2",432,301,"lbl warn",None,"start")}<g transform="translate(398,318)">{cross(0,0,16)}</g>{T("s3",432,323,"lbl warn",None,"start")}</g>
<g id="mask" opacity="0" transform="translate({PX-80},{PY-10})"><path d="M-26 -14 q26 -16 52 0 q2 22 -12 30 q-14 8 -28 0 q-14 -8 -12 -30 Z" fill="#fff" stroke="#307098" stroke-width="3"/><ellipse cx="-10" cy="-2" rx="6" ry="4" fill="#307098"/><ellipse cx="10" cy="-2" rx="6" ry="4" fill="#307098"/></g>
<g id="maskL" opacity="0">{T("anon",PX-80,PY+26,"tag")}</g>
<g id="cases" opacity="0"><g transform="translate(0 20)"><rect x="300" y="205" width="360" height="150" rx="14" fill="#fff" stroke="#d9dfe3" stroke-width="2"/>
<g transform="translate(325,232)"><text data-l="en" class="lbl2" x="0" y="0">Case</text><text data-l="ro" class="lbl2" x="0" y="0">Caz</text></g>
<rect id="row1" x="320" y="248" width="320" height="28" rx="6" fill="#e3eef6"/><rect id="row2" x="320" y="283" width="320" height="28" rx="6" fill="#f8e7d6"/><rect id="row3" x="320" y="318" width="320" height="28" rx="6" fill="#eaedef"/>
<circle cx="338" cy="262" r="5" fill="#307098"/><circle cx="338" cy="297" r="5" fill="#a8500f"/><circle cx="338" cy="332" r="5" fill="#8a949b"/>
<rect x="352" y="257" width="120" height="8" rx="4" fill="#90c8e8"/><rect x="352" y="292" width="140" height="8" rx="4" fill="#e8b98a"/><rect x="352" y="327" width="100" height="8" rx="4" fill="#c3ccd2"/>
{T("open",610,266,"lbl sm",None,"end")}{T("rev",610,301,"lbl sm",None,"end")}{T("closed",610,336,"lbl sm",None,"end")}
<g transform="translate(560,232)"><circle r="9" fill="#fff" stroke="#307098" stroke-width="2.5"/><line x1="0" y1="0" x2="0" y2="-5" stroke="#307098" stroke-width="2.5"/><line x1="0" y1="0" x2="4" y2="2" stroke="#307098" stroke-width="2.5"/></g>{T("dl",575,236,"lbl sm",None,"start")}</g></g>
<g id="stS" opacity="0" transform="translate({SX},{SY+1}) scale(.55)"><rect x="-20" y="-13" width="40" height="26" rx="3" fill="#fff" stroke="#307098" stroke-width="3"/><polyline points="-20,-13 0,3 20,-13" fill="none" stroke="#307098" stroke-width="3"/></g>
<g id="parts"></g><circle id="halo" r="34" fill="url(#glow)" opacity="0"/>
{env("e1")}{env("e2")}{env("e3")}
<g id="clock" opacity="0" transform="translate({SX+96},{SY-20})"><circle r="16" fill="#fff" stroke="#307098" stroke-width="3"/><line id="hand" x1="0" y1="0" x2="0" y2="-10" stroke="#307098" stroke-width="3" stroke-linecap="round"/><line x1="0" y1="0" x2="7" y2="3" stroke="#307098" stroke-width="3" stroke-linecap="round"/></g>
<g id="goneL" opacity="0">{T("gone",SX,SY-98,"lbl")}</g>
<g id="endcard" opacity="0"><rect width="960" height="540" fill="#0f2a3a"/>
<text x="480" y="236" text-anchor="middle" class="brand">safeline</text>
<text data-l="en" x="480" y="296" text-anchor="middle" class="big sky">A safe way to speak up.</text><text data-l="ro" x="480" y="296" text-anchor="middle" class="big sky">O cale sigură de a vorbi.</text>
<text data-l="en" x="480" y="344" text-anchor="middle" class="big2">Your server, your rules.</text><text data-l="ro" x="480" y="344" text-anchor="middle" class="big2">Serverul tău, regulile tale.</text>
{T("sch",480,470,"lbl endsm")}<text x="480" y="500" text-anchor="middle" class="endsm2">NexonAI Consulting</text></g>
</svg>'''
JS=r'''
(function(){var DUR=72,S=%s;
function $(i){return document.getElementById(i)}function cl(x){return x<0?0:x>1?1:x}
function sm(t,a,b){var x=cl((t-a)/(b-a));return x*x*(3-2*x)}function lerp(a,b,x){return a+(b-a)*x}
function ops(id,o){var e=$(id);if(e)e.setAttribute('opacity',o)}
function mv(id,x,y,s){var e=$(id);if(e)e.setAttribute('transform','translate('+x+','+y+')'+(s?' scale('+s+')':''))}
var PX=%d,PY=%d,SX=%d,SY=%d,LX=%d,LY=%d;
function seg(a,b,u){return [lerp(a[0],b[0],u),lerp(a[1],b[1],u)]}
function win(t,a,b,c,d){return sm(t,a,b)*(1-sm(t,c,d))}
function render(t){t=Math.max(0,Math.min(DUR-.001,t));var i,sc=0;for(i=0;i<S.length-1;i++){if(t>=S[i])sc=i}
 // actors
 ops('phone',sm(t,.3,1.2));ops('lap',sm(t,6.5,7.5));ops('srv',sm(t,13,14.2)*(1-sm(t,71,71.5)));
 var endc=sm(t,65.5,66.7);
 var hold=1-endc;ops('phone',sm(t,.3,1.2)*hold);ops('lap',sm(t,6.5,7.5)*hold);ops('srv',sm(t,13,14.2)*hold);
 // s1
 ops('warn',win(t,1.4,2.4,5,5.8));ops('who',win(t,2.6,3.6,5,5.8));
 // s2
 ops('l0',win(t,8.6,9.6,12,12.8)*.9);ops('shield',win(t,8,9,12,12.8));
 // s3
 ops('l1',sm(t,15,16)*.9*hold);ops('l2',sm(t,15.4,16.4)*.9*hold);ops('nop',win(t,16.6,17.6,18.4,19));
 // s4
 ops('noid',win(t,19.4,20.6,24.6,25.4));
 // s5 write
 var u=sm(t,28,31.5);var a=[PX+48,PY-60],b=[SX-8,SY+2];
 if(t>=26.6&&t<31.8){var p=seg(a,b,u);ops('e1',cl((t-26.6)/.6)*(1-sm(t,31,31.8)));mv('e1',p[0],p[1],lerp(1,.6,u))}else ops('e1',0);
 ops('halo',t>=26.6&&t<28.2?.9*(1-sm(t,27.2,28.2)):0);mv('halo',a[0],a[1]);
 ops('stS',(t>=31.5&&t<59.8)?(1-sm(t,58.6,59.8))*(t>=42?1:1):0);
 // s6 collect
 if(t>=34.8&&t<39.6){var u2=sm(t,35.4,39);var p2=seg([SX+50,SY+10],[LX-30,LY-34],u2);ops('e2',cl((t-34.8)/.5)*(1-sm(t,39,39.6)));mv('e2',p2[0],p2[1],.85)}else ops('e2',0);
 ops('seen',win(t,37.6,38.6,41.4,42));
 // s7 reply
 var m=win(t,45.5,46.5,49.8,50.4);ops('mask',m);ops('maskL',m);
 if(t>=42.6&&t<49.6){
  if(t<45.6){var u3=sm(t,43,45.4);var p3=seg([LX-30,LY-34],[SX+8,SY+4],u3);ops('e3',cl((t-42.6)/.5)*(1-sm(t,45.1,45.6)*0));mv('e3',p3[0],p3[1],lerp(.9,.6,u3))}
  else{var u4=sm(t,46,49);var p4=seg([SX-50,SY+10],[PX+30,PY-34],u4);ops('e3',cl((t-45.6)/.3)*(1-sm(t,49,49.6)));mv('e3',p4[0],p4[1],.85)}
 }else ops('e3',0);
 // s8 cases
 ops('cases',win(t,50.6,51.8,57.2,58));
 // s9 dissolve
 var d=sm(t,59.2,62.8);var pa=$('parts');
 if(t>=59.2&&t<63.6){var h='';for(var k=0;k<16;k++){var an=k*2.4,r=18+d*60+k*2;var x=SX+Math.cos(an)*r*1.1,y=SY+1-d*50+Math.sin(an)*r*.5;h+='<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="'+(3.5-d*1.5).toFixed(1)+'" fill="#90c8e8" opacity="'+((1-d)*.95).toFixed(2)+'"/>'}pa.innerHTML=h}else pa.innerHTML='';
 ops('clock',win(t,58.4,59.4,63.6,64.6));var hd=$('hand');if(hd)hd.setAttribute('transform','rotate('+(t*120)+')');ops('goneL',win(t,61.6,62.8,64,64.8));
 ops('endcard',endc);
 var ce=document.querySelectorAll('.cap');for(i=0;i<ce.length;i++){var on=(i===sc&&sc<9);ce[i].style.opacity=on?1:0;ce[i].style.visibility=on?'visible':'hidden'}
 var cw=document.querySelector('.capwrap');if(cw)cw.style.opacity=(sc<9)?1:0;
 var dt=document.querySelectorAll('.dot');for(i=0;i<dt.length;i++)dt[i].setAttribute('aria-current',i===sc?'true':'false');
 var pr=$('prog');if(pr)pr.style.width=(t/DUR*100)+'%%';var tm=$('tm');if(tm){var s=Math.floor(t);tm.textContent='1:'+(s-60<10?'0':'')+(s-60)+' / 1:12';if(s<60)tm.textContent='0:'+(s<10?'0':'')+s+' / 1:12'}}
window.__setT=render;var T0=0,playing=true,last=null;
function tick(ts){if(last==null)last=ts;var dt=(ts-last)/1000;last=ts;if(playing&&!window.__manual){T0+=dt;if(T0>=DUR)T0=0;render(T0)}requestAnimationFrame(tick)}
window.__play=function(p){playing=p;var b=$('pp');if(b)b.textContent=p?'❚❚':'▶'};
document.addEventListener('click',function(ev){var t=ev.target;if(t.id==='pp')window.__play(!playing);else if(t.id==='rs'){T0=0;render(0);window.__play(true)}else if(t.classList.contains('dot')){T0=S[+t.dataset.i]+.01;render(T0)}});
render(0);requestAnimationFrame(tick)})();
'''%(str(S),PX,PY,SX,SY,LX,LY)
CSS='''
.anim{position:relative;container-type:inline-size;aspect-ratio:16/9;width:100%;background:#f2f4f6;border-radius:0;overflow:hidden}
.anim svg{position:absolute;inset:0;width:100%;height:100%}
.anim .lbl text{font:600 15px "Open Sans",sans-serif;fill:#172733}.anim .lbl.warn text{fill:#a8500f}.anim .lbl.sm text{font-size:12px}.anim .lbl2{font:700 12px "DejaVu Sans Mono",monospace;fill:#307098;letter-spacing:.08em;text-transform:uppercase}
.anim .tag text{font:700 11px "DejaVu Sans Mono",monospace;fill:#307098;text-transform:uppercase;letter-spacing:.08em}
.anim .brand{font:800 92px "Open Sans",sans-serif;fill:#fff;letter-spacing:-.03em}.anim .big{font:800 40px "Open Sans",sans-serif;fill:#fff}.anim .big.sky{fill:#90c8e8}.anim .big2{font:600 28px "Open Sans",sans-serif;fill:#fff}
.anim .endsm text{fill:#90c8e8;font:500 14px "DejaVu Sans Mono",monospace}.anim .endsm2{fill:#90c8e8;font:600 13px "DejaVu Sans Mono",monospace;letter-spacing:.14em;text-transform:uppercase}
.capwrap{position:absolute;left:0;right:0;bottom:0;padding:2.2cqw 3cqw;background:linear-gradient(0deg,rgba(15,42,58,.94),rgba(15,42,58,.78));color:#fff;min-height:9cqw}
.cap{position:absolute;left:3cqw;right:3cqw;top:50%;transform:translateY(-50%);font:600 2.2cqw/1.35 "Open Sans",sans-serif}
html[data-lang=ro] [data-l=en]{display:none}html[data-lang=en] [data-l=ro]{display:none}html,body{margin:0;background:#f2f4f6}
'''
caps=''.join(f'<div class="cap" style="opacity:0;visibility:hidden"><span data-l="en">{a}</span><span data-l="ro">{b}</span></div>' for a,b in CAP)
html=f'''<!doctype html><html data-lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap"><style>{CSS}</style></head><body><div class="anim">{svg}<div class="capwrap">{caps}</div></div><script>{JS}</script></body></html>'''
open('safeline_video.html','w').write(html)
