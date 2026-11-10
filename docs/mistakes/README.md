# Mistakes log

Mistakes made while building this project, each turned into a rule. Every agent session loads this list automatically through `CLAUDE.md`. Follow these rules; open the linked file for the full story before working in that area.

## Rules

1. **Check push access first.** Run `git push --dry-run origin HEAD` before significant work; if refused, tell the user immediately and keep a downloadable copy of the commits. → [001](001-push-access-not-checked.md)
2. **No demo or sample data** in the user's workspace unless they ask. Guide with empty states instead. → [002](002-demo-content-without-asking.md)
3. **Michroma is for short uppercase labels only.** Numbers use Inter with `tabular-nums` (Michroma's zero looks like an empty box). → [003](003-display-font-for-numbers.md)
4. **Check CSS specificity before broad resets** in `src/styles/index.css`, then look at a template document in a real browser. → [004](004-css-specificity-wiped-heading-spacing.md)
5. **Title → body focus lands on the first empty paragraph** after leading headings (`focusBodyFromTitle`). Test the editor with templates, not just blank docs. → [005](005-enter-from-title-into-heading.md)
6. **TipTap's focus command is async.** Call `editor.view.focus()` synchronously before `editor.commands.focus(...)`. → [006](006-tiptap-focus-is-async.md)
7. **Text for posting goes through `toPlainText`:** one line per paragraph, empty list items dropped; keep the editor's `clipboardTextSerializer`. Verify by pasting. → [007](007-copy-paste-not-social-friendly.md)
8. **Nothing floats over document text.** Editor status lives in the status bar. → [008](008-floating-ui-over-text.md)
9. **Desktop preferences and phone overlays are separate state.** Phone buttons never write desktop preferences. → [009](009-desktop-and-mobile-shared-state.md)
10. **Let `color-scheme` style native controls**; no filter hacks. → [010](010-styling-native-controls.md)
11. **Read a host's constraints before shipping to it** and test in a faithful simulation. Preview-only differences go behind `IS_PREVIEW`; routes stay plain `#name`. → [011](011-host-constraints-not-checked.md)
12. **Never change the app's address** (dev/preview ports, Netlify site name, domain) without an export → restore plan the user agreed to. Data is stored per address. → [012](012-data-tied-to-address.md)
13. **One home for real posts:** https://infin8-content-os.netlify.app. Any other build must say so loudly or be removed. → [013](013-two-homes-for-data.md)
14. **Dialog autofocus skips hidden and file inputs;** check focus after reordering a dialog. → [014](014-autofocus-hit-hidden-input.md)
15. **Browser tests:** wait for real state (URL + focus), assert exact text, use `launchPersistentContext` for folder-backup tests, wait out animations before screenshots, check the database for saved data. → [015](015-browser-test-pitfalls.md)

## Adding a mistake

Add an entry in the same session whenever you ship a bug, act on a wrong assumption, or the user has to correct you:

1. Copy `_template.md` to the next number, e.g. `016-short-title.md`.
2. Fill in what happened, why, the rule, and where.
3. Add the rule as one line to the list above, in the same style.
4. Commit it with the fix.

Keep rules short and specific. If a new mistake repeats an old one, update the old entry instead of adding a duplicate, and make its rule sharper.
