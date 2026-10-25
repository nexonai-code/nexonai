#!/usr/bin/env python3
"""Markdown (the subset our documents use) -> one HTML page in the NexonAI / unpruuf design.

Usage: python3 md_to_html.py input.md output.html --eyebrow "For the team" [--lead-first-paragraph]
                              [--footer "text"] [--title "Page name"]

The first H1 becomes the title in the dark band, the first paragraph after it (with --lead-first-paragraph)
the lead. The result is a page fragment for the Artifact tool (no doctype/head/body): a <title>, one <style>
with tokens for light and dark, and the markup. Design source: design/NEXONAI_DESIGN.md.
"""
import argparse
import base64
import html
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
INLINE = re.compile(r"(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))")


def inline(text):
    out = []
    for part in INLINE.split(text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**"):
            out.append("<strong>" + html.escape(part[2:-2]) + "</strong>")
        elif part.startswith("`") and part.endswith("`"):
            out.append("<code>" + html.escape(part[1:-1]) + "</code>")
        elif part.startswith("["):
            m = re.match(r"\[([^\]]+)\]\(([^)]+)\)", part)
            url = m.group(2)
            if url.startswith("http"):
                out.append('<a href="%s" target="_blank" rel="noopener">%s</a>' % (html.escape(url, True), html.escape(m.group(1))))
            else:
                out.append(html.escape(m.group(1)))
        else:
            out.append(html.escape(part))
    return "".join(out)


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:48] or "section"


def render_table(rows):
    head, body = rows[0], rows[1:]
    h = ["<div class=\"table-wrap\"><table><thead><tr>"]
    h += ["<th>%s</th>" % inline(c) for c in head]
    h.append("</tr></thead><tbody>")
    for r in body:
        h.append("<tr>")
        for i, c in enumerate(r):
            cls = ""
            plain = re.sub(r"[`*]", "", c)
            if i == 0 and 0 < len(plain) <= 14 and re.match(r"^[A-Za-z0-9 ,./+\-]+$", plain):
                cls = ' class="id"'
            h.append("<td%s>%s</td>" % (cls, inline(c)))
        h.append("</tr>")
    h.append("</tbody></table></div>")
    return "".join(h)


def convert(md, eyebrow, lead_first, footer, title_override):
    lines = md.split("\n")
    title = None
    lead = None
    body = []
    i = 0
    list_kind = None

    def close_list():
        nonlocal list_kind
        if list_kind:
            body.append("</%s>" % list_kind)
            list_kind = None

    while i < len(lines):
        line = lines[i]
        s = line.strip()
        if s.startswith("```"):
            close_list()
            i += 1
            block = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                block.append(lines[i].strip("\n"))
                i += 1
            indent = min((len(b) - len(b.lstrip()) for b in block if b.strip()), default=0)
            body.append("<pre><code>%s</code></pre>" % html.escape("\n".join(b[indent:] for b in block)))
            i += 1
            continue
        if s.startswith("|"):
            close_list()
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-{3,}:?", c) for c in cells):
                    rows.append(cells)
                i += 1
            body.append(render_table(rows))
            continue
        m = re.match(r"^(#{1,3}) (.*)", s)
        if m:
            close_list()
            level, text = len(m.group(1)), m.group(2)
            if level == 1 and title is None:
                title = text
            elif level == 1:
                body.append("<h2>%s</h2>" % inline(text))
            else:
                body.append("<h%d id=\"%s\">%s</h%d>" % (level, slug(text), inline(text), level))
            i += 1
            continue
        m = re.match(r"^\s*- (.*)", line)
        if m:
            if list_kind != "ul":
                close_list()
                body.append("<ul>")
                list_kind = "ul"
            body.append("<li>%s</li>" % inline(m.group(1)))
            i += 1
            continue
        m = re.match(r"^\s*\d+\. (.*)", line)
        if m:
            if list_kind != "ol":
                close_list()
                body.append("<ol>")
                list_kind = "ol"
            body.append("<li>%s</li>" % inline(m.group(1)))
            i += 1
            continue
        if s == "---":
            close_list()
            body.append("<hr>")
            i += 1
            continue
        if s:
            close_list()
            if lead_first and title is not None and lead is None:
                lead = s
            else:
                body.append("<p>%s</p>" % inline(s))
        i += 1
    close_list()
    return (title_override or title or "Document"), title, lead, "\n".join(body)


