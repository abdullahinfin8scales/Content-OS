# Infin8 OS (formerly Infin8 Content OS) — instructions for agents

Read this whole file before doing any work. It includes two logs that are part of these instructions:

- **Mistakes log** (`docs/mistakes/`): rules learned from mistakes already made in this project. Follow every rule.
- **Removed features** (`docs/removed-features/`): things deliberately taken out. Don't bring them back unless the user asks.

If the two lists below are not shown inline, open `docs/mistakes/README.md` and `docs/removed-features/README.md` now and read them before continuing.

@docs/mistakes/README.md

@docs/removed-features/README.md

## Keeping the logs (required)

- You shipped a bug, acted on a wrong assumption, or the user had to correct you: add an entry to `docs/mistakes/` before you finish the task (steps in its README).
- You removed or hid a feature: add an entry to `docs/removed-features/` in the same commit.
- Don't wait to be asked, and don't batch entries for later sessions.

## The project

- One person's private OS, in two sections switched from the top of the sidebar:
  - **Personal** (`#`, the start page): **Today** (an hour timeline for the day, then the day's **wins** and **losses** with the lesson from each, then its thoughts), **Goals** (deadlines, a "why", optional number to reach), **Non-negotiables** (commitments at a set time, copied automatically onto each of their weekdays; one day can be skipped from that day's list or by date), **Journal** (each day's thoughts, wins and lessons) and **Notes**.
  - **Content OS** (`#content`): the original writing and archive space for social media content (library, pipeline, calendar, spaces).
  - More sections (e.g. Work) are expected later: add routes to `sectionOf` in `src/lib/router.ts` and a branch in the sidebar.
- Look, by the user's rule: **pure black (#000) with pure white text in dark mode, pure white (#fff) with pure black text in light mode.** Only small hints (dates, placeholders, counts) may be grey (`--fg-3`, `--fg-4`); never make main text or surfaces off-white or near-black. Type is **Geist** / Geist Mono, soft weights (400 body, 500–560 headings, never above 600).
- Stack: React 19, Vite 8, TypeScript 5.9, Tailwind CSS 4, TipTap 3 (editor), Dexie 4 (IndexedDB), Zustand, Supabase (auth + cloud copy), Vitest.
- The display name is **Infin8 OS**, but the Netlify site, the URL, the Dexie database name (`infin8-content-os`), the backup `app` id and the backup file names keep their old names on purpose: data is tied to them (mistakes 012, 013).
- Live app: https://infin8-content-os.netlify.app (Netlify site `infin8-content-os`, id `ff4fa68f-aed1-4e7f-9570-9a61c4cf60bd`).
- Accounts: email + password, no email confirmation. Sign-up stays open by the user's choice ("keep it simple; if someone signs up, they just get their own space"); row-level security gives every account its own empty workspace. Don't lock sign-up or add hardening unless the user asks.
- Data: local-first. The browser's IndexedDB is the working copy (fast, works offline); every change is synced to the owner's Supabase account in the background. Extra safety: automatic folder backups (`src/state/backup.ts`) and JSON export/restore. The free Supabase plan has no automatic backups and pauses after 7 days without use.
- The app starts empty. No sample data, ever (mistake 002).

## Cloud sync and accounts

- `supabase/migrations/`: the database. One `records` table (kind, id, data jsonb, deleted, updated_at, server_updated_at), owner-only row-level security, and two functions: `push_records` (last write wins; returns the server's row when it kept a newer one) and `pull_records` (keyset pages). Change the schema only with a new migration file, applied to both projects.
- Record kinds: `space`, `folder`, `doc`, `content`, `platform`, and the personal ones `nonneg`, `task`, `goal`, `journal`, `note` (migration `0002_personal_records.sql` widens the `records_kind_check` constraint). **A new kind needs its migration applied before the app version that writes it is deployed**: Postgres fails the whole upload batch on one bad kind, which would stall all syncing.
- A day's copies of the non-negotiables (task ids `nn-<nnId>-<date>`) are derived data: each device builds them in `PersonalRepo.ensureDay` through `withoutUpload`, and they upload only when the user ticks one, or skips that day (`skipNonNegOn` uploads the removal, so a ticked copy goes on every device). Keep it that way, or an unsynced device could undo a tick made on another. Which days a non-negotiable is on lives on the `nonneg` record itself (`days`: weekdays, missing on older records = every day; `offDates`: single days off), checked by `nnOnDate`.
- Wins and losses are stored on the day's `journal` record (`wins`, `losses`, both optional), so they sync without a new record kind. New optional fields on an existing kind need no migration (records are stored whole as jsonb); a new kind does.
- `src/sync/outbox.ts`: Dexie middleware that queues every write to a synced table in `outbox`, inside the same transaction. Writes that must not upload (downloaded rows, clearing the laptop on sign-out) go through `withoutUpload`. Don't add `await` before calling down in the middleware: Dexie's layers need the transaction context (use `Dexie.Promise`).
- `src/sync/engine.ts`: push/pull/apply, claiming pre-account data on first sign-in (`prepareForUser`), `clearLocal`. Pure logic, tested in `tests/sync.test.ts` against a fake server that mirrors the SQL.
- `src/state/sync.ts` (when to sync, status), `src/state/auth.ts` (session, sign in/up/out, password reset), `src/components/auth/AuthGate.tsx` (screens in front of the app).
- Supabase project: "Infin8scale content-os", ref `hflykhxvnrcuuxsvoffg` (Mumbai). Auth settings: site URL = the live app, redirect allow list = the live app, email confirmation off, minimum password 8.
- Config: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.production` (used by `npm run build`) and `.env.cloud` (used by `npm run dev:cloud`, port 5174). Plain `npm run dev` stays local-only so UI work never writes to the real account. Both values are public by design; never put a secret key, service-role key or database password in the repo or the app. The build writes the Supabase origin into the CSP in `dist/_headers`.
- There is no separate test project (the free plan allows 2 active projects and the user's other one is in use). Test sync end to end with `npm run dev:cloud` and throwaway accounts named `e2e-<run>-…@example.com`, then delete them: `delete from auth.users where email like 'e2e-<run>-%@example.com'` (their rows go with them). Never sign in as, or change, the owner's account or rows. Also test the production build with the live headers before deploying (CSP).
- Supabase admin (migrations, auth settings, test cleanup) goes through the Management API (`POST /v1/projects/<ref>/database/query`, `PATCH /v1/projects/<ref>/config/auth`) with an access token the user enters in the secure credential form for `api.supabase.com`; never ask for it in chat. The user deletes the token after each setup, so ask again when admin work is needed.
- The claude.ai preview build stays local-only (no accounts).

## Working with the user

- Keep messages short and structured: a one-line summary, then numbered steps or short bullets. No walls of text. Bold the things the user must do.
- Don't drop anything important to make a message shorter; the user has missed details buried in long paragraphs before, and it caused problems (mistake 017).
- Prefer the simplest setup that meets the goal; when the user says "keep it simple", don't add extra steps or hardening.

## Commands

- `npm install`, then `npm run dev` (http://localhost:5173, fixed port)
- `npm test`: unit tests for the data layer, sync engine, text conversion, backups and routing
- `npm run build`: type-check plus production build into `dist/`
- `npm run build:preview`: single-file build for the claude.ai preview page
- `npm run dev:cloud`: dev server connected to Supabase (port 5174), for `node scripts/e2e-sync.cjs` (accounts + sync end to end)
- `node scripts/netlify-sim.cjs dist` + `node scripts/e2e-csp.cjs`: the production build under the live site's headers

Run `npm test` and `npm run build` before every commit. Check UI changes in a real browser; Playwright and Chromium are preinstalled in cloud sessions (see mistake 015 for testing pitfalls).

## Deploying

- Build with `npm run build`, zip the contents of `dist/`, and upload the zip: `POST https://api.netlify.com/api/v1/sites/ff4fa68f-aed1-4e7f-9570-9a61c4cf60bd/deploys` with `Content-Type: application/zip`. Poll `GET /api/v1/deploys/<id>` until `state` is `ready`.
- The Netlify token is saved as a network secret on the cloud environment and injected by the proxy. Never ask the user to paste a token into chat.
- Once the repository is connected in Netlify, pushes deploy automatically using `netlify.toml`.
- Never rename the site or change its domain without the user's agreement and a backup move plan (mistake 012).

## Code map

- `src/lib/repo.ts`: every Content OS data write (cascading trash, folder moves, no folder cycles). Change data rules here and in `tests/`.
- `src/lib/personalRepo.ts`: every personal write (non-negotiables, their days and day copies, tasks, goals, journal with wins and losses, notes), tested in `tests/personal.test.ts`. `src/lib/personalText.ts`: task-time parsing ("Call Sara at 3pm"), clock labels (locale 12/24-hour), days-left labels, weekday names and summaries ("Weekdays", "Every day except Sun").
- Moving tasks: each of your own tasks has a grip handle; drag it anywhere on the day (another hour, between two tasks, or into Anytime) and it lands there with the time that fits: the hour on the hour, or the time of the task just above it; Anytime = no time (`timeForDrop`). A line and a time label show the landing spot while dragging, and the page scrolls by itself near its edges. Ties at the same time are broken by `order` (the new order goes between its neighbours'; non-negotiable copies count as neighbours but are never written, they never move). `PersonalRepo.placeTask` writes a drop, `moveTask` is the ⋯ menu's "Move to top / up / down" inside one hour block. The drag is pointer-event based so it works by finger (`src/views/personal/taskSort.ts`; HTML5 drag-and-drop does nothing on touch screens); it reads `[data-drop-zone]` (anytime, hour-N) and `[data-task-row]` from `DayView`. Don't bring back "reorder only among tasks at the same time" (mistake 020). Moving a task to another day: the ⋯ menu offers the day before and the day after (and "Move to today" from a far-off day), via `PersonalRepo.moveTaskToDay` (goes last on the new day); every move shows an Undo toast that puts it back on its old day in its old place (`moveTaskWithUndo`).
- `src/state/personal.ts`: personal live queries and hooks (`useToday`, `usePersonalLists`, `usePersonalUpkeep` keeps today's timeline built), `focusDay`.
- `src/views/personal/`: Today/day timeline (`DayView`), Non-negotiables, Goals, Goal, Journal, Notes; `RichNote` is the slim editor used by the journal and notes.
- `src/lib/content.ts`: rich text → plain text and Markdown (`toPlainText` is what gets posted).
- `src/state/`: workspace live query, UI and settings stores, actions, automatic backup.
- `src/editor/`: document page, toolbar, details panel, teleprompter.
- `src/views/`: Content OS overview (`HomeView`, at `#content`), library/space/folder, pipeline, calendar, trash.
- `src/styles/index.css`: colour tokens (dark on `:root`, light via media query and `data-theme`) and editor typography.
- `src/lib/env.ts`: `IS_PREVIEW` gates claude.ai-preview differences; `LIVE_URL` is the permanent address; `SYNC_ENABLED` turns accounts and sync on when Supabase is configured.
- `public/_headers`: security headers and caching for Netlify.

## Git

- `main` is the repository's main line (since 2026-11-21) and matches the live site. Older branches: `claude/blissful-volta-gdoa6f` (the old Content-OS-only app; never deploy from it) and `personal-os` (already in `main`).
- On the user's PC (`e:\Task os\app`) work on `main`; commit, push and deploy when the user asks ("push and deploy"). Deploy from there with `netlify deploy --prod --dir=dist --site=ff4fa68f-aed1-4e7f-9570-9a61c4cf60bd` (the Netlify CLI is signed in as the user).
- In cloud sessions, develop on the branch named for the session and push there; don't push to `main` or open pull requests unless the user asks.
- Before significant work, confirm push access with `git push --dry-run origin HEAD` (mistake 001).
