#!/usr/bin/env python3
"""Builds the "Audit readiness" page (a shared checklist) in the NexonAI design.
Usage: python3 audit_readiness.py OUTPUT.html
The defaults below are what the page shows when nobody has changed anything; the team's changes live in the
artifact's shared database (collection audit_items, one document per item id)."""
import base64
import html
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import md_to_html  # noqa: E402  (the shared design CSS)

STATUSES = [("open", "Open"), ("progress", "In progress"), ("done", "Done"), ("decision", "Needs decision")]

GROUPS = [
    ("Decide first", "Decisions that change what the auditor will see", [
        ("i01", "Packet format (F1) and control signals (M6)",
         "Decide and build option A+: pad first, then encrypt, and carry control signals inside the ratchet. Then iOS. Without it, F1 is a certain high finding and the briefs overstate what the code does.",
         "Team decides; Gabriel builds Android, Officer app and Web reporter; Norbert builds iOS", "decision"),
        ("i02", "One write key per server (M5)",
         "Decide whether to build per-device write keys or to state the limit in the briefs and in customer material.",
         "Team", "decision"),
        ("i03", "Release fingerprint (M8)",
         "Extend the signed file list to node_modules, the native SQLite file and the Tor program, and sign the single-file build, or state the limit.",
         "Gabriel", "open"),
        ("i04", "Patent and confidentiality",
         "The briefs contain protocol details. Ask the lawyer whether to file first, and prepare the NDA the auditor signs before reading them.",
         "Norbert", "open"),
    ]),
    ("Test on real things", "What today is only proven in code", [
        ("i05", "Phones",
         "Update from the v2 or v3 build and check the database migration; panic PIN; PIN lock-out with the date moved; screenshot block in dialogs; clipboard after 60 s; device transfer.",
         "Gabriel", "open"),
        ("i06", "Real Tor",
         "Do two requests with different SOCKS user names land on different circuits (control port)? Battery, mobile data and latency over one day on the Pixel and the Samsung.",
         "Gabriel", "open"),
        ("i07", "Two phones, our own VPS, a 24-hour capture",
         "Answers the claims that are only code-backed today: only Tor (S4, A2), the real flow end to end.",
         "Gabriel", "open"),
        ("i08", "Docker and Control",
         "The setup-page token on a real Docker network; Control against a real server (never run so far).",
         "Gabriel", "open"),
    ]),
    ("Release", "What the auditor is handed", [
        ("i09", "Tag, signed file list, fingerprint",
         "One tagged release with the signed release-manifest and its fingerprint written down. The scope is frozen on this tag.",
         "Gabriel", "open"),
        ("i10", "Release key",
         "Change the start password of the release key and keep both key files in two places. Losing the key means no customer can update.",
         "Gabriel confirms", "decision"),
        ("i11", "Reproducible build (A11)",
         "A rebuild from the tag that gives the same hash, or at least exact build instructions with the expected hash.",
         "Gabriel", "open"),
        ("i12", "Release build with lint",
         "Build the six variants as release in Android Studio, including the lint step that never ran here.",
         "Gabriel", "open"),
        ("i13", "Evidence on the tag",
         "Run the evidence scripts and the unit tests on the tag and attach the report. Today: 97 checks pass, 0 fail, one open finding (F1).",
         "Gabriel", "progress"),
        ("i14", "Test vectors and bill of materials",
         "Test vectors for the new packet format, and a software bill of materials for server and app.",
         "Gabriel", "open"),
    ]),
    ("Order", "Once the above is done", [
        ("i15", "Briefs on the tag",
         "Re-align both briefs with the code (A3, A8, M4, M6) and keep the section on our own findings current.",
         "Gabriel", "open"),
        ("i16", "Shortlist, quotes, NDA",
         "Shortlist auditors with Tor and Android cryptography experience; ask for an anonymised sample report and references; fixed price with the retest included.",
         "Norbert; Floretta for introductions", "open"),
        ("i17", "Date and budget",
         "Nothing is known today. Decide the date, the budget and who the single technical contact is.",
         "Team", "decision"),
    ]),
]

