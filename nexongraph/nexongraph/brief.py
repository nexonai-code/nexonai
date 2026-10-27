"""nexongraph brief: the short situation report Claude reads at the start of every session."""
from __future__ import annotations

import datetime as _dt
from pathlib import Path

from .cards import Card, as_date, load_cards
from .check import check
from .drive_state import load_state

PRODUCT_TYPES = ("product", "app", "solution")


def _line(c: Card, extra: str = "") -> str:
    return f"- {c.title or c.id}" + (f" {extra}" if extra else "")


def brief(root: Path, today: _dt.date, max_lines: int = 60) -> str:
    root = Path(root)
    cards, _ = load_cards(root)
    sections: list[tuple[str, list[str]]] = []

    prefs = [c for c in cards if c.type in ("profile", "preference") and c.status == "valid"]
    prefs.sort(key=lambda c: (c.type != "profile", c.title.lower()))
    sections.append(("Gabriel's preferences", [f"- {c.title}: {c.summary}" for c in prefs]))

    prods = [c for c in cards if c.type in PRODUCT_TYPES and c.status != "retired"]
    prods.sort(key=lambda c: (PRODUCT_TYPES.index(c.type), c.title.lower()))
    sections.append(("Products & apps", [_line(c, f"[{c.type}] {c.status}") for c in prods]))

    pilots = [c for c in cards if c.type == "pilot" and c.status == "running"]
    sections.append(("Running pilots", [_line(c, f"(until {c.date('end').isoformat()})" if c.date("end") else "") for c in pilots]))

    offers = [c for c in cards if c.type == "offer" and c.status in ("draft", "sent")]
    far = _dt.date.max
    offers.sort(key=lambda c: (not (c.date("valid_until") and c.date("valid_until") < today), c.date("valid_until") or far, c.title))
    offer_lines = []
    for c in offers:
        vu = c.date("valid_until")
        overdue = vu is not None and vu < today
        offer_lines.append(f"- {'OVERDUE ' if overdue else ''}{c.title or c.id} [{c.status}]" + (f" valid until {vu.isoformat()}" if vu else ""))
    sections.append(("Open offers", offer_lines))

    recent = [c for c in cards if c.updated and 0 <= (today - c.updated).days <= 7]
    recent.sort(key=lambda c: (c.updated, c.title), reverse=True)
    sections.append(("Changed (7 days)", [_line(c, f"[{c.type}] {c.updated.isoformat()}") for c in recent]))

    rules = []
    for c in cards:
        if c.type == "decision" and c.status == "valid":
            d = c.date("date") or c.updated
            if d and 0 <= (today - d).days <= 30:
                rules.append((d, c))
    rules.sort(key=lambda x: (x[0], x[1].title), reverse=True)
    sections.append(("New rules (30 days)", [_line(c, d.isoformat()) for d, c in rules]))

    inbox = [c for c in cards if c.rel.split("/")[1:2] == ["eingang"]]
    sections.append(("Open questions", [f"- {c.title or c.id}: {c.fields.get('question', '')}".rstrip(": ") for c in inbox]))

    issues = check(root, today)
    n_err = sum(1 for i in issues if i.level == "error")
    sections.append(("Check", [f"{n_err} errors, {len(issues) - n_err} warnings"] + [f"- {i.line()}" for i in issues[:5]]))

    st = load_state(root)
    if st.get("pending_since"):
        drive = f"pending since {st['pending_since']}" + (f" (last {st['last_sync']})" if st.get("last_sync") else "")
    elif st.get("last_sync"):
        drive = f"last {st['last_sync']}"
    else:
        drive = "never"
    sections.append(("Drive sync", [drive]))

    lines = [f"# NexonAI brief {today.isoformat()}"]
    for title, body in sections:
        if body or title in ("Check", "Drive sync"):
            lines += ["", f"## {title}"] + body
    if max_lines and len(lines) > max_lines:
        rest = len(lines) - (max_lines - 1)
        lines = lines[: max_lines - 1] + [f"… ({rest} more lines, run nexongraph brief --full)"]
    return "\n".join(lines)
