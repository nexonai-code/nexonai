import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { x25519GenerateKeyPair } from "../crypto/primitives";
import { ratchetDecrypt, ratchetEncrypt, RatchetError, RatchetState } from "../crypto/doubleRatchet";
import { decryptWithKey, encryptForContact } from "../crypto/outerEnvelope";
import { padPacket, unpadPacket } from "../wire/networkObfuscation";
import { decodeFrame, encodeFrame, splitFrame } from "../wire/ratchetFrame";
import { decodeMessagePayload, encodeText } from "../wire/messagePayload";
import { decodeCrossPlatformPayload, encodeCrossPlatformPayload } from "../pairing/crossPlatformPairing";
import { OfficerIdentity, pairSecret, wireTag } from "../officer/officerIdentity";
import { createRatchetSession } from "../officer/ratchetBootstrap";
import { CaseStore, deriveDbKey } from "../store/caseStore";
import { PollAndIngestLoop } from "../officer/pollAndIngest";
import { RelayClient } from "../relay/relayClient";
import { CASE_HELLO_TEXT, CASE_SIGNAL_PREFIX } from "../officer/caseSignals";
import { encodeIntakePlaintext, intakeHour, intakeTag, sealIntake } from "../officer/caseIntake";
import { myPairingPayloadJson } from "../officer/intake";
import { cleanRechercheName, InvalidRechercheError, RechercheService } from "../officer/recherchen";
import { sendReply } from "../officer/sendReply";
import { createDashboardApp } from "../web/app";

/** In-memory stand-in for the blind relay: delete-on-fetch mailbox keyed by tag. */
class FakeRelay {
  boxes = new Map<string, string[]>();
  async push(tag: string, blob: string): Promise<boolean> {
    this.boxes.set(tag, [...(this.boxes.get(tag) ?? []), blob]);
    return true;
  }
  async fetchMany(tags: string[]): Promise<Record<string, string[]>> {
    const out: Record<string, string[]> = {};
    for (const t of tags) {
      out[t] = this.boxes.get(t) ?? [];
      this.boxes.delete(t);
    }
    return out;
  }
}

function newIdentity(): OfficerIdentity {
  const kp = x25519GenerateKeyPair();
  return { userId: randomUUID(), messageKey: new Uint8Array(randomBytes(32)), x25519PrivateKey: kp.privateKey, x25519PublicKey: kp.publicKey };
}

const RELAY = "unpruuf-relay:v1:abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzab.onion:tok123";

/** A source's app: scans a code (the officer payload), seals an intake, then talks over the ratchet. */
class Source {
  id = newIdentity();
  wireIdentity = randomUUID();
  /** One ratchet per scanned code, like one contact per code in the app. */
  private sessions = new Map<string, { state: RatchetState; officer: OfficerIdentity }>();
  constructor(private relay: FakeRelay) {}

  /** What the app reads from a scanned code: the officer's keys. */
  scan(code: string): OfficerIdentity {
    const p = decodeCrossPlatformPayload(code)!;
    assert.ok(p, "the code must be a valid pairing payload");
    const officer: OfficerIdentity = {
      userId: p.userId,
      messageKey: new Uint8Array(Buffer.from(p.messageKeyBase64, "base64")),
      x25519PrivateKey: new Uint8Array(32),
      x25519PublicKey: new Uint8Array(Buffer.from(p.x25519RatchetPublicKeyBase64, "base64")),
    };
    this.sessions.set(officer.userId, { state: createRatchetSession(this.id, p.x25519RatchetPublicKeyBase64, p.messageKeyBase64), officer });
    return officer;
  }
  pairingJson() {
    return encodeCrossPlatformPayload({
      version: 2,
      userId: this.id.userId,
      messageKeyBase64: Buffer.from(this.id.messageKey).toString("base64"),
      x25519RatchetPublicKeyBase64: Buffer.from(this.id.x25519PublicKey).toString("base64"),
      relayConnectionStrings: [RELAY],
      appEdition: "press",
    });
  }
  async sendIntake(officer: OfficerIdentity) {
    const sealed = sealIntake(officer.x25519PublicKey, officer.messageKey, encodeIntakePlaintext({ wireIdentity: this.wireIdentity, pairingJson: this.pairingJson() }));
    await this.relay.push(intakeTag(officer.messageKey, intakeHour()), Buffer.from(padPacket(sealed)).toString("base64"));
  }
  async send(officer: OfficerIdentity, text: string): Promise<boolean> {
    const sess = this.sessions.get(officer.userId)!;
    const secret = pairSecret(this.id.messageKey, Buffer.from(officer.messageKey).toString("base64"));
    let enc;
    try {
      enc = ratchetEncrypt(sess.state, encodeText(text), secret);
    } catch (err) {
      if (err instanceof RatchetError) return false;
      throw err;
    }
    for (const frame of splitFrame(enc.header, enc.ciphertext)) {
      const outer = encryptForContact(encodeFrame(frame), officer.messageKey);
      await this.relay.push(wireTag(secret, this.wireIdentity, 0), Buffer.from(padPacket(outer)).toString("base64"));
    }
    return true;
  }
  async receive(officer: OfficerIdentity): Promise<string[]> {
    const sess = this.sessions.get(officer.userId)!;
    const secret = pairSecret(this.id.messageKey, Buffer.from(officer.messageKey).toString("base64"));
    const tag = wireTag(secret, officer.userId, 0);
    const blobs = (await this.relay.fetchMany([tag]))[tag];
    const texts: string[] = [];
    for (const b of blobs) {
      const framed = decryptWithKey(unpadPacket(new Uint8Array(Buffer.from(b, "base64"))), this.id.messageKey);
      const frame = decodeFrame(framed);
      if (!frame || frame.kind !== "single") continue;
      const content = decodeMessagePayload(ratchetDecrypt(sess.state, frame.header, frame.ciphertext, secret));
      if (content?.kind === "text") texts.push(content.text);
    }
    return texts;
  }
}

