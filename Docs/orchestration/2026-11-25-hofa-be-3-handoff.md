# Handoff: hofa-be-3 (Head of Family Part A; fix the G1 deadlock finding, Codex)
**Status:** READY TO RELAY (written 2026-11-25). **Parent:** `2026-11-25-hofa-be-2-handoff.md` (read it first: the rule, the contract and the tests are unchanged except as below). **Approved:** the owner approved the plan on 25 Nov 2026; this task fixes the one **High** finding of the G1 adversarial review.
**Worker:** Codex, backend only. It cannot run async, `TestClient` or Postgres tests: write them, try once, report BLOCKED with the exact error; Claude runs what can run. **Reviewer and committer:** Claude.
**Work in:** `C:\Users\Dell\lanes\unifolio-hofa-be` (worktree, branch `batch/hofa-be`, **reuse**; it holds hofa-be-1 and hofa-be-2). Never in the main checkout.
Read first: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## The finding (G1, Codex adversarial review, High)
`_settle_member_imports` (`backend/app/services/auth/head_change.py` ~L1106-1123) locks the household's `Import` rows with a **blocking** `FOR UPDATE`, **after** `complete_head_change` has already locked the account, the members and the request. A confirm takes locks in the opposite order: `claim_session_for_confirm` (`import_/service.py` ~L1103) moves `PREVIEWING` to `PROCESSING` (holds the `Import` row lock, uncommitted), then finalises the PAN claim and flushes a member update (`import_/confirm_people.py` ~L564), which needs the **member** lock. Interleaving: confirm holds the Import row; swap holds the members and waits for the Import row; confirm waits for the member. **Deadlock.** PostgreSQL aborts one transaction at random, so the swap cannot promise the plain 409 `statement_being_saved` answer.

## The fix (fixed here; do not redesign)
**The swap never waits for an `Import` row while it holds the member locks.** In `_settle_member_imports` take the row locks with `with_for_update(nowait=True)`. If PostgreSQL answers "lock not available" (SQLSTATE `55P03`, raised by SQLAlchemy as `OperationalError` whose `.orig` has `pgcode == "55P03"`; psycopg may also expose `psycopg.errors.LockNotAvailable`: test `getattr(exc.orig, "pgcode", None) == "55P03"` so both drivers work), the household's import row is being worked on by a confirm right now: raise the **same** `_error(409, SAVING_CODE, SAVING_MESSAGE)` as for a fresh `PROCESSING` row. Any other `OperationalError` is re-raised unchanged. Nothing is written; `complete_head_change`'s existing error path rolls the transaction back, so the request and its four codes stay valid and the confirm (which was waiting for the member lock) then proceeds. `discard_member_reviews` keeps its own `.with_for_update()`: the rows are already locked by this transaction at that point, so it cannot wait.
- Keep everything else of the rule: the fresh-`PROCESSING` check (still needed when the row lock is free but the status is `PROCESSING`), the stale-row rule, the discard, the flag.
- SQLite ignores `NOWAIT` (it has no row locks), so every existing service test behaves as before.
- Add a short comment where the lock is taken: "NOWAIT so the swap never waits on an Import row while holding the member locks; a confirm takes them in the opposite order (Import, then member) and the two would deadlock (G1 review, 25 Nov 2026)."

## Tests first (red for the stated reason; fixed once written)
1. **`backend/tests/services/auth/test_head_change_swap.py`** (service level, runs on SQLite): `test_complete_answers_statement_being_saved_when_the_import_row_lock_is_not_available` — make the `Import` row query raise an `OperationalError` whose `orig` is an object with `pgcode == "55P03"` (monkeypatch `_settle_member_imports`'s query seam or wrap `db.query` for `Import` with a small fake that raises on `.all()`; keep it simple and local to the test): expect `HeadChangeError` with `status_code == 409` and `code == "statement_being_saved"`, `_assert_unswapped`, the request still `verified`. And `test_other_operational_errors_are_not_swallowed` (`pgcode == "40001"` re-raises as an `OperationalError`/the existing generic failure, **not** a 409).
2. **`backend/tests/functional_postgres/test_head_change_races.py`** (Postgres, BLOCKED on running; Claude runs it on a database): `test_confirm_first_then_swap_does_not_deadlock_on_postgres` — a confirm-first ordering that **continues through PAN finalisation**: session A claims a `PREVIEWING` review for `PROCESSING` (holds the Import row, uncommitted), session B runs the swap: B must answer `statement_being_saved` **immediately** (no wait, no deadlock error), then A's finalisation (PAN claim plus the member flush) completes and commits, and a **second** swap attempt afterwards succeeds. Use `pg_session_factory` and the existing helpers; put a hard timeout (a few seconds) on session B so a regression fails fast instead of hanging. Keep the existing `test_swap_and_confirm_do_not_interleave_on_postgres` unchanged.

## Run these only
```
cd backend
"C:\Users\Dell\Desktop\MVP v1\MVP_V1_MF_only\backend\.venv\Scripts\python.exe" -m pytest tests/services/auth/test_head_change_swap.py tests/services/auth/test_head_eligibility.py tests/services/auth/test_head_change_flow.py tests/services/auth/test_head_change_undo.py -q -p no:cacheprovider
```
Baseline (Claude, after hofa-be-2): these files pass (161 with the earlier set). The Postgres file needs `TEST_DATABASE_URL`: only Claude runs it, on a database.

## Files you may touch
`backend/app/services/auth/head_change.py` (only `_settle_member_imports` and its imports), `backend/tests/services/auth/test_head_change_swap.py`, `backend/tests/functional_postgres/test_head_change_races.py`.
**Do not touch:** `backend/app/services/import_/**`, the undo path, migrations, `frontend/**`, any other file.

## Constraints
No migration (Alembic stays 0054); no new dependency; additive only; invented data only; git read-only; no deletion flags or recursive deletes. Do not weaken any existing test.

## Report format
One fenced block `CODEX REPORT: hofa-be-3`: status; which tests were red first and why; files and functions changed; commands with pass and fail counts and which tests are BLOCKED; `git status --short`; Deviations; Open questions (including any other place where a confirm holds a member lock and then needs an Import row, which would be the opposite deadlock).

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-25-hofa-be-2-handoff.md (the rule, read first)
4. Docs/orchestration/2026-11-25-hofa-be-3-handoff.md (your task: hofa-be-3, owner-approved)
Work only in C:\Users\Dell\lanes\unifolio-hofa-be on branch batch/hofa-be (reuse; it already holds hofa-be-1 and hofa-be-2). Git is read-only. No deletion flags or recursive deletes. Write the failing tests first, run the service tests, then change only the files the handoff lists. If the sandbox cannot run a test (TestClient, async, Postgres), reply BLOCKED with the exact error and stop that part.
Run tests with: cd backend; "C:\Users\Dell\Desktop\MVP v1\MVP_V1_MF_only\backend\.venv\Scripts\python.exe" -m pytest <files> -q -p no:cacheprovider
Reply with the CODEX REPORT block from the handoff, nothing else.
```
