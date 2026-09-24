import * as fs from "fs";
import * as path from "path";
import { formatDuration } from "./relayEventLog";

/**
 * Read-only views onto a relay's own state, usable *while it is running* — including when it runs
 * in the background as a launchd service, where there is no console to look at.
 *
 * Everything here works purely from files the relay already maintains (`relay-identity.json`, the
 * hidden service's `hostname`, the SQLite queue), so it never has to talk to the running process
 * and can't disturb it. SQLite is opened by the caller in WAL mode, which supports a second
 * reader process concurrently with the live writer.
 */

/** Where Tor writes the published onion, relative to the relay's data directory. */
export function hostnamePath(dataDir: string): string {
  return path.join(dataDir, "tor-hidden-service", "hostname");
}

/**
 * The currently published onion, or null if Tor hasn't published one yet (first run still
 * bootstrapping, or the relay has never been started).
 */
export function readOnionAddress(dataDir: string): string | null {
  try {
    const hostname = fs.readFileSync(hostnamePath(dataDir), "utf8").trim();
    return hostname.length > 0 ? hostname : null;
  } catch {
    return null;
  }
}

export interface QueueSnapshot {
  queued: number;
  tags: number;
  oldestAgeMs: number | null;
}

/**
 * Human summary of what is waiting to be collected. Phrased for an operator asking the two
 * questions this actually answers: "is anything stuck?" and "is anyone using this relay?"
 */
export function formatQueueSnapshot(snapshot: QueueSnapshot): string {
  if (snapshot.queued === 0) return "queue empty — everything sent has been collected";
  const conversations = snapshot.tags === 1 ? "1 conversation" : `${snapshot.tags} conversations`;
  const messages = snapshot.queued === 1 ? "1 message" : `${snapshot.queued} messages`;
  const oldest = snapshot.oldestAgeMs === null ? "" : `, oldest waiting ${formatDuration(snapshot.oldestAgeMs)}`;
  return `${messages} waiting across ${conversations}${oldest}`;
}

/** Compact uptime line for the running relay's periodic heartbeat. */
export function formatUptime(startedAt: number, now: number = Date.now()): string {
  return formatDuration(now - startedAt);
}
