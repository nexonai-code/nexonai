src=open('build.py').read().split("import os\nos.makedirs")[0]
exec(src)
import os
PH=RGBColor(0x6B,0x77,0x80)
def ph(par,text,size=10,bold=False):
    r=par.add_run('['+text+']');fonts(r,SANS,size,bold,PH,True);return r
import re as _re
def rich(par,text,size=10,bold=False):
    for part in _re.split(r'(\[[^\]]*\])',text):
        if not part: continue
        if part.startswith('['): ph(par,part[1:-1],size)
        else:
            r=par.add_run(part);fonts(r,SANS,size,bold,INK)
def label(par,text,size=7.5):
    r=par.add_run(text.upper());fonts(r,MONO,size,False,BLUE)
def setup_ro(d):
    setup(d,'en');header_footer(d,'en')
    s=d.sections[0];s.top_margin=Cm(3.2);s.bottom_margin=Cm(2.2)
    d.styles['Normal'].paragraph_format.space_after=Pt(4)
def kv_table(d,left,right,lt,rt):
    tb=d.add_table(rows=1,cols=2);margins(tb)
    for ci,(items,title) in enumerate(((left,lt),(right,rt))):
        c=tb.cell(0,ci);cell_fill(c,'F2F4F6');cell_borders(c,'F2F4F6');
        p=c.paragraphs[0];p.paragraph_format.space_after=Pt(4);label(p,title)
        for k,v in items:
            q=c.add_paragraph();q.paragraph_format.space_after=Pt(1)
            r=q.add_run(k+': ');fonts(r,SANS,9,False,GRAPH)
            rich(q,v,9,not v.startswith('['))
    setw(tb,[8,8]);return tb
SUP=[('Company','NexonAI Consulting SRL'),('VAT ID','[VAT ID, e.g. RO…]'),('Company reg. no.','[registration number]'),('Address','[street, number], Alba Iulia, Romania'),('Bank','[bank name]'),('IBAN / BIC','[IBAN] / [BIC]'),('Contact','gabriel@nexonai.ro · +40 773 829 646')]
CLI=[('Company','[customer company]'),('VAT ID','[customer VAT ID]'),('Company reg. no.','[registration number]'),('Address','[customer address]'),('Contact person','[name]'),('E-mail','[e-mail]')]

def spacer(d,pt=4):
    p=d.add_paragraph();p.paragraph_format.space_after=Pt(0);p.paragraph_format.space_before=Pt(0);p.paragraph_format.line_spacing=1.0
    r=p.add_run(' ');r.font.size=Pt(pt);return p
def setw(tb,widths):
    tb.autofit=False
    grid=tb._tbl.tblGrid
    for gc,w in zip(grid.findall(qn('w:gridCol')),widths): gc.set(qn('w:w'),str(int(w*567)))
    for row in tb.rows:
        for c,w in zip(row.cells,widths): c.width=Cm(w)
def meta(d,labels,vals):
    tb=d.add_table(rows=2,cols=len(labels));margins(tb)
    for i,(l,v) in enumerate(zip(labels,vals)):
        a,b=tb.cell(0,i),tb.cell(1,i);cell_fill(a,'EAF2F8');cell_fill(b,'EAF2F8');cell_borders(a,'EAF2F8');cell_borders(b,'EAF2F8')
        cell_text(a,l.upper(),False,BLUE,7.5,True)
        p=b.paragraphs[0];p.paragraph_format.space_after=Pt(2);p.paragraph_format.space_before=Pt(2);rich(p,v,10,not v.startswith('['))
    setw(tb,[16/len(labels)]*len(labels))
def items(d,heads,widths,nrows,aligns):
    tb=d.add_table(rows=1+nrows,cols=len(heads));margins(tb)
    for i,hh in enumerate(heads):
        c=tb.cell(0,i);cell_fill(c,'307098');cell_borders(c,'307098');cell_text(c,hh,True,RGBColor(255,255,255),8.5)
        c.paragraphs[0].alignment=aligns[i]
    for r in range(1,nrows+1):
        for i in range(len(heads)):
            c=tb.cell(r,i);cell_borders(c);cell_text(c,str(r) if i==0 else ' ',size=9.5);c.paragraphs[0].alignment=aligns[i]
    setw(tb,widths);return tb
def totals(d,rows):
    tb=d.add_table(rows=len(rows),cols=2);margins(tb);tb.alignment=WD_TABLE_ALIGNMENT.RIGHT
    for i,(k,last) in enumerate(rows):
        a,b=tb.cell(i,0),tb.cell(i,1)
        for c in (a,b):
            cell_borders(c,'D9DFE3')
            if last: cell_fill(c,'307098')
        col=RGBColor(255,255,255) if last else INK
        cell_text(a,k,last,col,10 if last else 9.5);cell_text(b,' ',last,col,10)
        b.paragraphs[0].alignment=WD_ALIGN_PARAGRAPH.RIGHT
    setw(tb,[5.5,3.5])
def h(d,text): 
    p=d.add_paragraph(text,style='Heading 2');return p
