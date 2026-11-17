# Batch H: CAMS Tutorial (Video Pop-up and Floating Checklist) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read `Docs/orchestration/wave-common-rules.md` first; it wins where it differs.

**Goal:** Help users request their statement from CAMS: a "Watch how it works" link that opens a pop-up playing a silent 53-second tutorial (part 1, ships with M2, placeholder or final video), and a floating checklist that stays over the CAMS tab while the user fills the form (part 2, ships with M4, after the import screens are stable).

**Architecture:** Front end only. Part 1: a link on `RequestCamsPath` and `WaitingForCasView`, a dialog (existing `components/ui/dialog.tsx`) with a self-hosted video fetched only on open. Part 2: Document Picture-in-Picture window rendered by a React portal from the main app, with an in-page fallback panel in other browsers; steps saved in the browser next to the existing resume marker (`casResumeState.ts`). No backend, no database, no migration.

**Tech Stack:** React, TypeScript, Vitest, the browser's `documentPictureInPicture` API (faked in unit tests), one video file and its captions/poster.

**Spec:** `Docs/orchestration/2026-11-13-batch-h-planning-workbook.html` (Q1 Look 2, Q2 no sound, Q3 who makes the video, Q4 format; sections 2 to 7; chosen design: Look 2 video plus floating checklist, 17 Nov). Program rules: `2026-11-17-program-execution-and-deployment-plan.html`.

## How this plan is used (read first)

- **Packets and handoffs are not written here.** The orchestrator writes the Antigravity packets (pop-up look, the checklist window and its fallback panel, the screen notes) and each Codex handoff in detail when the task starts, from the workbook's drawings and the live CAMS form's own words.
- **Two parts, two waves.** Part 1 (H-2 to H-6) rides with M2 and **waits for C's import-screen change (17d)**: both edit the import wrapper and screens (program section 5: C and B first, then H). Part 2 (H-7 to H-10) waits for B, C and the import screens to be stable and for the user's real CAMS checks (wave 5, M4).
- **The video is made by Claude only (Q3, answered 17 Nov), in the chosen Look 2 style.** Claude builds it in code from the user's real recordings, the same way `Docs/orchestration/video/look2-v5.mp4` was made (frame-by-frame render, encoded to MP4), and **it must match the workbook's Look 2 exactly** (scenes, timing, captions, glass guide card, progress indicator). Codex does not produce the video. The user supplies only what Claude cannot: recordings and screenshots (see H-5). Part 1 can ship with `look2-v5.mp4` or a short placeholder so the pop-up is tested before the final cut exists.
- **Open items from the workbook (need the user, not blockers for part 1):** a real inbox email screenshot with details hidden; confirmation that CAMS accepts a ten-year range when submitted; settling the screen copy that says "10-year duration" and "with zero folios" against the live form's words (Specific Period with From and To dates; With zero balance folios). The screen text is **not changed by this plan** unless the user approves (it is Batch B/C screen-copy territory); flag it.
- **Wave-start check:** confirm `features/import/RequestCamsPath.tsx` (title "Request from CAMS", the three options card, three steps, green button "Request Statement on CAMS"), `WaitingForCasView.tsx` ("usually arrives in 5 to 10 minutes", "Already got the email? Upload it now"), `casResumeState.ts`, `TwoPathImportContainer.tsx`, `components/ui/dialog.tsx`, `frontend/public/` holds images only (no video); that C's change to `shell/wrappers/ImportWrapper.tsx` is merged; and the current live CAMS form wording (a person opens it; do not automate it). Report drift.
- **Branch:** `batch/h-tutorial` from `leapswitch-redesign`. Part 1 after C merges (wave 2); part 2 rebased at wave 5.
- **Builders:** Codex = pop-up logic, link, loading rules, the checklist hook and component logic, the fallback panel logic, all tests. Antigravity = look of the pop-up, chips, the checklist window and its fallback panel, lane G-a (pop-up) then G-b (checklist), files disjoint (`features/import/tutorial/` vs `features/import/checklist/`).

## Global Constraints

