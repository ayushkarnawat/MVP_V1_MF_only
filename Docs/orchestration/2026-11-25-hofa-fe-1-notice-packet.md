# Packet HOFA-FE-1: the "A statement is being saved" notice and the completion note (Antigravity)
**Head of Family Part A, Task 4.** The red tests are written and committed (`hofa-rt-1`); the back end already sends the 409 `statement_being_saved` answer and the `discarded_review` flag (`hofa-be-1` and `hofa-be-2` committed): you build against the mocks in the tests, never the live back end. You make the red tests pass and change nothing else. **Spec (the design):** `Docs/orchestration/2026-11-24-head-of-family-d11-plan.html` (page version 16): **mockup 6** (the completion note) and **mockup 7** (the saving notice, both states). Plan: `Docs/superpowers/plans/2026-11-25-hof-part-a-plan.md` (Task 4).

**Your clone:** `C:\Users\Dell\ag-hofa` (branch `ag/hofa-ui`, cut from `batch/hofa` after `hofa-rt-1` merged). Work only there. Never edit anything outside it. Never run a git command that changes anything.
**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), `Docs/orchestration/2026-11-18-palette-reference-for-workers.md`, then this packet.
**If your tools cannot run WSL or npm (the sandbox on this machine may block them):** do **not** retry and do not use any bypass. Make the edits below exactly, re-read each edited file once for syntax, imports and strings, and report "checks not run (tools unavailable)": Claude runs every check and sends you exact differences.

## The owner's decisions (25 Nov 2026) that bind this task
- **D2 A:** when the last step of the Head of Family change answers that a statement is being saved, the person sees the owner's sentence **"A statement is being saved. Try again in a minute."** in a **calm, designed notice** (informational, not an error), with a visible countdown on a disabled button that becomes **Try again** after the minute. Nothing is lost and the codes stay valid.
- **D1 C:** if the change discarded an unfinished review, the **sign-in notice shown after the change** gets one extra quiet line saying so.
- Copy: the strings are fixed in `features/profile-v2/lib/headChangeCopy.ts` (already written): use those constants, write no wording of your own. Two of them are the owner's to confirm before merge (`STATEMENT_SAVING_REASSURE`, `REVIEW_DISCARDED_NOTE`); build with them as they are. No emojis; no em dashes; icons are lucide line icons.

## The data (what the tests give you)
- `completeHeadChange(requestId)` may reject with an `ApiError` whose `detail` is `{ code: "statement_being_saved", message: "A statement is being saved. Try again in a minute." }`; `parseHeadChangeError(err)` returns `{ code, message }`. A success resolves `{ status: "completed", logout_required: true, discarded_review?: boolean }`.
- `setSignInNotice(...)` accepts `{ title, body, extra? }` (the type is already updated); `LoginEntry` already renders `notice.title` and `notice.body` in an `AuthAlert tone="info"`.

