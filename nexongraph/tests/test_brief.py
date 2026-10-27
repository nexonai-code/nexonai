from datetime import date

from nexongraph.brief import brief
from nexongraph.drive_state import changed_files, load_state, mark_pending, mark_synced, save_state

from test_check import write

TODAY = date(2026, 10, 27)


def test_brief_order_and_overdue(tmp_path):
    write(tmp_path, "produkte/p1.md", title="unpruuf Press", status="pilot")
    write(tmp_path, "piloten/pi1.md", type="pilot", status="running", end="2026-12-31", title="Clinic pilot")
    write(tmp_path, "angebote/o1.md", type="offer", status="sent", valid_until="2026-11-30", title="Later offer")
    write(tmp_path, "angebote/o2.md", type="offer", status="sent", valid_until="2026-10-01", title="Old offer")
    write(tmp_path, "gabriel/short.md", type="preference", status="valid", title="Short answers", summary="Hit the nail.")
    out = brief(tmp_path, TODAY)
    assert out.startswith("# NexonAI brief 2026-10-27")
    assert out.index("## Gabriel's preferences") < out.index("## Products & apps") < out.index("## Running pilots") < out.index("## Open offers")
    assert "- Short answers: Hit the nail." in out
    offers = out.split("## Open offers")[1].strip().splitlines()
    assert offers[0].startswith("- OVERDUE") and "Old offer" in offers[0]
    assert "Later offer" in offers[1]


def test_brief_drive_never_and_pending(tmp_path):
    write(tmp_path, "produkte/p1.md")
    assert "never" in brief(tmp_path, TODAY).split("## Drive sync")[1]
    save_state(tmp_path, mark_pending(load_state(tmp_path), TODAY))
    assert "pending since 2026-10-27" in brief(tmp_path, TODAY)
    save_state(tmp_path, mark_synced(load_state(tmp_path), [], TODAY))
    assert "last 2026-10-27" in brief(tmp_path, TODAY)


def test_changed_files():
    state = {"last_sync": None, "pending_since": None, "files": {"a": "2026-10-01T10:00:00Z"}}
    listing = [{"id": "a", "title": "A", "modified": "2026-10-01T10:00:00Z", "url": "u"},
               {"id": "b", "title": "B", "modified": "2026-10-02T10:00:00Z", "url": "u"},
               {"id": "a2", "title": "A2", "modified": "x", "url": "u"}]
    assert [f["id"] for f in changed_files(state, listing)] == ["b", "a2"]
    state = mark_synced(state, listing, TODAY)
    assert changed_files(state, listing) == [] and state["last_sync"] == "2026-10-27"


def test_broken_state_file_is_empty(tmp_path):
    (tmp_path / "wissen").mkdir()
    (tmp_path / "wissen" / ".drive-stand.json").write_text("{not json")
    assert load_state(tmp_path) == {"last_sync": None, "pending_since": None, "files": {}}


def test_brief_survives_broken_cards(tmp_path):
    write(tmp_path, "produkte/p1.md", updated="27.10.2026")
    p = tmp_path / "wissen" / "kunden" / "bad.md"
    p.parent.mkdir(parents=True)
    p.write_text("---\ntype: customer\n\tid: [x\n---\n")
    out = brief(tmp_path, TODAY)
    assert "2 errors" in out.split("## Check")[1]


def test_brief_changed_and_rules(tmp_path):
    write(tmp_path, "produkte/p1.md", updated="2026-10-25", title="Fresh")
    write(tmp_path, "produkte/p2.md", updated="2026-09-01", title="Old")
    write(tmp_path, "entscheidungen/d1.md", type="decision", status="valid", date="2026-10-20", title="Blue CI")
    out = brief(tmp_path, TODAY)
    changed = out.split("## Changed (7 days)")[1].split("##")[0]
    assert "Fresh" in changed and "Old" not in changed
    assert "Blue CI" in out.split("## New rules (30 days)")[1]


def test_brief_truncates(tmp_path):
    for i in range(80):
        write(tmp_path, f"produkte/p{i}.md")
    out = brief(tmp_path, TODAY, max_lines=60)
    lines = out.splitlines()
    assert len(lines) <= 60 and "more lines" in lines[-1]
    assert len(brief(tmp_path, TODAY, max_lines=0).splitlines()) > 80
