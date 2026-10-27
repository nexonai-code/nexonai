"""Gabriel's page: a self-contained RO/EN HTML overview of the knowledge cards plus the graph viewer."""
from __future__ import annotations

import datetime as _dt
import json
from importlib import resources
from pathlib import Path

from . import config
from .cards import load_cards
from .check import check
from .drive_state import load_state
from .export import _logo_uri, render_viewer, viewer_payload


def _plain(v):
    if isinstance(v, (_dt.date, _dt.datetime)):
        return v.isoformat()
    if isinstance(v, dict):
        return {str(k): _plain(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_plain(x) for x in v]
    return v


def site_payload(root: Path, today: _dt.date) -> dict:
    root = Path(root)
    cards, _ = load_cards(root)
    out = []
    overdue = []
    for c in cards:
        out.append({"id": c.id, "type": c.type, "title": c.title, "status": c.status,
                    "updated": c.updated.isoformat() if c.updated else "", "summary": c.summary,
                    "fields": _plain(c.fields), "body": c.body.strip(), "rel": c.rel})
        vu = c.date("valid_until")
        if c.type == "offer" and c.status in ("draft", "sent") and vu and vu < today:
            overdue.append(c.id)
    issues = [{"level": i.level, "rel": i.rel, "rule": i.rule, "message": i.message} for i in check(root, today)]
    return {"built": _dt.datetime.now().isoformat(timespec="minutes"), "today": today.isoformat(),
            "cards": out, "overdue": sorted(overdue), "issues": issues, "drive": load_state(root)}


def _graph_html(root: Path) -> str:
    from .pipeline import build
    from .query import load_graph
    out = config.find_out_dir(root)
    if not out:
        out = Path(build(root, semantic=False)["out"])
    G = load_graph(out / "graph.json")
    labels = {int(k): v for k, v in G.graph.get("community_labels", {}).items()}
    meta = {"name": "NexonAI", "built": G.graph.get("built", ""), "root": "", "nodes": G.number_of_nodes(),
            "edges": G.number_of_edges(), "lang": "en"}
    return render_viewer(viewer_payload(G, labels, meta))


def export_site(root: Path, out_dir: Path, today: _dt.date, with_graph: bool = True, name: str = "index.html") -> Path:
    root = Path(root).resolve()
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    tpl = resources.files("nexongraph").joinpath("static/site.html").read_text(encoding="utf-8")
    payload = site_payload(root, today)
    payload["no_graph"] = not with_graph
    data = json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")
    html = tpl.replace("__LOGO__", _logo_uri()).replace("/*__DATA__*/null", data)
    index = out_dir / name
    index.write_text(html, encoding="utf-8")
    if with_graph:
        (out_dir / "graph.html").write_text(_graph_html(root), encoding="utf-8")
    return index
