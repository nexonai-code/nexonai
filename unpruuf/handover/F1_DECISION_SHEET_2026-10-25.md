# F1 decision sheet: the length inside every stored packet

For the team (Gabriel, Norbert, Floretta). 25 October 2026. Internal: contains protocol details (patent check running), do not forward.

**What we ask the team to decide:** whether to close F1 now with one planned, incompatible release (option A, or A+ with M6), or to leave it open and let the audit report it (option B). Until the team agrees, nothing in the wire format changes.

## The finding in two sentences

The first 8 bytes of every stored 4096-byte packet state the payload length in clear, and behind a short message the packet is padded with zeros, not with random data. Whoever can read a node's database or a relay (the operator, or whoever seizes the server) sees the approximate length of each message and can tell a 44-byte cover packet from a real message; an observer on the network sees only 4096 bytes.

## Why it matters for each product

| Product | Who is the operator | What F1 gives away |
|---|---|---|
| unpruuf Compliance (reporting channel) | The company the reporter is afraid of | When a report was filed: the cover traffic does not hide it, because cover packets are recognisable |
| unpruuf Business | The customer's own admin | Roughly how long each message is, and when real messages (not cover) are sent |
| unpruuf Press (pilot) | The newsroom or its host | Same as Business |

What we may say to customers today, with no change: hidden from observers of the network; **not** hidden from the operator of the server (they see the approximate length and can tell cover packets from messages).

## Options

| | A: pad, then encrypt | A+: A plus M6 in the same release (M4 alongside, compatible) | B: document only | C: cover packets with a believable length |
|---|---|---|---|---|
| What it closes | F1 and L12: length and cover/real distinction are hidden; everything stored looks random | F1, L12 and M6 (control signals carried by the ratchet); M4 (a node operator chaining a contact's tags over days) is fixed alongside, without breaking anything | Nothing | Part of the cover/real distinction |
| What breaks | Old and new apps cannot read each other's packets (unless we add a transition) | The same, once (M4 breaks nothing) | Nothing now; a breaking release later, with a transition | Nothing; real lengths stay visible |
| Server and relay | Unchanged (they store blind 4096-byte packets) | Unchanged | Unchanged | Unchanged |
| Clients to change | Android, Officer app, Web reporter, iOS | The same | None | Android, Officer app, Web reporter, iOS |
| Audit | The auditor sees the final format | The auditor sees the final format and fewer known weaknesses | The auditor reports F1 as a finding; a second round later | Auditor reports it anyway |
| Our view | Good | **Recommended** | Acceptable if the audit must start very soon | Only as a stop-gap |

## What A looks like

`packet = IV(12) + AES-GCM( version(1) + length(4) + message + random fill ) + tag(16) = 4096 bytes`

- Everything visible is random. The version byte inside the encrypted part lets us change the format later without another flag day.
- Usable payload becomes about 4063 bytes (was 4060); to be recomputed with tests before the build.
- The report path to the officer (`OfficerCase.sealIntake`, the path without a contact key) needs the same change.
- Transition, if we want one: try the new format first, fall back to the old one (one extra authentication attempt per packet). Not needed while no customer runs a live system; needed from the first customer on.

## What A+ adds, and what goes alongside

- **M6:** control signals (delete contact, node migration, temp node) today rely on the static outer layer from the pairing code. They would become a payload type inside the ratchet (or carry a MAC derived from the session). The version byte makes room for it.
- **M4 is not part of the incompatible release.** The app asks for the whole 26-hour tag window and bundles contacts per node. The change is on the receiving side only. **Built on 25 October 2026:** each contact is asked on its own, for the epochs since the last complete poll (two or three in the steady state; the full 26 only after an app start or a gap), and the requests start spread over 1.5 s. Old and new apps keep reading each other. Also built on 25 October: every request of a contact carries its own SOCKS user name, so Tor keeps contacts on separate circuits, and each contact polls on its own timer (unit-tested, not yet run on real Tor). What remains: consecutive requests overlap by one epoch; isolation per hour is not built.
- Why F1 and M6 go in one release: both change the packet and the signal handling in the same client code and both break compatibility. Two separate releases would mean two incompatible updates.
- M5 (one write key per server for all company devices) is a different design question and is **not** part of this; it needs its own decision (per-device write keys).

## What it means for each person (all proposals, the team decides together)

- **Gabriel:** builds and tests Android, Officer app and Web reporter; keeps the claims documents in step.
- **Norbert:** iOS (`NetworkObfuscation.swift`, `OuterEnvelope.swift`, `RatchetFrame.swift`, `ComplianceService.swift`, `RelayService.swift`, tests). He receives a written description with known-answer test vectors from us before he starts. iOS must also accept only v3 onion addresses and read the `more` flag of the new `/fetchMany` (already done on Android and the server).
- **Floretta:** the customer sentence above, and the timing of any customer material that mentions message privacy against the operator; nothing about this goes into new material until the decision is made.

## Order if the answer is yes

1. Written format description with test vectors (we write it, Norbert reviews).
2. Android, Officer app, Web reporter, with tests and the evidence scripts (06, 08).
3. iOS by Norbert, against the same vectors.
4. Test on real phones; a run with two phones, our own VPS and a traffic capture.
5. Release tag with the signed file list; only then the external auditor.

The audit briefs already say that this decision is a precondition and treat it as not yet done.

## Questions for the team

1. A+, A, B or C?
2. Do we accept an incompatible update now (no customer runs a live system), or do we want a transition from the start?
3. Who writes and reviews the iOS format description, and when can Norbert build it?
4. Is the audit start date fixed by anything outside the team? If yes, B may be the only way to keep it.

## What we do not know

- The effort per client is my estimate, not measured: Android, Officer app and Web reporter are changes in a few files each plus tests; iOS depends on Norbert's time.
- Nothing here has been tested against a real Tor network or on a device.
