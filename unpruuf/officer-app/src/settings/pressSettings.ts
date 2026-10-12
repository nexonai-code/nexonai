import * as fs from "node:fs";
import * as path from "node:path";

/** What a journalist can set in safeline Press. Kept in a small JSON file next to the case
 *  database. It holds no case content: only how long tips are kept and when the app last
 *  fetched from the server. */
export interface PressSettings {
  /** Tips with no activity for this many days are deleted. 0 = keep until deleted by hand. */
  retentionDays: number;
  /** The dashboard warns when the app did not fetch for this many hours. */
  pickupWarnHours: number;
}

export const DEFAULT_PRESS_SETTINGS: PressSettings = { retentionDays: 0, pickupWarnHours: 12 };
export const MAX_RETENTION_DAYS = 3650;
/** Packets wait on the server for 24 hours at most, so a warning at 24 or later comes too late. */
export const MAX_PICKUP_WARN_HOURS = 23;

export class InvalidSettingsError extends Error {}

export function validateSettings(input: unknown): PressSettings {
  const o = (input ?? {}) as Record<string, unknown>;
  const days = o.retentionDays;
  const hours = o.pickupWarnHours;
  if (typeof days !== "number" || !Number.isInteger(days) || days < 0 || days > MAX_RETENTION_DAYS) {
    throw new InvalidSettingsError(`retentionDays must be a whole number from 0 to ${MAX_RETENTION_DAYS}`);
  }
  if (typeof hours !== "number" || !Number.isInteger(hours) || hours < 1 || hours > MAX_PICKUP_WARN_HOURS) {
    throw new InvalidSettingsError(`pickupWarnHours must be a whole number from 1 to ${MAX_PICKUP_WARN_HOURS}`);
  }
  return { retentionDays: days, pickupWarnHours: hours };
}

interface FileShape extends PressSettings {
  lastOkPollAt: number | null;
}

/** Settings plus the time of the last successful fetch, which survives restarts: that is how the
 *  dashboard knows the app was switched off for a while. */
export class PressSettingsStore {
  private data: FileShape;
  private lastWrite = 0;
  /** How long the app was off before this start (ms), or null on the first ever start. */
  readonly offlineGapMs: number | null;
  readonly startedAt: number;

  constructor(private filePath: string, now: number = Date.now()) {
    this.startedAt = now;
    this.data = { ...DEFAULT_PRESS_SETTINGS, lastOkPollAt: null };
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<FileShape>;
      try { Object.assign(this.data, validateSettings({ ...DEFAULT_PRESS_SETTINGS, ...raw })); } catch { /* damaged values: defaults */ }
      if (typeof raw.lastOkPollAt === "number") this.data.lastOkPollAt = raw.lastOkPollAt;
    } catch { /* first start or unreadable file: defaults */ }
    this.offlineGapMs = this.data.lastOkPollAt === null ? null : Math.max(0, now - this.data.lastOkPollAt);
  }

  get(): PressSettings {
    return { retentionDays: this.data.retentionDays, pickupWarnHours: this.data.pickupWarnHours };
  }

  get lastOkPollAt(): number | null { return this.data.lastOkPollAt; }

  update(input: unknown): PressSettings {
    const next = validateSettings(input);
    this.data.retentionDays = next.retentionDays;
    this.data.pickupWarnHours = next.pickupWarnHours;
    this.save();
    return next;
  }

  /** Called after every successful fetch. Written at most once a minute. */
  recordPoll(at: number = Date.now()): void {
    this.data.lastOkPollAt = at;
    if (at - this.lastWrite >= 60_000) this.save(at);
  }

  private save(at: number = Date.now()): void {
    this.lastWrite = at;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.data));
    } catch (err) {
      console.error("[settings] could not save:", err instanceof Error ? err.message : err);
    }
  }
}
