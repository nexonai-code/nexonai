import { CaseRow, CaseStatus, CaseStore } from "../store/caseStore";

/**
 * unpruuf Compliance: one case as a file the organisation keeps outside the app — a printable,
 * self-contained HTML page (no scripts, no fonts, no images loaded from anywhere) or the same
 * content as JSON. It holds what the dashboard shows: number, category, dates, both Art. 9
 * deadlines with their state, the status history and the whole conversation. Never the case keys.
 */

/** Where a deadline stands at the moment of the export. "met_late" = done, but after the due date. */
export type DeadlineState = "met" | "met_late" | "overdue" | "open";

export interface CaseExport {
  exportedAt: number;
  caseNumber: string | null;
  status: CaseStatus;
  category: string | null;
  openedAt: number;
  lastActivityAt: number;
  /** Art. 9(1)(b): acknowledgement within 7 days. Done = the case was set to "acknowledged". */
  acknowledgement: { dueAt: number; doneAt: number | null; state: DeadlineState };
  /** Art. 9(1)(f): feedback within 3 months. Done = the case was closed, as in the dashboard. */
  feedback: { dueAt: number; doneAt: number | null; state: DeadlineState };
  statusChanges: { status: CaseStatus; at: number }[];
  messages: { from: "reporter" | "officer"; text: string; at: number }[];
}

function deadlineState(dueAt: number, doneAt: number | null, now: number): DeadlineState {
  if (doneAt !== null) return doneAt <= dueAt ? "met" : "met_late";
  return now > dueAt ? "overdue" : "open";
}

export function buildCaseExport(store: CaseStore, row: CaseRow, now: number = Date.now()): CaseExport {
  return {
    exportedAt: now,
    caseNumber: row.caseNumber,
    status: row.status,
    category: row.category,
    openedAt: row.openedAt,
    lastActivityAt: row.lastActivityAt,
    acknowledgement: { dueAt: row.ackDueAt, doneAt: row.acknowledgedAt, state: deadlineState(row.ackDueAt, row.acknowledgedAt, now) },
    feedback: { dueAt: row.feedbackDueAt, doneAt: row.closedAt, state: deadlineState(row.feedbackDueAt, row.closedAt, now) },
    statusChanges: store.listStatusChanges(row.id),
    messages: store.listMessages(row.id).map((m) => ({ from: m.direction === "in" ? "reporter" : "officer", text: m.text, at: m.createdAt })),
  };
}

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

/** The JSON variant: the same content, times as ISO 8601 (UTC). */
export function caseExportJson(e: CaseExport): string {
  return JSON.stringify(
    {
      exportedAt: iso(e.exportedAt),
      caseNumber: e.caseNumber,
      status: e.status,
      category: e.category,
      openedAt: iso(e.openedAt),
      lastActivityAt: iso(e.lastActivityAt),
      deadlines: {
        acknowledgement: { dueAt: iso(e.acknowledgement.dueAt), doneAt: iso(e.acknowledgement.doneAt), state: e.acknowledgement.state },
        feedback: { dueAt: iso(e.feedback.dueAt), doneAt: iso(e.feedback.doneAt), state: e.feedback.state },
      },
      statusChanges: e.statusChanges.map((c) => ({ status: c.status, at: iso(c.at) })),
      messages: e.messages.map((m) => ({ at: iso(m.at), from: m.from, text: m.text })),
    },
    null,
    2,
  );
}

/** "case-HW-7Q4M-2X9D-2026-10-30.html": case number (or internal id) and the export date. */
export function caseExportFileName(row: CaseRow, ext: "html" | "json", now: number = Date.now()): string {
  return `case-${(row.caseNumber ?? row.id).replace(/[^A-Za-z0-9-]/g, "_")}-${localDate(now)}.${ext}`;
}

