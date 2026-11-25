# Handoff: hbcd-be-2 (Head of Family Parts B, C, D: the one-off clean-up script and the eligibility flag; Codex, lane BE; Tasks 2 and 4)
**Status:** READY TO RELAY (written 2026-11-25). **Approved:** the owner approved the plans on 25 Nov 2026 (Q4 B, Q7 A). **Parents:** `Docs/orchestration/2026-11-25-hbcd-be-1-handoff.md` (the helpers this builds on: **already built and committed**, `51633989`), plan `Docs/superpowers/plans/2026-11-25-hof-bcd-adddata-plan.md` (Tasks 2 and 4; read "Global Constraints" and "Review Focus"). **Spec:** `Docs/orchestration/2026-11-24-head-of-family-d11-plan.html` (page version 16, Parts B, C, D). If the spec, the plan and the code disagree, stop and say so.
**Worker:** Codex, backend only. **It cannot run `TestClient`, async, Postgres or some `db_session` tests in its sandbox (a `C:\tmp` permission error and stalled API tests): write the tests and the code carefully, try the service-level tests once, report BLOCKED with the exact error for any that cannot run; Claude runs them.** **Reviewer and committer:** Claude.
**Work in:** `C:\Users\Dell\lanes\unifolio-hbcd-be` (worktree, branch `batch/hbcd-be`, **reuse**; hbcd-be-1 is committed on it). Never in the main checkout.
Read first: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## Task A: the one-off clean-up script (plan Task 2)
**What and why.** Old CAMS requests that were never closed (a statement was imported without closing them, or they sat past 48 hours) still show as "waiting". This script closes them once, with a dry run first.
**Contract (fixed here).** `backend/scripts/close_stuck_cams_requests.py`: `python scripts/close_stuck_cams_requests.py [--apply]`. **Dry run by default**: it counts and writes nothing. With `--apply` it closes (status `EXPIRED` via `close_member_requests`, committed in batches of at most 200) every `WAITING_FOR_USER` request that **(a) is past `expires_at`** (`expires_at < now`) **or (b) whose member has a later confirmed import** (an `Import` of that member with `status` `CONFIRMED` and `confirmed_at` later than the request's `uploaded_at`). **Output is counts only**, one line each: `past_expiry=<n>`, `later_import=<n>`, `would_close=<n>` (dry run) or `closed=<n>` (apply), `left_open=<n>`; **never a name, a folio, a PAN, an email or an id**. A row that matches both rules counts once in `would_close` and in each of the two detail counts. Exit code 0 on success. **The write guard:** in dry run the script must **abort on any ORM flush or raw INSERT, UPDATE or DELETE** (copy the pattern of `backend/scripts/measure_home_staging.py`: a `WriteAttempted` error raised from a `before_flush` listener and a `before_cursor_execute` listener; in dry run there is no `--allow` flag at all). Structure it as `def main(argv: list[str] | None = None) -> int` and a pure `def find_stuck_requests(db, now) -> list[Import]` so tests call them directly with a `db_session`; the script's entry point uses `SessionLocal()`; follow `scripts/run_analytics_recompute.py` for the `sys.path` and logging style.
**Tests first** (`backend/tests/scripts/test_close_stuck_cams_requests.py`, new; names fixed): `test_dry_run_counts_and_writes_nothing` (a past-expiry request and a superseded one are counted and **still `WAITING_FOR_USER` afterwards**), `test_apply_closes_expired_and_superseded_requests_and_leaves_live_ones` (a live request with no later import stays open; `left_open` counts it), `test_other_members_requests_are_not_touched` (a later import of **another** member does not close this member's request), `test_output_has_no_names_or_ids` (capture stdout: only the five count lines; none of the invented member names or uuid strings appear), `test_aborts_on_any_write_attempt_in_dry_run` (the guard raises when something tries to flush in dry run). Use invented data only.

## Task B: the eligibility flag for the dialog's quiet line (plan Task 4)
**What and why.** The Head of Family dialog will show one quiet line when a member has a waiting CAMS request ("It does not stop this change"). The page needs to know which members have one. **Additive only** (the old staging link shares this backend).
**Contract (fixed here).**
```python
# backend/app/services/auth/head_change.py
@dataclass(frozen=True)
class MemberEligibility:
    member_id: uuid.UUID
    reasons: list[str]
    waiting_cams_request: bool = False     # NEW
# backend/app/services/auth/schemas.py
class MemberEligibilityItem(BaseModel):
    member_id: str
    reasons: list[str]
    waiting_cams_request: bool = False     # NEW, additive
```
`list_member_eligibility` sets `waiting_cams_request` for each member to whether `get_pending_request(db, user.id, member.id)` (from `cams_portal`; already built) returns a row. **It never adds to or removes from `reasons` and never blocks anything.** `backend/app/api/auth.py` (~L1168) passes the flag through to `MemberEligibilityItem`. The member-eligibility `Literal` of reasons is **unchanged**. Import `get_pending_request` inside the function if a circular import appears.
**Tests first** (names fixed): in `backend/tests/services/auth/test_head_change_flow.py` or `test_head_eligibility.py` (whichever already tests `list_member_eligibility`): `test_eligibility_lists_a_waiting_cams_request_flag_per_member` (member A has a waiting request created with `initiate_cams_request`, member B none: flags true and false), `test_the_flag_never_adds_a_reason_or_blocks` (the `reasons` of a flagged member equal the reasons of the same member without a request, and `complete`/`start` still work for a flagged member), `test_a_request_past_its_expiry_does_not_set_the_flag`; in `backend/tests/api/test_head_change_routes.py` (`TestClient`: written, tried once, BLOCKED if it stalls): `test_eligibility_route_returns_the_waiting_flag_and_still_lists_reasons`.

## Run these only
```
cd backend
"C:\Users\Dell\Desktop\MVP v1\MVP_V1_MF_only\backend\.venv\Scripts\python.exe" -m pytest tests/scripts/test_close_stuck_cams_requests.py tests/services/auth/test_head_change_flow.py tests/services/auth/test_head_eligibility.py tests/api/test_head_change_routes.py -q -p no:cacheprovider
```
Claude records the baseline of these files before relaying: see the Execution log; **after hbcd-be-1 the Head of Family files pass (204 for the five-file set)**.

## Files you may touch
Create `backend/scripts/close_stuck_cams_requests.py`, `backend/tests/scripts/test_close_stuck_cams_requests.py`. Modify `backend/app/services/auth/head_change.py` (only `MemberEligibility` and `list_member_eligibility`), `backend/app/services/auth/schemas.py` (only `MemberEligibilityItem`), `backend/app/api/auth.py` (only the eligibility route's item construction), and the test files named above (only the tests named above).
**Do not touch:** `frontend/**`, migrations, `complete_head_change` and the swap (patch 1 code), `backend/app/services/import_/**` (use the helpers as they are), any other route.

## Constraints
Additive only; **no migration (Alembic stays 0054)**; no new dependency or setting; invented data only; no network; git read-only; no deletion flags or recursive deletes. Tests first; red test files are fixed once written. Do not weaken any existing test.

## Report format
One fenced block `CODEX REPORT: hbcd-be-2`: status (DONE, PARTIAL or BLOCKED); which tests were red first and why; files and functions changed with a one-line reason each; commands with pass and fail counts and which tests are BLOCKED (exact errors); the exact output lines the script prints; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-25-hbcd-be-1-handoff.md (the helpers, already built)
4. Docs/orchestration/2026-11-25-hbcd-be-2-handoff.md (your task: hbcd-be-2, owner-approved)
Open Docs/superpowers/plans/2026-11-25-hof-bcd-adddata-plan.md (Tasks 2 and 4) for the context. Work only in C:\Users\Dell\lanes\unifolio-hbcd-be on branch batch/hbcd-be (reuse; hbcd-be-1 is committed on it). Git is read-only. No deletion flags or recursive deletes. Write the failing tests first, try the service-level tests once, then change only the files the handoff lists. If the sandbox cannot run a test (TestClient, a C:\tmp permission error, Postgres), reply BLOCKED with the exact error and stop that part; write the code carefully anyway (Claude runs the tests).
Run tests with: cd backend; "C:\Users\Dell\Desktop\MVP v1\MVP_V1_MF_only\backend\.venv\Scripts\python.exe" -m pytest <files> -q -p no:cacheprovider
Reply with the CODEX REPORT block from the handoff, nothing else.
```
