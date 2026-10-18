# Guest grant format (shared by server, Android and iOS)

Internal. Pinned by `vectors.json`; every implementation must reproduce those tokens byte for byte.

Header: `Authorization: Guest <token>`, token = `<base64url(grant)>.<base64url(mac)>`, base64url without padding.

grant, big-endian:

| Offset | Size | Field |
|---|---|---|
| 0 | 1 | version, 1 |
| 1 | 16 | grantId, random, per invitation and per node |
| 17 | 8 | notAfter, unix milliseconds |
| 25 | 2 | depositsPerHour |
| 27 | 4 | bytesPerHour |
| 31 | 1 | scopeLen, 0 to 64 |
| 32 | scopeLen | scope. Empty = this node (single-node server). On the multi-slot server a list of 4-byte entries: node u16 (0..249), slotFrom u8, slotTo u8 (0..99, slotTo >= slotFrom). Empty fails closed there. |

mac = HMAC-SHA256(key, `"unpruuf-guest-grant-v1\0"` || grant)
key = HKDF-SHA256(ikm = UTF-8(ownerSecret), salt = empty, info = `"unpruuf guest grant v1"`, 32 bytes)

Rules
- Only the owner side issues grants. A guest stores the token and never sees the key.
- The node verifies statelessly, refuses expired grants and grants valid for longer than its operator cap, and never stores a grant or its id.
- A grant is valid on `PUT /deposit` only.
- Pairing code field `g`: tokens joined by `;`, index-aligned with `n` (node addresses). Empty slot = no grant for that node. Absent for every normal pairing.
- Treat tokens as secrets: never log, show once.

Run the reference server with guests on:
`NODE_MESH_GUEST_GRANTS=1 npm start` (caps: `NODE_MESH_GUEST_MAX_VALIDITY_DAYS` default 30, `NODE_MESH_GUEST_MAX_DEPOSITS_PER_HOUR` default 120, `NODE_MESH_GUEST_MAX_BYTES_PER_HOUR` default 2 MiB).
Regenerate the vectors only if the format version changes: `node node-mesh-server/dist/guest/vectors.js > guest-grants/vectors.json`.
