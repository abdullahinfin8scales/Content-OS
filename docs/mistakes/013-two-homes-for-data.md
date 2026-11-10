# 013 · Gave the user two places to write

- **Date:** 2026-11-10
- **Area:** product, data

## What happened
After the Netlify app went live, the older claude.ai preview still looked like a working app. Anything typed there stays in that sandbox's storage, which is not backed up and not part of the real workspace.

## Why
Kept a preview build alive without making clear it was not the real home for posts.

## Rule
There is one home for the user's posts: https://infin8-content-os.netlify.app. Any other build must say so loudly (the preview has a banner linking to the live app) or be removed.

## Where
`src/App.tsx` (preview banner), `src/lib/env.ts` (`LIVE_URL`)
