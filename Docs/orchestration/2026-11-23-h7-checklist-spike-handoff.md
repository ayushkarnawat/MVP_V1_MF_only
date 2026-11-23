# Handoff: h7-checklist-spike (Batch H part 2, task H-7: does a floating checklist window really open from the button click? Codex builds a throwaway test page; the owner runs it in Chrome and Edge)
**Status:** READY TO RELAY (written 2026-11-23). Milestone M4. **This is a test of a browser feature, not product code.** Nothing here ships and nothing in `frontend/` changes.
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-h-cams-tutorial-plan.md` (Task H-7 and its "Floating checklist" constraints). Design: `Docs/orchestration/2026-11-13-batch-h-planning-workbook.html` (section 5, and "a choice I have made for you" = the second-button fallback).
**Worker:** Codex. **Reviewer and committer:** Claude. **The test is run by the owner** (a person in desktop Chrome and desktop Edge, version 116 or later); Codex cannot open a browser.
**Work in:** `C:\Users\Dell\lanes\unifolio-h7` (a new worktree, branch `batch/h-spike`, cut from `leapswitch-redesign` at `7fc558cb`). Never in the main project folder.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## The question the spike answers
The plan opens a small floating window (the browser's "Document Picture-in-Picture" window, `window.documentPictureInPicture.requestWindow({ width: 320, height: 440 })`) from the click on the green "Request Statement on CAMS" button, so a five-item checklist stays on top while the user fills the CAMS form in another tab. Today's click handler (`frontend/src/features/import/RequestCamsPath.tsx`, `handleRequest`) does: `await requestCamsStatement(memberId)` (a network call, usually a few hundred milliseconds), then `window.open(result.cams_url, "_blank")`, then moves the app on. The plan says to open the floating window **first**, before the network call and before opening CAMS. Browsers only allow these windows after a recent click ("user activation", about five seconds in Chrome). The spike finds out, in the real browsers, whether each of these works and in which order:

1. Does `requestWindow` succeed when it is the first call in the click handler?
2. Does it still succeed when it comes **after** an awaited network call of 0.3 s, 1 s, 3 s and 6 s (to learn how much time we have if we cannot put it first)?
3. Does `window.open(url, "_blank")` (the CAMS tab) still open **after** the floating window opened and after the awaited call, or is it blocked as a pop-up?
4. When the CAMS page (a stand-in in another tab) is in front, does the floating window stay on top and keep working?
5. Do ticks in the floating window update the main page's state live (the window is rendered from the main page's code, so there is no message passing: the spike must do it the same way, with a plain DOM move or a React portal, **not** `postMessage`)?
6. Do copied stylesheets (`<link>` and `<style>` from the main page, copied into the floating window's document) give the same look?
7. A second click while the window is open: does it focus the existing window (`window.documentPictureInPicture.window`) instead of opening another?
8. A page reload: does the window close (expected), and is the saved state (ticks and step in `localStorage`) still there afterwards?
9. Where the API does not exist (Firefox, Safari, mobile): does feature detection (`"documentPictureInPicture" in window`) say so, and does the page show its in-page fallback panel with the same five items?
10. A `requestWindow` call that is refused (throws `NotAllowedError` or similar): does the page fall back without breaking the button?

## What to build (new files only, all in one folder)
`Docs/orchestration/spike/checklist-spike/` with **no build step and no dependencies**: plain `index.html`, `spike.js`, `spike.css`, `cams-stand-in.html` (a plain page titled "CAMS stand-in" with a fake form of an email box and a password box that carry **placeholder text only and are never read**), and a short `README.md` for the owner (how to open it: from the folder run `python -m http.server 8123`, then open `http://localhost:8123/` in Chrome; the API needs a secure context and `localhost` counts as one).
Design of the page (keep it small and plain; it is a test bench, not a screen):
- A button **"Request Statement (open the checklist first)"**: its click handler calls `requestWindow` first (synchronously inside the handler, before any `await`), then awaits a fake request of the delay chosen in a dropdown (0.3, 1, 3, 6 seconds), then `window.open("cams-stand-in.html", "_blank")`.
- A second button **"Request Statement (call the request first)"**: awaits the fake request first, then `requestWindow`, then `window.open`. (This is the order that tells us how much time we have.)
- A third button **"Open the checklist only"** (to test 7 and 8 without the CAMS tab) and a **"Close"** button.
- The five checklist items use the words from the plan's workbook section 5 if you can read them there; if not, use these placeholders and say so: "Open the CAMS form", "Choose Specific Period and set the dates", "Choose the option with zero balance folios", "Enter your email and a password you make up", "Submit and wait for the email". Real `<input type="checkbox">` elements, each with a real `<label>`, in order; a line "n of 5 done"; a button that stays disabled until all five are ticked.
- Ticks and the current step are saved to `localStorage` under one key and restored on load.
- A **results panel** on the main page records, as plain lines with a time stamp, every attempt: which button, the delay, what `requestWindow` returned or threw (the error `name` only), whether `window.open` returned a window or `null` (null means blocked), the browser's own name and version read from `navigator.userAgent` (shortened), and whether `documentPictureInPicture` exists. A **"Copy results"** button puts the panel's text on the clipboard so the owner can paste it back.
- The floating window's content is created from the main page's own code: build the checklist in the main document's DOM and **move** that element into `pipWindow.document.body` (and back when the window closes: listen for `pagehide` on the floating window), after copying every stylesheet rule (`document.styleSheets` -> `<style>` text, falling back to `<link>` for cross-origin sheets) into the floating window's `<head>`. Tick handlers stay the same functions, so state is shared by construction.
- In the floating window the light colours must be fixed (white background, dark text) whatever the page's colour scheme.
- No `postMessage`, no `BroadcastChannel`, no network request other than loading the page's own files, no analytics, no third-party scripts, no logging of anything typed into the stand-in form.

## What you must not do
Touch `frontend/**`, `backend/**`, the plan, the workbook or any existing file. Add a dependency. Use `eval` or `innerHTML` with anything not written by you. Open CAMS' real address anywhere (the spike uses only the stand-in page; the real CAMS form is opened by a person, never automated).

## Checks you can run (no browser needed)
`node --check Docs/orchestration/spike/checklist-spike/spike.js` (syntax), and read the files again for the ten questions: every one must have a place on the page or in the results panel where its answer will be recorded. Report which question is covered by which control.

## Report format
One fenced block `CODEX REPORT: h7-checklist-spike`: status; baseline HEAD; the files created; for each of the ten questions, the control and results line that answers it; the `node --check` output; anything you could not build as asked and why; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Front-end spike worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-23-h7-checklist-spike-handoff.md (your task: H-7, a throwaway browser test page)
Open this folder in Codex: C:\Users\Dell\lanes\unifolio-h7 (branch batch/h-spike, already created; reuse it if you have it open, otherwise add it as a new project). Git is read-only. No deletion flags or recursive deletes. Create only the new files under Docs/orchestration/spike/checklist-spike/ and touch nothing else. No build step, no dependency. Run only: node --check Docs/orchestration/spike/checklist-spike/spike.js
Reply with the CODEX REPORT block from the handoff, nothing else.
```

## After the report (Claude)
Review the files, commit them on `batch/h-spike`, and give the owner a two-minute test sheet: open the page in Chrome, press each button in the order the README gives, press "Copy results", repeat in Edge, and once in Firefox (to see the fallback). Claude records the pasted results in `Docs/orchestration/2026-11-xx-checklist-spike.md` and says whether the idea works as drawn or whether the second-button fallback (the workbook's "a choice I have made for you") is needed. H-8 (red tests) waits for that answer.
