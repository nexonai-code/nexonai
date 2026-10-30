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
import { buildCaseExport } from "../web/caseExport";
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

test("the dashboard offers English next to Romanian, with every key present in both", async () => {
  await withApp(async (base) => {
    const html = await (await fetch(`${base}/`)).text();
    assert.match(html, /data-lang="en"/);
    const src = await (await fetch(`${base}/i18n.js`)).text();
    const dict = new Function(`${src}; return I18N;`)() as Record<string, Record<string, unknown>>;
    const ro = Object.keys(dict.ro).sort();
    const en = Object.keys(dict.en).sort();
    assert.deepEqual(en, ro, "English and Romanian have the same keys");
    for (const key of ro) {
      const a = dict.ro[key], b = dict.en[key];
      if (Array.isArray(a)) assert.equal((b as unknown[]).length, a.length, `${key} has the same number of entries`);
      const vars = (v: unknown) => (typeof v === "string" ? (v.match(/\{\w+\}/g) || []).sort().join() : "");
      assert.equal(vars(b), vars(a), `${key} uses the same placeholders`);
    }
  });
});

import { PressSettingsStore } from "../settings/pressSettings";

async function withPressApp(run: (base: string, store: CaseStore, settings: PressSettingsStore, file: string) => Promise<void>) {
  const id = identity();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "officer-press-"));
  const store = new CaseStore(path.join(dir, "cases.sqlite"), deriveDbKey(id));
  const file = path.join(dir, "settings.json");
  const settings = new PressSettingsStore(file);
  const relay = { push: async () => true, fetchMany: async () => ({}) } as unknown as RelayClient;
  const app = createDashboardApp(id, store, relay, "unpruuf-relay:v1:abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzab.onion:tok", "http://relay.example", undefined, "press", settings);
  const server = app.listen(0);
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, store, settings, file);
  } finally {
    server.close();
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** DELETE as the compliance dashboard sends it: with the case number typed back. */
const del = (base: string, id: string, confirmCaseNumber?: string) =>
  fetch(`${base}/api/cases/${id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify(confirmCaseNumber === undefined ? {} : { confirmCaseNumber }) });

test("the standard dashboard reports itself as compliance, exports and deletes a single case, and has no press settings", async () => {
  await withApp(async (base, store) => {
    assert.deepEqual(await (await fetch(`${base}/api/edition`)).json(), { edition: "compliance" });
    const row = store.createCase(SECRETS, "HW-DEL-0001");
    store.appendMessage(row.id, "in", "report text");
    store.appendMessage(row.id, "out", "officer reply");
    const exp = await fetch(`${base}/api/cases/${row.id}/export?format=json`);
    assert.equal(exp.status, 200);
    assert.match(exp.headers.get("content-disposition") ?? "", /attachment; filename="case-HW-DEL-0001-\d{4}-\d{2}-\d{2}\.json"/);
    const doc = (await exp.json()) as any;
    assert.equal(doc.caseNumber, "HW-DEL-0001");
    assert.deepEqual(doc.messages.map((m: any) => [m.from, m.text]), [["reporter", "report text"], ["officer", "officer reply"]]);
    assert.ok(!JSON.stringify(doc).toLowerCase().includes("secret"), "no key material in the export");
    assert.equal((await fetch(`${base}/api/cases/nope/export`)).status, 404);
    assert.equal((await del(base, row.id, "HW-DEL-0001")).status, 200);
    assert.equal(store.getCase(row.id), null, "the case is gone");
    assert.deepEqual(store.listMessages(row.id), []);
    assert.equal((await del(base, row.id, "HW-DEL-0001")).status, 404);
    const res = await fetch(`${base}/api/settings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ retentionDays: 5, pickupWarnHours: 6 }) });
    assert.equal(res.status, 404);
  });
});

