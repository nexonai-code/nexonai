import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { DEFAULT_TTL_HOURS } from "./config";

/**
 * Where the owner secret and the node onion keys live between restarts:
 *
 *  - "sealed" (default): NEVER on disk in readable form. The file only holds them encrypted
 *    (AES-256-GCM) under a key derived from the owner secret, which itself is not stored at all.
 *    After a restart the server is LOCKED: it publishes only its control onion and waits until
 *    the owner's app sends the owner secret (POST /unlock). A seized, powered-off server
 *    therefore yields no usable node key — nobody can keep running its nodes under the same
 *    addresses. Cost: after every restart the owner taps "unlock" once in the app.
 *  - "disk": the pre-hardening behavior — secret and keys stored in plain JSON (mode 600), the
 *    server comes back on its own. For operators who need unattended restarts.
 */
export type KeyStorage = "sealed" | "disk";

export interface NodeIdentity {
  /**
   * Required on every PUT /deposit call — see middleware/ownerAuth.ts. Unlike the consumer
   * relay's bearer token, this is NEVER handed to a contact: it stays between this node and the
   * owner's own app instance(s) only (NODE_MESH_SPEC.md §1/§8). GET /fetch and POST /fetchMany
   * need no token at all — the routing_tag itself is the read credential (§2).
   * Empty string while a sealed server is locked — then every owner-only route refuses.
   */
  ownerSecret: string;
  /** How long a deposited blob is kept before the TTL sweep removes it — the only deletion
   *  mechanism now that fetch no longer deletes (§4). */
  ttlHours: number;
  /** One Tor onion-service key (`ED25519-V3:<base64>`) per node this process serves, index =
   *  node number. Created on first start and reused after, so no node's .onion address ever
   *  changes (NODE_MESH_SPEC.md §5). In sealed mode they exist in memory only, after unlock. */
  onionKeys?: string[];
  /** Pre-multi-node files stored a single key here; read once and moved into [onionKeys]. */
  onionKey?: string;
  /** Sealed mode only: the control onion's key. Stored in plain form on purpose — the control
   *  onion carries no messages and its address is known only to the owner's app; it exists so
   *  the app can reach a locked server to unlock it. */
  controlKey?: string;
  /** Sealed mode only: KDF salt and the node keys, encrypted under the owner secret. */
  salt?: string;
  sealed?: string;
  /** How this identity is persisted — see [KeyStorage]. Absent = "disk" (Temp Node: never). */
  keyStorage?: KeyStorage;
}

const SEAL_INFO = "unpruuf-node-seal-v1";

