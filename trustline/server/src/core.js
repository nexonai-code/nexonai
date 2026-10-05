'use strict';
/**
 * TrustLine relay core: settings, signed hash-chained logs, due diligence workflow, agents, devices,
 * connections, the mandatory instruction checks, events, expiry and freezing.
 * Everything that changes state runs inside one SQLite transaction and appends to the logs.
 */
const { db, tx, q } = require('./db');
const N = require('./ncrypto');
const TL = require('../public/tlcrypto.js');
const U = require('./util');
const { ApiError } = U;

const canon = TL.canon;
const HOUR = 3600 * 1000;

// ------------------------------------------------------------------ settings
const DEFAULT_SETTINGS = {
  // USD value in micro-dollars per 1 unit of currency (demo rates, editable by TrustLine admins)
  fx: { USD: 1000000, EUR: 1080000, JOD: 1410000, YER: 4000, SAR: 270000, AED: 270000, EGP: 20000, KES: 7700 },
  caps: { perInstructionUsd: 1000000, perDayUsd: 5000000 }, // minor units (USD cents): 10,000.00 / 50,000.00
  blocked: { countries: [], pairs: [], currencies: [] },
  // Demo list. Replace with the official ISO 20022 ExternalPurpose code list that the lawyer confirms.
  purposes: [
    { code: 'SALA', label: 'Salary payment' }, { code: 'EDUC', label: 'Education' },
    { code: 'MDCS', label: 'Medical services' }, { code: 'CHAR', label: 'Charity / humanitarian payment' },
    { code: 'SUPP', label: 'Supplier payment' }, { code: 'TRAD', label: 'Trade services' },
    { code: 'RENT', label: 'Rent' }, { code: 'OTHR', label: 'Other (e.g. family support, with reference)' },
  ],
  offlineDefaultHours: 24,
};
function getSetting(key) {
  const r = q.get('SELECT v FROM settings WHERE k = ?', key);
  return r ? JSON.parse(r.v) : JSON.parse(JSON.stringify(DEFAULT_SETTINGS[key]));
}
function setSetting(key, value, by) {
  tx(() => {
    q.run('INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', key, JSON.stringify(value));
    appendLog('SETTING_CHANGED', key, [], { key, value, by: by || 'admin' });
  });
}
const usdMinor = (minor, currency) => {
  const rate = getSetting('fx')[currency];
  return Math.round((minor * rate) / 1e6);
};

// ------------------------------------------------------------------ relay key + logs
function relayKey() {
  let pub = q.get("SELECT v FROM meta WHERE k='relay_pub'");
  let priv = q.get("SELECT v FROM meta WHERE k='relay_priv'");
  if (!pub) {
    const kp = N.newKeyPair();
    q.run("INSERT INTO meta(k,v) VALUES('relay_pub',?)", kp.pub);
    q.run("INSERT INTO meta(k,v) VALUES('relay_priv',?)", kp.priv);
    return { pub: kp.pub, priv: kp.priv, kid: N.keyIdOf(kp.pub) };
  }
  return { pub: pub.v, priv: priv.v, kid: N.keyIdOf(pub.v) };
}
const ZERO = '0'.repeat(64);

/** Appends one entry to the relay log and to the log of every operator involved. */
function appendLog(type, ref, ops, data) {
  return tx(() => {
    const rk = relayKey();
    const last = q.get('SELECT seq, hash FROM log ORDER BY seq DESC LIMIT 1');
    const seq = last ? last.seq + 1 : 1;
    const prev = last ? last.hash : ZERO;
    const ts = U.nowIso();
    const opList = [...new Set((ops || []).filter(Boolean))].sort();
    const core = { seq, ts, type, ref: ref || '', ops: opList, data, prev };
    const hash = N.sha256Hex(canon(core));
    const sig = N.signWith(rk.priv, hash);
    q.run('INSERT INTO log(seq,ts,type,ref,ops,data,prev,hash,sig) VALUES(?,?,?,?,?,?,?,?,?)',
      seq, ts, type, ref || '', canon(opList), canon(data), prev, hash, sig);
    for (const op of opList) {
      const l = q.get('SELECT seq, hash FROM op_log WHERE operator_id=? ORDER BY seq DESC LIMIT 1', op);
      const oseq = l ? l.seq + 1 : 1;
      const oprev = l ? l.hash : ZERO;
      const oc = { seq: oseq, ts, type, ref: ref || '', relaySeq: seq, relayHash: hash, data, prev: oprev };
      q.run('INSERT INTO op_log(operator_id,seq,ts,type,ref,relay_seq,relay_hash,data,prev,hash) VALUES(?,?,?,?,?,?,?,?,?,?)',
        op, oseq, ts, type, ref || '', seq, hash, canon(data), oprev, N.sha256Hex(canon(oc)));
    }
    return { seq, hash, ts };
  });
}

function receipt(obj) {
  const rk = relayKey();
  return { ...obj, sig: N.signWith(rk.priv, canon(obj)), relayKid: rk.kid };
}

// ------------------------------------------------------------------ due diligence + operators
const DD_ITEMS = [
  ['legal-status', 'Corporate documents: registry extract (max. 3 months old), articles, authority of signatories'],
  ['licences', 'Licences / registrations for every country of operation, with conditions and current status'],
  ['supervisory-history', 'Supervisory history (5 years): inspections, remediation orders, fines, suspensions'],
  ['ownership', 'Ownership down to natural persons (all holdings of 10% or more), IDs and address proofs'],
  ['management', 'Management: ID, CV, police clearance or equivalent'],
  ['compliance-org', 'AML/CFT programme, enterprise risk assessment, compliance officer, training records'],
  ['sanctions-programme', 'Sanctions programme: lists applied, screening system, hit handling, blocked countries'],
  ['str', 'Suspicious-transaction reporting procedure; counts of reports in the last 3 years (no contents)'],
  ['audit', 'Latest independent audit report and management response'],
  ['bank-questionnaire', 'Completed correspondent-bank questionnaire (e.g. Wolfsberg CBDDQ)'],
  ['agent-network', 'Agent network: counts, countries, locations, sample agent contract, onboarding/monitoring, high-risk agents'],
  ['business-model', 'Business model: products, corridors, currencies, 12-month volumes, average amount, payout types'],
  ['financials', 'Audited financial statements (3 years) and source of capital'],
  ['settlement-banks', 'Settlement and banks: names/countries, proof of accounts, account closures (3 years) with reasons'],
  ['systems', 'Systems: transaction, KYC and screening software, vendors, interfaces, customer data handling'],
  ['infosec', 'Information security and data protection policies, incident response, retention rules (5 years or more)'],
  ['reputation', 'Litigation / investigations disclosure and two business references'],
  ['declarations', 'Signed management declarations and participation terms'],
  ['usd', 'USD operation: US sanctions screening evidence, US registration or statement of non-applicability'],
].map(([id, label]) => ({ id, label }));
const SCREENING = ['owners', 'management', 'agents', 'adverseMedia'];

function emptyDD() {
  const items = {};
  for (const i of DD_ITEMS) items[i.id] = { received: false, verified: false, na: false, note: '' };
  const screening = {};
  for (const s of SCREENING) screening[s] = false;
  return { items, screening };
}

