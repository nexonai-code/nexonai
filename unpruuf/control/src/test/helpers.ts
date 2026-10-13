import * as crypto from "crypto";
import * as fs from "fs";
import * as http from "http";
import * as net from "net";
import * as os from "os";
import * as path from "path";
import * as zlib from "zlib";
import { Server, utils } from "ssh2";
import { LoadedBundle } from "../bundle";
import { packTarGz } from "../tarpack";
import { parseLicense } from "../licenses";
import { generateServerKey, sha256Hex } from "../ssh";

export function tmpDir(prefix = "ctl-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ── licence signing for tests (a throw-away key pair, same formats as license-tool/lib.js) ──
export interface TestKeys {
  publicKeyB64: string;
  privateKey: crypto.KeyObject;
}
export function newKeys(): TestKeys {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" }) as { x: string };
  return { publicKeyB64: jwk.x, privateKey };
}
const DAY = 86_400_000;
export function serverCode(k: TestKeys, serial: string, opts: { days?: number; customer?: string; issued?: number } = {}): string {
  const issued = opts.issued ?? Date.now() - DAY;
  const payload = `1|${serial}|${opts.customer ?? "Acme SRL"}|250|${issued}|${issued + (opts.days ?? 365) * DAY + DAY}`;
  const sig = crypto.sign(null, Buffer.from("unpruuf-server-license-v1\n" + payload), k.privateKey);
  return `unpruuf-server-license:v1:${Buffer.from(payload).toString("base64url")}:${sig.toString("base64url")}`;
}
export function appCode(k: TestKeys, serial: string, edition = "pro", days = 365): string {
  const issued = Date.now() - DAY;
  const payload = `1|${edition}|${serial}|Acme SRL|${issued}|${issued + days * DAY + DAY}`;
  const sig = crypto.sign(null, Buffer.from(payload), k.privateKey);
  return `unpruuf-license:v1:${Buffer.from(payload).toString("base64url")}:${sig.toString("base64url")}`;
}

export function makeBundle(): LoadedBundle {
  const data = packTarGz([
    { name: "Dockerfile", data: Buffer.from("FROM scratch\n") },
    { name: "package.json", data: Buffer.from('{"version":"9.9.9"}') },
    { name: "src/index.ts", data: Buffer.from("export {};\n") },
  ]);
  return { data, info: { version: "9.9.9", sha256: sha256Hex(data), files: 3, builtAt: new Date().toISOString(), releaseFingerprint: null, releaseVersion: null, signed: false } };
}

// ── a fake server's setup page (the same paths and rules as node-mesh-server/src/admin/adminApp.ts) ──
export class FakeAdmin {
  locked = false;
  license: { serial: string; customer: string; expiresAtMs: number } | null = null;
  ownerSecret = "OWNERSECRET0123456789";
  registered = 250;
  bridges: string[] = [];
  requests: { method: string; url: string }[] = [];
  private server: http.Server;
  port = 0;
  constructor(private keys: TestKeys) {
    this.server = http.createServer((req, res) => this.handle(req, res));
  }
  start(): Promise<void> {
    return new Promise((r) => this.server.listen(0, "127.0.0.1", () => { this.port = (this.server.address() as net.AddressInfo).port; r(); }));
  }
  stop(): void { this.server.close(); }
  get ownerString(): string { return `unpruuf-node-owner:v1:abcdefghij.onion:${this.ownerSecret}`; }
  private summary() {
    const l = this.license;
    if (!l) return { status: "missing", customer: null, serial: null, maxNodes: 0, expiresAtMs: null, daysLeft: null };
    const days = Math.floor((l.expiresAtMs - Date.now()) / DAY);
    return { status: Date.now() >= l.expiresAtMs ? "expired" : days <= 30 ? "expiring" : "valid", customer: l.customer, serial: l.serial, maxNodes: 250, expiresAtMs: l.expiresAtMs, daysLeft: days };
  }
  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    this.requests.push({ method: req.method ?? "", url: req.url ?? "" });
    const send = (code: number, body: unknown, type = "application/json") => { res.writeHead(code, { "content-type": type }); res.end(typeof body === "string" ? body : JSON.stringify(body)); };
    // The real page answers loopback host names only, and POSTs only with the custom header.
    if (req.headers.host !== "127.0.0.1:8790") return send(403, "forbidden", "text/plain");
    if (req.method === "POST" && req.headers["x-unpruuf-admin"] !== "1") return send(403, { error: "forbidden" });
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      let body: any = {};
      try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}; } catch { /* empty */ }
      const url = req.url ?? "";
      if (req.method === "GET" && url === "/status.json") {
        return send(200, { locked: this.locked, ownerString: !this.locked && this.license ? this.ownerString : null, license: this.summary() });
      }
      if (req.method === "GET" && url === "/overview.json") {
        const lic = this.summary();
        const problems: string[] = [];
        if (lic.status === "missing") problems.push("license-missing");
        else if (this.locked) problems.push("locked");
        return send(200, {
          level: lic.status === "missing" ? "warn" : this.locked ? "locked" : "ok", problems, locked: this.locked,
          nodes: { configured: 250, listed: this.license ? 250 : 0, registered: this.license ? this.registered : 0 },
          license: lic, integrity: { state: "unsigned", fingerprint: null, version: null },
          profile: { name: "standard", ttlHours: 6 }, messagesInRam: false, stored: { queued: 3, tags: 1, oldestAgeMs: null }, uptimeMs: 12345,
        });
      }
      if (req.method === "POST" && url === "/license") {
        const p = parseLicense(String(body.code ?? ""), this.keys.publicKeyB64);
        if (!p || p.kind !== "server") return send(400, { error: "invalid" });
        this.license = { serial: p.serial, customer: p.customer, expiresAtMs: p.expiresAtMs };
        return send(200, { ok: true, license: this.summary() });
      }
      if (req.method === "POST" && url === "/unlock") {
        if (body.code === this.ownerString) { this.locked = false; return send(200, { unlocked: true }); }
        return send(401, { error: "wrong owner code" });
      }
      if (req.method === "POST" && url === "/export-list") {
        if (this.locked) return send(423, { error: "locked" });
        return send(200, `unpruuf-node-list:v1\nname: Test\nowner: ${this.ownerSecret}\n`, "text/plain");
      }
      if (req.method === "POST" && url === "/rotate-owner-secret") {
        if (this.locked) return send(423, { error: "locked" });
        this.ownerSecret = "ROTATEDSECRET987654321"; return send(200, { rotated: true });
      }
      if (req.method === "POST" && url === "/bridge-lines") {
        const lines = String(body.text ?? "").split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
        const good = lines.filter((l: string) => l.startsWith("obfs4 "));
        this.bridges = good;
        return send(200, { ok: true, saved: good, rejected: lines.length - good.length });
      }
      send(404, { error: "not found" });
    });
  }
}

