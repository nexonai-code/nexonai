import * as crypto from "crypto";
import { NextFunction, Request, Response } from "express";

/**
 * Requires `Authorization: Bearer <ownerSecret>` — applied ONLY to PUT /deposit
 * (NODE_MESH_SPEC.md §8). Unlike the consumer relay's bearer token (shared with every paired
 * contact), this secret never leaves the owner's own devices, so this middleware effectively
 * asks one question: "is this the owner's own app writing to its own node?" — never "is this a
 * known contact?", because contacts never get write access to this node at all.
 */
export function requireOwner(ownerSecret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.header("authorization") ?? "";
    const expected = `Bearer ${ownerSecret}`;
    if (!timingSafeEqual(header, expected)) {
      return res.status(401).json({ error: "unauthorized" });
    }
    next();
  };
}

// Same timing-safe comparison approach as the consumer relay's middleware/auth.ts — compare
// fixed-length digests, not the raw strings, so a mismatch always takes the same time regardless
// of where the first differing byte is.
function timingSafeEqual(a: string, b: string): boolean {
  const bufA = crypto.createHash("sha256").update(a).digest();
  const bufB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(bufA, bufB);
}
