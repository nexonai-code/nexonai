import * as fs from "fs";
import * as path from "path";

/**
 * macOS counterpart of windowsTor.ts — same non-Docker "run Tor as a plain child process
 * ourselves" approach, so the relay can be a hidden service without Docker Desktop on the Mac.
 * The actual process-management logic (torrc, spawning, waiting for the hidden-service hostname)
 * is shared with windowsTor.ts via torProcess.ts; this file only knows how to locate the Tor
 * *binary* on macOS specifically.
 */

export type { TorHandle } from "./torProcess";
export { buildTorrc, keepTorAlive, startTor, waitForHostname } from "./torProcess";

/**
 * Finds the `tor` binary: an explicit [torExePathOverride]/`TOR_EXE_PATH` env var wins, then a
 * copy at `mac/tor/tor` next to this package — as of mac-start.ts's `ensureTorBinaryMac` call,
 * this is auto-downloaded from the Tor Project's official Expert Bundle on first run if it isn't
 * there yet (not something we bundle/redistribute ourselves — see torDownload.ts), so normally
 * nobody needs to place it there by hand. Falls back to a bare `tor` on PATH — the common case
 * being a Homebrew install (`brew install tor`), which puts it there already.
 */
export function resolveTorExePath(torExePathOverride?: string): string {
  const override = torExePathOverride ?? process.env.TOR_EXE_PATH;
  if (override) return override;
  const bundled = path.join(__dirname, "..", "mac", "tor", "tor");
  if (fs.existsSync(bundled)) return bundled;
  return "tor";
}
