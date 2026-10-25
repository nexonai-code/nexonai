/* Panoul ofițerului. Vanilla JS, no build step. Talks to the JSON API in ../app.ts. */
"use strict";

const DAY = 24 * 60 * 60 * 1000;
/* All visible text comes from i18n.js (Romanian and English). */
const statusLabel = (s) => (["new", "acknowledged", "in_progress", "closed"].includes(s) ? t("st_" + s) : s);
const categorySuggestions = () => t("cat_suggest");

const $ = (id) => document.getElementById(id);
const state = {
  route: { name: "overview", id: null },
  cases: [],
  me: null,
  tab: "open",
  filter: "",
  press: null, // unpruuf Press only: { settings, startedAt, offlineGapMs, lastOkPollAt }
  lastOkAt: null, // when the last successful fetch from the server finished
  dismissedWarn: new Set(),
  detail: null, // the open case incl. messages
  previous: null, // id -> lastActivityAt, for "new case" toasts
  ownTouch: new Set(), // case ids this officer just changed (no toast for those)
  recherchen: null, // unpruuf Press: { generalTipCount, recherchen: [...] } with codes and QR images
};

/* ───────── helpers ───────── */
async function api(path, options) {
  const res = await fetch(path, { headers: { "content-type": "application/json" }, ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ? serverError(body.error) : `HTTP ${res.status}`);
  }
  return res.json();
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

function fmtDateTime(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  const tm = d.toLocaleTimeString(t("time_locale"), { hour: "2-digit", minute: "2-digit" });
  return `${d.getDate()} ${t("months")[d.getMonth()]}, ${tm}`;
}
function fmtDay(ms) {
  const d = new Date(ms);
  return `${d.getDate()} ${t("months")[d.getMonth()]}`;
}
function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 45) return t("s_few");
  const m = Math.round(s / 60);
  if (m < 60) return m === 1 ? t("m_1") : t("m_n", { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? t("h_1") : t("h_n", { n: h });
  const d = Math.round(h / 24);
  if (d === 1) return t("yesterday");
  return t("d_n", { n: d });
}
function daysWord(n) { return n === 1 ? t("day_1") : t("day_n", { n }); }

function shortAgo(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 90) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min`;
  const hrs = Math.round(m / 60);
  if (hrs < 48) return `${hrs} h`;
  return `${Math.round(hrs / 24)} d`;
}

function seenMap() {
  try { return JSON.parse(localStorage.getItem("seenAt") || "{}"); } catch { return {}; }
}
function markSeen(id, at) {
  try { const m = seenMap(); m[id] = Math.max(m[id] || 0, at); localStorage.setItem("seenAt", JSON.stringify(m)); } catch { /* private mode: no unread tracking */ }
}
function isUnread(c) {
  const seen = seenMap()[c.id];
  return !seen || c.lastActivityAt > seen;
}

/* The next legal step of a case: receipt first, then the answer. */
function nextDeadline(c) {
  if (c.status === "closed") return { kind: "closed", label: t("dl_closed"), due: null, from: null };
  if (!c.acknowledgedAt) return { kind: "ack", label: t("dl_ack"), title: t("dl_ack_title"), due: c.ackDueAt, from: c.openedAt, amberDays: 3 };
  return { kind: "feedback", label: t("dl_fb"), title: t("dl_fb_title"), due: c.feedbackDueAt, from: c.openedAt, amberDays: 14 };
}
function urgency(nd) {
  if (!nd.due) return { cls: "none", text: "—", days: Infinity, progress: 1, mode: "none" };
  const remaining = nd.due - Date.now();
  const days = Math.ceil(remaining / DAY);
  let cls = "green";
  if (remaining <= 0 || remaining < DAY) cls = "red";
  else if (days <= nd.amberDays) cls = "amber";
  const mode = remaining <= 0 ? "overdue" : remaining < DAY ? "today" : "days";
  const dayText = mode === "overdue" ? daysWord(Math.max(1, Math.ceil(-remaining / DAY))) : daysWord(days);
  const text = mode === "overdue" ? t("overdue", { d: dayText }) : mode === "today" ? t("today") : t("in_days", { d: dayText });
  const span = nd.due - nd.from;
  const progress = span > 0 ? Math.min(1, Math.max(0, (Date.now() - nd.from) / span)) : 1;
  return { cls, text, days: remaining / DAY, progress, mode, dayText };
}
function sortedByUrgency(list) {
  // unpruuf Press has no legal deadlines: unread first, then the most recent activity.
  if (EDITION === "press") return [...list].sort((a, b) => (isUnread(b) - isUnread(a)) || (b.lastActivityAt - a.lastActivityAt));
  return [...list].sort((a, b) => {
    const ca = a.status === "closed", cb = b.status === "closed";
    if (ca !== cb) return ca ? 1 : -1;
    if (ca && cb) return b.lastActivityAt - a.lastActivityAt;
    return nextDeadline(a).due - nextDeadline(b).due;
  });
}

/* ───────── routing ───────── */
function parseRoute() {
  const h = location.hash.replace(/^#\/?/, "");
  if (h === "cazuri") return { name: "cases", id: null };
  if (h === "cod") return { name: "code", id: null };
  if (h === "setari" && EDITION === "press") return { name: "settings", id: null };
  if (h === "recherchen" && EDITION === "press") return { name: "recherchen", id: null };
  if (h.startsWith("caz/")) return { name: "detail", id: decodeURIComponent(h.slice(4)) };
  return { name: "overview", id: null };
}
const titleFor = (r) => ({ overview: t("nav_overview"), cases: t("nav_cases"), code: t("nav_code"), detail: t("page_detail"), settings: t("page_settings"), recherchen: t("page_rech") })[r];

async function route() {
  state.route = parseRoute();
  const r = state.route.name;
  for (const v of ["overview", "cases", "code", "detail", "settings", "recherchen"]) $(`v-${v}`).classList.toggle("hidden", v !== r);
  for (const a of document.querySelectorAll(".nav")) a.classList.toggle("on", a.dataset.route === (r === "detail" ? "cases" : r));
  $("pageTitle").textContent = titleFor(r);
  $("pageSub").textContent = r === "overview" ? todayLong() : r === "code" ? t("page_code_sub") : r === "cases" ? t("page_cases_sub") : r === "settings" ? t("page_settings_sub") : r === "recherchen" ? t("page_rech_sub") : "";
  state.detail = null;
  if (r === "detail") await openDetail(state.route.id, true);
  else if (r === "settings") renderSettings();
  else if (r === "recherchen") { await loadRecherchen().catch((err) => toast(t("open_fail"), err.message)); renderRecherchen(); }
  else render();
  window.scrollTo({ top: 0 });
}
function todayLong() {
  const d = new Date();
  return `${t("weekdays")[d.getDay()][0].toUpperCase() + t("weekdays")[d.getDay()].slice(1)}, ${d.getDate()} ${t("months_long")[d.getMonth()]} ${d.getFullYear()}`;
}

/* ───────── data loading ───────── */
async function loadMe() {
  state.me = await api("/api/me");
  $("qrSmall").src = state.me.qrDataUrl;
  $("startQr").src = state.me.qrDataUrlLarge || state.me.qrDataUrl;
  $("qrBig").src = state.me.qrDataUrlLarge || state.me.qrDataUrl;
  $("qrModalImg").src = state.me.qrDataUrlLarge || state.me.qrDataUrl;
  $("myCode").value = state.me.pairingCode;
  $("relayUrlHint").textContent = state.me.relayReachableBaseUrl;
}

async function loadCases() {
  const cases = await api("/api/cases");
  notifyChanges(cases);
  state.cases = cases;
  $("navCount").textContent = String(cases.length);
  render();
}

function notifyChanges(cases) {
  const current = new Map(cases.map((c) => [c.id, c.lastActivityAt]));
  if (state.previous) {
    for (const c of cases) {
      if (state.ownTouch.has(c.id)) continue;
      const before = state.previous.get(c.id);
      const open = state.route.name === "detail" && state.route.id === c.id;
      if (before === undefined) toast(t("toast_new", { c: c.caseNumber || c.id.slice(0, 8) }), t("toast_new_sub"), c.id);
      else if (c.lastActivityAt > before && !open) toast(t("toast_msg", { c: c.caseNumber || c.id.slice(0, 8) }), t("toast_msg_sub"), c.id);
    }
  }
  state.ownTouch.clear();
  state.previous = current;
}

function toast(title, sub, caseId) {
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<div>${esc(title)}<small>${esc(sub)}</small></div>`;
  el.addEventListener("click", () => { if (caseId) location.hash = `#/caz/${encodeURIComponent(caseId)}`; el.remove(); });
  $("toasts").appendChild(el);
  setTimeout(() => el.remove(), 9000);
}

