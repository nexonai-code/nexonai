from datetime import date

import pytest

from nexongraph.check import check
from nexongraph.cli import main

TODAY = date(2026, 10, 27)


def write(root, rel, extra="", body="", **f):
    """Writes a valid card; keyword fields override the defaults, value None drops a field."""
    folder, name = rel.split("/")
    fields = {"type": f.pop("type", "product"), "id": name[:-3], "title": "T", "status": "tested",
              "updated": "2026-10-20", "summary": "S"}
    fields.update(f)
    lines = [f"{k}: {v}" for k, v in fields.items() if v is not None]
    p = root / "wissen" / folder / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("---\n" + "\n".join(lines) + "\n" + extra + "---\n" + body + "\n", encoding="utf-8")
    return p


def rules(issues):
    return {i.rule for i in issues}


def test_clean_set_has_no_issues(tmp_path):
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "a.py").write_text("x = 1\n")
    write(tmp_path, "produkte/p1.md", material="[m1]")
    write(tmp_path, "apps/a1.md", type="app", products="[p1]", code="[src/a.py]")
    write(tmp_path, "loesungen/s1.md", type="solution", products="[p1]")
    write(tmp_path, "material/m1.md", type="material", products="[p1]", extra="states: {p1: tested}\n")
    write(tmp_path, "kunden/c1.md", type="customer", status="talking")
    write(tmp_path, "piloten/pi1.md", type="pilot", status="running", customer="c1", end="2026-12-31")
    write(tmp_path, "angebote/o1.md", type="offer", status="sent", customer="c1", valid_until="2026-11-30")
    write(tmp_path, "partner/pa1.md", type="partner", status="active")
    write(tmp_path, "entscheidungen/d1.md", type="decision", status="valid", scope="all", topic="naming")
    write(tmp_path, "gabriel/profile.md", type="profile", status="valid")
    write(tmp_path, "gabriel/short-answers.md", type="preference", status="valid", topic="style")
    assert check(tmp_path, TODAY) == []


def test_parse_error(tmp_path):
    p = tmp_path / "wissen" / "kunden" / "bad.md"
    p.parent.mkdir(parents=True)
    p.write_text("---\ntype: customer\n\tid: [x\n---\n")
    assert rules(check(tmp_path, TODAY)) == {"parse-error"}


def test_missing_field(tmp_path):
    write(tmp_path, "produkte/p1.md", summary=None)
    assert rules(check(tmp_path, TODAY)) == {"missing-field"}


def test_bad_type_and_wrong_folder(tmp_path):
    write(tmp_path, "produkte/p1.md", type="widget")
    write(tmp_path, "kunden/p2.md", type="product")
    assert [i.rule for i in check(tmp_path, TODAY)] == ["bad-type", "bad-type"]


def test_inbox_any_type_is_only_a_warning(tmp_path):
    write(tmp_path, "eingang/x1.md", type="customer", status="lead", question="Which customer?")
    issues = check(tmp_path, TODAY)
    assert rules(issues) == {"inbox-open"} and issues[0].level == "warning"


def test_bad_status(tmp_path):
    write(tmp_path, "angebote/o1.md", type="offer", status="tested")
    assert rules(check(tmp_path, TODAY)) == {"bad-status"}


def test_bad_date(tmp_path):
    write(tmp_path, "produkte/p1.md", updated="27.10.2026")
    write(tmp_path, "angebote/o1.md", type="offer", status="draft", valid_until="2026-11")
    assert rules(check(tmp_path, TODAY)) == {"bad-date"}


def test_id_mismatch(tmp_path):
    write(tmp_path, "produkte/p1.md", id="other")
    write(tmp_path, "produkte/Big.md", id="Big")
    assert [i.rule for i in check(tmp_path, TODAY)] == ["id-mismatch", "id-mismatch"]


def test_duplicate_id(tmp_path):
    write(tmp_path, "produkte/p1.md")
    write(tmp_path, "apps/p1.md", type="app")
    assert "duplicate-id" in rules(check(tmp_path, TODAY))


def test_unknown_ref(tmp_path):
    write(tmp_path, "apps/a1.md", type="app", products="[nope]")
    assert rules(check(tmp_path, TODAY)) == {"unknown-ref"}


def test_missing_code_path(tmp_path):
    write(tmp_path, "apps/a1.md", type="app", code="[src/missing]")
    assert rules(check(tmp_path, TODAY)) == {"missing-code-path"}


