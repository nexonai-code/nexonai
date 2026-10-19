import * as crypto from "crypto";
import type { LicenseRecord, ServerRecord } from "./vault";

/**
 * The licence inventory. NexonAI issues codes with the licence tool (`--count N`); the customer
 * imports them here and Control keeps track of which code sits on which server or device.
 *
 * Codes are verified offline against the same Ed25519 public key the apps and servers carry, so a
 * mistyped, cut-off or foreign code is rejected at import, not months later on the server.
 * No new licence format: Control only keeps and hands out codes that already exist.
 *
 * Honest limit: this is bookkeeping. It stops the common mistake (the same code on two servers) and
 * shows which codes are free; it cannot stop someone from copying a code by hand. "One server per
 * licence" stays in the contract.
 */

export const LICENSE_PUBLIC_KEY_B64 = "67A_r4YeFkvYoXDF30gar2gRBcufokgvYQd5dVeEwKE";
const SERVER_PREFIX = "unpruuf-server-license:v1:";
const APP_PREFIX = "unpruuf-license:v1:";
const SERVER_DOMAIN = "unpruuf-server-license-v1\n";
const DAY_MS = 86_400_000;
export const EXPIRY_WARNING_DAYS = 30;
const APP_EDITIONS = ["standard", "pro", "client", "group"];

const CODE_RE = /unpruuf-(?:server-)?license:v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+/g;

export interface ParsedLicense {
  code: string;
  kind: "server" | "app";
  serial: string;
  customer: string;
  edition: string | null;
  maxNodes: number | null;
  issuedAtMs: number;
  expiresAtMs: number;
}

function publicKey(b64: string): crypto.KeyObject {
  return crypto.createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: b64 }, format: "jwk" });
}

/** A genuinely signed licence code, or null. Understands server and app codes. */
export function parseLicense(raw: string, publicKeyB64: string = LICENSE_PUBLIC_KEY_B64): ParsedLicense | null {
  const code = raw.trim();
  const server = code.startsWith(SERVER_PREFIX);
  const app = !server && code.startsWith(APP_PREFIX);
  if (!server && !app) return null;
  const rest = code.slice((server ? SERVER_PREFIX : APP_PREFIX).length);
  const sep = rest.lastIndexOf(":");
  if (sep <= 0) return null;
  try {
    const payload = Buffer.from(rest.slice(0, sep), "base64url").toString("utf8");
    const sig = Buffer.from(rest.slice(sep + 1), "base64url");
    if (sig.length !== 64) return null;
    const signed = Buffer.from(server ? SERVER_DOMAIN + payload : payload, "utf8");
    if (!crypto.verify(null, signed, publicKey(publicKeyB64), sig)) return null;
    const f = payload.split("|");
    if (f.length !== 6 || f[0] !== "1") return null;
    if (server) {
      const [, serial, customer, maxNodes, issued, expires] = f;
      const n = Number(maxNodes);
      if (!Number.isInteger(n) || n < 1 || n > 250 || !Number.isFinite(Number(issued)) || !Number.isFinite(Number(expires))) return null;
      return { code, kind: "server", serial, customer, edition: null, maxNodes: n, issuedAtMs: Number(issued), expiresAtMs: Number(expires) };
    }
    const [, edition, serial, customer, issued, expires] = f;
    if (!APP_EDITIONS.includes(edition) || !Number.isFinite(Number(issued)) || !Number.isFinite(Number(expires))) return null;
    return { code, kind: "app", serial, customer, edition, maxNodes: null, issuedAtMs: Number(issued), expiresAtMs: Number(expires) };
  } catch {
    return null;
  }
}

export interface ImportReport {
  added: number;
  renewed: number;
  duplicates: number;
  invalid: string[];
  expired: number;
  /** Server codes that allow fewer than 250 node addresses (trial or reduced licence). A server runs exactly the licensed number. */
  smallServers: number;
}

export type LicenseState = "valid" | "expiring" | "expired";

export function licenseState(l: { expiresAtMs: number }, now: number): LicenseState {
  if (now >= l.expiresAtMs) return "expired";
  return l.expiresAtMs - now <= EXPIRY_WARNING_DAYS * DAY_MS ? "expiring" : "valid";
}

export function daysLeft(l: { expiresAtMs: number }, now: number): number {
  return Math.floor((l.expiresAtMs - now) / DAY_MS);
}

export class LicenseInventory {
  constructor(
    private readonly licenses: LicenseRecord[],
    private readonly servers: ServerRecord[],
    private readonly publicKeyB64: string = LICENSE_PUBLIC_KEY_B64,
    private readonly now: () => number = Date.now,
  ) {}

