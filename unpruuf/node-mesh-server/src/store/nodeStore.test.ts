import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { NodeStore } from "./nodeStore";

function tempDbPath(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "node-mesh-store-test-")), "node-mesh.sqlite");
}

test("fetchAll does NOT delete — a blob survives repeated fetches until TTL expiry", () => {
  const store = new NodeStore(tempDbPath(), 6);
  try {
    assert.equal(store.put("tagA", "aGVsbG8="), true);
    assert.deepEqual(store.fetchAll("tagA"), ["aGVsbG8="]);
    // Same tag, fetched again — must still be there. This is the core behavioral difference
    // from the consumer relay's delete-on-fetch BlobStore.
    assert.deepEqual(store.fetchAll("tagA"), ["aGVsbG8="]);
    assert.deepEqual(store.fetchAll("tagA"), ["aGVsbG8="]);
  } finally {
    store.close();
  }
});

test("multiple deposits under the same tag all survive repeated fetches, in order", () => {
  const store = new NodeStore(tempDbPath(), 6);
  try {
    store.put("tagA", "Zmlyc3Q=");
    store.put("tagA", "c2Vjb25k");
    assert.deepEqual(store.fetchAll("tagA"), ["Zmlyc3Q=", "c2Vjb25k"]);
    assert.deepEqual(store.fetchAll("tagA"), ["Zmlyc3Q=", "c2Vjb25k"]);
  } finally {
    store.close();
  }
});

test("sweepExpired removes only rows past their expires_at, leaves others", () => {
  const store = new NodeStore(tempDbPath(), 1); // 1h default TTL
  try {
    // put() timestamps against the real wall clock, so the sweep's "now" override must be
    // relative to Date.now(), not a fabricated base — sweepExpired's "now" param is for
    // controlling how far past a *real* expires_at the sweep pretends to run, not for
    // simulating put() itself happening at an arbitrary time.
    const putAt = Date.now();
    store.put("expiring", "ZXhwaXJlZA==", 1); // 1ms TTL — expires almost immediately
    store.put("fresh", "ZnJlc2g=", 60 * 60 * 1000); // 1h TTL
    const removed = store.sweepExpired(putAt + 10_000); // well past the 1ms TTL, well before 1h
    assert.equal(removed, 1);
    assert.deepEqual(store.fetchAll("expiring"), []);
    assert.deepEqual(store.fetchAll("fresh"), ["ZnJlc2g="]);
  } finally {
    store.close();
  }
});

test("fetchAll excludes an expired row even before the periodic sweep removes it", () => {
  const store = new NodeStore(tempDbPath(), 6);
  try {
    store.put("soon", "c29vbg==", 1); // 1ms TTL
    // No sweep called at all — fetchAll itself must not return an already-expired row.
    setTimeoutSync(5);
    assert.deepEqual(store.fetchAll("soon"), []);
  } finally {
    store.close();
  }
});

test("a per-deposit ttl override can only shorten, never lengthen, the node's own default TTL", () => {
  const store = new NodeStore(tempDbPath(), 1); // 1h node default
  try {
    const now = Date.now();
    // Ask for a wildly longer TTL than the node allows (100h) — must be capped at 1h, not honored.
    store.put("capped", "Y2FwcGVk", 100 * 60 * 60 * 1000);
    // Still present at 30 minutes (within the capped 1h)...
    assert.deepEqual(store.fetchAllWithMeta("capped").map((r) => r.blob), ["Y2FwcGVk"]);
    // ...but gone if we sweep as though 2 hours had passed (past the capped 1h, well within the
    // requested-but-not-honored 100h).
    const removed = store.sweepExpired(now + 2 * 60 * 60 * 1000);
    assert.equal(removed, 1);
  } finally {
    store.close();
  }
});

test("MAX_BLOBS_PER_TAG bounds one tag's queue independent of TTL/no-delete-on-fetch", () => {
  const store = new NodeStore(tempDbPath(), 6);
  try {
    let rejectedAt = -1;
    for (let i = 0; i < 1600; i++) {
      if (!store.put("floodedTag", "eA==")) {
        rejectedAt = i;
        break;
      }
    }
    assert.equal(rejectedAt, 1500, "must reject exactly at the documented MAX_BLOBS_PER_TAG cap");
  } finally {
    store.close();
  }
});

test("waitForAny resolves as soon as a matching tag receives a new deposit", async () => {
  const store = new NodeStore(tempDbPath(), 6);
  try {
    const waitPromise = store.waitForAny(["arrivesLate"], 10_000);
    const start = Date.now();
    setTimeout(() => store.put("arrivesLate", "bGF0ZQ=="), 50);
    await waitPromise;
    const elapsedMs = Date.now() - start;
    assert.ok(elapsedMs < 5_000, `expected an early return, took ${elapsedMs}ms`);
    assert.deepEqual(store.fetchAll("arrivesLate"), ["bGF0ZQ=="]);
  } finally {
    store.close();
  }
});

test("waitForAny times out and resolves anyway when nothing ever arrives", async () => {
  const store = new NodeStore(tempDbPath(), 6);
  try {
    const start = Date.now();
    await store.waitForAny(["neverArrives"], 200);
    const elapsedMs = Date.now() - start;
    assert.ok(elapsedMs >= 200, `expected to wait out the full timeout, took ${elapsedMs}ms`);
  } finally {
    store.close();
  }
});

function setTimeoutSync(ms: number): void {
  const start = Date.now();
  while (Date.now() - start < ms) { /* deliberate busy-wait, test only */ }
}
