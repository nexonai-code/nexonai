# unpruuf — Marketing Reference

What unpruuf offers, what makes it different, and the honest case for why it
is likely the most private consumer messenger on the market. This is a
**reference document** for writing public-facing copy (website, App Store
listing, press, pitch decks) — every claim here is traceable to a real,
verifiable feature. See `SECURITY_CLAIMS.md` for the rigorous technical
backing and its explicit, honest limits; nothing in public copy should say
more than that document supports.

---

## The one-sentence pitch

**unpruuf isn't built to hide what you said. It's built so there's nothing
left to prove you said it.** unpruuf exists to make the act of communication
itself unprovable — not by inventing new cryptography, but by ensuring
nothing survives for anyone to prove it with. No server. No accounts. No
phone number. No message history. Just two phones, talking directly, over
Tor.

---

## Why "messenger" is the wrong category

Signal, WhatsApp, Telegram — every mainstream option is fundamentally a
messenger, judged on messenger terms: features, groups, reliability,
polish. **unpruuf's real category isn't "messenger." It's a structural
guarantee — an assurance, backed by architecture rather than policy or
promise, that no institution exists that could ever be compelled to prove a
conversation took place.** Judged as a messenger, unpruuf is intentionally
narrower than its competitors — no group chat, no delivery to a contact
who's offline for an extended stretch. Both are the direct cost of the
guarantee itself, not missing features: groups require members who already
know about each other (which rotating identifiers can't protect any
further), and offline delivery requires a mailbox somewhere holding the
message in the meantime — itself the kind of infrastructure the guarantee
removes. Judged as that guarantee, nothing else in the category offers it
at all.

This holds completely for message content and for anything an institution
could be compelled to produce. It does not extend to what the person you're
talking to chooses to disclose, to a compromised or legally compelled
device, or to what a well-resourced adversary might infer by watching both
ends of the network at once — see "The honest case," below, for the full
scope.

---

## What makes unpruuf structurally different

Every mainstream messenger — WhatsApp, Signal, Telegram, iMessage — encrypts
your message *content* end-to-end and then routes it through a company's
central servers anyway. That server may never read your words, but it still
sees *who* you are, *who* you're talking to, *when*, and *how often* — and it
is a single, valuable, subpoenable, hackable target sitting in the middle of
every conversation on the planet.

unpruuf removes that target. There is no server. There is nothing to seize,
subpoena, breach, or quietly backdoor, because nothing exists to do any of
those things to.

### The seven structural differences

1. **No server, anywhere, ever.** Messages travel directly between two
   phones — over Tor hidden services across any network, or directly over
   the local network when both are on the same Wi-Fi. There is no company
   in the middle, ever, for any message.

2. **No phone number, no email, no account — ever.** Every competitor above
   requires binding your real identity (a phone number, at minimum) to an
   account before you can send a single message. unpruuf has no signup at
   all. Your identity is a key pair generated on your own device; you become
   reachable to someone only by showing them a QR code in person or over a
   channel you already trust.

3. **Messages live in RAM only — never on disk.** Every other messenger
   keeps a message database on your phone (encrypted at rest, but present,
   and a real forensic target). unpruuf never writes a message to storage.
   Messages exist only in memory, and are overwritten with zeros the instant
   you background the app, lock your screen, or delete a chat. There is no
   history sitting on the device to extract.

4. **A different network identity for every contact, that changes hourly.**
   unpruuf presents a different, cryptographically rotating identifier to
   each of your contacts, changing every hour. Two of your contacts comparing
   notes cannot link the "you" they each talk to. No mainstream messenger
   does this.

5. **A panic PIN.** A second, separate PIN wipes every contact instantly and
   opens the app empty — indistinguishable from a fresh install. This exists
   in specialized security tooling; it is essentially unheard of in consumer
   messaging.

6. **Forward secrecy for everything you send.** Every outgoing message uses
   a fresh, one-time encryption key that is discarded the instant it's used.
   If your phone is later seized, messages you already sent cannot be
   decrypted from it — not by anyone, not ever.

7. **Nothing to see on the wire, or on your lock screen.** Every message,
   regardless of length, is padded to the same fixed size, so traffic
   analysis can't even learn how long your messages are. Randomized decoy
   traffic makes it harder to tell *when* you're really talking to someone.
   And your notifications never show who messaged you or what they said —
   just "New message received," even on the lock screen.

---

## Full feature set (organized by what it does for the user)

**You can't be tracked by a server, because there isn't one.**
Zero-infrastructure, peer-to-peer architecture over Tor hidden services, with
an automatic same-Wi-Fi fast path. Works over mobile data, across networks,
anywhere in the world.

**Nobody can subpoena, hack, or leak a database of your messages.**
RAM-only storage with a 5-minute in-app expiry, instant zeroization on
background/lock, and an encrypted, on-device-only contact list (SQLCipher) —
containing only *who* you know, never *what* you said.

**Your identity can't be correlated across contacts.**
No username. Contacts name *you* on their side. A unique, hourly-rotating
identifier per contact. Bidirectional contact and chat deletion, so removing
someone is final on both ends.

**You control what happens under pressure.**
PIN lock to open the app. A second, panic PIN that instantly and irreversibly
wipes every contact. Screenshot and screen-recording blocked system-wide.

