import os
import subprocess
from pathlib import Path

import pytest

from nexongraph.guard import guard_main, session_base, stale_cards

REPO = Path(__file__).resolve().parents[2]


def git(root, *args):
    return subprocess.run(["git", *args], cwd=root, capture_output=True, text=True, check=True).stdout.strip()


@pytest.fixture
def repo(tmp_path):
    root = tmp_path / "r"
    (root / "app").mkdir(parents=True)
    (root / "wissen" / "apps").mkdir(parents=True)
    (root / "app" / "x.py").write_text("x = 1\n")
    (root / "wissen" / "apps" / "a.md").write_text(
        "---\ntype: app\nid: a\ntitle: A\nstatus: tested\nupdated: 2026-10-27\nsummary: s\ncode: [app]\n---\n")
    git(root, "init", "-q")
    git(root, "-c", "user.email=t@t", "-c", "user.name=t", "add", ".")
    git(root, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "init")
    (root / ".git" / "wissen-session-base").write_text(git(root, "rev-parse", "HEAD"))
    return root


def test_code_change_without_card_blocks_once(repo, capsys):
    (repo / "app" / "x.py").write_text("x = 2\n")
    assert guard_main(repo) == 2
    assert "Karten nachziehen" in capsys.readouterr().err
    assert guard_main(repo) == 0


def test_code_change_with_card_passes(repo):
    (repo / "app" / "x.py").write_text("x = 2\n")
    (repo / "wissen" / "apps" / "a.md").write_text((repo / "wissen" / "apps" / "a.md").read_text() + "- changed\n")
    assert guard_main(repo) == 0


def test_new_change_after_block_blocks_again(repo):
    (repo / "app" / "x.py").write_text("x = 2\n")
    assert guard_main(repo) == 2
    (repo / "newapp").mkdir()
    (repo / "newapp" / "main.py").write_text("print(1)\n")
    assert guard_main(repo) == 2


def test_new_top_folder_reported(repo):
    (repo / "newapp").mkdir()
    (repo / "newapp" / "main.py").write_text("print(1)\n")
    msgs = stale_cards(repo, session_base(repo))
    assert "new folder newapp has no card" in msgs


def test_excluded_folders_not_reported(repo):
    for d in ("docs", "scripts", ".claude"):
        (repo / d).mkdir()
        (repo / d / "f.md").write_text("x\n")
    assert stale_cards(repo, session_base(repo)) == []


def test_no_base_no_block(repo):
    (repo / ".git" / "wissen-session-base").unlink()
    (repo / "app" / "x.py").write_text("x = 2\n")
    assert guard_main(repo) == 0


def test_detached_head_and_bad_base(repo):
    git(repo, "checkout", "-q", "--detach")
    (repo / ".git" / "wissen-session-base").write_text("deadbeef")
    (repo / "app" / "x.py").write_text("x = 2\n")
    assert session_base(repo) is None and guard_main(repo) == 0


def test_not_a_git_repo(tmp_path):
    assert guard_main(tmp_path) == 0


def test_start_script_never_fails(tmp_path):
    env = {"PATH": "/nonexistent", "HOME": str(tmp_path)}
    r = subprocess.run(["/bin/bash", str(REPO / "scripts" / "wissen-start.sh")], cwd=tmp_path, env=env,
                       capture_output=True, text=True, timeout=60)
    assert r.returncode == 0
    assert r.stdout.startswith("Wissensbasis nicht verfügbar")


def test_guard_script_without_nexongraph(tmp_path):
    env = {"PATH": "/usr/bin:/bin", "HOME": str(tmp_path), "PYTHONPATH": "/nonexistent"}
    r = subprocess.run(["/bin/bash", str(REPO / "scripts" / "wissen-guard.sh")], cwd=tmp_path, env=env,
                       capture_output=True, text=True, timeout=60)
    assert r.returncode == 0


def test_start_hook_keeps_base_on_compact(repo):
    base_file = repo / ".git" / "wissen-session-base"
    base_file.write_text("keep-me")
    subprocess.run(["/bin/bash", str(REPO / "scripts" / "wissen-start.sh")], cwd=repo, input='{"source":"compact"}',
                   capture_output=True, text=True, timeout=120, env={**os.environ, "CLAUDE_PROJECT_DIR": str(repo)})
    assert base_file.read_text() == "keep-me"
    subprocess.run(["/bin/bash", str(REPO / "scripts" / "wissen-start.sh")], cwd=repo, input='{"source":"startup"}',
                   capture_output=True, text=True, timeout=120, env={**os.environ, "CLAUDE_PROJECT_DIR": str(repo)})
    assert base_file.read_text().strip() == git(repo, "rev-parse", "HEAD")