function setup() {
  const officer = newIdentity();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "officer-recherche-test-"));
  const store = new CaseStore(path.join(dir, "cases.sqlite"), deriveDbKey(officer));
  const relay = new FakeRelay();
  const loop = new PollAndIngestLoop(officer, store, relay as unknown as RelayClient);
  const recherchen = new RechercheService(store, officer);
  return { officer, store, relay, loop, recherchen, dir };
}

test("a research gets its own code: different keys, different letterbox, a valid pairing payload", () => {
  const { officer, recherchen, store } = setup();
  const a = recherchen.create("Bauprojekt Piața Centrală");
  const b = recherchen.create("Ausschreibung Straßenbau");
  const codeGeneral = myPairingPayloadJson(officer, RELAY);
  const codeA = recherchen.pairingCode(a.id, RELAY);
  const codeB = recherchen.pairingCode(b.id, RELAY);
  assert.notEqual(codeA, codeGeneral);
  assert.notEqual(codeA, codeB);
  const pa = decodeCrossPlatformPayload(codeA)!, pb = decodeCrossPlatformPayload(codeB)!, pg = decodeCrossPlatformPayload(codeGeneral)!;
  for (const p of [pa, pb]) {
    assert.equal(p.version, 2);
    assert.equal(p.appEdition, "officer", "the reporter apps accept it like the general code");
    assert.deepEqual(p.relayConnectionStrings, [RELAY]);
  }
  const keys = new Set([pa.userId, pb.userId, pg.userId, pa.messageKeyBase64, pb.messageKeyBase64, pg.messageKeyBase64, pa.x25519RatchetPublicKeyBase64, pb.x25519RatchetPublicKeyBase64, pg.x25519RatchetPublicKeyBase64]);
  assert.equal(keys.size, 9, "no key or id is shared between codes");
  store.close();
});

test("a tip through a research code arrives filed under that research; the receipt and the reply work", async () => {
  for (let run = 0; run < 4; run++) {
    const { officer, store, relay, loop, recherchen } = setup();
    const rA = recherchen.create("Bauprojekt");
    const source = new Source(relay);
    const idA = source.scan(recherchen.pairingCode(rA.id, RELAY));

    await source.sendIntake(idA);
    await source.send(idA, CASE_HELLO_TEXT);
    await loop.pollOnce();

    const cases = store.listCases();
    assert.equal(cases.length, 1);
    assert.equal(cases[0].rechercheId, rA.id);

    let texts = await source.receive(idA);
    if (texts.length === 0) {
      await loop.pollOnce();
      texts = await source.receive(idA);
    }
    assert.equal(texts.length, 1, `run ${run}: receipt expected`);
    assert.ok(texts[0].startsWith(CASE_SIGNAL_PREFIX));

    assert.equal(await source.send(idA, "Hinweis: Auftrag ging ohne Ausschreibung an die Firma X"), true);
    await loop.pollOnce();
    assert.ok(store.listMessages(cases[0].id).some((m) => m.text.includes("ohne Ausschreibung")));

    // The reply goes out with the research's identity, and the source can read it.
    const result = await sendReply(recherchen.identityForCase(cases[0].id), store, relay as unknown as RelayClient, cases[0].id, "Danke, kennen Sie Unterlagen dazu?");
    assert.equal(result, "sent");
    assert.deepEqual(await source.receive(idA), ["Danke, kennen Sie Unterlagen dazu?"]);
    assert.equal(officer.userId === idA.userId, false);
    store.close();
  }
});

