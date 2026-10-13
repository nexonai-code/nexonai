import * as crypto from "crypto";
import type { LoadedBundle } from "./bundle";
import { LicenseInventory } from "./licenses";
import { Remote, SshError, SshTarget, generateServerKey, shellQuote, sha256Hex } from "./ssh";
import type { Product, Profile, ServerRecord, StoreMode, Vault } from "./vault";

/**
 * Putting the node server on a customer's VPS and keeping it running. Every remote step is a short
 * shell script that starts with a `: step=<name>` marker (a shell no-op) so logs and tests can tell
 * them apart. The server itself is the existing node-mesh-server in a Docker container; its setup
 * page is reached only through the SSH connection (Remote.httpAdmin).
 *
 * One VPS = one server = one licence = 250 node addresses. The addresses are created by the server
 * itself when its licence is applied; Control only waits for them and shows the progress.
 */

export const CONTAINER = "unpruuf-node";
export const VOLUME = "unpruuf-node-data";
export const REMOTE_DIR = "/opt/unpruuf-node";
export const ADMIN_PORT = 8790;

export interface Ctx {
  vault: Vault;
  inventory: LicenseInventory;
  bundle: LoadedBundle | null;
  log: (line: string) => void;
  /** Overridable for tests (poll speed). */
  pollMs?: number;
  waitAdminMs?: number;
  waitOwnerMs?: number;
}

// ───────────────────────────── scripts ─────────────────────────────

export const PREFLIGHT_SCRIPT = `: step=preflight
echo "kernel=$(uname -s)"
echo "arch=$(uname -m)"
if [ -r /etc/os-release ]; then . /etc/os-release; fi
echo "os=\${ID:-unknown}"
echo "osver=\${VERSION_ID:-}"
echo "uid=$(id -u)"
if command -v docker >/dev/null 2>&1; then echo "docker=$(docker --version 2>/dev/null | head -n1)"; else echo "docker=none"; fi
if sudo -n true 2>/dev/null; then echo "sudo=yes"; else echo "sudo=no"; fi
echo "diskMB=$(df -Pm / | awk 'NR==2{print $4}')"
echo "memMB=$(awk '/MemTotal/{printf "%d",$2/1024}' /proc/meminfo 2>/dev/null)"
echo "port8790=$( (ss -ltn 2>/dev/null || netstat -ltn 2>/dev/null) | grep -c ':8790 ')"
echo "container=$(docker ps -a --format '{{.Names}}' 2>/dev/null | grep -c '^${CONTAINER}$')"
`;

export interface Preflight {
  kernel: string;
  arch: string;
  os: string;
  osver: string;
  uid: number;
  docker: string;
  sudo: boolean;
  diskMB: number;
  memMB: number;
  port8790: number;
  container: number;
}

