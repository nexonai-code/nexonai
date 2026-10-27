"""Who is working right now: Gabriel and Norbert share one Claude and GitHub account,
so the person is taken from the machine, not from the account.

Order: environment variable NEXON_PERSON, then the local file <repo>/.nexon-person
(written once on Norbert's Mac by install.command, never committed), else "gabriel".
"""
from __future__ import annotations

import os
from pathlib import Path

PERSONS = {"gabriel": "Gabriel", "norbert": "Norbert"}
DEFAULT = "gabriel"
PERSON_FILE = ".nexon-person"


def active_person(root: Path) -> str:
    env = (os.environ.get("NEXON_PERSON") or "").strip().lower()
    if env in PERSONS:
        return env
    try:
        v = (Path(root) / PERSON_FILE).read_text(encoding="utf-8").strip().lower()
        if v in PERSONS:
            return v
    except OSError:
        pass
    return DEFAULT
