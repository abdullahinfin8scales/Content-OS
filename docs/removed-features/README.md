# Removed features

Features taken out of the app, and why. Every agent session loads this list automatically through `CLAUDE.md`. **Don't bring any of these back unless the user asks**; if they do, read the entry first.

| # | Removed | What | Why | Replaced by |
| --- | --- | --- | --- | --- |
| [001](001-starter-content.md) | 2026-11-10 | Starter content on first run (demo space, folders, welcome note) | The user wants a clean workspace with only their own data | Guided empty state on Home |
| [002](002-floating-word-count-and-header-save-state.md) | 2026-11-09 | Floating word-count pill and top-bar "Saved" dot | The pill covered the text being written | Status bar under the editor |
| [003](003-static-privacy-line.md) | 2026-11-09 | Static "Private · stored on this device" sidebar line | Gave a false sense of safety | Live backup status line |
| [004](004-downloads-and-printing-in-preview.md) | 2026-11-09 | Downloads, printing and pop-up links (claude.ai preview only) | The preview sandbox blocks them | "Copy backup" and normal links; the real app keeps them all |
| [005](005-slash-path-links.md) | 2026-11-09 | `#/doc/<id>` style links | Hosts only pass plain `#name` hashes | `#doc-<id>` links (old ones still open) |
| [006](006-dashboard-on-empty-workspace.md) | 2026-11-10 | Full dashboard on an empty workspace | Rows of zeros on the first screen | First-space form and "How it fits together" until the first document exists |

## Adding an entry

Whenever a feature is removed or hidden, in the same session:

1. Copy `_template.md` to the next number, e.g. `007-short-name.md`.
2. Fill in what it was, why it was removed (the user's words if they asked), what replaced it, and how to bring it back safely.
3. Add a row to the table above.
4. Commit it together with the removal.
