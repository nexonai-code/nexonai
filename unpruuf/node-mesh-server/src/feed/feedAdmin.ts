import express, { Express } from "express";
import QRCode from "qrcode";
import { loopbackOnly } from "../admin/adminApp";
import { TokenBucket } from "../middleware/rateLimit";
import { buildFeedCode, FeedCode } from "./feedCrypto";
import { FeedOnionStatus } from "./feedOnion";
import { FeedStore } from "./feedStore";

/**
 * Setup page of the list feed — on the company's own server, reachable only from that computer
 * (loopback + Host check, same guard as the node setup page; every action also needs the custom
 * header, so a web page in the admin's browser cannot trigger anything).
 */

export interface FeedAdminState {
  store: FeedStore;
  onion: () => FeedOnionStatus | null;
  /** Starts Tor + the rotating address once the feed exists. */
  startService: () => void;
  served: () => number;
}

async function codePayload(code: FeedCode) {
  const text = buildFeedCode(code);
  return { code: text, qr: await QRCode.toDataURL(text, { margin: 1, width: 360, errorCorrectionLevel: "L" }) };
}

export function statusPayload(state: FeedAdminState) {
  const rt = state.store.runtime();
  return {
    setUp: state.store.isSetUp(),
    name: rt?.name ?? null,
    periodHours: rt?.periodHours ?? null,
    seq: state.store.currentSeq(),
    issuedAt: state.store.currentIssuedAt(),
    served: state.served(),
    tor: state.onion(),
  };
}

