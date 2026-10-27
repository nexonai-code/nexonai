"""Turns knowledge cards into graph nodes and edges."""
from __future__ import annotations

from .cards import Card, as_list, refs
from .model import EXTRACTED, edge, new_extraction, node


def cards_extraction(cards: list[Card], files: set[str]) -> dict:
    """Card nodes are 'card::<id>'. Reference fields become edges to other cards,
    'code' paths become implemented_in edges to files or to a folder node 'dir::<path>'."""
    ex = new_extraction()
    ids = {c.id for c in cards if c.id}
    folders: set[str] = set()
    for c in cards:
        if not c.id:
            continue
        cid = f"card::{c.id}"
        node(ex, cid, c.title or c.id, c.type or "card", c.rel, 1, status=c.status, summary=c.summary,
             updated=c.updated.isoformat() if c.updated else None, text=(c.summary + "\n" + c.body).strip()[:12000],
             card_id=c.id)
        for relation, target in refs(c):
            if target in ids and target != c.id:
                edge(ex, cid, f"card::{target}", relation, EXTRACTED)
        for p in as_list(c.fields.get("code")):
            path = str(p).strip().strip("/")
            if not path:
                continue
            if path in files:
                edge(ex, cid, path, "implemented_in", EXTRACTED)
                continue
            members = [f for f in files if f.startswith(path + "/")]
            if not members:
                continue
            did = f"dir::{path}"
            if did not in folders:
                folders.add(did)
                node(ex, did, path.split("/")[-1] + "/", "folder", path, None, path=path)
                for f in sorted(members):
                    edge(ex, did, f, "contains", EXTRACTED)
            edge(ex, cid, did, "implemented_in", EXTRACTED)
    return ex
