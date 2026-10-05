(function () {
  'use strict';
  const { h, $, api, toast, guard, fmtTime, short, statusChip, table, field, modal, download, copy } = TLUI;
  const app = $('#app');
  let me = null;
  let tab = 'overview';
  let opDetail = null;
  TLUI.onAuthLost = () => { me = null; render(); };

  async function boot() { try { me = await api('GET', '/api/admin/me'); } catch (e) { me = null; } render(); }

  function render() {
    app.replaceChildren();
    if (!me) return app.append(loginView());
    const tabs = [['overview', 'Overview'], ['operators', 'Operators'], ['proposals', 'Approvals'], ['instructions', 'Instructions'], ['log', 'Relay log'], ['settings', 'Rules & limits'], ['account', 'Account']];
    app.append(
      h('header', { class: 'top' }, h('div', { class: 'logo' }, 'Trust', h('span', {}, 'Line'), ' admin'),
        h('nav', { class: 'tabs' }, tabs.map(([k, l]) => h('button', { class: tab === k ? 'active' : '', onclick: () => { tab = k; opDetail = null; render(); } }, l))),
        h('div', { class: 'who' }, h('span', {}, me.admin), h('button', { class: 'btn secondary small', onclick: async () => { await api('POST', '/api/admin/logout', {}); me = null; render(); } }, 'Sign out'))),
      h('main', { id: 'view' }, h('p', { class: 'muted' }, 'Loading…')));
    const views = { overview, operators, proposals, instructions, log, settings, account };
    guard(() => (opDetail && tab === 'operators' ? operatorView(opDetail) : views[tab]()));
  }
  const view = () => $('#view');
  const set = (...n) => view().replaceChildren(...n);

  function loginView() {
    const u = h('input', { autocomplete: 'username' }), p = h('input', { type: 'password', autocomplete: 'current-password' });
    const go = () => guard(async () => { await api('POST', '/api/admin/login', { username: u.value, password: p.value }); await boot(); });
    p.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    return h('div', { class: 'center' }, h('div', { class: 'card' }, h('h1', {}, 'TrustLine admin console'),
      field('Username', u), field('Password', p), h('p', {}, h('button', { class: 'btn', onclick: go }, 'Sign in')),
      h('p', { class: 'small muted' }, 'The first start of the relay created two administrator accounts (four-eyes principle). Their passwords are in data/ADMIN-CREDENTIALS.txt.')));
  }

  async function overview() {
    const o = await api('GET', '/api/admin/overview');
    const count = (arr) => arr.length ? arr.map((x) => `${x.n} ${x.status.toLowerCase()}`).join(', ') : 'none';
    set(h('h1', {}, 'Overview'),
      h('div', { class: 'grid g3' },
        h('div', { class: 'card' }, h('div', { class: 'stat' }, o.operators.reduce((a, x) => a + x.n, 0), h('small', {}, 'Network operators')), h('div', { class: 'small muted' }, count(o.operators))),
        h('div', { class: 'card' }, h('div', { class: 'stat' }, o.agents.reduce((a, x) => a + x.n, 0), h('small', {}, 'Agents')), h('div', { class: 'small muted' }, count(o.agents))),
        h('div', { class: 'card' }, h('div', { class: 'stat' }, o.instructions.reduce((a, x) => a + x.n, 0), h('small', {}, 'Instructions')), h('div', { class: 'small muted' }, count(o.instructions))),
        h('div', { class: 'card' }, h('div', { class: 'stat' }, o.frozen, h('small', {}, 'Frozen instructions'))),
        h('div', { class: 'card' }, h('div', { class: 'stat' }, o.openProposals, h('small', {}, 'Open approvals (four-eyes)'))),
        h('div', { class: 'card' }, h('div', { class: 'stat' }, o.logEntries, h('small', {}, 'Relay log entries')))),
      h('div', { class: 'card' }, h('h2', {}, 'Relay'), h('dl', { class: 'kv' }, h('dt', {}, 'Name'), h('dd', {}, me.relay.name), h('dt', {}, 'Key fingerprint'), h('dd', { class: 'mono' }, me.relay.kid))));
  }

  // ------------------------------------------------------------ operators
  async function operators() {
    const { operators: ops } = await api('GET', '/api/admin/operators');
    set(h('div', { class: 'split' }, h('h1', {}, 'Network operators'), h('div', { class: 'spacer' }), h('button', { class: 'btn', onclick: newOperator }, 'New application')),
      h('div', { class: 'card' }, table([
        { label: 'ID', render: (o) => h('span', { class: 'mono' }, o.id) }, { label: 'Name', key: 'name' }, { label: 'Country', key: 'country' },
        { label: 'Status', render: (o) => statusChip(o.status) }, { label: 'Risk', key: 'risk' },
        { label: 'Due diligence', render: (o) => (o.dd.complete ? h('span', { class: 'chip ok' }, 'complete') : h('span', { class: 'chip warn' }, `${o.dd.missing.length} items open`)) },
        { label: 'Keys', render: (o) => (o.hasKeys ? h('span', { class: 'mono' }, o.signKid) : h('span', { class: 'muted' }, 'not yet')) },
      ], ops, (o) => { opDetail = o.id; render(); })));
  }

  function newOperator() {
    const f = { name: h('input'), country: h('input', { maxlength: 2, placeholder: 'JO' }), licence: h('input', { placeholder: 'Licence reference' }), contact: h('input'), user: h('input', { placeholder: 'e.g. alnoor' }) };
    modal('New operator application', h('div', {},
      field('Legal name', f.name), h('div', { class: 'row' }, field('Country (2 letters)', f.country), field('Licence reference', f.licence)),
      field('Contact (e-mail / phone)', f.contact), field('Portal username for the operator administrator', f.user),
      h('p', { class: 'small muted' }, 'The invite code is generated when two administrators have approved the admission.')),
    [{ label: 'Create application', run: async () => { const r = await guard(() => api('POST', '/api/admin/operators', { name: f.name.value, country: f.country.value, licence: f.licence.value, contact: f.contact.value, adminUser: f.user.value }), 'Application created'); if (!r) return false; opDetail = r.id; render(); } }]);
  }

  async function operatorView(id) {
    const d = await api('GET', '/api/admin/operators/' + id);
    const o = d.operator;
    const rows = me.ddItems.map((it) => {
      const s = d.dd.items[it.id];
      const cb = (k) => h('input', { type: 'checkbox', checked: s[k], disabled: o.status !== 'APPLICATION', 'data-i': it.id, 'data-k': k });
      return h('tr', {}, h('td', {}, it.label), h('td', {}, cb('received')), h('td', {}, cb('verified')), h('td', {}, cb('na')),
        h('td', {}, h('input', { value: s.note, 'data-i': it.id, 'data-k': 'note', disabled: o.status !== 'APPLICATION' })));
    });
    const risk = h('select', { disabled: o.status !== 'APPLICATION' }, ['low', 'medium', 'high'].map((r) => h('option', { value: r, selected: r === o.risk }, r)));
    const scr = me.screening.map((s) => h('label', { style: 'display:inline-block;margin-right:16px;color:var(--ink)' },
      h('input', { type: 'checkbox', checked: d.dd.screening[s], disabled: o.status !== 'APPLICATION', 'data-s': s }), { owners: 'Owners screened', management: 'Management screened', agents: 'Agents screened', adverseMedia: 'Adverse media researched' }[s]));
    const collect = () => {
      const items = {};
      for (const it of me.ddItems) {
        const q = (k) => $(`[data-i="${it.id}"][data-k="${k}"]`);
        items[it.id] = { received: q('received').checked, verified: q('verified').checked, na: q('na').checked, note: q('note').value };
      }
      const screening = {};
      for (const s of me.screening) screening[s] = $(`[data-s="${s}"]`).checked;
      return { items, screening, risk: risk.value };
    };
    const note = h('input', { placeholder: 'Reason (required for suspend / reinstate)' });
    const open = d.proposals.filter((p) => p.status === 'OPEN');
    set(
      h('div', { class: 'split' }, h('button', { class: 'btn secondary small', onclick: () => { opDetail = null; render(); } }, '← All operators'), h('h1', { style: 'margin:0' }, o.name), statusChip(o.status)),
      h('div', { class: 'card' }, h('dl', { class: 'kv' },
        h('dt', {}, 'Operator ID'), h('dd', { class: 'mono' }, o.id), h('dt', {}, 'Country / licence'), h('dd', {}, `${o.country} · ${o.licence}`), h('dt', {}, 'Contact'), h('dd', {}, o.contact || '—'),
        h('dt', {}, 'Master keys'), h('dd', {}, o.hasKeys ? h('span', {}, 'registered ', h('span', { class: 'mono' }, o.signKid + ' / ' + o.encKid)) : 'not yet registered by the operator'),
        h('dt', {}, 'Status reason'), h('dd', {}, o.statusReason || '—'))),
      h('div', { class: 'card' }, h('h2', {}, 'Due diligence'),
        h('p', { class: 'small muted' }, 'Every document group must be received and verified (or marked not applicable) and all screenings done before the admission can be proposed. The admission needs a second administrator (four-eyes).'),
        h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Document group', 'Received', 'Verified', 'N/A', 'Note'].map((x) => h('th', {}, x)))), h('tbody', {}, rows))),
        h('h3', {}, 'Screening by TrustLine'), h('div', {}, scr),
        h('div', { class: 'row', style: 'margin-top:10px' }, field('Risk rating', risk),
          h('div', {}, o.status === 'APPLICATION' ? h('button', { class: 'btn', onclick: () => guard(() => api('PUT', `/api/admin/operators/${id}/dd`, collect()).then(render), 'Saved') }, 'Save due diligence') : h('span', { class: 'muted' }, 'Locked after admission.'))),
        d.ddStatus.complete ? h('div', { class: 'notice ok' }, 'Due diligence is complete.') : h('div', { class: 'notice warn' }, `Open: ${d.ddStatus.missing.length} document group(s), ${d.ddStatus.unscreened.length} screening(s).`)),
      h('div', { class: 'card' }, h('h2', {}, 'Decisions (four-eyes)'),
        open.length ? table([{ label: 'Proposal', render: (p) => `${p.kind} by ${p.proposer}` }, { label: 'Note', key: 'note' }, { label: 'Opened', render: (p) => fmtTime(p.created) },
          { label: '', render: (p) => (p.proposer === me.admin ? h('span', { class: 'muted small' }, 'waiting for another administrator') : h('span', { class: 'split' },
            h('button', { class: 'btn small', onclick: () => decide(p.id, true) }, 'Approve'), h('button', { class: 'btn danger small', onclick: () => decide(p.id, false) }, 'Reject'))) }], open) : h('p', { class: 'muted' }, 'No open proposals.'),
        h('div', { class: 'row' }, field('Reason / note', note),
          h('div', { class: 'split' },
            o.status === 'APPLICATION' ? h('button', { class: 'btn', onclick: () => guard(() => api('POST', `/api/admin/operators/${id}/propose`, { kind: 'admit', note: note.value }).then(render), 'Admission proposed') }, 'Propose admission') : null,
            o.status === 'ACTIVE' ? h('button', { class: 'btn danger', onclick: () => guard(() => api('POST', `/api/admin/operators/${id}/propose`, { kind: 'suspend', note: note.value }).then(render), 'Suspension proposed') }, 'Propose suspension (level 3)') : null,
            o.status === 'SUSPENDED' ? h('button', { class: 'btn', onclick: () => guard(() => api('POST', `/api/admin/operators/${id}/propose`, { kind: 'reinstate', note: note.value }).then(render), 'Reinstatement proposed') }, 'Propose reinstatement') : null)),
        h('p', { class: 'small muted' }, 'Suspending an operator revokes its master key for all purposes: the relay rejects every message from its agents immediately, open instructions are frozen and the connections are suspended.')),
      h('div', { class: 'card' }, h('h2', {}, 'Agents of this operator'),
        table([{ label: 'ID', render: (a) => h('span', { class: 'mono' }, a.id) }, { label: 'Name', key: 'name' }, { label: 'Location', render: (a) => `${a.city} ${a.country}` }, { label: 'Status', render: (a) => statusChip(a.status) },
          { label: 'Device', render: (a) => (a.device ? `${a.device.status} ${a.device.name}` : '—') }], d.agents)));
  }

  async function decide(id, approve) {
    const r = await guard(() => api('POST', `/api/admin/proposals/${id}/decide`, { approve }), approve ? 'Approved' : 'Rejected');
    if (r && r.invite) {
      modal('Operator admitted', h('div', {}, h('p', {}, 'Give these credentials to the operator administrator. The invite code is shown only once and is valid for 7 days.'),
        h('dl', { class: 'kv' }, h('dt', {}, 'Portal address'), h('dd', {}, location.origin + '/operator.html'), h('dt', {}, 'Username'), h('dd', { class: 'mono' }, r.username), h('dt', {}, 'Invite code'), h('dd', { class: 'codebig' }, r.invite))),
      [{ label: 'Copy invite code', kind: 'secondary', close: false, run: () => { copy(r.invite); return false; } }]);
    }
    render();
  }

  async function proposals() {
    const { proposals: ps } = await api('GET', '/api/admin/proposals');
    set(h('h1', {}, 'Approvals (four-eyes)'), h('div', { class: 'card' }, table([
      { label: '#', key: 'id' }, { label: 'Operator', key: 'operator_name' }, { label: 'Kind', key: 'kind' }, { label: 'Note', key: 'note' }, { label: 'Proposed by', key: 'proposer' },
      { label: 'Status', render: (p) => statusChip(p.status) }, { label: 'Decided by', render: (p) => p.approver || '' },
      { label: '', render: (p) => (p.status === 'OPEN' && p.proposer !== me.admin ? h('span', { class: 'split' }, h('button', { class: 'btn small', onclick: () => decide(p.id, true) }, 'Approve'), h('button', { class: 'btn danger small', onclick: () => decide(p.id, false) }, 'Reject')) : '') },
    ], ps)));
  }

  // ------------------------------------------------------------ instructions
  async function instructions() {
    const sel = h('select', {}, ['', 'INSTRUCTED', 'CONFIRMED', 'PAID_OUT', 'CANCELLED', 'EXPIRED', 'DISPUTED'].map((s) => h('option', { value: s }, s || 'all statuses')));
    const holder = h('div', { class: 'card' });
    const load = async () => {
      const { instructions: rows } = await api('GET', '/api/admin/instructions' + (sel.value ? '?status=' + sel.value : ''));
      holder.replaceChildren(table([
        { label: 'Received', render: (r) => fmtTime(r.received) }, { label: 'Instruction', render: (r) => h('span', { class: 'mono' }, short(r.id, 13)) },
        { label: 'From', render: (r) => `${r.senderAgent.name} (${r.senderOperator.name})` }, { label: 'To', render: (r) => `${r.recipientAgent.name} (${r.recipientOperator.name})` },
        { label: 'Amount', render: (r) => `${r.instruction.amount.value} ${r.instruction.amount.currency}` }, { label: 'Status', render: (r) => h('span', {}, statusChip(r.status), r.frozen ? h('span', { class: 'chip bad' }, 'frozen') : null) },
      ], rows, (r) => showInstruction(r, load)));
    };
    sel.addEventListener('change', load);
    set(h('div', { class: 'split' }, h('h1', {}, 'Instructions'), h('div', { class: 'spacer' }), sel), holder,
      h('p', { class: 'small muted' }, 'The relay sees only Channel A (the instruction without names). Channel B (customer data) is encrypted for the operators and agents involved and cannot be read here.'));
    await load();
  }

  function showInstruction(r, reload) {
    const note = h('input', { placeholder: 'Reason (required)' });
    modal('Instruction ' + short(r.id, 13), h('div', {},
      h('dl', { class: 'kv' }, h('dt', {}, 'Status'), h('dd', {}, statusChip(r.status), r.frozen ? ' frozen: ' + r.freezeReason : ''), h('dt', {}, 'Corridor'), h('dd', {}, `${r.instruction.corridor.from} → ${r.instruction.corridor.to}`),
        h('dt', {}, 'Amount / payout'), h('dd', {}, `${r.instruction.amount.value} ${r.instruction.amount.currency} / ${r.instruction.payout.value} ${r.instruction.payout.currency}`),
        h('dt', {}, 'Purpose / reference'), h('dd', {}, `${r.instruction.purpose} / ${r.instruction.reference}`), h('dt', {}, 'Sanctions screening'), h('dd', {}, `${r.instruction.screening.ref} at ${fmtTime(r.instruction.screening.at)}`),
        h('dt', {}, 'Created / expires'), h('dd', {}, `${fmtTime(r.instruction.createdAt)} / ${fmtTime(r.expires)}`), h('dt', {}, 'Relay receipt'), h('dd', { class: 'mono' }, `log #${r.receipt.seq}`)),
      r.frozen ? h('div', {}, h('h3', {}, 'Resolve frozen instruction'), field('Reason', note)) : null),
    r.frozen ? [
      { label: 'Release', run: async () => { const ok = await guard(() => api('POST', `/api/admin/instructions/${r.id}/resolve`, { action: 'release', note: note.value }), 'Released'); if (ok) reload(); else return false; } },
      { label: 'Expire instruction', kind: 'danger', run: async () => { const ok = await guard(() => api('POST', `/api/admin/instructions/${r.id}/resolve`, { action: 'expire', note: note.value }), 'Expired'); if (ok) reload(); else return false; } }] : []);
  }

  // ------------------------------------------------------------ log
  async function log() {
    const holder = h('div', { class: 'card' });
    const out = h('div', {});
    let from = 1;
    async function loadMore(reset) {
      if (reset) { from = 1; holder.replaceChildren(); }
      const { entries } = await api('GET', `/api/admin/log?from=${from}&limit=100`);
      if (entries.length) from = entries[entries.length - 1].seq + 1;
      const t = table([{ label: '#', key: 'seq' }, { label: 'Time', render: (e) => fmtTime(e.ts) }, { label: 'Type', key: 'type' }, { label: 'Reference', render: (e) => h('span', { class: 'mono' }, short(e.ref, 16)) },
        { label: 'Operators', render: (e) => e.ops.join(', ') }, { label: 'Hash', render: (e) => h('span', { class: 'mono' }, short(e.hash, 12)) }], entries, (e) => modal('Log entry #' + e.seq, h('pre', { class: 'mono', style: 'white-space:pre-wrap' }, JSON.stringify(e, null, 2))));
      holder.append(t);
      if (entries.length === 100) holder.append(h('p', {}, h('button', { class: 'btn secondary', onclick: () => guard(() => loadMore(false)) }, 'Load more')));
    }
    set(h('div', { class: 'split' }, h('h1', {}, 'Relay log'), h('div', { class: 'spacer' }),
      h('button', { class: 'btn secondary', onclick: () => guard(async () => { const v = await api('GET', '/api/admin/log/verify'); out.replaceChildren(h('div', { class: 'notice ' + (v.ok ? 'ok' : 'bad') }, v.ok ? `Chain intact: ${v.entries} entries, head ${v.head}` : `Chain broken at entry #${v.brokenAt}`)); }) }, 'Verify chain'),
      h('button', { class: 'btn', onclick: () => guard(async () => download('trustline-relay-log.json', JSON.stringify(await api('GET', '/api/admin/log/export'), null, 1))) }, 'Export for auditor')),
    out, holder);
    await loadMore(true);
  }

  // ------------------------------------------------------------ settings
  async function settings() {
    const s = await api('GET', '/api/admin/settings');
    const fx = h('textarea', { rows: 8 }, Object.entries(s.fx).map(([k, v]) => `${k} ${v / 1e6}`).join('\n'));
    const cap1 = h('input', { value: (s.caps.perInstructionUsd / 100).toFixed(2) }), cap2 = h('input', { value: (s.caps.perDayUsd / 100).toFixed(2) });
    const bc = h('input', { value: s.blocked.countries.join(', ') }), bp = h('input', { value: s.blocked.pairs.join(', ') }), bcur = h('input', { value: s.blocked.currencies.join(', ') });
    const pur = h('textarea', { rows: 9 }, s.purposes.map((p) => `${p.code} ${p.label}`).join('\n'));
    const hours = h('input', { type: 'number', min: 1, max: 72, value: s.offlineDefaultHours });
    const list = (v) => v.split(/[ ,;]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
    const usdMinor = (v) => Math.round(parseFloat(v) * 100);
    set(h('h1', {}, 'Rules & limits'),
      h('div', { class: 'card' }, h('h2', {}, 'Mandatory checks: block list'), h('p', { class: 'small muted' }, 'The relay rejects every instruction touching these countries, corridors or currencies.'),
        h('div', { class: 'row' }, field('Blocked countries (XX, ...)', bc), field('Blocked corridors (XX>YY, ...)', bp), field('Blocked currencies (XXX, ...)', bcur)),
        h('p', {}, h('button', { class: 'btn', onclick: () => guard(() => api('PUT', '/api/admin/settings', { blocked: { countries: list(bc.value), pairs: list(bp.value), currencies: list(bcur.value) } }), 'Saved') }, 'Save block list'))),
      h('div', { class: 'card' }, h('h2', {}, 'TrustLine limit caps (USD)'), h('p', { class: 'small muted' }, 'Operators set limits per agent; TrustLine caps them from above.'),
        h('div', { class: 'row' }, field('Maximum per instruction', cap1), field('Maximum per agent per 24 hours', cap2)),
        h('p', {}, h('button', { class: 'btn', onclick: () => guard(() => api('PUT', '/api/admin/settings', { caps: { perInstructionUsd: usdMinor(cap1.value), perDayUsd: usdMinor(cap2.value) } }), 'Saved') }, 'Save caps'))),
      h('div', { class: 'card' }, h('h2', {}, 'Currencies and demo exchange rates'), h('p', { class: 'small muted' }, 'One line per currency: code and value in USD. Used only to apply the USD limits. Replace the demo rates before real use.'),
        fx, h('p', {}, h('button', { class: 'btn', onclick: () => guard(() => {
          const out = {};
          for (const line of fx.value.split('\n')) { const [c, v] = line.trim().split(/\s+/); if (c) out[c.toUpperCase()] = Math.round(parseFloat(v) * 1e6); }
          return api('PUT', '/api/admin/settings', { fx: out });
        }, 'Saved') }, 'Save rates'))),
      h('div', { class: 'card' }, h('h2', {}, 'Purpose codes'), h('p', { class: 'small muted' }, 'Demo list. Replace with the official ISO 20022 external purpose codes once confirmed by counsel. One line per code: four capital letters, then the label.'),
        pur, h('p', {}, h('button', { class: 'btn', onclick: () => guard(() => api('PUT', '/api/admin/settings', { purposes: pur.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => ({ code: l.slice(0, 4), label: l.slice(5).trim() })) }), 'Saved') }, 'Save purposes'))),
      h('div', { class: 'card' }, h('h2', {}, 'Offline window'), h('p', { class: 'small muted' }, 'Default number of hours an agent device may work without a connection (each agent can be set lower or higher by its operator, 1 to 72).'),
        h('div', { class: 'row' }, field('Hours', hours)), h('p', {}, h('button', { class: 'btn', onclick: () => guard(() => api('PUT', '/api/admin/settings', { offlineDefaultHours: Number(hours.value) }), 'Saved') }, 'Save'))));
  }

  function account() {
    const o = h('input', { type: 'password' }), n = h('input', { type: 'password' });
    set(h('h1', {}, 'Account'), h('div', { class: 'card', style: 'max-width:460px' }, field('Current password', o), field('New password (10+ characters)', n),
      h('p', {}, h('button', { class: 'btn', onclick: () => guard(() => api('POST', '/api/admin/password', { old: o.value, next: n.value }).then(() => { o.value = ''; n.value = ''; }), 'Password changed') }, 'Change password'))));
  }

  boot();
})();
