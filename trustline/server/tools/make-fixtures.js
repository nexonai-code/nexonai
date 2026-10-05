'use strict';
// Generates cross-language test vectors from the reference implementation (tlcrypto.js) for the Android unit tests.
const fs = require('fs');
const path = require('path');
const TL = require('../public/tlcrypto.js');

(async () => {
  const out = {};
  const canonCases = [
    { a: 1, b: [true, null, 'x'], c: { z: 'ü€"\\\n\t\u0001', a: '😀' } },
    { amount: { value: '500.00', currency: 'USD' }, flag: false, n: -7, list: [] },
    { 'k ey': 'v', B: 1, a: 2 },
  ];
  out.canon = canonCases.map((o) => ({ json: JSON.stringify(o), canon: TL.canon(o) }));

  const operator = await TL.genBundle(), agent = await TL.genBundle(), recipient = await TL.genBundle(), receiver = await TL.genBundle();
  const signKey = await TL.importSignPriv(agent.signPriv), opKey = await TL.importSignPriv(operator.signPriv);
  const cert = { t: 'agent-cert', v: 1, agent: 'AG-TEST0001', operator: 'OP-TEST0001', name: 'Test', country: 'JO', city: 'Amman', signPub: agent.signPub, encPub: agent.encPub,
    signKid: agent.signKid, encKid: agent.encKid, issuedAt: '2026-10-01T00:00:00.000Z', notAfter: '2027-10-01T00:00:00.000Z' };
  const id = TL.uuid(), code = TL.generateCode();
  const payload = { instruction: id, originator: { name: 'Omar Ünïcode', address: 'Amman', idType: 'passport', idNumber: 'P1', dob: '1985-05-05', customerRef: 'K1' }, beneficiary: { name: 'Salma', payoutLocation: 'Aden' } };
  const pkg = await TL.encryptPackage(payload, id, [{ keyId: recipient.encKid, encPub: recipient.encPub }, { keyId: operator.encKid, encPub: operator.encPub }]);
  const ins = { v: '1', id, createdAt: '2026-10-05T10:00:00.000Z', expiresAt: '2026-10-12T10:00:00.000Z', amount: { value: '250.00', currency: 'USD' }, payout: { value: '250.00', currency: 'USD' },
    corridor: { from: 'JO', to: 'YE' }, reference: 'REF-ü', purpose: 'OTHR', codeHash: await TL.codeHash(id, code), pkgHash: await TL.pkgHash(pkg),
    screening: { done: true, ref: 'SCR-1', at: '2026-10-05T10:00:00.000Z' }, sender: { agent: 'AG-TEST0001', operator: 'OP-TEST0001' }, recipient: { agent: 'AG-TEST0002', operator: 'OP-TEST0002' } };
  out.node = {
    code, formattedCode: TL.formatCode(code), codeHash: ins.codeHash, instruction: ins, instructionSig: await TL.signObject(signKey, ins), agentSignPub: agent.signPub, agentSignKid: agent.signKid,
    operatorSignPub: operator.signPub, cert, certSig: await TL.signObject(opKey, cert), package: pkg, payload,
    recipient: { encKid: recipient.encKid, encPriv: recipient.encPriv }, operatorEncKid: operator.encKid,
    keyIdSample: { spki: agent.signPub, kid: agent.signKid },
  };
  out.receiver = { encPub: receiver.encPub, encKid: receiver.encKid, encPriv: receiver.encPriv };   // Kotlin encrypts for this key, Node decrypts
  const dir = path.resolve(__dirname, '../../android-agent/app/src/test/resources');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'fixtures.json'), JSON.stringify(out, null, 1));
  console.log('fixtures written');
})();
