from datetime import date

from nexongraph.brief import brief
from nexongraph.check import check
from nexongraph.persons import PERSONS, active_person

from test_check import write

TODAY = date(2026, 10, 27)


def test_active_person_default_env_and_file(tmp_path, monkeypatch):
    monkeypatch.delenv("NEXON_PERSON", raising=False)
    assert active_person(tmp_path) == "gabriel"
    (tmp_path / ".nexon-person").write_text("norbert\n")
    assert active_person(tmp_path) == "norbert"
    monkeypatch.setenv("NEXON_PERSON", "Gabriel")
    assert active_person(tmp_path) == "gabriel"
    monkeypatch.setenv("NEXON_PERSON", "nobody")
    assert active_person(tmp_path) == "norbert"   # unknown value is ignored, file wins
    assert set(PERSONS) == {"gabriel", "norbert"}


def test_brief_shows_only_active_persons_preferences(tmp_path, monkeypatch):
    monkeypatch.delenv("NEXON_PERSON", raising=False)
    write(tmp_path, "gabriel/short.md", type="preference", status="valid", title="Short answers", topic="length")
    write(tmp_path, "norbert/profile.md", type="profile", status="valid", title="Norbert", summary="Works on a Mac.",
          extra="open_questions: ['Which language in the chat?', 'What should never happen?']\n")
    write(tmp_path, "norbert/english.md", type="preference", status="valid", title="English chat", topic="length")
    out = brief(tmp_path, TODAY)
    prefs = out.split("## Gabriel's preferences")[1].split("##")[0]
    assert "Short answers" in prefs and "English chat" not in prefs
    assert "Questions for" not in out
    (tmp_path / ".nexon-person").write_text("norbert")
    out = brief(tmp_path, TODAY)
    prefs = out.split("## Norbert's preferences")[1].split("##")[0]
    assert "English chat" in prefs and "Short answers" not in prefs
    q = out.split("## Questions for Norbert")[1]
    assert "- Which language in the chat?" in q


def test_same_topic_in_two_persons_is_no_conflict(tmp_path):
    write(tmp_path, "gabriel/a.md", type="preference", status="valid", topic="language")
    write(tmp_path, "norbert/b.md", type="preference", status="valid", topic="language")
    write(tmp_path, "norbert/profile.md", type="profile", status="valid")
    assert check(tmp_path, TODAY) == []
