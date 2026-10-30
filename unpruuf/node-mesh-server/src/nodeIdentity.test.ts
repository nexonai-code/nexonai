import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { isLocked, loadOrCreateIdentity, openSealed, regenerateSecret, saveIdentity, seal, unlockIdentity } from "./nodeIdentity";

function tmpFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "node-mesh-identity-test-")), "id.json");
}

test("a single-key identity file from before multi-node is moved into onionKeys", () => {
  const file = tmpFile();
  fs.writeFileSync(file, JSON.stringify({ ownerSecret: "s", ttlHours: 6, onionKey: "ED25519-V3:OLD" }));
  const { identity, wasCreated } = loadOrCreateIdentity(file, 6, "disk");
  assert.equal(wasCreated, false);
  assert.deepEqual(identity.onionKeys, ["ED25519-V3:OLD"]);
  assert.equal(identity.onionKey, undefined);
  const onDisk = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.deepEqual(onDisk.onionKeys, ["ED25519-V3:OLD"]);
  assert.equal(onDisk.onionKey, undefined);
});

test("seal/openSealed round-trips and rejects a wrong secret", () => {
  const salt = Buffer.alloc(16, 7).toString("base64");
  const sealed = seal("right", salt, { onionKeys: ["ED25519-V3:K1", "ED25519-V3:K2"] });
  assert.deepEqual(openSealed("right", salt, sealed), { onionKeys: ["ED25519-V3:K1", "ED25519-V3:K2"] });
  assert.equal(openSealed("wrong", salt, sealed), null);
});

test("sealed storage never writes the owner secret or a node key in readable form", () => {
  const file = tmpFile();
  const { identity, wasCreated } = loadOrCreateIdentity(file, 6, "sealed");
  assert.equal(wasCreated, true);
  identity.onionKeys = ["ED25519-V3:SECRETKEY"];
  identity.controlKey = "ED25519-V3:CONTROL";
  saveIdentity(file, identity);
  const raw = fs.readFileSync(file, "utf8");
  assert.doesNotMatch(raw, new RegExp(identity.ownerSecret));
  assert.doesNotMatch(raw, /SECRETKEY/);
  assert.match(raw, /CONTROL/);
});

test("a sealed server restarts locked and unlocks only with the right owner secret", () => {
  const file = tmpFile();
  const first = loadOrCreateIdentity(file, 6, "sealed").identity;
  const secret = first.ownerSecret;
  first.onionKeys = ["ED25519-V3:A", "ED25519-V3:B"];
  saveIdentity(file, first);

  const restarted = loadOrCreateIdentity(file, 6, "sealed").identity;
  assert.equal(isLocked(restarted), true);
  assert.equal(restarted.onionKeys, undefined);
  assert.equal(unlockIdentity(restarted, "not-it"), false);
  assert.equal(isLocked(restarted), true);
  assert.equal(unlockIdentity(restarted, secret), true);
  assert.deepEqual(restarted.onionKeys, ["ED25519-V3:A", "ED25519-V3:B"]);
  assert.equal(restarted.ownerSecret, secret);
  assert.throws(() => regenerateSecret(file, { ...restarted, ownerSecret: "" }));
});

test("a plain file from an older version is sealed in place, keeping its node keys", () => {
  const file = tmpFile();
  fs.writeFileSync(file, JSON.stringify({ ownerSecret: "legacy-secret-0123456789", ttlHours: 6, onionKeys: ["ED25519-V3:LEGACY"] }));
  const { identity } = loadOrCreateIdentity(file, 6, "sealed");
  assert.equal(isLocked(identity), false);
  const raw = fs.readFileSync(file, "utf8");
  assert.doesNotMatch(raw, /legacy-secret/);
  assert.doesNotMatch(raw, /LEGACY/);
  const again = loadOrCreateIdentity(file, 6, "sealed").identity;
  assert.equal(unlockIdentity(again, "legacy-secret-0123456789"), true);
  assert.deepEqual(again.onionKeys, ["ED25519-V3:LEGACY"]);
});

test("rotating the owner secret re-seals the same node keys under the new secret", () => {
  const file = tmpFile();
  const id = loadOrCreateIdentity(file, 6, "sealed").identity;
  id.onionKeys = ["ED25519-V3:KEEP"];
  saveIdentity(file, id);
  const rotated = regenerateSecret(file, id);
  const reloaded = loadOrCreateIdentity(file, 6, "sealed").identity;
  assert.equal(unlockIdentity(reloaded, id.ownerSecret), false);
  assert.equal(unlockIdentity(reloaded, rotated.ownerSecret), true);
  assert.deepEqual(reloaded.onionKeys, ["ED25519-V3:KEEP"]);
});
