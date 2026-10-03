import * as http from "node:http";
import { SocksProxyAgent } from "socks-proxy-agent";

/**
 * HTTP client for the blind relay's wire API (`server/src/routes/relay.ts`, byte-identical on
 * `relay-android`) — POST /v1/relay, GET /v1/fetch, POST /v1/fetchMany.
 *
 * Two transports, chosen by whether [target.socksPort] is set:
 * - **Tor (the real path, default)** — routes every request through a local Tor SOCKS proxy
 *   (see ../tor/tor.ts) via `socks-proxy-agent`, so this process reaches the relay's real
 *   `.onion` address exactly like the Android app already does. Uses Node's classic `http`
 *   module rather than the built-in `fetch` (undici) — undici's `dispatcher` option doesn't
 *   accept a plain `http.Agent`, and `socks-proxy-agent` implements that classic interface, not
 *   undici's, so mixing the two isn't a good fit here.
 * - **Direct LAN/plain-HTTP (opt-in fallback)** — plain `fetch`, no Tor, for a relay whose
 *   bind host was explicitly opened up for a local network (see `server/`'s `RELAY_BIND_HOST` /
 *   `relay-android`'s "Allow LAN access" toggle). Kept only as a fallback for a Tor bootstrap
 *   failure or a deliberately Tor-less dev setup — see officer-app/README.md.
 */

export interface RelayTarget {
  baseUrl: string;
  authToken: string;
  /** Local Tor SOCKS proxy port (see tor/tor.ts's `TorClient.socksPort`). When set, every
   *  request is routed through it instead of a direct connection. */
  socksPort?: number;
}

export const MAX_TAGS_PER_CALL = 64;

export class RelayClient {
  constructor(private target: RelayTarget) {}

  async push(tag: string, blobBase64: string): Promise<boolean> {
    const res = await this.request("POST", "/v1/relay", { tag, blob: blobBase64 });
    return res.status === 201;
  }

  /** The relay accepts at most 64 tags per call (server/src/config.ts MAX_FETCH_MANY_TAGS) —
   *  larger lists (many cases + the 49 intake tags) are split into several calls. */
  async fetchMany(tags: string[], waitMs = 0): Promise<Record<string, string[]>> {
    if (tags.length === 0) return {};
    const out: Record<string, string[]> = {};
    for (let i = 0; i < tags.length; i += MAX_TAGS_PER_CALL) {
      const chunk = tags.slice(i, i + MAX_TAGS_PER_CALL);
      const res = await this.request("POST", "/v1/fetchMany", { tags: chunk, waitMs: tags.length <= MAX_TAGS_PER_CALL ? waitMs : 0 });
      if (res.status < 200 || res.status >= 300) throw new Error(`fetchMany failed: HTTP ${res.status}`);
      const json = JSON.parse(res.body) as { blobs: Record<string, string[]> };
      Object.assign(out, json.blobs ?? {});
    }
    return out;
  }

  private async request(method: "GET" | "POST", path: string, body: unknown): Promise<{ status: number; body: string }> {
    if (this.target.socksPort) return this.requestViaSocks(method, path, body, this.target.socksPort);
    const res = await fetch(`${this.target.baseUrl}${path}`, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${this.target.authToken}` },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.text() };
  }

  private requestViaSocks(method: "GET" | "POST", urlPath: string, body: unknown, socksPort: number): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.target.baseUrl}${urlPath}`);
      const agent = new SocksProxyAgent(`socks5h://127.0.0.1:${socksPort}`);
      const payload = JSON.stringify(body);
      const req = http.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || 80,
          path: url.pathname + url.search,
          method,
          agent,
          headers: {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(payload),
            authorization: `Bearer ${this.target.authToken}`,
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
        },
      );
      req.on("error", reject);
      req.write(payload);
      req.end();
    });
  }
}
