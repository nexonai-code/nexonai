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
  return new Date(ms).toLocaleString();
}

function deadlineInfo(dueAt) {
  const now = Date.now();
  const remainingMs = dueAt - now;
  const days = Math.round(remainingMs / (24 * 60 * 60 * 1000));
  let cls = "ok";
  if (remainingMs <= 0) cls = "overdue";
  else if (remainingMs < 2 * 24 * 60 * 60 * 1000) cls = "soon";
  const label = remainingMs <= 0 ? `overdue by ${Math.abs(days)}d` : `${days}d left`;
  return { cls, label };
}

async function loadMe() {
  const me = await api("/api/me");
  document.getElementById("qrImg").src = me.qrDataUrl;
  document.getElementById("myCode").value = me.pairingCode;
  document.getElementById("relayUrlHint").textContent = me.relayReachableBaseUrl;
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
      <td><span class="pill ${c.status}">${c.status.replace("_", " ")}</span></td>
      <td>${c.category ? escapeHtml(c.category) : "<i style=\"color:var(--text-dim)\">uncategorized</i>"}</td>
      <td>${fmtDate(c.openedAt)}</td>
      <td class="deadline ${c.acknowledgedAt ? "ok" : ack.cls}">${c.acknowledgedAt ? "acknowledged" : ack.label}</td>
      <td class="deadline ${c.status === "closed" ? "ok" : feedback.cls}">${c.status === "closed" ? "closed" : feedback.label}</td>
      <td>${fmtDate(c.lastActivityAt)}</td>
    `;
    tr.addEventListener("click", () => openCase(c.id));
    body.appendChild(tr);
  }
}

async function openCase(id) {
  currentCaseId = id;
  const c = await api(`/api/cases/${id}`);
  document.getElementById("caseIdLabel").textContent = id.slice(0, 8);
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
    div.innerHTML = `${escapeHtml(m.text)}<div class="meta">${m.direction === "in" ? "reporter" : "you"} · ${fmtDate(m.createdAt)}</div>`;
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
  await api(`/api/cases/${currentCaseId}/status`, { method: "POST", body: JSON.stringify({ status: e.target.value }) });
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
    if (!result.sent) errorEl.textContent = "Queued locally, but the relay didn't confirm receipt — check the relay is reachable.";
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
