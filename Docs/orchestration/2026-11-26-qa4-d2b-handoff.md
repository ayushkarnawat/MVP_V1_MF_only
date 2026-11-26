# Handoff: qa4-d2b (remove the CAMS "waiting" page; tests first, then the change; Codex; patch/qa4)
**Status:** READY TO RELAY (written 2026-11-26). **Approved:** the owner confirmed on 26 Nov 2026 that "the upload page as before" is the `UploadForm` card ("Upload your statement") and asked for the handoff; **Cancel request is dropped** (owner yes, 26 Nov 2026).
**Design note (the spec, read it fully):** `Docs/orchestration/2026-11-26-d2b-remove-waiting-page-design-note.md`. Evidence: `Docs/orchestration/2026-11-26-qa-round-report.md`, defect D-2.
**Worker:** Codex. You write tests **first**, then make the change. You cannot run WSL or Vitest here: write carefully, report BLOCKED on running, and Claude runs them through `wave-fe-check.sh` lane `qa4`.
**Work in:** `C:\Users\Dell\lanes\unifolio-qa4` (worktree, branch `patch/qa4`, **new**, cut from `leapswitch-redesign` at `613f07f1`). Never in the main checkout. Git is read-only: Claude commits.
Read first: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then the design note, then this file.

## What and why
After "Request Statement on CAMS" the owner must land on the **upload card** (`UploadForm`, "Upload your statement"), with the floating checklist still open, and a member with an open request must open on that same card. The built flow shows a "waiting" view instead (`CamsWaitingCard` plus `WaitingForCasView`). Remove it.

## The contract (all in `frontend/src/features/import/`)
1. `TwoPathImportContainer.tsx`:
   - `handleRequestInitiated` sets `view` to `"upload"` (not `"waiting"`). Keep `setLocalRequest`, `setCasResumeStep2(memberId)` and `void pendingReq.refresh()`.
   - `effectiveView`: when `view` is null, a pending request (`pendingReq.status === "waiting"`) gives `"upload"` (not `"waiting"`); loading stays `"loading"`; otherwise `"choice"`.
   - `defaultTab === "waiting"` (used by callers) maps to `"upload"`: grep callers of `defaultTab` and keep them working; if nothing passes `"waiting"` any more, remove it from the `ImportView` and `defaultTab` types.
   - Remove the `waiting` render branch, the imports and use of `CamsWaitingCard`, `WaitingForCasView`, `cancelImportRequest`, `handleCancel`, `uploadOpen` state, `localRequest`/`activeRequest` **only if nothing else uses them** (the upload still closes the request on the server by member, so no client request id is needed). Keep `usePendingCamsRequest` (it picks the first screen).
   - The `"upload"` view must keep its Back button (`showView("choice")`); Back does **not** cancel anything. Make sure Back from the upload card shows the choice screen and does not bounce straight back to upload because of the pending request (an explicit `view` of `"choice"` already wins over the server's pick; test it).
   - `handleUploadSubmit` unchanged (it clears the checklist and the resume marker, then submits).
2. Delete `CamsWaitingCard.tsx`, `pendingCopy.ts` entries only used by it (keep any string still imported elsewhere: grep first; the Head of Family dialog uses `WAITING_CAMS_REQUEST_LINE` in `profile-v2/lib/headChangeCopy.ts`, which stays), and `WaitingForCasView.tsx` **only if** nothing outside `features/import` imports it (grep `WaitingForCasView` across `frontend/src`, including `onboarding` and `mobile`); if something else imports it, keep the file and report where. Delete the tests of anything you delete.
3. No change to: `checklist/**`, `RequestCamsPath.tsx`, `api.ts`, `usePendingCamsRequest.ts`, `frontend/src/mobile/**`, `profile-v2/**`, any copy except removals.

## Tests first (red for the stated reason), in `TwoPathImportContainer.test.tsx` (same rigs as the neighbours; mock `@/features/import/api`, including `getPendingCamsRequest`)
- `after a request the upload card is shown and no waiting text`: request succeeds, then "Upload your statement" is on screen; "CAMS request waiting" and "Waiting for CAMS email" are not.
- `a member with an open request opens on the upload card`: `getPendingCamsRequest` resolves a request; first screen is "Upload your statement"; no "CAMS request waiting".
- `ticking, closing and reopening the checklist and refocusing the tab do not change the screen` (as the existing HB-05 test, now with the upload card).
- `Back from the upload card shows the choice screen even with an open request`.
- `uploading closes nothing on the client side and calls onUploadSubmit with source tab "upload"` (or the source tab the code now passes; assert what you built).
- Update or remove every existing test that expects the waiting card or view (list each in the report with what it pinned); update `ImportFlow.test.tsx` and `ImportFlow.landing.test.tsx` the same way (they mock `getPendingCamsRequest` and wait for the first screen).

## Run these only (Claude runs them)
Lane `qa4`: `wsl.exe -d Ubuntu -- env UNIFOLIO_WT_ROOT=/mnt/c/Users/Dell/lanes UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash <script> qa4 test src/features/import src/features/profile-v2 src/mobile`, then `types`, `lint`. Expected: all green after your change.

## Files you may touch
`frontend/src/features/import/TwoPathImportContainer.tsx` and its test, `ImportFlow.test.tsx`, `ImportFlow.landing.test.tsx`, and the deletions above (`CamsWaitingCard.tsx` and test, `WaitingForCasView.tsx` and test if allowed, their copy constants). Nothing else.

## Constraints
No new dependency; no hex colours; no `parseFloat`, `toFixed`, `Intl.`, `console.`, `any`; no em dashes in new strings; no emojis; invented data only; git read-only; no deletion flags or recursive deletes except removing the named files one by one.

## Report format
One fenced block `CODEX REPORT: qa4-d2b`: status (DONE, PARTIAL or BLOCKED); baseline HEAD; each existing test updated or deleted and what it pinned; files changed or deleted with a one-line reason each; what you found for `WaitingForCasView` imports; commands you tried and exact errors; `git status --short`; deviations.

## Amendment 1 (26 Nov 2026, after the first Codex report)
- The guard `checklist/checklistLook.guard.test.ts` listed `CamsWaitingCard.tsx`; **Claude already removed that one line** (commit on `patch/qa4`). Do not touch `checklist/**`.
- `WaitingForCasView.tsx` and its test **stay** (the phone's `MobileImportView.tsx` uses it). You may edit `WaitingForCasView.test.tsx` only to remove or rewrite the cases that exercise the desktop container; do not change the component.
- `pendingCopy.ts` stays; remove only the constants nothing imports any more.
- Everything else in the handoff stands. Re-sync: the worktree is already at the new commit; read the handoff again.

## Paste-ready prompt
```
Front-end worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-26-d2b-remove-waiting-page-design-note.md
4. Docs/orchestration/2026-11-26-qa4-d2b-handoff.md (your task: qa4-d2b, owner-approved)
Work only in C:\Users\Dell\lanes\unifolio-qa4 on branch patch/qa4 (new, already created). Git is read-only. No deletion flags or recursive deletes. Write the tests first, then the change; you cannot run Vitest here, so report BLOCKED on running. Reply with the CODEX REPORT block from the handoff, nothing else.
```
