# 008 · Floated UI over the writing area

- **Date:** 2026-11-09
- **Area:** design, editor

## What happened
A floating word-count pill sat on top of the document and covered the text being written.

## Why
Put a status element in an absolutely positioned overlay instead of giving it its own space in the layout.

## Rule
Nothing floats over document text. Editor status (save state, words, characters, spoken time) lives in the status bar under the editor.

## Where
`src/editor/DocView.tsx` (`StatusBar`)
