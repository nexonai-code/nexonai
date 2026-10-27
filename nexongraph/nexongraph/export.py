"""Writes graph.json and the self-contained graph.html (works offline, no CDN)."""
from __future__ import annotations

import json
import math
from importlib import resources
from pathlib import Path

import networkx as nx

from . import SCHEMA_VERSION, __version__

PALETTE = ["#307098", "#a8500f", "#2f8f6b", "#7b4fa0", "#c23b5a", "#4f7f1f", "#b08900", "#1f6f8b", "#8a5a44",
           "#5b6abf", "#d0743c", "#3a8f8f", "#9c3f8f", "#6b8e23", "#c05050", "#2e5e8e", "#8f7a3a", "#5a9e5a"]


def _fr(nodes: list, edges: list[tuple[int, int, float]], seed: int, iterations: int) -> "list[tuple[float, float]]":
    """Fruchterman-Reingold with numpy, result scaled to [-1, 1]."""
    import numpy as np
    n = len(nodes)
    rng = np.random.default_rng(seed)
    pos = rng.uniform(-1, 1, (n, 2)).astype(np.float32)
    if n == 1:
        return [(0.0, 0.0)]
    k = 1.0 / math.sqrt(n)
    A = None
    if edges:
        ei = np.array([(a, b) for a, b, _ in edges], dtype=np.int64)
        ew = np.array([w for _, _, w in edges], dtype=np.float32)
    t = 0.1
    dt = t / (iterations + 1)
    for _ in range(iterations):
        dx = pos[:, 0:1] - pos[:, 0][None, :]
        dy = pos[:, 1:2] - pos[:, 1][None, :]
        d2 = dx * dx + dy * dy
        np.fill_diagonal(d2, 1.0)
        np.maximum(d2, 1e-4, out=d2)
        f = (k * k) / d2
        disp = np.stack([(f * dx).sum(1), (f * dy).sum(1)], axis=1)
        if edges:
            d = pos[ei[:, 0]] - pos[ei[:, 1]]
            dl = np.maximum(np.sqrt((d ** 2).sum(-1)), 0.01)
            f = (dl / k * ew)[:, None] * d
            np.add.at(disp, ei[:, 0], -f)
            np.add.at(disp, ei[:, 1], f)
        # weak gravity keeps disconnected parts together
        disp -= pos * 0.05 * k * 10
        length = np.maximum(np.sqrt((disp ** 2).sum(-1)), 0.01)
        pos += disp / length[:, None] * np.minimum(length, t)[:, None]
        t -= dt
    pos -= pos.mean(0)
    m = np.abs(pos).max() or 1.0
    pos /= m
    return [tuple(map(float, p)) for p in pos]


def layout(G: nx.DiGraph, seed: int = 7) -> dict[str, tuple[float, float]]:
    """Communities are placed first, then each community is laid out on its own. Fast and stable."""
    groups: dict[int, list[str]] = {}
    for n, d in G.nodes(data=True):
        groups.setdefault(d.get("community", -1), []).append(n)
    # community graph for the outer placement
    C = nx.Graph()
    for c, members in groups.items():
        C.add_node(c, size=len(members))
    for u, v in G.edges():
        cu, cv = G.nodes[u].get("community", -1), G.nodes[v].get("community", -1)
        if cu != cv:
            C.add_edge(cu, cv, weight=C[cu][cv]["weight"] + 1 if C.has_edge(cu, cv) else 1)
    radius = {c: 40 * math.sqrt(len(m)) + 30 for c, m in groups.items()}
    if C.number_of_nodes() == 1:
        centers = {next(iter(C.nodes)): (0.0, 0.0)}
    else:
        cl = list(C.nodes)
        ci = {c: i for i, c in enumerate(cl)}
        maxw = max([d["weight"] for _, _, d in C.edges(data=True)] or [1])
        raw = dict(zip(cl, _fr(cl, [(ci[u], ci[v], 0.3 + d["weight"] / maxw) for u, v, d in C.edges(data=True)], seed, 150)))
        scale = sum(radius.values()) / max(1, math.sqrt(len(radius))) * 1.4
        centers = {c: (p[0] * scale, p[1] * scale) for c, p in raw.items()}
        # push overlapping communities apart
        cs = list(centers)
        for _ in range(80):
            moved = False
            for i, a in enumerate(cs):
                for b in cs[i + 1:]:
                    ax, ay = centers[a]
                    bx, by = centers[b]
                    dx, dy = bx - ax, by - ay
                    dist = math.hypot(dx, dy) or 0.01
                    need = radius[a] + radius[b] + 30
                    if dist < need:
                        push = (need - dist) / 2
                        ux, uy = dx / dist, dy / dist
                        centers[a] = (ax - ux * push, ay - uy * push)
                        centers[b] = (bx + ux * push, by + uy * push)
                        moved = True
            if not moved:
                break
    pos: dict[str, tuple[float, float]] = {}
    for c, members in groups.items():
        cx, cy = centers.get(c, (0.0, 0.0))
        r = radius[c]
        if len(members) == 1:
            pos[members[0]] = (cx, cy)
            continue
        if len(members) > 1200:
            # very large community: spiral by degree, centrals in the middle
            order = sorted(members, key=lambda n: -G.degree(n))
            for i, n in enumerate(order):
                ang = i * 2.399963
                rr = r * math.sqrt((i + 0.5) / len(order))
                pos[n] = (cx + rr * math.cos(ang), cy + rr * math.sin(ang))
            continue
        mi = {n: i for i, n in enumerate(members)}
        es = [(mi[u], mi[v], 1.0) for u, v in G.subgraph(members).edges()]
        m = len(members)
        p = _fr(members, es, seed, 90 if m < 200 else 60 if m < 500 else 35)
        for n, (x, y) in zip(members, p):
            pos[n] = (cx + x * r, cy + y * r)
    return pos