async function loadStatus() {
  try {
    const s = await api("/api/status");
    if (s.lastPollOk && s.lastPollAt) state.lastOkAt = s.lastPollAt;
    updatePickupWarn(s);
    const dot = $("connDot");
    dot.className = "dot";
    if (s.lastPollAt === null) {
      dot.classList.add("wait");
      $("connTitle").textContent = t("c_connecting");
      $("connText").textContent = t("c_connecting_t");
    } else if (s.lastPollOk) {
      $("connTitle").textContent = s.viaTor ? t("c_tor") : t("c_direct");
      $("connText").textContent = t("c_ok_t", { ago: ago(s.lastPollAt) });
    } else {
      dot.classList.add("bad");
      $("connTitle").textContent = t("c_bad");
      $("connText").textContent = t("c_bad_t");
    }
  } catch {
    $("connDot").className = "dot bad";
    $("connTitle").textContent = t("c_panel");
    $("connText").textContent = t("c_panel_t");
  }
}

/* ───────── unpruuf Press: pickup warning, settings, delete, website code ───────── */
async function loadEdition() {
  try {
    const e = await api("/api/edition");
    if (e.edition === "press") { EDITION = "press"; state.press = e; }
  } catch { /* older server: stays the standard dashboard */ }
  document.body.dataset.edition = EDITION;
}

