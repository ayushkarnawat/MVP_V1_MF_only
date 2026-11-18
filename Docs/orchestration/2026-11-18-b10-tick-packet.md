# Packet B-10: the spinner turns into a tick (Antigravity, lane G-b, second of three; starts after B-8 is merged into `batch/b-journey`)
**Batch B, item 6.** Plan: `Docs/superpowers/plans/2026-11-17-batch-b-journey-plan.md` (Task B-10). **Design source: `Docs/orchestration/2026-11-12-batch-b-planning-workbook.html`, section 4**, the three laptop moments at 1280×600, 1440×810 and 1536×730: "0 s: spinner (as today, with today's text)", "2.5 s: the tick pops", "About 3 s: settled, texts changed". The workbook is the design: a deviation is a defect; if it and the real component disagree, stop and say so.

**Your clone:** `C:\Users\Ayush\ag-b10` (branch `ag/b10-tick`, cut from `batch/b-journey` **after B-8 is merged**; the orchestrator creates it and tells you the commit). Work only there. Never edit `D:\Unifolio code`. Never run a git command that changes anything.
**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), `Docs/orchestration/2026-11-18-palette-reference-for-workers.md`, then this packet.
You own `styles/auth-tokens.css` in lane G-b while you work (B-8 is done, B-12 comes after you). Add only what this packet lists.

## What happens on the "You're all set!" screen
- **0 s (today, unchanged):** the third status row spins (`active`) and reads `Preparing your dashboard` / `Your investments will come together in one view as your data becomes available.`; the left paragraph reads `We're importing your investment data and getting your dashboard ready. This may take a few minutes.`; the right heading reads `Getting your accounts ready`.
- **At 2.5 seconds** (a single timer of exactly 2500 ms): the third row turns `done` (a green check circle like the other two) **and pops**; then these texts change **together**:
  - third row title `Your dashboard is ready`, line `Go to my dashboard to start your journey.`
  - left paragraph `Your investment data is in and your dashboard is ready.`
  - right heading `Your accounts are ready`
- Nothing else changes: the grey card `While we fetch your data...`, the card `Accounts being imported`, `View details`, the headline `You're all set!`, the first two rows, the tick sketch on the right, the buttons. **The button is never held back** (it works at 0 s and after). **Nothing redirects by itself**, ever.
- A screen reader hears the change once, politely: a visually hidden region, `<p role="status" aria-live="polite" className="sr-only">`, **present from the start and empty**, that contains `Your dashboard is ready` after the tick. It must be the only `role="status"` element on the screen (the Done bar and the rows must not add another).
- The timer is created once, with `setTimeout(..., 2500)`, cleared on unmount, and never flips back.

## What to build
1. **`features/auth/redesign/finishCopy.ts`**: add constants (do not change the existing ones): `ALL_SET_PARAGRAPH_READY`, `ALL_SET_STATUS_READY` (an object with `label`, `description`, `state: "done"`), `ALL_SET_RIGHT_HEADING` (`Getting your accounts ready`) and `ALL_SET_RIGHT_HEADING_READY` (`Your accounts are ready`), with the exact strings above.
2. **`features/auth/redesign/AllSet.tsx`**: a `ready` state flipped by the 2500 ms timer in a `useEffect` (cleanup clears it). Before `ready` it renders exactly what it renders today; after, the three changed texts and the third row from `ALL_SET_STATUS_READY`. Add the polite region. Keep `onFinish`, `onViewDetails`, the busy/retry logic and every existing test hook.
3. **`features/auth/redesign/StatusRow.tsx`**: when a row **changes** from `active` or `pending` to `done` (compare with the previous render's state held in a ref) put the class `auth-tick-pop` on the check circle `<span>` (the one that holds the `Check` svg). A row that is `done` on its first draw never gets it. If `window.matchMedia?.("(prefers-reduced-motion: reduce)")` reports a match, never add it. Keep the spinner's `motion-reduce:animate-none`, the screen-reader state words, and `data-state`.
4. **`styles/auth-tokens.css`** (only this):
   - `@keyframes authTickPop` using **transform only**: `0%` `scale(1)`, `40%` `scale(1.25)` (the tick grows about 25 percent), `100%` `scale(1)` (settles to the size of the other ticks).
   - `.auth-tick-pop { animation: authTickPop 450ms ease-out 1; }` (once, not repeating).
   - Inside the **existing** `@media (prefers-reduced-motion: reduce)` block, **after** the existing `.auth-sketch { animation: none; }` rule (that rule must stay first and unchanged: `authGuards.test.ts` matches its exact text), add `.auth-tick-pop { animation: none; }`.
   No colour is changed in this task (the green switch is B-12's).

## Red tests (already written and committed; fixed, do not edit, weaken or delete)
**14 fail now.** Run these three files and confirm **14 failed** before you start: `src/features/auth/redesign/AllSet.test.tsx` (8 red), `src/features/auth/redesign/StatusRow.test.tsx` (3), `src/features/auth/redesign/authMotion.test.ts` (3).
When done all pass, and so do `authGuards.test.ts`, `authErrors.test.tsx`, `src/features/auth/OnboardingFlow*.test.tsx`, `src/features/auth/SoloCasUpload*.test.tsx` and everything else under `src/features/auth`.

## Files you may change
`frontend/src/features/auth/redesign/finishCopy.ts`, `AllSet.tsx`, `StatusRow.tsx`, `frontend/src/styles/auth-tokens.css`. Anything else: stop and report.
## Do not touch
`backend/**`, `frontend/src/mobile/**`, every `*.test.*` file, `InvestorProfile.tsx`, `OptionRow.tsx`, `ChipCheckbox.tsx` (B-12's), `LoginEntry.tsx`, `AuthEntryFlow.tsx`, `package.json`. The Profile screens and the phone screens must not change: search `frontend/src` for other readers of the constants you touch before you edit.

## Checks (PowerShell)
```
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-b10 test src/features/auth
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-b10 types
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-b10 lint src/features/auth src/styles
```

## Report (one block, nothing else)
Failing counts before (expect 14) and after; exact commands and results; `git status --short` (the four files, plus untracked docs); decisions the packet did not cover; anything you could not check (visual: the orchestrator screenshots the three moments at the three window sizes next to the workbook frames and sends exact differences); Open questions.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-palette-reference-for-workers.md
4. Docs/orchestration/2026-11-18-b10-tick-packet.md (your task: B-10)
Work only in C:\Users\Ayush\ag-b10 on branch ag/b10-tick. Tests first: run the three named test files and confirm 14 fail before you change anything. Never run a git command that changes anything. Do not touch backend/** or any file outside the packet's Files list.
When done, reply with the report block from the packet, nothing else.
```
