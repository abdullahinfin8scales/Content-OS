# 003 · Used the display font for numbers

- **Date:** 2026-11-09 (rule updated 2026-11-20)
- **Area:** design

## What happened
Stat tiles on Home showed "▢" instead of "0": Michroma (the wide brand display font of the time) drew zero as a rounded box that read like an empty checkbox.

## Why
Picked the brand font for big numbers without checking its digit shapes.

## Rule
Check a font's digits before using it for numbers. Numbers and times use Geist with `tabular-nums` (Michroma is no longer used; see removed feature 007). Times are shown with `clockLabel`, which follows the locale's 12- or 24-hour clock.

## Where
`src/views/HomeView.tsx` (`StatTile`), `src/styles/index.css`, `src/lib/personalText.ts`
