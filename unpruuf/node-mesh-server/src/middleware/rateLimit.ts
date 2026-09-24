import { NextFunction, Request, Response } from "express";

/**
 * Global (not per-client) token-bucket limiter for GET /fetch and POST /fetchMany —
 * NODE_MESH_SPEC.md §8's "moderate rate limit as defense-in-depth" against someone bombarding
 * the read endpoints with guessed tags. Deliberately global rather than per-source-IP: this node
 * is only ever reached through its own Tor hidden service, where every connection arrives from
 * the local Tor process (127.0.0.1) — there is no real client IP to key a per-source limiter on.
 * A shared bucket still bounds total read-endpoint load regardless of who's generating it. Write
 * access (PUT /deposit) doesn't need this at all — it's owner-only (see ownerAuth.ts), so there's
 * no untrusted party who could flood it in the first place.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefillMs: number;

  constructor(private readonly capacity: number, private readonly refillPerSecond: number) {
    this.tokens = capacity;
    this.lastRefillMs = Date.now();
  }

  tryTake(): boolean {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefillMs) / 1000;
    if (elapsedSeconds > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillPerSecond);
      this.lastRefillMs = now;
    }
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

export function rateLimited(bucket: TokenBucket) {
  return (_req: Request, res: Response, next: NextFunction) => {
    if (!bucket.tryTake()) {
      return res.status(429).json({ error: "rate limit exceeded" });
    }
    next();
  };
}
