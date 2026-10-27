from pathlib import Path

import pytest

from nexongraph.cards import parse_card
from nexongraph.cli import main
from nexongraph.extract_cards import cards_extraction
from nexongraph.pipeline import build
from nexongraph.query import load_graph


@pytest.fixture(autouse=True)
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("NEXONGRAPH_HOME", str(tmp_path / "home"))


def card(type_, id_, extra="", folder="apps"):
    text = f"---\ntype: {type_}\nid: {id_}\ntitle: {id_.title()}\nstatus: tested\nupdated: 2026-10-27\nsummary: About {id_}.\n{extra}---\nBody of {id_}.\n"
    return text, f"wissen/{folder}/{id_}.md"


def edges(ex):
    return {(e["source"], e["target"], e["relation"]) for e in ex["edges"]}


def test_card_edges():
    app = parse_card(*card("app", "relay-app", "products: [unpruuf-business]\ncode: [src/a.py, src]\n"))
    product = parse_card(*card("product", "unpruuf-business", folder="produkte"))
    ex = cards_extraction([app, product], files={"src/a.py", "src/b.py"})
    assert ("card::relay-app", "card::unpruuf-business", "concerns") in edges(ex)
    assert ("card::relay-app", "src/a.py", "implemented_in") in edges(ex)
    assert ("card::relay-app", "dir::src", "implemented_in") in edges(ex)
    assert ("dir::src", "src/b.py", "contains") in edges(ex)
    node = next(n for n in ex["nodes"] if n["id"] == "card::relay-app")
    assert node["kind"] == "app" and node["status"] == "tested" and node["label"] == "Relay-App"


def test_unknown_ref_creates_no_edge():
    app = parse_card(*card("app", "relay-app", "products: [nope]\n"))
    ex = cards_extraction([app], files=set())
    assert not any(t == "card::nope" for _, t, _ in edges(ex))
    assert all(n["id"] != "card::nope" for n in ex["nodes"])


def make(tmp_path):
    root = tmp_path / "proj"
    (root / "src").mkdir(parents=True)
    (root / "src" / "a.py").write_text("def relay_fetch():\n    return 1\n")
    (root / "wissen" / "apps").mkdir(parents=True)
    t, rel = card("app", "relay-app", "code: [src/a.py]\n")
    (root / rel).write_text(t)
    return root


def test_build_with_cards(tmp_path):
    root = make(tmp_path)
    r = build(root, semantic=False)
    G = load_graph(Path(r["out"]) / "graph.json")
    assert G.nodes["card::relay-app"]["kind"] == "app"
    assert G.has_edge("card::relay-app", "src/a.py")
    assert "wissen/apps/relay-app.md" not in G


def test_broken_card_does_not_break_build(tmp_path):
    root = make(tmp_path)
    (root / "wissen" / "kunden").mkdir()
    (root / "wissen" / "kunden" / "bad.md").write_text("---\ntype: customer\n\tid: [x\n---\n")
    r = build(root, semantic=False)
    G = load_graph(Path(r["out"]) / "graph.json")
    assert any("bad.md" in e for e in G.graph["errors"])


def test_search_kind_filter(tmp_path, capsys):
    root = make(tmp_path)
    build(root, semantic=False)
    main(["search", "relay", "--dir", str(root), "--kind", "app"])
    out = capsys.readouterr().out.strip().splitlines()
    assert out and all("[app]" in line for line in out)
