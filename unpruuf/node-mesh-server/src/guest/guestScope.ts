/**
 * Scope of a guest grant for the multi-slot server (250 virtual nodes per server, up to 100
 * slots per node). The scope bytes of a grant are a list of 4-byte entries, big-endian:
 *
 *   nodeIndex u16 (0..249) | slotFrom u8 (0..99) | slotTo u8 (slotFrom..99)
 *
 * A guest may only deposit into (node, slot) pairs covered by an entry. The server cannot see
 * whose tag a deposit is for (blind store), so scope is bound to what it CAN see: the virtual
 * node and the slot the deposit lands in. The host server supplies that mapping through
 * `resolveTarget` (see depositAuth.ts); how a slot is addressed is the host's business.
 *
 * An empty scope means "no restriction" and is only accepted by a single-node server that has
 * no slots (this repository's server). A multi-slot server must set `requireScope`, which makes
 * an empty scope fail closed.
 */
export const VIRTUAL_NODES_PER_SERVER = 250;
export const SLOTS_PER_NODE = 100;
export const SCOPE_ENTRY_BYTES = 4;

export interface ScopeEntry {
  node: number;
  slotFrom: number;
  slotTo: number;
}

export function encodeScope(entries: ScopeEntry[]): Buffer {
  const out = Buffer.alloc(entries.length * SCOPE_ENTRY_BYTES);
  entries.forEach((e, i) => {
    if (!Number.isInteger(e.node) || e.node < 0 || e.node >= VIRTUAL_NODES_PER_SERVER) throw new Error("node out of range");
    if (!Number.isInteger(e.slotFrom) || !Number.isInteger(e.slotTo) || e.slotFrom < 0 || e.slotTo < e.slotFrom || e.slotTo >= SLOTS_PER_NODE) {
      throw new Error("slot range out of range");
    }
    out.writeUInt16BE(e.node, i * SCOPE_ENTRY_BYTES);
    out.writeUInt8(e.slotFrom, i * SCOPE_ENTRY_BYTES + 2);
    out.writeUInt8(e.slotTo, i * SCOPE_ENTRY_BYTES + 3);
  });
  return out;
}

/** Returns null for a malformed scope (wrong length, out-of-range values). */
export function decodeScope(scope: Buffer): ScopeEntry[] | null {
  if (scope.length % SCOPE_ENTRY_BYTES !== 0) return null;
  const entries: ScopeEntry[] = [];
  for (let i = 0; i < scope.length; i += SCOPE_ENTRY_BYTES) {
    const node = scope.readUInt16BE(i);
    const slotFrom = scope.readUInt8(i + 2);
    const slotTo = scope.readUInt8(i + 3);
    if (node >= VIRTUAL_NODES_PER_SERVER || slotTo < slotFrom || slotTo >= SLOTS_PER_NODE) return null;
    entries.push({ node, slotFrom, slotTo });
  }
  return entries;
}

export function scopeAllows(entries: ScopeEntry[], node: number, slot: number): boolean {
  return entries.some((e) => e.node === node && slot >= e.slotFrom && slot <= e.slotTo);
}