function updatePickupWarn(s) {
  const box = $("pickupWarn");
  if (EDITION !== "press" || !state.press) { box.classList.add("hidden"); return; }
  const HOUR = 3600 * 1000;
  const warnMs = state.press.settings.pickupWarnHours * HOUR;
  let text = null, red = false, key = null;
  const gap = state.press.offlineGapMs;
  if (gap !== null && gap >= warnMs) {
    key = `gap${state.press.startedAt}`;
    text = t(gap >= 24 * HOUR ? "warn_gap_lost" : "warn_gap", { h: Math.floor(gap / HOUR) });
  }
  if (!s.lastPollOk && state.lastOkAt && s.now - state.lastOkAt >= warnMs) {
    key = "live";
    red = true;
    text = t("warn_now", { h: Math.floor((s.now - state.lastOkAt) / HOUR) });
  }
  if (!text || state.dismissedWarn.has(key)) { box.classList.add("hidden"); return; }
  $("pickupWarnText").textContent = text;
  box.classList.toggle("red", red);
  box.dataset.key = key;
  box.classList.remove("hidden");
}

function fillSelect(el, options, selected) {
  el.innerHTML = options.map(([v, label]) => `<option value="${v}"${v === selected ? " selected" : ""}>${esc(label)}</option>`).join("");
}
function renderSettings() {
  if (!state.press) return;
  const days = state.press.settings.retentionDays;
  const retention = [[0, t("keep_forever")], [1, t("keep_day_1")], [7, t("keep_days_n", { n: 7 })], [30, t("keep_days_n", { n: 30 })], [90, t("keep_days_n", { n: 90 })], [180, t("keep_days_n", { n: 180 })], [365, t("keep_year")]];
  if (!retention.some(([v]) => v === days)) retention.push([days, t("keep_days_n", { n: days })]);
  fillSelect($("retentionSelect"), retention, days);
  const warn = state.press.settings.pickupWarnHours;
  const hours = [6, 12, 18, 22];
  if (!hours.includes(warn)) hours.push(warn);
  fillSelect($("warnSelect"), hours.sort((a, b) => a - b).map((n) => [n, t("warn_hours_n", { n })]), warn);
  $("settingsMsg").textContent = "";
}
async function saveSettings() {
  const msg = $("settingsMsg");
  msg.textContent = "";
  try {
    const next = await api("/api/settings", { method: "POST", body: JSON.stringify({ retentionDays: Number($("retentionSelect").value), pickupWarnHours: Number($("warnSelect").value) }) });
    state.press.settings = next;
    toast(t("saved"), "");
    await loadStatus();
  } catch (err) {
    msg.textContent = err.message;
  }
}
async function deleteCurrentCase() {
  const c = state.detail;
  if (!c || !confirm(EDITION === "press" ? t("del_confirm") : t("del_confirm_c", { n: c.caseNumber || "" }))) return;
  try {
    await api(`/api/cases/${encodeURIComponent(c.id)}`, { method: "DELETE" });
    state.detail = null;
    toast(t("del_done"), c.caseNumber || "");
    await loadCases();
    location.hash = "#/cazuri";
  } catch (err) {
    toast(t("open_fail"), err.message);
  }
}
function exportCurrentCase() {
  const c = state.detail;
  if (!c) return;
  const a = document.createElement("a");
  a.href = `/api/cases/${encodeURIComponent(c.id)}/export`;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast(t("exp_done"), c.caseNumber || "");
}
function downloadQr() {
  if (!state.me) return;
  const a = document.createElement("a");
  a.href = state.me.qrDataUrlLarge || state.me.qrDataUrl;
  a.download = t("web_png_name");
  document.body.appendChild(a);
  a.click();
  a.remove();
}
async function copyEmbed() {
  if (!state.me) return;
  const src = state.me.qrDataUrlLarge || state.me.qrDataUrl;
  const html = `<figure style="margin:0;max-width:260px;font-family:sans-serif"><img src="${src}" alt="${esc(t("web_alt"))}" width="240" height="240" style="display:block"><figcaption style="font-size:14px;line-height:1.4">${esc(t("web_caption"))}</figcaption></figure>`;
  try { await navigator.clipboard.writeText(html); toast(t("web_embed_ok"), t("web_embed_ok_sub")); }
  catch { toast(t("selected"), t("selected_sub")); }
}

/* ───────── rendering: overview + list ───────── */
function render() {
  const r = state.route.name;
  if (r === "overview") renderOverview();
  else if (r === "cases") renderCasesView();
}

