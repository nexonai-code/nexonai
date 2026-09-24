import Database from "better-sqlite3";
import { EventEmitter } from "events";
import { DEFAULT_TTL_HOURS, MAX_BLOBS_PER_TAG } from "../config";
import { getSqliteNativeBinding } from "../sqliteNativeBinding";

/**
 * Owner-only, blind store for the unpruuf Business Node-Mesh (NODE_MESH_SPEC.md). Structurally
 * different from the consumer relay's BlobStore in exactly the ways the spec calls for:
 *
 *   - `put()` is meant to be called only by the owner's own app instance(s) — enforced at the
 *     HTTP layer (see middleware/ownerAuth.ts), not here; this class itself has no notion of who
 *     is calling it, same blindness principle as the consumer relay.
 *   - `fetchAll()`/`fetchMany()` are READ-ONLY. No delete-on-fetch — §4's whole point is that a
 *     contact fetching from MY node never gets any capability beyond reading, not even an
 *     implicit delete. The ONLY thing that ever removes a row is `sweepExpired()` (TTL).
 *   - No `wipeAll()` "delete everything" — nothing in the spec calls for one, and adding one
 *     would just be an unused way to hand out destructive capability that doesn't need to exist.
 */
export class NodeStore {
  private db: Database.Database;
  private ttlMs: number;
  // Backs /fetchMany's optional long-poll — same purely-local "wake up sooner" optimization as
  // the consumer relay's BlobStore.waitForAny: a missed event just means the next regular poll
  // still finds it, since the immediate re-check fetchMany always does after waiting runs
  // regardless of this.
  private events = new EventEmitter().setMaxListeners(0);

  constructor(dbPath: string, ttlHours: number = DEFAULT_TTL_HOURS) {
    this.ttlMs = ttlHours * 60 * 60 * 1000;
    // Only set for the standalone .exe build (see sea-entry.ts/sqliteNativeBinding.ts) — every
    // other entry point (npm start, ts-node, tests) leaves this undefined and better-sqlite3
    // falls back to its normal auto-discovery, exactly as before this override existed.
    const nativeBinding = getSqliteNativeBinding();
    const options = nativeBinding ? ({ nativeBinding } as unknown as Database.Options) : undefined;
    this.db = new Database(dbPath, options);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS blobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tag TEXT NOT NULL,
        blob TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_blobs_tag ON blobs(tag);
      CREATE INDEX IF NOT EXISTS idx_blobs_expires_at ON blobs(expires_at);
    `);
  }

  /**
   * Deposits one blob under [tag]. [ttlMs] lets a single deposit ask for a shorter lifetime than
   * this node's configured default (never longer — capped at the node's own TTL, an individual
   * deposit can't override the node operator's retention policy upward). Returns false (and
   * stores nothing) if [tag]'s queue is already at capacity — see config.ts's MAX_BLOBS_PER_TAG
   * doc comment for why that cap needed re-checking now that fetch no longer drains it.
   */
  put(tag: string, blobBase64: string, ttlMs?: number): boolean {
    const count = this.db.prepare("SELECT COUNT(*) as n FROM blobs WHERE tag = ?").get(tag) as { n: number };
    if (count.n >= MAX_BLOBS_PER_TAG) return false;
    const now = Date.now();
    const effectiveTtlMs = ttlMs !== undefined ? Math.min(ttlMs, this.ttlMs) : this.ttlMs;
    this.db
      .prepare("INSERT INTO blobs (tag, blob, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .run(tag, blobBase64, now, now + effectiveTtlMs);
    this.events.emit(`tag:${tag}`);
    return true;
  }

  /** Read-only: returns every currently-unexpired blob queued for [tag], oldest first. Deletes
   *  nothing — see this class's doc comment for why. */
  fetchAll(tag: string): string[] {
    return this.fetchAllWithMeta(tag).map((r) => r.blob);
  }

  /** Same as [fetchAll], plus each blob's `createdAt` for dwell-time reporting (see an
   *  operator-facing log, if one is added later — not part of this phase). Excludes rows past
   *  their own `expires_at` even if the periodic sweep hasn't reached them yet, so a fetch never
   *  returns something that's logically already expired. */
  fetchAllWithMeta(tag: string): { blob: string; createdAt: number }[] {
    const now = Date.now();
    const rows = this.db
      .prepare("SELECT blob, created_at FROM blobs WHERE tag = ? AND expires_at > ? ORDER BY id ASC")
      .all(tag, now) as { blob: string; created_at: number }[];
    return rows.map((r) => ({ blob: r.blob, createdAt: r.created_at }));
  }

  /**
   * Blocks (via the returned Promise) until any of [tags] has a new blob, or [timeoutMs] elapses
   * — whichever comes first. Never rejects. Mirrors the consumer relay's BlobStore.waitForAny
   * exactly — see routes/node.ts's fetchMany handler for why the caller must always re-check the
   * actual queues after this resolves rather than trust which tag fired.
   */
  waitForAny(tags: string[], timeoutMs: number): Promise<void> {
    if (tags.length === 0 || timeoutMs <= 0) return Promise.resolve();
    const events = this.events;
    return new Promise((resolve) => {
      let done = false;
      let timer: ReturnType<typeof setTimeout>;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        for (const { tag, listener } of listeners) events.off(`tag:${tag}`, listener);
        resolve();
      };
      const listeners = tags.map((tag) => {
        const listener = () => finish();
        events.once(`tag:${tag}`, listener);
        return { tag, listener };
      });
      timer = setTimeout(finish, timeoutMs);
    });
  }

  /** The only deletion path — removes rows past their `expires_at`. Returns how many were
   *  removed. Runs on its own periodic timer (see index.ts) independent of Reset (see
   *  NODE_MESH_SPEC.md §5 — Reset never touches message data). */
  sweepExpired(now: number = Date.now()): number {
    const result = this.db.prepare("DELETE FROM blobs WHERE expires_at < ?").run(now);
    return result.changes;
  }

  /** Operator-facing snapshot — counts and oldest-entry age only, never tags or blobs, matching
   *  the node's own blindness (it must stay consistent with itself even when read by its owner). */
  stats(now: number = Date.now()): { queued: number; tags: number; oldestAgeMs: number | null } {
    const row = this.db
      .prepare("SELECT COUNT(*) AS queued, COUNT(DISTINCT tag) AS tags, MIN(created_at) AS oldest FROM blobs")
      .get() as { queued: number; tags: number; oldest: number | null };
    return {
      queued: row.queued,
      tags: row.tags,
      oldestAgeMs: row.oldest === null ? null : now - row.oldest,
    };
  }

  /** Real, honest SQLite housekeeping for this process shape — see index.ts's Reset doc comment
   *  for why this stands in for "connection/socket hygiene" here specifically (a single
   *  synchronous better-sqlite3 connection has no pool to recycle). Folds the WAL file back into
   *  the main database file, keeping long-term disk usage bounded on a long-running node. */
  checkpointWal(): void {
    this.db.pragma("wal_checkpoint(PASSIVE)");
  }

  close(): void {
    this.db.close();
  }
}
