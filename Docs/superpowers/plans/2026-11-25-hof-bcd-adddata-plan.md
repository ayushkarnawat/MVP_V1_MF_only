# Head of Family Parts B, C, D and D-2: the Add data flow and the floating checklist: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Read `Docs/orchestration/wave-common-rules.md` and the master plan `Docs/superpowers/plans/2026-11-25-qa-patches-master-plan.md` first; they win where they differ. Strategy as in M1 to M4 and the XIRR batch: **Claude orchestrates, Codex builds the back end and the front-end foundation, Antigravity builds the UI from very detailed packets.** This is **patch 2** and starts after patch 1 is merged (Plan 1 Part A and Plan 3 lane V1 change files this plan touches).

**Goal:** Close a waiting CAMS request when its statement is imported; show a waiting request from the server with a Cancel that always works; make the floating checklist a pure reading aid connected to nothing; make the "Continue without it" line easy to see and reversible; and, after a short test, make "Request from CAMS" go straight to CAMS with the checklist floating over it and no extra button.

**Architecture:** Back end: one helper closes a member's waiting request at import time, one read route returns the waiting request (and one the fixed CAMS address), a head-change eligibility flag drives the dialog's quiet line, and a one-off script cleans up old stuck requests (dry run first). Front end: Add data chooses its screen from the server, not from browser notes; the checklist loses every tie to the screen and to the request except "it opens first in the click"; the Request page gets the visible "Continue without it" row; D-2 turns the Request button into a real link only if a short browser test passes.

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy, pytest (back end). React, TypeScript, Vitest, Tailwind tokens, lucide-react (front end); a static test page for D-2.

**Spec:** `Docs/orchestration/2026-11-24-head-of-family-d11-plan.html` (page version 16): Head of Family **Parts B, C, D**, mockups 1 to 5, scenarios S1 to S15, item 2 (D-2), decisions **Q1 A, Q2 (mockup 5), Q3 A, Q4 B, Q5 A, Q6 A, Q7 A, QA-2 A**. Where the page and the live code disagree, stop and ask the owner. Part A is Plan 1 (patch 1).

## Global Constraints

