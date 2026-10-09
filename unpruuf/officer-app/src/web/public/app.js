/* Panoul ofițerului. Vanilla JS, no build step. Talks to the JSON API in ../app.ts. */
"use strict";

const DAY = 24 * 60 * 60 * 1000;
const MONTHS = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "noi", "dec"];
const WEEKDAYS = ["duminică", "luni", "marți", "miercuri", "joi", "vineri", "sâmbătă"];
const MONTHS_LONG = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"];
const CATEGORY_SUGGESTIONS = ["Abateri financiare", "Hărțuire", "Achiziții", "Conflict de interese", "Date personale", "Altele"];
const STATUS_LABEL = { new: "Nou", acknowledged: "Confirmat", in_progress: "În lucru", closed: "Închis" };

const $ = (id) => document.getElementById(id);
const state = {
  route: { name: "overview", id: null },
  cases: [],
  me: null,
  tab: "open",
  filter: "",
  detail: null, // the open case incl. messages
  previous: null, // id -> lastActivityAt, for "new case" toasts
  ownTouch: new Set(), // case ids this officer just changed (no toast for those)
};

/* ───────── helpers ───────── */
async function api(path, options) {
  const res = await fetch(path, { headers: { "content-type": "application/json" }, ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
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
  const t = d.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${t}`;
}
function fmtDay(ms) {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 45) return "acum câteva secunde";
  const m = Math.round(s / 60);
  if (m < 60) return m === 1 ? "acum 1 minut" : `acum ${m} minute`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? "acum 1 oră" : `acum ${h} ore`;
  const d = Math.round(h / 24);
  if (d === 1) return "ieri";
  return `acum ${d} zile`;
}
function daysWord(n) { return n === 1 ? "1 zi" : `${n} zile`; }

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
  if (c.status === "closed") return { kind: "closed", label: "Închis", due: null, from: null };
  if (!c.acknowledgedAt) return { kind: "ack", label: "Confirmare", title: "Confirmare de primire", due: c.ackDueAt, from: c.openedAt, amberDays: 3 };
  return { kind: "feedback", label: "Răspuns", title: "Răspuns către raportor", due: c.feedbackDueAt, from: c.openedAt, amberDays: 14 };
}
function urgency(nd) {
  if (!nd.due) return { cls: "none", text: "—", days: Infinity, progress: 1 };
  const remaining = nd.due - Date.now();
  const days = Math.ceil(remaining / DAY);
  let cls = "green";
  if (remaining <= 0 || remaining < DAY) cls = "red";
  else if (days <= nd.amberDays) cls = "amber";
  const text = remaining <= 0 ? `întârziat cu ${daysWord(Math.max(1, Math.ceil(-remaining / DAY)))}` : remaining < DAY ? "Azi" : `în ${daysWord(days)}`;
  const span = nd.due - nd.from;
  const progress = span > 0 ? Math.min(1, Math.max(0, (Date.now() - nd.from) / span)) : 1;
  return { cls, text, days: remaining / DAY, progress };
}
function sortedByUrgency(list) {
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
  if (h.startsWith("caz/")) return { name: "detail", id: decodeURIComponent(h.slice(4)) };
  return { name: "overview", id: null };
}
const TITLES = { overview: "Prezentare generală", cases: "Cazuri", code: "Codul organizației", detail: "Caz" };

async function route() {
  state.route = parseRoute();
  const r = state.route.name;
  for (const v of ["overview", "cases", "code", "detail"]) $(`v-${v}`).classList.toggle("hidden", v !== r);
  for (const a of document.querySelectorAll(".nav")) a.classList.toggle("on", a.dataset.route === (r === "detail" ? "cases" : r));
  $("pageTitle").textContent = TITLES[r];
  $("pageSub").textContent = r === "overview" ? todayLong() : r === "code" ? "Un singur cod pentru toată organizația" : r === "cases" ? "Toate sesizările primite" : "";
  state.detail = null;
  if (r === "detail") await openDetail(state.route.id, true);
  else render();
  window.scrollTo({ top: 0 });
}
function todayLong() {
  const d = new Date();
  return `${WEEKDAYS[d.getDay()][0].toUpperCase() + WEEKDAYS[d.getDay()].slice(1)}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
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
      if (before === undefined) toast(`Caz nou: ${c.caseNumber || c.id.slice(0, 8)}`, "A sosit o sesizare nouă.", c.id);
      else if (c.lastActivityAt > before && !open) toast(`Mesaj nou în cazul ${c.caseNumber || c.id.slice(0, 8)}`, "Raportorul a scris.", c.id);
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
    const dot = $("connDot");
    dot.className = "dot";
    if (s.lastPollAt === null) {
      dot.classList.add("wait");
      $("connTitle").textContent = "Se conectează…";
      $("connText").textContent = "Prima verificare a releului urmează.";
    } else if (s.lastPollOk) {
      $("connTitle").textContent = s.viaTor ? "Conectat prin Tor" : "Conectat (direct, fără Tor)";
      $("connText").textContent = `Releul răspunde. Ultima verificare: ${ago(s.lastPollAt)}. Baza de date a cazurilor este criptată.`;
    } else {
      dot.classList.add("bad");
      $("connTitle").textContent = "Releul nu răspunde";
      $("connText").textContent = "Se reîncearcă automat. Verifică fereastra serverului dacă persistă.";
    }
  } catch {
    $("connDot").className = "dot bad";
    $("connTitle").textContent = "Panoul nu răspunde";
    $("connText").textContent = "Aplicația ofițerului rulează încă?";
  }
}

/* ───────── rendering: overview + list ───────── */
function render() {
  const r = state.route.name;
  if (r === "overview") renderOverview();
  else if (r === "cases") renderCasesView();
}

function matchesFilter(c) {
  const f = state.filter.trim().toLowerCase();
  return !f || (c.caseNumber || "").toLowerCase().includes(f) || (c.category || "").toLowerCase().includes(f);
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
  const defs = [["open", "Deschise"], ["new", "Noi"], ["in_progress", "În lucru"], ["closed", "Închise"]];
  el.innerHTML = defs.map(([k, l]) => `<button type="button" data-tab="${k}" class="${state.tab === k ? "on" : ""}">${l} ${n[k]}</button>`).join("");
}

function rowHtml(c) {
  const nd = nextDeadline(c);
  const u = urgency(nd);
  const unread = isUnread(c);
  const cat = c.category ? esc(c.category) : '<span style="color:var(--dim)">necategorizat</span>';
  const deadline = nd.kind === "closed"
    ? '<div class="dl"><span class="dlt none">Închis</span></div>'
    : `<div class="dl"><span class="dlt ${u.cls}">${esc(u.text)}</span><span class="dll">${nd.label}</span></div><div class="bar"><i class="${u.cls}" style="width:${Math.round(u.progress * 100)}%"></i></div>`;
  const rowCls = ["case-row", nd.kind !== "closed" && u.cls === "red" ? "r-red" : "", nd.kind !== "closed" && u.cls === "amber" ? "r-amber" : "", unread ? "unread" : ""].join(" ");
  return `<tr class="${rowCls}" data-id="${esc(c.id)}">
    <td class="nr">${unread ? '<span class="unread-dot" title="Activitate nouă"></span>' : ""}${c.caseNumber ? esc(c.caseNumber) : "—"}${c.signalPending ? '<span class="mark" title="Confirmarea/actualizarea așteaptă să poată fi trimisă">se trimite</span>' : ""}</td>
    <td><span class="pill ${c.status}">${STATUS_LABEL[c.status] || esc(c.status)}</span></td>
    <td>${cat}</td>
    <td class="dim">${fmtDay(c.openedAt)}</td>
    <td>${deadline}</td>
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
  body.innerHTML = shown.length ? shown.map(rowHtml).join("") : '<tr><td colspan="6" class="empty">Niciun caz în această categorie.</td></tr>';
  bindRows(body);
  $("allCasesLink").textContent = list.length > shown.length ? `Se afișează ${shown.length} din ${list.length}. Toate cazurile` : "Toate cazurile";

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

  const kpi = (cls, l, v, small, s) => `<div class="kpi ${cls}"><div class="l">${l}</div><div class="v">${v}${small ? ` <small>${small}</small>` : ""}</div><div class="s">${s}</div></div>`;
  $("kpis").innerHTML = [
    kpi("", "Cazuri deschise", open.length, "", cases.length === 0 ? "Încă nicio sesizare" : `${newWeek} ${newWeek === 1 ? "nouă" : "noi"} în ultimele 7 zile`),
    ackNext
      ? kpi(ackU.cls === "red" ? "red" : ackU.cls === "amber" ? "amber" : "", "Confirmare de primire", unack.length, esc(ackU.text), "Termen legal: 7 zile de la primire")
      : kpi("green", "Confirmare de primire", "0", "totul confirmat", "Termen legal: 7 zile de la primire"),
    fbNext
      ? kpi(fbU.cls === "red" ? "red" : fbU.cls === "amber" ? "amber" : "", "Răspuns către raportor", waiting.length, esc(fbU.text), "Termen: 3 luni (90 de zile) de la primire")
      : kpi("", "Răspuns către raportor", "0", "", "Termen: 3 luni (90 de zile) de la primire"),
    kpi("", `Închise în ${year}`, closed.length, "", avg === null ? "Încă niciun caz închis" : `Timp mediu până la închidere: ${avg} ${avg === 1 ? "zi" : "zile"}`),
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
        const sub = u.cls === "red" && nd.due - Date.now() <= 0 ? u.text[0].toUpperCase() + u.text.slice(1) : u.text === "Azi" ? "Azi" : `Încă ${u.text.replace(/^în /, "")}`;
        return `<div class="nx" data-id="${esc(c.id)}"><div class="d ${u.cls}">${d.getDate()}<small>${MONTHS[d.getMonth()]}</small></div><div><b>${nd.title} · ${esc(c.caseNumber || c.id.slice(0, 8))}</b><span>${sub}</span></div></div>`;
      }).join("")
    : '<p class="empty">Niciun termen deschis.</p>';
  for (const n of $("nextList").querySelectorAll(".nx")) n.addEventListener("click", () => { location.hash = `#/caz/${encodeURIComponent(n.dataset.id)}`; });
}

function renderCategories() {
  const counts = new Map();
  for (const c of state.cases) { const k = c.category && c.category.trim() ? c.category.trim() : "Necategorizat"; counts.set(k, (counts.get(k) || 0) + 1); }
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
  $("weeks").innerHTML = weeks.map((w) => `<div class="wk"><div class="wb"><i style="height:${w.n ? Math.round((w.n / max) * 100) : 4}%"></i></div><span>${w.n}</span><em>${w.start.getDate()} ${MONTHS[w.start.getMonth()]}</em></div>`).join("");
  $("weeksNote").textContent = `ultimele 8 săptămâni · ${weeks.reduce((s, w) => s + w.n, 0)} în total`;
}

function renderCasesView() {
  renderTabs($("tabsCases"));
  const list = sortedByUrgency(tabList(state.cases));
  const body = $("casesBodyAll");
  body.innerHTML = list.map(rowHtml).join("");
  bindRows(body);
  $("noCases").classList.toggle("hidden", state.cases.length > 0);
  $("casesFoot").textContent = state.cases.length ? `Se afișează ${list.length} din ${state.cases.length} cazuri · sortat după termen, cel mai urgent primul` : "";
}

/* ───────── case detail ───────── */
async function openDetail(id, scrollDown) {
  try {
    const c = await api(`/api/cases/${encodeURIComponent(id)}`);
    const first = !state.detail || state.detail.id !== id;
    const prev = state.detail;
    state.detail = c;
    markSeen(c.id, c.lastActivityAt);
    $("pageTitle").textContent = `Cazul ${c.caseNumber || c.id.slice(0, 8)}`;
    $("pageSub").textContent = `Deschis ${fmtDateTime(c.openedAt)}`;
    renderDetailSide(c, first);
    if (first || !prev || prev.messages.length !== c.messages.length) renderThread(c.messages, first || scrollDown);
  } catch (err) {
    toast("Cazul nu a putut fi deschis", err.message);
    location.hash = "#/cazuri";
  }
}

function renderDetailSide(c, first) {
  for (const b of $("statusSeg").querySelectorAll("button")) b.classList.toggle("on", b.dataset.status === c.status);
  if (first) $("statusDelivery").textContent = c.signalPending ? "Actualizarea pentru raportor așteaptă: se trimite automat imediat ce canalul permite (de obicei după primul mesaj al raportorului)." : "";
  const input = $("categoryInput");
  if (first || document.activeElement !== input) input.value = c.category || "";
  const known = new Set([...CATEGORY_SUGGESTIONS, ...state.cases.map((x) => x.category).filter(Boolean)]);
  $("categoryList").innerHTML = [...known].map((k) => `<option value="${esc(k)}"></option>`).join("");
  $("categoryChips").innerHTML = CATEGORY_SUGGESTIONS.map((k) => `<button type="button" data-cat="${esc(k)}">${esc(k)}</button>`).join("");

  const ack = { kind: "ack", title: "Confirmare de primire", due: c.ackDueAt, from: c.openedAt, amberDays: 3 };
  const fb = { kind: "feedback", title: "Răspuns către raportor", due: c.feedbackDueAt, from: c.openedAt, amberDays: 14 };
  const row = (nd, done, doneText) => {
    if (done) return `<div class="dlrow"><div class="dl"><span class="dlt green">${doneText}</span><span class="dll">${nd.title}</span></div><div class="bar"><i class="green" style="width:100%"></i></div></div>`;
    const u = urgency(nd);
    return `<div class="dlrow"><div class="dl"><span class="dlt ${u.cls}">${esc(u.text)}</span><span class="dll">${nd.title} · până la ${fmtDay(nd.due)}</span></div><div class="bar"><i class="${u.cls}" style="width:${Math.round(u.progress * 100)}%"></i></div></div>`;
  };
  $("detailDeadlines").innerHTML =
    row(ack, Boolean(c.acknowledgedAt), c.acknowledgedAt ? `trimisă ${fmtDay(c.acknowledgedAt)}` : "") +
    row(fb, c.status === "closed", c.closedAt ? `închis ${fmtDay(c.closedAt)}` : "închis");

  $("facts").innerHTML = [
    ["Număr de caz", `<code>${esc(c.caseNumber || "—")}</code>`],
    ["Deschis", fmtDateTime(c.openedAt)],
    ["Ultima activitate", fmtDateTime(c.lastActivityAt)],
    ["Mesaje", String(c.messages.length)],
    ["Identitate raportor", "nu este cunoscută"],
  ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  $("convoNote").textContent = c.messages.length ? `${c.messages.length} ${c.messages.length === 1 ? "mesaj" : "mesaje"}` : "";
}

function renderThread(messages, forceBottom) {
  const thread = $("thread");
  const atBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 60;
  thread.innerHTML = messages.length
    ? messages.map((m) => `<div class="msg ${m.direction}">${esc(m.text)}<div class="meta">${m.direction === "in" ? "raportor" : "tu"} · ${fmtDateTime(m.createdAt)}</div></div>`).join("")
    : '<div class="none">Încă niciun mesaj. Raportorul poate scrie din aplicație; răspunsul tău apare aici și la el.</div>';
  if (forceBottom || atBottom) thread.scrollTop = thread.scrollHeight;
}

async function setStatus(status) {
  const c = state.detail;
  if (!c || c.status === status) return;
  state.ownTouch.add(c.id);
  $("statusDelivery").textContent = "Se trimite…";
  try {
    const r = await api(`/api/cases/${encodeURIComponent(c.id)}/status`, { method: "POST", body: JSON.stringify({ status }) });
    $("statusDelivery").textContent = ({
      sent: "Starea a fost trimisă în aplicația raportorului.",
      "no-chain": "Starea va fi trimisă automat imediat ce raportorul scrie primul mesaj.",
      failed: "Releul nu a confirmat. Se reîncearcă automat.",
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
    if (result.result === "no-chain") errorEl.textContent = "Nu se poate trimite încă: canalul se deschide după primul mesaj al raportorului.";
    else if (!result.sent) errorEl.textContent = "Releul nu a confirmat primirea. Verifică dacă releul este accesibil.";
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
  try { await navigator.clipboard.writeText(text); toast("Codul a fost copiat", "Poți să-l lipești în aplicația raportorului."); }
  catch { location.hash = "#/cod"; const t = $("myCode"); t.focus(); t.select(); toast("Selectat", "Apasă Ctrl+C pentru a copia codul."); }
}
function showQr() { if (state.me) $("qrModal").classList.remove("hidden"); }
function hideQr() { $("qrModal").classList.add("hidden"); }

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-action]");
  if (t) { if (t.dataset.action === "copyCode") copyCode(); if (t.dataset.action === "showQr") showQr(); }
  const tab = e.target.closest("[data-tab]");
  if (tab) { state.tab = tab.dataset.tab; render(); }
  const seg = e.target.closest("#statusSeg button");
  if (seg) setStatus(seg.dataset.status);
  const chip = e.target.closest("#categoryChips button");
  if (chip) { $("categoryInput").value = chip.dataset.cat; saveCategory(chip.dataset.cat).catch((err) => toast("Categoria nu a putut fi salvată", err.message)); }
});
$("qrModal").addEventListener("click", hideQr);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideQr(); });

