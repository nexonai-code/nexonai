import * as crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import { deriveGuestKey, GuestGrant, verifyGuestGrant } from "../guest/guestGrant";
import { decodeScope, scopeAllows } from "../guest/guestScope";

export interface GuestOptions {
  /** Master switch. Off by default: without it a `Guest` credential is refused like any other
   *  wrong credential. */
  enabled: boolean;
  /** Longest validity this node accepts for a grant (operator cap). */
  maxValidityMs: number;
  /** Multi-slot servers set this: an empty scope then fails closed (no slots granted). A
   *  single-node server leaves it off, so an empty scope means "this node". */
  requireScope?: boolean;
  /** Multi-slot servers supply the mapping from a deposit to the (virtual node, slot) it lands
   *  in. If set, the grant's scope must cover that pair, otherwise the deposit is refused (403).
   *  Called after the body is validated, see routes/node.ts. */
  resolveTarget?: (body: unknown) => { node: number; slot: number } | null;
}

declare module "express-serve-static-core" {
  interface Request {
    guestGrant?: GuestGrant;
  }
}

/**
 * PUT /deposit accepts exactly two credentials and nothing else:
 *   - `Authorization: Bearer <ownerSecret>` (the owner's own app, as before)
 *   - `Authorization: Guest <grant>.<mac>` (only if guests are enabled)
 * Any other header, a forged or expired grant, or a guest grant while guests are off gets 401.
 * Applied to /deposit only; every other route keeps its own rules, so a guest can never reach
 * anything the owner-only routes protect.
 */
export function requireOwnerOrGuest(ownerSecret: string, guest: GuestOptions) {
  const guestKey = guest.enabled ? deriveGuestKey(ownerSecret) : null;
  const expectedOwner = `Bearer ${ownerSecret}`;
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.header("authorization") ?? "";
    if (header.startsWith("Guest ")) {
      if (!guestKey) return res.status(401).json({ error: "unauthorized" });
      const result = verifyGuestGrant(header.slice("Guest ".length), guestKey, Date.now(), guest.maxValidityMs);
      if (!result.ok) return res.status(401).json({ error: "unauthorized" });
      const entries = decodeScope(result.grant.scope);
      if (entries === null) return res.status(401).json({ error: "unauthorized" });
      if (guest.requireScope && entries.length === 0) return res.status(401).json({ error: "unauthorized" });
      if (guest.resolveTarget && entries.length > 0) {
        const target = guest.resolveTarget(req.body);
        if (!target || !scopeAllows(entries, target.node, target.slot)) return res.status(403).json({ error: "outside grant scope" });
      }
      req.guestGrant = result.grant;
      return next();
    }
    if (!timingSafeEqual(header, expectedOwner)) return res.status(401).json({ error: "unauthorized" });
    next();
  };
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = crypto.createHash("sha256").update(a).digest();
  const bufB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(bufA, bufB);
}
