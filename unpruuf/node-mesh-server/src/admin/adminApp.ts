import express, { Express, NextFunction, Request, Response } from "express";
import QRCode from "qrcode";
import { OnionStatus } from "../tor/onionService";
import { Profile, NodeSlot } from "../profiles";
import { Metrics } from "../metrics";
import type { LicenseError, LicenseSummary } from "../license";
import { buildNodeListFile } from "../nodeList";
import type { IntegrityResult } from "../integrity";

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
  /** Packets wait in memory only (Temp Node, or NODE_MESH_STORE=ram). */
  messagesInRam: boolean;
  /** Result of the last release-integrity check (integrity.ts). Absent in tests. */
  integrity?: () => IntegrityResult;
  torEnabled: boolean;
  /** Address contacts reach this node at: the managed onion, or NODE_MESH_PUBLIC_ADDRESS when
   *  the operator runs their own hidden service (Tor disabled here). */
  publicAddress: () => string | null;
  /** Every node address this process serves (one entry per node). */
  publicAddresses?: () => string[];
  torStatus: () => OnionStatus | null;
  /** Sealed key storage (nodeIdentity.ts): locked = restarted, owner hasn't unlocked yet. */
  sealed?: boolean;
  isLocked?: () => boolean;
  unlock?: (ownerSecret: string) => Promise<string[] | null>;
  controlAddress?: () => string | null;
  stats: () => { queued: number; tags: number; oldestAgeMs: number | null };
  /** Overview page: counters (see metrics.ts), configured node count, live registered count. */
  metrics?: Metrics;
  configuredNodes?: number;
  registeredNodes?: () => Promise<number | null>;
  /** Server license (license.ts). Absent = no license handling (older tests); a Temp Node reports "free". */
  license?: () => LicenseSummary;
  applyLicense?: (code: string) => Promise<{ ok: true; summary: LicenseSummary } | { ok: false; error: LicenseError }>;
}

export const OWNER_PREFIX = "unpruuf-node-owner:v1:";

export function ownerConnectionString(address: string, ownerSecret: string): string {
  return `${OWNER_PREFIX}${address}:${ownerSecret}`;
}

/** The owner secret inside a pasted `unpruuf-node-owner:v1:<address>:<secret>` code (a bare
 *  secret is accepted too). */
export function ownerSecretFromCode(code: string): string | null {
  const body = code.startsWith(OWNER_PREFIX) ? code.slice(OWNER_PREFIX.length) : code;
  const secret = body.includes(":") ? body.slice(body.lastIndexOf(":") + 1) : body;
  return /^[A-Za-z0-9_-]{16,128}$/.test(secret) ? secret : null;
}

export function isLoopbackHost(hostHeader: string | undefined, port: number): boolean {
  if (!hostHeader) return false;
  const allowed = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
  return allowed.includes(hostHeader.toLowerCase());
}

export function loopbackOnly(port: number) {
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
  const locked = state.isLocked ? state.isLocked() : false;
  const ownerString = address && !locked ? ownerConnectionString(address, state.getOwnerSecret()) : null;
  return {
    profile: { name: state.profile.name, ttlHours: state.profile.ttlHours, description: state.profile.description },
    slot: state.slot,
    ephemeral: state.ephemeral,
    messagesInRam: state.messagesInRam,
    canRotate: Boolean(state.rotateOwnerSecret) && !locked,
    sealed: Boolean(state.sealed),
    locked,
    controlAddress: state.controlAddress ? state.controlAddress() : null,
    torEnabled: state.torEnabled,
    tor,
    address,
    addresses: state.publicAddresses ? state.publicAddresses() : address ? [address] : [],
    ownerString,
    ownerQr: ownerString ? await QRCode.toDataURL(ownerString, { margin: 1, width: 320 }) : null,
    stats: state.stats(),
    license: state.license ? state.license() : null,
    integrity: state.integrity ? state.integrity() : null,
  };
}

