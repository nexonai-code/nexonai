# Präsentationen (Rumänisch)

| Präsentation | Online | Folien |
|---|---|---|
| unpruuf Business (Hauptprodukt) | https://claude.ai/artifact/4tH2sYnsmWgAkZELQGNkCd | `business/project/slides/` |
| unpruuf Compliance | https://claude.ai/artifact/61vsMG7dqfqqu3ZJhjVGoe | `compliance/project/slides/` |

Fertige Dateien: `export/` (PDF und PowerPoint, Folien als Bilder, nicht editierbar).
Editierbares PowerPoint: Präsentation online öffnen → Share → Export.
Beide sind privat, bis sie über Share freigegeben werden.

Neu erzeugen: `python3 business.py` bzw. `python3 compliance.py`; Bilder, PDF und PowerPoint: `node render.js business png-business` (Playwright), dann Python mit python-pptx und Pillow.
