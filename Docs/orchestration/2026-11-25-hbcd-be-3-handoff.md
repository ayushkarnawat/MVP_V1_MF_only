# Handoff: hbcd-be-3 (Head of Family Parts B, C, D: fix the two G1 findings in the clean-up script; Codex, lane BE)
**Status:** READY TO RELAY (written 2026-11-25). **Parent:** `Docs/orchestration/2026-11-25-hbcd-be-2-handoff.md` (read it first: the contract of `close_stuck_cams_requests.py`, its output lines and its constraints are unchanged and still apply). **Approved:** the owner approved the plan on 25 Nov 2026; this fixes the two **Medium** findings of the G1 adversarial review of `51633989~1..c4db5b20`.
**Worker:** Codex, backend only. The script's service-level tests run in its sandbox (they did for hbcd-be-2); try them, report any BLOCKED with the exact error. **Reviewer and committer:** Claude.
**Work in:** `C:\Users\Dell\lanes\unifolio-hbcd-be` (worktree, branch `batch/hbcd-be`, **reuse**; the script is committed there in `c4db5b20`). Never in the main checkout.
Read first: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## The findings (G1 review, both reproduced by the reviewer on isolated in-memory SQLite)
1. **Dry-run write guard can be bypassed.** `backend/scripts/close_stuck_cams_requests.py` (~L29) checks only the first keyword of each statement, so `-- maintenance\nUPDATE probe SET value = 2` and `WITH marker AS (SELECT 1) UPDATE probe SET value = 3` both ran and committed inside `guard(db)` without `WriteAttempted`. The requirement is to abort on **any** raw write.
2. **The clean-up can expire a newly renewed request.** The apply step (~L86) closes **previously selected ids** without rechecking eligibility: select an expired waiting row, renew its expiry by 48 hours, then continue the apply: the request becomes `EXPIRED` despite its future expiry (output `past_expiry=0`, `later_import=0`, `closed=1`).

## The fix (fixed here; do not redesign)
**Finding 1: two layers, so no single trick can bypass the guard.**
- (a) **A real read-only transaction when the database supports it.** In dry run, right after opening the session and before any query: on PostgreSQL run `SET TRANSACTION READ ONLY` (the database then refuses any write itself); on SQLite run `PRAGMA query_only = ON` (the tests run on SQLite). Choose by `db.get_bind().dialect.name`. In `--apply` mode none of this runs.
- (b) **A tokenised statement check** replacing the first-keyword check, in the same `before_cursor_execute` listener: take the statement text, **remove SQL comments** (`-- ...` to end of line and `/* ... */`), **remove quoted string literals** (single-quoted, with `''` as an escaped quote), remove the harmless lock clause `FOR UPDATE`, `FOR NO KEY UPDATE`, `FOR SHARE` and `FOR KEY SHARE` (a select that only asks for row locks writes nothing), then raise `WriteAttempted` if the remainder contains, as whole words (case-insensitive, `\b` boundaries so `updated_at` is not a match), any of `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `REPLACE`, `TRUNCATE`, `DROP`, `ALTER`, `CREATE`. Keep the existing `before_flush` ORM listener. Keep the module's existing function names and the output lines.
**Finding 2: revalidate under lock inside each apply batch.** In `--apply`, for each batch of at most 200 ids: re-select **those ids** with a row lock (`with_for_update()`; SQLite ignores it) **and apply the full eligibility predicate again at the same `now` used for the selection**: status still `WAITING_FOR_USER`, **and** (`expires_at < now` **or** the member still has a later confirmed import: `confirmed_at` later than the request's `uploaded_at`); close only the rows that still match (through `close_member_requests` or the same helper), commit the batch, and count `closed` as the rows **actually closed**. A row that no longer matches is left open and counts in `left_open`. The dry-run counts and the five output lines (as hbcd-be-2 defined them) do not change.

## Tests first (red for the stated reason; fixed once written)
In `backend/tests/scripts/test_close_stuck_cams_requests.py` (add; keep every existing test, do not weaken any): `test_dry_run_guard_blocks_a_write_hidden_behind_a_comment` (`-- maintenance\nUPDATE ...`), `test_dry_run_guard_blocks_a_write_after_a_cte` (`WITH marker AS (SELECT 1) UPDATE ...`), `test_dry_run_guard_blocks_a_block_comment_prefix` (`/* x */ DELETE ...`), `test_dry_run_guard_allows_a_plain_select_and_a_select_for_update`, `test_dry_run_guard_does_not_trip_on_column_names_like_updated_at_or_on_string_literals` (a select that has `'update'` inside a literal and a column `updated_at`), `test_dry_run_runs_in_a_read_only_session_on_sqlite` (after the dry-run guard starts, a plain `UPDATE` attempted through the session raises, whichever layer catches it), `test_apply_does_not_close_a_request_renewed_after_selection` (select the expired row, renew `expires_at` by 48 hours, then run the apply batch: the row stays `WAITING_FOR_USER`, `closed=0`, `left_open` counts it; build the race with a small seam: for example a `find_stuck_requests` result computed first, then the row updated, then the batch function called with those ids), `test_apply_still_closes_a_row_that_is_still_expired_at_apply_time`. Use invented data only.

## Run these only
```
cd backend
"C:\Users\Dell\Desktop\MVP v1\MVP_V1_MF_only\backend\.venv\Scripts\python.exe" -m pytest tests/scripts/test_close_stuck_cams_requests.py -q -p no:cacheprovider
```
Baseline: the file passes as committed (Claude, 25 Nov: part of 1,020 passed).

## Files you may touch
`backend/scripts/close_stuck_cams_requests.py`, `backend/tests/scripts/test_close_stuck_cams_requests.py`. **Do not touch** anything else.

## Constraints
No migration (Alembic stays 0054); no new dependency; invented data only; git read-only; no deletion flags or recursive deletes. Do not weaken any existing test.

## Report format
One fenced block `CODEX REPORT: hbcd-be-3`: status; which tests were red first and why; files and functions changed with a one-line reason each; commands with pass and fail counts; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-25-hbcd-be-2-handoff.md (the script's contract)
4. Docs/orchestration/2026-11-25-hbcd-be-3-handoff.md (your task: hbcd-be-3, owner-approved)
Work only in C:\Users\Dell\lanes\unifolio-hbcd-be on branch batch/hbcd-be (reuse; the script is committed there). Git is read-only. No deletion flags or recursive deletes. Write the failing tests first, run them, then change only the two files the handoff lists. If the sandbox cannot run a test, reply BLOCKED with the exact error and write the code carefully anyway (Claude runs it).
Run tests with: cd backend; "C:\Users\Dell\Desktop\MVP v1\MVP_V1_MF_only\backend\.venv\Scripts\python.exe" -m pytest <files> -q -p no:cacheprovider
Reply with the CODEX REPORT block from the handoff, nothing else.
```
