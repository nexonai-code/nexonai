import * as path from "path";
import { MAX_TTL_HOURS, resolveProfile, resolveSlot, slotPorts, slotResetOffsetMs } from "./profiles";

/**
 * A single deposited blob is the same padded-outer-packet size every other unpruuf transport
 * caps at — 4096 bytes, AES/Ratchet-wrapped, fixed regardless of message length.
 */
export const MAX_BLOB_BYTES = 4096;

// Per-tag queue cap (NODE_MESH_SPEC.md §8/§9 asked for this to be re-checked against the TTL
// defaults, since fetch no longer drains a tag). Result: TTL doesn't matter here — the routing
// tag rotates every hour, so one tag only ever collects ONE hour's worth of one contact's
// outgoing traffic, whatever the TTL. 1500 covers a full 5 MB attachment (~1311 chunks) inside a
// single hour with headroom, so the consumer relay's value stays correct as is.
export const MAX_BLOBS_PER_TAG = 1500;

export const NODE_PROFILE = resolveProfile(process.env.NODE_PROFILE);
export const NODE_SLOT = resolveSlot(process.env.NODE_SLOT);
export const DEFAULT_TTL_HOURS = NODE_PROFILE.ttlHours;
export { MAX_TTL_HOURS };

// Expired rows are already invisible to /fetch (nodeStore filters on expires_at); the sweep
// bounds how long they physically linger on disk after that.
export const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

// 64 tags covers the clients' 25-epoch tolerance window (profiles.ts) with headroom; 55s stays
// under typical reverse-proxy idle timeouts. Same values as the consumer relay.
export const MAX_FETCH_MANY_TAGS = 64;
export const MAX_WAIT_MS = 55_000;

// NODE_MESH_SPEC.md §5's staggered Reset. The slot picks this node's position in the 24h cycle
// (0 / 20 / 40 min); NODE_MESH_RESET_OFFSET_MS stays as an expert override.
export const RESET_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const RESET_OFFSET_MS = process.env.NODE_MESH_RESET_OFFSET_MS !== undefined
  ? Number(process.env.NODE_MESH_RESET_OFFSET_MS)
  : slotResetOffsetMs(NODE_SLOT);

const ports = slotPorts(NODE_SLOT);
export const PORT = Number(process.env.PORT ?? ports.apiPort);
export const ADMIN_PORT = Number(process.env.ADMIN_PORT ?? ports.adminPort);

export const PACKAGE_ROOT = path.join(__dirname, "..");
export const DATA_DIR = process.env.NODE_MESH_DATA_DIR ?? path.join(PACKAGE_ROOT, "data", `node-${NODE_SLOT}`);
export const DB_PATH = process.env.NODE_MESH_DB_PATH ?? path.join(DATA_DIR, "node-mesh.sqlite");
export const IDENTITY_PATH = path.join(DATA_DIR, "node-mesh-identity.json");
export const TOR_BIN_DIR = process.env.NODE_MESH_TOR_BIN_DIR ?? path.join(PACKAGE_ROOT, "tor-bin");

// Tor is mandatory for a real node. NODE_MESH_TOR=0 exists only for automated tests and for an
// operator who already runs their own Tor hidden service in front of PORT — never a LAN shortcut.
export const TOR_ENABLED = process.env.NODE_MESH_TOR !== "0";

// Tor's onion-service proof-of-work defense (Tor ≥ 0.4.8). Values are Tor's own defaults.
export const POW = { queueRate: 250, queueBurst: 2500 };
