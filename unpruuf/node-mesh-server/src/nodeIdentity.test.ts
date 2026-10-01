import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { loadOrCreateIdentity } from "./nodeIdentity";

test("a single-key identity file from before multi-node is moved into onionKeys", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "node-mesh-identity-test-")), "id.json");
  fs.writeFileSync(file, JSON.stringify({ ownerSecret: "s", ttlHours: 6, onionKey: "ED25519-V3:OLD" }));
  const { identity, wasCreated } = loadOrCreateIdentity(file, 6);
  assert.equal(wasCreated, false);
  assert.deepEqual(identity.onionKeys, ["ED25519-V3:OLD"]);
  assert.equal(identity.onionKey, undefined);
  const onDisk = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.deepEqual(onDisk.onionKeys, ["ED25519-V3:OLD"]);
  assert.equal(onDisk.onionKey, undefined);
});
