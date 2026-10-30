import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { LICENSE_PUBLIC_KEY_B64 } from "./license";

/**
 * Release integrity: "is this program the one NexonAI shipped, and is it unchanged?"
 *
 * A release carries `release-manifest.txt` next to `dist/`:
 *
 *   unpruuf-release:v1
 *   version: 1.2.3
 *   files: 41
 *   <sha256>  dist/index.js          (one line per covered file, sorted by path, "/" separators)
 *   ...
 *   signature: <base64url Ed25519 signature>
 *
 * The signature covers  "unpruuf-release-v1\n" + everything above the "signature:" line.
 * It is made offline with the same key pair that signs licences (license-tool), but with its own
 * signing domain, so a licence signature can never be replayed as a release signature.
 *
 * The fingerprint is the SHA-256 of that signed body, shown in groups of four. NexonAI publishes it
 * per release; a customer or auditor compares it with what their server shows.
 *
 * Covered: every .js file under dist/ (tests excluded) and package.json.
 * NOT covered, on purpose: node_modules (native, platform-specific) and the data folder.
 *
 * Honest limit: this is a SELF-check. It finds files that changed on disk since the signing. A
 * server that is compromised while running can lie about its own state, and an attacker who can
 * edit the files can also edit this check. What it does give: tamper evidence between restarts,
 * a way for an auditor to compare a server against the published fingerprint from the outside
 * (verify-release.js on a copy of the files), and a refusal to start with
 * NODE_MESH_REQUIRE_SIGNED=1.
 */

export const MANIFEST_FILE = "release-manifest.txt";
export const MANIFEST_HEADER = "unpruuf-release:v1";
export const SIGN_DOMAIN = "unpruuf-release-v1\n";

export type IntegrityState =
  | "ok" // signed, every covered file matches
  | "modified" // signed, but files changed, are missing, or were added
  | "bad-signature" // a manifest exists but its signature does not verify
  | "unsigned" // no manifest: development checkout, nothing to compare with
  | "exe"; // single-file build: only the SHA-256 of the program file can be shown

export interface IntegrityResult {
  state: IntegrityState;
  version: string | null;
  /** SHA-256 of the signed manifest body, "a1b2 c3d4 …" (16 groups). For "exe": the exe's SHA-256. */
  fingerprint: string | null;
  changed: string[];
  missing: string[];
  extra: string[];
  filesChecked: number;
  checkedAt: number;
}

export function sha256File(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function walk(dir: string, rel: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const r = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(abs, r, out);
    else if (entry.isFile() && r.endsWith(".js") && !r.endsWith(".test.js")) out.push(r);
  }
}

/** The files a release covers, as "/"-separated paths relative to [root], sorted. */
export function listCoveredFiles(root: string): string[] {
  const out: string[] = [];
  const dist = path.join(root, "dist");
  if (fs.existsSync(dist)) walk(dist, "dist", out);
  if (fs.existsSync(path.join(root, "package.json"))) out.push("package.json");
  return out.sort();
}

export function readVersion(root: string): string {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
    return typeof v === "string" ? v : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** The unsigned manifest text for the files currently on disk. Ends with a newline. */
export function buildManifestBody(root: string, version: string = readVersion(root)): string {
  const files = listCoveredFiles(root);
  const lines = files.map((f) => `${sha256File(path.join(root, ...f.split("/")))}  ${f}`);
  return [MANIFEST_HEADER, `version: ${version}`, `files: ${files.length}`, ...lines].join("\n") + "\n";
}

export function signedBytes(body: string): Buffer {
  return Buffer.from(SIGN_DOMAIN + body, "utf8");
}

export function fingerprintOf(body: string): string {
  const hex = crypto.createHash("sha256").update(body, "utf8").digest("hex");
  return hex.match(/.{4}/g)!.join(" ");
}

/** Signs a body with an Ed25519 private key (offline tool and tests). Returns the full manifest file text. */
export function signManifest(body: string, privateKey: crypto.KeyObject): string {
  const signature = crypto.sign(null, signedBytes(body), privateKey).toString("base64url");
  return `${body}signature: ${signature}\n`;
}

function publicKeyObject(publicKeyB64: string): crypto.KeyObject {
  return crypto.createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: publicKeyB64 }, format: "jwk" });
}

