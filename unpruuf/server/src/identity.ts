import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { DEFAULT_TTL_HOURS } from "./config";

export interface RelayIdentity {
  /** Random bearer token — required on every /v1/relay and /v1/fetch call (see middleware/auth.ts). */
  authToken: string;
  /** How long a queued blob is kept before the sweep deletes it. */
  ttlHours: number;
}

function generateToken(): string {
  // 32 random bytes, base64url (no +/= to worry about when it's typed by hand or put in a URI).
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Loads the persisted identity at [identityPath], or creates and persists a new one if none
 * exists yet — so restarting the server keeps the same token and doesn't strand already-paired
 * clients. [defaultTtlHours] is only used the first time (when there's nothing to load yet).
 */
export function loadOrCreateIdentity(identityPath: string, defaultTtlHours: number = DEFAULT_TTL_HOURS): {
  identity: RelayIdentity;
  wasCreated: boolean;
} {
  if (fs.existsSync(identityPath)) {
    const parsed = JSON.parse(fs.readFileSync(identityPath, "utf8"));
    if (typeof parsed.authToken === "string" && typeof parsed.ttlHours === "number") {
      return { identity: parsed as RelayIdentity, wasCreated: false };
    }
    // Malformed file (shouldn't happen outside manual editing) — fall through and regenerate.
  }
  const identity: RelayIdentity = { authToken: generateToken(), ttlHours: defaultTtlHours };
  saveIdentity(identityPath, identity);
  return { identity, wasCreated: true };
}

export function saveIdentity(identityPath: string, identity: RelayIdentity): void {
  fs.mkdirSync(path.dirname(identityPath), { recursive: true });
  fs.writeFileSync(identityPath, JSON.stringify(identity, null, 2), "utf8");
}

/** Forces a fresh token (e.g. "credentials compromised, rotate them") while keeping the TTL. */
export function regenerateToken(identityPath: string, current: RelayIdentity): RelayIdentity {
  const next: RelayIdentity = { ...current, authToken: generateToken() };
  saveIdentity(identityPath, next);
  return next;
}
