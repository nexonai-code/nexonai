import express, { Express } from "express";
import { NodeStore } from "./store/nodeStore";
import { LockControl, nodeRouter } from "./routes/node";
import { OwnerSecretSource } from "./middleware/ownerAuth";
import { Metrics } from "./metrics";

export function createApp(
  store: NodeStore,
  ownerSecret: OwnerSecretSource,
  addresses: () => string[] = () => [],
  lock?: LockControl,
  metrics?: Metrics,
): Express {
  const app = express();
  // 16kb comfortably covers a base64'd 4096-byte ciphertext (~5.5kb) plus JSON/tag overhead,
  // same reasoning as the consumer relay's own app.ts.
  app.use(express.json({ limit: "16kb" }));
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
  app.use(nodeRouter(store, ownerSecret, addresses, lock));
  return app;
}
