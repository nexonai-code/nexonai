"""Extractor for non-Python languages.

Uses tree-sitter (package tree-sitter-language-pack) when it is installed and falls
back to a regex scan otherwise. The tree-sitter walk is generic: each language only
declares which node types are definitions, calls, imports and inheritance clauses.
"""
from __future__ import annotations

import re

from .model import edge, new_extraction, node, notes_from_comment, ref

try:  # optional dependency
    from tree_sitter_language_pack import get_parser as _get_parser
except Exception:  # pragma: no cover - depends on installation
    _get_parser = None

_PARSERS: dict = {}

CLASS_TYPES = {
    "class_declaration", "class_definition", "class_specifier", "class", "interface_declaration",
    "struct_specifier", "struct_item", "struct_declaration", "enum_declaration", "enum_item",
    "trait_item", "trait_declaration", "object_declaration", "protocol_declaration", "record_declaration",
    "type_spec", "module", "object_definition", "trait_definition", "interface_type", "mixin_declaration",
    "enum_specifier", "union_specifier", "impl_item",
}
FUNC_TYPES = {
    "function_declaration", "function_definition", "method_definition", "method_declaration",
    "function_item", "constructor_declaration", "method", "singleton_method", "function_signature_item",
    "secondary_constructor", "init_declaration", "protocol_function_declaration", "local_function_statement",
    "function_signature", "method_signature", "arrow_function", "function_expression", "generator_function_declaration",
}
CALL_TYPES = {
    "call_expression", "method_invocation", "invocation_expression", "call", "function_call_expression",
    "member_call_expression", "scoped_call_expression", "object_creation_expression", "new_expression",
    "macro_invocation", "function_call", "method_call",
}
IMPORT_TYPES = {
    "import_statement", "import_declaration", "import_header", "use_declaration", "using_directive",
    "import_spec", "namespace_use_declaration", "preproc_include", "import_from_statement",
    "require_call", "import_directive", "include_statement",
}
INHERIT_TYPES = {
    "class_heritage", "extends_clause", "implements_clause", "superclass", "super_interfaces",
    "delegation_specifier", "delegation_specifiers", "base_list", "base_class_clause", "extends_interfaces",
    "inheritance_specifier", "type_inheritance_clause", "trait_bounds", "interfaces",
}
NAME_TYPES = {
    "identifier", "type_identifier", "simple_identifier", "property_identifier", "field_identifier",
    "constant", "name", "word", "scoped_identifier", "qualified_name",
}


def _parser(lang: str):
    if _get_parser is None:
        return None
    if lang not in _PARSERS:
        try:
            _PARSERS[lang] = _get_parser(lang)
        except Exception:
            _PARSERS[lang] = None
    return _PARSERS[lang]


def treesitter_available() -> bool:
    return _get_parser is not None


def _txt(n, src: bytes) -> str:
    return src[n.start_byte:n.end_byte].decode("utf-8", "replace")


def _name_of(n, src: bytes) -> str | None:
    for field in ("name", "declarator", "type"):
        c = n.child_by_field_name(field)
        if c is not None:
            if c.type in NAME_TYPES:
                return _txt(c, src)
            # C/C++ declarators: function_declarator -> identifier
            for sub in _walk(c):
                if sub.type in NAME_TYPES:
                    return _txt(sub, src)
    for c in n.children:
        if c.type in NAME_TYPES:
            return _txt(c, src)
    # arrow functions: const foo = () => ...  -> parent variable_declarator holds the name
    p = n.parent
    if p is not None and p.type in ("variable_declarator", "pair", "assignment_expression", "public_field_definition", "field_definition"):
        c = p.child_by_field_name("name") or p.child_by_field_name("key") or p.child_by_field_name("left")
        if c is not None:
            return _txt(c, src)
    return None


def _walk(n):
    stack = [n]
    while stack:
        cur = stack.pop()
        yield cur
        stack.extend(reversed(cur.children))


def _callee(n, src: bytes) -> str | None:
    target = None
    for field in ("function", "name", "method", "constructor", "type", "macro"):
        target = n.child_by_field_name(field)
        if target is not None:
            break
    if target is None and n.children:
        target = n.children[0]
    if target is None:
        return None
    text = _txt(target, src)
    text = re.split(r"[(<\[{\s]", text, maxsplit=1)[0]
    text = text.replace("?.", ".").replace("->", ".").replace("::", ".").replace("!", "")
    text = text.strip(".")
    if not text or len(text) > 120:
        return None
    return text


