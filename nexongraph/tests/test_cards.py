from datetime import date

import pytest

from nexongraph.cards import CardError, load_cards, parse_card, refs

GOOD = ("---\ntype: product\nid: unpruuf-press\ntitle: unpruuf Press\nstatus: pilot\nupdated: 2026-10-27\nsummary: s\n"
        "products: [unpruuf-business]\ncode: unpruuf/officer-app\n---\n- point\n")


def test_parse_card_fields():
    c = parse_card(GOOD, "wissen/produkte/unpruuf-press.md")
    assert c.id == "unpruuf-press" and c.updated == date(2026, 10, 27) and c.fields["code"] == "unpruuf/officer-app"
    assert refs(c) == [("concerns", "unpruuf-business")]
    assert c.body.strip() == "- point"


def test_no_frontmatter_is_not_a_card():
    assert parse_card("# Title\ntext", "wissen/x.md") is None


def test_frontmatter_without_type_is_not_a_card():
    assert parse_card("---\ntitle: x\n---\nbody", "wissen/x.md") is None


def test_broken_yaml_raises():
    with pytest.raises(CardError) as e:
        parse_card("---\ntype: product\n\tid: [x\n---\n", "wissen/produkte/x.md")
    assert e.value.rule == "parse-error" and e.value.rel == "wissen/produkte/x.md"


def test_unclosed_frontmatter_raises():
    with pytest.raises(CardError):
        parse_card("---\ntype: product\nid: x\n", "wissen/produkte/x.md")


def test_bad_date_keeps_card():
    c = parse_card(GOOD.replace("updated: 2026-10-27", "updated: 27.10.2026"), "wissen/produkte/unpruuf-press.md")
    assert c.updated is None and c.fields["updated"] == "27.10.2026"


def test_refs_single_and_list():
    c = parse_card(GOOD.replace("products: [unpruuf-business]", "customer: clinic-a\nsupersedes: [old-1, old-2]"), "r.md")
    assert refs(c) == [("for_customer", "clinic-a"), ("supersedes", "old-1"), ("supersedes", "old-2")]


def test_load_cards_skips_site_and_readme(tmp_path):
    w = tmp_path / "wissen"
    (w / "site").mkdir(parents=True)
    (w / "produkte").mkdir()
    (w / "site" / "index.md").write_text(GOOD)
    (w / "README.md").write_text(GOOD)
    (w / "produkte" / "_draft.md").write_text(GOOD)
    (w / "produkte" / "unpruuf-press.md").write_text(GOOD)
    (w / "produkte" / "bad.md").write_text("---\ntype: product\n\tid: [x\n---\n")
    cards, errors = load_cards(tmp_path)
    assert [c.rel for c in cards] == ["wissen/produkte/unpruuf-press.md"]
    assert [e.rel for e in errors] == ["wissen/produkte/bad.md"]


def test_load_cards_without_folder(tmp_path):
    assert load_cards(tmp_path) == ([], [])


def test_impossible_date_is_parse_error():
    with pytest.raises(CardError) as e:
        parse_card(GOOD.replace("updated: 2026-10-27", "updated: 2026-02-30"), "wissen/produkte/unpruuf-press.md")
    assert e.value.rule == "parse-error"


def test_area_file_that_is_not_a_card_is_reported(tmp_path):
    w = tmp_path / "wissen" / "produkte"
    w.mkdir(parents=True)
    (w / "no-dashes.md").write_text("type: product\nid: no-dashes\n")
    (w / "typo.md").write_text("---\ntyp: product\nid: typo\n---\n")
    (tmp_path / "wissen" / "DRIVE-SYNC.md").write_text("# not an area file\n")
    cards, errors = load_cards(tmp_path)
    assert cards == [] and sorted(e.rel for e in errors) == ["wissen/produkte/no-dashes.md", "wissen/produkte/typo.md"]