function generateSecret(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function sealKey(ownerSecret: string, saltB64: string): Buffer {
  return Buffer.from(crypto.hkdfSync("sha256", Buffer.from(ownerSecret, "utf8"), Buffer.from(saltB64, "base64"), SEAL_INFO, 32));
}

interface SealedPayload {
  onionKeys: string[];
}

export function seal(ownerSecret: string, saltB64: string, payload: SealedPayload): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", sealKey(ownerSecret, saltB64), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

/** Null when [ownerSecret] is wrong (GCM authentication fails) or the blob is damaged. */
export function openSealed(ownerSecret: string, saltB64: string, sealedB64: string): SealedPayload | null {
  try {
    const raw = Buffer.from(sealedB64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", sealKey(ownerSecret, saltB64), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(json);
    return { onionKeys: Array.isArray(parsed.onionKeys) ? parsed.onionKeys.filter((k: unknown) => typeof k === "string") : [] };
  } catch {
    return null;
  }
}

export function isLocked(identity: NodeIdentity): boolean {
  return identity.ownerSecret.length === 0;
}

/**
 * Loads the persisted identity at [identityPath], or creates and persists a new one if none
 * exists yet. [defaultTtlHours] (the active profile's TTL) always wins over a previously saved
 * value. In sealed mode an existing file comes back LOCKED (ownerSecret = "") — see
 * [unlockIdentity]; a plain file from an older version is converted to sealed on the spot
 * (its addresses stay the same) and comes back unlocked for this run.
 */
export function loadOrCreateIdentity(
  identityPath: string,
  defaultTtlHours: number = DEFAULT_TTL_HOURS,
  storage: KeyStorage = "disk",
): { identity: NodeIdentity; wasCreated: boolean } {
  if (fs.existsSync(identityPath)) {
    const parsed = JSON.parse(fs.readFileSync(identityPath, "utf8"));
    if (typeof parsed.sealed === "string" && typeof parsed.salt === "string" && typeof parsed.ttlHours === "number") {
      const identity: NodeIdentity = {
        ownerSecret: "",
        ttlHours: defaultTtlHours,
        salt: parsed.salt,
        sealed: parsed.sealed,
        controlKey: typeof parsed.controlKey === "string" ? parsed.controlKey : undefined,
        keyStorage: "sealed",
      };
      if (parsed.ttlHours !== defaultTtlHours) writeFile(identityPath, { ...parsed, ttlHours: defaultTtlHours });
      return { identity, wasCreated: false };
    }
    if (typeof parsed.ownerSecret === "string" && typeof parsed.ttlHours === "number") {
      const identity = parsed as NodeIdentity;
      if (identity.onionKey && !identity.onionKeys) {
        identity.onionKeys = [identity.onionKey];
      }
      delete identity.onionKey;
      // The deployment profile (config.ts) is authoritative for retention — switching profile
      // and restarting must take effect, not be shadowed by the value saved on first start.
      identity.ttlHours = defaultTtlHours;
      identity.keyStorage = storage;
      saveIdentity(identityPath, identity);
      return { identity, wasCreated: false };
    }
  }
  const identity: NodeIdentity = { ownerSecret: generateSecret(), ttlHours: defaultTtlHours, keyStorage: storage };
  saveIdentity(identityPath, identity);
  return { identity, wasCreated: true };
}

/** Sealed mode: checks [ownerSecret] against the sealed blob and, if it opens it, puts the
 *  secret and the node keys into [identity] (memory only). False for a wrong secret. An
 *  already unlocked identity only compares the secret. */
export function unlockIdentity(identity: NodeIdentity, ownerSecret: string): boolean {
  if (!ownerSecret) return false;
  if (!isLocked(identity)) return timingSafeStringEqual(identity.ownerSecret, ownerSecret);
  if (!identity.salt || !identity.sealed) return false;
  const payload = openSealed(ownerSecret, identity.salt, identity.sealed);
  if (!payload) return false;
  identity.ownerSecret = ownerSecret;
  identity.onionKeys = payload.onionKeys;
  return true;
}

/**
 * Persists [identity]. Disk mode writes it as is. Sealed mode writes only the TTL, the control
 * key, the salt and a fresh seal of the node keys under the current owner secret — never the
 * secret or a node key in readable form. While locked there is nothing new to seal, so the
 * previous seal is kept unchanged.
 */
export function saveIdentity(identityPath: string, identity: NodeIdentity): void {
  if (identity.keyStorage !== "sealed") {
    const { salt: _s, sealed: _x, controlKey: _c, ...plain } = identity;
    writeFile(identityPath, plain);
    return;
  }
  if (!isLocked(identity)) {
    identity.salt = identity.salt ?? crypto.randomBytes(16).toString("base64");
    identity.sealed = seal(identity.ownerSecret, identity.salt, { onionKeys: identity.onionKeys ?? [] });
  }
  writeFile(identityPath, {
    keyStorage: "sealed",
    ttlHours: identity.ttlHours,
    controlKey: identity.controlKey,
    salt: identity.salt,
    sealed: identity.sealed,
  });
}

function writeFile(identityPath: string, data: object): void {
  fs.mkdirSync(path.dirname(identityPath), { recursive: true });
  const tmp = `${identityPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, identityPath);
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

/** Forces a fresh owner secret (e.g. "this device was lost/compromised") while keeping the TTL
 *  and every node address. Every one of the owner's own app instances must be updated with the
 *  new secret afterward. Not possible while locked. */
export function regenerateSecret(identityPath: string, current: NodeIdentity): NodeIdentity {
  if (isLocked(current)) throw new Error("locked");
  const next: NodeIdentity = { ...current, ownerSecret: generateSecret() };
  saveIdentity(identityPath, next);
  return next;
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}