interface ParsedManifest {
  body: string;
  signature: Buffer;
  version: string | null;
  hashes: Map<string, string>;
}

function parseManifest(text: string): ParsedManifest | null {
  const idx = text.lastIndexOf("signature: ");
  if (idx <= 0 || text[idx - 1] !== "\n") return null;
  const body = text.slice(0, idx);
  const sigText = text.slice(idx + "signature: ".length).trim();
  const lines = body.split("\n");
  if (lines[0] !== MANIFEST_HEADER) return null;
  const hashes = new Map<string, string>();
  let version: string | null = null;
  for (const line of lines.slice(1)) {
    if (line === "") continue;
    if (line.startsWith("version: ")) { version = line.slice("version: ".length); continue; }
    if (line.startsWith("files: ")) continue;
    const m = /^([0-9a-f]{64}) {2}(\S.*)$/.exec(line);
    if (!m) return null;
    hashes.set(m[2], m[1]);
  }
  let signature: Buffer;
  try { signature = Buffer.from(sigText, "base64url"); } catch { return null; }
  if (signature.length !== 64) return null;
  return { body, signature, version, hashes };
}

function isSingleFileExe(): boolean {
  try {
    // node:sea exists from Node 20; absent or false in a normal install
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return Boolean(require("node:sea").isSea());
  } catch {
    return false;
  }
}

/** Checks the install at [root] against its signed manifest. Never throws. */
export function verifyIntegrity(root: string, publicKeyB64: string = LICENSE_PUBLIC_KEY_B64, now: number = Date.now()): IntegrityResult {
  const base = { version: null as string | null, fingerprint: null as string | null, changed: [] as string[], missing: [] as string[], extra: [] as string[], filesChecked: 0, checkedAt: now };
  try {
    if (isSingleFileExe()) {
      const hex = sha256File(process.execPath);
      return { ...base, state: "exe", version: readVersion(root), fingerprint: hex.match(/.{4}/g)!.join(" ") };
    }
    const manifestPath = path.join(root, MANIFEST_FILE);
    if (!fs.existsSync(manifestPath)) return { ...base, state: "unsigned", version: readVersion(root) };
    const parsed = parseManifest(fs.readFileSync(manifestPath, "utf8"));
    if (!parsed) return { ...base, state: "bad-signature" };
    let ok = false;
    try { ok = crypto.verify(null, signedBytes(parsed.body), publicKeyObject(publicKeyB64), parsed.signature); } catch { ok = false; }
    if (!ok) return { ...base, state: "bad-signature", version: parsed.version };
    const fingerprint = fingerprintOf(parsed.body);

    const onDisk = new Set(listCoveredFiles(root));
    const changed: string[] = [];
    const missing: string[] = [];
    for (const [file, expected] of parsed.hashes) {
      if (!onDisk.has(file)) { missing.push(file); continue; }
      if (sha256File(path.join(root, ...file.split("/"))) !== expected) changed.push(file);
    }
    const extra = [...onDisk].filter((f) => !parsed.hashes.has(f));
    const clean = changed.length === 0 && missing.length === 0 && extra.length === 0;
    return { state: clean ? "ok" : "modified", version: parsed.version, fingerprint, changed, missing, extra, filesChecked: parsed.hashes.size, checkedAt: now };
  } catch {
    return { ...base, state: "bad-signature" };
  }
}

/** One line for the log and the pages. */
export function describeIntegrity(r: IntegrityResult): string {
  switch (r.state) {
    case "ok": return `Programmdateien unverändert (signiert, Version ${r.version}, Fingerprint ${r.fingerprint})`;
    case "modified": return `Programmdateien VERÄNDERT: ${r.changed.length} geändert, ${r.missing.length} fehlen, ${r.extra.length} zusätzlich`;
    case "bad-signature": return "Signatur der Dateiliste ungültig";
    case "exe": return `Einzelne Programmdatei, SHA-256 ${r.fingerprint}`;
    default: return "nicht signiert (Entwicklungsstand)";
  }
}