test("unpruuf Press: edition info, settings with validation, and deleting a tip for good", async () => {
  await withPressApp(async (base, store, _settings, file) => {
    const e = (await (await fetch(`${base}/api/edition`)).json()) as any;
    assert.equal(e.edition, "press");
    assert.deepEqual(e.settings, { retentionDays: 0, pickupWarnHours: 12 });
    assert.equal(e.offlineGapMs, null, "first start: no gap");

    const post = (body: unknown) => fetch(`${base}/api/settings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await post({ retentionDays: 30, pickupWarnHours: 6 })).status, 200);
    assert.equal((await post({ retentionDays: -1, pickupWarnHours: 6 })).status, 400);
    assert.equal((await post({ retentionDays: 30, pickupWarnHours: 24 })).status, 400, "a warning at 24 hours comes too late");
    assert.equal((await post({ retentionDays: "x", pickupWarnHours: 6 })).status, 400);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")).retentionDays, 30);

    const row = store.createCase(SECRETS, "HW-DEL-0002");
    store.appendMessage(row.id, "in", "a tip text that must disappear");
    const del = await fetch(`${base}/api/cases/${row.id}`, { method: "DELETE" });
    assert.equal(del.status, 200);
    assert.equal(store.getCase(row.id), null);
    assert.deepEqual(store.listMessages(row.id), []);
    assert.equal(store.allPollCandidates().length, 0);
    assert.equal((await fetch(`${base}/api/cases/${row.id}`, { method: "DELETE" })).status, 404);
  });
});

test("unpruuf Press: tips older than the retention period are removed, newer ones stay", async () => {
  await withPressApp(async (_base, store) => {
    const old = store.createCase(SECRETS, "HW-OLD-0001");
    const fresh = store.createCase(SECRETS, "HW-NEW-0001");
    const day = 24 * 60 * 60 * 1000;
    store.appendMessage(old.id, "in", "old", Date.now() - 40 * day);
    store.appendMessage(fresh.id, "in", "fresh", Date.now() - 1 * day);
    assert.equal(store.deleteInactiveBefore(Date.now() - 30 * day), 1);
    assert.equal(store.getCase(old.id), null);
    assert.ok(store.getCase(fresh.id));
  });
});

test("unpruuf Press: the settings file remembers the last pickup, so a restart shows how long the app was off", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "press-settings-"));
  const file = path.join(dir, "settings.json");
  try {
    const first = new PressSettingsStore(file, 1_000_000);
    assert.equal(first.offlineGapMs, null);
    first.recordPoll(2_000_000);
    first.update({ retentionDays: 7, pickupWarnHours: 18 });
    const second = new PressSettingsStore(file, 2_000_000 + 5 * 3600 * 1000);
    assert.equal(second.offlineGapMs, 5 * 3600 * 1000);
    assert.deepEqual(second.get(), { retentionDays: 7, pickupWarnHours: 18 });
    fs.writeFileSync(file, "{ not json");
    assert.deepEqual(new PressSettingsStore(file).get(), { retentionDays: 0, pickupWarnHours: 12 }, "a damaged file falls back to defaults");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ───────── unpruuf Compliance: delete with typed confirmation, deletion log, export ─────────

test("unpruuf Compliance: deleting needs the case number typed back and leaves only number and time in the deletion log", async () => {
  await withApp(async (base, store) => {
    const row = store.createCase(SECRETS, "HW-7Q4M-2X9D");
    store.appendMessage(row.id, "in", "the report text that must disappear");
    store.setStatus(row.id, "acknowledged");
    assert.equal((await del(base, row.id)).status, 400, "no confirmation, no deletion");
    assert.equal((await del(base, row.id, "HW-0000-0000")).status, 400, "a wrong number does not delete");
    assert.ok(store.getCase(row.id), "the case is still there");
    assert.deepEqual(await (await fetch(`${base}/api/deletion-log`)).json(), []);

    const before = Date.now();
    assert.equal((await del(base, row.id, " hw-7q4m-2x9d ")).status, 200, "case and spaces do not matter");
    assert.equal(store.getCase(row.id), null);
    assert.deepEqual(store.listMessages(row.id), []);
    assert.deepEqual(store.listStatusChanges(row.id), [], "the status history goes with the case");
    assert.equal(store.allPollCandidates().length, 0);

    const log = (await (await fetch(`${base}/api/deletion-log`)).json()) as any[];
    assert.equal(log.length, 1);
    assert.deepEqual(Object.keys(log[0]).sort(), ["caseNumber", "deletedAt", "id"], "number and time, nothing else");
    assert.equal(log[0].caseNumber, "HW-7Q4M-2X9D");
    assert.ok(log[0].deletedAt >= before && log[0].deletedAt <= Date.now());
    assert.ok(!JSON.stringify(log).includes("report text"));
    assert.equal((await del(base, row.id, "HW-7Q4M-2X9D")).status, 404, "a deleted case cannot be deleted twice");
    assert.equal(store.listDeletionLog().length, 1, "a failed delete adds no entry");
  });
});

test("unpruuf Compliance: the deletion log keeps entries in order, uses the internal id for cases without a number, and survives a restart", async () => {
  const id = identity();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "officer-dellog-"));
  const file = path.join(dir, "cases.sqlite");
  try {
    const store = new CaseStore(file, deriveDbKey(id));
    const a = store.createCase(SECRETS, "HW-AAAA-0001");
    const b = store.createCase(SECRETS, null);
    assert.equal(store.deleteCase(a.id, { log: true }), true);
    assert.equal(store.deleteCase(b.id, { log: true }), true);
    assert.equal(store.deleteCase("nope", { log: true }), false);
    store.close();
    const reopened = new CaseStore(file, deriveDbKey(id));
    const log = reopened.listDeletionLog();
    assert.deepEqual(log.map((e) => e.caseNumber), [b.id, "HW-AAAA-0001"], "newest first; no number, the internal id instead");
    reopened.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("unpruuf Compliance: a case exports as a self-contained, printable HTML file", async () => {
  await withApp(async (base, store) => {
    const row = store.createCase(SECRETS, "HW-EXP-0001");
    store.setCategory(row.id, "Achiziții & <contracte>");
    store.appendMessage(row.id, "in", "Report: invoices <script>alert(1)</script> were split");
    store.appendMessage(row.id, "out", "Thank you, we are looking into it.");
    store.setStatus(row.id, "acknowledged");
    store.setStatus(row.id, "in_progress");

    const res = await fetch(`${base}/api/cases/${row.id}/export`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /^text\/html/);
    assert.match(res.headers.get("content-disposition") ?? "", /attachment; filename="case-HW-EXP-0001-\d{4}-\d{2}-\d{2}\.html"/);
    const html = await res.text();
    assert.match(html, /^<!doctype html>/);
    assert.match(html, /HW-EXP-0001/);
    assert.match(html, /Achiziții &amp; &lt;contracte&gt;/, "category, escaped");
    assert.match(html, /invoices &lt;script&gt;alert\(1\)&lt;\/script&gt; were split/, "message text, escaped");
    assert.match(html, /Thank you, we are looking into it\./);
    assert.match(html, /Confirmarea primirii \(7 zile/);
    assert.match(html, /Răspuns \(3 luni/);
    assert.match(html, /îndeplinit la timp/, "acknowledgement met");
    assert.match(html, /în curs/, "feedback still running");
    assert.match(html, /Confirmat/);
    assert.match(html, /În lucru/);
    assert.match(html, /Raportor/);
    assert.match(html, /Ofițer/);
    assert.doesNotMatch(html, /<script|<link|<img|src=|@import|url\(|https?:\/\//i, "nothing loaded from outside, no scripts");
    assert.ok(!html.toLowerCase().includes("secret"), "no key material");

    const en = await (await fetch(`${base}/api/cases/${row.id}/export?lang=en`)).text();
    assert.match(en, /<html lang="en">/);
    assert.match(en, /Case record/);
    assert.match(en, /Acknowledgement of receipt \(7 days/);
    assert.match(en, /met on time/);
    assert.equal((await fetch(`${base}/api/cases/nope/export`)).status, 404);
  });
});

test("unpruuf Compliance: the JSON export carries deadlines with their state, the status history and every message", async () => {
  await withApp(async (base, store) => {
    const row = store.createCase(SECRETS, "HW-EXP-0002");
    store.setCategory(row.id, "Fraudă");
    store.appendMessage(row.id, "in", "first report");
    store.appendMessage(row.id, "out", "reply");
    store.setStatus(row.id, "acknowledged");
    store.setStatus(row.id, "closed");

    const res = await fetch(`${base}/api/cases/${row.id}/export?format=json`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /^application\/json/);
    const doc = (await res.json()) as any;
    assert.equal(doc.caseNumber, "HW-EXP-0002");
    assert.equal(doc.category, "Fraudă");
    assert.equal(doc.status, "closed");
    assert.equal(doc.openedAt, new Date(row.openedAt).toISOString());
    assert.equal(doc.deadlines.acknowledgement.dueAt, new Date(row.ackDueAt).toISOString());
    assert.equal(doc.deadlines.acknowledgement.state, "met");
    assert.equal(doc.deadlines.feedback.dueAt, new Date(row.feedbackDueAt).toISOString());
    assert.equal(doc.deadlines.feedback.state, "met");
    assert.ok(doc.deadlines.feedback.doneAt);
    assert.deepEqual(doc.statusChanges.map((c: any) => c.status), ["acknowledged", "closed"]);
    assert.deepEqual(doc.messages.map((m: any) => [m.from, m.text]), [["reporter", "first report"], ["officer", "reply"]]);
    assert.ok(doc.messages.every((m: any) => typeof m.at === "string"));
    assert.ok(!JSON.stringify(doc).toLowerCase().includes("secret"), "no key material");
    assert.equal((await fetch(`${base}/api/cases/nope/export?format=json`)).status, 404);
  });
});

test("unpruuf Compliance: deadline states in an export follow the clock", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "officer-dl-"));
  const store = new CaseStore(path.join(dir, "cases.sqlite"), deriveDbKey(identity()));
  try {
    const row = store.createCase(SECRETS, "HW-DL-0001");
    const day = 24 * 60 * 60 * 1000;
    const late = buildCaseExport(store, row, row.openedAt + 8 * day);
    assert.equal(late.acknowledgement.state, "overdue");
    assert.equal(late.feedback.state, "open");
    assert.equal(buildCaseExport(store, row, row.openedAt + 91 * day).feedback.state, "overdue");
    const ackedLate = buildCaseExport(store, { ...row, acknowledgedAt: row.openedAt + 9 * day }, row.openedAt + 10 * day);
    assert.equal(ackedLate.acknowledgement.state, "met_late");
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("unpruuf Press keeps its delete and JSON export as before: no confirmation, no deletion log", async () => {
  await withPressApp(async (base, store) => {
    const row = store.createCase(SECRETS, "HW-PRS-0001");
    store.appendMessage(row.id, "in", "tip");
    const exp = await fetch(`${base}/api/cases/${row.id}/export`);
    assert.equal(exp.status, 200);
    assert.match(exp.headers.get("content-disposition") ?? "", /attachment; filename="case-HW-PRS-0001\.json"/);
    assert.equal(((await exp.json()) as any).messages[0].text, "tip");
    assert.equal((await fetch(`${base}/api/deletion-log`)).status, 404);
    assert.equal((await fetch(`${base}/api/cases/${row.id}`, { method: "DELETE" })).status, 200);
    assert.deepEqual(store.listDeletionLog(), [], "press keeps no deletion log");
  });
});