function matchesFilter(c) {
  const f = state.filter.trim().toLowerCase();
  return !f || (c.caseNumber || "").toLowerCase().includes(f) || (c.category || "").toLowerCase().includes(f) || (c.rechercheName || "").toLowerCase().includes(f);
}
function tabList(cases) {
  const f = cases.filter(matchesFilter);
  if (state.tab === "open") return f.filter((c) => c.status !== "closed");
  if (state.tab === "new") return f.filter((c) => c.status === "new");
  if (state.tab === "in_progress") return f.filter((c) => c.status === "in_progress");
  if (state.tab === "closed") return f.filter((c) => c.status === "closed");
  return f;
}
function renderTabs(el) {
  const all = state.cases.filter(matchesFilter);
  const n = {
    open: all.filter((c) => c.status !== "closed").length,
    new: all.filter((c) => c.status === "new").length,
    in_progress: all.filter((c) => c.status === "in_progress").length,
    closed: all.filter((c) => c.status === "closed").length,
  };
  const defs = [["open", t("tab_open")], ["new", t("tab_new")], ["in_progress", t("tab_progress")], ["closed", t("tab_closed")]];
  el.innerHTML = defs.map(([k, l]) => `<button type="button" data-tab="${k}" class="${state.tab === k ? "on" : ""}">${l} ${n[k]}</button>`).join("");
}

function rowHtml(c) {
  const nd = nextDeadline(c);
  const u = urgency(nd);
  const unread = isUnread(c);
  const rtag = c.rechercheName ? `<span class="rtag" title="${esc(c.rechercheName)}">${esc(c.rechercheName)}</span>` : "";
  const cat = rtag + (c.category ? esc(c.category) : `<span style="color:var(--dim)">${t("uncategorised_l")}</span>`);
  const deadline = nd.kind === "closed"
    ? `<div class="dl"><span class="dlt none">${t("dl_closed")}</span></div>`
    : `<div class="dl"><span class="dlt ${u.cls}">${esc(u.text)}</span><span class="dll">${nd.label}</span></div><div class="bar"><i class="${u.cls}" style="width:${Math.round(u.progress * 100)}%"></i></div>`;
  const press = EDITION === "press";
  const rowCls = ["case-row", !press && nd.kind !== "closed" && u.cls === "red" ? "r-red" : "", !press && nd.kind !== "closed" && u.cls === "amber" ? "r-amber" : "", unread ? "unread" : ""].join(" ");
  return `<tr class="${rowCls}" data-id="${esc(c.id)}">
    <td class="nr">${unread ? `<span class="unread-dot" title="${t("unread")}"></span>` : ""}${c.caseNumber ? esc(c.caseNumber) : "—"}${c.signalPending ? `<span class="mark" title="${t("sending_t")}">${t("sending")}</span>` : ""}</td>
    <td><span class="pill ${c.status}">${esc(statusLabel(c.status))}</span></td>
    <td>${cat}</td>
    <td class="dim">${fmtDay(c.openedAt)}</td>
    <td class="col-dl">${deadline}</td>
    <td class="dim">${ago(c.lastActivityAt)}</td>
  </tr>`;
}

function bindRows(body) {
  for (const tr of body.querySelectorAll("tr.case-row")) tr.addEventListener("click", () => { location.hash = `#/caz/${encodeURIComponent(tr.dataset.id)}`; });
}

function renderOverview() {
  const cases = state.cases;
  const hasCases = cases.length > 0;
  $("startCard").classList.toggle("hidden", hasCases);
  $("overviewGrid").classList.toggle("hidden", !hasCases);
  renderKpis();
  if (!hasCases) return;

  renderTabs($("tabsOverview"));
  const list = sortedByUrgency(tabList(cases));
  const shown = list.slice(0, 8);
  const body = $("casesBodyOverview");
  body.innerHTML = shown.length ? shown.map(rowHtml).join("") : `<tr><td colspan="6" class="empty">${t("none_in_tab")}</td></tr>`;
  bindRows(body);
  $("allCasesLink").textContent = list.length > shown.length ? t("shown_of", { a: shown.length, b: list.length }) : t("all_cases");

  renderNext();
  renderCategories();
  renderWeeks();
}

