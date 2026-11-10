# 002 · Added demo content to the user's workspace without asking

- **Date:** 2026-11-10
- **Area:** product

## What happened
First run created a "Personal Brand" space, three folders and a pinned welcome note. The user asked for all of it to be removed: they want to start from a clean workspace.

## Why
Assumed sample content helps onboarding. For a personal archive, anything the user didn't create is clutter to delete.

## Rule
Never put sample or demo data into the user's workspace unless they ask for it. Guide with empty states instead (see Home's first-run form).

## Where
`src/main.tsx` (seeding removed), `src/views/HomeView.tsx` (`FirstSpace`, `HowItWorks`)
