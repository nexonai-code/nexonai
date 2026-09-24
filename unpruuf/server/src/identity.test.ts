import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { loadOrCreateIdentity, regenerateToken } from "./identity";

function tmpIdentityPath(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "relay-identity-test-")), "relay-identity.json");
}

test("first call creates a new identity with the given default TTL", () => {
  const p = tmpIdentityPath();
  const { identity, wasCreated } = loadOrCreateIdentity(p, 12);
  assert.equal(wasCreated, true);
  assert.equal(identity.ttlHours, 12);
  assert.equal(typeof identity.authToken, "string");
  assert.ok(identity.authToken.length >= 32);
  assert.ok(fs.existsSync(p));
});

test("second call loads the same persisted identity instead of generating a new one", () => {
  const p = tmpIdentityPath();
  const { identity: first } = loadOrCreateIdentity(p, 6);
  const { identity: second, wasCreated } = loadOrCreateIdentity(p, 999 /* ignored — already exists */);
  assert.equal(wasCreated, false);
  assert.equal(second.authToken, first.authToken);
  assert.equal(second.ttlHours, 6); // NOT 999 — the persisted value wins once it exists
});

test("two different identity files never collide on the same token", () => {
  const { identity: a } = loadOrCreateIdentity(tmpIdentityPath());
  const { identity: b } = loadOrCreateIdentity(tmpIdentityPath());
  assert.notEqual(a.authToken, b.authToken);
});

test("regenerateToken changes the token but keeps the TTL, and persists the change", () => {
  const p = tmpIdentityPath();
  const { identity: original } = loadOrCreateIdentity(p, 9);
  const rotated = regenerateToken(p, original);
  assert.notEqual(rotated.authToken, original.authToken);
  assert.equal(rotated.ttlHours, 9);

  const { identity: reloaded } = loadOrCreateIdentity(p);
  assert.equal(reloaded.authToken, rotated.authToken);
});
