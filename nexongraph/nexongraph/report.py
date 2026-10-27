"""REPORT.md: the highlights of a graph in plain language (German or English)."""
from __future__ import annotations

import datetime as _dt
from collections import Counter

import networkx as nx

T = {
    "de": {
        "title": "NexonGraph-Bericht", "built": "Erstellt", "folder": "Ordner",
        "overview": "Überblick", "files_code": "Code-Dateien", "files_doc": "Dokumente", "nodes": "Knoten", "edges": "Verbindungen",
        "by_kind": "Knoten nach Art", "by_conf": "Verbindungen nach Herkunft",
        "conf_expl": "EXTRACTED steht so im Quelltext. INFERRED hat NexonGraph aufgelöst. AMBIGUOUS ist unsicher und sollte geprüft werden.",
        "gods": "Zentrale Knoten", "gods_expl": "Hier läuft am meisten durch. Änderungen an diesen Stellen wirken weit.",
        "comms": "Bereiche (Communities)", "comms_expl": "Der Graph zerfällt in diese zusammenhängenden Bereiche. Kopplung = Anteil der Verbindungen, die im Bereich bleiben.",
        "members": "Knoten", "coupling": "Kopplung", "top": "Wichtigste Knoten",
        "surprising": "Überraschende Verbindungen", "surprising_expl": "Verbindungen über Bereichs- oder Ordnergrenzen hinweg, oft zwischen Dokumentation und Code.",
        "cycles": "Import-Zyklen", "isolated": "Dateien ohne Verbindungen", "ambiguous": "Unsichere Verbindungen (prüfen)",
        "notes": "Begründungen und Hinweise im Code", "questions": "Fragen, die sich lohnen",
        "semantic": "Semantischer Durchlauf", "sem_off": "aus (nur lokale Analyse, nichts hat den Rechner verlassen)",
        "sem_on": "an", "errors": "Fehler", "skipped": "Übersprungene Dateien", "none": "keine",
        "how": "So fragst du den Graphen", "parser": "Parser für andere Sprachen",
    },
    "en": {
        "title": "NexonGraph report", "built": "Built", "folder": "Folder",
        "overview": "Overview", "files_code": "Code files", "files_doc": "Documents", "nodes": "Nodes", "edges": "Edges",
        "by_kind": "Nodes by kind", "by_conf": "Edges by origin",
        "conf_expl": "EXTRACTED is stated in the source. INFERRED was resolved by NexonGraph. AMBIGUOUS is uncertain and worth checking.",
        "gods": "Central nodes", "gods_expl": "Most traffic runs through these. Changes here reach far.",
        "comms": "Areas (communities)", "comms_expl": "The graph splits into these connected areas. Coupling = share of edges that stay inside the area.",
        "members": "Nodes", "coupling": "Coupling", "top": "Key nodes",
        "surprising": "Surprising connections", "surprising_expl": "Links across area or folder borders, often between documentation and code.",
        "cycles": "Import cycles", "isolated": "Files without connections", "ambiguous": "Uncertain edges (check)",
        "notes": "Rationale and notes in the code", "questions": "Questions worth asking",
        "semantic": "Semantic pass", "sem_off": "off (local analysis only, nothing left this computer)",
        "sem_on": "on", "errors": "Errors", "skipped": "Skipped files", "none": "none",
        "how": "How to query the graph", "parser": "Parser for other languages",
    },
}


def _md(s: str) -> str:
    return str(s).replace("|", "\\|").replace("\n", " ")


