import express, { Express } from "express";
import { NodeStore } from "./store/nodeStore";
import { nodeRouter } from "./routes/node";
import { GuestOptions } from "./middleware/depositAuth";
import { GuestQuota } from "./guest/guestQuota";
import { GUEST_MAX_BYTES_PER_HOUR, GUEST_MAX_DEPOSITS_PER_HOUR, GUEST_MAX_VALIDITY_MS } from "./config";

export function createApp(
  store: NodeStore,
  ownerSecret: string,
  guest: GuestOptions = { enabled: false, maxValidityMs: GUEST_MAX_VALIDITY_MS }
): Express {
  const app = express();
  // 16kb comfortably covers a base64'd 4096-byte ciphertext (~5.5kb) plus JSON/tag overhead,
  // same reasoning as the consumer relay's own app.ts.
  app.use(express.json({ limit: "16kb" }));
  // /health is intentionally unauthenticated — a container/process health check shouldn't need
  // the owner secret, and it reveals nothing (no tags, no blobs, no auth-guessing surface).
  app.get("/health", (_req, res) => res.status(200).json({ ok: true }));
  app.use(nodeRouter(store, ownerSecret, guest, new GuestQuota(GUEST_MAX_DEPOSITS_PER_HOUR, GUEST_MAX_BYTES_PER_HOUR)));
  return app;
}
