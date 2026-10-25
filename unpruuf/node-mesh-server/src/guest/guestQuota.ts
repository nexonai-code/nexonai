import { GuestGrant } from "./guestGrant";

/**
 * Per-grant deposit quota, in memory only: fixed one-hour windows keyed by grantId. Nothing here
 * is persisted or logged, and the node's database never gets a grant column, so a stored packet
 * can never be linked to a grant. A restart resets the windows; that only ever makes the node
 * more permissive for the remainder of one hour, never less safe.
 */
export class GuestQuota {
  private windows = new Map<string, { start: number; count: number; bytes: number; until: number }>();

  constructor(private readonly serverMaxDepositsPerHour: number, private readonly serverMaxBytesPerHour: number) {}

  /** Returns true and counts the deposit if it fits, false if a limit is reached. The effective
   *  limit is the smaller of the grant's own limit and the node operator's cap. */
  tryTake(grant: GuestGrant, bytes: number, now: number = Date.now()): boolean {
    this.prune(now);
    const key = grant.grantId.toString("hex");
    let w = this.windows.get(key);
    if (!w || now - w.start >= 3_600_000) {
      w = { start: now, count: 0, bytes: 0, until: grant.notAfterMs };
      this.windows.set(key, w);
    }
    const maxCount = Math.min(grant.depositsPerHour || this.serverMaxDepositsPerHour, this.serverMaxDepositsPerHour);
    const maxBytes = Math.min(grant.bytesPerHour || this.serverMaxBytesPerHour, this.serverMaxBytesPerHour);
    if (w.count + 1 > maxCount || w.bytes + bytes > maxBytes) return false;
    w.count += 1;
    w.bytes += bytes;
    return true;
  }

  private prune(now: number): void {
    if (this.windows.size < 512) return;
    for (const [k, w] of this.windows) if (w.until <= now || now - w.start >= 3_600_000) this.windows.delete(k);
  }
}
