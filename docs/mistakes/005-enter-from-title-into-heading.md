# 005 · Enter in the title typed into the template's first heading

- **Date:** 2026-11-09
- **Area:** editor

## What happened
In a document made from a template, pressing Enter in the title and typing put the text inside the "Hook · 0–3s" heading instead of the line below it.

## Why
Focus went to the start of the body, and templates start with a heading.

## Rule
Moving from the title into the body must land on the first empty paragraph after leading headings, or insert a new line at the top (`focusBodyFromTitle`). Test editor behaviour with real templates, not only blank documents.

## Where
`src/editor/DocView.tsx` (`focusBodyFromTitle`, `TitleField`)
