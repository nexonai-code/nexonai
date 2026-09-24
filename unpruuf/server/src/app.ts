import express, { Express } from "express";
import { BlobStore } from "./store/blobStore";
import { relayRouter } from "./routes/relay";

export function createApp(store: BlobStore, authToken: string): Express {
  const app = express();
  // 16kb comfortably covers a base64'd 4096-byte packet (~5.5kb) plus JSON/tag overhead,
  // while capping how much a caller can make the server parse per request before auth even runs.
  app.use(express.json({ limit: "16kb" }));
  // /health is intentionally unauthenticated — a container/process health check shouldn't need
  // the token, and it reveals nothing (no tags, no blobs, no auth-guessing surface).
  app.get("/health", (_req, res) => res.status(200).json({ ok: true }));
  app.use(relayRouter(store, authToken));
  return app;
}