## Files and exact edits (everything else stays)
1. **`frontend/src/styles/palette-tokens.css`: add the information tokens** (there are none today). In the light block (next to `--neg-bg`): `--info: #4F46E5; --info-text: #3730A3; --info-bg: #EEEDFC; --info-border: #D2CFF6;`. In **both** dark blocks (the `:root:not([data-theme="light"])` media block and the `[data-theme="dark"]` block, next to `--neg-bg`): `--info: #818CF8; --info-text: #818CF8; --info-bg: rgba(129, 140, 248, 0.14); --info-border: rgba(129, 140, 248, 0.30);`. Nothing else in that file changes.
2. **Create `frontend/src/features/profile-v2/components/StatementSavingNotice.tsx`** to the contract in `StatementSavingNotice.test.tsx` and `headChangeCopy.ts`: `export function StatementSavingNotice({ onRetry, seconds = SAVING_RETRY_SECONDS }: { onRetry: () => void; seconds?: number })`.
   - **DOM:** root `<div data-testid="statement-saving-notice" role="status" className="flex flex-col gap-3 rounded-xl border border-[var(--info-border)] bg-[var(--info-bg)] p-3 text-[var(--ui-text)]">`. Inside: a row `flex items-start gap-3` with (a) a tile `grid size-10 shrink-0 place-items-center rounded-[10px] bg-[var(--ui-elevated)] text-[var(--info)]` holding a lucide `Clock` icon (`size={20}`, `aria-hidden="true"`), and (b) a text column: the title `STATEMENT_SAVING_TITLE` (`text-[14px] font-semibold text-[var(--info-text)]`), the body `STATEMENT_SAVING_BODY` (`text-[13px]`), and the reassurance `STATEMENT_SAVING_REASSURE` (`mt-1 text-[12.5px] text-[var(--ui-text-muted)]`). Below the row, the retry button.
   - **Retry button:** `<button type="button" data-testid="saving-retry" data-clickable="" data-effect="retry" aria-live="off" ...>`; **disabled** while `remaining > 0` with classes `self-start rounded-[12px] bg-[var(--ui-divider)] px-4 py-2 text-[13px] font-semibold text-[var(--ui-text-muted)] cursor-not-allowed`; **enabled** with `self-start rounded-[12px] bg-[var(--pos)] px-4 py-2 text-[13px] font-semibold text-white cursor-pointer hover:bg-[var(--pos)]/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]` (white text on the green, owner decision QA-1 B). Label: `Try again in ${m}:${ss}` while counting (60 shows `1:00`, 59 shows `0:59`; write a small local `formatMinSec` with the same logic as `formatCountdown` in `ChangeHeadDialog.tsx`, which is not exported), and `Try again` at 0.
   - **Behaviour:** state `remaining` starts at `seconds`, a `setInterval` of 1000 ms decrements it (clear it on unmount and at 0); clicking the enabled button calls `onRetry` once; a disabled click does nothing. Reduced motion: no animation anywhere.
   - No hex, no `rgb(`, no literal strings (all text from the copy file), no `Intl`, no `console`, no `any`.
3. **`frontend/src/features/profile-v2/components/ChangeHeadDialog.tsx`:**
   - Delete the `import_in_progress` line of `REASON_SENTENCES` (about L63). An old server's `import_in_progress` then falls to the existing `"This family member is not eligible right now."`.
   - Add state `const [savingNotice, setSavingNotice] = useState(false);`. In the step-3 complete handler's catch (where `parseHeadChangeError` is used, about L469-473 and the `step3Error` assignments about L434-444 and L469-471): if `parsed.code === STATEMENT_SAVING_CODE` then `setSavingNotice(true)` and **do not** set `step3Error` (stay on step 3); clear `savingNotice` whenever a new attempt starts and when the person goes Back or Cancels.
   - Render, in place of the step-3 error block (about L937-940), `{savingNotice ? <StatementSavingNotice onRetry={() => { setSavingNotice(false); void handleComplete(); }} /> : step3Error ? (existing error block) : null}`. While `savingNotice` is true the main **Confirm the change** button is `disabled` (the retry button is the action).
   - `finishSignedOut()` (about L480-491): pass `res.discarded_review === true` from the complete response into it; in the `preview` branch build the notice as `{ title: "Head of Family changed", body: <existing body>, ...(discarded ? { extra: REVIEW_DISCARDED_NOTE } : {}) }` (the `extra` key must be **absent**, not `undefined`, when nothing was discarded: a test asserts `not.toHaveProperty("extra")`). The non-`preview` branch (the plain string notice) is unchanged.
   - Import the constants from `../lib/headChangeCopy`. Every other behaviour, string and class in the file stays exactly as it is.