ASK = [
    ("Scope", [
        "First round: node server and Business app (pro, then group).",
        "Name the exclusions in the contract: Control, Officer app, Press, safeline parts, iOS. Otherwise the report gets read wider than it is.",
        "A cryptography review by a specialist (Double Ratchet, the reduced session start, the outer layer, the new packet format).",
        "Build and release chain, the Tor and bridge integration, and inputs from outside (pairing codes, lists, images).",
    ]),
    ("Method", [
        "Source review of the files named in the briefs, plus black-box tests against the running server over Tor and over loopback.",
        "Dynamic tests on two phones, rooted and not: our debug build first, then confirmation on the release build.",
        "A 24-hour capture against a server the auditor runs, and a network that blocks Tor (bridges, Snowflake).",
    ]),
    ("Deliverables", [
        "Findings with a named severity scale, evidence and recommendations.",
        "A coverage statement per claim (our S1 to S11 and A1 to A12): confirmed, not confirmed or not tested.",
        "The fingerprint of what was reviewed, a draft for factual corrections, interim notice of serious findings, and the retest in the price.",
        "A short summary we may show customers, and permission to quote it and the coverage statement word for word. Never a certificate.",
    ]),
    ("Conditions", [
        "Confidentiality that covers the protocol details while the patent check runs; fixed price and time frame.",
        "Scope frozen on the tag; only agreed fixes change the code. One technical contact with a fixed response time.",
        "Agreed rules for disclosure; no business relationship with us; references and a sample report beforehand.",
    ]),
]

RAISES = [
    "Fix what we know, and state the rest ourselves. The briefs list our own findings; an auditor who finds our known items in the briefs rates openness higher than a find we kept quiet.",
    "Make the briefs match the code. This is what the pre-audit corrected; check again after F1, M6 and the tag.",
    "Show the evidence: scripts, tests, changelog, release manifest, bill of materials. It spares audit time for what we do not know.",
    "Real Tor and real devices first. Most of what is code-only today is exactly where an auditor starts.",
]
EXPECT = [
    "With F1 and M6, M8, a release tag and the device and Tor tests done beforehand, a report with a few medium and low findings and no open high one is realistic.",
    "M5 most likely stays as a stated limit unless per-device write keys are built.",
    "Without the preparation F1 is a certain high finding, and the briefs are open to attack.",
    "Price and date are unknown; no figures are invented here.",
]
ORDER = [
    "The team decides F1 and M6 and M5 (the sheets exist).",
    "We build F1 and M6; Norbert builds iOS, or iOS is named as outside round one in the contract.",
    "Device tests, the Tor test, the two-phone run with the capture.",
    "Fix M8, set the release tag, note the fingerprint, sign the file list.",
    "Align the briefs, talk to the lawyer about the patent, collect quotes, order.",
]

EXTRA_CSS = """
.summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin:0 0 8px}
.summary div{padding:18px 16px;border-left:1px solid var(--line)}
.summary div:first-child{border-left:0;padding-left:0}
.summary b{display:block;font-size:40px;font-weight:700;letter-spacing:-.05em;line-height:1;color:var(--fg);font-variant-numeric:tabular-nums}
.summary span{display:block;margin-top:8px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.hint{font-size:14px;max-width:72ch}
.group-head{margin:44px 0 8px;padding-top:28px;border-top:1px solid var(--line)}
.group-head:first-of-type{margin-top:28px}
.group-head h2{margin:6px 0 0;padding:0;border:0;font-size:clamp(24px,2.6vw,32px)}
.task{display:grid;grid-template-columns:3.2rem minmax(0,1fr);gap:4px 12px;padding:18px 0;border-bottom:1px solid var(--line)}
.task .num{font-family:var(--mono);font-size:12.5px;letter-spacing:.04em;color:var(--accent);padding-top:3px}
.task h3{margin:0 0 4px;font-size:18px;line-height:1.3;letter-spacing:-.02em}
.task p{margin:0 0 12px;font-size:14.5px;line-height:1.55}
.ctrl{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center}
.ctrl label{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);display:flex;flex-direction:column;gap:4px;min-width:0}
.ctrl .owner{font-size:14px;font-weight:400;letter-spacing:0;text-transform:none;color:var(--fg);max-width:28ch}
select,input[type=text]{font:inherit;font-size:14px;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:4px;padding:8px 10px;min-height:38px;max-width:100%}
select{font-weight:600;padding-right:28px}
input[type=text]{width:min(360px,100%)}
select:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
select:disabled,input:disabled{opacity:.7;cursor:not-allowed}
.task[data-status=done] select{color:var(--good);border-color:var(--good)}
.task[data-status=progress] select{color:var(--accent);border-color:var(--accent)}
.task[data-status=decision] select{color:var(--warn);border-color:var(--warn)}
.stamp{font-size:12.5px;color:var(--muted);margin-top:6px;min-height:1.2em}
.cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 40px}
.cols h3{margin:28px 0 8px;font-size:16px}
.cols ul{margin:0;font-size:14.5px}
.panel{background:var(--ink);color:#fff;border-radius:4px;padding:28px;margin:28px 0 8px}
.panel .eyebrow{color:var(--bright)}
.panel h2{margin:0 0 14px;padding:0;border:0;color:#fff;font-size:clamp(22px,2.4vw,30px)}
.panel ul,.panel ol{color:#c5d1d9;margin:0;font-size:15px}
.panel li::marker{color:var(--bright)}
@media (max-width:720px){.summary{grid-template-columns:repeat(2,minmax(0,1fr))}.summary div:nth-child(3){border-left:0;padding-left:0}.cols{grid-template-columns:minmax(0,1fr)}.task{grid-template-columns:2.4rem minmax(0,1fr)}}
:root{--good:#2e7d5b;--warn:#a85f00}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--good:#5cc08f;--warn:#e0a84a}}
:root[data-theme="dark"]{--good:#5cc08f;--warn:#e0a84a}
"""

