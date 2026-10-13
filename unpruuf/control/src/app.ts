import express, { NextFunction, Request, Response } from "express";
import * as crypto from "crypto";
import QRCode from "qrcode";
import { LoadedBundle, loadBundle } from "./bundle";
import { Jobs } from "./jobs";
import { LicenseInventory, daysLeft, licenseState } from "./licenses";
import * as prov from "./provision";
import { computeWarnings } from "./warnings";
import { Vault, ServerRecord } from "./vault";
import { makeZip } from "./zip";

export interface AppOptions {
  dataDir: string;
  bundleDir: string;
  port: number;
  publicDir: string;
  /** Test hooks. */
  publicKeyB64?: string;
  idleLockMs?: number;
  idleCheckMs?: number;
  pollMs?: number;
  waitAdminMs?: number;
  waitOwnerMs?: number;
}

const LOOPBACK = (port: number) => [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];

function publicServer(s: ServerRecord) {
  const { sshPrivateKey: _k, ownerCode, ...rest } = s;
  return { ...rest, hasOwnerCode: Boolean(ownerCode) };
}

export function createControlApp(opts: AppOptions) {
  const app = express();
  app.disable("x-powered-by");
  const jobs = new Jobs();
  let vault: Vault | null = null;
  let inventory: LicenseInventory | null = null;
  let token: string | null = null;
  let lastActivity = Date.now();
  let failures = 0;
  let lockedUntil = 0;
  const statuses: Record<string, prov.ServerStatus> = {};
  const busy = new Set<string>();
  let bundle: LoadedBundle | null = loadBundle(opts.bundleDir);

  const lock = () => { vault = null; inventory = null; token = null; for (const k of Object.keys(statuses)) delete statuses[k]; };
  const idleMs = opts.idleLockMs ?? 20 * 60_000;
  const idleTimer = setInterval(() => { if (vault && Date.now() - lastActivity > idleMs) lock(); }, opts.idleCheckMs ?? 15_000);
  idleTimer.unref();

  const unlockWith = (v: Vault) => {
    vault = v;
    inventory = new LicenseInventory(v.data.licenses, v.data.servers, opts.publicKeyB64);
    token = crypto.randomBytes(24).toString("hex");
    lastActivity = Date.now();
    return token;
  };

  const ctxFor = (log: (l: string) => void): prov.Ctx => ({
    vault: vault!, inventory: inventory!, bundle, log, pollMs: opts.pollMs, waitAdminMs: opts.waitAdminMs, waitOwnerMs: opts.waitOwnerMs,
  });

  // ── guards ──
  app.use((req, res, next) => {
    const host = (req.headers.host ?? "").toLowerCase();
    if (!LOOPBACK(opts.port).includes(host)) return res.status(403).send("forbidden");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; form-action 'none'");
    next();
  });
  app.use(express.json({ limit: "512kb" }));
  app.use(express.static(opts.publicDir, { index: "index.html" }));

  const csrf = (req: Request, res: Response, next: NextFunction) => {
    // A page in another tab cannot send a custom header without a CORS preflight, which is never answered.
    if (req.method !== "GET" && req.header("x-unpruuf-control") !== "1") return res.status(403).json({ error: "forbidden" });
    next();
  };
  const auth = (req: Request, res: Response, next: NextFunction) => {
    if (!vault || !token || req.header("x-control-token") !== token) return res.status(401).json({ error: "locked" });
    lastActivity = Date.now();
    next();
  };
  const find = (req: Request, res: Response): ServerRecord | null => {
    const s = vault!.data.servers.find((x) => x.id === req.params.id);
    if (!s) { res.status(404).json({ error: "unknown-server" }); return null; }
    return s;
  };
  const guardBusy = (s: ServerRecord, res: Response): boolean => {
    if (busy.has(s.id)) { res.status(409).json({ error: "busy" }); return false; }
    return true;
  };
  const runJob = (title: string, ids: string[], fn: (log: (l: string) => void, set: (r: Record<string, unknown>) => void) => Promise<void>) => {
    ids.forEach((i) => busy.add(i));
    return jobs.start(title, async (log, set) => {
      try { await fn(log, set); } finally { ids.forEach((i) => busy.delete(i)); }
    });
  };

  // ── vault ──
  app.get("/api/state", (_req, res) => {
    res.json({
      vaultExists: Vault.exists(opts.dataDir),
      unlocked: Boolean(vault),
      company: vault?.data.company ?? null,
      bundle: bundle?.info ?? null,
    });
  });

  app.post("/api/vault/create", csrf, (req, res) => {
    if (Vault.exists(opts.dataDir)) return res.status(409).json({ error: "exists" });
    const { passphrase, company } = req.body ?? {};
    if (typeof passphrase !== "string" || Vault.validatePassphrase(passphrase)) return res.status(400).json({ error: "passphrase-too-short" });
    if (typeof company !== "string" || !company.trim()) return res.status(400).json({ error: "company" });
    const v = Vault.create(opts.dataDir, passphrase, company);
    res.json({ token: unlockWith(v) });
  });

  app.post("/api/vault/unlock", csrf, (req, res) => {
    if (Date.now() < lockedUntil) return res.status(429).json({ error: "wait", seconds: Math.ceil((lockedUntil - Date.now()) / 1000) });
    const passphrase = typeof req.body?.passphrase === "string" ? req.body.passphrase : "";
    const v = Vault.open(opts.dataDir, passphrase);
    if (!v) {
      failures++;
      if (failures >= 5) { lockedUntil = Date.now() + 30_000; failures = 0; }
      return res.status(401).json({ error: "wrong-passphrase" });
    }
    failures = 0;
    bundle = loadBundle(opts.bundleDir);
    res.json({ token: unlockWith(v) });
  });

  app.post("/api/vault/lock", csrf, auth, (_req, res) => { lock(); res.json({ ok: true }); });

  app.post("/api/vault/passphrase", csrf, auth, (req, res) => {
    const { oldPassphrase, newPassphrase } = req.body ?? {};
    if (typeof oldPassphrase !== "string" || typeof newPassphrase !== "string") return res.status(400).json({ error: "bad-request" });
    if (Vault.validatePassphrase(newPassphrase)) return res.status(400).json({ error: "passphrase-too-short" });
    if (!vault!.changePassphrase(oldPassphrase, newPassphrase)) return res.status(401).json({ error: "wrong-passphrase" });
    res.json({ ok: true });
  });

  app.get("/api/vault/backup", auth, (_req, res) => {
    res.setHeader("Content-Disposition", `attachment; filename="unpruuf-control-vault-${new Date().toISOString().slice(0, 10)}.enc"`);
    res.type("application/octet-stream").send(vault!.exportEncrypted());
  });

  // ── overview ──
  app.get("/api/overview", auth, (_req, res) => {
    const now = Date.now();
    const d = vault!.data;
    const inv = inventory!;
    const lic = (kind: "server" | "app") =>
      inv.list(kind).map((l) => ({
        kind: l.kind, serial: l.serial, customer: l.customer, edition: l.edition, maxNodes: l.maxNodes,
        issuedAtMs: l.issuedAtMs, expiresAtMs: l.expiresAtMs, state: licenseState(l, now), daysLeft: daysLeft(l, now), assigned: l.assigned,
        assignedName: l.assigned?.type === "server" ? d.servers.find((s) => s.id === (l.assigned as { serverId: string }).serverId)?.name ?? null : null,
      }));
    res.json({
      company: d.company,
      now,
      bundle: bundle?.info ?? null,
      servers: d.servers.map((s) => ({ ...publicServer(s), status: statuses[s.id] ?? null, busy: busy.has(s.id) })),
      licenses: { server: lic("server"), app: lic("app") },
      summary: { server: inv.summary("server"), app: inv.summary("app") },
      warnings: computeWarnings(d, statuses, bundle, inv, now),
    });
  });

  // ── servers ──
  app.post("/api/servers/probe", csrf, auth, async (req, res) => {
    const { host, port, user, password } = req.body ?? {};
    if (typeof host !== "string" || typeof user !== "string" || typeof password !== "string" || !password) return res.status(400).json({ error: "bad-request" });
    try {
      res.json(await prov.probeServer({ host: host.trim(), port: Number(port) || 22, user: user.trim(), password }));
    } catch (e) {
      res.status(502).json({ error: (e as { code?: string }).code ?? "network", message: String((e as Error).message) });
    }
  });

  app.post("/api/servers", csrf, auth, (req, res) => {
    const b = req.body ?? {};
    const def = prov.defaultsFor(b.product);
    const input: prov.NewServerInput = {
      name: String(b.name ?? ""), host: String(b.host ?? "").trim(), port: Number(b.port) || 22, user: String(b.user ?? "").trim(),
      password: String(b.password ?? ""), hostKey: String(b.hostKey ?? ""), provider: String(b.provider ?? ""), region: String(b.region ?? ""),
      product: b.product, profile: b.profile ?? def.profile, store: b.store ?? def.store, hardenPassword: b.hardenPassword !== false, license: String(b.license ?? "auto"),
    };
    const bad = prov.validateNewServer(input, vault!.data.servers);
    if (bad) return res.status(400).json({ error: "invalid", field: bad });
    if (!bundle) return res.status(409).json({ error: "no-bundle" });
    if (input.license === "auto" && !inventory!.nextFreeServerCode()) return res.status(409).json({ error: "no-free-license" });
    const job = runJob(`Install ${input.name}`, [], async (log, set) => {
      const rec = await prov.addAndInstall(ctxFor(log), input);
      set({ serverId: rec.id });
    });
    res.json({ jobId: job.id });
  });

  app.post("/api/servers/status", csrf, auth, async (req, res) => {
    const only = typeof req.body?.id === "string" ? req.body.id : null;
    const targets = vault!.data.servers.filter((s) => !only || s.id === only);
    const queue = [...targets];
    const worker = async () => {
      for (let s = queue.shift(); s; s = queue.shift()) {
        if (busy.has(s.id)) continue;
        statuses[s.id] = await prov.getStatus(ctxFor(() => {}), s);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    res.json({ statuses });
  });

  app.post("/api/servers/:id/install", csrf, auth, (req, res) => {
    const s = find(req, res); if (!s || !guardBusy(s, res)) return;
    if (!bundle) return res.status(409).json({ error: "no-bundle" });
    const password = typeof req.body?.password === "string" ? req.body.password : undefined;
    const job = runJob(`Install ${s.name}`, [s.id], (log) => prov.installServer(ctxFor(log), s, { password, hardenPassword: req.body?.hardenPassword !== false }));
    res.json({ jobId: job.id });
  });

  app.post("/api/servers/:id/unlock", csrf, auth, async (req, res) => {
    const s = find(req, res); if (!s) return;
    try { await prov.unlockServer(ctxFor(() => {}), s); statuses[s.id] = await prov.getStatus(ctxFor(() => {}), s); res.json({ ok: true, status: statuses[s.id] }); }
    catch (e) { res.status(502).json({ error: String((e as Error).message) }); }
  });

  app.post("/api/servers/unlock-all", csrf, auth, async (_req, res) => {
    const out: Record<string, string> = {};
    for (const s of vault!.data.servers) {
      if (!statuses[s.id]?.locked) continue;
      try { await prov.unlockServer(ctxFor(() => {}), s); out[s.id] = "ok"; } catch (e) { out[s.id] = String((e as Error).message); }
    }
    res.json({ results: out });
  });

  app.post("/api/servers/:id/update", csrf, auth, (req, res) => {
    const s = find(req, res); if (!s || !guardBusy(s, res)) return;
    if (!bundle) return res.status(409).json({ error: "no-bundle" });
    const job = runJob(`Update ${s.name}`, [s.id], (log) => prov.updateServer(ctxFor(log), s));
    res.json({ jobId: job.id });
  });

  app.post("/api/servers/:id/remove", csrf, auth, (req, res) => {
    const s = find(req, res); if (!s || !guardBusy(s, res)) return;
    if (req.body?.confirmName !== s.name) return res.status(400).json({ error: "confirm-name" });
    const wipe = req.body?.wipe === true;
    const job = runJob(`Remove ${s.name}`, [s.id], (log) => prov.removeServer(ctxFor(log), s, wipe));
    res.json({ jobId: job.id });
  });

  app.post("/api/servers/:id/settings", csrf, auth, (req, res) => {
    const s = find(req, res); if (!s) return;
    const b = req.body ?? {};
    if (typeof b.name === "string" && b.name.trim() && b.name.length <= 60 && !vault!.data.servers.some((x) => x !== s && x.name.toLowerCase() === b.name.trim().toLowerCase())) s.name = b.name.trim();
    if (typeof b.provider === "string") s.provider = b.provider.trim().slice(0, 60);
    if (typeof b.region === "string") s.region = b.region.trim().slice(0, 60);
    vault!.save();
    res.json({ ok: true, server: publicServer(s) });
  });

  app.post("/api/servers/:id/license", csrf, auth, async (req, res) => {
    const s = find(req, res); if (!s || !guardBusy(s, res)) return;
    const serial = typeof req.body?.serial === "string" ? req.body.serial : null;
    if (serial && s.licenseSerial !== serial) {
      if (s.licenseSerial) return res.status(409).json({ error: "server-has-one" });
      const r = inventory!.assignToServer(serial, s.id);
      if (!r.ok) return res.status(409).json({ error: r.error });
      vault!.save();
    }
    try { await prov.pushLicense(ctxFor(() => {}), s); statuses[s.id] = await prov.getStatus(ctxFor(() => {}), s); res.json({ ok: true, status: statuses[s.id] }); }
    catch (e) { res.status(502).json({ error: String((e as Error).message) }); }
  });

  app.post("/api/servers/:id/rotate", csrf, auth, async (req, res) => {
    const s = find(req, res); if (!s || !guardBusy(s, res)) return;
    if (req.body?.confirmName !== s.name) return res.status(400).json({ error: "confirm-name" });
    try { await prov.rotateWriteKey(ctxFor(() => {}), s); res.json({ ok: true }); }
    catch (e) { res.status(502).json({ error: String((e as Error).message) }); }
  });

  app.post("/api/servers/:id/bridges", csrf, auth, async (req, res) => {
    const s = find(req, res); if (!s || !guardBusy(s, res)) return;
    try { res.json({ ok: true, ...(await prov.setBridges(ctxFor(() => {}), s, String(req.body?.text ?? ""))) }); }
    catch (e) { res.status(502).json({ error: String((e as Error).message) }); }
  });

  app.get("/api/servers/:id/list", auth, async (req, res) => {
    const s = find(req, res); if (!s) return;
    try {
      const text = await prov.exportList(s);
      res.setHeader("Content-Disposition", `attachment; filename="unpruuf-nodes-${s.name.replace(/[^A-Za-z0-9._-]+/g, "_")}.txt"`);
      res.type("text/plain").send(text);
    } catch (e) { res.status(502).json({ error: String((e as Error).message) }); }
  });

  app.get("/api/lists.zip", auth, async (_req, res) => {
    const files: { name: string; data: Buffer }[] = [];
    const report: string[] = ["unpruuf node lists: one file per server. Each file contains the write key of its server: hand them out like passwords and delete them after import.", ""];
    for (const s of vault!.data.servers) {
      if (!s.installedAt) { report.push(`${s.name}: not installed, skipped`); continue; }
      try {
        files.push({ name: `unpruuf-nodes-${s.name.replace(/[^A-Za-z0-9._-]+/g, "_")}.txt`, data: Buffer.from(await prov.exportList(s), "utf8") });
        report.push(`${s.name}: ok`);
      } catch (e) { report.push(`${s.name}: NOT included (${String((e as Error).message)})`); }
    }
    files.push({ name: "REPORT.txt", data: Buffer.from(report.join("\n") + "\n") });
    res.setHeader("Content-Disposition", `attachment; filename="unpruuf-node-lists-${new Date().toISOString().slice(0, 10)}.zip"`);
    res.type("application/zip").send(makeZip(files));
  });

  // ── licences ──
  app.post("/api/licenses/import", csrf, auth, (req, res) => {
    const text = typeof req.body?.text === "string" ? req.body.text : "";
    if (!text.trim()) return res.status(400).json({ error: "empty" });
    const report = inventory!.importText(text);
    vault!.save();
    res.json(report);
  });

  app.post("/api/licenses/assign", csrf, auth, (req, res) => {
    const { kind, serial, target } = req.body ?? {};
    if ((kind !== "server" && kind !== "app") || typeof serial !== "string" || typeof target !== "string") return res.status(400).json({ error: "bad-request" });
    const r = kind === "server" ? inventory!.assignToServer(serial, target) : inventory!.assignToDevice(serial, target);
    if (!r.ok) return res.status(409).json({ error: r.error });
    vault!.save();
    res.json({ ok: true });
  });

  app.post("/api/licenses/release", csrf, auth, (req, res) => {
    const { kind, serial } = req.body ?? {};
    if ((kind !== "server" && kind !== "app") || typeof serial !== "string") return res.status(400).json({ error: "bad-request" });
    const l = inventory!.bySerial(kind, serial);
    if (l?.assigned?.type === "server") {
      const s = vault!.data.servers.find((x) => x.id === (l.assigned as { serverId: string }).serverId);
      if (s?.installedAt) return res.status(409).json({ error: "installed" }); // a server that runs with it: remove the server first
    }
    if (!inventory!.release(kind, serial)) return res.status(404).json({ error: "not-assigned" });
    vault!.save();
    res.json({ ok: true });
  });

  app.get("/api/licenses.csv", auth, (req, res) => {
    res.setHeader("Content-Disposition", `attachment; filename="unpruuf-licences-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.type("text/csv").send(inventory!.csv(req.query.codes === "1"));
  });

  app.get("/api/licenses/:kind/:serial/code", auth, async (req, res) => {
    const kind = req.params.kind === "server" ? "server" : req.params.kind === "app" ? "app" : null;
    const l = kind ? inventory!.bySerial(kind, req.params.serial) : undefined;
    if (!l) return res.status(404).json({ error: "unknown" });
    res.json({ code: l.code, qr: await QRCode.toDataURL(l.code, { margin: 1, width: 360, errorCorrectionLevel: "L" }) });
  });

  // ── jobs ──
  app.get("/api/jobs/:id", auth, (req, res) => {
    jobs.prune();
    const j = jobs.get(req.params.id);
    if (!j) return res.status(404).json({ error: "unknown-job" });
    const from = Math.max(0, Number(req.query.from) || 0);
    res.json({ id: j.id, title: j.title, state: j.state, error: j.error, result: j.result, total: j.lines.length, lines: j.lines.slice(from) });
  });

  return { app, close: () => clearInterval(idleTimer), _test: { lock, jobs } };
}
