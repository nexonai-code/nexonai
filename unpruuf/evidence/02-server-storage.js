#!/usr/bin/env node
'use strict';
// What does the node server keep? Uses the real server code, deposits packets the way an app
// does (with an owner secret, from a client that has an address and a name), then looks at the
// database file itself: its tables, its columns, every row, and every byte of the files for
// anything that should not be there. Finally it lets a packet expire and looks again.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Run, requireBuilt, ROOT } = require('./lib');

const { createApp } = requireBuilt('node-mesh-server/dist/app.js');
const { NodeStore } = requireBuilt('node-mesh-server/dist/store/nodeStore.js');
const Database = require(path.join(ROOT, 'node-mesh-server/node_modules/better-sqlite3'));

const run = new Run('02', 'What the node server keeps on disk');
const SECRET = 'evidence-owner-secret-ABCDEFGHIJKLMNOP';
const UA = 'evidence-probe-user-agent/9.9';

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-02-'));
  const file = path.join(dir, 'node-mesh.sqlite');
  const store = new NodeStore(file);
  const server = createApp(store, SECRET).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const owner = { 'content-type': 'application/json', authorization: `Bearer ${SECRET}`, 'user-agent': UA, 'x-forwarded-for': '203.0.113.77' };

  // Three deposits. The "ciphertext" is random bytes, as a real packet is.
  const crypto = require('crypto');
  const tags = ['tagA' + crypto.randomBytes(12).toString('base64url'), 'tagB' + crypto.randomBytes(12).toString('base64url'), 'tagC' + crypto.randomBytes(12).toString('base64url')];
  const blobs = tags.map(() => crypto.randomBytes(4096));
  for (let i = 0; i < 3; i++) {
    const r = await fetch(base + '/deposit', { method: 'PUT', headers: owner, body: JSON.stringify({ routing_tag: tags[i], ciphertext: blobs[i].toString('base64'), ttl: 3600000 }) });
    if (r.status !== 201) throw new Error('deposit failed ' + r.status);
  }
  // A reader from another "address" fetches them.
  for (const t of tags) await fetch(`${base}/fetch?tag=${encodeURIComponent(t)}`, { headers: { 'user-agent': UA, 'x-forwarded-for': '198.51.100.9' } });

  store.checkpoint && store.checkpoint();
  // 1. Schema.
  const db = new Database(file, { readonly: true });
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((t) => t.name);
  run.check('the database has one data table (blobs) and nothing else', JSON.stringify(tables.filter((t) => t !== 'sqlite_sequence')) === '["blobs"]', tables.join(', '));
  const cols = db.prepare('PRAGMA table_info(blobs)').all().map((c) => c.name).sort();
  run.check('the table has exactly these columns: id, tag, blob, created_at, expires_at', JSON.stringify(cols) === JSON.stringify(['blob', 'created_at', 'expires_at', 'id', 'tag']), cols.join(', '));
  const rows = db.prepare('SELECT id, tag, length(blob) AS blob_chars, created_at, expires_at FROM blobs ORDER BY id').all();
  console.log('\n  Rows as stored (the blob itself is encrypted bytes; only its length is shown):');
  for (const r of rows) console.log(`    id=${r.id} tag=${r.tag} blob_chars=${r.blob_chars} created_at=${r.created_at} expires_at=${r.expires_at}`);
  console.log('');
  run.check('three deposits, three rows', rows.length === 3);
  db.close();

  // 2. Nothing about the sender or reader in any file of the database.
  const files = fs.readdirSync(dir).map((f) => path.join(dir, f));
  const bytes = Buffer.concat(files.map((f) => fs.readFileSync(f)));
  const absent = (needle) => !bytes.includes(Buffer.from(needle));
  run.check('the owner secret is not on disk', absent(SECRET));
  run.check('no client address is on disk (127.0.0.1, 203.0.113.77, 198.51.100.9)', absent('127.0.0.1') && absent('203.0.113.77') && absent('198.51.100.9'));
  run.check('no user agent is on disk', absent(UA));
  run.note(`files examined: ${files.map((f) => path.basename(f)).join(', ')} (${bytes.length} bytes)`);

  // 3. Expiry really removes the bytes.
  const store2 = store; // same open store
  const sample = blobs[0].toString('base64').slice(0, 64);
  run.check('before expiry the first blob is in the file (sanity check of the method)', Buffer.concat(fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f)))).includes(Buffer.from(sample)));
  const raw = new Database(file);
  raw.prepare('UPDATE blobs SET expires_at = 1').run(); // pretend the time has passed
  raw.close();
  const removed = store2.sweepExpired();
  store2.close(); server.close();
  // Reopen and checkpoint so that the write-ahead log is folded in, then look at the bytes.
  const fin = new Database(file); fin.pragma('wal_checkpoint(TRUNCATE)'); const left = fin.prepare('SELECT COUNT(*) n FROM blobs').get().n; fin.close();
  const after = Buffer.concat(fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f))));
  run.check('the sweep removed all expired packets', removed === 3 && left === 0, `removed ${removed}, left ${left}`);
  run.check('after expiry the packet bytes are gone from the files (secure_delete overwrites them)', !after.includes(Buffer.from(sample)) && !blobs.some((b) => after.includes(b.subarray(0, 48))));

  const res = run.finish(process.argv[2]);
  process.exit(res.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
