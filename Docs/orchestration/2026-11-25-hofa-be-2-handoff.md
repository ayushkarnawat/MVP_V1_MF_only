# Handoff: hofa-be-2 (Head of Family Part A; Task 2: settle imports inside the change, the saving answer, the response flag, Codex)
**Status:** WRITTEN, RELAY AFTER hofa-be-1 IS VERIFIED AND COMMITTED (written 2026-11-25). **Approved:** the owner approved the plans on 25 Nov 2026 (all 30 design questions answered; "start" given).
**Parent plan:** `Docs/superpowers/plans/2026-11-25-hof-part-a-plan.md` (Task 2; read "Global Constraints" and "Review Focus"), master plan `Docs/superpowers/plans/2026-11-25-qa-patches-master-plan.md`. **Spec (the design):** `Docs/orchestration/2026-11-24-head-of-family-d11-plan.html` (page version 16, Part A, scenarios S9 to S11, decisions D1 C and D2 A). If the spec, the plan and the code disagree, stop and say so.
**Worker:** Codex, backend only. **It cannot run FastAPI `TestClient`, async or Postgres tests in its sandbox (they stall or need a database): write them, try once, report BLOCKED with the exact error; Claude runs them.** Service-level `db_session` tests that do not use `asyncio.run` or `TestClient` normally run: run those. **Reviewer and committer:** Claude.
**Work in:** `C:\Users\Dell\lanes\unifolio-hofa-be` (worktree, branch `batch/hofa-be`; it already holds hofa-be-1's committed work). Never in the main checkout.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## What and why (owner decisions D1 C and D2 A, 25 Nov 2026)
After hofa-be-1 an open import no longer blocks the change. Two cases remain inside `complete_head_change`: (D1 C) an **unfinished statement review** (uploaded, not confirmed) must **never block**: it is **discarded inside the change** (the change signs everyone out anyway) and the response says so; (D2 A) if a **confirm is saving at that exact moment** the change answers with a calm, plain 409 "A statement is being saved. Try again in a minute." and **nothing is written**, so the four codes stay valid and the person can retry.

## Wave-start check (report drift, do not fix drift)
Confirm in `backend/app/services/auth/head_change.py`: `complete_head_change(db, user, request_id, evidence) -> HeadChangeResult` (~L1107), starting with `now = datetime.now(timezone.utc)`, locking the User, the `members` list (ordered by id) and the `HeadChangeRequest`; the eligibility re-check at ~L1190-1197 (`reasons = member_eligibility(db, locked_user, new_head.id)`, drops `head_change_already_open`, raises `_reason_error(reasons[0])`); then `label_plan = _build_label_plan(...)` and the inline swap; `HeadChangeResult` (frozen dataclass, ~L116) built at ~L1374 (this is the **complete** path; the second construction at ~L1772 is another path, do not change it). In `backend/app/services/import_/preview_store.py`: `PREVIEW_STATUSES = (PREVIEWING, PROCESSING)` (~L120) and `discard_member_reviews(db, member_ids) -> int` (~L123: locks matching `Import` rows `FOR UPDATE`, pops the in-RAM session, releases PAN claims, deletes rows, flushes, caller commits). In `import_/service.py`: a confirm claims a preview with an atomic `UPDATE ... SET status = PROCESSING WHERE status = PREVIEWING` (`claim_session_for_confirm`, ~L1061-1105). `PENDING_PAN_TTL = timedelta(minutes=65)` in `import_/pan_claims.py`. `Import.uploaded_at` is non-null. `backend/app/api/auth.py` `complete_head_change_route` (~L1051) returns `HeadChangeCompleteResponse(status=..., logout_required=True)`; the model is in `backend/app/services/auth/schemas.py` (~L358). Report any difference.

## The contract (fixed here; do not rename or reshape)
```python
# head_change.py
SAVING_CODE = "statement_being_saved"
SAVING_MESSAGE = "A statement is being saved. Try again in a minute."
def _settle_member_imports(db: DbSession, member_ids: list[uuid.UUID], now: datetime) -> bool
    # True when at least one review was discarded.

@dataclass(frozen=True)
class HeadChangeResult:            # existing fields unchanged, plus:
    discarded_review: bool = False

# schemas.py
class HeadChangeCompleteResponse(BaseModel):   # existing fields unchanged, plus:
    discarded_review: bool = False
```
**Rule.** In `complete_head_change`, **after** the eligibility re-check raises nothing and **before** `_build_label_plan` (so before any swap write), call `discarded = _settle_member_imports(db, [m.id for m in members], now)`. `_settle_member_imports`: (1) lock the household members' `Import` rows `FOR UPDATE`; (2) if any has `status == ImportStatus.PROCESSING` **and** `uploaded_at >= now - PENDING_PAN_TTL`, raise `HeadChangeError(409, SAVING_CODE, SAVING_MESSAGE)` (nothing written; the request and its four codes are untouched); (3) otherwise call `discard_member_reviews(db, member_ids)` (it also covers a **stale** `PROCESSING` row older than the TTL, treated as abandoned so a crashed worker can never block a change) and return `count > 0`. The commit stays where `complete_head_change` commits today; a failed swap rolls the discard back with everything else. The complete-path `HeadChangeResult` is built with `discarded_review=discarded`; the route returns `HeadChangeCompleteResponse(status=result.status, logout_required=True, discarded_review=result.discarded_review)`.
**Not changed:** `waiting_for_user` CAMS requests, confirmed, failed and expired imports and every PAN field of a non-review (all untouched by the swap); the other eleven eligibility reasons; the undo path (`HeadChangeResult` at ~L1772).

## Tests first (written and run before the code; red for the stated reason)
**`backend/tests/services/auth/test_head_change_swap.py`** (helpers `_household`, `_start`, `_verify_remaining`, `_ready_request`, `_complete`, `_evidence`, `_assert_unswapped`; `db_session` fixture): `test_complete_discards_a_live_review_and_releases_its_pan_claim` (a `PREVIEWING` `Import` for a member plus a future `pan_pending_until` on that member: after `_complete` the row is gone, the PAN claim is released, `result.discarded_review is True`), `test_complete_reports_no_discard_when_no_review_existed`, `test_complete_discards_reviews_of_two_members_and_reports_one_flag`, `test_complete_answers_statement_being_saved_while_a_confirm_is_processing` (a fresh `PROCESSING` row: `HeadChangeError` with `status_code == 409` and `code == "statement_being_saved"`, `_assert_unswapped`, the request still `verified`), `test_retry_after_the_saving_answer_succeeds_once_the_confirm_finished` (same request id: delete or finish the `PROCESSING` row, `_complete` again succeeds), `test_a_stale_processing_row_is_discarded_not_blocking` (`uploaded_at` older than `PENDING_PAN_TTL`), `test_change_leaves_import_rows_and_pan_fields_untouched` (a confirmed, a failed, an expired and a waiting-request row all survive with identical fields), `test_undo_works_while_a_cams_request_waits`, `test_import_started_after_start_does_not_fail_the_final_step`.
**`backend/tests/api/test_head_change_routes.py`** (`TestClient`: written, tried once, BLOCKED if it stalls): `test_complete_route_returns_the_discarded_review_flag` (true with a review, false without) and `test_complete_route_409_body_for_a_saving_statement_has_code_and_message` (`response.json()["detail"] == {"code": "statement_being_saved", "message": "A statement is being saved. Try again in a minute."}`).
**`backend/tests/functional_postgres/test_head_change_races.py`** (Postgres: written, BLOCKED on running; use `pg_session_factory` and the existing `_swap_paused_inside_its_lock(pg_session_factory, monkeypatch, suffix, *, prepare=None, extras=None)` helper): `test_swap_with_a_waiting_cams_request_on_postgres` and `test_swap_and_confirm_do_not_interleave_on_postgres` (pause the swap inside its lock, run a confirm claim for a `PREVIEWING` review on another session: the confirm and the swap serialise through the `Import` row lock; either the swap discards the review before the claim, or it answers `statement_being_saved` and the review survives; never both).
Report, for each test, whether it ran or was BLOCKED.

## Run these only
```
cd backend
"C:\Users\Dell\Desktop\MVP v1\MVP_V1_MF_only\backend\.venv\Scripts\python.exe" -m pytest tests/services/auth/test_head_change_swap.py tests/services/auth/test_head_eligibility.py tests/services/auth/test_head_change_flow.py tests/services/auth/test_head_change_undo.py tests/api/test_head_change_routes.py -q -p no:cacheprovider
```
Baseline before any change: the five files passed (167) before hofa-be-1; Claude records the figure after hofa-be-1 in the Execution log. The Postgres file needs `TEST_DATABASE_URL`: only Claude runs it.

## Files you may touch
`backend/app/services/auth/head_change.py` (only `_settle_member_imports`, the constants, the `HeadChangeResult` field, and the one call and result construction in `complete_head_change`); `backend/app/services/auth/schemas.py` (only the new field); `backend/app/api/auth.py` (only the route's return); the three test files named above.
**Do not touch:** `frontend/**`, migrations, `backend/app/services/import_/**` (use `discard_member_reviews` as it is), `head_eligibility.py`, the undo path, any other route.

## Constraints
Backend changes are additive only (the old staging link shares this backend): one new 409 code, one new response field; **no migration; Alembic stays 0054**; no new dependency; invented data only; no network; git read-only; no deletion flags or recursive deletes. Tests first; red test files are fixed once written. The Postgres lock behaviour is the point of the gate: do not "fix" a failing race test by weakening it.

## Report format
One fenced block `CODEX REPORT: hofa-be-2`: status (DONE, PARTIAL or BLOCKED); baseline HEAD; drift; which tests were red first and why; files and functions changed with a one-line reason each; commands with pass and fail counts and which tests were BLOCKED; `git status --short`; Deviations; Open questions (including how `discard_member_reviews` behaves when a `PROCESSING` row is stale).

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-25-hofa-be-2-handoff.md (your task: hofa-be-2, owner-approved)
Open Docs/superpowers/plans/2026-11-25-hof-part-a-plan.md (Task 2) for the context. Work only in C:\Users\Dell\lanes\unifolio-hofa-be on branch batch/hofa-be (it already holds hofa-be-1). Git is read-only. No deletion flags or recursive deletes. Write the failing tests first, run them, then change only the files the handoff lists. If the sandbox cannot run a test (TestClient, async, Postgres), reply BLOCKED with the exact error and stop that part.
Run tests with: cd backend; "C:\Users\Dell\Desktop\MVP v1\MVP_V1_MF_only\backend\.venv\Scripts\python.exe" -m pytest <files> -q -p no:cacheprovider
Reply with the CODEX REPORT block from the handoff, nothing else.
```
