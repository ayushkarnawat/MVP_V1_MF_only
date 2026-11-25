# Handoff: hbcd-be-4 (clean-up script: make the dry run unbypassable and the apply atomic; Codex, lane BE)
**Status:** READY TO RELAY (written 2026-11-26). **Parents:** `2026-11-25-hbcd-be-2-handoff.md` (the script's contract and output lines: unchanged) and `2026-11-25-hbcd-be-3-handoff.md`. **Approved:** the owner approved the plan on 25 Nov 2026; this answers the **third** G1 review (of `68b722ed`): two Medium findings, both reproduced on in-memory SQLite.
**Worker:** Codex, backend only. The script's tests run in its sandbox: try them, report any BLOCKED with the exact error. **Reviewer and committer:** Claude.
**Work in:** `C:\Users\Dell\lanes\unifolio-hbcd-be` (worktree, branch `batch/hbcd-be`, **reuse**; the script is committed there). Never in the main checkout.
Read first: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md`, then this file.

## Why these two matter, and what does NOT change
In production the script runs on **PostgreSQL**, where `SET TRANSACTION READ ONLY` cannot be undone inside the transaction and `FOR UPDATE` locks work. The review's SQLite reproductions still show real weaknesses in our own layers, and the tests run on SQLite, so both are fixed in a way that **does not depend on the database**.

## The findings
1. **Both dry-run protections are bypassable** (`close_stuck_cams_requests.py` ~L30): (a) the SQLite `PRAGMA query_only` protection can be switched off by a later `PRAGMA query_only = OFF` statement, which the statement check lets through; (b) the tokenised check mistakes single quotes **inside quoted identifiers** for a string literal, so `WITH "'" AS (SELECT 1) UPDATE probe SET value = 9 RETURNING value AS "'"` passes the check and commits.
2. **SQLite renewal race after the batch revalidation** (~L94): `with_for_update()` gives no lock on SQLite, so a second connection can renew a request between the revalidation read and the close; the apply then reports `closed=1` for a request whose expiry is 48 hours ahead.

## The fix (fixed here; do not redesign)
**Finding 1 (the statement check, layer b):**
- Replace the literal-stripping step with a small **real scanner** (a loop over the characters, not a regex) that walks the statement once and drops, in one pass: `-- ...` line comments, `/* ... */` block comments (not nested is fine), single-quoted literals (`''` is an escaped quote), **double-quoted identifiers** (`""` is an escaped quote), backtick-quoted and `[bracket]`-quoted identifiers. What remains is scanned for the whole-word write verbs as today (`INSERT`, `UPDATE`, `DELETE`, `MERGE`, `REPLACE`, `TRUNCATE`, `DROP`, `ALTER`, `CREATE`) **plus `PRAGMA`, `ATTACH`, `DETACH`, `VACUUM`, `SET`** (so nothing can switch the protection off; the guard's own setup statements are issued **before** the listener is attached, or marked with a private flag the listener recognises, so they are not blocked). The harmless lock clauses (`FOR UPDATE`, `FOR NO KEY UPDATE`, `FOR SHARE`, `FOR KEY SHARE`) stay allowed. An unterminated quote or comment makes the statement **blocked** (raise `WriteAttempted`).
- (a) The read-only protection stays (`SET TRANSACTION READ ONLY` on PostgreSQL; `PRAGMA query_only = ON` on SQLite, restored at the end); with the scanner blocking `PRAGMA` and `SET`, it can no longer be switched off through the session.
**Finding 2 (apply made atomic, database independent):** stop revalidating with a separate read and then closing. Close each batch with **one conditioned write**: an `UPDATE` of the batch's ids that sets `status = EXPIRED` **only where the full eligibility predicate still holds in the same statement**: `status = WAITING_FOR_USER` **and** (`expires_at < :now` **or** the member has a confirmed import with `confirmed_at` later than this request's `uploaded_at`, written as an `EXISTS` subquery); take the number of rows the statement changed (`result.rowcount`) as the batch's `closed`; the rest of the batch counts in `left_open`. Keep the batch size (at most 200), the single `now` of the selection, the commit per batch, the output lines and the existing ORM `close_member_requests` helper untouched for its other callers (this script writes through its own conditioned statement; add a one-line comment saying why: the check and the write must be one atomic statement). A request renewed (or otherwise changed) after selection simply fails the predicate and stays open.

## Tests first (red for the stated reason; fixed once written; keep every existing test)
In `backend/tests/scripts/test_close_stuck_cams_requests.py`: `test_dry_run_guard_blocks_pragma_query_only_off`, `test_dry_run_guard_blocks_set_and_attach_and_vacuum`, `test_dry_run_guard_is_not_fooled_by_quotes_inside_quoted_identifiers` (the reviewer's exact statement: `WITH "'" AS (SELECT 1) UPDATE probe SET value = 9 RETURNING value AS "'"` raises `WriteAttempted` and the value is unchanged), `test_dry_run_guard_handles_escaped_quotes_in_literals_and_identifiers` (`'it''s'` and `"a""b"` do not hide a following `UPDATE`, and a plain select that contains them passes), `test_dry_run_guard_blocks_an_unterminated_quote_or_comment`, `test_apply_is_atomic_a_request_renewed_between_selection_and_write_is_not_closed` (use a **second SQLite connection** to renew `expires_at` after the ids are selected and before the batch write, as the reviewer did; expect `closed=0` and the row still `WAITING_FOR_USER`), `test_apply_reports_closed_as_the_rows_actually_changed`. Invented data only.

## Run these only
```
cd backend
"C:\Users\Dell\Desktop\MVP v1\MVP_V1_MF_only\backend\.venv\Scripts\python.exe" -m pytest tests/scripts/test_close_stuck_cams_requests.py -q -p no:cacheprovider
```
Baseline: 16 passed (Claude, 25 Nov).

## Files you may touch
`backend/scripts/close_stuck_cams_requests.py`, `backend/tests/scripts/test_close_stuck_cams_requests.py`. Nothing else.

## Constraints
No migration (Alembic stays 0054); no new dependency; invented data only; git read-only; no deletion flags or recursive deletes. Do not weaken any existing test.

## Report format
One fenced block `CODEX REPORT: hbcd-be-4`: status; which tests were red first and why; files and functions changed; commands with pass and fail counts; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-25-hbcd-be-2-handoff.md (the script's contract)
4. Docs/orchestration/2026-11-26-hbcd-be-4-handoff.md (your task: hbcd-be-4, owner-approved)
Work only in C:\Users\Dell\lanes\unifolio-hbcd-be on branch batch/hbcd-be (reuse; the script is committed there). Git is read-only. No deletion flags or recursive deletes. Write the failing tests first, run them, then change only the two files the handoff lists. If the sandbox cannot run a test, reply BLOCKED with the exact error and write the code carefully anyway (Claude runs it).
Run tests with: cd backend; "C:\Users\Dell\Desktop\MVP v1\MVP_V1_MF_only\backend\.venv\Scripts\python.exe" -m pytest <files> -q -p no:cacheprovider
Reply with the CODEX REPORT block from the handoff, nothing else.
```
