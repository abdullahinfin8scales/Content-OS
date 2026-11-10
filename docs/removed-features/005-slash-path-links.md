# 005 · `#/doc/<id>` style links

- **Removed:** 2026-11-09
- **Requested by:** the agent, because the claude.ai host only passes plain `#name` hashes

## What it was
Routes such as `#/doc/abc`, `#/library`.

## Why it was removed
Hosts like the claude.ai preview drop anything but a plain `#name` from the link, so deep links broke there.

## What replaced it
Plain hashes: `#doc-<id>`, `#space-<id>`, `#folder-<id>`, `#library`, `#pipeline`, `#calendar`, `#trash`. Old `#/…` links still open thanks to legacy parsing in `src/lib/router.ts` (covered by `tests/router.test.ts`).

## Bringing it back
No reason to.
