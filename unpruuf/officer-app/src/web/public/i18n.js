/* Language support for the officer dashboard: Romanian (default) and English. Plain script, no build step. */
"use strict";

const I18N = {
  ro: {
    title: "unpruuf Whistleblower — Panoul ofițerului",
    role: "Ofițer",
    nav_overview: "Prezentare generală", nav_cases: "Cazuri", nav_code: "Codul organizației",
    search_ph: "Caută după număr de caz", refresh: "Reîmprospătează",
    org_qr_alt: "Cod QR al organizației",
    start_h: "Începe aici: arată codul organizației",
    start_1: "Apasă <b>Afișează mare</b> și proiectează codul, sau arată-l pe ecran.",
    start_2: "Raportorul îl scanează în aplicația unpruuf, fără nume și fără cont.",
    start_3: "Cazul apare aici singur, cu număr de caz. Raportorul primește confirmarea automat.",
    show_big: "Afișează mare", copy_code: "Copiază codul",
    cases: "Cazuri",
    th_nr: "Nr. caz", th_state: "Stare", th_cat: "Categorie", th_opened: "Deschis", th_next: "Următorul termen", th_activity: "Activitate",
    sorted_by: "Sortat după termen, cel mai urgent primul", all_cases: "Toate cazurile",
    weeks_h: "Sesizări noi pe săptămână", next_h: "Termene următoare", code_h: "Codul organizației",
    code_blurb: "Un singur cod pentru toată organizația. Cine îl scanează trimite sesizarea direct aici, fără nume.",
    cats_h: "Cazuri pe categorii",
    no_cases: "Niciun caz încă. Cazurile apar aici automat imediat ce cineva scanează codul organizației și trimite o sesizare.",
    code_show_full: "Afișează pe tot ecranul",
    how_h: "Cum funcționează",
    how_1: "<b>Un singur cod pentru toată organizația.</b> Afișează-l la avizier, în intranet sau pe un card. Nu genera coduri separate pentru fiecare angajat: un cod individual ar putea fi legat de o persoană.",
    how_2: "Cine îl scanează în aplicația unpruuf trimite automat cazul aici. Cazul apare singur în listă, cu un număr de caz, iar raportorul primește automat confirmarea de primire.",
    how_3: "Raportează printr-un browser în loc de aplicație? Va avea nevoie și de adresa releului:",
    code_text_h: "Codul ca text", code_text_aria: "Codul organizației ca text",
    manual_sum: "<b>Adăugare manuală</b> — doar pentru aplicații de raportare mai vechi",
    paste_ph: "Lipește codul afișat de aplicația raportorului după ce a scanat codul tău…",
    add_case: "Adaugă cazul",
    back: "← Înapoi la cazuri",
    convo_h: "Conversație",
    reply_ph: "Scrie un răspuns… (Ctrl+Enter trimite)", reply_aria: "Răspuns", send_reply: "Trimite răspunsul",
    state_h: "Stare", st_new: "Nou", st_acknowledged: "Confirmat", st_in_progress: "În lucru", st_closed: "Închis",
    deadlines_h: "Termene",
    deadline_note: "Confirmarea de primire (7 zile, Directiva UE 2019/1937, Art. 9(1)(b)) pleacă automat cu numărul cazului. Răspuns în 3 luni (Art. 9(1)(f)). Fiecare schimbare de stare apare imediat în aplicația raportorului.",
    category_h: "Categorie", category_ph: "ex. abateri financiare, hărțuire…",
    data_h: "Date",
    qr_dialog: "Codul organizației", qr_scan: "Scanează cu aplicația unpruuf", qr_close: "Apasă oriunde sau Esc pentru a închide",
    /* dynamic */
    months: ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "noi", "dec"],
    months_long: ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"],
    weekdays: ["duminică", "luni", "marți", "miercuri", "joi", "vineri", "sâmbătă"],
    time_locale: "ro-RO",
    cat_suggest: ["Abateri financiare", "Hărțuire", "Achiziții", "Conflict de interese", "Date personale", "Altele"],
    uncategorised: "Necategorizat", uncategorised_l: "necategorizat",
    s_few: "acum câteva secunde", m_1: "acum 1 minut", m_n: "acum {n} minute", h_1: "acum 1 oră", h_n: "acum {n} ore", yesterday: "ieri", d_n: "acum {n} zile",
    day_1: "1 zi", day_n: "{n} zile",
    dl_closed: "Închis", dl_ack: "Confirmare", dl_ack_title: "Confirmare de primire", dl_fb: "Răspuns", dl_fb_title: "Răspuns către raportor",
    overdue: "întârziat cu {d}", today: "Azi", in_days: "în {d}", still: "Încă {d}",
    page_overview_sub: "", page_code_sub: "Un singur cod pentru toată organizația", page_cases_sub: "Toate sesizările primite", page_detail: "Caz",
    case_title: "Cazul {c}", opened_at: "Deschis {t}",
    toast_new: "Caz nou: {c}", toast_new_sub: "A sosit o sesizare nouă.", toast_msg: "Mesaj nou în cazul {c}", toast_msg_sub: "Raportorul a scris.",
    c_connecting: "Se conectează…", c_connecting_t: "Prima verificare a releului urmează.",
    c_tor: "Conectat prin Tor", c_direct: "Conectat (direct, fără Tor)", c_ok_t: "Releul răspunde. Ultima verificare: {ago}. Baza de date a cazurilor este criptată.",
    c_bad: "Releul nu răspunde", c_bad_t: "Se reîncearcă automat. Verifică fereastra serverului dacă persistă.",
    c_panel: "Panoul nu răspunde", c_panel_t: "Aplicația ofițerului rulează încă?",
    unread: "Activitate nouă", sending: "se trimite", sending_t: "Confirmarea/actualizarea așteaptă să poată fi trimisă",
    shown_of: "Se afișează {a} din {b}. Toate cazurile",
    none_in_tab: "Niciun caz în această categorie.", no_deadline: "Niciun termen deschis.",
    tab_open: "Deschise", tab_new: "Noi", tab_progress: "În lucru", tab_closed: "Închise",
    k_open: "Cazuri deschise", k_none: "Încă nicio sesizare", k_new7: "{n} {w} în ultimele 7 zile", k_new_one: "nouă", k_new_many: "noi",
    k_ack: "Confirmare de primire", k_ack_s: "Termen legal: 7 zile de la primire", k_ack_done: "totul confirmat",
    k_fb: "Răspuns către raportor", k_fb_s: "Termen: 3 luni (90 de zile) de la primire",
    k_closed: "Închise în {y}", k_closed_none: "Încă niciun caz închis", k_avg: "Timp mediu până la închidere: {n} {u}", unit_day: "zi", unit_days: "zile",
    weeks_note: "ultimele 8 săptămâni · {n} în total",
    cases_foot: "Se afișează {a} din {b} cazuri · sortat după termen, cel mai urgent primul",
    open_fail: "Cazul nu a putut fi deschis",
    delivery_pending: "Actualizarea pentru raportor așteaptă: se trimite automat imediat ce canalul permite (de obicei după primul mesaj al raportorului).",
    sent_on: "trimisă {d}", closed_on: "închis {d}", closed_word: "închis", until: "până la {d}",
    f_nr: "Număr de caz", f_opened: "Deschis", f_last: "Ultima activitate", f_msgs: "Mesaje", f_identity: "Identitate raportor", f_unknown: "nu este cunoscută",
    msg_1: "mesaj", msg_n: "mesaje", reporter: "raportor", you: "tu",
    thread_none: "Încă niciun mesaj. Raportorul poate scrie din aplicație; răspunsul tău apare aici și la el.",
    sending_dots: "Se trimite…",
    dv_sent: "Starea a fost trimisă în aplicația raportorului.", dv_nochain: "Starea va fi trimisă automat imediat ce raportorul scrie primul mesaj.", dv_failed: "Releul nu a confirmat. Se reîncearcă automat.",
    r_nochain: "Nu se poate trimite încă: canalul se deschide după primul mesaj al raportorului.", r_notconfirmed: "Releul nu a confirmat primirea. Verifică dacă releul este accesibil.",
    cat_fail: "Categoria nu a putut fi salvată",
    copied: "Codul a fost copiat", copied_sub: "Poți să-l lipești în aplicația raportorului.", selected: "Selectat", selected_sub: "Apasă Ctrl+C pentru a copia codul.",
    added: "Cazul a fost adăugat", added_sub: "Confirmarea de primire a fost trimisă.",
    lang_label: "Limba",
  },
  en: {
    title: "unpruuf Whistleblower — Officer dashboard",
    role: "Officer",
    nav_overview: "Overview", nav_cases: "Cases", nav_code: "Organisation code",
    search_ph: "Search by case number", refresh: "Refresh",
    org_qr_alt: "Organisation QR code",
    start_h: "Start here: show the organisation code",
    start_1: "Press <b>Show large</b> and project the code, or show it on screen.",
    start_2: "The reporter scans it in the unpruuf app, without a name and without an account.",
    start_3: "The case appears here by itself, with a case number. The reporter gets the confirmation automatically.",
    show_big: "Show large", copy_code: "Copy code",
    cases: "Cases",
    th_nr: "Case no.", th_state: "Status", th_cat: "Category", th_opened: "Opened", th_next: "Next deadline", th_activity: "Activity",
    sorted_by: "Sorted by deadline, most urgent first", all_cases: "All cases",
    weeks_h: "New reports per week", next_h: "Upcoming deadlines", code_h: "Organisation code",
    code_blurb: "One code for the whole organisation. Whoever scans it sends the report straight here, without a name.",
    cats_h: "Cases by category",
    no_cases: "No cases yet. Cases appear here automatically as soon as someone scans the organisation code and sends a report.",
    code_show_full: "Show full screen",
    how_h: "How it works",
    how_1: "<b>One code for the whole organisation.</b> Show it on the notice board, on the intranet or on a card. Do not generate separate codes for each employee: an individual code could be tied to a person.",
    how_2: "Whoever scans it in the unpruuf app sends the case here automatically. The case appears in the list by itself, with a case number, and the reporter automatically receives the confirmation of receipt.",
    how_3: "Reporting through a browser instead of the app? They will also need the relay address:",
    code_text_h: "The code as text", code_text_aria: "The organisation code as text",
    manual_sum: "<b>Manual entry</b> — only for older reporting apps",
    paste_ph: "Paste the code shown by the reporter's app after it scanned your code…",
    add_case: "Add case",
    back: "← Back to cases",
    convo_h: "Conversation",
    reply_ph: "Write a reply… (Ctrl+Enter sends)", reply_aria: "Reply", send_reply: "Send reply",
    state_h: "Status", st_new: "New", st_acknowledged: "Acknowledged", st_in_progress: "In progress", st_closed: "Closed",
    deadlines_h: "Deadlines",
    deadline_note: "The confirmation of receipt (7 days, EU Directive 2019/1937, Art. 9(1)(b)) goes out automatically with the case number. Feedback within 3 months (Art. 9(1)(f)). Every status change shows up immediately in the reporter's app.",
    category_h: "Category", category_ph: "e.g. financial irregularities, harassment…",
    data_h: "Details",
    qr_dialog: "Organisation code", qr_scan: "Scan with the unpruuf app", qr_close: "Click anywhere or press Esc to close",
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    months_long: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    weekdays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    time_locale: "en-GB",
    cat_suggest: ["Financial irregularities", "Harassment", "Procurement", "Conflict of interest", "Personal data", "Other"],
    uncategorised: "Uncategorised", uncategorised_l: "uncategorised",
    s_few: "a few seconds ago", m_1: "1 minute ago", m_n: "{n} minutes ago", h_1: "1 hour ago", h_n: "{n} hours ago", yesterday: "yesterday", d_n: "{n} days ago",
    day_1: "1 day", day_n: "{n} days",
    dl_closed: "Closed", dl_ack: "Receipt", dl_ack_title: "Confirmation of receipt", dl_fb: "Feedback", dl_fb_title: "Feedback to the reporter",
    overdue: "overdue by {d}", today: "Today", in_days: "in {d}", still: "{d} left",
    page_overview_sub: "", page_code_sub: "One code for the whole organisation", page_cases_sub: "All reports received", page_detail: "Case",
    case_title: "Case {c}", opened_at: "Opened {t}",
    toast_new: "New case: {c}", toast_new_sub: "A new report has arrived.", toast_msg: "New message in case {c}", toast_msg_sub: "The reporter wrote.",
    c_connecting: "Connecting…", c_connecting_t: "The first check of the relay is coming up.",
    c_tor: "Connected through Tor", c_direct: "Connected (direct, no Tor)", c_ok_t: "The relay answers. Last check: {ago}. The case database is encrypted.",
    c_bad: "The relay does not answer", c_bad_t: "Retrying automatically. Check the server window if it persists.",
    c_panel: "The dashboard does not answer", c_panel_t: "Is the officer app still running?",
    unread: "New activity", sending: "sending", sending_t: "The confirmation/update is waiting to be sent",
    shown_of: "Showing {a} of {b}. All cases",
    none_in_tab: "No cases in this category.", no_deadline: "No open deadlines.",
    tab_open: "Open", tab_new: "New", tab_progress: "In progress", tab_closed: "Closed",
    k_open: "Open cases", k_none: "No reports yet", k_new7: "{n} {w} in the last 7 days", k_new_one: "new", k_new_many: "new",
    k_ack: "Confirmation of receipt", k_ack_s: "Legal deadline: 7 days from receipt", k_ack_done: "all confirmed",
    k_fb: "Feedback to the reporter", k_fb_s: "Deadline: 3 months (90 days) from receipt",
    k_closed: "Closed in {y}", k_closed_none: "No case closed yet", k_avg: "Average time to closure: {n} {u}", unit_day: "day", unit_days: "days",
    weeks_note: "last 8 weeks · {n} in total",
    cases_foot: "Showing {a} of {b} cases · sorted by deadline, most urgent first",
    open_fail: "The case could not be opened",
    delivery_pending: "The update for the reporter is waiting: it is sent automatically as soon as the channel allows (usually after the reporter's first message).",
    sent_on: "sent {d}", closed_on: "closed {d}", closed_word: "closed", until: "until {d}",
    f_nr: "Case number", f_opened: "Opened", f_last: "Last activity", f_msgs: "Messages", f_identity: "Reporter identity", f_unknown: "not known",
    msg_1: "message", msg_n: "messages", reporter: "reporter", you: "you",
    thread_none: "No messages yet. The reporter can write from the app; your reply appears here and on their phone.",
    sending_dots: "Sending…",
    dv_sent: "The status was sent to the reporter's app.", dv_nochain: "The status will be sent automatically as soon as the reporter writes the first message.", dv_failed: "The relay did not confirm. Retrying automatically.",
    r_nochain: "Cannot be sent yet: the channel opens after the reporter's first message.", r_notconfirmed: "The relay did not confirm receipt. Check that the relay is reachable.",
    cat_fail: "The category could not be saved",
    copied: "The code was copied", copied_sub: "You can paste it into the reporter's app.", selected: "Selected", selected_sub: "Press Ctrl+C to copy the code.",
    added: "The case was added", added_sub: "The confirmation of receipt was sent.",
    lang_label: "Language",
  },
};

