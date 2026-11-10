# 003 · Used the display font for numbers

- **Date:** 2026-11-09
- **Area:** design

## What happened
Stat tiles on Home showed "▢" instead of "0": Michroma (the wide brand display font) draws zero as a rounded box that reads like an empty checkbox.

## Why
Picked the brand font for big numbers without checking its digit shapes.

## Rule
Michroma is only for short uppercase labels (`.label-display`) and brand moments. Numbers use Inter with `tabular-nums`.

## Where
`src/views/HomeView.tsx` (`StatTile`), `src/styles/index.css`
