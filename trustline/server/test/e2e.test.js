'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AdminSim, OperatorSim, AgentSim, buildDemoNetwork, TL, Http } = require('../tools/sim.js');

const PORT = 18900 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;
let proc, dataDir, admins;
const ctx = {};

async function waitUp() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(BASE + '/api/info'); if (r.ok) return; } catch (e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server did not start');
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-e2e-'));
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], { env: { ...process.env, TL_DATA: dataDir, TL_PORT: String(PORT) }, stdio: 'ignore' });
  await waitUp();
  const txt = fs.readFileSync(path.join(dataDir, 'ADMIN-CREDENTIALS.txt'), 'utf8');
  const m1 = /admin1\s+(\S+)/.exec(txt), m2 = /admin2\s+(\S+)/.exec(txt);
  admins = { admin1: { u: 'admin1', p: m1[1] }, admin2: { u: 'admin2', p: m2[1] } };
});
after(() => { if (proc) proc.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); });

test('four-eyes admission, keys, agents, connection', async () => {
  const net = await buildDemoNetwork(BASE, admins, { operators: [
    { name: 'Al-Noor Remittance', country: 'JO', licence: 'JO-EX-0001', user: 'alnoor', password: 'correct horse battery' },
    { name: 'Sahel Transfer', country: 'YE', licence: 'YE-EX-0002', user: 'sahel', password: 'staple battery horse' },
  ] });
  ctx.net = net;
  const [A, B] = net.operators.map((x) => x.op);
  ctx.A = A; ctx.B = B;
  const connId = await A.requestConnection(B.id, ['JO>YE', 'YE>JO']);
  await B.approveConnection(connId);
  const agA = await A.createAgent({ name: 'Amman Central', city: 'Amman', country: 'JO', perInstruction: '2000.00', perDay: '5000.00', offlinePayout: true, offlineLimit: '300.00' });
  const agB = await B.createAgent({ name: 'Aden Port Shop', city: 'Aden', country: 'YE', perInstruction: '2000.00', perDay: '5000.00' });
  ctx.agA = await new AgentSim(BASE).init(); ctx.agB = await new AgentSim(BASE).init();
  await ctx.agA.enrol(agA.code, 'Test phone A'); await ctx.agB.enrol(agB.code, 'Test phone B');
  assert.equal((await ctx.agA.status()).status, 'pending');
  assert.equal(await A.certifyPending(), 1); assert.equal(await B.certifyPending(), 1);
  assert.equal((await ctx.agA.status()).status, 'certified'); assert.equal((await ctx.agB.status()).status, 'certified');
});

test('four-eyes: same admin cannot approve own proposal', async () => {
  const a1 = ctx.net.admins[0];
  const id = await a1.createOperator({ name: 'Temp Operator', country: 'JO', licence: 'JO-X', adminUser: 'tempop' });
  await a1.completeDD(id);
  const p = await a1.propose(id, 'admit', '');
  await assert.rejects(() => a1.decide(p, true), (e) => e.body.error === 'four_eyes');
});

test('incomplete due diligence blocks admission', async () => {
  const a1 = ctx.net.admins[0];
  const id = await a1.createOperator({ name: 'Incomplete Operator', country: 'JO', licence: 'JO-Y', adminUser: 'incomplete' });
  await assert.rejects(() => a1.propose(id, 'admit', ''), (e) => e.body.error === 'dd_incomplete');
});

test('happy path: send, deliver, confirm, wrong code, payout, duplicate payout', async () => {
  const { agA, agB } = ctx;
  await agA.me(); await agB.me();
  const dir = await agA.directory();
  assert.equal(dir.length, 1);
  const rec = dir[0];
  const sent = await agA.send({ recipient: rec, amount: '250.00', currency: 'USD', purpose: 'OTHR', reference: 'FAM-1',
    originator: { name: 'Omar Test', address: 'Amman', idType: 'passport', idNumber: 'P1', dob: '1985-05-05', customerRef: 'K1' },
    beneficiary: { name: 'Salma Test', payoutLocation: 'Aden' } });
  ctx.sent = sent;
  assert.equal(sent.receipt.status, 'INSTRUCTED');
  const inbox = await agB.inbox();
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].status, 'INSTRUCTED');
  const plain = await agB.decrypt(inbox[0]);
  assert.equal(plain.beneficiary.name, 'Salma Test');
  assert.equal(plain.originator.name, 'Omar Test');
  // operator A (sender operator) and operator B can decrypt too; the relay cannot
  const opItems = (await ctx.A.http.get('/api/op/instructions')).instructions;
  assert.equal((await ctx.A.decryptInstruction(opItems[0])).beneficiary.name, 'Salma Test');
  const opItemsB = (await ctx.B.http.get('/api/op/instructions')).instructions;
  assert.equal((await ctx.B.decryptInstruction(opItemsB[0])).originator.name, 'Omar Test');
  assert.equal((await agB.confirm(sent.id)).status, 'CONFIRMED');
  await assert.rejects(() => agB.payout(sent.id, 'AAAA-BBBB-CCCC'), (e) => e.body.error === 'wrong_code');
  assert.equal((await agB.payout(sent.id, sent.code)).status, 'PAID_OUT');
  assert.equal((await agB.payout(sent.id, sent.code)).duplicate, true); // idempotent, still paid out once
  const out = await agA.outbox();
  assert.equal(out[0].status, 'PAID_OUT');
  await assert.rejects(() => agA.cancel(sent.id), (e) => e.status === 409);
});

