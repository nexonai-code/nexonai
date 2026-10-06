import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

/**
 * Server license — see license-tool/lib.js ("Server licenses") for the issuing side.
 *
 *   unpruuf-server-license:v1:<base64url(payload)>:<base64url(ed25519 signature)>
 *   payload   = 1|<serial>|<customer>|<maxNodes>|<issuedAtMs>|<expiresAtMs>
 *   signature = over  "unpruuf-server-license-v1\n" + payload   (domain-separated from app licenses)
 *
 * Checked entirely offline. Nothing is sent anywhere, no device is identified: the vendor knows how
 * many licenses were sold, not where they run (same model as the app seats). What a license bounds:
 * how many node addresses one server publishes, and until when it accepts new deposits.
 *
 * Honest limit: this is a server the customer runs from readable JavaScript on their own machine.
 * The check keeps honest customers honest and makes the contract visible in the product; it is not
 * copy protection against someone who edits the code. The legal side lives in the license contract.
 */

/** Same Ed25519 public key the Android app's LicenseManager.PUBLIC_KEY_B64 carries. */
export const LICENSE_PUBLIC_KEY_B64 = "67A_r4YeFkvYoXDF30gar2gRBcufokgvYQd5dVeEwKE";
export const SERVER_LICENSE_PREFIX = "unpruuf-server-license:v1:";
export const APP_LICENSE_PREFIX = "unpruuf-license:v1:";
const SIGN_DOMAIN = "unpruuf-server-license-v1\n";
export const MAX_LICENSED_NODES = 500;
/** From this many days before expiry the setup page and the log start warning. */
export const EXPIRY_WARNING_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ServerLicense {
  serial: string;
  customer: string;
  maxNodes: number;
  issuedAtMs: number;
  expiresAtMs: number;
}

export type LicenseStatus =
  | "free" // Temp Node: one chat, memory only, needs no license
  | "missing"
  | "invalid"
  | "valid"
  | "expiring"
  | "expired";

export type LicenseError = "wrong-type" | "invalid";

function publicKeyObject(publicKeyB64: string): crypto.KeyObject {
  return crypto.createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: publicKeyB64 }, format: "jwk" });
}

function parsePayload(payload: string): ServerLicense | null {
  const parts = payload.split("|");
  if (parts.length !== 6 || parts[0] !== "1") return null;
  const [, serial, customer, maxNodesStr, issuedStr, expiresStr] = parts;
  const maxNodes = Number(maxNodesStr);
  const issuedAtMs = Number(issuedStr);
  const expiresAtMs = Number(expiresStr);
  if (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > MAX_LICENSED_NODES) return null;
  if (!Number.isFinite(issuedAtMs) || !Number.isFinite(expiresAtMs)) return null;
  return { serial, customer, maxNodes, issuedAtMs, expiresAtMs };
}

/** The license inside a code, or null for anything that is not a genuinely signed server license. */
export function verifyServerLicense(code: string, publicKeyB64: string = LICENSE_PUBLIC_KEY_B64): ServerLicense | null {
  const trimmed = code.trim();
  if (!trimmed.startsWith(SERVER_LICENSE_PREFIX)) return null;
  const rest = trimmed.slice(SERVER_LICENSE_PREFIX.length);
  const sep = rest.lastIndexOf(":");
  if (sep <= 0) return null;
  try {
    const payload = Buffer.from(rest.slice(0, sep), "base64url").toString("utf8");
    const signature = Buffer.from(rest.slice(sep + 1), "base64url");
    if (signature.length !== 64) return null;
    const ok = crypto.verify(null, Buffer.from(SIGN_DOMAIN + payload, "utf8"), publicKeyObject(publicKeyB64), signature);
    return ok ? parsePayload(payload) : null;
  } catch {
    return null;
  }
}

export function daysLeft(license: ServerLicense, nowMs: number): number {
  return Math.floor((license.expiresAtMs - nowMs) / DAY_MS);
}

export interface LicenseSummary {
  status: LicenseStatus;
  customer: string | null;
  serial: string | null;
  maxNodes: number;
  expiresAtMs: number | null;
  daysLeft: number | null;
}

