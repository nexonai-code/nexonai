# NexonAI knowledge cards

One Markdown file per thing. Maintained by Claude; Gabriel changes things through the chat.
NexonGraph links the cards to the code (`nexongraph build .`), `nexongraph check .` keeps them correct,
`nexongraph brief .` is the session brief, `nexongraph export-site .` builds Gabriel's RO/EN page.

## Format

```yaml
---
type: product            # see table
id: unpruuf-compliance   # = file name without .md, a-z 0-9 -
title: unpruuf Compliance
status: tested           # allowed values per type, see table
updated: 2026-10-27      # last change of content, ISO date
summary: One sentence.
# optional, by type: products, customer, partner, material, supersedes (card ids),
# code (repo paths), url, path, drive [{title, url, modified, id}], date, scope, topic,
# valid_until, price, currency, start, end, states {product-id: status}, forbidden_terms, question, conflicts
---
- short facts as bullet points
```

| Folder | type | status values |
|---|---|---|
| `produkte/` | product | planned, in-progress, pilot, tested, live, paused, retired |
| `apps/` | app | same |
| `loesungen/` | solution | same |
| `material/` | material | same (`live` = finished and published/delivered) |
| `kunden/` | customer | lead, talking, offer-sent, pilot, customer, paused, lost |
| `piloten/` | pilot | planned, running, done, stopped |
| `angebote/` | offer | draft, sent, accepted, declined, expired |
| `partner/` | partner | candidate, active, paused, ended |
| `entscheidungen/` | decision | valid, superseded |
| `gabriel/` | profile, preference | valid (profile); valid, superseded (preference) |
| `eingang/` | any | unclear cards, with `question` |

## Rules

- Never on a card: full texts from Drive, health/ID/bank/access data, private contact data, fields `owner`, `responsible`, `assignee`, assignments to Gabriel, Norbert or Floretta.
- Only facts that are documented in the repo, in artifacts or in Drive. Nothing invented. Unknown stays out.
- A replaced rule or preference is set to `superseded` and the new card names it in `supersedes`.
- Drive sync: `DRIVE-SYNC.md`, state in `.drive-stand.json`, sources in `drive-quellen.md`.
