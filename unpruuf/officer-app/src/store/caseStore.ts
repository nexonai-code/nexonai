import Database from "better-sqlite3";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { hkdfSha256, hmacSha256 } from "../crypto/primitives";
import { OfficerIdentity } from "../officer/officerIdentity";

/**
 * The compliance-officer's local case management store. This is the layer that makes the
 * product a genuine EU Directive 2019/1937 whistleblowing channel rather than just an anonymous
 * chat: a case row exists independently of unpruuf's RAM-only/5-minute-TTL consumer messaging
 * model (see COMPLIANCE.md's "compliance by architecture" framing — that framing is about the
 * RELAY never seeing plaintext or identity, which still holds here; it was never a promise that
 * nothing case-relevant is ever persisted ANYWHERE, and a real whistleblowing channel legally
 * can't make that promise: Art. 9(1) of the Directive requires acknowledging receipt within 7
 * days and following up within a reasonable timeframe not exceeding 3 months, which is
 * impossible without some durable, officer-side record of what came in and when).
 *
 * Sensitive columns (the case's crypto material — reporter's message key/ratchet public key/
 * relay pool/ratchet session state, and every message body) are AES-256-GCM-encrypted at rest
 * with a key derived from the officer's own already-password-unlocked identity (see
 * deriveDbKey) — never written in plaintext to disk. Deliberately NOT encrypted: case id,
 * status, category, timestamps — needed for SQL ordering/filtering, and knowing "3 cases exist,
 * opened on these dates" without the password is an accepted v1 scope boundary, not a design
 * goal (see officer-app/README.md's "known gaps" section).
 */

export interface CaseSecrets {
  reporterUserId: string;
  reporterMessageKeyB64: string;
  reporterX25519PublicKeyB64: string;
  reporterRelayConnectionStrings: string[];
  reporterWireIdentity: string | null;
  myGeneration: number;
  theirGeneration: number;
  ratchet: {
    dhsPrivateKeyB64: string;
    dhsPublicKeyB64: string;
    dhrB64: string | null;
    rootKeyB64: string;
    sendChainKeyB64: string | null;
    recvChainKeyB64: string | null;
    sendCount: number;
    recvCount: number;
    previousChainLength: number;
    skippedKeysB64: Record<string, string>;
  };
}

export type CaseStatus = "new" | "acknowledged" | "in_progress" | "closed";

export interface CaseRow {
  id: string;
  /** What the reporter sees in their app ("HW-7Q4M-2X9D"). Random, see caseIntake.ts. */
  caseNumber: string | null;
  /** A receipt/status update is owed to the reporter but couldn't be sent yet (the ratchet has
   *  no sending chain until the reporter's first message arrives, or the relay was down). */
  signalPending: boolean;
  status: CaseStatus;
  category: string | null;
  openedAt: number;
  ackDueAt: number;
  feedbackDueAt: number;
  acknowledgedAt: number | null;
  closedAt: number | null;
  lastActivityAt: number;
  /** safeline Press: the research (own code) this tip came in through. Null = the general code. */
  rechercheId: string | null;
}

/** safeline Press: one research (an article, a topic) with its own contact code. Each has its
 *  own officer identity, so the code differs, the letterbox differs and two researches cannot be
 *  tied together from the code alone. */
export interface RechercheRow {
  id: string;
  name: string;
  /** Paused = new tips through this code are ignored; tips already received stay fully usable. */
  active: boolean;
  createdAt: number;
}

export interface CaseMessage {
  id: number;
  caseId: string;
  direction: "in" | "out";
  text: string;
  createdAt: number;
}

/** EU Directive 2019/1937 Art. 9(1)(a): acknowledge receipt within 7 days. */
const ACK_DEADLINE_MS = 7 * 24 * 60 * 60 * 1000;
/** Art. 9(1)(f): follow up within a reasonable timeframe, not exceeding 3 months. */
const FEEDBACK_DEADLINE_MS = 90 * 24 * 60 * 60 * 1000;

export function deriveDbKey(identity: OfficerIdentity): Uint8Array {
  return hkdfSha256(identity.x25519PrivateKey, identity.messageKey, new TextEncoder().encode("unpruuf-officer-db-key-v1"), 32);
}

