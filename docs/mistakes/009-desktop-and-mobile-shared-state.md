# 009 · Desktop and mobile shared one persisted setting

- **Date:** 2026-11-09
- **Area:** layout

## What happened
On phones the Details panel opened over every document by itself, and the phone's "close sidebar" button hid the sidebar on the desktop later.

## Why
One saved preference (`detailsOpen`, `sidebarHidden`) controlled both the desktop docked layout and the phone overlay.

## Rule
Keep desktop preferences (saved) separate from phone overlay state (temporary). On phones, buttons only open or close the overlay; they never write desktop preferences.

## Where
`src/editor/DocView.tsx` (`wide`, `overlayDetails`), `src/components/sidebar/Sidebar.tsx`, `src/state/ui.ts`
