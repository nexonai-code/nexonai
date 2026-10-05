(function () {
  'use strict';
  const { h, $, api, toast, guard, fmtTime, short, statusChip, table, field, modal, download, copy, qrSvg } = TLUI;
  const app = $('#app');
  let me = null, bundle = null, tab = 'home';
  const COUNTRIES = { JO: 'Jordan', YE: 'Yemen', SA: 'Saudi Arabia', AE: 'United Arab Emirates', EG: 'Egypt', LB: 'Lebanon', IQ: 'Iraq', PS: 'Palestine', TR: 'Türkiye', SO: 'Somalia', KE: 'Kenya', ET: 'Ethiopia', SD: 'Sudan', SS: 'South Sudan', DJ: 'Djibouti', ER: 'Eritrea', UG: 'Uganda', TZ: 'Tanzania', NG: 'Nigeria', GH: 'Ghana', SN: 'Senegal', ML: 'Mali', NE: 'Niger', TD: 'Chad', LY: 'Libya', MA: 'Morocco', TN: 'Tunisia', DZ: 'Algeria', DE: 'Germany', GB: 'United Kingdom', NO: 'Norway', RO: 'Romania' };
  TLUI.onAuthLost = () => { me = null; render(); };

  // ------------------------------------------------------------ browser key store (IndexedDB)
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('trustline-operator', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('keys');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function keyGet(id) { const db = await idb(); return new Promise((res, rej) => { const q = db.transaction('keys').objectStore('keys').get(id); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); }); }
  async function keyPut(id, v) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('keys', 'readwrite'); t.objectStore('keys').put(v, id); t.oncomplete = res; t.onerror = () => rej(t.error); }); }

  async function boot() {
    try { me = await api('GET', '/api/op/me'); bundle = await keyGet(me.operator.id); } catch (e) { me = null; }
    render();
  }
  const view = () => $('#view');
  const set = (...n) => view().replaceChildren(...n);

  function render() {
    app.replaceChildren();
    if (!me) return app.append(loginView());
    const o = me.operator;
    const header = (tabs) => h('header', { class: 'top' }, h('div', { class: 'logo' }, 'Trust', h('span', {}, 'Line'), ' operator portal'), tabs || '',
      h('div', { class: 'who' }, h('span', {}, `${o.name} · ${me.username}`), h('button', { class: 'btn secondary small', onclick: async () => { await api('POST', '/api/op/logout', {}); me = null; render(); } }, 'Sign out')));
    if (o.status !== 'ACTIVE') {
      return app.append(header(), h('main', {}, h('div', { class: 'card' }, h('h1', {}, 'Operator ' + o.status.toLowerCase()),
        h('p', {}, o.status === 'SUSPENDED' ? 'TrustLine has suspended your master key. All agents of your network are locked out and open instructions are frozen. Contact TrustLine. Your logs remain available for export.' : 'Your account is not active.'),
        o.statusReason ? h('p', { class: 'muted' }, 'Reason: ' + o.statusReason) : null,
        h('p', {}, h('button', { class: 'btn secondary', onclick: () => guard(exportLog) }, 'Export my log')))));
    }
    if (!o.hasKeys) return app.append(header(), h('main', { id: 'view' })), keySetup();
    if (!bundle || bundle.signKid !== o.signKid) return app.append(header(), h('main', { id: 'view' })), keyImport();
    const tabs = [['home', 'Home'], ['agents', 'Agents'], ['connections', 'Connections'], ['instructions', 'Instructions'], ['log', 'Audit log'], ['keys', 'Keys']];
    app.append(header(h('nav', { class: 'tabs' }, tabs.map(([k, l]) => h('button', { class: tab === k ? 'active' : '', onclick: () => { tab = k; render(); } }, l)))), h('main', { id: 'view' }, h('p', { class: 'muted' }, 'Loading…')));
    const views = { home, agents, connections, instructions, log, keys };
    guard(() => views[tab]());
  }

  // ------------------------------------------------------------ login / activation
  function loginView() {
    let mode = 'login';
    const box = h('div', { class: 'card' });
    const draw = () => {
      const u = h('input', { autocomplete: 'username' }), p = h('input', { type: 'password', autocomplete: mode === 'login' ? 'current-password' : 'new-password' });
      const inv = h('input', { placeholder: 'XXXX-XXXX-XXXX' }), p2 = h('input', { type: 'password' });
      const go = () => guard(async () => {
        if (mode === 'login') await api('POST', '/api/op/login', { username: u.value, password: p.value });
        else {
          if (p.value !== p2.value) throw new Error('The two passwords differ.');
          await api('POST', '/api/op/accept-invite', { username: u.value, invite: inv.value, password: p.value });
          await api('POST', '/api/op/login', { username: u.value, password: p.value });
        }
        await boot();
      });
      p.addEventListener('keydown', (e) => { if (e.key === 'Enter' && mode === 'login') go(); });
      box.replaceChildren(h('h1', {}, 'TrustLine operator portal'),
        h('div', { class: 'split' }, h('button', { class: 'btn small ' + (mode === 'login' ? '' : 'secondary'), onclick: () => { mode = 'login'; draw(); } }, 'Sign in'),
          h('button', { class: 'btn small ' + (mode === 'activate' ? '' : 'secondary'), onclick: () => { mode = 'activate'; draw(); } }, 'Activate account')),
        field('Username', u), mode === 'activate' ? field('Invite code (from TrustLine)', inv) : null, field(mode === 'login' ? 'Password' : 'Choose a password (10+ characters)', p),
        mode === 'activate' ? field('Repeat password', p2) : null, h('p', {}, h('button', { class: 'btn', onclick: go }, mode === 'login' ? 'Sign in' : 'Activate and sign in')));
    };
    draw();
    return h('div', { class: 'center' }, box);
  }

  // ------------------------------------------------------------ master keys live in this browser
  function keySetup() {
    const pass = h('input', { type: 'password' }), pass2 = h('input', { type: 'password' });
    let downloaded = false;
    const gen = h('button', { class: 'btn', onclick: () => guard(async () => {
      if (pass.value.length < 12) throw new Error('Backup passphrase needs at least 12 characters.');
      if (pass.value !== pass2.value) throw new Error('The two passphrases differ.');
      const b = await TL.genBundle();
      const backup = await TL.backupEncrypt(b, pass.value);
      download(`trustline-master-keys-${me.operator.id}.json`, JSON.stringify(backup, null, 1));
      downloaded = true;
      await keyPut(me.operator.id, b);
      await api('POST', '/api/op/keys', { signPub: b.signPub, encPub: b.encPub });
      toast('Master keys created and registered');
      await boot();
    }) }, 'Create master keys and download encrypted backup');
    $('#view').replaceChildren(h('div', { class: 'card', style: 'max-width:680px' }, h('h1', {}, 'Create your master keys'),
      h('p', {}, 'Your master key signs certificates for your agents, approves connections to partner networks and seals your audit log. It is created here, in this browser, and the private part never leaves it. TrustLine only receives the public part.'),
      h('div', { class: 'notice warn' }, 'Losing the key means losing control of your network: nobody, including TrustLine, can recover it. Store the backup file and its passphrase in two different safe places.'),
      field('Backup passphrase (12+ characters)', pass), field('Repeat passphrase', pass2), h('p', {}, gen)));
  }
  function keyImport() {
    const file = h('input', { type: 'file', accept: '.json,application/json' }), pass = h('input', { type: 'password' });
    $('#view').replaceChildren(h('div', { class: 'card', style: 'max-width:680px' }, h('h1', {}, 'Import your master keys'),
      h('p', {}, 'Your keys are registered with TrustLine but are not stored in this browser. Load your encrypted backup file to continue.'),
      field('Backup file', file), field('Backup passphrase', pass),
      h('p', {}, h('button', { class: 'btn', onclick: () => guard(async () => {
        const f = file.files[0]; if (!f) throw new Error('Choose the backup file.');
        const b = await TL.backupDecrypt(JSON.parse(await f.text()), pass.value);
        if (b.signKid !== me.operator.signKid) throw new Error('This backup belongs to different keys.');
        await keyPut(me.operator.id, b); bundle = b; render();
      }) }, 'Import keys'))));
  }
  async function backupKeys() {
    const pass = h('input', { type: 'password' });
    modal('Download encrypted key backup', h('div', {}, field('New passphrase (12+ characters)', pass)), [{ label: 'Download', run: async () => {
      if (pass.value.length < 12) { toast('Passphrase needs at least 12 characters.', 'bad'); return false; }
      download(`trustline-master-keys-${me.operator.id}.json`, JSON.stringify(await TL.backupEncrypt(bundle, pass.value), null, 1));
    } }]);
  }
  const signKey = () => TL.importSignPriv(bundle.signPriv);

  // ------------------------------------------------------------ home
  async function home() {
    const [pend, ag, cons, head] = await Promise.all([api('GET', '/api/op/devices/pending'), api('GET', '/api/op/agents'), api('GET', '/api/op/connections'), api('GET', '/api/op/log/head')]);
    const incoming = cons.connections.filter((c) => c.status === 'REQUESTED' && c.b === me.operator.id);
    const unsealed = head.head ? head.head.seq - head.sealedSeq : 0;
    set(h('h1', {}, me.operator.name),
      h('div', { class: 'grid g3' },
        h('div', { class: 'card' }, h('div', { class: 'stat' }, ag.agents.filter((a) => a.status === 'ACTIVE').length, h('small', {}, 'Active agents'))),
        h('div', { class: 'card' }, h('div', { class: 'stat' }, cons.connections.filter((c) => c.status === 'ACTIVE').length, h('small', {}, 'Active connections'))),
        h('div', { class: 'card' }, h('div', { class: 'stat' }, unsealed, h('small', {}, 'Log entries not yet sealed')))),
      pend.devices.length ? h('div', { class: 'card' }, h('h2', {}, 'Devices waiting for your approval'), devicesTable(pend.devices)) : h('div', { class: 'notice' }, 'No devices are waiting for approval.'),
      incoming.length ? h('div', { class: 'card' }, h('h2', {}, 'Connection requests'), connectionsTable(incoming)) : null,
      unsealed ? h('div', { class: 'card' }, h('h2', {}, 'Seal your audit log'), h('p', { class: 'small muted' }, 'Sealing signs the head of your log with your master key. Auditors can then prove that nothing was changed or removed.'),
        h('button', { class: 'btn', onclick: () => guard(async () => { await seal(); render(); }, 'Log sealed') }, 'Seal now')) : null);
  }

  function devicesTable(devices) {
    return table([{ label: 'Agent', render: (d) => `${d.agentName} (${d.agentId})` }, { label: 'Location', render: (d) => `${d.city} ${d.country}` }, { label: 'Device', key: 'deviceName' },
      { label: 'Key fingerprints', render: (d) => h('span', { class: 'mono' }, d.signKid, h('br'), d.encKid) }, { label: 'Requested', render: (d) => fmtTime(d.created) },
      { label: '', render: (d) => h('span', { class: 'split' }, h('button', { class: 'btn small', onclick: () => approveDevice(d) }, 'Review and approve'), h('button', { class: 'btn danger small', onclick: () => guard(() => api('POST', `/api/op/devices/${d.id}/reject`, {}).then(render), 'Rejected') }, 'Reject')) }], devices);
  }
  function approveDevice(d) {
    modal('Approve device', h('div', {}, h('p', {}, 'You certify this device key with your master key. Only approve it if the agent confirms these fingerprints on the device (Status screen in the app).'),
      h('dl', { class: 'kv' }, h('dt', {}, 'Agent'), h('dd', {}, `${d.agentName} (${d.agentId}), ${d.city} ${d.country}`), h('dt', {}, 'Device'), h('dd', {}, d.deviceName),
        h('dt', {}, 'Signing key'), h('dd', { class: 'mono' }, d.signKid), h('dt', {}, 'Encryption key'), h('dd', { class: 'mono' }, d.encKid))),
    [{ label: 'Certify with master key', run: async () => {
      await guard(async () => {
        const cert = { t: 'agent-cert', v: 1, agent: d.agentId, operator: me.operator.id, name: d.agentName, country: d.country, city: d.city || '', signPub: d.signPub, encPub: d.encPub,
          signKid: d.signKid, encKid: d.encKid, issuedAt: new Date().toISOString(), notAfter: new Date(Date.now() + 365 * 86400000).toISOString() };
        await api('POST', `/api/op/devices/${d.id}/certify`, { cert, sig: await TL.signObject(await signKey(), cert) });
      }, 'Device certified');
      render();
    } }]);
  }
  async function seal() {
    const head = await api('GET', '/api/op/log/head');
    if (!head.head) return;
    const s = { t: 'log-seal', operator: me.operator.id, seq: head.head.seq, hash: head.head.hash, at: new Date().toISOString() };
    await api('POST', '/api/op/log/seal', { seal: s, sig: await TL.signObject(await signKey(), s) });
  }

  // ------------------------------------------------------------ agents
  async function agents() {
    const { agents: list } = await api('GET', '/api/op/agents');
    const pend = await api('GET', '/api/op/devices/pending');
    set(h('div', { class: 'split' }, h('h1', {}, 'Agents'), h('div', { class: 'spacer' }), h('button', { class: 'btn', onclick: () => agentForm() }, 'Add agent')),
      pend.devices.length ? h('div', { class: 'card' }, h('h2', {}, 'Devices waiting for your approval'), devicesTable(pend.devices)) : null,
      h('div', { class: 'card' }, table([
        { label: 'ID', render: (a) => h('span', { class: 'mono' }, a.id) }, { label: 'Name', key: 'name' }, { label: 'Location', render: (a) => `${a.city} ${a.country}` }, { label: 'Status', render: (a) => statusChip(a.status) },
        { label: 'Limits (USD)', render: (a) => `${a.perInstruction} / ${a.perDay} per day` }, { label: 'Offline payout', render: (a) => (a.offlinePayout ? `up to ${a.offlineLimit}, ${a.offlineHours} h` : 'off') },
        { label: 'Device', render: (a) => (a.device ? `${a.device.status} · ${a.device.name || ''}` : 'none') }], list, agentDetail)));
  }
  function agentForm() {
    const f = { name: h('input'), city: h('input'), country: h('input', { maxlength: 2, list: 'cc', placeholder: 'JO' }), phone: h('input'),
      per: h('input', { value: '1000.00' }), day: h('input', { value: '5000.00' }), off: h('input', { type: 'checkbox' }), offl: h('input', { value: '200.00' }), hours: h('input', { type: 'number', value: 24, min: 1, max: 72 }) };
    modal('Add agent', h('div', {}, h('datalist', { id: 'cc' }, Object.entries(COUNTRIES).map(([c, n]) => h('option', { value: c }, n))),
      h('div', { class: 'row' }, field('Agent / shop name', f.name), field('City', f.city)), h('div', { class: 'row' }, field('Country (2 letters)', f.country), field('Phone', f.phone)),
      h('div', { class: 'row' }, field('Limit per instruction (USD)', f.per), field('Limit per 24 hours (USD)', f.day)),
      h('label', { style: 'color:var(--ink)' }, f.off, 'Allow payouts while offline (default off)'), h('div', { class: 'row' }, field('Offline payout limit (USD)', f.offl), field('Offline window (hours)', f.hours)),
      h('p', { class: 'small muted' }, 'You are responsible towards your supervisor for vetting this agent before you add it.')),
    [{ label: 'Create and show activation code', run: async () => {
      const r = await guard(() => api('POST', '/api/op/agents', { name: f.name.value, city: f.city.value, country: f.country.value.toUpperCase(), phone: f.phone.value, perInstruction: f.per.value, perDay: f.day.value, offlinePayout: f.off.checked, offlineLimit: f.offl.value, offlineHours: Number(f.hours.value) }));
      if (!r) return false;
      activationCard(r.agent); render();
    } }]);
  }
  function activationCard(a) {
    const payload = `trustline://enroll?code=${encodeURIComponent(a.code)}&relay=${encodeURIComponent(location.origin)}`;
    modal('Activation code for ' + a.name, h('div', {}, h('div', { style: 'display:flex;gap:20px;flex-wrap:wrap;align-items:center' }, qrSvg(payload, 240),
      h('div', {}, h('div', { class: 'small muted' }, 'Activation code'), h('div', { class: 'codebig' }, a.code), h('div', { class: 'small muted', style: 'margin-top:8px' }, 'Relay address'), h('div', { class: 'mono' }, location.origin))),
      h('ol', { class: 'small' }, h('li', {}, 'Open the TrustLine app on the agent\'s phone and scan this QR code (or type the code).'), h('li', {}, 'The device appears under "Devices waiting for your approval". Check the fingerprints with the agent and approve.'), h('li', {}, `The code is valid until ${fmtTime(a.codeExp)} and works once.`))),
    [{ label: 'Print', kind: 'secondary', close: false, run: () => { window.print(); return false; } }]);
  }
  function agentDetail(a) {
    const reason = h('input', { placeholder: 'Reason (required)' });
    const f = { per: h('input', { value: a.perInstruction }), day: h('input', { value: a.perDay }), off: h('input', { type: 'checkbox', checked: a.offlinePayout }), offl: h('input', { value: a.offlineLimit }), hours: h('input', { type: 'number', value: a.offlineHours, min: 1, max: 72 }) };
    modal(`${a.name} (${a.id})`, h('div', {}, h('dl', { class: 'kv' }, h('dt', {}, 'Location'), h('dd', {}, `${a.city} ${a.country} ${a.phone}`), h('dt', {}, 'Status'), h('dd', {}, statusChip(a.status)),
      h('dt', {}, 'Device'), h('dd', {}, a.device ? `${a.device.status} ${a.device.name || ''} ${a.device.signKid}` : 'none'), a.code ? h('dt', {}, 'Activation code') : null, a.code ? h('dd', { class: 'codebig' }, a.code) : null),
      h('h3', {}, 'Limits'), h('div', { class: 'row' }, field('Per instruction (USD)', f.per), field('Per 24 hours (USD)', f.day)),
      h('label', { style: 'color:var(--ink)' }, f.off, 'Allow payouts while offline'), h('div', { class: 'row' }, field('Offline payout limit (USD)', f.offl), field('Offline window (hours)', f.hours)),
      h('h3', {}, 'Revocation'), field('Reason', reason),
      h('p', { class: 'small muted' }, 'Level 1 revokes the device key (phone lost): the agent can enrol a new device with a new code. Level 2 revokes the agent entirely. Open instructions of the agent are frozen in both cases.')),
    [{ label: 'Save limits', run: async () => { const ok = await guard(() => api('PUT', '/api/op/agents/' + a.id, { perInstruction: f.per.value, perDay: f.day.value, offlinePayout: f.off.checked, offlineLimit: f.offl.value, offlineHours: Number(f.hours.value) }), 'Saved'); if (ok === undefined) return false; render(); } },
      a.code ? { label: 'Show activation QR', kind: 'secondary', close: false, run: () => { activationCard(a); return false; } } : null,
      a.device && a.device.status === 'ACTIVE' ? { label: 'Revoke device key (level 1)', kind: 'danger', run: async () => { const ok = await guard(() => api('POST', `/api/op/agents/${a.id}/revoke-device`, { reason: reason.value }), 'Device revoked'); if (ok === undefined) return false; render(); } } : null,
      a.status !== 'REVOKED' ? { label: 'Revoke agent (level 2)', kind: 'danger', run: async () => { const ok = await guard(() => api('POST', `/api/op/agents/${a.id}/revoke`, { reason: reason.value }), 'Agent revoked'); if (ok === undefined) return false; render(); } } : null].filter(Boolean));
  }

  // ------------------------------------------------------------ connections
  function connectionsTable(rows) {
    const mine = me.operator.id;
    return table([{ label: 'Partner', render: (c) => (c.a === mine ? c.bName : c.aName) }, { label: 'Corridors', render: (c) => c.corridors.join(', ') }, { label: 'Status', render: (c) => statusChip(c.status) },
      { label: 'Direction', render: (c) => (c.a === mine ? 'requested by you' : 'requested by partner') },
      { label: '', render: (c) => h('span', { class: 'split' },
        c.status === 'REQUESTED' && c.b === mine ? [h('button', { class: 'btn small', onclick: () => decideConnection(c, true) }, 'Approve'), h('button', { class: 'btn danger small', onclick: () => decideConnection(c, false) }, 'Reject')] : null,
        c.status === 'ACTIVE' ? h('button', { class: 'btn secondary small', onclick: () => guard(() => api('POST', `/api/op/connections/${c.id}/status`, { status: 'SUSPENDED', reason: 'Suspended by operator' }).then(render), 'Suspended') }, 'Suspend') : null,
        c.status === 'SUSPENDED' ? h('button', { class: 'btn secondary small', onclick: () => guard(() => api('POST', `/api/op/connections/${c.id}/status`, { status: 'ACTIVE', reason: 'Resumed by operator' }).then(render), 'Resumed') }, 'Resume') : null) }], rows);
  }
  async function decideConnection(c, approve) {
    await guard(async () => {
      if (!approve) return api('POST', `/api/op/connections/${c.id}/decide`, { approve: false }).then(render);
      const counter = { t: 'connection-approval', connection: c.id, operator: me.operator.id, of: await TL.sha256Hex(TL.canon(c.record)), at: new Date().toISOString() };
      await api('POST', `/api/op/connections/${c.id}/decide`, { approve: true, record: counter, sig: await TL.signObject(await signKey(), counter) });
      render();
    }, approve ? 'Connection approved' : 'Rejected');
  }
  async function connections() {
    const [{ connections: cons }, { operators: ops }] = await Promise.all([api('GET', '/api/op/connections'), api('GET', '/api/op/operators')]);
    const sel = h('select', {}, ops.map((o) => h('option', { value: o.id }, `${o.name} (${o.country})`)));
    const cor = h('input', { placeholder: 'e.g. JO>YE, YE>JO' });
    set(h('h1', {}, 'Connections to partner networks'), h('div', { class: 'card' }, connectionsTable(cons)),
      h('div', { class: 'card' }, h('h2', {}, 'Request a new connection'),
        h('p', { class: 'small muted' }, 'A connection lets your agents send to the partner\'s agents in the listed corridors (from country > to country). The partner approves with its master key. The commercial agreement (fees, liability, settlement) stays outside TrustLine; by signing you confirm that a written agreement exists.'),
        ops.length ? h('div', { class: 'row' }, field('Partner operator', sel), field('Corridors', cor), h('div', {}, h('button', { class: 'btn', onclick: () => guard(async () => {
          const corridors = [...new Set(cor.value.split(/[ ,;]+/).map((x) => x.trim().toUpperCase()).filter(Boolean))].sort();
          if (!corridors.length || corridors.some((c) => !/^[A-Z]{2}>[A-Z]{2}$/.test(c))) throw new Error('Corridors look like JO>YE.');
          const record = { t: 'connection', id: 'CN-' + TL.hex(TL.rand(5)).toUpperCase(), a: me.operator.id, b: sel.value, corridors, at: new Date().toISOString() };
          await api('POST', '/api/op/connections', { to: sel.value, corridors, record, sig: await TL.signObject(await signKey(), record) });
          render();
        }, 'Request sent') }, 'Sign and send request'))) : h('p', { class: 'muted' }, 'No other active operators are registered yet.')));
  }

  // ------------------------------------------------------------ instructions
  async function verifyInstruction(it) {
    const out = [];
    const ins = it.instruction;
    out.push(['Instruction number and fields', true, '']);
    out.push(['Channel B package matches its fingerprint', (await TL.pkgHash(it.package)) === ins.pkgHash, '']);
    let certOk = false, sigOk = false;
    if (it.senderCert) {
      certOk = await TL.verifyObject(it.senderOperator.signPub, it.senderCert, it.senderCertSig) && it.senderCert.agent === ins.sender.agent;
      sigOk = certOk && await TL.verifyObject(it.senderCert.signPub, ins, it.sig);
    }
    out.push(['Agent certificate signed by the sending operator\'s master key', certOk, it.senderOperator.name]);
    out.push(['Instruction signed by the certified agent key', sigOk, '']);
    return out;
  }
  async function instructions() {
    const { instructions: rows } = await api('GET', '/api/op/instructions');
    set(h('h1', {}, 'Instructions'), h('div', { class: 'card' }, table([
      { label: 'Received', render: (r) => fmtTime(r.received) }, { label: 'ID', render: (r) => h('span', { class: 'mono' }, short(r.id, 13)) },
      { label: 'Direction', render: (r) => (r.senderOperator.id === me.operator.id ? 'sent' : 'received') }, { label: 'Sender', render: (r) => r.senderAgent.name }, { label: 'Recipient', render: (r) => r.recipientAgent.name },
      { label: 'Amount', render: (r) => `${r.instruction.amount.value} ${r.instruction.amount.currency}` }, { label: 'Status', render: (r) => h('span', {}, statusChip(r.status), r.frozen ? h('span', { class: 'chip bad' }, 'frozen') : null) }], rows, showInstruction)),
      h('p', { class: 'small muted' }, 'Customer data (Channel B) is decrypted here, in your browser, with your encryption key. TrustLine cannot read it.'));
  }
  async function showInstruction(it) {
    const body = h('div', {}, h('p', { class: 'muted' }, 'Decrypting…'));
    modal('Instruction ' + short(it.id, 13), body);
    try {
      const [plain, checks] = await Promise.all([TL.decryptPackage(it.package, bundle.encKid, bundle.encPriv), verifyInstruction(it)]);
      body.replaceChildren(
        h('dl', { class: 'kv' }, h('dt', {}, 'Status'), h('dd', {}, statusChip(it.status), it.frozen ? ' frozen: ' + it.freezeReason : ''), h('dt', {}, 'Amount'), h('dd', {}, `${it.instruction.amount.value} ${it.instruction.amount.currency} → payout ${it.instruction.payout.value} ${it.instruction.payout.currency}`),
          h('dt', {}, 'Corridor'), h('dd', {}, `${it.instruction.corridor.from} → ${it.instruction.corridor.to}`), h('dt', {}, 'Purpose / reference'), h('dd', {}, `${it.instruction.purpose} / ${it.instruction.reference}`),
          h('dt', {}, 'Sender agent'), h('dd', {}, `${it.senderAgent.name}, ${it.senderAgent.city} (${it.senderOperator.name})`), h('dt', {}, 'Recipient agent'), h('dd', {}, `${it.recipientAgent.name}, ${it.recipientAgent.city} (${it.recipientOperator.name})`),
          h('dt', {}, 'Sanctions screening'), h('dd', {}, `${it.instruction.screening.ref} · ${fmtTime(it.instruction.screening.at)}`)),
        h('h3', {}, 'Channel B (decrypted in your browser)'),
        h('dl', { class: 'kv' }, h('dt', {}, 'Originator'), h('dd', {}, plain.originator.name), h('dt', {}, 'Address'), h('dd', {}, plain.originator.address), h('dt', {}, 'ID'), h('dd', {}, `${plain.originator.idType} ${plain.originator.idNumber}`),
          h('dt', {}, 'Date of birth'), h('dd', {}, plain.originator.dob), h('dt', {}, 'Customer reference'), h('dd', {}, plain.originator.customerRef), h('dt', {}, 'Beneficiary'), h('dd', {}, plain.beneficiary.name), h('dt', {}, 'Payout location'), h('dd', {}, plain.beneficiary.payoutLocation)),
        h('h3', {}, 'Verification'), h('ul', {}, checks.map(([l, ok, x]) => h('li', {}, h('span', { class: 'chip ' + (ok ? 'ok' : 'bad') }, ok ? 'OK' : 'FAILED'), ' ', l, x ? ' (' + x + ')' : ''))));
    } catch (e) { body.replaceChildren(h('div', { class: 'notice bad' }, 'Could not decrypt: ' + e.message)); }
  }

  // ------------------------------------------------------------ audit log
  async function exportLog() { download(`trustline-log-${me.operator.id}.json`, JSON.stringify(await api('GET', '/api/op/log/export'), null, 1)); }
  async function log() {
    const exp = await api('GET', '/api/op/log/export');
    let prev = '0'.repeat(64), ok = true, brokenAt = 0;
    for (const e of exp.entries) {
      const core = { seq: e.seq, ts: e.ts, type: e.type, ref: e.ref, relaySeq: e.relaySeq, relayHash: e.relayHash, data: e.data, prev: e.prev };
      if (e.prev !== prev || (await TL.sha256Hex(TL.canon(core))) !== e.hash) { ok = false; brokenAt = e.seq; break; }
      prev = e.hash;
    }
    let sealsOk = 0, sealsBad = 0;
    for (const s of exp.seals) {
      const at = exp.entries.find((e) => e.seq === s.seal.seq);
      if (at && at.hash === s.seal.hash && await TL.verifyObject(exp.operator.signPub, s.seal, s.sig)) sealsOk++; else sealsBad++;
    }
    const lastSeal = exp.seals.length ? Math.max(...exp.seals.map((s) => s.seal.seq)) : 0;
    set(h('div', { class: 'split' }, h('h1', {}, 'Audit log'), h('div', { class: 'spacer' }),
      h('button', { class: 'btn secondary', onclick: () => guard(async () => { await seal(); render(); }, 'Log sealed') }, 'Seal now'), h('button', { class: 'btn', onclick: () => guard(exportLog) }, 'Export for auditor')),
      h('div', { class: 'notice ' + (ok ? 'ok' : 'bad') }, ok ? `Hash chain verified in your browser: ${exp.entries.length} entries.` : `Hash chain broken at entry #${brokenAt}.`),
      h('div', { class: 'notice ' + (sealsBad ? 'bad' : 'ok') }, `Seals: ${sealsOk} valid, ${sealsBad} invalid. Entries after #${lastSeal} are not sealed yet (${exp.entries.length - lastSeal}).`),
      h('div', { class: 'card' }, table([{ label: '#', key: 'seq' }, { label: 'Time', render: (e) => fmtTime(e.ts) }, { label: 'Type', key: 'type' }, { label: 'Reference', render: (e) => h('span', { class: 'mono' }, short(e.ref, 16)) }, { label: 'Hash', render: (e) => h('span', { class: 'mono' }, short(e.hash, 12)) }],
        exp.entries.slice().reverse(), (e) => modal('Entry #' + e.seq, h('pre', { class: 'mono', style: 'white-space:pre-wrap' }, JSON.stringify(e, null, 2))))));
  }

  // ------------------------------------------------------------ keys
  function keys() {
    set(h('h1', {}, 'Master keys'), h('div', { class: 'card' }, h('dl', { class: 'kv' },
      h('dt', {}, 'Signing key'), h('dd', { class: 'mono' }, bundle.signKid), h('dt', {}, 'Encryption key'), h('dd', { class: 'mono' }, bundle.encKid), h('dt', {}, 'Registered'), h('dd', {}, fmtTime(me.operator.keysAt)),
      h('dt', {}, 'Relay fingerprint'), h('dd', { class: 'mono' }, 'see start page'), h('dt', {}, 'Operator ID'), h('dd', { class: 'mono' }, me.operator.id)),
      h('p', {}, h('button', { class: 'btn secondary', onclick: backupKeys }, 'Download encrypted backup')),
      h('p', { class: 'small muted' }, 'The private keys exist only in this browser and in your backup. TrustLine holds the public keys only and cannot sign for you.')));
  }

  boot();
})();
