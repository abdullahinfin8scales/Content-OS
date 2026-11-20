# 007 · Michroma labels, near-black/off-white surfaces, and Content OS as the start page

- **Removed:** 2026-11-20
- **Requested by:** the user

## What it was
- Section labels and the sidebar's "CONTENT OS" subtitle were set in Michroma: wide, tracked, uppercase.
- The UI ran on Inter (body) and JetBrains Mono (mono document font).
- Surfaces were layered near-blacks (`#07080a`, `#0b0c0f`, `#111217`) in dark mode and off-whites (`#f3f3f1`, `#fafaf9`) in light mode. Main text was `#f2f3f5` / `#0b0c0f`, and secondary text was grey (`--fg-2`).
- `#` opened the Content OS Home dashboard.

## Why it was removed
The user merged their Task OS into this app and set the look: "very simple and soft fonts" like their Kendo reference. "When dark the fonts should be complete white, not off white … and the dark should be full black, not grey or light black; same for light: fully white, and font fully black." Only small hints may be grey (their choice).

## What replaced it
- Geist (UI, sans document font) and Geist Mono (mono document font). Labels are soft sentence-case Geist at weight 500.
- Every surface is `#000` / `#fff`. `--fg` and `--fg-2` are pure `#fff` / `#000`; only `--fg-3` and `--fg-4` are grey. Depth comes from hairlines.
- `#` opens **Today** (Personal section). The Content OS dashboard moved to `#content` and is called **Overview** in the sidebar.

## Bringing it back
Only if the user asks. The old tokens and fonts are in commit `ca5db1b` (`src/styles/index.css`, `src/main.tsx`). Keep `--fg-2` pure unless the user changes the text-colour rule.
