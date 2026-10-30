#!/usr/bin/env node
'use strict';
// What does the node server's source do about senders, network and logging? A scan of the code
// (not of a running server). It is a reading aid for an auditor: every finding names file and line.
const fs = require('fs');
const path = require('path');
const { Run, walk, stripComments, ROOT } = require('./lib');

const SRC = path.join(ROOT, 'node-mesh-server/src');
const files = walk(SRC, /\.ts$/).filter((f) => !/\.test\.ts$/.test(f));
const run = new Run('03', 'What the node server source does with senders, network and logs');
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');
const lines = (f) => stripComments(fs.readFileSync(f, 'utf8')).split('\n').map((t, i) => ({ t, n: i + 1 }));

// 1. The server never reads who is connecting.
const WHO = /req\.ip\b|req\.ips\b|remoteAddress|remotePort|x-forwarded|user-agent|req\.socket|req\.connection|req\.hostname|req\.get\(\s*['"]host/i;
const whoHits = [];
// One exception, on purpose: the setup page (loopback only, never reachable through Tor) checks that a
// connection comes from this computer or a private network, and keeps nothing. Listed as a note.
const LOCAL_CHECK = /isLocalPeer\(req\.socket\.remoteAddress\)/;
for (const f of files) for (const { t, n } of lines(f)) {
  if (!WHO.test(t)) continue;
  if (rel(f) === 'node-mesh-server/src/admin/adminApp.ts' && LOCAL_CHECK.test(t)) {
    run.note(`${rel(f)}:${n}  the setup page checks the connection comes from this computer or a private network (not stored, not logged)`);
    continue;
  }
  whoHits.push(`${rel(f)}:${n}  ${t.trim().slice(0, 90)}`);
}
run.check('no code reads the caller\'s address, port, user agent or forwarded-for header', whoHits.length === 0, whoHits.join(' | '));

// 2. Network modules: who may open connections, and where to.
const NET_MODULES = /from\s+["'](https?|net|dns|dgram|tls|http2)["']|require\(["'](https?|net|dns|dgram|tls|http2)["']\)/;
const ALLOWED_NET = { 'node-mesh-server/src/tor/torDownload.ts': ['https'], 'node-mesh-server/src/tor/torControl.ts': ['net'], 'node-mesh-server/src/index.ts': ['http'], 'node-mesh-server/src/feedIndex.ts': ['http'], 'node-mesh-server/src/bridgeIndex.ts': ['http'], 'node-mesh-server/src/exportListCli.ts': ['http'] };
const netHits = [];
for (const f of files) for (const { t, n } of lines(f)) {
  const m = t.match(NET_MODULES);
  if (m) netHits.push({ file: rel(f), n, mod: m[1] || m[2] });
}
const unexpected = netHits.filter((h) => !(ALLOWED_NET[h.file] || []).includes(h.mod));
run.check('network modules are imported only where expected', unexpected.length === 0, unexpected.map((h) => `${h.file}:${h.n} ${h.mod}`).join(' | '));
run.note('network imports found: ' + netHits.map((h) => `${h.file.replace('node-mesh-server/src/', '')} (${h.mod})`).join(', '));
// export-list (exportListCli.ts) asks the running server's setup page for the node list. It may only
// talk to this computer: every host it names is 127.0.0.1, and it never uses https.
const exportCli = files.find((f) => /exportListCli\.ts$/.test(f));
if (exportCli) {
  const t = stripComments(fs.readFileSync(exportCli, 'utf8'));
  const hosts = [...t.matchAll(/\bhost:\s*"([^"]*)"/g)].map((m) => m[1]);
  run.check('the export-list tool talks only to this computer (127.0.0.1), never outward', hosts.length >= 1 && hosts.every((h) => h === '127.0.0.1') && !/\bhttps\b/.test(t), 'hosts: ' + hosts.join(', '));
}

const outbound = [];
for (const f of files) {
  const text = stripComments(fs.readFileSync(f, 'utf8'));
  for (const m of text.matchAll(/\bhttps\s*\.\s*(get|request)\s*\(/g)) outbound.push(`${rel(f)}:${text.slice(0, m.index).split('\n').length}`);
}
run.check('the only outbound HTTPS request in the server is the one-time Tor download', outbound.length === 1 && outbound[0].includes('torDownload.ts'), outbound.join(', '));

// 3. Every URL literal in the code.
const urls = new Set();
for (const f of files) for (const { t } of lines(f)) for (const m of t.matchAll(/https?:\/\/[A-Za-z0-9._-]+/g)) urls.add(m[0]);
const allowedUrl = (u) => /^https:\/\/archive\.torproject\.org$/.test(u) || /^http:\/\/localhost$/.test(u) || /^http:\/\/127\.0\.0\.1$/.test(u);
run.check('every web address written in the code is the Tor archive or localhost', [...urls].every(allowedUrl), [...urls].join(', '));

// 4. fetch( in the code is browser-side JavaScript of the local setup pages (relative URLs only).
const fetchHits = [];
for (const f of files) for (const { t, n } of lines(f)) for (const m of t.matchAll(/\bfetch\(\s*([`'"])([^`'"]*)\1/g)) fetchHits.push({ f: rel(f), n, url: m[2] });
run.check('every fetch( is a relative address inside the local setup pages', fetchHits.every((h) => h.url.startsWith('/') && /admin|feed/i.test(h.f)), fetchHits.filter((h) => !h.url.startsWith('/')).map((h) => `${h.f}:${h.n}`).join(', '));

// 5. Logging never mentions tags, packets, secrets or senders.
const LOGCALL = /console\.(log|info|warn|error|debug)\(/;
const BAD = /\b(routing_tag|ciphertext|blob|ownerSecret|secret|authorization|bearer|tag)\b/i;
// A log line is only a concern when a VALUE of that kind is printed: text inside ${...}, or an
// argument that is not a plain string. Words inside a fixed message are labels.
function printsValue(t) {
  const inner = [...t.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1]).join(' ');
  const args = t.replace(/^[^(]*\(/, '').replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '').replace(/\$\{[^}]*\}/g, '');
  return BAD.test(inner) || BAD.test(args);
}
const logHits = [];
for (const f of files) {
  if (/admin|feed|license|nodeIdentity|nodeList/i.test(rel(f))) continue; // setup tools talk about the licence and the secret by name; checked by hand below
  for (const { t, n } of lines(f)) if (LOGCALL.test(t) && printsValue(t)) logHits.push(`${rel(f)}:${n}  ${t.trim().slice(0, 100)}`);
}
run.check('request handling and storage never log a tag, a packet or a secret', logHits.length === 0, logHits.join(' | '));
const setupLogs = [];
for (const f of files) {
  if (!/admin|feed|license|nodeIdentity|nodeList/i.test(rel(f))) continue;
  for (const { t, n } of lines(f)) if (LOGCALL.test(t) && printsValue(t)) setupLogs.push(`${rel(f)}:${n}  ${t.trim().slice(0, 110)}`);
}
if (setupLogs.length) run.note('setup tools print a secret-related value (check each by hand):\n      ' + setupLogs.join('\n      '));

// 6. Dependencies.
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'node-mesh-server/package.json'), 'utf8'));
const deps = Object.keys(pkg.dependencies || {}).sort();
run.check('the server has exactly three runtime dependencies: better-sqlite3, express, qrcode', JSON.stringify(deps) === '["better-sqlite3","express","qrcode"]', deps.join(', '));
const lock = path.join(ROOT, 'node-mesh-server/package-lock.json');
if (fs.existsSync(lock)) {
  const l = JSON.parse(fs.readFileSync(lock, 'utf8'));
  const n = Object.keys(l.packages || {}).filter((k) => k && !(l.packages[k].dev)).length;
  run.note(`production packages in package-lock.json (including nested): ${n}. An auditor should review these or ask for an SBOM.`);
}
const res = run.finish(process.argv[2]);
process.exit(res.failed ? 1 : 0);