/** Everything the overview page shows. Numbers and addresses only — never a tag or a blob. */
export async function overviewPayload(state: AdminState) {
  const status = await statusPayload(state);
  const stats = state.stats();
  const addresses = status.addresses;
  const configured = state.configuredNodes ?? addresses.length;
  const registered = state.registeredNodes ? await state.registeredNodes() : null;
  const m = state.metrics?.summary() ?? null;
  const license = status.license;
  const unlicensed = license?.status === "missing" || license?.status === "invalid";
  const problems: string[] = [];
  if (unlicensed) problems.push("license-missing");
  else if (status.locked) problems.push("locked");
  else if (state.torEnabled && (!status.tor || status.tor.state !== "ready")) problems.push("tor-not-ready");
  if (!unlicensed && !status.locked && registered !== null && registered < addresses.length) problems.push("nodes-missing");
  if (license?.status === "expired") problems.push("license-expired");
  if (status.integrity && (status.integrity.state === "modified" || status.integrity.state === "bad-signature")) problems.push("integrity");
  const level = !unlicensed && status.locked ? "locked" : problems.length ? "warn" : "ok";
  return {
    level,
    problems,
    profile: status.profile,
    slot: status.slot,
    ephemeral: status.ephemeral,
    messagesInRam: status.messagesInRam,
    sealed: status.sealed,
    locked: status.locked,
    tor: status.tor,
    torEnabled: status.torEnabled,
    nodes: { configured, listed: addresses.length, registered },
    license,
    integrity: status.integrity,
    nodesLicensed: state.configuredNodes ?? state.license?.().maxNodes ?? addresses.length,
    addresses,
    stored: stats,
    uptimeMs: m?.uptimeMs ?? null,
    totals: m?.totals ?? null,
    last24h: m?.last24h ?? null,
    hourly: state.metrics?.hourly() ?? [],
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
    if (state.isLocked?.()) return res.status(423).json({ error: "locked" });
    state.rotateOwnerSecret();
    return res.json({ rotated: true });
  });

  // Fallback for a locked server when the owner's phone isn't at hand: paste the saved owner
  // code here. Same custom-header CSRF guard as rotation.
  app.post("/unlock", express.json({ limit: "4kb" }), async (req, res) => {
    if (req.header("x-unpruuf-admin") !== "1") return res.status(403).json({ error: "forbidden" });
    if (!state.unlock) return res.status(409).json({ error: "not a sealed server" });
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    const secret = ownerSecretFromCode(code);
    const result = secret ? await state.unlock(secret).catch(() => null) : null;
    if (!result) return res.status(401).json({ error: "wrong owner code" });
    return res.json({ unlocked: true });
  });

  // The node list for the owner's own app (nodeList.ts). Contains the owner secret, so: loopback
  // only (see above), custom-header CSRF guard, and never for a locked server.
  app.post("/export-list", (req, res) => {
    if (req.header("x-unpruuf-admin") !== "1") return res.status(403).json({ error: "forbidden" });
    if (state.isLocked?.()) return res.status(423).json({ error: "locked" });
    const addresses = state.publicAddresses ? state.publicAddresses() : [];
    if (state.ephemeral || addresses.length === 0) return res.status(409).json({ error: "no nodes to export yet" });
    const customer = state.license?.().customer;
    const name = `${customer ? customer + " · " : ""}Server ${state.slot}`;
    res.setHeader("Content-Disposition", `attachment; filename="unpruuf-nodes-server-${state.slot}.txt"`);
    res.type("text/plain").send(
      buildNodeListFile({ name, ownerSecret: state.getOwnerSecret(), control: state.controlAddress?.() ?? null, addresses }),
    );
  });

  // Paste a server license (or a renewal). Same custom-header CSRF guard as rotation/unlock.
  app.post("/license", express.json({ limit: "4kb" }), async (req, res) => {
    if (req.header("x-unpruuf-admin") !== "1") return res.status(403).json({ error: "forbidden" });
    if (!state.applyLicense) return res.status(409).json({ error: "no license handling" });
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    const result = await state.applyLicense(code).catch(() => ({ ok: false as const, error: "invalid" as LicenseError }));
    if (!result.ok) return res.status(400).json({ error: result.error });
    return res.json({ ok: true, license: result.summary });
  });

  app.get("/overview.json", async (_req, res) => {
    res.json(await overviewPayload(state));
  });

  app.get("/overview", async (_req, res) => {
    res.type("html").send(renderOverview(await overviewPayload(state)));
  });

  app.get("/", async (_req, res) => {
    const s = await statusPayload(state);
    res.type("html").send(renderPage(s));
  });

  return app;
}