def to_json(G: nx.DiGraph, path: Path, meta: dict, analysis: dict) -> None:
    data = {
        "graph": {"schema_version": SCHEMA_VERSION, "nexongraph_version": __version__, **meta,
                  "community_labels": {str(k): v for k, v in analysis.get("labels", {}).items()}},
        "nodes": [{"id": n, **d} for n, d in G.nodes(data=True)],
        "edges": [{"source": u, "target": v, **d} for u, v, d in G.edges(data=True)],
    }
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def viewer_payload(G: nx.DiGraph, labels: dict, meta: dict) -> dict:
    ids = {n: i for i, n in enumerate(G.nodes)}
    nodes = []
    for n, d in G.nodes(data=True):
        info = d.get("doc") or d.get("description") or (d.get("text") or "")[:280]
        nodes.append({
            "id": n, "l": d.get("label", n), "k": d.get("kind", ""), "c": d.get("community", -1),
            "x": round(d.get("x", 0.0), 1), "y": round(d.get("y", 0.0), 1), "g": d.get("degree", 0),
            "f": d.get("source_file", ""), "n": d.get("line"), "i": info, "t": d.get("tag") or d.get("etype") or d.get("lang", ""),
        })
    edges = [[ids[u], ids[v], d.get("relation", ""), (d.get("confidence") or "E")[0]] for u, v, d in G.edges(data=True)]
    comms = {}
    for n, d in G.nodes(data=True):
        c = d.get("community", -1)
        comms.setdefault(c, 0)
        comms[c] += 1
    legend = [{"c": c, "label": labels.get(c, "Extern" if c == -1 else f"#{c}"), "n": cnt,
               "color": PALETTE[c % len(PALETTE)] if c >= 0 else "#9aa3a9"} for c, cnt in sorted(comms.items(), key=lambda x: -x[1])]
    return {"meta": meta, "nodes": nodes, "edges": edges, "legend": legend, "palette": PALETTE}


def viewer_template() -> str:
    return resources.files("nexongraph").joinpath("static/viewer.html").read_text(encoding="utf-8")


def _logo_uri() -> str:
    import base64
    raw = resources.files("nexongraph").joinpath("static/nexonai-logo.webp").read_bytes()
    return "data:image/webp;base64," + base64.b64encode(raw).decode()


def render_viewer(payload: dict, embedded: bool = False) -> str:
    html = viewer_template().replace("__LOGO__", _logo_uri())
    data = json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")
    html = html.replace("/*__DATA__*/null", data)
    if embedded:
        html = html.replace("<body>", '<body class="embedded">', 1)
    return html


def to_html(G: nx.DiGraph, path: Path, labels: dict, meta: dict) -> None:
    path.write_text(render_viewer(viewer_payload(G, labels, meta)), encoding="utf-8")
