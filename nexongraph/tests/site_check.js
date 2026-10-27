// Usage: node tests/site_check.js <path to index.html> [screenshot prefix]
const {chromium} = require('playwright');
(async () => {
  const file = process.argv[2], shot = process.argv[3];
  const b = await chromium.launch(); const errs = []; let overflow = false;
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const p = await b.newPage({viewport: {width: w, height: h}});
    p.on('pageerror', e => errs.push(String(e)));
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto('file://' + file); await p.waitForTimeout(400);
    for (const lang of ['ro', 'en']) {
      await p.click(`.lang button[data-l=${lang}]`);
      const tabs = await p.$$eval('#tabs button', bs => bs.map(b => b.dataset.k));
      for (const k of tabs) {
        await p.click(`#tabs button[data-k=${k}]`); await p.waitForTimeout(k === 'graph' ? 600 : 80);
        if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) { overflow = true; errs.push(`overflow ${w} ${lang} ${k}`); }
        if (shot && lang === 'ro' && ['lage', 'me'].includes(k)) await p.screenshot({path: `${shot}_${w}_${k}.png`, fullPage: w < 500});
      }
    }
    await p.click('#tabs button[data-k=products]'); const c = await p.$('.card'); if (c) { await c.click(); await p.waitForTimeout(200); if (shot) await p.screenshot({path: `${shot}_${w}_card.png`}); }
    await p.close();
  }
  console.log('errors', JSON.stringify(errs), 'overflow', overflow); await b.close();
})();
