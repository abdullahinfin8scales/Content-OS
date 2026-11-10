# 016 · A new kind of folder leaked into the defaults

- **Date:** 2026-11-10
- **Area:** data, navigation

## What happened
Threads were added as a special folder (`kind: 'thread'`). Opening a post inside a thread remembered the thread as "where you were", so the next **New document** would have been created inside the thread as an extra post. The Move dialog also offered threads as destinations for folders, which the data layer then refused with an error. Both were caught in the browser test before release.

## Why
Every place that picks a destination (the remembered location, location pickers, drag-and-drop targets) was written when all folders were alike. The new folder type changed the rules, but only the data layer and the sidebar drop target were updated.

## Rule
When adding a new kind of container, audit every place that chooses a destination: `defaultLocation`/`rememberLocation`, `locationOptions` (Move and New document dialogs), sidebar `dropInto`, and `repo` create/move. A thread is never a default location; only documents can go inside one.

## Where
`src/state/actions.ts` (`defaultLocation`), `src/components/dialogs/locations.ts`, `src/components/sidebar/Sidebar.tsx` (`dropInto`), `src/lib/repo.ts`
