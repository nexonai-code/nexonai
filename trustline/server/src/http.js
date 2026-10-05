'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const cfg = require('./config');
const { q } = require('./db');
const core = require('./core');
const U = require('./util');
const N = require('./ncrypto');
const { ApiError } = U;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };

const routes = [];
const route = (method, pattern, auth, handler) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:[a-zA-Z]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, auth, handler });
};

// ------------------------------------------------------------------ sessions + login throttling
const fails = new Map();
function throttle(key) {
  const f = fails.get(key);
  if (f && f.n >= 5 && Date.now() - f.t < 5 * 60 * 1000) throw new ApiError(429, 'locked', 'Too many failed attempts. Try again in 5 minutes.');
}
const failed = (key) => { const f = fails.get(key) || { n: 0, t: 0 }; fails.set(key, { n: f.n + 1, t: Date.now() }); };
const cleared = (key) => fails.delete(key);

function makeSession(kind, ref) {
  const token = U.randomToken();
  q.run('INSERT INTO sessions(token,kind,ref,expires) VALUES(?,?,?,?)', token, kind, ref, U.addMs(U.nowIso(), cfg.sessionHours * 3600 * 1000));
  return token;
}
function sessionFrom(req, kind) {
  const token = U.parseCookies(req.headers.cookie)['tl_' + kind];
  if (!token) return null;
  const s = q.get('SELECT * FROM sessions WHERE token=? AND kind=?', token, kind);
  if (!s || new Date(s.expires) < new Date()) return null;
  return { token, ref: s.ref };
}
function cookie(req, kind, token, maxAge) {
  const secure = cfg.tls.keyFile || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `tl_${kind}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
}

// ------------------------------------------------------------------ helpers
async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 512 * 1024) throw new ApiError(413, 'too_large', 'Request body too large.');
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}
function send(res, status, obj, headers) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(headers || {}) });
  res.end(body);
}
const ip = (req) => req.socket.remoteAddress || '';

function agentAuth(req, rawBody, url) {
  const kid = req.headers['x-key'], ts = req.headers['x-ts'], sig = req.headers['x-sig'], agentId = req.headers['x-agent'];
  if (!kid || !ts || !sig || !agentId) throw new ApiError(401, 'no_auth', 'Missing authentication headers.');
  if (!U.ISO_RE.test(ts) || Math.abs(Date.now() - new Date(ts).getTime()) > 30 * 60 * 1000)
    throw new ApiError(401, 'clock', 'Request time is too far from the relay time. Check the phone clock.');
  const ctx = core.activeCtx(String(kid));
  if (ctx.agent.id !== agentId) throw new ApiError(401, 'bad_agent', 'Key does not belong to this agent.');
  const data = `${req.method}\n${url.pathname}${url.search}\n${ts}\n${N.sha256Hex(rawBody)}`;
  if (!N.verifySig(ctx.device.sign_pub, data, sig)) throw new ApiError(401, 'bad_signature', 'Request signature invalid.');
  return ctx;
}

function operatorAuth(req, allowInactive) {
  const s = sessionFrom(req, 'op');
  if (!s) throw new ApiError(401, 'login_required', 'Please sign in.');
  const user = q.get('SELECT * FROM operator_users WHERE username=?', s.ref);
  if (!user) throw new ApiError(401, 'login_required', 'Please sign in.');
  const op = q.get('SELECT * FROM operators WHERE id=?', user.operator_id);
  if (!allowInactive && op.status !== 'ACTIVE') throw new ApiError(403, 'operator_inactive', `Operator status is ${op.status}.`);
  return { user, op };
}
function adminAuth(req) {
  const s = sessionFrom(req, 'admin');
  if (!s) throw new ApiError(401, 'login_required', 'Please sign in.');
  return { admin: s.ref };
}

// ------------------------------------------------------------------ public
route('GET', '/api/info', 'public', () => {
  const rk = core.relayKey();
  return { name: cfg.relayName, version: cfg.VERSION, relayPub: rk.pub, relayKid: rk.kid, time: U.nowIso() };
});
route('POST', '/api/agent/enroll', 'public', ({ body, req }) => {
  throttle('enrol|' + ip(req));
  try { return core.enrol(body); } catch (e) { if (e.status === 404) failed('enrol|' + ip(req)); throw e; }
});
route('GET', '/api/agent/enroll/status', 'public', ({ url }) => core.enrolStatus(url.searchParams.get('code')));

// ------------------------------------------------------------------ agent (signed requests)
route('GET', '/api/agent/me', 'agent', ({ ctx }) => {
  core.clearActivationCode(ctx.agent.id);
  const cert = JSON.parse(ctx.device.cert);
  return { status: 'active', ...core.profile(ctx.agent, ctx.operator), cert, certSig: ctx.device.cert_sig, serverTime: U.nowIso(),
    settings: { purposes: core.getSetting('purposes'), currencies: Object.keys(core.getSetting('fx')) } };
});
route('GET', '/api/agent/directory', 'agent', ({ ctx }) => ({ recipients: core.directory(ctx) }));
route('POST', '/api/agent/instructions', 'agent', ({ ctx, body }) => ({ receipt: core.submitInstruction(ctx, body) }));
route('GET', '/api/agent/inbox', 'agent', ({ ctx }) => ({ items: core.inbox(ctx.agent.id) }));
route('GET', '/api/agent/outbox', 'agent', ({ ctx }) => ({ items: core.outbox(ctx.agent.id) }));
route('POST', '/api/agent/events', 'agent', ({ ctx, body }) => ({ receipt: core.processEvent(ctx, body) }));

// ------------------------------------------------------------------ operator portal
route('POST', '/api/op/accept-invite', 'public', ({ body, req }) => {
  throttle('invite|' + ip(req));
  try { core.acceptInvite(body.username, body.invite, body.password); } catch (e) { failed('invite|' + ip(req)); throw e; }
  return { ok: true };
});
route('POST', '/api/op/login', 'public', ({ body, req, res }) => {
  const key = 'op|' + ip(req) + '|' + String(body.username || '').toLowerCase();
  throttle(key);
  const user = q.get('SELECT * FROM operator_users WHERE username=?', String(body.username || '').toLowerCase());
  if (!user || !U.checkPassword(body.password, user.pass)) { failed(key); throw new ApiError(401, 'bad_login', 'Wrong username or password.'); }
  cleared(key);
  res.setHeader('Set-Cookie', cookie(req, 'op', makeSession('op', user.username), cfg.sessionHours * 3600));
  return { ok: true };
});
route('POST', '/api/op/logout', 'public', ({ req, res }) => {
  const s = sessionFrom(req, 'op');
  if (s) q.run('DELETE FROM sessions WHERE token=?', s.token);
  res.setHeader('Set-Cookie', cookie(req, 'op', '', 0));
  return { ok: true };
});
route('GET', '/api/op/me', 'operator-any', ({ op, user }) => ({ username: user.username, operator: core.operatorView(op), relay: { pub: core.relayKey().pub } }));
route('POST', '/api/op/keys', 'operator-any', ({ op, body }) => {
  if (op.status !== 'ACTIVE') throw new ApiError(403, 'operator_inactive', `Operator status is ${op.status}.`);
  core.registerOperatorKeys(op.id, body.signPub, body.encPub);
  return { ok: true };
});
route('GET', '/api/op/settings', 'operator', () => ({ purposes: core.getSetting('purposes'), currencies: Object.keys(core.getSetting('fx')), caps: core.getSetting('caps') }));
route('GET', '/api/op/agents', 'operator', ({ op }) => ({ agents: q.all('SELECT * FROM agents WHERE operator_id=? ORDER BY created DESC', op.id).map(core.agentView) }));
route('POST', '/api/op/agents', 'operator', ({ op, body }) => ({ agent: core.createAgent(op.id, body) }));
route('PUT', '/api/op/agents/:id', 'operator', ({ op, params, body }) => { core.updateAgent(op.id, params.id, body); return { ok: true }; });
route('POST', '/api/op/agents/:id/revoke-device', 'operator', ({ op, params, body }) => { core.revokeDevice(op.id, params.id, body.reason, 'operator'); return { ok: true }; });
route('POST', '/api/op/agents/:id/revoke', 'operator', ({ op, params, body }) => { core.revokeAgent(op.id, params.id, body.reason, 'operator'); return { ok: true }; });
route('GET', '/api/op/devices/pending', 'operator', ({ op }) => ({ devices: core.pendingDevices(op.id) }));
route('POST', '/api/op/devices/:id/certify', 'operator', ({ op, params, body }) => { core.certifyDevice(op.id, Number(params.id), body.cert, body.sig); return { ok: true }; });
route('POST', '/api/op/devices/:id/reject', 'operator', ({ op, params }) => { core.rejectDevice(op.id, Number(params.id)); return { ok: true }; });
route('GET', '/api/op/operators', 'operator', ({ op }) => ({
  operators: q.all("SELECT id,name,country,enc_kid FROM operators WHERE status='ACTIVE' AND sign_pub IS NOT NULL AND id<>? ORDER BY name", op.id) }));
route('GET', '/api/op/connections', 'operator', ({ op }) => ({
  connections: q.all('SELECT * FROM connections WHERE a=? OR b=? ORDER BY created DESC', op.id, op.id).map((c) => ({
    ...core.connView(c), aName: q.get('SELECT name FROM operators WHERE id=?', c.a).name, bName: q.get('SELECT name FROM operators WHERE id=?', c.b).name })) }));
route('POST', '/api/op/connections', 'operator', ({ op, body }) => { core.requestConnection(op.id, body); return { ok: true }; });
route('POST', '/api/op/connections/:id/decide', 'operator', ({ op, params, body }) => { core.decideConnection(op.id, params.id, body); return { ok: true }; });
route('POST', '/api/op/connections/:id/status', 'operator', ({ op, params, body }) => { core.setConnectionStatus(op.id, params.id, body.status, body.reason); return { ok: true }; });
route('GET', '/api/op/instructions', 'operator', ({ op }) => {
  const mine = core.operatorInstructions(op.id);
  return { instructions: mine, operator: { encKid: op.enc_kid } };
});
route('GET', '/api/op/log/head', 'operator', ({ op }) => core.unsealedHead(op.id));
route('POST', '/api/op/log/seal', 'operator', ({ op, body }) => { core.recordSeal(op.id, body.seal, body.sig); return { ok: true }; });
route('GET', '/api/op/log/export', 'operator', ({ op, res }) => {
  res.setHeader('Content-Disposition', `attachment; filename="trustline-log-${op.id}.json"`);
  return core.exportOperatorLog(op.id);
});

// ------------------------------------------------------------------ admin console
route('POST', '/api/admin/login', 'public', ({ body, req, res }) => {
  const key = 'adm|' + ip(req) + '|' + String(body.username || '').toLowerCase();
  throttle(key);
  const a = q.get('SELECT * FROM admins WHERE username=?', String(body.username || '').toLowerCase());
  if (!a || !U.checkPassword(body.password, a.pass)) { failed(key); throw new ApiError(401, 'bad_login', 'Wrong username or password.'); }
  cleared(key);
  res.setHeader('Set-Cookie', cookie(req, 'admin', makeSession('admin', a.username), cfg.sessionHours * 3600));
  return { ok: true };
});
route('POST', '/api/admin/logout', 'public', ({ req, res }) => {
  const s = sessionFrom(req, 'admin');
  if (s) q.run('DELETE FROM sessions WHERE token=?', s.token);
  res.setHeader('Set-Cookie', cookie(req, 'admin', '', 0));
  return { ok: true };
});
route('GET', '/api/admin/me', 'admin', ({ admin }) => ({ admin, relay: { name: cfg.relayName, kid: core.relayKey().kid }, ddItems: core.DD_ITEMS, screening: core.SCREENING }));
route('POST', '/api/admin/password', 'admin', ({ admin, body }) => {
  const a = q.get('SELECT * FROM admins WHERE username=?', admin);
  if (!U.checkPassword(body.old, a.pass)) throw new ApiError(403, 'bad_password', 'Current password is wrong.');
  if (String(body.next || '').length < 10) throw new ApiError(422, 'weak_password', 'Password needs at least 10 characters.');
  q.run('UPDATE admins SET pass=? WHERE username=?', U.hashPassword(body.next), admin);
  return { ok: true };
});
route('GET', '/api/admin/overview', 'admin', () => ({
  operators: q.all('SELECT status, COUNT(*) AS n FROM operators GROUP BY status'),
  agents: q.all('SELECT status, COUNT(*) AS n FROM agents GROUP BY status'),
  instructions: q.all('SELECT status, COUNT(*) AS n FROM instructions GROUP BY status'),
  frozen: q.get('SELECT COUNT(*) AS n FROM instructions WHERE frozen=1').n,
  logEntries: q.get('SELECT COUNT(*) AS n FROM log').n,
  openProposals: q.get("SELECT COUNT(*) AS n FROM proposals WHERE status='OPEN'").n,
}));
route('GET', '/api/admin/operators', 'admin', () => ({
  operators: q.all('SELECT * FROM operators ORDER BY created DESC').map((o) => ({ ...core.operatorView(o), dd: core.ddComplete(o) })) }));
route('POST', '/api/admin/operators', 'admin', ({ admin, body }) => ({ id: core.createOperator(body, admin) }));
route('GET', '/api/admin/operators/:id', 'admin', ({ params }) => {
  const o = q.get('SELECT * FROM operators WHERE id=?', params.id);
  if (!o) throw new ApiError(404, 'not_found', 'Operator not found.');
  return { operator: core.operatorView(o), dd: JSON.parse(o.dd), ddStatus: core.ddComplete(o),
    agents: q.all('SELECT * FROM agents WHERE operator_id=?', o.id).map(core.agentView),
    proposals: q.all('SELECT * FROM proposals WHERE subject=? ORDER BY id DESC', o.id) };
});
route('PUT', '/api/admin/operators/:id/dd', 'admin', ({ admin, params, body }) => { core.updateDD(params.id, body, admin); return { ok: true }; });
route('POST', '/api/admin/operators/:id/propose', 'admin', ({ admin, params, body }) => ({ proposal: core.propose(body.kind, params.id, body.note, admin) }));
route('GET', '/api/admin/proposals', 'admin', () => ({
  proposals: q.all("SELECT p.*, o.name AS operator_name FROM proposals p JOIN operators o ON o.id=p.subject ORDER BY p.id DESC LIMIT 100") }));
route('POST', '/api/admin/proposals/:id/decide', 'admin', ({ admin, params, body }) => core.decideProposal(Number(params.id), admin, !!body.approve));
route('GET', '/api/admin/settings', 'admin', () => ({
  fx: core.getSetting('fx'), caps: core.getSetting('caps'), blocked: core.getSetting('blocked'), purposes: core.getSetting('purposes'),
  offlineDefaultHours: core.getSetting('offlineDefaultHours') }));
route('PUT', '/api/admin/settings', 'admin', ({ admin, body }) => {
  if (body.fx) {
    const fx = {};
    for (const [k, v] of Object.entries(body.fx)) { if (!/^[A-Z]{3}$/.test(k) || !Number.isInteger(v) || v <= 0) throw new ApiError(422, 'bad_fx', 'FX rates are positive integers in micro-USD per currency unit.'); fx[k] = v; }
    if (!fx.USD) fx.USD = 1000000;
    core.setSetting('fx', fx, admin);
  }
  if (body.caps) {
    const c = body.caps;
    if (!Number.isInteger(c.perInstructionUsd) || !Number.isInteger(c.perDayUsd) || c.perInstructionUsd <= 0 || c.perDayUsd < c.perInstructionUsd) throw new ApiError(422, 'bad_caps', 'Caps must be integer USD cents; per-day at least per-instruction.');
    core.setSetting('caps', { perInstructionUsd: c.perInstructionUsd, perDayUsd: c.perDayUsd }, admin);
  }
  if (body.blocked) {
    const b = body.blocked;
    const ok = (a, re) => Array.isArray(a) && a.every((x) => re.test(x));
    if (!ok(b.countries, /^[A-Z]{2}$/) || !ok(b.pairs, /^[A-Z]{2}>[A-Z]{2}$/) || !ok(b.currencies, /^[A-Z]{3}$/)) throw new ApiError(422, 'bad_blocked', 'Countries XX, pairs XX>YY, currencies XXX.');
    core.setSetting('blocked', { countries: b.countries, pairs: b.pairs, currencies: b.currencies }, admin);
  }
  if (body.purposes) {
    if (!Array.isArray(body.purposes) || body.purposes.some((p) => !/^[A-Z]{4}$/.test(p.code) || !String(p.label || '').trim())) throw new ApiError(422, 'bad_purposes', 'Purpose codes are 4 capital letters with a label.');
    core.setSetting('purposes', body.purposes.map((p) => ({ code: p.code, label: String(p.label).slice(0, 80) })), admin);
  }
  if (body.offlineDefaultHours !== undefined) {
    const h = Number(body.offlineDefaultHours);
    if (!Number.isInteger(h) || h < 1 || h > 72) throw new ApiError(422, 'bad_hours', 'Offline window must be 1-72 hours.');
    core.setSetting('offlineDefaultHours', h, admin);
  }
  return { ok: true };
});
route('GET', '/api/admin/instructions', 'admin', ({ url }) => {
  const st = url.searchParams.get('status');
  const rows = st ? q.all('SELECT * FROM instructions WHERE status=? ORDER BY received DESC LIMIT 300', st)
    : q.all('SELECT * FROM instructions ORDER BY received DESC LIMIT 300');
  return { instructions: rows.map((r) => {
    const v = core.insView(r, 'admin');
    delete v.package; // Channel B stays unreadable and out of the admin view
    return v;
  }) };
});
route('POST', '/api/admin/instructions/:id/resolve', 'admin', ({ admin, params, body }) => { core.resolveFrozen(params.id, body.action, admin, body.note); return { ok: true }; });
route('GET', '/api/admin/log', 'admin', ({ url }) => {
  const from = Number(url.searchParams.get('from')) || 1, limit = Math.min(500, Number(url.searchParams.get('limit')) || 100);
  return { entries: core.relayLogRows(from, limit).map((r) => ({ seq: r.seq, ts: r.ts, type: r.type, ref: r.ref, ops: JSON.parse(r.ops), data: JSON.parse(r.data), hash: r.hash })) };
});
route('GET', '/api/admin/log/verify', 'admin', () => core.verifyRelayChain());
route('GET', '/api/admin/log/export', 'admin', ({ res }) => {
  res.setHeader('Content-Disposition', 'attachment; filename="trustline-relay-log.json"');
  return core.exportRelayLog();
});

// ------------------------------------------------------------------ static files
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(cfg.PUBLIC_DIR, rel));
  if (!file.startsWith(cfg.PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  const ext = path.extname(file);
  const standalone = rel === '/auditor.html';
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': standalone
      ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
  });
  fs.createReadStream(file).pipe(res);
}

async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('X-Server-Time', U.nowIso());
  if (!url.pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return serveStatic(req, res, url);
  }
  try {
    let match = null, params = {};
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.re.exec(url.pathname);
      if (m) { match = r; r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); }); break; }
    }
    if (!match) throw new ApiError(404, 'no_route', 'Unknown endpoint.');
    const raw = req.method === 'GET' ? Buffer.alloc(0) : await readBody(req);
    let body = {};
    if (raw.length) {
      try { body = JSON.parse(raw.toString('utf8')); } catch (e) { throw new ApiError(400, 'bad_json', 'Body is not valid JSON.'); }
    }
    const a = { req, res, url, params, body };
    if (match.auth === 'agent') a.ctx = agentAuth(req, raw, url);
    else if (match.auth === 'operator' || match.auth === 'operator-any') {
      if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'tl') throw new ApiError(403, 'csrf', 'Missing X-Requested-With header.');
      Object.assign(a, operatorAuth(req, match.auth === 'operator-any'));
    } else if (match.auth === 'admin') {
      if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'tl') throw new ApiError(403, 'csrf', 'Missing X-Requested-With header.');
      Object.assign(a, adminAuth(req));
    }
    const result = await match.handler(a);
    send(res, 200, result === undefined ? { ok: true } : result);
  } catch (e) {
    if (e instanceof ApiError) return send(res, e.status, { error: e.code, message: e.message, ...(e.extra || {}) });
    console.error('[error]', req.method, req.url, e);
    send(res, 500, { error: 'internal', message: 'Internal error.' });
  }
}

function start() {
  const server = cfg.tls.keyFile && cfg.tls.certFile
    ? https.createServer({ key: fs.readFileSync(cfg.tls.keyFile), cert: fs.readFileSync(cfg.tls.certFile) }, handler)
    : http.createServer(handler);
  server.listen(cfg.port, cfg.host, () => {
    console.log(`TrustLine relay ${cfg.VERSION} listening on ${cfg.tls.keyFile ? 'https' : 'http'}://${cfg.host}:${cfg.port}`);
  });
  setInterval(() => { try { core.sweepExpiry(); } catch (e) { console.error('[sweep]', e); } }, 30 * 1000).unref();
  setInterval(() => { try { q.run('DELETE FROM sessions WHERE expires < ?', U.nowIso()); } catch (e) { /* ignore */ } }, 3600 * 1000).unref();
  return server;
}

module.exports = { start, handler };
