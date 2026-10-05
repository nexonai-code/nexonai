# TrustLine protocol (prototype version 1)

All formats below are implemented identically in `server/public/tlcrypto.js` (browser and Node) and in the Android app
(`core/Crypto.kt`, `core/Protocol.kt`). Automated interoperability tests check both directions.

## Keys and identifiers

- Signature keys: ECDSA P-256 with SHA-256. Signatures are raw `r||s` (64 bytes), base64.
- Encryption keys: ECDH P-256.
- Public keys are exchanged as SPKI DER, base64. Private keys as PKCS#8 (only where they must be stored).
- `keyId` = first 16 hex characters of SHA-256 over the SPKI DER bytes.

Hierarchy:

| Key | Held by | Purpose |
|---|---|---|
| Relay key | relay server | signs relay log entries |
| Operator master keys (sign + encryption) | operator's browser (IndexedDB, passphrase-protected backup) | certifies agent devices, signs connection records and log seals, receives Channel B |
| Agent device keys (sign + encryption) | agent's phone (signing key in the Android Keystore) | signs instructions and events, receives Channel B |

`agent-cert`: the operator master key signs `{agent, operator, signPub, encPub, validFrom}` of an agent device. The relay and auditors verify it.

## Canonical JSON

Objects with keys sorted lexicographically, no whitespace, strings as JSON strings, integers only (money is a decimal string),
booleans and null as usual. Everything that is signed or hashed is the UTF-8 bytes of the canonical form.

## Channel A: instruction

Fields: `v, id (UUID), createdAt, expiresAt, amount{value,currency}, payout{value,currency}, corridor{from,to}, reference, purpose,
codeHash, pkgHash, screening{done,ref,at}, sender{agent,operator}, recipient{agent,operator}`.
The instruction is signed by the sender's device key. No customer names appear in Channel A.

`codeHash = SHA-256(instructionId + ":" + normalizedCode)` as hex. The payout code has 12 characters (Crockford base32 alphabet),
normalised to upper case without separators. The code itself is never sent to the relay.

## Channel B: encrypted package

```
{ v:1, aad: instructionId, iv, ct, rcpts: [ { k: keyId, epk, iv, wk } ] }
```

- Content key: random 256-bit key. `ct` = AES-256-GCM(content key, iv, canonical payload, AAD = instructionId).
- For each recipient (sending operator, receiving operator, receiving agent): ephemeral ECDH key pair, shared secret,
  HKDF-SHA256 (empty salt, info `"TrustLine-B-v1|" + keyId`) gives a key-encryption key; `wk` = AES-256-GCM(kek, iv, content key, AAD = instructionId + "|" + keyId).
- `pkgHash = SHA-256(canonical(package))` is part of the signed instruction, so the relay fingerprint covers the ciphertext.
- Payload: `{ instruction, originator{name,address,idType,idNumber,dob,customerRef}, beneficiary{name,payoutLocation} }`.

## Events

`{ v, type: CONFIRM | PAID_OUT | CANCEL, instruction, agent, at, codeHash? }` signed by the acting device key.
PAID_OUT carries the code hash; the relay compares it with the stored hash. Five wrong codes freeze the instruction.

## Request authentication (agents)

Headers `X-Agent`, `X-Key` (signing keyId), `X-Ts` (ISO time), `X-Sig` = signature over
`METHOD + "\n" + PATH(with query) + "\n" + X-Ts + "\n" + SHA-256hex(body)`.
Accepted if the timestamp is within 30 minutes of relay time. Every response carries `X-Server-Time`; clients keep an offset so a wrong phone clock does not break signatures.

## Logs

- Relay log: entries `{seq, ts, type, ref, ops, data, prev}`; `hash = SHA-256(canonical(entry))` as hex; `sig` = relay key signature over the hash string; `prev` is the previous entry's hash.
- Operator log (`op_log`): per-operator chain of `{seq, ts, type, ref, relaySeq, relayHash, data, prev}` that stores the hash of the related relay entry (cross-reference), plus operator seals (signed head of the chain).
- The Offline Auditor Tool re-computes all hashes, verifies relay, operator and seal signatures, device certificates, cross-references and checks that no instruction is paid out twice.

## Instruction checks (relay)

Sender active and certified, connection between operators active and signed by both, corridor and currency not blocked,
mandatory fields present, UUID unique and not expired, amount within per-instruction and per-day USD limits (demo FX rates), purpose from the allowed list.
A rejected instruction returns the list of failed checks and is logged.

## Not covered in this version

Out-of-band key pinning between operators, SMS fallback, operator-side software integration of Channel B, real FX, real sanctions screening.
