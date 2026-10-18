import { issueGuestGrant } from "./guestGrant";

/** Fixed inputs for the cross-platform test vectors (Android, iOS, server). Deterministic. */
export const VECTOR_OWNER_SECRET = "vector-owner-secret-0001";

export function buildVectors() {
  const cases = [
    { name: "basic", grantIdHex: "000102030405060708090a0b0c0d0e0f", notAfterMs: 1893456000000, depositsPerHour: 60, bytesPerHour: 1048576, scopeHex: "" },
    { name: "with-scope", grantIdHex: "ffeeddccbbaa99887766554433221100", notAfterMs: 1893456000000, depositsPerHour: 120, bytesPerHour: 2097152, scopeHex: "0a0b0c" },
    { name: "slot-scope", grantIdHex: "00112233445566778899aabbccddeeff", notAfterMs: 1893456000000, depositsPerHour: 60, bytesPerHour: 1048576, scopeHex: "0000000900f90063" },
    { name: "short-limits", grantIdHex: "a1a2a3a4a5a6a7a8a9aaabacadaeafb0", notAfterMs: 1800000000000, depositsPerHour: 1, bytesPerHour: 4096, scopeHex: "" },
  ];
  return {
    description: "Guest grant test vectors. Header = 'Guest ' + token. See GUEST_LOCKERS_BUILD_SPEC.md and src/guest/guestGrant.ts for the format.",
    ownerSecret: VECTOR_OWNER_SECRET,
    cases: cases.map((c) => ({
      ...c,
      token: issueGuestGrant(VECTOR_OWNER_SECRET, {
        grantId: Buffer.from(c.grantIdHex, "hex"),
        notAfterMs: c.notAfterMs,
        depositsPerHour: c.depositsPerHour,
        bytesPerHour: c.bytesPerHour,
        scope: Buffer.from(c.scopeHex, "hex"),
      }),
    })),
  };
}

if (require.main === module) {
  process.stdout.write(JSON.stringify(buildVectors(), null, 2) + "\n");
}