def generate(G: nx.DiGraph, a: dict, meta: dict, lang: str = "de") -> str:
    t = T.get(lang, T["de"])
    L = lambda n: G.nodes[n].get("label", n) if n in G else n
    loc = lambda n: (f"`{G.nodes[n].get('source_file')}`" + (f" L{G.nodes[n]['line']}" if G.nodes[n].get("line") else "")) if n in G and G.nodes[n].get("source_file") else ""
    kinds = Counter(d.get("kind") for _, d in G.nodes(data=True))
    confs = Counter(d.get("confidence") for _, _, d in G.edges(data=True))
    lines = [f"# {t['title']}: {meta.get('name', '')}", "",
             f"{t['built']}: {_dt.datetime.now().strftime('%d.%m.%Y %H:%M')}  ",
             f"{t['folder']}: `{meta.get('root', '')}`", "",
             f"## {t['overview']}", "",
             f"| | |", "|---|---|",
             f"| {t['files_code']} | {meta.get('code_files', 0)} |",
             f"| {t['files_doc']} | {meta.get('doc_files', 0)} |",
             f"| {t['nodes']} | {G.number_of_nodes()} |",
             f"| {t['edges']} | {G.number_of_edges()} |",
             f"| {t['semantic']} | {t['sem_on'] + ' (' + meta.get('semantic', '') + ')' if meta.get('semantic') else t['sem_off']} |",
             f"| {t['parser']} | {meta.get('parser', '')} |", "",
             f"**{t['by_kind']}:** " + ", ".join(f"{k} {v}" for k, v in kinds.most_common()), "",
             f"**{t['by_conf']}:** " + ", ".join(f"{k} {v}" for k, v in confs.most_common()) + f". {t['conf_expl']}", ""]

    lines += [f"## {t['gods']}", "", t["gods_expl"], ""]
    for n, deg in a["god_nodes"]:
        lines.append(f"- **{_md(L(n))}** ({G.nodes[n].get('kind')}, {deg}) {loc(n)}")
    lines.append("")

    lines += [f"## {t['comms']}", "", t["comms_expl"], "", f"| # | {t['comms']} | {t['members']} | {t['coupling']} | {t['top']} |", "|---|---|---|---|---|"]
    groups: dict[int, list[str]] = {}
    for n, c in a["communities"].items():
        if c >= 0:
            groups.setdefault(c, []).append(n)
    for c in sorted(groups, key=lambda c: -len(groups[c]))[:25]:
        top = sorted(groups[c], key=lambda n: -G.degree(n))[:4]
        lines.append(f"| {c} | {_md(a['labels'].get(c, c))} | {len(groups[c])} | {a['cohesion'].get(c, 0)} | {', '.join(_md(L(n)) for n in top)} |")
    lines.append("")

    lines += [f"## {t['surprising']}", "", t["surprising_expl"], ""]
    for s in a["surprising"] or []:
        lines.append(f"- **{_md(L(s['source']))}** --{s['relation']}--> **{_md(L(s['target']))}** [{s['confidence']}] {loc(s['source'])} → {loc(s['target'])}")
    if not a["surprising"]:
        lines.append(f"- {t['none']}")
    lines.append("")

    if a["notes"]:
        lines += [f"## {t['notes']}", ""]
        for n in a["notes"]:
            lines.append(f"- {_md(L(n))} {loc(n)}")
        lines.append("")

    lines += [f"## {t['cycles']}", ""]
    lines += [f"- {' → '.join(c + [c[0]])}" for c in a["cycles"]] or [f"- {t['none']}"]
    lines.append("")
    lines += [f"## {t['ambiguous']}", ""]
    lines += [f"- {_md(L(u))} --{r}--> {_md(L(v))}" for u, v, r in a["ambiguous"]] or [f"- {t['none']}"]
    lines.append("")
    lines += [f"## {t['isolated']}", ""]
    lines += [f"- `{n}`" for n in a["isolated"]] or [f"- {t['none']}"]
    lines.append("")

    lines += [f"## {t['questions']}", ""]
    lines += [f"- {q}" for q in a["questions"]] or [f"- {t['none']}"]
    lines.append("")

    if meta.get("errors") or meta.get("skipped"):
        lines += [f"## {t['errors']}", ""]
        lines += [f"- {e}" for e in (meta.get("errors") or [])[:30]]
        if meta.get("skipped"):
            lines.append(f"- {t['skipped']}: {len(meta['skipped'])}")
        lines.append("")

    lines += [f"## {t['how']}", "", "```",
              'nexongraph query "<Frage>" --dir <Ordner>',
              'nexongraph explain "<Name>" --dir <Ordner>',
              'nexongraph path "<A>" "<B>" --dir <Ordner>',
              "```", ""]
    return "\n".join(lines)
