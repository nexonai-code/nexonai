import * as crypto from "crypto";
import { NextFunction, Request, Response } from "express";

/**
 * Requires `Authorization: Bearer <authToken>` on every request. Without this, anyone who
 * learns a relay's address could push/pull blobs for any wire tag — the tag itself is not a
 * secret (it's a rotating identifier, not a credential). The token is generated once per relay
 * instance (see identity.ts) and handed to the app out-of-band (QR/copy-paste, see
 * windows-start.ts), so only clients that were actually paired with this relay can use it.
 */
export function requireAuth(authToken: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.header("authorization") ?? "";
    const expected = `Bearer ${authToken}`;
    if (!timingSafeEqual(header, expected)) {
      return res.status(401).json({ error: "unauthorized" });
    }
    next();
  };
}

// Plain !== on attacker-controlled input leaks timing info about how many leading characters
// matched. Compare fixed-length hashes instead of the raw strings so a mismatch always takes
// the same time regardless of where the first differing byte is.
function timingSafeEqual(a: string, b: string): boolean {
  const bufA = crypto.createHash("sha256").update(a).digest();
  const bufB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(bufA, bufB);
}
