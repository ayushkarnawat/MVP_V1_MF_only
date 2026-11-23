# Handoff: h8-checklist-red-tests (Batch H part 2, task H-8: the failing tests for the floating CAMS checklist, Codex)
**Status:** READY TO RELAY (written 2026-11-23). Milestone M4. Owner accepted the spike result on 23 Nov 2026 (`Docs/orchestration/2026-11-23-checklist-spike.md`, `decisions.md` 23 Nov).
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-h-cams-tutorial-plan.md` (Tasks H-8, H-9; its "Floating checklist" constraints). Design: `Docs/orchestration/2026-11-13-batch-h-planning-workbook.html` section 5 (the words: `PITEMS`, "n of 5 done"). **The spike changed the plan's click order; this file's "The flow" wins over the plan text where they differ.** If anything else in the plan, the workbook and the code disagree, stop and say so.
**Worker:** Codex, front end, **tests only in this task** (the logic is H-9, the look is H-10). **Reviewer, test runner and committer:** Claude (Codex cannot run the front-end checks; see "Run these only").
**Work in:** `C:\Users\Dell\lanes\unifolio-h8` (a new worktree, branch `batch/h-checklist`, cut from `leapswitch-redesign` at `1181f26b`). Never in the main project folder.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## What the spike found (23 Nov, Chrome 157)
One click can open **either** the floating window **or** a new tab, never both, in either order. The floating window works fine otherwise (on top, shared state, light, restored after reload). A click **inside** the floating window can open the CAMS tab.

## The flow (what the tests must describe)
Supported browser (`"documentPictureInPicture" in window`):
1. The green "Request Statement on CAMS" click calls `requestWindow({ width: 320, height: 440 })` **first, before any `await`** and before the backend request, then starts `requestCamsStatement(memberId)`.
2. While the request runs the checklist's first step shows its "Open the CAMS form" button **disabled**, labelled "Getting your link ready".
3. When the request returns: `setCasResumeStep2(memberId)` as today, `onRequestInitiated(importId, expiresAt)` as today (the app moves to the waiting screen, the floating window stays), the button becomes enabled. **The CAMS tab is not opened by the green button.** Pressing the checklist's button opens `result.cams_url` with `window.open(url, "_blank")`.
4. If the request fails: the checklist shows the same error text as the screen and "Try again" (runs the request again; opening the window again is not needed while it is open); the screen keeps its error.
5. Steps: `form` (filling the form on CAMS), `waiting` (after "I have submitted the form"), `ready` ("I have the file").
Unsupported browser, or the floating window refused (throws, including `NotAllowedError`): the checklist shows as an **in-page panel** on the screen, and the green button behaves **exactly as today** (await the request, `window.open(cams_url)`, move on). Never block the user from requesting.

## Interface the tests may rely on (H-9 builds exactly this; do not invent more)
`frontend/src/features/import/checklist/useCamsChecklist.ts`:
`useCamsChecklist(memberId: string): { supported: boolean; mode: "closed" | "window" | "panel"; step: "form" | "waiting" | "ready"; ticks: boolean[]; toggle(i: number): void; open(): void; close(): void; focus(): void; reopen(): void; startOver(): void; camsLink: { state: "preparing" | "ready" | "failed"; error: string | null; url: string | null }; setCamsLink(next: Partial<...>): void; markSubmitted(): void; markFileReady(): void }`.
`CamsChecklist.tsx` renders the checklist body (five checkbox items, "n of 5 done", the button "I have submitted the form" disabled until all five are ticked, the "Open the CAMS form" button with the states above, "Try again", "I have the file"). `casResumeState.ts` gains `getChecklistState(memberId)`, `setChecklistState(memberId, { ticks, step })`, `clearChecklistState(memberId)` (a new key beside the resume key; same try/catch style; never sent to a server).
`open()` is a plain function (not async) that calls `requestWindow` synchronously and handles the returned promise itself; all errors are swallowed into `mode: "panel"`.

## Tests to write (red now: the modules do not exist; invented data only)
Files: `frontend/src/features/import/checklist/useCamsChecklist.test.tsx`, `CamsChecklist.test.tsx`, and new cases in `frontend/src/features/import/RequestCamsPath.test.tsx` and `WaitingForCasView.test.tsx` (add; do not edit existing assertions). Fake `window.documentPictureInPicture` (`requestWindow` returns a promise resolving to a fake window with a real `document` from `document.implementation.createHTMLDocument`, `focus`, `close`, `closed`, and a `pagehide` listener hook); fake `window.open`. Use `fireEvent` and react-router, **not** `@testing-library/user-event` (not installed).
- `opens the window first: requestWindow is called synchronously in the click, before the request starts and before anything is awaited` (assert call order with spies: requestWindow, then requestCamsStatement).
- `the green button does not open the CAMS tab when the floating window opened`; `the checklist's "Open the CAMS form" button is disabled with "Getting your link ready" until the request returns, then opens cams_url in a new tab`.
- `the app still moves to the waiting screen when the request returns, and the floating window stays open`.
- `a failed request shows the error and "Try again" in the checklist and keeps the screen's error`.
- `no support: the in-page panel shows and the green button requests then opens CAMS exactly as today` (guard: today's `RequestCamsPath.test.tsx` cases still pass unchanged).
- `requestWindow throws NotAllowedError: falls back to the panel and the green button works as today`; `requestWindow rejects after the click: same`.
- `five items in order with the workbook words, real checkboxes with labels, "n of 5 done", "I have submitted the form" disabled until all five are ticked`.
- `steps move form -> waiting -> ready; "I have the file" shows the upload screen and closes the checklist`.
- `ticks and step are saved beside the resume marker and restored; nothing from the CAMS form is read or stored` (storage holds only the two fields).
- `reload: the window is gone, the screen shows "Your checklist closed" with "Reopen checklist" (needs a click) and "Start over"; Reopen calls requestWindow in the click; Start over clears ticks and step`.
- `a second press while open focuses the existing window instead of opening another`.
- `the early return to the tab does not jump to the upload screen while the checklist is open; it shows when the user presses "I have the file"` (check how `WaitingForCasView` and the container jump today and test that behaviour against the checklist's `mode`).
- `the next family member starts at step 1 with no ticks` (state is per memberId).
- `styles are copied into the floating window and the window is forced light` (assert `<style>`/`<link>` copied and a light colour-scheme rule present).
- `the floating window's content is the same React tree (a portal): ticking in it updates the screen's "n of 5 done"` (no message passing).
- `"Continue without it" shows only where the API exists` (the line "A small checklist will float over the CAMS page" with the link "Continue without it", which makes the green button behave as today for this request).
- Guards from the repo's rules: every `<button` carries `data-clickable` and an allowed `data-effect`; no hex colours, `any`, `console`, `parseFloat`, `toFixed`, `Intl` in the new files (copy the pattern of the existing guard tests if there is one for this folder; otherwise name the guard in the report).

## Files you may touch
Only the four test files above (new: `checklist/useCamsChecklist.test.tsx`, `checklist/CamsChecklist.test.tsx`; add-only cases in `RequestCamsPath.test.tsx`, `WaitingForCasView.test.tsx`). **Do not touch** any non-test file, `frontend/src/features/import/tutorial/**`, existing assertions, `package.json`.

## Run these only (Claude runs them in WSL; Codex does not)
`cd frontend && npx vitest run src/features/import/checklist src/features/import/RequestCamsPath.test.tsx src/features/import/WaitingForCasView.test.tsx` expected: the new tests FAIL because the modules or behaviour do not exist (say which for each), the old ones PASS. Codex cannot type-check without the modules; re-read each test for type correctness against the interface above and say so.

## Constraints
No new dependency. No network. Invented data only. Git read-only. No deletion flags or recursive deletes. Words only from the workbook or this file; flag any word you needed that is not in either.

## Report format
One fenced block `CODEX REPORT: h8-checklist-red-tests`: status; baseline HEAD; files and the list of test names (one line each, mapped to the bullets above); anything in the code that made a test hard to write (a flag for H-9); the places where you relied on a guess about `WaitingForCasView` or the container; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Front-end test worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-23-h8-checklist-red-tests-handoff.md (your task: H-8, failing tests only; "The flow" in it wins over the plan text)
Open this folder in Codex as a NEW project: C:\Users\Dell\lanes\unifolio-h8 (branch batch/h-checklist, already created). Git is read-only. No deletion flags or recursive deletes. Write only the test files the handoff lists; touch no other file. Do not use @testing-library/user-event (not installed). You cannot run the tests; do not try, and do not change any config. Re-read your tests against the interface in the handoff.
Reply with the CODEX REPORT block from the handoff, nothing else.
```
