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
 * One token bucket per node address the server really serves. The key comes from the Host header,
 * which the caller sets, so only hosts the server itself knows ([isKnown]) get a bucket of their
 * own: somebody who knows one of the 250 addresses can drain that node's bucket and nothing else.
 * Every other Host value (invented names, none at all) shares ONE bucket, so spraying made-up
 * names can neither multiply the allowance nor push the real nodes into a shared overflow.
 * The number of buckets is bounded by the number of known hosts.
 */
export class KeyedTokenBuckets {
  private readonly buckets = new Map<string, TokenBucket>();
  private readonly unknown: TokenBucket;

  constructor(private readonly capacity: number, private readonly refillPerSecond: number) {
    this.unknown = new TokenBucket(capacity, refillPerSecond);
  }

  tryTake(key: string | undefined, known: boolean): boolean {
    if (!key || !known) return this.unknown.tryTake();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new TokenBucket(this.capacity, this.refillPerSecond);
      this.buckets.set(key, bucket);
    }
    return bucket.tryTake();
  }
}

/** "abc.onion:80" -> "abc.onion", lower case, at most 100 characters. */
export function hostName(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const h = header.toLowerCase().slice(0, 100);
  if (h.startsWith("[")) return h.slice(0, h.indexOf("]") + 1) || undefined;
  return h.split(":")[0] || undefined;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** [knownHosts] returns the addresses this server serves (its onion hostnames). */
export function rateLimitedPerHost(buckets: KeyedTokenBuckets, knownHosts: () => string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const host = hostName(req.headers.host);
    const known = host !== undefined && (LOOPBACK_HOSTS.has(host) || knownHosts().some((a) => a.toLowerCase() === host));
    if (!buckets.tryTake(host, known)) {
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
