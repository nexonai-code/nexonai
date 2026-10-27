"""Local web app (http://127.0.0.1:<port>): projects, build with progress, graph, report, questions, settings.

Binds to 127.0.0.1 only. Every API call needs the session token that is written into the page,
so other websites in the same browser cannot use the API.
"""
from __future__ import annotations

import json
import mimetypes
import os
import secrets
import subprocess
import sys
import threading
import time
import traceback
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib import resources
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from . import __version__, config, llm
from .export import render_viewer
from .extract_treesitter import treesitter_available

TOKEN = secrets.token_urlsafe(24)
STATIC = resources.files("nexongraph").joinpath("static")


class Job:
    def __init__(self):
        self.lock = threading.Lock()
        self.thread: threading.Thread | None = None
        self.state = {"running": False}
        self.cancel = False

    def snapshot(self) -> dict:
        with self.lock:
            return dict(self.state, log=list(self.state.get("log", []))[-80:])

    def start(self, root: str, semantic: bool) -> bool:
        with self.lock:
            if self.state.get("running"):
                return False
            self.cancel = False
            self.state = {"running": True, "root": root, "msg": "Start …", "frac": 0.0, "log": [], "started": time.time()}
        self.thread = threading.Thread(target=self._run, args=(root, semantic), daemon=True)
        self.thread.start()
        return True

    def _progress(self, msg: str, frac: float):
        with self.lock:
            self.state["msg"] = msg
            self.state["frac"] = frac
            log = self.state.setdefault("log", [])
            if not log or log[-1] != msg:
                log.append(msg)
                del log[:-300]

    def _run(self, root: str, semantic: bool):
        from .pipeline import Cancelled, build
        try:
            r = build(root, semantic=semantic, progress=self._progress, should_stop=lambda: self.cancel)
            with self.lock:
                self.state.update(running=False, result=r, msg="Fertig.", frac=1.0)
        except Cancelled:
            with self.lock:
                self.state.update(running=False, error="Abgebrochen.", msg="Abgebrochen.")
        except Exception as err:
            traceback.print_exc()
            with self.lock:
                self.state.update(running=False, error=str(err), msg=f"Fehler: {err}")


JOB = Job()
WATCHERS: dict[str, threading.Event] = {}
GRAPHS: dict[str, tuple[float, object]] = {}


def _graph(root: str):
    from .query import load_graph
    out = config.find_out_dir(Path(root))
    if not out:
        raise FileNotFoundError("Für diesen Ordner gibt es noch keinen Graphen.")
    gp = out / "graph.json"
    m = gp.stat().st_mtime
    if root not in GRAPHS or GRAPHS[root][0] != m:
        GRAPHS[root] = (m, load_graph(gp))
    return GRAPHS[root][1], out


def _viewer_html(root: str) -> str:
    from .export import viewer_payload
    G, out = _graph(root)
    labels = {int(k): v for k, v in G.graph.get("community_labels", {}).items()}
    meta = {"name": G.graph.get("name", Path(root).name), "built": G.graph.get("built", ""), "root": root,
            "nodes": G.number_of_nodes(), "edges": G.number_of_edges(), "lang": config.load().get("lang", "de")}
    return render_viewer(viewer_payload(G, labels, meta), embedded=True)


def _open_path(p: Path):
    if os.name == "nt":
        os.startfile(str(p))  # noqa: S606 - opens Explorer or the default app
    elif sys.platform == "darwin":
        subprocess.Popen(["open", str(p)])
    else:
        subprocess.Popen(["xdg-open", str(p)])


def _pick_folder() -> str | None:
    """Native folder dialog (tkinter). Runs in its own thread with its own Tk root."""
    result: list[str | None] = [None]

    def run():
        try:
            import tkinter as tk
            from tkinter import filedialog
            r = tk.Tk()
            r.withdraw()
            try:
                r.attributes("-topmost", True)
            except Exception:
                pass
            result[0] = filedialog.askdirectory(title="Ordner für NexonGraph wählen", mustexist=True) or None
            r.destroy()
        except Exception:
            result[0] = None
    t = threading.Thread(target=run)
    t.start()
    t.join(600)
    return result[0]


def _watch_loop(root: str, stop: threading.Event):
    from .watch import changed, fingerprint
    fp = fingerprint(Path(root))
    while not stop.wait(5):
        try:
            new = fingerprint(Path(root))
        except Exception:
            continue
        if changed(fp, new) and not JOB.snapshot().get("running"):
            time.sleep(1.5)
            JOB.start(root, bool(config.load().get("semantic")))
            fp = fingerprint(Path(root))


