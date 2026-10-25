import * as fs from "fs";
import * as path from "path";

/**
 * The company's own Tor bridge lines. A bridge is a small server that is NOT listed anywhere, so a
 * country or a company network that blocks the public Tor relays and the public default bridges
 * still cannot block it: nobody outside the company knows its address. The lines travel inside
 * the node-list file (nodeList.ts, `bridge:` lines) and the company feed to every phone, and the
 * app tries them first when Tor is blocked (ConnectionPaths.kt in the app uses the same rules).
 *
 * Only obfs4 and plain `IP:PORT [FINGERPRINT]` lines are accepted. A line is one line, nothing
 * else: a newline here would let text slip into somebody's Tor configuration.
 */

export const MAX_BRIDGE_LINES = 10;

const OBFS4_RE = /^obfs4 \S+:\d{1,5} [0-9A-Fa-f]{40} cert=[A-Za-z0-9+/]{20,}={0,2}( iat-mode=[0-2])?$/;
const VANILLA_RE = /^(\[[0-9a-fA-F:]+\]|\d{1,3}(\.\d{1,3}){3}):\d{1,5}( [0-9A-Fa-f]{40})?$/;

/** One bridge line (a leading "Bridge " is dropped), or null if it is not a usable line. */
export function cleanBridgeLine(raw: string): string | null {
  let s = raw.trim();
  if (/^bridge /i.test(s)) s = s.slice(7).trim();
  if (s.length > 600 || /[\u0000-\u001f\u007f]/.test(s)) return null;
  return OBFS4_RE.test(s) || VANILLA_RE.test(s) ? s : null;
}

/** Valid, distinct lines from [raw], at most MAX_BRIDGE_LINES. */
export function cleanBridgeLines(raw: string[]): string[] {
  const out: string[] = [];
  for (const r of raw) {
    const c = cleanBridgeLine(r);
    if (c && !out.includes(c)) out.push(c);
    if (out.length >= MAX_BRIDGE_LINES) break;
  }
  return out;
}

export function readBridgeLines(file: string): string[] {
  try {
    return cleanBridgeLines(fs.readFileSync(file, "utf8").split(/\r?\n/));
  } catch {
    return [];
  }
}

/** Saves the valid lines of [raw] (an empty result removes the file). Returns what was saved. */
export function writeBridgeLines(file: string, raw: string[]): string[] {
  const lines = cleanBridgeLines(raw);
  if (lines.length === 0) {
    fs.rmSync(file, { force: true });
    return [];
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.join("\n") + "\n", { encoding: "utf8", mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch { /* Windows: no POSIX modes */ }
  return lines;
}
