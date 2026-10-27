"""Shared helpers for the extraction format.

Every extractor returns a dict:
    nodes: [{id, label, kind, source_file, line, ...}]
    edges: [{source, target, relation, confidence}]
    refs:  [{source, name, kind, line, ...}]   unresolved names, resolved in build.py

confidence is EXTRACTED (stated in the source), INFERRED (resolved by NexonGraph)
or AMBIGUOUS (several candidates, flagged in the report).
"""
from __future__ import annotations

import re

EXTRACTED = "EXTRACTED"
INFERRED = "INFERRED"
AMBIGUOUS = "AMBIGUOUS"

NOTE_RE = re.compile(r"\b(NOTE|WHY|HACK|FIXME|TODO|IMPORTANT|WARNING|SECURITY|DECISION)\s*[:\-]\s*(.+)", re.I)


def new_extraction() -> dict:
    return {"nodes": [], "edges": [], "refs": []}


def node(ex: dict, id: str, label: str, kind: str, source_file: str, line: int | None = None, **extra) -> str:
    n = {"id": id, "label": clean_label(label), "kind": kind, "source_file": source_file}
    if line is not None:
        n["line"] = int(line)
    for k, v in extra.items():
        if v not in (None, "", [], {}):
            n[k] = v
    ex["nodes"].append(n)
    return id


def edge(ex: dict, source: str, target: str, relation: str, confidence: str = EXTRACTED, **extra) -> None:
    if source == target:
        return
    e = {"source": source, "target": target, "relation": relation, "confidence": confidence}
    e.update({k: v for k, v in extra.items() if v not in (None, "")})
    ex["edges"].append(e)


def ref(ex: dict, source: str, name: str, kind: str, line: int | None = None, **extra) -> None:
    r = {"source": source, "name": name, "kind": kind}
    if line is not None:
        r["line"] = int(line)
    r.update({k: v for k, v in extra.items() if v not in (None, "")})
    ex["refs"].append(r)


def clean_label(s: str, limit: int = 160) -> str:
    s = "".join(ch for ch in str(s) if ch == "\t" or ch >= " ").strip()
    s = re.sub(r"\s+", " ", s)
    return s[:limit]


def slug(s: str) -> str:
    s = re.sub(r"[^\w\-]+", "-", s.lower(), flags=re.U).strip("-")
    return s[:60] or "x"


def notes_from_comment(ex: dict, text: str, line: int, rel: str, owner: str) -> None:
    """Turns NOTE:/WHY:/TODO: comments into note nodes linked to the code they sit in."""
    m = NOTE_RE.search(text)
    if not m:
        return
    tag = m.group(1).upper()
    body = clean_label(m.group(2), 200)
    if len(body) < 8 or not re.search(r"[A-Za-zÄÖÜäöüß]{3,}", body):
        return
    nid = f"{rel}:L{line}:note"
    node(ex, nid, f"{tag}: {body}", "note", rel, line, tag=tag)
    edge(ex, nid, owner, "explains")