test("the general code and a research code run side by side without mixing tips", async () => {
  const { officer, store, relay, loop, recherchen } = setup();
  const rA = recherchen.create("Bauprojekt");
  const s1 = new Source(relay), s2 = new Source(relay);
  const general = s1.scan(myPairingPayloadJson(officer, RELAY));
  const research = s2.scan(recherchen.pairingCode(rA.id, RELAY));
  await s1.sendIntake(general);
  await s2.sendIntake(research);
  await loop.pollOnce();
  const cases = store.listCases();
  assert.equal(cases.length, 2);
  assert.equal(cases.filter((c) => c.rechercheId === null).length, 1);
  assert.equal(cases.filter((c) => c.rechercheId === rA.id).length, 1);
  assert.deepEqual([...store.countCasesByRecherche().entries()].sort(), [["", 1], [rA.id, 1]].sort());
  store.close();
});

test("one source writing to two researches opens one tip per research", async () => {
  const { store, relay, loop, recherchen } = setup();
  const rA = recherchen.create("A"), rB = recherchen.create("B");
  const source = new Source(relay);
  const a = source.scan(recherchen.pairingCode(rA.id, RELAY));
  const b = source.scan(recherchen.pairingCode(rB.id, RELAY));
  await source.sendIntake(a);
  await source.sendIntake(b);
  await loop.pollOnce();
  const cases = store.listCases();
  assert.equal(cases.length, 2);
  assert.deepEqual(cases.map((c) => c.rechercheId).sort(), [rA.id, rB.id].sort());
  // A repeated intake for the same research is a retry, not a new tip.
  await source.sendIntake(a);
  await loop.pollOnce();
  assert.equal(store.listCases().length, 2);
  store.close();
});

test("a paused research ignores new tips, keeps the old ones usable, and a resumed one accepts again", async () => {
  const { store, relay, loop, recherchen } = setup();
  const r = recherchen.create("Bauprojekt");
  const first = new Source(relay);
  const id1 = first.scan(recherchen.pairingCode(r.id, RELAY));
  await first.sendIntake(id1);
  await first.send(id1, CASE_HELLO_TEXT);
  await loop.pollOnce();
  assert.equal(store.listCases().length, 1);

  recherchen.update(r.id, { active: false });
  const late = new Source(relay);
  const id2 = late.scan(recherchen.pairingCode(r.id, RELAY));
  await late.sendIntake(id2);
  await loop.pollOnce();
  assert.equal(store.listCases().length, 1, "a paused code takes no new tip");

  // The first source can still write and gets answers. (A fresh ratchet lets this side send only
  // after it has received something, so take the receipt first, like the real app does.)
  let receipt = await first.receive(id1);
  if (receipt.length === 0) {
    await loop.pollOnce();
    receipt = await first.receive(id1);
  }
  assert.ok(receipt.length >= 1, "the receipt of the first tip arrives although the code is now paused");
  assert.equal(await first.send(id1, "noch eine Information"), true);
  await loop.pollOnce();
  assert.ok(store.listMessages(store.listCases()[0].id).some((m) => m.text.includes("noch eine Information")));

  // The late intake was left in the letterbox and is picked up after resuming.
  recherchen.update(r.id, { active: true });
  await late.sendIntake(id2);
  await loop.pollOnce();
  assert.equal(store.listCases().length, 2);
  store.close();
});

test("research names are checked and cleaned", () => {
  assert.equal(cleanRechercheName("  Bau   projekt \n"), "Bau projekt");
  assert.throws(() => cleanRechercheName(""), InvalidRechercheError);
  assert.throws(() => cleanRechercheName("   "), InvalidRechercheError);
  assert.throws(() => cleanRechercheName("x".repeat(81)), InvalidRechercheError);
  assert.throws(() => cleanRechercheName(42), InvalidRechercheError);
});

