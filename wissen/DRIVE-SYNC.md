# Drive sync (procedure for Claude)

Source: `drive-quellen.md`. State: `.drive-stand.json` (Drive file id → modified time, `last_sync`, `pending_since`).
Rule: only facts and links go into cards, never full texts. No health, ID, bank or access data, no private contact data.

1. **Access.** With the Google Drive connection search for the folder `Claude` (My Drive of gabriel@nexonai.ro).
   - If the connected account cannot see it: stop, run
     `cd nexongraph && python3 -c "import datetime,nexongraph.drive_state as d; from pathlib import Path; r=Path('..'); d.save_state(r, d.mark_pending(d.load_state(r), datetime.date.today()))"`
     and tell Gabriel in one line which account is connected and that the folder must be shared with it.
2. **List** all files in the folder recursively: `{id, title, modified, url}`.
3. **Compare** with the state: `nexongraph.drive_state.changed_files(state, listing)`.
4. **For each changed file**: read it and extract facts only:
   - customer (organisation, industry, country, contact roles), offer (products, price, currency, valid_until, status), pilot (goal, start, end, results), partner (role), material (what, language, version);
   - write or update the matching card in `kunden/`, `angebote/`, `piloten/`, `partner/` or `material/`, add the file to `drive: [{title, url, modified, id}]`, set `updated` to today;
   - unclear which card it belongs to: create a card in `eingang/` with `question`;
   - a fact differs from the card (e.g. price): do not overwrite, add `conflicts: ["<field>: card <old> vs Drive <new> (<file title>)"]`.
5. **Mark synced**: `mark_synced(state, listing, today)` and `save_state`.
6. **Verify**: `nexongraph check .` → 0 errors; `nexongraph brief .` shows `Drive sync: last <today>`.
7. **Commit** `docs(wissen): drive sync <date>` and push.
