# Infin8 Content OS

**Live:** https://infin8-content-os.netlify.app

A private writing and archive space for social media content, styled in the infin8scale identity. Write scripts and posts in a Google-Docs-style editor, organise them into **spaces → folders → documents**, track each piece from idea to posted, and keep an archive of everything you publish with its link and numbers.

Everything is stored **locally in your browser** on your laptop. There is no server, no account and no upload — and automatic backups to a folder you choose keep a copy outside the browser.

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

**Keeping posts safe**
- **Automatic backup** to a folder you pick (Chrome, Edge, Brave or Arc on a computer): a full copy shortly after each change, plus one dated snapshot per day — the last 30 are kept. Pick a folder inside Google Drive, Dropbox or iCloud Drive and you also have a copy off the laptop.
- The sidebar always shows when the last backup happened; Home reminds you if there has been none for a week.
- A backup is never replaced by an empty one, so “Delete all data” can't wipe your safety copy.
- Manual **Export / Restore** of a single JSON file works in every browser.

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
npm test               # unit tests (data layer, text conversion, backups)
npm run build          # type-check + production build into dist/
npm run preview        # serve the production build on http://localhost:4173
npm run build:preview  # single-file build for a claude.ai preview page
```

## Your data

- Stored in this browser's IndexedDB. It never leaves the laptop, and it is **not synced** between browsers or devices.
- **Data belongs to the exact address you open.** `http://localhost:5173`, `http://localhost:4173` and a hosted URL are three separate, empty workspaces. Always use the same one (the scripts refuse to start on another port for this reason). To move, export a backup and restore it at the new address.
- Clearing site data, or using a private window, deletes it — which is what automatic backup is for. Turn it on in **Settings → Backups & data**.
- On first run the app asks the browser to protect its storage from automatic eviction. Firefox prompts for this, so there it is a button in Settings.

## Using it every day

1. Open https://infin8-content-os.netlify.app in Chrome or Edge and use **Install app** in the address bar, so it opens in its own window like a desktop app.
2. In **Settings → Backups & data**, choose a backup folder inside Google Drive, Dropbox or iCloud Drive.
3. Keep using that same address. A fresh install starts empty: create your first space from Home.

Running it locally with `npm run build` then `npm run preview` also works, but that is a different address with its own, separate data.

## Deploy

Hosted on Netlify as `infin8-content-os` (production URL above). `netlify.toml` holds the build settings, so connecting this repository in Netlify gives automatic deploys on every push; until then, deploys upload the built `dist/` folder. `public/_headers` adds security headers (content security policy, no framing, no search indexing) and long-term caching for hashed assets.

**Don't rename the site or move it to another domain without moving your data first:** the browser stores everything per address, so a new address starts empty. Export a backup on the old address and restore it on the new one.

The build is a static site with hash routing (`#library`, `#doc-<id>`), so any static host works with no rewrites. Every visitor gets their own empty, private workspace in their own browser — nobody else can see your posts.

`npm run build:preview` packs the app into one self-contained HTML file for a claude.ai preview page. Inside that sandbox, downloads, printing and folder backups are unavailable, so the preview swaps Export for “Copy backup” and labels itself as a preview.

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
docs/mistakes/          mistakes made while building, each turned into a rule
docs/removed-features/  features taken out, and why
CLAUDE.md       instructions every Claude Code session loads, including both logs above
```

Every write goes through `src/lib/repo.ts`, which owns the rules: cascading trash, no folder cycles, and moves across spaces that carry nested content along.

## Known limits / next steps

- Single device by design: syncing would need a backend (e.g. Supabase or a small API) behind the same repository interface.
- No automatic import from Instagram, TikTok, YouTube or the others. Their APIs are restricted, so posts are logged manually or pasted in.
- No version history yet.
- Folders sort alphabetically, so prefix names (`01 Ideas`) to force an order.