function renderPage(s: Awaited<ReturnType<typeof statusPayload>>): string {
  const title = s.ephemeral ? "unpruuf Temp Node" : `unpruuf Business Node ${s.slot}`;
  const lockBlock = s.locked
    ? `<div class="card"><h2>Gesperrt nach Neustart</h2>
<p>Die Node-Schlüssel liegen nur verschlüsselt auf der Platte. Bis du entsperrst, sind alle Nodes offline — wer diesen Server mitnimmt, kann sie nicht weiterbetreiben.</p>
<p><b>In der unpruuf-App:</b> Einstellungen → Eigene Nodes → <b>Entsperren</b>. Oder hier deinen gespeicherten Owner-Code einfügen:</p>
<p><input id="code" type="password" autocomplete="off" placeholder="unpruuf-node-owner:v1:…" style="width:100%;font:inherit;padding:8px;box-sizing:border-box"></p>
<button id="unlock" class="go">Entsperren</button></div>`
    : "";
  const lic = s.license;
  const licenseBlock = lic && lic.status !== "free" ? renderLicenseCard(lic) : "";
  const unlicensed = lic?.status === "missing" || lic?.status === "invalid";
  const tempBanner = s.ephemeral
    ? `<div class="banner">TEMP NODE — nur für EINEN Chat. Alles liegt nur im Arbeitsspeicher; Fenster schließen = Node und Adresse sind weg.</div>`
    : "";
  const qrBlock = unlicensed
    ? `<p class="warn">Zuerst die Lizenz oben eingeben. Danach erscheint hier der Owner-QR.</p>`
    : s.locked
    ? `<p class="warn">Gesperrt — der Owner-QR erscheint nach dem Entsperren.</p>`
    : s.ownerQr
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
button.go{border-color:var(--ok);color:var(--ok)}
.banner{background:var(--warn);color:#fff;padding:12px 14px;border-radius:10px;font-weight:600}
img{display:block;max-width:100%;height:auto;background:#fff;border-radius:8px}
dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 14px;margin:0}dt{color:var(--dim)}dd{margin:0}
</style></head><body><main>
<h1>${escapeHtml(title)}</h1>
<p class="sub">Einrichtungsseite — nur auf diesem Rechner erreichbar, nie über Tor. <a href="/overview">Zur Übersicht &rarr;</a></p>
${tempBanner}
${licenseBlock}
${lockBlock}
<div class="card"><h2>1. Diesen Node mit deiner App verbinden</h2>
<p>${howTo}</p>
<p class="warn"><b>Dieser Code ist dein Schreibschlüssel.</b> Nur in deine EIGENE App scannen — niemals einem Kontakt geben. Kontakte bekommen die Adresse automatisch beim Pairing.</p>
${qrBlock}
</div>
<div class="card"><h2>2. Status</h2><dl id="status">${renderStatus(s)}</dl></div>
${s.addresses.length > 1 ? `<div class="card"><h2>Nodes auf diesem Server: ${s.addresses.length}</h2>
<p>Ein Scan reicht: Die App holt sich alle ${s.addresses.length} Adressen selbst und gibt jedem Kontakt 3 Nodes daraus, zufällig und auf verschiedene Server verteilt. Kein Kontakt sieht diese Liste.</p>
<details><summary>Adressen anzeigen</summary><p class="code">${s.addresses.map(escapeHtml).join("<br>")}</p></details></div>` : ""}
${!s.ephemeral && !s.locked && s.addresses.length > 0 ? `<div class="card"><h2>Node-Liste für deine App</h2>
<p>Eine Datei mit allen ${s.addresses.length} Node${s.addresses.length === 1 ? "" : "s"} dieses Servers. In der unpruuf-App: <b>Einstellungen → Node-Listen → Liste importieren</b>.</p>
<p class="warn"><b>Die Datei enthält deinen Schreibschlüssel.</b> Nur auf dein eigenes Handy übertragen (Kabel oder vertrauter Weg) und danach löschen. Niemals an einen Kontakt geben.</p>
<button id="export-list" class="go">Liste als Datei speichern</button></div>` : ""}
${s.canRotate ? `<div class="card"><h2>3. Schreibschlüssel erneuern</h2>
<p>Nur nötig, wenn der Owner-QR in falsche Hände geraten sein könnte. Danach den neuen QR in deine eigene App scannen. Kontakte sind nicht betroffen.</p>
<button id="rotate">Schreibschlüssel erneuern</button></div>` : ""}
</main>
<script>
const ub=document.getElementById('unlock');
if(ub)ub.onclick=async()=>{const code=document.getElementById('code').value;
const r=await fetch('/unlock',{method:'POST',headers:{'X-Unpruuf-Admin':'1','Content-Type':'application/json'},body:JSON.stringify({code})});
if(r.ok)location.reload();else alert('Falscher Owner-Code');};
const eb=document.getElementById('export-list');
if(eb)eb.onclick=async()=>{const r=await fetch('/export-list',{method:'POST',headers:{'X-Unpruuf-Admin':'1'}});
if(!r.ok){alert('Export nicht möglich (Server gesperrt oder noch keine Adressen).');return;}
const blob=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);
const m=/filename="([^"]+)"/.exec(r.headers.get('Content-Disposition')||'');a.download=m?m[1]:'unpruuf-nodes.txt';
document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},1000);};
const lb=document.getElementById('lic-go');
if(lb)lb.onclick=async()=>{const code=document.getElementById('lic-code').value;
const r=await fetch('/license',{method:'POST',headers:{'X-Unpruuf-Admin':'1','Content-Type':'application/json'},body:JSON.stringify({code})});
const d=await r.json().catch(()=>({}));
if(r.ok)location.reload();else alert(d.error==='wrong-type'?'Das ist eine App-Lizenz. Hier wird die Server-Lizenz gebraucht (beginnt mit unpruuf-server-license:).':'Dieser Lizenzcode ist ungültig.');};
const rb=document.getElementById('rotate');
if(rb)rb.onclick=async()=>{if(!confirm('Neuen Schreibschlüssel erzeugen? Deine App kann erst wieder senden, wenn du den neuen QR scannst.'))return;
const r=await fetch('/rotate-owner-secret',{method:'POST',headers:{'X-Unpruuf-Admin':'1'}});if(r.ok)location.reload();else alert('Fehlgeschlagen');};
setInterval(async()=>{try{const r=await fetch('/status.json',{cache:'no-store'});const s=await r.json();
if((s.ownerQr&&!document.querySelector('img'))||(!s.locked&&ub)){location.reload();return;}
document.getElementById('status').innerHTML=renderStatus(s);}catch(e){}},3000);
function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function torLine(s){if(s.license&&(s.license.status==='missing'||s.license.status==='invalid'))return '<span class="warn">wartet auf Lizenz</span>';if(!s.torEnabled)return '<span class="warn">Aus (eigener Hidden Service des Betreibers)</span>';const t=s.tor;if(!t)return 'startet …';
const cls=t.state==='ready'?'ok':(t.state==='failed'?'bad':'warn');const label={starting:'startet',bootstrapping:'verbindet ('+t.bootstrapPercent+'%)',ready:'online',restarting:'Neustart läuft',failed:'Fehler',stopped:'gestoppt'}[t.state]||t.state;
return '<span class="'+cls+'">'+esc(label)+'</span>'+(t.restarts?' · '+t.restarts+' Neustart(s)':'')+(t.lastError&&t.state!=='ready'?'<br><small>'+esc(t.lastError)+'</small>':'');}
function renderStatus(s){return '<dt>Tor</dt><dd>'+torLine(s)+'</dd><dt>PoW-Schutz</dt><dd>'+(s.torEnabled?'aktiv':'—')+'</dd><dt>Adresse</dt><dd class="code">'+esc(s.address||'…')+'</dd><dt>Profil</dt><dd>'+esc(s.profile.name)+' — '+esc(s.profile.description)+'</dd><dt>Slot</dt><dd>'+s.slot+' von 3</dd><dt>Lizenz</dt><dd>'+licLine(s)+'</dd><dt>Programm</dt><dd>'+intLine(s.integrity)+'</dd><dt>Schlüssel</dt><dd>'+keyLine(s)+'</dd><dt>Gespeichert</dt><dd>'+s.stats.queued+' verschlüsselte Pakete</dd>';}
function licLine(s){var l=s.license;if(!l||l.status==='free')return '—';var d=l.expiresAtMs?new Date(l.expiresAtMs).toISOString().slice(0,10):'';
if(l.status==='missing')return '<span class="bad">fehlt</span>';if(l.status==='invalid')return '<span class="bad">ungültig</span>';if(l.status==='expired')return '<span class="bad">abgelaufen am '+d+'</span>';
return '<span class="'+(l.status==='expiring'?'warn':'ok')+'">bis '+d+(l.status==='expiring'?' ('+l.daysLeft+' Tage)':'')+'</span>';}
function intLine(i){if(!i)return '—';var fp=i.fingerprint?' <span style="font:12px ui-monospace,Consolas,monospace;word-break:break-all">'+esc(i.fingerprint)+'</span>':'';if(i.state==='ok')return '<span class="ok">unverändert, signiert</span> (Version '+esc(i.version||'?')+')'+fp;if(i.state==='modified')return '<span class="bad">VERÄNDERT</span>: '+i.changed.length+' geändert, '+i.missing.length+' fehlen, '+i.extra.length+' zusätzlich';if(i.state==='bad-signature')return '<span class="bad">Signatur ungültig</span>';if(i.state==='exe')return 'Einzelne Programmdatei, SHA-256'+fp;return '<span class="warn">nicht signiert</span> (Entwicklungsstand)';}
function keyLine(s){if(s.ephemeral)return 'nur im Arbeitsspeicher';if(!s.sealed)return '<span class="warn">auf der Platte (unverschlüsselt)</span>';return s.locked?'<span class="bad">versiegelt — gesperrt</span>':'<span class="ok">versiegelt — entsperrt</span>';}
</script></body></html>`;
}

function integrityLine(i: { state: string; version: string | null; fingerprint: string | null; changed: string[]; missing: string[]; extra: string[] } | null): string {
  if (!i) return "—";
  const fp = i.fingerprint ? ` <span style="font:12px ui-monospace,Consolas,monospace;word-break:break-all">${escapeHtml(i.fingerprint)}</span>` : "";
  switch (i.state) {
    case "ok": return `<span class="ok">unverändert, signiert</span> (Version ${escapeHtml(i.version ?? "?")})${fp}`;
    case "modified": return `<span class="bad">VERÄNDERT</span>: ${i.changed.length} geändert, ${i.missing.length} fehlen, ${i.extra.length} zusätzlich`;
    case "bad-signature": return `<span class="bad">Signatur ungültig</span>`;
    case "exe": return `Einzelne Programmdatei, SHA-256${fp}`;
    default: return `<span class="warn">nicht signiert</span> (Entwicklungsstand)`;
  }
}

function renderStatus(s: Awaited<ReturnType<typeof statusPayload>>): string {
  const t = s.tor;
  let tor: string;
  if (s.license?.status === "missing" || s.license?.status === "invalid") tor = `<span class="warn">wartet auf Lizenz</span>`;
  else if (!s.torEnabled) tor = `<span class="warn">Aus (eigener Hidden Service des Betreibers)</span>`;
  else if (!t) tor = "startet …";
  else tor = `${escapeHtml(t.state)} (${t.bootstrapPercent}%)`;
  return `<dt>Tor</dt><dd>${tor}</dd><dt>PoW-Schutz</dt><dd>${s.torEnabled ? "aktiv" : "—"}</dd>` +
    `<dt>Adresse</dt><dd class="code">${escapeHtml(s.address ?? "…")}</dd>` +
    `<dt>Profil</dt><dd>${escapeHtml(s.profile.name)} — ${escapeHtml(s.profile.description)}</dd>` +
    `<dt>Slot</dt><dd>${s.slot} von 3</dd><dt>Nodes</dt><dd>${s.addresses.length || 1}</dd>` +
    `<dt>Lizenz</dt><dd>${licenseLine(s.license)}</dd>` +
    `<dt>Programm</dt><dd>${integrityLine(s.integrity)}</dd>` +
    `<dt>Schlüssel</dt><dd>${s.ephemeral ? "nur im Arbeitsspeicher" : !s.sealed ? `<span class="warn">auf der Platte (unverschlüsselt)</span>` : s.locked ? `<span class="bad">versiegelt — gesperrt</span>` : `<span class="ok">versiegelt — entsperrt</span>`}</dd><dt>Gespeichert</dt><dd>${s.stats.queued} verschlüsselte Pakete · ${s.messagesInRam ? "nur im Arbeitsspeicher" : "auf der Platte"}</dd>`;
}

function dateOnly(ms: number | null): string {
  return ms === null ? "" : new Date(ms).toISOString().slice(0, 10);
}

function licenseLine(l: LicenseSummary | null): string {
  if (!l || l.status === "free") return "—";
  if (l.status === "missing") return `<span class="bad">fehlt</span>`;
  if (l.status === "invalid") return `<span class="bad">ungültig</span>`;
  if (l.status === "expired") return `<span class="bad">abgelaufen am ${dateOnly(l.expiresAtMs)}</span>`;
  const warn = l.status === "expiring";
  return `<span class="${warn ? "warn" : "ok"}">bis ${dateOnly(l.expiresAtMs)}${warn ? ` (${l.daysLeft} Tage)` : ""}</span>`;
}

function renderLicenseCard(l: LicenseSummary): string {
  const form = `<p><input id="lic-code" type="text" autocomplete="off" placeholder="unpruuf-server-license:v1:…" style="width:100%;font:inherit;padding:8px;box-sizing:border-box"></p>
