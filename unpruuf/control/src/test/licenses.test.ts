import { test } from "node:test";
import assert from "node:assert/strict";
import { LicenseInventory, parseLicense, licenseState } from "../licenses";
import { LicenseRecord, ServerRecord } from "../vault";
import { appCode, newKeys, serverCode } from "./helpers";

const keys = newKeys();
const srv = (id: string): ServerRecord => ({ id, name: id, licenseSerial: null } as any);
function inv(servers: ServerRecord[] = [], now = Date.now()) {
  const licenses: LicenseRecord[] = [];
  return { licenses, inv: new LicenseInventory(licenses, servers, keys.publicKeyB64, () => now) };
}

test("genuine codes parse, forged or cut codes do not", () => {
  const sc = serverCode(keys, "SRV-0001");
  const p = parseLicense(sc, keys.publicKeyB64)!;
  assert.equal(p.kind, "server");
  assert.equal(p.serial, "SRV-0001");
  assert.equal(p.maxNodes, 250);
  const ap = parseLicense(appCode(keys, "PRO-0001", "group"), keys.publicKeyB64)!;
  assert.equal(ap.kind, "app");
  assert.equal(ap.edition, "group");
  assert.equal(parseLicense(sc.slice(0, -4), keys.publicKeyB64), null);
  assert.equal(parseLicense(sc, newKeys().publicKeyB64), null, "other key");
  // an app code cannot pass as a server code and the other way round (signing domains)
  const swapped = "unpruuf-server-license:v1:" + appCode(keys, "X").slice("unpruuf-license:v1:".length);
  assert.equal(parseLicense(swapped, keys.publicKeyB64), null);
  assert.equal(parseLicense("hello", keys.publicKeyB64), null);
});

test("import finds codes in the licence tool's CSV and in loose text, once each", () => {
  const { inv: i } = inv();
  const a = serverCode(keys, "SRV-0001"), b = serverCode(keys, "SRV-0002"), c = appCode(keys, "PRO-0001");
  const csv = `"serial","customer","edition","issuedAt","expiresAt","licenseCode"\n"SRV-0001","Acme","","x","y","${a}"\n`;
  const r = i.importText(csv + `\n${b}\n${c}\n${a}\nnoise unpruuf-license:v1:abc:def\n`);
  assert.equal(r.added, 3);
  assert.equal(r.duplicates, 1);
  assert.equal(r.invalid.length, 1);
  assert.equal(i.list("server").length, 2);
  assert.equal(i.list("app").length, 1);
  const again = i.importText(a + "\n" + b);
  assert.equal(again.added, 0);
  assert.equal(again.duplicates, 2);
  assert.equal(i.importText("nothing here").invalid.length, 1);
});

test("a later expiry for the same serial is a renewal: code replaced, assignment kept", () => {
  const s = srv("s1");
  const { inv: i } = inv([s]);
  i.importText(serverCode(keys, "SRV-0001", { days: 100 }));
  assert.ok(i.assignToServer("SRV-0001", "s1").ok);
  const before = i.bySerial("server", "SRV-0001")!.expiresAtMs;
  const r = i.importText(serverCode(keys, "SRV-0001", { days: 465 }));
  assert.equal(r.renewed, 1);
  const l = i.bySerial("server", "SRV-0001")!;
  assert.ok(l.expiresAtMs > before);
  assert.equal(l.assigned?.type, "server");
  // an older code for the same serial is only a duplicate
  assert.equal(i.importText(serverCode(keys, "SRV-0001", { days: 10 })).duplicates, 1);
});

test("one code, one server: no double assignment", () => {
  const s1 = srv("s1"), s2 = srv("s2");
  const { inv: i } = inv([s1, s2]);
  i.importText([serverCode(keys, "A"), serverCode(keys, "B")].join("\n"));
  assert.deepEqual(i.assignToServer("A", "s1"), { ok: true });
  assert.equal(s1.licenseSerial, "A");
  assert.deepEqual(i.assignToServer("A", "s2"), { ok: false, error: "taken" });
  assert.deepEqual(i.assignToServer("B", "s1"), { ok: false, error: "server-has-one" });
  assert.deepEqual(i.assignToServer("A", "s1"), { ok: true }, "same pair again is harmless");
  assert.deepEqual(i.assignToServer("Z", "s1"), { ok: false, error: "unknown" });
  assert.deepEqual(i.assignToServer("B", "nope"), { ok: false, error: "no-server" });
  assert.ok(i.release("server", "A"));
  assert.equal(s1.licenseSerial, null);
  assert.deepEqual(i.assignToServer("A", "s2"), { ok: true });
});

test("an expired code cannot be handed out", () => {
  const s = srv("s1");
  const { inv: i } = inv([s], Date.now() + 400 * 86_400_000);
  i.importText(serverCode(keys, "OLD", { days: 30 }));
  assert.deepEqual(i.assignToServer("OLD", "s1"), { ok: false, error: "expired" });
  assert.equal(i.nextFreeServerCode(), null);
});

test("the next code to use: soonest-expiring healthy one; a nearly expired one only as a last resort", () => {
  const { inv: i } = inv();
  i.importText([serverCode(keys, "LONG", { days: 700 }), serverCode(keys, "SHORT", { days: 200 }), serverCode(keys, "ALMOST", { days: 10 })].join("\n"));
  assert.equal(i.nextFreeServerCode()!.serial, "SHORT");
  const { inv: j } = inv();
  j.importText(serverCode(keys, "ALMOST", { days: 10 }));
  assert.equal(j.nextFreeServerCode()!.serial, "ALMOST");
});

test("app codes go to named devices, one device per code", () => {
  const { inv: i } = inv();
  i.importText(appCode(keys, "PRO-1") + "\n" + appCode(keys, "PRO-2"));
  assert.deepEqual(i.assignToDevice("PRO-1", "  Anna, Samsung A54 "), { ok: true });
  assert.equal(i.bySerial("app", "PRO-1")!.assigned?.type, "device");
  assert.deepEqual(i.assignToDevice("PRO-1", "Bob"), { ok: false, error: "taken" });
  assert.deepEqual(i.assignToDevice("PRO-2", "   "), { ok: false, error: "label" });
  assert.deepEqual(i.assignToDevice("NOPE", "x"), { ok: false, error: "unknown" });
  assert.ok(i.release("app", "PRO-1"));
  assert.equal(i.release("app", "PRO-1"), false);
});

test("states, summary and CSV", () => {
  const { inv: i } = inv();
  i.importText([serverCode(keys, "S1", { days: 365 }), serverCode(keys, "S2", { days: 15 }), appCode(keys, "A1")].join("\n"));
  const now = Date.now();
  assert.equal(licenseState(i.bySerial("server", "S1")!, now), "valid");
  assert.equal(licenseState(i.bySerial("server", "S2")!, now), "expiring");
  assert.equal(licenseState(i.bySerial("server", "S1")!, now + 400 * 86_400_000), "expired");
  const sum = i.summary("server");
  assert.deepEqual([sum.total, sum.free, sum.expiring, sum.assigned], [2, 2, 1, 0]);
  const withCodes = i.csv(true), without = i.csv(false);
  assert.ok(withCodes.includes("unpruuf-server-license:v1:"));
  assert.ok(!without.includes("unpruuf-server-license:v1:"));
  assert.ok(without.split("\n")[0].includes("serial"));
});