function createOperator(a, admin) {
  const name = String(a.name || '').trim(), country = String(a.country || '').trim().toUpperCase();
  const licence = String(a.licence || '').trim(), adminUser = String(a.adminUser || '').trim().toLowerCase();
  if (name.length < 3 || !/^[A-Z]{2}$/.test(country) || licence.length < 3)
    throw new ApiError(422, 'bad_input', 'Name, 2-letter country and licence reference are required.');
  if (!/^[a-z0-9._-]{3,32}$/.test(adminUser)) throw new ApiError(422, 'bad_input', 'Portal username: 3-32 chars a-z 0-9 . _ -');
  if (q.get('SELECT 1 FROM operator_users WHERE username=?', adminUser)) throw new ApiError(409, 'exists', 'Portal username already taken.');
  return tx(() => {
    const id = U.randomId('OP');
    q.run('INSERT INTO operators(id,name,country,licence,contact,status,risk,dd,created) VALUES(?,?,?,?,?,?,?,?,?)',
      id, name, country, licence, String(a.contact || ''), 'APPLICATION', 'medium', JSON.stringify(emptyDD()), U.nowIso());
    q.run('INSERT INTO operator_users(username, operator_id) VALUES(?,?)', adminUser, id);
    appendLog('OPERATOR_APPLICATION', id, [id], { operator: id, name, country, licence, by: admin });
    return id;
  });
}

function updateDD(opId, body, admin) {
  const op = q.get('SELECT * FROM operators WHERE id=?', opId);
  if (!op) throw new ApiError(404, 'not_found', 'Operator not found.');
  if (op.status !== 'APPLICATION') throw new ApiError(409, 'locked', 'Due diligence can only be edited during the application.');
  const dd = JSON.parse(op.dd);
  for (const i of DD_ITEMS) {
    const s = (body.items || {})[i.id];
    if (s) dd.items[i.id] = { received: !!s.received, verified: !!s.verified, na: !!s.na, note: String(s.note || '').slice(0, 500) };
  }
  for (const s of SCREENING) if (body.screening && s in body.screening) dd.screening[s] = !!body.screening[s];
  const risk = ['low', 'medium', 'high'].includes(body.risk) ? body.risk : op.risk;
  tx(() => {
    q.run('UPDATE operators SET dd=?, risk=? WHERE id=?', JSON.stringify(dd), risk, opId);
    appendLog('DD_UPDATED', opId, [opId], { operator: opId, risk, by: admin, verified: Object.values(dd.items).filter((x) => x.verified || x.na).length });
  });
}

function ddComplete(op) {
  const dd = JSON.parse(op.dd);
  const missing = DD_ITEMS.filter((i) => !(dd.items[i.id].verified || dd.items[i.id].na)).map((i) => i.id);
  const unscreened = SCREENING.filter((s) => !dd.screening[s]);
  return { complete: !missing.length && !unscreened.length, missing, unscreened };
}

function propose(kind, opId, note, admin) {
  const op = q.get('SELECT * FROM operators WHERE id=?', opId);
  if (!op) throw new ApiError(404, 'not_found', 'Operator not found.');
  const allowed = { admit: 'APPLICATION', suspend: 'ACTIVE', reinstate: 'SUSPENDED' };
  if (!allowed[kind]) throw new ApiError(422, 'bad_kind', 'Unknown proposal kind.');
  if (op.status !== allowed[kind]) throw new ApiError(409, 'bad_state', `Operator status is ${op.status}; ${kind} needs ${allowed[kind]}.`);
  if (kind === 'admit') {
    const c = ddComplete(op);
    if (!c.complete) throw new ApiError(409, 'dd_incomplete', 'Due diligence is incomplete.', c);
  }
  if ((kind === 'suspend' || kind === 'reinstate') && String(note || '').trim().length < 5)
    throw new ApiError(422, 'note_required', 'A reason is required.');
  if (q.get("SELECT 1 FROM proposals WHERE kind=? AND subject=? AND status='OPEN'", kind, opId))
    throw new ApiError(409, 'open_proposal', 'There is already an open proposal.');
  return tx(() => {
    const r = q.run('INSERT INTO proposals(kind,subject,note,proposer,status,created) VALUES(?,?,?,?,?,?)',
      kind, opId, String(note || ''), admin, 'OPEN', U.nowIso());
    appendLog('PROPOSAL_OPENED', opId, [opId], { id: Number(r.lastInsertRowid), kind, operator: opId, by: admin, note: String(note || '') });
    return Number(r.lastInsertRowid);
  });
}

/** Four-eyes: a different admin must confirm. Returns extra info (e.g. the operator invite code). */
function decideProposal(id, admin, approve) {
  const p = q.get('SELECT * FROM proposals WHERE id=?', id);
  if (!p || p.status !== 'OPEN') throw new ApiError(404, 'not_found', 'No open proposal with this id.');
  if (p.proposer === admin) throw new ApiError(403, 'four_eyes', 'A different administrator must decide (four-eyes principle).');
  return tx(() => {
    const now = U.nowIso();
    if (!approve) {
      q.run("UPDATE proposals SET status='REJECTED', approver=?, decided=? WHERE id=?", admin, now, id);
      appendLog('PROPOSAL_REJECTED', p.subject, [p.subject], { id, kind: p.kind, operator: p.subject, by: admin });
      return {};
    }
    q.run("UPDATE proposals SET status='APPROVED', approver=?, decided=? WHERE id=?", admin, now, id);
    const opId = p.subject;
    let extra = {};
    if (p.kind === 'admit') {
      const op = q.get('SELECT * FROM operators WHERE id=?', opId);
      if (!ddComplete(op).complete) throw new ApiError(409, 'dd_incomplete', 'Due diligence is incomplete.');
      q.run("UPDATE operators SET status='ACTIVE', status_reason='' WHERE id=?", opId);
      const invite = U.randomCode(12, 4);
      q.run('UPDATE operator_users SET invite=?, invite_exp=? WHERE operator_id=?', invite, U.addMs(now, 7 * 24 * HOUR), opId);
      const user = q.get('SELECT username FROM operator_users WHERE operator_id=?', opId);
      extra = { invite, username: user.username, expires: U.addMs(now, 7 * 24 * HOUR) };
      appendLog('OPERATOR_ADMITTED', opId, [opId], { id, operator: opId, proposer: p.proposer, approver: admin, risk: op.risk });
    } else if (p.kind === 'suspend') {
      q.run("UPDATE operators SET status='SUSPENDED', status_reason=? WHERE id=?", p.note, opId);
      appendLog('OPERATOR_SUSPENDED', opId, [opId], { id, operator: opId, reason: p.note, proposer: p.proposer, approver: admin });
      freezeOpen('operator', opId, 'Operator suspended: ' + p.note);
      q.run("UPDATE connections SET status='SUSPENDED' WHERE (a=? OR b=?) AND status='ACTIVE'", opId, opId);
    } else if (p.kind === 'reinstate') {
      q.run("UPDATE operators SET status='ACTIVE', status_reason='' WHERE id=?", opId);
      appendLog('OPERATOR_REINSTATED', opId, [opId], { id, operator: opId, reason: p.note, proposer: p.proposer, approver: admin });
    }
    return extra;
  });
}