  /** Finds every code in pasted text or in the CSV the licence tool writes. */
  importText(text: string): ImportReport {
    const report: ImportReport = { added: 0, renewed: 0, duplicates: 0, invalid: [], expired: 0, smallServers: 0 };
    const found = text.match(CODE_RE) ?? [];
    const seen = new Set<string>();
    for (const raw of found) {
      if (seen.has(raw)) { report.duplicates++; continue; }
      seen.add(raw);
      const p = parseLicense(raw, this.publicKeyB64);
      if (!p) { report.invalid.push(raw.slice(0, 40) + "…"); continue; }
      const existing = this.licenses.find((l) => l.kind === p.kind && l.serial === p.serial);
      if (existing) {
        if (p.expiresAtMs > existing.expiresAtMs) {
          // A renewal: the same serial with a later expiry replaces the code, the assignment stays.
          existing.code = p.code; existing.issuedAtMs = p.issuedAtMs; existing.expiresAtMs = p.expiresAtMs;
          existing.maxNodes = p.maxNodes; existing.customer = p.customer;
          report.renewed++;
        } else report.duplicates++;
        continue;
      }
      this.licenses.push({ ...p, importedAt: this.now(), assigned: null });
      report.added++;
      if (p.kind === "server" && p.maxNodes !== null && p.maxNodes < 250) report.smallServers++;
      if (this.now() >= p.expiresAtMs) report.expired++;
    }
    // A pasted text with no code-looking token at all is one invalid entry, so the admin sees why nothing happened.
    if (found.length === 0 && text.trim().length > 0) report.invalid.push(text.trim().slice(0, 40) + "…");
    return report;
  }

  list(kind?: "server" | "app"): LicenseRecord[] {
    return this.licenses.filter((l) => !kind || l.kind === kind);
  }

  bySerial(kind: "server" | "app", serial: string): LicenseRecord | undefined {
    return this.licenses.find((l) => l.kind === kind && l.serial === serial);
  }

  /** The server code to use next: valid, free, and — to use up older ones first — the one that expires first, but not one about to run out. */
  nextFreeServerCode(): LicenseRecord | null {
    const t = this.now();
    const free = this.licenses.filter((l) => l.kind === "server" && !l.assigned && t < l.expiresAtMs);
    if (!free.length) return null;
    const healthy = free.filter((l) => licenseState(l, t) === "valid").sort((a, b) => a.expiresAtMs - b.expiresAtMs);
    return healthy[0] ?? free.sort((a, b) => b.expiresAtMs - a.expiresAtMs)[0];
  }

  assignToServer(serial: string, serverId: string): { ok: true } | { ok: false; error: "unknown" | "expired" | "taken" | "server-has-one" | "no-server" } {
    const l = this.bySerial("server", serial);
    if (!l) return { ok: false, error: "unknown" };
    if (!this.servers.some((s) => s.id === serverId)) return { ok: false, error: "no-server" };
    if (this.now() >= l.expiresAtMs) return { ok: false, error: "expired" };
    if (l.assigned && !(l.assigned.type === "server" && l.assigned.serverId === serverId)) return { ok: false, error: "taken" };
    const other = this.licenses.find((x) => x.kind === "server" && x !== l && x.assigned?.type === "server" && x.assigned.serverId === serverId);
    if (other) return { ok: false, error: "server-has-one" };
    l.assigned = { type: "server", serverId, at: this.now() };
    const s = this.servers.find((x) => x.id === serverId)!;
    s.licenseSerial = l.serial;
    return { ok: true };
  }

  assignToDevice(serial: string, label: string): { ok: true } | { ok: false; error: "unknown" | "expired" | "taken" | "label" } {
    const l = this.bySerial("app", serial);
    const clean = label.trim().slice(0, 80);
    if (!clean) return { ok: false, error: "label" };
    if (!l) return { ok: false, error: "unknown" };
    if (this.now() >= l.expiresAtMs) return { ok: false, error: "expired" };
    if (l.assigned) return { ok: false, error: "taken" };
    l.assigned = { type: "device", label: clean, at: this.now() };
    return { ok: true };
  }

  release(kind: "server" | "app", serial: string): boolean {
    const l = this.bySerial(kind, serial);
    if (!l || !l.assigned) return false;
    if (l.assigned.type === "server") {
      const s = this.servers.find((x) => x.id === (l.assigned as { serverId: string }).serverId);
      if (s && s.licenseSerial === l.serial) s.licenseSerial = null;
    }
    l.assigned = null;
    return true;
  }

  releaseServer(serverId: string): void {
    for (const l of this.licenses) if (l.kind === "server" && l.assigned?.type === "server" && l.assigned.serverId === serverId) l.assigned = null;
  }

  /** Counts for the overview, per kind. */
  summary(kind: "server" | "app") {
    const t = this.now();
    const all = this.list(kind);
    return {
      total: all.length,
      assigned: all.filter((l) => l.assigned).length,
      free: all.filter((l) => !l.assigned && t < l.expiresAtMs).length,
      expiring: all.filter((l) => licenseState(l, t) === "expiring").length,
      expired: all.filter((l) => licenseState(l, t) === "expired").length,
    };
  }

  /** CSV of the whole inventory (codes included — treat the file like the codes themselves). */
  csv(includeCodes: boolean): string {
    const rows = [["kind", "serial", "customer", "edition", "expires", "state", "assigned to", ...(includeCodes ? ["code"] : [])]];
    const t = this.now();
    for (const l of this.licenses) {
      const as = l.assigned;
      const a = as ? (as.type === "server" ? `server: ${this.servers.find((s) => s.id === as.serverId)?.name ?? "?"}` : `device: ${as.label}`) : "";
      rows.push([l.kind, l.serial, l.customer, l.edition ?? "", new Date(l.expiresAtMs).toISOString().slice(0, 10), licenseState(l, t), a, ...(includeCodes ? [l.code] : [])]);
    }
    return rows.map((r) => r.map((f) => `"${String(f).replace(/"/g, '""')}"`).join(",")).join("\n") + "\n";
  }
}
