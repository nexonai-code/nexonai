import express, { Express } from "express";
import { TokenBucket, rateLimited } from "../middleware/rateLimit";
import { FeedStore } from "./feedStore";

/**
 * What the feed's onion service serves — exactly one thing: the current list file. It is already
 * encrypted and signed, so this endpoint holds no secret and needs no login: whoever finds the
 * address sees nothing they can read, and nobody can make the service say something false.
 * Bound to 127.0.0.1 and reachable only through the (rotating) onion address.
 */
export function createFeedApp(store: FeedStore, onServed?: () => void): Express {
  const app = express();
  app.disable("x-powered-by");
  const bucket = new TokenBucket(20, 2);
  app.get("/list", rateLimited(bucket), (_req, res) => {
    const blob = store.current();
    if (!blob) return res.status(404).type("text/plain").send("no list published yet\n");
    onServed?.();
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).type("text/plain").send(blob);
  });
  return app;
}
