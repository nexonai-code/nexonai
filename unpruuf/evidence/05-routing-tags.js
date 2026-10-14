#!/usr/bin/env node
'use strict';
// Routing tags and keys of the Business app: the formulas, checked against fixed values, and what
// they do across many contacts. A demonstration of the construction, not a proof: the proof that
// two tags cannot be linked rests on HMAC-SHA256 being a pseudo-random function.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Run, ROOT } = require('./lib');

const run = new Run('05', 'Routing tags: formula, fixed values, and what they reveal across contacts');

const cmp = (a, b) => Buffer.compare(a, b);
const pairRouting = (mine, theirs) => { const [x, y] = cmp(mine, theirs) <= 0 ? [mine, theirs] : [theirs, mine]; return crypto.createHash('sha256').update(x).update(y).digest(); };
const tag = (mine, theirs, epoch) => crypto.createHmac('sha256', pairRouting(mine, theirs)).update(`routing:${epoch}`).digest('base64');

// 1. Fixed values (the same ones are in ios/IOS_BUSINESS_BUILD_SPEC.md, section 4.4).
const A = Buffer.from([...Array(32).keys()]);
const B = Buffer.from([...Array(32).keys()].map((i) => i + 32));
run.check('pair secret for the fixed seeds matches the published value', pairRouting(A, B).toString('hex') === 'fdeab9acf3710362bd2658cdc9a29e8f9c757fcf9811603a8c447cd1d9151108');
run.check('tag for epoch 0 matches', tag(A, B, 0) === 'qniWxa+fOYCYmgFWACBsQ/5QcuOZCh7UmHD07Bws6D4=');
run.check('tag for epoch 1 matches', tag(A, B, 1) === 'TFjsTryxfpoP1ajZrzDr652y7UjXAZEsRAD6+Jp4NCM=');
run.check('tag for epoch 486000 matches', tag(A, B, 486000) === 'H4Bv8LlIENqyyxB1C8oGzRT9nmG9c4wjzKnsvXS9hFM=');
run.check('both partners get the same tag whoever is "mine"', tag(A, B, 7) === tag(B, A, 7));

// 2. The Android source uses the same construction.
const idm = fs.readFileSync(path.join(ROOT, 'app/src/main/java/com/nexonai/unpruuf/domain/network/IdentityManager.kt'), 'utf8');
run.check('Android IdentityManager: pair secret is SHA-256 over the two seeds in sorted order', /fun nodeMeshPairSecret[\s\S]{0,700}compareUnsigned\(mine, other\) <= 0[\s\S]{0,200}MessageDigest\.getInstance\("SHA-256"\)[\s\S]{0,120}md\.update\(a\); md\.update\(b\)/.test(idm));
run.check('Android IdentityManager: tag is HMAC-SHA256(pair secret, "routing:<epoch>"), Base64 without line breaks', /hmac\(nodeMeshPairSecret\(theirRoutingSeedB64, mySeed\), "routing:\$epoch"\)/.test(idm) && /private fun hmac\(key: ByteArray, msg: String\): String =\s*android\.util\.Base64\.encodeToString\(hmacBytes\(key, msg\), android\.util\.Base64\.NO_WRAP\)/.test(idm));
run.check('Android: one epoch is one hour (3 600 000 ms)', /NODE_MESH_ROTATION_INTERVAL_MS = 60 \* 60 \* 1000L/.test(fs.readFileSync(path.join(ROOT, 'app/src/main/java/com/nexonai/unpruuf/domain/network/P2PNetworkManager.kt'), 'utf8')));
run.check('Android: every pairing draws fresh message key and routing seed from SecureRandom (32 bytes each)', /fun pendingNodeMeshPairing[\s\S]{0,900}SecureRandom\(\)[\s\S]{0,200}msgKey = ByteArray\(32\)[\s\S]{0,120}seed = ByteArray\(32\)/.test(idm));

// 3. Many contacts of one user.
const N = 300;
const mySeeds = [], theirSeeds = [];
for (let i = 0; i < N; i++) { mySeeds.push(crypto.randomBytes(32)); theirSeeds.push(crypto.randomBytes(32)); }
const hex = (b) => b.toString('hex');
run.check(`${N} contacts get ${N} different own seeds (no seed is shown to two contacts)`, new Set(mySeeds.map(hex)).size === N);
const nowEpoch = Math.floor(Date.now() / 3600000);
const tagsNow = mySeeds.map((m, i) => tag(m, theirSeeds[i], nowEpoch));
run.check(`${N} contacts get ${N} different tags in the same hour`, new Set(tagsNow).size === N);
const window = Array.from({ length: 26 }, (_, k) => tag(mySeeds[0], theirSeeds[0], nowEpoch - k));
run.check('the 26 tags of the receive window of one contact are all different', new Set(window).size === 26);
run.check('a different seed for the same epoch gives a different tag (an outsider without the seeds cannot compute it)', tag(crypto.randomBytes(32), theirSeeds[0], nowEpoch) !== tagsNow[0]);

// 4. A rough randomness check on the tags (a demonstration, not a proof).
let ones = 0, bits = 0;
for (let i = 0; i < 4000; i++) { const t = Buffer.from(tag(mySeeds[i % N], theirSeeds[i % N], nowEpoch - Math.floor(i / N)), 'base64'); for (const byte of t) for (let k = 0; k < 8; k++) { ones += (byte >> k) & 1; bits++; } }
const ratio = ones / bits;
run.check('tags look uniformly random: share of 1-bits over 4000 tags is within 0.5 ± 0.005', Math.abs(ratio - 0.5) < 0.005, `share ${ratio.toFixed(4)}`);
run.note('What this does not show: that no structure exists (that rests on HMAC-SHA256 being a pseudo-random function), or anything about traffic timing and volume, which the next scripts and the auditor scope list as open.');

const res = run.finish(process.argv[2]);
process.exit(res.failed ? 1 : 0);
