"""Merges extractions into one graph and resolves names (imports, calls, inheritance, links)."""
from __future__ import annotations

import posixpath
import re
from collections import defaultdict

import networkx as nx

from .cards import TYPES as CARD_TYPES
from .model import AMBIGUOUS, EXTRACTED, INFERRED

MENTION_KINDS = {"section"} | CARD_TYPES

SYMBOL_KINDS = {"class", "interface", "function", "method"}
JS_EXTS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".d.ts", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"]
COMMON_METHODS = set("""
add get set put pop push append extend insert remove delete clear copy update items keys values join split strip lstrip rstrip
format replace lower upper read write close open run start stop send call apply map filter find reduce forEach some every slice
splice indexOf includes concat sort reverse next has exists mkdir load loads dump dumps parse render emit then catch finally log
info debug error warn warning toString equals hashCode length size contains containsKey isEmpty iterator stream collect encode decode
match search sub test exec bind trigger resolve reject wait notify execute submit flush reset init setup teardown main handle
process get_or_create count first last all any min max sum round abs len print readline readlines writelines seek tell fetch
post patch head options listen connect disconnect subscribe unsubscribe dispatch commit rollback query select insertOne findOne
create build save toJSON fromJSON valueOf assign keys entries setdefault getattr setattr hasattr isinstance issubclass super
""".split())
IDENT_RE = re.compile(r"\b[A-Za-z_][A-Za-z0-9_]{3,}\b")
FILE_MENTION_RE = re.compile(r"\b[\w\-/]+\.(?:py|ts|tsx|js|jsx|kt|java|go|cs|php|rb|rs|cpp|c|h|swift|md|sql)\b")


class Index:
    def __init__(self, G: nx.DiGraph):
        self.G = G
        self.files = {n for n, d in G.nodes(data=True) if d.get("kind") in ("file", "doc")}
        self.modules: dict[str, str] = {}
        self.by_name: dict[str, list[str]] = defaultdict(list)
        self.file_syms: dict[str, dict[str, str]] = defaultdict(dict)
        self.class_methods: dict[str, dict[str, str]] = defaultdict(dict)
        self.paths_noext: dict[str, list[str]] = defaultdict(list)
        self.suffix: dict[str, list[str]] = defaultdict(list)
        self.dir_suffix: dict[str, list[str]] = defaultdict(list)
        for n, d in G.nodes(data=True):
            k = d.get("kind")
            if k == "file" and d.get("module"):
                self.modules[d["module"]] = n
            if k in ("file", "doc"):
                base = re.sub(r"\.[^./]+$", "", n)
                self.paths_noext[base].append(n)
                segs = base.split("/")
                for i in range(len(segs)):
                    self.suffix["/".join(segs[i:])].append(n)
                dirs = segs[:-1]
                for i in range(len(dirs)):
                    self.dir_suffix["/".join(dirs[i:])].append(n)
            if k in SYMBOL_KINDS:
                name = d.get("name") or d.get("label", "").strip(".()")
                self.by_name[name].append(n)
        for u, v, d in G.edges(data=True):
            rel = d.get("relation")
            ku, kv = G.nodes[u].get("kind"), G.nodes[v].get("kind")
            if rel == "contains" and ku == "file" and kv in SYMBOL_KINDS:
                name = G.nodes[v].get("name") or G.nodes[v].get("label", "").strip(".()")
                self.file_syms[u][name] = v
            if rel == "method" and kv == "method":
                self.class_methods[u][G.nodes[v].get("name", "")] = v


def _add_edge(G: nx.DiGraph, u: str, v: str, relation: str, confidence: str, **extra) -> None:
    if u == v or u not in G or v not in G:
        return
    if G.has_edge(u, v):
        d = G.edges[u, v]
        d["count"] = d.get("count", 1) + 1
        rank = {EXTRACTED: 0, INFERRED: 1, AMBIGUOUS: 2}
        if rank.get(confidence, 3) < rank.get(d.get("confidence"), 3):
            d["confidence"] = confidence
        if d.get("relation") != relation:
            also = set(d.get("also", []))
            also.add(relation)
            d["also"] = sorted(also)
        return
    G.add_edge(u, v, relation=relation, confidence=confidence, **{k: v_ for k, v_ in extra.items() if v_ is not None})


