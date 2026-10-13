import * as crypto from "crypto";

export type JobState = "running" | "done" | "failed";

export interface Job {
  id: string;
  title: string;
  state: JobState;
  lines: string[];
  error: string | null;
  /** Data the page needs when it is over (for example the new server's id). */
  result: Record<string, unknown> | null;
  startedAt: number;
  endedAt: number | null;
}

const MAX_LINES = 4000;

export class Jobs {
  private readonly jobs = new Map<string, Job>();

  start(title: string, run: (log: (line: string) => void, setResult: (r: Record<string, unknown>) => void) => Promise<void>): Job {
    const job: Job = { id: crypto.randomBytes(8).toString("hex"), title, state: "running", lines: [], error: null, result: null, startedAt: Date.now(), endedAt: null };
    this.jobs.set(job.id, job);
    const log = (line: string) => {
      for (const l of line.split(/\r?\n/)) if (l.trim() !== "") job.lines.push(l.slice(0, 400));
      if (job.lines.length > MAX_LINES) job.lines.splice(0, job.lines.length - MAX_LINES);
    };
    run(log, (r) => { job.result = r; })
      .then(() => { job.state = "done"; job.endedAt = Date.now(); })
      .catch((e: Error) => { job.state = "failed"; job.error = String(e.message || e); job.endedAt = Date.now(); log("✗ " + job.error); });
    return job;
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  hasRunning(): boolean {
    return [...this.jobs.values()].some((j) => j.state === "running");
  }

  /** Forget old finished jobs. */
  prune(maxAgeMs = 60 * 60 * 1000): void {
    const cut = Date.now() - maxAgeMs;
    for (const [id, j] of this.jobs) if (j.endedAt && j.endedAt < cut) this.jobs.delete(id);
  }
}
