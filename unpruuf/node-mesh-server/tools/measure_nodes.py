"""Measures RAM and idle CPU of N nodes in one server process vs. separate processes.
Run on the target VPS after `npm run build` (Linux). Prints one JSON line per case."""
import os, subprocess, time, shutil, json, sys, re
BASE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(BASE, "measure-runs")
TOR = os.environ.get("TOR_EXE_PATH") or os.path.join(BASE, "..", "tor-bin", "tor")
ENTRY = os.path.join(BASE, "..", "dist", "index.js")
TICK = os.sysconf("SC_CLK_TCK")

def rss_kb(pid):
    try:
        for line in open(f"/proc/{pid}/status"):
            if line.startswith("VmRSS:"): return int(line.split()[1])
    except FileNotFoundError: return 0
    return 0

def cpu_ticks(pid):
    try:
        f = open(f"/proc/{pid}/stat").read().rsplit(")", 1)[1].split()
        return int(f[11]) + int(f[12])
    except FileNotFoundError: return 0

def children(pid):
    out = subprocess.run(["pgrep", "-P", str(pid)], capture_output=True, text=True).stdout.split()
    return [int(x) for x in out]

def start(n, idx, port):
    d = os.path.join(WORK, f"run-{n}-{idx}")
    shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
    env = dict(os.environ, TOR_EXE_PATH=TOR, LD_LIBRARY_PATH=os.path.dirname(TOR), NODE_MESH_DATA_DIR=os.path.join(d, "data"),
               NODE_MESH_NODES=str(n), PORT=str(port), ADMIN_PORT=str(port + 1))
    log = open(os.path.join(d, "log.txt"), "w")
    p = subprocess.Popen(["node", ENTRY], env=env, stdout=log, stderr=subprocess.STDOUT, cwd=d)
    return p, os.path.join(d, "log.txt")

def wait_registered(logs, timeout):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if all(re.search(r"onion address", open(l).read()) for l in logs): return time.time() - t0
        time.sleep(0.5)
    return None

def run(n_per_proc, procs):
    started = [start(n_per_proc, i, 9300 + i * 2) for i in range(procs)]
    t = wait_registered([l for _, l in started], 600)
    time.sleep(20)
    pids = []
    for p, _ in started:
        pids.append(p.pid); pids += children(p.pid)
    c0 = sum(cpu_ticks(x) for x in pids); time.sleep(10); c1 = sum(cpu_ticks(x) for x in pids)
    node_rss = sum(rss_kb(p.pid) for p, _ in started)
    tor_rss = sum(rss_kb(c) for p, _ in started for c in children(p.pid))
    for p, _ in started: p.terminate()
    for p, _ in started:
        try: p.wait(15)
        except subprocess.TimeoutExpired: p.kill()
    time.sleep(2)
    return {"nodes": n_per_proc * procs, "processes": procs, "register_s": None if t is None else round(t, 1),
            "node_mb": round(node_rss / 1024, 1), "tor_mb": round(tor_rss / 1024, 1),
            "total_mb": round((node_rss + tor_rss) / 1024, 1), "cpu_pct_idle": round((c1 - c0) / TICK / 10 * 100, 2)}

cases = [(1, 1), (10, 1), (50, 1), (100, 1), (250, 1), (500, 1), (1, 10)]
results = []
for n, procs in cases:
    r = run(n, procs); results.append(r); print(json.dumps(r), flush=True)
os.makedirs(WORK, exist_ok=True)
json.dump(results, open(os.path.join(WORK, "results.json"), "w"), indent=1)
