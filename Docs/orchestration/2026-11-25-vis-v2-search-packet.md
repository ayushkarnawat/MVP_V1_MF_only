# Packet VIS-V2: the search box (an empty-state hint and no doubled badge) (Antigravity)
**The visual pass, Task 3 (lane V2).** The red tests are written and committed (`vis-rt-1`) and `EMPTY_SEARCH_HINT` exists; you make the red tests pass and change nothing else. **Spec (the design):** `Docs/orchestration/2026-11-24-head-of-family-d11-plan.html` (page version 16), items **4 · D-3** and **5 · D-4** (the before and after mockups). Plan: `Docs/superpowers/plans/2026-11-25-visual-pass-plan.md` (Task 3).

**Your clone:** `C:\Users\Dell\ag-vis2` (branch `ag/vis2-search`, cut from `batch/vis` after `vis-rt-1` merged). Work only there. Never edit anything outside it. Never run a git command that changes anything.
**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), `Docs/orchestration/2026-11-18-palette-reference-for-workers.md`, then this packet.

## The owner's decisions (25 Nov 2026) that bind this task
- **D-3 (QA-3 A):** the first time the search box opens, there is no empty white strip: show the hint `Try a fund, a member or a page` while there are no recents and nothing is typed. It disappears as soon as any recent exists or a character is typed.
- **D-4:** the "Switches to NAME" wording is drawn **once**: the row's tag stays; the hover and selection hint is not drawn when it would repeat the tag. **No wording changes anywhere**: the tags (`buildResults.ts`) and the `getRowHint` return values stay exactly as they are (`Coming soon`, `Go`, `Filter`, `Switches to ...`).

## The data (what the box shows today)
`PageSearch.tsx` renders a drop-down shell (`data-testid="search-dropdown"`) whenever the box is open. With nothing typed, `buildResults` returns an empty list unless there are recent funds, and the "Recent searches" group shows only if there are recent searches: on first use nothing renders inside the padded shell, hence the empty strip. Each result row draws its `row.tag` (a small bordered chip) and, on hover or selection, a hint from `getRowHint(row)`. For a member result the tag and the hint are both `Switches to NAME`; for a fund result with a `switchTo` they are also both `Switches to LABEL`.

## Exact edits (one file: `frontend/src/components/search/PageSearch.tsx`; everything else stays)
1. **Import** `EMPTY_SEARCH_HINT` from `./searchCopy`.
2. **Compute** next to `hasDraft` (about L116) and after `groups` (about L118): `const showEmptyHint = !hasDraft && groups.length === 0 && recents.searches.length === 0;`.
3. **Render the hint** inside the drop-down shell, **after the closing tag of the listbox element** (`<div id={listboxId} role="listbox" ...>`) and before the existing "no results" and error blocks (about L528): 
   `{showEmptyHint && (<div data-testid="search-empty-hint" className="px-2 py-2 text-xs text-[var(--ui-text-muted)]">{EMPTY_SEARCH_HINT}</div>)}`. It is **not** `role="option"`, it is **not** inside the listbox, and it is **not** counted by the live region (`data-testid="search-live"` keeps saying "0 results"). Keep the shell's padding and border as they are.
4. **Hide the repeated hint:** at the row's hint span (about L463-470), the condition `{showHint && (` becomes `{showHint && getRowHint(row) !== row.tag && (`.
**Do not touch:** `buildResults.ts` and its tests, `getRowHint`, `searchCopy.ts`, any `*.test.*` file, any other file, `backend/**`, `frontend/src/mobile/**`.

## States (what must be true, light and dark; Claude screenshots these)
| State | What renders |
|---|---|
| First open, no recents, nothing typed | the shell with the muted hint line `Try a fund, a member or a page`; no listbox rows |
| Open, there are recent funds or recent searches, nothing typed | the usual recent groups; **no** hint |
| A character typed | results or the existing "no results" line; **no** hint |
| Hover or arrow-select a member result | the row shows its tag `Switches to NAME` once; **no** hint element for that row |
| Hover or select a fund result that switches member | the tag `Switches to LABEL` once; no hint element |
| Hover or select a fund result that does not switch member | the tag (`open` or `sold`) and the hint (`Go`, or `Coming soon` for a sold or disabled fund): unchanged |
| Hover or select a filter row | the hint `Filter`: unchanged |
| Keyboard: arrows, Home, End, Enter, Escape | unchanged; the hint is never in the arrow order |
| Dark mode | the hint uses `--ui-text-muted`: readable on `--ui-elevated` |
| Jump-only pages (where the box only jumps) | the same shell and rules; the hint shows under the same three conditions |

## Checks (PowerShell)
```
wsl.exe -d Ubuntu -- env UNIFOLIO_WT_ROOT=/mnt/c/Users/Dell/lanes UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash /mnt/c/Users/Dell/ag-vis2/Docs/orchestration/wave-fe-check.sh ag-vis2 test src/components/search
wsl.exe -d Ubuntu -- env UNIFOLIO_WT_ROOT=/mnt/c/Users/Dell/lanes UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash /mnt/c/Users/Dell/ag-vis2/Docs/orchestration/wave-fe-check.sh ag-vis2 types
wsl.exe -d Ubuntu -- env UNIFOLIO_WT_ROOT=/mnt/c/Users/Dell/lanes UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash /mnt/c/Users/Dell/ag-vis2/Docs/orchestration/wave-fe-check.sh ag-vis2 lint src/components/search
```
The `components/search` folder includes `noFeatureImports.test.ts`: it must still pass. Other lanes' red tests may still fail in a full run: report them, do not fix them. If WSL is denied, use `npx vitest run src/components/search`, `npx tsc -b`, `npx oxlint src/components/search` in PowerShell inside the clone.

## Done means
Every test in `src/components/search` is green (the seven new tests, the updated `it.each` hints and the updated keyboard test included); `types` and `lint` clean; `git status --short` shows only `PageSearch.tsx` (plus untracked docs); no string was added or changed in this file (the hint comes from the constants file).

## Report (one block, nothing else)
Failing counts before and after; the exact commands and results; `git status --short`; decisions the packet did not cover; anything you could not check (visual); Open questions.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-palette-reference-for-workers.md
4. Docs/orchestration/2026-11-25-vis-v2-search-packet.md (your task: VIS-V2)
Work only in C:\Users\Dell\ag-vis2 on branch ag/vis2-search. Tests first: run the named test files and confirm the failing counts before you change anything. Never run a git command that changes anything. Do not touch backend/**, frontend/src/mobile/**, any *.test.* file, or any file outside the packet's list. Use no wording of your own: every string comes from the constants file. Reply with the report block from the packet, nothing else.
```
