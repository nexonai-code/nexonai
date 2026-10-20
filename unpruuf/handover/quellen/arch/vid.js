const {chromium}=require('/opt/node-tools/node_modules/playwright');
const fs=require('fs');
(async()=>{
const lang=process.argv[2];fs.mkdirSync('fr_'+lang,{recursive:true});
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1920,height:1080}});
await p.goto('file://'+process.cwd()+'/anim_video.html');
await p.evaluate(l=>{document.documentElement.setAttribute('data-lang',l);window.__manual=true},lang);
await p.waitForTimeout(800);
const FPS=25,N=62*FPS;
for(let i=0;i<N;i++){await p.evaluate(t=>window.__setT(t),i/FPS);await p.screenshot({path:`fr_${lang}/f${String(i).padStart(5,'0')}.jpg`,type:'jpeg',quality:92})}
await b.close()})();
