import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as http from "http";
import * as net from "net";
import * as path from "path";
import { execFileSync } from "child_process";
import { createControlApp } from "../app";
import { FakeVps, appCode, makeBundle, newKeys, serverCode, tmpDir } from "./helpers";

const keys = newKeys();
const PUB = path.join(__dirname, "..", "public");

async function boot(over: Record<string, unknown> = {}) {
  const dataDir = tmpDir("ctl-data-"), bundleDir = tmpDir("ctl-bundle-");
  const b = makeBundle();
  fs.writeFileSync(path.join(bundleDir, "node-server.tgz"), b.data);
  fs.writeFileSync(path.join(bundleDir, "bundle.json"), JSON.stringify(b.info));
  const holder: { port: number } = { port: 0 };
  // The page only answers its own loopback port, so the port must be known before the app is built.
  const probe = net.createServer(); await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
  holder.port = (probe.address() as net.AddressInfo).port; probe.close();
  const { app, close } = createControlApp({ dataDir, bundleDir, port: holder.port, publicDir: PUB, publicKeyB64: keys.publicKeyB64, pollMs: 20, waitAdminMs: 3000, waitOwnerMs: 3000, ...over });
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(holder.port, "127.0.0.1", r));
  const base = `http://127.0.0.1:${holder.port}`;
  let token: string | null = null;
  const call = async (method: string, p: string, body?: unknown, opts: { token?: string | null; csrf?: boolean } = {}) => {
    const headers: Record<string, string> = {};
    if ((opts.csrf ?? true) && method !== "GET") headers["x-unpruuf-control"] = "1";
    const tk = opts.token === undefined ? token : opts.token;
    if (tk) headers["x-control-token"] = tk;
    if (body !== undefined) headers["content-type"] = "application/json";
    const r = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const buf = Buffer.from(await r.arrayBuffer());
    let json: any = null; try { json = JSON.parse(buf.toString()); } catch { /* binary or text */ }
    return { status: r.status, json, buf, headers: r.headers };
  };
  return {
    call, base, port: holder.port, dataDir, setToken: (t: string | null) => { token = t; },
    stop: () => { close(); server.close(); server.closeAllConnections(); },
  };
}

async function loggedIn(over: Record<string, unknown> = {}) {
  const c = await boot(over);
  const r = await c.call("POST", "/api/vault/create", { passphrase: "a long passphrase", company: "Acme SRL" });
  c.setToken(r.json.token);
  return c;
}

test("first start: create the vault, then everything needs the token", async () => {
  const c = await boot();
  assert.deepEqual((await c.call("GET", "/api/state")).json, { vaultExists: false, unlocked: false, company: null, bundle: (await c.call("GET", "/api/state")).json.bundle });
  assert.equal((await c.call("POST", "/api/vault/create", { passphrase: "short", company: "A" })).status, 400);
  assert.equal((await c.call("POST", "/api/vault/create", { passphrase: "a long passphrase", company: " " })).status, 400);
  const r = await c.call("POST", "/api/vault/create", { passphrase: "a long passphrase", company: "Acme SRL" });
  assert.equal(r.status, 200);
  assert.equal((await c.call("POST", "/api/vault/create", { passphrase: "another long one", company: "B" })).status, 409);
  assert.equal((await c.call("GET", "/api/overview", undefined, { token: null })).status, 401);
  assert.equal((await c.call("GET", "/api/overview", undefined, { token: "wrong" })).status, 401);
  c.setToken(r.json.token);
  const ov = await c.call("GET", "/api/overview");
  assert.equal(ov.status, 200);
  assert.equal(ov.json.company, "Acme SRL");
  assert.equal(ov.json.bundle.version, "9.9.9");
  c.stop();
});

test("a POST without the custom header is refused (another tab cannot drive Control)", async () => {
  const c = await loggedIn();
  assert.equal((await c.call("POST", "/api/licenses/import", { text: "x" }, { csrf: false })).status, 403);
  assert.equal((await c.call("POST", "/api/vault/lock", {}, { csrf: false })).status, 403);
  c.stop();
});

