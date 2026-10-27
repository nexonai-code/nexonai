"""Knowledge cards: Markdown files with YAML front matter under wissen/.

This module is the only place that knows the card format. Everything else
(graph extraction, check, brief, site) builds on parse_card / load_cards.
"""
from __future__ import annotations

import datetime as _dt
from dataclasses import dataclass, field
from pathlib import Path

import yaml

CARD_DIR = "wissen"

AREAS: dict[str, str] = {
    "produkte": "product",
    "apps": "app",
    "loesungen": "solution",
    "material": "material",
    "kunden": "customer",
    "piloten": "pilot",
    "angebote": "offer",
    "partner": "partner",
    "entscheidungen": "decision",
    "gabriel": "preference",   # each person's folder also holds their single "profile" card
    "norbert": "preference",
    "eingang": "",             # unclear cards, any type
}
AREA_EXTRA_TYPES = {"gabriel": {"profile"}, "norbert": {"profile"}}

_BUILD_STATES = {"planned", "in-progress", "pilot", "tested", "live", "paused", "retired"}
STATUSES: dict[str, set[str]] = {
    "product": _BUILD_STATES,
    "app": _BUILD_STATES,
    "solution": _BUILD_STATES,
    "material": _BUILD_STATES,
    "customer": {"lead", "talking", "offer-sent", "pilot", "customer", "paused", "lost"},
    "pilot": {"planned", "running", "done", "stopped"},
    "offer": {"draft", "sent", "accepted", "declined", "expired"},
    "partner": {"candidate", "active", "paused", "ended"},
    "decision": {"valid", "superseded"},
    "preference": {"valid", "superseded"},
    "profile": {"valid"},
}
TYPES: set[str] = set(STATUSES)
REQUIRED = ("type", "id", "title", "status", "updated", "summary")
REF_FIELDS: dict[str, str] = {
    "products": "concerns",
    "customer": "for_customer",
    "supersedes": "supersedes",
    "partner": "with_partner",
    "material": "has_material",
}
DATE_FIELDS = ("updated", "valid_until", "start", "end", "date")


def area_of(rel: str) -> str:
    parts = rel.split("/")
    return parts[1] if len(parts) > 2 and parts[0] == CARD_DIR else ""


class CardError(Exception):
    def __init__(self, rel: str, rule: str, message: str):
        super().__init__(f"{rel}: {message}")
        self.rel, self.rule, self.message = rel, rule, message


@dataclass
class Card:
    id: str
    type: str
    title: str
    status: str
    updated: _dt.date | None
    summary: str
    fields: dict = field(default_factory=dict)
    body: str = ""
    rel: str = ""

    def date(self, name: str) -> _dt.date | None:
        return as_date(self.fields.get(name))


def as_date(v) -> _dt.date | None:
    if isinstance(v, _dt.datetime):
        return v.date()
    if isinstance(v, _dt.date):
        return v
    if isinstance(v, str):
        try:
            return _dt.date.fromisoformat(v.strip())
        except ValueError:
            return None
    return None


def as_list(v) -> list:
    if v is None or v == "":
        return []
    return list(v) if isinstance(v, (list, tuple)) else [v]


def parse_card(text: str, rel: str) -> Card | None:
    text = text.lstrip("﻿")
    if not text.startswith("---"):
        return None
    lines = text.splitlines()
    if lines[0].strip() != "---":
        return None
    end = next((i for i in range(1, len(lines)) if lines[i].strip() == "---"), None)
    if end is None:
        if any(l.startswith("type:") for l in lines[1:]):
            raise CardError(rel, "parse-error", "front matter is not closed with ---")
        return None
    try:
        data = yaml.safe_load("\n".join(lines[1:end])) or {}
    except yaml.YAMLError as err:
        raise CardError(rel, "parse-error", f"invalid YAML: {str(err).splitlines()[0]}") from None
    except (ValueError, TypeError) as err:  # e.g. impossible dates like 2026-02-30
        raise CardError(rel, "parse-error", f"invalid value: {err}") from None
    if not isinstance(data, dict) or "type" not in data:
        return None
    body = "\n".join(lines[end + 1:])
    s = lambda k: "" if data.get(k) is None else str(data.get(k))
    return Card(id=s("id"), type=s("type"), title=s("title"), status=s("status"),
                updated=as_date(data.get("updated")), summary=s("summary"),
                fields=data, body=body, rel=rel)


def refs(card: Card) -> list[tuple[str, str]]:
    out = []
    for f, relation in REF_FIELDS.items():
        for target in as_list(card.fields.get(f)):
            if target not in (None, ""):
                out.append((relation, str(target)))
    return out


def load_cards(root: Path) -> tuple[list[Card], list[CardError]]:
    base = Path(root) / CARD_DIR
    cards: list[Card] = []
    errors: list[CardError] = []
    if not base.is_dir():
        return cards, errors
    for p in sorted(base.rglob("*.md")):
        rel = p.relative_to(root).as_posix()
        parts = p.relative_to(base).parts
        if parts[0] == "site" or p.name.startswith("_") or p.name.upper() == "README.MD":
            continue
        try:
            c = parse_card(p.read_text(encoding="utf-8", errors="replace"), rel)
        except CardError as err:
            errors.append(err)
            continue
        if c is not None:
            cards.append(c)
        elif len(parts) > 1 and parts[0] in AREAS:
            errors.append(CardError(rel, "parse-error", "not a card: front matter between --- lines with 'type:' is missing"))
    return cards, errors