function encryptJson(dbKey: Uint8Array, value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dbKey, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, tag]).toString("base64");
}

function decryptJson<T>(dbKey: Uint8Array, blobB64: string): T {
  const blob = Buffer.from(blobB64, "base64");
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(blob.length - 16);
  const ciphertext = blob.subarray(12, blob.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", dbKey, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

export class CaseStore {
  private db: Database.Database;
  private dbKey: Uint8Array;

  constructor(dbPath: string, dbKey: Uint8Array) {
    this.dbKey = dbKey;
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cases (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        category TEXT,
        opened_at INTEGER NOT NULL,
        ack_due_at INTEGER NOT NULL,
        feedback_due_at INTEGER NOT NULL,
        acknowledged_at INTEGER,
        closed_at INTEGER,
        last_activity_at INTEGER NOT NULL,
        secret_blob TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS case_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_id TEXT NOT NULL,
        direction TEXT NOT NULL,
        body_blob TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_case_messages_case_id ON case_messages(case_id);
      -- One row holding every already-known reporter identity candidate this officer should
      -- poll for, independent of which case (if any) it currently belongs to — lets the poll
      -- loop build its fetchMany tag list without decrypting every case's secret_blob on every
      -- round. Not itself secret (a wire tag reveals nothing about content or the real-world
      -- identity behind it — see COMPLIANCE.md).
      CREATE TABLE IF NOT EXISTS poll_candidates (
        case_id TEXT NOT NULL,
        identity TEXT NOT NULL,
        generation INTEGER NOT NULL,
        PRIMARY KEY (case_id, identity, generation)
      );
      -- safeline Press: researches with their own contact code. The officer identity of each
      -- research (its private key and message key) is stored encrypted like every other secret.
      CREATE TABLE IF NOT EXISTS recherchen (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        identity_blob TEXT NOT NULL
      );
    `);
    // Columns added with the organisation-wide QR / case numbers (2026-10-03). Older databases
    // get them on first start; existing cases receive a case number the first time one is needed.
    const columns = new Set((this.db.prepare(`PRAGMA table_info(cases)`).all() as { name: string }[]).map((c) => c.name));
    if (!columns.has("case_number")) this.db.exec(`ALTER TABLE cases ADD COLUMN case_number TEXT`);
    if (!columns.has("reporter_ref")) this.db.exec(`ALTER TABLE cases ADD COLUMN reporter_ref TEXT`);
    if (!columns.has("signal_pending")) this.db.exec(`ALTER TABLE cases ADD COLUMN signal_pending INTEGER NOT NULL DEFAULT 0`);
    // Column added with the per-research codes of safeline Press. Older databases get it on first start.
    if (!columns.has("recherche_id")) this.db.exec(`ALTER TABLE cases ADD COLUMN recherche_id TEXT`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_cases_reporter_ref ON cases(reporter_ref)`);
  }

  /** Keyed hash of the reporter's id — finds an existing case for a repeated intake without
   *  storing the id itself in a searchable plaintext column. */
  reporterRef(reporterUserId: string, rechercheId: string | null = null): string {
    // The same reporter can scan several research codes: one case per (reporter, research). For
    // the general code the input is unchanged, so existing databases keep working.
    const input = rechercheId ? `reporter:${reporterUserId}:recherche:${rechercheId}` : `reporter:${reporterUserId}`;
    return Buffer.from(hmacSha256(this.dbKey, new TextEncoder().encode(input))).toString("hex");
  }

  findCaseByReporter(reporterUserId: string, rechercheId: string | null = null): CaseRow | null {
    const row = this.db.prepare(`SELECT * FROM cases WHERE reporter_ref = ?`).get(this.reporterRef(reporterUserId, rechercheId)) as any;
    return row ? mapCaseRow(row) : null;
  }

  setCaseNumber(caseId: string, caseNumber: string): void {
    this.db.prepare(`UPDATE cases SET case_number = ? WHERE id = ?`).run(caseNumber, caseId);
  }

  setSignalPending(caseId: string, pending: boolean): void {
    this.db.prepare(`UPDATE cases SET signal_pending = ? WHERE id = ?`).run(pending ? 1 : 0, caseId);
  }

  casesWithPendingSignal(): string[] {
    return (this.db.prepare(`SELECT id FROM cases WHERE signal_pending = 1`).all() as { id: string }[]).map((r) => r.id);
  }

  /**
   * Creates a case from a reporter's pairing payload. Deliberately does NOT take an opening
   * message: pairing (pasting the reporter's code) and the actual first report text are two
   * separate events on the wire — the report arrives later (usually seconds later, but possibly
   * queued on the relay already) as a normal ratchet-encrypted message, ingested by the poll
   * loop exactly like every later message in the case (see officer/pollAndIngest.ts).
   */
  createCase(secrets: CaseSecrets, caseNumber: string | null = null, rechercheId: string | null = null): CaseRow {
    const now = Date.now();
    const row: CaseRow = {
      id: randomUUID(),
      caseNumber,
      signalPending: false,
      status: "new",
      category: null,
      openedAt: now,
      ackDueAt: now + ACK_DEADLINE_MS,
      feedbackDueAt: now + FEEDBACK_DEADLINE_MS,
      acknowledgedAt: null,
      closedAt: null,
      lastActivityAt: now,
      rechercheId,
    };
    const secretBlob = encryptJson(this.dbKey, secrets);
    this.db
      .prepare(
        `INSERT INTO cases (id, case_number, reporter_ref, signal_pending, status, category, opened_at, ack_due_at, feedback_due_at, acknowledged_at, closed_at, last_activity_at, secret_blob, recherche_id)
         VALUES (@id, @caseNumber, @reporterRef, 0, @status, @category, @openedAt, @ackDueAt, @feedbackDueAt, @acknowledgedAt, @closedAt, @lastActivityAt, @secretBlob, @rechercheId)`,
      )
      .run({
        id: row.id,
        caseNumber: row.caseNumber,
        reporterRef: this.reporterRef(secrets.reporterUserId, rechercheId),
        rechercheId,
        status: row.status,
        category: row.category,
        openedAt: row.openedAt,
        ackDueAt: row.ackDueAt,
        feedbackDueAt: row.feedbackDueAt,
        acknowledgedAt: row.acknowledgedAt,
        closedAt: row.closedAt,
        lastActivityAt: row.lastActivityAt,
        secretBlob,
      });
    this.refreshPollCandidates(row.id, secrets);
    return row;
  }

  // ───────── safeline Press: researches with their own code ─────────

  createRecherche(name: string, identity: OfficerIdentity): RechercheRow {
    const row: RechercheRow = { id: randomUUID(), name, active: true, createdAt: Date.now() };
    const blob = encryptJson(this.dbKey, {
      userId: identity.userId,
      messageKeyB64: Buffer.from(identity.messageKey).toString("base64"),
      x25519PrivateKeyB64: Buffer.from(identity.x25519PrivateKey).toString("base64"),
      x25519PublicKeyB64: Buffer.from(identity.x25519PublicKey).toString("base64"),
    });
    this.db.prepare(`INSERT INTO recherchen (id, name, active, created_at, identity_blob) VALUES (?, ?, 1, ?, ?)`).run(row.id, row.name, row.createdAt, blob);
    return row;
  }

  listRecherchen(): RechercheRow[] {
    const rows = this.db.prepare(`SELECT id, name, active, created_at FROM recherchen ORDER BY created_at ASC`).all() as any[];
    return rows.map((r) => ({ id: r.id, name: r.name, active: r.active === 1, createdAt: r.created_at }));
  }

  getRecherche(id: string): RechercheRow | null {
    const r = this.db.prepare(`SELECT id, name, active, created_at FROM recherchen WHERE id = ?`).get(id) as any;
    return r ? { id: r.id, name: r.name, active: r.active === 1, createdAt: r.created_at } : null;
  }

  getRechercheIdentity(id: string): OfficerIdentity | null {
    const r = this.db.prepare(`SELECT identity_blob FROM recherchen WHERE id = ?`).get(id) as any;
    if (!r) return null;
    const v = decryptJson<{ userId: string; messageKeyB64: string; x25519PrivateKeyB64: string; x25519PublicKeyB64: string }>(this.dbKey, r.identity_blob);
    return {
      userId: v.userId,
      messageKey: new Uint8Array(Buffer.from(v.messageKeyB64, "base64")),
      x25519PrivateKey: new Uint8Array(Buffer.from(v.x25519PrivateKeyB64, "base64")),
      x25519PublicKey: new Uint8Array(Buffer.from(v.x25519PublicKeyB64, "base64")),
    };
  }

  updateRecherche(id: string, patch: { name?: string; active?: boolean }): RechercheRow | null {
    if (!this.getRecherche(id)) return null;
    if (patch.name !== undefined) this.db.prepare(`UPDATE recherchen SET name = ? WHERE id = ?`).run(patch.name, id);
    if (patch.active !== undefined) this.db.prepare(`UPDATE recherchen SET active = ? WHERE id = ?`).run(patch.active ? 1 : 0, id);
    return this.getRecherche(id);
  }

  /** Number of tips per research (key "" = the general code). */
  countCasesByRecherche(): Map<string, number> {
    const rows = this.db.prepare(`SELECT recherche_id AS rid, COUNT(*) AS n FROM cases GROUP BY recherche_id`).all() as { rid: string | null; n: number }[];
    return new Map(rows.map((r) => [r.rid ?? "", r.n]));
  }

  /** Which research each case belongs to, in one query (the poll loop needs it every round). */
  caseRechercheIds(): Map<string, string | null> {
    const rows = this.db.prepare(`SELECT id, recherche_id AS rid FROM cases`).all() as { id: string; rid: string | null }[];
    return new Map(rows.map((r) => [r.id, r.rid]));
  }

  listCases(): CaseRow[] {
    const rows = this.db.prepare(`SELECT * FROM cases ORDER BY last_activity_at DESC`).all() as any[];
    return rows.map(mapCaseRow);
  }

  getCase(caseId: string): CaseRow | null {
    const row = this.db.prepare(`SELECT * FROM cases WHERE id = ?`).get(caseId) as any;
    return row ? mapCaseRow(row) : null;
  }

  getCaseSecrets(caseId: string): CaseSecrets | null {
    const row = this.db.prepare(`SELECT secret_blob FROM cases WHERE id = ?`).get(caseId) as any;
    if (!row) return null;
    return decryptJson<CaseSecrets>(this.dbKey, row.secret_blob);
  }

  updateCaseSecrets(caseId: string, secrets: CaseSecrets): void {
    const secretBlob = encryptJson(this.dbKey, secrets);
    this.db.prepare(`UPDATE cases SET secret_blob = ? WHERE id = ?`).run(secretBlob, caseId);
    this.refreshPollCandidates(caseId, secrets);
  }

  setStatus(caseId: string, status: CaseStatus): void {
    const now = Date.now();
    if (status === "acknowledged") {
      this.db.prepare(`UPDATE cases SET status = ?, acknowledged_at = COALESCE(acknowledged_at, ?), last_activity_at = ? WHERE id = ?`).run(status, now, now, caseId);
    } else if (status === "closed") {
      this.db.prepare(`UPDATE cases SET status = ?, closed_at = ?, last_activity_at = ? WHERE id = ?`).run(status, now, now, caseId);
    } else {
      this.db.prepare(`UPDATE cases SET status = ?, last_activity_at = ? WHERE id = ?`).run(status, now, caseId);
    }
  }

  setCategory(caseId: string, category: string): void {
    this.db.prepare(`UPDATE cases SET category = ?, last_activity_at = ? WHERE id = ?`).run(category, Date.now(), caseId);
  }

  appendMessage(caseId: string, direction: "in" | "out", text: string, createdAt: number = Date.now()): CaseMessage {
    const bodyBlob = encryptJson(this.dbKey, { text });
    const info = this.db
      .prepare(`INSERT INTO case_messages (case_id, direction, body_blob, created_at) VALUES (?, ?, ?, ?)`)
      .run(caseId, direction, bodyBlob, createdAt);
    this.db.prepare(`UPDATE cases SET last_activity_at = ? WHERE id = ?`).run(createdAt, caseId);
    return { id: Number(info.lastInsertRowid), caseId, direction, text, createdAt };
  }

  listMessages(caseId: string): CaseMessage[] {
    const rows = this.db.prepare(`SELECT * FROM case_messages WHERE case_id = ? ORDER BY id ASC`).all(caseId) as any[];
    return rows.map((r) => ({
      id: r.id,
      caseId: r.case_id,
      direction: r.direction,
      text: decryptJson<{ text: string }>(this.dbKey, r.body_blob).text,
      createdAt: r.created_at,
    }));
  }

  /** Every (identity, generation) tag candidate the poll loop should check for this case — see
   *  the class doc comment. Rebuilt whenever the case's secrets change (a new/learned
   *  wire identity, a generation bump). Small, deliberately unbounded window (0..3) — this
   *  product line doesn't build a "Wechsel" rotation UI in v1, so a reporter's generation stays
   *  0 in the overwhelming common case; the window just tolerates a manual rotation without
   *  the poll loop having to special-case it. */
  private refreshPollCandidates(caseId: string, secrets: CaseSecrets): void {
    this.db.prepare(`DELETE FROM poll_candidates WHERE case_id = ?`).run(caseId);
    const identities = [secrets.reporterUserId, secrets.reporterWireIdentity].filter((v): v is string => !!v);
    const insert = this.db.prepare(`INSERT OR IGNORE INTO poll_candidates (case_id, identity, generation) VALUES (?, ?, ?)`);
    const baseGen = secrets.theirGeneration;
    for (const identity of identities) {
      for (let g = Math.max(0, baseGen - 1); g <= baseGen + 3; g++) {
        insert.run(caseId, identity, g);
      }
    }
  }

  allPollCandidates(): { caseId: string; identity: string; generation: number }[] {
    return this.db.prepare(`SELECT case_id as caseId, identity, generation FROM poll_candidates`).all() as any[];
  }

  /** Removes one case for good: its messages, its secrets and its poll tags. Freed pages are
   *  overwritten (secure_delete) and the file is compacted, so deleted text does not linger in
   *  the database file. Returns false when the case does not exist. */
  deleteCase(caseId: string): boolean {
    const removed = this.deleteCases([caseId]);
    return removed > 0;
  }

  /** Removes every case whose last activity is older than the given moment. Returns how many. */
  deleteInactiveBefore(cutoffMs: number): number {
    const ids = (this.db.prepare(`SELECT id FROM cases WHERE last_activity_at < ?`).all(cutoffMs) as { id: string }[]).map((r) => r.id);
    return this.deleteCases(ids);
  }

  private deleteCases(ids: string[]): number {
    if (ids.length === 0) return 0;
    this.db.pragma("secure_delete = ON");
    const run = this.db.transaction((list: string[]) => {
      let n = 0;
      for (const id of list) {
        this.db.prepare(`DELETE FROM case_messages WHERE case_id = ?`).run(id);
        this.db.prepare(`DELETE FROM poll_candidates WHERE case_id = ?`).run(id);
        n += this.db.prepare(`DELETE FROM cases WHERE id = ?`).run(id).changes;
      }
      return n;
    });
    const removed = run(ids);
    // VACUUM cannot run inside a transaction; WAL mode needs a checkpoint so the old pages leave the -wal file too.
    this.db.exec("VACUUM");
    this.db.pragma("wal_checkpoint(TRUNCATE)");
    return removed;
  }

  close(): void {
    this.db.close();
  }
}

function mapCaseRow(row: any): CaseRow {
  return {
    id: row.id,
    caseNumber: row.case_number ?? null,
    signalPending: row.signal_pending === 1,
    status: row.status,
    category: row.category,
    openedAt: row.opened_at,
    ackDueAt: row.ack_due_at,
    feedbackDueAt: row.feedback_due_at,
    acknowledgedAt: row.acknowledged_at,
    closedAt: row.closed_at,
    lastActivityAt: row.last_activity_at,
    rechercheId: row.recherche_id ?? null,
  };
}
