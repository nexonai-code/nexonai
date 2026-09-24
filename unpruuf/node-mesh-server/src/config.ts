import * as path from "path";

/**
 * A single deposited blob is the same padded-outer-packet size every other unpruuf transport
 * caps at (see the consumer relay's `server/src/config.ts` for the full sizing rationale this
 * mirrors) — 4096 bytes, AES/Ratchet-wrapped, fixed regardless of message length.
 */
export const MAX_BLOB_BYTES = 4096;

// Per-tag queue cap. NODE_MESH_SPEC.md §8 flags this explicitly: without delete-on-fetch, an
// already-read blob keeps occupying its slot until TTL sweep removes it, so a tag can hold more
// concurrent entries within one TTL window than the old delete-on-fetch relay ever could. Kept
// at the same starting value as the consumer relay's MAX_BLOBS_PER_TAG (1500) per the spec's own
// note to start there and re-tune against real deployment TTL/rotation choices, not invent a new
// number without data.
export const MAX_BLOBS_PER_TAG = 1500;

// Default TTL — NODE_MESH_SPEC.md §3, chosen to match the consumer relay's own DEFAULT_TTL_HOURS
// so the two products don't carry two unrelated "reasonable default" numbers. Deployment-
// configurable, same as the consumer relay's own TTL.
export const DEFAULT_TTL_HOURS = 6;

export const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

// POST /fetchMany's per-request tag cap and long-poll wait ceiling — identical values and
// reasoning to the consumer relay's own MAX_FETCH_MANY_TAGS/MAX_WAIT_MS (server/src/config.ts):
// 64 tags comfortably covers NODE_MESH_SPEC.md §3's default tolerance window (7 tags at the
// documented 1h/6h defaults) with headroom for longer-TTL deployments; 55s stays under typical
// reverse-proxy idle-connection timeouts.
export const MAX_FETCH_MANY_TAGS = 64;
export const MAX_WAIT_MS = 55_000;

// NODE_MESH_SPEC.md §5's staggered Reset — connection/socket hygiene only, never message data
// (see nodeStore.ts). RESET_INTERVAL_MS is the cycle length; RESET_OFFSET_MS is where in that
// cycle THIS node instance's reset falls, so that running up to 3 instances (one per own node,
// each its own process/deployment) with offsets like 0 / 20min / 40min keeps at least one always
// mid-cycle. Both operator-configurable per instance — there is no way for one process to know
// it's "node 2 of 3" without being told.
export const RESET_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const RESET_OFFSET_MS = Number(process.env.NODE_MESH_RESET_OFFSET_MS ?? 0);

export const PORT = Number(process.env.PORT ?? 8788);
export const DATA_DIR = process.env.NODE_MESH_DATA_DIR ?? path.join(__dirname, "..");
export const DB_PATH = process.env.NODE_MESH_DB_PATH ?? path.join(DATA_DIR, "node-mesh.sqlite");
export const IDENTITY_PATH = path.join(DATA_DIR, "node-mesh-identity.json");
