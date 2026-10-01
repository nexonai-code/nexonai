import express, { Express, NextFunction, Request, Response } from "express";
import QRCode from "qrcode";
import { OnionStatus } from "../tor/onionService";
import { Profile, NodeSlot } from "../profiles";

/**
 * Local setup page — the operator scans the owner QR from here with their own unpruuf app
 * (Settings → Business Node-Mesh). It runs on its OWN port, which is never part of the onion
 * service's port mapping, so nothing on the Tor side can ever reach it. On top of binding to
 * 127.0.0.1, every request's Host header must be a loopback name: that blocks DNS-rebinding
 * pages in the operator's browser from reading the owner secret.
 */

export interface AdminState {
  getOwnerSecret: () => string;
  /** Issues a new owner secret (persisted). Absent for a Temp Node — a fresh start is its rotation. */
  rotateOwnerSecret?: () => void;
  profile: Profile;
  slot: NodeSlot;
  ephemeral: boolean;
  torEnabled: boolean;
  /** Address contacts reach this node at: the managed onion, or NODE_MESH_PUBLIC_ADDRESS when
   *  the operator runs their own hidden service (Tor disabled here). */
  publicAddress: () => string | null;
  /** Every node address this process serves (one entry per node). */
  publicAddresses?: () => string[];
  torStatus: () => OnionStatus | null;
  stats: () => { queued: number; tags: number; oldestAgeMs: number | null };
}

export const OWNER_PREFIX = "unpruuf-node-owner:v1:";

export function ownerConnectionString(address: string, ownerSecret: string): string {
  return `${OWNER_PREFIX}${address}:${ownerSecret}`;
}

export function isLoopbackHost(hostHeader: string | undefined, port: number): boolean {
  if (!hostHeader) return false;
  const allowed = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
  return allowed.includes(hostHeader.toLowerCase());
}

function loopbackOnly(port: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!isLoopbackHost(req.headers.host, port)) {
      return res.status(403).send("forbidden");
    }
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'");
    next();
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export async function statusPayload(state: AdminState) {
  const address = state.publicAddress();
  const tor = state.torStatus();
  const ownerString = address ? ownerConnectionString(address, state.getOwnerSecret()) : null;
  return {
    profile: { name: state.profile.name, ttlHours: state.profile.ttlHours, description: state.profile.description },
    slot: state.slot,
    ephemeral: state.ephemeral,
    canRotate: Boolean(state.rotateOwnerSecret),
    torEnabled: state.torEnabled,
    tor,
    address,
    addresses: state.publicAddresses ? state.publicAddresses() : address ? [address] : [],
    ownerString,
    ownerQr: ownerString ? await QRCode.toDataURL(ownerString, { margin: 1, width: 320 }) : null,
    stats: state.stats(),
  };
}

export function createAdminApp(state: AdminState, adminPort: number): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(loopbackOnly(adminPort));

  app.get("/status.json", async (_req, res) => {
    res.json(await statusPayload(state));
  });

  // Requires a custom header: a cross-site page can't send one without a CORS preflight, which
  // this server never answers — so a malicious page in the operator's browser can't trigger it.
  app.post("/rotate-owner-secret", (req, res) => {
    if (req.header("x-unpruuf-admin") !== "1") return res.status(403).json({ error: "forbidden" });
    if (!state.rotateOwnerSecret) return res.status(409).json({ error: "temp node has no rotation" });
    state.rotateOwnerSecret();
    return res.json({ rotated: true });
  });

  app.get("/", async (_req, res) => {
    const s = await statusPayload(state);
    res.type("html").send(renderPage(s));
  });

  return app;
}

