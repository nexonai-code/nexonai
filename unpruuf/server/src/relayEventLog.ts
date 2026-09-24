/**
 * Operator-facing activity log for the relay's own console — the Node counterpart of the Android
 * relay app's `RelayEventLog.kt` / "RECENT ACTIVITY" card, and built to the same rules.
 *
 * Purpose: let whoever runs the relay see, in the window they already have open, whether pushes
 * are actually arriving, how long they sit before being picked up, and what is being rejected —
 * without attaching a debugger or reading the SQLite file by hand. Until this existed, a
 * perfectly healthy relay and a completely broken one looked identical (both printed nothing
 * after startup), which is exactly what made a real iOS receive-side bug hard to place.
 *
 * **Privacy stance, deliberately identical to the Android version:** the relay is architecturally
 * blind to message content (everything it stores is already Double-Ratchet ciphertext — see
 * `blobStore.ts`), and this log stays true to that. It only ever records metadata the relay
 * already legitimately handles: a short tag *suffix* (just enough for the operator to see that a
 * STORED and a later FETCHED belong to the same conversation), a size, and timing. Never the
 * blob, never a full tag, never the auth token.
 *
 * One honest difference from Android's version: that one is an in-memory ring buffer that is
 * never persisted. This one writes to stdout, which is ephemeral in a terminal but *would* be
 * persisted if the operator redirects output to a file or runs under a service manager that
 * captures logs. That is the operator's own choice to make; nothing here writes a file itself.
 */

export type RelayEventKind = "STORED" | "FETCHED" | "REJECTED";

export interface RelayEvent {
  at: number;
  kind: RelayEventKind;
  tagSuffix: string;
  bytes: number;
  /** How many blobs a FETCHED event picked up. Omitted for STORED/REJECTED. */
  count?: number;
  /** Mean time the fetched blob(s) sat queued before pickup. Omitted when not applicable. */
  avgDwellMs?: number;
  /** Why a REJECTED event was rejected. */
  note?: string;
}

/**
 * Long enough to tell two different tags apart at a glance, short enough to be useless to anyone
 * but the operator correlating their own relay's traffic — same 8 characters Android uses.
 */
export function tagSuffix(tag: string): string {
  return tag.length <= 8 ? tag : tag.slice(-8);
}

/**
 * Exact decoded length of a base64 string without allocating a Buffer for it — a full fetch can
 * carry up to `MAX_BLOBS_PER_TAG` blobs, and decoding every one of them purely to log a size
 * would be real work for nothing.
 */
export function base64DecodedLength(base64: string): number {
  if (base64.length === 0) return 0;
  let padding = 0;
  if (base64.endsWith("==")) padding = 2;
  else if (base64.endsWith("=")) padding = 1;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/** Compact human duration: `820ms`, `12s`, `5m 3s`, `2h 10m`. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes === 0 ? `${hours}h` : `${hours}h ${remMinutes}m`;
}

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function formatClock(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Pure formatter, split out from the logging functions so the exact output shape is testable
 * without capturing stdout.
 */
export function formatEvent(event: RelayEvent): string {
  const head = `[relay] ${formatClock(event.at)}  ${event.kind.padEnd(8)} …${event.tagSuffix}`;
  switch (event.kind) {
    case "STORED":
      return `${head}  ${formatBytes(event.bytes)} queued`;
    case "FETCHED": {
      const count = event.count ?? 0;
      const plural = count === 1 ? "message" : "messages";
      const dwell = event.avgDwellMs === undefined ? "" : `, waited ${formatDuration(event.avgDwellMs)}`;
      return `${head}  ${count} ${plural} picked up, ${formatBytes(event.bytes)}${dwell}`;
    }
    case "REJECTED":
      return `${head}  rejected: ${event.note ?? "unspecified"}`;
  }
}

function emit(event: RelayEvent): void {
  console.log(formatEvent(event));
}

export function logStored(tag: string, bytes: number): void {
  emit({ at: Date.now(), kind: "STORED", tagSuffix: tagSuffix(tag), bytes });
}

/**
 * [tag] may be anything the caller sent, including something that failed validation — it is
 * suffixed like any other tag rather than printed whole, so a malformed request can't be used to
 * write arbitrary long strings into the operator's console.
 */
export function logRejected(tag: string, note: string): void {
  emit({ at: Date.now(), kind: "REJECTED", tagSuffix: tagSuffix(tag), bytes: 0, note });
}

/**
 * Only call this for a fetch that actually returned something — an empty poll is the normal
 * every-20-seconds heartbeat of every connected client, and logging those would bury the events
 * that matter within seconds.
 */
export function logFetched(tag: string, count: number, totalBytes: number, avgDwellMs: number): void {
  emit({ at: Date.now(), kind: "FETCHED", tagSuffix: tagSuffix(tag), bytes: totalBytes, count, avgDwellMs });
}