CSS = """
/* Layout: white page, dark navy title band like the site's hero, hairline rules, flat, 4px radius, Open Sans. */
:root{--ink:#0f2a3a;--accent:#307098;--accent-hover:#235577;--bright:#90c8e8;--muted:#4a5a66;--line:#d9e4ea;--paper:#f2f6f9;--bg:#ffffff;--fg:#0f2a3a;--band:#0f2a3a;--band-fg:#ffffff;--band-muted:#c5d1d9;--code-bg:#f2f6f9;--pre-bg:#0f2a3a;--pre-fg:#e8f0f5;--logo-bg:transparent;--sans:'Open Sans','Segoe UI',Arial,sans-serif;--mono:'DejaVu Sans Mono','DejaVu Mono',ui-monospace,Menlo,Consolas,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--accent:#90c8e8;--accent-hover:#a6d3ec;--muted:#9fb3c0;--line:#24404f;--paper:#112a3a;--bg:#0a1b26;--fg:#e8f0f5;--band:#0f2a3a;--code-bg:#112a3a;--pre-bg:#0f2a3a;--logo-bg:#ffffff;color-scheme:dark}}
:root[data-theme="dark"]{--accent:#90c8e8;--accent-hover:#a6d3ec;--muted:#9fb3c0;--line:#24404f;--paper:#112a3a;--bg:#0a1b26;--fg:#e8f0f5;--band:#0f2a3a;--code-bg:#112a3a;--pre-bg:#0f2a3a;--logo-bg:#ffffff;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;font:16px/1.65 var(--sans);color:var(--fg);background:var(--bg);-webkit-text-size-adjust:100%}
.wrap{max-width:960px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
header.top{border-bottom:1px solid var(--line);background:var(--bg)}
header.top .wrap{display:flex;align-items:center;gap:16px;padding-block:14px;flex-wrap:wrap}
.logo{background:var(--logo-bg);border-radius:var(--radius);padding:4px 8px;display:flex}
.logo img{height:40px;width:auto;display:block}
.product{font-size:26px;font-weight:800;letter-spacing:-.06em;line-height:1;padding-left:16px;border-left:1px solid var(--line);color:var(--fg)}
.product i{font-style:normal;color:var(--accent)}
.band{background:var(--band);color:var(--band-fg)}
.band .wrap{padding-block:64px 56px}
.eyebrow{display:block;font-size:11px;line-height:1.5;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin-bottom:20px}
.band .eyebrow{color:var(--bright)}
h1{margin:0;font-size:clamp(34px,5vw,56px);font-weight:700;line-height:1.08;letter-spacing:-.052em;text-wrap:balance;max-width:820px}
.band .lead{margin:24px 0 0;max-width:680px;font-size:18px;line-height:1.65;color:var(--band-muted)}
main .wrap{padding-block:48px 72px}
h2{margin:56px 0 18px;padding-top:28px;border-top:1px solid var(--line);font-size:clamp(26px,3vw,36px);font-weight:700;line-height:1.15;letter-spacing:-.04em;text-wrap:balance;color:var(--fg)}
h2:first-child{margin-top:0;border-top:0;padding-top:0}
h3{margin:36px 0 10px;font-size:22px;font-weight:700;line-height:1.2;letter-spacing:-.03em;color:var(--fg)}
p{margin:0 0 16px;color:var(--muted);max-width:72ch}
p strong,li strong{color:var(--fg)}
ul,ol{margin:0 0 20px;padding-left:22px;color:var(--muted);max-width:76ch}
li{margin:0 0 8px;padding-left:4px}
li::marker{color:var(--accent)}
a{color:var(--accent);font-weight:600;text-decoration:underline;text-underline-offset:3px}
a:hover{color:var(--accent-hover)}
a:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:2px}
hr{border:0;border-top:1px solid var(--line);margin:40px 0}
code{font-family:var(--mono);font-size:.86em;background:var(--code-bg);padding:1px 6px;border-radius:var(--radius);color:var(--fg);overflow-wrap:anywhere}
pre{margin:0 0 20px;background:var(--pre-bg);color:var(--pre-fg);border-radius:var(--radius);padding:16px 18px;overflow-x:auto;font-size:13px;line-height:1.55}
pre code{background:none;padding:0;color:inherit;font-size:inherit;overflow-wrap:normal}
.table-wrap{overflow-x:auto;margin:8px 0 28px;border-top:1px solid var(--line)}
table{border-collapse:collapse;width:100%;min-width:640px;font-size:14.5px;line-height:1.5}
th{text-align:left;vertical-align:bottom;padding:12px 16px;background:var(--paper);color:var(--fg);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;border-bottom:1px solid var(--line)}
td{text-align:left;vertical-align:top;padding:14px 16px;border-bottom:1px solid var(--line);color:var(--muted)}
td strong{color:var(--fg)}
td.id{font-family:var(--mono);font-size:12.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--accent);white-space:nowrap}
footer{border-top:1px solid var(--line);color:var(--muted);font-size:13px}
footer .wrap{padding-block:24px 40px;display:flex;gap:12px;align-items:center}
footer .dot{width:6px;height:6px;border-radius:50%;background:var(--bright);flex:none}
@media (max-width:640px){.band .wrap{padding-block:44px 40px}.product{font-size:22px}}
"""


def build(md, eyebrow, lead_first, footer, title_override):
    page_title, h1, lead, body = convert(md, eyebrow, lead_first, footer, title_override)
    with open(os.path.join(HERE, "brand", "nexonai-logo.png"), "rb") as f:
        logo = base64.b64encode(f.read()).decode()
    h1_html = html.escape(h1 or page_title)
    parts = [
        "<title>%s</title>" % html.escape(page_title),
        '<meta name="claude:viewport-fit-sides" content="cover">',
        '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap">',
        "<style>%s</style>" % CSS,
        '<header class="top"><div class="wrap"><span class="logo"><img src="data:image/png;base64,%s" alt="NexonAI Consulting"></span><span class="product">unpruuf<i>.</i></span></div></header>' % logo,
        '<section class="band"><div class="wrap"><span class="eyebrow">%s</span><h1>%s</h1>%s</div></section>' % (
            html.escape(eyebrow), h1_html, ('<p class="lead">%s</p>' % inline(lead)) if lead else ""),
        '<main><div class="wrap">%s</div></main>' % body,
        '<footer><div class="wrap"><span class="dot"></span><span>%s</span></div></footer>' % html.escape(footer),
    ]
    return "\n".join(parts)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--eyebrow", default="NexonAI Consulting")
    ap.add_argument("--lead-first-paragraph", action="store_true")
    ap.add_argument("--footer", default="NexonAI Consulting SRL, Alba Iulia · pilot phase, not independently audited")
    ap.add_argument("--title", default=None)
    a = ap.parse_args()
    with open(a.input, encoding="utf-8") as f:
        md = f.read()
    with open(a.output, "w", encoding="utf-8") as f:
        f.write(build(md, a.eyebrow, a.lead_first_paragraph, a.footer, a.title))
    print(a.output)