4. **`frontend/src/features/auth/redesign/LoginEntry.tsx`** (about L146-152): when `notice` is an object with a non-empty `extra`, render **under the existing `AuthAlert`** one quiet box: `<div data-testid="notice-extra" className="flex items-start gap-2 rounded-[12px] bg-[var(--ui-card)] px-3 py-2 text-[12.5px] text-[var(--ui-text-muted)]"><FileText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{notice.extra}</span></div>` (lucide `FileText`). A string notice and an object without `extra` render exactly as today.
**Do not touch:** `backend/**`, `frontend/src/mobile/**`, any `*.test.*` file, `headChangeCopy.ts`, `features/auth/types.ts`, `session.ts`, any other file.

## States (what must be true, light and dark; Claude screenshots these)
| State | What renders |
|---|---|
| Step 3, complete answers `statement_being_saved` | the calm indigo-tinted notice under the review summary: clock tile, "A statement is being saved.", "Try again in a minute.", the reassurance, and a disabled grey button `Try again in 1:00` counting down; **no** red error text, no `role="alert"`; **Confirm the change** is disabled |
| After 60 seconds | the button turns green with white text and reads `Try again`; clicking it calls complete again with the same request |
| Second attempt succeeds | the normal completion path (sign-in notice, logout) |
| Second attempt answers saving again | the notice appears again with a fresh 1:00 countdown |
| Back or Cancel | the notice clears |
| Dark mode | the info tokens flip; the tile stays `--ui-elevated`; the text keeps contrast |
| Completion note on the sign-in screen | under the existing "Head of Family changed" alert, a quiet grey box with a small file icon and the discard sentence; only when a review was discarded |
| Keyboard | the retry button is focusable only when enabled (it is `disabled` while counting); Enter and Space activate it; 2px brand-green focus ring |

## Checks (PowerShell)
```
wsl.exe -d Ubuntu -- env UNIFOLIO_WT_ROOT=/mnt/c/Users/Dell/lanes UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash /mnt/c/Users/Dell/ag-hofa/Docs/orchestration/wave-fe-check.sh ag-hofa test src/features/profile-v2 src/features/auth
wsl.exe -d Ubuntu -- env UNIFOLIO_WT_ROOT=/mnt/c/Users/Dell/lanes UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash /mnt/c/Users/Dell/ag-hofa/Docs/orchestration/wave-fe-check.sh ag-hofa types
wsl.exe -d Ubuntu -- env UNIFOLIO_WT_ROOT=/mnt/c/Users/Dell/lanes UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash /mnt/c/Users/Dell/ag-hofa/Docs/orchestration/wave-fe-check.sh ag-hofa lint src/features/profile-v2 src/features/auth
```
Expected before your work: the `StatementSavingNotice` file is unloadable (the component does not exist), 5 more tests are red (3 in `ChangeHeadDialog.test.tsx`, 1 in `ChangeHeadDialog.fix.test.tsx`, 1 in `LoginEntry.test.tsx`), everything else passes. `features/profile-v2/guards.test.ts` and the auth guards must stay green.

## Done means
All tests in `src/features/profile-v2` and `src/features/auth` are green; `types` and `lint` clean; `git status --short` shows only the files listed above (plus untracked docs); no string written by you; no hex outside `palette-tokens.css`.

## Report (one block, nothing else)
Failing counts before and after (or "not run"); the exact commands and results; `git status --short`; decisions the packet did not cover; anything you could not check (visual); Open questions.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-palette-reference-for-workers.md
4. Docs/orchestration/2026-11-25-hofa-fe-1-notice-packet.md (your task: HOFA-FE-1)
Work only in C:\Users\Dell\ag-hofa on branch ag/hofa-ui. If your tools can run tests, run the named test files first and confirm the failing counts before you change anything; if WSL or npm is blocked, do not retry or bypass it: make the edits and report "checks not run (tools unavailable)", Claude runs the checks. Never run a git command that changes anything. Do not touch backend/**, frontend/src/mobile/**, any *.test.* file, or any file outside the packet's list. Use no wording of your own: every string is in headChangeCopy.ts. Reply with the report block from the packet, nothing else.
```
