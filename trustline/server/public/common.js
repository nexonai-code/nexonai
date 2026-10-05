/* Shared helpers for the TrustLine web pages (admin console, operator portal, web agent). */
(function (root) {
  'use strict';
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat(Infinity)) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  const $ = (sel, r) => (r || document).querySelector(sel);

  async function api(method, path, body) {
    const res = await fetch(path, {
      method, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'tl' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = {};
    try { json = await res.json(); } catch (e) { /* not json */ }
    if (!res.ok) {
      const err = new Error(json.message || ('Request failed (' + res.status + ')'));
      err.status = res.status; err.code = json.error; err.body = json;
      if (res.status === 401 && json.error === 'login_required' && root.TLUI.onAuthLost) root.TLUI.onAuthLost();
      throw err;
    }
    return json;
  }

  function toast(msg, kind) {
    let box = $('#toasts');
    if (!box) { box = h('div', { id: 'toasts' }); document.body.append(box); }
    const t = h('div', { class: 'toast' + (kind === 'bad' ? ' bad' : '') }, msg);
    box.append(t);
    setTimeout(() => t.remove(), kind === 'bad' ? 7000 : 3500);
  }
  const fail = (e) => toast(e && e.message ? e.message : String(e), 'bad');
  async function guard(fn, okMsg) {
    try { const r = await fn(); if (okMsg) toast(okMsg); return r; } catch (e) { fail(e); return undefined; }
  }

  const fmtTime = (iso) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString(); };
  const short = (s, n) => (s && s.length > (n || 8) ? s.slice(0, n || 8) + '…' : s || '');
  async function copy(text) { try { await navigator.clipboard.writeText(text); toast('Copied'); } catch (e) { toast('Copy failed', 'bad'); } }
  function download(name, text, type) {
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: type || 'application/json' })), download: name });
    document.body.append(a); a.click(); a.remove();
  }
  const statusChip = (st) => {
    const ok = ['ACTIVE', 'PAID_OUT', 'CONFIRMED', 'APPROVED', 'INSTRUCTED'].includes(st);
    const bad = ['REVOKED', 'SUSPENDED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'DISPUTED', 'device_revoked'].includes(st);
    return h('span', { class: 'chip ' + (bad ? 'bad' : ok ? 'ok' : 'warn') }, st);
  };
  function table(cols, rows, onClick) {
    return h('div', { class: 'tablewrap' }, h('table', {},
      h('thead', {}, h('tr', {}, cols.map((c) => h('th', {}, c.label)))),
      h('tbody', {}, rows.length ? rows.map((r) => h('tr', { class: onClick ? 'click' : '', onclick: onClick ? () => onClick(r) : null },
        cols.map((c) => h('td', {}, c.render ? c.render(r) : r[c.key])))) : h('tr', {}, h('td', { colspan: cols.length, class: 'muted' }, 'Nothing here yet.')))));
  }
  function field(label, input) { return h('div', {}, h('label', {}, label), input); }
  function qrSvg(text, size) {
    const qr = root.qrcode(0, 'M');
    qr.addData(text); qr.make();
    const n = qr.getModuleCount(), cell = Math.max(2, Math.floor((size || 220) / (n + 8)));
    const svg = qr.createSvgTag({ cellSize: cell, margin: cell * 4, scalable: true });
    const box = h('div', { class: 'qrbox' });
    box.innerHTML = svg; // SVG produced by the bundled library from our own text
    return box;
  }
  function modal(title, bodyEl, buttons) {
    const back = h('div', { style: 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:40;padding:16px' });
    const close = () => back.remove();
    const box = h('div', { class: 'card', style: 'max-width:760px;width:100%;max-height:90vh;overflow:auto;margin:0' },
      h('div', { class: 'split' }, h('h2', {}, title), h('div', { class: 'spacer' }), h('button', { class: 'btn secondary small', onclick: close }, 'Close')),
      bodyEl, h('div', { class: 'split', style: 'margin-top:14px' }, (buttons || []).map((b) => h('button', { class: 'btn ' + (b.kind || ''), onclick: async () => { if (await b.run(close) !== false && b.close !== false) close(); } }, b.label))));
    back.append(box); document.body.append(back);
    return close;
  }
  root.TLUI = { h, $, api, toast, fail, guard, fmtTime, short, copy, download, statusChip, table, field, qrSvg, modal };
})(window);