def merge(extractions: list[dict]) -> tuple[nx.DiGraph, list[dict]]:
    G = nx.DiGraph()
    refs: list[dict] = []
    for ex in extractions:
        for n in ex.get("nodes", []):
            nid = n["id"]
            if nid in G:
                cur = G.nodes[nid]
                for k, v in n.items():
                    if k != "id" and (k not in cur or cur[k] in (None, "", [])):
                        cur[k] = v
            else:
                G.add_node(nid, **{k: v for k, v in n.items() if k != "id"})
    for ex in extractions:
        for e in ex.get("edges", []):
            extra = {k: v for k, v in e.items() if k not in ("source", "target", "relation", "confidence")}
            _add_edge(G, e["source"], e["target"], e["relation"], e.get("confidence", EXTRACTED), **extra)
        refs.extend(ex.get("refs", []))
    return G, refs


def _file_of(G, nid: str) -> str:
    return G.nodes[nid].get("source_file", nid) if nid in G else nid


def _external(G: nx.DiGraph, name: str) -> str:
    name = name.strip()
    if name.startswith("@") and "/" in name:
        label = "/".join(name.split("/")[:2])
    elif "/" in name:
        label = name.split("/")[0]
    elif "::" in name:
        label = name.split("::")[0]
    elif "." in name:
        parts = name.split(".")
        label = ".".join(parts[:2]) if parts[0] in ("java", "javax", "android", "androidx", "kotlin", "kotlinx", "org", "com", "io", "net", "System", "Microsoft") else parts[0]
    else:
        label = name
    label = label[:80] or "?"
    nid = f"ext::{label}"
    if nid not in G:
        G.add_node(nid, label=label, kind="external", source_file="")
    return nid


def _resolve_import_path(idx: Index, src_file: str, target: str) -> str | None:
    t = target.strip()
    if not t:
        return None
    base_dir = posixpath.dirname(src_file)
    if t.startswith((".", "/")):
        cand_base = posixpath.normpath(posixpath.join(base_dir, t)) if t.startswith(".") else t.lstrip("/")
        for ext in JS_EXTS:
            c = cand_base + ext
            if c in idx.files:
                return c
        for c in idx.paths_noext.get(cand_base, []):
            return c
        return None
    # C/C++ includes and plain relative paths
    if "/" in t or t.endswith((".h", ".hpp", ".hh")):
        c = posixpath.normpath(posixpath.join(base_dir, t))
        if c in idx.files:
            return c
        hit = idx.suffix.get(re.sub(r"\.[^./]+$", "", t))
        if hit:
            return hit[0]
    # dotted names: java/kotlin/c#/python-like; also rust crate::a::b
    t2 = re.sub(r"^(crate|self|super)(::|\.)", "", t).replace("::", "/").replace(".", "/").rstrip("/*")
    if t2:
        hit = idx.suffix.get(t2)
        if hit:
            return hit[0]
        # import com.x.Foo.bar -> file com/x/Foo; go/kotlin packages -> a file in that folder
        parent = t2.rsplit("/", 1)[0] if "/" in t2 else ""
        if parent and idx.suffix.get(parent):
            return idx.suffix[parent][0]
        if idx.dir_suffix.get(t2):
            return idx.dir_suffix[t2][0]
    return None


