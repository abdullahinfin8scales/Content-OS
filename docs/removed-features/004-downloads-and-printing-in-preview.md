# 004 · Downloads, printing and pop-up links in the claude.ai preview

- **Removed:** 2026-11-09 (preview build only)
- **Requested by:** the agent, because the host blocks them

## What it was
Export backup (file download), Download .md / .txt, Print / Save as PDF, and `window.open` links.

## Why it was removed
The claude.ai preview sandbox silently blocks downloads, printing and `window.open`, so those buttons did nothing there.

## What replaced it
In the preview: "Copy backup" (clipboard, with a select-and-copy fallback) and real `<a target="_blank">` links. The real app on Netlify keeps every download and print option.

## Bringing it back
They were never removed from the real app. In the preview they stay off while the host blocks them; they are gated by `IS_PREVIEW`.
