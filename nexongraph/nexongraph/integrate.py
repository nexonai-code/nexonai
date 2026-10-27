"""Connects NexonGraph to AI assistants: Claude Code (skill + MCP), Claude Desktop and Cursor (MCP)."""
from __future__ import annotations

import datetime as _dt
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

SKILL = """---
name: nexongraph
description: Knowledge graph of the current project (code, docs, PDFs). Use it to find where something lives, what depends on what, and how two parts connect, before reading many files. Trigger on "/nexongraph", "where is", "what calls", "how does X connect to Y", "explain the architecture".
---

# NexonGraph

NexonGraph turns a folder into a knowledge graph (`nexongraph-out/graph.json`, `graph.html`, `REPORT.md`).
Code is parsed locally; nothing leaves the machine unless a semantic pass with an online model was switched on.

## Build or update the graph

```bash
"{python}" -m nexongraph build "<project folder>"
```

Rebuilding is incremental: unchanged files come from the cache.

## Query instead of grepping

```bash
"{python}" -m nexongraph query "<question>" --dir "<project folder>"
"{python}" -m nexongraph explain "<name>" --dir "<project folder>"
"{python}" -m nexongraph path "<A>" "<B>" --dir "<project folder>"
"{python}" -m nexongraph search "<words>" --dir "<project folder>"
```

Read `nexongraph-out/REPORT.md` first for the big picture: central nodes, areas, surprising links.

Every edge is tagged EXTRACTED (stated in the source), INFERRED (resolved by NexonGraph) or AMBIGUOUS (check it).
When the MCP server `nexongraph` is connected, prefer its tools `query`, `search`, `explain`, `path`, `report`.
"""


def _python() -> str:
    """The interpreter of this installation (inside .venv when started via the .bat files)."""
    exe = Path(sys.executable)
    if os.name == "nt" and exe.name.lower() == "pythonw.exe":
        exe = exe.with_name("python.exe")
    return str(exe)


def _backup(p: Path) -> None:
    if p.exists():
        stamp = _dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        shutil.copy2(p, p.with_name(p.name + f".backup-{stamp}"))


def _merge_mcp(p: Path, key: str = "mcpServers") -> str:
    p.parent.mkdir(parents=True, exist_ok=True)
    data = {}
    if p.exists():
        try:
            data = json.loads(p.read_text(encoding="utf-8") or "{}")
        except json.JSONDecodeError:
            return f"übersprungen, Datei ist kein gültiges JSON: {p}"
    _backup(p)
    data.setdefault(key, {})["nexongraph"] = {"command": _python(), "args": ["-m", "nexongraph", "mcp"]}
    p.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return f"eingetragen in {p}"


def claude_desktop_config() -> Path:
    if os.name == "nt":
        return Path(os.environ.get("APPDATA", Path.home())) / "Claude" / "claude_desktop_config.json"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "Claude" / "claude_desktop_config.json"
    return Path.home() / ".config" / "Claude" / "claude_desktop_config.json"


def install_all() -> list[str]:
    msgs = []
    # Claude Code skill
    skill_dir = Path.home() / ".claude" / "skills" / "nexongraph"
    skill_dir.mkdir(parents=True, exist_ok=True)
    (skill_dir / "SKILL.md").write_text(SKILL.replace("{python}", _python()), encoding="utf-8")
    msgs.append(f"Claude Code Skill: {skill_dir / 'SKILL.md'}")
    # Claude Code MCP via its CLI, when installed
    claude = shutil.which("claude") or shutil.which("claude.cmd")
    if claude:
        try:
            subprocess.run([claude, "mcp", "remove", "--scope", "user", "nexongraph"], capture_output=True, timeout=60)
            r = subprocess.run([claude, "mcp", "add", "--scope", "user", "nexongraph", "--", _python(), "-m", "nexongraph", "mcp"],
                               capture_output=True, text=True, timeout=60)
            msgs.append("Claude Code MCP: " + ("eingetragen" if r.returncode == 0 else f"Fehler: {(r.stderr or r.stdout).strip()[:200]}"))
        except Exception as err:
            msgs.append(f"Claude Code MCP: Fehler: {err}")
    else:
        msgs.append("Claude Code MCP: Claude Code nicht gefunden, übersprungen (der Skill funktioniert trotzdem).")
    # Claude Desktop
    cd = claude_desktop_config()
    if cd.parent.exists():
        msgs.append("Claude Desktop MCP: " + _merge_mcp(cd) + " (Claude Desktop neu starten)")
    else:
        msgs.append("Claude Desktop MCP: Claude Desktop nicht gefunden, übersprungen.")
    # Cursor
    cursor = Path.home() / ".cursor"
    if cursor.exists():
        msgs.append("Cursor MCP: " + _merge_mcp(cursor / "mcp.json"))
    return msgs


def uninstall_all() -> list[str]:
    msgs = []
    skill_dir = Path.home() / ".claude" / "skills" / "nexongraph"
    if skill_dir.exists():
        shutil.rmtree(skill_dir)
        msgs.append("Claude Code Skill entfernt.")
    for p in (claude_desktop_config(), Path.home() / ".cursor" / "mcp.json"):
        if p.exists():
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
                if data.get("mcpServers", {}).pop("nexongraph", None) is not None:
                    _backup(p)
                    p.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
                    msgs.append(f"MCP entfernt aus {p}")
            except Exception:
                pass
    claude = shutil.which("claude") or shutil.which("claude.cmd")
    if claude:
        subprocess.run([claude, "mcp", "remove", "--scope", "user", "nexongraph"], capture_output=True, timeout=60)
        msgs.append("Claude Code MCP entfernt.")
    return msgs or ["Nichts zu entfernen."]
