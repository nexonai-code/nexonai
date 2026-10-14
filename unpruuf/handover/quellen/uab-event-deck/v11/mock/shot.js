const {chromium}=require("playwright");const fs=require("fs");
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:3});
for(const f of fs.readdirSync(".").filter(x=>x.endsWith(".html"))){await p.goto("file://"+process.cwd()+"/"+f);await p.waitForTimeout(250);await p.screenshot({path:f.replace(".html",".png")});}
await b.close();})();
