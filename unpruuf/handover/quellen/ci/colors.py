import colorsys,json,csv
# name, hex, role
PAL=[
 ("NexonAI Blue","#307098","Primary. Buttons, links, key accents, headings accents. Dark blue from the logo."),
 ("Logo Blue","#5597C7","Large graphic areas and illustrations. The blue of the logo's bar."),
 ("Sky","#90C8E8","Highlights on dark backgrounds. Light blue from the logo."),
 ("Navy","#0F2A3A","Dark surfaces and footers."),
 ("Ink","#172733","Body text and headings on light backgrounds."),
 ("Graphite","#505B63","Secondary text."),
 ("Line","#D9DFE3","Borders and dividers."),
 ("Mist","#EAF2F8","Light blue tint for panels."),
 ("Paper","#F2F4F6","Page and section background."),
 ("White","#FFFFFF","Cards, plates, page."),
 ("Pilot Orange","#A8500F","Warnings, pilot and not-yet-tested labels only."),
 ("Pilot Tint","#F8E7D6","Background for pilot and warning notes."),
 ("Logo Black","#151A23","Wordmark colour inside the logo. Do not use for text; use Ink."),
]
def rgb(h): h=h.lstrip('#');return tuple(int(h[i:i+2],16) for i in (0,2,4))
def hsl(h):
    r,g,b=[v/255 for v in rgb(h)];hh,l,s=colorsys.rgb_to_hls(r,g,b);return round(hh*360),round(s*100),round(l*100)
def cmyk(h):
    r,g,b=[v/255 for v in rgb(h)];k=1-max(r,g,b)
    if k>=1: return (0,0,0,100)
    c=(1-r-k)/(1-k);m=(1-g-k)/(1-k);y=(1-b-k)/(1-k);return tuple(round(v*100) for v in (c,m,y,k))
def lum(h):
    def f(v):
        v/=255;return v/12.92 if v<=0.03928 else ((v+0.055)/1.055)**2.4
    r,g,b=rgb(h);return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def ratio(a,b):
    la,lb=lum(a),lum(b);hi,lo=max(la,lb),min(la,lb);return round((hi+0.05)/(lo+0.05),2)
PAIRS=[("Ink","White"),("Ink","Paper"),("Graphite","White"),("White","NexonAI Blue"),("NexonAI Blue","White"),("Sky","Navy"),("White","Navy"),("Pilot Orange","White"),("Ink","Pilot Tint"),("NexonAI Blue","Mist"),("Logo Blue","White"),("White","Logo Blue")]
H={n:h for n,h,_ in PAL}
def write(out):
    data={"note":"NexonAI colour tokens. CMYK values are a simple screen-to-print conversion for orientation only; proof before print. No Pantone matching has been done.","colors":[{"name":n,"hex":h,"rgb":list(rgb(h)),"hsl":list(hsl(h)),"cmyk":list(cmyk(h)),"role":r} for n,h,r in PAL]}
    json.dump(data,open(out+'/colors.json','w'),indent=2)
    css=":root{\n"+"".join(f"  --nx-{n.lower().replace(' ','-')}:{h};\n" for n,h,_ in PAL)+"}\n"
    open(out+'/brand-colors.css','w').write("/* NexonAI colour tokens */\n"+css)
    open(out+'/palette.gpl','w').write("GIMP Palette\nName: NexonAI\nColumns: 4\n#\n"+"".join(f"{rgb(h)[0]:3d} {rgb(h)[1]:3d} {rgb(h)[2]:3d} {n}\n" for n,h,_ in PAL))
    with open(out+'/contrast.csv','w',newline='') as f:
        w=csv.writer(f);w.writerow(["foreground","background","ratio","AA normal text (4.5)","AA large text (3.0)"])
        for a,b in PAIRS:
            r=ratio(H[a],H[b]);w.writerow([a,b,r,"pass" if r>=4.5 else "fail","pass" if r>=3 else "fail"])
if __name__=="__main__":
    for a,b in PAIRS: print(a,b,ratio(H[a],H[b]))