function renderPage(s: Awaited<ReturnType<typeof statusPayload>>): string {
  const title = s.ephemeral ? "unpruuf Temp Node" : `unpruuf Business Node ${s.slot}`;
  const tempBanner = s.ephemeral
    ? `<div class="banner">TEMP NODE — nur für EINEN Chat. Alles liegt nur im Arbeitsspeicher; Fenster schließen = Node und Adresse sind weg.</div>`
    : "";
  const qrBlock = s.ownerQr
    ? `<img src="${s.ownerQr}" alt="Owner-QR" width="320" height="320">
       <p class="code">${escapeHtml(s.ownerString!)}</p>`
    : `<p class="wait">Adresse wird erstellt … (Seite aktualisiert sich selbst)</p>`;
  const howTo = s.ephemeral
    ? "In der unpruuf-App: Chat öffnen → Menü → <b>Temp Node</b> → QR scannen."
    : "In der unpruuf-App: <b>Einstellungen → Business Node-Mesh → QR scannen</b>.";
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root{--bg:#f6f4ef;--card:#fff;--ink:#1d1b18;--dim:#6b665d;--ok:#1f7a4d;--warn:#a15c00;--bad:#b3261e;--line:#e2ddd2}
@media (prefers-color-scheme:dark){:root{--bg:#171512;--card:#211e1a;--ink:#ece7de;--dim:#a39c90;--ok:#5cc28f;--warn:#e0a24a;--bad:#f2867d;--line:#36312a}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:720px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:24px;margin:0 0 4px}.sub{color:var(--dim);margin:0 0 20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px;margin:14px 0}
.card h2{font-size:16px;margin:0 0 10px}
.code{font:13px/1.4 ui-monospace,Consolas,monospace;word-break:break-all;background:var(--bg);padding:10px;border-radius:8px}
.warn{color:var(--warn)}.bad{color:var(--bad)}.ok{color:var(--ok)}
button{font:inherit;padding:10px 16px;border-radius:8px;border:1px solid var(--bad);background:transparent;color:var(--bad);cursor:pointer}
.banner{background:var(--warn);color:#fff;padding:12px 14px;border-radius:10px;font-weight:600}
img{display:block;max-width:100%;height:auto;background:#fff;border-radius:8px}
dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 14px;margin:0}dt{color:var(--dim)}dd{margin:0}
</style></head><body><main>
<h1>${escapeHtml(title)}</h1>
<p class="sub">Einrichtungsseite — nur auf diesem Rechner erreichbar, nie über Tor.</p>
${tempBanner}
<div class="card"><h2>1. Diesen Node mit deiner App verbinden</h2>
<p>${howTo}</p>
<p class="warn"><b>Dieser Code ist dein Schreibschlüssel.</b> Nur in deine EIGENE App scannen — niemals einem Kontakt geben. Kontakte bekommen die Adresse automatisch beim Pairing.</p>
${qrBlock}
</div>
<div class="card"><h2>2. Status</h2><dl id="status">${renderStatus(s)}</dl></div>
${s.addresses.length > 1 ? `<div class="card"><h2>Nodes auf diesem Server: ${s.addresses.length}</h2>
<p>Ein Scan reicht: Die App holt sich alle ${s.addresses.length} Adressen selbst und gibt jedem Kontakt eigene Nodes. Kein Kontakt sieht diese Liste.</p>
<details><summary>Adressen anzeigen</summary><p class="code">${s.addresses.map(escapeHtml).join("<br>")}</p></details></div>` : ""}
${s.canRotate ? `<div class="card"><h2>3. Schreibschlüssel erneuern</h2>
<p>Nur nötig, wenn der Owner-QR in falsche Hände geraten sein könnte. Danach den neuen QR in deine eigene App scannen. Kontakte sind nicht betroffen.</p>
<button id="rotate">Schreibschlüssel erneuern</button></div>` : ""}
</main>
<script>
const rb=document.getElementById('rotate');
if(rb)rb.onclick=async()=>{if(!confirm('Neuen Schreibschlüssel erzeugen? Deine App kann erst wieder senden, wenn du den neuen QR scannst.'))return;
const r=await fetch('/rotate-owner-secret',{method:'POST',headers:{'X-Unpruuf-Admin':'1'}});if(r.ok)location.reload();else alert('Fehlgeschlagen');};
setInterval(async()=>{try{const r=await fetch('/status.json',{cache:'no-store'});const s=await r.json();
if(s.ownerQr&&!document.querySelector('img')){location.reload();return;}
document.getElementById('status').innerHTML=renderStatus(s);}catch(e){}},3000);
function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function torLine(s){if(!s.torEnabled)return '<span class="warn">Aus (eigener Hidden Service des Betreibers)</span>';const t=s.tor;if(!t)return 'startet …';
const cls=t.state==='ready'?'ok':(t.state==='failed'?'bad':'warn');const label={starting:'startet',bootstrapping:'verbindet ('+t.bootstrapPercent+'%)',ready:'online',restarting:'Neustart läuft',failed:'Fehler',stopped:'gestoppt'}[t.state]||t.state;
return '<span class="'+cls+'">'+esc(label)+'</span>'+(t.restarts?' · '+t.restarts+' Neustart(s)':'')+(t.lastError&&t.state!=='ready'?'<br><small>'+esc(t.lastError)+'</small>':'');}
function renderStatus(s){return '<dt>Tor</dt><dd>'+torLine(s)+'</dd><dt>PoW-Schutz</dt><dd>'+(s.torEnabled?'aktiv':'—')+'</dd><dt>Adresse</dt><dd class="code">'+esc(s.address||'…')+'</dd><dt>Profil</dt><dd>'+esc(s.profile.name)+' — '+esc(s.profile.description)+'</dd><dt>Slot</dt><dd>'+s.slot+' von 3</dd><dt>Gespeichert</dt><dd>'+s.stats.queued+' verschlüsselte Pakete</dd>';}
</script></body></html>`;
}

function renderStatus(s: Awaited<ReturnType<typeof statusPayload>>): string {
  const t = s.tor;
  let tor: string;
  if (!s.torEnabled) tor = `<span class="warn">Aus (eigener Hidden Service des Betreibers)</span>`;
  else if (!t) tor = "startet …";
  else tor = `${escapeHtml(t.state)} (${t.bootstrapPercent}%)`;
  return `<dt>Tor</dt><dd>${tor}</dd><dt>PoW-Schutz</dt><dd>${s.torEnabled ? "aktiv" : "—"}</dd>` +
    `<dt>Adresse</dt><dd class="code">${escapeHtml(s.address ?? "…")}</dd>` +
    `<dt>Profil</dt><dd>${escapeHtml(s.profile.name)} — ${escapeHtml(s.profile.description)}</dd>` +
    `<dt>Slot</dt><dd>${s.slot} von 3</dd><dt>Nodes</dt><dd>${s.addresses.length || 1}</dd><dt>Gespeichert</dt><dd>${s.stats.queued} verschlüsselte Pakete</dd>`;
}
