# Handoff: hofa-be-4 (Head of Family Part A; the swap never waits for any lock; Codex)
**Status:** READY TO RELAY (written 2026-11-25). **Parents:** `2026-11-25-hofa-be-2-handoff.md` (the rule) and `2026-11-25-hofa-be-3-handoff.md` (the NOWAIT on Import rows; read both first). **Approved:** the owner approved the plan on 25 Nov 2026; this fixes the High finding of the **second** G1 review (on `6221db7d`).
**Worker:** Codex, backend only. It cannot run Postgres tests: write them, report BLOCKED. Service tests (SQLite) it can run. **Reviewer and committer:** Claude.
**Work in:** `C:\Users\Dell\lanes\unifolio-hofa-be` (worktree, branch `batch/hofa-be`, **reuse**; it holds hofa-be-1 to hofa-be-3). Never in the main checkout.
Read first: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md`, then this file.

## The finding (G1 review 2, High) and why a re-ordering is not enough
`complete_head_change` locks the **User** row, then the **members**, then the request, **before** `_settle_member_imports` is reached. A family statement confirm that finalises an existing member's PAN (holds that **member** lock) and then inserts a newly detected member (its `user_id` foreign key needs a key-share lock on the **User** row) can cycle with the swap: swap holds User and waits for the member; confirm holds the member and waits for User. PostgreSQL aborts one of them before the swap can answer; it may abort the **confirm**, which loses the person's statement save. Codex also noted the confirm takes locks in more than one order (Import then member, and member then Import again at `confirm_people.py` ~L284-290), so no single fixed order for the swap is provably safe.

## The fix (fixed here; do not redesign)
**The swap never waits for any lock.** A transaction that never waits cannot be part of a deadlock cycle, and the confirm (which may wait for the swap) is never the victim. In `complete_head_change`, take **every** row lock of the swap with `with_for_update(nowait=True)`: the User row, the members, the request, and (already done in hofa-be-3) the Import rows. If PostgreSQL answers lock-not-available (SQLSTATE `55P03`: `getattr(exc.orig, "pgcode", None) == "55P03"`, the same test as `_settle_member_imports`) on **any** of them, the account is being worked on right now: raise the **same** `_error(409, SAVING_CODE, SAVING_MESSAGE)` (nothing written; the existing error path rolls back; the request and its four codes stay valid; the person retries). Any other `OperationalError` is re-raised unchanged. Put the translation in **one small helper** (for example `_lock_unavailable_as_saving(exc)`, used by `_settle_member_imports` and by a try/except around the three lock queries) so the behaviour is written once.
- The 409 text stays the owner's sentence. (In the rare case the busy row is not a statement confirm, for example a sign-in touching the account row, the person still just retries in a minute: acceptable and reported to the owner.)
- Replace the comment "Lock order is a cross-database contract: account, members by id, request." by: "The swap takes every lock NOWAIT and never waits: a confirm takes the account, member and Import locks in several orders, so waiting here can deadlock and PostgreSQL may abort the confirm (G1 reviews, 25 Nov 2026). The order below (account, members by id, request, Import rows) stays the same on every database."
- Everything else of the rule stays (fresh-`PROCESSING` check, stale rule, discard, flag, undo path untouched). SQLite ignores NOWAIT, so every existing service test behaves as before.

## Tests first (red for the stated reason; fixed once written)
1. **`backend/tests/services/auth/test_head_change_swap.py`** (SQLite): `test_complete_answers_statement_being_saved_when_the_account_row_lock_is_not_available`, `..._when_a_member_row_lock_is_not_available`, `..._when_the_request_row_lock_is_not_available` (each makes **that** lock query raise an `OperationalError` whose `orig` has `pgcode == "55P03"`, using the same small fake as the existing Import-lock test; expect `HeadChangeError` 409 `statement_being_saved`, `_assert_unswapped`, request still `verified`); and `test_a_serialization_error_on_the_account_lock_is_not_swallowed` (`pgcode == "40001"` is re-raised, not a 409).
2. **`backend/tests/functional_postgres/test_head_change_races.py`** (BLOCKED on running; Claude runs it on a database): `test_confirm_holding_a_member_lock_then_creating_a_member_does_not_deadlock_with_the_swap`: the **mixed-family** scenario of the finding. Session A (confirm) finalises an existing member's pending PAN (holds that member row), then inserts a newly detected member for the same user (needs the key-share lock on User). Session B (swap) starts **after A holds the member row**: B must answer `statement_being_saved` **immediately** (hard timeout of a few seconds on B), A's insert and commit then succeed (A is **not** aborted), and a second swap attempt afterwards succeeds. Keep the existing race tests unchanged.

## Run these only
```
cd backend
"C:\Users\Dell\Desktop\MVP v1\MVP_V1_MF_only\backend\.venv\Scripts\python.exe" -m pytest tests/services/auth/test_head_change_swap.py tests/services/auth/test_head_eligibility.py tests/services/auth/test_head_change_flow.py tests/services/auth/test_head_change_undo.py tests/api/test_head_change_routes.py -q -p no:cacheprovider
```
Baseline (Claude, after hofa-be-3): **200 passed.** The Postgres file needs `TEST_DATABASE_URL`: only Claude runs it.

## Files you may touch
`backend/app/services/auth/head_change.py` (only `complete_head_change`'s three lock queries, the one helper, `_settle_member_imports`' translation and the comment), `backend/tests/services/auth/test_head_change_swap.py`, `backend/tests/functional_postgres/test_head_change_races.py`.
**Do not touch:** `backend/app/services/import_/**`, the undo path, migrations, `frontend/**`, any other file.

## Constraints
No migration (Alembic stays 0054); no new dependency; additive only; invented data only; git read-only; no deletion flags or recursive deletes. Do not weaken any existing test.

## Report format
One fenced block `CODEX REPORT: hofa-be-4`: status; which tests were red first and why; files and functions changed; commands with pass and fail counts and which tests are BLOCKED; `git status --short`; Deviations; Open questions (any other lock the swap takes that is not covered: for example one taken inside `_build_label_plan`, the session or identity updates, `db.commit()` triggers).

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-25-hofa-be-2-handoff.md (the rule)
4. Docs/orchestration/2026-11-25-hofa-be-3-handoff.md (the NOWAIT on Import rows)
5. Docs/orchestration/2026-11-25-hofa-be-4-handoff.md (your task: hofa-be-4, owner-approved)
Work only in C:\Users\Dell\lanes\unifolio-hofa-be on branch batch/hofa-be (reuse; it already holds hofa-be-1 to hofa-be-3). Git is read-only. No deletion flags or recursive deletes. Write the failing tests first, run the service tests, then change only the files the handoff lists. If the sandbox cannot run a test (TestClient, async, Postgres), reply BLOCKED with the exact error and stop that part.
Run tests with: cd backend; "C:\Users\Dell\Desktop\MVP v1\MVP_V1_MF_only\backend\.venv\Scripts\python.exe" -m pytest <files> -q -p no:cacheprovider
Reply with the CODEX REPORT block from the handoff, nothing else.
```
