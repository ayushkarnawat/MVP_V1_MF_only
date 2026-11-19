# Handoff: h3-tutorial-red-tests (Batch H part 1, task H-3: red tests for the tutorial link and pop-up, front end, Codex)
**Status:** READY TO RELAY (written 2026-11-20). **Approved by the owner on 19 Nov 2026** ("you have my approval with Batch H part 1"). This task writes **only failing tests** (and nothing that makes them pass). The pop-up's look is then built by Antigravity (H-4) and its logic and wiring by Codex (H-6), against these tests. Runs **at the same time as** `2026-11-20-d2-d3-colour-and-shared-graph-handoff.md` (different worktree, different files).
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-h-cams-tutorial-plan.md` (Task H-3; read its "Global Constraints" and "Review Focus"). **Copy:** `Docs/orchestration/2026-11-20-h2-tutorial-script-and-copy.md` (every string below is from it; use the exact text). **Spec:** `Docs/orchestration/2026-11-13-batch-h-planning-workbook.html` (sections 3 and 4). The workbook is the design; if it and the code disagree, stop and say so.
**Worker:** Codex (tests only). **Reviewer and committer:** Claude.
**Work in:** `D:\unifolio-h-tutorial` (branch `batch/h-tutorial`, cut from `leapswitch-redesign` after M1, which already includes Batch C's import-screen change; the front end is `D:\unifolio-h-tutorial\frontend`). Never in `D:\Unifolio code`.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## Wave-start check (done 20 Nov; re-check, report drift)
`frontend/src/features/import/RequestCamsPath.tsx` (title "Request from CAMS", three options card, three steps, green button "Request Statement on CAMS"), `WaitingForCasView.tsx` ("usually arrives in 5 to 10 minutes", "Already got the email? Upload it now"), `casResumeState.ts`, `TwoPathImportContainer.tsx`, `components/ui/dialog.tsx` (the dialog primitive to use) exist; `frontend/public/` holds images only (no video). Find the **exact handler** the green button runs (the request) and report its name; the end-of-video action must call that same handler.

## The contract the tests pin (declare what you assume; the builders implement those names and no others)
Files and exports the plan names (create **no** production file; tests may import them and be red for a missing module):
- `features/import/tutorial/TutorialLink.tsx` : a small secondary **text link** (not a filled button) with a play icon, visible text `Watch how it works` and, beside it, `53 sec`; accessible name `Watch how it works, 53 seconds`; a prop for opening (for example `onOpen`).
- `features/import/tutorial/TutorialDialog.tsx` : the pop-up built on `components/ui/dialog.tsx`, title `How to request your statement from CAMS`, a close control named `Close`, a `<video>` (no audio track: **no volume or mute control**, no captions switch; captions are in the picture), chapter buttons `Request`, `Fill the form`, `Inbox`, `Upload` (they seek to 4, 9, 35 and 41 seconds), a transcript block headed `The four steps` with the four steps, the opening and the closing line (all text from the copy file), and at the end of the video two buttons `Watch again` and the green `Request Statement on CAMS`.
- `features/import/tutorial/useTutorialPlayer.ts` : `useTutorialPlayer(): { open: boolean; show(): void; hide(): void; autoPlay: boolean; src: string | null }`; `src` is `null` until `show()`; `autoPlay` is false when `prefers-reduced-motion: reduce`.
- `features/import/tutorial/tutorialCopy.ts` : the strings, one place; and a constant `TUTORIAL_VIDEO_URL` (a string path).
If you need a different shape for a test to be written sensibly, **say which in the report** instead of guessing silently.

## Tests to write (names from the plan; each red for the stated reason, unless marked guard)
Place them in `features/import/tutorial/TutorialDialog.test.tsx`, `TutorialLink.test.tsx`, `features/import/RequestCamsPath.test.tsx` and `WaitingForCasView.test.tsx` (existing files get new `it` blocks; do not change existing assertions):
1. `link shows on the Request from CAMS screen and on the waiting screen and is visually secondary` (a text link; the green button stays the only filled action; the waiting-screen link sits near "Already got the email?").
2. `pressing the link opens the dialog and does not call the CAMS request, open a tab or navigate` (the main green button's handler is **not** called; no `window.open`; location unchanged).
3. `nothing is fetched until the dialog opens`: no `<video>` element with a source and no request for `TUTORIAL_VIDEO_URL` (spy on `fetch` and check the video element's `src`) before open; the source is set only after open.
4. `a still poster shows first`.
5. `auto-plays on open when motion is allowed`; `with prefers-reduced-motion it does not start and the four steps show as text` (plus the reduced-motion line from the copy file).
6. `no volume or mute control` (no element with a volume or mute role or name; the native `controls` attribute must **not** expose them: assert the player renders its own play, pause, seek and full-screen controls or `controlsList` removes them; say what you assert).
7. `chapters jump to a moment` (clicking `Fill the form` sets the video's current time to 9).
8. `Escape and outside click close it and focus returns to the link` (and the page behind keeps its scroll position).
9. `at the end the green action behaves like the main button and closes the pop-up` (it calls the same handler as the green button on the Request screen, then closes).
10. `Watch again restarts` (current time 0 and plays).
11. `transcript text is present beside the player` (all four steps, the opening and the closing line, as plain text).
12. `the same link opens the same dialog from the waiting screen, and the waiting screen does not navigate`.
13. Guards that pass today: the existing screens' titles, texts and the green button's behaviour are unchanged when the link is added (use the existing assertions; do not copy them).
`<video>` in jsdom: fake the media element's `play`, `pause`, `currentTime` and `load` as needed and say how.

## Run these only
```
cd frontend
npx vitest run src/features/import/tutorial src/features/import/RequestCamsPath.test.tsx src/features/import/WaitingForCasView.test.tsx
npx tsc -b
npx oxlint src/features/import
```
If `node_modules` is missing in the worktree, use the orchestrator's script from WSL (lane `h` is this worktree): `bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" h test <paths under src/>`, `... h types`, `... h lint <paths>`. If WSL is denied to you, report BLOCKED with the exact error; the orchestrator runs it. **The new tests are the only red ones; guards pass; `tsc` reports errors only for the missing modules the tests import (list them) and nothing else.**

## Files you may touch
New test files under `frontend/src/features/import/tutorial/` and new `it` blocks in `RequestCamsPath.test.tsx` and `WaitingForCasView.test.tsx`. **Do not touch** any production file (no component, hook, copy or video), `backend/**`, `frontend/src/mobile/**`, `package.json`, lockfiles, `frontend/public/**`.

## Constraints
No new dependency. No third-party player or script (no cookies). Invented data only. Git read-only. No deletion flags or recursive deletes.

## Report format
One fenced block `CODEX REPORT: h3-tutorial-red-tests`: status; baseline HEAD; drift; the green button's handler name; every test with its red reason or "guard, passes today"; the exact names (props, ids, strings, helper fakes) the tests assume; commands with counts; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Frontend test writer for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-20-h3-tutorial-red-tests-handoff.md (your task: H-3, red tests only; the copy is in Docs/orchestration/2026-11-20-h2-tutorial-script-and-copy.md)
Work only in D:\unifolio-h-tutorial (frontend folder) on branch batch/h-tutorial. Git is read-only. No deletion flags or recursive deletes. Add only test files and new test blocks the handoff names. Change no production file. The new tests must be red for the stated reason; the guards must pass today.
Run checks with the commands in the handoff (if the sandbox cannot run them, reply BLOCKED with the exact error, do not change any config).
Reply with the CODEX REPORT block from the handoff, nothing else.
```