const pad = (n: number) => String(n).padStart(2, "0");
function localDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** Local time of this computer with its UTC offset, so a printout is unambiguous: "2026-10-30 14:05 UTC+02:00". */
function localDateTime(ms: number | null): string {
  if (ms === null) return "—";
  const d = new Date(ms);
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return `${localDate(ms)} ${pad(d.getHours())}:${pad(d.getMinutes())} UTC${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
}

function esc(s: string | null): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** The texts of the file, Romanian (default) and English, like the dashboard. */
const TEXTS = {
  ro: {
    title: "Caz", doc: "Fișa cazului", exported: "Exportat la", app: "unpruuf Compliance, panoul ofițerului",
    data_h: "Date", nr: "Număr de caz", status: "Stare", category: "Categorie", opened: "Primit la", last: "Ultima activitate", msgs: "Mesaje",
    deadlines_h: "Termene (Directiva UE 2019/1937, Art. 9)", dl: "Termen", due: "Scadent la", done: "Îndeplinit la", state: "Situație",
    ack: "Confirmarea primirii (7 zile, Art. 9(1)(b))", fb: "Răspuns (3 luni, Art. 9(1)(f))",
    fb_note: "Termenul de răspuns este considerat îndeplinit la închiderea cazului, ca în panou.",
    met: "îndeplinit la timp", met_late: "îndeplinit după termen", overdue: "depășit", open: "în curs",
    history_h: "Schimbări de stare", at: "Data", hist_opened: "caz deschis",
    hist_note: "Schimbările de stare sunt înregistrate din 30.10.2026. Pentru cazurile mai vechi, datele de confirmare și închidere de mai sus rămân valabile.",
    convo_h: "Conversație", from: "De la", text: "Text", reporter: "Raportor", officer: "Ofițer", none: "Niciun mesaj.",
    footer: "Fișierul nu conține cheile cazului și nicio informație despre identitatea raportorului, pe care aplicația nu o cunoaște.",
    st: { new: "Nou", acknowledged: "Confirmat", in_progress: "În lucru", closed: "Închis" } as Record<CaseStatus, string>,
  },
  en: {
    title: "Case", doc: "Case record", exported: "Exported on", app: "unpruuf Compliance, officer dashboard",
    data_h: "Data", nr: "Case number", status: "Status", category: "Category", opened: "Received on", last: "Last activity", msgs: "Messages",
    deadlines_h: "Deadlines (EU Directive 2019/1937, Art. 9)", dl: "Deadline", due: "Due on", done: "Done on", state: "State",
    ack: "Acknowledgement of receipt (7 days, Art. 9(1)(b))", fb: "Feedback (3 months, Art. 9(1)(f))",
    fb_note: "The feedback deadline counts as met when the case was closed, as in the dashboard.",
    met: "met on time", met_late: "met after the deadline", overdue: "overdue", open: "running",
    history_h: "Status changes", at: "Date", hist_opened: "case opened",
    hist_note: "Status changes are recorded since 30.10.2026. For older cases, the acknowledgement and closing dates above still apply.",
    convo_h: "Conversation", from: "From", text: "Text", reporter: "Reporter", officer: "Officer", none: "No messages.",
    footer: "This file contains none of the case keys and nothing about the reporter's identity, which the app does not know.",
    st: { new: "New", acknowledged: "Acknowledged", in_progress: "In progress", closed: "Closed" } as Record<CaseStatus, string>,
  },
};

export function caseExportHtml(e: CaseExport, lang: "ro" | "en" = "ro"): string {
  const L = TEXTS[lang];
  const nr = e.caseNumber ?? "—";
  const dlRow = (label: string, d: CaseExport["acknowledgement"]) =>
    `<tr><td>${esc(label)}</td><td>${localDateTime(d.dueAt)}</td><td>${localDateTime(d.doneAt)}</td><td class="st-${d.state}">${esc(L[d.state])}</td></tr>`;
  const history = [{ label: L.hist_opened, at: e.openedAt }, ...e.statusChanges.map((c) => ({ label: L.st[c.status] ?? c.status, at: c.at }))];
  const messages = e.messages.length
    ? e.messages.map((m) => `<tr class="${m.from}"><td class="nw">${localDateTime(m.at)}</td><td class="nw">${esc(m.from === "reporter" ? L.reporter : L.officer)}</td><td class="txt">${esc(m.text)}</td></tr>`).join("\n")
    : `<tr><td colspan="3">${esc(L.none)}</td></tr>`;
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(L.title)} ${esc(nr)}</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", Arial, sans-serif; color: #10282b; margin: 32px auto; max-width: 900px; padding: 0 20px; font-size: 14px; line-height: 1.45; }
  h1 { font-size: 22px; margin: 0 0 4px; } h2 { font-size: 16px; margin: 28px 0 8px; border-bottom: 1px solid #cfdcdd; padding-bottom: 4px; }
  .sub { color: #5a6f71; font-size: 12.5px; }
  table { width: 100%; border-collapse: collapse; } th, td { text-align: left; vertical-align: top; padding: 6px 8px; border-bottom: 1px solid #e3eaea; }
  th { font-size: 12px; color: #5a6f71; font-weight: 600; } dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 18px; margin: 0; } dt { color: #5a6f71; } dd { margin: 0; }
  .nw { white-space: nowrap; } .txt { white-space: pre-wrap; overflow-wrap: anywhere; } tr.officer td { background: #f3f7f7; }
  .st-overdue { color: #a3291d; font-weight: 600; } .st-met_late { color: #8a5a00; } .st-met { color: #1d6b3a; }
  .note { color: #5a6f71; font-size: 12.5px; margin: 6px 0 0; } code { font-family: ui-monospace, Consolas, monospace; }
  @media print { body { margin: 0; max-width: none; } tr { break-inside: avoid; } }
</style>
</head>
<body>
<h1>${esc(L.doc)} <code>${esc(nr)}</code></h1>
<div class="sub">${esc(L.exported)} ${localDateTime(e.exportedAt)} · ${esc(L.app)}</div>

<h2>${esc(L.data_h)}</h2>
<dl>
  <dt>${esc(L.nr)}</dt><dd><code>${esc(nr)}</code></dd>
  <dt>${esc(L.category)}</dt><dd>${esc(e.category || "—")}</dd>
  <dt>${esc(L.opened)}</dt><dd>${localDateTime(e.openedAt)}</dd>
  <dt>${esc(L.status)}</dt><dd>${esc(L.st[e.status] ?? e.status)}</dd>
  <dt>${esc(L.last)}</dt><dd>${localDateTime(e.lastActivityAt)}</dd>
  <dt>${esc(L.msgs)}</dt><dd>${e.messages.length}</dd>
</dl>

<h2>${esc(L.deadlines_h)}</h2>
<table>
<thead><tr><th>${esc(L.dl)}</th><th>${esc(L.due)}</th><th>${esc(L.done)}</th><th>${esc(L.state)}</th></tr></thead>
<tbody>
${dlRow(L.ack, e.acknowledgement)}
${dlRow(L.fb, e.feedback)}
</tbody>
</table>
<p class="note">${esc(L.fb_note)}</p>

<h2>${esc(L.history_h)}</h2>
<table>
<thead><tr><th>${esc(L.at)}</th><th>${esc(L.status)}</th></tr></thead>
<tbody>
${history.map((h) => `<tr><td class="nw">${localDateTime(h.at)}</td><td>${esc(h.label)}</td></tr>`).join("\n")}
</tbody>
</table>
<p class="note">${esc(L.hist_note)}</p>

<h2>${esc(L.convo_h)}</h2>
<table>
<thead><tr><th>${esc(L.at)}</th><th>${esc(L.from)}</th><th>${esc(L.text)}</th></tr></thead>
<tbody>
${messages}
</tbody>
</table>

<p class="note">${esc(L.footer)}</p>
</body>
</html>
`;
}
