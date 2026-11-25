# Head of Family Part A (D-11): a pending import never blocks the change: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read `Docs/orchestration/wave-common-rules.md` and the master plan `Docs/superpowers/plans/2026-11-25-qa-patches-master-plan.md` first; they win where they differ. This project runs on the **orchestrator and workers** strategy of M1 to M4 and the XIRR batch: **Claude orchestrates, Codex builds the back end (and the front-end foundation), Antigravity builds the front-end UI.**

**Goal:** Stop any waiting, abandoned, failed or old import from blocking a Head of Family change; discard an unfinished statement review inside the change and say so; and answer with a calm "A statement is being saved. Try again in a minute." notice when a confirm is saving at that exact moment.

**Architecture:** Remove the household-wide `import_in_progress` reason everywhere it is produced or shown (eligibility list, start-code step, start step, dialog, final step). Inside `complete_head_change`, after the existing row locks, settle the household's imports in one helper: refuse with a new 409 code if a confirm is saving, otherwise discard unfinished reviews with the existing `discard_member_reviews`. The completion response gains an additive flag that the sign-in notice turns into one extra line. No migration.

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy, Pydantic, pytest (back end). React, TypeScript, Vitest, Tailwind tokens, lucide-react (front end).

**Spec:** `Docs/orchestration/2026-11-24-head-of-family-d11-plan.html` (page version 16, all 30 questions answered; `https://claude.ai/artifact/62WKfZZgwLfjpMDdVV1sFH`). The page is the design: Part A, item "Head of Family", mockups 6 and 7, scenarios S1 to S11, decisions D1 C, D2 A, D3 A, D4 A. Where the page and the live code disagree, stop and ask the owner. **Not in this plan** (they are Plan HF-BCD, patch 2): closing waiting requests (Part B), the waiting card, Cancel by server id and the dialog's quiet line (Part C), the checklist decoupling and the Request page row (Part D).

## Who builds what

| Role | Does | Does not |
|---|---|---|
| **Claude (orchestrator)** | Task 0 (lane setup, drift check), the contract in this plan, every handoff and packet, merges, commits, **runs every back-end API and Postgres test itself**, screenshots, reviews, deploy guide | Write product code, change the interfaces below |
| **Codex (backend worker)** | Tasks 1 and 2 (back end and its tests), Task 3 (front-end foundation: types, copy file, red tests) | Run `TestClient` or async tests in its sandbox (it writes them, tries once, reports BLOCKED), run WSL, commit |
| **Antigravity (frontend worker)** | Task 4 (the saving notice, the completion note) | Touch `backend/**`, edit a red test, commit, change any copy |
Fallback if a worker runs out: memory "worker fallback order" (Antigravity Sonnet 5.5, then Gemini, then inline in Claude).

## Global Constraints

