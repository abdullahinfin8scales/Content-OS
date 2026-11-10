# 006 · Assumed TipTap's focus command is immediate

- **Date:** 2026-11-09
- **Area:** editor

## What happened
Letters typed right after pressing Enter in the title still landed in the title.

## Why
`editor.commands.focus()` moves DOM focus on the next animation frame, so fast keystrokes go to the old field.

## Rule
When handing focus to the editor from another field, call `editor.view.focus()` synchronously first, then `editor.commands.focus(position)`.

## Where
`src/editor/DocView.tsx` (`focusBodyFromTitle`)