def line(d,k,v):
    p=d.add_paragraph();p.paragraph_format.space_after=Pt(2)
    r=p.add_run(k+': ');fonts(r,SANS,9.5,True,INK)
    rich(p,v,9.5,False)
R=WD_ALIGN_PARAGRAPH.RIGHT;Lf=WD_ALIGN_PARAGRAPH.LEFT;C=WD_ALIGN_PARAGRAPH.CENTER
def factura():
    d=Document();setup_ro(d)
    d.add_paragraph('INVOICE',style='NX Label')
    p=d.add_paragraph(style='Title');p.add_run('Invoice');
    q=d.add_paragraph(style='Subtitle');q.add_run('Series ');ph(q,'SERIES',13);q.add_run('  no. ');ph(q,'NUMBER',13)
    meta(d,['Issue date','Due date','Currency','PO / reference'],['[dd.mm.yyyy]','[dd.mm.yyyy]','EUR','[no.]'])
    spacer(d)
    kv_table(d,SUP,CLI,'Supplier','Customer')
    spacer(d)
    items(d,['No.','Description of goods / services','Unit','Qty','Unit price (excl. VAT)','Amount (excl. VAT)','VAT %'],[1.0,6.2,1.3,1.4,2.3,2.3,1.5],3,[C,Lf,C,R,R,R,R])
    spacer(d)
    totals(d,[('Subtotal (excl. VAT)',False),('VAT',False),('Total due',True)])
    h(d,'Payment terms')
    line(d,'Due','[number] days from invoice date, by bank transfer to the account above')
    line(d,'Notes','[if applicable, e.g. Reverse charge: VAT to be accounted for by the recipient]')
    n=d.add_paragraph(style='NX Note');r=n.add_run('Note  ');fonts(r,MONO,8.5,True,BLUE)
    n.add_run('Layout template. Check the e-invoicing rules of the customer country first (Romania: RO e-Factura).')
    d.core_properties.author='NexonAI Consulting SRL';d.core_properties.title='Invoice';return d
def oferta():
    d=Document();setup_ro(d)
    d.add_paragraph('PROPOSAL',style='NX Label')
    d.add_paragraph('Proposal',style='Title')
    q=d.add_paragraph(style='Subtitle');ph(q,'proposal title / subject',13)
    meta(d,['Reference','Date','Valid until','Currency'],['[ref.]','[dd.mm.yyyy]','[dd.mm.yyyy]','EUR'])
    spacer(d)
    kv_table(d,[('Company','NexonAI Consulting SRL'),('Address','[street, number], Alba Iulia, Romania'),('Contact person','Gabriel Hategan'),('E-mail','gabriel@nexonai.ro'),('Phone','+40 773 829 646')],
             [('Company','[customer company]'),('Address','[customer address]'),('Contact person','[name]'),('E-mail','[e-mail]')],'From','To')
    d.add_paragraph('1. Scope',style='Heading 1').paragraph_format.space_before=Pt(8)
    p=d.add_paragraph();ph(p,'Describe the customer situation and what you propose, in two to four sentences.',10)
    d.add_paragraph('2. Services and deliverables',style='Heading 1').paragraph_format.space_before=Pt(8)
    for t in ('[service or deliverable 1]','[service or deliverable 2]','[service or deliverable 3]'):
        p=d.add_paragraph(style='List Bullet');ph(p,t[1:-1],10.5)
    d.add_paragraph('3. Pricing',style='Heading 1').paragraph_format.space_before=Pt(8)
    items(d,['No.','Description','Unit','Qty','Unit price','Amount'],[1.0,7.3,1.5,1.5,2.4,2.3],3,[C,Lf,C,R,R,R])
    spacer(d)
    totals(d,[('Subtotal (excl. VAT)',False),('VAT',False),('Total',True)])
    d.add_paragraph('4. Terms',style='Heading 1')
    line(d,'Delivery time','[timeframe]')
    line(d,'Payment terms','[e.g. advance payment and balance on delivery]')
    line(d,'Validity','this proposal is valid until the date stated above')
    line(d,'VAT','[prices exclude / include VAT]')
    d.add_paragraph('5. Acceptance',style='Heading 1')
    tb=d.add_table(rows=1,cols=2);margins(tb)
    for i,(t,n) in enumerate((('For NexonAI Consulting SRL','Gabriel Hategan'),('For the customer','[name, title]'))):
        c=tb.cell(0,i);cell_borders(c,'D9DFE3');p=c.paragraphs[0];label(p,t)
        q=c.add_paragraph();q.paragraph_format.space_before=Pt(30);q.paragraph_format.space_after=Pt(2)
        if n.startswith('['): ph(q,n[1:-1],9.5)
        else:
            r=q.add_run(n);fonts(r,SANS,9.5,True)
        q=c.add_paragraph();r=q.add_run('Date and signature: ____________________');fonts(r,SANS,9,color=GRAPH)
    setw(tb,[8,8])
    d.core_properties.author='NexonAI Consulting SRL';d.core_properties.title='Proposal';return d
os.makedirs('out3',exist_ok=True)
factura().save('out3/NexonAI_Template_Invoice_EN.docx');oferta().save('out3/NexonAI_Template_Proposal_EN.docx')
