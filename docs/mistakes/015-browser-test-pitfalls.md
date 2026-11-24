# 015 · Browser tests that lied

- **Date:** 2026-11-09 → 2026-11-10
- **Area:** testing

## What happened
Several Playwright runs failed or passed for the wrong reasons:
- waiting for an element that already existed on the previous page, so typing started before navigation finished;
- `text=Personal Brand` matched "personal brand" in help text, because `text=` is a case-insensitive substring match;
- Chromium crashed when reading a saved folder handle back from IndexedDB after a reload, but only in Playwright's default incognito-like contexts;
- screenshots taken mid-animation looked broken;
- hovering a sidebar tree item to reveal its buttons hovered the middle of the whole subtree (a child row), so the button never appeared (2026-11-10);
- a long Bash command that started the dev server and wrote the test through a heredoc was refused by the shell safety check, so nothing ran (2026-11-10).

## Rule
- Wait for the state you need (URL change plus focus), not just for an element.
- Use exact text (`text="…"`) in assertions.
- Test folder backups with `chromium.launchPersistentContext(…)`, not `browser.newContext()`.
- Wait out animations (~0.5 s) before screenshots that judge visuals.
- Check the database directly when asserting what was saved.
- Hover the row itself (e.g. `aside a[href^="#space-"]`), not a tree item that contains children.
- Write test scripts with the file-writing tool and keep Bash commands short and separate.
- Pass `exact: true` to `getByRole(…, { name })` and `getByLabel`: names match as substrings by default, so "Loss" also finds "Add a loss" (2026-11-20).
- Several toasts can be open at once: click the Undo inside the toast you mean, not `.first()`.
- Scroll an element into view before using its `boundingBox()` for mouse or touch actions: below the fold, the pointer lands on nothing and the test "passes" a check that never changed anything. Assert the before and the after, so a check can't pass with nothing happening (2026-11-24).
- Screenshots taken mid-drag need a short wait too: rows slide for ~150 ms, and a row hidden behind the dragged one looks missing.

## Where
Playwright test scripts
