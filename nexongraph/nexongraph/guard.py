"""Upkeep guard: at the end of a session, report code that changed while its card did not.

Used by the Stop hook (scripts/wissen-guard.sh). Exit code 2 blocks the stop once and
tells Claude which cards to update; the same set of findings never blocks twice.
"""
from __future__ import annotations

import hashlib
import subprocess
import sys
from pathlib import Path

from .cards import CARD_DIR, as_list, load_cards

EXCLUDED_TOPS = {CARD_DIR, "docs", "scripts", ".claude", ".superpowers", "nexongraph-out"}
GROUP_DIRS = {"unpruuf"}   # products live one level deeper: unpruuf/<app>/


def _git(root: Path, *args: str) -> str | None:
    try:
        r = subprocess.run(["git", *args], cwd=root, capture_output=True, text=True, timeout=30, check=False)
    except (OSError, subprocess.SubprocessError):
        return None
    return r.stdout.strip() if r.returncode == 0 else None


def _git_dir(root: Path) -> Path | None:
    d = _git(root, "rev-parse", "--git-dir")
    return (Path(root) / d) if d else None


def session_base(root: Path) -> str | None:
    gd = _git_dir(root)
    if not gd:
        return None
    try:
        sha = (gd / "wissen-session-base").read_text().strip()
    except OSError:
        return None
    if not sha or _git(root, "cat-file", "-e", f"{sha}^{{commit}}") is None:
        return None
    return sha


def changed_paths(root: Path, base: str) -> set[str]:
    diff = _git(root, "diff", "--name-only", base) or ""
    untracked = _git(root, "ls-files", "--others", "--exclude-standard") or ""
    return {p for p in (diff.splitlines() + untracked.splitlines()) if p}


def _top(path: str) -> str | None:
    parts = path.split("/")
    if len(parts) < 2:
        return None
    if parts[0] in GROUP_DIRS and len(parts) >= 3:
        return "/".join(parts[:2])
    return parts[0]


def stale_cards(root: Path, base: str) -> list[str]:
    root = Path(root)
    changed = changed_paths(root, base)
    cards, _ = load_cards(root)
    msgs: list[str] = []
    code_paths: list[str] = []
    for c in cards:
        paths = [str(p).strip().strip("/") for p in as_list(c.fields.get("code")) + as_list(c.fields.get("path")) if str(p).strip()]
        code_paths.extend(paths)
        if c.rel in changed:
            continue
        for p in paths:
            hit = sorted(f for f in changed if f == p or f.startswith(p + "/"))
            if hit:
                msgs.append(f"card {c.rel}: code changed in {hit[0]}, card not updated")
                break
    tops = set()
    for f in changed:
        t = _top(f)
        if not t or t.split("/")[0] in EXCLUDED_TOPS or t.startswith("."):
            continue
        tops.add(t)
    for t in sorted(tops):
        covered = any(p == t or p.startswith(t + "/") or t.startswith(p + "/") for p in code_paths)
        if covered or _git(root, "cat-file", "-e", f"{base}:{t}") is not None:
            continue
        msgs.append(f"new folder {t} has no card")
    return msgs


def guard_main(root: Path) -> int:
    root = Path(root)
    base = session_base(root)
    if not base:
        return 0
    msgs = stale_cards(root, base)
    if not msgs:
        return 0
    digest = hashlib.sha1("\n".join(msgs).encode()).hexdigest()
    marker = _git_dir(root) / "wissen-guard-last"
    try:
        if marker.read_text().strip() == digest:
            return 0
    except OSError:
        pass
    try:
        marker.write_text(digest)
    except OSError:
        return 0
    print("Karten nachziehen:\n" + "\n".join(f"- {m}" for m in msgs) +
          "\nUpdate these cards in wissen/ (status, updated, facts), run `nexongraph check .`, commit.", file=sys.stderr)
    return 2
