import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { x25519GenerateKeyPair } from "../crypto/primitives";
import { encodeCrossPlatformPayload } from "../pairing/crossPlatformPairing";
import { OfficerIdentity } from "../officer/officerIdentity";
import { addCaseFromPastedCode, InvalidPairingCodeError } from "../officer/intake";
import { CaseStore, deriveDbKey } from "../store/caseStore";
import { caseSignalText, CASE_SIGNAL_PREFIX } from "../officer/caseSignals";

const RELAY = "unpruuf-relay:v1:abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzab.onion:tok123";

function identity(): OfficerIdentity {
  const kp = x25519GenerateKeyPair();
  return { userId: randomUUID(), messageKey: new Uint8Array(randomBytes(32)), x25519PrivateKey: kp.privateKey, x25519PublicKey: kp.publicKey };
}
function reporterCode(edition: string): string {
  const kp = x25519GenerateKeyPair();
  return encodeCrossPlatformPayload({
    version: 2,
    userId: randomUUID(),
    messageKeyBase64: Buffer.from(randomBytes(32)).toString("base64"),
    x25519RatchetPublicKeyBase64: Buffer.from(kp.publicKey).toString("base64"),
    relayConnectionStrings: [RELAY],
    appEdition: edition,
  });
}

test("the officer app accepts the reporter app of the press edition, and still refuses other editions", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "press-intake-"));
  const id = identity();
  const store = new CaseStore(path.join(dir, "c.sqlite"), deriveDbKey(id));
  try {
    assert.ok(addCaseFromPastedCode(id, store, reporterCode("press")).caseNumber);
    assert.ok(addCaseFromPastedCode(id, store, reporterCode("whistleblower")).caseNumber);
    assert.throws(() => addCaseFromPastedCode(id, store, reporterCode("standard")), InvalidPairingCodeError);
    assert.equal(store.listCases().length, 2);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the status signal carries deadlines in unpruuf Compliance and none in unpruuf Press", () => {
  const row = { id: "x", caseNumber: "HW-AAAA-BBBB", signalPending: false, status: "new" as const, category: null, openedAt: 1000, ackDueAt: 2000, feedbackDueAt: 3000, acknowledgedAt: null, closedAt: null, lastActivityAt: 1000, rechercheId: null };
  const standard = JSON.parse(caseSignalText(row, "HW-AAAA-BBBB", "acknowledged", 5000, true).slice(CASE_SIGNAL_PREFIX.length));
  assert.equal(standard.a, 2000);
  assert.equal(standard.f, 3000);
  const press = JSON.parse(caseSignalText(row, "HW-AAAA-BBBB", "acknowledged", 5000, false).slice(CASE_SIGNAL_PREFIX.length));
  assert.equal(press.a, null);
  assert.equal(press.f, null);
  assert.equal(press.n, "HW-AAAA-BBBB");
  assert.equal(press.s, "acknowledged");
});
