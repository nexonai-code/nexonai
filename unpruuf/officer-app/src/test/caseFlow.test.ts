import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { x25519GenerateKeyPair } from "../crypto/primitives";
import { ratchetDecrypt, ratchetEncrypt, RatchetError, RatchetState } from "../crypto/doubleRatchet";
import { decryptWithKey, encryptForContact } from "../crypto/outerEnvelope";
import { padPacket, unpadPacket } from "../wire/networkObfuscation";
import { decodeFrame, encodeFrame, splitFrame } from "../wire/ratchetFrame";
import { decodeMessagePayload, encodeText } from "../wire/messagePayload";
import { encodeCrossPlatformPayload } from "../pairing/crossPlatformPairing";
import { OfficerIdentity, pairSecret, wireTag } from "../officer/officerIdentity";
import { createRatchetSession } from "../officer/ratchetBootstrap";
import { CaseStore, deriveDbKey } from "../store/caseStore";
import { PollAndIngestLoop } from "../officer/pollAndIngest";
import { RelayClient } from "../relay/relayClient";
import { CASE_HELLO_TEXT, CASE_SIGNAL_PREFIX, sendCaseUpdate } from "../officer/caseSignals";
import {
  encodeIntakePlaintext, generateCaseNumber, intakeHour, intakeTag, isCaseNumber, openIntake, parseIntakePlaintext, sealIntake,
} from "../officer/caseIntake";

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

/** A reporter built from the same wire-compatible modules the web-reporter uses. */
class Reporter {
  id = newIdentity();
  wireIdentity = randomUUID();
  state: RatchetState;
  constructor(private officer: OfficerIdentity, private relay: FakeRelay) {
    this.state = createRatchetSession(this.id, Buffer.from(officer.x25519PublicKey).toString("base64"), Buffer.from(officer.messageKey).toString("base64"));
  }
  get officerKeyB64() { return Buffer.from(this.officer.messageKey).toString("base64"); }
  pairingJson() {
    return encodeCrossPlatformPayload({
      version: 2,
      userId: this.id.userId,
      messageKeyBase64: Buffer.from(this.id.messageKey).toString("base64"),
      x25519RatchetPublicKeyBase64: Buffer.from(this.id.x25519PublicKey).toString("base64"),
      relayConnectionStrings: [RELAY],
      appEdition: "whistleblower",
    });
  }
  async sendIntake() {
    const sealed = sealIntake(this.officer.x25519PublicKey, this.officer.messageKey, encodeIntakePlaintext({ wireIdentity: this.wireIdentity, pairingJson: this.pairingJson() }));
    await this.relay.push(intakeTag(this.officer.messageKey, intakeHour()), Buffer.from(padPacket(sealed)).toString("base64"));
  }
  /** Ratchet text tagged with the announced wire identity, like the Android app. */
  async send(text: string): Promise<boolean> {
    const secret = pairSecret(this.id.messageKey, this.officerKeyB64);
    let enc;
    try {
      enc = ratchetEncrypt(this.state, encodeText(text), secret);
    } catch (err) {
      if (err instanceof RatchetError) return false;
      throw err;
    }
    for (const frame of splitFrame(enc.header, enc.ciphertext)) {
      const outer = encryptForContact(encodeFrame(frame), this.officer.messageKey);
      await this.relay.push(wireTag(secret, this.wireIdentity, 0), Buffer.from(padPacket(outer)).toString("base64"));
    }
    return true;
  }
  async receive(): Promise<string[]> {
    const secret = pairSecret(this.id.messageKey, this.officerKeyB64);
    const tag = wireTag(secret, this.officer.userId, 0);
    const blobs = (await this.relay.fetchMany([tag]))[tag];
    const texts: string[] = [];
    for (const b of blobs) {
      const framed = decryptWithKey(unpadPacket(new Uint8Array(Buffer.from(b, "base64"))), this.id.messageKey);
      const frame = decodeFrame(framed);
      if (!frame || frame.kind !== "single") continue;
      const content = decodeMessagePayload(ratchetDecrypt(this.state, frame.header, frame.ciphertext, secret));
      if (content?.kind === "text") texts.push(content.text);
    }
    return texts;
  }
}

