import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { DEFAULT_TTL_HOURS } from "./config";

export interface NodeIdentity {
  /**
   * Required on every PUT /deposit call — see middleware/ownerAuth.ts. Unlike the consumer
   * relay's bearer token, this is NEVER handed to a contact: it stays between this node and the
   * owner's own app instance(s) only (NODE_MESH_SPEC.md §1/§8). GET /fetch and POST /fetchMany
   * need no token at all — the routing_tag itself is the read credential (§2).
   */
  ownerSecret: string;
  /** How long a deposited blob is kept before the TTL sweep removes it — the only deletion
   *  mechanism now that fetch no longer deletes (§4). */
  ttlHours: number;
}

function generateSecret(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Loads the persisted identity at [identityPath], or creates and persists a new one if none
 * exists yet — restarting the process keeps the same owner secret instead of locking the owner's
 * own app instance(s) out. [defaultTtlHours] is only used the first time.
 */
export function loadOrCreateIdentity(identityPath: string, defaultTtlHours: number = DEFAULT_TTL_HOURS): {
  identity: NodeIdentity;
  wasCreated: boolean;
} {
  if (fs.existsSync(identityPath)) {
    const parsed = JSON.parse(fs.readFileSync(identityPath, "utf8"));
    if (typeof parsed.ownerSecret === "string" && typeof parsed.ttlHours === "number") {
      return { identity: parsed as NodeIdentity, wasCreated: false };
    }
  }
  const identity: NodeIdentity = { ownerSecret: generateSecret(), ttlHours: defaultTtlHours };
  saveIdentity(identityPath, identity);
  return { identity, wasCreated: true };
}

export function saveIdentity(identityPath: string, identity: NodeIdentity): void {
  fs.mkdirSync(path.dirname(identityPath), { recursive: true });
  fs.writeFileSync(identityPath, JSON.stringify(identity, null, 2), "utf8");
}

/**
 * unpruuf Business Temp Node (NODE_MESH_SPEC.md §7, §8) — a fresh identity that is never written
 * to disk at all, not even once. Used when this process is started with EPHEMERAL=1: a Temp Node
 * is explicitly meant to hold no state past the session it's used for ("Temp-Node-Session-Daten
 * werden gelöscht (RAM-only, wie der reguläre Node-Speicher auch)" — §7 step 8), so unlike
 * [loadOrCreateIdentity] there is no restart-keeps-the-same-secret behavior here: every restart
 * of an ephemeral process is a brand new node identity by design.
 */
export function createEphemeralIdentity(defaultTtlHours: number = DEFAULT_TTL_HOURS): NodeIdentity {
  return { ownerSecret: generateSecret(), ttlHours: defaultTtlHours };
}

/** Forces a fresh owner secret (e.g. "this device was lost/compromised") while keeping the TTL.
 *  Every one of the owner's own app instances must be updated with the new secret afterward —
 *  unlike the consumer relay's token, there is no "hand it to a new contact" flow to reuse here. */
export function regenerateSecret(identityPath: string, current: NodeIdentity): NodeIdentity {
  const next: NodeIdentity = { ...current, ownerSecret: generateSecret() };
  saveIdentity(identityPath, next);
  return next;
}
