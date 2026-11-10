# 004 · An over-specific CSS reset wiped heading spacing

- **Date:** 2026-11-09
- **Area:** editor, design

## What happened
Headings in documents had no space above them, so template sections ran together.

## Why
`.prose-editor .ProseMirror > * + * { margin-top: 0 }` has higher specificity than `.prose-editor h2 { margin: … }`, so it silently zeroed every heading's top margin.

## Rule
Before adding broad resets in `src/styles/index.css`, check what they outrank. After editor CSS changes, look at a template document (headings + lists) in a real browser.

## Where
`src/styles/index.css` (editor section)
