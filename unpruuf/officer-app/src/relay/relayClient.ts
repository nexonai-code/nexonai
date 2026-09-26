/**
 * HTTP client for the blind relay's wire API (`server/src/routes/relay.ts`, byte-identical on
 * `relay-android`) — POST /v1/relay, GET /v1/fetch, POST /v1/fetchMany. Uses Node's built-in
 * `fetch` (no extra HTTP dependency).
 *
 * IMPORTANT v1 scope note (see officer-app/README.md "known gaps"): both `server/` and
 * `relay-android` deliberately bind their HTTP listener to `127.0.0.1` only and are reachable
 * from the outside strictly via their Tor hidden service — a real security choice, not an
 * oversight (see index.ts's own comment: "reach it only via the Tor sidecar"). This client does
 * NOT speak SOCKS5/Tor — it does a plain HTTP(S) request to whatever `baseUrl` it's given. For
 * the live demo, that means the relay must be started with its bind host opened up for the
 * local network (see server/'s `RELAY_BIND_HOST` env var / relay-android's "Allow LAN access"
 * setting) and `baseUrl` pointed at that LAN address — an explicit, documented demo
 * simplification, not the production posture. A real deployment should run this process behind
 * a Tor client (reusing `server/src/windowsTor.ts`'s already-proven SOCKS bootstrap) instead —
 * tracked as a fast-follow, not built this session.
 */

export interface RelayTarget {
  baseUrl: string;
  authToken: string;
}

export class RelayClient {
  constructor(private target: RelayTarget) {}

  async push(tag: string, blobBase64: string): Promise<boolean> {
    const res = await fetch(`${this.target.baseUrl}/v1/relay`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.target.authToken}` },
      body: JSON.stringify({ tag, blob: blobBase64 }),
    });
    return res.status === 201;
  }

  /** One round-trip for every tag this officer-app currently cares about — see
   *  CaseStore.allPollCandidates(). Returns tag -> blobs (already base64, oldest first). */
  async fetchMany(tags: string[], waitMs = 0): Promise<Record<string, string[]>> {
    if (tags.length === 0) return {};
    const res = await fetch(`${this.target.baseUrl}/v1/fetchMany`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.target.authToken}` },
      body: JSON.stringify({ tags, waitMs }),
    });
    if (!res.ok) throw new Error(`fetchMany failed: HTTP ${res.status}`);
    const json = (await res.json()) as { blobs: Record<string, string[]> };
    return json.blobs ?? {};
  }
}

export function relayClientFromConnectionString(baseUrl: string, authToken: string): RelayClient {
  return new RelayClient({ baseUrl, authToken });
}
