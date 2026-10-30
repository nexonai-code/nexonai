/** Browser port of officer-app/src/relay/relayClient.ts — same wire API, plain `fetch`. */
export interface RelayTarget { baseUrl: string; authToken: string }

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