def test_forbidden_field(tmp_path):
    write(tmp_path, "kunden/c1.md", type="customer", status="lead", owner="Gabriel")
    assert rules(check(tmp_path, TODAY)) == {"forbidden-field"}


def test_offer_expired(tmp_path):
    write(tmp_path, "angebote/o1.md", type="offer", status="sent", valid_until="2026-10-01")
    issues = check(tmp_path, TODAY)
    assert rules(issues) == {"offer-expired"} and issues[0].level == "warning"


def test_pilot_overdue(tmp_path):
    write(tmp_path, "piloten/pi1.md", type="pilot", status="running", end="2026-10-01")
    assert rules(check(tmp_path, TODAY)) == {"pilot-overdue"}


def test_stale(tmp_path):
    write(tmp_path, "kunden/c1.md", type="customer", status="talking", updated="2026-07-01")
    write(tmp_path, "kunden/c2.md", type="customer", status="lost", updated="2025-01-01")
    assert [(i.rel, i.rule) for i in check(tmp_path, TODAY)] == [("wissen/kunden/c1.md", "stale")]


def test_decision_conflict(tmp_path):
    write(tmp_path, "entscheidungen/d1.md", type="decision", status="valid", scope="all", topic="color")
    write(tmp_path, "entscheidungen/d2.md", type="decision", status="valid", scope="all", topic="color")
    write(tmp_path, "entscheidungen/d3.md", type="decision", status="superseded", scope="all", topic="color")
    assert rules(check(tmp_path, TODAY)) == {"decision-conflict"}


def test_preference_conflict(tmp_path):
    write(tmp_path, "gabriel/a.md", type="preference", status="valid", topic="style")
    write(tmp_path, "gabriel/b.md", type="preference", status="valid", topic="style")
    assert rules(check(tmp_path, TODAY)) == {"decision-conflict"}


def test_status_conflict(tmp_path):
    write(tmp_path, "produkte/p1.md", status="pilot")
    write(tmp_path, "material/m1.md", type="material", extra="states: {p1: tested}\n")
    assert rules(check(tmp_path, TODAY)) == {"status-conflict"}


def test_forbidden_term_negation(tmp_path):
    write(tmp_path, "material/m1.md", type="material", summary="Not audited, not certified.")
    write(tmp_path, "material/m2.md", type="material", body="nicht zertifiziert; nicht certified")
    assert check(tmp_path, TODAY) == []
    write(tmp_path, "material/m3.md", type="material", summary="Certified by an authority.")
    assert [(i.rel, i.rule) for i in check(tmp_path, TODAY)] == [("wissen/material/m3.md", "forbidden-term")]


def test_forbidden_terms_from_decisions(tmp_path):
    write(tmp_path, "entscheidungen/d1.md", type="decision", status="valid", scope="all", topic="claims",
          extra="forbidden_terms: [unique]\n")
    write(tmp_path, "kunden/c1.md", type="customer", status="lead", summary="We are unique; safeline is fine here")
    issues = check(tmp_path, TODAY)
    assert [i.rule for i in issues] == ["forbidden-term"] and "unique" in issues[0].message


def test_cli_exit_codes(tmp_path, capsys):
    write(tmp_path, "angebote/o1.md", type="offer", status="sent", valid_until="2026-10-01")
    main(["check", str(tmp_path), "--today", "2026-10-27"])
    assert "WARN wissen/angebote/o1.md offer-expired" in capsys.readouterr().out
    write(tmp_path, "apps/a1.md", type="app", products="[nope]")
    with pytest.raises(SystemExit) as e:
        main(["check", str(tmp_path), "--today", "2026-10-27"])
    assert e.value.code == 1
    assert "ERROR wissen/apps/a1.md unknown-ref" in capsys.readouterr().out


def test_open_conflict_is_warning(tmp_path):
    write(tmp_path, "angebote/o1.md", type="offer", status="draft", extra="conflicts: ['price: card 4800 vs Drive 5200 (Offer.pdf)']\n")
    issues = check(tmp_path, TODAY)
    assert [(i.rule, i.level) for i in issues] == [("open-conflict", "warning")] and "5200" in issues[0].message


def test_hyphenated_forbidden_term(tmp_path):
    write(tmp_path, "material/m1.md", type="material", summary="ISO-certified hosting")
    assert rules(check(tmp_path, TODAY)) == {"forbidden-term"}