export interface LicenseGuardOptions {
  /** Where an applied code is stored (data folder). Null for a Temp Node. */
  filePath: string | null;
  /** NODE_MESH_LICENSE — convenient for containers. */
  envCode?: string | null;
  /** Temp Node: one node, no license. */
  free?: boolean;
  publicKeyB64?: string;
  now?: () => number;
}

/**
 * Holds the server's license. The file written by the setup page and NODE_MESH_LICENSE are both
 * read; when both carry a genuine license the one that runs longer wins (so pasting a renewal
 * always takes effect, even if an older code still sits in the environment).
 */
export class LicenseGuard {
  private license: ServerLicense | null = null;
  private sawCode = false;
  private readonly now: () => number;
  private readonly publicKeyB64: string;

  constructor(private readonly opts: LicenseGuardOptions) {
    this.now = opts.now ?? Date.now;
    this.publicKeyB64 = opts.publicKeyB64 ?? LICENSE_PUBLIC_KEY_B64;
    this.reload();
  }

  /** Re-reads file and environment. */
  reload(): void {
    this.license = null;
    this.sawCode = false;
    const codes: string[] = [];
    if (this.opts.filePath) {
      try {
        const fromFile = fs.readFileSync(this.opts.filePath, "utf8").trim();
        if (fromFile) codes.push(fromFile);
      } catch {
        /* no file yet */
      }
    }
    if (this.opts.envCode && this.opts.envCode.trim()) codes.push(this.opts.envCode.trim());
    for (const code of codes) {
      this.sawCode = true;
      const lic = verifyServerLicense(code, this.publicKeyB64);
      if (lic && (!this.license || lic.expiresAtMs > this.license.expiresAtMs)) this.license = lic;
    }
  }

  /** Verifies and stores a pasted code. A code that does not verify changes nothing. */
  apply(code: string): { ok: true; license: ServerLicense } | { ok: false; error: LicenseError } {
    const trimmed = code.trim();
    const lic = verifyServerLicense(trimmed, this.publicKeyB64);
    if (!lic) return { ok: false, error: trimmed.startsWith(APP_LICENSE_PREFIX) ? "wrong-type" : "invalid" };
    if (this.opts.filePath) {
      fs.mkdirSync(path.dirname(this.opts.filePath), { recursive: true });
      const tmp = `${this.opts.filePath}.tmp`;
      fs.writeFileSync(tmp, trimmed + "\n", { mode: 0o600 });
      fs.renameSync(tmp, this.opts.filePath);
    }
    this.reload();
    // reload() keeps the longer-running license; a code that is older than the one already
    // active is stored but does not shorten anything.
    return { ok: true, license: this.license ?? lic };
  }

  status(): LicenseStatus {
    if (this.opts.free) return "free";
    if (!this.license) return this.sawCode ? "invalid" : "missing";
    const left = this.license.expiresAtMs - this.now();
    if (left <= 0) return "expired";
    return left <= EXPIRY_WARNING_DAYS * DAY_MS ? "expiring" : "valid";
  }

  /** True once a genuine license (valid, expiring OR expired) is present — the node may start.
   *  Expired licenses still start the server so owners can read what is still stored; deposits
   *  are refused (see [depositBlocked]). */
  activated(): boolean {
    return Boolean(this.opts.free) || this.license !== null;
  }

  /** Node addresses this server may publish. */
  maxNodes(): number {
    if (this.opts.free) return 1;
    return this.license?.maxNodes ?? 0;
  }

  /** Reason code when new deposits must be refused, else null. Reading is never blocked. */
  depositBlocked(): "license_expired" | "license_missing" | null {
    const s = this.status();
    if (s === "expired") return "license_expired";
    if (s === "missing" || s === "invalid") return "license_missing";
    return null;
  }

  summary(): LicenseSummary {
    const lic = this.license;
    return {
      status: this.status(),
      customer: lic?.customer ?? null,
      serial: lic?.serial ?? null,
      maxNodes: this.maxNodes(),
      expiresAtMs: lic?.expiresAtMs ?? null,
      daysLeft: lic ? daysLeft(lic, this.now()) : null,
    };
  }
}