function acceptInvite(username, invite, password) {
  const u = q.get('SELECT * FROM operator_users WHERE username=?', String(username || '').toLowerCase());
  if (!u || !u.invite || U.normInvite(invite) !== U.normInvite(u.invite) || new Date(u.invite_exp) < new Date())
    throw new ApiError(403, 'bad_invite', 'Invite code invalid or expired.');
  if (String(password || '').length < 10) throw new ApiError(422, 'weak_password', 'Password needs at least 10 characters.');
  q.run('UPDATE operator_users SET pass=?, invite=NULL, invite_exp=NULL WHERE username=?', U.hashPassword(password), u.username);
}
U.normInvite = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function registerOperatorKeys(opId, signPub, encPub) {
  const op = q.get('SELECT * FROM operators WHERE id=?', opId);
  if (op.sign_pub) throw new ApiError(409, 'keys_exist', 'Master keys are already registered. Contact TrustLine to rotate them.');
  if (!N.validSpki(signPub) || !N.validSpki(encPub)) throw new ApiError(422, 'bad_key', 'Keys must be P-256 SPKI (base64).');
  tx(() => {
    q.run('UPDATE operators SET sign_pub=?, enc_pub=?, sign_kid=?, enc_kid=?, keys_at=? WHERE id=?',
      signPub, encPub, N.keyIdOf(signPub), N.keyIdOf(encPub), U.nowIso(), opId);
    appendLog('OPERATOR_KEYS_REGISTERED', opId, [opId], { operator: opId, signPub, encPub, signKid: N.keyIdOf(signPub), encKid: N.keyIdOf(encPub) });
  });
}

// ------------------------------------------------------------------ agents + devices
function agentView(a) {
  const dev = q.get("SELECT * FROM devices WHERE agent_id=? AND status IN ('PENDING','ACTIVE') ORDER BY id DESC LIMIT 1", a.id);
  return {
    id: a.id, operatorId: a.operator_id, name: a.name, city: a.city, country: a.country, phone: a.phone, status: a.status,
    perInstruction: U.fromMinor(a.per_instruction), perDay: U.fromMinor(a.per_day),
    offlinePayout: !!a.offline_payout, offlineLimit: U.fromMinor(a.offline_limit), offlineHours: a.offline_hours,
    code: a.status === 'CREATED' || (dev && dev.status === 'PENDING') || !dev ? a.code : null, codeExp: a.code_exp, created: a.created,
    device: dev ? { id: dev.id, status: dev.status, name: dev.name, signKid: dev.sign_kid, encKid: dev.enc_kid, created: dev.created, certifiedAt: dev.certified_at } : null,
  };
}