/* Messages the server sends in Romanian, shown in English when English is selected. */
const SERVER_ERRORS_EN = {
  "pastedCode este obligatoriu": "The pasted code is required.",
  "Acest cod nu pare a fi un cod de împerechere unpruuf valid.": "This does not look like a valid unpruuf pairing code.",
  "eroare internă": "Internal error.",
  "nu a fost găsit": "Not found.",
  "categoria trebuie să fie un text": "The category must be text.",
  "textul este obligatoriu": "The text is required.",
  "trimiterea a eșuat — releul este accesibil? verifică fereastra serverului.": "Sending failed. Is the relay reachable? Check the server window.",
};

let LANG = "ro";
try { const saved = localStorage.getItem("lang"); if (saved === "en" || saved === "ro") LANG = saved;; } catch { /* no storage: Romanian */ }

function t(key, vars) {
  let s = (I18N[LANG] && I18N[LANG][key]);
  if (s === undefined) s = I18N.ro[key];
  if (typeof s === "string" && vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
function serverError(msg) {
  if (LANG === "en") {
    if (SERVER_ERRORS_EN[msg]) return SERVER_ERRORS_EN[msg];
    if (/^starea trebuie/.test(msg)) return "The status must be one of: new, acknowledged, in_progress, closed.";
    if (/nu din ediția Whistleblower/.test(msg)) return "This code comes from a different app edition, not from the Whistleblower edition.";
  }
  return msg;
}

function applyStaticI18n() {
  document.documentElement.lang = LANG;
  document.title = t("title");
  for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll("[data-i18n-html]")) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of document.querySelectorAll("[data-i18n-ph]")) el.setAttribute("placeholder", t(el.dataset.i18nPh));
  for (const el of document.querySelectorAll("[data-i18n-aria]")) el.setAttribute("aria-label", t(el.dataset.i18nAria));
  for (const el of document.querySelectorAll("[data-i18n-alt]")) el.setAttribute("alt", t(el.dataset.i18nAlt));
  for (const b of document.querySelectorAll("#langSwitch button")) b.classList.toggle("on", b.dataset.lang === LANG);
}
