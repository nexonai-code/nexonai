'use strict';
/**
 * Simulation clients used by the end-to-end tests and by the demo seed script.
 * They talk to a running relay over HTTP exactly like the real clients do (operator portal in the browser,
 * agent app on Android) and use the same shared crypto (public/tlcrypto.js).
 */
const TL = require('../public/tlcrypto.js');

class Http {
  constructor(base) { this.base = base.replace(/\/$/, ''); this.cookie = ''; }
  async req(method, path, body, headers) {
    const h = { 'Content-Type': 'application/json', 'X-Requested-With': 'tl', ...(headers || {}) };
    if (this.cookie) h.Cookie = this.cookie;
    const res = await fetch(this.base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    if (sc.length) this.cookie = sc.map((c) => c.split(';')[0]).join('; ');
    const text = await res.text();
    let json = {};
    try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }
    if (!res.ok) { const err = new Error(`${method} ${path} -> ${res.status} ${json.error || ''} ${json.message || ''}`); err.status = res.status; err.body = json; throw err; }
    return json;
  }
  get(p) { return this.req('GET', p); }
  post(p, b) { return this.req('POST', p, b === undefined ? {} : b); }
  put(p, b) { return this.req('PUT', p, b); }
}

class AdminSim {
  constructor(base, username, password) { this.http = new Http(base); this.u = username; this.p = password; this.ddItems = null; }
  async login() { await this.http.post('/api/admin/login', { username: this.u, password: this.p }); const me = await this.http.get('/api/admin/me'); this.ddItems = me.ddItems; this.screening = me.screening; return this; }
  async createOperator(o) { return (await this.http.post('/api/admin/operators', o)).id; }
  async completeDD(id, risk) {
    const items = {}, screening = {};
    for (const i of this.ddItems) items[i.id] = { received: true, verified: true, na: false, note: 'Verified in demo' };
    for (const s of this.screening) screening[s] = true;
    await this.http.put(`/api/admin/operators/${id}/dd`, { items, screening, risk: risk || 'medium' });
  }
  propose(id, kind, note) { return this.http.post(`/api/admin/operators/${id}/propose`, { kind, note }).then((r) => r.proposal); }
  decide(proposal, approve) { return this.http.post(`/api/admin/proposals/${proposal}/decide`, { approve }); }
}

class OperatorSim {
  constructor(base) { this.http = new Http(base); this.bundle = null; }
  async activate(username, invite, password) {
    await this.http.post('/api/op/accept-invite', { username, invite, password });
    await this.http.post('/api/op/login', { username, password });
    this.me = await this.http.get('/api/op/me');
    this.id = this.me.operator.id;
    return this;
  }
  async login(username, password) { await this.http.post('/api/op/login', { username, password }); this.me = await this.http.get('/api/op/me'); this.id = this.me.operator.id; return this; }
  async registerKeys(bundle) {
    this.bundle = bundle || await TL.genBundle();
    await this.http.post('/api/op/keys', { signPub: this.bundle.signPub, encPub: this.bundle.encPub });
    return this.bundle;
  }
  createAgent(a) { return this.http.post('/api/op/agents', a).then((r) => r.agent); }
  async certifyPending() {
    const { devices } = await this.http.get('/api/op/devices/pending');
    const key = await TL.importSignPriv(this.bundle.signPriv);
    for (const d of devices) {
      const cert = { t: 'agent-cert', v: 1, agent: d.agentId, operator: this.id, name: d.agentName, country: d.country, city: d.city || '',
        signPub: d.signPub, encPub: d.encPub, signKid: d.signKid, encKid: d.encKid,
        issuedAt: new Date().toISOString(), notAfter: new Date(Date.now() + 365 * 86400000).toISOString() };
      await this.http.post(`/api/op/devices/${d.id}/certify`, { cert, sig: await TL.signObject(key, cert) });
    }
    return devices.length;
  }
  async requestConnection(to, corridors) {
    const key = await TL.importSignPriv(this.bundle.signPriv);
    const record = { t: 'connection', id: 'CN-' + TL.hex(TL.rand(5)).toUpperCase(), a: this.id, b: to, corridors: corridors.slice().sort(), at: new Date().toISOString() };
    await this.http.post('/api/op/connections', { to, corridors, record, sig: await TL.signObject(key, record) });
    return record.id;
  }
  async approveConnection(connId) {
    const { connections } = await this.http.get('/api/op/connections');
    const c = connections.find((x) => x.id === connId);
    const key = await TL.importSignPriv(this.bundle.signPriv);
    const counter = { t: 'connection-approval', connection: connId, operator: this.id, of: await TL.sha256Hex(TL.canon(c.record)), at: new Date().toISOString() };
    await this.http.post(`/api/op/connections/${connId}/decide`, { approve: true, record: counter, sig: await TL.signObject(key, counter) });
  }
  async decryptInstruction(item) {
    return TL.decryptPackage(item.package, this.bundle.encKid, this.bundle.encPriv);
  }
  async seal() {
    const head = await this.http.get('/api/op/log/head');
    if (!head.head) return null;
    const key = await TL.importSignPriv(this.bundle.signPriv);
    const seal = { t: 'log-seal', operator: this.id, seq: head.head.seq, hash: head.head.hash, at: new Date().toISOString() };
    await this.http.post('/api/op/log/seal', { seal, sig: await TL.signObject(key, seal) });
    return seal;
  }
}

