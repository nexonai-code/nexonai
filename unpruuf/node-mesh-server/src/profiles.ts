/**
 * Deployment profiles — the only retention knob an operator gets. A compliance officer picks a
 * named profile instead of typing raw hour values, so there's no way to configure a node into a
 * state the client apps can't cope with.
 *
 * Protocol constants every client relies on (NOT configurable per node, on purpose):
 *   - rotation interval of the routing tag: 1 hour (both contacts must agree on it — it's part of
 *     the tag derivation, so a per-node setting would silently break delivery).
 *   - MAX_TTL_HOURS: 24. Clients poll a tolerance window of ceil(MAX_TTL / rotation) + 1 = 25
 *     epochs, so ANY profile up to this cap is always fully covered without the client having to
 *     know which profile a contact's node runs.
 */

export const ROTATION_INTERVAL_HOURS = 1;
export const MAX_TTL_HOURS = 24;

export type ProfileName = "standard" | "high-security" | "offline-tolerant";

export interface Profile {
  name: ProfileName;
  ttlHours: number;
  description: string;
}

export const PROFILES: Record<ProfileName, Profile> = {
  standard: {
    name: "standard",
    ttlHours: 6,
    description: "Messages stay on the node for up to 6 hours. Good default for daily use.",
  },
  "high-security": {
    name: "high-security",
    ttlHours: 1,
    description: "Messages stay on the node for 1 hour only. Least data at rest; the contact must be online within the hour.",
  },
  "offline-tolerant": {
    name: "offline-tolerant",
    ttlHours: 24,
    description: "Messages stay on the node for up to 24 hours. For contacts who are often offline.",
  },
};

export function resolveProfile(raw: string | undefined): Profile {
  const key = (raw ?? "standard").trim().toLowerCase();
  const profile = PROFILES[key as ProfileName];
  if (!profile) {
    throw new Error(
      `Unknown NODE_PROFILE "${raw}". Valid profiles: ${Object.keys(PROFILES).join(", ")}.`,
    );
  }
  if (profile.ttlHours > MAX_TTL_HOURS) {
    throw new Error(`Profile "${profile.name}" exceeds MAX_TTL_HOURS (${MAX_TTL_HOURS}h) — clients would miss messages.`);
  }
  return profile;
}

/** Tolerance window every client polls — kept here so the server-side test suite pins the exact
 *  number the Android client uses (P2PNetworkManager.NODE_MESH_MAX_TTL_MS). */
export function clientToleranceEpochs(): number {
  return Math.ceil(MAX_TTL_HOURS / ROTATION_INTERVAL_HOURS) + 1;
}

/**
 * Up to three own nodes (NODE_MESH_SPEC.md §5). The slot decides where in the 24h Reset cycle
 * this node's hygiene pass falls (0 / 20 / 40 minutes) and gives each slot its own default ports
 * and data folder, so all three can even run side by side on one machine for testing.
 */
export type NodeSlot = 1 | 2 | 3;

export function resolveSlot(raw: string | undefined): NodeSlot {
  const n = Number((raw ?? "1").trim());
  if (n === 1 || n === 2 || n === 3) return n;
  throw new Error(`Invalid NODE_SLOT "${raw}". Use 1, 2 or 3 — one per own node.`);
}

export function slotResetOffsetMs(slot: NodeSlot): number {
  return (slot - 1) * 20 * 60 * 1000;
}

export function slotPorts(slot: NodeSlot): { apiPort: number; adminPort: number } {
  const base = 8788 + (slot - 1) * 10;
  return { apiPort: base, adminPort: base + 2 };
}
