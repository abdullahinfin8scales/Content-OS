# 011 · Built for a host without reading its rules first

- **Date:** 2026-11-09
- **Area:** delivery

## What happened
The claude.ai preview needed rework: it wraps the page in its own HTML, blocks file downloads, printing and `window.open`, and only passes plain `#name` links, so `#/doc/…` routes, Export and Print didn't work there.

## Why
Started packaging before reading the host's constraints.

## Rule
Before shipping to any host (claude.ai preview, Netlify, anything new), read its constraints and test in a faithful simulation. Preview-only differences are gated by `IS_PREVIEW`; routes stay plain `#name` hashes.

## Where
`src/lib/env.ts`, `src/lib/router.ts`, `scripts/build-preview.mjs`
