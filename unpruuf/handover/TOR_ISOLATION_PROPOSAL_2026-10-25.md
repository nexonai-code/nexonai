# Proposal: a separate Tor circuit for each contact

For the team (Gabriel, Norbert, Floretta). 25 October 2026. A proposal, not a decision. Internal: contains protocol details (patent check running), do not forward.

**Status 25 October 2026:** Level 1 and Level 3 are built for Android (unit-tested against a fake SOCKS server; not yet run against real Tor, not measured for battery or latency). Level 2 is not built. The questions below stay open for the team: measure first, then decide about Level 2.

**The question for the team:** after the M4 change (each contact is asked on its own, for two or three hourly tags) one thing is left that lets a node operator tie requests together: all requests to one node address travel through the same Tor circuit. Do we give each contact its own circuit, and how far do we go?

## What the node operator sees today

- Our app opens a new connection for every request, but Tor routes all connections to one onion address through the same rendezvous circuit. The operator of that node therefore sees the requests of all contacts of one phone arrive on one circuit.
- Consecutive requests of one contact overlap by one hourly tag (`{h-1, h}`, then `{h, h+1}`), so tags can be chained over days.
- All contacts are polled by one loop with the same rhythm (about every 20 s, plus or minus 5 s), so even over separate circuits the timing would look alike.
- The operator does not see names, content, or the phone's IP address. What they can build is a picture of which routing tags belong to one phone and how active each channel is.

## What stream isolation does

Tor can keep streams apart: if two connections present different SOCKS user names, Tor will not put them on the same circuit (`IsolateSOCKSAuth`; it is switched on by default for a SocksPort, to be confirmed in a test on the Tor build inside the app). The user name stays on the phone; it is never sent to the network.

## Three levels

| | Level 1: per contact | Level 2: per contact and per hour | Level 3: independent timing |
|---|---|---|---|
| Idea | One isolation key per contact, same for all its requests | The key also contains the hourly epoch, and each epoch is asked for in its own request | Each contact polls on its own random rhythm instead of one shared loop |
| Stops the operator from | Linking different contacts of one phone through the circuit | The above, and chaining one contact's tags through circuit continuity or through two tags in one request | Linking circuits by identical timing |
| Number of requests per round | Same as now | 2 to 3 times as many | Same as now |
| Extra circuits and battery | One rendezvous circuit per contact and node instead of one per node | The same, replaced every hour | None beyond Level 1 |
| First request to a new circuit | Several seconds longer (cold start of a rendezvous) | Every hour for the new epoch | None |
| Complexity | Small | Medium (the long-poll would have to move to the current epoch only; the other epochs checked less often) | Small to medium |
| Recommended | **Yes, first** | Only after measuring Level 1 on real phones | **Yes, with Level 1** |

## What Level 1 needs

- A small SOCKS5 client of our own in `NodeMeshClient` (user name and password according to RFC 1929, the host name sent to Tor as a name, never resolved on the phone), instead of the platform's `Socket(Proxy)`. Reason: the platform's SOCKS authentication is process-wide state (`java.net.Authenticator`) and affects every other connection of the app. A hand-written client has no global state and can be tested against a fake SOCKS server in plain unit tests.
- `request()` gets an optional isolation key. The key is a keyed hash of the contact id with a secret that exists once per installation, so the contact id never appears as a user name, not even locally.
- The same key for the sending side (deposits with a contact's tag), so that deposits and fetches of one contact are not tied to other contacts either.
- It must fail closed: if the SOCKS handshake with authentication fails, the request fails. No fallback to an unauthenticated connection.
- Level 3 on top: one timer per contact with its own random start and interval.

## Costs and risks

- More circuits: a phone with 30 contacts and 3 nodes each may hold up to 90 rendezvous circuits instead of one per distinct node. We have not measured the effect on battery, mobile data and latency; this is the main reason to do Level 1 first and measure.
- A company server answers up to 250 onion addresses; more circuits to it means more introductions. The read limit is per address (30 burst, 5 per second) and is not a problem for polling.
- A hand-written SOCKS client is security-relevant code. It is small, but it needs a careful review and tests for every error answer.
- Tor itself, a global observer and timing correlation by a party that sees both ends are out of reach. Nothing in this proposal claims to solve them.
- Not testable in our cloud environment: it needs a network where Tor works. Testing needs your phones or a VPS.

## How we would test it

1. Unit tests against a fake SOCKS server: greeting, authentication, name-based connect, every error code, a refused authentication, a hang.
2. On a phone or a Linux machine with real Tor: two requests to the same onion address with different user names must arrive on different circuits (Tor control port: `GETINFO circuit-status` and `stream-status`), and two with the same user name on the same one.
3. With a node server we run: log the circuit-side view of the requests during a day with 10 contacts and check that the requests of different contacts cannot be tied together by anything the server can see.
4. Battery and latency: one day on the Pixel and the Samsung, with and without Level 1.

## What it means for each person (a proposal)

- **Gabriel:** builds Level 1 and Level 3 for Android; keeps the claims documents in step (the claim "tags cannot be linked across contacts" is then true towards the node operator, with the limits above).
- **Norbert:** checks whether the iOS Tor stack allows a SOCKS user name per connection; if yes, the same change there.
- **Floretta:** nothing new in customer material until the change is built and measured. The sentence we can use now: each contact is asked on its own; we do not yet separate them onto their own Tor circuits.

## Questions for the team

1. Do we build Level 1 and Level 3 now (compatible, nothing changes on the server or in the packets)?
2. Do we measure battery and latency on both phones before we decide on Level 2?
3. Should the work come before the two-phone run with a traffic capture, so that the capture shows the final pattern? (Our recommendation: yes.)
4. Can Norbert check the iOS side in parallel?
