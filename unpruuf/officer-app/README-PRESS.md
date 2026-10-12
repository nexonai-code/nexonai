# safeline Press

The editorial version of the officer app: a tip line for journalists and newsrooms. Same engine as safeline (one QR code, the tip arrives in the dashboard, you can answer in the conversation), with the legal-deadline parts removed and a few additions. Romanian and English, switch at the bottom left.

Status: pilot. Not audited by an independent party, not tested against real Tor with a source in the field. Do not promise sources more than that.

## How it works for a source

1. The source installs the free unpruuf reporting app (Android).
2. Scans your QR code (on your website, in an article, on a card) and writes. No name, no phone number, no account.
3. The tip appears in your dashboard with a number. The source gets a confirmation automatically. You can answer in the conversation.

## What is different from safeline (compliance)

| | safeline | safeline Press |
|---|---|---|
| Legal deadlines (7 days, 3 months) | yes | off |
| Wording | cases, reporter | tips, source |
| Topics | compliance categories | politics, business, justice, health, environment, other (free text) |
| Keep tips | until the organisation decides | adjustable: keep until deleted, or delete after 1 / 7 / 30 / 90 / 180 / 365 days without activity |
| Delete one tip | not built | yes, permanent, the database file is compacted afterwards |
| Pickup warning | no | yes, when the app was off for longer than 12 hours (adjustable) |
| QR code for a website | show / copy | also PNG download and a ready HTML snippet |

## Start (Windows)

1. `install.bat` (first time only).
2. `start-press.bat`. It asks for the relay connection code and your password, then opens `http://localhost:3001`. Data lives in `data-press/`, apart from a safeline installation on the same computer.

Linux/macOS: `OFFICER_EDITION=press npm start`.

## Things to know before you use it

- **The app must stay running.** Packets wait on the server for 24 hours at most. If the app is off for longer, a tip can be lost. The dashboard shows a warning after the chosen number of hours and again after a restart. A small always-on server or an always-on newsroom computer solves it.
- **Retention deletes for good.** With a period set, tips with no activity for that long are removed from this computer without asking again.
- **Source in a browser.** The browser version of the reporter does not go through Tor by itself. A source who writes from a normal browser shows their IP address to the relay. Point sources to the app, or tell them to use Tor Browser.
- **Password.** There is no recovery. Losing it means losing every tip.
- **No server of ours.** The relay is run by you or your newsroom, never by NexonAI.

## For developers

`OFFICER_EDITION=press` switches the same code base: `src/settings/pressSettings.ts` (settings and last-pickup time, `data-press/settings.json`), `DELETE /api/cases/:id`, `POST /api/settings`, `GET /api/edition`. The press texts are the `p_` keys in `src/web/public/i18n.js`. Tests: `npm test` (13 tests).