function createAgent(opId, a) {
  const op = q.get('SELECT * FROM operators WHERE id=?', opId);
  if (op.status !== 'ACTIVE') throw new ApiError(403, 'operator_inactive', 'Operator is not active.');
  if (!op.sign_pub) throw new ApiError(409, 'no_keys', 'Register your master keys first.');
  const name = String(a.name || '').trim(), country = String(a.country || '').trim().toUpperCase();
  if (name.length < 2 || !/^[A-Z]{2}$/.test(country)) throw new ApiError(422, 'bad_input', 'Agent name and 2-letter country are required.');
  const caps = getSetting('caps');
  const perIns = Math.min(U.toMinor(String(a.perInstruction || '1000.00')), caps.perInstructionUsd);
  const perDay = Math.min(U.toMinor(String(a.perDay || '5000.00')), caps.perDayUsd);
  const offLimit = Math.min(U.toMinor(String(a.offlineLimit || '0.00')), perIns);
  return tx(() => {
    const id = U.randomId('AG');
    const code = U.randomCode(8, 4);
    q.run(`INSERT INTO agents(id,operator_id,name,city,country,phone,status,per_instruction,per_day,offline_payout,offline_limit,offline_hours,code,code_exp,created)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, opId, name, String(a.city || ''), country, String(a.phone || ''), 'CREATED', perIns, perDay,
      a.offlinePayout ? 1 : 0, offLimit, Math.max(1, Math.min(72, Number(a.offlineHours) || getSetting('offlineDefaultHours'))),
      code, U.addMs(U.nowIso(), 7 * 24 * HOUR), U.nowIso());
    appendLog('AGENT_CREATED', id, [opId], { agent: id, operator: opId, name, country, city: String(a.city || '') });
    return agentView(q.get('SELECT * FROM agents WHERE id=?', id));
  });
}

function updateAgent(opId, agentId, a) {
  const ag = q.get('SELECT * FROM agents WHERE id=? AND operator_id=?', agentId, opId);
  if (!ag) throw new ApiError(404, 'not_found', 'Agent not found.');
  const caps = getSetting('caps');
  const perIns = Math.min(U.toMinor(String(a.perInstruction)), caps.perInstructionUsd);
  const perDay = Math.min(U.toMinor(String(a.perDay)), caps.perDayUsd);
  const offLimit = Math.min(U.toMinor(String(a.offlineLimit || '0.00')), perIns);
  tx(() => {
    q.run('UPDATE agents SET per_instruction=?, per_day=?, offline_payout=?, offline_limit=?, offline_hours=? WHERE id=?',
      perIns, perDay, a.offlinePayout ? 1 : 0, offLimit, Math.max(1, Math.min(72, Number(a.offlineHours) || 24)), agentId);
    appendLog('AGENT_LIMITS_CHANGED', agentId, [opId], { agent: agentId, perInstruction: U.fromMinor(perIns), perDay: U.fromMinor(perDay),
      offlinePayout: !!a.offlinePayout, offlineLimit: U.fromMinor(offLimit), offlineHours: Number(a.offlineHours) || 24 });
  });
}

function enrol(body) {
  const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const ag = q.get('SELECT * FROM agents WHERE REPLACE(code,\'-\',\'\') = ?', code);
  if (!ag || !ag.code_exp || new Date(ag.code_exp) < new Date()) throw new ApiError(404, 'bad_code', 'Activation code invalid or expired.');
  if (ag.status === 'REVOKED') throw new ApiError(403, 'agent_revoked', 'This agent has been revoked.');
  if (ag.status === 'ACTIVE') throw new ApiError(409, 'already_enrolled', 'This agent already has an active device. Ask your operator to revoke it first.');
  if (!N.validSpki(body.signPub) || !N.validSpki(body.encPub)) throw new ApiError(422, 'bad_key', 'Keys must be P-256 SPKI (base64).');
  return tx(() => {
    // Only one device per agent: a new enrolment replaces any pending device; an active device is revoked on certification.
    q.run("UPDATE devices SET status='REJECTED' WHERE agent_id=? AND status='PENDING'", ag.id);
    q.run('INSERT INTO devices(agent_id,sign_pub,enc_pub,sign_kid,enc_kid,name,status,created) VALUES(?,?,?,?,?,?,?,?)',
      ag.id, body.signPub, body.encPub, N.keyIdOf(body.signPub), N.keyIdOf(body.encPub), String(body.deviceName || '').slice(0, 60), 'PENDING', U.nowIso());
    appendLog('DEVICE_ENROLMENT_REQUESTED', ag.id, [ag.operator_id], { agent: ag.id, operator: ag.operator_id, signKid: N.keyIdOf(body.signPub), encKid: N.keyIdOf(body.encPub) });
    return { agent: ag.id };
  });
}

function enrolStatus(code) {
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const ag = q.get('SELECT * FROM agents WHERE REPLACE(code,\'-\',\'\') = ?', c);
  if (!ag) throw new ApiError(404, 'bad_code', 'Unknown activation code.');
  const dev = q.get("SELECT * FROM devices WHERE agent_id=? ORDER BY id DESC LIMIT 1", ag.id);
  const op = q.get('SELECT * FROM operators WHERE id=?', ag.operator_id);
  if (!dev) return { status: 'none' };
  if (dev.status === 'ACTIVE') return { status: 'certified', agentId: ag.id, cert: JSON.parse(dev.cert), certSig: dev.cert_sig, ...profile(ag, op) };
  return { status: dev.status.toLowerCase() };
}

function profile(ag, op) {
  const rk = relayKey();
  return {
    relay: { pub: rk.pub, kid: rk.kid },
    agent: { id: ag.id, name: ag.name, city: ag.city, country: ag.country },
    operator: { id: op.id, name: op.name, signPub: op.sign_pub, encPub: op.enc_pub, signKid: op.sign_kid, encKid: op.enc_kid },
    limits: { perInstruction: U.fromMinor(ag.per_instruction), perDay: U.fromMinor(ag.per_day), offlinePayout: !!ag.offline_payout,
      offlineLimit: U.fromMinor(ag.offline_limit), offlineHours: ag.offline_hours },
  };
}

function pendingDevices(opId) {
  return q.all(`SELECT d.*, a.name AS agent_name, a.city, a.country FROM devices d JOIN agents a ON a.id=d.agent_id
                WHERE a.operator_id=? AND d.status='PENDING' ORDER BY d.id`, opId).map((d) => ({
    id: d.id, agentId: d.agent_id, agentName: d.agent_name, city: d.city, country: d.country, deviceName: d.name,
    signPub: d.sign_pub, encPub: d.enc_pub, signKid: d.sign_kid, encKid: d.enc_kid, created: d.created }));
}

function certifyDevice(opId, deviceId, cert, sig) {
  const op = q.get('SELECT * FROM operators WHERE id=?', opId);
  const dev = q.get('SELECT d.*, a.operator_id, a.country, a.name AS aname, a.city FROM devices d JOIN agents a ON a.id=d.agent_id WHERE d.id=?', deviceId);
  if (!dev || dev.operator_id !== opId || dev.status !== 'PENDING') throw new ApiError(404, 'not_found', 'No pending device with this id.');
  if (op.status !== 'ACTIVE') throw new ApiError(403, 'operator_inactive', 'Operator is not active.');
  const ok = cert && cert.t === 'agent-cert' && cert.v === 1 && cert.agent === dev.agent_id && cert.operator === opId &&
    cert.signPub === dev.sign_pub && cert.encPub === dev.enc_pub && cert.signKid === dev.sign_kid && cert.encKid === dev.enc_kid &&
    U.ISO_RE.test(cert.issuedAt || '') && U.ISO_RE.test(cert.notAfter || '') && new Date(cert.notAfter) > new Date();
  if (!ok) throw new ApiError(422, 'bad_cert', 'Certificate does not match the pending device.');
  if (!N.verifySig(op.sign_pub, canon(cert), sig)) throw new ApiError(422, 'bad_signature', 'Certificate signature is not valid for your master key.');
  tx(() => {
    // The previous device of this agent (if any) is replaced.
    const old = q.all("SELECT id FROM devices WHERE agent_id=? AND status='ACTIVE'", dev.agent_id);
    for (const o of old) {
      q.run("UPDATE devices SET status='REVOKED', revoked_at=?, revoked_reason=? WHERE id=?", U.nowIso(), 'Replaced by a new device', o.id);
      appendLog('DEVICE_REVOKED', dev.agent_id, [opId], { agent: dev.agent_id, device: o.id, reason: 'Replaced by a new device', by: 'operator' });
    }
    q.run("UPDATE devices SET status='ACTIVE', cert=?, cert_sig=?, certified_at=? WHERE id=?", canon(cert), sig, U.nowIso(), deviceId);
    q.run("UPDATE agents SET status='ACTIVE' WHERE id=?", dev.agent_id);
    appendLog('DEVICE_CERTIFIED', dev.agent_id, [opId], { agent: dev.agent_id, operator: opId, cert, sig });
    if (old.length) freezeOpen('agent', dev.agent_id, 'Device replaced, open instructions need review');
  });
}

function rejectDevice(opId, deviceId) {
  const dev = q.get('SELECT d.*, a.operator_id FROM devices d JOIN agents a ON a.id=d.agent_id WHERE d.id=?', deviceId);
  if (!dev || dev.operator_id !== opId || dev.status !== 'PENDING') throw new ApiError(404, 'not_found', 'No pending device with this id.');
  tx(() => {
    q.run("UPDATE devices SET status='REJECTED' WHERE id=?", deviceId);
    appendLog('DEVICE_ENROLMENT_REJECTED', dev.agent_id, [opId], { agent: dev.agent_id, operator: opId, device: deviceId });
  });
}

function revokeDevice(opId, agentId, reason, by) {
  const ag = q.get('SELECT * FROM agents WHERE id=? AND operator_id=?', agentId, opId);
  if (!ag) throw new ApiError(404, 'not_found', 'Agent not found.');
  const dev = q.get("SELECT * FROM devices WHERE agent_id=? AND status='ACTIVE'", agentId);
  if (!dev) throw new ApiError(409, 'no_device', 'This agent has no active device.');
  if (String(reason || '').trim().length < 3) throw new ApiError(422, 'note_required', 'A reason is required.');
  tx(() => {
    q.run("UPDATE devices SET status='REVOKED', revoked_at=?, revoked_reason=? WHERE id=?", U.nowIso(), reason, dev.id);
    q.run("UPDATE agents SET status='CREATED', code=?, code_exp=? WHERE id=?", U.randomCode(8, 4), U.addMs(U.nowIso(), 7 * 24 * HOUR), agentId);
    appendLog('DEVICE_REVOKED', agentId, [opId], { agent: agentId, device: dev.id, reason, by: by || 'operator', level: 1 });
    freezeOpen('agent', agentId, 'Device key revoked: ' + reason);
  });
}

function revokeAgent(opId, agentId, reason, by) {
  const ag = q.get('SELECT * FROM agents WHERE id=? AND operator_id=?', agentId, opId);
  if (!ag) throw new ApiError(404, 'not_found', 'Agent not found.');
  if (String(reason || '').trim().length < 3) throw new ApiError(422, 'note_required', 'A reason is required.');
  tx(() => {
    q.run("UPDATE devices SET status='REVOKED', revoked_at=?, revoked_reason=? WHERE agent_id=? AND status IN ('ACTIVE','PENDING')", U.nowIso(), reason, agentId);
    q.run("UPDATE agents SET status='REVOKED', code=NULL, code_exp=NULL WHERE id=?", agentId);
    appendLog('AGENT_REVOKED', agentId, [opId], { agent: agentId, reason, by: by || 'operator', level: 2 });
    freezeOpen('agent', agentId, 'Agent revoked: ' + reason);
  });
}

// ------------------------------------------------------------------ connections
function connView(c) {
  return { id: c.id, a: c.a, b: c.b, corridors: JSON.parse(c.corridors), status: c.status, record: JSON.parse(c.record),
    aSig: c.a_sig, bSig: c.b_sig, created: c.created, approved: c.approved };
}
function requestConnection(opId, body) {
  const to = String(body.to || '');
  const target = q.get('SELECT * FROM operators WHERE id=?', to);
  if (!target || target.status !== 'ACTIVE' || to === opId) throw new ApiError(404, 'not_found', 'Target operator not found or not active.');
  const corridors = [...new Set((body.corridors || []).map(String))];
  if (!corridors.length || corridors.some((c) => !/^[A-Z]{2}>[A-Z]{2}$/.test(c))) throw new ApiError(422, 'bad_corridor', 'Corridors look like JO>YE.');
  const rec = body.record;
  if (!rec || rec.t !== 'connection' || rec.a !== opId || rec.b !== to || canon(rec.corridors) !== canon(corridors.slice().sort()))
    throw new ApiError(422, 'bad_record', 'Signed record does not match the request.');
  const op = q.get('SELECT * FROM operators WHERE id=?', opId);
  if (!N.verifySig(op.sign_pub, canon(rec), body.sig)) throw new ApiError(422, 'bad_signature', 'Signature invalid.');
  if (q.get("SELECT 1 FROM connections WHERE ((a=? AND b=?) OR (a=? AND b=?)) AND status IN ('REQUESTED','ACTIVE')", opId, to, to, opId))
    throw new ApiError(409, 'exists', 'A connection with this operator already exists.');
  tx(() => {
    q.run('INSERT INTO connections(id,a,b,corridors,status,record,a_sig,created) VALUES(?,?,?,?,?,?,?,?)',
      rec.id, opId, to, JSON.stringify(corridors.sort()), 'REQUESTED', canon(rec), body.sig, U.nowIso());
    appendLog('CONNECTION_REQUESTED', rec.id, [opId, to], { connection: rec.id, record: rec, sig: body.sig });
  });
}
function decideConnection(opId, connId, body) {
  const c = q.get('SELECT * FROM connections WHERE id=?', connId);
  if (!c || c.b !== opId || c.status !== 'REQUESTED') throw new ApiError(404, 'not_found', 'No open request with this id.');
  if (!body.approve) {
    tx(() => {
      q.run("UPDATE connections SET status='REJECTED' WHERE id=?", connId);
      appendLog('CONNECTION_REJECTED', connId, [c.a, c.b], { connection: connId, by: opId });
    });
    return;
  }
  const op = q.get('SELECT * FROM operators WHERE id=?', opId);
  const rec = JSON.parse(c.record);
  const counter = body.record;
  if (!counter || counter.t !== 'connection-approval' || counter.connection !== connId || counter.operator !== opId || counter.of !== N.sha256Hex(c.record))
    throw new ApiError(422, 'bad_record', 'Approval does not refer to this request.');
  if (!N.verifySig(op.sign_pub, canon(counter), body.sig)) throw new ApiError(422, 'bad_signature', 'Signature invalid.');
  tx(() => {
    q.run("UPDATE connections SET status='ACTIVE', b_sig=?, approved=? WHERE id=?", canon({ record: counter, sig: body.sig }), U.nowIso(), connId);
    appendLog('CONNECTION_APPROVED', connId, [c.a, c.b], { connection: connId, record: rec, approval: counter, sig: body.sig });
  });
}
function setConnectionStatus(opId, connId, status, reason) {
  const c = q.get('SELECT * FROM connections WHERE id=? AND (a=? OR b=?)', connId, opId, opId);
  if (!c || !['ACTIVE', 'SUSPENDED'].includes(c.status)) throw new ApiError(404, 'not_found', 'Connection not found.');
  if (status === 'ACTIVE' && c.status === 'ACTIVE') return;
  tx(() => {
    q.run('UPDATE connections SET status=? WHERE id=?', status, connId);
    appendLog(status === 'SUSPENDED' ? 'CONNECTION_SUSPENDED' : 'CONNECTION_RESUMED', connId, [c.a, c.b], { connection: connId, by: opId, reason: String(reason || '') });
  });
}
function activeConnectionFor(opA, opB, corridor) {
  const c = q.get("SELECT * FROM connections WHERE status='ACTIVE' AND ((a=? AND b=?) OR (a=? AND b=?))", opA, opB, opB, opA);
  if (!c) return null;
  return JSON.parse(c.corridors).includes(corridor) ? c : null;
}

// ------------------------------------------------------------------ device authentication context
function deviceByKid(kid) {
  const d = q.get('SELECT * FROM devices WHERE sign_kid=? ORDER BY id DESC LIMIT 1', kid);
  if (!d) return null;
  const ag = q.get('SELECT * FROM agents WHERE id=?', d.agent_id);
  const op = q.get('SELECT * FROM operators WHERE id=?', ag.operator_id);
  return { device: d, agent: ag, operator: op };
}
function activeCtx(kid) {
  const c = deviceByKid(kid);
  if (!c) throw new ApiError(401, 'unknown_key', 'Unknown device key.');
  if (c.device.status === 'PENDING') throw new ApiError(403, 'pending', 'Device is waiting for the operator\'s approval.');
  if (c.device.status !== 'ACTIVE') throw new ApiError(403, 'device_revoked', 'This device key has been revoked.');
  if (c.agent.status !== 'ACTIVE') throw new ApiError(403, 'agent_revoked', 'This agent has been revoked.');
  if (c.operator.status !== 'ACTIVE') throw new ApiError(403, 'operator_suspended', 'The network operator is suspended.');
  return c;
}

function directory(ctx) {
  const senderOp = ctx.operator.id, from = ctx.agent.country;
  const conns = q.all("SELECT * FROM connections WHERE status='ACTIVE' AND (a=? OR b=?)", senderOp, senderOp);
  const out = [];
  for (const c of conns) {
    const other = c.a === senderOp ? c.b : c.a;
    const corridors = JSON.parse(c.corridors);
    const op = q.get("SELECT * FROM operators WHERE id=? AND status='ACTIVE'", other);
    if (!op) continue;
    for (const ag of q.all("SELECT * FROM agents WHERE operator_id=? AND status='ACTIVE'", other)) {
      if (!corridors.includes(`${from}>${ag.country}`)) continue;
      const d = q.get("SELECT * FROM devices WHERE agent_id=? AND status='ACTIVE'", ag.id);
      if (!d) continue;
      out.push({
        agent: { id: ag.id, name: ag.name, city: ag.city, country: ag.country },
        operator: { id: op.id, name: op.name, signPub: op.sign_pub, encPub: op.enc_pub, signKid: op.sign_kid, encKid: op.enc_kid },
        device: { signPub: d.sign_pub, encPub: d.enc_pub, signKid: d.sign_kid, encKid: d.enc_kid, cert: JSON.parse(d.cert), certSig: d.cert_sig },
        corridor: `${from}>${ag.country}`,
      });
    }
  }
  return out;
}

// ------------------------------------------------------------------ the mandatory checks (Section 12 of the concept)
const REQUIRED_STR = ['id', 'createdAt', 'expiresAt', 'reference', 'purpose', 'codeHash', 'pkgHash'];
function reasonList() {
  const list = [];
  const add = (code, text) => list.push({ code, text });
  return { list, add };
}

function submitInstruction(ctx, body) {
  const ins = body.instruction, sig = body.sig, pkg = body.package;
  const { list, add } = reasonList();
  const now = new Date();
  const nowIso = U.nowIso();
  const fail = (extra) => {
    const id = ins && typeof ins.id === 'string' ? ins.id.slice(0, 40) : '';
    appendLog('INSTRUCTION_REJECTED', id || ctx.agent.id, [ctx.operator.id, ins && ins.recipient && ins.recipient.operator], {
      instruction: id, sender: ctx.agent.id, reasons: list.map((r) => r.code) });
    throw new ApiError(422, 'rejected', 'Instruction rejected by the mandatory checks.', { reasons: list, ...(extra || {}) });
  };
  if (!ins || typeof ins !== 'object' || !pkg || typeof sig !== 'string') {
    add('FIELDS', 'Body must contain instruction, sig and package.');
    return fail();
  }

  // 1. Sender valid
  if (!ins.sender || ins.sender.agent !== ctx.agent.id || ins.sender.operator !== ctx.operator.id)
    add('SENDER', 'Sender in the instruction does not match the authenticated agent.');
  if (!N.verifySig(ctx.device.sign_pub, canon(ins), sig)) add('SIGNATURE', 'Instruction signature is not valid for the agent key.');
  const cert = ctx.device.cert ? JSON.parse(ctx.device.cert) : null;
  if (!cert || !N.verifySig(ctx.operator.sign_pub, canon(cert), ctx.device.cert_sig) || new Date(cert.notAfter) < now)
    add('CERTIFICATE', 'Agent certificate is invalid or expired.');

  // recipient
  const rAgent = ins.recipient ? q.get('SELECT * FROM agents WHERE id=?', String(ins.recipient.agent)) : null;
  const rOp = rAgent ? q.get('SELECT * FROM operators WHERE id=?', rAgent.operator_id) : null;
  const rDev = rAgent ? q.get("SELECT * FROM devices WHERE agent_id=? AND status='ACTIVE'", rAgent.id) : null;
  if (!rAgent || !rOp || !rDev || rAgent.status !== 'ACTIVE' || rOp.status !== 'ACTIVE' || ins.recipient.operator !== rOp.id)
    add('RECIPIENT', 'Recipient agent is unknown, inactive or does not belong to the stated operator.');

  // 2. Connection for the corridor
  const from = ctx.agent.country, to = rAgent ? rAgent.country : '';
  const corridor = `${from}>${to}`;
  if (!ins.corridor || ins.corridor.from !== from || ins.corridor.to !== to) add('CORRIDOR', 'Corridor in the instruction does not match the agents\' countries.');
  if (rOp && !activeConnectionFor(ctx.operator.id, rOp.id, corridor)) add('CONNECTION', `The two operators are not connected for corridor ${corridor}.`);

  // 3. Corridor / currency not blocked
  const blocked = getSetting('blocked');
  const cur = ins.amount && ins.amount.currency;
  if (blocked.countries.includes(from) || blocked.countries.includes(to) || blocked.pairs.includes(corridor)) add('BLOCKED', `Corridor ${corridor} is on the TrustLine block list.`);
  if (blocked.currencies.includes(cur) || blocked.currencies.includes(ins.payout && ins.payout.currency)) add('BLOCKED_CURRENCY', 'Currency is on the TrustLine block list.');

  // 4. Mandatory fields
  const fx = getSetting('fx');
  const purposes = getSetting('purposes').map((p) => p.code);
  let amountMinor = 0;
  try {
    if (ins.v !== '1') add('FIELDS', 'Unsupported instruction version.');
    for (const k of REQUIRED_STR) if (typeof ins[k] !== 'string' || !ins[k]) add('FIELDS', `Missing field ${k}.`);
    if (!U.UUID_RE.test(ins.id || '')) add('FIELDS', 'id must be a random UUID (v4).');
    if (!U.ISO_RE.test(ins.createdAt || '') || !U.ISO_RE.test(ins.expiresAt || '')) add('FIELDS', 'createdAt/expiresAt must be ISO timestamps (UTC).');
    if (!ins.amount || !(ins.amount.currency in fx) || !U.AMOUNT_RE.test(ins.amount.value || '')) add('FIELDS', 'amount needs a supported currency and a decimal value.');
    else amountMinor = U.toMinor(ins.amount.value);
    if (!ins.payout || !(ins.payout.currency in fx) || !U.AMOUNT_RE.test(ins.payout.value || '')) add('FIELDS', 'payout needs a supported currency and a decimal value.');
    if (amountMinor <= 0) add('FIELDS', 'Amount must be greater than zero.');
    if (!purposes.includes(ins.purpose)) add('PURPOSE', 'Purpose code is not in the allowed list.');
    if (!U.HEX64_RE.test(ins.codeHash || '') || !U.HEX64_RE.test(ins.pkgHash || '')) add('FIELDS', 'codeHash and pkgHash must be SHA-256 hex.');
    const scr = ins.screening;
    if (!scr || scr.done !== true || typeof scr.ref !== 'string' || scr.ref.length < 3 || !U.ISO_RE.test(scr.at || ''))
      add('SCREENING', 'The sending operator must confirm sanctions screening (done, reference, time).');
    if (typeof ins.reference === 'string' && (ins.reference.length < 1 || ins.reference.length > 64)) add('FIELDS', 'reference must be 1-64 characters.');
    // package structure and hash
    const pj = canon(pkg);
    if (pj.length > 24000) add('PACKAGE', 'Channel B package is too large.');
    if (N.sha256Hex(pj) !== ins.pkgHash) add('PACKAGE', 'pkgHash does not match the Channel B package.');
    if (!pkg || pkg.v !== 1 || pkg.aad !== ins.id || !Array.isArray(pkg.rcpts)) add('PACKAGE', 'Channel B package is malformed.');
    else {
      const need = [ctx.operator.enc_kid, rOp && rOp.enc_kid, rDev && rDev.enc_kid];
      for (const kid of need) if (kid && !pkg.rcpts.some((r) => r.k === kid)) add('PACKAGE', 'Channel B package is missing a required recipient (sending operator, receiving operator, receiving agent).');
    }
  } catch (e) { add('FIELDS', 'Malformed instruction: ' + e.message); }

  // 5. Unique number, validity period
  if (U.UUID_RE.test(ins.id || '') && q.get('SELECT 1 FROM instructions WHERE id=?', ins.id)) add('DUPLICATE', 'This instruction number has already been used.');
  if (U.ISO_RE.test(ins.createdAt || '') && U.ISO_RE.test(ins.expiresAt || '')) {
    const created = new Date(ins.createdAt), exp = new Date(ins.expiresAt);
    const windowMs = (ctx.agent.offline_hours + 1) * HOUR;
    if (created.getTime() > now.getTime() + 30 * 60 * 1000) add('TIME', 'createdAt lies in the future.');
    if (created.getTime() < now.getTime() - windowMs) add('TIME', 'createdAt is older than the agent\'s offline window.');
    if (exp <= now) add('EXPIRED', 'expiresAt lies in the past.');
    if (exp.getTime() > now.getTime() + 30 * 24 * HOUR) add('TIME', 'expiresAt may be at most 30 days ahead.');
  }

  // 6. Limits (operator limit per agent, capped by TrustLine)
  if (amountMinor > 0 && cur in fx) {
    const usd = usdMinor(amountMinor, cur);
    const caps = getSetting('caps');
    if (usd > Math.min(ctx.agent.per_instruction, caps.perInstructionUsd)) add('LIMIT', 'Amount exceeds the per-instruction limit of this agent.');
    const day = q.get(`SELECT COALESCE(SUM(usd_minor),0) AS s FROM instructions WHERE sender_agent=? AND received > ? AND status NOT IN ('CANCELLED')`,
      ctx.agent.id, U.addMs(nowIso, -24 * HOUR)).s;
    if (day + usd > Math.min(ctx.agent.per_day, caps.perDayUsd)) add('LIMIT', 'Amount would exceed the 24-hour limit of this agent.');
  }

  if (list.length) fail();

  return tx(() => {
    const log = appendLog('INSTRUCTION_ACCEPTED', ins.id, [ctx.operator.id, rOp.id], {
      instruction: ins, sig, pkgHash: ins.pkgHash, checks: ['SENDER', 'CONNECTION', 'CORRIDOR', 'FIELDS', 'UNIQUE', 'LIMITS'] });
    const rc = receipt({ t: 'receipt', instruction: ins.id, status: 'INSTRUCTED', at: log.ts, seq: log.seq });
    q.run(`INSERT INTO instructions(id,sender_agent,sender_op,recipient_agent,recipient_op,corridor,amount,currency,usd_minor,status,instruction,sig,package,code_hash,created,received,expires,updated,receipt)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ins.id, ctx.agent.id, ctx.operator.id, rAgent.id, rOp.id, corridor, ins.amount.value, cur, usdMinor(amountMinor, cur), 'INSTRUCTED',
      canon(ins), sig, canon(pkg), ins.codeHash, ins.createdAt, nowIso, ins.expiresAt, nowIso, canon(rc));
    return rc;
  });
}

