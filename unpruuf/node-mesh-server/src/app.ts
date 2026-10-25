import express, { Express, NextFunction, Request, Response } from "express";
import { NodeStore } from "./store/nodeStore";
import { LockControl, nodeRouter } from "./routes/node";
import { OwnerSecretSource } from "./middleware/ownerAuth";
import { Metrics } from "./metrics";
import { GuestOptions } from "./middleware/depositAuth";
import { GuestQuota } from "./guest/guestQuota";
import { GUEST_MAX_BYTES_PER_HOUR, GUEST_MAX_DEPOSITS_PER_HOUR, GUEST_MAX_VALIDITY_MS } from "./config";

export function createApp(
  store: NodeStore,
  ownerSecret: OwnerSecretSource,
  addresses: () => string[] = () => [],
  lock?: LockControl,
  metrics?: Metrics,
  /** Server license: a reason code refuses new deposits (HTTP 402). Reading is never blocked. */
  depositBlocked?: () => string | null,
  /** Guest grants (guest/): off unless enabled, see config.ts. */
  guest: GuestOptions = { enabled: false, maxValidityMs: GUEST_MAX_VALIDITY_MS },
): Express {
  const app = express();
  // Do not announce the web framework to anyone who asks.
  app.disable("x-powered-by");
  // Nothing that identifies the framework: no ETag, exact paths, and no answer to HEAD or OPTIONS.
  app.set("etag", false);
  app.set("case sensitive routing", true);
  app.set("strict routing", true);
  app.use((req, res, next) => {
    if (req.method === "HEAD" || req.method === "OPTIONS") return res.status(404).json({ error: "not found" });
    next();
  });
  // 16kb comfortably covers a base64'd 4096-byte ciphertext (~5.5kb) plus JSON/tag overhead,
  // same reasoning as the consumer relay's own app.ts.
  app.use(express.json({ limit: "16kb" }));
  if (depositBlocked) {
    app.use((req, res, next) => {
      if (req.method === "PUT" && req.path === "/deposit") {
        const reason = depositBlocked();
        if (reason) return res.status(402).json({ error: reason });
      }
      next();
    });
  }
  // Counts only (see metrics.ts): a finished deposit / fetch, or a refused request.
  if (metrics) {
    app.use((req, res, next) => {
      res.on("finish", () => {
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        if (req.method === "PUT" && req.path === "/deposit") metrics.record(ok ? "deposit" : "rejected");
        else if (ok && (req.path === "/fetch" || req.path === "/fetchMany")) metrics.record("fetch");
        else if (!ok && req.path !== "/health" && res.statusCode >= 400) metrics.record("rejected");
      });
      next();
    });
  }
  // /health is intentionally unauthenticated — a container/process health check shouldn't need
  // the owner secret, and it reveals nothing (no tags, no blobs, no auth-guessing surface).
  app.get("/health", (_req, res) => res.status(200).json({ ok: true }));
  app.use(nodeRouter(store, ownerSecret, addresses, lock, guest, new GuestQuota(GUEST_MAX_DEPOSITS_PER_HOUR, GUEST_MAX_BYTES_PER_HOUR)));
  // Everything else: the same short answer for every method and path (Express's own page names it).
  app.use((_req, res) => res.status(404).json({ error: "not found" }));
  // Anything that goes wrong before or inside a route (broken JSON, a body over the limit) gets a
  // short JSON error and nothing else — Express's default handler would send a stack trace with
  // the framework's and the program's file paths to any caller.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 500;
    const code = status >= 400 && status < 500 ? status : 500;
    res.status(code).json({ error: code === 413 ? "request too large" : code === 400 ? "bad request" : code === 500 ? "internal error" : "request refused" });
  });
  return app;
}
