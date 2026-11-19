# Packet H-4 and H-6: the "Watch how it works" link and the tutorial pop-up (Antigravity, front end; look and logic in one task)
**Batch H part 1** (rides with M2). Owner approved 19 Nov; the video is the finished Look 2 cut (decided 20 Nov: no new recordings needed). Plan: `Docs/superpowers/plans/2026-11-17-batch-h-cams-tutorial-plan.md` (Tasks H-4 and H-6; read its "Global Constraints" and "Review Focus"). **Design source: `Docs/orchestration/2026-11-13-batch-h-planning-workbook.html`, sections 3 and 4** (the link, the pop-up playing, the finished state). **Copy: `Docs/orchestration/2026-11-20-h2-tutorial-script-and-copy.md`** (use the strings exactly). Why one task for look and logic: the front-end checks run for you (not for Codex's sandbox), and the red tests (H-3) already pin both.

**Your clone:** `C:\Users\Ayush\ag-h46` (branch `ag/h46-tutorial`, cut from `batch/h-tutorial` at the video commit `4cc007ea`). Work only there. Never edit `D:\Unifolio code`. Never run a git command that changes anything.
**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), `Docs/orchestration/2026-11-18-palette-reference-for-workers.md`, then this packet.

## What exists already (do not rebuild)
- `frontend/public/tutorial/how-to-request-from-cams.mp4` (about 53 s, 720p, **no audio track**, captions burned into the picture), `poster.jpg` (a still of the title card), `transcript.txt`. **Do not touch `frontend/public/**`.**
- `frontend/src/components/ui/dialog.tsx` (the dialog primitive to build on).
- The red tests, written by Codex and checked by the orchestrator (fixed; do not edit, weaken or delete): `frontend/src/features/import/tutorial/TutorialLink.test.tsx`, `TutorialDialog.test.tsx` (these two files currently fail only because their modules do not exist), and new blocks in `frontend/src/features/import/RequestCamsPath.test.tsx` and `WaitingForCasView.test.tsx` (4 red now; 4 guards pass today). **Read them first: they are the exact contract** (names, strings, roles, the media fakes, the chapter times 4, 13, 37 and 41 seconds).

## Build
1. `features/import/tutorial/tutorialCopy.ts`: all strings from the copy file in one place (title, chapter names and seconds, the four steps, the opening and closing line, the reduced-motion line, the button names) and `export const TUTORIAL_VIDEO_URL = "/tutorial/how-to-request-from-cams.mp4"` and `TUTORIAL_POSTER_URL = "/tutorial/poster.jpg"`.
2. `features/import/tutorial/useTutorialPlayer.ts`: `useTutorialPlayer(): { open: boolean; show(): void; hide(): void; autoPlay: boolean; src: string | null }`. `src` is `null` until `show()` (nothing is requested before the pop-up opens); `autoPlay` is false when `prefers-reduced-motion: reduce` matches.
3. `features/import/tutorial/TutorialLink.tsx`: a small **secondary text link** (a play icon from the app's icon set, the text `Watch how it works`, and `53 sec` in muted small text; accessible name `Watch how it works, 53 seconds`; a prop `onOpen`). Not a filled button: the green button stays the only filled action.
4. `features/import/tutorial/TutorialDialog.tsx`, on the `Dialog` primitive: title, close (accessible name `Close`), the `<video>` (src and poster from the constants; **no native controls**: your own Play/Pause, a seek slider and Full screen; **no volume or mute control**, no captions switch), the four chapter buttons (seek to 4, 13, 37, 41 s), the transcript block `The four steps` beside or under the player (opening line, the four steps, closing line), and at the end of the video the two buttons `Watch again` and the green `Request Statement on CAMS`. With reduced motion: no auto-play, the reduced-motion line shows and the steps are visible text. Escape and outside click close it, focus returns to the link, the page behind keeps its scroll position.
5. Mount the link and dialog in `features/import/RequestCamsPath.tsx` (near the green button, secondary) and `WaitingForCasView.tsx` (by the "Already got the email? Upload it now" disclosure). Pressing the link **only** opens the dialog: it must not call the CAMS request, open a tab or navigate. The end-of-video green button calls **exactly the handler the main button uses (`handleRequest`)** and then closes the dialog.
6. **Look** (workbook section 4; tokens only, no hex colours): the dialog is about 960 px wide at most and 92% of the viewport on a laptop, the video 16:9 with rounded corners, chapter chips in a row under the player (the current one marked), controls in one calm bar, the transcript in muted text below; the end state is a soft overlay on the video with the two buttons centred. Every state exists: default, hover, focus (always visible), active, disabled, loading (poster while the source loads), dark mode. Motion respects `prefers-reduced-motion`. You cannot see the screen: say so in the report; the orchestrator screenshots it at 1280x600, 1440x810 and 1536x730, light and dark.

## Files you may change
New: `frontend/src/features/import/tutorial/{tutorialCopy.ts,useTutorialPlayer.ts,TutorialLink.tsx,TutorialDialog.tsx}`; modify: `frontend/src/features/import/RequestCamsPath.tsx`, `frontend/src/features/import/WaitingForCasView.tsx`. Anything else: stop and report.
## Do not touch
`backend/**`, `frontend/src/mobile/**` (phone unchanged), any `*.test.*` file, `frontend/public/**`, `package.json`, lockfiles, `casResumeState.ts`, `ImportWrapper.tsx`, `TwoPathImportContainer.tsx` (unless a test proves a prop must pass through: then report it first).

## Rules
No third-party player or script (no cookies on a screen about to receive a financial statement). No analytics events (GA4 paused): keep step and open labels only as test ids. Plain words; no em dashes in user-visible text. No new dependency.

## Checks (PowerShell)
```
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-h46 test src/features/import/tutorial src/features/import/RequestCamsPath.test.tsx src/features/import/WaitingForCasView.test.tsx
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-h46 test src/features/import
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-h46 types
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-h46 lint src/features/import
```
If WSL is denied on your machine, run the same in PowerShell inside the clone: `npx vitest run <paths>`, `npx tsc -b`, `npx oxlint <paths>`.

## Report (one block, nothing else)
Failing counts before (the two new test files cannot load, plus 4 red; say the exact numbers) and after; the exact commands and results; `git status --short` (only the files above); decisions the packet did not cover; anything you could not check (visual, real video playback); Open questions.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-palette-reference-for-workers.md
4. Docs/orchestration/2026-11-20-h46-tutorial-dialog-packet.md (your task: H-4 and H-6)
Work only in C:\Users\Ayush\ag-h46 on branch ag/h46-tutorial. Read the red tests first: they are the contract. Tests first: run the named test files and record the failing counts before you change anything. Never run a git command that changes anything. Do not touch backend/**, frontend/src/mobile/**, frontend/public/**, any *.test.* file, or any file outside the packet's Files list. Reply with the report block from the packet, nothing else.
```
