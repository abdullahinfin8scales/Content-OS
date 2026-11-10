# 010 · Hacked native control styling with filters

- **Date:** 2026-11-09
- **Area:** design

## What happened
The calendar icon in date and time fields was nearly invisible in dark mode.

## Why
A `filter: invert(1)` hack was applied on top of `color-scheme: dark`, which already draws the icon light, so it was inverted back to dark.

## Rule
Let `color-scheme` style native controls (date/time pickers, scrollbars, checkboxes). Don't invert or recolor them with filters.

## Where
`src/styles/index.css` (theme tokens set `color-scheme`)
