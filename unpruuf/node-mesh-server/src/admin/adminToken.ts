import * as crypto from "crypto";
import * as fs from "fs";
import { NextFunction, Request, Response } from "express";

/**
 * Access token of the setup page. The page is already limited to this computer (adminApp.ts), but
 * in a container "this computer" includes every other container on the same network, and the Host
 * header is chosen by whoever calls. The token is the second factor: 32 random bytes, new at every
 * start, never in the logs of a service (printed only to an interactive terminal), written to a
 * 0600 file in the data folder so the customer's tool can fetch it over its own SSH login.
 */
export const ADMIN_TOKEN_FILE = "admin-token";
export const ADMIN_TOKEN_HEADER = "x-unpruuf-admin-token";
const COOKIE = "unpruuf_admin_token";

export function createAdminToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function writeAdminToken(file: string, token: string): void {
  fs.writeFileSync(file, token + "\n", { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

/** Constant-time comparison; hashes first so differing lengths cost the same. */
export function tokenMatches(presented: unknown, token: string): boolean {
  if (typeof presented !== "string" || presented.length === 0 || presented.length > 200) return false;
  const a = crypto.createHash("sha256").update(presented).digest();
  const b = crypto.createHash("sha256").update(token).digest();
  return crypto.timingSafeEqual(a, b);
}

function cookieValue(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

/**
 * Lets a request through when it carries the token: as header (the customer tool), as cookie (the
 * browser after the first visit), or as `?t=` on a GET (the link printed in the terminal — the
 * answer sets the cookie and redirects, so the token does not stay in the address bar).
 */
export function adminTokenGuard(token: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (tokenMatches(req.header(ADMIN_TOKEN_HEADER), token) || tokenMatches(cookieValue(req.headers.cookie, COOKIE), token)) {
      return next();
    }
    const t = typeof req.query.t === "string" ? req.query.t : undefined;
    if (req.method === "GET" && tokenMatches(t, token)) {
      res.setHeader("Set-Cookie", `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/`);
      const rest = new URLSearchParams(req.query as Record<string, string>);
      rest.delete("t");
      const qs = rest.toString();
      return res.redirect(302, req.path + (qs ? `?${qs}` : ""));
    }
    return res.status(403).send("forbidden");
  };
}
