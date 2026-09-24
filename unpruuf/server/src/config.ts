import * as path from "path";

/**
 * A single relay-eligible outer packet is exactly what P2PNetworkManager already caps at
 * NetworkObfuscation.PACKET_SIZE (4096 bytes, padded + AES-GCM) — true for every frame,
 * including one chunk of a larger file/photo transfer, since RatchetFrame splits those into
 * CIPHERTEXT_CHUNK_SIZE (4000 byte) pieces before this same outer packet layer wraps each one.
 */
export const MAX_BLOB_BYTES = 4096;

// Per-tag queue cap: bounds how much one wire tag can make the relay store, independent of how
// many distinct tags exist. Chunked file/photo transfers are relay-eligible (each frame carries
// an explicit index — see RatchetFrame.Frame.ChunkCont — so out-of-order arrival across relay
// polls no longer corrupts reassembly), so this has to comfortably cover the app's largest
// allowed transfer: ChatViewModel.MAX_FILE_BYTES (5 MB) / RatchetFrame.CIPHERTEXT_CHUNK_SIZE
// (4000 bytes) is ~1311 chunks worst case. 1500 leaves headroom for envelope/AEAD overhead while
// still bounding one abusive tag to a fixed, modest amount of disk (1500 × 4096 bytes ≈ 6 MB).
export const MAX_BLOBS_PER_TAG = 1500;

// Wire tags rotate hourly with a ±2h resolution tolerance (see IdentityManager.resolveSender).
// Nothing older than that window can ever be matched to a contact again, so there is little
// point keeping it much longer than that by default — but this is now just the DEFAULT offered
// at first setup (see identity.ts); the operator can pick any TTL they want, e.g. to hold
// messages longer for a contact who's offline for days.
export const DEFAULT_TTL_HOURS = 6;
export const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

// POST /v1/fetchMany batches one round-trip per contact instead of per tag: a client with several
// contacts (each with its own hour ± tolerance and up to 3 relay pool entries) can end up wanting
// dozens of tags checked at once. 64 comfortably covers that with headroom, while still bounding
// one request's cost on the relay.
export const MAX_FETCH_MANY_TAGS = 64;

// Upper bound on the long-poll `waitMs` a client can request in /v1/fetchMany, regardless of what
// it asks for. Below most reverse-proxy/load-balancer default idle-connection timeouts (typically
// 60s), so a long-poll response is never itself the reason a client sees a broken connection.
export const MAX_WAIT_MS = 55_000;

export const PORT = Number(process.env.PORT ?? 8787);
export const DATA_DIR = process.env.RELAY_DATA_DIR ?? path.join(__dirname, "..");
export const DB_PATH = process.env.RELAY_DB_PATH ?? path.join(DATA_DIR, "relay.sqlite");
export const IDENTITY_PATH = path.join(DATA_DIR, "relay-identity.json");
