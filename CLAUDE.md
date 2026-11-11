# Infin8 Content OS — instructions for agents

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

- A private writing and archive space for one creator's social media content. The UI follows the infin8scale identity: monochrome, dark-first; brand colours will come from the user later.
- Stack: React 19, Vite 8, TypeScript 5.9, Tailwind CSS 4, TipTap 3 (editor), Dexie 4 (IndexedDB), Zustand, Supabase (auth + cloud copy), Vitest.
- Live app: https://infin8-content-os.netlify.app (Netlify site `infin8-content-os`, id `ff4fa68f-aed1-4e7f-9570-9a61c4cf60bd`).
- Accounts: email + password, no email confirmation. Sign-up stays open by the user's choice ("keep it simple; if someone signs up, they just get their own space"); row-level security gives every account its own empty workspace. Don't lock sign-up or add hardening unless the user asks.
- Data: local-first. The browser's IndexedDB is the working copy (fast, works offline); every change is synced to the owner's Supabase account in the background. Extra safety: automatic folder backups (`src/state/backup.ts`) and JSON export/restore. The free Supabase plan has no automatic backups and pauses after 7 days without use.
- The app starts empty. No sample data, ever (mistake 002).

## Cloud sync and accounts

- `supabase/migrations/`: the database. One `records` table (kind, id, data jsonb, deleted, updated_at, server_updated_at), owner-only row-level security, and two functions: `push_records` (last write wins; returns the server's row when it kept a newer one) and `pull_records` (keyset pages). Change the schema only with a new migration file, applied to both projects.
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

- `src/lib/repo.ts`: every data write (cascading trash, folder moves, no folder cycles). Change data rules here and in `tests/`.
- `src/lib/content.ts`: rich text → plain text and Markdown (`toPlainText` is what gets posted).
- `src/state/`: workspace live query, UI and settings stores, actions, automatic backup.
- `src/editor/`: document page, toolbar, details panel, teleprompter.
- `src/views/`: home, library/space/folder, pipeline, calendar, trash.
- `src/styles/index.css`: colour tokens (dark on `:root`, light via media query and `data-theme`) and editor typography.
- `src/lib/env.ts`: `IS_PREVIEW` gates claude.ai-preview differences; `LIVE_URL` is the permanent address; `SYNC_ENABLED` turns accounts and sync on when Supabase is configured.
- `public/_headers`: security headers and caching for Netlify.

## Git

- Develop on the branch named for the session and push there; don't push to `main` or open pull requests unless the user asks.
- Before significant work, confirm push access with `git push --dry-run origin HEAD` (mistake 001).
