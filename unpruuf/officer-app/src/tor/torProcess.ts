import { ChildProcess, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

/**
 * Runs Tor as a plain outbound SOCKS client — no hidden service, unlike `server/src/torProcess.
 * ts`'s `buildTorrc` (which disables SOCKS entirely and only ever publishes a hidden service).
 * Officer-app never needs to be reached directly; it only needs to dial OUT to the relay's onion
 * address, exactly like the Android app already does via `tor-android`. This is what closes the
 * "officer-app talks plain LAN HTTP, not Tor" gap flagged in this project's own README/
 * CHANGELOG/STATUS.md as a known, deliberate v1 simplification.
 */

export interface TorHandle {
  proc: ChildProcess;
  socksPort: number;
}

/** Pure torrc content builder — split out for the same reason `server/`'s copy is: testable
 *  without actually spawning a process. */
export function buildClientTorrc(opts: { socksPort: number; dataDir: string }): string {
  return [
    `SocksPort 127.0.0.1:${opts.socksPort}`,
    `DataDirectory ${opts.dataDir}`,
    // No hidden service directives — this process is a pure client. Bootstrap-only logging so
    // waitForBootstrap (below) has clean, parseable "Bootstrapped NN%" lines on stdout.
    "Log notice stdout",
    "",
  ].join("\n");
}

function ensureRestrictedDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  if (process.platform !== "win32") fs.chmodSync(dir, 0o700);
}

/** Writes torrc under [dataDir] and spawns the Tor binary against it. */
export function startTorClient(opts: { torExePath: string; dataDir: string; socksPort: number }): TorHandle {
  const torDataDir = path.join(opts.dataDir, "tor-data");
  ensureRestrictedDir(torDataDir);

  const torrcPath = path.join(opts.dataDir, "torrc-client");
  fs.writeFileSync(torrcPath, buildClientTorrc({ socksPort: opts.socksPort, dataDir: torDataDir }), "utf8");

  // Real bug found running this for the first time (Linux Expert Bundle, 2026-09-26): `tor`
  // ships next to its own `libevent`/`libssl`/`libcrypto` .so files but has no RPATH pointing at
  // its own directory, so the dynamic linker can't find them ("libevent-2.1.so.7: cannot open
  // shared object file") unless LD_LIBRARY_PATH includes that directory — confirmed by running
  // the extracted binary directly, not assumed. Windows has no equivalent concept (it searches
  // the executable's own directory for DLLs by default); harmless to set unconditionally
  // everywhere else too, including macOS, in case a future bundle needs it there as well.
  const binDir = path.dirname(opts.torExePath);
  const env = process.platform === "win32"
    ? process.env
    : { ...process.env, LD_LIBRARY_PATH: [binDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":") };

  const proc = spawn(opts.torExePath, ["-f", torrcPath], { stdio: ["ignore", "pipe", "pipe"], env });
  return { proc, socksPort: opts.socksPort };
}

const BOOTSTRAPPED_RE = /Bootstrapped (\d+)%/;

/**
 * Resolves once Tor's own log reports "Bootstrapped 100%", or rejects on process exit / timeout.
 * [onProgress] surfaces intermediate percentages to the dashboard console — bootstrapping can
 * take anywhere from a few seconds to ~30s depending on the network, and a silent wait looks
 * indistinguishable from a hang (the exact complaint that led the Android app to add its own
 * unconditional "what percent are we at" logging — see STATUS.md's Tor-connectivity history).
 */
export function waitForBootstrap(
  handle: TorHandle,
  opts: { timeoutMs?: number; onProgress?: (pct: number, line: string) => void } = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 90_000;
  return new Promise((resolve, reject) => {
    let settled = false;
    let logTail = "";
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Tor did not finish bootstrapping within ${timeoutMs}ms. Last log lines:\n${logTail.trim()}`));
    }, timeoutMs);

    const onData = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      logTail = (logTail + text).slice(-4000);
      for (const line of text.split(/\r?\n/)) {
        const match = line.match(BOOTSTRAPPED_RE);
        if (!match) continue;
        const pct = Number(match[1]);
        opts.onProgress?.(pct, line.trim());
        if (pct >= 100 && !settled) {
          settled = true;
          cleanup();
          resolve();
        }
      }
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      const why = signal ? `signal ${signal}` : `exit code ${code}`;
      reject(new Error(`tor process exited (${why}) before finishing bootstrap:\n${logTail.trim()}`));
    };
    function cleanup() {
      clearTimeout(timer);
      handle.proc.stdout?.off("data", onData);
      handle.proc.stderr?.off("data", onData);
      handle.proc.off("exit", onExit);
    }

    handle.proc.stdout?.on("data", onData);
    handle.proc.stderr?.on("data", onData);
    handle.proc.on("exit", onExit);
  });
}
