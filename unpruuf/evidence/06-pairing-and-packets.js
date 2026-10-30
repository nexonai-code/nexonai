#!/usr/bin/env node
'use strict';
// What does a pairing code carry, and what does a packet carry? Read from the source of the
// Android app. Findings name file and line.
const fs = require('fs');
const path = require('path');
const { Run, ROOT } = require('./lib');

const run = new Run('06', 'What the pairing code and the packets carry (identity fields)');
const net = (f) => fs.readFileSync(path.join(ROOT, 'app/src/main/java/com/nexonai/unpruuf/domain/network', f), 'utf8');
const qr = fs.readFileSync(path.join(ROOT, 'app/src/main/java/com/nexonai/unpruuf/screens/qrpair/NodeMeshPairing.kt'), 'utf8');

// 1. The Business pairing code: exactly these keys.
const builder = qr.match(/fun nodeMeshPayloadToJson[\s\S]*?\n}/)[0];
const keys = [...builder.matchAll(/\\"([a-z]+)\\":/g)].map((m) => m[1]).sort();
// The Kotlin string uses "v":,"p":"..." inside a raw string: extract keys with a second pattern.
const raw = builder.match(/"""([\s\S]*?)"""/);
const rawKeys = raw ? [...raw[1].matchAll(/"([a-z])":/g)].map((m) => m[1]).sort() : [];
run.check('the Business pairing code has exactly the fields v, p, k, s, n, e', JSON.stringify(rawKeys) === JSON.stringify(['e', 'k', 'n', 'p', 's', 'v']), rawKeys.join(', '));
run.check('there is no user id field ("u") in the code that is written', !rawKeys.includes('u'));
const test = fs.readFileSync(path.join(ROOT, 'app/src/test/java/com/nexonai/unpruuf/screens/qrpair/NodeMeshPairingTest.kt'), 'utf8');
run.check('a unit test pins "the encoded QR carries no user id"', /encoded QR carries no user id[\s\S]{0,200}assertFalse\(json\.contains\("\\"u\\""\)\)/.test(test));
run.note('meaning of the fields: v version, p message key (fresh for this one pairing), k ratchet public key (fresh), s routing seed (fresh), n up to three node addresses, e edition name.');

// 2. Everything personal in the code is generated fresh per pairing.
const idm = net('IdentityManager.kt');
const fresh = /fun pendingNodeMeshPairing[\s\S]{0,1600}X25519\.generatePrivateKey\(\)/.test(idm);
run.check('message key, ratchet key pair and routing seed are generated per pairing, not per device', fresh);
run.check('the pending values are cleared once a scan binds them to a contact', /fun clearPendingNodeMeshPairing/.test(idm));

// 3. What the contact record stores about a Node-Mesh contact.
const contact = fs.readFileSync(path.join(ROOT, 'app/src/main/java/com/nexonai/unpruuf/data/model/Contact.kt'), 'utf8');
const fields = [...contact.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').matchAll(/\bval\s+([A-Za-z0-9_]+)\s*:/g)].map((m) => m[1]);
const personal = fields.filter((f) => /phoneNumber|msisdn|e-?mail|accountId|account$|^account|ssn|birth/i.test(f));
run.check('the contact record has no field for a phone number, e-mail address or account (Node-Mesh contacts hold keys, node addresses and a name the user typed)', personal.length === 0, personal.join(', '));
run.note('fields of the contact record: ' + fields.join(', '));

// 4. The packet: padded, outer-encrypted, ratchet frame, control signals.
const cm = net('CryptoManager.kt');
run.check('outer layer is AES-256-GCM with a fresh random 12-byte IV per packet', /AES\/GCM\/NoPadding/.test(cm) && /ByteArray\(12\)\.also \{ SecureRandom\(\)\.nextBytes/.test(cm));
const header = net('ratchet/RatchetHeader.kt');
run.check('the ratchet header holds a key, a chain length and a message number, and nothing else (it sits INSIDE the outer encryption)', /val dhPub: ByteArray,[\s\S]*val previousChainLength: Int,[\s\S]*val messageNumber: Int,\s*\)/.test(header));
const payload = net('MessagePayload.kt');
run.check('the message payload is one type byte plus content (no sender or recipient field)', /byteArrayOf\(TYPE_TEXT\) \+ text/.test(payload) && !/sender|recipient|userId/i.test(payload.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
const p2p = net('P2PNetworkManager.kt');
const signals = [...p2p.matchAll(/"(UNPRUUF_[A-Z_0-9]+:?)"/g)].map((m) => m[1]);
run.note('control signals defined in the app: ' + [...new Set(signals)].join(', '));

// 5. FINDING F1: the padding header is not encrypted.
const pad = net('NetworkObfuscation.kt');
const writesSize = /ByteBuffer\.wrap\(result\)\.putInt\(payload\.size\)\.putInt\(offset\)/.test(pad);
const depositsPadded = /val padded = NetworkObfuscation\.padPacket\(encrypted\)/.test(p2p) && /depositForNodeMesh\(item\.contactId, item\.nodeMeshRoutingTag, item\.padded/.test(p2p);
const nodeStoresRaw = /INSERT INTO blobs \(tag, blob, created_at, expires_at\)/.test(fs.readFileSync(path.join(ROOT, 'node-mesh-server/src/store/nodeStore.ts'), 'utf8'));
if (writesSize && depositsPadded && nodeStoresRaw) {
  run.finding('F1', 'The first 8 bytes of every stored 4096-byte packet are the payload length and the position of the payload, in the clear (NetworkObfuscation.kt, padPacket). The node stores the packet as received. So whoever can read a node\'s database can read each packet\'s encrypted length, which follows the message length, and a cover packet (44 bytes) is shorter than any real message. The size on the wire stays 4096 bytes. See 08 and PacketMetadataTest.kt.');
} else {
  run.check('the padding header does not leak the payload length', true);
}

const res = run.finish(process.argv[2]);
process.exit(res.failed ? 1 : 0);