- **Owner decisions (25 Nov, verbatim where they fix a value):** a waiting request closes only for **the member whose statement was imported** (Q6 A); Cancel finds the request through the server (Q5 A: "Ask the server and cancel by that id"); a one-off clean-up script, **dry run first**, closes requests that have a later import or are past 48 hours (Q7 A); "Start over" becomes **"Reset checklist"** and only resets the checklist; Cancel request stays a separate button (Q3 A); the dialog shows **one quiet line, no button** when a request waits (Q4 B); the checklist is **a reading aid connected to nothing** (the page's Part D); D-2: **one click on Request from CAMS must land on CAMS with the checklist floating over it, no extra button or screen**, built **only if the short test passes** (QA-2 A).
- **Back end additive only** (the old staging link shares this back end): new routes `GET /cas-imports/pending` and `GET /cas-imports/cams-link`; one new additive per-member field `waiting_cams_request` on the head-change eligibility list; no route or field removed; the existing cancel route unchanged. **No migration; Alembic stays 0054.** The state machine allows `WAITING_FOR_USER` only to `UPLOAD_STARTED` or `EXPIRED`: closing a request sets `EXPIRED`.
- **New strings (the owner confirms those marked * before merge; every other string already exists and does not change):** `Reset checklist` (replaces `Start over`); `CAMS request waiting`; `for ${name}`*; `We will use the file as soon as you upload it.`*; `Expires in ${hours} h`*; `Show checklist`*; `Reopen checklist` (exists); `Upload the file`*; `Cancel request` (exists); `A CAMS request for ${name} is still waiting. It does not stop this change.` (the page's mockup 4); `Checklist off for this request.`*; `CAMS will open on its own.`*; `Turn it back on`*. The checklist's own step titles stay the existing `panelTitle` and `panelStepTitles`; the page's mockup 3 "Step 1 of 3" chip is **not** built (it would renumber the flow) unless the owner confirms it.
- Plain words; **no em dashes in new strings**; no advice wording; no emojis; icons are lucide line icons.
- Front-end guards: `features/import/checklist/checklistLook.guard.test.ts` scans `CamsChecklist.tsx`, `CamsChecklistHost.tsx`, `RequestCamsPath.tsx`, `TwoPathImportContainer.tsx`: no hex or `rgb(`, every `<button` has `data-clickable` and a `data-effect` from {open, switch, retry, close, select, expand, navigate, sort}, no bare JSX text literals in the two checklist files (copy comes from `checklistCopy`); hex only in `checklist-tokens.css`; every `<a` used as a control carries `data-clickable` and `data-effect`. New files in `features/import` are added to that guard's list. No parseFloat, toFixed, `Intl.`, `console.`, `any`; features may not import other features. Phone UI (`frontend/src/mobile/**`) unchanged **except** that nothing there may break: it uses `requestCamsStatement`, `setCasResumeStep2`, `hasCasResumeStep2` and `clearCasResumeStep2`, which stay.
- Tests first, always; run only the affected tests; red test files are fixed once written. Codex does not run `TestClient` or async tests nor WSL in its sandbox (it writes them, tries once, reports BLOCKED; Claude runs them through the Windows venv and `wave-fe-check.sh`).

## Review Focus

1. **A member with a waiting request and a confirmed import of another member in the same statement:** only the imported member's request closes. [Task 1]
2. **A request past its 48 hours that the nightly job has not yet swept:** `GET /cas-imports/pending` does not return it (expiry is read from `expires_at`, not only the status). [Task 3]
3. **Reload during a waiting request:** Add data shows the waiting card and the waiting view with the **real** import id; Cancel works (today it is sent as `pending-import`). [Tasks 3, 6]
4. **The floating window refused or unsupported:** the request still goes through and CAMS still opens; the in-page panel appears; nothing waits on the checklist. [Tasks 7, 9]
5. **A second device:** the waiting card shows on any device and after any reload, with no checklist notes. [Task 6]
6. **Reset checklist and Close:** neither cancels nor changes the server request; Cancel request does not depend on the checklist. [Task 7]
7. **The phone:** requests, resume markers and cancel behave exactly as today. [Tasks 5, 8]
8. **The head-change dialog with several members, some with a waiting request:** one quiet line per affected member, nothing blocked, no button. [Tasks 4, 8]

## File Structure

| File | Responsibility |
|---|---|
| `backend/app/services/import_/state_machine.py` | `CAMS_PLACEHOLDER_STATUSES` moves here from `api/imports.py` |
| `backend/app/services/import_/cams_portal.py` | `close_member_requests`, `get_pending_request` |
| `backend/app/services/import_/confirm_people.py`, `deletion.py` | Close on import; the "statement left" check ignores placeholders |
| `backend/app/api/cas_imports.py`, `backend/app/api/imports.py` | The two read routes; the constant's import |
| `backend/app/services/auth/head_change.py`, `schemas.py`, `backend/app/api/auth.py` | `waiting_cams_request` on the eligibility list |
| `backend/scripts/close_stuck_cams_requests.py` (new) | One-off clean-up (dry run by default) |
| `frontend/src/features/import/api.ts`, `usePendingCamsRequest.ts` (new), `pendingCopy.ts` (new), `CamsWaitingCard.tsx` (new) | Server read, hook, copy, the waiting card |
| `frontend/src/features/import/TwoPathImportContainer.tsx`, `WaitingForCasView.tsx` | Screen chosen from the server; Cancel by the real id; no checklist coupling |
| `frontend/src/features/import/RequestCamsPath.tsx`, `checklist/*` | Decoupling, the visible "Continue without it" row, the status strip and progress bar, "Reset checklist"; D-2 link button |
| `frontend/src/features/profile-v2/components/ChangeHeadDialog.tsx`, `lib/headEligibility.ts` | The quiet line |
| `Docs/orchestration/spike/checklist-spike/*` (branch `batch/h-spike`) | The D-2 test page |

## Lanes, branches and folders (confirm each path when a handoff or packet is written)

Integration branch `batch/hbcd` cut from `patch/qa2` (itself cut after patch 1 is merged). Every prompt carries, above its code block: **worker, project folder to open, branch, new or reuse** (owner rule, 23 Nov).

| Lane | Tasks | Worker | Folder | Branch |
|---|---|---|---|---|
| BE | 1, 2, 3, 4 (in order) | Codex | `C:\Users\Dell\lanes\unifolio-hbcd-be` (new worktree) | `batch/hbcd-be` |
| RT | 5 | Codex | `C:\Users\Dell\lanes\unifolio-hbcd-rt` (new worktree) | `batch/hbcd-rt` |
| SP | 9 (test page) | Codex | `C:\Users\Dell\lanes\unifolio-hbcd-sp` (worktree on `batch/h-spike`) | `batch/h-spike2` |
| FE-1 | 6 | Antigravity | `C:\Users\Dell\ag-hbcd1` (new clone) | `ag/hbcd1-server-screen` |
| FE-2 | 7 | Antigravity | `C:\Users\Dell\ag-hbcd2` (new clone) | `ag/hbcd2-checklist` |
| FE-3 | 8 | Antigravity | `C:\Users\Dell\ag-hbcd3` (new clone) | `ag/hbcd3-dialog` |
| FE-4 | 10 (only if the test passes) | Antigravity | `C:\Users\Dell\ag-hbcd4` (new clone) | `ag/hbcd4-link` |
| Claude | 0, 11 | Claude | `C:\Users\Dell\lanes\unifolio-hbcd` (integration; check lane `hbcd`) | `batch/hbcd` |
**Order:** Task 0; then BE (Tasks 1 to 4), RT (Task 5) and SP (Task 9) in parallel (disjoint files; two Codex tasks at once at most, so SP waits for the first to finish); then FE-1, FE-2, FE-3 in parallel when RT is verified (FE-1 and FE-2 touch different files, see the table); the owner runs the D-2 test; if it passes, FE-4 after FE-2 merges; Task 11.

## Handoff and packet rules

As in the master plan. Antigravity packets are **very detailed**: the mockup numbers of the page (2 to 5), every string (existing and new, marked), exact DOM, `data-testid`s and classes, a states table (card waiting, closed checklist, panel mode, dark, focus), tokens, accessibility, the red tests, commands, allowed and forbidden files, and a paste-ready prompt. Claude screenshots each result next to the page's mockups (1280x600, 1440x810, 1536x730, light and dark) and sends exact differences back.

## Task 0: Wave-start check and lane setup (Claude)

- [ ] **Step 1:** confirm patch 1 is on `leapswitch-redesign`; cut `patch/qa2` and `batch/hbcd`; create the worker folders; add lane lines to `wave-fe-check.sh`.
- [ ] **Step 2: Confirm the code this plan names still looks as described:** `initiate_cams_request(db, user_id, household_member_id) -> tuple[Import, str]`, `cancel_pending_request(db, import_id, user_id) -> Import`, `expire_stale_cams_requests(db, now=None) -> int` in `cams_portal.py`; `POST /cas-imports/request` and `POST /cas-imports/{import_id}/cancel` in `cas_imports.py`; `_CAMS_PLACEHOLDER_STATUSES` in `api/imports.py` (~L104); the per-person Import creation in `confirm_people.py` (~L324, `status=CONFIRMED`, `household_member_id=member.id`); `deletion.py` (~L164); `list_member_eligibility` (`head_change.py` ~L805) and `GET /auth/head-change/eligibility`; the front-end items listed in the File Structure, and `checklistStore.open()` calling `requestWindow` **before any await**.
- [ ] **Step 3: Answer in the drift note:** (a) does the state machine allow `REQUESTING_CAS` to `EXPIRED`? (Task 1 closes `REQUESTING_CAS` too only if it does.) (b) what exactly is the eligibility response model per member (field names)? (c) `ChangeHeadDialog` member row: where would a quiet line go? (d) `TwoPathImportContainer` receives `memberId` only: is a member **name** reachable without importing another feature (a prop from the shell wrapper)? (e) `checklistStore.open()`: confirm `requestWindow` is the first awaited-free call in the click.
- [ ] **Step 4: Record the baseline:** run the back-end files named in the Tasks and the front-end `TwoPathImportContainer.test.tsx`, `RequestCamsPath.test.tsx`, `WaitingForCasView.test.tsx`, `checklist/*.test.*`, `ChangeHeadDialog*.test.tsx`, `checklistLook.guard.test.ts`; note which pass.

## Task 1: Close a member's waiting request when their statement is imported (Codex, lane BE)

**Files:**
- Modify: `state_machine.py`, `cams_portal.py`, `confirm_people.py`, `deletion.py`, `backend/app/api/imports.py` (import the moved constant)
- Test: `backend/tests/services/import_/test_cams_portal.py`, `test_state_machine.py`, `backend/tests/api/test_import_history_delete_routes.py`, `backend/tests/services/import_/` confirm tests (the file that covers `confirm_people_import`)

**Interfaces:**
- Produces:
  ```python
  # state_machine.py
  CAMS_PLACEHOLDER_STATUSES: tuple[ImportStatus, ...] = (ImportStatus.REQUESTING_CAS, ImportStatus.WAITING_FOR_USER, ImportStatus.EXPIRED)
  # cams_portal.py
  def close_member_requests(db: Session, member_ids: Sequence[uuid.UUID]) -> int   # EXPIRED via transition_status; only the given members; returns how many closed; no commit
  ```
- **Rule:** `confirm_people.py` calls `close_member_requests(db, [member.id])` for **each member whose person-import row it creates** (right after that row's `db.flush()`), inside the same transaction. `deletion.py`'s "statement left" query adds `Import.status.notin_(CAMS_PLACEHOLDER_STATUSES)` so a member with only a placeholder counts as having no statement.

- [ ] **Step 1: Write the failing tests** (names fixed): `test_confirming_an_import_closes_the_members_waiting_request`, `test_confirm_closes_only_that_members_request` (two members in one statement plus a third member with a waiting request that stays open), `test_close_member_requests_leaves_other_statuses_alone`, `test_a_member_with_only_a_waiting_request_is_handled_as_having_no_statement` (`deletion.py`), `test_placeholder_constant_is_the_one_the_history_route_uses`, `test_cancel_still_closes_the_request`.
- [ ] **Step 2: Run; expected red** (service-level run in the sandbox; route tests written, tried once, BLOCKED if they stall; Claude runs them).
- [ ] **Step 3: Implement** the move, the helper and the two call sites to the contract.
- [ ] **Step 4: Claude runs the files and `ruff`; green.** **Step 5: Claude verifies against the allowed list and commits** `feat(import): an import closes its member's waiting CAMS request`.

## Task 2: The clean-up script (Codex, lane BE)

**Files:** Create `backend/scripts/close_stuck_cams_requests.py`, `backend/tests/scripts/test_close_stuck_cams_requests.py`.

**Interfaces:** Consumes `close_member_requests`, `expire_stale_cams_requests`. Produces `python scripts/close_stuck_cams_requests.py [--apply]`: **dry run by default** (the write guard pattern of `scripts/measure_home_staging.py`: aborts on any flush or raw write); with `--apply` it closes (EXPIRED, committed in batches) every `WAITING_FOR_USER` request that is past `expires_at` **or** whose member has a later confirmed import (`confirmed_at` after the request's `uploaded_at`); prints only counts (`past_expiry`, `later_import`, `would_close` or `closed`, `left_open`), never names, folios or ids.

- [ ] **Step 1: Write the failing tests:** `test_dry_run_counts_and_writes_nothing`, `test_apply_closes_expired_and_superseded_requests_and_leaves_live_ones`, `test_other_members_requests_are_not_touched`, `test_output_has_no_names_or_ids`, `test_aborts_on_any_write_attempt_in_dry_run`.
- [ ] **Step 2: Run; red. Step 3: Implement. Step 4: Claude runs; green. Step 5: Claude commits** `chore(import): one-off clean-up of stuck CAMS requests (dry run first)`.

## Task 3: Read the waiting request and the CAMS address (Codex, lane BE)

**Files:** Modify `cams_portal.py`, `backend/app/api/cas_imports.py`; test `backend/tests/api/test_cams_request_routes.py`, `backend/tests/services/import_/test_cams_portal.py`.

**Interfaces:**
- Produces:
  ```python
  # cams_portal.py
  def get_pending_request(db: Session, user_id: uuid.UUID, member_id: uuid.UUID, now: datetime | None = None) -> Import | None   # WAITING_FOR_USER and expires_at > now
  # cas_imports.py
  class CASPendingRequest(BaseModel): import_id: str; household_member_id: str; expires_at: datetime
  class CASPendingResponse(BaseModel): pending: CASPendingRequest | None
  # GET /cas-imports/pending?member_id=<uuid>  -> CASPendingResponse        (get_data_user + require_member)
  class CASCamsLinkResponse(BaseModel): cams_url: str
  # GET /cas-imports/cams-link -> CASCamsLinkResponse                        (build_cams_mailback_url())
  ```

- [ ] **Step 1: Write the failing tests:** `test_waiting_request_is_readable_for_each_member`, `test_pending_is_null_when_nothing_waits`, `test_pending_ignores_a_request_past_its_expiry`, `test_pending_is_scoped_to_the_user_and_member` (another user's member id answers 404 like `require_member`), `test_cancel_works_with_the_id_the_server_gave`, `test_cams_link_returns_the_fixed_address_and_needs_a_session`.
- [ ] **Step 2 to 5 as in Task 2** (commit `feat(import): read the waiting CAMS request and the fixed CAMS address`).

## Task 4: The eligibility flag for the dialog's quiet line (Codex, lane BE)

**Files:** Modify `head_change.py` (`list_member_eligibility`), `schemas.py` (the per-member eligibility model), `backend/app/api/auth.py` only if it builds the model by hand; test `backend/tests/api/test_head_change_routes.py`, `backend/tests/services/auth/test_head_change_flow.py`.

**Interfaces:** Produces `waiting_cams_request: bool = False` on each member entry of the eligibility list (true when `get_pending_request(...)` finds a row for that member). It never affects `reasons`.

- [ ] **Step 1: Write the failing tests:** `test_eligibility_lists_a_waiting_cams_request_flag_per_member`, `test_the_flag_never_adds_a_reason_or_blocks`.
- [ ] **Steps 2 to 5 as in Task 2** (commit `feat(head-change): eligibility reports a waiting CAMS request per member`). **Gate G1 (mandatory)** after Task 4: `codex:codex-rescue` runs `/codex:adversarial-review` against the Task 1 to 4 diff (read-only, background); the owner relays the report; findings close only by a fix with a red test first or by the owner accepting them.

## Task 5: Front-end foundation and red tests (Codex, lane RT; FE-1a)

**Files:**
- Create: `features/import/usePendingCamsRequest.ts` (+ test), `features/import/pendingCopy.ts`, the red tests named below
- Modify: `features/import/api.ts` (+ `api.test.ts`), `features/import/checklist/checklistCopy.ts` (`startOver: "Reset checklist"`), `features/import/checklist/checklistLook.guard.test.ts` (add the new files to its list), the existing test files named below (tests only)

**Interfaces (the contract: fixed here by the orchestrator, built by the worker):**
- Produces:
  ```ts
  // api.ts
  export interface PendingCamsRequest { import_id: string; household_member_id: string; expires_at: string }
  export function getPendingCamsRequest(memberId: string): Promise<PendingCamsRequest | null>   // GET /cas-imports/pending?member_id=
  export function getCamsLink(): Promise<string>                                                  // GET /cas-imports/cams-link -> cams_url
  // usePendingCamsRequest.ts
  export function usePendingCamsRequest(memberId: string): { status: "loading" | "none" | "waiting" | "error"; request: PendingCamsRequest | null; refresh: () => Promise<void> }
  // pendingCopy.ts (words marked * need the owner's confirmation before merge)
  export const WAITING_CARD_TITLE = "CAMS request waiting";
  export const waitingCardFor = (name: string) => `for ${name}`;                 // *
  export const WAITING_CARD_BODY = "We will use the file as soon as you upload it.";   // *
  export const waitingCardExpires = (hours: number) => `Expires in ${hours} h`;  // *
  export const WAITING_CARD_SHOW = "Show checklist";                              // *
  export const WAITING_CARD_UPLOAD = "Upload the file";                            // *
  export const CHECKLIST_OFF_TITLE = "Checklist off for this request.";           // *
  export const CHECKLIST_OFF_BODY = "CAMS will open on its own.";                  // *
  export const CHECKLIST_TURN_ON = "Turn it back on";                              // *
  export const HEAD_CHANGE_WAITING_LINE = (name: string) => `A CAMS request for ${name} is still waiting. It does not stop this change.`;
  // components the lanes build to this contract
  // CamsWaitingCard({ request, memberName?, checklistMode, onShowChecklist, onUpload, onCancel }): data-testid="cams-waiting-card"
  ```
- Test ids fixed: waiting card `cams-waiting-card`, its Cancel `cams-waiting-cancel`; Request page row `continue-without-row`, its button `continue-without-button`, the off state `checklist-off-row`, `checklist-turn-on`; dialog quiet line `head-change-waiting-line`.

- [ ] **Step 1: Write the failing tests** (names fixed). `usePendingCamsRequest.test.ts`: `loads_the_waiting_request_for_the_member`, `reports_none_when_nothing_waits`, `refresh_reloads_it`. `api.test.ts`: `getPendingCamsRequest_reads_the_route_and_returns_null_when_none`, `getCamsLink_returns_the_address`. `TwoPathImportContainer.test.tsx`: **replace** the four tests that pin the coupling ("automatically resumes at upload view when resume state is present" L86, "resumes upload view on window focus when resume state is set" L138, the checklist-state initial view, and the resume-driven parts of L101 and L159) with `chooses_the_waiting_view_from_the_server_not_from_browser_notes`, `shows_the_waiting_card_after_a_reload_with_the_real_import_id`, `cancel_uses_the_id_the_server_gave`, `coming_back_to_the_tab_does_not_change_the_screen`, `the_checklist_state_does_not_choose_the_screen`, `shows_the_card_when_the_server_says_a_request_waits_on_a_second_device`, `no_card_when_nothing_is_waiting`. `RequestCamsPath.test.tsx`: `request_does_not_wait_for_the_checklist_window`, `a_failing_checklist_window_never_stops_the_request`, `continue_without_it_is_a_visible_button_in_a_row_with_the_checklist_icon`, `pressing_it_turns_the_checklist_off_for_this_request_and_shows_turn_it_back_on`, `turn_it_back_on_restores_the_checklist`, `the_choice_does_not_cancel_or_start_a_request`, `every_built_word_in_the_row_is_unchanged` (the sentence is `checklistCopy.introduction` split at its first full stop; the button is `checklistCopy.skip`), `row_is_not_shown_on_phones`; **update** the three tests at L106 ("Continue without it is still an inline link next to the sentence"), L117 and L171 to the new row. `WaitingForCasView.test.tsx`: **update** L193 ("reload shows Your checklist closed, Reopen checklist requires a click, and Start over clears ticks and step") to `Reset checklist`, and add `reset_checklist_does_not_touch_the_request`, `closing_the_checklist_does_not_touch_the_request`. `checklist/*`: `reset_button_reads_reset_checklist_and_start_over_is_gone`, `status_strip_shows_progress_and_the_current_step`, `closed_state_shows_a_visible_reopen_action`, `panel_mode_shows_the_same_strip`. `ChangeHeadDialog.test.tsx`: `shows_one_quiet_line_when_a_request_waits_and_blocks_nothing`, `shows_no_line_when_nothing_waits`. `useCamsChecklist.test.tsx` L161 and `casResumeState.test.ts` stay green unchanged (the markers stay for the phone).
- [ ] **Step 2: Run them; confirm they fail** (`wave-fe-check.sh hbcd-rt test <files>`). **Step 3: Implement** the api functions, the hook, the copy file and the `startOver` value only. Codex reports BLOCKED on running; **Claude runs the tests, `tsc -b`, `oxlint`.**
- [ ] **Step 4: Claude verifies against the allowed list and commits** `test(add-data): server-driven waiting request, foundation and red tests`.

## Task 6: Lane FE-1: Add data chooses its screen from the server (Antigravity)

**Files:** `features/import/CamsWaitingCard.tsx` (create), `TwoPathImportContainer.tsx`, `WaitingForCasView.tsx`. Do not touch `backend/**`, `frontend/src/mobile/**`, any `*.test.*`, or copy other than Task 5's file.

**Interfaces:** Consumes `usePendingCamsRequest`, `getPendingCamsRequest`, `cancelImportRequest`, `pendingCopy.ts`, `useCamsChecklist` (read-only: mode, `open`, `reopen`). Produces `CamsWaitingCard` to the Task 5 contract.

Behaviour: the initial view is `defaultTab` if given, else `"waiting"` when the server reports a pending request and `"choice"` otherwise (a skeleton while loading); `WaitingForCasView` receives the real `import_id` (the `"pending-import"` fallback is deleted); the mount effect and the window-focus jump to `"upload"` are removed; `handleRequestInitiated` keeps `setCasResumeStep2` for the phone; cancel closes through `cancelImportRequest`, refreshes the hook and returns to `"choice"` (it may still clear the checklist's own notes); the card (mockup 2 A, B, D) shows who, time left, Show checklist or Reopen checklist, Upload the file, Cancel request; the member name arrives as an optional prop from the shell (not imported from another feature).

- [ ] **Step 1: Antigravity runs the Task 5 tests for these files and shows them red.** **Step 2: Build.** **Step 3: Tests, `types`, `lint`, `build` green** (`wave-fe-check.sh ag-hbcd1 ...`); report block.
- [ ] **Step 4: Claude screenshots the card (waiting, closed checklist, panel mode, none) against mockup 2 and the reload case in a real browser,** sends exact differences; commits `feat(add-data): the waiting request is read from the server`.

## Task 7: Lane FE-2: the checklist as a reading aid and the Request page row (Antigravity)

**Files:** `features/import/RequestCamsPath.tsx`, `features/import/checklist/CamsChecklist.tsx`, `CamsChecklistHost.tsx`, `checklistStore.ts`, `checklist-tokens.css`. Same forbidden list as Task 6.

**Interfaces:** Consumes `pendingCopy.ts`, `checklistCopy`; keeps `RequestCamsPath`'s props `{memberId, onBack?, onRequestInitiated(importId, expiresAt)}` and the store's public methods.

Behaviour: `handleRequest` opens the checklist first in the click (the spike's rule) but **does not await** `settleOpening()` and never lets a checklist failure stop the request or the CAMS tab; the "Continue without it" row (mockup 5 option A: a green-icon tile, the sentence in two weights, a secondary button, then the off state with "Turn it back on") replaces the 12px link; the closed and panel states show the status strip (progress bar, the existing `count` text, current step from the existing step titles, Reopen); "Start over" reads **Reset checklist** and only resets the checklist; no code in these files chooses an Add data screen.

- [ ] **Steps 1 to 4 as in Task 6** (lane `ag-hbcd2`; Claude screenshots against mockups 3 and 5 and the states table; commit `feat(add-data): the checklist is a reading aid; a visible continue-without row`).

## Task 8: Lane FE-3: the dialog's quiet line (Antigravity)

**Files:** `features/profile-v2/components/ChangeHeadDialog.tsx`, `features/profile-v2/lib/headEligibility.ts`. **Interfaces:** Consumes `waiting_cams_request` on each eligibility member entry (type added in Task 5 or by this lane's `types.ts` edit named in its packet) and `HEAD_CHANGE_WAITING_LINE`.

One quiet line under the member list per affected member (mockup 4: small info icon, muted box, no button); it never changes a row's selectability.

- [ ] **Steps 1 to 4 as in Task 6** (lane `ag-hbcd3`; commit `feat(head-change): a quiet line when a CAMS request waits`).

## Task 9: The D-2 test page (Codex, lane SP; owner runs it)

**Files:** extend `Docs/orchestration/spike/checklist-spike/` (`index.html`, `spike.js`, `README.md`, `cams-stand-in.html`) on `batch/h-spike2` cut from `batch/h-spike`.

The cases (pass mark: **one click on a link-button gives the CAMS tab in front and the floating checklist, with nothing else clicked**): **S1** a real `<a target="_blank" rel="noopener">` whose click handler calls `documentPictureInPicture.requestWindow` first; **S2** the reverse order; **S3** pop-ups allowed in site settings, floating window then script tab; **S4** the CAMS tab comes to the front, the floating window stays above it, ticks still reach the page, the request still reaches a fake server; **S5** keyboard (Enter and Space), a slow fake network, a small window; **S6** a refused floating window: the link must still open CAMS. Each case prints a one-line result the owner pastes back.

- [ ] **Step 1:** Codex writes the page and a README with the pass mark and the exact steps for Chrome and Edge (no automated test: it is a manual browser test). **Step 2:** Claude reviews it, commits on `batch/h-spike2` and gives the owner the instructions. **Step 3:** the owner runs it in Chrome and Edge and pastes the results; Claude writes `Docs/orchestration/2026-11-2x-checklist-spike-2.md` with the result and the decision: **S1 passes in both** -> Task 10; **only S3 passes** -> ask the owner (the one-time pop-up setting is a user setup); **nothing passes** -> the owner chooses between the extension route and the in-page-panel fallback (page options C and D); no code for D-2 is written before this decision.

## Task 10: D-2 build (Antigravity, lane FE-4; only if S1 passed; after Task 7 has merged)

**Files:** `features/import/RequestCamsPath.tsx`, `features/import/checklist/CamsChecklist.tsx`, `checklistCopy.ts` (remove the `open` and `preparing` strings), `checklistStore.ts` (drop the "link ready" state). Plus red tests by Codex first (a short FE-1a handoff): `request_from_cams_is_a_link_to_the_cams_address_with_a_new_tab_target`, `clicking_request_opens_the_floating_window_before_anything_else_in_the_handler`, `the_checklist_has_no_open_the_cams_form_button`, `no_getting_your_link_ready_state_remains`, `a_refused_or_missing_floating_window_still_opens_cams_and_shows_the_panel`, `the_request_is_sent_after_the_click_and_a_failure_shows_in_the_checklist_with_try_again`, `handler_never_calls_preventDefault_on_the_request_link`, `mobile_request_still_opens_cams_as_today`.

**Interfaces:** Consumes `getCamsLink()` (prefetched on mount so the `href` exists at click time; the button is disabled only while it loads) and the existing `requestCamsStatement`. The Request button becomes an `<a href={camsUrl} target="_blank" rel="noopener noreferrer" data-clickable data-effect="open">` styled as today's button; its click handler calls `checklist.open()` synchronously first and never `preventDefault`s; the request is sent right after in the background; where the floating window is unsupported or refused, the same click still opens CAMS and the in-page panel shows.

- [ ] **Steps 1 to 4 as in Task 6** (commit `feat(add-data): Request from CAMS goes straight to CAMS with the checklist floating`).

## Task 11: Integration, gates, QA rows, docs (Claude)

- [ ] **Step 1:** integrate the branches into `batch/hbcd`; run the full affected back-end and front-end sets, `tsc -b`, `oxlint`, `npm run build`, the guards (the checklist look guard included).
- [ ] **Step 2: G2:** a fresh read-only Sonnet reviewer reads the front-end diff against this plan's Review Focus, mockups 2 to 5 and the no-copy-change rule (only the named new strings changed). **G3** at the patch level.
- [ ] **Step 3: QA rows:** HF-09 to HF-16 from the page's acceptance list (the card after a reload with a working Cancel; the closed checklist keeps a visible Reopen; Reset checklist does not cancel; a statement imported the same day leaves no waiting card; the quiet line in the dialog); re-run **M4-12** (the click flow, D-2) and **M4-13** (Chrome, Edge; Firefox and Safari need a tester and a Mac).
- [ ] **Step 4: Deploy note for patch 2:** after the back end is up, run `close_stuck_cams_requests.py` **dry run first**, show the counts to the owner, then `--apply` at the owner's yes. `decisions.md`, `session.md`, delegation-log lines.

## Self-review against the page

Part B (Tasks 1, 2); Part C (Tasks 3, 4, 6, 8); Part D (Tasks 5, 6, 7); D-2 (Tasks 9, 10); Q2's row (Task 7); scenarios S1 to S15: S4, S5, S6, S13, S14, S15 are pinned by Tasks 1, 3 and 6 tests; S7 by the panel tests of Task 7; S12 (phone) by the unchanged phone tests. The page's mockup 3 "Step 1 of 3" chip is deliberately not built (it would renumber the flow); the owner can ask for it.

## Execution log

*(Claude appends below: drift note, deviations, gate results, the D-2 test result, deploy record link.)*
