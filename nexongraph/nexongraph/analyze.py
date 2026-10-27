"""Graph analysis: communities, central nodes, surprising links, cycles, open questions."""
from __future__ import annotations

import posixpath
import re
from collections import Counter

import networkx as nx

STRUCTURAL = {"contains", "method"}
HIDDEN_KINDS = {"external"}


def communities(G: nx.DiGraph, seed: int = 42) -> dict[str, int]:
    U = nx.Graph()
    U.add_nodes_from(n for n, d in G.nodes(data=True) if d.get("kind") not in HIDDEN_KINDS)
    for u, v, d in G.edges(data=True):
        if u in U and v in U:
            w = 0.6 if d.get("relation") in STRUCTURAL else 1.0
            if U.has_edge(u, v):
                U[u][v]["weight"] += w
            else:
                U.add_edge(u, v, weight=w)
    if U.number_of_nodes() == 0:
        return {}
    try:
        comms = nx.community.louvain_communities(U, weight="weight", seed=seed, resolution=1.0)
    except Exception:
        comms = list(nx.connected_components(U))
    comms = sorted(comms, key=len, reverse=True)
    out: dict[str, int] = {}
    for i, c in enumerate(comms):
        for n in c:
            out[n] = i
    for n, d in G.nodes(data=True):
        if n not in out:
            out[n] = -1
    return out


def community_labels(G: nx.DiGraph, comm: dict[str, int]) -> dict[int, str]:
    groups: dict[int, list[str]] = {}
    for n, c in comm.items():
        if c >= 0:
            groups.setdefault(c, []).append(n)
    labels = {}
    for c, members in groups.items():
        dirs = Counter()
        for n in members:
            f = G.nodes[n].get("source_file") or ""
            if f:
                dirs[posixpath.dirname(f) or "(root)"] += 1
        top = max(members, key=lambda n: (G.degree(n), G.nodes[n].get("kind") in ("class", "doc", "concept")))
        lbl = G.nodes[top].get("label", top)
        d = dirs.most_common(1)[0][0] if dirs else ""
        labels[c] = f"{d} · {lbl}" if d and d != "(root)" else lbl
    return labels


def cohesion(G: nx.DiGraph, comm: dict[str, int]) -> dict[int, float]:
    inside, total = Counter(), Counter()
    for u, v in G.edges():
        cu, cv = comm.get(u, -1), comm.get(v, -1)
        if cu >= 0:
            total[cu] += 1
        if cv >= 0 and cv != cu:
            total[cv] += 1
        if cu == cv and cu >= 0:
            inside[cu] += 1
    return {c: round(inside[c] / total[c], 2) if total[c] else 0.0 for c in total}


def god_nodes(G: nx.DiGraph, k: int = 15) -> list[tuple[str, int]]:
    scored = []
    for n, d in G.nodes(data=True):
        if d.get("kind") in ("external", "section", "note"):
            continue
        deg = sum(1 for _, _, e in G.in_edges(n, data=True) if e.get("relation") not in STRUCTURAL) + \
              sum(1 for _, _, e in G.out_edges(n, data=True) if e.get("relation") not in STRUCTURAL)
        if deg:
            scored.append((n, deg))
    scored.sort(key=lambda x: -x[1])
    return scored[:k]


def _top_dir(f: str) -> str:
    return f.split("/")[0] if "/" in f else "(root)"


def surprising_connections(G: nx.DiGraph, comm: dict[str, int], k: int = 12) -> list[dict]:
    out = []
    for u, v, d in G.edges(data=True):
        rel = d.get("relation")
        if rel in STRUCTURAL or rel == "imports":
            continue
        ku, kv = G.nodes[u].get("kind"), G.nodes[v].get("kind")
        if "external" in (ku, kv):
            continue
        cu, cv = comm.get(u, -1), comm.get(v, -1)
        fu, fv = G.nodes[u].get("source_file", ""), G.nodes[v].get("source_file", "")
        score = 0.0
        if cu != cv:
            score += 2
        if fu and fv and _top_dir(fu) != _top_dir(fv):
            score += 2
        if (ku in ("doc", "section", "concept")) != (kv in ("doc", "section", "concept")):
            score += 1.5   # documentation meets code
        if d.get("confidence") != "EXTRACTED":
            score += 0.5
        score += 1.0 / (1 + min(G.degree(u), G.degree(v)))
        if score >= 3:
            out.append({"source": u, "target": v, "relation": rel, "confidence": d.get("confidence"), "score": round(score, 2)})
    out.sort(key=lambda x: -x["score"])
    seen, uniq = set(), []
    for s in out:
        key = (G.nodes[s["source"]].get("label"), G.nodes[s["target"]].get("label"))
        if key in seen:
            continue
        seen.add(key)
        uniq.append(s)
    return uniq[:k]


