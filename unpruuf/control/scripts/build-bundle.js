// Builds bundle/node-server.tgz + bundle/bundle.json: the node server's source as Control installs it.
//
//   node scripts/build-bundle.js [path-to-node-mesh-server]
//
// Run `npm run build` first (this uses the compiled helpers). If the release was signed
// (license-tool/sign-release.js writes release-manifest.txt into the server folder), the manifest goes
// into the bundle and its fingerprint is recorded, so every installed server can be compared with it.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { packTarGz } = require('../dist/tarpack');
const { readManifest } = require('../dist/bundle');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'node-mesh-server'));
if (!fs.existsSync(path.join(root, 'package.json'))) {
  console.error(`No node server at ${root}`);
  process.exit(1);
}

const entries = [];
function walk(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(abs, r);
    else if (e.isFile() && r.endsWith('.ts') && !r.endsWith('.test.ts')) entries.push({ name: r, data: fs.readFileSync(abs) });
  }
}
walk(path.join(root, 'src'), 'src');
for (const f of ['package.json', 'package-lock.json', 'tsconfig.json', 'Dockerfile']) {
  entries.push({ name: f, data: fs.readFileSync(path.join(root, f)) });
}
let manifest = { version: null, fingerprint: null };
const manifestFile = path.join(root, 'release-manifest.txt');
if (fs.existsSync(manifestFile)) {
  const text = fs.readFileSync(manifestFile, 'utf8');
  manifest = readManifest(text);
  entries.push({ name: 'release-manifest.txt', data: Buffer.from(text, 'utf8') });
}

const data = packTarGz(entries);
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const out = path.join(__dirname, '..', 'bundle');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'node-server.tgz'), data);
const info = {
  version: pkg.version,
  sha256: crypto.createHash('sha256').update(data).digest('hex'),
  files: entries.length,
  builtAt: new Date().toISOString(),
  releaseFingerprint: manifest.fingerprint,
  releaseVersion: manifest.version,
  signed: Boolean(manifest.fingerprint),
};
fs.writeFileSync(path.join(out, 'bundle.json'), JSON.stringify(info, null, 2) + '\n');
console.log(`Bundle: ${entries.length} files, ${Math.round(data.length / 1024)} KB, version ${info.version}`);
console.log(`SHA-256: ${info.sha256}`);
console.log(info.signed ? `Signed release ${manifest.version}, fingerprint ${manifest.fingerprint}` : 'Release list: none (unsigned build: servers will show "unsigned")');
