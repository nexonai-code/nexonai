# NexonAI / unpruuf design for documents and artifacts

Source: the website https://nexonai.ro (its `styles.css`, read on 25 October 2026). Gabriel asked on 25 October 2026 that every document and artifact uses this design.

## Look in one paragraph

White pages, one dark navy band (the site's hero) with a small blue uppercase eyebrow, a bold white headline with tight letter-spacing, and muted body text on white. Hairline rules instead of boxes, flat surfaces, 4 px corners, no shadows, no gradients. The accent is one calm blue. Dates, IDs and codes are set in a small uppercase monospace. The header carries the NexonAI Consulting logo, a thin vertical rule and the wordmark "unpruuf" with a blue full stop.

## Tokens (also in `nexonai-tokens.css`)

| Token | Value | Use |
|---|---|---|
| ink | `#0f2a3a` | headings, dark band, dark panels, code blocks |
| blue | `#307098` | accent on light: links, eyebrows, list markers, buttons (hover `#235577`) |
| bright | `#90c8e8` | accent on dark: eyebrow, second headline line, big numerals (hover `#a6d3ec`) |
| muted | `#4a5a66` | running text |
| line | `#d9e4ea` | hairlines, table rules |
| paper | `#f2f6f9` | soft panels, table header, inline code |
| white | `#ffffff` | page |

Typeface: **Open Sans** (400, 600, 700, 800), monospace **DejaVu Sans Mono**. Headlines 700 with letter-spacing about -0.05em (tight), body 16 px / 1.65. Eyebrow: 11 px, 700, uppercase, letter-spacing 0.14 em. Corner radius 4 px.

## Dark mode (needed for artifacts, derived, not from the site)

Page `#0a1b26`, text `#e8f0f5`, muted `#9fb3c0`, lines `#24404f`, panels `#112a3a`, accent `bright`. The logo sits on a white chip because its lettering is dark. The title band stays navy.

## How to apply

- **HTML artifacts and pages:** `python3 design/md_to_html.py input.md output.html --eyebrow "..." --lead-first-paragraph --title "Name"` makes a page fragment for the Artifact tool (title, tokens for light and dark, responsive, tables scroll inside their own box). For other pages reuse the CSS block in that file.
- **Word documents:** `python3 design/md_to_docx.py file.md` (logo and wordmark in the header, Open Sans, ink headings with hairline, tables with paper header, code on navy).
- **Slides (pptx):** white or navy slides, Open Sans, ink and blue, eyebrow above the headline, bright for the one highlighted word or number.
- **Docs-type artifacts (editable documents):** the Docs viewer fixes its own look and cannot be themed. Use it only when people must edit or comment inline; for read-only documents publish an HTML page in this design instead.
- **Logo files:** `brand/nexonai-logo.png`, `brand/nexonai-favicon.png` (from the site); older logos in `nexonai_logo*.png` under `handover/quellen/basistexte-und-logo`.

## Honesty line

The site states "Pilot phase, not independently audited" under the hero. Documents about unpruuf keep that line in the footer.
