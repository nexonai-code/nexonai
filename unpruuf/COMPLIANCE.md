# unpruuf — Compliance Reference (GDPR / DSGVO)

**What this document is.** A reference for sales, pitch decks, and audit
conversations, mapping GDPR/DSGVO obligations to specific, verifiable
architectural facts about unpruuf — not to a policy promise. Same standard as
`SECURITY_CLAIMS.md`: every claim states what it rests on, and nothing here
should be said in front of a customer without that reasoning attached.

**What this document is NOT.** A legal opinion, a compliance certification,
or a substitute for the customer's own data-protection counsel and their own
Art. 30 record of processing. NexonAI is not a law firm. Every claim below is
an *engineering* fact — "the code does X" or "the code does not do Y" — not
a legal conclusion. Whether that fact fully discharges a given customer's
specific GDPR obligation is a question for their DPO/lawyer, not for this
file. Say that explicitly whenever this document is used in a sales
conversation.

**No independent audit exists** (see `SECURITY_CLAIMS.md` §"What we
explicitly do NOT claim", item 9). Everything here is NexonAI's own
engineering analysis of its own code, not third-party verification. State
this plainly in any compliance conversation — it is more credible to a
security-literate buyer (a DPO, a CISO) than silence on the subject.

---

## The one-sentence pitch

**Most messaging vendors prove GDPR compliance with a contract (an AVV/DPA)
promising good behavior. unpruuf's architecture removes entire categories of
obligation instead of promising to honor them** — there is no NexonAI-run
infrastructure in the message path to sign a processing agreement *about* in
the first place.

---

## 1. Why "compliance by architecture" is the right framing

A GDPR risk assessment for a normal messenger asks: *who has access to this
data, what do they promise to do with it, and what happens if they're
compelled or breached?* Every answer to that question is a **policy**
answer — a contract, a promise, an audit trail of good intentions.

unpruuf changes the question. There is no NexonAI server in the path of a
single message, ever (see `MARKETING.md`'s "seven structural differences").
So instead of "what does the vendor promise," the honest question becomes
"what does the vendor structurally never receive" — and that is a claim
about code, checkable by reading it, not a claim about intentions.

This is a genuinely different sales motion for a DPO or a compliance-focused
buyer: **"we architected the obligation away" is a stronger, more durable
claim than "we have a policy for the obligation."** It also means unpruuf's
own compliance posture doesn't depend on NexonAI's future conduct — the
guarantee holds even in a future NexonAI could no longer be trusted to
honor by policy, because there is nothing for a policy to have to hold.

---

## 2. Article-by-article mapping

| GDPR / DSGVO requirement | Technical fact it rests on | Tier |
|---|---|---|
| **Art. 25 — Privacy/data protection by design and by default** | Messages exist only in process RAM (`InMemoryMessageStore`), never written to disk, zeroized on background/lock and a 5-minute TTL. This is the *default* behavior, not an opt-in setting. | Architectural — verifiable in source, see `SECURITY_CLAIMS.md` Tier 2. |
| **Art. 32 — Security of processing** | Bidirectional Double Ratchet (X25519 + HKDF + XChaCha20-Poly1305) end-to-end encryption, inside an outer AES-256-GCM transport layer, plus fixed-size packet padding and randomized cover traffic so a network observer — including the relay operator, if the optional relay is used — cannot infer message length or reliably distinguish real traffic from noise. | Tier 1 (crypto) + Tier 3 (traffic shape) in `SECURITY_CLAIMS.md`. |
| **Art. 5(1)(c) — Data minimization** | No username field exists anywhere in the codebase. No account, no phone number, no email, no push-notification token, no device identifier is collected or transmitted. Notifications show only "New message received" — never sender or content, even on the lock screen. | Architectural — absence is verifiable by reading the source (no such field/model/UI exists). |
| **Art. 17 — Right to erasure** | Deleting a chat overwrites the RAM buffer with zeros before dropping the reference (`RamMessage.zeroize()`), rather than relying on garbage collection. There is no message database anywhere to issue an erasure request *against* — "erasure" for message content is enforced by the runtime, not requested from an operator. (Contacts — never message content — persist locally in an encrypted, on-device store; deleting a contact there is a local, user-controlled action too.) | Architectural, with one honest caveat: bidirectional contact/chat deletion is delivered through the same retrying delivery queue as messages, so it reaches the other device once reachable, not necessarily instantly (`SECURITY_CLAIMS.md` Tier 3). |
| **Art. 44–49 — International transfers** | If the customer self-hosts the relay on their own infrastructure (on-premises, their own cloud region, their own office), no personal data crosses a border NexonAI controls, because NexonAI has no infrastructure in the path at all — see §3. | Depends entirely on where the *customer* chooses to host the relay. This is a fact about their deployment choice, not an unpruuf guarantee — state it that way. |
| **Art. 28 / AVV / DPA (data processing agreement)** | See §3 — this is the most legally nuanced row on this table and deserves its own section rather than a one-line claim. | See §3. |

---

## 3. The self-hosted relay: what it actually removes, and what it doesn't

unpruuf's default mode has **no relay at all** — two devices talk directly,
peer-to-peer, over Tor. The *optional* relay (`server/`, off by default) only
matters for one case: delivering a message to a contact who is offline right
now. It is worth walking through precisely, because this is where the PDF's
"the customer runs the node, so no AVV is needed" claim needs a more careful
statement than a one-liner.

**What is true, and verifiable in code:**

- The relay is **architecturally blind to content and identity**. It stores
  only already-Double-Ratchet-encrypted blobs, addressed by a rotating wire
  tag it cannot reverse to a real identity, and every request requires a
  random bearer token handed out-of-band. It cannot read a message, and it
  cannot determine who is talking to whom from the tag alone.
- The relay does not log IP addresses — a source grep across `server/src`
  turns up no IP-logging code, and more fundamentally: **the relay itself
  runs as a Tor hidden service**, so a client connecting to it never
  transmits its real IP address to the relay process in the first place. It
  isn't hidden by a firewall or VPN the customer bolts on afterward — it's
  architecturally never visible to the relay to begin with.
- No telemetry, analytics, or crash-reporting SDK exists anywhere in the
  Android or iOS codebase (checked directly, not assumed) — nothing calls
  home to NexonAI or to any third party from the app or the relay.
- There is no license server. Licensing is offline, signed codes issued
  once via `license-tool/`, verified entirely on-device — see
  `license-tool/README.md`. NexonAI does not learn when, where, or how often
  a licensed copy of unpruuf is actually used.

**What follows from that, stated carefully:** when a customer runs the relay
themselves — on their own hardware, in their own network — **NexonAI is not
in the data path at all**, for messaging or for licensing. That is a strong,
genuinely unusual position for a software vendor to be in, and it is the
basis for the sales argument *"we supply software; you operate the
infrastructure; there is no NexonAI processing of your personal data for us
to sign an AVV about."**

**What this document will not do is assert that conclusion as settled law.**
Whether "no processing occurs" fully holds for a *specific* customer's
specific deployment — e.g., if NexonAI ever provides update delivery,
paid support that touches their environment, or anything else that isn't
pure at-rest software — is a question their own counsel should confirm
against their actual contract and actual deployment, not something this
document can certify on their behalf. Recommend they ask their DPO to
confirm; don't tell them the AVV question is closed.

---

## 4. What this does NOT solve — say these proactively

Consistent with `SECURITY_CLAIMS.md`'s standard: a compliance claim without
its limits attached is not a compliance claim, it's marketing.

1. **This is not a certification.** No independent audit — security or
   compliance — has been performed. Say this before being asked.
2. **A compromised device defeats every guarantee above**, the same as it
   does for the underlying security claims — see `SECURITY_CLAIMS.md` item 2.
   Art. 32's "state of the art" security obligation is about the software's
   own design, not about a customer's endpoint hygiene, but a buyer
   evaluating real-world risk should hear this stated plainly regardless.
3. **The customer who self-hosts the relay takes on real operator
   obligations of their own** — securing the box it runs on, its physical
   access, its own network egress. Removing NexonAI from the data path does
   not remove data-protection obligations from existence; it moves the
   *controller's* infrastructure obligations onto infrastructure the
   controller (the customer) already directly controls, which is a
   defensible position, but it is the customer's obligation, not a solved
   problem.
4. **Edition pairing rules are policy, not a cryptographic or legal
   boundary** — see `SECURITY_CLAIMS.md` item 6. Don't imply a compliance
   guarantee rides on them.
5. **This document does not cover retention obligations that conflict with
   GDPR's deletion posture** — some regulated industries (e.g., certain
   financial or legal record-keeping rules) *require* retaining
   communications, which is in direct tension with unpruuf's "nothing
   persists" design. unpruuf is not the right tool for a customer whose
   actual legal obligation is retention, not deletion — say so if it comes
   up, don't paper over the mismatch.
6. **"Compliance by architecture" is NexonAI's own framing, not a regulator's
   endorsement.** No supervisory authority has reviewed or blessed this
   characterization. Present it as a well-reasoned engineering argument a
   customer's counsel can verify, not as a pre-approved compliance stamp.

---

## 5. Using this in a sales conversation

- Lead with §1's framing (architecture vs. policy), not with the article
  table — the table is the backup evidence, not the opening pitch.
- Always pair "compliance by architecture" with what it actually rests on
  in the same breath, exactly as `MARKETING.md` instructs for every
  superlative claim.
- When a prospect's DPO asks for an AVV/DPA: the honest answer is "if you
  self-host the relay, there is likely no NexonAI processing to cover in
  one — please have your counsel confirm against your specific deployment,"
  not "you don't need one." Never make the legal call on the customer's
  behalf.
- If a customer's actual regulatory obligation is retention rather than
  erasure (finance, some legal contexts), say so and don't oversell fit —
  see §4 item 5.
- Never say "audited" or "certified." Say "engineered this way, verifiable
  in source, not yet independently audited" — every time.

---

*Companion documents: `SECURITY_CLAIMS.md` (the technical claims this
document builds on — nothing here should say more than that file supports),
`MARKETING.md` (positioning and the seven structural differences),
`server/README.md` (relay scope, API, credentials/TTL model),
`license-tool/README.md` (offline licensing — why there's no license
server to discuss in a data-flow diagram).*
