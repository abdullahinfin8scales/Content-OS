# 014 · Dialog autofocus landed on a hidden input

- **Date:** 2026-11-10
- **Area:** UI

## What happened
After Settings was reordered, opening it no longer focused anything useful: the first `input` in the dialog was the hidden file input for Restore.

## Why
The autofocus selector matched any `input`, including hidden and file inputs.

## Rule
Autofocus targets `[data-autofocus]` first, then only visible text fields. When reordering a dialog, check where focus lands.

## Where
`src/components/ui/Modal.tsx`
