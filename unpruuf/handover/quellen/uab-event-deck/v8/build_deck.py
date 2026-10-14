# -*- coding: utf-8 -*-
import sys, docx
from docx.shared import Pt as DPt
from kit import Deck, MONO
import texts_short as T

INK = "#0E2A2E"; TEAL = "#0F6B62"; MINT = "#45D0BB"; BG = "#F2F5F4"; CARD = "#FFFFFF"; LINE = "#D5DEDB"; MUTED = "#5B6B68"
AMBER = "#B95A16"; AMBER_BG = "#FBEBD3"; MINT_BG = "#D9F0EB"; SOFT = "#EAF2F0"; ON_DARK = "#BFD6D3"; RING = "#123D41"

X = {
 "RO": dict(cap="Capturi: panou real, date demo · Telefon: ilustrație", srv="Serverul clientului", noaccess="NexonAI: fără acces", on="PE SERVER", sample="Panou real, date demo"),
 "EN": dict(cap="Screens: real dashboard, demo data · Phone: illustration", srv="The customer's server", noaccess="NexonAI: no access", on="ON THE SERVER", sample="Real dashboard, demo data"),
}

def chrome(s, n, kicker, title, dark=False, size=36):
    s.text(0.8, 0.55, 8.5, 0.4, kicker, size=12, color=(MINT if dark else TEAL), font=MONO, bold=True)
    if title: s.text(0.8, 0.9, 11.7, 1.0, title, size=size, bold=True, color=("#FFFFFF" if dark else INK))
    footer(s, n, dark)

def footer(s, n, dark=False):
    s.pic("logo_white.png" if dark else "logo.png", 0.8, 6.7, h=0.5)  # NexonAI Consulting logo
    if n: s.text(11.0, 6.9, 1.55, 0.3, f"{n} / {T.TOTAL}", size=12, color=MUTED, font=MONO, align="r")

def server_art(s, x, y, w, led=True):
    """A stack of three server units."""
    h = w * 0.22
    for i in range(3):
        yy = y + i * (h + w * 0.05)
        s.rect(x, yy, w, h, fill=INK, radius=0.09)
        s.rect(x + w * 0.07, yy + h * 0.5 - 0.06, 0.12, 0.12, fill=MINT, oval=True)
        s.rect(x + w * 0.22, yy + h * 0.5 - 0.035, w * 0.5, 0.07, fill="#2A4A4E", radius=0.03)
        s.rect(x + w * 0.82, yy + h * 0.5 - 0.035, w * 0.11, 0.07, fill="#2A4A4E", radius=0.03)
    return 3 * h + 2 * w * 0.05

def number_circle(s, x, y, d, n, fill=TEAL, size=18):
    s.rect(x, y, d, d, fill=fill, oval=True)
    s.text(x, y, d, d, str(n), size=size, bold=True, color="#FFFFFF", align="c", anchor="m")

def dark_decor(s):
    s.rect(9.3, -2.2, 6.4, 6.4, fill=RING, oval=True)
    s.rect(11.4, 5.0, 3.6, 3.6, fill=RING, oval=True)