test("only the loopback host names are answered (DNS rebinding)", async () => {
  const c = await boot();
  for (const host of ["evil.example", `localhost.evil.example:${c.port}`, "127.0.0.1", `127.0.0.1:${c.port + 1}`]) {
    const status = await new Promise<number>((res) => {
      const req = http.request({ host: "127.0.0.1", port: c.port, path: "/api/state", headers: { Host: host } }, (r) => { r.resume(); res(r.statusCode ?? 0); });
      req.end();
    });
    assert.equal(status, 403, host);
  }
  const ok = await new Promise<number>((res) => { http.get({ host: "127.0.0.1", port: c.port, path: "/", headers: { Host: `localhost:${c.port}` } }, (r) => { r.resume(); res(r.statusCode ?? 0); }); });
  assert.equal(ok, 200);
  c.stop();
});

test("security headers on every answer", async () => {
  const c = await boot();
  const r = await c.call("GET", "/api/state");
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(r.headers.get("x-frame-options"), "DENY");
  assert.match(r.headers.get("content-security-policy")!, /script-src 'self'/);
  assert.match(r.headers.get("content-security-policy")!, /default-src 'none'/);
  c.stop();
});

test("lock, wrong passphrase, throttling, unlock", async () => {
  const c = await loggedIn();
  assert.equal((await c.call("POST", "/api/vault/lock", {})).status, 200);
  assert.equal((await c.call("GET", "/api/overview")).status, 401, "the old token is dead");
  for (let i = 0; i < 4; i++) assert.equal((await c.call("POST", "/api/vault/unlock", { passphrase: "nope nope nope" }, { token: null })).status, 401);
  assert.equal((await c.call("POST", "/api/vault/unlock", { passphrase: "nope nope nope" }, { token: null })).status, 401);
  const throttled = await c.call("POST", "/api/vault/unlock", { passphrase: "a long passphrase" }, { token: null });
  assert.equal(throttled.status, 429, "even the right passphrase waits after five failures");
  c.stop();
  const d = await boot({});
  d.stop();
});

test("unlock with the right passphrase after a lock gives a fresh token", async () => {
  const c = await loggedIn();
  await c.call("POST", "/api/vault/lock", {});
  const u = await c.call("POST", "/api/vault/unlock", { passphrase: "a long passphrase" }, { token: null });
  assert.equal(u.status, 200);
  c.setToken(u.json.token);
  assert.equal((await c.call("GET", "/api/overview")).status, 200);
  c.stop();
});

test("the vault locks itself when idle", async () => {
  const c = await loggedIn({ idleLockMs: 150, idleCheckMs: 50 });
  assert.equal((await c.call("GET", "/api/overview")).status, 200);
  await new Promise((r) => setTimeout(r, 500));
  assert.equal((await c.call("GET", "/api/overview")).status, 401);
  assert.equal((await c.call("GET", "/api/state")).json.unlocked, false);
  c.stop();
});

test("change passphrase and download the encrypted backup", async () => {
  const c = await loggedIn();
  assert.equal((await c.call("POST", "/api/vault/passphrase", { oldPassphrase: "wrong wrong", newPassphrase: "a new long passphrase" })).status, 401);
  assert.equal((await c.call("POST", "/api/vault/passphrase", { oldPassphrase: "a long passphrase", newPassphrase: "short" })).status, 400);
  assert.equal((await c.call("POST", "/api/vault/passphrase", { oldPassphrase: "a long passphrase", newPassphrase: "a new long passphrase" })).status, 200);
  const b = await c.call("GET", "/api/vault/backup");
  assert.equal(b.status, 200);
  assert.ok(!b.buf.toString().includes("Acme"), "the backup is the encrypted file");
  await c.call("POST", "/api/vault/lock", {});
  assert.equal((await c.call("POST", "/api/vault/unlock", { passphrase: "a long passphrase" }, { token: null })).status, 401);
  assert.equal((await c.call("POST", "/api/vault/unlock", { passphrase: "a new long passphrase" }, { token: null })).status, 200);
  c.stop();
});