def resolve(G: nx.DiGraph, refs: list[dict]) -> dict:
    idx = Index(G)
    stats = defaultdict(int)
    # python import aliases per file: alias -> ("module", file) or ("symbol", node)
    aliases: dict[str, dict[str, tuple[str, str]]] = defaultdict(dict)

    # absolute imports when the scanned folder is the package itself: graphify.extractors.base -> extractors.base
    def find_module(name: str) -> str | None:
        if not name:
            return None
        if name in idx.modules:
            return name
        parts = name.split(".")
        for i in range(1, len(parts)):
            cand = ".".join(parts[i:])
            if cand in idx.modules:
                return cand
        return None

    for r in refs:
        if r["kind"] not in ("import", "import_from"):
            continue
        src = r["source"]
        if src not in G:
            continue
        lang = G.nodes[src].get("lang")
        name = r["name"]
        target = None
        if lang == "python":
            mod = name
            if r["kind"] == "import_from" and r.get("symbol"):
                full = find_module(f"{mod}.{r['symbol']}" if mod else r["symbol"])
                modm = find_module(mod)
                if full:  # from pkg import submodule
                    target = idx.modules[full]
                    aliases[src][r.get("alias", r["symbol"])] = ("module", target)
                elif modm:
                    target = idx.modules[modm]
                    sym = idx.file_syms[target].get(r["symbol"])
                    if sym:
                        aliases[src][r.get("alias", r["symbol"])] = ("symbol", sym)
            else:
                probe = mod
                while probe and not find_module(probe):
                    probe = probe.rsplit(".", 1)[0] if "." in probe else ""
                probe = find_module(probe) if probe else None
                if probe:
                    target = idx.modules[probe]
                    if r.get("alias"):
                        aliases[src][r["alias"]] = ("module", target)
        else:
            target = _resolve_import_path(idx, _file_of(G, src), name)
        if target and target != src:
            _add_edge(G, src, target, "imports", EXTRACTED)
            stats["imports_internal"] += 1
        elif not target and name:
            _add_edge(G, src, _external(G, name), "imports", EXTRACTED)
            stats["imports_external"] += 1

    inherits: dict[str, list[str]] = defaultdict(list)

    def candidates(name: str, src: str, kinds: set[str]) -> list[str]:
        return [c for c in idx.by_name.get(name, []) if G.nodes[c].get("kind") in kinds and c != src]

    def lookup(name: str, src: str, cls: str | None, kinds: set[str]) -> tuple[list[str], str]:
        src_file = _file_of(G, src)
        parts = name.replace("()", "").split(".")
        head, last = parts[0], parts[-1]
        al = aliases.get(src_file, {})
        # python alias: mod.func / Symbol
        if head in al:
            kind, tgt = al[head]
            if kind == "symbol" and len(parts) == 1:
                return [tgt], EXTRACTED
            if kind == "symbol" and len(parts) == 2:
                m = idx.class_methods.get(tgt, {}).get(last)
                if m:
                    return [m], EXTRACTED
            if kind == "module":
                if len(parts) >= 2:
                    s = idx.file_syms.get(tgt, {}).get(parts[1])
                    if s and len(parts) == 2:
                        return [s], EXTRACTED
                    if s and len(parts) == 3:
                        m = idx.class_methods.get(s, {}).get(parts[2])
                        if m:
                            return [m], EXTRACTED
        if head in ("self", "this", "cls", "super", "base") and len(parts) == 2:
            if cls:
                m = idx.class_methods.get(cls, {}).get(last)
                if m:
                    return [m], INFERRED
                for base in inherits.get(cls, []):
                    m = idx.class_methods.get(base, {}).get(last)
                    if m:
                        return [m], INFERRED
            cands = candidates(last, src, {"method"})
            if len(cands) == 1:
                return cands, INFERRED
            same_file = [c for c in cands if _file_of(G, c) == src_file]
            return (same_file[:1], INFERRED) if len(same_file) == 1 else ([], "")
        if len(parts) == 1:
            s = idx.file_syms.get(src_file, {}).get(last)
            if s and G.nodes[s].get("kind") in kinds:
                return [s], EXTRACTED
            cands = candidates(last, src, kinds - {"method"})
        else:
            # Class.method or obj.method
            owner = idx.file_syms.get(src_file, {}).get(parts[-2])
            if owner and last in idx.class_methods.get(owner, {}):
                return [idx.class_methods[owner][last]], EXTRACTED
            owners = [c for c in idx.by_name.get(parts[-2], []) if G.nodes[c].get("kind") in ("class", "interface")]
            if len(owners) == 1 and last in idx.class_methods.get(owners[0], {}):
                return [idx.class_methods[owners[0]][last]], INFERRED
            # obj.method() on an unknown object: only methods, never generic names like add/get/append
            if last in COMMON_METHODS or len(last) < 4:
                return [], ""
            cands = candidates(last, src, {"method"})
        lang = G.nodes[src].get("lang")
        cands = [c for c in cands if G.nodes[c].get("lang") == lang] or cands
        if len(cands) == 1:
            return cands, INFERRED
        src_dir = posixpath.dirname(src_file)
        near = [c for c in cands if posixpath.dirname(_file_of(G, c)) == src_dir]
        if len(near) == 1:
            return near, INFERRED
        if 1 < len(cands) <= 3 and len(last) >= 6:
            return cands, AMBIGUOUS
        return [], ""

    # inheritance first, so self.method can look into base classes
    for r in refs:
        if r["kind"] != "inherit" or r["source"] not in G:
            continue
        found, conf = lookup(r["name"], r["source"], None, {"class", "interface"})
        if found:
            for t in found:
                _add_edge(G, r["source"], t, "inherits", conf)
                inherits[r["source"]].append(t)
            stats["inherits"] += 1
        else:
            bases = G.nodes[r["source"]].setdefault("bases", [])
            if r["name"] not in bases:
                bases.append(r["name"])

    for r in refs:
        k = r["kind"]
        if k not in ("call", "use") or r["source"] not in G:
            continue
        found, conf = lookup(r["name"], r["source"], r.get("cls"), {"function", "method", "class"})
        for t in found:
            _add_edge(G, r["source"], t, "calls" if k == "call" else "decorated_by", conf)
            stats[f"{k}_{conf.lower()}"] += 1

    for r in refs:
        if r["kind"] != "link" or r["source"] not in G:
            continue
        tgt = _resolve_import_path(idx, _file_of(G, r["source"]), r["name"] if r["name"].startswith((".", "/")) else "./" + r["name"])
        if tgt:
            _add_edge(G, r["source"], tgt, "links_to", EXTRACTED)
            stats["links"] += 1
    return dict(stats)


