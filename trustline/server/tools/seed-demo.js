'use strict';
/**
 * Creates a small demo network on a running relay: two fictional network operators (Jordan / Yemen),
 * the four-eyes admission, connections, two ready-to-enrol agents for live demos and some transaction history
 * made by simulated agents (so the logs, the dashboards and the Offline Auditor Tool have content).
 * Usage: node tools/seed-demo.js [relay URL]   (admin passwords are read from data/ADMIN-CREDENTIALS.txt)
 */
const fs = require('fs');
const path = require('path');
const { AdminSim, OperatorSim, AgentSim, TL } = require('./sim.js');
const cfg = require('../src/config');

async function main() {
  const base = process.argv[2] || `http://127.0.0.1:${cfg.port}`;
  const credFile = path.join(cfg.DATA_DIR, 'ADMIN-CREDENTIALS.txt');
  let p1 = process.env.TL_ADMIN1_PW, p2 = process.env.TL_ADMIN2_PW;
  if ((!p1 || !p2) && fs.existsSync(credFile)) {
    const t = fs.readFileSync(credFile, 'utf8');
    p1 = p1 || (/admin1\s+(\S+)/.exec(t) || [])[1]; p2 = p2 || (/admin2\s+(\S+)/.exec(t) || [])[1];
  }
  if (!p1 || !p2) throw new Error('Admin passwords not found. Set TL_ADMIN1_PW and TL_ADMIN2_PW.');
  const a1 = await new AdminSim(base, 'admin1', p1).login();
  const a2 = await new AdminSim(base, 'admin2', p2).login();
  const existing = (await a1.http.get('/api/admin/operators')).operators;
  if (existing.some((o) => o.name.endsWith('(Demo)'))) { console.log('Demo data already exists. Nothing to do.'); return; }

  const demoDir = path.join(cfg.DATA_DIR, 'demo');
  fs.mkdirSync(demoDir, { recursive: true });
  const rnd = () => TL.formatCode(TL.generateCode()).toLowerCase();
  const specs = [
    { name: 'Amman Remit (Demo)', country: 'JO', licence: 'DEMO-JO-0001', user: 'ammanremit', contact: 'compliance@amman-remit.example' },
    { name: 'Aden Express (Demo)', country: 'YE', licence: 'DEMO-YE-0002', user: 'adenexpress', contact: 'compliance@aden-express.example' },
  ];
  const ops = [];
  for (const s of specs) {
    const id = await a1.createOperator({ name: s.name, country: s.country, licence: s.licence, contact: s.contact, adminUser: s.user });
    await a1.completeDD(id, 'medium');
    const pr = await a1.propose(id, 'admit', '');
    const { invite } = await a2.decide(pr, true);
    s.password = 'Demo-' + rnd();
    s.passphrase = 'Backup-' + rnd();
    const op = await new OperatorSim(base).activate(s.user, invite, s.password);
    const bundle = await op.registerKeys();
    fs.writeFileSync(path.join(demoDir, `${s.user}-master-keys.json`), JSON.stringify(await TL.backupEncrypt(bundle, s.passphrase), null, 1));
    ops.push({ s, op, id });
  }
  const [A, B] = ops;
  const conn = await A.op.requestConnection(B.id, ['JO>YE', 'YE>JO']);
  await B.op.approveConnection(conn);

  // Agents for live demos (phone / PC): activation codes are printed, devices are not enrolled yet.
  const liveA = await A.op.createAgent({ name: 'Amman Downtown Exchange', city: 'Amman', country: 'JO', phone: '+962 6 000 0000', perInstruction: '2000.00', perDay: '10000.00', offlinePayout: true, offlineLimit: '300.00', offlineHours: 24 });
  const liveB = await B.op.createAgent({ name: 'Aden Harbour Shop', city: 'Aden', country: 'YE', phone: '+967 2 000 000', perInstruction: '2000.00', perDay: '10000.00', offlinePayout: true, offlineLimit: '300.00', offlineHours: 24 });

  // History by simulated agents.
  const sa = [{ spec: { name: 'Zarqa Branch Office', city: 'Zarqa', country: 'JO' }, op: A.op }, { spec: { name: 'Sanaa Market Agent', city: 'Sanaa', country: 'YE' }, op: B.op }];
  const sims = [];
  for (const x of sa) {
    const ag = await x.op.createAgent({ ...x.spec, perInstruction: '1500.00', perDay: '8000.00' });
    const sim = await new AgentSim(base).init();
    await sim.enrol(ag.code, 'Simulated device');
    await x.op.certifyPending();
    await sim.status(); await sim.me();
    sims.push(sim);
  }
  const [sJO, sYE] = sims;
  const amounts = [['180.00', 'OTHR', 'Family support'], ['420.00', 'EDUC', 'School fees'], ['95.50', 'MDCS', 'Medicine'], ['1200.00', 'CHAR', 'Relief payment'], ['60.00', 'OTHR', 'Gift']];
  for (let i = 0; i < amounts.length; i++) {
    const [amount, purpose, ref] = amounts[i];
    const from = i % 2 === 0 ? sJO : sYE, to = i % 2 === 0 ? sYE : sJO;
    const rec = (await from.directory()).find((d) => d.agent.id === to.agentId);
    const s = await from.send({ recipient: rec, amount, currency: 'USD', purpose, reference: ref,
      originator: { name: ['Omar Haddad', 'Layla Nasser', 'Yusuf Karim', 'Rania Said', 'Ahmad Zaid'][i], address: 'Demo address ' + (i + 1), idType: 'passport', idNumber: 'DEMO' + (1000 + i), dob: '1980-0' + (i + 1) + '-1' + i, customerRef: 'C-' + (100 + i) },
      beneficiary: { name: ['Salma Haddad', 'Nour Nasser', 'Huda Karim', 'Mona Said', 'Khaled Zaid'][i], payoutLocation: to.profile.agent.city } });
    if (i === 3) { await from.cancel(s.id); continue; }
    if (i === 4) continue;                       // stays open
    await to.confirm(s.id);
    await to.payout(s.id, s.code);
  }
  try { const rec = (await sJO.directory())[0]; await sJO.send({ recipient: rec, amount: '9000.00', currency: 'USD', purpose: 'OTHR', reference: 'Too large' }); } catch (e) { /* rejected by the limit check: that is the point */ }
  await A.op.seal(); await B.op.seal();

  const lines = [
    'TrustLine demo access', '=====================', '',
    `Relay address:      ${cfg.publicUrl || base}`,
    `Admin console:      ${base}/admin.html     (admin1 / admin2, passwords in data/ADMIN-CREDENTIALS.txt)`, '',
    ...ops.flatMap(({ s }) => [`Operator "${s.name}"`, `  Portal:           ${base}/operator.html`, `  Username:         ${s.user}`, `  Password:         ${s.password}`,
      `  Master-key backup: data/demo/${s.user}-master-keys.json   (passphrase: ${s.passphrase})`,
      '  First sign-in in a NEW browser: the portal asks for the backup file and the passphrase.', '']),
    'Live demo agents (enrol a real device, then approve it in the operator portal):',
    `  Amman Downtown Exchange (JO)   activation code ${liveA.code}   -> Android phone`,
    `  Aden Harbour Shop (YE)         activation code ${liveB.code}   -> PC browser at ${base}/agent.html`, '',
    'History from simulated agents is already in the logs (paid out, cancelled, rejected, open).',
  ];
  fs.writeFileSync(path.join(cfg.DATA_DIR, 'DEMO-ACCESS.txt'), lines.join('\r\n'));
  console.log(lines.join('\n'));
}
main().catch((e) => { console.error('Seeding failed:', e.message); process.exit(1); });
