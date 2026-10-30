---
name: prompt-optimizer
description: Use when Gabriel or Norbert asks to optimise, improve, rewrite or sharpen a prompt ("optimier mir den Prompt", "mach daraus einen guten Prompt", "prompt optimizer", "verbessere diesen Auftrag"), or pastes a rough task and wants a prompt for Claude, ChatGPT, Gemini or a local LLM.
---

# Prompt optimizer (NexonAI)

The reply is the optimised prompt and nothing else: one fenced code block, no sentence before it, no sentence after it. Questions, remarks, opinions and open points go inside the prompt (section "Annahmen und offene Punkte"), never around it.

## Reply shape

````
```
<optimised prompt>
```
````

Language of the prompt = language of the request (German request → German prompt). If the user names a target model or language, use it.

## The prompt contains these sections, in this order

| # | Section | How to fill it |
|---|---|---|
| 1 | **Rolle** | One sentence: what expert Claude acts as for this task (e.g. "Du bist B2B-Texter für Compliance-Software in Rumänien"). |
| 2 | **Ziel** | The concrete result in one or two sentences, plus what it is for (sell, inform, decide, build). Keep the user's intent; never change the task. |
| 3 | **Kontext** | Only facts that are known: NexonAI Consulting SRL (Alba Iulia, RO), product name exactly as in the knowledge base, target audience, existing material to reuse. In this repo: look the product up first (`nexongraph explain "<name>"`) and use its card facts; never invent features, prices, figures or legal numbers. |
| 4 | **Umfang** | Bullet list of every part the result must contain. Complete, no "etc.". Finished work: no dummy code, no empty files, no placeholders without a marker. |
| 5 | **Format und Lieferung** | File type and form: customer material EN + RO; apps with `install.bat` + `start.bat` (Mac: `.command`); several files as one ZIP with `CHANGELOG.md`; Android = complete Android Studio project; artefacts/pages in NexonAI design (`design/kit.py`, blue `#307098`); deliveries also under `lieferungen/`. Only the lines that apply. |
| 6 | **Regeln** | Always include the lines that apply: no claims "certified", "GDPR-compliant/DSGVO-konform", "unbreakable", "first", "unique", "safer than", "protects sources" – write "not audited, not certified" where security comes up; no assignments to persons (Owner/Verantwortlich), write "das Team"; unpruuf work follows `unpruuf/CLAUDE.md`. |
| 7 | **Abnahme** | 3–6 checkable criteria the result must pass ("jede Rechtsangabe mit Quelle", "alle Features aus Umfang vorhanden", "`nexongraph check .` ohne Fehler"). |
| 8 | **Antwortform** | How the executing model replies: short, German chat, deliver first, own opinion at the end clearly separated. |
| 9 | **Annahmen und offene Punkte** | Everything missing from the request, each as "Annahme: …" (a sensible default the model uses) or "Offen: …" (must be checked before publishing). Omit the section only when nothing is missing. |

## Optimising

- Sharpen, do not widen: add only what the goal needs (YAGNI). If the user's way is clearly worse, put the better way into the prompt as "Annahme: … statt …, weil …".
- Concrete beats vague: numbers, names, file paths, audiences, languages.
- Legal or security figures without a source in the knowledge base go to "Offen: … gegen <Quelle> prüfen", never into the prompt as fact.
- Active person: use the preferences of the person in the brief ("Active person"); default Gabriel.

## Common mistakes

| Mistake | Fix |
|---|---|
| "Hier ist der optimierte Prompt:" or remarks after the block | Delete them; remarks become "Offen:" lines inside the prompt. |
| Prompt promises "sicher und DSGVO-konform" | Rule section forbids it; describe what the product does instead. |
| Invented features or prices | Only knowledge-base facts; otherwise "Offen:". |
| Generic role ("Du bist ein hilfreicher Assistent") | Name the expertise the task needs. |
