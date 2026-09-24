import { Router } from "express";
import { BlobStore } from "../store/blobStore";
import { MAX_BLOB_BYTES, MAX_FETCH_MANY_TAGS, MAX_WAIT_MS } from "../config";
import { requireAuth } from "../middleware/auth";
import { base64DecodedLength, logFetched, logRejected, logStored } from "../relayEventLog";

const TAG_RE = /^[A-Za-z0-9+/=_-]{1,64}$/;

export function relayRouter(store: BlobStore, authToken: string): Router {
  const router = Router();
  router.use(requireAuth(authToken));

  // Store one opaque blob under the sender's current wire tag for the recipient to pull later.
  router.post("/v1/relay", (req, res) => {
    const { tag, blob } = req.body ?? {};
    if (typeof tag !== "string" || !TAG_RE.test(tag)) {
      logRejected(typeof tag === "string" ? tag : "?", "invalid tag");
      return res.status(400).json({ error: "invalid tag" });
    }
    if (typeof blob !== "string" || blob.length === 0) {
      logRejected(tag, "invalid blob");
      return res.status(400).json({ error: "invalid blob" });
    }
    let decodedLength: number;
    try {
      decodedLength = Buffer.from(blob, "base64").length;
    } catch {
      logRejected(tag, "blob is not valid base64");
      return res.status(400).json({ error: "blob is not valid base64" });
    }
    if (decodedLength === 0 || decodedLength > MAX_BLOB_BYTES) {
      logRejected(tag, `blob size ${decodedLength} outside 1..${MAX_BLOB_BYTES}`);
      return res.status(413).json({ error: `blob must be 1..${MAX_BLOB_BYTES} bytes` });
    }
    const stored = store.put(tag, blob);
    if (!stored) {
      logRejected(tag, "tag queue full");
      return res.status(429).json({ error: "tag queue full" });
    }
    logStored(tag, decodedLength);
    return res.status(201).json({ stored: true });
  });

  // Pull-and-delete every blob queued for a tag. No history, no read log.
  router.get("/v1/fetch", (req, res) => {
    const tag = req.query.tag;
    if (typeof tag !== "string" || !TAG_RE.test(tag)) {
      logRejected(typeof tag === "string" ? tag : "?", "invalid tag");
      return res.status(400).json({ error: "invalid tag" });
    }
    // Metadata variant so the operator log can report how long these sat queued — see
    // `relayEventLog.ts`. The response body itself is unchanged.
    const rows = store.takeAllWithMeta(tag);
    const blobs = rows.map((r) => r.blob);
    // Deliberately silent on an empty fetch: every connected client polls every 20 seconds, so
    // logging those would bury the events that actually matter within seconds.
    if (rows.length > 0) {
      const now = Date.now();
      const totalBytes = rows.reduce((sum, r) => sum + base64DecodedLength(r.blob), 0);
      const avgDwellMs = rows.reduce((sum, r) => sum + (now - r.createdAt), 0) / rows.length;
      logFetched(tag, rows.length, totalBytes, avgDwellMs);
    }
    return res.status(200).json({ blobs });
  });

  // Batched + optionally long-polling sibling of GET /v1/fetch — added 2026-09-17 so a client
  // with several contacts (each with its own hour ± tolerance and up to 3 relay entries) can
  // check everything in ONE request instead of one round-trip per tag, and can let the relay
  // hold the connection open for a while instead of blindly re-polling every few seconds. Kept
  // as a separate endpoint rather than changing /v1/fetch's contract, so an already-deployed
  // client or relay instance that only knows the old endpoint keeps working unmodified.
  router.post("/v1/fetchMany", async (req, res) => {
    const { tags, waitMs } = req.body ?? {};
    if (!Array.isArray(tags) || tags.length === 0 || tags.length > MAX_FETCH_MANY_TAGS) {
      return res.status(400).json({ error: `tags must be a non-empty array of at most ${MAX_FETCH_MANY_TAGS}` });
    }
    if (!tags.every((t): t is string => typeof t === "string" && TAG_RE.test(t))) {
      return res.status(400).json({ error: "invalid tag in list" });
    }
    const wait = typeof waitMs === "number" && Number.isFinite(waitMs)
      ? Math.max(0, Math.min(waitMs, MAX_WAIT_MS))
      : 0;

    const takeAll = (): Record<string, string[]> => {
      const result: Record<string, string[]> = {};
      for (const tag of tags as string[]) {
        const rows = store.takeAllWithMeta(tag);
        result[tag] = rows.map((r) => r.blob);
        if (rows.length > 0) {
          const now = Date.now();
          const totalBytes = rows.reduce((sum, r) => sum + base64DecodedLength(r.blob), 0);
          const avgDwellMs = rows.reduce((sum, r) => sum + (now - r.createdAt), 0) / rows.length;
          logFetched(tag, rows.length, totalBytes, avgDwellMs);
        }
      }
      return result;
    };

    let blobs = takeAll();
    if (wait > 0 && Object.values(blobs).every((v) => v.length === 0)) {
      await store.waitForAny(tags as string[], wait);
      blobs = takeAll();
    }
    return res.status(200).json({ blobs });
  });

  return router;
}
