"""Command line: nexongraph build|update|query|explain|path|search|report|open|serve|mcp|install|uninstall."""
from __future__ import annotations

import argparse
import os
import sys
import webbrowser
from pathlib import Path

from . import __version__, config


def _out(dir_: str) -> Path:
    out = config.find_out_dir(Path(dir_))
    if not out:
        sys.exit(f"Für {Path(dir_).resolve()} gibt es noch keinen Graphen. Zuerst: nexongraph build \"{dir_}\"")
    return out


def _graph(dir_: str):
    from .query import load_graph
    return load_graph(_out(dir_) / "graph.json")


def main(argv: list[str] | None = None) -> None:
    if os.name == "nt":
        try:
            sys.stdout.reconfigure(encoding="utf-8")
            sys.stderr.reconfigure(encoding="utf-8")
        except Exception:
            pass
    ap = argparse.ArgumentParser(prog="nexongraph", description="Wissensgraph aus Code und Dokumenten.")
    ap.add_argument("--version", action="version", version=f"NexonGraph {__version__}")
    sub = ap.add_subparsers(dest="cmd")

    b = sub.add_parser("build", help="Graph für einen Ordner bauen (inkrementell)")
    b.add_argument("dir", nargs="?", default=".")
    b.add_argument("--semantic", action="store_true", help="semantischer Durchlauf über Dokumente mit dem eingestellten Modell")
    b.add_argument("--no-semantic", action="store_true", help="ohne Modell, nur lokale Analyse")
    b.add_argument("--out", help="Ausgabeordner (Standard: <Ordner>/nexongraph-out)")
    b.add_argument("--open", action="store_true", help="graph.html danach im Browser öffnen")
    sub.add_parser("update", help="wie build, nur Geändertes neu").add_argument("dir", nargs="?", default=".")

    for name, hlp in (("query", "Frage stellen, Teilgraph als Text"), ("search", "Knoten suchen"), ("explain", "einen Knoten erklären")):
        p = sub.add_parser(name, help=hlp)
        p.add_argument("text")
        p.add_argument("--dir", default=".")
        if name == "search":
            p.add_argument("--kind", default="", help="nur diese Arten, z. B. customer,offer")
    p = sub.add_parser("path", help="kürzester Weg zwischen zwei Knoten")
    p.add_argument("a")
    p.add_argument("b")
    p.add_argument("--dir", default=".")
    p = sub.add_parser("ask", help="Frage mit dem eingestellten Modell beantworten")
    p.add_argument("text")
    p.add_argument("--dir", default=".")
    sub.add_parser("report", help="REPORT.md ausgeben").add_argument("--dir", default=".")
    sub.add_parser("open", help="graph.html öffnen").add_argument("--dir", default=".")
    s = sub.add_parser("serve", help="Weboberfläche starten")
    s.add_argument("--port", type=int, default=0)
    s.add_argument("--no-browser", action="store_true")
    m = sub.add_parser("mcp", help="MCP-Server (stdio) für Claude, Cursor & Co.")
    m.add_argument("--dir", default=None)
    sub.add_parser("guard", help="Pflege-Wächter (Stop-Hook)").add_argument("dir", nargs="?", default=".")
    br = sub.add_parser("brief", help="Kurzlage der Wissensbasis")
    br.add_argument("dir", nargs="?", default=".")
    br.add_argument("--today", default=None)
    br.add_argument("--full", action="store_true")
    c = sub.add_parser("check", help="Wissenskarten prüfen (Exit 1 bei Fehlern)")
    c.add_argument("dir", nargs="?", default=".")
    c.add_argument("--today", default=None)
    sub.add_parser("install", help="in Claude Code, Claude Desktop und Cursor eintragen")
    sub.add_parser("uninstall", help="aus Claude Code, Claude Desktop und Cursor entfernen")
    w = sub.add_parser("watch", help="Ordner beobachten und bei Änderungen neu bauen")
    w.add_argument("dir", nargs="?", default=".")
    w.add_argument("--interval", type=float, default=5.0)

    a = ap.parse_args(argv)
    if a.cmd in (None, "serve"):
        from .server import serve
        serve(port=getattr(a, "port", 0) or None, open_browser=not getattr(a, "no_browser", False))
        return
    if a.cmd in ("build", "update"):
        from .pipeline import build
        sem = None
        if getattr(a, "semantic", False):
            sem = True
        if getattr(a, "no_semantic", False):
            sem = False
        last = [""]

        def prog(msg, frac):
            line = f"[{int(frac * 100):3d}%] {msg}"
            if line != last[0]:
                print(line[:150], flush=True)
                last[0] = line
        r = build(a.dir, semantic=sem, out_dir=Path(a.out) if getattr(a, "out", None) else None, progress=prog)
        print(f"\n{r['nodes']} Knoten, {r['edges']} Verbindungen, {r['communities']} Bereiche, {r['files']} Dateien "
              f"({r['reused']} aus dem Cache) in {r['seconds']} s")
        print(f"Ausgabe: {r['out']}")
        if getattr(a, "open", False):
            webbrowser.open(Path(r["out"], "graph.html").as_uri())
        return
    if a.cmd == "query":
        from .query import query_text
        print(query_text(_graph(a.dir), a.text))
    elif a.cmd == "search":
        from .query import Searcher
        G = _graph(a.dir)
        kinds = {k.strip() for k in a.kind.split(",") if k.strip()} or None
        for n, sc in Searcher(G).search(a.text, 20, kinds=kinds):
            d = G.nodes[n]
            print(f"{sc:6.1f}  {d.get('label', n)} [{d.get('kind')}] {d.get('source_file', '')}{':' + str(d['line']) if d.get('line') else ''}")
    elif a.cmd == "explain":
        from .query import explain_text
        print(explain_text(_graph(a.dir), a.text))
    elif a.cmd == "path":
        from .query import path_text
        print(path_text(_graph(a.dir), a.a, a.b))
    elif a.cmd == "ask":
        from .query import ask
        r = ask(_graph(a.dir), a.text, config.load().get("llm", {}))
        print(r["answer"] or "Kein Modell eingestellt. Hier der passende Teilgraph:\n\n" + r["context"])
    elif a.cmd == "report":
        print((_out(a.dir) / "REPORT.md").read_text(encoding="utf-8"))
    elif a.cmd == "open":
        webbrowser.open((_out(a.dir) / "graph.html").as_uri())
    elif a.cmd == "mcp":
        from .mcp import run
        run(a.dir)
    elif a.cmd == "guard":
        from .guard import guard_main
        sys.exit(guard_main(Path(a.dir)))
    elif a.cmd == "brief":
        import datetime as _dt
        from .brief import brief
        t = _dt.date.fromisoformat(a.today) if a.today else _dt.date.today()
        print(brief(Path(a.dir), t, max_lines=0 if a.full else 60))
    elif a.cmd == "check":
        from .check import run_cli
        code = run_cli(a.dir, a.today)
        if code:
            sys.exit(code)
    elif a.cmd == "install":
        from .integrate import install_all
        for line in install_all():
            print("- " + line)
    elif a.cmd == "uninstall":
        from .integrate import uninstall_all
        for line in uninstall_all():
            print("- " + line)
    elif a.cmd == "watch":
        from .watch import watch_forever
        watch_forever(a.dir, a.interval)


if __name__ == "__main__":
    main()
