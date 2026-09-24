import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { formatQueueSnapshot, formatUptime, hostnamePath, readOnionAddress } from "./relayStatus";

test("readOnionAddress reads and trims the hostname Tor publishes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-status-test-"));
  fs.mkdirSync(path.dirname(hostnamePath(dir)), { recursive: true });
  fs.writeFileSync(hostnamePath(dir), "abc123xyz.onion\n");
  assert.equal(readOnionAddress(dir), "abc123xyz.onion");
});

test("readOnionAddress returns null when Tor hasn't published one yet", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-status-test-"));
  assert.equal(readOnionAddress(dir), null);
});

test("readOnionAddress treats an empty hostname file as not-yet-published", () => {
  // Tor creates the file before writing to it, so an empty one is a real transient state, not a
  // corrupt install — reporting "" as the address would print a broken connection string.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-status-test-"));
  fs.mkdirSync(path.dirname(hostnamePath(dir)), { recursive: true });
  fs.writeFileSync(hostnamePath(dir), "   \n");
  assert.equal(readOnionAddress(dir), null);
});

test("formatQueueSnapshot says plainly when nothing is waiting", () => {
  const line = formatQueueSnapshot({ queued: 0, tags: 0, oldestAgeMs: null });
  assert.match(line, /queue empty/);
});

test("formatQueueSnapshot reports counts and the oldest wait", () => {
  const line = formatQueueSnapshot({ queued: 5, tags: 2, oldestAgeMs: 90_000 });
  assert.match(line, /5 messages/);
  assert.match(line, /2 conversations/);
  assert.match(line, /oldest waiting 1m 30s/);
});

test("formatQueueSnapshot uses singulars for a single message in a single conversation", () => {
  const line = formatQueueSnapshot({ queued: 1, tags: 1, oldestAgeMs: 4_000 });
  assert.match(line, /1 message waiting across 1 conversation/);
  assert.doesNotMatch(line, /messages/);
  assert.doesNotMatch(line, /conversations/);
});

test("formatUptime renders elapsed time since start", () => {
  const started = 1_000_000;
  assert.equal(formatUptime(started, started + 3_600_000), "1h");
});