// ------------------------------------------------------------------ events: CONFIRM / PAID_OUT / CANCEL
function insView(r, forAgent) {
  const sd = q.get("SELECT d.cert, d.cert_sig FROM devices d WHERE d.agent_id=? ORDER BY d.id DESC LIMIT 1", r.sender_agent);
  const sop = q.get('SELECT id,name,sign_pub FROM operators WHERE id=?', r.sender_op);
  const sag = q.get('SELECT name, city, country FROM agents WHERE id=?', r.sender_agent);
  const rag = q.get('SELECT name, city, country FROM agents WHERE id=?', r.recipient_agent);
  const rop = q.get('SELECT name FROM operators WHERE id=?', r.recipient_op);
  return {
    id: r.id, status: r.status, frozen: !!r.frozen, freezeReason: r.freeze_reason, instruction: JSON.parse(r.instruction), sig: r.sig,
    package: JSON.parse(r.package), receipt: JSON.parse(r.receipt), received: r.received, updated: r.updated, expires: r.expires,
    senderAgent: { id: r.sender_agent, ...sag }, recipientAgent: { id: r.recipient_agent, ...rag },
    senderOperator: { id: sop.id, name: sop.name, signPub: sop.sign_pub }, recipientOperator: { id: r.recipient_op, name: rop.name },
    senderCert: sd && sd.cert ? JSON.parse(sd.cert) : null, senderCertSig: sd ? sd.cert_sig : null,
    wrongCodes: forAgent === 'recipient' ? r.wrong_codes : undefined,
  };
}
const inbox = (agentId) => q.all(`SELECT * FROM instructions WHERE recipient_agent=? ORDER BY received DESC LIMIT 200`, agentId).map((r) => insView(r, 'recipient'));
const outbox = (agentId) => q.all(`SELECT * FROM instructions WHERE sender_agent=? ORDER BY received DESC LIMIT 200`, agentId).map((r) => insView(r, 'sender'));