function renderKpis() {
  const cases = state.cases;
  const open = cases.filter((c) => c.status !== "closed");
  const weekAgo = Date.now() - 7 * DAY;
  const newWeek = cases.filter((c) => c.openedAt >= weekAgo).length;

  const unack = open.filter((c) => !c.acknowledgedAt).sort((a, b) => a.ackDueAt - b.ackDueAt);
  const ackNext = unack[0];
  const ackU = ackNext ? urgency(nextDeadline(ackNext)) : null;

  const waiting = open.filter((c) => c.acknowledgedAt).sort((a, b) => a.feedbackDueAt - b.feedbackDueAt);
  const fbNext = waiting[0];
  const fbU = fbNext ? urgency(nextDeadline(fbNext)) : null;

  const year = new Date().getFullYear();
  const closed = cases.filter((c) => c.status === "closed" && c.closedAt && new Date(c.closedAt).getFullYear() === year);
  const avg = closed.length ? Math.round(closed.reduce((s, c) => s + (c.closedAt - c.openedAt), 0) / closed.length / DAY) : null;

  if (EDITION === "press") {
    const kp = (cls, l, v, small, s) => `<div class="kpi ${cls}"><div class="l">${l}</div><div class="v">${v}${small ? ` <small>${small}</small>` : ""}</div><div class="s">${s}</div></div>`;
    const days = state.press ? state.press.settings.retentionDays : 0;
    const okAt = state.lastOkAt || (state.press && state.press.lastOkPollAt);
    const total = cases.length;
    $("kpis").innerHTML = [
      kp("", t("kp_open"), open.length, "", total === 0 ? t("k_none") : t("k_new7", { n: newWeek, w: newWeek === 1 ? t("k_new_one") : t("k_new_many") })),
      kp("", t("kp_pickup"), okAt ? shortAgo(Date.now() - okAt) : "—", "", okAt ? ago(okAt) : t("kp_none_yet")),
      kp("", t("kp_keep"), days > 0 ? days : "∞", days > 0 ? t("unit_days") : "", days > 0 ? t("set_keep_label") : t("kp_forever")),
      kp("", t("k_closed", { y: year }), closed.length, "", avg === null ? t("k_closed_none") : t("k_avg", { n: avg, u: avg === 1 ? t("unit_day") : t("unit_days") })),
    ].join("");
    return;
  }
  const kpi = (cls, l, v, small, s) => `<div class="kpi ${cls}"><div class="l">${l}</div><div class="v">${v}${small ? ` <small>${small}</small>` : ""}</div><div class="s">${s}</div></div>`;
  $("kpis").innerHTML = [
    kpi("", t("k_open"), open.length, "", cases.length === 0 ? t("k_none") : t("k_new7", { n: newWeek, w: newWeek === 1 ? t("k_new_one") : t("k_new_many") })),
    ackNext
      ? kpi(ackU.cls === "red" ? "red" : ackU.cls === "amber" ? "amber" : "", t("k_ack"), unack.length, esc(ackU.text), t("k_ack_s"))
      : kpi("green", t("k_ack"), "0", t("k_ack_done"), t("k_ack_s")),
    fbNext
      ? kpi(fbU.cls === "red" ? "red" : fbU.cls === "amber" ? "amber" : "", t("k_fb"), waiting.length, esc(fbU.text), t("k_fb_s"))
      : kpi("", t("k_fb"), "0", "", t("k_fb_s")),
    kpi("", t("k_closed", { y: year }), closed.length, "", avg === null ? t("k_closed_none") : t("k_avg", { n: avg, u: avg === 1 ? t("unit_day") : t("unit_days") })),
  ].join("");
}

function renderNext() {
  const items = state.cases
    .filter((c) => c.status !== "closed")
    .map((c) => { const nd = nextDeadline(c); return { c, nd, u: urgency(nd) }; })
    .sort((a, b) => a.nd.due - b.nd.due)
    .slice(0, 4);
  $("nextList").innerHTML = items.length
    ? items.map(({ c, nd, u }) => {
        const d = new Date(Math.max(nd.due, 0));
        const sub = u.mode === "overdue" ? u.text[0].toUpperCase() + u.text.slice(1) : u.mode === "today" ? t("today") : t("still", { d: u.dayText });
        return `<div class="nx" data-id="${esc(c.id)}"><div class="d ${u.cls}">${d.getDate()}<small>${t("months")[d.getMonth()]}</small></div><div><b>${nd.title} · ${esc(c.caseNumber || c.id.slice(0, 8))}</b><span>${sub}</span></div></div>`;
      }).join("")
    : `<p class="empty">${t("no_deadline")}</p>`;
  for (const n of $("nextList").querySelectorAll(".nx")) n.addEventListener("click", () => { location.hash = `#/caz/${encodeURIComponent(n.dataset.id)}`; });
}

function renderCategories() {
  const counts = new Map();
  for (const c of state.cases) { const k = c.category && c.category.trim() ? c.category.trim() : t("uncategorised"); counts.set(k, (counts.get(k) || 0) + 1); }
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = Math.max(1, ...rows.map((r) => r[1]));
  $("cats").innerHTML = rows.map(([n, v]) => `<div class="cat"><span title="${esc(n)}">${esc(n)}</span><div class="cb"><i style="width:${Math.round((v / max) * 100)}%"></i></div><b>${v}</b></div>`).join("");
}

function renderWeeks() {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const start = new Date(monday); start.setDate(start.getDate() - i * 7);
    const end = new Date(start); end.setDate(end.getDate() + 7);
    weeks.push({ start, end, n: state.cases.filter((c) => c.openedAt >= start.getTime() && c.openedAt < end.getTime()).length });
  }
  const max = Math.max(1, ...weeks.map((w) => w.n));
  $("weeks").innerHTML = weeks.map((w) => `<div class="wk"><div class="wb"><i style="height:${w.n ? Math.round((w.n / max) * 100) : 4}%"></i></div><span>${w.n}</span><em>${w.start.getDate()} ${t("months")[w.start.getMonth()]}</em></div>`).join("");
  $("weeksNote").textContent = t("weeks_note", { n: weeks.reduce((s, w) => s + w.n, 0) });
}