// ── a fake VPS: an SSH server that understands Control's step scripts ──
export interface VpsOptions {
  os?: string; osver?: string; arch?: string; kernel?: string; diskMB?: number; memMB?: number;
  docker?: boolean; sudo?: boolean; port8790?: number; failBuild?: boolean; password?: string; user?: string;
}

export class FakeVps {
  readonly opts: Required<VpsOptions>;
  authorizedKeys: string[] = [];
  steps: { step: string; cmd: string }[] = [];
  uploaded: Buffer | null = null;
  uploadValid = false;
  containerRunning = false;
  hadVolume = false;
  runEnv: Record<string, string> = {};
  hardened = false;
  passwordLoginOn = true;
  admin: FakeAdmin;
  port = 0;
  hostKeyFingerprint = "";
  private server: Server;
  private clients = new Set<any>();

  constructor(keys: TestKeys, o: VpsOptions = {}) {
    this.opts = { os: "ubuntu", osver: "22.04", arch: "x86_64", kernel: "Linux", diskMB: 20000, memMB: 2048, docker: false, sudo: true, port8790: 0, failBuild: false, password: "pw-123", user: "root", ...o };
    this.admin = new FakeAdmin(keys);
    const hostKey = generateServerKey().privateKey;
    const parsed = utils.parseKey(hostKey) as any;
    const raw = (parsed.getPublicSSH() as Buffer);
    this.hostKeyFingerprint = "SHA256:" + crypto.createHash("sha256").update(raw).digest("base64").replace(/=+$/, "");
    this.server = new Server({ hostKeys: [hostKey] }, (client: any) => this.onClient(client));
  }

  async start(): Promise<void> {
    await this.admin.start();
    await new Promise<void>((r) => this.server.listen(0, "127.0.0.1", () => { this.port = (this.server.address() as net.AddressInfo).port; r(); }));
  }
  stop(): void {
    this.admin.stop();
    for (const c of this.clients) { try { c.end(); } catch { /* gone */ } }
    this.server.close();
  }
  stepNames(): string[] { return this.steps.map((s) => s.step); }

  private keyAllowed(ctx: any): boolean {
    for (const k of this.authorizedKeys) {
      const p = utils.parseKey(k) as any;
      if (p && !(p instanceof Error) && ctx.key.algo === p.type && Buffer.compare(ctx.key.data, p.getPublicSSH()) === 0) {
        if (!ctx.signature) return true;
        return p.verify(ctx.blob, ctx.signature, ctx.hashAlgo) === true;
      }
    }
    return false;
  }

