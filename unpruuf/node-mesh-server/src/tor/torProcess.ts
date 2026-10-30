import { ChildProcess, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

/**
 * Spawns the node's own Tor process. It's configured as a pure onion-service host: no SOCKS port
 * at all (the node never dials out), a control port on an OS-chosen free port (several nodes can
 * share one machine without colliding), cookie auth, and `__OwningControllerProcess` so Tor exits
 * by itself the moment this Node.js process dies. No orphaned Tor keeps running on a server
 * after a crash.
 */

export interface TorProcessHandle {
  proc: ChildProcess;
  dataDir: string;
  controlPortFile: string;
  cookiePath: string;
}

export function buildNodeTorrc(opts: { dataDir: string; controlPortFile: string; ownerPid: number }): string {
  return [
    "SocksPort 0",
    `DataDirectory ${opts.dataDir}`,
    "ControlPort auto",
    `ControlPortWriteToFile ${opts.controlPortFile}`,
    "CookieAuthentication 1",
    `__OwningControllerProcess ${opts.ownerPid}`,
    "Log notice stdout",
    "",
  ].join("\n");
}

function ensureRestrictedDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  if (process.platform !== "win32") fs.chmodSync(dir, 0o700);
}

export function startTorProcess(opts: { torExePath: string; workDir: string }): TorProcessHandle {
  const dataDir = path.join(opts.workDir, "tor-data");
  ensureRestrictedDir(dataDir);
  const controlPortFile = path.join(dataDir, "control-port.txt");
  fs.rmSync(controlPortFile, { force: true });
  const torrcPath = path.join(opts.workDir, "torrc-node");
  fs.writeFileSync(torrcPath, buildNodeTorrc({ dataDir, controlPortFile, ownerPid: process.pid }), "utf8");

  // Same real Linux bug fix as officer-app/src/tor/torProcess.ts: the Expert Bundle's tor has no
  // RPATH to its own bundled libevent/libssl/libcrypto, so LD_LIBRARY_PATH must point there.
  const binDir = path.dirname(opts.torExePath);
  const env = process.platform === "win32"
    ? process.env
    : { ...process.env, LD_LIBRARY_PATH: [binDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":") };

  const proc = spawn(opts.torExePath, ["-f", torrcPath], { stdio: ["ignore", "pipe", "pipe"], env });
  return { proc, dataDir, controlPortFile, cookiePath: path.join(dataDir, "control_auth_cookie") };
}

/** Parses Tor's ControlPortWriteToFile content, e.g. "PORT=127.0.0.1:43127". */
export function parseControlPortFile(content: string): number | null {
  const match = content.match(/PORT=127\.0\.0\.1:(\d+)/);
  return match ? Number(match[1]) : null;
}

/** Resolves with the control port once Tor has opened it and written the cookie. */
export function waitForControlPort(handle: TorProcessHandle, timeoutMs = 30_000): Promise<number> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    let exited = false;
    const onExit = () => { exited = true; };
    handle.proc.once("exit", onExit);
    const tick = () => {
      if (exited) {
        reject(new Error("tor exited before opening its control port — see the [tor] log lines above"));
        return;
      }
      try {
        const port = parseControlPortFile(fs.readFileSync(handle.controlPortFile, "utf8"));
        if (port && fs.existsSync(handle.cookiePath)) {
          handle.proc.off("exit", onExit);
          resolve(port);
          return;
        }
      } catch {
        // file not written yet
      }
      if (Date.now() - started > timeoutMs) {
        handle.proc.off("exit", onExit);
        reject(new Error(`tor did not open its control port within ${timeoutMs}ms`));
        return;
      }
      setTimeout(tick, 200);
    };
    tick();
  });
}

const BOOTSTRAPPED_RE = /Bootstrapped (\d+)%/;

/** Streams Tor's log to [onLine] and bootstrap percentages to [onProgress]. */
export function watchTorLog(handle: TorProcessHandle, onProgress: (pct: number) => void, onLine: (line: string) => void): void {
  const onData = (chunk: Buffer) => {
    for (const line of chunk.toString("utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      onLine(line.trim());
      const match = line.match(BOOTSTRAPPED_RE);
      if (match) onProgress(Number(match[1]));
    }
  };
  handle.proc.stdout?.on("data", onData);
  handle.proc.stderr?.on("data", onData);
}
