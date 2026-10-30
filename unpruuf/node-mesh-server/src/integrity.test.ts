import test from "node:test";
import assert from "node:assert/strict";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  buildManifestBody, fingerprintOf, listCoveredFiles, MANIFEST_FILE, signManifest, signedBytes, verifyIntegrity,
} from "./integrity";

function keyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const x = (publicKey.export({ format: "jwk" }) as { x: string }).x;
  return { privateKey, publicKeyB64: x };
}

/** A tiny install: dist/*.js, a test file that must be ignored, package.json. */
function fakeInstall(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "integrity-"));
  fs.mkdirSync(path.join(root, "dist", "sub"), { recursive: true });
  fs.writeFileSync(path.join(root, "dist", "index.js"), "console.log('server');\n");
  fs.writeFileSync(path.join(root, "dist", "sub", "util.js"), "exports.x = 1;\n");
  fs.writeFileSync(path.join(root, "dist", "index.test.js"), "// tests are not part of a release\n");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "node-mesh-server", version: "9.9.9" }));
  return root;
}

function release(root: string, kp = keyPair()) {
  fs.writeFileSync(path.join(root, MANIFEST_FILE), signManifest(buildManifestBody(root), kp.privateKey));
  return kp;
}

test("the covered files are the compiled .js files and package.json, tests excluded, sorted with '/'", () => {
  const root = fakeInstall();
  assert.deepEqual(listCoveredFiles(root), ["dist/index.js", "dist/sub/util.js", "package.json"]);
});

test("a freshly signed install is ok, with version, fingerprint and file count", () => {
  const root = fakeInstall();
  const kp = release(root);
  const r = verifyIntegrity(root, kp.publicKeyB64);
  assert.equal(r.state, "ok");
  assert.equal(r.version, "9.9.9");
  assert.equal(r.filesChecked, 3);
  assert.match(r.fingerprint!, /^([0-9a-f]{4} ){15}[0-9a-f]{4}$/);
  assert.deepEqual([r.changed, r.missing, r.extra], [[], [], []]);
});

test("the fingerprint depends on the signed list: same files same fingerprint, any change a different one", () => {
  const root = fakeInstall();
  const a = fingerprintOf(buildManifestBody(root));
  assert.equal(fingerprintOf(buildManifestBody(root)), a);
  fs.appendFileSync(path.join(root, "dist", "index.js"), "// x\n");
  assert.notEqual(fingerprintOf(buildManifestBody(root)), a);
});

test("an edited file is reported as modified, by name", () => {
  const root = fakeInstall();
  const kp = release(root);
  fs.appendFileSync(path.join(root, "dist", "index.js"), "require('http').get('http://evil');\n");
  const r = verifyIntegrity(root, kp.publicKeyB64);
  assert.equal(r.state, "modified");
  assert.deepEqual(r.changed, ["dist/index.js"]);
});

test("a deleted file and an added file are both noticed", () => {
  const root = fakeInstall();
  const kp = release(root);
  fs.rmSync(path.join(root, "dist", "sub", "util.js"));
  fs.writeFileSync(path.join(root, "dist", "backdoor.js"), "exports.y = 2;\n");
  const r = verifyIntegrity(root, kp.publicKeyB64);
  assert.equal(r.state, "modified");
  assert.deepEqual(r.missing, ["dist/sub/util.js"]);
  assert.deepEqual(r.extra, ["dist/backdoor.js"]);
});

test("changing a test file does not matter, tests are not part of a release", () => {
  const root = fakeInstall();
  const kp = release(root);
  fs.appendFileSync(path.join(root, "dist", "index.test.js"), "// more\n");
  assert.equal(verifyIntegrity(root, kp.publicKeyB64).state, "ok");
});

test("an edited manifest line fails the signature, so the hashes cannot be rewritten to match", () => {
  const root = fakeInstall();
  const kp = release(root);
  fs.appendFileSync(path.join(root, "dist", "index.js"), "// evil\n");
  const evil = crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "dist", "index.js"))).digest("hex");
  const manifestPath = path.join(root, MANIFEST_FILE);
  const text = fs.readFileSync(manifestPath, "utf8").replace(/^[0-9a-f]{64}( {2}dist\/index\.js)$/m, `${evil}$1`);
  fs.writeFileSync(manifestPath, text);
  assert.equal(verifyIntegrity(root, kp.publicKeyB64).state, "bad-signature");
});

test("a manifest signed by somebody else's key is rejected", () => {
  const root = fakeInstall();
  release(root, keyPair()); // signed by key A
  assert.equal(verifyIntegrity(root, keyPair().publicKeyB64).state, "bad-signature"); // checked against key B
});

test("a signature made without the release domain (like a licence signature) is rejected", () => {
  const root = fakeInstall();
  const kp = keyPair();
  const body = buildManifestBody(root);
  const sig = crypto.sign(null, Buffer.from(body, "utf8"), kp.privateKey).toString("base64url");
  fs.writeFileSync(path.join(root, MANIFEST_FILE), `${body}signature: ${sig}\n`);
  assert.equal(verifyIntegrity(root, kp.publicKeyB64).state, "bad-signature");
  // and the domain-separated one is accepted, so the test is not just always failing
  assert.equal(crypto.verify(null, signedBytes(body), crypto.createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: kp.publicKeyB64 }, format: "jwk" }), crypto.sign(null, signedBytes(body), kp.privateKey)), true);
});

test("garbage or truncated manifests do not crash, they are bad-signature", () => {
  const root = fakeInstall();
  const kp = keyPair();
  for (const text of ["", "hello", "unpruuf-release:v1\nsignature: abc\n", "unpruuf-release:v1\nsignature: " + "A".repeat(86) + "\n"]) {
    fs.writeFileSync(path.join(root, MANIFEST_FILE), text);
    assert.equal(verifyIntegrity(root, kp.publicKeyB64).state, "bad-signature", JSON.stringify(text));
  }
});

test("a checkout without a manifest is 'unsigned' (development), not an error", () => {
  const root = fakeInstall();
  const r = verifyIntegrity(root, keyPair().publicKeyB64);
  assert.equal(r.state, "unsigned");
  assert.equal(r.version, "9.9.9");
});