def _import_target(n, src: bytes) -> str | None:
    for sub in _walk(n):
        if sub.type in ("string", "string_literal", "interpreted_string_literal", "system_lib_string", "string_fragment"):
            s = _txt(sub, src).strip("'\"<>`")
            if s:
                return s
    text = _txt(n, src)
    text = re.sub(r"^(import|using|use|from|package|include|require|#include)\s+", "", text.strip())
    text = re.sub(r"\s+as\s+\w+.*$", "", text)
    text = text.rstrip(";").strip()
    text = re.sub(r"^(static|type)\s+", "", text)
    return text.split()[0] if text else None


def extract_generic(source: str, rel: str, lang: str) -> dict:
    parser = _parser(lang)
    if parser is None:
        return extract_regex(source, rel, lang)
    ex = new_extraction()
    fid = node(ex, rel, rel.split("/")[-1], "file", rel, 1, lang=lang)
    src = source.encode("utf-8", "replace")
    try:
        tree = parser.parse(src)
    except Exception as err:  # pragma: no cover
        ex["nodes"][0]["error"] = f"parse: {err}"
        return ex

    seen_ids: set[str] = {fid}

    def visit(n, owner_id: str, owner_kind: str, class_id: str | None):
        for c in n.children:
            t = c.type
            if t in CLASS_TYPES and t != "impl_item":
                name = _name_of(c, src)
                if name and len(name) < 120:
                    cid = f"{owner_id}.{name}" if owner_kind != "file" else f"{rel}::{name}"
                    if cid in seen_ids:
                        cid = f"{cid}@L{c.start_point[0] + 1}"
                    seen_ids.add(cid)
                    kind = "interface" if "interface" in t or "protocol" in t or "trait" in t else "class"
                    node(ex, cid, name, kind, rel, c.start_point[0] + 1, lang=lang)
                    edge(ex, owner_id, cid, "contains")
                    for sub in c.children:
                        if sub.type in INHERIT_TYPES or sub.type in ("superclass",):
                            for leaf in _walk(sub):
                                if leaf.type in ("type_identifier", "identifier", "simple_identifier", "constant", "name", "scoped_type_identifier", "user_type"):
                                    if leaf.type in ("user_type", "scoped_type_identifier"):
                                        nm = _txt(leaf, src)
                                    elif leaf.parent is not None and leaf.parent.type in ("user_type", "scoped_type_identifier"):
                                        continue
                                    else:
                                        nm = _txt(leaf, src)
                                    nm = re.split(r"[<(]", nm)[0]
                                    if nm and nm != name:
                                        ref(ex, cid, nm, "inherit", c.start_point[0] + 1)
                    visit(c, cid, "class", cid)
                    continue
            if t == "impl_item":
                # rust: impl Foo { fn bar() } -> methods belong to Foo
                ty = c.child_by_field_name("type")
                name = _txt(ty, src).split("<")[0] if ty is not None else None
                target = f"{rel}::{name}" if name else owner_id
                if name and target not in seen_ids:
                    seen_ids.add(target)
                    node(ex, target, name, "class", rel, c.start_point[0] + 1, lang=lang)
                    edge(ex, fid, target, "contains")
                tr = c.child_by_field_name("trait")
                if tr is not None and name:
                    ref(ex, target, _txt(tr, src).split("<")[0], "inherit", c.start_point[0] + 1)
                visit(c, target, "class", target)
                continue
            if t in FUNC_TYPES:
                name = _name_of(c, src)
                if t in ("arrow_function", "function_expression") and (c.parent is None or c.parent.type not in ("variable_declarator", "pair", "public_field_definition", "field_definition", "assignment_expression")):
                    name = None
                if name and len(name) < 120 and re.match(r"^[\w$~.:]+$", name):
                    kind = "method" if owner_kind == "class" else "function"
                    fnid = f"{owner_id}.{name}" if owner_kind != "file" else f"{rel}::{name}"
                    if fnid in seen_ids:
                        fnid = f"{fnid}@L{c.start_point[0] + 1}"
                    seen_ids.add(fnid)
                    node(ex, fnid, f".{name}()" if kind == "method" else f"{name}()", kind, rel,
                         c.start_point[0] + 1, lang=lang, name=name)
                    edge(ex, owner_id, fnid, "method" if kind == "method" else "contains")
                    visit_calls(c, fnid, class_id)
                    visit(c, fnid, "function", class_id)
                    continue
            if t in IMPORT_TYPES:
                tgt = _import_target(c, src)
                if tgt:
                    ref(ex, fid, tgt, "import", c.start_point[0] + 1)
                continue
            if t == "comment" or t.endswith("_comment"):
                notes_from_comment(ex, _txt(c, src).strip("/*# \n\t"), c.start_point[0] + 1, rel, owner_id)
                continue
            if owner_kind == "file" and t in CALL_TYPES:
                nm = _callee(c, src)
                if nm == "require":
                    tgt = _import_target(c, src)
                    if tgt:
                        ref(ex, fid, tgt, "import", c.start_point[0] + 1)
            visit(c, owner_id, owner_kind, class_id)

    def visit_calls(fn, owner_id: str, class_id: str | None):
        stack = list(fn.children)
        while stack:
            cur = stack.pop()
            if cur.type in CLASS_TYPES or (cur.type in FUNC_TYPES and cur.type not in ("arrow_function", "function_expression")):
                continue
            if cur.type in CALL_TYPES:
                nm = _callee(cur, src)
                if nm == "require":
                    tgt = _import_target(cur, src)
                    if tgt:
                        ref(ex, fid, tgt, "import", cur.start_point[0] + 1)
                elif nm:
                    ref(ex, owner_id, nm, "call", cur.start_point[0] + 1, cls=class_id)
            if cur.type == "comment" or cur.type.endswith("_comment"):
                notes_from_comment(ex, _txt(cur, src).strip("/*# \n\t"), cur.start_point[0] + 1, rel, owner_id)
            stack.extend(cur.children)

    visit(tree.root_node, fid, "file", None)
    return ex


