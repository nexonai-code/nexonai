"""Concepts that connect documents.

Without a model: shared key terms (tf-idf across documents).
With a model: entities and relations per section (semantic pass), cached per text chunk.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

from . import llm
from .model import INFERRED, edge, new_extraction, node, slug

STOP = set("""
a about above after again against all also am an and any are as at be because been before being below between both but by can
could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i
if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own
same she should so some such than that the their theirs them themselves then there these they this those through to too under until
up very was we were what when where which while who whom why will with would you your yours yourself yourselves using used use uses
also however within without into upon each every many much must may might shall will would should could need needs like
der die das den dem des ein eine einer eines einem einen und oder aber nicht auch auf aus bei mit nach von vor zu zum zur ist sind
war waren wird werden wurde wurden hat haben hatte hatten kann können muss müssen soll sollen darf dürfen für über unter durch gegen
ohne um als wie wenn dass weil damit dann denn doch noch schon nur sehr mehr man sich sie er es wir ihr ich du dieser diese dieses
jeder jede jedes alle allem allen aller alles kein keine keiner keinem keinen hier dort wo wer was wann warum welche welcher welches
im ins am beim vom zwischen bis seit sowie bzw usw etc ggf sowohl also einfach immer wieder bereits zwei drei
și sau dar nu este sunt pentru prin din care cum fără mai acest această aceste acești lui lor una unei unui unor fie dacă când unde
cine fost fi sa să se ce la pe cu în de ca ar au am ai iar doar deja foarte toate toți fiecare cel cea cei cele după până între
""".split())

TOKEN_RE = re.compile(r"[A-Za-zÄÖÜäöüßĂÂÎȘȚăâîșțÉéÈèÀàÇç][\wÄÖÜäöüßĂÂÎȘȚăâîșțÉéÈèÀàÇç\-]{3,}")


def _tokens(text: str) -> list[str]:
    out = []
    for m in TOKEN_RE.finditer(text):
        w = m.group(0).strip("-")
        lw = w.lower()
        if lw in STOP or len(lw) < 4 or lw.isdigit():
            continue
        out.append(w)
    return out


def local_concepts(docs: dict[str, str], per_doc: int = 6) -> dict:
    """docs: {doc_id: full text}. Links documents through terms they share."""
    ex = new_extraction()
    if len(docs) < 2:
        return ex
    tf: dict[str, Counter] = {}
    forms: dict[str, Counter] = defaultdict(Counter)
    for did, text in docs.items():
        toks = _tokens(text)
        c = Counter()
        for t in toks:
            lt = t.lower()
            c[lt] += 1
            forms[lt][t] += 1
        tf[did] = c
    n = len(docs)
    df = Counter()
    for c in tf.values():
        df.update(c.keys())
    max_df = max(2, int(n * 0.5))
    created: set[str] = set()
    for did, c in tf.items():
        total = sum(c.values()) or 1
        scored = []
        for term, cnt in c.items():
            if cnt < 2 or df[term] < 2 or df[term] > max_df:
                continue
            scored.append(((cnt / total) * math.log(n / df[term]) * (1 + 0.15 * min(len(term), 14)), term))
        scored.sort(reverse=True)
        for score, term in scored[:per_doc]:
            cid = f"concept::{slug(term)}"
            if cid not in created:
                created.add(cid)
                node(ex, cid, forms[term].most_common(1)[0][0], "concept", "", None, origin="term", docs=df[term])
            edge(ex, did, cid, "about", INFERRED, weight=round(score, 4))
    return ex


SEM_SYSTEM = ("You build a knowledge graph from documents. You answer with one JSON object only, no prose. "
              "Use entity names exactly as they appear in the text. Keep the document's language for descriptions.")
SEM_USER = """Document: {title}
Section: {section}

Text:
\"\"\"
{text}
\"\"\"

Return JSON with this shape:
{{"entities": [{{"name": "...", "type": "concept|system|process|rule|organization|person|role|place|date|document|other", "description": "one short sentence"}}],
 "relations": [{{"source": "entity name", "target": "entity name", "relation": "short verb phrase, e.g. uses, requires, part of, decides, depends on"}}]}}
