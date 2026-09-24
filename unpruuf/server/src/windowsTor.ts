import * as fs from "fs";
import * as path from "path";

/**
 * Manages a Tor child process on Windows so the relay can run as a hidden service without
 * Docker — macTor.ts is the macOS sibling of this file (same non-Docker approach, different
 * platform), and both share their actual process-management logic from torProcess.ts, so this
 * file itself only knows how to locate the Tor *binary* on Windows specifically. The Linux/Docker
 * deployment instead runs Tor as a separate sidecar container (see ../tor/) and never imports
 * either module.
 */

export type { TorHandle } from "./torProcess";
export { buildTorrc, startTor, waitForHostname } from "./torProcess";

/**
 * Finds tor.exe: an explicit [torExePathOverride]/`TOR_EXE_PATH` env var wins, then a copy at
 * `windows/tor/tor.exe` next to this package — as of windows-start.ts's `ensureTorBinary` call,
 * this is auto-downloaded from the Tor Project's official Expert Bundle on first run if it isn't
 * there yet (not something we bundle/redistribute ourselves — see torDownload.ts), so normally
 * nobody needs to place it there by hand anymore. Falls back to bare `tor.exe`/`tor` on PATH for
 * users who already have Tor Browser or the bundle installed somewhere.
 */
export function resolveTorExePath(torExePathOverride?: string): string {
  const override = torExePathOverride ?? process.env.TOR_EXE_PATH;
  if (override) return override;
  const bundled = path.join(__dirname, "..", "windows", "tor", "tor.exe");
  if (fs.existsSync(bundled)) return bundled;
  return process.platform === "win32" ? "tor.exe" : "tor";
}
