# Infin8 Content OS

A private writing and archive space for social media content, styled in the infin8scale identity. Write scripts and posts in a Google-Docs-style editor, organise them into **spaces → folders → documents**, track each piece from idea to posted, and keep an archive of everything you publish with its link and numbers.

Everything is stored **locally in your browser**. There is no server, no account and no upload.

## Features

**Writing**
- Rich-text editor (TipTap/ProseMirror): headings, bold/italic/underline/strike, highlight, links, alignment, bulleted/numbered/check lists, quotes, code, dividers, images (paste, drop or upload).
- Autosave, word and character count, and **spoken time** for scripts (pace is configurable).
- Selection-aware length checks against platform limits (X, Threads, LinkedIn, Instagram, TikTok, YouTube, Facebook).
- **Templates** with ghost hints that vanish as you type: short-form script, long-form video, carousel, LinkedIn post, thread, idea, "log a published post" and note.
- **Copy as plain text** (and native ⌘C) produces one line per paragraph, so text pastes into social apps exactly as written.
- Export to Markdown with YAML front matter (Obsidian-friendly), plain text or print/PDF.
- **Teleprompter**: full-screen auto-scroll with countdown, speed, size, mirror and keyboard control.
- Focus mode, plus Sans, Serif and Mono document fonts.

**Organising**
- Unlimited spaces (icon and colour), nested folders, documents. Drag and drop to move. Right-click menus, inline rename and a Move dialog.
- Trash with cascading delete, restore (including undo from the toast) and permanent delete.
- ⌘K / Ctrl K command palette: searches titles, tags and the full text of every document, and runs commands.

**Tracking**
- Status pipeline (Idea → Drafting → Ready → Scheduled → Posted) as a drag-and-drop board.
- Calendar: drag ready posts onto a day to schedule them, or drag between days to reschedule.
- Each post records its platforms, publish date and time, live link, tags, and views, likes, comments, shares and saves, with an engagement rate.
- Home dashboard: quick-start templates, pipeline counts, up-next queue, overdue warnings, posting heatmap and weekly streak.
- Notes (strategy, brand voice, research) stay out of the pipeline.

**Look**
- Dark-first monochrome UI built from the infin8scale mark and wordmark. Both are vectorised from the original PNGs (`src/brand/assets`) so they stay crisp and themeable.
- Light and system themes. Works on mobile.

## Run it

Requires Node 20+.

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173.

```bash
npm test          # unit tests (data layer, text conversion, backups)
npm run build     # type-check + production build into dist/
npm run preview   # serve the production build
```

## Your data

- Stored in this browser's IndexedDB. It never leaves the device, and it is **not synced** between browsers or devices.
- Clearing site data, or using a private window, deletes it. **Settings → Export** writes a single JSON backup and **Restore** brings one back. Back up regularly.
- On first run the app asks the browser to protect its storage from automatic eviction. Firefox prompts for this, so there it is a button in Settings.

## Deploy

The build is a static site with hash routing. Host `dist/` anywhere (Netlify, Vercel, GitHub Pages, any static server) with no rewrites needed. Every visitor gets their own empty, private workspace in their own browser.

## Shortcuts

| Keys | Action |
| --- | --- |
| ⌘K / Ctrl K | Search and commands (with text selected in the editor: add a link) |
| N | New document from a template |
| ⌘S / Ctrl S | Save now |
| ⌘\ / Ctrl \ | Toggle sidebar |
| ⌘⇧F / Ctrl ⇧F | Focus mode (Esc to exit) |
| Space, ↑ ↓, + −, M, R | Teleprompter: play, speed, size, mirror, restart |

## Project layout

```
src/
  brand/        logo components + traced vector paths, original PNG assets
  lib/          data model, IndexedDB schema, repository (all writes), text/markdown
                conversion, templates, backups, dates, router
  state/        live workspace query, UI and settings stores, high-level actions
  components/   sidebar tree, dialogs, command palette, shared UI
  editor/       document page, toolbar, details panel, teleprompter
  views/        home, library/space/folder, pipeline, calendar, trash
tests/          Vitest suites for the data layer
```

Every write goes through `src/lib/repo.ts`, which owns the rules: cascading trash, no folder cycles, and moves across spaces that carry nested content along.

## Known limits / next steps

- Single device: syncing needs a backend (e.g. Supabase or a small API) behind the same repository interface.
- No automatic import from Instagram, TikTok, YouTube or the others. Their APIs are restricted, so posts are logged manually or pasted in.
- No version history yet.
- Folders sort alphabetically, so prefix names (`01 Ideas`) to force an order.
