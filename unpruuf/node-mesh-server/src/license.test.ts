import test from "node:test";
import assert from "node:assert/strict";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { LicenseGuard, SERVER_LICENSE_PREFIX, verifyServerLicense } from "./license";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2027, 0, 15);

// Throw-away key pair: the real private key never leaves the vendor's machine.
const keys = crypto.generateKeyPairSync("ed25519");
const PUB = keys.publicKey.export({ format: "jwk" }).x as string;

function sign(payload: string, domain = "unpruuf-server-license-v1\n", key = keys.privateKey): string {
  const sig = crypto.sign(null, Buffer.from(domain + payload, "utf8"), key);
  return `${SERVER_LICENSE_PREFIX}${Buffer.from(payload, "utf8").toString("base64url")}:${sig.toString("base64url")}`;
}
function payload(over: Partial<{ serial: string; customer: string; maxNodes: number; issued: number; expires: number }> = {}): string {
  const o = { serial: "SRV-1", customer: "Acme GmbH", maxNodes: 50, issued: NOW - DAY, expires: NOW + 365 * DAY, ...over };
  return `1|${o.serial}|${o.customer}|${o.maxNodes}|${o.issued}|${o.expires}`;
}
function tmpFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "node-mesh-license-")), "license.txt");
}

test("a genuine code verifies and carries customer, serial, node limit and dates", () => {
  const lic = verifyServerLicense(sign(payload()), PUB)!;
  assert.equal(lic.customer, "Acme GmbH");
  assert.equal(lic.serial, "SRV-1");
  assert.equal(lic.maxNodes, 50);
  assert.equal(lic.expiresAtMs, NOW + 365 * DAY);
});

test("codes signed by the vendor tool (license-tool/lib.js) verify here — interop", (t) => {
  const toolPath = path.join(__dirname, "..", "..", "license-tool", "lib.js");
  if (!fs.existsSync(toolPath)) return t.skip("license-tool not next to node-mesh-server");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const tool = require(toolPath);
  const code = tool.signServerLicense(
    keys.privateKey,
    tool.buildServerPayload({ serial: "SRV-9", customer: "Interop Ltd", maxNodes: 120, issuedAtMs: NOW, expiresAtMs: NOW + DAY }),
  );
  const lic = verifyServerLicense(code, PUB)!;
  assert.equal(lic.customer, "Interop Ltd");
  assert.equal(lic.maxNodes, 120);
  // and the other direction: the tool accepts what this test signs
  assert.equal(tool.verifyServerLicense(keys.publicKey, sign(payload())).serial, "SRV-1");
});

test("tampering, a foreign key, an app license and a missing signature domain are all refused", () => {
  const good = sign(payload());
  // raise the node limit inside the payload, keep the old signature
  const [, rest] = [good.slice(0, SERVER_LICENSE_PREFIX.length), good.slice(SERVER_LICENSE_PREFIX.length)];
  const sig = rest.slice(rest.lastIndexOf(":") + 1);
  const forged = `${SERVER_LICENSE_PREFIX}${Buffer.from(payload({ maxNodes: 500 }), "utf8").toString("base64url")}:${sig}`;
  assert.equal(verifyServerLicense(forged, PUB), null);

  const other = crypto.generateKeyPairSync("ed25519");
  assert.equal(verifyServerLicense(sign(payload(), undefined, other.privateKey), PUB), null);

  // signed without the server domain = what an app license signature looks like
  assert.equal(verifyServerLicense(sign(payload(), ""), PUB), null);
  assert.equal(verifyServerLicense("unpruuf-license:v1:abc:def", PUB), null);
  assert.equal(verifyServerLicense(good.slice(0, -4), PUB), null);
  assert.equal(verifyServerLicense("", PUB), null);
  // node limit outside 1..500
  assert.equal(verifyServerLicense(sign(payload({ maxNodes: 501 })), PUB), null);
  assert.equal(verifyServerLicense(sign(payload({ maxNodes: 0 })), PUB), null);
});

test("status follows the clock: valid, expiring in the last 30 days, expired", () => {
  let now = NOW;
  const file = tmpFile();
  fs.writeFileSync(file, sign(payload({ expires: NOW + 100 * DAY })));
  const g = new LicenseGuard({ filePath: file, publicKeyB64: PUB, now: () => now });
  assert.equal(g.status(), "valid");
  assert.equal(g.depositBlocked(), null);
  now = NOW + 75 * DAY;
  assert.equal(g.status(), "expiring");
  assert.equal(g.summary().daysLeft, 25);
  assert.equal(g.depositBlocked(), null);
  now = NOW + 101 * DAY;
  assert.equal(g.status(), "expired");
  assert.equal(g.depositBlocked(), "license_expired");
  assert.equal(g.activated(), true); // still starts, so owners can read what is stored
  assert.equal(g.maxNodes(), 50);
});

test("no license: missing, nothing starts, deposits refused, zero nodes", () => {
  const g = new LicenseGuard({ filePath: tmpFile(), publicKeyB64: PUB, now: () => NOW });
  assert.equal(g.status(), "missing");
  assert.equal(g.activated(), false);
  assert.equal(g.maxNodes(), 0);
  assert.equal(g.depositBlocked(), "license_missing");
});

test("a garbage code in the file is invalid, not missing", () => {
  const file = tmpFile();
  fs.writeFileSync(file, "hello");
  const g = new LicenseGuard({ filePath: file, publicKeyB64: PUB, now: () => NOW });
  assert.equal(g.status(), "invalid");
  assert.equal(g.activated(), false);
});

test("a Temp Node needs no license and is capped at one node", () => {
  const g = new LicenseGuard({ filePath: null, free: true, publicKeyB64: PUB, now: () => NOW });
  assert.equal(g.status(), "free");
  assert.equal(g.activated(), true);
  assert.equal(g.maxNodes(), 1);
  assert.equal(g.depositBlocked(), null);
});

test("apply() stores a genuine code (survives a restart) and rejects bad ones without touching the file", () => {
  const file = tmpFile();
  const g = new LicenseGuard({ filePath: file, publicKeyB64: PUB, now: () => NOW });
  assert.deepEqual(g.apply("nonsense"), { ok: false, error: "invalid" });
  assert.deepEqual(g.apply("unpruuf-license:v1:abc:def"), { ok: false, error: "wrong-type" });
  assert.equal(fs.existsSync(file), false);

  const res = g.apply(sign(payload({ maxNodes: 25 })));
  assert.equal(res.ok, true);
  assert.equal(g.status(), "valid");
  assert.equal(g.maxNodes(), 25);

  const restarted = new LicenseGuard({ filePath: file, publicKeyB64: PUB, now: () => NOW });
  assert.equal(restarted.status(), "valid");
  assert.equal(restarted.summary().customer, "Acme GmbH");
});

test("file and NODE_MESH_LICENSE both count: the one that runs longer wins, so a renewal always takes effect", () => {
  const file = tmpFile();
  const oldCode = sign(payload({ expires: NOW + 10 * DAY, maxNodes: 10 }));
  const renewal = sign(payload({ expires: NOW + 400 * DAY, maxNodes: 80 }));
  fs.writeFileSync(file, renewal);
  const g = new LicenseGuard({ filePath: file, envCode: oldCode, publicKeyB64: PUB, now: () => NOW });
  assert.equal(g.maxNodes(), 80);
  assert.equal(g.status(), "valid");
  const envOnly = new LicenseGuard({ filePath: tmpFile(), envCode: oldCode, publicKeyB64: PUB, now: () => NOW });
  assert.equal(envOnly.maxNodes(), 10);
  assert.equal(envOnly.status(), "expiring");
});
