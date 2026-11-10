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

- A private, local-first writing and archive space for one creator's social media content, on one laptop. The UI follows the infin8scale identity: monochrome, dark-first; brand colours will come from the user later.
- Stack: React 19, Vite 8, TypeScript 5.9, Tailwind CSS 4, TipTap 3 (editor), Dexie 4 (IndexedDB), Zustand, Vitest.
- Live app: https://infin8-content-os.netlify.app (Netlify site `infin8-content-os`, id `ff4fa68f-aed1-4e7f-9570-9a61c4cf60bd`).
- The user's posts live only in their browser at that address; nothing is uploaded. Safety comes from automatic folder backups (`src/state/backup.ts`) and JSON export/restore.
- The app starts empty. No sample data, ever (mistake 002).

## Commands

- `npm install`, then `npm run dev` (http://localhost:5173, fixed port)
- `npm test`: unit tests for the data layer, text conversion, backups and routing
- `npm run build`: type-check plus production build into `dist/`
- `npm run build:preview`: single-file build for the claude.ai preview page

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
- `src/lib/env.ts`: `IS_PREVIEW` gates claude.ai-preview differences; `LIVE_URL` is the permanent address.
- `public/_headers`: security headers and caching for Netlify.

## Git

- Develop on the branch named for the session and push there; don't push to `main` or open pull requests unless the user asks.
- Before significant work, confirm push access with `git push --dry-run origin HEAD` (mistake 001).
