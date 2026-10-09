import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { x25519GenerateKeyPair } from "../crypto/primitives";
import { OfficerIdentity } from "../officer/officerIdentity";
import { CaseSecrets, CaseStore, deriveDbKey } from "../store/caseStore";
import { createDashboardApp } from "../web/app";
import { RelayClient } from "../relay/relayClient";

function identity(): OfficerIdentity {
  const kp = x25519GenerateKeyPair();
  return { userId: randomUUID(), messageKey: new Uint8Array(randomBytes(32)), x25519PrivateKey: kp.privateKey, x25519PublicKey: kp.publicKey };
}

const SECRETS: CaseSecrets = {
  reporterUserId: "r", reporterMessageKeyB64: "", reporterX25519PublicKeyB64: "", reporterRelayConnectionStrings: [], reporterWireIdentity: null,
  myGeneration: 0, theirGeneration: 0,
  ratchet: { dhsPrivateKeyB64: "", dhsPublicKeyB64: "", dhrB64: null, rootKeyB64: "", sendChainKeyB64: null, recvChainKeyB64: null, sendCount: 0, recvCount: 0, previousChainLength: 0, skippedKeysB64: {} },
};

async function withApp(run: (base: string, store: CaseStore) => Promise<void>) {
  const id = identity();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "officer-dash-"));
  const store = new CaseStore(path.join(dir, "cases.sqlite"), deriveDbKey(id));
  const relay = { push: async () => true, fetchMany: async () => ({}) } as unknown as RelayClient;
  const status = { viaTor: true, lastPollAt: 1234, lastPollOk: false };
  const app = createDashboardApp(id, store, relay, "unpruuf-relay:v1:abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzab.onion:tok", "http://relay.example", () => status);
  const server = app.listen(0);
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, store);
  } finally {
    server.close();
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("the dashboard serves the page and its bundled fonts without internet", async () => {
  await withApp(async (base) => {
    const html = await (await fetch(`${base}/`)).text();
    assert.match(html, /Panoul ofițerului/);
    assert.match(html, /href="fonts\.css"/, "fonts come from the bundle, not from a CDN");
    assert.doesNotMatch(html, /googleapis|gstatic/);
    const css = await fetch(`${base}/fonts.css`);
    assert.equal(css.status, 200);
    const font = await fetch(`${base}/fonts/IBMPlexSans-400-latin.woff2`);
    assert.equal(font.status, 200);
    assert.ok((await font.arrayBuffer()).byteLength > 5000);
  });
});

test("/api/me carries a small and a large QR for showing the code on a big screen", async () => {
  await withApp(async (base) => {
    const me = (await (await fetch(`${base}/api/me`)).json()) as any;
    assert.match(me.qrDataUrl, /^data:image\/png;base64,/);
    assert.match(me.qrDataUrlLarge, /^data:image\/png;base64,/);
    assert.ok(me.qrDataUrlLarge.length > me.qrDataUrl.length, "the large rendering has more pixels");
    assert.ok(me.pairingCode.includes('"v":2'));
  });
});

test("/api/status reports the relay connection for the dashboard's light", async () => {
  await withApp(async (base) => {
    const s = (await (await fetch(`${base}/api/status`)).json()) as any;
    assert.equal(s.viaTor, true);
    assert.equal(s.lastPollAt, 1234);
    assert.equal(s.lastPollOk, false);
    assert.equal(typeof s.now, "number");
  });
});

test("cases, status and category changes go through the API the new dashboard uses", async () => {
  await withApp(async (base, store) => {
    const row = store.createCase(SECRETS, "HW-TEST-0001");
    const list = (await (await fetch(`${base}/api/cases`)).json()) as any;
    assert.equal(list.length, 1);
    assert.equal(list[0].caseNumber, "HW-TEST-0001");
    assert.ok(list[0].ackDueAt - list[0].openedAt === 7 * 86400000, "receipt due 7 days after opening");
    assert.ok(list[0].feedbackDueAt - list[0].openedAt === 90 * 86400000, "answer due 90 days after opening");

    const post = (p: string, body: unknown) => fetch(`${base}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await post(`/api/cases/${row.id}/category`, { category: "Achiziții" })).status, 200);
    const inProgress = (await (await post(`/api/cases/${row.id}/status`, { status: "in_progress" })).json()) as any;
    assert.equal(inProgress.status, "in_progress");
    assert.equal(inProgress.category, "Achiziții");
    assert.equal((await post(`/api/cases/${row.id}/status`, { status: "nonsense" })).status, 400);

    store.appendMessage(row.id, "in", "Bună ziua");
    const detail = (await (await fetch(`${base}/api/cases/${row.id}`)).json()) as any;
    assert.equal(detail.messages.length, 1);
    assert.equal(detail.messages[0].text, "Bună ziua");
  });
});
