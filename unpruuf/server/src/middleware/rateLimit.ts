import { NextFunction, Request, Response } from "express";

/** Token bucket: [capacity] requests at once, refilled at [refillPerSecond]. Same shape as the
 *  node-mesh-server's, kept here so the relay has no dependency on it. */
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

/** 429 once the bucket is empty. One shared token means one bucket per route is the right grain. */
export function rateLimited(bucket: TokenBucket) {
  return (_req: Request, res: Response, next: NextFunction) => {
    if (!bucket.tryTake()) return res.status(429).json({ error: "rate limit exceeded" });
    next();
  };
}
