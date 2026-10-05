'use strict';
// Verifies, with the reference implementation, what the Kotlin/Android crypto produced (written by the unit tests).
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const TL = require('../public/tlcrypto.js');
(async () => {
  const dir = path.resolve(__dirname, '../../android-agent/app');
  const out = JSON.parse(fs.readFileSync(path.join(dir, 'build/kotlin-out.json'), 'utf8'));
  const fx = JSON.parse(fs.readFileSync(path.join(dir, 'src/test/resources/fixtures.json'), 'utf8'));
  for (const c of out.canon) assert.strictEqual(TL.canon(JSON.parse(c.json)), c.canon, 'canon mismatch for ' + c.json);
  assert.ok(await TL.verifyObject(out.signPub, out.instruction, out.sig), 'Node must verify the Kotlin signature');
  assert.strictEqual(out.signKid, await TL.keyId(out.signPub));
  assert.strictEqual(out.instruction.pkgHash, await TL.pkgHash(out.package), 'package hash must agree');
  const plain = await TL.decryptPackage(out.package, fx.receiver.encKid, fx.receiver.encPriv);
  assert.strictEqual(plain.beneficiary.name, out.expectBeneficiary, 'Node decrypts the Kotlin package');
  assert.strictEqual(plain.originator.name, out.expectOriginator);
  assert.strictEqual(out.instruction.codeHash, await TL.codeHash(out.instruction.id, out.code));
  assert.ok(await TL.verifyObject(out.signPub, out.event, out.eventSig), 'Node must verify the Kotlin event signature');
  console.log('Kotlin output verified by the reference implementation: OK');
})().catch((e) => { console.error('MISMATCH', e.message); process.exit(1); });
