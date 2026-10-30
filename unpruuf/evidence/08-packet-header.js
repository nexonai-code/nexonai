#!/usr/bin/env node
'use strict';
// Finding F1, shown directly: what can someone who holds a stored packet (a node operator) read
// WITHOUT any key? The padding code is re-implemented here byte for byte from NetworkObfuscation.kt
// and run on a cover packet. The same question is answered with the real app classes (real ratchet,
// framing and padding) by PacketMetadataTest.kt; if its result file exists, it is read here.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Run, ROOT } = require('./lib');

const run = new Run('08', 'What a stored packet shows without a key (finding F1)');

function padPacket(payload) {            // NetworkObfuscation.padPacket
  const out = Buffer.alloc(4096);
  const pad = crypto.randomBytes(4096 - payload.length - 8);
  const offset = pad.length === 0 ? 0 : crypto.randomInt(Math.max(1, Math.floor(pad.length / 2)));
  out.writeInt32BE(payload.length, 0); out.writeInt32BE(offset, 4);
  payload.copy(out, 8 + offset); pad.copy(out, 8, 0, offset);
  return out;
}
function outerEncrypt(plain, key) {      // CryptoManager.encryptForContact: iv(12) || ciphertext || tag(16)
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  return Buffer.concat([iv, c.update(plain), c.final(), c.getAuthTag()]);
}
const key = crypto.randomBytes(32);
const cover = padPacket(outerEncrypt(Buffer.from('UNPRUUF_DUMMY_V1'), key));
const seen = cover.readInt32BE(0);
run.check('a stored packet is exactly 4096 bytes', cover.length === 4096);
run.check('its first four bytes, readable without any key, give the payload length', seen === 12 + 16 + 16, `a cover packet shows ${seen}`);
run.check('the length is exactly the length of what was encrypted (iv + plaintext + tag)', seen === 12 + 'UNPRUUF_DUMMY_V1'.length + 16);
const texts = ['hi', 'x'.repeat(300), 'x'.repeat(3000)].map((t) => padPacket(outerEncrypt(Buffer.concat([Buffer.from([0]), Buffer.from(t)]), key)).readInt32BE(0));
run.check('different message lengths show as different numbers', new Set(texts).size === 3, texts.join(', '));
run.finding('F1', `Without a key a stored packet shows its payload length (${seen} for a cover packet, ${texts.join(' / ')} for texts of 2, 300 and 3000 characters in this simplified model). On the wire the size is always 4096 bytes. What leaks is the number inside the packet, to whoever can read the node's database or the relay. The way to close it is to put the length inside the encrypted part (a wire-format change for every client).`);

const xml = path.join(ROOT, 'app/build/test-results/testStandardDebugUnitTest/TEST-com.nexonai.unpruuf.domain.network.PacketMetadataTest.xml');
if (fs.existsSync(xml)) {
  const t = fs.readFileSync(xml, 'utf8');
  const m = t.match(/tests="(\d+)"[^>]*failures="(\d+)"/);
  run.check('PacketMetadataTest (real app classes) ran and passed: it pins that the leak exists today', !!m && m[2] === '0', m ? `${m[1]} tests, ${m[2]} failures` : '');
} else {
  run.note('PacketMetadataTest has not been run here (needs Gradle and the Android SDK): ./gradlew :app:testStandardDebugUnitTest --tests "*PacketMetadataTest*"');
}
const res = run.finish(process.argv[2]);
process.exit(res.failed ? 1 : 0);