class AgentSim {
  constructor(base) { this.base = base.replace(/\/$/, ''); this.bundle = null; this.offsetMs = 0; }
  async init() { this.bundle = await TL.genBundle(); this.signKey = await TL.importSignPriv(this.bundle.signPriv); return this; }
  async enrol(code, deviceName) {
    const res = await fetch(this.base + '/api/agent/enroll', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, signPub: this.bundle.signPub, encPub: this.bundle.encPub, deviceName: deviceName || 'Simulated device' }) });
    if (!res.ok) throw new Error('enrol failed ' + (await res.text()));
    this.code = code;
  }
  async status() { const r = await fetch(this.base + '/api/agent/enroll/status?code=' + encodeURIComponent(this.code)); const j = await r.json(); if (j.status === 'certified') { this.agentId = j.agentId; this.profile = j; } return j; }
  async call(method, path, body) {
    const raw = body === undefined ? '' : JSON.stringify(body);
    const ts = new Date(Date.now() + this.offsetMs).toISOString();
    const data = `${method}\n${path}\n${ts}\n${await TL.sha256Hex(raw)}`;
    const sig = await TL.signBytes(this.signKey, data);
    const res = await fetch(this.base + path, { method, headers: { 'Content-Type': 'application/json', 'X-Agent': this.agentId, 'X-Key': this.bundle.signKid, 'X-Ts': ts, 'X-Sig': sig },
      body: body === undefined ? undefined : raw });
    const json = await res.json();
    if (!res.ok) { const e = new Error(`${method} ${path} -> ${res.status} ${json.error}`); e.status = res.status; e.body = json; throw e; }
    return json;
  }
  async me() { this.meInfo = await this.call('GET', '/api/agent/me'); return this.meInfo; }
  async directory() { return (await this.call('GET', '/api/agent/directory')).recipients; }
  async buildInstruction(o) {
    const me = this.meInfo || await this.me();
    const rec = o.recipient;
    const id = o.id || TL.uuid();
    const code = o.code || TL.generateCode();
    const created = o.createdAt || new Date().toISOString();
    const payload = { instruction: id, originator: o.originator || { name: 'Sender Name', address: 'Sender Address', idType: 'passport', idNumber: 'A123456', dob: '1980-01-01', customerRef: 'C-1' },
      beneficiary: o.beneficiary || { name: 'Beneficiary Name', payoutLocation: rec.agent.city || rec.agent.name } };
    const recips = [
      { keyId: me.operator.encKid, encPub: me.operator.encPub },
      { keyId: rec.operator.encKid, encPub: rec.operator.encPub },
      { keyId: rec.device.encKid, encPub: rec.device.encPub }];
    const pkg = await TL.encryptPackage(payload, id, recips);
    const ins = { v: '1', id, createdAt: created, expiresAt: o.expiresAt || new Date(Date.now() + 7 * 86400000).toISOString(),
      amount: { value: o.amount || '100.00', currency: o.currency || 'USD' }, payout: { value: o.payout || o.amount || '100.00', currency: o.payoutCurrency || o.currency || 'USD' },
      corridor: { from: me.agent.country, to: rec.agent.country }, reference: o.reference || 'REF-1', purpose: o.purpose || 'OTHR',
      codeHash: await TL.codeHash(id, code), pkgHash: await TL.pkgHash(pkg),
      screening: o.screening === undefined ? { done: true, ref: 'SCR-' + id.slice(0, 8), at: created } : o.screening,
      sender: { agent: me.agent.id, operator: me.operator.id }, recipient: { agent: rec.agent.id, operator: rec.operator.id } };
    const sig = await TL.signObject(this.signKey, ins);
    return { id, code, instruction: ins, sig, package: pkg };
  }
  async send(o) {
    const b = await this.buildInstruction(o);
    const r = await this.call('POST', '/api/agent/instructions', { instruction: b.instruction, sig: b.sig, package: b.package });
    return { ...b, receipt: r.receipt };
  }
  async event(t, instruction, extra) {
    const ev = { t, instruction, agent: this.agentId, at: new Date().toISOString(), nonce: TL.uuid(), ...(extra || {}) };
    const sig = await TL.signObject(this.signKey, ev);
    return (await this.call('POST', '/api/agent/events', { event: ev, sig })).receipt;
  }
  confirm(id) { return this.event('CONFIRM', id); }
  cancel(id) { return this.event('CANCEL', id); }
  async payout(id, code) { return this.event('PAID_OUT', id, { codeHash: await TL.codeHash(id, code) }); }
  async inbox() { return (await this.call('GET', '/api/agent/inbox')).items; }
  async outbox() { return (await this.call('GET', '/api/agent/outbox')).items; }
  async decrypt(item) { return TL.decryptPackage(item.package, this.bundle.encKid, this.bundle.encPriv); }
}

/** Builds a complete little network: two operators, one agent each, connected both ways. */
async function buildDemoNetwork(base, admins, opts) {
  const a1 = await new AdminSim(base, admins.admin1.u, admins.admin1.p).login();
  const a2 = await new AdminSim(base, admins.admin2.u, admins.admin2.p).login();
  const out = { admins: [a1, a2], operators: [] };
  for (const spec of opts.operators) {
    const id = await a1.createOperator({ name: spec.name, country: spec.country, licence: spec.licence, contact: spec.contact || '', adminUser: spec.user });
    await a1.completeDD(id, spec.risk);
    const pr = await a1.propose(id, 'admit', '');
    const { invite } = await a2.decide(pr, true);
    const op = await new OperatorSim(base).activate(spec.user, invite, spec.password);
    await op.registerKeys(spec.bundle);
    out.operators.push({ spec, op, id });
  }
  return out;
}

module.exports = { Http, AdminSim, OperatorSim, AgentSim, buildDemoNetwork, TL };
