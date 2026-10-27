"""Querying a built graph: search, explain, path, question -> subgraph, and answers with a model."""
from __future__ import annotations

import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

import networkx as nx

from . import llm

WORD_RE = re.compile(r"[\wÄÖÜäöüßĂÂÎȘȚăâîșț]+", re.U)
STRUCTURAL = {"contains", "method"}


def load_graph(path: str | Path) -> nx.DiGraph:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    G = nx.DiGraph()
    for n in data["nodes"]:
        G.add_node(n["id"], **{k: v for k, v in n.items() if k != "id"})
    for e in data["edges"]:
        G.add_edge(e["source"], e["target"], **{k: v for k, v in e.items() if k not in ("source", "target")})
    G.graph.update(data.get("graph", {}))
    return G


from .concepts import STOP as _STOPWORDS

_QUESTION_WORDS = {"wo", "wie", "was", "wer", "wann", "warum", "welche", "welcher", "where", "how", "what", "who", "when", "why",
                   "which", "unde", "cum", "ce", "cine", "când", "de ce", "care", "is", "are", "does", "do", "wird", "werden", "gibt"}
_SUFFIXES = ("ungen", "ingly", "ation", "ings", "ing", "ung", "ies", "ed", "es", "en", "er", "s", "e")


def stem(w: str) -> str:
    for suf in _SUFFIXES:
        if len(w) - len(suf) >= 4 and w.endswith(suf):
            return w[: -len(suf)]
    return w


_STOP = {stem(w) for w in _STOPWORDS | _QUESTION_WORDS} | _STOPWORDS | _QUESTION_WORDS


def _split_ident(s: str) -> list[str]:
    s = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", s)
    return [stem(w.lower()) for w in WORD_RE.findall(s.replace("_", " ").replace(".", " ").replace("/", " "))]


class Searcher:
    """BM25 over label, file path and text; words in the label count extra."""

    def __init__(self, G: nx.DiGraph):
        self.G = G
        self.docs: dict[str, Counter] = {}
        self.labels: dict[str, set[str]] = {}
        self.lens: dict[str, int] = {}
        df = Counter()
        for n, d in G.nodes(data=True):
            if d.get("kind") == "external":
                continue
            label_words = _split_ident(d.get("label", ""))
            words = Counter(label_words)
            for w in _split_ident(d.get("source_file", "")):
                words[w] += 1
            for field in ("doc", "description", "text"):
                if d.get(field):
                    for w in WORD_RE.findall(str(d[field])[:6000].lower()):
                        words[stem(w)] += 1
            self.docs[n] = words
            self.labels[n] = set(label_words)
            self.lens[n] = sum(words.values())
            df.update(words.keys())
        self.N = max(1, len(self.docs))
        self.avg = (sum(self.lens.values()) / self.N) if self.lens else 1.0
        self.idf = {w: math.log(1 + (self.N - c + 0.5) / (c + 0.5)) for w, c in df.items()}

    def search(self, text: str, k: int = 10, kinds: set[str] | None = None) -> list[tuple[str, float]]:
        q = text.strip()
        if not q:
            return []
        ql = q.lower()
        terms = [w for w in dict.fromkeys(_split_ident(q)) if len(w) > 1 and w not in _STOP]
        k1, b = 1.2, 0.75
        scores = []
        for n, words in self.docs.items():
            d = self.G.nodes[n]
            if kinds and d.get("kind") not in kinds:
                continue
            lbl = d.get("label", "").lower().strip(".()")
            s = 0.0
            if lbl == ql.strip(".()") or n.lower() == ql:
                s += 50
            elif len(ql) >= 3 and ql in lbl:
                s += 15
            elif len(ql) >= 3 and ql in n.lower():
                s += 6
            norm = k1 * (1 - b + b * self.lens[n] / self.avg)
            for t in terms:
                tf = words.get(t, 0)
                if tf:
                    idf = self.idf.get(t, 1.0)
                    s += idf * tf * (k1 + 1) / (tf + norm)
                    if t in self.labels[n]:
                        s += 1.5 * idf
            if s > 0:
                s += 0.15 * math.log(1 + self.G.degree(n))
                scores.append((n, s))
        scores.sort(key=lambda x: -x[1])
        return scores[:k]

    def best(self, text: str) -> str | None:
        if text in self.G:
            return text
        r = self.search(text, 1)
        return r[0][0] if r else None


def _loc(G, n) -> str:
    d = G.nodes[n]
    f = d.get("source_file") or ""
    return f + (f":{d['line']}" if d.get("line") and f else "")


def _line(G, n) -> str:
    d = G.nodes[n]
    loc = _loc(G, n)
    return f"{d.get('label', n)} [{d.get('kind')}]" + (f" ({loc})" if loc else "")


def explain(G: nx.DiGraph, name: str, limit: int = 60) -> dict | None:
    n = Searcher(G).best(name)
    if not n:
        return None
    d = dict(G.nodes[n])
    out_e = [{"to": v, "label": G.nodes[v].get("label", v), "kind": G.nodes[v].get("kind"), "relation": e.get("relation"),
              "confidence": e.get("confidence"), "loc": _loc(G, v)} for _, v, e in G.out_edges(n, data=True)]
    in_e = [{"from": u, "label": G.nodes[u].get("label", u), "kind": G.nodes[u].get("kind"), "relation": e.get("relation"),
             "confidence": e.get("confidence"), "loc": _loc(G, u)} for u, _, e in G.in_edges(n, data=True)]
    text = d.pop("text", None)
    return {"id": n, "node": d, "text": (text or "")[:1500], "out": out_e[:limit], "in": in_e[:limit],
            "out_total": len(out_e), "in_total": len(in_e)}


