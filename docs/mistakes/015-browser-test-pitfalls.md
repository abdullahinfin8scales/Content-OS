# 015 · Browser tests that lied

- **Date:** 2026-11-09 → 2026-11-10
- **Area:** testing

## What happened
Several Playwright runs failed or passed for the wrong reasons:
- waiting for an element that already existed on the previous page, so typing started before navigation finished;
- `text=Personal Brand` matched "personal brand" in help text, because `text=` is a case-insensitive substring match;
- Chromium crashed when reading a saved folder handle back from IndexedDB after a reload, but only in Playwright's default incognito-like contexts;
- screenshots taken mid-animation looked broken.

## Rule
- Wait for the state you need (URL change plus focus), not just for an element.
- Use exact text (`text="…"`) in assertions.
- Test folder backups with `chromium.launchPersistentContext(…)`, not `browser.newContext()`.
- Wait out animations (~0.5 s) before screenshots that judge visuals.
- Check the database directly when asserting what was saved.

## Where
Playwright test scripts
