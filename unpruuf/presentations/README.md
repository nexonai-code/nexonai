# Präsentationen (Rumänisch und Deutsch)

| Präsentation | Online | Folien |
|---|---|---|
| unpruuf Business (Hauptprodukt) | https://claude.ai/artifact/4tH2sYnsmWgAkZELQGNkCd | `business/project/slides/` |
| unpruuf Compliance | https://claude.ai/artifact/61vsMG7dqfqqu3ZJhjVGoe | `compliance/project/slides/` |
| unpruuf Business (Deutsch) | https://claude.ai/artifact/JP11hQVZbqVTUqGt1ahysF | `business_de/project/slides/` |
| unpruuf Compliance (Deutsch) | https://claude.ai/artifact/Rwc3AVsDLhhZHZXmgmULdA | `compliance_de/project/slides/` |

Fertige Dateien: `export/` (PDF und PowerPoint, Folien als Bilder, nicht editierbar).
Editierbares PowerPoint: Präsentation online öffnen → Share → Export.
Beide sind privat, bis sie über Share freigegeben werden.

Stand 2026-10-06: alle vier Präsentationen kommen aus **einer** Datei, `decks2.py` (Deutsch und Rumänisch nebeneinander). `python3 decks2.py` schreibt die Folien neu, `NODE_PATH=/opt/node22/lib/node_modules node render.js <ordner> <png-ordner>` rendert sie (Playwright), `python3 export2.py <png-wurzel> export` erzeugt PDF und PowerPoint mit Sprechernotizen. Die älteren Skripte (`business.py`, `business_de.py`, `tr_*.py` …) sind der Stand vom 2026‑10‑01 und werden nicht mehr gebraucht.

Alt: `python3 business.py` bzw. `python3 compliance.py`; Bilder, PDF und PowerPoint: `node render.js business png-business` (Playwright), dann Python mit python-pptx und Pillow.

Deutsche Fassungen: `python3 tr_business.py && python3 business_de.py` bzw. `tr_compliance.py` / `compliance_de.py` (übersetzen aus der rumänischen Vorlage).