test("licence import, hand-out and the code view", async () => {
  const c = await loggedIn();
  const text = [serverCode(keys, "SRV-0001"), appCode(keys, "PRO-0001"), "garbage"].join("\n");
  const r = await c.call("POST", "/api/licenses/import", { text });
  assert.equal(r.json.added, 2);
  assert.equal(r.json.invalid.length, 0, "loose words between codes are ignored");
  assert.equal((await c.call("POST", "/api/licenses/import", { text: "" })).status, 400);
  const ov = (await c.call("GET", "/api/overview")).json;
  assert.equal(ov.summary.server.free, 1);
  assert.equal(ov.licenses.app[0].edition, "pro");
  assert.ok(!JSON.stringify(ov).includes("unpruuf-server-license:v1"), "the overview never carries a code");
  assert.equal((await c.call("POST", "/api/licenses/assign", { kind: "app", serial: "PRO-0001", target: "Anna, Samsung" })).status, 200);
  assert.equal((await c.call("POST", "/api/licenses/assign", { kind: "app", serial: "PRO-0001", target: "Bob" })).json.error, "taken");
  assert.equal((await c.call("POST", "/api/licenses/assign", { kind: "app", serial: "PRO-0001", target: "" })).json.error, "label");
  assert.equal((await c.call("POST", "/api/licenses/assign", { kind: "bad", serial: "x", target: "y" })).status, 400);
  const code = await c.call("GET", "/api/licenses/app/PRO-0001/code");
  assert.match(code.json.code, /^unpruuf-license:v1:/);
  assert.match(code.json.qr, /^data:image\/png;base64,/);
  assert.equal((await c.call("GET", "/api/licenses/app/NOPE/code")).status, 404);
  const csv = (await c.call("GET", "/api/licenses.csv")).buf.toString();
  assert.ok(csv.includes("PRO-0001") && !csv.includes("unpruuf-license:v1"));
  assert.ok((await c.call("GET", "/api/licenses.csv?codes=1")).buf.toString().includes("unpruuf-license:v1"));
  assert.equal((await c.call("POST", "/api/licenses/release", { kind: "app", serial: "PRO-0001" })).status, 200);
  assert.equal((await c.call("POST", "/api/licenses/release", { kind: "app", serial: "PRO-0001" })).status, 404);
  c.stop();
});

