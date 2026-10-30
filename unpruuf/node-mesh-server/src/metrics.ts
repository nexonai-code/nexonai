/**
 * Counters for the operator's overview page — numbers only. The node stays blind: nothing here
 * records a tag, a blob, an address or who asked, just "how many deposits / fetches happened in
 * this hour". Memory only, gone on restart.
 */
const HOUR_MS = 60 * 60 * 1000;
const KEEP_HOURS = 24;

export type MetricKind = "deposit" | "fetch" | "rejected";

export class Metrics {
  readonly startedAt: number;
  private buckets = new Map<number, Record<MetricKind, number>>();
  private totals: Record<MetricKind, number> = { deposit: 0, fetch: 0, rejected: 0 };

  constructor(private now: () => number = Date.now) {
    this.startedAt = now();
  }

  record(kind: MetricKind): void {
    const hour = Math.floor(this.now() / HOUR_MS);
    const b = this.buckets.get(hour) ?? { deposit: 0, fetch: 0, rejected: 0 };
    b[kind] += 1;
    this.buckets.set(hour, b);
    this.totals[kind] += 1;
    for (const h of this.buckets.keys()) if (h <= hour - KEEP_HOURS) this.buckets.delete(h);
  }

  /** Last 24 full-or-current hours, oldest first. */
  hourly(): { hourStart: number; deposit: number; fetch: number; rejected: number }[] {
    const hour = Math.floor(this.now() / HOUR_MS);
    const out = [];
    for (let h = hour - KEEP_HOURS + 1; h <= hour; h++) {
      const b = this.buckets.get(h) ?? { deposit: 0, fetch: 0, rejected: 0 };
      out.push({ hourStart: h * HOUR_MS, ...b });
    }
    return out;
  }

  summary() {
    return {
      startedAt: this.startedAt,
      uptimeMs: this.now() - this.startedAt,
      totals: { ...this.totals },
      last24h: this.hourly().reduce(
        (a, b) => ({ deposit: a.deposit + b.deposit, fetch: a.fetch + b.fetch, rejected: a.rejected + b.rejected }),
        { deposit: 0, fetch: 0, rejected: 0 },
      ),
    };
  }
}
