# 012 · Near miss: changing the app's address strands the user's data

- **Date:** 2026-11-09
- **Area:** data

## What happened
Not a shipped bug, but a trap: the browser stores everything per address (origin). A dev server that drifts to another port, a renamed Netlify site or a new domain opens an empty app, which looks exactly like lost posts.

## Why
Local-first storage in IndexedDB is scoped to the exact origin.

## Rule
Never change the dev/preview ports (they use `--strictPort`), the Netlify site name or its domain unless the user agrees to a move plan: export a backup at the old address, restore it at the new one.

## Where
`package.json` scripts, Netlify site `infin8-content-os`
