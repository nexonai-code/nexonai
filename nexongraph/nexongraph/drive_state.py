"""State of the Google Drive sync: which Drive files were already turned into card facts."""
from __future__ import annotations

import datetime as _dt
import json
from pathlib import Path

from .cards import CARD_DIR

STATE_FILE = ".drive-stand.json"


def _empty() -> dict:
    return {"last_sync": None, "pending_since": None, "files": {}}


def _path(root: Path) -> Path:
    return Path(root) / CARD_DIR / STATE_FILE


def load_state(root: Path) -> dict:
    p = _path(root)
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return _empty()
        state = _empty()
        state.update({k: data.get(k, state[k]) for k in state})
        if not isinstance(state["files"], dict):
            state["files"] = {}
        return state
    except (OSError, ValueError):
        return _empty()


def save_state(root: Path, state: dict) -> None:
    p = _path(root)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(state, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")


def changed_files(state: dict, listing: list[dict]) -> list[dict]:
    known = state.get("files", {})
    return [f for f in listing if known.get(f.get("id")) != f.get("modified")]


def mark_synced(state: dict, items: list[dict], today: _dt.date) -> dict:
    s = {**_empty(), **state, "files": dict(state.get("files", {}))}
    for f in items:
        if f.get("id"):
            s["files"][f["id"]] = f.get("modified")
    s["last_sync"] = today.isoformat()
    s["pending_since"] = None
    return s


def mark_pending(state: dict, today: _dt.date) -> dict:
    s = {**_empty(), **state}
    if not s.get("pending_since"):
        s["pending_since"] = today.isoformat()
    return s
