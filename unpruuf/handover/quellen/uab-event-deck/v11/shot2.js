const { chromium } = require('playwright');
const [deck, name, V] = process.argv.slice(2);
(async()=>{const b=await chromium.launch();
 for (const l of ['RO','EN']){
  const p=await b.newPage({viewport:{width:1280,height:720}});
  await p.goto('file://'+process.cwd()+'/deck_'+deck+'_'+l+'.html');await p.waitForTimeout(600);
  await p.pdf({path:`${name}_${l}_${V}.pdf`,width:'1280px',height:'720px',printBackground:true});
  const n=await p.locator('.sl').count();
  for(let i=0;i<n;i++){await p.locator('.sl').nth(i).screenshot({path:`s_${deck}_${l}_${String(i+1).padStart(2,'0')}.png`});}
  console.log(deck,l,n);
 } await b.close();})();