function renderCasesView() {
  renderTabs($("tabsCases"));
  const list = sortedByUrgency(tabList(state.cases));
  const body = $("casesBodyAll");
  body.innerHTML = list.map(rowHtml).join("");
  bindRows(body);
  $("noCases").classList.toggle("hidden", state.cases.length > 0);
  $("casesFoot").textContent = state.cases.length ? t("cases_foot", { a: list.length, b: state.cases.length }) : "";
}

/* ───────── case detail ───────── */
async function openDetail(id, scrollDown) {
  try {
    const c = await api(`/api/cases/${encodeURIComponent(id)}`);
    const first = !state.detail || state.detail.id !== id;
    const prev = state.detail;
    state.detail = c;
    markSeen(c.id, c.lastActivityAt);
    $("pageTitle").textContent = t("case_title", { c: c.caseNumber || c.id.slice(0, 8) });
    $("pageSub").textContent = t("opened_at", { t: fmtDateTime(c.openedAt) });
    renderDetailSide(c, first);
    if (first || !prev || prev.messages.length !== c.messages.length) renderThread(c.messages, first || scrollDown);
  } catch (err) {
    toast(t("open_fail"), err.message);
    location.hash = "#/cazuri";
  }
}

function renderDetailSide(c, first) {
  for (const b of $("statusSeg").querySelectorAll("button")) b.classList.toggle("on", b.dataset.status === c.status);
  if (first) $("statusDelivery").textContent = c.signalPending ? t("delivery_pending") : "";
  const input = $("categoryInput");
  if (first || document.activeElement !== input) input.value = c.category || "";
  const known = new Set([...categorySuggestions(), ...state.cases.map((x) => x.category).filter(Boolean)]);
  $("categoryList").innerHTML = [...known].map((k) => `<option value="${esc(k)}"></option>`).join("");
  $("categoryChips").innerHTML = categorySuggestions().map((k) => `<button type="button" data-cat="${esc(k)}">${esc(k)}</button>`).join("");

  const ack = { kind: "ack", title: t("dl_ack_title"), due: c.ackDueAt, from: c.openedAt, amberDays: 3 };
  const fb = { kind: "feedback", title: t("dl_fb_title"), due: c.feedbackDueAt, from: c.openedAt, amberDays: 14 };
  const row = (nd, done, doneText) => {
    if (done) return `<div class="dlrow"><div class="dl"><span class="dlt green">${doneText}</span><span class="dll">${nd.title}</span></div><div class="bar"><i class="green" style="width:100%"></i></div></div>`;
    const u = urgency(nd);
    return `<div class="dlrow"><div class="dl"><span class="dlt ${u.cls}">${esc(u.text)}</span><span class="dll">${nd.title} · ${t("until", { d: fmtDay(nd.due) })}</span></div><div class="bar"><i class="${u.cls}" style="width:${Math.round(u.progress * 100)}%"></i></div></div>`;
  };
  $("detailDeadlines").innerHTML =
    row(ack, Boolean(c.acknowledgedAt), c.acknowledgedAt ? t("sent_on", { d: fmtDay(c.acknowledgedAt) }) : "") +
    row(fb, c.status === "closed", c.closedAt ? t("closed_on", { d: fmtDay(c.closedAt) }) : t("closed_word"));

  $("facts").innerHTML = [
    [t("f_nr"), `<code>${esc(c.caseNumber || "—")}</code>`],
    [t("f_opened"), fmtDateTime(c.openedAt)],
    [t("f_last"), fmtDateTime(c.lastActivityAt)],
    [t("f_msgs"), String(c.messages.length)],
    ...(EDITION === "press" ? [[t("f_recherche"), c.rechercheName ? esc(c.rechercheName) : esc(t("rech_general"))]] : []),
    [t("f_identity"), t("f_unknown")],
  ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  $("convoNote").textContent = c.messages.length ? `${c.messages.length} ${c.messages.length === 1 ? t("msg_1") : t("msg_n")}` : "";
}

function renderThread(messages, forceBottom) {
  const thread = $("thread");
  const atBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 60;
  thread.innerHTML = messages.length
    ? messages.map((m) => `<div class="msg ${m.direction}">${esc(m.text)}<div class="meta">${m.direction === "in" ? t("reporter") : t("you")} · ${fmtDateTime(m.createdAt)}</div></div>`).join("")
    : `<div class="none">${t("thread_none")}</div>`;
  if (forceBottom || atBottom) thread.scrollTop = thread.scrollHeight;
}

async function setStatus(status) {
  const c = state.detail;
  if (!c || c.status === status) return;
  state.ownTouch.add(c.id);
  $("statusDelivery").textContent = t("sending_dots");
  try {
    const r = await api(`/api/cases/${encodeURIComponent(c.id)}/status`, { method: "POST", body: JSON.stringify({ status }) });
    $("statusDelivery").textContent = ({
      sent: t("dv_sent"),
      "no-chain": t("dv_nochain"),
      failed: t("dv_failed"),
      "not-sent": "",
    })[r.delivery] || "";
    await openDetail(c.id, false);
    await loadCases();
  } catch (err) {
    $("statusDelivery").textContent = err.message;
  }
}

async function saveCategory(value) {
  const c = state.detail;
  if (!c || (c.category || "") === value.trim()) return;
  state.ownTouch.add(c.id);
  await api(`/api/cases/${encodeURIComponent(c.id)}/category`, { method: "POST", body: JSON.stringify({ category: value.trim() }) });
  await openDetail(c.id, false);
  await loadCases();
}

async function sendReply() {
  const c = state.detail;
  const input = $("replyInput");
  const errorEl = $("replyError");
  const btn = $("sendReplyBtn");
  errorEl.textContent = "";
  if (!c || !input.value.trim()) return;
  btn.disabled = true;
  state.ownTouch.add(c.id);
  try {
    const result = await api(`/api/cases/${encodeURIComponent(c.id)}/reply`, { method: "POST", body: JSON.stringify({ text: input.value }) });
    if (result.result === "no-chain") errorEl.textContent = t("r_nochain");
    else if (!result.sent) errorEl.textContent = t("r_notconfirmed");
    // Keep the text when it did not go out, so nothing typed is lost during a live demo.
    if (result.sent) input.value = "";
    state.detail.messages = result.messages;
    renderThread(result.messages, true);
    markSeen(c.id, Date.now());
    await openDetail(c.id, true);
    await loadCases();
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

/* ───────── actions ───────── */
async function copyCode() {
  const text = state.me ? state.me.pairingCode : "";
  if (!text) return;
  try { await navigator.clipboard.writeText(text); toast(t("copied"), t("copied_sub")); }
  catch { location.hash = "#/cod"; const box = $("myCode"); box.focus(); box.select(); toast(t("selected"), t("selected_sub")); }
}
function showQr() {
  if (!state.me) return;
  $("qrModalImg").src = state.me.qrDataUrlLarge || state.me.qrDataUrl;
  $("qrModal").classList.remove("hidden");
}
function hideQr() { $("qrModal").classList.add("hidden"); }

document.addEventListener("click", (e) => {
  const act = e.target.closest("[data-action]");
  if (act) { if (act.dataset.action === "copyCode") copyCode(); if (act.dataset.action === "showQr") showQr(); if (act.dataset.action === "downloadQr") downloadQr(); if (act.dataset.action === "copyEmbed") copyEmbed(); }
  const tab = e.target.closest("[data-tab]");
  if (tab) { state.tab = tab.dataset.tab; render(); }
  const seg = e.target.closest("#statusSeg button");
  if (seg) setStatus(seg.dataset.status);
  const chip = e.target.closest("#categoryChips button");
  if (chip) { $("categoryInput").value = chip.dataset.cat; saveCategory(chip.dataset.cat).catch((err) => toast(t("cat_fail"), err.message)); }
});
$("qrModal").addEventListener("click", hideQr);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideQr(); });

$("refreshBtn").addEventListener("click", async () => { await Promise.all([loadCases(), loadStatus()]); if (state.route.name === "detail") openDetail(state.route.id, false); });
$("search").addEventListener("input", (e) => {
  state.filter = e.target.value;
  if (state.route.name === "overview" || state.route.name === "cases") { if (state.filter && state.route.name === "overview") location.hash = "#/cazuri"; else render(); }
});
$("categoryInput").addEventListener("change", (e) => saveCategory(e.target.value).catch((err) => toast(t("cat_fail"), err.message)));
$("categoryInput").addEventListener("keydown", (e) => { if (e.key === "Enter") e.target.blur(); });
$("sendReplyBtn").addEventListener("click", sendReply);
$("deleteCaseBtn").addEventListener("click", deleteCurrentCase);
$("exportCaseBtn").addEventListener("click", exportCurrentCase);
$("saveSettingsBtn").addEventListener("click", saveSettings);
$("pickupWarnClose").addEventListener("click", () => { state.dismissedWarn.add($("pickupWarn").dataset.key); $("pickupWarn").classList.add("hidden"); });
$("replyInput").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendReply(); } });
$("addCaseBtn").addEventListener("click", async () => {
  const input = $("pasteInput");
  const errorEl = $("addCaseError");
  errorEl.textContent = "";
  try {
    await api("/api/cases", { method: "POST", body: JSON.stringify({ pastedCode: input.value }) });
    input.value = "";
    await loadCases();
    toast(t("added"), t("added_sub"));
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

/* ───────── unpruuf Press: a code per research ───────── */
async function loadRecherchen() {
  if (EDITION !== "press") return;
  state.recherchen = await api("/api/recherchen");
  $("navRech").textContent = String(state.recherchen.recherchen.length);
}
const rechTipCount = (id) => state.cases.filter((c) => c.rechercheId === id).length;
const rechTipText = (n) => (n === 1 ? t("rech_tips_1") : t("rech_tips_n", { n }));
function renderRecherchen() {
  const d = state.recherchen;
  const box = $("rechList");
  if (!d) { box.innerHTML = ""; return; }
  $("rechNone").classList.toggle("hidden", d.recherchen.length > 0);
  box.innerHTML = d.recherchen.length ? `<div class="rech-grid">${d.recherchen.map((r) => `
    <div class="card rech${r.active ? "" : " off"}" data-rid="${esc(r.id)}">
      <div class="top"><h3>${esc(r.name)}</h3><span class="pill ${r.active ? "active" : "paused"}">${esc(r.active ? t("rech_active") : t("rech_paused"))}</span></div>
      <div class="body">
        <img src="${r.qrDataUrl}" alt="${esc(r.name)}" data-rshow="${esc(r.id)}" />
        <div class="acts">
          <span class="dimn" data-rcount="${esc(r.id)}">${esc(rechTipText(rechTipCount(r.id)))}</span>
          <button class="btn small" type="button" data-rcopy="${esc(r.id)}">${esc(t("rech_copy"))}</button>
          <button class="btn small" type="button" data-rshow="${esc(r.id)}">${esc(t("rech_show"))}</button>
          <button class="btn small" type="button" data-rpng="${esc(r.id)}">${esc(t("rech_png"))}</button>
          <button class="btn small" type="button" data-rrename="${esc(r.id)}">${esc(t("rech_rename"))}</button>
          <button class="btn small" type="button" data-rtoggle="${esc(r.id)}">${esc(r.active ? t("rech_pause") : t("rech_resume"))}</button>
        </div>
      </div>
      ${r.active ? "" : `<p class="note small">${esc(t("rech_pause_note"))}</p>`}
    </div>`).join("")}</div>` : "";
}
/** Tip counts change while the page is open: update the text only, so the images do not flicker. */
function updateRechCounts() {
  if (state.route.name !== "recherchen") return;
  for (const el of document.querySelectorAll("[data-rcount]")) el.textContent = rechTipText(rechTipCount(el.dataset.rcount));
}
async function createRecherche() {
  const input = $("rechName"), err = $("rechErr");
  err.textContent = "";
  try {
    await api("/api/recherchen", { method: "POST", body: JSON.stringify({ name: input.value }) });
    input.value = "";
    await loadRecherchen();
    renderRecherchen();
  } catch (e) {
    err.textContent = e.message;
  }
}
async function updateRecherche(id, patch) {
  try {
    await api(`/api/recherchen/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify(patch) });
    await loadRecherchen();
    renderRecherchen();
  } catch (e) {
    toast(t("open_fail"), e.message);
  }
}
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-rcopy],[data-rshow],[data-rpng],[data-rrename],[data-rtoggle]");
  if (!el || !state.recherchen) return;
  const id = el.dataset.rcopy || el.dataset.rshow || el.dataset.rpng || el.dataset.rrename || el.dataset.rtoggle;
  const r = state.recherchen.recherchen.find((x) => x.id === id);
  if (!r) return;
  if (el.dataset.rcopy) {
    try { await navigator.clipboard.writeText(r.pairingCode); toast(t("rech_copied"), r.name); }
    catch { toast(t("selected"), t("selected_sub")); }
  } else if (el.dataset.rshow) {
    $("qrModalImg").src = r.qrDataUrlLarge;
    $("qrModal").classList.remove("hidden");
  } else if (el.dataset.rpng) {
    const a = document.createElement("a");
    a.href = r.qrDataUrlLarge;
    a.download = "qr-" + (r.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w-]+/g, "_").slice(0, 40) || "recherche") + ".png";
    document.body.appendChild(a); a.click(); a.remove();
  } else if (el.dataset.rrename) {
    const name = prompt(t("rech_rename_prompt"), r.name);
    if (name !== null && name.trim() && name.trim() !== r.name) await updateRecherche(id, { name });
  } else if (el.dataset.rtoggle) {
    await updateRecherche(id, { active: !r.active });
  }
});
$("rechCreateBtn").addEventListener("click", createRecherche);
$("rechName").addEventListener("keydown", (e) => { if (e.key === "Enter") createRecherche(); });
window.addEventListener("hashchange", route);
for (const b of document.querySelectorAll("#langSwitch button")) {
  b.addEventListener("click", async () => {
    LANG = b.dataset.lang;
    try { localStorage.setItem("lang", LANG); } catch { /* no storage: lasts until reload */ }
    applyStaticI18n();
    await Promise.all([loadStatus(), route()]);
  });
}

/* ───────── start ───────── */
(async function start() {
  await loadEdition();
  applyStaticI18n();
  await Promise.all([loadMe().catch(() => {}), loadCases().catch(() => {}), loadStatus(), loadRecherchen().catch(() => {})]);
  // First visit from this browser: cases that already exist are not "new" to the officer.
  try { if (localStorage.getItem("seenAt") === null) { for (const c of state.cases) markSeen(c.id, c.lastActivityAt); localStorage.setItem("seenAt", JSON.stringify(seenMap())); } } catch { /* no storage: skip */ }
  await route();
  // Live: the demo depends on a new case or message showing up within seconds.
  setInterval(async () => {
    try {
      await loadCases();
      updateRechCounts();
      if (state.route.name === "detail" && state.detail) await openDetail(state.route.id, false);
    } catch { /* relay or app briefly busy: next tick */ }
  }, 3000);
  setInterval(loadStatus, 5000);
})();