export function createFeedAdminApp(state: FeedAdminState, adminPort: number): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(loopbackOnly(adminPort));
  // Passphrase attempts are slow on purpose (scrypt) and rate limited besides.
  const attempts = new TokenBucket(6, 0.1);
  const guard = (req: express.Request, res: express.Response): boolean => {
    if (req.header("x-unpruuf-admin") !== "1") {
      res.status(403).json({ error: "forbidden" });
      return false;
    }
    return true;
  };
  const limited = (res: express.Response): boolean => {
    if (!attempts.tryTake()) {
      res.status(429).json({ error: "too many attempts, wait a minute" });
      return true;
    }
    return false;
  };

  app.get("/status.json", (_req, res) => res.json(statusPayload(state)));

  app.post("/setup", express.json({ limit: "8kb" }), async (req, res) => {
    if (!guard(req, res)) return;
    try {
      const { name, periodHours, passphrase } = req.body ?? {};
      const code = state.store.setup({
        name: typeof name === "string" ? name : "",
        periodHours: Number(periodHours),
        passphrase: typeof passphrase === "string" ? passphrase : "",
      });
      state.startService();
      return res.json(await codePayload(code));
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post("/code", express.json({ limit: "4kb" }), async (req, res) => {
    if (!guard(req, res) || limited(res)) return;
    const code = state.store.feedCode(typeof req.body?.passphrase === "string" ? req.body.passphrase : "");
    if (!code) return res.status(401).json({ error: "wrong passphrase" });
    return res.json(await codePayload(code));
  });

  app.post("/publish", express.json({ limit: "600kb" }), (req, res) => {
    if (!guard(req, res) || limited(res)) return;
    try {
      const lists = Array.isArray(req.body?.lists) ? req.body.lists.filter((x: unknown): x is string => typeof x === "string") : [];
      return res.json(state.store.publish(typeof req.body?.passphrase === "string" ? req.body.passphrase : "", lists));
    } catch (err) {
      const msg = (err as Error).message;
      return res.status(msg === "wrong passphrase" ? 401 : 400).json({ error: msg });
    }
  });

  app.get("/", (_req, res) => res.type("html").send(renderPage(statusPayload(state))));
  return app;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function renderPage(s: ReturnType<typeof statusPayload>): string {
  const setupCard = `<div class="card"><h2>1. Listen-Dienst einrichten</h2>
<p>Ein kleiner Dienst auf diesem Server, der Ihren Mitarbeitern die aktuellen Node-Listen gibt. Seine Onion-Adresse ändert sich regelmäßig. Nur Apps mit dem Feed-Code können sie ausrechnen.</p>
<p><label>Name der Firma<br><input id="name" style="width:100%" value="Meine Firma"></label></p>
<p><label>Adresse wechselt alle … Stunden (1 bis 24)<br><input id="period" type="number" min="1" max="24" value="6" style="width:100px"></label></p>
<p><label>Passwort (mindestens 10 Zeichen). Schützt die Schlüssel auf diesem Server und wird zum Veröffentlichen gebraucht.<br><input id="pass" type="password" style="width:100%" autocomplete="new-password"></label></p>
<button id="setup" class="go">Einrichten</button><p id="setupMsg" class="warn"></p></div>`;
  const codeCard = `<div class="card" id="codeCard" hidden><h2>Feed-Code für Ihre Mitarbeiter</h2>
<p class="warn"><b>Dieser Code ist ein Geheimnis.</b> Wer ihn hat, kann die Liste lesen. Nur an Mitarbeiter geben (QR oder Text, z. B. beim Einrichten der App).</p>
<img id="qr" alt="Feed-Code als QR" width="360" height="360" style="display:block;max-width:100%;height:auto;background:#fff;border-radius:8px">
<p class="code" id="codeText"></p></div>`;
  const publishCard = `<div class="card"><h2>2. Listen veröffentlichen</h2>
<p>Wählen Sie die Dateien, die Ihre Node-Server auf der Einrichtungsseite als „Liste als Datei speichern“ ausgeben (eine oder mehrere). Jede Veröffentlichung ersetzt die vorherige. Die Apps holen sich die neue Liste selbst.</p>
<p><input id="files" type="file" multiple></p>
<p><label>Passwort<br><input id="pass2" type="password" style="width:100%" autocomplete="current-password"></label></p>
<button id="publish" class="go">Veröffentlichen</button><p id="pubMsg"></p></div>
<div class="card"><h2>Feed-Code erneut anzeigen</h2>
<p><input id="pass3" type="password" placeholder="Passwort" autocomplete="current-password"> <button id="showCode">Anzeigen</button></p><p id="codeMsg" class="warn"></p></div>`;
  const when = s.issuedAt ? new Date(s.issuedAt).toLocaleString("de-DE") : "—";
  const status = s.setUp
    ? `<div class="card"><h2>Status</h2><dl id="status">
<dt>Firma</dt><dd>${esc(s.name ?? "")}</dd><dt>Adresse wechselt</dt><dd>alle ${s.periodHours} Stunden</dd>
<dt>Veröffentlichte Liste</dt><dd>${s.seq === null ? "noch keine" : `Version ${s.seq} vom ${esc(when)}`}</dd>
<dt>Abgeholt</dt><dd id="served">${s.served}×</dd><dt>Tor</dt><dd id="tor">${s.tor ? esc(s.tor.state) + " (" + s.tor.bootstrapPercent + "%)" : "startet …"}</dd>
<dt>Nächster Wechsel</dt><dd id="switch">${s.tor?.nextSwitchAt ? new Date(s.tor.nextSwitchAt).toLocaleString("de-DE") : "—"}</dd></dl>
<p class="hint">Die aktuelle Adresse wird hier bewusst nicht angezeigt: Nur die Apps rechnen sie aus.</p></div>`
    : "";
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>unpruuf Listen-Dienst</title><style>
:root{--bg:#f6f4ef;--card:#fff;--ink:#1d1b18;--dim:#6b665d;--ok:#1f7a4d;--warn:#a15c00;--line:#e2ddd2}
@media (prefers-color-scheme:dark){:root{--bg:#171512;--card:#211e1a;--ink:#ece7de;--dim:#a39c90;--ok:#5cc28f;--warn:#e0a24a;--line:#36312a}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:720px;margin:0 auto;padding:24px 16px 48px}h1{font-size:24px;margin:0 0 4px}.sub{color:var(--dim);margin:0 0 20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px;margin:14px 0}.card h2{font-size:16px;margin:0 0 10px}
.code{font:13px/1.4 ui-monospace,Consolas,monospace;word-break:break-all;background:var(--bg);padding:10px;border-radius:8px}
.warn{color:var(--warn)}.ok{color:var(--ok)}.hint{color:var(--dim);font-size:14px}
button{font:inherit;padding:10px 16px;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--ink);cursor:pointer}button.go{border-color:var(--ok);color:var(--ok)}
input{font:inherit;padding:8px;box-sizing:border-box}dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 14px;margin:0}dt{color:var(--dim)}dd{margin:0}
</style></head><body><main>
<h1>unpruuf Listen-Dienst</h1>
<p class="sub">Nur auf diesem Rechner erreichbar, nie über Tor.</p>
${s.setUp ? "" : setupCard}
${codeCard}
${s.setUp ? publishCard : ""}
${status}
</main><script>
const H={'X-Unpruuf-Admin':'1','Content-Type':'application/json'};
async function post(p,b){const r=await fetch(p,{method:'POST',headers:H,body:JSON.stringify(b)});return {ok:r.ok,j:await r.json().catch(()=>({}))};}
function showCode(j){document.getElementById('codeCard').hidden=false;document.getElementById('qr').src=j.qr;document.getElementById('codeText').textContent=j.code;document.getElementById('codeCard').scrollIntoView();}
const E={'wrong passphrase':'Falsches Passwort.','no list given':'Keine Datei gewählt.','already set up':'Schon eingerichtet.'};
function msg(e){return E[e]||('Fehler: '+e);}
const su=document.getElementById('setup');
if(su)su.onclick=async()=>{const r=await post('/setup',{name:document.getElementById('name').value,periodHours:document.getElementById('period').value,passphrase:document.getElementById('pass').value});
if(!r.ok){document.getElementById('setupMsg').textContent=msg(r.j.error);return;}showCode(r.j);document.getElementById('setupMsg').textContent='Eingerichtet. Feed-Code unten speichern, dann Seite neu laden.';};
const pb=document.getElementById('publish');
if(pb)pb.onclick=async()=>{const fs=[...document.getElementById('files').files];const m=document.getElementById('pubMsg');
if(!fs.length){m.textContent='Bitte mindestens eine Datei wählen.';m.className='warn';return;}
const lists=await Promise.all(fs.map(f=>f.text()));const r=await post('/publish',{passphrase:document.getElementById('pass2').value,lists});
if(r.ok){m.textContent='Veröffentlicht: Version '+r.j.seq+' mit '+r.j.lists+' Liste(n).';m.className='ok';}else{m.textContent=msg(r.j.error);m.className='warn';}};
const sc=document.getElementById('showCode');
if(sc)sc.onclick=async()=>{const r=await post('/code',{passphrase:document.getElementById('pass3').value});if(r.ok){showCode(r.j);document.getElementById('codeMsg').textContent='';}else document.getElementById('codeMsg').textContent=msg(r.j.error);};
setInterval(async()=>{try{const s=await (await fetch('/status.json',{cache:'no-store'})).json();if(!s.setUp)return;
document.getElementById('served').textContent=s.served+'×';if(s.tor){document.getElementById('tor').textContent=s.tor.state+' ('+s.tor.bootstrapPercent+'%)';
document.getElementById('switch').textContent=s.tor.nextSwitchAt?new Date(s.tor.nextSwitchAt).toLocaleString('de-DE'):'—';}}catch(e){}},5000);
</script></body></html>`;
}