- **Owner decisions (25 Nov 2026), verbatim:** a pending or abandoned import must not stop a Head of Family change. **D1 C:** never block; **discard** an unfinished statement review inside the change and say so in the completion notice. **D2 A:** if a confirm is saving at that moment the person sees "A statement is being saved. Try again in a minute." **D3 A:** no known reason for the old rule; evidence decides. **D4 A:** the abandoned-review sweep is out of this work.
- **The eleven other reasons stay exactly as they are** and keep their order: `no_email`, `no_phone`, `same_email_as_head`, `same_phone_as_head`, `email_in_use`, `phone_in_use`, `pan_registered_elsewhere`, `no_pan`, `label_missing`, `account_pending_deletion`, `head_change_already_open`.
- **Back end additive only** (the old staging link shares this back end): one new 409 code (`statement_being_saved`), one new response field (`discarded_review`); no route removed. Dropping `import_in_progress` from the reasons list is safe for the old link (it can only ever see fewer reasons). **No migration; Alembic stays 0054.**
- The swap itself is unchanged: `is_head`, labels, contacts, identities, sessions and the undo token behave exactly as today; import rows other than unfinished reviews, and every PAN field of a non-review, are untouched.
- Plain words; **no em dashes**; no advice wording. The built copy never changes except where this plan names strings. New strings (**owner to confirm the two marked * before merge**): `A statement is being saved.` / `Try again in a minute.` (the owner's sentence, exact), `Nothing is lost, and your codes are still valid.`*, `A statement you had uploaded but not yet confirmed was removed. Upload the file again when you are ready.`*, the countdown button label `Try again in 0:52` (format of the existing `formatCountdown`) and `Try again`.
- Front-end guards: every `<button` has `data-clickable` and a `data-effect`; no hex or `rgb(` outside token CSS files; no `parseFloat`, `toFixed`, `Intl.`, `console.`, `any`; features may not import other features; `components/` may not import `features/*`. Colours only through app tokens. Phone UI (`frontend/src/mobile/**`) unchanged.
- Decimals, money and PAN rules unchanged; invented data only in tests; tests first, always; run only the affected tests; red test files are fixed once written.

## Review Focus

1. **A member with a review and a live PAN claim:** the swap proceeds, the review row is gone, the claim is released, `discarded_review` is true. [Task 2]
2. **A confirmed, failed or expired import, and a waiting CAMS request:** the swap leaves every one of them exactly as it was. [Tasks 1, 2]
3. **A `PROCESSING` row older than 65 minutes (`PENDING_PAN_TTL`):** treated as abandoned (discarded), not as "being saved", so a crashed worker cannot block a change forever. [Task 2]
4. **Two members, each with a review:** both are discarded in one call and the flag is true once. [Task 2]
5. **Retry after the saving notice with the same request:** the four codes are still valid and the second `complete` succeeds once the confirm has finished. [Tasks 2, 4]
6. **An old server's `import_in_progress` reason reaching the new dialog** (a deploy mid-flight): it renders the existing generic sentence, no crash. [Task 3]

## File Structure

| File | Responsibility |
|---|---|
| `backend/app/services/auth/head_eligibility.py` | Drop `import_in_progress` from `EligibilityReason`, the branch at ~L124-125 and `_has_open_import_or_pan_claim` |
| `backend/app/services/auth/head_change.py` | Drop it from `START_CODE_ELIGIBILITY_REASONS` and `_reason_error`; new `_settle_member_imports`; `HeadChangeResult.discarded_review` |
| `backend/app/services/auth/schemas.py`, `backend/app/api/auth.py` | `HeadChangeCompleteResponse.discarded_review`; the route passes it |
| `frontend/src/features/auth/types.ts`, `session.ts`, `redesign/LoginEntry.tsx` | Response type, `SignInNotice.extra`, one extra line on the sign-in notice |
| `frontend/src/features/profile-v2/lib/headChangeCopy.ts` (new) | The new strings and constants |
| `frontend/src/features/profile-v2/lib/headEligibility.ts`, `components/ChangeHeadDialog.tsx` | Drop the import reason and sentence; show the saving notice; set the notice `extra` |
| `frontend/src/features/profile-v2/components/StatementSavingNotice.tsx` (+ test, new) | The designed notice with the countdown |
| `frontend/src/styles/palette-tokens.css` | The information colour tokens, only if they do not exist yet |

## Lanes, branches and folders (this laptop; confirm each path when the packet is written)

Integration branch `batch/hofa` cut from `leapswitch-redesign`. One folder per lane, never the main checkout. Every prompt carries, above its code block: **worker, project folder to open, branch, new or reuse** (owner rule, 23 Nov).

| Lane | Tasks | Worker | Folder | Branch |
|---|---|---|---|---|
| BE | 1, then 2 (in order) | Codex | `C:\Users\Dell\lanes\unifolio-hofa-be` (new worktree) | `batch/hofa-be` |
| RT | 3 (FE-1a) | Codex | `C:\Users\Dell\lanes\unifolio-hofa-rt` (new worktree) | `batch/hofa-rt` |
| FE | 4 | Antigravity | `C:\Users\Dell\ag-hofa` (new clone) | `ag/hofa-ui` |
| Claude | 0, 5 (no product code) | Claude | `C:\Users\Dell\lanes\unifolio-hofa` (integration worktree; check lane `hofa`) | `batch/hofa` |
**Order:** Task 0, then Tasks 1 and 3 together (two Codex tasks, disjoint files), then Task 2 (after Task 1), then Task 4 (after Task 3 and the contract below), then Task 5.

## Handoff and packet rules

Same as `2026-11-24-xirr-vs-returns-plan.md` ("Handoff and packet rules"): Codex handoff `Docs/orchestration/2026-11-2x-hofa-<task>-handoff.md` from `.claude/skills/model-orchestration/references/handoff-doc-template.md` plus one line in `delegation-log.md`; Antigravity packet `Docs/orchestration/2026-11-2x-hofa-<task>-packet.md`, very detailed (exact copy, DOM, classes, states table, tokens, red tests, allowed and forbidden files, a paste-ready prompt). Claude screenshots the result next to the page's mockups 6 and 7 and sends exact differences back.

## Task 0: Wave-start check and lane setup (Claude)

**Files:** none changed. Output: a drift note appended to this plan's "Execution log".

- [ ] **Step 1:** `git fetch`; create `batch/hofa` from `origin/leapswitch-redesign`; create the three worker folders with the setup script; merge `leapswitch-redesign` into each worker branch before relaying a packet.
- [ ] **Step 2: Confirm the code this plan names still looks as described:** `member_eligibility(db, user, member_id) -> list[EligibilityReason]` and `_has_open_import_or_pan_claim` in `head_eligibility.py`; `complete_head_change(db, user, request_id, evidence) -> HeadChangeResult` taking row locks in the order User, HouseholdMember (by id), HeadChangeRequest, and re-checking eligibility inside the lock; `discard_member_reviews(db, member_ids) -> int` in `import_/preview_store.py`; `HeadChangeCompleteResponse` in `auth/schemas.py`; `REASON_SENTENCES` and `finishSignedOut()` in `ChangeHeadDialog.tsx`.
- [ ] **Step 3: Answer in the drift note:** (a) is `PROCESSING` written only by a confirm in progress, or also by parsing an upload (read `service.py:claim_session_for_confirm` and the upload path)? The plan treats a fresh `PROCESSING` row as "a statement is being saved" either way. (b) Does the front end have information colour tokens (`--info*`)? If not, Task 4 adds them. (c) Which component renders `SignInNotice` (expected `LoginEntry.tsx`)? (d) Is `Import.uploaded_at` set on every review row (Task 2 uses it to tell a stale `PROCESSING` row from a live one)? If a review row can have a null `uploaded_at`, say which column to use instead.
- [ ] **Step 4: Record the baseline:** run `backend/tests/services/auth/test_head_eligibility.py`, `test_head_change_swap.py`, `test_head_change_flow.py`, `test_head_change_undo.py`, `backend/tests/api/test_head_change_routes.py`, and the front-end `ChangeHeadDialog.test.tsx`, `ChangeHeadDialog.fix.test.tsx`, `headEligibility.test.ts`, `auth/api.test.ts`. Note which pass.

## Task 1: Eligibility no longer looks at imports (Codex, lane BE)

**Files:**
- Modify: `backend/app/services/auth/head_eligibility.py`, `backend/app/services/auth/head_change.py` (the set and `_reason_error` only)
- Test: `backend/tests/services/auth/test_head_eligibility.py`, `backend/tests/services/auth/test_head_change_flow.py`, `backend/tests/api/test_head_change_routes.py`

**Interfaces:**
- Produces: `EligibilityReason` is a `Literal` of exactly the eleven values listed in Global Constraints (`import_in_progress` gone); `member_eligibility` signature unchanged; `START_CODE_ELIGIBILITY_REASONS` loses `import_in_progress`; `_reason_error` has no import branch.

- [ ] **Step 1: Write the failing tests** (names fixed): in `test_head_eligibility.py` replace `test_import_in_progress_for_each_non_terminal_import_status` with `test_no_import_status_blocks_eligibility` (parametrised over **every** `ImportStatus`, built on `_eligible_household`, asserts `member_eligibility(...) == []`); replace `test_live_pan_claim_is_import_in_progress_but_an_expired_claim_is_not` with `test_a_live_pan_claim_does_not_block_eligibility`; keep `test_terminal_import_does_not_block_eligibility`; change `test_reasons_are_returned_in_the_documented_order` to the eleven-value order; add `test_reason_list_has_exactly_the_eleven_values` (`typing.get_args(EligibilityReason)` equals the list) and `test_each_of_the_other_eleven_reasons_still_blocks` (one parametrised case per remaining reason using the existing helpers). In `test_head_change_flow.py` add `test_start_code_and_start_succeed_while_a_cams_request_waits` (a `WAITING_FOR_USER` row, `source_tab="request"`, for the candidate) and `test_start_succeeds_with_an_unfinished_review_open`. In `test_head_change_routes.py` change `test_eligibility_reports_an_open_change_and_an_open_statement_import` (L652) so the import part asserts the reasons list has **no** import reason, and add `test_eligibility_route_has_no_import_reason_with_a_waiting_cams_request`.
- [ ] **Step 2: Run them; expected red** (service-level files: `pytest backend/tests/services/auth/test_head_eligibility.py -q`; the route file is written, tried once, reported BLOCKED if it stalls; Claude runs it).
- [ ] **Step 3: Implement:** shrink the `Literal`, delete the branch and `_has_open_import_or_pan_claim` (and imports they alone used: `Import`, `TERMINAL_STATES`), drop the set member and the `_reason_error` branch. One comment where the branch was: "A pending or abandoned import never blocks a head change (owner, 24 Nov 2026); unfinished reviews are settled inside `complete_head_change`."
- [ ] **Step 4: Claude runs the service tests and the route tests, and `ruff`/the project's lint command on the touched files.** Expected: green.
- [ ] **Step 5: Claude verifies the diff against the allowed list and commits** `fix(head-change): a pending import no longer blocks eligibility`.

## Task 2: Settle imports inside the change; the saving answer; the response flag (Codex, lane BE, after Task 1)

**Files:**
- Modify: `backend/app/services/auth/head_change.py` (`complete_head_change`, `HeadChangeResult`), `backend/app/services/auth/schemas.py` (`HeadChangeCompleteResponse`), `backend/app/api/auth.py` (`complete_head_change_route`)
- Test: `backend/tests/services/auth/test_head_change_swap.py`, `backend/tests/api/test_head_change_routes.py`, `backend/tests/functional_postgres/test_head_change_races.py` (extend)

**Interfaces:**
- Consumes: `discard_member_reviews(db: Session, member_ids: list[uuid.UUID]) -> int`; `PENDING_PAN_TTL` (`import_/pan_claims.py`); `ImportStatus.PROCESSING`; `Import.household_member_id`, `Import.uploaded_at`.
- Produces:
  ```python
  # head_change.py
  SAVING_CODE = "statement_being_saved"
  SAVING_MESSAGE = "A statement is being saved. Try again in a minute."
  def _settle_member_imports(db: Session, member_ids: list[uuid.UUID], now: datetime) -> bool   # True when at least one review was discarded
  @dataclass(frozen=True)
  class HeadChangeResult:  # existing fields unchanged, plus:
      discarded_review: bool = False
  # schemas.py
  class HeadChangeCompleteResponse(BaseModel):  # existing fields unchanged, plus:
      discarded_review: bool = False
  ```
- **Rule (decided; the signature and tests fix the rest):** `_settle_member_imports` runs inside `complete_head_change`, after the row locks and the eligibility re-check, **before any swap write**. It locks the household members' `Import` rows `FOR UPDATE`. If any has `status == PROCESSING` and `uploaded_at >= now - PENDING_PAN_TTL`, it raises `HeadChangeError(409, SAVING_CODE, SAVING_MESSAGE)` (nothing written, the request and its four codes untouched). Otherwise it calls `discard_member_reviews(db, member_ids)` (which also covers a stale `PROCESSING` row and releases PAN claims) and returns `result > 0`. The commit stays with `complete_head_change`; a failed swap rolls the discard back.

- [ ] **Step 1: Write the failing tests** (names fixed). Services (`test_head_change_swap.py`, built on `_household`, `_ready_request`, `_complete`, `_assert_unswapped`): `test_complete_discards_a_live_review_and_releases_its_pan_claim`, `test_complete_reports_no_discard_when_no_review_existed`, `test_complete_discards_reviews_of_two_members_and_reports_one_flag`, `test_complete_answers_statement_being_saved_while_a_confirm_is_processing` (code `statement_being_saved`, status 409, `_assert_unswapped`, the request still `verified`), `test_retry_after_the_saving_answer_succeeds_once_the_confirm_finished` (same request id), `test_a_stale_processing_row_is_discarded_not_blocking`, `test_change_leaves_import_rows_and_pan_fields_untouched` (confirmed, failed, expired and waiting-request rows), `test_undo_works_while_a_cams_request_waits`, `test_import_started_after_start_does_not_fail_the_final_step`. API: `test_complete_route_returns_the_discarded_review_flag` and `test_complete_route_409_body_for_a_saving_statement_has_code_and_message` (`detail == {"code": "statement_being_saved", "message": "A statement is being saved. Try again in a minute."}`). Postgres (extend `_swap_paused_inside_its_lock` use): `test_swap_with_a_waiting_cams_request_on_postgres`, `test_swap_and_confirm_do_not_interleave_on_postgres`.
- [ ] **Step 2: Run them; expected red.** Services run in Codex's sandbox; route and Postgres tests are written, tried once and reported BLOCKED if they stall; Claude runs them (`TEST_DATABASE_URL` for the Postgres file).
- [ ] **Step 3: Implement** `_settle_member_imports`, the two new fields, the route passing `discarded_review=result.discarded_review`. Call the helper once, at the point named in the Rule, with the same `now` the swap uses.
- [ ] **Step 4: Claude runs all the files, plus the whole `tests/services/auth` and `tests/api/test_head_change_*.py`.** Expected: green.
- [ ] **Step 5: Gate G1 (mandatory):** `codex:codex-rescue` runs `/codex:adversarial-review` against the Task 1 and 2 diff (read-only, background); the owner relays the report by hand. Findings close only by a fix with a red test first, or by the owner accepting them. Then Claude commits `feat(head-change): discard an unfinished review inside the change; answer while a confirm is saving`.

## Task 3: Front-end foundation: types, copy, red tests (Codex, lane RT; FE-1a)

**Files:**
- Create: `frontend/src/features/profile-v2/lib/headChangeCopy.ts`, `frontend/src/features/profile-v2/components/StatementSavingNotice.test.tsx`
- Modify: `frontend/src/features/auth/types.ts`, `frontend/src/features/auth/session.ts`, `frontend/src/features/profile-v2/lib/headEligibility.ts`, `frontend/src/features/profile-v2/lib/headEligibility.test.ts`, `frontend/src/features/profile-v2/components/ChangeHeadDialog.fix.test.tsx`, `ChangeHeadDialog.test.tsx`
- Does **not** build the component or edit `ChangeHeadDialog.tsx` (Task 4).

**Interfaces (the contract: fixed here by the orchestrator, built by the worker):**
- Produces:
  ```ts
  // headChangeCopy.ts
  export const STATEMENT_SAVING_CODE = "statement_being_saved";
  export const STATEMENT_SAVING_TITLE = "A statement is being saved.";
  export const STATEMENT_SAVING_BODY = "Try again in a minute.";
  export const STATEMENT_SAVING_REASSURE = "Nothing is lost, and your codes are still valid.";
  export const REVIEW_DISCARDED_NOTE = "A statement you had uploaded but not yet confirmed was removed. Upload the file again when you are ready.";
  export const SAVING_RETRY_SECONDS = 60;
  // auth/types.ts
  export interface HeadChangeCompleteResponse { status: "completed"; logout_required: boolean; discarded_review?: boolean }
  // auth/session.ts
  export interface SignInNotice { title: string; body: string; extra?: string }
  // StatementSavingNotice.tsx (Task 4 builds it to this contract)
  export function StatementSavingNotice(props: { onRetry: () => void; seconds?: number }): JSX.Element  // default seconds = SAVING_RETRY_SECONDS
  ```
  `StatementSavingNotice` renders `data-testid="statement-saving-notice"` with `role="status"` (not `alert`); title, body and reassurance lines from the copy file; a `Close` button (`data-testid="saving-close"`, only calls an optional `onClose`) is **not** part of the contract: the dialog's own Cancel stays; the retry button is `data-testid="saving-retry"`, `disabled` until the countdown reaches 0, label `Try again in ${formatCountdown(remaining)}` while counting and `Try again` after; it counts down once per second from `seconds`.
- `headEligibility.ts` `NOT_FIXABLE` loses `import_in_progress`.

- [ ] **Step 1: Write the failing tests** (names fixed): `StatementSavingNotice.test.tsx`: `shows_the_owner_sentence_and_the_reassurance`, `is_a_status_not_an_alert`, `counts_down_and_disables_try_again_until_zero` (fake timers; label `Try again in 1:00` then `0:59`), `enables_try_again_after_the_countdown_and_calls_on_retry_once`, `does_not_use_hex_colours` is the repository guard's job, not a test here. `ChangeHeadDialog.test.tsx`: `shows_the_saving_notice_and_keeps_step_3_when_complete_answers_statement_being_saved`, `try_again_calls_complete_again_with_the_same_request`, `an_unknown_reason_renders_the_generic_sentence` (also covers an old server's `import_in_progress`), `the_completion_notice_has_an_extra_line_only_when_discarded_review_is_true` (assert the `setSignInNotice` argument: `extra === REVIEW_DISCARDED_NOTE` or absent). `ChangeHeadDialog.fix.test.tsx`: delete the `m-importing` import-reason assertion (L43-51, L89) and replace the test named in the drift note with one that asserts a member with the other unfixable reasons still stays a disabled row. `headEligibility.test.ts`: update `NOT_FIXABLE`. `auth/api.test.ts`: add `parseHeadChangeError_passes_the_saving_code_through`.
- [ ] **Step 2: Run them; confirm they fail** (through `wave-fe-check.sh`, lane `hofa-rt`).
- [ ] **Step 3: Implement** the types, the copy file, the `NOT_FIXABLE` edit; leave `ChangeHeadDialog.tsx` and the component for Task 4. Codex reports BLOCKED on running (no WSL); Claude runs `npx vitest run` on the touched files, `npx tsc -b` and `npx oxlint`.
- [ ] **Step 4: Claude verifies against the allowed list and commits** `feat(head-change): front-end types, copy and red tests for the saving notice`.

