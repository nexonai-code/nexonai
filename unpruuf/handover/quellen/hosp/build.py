import sys,re
sys.path.insert(0,'/home/user/nexonai/design')
from kit import page,section,hero,chip,card
def tag(t,cls=''): return f'<span class="ht {cls}">{t}</span>'
def idea(i,title,text,uses,fit):
    return f'<div class="nx-card idea"><div class="idea-top"><span class="hid">{i}</span><span class="fit {fit}">{ {"s":"Strong","m":"With caveats","n":"Leave it"}[fit] }</span></div><h3>{title}</h3><p>{text}</p><div class="uses">{"".join(tag(u) for u in uses)}</div></div>'
A=[
("H1","Staff whistleblowing channel","Corruption, informal payments, procurement, harassment, violence against nursing staff, abuse in residency training. In steep hierarchies, fear of retaliation is the normal case.",["safeline"],"s"),
("H2","Anonymous near-miss and patient-safety reports","Staff report errors and risks without a name, with a way to answer back. Same system, other categories, other recipient (quality management).",["safeline"],"s"),
("H3","Emergency channel during a cyber attack","A communication path on servers outside the hospital network, reachable over mobile data. When mail, intranet and the hospital system are encrypted, the crisis team coordinates there.",["Business"],"s"),
("H4","Recovery keys with multi-person release","Admin passwords and backup keys sealed in advance, released only when two of three responsible people agree (k-of-n rule).",["Courier engine"],"s"),
("H5","Data-breach reporting with a 72-hour clock","Staff report a data incident to the data protection officer, the deadline counts down in view. Deadline tracking already exists in safeline.",["safeline"],"s"),
]
B=[
("H6","Patient and relative complaints","QR code on the ward. Separate from the staff channel, with its own officer.",["safeline"],"m"),
("H7","Adverse drug and device events","Staff report to the pharmacy or vigilance officer, with case handling.",["safeline"],"m"),
("H8","Ethics committee cases","Confidential cases (treatment withdrawal, conflicts, allegations) discussed without mailing lists and without traces.",["Business"],"m"),
("H9","Anonymous questions to management","Staff ask about rosters, overtime, equipment. Management answers openly without knowing who asked.",["Business"],"m"),
("H10","Works council and union channel","Confidential advice the employer cannot read, when the server belongs to the employee side.",["Business","safeline"],"m"),
("H11","Management, legal, HR, board","Takeovers, personnel matters, negotiations with insurers and suppliers. Sensitive but far from clinical work.",["Business"],"m"),
("H12","Procurement integrity","Reports on bid rigging and overpriced equipment, handled by legal or controlling.",["safeline"],"m"),
]
C=[
("H13","Lone-worker safety","Home-care nurses, ambulance crews, night duty. A sign-of-life rule alerts the control room when a check-in is missing.",["Courier engine"],"m"),
("H14","Result pickup by patients","The hospital deposits a result or discharge letter, the patient gets a code on paper and collects it in the app, no portal account. Limit: parcels stay 24 hours at most; only what the patient saves locally remains.",["Courier engine","Client app"],"m"),
("H15","Second opinion from small hospitals","Reports and reduced images from a county hospital to a specialist centre. Limit: large imaging series are too big for small parcels over Tor.",["Business"],"m"),
("H16","Trial correspondence","Site and sponsor questions without a shared platform.",["Business"],"m"),
("H17","Advance directives","Palliative wards hand a sealed directive to relatives under a rule.",["Courier engine","Vault concept"],"m"),
("H18","Hospital groups","Each site with its own server, central compliance sees only what it should.",["safeline","Business"],"m"),
]
N=[
("Everyday clinical messaging","Handover, orders, finding discussions. The system has no identities and archives nothing on purpose. Medical records need attributable senders and retention. That is a contradiction with the architecture, not a gap to close."),
("Anything that influences diagnosis or treatment","It would raise medical device questions."),
("Live chat with relatives on intensive care","This needs identities."),
]
grid=lambda items:'<div class="nx-grid g2">'+''.join(idea(*i) for i in items)+'</div>'
facts='''<div class="nx-grid g3">
<div class="nx-card"><div class="big">Law 361/2022</div><p>Public institutions must have an internal reporting channel regardless of headcount (secondary source). Private companies with 50 to 249 employees since 17 December 2023. Whether healthcare has a special rule was not found. Check the statute before any sales conversation.</p><p class="src"><a href="https://avocatnet.ro/t16483/avertizori-de-integritate.html" target="_blank" rel="noopener">Avocatnet</a></p></div>
<div class="nx-card"><div class="big">26 hospitals</div><p>The Hipocrate ransomware attack of February 2024 hit at least 26 hospitals. At least 18 switched to paper records.</p><p class="src"><a href="https://hotnews.ro/26-de-spitale-atacate-informatic-care-este-compania-care-furnizeaza-solutia-hipocrate-17118" target="_blank" rel="noopener">HotNews</a> · <a href="https://romania.europalibera.org/amp/atac-cibernetic-spitale-firme-gestiune-hipocrate/32815748.html" target="_blank" rel="noopener">Europa Liberă</a></p></div>
<div class="nx-card"><div class="big">NIS2</div><p>Health is a covered sector. Romania transposed the directive (GEO 155/2024, Law 124/2025). No hospital-specific duties found. Expect security questions about vendors.</p><p class="src"><a href="https://cms.law/en/rou/legal-updates/romania-launches-orders-to-implement-the-nis2-framework-30-day-registration-deadline-in-effect" target="_blank" rel="noopener">CMS</a></p></div></div>'''
notgo=''.join(f'<div class="nx-card"><h3>{t}</h3><p>{d}</p></div>' for t,d in N)
qs=["How do staff raise concerns today, and who receives and records them?","How many reports a year, and how many were anonymous?","Do you run near-miss (CIRS) reporting, and who reads it?","What do you use when IT systems are down? Paper, phones, WhatsApp?","Who decides on a new internal reporting tool: compliance, quality, IT, management? What is the purchasing route?","Do you require security certificates from vendors (ISO 27001, NIS2 supplier checks)?","Where would a server run, in your data centre or at a hosting provider, and who would administer it?","What would make you trust a product that is tested but not yet independently audited?","Which data must never leave the hospital?"]
qh='<ol class="q">'+''.join(f'<li>{q}</li>' for q in qs)+'</ol>'
body=hero(chip('Internal brainstorm'),'What a hospital can do with our system.','Eighteen ideas, sorted by how well they fit what the system really is: customer-run servers, no identities, parcels that expire after at most 24 hours. Five are strong, thirteen need care, and three directions we should leave alone.')
body+=section('facts',chip('Starting point'),'Three facts that set the frame.','',facts)
body+=section('strong',chip('Strong fit'),'Where the system fits directly.','The channel is a legal duty with a buyer. The emergency channel answers a pain every hospital manager has known since 2024.',grid(A),alt=True)
body+=section('caveats',chip('With caveats'),'Good ideas that need adjustment.','',grid(B+C))
body+=section('leave',chip('Leave it'),'Directions we should not go.','',f'<div class="nx-grid g3">{notgo}</div>',alt=True)
reco='''<div class="nx-grid g2">
<div class="nx-card"><h3>Strongest direction</h3><p>safeline with patient-safety reports (H1, H2) together with the emergency channel (H3). The whistleblowing channel has a buyer and a deadline, the emergency channel has a documented pain. Both work without identities, without an archive problem and without a medical-device question.</p></div>
<div class="nx-card"><h3>Riskiest assumption</h3><p>That a public hospital buys a product that is not yet independently audited. Public hospitals buy through procurement procedures, and NIS2 makes security evidence more important. Private hospitals and clinics of smaller groups are more realistic than county hospitals.</p></div>
<div class="nx-card"><h3>Next step</h3><p>Three conversations with compliance or quality officers, two private houses and one public, in our region. Ask first how reports and near-misses reach them today. A page for hospitals comes after, not before.</p></div>
<div class="nx-card"><h3>Parked</h3><p>Result pickup (H14) and lone-worker safety (H13). Both are good, but they need the app on patients' or crews' private phones, which is a second market.</p></div></div>'''
body+=section('reco',chip('Position'),'Where we would start.','',reco)
body+=section('questions',chip('Conversations'),'Questions for the first three hospitals.','Ask in this order. The first two reveal the real process before any product is mentioned.',qh,alt=True)
body+='''<section class="nx-section"><div class="nx-wrap"><p class="nx-note">Status: safeline and Business are tested and work. Press, Ghost Mode and the Client app are not finished products. No independent audit, no certification. Legal points above come from secondary sources and need a lawyer's check. Prepared 19 October 2026.</p></div></section>'''
html=page('Hospital Use Cases',('INTERNAL','Brainstorm · Hospitals','Brainstorm · Hospitals'),[('facts','Facts','Facts'),('strong','Strong','Strong'),('caveats','Caveats','Caveats'),('leave','Leave it','Leave it'),('reco','Position','Position'),('questions','Questions','Questions')],body,footer_note=('© 2026 NexonAI Consulting SRL. Not audited, not certified.','© 2026 NexonAI Consulting SRL. Not audited, not certified.'))
html=re.sub(r'<div class="nx-lang".*?</div></div></header>','</div></header>',html,flags=re.S)
html=html.replace('<span>gabriel@nexonai.ro</span><span>+40 773 829 646</span>','<span>unpruuf@nexonai.ro</span>')
# kit shows both languages through data-l; the page text is plain English, only chrome uses E(); force EN
html=html.replace('<script>','<script>document.documentElement.setAttribute("data-lang","en");',1)
css='''<style>
:root{--primary:#307098;--primary-container:#0f2a3a;--primary-tint:#e3eef6;--primary-mint:#90c8e8;--primary-soft:rgba(48,112,152,.10);--surface:#f7f9fa;--surface-low:#f2f4f6;--surface-mid:#eaedef;--surface-high:#e3e8eb;--on-surface:#172733;--on-variant:#505b63;--secondary:#505b63;--placeholder:#7a8a93;--line:#d9dfe3;--outline:#c3ccd2;--result:#e8f0f6}
.nx-grid.g2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:20px}
.nx-grid.g3{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:20px}
.idea{display:flex;flex-direction:column;gap:10px;min-width:0}.idea h3{font-size:19px;line-height:1.3;margin:0}.idea p{margin:0;color:var(--on-variant);line-height:1.6}
.idea-top{display:flex;justify-content:space-between;align-items:center}
.hid{font:700 12px "DejaVu Sans Mono",monospace;letter-spacing:.08em;color:var(--primary)}
.fit{font:600 10px "DejaVu Sans Mono",monospace;letter-spacing:.08em;text-transform:uppercase;padding:3px 8px;border-radius:999px}
.fit.s{background:#e3eef6;color:#1f5578}.fit.m{background:#f8e7d6;color:#a8500f}.fit.n{background:#e6e9e8;color:#46564f}
.uses{display:flex;flex-wrap:wrap;gap:6px;margin-top:auto}.ht{font:600 10px "DejaVu Sans Mono",monospace;letter-spacing:.06em;text-transform:uppercase;background:var(--surface-mid);color:var(--on-variant);padding:3px 8px;border-radius:6px}
.big{font:800 26px "Open Sans",sans-serif;letter-spacing:-.02em;color:var(--primary);margin-bottom:8px}.src{font-size:13px;color:var(--on-variant)}.src a{color:var(--primary);text-decoration:underline}
.q{margin:0;padding-left:22px;display:grid;gap:12px;max-width:760px;font-size:16px;line-height:1.6}.nx-note{max-width:820px;font-size:13px;line-height:1.6;color:var(--on-variant)}
</style>'''
out='<meta name="claude:viewport-fit-sides" content="cover">\n'+html+css
open('hospitals.html','w').write(out);print(len(out))
