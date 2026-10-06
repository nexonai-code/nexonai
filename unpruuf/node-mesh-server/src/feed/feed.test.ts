import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { AddressInfo } from "net";
import { buildNodeListFile } from "../nodeList";
import { createFeedApp } from "./feedApp";
import { deriveEpochKey, openList, parseFeedCode, splitLists } from "./feedCrypto";
import { FeedOnionService, OnionControl } from "./feedOnion";
import { FeedStore } from "./feedStore";

const PASS = "correct horse battery";
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "feed-test-"));
const addr = (i: number) => `n${String(i).padStart(3, "0")}${"a".repeat(51)}.onion`;
const listFile = (name: string, n = 3) => buildNodeListFile({ name, ownerSecret: "Owner_secret_0123456789-AB", control: null, addresses: Array.from({ length: n }, (_, i) => addr(i)) });

test("setup creates the feed code; the server keeps neither content key nor signing key in the clear", () => {
  const dir = tmp();
  const store = new FeedStore(dir);
  assert.equal(store.isSetUp(), false);
  const code = store.setup({ name: "Acme GmbH", periodHours: 6, passphrase: PASS });
  assert.equal(code.periodHours, 6);
  const raw = fs.readFileSync(path.join(dir, "feed-config.json"), "utf8");
  assert.ok(!raw.includes(code.contentKey.toString("base64url")), "content key must not be readable on disk");
  assert.ok(!raw.includes(code.contentKey.toString("base64")), "content key must not be readable on disk");
  assert.ok(raw.includes(code.addressSeed.toString("base64url")), "the address seed stays readable so the service can run unattended");
  assert.throws(() => store.setup({ name: "x", periodHours: 6, passphrase: PASS }), /already set up/);
  // the code can be rebuilt with the passphrase, not without
  assert.deepEqual(parseFeedCode(store.feedCodeText(PASS)!)!.contentKey, code.contentKey);
  assert.equal(store.feedCodeText("wrong passphrase!!"), null);
});

test("setup refuses a weak passphrase and a silly period", () => {
  const store = new FeedStore(tmp());
  assert.throws(() => store.setup({ name: "x", periodHours: 6, passphrase: "short" }), /passphrase/);
  assert.throws(() => store.setup({ name: "x", periodHours: 0, passphrase: PASS }), /period/);
  assert.throws(() => store.setup({ name: "x", periodHours: 25, passphrase: PASS }), /period/);
});

test("publish: needs the passphrase, checks every list, raises seq, and the app side can open the result", () => {
  const store = new FeedStore(tmp());
  const code = store.setup({ name: "Acme", periodHours: 6, passphrase: PASS });
  assert.throws(() => store.publish("wrong passphrase!!", [listFile("A")]), /wrong passphrase/);
  assert.throws(() => store.publish(PASS, []), /no list/);
  assert.throws(() => store.publish(PASS, ["not a list"]), /not a node-list file/);
  assert.throws(() => store.publish(PASS, [listFile("A"), listFile("A")]), /names must differ/);
  assert.equal(store.current(), null);

  assert.deepEqual(store.publish(PASS, [listFile("Wien"), listFile("Zürich", 5)]), { seq: 1, lists: 2 });
  assert.deepEqual(store.publish(PASS, [listFile("Wien")]), { seq: 2, lists: 1 });
  assert.equal(store.currentSeq(), 2);
  const opened = openList(store.current()!, code.contentKey, code.signPublicKey)!;
  assert.equal(opened.seq, 2);
  assert.equal(splitLists(opened.plaintext).length, 1);
});

test("the public endpoint serves the list file and nothing else", async () => {
  const store = new FeedStore(tmp());
  store.setup({ name: "Acme", periodHours: 6, passphrase: PASS });
  let served = 0;
  const server = createFeedApp(store, () => served++).listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    assert.equal((await fetch(`${base}/list`)).status, 404); // nothing published yet
    store.publish(PASS, [listFile("A")]);
    const res = await fetch(`${base}/list`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), store.current());
    assert.equal(served, 1);
    assert.equal((await fetch(`${base}/other`)).status, 404);
    assert.equal((await fetch(`${base}/`)).status, 404);
  } finally {
    server.close();
  }
});

class FakeControl implements OnionControl {
  isClosed = false;
  live = new Map<string, string>(); // serviceId -> key
  adds: string[] = [];
  async addOnion(o: { privateKey: string | null }) {
    // like Tor: the service id comes from the key; here: look it up by key
    const id = KEY_TO_ID.get(o.privateKey!)!;
    this.live.set(id, o.privateKey!);
    this.adds.push(id);
    return { serviceId: id, privateKey: o.privateKey! };
  }
  async delOnion(id: string) {
    this.live.delete(id);
  }
}
const KEY_TO_ID = new Map<string, string>();

