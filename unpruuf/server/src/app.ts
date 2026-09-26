import express, { Express } from "express";
import { BlobStore } from "./store/blobStore";
import { relayRouter } from "./routes/relay";

export function createApp(store: BlobStore, authToken: string): Express {
  const app = express();
  // Permissive CORS: the web-based reporter (unpruuf/web-reporter/) calls this relay directly
  // from a browser, from whatever origin it's hosted on — cross-origin by construction, since
  // "any browser, no install" was the requirement (see COMPLIANCE.md/officer-app's README for
  // why this relay has no cookie/session auth to protect in the first place — every request is
  // authenticated by the bearer token alone, which CORS doesn't weaken: a page on another origin
  // still needs the real token to do anything, exactly as it would need it from curl). Safe to
  // enable unconditionally rather than gating it behind an env var.
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  // 16kb comfortably covers a base64'd 4096-byte packet (~5.5kb) plus JSON/tag overhead,
  // while capping how much a caller can make the server parse per request before auth even runs.
  app.use(express.json({ limit: "16kb" }));
  // /health is intentionally unauthenticated — a container/process health check shouldn't need
  // the token, and it reveals nothing (no tags, no blobs, no auth-guessing surface).
  app.get("/health", (_req, res) => res.status(200).json({ ok: true }));
  app.use(relayRouter(store, authToken));
  return app;
}
