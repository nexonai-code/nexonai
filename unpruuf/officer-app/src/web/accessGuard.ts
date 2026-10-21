import * as crypto from "node:crypto";
import { NextFunction, Request, Response } from "express";

/**
 * Access rules for the officer dashboard (security test finding OFF-1). The dashboard shows and
 * deletes every report, so it must not answer anyone but the person at this computer:
 *
 *  1. It listens on the loopback address only (see index.ts), unless the operator chooses
 *     otherwise AND sets a dashboard password.
 *  2. Host check: the request's Host must be one of the allowed names. A web page that points a
 *     foreign name at 127.0.0.1 (DNS rebinding) is refused, and so is any request addressed to the
 *     computer's LAN address while only loopback is allowed.
 *  3. Cross-site check: every request that changes something must carry the header the dashboard's
 *     own page sends, and an Origin (if the browser sends one) must match the Host. Another web
 *     page cannot add that header without a CORS preflight, and no CORS answer is ever given.
 *  4. Optional password (HTTP Basic), compared in constant time, required when the dashboard is
 *     reachable from the network.
 */
export const UI_HEADER = "x-officer-ui";

export interface AccessOptions {
  /** Host names (without port) this dashboard answers to. Default: localhost, 127.0.0.1, ::1. */
  allowedHosts: string[];
  /** If set, every request must present it (HTTP Basic, any user name). */
  password?: string;
}

export const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "::1"];

export function defaultAccess(): AccessOptions {
  return { allowedHosts: LOOPBACK_HOSTS };
}

/** Host header → bare host name, lower-case, without port and without IPv6 brackets. */
export function hostName(hostHeader: string | undefined): string | null {
  if (!hostHeader) return null;
  const h = hostHeader.trim().toLowerCase();
  if (h.startsWith("[")) {
    const end = h.indexOf("]");
    return end > 0 ? h.slice(1, end) : null;
  }
  const colon = h.lastIndexOf(":");
  return colon === -1 ? h : h.slice(0, colon);
}

export function accessGuard(opts: AccessOptions) {
  const allowed = new Set(opts.allowedHosts.map((h) => h.toLowerCase()));
  const expectedAuth = opts.password ? `Basic ${Buffer.from(`officer:${opts.password}`).toString("base64")}` : null;
  return (req: Request, res: Response, next: NextFunction) => {
    const name = hostName(req.headers.host);
    if (!name || !allowed.has(name)) return res.status(403).json({ error: "forbidden host" });

    // No CORS, ever: a preflight gets nothing, so no other site can call the API with the header.
    if (req.method === "OPTIONS") return res.status(403).json({ error: "forbidden" });

    if (expectedAuth && !sameSecret(req.headers.authorization ?? "", expectedAuth)) {
      res.setHeader("WWW-Authenticate", 'Basic realm="safeline officer", charset="UTF-8"');
      return res.status(401).json({ error: "unauthorized" });
    }

    const origin = req.headers.origin;
    if (typeof origin === "string" && origin !== "null") {
      let originHost: string | null = null;
      try { originHost = new URL(origin).host.toLowerCase(); } catch { /* malformed → refused below */ }
      if (originHost !== (req.headers.host ?? "").toLowerCase()) return res.status(403).json({ error: "forbidden origin" });
    } else if (origin === "null") {
      return res.status(403).json({ error: "forbidden origin" });
    }

    if (req.method !== "GET" && req.method !== "HEAD" && req.headers[UI_HEADER] !== "1") {
      return res.status(403).json({ error: "missing dashboard header" });
    }
    next();
  };
}

function sameSecret(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}
