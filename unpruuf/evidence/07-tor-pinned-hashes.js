#!/usr/bin/env node
'use strict';
// The Tor program that the node server and the officer app download on first start: is it checked?
// Offline part: the three copies of the download code pin the same SHA-256 values and verify them
// before extracting. With --online: the pinned values are compared with the Tor Project's signed
// list (archive.torproject.org) and its PGP signature is verified with gpg.
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');
const { Run, ROOT } = require('./lib');

const run = new Run('07', 'The downloaded Tor program is checked against pinned SHA-256 values');
const FILES = ['node-mesh-server/src/tor/torDownload.ts', 'server/src/torDownload.ts', 'officer-app/src/tor/torDownload.ts'];
const VERSION_RE = /TOR_EXPERT_BUNDLE_VERSION = "([0-9.]+)"/;
const TOR_KEY_FPR = 'EF6E286DDA85EA2A4BA7DE684E2C6E8793298290'; // Tor Browser Developers (signing key); compare with torproject.org

const tables = FILES.map((f) => {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const block = (src.match(/TOR_EXPERT_BUNDLE_SHA256[^{]*\{([\s\S]*?)\};/) || [])[1] || '';
  const entries = Object.fromEntries([...block.matchAll(/"([a-z]+-[a-z0-9_]+)":\s*"([0-9a-f]{64})"/g)].map((m) => [m[1], m[2]]));
  return { f, src, version: (src.match(VERSION_RE) || [])[1], entries, verifies: /verifyTorArchive\(/.test(src.replace(/export function verifyTorArchive[\s\S]*?\n}\n/, '')) };
});
for (const t of tables) {
  run.check(`${t.f}: four pinned values (Windows, Linux, macOS Intel, macOS Apple Silicon)`, Object.keys(t.entries).sort().join(',') === 'linux-x86_64,macos-aarch64,macos-x86_64,windows-x86_64', Object.keys(t.entries).join(', '));
  run.check(`${t.f}: the download is hashed and compared before it is extracted`, t.verifies && t.src.indexOf('verifyTorArchive(') > 0 && (t.src.indexOf('downloadFile(') < t.src.lastIndexOf('verifyTorArchive(')) && (t.src.lastIndexOf('verifyTorArchive(') < t.src.indexOf('"tar"')), '');
}
run.check('all three copies pin the same version and the same values', tables.every((t) => t.version === tables[0].version && JSON.stringify(t.entries) === JSON.stringify(tables[0].entries)), tables.map((t) => t.version).join(', '));
run.note(`pinned version: ${tables[0].version}. The Android app does not download Tor: it carries the library tor-android (checked as a dependency, see 04).`);

function get(url) {
  return new Promise((resolve, reject) => https.get(url, (r) => { if (r.statusCode !== 200) return reject(new Error(`${url} -> HTTP ${r.statusCode}`)); const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => resolve(Buffer.concat(c))); }).on('error', reject));
}

(async () => {
  if (process.argv.includes('--online')) {
    const version = tables[0].version;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-07-'));
    try {
      const base = `https://archive.torproject.org/tor-package-archive/torbrowser/${version}/sha256sums-signed-build.txt`;
      const sums = await get(base); const asc = await get(base + '.asc');
      const key = await get(`https://keys.openpgp.org/vks/v1/by-fingerprint/${TOR_KEY_FPR}`);
      fs.writeFileSync(path.join(dir, 'sums.txt'), sums); fs.writeFileSync(path.join(dir, 'sums.asc'), asc); fs.writeFileSync(path.join(dir, 'key.asc'), key);
      const env = { ...process.env, GNUPGHOME: dir };
      fs.chmodSync(dir, 0o700);
      execFileSync('gpg', ['--batch', '--import', path.join(dir, 'key.asc')], { env, stdio: 'ignore' });
      let out = '';
      try { out = execFileSync('gpg', ['--batch', '--status-fd', '1', '--verify', path.join(dir, 'sums.asc'), path.join(dir, 'sums.txt')], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { out = String(e.stdout || ''); }
      run.check('the Tor Project\'s list of hashes carries a good PGP signature', /\[GNUPG:\] GOODSIG/.test(out));
      run.check(`the signing key's primary fingerprint is ${TOR_KEY_FPR.replace(/(.{4})/g, '$1 ').trim()}`, out.includes(TOR_KEY_FPR), 'compare this fingerprint with torproject.org');
      const listed = Object.fromEntries([...sums.toString().matchAll(/^([0-9a-f]{64})\s+tor-expert-bundle-([a-z]+-[a-z0-9_]+)-[0-9.]+\.tar\.gz$/gm)].map((m) => [m[2], m[1]]));
      for (const [k, v] of Object.entries(tables[0].entries)) run.check(`pinned ${k} equals the signed list`, listed[k] === v);
    } catch (e) {
      run.check('online comparison could run', false, e.message);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  } else {
    run.note('offline run. Add --online to compare with the Tor Project\'s signed list (needs network and gpg).');
  }
  const res = run.finish(process.argv.find((a) => a.endsWith('.json')));
  process.exit(res.failed ? 1 : 0);
})();