export function parsePreflight(out: string): Preflight {
  const kv: Record<string, string> = {};
  for (const line of out.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0) kv[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const num = (k: string) => (Number.isFinite(Number(kv[k])) ? Number(kv[k]) : 0);
  return {
    kernel: kv.kernel ?? "", arch: kv.arch ?? "", os: kv.os ?? "unknown", osver: kv.osver ?? "", uid: num("uid"),
    docker: kv.docker ?? "none", sudo: kv.sudo === "yes", diskMB: num("diskMB"), memMB: num("memMB"),
    port8790: num("port8790"), container: num("container"),
  };
}

export interface PreflightVerdict {
  blocking: string[];
  warnings: string[];
}

/** Codes, not sentences: the page translates them. */
export function checkPreflight(p: Preflight, loginUser: string): PreflightVerdict {
  const blocking: string[] = [];
  const warnings: string[] = [];
  if (p.kernel !== "Linux") blocking.push("not-linux");
  if (!["x86_64", "amd64", "aarch64", "arm64"].includes(p.arch)) blocking.push("arch");
  if (loginUser !== "root" && p.uid !== 0 && !p.sudo) blocking.push("no-root");
  if (p.diskMB < 3000) blocking.push("disk");
  if (p.memMB > 0 && p.memMB < 512) blocking.push("memory");
  else if (p.memMB > 0 && p.memMB < 1024) warnings.push("memory-low");
  if (p.docker === "none" && !["debian", "ubuntu"].includes(p.os)) blocking.push("docker-manual");
  if (p.port8790 > 0 && p.container === 0) blocking.push("port-busy");
  if (p.container > 0) warnings.push("existing-container");
  return { blocking, warnings };
}

const SLOTS = [1, 2, 3];
const PROFILES: Profile[] = ["standard", "high-security", "offline-tolerant"];
const STORES: StoreMode[] = ["disk", "ram"];

export function runScript(s: Pick<ServerRecord, "slot" | "profile" | "store">, tag: string): string {
  if (!SLOTS.includes(s.slot) || !PROFILES.includes(s.profile) || !STORES.includes(s.store) || !/^[0-9a-f]{8,64}$/.test(tag)) {
    throw new Error("invalid server settings");
  }
  return `: step=run
set -e
docker rm -f ${CONTAINER} >/dev/null 2>&1 || true
docker run -d --name ${CONTAINER} --restart unless-stopped -p 127.0.0.1:${ADMIN_PORT}:${ADMIN_PORT} -v ${VOLUME}:/app/data -e NODE_SLOT=${s.slot} -e NODE_PROFILE=${s.profile} -e NODE_MESH_STORE=${s.store} -e ADMIN_PORT=${ADMIN_PORT} unpruuf-node:${tag}
`;
}

export function buildScript(tag: string): string {
  return `: step=build
set -e
cd ${REMOTE_DIR}/app
docker build -t unpruuf-node:${tag} -t unpruuf-node:latest .
docker image prune -f >/dev/null 2>&1 || true
`;
}

export const UPLOAD_SCRIPT = `: step=upload
set -e
mkdir -p ${REMOTE_DIR}
cat > ${REMOTE_DIR}/bundle.tgz
echo "sha256=$(sha256sum ${REMOTE_DIR}/bundle.tgz | cut -d' ' -f1)"
`;

export const EXTRACT_SCRIPT = `: step=extract
set -e
cd ${REMOTE_DIR}
rm -rf app
mkdir app
tar xzf bundle.tgz -C app
`;

export const DOCKER_INSTALL_SCRIPT = `: step=docker-install
set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y docker.io ca-certificates
systemctl enable --now docker
docker --version
`;

export function authorizedKeyScript(publicKey: string): string {
  return `: step=authkey
set -e
umask 077
mkdir -p "$HOME/.ssh"
touch "$HOME/.ssh/authorized_keys"
grep -qxF ${shellQuote(publicKey)} "$HOME/.ssh/authorized_keys" || echo ${shellQuote(publicKey)} >> "$HOME/.ssh/authorized_keys"
chmod 700 "$HOME/.ssh"
chmod 600 "$HOME/.ssh/authorized_keys"
`;
}

export const HARDEN_SCRIPT = `: step=harden
SSHD=$(command -v sshd || echo /usr/sbin/sshd)
if [ -d /etc/ssh/sshd_config.d ] && grep -Eqs '^[[:space:]]*Include[[:space:]]+/etc/ssh/sshd_config.d/' /etc/ssh/sshd_config; then
  printf 'PasswordAuthentication no\\nKbdInteractiveAuthentication no\\n' > /etc/ssh/sshd_config.d/00-unpruuf-control.conf
  if "$SSHD" -t; then
    systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || service ssh reload 2>/dev/null || true
    echo "harden=done"
  else
    rm -f /etc/ssh/sshd_config.d/00-unpruuf-control.conf
    echo "harden=failed"
  fi
else
  echo "harden=unsupported"
fi
`;

export const REMOVE_SCRIPT = (wipe: boolean) => `: step=remove
docker rm -f ${CONTAINER} >/dev/null 2>&1 || true
${wipe ? `docker volume rm ${VOLUME} >/dev/null 2>&1 || true
docker rmi unpruuf-node:latest >/dev/null 2>&1 || true
rm -rf ${REMOTE_DIR}` : "true"}
echo "removed=ok"
`;

export const CONTAINER_STATE_SCRIPT = `: step=state
docker inspect -f '{{.State.Running}}' ${CONTAINER} 2>/dev/null || echo "missing"
`;

// ───────────────────────────── connections ─────────────────────────────

export function keyTarget(s: ServerRecord): SshTarget {
  return { host: s.host, port: s.port, username: s.user, privateKey: s.sshPrivateKey, hostKey: s.hostKey };
}

function need(ok: boolean, msg: string): void {
  if (!ok) throw new Error(msg);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export interface ProbeResult {
  hostKey: string;
  preflight: Preflight;
  verdict: PreflightVerdict;
}

/** First contact: connect with the password, remember the host key, look at the machine. Changes nothing. */
export async function probeServer(opts: { host: string; port: number; user: string; password: string }): Promise<ProbeResult> {
  const r = await Remote.connect({ host: opts.host, port: opts.port, username: opts.user, password: opts.password, hostKey: null });
  try {
    const res = await r.exec(PREFLIGHT_SCRIPT, { timeoutMs: 30_000 });
    const preflight = parsePreflight(res.stdout);
    return { hostKey: r.seenHostKey, preflight, verdict: checkPreflight(preflight, opts.user) };
  } finally {
    r.close();
  }
}

export interface NewServerInput {
  name: string;
  host: string;
  port: number;
  user: string;
  password: string;
  hostKey: string;
  provider: string;
  region: string;
  product: Product;
  profile: Profile;
  store: StoreMode;
  hardenPassword: boolean;
  /** "auto" = next free code, a serial = that code, "none" = install without a licence (the server then waits for one). */
  license: string;
}

export function defaultsFor(product: Product): { profile: Profile; store: StoreMode } {
  // Business: the usual 6 hours. safeline and Press: packets may wait the full 24 hours, because the
  // officer or journalist is not always online. Suggestions only: the admin can change them.
  return product === "business" ? { profile: "standard", store: "disk" } : { profile: "offline-tolerant", store: "disk" };
}

export function nextSlot(servers: ServerRecord[]): 1 | 2 | 3 {
  const used = new Set(servers.map((s) => s.slot));
  for (const s of [1, 2, 3] as const) if (!used.has(s)) return s;
  return ((servers.length % 3) + 1) as 1 | 2 | 3;
}

function validHost(h: string): boolean {
  return /^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/.test(h) || /^[0-9a-fA-F:]+$/.test(h);
}

export function validateNewServer(i: NewServerInput, existing: ServerRecord[]): string | null {
  if (!i.name.trim() || i.name.length > 60) return "name";
  if (!validHost(i.host)) return "host";
  if (!Number.isInteger(i.port) || i.port < 1 || i.port > 65535) return "port";
  if (!/^[a-z_][a-z0-9_-]{0,31}$/i.test(i.user)) return "user";
  if (!i.password) return "password";
  if (!i.hostKey.startsWith("SHA256:")) return "hostkey";
  if (!["business", "safeline", "press"].includes(i.product)) return "product";
  if (!PROFILES.includes(i.profile) || !STORES.includes(i.store)) return "settings";
  if (existing.some((s) => s.host === i.host && s.port === i.port)) return "duplicate-host";
  if (existing.some((s) => s.name.toLowerCase() === i.name.trim().toLowerCase())) return "duplicate-name";
  return null;
}

/** Creates the record (so a failed install can be retried) and installs. */
export async function addAndInstall(ctx: Ctx, input: NewServerInput): Promise<ServerRecord> {
  const bad = validateNewServer(input, ctx.vault.data.servers);
  need(!bad, `invalid:${bad}`);
  need(!!ctx.bundle, "no-bundle");
  let licenseSerial: string | null = null;
  if (input.license === "auto") {
    const l = ctx.inventory.nextFreeServerCode();
    need(!!l, "no-free-license");
    licenseSerial = l!.serial;
  } else if (input.license !== "none") {
    const l = ctx.inventory.bySerial("server", input.license);
    need(!!l, "unknown-license");
    licenseSerial = l!.serial;
  }
  const key = generateServerKey();
  const rec: ServerRecord = {
    id: crypto.randomBytes(6).toString("hex"), name: input.name.trim(), host: input.host, port: input.port, user: input.user,
    provider: input.provider.trim().slice(0, 60), region: input.region.trim().slice(0, 60), product: input.product,
    profile: input.profile, store: input.store, slot: nextSlot(ctx.vault.data.servers), createdAt: Date.now(),
    sshPrivateKey: key.privateKey, sshPublicKey: key.publicKey, hostKey: input.hostKey,
    installedAt: null, installedVersion: null, bundleSha256: null, ownerCode: null, licenseSerial: null, bridgeText: "", passwordLoginDisabled: false,
  };
  ctx.vault.data.servers.push(rec);
  if (licenseSerial) {
    const r = ctx.inventory.assignToServer(licenseSerial, rec.id);
    if (!r.ok) { ctx.vault.data.servers.pop(); throw new Error("license-" + r.error); }
  }
  ctx.vault.save();
  await installServer(ctx, rec, { password: input.password, hardenPassword: input.hardenPassword });
  return rec;
}

/** Runs (or re-runs) the whole installation for [rec]. Safe to repeat: every step checks before it changes. */
export async function installServer(ctx: Ctx, rec: ServerRecord, opts: { password?: string; hardenPassword?: boolean }): Promise<void> {
  const log = ctx.log;
  need(!!ctx.bundle, "no-bundle");
  const bundle = ctx.bundle!;
  log(`→ ${rec.name}: connecting to ${rec.host}:${rec.port}`);
  let remote: Remote | null = null;
  try {
    // 1. Key access. First time: log in with the password once, install our own key, then work with the key only.
    try {
      remote = await Remote.connect(keyTarget(rec));
      log("✓ logged in with Control's key");
    } catch (e) {
      if (!(e instanceof SshError) || e.code !== "auth") throw e;
      need(!!opts.password, "needs-password");
      const pw = await Remote.connect({ host: rec.host, port: rec.port, username: rec.user, password: opts.password, hostKey: rec.hostKey });
      try {
        const r = await pw.exec(authorizedKeyScript(rec.sshPublicKey), { timeoutMs: 30_000 });
        need(r.code === 0, "authkey-failed:" + r.stderr.trim().slice(0, 200));
      } finally { pw.close(); }
      remote = await Remote.connect(keyTarget(rec));
      log("✓ Control's own key installed, key login works (the password is not stored)");
    }

    // 2. Look at the machine.
    const pre = parsePreflight((await remote.exec(PREFLIGHT_SCRIPT, { timeoutMs: 30_000 })).stdout);
    const verdict = checkPreflight(pre, rec.user);
    log(`✓ checked: ${pre.os} ${pre.osver}, ${pre.arch}, ${pre.memMB} MB memory, ${pre.diskMB} MB free, docker: ${pre.docker}`);
    if (verdict.blocking.length) throw new Error("preflight:" + verdict.blocking.join(","));
    for (const w of verdict.warnings) log("! " + w);

    // 3. Optional: no more password logins on this server (only after key login was proven above).
    if (opts.hardenPassword && !rec.passwordLoginDisabled) {
      const h = await remote.execRoot(HARDEN_SCRIPT, { timeoutMs: 60_000 });
      if (/harden=done/.test(h.stdout)) { rec.passwordLoginDisabled = true; log("✓ password login on the server switched off"); }
      else log("! password login could not be switched off automatically (" + (/harden=(\w+)/.exec(h.stdout)?.[1] ?? "unknown") + "): do it by hand");
      ctx.vault.save();
    }

    // 4. Docker.
    if (pre.docker === "none") {
      log("→ installing Docker (apt)…");
      const d = await remote.execRoot(DOCKER_INSTALL_SCRIPT, { timeoutMs: 15 * 60_000, onData: (c) => log(c) });
      need(d.code === 0, "docker-install-failed");
      log("✓ Docker installed");
    }

    // 5. Software.
    await deploy(ctx, remote, rec, bundle, log);

    // 6. Wait for the setup page, apply the licence, wait for the owner code.
    await waitAdmin(ctx, remote);
    log("✓ server software is running");
    await applyAssignedLicense(ctx, remote, rec);
    rec.installedAt = Date.now();
    ctx.vault.save();
    await collectOwnerCode(ctx, remote, rec);
    ctx.vault.save();
    log(`✓ ${rec.name} is installed`);
  } finally {
    remote?.close();
  }
}

async function deploy(ctx: Ctx, remote: Remote, rec: ServerRecord, bundle: LoadedBundle, log: (l: string) => void): Promise<void> {
  log(`→ uploading the server software (${Math.round(bundle.data.length / 1024)} KB)…`);
  const up = await remote.execRoot(UPLOAD_SCRIPT, { stdin: bundle.data, timeoutMs: 5 * 60_000 });
  need(up.code === 0, "upload-failed");
  const remoteSha = /sha256=([0-9a-f]{64})/.exec(up.stdout)?.[1];
  need(remoteSha === bundle.info.sha256, "upload-corrupt");
  log("✓ upload arrived intact (checksum matches)");
  const ex = await remote.execRoot(EXTRACT_SCRIPT, { timeoutMs: 60_000 });
  need(ex.code === 0, "extract-failed");
  const tag = bundle.info.sha256.slice(0, 12);
  log("→ building the server image (a few minutes: it downloads Tor)…");
  const b = await remote.execRoot(buildScript(tag), { timeoutMs: 30 * 60_000, onData: (c) => log(c) });
  need(b.code === 0, "build-failed");
  log("✓ image built");
  const r = await remote.execRoot(runScript(rec, tag), { timeoutMs: 120_000 });
  need(r.code === 0, "run-failed:" + r.stderr.trim().slice(0, 200));
  rec.installedVersion = bundle.info.releaseVersion ?? bundle.info.version;
  rec.bundleSha256 = bundle.info.sha256;
  ctx.vault.save();
}

async function waitAdmin(ctx: Ctx, remote: Remote): Promise<void> {
  const until = Date.now() + (ctx.waitAdminMs ?? 180_000);
  let last = "";
  while (Date.now() < until) {
    try {
      const r = await remote.httpAdmin("GET", "/status.json");
      if (r.status === 200) return;
      last = "HTTP " + r.status;
    } catch (e) {
      last = String((e as Error).message);
    }
    await sleep(ctx.pollMs ?? 3000);
  }
  throw new Error("admin-not-ready:" + last);
}

export async function applyAssignedLicense(ctx: Ctx, remote: Remote, rec: ServerRecord): Promise<void> {
  if (!rec.licenseSerial) { ctx.log("! no licence assigned: the server waits for one"); return; }
  const l = ctx.inventory.bySerial("server", rec.licenseSerial);
  need(!!l, "unknown-license");
  const r = await remote.httpAdmin("POST", "/license", { code: l!.code });
  need(r.status === 200 && r.json?.ok, "license-rejected:" + (r.json?.error ?? r.status));
  ctx.log(`✓ licence ${l!.serial} applied (valid until ${new Date(l!.expiresAtMs).toISOString().slice(0, 10)})`);
}

/** The write code appears once the server's addresses exist. Keep it: it unlocks the server after a restart. */
async function collectOwnerCode(ctx: Ctx, remote: Remote, rec: ServerRecord): Promise<void> {
  if (!rec.licenseSerial) return;
  const until = Date.now() + (ctx.waitOwnerMs ?? 240_000);
  while (Date.now() < until) {
    const r = await remote.httpAdmin("GET", "/status.json").catch(() => null);
    const code = r?.json?.ownerString;
    if (typeof code === "string" && code.startsWith("unpruuf-node-owner:v1:")) {
      rec.ownerCode = code;
      ctx.log("✓ the server's addresses exist; its write code is kept in the vault");
      return;
    }
    await sleep(ctx.pollMs ?? 3000);
  }
  ctx.log("! the addresses are not ready yet; Control picks the write code up at the next status check");
}

// ───────────────────────────── operating ─────────────────────────────

export interface ServerStatus {
  checkedAt: number;
  reachable: boolean;
  error: string | null;
  containerRunning: boolean | null;
  level: "ok" | "warn" | "locked" | "unlicensed" | "down";
  problems: string[];
  locked: boolean;
  nodes: { configured: number; listed: number; registered: number | null } | null;
  license: { status: string; serial: string | null; customer: string | null; expiresAtMs: number | null; daysLeft: number | null; maxNodes: number } | null;
  integrity: { state: string; fingerprint: string | null; version: string | null } | null;
  profile: { name: string; ttlHours: number } | null;
  messagesInRam: boolean | null;
  stored: number | null;
  uptimeMs: number | null;
}

export function downStatus(error: string, now: number): ServerStatus {
  return { checkedAt: now, reachable: false, error, containerRunning: null, level: "down", problems: [], locked: false, nodes: null, license: null, integrity: null, profile: null, messagesInRam: null, stored: null, uptimeMs: null };
}

export async function getStatus(ctx: Ctx, rec: ServerRecord): Promise<ServerStatus> {
  const now = Date.now();
  if (!rec.installedAt) return downStatus("not-installed", now);
  let remote: Remote | null = null;
  try {
    remote = await Remote.connect(keyTarget(rec));
    const st = (await remote.execRoot(CONTAINER_STATE_SCRIPT, { timeoutMs: 20_000 })).stdout.trim();
    // "missing" = no such container (never started, removed, or deleted by hand)
    const running = st === "true" ? true : st === "false" || st === "missing" ? false : null;
    if (running === false) return { ...downStatus("container-stopped", now), reachable: true, containerRunning: false };
    const ov = await remote.httpAdmin("GET", "/overview.json");
    if (ov.status !== 200 || !ov.json) return { ...downStatus("admin-error", now), reachable: true, containerRunning: running };
    const j = ov.json;
    if (!rec.ownerCode && !j.locked) {
      const s = await remote.httpAdmin("GET", "/status.json").catch(() => null);
      if (typeof s?.json?.ownerString === "string") { rec.ownerCode = s.json.ownerString; ctx.vault.save(); }
    }
    return {
      checkedAt: now, reachable: true, error: null, containerRunning: running, level: j.level ?? "warn",
      problems: Array.isArray(j.problems) ? j.problems : [], locked: Boolean(j.locked), nodes: j.nodes ?? null,
      license: j.license ? { status: j.license.status, serial: j.license.serial ?? null, customer: j.license.customer ?? null, expiresAtMs: j.license.expiresAtMs ?? null, daysLeft: j.license.daysLeft ?? null, maxNodes: j.license.maxNodes ?? 0 } : null,
      integrity: j.integrity ? { state: j.integrity.state, fingerprint: j.integrity.fingerprint ?? null, version: j.integrity.version ?? null } : null,
      profile: j.profile ? { name: j.profile.name, ttlHours: j.profile.ttlHours } : null,
      messagesInRam: j.messagesInRam ?? null, stored: j.stored?.queued ?? null, uptimeMs: j.uptimeMs ?? null,
    };
  } catch (e) {
    return downStatus(e instanceof SshError ? e.code + ": " + e.message : String((e as Error).message), now);
  } finally {
    remote?.close();
  }
}

async function withRemote<T>(rec: ServerRecord, fn: (r: Remote) => Promise<T>): Promise<T> {
  const r = await Remote.connect(keyTarget(rec));
  try { return await fn(r); } finally { r.close(); }
}

/** Unlocks a server that restarted (its keys are sealed until its owner code is given). */
export async function unlockServer(ctx: Ctx, rec: ServerRecord): Promise<void> {
  need(!!rec.ownerCode, "no-owner-code");
  await withRemote(rec, async (r) => {
    const res = await r.httpAdmin("POST", "/unlock", { code: rec.ownerCode });
    need(res.status === 200 && res.json?.unlocked, "unlock-rejected");
  });
  ctx.log(`✓ ${rec.name} unlocked`);
}

/** The server's node list file (contains the write key: treat it like a password). */
export async function exportList(rec: ServerRecord): Promise<string> {
  return withRemote(rec, async (r) => {
    const res = await r.httpAdmin("POST", "/export-list", {});
    need(res.status === 200, "export-failed:" + (res.json?.error ?? res.status));
    return res.text;
  });
}

/** New write key (when someone with the old node lists leaves). Old lists stop working; export and hand out new ones. */
export async function rotateWriteKey(ctx: Ctx, rec: ServerRecord): Promise<void> {
  await withRemote(rec, async (r) => {
    const res = await r.httpAdmin("POST", "/rotate-owner-secret", {});
    need(res.status === 200, "rotate-failed:" + (res.json?.error ?? res.status));
    const s = await r.httpAdmin("GET", "/status.json");
    need(typeof s.json?.ownerString === "string", "no-owner-code");
    rec.ownerCode = s.json.ownerString;
  });
  ctx.vault.save();
  ctx.log(`✓ ${rec.name}: new write key. Old node lists no longer work. Export and hand out the new list.`);
}

export async function setBridges(ctx: Ctx, rec: ServerRecord, text: string): Promise<{ saved: number; rejected: number }> {
  const out = await withRemote(rec, async (r) => {
    const res = await r.httpAdmin("POST", "/bridge-lines", { text });
    need(res.status === 200, "bridge-failed");
    return { saved: (res.json?.saved ?? []).length as number, rejected: (res.json?.rejected ?? 0) as number };
  });
  rec.bridgeText = text;
  ctx.vault.save();
  return out;
}

/** Puts a renewed licence code on the server (same serial, later expiry). */
export async function pushLicense(ctx: Ctx, rec: ServerRecord): Promise<void> {
  await withRemote(rec, (r) => applyAssignedLicense(ctx, r, rec));
}

/** New software version on an existing server: data and addresses stay, the server comes back locked and is unlocked again. */
export async function updateServer(ctx: Ctx, rec: ServerRecord): Promise<void> {
  need(!!ctx.bundle, "no-bundle");
  const bundle = ctx.bundle!;
  const remote = await Remote.connect(keyTarget(rec));
  try {
    await deploy(ctx, remote, rec, bundle, ctx.log);
    await waitAdmin(ctx, remote);
    ctx.log("✓ updated server is running");
    if (rec.ownerCode) {
      const res = await remote.httpAdmin("POST", "/unlock", { code: rec.ownerCode }).catch(() => null);
      if (res?.status === 200) ctx.log("✓ unlocked again");
      else ctx.log("! the server did not unlock; use Unlock");
    }
    ctx.vault.save();
  } finally {
    remote.close();
  }
}

export async function removeServer(ctx: Ctx, rec: ServerRecord, wipe: boolean): Promise<void> {
  if (rec.installedAt) {
    await withRemote(rec, async (r) => {
      const res = await r.execRoot(REMOVE_SCRIPT(wipe), { timeoutMs: 120_000 });
      need(/removed=ok/.test(res.stdout), "remove-failed");
    });
  }
  ctx.inventory.releaseServer(rec.id);
  ctx.vault.data.servers = ctx.vault.data.servers.filter((s) => s.id !== rec.id);
  ctx.vault.save();
  ctx.log(`✓ ${rec.name} removed${wipe ? " (data wiped)" : " (data kept on the VPS)"}`);
}

export function bundleSha(b: Buffer): string {
  return sha256Hex(b);
}