- The video has **no audio**: no volume or mute controls; captions are burned into the picture; a transcript of the four steps sits beside the player (also for screen readers). Controls: play, pause, seek, full screen; keyboard usable.
- Not fetched until the pop-up opens: a still picture shows first; auto-play on open only when the user has not asked for reduced motion; with reduced motion the video does not start and the steps show as text beside it.
- Hosting: a single file (about 53 s, 720p, 30 fps, no audio track, a few MB) in the front end's own files (`frontend/public/tutorial/` or the app's object storage if too large for the bundle: decided at H-6, with the pop-up pointing to a constant `TUTORIAL_VIDEO_URL`). **No third-party player or script** (no cookies set on a screen about to receive a financial statement).
- The link is a small secondary text link ("Watch how it works" with a play icon, plus the length), the green button stays the only filled action; pressing the link opens the pop-up and **does not** open CAMS or move the app to the waiting screen. End of video offers the green "Request Statement on CAMS" action (does exactly what the main button does, then closes the pop-up) and "Watch again". The same link appears on the waiting screen near "Already got the email?".
- Floating checklist: open with `documentPictureInPicture.requestWindow({ width: 320, height: 440 })` **first in the click handler** (before the backend request that creates the CAMS request and before opening CAMS); copy Unifolio's stylesheets into the window; render by a portal so ticks update the same app state (no cross-window messages); five items, "n of 5 done", a button grey until all five are ticked; light-coloured regardless of dark mode; works only in browsers with the API (Chrome and Edge desktop 116 or later; Firefox treated as to-check, fallback until confirmed); feature-detect before offering ("A small checklist will float over the CAMS page" line with "Continue without it" shows only where supported); every failure falls back to the in-page panel and the user is never blocked from requesting the statement.
- Ticks and current step are saved in the browser beside `casResumeState` (never sent to servers); a reload closes the window by design, the screen offers "Reopen checklist" (needs a click) and "Start over"; one window per tab (a second click focuses it); the upload jump that today fires when the user returns to the tab is held back while the checklist is open and shown when the user presses "I have the file".
- The checklist never reads or types into CAMS; nothing about the form (email, password, PAN) is read or stored. Per request: the next family member starts again at the first step.
- No real names, emails, PAN, amounts or inbox data in any capture, still or screenshot: dummy email, placeholder password, clean browser profile, frame-by-frame review (H-5).
- Words: the live CAMS form's own words everywhere (video, checklist, transcript); "the official CAMS website" in narration; promise no more than the app's own "usually within five to ten minutes". No partnership claim; ask the manager to confirm before publishing (not legal advice).
- No analytics events (GA4 paused); keep step and open labels only as test ids. Phone out of scope. No backend, no new dependency.

## Review Focus

- The first click: the browser refuses the floating window if an `await` runs before it; a test and a manual check prove the order (window first, then request, then CAMS).
- API absent, blocked by policy, or throws: the in-page checklist shows and the green button still works.
- Reload mid-journey: the window is gone, the saved step is offered, ticks kept, "Start over" clears them.
- Early tab switch back to Unifolio while the checklist is open: no skipped waiting step.
- Link press does not trigger the green button's side effects (no request, no CAMS tab, no navigation).
- Reduced motion: no auto-play; the text steps show.
- Dialog: Escape and outside click close it, focus returns to the link, the page behind stays where it was; the video is not fetched before open (network assertion).
- Screen reader and keyboard: the checklist items are real checkboxes in order with labels; focus moves into the window when it opens.
- A second family member: the checklist starts again at step 1.

## File Structure