_RX = {
    "def": re.compile(r"^\s*(?:export\s+)?(?:public|private|protected|internal|static|async|final|open|override|abstract|suspend|inline|\s)*"
                      r"(?:function|func|fun|def|fn|sub)\s+([A-Za-z_$][\w$]*)", re.M),
    "cls": re.compile(r"^\s*(?:export\s+)?(?:public|private|protected|internal|abstract|final|sealed|data|open|static|\s)*"
                      r"(class|interface|struct|trait|enum|object|protocol)\s+([A-Za-z_$][\w$]*)", re.M),
    "imp": re.compile(r"^\s*(?:import|using|use|#include|require)\s+[\"'<]?([\w./@\-:]+)", re.M),
    "call": re.compile(r"\b([A-Za-z_$][\w$]*)\s*\("),
}
_KEYWORDS = {"if", "for", "while", "switch", "catch", "return", "function", "func", "fun", "def", "fn", "new", "sizeof", "typeof", "super", "this", "print", "println"}


def extract_regex(source: str, rel: str, lang: str) -> dict:
    """Fallback without tree-sitter: definitions and imports by pattern, calls by line ownership."""
    ex = new_extraction()
    fid = node(ex, rel, rel.split("/")[-1], "file", rel, 1, lang=lang, parser="regex")
    defs: list[tuple[int, str]] = []
    for m in _RX["cls"].finditer(source):
        line = source.count("\n", 0, m.start()) + 1
        cid = f"{rel}::{m.group(2)}"
        node(ex, cid, m.group(2), "interface" if m.group(1) in ("interface", "trait", "protocol") else "class", rel, line, lang=lang)
        edge(ex, fid, cid, "contains")
        defs.append((line, cid))
    for m in _RX["def"].finditer(source):
        line = source.count("\n", 0, m.start()) + 1
        fnid = f"{rel}::{m.group(1)}"
        if any(d[1] == fnid for d in defs):
            fnid += f"@L{line}"
        node(ex, fnid, f"{m.group(1)}()", "function", rel, line, lang=lang, name=m.group(1))
        edge(ex, fid, fnid, "contains")
        defs.append((line, fnid))
    for m in _RX["imp"].finditer(source):
        ref(ex, fid, m.group(1), "import", source.count("\n", 0, m.start()) + 1)
    defs.sort()
    fn_defs = [d for d in defs if "()" in next((n["label"] for n in ex["nodes"] if n["id"] == d[1]), "")]
    lines = source.splitlines()
    for i, text in enumerate(lines, start=1):
        owner = None
        for line, did in fn_defs:
            if line <= i:
                owner = did
        if owner is None:
            continue
        for m in _RX["call"].finditer(text):
            nm = m.group(1)
            if nm not in _KEYWORDS:
                ref(ex, owner, nm, "call", i)
        if "//" in text or "#" in text:
            notes_from_comment(ex, text.split("//", 1)[-1] if "//" in text else text.split("#", 1)[-1], i, rel, owner)
    return ex