## Task 4: The saving notice and the completion note (Antigravity, lane FE)

**Files:**
- Create: `frontend/src/features/profile-v2/components/StatementSavingNotice.tsx`
- Modify: `frontend/src/features/profile-v2/components/ChangeHeadDialog.tsx` (remove the import entry of `REASON_SENTENCES` at ~L63; handle the saving code in the step 3 complete handler; set `extra` in `finishSignedOut()`), `frontend/src/features/auth/redesign/LoginEntry.tsx` (render `notice.extra` as a second quiet box), `frontend/src/styles/palette-tokens.css` (information tokens only if missing)
- Do not touch `backend/**`, `frontend/src/mobile/**`, any `*.test.*`, or any copy other than the strings in Task 3.

**Interfaces:** Consumes Task 3's contract exactly. Produces nothing new for later tasks.

The packet (written by Claude) carries: mockups 6 and 7 of the page as the visual spec (informational indigo tint `#EEEDFC` with border `#D2CFF6`, text `#3730A3`, icon `#4F46E5`, light and dark, **as tokens**; a 40px rounded-square tile with a 20px line icon in the news-list style (`lucide-react` `Clock`); the disabled button with a visible countdown; the completion note as a quiet grey box with a small file icon under the existing notice), a **states table** (waiting, ready after the minute, dark, reduced motion, keyboard focus), the exact DOM and `data-testid`s of Task 3, the Tailwind and token names, accessibility (`role="status"`, the retry button focusable only when enabled, the countdown text read once per ten seconds, not every second), and the red tests it must turn green.

