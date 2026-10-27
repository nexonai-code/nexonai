"""The build pipeline: scan -> extract (cached) -> merge/resolve -> concepts -> analyze -> export."""
from __future__ import annotations

import datetime as _dt
import hashlib
import json
import time
from pathlib import Path
from typing import Callable

from . import __version__, config, llm
from .analyze import analyze
from .build import add_extraction, link_mentions, merge, resolve
from .concepts import local_concepts, semantic_pass
from .export import layout, to_html, to_json
from .cards import CARD_DIR, load_cards
from .extract_cards import cards_extraction
from .extract_docs import extract_document, read_text
from .extract_python import extract_python
from .extract_treesitter import extract_generic, treesitter_available
from .report import generate
from .scan import scan

EXTRACTOR_VERSION = "2"


class Cancelled(Exception):
    pass


def _extract_file(f) -> dict:
    if f.kind == "code":
        src = read_text(f.path)
        if f.lang == "python":
            return extract_python(src, f.rel)
        return extract_generic(src, f.rel, f.lang)
    return extract_document(f.path, f.rel, f.lang)


def build(root: str | Path, semantic: bool | None = None, out_dir: Path | None = None,
          progress: Callable[[str, float], None] | None = None, should_stop: Callable[[], bool] | None = None,
          cfg: dict | None = None) -> dict:
    t0 = time.time()
    cfg = cfg or config.load()
    lang = cfg.get("lang", "de")
    root = Path(root).resolve()
    say = progress or (lambda msg, frac: None)
    stop = should_stop or (lambda: False)
    if semantic is None:
        semantic = bool(cfg.get("semantic"))
    llm_cfg = cfg.get("llm", {})
    if semantic and not llm.enabled(llm_cfg):
        semantic = False

    out = Path(out_dir) if out_dir else config.out_dir_for(root, cfg)
    try:
        out.mkdir(parents=True, exist_ok=True)
        probe = out / ".write-test"
        probe.write_text("ok")
        probe.unlink()
    except OSError:
        out = config.out_dir_for(root, {"out_mode": "appdata"})
        out.mkdir(parents=True, exist_ok=True)
    cache = out / "cache" / "extract"
    cache.mkdir(parents=True, exist_ok=True)

    say("Ordner wird gelesen …", 0.02)
    sr = scan(root)
    cards, card_errors = load_cards(root)
    card_rels = {c.rel for c in cards} | {e.rel for e in card_errors}
    # cards are read by the card reader, not as documents; the exported site is output, not input
    sr.files = [f for f in sr.files if f.rel not in card_rels and not f.rel.startswith(f"{CARD_DIR}/site/")]
    files = sr.files
    if not files and not cards:
        raise ValueError("Keine unterstützten Dateien gefunden (Code, Markdown, PDF, Word, HTML, Text).")

    extractions, errors, reused = [], [f"{e.rel}: {e.message}" for e in card_errors], 0
    keep_cache = set()
    for i, f in enumerate(files, start=1):
        if stop():
            raise Cancelled()
        if i % 10 == 0 or i == len(files):
            say(f"Dateien {i}/{len(files)}: {f.rel}", 0.05 + 0.55 * i / len(files))
        key = hashlib.sha1(f"{f.sha}|{f.rel}|{EXTRACTOR_VERSION}|{treesitter_available()}".encode()).hexdigest() + ".json"
        keep_cache.add(key)
        cp = cache / key
        ex = None
        if cp.exists():
            try:
                ex = json.loads(cp.read_text(encoding="utf-8"))
                reused += 1
            except Exception:
                ex = None
        if ex is None:
            try:
                ex = _extract_file(f)
            except Exception as err:
                errors.append(f"{f.rel}: {err}")
                continue
            try:
                cp.write_text(json.dumps(ex, ensure_ascii=False), encoding="utf-8")
            except OSError:
                pass
        for n in ex.get("nodes", []):
            if n.get("error"):
                errors.append(f"{f.rel}: {n['error']}")
                break
        extractions.append(ex)
    for old in cache.glob("*.json"):
        if old.name not in keep_cache:
            try:
                old.unlink()
            except OSError:
                pass

    say("Verbindungen werden aufgelöst …", 0.62)
    G, refs = merge(extractions)
    add_extraction(G, cards_extraction(cards, {n for n, d in G.nodes(data=True) if d.get("kind") in ("file", "doc")}))
    stats = resolve(G, refs)
    stats["cards"] = len(cards)
    stats["mentions"] = link_mentions(G)

    say("Dokumente werden verknüpft …", 0.68)
    doc_text: dict[str, str] = {}
    sections_by_doc: dict[str, list[dict]] = {}
    for n, d in G.nodes(data=True):
        if d.get("kind") == "section":
            doc_id = d.get("source_file")
            doc_text[doc_id] = doc_text.get(doc_id, "") + "\n" + d.get("label", "") + "\n" + d.get("text", "")
            sections_by_doc.setdefault(doc_id, []).append({"id": n, **d})
    add_extraction(G, local_concepts(doc_text))

    sem_label = ""
    if semantic and sections_by_doc:
        sem_label = f"{llm_cfg.get('provider')}: {llm_cfg.get('model') or llm.PROVIDERS.get(llm_cfg.get('provider'), {}).get('model', '')}"
        doc_nodes = [{"id": n, **G.nodes[n]} for n in sections_by_doc if n in G]
        ex, sem_errors = semantic_pass(doc_nodes, sections_by_doc, llm_cfg, out / "cache" / "semantic",
                                       progress=lambda m: say(m, 0.72), should_stop=stop)
        add_extraction(G, ex)
        errors.extend(f"Semantik {e}" for e in sem_errors)

    if stop():
        raise Cancelled()
    say("Bereiche und Schwerpunkte werden berechnet …", 0.82)
    a = analyze(G, lang)
    say("Graph wird angeordnet …", 0.88)
    for n, (x, y) in layout(G).items():
        G.nodes[n]["x"], G.nodes[n]["y"] = x, y

    meta = {
        "name": root.name, "root": str(root), "built": _dt.datetime.now().isoformat(timespec="seconds"),
        "code_files": len(sr.code), "doc_files": len(sr.docs), "semantic": sem_label,
        "parser": "tree-sitter" if treesitter_available() else "regex (tree-sitter nicht installiert)",
        "stats": stats, "errors": errors[:200], "skipped": sr.skipped[:200], "version": __version__,
    }
    say("Dateien werden geschrieben …", 0.94)
    to_json(G, out / "graph.json", meta, a)
    to_html(G, out / "graph.html", a["labels"], {"name": root.name, "built": meta["built"], "root": str(root),
                                                  "nodes": G.number_of_nodes(), "edges": G.number_of_edges(), "lang": lang})
    (out / "REPORT.md").write_text(generate(G, a, meta, lang), encoding="utf-8")
    gi = out / ".gitignore"
    if not gi.exists():
        gi.write_text("cache/\n", encoding="utf-8")
    info = {"built": meta["built"], "nodes": G.number_of_nodes(), "edges": G.number_of_edges(),
            "files": len(files), "communities": len(a["labels"]), "seconds": round(time.time() - t0, 1),
            "reused": reused, "errors": len(errors), "semantic": sem_label}
    config.remember_project(root, out, info)
    say("Fertig.", 1.0)
    return {"out": str(out), **info}