function processEvent(ctx, body) {
  const ev = body.event, sig = body.sig;
  if (!ev || typeof ev !== 'object' || typeof sig !== 'string') throw new ApiError(422, 'bad_event', 'Body must contain event and sig.');
  if (!['CONFIRM', 'PAID_OUT', 'CANCEL'].includes(ev.t) || ev.agent !== ctx.agent.id || !U.UUID_RE.test(ev.instruction || '') ||
      !U.UUID_RE.test(ev.nonce || '') || !U.ISO_RE.test(ev.at || ''))
    throw new ApiError(422, 'bad_event', 'Event fields are invalid.');
  if (!N.verifySig(ctx.device.sign_pub, canon(ev), sig)) throw new ApiError(422, 'bad_signature', 'Event signature is not valid for the agent key.');
  const at = new Date(ev.at), now = new Date();
  if (at.getTime() > now.getTime() + 30 * 60 * 1000) throw new ApiError(422, 'bad_time', 'Event time lies in the future.');
  if (at.getTime() < now.getTime() - (ctx.agent.offline_hours + 1) * HOUR) throw new ApiError(422, 'too_old', 'Event is older than the agent\'s offline window.');
  return tx(() => {
    const dup = q.get('SELECT 1 FROM events WHERE nonce=?', ev.nonce);
    const r = q.get('SELECT * FROM instructions WHERE id=?', ev.instruction);
    if (!r) throw new ApiError(404, 'not_found', 'Unknown instruction.');
    if (dup) return receipt({ t: 'event-receipt', instruction: r.id, status: r.status, at: U.nowIso(), seq: 0, duplicate: true });
    const isSender = r.sender_agent === ctx.agent.id, isRecipient = r.recipient_agent === ctx.agent.id;
    let status = r.status;
    let type = ev.t;
    const save = () => q.run('INSERT INTO events(instruction_id,type,agent_id,nonce,event,sig,received) VALUES(?,?,?,?,?,?,?)',
      r.id, ev.t, ctx.agent.id, ev.nonce, canon(ev), sig, U.nowIso());
    const ops = [r.sender_op, r.recipient_op];

    if (ev.t === 'CONFIRM') {
      if (!isRecipient) throw new ApiError(403, 'not_recipient', 'Only the recipient agent can confirm.');
      if (r.status === 'INSTRUCTED') status = 'CONFIRMED';
      else if (r.status !== 'CONFIRMED') throw new ApiError(409, 'bad_state', `Instruction is ${r.status}.`);
    } else if (ev.t === 'CANCEL') {
      if (!isSender) throw new ApiError(403, 'not_sender', 'Only the sending agent can cancel.');
      if (!['INSTRUCTED', 'CONFIRMED'].includes(r.status)) throw new ApiError(409, 'bad_state', `Instruction is ${r.status} and cannot be cancelled.`);
      status = 'CANCELLED';
      type = 'CANCELLED';
    } else {
      if (!isRecipient) throw new ApiError(403, 'not_recipient', 'Only the recipient agent can report a payout.');
      if (r.status === 'PAID_OUT') {
        return receipt({ t: 'event-receipt', instruction: r.id, status: 'PAID_OUT', at: U.nowIso(), seq: 0, duplicate: true });
      }
      if (ev.codeHash !== r.code_hash) {
        const wrong = r.wrong_codes + 1;
        q.run('UPDATE instructions SET wrong_codes=?, updated=? WHERE id=?', wrong, U.nowIso(), r.id);
        appendLog('WRONG_CODE', r.id, ops, { instruction: r.id, agent: ctx.agent.id, attempts: wrong });
        if (wrong >= 5 && !r.frozen) {
          q.run("UPDATE instructions SET frozen=1, freeze_reason='Too many wrong payout codes' WHERE id=?", r.id);
          appendLog('FROZEN', r.id, ops, { instruction: r.id, reason: 'Too many wrong payout codes' });
        }
        throw new ApiError(422, 'wrong_code', 'The payout code does not match this instruction.');
      }
      const mayPay = ['INSTRUCTED', 'CONFIRMED'].includes(r.status) && !r.frozen;
      status = mayPay ? 'PAID_OUT' : 'DISPUTED';
      type = mayPay ? 'PAID_OUT' : 'PAID_OUT_DISPUTED';
    }
    save();
    q.run('UPDATE instructions SET status=?, updated=? WHERE id=?', status, U.nowIso(), r.id);
    const log = appendLog(type, r.id, ops, { instruction: r.id, event: ev, sig, status, was: r.status, frozen: !!r.frozen });
    return receipt({ t: 'event-receipt', instruction: r.id, status, at: log.ts, seq: log.seq });
  });
}

