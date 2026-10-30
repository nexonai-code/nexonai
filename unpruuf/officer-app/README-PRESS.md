# unpruuf Press

The editorial version of the officer app: a tip line for journalists and newsrooms. Same engine as unpruuf Compliance (one QR code, the tip arrives in the dashboard, you can answer in the conversation), with the legal-deadline parts removed and a few additions. Romanian and English, switch at the bottom left.

Status: pilot. Not audited by an independent party, not tested against real Tor with a source in the field. Do not promise sources more than that.

## How it works for a source

1. The source installs the free reporting app of the press edition (Android, build variant `press`; see below).
2. Scans your QR code (on your website, in an article, on a card) and writes. No name, no phone number, no account.
3. The tip appears in your dashboard with a number. The source gets a confirmation automatically. You can answer in the conversation.

## What is different from unpruuf Compliance

| | unpruuf Compliance | unpruuf Press |
|---|---|---|
| Legal deadlines (7 days, 3 months) | yes | off |
| Wording | cases, reporter | tips, source |
| Topics | compliance categories | politics, business, justice, health, environment, other (free text) |
| Keep tips | until the organisation decides | adjustable: keep until deleted, or delete after 1 / 7 / 30 / 90 / 180 / 365 days without activity |
| Delete one tip | yes, permanent, the officer types the case number to confirm, deletion log with number and time only | yes, permanent, the database file is compacted afterwards |
| Pickup warning | no | yes, when the app was off for longer than 12 hours (adjustable) |
| QR code for a website | show / copy | also PNG download and a ready HTML snippet |

## One code per research

A newsroom can create a separate code for an article or a topic (left menu **Researches**, Romanian: Investigații). Name it, press **Create code**, and put that QR next to the article. A tip that comes in through it is filed under that research, shown as a label in the tip list and in the tip's details.

- **Own keys, own letterbox.** Every research code is created from its own officer identity. The reporter apps need no change: the code looks and scans like the general code. Two research codes share no key and no address, so they cannot be tied together from the codes alone.
- **Pause and resume.** A paused code ignores new tips (the source's app keeps retrying for a while and the tip is picked up after you resume). Tips already received stay fully usable.
- **Rename** a research any time. Deleting a research is not offered, because its keys are needed for the tips it already received. Delete single tips instead.
- **General code unchanged.** "Your code" keeps working exactly as before.
- **For the tip page.** The *Download code list* button gives a text file with one line per code ("label | code", the general code first as "*"). Paste it into the tip page builder (the unpruuf Press tip page builder).
- **Limit.** One reporter app has one app identity. If the same source writes to two researches from the same app, the newsroom can recognise that it is the same app. Say so if a source asks.
- **Data.** Research identities live in the same encrypted database as the tips (`recherchen` table). Older databases get the new column on first start.

Not tested with a real reporter app on a phone yet: the codes follow the same format as the general code and are tested against the wire modules of the officer app and the web reporter, not against the Android build.

## Start (Windows)

1. `install.bat` (first time only).
2. `start-press.bat`. It asks for the relay connection code and your password, then opens `http://localhost:3001`. Data lives in `data-press/`, apart from a unpruuf Compliance installation on the same computer.

Linux/macOS: `OFFICER_EDITION=press npm start`.

## Things to know before you use it

- **The app must stay running.** Packets wait on the server for 24 hours at most. If the app is off for longer, a tip can be lost. The dashboard shows a warning after the chosen number of hours and again after a restart. A small always-on server or an always-on newsroom computer solves it.
- **Retention deletes for good.** With a period set, tips with no activity for that long are removed from this computer without asking again.
- **The reporting app for sources** is the `press` build variant of the Android project: `./gradlew assemblePressDebug` (or in Android Studio: Build Variants → pressDebug). It looks like the normal unpruuf app on the phone (neutral name), behaves like the whistleblower reporting app and speaks English or Romanian by phone language. It shows no deadline, because a journalist owes none: the status screen says there is no deadline for an answer. Not tested on a real phone yet.
- **Source in a browser.** The browser version of the reporter does not go through Tor by itself. A source who writes from a normal browser shows their IP address to the relay. Point sources to the app, or tell them to use Tor Browser.
- **Password.** There is no recovery. Losing it means losing every tip.
- **No server of ours.** The relay is run by you or your newsroom, never by NexonAI.

## For developers

`OFFICER_EDITION=press` switches the same code base: `src/settings/pressSettings.ts` (settings and last-pickup time, `data-press/settings.json`), `DELETE /api/cases/:id`, `POST /api/settings`, `GET /api/edition`. The press texts are the `p_` keys in `src/web/public/i18n.js`. Tests: `npm test` (29 tests, 8 of them for the per-research codes).