def link_mentions(G: nx.DiGraph, max_per_section: int = 30) -> int:
    """Sections that name a code symbol or a file get a 'mentions' edge."""
    names: dict[str, list[str]] = defaultdict(list)
    files_by_base: dict[str, list[str]] = defaultdict(list)
    for n, d in G.nodes(data=True):
        k = d.get("kind")
        if k in ("class", "interface", "function", "method"):
            nm = d.get("name") or d.get("label", "").strip(".()")
            camel = bool(re.search(r"[a-z][A-Z]", nm)) or ("_" in nm.strip("_"))
            if (k != "method" and len(nm) >= 6) or (len(nm) >= 5 and camel):
                names[nm].append(n)
        elif k == "file":
            files_by_base[n.split("/")[-1]].append(n)
            files_by_base[n].append(n)
    count = 0
    pending: list[tuple[str, list[str]]] = []
    freq: dict[str, int] = defaultdict(int)
    sections = 0
    for n, d in list(G.nodes(data=True)):
        if d.get("kind") not in MENTION_KINDS:
            continue
        sections += 1
        text = (d.get("label", "") + "\n" + d.get("text", ""))
        hits: list[str] = []
        for m in IDENT_RE.finditer(text):
            nm = m.group(0)
            c = names.get(nm)
            if not c or len(c) > 2:
                continue
            # plain lowercase words ("graphify", "literal") only count when written as code: name() or `name`
            distinctive = bool(re.search(r"[a-z][A-Z]|_", nm)) or nm[:1].isupper()
            after = text[m.end():m.end() + 1]
            before = text[m.start() - 1:m.start()] if m.start() else ""
            if distinctive or after == "(" or before == "`" or after == "`":
                hits.extend(c)
        for m in FILE_MENTION_RE.finditer(text):
            c = files_by_base.get(m.group(0)) or files_by_base.get(m.group(0).split("/")[-1])
            if c and len(c) <= 2:
                hits.extend(c)
        uniq = list(dict.fromkeys(h for h in hits if h != n))[:max_per_section]
        for h in uniq:
            freq[h] += 1
        pending.append((n, uniq))
    # a name that half the documentation mentions (often the project's own name) says nothing
    cap = max(12, int(sections * 0.04))
    for n, uniq in pending:
        for h in uniq:
            if freq[h] <= cap:
                _add_edge(G, n, h, "mentions", INFERRED)
                count += 1
    return count


def add_extraction(G: nx.DiGraph, ex: dict) -> None:
    for n in ex.get("nodes", []):
        if n["id"] in G:
            cur = G.nodes[n["id"]]
            for k, v in n.items():
                if k != "id" and k not in cur:
                    cur[k] = v
        else:
            G.add_node(n["id"], **{k: v for k, v in n.items() if k != "id"})
    for e in ex.get("edges", []):
        extra = {k: v for k, v in e.items() if k not in ("source", "target", "relation", "confidence")}
        _add_edge(G, e["source"], e["target"], e["relation"], e.get("confidence", INFERRED), **extra)
