# Handoff: hbcd-sp-1 (D-2 test page: can one click on a real link open CAMS and the floating checklist? Codex, lane SP; Task 9; the owner runs it)
**Status:** READY TO RELAY (written 2026-11-25). **Approved:** the owner approved the plan on 25 Nov 2026 (decision QA-2 A: build D-2 **only if this short test passes**).
**Parent plan:** `Docs/superpowers/plans/2026-11-25-hof-bcd-adddata-plan.md` (Task 9, then Task 10). **Spec:** `Docs/orchestration/2026-11-24-head-of-family-d11-plan.html` (page version 16, item 2 "D-2"). **Earlier result this builds on:** `Docs/orchestration/2026-11-23-h7-checklist-spike-handoff.md` and the README in `Docs/orchestration/spike/checklist-spike/` (first finding: **`window.open` is blocked after the floating window opens**; the test now asks whether a **real link** (`<a target="_blank">`) avoids that).
**Worker:** Codex. **Not a unit test: a small static test page the owner opens in Chrome and Edge.** It cannot be run by Codex (no browser); write it carefully and check it by reading and with `node --check` on the script if a shell is available (if not, say so). **Reviewer and committer:** Claude.
**Work in:** `C:\Users\Dell\lanes\unifolio-h7b` (worktree, branch `batch/h-spike2b`, cut from `batch/h-spike`, which holds the first spike). Never in the main checkout. (The older worktree `unifolio-hbcd-sp` is a leftover: do not use it.)
Read first: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md`, then this file, then the existing spike (`Docs/orchestration/spike/checklist-spike/` `index.html`, `spike.js`, `spike.css`, `cams-stand-in.html`, `README.md`).

## What and why
Today "Request from CAMS" is a button: the code opens the checklist window, then (after it settles) opens CAMS with `window.open`, and the browser blocks that second open, so the person needs an extra "Open the CAMS form" button. If "Request from CAMS" is a **real link** that opens CAMS in a new tab **by the browser's own link behaviour** while its click handler opens the floating window at the same time, there is nothing left for the browser to block. This page proves or disproves that in real Chrome and Edge. **Pass mark: one click on a link-button gives the CAMS tab in front and the floating checklist, with nothing else clicked.**

## What to build (new files only; do not change the existing spike files except to add one link to the new page)
In `Docs/orchestration/spike/checklist-spike/` add **`link-test.html`**, **`link-test.js`** and extend **`README.md`** with a section "D-2 link test" (or add `README-link-test.md` and one line in the README pointing to it). The page reuses `spike.css` and the look of the first spike (copy the small helpers you need into `link-test.js`: do not import `spike.js`, it binds to the first page's ids). The checklist content is the same five invented items and the same shared state key as the first spike is **not** reused: use its own key `unifolio-link-test`. Everything is **invented and local**: no real data, no network; the fake "server" is a `setTimeout`; the CAMS stand-in is `cams-stand-in.html`.
**The six cases** (a row of controls per case, each logs one line to a results box and a **Copy results** button gives the owner one block to paste back):
- **S1: link first.** A real `<a id="s1-link" href="cams-stand-in.html" target="_blank" rel="noopener noreferrer">Request Statement (link)</a>` styled as a button. Its click handler **calls `documentPictureInPicture.requestWindow(...)` synchronously first** (before any `await`), **never calls `preventDefault`**, and then starts the fake request in the background. After the click the owner records: did a new tab open, which window is in front, is the floating window visible above it, did the main page keep its state.
- **S2: reverse order.** Same link, but the handler first does the fake request wait (`await` a 0.3 second timer) and **then** calls `requestWindow` (the order the first spike's "request first" button used), still without `preventDefault`. This shows whether late `requestWindow` calls are refused after a link navigation was already started.
- **S3: pop-ups allowed.** Instructions to turn on "Pop-ups and redirects: Allow" for `localhost` in the browser's site settings, then repeat S1 and S2. Logs which of S1/S2 changed.
- **S4: the CAMS tab and the floating window together.** After S1: the CAMS stand-in tab is in front; the floating window **stays above it**; ticking an item in the floating window **reaches the main page state** (the shared-state line updates); and a fake "request" result still reaches the main page (a log line "request finished" arrives after the click).
- **S5: input methods and small conditions.** The same link activated by keyboard (Enter and Space on the focused link), with a slow fake network (a 6-second timer), and with a small browser window: each logs the result.
- **S6: a refused floating window.** A tick box "Simulate a refused floating window" makes the handler's `requestWindow` call throw `NotAllowedError` (as the first spike does). Expected: **CAMS still opens by the link's own behaviour** and the checklist appears **in the page** instead; nothing is blocked and nothing waits.
Each case has a **Record observation** control (a drop-down with the fixed outcomes the owner picks: "pass", "CAMS tab did not open", "CAMS opened behind the floating window", "floating window did not open", "other") plus a free-text line, exactly like the first spike's `Record observation`.
**Edge and Chrome only matter** (Firefox and Safari have no floating-window API: the page must degrade to the in-page checklist and say so in the results). Environment line (browser version, `documentPictureInPicture` available, secure context) in the results, as the first spike prints it.

## README: the owner's steps (plain words, short, numbered)
Start the page (`python -m http.server 8123` in the folder, open `http://localhost:8123/link-test.html` in desktop Chrome and Edge, version 116 or later; `localhost` counts as a secure context), close any stand-in tabs between attempts, run S1 first in each browser, then S2, S3, S4, S5, S6, and **Copy results** and paste the block into the chat; say clearly which browser each block is from. State the **pass mark** at the top and the decision rule: **S1 passes in both Chrome and Edge** means D-2 is built; **only S3 passes** means the owner is asked (a one-time pop-up setting is a user setup); **nothing passes** means the owner chooses between a browser extension and the in-page panel only.

## Files you may touch
Create `Docs/orchestration/spike/checklist-spike/link-test.html`, `link-test.js`, and the README text above; in the existing `index.html` you may add **one** link to `link-test.html` (nothing else in the existing files).
**Do not touch:** `frontend/**`, `backend/**`, any other file.

## Constraints
Invented data only; no network request of any kind; no real CAMS address; no dependency; plain HTML, CSS and JavaScript as in the first spike; no emojis; git read-only; no deletion flags or recursive deletes.

## Report format
One fenced block `CODEX REPORT: hbcd-sp-1`: status; files created or changed with a one-line reason each; what you could not check (browser behaviour); `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Test-page worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-25-hbcd-sp-1-handoff.md (your task: hbcd-sp-1, owner-approved)
Then read the existing spike in Docs/orchestration/spike/checklist-spike/ (index.html, spike.js, spike.css, cams-stand-in.html, README.md) and Docs/orchestration/2026-11-23-h7-checklist-spike-handoff.md. Work only in C:\Users\Dell\lanes\unifolio-h7b on branch batch/h-spike2b. Git is read-only. No deletion flags or recursive deletes. You build a small static test page the owner runs by hand in Chrome and Edge; you cannot run a browser, so write it carefully (node --check on the script if a shell is available). Create only the files the handoff lists.
Reply with the CODEX REPORT block from the handoff, nothing else.
```
