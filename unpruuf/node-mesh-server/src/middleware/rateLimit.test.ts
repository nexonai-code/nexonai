import test from "node:test";
import assert from "node:assert/strict";
import { TokenBucket } from "./rateLimit";

test("TokenBucket allows up to its capacity, then rejects", () => {
  const bucket = new TokenBucket(3, 0); // no refill — isolates the capacity behavior
  assert.equal(bucket.tryTake(), true);
  assert.equal(bucket.tryTake(), true);
  assert.equal(bucket.tryTake(), true);
  assert.equal(bucket.tryTake(), false);
});

test("TokenBucket refills over time, at the configured rate", async () => {
  const bucket = new TokenBucket(1, 20); // 1 slot, refills 20/sec => ~50ms per token
  assert.equal(bucket.tryTake(), true);
  assert.equal(bucket.tryTake(), false, "no tokens left immediately after taking the only one");
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(bucket.tryTake(), true, "should have refilled by now");
});

test("TokenBucket never exceeds its configured capacity even after a long idle period", async () => {
  const bucket = new TokenBucket(2, 1000); // fast refill, small capacity
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(bucket.tryTake(), true);
  assert.equal(bucket.tryTake(), true);
  assert.equal(bucket.tryTake(), false, "capacity must cap accumulation, not just the take rate");
});