At most {max_e} entities and {max_r} relations. Only facts stated in the text."""


def _chunks(sections: list[dict], limit: int = 6000) -> list[tuple[list[dict], str]]:
    out, cur, size = [], [], 0
    for s in sections:
        t = (s.get("text") or "").strip()
        if not t:
            continue
        piece = f"## {s.get('label', '')}\n{t}"
        if cur and size + len(piece) > limit:
            out.append((cur, "\n\n".join(f"## {c.get('label', '')}\n{c.get('text', '')}" for c in cur)[:limit]))
            cur, size = [], 0
        cur.append(s)
        size += len(piece)
    if cur:
        out.append((cur, "\n\n".join(f"## {c.get('label', '')}\n{c.get('text', '')}" for c in cur)[:limit]))
    return out


def semantic_pass(doc_nodes: list[dict], sections_by_doc: dict[str, list[dict]], cfg: dict, cache_dir: Path,
                  progress=None, should_stop=None) -> tuple[dict, list[str]]:
    """Runs the model over each document; returns (extraction, error messages)."""
    ex = new_extraction()
    errors: list[str] = []
    cache_dir.mkdir(parents=True, exist_ok=True)
    jobs = []
    for d in doc_nodes:
        for secs, text in _chunks(sections_by_doc.get(d["id"], [])):
            jobs.append((d, secs, text))
    model_key = f"{cfg.get('provider')}|{cfg.get('model')}"
    entity_ids: dict[str, str] = {}
    for i, (d, secs, text) in enumerate(jobs, start=1):
        if should_stop and should_stop():
            break
        if progress:
            progress(f"Semantik {i}/{len(jobs)}: {d.get('label', d['id'])[:60]}")
        h = hashlib.sha256((model_key + "\n" + text).encode("utf-8")).hexdigest()
        cp = cache_dir / f"{h}.json"
        data = None
        if cp.exists():
            try:
                data = json.loads(cp.read_text(encoding="utf-8"))
            except Exception:
                data = None
        if data is None:
            try:
                answer = llm.complete(cfg, SEM_SYSTEM, SEM_USER.format(
                    title=d.get("label", ""), section=", ".join(s.get("label", "") for s in secs)[:300],
                    text=text, max_e=15, max_r=20), json_mode=True)
                data = llm.parse_json(answer)
                cp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            except Exception as err:
                errors.append(f"{d['id']}: {err}")
                if len(errors) >= 3 and len(errors) == i:
                    errors.append("Abbruch: die ersten Anfragen sind alle fehlgeschlagen.")
                    break
                continue
        ents = data.get("entities") or []
        lowtext = text.lower()
        for e in ents[:25]:
            name = str(e.get("name", "")).strip()
            if not name or len(name) > 120:
                continue
            pat = re.compile(r"(?<![\w])" + re.escape(name.lower()) + r"(?![\w])")
            if not pat.search(lowtext):
                continue  # the model named something that is not in the text: drop it
            key = slug(name)
            cid = entity_ids.get(key) or f"concept::{key}"
            if cid not in entity_ids.values():
                entity_ids[key] = cid
                node(ex, cid, name, "concept", "", None, origin="model", etype=str(e.get("type", "concept"))[:20],
                     description=str(e.get("description", ""))[:300])
            # attach to the section that names it, else to the first section of the chunk
            owner = next((s["id"] for s in secs if pat.search((s.get("text", "") + " " + s.get("label", "")).lower())), secs[0]["id"])
            edge(ex, owner, cid, "mentions", INFERRED)
        for r in (data.get("relations") or [])[:30]:
            a, b = slug(str(r.get("source", ""))), slug(str(r.get("target", "")))
            rel = str(r.get("relation", "related to")).strip()[:40] or "related to"
            if a in entity_ids and b in entity_ids and a != b:
                edge(ex, entity_ids[a], entity_ids[b], rel, INFERRED, via=d["id"])
    return ex, errors
