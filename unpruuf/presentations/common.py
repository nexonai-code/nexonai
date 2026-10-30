import json, os, datetime

DARK = "#12201E"
LIGHT = "#F3F6F5"
LIGHT2 = "#E4EDEA"
CARD = "#FBFCFC"
LINE = "#D2DDD9"
TEAL = "#0F6B62"
ORANGE = "#B95A16"
MUTED = "#4A5A56"
ON_DARK = "#E8F0EE"
ON_DARK_MUTED = "#B9CCC7"
DISPLAY = "'Archivo', Arial, sans-serif"
TEXT = "'IBM Plex Sans', Arial, sans-serif"

FACES = {
    "archivo": {"family": "Archivo", "href": "https://fonts.googleapis.com/css2?family=Archivo:wght@500..800&display=swap"},
    "ibm-plex-sans": {"family": "IBM Plex Sans", "href": "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap"},
}

def sec(sid, inner, bg=LIGHT, color=DARK, extra="display:flex;flex-direction:column;gap:48px", transition="fade"):
    return (f'<section id="{sid}" data-transition="{transition}" style="background:{bg};color:{color};'
            f'font-family:{TEXT};padding:128px 128px 160px;{extra}">\n{inner}\n</section>\n')

def eyebrow(t, color=TEAL):
    return f'<p style="font-size:24px;letter-spacing:3px;text-transform:uppercase;color:{color};font-weight:600">{t}</p>'

def h2(t, color=DARK):
    return f'<h2 style="font-family:{DISPLAY};font-size:72px;font-weight:700;line-height:1.1;color:{color}">{t}</h2>'

def head(eb, title, color=DARK, ebcolor=TEAL):
    return f'<div style="display:flex;flex-direction:column;gap:16px">\n{eyebrow(eb, ebcolor)}\n{h2(title, color)}\n</div>'

def footer(deck, n, color=MUTED):
    return f'<p style="position:absolute;left:128px;bottom:64px;width:1664px;font-size:24px;color:{color}">{deck} · NexonAI Consulting SRL · {n}</p>'

def card(title, body, flex="flex:1", bg=CARD, border=LINE, tcolor=DARK, bcolor=MUTED, pad=40):
    return (f'<div style="{flex};display:flex;flex-direction:column;gap:16px;background:{bg};padding:{pad}px;border:1px solid {border};border-radius:16px">\n'
            f'<h3 style="font-family:{DISPLAY};font-size:44px;font-weight:700;line-height:1.15;color:{tcolor}">{title}</h3>\n'
            f'<p style="font-size:32px;line-height:1.4;color:{bcolor}">{body}</p>\n</div>')

def row(*children, gap=32, extra=""):
    return f'<div style="display:flex;gap:{gap}px;{extra}">\n' + "\n".join(children) + "\n</div>"

def notes(t):
    return f"<aside>{t}</aside>"

def write_deck(folder, title, slides, sections):
    os.makedirs(os.path.join(folder, "project", "slides"), exist_ok=True)
    order = [sid for sid, _ in slides]
    deck = {"v": 4, "createdOnFiles": {"v": 1, "at": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")},
            "lists": "css", "title": title, "order": order, "sections": sections, "faces": FACES, "designSystems": []}
    with open(os.path.join(folder, "project", "deck.json"), "w") as f:
        json.dump(deck, f, ensure_ascii=False, indent=1)
    for sid, html in slides:
        with open(os.path.join(folder, "project", "slides", f"{sid}.html"), "w") as f:
            f.write(html)
    return order