test("the rotating onion adds the next address before the switch, drops the old one after, and keeps at most two alive", async () => {
  const seed = Buffer.alloc(32, 9);
  const H = 3_600_000;
  const t0 = 2000 * 6 * H;
  for (const e of [1998, 1999, 2000, 2001, 2002]) {
    const k = deriveEpochKey(seed, e);
    KEY_TO_ID.set(k.torPrivateKey, k.address.replace(".onion", ""));
  }
  let now = t0 + 2 * H;
  const svc = new FeedOnionService({ workDir: "x", torBinDir: "x", localPort: 1, addressSeed: seed, periodHours: 6, pow: { queueRate: 1, queueBurst: 1 }, log: () => undefined, now: () => now });
  const fake = new FakeControl();
  svc.useControl(fake);

  await svc.tick();
  assert.equal(fake.live.size, 1);
  assert.equal(svc.getStatus().currentAddress, deriveEpochKey(seed, 2000).address);
  assert.equal(svc.getStatus().nextSwitchAt, t0 + 6 * H);

  now = t0 + 6 * H - 10 * 60_000; // ten minutes before the switch: the next address goes up
  await svc.tick();
  assert.equal(fake.live.size, 2);
  assert.ok(fake.live.has(deriveEpochKey(seed, 2001).address.replace(".onion", "")));

  now = t0 + 6 * H + 5 * 60_000; // just after: both still alive (grace for slow clocks)
  await svc.tick();
  assert.equal(fake.live.size, 2);
  assert.equal(svc.getStatus().currentAddress, deriveEpochKey(seed, 2001).address);

  now = t0 + 6 * H + 3 * H; // later: the old one is gone
  await svc.tick();
  assert.deepEqual([...fake.live.keys()], [deriveEpochKey(seed, 2001).address.replace(".onion", "")]);
});

test("if Tor publishes a different address than the one the app will compute, the service refuses to run silently wrong", async () => {
  const seed = Buffer.alloc(32, 3);
  const k = deriveEpochKey(seed, 500);
  const svc = new FeedOnionService({ workDir: "x", torBinDir: "x", localPort: 1, addressSeed: seed, periodHours: 6, pow: { queueRate: 1, queueBurst: 1 }, log: () => undefined, now: () => 500 * 6 * 3_600_000 + 1 });
  svc.useControl({ isClosed: false, async addOnion() { return { serviceId: "a".repeat(56), privateKey: k.torPrivateKey }; }, async delOnion() {} });
  await assert.rejects(() => svc.tick(), /expected/);
});

test("setup page: header guard, setup returns a working feed code + QR, publish and wrong passphrase over HTTP", async () => {
  const { createFeedAdminApp } = await import("./feedAdmin");
  const store = new FeedStore(tmp());
  let started = 0;
  const port = 21000 + Math.floor(Math.random() * 1000);
  const listener = createFeedAdminApp({ store, onion: () => null, startService: () => void started++, served: () => 0 }, port).listen(port, "127.0.0.1");
  const post = (p: string, body: unknown, header = true) =>
    fetch(`http://localhost:${port}${p}`, { method: "POST", headers: { "content-type": "application/json", ...(header ? { "x-unpruuf-admin": "1" } : {}) }, body: JSON.stringify(body) });
  try {
    assert.equal((await post("/setup", { name: "Acme", periodHours: 6, passphrase: PASS }, false)).status, 403);
    const weak = await post("/setup", { name: "Acme", periodHours: 6, passphrase: "x" });
    assert.equal(weak.status, 400);
    const ok = await post("/setup", { name: "Acme", periodHours: 6, passphrase: PASS });
    assert.equal(ok.status, 200);
    const j = (await ok.json()) as { code: string; qr: string };
    assert.match(j.qr, /^data:image\/png;base64,/);
    const code = parseFeedCode(j.code)!;
    assert.equal(code.name, "Acme");
    assert.equal(started, 1);

    assert.equal((await post("/publish", { passphrase: "nope nope nope", lists: [listFile("A")] })).status, 401);
    assert.equal((await post("/publish", { passphrase: PASS, lists: ["junk"] })).status, 400);
    const pub = await post("/publish", { passphrase: PASS, lists: [listFile("A"), listFile("B")] });
    assert.deepEqual(await pub.json(), { seq: 1, lists: 2 });
    assert.equal(openList(store.current()!, code.contentKey, code.signPublicKey)!.seq, 1);

    assert.equal((await post("/code", { passphrase: "nope nope nope" })).status, 401);
    assert.equal(((await (await post("/code", { passphrase: PASS })).json()) as { code: string }).code, j.code);

    const status = (await (await fetch(`http://localhost:${port}/status.json`)).json()) as { setUp: boolean; seq: number; periodHours: number };
    assert.deepEqual([status.setUp, status.seq, status.periodHours], [true, 1, 6]);
    const page = await (await fetch(`http://localhost:${port}/`)).text();
    assert.match(page, /Version 1/);
    assert.doesNotMatch(page, /\.onion/); // the page never shows an address
  } finally {
    listener.close();
  }
});
