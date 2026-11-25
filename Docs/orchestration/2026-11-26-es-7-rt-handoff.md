# Handoff: es-7-rt (PDF export, patch 3: honest progress in the dialog; foundation and red tests; Codex, lane RT, FE-1a; plan Task ES-7)
**Status:** READY TO RELAY (written 2026-11-26). **Approved:** the owner approved the plans on 25 Nov 2026 (**QA-20 A**: honest progress). **Parent plan:** `Docs/superpowers/plans/2026-11-25-export-speed-plan.md` (**Task ES-7**; read "Global Constraints", especially the export dialog guard and the proposed strings). **Spec:** `Docs/orchestration/2026-11-24-head-of-family-d11-plan.html` (page version 16, item 10, the progress mockup). If the spec, the plan and the code disagree, stop and say so.
**Worker:** Codex, front-end foundation only: two small type additions, one pure helper, the hook's elapsed time, and **every red test of this front end**. It does **not** edit `ExportDialog.tsx` (an Antigravity lane builds the view from a packet). **It cannot run WSL or Vitest here: write the tests and code carefully, report BLOCKED on running; Claude runs them through `wave-fe-check.sh` (lane `es7`).** **Reviewer and committer:** Claude.
**Work in:** `C:\Users\Dell\lanes\unifolio-es7` (worktree, branch `batch/es7`, **new**, cut from `patch/qa2`; Claude creates it). Never in the main checkout.
Read first: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## What and why
On staging a full 24-section report takes minutes and the dialog only says "This can take about a minute" with a fixed percent per stage. Honest progress: show the real **elapsed time** while preparing (it keeps counting after the dialog is closed and reopened, because the job keeps running), name the final stage plainly (**"Finishing the PDF"**) and tell the person that a full report can take a few minutes. Nothing else about the dialog changes: the buttons (`Cancel`, `Run in background`) and their callbacks stay exactly as they are.

## Wave-start check (Claude read these on 26 Nov; report drift, do not fix drift)
`frontend/src/features/export/api.ts`: `ExportJobStatus { job_id, status, stage: "collecting"|"building"|"finishing", sections_total, scope_kind, error_code, pdf_bytes }` (the server **already sends `created_at`**, an ISO string, in the status JSON: confirm in `backend/app/services/export/jobs.py`/`api/export.py`; do not change the back end). `useExportJob.ts` (89 lines): `State = "idle"|"preparing"|"ready"|"failed"`, `stage` state, `total`, the 2-second poll `schedule()`/`poll()`, `formatExportSize` (exported pure helper, the pattern to follow), the returned `{ state, progress: { subtitle, percent, rows }, ready, failed }`. `exportTypes.ts`: `ExportDialogProps.progress: { subtitle: string; percent: number; rows: StageRow[] }`. `ExportDialog.tsx` preparing view ~L509-592 (the footer sentence `This can take about a minute. You can keep using Unifolio. Nothing is stored on our servers.`, the `Cancel` and `Run in background` buttons). Guards in `features/export/export.guard.test.ts`: hex only in `export-tokens.css`; every `<button` has `data-clickable` and a `data-effect` in {open, close, select, expand, retry, start, download}; `fetch(` only in `api.ts` and `useExportJob.ts`; no `Intl`, `toFixed`, `console`, `any`.

## The contract (fixed here; Antigravity builds the dialog to it)
```ts
// api.ts
export interface ExportJobStatus { ...existing fields; created_at: string }          // ISO timestamp the server already sends
// useExportJob.ts (beside formatExportSize)
export function formatElapsed(seconds: number): string
//   seconds < 60  -> `${s} s so far`           (0 -> "0 s so far", 45 -> "45 s so far")
//   seconds >= 60 -> `${m} min ${s} s so far`  (60 -> "1 min 0 s so far", 130 -> "2 min 10 s so far")
//   negative, NaN or non-integer input is clamped to a whole number of seconds >= 0; never uses Intl or toFixed
export const EXPORT_STAGE_FINISHING = "Finishing the PDF";                           // owner confirms before merge
export const EXPORT_LONG_NOTE = "A full report with all 24 sections can take a few minutes. You can keep using Unifolio; it will be ready to download here.";   // owner confirms before merge
export const EXPORT_LONG_NOTE_MIN_SECTIONS = 20;                                     // the note is shown only for large reports
// exportTypes.ts: ExportDialogProps.progress gains two OPTIONAL fields so existing tests keep compiling:
//   progress: { subtitle: string; percent: number; rows: StageRow[]; elapsed?: string; stageLine?: string | null; longNote?: string | null }
// useExportJob() returns progress with: elapsed = formatElapsed(elapsedSeconds) while state === "preparing" (else undefined),
//   stageLine = EXPORT_STAGE_FINISHING while stage === "finishing" and state === "preparing" (else null),
//   longNote = EXPORT_LONG_NOTE while state === "preparing" and total >= EXPORT_LONG_NOTE_MIN_SECTIONS (else null)
```
**Elapsed time rule:** `elapsedSeconds` = `Math.max(0, Math.floor((Date.now() - Date.parse(createdAt)) / 1000))` where `createdAt` is the `created_at` of the **first status the hook reads** (kept in state; before the first status arrives, start from the moment `start()` was called, so the number never jumps back). It is recomputed from the clock **once per second while `state === "preparing"`** (an interval inside the hook, cleared on unmount, on cancel, on failure and when ready) and **keeps counting when the dialog is closed and reopened**, because the hook lives in `ExportHost` and the job keeps running. A job resumed after a reload or after a 409 `export_in_progress` (the hook adopts the running job id) uses that job's `created_at`, so the time is the job's real age. **The "Dialog" test ids (for the Antigravity lane to render):** `export-elapsed`, `export-stage-line`, `export-long-note`. **Existing strings stay**: the built footer sentence in the dialog is **not** replaced (the owner has not confirmed the proposed replacement); `EXPORT_LONG_NOTE` is shown as **an addition** under it while preparing.