| File | Responsibility |
|---|---|
| `frontend/src/features/import/tutorial/TutorialDialog.tsx` (new) | The pop-up: title "How to request your statement from CAMS", video, chapters (four steps), close, end action, watch again. |
| `frontend/src/features/import/tutorial/TutorialLink.tsx` (new) | The secondary link. |
| `frontend/src/features/import/tutorial/tutorialCopy.ts` (new) | Title, captions text, the four steps and the transcript (one place, the live form's words). |
| `frontend/src/features/import/tutorial/useTutorialPlayer.ts` (new) | Open/close, lazy source, reduced-motion rule, chapters. |
| `frontend/src/features/import/RequestCamsPath.tsx`, `WaitingForCasView.tsx` | Mount the link (part 1) and the checklist hook (part 2). |
| `frontend/src/features/import/checklist/useCamsChecklist.ts` (new) | Feature detection, open/close the window, steps, saved state, held-back upload jump. |
| `frontend/src/features/import/checklist/CamsChecklist.tsx` (new) | The checklist content for window and fallback. |
| `frontend/src/features/import/casResumeState.ts` | Saved step stored beside the resume marker (additive). |
| `frontend/public/tutorial/` (new) | Video, poster (still), captions text file. |

## Task list

| Task | What | Builder | Size | Part / wave |
|---|---|---|---|---|
| H-1 | Wave-start check; handoffs and packets | Claude | M | before part 1 |
| H-2 | Script, on-screen text and transcript matched to the live form | Claude | S | any time |
| H-3 | Red tests for the pop-up and the link | Codex | M | part 1 |
| H-4 | Pop-up and link look | Antigravity (G-a) | M | part 1 |
| H-5 | Build, frame-review and encode the final Look 2 video | Claude (the user supplies recordings) | L | part 1 (placeholder first) |
| H-6 | Logic: lazy source, reduced motion, end action, waiting-screen link; placeholder video | Codex | M | part 1 |
| H-7 | Spike: floating window from the import screen in Chrome and Edge | Codex, Claude | S | part 2 |
| H-8 | Red tests for the checklist (API faked) | Codex | M | part 2 |
| H-9 | Checklist logic, saved step, held-back jump, fallback | Codex | M | part 2 |
| H-10 | Checklist window, fallback panel and screen note look | Antigravity (G-b) | M | part 2 |
| H-11 | Hand test on real browsers (Chrome, Edge, fallbacks) | User, Claude | M | part 2 |
| H-12 | Whole-batch review; M2 and M4 notes | Claude | M | each part |

---

### Task H-2: Script and copy (Claude)

- [ ] **Step 1:** Final script (eight scenes, about 53 s: workbook section 3 table), on-screen text, the four chapter steps and the transcript, all in the live CAMS form's words. Put the strings in `tutorialCopy.ts` as the single source (a handoff for H-6). Flag the two mismatches with the app's screen text (F7) to the user; do not change screen text unprompted.

### Task H-3: Red tests for the pop-up and link

**Files:** Test: `frontend/src/features/import/tutorial/TutorialDialog.test.tsx`, `TutorialLink.test.tsx`, `frontend/src/features/import/RequestCamsPath.test.tsx`, `WaitingForCasView.test.tsx`.

- [ ] **Step 1: Write failing tests:** `link shows on the Request from CAMS screen and on the waiting screen and is visually secondary` (a text link, not a filled button); `pressing the link opens the dialog and does not call the CAMS request, open a tab or navigate`; `nothing is fetched (no video request) until the dialog opens`; `poster shows first`; `auto-plays on open when motion is allowed`; `with prefers-reduced-motion it does not start and the four steps show as text`; `no volume or mute control`; `chapters jump to a moment`; `Escape and outside click close it and focus returns to the link`; `at the end the green action behaves like the main button and closes the pop-up`; `Watch again restarts`; `transcript text is present beside the player`; `video source is a same-origin or own-storage URL, no third-party host`.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/features/import/tutorial src/features/import/RequestCamsPath.test.tsx src/features/import/WaitingForCasView.test.tsx`. Expected: FAIL.

### Task H-4: Pop-up and link look (Antigravity, lane G-a)

**Files:** `TutorialDialog.tsx`, `TutorialLink.tsx` (look only). Tests: H-3 (fixed).

- [ ] **Step 1: Packet** (orchestrator, at start): workbook section 6 drawings (the link, playing, finished), dialog width for 16:9, chapter chips, control styles, end state buttons, dark mode, focus states, the placeholder poster. "Do not touch": hooks, tests, other import files.
- [ ] **Step 2: Build.** **Step 3: Run** the H-3 files, `npx tsc -b`, `npx oxlint src/features/import`. Expected: PASS. Orchestrator screenshots at 1280x600, 1440x810, 1536x730, light and dark.

### Task H-6: Pop-up logic and placeholder video (Codex)

**Files:** Create `useTutorialPlayer.ts`, `tutorialCopy.ts`, `frontend/public/tutorial/` placeholder files; modify `RequestCamsPath.tsx`, `WaitingForCasView.tsx`.

**Interfaces:** `useTutorialPlayer(): { open: boolean; show(): void; hide(): void; autoPlay: boolean; src: string | null }` (`src` is `null` until `show()`); `TUTORIAL_VIDEO_URL` constant; the end action receives the same handler the green button uses (`onRequestStatement`).

- [ ] **Step 1:** H-3's tests drive it. **Step 2: Implement.** **Step 3: Run** the H-3 files plus `TwoPathImportContainer.test.tsx` and `ImportFlow.test.tsx`. Expected: PASS. Ship with a placeholder video so M2 can deploy before the real one exists.

### Task H-5: The final video (Claude builds it)

- [ ] **Step 1 (inputs from the user):** a fresh recording of the password step with a valid made-up password (the earlier one was rejected by the form); a real recording of the Unifolio request, upload and funds scenes once the pop-up and import screens exist (replacing the redrawn ones); a screenshot of the real CAMS email with details hidden for the inbox scene; confirmation that CAMS accepts a ten-year range when submitted; recorded with autofill off and a clean browser profile. The user's earlier CAMS recording is already used.
- [ ] **Step 2 (Claude):** Rebuild the scenes in code on the existing Look 2 build (`Docs/orchestration/video/look2-v5.mp4` is the current cut, 53 s, 30 fps), swapping each redrawn scene for the real capture, matching the workbook's Look 2 section 3 and 4 exactly; no audio track; captions burned into the picture; review frame by frame for stray details (tabs, bookmarks, autofill, notifications, any real name or address); encode 720p, small file, with a poster still and the transcript text file from H-2.
- [ ] **Step 3:** The file replaces the placeholder in `frontend/public/tutorial/` with no code change except the URL constant if it moves to storage. The user reviews the cut and the manager signs off that CAMS's name and page may appear (not legal advice). Final swap rides with M4 at the latest.

### Task H-7: Spike (part 2)

- [ ] **Step 1:** In Chrome and Edge, open a real floating window from the import screen click handler, copy the stylesheets into it, tick a box; check it with CAMS open in another tab and with the click ordering above; record the result in `Docs/orchestration/2026-11-xx-checklist-spike.md`. This decides whether the idea works as drawn; if the automatic open is blocked, switch to a second button first (workbook "a choice I have made for you").

### Task H-8: Red tests for the checklist

**Files:** Test: `frontend/src/features/import/checklist/useCamsChecklist.test.tsx`, `CamsChecklist.test.tsx`, `RequestCamsPath.test.tsx`.

- [ ] **Step 1: Write failing tests** (the API faked on `window.documentPictureInPicture`): `opens the window first, before the request and before opening CAMS`; `no support: the in-page checklist shows and the green button works`; `request throws NotAllowed: falls back`; `five items, "n of 5 done", the button grey until all ticked`; `steps move form, waiting, file ready`; `ticks and step are saved beside the resume marker`; `reload shows "Your checklist closed" with Reopen and Start over`; `second press focuses the existing window`; `early return to the tab does not jump to upload while the checklist is open`; `I have the file shows the upload screen and closes the checklist`; `next family member starts at step 1`; `checkboxes are real inputs in order with labels`; `nothing from the form is read or stored`; `styles are copied into the window`; `Continue without it link shows only where supported`.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/features/import/checklist src/features/import/RequestCamsPath.test.tsx`. Expected: FAIL.

### Task H-9: Checklist logic

**Files:** Create `useCamsChecklist.ts`, `CamsChecklist.tsx` (logic and structure; the look is H-10); modify `casResumeState.ts`, `RequestCamsPath.tsx`, `WaitingForCasView.tsx`.

**Interfaces:** `useCamsChecklist(requestId: string): { supported: boolean; open(): Promise<void>; close(): void; step: "form" | "waiting" | "ready"; ticks: boolean[]; toggle(i: number): void; mode: "window" | "panel" | "closed"; reopen(): Promise<void>; startOver(): void }`.

- [ ] **Step 1:** H-8's tests drive it. **Step 2: Implement** with the portal approach; all errors fall back, never throw to the user. **Step 3: Run** the checklist folder, `RequestCamsPath`, `WaitingForCasView`, `casResumeState.test.ts`, `tsc -b`, `oxlint`. Expected: PASS.

### Task H-10: Checklist window, fallback panel and screen note (Antigravity, lane G-b)

**Files:** the checklist component's styles and the screen note. Tests: H-8 (fixed).

- [ ] **Step 1: Packet** (orchestrator): workbook section 5 screens (request screen line, over CAMS, waiting, file ready, upload note, fallback, after a reload), window about 320x440, light-coloured, five items, ring with "5-10 min", spacing, collapse to a line of ticks when resized smaller.
- [ ] **Step 2: Build.** **Step 3: Run** the H-8 files, `tsc -b`, `oxlint`. Expected: PASS.

### Task H-11 / H-12

- [ ] **Step 1 (H-11, user with Claude):** Hand-test Chrome and Edge (Windows, Mac if available), Firefox and Safari fallback, reload, early return, closing by mistake, against the workbook edge-case table. This cannot be fully automated.
- [ ] **Step 2 (H-12):** A fresh adversarial reviewer reads the diff against Review Focus; merge `leapswitch-redesign` into `batch/h-tutorial`, rerun affected tests, merge in. Give the M2 guide (part 1) and the M4 guide (part 2 and the final video swap) their facts when those guides are written; add "check the live CAMS form against the script" to the staging check for any release that touches the import screens.

## Self-Review notes

- Spec coverage: item 5 (all of sections 2 to 7): link, pop-up, loading rules, hosting, accessibility, checklist, fallback, privacy.
- The video (H-5) is built by Claude in the chosen Look 2 style (Q3); the plan ships part 1 with `look2-v5.mp4` or a placeholder and swaps in the final cut by M4.
- Packets and handoffs: not written here, by instruction.
