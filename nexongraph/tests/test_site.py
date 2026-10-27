import json
import re
from datetime import date, timedelta

import pytest

from nexongraph.site import export_site, site_payload

from test_check import write

TODAY = date(2026, 10, 27)


@pytest.fixture(autouse=True)
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("NEXONGRAPH_HOME", str(tmp_path / "home"))


def project(tmp_path):
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "a.py").write_text("def relay(): pass\n")
    write(tmp_path, "produkte/p1.md", title="unpruuf Press", status="pilot")
    write(tmp_path, "apps/a1.md", type="app", products="[p1]", code="[src/a.py]", body="- **Relay** client")
    write(tmp_path, "angebote/o1.md", type="offer", status="sent", valid_until=(TODAY - timedelta(days=1)).isoformat(),
          extra="drive: [{title: Offer PDF, url: 'https://drive.google.com/x', modified: '2026-10-01'}]\n")
    write(tmp_path, "gabriel/short.md", type="preference", status="valid", title="Short answers")
    return tmp_path


def test_export_files(tmp_path):
    root = project(tmp_path)
    index = export_site(root, root / "wissen" / "site", TODAY)
    assert index.name == "index.html" and (index.parent / "graph.html").exists()
    html = index.read_text(encoding="utf-8")
    assert not re.search(r'<(script|link)[^>]+(src|href)="https?:', html)
    assert "unpruuf Press" in html and 'lang="ro"' in html


def test_payload_overdue(tmp_path):
    p = site_payload(project(tmp_path), TODAY)
    assert p["overdue"] == ["o1"]
    assert {c["id"] for c in p["cards"]} == {"p1", "a1", "o1", "short"}


def test_no_drive_fulltext_fields(tmp_path):
    p = site_payload(project(tmp_path), TODAY)
    offer = next(c for c in p["cards"] if c["id"] == "o1")
    assert offer["fields"]["drive"] == [{"title": "Offer PDF", "url": "https://drive.google.com/x", "modified": "2026-10-01"}]
    assert set(offer) == {"id", "type", "title", "status", "updated", "summary", "fields", "body", "rel"}
    json.dumps(p)  # serialisable, dates as strings


def test_export_without_graph_is_single_file(tmp_path):
    root = project(tmp_path)
    out = tmp_path / "single"
    f = export_site(root, out, TODAY, with_graph=False, name="NexonAI_Wissen.html")
    assert [p.name for p in out.iterdir()] == ["NexonAI_Wissen.html"]
    assert '"no_graph": true' in f.read_text(encoding="utf-8")