$("refreshBtn").addEventListener("click", async () => { await Promise.all([loadCases(), loadStatus()]); if (state.route.name === "detail") openDetail(state.route.id, false); });
$("search").addEventListener("input", (e) => {
  state.filter = e.target.value;
  if (state.route.name === "overview" || state.route.name === "cases") { if (state.filter && state.route.name === "overview") location.hash = "#/cazuri"; else render(); }
});
$("categoryInput").addEventListener("change", (e) => saveCategory(e.target.value).catch((err) => toast("Categoria nu a putut fi salvată", err.message)));
$("categoryInput").addEventListener("keydown", (e) => { if (e.key === "Enter") e.target.blur(); });
$("sendReplyBtn").addEventListener("click", sendReply);
$("replyInput").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendReply(); } });
$("addCaseBtn").addEventListener("click", async () => {
  const input = $("pasteInput");
  const errorEl = $("addCaseError");
  errorEl.textContent = "";
  try {
    await api("/api/cases", { method: "POST", body: JSON.stringify({ pastedCode: input.value }) });
    input.value = "";
    await loadCases();
    toast("Cazul a fost adăugat", "Confirmarea de primire a fost trimisă.");
  } catch (err) {
    errorEl.textContent = err.message;
  }
});
window.addEventListener("hashchange", route);

/* ───────── start ───────── */
(async function start() {
  await Promise.all([loadMe().catch(() => {}), loadCases().catch(() => {}), loadStatus()]);
  // First visit from this browser: cases that already exist are not "new" to the officer.
  try { if (localStorage.getItem("seenAt") === null) { for (const c of state.cases) markSeen(c.id, c.lastActivityAt); localStorage.setItem("seenAt", JSON.stringify(seenMap())); } } catch { /* no storage: skip */ }
  await route();
  // Live: the demo depends on a new case or message showing up within seconds.
  setInterval(async () => {
    try {
      await loadCases();
      if (state.route.name === "detail" && state.detail) await openDetail(state.route.id, false);
    } catch { /* relay or app briefly busy: next tick */ }
  }, 3000);
  setInterval(loadStatus, 5000);
})();
