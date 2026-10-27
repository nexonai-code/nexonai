"""Python extractor based on the standard library ast module (no dependencies)."""
from __future__ import annotations

import ast
import io
import tokenize

from .model import EXTRACTED, edge, new_extraction, node, notes_from_comment, ref


def module_name(rel: str) -> str:
    parts = rel[:-3].split("/") if rel.endswith(".py") else rel.split("/")
    if parts and parts[-1] == "__init__":
        parts = parts[:-1]
    return ".".join(parts)


def _attr_chain(expr: ast.AST) -> str | None:
    parts = []
    while isinstance(expr, ast.Attribute):
        parts.append(expr.attr)
        expr = expr.value
    if isinstance(expr, ast.Name):
        parts.append(expr.id)
        return ".".join(reversed(parts))
    if isinstance(expr, ast.Call):
        inner = _attr_chain(expr.func)
        if inner:
            parts.append(inner + "()")
            return ".".join(reversed(parts))
    return None


def extract_python(source: str, rel: str) -> dict:
    ex = new_extraction()
    fid = node(ex, rel, rel.split("/")[-1], "file", rel, 1, lang="python", module=module_name(rel))
    try:
        tree = ast.parse(source, filename=rel)
    except (SyntaxError, ValueError) as err:
        ex["nodes"][0]["error"] = f"syntax: {err}"
        return ex
    doc = ast.get_docstring(tree)
    if doc:
        ex["nodes"][0]["doc"] = doc.strip().splitlines()[0][:240]

    spans: list[tuple[int, int, str]] = []   # (start, end, id) for note owners
    pkg = module_name(rel)
    is_pkg = rel.endswith("__init__.py")

    def resolve_relative(level: int, mod: str | None) -> str:
        base = pkg.split(".") if pkg else []
        if not is_pkg and base:
            base = base[:-1]
        if level > 1:
            base = base[: len(base) - (level - 1)] if level - 1 <= len(base) else []
        return ".".join([p for p in base + ([mod] if mod else []) if p])

    def visit_body(body, owner_id: str, owner_kind: str, class_id: str | None):
        for st in body:
            if isinstance(st, ast.ClassDef):
                cid = f"{owner_id}.{st.name}" if owner_kind != "file" else f"{rel}::{st.name}"
                cdoc = ast.get_docstring(st)
                node(ex, cid, st.name, "class", rel, st.lineno, lang="python",
                     doc=cdoc.strip().splitlines()[0][:240] if cdoc else None)
                edge(ex, owner_id, cid, "contains")
                spans.append((st.lineno, getattr(st, "end_lineno", st.lineno), cid))
                for b in st.bases:
                    name = _attr_chain(b)
                    if name:
                        ref(ex, cid, name, "inherit", st.lineno)
                for d in st.decorator_list:
                    name = _attr_chain(d.func if isinstance(d, ast.Call) else d)
                    if name:
                        ref(ex, cid, name, "use", st.lineno)
                visit_body(st.body, cid, "class", cid)
            elif isinstance(st, (ast.FunctionDef, ast.AsyncFunctionDef)):
                kind = "method" if owner_kind == "class" else "function"
                fnid = f"{owner_id}.{st.name}" if owner_kind != "file" else f"{rel}::{st.name}"
                label = f"{st.name}()" if kind == "function" else f".{st.name}()"
                fdoc = ast.get_docstring(st)
                node(ex, fnid, label, kind, rel, st.lineno, lang="python", name=st.name,
                     doc=fdoc.strip().splitlines()[0][:240] if fdoc else None)
                edge(ex, owner_id, fnid, "method" if kind == "method" else "contains")
                spans.append((st.lineno, getattr(st, "end_lineno", st.lineno), fnid))
                for d in st.decorator_list:
                    name = _attr_chain(d.func if isinstance(d, ast.Call) else d)
                    if name:
                        ref(ex, fnid, name, "use", st.lineno)
                collect_calls(st, fnid, class_id)
                visit_body(st.body, fnid, "function", class_id)
            elif isinstance(st, (ast.Import, ast.ImportFrom)):
                handle_import(st, owner_id)
            elif isinstance(st, (ast.If, ast.Try, ast.With, ast.AsyncWith, ast.For, ast.AsyncFor, ast.While)) or type(st).__name__ == "TryStar":
                # definitions inside if/try/with blocks still belong to the enclosing owner
                if owner_kind == "file" and isinstance(st, (ast.If, ast.While)):
                    collect_calls(st.test, fid, None, shallow=True)
                for attr in ("body", "orelse", "finalbody"):
                    visit_body(getattr(st, attr, []) or [], owner_id, owner_kind, class_id)
                for h in getattr(st, "handlers", []) or []:
                    visit_body(h.body, owner_id, owner_kind, class_id)
            elif owner_kind == "file":
                # module level statements: calls made at import time belong to the file
                collect_calls(st, fid, None, shallow=True)

    def handle_import(st, owner_id):
        if isinstance(st, ast.Import):
            for a in st.names:
                ref(ex, fid, a.name, "import", st.lineno, alias=a.asname or a.name.split(".")[0])
        else:
            mod = resolve_relative(st.level, st.module) if st.level else (st.module or "")
            for a in st.names:
                if a.name == "*":
                    ref(ex, fid, mod, "import", st.lineno)
                else:
                    ref(ex, fid, mod, "import_from", st.lineno, symbol=a.name, alias=a.asname or a.name)

    def collect_calls(fn, owner_id, class_id, shallow=False):
        stack = [fn] if not shallow else [fn]
        while stack:
            cur = stack.pop()
            for child in ast.iter_child_nodes(cur):
                if child is not fn and isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)) and not shallow:
                    if isinstance(child, ast.Lambda):
                        stack.append(child)
                    continue
                if isinstance(child, ast.Call):
                    name = _attr_chain(child.func)
                    if name:
                        ref(ex, owner_id, name, "call", getattr(child, "lineno", None), cls=class_id)
                stack.append(child)

    visit_body(tree.body, fid, "file", None)

    # comments: NOTE/WHY/TODO become note nodes owned by the innermost definition
    try:
        for tok in tokenize.generate_tokens(io.StringIO(source).readline):
            if tok.type == tokenize.COMMENT:
                line = tok.start[0]
                owner = fid
                best = None
                for s, e, i in spans:
                    if s <= line <= e and (best is None or s >= best[0]):
                        best = (s, e, i)
                if best:
                    owner = best[2]
                notes_from_comment(ex, tok.string.lstrip("#").strip(), line, rel, owner)
    except (tokenize.TokenError, IndentationError, SyntaxError):
        pass
    return ex