function setup() {
  const officer = newIdentity();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "officer-case-test-"));
  const store = new CaseStore(path.join(dir, "cases.sqlite"), deriveDbKey(officer));
  const relay = new FakeRelay();
  const loop = new PollAndIngestLoop(officer, store, relay as unknown as RelayClient);
  return { officer, store, relay, loop };
}

function parseSignal(text: string) {
  assert.ok(text.startsWith(CASE_SIGNAL_PREFIX), `expected a case signal, got: ${text}`);
  return JSON.parse(text.slice(CASE_SIGNAL_PREFIX.length));
}

test("intake seal/open round-trips and a stranger's key can't open it", () => {
  const officer = newIdentity();
  const plain = encodeIntakePlaintext({ wireIdentity: randomUUID(), pairingJson: '{"v":2}' });
  const sealed = sealIntake(officer.x25519PublicKey, officer.messageKey, plain);
  assert.deepEqual(parseIntakePlaintext(openIntake(officer, sealed)!)!.pairingJson, '{"v":2}');
  assert.equal(openIntake(newIdentity(), sealed), null);
});

test("case numbers are random, readable and never sequential", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const n = generateCaseNumber();
    assert.ok(isCaseNumber(n), n);
    assert.doesNotMatch(n, /[01ILO]/);
    seen.add(n);
  }
  assert.equal(seen.size, 200);
});

test("organisation QR: one scan creates the case, the reporter gets the case number, status changes arrive", async () => {
  // Several runs so both ratchet roles (officer sends first / reporter sends first) occur.
  for (let run = 0; run < 6; run++) {
    const { officer, store, relay, loop } = setup();
    const reporter = new Reporter(officer, relay);

    await reporter.sendIntake();
    // Like the Android app: a hidden first ratchet message right after pairing, if it can send.
    await reporter.send(CASE_HELLO_TEXT);
    await loop.pollOnce();

    const cases = store.listCases();
    assert.equal(cases.length, 1);
    assert.ok(isCaseNumber(cases[0].caseNumber!));

    // Whichever side the ratchet lets talk first, the receipt is out after at most one more round.
    let texts = await reporter.receive();
    if (texts.length === 0) {
      await loop.pollOnce();
      texts = await reporter.receive();
    }
    assert.equal(texts.length, 1, `run ${run}: receipt expected`);
    const receipt = parseSignal(texts[0]);
    assert.equal(receipt.n, cases[0].caseNumber);
    assert.equal(receipt.s, "acknowledged");
    assert.equal(store.getCase(cases[0].id)!.status, "acknowledged");
    assert.equal(store.getCase(cases[0].id)!.signalPending, false);

    // The report itself, then a status change from the dashboard.
    assert.equal(await reporter.send("Raport: facturi false în departamentul X"), true);
    await loop.pollOnce();
    assert.ok(store.listMessages(cases[0].id).some((m) => m.text.includes("facturi false")));
    assert.ok(!store.listMessages(cases[0].id).some((m) => m.text === CASE_HELLO_TEXT), "hello must stay invisible");

    store.setStatus(cases[0].id, "in_progress");
    assert.equal(await sendCaseUpdate(officer, store, relay as unknown as RelayClient, cases[0].id), "sent");
    const update = parseSignal((await reporter.receive())[0]);
    assert.equal(update.s, "in_progress");
    assert.equal(update.n, cases[0].caseNumber);

    // An intake retry doesn't open a second case.
    await reporter.sendIntake();
    await loop.pollOnce();
    assert.equal(store.listCases().length, 1);
    store.close();
  }
});

test("the Android app's outer-envelope wire-identity signal is understood", async () => {
  const { officer, store, relay, loop } = setup();
  const reporter = new Reporter(officer, relay);
  // Legacy path: case added by paste, so the officer doesn't know the wire identity yet.
  const { addCaseFromPastedCode } = await import("../officer/intake");
  const row = addCaseFromPastedCode(officer, store, reporter.pairingJson());
  const secret = pairSecret(reporter.id.messageKey, reporter.officerKeyB64);
  const signal = encryptForContact(new TextEncoder().encode(`UNPRUUF_NEWID_V1:${reporter.wireIdentity}`), officer.messageKey);
  await relay.push(wireTag(secret, reporter.id.userId, 0), Buffer.from(padPacket(signal)).toString("base64"));
  await loop.pollOnce();
  assert.equal(store.getCaseSecrets(row.id)!.reporterWireIdentity, reporter.wireIdentity);
  store.close();
});
