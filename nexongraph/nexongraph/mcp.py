"""MCP server over stdio (JSON-RPC 2.0, one message per line), no SDK needed.

Gives Claude Desktop, Claude Code, Cursor and other MCP clients these tools:
list_projects, search, explain, path, query, report.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from . import __version__, config
from .query import Searcher, explain_text, load_graph, path_text, query_text

PROTOCOL = "2024-11-05"

_DIR = {"type": "string", "description": "Projektordner (optional). Ohne Angabe: der Standard-Ordner des Servers bzw. das zuletzt gebaute Projekt."}
TOOLS = [
    {"name": "list_projects", "description": "Lists the folders that have a NexonGraph knowledge graph.",
     "inputSchema": {"type": "object", "properties": {}}},
    {"name": "query", "description": "Answers a plain-language question with the relevant part of the knowledge graph (nodes with file:line and their connections). Use this before reading files.",
     "inputSchema": {"type": "object", "properties": {"question": {"type": "string"}, "dir": _DIR, "max_nodes": {"type": "integer", "default": 60}}, "required": ["question"]}},
    {"name": "search", "description": "Finds nodes (classes, functions, documents, sections, terms) by name or words.",
     "inputSchema": {"type": "object", "properties": {"text": {"type": "string"}, "dir": _DIR, "limit": {"type": "integer", "default": 15}}, "required": ["text"]}},
    {"name": "explain", "description": "Shows one node with its source location and all its connections.",
     "inputSchema": {"type": "object", "properties": {"name": {"type": "string"}, "dir": _DIR}, "required": ["name"]}},
    {"name": "path", "description": "Shortest path between two things in the graph, with the relation of each step.",
     "inputSchema": {"type": "object", "properties": {"a": {"type": "string"}, "b": {"type": "string"}, "dir": _DIR}, "required": ["a", "b"]}},
    {"name": "report", "description": "The REPORT.md of a project: central nodes, areas, surprising links, open questions.",
     "inputSchema": {"type": "object", "properties": {"dir": _DIR}}},
]


class Server:
    def __init__(self, default_dir: str | None = None):
        self.default_dir = default_dir
        self._cache: dict[str, tuple[float, object]] = {}

    def _out(self, d: str | None) -> Path:
        d = d or self.default_dir
        if not d:
            projects = config.load().get("projects", [])
            if not projects:
                raise ValueError("Noch kein Graph gebaut. Zuerst: nexongraph build <Ordner>")
            return Path(projects[0]["out"])
        out = config.find_out_dir(Path(d))
        if not out:
            raise ValueError(f"Für {d} gibt es noch keinen Graphen. Zuerst: nexongraph build \"{d}\"")
        return out

    def graph(self, d: str | None):
        out = self._out(d)
        gp = out / "graph.json"
        mtime = gp.stat().st_mtime
        key = str(gp)
        if key not in self._cache or self._cache[key][0] != mtime:
            self._cache[key] = (mtime, load_graph(gp))
        return self._cache[key][1], out

    def call(self, name: str, args: dict) -> str:
        if name == "list_projects":
            ps = config.load().get("projects", [])
            if not ps:
                return "Noch keine Projekte."
            return "\n".join(f"- {p['root']} ({p.get('nodes', '?')} Knoten, gebaut {p.get('built', '?')})" for p in ps)
        G, out = self.graph(args.get("dir"))
        if name == "query":
            return query_text(G, args["question"], int(args.get("max_nodes", 60)))
        if name == "search":
            S = Searcher(G)
            rows = []
            for n, sc in S.search(args["text"], int(args.get("limit", 15))):
                d = G.nodes[n]
                loc = (d.get("source_file") or "") + (f":{d['line']}" if d.get("line") else "")
                rows.append(f"- {d.get('label', n)} [{d.get('kind')}] {loc}  (id: {n})")
            return "\n".join(rows) or "Nichts gefunden."
        if name == "explain":
            return explain_text(G, args["name"])
        if name == "path":
            return path_text(G, args["a"], args["b"])
        if name == "report":
            return (out / "REPORT.md").read_text(encoding="utf-8")
        raise ValueError(f"Unbekanntes Werkzeug: {name}")

    def handle(self, msg: dict) -> dict | None:
        mid = msg.get("id")
        method = msg.get("method", "")
        if method == "initialize":
            return {"jsonrpc": "2.0", "id": mid, "result": {
                "protocolVersion": msg.get("params", {}).get("protocolVersion", PROTOCOL),
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "nexongraph", "version": __version__},
                "instructions": "Knowledge graph of a project folder. Use 'query' or 'search' first, then 'explain' and 'path', before reading files."}}
        if method in ("notifications/initialized", "initialized") or method.startswith("notifications/"):
            return None
        if method == "ping":
            return {"jsonrpc": "2.0", "id": mid, "result": {}}
        if method == "tools/list":
            return {"jsonrpc": "2.0", "id": mid, "result": {"tools": TOOLS}}
        if method == "tools/call":
            p = msg.get("params", {})
            try:
                text = self.call(p.get("name", ""), p.get("arguments") or {})
                return {"jsonrpc": "2.0", "id": mid, "result": {"content": [{"type": "text", "text": text}]}}
            except Exception as err:
                return {"jsonrpc": "2.0", "id": mid, "result": {"content": [{"type": "text", "text": f"Fehler: {err}"}], "isError": True}}
        if mid is None:
            return None
        return {"jsonrpc": "2.0", "id": mid, "error": {"code": -32601, "message": f"Method not found: {method}"}}


def run(default_dir: str | None = None) -> None:
    srv = Server(default_dir)
    stdin = sys.stdin.buffer
    stdout = sys.stdout.buffer
    for raw in stdin:
        raw = raw.strip()
        if not raw:
            continue
        try:
            msg = json.loads(raw.decode("utf-8"))
        except Exception:
            out = {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}}
            stdout.write((json.dumps(out) + "\n").encode())
            stdout.flush()
            continue
        batch = msg if isinstance(msg, list) else [msg]
        replies = [r for r in (srv.handle(m) for m in batch) if r is not None]
        for r in replies:
            stdout.write((json.dumps(r, ensure_ascii=False) + "\n").encode("utf-8"))
        stdout.flush()
