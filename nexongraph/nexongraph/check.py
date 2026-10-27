"""nexongraph check: rules that keep the knowledge cards correct and current."""
from __future__ import annotations

import datetime as _dt
import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from .cards import (AREA_EXTRA_TYPES, AREAS, CARD_DIR, DATE_FIELDS, REF_FIELDS, REQUIRED, STATUSES, TYPES, Card,
                    as_date, as_list, load_cards)

ACTIVE_STATES = {"in-progress", "pilot", "running", "talking", "offer-sent"}
STALE_DAYS = 90
FORBIDDEN_FIELDS = ("owner", "responsible", "assignee")
DEFAULT_FORBIDDEN_TERMS = ["safeline", "certified", "GDPR-compliant", "unbreakable"]
TERM_CHECK_TYPES = {"customer", "material", "offer", "solution"}
NEGATIONS = ("not ", "nicht ", "ne")
ID_RE = re.compile(r"^[a-z0-9-]+$")


@dataclass
class Issue:
    level: str   # "error" | "warning"
    rel: str
    rule: str
    message: str

    def line(self) -> str:
        return f"{'ERROR' if self.level == 'error' else 'WARN'} {self.rel} {self.rule}: {self.message}"


def _area(card: Card) -> str:
    parts = card.rel.split("/")
    return parts[1] if len(parts) > 2 and parts[0] == CARD_DIR else ""


def _structure(c: Card, out: list[Issue]) -> bool:
    """Required fields, type, status, id. Returns False when the type is unusable."""
    for f in REQUIRED:
        if c.fields.get(f) in (None, "", []):
            out.append(Issue("error", c.rel, "missing-field", f"field '{f}' is missing or empty"))
    area = _area(c)
    if area == "eingang":
        out.append(Issue("warning", c.rel, "inbox-open", str(c.fields.get("question") or "card waits for assignment")))
    ok_type = c.type in TYPES
    if not ok_type:
        out.append(Issue("error", c.rel, "bad-type", f"unknown type '{c.type}'"))
    elif area in AREAS and AREAS[area] and c.type != AREAS[area] and c.type not in AREA_EXTRA_TYPES.get(area, set()):
        out.append(Issue("error", c.rel, "bad-type", f"type '{c.type}' does not belong in folder '{area}'"))
    elif area not in AREAS:
        out.append(Issue("error", c.rel, "bad-type", f"folder '{area}' is not a knowledge area"))
    if ok_type and c.status and c.status not in STATUSES[c.type]:
        out.append(Issue("error", c.rel, "bad-status", f"status '{c.status}' not allowed for {c.type}: {', '.join(sorted(STATUSES[c.type]))}"))
    stem = c.rel.rsplit("/", 1)[-1][:-3]
    if c.id and (c.id != stem or not ID_RE.match(c.id)):
        out.append(Issue("error", c.rel, "id-mismatch", f"id '{c.id}' must equal the file name and use a-z, 0-9, -"))
    for f in DATE_FIELDS:
        v = c.fields.get(f)
        if v not in (None, "") and as_date(v) is None:
            out.append(Issue("error", c.rel, "bad-date", f"{f} '{v}' is not an ISO date (YYYY-MM-DD)"))
    for f in FORBIDDEN_FIELDS:
        if f in c.fields:
            out.append(Issue("error", c.rel, "forbidden-field", f"field '{f}': no assignments to persons"))
    return ok_type


def _term_hits(text: str, term: str) -> bool:
    pat = re.compile(r"(?<![\w-])" + re.escape(term) + r"(?![\w-])", re.I)
    for m in pat.finditer(text):
        before = text[max(0, m.start() - 6):m.start()].lower()
        if not before.endswith(NEGATIONS):
            return True
    return False


def check(root: Path, today: _dt.date) -> list[Issue]:
    root = Path(root)
    cards, errors = load_cards(root)
    out: list[Issue] = [Issue("error", e.rel, e.rule, e.message) for e in errors]
    by_id: dict[str, list[Card]] = defaultdict(list)
    for c in cards:
        if c.id:
            by_id[c.id].append(c)

    for c in cards:
        ok_type = _structure(c, out)
        if len(by_id.get(c.id, [])) > 1:
            others = ", ".join(o.rel for o in by_id[c.id] if o is not c)
            out.append(Issue("error", c.rel, "duplicate-id", f"id '{c.id}' also used in {others}"))
        for f in REF_FIELDS:
            for target in as_list(c.fields.get(f)):
                if str(target) not in by_id:
                    out.append(Issue("error", c.rel, "unknown-ref", f"{f}: no card with id '{target}'"))
        for p in as_list(c.fields.get("code")):
            if not (root / str(p).strip().strip("/")).exists():
                out.append(Issue("error", c.rel, "missing-code-path", f"code path '{p}' does not exist"))
        if not ok_type:
            continue
        valid_until, end = c.date("valid_until"), c.date("end")
        if c.type == "offer" and c.status == "sent" and valid_until and valid_until < today:
            out.append(Issue("warning", c.rel, "offer-expired", f"valid until {valid_until.isoformat()}, still 'sent'"))
        if c.type == "pilot" and c.status == "running" and end and end < today:
            out.append(Issue("warning", c.rel, "pilot-overdue", f"end {end.isoformat()} passed, still 'running'"))
        if c.status in ACTIVE_STATES and c.updated and (today - c.updated).days > STALE_DAYS:
            out.append(Issue("warning", c.rel, "stale", f"status '{c.status}' not updated since {c.updated.isoformat()}"))
        states = c.fields.get("states")
        if c.type == "material" and isinstance(states, dict):
            for pid, st in states.items():
                for target in by_id.get(str(pid), []):
                    if target.status != str(st):
                        out.append(Issue("error", c.rel, "status-conflict",
                                         f"says '{pid}' is {st}, its card says {target.status}"))

    # two valid rules on the same topic
    groups: dict[tuple, list[Card]] = defaultdict(list)
    for c in cards:
        if c.type in ("decision", "preference") and c.status == "valid" and c.fields.get("topic"):
            key = (c.type == "preference", str(c.fields.get("scope", "")) if c.type == "decision" else "", str(c.fields["topic"]))
            groups[key].append(c)
    for key, cs in groups.items():
        for c in cs[1:]:
            out.append(Issue("error", c.rel, "decision-conflict",
                             f"topic '{key[2]}' also valid in {cs[0].rel}; set one to superseded"))

    # forbidden wording on customer-facing cards
    terms: list[str] = []
    for c in cards:
        if c.type == "decision" and c.status == "valid":
            terms.extend(str(t) for t in as_list(c.fields.get("forbidden_terms")))
    terms = terms or DEFAULT_FORBIDDEN_TERMS
    for c in cards:
        if c.type not in TERM_CHECK_TYPES:
            continue
        text = "\n".join((c.title, c.summary, c.body))
        for t in terms:
            if _term_hits(text, t):
                out.append(Issue("error", c.rel, "forbidden-term", f"forbidden term '{t}'"))

    rank = {"error": 0, "warning": 1}
    out.sort(key=lambda i: (rank.get(i.level, 2), i.rel, i.rule))
    return out


def run_cli(root: str, today: str | None) -> int:
    t = _dt.date.fromisoformat(today) if today else _dt.date.today()
    issues = check(Path(root), t)
    for i in issues:
        print(i.line())
    n_err = sum(1 for i in issues if i.level == "error")
    n_warn = len(issues) - n_err
    print(f"{n_err} errors, {n_warn} warnings")
    return 1 if n_err else 0
