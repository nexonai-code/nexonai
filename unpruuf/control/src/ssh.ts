import * as crypto from "crypto";
import * as http from "http";
import { Client, utils } from "ssh2";

/**
 * Everything Control does on a server goes through this file: one SSH connection, commands, a byte
 * upload, and HTTP to the server's setup page THROUGH the SSH connection (a port forward to the
 * server's own loopback). The setup page is never opened to the internet.
 */

export interface SshTarget {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  /** "SHA256:…" the server's host key must have. Null = first contact: accept and report it. */
  hostKey: string | null;
  readyTimeoutMs?: number;
}

export class SshError extends Error {
  constructor(public readonly code: "auth" | "host-key" | "network" | "timeout" | "sudo" | "command", message: string) {
    super(message);
  }
}

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  stdin?: Buffer;
  timeoutMs?: number;
  /** Called with every chunk of output as it arrives (for the live log of a long build). */
  onData?: (chunk: string) => void;
}

export function fingerprintOf(hostKeyHash: string | Buffer): string {
  const buf = Buffer.isBuffer(hostKeyHash) ? hostKeyHash : Buffer.from(hostKeyHash, "hex");
  return "SHA256:" + buf.toString("base64").replace(/=+$/, "");
}

export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * A fresh ed25519 key for one server. ssh2's generator now and then writes an OpenSSH key that its
 * own parser rejects (seen about once in sixty keys), which would otherwise fail a real installation
 * after the VPS was already touched: so every key is parsed back, and signing is proven, before use.
 */
export function generateServerKey(comment = "unpruuf-control"): { privateKey: string; publicKey: string } {
  for (let attempt = 0; attempt < 20; attempt++) {
    const k = utils.generateKeyPairSync("ed25519", { comment });
    const parsed = utils.parseKey(k.private) as any;
    if (parsed instanceof Error || !parsed) continue;
    try {
      const probe = Buffer.from("unpruuf-control key check");
      const sig = parsed.sign(probe);
      const pub = utils.parseKey(k.public) as any;
      if (!(sig instanceof Buffer) || pub instanceof Error || pub.verify(probe, sig) !== true) continue;
    } catch {
      continue;
    }
    return { privateKey: k.private, publicKey: k.public.trim() };
  }
  throw new Error("could not generate a usable SSH key");
}

export class Remote {
  private constructor(private readonly client: Client, public readonly target: SshTarget, public readonly seenHostKey: string) {}

  static connect(target: SshTarget): Promise<Remote> {
    return new Promise((resolve, reject) => {
      const client = new Client();
      let seen = "";
      let settled = false;
      const fail = (e: SshError) => { if (!settled) { settled = true; try { client.end(); } catch { /* closing anyway */ } reject(e); } };
      client.on("ready", () => { if (!settled) { settled = true; resolve(new Remote(client, target, seen)); } });
      client.on("error", (err: Error & { level?: string }) => {
        const m = String(err.message || err);
        if (err.level === "client-authentication" || /authentication/i.test(m)) fail(new SshError("auth", "Login failed: wrong user, password or key."));
        else if (/timed out|timeout/i.test(m)) fail(new SshError("timeout", "The server did not answer in time."));
        else fail(new SshError("network", `Could not reach the server: ${m}`));
      });
      try {
        client.connect({
          host: target.host,
          port: target.port,
          username: target.username,
          password: target.password,
          privateKey: target.privateKey,
          readyTimeout: target.readyTimeoutMs ?? 20_000,
          hostHash: "sha256",
          hostVerifier: (hash: string) => {
            seen = fingerprintOf(hash);
            if (target.hostKey && seen !== target.hostKey) {
              fail(new SshError("host-key", `The server's identity changed (expected ${target.hostKey}, got ${seen}). Stop: this can be a reinstall of the server, or somebody in between.`));
              return false;
            }
            return true;
          },
          keepaliveInterval: 15_000,
        });
      } catch (e) {
        fail(new SshError("network", String((e as Error).message)));
      }
    });
  }

