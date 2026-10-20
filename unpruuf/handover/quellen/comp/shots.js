const {chromium}=require('/opt/node-tools/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1280,height:720}});await p.goto('file://'+process.cwd()+'/safeline_video.html');await p.evaluate(()=>{window.__manual=true});await p.waitForTimeout(600);
for(const t of [3,10,15,22,30,38,46,54,61,68]){await p.evaluate(t=>window.__setT(t),t);await p.screenshot({path:`s_${t}.png`})}await b.close()})();
