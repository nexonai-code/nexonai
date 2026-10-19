(function () {
  'use strict';
  var I = window.I18N;
  var lang = localStorage.getItem('ctl-lang') || (String(navigator.language).toLowerCase().indexOf('ro') === 0 ? 'ro' : 'en');
  var token = sessionStorage.getItem('ctl-token');
  var state = null, data = null, tab = 'servers', refreshTimer = null, modal = null;
  var $root = document.getElementById('root'), $modal = document.getElementById('modal'), $mb = document.getElementById('modal-body');

  function t(k, p) {
    var s = (I[lang] && I[lang][k]) || I.en[k] || k;
    if (p) Object.keys(p).forEach(function (x) { s = s.split('{' + x + '}').join(String(p[x])); });
    return s;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtDate(ms) { return ms ? new Date(ms).toISOString().slice(0, 10) : '–'; }

  function api(method, path, body) {
    var h = { 'x-unpruuf-control': '1' };
    if (token) h['x-control-token'] = token;
    var opt = { method: method, headers: h };
    if (body !== undefined) { h['content-type'] = 'application/json'; opt.body = JSON.stringify(body); }
    return fetch(path, opt).then(function (r) {
      return r.text().then(function (txt) {
        var j = null; try { j = JSON.parse(txt); } catch (e) { /* text */ }
        if (r.status === 401 && token) { token = null; sessionStorage.removeItem('ctl-token'); boot(); }
        return { ok: r.ok, status: r.status, json: j, text: txt };
      });
    }).catch(function (e) { return { ok: false, status: 0, json: { error: 'network', message: String(e) }, text: '' }; });
  }

  function download(path, name) {
    var h = { 'x-control-token': token };
    fetch(path, { headers: h }).then(function (r) {
      if (!r.ok) return r.text().then(function (x) { var m = ''; try { m = JSON.parse(x).error; } catch (e) { m = x; } alert(errText(m)); });
      return r.blob().then(function (b) {
        var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      });
    });
  }

  function errText(code) {
    if (!code) return t('e.unknown');
    var s = String(code), i = s.indexOf(':'), head = i > 0 ? s.slice(0, i) : s, tail = i > 0 ? s.slice(i + 1) : '';
    var k = 'e.' + head;
    var base = I.en[k] ? t(k) : s;
    if (head === 'preflight') return base + ' ' + tail.split(',').map(function (c) { return t('pf.' + c); }).join(' ');
    if (head === 'invalid') return base + ' (' + tail + ')';
    return tail && I.en[k] ? base + ' (' + tail + ')' : base;
  }

  // ───────── boot / login ─────────
  function boot() {
    stopRefresh();
    api('GET', '/api/state').then(function (r) {
      state = r.json;
      if (!state) return $root.innerHTML = '<div class="center card">' + t('e.network') + '</div>';
      if (!state.vaultExists) return renderSetup();
      if (!state.unlocked || !token) return renderUnlock();
      loadOverview().then(function () { renderMain(); startRefresh(); });
    });
  }

  function loadOverview() {
    return api('GET', '/api/overview').then(function (r) { if (r.ok) data = r.json; });
  }

  function langSwitch() {
    return '<select id="lang" aria-label="language">' + ['en', 'ro'].map(function (l) { return '<option value="' + l + '"' + (l === lang ? ' selected' : '') + '>' + l.toUpperCase() + '</option>'; }).join('') + '</select>';
  }

  function renderSetup() {
    $root.innerHTML = '<div class="center card"><div class="row"><div class="brand"><b>un</b>pruuf Control</div><div class="spacer"></div>' + langSwitch() + '</div>' +
      '<h1>' + t('setup.title') + '</h1><p class="lead">' + t('setup.lead') + '</p>' +
      '<label>' + t('setup.company') + '</label><input id="s-company" autocomplete="organization">' +
      '<label>' + t('setup.pass') + '</label><input id="s-pass" type="password" autocomplete="new-password">' +
      '<label>' + t('setup.pass2') + '</label><input id="s-pass2" type="password" autocomplete="new-password">' +
      '<p class="small muted">' + t('setup.warn') + '</p><div id="s-err" class="err"></div>' +
      '<button class="btn primary" data-act="create">' + t('setup.create') + '</button></div>';
  }
  function renderUnlock() {
    $root.innerHTML = '<div class="center card"><div class="row"><div class="brand"><b>un</b>pruuf Control</div><div class="spacer"></div>' + langSwitch() + '</div>' +
      '<h1>' + t('unlock.title') + '</h1><label>' + t('setup.pass') + '</label><input id="u-pass" type="password" autocomplete="current-password" autofocus>' +
      '<div id="u-err" class="err"></div><button class="btn primary" data-act="vault-unlock">' + t('unlock.go') + '</button></div>';
  }

  // ───────── main frame ─────────
  var TABS = ['servers', 'licenses', 'distribution', 'settings'];
  function renderMain() {
    var body = tab === 'servers' ? viewServers() : tab === 'licenses' ? viewLicenses() : tab === 'distribution' ? viewDistribution() : viewSettings();
    $root.innerHTML = '<header class="top"><div class="brand"><b>un</b>pruuf Control</div><div class="company">' + esc(data.company) + '</div><div class="spacer"></div>' + langSwitch() +
      '<button class="btn small" data-act="lock">' + t('lock') + '</button></header>' +
      '<nav class="tabs">' + TABS.map(function (x) { return '<button data-tab="' + x + '" class="' + (x === tab ? 'on' : '') + '">' + t('tab.' + x) + '</button>'; }).join('') + '</nav>' +
      '<main>' + body + '</main>';
  }
  function rerender() { if (data) renderMain(); }

  function startRefresh() { stopRefresh(); refreshTimer = setInterval(function () { if (token && !modal && tab === 'servers') refreshStatus(); }, 60000); }
  function stopRefresh() { if (refreshTimer) clearInterval(refreshTimer); refreshTimer = null; }
  function refreshStatus(id) {
    var b = document.querySelector('[data-act="refresh"]'); if (b) { b.disabled = true; b.textContent = t('servers.checking'); }
    return api('POST', '/api/servers/status', id ? { id: id } : {}).then(function () { return loadOverview(); }).then(function () { if (!modal) rerender(); });
  }

  // ───────── servers view ─────────
  function warnText(w) {
    var s = data.servers.filter(function (x) { return x.id === w.serverId; })[0];
    var p = {}; Object.keys(w.params || {}).forEach(function (k) { p[k] = w.params[k]; });
    p.name = s ? s.name : '';
    var txt = t('w.' + w.code, p);
    return (s ? '<b>' + esc(s.name) + ':</b> ' : '') + esc(txt);
  }
  function statusPill(s) {
    if (!s.installedAt) return '<span class="pill mute">' + t('st.notinstalled') + '</span>';
    var st = s.status;
    if (!st) return '<span class="pill mute">' + t('st.unknown') + '</span>';
    if (!st.reachable || st.level === 'down') return '<span class="pill bad">' + t('st.down') + '</span>';
    if (st.level === 'locked') return '<span class="pill bad">' + t('st.locked') + '</span>';
    if (st.level === 'ok') return '<span class="pill ok">' + t('st.ok') + '</span>';
    return '<span class="pill warn">' + t('st.warn') + '</span>';
  }
  function viewServers() {
    var w = data.warnings;
    var html = '<div class="row"><div><h1>' + t('servers.title') + '</h1><p class="lead">' + t('servers.lead') + '</p></div><div class="spacer"></div>' +
      '<button class="btn" data-act="refresh">' + t('servers.refresh') + '</button> <button class="btn" data-act="unlock-all">' + t('servers.unlockall') + '</button> <button class="btn primary" data-act="add-server">' + t('servers.add') + '</button></div>';
    if (!data.bundle) html += '<div class="card err">' + t('servers.nobundle') + '</div>';
    if (w.length) html += '<ul class="warnings">' + w.map(function (x) { return '<li class="' + x.level + '">' + warnText(x) + '</li>'; }).join('') + '</ul>';
    else if (data.servers.length) html += '<p class="okmsg">' + t('servers.allgood') + '</p>';
    if (!data.servers.length) return html + '<div class="card"><p>' + t('servers.empty') + '</p></div>';
    html += '<div class="card scroll"><table><tr><th>' + t('col.name') + '</th><th>' + t('col.host') + '</th><th>' + t('col.product') + '</th><th>' + t('col.status') + '</th><th>' + t('col.nodes') + '</th><th>' + t('col.license') + '</th><th>' + t('col.version') + '</th><th></th></tr>';
    data.servers.forEach(function (s) {
      var st = s.status, lic = '–';
      if (s.licenseSerial) {
        lic = esc(s.licenseSerial);
        if (st && st.license && st.license.daysLeft != null) lic += '<br><span class="small muted">' + t('lic.days', { n: st.license.daysLeft }) + '</span>';
      } else if (s.installedAt) lic = '<span class="pill bad">' + t('lic.none') + '</span>';
      var nodes = st && st.nodes ? (st.nodes.registered == null ? st.nodes.listed : st.nodes.registered + ' / ' + st.nodes.listed) : '–';
      var upd = bundleOutdated(s) ? ' <span class="pill info">' + t('ver.update') + '</span>' : '';
      var acts = '';
      if (s.installedAt && st && st.locked) acts += '<button class="btn small primary" data-act="unlock" data-id="' + s.id + '">' + t('act.unlock') + '</button> ';
      acts += '<button class="btn small" data-act="details" data-id="' + s.id + '">' + t('act.details') + '</button>';
      html += '<tr><td><b>' + esc(s.name) + '</b><br><span class="small muted">' + esc(s.provider || '') + (s.region ? ' · ' + esc(s.region) : '') + '</span></td>' +
        '<td class="mono">' + esc(s.host) + '</td><td>' + t('product.' + s.product) + '<br><span class="small muted">' + t('profile.' + s.profile) + (s.store === 'ram' ? ' · RAM' : '') + '</span></td>' +
        '<td>' + statusPill(s) + (s.busy ? ' <span class="pill info">' + t('st.busy') + '</span>' : '') + '</td><td>' + nodes + '</td><td>' + lic + '</td>' +
        '<td>' + esc(s.installedVersion || '–') + upd + '</td><td>' + acts + '</td></tr>';
    });
    return html + '</table></div>';
  }
  function bundleOutdated(s) { return data.bundle && s.installedAt && s.bundleSha256 && s.bundleSha256 !== data.bundle.sha256; }

  // ───────── licences view ─────────
  function licTable(kind) {
    var rows = data.licenses[kind];
    if (!rows.length) return '<p class="muted">' + t('lic.empty') + '</p>';
    var h = '<div class="scroll"><table><tr><th>' + t('lic.serial') + '</th><th>' + t('lic.customer') + '</th>' + (kind === 'app' ? '<th>' + t('lic.edition') + '</th>' : '') + '<th>' + t('lic.expires') + '</th><th>' + t('lic.state') + '</th><th>' + t('lic.assigned') + '</th><th></th></tr>';
    rows.forEach(function (l) {
      var pill = l.state === 'valid' ? 'ok' : l.state === 'expiring' ? 'warn' : 'bad';
      var as = l.assigned ? (l.assigned.type === 'server' ? t('lic.onserver', { name: esc(l.assignedName || '?') }) : t('lic.ondevice', { label: esc(l.assigned.label) })) : '<span class="muted">' + t('lic.free') + '</span>';
      var act = '<button class="btn small" data-act="lic-show" data-kind="' + kind + '" data-serial="' + esc(l.serial) + '">' + t('lic.show') + '</button> ';
      if (!l.assigned && l.state !== 'expired') act += kind === 'app' ? '<button class="btn small" data-act="lic-device" data-serial="' + esc(l.serial) + '">' + t('lic.todevice') + '</button>' : '';
      if (l.assigned && (kind === 'app' || l.assigned.type === 'device')) act += '<button class="btn small" data-act="lic-release" data-kind="' + kind + '" data-serial="' + esc(l.serial) + '">' + t('lic.release') + '</button>';
      h += '<tr><td class="mono">' + esc(l.serial) + '</td><td>' + esc(l.customer) + '</td>' + (kind === 'app' ? '<td>' + esc(l.edition) + '</td>' : '') + '<td>' + fmtDate(l.expiresAtMs) + '</td><td><span class="pill ' + pill + '">' + t('lic.' + l.state) + '</span></td><td>' + as + '</td><td>' + act + '</td></tr>';
    });
    return h + '</table></div>';
  }
  function viewLicenses() {
    var s = data.summary.server, a = data.summary.app;
    return '<h1>' + t('lic.title') + '</h1><p class="lead">' + t('lic.lead') + '</p>' +
      '<div class="card"><div class="stat"><div><b>' + s.free + '</b>' + t('lic.freeservers') + '</div><div><b>' + s.assigned + '</b>' + t('lic.usedservers') + '</div><div><b>' + a.free + '</b>' + t('lic.freeapps') + '</div><div><b>' + a.assigned + '</b>' + t('lic.usedapps') + '</div></div></div>' +
      '<div class="card"><h3>' + t('lic.import') + '</h3><p class="small muted">' + t('lic.importhelp') + '</p><textarea id="lic-text" placeholder="unpruuf-server-license:v1:…"></textarea>' +
      '<div class="row"><input id="lic-file" type="file" accept=".csv,.txt,text/plain,text/csv"> <button class="btn primary" data-act="lic-import">' + t('lic.importgo') + '</button></div><div id="lic-msg"></div></div>' +
      '<h2>' + t('lic.servercodes') + '</h2><div class="card">' + licTable('server') + '</div>' +
      '<h2>' + t('lic.appcodes') + '</h2><p class="small muted">' + t('lic.apphelp') + '</p><div class="card">' + licTable('app') + '</div>' +
      '<div class="row"><a class="btn" href="#" data-act="lic-csv" data-codes="0">' + t('lic.csv') + '</a> <a class="btn" href="#" data-act="lic-csv" data-codes="1">' + t('lic.csvcodes') + '</a></div>';
  }

  // ───────── distribution view ─────────
  function viewDistribution() {
    var inst = data.servers.filter(function (s) { return s.installedAt; });
    var spread = inst.map(function (s) { return '<tr><td>' + esc(s.name) + '</td><td>' + esc(s.provider || '–') + '</td><td>' + esc(s.region || '–') + '</td></tr>'; }).join('');
    return '<h1>' + t('dist.title') + '</h1><p class="lead">' + t('dist.lead') + '</p>' +
      '<div class="card"><h3>' + t('dist.lists') + '</h3><p class="small muted">' + t('dist.listshelp') + '</p><div class="row"><button class="btn primary" data-act="zip"' + (inst.length ? '' : ' disabled') + '>' + t('dist.zip') + '</button>' +
      inst.map(function (s) { return '<button class="btn small" data-act="list" data-id="' + s.id + '">' + esc(s.name) + '</button>'; }).join('') + '</div></div>' +
      '<div class="card"><h3>' + t('dist.spread') + '</h3><p class="small muted">' + t('dist.spreadhelp') + '</p>' + (inst.length ? '<table><tr><th>' + t('col.name') + '</th><th>' + t('dist.provider') + '</th><th>' + t('dist.region') + '</th></tr>' + spread + '</table>' : '<p class="muted">–</p>') + '</div>' +
      '<div class="card"><h3>' + t('dist.staff') + '</h3><ol>' + ['1', '2', '3', '4'].map(function (n) { return '<li>' + t('dist.step' + n) + '</li>'; }).join('') + '</ol><p class="small muted">' + t('dist.feed') + '</p></div>';
  }

  // ───────── settings view ─────────
  function viewSettings() {
    var b = data.bundle;
    return '<h1>' + t('set.title') + '</h1>' +
      '<div class="card"><h3>' + t('set.bundle') + '</h3>' + (b ? '<dl class="kv"><dt>' + t('set.version') + '</dt><dd>' + esc(b.releaseVersion || b.version) + '</dd><dt>SHA-256</dt><dd class="mono">' + esc(b.sha256) + '</dd><dt>' + t('set.signed') + '</dt><dd>' + (b.signed ? t('yes') + ' · ' + esc(b.releaseFingerprint) : t('set.unsigned')) + '</dd><dt>' + t('set.files') + '</dt><dd>' + b.files + ' · ' + esc(b.builtAt) + '</dd></dl>' : '<p class="err">' + t('servers.nobundle') + '</p>') + '</div>' +
      '<div class="card"><h3>' + t('set.backup') + '</h3><p class="small muted">' + t('set.backuphelp') + '</p><button class="btn" data-act="backup">' + t('set.backupgo') + '</button></div>' +
      '<div class="card"><h3>' + t('set.pass') + '</h3><div class="grid2"><div><label>' + t('set.oldpass') + '</label><input id="p-old" type="password" autocomplete="current-password"></div><div><label>' + t('set.newpass') + '</label><input id="p-new" type="password" autocomplete="new-password"></div></div><div id="p-msg"></div><button class="btn" data-act="passphrase">' + t('set.passgo') + '</button></div>' +
      '<div class="card"><h3>' + t('set.limits') + '</h3><ul>' + ['1', '2', '3', '4', '5', '6'].map(function (n) { return '<li>' + t('set.limit' + n) + '</li>'; }).join('') + '</ul></div>';
  }

  // ───────── modal helpers ─────────
  function openModal(html) { modal = true; $mb.innerHTML = html; $modal.classList.remove('hidden'); }
  function closeModal() { modal = null; $modal.classList.add('hidden'); $mb.innerHTML = ''; wiz = null; if (data) { loadOverview().then(rerender); } }
  function modalHead(title) { return '<div class="row"><h1>' + title + '</h1><div class="spacer"></div><button class="btn small" data-act="close">' + t('close') + '</button></div>'; }

  // ───────── job log ─────────
  function followJob(jobId, logEl, onEnd) {
    var from = 0;
    (function tick() {
      api('GET', '/api/jobs/' + jobId + '?from=' + from).then(function (r) {
        if (!r.ok) return onEnd({ state: 'failed', error: r.json && r.json.error });
        var j = r.json;
        if (j.lines.length) { logEl.textContent += (logEl.textContent ? '\n' : '') + j.lines.join('\n'); logEl.scrollTop = logEl.scrollHeight; }
        from = j.total;
        if (j.state === 'running') setTimeout(tick, 1500); else onEnd(j);
      });
    })();
  }

  // ───────── add-server wizard ─────────
  var wiz = null;
  function newWizard() { wiz = { step: 1, host: '', port: '22', user: 'root', password: '', probe: null, name: '', provider: '', region: '', product: 'business', profile: 'standard', store: 'disk', license: 'auto', harden: true, err: '' }; showWizard(); }
  function pfList(v) { return (v.blocking || []).map(function (c) { return '<li class="err">' + t('pf.' + c) + '</li>'; }).join('') + (v.warnings || []).map(function (c) { return '<li class="muted">' + t('pf.' + c) + '</li>'; }).join(''); }
  function showWizard() {
    var h = modalHead(t('wiz.title') + ' · ' + wiz.step + '/3');
    if (wiz.step === 1) {
      h += '<p class="lead">' + t('wiz.step1') + '</p><div class="grid2"><div><label>' + t('wiz.host') + '</label><input data-bind="host" value="' + esc(wiz.host) + '" placeholder="203.0.113.10"></div><div><label>' + t('wiz.port') + '</label><input data-bind="port" value="' + esc(wiz.port) + '"></div>' +
        '<div><label>' + t('wiz.user') + '</label><input data-bind="user" value="' + esc(wiz.user) + '"></div><div><label>' + t('wiz.password') + '</label><input data-bind="password" type="password" value="' + esc(wiz.password) + '" autocomplete="off"></div></div>' +
        '<p class="small muted">' + t('wiz.pwnote') + '</p>';
      if (wiz.probe) {
        h += '<div class="card"><dl class="kv"><dt>' + t('wiz.hostkey') + '</dt><dd class="mono">' + esc(wiz.probe.hostKey) + '</dd><dt>' + t('wiz.system') + '</dt><dd>' + esc(wiz.probe.preflight.os + ' ' + wiz.probe.preflight.osver + ' · ' + wiz.probe.preflight.arch + ' · ' + wiz.probe.preflight.memMB + ' MB · ' + wiz.probe.preflight.diskMB + ' MB ' + t('wiz.free')) + '</dd><dt>Docker</dt><dd>' + esc(wiz.probe.preflight.docker === 'none' ? t('wiz.dockerinstall') : wiz.probe.preflight.docker) + '</dd></dl><ul>' + pfList(wiz.probe.verdict) + '</ul><p class="small">' + t('wiz.hostkeyhelp') + '</p></div>';
      }
      if (wiz.err) h += '<div class="err">' + esc(wiz.err) + '</div>';
      h += '<div class="row"><button class="btn" data-act="wiz-probe">' + t('wiz.check') + '</button><div class="spacer"></div><button class="btn primary" data-act="wiz-next1"' + (wiz.probe && !wiz.probe.verdict.blocking.length ? '' : ' disabled') + '>' + t('wiz.next') + '</button></div>';
    } else if (wiz.step === 2) {
      var free = data.licenses.server.filter(function (l) { return !l.assigned && l.state !== 'expired'; });
      h += '<p class="lead">' + t('wiz.step2') + '</p><div class="grid2"><div><label>' + t('wiz.name') + '</label><input data-bind="name" value="' + esc(wiz.name) + '"></div>' +
        '<div><label>' + t('wiz.product') + '</label><select data-bind="product">' + ['business', 'safeline', 'press'].map(function (p) { return '<option value="' + p + '"' + (wiz.product === p ? ' selected' : '') + '>' + t('product.' + p) + '</option>'; }).join('') + '</select></div>' +
        '<div><label>' + t('dist.provider') + '</label><input data-bind="provider" value="' + esc(wiz.provider) + '" placeholder="Hetzner, OVH, …"></div><div><label>' + t('dist.region') + '</label><input data-bind="region" value="' + esc(wiz.region) + '" placeholder="Falkenstein, Bucharest, …"></div>' +
        '<div><label>' + t('wiz.profile') + '</label><select data-bind="profile">' + ['standard', 'high-security', 'offline-tolerant'].map(function (p) { return '<option value="' + p + '"' + (wiz.profile === p ? ' selected' : '') + '>' + t('profile.' + p) + ' – ' + t('profile.' + p + '.h') + '</option>'; }).join('') + '</select></div>' +
        '<div><label>' + t('wiz.store') + '</label><select data-bind="store"><option value="disk"' + (wiz.store === 'disk' ? ' selected' : '') + '>' + t('wiz.store.disk') + '</option><option value="ram"' + (wiz.store === 'ram' ? ' selected' : '') + '>' + t('wiz.store.ram') + '</option></select></div></div>' +
        '<label>' + t('wiz.license') + '</label><select data-bind="license"><option value="auto"' + (wiz.license === 'auto' ? ' selected' : '') + '>' + t('wiz.license.auto', { n: free.length }) + '</option>' + free.map(function (l) { return '<option value="' + esc(l.serial) + '"' + (wiz.license === l.serial ? ' selected' : '') + '>' + esc(l.serial) + ' · ' + fmtDate(l.expiresAtMs) + '</option>'; }).join('') + '<option value="none"' + (wiz.license === 'none' ? ' selected' : '') + '>' + t('wiz.license.none') + '</option></select>' +
        '<label class="check"><input type="checkbox" data-bind="harden"' + (wiz.harden ? ' checked' : '') + '> <span>' + t('wiz.harden') + '</span></label>';
      if (wiz.err) h += '<div class="err">' + esc(wiz.err) + '</div>';
      h += '<div class="row"><button class="btn" data-act="wiz-back">' + t('wiz.back') + '</button><div class="spacer"></div><button class="btn primary" data-act="wiz-install">' + t('wiz.install') + '</button></div>';
    } else {
      h += '<p class="lead">' + t('wiz.step3') + '</p><pre class="log" id="wiz-log"></pre><div id="wiz-end"></div>';
    }
    openModal(h);
    if (wiz.step === 3) startInstallJob();
  }
  var wizJob = null;
  function startInstallJob() {
    var log = document.getElementById('wiz-log');
    if (wizJob) { return; }
    var b = { host: wiz.host.trim(), port: Number(wiz.port) || 22, user: wiz.user.trim(), password: wiz.password, hostKey: wiz.probe.hostKey, name: wiz.name, provider: wiz.provider, region: wiz.region, product: wiz.product, profile: wiz.profile, store: wiz.store, license: wiz.license, hardenPassword: wiz.harden };
    api('POST', '/api/servers', b).then(function (r) {
      var end = document.getElementById('wiz-end');
      if (!r.ok) { wiz.step = 2; wiz.err = errText(r.json && (r.json.error === 'invalid' ? 'invalid:' + r.json.field : r.json.error)); wizJob = null; return showWizard(); }
      wizJob = r.json.jobId;
      followJob(wizJob, log, function (j) {
        wizJob = null; wiz.password = '';
        end.innerHTML = j.state === 'done' ? '<p class="okmsg">' + t('wiz.done') + '</p><button class="btn primary" data-act="close">' + t('close') + '</button>' : '<p class="err">' + esc(errText(j.error)) + '</p><p class="small muted">' + t('wiz.retryhelp') + '</p><button class="btn" data-act="close">' + t('close') + '</button>';
      });
    });
  }

  // ───────── server details ─────────
  function showDetails(id) {
    var s = data.servers.filter(function (x) { return x.id === id; })[0]; if (!s) return;
    var st = s.status;
    var h = modalHead(esc(s.name)) + '<dl class="kv"><dt>' + t('col.host') + '</dt><dd class="mono">' + esc(s.user + '@' + s.host + ':' + s.port) + '</dd><dt>' + t('wiz.hostkey') + '</dt><dd class="mono">' + esc(s.hostKey) + '</dd><dt>' + t('col.product') + '</dt><dd>' + t('product.' + s.product) + ' · ' + t('profile.' + s.profile) + ' · ' + (s.store === 'ram' ? t('wiz.store.ram') : t('wiz.store.disk')) + ' · slot ' + s.slot + '</dd>' +
      '<dt>' + t('col.license') + '</dt><dd>' + esc(s.licenseSerial || '–') + '</dd><dt>' + t('col.version') + '</dt><dd>' + esc(s.installedVersion || '–') + '</dd><dt>' + t('det.ownercode') + '</dt><dd>' + (s.hasOwnerCode ? t('yes') : t('no')) + '</dd><dt>' + t('det.pwlogin') + '</dt><dd>' + (s.passwordLoginDisabled ? t('det.off') : t('det.on')) + '</dd>' +
      (st && st.reachable ? '<dt>' + t('det.integrity') + '</dt><dd>' + esc(st.integrity ? st.integrity.state + (st.integrity.fingerprint ? ' · ' + st.integrity.fingerprint : '') : '–') + '</dd><dt>' + t('det.stored') + '</dt><dd>' + esc(st.stored == null ? '–' : st.stored) + '</dd>' : '') + '</dl>';
    if (!s.installedAt) {
      h += '<h3>' + t('det.retry') + '</h3><p class="small muted">' + t('det.retryhelp') + '</p><label>' + t('wiz.password') + '</label><input id="d-pw" type="password" autocomplete="off"><div class="row"><button class="btn primary" data-act="d-install" data-id="' + id + '">' + t('det.retrygo') + '</button></div><pre class="log hidden" id="d-log"></pre><div id="d-end"></div>';
    } else {
      var freeL = data.licenses.server.filter(function (l) { return !l.assigned && l.state !== 'expired'; });
      h += '<h3>' + t('det.actions') + '</h3><div class="row"><button class="btn" data-act="d-status" data-id="' + id + '">' + t('servers.refresh') + '</button> <button class="btn" data-act="list" data-id="' + id + '">' + t('dist.download') + '</button> <button class="btn" data-act="d-update" data-id="' + id + '"' + (data.bundle ? '' : ' disabled') + '>' + t('det.update') + '</button>' +
        (s.licenseSerial ? ' <button class="btn" data-act="d-pushlic" data-id="' + id + '">' + t('det.pushlic') + '</button>' : '') + '</div>';
      if (!s.licenseSerial) h += '<label>' + t('det.assignlic') + '</label><div class="row"><select id="d-lic">' + freeL.map(function (l) { return '<option value="' + esc(l.serial) + '">' + esc(l.serial) + ' · ' + fmtDate(l.expiresAtMs) + '</option>'; }).join('') + '</select><button class="btn" data-act="d-assign" data-id="' + id + '"' + (freeL.length ? '' : ' disabled') + '>' + t('det.assigngo') + '</button></div>';
      h += '<h3>' + t('det.bridges') + '</h3><p class="small muted">' + t('det.bridgeshelp') + '</p><textarea id="d-bridges" placeholder="obfs4 203.0.113.9:443 …">' + esc(s.bridgeText || '') + '</textarea><div class="row"><button class="btn" data-act="d-bridges" data-id="' + id + '">' + t('det.bridgesgo') + '</button></div>' +
        '<h3>' + t('det.labels') + '</h3><div class="grid2"><div><label>' + t('wiz.name') + '</label><input id="d-name" value="' + esc(s.name) + '"></div><div><label>' + t('dist.provider') + '</label><input id="d-provider" value="' + esc(s.provider) + '"></div><div><label>' + t('dist.region') + '</label><input id="d-region" value="' + esc(s.region) + '"></div></div><button class="btn" data-act="d-labels" data-id="' + id + '">' + t('save') + '</button>' +
        '<h3>' + t('det.rotate') + '</h3><p class="small muted">' + t('det.rotatehelp') + '</p><div class="row"><input id="d-rot" placeholder="' + esc(s.name) + '"><button class="btn danger" data-act="d-rotate" data-id="' + id + '">' + t('det.rotatego') + '</button></div>';
    }
    h += '<h3>' + t('det.remove') + '</h3><p class="small muted">' + t('det.removehelp') + '</p><label class="check"><input type="checkbox" id="d-wipe"> <span>' + t('det.wipe') + '</span></label><div class="row"><input id="d-rm" placeholder="' + esc(s.name) + '"><button class="btn danger" data-act="d-remove" data-id="' + id + '">' + t('det.removego') + '</button></div><div id="d-msg"></div>';
    openModal(h);
  }
  function msg(id, ok, text) { var e = document.getElementById(id); if (e) e.innerHTML = '<p class="' + (ok ? 'okmsg' : 'err') + '">' + esc(text) + '</p>'; }
  function runJobIn(jobId, logId, endId, id) {
    var log = document.getElementById(logId), end = document.getElementById(endId); if (log) log.classList.remove('hidden');
    followJob(jobId, log, function (j) { if (end) end.innerHTML = j.state === 'done' ? '<p class="okmsg">' + t('det.jobdone') + '</p>' : '<p class="err">' + esc(errText(j.error)) + '</p>'; refreshStatus(id); });
  }

  // ───────── licence dialogs ─────────
  function showCode(kind, serial) {
    api('GET', '/api/licenses/' + kind + '/' + encodeURIComponent(serial) + '/code').then(function (r) {
      if (!r.ok) return alert(errText(r.json && r.json.error));
      openModal(modalHead(esc(serial)) + '<p class="small muted">' + t('lic.codehelp') + '</p><textarea id="code-box" readonly>' + esc(r.json.code) + '</textarea><div class="row"><button class="btn primary" data-act="copy-code">' + t('copy') + '</button></div><p class="center"><img class="qr" alt="QR" src="' + r.json.qr + '"></p>');
    });
  }

  // ───────── events ─────────
  document.addEventListener('change', function (e) {
    if (e.target.id === 'lang') { lang = e.target.value; localStorage.setItem('ctl-lang', lang); document.documentElement.lang = lang; if (data && token) { rerender(); } else boot(); return; }
    if (e.target.id === 'lic-file') {
      var f = e.target.files[0]; if (!f) return; var rd = new FileReader();
      rd.onload = function () { var ta = document.getElementById('lic-text'); ta.value = (ta.value ? ta.value + '\n' : '') + rd.result; };
      rd.readAsText(f);
    }
    var b = e.target.getAttribute && e.target.getAttribute('data-bind');
    if (b && wiz) { wiz[b] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; if (b === 'product') { var d = wiz.product === 'business' ? ['standard', 'disk'] : ['offline-tolerant', 'disk']; wiz.profile = d[0]; wiz.store = d[1]; showWizard(); } }
  });
  document.addEventListener('input', function (e) { var b = e.target.getAttribute && e.target.getAttribute('data-bind'); if (b && wiz && e.target.type !== 'checkbox') wiz[b] = e.target.value; });

  document.addEventListener('click', function (e) {
    var tb = e.target.closest('[data-tab]');
    if (tb) { tab = tb.getAttribute('data-tab'); return rerender(); }
    var el = e.target.closest('[data-act]'); if (!el) return;
    e.preventDefault();
    var act = el.getAttribute('data-act'), id = el.getAttribute('data-id');
    var v = function (i) { var x = document.getElementById(i); return x ? x.value : ''; };
    switch (act) {
      case 'close': return closeModal();
      case 'create': {
        var p = v('s-pass'); if (p !== v('s-pass2')) return (document.getElementById('s-err').textContent = t('setup.mismatch'));
        return api('POST', '/api/vault/create', { passphrase: p, company: v('s-company') }).then(function (r) {
          if (!r.ok) return (document.getElementById('s-err').textContent = errText(r.json && r.json.error));
          token = r.json.token; sessionStorage.setItem('ctl-token', token); boot();
        });
      }
      case 'vault-unlock':
        return api('POST', '/api/vault/unlock', { passphrase: v('u-pass') }).then(function (r) {
          if (!r.ok) return (document.getElementById('u-err').textContent = r.status === 429 ? t('unlock.wait', { n: r.json.seconds }) : t('unlock.wrong'));
          token = r.json.token; sessionStorage.setItem('ctl-token', token); boot();
        });
      case 'lock': return api('POST', '/api/vault/lock', {}).then(function () { token = null; sessionStorage.removeItem('ctl-token'); data = null; boot(); });
      case 'refresh': return refreshStatus();
      case 'unlock-all': return api('POST', '/api/servers/unlock-all', {}).then(function () { return refreshStatus(); });
      case 'unlock': return api('POST', '/api/servers/' + id + '/unlock', {}).then(function (r) { if (!r.ok) alert(errText(r.json && r.json.error)); return refreshStatus(); });
      case 'add-server': return newWizard();
      case 'wiz-probe':
        wiz.err = ''; wiz.probe = null;
        el.disabled = true; el.textContent = t('wiz.checking');
        return api('POST', '/api/servers/probe', { host: wiz.host, port: Number(wiz.port) || 22, user: wiz.user, password: wiz.password }).then(function (r) {
          if (!r.ok) wiz.err = errText(r.json && r.json.error) + (r.json && r.json.message ? ' ' + r.json.message : ''); else wiz.probe = r.json;
          showWizard();
        });
      case 'wiz-next1': wiz.step = 2; if (!wiz.name) wiz.name = wiz.host; return showWizard();
      case 'wiz-back': wiz.step = 1; return showWizard();
      case 'wiz-install': wiz.err = ''; wiz.step = 3; wizJob = null; return showWizard();
      case 'details': return showDetails(id);
      case 'list': return download('/api/servers/' + id + '/list', 'unpruuf-nodes.txt');
      case 'zip': return download('/api/lists.zip', 'unpruuf-node-lists.zip');
      case 'd-status': return refreshStatus(id).then(function () { showDetails(id); });
      case 'd-update': return api('POST', '/api/servers/' + id + '/update', {}).then(function (r) { if (!r.ok) return msg('d-msg', false, errText(r.json && r.json.error)); $mb.insertAdjacentHTML('beforeend', '<pre class="log" id="d-log"></pre><div id="d-end"></div>'); runJobIn(r.json.jobId, 'd-log', 'd-end', id); });
      case 'd-install': return api('POST', '/api/servers/' + id + '/install', { password: v('d-pw') }).then(function (r) { if (!r.ok) return msg('d-msg', false, errText(r.json && r.json.error)); runJobIn(r.json.jobId, 'd-log', 'd-end', id); });
      case 'd-pushlic': return api('POST', '/api/servers/' + id + '/license', {}).then(function (r) { msg('d-msg', r.ok, r.ok ? t('det.jobdone') : errText(r.json && r.json.error)); });
      case 'd-assign': return api('POST', '/api/servers/' + id + '/license', { serial: v('d-lic') }).then(function (r) { msg('d-msg', r.ok, r.ok ? t('det.jobdone') : errText(r.json && r.json.error)); loadOverview().then(function () { showDetails(id); }); });
      case 'd-bridges': return api('POST', '/api/servers/' + id + '/bridges', { text: v('d-bridges') }).then(function (r) { msg('d-msg', r.ok, r.ok ? t('det.bridgessaved', { n: r.json.saved, m: r.json.rejected }) : errText(r.json && r.json.error)); });
      case 'd-labels': return api('POST', '/api/servers/' + id + '/settings', { name: v('d-name'), provider: v('d-provider'), region: v('d-region') }).then(function (r) { msg('d-msg', r.ok, r.ok ? t('saved') : errText(r.json && r.json.error)); loadOverview(); });
      case 'd-rotate': return api('POST', '/api/servers/' + id + '/rotate', { confirmName: v('d-rot') }).then(function (r) { msg('d-msg', r.ok, r.ok ? t('det.rotated') : errText(r.json && r.json.error)); });
      case 'd-remove': return api('POST', '/api/servers/' + id + '/remove', { confirmName: v('d-rm'), wipe: document.getElementById('d-wipe').checked }).then(function (r) {
        if (!r.ok) return msg('d-msg', false, errText(r.json && r.json.error));
        $mb.insertAdjacentHTML('beforeend', '<pre class="log" id="d-log"></pre><div id="d-end"></div>'); runJobIn(r.json.jobId, 'd-log', 'd-end', id);
      });
      case 'lic-import': return api('POST', '/api/licenses/import', { text: v('lic-text') }).then(function (r) {
        if (!r.ok) return (document.getElementById('lic-msg').innerHTML = '<p class="err">' + errText(r.json && r.json.error) + '</p>');
        var j = r.json; document.getElementById('lic-msg').innerHTML = '<p class="okmsg">' + t('lic.imported', { a: j.added, r: j.renewed, d: j.duplicates, i: j.invalid.length }) + '</p>' + (j.smallServers ? '<p class="warnmsg">' + t('lic.smallserver', { n: j.smallServers }) + '</p>' : '');
        return loadOverview().then(function () { var m = document.getElementById('lic-msg').innerHTML; rerender(); document.getElementById('lic-msg').innerHTML = m; });
      });
      case 'lic-show': return showCode(el.getAttribute('data-kind'), el.getAttribute('data-serial'));
      case 'lic-device': {
        var label = prompt(t('lic.devicelabel')); if (!label) return;
        return api('POST', '/api/licenses/assign', { kind: 'app', serial: el.getAttribute('data-serial'), target: label }).then(function (r) { if (!r.ok) alert(errText(r.json && r.json.error)); return loadOverview().then(rerender); });
      }
      case 'lic-release': return api('POST', '/api/licenses/release', { kind: el.getAttribute('data-kind'), serial: el.getAttribute('data-serial') }).then(function (r) { if (!r.ok) alert(errText(r.json && r.json.error)); return loadOverview().then(rerender); });
      case 'lic-csv': return download('/api/licenses.csv?codes=' + el.getAttribute('data-codes'), 'unpruuf-licences.csv');
      case 'copy-code': { var box = document.getElementById('code-box'); box.select(); try { document.execCommand('copy'); } catch (x) { /* user can copy by hand */ } return; }
      case 'backup': return download('/api/vault/backup', 'unpruuf-control-vault.enc');
      case 'passphrase': return api('POST', '/api/vault/passphrase', { oldPassphrase: v('p-old'), newPassphrase: v('p-new') }).then(function (r) { msg('p-msg', r.ok, r.ok ? t('saved') : errText(r.json && r.json.error)); });
    }
  });

  document.documentElement.lang = lang;
  boot();
})();
