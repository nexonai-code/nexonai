"""User settings and the list of known projects (stored in the user profile, never in the project)."""
from __future__ import annotations

import hashlib
import json
import os
import threading
from pathlib import Path

from . import OUT_DIR_NAME

_LOCK = threading.Lock()

DEFAULTS = {
    "lang": "de",
    "out_mode": "project",          # "project": <folder>/nexongraph-out, "appdata": in the user profile
    "semantic": False,              # semantic pass over documents by default
    "llm": {"provider": "none", "model": "", "api_key": "", "base_url": ""},
    "port": 8765,
    "projects": [],
}


def app_dir() -> Path:
    base = os.environ.get("NEXONGRAPH_HOME")
    if base:
        p = Path(base)
    elif os.name == "nt":
        p = Path(os.environ.get("APPDATA", Path.home())) / "NexonGraph"
    else:
        p = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "nexongraph"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _path() -> Path:
    return app_dir() / "config.json"


def load() -> dict:
    with _LOCK:
        cfg = json.loads(json.dumps(DEFAULTS))
        p = _path()
        if p.exists():
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
                for k, v in data.items():
                    if isinstance(v, dict) and isinstance(cfg.get(k), dict):
                        cfg[k].update(v)
                    else:
                        cfg[k] = v
            except Exception:
                pass
        if os.environ.get("NEXONGRAPH_API_KEY") and not cfg["llm"].get("api_key"):
            cfg["llm"]["api_key"] = os.environ["NEXONGRAPH_API_KEY"]
        return cfg


def save(cfg: dict) -> None:
    with _LOCK:
        p = _path()
        tmp = p.with_suffix(".tmp")
        tmp.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(p)


def out_dir_for(root: Path, cfg: dict | None = None) -> Path:
    cfg = cfg or load()
    root = Path(root).resolve()
    if cfg.get("out_mode") == "appdata":
        h = hashlib.sha1(str(root).lower().encode()).hexdigest()[:10]
        return app_dir() / "graphs" / f"{root.name}-{h}"
    return root / OUT_DIR_NAME


def find_out_dir(root: Path) -> Path | None:
    """Where an existing graph for this folder lives (project folder first, then profile)."""
    root = Path(root).resolve()
    for p in (root / OUT_DIR_NAME, out_dir_for(root, {"out_mode": "appdata"})):
        if (p / "graph.json").exists():
            return p
    for pr in load().get("projects", []):
        if Path(pr.get("root", "")).resolve() == root and (Path(pr.get("out", "")) / "graph.json").exists():
            return Path(pr["out"])
    return None


def remember_project(root: Path, out: Path, info: dict) -> None:
    cfg = load()
    root_s = str(Path(root).resolve())
    projects = [p for p in cfg.get("projects", []) if p.get("root") != root_s]
    projects.insert(0, {"root": root_s, "out": str(out), "name": Path(root_s).name, **info})
    cfg["projects"] = projects[:30]
    save(cfg)


def forget_project(root: str) -> None:
    cfg = load()
    cfg["projects"] = [p for p in cfg.get("projects", []) if p.get("root") != root]
    save(cfg)


def public(cfg: dict) -> dict:
    """Settings for the browser: the API key is masked."""
    c = json.loads(json.dumps(cfg))
    key = c.get("llm", {}).get("api_key", "")
    c["llm"]["api_key"] = ("•" * 8 + key[-4:]) if key else ""
    c["llm"]["has_key"] = bool(key)
    return c