def build(lang, L):
    ex = X[lang]; A = "assets/"
    d = Deck()
    notes = L["notes"]
    # ---- start page ----
    s = d.slide(INK, notes[0]); dark_decor(s)
    st = L["start"]
    s.text(0.8, 0.7, 8.5, 0.4, st["kicker"], size=12, color=MINT, font=MONO, bold=True)
    s.text(0.8, 1.9, 5.7, 2.5, st["title"], size=44, bold=True, color="#FFFFFF")
    s.text(0.8, 4.45, 5.6, 1.3, st["sub"], size=20, bold=True, color=MINT)
    s.text(0.8, 5.95, 6.0, 0.4, st["who"], size=16, color=ON_DARK)
    s.pic(A + f"dash_overview_{lang}.png", 7.35, 1.05, w=5.5, shadow=True)
    s.pic(A + f"phone_{lang}_3.png", 6.85, 3.3, h=3.5, shadow=True)
    s.text(8.6, 4.85, 4.4, 0.3, ex["cap"], size=10.5, color=ON_DARK)
    footer(s, None, dark=True)
    # ---- 1 server ----
    d1 = L["s1"]; s = d.slide(BG, notes[1]); chrome(s, 1, d1["kicker"], d1["title"])
    for i, line in enumerate(d1["lines"]):
        y = 2.15 + i * 1.22
        s.rect(0.8, y, 7.3, 1.05, fill=CARD, line=LINE, radius=0.16)
        number_circle(s, 1.05, y + 0.22, 0.6, i + 1)
        s.text(1.9, y, 6.0, 1.05, line, size=19, anchor="m")
    s.rect(8.5, 2.15, 4.03, 3.45, fill=CARD, line=LINE, radius=0.2, shadow=True)
    hh = server_art(s, 9.1, 2.5, 2.83)
    s.text(8.5, 4.4, 4.03, 0.4, ex["srv"], size=17, bold=True, align="c")
    s.rect(9.25, 4.95, 2.55, 0.4, fill=AMBER_BG, radius=0.2)
    s.text(9.25, 4.95, 2.55, 0.4, ex["noaccess"], size=12, bold=True, color=AMBER, align="c", anchor="m")
    s.rect(0.8, 5.85, 11.73, 0.75, fill=AMBER_BG, radius=0.14)
    s.text(1.05, 5.85, 11.3, 0.75, d1["foot"], size=15, color="#6B3A0B", anchor="m")
    # ---- 2 principle ----
    d2 = L["s2"]; s = d.slide(BG, notes[2]); chrome(s, 2, d2["kicker"], d2["title"])
    s.rect(0.8, 2.0, 6.5, 3.6, fill=CARD, line=LINE, radius=0.2, shadow=True)
    s.rect(3.6, 2.3, 1.7, 3.0, fill=SOFT, line=LINE, radius=0.15)
    s.text(3.6, 2.35, 1.7, 0.3, d2["server"].upper(), size=11, color=MUTED, font=MONO, bold=True, align="c")
    def lane(y, left, mid, right, col, tint):
        s.rect(1.0, y, 1.3, 0.8, fill=SOFT, radius=0.14); s.text(1.0, y, 1.3, 0.8, left, size=19, bold=True, align="c", anchor="m")
        s.arrow(2.35, y + 0.4, 4.1, y + 0.4, color=col)
        s.text(2.35, y - 0.12, 1.6, 0.3, d2["put"], size=12, color=MUTED, align="c")
        s.rect(4.2, y - 0.05, 0.5, 0.9, fill=tint, line=col, radius=0.08, lw=1.5)
        s.text(3.6, y + 0.9, 1.7, 0.3, mid, size=11, color=MUTED, align="c")
        s.arrow(5.75, y + 0.4, 4.78, y + 0.4, color=col, dashed=True)
        s.text(5.0, y - 0.12, 1.0, 0.3, d2["pick"], size=12, color=MUTED, align="c")
        s.rect(5.8, y, 1.3, 0.8, fill=SOFT, radius=0.14); s.text(5.8, y, 1.3, 0.8, right, size=19, bold=True, align="c", anchor="m")
    lane(2.85, d2["a"], d2["boxA"], d2["b"], TEAL, MINT_BG)
    lane(4.25, d2["b"], d2["boxB"], d2["a"], AMBER, AMBER_BG)
    for i, (hd, body) in enumerate(d2["points"]):
        y = 2.0 + i * 1.22
        number_circle(s, 7.75, y + 0.05, 0.55, i + 1, size=17)
        s.text(8.45, y - 0.02, 4.1, 1.2, [(hd, {"size": 19, "bold": True, "space": 3}), (body, {"size": 13.5, "color": MUTED})])
    s.rect(0.8, 5.85, 11.73, 0.75, fill=MINT_BG, radius=0.14)
    s.text(1.05, 5.85, 11.3, 0.75, d2["foot"], size=17, anchor="m")
    # ---- 3 what the server knows ----
    dk = L["s_know"]; s = d.slide(BG, notes[3]); chrome(s, 3, dk["kicker"], dk["title"])
    s.rect(0.8, 2.0, 5.6, 3.6, fill="#060B0D", radius=0.2, shadow=True)
    s.text(1.1, 2.3, 5.1, 3.0, dk["packet"].split("\n"), size=15, color="#8CA3AA", font=MONO, space=5)
    s.text(0.8, 5.65, 5.6, 0.3, dk["illus"], size=10.5, color=MUTED)
    for i, (hd, body) in enumerate(dk["cards"]):
        y = 2.0 + i * 1.25
        s.rect(6.85, y, 5.68, 1.12, fill=CARD, line=LINE, radius=0.16, shadow=True)
        number_circle(s, 7.05, y + 0.28, 0.55, i + 1, size=17)
        s.text(7.8, y + 0.04, 4.6, 1.05, [(hd, {"size": 15.5, "bold": True, "space": 3}), (body, {"size": 12.5, "color": MUTED})], anchor="m")
    s.rect(0.8, 6.0, 11.73, 0.6, fill=MINT_BG, radius=0.14)
    s.text(1.05, 6.0, 11.3, 0.6, dk["foot"], size=16, bold=True, anchor="m")
    # ---- 3 three products + what comes ready ----
    d3 = L["s3"]; s = d.slide(BG, notes[4]); chrome(s, 4, d3["kicker"], d3["title"])
    s.text(6.2, 0.58, 6.33, 0.3, ex["cap"], size=10.5, color=MUTED, align="r")
    for i, (a, b) in enumerate(d3["boxes"]):
        x = 0.8 + i * 3.98
        s.rect(x, 1.9, 3.75, 3.25, fill=CARD, line=LINE, radius=0.2, shadow=True)
        s.rect(x + 0.15, 2.05, 3.45, 1.95, fill=SOFT, radius=0.14)
        if i == 0: s.pic(A + f"phone_{lang}_1.png", x + 1.875 - 0.5 * 1.8 * 1170 / 2532, 2.12, h=1.8)
        elif i == 1: server_art(s, x + 0.95, 2.28, 1.85)
        else: s.pic(A + f"dash_overview_{lang}.png", x + 0.3, 2.1, w=3.05)
        s.text(x + 0.2, 4.1, 3.35, 0.4, a, size=19, bold=True)
        s.text(x + 0.2, 4.5, 3.35, 0.6, b, size=13.5, color=MUTED)
    s.text(0.8, 5.33, 6.0, 0.3, d3["ready_t"], size=12, bold=True, color=TEAL, font=MONO)
    for i, r in enumerate(d3["ready"]):
        x = 0.8 + i * 2.98
        s.rect(x, 5.68, 2.83, 0.92, fill=MINT_BG, radius=0.14)
        s.rect(x + 0.14, 5.9, 0.28, 0.28, fill=TEAL, oval=True)
        s.text(x + 0.14, 5.9, 0.28, 0.28, "✓", size=11, bold=True, color="#FFFFFF", align="c", anchor="m")
        s.text(x + 0.5, 5.68, 2.28, 0.92, r, size=12.5, anchor="m")
    # ---- 4 how it works ----
    d4 = L["s4"]; s = d.slide(BG, notes[5]); chrome(s, 5, d4["kicker"], d4["title"])
    s.text(6.2, 0.58, 6.33, 0.3, ex["cap"], size=10.5, color=MUTED, align="r")
    for i, (a, b) in enumerate(d4["steps"]):
        x = 0.8 + i * 3.98
        s.rect(x, 1.95, 3.75, 3.85, fill=CARD, line=LINE, radius=0.2, shadow=True)
        s.rect(x + 0.15, 2.1, 3.45, 2.2, fill=SOFT, radius=0.14)
        if i == 0: s.pic(A + f"dash_code_{lang}.png", x + 0.25, 2.2, w=3.25)
        elif i == 1: s.pic(A + f"phone_{lang}_1.png", x + 1.875 - 0.5 * 2.0 * 1170 / 2532, 2.2, h=2.0)
        else: s.pic(A + f"dash_case_{lang}.png", x + 0.25, 2.2, w=3.25)
        s.text(x + 0.2, 4.4, 3.35, 0.5, a, size=18, bold=True)
        s.text(x + 0.2, 4.9, 3.35, 0.85, b, size=13.5, color=MUTED)
        if i < 2:
            s.rect(x + 3.75 + 0.1125 - 0.22, 3.0, 0.44, 0.44, fill=TEAL, oval=True)
            s.text(x + 3.75 + 0.1125 - 0.22, 3.0, 0.44, 0.44, "›", size=20, bold=True, color="#FFFFFF", align="c", anchor="m")
    s.rect(0.8, 5.98, 11.73, 0.7, fill=MINT_BG, radius=0.14)
    s.text(1.05, 5.98, 11.3, 0.7, d4["foot"], size=14.5, anchor="m")
    # ---- 6 only the customer has the data ----
    d5 = L["s_only"]; s = d.slide(BG, notes[6]); chrome(s, 6, d5["kicker"], d5["title"])
    for col, (hd, items) in enumerate(d5["cols"]):
        x = 0.8 + col * 3.98
        s.rect(x, 1.95, 3.75, 3.75, fill=CARD, line=LINE, radius=0.2, shadow=True)
        pill, hc = ((MINT_BG, TEAL), (MINT_BG, TEAL), (AMBER_BG, AMBER))[col]
        s.rect(x + 0.2, 2.15, 2.4, 0.36, fill=pill, radius=0.18)
        s.text(x + 0.2, 2.15, 2.4, 0.36, hd, size=11.5, bold=True, color=hc, font=MONO, align="c", anchor="m")
        s.text(x + 0.22, 2.7, 3.35, 3.0, [("•  " + t, {"space": 8}) for t in items], size=13.5)
    s.text(0.8, 5.9, 11.7, 0.6, d5["foot"], size=15, bold=True, color=MUTED)
    # ---- 6 honest ----
    d6 = L["s6"]; s = d.slide(BG, notes[7]); chrome(s, 7, d6["kicker"], d6["title"])
    for i, b in enumerate(d6["bullets"]):
        x = 0.8 + (i % 2) * 5.98; y = 2.05 + (i // 2) * 1.7
        s.rect(x, y, 5.75, 1.45, fill=CARD, line=LINE, radius=0.2, shadow=True)
        s.rect(x + 0.3, y + 0.42, 0.6, 0.6, fill=AMBER_BG, oval=True)
        s.text(x + 0.3, y + 0.42, 0.6, 0.6, "!", size=22, bold=True, color=AMBER, align="c", anchor="m")
        s.text(x + 1.15, y, 4.4, 1.45, b, size=18, anchor="m")
    s.text(0.8, 5.65, 11.7, 0.5, d6["foot"], size=18, color=MUTED)
    # ---- last page ----
    e = L["end"]; s = d.slide(INK, notes[8]); dark_decor(s)
    s.text(0.8, 0.7, 8.5, 0.4, e["kicker"], size=12, color=MINT, font=MONO, bold=True)
    s.text(0.8, 1.5, 7.3, 2.4, e["title"], size=36, bold=True, color="#FFFFFF")
    s.text(0.8, 4.0, 7.0, 1.3, e["sub"], size=18, color=ON_DARK)
    s.text(0.8, 5.35, 7.0, 1.2, e["contact"].split("\n"), size=17, color="#FFFFFF")
    s.pic("assets/qr_card.png", 8.8, 1.5, w=3.5)
    s.text(8.8, 5.1, 3.5, 0.4, e["qr"], size=12, color=ON_DARK, align="c")
    footer(s, None, dark=True)
    return d

def sprech(lang, notes, title_txt, version):
    dc = docx.Document(); dc.styles['Normal'].font.name = 'Calibri'; dc.styles['Normal'].font.size = DPt(12)
    dc.add_heading(title_txt, 1)
    for n in notes:
        head, *body = n.split("\n"); dc.add_heading(head, 2)
        for line in body: dc.add_paragraph(line)
    dc.save(f"Sprechtext_Kurz_{lang}_{version}.docx")

if __name__ == "__main__":
    V = "v11"
    for lang, L in (("RO", T.RO), ("EN", T.EN)):
        d = build(lang, L)
        d.save(f"UAB-Pitch-Kurz_2026-10-14_{lang}_{V}.pptx"); d.html(f"deck_{lang}.html")
        print(lang, len(d.slides))
    sprech("RO", T.RO["notes"], "Text de prezentare · versiunea scurtă", V)
    sprech("EN", T.EN["notes"], "Speaker text · short version", V)
    sprech("DE", T.DE_NOTES, "Sprechtext · Kurzfassung", V)
