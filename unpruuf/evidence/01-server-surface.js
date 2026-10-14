#!/usr/bin/env node
'use strict';
// What can the node server do? Starts the real server code (node-mesh-server/dist) in this
// process on a random loopback port with a temporary database, lists every route it registers,
// and then tries what an outsider, a contact and a wrong owner would try.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Run, requireBuilt, ROOT } = require('./lib');

const { createApp } = requireBuilt('node-mesh-server/dist/app.js');
const { NodeStore } = requireBuilt('node-mesh-server/dist/store/nodeStore.js');
const Database = require(path.join(ROOT, 'node-mesh-server/node_modules/better-sqlite3'));

const SECRET = 'evidence-owner-secret-0123456789abcdef';
const run = new Run('01', 'What the node server can do (its whole surface)');

// The complete list of what the server is documented to offer (node-mesh-server/README.md, API).
const DOCUMENTED = ['GET /health', 'GET /pool', 'GET /lock-status', 'POST /unlock', 'PUT /deposit', 'GET /fetch', 'POST /fetchMany'];

function routes(app) {
  const found = [];
  const visit = (stack, prefix) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const m of Object.keys(layer.route.methods)) found.push(`${m.toUpperCase()} ${prefix}${layer.route.path}`);
      } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
        visit(layer.handle.stack, prefix);
      }
    }
  };
  visit(app._router.stack, '');
  return found.sort();
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-01-'));
  const file = path.join(dir, 'node-mesh.sqlite');
  const store = new NodeStore(file); // default profile: standard, 6 h
  const app = createApp(store, SECRET);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, p, { headers = {}, body } = {}) => {
    const res = await fetch(base + p, { method, headers: { 'user-agent': 'evidence-probe/1.0', ...headers }, body });
    let text = ''; try { text = await res.text(); } catch (_) {}
    return { status: res.status, text, headers: res.headers };
  };
  const owner = { 'content-type': 'application/json', authorization: `Bearer ${SECRET}` };
  const TAG = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=';

  // 1. The registered routes are exactly the documented ones.
  const registered = routes(app);
  run.check('registered routes are exactly the documented ones', JSON.stringify(registered) === JSON.stringify([...DOCUMENTED].sort()), registered.join(', '));
  run.check('there is no route that deletes, wipes, lists or exports', !registered.some((r) => /^(DELETE|PATCH)\b|wipe|delete|list|export|admin|debug/i.test(r)), '');

  // 2. Everything else is "not found", for every method.
  const undocumentedPaths = ['/', '/admin', '/delete', '/wipe', '/debug', '/metrics', '/stats', '/tags', '/list', '/export', '/deposit/x', '/fetch/x', '/api', '/.env'];
  let strayOk = true; const stray = [];
  for (const p of undocumentedPaths) for (const m of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']) {
    if (DOCUMENTED.includes(`${m} ${p}`)) continue;
    const r = await call(m, p, { headers: owner, body: ['GET', 'DELETE'].includes(m) ? undefined : '{}' });
    if (r.status !== 404) { strayOk = false; stray.push(`${m} ${p} -> ${r.status}`); }
  }
  run.check('undocumented paths answer 404 for GET, POST, PUT, DELETE, PATCH (even with the owner secret)', strayOk, stray.join('; '));
  for (const m of ['DELETE', 'PATCH', 'PUT', 'POST']) {
    const known = DOCUMENTED.some((d) => d.endsWith(' /fetch') && d.startsWith(m + ' '));
    if (known) continue;
    const r = await call(m, `/fetch?tag=${encodeURIComponent(TAG)}`, { headers: owner, body: '{}' });
    run.check(`${m} /fetch is refused`, r.status === 404, `status ${r.status}`);
  }
  run.check('DELETE /deposit is refused', (await call('DELETE', '/deposit', { headers: owner })).status === 404);

  // 3. Who may write.
  const dep = (headers, extra = {}) => call('PUT', '/deposit', { headers, body: JSON.stringify({ routing_tag: TAG, ciphertext: Buffer.from('hello').toString('base64'), ...extra }) });
  run.check('deposit without a secret is refused (401)', (await dep({ 'content-type': 'application/json' })).status === 401);
  run.check('deposit with a wrong secret is refused (401)', (await dep({ 'content-type': 'application/json', authorization: 'Bearer wrong' })).status === 401);
  run.check('a contact (who knows only the routing tag) cannot deposit', (await dep({ 'content-type': 'application/json', authorization: `Bearer ${TAG}` })).status === 401);
  run.check('deposit with the owner secret is accepted (201)', (await dep(owner)).status === 201);
  run.check('GET /pool needs the owner secret', (await call('GET', '/pool')).status === 401);

  // 4. Reading never changes anything.
  const countRows = () => { const db = new Database(file, { readonly: true }); try { return db.prepare('SELECT COUNT(*) n FROM blobs').get().n; } finally { db.close(); } };
  const before = countRows();
  const f1 = await call('GET', `/fetch?tag=${encodeURIComponent(TAG)}`);
  const f2 = await call('GET', `/fetch?tag=${encodeURIComponent(TAG)}`);
  const m1 = await call('POST', '/fetchMany', { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tags: [TAG] }) });
  run.check('fetch returns the blob without any secret (the tag is the credential)', f1.status === 200 && f1.text.includes(Buffer.from('hello').toString('base64')));
  run.check('fetching twice gives the same answer (nothing is consumed)', f1.text === f2.text);
  run.check('fetchMany returns it too and still deletes nothing', m1.status === 200 && countRows() === before, `rows before ${before}, after ${countRows()}`);
  run.check('a tag that does not exist answers with an empty list, not an error', /"blobs":\[\]/.test((await call('GET', '/fetch?tag=nothing')).text.replace(/\s/g, '')));
  const keys = Object.keys(JSON.parse(f1.text)).sort().join(',');
  run.check('the fetch answer contains only "blobs" (no sender, no time, no address)', keys === 'blobs', keys);

  // 5. Lifetime: a deposit can ask for less, never more.
  await dep(owner, { routing_tag: 'T-long', ttl: 1000 * 60 * 60 * 24 * 10 });
  await dep(owner, { routing_tag: 'T-short', ttl: 5000 });
  const db = new Database(file, { readonly: true });
  const rowLong = db.prepare("SELECT created_at, expires_at FROM blobs WHERE tag='T-long'").get();
  const rowShort = db.prepare("SELECT created_at, expires_at FROM blobs WHERE tag='T-short'").get();
  db.close();
  const sixH = 6 * 3600 * 1000;
  run.check('a deposit asking for 10 days is capped at the node profile (6 h)', rowLong && rowLong.expires_at - rowLong.created_at <= sixH, rowLong ? `${(rowLong.expires_at - rowLong.created_at) / 3600000} h` : 'no row');
  run.check('a deposit asking for 5 s gets 5 s', rowShort && rowShort.expires_at - rowShort.created_at === 5000);

  // 6. Input limits.
  run.check('an invalid routing tag is refused (400)', (await dep(owner, { routing_tag: 'bad tag!' })).status === 400);
  const big = await call('PUT', '/deposit', { headers: owner, body: JSON.stringify({ routing_tag: TAG, ciphertext: 'A'.repeat(20000) }) });
  run.check('an oversized request is refused', big.status === 413 || big.status === 400, `status ${big.status}`);
  run.check('a negative or zero lifetime is refused (400)', (await dep(owner, { ttl: -1 })).status === 400 && (await dep(owner, { ttl: 0 })).status === 400);

  // 7. Observations that are not failures.
  const px = (await call('GET', '/health')).headers.get('x-powered-by');
  if (px) run.note(`the server announces "X-Powered-By: ${px}". It reveals the web framework only; it should be switched off (hardening item, not a leak of user data).`);

  server.close(); store.close();
  const res = run.finish(process.argv[2]);
  process.exit(res.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
