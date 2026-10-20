const {chromium}=require('/opt/node-tools/node_modules/playwright');
(async()=>{
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1280,height:720}});
await p.goto('file://'+process.cwd()+'/anim_video.html');await p.evaluate(()=>{window.__manual=true});
for(const t of [5,12,17,25,34,42,52,58]){await p.evaluate(t=>window.__setT(t),t);await p.screenshot({path:`s_${t}.png`})}
await b.close()})();
