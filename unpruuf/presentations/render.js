const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FONTS = 'https://fonts.googleapis.com/css2?family=Archivo:wght@500..800&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap';
const CSS = `*{margin:0;box-sizing:border-box}body{width:1920px;height:1080px;overflow:hidden}
section{width:1920px;height:1080px;position:relative;overflow:hidden}
aside,x-connector{display:none}
h1{font-size:96px;font-weight:600;line-height:1.1}h2{font-size:64px;font-weight:600;line-height:1.15}h3{font-size:44px;font-weight:600;line-height:1.2}p{font-size:32px;line-height:1.4}
ul,ol{padding-left:1.2em}li{padding-left:0.2em}
table{width:100%;border-collapse:collapse}th,td{padding:0.35em 0.6em;border-bottom:1px solid #D2DDD9;text-align:left;vertical-align:top}th{font-weight:600}`;
const CONNECT = `for (const c of document.querySelectorAll('x-connector')) {
  const s = c.closest('section'); const ns='http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns,'svg'); svg.setAttribute('width','1920'); svg.setAttribute('height','1080');
  svg.style.cssText='position:absolute;left:0;top:0;pointer-events:none';
  const col = c.style.color || '#4A5A56'; const w = parseFloat(c.style.borderWidth)||2; const dash = c.style.borderStyle==='dashed';
  const id='m'+Math.random().toString(36).slice(2);
  svg.innerHTML='<defs><marker id="'+id+'" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="'+col+'"/></marker></defs>';
  const l=document.createElementNS(ns,'line'); ['x1','y1','x2','y2'].forEach(k=>l.setAttribute(k,c.getAttribute(k)));
  l.setAttribute('stroke',col); l.setAttribute('stroke-width',w); if(dash) l.setAttribute('stroke-dasharray','12 10');
  const head=c.getAttribute('head')||'end'; if(head==='end'||head==='both') l.setAttribute('marker-end','url(#'+id+')'); if(head==='both') l.setAttribute('marker-start','url(#'+id+')');
  svg.appendChild(l); s.appendChild(svg);
}`;
(async () => {
  const deck = process.argv[2], out = process.argv[3];
  const idx = JSON.parse(fs.readFileSync(path.join(deck, 'project/deck.json'), 'utf8'));
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const notes = {};
  for (const [i, id] of idx.order.entries()) {
    const html = fs.readFileSync(path.join(deck, 'project/slides', id + '.html'), 'utf8');
    const m = html.match(/<aside>([\s\S]*?)<\/aside>/); notes[id] = m ? m[1] : '';
    await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS}"><style>${CSS}</style></head><body>${html}</body></html>`, { waitUntil: 'networkidle' });
    await p.evaluate(CONNECT); await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(out, String(i + 1).padStart(2, '0') + '-' + id + '.png') });
  }
  fs.writeFileSync(path.join(out, 'notes.json'), JSON.stringify({ title: idx.title, order: idx.order, notes }));
  await b.close();
})();
