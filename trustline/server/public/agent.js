/* TrustLine web agent: the agent app for a Windows PC (or any computer) in a browser.
 * Same protocol as the Android app: ECDSA-signed requests, signed instructions, end-to-end encrypted Channel B. */
(function () {
  'use strict';
  const { h, $, toast, guard, fmtTime, short, statusChip, table, field, modal, copy } = TLUI;
  const app = $('#app');
  let st = null;               // persisted state { code, bundle, profile, codes: {instructionId: payoutCode}, speak }
  let signKey = null, offsetMs = 0, tab = 'send', meInfo = null, direct = [];

  // ------------------------------------------------------------ storage
  function idb() { return new Promise((res, rej) => { const r = indexedDB.open('trustline-agent', 1); r.onupgradeneeded = () => r.result.createObjectStore('s'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  async function load() { const db = await idb(); return new Promise((res, rej) => { const q = db.transaction('s').objectStore('s').get('state'); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); }); }
  async function save() { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('s', 'readwrite'); t.objectStore('s').put(st, 'state'); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
  async function wipe() { const db = await idb(); return new Promise((res) => { const t = db.transaction('s', 'readwrite'); t.objectStore('s').delete('state'); t.oncomplete = res; }); }

  // ------------------------------------------------------------ signed API calls
  async function call(method, path, body) {
    const raw = body === undefined ? '' : JSON.stringify(body);
    const ts = new Date(Date.now() + offsetMs).toISOString();
    const sig = await TL.signBytes(signKey, `${method}\n${path}\n${ts}\n${await TL.sha256Hex(raw)}`);
    const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json', 'X-Agent': st.profile.agentId, 'X-Key': st.bundle.signKid, 'X-Ts': ts, 'X-Sig': sig }, body: body === undefined ? undefined : raw });
    const st0 = res.headers.get('X-Server-Time');
    if (st0) offsetMs = new Date(st0).getTime() - Date.now();
    let json = {};
    try { json = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok) {
      const err = new Error(json.reasons ? json.reasons.map((r) => r.text).join(' ') : (json.message || 'Request failed'));
      err.status = res.status; err.code = json.error; err.body = json;
      if (['device_revoked', 'agent_revoked', 'operator_suspended'].includes(json.error)) { locked = json; render(); }
      throw err;
    }
    return json;
  }
  let locked = null;
  const say = (text) => { if (st && st.speak && 'speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(text); speechSynthesis.cancel(); speechSynthesis.speak(u); } };

  async function boot() {
    st = await load();
    if (st && st.profile) { signKey = await TL.importSignPriv(st.bundle.signPriv); try { meInfo = await call('GET', '/api/agent/me'); } catch (e) { if (!locked) toast(e.message, 'bad'); } }
    render();
  }

  // ------------------------------------------------------------ views
  function render() {
    app.replaceChildren();
    if (!st) return app.append(setupView());
    if (!st.profile) return app.append(waitView());
    if (locked) return app.append(lockedView());
    const tabs = [['send', 'Send'], ['inbox', 'Incoming'], ['activity', 'Sent'], ['status', 'Status']];
    app.append(h('header', { class: 'top' }, h('div', { class: 'logo' }, 'Trust', h('span', {}, 'Line'), ' agent'),
      h('nav', { class: 'tabs' }, tabs.map(([k, l]) => h('button', { class: tab === k ? 'active' : '', onclick: () => { tab = k; render(); } }, l))),
      h('div', { class: 'who' }, h('span', {}, `${st.profile.agent.name} · ${st.profile.operator.name}`))), h('main', { id: 'view' }, h('p', { class: 'muted' }, 'Loading…')));
    const views = { send, inbox, activity, status };
    guard(() => views[tab]());
  }
  const set = (...n) => $('#view').replaceChildren(...n);

  function setupView() {
    const code = h('input', { placeholder: 'XXXX-XXXX', style: 'font-size:22px;letter-spacing:2px;text-transform:uppercase' }), name = h('input', { value: navigator.platform || 'Browser' });
    const q = new URLSearchParams(location.search); if (q.get('code')) code.value = q.get('code');
    return h('div', { class: 'center' }, h('div', { class: 'card' }, h('h1', {}, 'TrustLine agent'),
      h('p', {}, 'Enter the activation code your network operator gave you. This browser becomes your agent device; its keys never leave it.'),
      field('Activation code', code), field('Device name', name),
      h('p', {}, h('button', { class: 'btn', onclick: () => guard(async () => {
        const bundle = await TL.genBundle();
        const res = await fetch('/api/agent/enroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code.value, signPub: bundle.signPub, encPub: bundle.encPub, deviceName: name.value }) });
        const j = await res.json(); if (!res.ok) throw new Error(j.message || 'Enrolment failed');
        st = { code: code.value, bundle, profile: null, codes: {}, speak: false }; await save(); render();
      }) }, 'Enrol this device'))));
  }
  function waitView() {
    const out = h('div', { class: 'notice' }, 'Waiting for your operator to approve this device…');
    const poll = async () => {
      if (!st || st.profile) return;
      try {
        const r = await fetch('/api/agent/enroll/status?code=' + encodeURIComponent(st.code)).then((x) => x.json());
        if (r.status === 'certified') { st.profile = { agentId: r.agentId, agent: r.agent, operator: r.operator, limits: r.limits, cert: r.cert, certSig: r.certSig, relay: r.relay }; await save(); await boot(); return; }
        if (r.status === 'rejected' || r.status === 'revoked') { out.className = 'notice bad'; out.textContent = 'The operator rejected this device.'; return; }
      } catch (e) { /* retry */ }
      setTimeout(poll, 3000);
    };
    poll();
    return h('div', { class: 'center' }, h('div', { class: 'card' }, h('h1', {}, 'Waiting for approval'), out,
      h('p', { class: 'small muted' }, 'Tell your operator these fingerprints so they can check them before approving:'), h('p', { class: 'mono' }, st.bundle.signKid, h('br'), st.bundle.encKid),
      h('button', { class: 'btn danger small', onclick: async () => { await wipe(); st = null; render(); } }, 'Cancel and start over')));
  }
  function lockedView() {
    const msg = { device_revoked: 'This device key has been revoked by your operator.', agent_revoked: 'This agent has been revoked.', operator_suspended: 'Your network operator is suspended by TrustLine.' }[locked.error] || 'Access denied.';
    return h('div', { class: 'center' }, h('div', { class: 'card' }, h('h1', {}, 'Locked'), h('div', { class: 'notice bad' }, msg), h('p', {}, 'Contact your operator. Instructions already stored remain unchanged on the relay.'),
      h('button', { class: 'btn danger', onclick: async () => { await wipe(); location.reload(); } }, 'Remove this device')));
  }

  // ------------------------------------------------------------ send
  async function send() {
    meInfo = meInfo || await call('GET', '/api/agent/me');
    const { recipients } = await call('GET', '/api/agent/directory');
    direct = recipients;
    if (!recipients.length) return set(h('h1', {}, 'Send'), h('div', { class: 'notice warn' }, 'No partner agents are reachable yet. Your operator must connect to a partner network for your corridor.'));
    const f = {
      to: h('select', {}, recipients.map((r, i) => h('option', { value: i }, `${r.agent.name}, ${r.agent.city} ${r.agent.country} (${r.operator.name})`))),
      amount: h('input', { value: '100.00', inputmode: 'decimal' }), cur: h('select', {}, meInfo.settings.currencies.map((c) => h('option', { value: c }, c))),
      purpose: h('select', {}, meInfo.settings.purposes.map((p) => h('option', { value: p.code }, `${p.code} · ${p.label}`))), ref: h('input', { value: '' }),
      sName: h('input'), sAddr: h('input'), sIdType: h('select', {}, ['passport', 'national ID', 'residence permit', 'driving licence'].map((x) => h('option', {}, x))), sId: h('input'), sDob: h('input', { type: 'date' }), sRef: h('input'),
      bName: h('input'), scr: h('input', { placeholder: 'Screening reference from the operator system' }),
    };
    const out = h('div', {});
    set(h('h1', {}, 'Send an instruction'), h('div', { class: 'card' },
      h('div', { class: 'row' }, field('Recipient agent', f.to)), h('div', { class: 'row' }, field('Amount', f.amount), field('Currency', f.cur), field('Purpose code', f.purpose)), h('div', { class: 'row' }, field('Your reference', f.ref)),
      h('h3', {}, 'Sender (Channel B, encrypted end to end)'), h('div', { class: 'row' }, field('Full name', f.sName), field('Address', f.sAddr)), h('div', { class: 'row' }, field('ID type', f.sIdType), field('ID number', f.sId), field('Date of birth', f.sDob), field('Customer reference', f.sRef)),
      h('h3', {}, 'Beneficiary'), h('div', { class: 'row' }, field('Full name (as on ID)', f.bName)),
      h('h3', {}, 'Sanctions screening'), h('div', { class: 'row' }, field('Reference of the operator\'s screening of sender and beneficiary', f.scr)),
      h('p', {}, h('button', { class: 'btn', onclick: () => guard(async () => {
        const need = [f.sName, f.sAddr, f.sId, f.sDob, f.bName, f.scr, f.ref];
        if (need.some((x) => !x.value.trim())) throw new Error('Please fill in all fields.');
        if (!/^\d{1,12}(\.\d{1,2})?$/.test(f.amount.value)) throw new Error('Amount must look like 250.00.');
        const rec = recipients[Number(f.to.value)];
        const r = await submit({ rec, amount: f.amount.value, currency: f.cur.value, purpose: f.purpose.value, reference: f.ref.value.trim(), screeningRef: f.scr.value.trim(),
          originator: { name: f.sName.value.trim(), address: f.sAddr.value.trim(), idType: f.sIdType.value, idNumber: f.sId.value.trim(), dob: f.sDob.value, customerRef: f.sRef.value.trim() || '-' }, beneficiary: { name: f.bName.value.trim(), payoutLocation: rec.agent.city || rec.agent.name } });
        showCode(r);
      }) }, 'Sign and send'))), out);
  }
  async function submit(o) {
    const id = TL.uuid(), code = TL.generateCode(), now = new Date(Date.now() + offsetMs).toISOString();
    const recips = [{ keyId: meInfo.operator.encKid, encPub: meInfo.operator.encPub }, { keyId: o.rec.operator.encKid, encPub: o.rec.operator.encPub }, { keyId: o.rec.device.encKid, encPub: o.rec.device.encPub }];
    const pkg = await TL.encryptPackage({ instruction: id, originator: o.originator, beneficiary: o.beneficiary }, id, recips);
    const ins = { v: '1', id, createdAt: now, expiresAt: new Date(Date.now() + offsetMs + 7 * 86400000).toISOString(), amount: { value: o.amount, currency: o.currency }, payout: { value: o.amount, currency: o.currency },
      corridor: { from: meInfo.agent.country, to: o.rec.agent.country }, reference: o.reference, purpose: o.purpose, codeHash: await TL.codeHash(id, code), pkgHash: await TL.pkgHash(pkg),
      screening: { done: true, ref: o.screeningRef, at: now }, sender: { agent: meInfo.agent.id, operator: meInfo.operator.id }, recipient: { agent: o.rec.agent.id, operator: o.rec.operator.id } };
    const sig = await TL.signObject(signKey, ins);
    const r = await call('POST', '/api/agent/instructions', { instruction: ins, sig, package: pkg });
    st.codes[id] = code; await save();       // shown only after the relay's receipt
    return { id, code, receipt: r.receipt, ins };
  }
  function showCode(r) {
    say('Instruction accepted. The payout code is ' + r.code.split('').join(' '));
    modal('Instruction accepted', h('div', {}, h('div', { class: 'notice ok' }, `Relay receipt #${r.receipt.seq}: the instruction is now "Instructed".`),
      h('p', {}, 'Give this one-time payout code to the sender. The sender passes it to the beneficiary outside TrustLine.'), h('div', { class: 'codebig', style: 'margin:14px 0' }, TL.formatCode(r.code)),
      h('p', { class: 'small muted' }, `${r.ins.amount.value} ${r.ins.amount.currency} to ${direct.find((d) => d.agent.id === r.ins.recipient.agent)?.agent.name || r.ins.recipient.agent}`)),
    [{ label: 'Copy code', kind: 'secondary', close: false, run: () => { copy(TL.formatCode(r.code)); return false; } }]);
  }

  // ------------------------------------------------------------ incoming
  async function checkSender(it) {
    if (!it.senderCert) return false;
    return (await TL.verifyObject(it.senderOperator.signPub, it.senderCert, it.senderCertSig)) && it.senderCert.agent === it.instruction.sender.agent && (await TL.verifyObject(it.senderCert.signPub, it.instruction, it.sig)) && (await TL.pkgHash(it.package)) === it.instruction.pkgHash;
  }
  async function inbox() {
    const { items } = await call('GET', '/api/agent/inbox');
    set(h('div', { class: 'split' }, h('h1', {}, 'Incoming instructions'), h('div', { class: 'spacer' }), h('button', { class: 'btn secondary', onclick: () => render() }, 'Refresh')),
      h('div', { class: 'card' }, table([{ label: 'Received', render: (r) => fmtTime(r.received) }, { label: 'From', render: (r) => `${r.senderAgent.name} (${r.senderOperator.name})` },
        { label: 'Amount', render: (r) => `${r.instruction.amount.value} ${r.instruction.amount.currency}` }, { label: 'Status', render: (r) => h('span', {}, statusChip(r.status), r.frozen ? h('span', { class: 'chip bad' }, 'frozen') : null) }], items, openIncoming)));
  }
  async function openIncoming(it) {
    const body = h('div', {}, h('p', { class: 'muted' }, 'Checking and decrypting…'));
    const close = modal('Incoming instruction', body);
    try {
      const verified = await checkSender(it);
      const plain = await TL.decryptPackage(it.package, st.bundle.encKid, st.bundle.encPriv);
      if (it.status === 'INSTRUCTED' && !it.frozen && verified) { try { await event('CONFIRM', it.id); it.status = 'CONFIRMED'; } catch (e) { /* shown below */ } }
      const code = h('input', { placeholder: 'XXXX-XXXX-XXXX', style: 'font-size:22px;letter-spacing:2px;text-transform:uppercase' });
      const canPay = ['INSTRUCTED', 'CONFIRMED'].includes(it.status) && !it.frozen && verified;
      const pay = async () => {
        if ((await TL.codeHash(it.id, code.value)) !== it.instruction.codeHash) { toast('The code does not match this instruction.', 'bad'); say('Wrong code'); return; }
        const ev = await guard(() => event('PAID_OUT', it.id, { codeHash: it.instruction.codeHash }), 'Payout recorded');
        if (ev) { say('Pay out ' + it.instruction.payout.value + ' ' + it.instruction.payout.currency + ' to ' + plain.beneficiary.name); close(); render(); }
      };
      body.replaceChildren(
        verified ? h('div', { class: 'notice ok' }, 'Signature chain verified: certified agent of ' + it.senderOperator.name + '.') : h('div', { class: 'notice bad' }, 'Signature check FAILED. Do not pay out.'),
        it.frozen ? h('div', { class: 'notice bad' }, 'FROZEN: ' + it.freezeReason + '. Do not pay out.') : null,
        h('dl', { class: 'kv' }, h('dt', {}, 'Status'), h('dd', {}, statusChip(it.status)), h('dt', {}, 'Pay out'), h('dd', {}, h('strong', {}, `${it.instruction.payout.value} ${it.instruction.payout.currency}`)),
          h('dt', {}, 'Beneficiary'), h('dd', {}, h('strong', {}, plain.beneficiary.name), ' (compare with the ID shown by the customer)'), h('dt', {}, 'Sender'), h('dd', {}, `${plain.originator.name}, ${plain.originator.address}`),
          h('dt', {}, 'Purpose / reference'), h('dd', {}, `${it.instruction.purpose} / ${it.instruction.reference}`), h('dt', {}, 'From'), h('dd', {}, `${it.senderAgent.name} (${it.senderOperator.name})`)),
        canPay ? h('div', {}, field('Payout code from the customer', code), h('p', {}, h('button', { class: 'btn', onclick: pay }, 'Code matches and ID checked: pay out'))) : null);
    } catch (e) { body.replaceChildren(h('div', { class: 'notice bad' }, e.message)); }
  }
  async function event(t, instruction, extra) {
    const ev = { t, instruction, agent: st.profile.agentId, at: new Date(Date.now() + offsetMs).toISOString(), nonce: TL.uuid(), ...(extra || {}) };
    const sig = await TL.signObject(signKey, ev);
    return (await call('POST', '/api/agent/events', { event: ev, sig })).receipt;
  }

  // ------------------------------------------------------------ sent / status
  async function activity() {
    const { items } = await call('GET', '/api/agent/outbox');
    set(h('div', { class: 'split' }, h('h1', {}, 'Sent instructions'), h('div', { class: 'spacer' }), h('button', { class: 'btn secondary', onclick: () => render() }, 'Refresh')),
      h('div', { class: 'card' }, table([{ label: 'Sent', render: (r) => fmtTime(r.received) }, { label: 'To', render: (r) => `${r.recipientAgent.name} (${r.recipientOperator.name})` },
        { label: 'Amount', render: (r) => `${r.instruction.amount.value} ${r.instruction.amount.currency}` }, { label: 'Status', render: (r) => h('span', {}, statusChip(r.status), r.frozen ? h('span', { class: 'chip bad' }, 'frozen') : null) },
        { label: 'Payout code', render: (r) => (st.codes[r.id] && ['INSTRUCTED', 'CONFIRMED'].includes(r.status) ? h('span', { class: 'mono' }, TL.formatCode(st.codes[r.id])) : '') },
        { label: '', render: (r) => (['INSTRUCTED', 'CONFIRMED'].includes(r.status) ? h('button', { class: 'btn danger small', onclick: (e) => { e.stopPropagation(); guard(async () => { await event('CANCEL', r.id); render(); }, 'Cancelled'); } }, 'Cancel') : '') }], items)));
  }
  function status() {
    set(h('h1', {}, 'Status'), h('div', { class: 'card' }, h('dl', { class: 'kv' },
      h('dt', {}, 'Agent'), h('dd', {}, `${st.profile.agent.name}, ${st.profile.agent.city} ${st.profile.agent.country} (${st.profile.agentId})`), h('dt', {}, 'Network operator'), h('dd', {}, `${st.profile.operator.name} (${st.profile.operator.id})`),
      h('dt', {}, 'Operator key'), h('dd', { class: 'mono' }, st.profile.operator.signKid), h('dt', {}, 'Device signing key'), h('dd', { class: 'mono' }, st.bundle.signKid), h('dt', {}, 'Device encryption key'), h('dd', { class: 'mono' }, st.bundle.encKid),
      h('dt', {}, 'Relay'), h('dd', { class: 'mono' }, st.profile.relay.kid), h('dt', {}, 'Limits (USD)'), h('dd', {}, `${meInfo.limits.perInstruction} per instruction, ${meInfo.limits.perDay} per day`),
      h('dt', {}, 'Offline'), h('dd', {}, 'This web agent works online only. The Android app supports offline operation.')),
      h('p', {}, h('label', { style: 'color:var(--ink)' }, h('input', { type: 'checkbox', checked: st.speak, onchange: async (e) => { st.speak = e.target.checked; await save(); say('Voice prompts on'); } }), 'Voice prompts')),
      h('p', {}, h('button', { class: 'btn danger small', onclick: async () => { if (confirm('Remove this device? You will need a new activation code.')) { await wipe(); location.href = '/agent.html'; } } }, 'Remove this device'))));
  }

  boot();
})();