class Handler(BaseHTTPRequestHandler):
    server_version = f"NexonGraph/{__version__}"

    def log_message(self, fmt, *args):  # quiet console
        if os.environ.get("NEXONGRAPH_DEBUG"):
            super().log_message(fmt, *args)

    # helpers
    def _host_ok(self) -> bool:
        host = (self.headers.get("Host") or "").split(":")[0]
        return host in ("127.0.0.1", "localhost", "[::1]")

    def _send(self, code: int, body: bytes, ctype: str, extra: dict | None = None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj, code: int = 200):
        self._send(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def _body(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        if n > 5_000_000:
            raise ValueError("zu groß")
        raw = self.rfile.read(n) if n else b"{}"
        return json.loads(raw.decode("utf-8") or "{}")

    def _authed(self, qs: dict) -> bool:
        tok = self.headers.get("X-NG-Token") or (qs.get("t") or [""])[0]
        return secrets.compare_digest(tok, TOKEN)

    # routes
    def do_GET(self):
        if not self._host_ok():
            return self._send(403, b"forbidden", "text/plain")
        u = urlparse(self.path)
        qs = parse_qs(u.query)
        try:
            if u.path in ("/", "/index.html"):
                html = STATIC.joinpath("app.html").read_text(encoding="utf-8").replace("__TOKEN__", TOKEN).replace("__VERSION__", __version__)
                return self._send(200, html.encode("utf-8"), "text/html; charset=utf-8")
            if u.path.startswith("/static/"):
                name = u.path[len("/static/"):]
                if "/" in name or "\\" in name or name.startswith("."):
                    return self._send(404, b"not found", "text/plain")
                f = STATIC.joinpath(name)
                if not f.is_file():
                    return self._send(404, b"not found", "text/plain")
                ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
                if name.endswith(".webp"):
                    ctype = "image/webp"
                if name.endswith(".woff2"):
                    ctype = "font/woff2"
                return self._send(200, f.read_bytes(), ctype, {"Cache-Control": "max-age=3600"})
            if not self._authed(qs):
                return self._json({"error": "token"}, 403)
            if u.path == "/viewer":
                return self._send(200, _viewer_html(qs["root"][0]).encode("utf-8"), "text/html; charset=utf-8")
            if u.path == "/api/state":
                cfg = config.load()
                projects = []
                for p in cfg.get("projects", []):
                    p = dict(p)
                    p["exists"] = Path(p["root"]).is_dir() and (Path(p["out"]) / "graph.json").exists()
                    p["watching"] = p["root"] in WATCHERS
                    projects.append(p)
                return self._json({"config": config.public(cfg), "projects": projects, "job": JOB.snapshot(),
                                   "providers": llm.PROVIDERS, "treesitter": treesitter_available(),
                                   "version": __version__, "local": llm.is_local(cfg.get("llm", {}))})
            if u.path == "/api/job":
                return self._json(JOB.snapshot())
            if u.path == "/api/report":
                _, out = _graph(qs["root"][0])
                return self._json({"markdown": (out / "REPORT.md").read_text(encoding="utf-8")})
            return self._send(404, b"not found", "text/plain")
        except FileNotFoundError as err:
            return self._json({"error": str(err)}, 404)
        except Exception as err:
            traceback.print_exc()
            return self._json({"error": str(err)}, 500)

    def do_POST(self):
        if not self._host_ok():
            return self._send(403, b"forbidden", "text/plain")
        u = urlparse(self.path)
        if not self._authed({}):
            return self._json({"error": "token"}, 403)
        try:
            b = self._body()
            p = u.path
            if p == "/api/pick":
                return self._json({"path": _pick_folder()})
            if p == "/api/build":
                root = str(Path(b.get("root", "")).expanduser())
                if not Path(root).is_dir():
                    return self._json({"error": f"Ordner nicht gefunden: {root}"}, 400)
                sem = bool(b.get("semantic")) and llm.enabled(config.load().get("llm", {}))
                ok = JOB.start(str(Path(root).resolve()), sem)
                return self._json({"started": ok, "job": JOB.snapshot()})
            if p == "/api/cancel":
                JOB.cancel = True
                return self._json({"ok": True})
            if p == "/api/settings":
                cfg = config.load()
                for k in ("lang", "out_mode", "semantic"):
                    if k in b:
                        cfg[k] = b[k]
                if "llm" in b:
                    l_in = b["llm"]
                    cur = cfg.setdefault("llm", {})
                    for k in ("provider", "model", "base_url"):
                        if k in l_in:
                            cur[k] = str(l_in[k] or "").strip()
                    key = l_in.get("api_key")
                    if key is not None and not str(key).startswith("••"):
                        cur["api_key"] = str(key).strip()
                config.save(cfg)
                return self._json({"config": config.public(cfg), "local": llm.is_local(cfg.get("llm", {}))})
            if p == "/api/test-llm":
                try:
                    return self._json({"ok": True, "answer": llm.test_connection(config.load().get("llm", {}))})
                except Exception as err:
                    return self._json({"ok": False, "error": str(err)})
            if p in ("/api/search", "/api/explain", "/api/path", "/api/query", "/api/ask"):
                from . import query as Q
                G, _ = _graph(b["root"])
                if p == "/api/search":
                    rows = []
                    for n, sc in Q.Searcher(G).search(b.get("text", ""), 30):
                        d = G.nodes[n]
                        rows.append({"id": n, "label": d.get("label", n), "kind": d.get("kind"), "file": d.get("source_file", ""),
                                     "line": d.get("line"), "score": round(sc, 2),
                                     "info": d.get("doc") or d.get("description") or (d.get("text") or "")[:200]})
                    return self._json({"results": rows})
                if p == "/api/explain":
                    r = Q.explain(G, b.get("name", ""))
                    return self._json(r or {"error": "Nichts gefunden."})
                if p == "/api/path":
                    r = Q.path(G, b.get("a", ""), b.get("b", ""))
                    if r is None:
                        return self._json({"error": "Mindestens einer der Namen wurde nicht gefunden."})
                    r["labels"] = {n: G.nodes[n].get("label", n) for n in r["path"]} if r["path"] else {
                        r["from"]: G.nodes[r["from"]].get("label"), r["to"]: G.nodes[r["to"]].get("label")}
                    return self._json(r)
                if p == "/api/query":
                    return self._json({"text": Q.query_text(G, b.get("text", ""))})
                if p == "/api/ask":
                    try:
                        return self._json(Q.ask(G, b.get("text", ""), config.load().get("llm", {})))
                    except llm.LLMError as err:
                        return self._json({"error": str(err)})
            if p == "/api/open":
                root = Path(b["root"])
                out = config.find_out_dir(root) or root
                what = b.get("what", "folder")
                target = {"folder": root, "out": out, "html": out / "graph.html", "report": out / "REPORT.md"}.get(what, root)
                _open_path(target)
                return self._json({"ok": True})
            if p == "/api/forget":
                config.forget_project(b["root"])
                ev = WATCHERS.pop(b["root"], None)
                if ev:
                    ev.set()
                return self._json({"ok": True})
            if p == "/api/watch":
                root = b["root"]
                if b.get("on"):
                    if root not in WATCHERS:
                        ev = threading.Event()
                        WATCHERS[root] = ev
                        threading.Thread(target=_watch_loop, args=(root, ev), daemon=True).start()
                else:
                    ev = WATCHERS.pop(root, None)
                    if ev:
                        ev.set()
                return self._json({"watching": root in WATCHERS})
            if p == "/api/integrate":
                from .integrate import install_all, uninstall_all
                return self._json({"messages": uninstall_all() if b.get("remove") else install_all()})
            if p == "/api/quit":
                threading.Thread(target=lambda: (time.sleep(0.3), os._exit(0)), daemon=True).start()
                return self._json({"ok": True})
            return self._send(404, b"not found", "text/plain")
        except FileNotFoundError as err:
            return self._json({"error": str(err)}, 404)
        except Exception as err:
            traceback.print_exc()
            return self._json({"error": str(err)}, 500)


def serve(port: int | None = None, open_browser: bool = True) -> None:
    cfg = config.load()
    port = port or int(cfg.get("port", 8765))
    httpd = None
    for p in [port] + list(range(port + 1, port + 20)):
        try:
            httpd = ThreadingHTTPServer(("127.0.0.1", p), Handler)
            port = p
            break
        except OSError:
            continue
    if httpd is None:
        sys.exit("Kein freier Port gefunden.")
    url = f"http://127.0.0.1:{port}/"
    print(f"NexonGraph {__version__} läuft auf {url}")
    print("Dieses Fenster offen lassen. Beenden mit Strg+C oder über die Oberfläche.")
    if open_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
