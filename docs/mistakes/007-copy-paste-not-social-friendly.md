# 007 · Copied text didn't paste cleanly into social apps

- **Date:** 2026-11-09
- **Area:** editor, export

## What happened
Copying a caption and pasting it into Instagram or LinkedIn added a blank line between every paragraph, and "Copy as plain text" included empty template bullets ("• ").

## Why
ProseMirror's default clipboard text puts blank lines between blocks, and the plain-text converter kept empty list items.

## Rule
Keep the editor's `clipboardTextSerializer` set to `toPlainText` (one line per paragraph, empty list items dropped). Anything that produces text for posting must go through `toPlainText` and be checked by actually pasting.

## Where
`src/editor/DocView.tsx` (`editorProps`), `src/lib/content.ts` (`toPlainText`, `isBlank`)
