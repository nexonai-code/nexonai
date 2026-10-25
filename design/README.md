# NexonAI design

Source: the NexonAI Consulting website (`index.html`, 16 Oct 2026). Use it for every Artifact and page from now on.

- Look: light only. NexonAI Blue `#307098` (from the logo) as the one accent, Sky `#90c8e8` on dark, Navy `#0f2a3a` for dark areas, warm `#a8500f` for warnings and pilots. Changed from the earlier teal on 19 Oct 2026 to match the CI package.
- Fonts: Open Sans (text), DejaVu Sans Mono (labels, status). The kit embeds a small mono subset and loads Open Sans from Google Fonts.
- Layout: sticky header with logo and language switch, grey status strip, sections that alternate between `--surface` and `--surface-low`, 1280px content, white cards with 16px radius.
- Files: `nexonai.css` (tokens and components), `kit.py` (page builder with header, status strip, footer, EN/RO switch), `assets/` (logo, mono font).
- No numbers in the mailbox explanation, no "audited" or "certified". Those rules come from the project CLAUDE.md files.
