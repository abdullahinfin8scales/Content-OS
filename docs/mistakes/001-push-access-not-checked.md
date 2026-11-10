# 001 · Didn't check GitHub push access before building

- **Date:** 2026-11-09
- **Area:** delivery

## What happened
A whole session of work was committed locally, and only then did `git push` fail with HTTP 403: the Claude GitHub App had no write access to `abdullahinfin8scales/Content-OS`. The work existed only in a temporary cloud container and a downloaded zip.

## Why
Push access was tested at the end instead of the start. Reading the repo worked (`git ls-remote`), which hid the problem.

## Rule
Before significant work, run `git push --dry-run origin HEAD`. If it is refused, tell the user straight away with the fix (install the Claude GitHub App on the repo / reconnect GitHub), and keep a downloadable copy of every commit until the push succeeds.

## Where
`git push`, `git ls-remote`