// ------------------------------------------------------------------ expiry, freezing
function sweepExpiry() {
  const due = q.all("SELECT * FROM instructions WHERE status IN ('INSTRUCTED','CONFIRMED') AND expires < ?", U.nowIso());
  for (const r of due) {
    tx(() => {
      q.run("UPDATE instructions SET status='EXPIRED', updated=? WHERE id=?", U.nowIso(), r.id);
      appendLog('EXPIRED', r.id, [r.sender_op, r.recipient_op], { instruction: r.id, expires: r.expires });
    });
  }
  return due.length;
}

function freezeOpen(kind, id, reason) {
  const where = kind === 'agent' ? '(sender_agent=? OR recipient_agent=?)' : '(sender_op=? OR recipient_op=?)';
  const rows = q.all(`SELECT * FROM instructions WHERE status IN ('INSTRUCTED','CONFIRMED') AND frozen=0 AND ${where}`, id, id);
  for (const r of rows) {
    q.run('UPDATE instructions SET frozen=1, freeze_reason=?, updated=? WHERE id=?', reason, U.nowIso(), r.id);
    appendLog('FROZEN', r.id, [r.sender_op, r.recipient_op], { instruction: r.id, reason });
  }
  return rows.length;
}

function resolveFrozen(instructionId, action, admin, note) {
  const r = q.get('SELECT * FROM instructions WHERE id=?', instructionId);
  if (!r || !r.frozen) throw new ApiError(404, 'not_found', 'No frozen instruction with this id.');
  if (String(note || '').trim().length < 5) throw new ApiError(422, 'note_required', 'A reason is required.');
  tx(() => {
    if (action === 'release') {
      q.run('UPDATE instructions SET frozen=0, freeze_reason=NULL, updated=? WHERE id=?', U.nowIso(), r.id);
      appendLog('UNFROZEN', r.id, [r.sender_op, r.recipient_op], { instruction: r.id, by: admin, note });
    } else if (action === 'expire') {
      q.run("UPDATE instructions SET status='EXPIRED', frozen=0, updated=? WHERE id=?", U.nowIso(), r.id);
      appendLog('EXPIRED', r.id, [r.sender_op, r.recipient_op], { instruction: r.id, by: admin, note, forced: true });
    } else throw new ApiError(422, 'bad_action', 'Action must be release or expire.');
  });
}

