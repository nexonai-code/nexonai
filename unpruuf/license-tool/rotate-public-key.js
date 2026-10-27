#!/usr/bin/env node
// Replaces the licence public key in every place that checks licences, after a NEW key pair was made
// with keygen.js. Takes the PUBLIC key only (43 characters, base64url); the private key never
// leaves its file. Run from the repository, then rebuild every app, node server and Control.
//   node rotate-public-key.js <new public key>
// Every licence signed with the old key stops working. iOS (not in this repository's code yet)
// must embed the same key; its spec files are updated too.
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const KEY_RE = /^[A-Za-z0-9_-]{43}$/;
// file (relative to unpruuf/), regex whose group 1 is the key
const TARGETS = [
  ['app/src/main/java/com/nexonai/unpruuf/domain/license/LicenseManager.kt', /PUBLIC_KEY_B64\s*=\s*"([A-Za-z0-9_-]{43})"/],
  ['relay-android/app/src/main/java/com/nexonai/unpruuf/relay/core/NodeLicense.kt', /PUBLIC_KEY_B64\s*=\s*"([A-Za-z0-9_-]{43})"/],
  ['node-mesh-server/src/license.ts', /LICENSE_PUBLIC_KEY_B64\s*=\s*"([A-Za-z0-9_-]{43})"/],
  ['control/src/licenses.ts', /LICENSE_PUBLIC_KEY_B64\s*=\s*"([A-Za-z0-9_-]{43})"/],
];

const next = process.argv[2];
if (!next || !KEY_RE.test(next)) {
  console.error('Usage: node rotate-public-key.js <new public key, 43 characters>');
  process.exit(1);
}
if (fs.existsSync(next)) { console.error('Pass the public key itself, not a file.'); process.exit(1); }

const found = new Set();
for (const [rel, re] of TARGETS) {
  const file = path.join(root, rel);
  const text = fs.readFileSync(file, 'utf8');
  const m = re.exec(text);
  if (!m) { console.error(`No key found in ${rel}`); process.exit(1); }
  found.add(m[1]);
}
if (found.size !== 1) { console.error(`The files do not agree on the current key: ${[...found].join(', ')}`); process.exit(1); }
const old = [...found][0];
if (old === next) { console.log('Already the current key, nothing to do.'); process.exit(0); }

// Documentation that quotes the key (iOS specs) follows too.
const DOCS = ['ios/IOS_BUSINESS_BUILD_SPEC.md', 'ios/IOS_GLEICHSTAND_FUER_NORBERT_2026-10-21.md'];
for (const rel of [...TARGETS.map((t) => t[0]), ...DOCS]) {
  const file = path.join(root, rel);
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes(old)) continue;
  fs.writeFileSync(file, text.split(old).join(next));
  console.log(`updated ${rel}`);
}
console.log(`\nOld key: ${old}\nNew key: ${next}\nNow rebuild: Android apps, relay-android, node server, Control, Windows installer.`);
