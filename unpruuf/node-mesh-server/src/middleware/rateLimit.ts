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

/**
 * One token bucket per key (the node address a request came in through, i.e. its Host header).
 * Somebody who knows only one of a server's 250 onion addresses can then drain that node's bucket,
 * not the reads of the other 249. The number of keys is capped: beyond it (or without a Host
 * header) requests share one overflow bucket, so memory cannot be grown by sending random hosts.
 */
export class KeyedTokenBuckets {
  private readonly buckets = new Map<string, TokenBucket>();
  private readonly overflow: TokenBucket;

  constructor(private readonly capacity: number, private readonly refillPerSecond: number, private readonly maxKeys = 512) {
    this.overflow = new TokenBucket(capacity, refillPerSecond);
  }

  tryTake(key: string | undefined): boolean {
    if (!key) return this.overflow.tryTake();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= this.maxKeys) return this.overflow.tryTake();
      bucket = new TokenBucket(this.capacity, this.refillPerSecond);
      this.buckets.set(key, bucket);
    }
    return bucket.tryTake();
  }
}

export function rateLimitedPerHost(buckets: KeyedTokenBuckets) {
  return (req: Request, res: Response, next: NextFunction) => {
    const host = req.headers.host?.toLowerCase().slice(0, 100);
    if (!buckets.tryTake(host)) {
      return res.status(429).json({ error: "rate limit exceeded" });
    }
    next();
  };
}

export function rateLimited(bucket: TokenBucket) {
  return (_req: Request, res: Response, next: NextFunction) => {
    if (!bucket.tryTake()) {
      return res.status(429).json({ error: "rate limit exceeded" });
    }
    next();
  };
}
