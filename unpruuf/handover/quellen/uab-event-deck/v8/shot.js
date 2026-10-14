const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();
 for (const l of ['RO','EN']){
  const p=await b.newPage({viewport:{width:1280,height:720}});
  await p.goto('file://'+process.cwd()+'/deck_'+l+'.html');await p.waitForTimeout(500);
  await p.pdf({path:`UAB-Pitch-Kurz_2026-10-14_${l}_v11.pdf`,width:'1280px',height:'720px',printBackground:true});
  const n=await p.locator('.sl').count();
  for(let i=0;i<n;i++){await p.locator('.sl').nth(i).screenshot({path:`s_${l}_${String(i+1).padStart(2,'0')}.png`});}
  console.log(l,n);
 } await b.close();})();
