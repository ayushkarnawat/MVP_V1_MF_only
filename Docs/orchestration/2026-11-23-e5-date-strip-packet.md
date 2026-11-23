# Packet: E-5 the date strip, logic and look (Batch E, Antigravity)
**Status:** READY TO RELAY (written 2026-11-23). **Approved:** the owner's date decisions of 23 Nov (`decisions.md`, "Dates (E)"): a strip only on Allocation and Other Analytics; Codex's red tests for it are merged on `batch/e-dates` (`7264d596`).
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-e-dates-plan.md` (Tasks E-4/E-5 and the amendments at its end). **Design:** `Docs/orchestration/2026-11-13-batch-e-planning-workbook.html` (section 2, the one-line strip under the tabs; this packet fixes the measurements because the workbook gives pictures only). The tests are the contract: **`frame/stripEntries.test.ts` and `frame/DateStrip.test.tsx` are fixed; you do not edit, weaken or delete them.**
**Worker:** Antigravity (Gemini). Frontend only. **Your clone:** `C:\Users\Dell\ag-e5` (branch `ag/ag-e5`, cut from `batch/e-dates`). Work only there. Never run a git command that changes anything. Never touch `backend/**`.
Read first: `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins), then this file; then the two fixed test files, `frontend/src/lib/dataDates.ts`, and `InfoMark` in `frontend/src/features/mutual-funds/common/SectionCard.tsx`.
**Checks:** `wsl.exe -d Ubuntu -- env UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash "/mnt/c/Users/Dell/ag-e5/Docs/orchestration/wave-fe-check.sh" ag-e5 test src/features/mutual-funds/frame` (also `types`, and `lint src/features/mutual-funds/frame`).

## What to build (two new files in `frontend/src/features/mutual-funds/frame/`)
1. `stripEntries.ts`: exactly the interfaces and words in `Docs/orchestration/2026-11-23-e4-strip-red-tests-handoff.md` (section "The interfaces"; read it, the sentences and labels are fixed there and in the tests). Import the tab id type from **`../types`** (`MfTabId`), **not** from `lib/pageSections` (that file lives on another branch and is not in your clone; the handoff's import line was wrong for this branch).
2. `DateStrip.tsx`: renders to the fixed tests and to this look. Use `InfoMark` from `../common/SectionCard` for both "i" marks (another task rebuilds `InfoMark` as a popover later; you change nothing there).
**Look (tokens only, no hex; every state in light and dark):**
- Wrapper (`data-testid="date-strip"`): `flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] px-4 py-2 text-xs`. One line at 1280 px wide; it wraps below that, nothing overlapping.
- The dates line (`date-strip-line`): `font-medium text-[var(--ui-text-muted)]`; the "i" right after it (12 px gap).
- Each older marker (`date-strip-older`): a pill `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-medium`, text `var(--warn-text)`, background `var(--warn-bg)`, border `color-mix(in srgb, var(--warn) 40%, transparent)` written as the Tailwind arbitrary value `border-[color-mix(in_srgb,var(--warn)_40%,transparent)]`; its "i" follows the label inside the pill. Pushed to the right end of the strip with `ml-auto` when there is room.
- Nothing is a button; the "i" marks are the existing `InfoMark` spans (keyboard focusable already).
- No animation. Spacing above the strip is the page's (`space-y-6`), you add no outer margin.
You cannot see the screen: say so in the report; Claude renders it next to the drawing at 1280x600, 1440x810 and 1536x730, light and dark, and sends exact differences.

## Tests first, then build
The tests exist: run them first and show the failure (missing modules). Then build; they must pass. Also run the whole `src/features/mutual-funds/frame` folder, `types`, and `lint`.

## Files
**Create only:** `stripEntries.ts` and `DateStrip.tsx` (both in `frame/`). **Do not touch:** the two test files, `MutualFundsFrame.tsx` (Claude wires the strip in), `SectionCard.tsx`, `lib/dataDates.ts`, any page or card, `guards.test.ts` (Claude bumps the source-file count by exactly these two files, after the merge), `frontend/src/mobile/**`, `backend/**`, `package.json`, lockfiles. A file outside this list that needs an edit: stop and report it.
Rules: no `any`, `parseFloat`, `toFixed`, `Intl.`, `console.`, no hex colours; features may not import other features; plain words, no em dashes.

## Report (one block)
Lane `ag-e5`; failing counts before and after with the exact commands; `git status --short`; decisions the packet did not cover; anything not checked (visual); open questions. No narration.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-23-e5-date-strip-packet.md (your task: E-5)
Work only in C:\Users\Dell\ag-e5 on branch ag/ag-e5. The two test files stripEntries.test.ts and DateStrip.test.tsx are fixed: run them first (show them fail), then create only stripEntries.ts and DateStrip.tsx so they pass. Import MfTabId from ../types. Never run a git command that changes anything. Reply with the report block from the packet, nothing else.
```
