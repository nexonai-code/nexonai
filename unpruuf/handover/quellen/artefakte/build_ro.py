from html import escape as E
css=open('common.css').read()
from data_ro import R
lab={'ok':('construit','ok'),'part':('parțial','warn'),'unk':('construit, neverificat','warn'),'no':('neconstruit','stop')}
areas=[]
for r in R:
    if r[0] not in areas: areas.append(r[0])
rows=''
for ar,f,d,s,n in R:
    t,c=lab[s]
    new=' <span class="chip ok">nou din 8 oct.</span>' if n else ''
    rows+=f'<tr data-area="{E(ar)}"><td class="ar">{E(ar)}</td><td><b>{E(f)}</b>{new}</td><td>{E(d)}</td><td><span class="chip {c}">{t}</span></td></tr>\n'
opts=''.join(f'<option value="{E(x)}">{E(x)}</option>' for x in areas)
extra='''
.ctl{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.ctl input,.ctl select{font:inherit;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:9px 12px;min-width:0}
.ctl input{flex:1 1 220px}
.ctl select{flex:0 1 260px}
.ctl input:focus-visible,.ctl select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.big{max-width:1120px}
.big .tablewrap{overflow:auto;max-height:none}
.big table{min-width:760px;table-layout:fixed}
.big th:nth-child(1){width:15%}.big th:nth-child(2){width:23%}.big th:nth-child(3){width:46%}.big th:nth-child(4){width:16%}
.big td{overflow-wrap:anywhere}
td.ar{font-family:var(--font-mono);font-size:.76rem;color:var(--dim)}
@media (max-width:640px){.big table{min-width:0;table-layout:auto}.big thead{display:none}.big tr{display:block;padding:12px 14px;border-bottom:1px solid var(--line)}.big tr:last-child{border-bottom:0}.big td{display:block;padding:2px 0;border:0}.big td:last-child{margin-top:6px}}
.count{font-family:var(--font-mono);font-size:.8rem;color:var(--dim)}
.empty{padding:20px;color:var(--dim)}
'''
html=f'''<title>unpruuf Tabel de funcții</title>
{css.replace('</style>',extra+'</style>')}
<div class="wrap big">
<header>
<div class="eyebrow">NexonAI · stadiul la 14 octombrie 2026 · aplicația 1.17</div>
<h1>Ce conțin aplicațiile și nodurile</h1>
<p class="lede">Toate funcțiile într-un singur tabel: aplicația Android și edițiile ei, serverul de noduri, nodul Android, releul și uneltele, inclusiv consola pentru clienți (Control). Fiecare rând are starea lui. NexonAI nu operează servere; fiecare server aparține clientului.</p>
<div class="meta">
<span class="chip ok">construit</span>
<span class="chip warn">parțial sau construit, neverificat</span>
<span class="chip stop">neconstruit</span>
</div>
</header>
<div class="callout"><b>Valabil pentru toate părțile Business și pentru avertizori.</b> Verificat cu teste automate și rulări locale. Încă nevăzut pe un telefon real și nu prin rețeaua Tor reală. Încă deschise: Pro Groups și Temp Node pe telefon, pe telefoane reale; Control pe un server real; textele românești citite de un vorbitor nativ; niciun audit independent.</div>
<div class="ctl">
<input id="q" type="search" placeholder="Căutați funcții, de ex. licență, Tor, durată" aria-label="Căutați funcții">
<select id="area" aria-label="Filtrați după zonă"><option value="">Toate zonele</option>{opts}</select>
<span class="count" id="cnt"></span>
</div>
<div class="tablewrap"><table id="t">
<thead><tr><th>Zona</th><th>Funcția</th><th>Ce face</th><th>Stare</th></tr></thead>
<tbody>
{rows}</tbody></table><div class="empty" id="none" hidden>Nicio funcție nu corespunde căutării.</div></div>
<div class="callout ok"><b>Ce vede un nod.</b> Un pachet criptat de 4096 de octeți, o adresă care se schimbă în fiecare oră, durata cerută, momentele depunerii și preluării și numărul de cereri. Nu vede conținutul, expeditorul, destinatarul, numele, listele de contacte sau adresele IP (totul trece prin Tor) și nu poate spune ce adrese aparțin aceleiași conversații. Poate citi lungimea conținutului fiecărui pachet, fiindcă acel număr stă în clar în pachet (constatarea F1). Nu poate citi, nu poate scrie (scrie doar proprietarul) și nu poate șterge (șterge doar timpul), și nici noi nu putem.</div>
<div class="callout"><b>Limită sinceră.</b> Cine urmărește simultan rețeaua ambelor părți poate totuși corela tipare de timp. Este o problemă nerezolvată a oricărui serviciu Tor. Nu s-a finalizat niciun audit de securitate independent, iar unul finalizat nu ar fi un certificat.</div>
<footer>Gabriel Hategan · NexonAI Consulting SRL · Alba Iulia</footer>
</div>
<script>
(function(){{
  var q=document.getElementById('q'),a=document.getElementById('area'),rows=[].slice.call(document.querySelectorAll('#t tbody tr')),c=document.getElementById('cnt'),n=document.getElementById('none');
  function run(){{
    var s=q.value.trim().toLowerCase(),ar=a.value,k=0;
    rows.forEach(function(r){{
      var ok=(!ar||r.getAttribute('data-area')===ar)&&(!s||r.textContent.toLowerCase().indexOf(s)>-1);
      r.hidden=!ok; if(ok)k++;
    }});
    c.textContent=k+' din '+rows.length+' funcții';
    n.hidden=k>0;
  }}
  q.addEventListener('input',run);a.addEventListener('change',run);run();
}})();
</script>
'''
open('feature-table-ro.html','w').write(html)
print(len(R),'rows',len(html))
