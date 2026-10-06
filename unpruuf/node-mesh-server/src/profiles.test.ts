import test from "node:test";
import assert from "node:assert/strict";
import { MAX_FETCH_MANY_TAGS } from "./config";
import {
  clientToleranceEpochs, MAX_NODES_PER_SERVER, MAX_TTL_HOURS, PROFILES, resolveProfile, resolveSlot, slotPorts, slotResetOffsetMs,
} from "./profiles";

test("every profile stays inside MAX_TTL_HOURS, so the fixed client window always covers it", () => {
  for (const profile of Object.values(PROFILES)) {
    assert.ok(profile.ttlHours > 0 && profile.ttlHours <= MAX_TTL_HOURS, profile.name);
  }
});

test("client tolerance window matches the Android client and fits one fetchMany call", () => {
  // P2PNetworkManager: NODE_MESH_MAX_TTL_MS = 24h, rotation 1h → ceil(24/1)+1 = 25 epochs back,
  // plus the current epoch = 26 tags per contact (IdentityManager.nodeMeshToleranceEpochs).
  assert.equal(clientToleranceEpochs(), 25);
  assert.ok(clientToleranceEpochs() + 1 <= MAX_FETCH_MANY_TAGS);
});

test("resolveProfile defaults to standard and rejects unknown names", () => {
  assert.equal(resolveProfile(undefined).name, "standard");
  assert.equal(resolveProfile(" High-Security ").ttlHours, 1);
  assert.equal(resolveProfile("offline-tolerant").ttlHours, 24);
  assert.throws(() => resolveProfile("forever"), /Unknown NODE_PROFILE/);
});

test("slots stagger the reset 0/20/40 min and never share ports", () => {
  assert.deepEqual([1, 2, 3].map((s) => slotResetOffsetMs(resolveSlot(String(s))) / 60000), [0, 20, 40]);
  const ports = [1, 2, 3].flatMap((s) => Object.values(slotPorts(resolveSlot(String(s)))));
  assert.equal(new Set(ports).size, ports.length);
  assert.throws(() => resolveSlot("4"), /Invalid NODE_SLOT/);
});

test("a server never runs more than 250 nodes", () => {
  assert.equal(MAX_NODES_PER_SERVER, 250);
});
