import * as fs from "fs";
import * as net from "net";

/**
 * Minimal Tor control-port client — only what the node needs: cookie AUTHENTICATE, ADD_ONION,
 * GETINFO, SIGNAL. Hand-rolled (a few dozen lines of line protocol) instead of a dependency,
 * same reasoning as the Android app's hand-rolled relay HTTP clients.
 *
 * Important Tor behavior this relies on: an onion service created WITHOUT the `Detach` flag
 * lives exactly as long as the control connection that created it. That is deliberate here —
 * if this process dies, its onion address disappears from the network with it, instead of
 * lingering as a published descriptor pointing at nothing.
 */

export interface ControlReply {
  status: number;
  lines: string[];
}

export class TorControlError extends Error {
  constructor(message: string, readonly reply?: ControlReply) {
    super(message);
  }
}

/** Parses one complete reply out of [buffer]. Returns null if the reply isn't complete yet.
 *  Handles the three line kinds from control-spec §2.3: "250-" (mid), "250+" (data block,
 *  terminated by a lone "."), "250 " (end). */
export function parseControlReply(buffer: string): { reply: ControlReply; rest: string } | null {
  const lines: string[] = [];
  let pos = 0;
  while (true) {
    const eol = buffer.indexOf("\r\n", pos);
    if (eol < 0) return null;
    const line = buffer.slice(pos, eol);
    pos = eol + 2;
    if (line.length < 4) {
      lines.push(line);
      continue;
    }
    const code = Number(line.slice(0, 3));
    const sep = line[3];
    if (sep === "+") {
      lines.push(line.slice(4));
      while (true) {
        const dataEol = buffer.indexOf("\r\n", pos);
        if (dataEol < 0) return null;
        const dataLine = buffer.slice(pos, dataEol);
        pos = dataEol + 2;
        if (dataLine === ".") break;
        lines.push(dataLine);
      }
      continue;
    }
    lines.push(line.slice(4));
    if (sep === " ") {
      return { reply: { status: code, lines }, rest: buffer.slice(pos) };
    }
  }
}

export class TorControl {
  private buffer = "";
  private pending: Array<{ resolve: (r: ControlReply) => void; reject: (e: Error) => void }> = [];
  private closed = false;
  private closeListeners: Array<() => void> = [];

  private constructor(private readonly socket: net.Socket) {
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      this.buffer += chunk;
      while (true) {
        const parsed = parseControlReply(this.buffer);
        if (!parsed) break;
        this.buffer = parsed.rest;
        // 6xx are asynchronous events; never requested here (no SETEVENTS), ignore defensively.
        if (parsed.reply.status >= 600) continue;
        this.pending.shift()?.resolve(parsed.reply);
      }
    });
    const onGone = () => {
      if (this.closed) return;
      this.closed = true;
      for (const p of this.pending.splice(0)) p.reject(new TorControlError("control connection closed"));
      for (const l of this.closeListeners) l();
    };
    socket.on("close", onGone);
    socket.on("error", onGone);
  }

  static connect(port: number, host = "127.0.0.1", timeoutMs = 10_000): Promise<TorControl> {
    return new Promise((resolve, reject) => {
      const socket = net.connect(port, host);
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new TorControlError(`control port ${host}:${port} did not accept a connection within ${timeoutMs}ms`));
      }, timeoutMs);
      socket.once("connect", () => {
        clearTimeout(timer);
        resolve(new TorControl(socket));
      });
      socket.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  get isClosed(): boolean {
    return this.closed;
  }

  onClose(listener: () => void): void {
    this.closeListeners.push(listener);
  }

  command(line: string): Promise<ControlReply> {
    if (this.closed) return Promise.reject(new TorControlError("control connection closed"));
    if (/[\r\n]/.test(line)) return Promise.reject(new TorControlError("control command must be a single line"));
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
      this.socket.write(line + "\r\n");
    });
  }

  private async ok(line: string, what: string): Promise<ControlReply> {
    const reply = await this.command(line);
    if (reply.status !== 250) {
      throw new TorControlError(`${what} failed: ${reply.status} ${reply.lines.join(" | ")}`, reply);
    }
    return reply;
  }

  /** Cookie authentication — the cookie file sits in Tor's DataDirectory, readable only by the
   *  user running this process, so nothing else on the machine can drive this Tor instance. */
  async authenticateWithCookie(cookiePath: string): Promise<void> {
    const cookie = fs.readFileSync(cookiePath).toString("hex");
    await this.ok(`AUTHENTICATE ${cookie}`, "AUTHENTICATE");
  }

  /**
   * Creates the node's v3 onion service mapping virtual port 80 → [localPort]. [privateKey] is
   * the `ED25519-V3:<base64>` blob from a previous call (stable address across restarts), or
   * null for a brand-new key. Always enables Tor's own proof-of-work DoS defense (Tor ≥ 0.4.8,
   * built with the `pow` module — the pinned Expert Bundle is, verified via `tor --list-modules`).
   */
  async addOnion(opts: { privateKey: string | null; localPort: number; pow: { queueRate: number; queueBurst: number } | null }): Promise<{ serviceId: string; privateKey: string }> {
    const keyArg = opts.privateKey ?? "NEW:ED25519-V3";
    const powArgs = opts.pow
      ? ` PoWDefensesEnabled=1 PoWQueueRate=${opts.pow.queueRate} PoWQueueBurst=${opts.pow.queueBurst}`
      : "";
    const reply = await this.ok(`ADD_ONION ${keyArg}${powArgs} Port=80,127.0.0.1:${opts.localPort}`, "ADD_ONION");
    const serviceId = reply.lines.find((l) => l.startsWith("ServiceID="))?.slice("ServiceID=".length);
    const returnedKey = reply.lines.find((l) => l.startsWith("PrivateKey="))?.slice("PrivateKey=".length);
    if (!serviceId) throw new TorControlError("ADD_ONION reply had no ServiceID", reply);
    const privateKey = returnedKey ?? opts.privateKey;
    if (!privateKey) throw new TorControlError("ADD_ONION returned no PrivateKey for a NEW key", reply);
    return { serviceId, privateKey };
  }

  async getInfo(key: string): Promise<string> {
    const reply = await this.ok(`GETINFO ${key}`, `GETINFO ${key}`);
    const prefix = `${key}=`;
    const idx = reply.lines.findIndex((l) => l.startsWith(prefix));
    if (idx < 0) return "";
    // Multi-line values (250+key=) put the first data line right after the key line.
    const first = reply.lines[idx].slice(prefix.length);
    const rest = reply.lines.slice(idx + 1, reply.lines.length - 1);
    return [first, ...rest].filter((l) => l.length > 0).join("\n");
  }

  async signal(name: string): Promise<void> {
    await this.ok(`SIGNAL ${name}`, `SIGNAL ${name}`);
  }

  close(): void {
    this.socket.end();
  }
}