test("research secrets are not readable in the database file", () => {
  const { store, recherchen, dir } = setup();
  const r = recherchen.create("Geheim");
  const id = recherchen.identityFor(r.id);
  store.close();
  const raw = fs.readFileSync(path.join(dir, "cases.sqlite"));
  const hex = Buffer.from(id.x25519PrivateKey).toString("hex");
  const b64 = Buffer.from(id.x25519PrivateKey).toString("base64");
  assert.ok(!raw.includes(Buffer.from(id.x25519PrivateKey)), "private key not in plain");
  assert.ok(!raw.includes(hex) && !raw.includes(b64));
});

test("the dashboard API: create, list with codes and counts, pause, rename, export; compliance has none of it", async () => {
  const officer = newIdentity();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "officer-recherche-api-"));
  const store = new CaseStore(path.join(dir, "cases.sqlite"), deriveDbKey(officer));
  const relay = { push: async () => true, fetchMany: async () => ({}) } as unknown as RelayClient;
  const press = { get: () => ({ retentionDays: 0, warnAfterHours: 12 }), startedAt: 1, offlineGapMs: 0, lastOkPollAt: null, recordPoll() {}, update: (x: unknown) => x } as any;
  const mk = (edition: "press" | "compliance") => createDashboardApp(officer, store, relay, RELAY, "http://r.example", undefined, edition, edition === "press" ? press : undefined).listen(0);
  const serverPress = mk("press"), serverStd = mk("compliance");
  const base = (s: any) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
  const post = (u: string, body: unknown) => fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  try {
    assert.equal((await fetch(`${base(serverStd)}/api/recherchen`)).status, 404);
    assert.equal((await post(`${base(serverStd)}/api/recherchen`, { name: "x" })).status, 404);

    assert.equal((await post(`${base(serverPress)}/api/recherchen`, { name: "" })).status, 400);
    const created = await (await post(`${base(serverPress)}/api/recherchen`, { name: "Bauprojekt" })).json() as any;
    assert.equal(created.name, "Bauprojekt");
    assert.equal(created.active, true);

    const list = await (await fetch(`${base(serverPress)}/api/recherchen`)).json() as any;
    assert.equal(list.recherchen.length, 1);
    const item = list.recherchen[0];
    assert.match(item.qrDataUrl, /^data:image\/png;base64,/);
    assert.match(item.qrDataUrlLarge, /^data:image\/png;base64,/);
    assert.ok(item.pairingCode.includes('"v":2'));
    assert.equal(item.tipCount, 0);

    const paused = await (await post(`${base(serverPress)}/api/recherchen/${created.id}`, { active: false, name: "Bauprojekt Zentrum" })).json() as any;
    assert.equal(paused.active, false);
    assert.equal(paused.name, "Bauprojekt Zentrum");
    assert.equal((await post(`${base(serverPress)}/api/recherchen/nope`, { active: true })).status, 404);

    const exp = await fetch(`${base(serverPress)}/api/recherchen/export`);
    assert.match(exp.headers.get("content-disposition") ?? "", /tip-page-codes\.txt/);
    const lines = (await exp.text()).trim().split("\n");
    assert.equal(lines.length, 2);
    assert.ok(lines[0].startsWith("* | {"));
    assert.ok(lines[1].startsWith("Bauprojekt Zentrum | {"));
    assert.equal(lines[1].slice("Bauprojekt Zentrum | ".length), item.pairingCode);

    // A tip filed under the research shows its name in the case list.
    const rows = new RechercheService(store, officer);
    const row = store.createCase({
      reporterUserId: "r", reporterMessageKeyB64: "", reporterX25519PublicKeyB64: "", reporterRelayConnectionStrings: [], reporterWireIdentity: null, myGeneration: 0, theirGeneration: 0,
      ratchet: { dhsPrivateKeyB64: "", dhsPublicKeyB64: "", dhrB64: null, rootKeyB64: "", sendChainKeyB64: null, recvChainKeyB64: null, sendCount: 0, recvCount: 0, previousChainLength: 0, skippedKeysB64: {} },
    }, "HW-TEST-0001", created.id);
    void rows;
    const cases = await (await fetch(`${base(serverPress)}/api/cases`)).json() as any;
    assert.equal(cases[0].rechercheName, "Bauprojekt Zentrum");
    assert.equal(cases[0].id, row.id);
    const count = await (await fetch(`${base(serverPress)}/api/recherchen`)).json() as any;
    assert.equal(count.recherchen[0].tipCount, 1);
  } finally {
    serverPress.close();
    serverStd.close();
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