<button id="lic-go" class="go">Lizenz aktivieren</button>`;
  if (l.status === "missing" || l.status === "invalid") {
    return `<div class="card"><h2>Lizenz erforderlich</h2>
<p>${l.status === "invalid" ? `<span class="bad">Der gespeicherte Lizenzcode ist ungültig.</span> ` : ""}Dieser Server läuft erst mit einer Server-Lizenz von NexonAI. Bitte den Lizenzcode einfügen. Er wird nur hier auf diesem Rechner geprüft und nirgends hin gesendet.</p>
${form}</div>`;
  }
  const rows = `<dl><dt>Kunde</dt><dd>${escapeHtml(l.customer ?? "")}</dd><dt>Seriennummer</dt><dd>${escapeHtml(l.serial ?? "")}</dd>` +
    `<dt>Nodes</dt><dd>${l.maxNodes}</dd><dt>Gültig bis</dt><dd>${licenseLine(l)}</dd></dl>`;
  if (l.status === "expired") {
    return `<div class="card"><h2>Lizenz abgelaufen</h2>${rows}
<p class="bad">Neue Nachrichten werden abgelehnt. Das Abholen bereits abgelegter Pakete funktioniert weiter. Neuen Lizenzcode von NexonAI hier einfügen:</p>${form}</div>`;
  }
  if (l.status === "expiring") {
    return `<div class="card"><h2>Lizenz läuft bald ab</h2>${rows}