JS = r"""
(function () {
  var STATUS_LABEL = {open: 'Open', progress: 'In progress', done: 'Done', decision: 'Needs decision'};
  var tasks = Array.prototype.slice.call(document.querySelectorAll('.task'));
  var byId = {};
  tasks.forEach(function (t) { byId[t.getAttribute('data-id')] = t; });
  var state = {db: null, user: null, canWrite: false, ready: false};

  function counts() {
    var c = {open: 0, progress: 0, done: 0, decision: 0};
    tasks.forEach(function (t) { c[t.getAttribute('data-status')]++; });
    Object.keys(c).forEach(function (k) { var el = document.getElementById('n-' + k); if (el) el.textContent = c[k]; });
  }
  function setStatus(t, s) {
    t.setAttribute('data-status', s);
    var sel = t.querySelector('select');
    if (sel.value !== s) sel.value = s;
  }
  function disableAll(why) {
    tasks.forEach(function (t) {
      t.querySelector('select').disabled = true;
      t.querySelector('input').disabled = true;
    });
    var h = document.getElementById('hint'); if (h && why) h.textContent = why;
  }
  function save(t) {
    if (!state.db || !state.canWrite) return;
    var id = t.getAttribute('data-id');
    var body = {status: t.querySelector('select').value, note: t.querySelector('input').value.slice(0, 400), by: state.myId || null, at: new Date().toISOString()};
    state.db.doc('audit_items/' + id).set(body).catch(function () {
      var s = t.querySelector('.stamp'); s.textContent = 'Not saved. Reload and try again.';
    });
  }
  tasks.forEach(function (t) {
    var sel = t.querySelector('select'), note = t.querySelector('input');
    sel.addEventListener('change', function () { setStatus(t, sel.value); counts(); save(t); });
    var timer = null;
    note.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { save(t); }, 700); });
    note.addEventListener('blur', function () { clearTimeout(timer); save(t); });
  });
  counts();

  function stamp(t, d, names) {
    var s = t.querySelector('.stamp');
    if (!d || !d.at) { s.textContent = ''; return; }
    var who = (d.by && names[d.by] && names[d.by].name) || (d.by ? 'Someone' : '');
    var when = new Date(d.at); var ws = isNaN(when) ? '' : when.toLocaleString([], {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
    s.textContent = 'Updated ' + (who ? 'by ' + who + ' ' : '') + ws;
  }

  function onSnap(snap) {
    var docs = {}, ids = {};
    snap.docs.forEach(function (d) { docs[d.id] = d.data(); if (d.data() && d.data().by) ids[d.data().by] = 1; });
    var wanted = Object.keys(ids);
    var render = function (names) {
      Object.keys(byId).forEach(function (id) {
        var t = byId[id], d = docs[id];
        var active = document.activeElement;
        if (d) {
          if (STATUS_LABEL[d.status]) setStatus(t, d.status);
          var inp = t.querySelector('input');
          if (active !== inp && inp.value !== (d.note || '')) inp.value = d.note || '';
        }
        stamp(t, d, names);
      });
      counts();
    };
    if (state.user && wanted.length) {
      state.user.profiles(wanted).then(render, function () { render({}); });
    } else render({});
  }

  Promise.all([window.claude && window.claude.use('db'), window.claude && window.claude.use('user')]).then(function (r) {
    state.db = r[0]; state.user = r[1];
    if (!state.db) { disableAll('Read-only view: the shared status needs a signed-in viewer. The defaults are shown.'); return; }
    var p = state.user ? Promise.all([state.user.can('data.write'), state.user.id()]) : Promise.resolve([null, null]);
    p.then(function (v) {
      state.canWrite = v[0] !== false;
      state.myId = v[1];
      if (!state.canWrite) disableAll('You can read the shared status but not change it. Ask for Contributor access.');
      state.db.collection('audit_items').onSnapshot(onSnap, function () {
        disableAll('The shared status could not be loaded. The defaults are shown.');
      });
    });
  }, function () { disableAll('Read-only view. The defaults are shown.'); });
})();
"""