def explain_text(G: nx.DiGraph, name: str) -> str:
    r = explain(G, name)
    if not r:
        return f"Nichts gefunden für: {name}"
    d = r["node"]
    lines = [f"Knoten: {d.get('label', r['id'])}", f"  ID:        {r['id']}", f"  Art:       {d.get('kind')}",
             f"  Quelle:    {_loc(G, r['id']) or '-'}", f"  Bereich:   {d.get('community', '-')}", f"  Grad:      {G.degree(r['id'])}"]
    for k in ("doc", "description"):
        if d.get(k):
            lines.append(f"  Info:      {d[k]}")
    if r["text"]:
        lines.append(f"  Text:      {r['text'][:400].replace(chr(10), ' ')}")
    lines.append(f"\nVerbindungen ({r['out_total'] + r['in_total']}):")
    for e in r["out"]:
        lines.append(f"  --> {e['label']} [{e['relation']}] [{e['confidence']}] {e['loc']}")
    for e in r["in"]:
        lines.append(f"  <-- {e['label']} [{e['relation']}] [{e['confidence']}] {e['loc']}")
    return "\n".join(lines)


def path(G: nx.DiGraph, a: str, b: str) -> dict | None:
    s = Searcher(G)
    na, nb = s.best(a), s.best(b)
    if not na or not nb:
        return None
    U = G.to_undirected(as_view=True)
    try:
        p = nx.shortest_path(U, na, nb)
    except nx.NetworkXNoPath:
        return {"from": na, "to": nb, "path": [], "steps": []}
    steps = []
    for x, y in zip(p, p[1:]):
        if G.has_edge(x, y):
            e = G.edges[x, y]
            steps.append({"a": x, "b": y, "relation": e.get("relation"), "dir": "->", "confidence": e.get("confidence")})
        else:
            e = G.edges[y, x]
            steps.append({"a": x, "b": y, "relation": e.get("relation"), "dir": "<-", "confidence": e.get("confidence")})
    return {"from": na, "to": nb, "path": p, "steps": steps}


def path_text(G: nx.DiGraph, a: str, b: str) -> str:
    r = path(G, a, b)
    if r is None:
        return "Mindestens einer der beiden Namen wurde nicht gefunden."
    if not r["path"]:
        return f"Kein Weg zwischen {G.nodes[r['from']].get('label')} und {G.nodes[r['to']].get('label')}."
    L = lambda n: G.nodes[n].get("label", n)
    out = L(r["path"][0])
    for st in r["steps"]:
        out += f" --{st['relation']}--> {L(st['b'])}" if st["dir"] == "->" else f" <--{st['relation']}-- {L(st['b'])}"
    return f"Kürzester Weg ({len(r['steps'])} Schritte):\n  {out}"


def subgraph_for(G: nx.DiGraph, question: str, seeds: int = 8, max_nodes: int = 60) -> tuple[list[str], list[tuple[str, str, dict]]]:
    hits = Searcher(G).search(question, seeds)
    chosen: list[str] = [n for n, _ in hits]
    seen = set(chosen)
    for n, _ in hits:
        nbrs = sorted(set(G.successors(n)) | set(G.predecessors(n)), key=lambda x: -G.degree(x))
        for m in nbrs:
            if len(seen) >= max_nodes:
                break
            if m not in seen and G.nodes[m].get("kind") != "external":
                seen.add(m)
                chosen.append(m)
    edges = [(u, v, d) for u, v, d in G.edges(data=True) if u in seen and v in seen]
    return chosen, edges


def query_text(G: nx.DiGraph, question: str, max_nodes: int = 60) -> str:
    nodes, edges = subgraph_for(G, question, max_nodes=max_nodes)
    if not nodes:
        return f"Nichts gefunden für: {question}"
    lines = [f"Teilgraph für: {question}", f"{len(nodes)} Knoten, {len(edges)} Verbindungen", "", "Knoten:"]
    for n in nodes:
        d = G.nodes[n]
        extra = d.get("doc") or d.get("description") or (d.get("text") or "")[:160].replace("\n", " ")
        lines.append(f"- {_line(G, n)}" + (f": {extra}" if extra else ""))
    lines.append("\nVerbindungen:")
    L = lambda n: G.nodes[n].get("label", n)
    for u, v, d in edges:
        if d.get("relation") in STRUCTURAL and len(edges) > 80:
            continue
        lines.append(f"- {L(u)} --{d.get('relation')}--> {L(v)} [{d.get('confidence')}]")
    return "\n".join(lines)


ASK_SYSTEM = ("You answer questions about a project using only the knowledge-graph excerpt and text passages given. "
              "Cite sources as file:line in brackets. If the excerpt does not contain the answer, say so plainly. "
              "Answer in the language of the question. Be concise.")


def ask(G: nx.DiGraph, question: str, cfg: dict) -> dict:
    nodes, _ = subgraph_for(G, question, seeds=10, max_nodes=50)
    context = query_text(G, question, max_nodes=50)
    passages = []
    for n in nodes:
        d = G.nodes[n]
        if d.get("text"):
            passages.append(f"[{_loc(G, n)}] {d.get('label')}\n{d['text'][:1800]}")
        if sum(len(p) for p in passages) > 12000:
            break
    if not llm.enabled(cfg):
        return {"answer": None, "context": context, "sources": [_loc(G, n) for n in nodes[:12]]}
    user = f"Question: {question}\n\nGraph excerpt:\n{context}\n\nText passages:\n" + "\n\n".join(passages)
    answer = llm.complete(cfg, ASK_SYSTEM, user, max_tokens=1200)
    return {"answer": answer, "context": context, "sources": [_loc(G, n) for n in nodes[:12]]}