// ------------------------------------------------------------------ log export, seals, verification
function relayLogRows(from, limit) { return q.all('SELECT * FROM log WHERE seq >= ? ORDER BY seq LIMIT ?', from || 1, limit || 100000); }
function exportRelayLog() {
  const rk = relayKey();
  const entries = q.all('SELECT * FROM log ORDER BY seq').map((r) => ({
    seq: r.seq, ts: r.ts, type: r.type, ref: r.ref, ops: JSON.parse(r.ops), data: JSON.parse(r.data), prev: r.prev, hash: r.hash, sig: r.sig }));
  const operators = q.all('SELECT id,name,country,sign_pub,enc_pub,sign_kid FROM operators WHERE sign_pub IS NOT NULL')
    .map((o) => ({ id: o.id, name: o.name, country: o.country, signPub: o.sign_pub, encPub: o.enc_pub, signKid: o.sign_kid }));
  return { format: 'trustline-relay-log/1', exportedAt: U.nowIso(), relay: { pub: rk.pub, kid: rk.kid }, operators, entries };
}
function exportOperatorLog(opId) {
  const rk = relayKey();
  const op = q.get('SELECT * FROM operators WHERE id=?', opId);
  const entries = q.all('SELECT * FROM op_log WHERE operator_id=? ORDER BY seq', opId).map((r) => ({
    seq: r.seq, ts: r.ts, type: r.type, ref: r.ref, relaySeq: r.relay_seq, relayHash: r.relay_hash, data: JSON.parse(r.data), prev: r.prev, hash: r.hash }));
  const seals = q.all('SELECT * FROM seals WHERE operator_id=? ORDER BY id', opId).map((s) => ({ seal: JSON.parse(s.seal), sig: s.sig, received: s.received }));
  return { format: 'trustline-operator-log/1', exportedAt: U.nowIso(), relay: { pub: rk.pub, kid: rk.kid },
    operator: { id: op.id, name: op.name, country: op.country, signPub: op.sign_pub, encPub: op.enc_pub }, entries, seals };
}
function unsealedHead(opId) {
  const head = q.get('SELECT seq, hash FROM op_log WHERE operator_id=? ORDER BY seq DESC LIMIT 1', opId);
  const last = q.get('SELECT seq FROM seals WHERE operator_id=? ORDER BY seq DESC LIMIT 1', opId);
  return { head: head || null, sealedSeq: last ? last.seq : 0 };
}
function recordSeal(opId, seal, sig) {
  const op = q.get('SELECT * FROM operators WHERE id=?', opId);
  const head = q.get('SELECT seq, hash FROM op_log WHERE operator_id=? AND seq=?', opId, seal && seal.seq);
  if (!seal || seal.t !== 'log-seal' || seal.operator !== opId || !head || head.hash !== seal.hash)
    throw new ApiError(422, 'bad_seal', 'Seal does not match an entry of your log.');
  if (!N.verifySig(op.sign_pub, canon(seal), sig)) throw new ApiError(422, 'bad_signature', 'Seal signature invalid.');
  tx(() => {
    q.run('INSERT INTO seals(operator_id,seq,hash,seal,sig,received) VALUES(?,?,?,?,?,?)', opId, seal.seq, seal.hash, canon(seal), sig, U.nowIso());
    appendLog('SEAL_RECORDED', opId, [opId], { operator: opId, seq: seal.seq, hash: seal.hash });
  });
}
function verifyRelayChain() {
  const rk = relayKey();
  let prev = ZERO, n = 0;
  for (const r of q.all('SELECT * FROM log ORDER BY seq')) {
    const core = { seq: r.seq, ts: r.ts, type: r.type, ref: r.ref, ops: JSON.parse(r.ops), data: JSON.parse(r.data), prev: r.prev };
    if (r.prev !== prev || N.sha256Hex(canon(core)) !== r.hash || !N.verifySig(rk.pub, r.hash, r.sig)) return { ok: false, brokenAt: r.seq };
    prev = r.hash; n++;
  }
  return { ok: true, entries: n, head: prev };
}

// ------------------------------------------------------------------ views for portal and admin
function operatorView(o) {
  return { id: o.id, name: o.name, country: o.country, licence: o.licence, contact: o.contact, status: o.status, risk: o.risk,
    created: o.created, hasKeys: !!o.sign_pub, signKid: o.sign_kid, encKid: o.enc_kid, keysAt: o.keys_at, statusReason: o.status_reason };
}
function operatorInstructions(opId) {
  return q.all('SELECT * FROM instructions WHERE sender_op=? OR recipient_op=? ORDER BY received DESC LIMIT 300', opId, opId).map((r) => insView(r, 'operator'));
}

/** Called after the first authenticated request: the activation code has done its job. */
function clearActivationCode(agentId) {
  q.run("UPDATE agents SET code=NULL, code_exp=NULL WHERE id=? AND status='ACTIVE'", agentId);
}

module.exports = {
  clearActivationCode, DEFAULT_SETTINGS, DD_ITEMS, SCREENING, getSetting, setSetting, usdMinor, relayKey, appendLog, receipt,
  createOperator, updateDD, ddComplete, propose, decideProposal, acceptInvite, registerOperatorKeys, operatorView,
  agentView, createAgent, updateAgent, enrol, enrolStatus, profile, pendingDevices, certifyDevice, rejectDevice, revokeDevice, revokeAgent,
  connView, requestConnection, decideConnection, setConnectionStatus, activeConnectionFor, deviceByKid, activeCtx, directory,
  submitInstruction, processEvent, inbox, outbox, insView, sweepExpiry, freezeOpen, resolveFrozen,
  exportRelayLog, exportOperatorLog, unsealedHead, recordSeal, verifyRelayChain, operatorInstructions, relayLogRows,
};