- [ ] **Step 1: Antigravity runs the Task 3 tests and shows them red** (`wave-fe-check.sh ag-hofa test <files>`).
- [ ] **Step 2: Build** `StatementSavingNotice` and the three edits to the contract; keep every existing class on untouched elements.
- [ ] **Step 3: Tests, `types`, `lint`, `build` green** through the script; report block.
- [ ] **Step 4: Claude screenshots the notice (both states) and the completion note next to mockups 6 and 7 at 1280x600 and 1440x810, light and dark,** sends exact differences back; the worker fixes only those. Claude commits `feat(head-change): saving notice and completion note`.

## Task 5: Integration, gates, QA rows, docs (Claude)

- [ ] **Step 1: Integrate** `batch/hofa-be`, `batch/hofa-rt`, `ag/hofa-ui` into `batch/hofa`; run the full affected back-end and front-end test sets, `tsc`, `oxlint`, `npm run build`.
- [ ] **Step 2: G2:** a fresh read-only Sonnet reviewer reads the front-end diff against this plan's Review Focus, mockups 6 and 7 and the no-copy-change rule. **G3:** whole-branch review before deploy by a different Sonnet reviewer (Opus only if the owner approves it first).
- [ ] **Step 3: QA rows and acceptance** in `Docs/orchestration/2026-11-19-combined-qa-checklist.md`: rows HF-01 to HF-08 from the page's acceptance list (waiting request does not block; full change with a waiting request; the four emails **M1-17 to M1-19** (Gmail web, Gmail app, Apple Mail, Outlook; undo email; "changed back" email); a statement imported the same day; an unfinished review discarded and the note shown; the saving notice and Try again; the other eleven reasons still block). Note M1-17 to M1-19 are the rows the original defect blocked.
- [ ] **Step 4: Docs:** `decisions.md` line (done in the planning pass; add the as-built note), `session.md`, ADR-007 one line, delegation log lines. The deploy belongs to patch 1 (master plan): the guide is written there.

## Self-review against the page

Part A bullets covered: never look at imports (Tasks 1, 2); discard the review and say so (Task 2 flag, Task 4 note); saving notice (Tasks 2, 3, 4); D3 and D4 recorded, nothing built. Scenarios S1, S2, S3, S8, S9, S10, S11 are pinned by the named tests (S3 and S8 by the "waiting request" and "stale row" tests; S9 by the discard tests; S10 by the saving tests; S11 by `test_import_started_after_start_does_not_fail_the_final_step`). S4 to S7, S12 to S15 belong to Plan HF-BCD or are unchanged behaviour.

## Execution log

*(Claude appends below: drift note, deviations, gate results, deploy record link.)*
