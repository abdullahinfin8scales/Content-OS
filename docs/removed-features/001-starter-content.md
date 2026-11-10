# 001 · Starter content on first run

- **Removed:** 2026-11-10
- **Requested by:** the user ("remove all the demo data and make the application clean from any data")

## What it was
On the first visit the app created a "Personal Brand" space, the folders Ideas, Scripts and Published, and a pinned "Welcome to your Content OS" note explaining the app (`repo.seedIfEmpty()` called from `src/main.tsx`, content in `welcomeContent()` in `src/lib/templates.ts`).

## Why it was removed
The user wants a clean workspace that contains only what they create.

## What replaced it
A guided empty state on Home: an inline "Create your first space" form, a short "How it fits together" explainer, and space-then-document chaining (choosing a template before any space exists asks for the space, then opens the document).

## Bringing it back
Only if the user asks, and never automatically: offer an explicit "Load sample workspace" action instead. The removed code is in commit `a3a39d3` and earlier.
