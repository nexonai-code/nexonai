const listView = document.getElementById("listView");
const detailView = document.getElementById("detailView");
let currentCaseId = null;

async function api(path, options) {
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function fmtDate(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("ro-RO");
}

function deadlineInfo(dueAt) {
  const now = Date.now();
  const remainingMs = dueAt - now;
  const days = Math.round(remainingMs / (24 * 60 * 60 * 1000));
  let cls = "ok";
  if (remainingMs <= 0) cls = "overdue";
  else if (remainingMs < 2 * 24 * 60 * 60 * 1000) cls = "soon";
  const label = remainingMs <= 0 ? `întârziat cu ${Math.abs(days)}z` : `mai sunt ${days}z`;
  return { cls, label };
}

async function loadMe() {
  const me = await api("/api/me");
  document.getElementById("qrImg").src = me.qrDataUrl;
  document.getElementById("myCode").value = me.pairingCode;
  document.getElementById("relayUrlHint").textContent = me.relayReachableBaseUrl;
}

function statusLabel(status) {
  return { new: "nou", acknowledged: "confirmat", in_progress: "în lucru", closed: "închis" }[status] || status;
}

async function loadCases() {
  const cases = await api("/api/cases");
  const body = document.getElementById("casesBody");
  body.innerHTML = "";
  document.getElementById("noCases").classList.toggle("hidden", cases.length > 0);
  for (const c of cases) {
    const ack = deadlineInfo(c.ackDueAt);
    const feedback = deadlineInfo(c.feedbackDueAt);
    const tr = document.createElement("tr");
    tr.className = "case-row";
    tr.innerHTML = `
      <td><code>${c.caseNumber ? escapeHtml(c.caseNumber) : "—"}</code>${c.signalPending ? ' <span title="Confirmarea/actualizarea așteaptă să poată fi trimisă">⏳</span>' : ""}</td>
      <td><span class="pill ${c.status}">${statusLabel(c.status)}</span></td>
      <td>${c.category ? escapeHtml(c.category) : "<i style=\"color:var(--text-dim)\">necategorizat</i>"}</td>
      <td>${fmtDate(c.openedAt)}</td>
      <td class="deadline ${c.acknowledgedAt ? "ok" : ack.cls}">${c.acknowledgedAt ? "confirmat" : ack.label}</td>
      <td class="deadline ${c.status === "closed" ? "ok" : feedback.cls}">${c.status === "closed" ? "închis" : feedback.label}</td>
      <td>${fmtDate(c.lastActivityAt)}</td>
    `;
    tr.addEventListener("click", () => openCase(c.id));
    body.appendChild(tr);
  }
}

async function openCase(id) {
  currentCaseId = id;
  const c = await api(`/api/cases/${id}`);
  document.getElementById("caseIdLabel").textContent = c.caseNumber || id.slice(0, 8);
  document.getElementById("statusDelivery").textContent = c.signalPending
    ? "Actualizarea pentru raportor așteaptă: se trimite automat imediat ce canalul permite (de obicei după primul mesaj al raportorului)."
    : "";
  document.getElementById("statusSelect").value = c.status;
  document.getElementById("categoryInput").value = c.category || "";
  renderThread(c.messages);
  listView.classList.add("hidden");
  detailView.classList.remove("hidden");
}

function renderThread(messages) {
  const thread = document.getElementById("thread");
  thread.innerHTML = "";
  for (const m of messages) {
    const div = document.createElement("div");
    div.className = `msg ${m.direction}`;
    div.innerHTML = `${escapeHtml(m.text)}<div class="meta">${m.direction === "in" ? "raportor" : "tu"} · ${fmtDate(m.createdAt)}</div>`;
    thread.appendChild(div);
  }
  thread.scrollTop = thread.scrollHeight;
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

document.getElementById("backLink").addEventListener("click", () => {
  detailView.classList.add("hidden");
  listView.classList.remove("hidden");
  currentCaseId = null;
  loadCases();
});

document.getElementById("refreshBtn").addEventListener("click", () => {
  loadCases();
  if (currentCaseId) openCase(currentCaseId);
});

document.getElementById("addCaseBtn").addEventListener("click", async () => {
  const input = document.getElementById("pasteInput");
  const errorEl = document.getElementById("addCaseError");
  errorEl.textContent = "";
  try {
    await api("/api/cases", { method: "POST", body: JSON.stringify({ pastedCode: input.value }) });
    input.value = "";
    await loadCases();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById("statusSelect").addEventListener("change", async (e) => {
  const info = document.getElementById("statusDelivery");
  const r = await api(`/api/cases/${currentCaseId}/status`, { method: "POST", body: JSON.stringify({ status: e.target.value }) });
  info.textContent = {
    sent: "Starea a fost trimisă în aplicația raportorului.",
    "no-chain": "Starea va fi trimisă automat imediat ce raportorul scrie primul mesaj.",
    failed: "Releul nu a confirmat — se reîncearcă automat.",
    "not-sent": "",
  }[r.delivery] || "";
  loadCases();
});

document.getElementById("categoryInput").addEventListener("blur", async (e) => {
  await api(`/api/cases/${currentCaseId}/category`, { method: "POST", body: JSON.stringify({ category: e.target.value }) });
});

document.getElementById("sendReplyBtn").addEventListener("click", async () => {
  const input = document.getElementById("replyInput");
  const errorEl = document.getElementById("replyError");
  errorEl.textContent = "";
  if (!input.value.trim()) return;
  try {
    const result = await api(`/api/cases/${currentCaseId}/reply`, { method: "POST", body: JSON.stringify({ text: input.value }) });
    if (result.result === "no-chain") errorEl.textContent = "Nu se poate trimite încă: canalul se deschide după primul mesaj al raportorului.";
    else if (!result.sent) errorEl.textContent = "Releul nu a confirmat primirea — verifică dacă releul este accesibil.";
    input.value = "";
    renderThread(result.messages);
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

loadMe();
loadCases();
setInterval(() => {
  if (currentCaseId) openCase(currentCaseId);
  else loadCases();
}, 5000);