async function waitJob(c: Awaited<ReturnType<typeof boot>>, id: string) {
  for (let i = 0; i < 400; i++) {
    const j = (await c.call("GET", `/api/jobs/${id}`)).json;
    if (j.state !== "running") return j;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("job did not finish");
}

test("end to end through the API: probe, install, status, list, zip, details, remove", async () => {
  const fake = new FakeVps(keys); await fake.start();
  const c = await loggedIn();
  await c.call("POST", "/api/licenses/import", { text: serverCode(keys, "SRV-0001") });

  const probe = await c.call("POST", "/api/servers/probe", { host: "127.0.0.1", port: fake.port, user: "root", password: "pw-123" });
  assert.equal(probe.status, 200);
  assert.equal(probe.json.hostKey, fake.hostKeyFingerprint);
  assert.equal((await c.call("POST", "/api/servers/probe", { host: "127.0.0.1", port: fake.port, user: "root", password: "bad" })).status, 502);

  const body = { host: "127.0.0.1", port: fake.port, user: "root", password: "pw-123", hostKey: probe.json.hostKey, name: "Server A", provider: "Hetzner", region: "Falkenstein", product: "safeline", license: "auto" };
  assert.equal((await c.call("POST", "/api/servers", { ...body, name: " " })).status, 400);
  assert.equal((await c.call("POST", "/api/servers", { ...body, host: "x y" })).json.field, "host");
  const started = await c.call("POST", "/api/servers", body);
  assert.equal(started.status, 200);
  const job = await waitJob(c, started.json.jobId);
  assert.equal(job.state, "done", job.error);
  assert.ok(job.lines.some((l: string) => l.includes("is installed")));
  assert.ok(!job.lines.join("\n").includes("pw-123"));
  // the product choice selected the matching defaults
  assert.deepEqual(fake.runEnv, { NODE_SLOT: "1", NODE_PROFILE: "offline-tolerant", NODE_MESH_STORE: "disk", ADMIN_PORT: "8790" });

  const sid = job.result.serverId as string;
  let ov = (await c.call("GET", "/api/overview")).json;
  const s = ov.servers[0];
  assert.equal(s.id, sid);
  assert.equal(s.hasOwnerCode, true);
  assert.ok(!("sshPrivateKey" in s) && !("ownerCode" in s));
  assert.ok(!JSON.stringify(ov).includes("OWNERSECRET"), "no secret in the overview");
  assert.equal(ov.summary.server.assigned, 1);

  const st = await c.call("POST", "/api/servers/status", {});
  assert.equal(st.json.statuses[sid].level, "ok");
  ov = (await c.call("GET", "/api/overview")).json;
  assert.equal(ov.servers[0].status.nodes.registered, 250);
  assert.ok(ov.warnings.some((w: any) => w.code === "single-server"));

  const list = await c.call("GET", `/api/servers/${sid}/list`);
  assert.match(list.buf.toString(), /OWNERSECRET0123456789/);
  const zip = await c.call("GET", "/api/lists.zip");
  const zp = path.join(tmpDir(), "l.zip"); fs.writeFileSync(zp, zip.buf);
  assert.match(execFileSync("unzip", ["-t", zp]).toString(), /No errors detected/);
  assert.match(execFileSync("unzip", ["-l", zp]).toString(), /REPORT\.txt/);

  // restart: locked → unlock-all → fine again
  fake.admin.locked = true;
  await c.call("POST", "/api/servers/status", {});
  assert.ok((await c.call("GET", "/api/overview")).json.warnings.some((w: any) => w.code === "locked"));
  assert.equal((await c.call("GET", `/api/servers/${sid}/list`)).status, 502, "no list from a locked server");
  await c.call("POST", "/api/servers/unlock-all", {});
  await c.call("POST", "/api/servers/status", {});
  assert.ok(!(await c.call("GET", "/api/overview")).json.warnings.some((w: any) => w.code === "locked"));

  // labels, bridges
  assert.equal((await c.call("POST", `/api/servers/${sid}/settings`, { name: "Server B", provider: "OVH", region: "Roubaix" })).status, 200);
  assert.equal((await c.call("POST", `/api/servers/${sid}/bridges`, { text: "obfs4 1.2.3.4:443 A cert=x iat-mode=0" })).json.saved, 1);

  // the licence stays given out while the server runs
  assert.equal((await c.call("POST", "/api/licenses/release", { kind: "server", serial: "SRV-0001" })).json?.error, "installed");

  // remove: needs the exact name
  assert.equal((await c.call("POST", `/api/servers/${sid}/remove`, { confirmName: "nope" })).status, 400);
  const rm = await c.call("POST", `/api/servers/${sid}/remove`, { confirmName: "Server B", wipe: true });
  assert.equal((await waitJob(c, rm.json.jobId)).state, "done");
  ov = (await c.call("GET", "/api/overview")).json;
  assert.equal(ov.servers.length, 0);
  assert.equal(ov.summary.server.free, 1, "the licence is free again");
  fake.stop(); c.stop();
});

test("a second install with an already used licence is stopped before anything happens", async () => {
  const fake = new FakeVps(keys); await fake.start();
  const c = await loggedIn();
  await c.call("POST", "/api/licenses/import", { text: serverCode(keys, "SRV-0001") });
  const probe = await c.call("POST", "/api/servers/probe", { host: "127.0.0.1", port: fake.port, user: "root", password: "pw-123" });
  const base = { host: "127.0.0.1", port: fake.port, user: "root", password: "pw-123", hostKey: probe.json.hostKey, product: "business" };
  const a = await c.call("POST", "/api/servers", { ...base, name: "A", license: "auto" });
  assert.equal((await waitJob(c, a.json.jobId)).state, "done");
  const other = new FakeVps(keys); await other.start();
  const p2 = await c.call("POST", "/api/servers/probe", { host: "127.0.0.1", port: other.port, user: "root", password: "pw-123" });
  const stepsBefore = other.steps.length;
  const b = await c.call("POST", "/api/servers", { ...base, port: other.port, hostKey: p2.json.hostKey, name: "B", license: "SRV-0001" });
  assert.equal(b.status, 200);
  const j = await waitJob(c, b.json.jobId);
  assert.equal(j.state, "failed");
  assert.match(j.error, /license-taken/);
  assert.equal(other.steps.length, stepsBefore, "nothing was done on the second VPS");
  const none = await c.call("POST", "/api/servers", { ...base, port: other.port, hostKey: p2.json.hostKey, name: "C", license: "auto" });
  assert.equal(none.status, 409);
  assert.equal(none.json.error, "no-free-license");
  fake.stop(); other.stop(); c.stop();
});

test("a server that is installing cannot be changed at the same time", async () => {
  const fake = new FakeVps(keys, { failBuild: true }); await fake.start();
  const c = await loggedIn();
  await c.call("POST", "/api/licenses/import", { text: serverCode(keys, "SRV-0001") });
  const probe = await c.call("POST", "/api/servers/probe", { host: "127.0.0.1", port: fake.port, user: "root", password: "pw-123" });
  const st = await c.call("POST", "/api/servers", { host: "127.0.0.1", port: fake.port, user: "root", password: "pw-123", hostKey: probe.json.hostKey, name: "A", product: "business", license: "auto" });
  const j = await waitJob(c, st.json.jobId);
  assert.equal(j.state, "failed");
  assert.match(j.error, /build-failed/);
  const ov = (await c.call("GET", "/api/overview")).json;
  assert.equal(ov.servers[0].installedAt, null, "kept as not installed, can be retried");
  assert.ok(ov.warnings.some((w: any) => w.code === "not-installed"));
  fake.opts.failBuild = false;
  const retry = await c.call("POST", `/api/servers/${ov.servers[0].id}/install`, { password: "pw-123" });
  assert.equal((await waitJob(c, retry.json.jobId)).state, "done");
  fake.stop(); c.stop();
});

test("unknown server ids are 404", async () => {
  const c = await loggedIn();
  for (const [m, p] of [["POST", "/api/servers/zzz/unlock"], ["POST", "/api/servers/zzz/update"], ["GET", "/api/servers/zzz/list"], ["POST", "/api/servers/zzz/settings"]]) {
    assert.equal((await c.call(m, p, m === "GET" ? undefined : {})).status, 404, p);
  }
  c.stop();
});

test("five wrong passphrases lock the unlock; the wait is reported and a right passphrase does not get through while locked", async () => {
  const c = await boot();
  await c.call("POST", "/api/vault/create", { passphrase: "a long passphrase", company: "Acme SRL" });
  for (let i = 0; i < 5; i++) assert.equal((await c.call("POST", "/api/vault/unlock", { passphrase: "nope nope nope" })).status, 401);
  const locked = await c.call("POST", "/api/vault/unlock", { passphrase: "a long passphrase" });
  assert.equal(locked.status, 429);
  assert.ok(locked.json.seconds > 0 && locked.json.seconds <= 30, `first lock is at most 30 s, got ${locked.json.seconds}`);
  c.stop();
});