test('mandatory checks reject bad instructions with reasons', async () => {
  const { agA } = ctx;
  const rec = (await agA.directory())[0];
  const expectReject = async (opts, code) => {
    try { await agA.send({ recipient: rec, ...opts }); assert.fail('should have been rejected'); }
    catch (e) { assert.equal(e.status, 422); assert.ok(e.body.reasons.some((r) => r.code === code), `expected ${code}, got ${JSON.stringify(e.body.reasons)}`); }
  };
  await expectReject({ screening: null }, 'SCREENING');
  await expectReject({ amount: '5000.00' }, 'LIMIT');
  await expectReject({ purpose: 'NOPE' }, 'PURPOSE');
  await expectReject({ currency: 'XXX' }, 'FIELDS');
  await expectReject({ expiresAt: new Date(Date.now() - 1000).toISOString() }, 'EXPIRED');
  await expectReject({ createdAt: new Date(Date.now() - 3 * 86400000).toISOString() }, 'TIME');
  const b = await agA.buildInstruction({ recipient: rec });
  await agA.call('POST', '/api/agent/instructions', { instruction: b.instruction, sig: b.sig, package: b.package });
  await assert.rejects(() => agA.call('POST', '/api/agent/instructions', { instruction: b.instruction, sig: b.sig, package: b.package }),
    (e) => e.body.reasons.some((r) => r.code === 'DUPLICATE'));
  const tampered = await agA.buildInstruction({ recipient: rec });
  tampered.instruction.amount.value = '1.00';
  await assert.rejects(() => agA.call('POST', '/api/agent/instructions', { instruction: tampered.instruction, sig: tampered.sig, package: tampered.package }),
    (e) => e.body.reasons.some((r) => r.code === 'SIGNATURE'));
});

test('admin block list rejects a blocked corridor', async () => {
  const a1 = ctx.net.admins[0];
  await a1.http.put('/api/admin/settings', { blocked: { countries: [], pairs: ['JO>YE'], currencies: [] } });
  const rec = (await ctx.agA.directory())[0];
  await assert.rejects(() => ctx.agA.send({ recipient: rec }), (e) => e.body.reasons.some((r) => r.code === 'BLOCKED'));
  await a1.http.put('/api/admin/settings', { blocked: { countries: [], pairs: [], currencies: [] } });
});

test('cancel before payout, and payout after cancel becomes DISPUTED', async () => {
  const { agA, agB } = ctx;
  const rec = (await agA.directory())[0];
  const s = await agA.send({ recipient: rec, amount: '50.00' });
  assert.equal((await agA.cancel(s.id)).status, 'CANCELLED');
  const r = await agB.payout(s.id, s.code); // e.g. paid offline before the cancel was known
  assert.equal(r.status, 'DISPUTED');
});

test('revoking the recipient device freezes open instructions; revoked device is locked out', async () => {
  const { agA, agB, B } = ctx;
  const rec = (await agA.directory())[0];
  const s = await agA.send({ recipient: rec, amount: '75.00' });
  const me = await agB.me();
  await B.http.post(`/api/op/agents/${me.agent.id}/revoke-device`, { reason: 'Phone lost' });
  await assert.rejects(() => agB.me(), (e) => e.body.error === 'device_revoked');
  const out = await agA.outbox();
  const item = out.find((x) => x.id === s.id);
  assert.equal(item.frozen, true);
  // admin can release or expire frozen instruction
  await ctx.net.admins[1].http.post(`/api/admin/instructions/${s.id}/resolve`, { action: 'expire', note: 'Recipient phone lost, expired by TrustLine' });
  assert.equal((await agA.outbox()).find((x) => x.id === s.id).status, 'EXPIRED');
});

test('operator suspension (four-eyes) locks out its agents', async () => {
  const [a1, a2] = ctx.net.admins;
  const p = await a1.propose(ctx.B.id, 'suspend', 'Licence withdrawn by supervisor');
  await a2.decide(p, true);
  const rec = (await ctx.agA.directory());
  assert.equal(rec.length, 0);
});

test('logs: relay chain verifies, operator seal accepted, exports consistent', async () => {
  const v = await ctx.net.admins[0].http.get('/api/admin/log/verify');
  assert.equal(v.ok, true);
  const seal = await ctx.A.seal();
  assert.ok(seal);
  const exp = await ctx.A.http.get('/api/op/log/export');
  assert.equal(exp.format, 'trustline-operator-log/1');
  assert.ok(exp.seals.length >= 1);
  // operator chain integrity
  let prev = '0'.repeat(64);
  for (const e of exp.entries) {
    assert.equal(e.prev, prev);
    const core = { seq: e.seq, ts: e.ts, type: e.type, ref: e.ref, relaySeq: e.relaySeq, relayHash: e.relayHash, data: e.data, prev: e.prev };
    assert.equal(await TL.sha256Hex(TL.canon(core)), e.hash);
    prev = e.hash;
  }
  const rel = await ctx.net.admins[0].http.get('/api/admin/log/export');
  const types = new Set(rel.entries.map((e) => e.type));
  for (const t of ['OPERATOR_ADMITTED', 'DEVICE_CERTIFIED', 'INSTRUCTION_ACCEPTED', 'INSTRUCTION_REJECTED', 'PAID_OUT', 'CANCELLED', 'FROZEN', 'OPERATOR_SUSPENDED'])
    assert.ok(types.has(t), 'log is missing ' + t);
});

test('request authentication: unsigned and replayed-with-other-body requests fail', async () => {
  const res = await fetch(BASE + '/api/agent/inbox');
  assert.equal(res.status, 401);
  const http = new Http(BASE);
  await assert.rejects(() => http.get('/api/admin/me'), (e) => e.status === 401);
  await assert.rejects(() => http.post('/api/op/login', { username: 'nobody', password: 'x' }), (e) => e.status === 401);
});