def import_cycles(G: nx.DiGraph, k: int = 10) -> list[list[str]]:
    H = nx.DiGraph((u, v) for u, v, d in G.edges(data=True) if d.get("relation") == "imports"
                   and G.nodes[v].get("kind") == "file")
    out = []
    try:
        for cyc in nx.simple_cycles(H, length_bound=5):
            if len(cyc) >= 2:
                out.append(cyc)
            if len(out) >= k:
                break
    except TypeError:  # older networkx without length_bound
        for cyc in nx.simple_cycles(H):
            if 2 <= len(cyc) <= 5:
                out.append(cyc)
            if len(out) >= k:
                break
    return out


def isolated(G: nx.DiGraph, k: int = 20) -> list[str]:
    out = []
    for n, d in G.nodes(data=True):
        if d.get("kind") in ("file", "doc") and all(e.get("relation") in STRUCTURAL for _, _, e in G.in_edges(n, data=True)) \
                and all(e.get("relation") in STRUCTURAL for _, _, e in G.out_edges(n, data=True)):
            out.append(n)
    return out[:k]


def ambiguous(G: nx.DiGraph, k: int = 20) -> list[tuple[str, str, str]]:
    return [(u, v, d.get("relation")) for u, v, d in G.edges(data=True) if d.get("confidence") == "AMBIGUOUS"][:k]


def notes(G: nx.DiGraph, k: int = 25) -> list[str]:
    order = {"SECURITY": 0, "WHY": 1, "DECISION": 1, "IMPORTANT": 2, "WARNING": 2, "NOTE": 3, "HACK": 4, "FIXME": 4, "TODO": 5}
    ns = [n for n, d in G.nodes(data=True) if d.get("kind") == "note"]
    ns.sort(key=lambda n: (order.get(G.nodes[n].get("tag", "NOTE"), 9), n))
    return ns[:k]


def suggest_questions(G: nx.DiGraph, comm: dict[str, int], labels: dict[int, str], surprising: list[dict],
                      gods: list[tuple[str, int]], coh: dict[int, float], lang: str = "de") -> list[str]:
    L = lambda n: G.nodes[n].get("label", n) if n in G else n
    qs: list[list[str]] = [[], [], [], []]
    for s in surprising[:4]:
        qs[0].append(f"Wie hängt „{L(s['source'])}“ mit „{L(s['target'])}“ zusammen?" if lang == "de"
                     else f"How is \"{L(s['source'])}\" connected to \"{L(s['target'])}\"?")
    for n, _ in gods[:3]:
        qs[1].append(f"Was hängt alles an „{L(n)}“ und was passiert, wenn es sich ändert?" if lang == "de"
                     else f"What depends on \"{L(n)}\", and what breaks if it changes?")
    for c, v in sorted(coh.items(), key=lambda x: x[1])[:2]:
        if c in labels and v < 0.5:
            qs[2].append(f"Warum ist der Bereich „{labels[c]}“ so lose gekoppelt?" if lang == "de"
                         else f"Why is the area \"{labels[c]}\" so loosely coupled?")
    amb = ambiguous(G, 2)
    for u, v, r in amb:
        qs[3].append(f"Ruft „{L(u)}“ wirklich „{L(v)}“ auf?" if lang == "de" else f"Does \"{L(u)}\" really call \"{L(v)}\"?")
    out = []
    while any(qs) and len(out) < 8:
        for q in qs:
            if q and len(out) < 8:
                out.append(q.pop(0))
    return out


def analyze(G: nx.DiGraph, lang: str = "de") -> dict:
    comm = communities(G)
    for n, c in comm.items():
        G.nodes[n]["community"] = c
    for n in G.nodes:
        G.nodes[n]["degree"] = G.degree(n)
    labels = community_labels(G, comm)
    coh = cohesion(G, comm)
    gods = god_nodes(G)
    surp = surprising_connections(G, comm)
    return {
        "communities": comm,
        "labels": labels,
        "cohesion": coh,
        "god_nodes": gods,
        "surprising": surp,
        "cycles": import_cycles(G),
        "isolated": isolated(G),
        "ambiguous": ambiguous(G),
        "notes": notes(G),
        "questions": suggest_questions(G, comm, labels, surp, gods, coh, lang),
    }
