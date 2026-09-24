import Database from "better-sqlite3";
import { EventEmitter } from "events";
import { DEFAULT_TTL_HOURS, MAX_BLOBS_PER_TAG } from "../config";
import { getSqliteNativeBinding } from "../sqliteNativeBinding";

/**
 * Blind store-and-forward queue, addressed only by the sender's rotating wire tag (see
 * IdentityManager.myWireId in the Android app). The relay never learns contact identity or
 * message content beyond an already Double-Ratchet-encrypted, opaque blob — same pseudonymity
 * model as the direct P2P path, just with a mailbox instead of a live socket.
 */
export class BlobStore {
  private db: Database.Database;
  private ttlMs: number;
  // Backs /v1/fetchMany's optional long-poll (see routes/relay.ts) — a client can wait on
  // several tags at once instead of blindly re-polling every few seconds. One process-local
  // emitter, not persisted: a missed event just means the next regular poll (or the next
  // fetchMany call's own immediate check, which always runs regardless of this) still finds it,
  // since this is purely a "wake up sooner" optimization, never the only way data is found.
  // Unbounded listener count on purpose — one listener per concurrently-waiting fetchMany call
  // per tag, and a busy relay can legitimately have many of both.
  private events = new EventEmitter().setMaxListeners(0);

  /** [ttlHours] is operator-configurable — see identity.ts; defaults to DEFAULT_TTL_HOURS. */
  constructor(dbPath: string, ttlHours: number = DEFAULT_TTL_HOURS) {
    this.ttlMs = ttlHours * 60 * 60 * 1000;
    const nativeBinding = getSqliteNativeBinding();
    // @types/better-sqlite3 types `Options.nativeBinding` as `string` only, but the actual
    // runtime (lib/database.js) also accepts an already-loaded addon object — confirmed by
    // reading that file directly, not assumed. The types just haven't caught up.
    const options = nativeBinding ? ({ nativeBinding } as unknown as Database.Options) : undefined;
    this.db = new Database(dbPath, options);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS blobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tag TEXT NOT NULL,
        blob TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_blobs_tag ON blobs(tag);
    `);
  }

  /** Returns false (and stores nothing) if the tag's queue is already at capacity. */
  put(tag: string, blobBase64: string): boolean {
    const count = this.db.prepare("SELECT COUNT(*) as n FROM blobs WHERE tag = ?").get(tag) as { n: number };
    if (count.n >= MAX_BLOBS_PER_TAG) return false;
    this.db
      .prepare("INSERT INTO blobs (tag, blob, created_at) VALUES (?, ?, ?)")
      .run(tag, blobBase64, Date.now());
    this.events.emit(`tag:${tag}`);
    return true;
  }

  /**
   * Resolves as soon as ANY of [tags] receives a new blob, or after [timeoutMs] — whichever
   * comes first. Never rejects. The caller must always re-check the actual queues after this
   * resolves (see routes/relay.ts) rather than trust which tag fired: several could have arrived
   * at once, and a timeout resolves the same way a real arrival does.
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

  /** Atomically returns and deletes every blob queued for [tag], oldest first. */
  takeAll(tag: string): string[] {
    return this.takeAllWithMeta(tag).map((r) => r.blob);
  }

  /**
   * Same atomic take-and-delete as [takeAll], but also returns each blob's `createdAt` so the
   * caller can report how long it sat queued before pickup (see `relayEventLog.ts` — that dwell
   * time is the single most useful number for an operator diagnosing "are messages arriving but
   * not being collected, or not arriving at all?"). [takeAll] delegates here so there is only
   * one copy of the transaction logic.
   */
  takeAllWithMeta(tag: string): { blob: string; createdAt: number }[] {
    const take = this.db.transaction((t: string) => {
      const rows = this.db
        .prepare("SELECT id, blob, created_at FROM blobs WHERE tag = ? ORDER BY id ASC")
        .all(t) as { id: number; blob: string; created_at: number }[];
      if (rows.length > 0) {
        const del = this.db.prepare("DELETE FROM blobs WHERE id = ?");
        for (const row of rows) del.run(row.id);
      }
      return rows.map((r) => ({ blob: r.blob, createdAt: r.created_at }));
    });
    return take(tag);
  }

  /**
   * Operator-facing snapshot of what is currently waiting to be collected — backs the `--status`
   * command and the running relay's periodic heartbeat. Deliberately aggregate-only: counts and
   * the age of the oldest item, never tags or blobs, so reading it stays consistent with the
   * relay's blindness to who is talking to whom.
   */
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

  /** Deletes blobs older than this store's configured TTL. Returns how many were removed. */
  sweepExpired(now: number = Date.now()): number {
    const cutoff = now - this.ttlMs;
    const result = this.db.prepare("DELETE FROM blobs WHERE created_at < ?").run(cutoff);
    return result.changes;
  }

  close(): void {
    this.db.close();
  }
}
