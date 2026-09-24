import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { BlobStore } from "./blobStore";
import { MAX_BLOBS_PER_TAG } from "../config";

function freshStore(ttlHours?: number): { store: BlobStore; file: string } {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "relay-test-")), "relay.sqlite");
  return { store: ttlHours === undefined ? new BlobStore(file) : new BlobStore(file, ttlHours), file };
}

test("put then takeAll returns and clears the tag's queue in FIFO order", () => {
  const { store } = freshStore();
  assert.equal(store.put("tagA", "aGVsbG8="), true);
  assert.equal(store.put("tagA", "d29ybGQ="), true);
  assert.deepEqual(store.takeAll("tagA"), ["aGVsbG8=", "d29ybGQ="]);
  // Second fetch is empty — pull-and-delete, no history.
  assert.deepEqual(store.takeAll("tagA"), []);
});

test("tags do not see each other's blobs", () => {
  const { store } = freshStore();
  store.put("tagA", "aGVsbG8=");
  store.put("tagB", "d29ybGQ=");
  assert.deepEqual(store.takeAll("tagA"), ["aGVsbG8="]);
  assert.deepEqual(store.takeAll("tagB"), ["d29ybGQ="]);
});

test("put refuses once a tag's queue is at capacity", () => {
  const { store } = freshStore();
  for (let i = 0; i < MAX_BLOBS_PER_TAG; i++) assert.equal(store.put("tagA", "aGVsbG8="), true);
  assert.equal(store.put("tagA", "aGVsbG8="), false);
});

test("capacity comfortably covers the app's largest allowed chunked file transfer", () => {
  // ChatViewModel.MAX_FILE_BYTES (5 MB) / RatchetFrame.CIPHERTEXT_CHUNK_SIZE (4000 bytes) is
  // ~1311 chunks worst case — this is the regression test for why MAX_BLOBS_PER_TAG can't quietly
  // regress back down below that once chunked transfers became relay-eligible.
  const worstCaseChunks = Math.ceil((5 * 1024 * 1024) / 4000);
  assert.ok(MAX_BLOBS_PER_TAG >= worstCaseChunks, `${MAX_BLOBS_PER_TAG} must be >= ${worstCaseChunks}`);
});

test("sweepExpired removes only blobs older than the TTL", () => {
  const { store } = freshStore();
  store.put("tagA", "b2xk"); // "old"
  const sixHoursOneMinuteLater = Date.now() + 6 * 60 * 60 * 1000 + 60_000;
  const removed = store.sweepExpired(sixHoursOneMinuteLater);
  assert.equal(removed, 1);
  assert.deepEqual(store.takeAll("tagA"), []);
});

test("sweepExpired leaves fresh blobs alone", () => {
  const { store } = freshStore();
  store.put("tagA", "bmV3"); // "new"
  const removed = store.sweepExpired(Date.now());
  assert.equal(removed, 0);
  assert.deepEqual(store.takeAll("tagA"), ["bmV3"]);
});

test("a custom ttlHours (constructor arg) is honored instead of the 6h default", () => {
  const { store } = freshStore(1); // 1 hour instead of the default 6
  store.put("tagA", "b2xk");
  // Would still be within the old 6h default, but past this store's configured 1h TTL.
  const twoHoursLater = Date.now() + 2 * 60 * 60 * 1000;
  const removed = store.sweepExpired(twoHoursLater);
  assert.equal(removed, 1);
  assert.deepEqual(store.takeAll("tagA"), []);
});

test("a custom ttlHours does not expire blobs before its own window", () => {
  const { store } = freshStore(24); // longer than the default 6h
  store.put("tagA", "b2xk");
  const sevenHoursLater = Date.now() + 7 * 60 * 60 * 1000; // past the old default, not the new one
  const removed = store.sweepExpired(sevenHoursLater);
  assert.equal(removed, 0);
  assert.deepEqual(store.takeAll("tagA"), ["b2xk"]);
});

test("takeAllWithMeta returns each blob's createdAt so dwell time can be reported", () => {
  // Backs the operator activity log's "waited Xs" figure (see relayEventLog.ts) — without a real
  // createdAt coming back out of the store, that number could only ever be guessed.
  const store = new BlobStore(":memory:");
  const before = Date.now();
  store.put("tag-meta", "aGVsbG8=");
  const after = Date.now();

  const rows = store.takeAllWithMeta("tag-meta");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].blob, "aGVsbG8=");
  assert.ok(rows[0].createdAt >= before && rows[0].createdAt <= after, "createdAt should be the real insert time");

  // Same take-and-delete semantics as takeAll — a second call sees nothing.
  assert.deepEqual(store.takeAllWithMeta("tag-meta"), []);
  store.close();
});

test("stats reports queue depth, distinct tags and the oldest item's age", () => {
  // Backs `--status` and the running relay's heartbeat — deliberately aggregate-only, so reading
  // it never exposes which tags (i.e. which conversations) are involved.
  const store = new BlobStore(":memory:");
  assert.deepEqual(store.stats(), { queued: 0, tags: 0, oldestAgeMs: null });

  store.put("tag-a", "aGVsbG8=");
  store.put("tag-a", "aGVsbG8=");
  store.put("tag-b", "aGVsbG8=");

  const stats = store.stats();
  assert.equal(stats.queued, 3);
  assert.equal(stats.tags, 2);
  assert.ok(stats.oldestAgeMs !== null && stats.oldestAgeMs >= 0);
  store.close();
});