  private onClient(client: any): void {
    this.clients.add(client);
    client.on("close", () => this.clients.delete(client));
    client.on("authentication", (ctx: any) => {
      if (ctx.username !== this.opts.user) return ctx.reject();
      if (ctx.method === "password" && this.passwordLoginOn && ctx.password === this.opts.password) return ctx.accept();
      if (ctx.method === "publickey" && this.keyAllowed(ctx)) return ctx.accept();
      ctx.reject(["password", "publickey"]);
    });
    client.on("error", () => { /* clients that vanish */ });
    client.on("ready", () => {
      client.on("session", (accept: any) => {
        const session = accept();
        session.on("exec", (acceptExec: any, _rej: any, info: any) => {
          const stream = acceptExec();
          const chunks: Buffer[] = [];
          stream.on("data", (c: Buffer) => chunks.push(c));
          stream.on("end", () => this.runCommand(info.command, Buffer.concat(chunks), stream));
        });
      });
      client.on("tcpip", (acceptTcp: any, rejectTcp: any, info: any) => {
        if (info.destPort !== 8790) return rejectTcp();
        const stream = acceptTcp();
        const sock = net.connect(this.admin.port, "127.0.0.1");
        stream.pipe(sock).pipe(stream);
        sock.on("error", () => stream.close());
      });
    });
  }

  private runCommand(cmd: string, stdin: Buffer, stream: any): void {
    const step = /: step=([a-z-]+)/.exec(cmd)?.[1] ?? "unknown";
    this.steps.push({ step, cmd });
    const out = (s: string) => stream.write(s);
    const done = (code = 0) => { stream.exit(code); stream.end(); };
    const o = this.opts;
    // Not root: the command must come wrapped in passwordless sudo, or fail like a real machine would.
    if (o.user !== "root" && /step=(docker-install|upload|extract|build|run|remove|harden)/.test(cmd) && !cmd.startsWith("sudo -n sh -c ")) { stream.stderr.write("permission denied\n"); return done(1); }
    switch (step) {
      case "preflight":
        out(`kernel=${o.kernel}\narch=${o.arch}\nos=${o.os}\nosver=${o.osver}\nuid=${o.user === "root" ? 0 : 1000}\ndocker=${o.docker ? "Docker version 24.0.7" : "none"}\nsudo=${o.sudo ? "yes" : "no"}\ndiskMB=${o.diskMB}\nmemMB=${o.memMB}\nport8790=${o.port8790}\ncontainer=${this.containerRunning ? 1 : 0}\n`);
        return done();
      case "authkey": {
        const m = /echo '(ssh-[^']+)' >>/.exec(cmd);
        if (!m) return done(1);
        if (!this.authorizedKeys.includes(m[1])) this.authorizedKeys.push(m[1]);
        return done();
      }
      case "harden":
        this.hardened = true; this.passwordLoginOn = false; out("harden=done\n"); return done();
      case "docker-install":
        o.docker = true; out("Docker version 24.0.7\n"); return done();
      case "upload": {
        this.uploaded = stdin;
        out(`sha256=${sha256Hex(stdin)}\n`);
        return done();
      }
      case "extract": {
        try {
          const tar = zlib.gunzipSync(this.uploaded ?? Buffer.alloc(0));
          this.uploadValid = tar.slice(257, 262).toString() === "ustar";
        } catch { this.uploadValid = false; }
        return done(this.uploadValid ? 0 : 1);
      }
      case "build":
        out("Step 1/9 : FROM node\n");
        if (o.failBuild) { stream.stderr.write("build error\n"); return done(1); }
        out("Successfully built\n");
        return done();
      case "run": {
        this.runEnv = {};
        for (const m of cmd.matchAll(/-e ([A-Z_0-9]+)=(\S+)/g)) this.runEnv[m[1]] = m[2];
        this.containerRunning = true;
        // Same data volume again: licence and addresses survive, but sealed keys mean it comes back locked.
        if (!this.hadVolume) { this.admin.license = null; this.admin.locked = false; this.hadVolume = true; }
        else this.admin.locked = true;
        return done();
      }
      case "state":
        out(this.containerRunning ? "true\n" : "missing\n");
        return done();
      case "remove":
        this.containerRunning = false;
        if (/docker volume rm/.test(cmd)) this.hadVolume = false;
        out("removed=ok\n"); return done();
      default:
        stream.stderr.write("unknown step\n");
        return done(127);
    }
  }
}