**Your traffic can't be analyzed, even by someone watching the network.**
Fixed-size encrypted packets hide message length. Randomized decoy traffic
obscures communication timing. Tor bridge support for people in countries
that block Tor outright.

**It's engineered to actually work, not just to work in theory.**
Reliable delivery with delivery confirmation, automatic recovery after
network switches (Wi-Fi ↔ mobile data), and background reliability hardening
so messages arrive promptly even with the screen off.

**Three editions for three trust relationships.**
Standard, Pro, and Client editions from one codebase, each visually distinct
(color + icon), with built-in pairing rules matching real-world trust
structures. A Client can only ever connect to Pro users — but with no limit
on how many: one Client can be paired with any number of different Pro
accounts, and one Pro account can likewise invite any number of Clients. It's
a many-to-many relationship, not a single fixed connection.

---

## Pricing

| Edition | Price | Who it's for |
|---|---|---|
| **Standard** | €14.99 / month | Individuals who want the full private-messenger experience with other Standard and Pro users. |
| **Pro** | €49 / month | Power users and businesses — can connect to anyone (Standard, Pro, and an unlimited number of Client contacts). |
| **Client** | **Free** | The counterpart a Pro user invites in. No cost, full end-to-end privacy, connects to any number of Pro accounts. |

The Client edition being free is deliberate: it's designed to be handed out
by a Pro user to as many people as they need to reach — customers, contacts,
collaborators — without any of them having to pay to talk securely.

---

## Head-to-head

| | **unpruuf** | WhatsApp | Signal | Telegram (default chats) |
|---|---|---|---|---|
| Requires phone number or email | **No** | Yes | Yes | Yes |
| Central server relays your messages | **No — none exists** | Yes | Yes | Yes |
| Messages stored on-device after reading | **No — RAM only** | Yes | Yes | Yes |
| End-to-end encrypted by default | **Yes** | Yes | Yes | **No** (only in opt-in "Secret Chats") |
| Server can see who talks to whom | **No — no server** | Yes (metadata) | Yes (metadata) | Yes (metadata) |
| Panic wipe (duress PIN) | **Yes** | No | No | No |
| Per-contact identity rotation | **Yes, hourly** | No | No | No |
| Notification hides sender & content | **Yes, always** | Optional | Optional | Optional |
| Message length hidden on the wire | **Yes (fixed padding)** | No | No | No |

*(Comparisons reflect each app's publicly documented, standard behavior as of
this writing. WhatsApp and Signal both use the Signal Protocol for content
encryption, which is excellent — the differences above are about
architecture and metadata, not content-encryption quality.)*

---

## The honest case for "probably the most private"

We say *probably*, deliberately — not because we're hedging out of habit,
but because an honest security claim always names its scope. Here's the
actual argument:

No mainstream messenger combines *all* of the following: no server, no
account, no phone number, no on-disk message storage, rotating per-contact
identities, and a duress wipe. Signal is rightly respected for protocol
quality and open-source rigor, but it still requires a phone number and
still runs through a central relay. Telegram's default chats aren't even
end-to-end encrypted. WhatsApp inherits Signal's protocol but sits inside
Meta's infrastructure and data practices.

unpruuf isn't winning by doing one thing better — it's winning by removing
entire categories of risk (a server to breach, an account to identify you,
a database to seize) that every competitor still carries by design. That is
a structural claim, not a marketing one: it can be checked by reading the
architecture, not just believing the pitch.

**What keeps this claim honest, not hype:**
- unpruuf is in **active beta**. Features are still hardening.
- It has **not yet had an independent third-party security audit** — every
  claim here rests on our own engineering analysis, not outside verification.
- Forward secrecy currently protects the **sender's** side fully; full
  bidirectional protection (surviving a *recipient's* later compromise too)
  is a tracked, in-progress upgrade.

None of that undermines the core architectural claim above — it just means
"most private" should always be said *with its reasoning attached*, never as
a bare, unqualified superlative.

---

## Notes for whoever writes the public-facing copy

1. **Always pair a superlative with its reason.** Don't publish "the most
   secure messenger in the world" alone. Say what makes the case — no
   server, no accounts, RAM-only — in the same breath.
2. **Don't claim what isn't shipped yet.** Full bidirectional forward
   secrecy and an independent audit are not yet real — don't write copy
   that implies they are. obfs4/Snowflake censorship bypass is now wired in
   code (`PluggableTransportManager.kt` via IPtProxy, see CHANGELOG.md) but
   has not been confirmed against a real build or tested on an actual
   censored network — treat it as "implemented, not yet verified," not as a
   shipped, working feature, until that changes.
3. **"Beta" is not a weakness to hide.** Being transparent that this is
   actively developed, pre-audit software is *more* credible to a
   security-literate audience than silence on the subject.
4. **When in doubt, check `SECURITY_CLAIMS.md`.** If a claim you want to make
   isn't backed there, don't make it until it's actually true and documented.

---

*Companion documents: `SECURITY_CLAIMS.md` (rigorous technical backing),
`STATUS.md` (full feature status), `EDITIONS.md` (Standard/Pro/Client).*