<p class="warn">Noch ${l.daysLeft} Tage. Den Verlängerungscode von NexonAI einfach hier einfügen, der Server läuft dabei weiter.</p>${form}</div>`;
  }
  return `<div class="card"><h2>Lizenz</h2>${rows}
<details><summary>Verlängerungscode einfügen</summary>${form}</details></div>`;
}

function renderOverview(o: Awaited<ReturnType<typeof overviewPayload>>): string {
  // Inside <script>: HTML entities are NOT decoded, so only break out of the script tag.
  const initial = JSON.stringify(o).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>unpruuf Node-Übersicht</title>
<style>
:root{--bg:#f6f4ef;--card:#fff;--ink:#1d1b18;--dim:#6b665d;--ok:#1f7a4d;--warn:#a15c00;--bad:#b3261e;--line:#e2ddd2;--bar:#2a6f6a;--bar2:#b9a46a}
@media (prefers-color-scheme:dark){:root{--bg:#171512;--card:#211e1a;--ink:#ece7de;--dim:#a39c90;--ok:#5cc28f;--warn:#e0a24a;--bad:#f2867d;--line:#36312a;--bar:#58b3ab;--bar2:#cdb56f}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:860px;margin:0 auto;padding:24px 16px 56px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:15px;margin:0 0 10px;color:var(--dim);text-transform:uppercase;letter-spacing:.06em}
.sub{color:var(--dim);margin:0 0 18px}a{color:inherit}
.banner{padding:14px 16px;border-radius:10px;font-weight:600;margin-bottom:16px;border:1px solid var(--line);background:var(--card)}
.banner.ok{border-left:6px solid var(--ok)}.banner.warn{border-left:6px solid var(--warn)}.banner.locked{border-left:6px solid var(--bad)}
.banner small{display:block;font-weight:400;color:var(--dim);margin-top:2px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:16px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px}
.tile b{display:block;font-size:28px;font-variant-numeric:tabular-nums;line-height:1.1}.tile span{color:var(--dim);font-size:13px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:16px}
dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 14px;margin:0}dt{color:var(--dim)}dd{margin:0}
.addr{font:12px/1.5 ui-monospace,Consolas,monospace;word-break:break-all;display:flex;gap:8px;align-items:flex-start;padding:4px 0;border-bottom:1px solid var(--line)}
.addr:last-child{border-bottom:0}.addr span{flex:1}.addr button{flex:none}
button{font:inherit;font-size:13px;padding:4px 10px;border-radius:6px;border:1px solid var(--line);background:transparent;color:var(--ink);cursor:pointer}
svg{width:100%;height:auto;display:block}.legend{display:flex;gap:16px;color:var(--dim);font-size:13px;margin-top:6px}
.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px}
.hint{color:var(--dim);font-size:13px}
</style></head><body><main>
<h1>Node-Übersicht</h1>
<p class="sub"><a href="/">&larr; Einrichtungsseite</a> · nur auf diesem Rechner erreichbar · aktualisiert sich selbst</p>
<div id="app"></div>
</main>
<script>
var DATA=${initial};
function esc(v){return String(v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function dur(ms){if(ms==null)return '—';var m=Math.floor(ms/60000);if(m<60)return m+' Min.';var h=Math.floor(m/60);if(h<48)return h+' Std. '+(m%60)+' Min.';return Math.floor(h/24)+' Tage '+(h%24)+' Std.';}
function intRow(i){if(!i)return '';var fp=i.fingerprint?' · <span style="font:12px ui-monospace,Consolas,monospace;word-break:break-all">'+esc(i.fingerprint)+'</span>':'';var v=i.state==='ok'?'<span class="ok">unverändert, signiert</span> (Version '+esc(i.version||'?')+')'+fp:i.state==='modified'?'<span class="bad">VERÄNDERT</span>: '+i.changed.length+' geändert, '+i.missing.length+' fehlen, '+i.extra.length+' zusätzlich':i.state==='bad-signature'?'<span class="bad">Signatur ungültig</span>':i.state==='exe'?'Einzelne Programmdatei, SHA-256'+fp:'<span class="warn">nicht signiert</span> (Entwicklungsstand)';return '<dt>Programm</dt><dd>'+v+'</dd>';}
function licRow(l){if(!l||l.status==='free')return '';var d=l.expiresAtMs?new Date(l.expiresAtMs).toISOString().slice(0,10):'';
var txt=l.status==='missing'?'fehlt':l.status==='invalid'?'ungültig':l.status==='expired'?'abgelaufen am '+d:'bis '+d+' · '+l.maxNodes+' Nodes'+(l.status==='expiring'?' — läuft in '+l.daysLeft+' Tagen ab':'');
var cls=(l.status==='valid')?'':(l.status==='expiring'?' style="color:var(--warn)"':' style="color:var(--bad)"');return '<dt>Lizenz</dt><dd'+cls+'>'+esc(txt)+'</dd>';}
function chart(h){
  if(!h||!h.length)return '<p class="hint">Noch keine Daten.</p>';
  var W=720,H=150,pl=34,pb=22,pt=8,w=W-pl-4,hh=H-pb-pt;
  var max=1;h.forEach(function(x){max=Math.max(max,x.deposit,x.fetch);});
  var step=Math.pow(10,Math.floor(Math.log10(max)));var top=Math.ceil(max/step)*step;
  var bw=w/h.length,out='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Ablagen und Abholungen der letzten 24 Stunden">';
  [0,.5,1].forEach(function(f){var y=pt+hh-hh*f;out+='<line x1="'+pl+'" x2="'+(W-4)+'" y1="'+y+'" y2="'+y+'" stroke="currentColor" opacity=".12"/><text x="'+(pl-6)+'" y="'+(y+4)+'" text-anchor="end" font-size="10" fill="currentColor" opacity=".6">'+Math.round(top*f)+'</text>';});
  h.forEach(function(x,i){
    var x0=pl+i*bw,d=hh*x.deposit/top,f=hh*x.fetch/top;
    out+='<rect x="'+(x0+bw*.1)+'" y="'+(pt+hh-f)+'" width="'+(bw*.38)+'" height="'+f+'" fill="var(--bar2)"/>';
    out+='<rect x="'+(x0+bw*.5)+'" y="'+(pt+hh-d)+'" width="'+(bw*.38)+'" height="'+d+'" fill="var(--bar)"/>';
    if(i%6===0){var t=new Date(x.hourStart);out+='<text x="'+(x0+bw/2)+'" y="'+(H-6)+'" text-anchor="middle" font-size="10" fill="currentColor" opacity=".6">'+('0'+t.getHours()).slice(-2)+':00</text>';}
  });
  return out+'</svg><div class="legend"><span><i style="background:var(--bar)"></i>Ablagen (neue Nachrichten)</span><span><i style="background:var(--bar2)"></i>Abholungen</span></div>';
}
function render(o){
  var t=o.totals||{deposit:0,fetch:0,rejected:0},d=o.last24h||{deposit:0,fetch:0,rejected:0};
  var tor=!o.torEnabled?'Aus (eigener Hidden Service)':(!o.tor?'startet …':({starting:'startet',bootstrapping:'verbindet ('+o.tor.bootstrapPercent+' %)',ready:'online',restarting:'Neustart läuft',failed:'Fehler',stopped:'gestoppt'}[o.tor.state]||o.tor.state));
  var head={ok:['Alles in Ordnung','Server läuft, alle Nodes sind online.'],locked:['Gesperrt nach Neustart','Alle Nodes sind offline, bis du in der App auf „Entsperren“ tippst.'],warn:['Achtung','']}[o.level];
  if(o.level==='warn'){var msgs=[];if(o.problems.indexOf('license-missing')>=0)msgs.push('Es fehlt eine gültige Server-Lizenz. Bitte auf der Einrichtungsseite eintragen.');if(o.problems.indexOf('license-expired')>=0)msgs.push('Die Lizenz ist abgelaufen: neue Nachrichten werden abgelehnt.');if(o.problems.indexOf('tor-not-ready')>=0)msgs.push('Tor ist noch nicht online.');if(o.problems.indexOf('integrity')>=0)msgs.push('Die Programmdateien stimmen nicht mit der signierten Liste überein. Neu von NexonAI herunterladen und vergleichen, bevor der Server weiter benutzt wird.');if(o.problems.indexOf('nodes-missing')>=0)msgs.push('Nur '+o.nodes.registered+' von '+o.nodes.listed+' Nodes sind bei Tor angemeldet. Der Server holt fehlende Nodes beim nächsten täglichen Abgleich selbst nach.');head[1]=msgs.join(' ');}
  var nodesVal=o.locked?'0 / '+o.nodes.configured:(o.nodes.registered==null?o.nodes.listed:o.nodes.registered+' / '+o.nodes.listed);
  var h='<div class="banner '+o.level+'">'+head[0]+'<small>'+esc(head[1])+'</small></div>';
  h+='<div class="grid">'
   +'<div class="tile"><b>'+nodesVal+'</b><span>Nodes online</span></div>'
   +'<div class="tile"><b>'+o.stored.queued+'</b><span>Pakete gespeichert</span></div>'
   +'<div class="tile"><b>'+d.deposit+'</b><span>neue Nachrichten, 24 Std.</span></div>'
   +'<div class="tile"><b>'+d.fetch+'</b><span>Abholungen, 24 Std.</span></div></div>';
  h+='<div class="card"><h2>Letzte 24 Stunden</h2>'+chart(o.hourly)+'</div>';
  h+='<div class="card"><h2>Server</h2><dl>'
   +'<dt>Tor</dt><dd>'+esc(tor)+(o.tor&&o.tor.restarts?' · '+o.tor.restarts+' Neustart(s)':'')+'</dd>'
   +'<dt>Schlüssel</dt><dd>'+(o.ephemeral?'nur im Arbeitsspeicher':!o.sealed?'auf der Platte (unverschlüsselt)':o.locked?'versiegelt — gesperrt':'versiegelt — entsperrt')+'</dd>'
   +'<dt>Profil</dt><dd>'+esc(o.profile.name)+' — Pakete bleiben höchstens '+o.profile.ttlHours+' Std.</dd>'
   +'<dt>Slot</dt><dd>'+o.slot+' von 3</dd>'
   +'<dt>Pakete liegen</dt><dd>'+(o.messagesInRam?'nur im Arbeitsspeicher — Neustart leert sie':'auf der Platte, bis ihre Zeit abläuft')+'</dd>'
   +licRow(o.license)
   +intRow(o.integrity)
   +'<dt>Läuft seit</dt><dd>'+dur(o.uptimeMs)+'</dd>'
   +'<dt>Adressen (Mailboxen)</dt><dd>'+o.stored.tags+' in Benutzung</dd>'
   +'<dt>Ältestes Paket</dt><dd>'+(o.stored.oldestAgeMs==null?'—':dur(o.stored.oldestAgeMs))+'</dd>'
   +'<dt>Abgelehnt, 24 Std.</dt><dd>'+d.rejected+(d.rejected>50?' <span style="color:var(--warn)">(ungewöhnlich viele)</span>':'')+'</dd>'
   +'<dt>Seit Start gesamt</dt><dd>'+t.deposit+' Ablagen · '+t.fetch+' Abholungen</dd></dl>'
   +'<p class="hint" style="margin-top:10px">Der Server zählt nur Mengen. Er speichert nicht, wer abholt oder von wem eine Nachricht kommt, und er kann den Inhalt nicht lesen.</p></div>';
  if(!o.locked&&o.addresses.length){h+='<div class="card"><h2>Node-Adressen ('+o.addresses.length+')</h2>'+o.addresses.map(function(a,i){return '<div class="addr"><span>'+esc(a)+'</span><button data-i="'+i+'">Kopieren</button></div>';}).join('')+'</div>';}
  return h;
}
function paint(o){DATA=o;document.getElementById('app').innerHTML=render(o);}
document.getElementById('app').addEventListener('click',function(e){var b=e.target.closest('button[data-i]');if(!b)return;var a=DATA.addresses[+b.getAttribute('data-i')];
  function done(){b.textContent='Kopiert';setTimeout(function(){b.textContent='Kopieren';},1500);}
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(a).then(done,function(){});}
  else{var t=document.createElement('textarea');t.value=a;document.body.appendChild(t);t.select();try{document.execCommand('copy');done();}catch(x){}document.body.removeChild(t);}});
paint(DATA);
setInterval(function(){fetch('/overview.json',{cache:'no-store'}).then(function(r){return r.json();}).then(paint).catch(function(){});},5000);
</script></body></html>`;
}
