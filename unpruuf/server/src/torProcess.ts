import { ChildProcess, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

/**
 * Platform-agnostic half of running Tor as a plain child process for a non-Docker relay
 * deployment — shared by windowsTor.ts and macTor.ts, which each only add their own
 * `resolveTorExePath` (where that platform's Tor binary actually lives) on top of this. Split out
 * once a second platform (macOS) needed the exact same buildTorrc/startTor/waitForHostname logic,
 * to avoid the two files drifting out of sync.
 */

export interface TorHandle {
  proc: ChildProcess;
  hostnamePath: string;
}

/**
 * Pure torrc content builder, split out from [startTor] so it's testable without actually
 * spawning a process. SOCKS is disabled — this relay doesn't need to make outbound Tor
 * connections itself, only to be reachable as a hidden service. [localPort] is the plain HTTP
 * port the Express app is already listening on at 127.0.0.1 — the hidden service forwards public
 * port 80 to it.
 */
export function buildTorrc(opts: { hsDir: string; torDataDir: string; localPort: number }): string {
  return [
    "SocksPort 0",
    `DataDirectory ${opts.torDataDir}`,
    `HiddenServiceDir ${opts.hsDir}`,
    `HiddenServicePort 80 127.0.0.1:${opts.localPort}`,
    "",
  ].join("\n");
}

/**
 * Creates [dir] (if needed) and forces it to mode 0700 — Tor refuses to start with
 * "Permissions on directory ... are too permissive" otherwise. `fs.mkdirSync`'s own `mode`
 * option is silently masked by the process umask (confirmed against the real `tor` binary: a
 * directory created with `{ mode: 0o700 }` alone still came out 0755 here), so the mode is set
 * explicitly afterward instead of trusted to survive creation. A no-op on Windows, where NTFS
 * ACLs (not POSIX mode bits) govern permissions and Tor doesn't enforce this the same way.
 */
function ensureRestrictedDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  if (process.platform !== "win32") fs.chmodSync(dir, 0o700);
}

/** Writes torrc under [dataDir] and spawns the Tor binary against it. See [buildTorrc] for the content. */
export function startTor(opts: { torExePath: string; dataDir: string; localPort: number }): TorHandle {
  const hsDir = path.join(opts.dataDir, "tor-hidden-service");
  const torDataDir = path.join(opts.dataDir, "tor-data");
  ensureRestrictedDir(hsDir);
  ensureRestrictedDir(torDataDir);

  const torrcPath = path.join(opts.dataDir, "torrc");
  fs.writeFileSync(torrcPath, buildTorrc({ hsDir, torDataDir, localPort: opts.localPort }), "utf8");

  const proc = spawn(opts.torExePath, ["-f", torrcPath], { stdio: ["ignore", "pipe", "pipe"] });
  return { proc, hostnamePath: path.join(hsDir, "hostname") };
}

/**
 * Keeps a Tor child process alive after the initial successful start.
 *
 * Until this existed, a Tor process that died *after* publishing its hostname was completely
 * invisible: the relay's own HTTP server kept running and kept printing nothing, while the onion
 * address it had just advertised was silently unreachable. Nothing logged it, and nothing tried
 * to recover — the operator's only symptom would have been "my contacts stopped receiving
 * anything", with a console that still looked healthy.
 *
 * Restarts are bounded and backed off: a Tor that dies immediately and repeatedly is a
 * configuration problem, and retrying it forever would just fill the log. The hidden service's
 * keys live in [dataDir] and are not touched here, so a restarted Tor republishes the *same*
 * onion address — already-paired contacts keep working across a restart.
 */
export function keepTorAlive(opts: {
  initial: TorHandle;
  respawn: () => TorHandle;
  /** Re-attaches stdout/stderr capture to a freshly spawned process. */
  attachOutput: (handle: TorHandle) => void;
  log: (message: string) => void;
  maxRestarts?: number;
  restartDelayMs?: number;
}): { handle: () => TorHandle; stop: () => void } {
  const maxRestarts = opts.maxRestarts ?? 5;
  const restartDelayMs = opts.restartDelayMs ?? 3_000;
  let current = opts.initial;
  let restarts = 0;
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
    if (stopped) return;
    const why = signal ? `signal ${signal}` : `exit code ${code}`;
    if (restarts >= maxRestarts) {
      opts.log(`[tor] exited (${why}) and has already been restarted ${restarts} time(s) — giving up. The relay is now unreachable; fix the cause and restart it.`);
      return;
    }
    restarts += 1;
    opts.log(`[tor] exited unexpectedly (${why}) — restarting in ${restartDelayMs / 1000}s (attempt ${restarts}/${maxRestarts})…`);
    timer = setTimeout(() => {
      if (stopped) return;
      try {
        current = opts.respawn();
        opts.attachOutput(current);
        current.proc.on("exit", onExit);
        opts.log(`[tor] restarted — the onion address is unchanged (its keys live in the data directory).`);
      } catch (err) {
        opts.log(`[tor] restart failed: ${(err as Error).message}`);
      }
    }, restartDelayMs);
    timer.unref?.();
  };

  current.proc.on("exit", onExit);

  return {
    handle: () => current,
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}

/**
 * Polls for the hidden-service hostname file Tor writes once the HS keys are set up. If [proc]
 * is given and exits before that happens, rejects immediately with [logTail] instead of waiting
 * out the full timeout for a Tor that has already crashed (e.g. a bad torrc, permission error,
 * or missing dependency — Tor writes its own notice/warn/err lines to stdout by default, not
 * stderr, so callers need to capture both).
 */
export function waitForHostname(
  hostnamePath: string,
  timeoutMs: number = 60_000,
  proc?: ChildProcess,
  logTail?: { value: string }
): Promise<string> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    let settled = false;
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      const why = signal ? `signal ${signal}` : `exit code ${code}`;
      const tail = logTail?.value.trim();
      reject(new Error(`tor process exited (${why}) before publishing a hostname` + (tail ? `:\n${tail}` : "")));
    };
    proc?.on("exit", onExit);

    const poll = () => {
      if (settled) return;
      if (fs.existsSync(hostnamePath)) {
        const hostname = fs.readFileSync(hostnamePath, "utf8").trim();
        if (hostname.length > 0) {
          settled = true;
          proc?.off("exit", onExit);
          return resolve(hostname);
        }
      }
      if (Date.now() - start > timeoutMs) {
        settled = true;
        proc?.off("exit", onExit);
        return reject(new Error(`Tor did not publish a hidden-service hostname within ${timeoutMs}ms`));
      }
      setTimeout(poll, 500);
    };
    poll();
  });
}