def esc(s):
    return html.escape(s)


def build():
    with open(os.path.join(os.path.dirname(HERE), "brand", "nexonai-logo.png"), "rb") as f:
        logo = base64.b64encode(f.read()).decode()
    counts = {k: 0 for k, _ in STATUSES}
    for _, _, items in GROUPS:
        for it in items:
            counts[it[4]] += 1
    out = []
    out.append("<title>Audit readiness</title>")
    out.append('<meta name="claude:viewport-fit-sides" content="cover">')
    out.append('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>')
    out.append('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap">')
    out.append("<style>%s%s</style>" % (md_to_html.CSS, EXTRA_CSS))
    out.append('<header class="top"><div class="wrap"><span class="logo"><img src="data:image/png;base64,%s" alt="NexonAI Consulting"></span><span class="product">unpruuf<i>.</i></span></div></header>' % logo)
    out.append('<section class="band"><div class="wrap"><span class="eyebrow">For the team · internal</span><h1>Audit readiness</h1>'
               '<p class="lead">What we finish before we order the external audit, what we ask the auditor for, and where we stand on 25 October 2026.</p></div></section>')
    out.append('<main><div class="wrap">')
    out.append('<div class="summary" aria-label="Status summary">'
               + "".join('<div><b id="n-%s">%d</b><span>%s</span></div>' % (k, counts[k], esc(label)) for k, label in STATUSES) + "</div>")
    out.append('<p class="hint" id="hint">Everyone on the team can set a status and write a note; changes show for all of us. The owners are suggestions, the team decides together.</p>')
    n = 0
    for eyebrow, title, items in GROUPS:
        out.append('<div class="group-head"><span class="eyebrow">%s</span><h2>%s</h2></div>' % (esc(eyebrow), esc(title)))
        for iid, head, why, owner, status in items:
            n += 1
            opts = "".join('<option value="%s"%s>%s</option>' % (k, " selected" if k == status else "", esc(l)) for k, l in STATUSES)
            out.append(
                '<article class="task" data-id="%s" data-status="%s"><div class="num">%02d</div><div>'
                '<h3>%s</h3><p>%s</p>'
                '<div class="ctrl"><label>Status<select id="s-%s" aria-label="Status of item %d">%s</select></label>'
                '<label>Suggested owner<span class="owner">%s</span></label>'
                '<label>Note<input type="text" id="n-%s" maxlength="400" placeholder="Add a note" aria-label="Note for item %d"></label></div>'
                '<div class="stamp"></div></div></article>' % (iid, status, n, esc(head), esc(why), iid, n, opts, esc(owner), iid, n))
    out.append('<div class="group-head"><span class="eyebrow">What we ask the auditor for</span><h2>The content of the order</h2></div>')
    out.append('<div class="cols">')
    for head, items in ASK:
        out.append("<div><h3>%s</h3><ul>%s</ul></div>" % (esc(head), "".join("<li>%s</li>" % esc(i) for i in items)))
    out.append("</div>")
    out.append('<div class="group-head"><span class="eyebrow">The result</span><h2>What raises it, and what to expect</h2></div>')
    out.append('<div class="cols"><div><h3>What raises the result most</h3><ol>%s</ol></div><div><h3>What to expect</h3><ul>%s</ul></div></div>'
               % ("".join("<li>%s</li>" % esc(i) for i in RAISES), "".join("<li>%s</li>" % esc(i) for i in EXPECT)))
    out.append('<div class="panel"><span class="eyebrow">Suggested order</span><h2>Five steps</h2><ol>%s</ol></div>' % "".join("<li>%s</li>" % esc(i) for i in ORDER))
    out.append('<p class="hint">F1 first: the audit should check the final format. No certificate is promised or implied; the aim is a credible report with nothing high left open after the retest.</p>')
    out.append("</div></main>")
    out.append('<footer><div class="wrap"><span class="dot"></span><span>NexonAI Consulting SRL, Alba Iulia · pilot phase, not independently audited</span></div></footer>')
    out.append("<script>%s</script>" % JS)
    return "\n".join(out)


if __name__ == "__main__":
    with open(sys.argv[1], "w", encoding="utf-8") as f:
        f.write(build())
    print(sys.argv[1])
