# Handoff: hofa-rt-1 (Head of Family Part A; Task 3: front-end foundation, copy and red tests, Codex, FE-1a)
**Status:** READY TO RELAY (written 2026-11-25). **Approved:** the owner approved the plans on 25 Nov 2026 (all 30 design questions answered; "start" given).
**Parent plan:** `Docs/superpowers/plans/2026-11-25-hof-part-a-plan.md` (Task 3; read "Global Constraints" and "Review Focus"), master plan `Docs/superpowers/plans/2026-11-25-qa-patches-master-plan.md`. **Spec (the design):** `Docs/orchestration/2026-11-24-head-of-family-d11-plan.html` (page version 16, Part A, mockups 6 and 7, decisions D1 C and D2 A). If the spec, the plan and the code disagree, stop and say so.
**Worker:** Codex, front-end foundation only: types, one copy file, one small session change and **every red test of this front end**. It does **not** build the notice component or edit `ChangeHeadDialog.tsx` or `LoginEntry.tsx` (an Antigravity lane does, from a packet). **It cannot run WSL: write the tests, report BLOCKED on running; Claude runs them through `wave-fe-check.sh` (lane `hofa-rt`).** **Reviewer and committer:** Claude.
**Work in:** `C:\Users\Dell\lanes\unifolio-hofa-rt` (worktree, branch `batch/hofa-rt`). Never in the main checkout.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## What and why (owner decisions D1 C and D2 A, 25 Nov 2026)
The back end (committed: `hofa-be-1`, `hofa-be-2`) no longer blocks a Head of Family change for an import; `POST /auth/head-change/complete` now returns `discarded_review: bool` (additive) and may answer **409** with `detail = {"code": "statement_being_saved", "message": "A statement is being saved. Try again in a minute."}` when a confirm is saving at that exact moment (nothing written, the four codes still valid). The front end must: (1) stop showing "Finish or cancel the statement you are importing first." (the reason no longer exists; an old server's `import_in_progress` must still render the generic sentence, no crash); (2) show a **calm, designed notice with a countdown** and a Try again button when `complete` answers `statement_being_saved`; (3) add one extra line to the **sign-in notice** shown after the change when a review was discarded.

## Wave-start check (report drift, do not fix drift)
Verified by Claude on 25 Nov: `frontend/src/features/auth/types.ts` `HeadChangeCompleteResponse { status: "completed"; logout_required: boolean }` (~L82-85); `features/auth/session.ts` `SignInNotice { title: string; body: string }` (L3-6) with `setSignInNotice` and `getSignInNotice`; `features/profile-v2/components/ChangeHeadDialog.tsx` `REASON_SENTENCES` (L55-65, the `import_in_progress` entry at L63) and the fallback `?? "This family member is not eligible right now."` (~L622), `finishSignedOut()` (~L480-491) calling `setSignInNotice({title: "Head of Family changed", body: ...})`, `handleComplete` (~L505), `step3Error` (~L177, rendered ~L937); `features/profile-v2/lib/headEligibility.ts` has **no** import entry (its `FIXABLE_REASONS` has eight values), only the **test** `headEligibility.test.ts` lists `import_in_progress` in its local `NOT_FIXABLE` array (L6); `ChangeHeadDialog.fix.test.tsx` has a member `m-importing` with `reasons: ["import_in_progress"]` (L43, L51) and the assertion `screen.getByText("Finish or cancel the statement you are importing first.")` at ~L89; `ChangeHeadDialog.test.tsx` mocks `@/features/auth/api` (`completeHeadChange` is a `vi.fn()` resolved with `{status: "completed", logout_required: true}` at ~L148) and reads notices through `getSignInNotice()`; `LoginEntry.tsx` renders `notice` (string or object) with `AuthAlert tone="info"` (~L146-150). Report any difference.

## The contract (fixed here; do not rename or reshape)
```ts
// frontend/src/features/profile-v2/lib/headChangeCopy.ts (new)
export const STATEMENT_SAVING_CODE = "statement_being_saved";
export const STATEMENT_SAVING_TITLE = "A statement is being saved.";
export const STATEMENT_SAVING_BODY = "Try again in a minute.";
export const STATEMENT_SAVING_REASSURE = "Nothing is lost, and your codes are still valid.";   // owner confirms before merge
export const REVIEW_DISCARDED_NOTE = "A statement you had uploaded but not yet confirmed was removed. Upload the file again when you are ready.";   // owner confirms before merge
export const SAVING_RETRY_SECONDS = 60;

// frontend/src/features/auth/types.ts
export interface HeadChangeCompleteResponse { status: "completed"; logout_required: boolean; discarded_review?: boolean }
// frontend/src/features/auth/session.ts
export interface SignInNotice { title: string; body: string; extra?: string }

// frontend/src/features/profile-v2/components/StatementSavingNotice.tsx (the Antigravity lane builds it to this contract; you write its tests)
export function StatementSavingNotice(props: { onRetry: () => void; seconds?: number }): JSX.Element   // default seconds = SAVING_RETRY_SECONDS
```
**Component behaviour the tests pin (fixed here):** root `data-testid="statement-saving-notice"` with `role="status"` (**not** `alert`); it shows `STATEMENT_SAVING_TITLE`, `STATEMENT_SAVING_BODY` and `STATEMENT_SAVING_REASSURE`; a retry `<button>` with `data-testid="saving-retry"`, `disabled` until the countdown reaches 0, label `Try again in ${formatCountdown(remaining)}` while counting (the existing helper in `ChangeHeadDialog.tsx` formats 60 as `1:00`, 59 as `0:59`) and `Try again` after; it counts down once per second from `seconds`; `onRetry` is called once per click and only when enabled.
**Other test ids fixed here:** sign-in notice extra line `data-testid="notice-extra"`; the dialog shows the notice in step 3 in place of the step-3 error text (step stays 3).

## Tests first (written and run before the code; red for the stated reason)
**New `features/profile-v2/components/StatementSavingNotice.test.tsx`** (fake timers; the component file does not exist yet, so the file is red for that reason): `shows_the_owner_sentence_and_the_reassurance`, `is_a_status_not_an_alert`, `counts_down_and_disables_try_again_until_zero` (label `Try again in 1:00`, then `0:59` after one second), `enables_try_again_after_the_countdown_and_calls_on_retry_once`, `a_shorter_seconds_prop_counts_from_that_value`.
**`ChangeHeadDialog.test.tsx`** (use the same mocking style as the existing step-3 tests; make `completeHeadChange` reject once with an `ApiError`-shaped error carrying `detail: {code: "statement_being_saved", message: "A statement is being saved. Try again in a minute."}` the way the neighbouring tests build rejections): `shows_the_saving_notice_and_keeps_step_3_when_complete_answers_statement_being_saved` (the `statement-saving-notice` is shown, the dialog stays on step 3, **no** `role="alert"` error text), `try_again_calls_complete_again_with_the_same_request` (after the countdown, the button calls `completeHeadChange` with the same request id; resolve the second call and see the normal completion), `the_completion_notice_has_an_extra_line_only_when_discarded_review_is_true` (resolve `{status: "completed", logout_required: true, discarded_review: true}`: `getSignInNotice()` is an object whose `extra === REVIEW_DISCARDED_NOTE`; with `discarded_review: false` or absent: no `extra`).
**`ChangeHeadDialog.fix.test.tsx`:** the member `m-importing` with `import_in_progress` stays in the fixture (it now models an **old server**); change the assertion at ~L89 so the test named in the drift note keeps its meaning (the row is a disabled radio) and the sentence is the generic `This family member is not eligible right now.` (red until the lane removes the import entry); rename it `an_old_servers_import_reason_renders_the_generic_sentence_and_the_row_stays_disabled`.
**`features/profile-v2/lib/headEligibility.test.ts`:** remove `"import_in_progress"` from the local `NOT_FIXABLE` array (L6; the library itself is unchanged).
**`features/auth/api.test.ts`:** add `parseHeadChangeError_passes_the_saving_code_through` (beside the tests at ~L389-401: a rejected `ApiError` with that detail yields `{code: "statement_being_saved", message: "A statement is being saved. Try again in a minute."}`).
**The sign-in notice (`LoginEntry`):** in `features/auth/redesign/LoginEntry.test.tsx` if that file exists (otherwise in the test file that already renders `LoginEntry` with a `notice` object; say which): `renders_the_notice_extra_line_when_present` (a notice `{title, body, extra}` shows `extra` in an element with `data-testid="notice-extra"`) and `renders_no_extra_line_for_a_plain_notice`.
Report, for each existing test you changed, what it pinned and what you changed.

## Run these only (Claude runs them; you report BLOCKED on running)
Through `wave-fe-check.sh` lane `hofa-rt` (`wsl.exe -d Ubuntu -- env UNIFOLIO_WT_ROOT=/mnt/c/Users/Dell/lanes UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash <script> hofa-rt test <paths under src/>`): the files above plus `features/auth/session` tests if any. Baseline before any change: Claude records it in the Execution log. Expected after your work: the new and rewritten tests fail for the stated reasons; everything else still passes.

## Files you may touch
Create: `features/profile-v2/lib/headChangeCopy.ts`, `features/profile-v2/components/StatementSavingNotice.test.tsx`. Modify: `features/auth/types.ts` (only the one optional field), `features/auth/session.ts` (only the optional `extra`), and the test files named above (only the tests named above).
**Do not touch:** `backend/**`, `frontend/src/mobile/**`, `ChangeHeadDialog.tsx`, `LoginEntry.tsx`, any component or CSS file, `headEligibility.ts`.

## Constraints
No new dependency; no `package.json` change; no hex colours outside token CSS; no `parseFloat`, `toFixed`, `Intl.`, `console.`, `any`; **no em dashes in new strings; no emojis**; invented data only; git read-only; no deletion flags or recursive deletes. Tests first; red test files are fixed once written. `features/profile-v2/guards.test.ts` has a name list: you add no file there that it would reject (the copy file is `lib/headChangeCopy.ts`; if the guard rejects it, report it instead of editing the guard).

## Report format
One fenced block `CODEX REPORT: hofa-rt-1`: status (DONE, PARTIAL or BLOCKED); baseline HEAD; drift; which tests you expect to be red and why (you cannot run them); the existing tests you changed and what you changed in each; files created or changed with a one-line reason each; commands you tried and their exact errors; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Front-end foundation worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-25-hofa-rt-1-handoff.md (your task: hofa-rt-1, owner-approved)
Open Docs/superpowers/plans/2026-11-25-hof-part-a-plan.md (Task 3) for the context. Work only in C:\Users\Dell\lanes\unifolio-hofa-rt on branch batch/hofa-rt. Git is read-only. No deletion flags or recursive deletes. You write one copy file, two tiny type edits and the red tests; you do not build any component and you do not edit ChangeHeadDialog.tsx or LoginEntry.tsx. You cannot run WSL: write the tests carefully, and reply BLOCKED on running them (Claude runs them). Change only the files the handoff lists.
Reply with the CODEX REPORT block from the handoff, nothing else.
```
