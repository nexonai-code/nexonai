"""Watching a folder: rebuild when supported files change (polling, works everywhere)."""
from __future__ import annotations

import time
from pathlib import Path

from .scan import scan


def fingerprint(root: Path) -> dict[str, tuple[int, int]]:
    sr = scan(root, with_hash=False)
    out = {}
    for f in sr.files:
        try:
            st = f.path.stat()
            out[f.rel] = (int(st.st_mtime), st.st_size)
        except OSError:
            pass
    return out


def changed(old: dict, new: dict) -> list[str]:
    keys = set(old) | set(new)
    return sorted(k for k in keys if old.get(k) != new.get(k))


def watch_forever(dir_: str, interval: float = 5.0) -> None:
    from .pipeline import build
    root = Path(dir_).resolve()
    print(f"Beobachte {root} (Strg+C beendet) …")
    fp = fingerprint(root)
    build(root, progress=lambda m, f: None)
    print("Graph gebaut.")
    while True:
        time.sleep(interval)
        new = fingerprint(root)
        diff = changed(fp, new)
        if diff:
            time.sleep(1.5)  # let editors finish writing
            new = fingerprint(root)
            print(f"{len(diff)} Datei(en) geändert, baue neu …")
            try:
                r = build(root, progress=lambda m, f: None)
                print(f"Fertig: {r['nodes']} Knoten, {r['edges']} Verbindungen.")
            except Exception as err:
                print(f"Fehler: {err}")
            fp = new
