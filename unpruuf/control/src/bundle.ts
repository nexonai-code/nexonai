import * as fs from "fs";
import * as path from "path";
import { sha256Hex } from "./ssh";

/**
 * The server software Control installs: a tarball of the node server's source plus its signed
 * release list (when the release was signed), built by `npm run bundle`. It travels with Control, so
 * installing needs no download from NexonAI or anyone else except what Docker's own build pulls.
 */
export interface BundleInfo {
  version: string;
  sha256: string;
  files: number;
  builtAt: string;
  /** Fingerprint of the signed release list inside the bundle, or null if the release was not signed. */
  releaseFingerprint: string | null;
  releaseVersion: string | null;
  signed: boolean;
}

export interface LoadedBundle {
  info: BundleInfo;
  data: Buffer;
}

export function loadBundle(dir: string): LoadedBundle | null {
  const tgz = path.join(dir, "node-server.tgz");
  const meta = path.join(dir, "bundle.json");
  if (!fs.existsSync(tgz) || !fs.existsSync(meta)) return null;
  const data = fs.readFileSync(tgz);
  const info = JSON.parse(fs.readFileSync(meta, "utf8")) as BundleInfo;
  if (sha256Hex(data) !== info.sha256) return null; // changed after it was built: refuse
  return { info, data };
}

/** Pulls version and fingerprint out of a release-manifest.txt (see node-mesh-server/src/integrity.ts). */
export function readManifest(text: string): { version: string | null; fingerprint: string | null } {
  const version = /^version:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? null;
  const sigAt = text.lastIndexOf("signature:");
  if (sigAt < 0) return { version, fingerprint: null };
  const body = text.slice(0, sigAt);
  const hex = require("crypto").createHash("sha256").update(body, "utf8").digest("hex") as string;
  return { version, fingerprint: hex.match(/.{4}/g)!.join(" ") };
}