## Tests first (names fixed by the plan, plus the helper's; red for the stated reason)
In `features/export/useExportJob.test.tsx` (follow its fake timers and mocks of `./api`; make `getExportStatus` return `created_at` values): `shows_the_elapsed_time_while_preparing` (a job created 130 s before the first status: `progress.elapsed` is `2 min 10 s so far`; after 5 s of fake time it is `2 min 15 s so far`), `elapsed_time_keeps_counting_after_the_dialog_is_reopened` (the hook keeps running while a consumer "closes and reopens": the elapsed value continues from the job's age, not from zero), `stage_line_names_the_finishing_stage_only_while_finishing` (`progress.stageLine` is `Finishing the PDF` only for stage `finishing`), `long_note_only_for_large_reports_and_only_while_preparing` (total 24 gives the note; total 5 and state ready and state failed give null), `elapsed_clears_when_ready_failed_or_cancelled`. A new small pure-function test file `features/export/formatElapsed.test.ts`: `formats_minutes_and_seconds_without_Intl` (0, 1, 45, 59, 60, 61, 130, 3600, a negative number, NaN, 12.9: whole seconds, the exact words above), plus `the_module_does_not_use_Intl_or_toFixed` is **already covered by the guard**: do not duplicate it. In `features/export/ExportDialog.stages.test.tsx` (the dialog tests, **red until the Antigravity lane builds the view**; render the dialog with `progress={{ ..., elapsed: "2 min 10 s so far", stageLine: "Finishing the PDF", longNote: EXPORT_LONG_NOTE }}` and `stage="preparing"`): `shows_the_elapsed_time_while_preparing` (the element `export-elapsed` shows `2 min 10 s so far`), `shows_the_finishing_stage_line` (`export-stage-line` shows `Finishing the PDF`), `shows_the_long_note_only_while_preparing` (`export-long-note` present while preparing; absent in `choose`, `ready` and `failed`; and absent when `longNote` is null), `buttons_and_their_callbacks_are_unchanged` (`Cancel` calls `onCancel`, `Run in background` calls `onKeepWorking`; both keep `data-clickable` and `data-effect="close"`; the built footer sentence is still there). **The existing tests stay green unchanged** (the new progress fields are optional).
**Report, for each existing test you touch, what it pinned and what you changed (expected: none).**

## Run these only (Claude runs them; you report BLOCKED on running)
Through `wave-fe-check.sh` lane `es7`: `wsl.exe -d Ubuntu -- env UNIFOLIO_WT_ROOT=/mnt/c/Users/Dell/lanes UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash <script> es7 test src/features/export`. Baseline: Claude records it before relaying. Expected after your work: the hook, the helper and the api tests green; the four dialog tests red until the lane builds the view; everything else passes.

## Files you may touch
`frontend/src/features/export/api.ts` (only `created_at` on `ExportJobStatus`), `useExportJob.ts` (the helper, the three constants, the elapsed interval and the three progress fields), `exportTypes.ts` (only the three optional fields), `useExportJob.test.tsx`, `ExportDialog.stages.test.tsx`, `formatElapsed.test.ts` (new). **Do not touch:** `ExportDialog.tsx`, `ExportHost.tsx`, `export-tokens.css`, `backend/**`, any other file.

## Constraints
No new dependency; no hex; no `parseFloat`, `toFixed`, `Intl.`, `console.`, `any`; **no em dashes in new strings; no emojis**; invented data only; git read-only; no deletion flags or recursive deletes. Tests first; red test files are fixed once written.

## Report format
One fenced block `CODEX REPORT: es-7-rt`: status (DONE, PARTIAL or BLOCKED); baseline HEAD; drift (including whether the server sends `created_at`); which tests you expect red and why; files changed with a one-line reason each; commands tried and their exact errors; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Front-end foundation worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-26-es-7-rt-handoff.md (your task: es-7-rt, owner-approved)
Open Docs/superpowers/plans/2026-11-25-export-speed-plan.md (Task ES-7) for the context. Work only in C:\Users\Dell\lanes\unifolio-es7 on branch batch/es7. Git is read-only. No deletion flags or recursive deletes. You write one pure helper, three constants, the hook's elapsed time and the red tests; you edit no component and no CSS. You cannot run WSL or Vitest: write carefully and reply BLOCKED on running them (Claude runs them). Change only the files the handoff lists.
Reply with the CODEX REPORT block from the handoff, nothing else.
```