  /** Runs [cmd] as the login user. */
  exec(cmd: string, opts: ExecOptions = {}): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
      this.client.exec(cmd, (err, stream) => {
        if (err) return reject(new SshError("command", String(err.message)));
        let stdout = "";
        let stderr = "";
        let timer: NodeJS.Timeout | null = null;
        if (opts.timeoutMs) {
          timer = setTimeout(() => { try { stream.close(); } catch { /* already closed */ } reject(new SshError("timeout", "A command on the server took too long.")); }, opts.timeoutMs);
        }
        stream.on("data", (d: Buffer) => { const s = d.toString("utf8"); stdout += s; opts.onData?.(s); });
        stream.stderr.on("data", (d: Buffer) => { const s = d.toString("utf8"); stderr += s; opts.onData?.(s); });
        stream.on("close", (code: number | null) => { if (timer) clearTimeout(timer); resolve({ code: code ?? 0, stdout, stderr }); });
        if (opts.stdin) stream.end(opts.stdin); else stream.end();
      });
    });
  }

  /** Runs [cmd] with root rights: directly for root, else through passwordless sudo. */
  execRoot(cmd: string, opts: ExecOptions = {}): Promise<ExecResult> {
    const wrapped = this.target.username === "root" ? cmd : `sudo -n sh -c ${shellQuote(cmd)}`;
    return this.exec(wrapped, opts);
  }

  /** The setup page's access token (node-mesh-server admin/adminToken.ts): undefined = not asked yet,
   *  null = this server has none (an older version), otherwise the token of the running container. */
  private adminToken: string | null | undefined = undefined;

  /** Reads the token from the container's data folder over this SSH login (root on the host). */
  async loadAdminToken(container = "unpruuf-node"): Promise<string | null> {
    const r = await this.execRoot(`docker exec ${container} cat /app/data/admin-token 2>/dev/null`, { timeoutMs: 20_000 }).catch(() => null);
    const t = r && r.code === 0 ? r.stdout.trim() : "";
    this.adminToken = /^[A-Za-z0-9_-]{43}$/.test(t) ? t : null;
    return this.adminToken;
  }

  /** One HTTP request to the server's setup page, through an SSH port forward to its loopback. It
   *  carries the access token; after a restart of the server (new token) it asks for it once more. */
  async httpAdmin(method: "GET" | "POST", path: string, body?: unknown, port = 8790, timeoutMs = 30_000): Promise<{ status: number; json: any; text: string }> {
    if (this.adminToken === undefined) await this.loadAdminToken();
    let res = await this.httpAdminOnce(method, path, body, port, timeoutMs, this.adminToken ?? null);
    if (res.status === 403 && this.adminToken) {
      await this.loadAdminToken();
      res = await this.httpAdminOnce(method, path, body, port, timeoutMs, this.adminToken ?? null);
    }
    return res;
  }

  private httpAdminOnce(method: "GET" | "POST", path: string, body: unknown, port: number, timeoutMs: number, token: string | null): Promise<{ status: number; json: any; text: string }> {
    return new Promise((resolve, reject) => {
      this.client.forwardOut("127.0.0.1", 0, "127.0.0.1", port, (err, stream) => {
        if (err) return reject(new SshError("network", `The server's setup page is not reachable (${err.message}). Is the container running?`));
        const sock = stream as unknown as Record<string, unknown>;
        for (const fn of ["setKeepAlive", "setNoDelay", "setTimeout", "ref", "unref"]) if (typeof sock[fn] !== "function") sock[fn] = () => sock;
        const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
        const agent = new http.Agent({ keepAlive: false });
        (agent as any).createConnection = () => stream;
        const req = http.request(
          {
            method, host: "127.0.0.1", port, path, agent,
            headers: {
              // The setup page only answers loopback host names and POSTs that carry this header.
              Host: `127.0.0.1:${port}`,
              "x-unpruuf-admin": "1",
              ...(token ? { "x-unpruuf-admin-token": token } : {}),
              ...(payload ? { "content-type": "application/json", "content-length": String(payload.length) } : {}),
            },
            timeout: timeoutMs,
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (c: Buffer) => chunks.push(c));
            res.on("end", () => {
              const text = Buffer.concat(chunks).toString("utf8");
              let json: any = null;
              try { json = JSON.parse(text); } catch { /* not JSON: a text file such as the node list */ }
              try { stream.close(); } catch { /* done */ }
              resolve({ status: res.statusCode ?? 0, json, text });
            });
          },
        );
        req.on("timeout", () => { req.destroy(new Error("timeout")); });
        req.on("error", (e) => reject(new SshError("network", `The setup page did not answer: ${e.message}`)));
        if (payload) req.write(payload);
        req.end();
      });
    });
  }

  close(): void {
    try { this.client.end(); } catch { /* closing anyway */ }
  }
}

export function sha256Hex(b: Buffer): string {
  return crypto.createHash("sha256").update(b).digest("hex");
}
