# NexonAI — GRAL architecture apps

Code for apps built on **GRAL** (Gabriel's/NexonAI's privacy-first, serverless-by-default
architecture — no account, no central server required, Tor-based P2P). This repo is the home for
all GRAL-based apps; each one lives in its own top-level folder.

## Apps in this repo

- **`unpruuf/`** — a privacy-focused P2P messenger. The first and, currently, only app here.
  Start with `unpruuf/HANDOFF.md`, then `unpruuf/STATUS.md` (the full technical source of truth).
  See `unpruuf/README.md` for that app's own directory map and build instructions.

## About this repo

Started 2026-09-24 as a clean, standalone home for NexonAI's GRAL-architecture work — split out
from an internal working repository that had unrelated projects sitting alongside it. History
intentionally starts fresh here (single initial commit); only what was already tracked in the
source repository was carried over, with build artifacts, dependencies, and every generated
runtime/secret file excluded (none of those were ever tracked to begin with).
