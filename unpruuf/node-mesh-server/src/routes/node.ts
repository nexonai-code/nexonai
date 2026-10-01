import { Router } from "express";
import { NodeStore } from "../store/nodeStore";
import { MAX_BLOB_BYTES, MAX_FETCH_MANY_TAGS, MAX_WAIT_MS } from "../config";
import { OwnerSecretSource, requireOwner } from "../middleware/ownerAuth";
import { rateLimited, TokenBucket } from "../middleware/rateLimit";

const TAG_RE = /^[A-Za-z0-9+/=_-]{1,64}$/;

/**
 * NODE_MESH_SPEC.md §8's API surface — deliberately just these three routes, mirroring the
 * consumer relay's wire format (`{"blobs": [...]}` / `{"blobs": {"<tag>": [...]}}`) so a client
 * that already speaks that format needs no new parsing logic, only a different auth/delete
 * contract per endpoint (see each route's own comment for what changed and why).
 */
/** Sealed-key servers only (nodeIdentity.ts): lets the owner app see and lift the lock. */
export interface LockControl {
  isLocked: () => boolean;
  /** Checks the presented owner secret and, if right, publishes the node onions. Resolves with
   *  every node address, or null for a wrong secret. */
  unlock: (ownerSecret: string) => Promise<string[] | null>;
  controlAddress: () => string | null;
}

export function nodeRouter(
  store: NodeStore,
  ownerSecret: OwnerSecretSource,
  addresses: () => string[] = () => [],
  lock?: LockControl,
): Router {
  const router = Router();
  const fetchRateLimit = new TokenBucket(30, 5); // burst of 30, refills 5/sec
  const poolRateLimit = new TokenBucket(5, 1);
  const unlockRateLimit = new TokenBucket(5, 0.2);

  // Owner-only: every onion address this process serves. The owner's app scans ONE address +
  // the owner secret and learns all sibling nodes here, so a server with hundreds of nodes still
  // needs only one QR. Contacts never call this — they only ever learn the nodes assigned to them.
  // `control` (sealed servers) is the address the app reaches this server at after a restart.
  router.get("/pool", rateLimited(poolRateLimit), requireOwner(ownerSecret), (_req, res) => {
    const control = lock?.controlAddress() ?? null;
    return res.status(200).json(control ? { control, addresses: addresses() } : { addresses: addresses() });
  });

  // Sealed servers: no secret needed to ASK — the app checks this on the control onion without
  // sending anything secret, so a stranger answering on a stolen control address learns nothing.
  router.get("/lock-status", rateLimited(poolRateLimit), (_req, res) => {
    return res.status(200).json({ locked: lock ? lock.isLocked() : false });
  });

  // Sealed servers: the owner app sends the owner secret after the user confirmed it.
  router.post("/unlock", rateLimited(unlockRateLimit), async (req, res) => {
    if (!lock) return res.status(404).json({ error: "not a sealed server" });
    const header = req.header("authorization") ?? "";
    const secret = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
    const result = secret ? await lock.unlock(secret).catch(() => null) : null;
    if (!result) return res.status(401).json({ error: "unauthorized" });
    return res.status(200).json({ unlocked: true, addresses: result });
  });

  // Owner-only — see ownerAuth.ts's doc comment. No contact, no stranger who merely learns this
  // node's address can ever write here, regardless of whether they know a valid routing_tag.
  router.put("/deposit", requireOwner(ownerSecret), (req, res) => {
    const { routing_tag, ciphertext, ttl } = req.body ?? {};
    if (typeof routing_tag !== "string" || !TAG_RE.test(routing_tag)) {
      return res.status(400).json({ error: "invalid routing_tag" });
    }
    if (typeof ciphertext !== "string" || ciphertext.length === 0) {
      return res.status(400).json({ error: "invalid ciphertext" });
    }
    let decodedLength: number;
    try {
      decodedLength = Buffer.from(ciphertext, "base64").length;
    } catch {
      return res.status(400).json({ error: "ciphertext is not valid base64" });
    }
    if (decodedLength === 0 || decodedLength > MAX_BLOB_BYTES) {
      return res.status(413).json({ error: `ciphertext must be 1..${MAX_BLOB_BYTES} bytes` });
    }
    let ttlMs: number | undefined;
    if (ttl !== undefined) {
      if (typeof ttl !== "number" || !Number.isFinite(ttl) || ttl <= 0) {
        return res.status(400).json({ error: "invalid ttl" });
      }
      ttlMs = ttl;
    }
    const stored = store.put(routing_tag, ciphertext, ttlMs);
    if (!stored) {
      return res.status(429).json({ error: "tag queue full" });
    }
    return res.status(201).json({ stored: true });
  });

  // Read-only — no auth token. The routing_tag itself is the access credential (see
  // NODE_MESH_SPEC.md §2): it's HKDF-derived from the pairing secret, so knowing a valid one
  // already proves the caller was paired. Never deletes what it returns (§4) — only the TTL
  // sweep (nodeStore.ts) ever removes a row.
  router.get("/fetch", rateLimited(fetchRateLimit), (req, res) => {
    const tag = req.query.tag;
    if (typeof tag !== "string" || !TAG_RE.test(tag)) {
      return res.status(400).json({ error: "invalid tag" });
    }
    const blobs = store.fetchAll(tag);
    return res.status(200).json({ blobs });
  });

  // Batched + optionally long-polling sibling of GET /fetch — same contract as the consumer
  // relay's POST /v1/fetchMany (server/src/routes/relay.ts), reused deliberately so a client
  // already speaking that format needs no new parsing. Read-only here too — see GET /fetch above.
  router.post("/fetchMany", rateLimited(fetchRateLimit), async (req, res) => {
    const { tags, waitMs, since } = req.body ?? {};
    if (!Array.isArray(tags) || tags.length === 0 || tags.length > MAX_FETCH_MANY_TAGS) {
      return res.status(400).json({ error: `tags must be a non-empty array of at most ${MAX_FETCH_MANY_TAGS}` });
    }
    if (!tags.every((t): t is string => typeof t === "string" && TAG_RE.test(t))) {
      return res.status(400).json({ error: "invalid tag in list" });
    }
    const wait = typeof waitMs === "number" && Number.isFinite(waitMs)
      ? Math.max(0, Math.min(waitMs, MAX_WAIT_MS))
      : 0;

    // Optional cursor: only blobs newer than what this client already has. Without it the
    // response is every unexpired blob, exactly as before. With it, `cursor` comes back FIRST in
    // the JSON so clients that parse `blobs` as the last object keep working.
    const sinceId = typeof since === "number" && Number.isInteger(since) && since >= 0 ? since : null;

    const takeAll = (): Record<string, string[]> => {
      const result: Record<string, string[]> = {};
      for (const tag of tags as string[]) {
        result[tag] = sinceId === null ? store.fetchAll(tag) : store.fetchSince(tag, sinceId);
      }
      return result;
    };

    let blobs = takeAll();
    let cursor = store.currentCursor();
    if (wait > 0 && Object.values(blobs).every((v) => v.length === 0)) {
      await store.waitForAny(tags as string[], wait);
      blobs = takeAll();
      cursor = store.currentCursor();
    }
    return res.status(200).json(sinceId === null ? { blobs } : { cursor, blobs });
  });

  return router;
}
