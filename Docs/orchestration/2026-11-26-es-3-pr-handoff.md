# Handoff: es-3-pr (PDF export speed, patch 3: the print page's contents-only mode; front end; Codex, lane PR; plan Task ES-3 front-end half)
**Status:** READY TO RELAY (written 2026-11-26). **Approved:** the owner approved the plans on 25 Nov 2026 (QA-19 A: the PDF must look exactly as today, the only allowed visible change is that the contents page numbers appear). **Parent plan:** `Docs/superpowers/plans/2026-11-25-export-speed-plan.md` (**Task ES-3**, "Produces (front end)"; read "Global Constraints", especially the print guards). **Sibling task:** `es-3-be` (back end, `Docs/orchestration/2026-11-26-es-3-be-handoff.md`) calls the hook you add. If the spec, the plan and the code disagree, stop and say so.
**Worker:** Codex, front end only. **It cannot run WSL or Vitest here: write the tests and the code carefully, report BLOCKED on running; Claude runs them through `wave-fe-check.sh` (lane `es-pr`).** **Reviewer and committer:** Claude.
**Work in:** `C:\Users\Dell\lanes\unifolio-es-pr` (worktree, branch `batch/es-pr`, **new**, cut from `patch/qa1`, so it holds the visual pass and the summary bar). Never in the main checkout.
Read first: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## What and why
The server will print the report once, find where each section starts, then print **only the cover and contents pages** again with the page numbers filled in and splice them in front of the first PDF. For that, the print page needs a switch that hides everything except the cover and the contents. **No other style may change** (the contents pages must be the same pages, now with numbers).

## The contract (fixed here)
- `frontend/src/print/PrintReport.tsx`: next to `window.__unifolioSetPrintPages` (in the `declare global` block and the `useEffect` that installs it) add `__unifolioShowContentsOnly?: () => void;` and install it in the same effect: it sets `document.documentElement.dataset.printContentsOnly = "true"`; the effect's cleanup removes **both** hooks (as it does for the first) and also deletes the data attribute. Calling it twice is harmless.
- `frontend/src/print/print.css`: add **one rule block** (and nothing else): `html[data-print-contents-only="true"]` hides, with `display: none !important`, every tab heading (`[data-print-tab]` or whatever attribute the `TabHeading` component renders: read `TabHeading.tsx` and use its real selector), every section (`[data-print-section]`), and the notes page (`[data-print-notes]`); the cover and the contents (`Contents.tsx`'s root) stay. The running header and footer rules stay untouched. **No hex colours** (`print.css` is not one of the token files: the guard forbids hex there).
- The contents page keeps its numbers: `Contents` already takes `page` per entry from the `pages` state that `__unifolioSetPrintPages` fills; **do not change `Contents.tsx`**.

## Wave-start check (report drift, do not fix drift)
`PrintReport.tsx` (the `ReportAssembly` component, the `declare global` block, the `useEffect` installing `__unifolioSetPrintPages`, the markers `<section data-print-section>`, `<div data-print-notes>`, `<TabHeading>`, `<Contents entries={entries} />`); `print.css` (find the existing `@media print` rules and the markers' hiding rule); `print/Contents.tsx` and `TabHeading.tsx`. Frontend guards for `frontend/src/print/**`: no `<button`; no hex or `rgb(` except `print-tokens.css`, `print-runtime.css`, `print-fonts*.css`; no `Intl`, `toFixed`, `console`, `any`; no literal "as on" or "as of"; cross-feature imports only from `mutual-funds/` and `auth/session`. Report any difference.

## Tests first (names fixed by the plan; red for the stated reason)
In `frontend/src/print/` (follow `PrintReport.assembly.test.tsx` for how the report is rendered in a test): `the_hook_is_declared_and_sets_the_flag` (after the report mounts `window.__unifolioShowContentsOnly` is a function; calling it sets `document.documentElement.dataset.printContentsOnly` to `"true"`; unmounting removes the hook and the attribute), `contents_only_mode_hides_sections_tab_headings_and_notes` (jsdom does not apply `@media print`, so assert through the **CSS source**: read `print.css` with `readFileSync(resolve("src/print/print.css"), "utf8")` (never `?raw`) and assert the block exists and lists the real selectors of the tab headings, `[data-print-section]` and `[data-print-notes]` with `display: none`; and assert in the rendered DOM that those elements still exist (they are hidden by CSS, not removed, so the first pass is unaffected)), `contents_only_mode_keeps_cover_and_contents_unchanged` (the rendered DOM of the cover and the contents with and without the flag is identical; the CSS block does not mention the cover or contents roots). **Every existing print test stays green unchanged.**

## Run these only (Claude runs them; you report BLOCKED on running)
Through `wave-fe-check.sh` lane `es-pr`: `wsl.exe -d Ubuntu -- env UNIFOLIO_WT_ROOT=/mnt/c/Users/Dell/lanes UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash <script> es-pr test src/print`. Baseline (Claude, 26 Nov): the print folder passes on `patch/qa1`.

## Files you may touch
`frontend/src/print/PrintReport.tsx`, `frontend/src/print/print.css`, and a new or existing test file under `frontend/src/print/` named for the three tests above. **Do not touch:** `Contents.tsx`, `TabHeading.tsx`, any other component, `backend/**`, any other file.

## Constraints
No new dependency; no hex; no `parseFloat`, `toFixed`, `Intl.`, `console.`, `any`; no new strings shown anywhere; **the printed look must not change in any way except through the new flag**; invented data only; git read-only; no deletion flags or recursive deletes.

## Report format
One fenced block `CODEX REPORT: es-3-pr`: status; baseline HEAD; drift; the real selectors you found for the tab headings; which tests you expect red and why; files changed with a one-line reason each; commands tried and their exact errors; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Front-end worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-26-es-3-pr-handoff.md (your task: es-3-pr, owner-approved)
Open Docs/superpowers/plans/2026-11-25-export-speed-plan.md (Task ES-3) for the context. Work only in C:\Users\Dell\lanes\unifolio-es-pr on branch batch/es-pr. Git is read-only. No deletion flags or recursive deletes. You cannot run WSL or Vitest: write carefully and reply BLOCKED on running them (Claude runs them). Change only the files the handoff lists.
Reply with the CODEX REPORT block from the handoff, nothing else.
```
