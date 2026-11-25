# Handoff: hofa-be-1 (Head of Family Part A; Task 1: eligibility no longer looks at imports, Codex)
**Status:** READY TO RELAY (written 2026-11-25). **Approved:** the owner approved the plans on 25 Nov 2026 (all 30 design questions answered; "start" given).
**Parent plan:** `Docs/superpowers/plans/2026-11-25-hof-part-a-plan.md` (Task 1; read "Global Constraints" and "Review Focus"), master plan `Docs/superpowers/plans/2026-11-25-qa-patches-master-plan.md`. **Spec (the design):** `Docs/orchestration/2026-11-24-head-of-family-d11-plan.html` (page version 16, Part A and decisions D1 C, D2 A). If the spec, the plan and the code disagree, stop and say so.
**Worker:** Codex, backend only. **It cannot run FastAPI `TestClient` or async tests in its sandbox (they stall): write them, try once, report BLOCKED with the exact error; Claude runs them.** Pure-function and service-level tests (`db_session` tests that do not use `asyncio.run` or `TestClient`) normally run: run those. **Reviewer and committer:** Claude.
**Work in:** `C:\Users\Dell\lanes\unifolio-hofa-be` (worktree, branch `batch/hofa-be`). Never in the main checkout.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## What and why (owner decisions, 24 and 25 Nov 2026)
Today the Head of Family change refuses when **any** import is open anywhere in the household, including a "waiting for CAMS email" request that is created the moment the user presses the button and is never closed by an import. The owner decided: **a pending, waiting, abandoned, failed or old import must never stop a Head of Family change.** This task removes the household-wide `import_in_progress` reason everywhere it is produced. (Task 2, a separate handoff, settles unfinished reviews inside the change itself; do **not** do that here.)

## Wave-start check (report drift, do not fix drift)
Confirm in `backend/app/services/auth/head_eligibility.py`: `EligibilityReason` (a `Literal`, `import_in_progress` is the 11th of 12 values, ~L18-31); `member_eligibility(db, user, member_id) -> list[EligibilityReason]` appending `"import_in_progress"` at ~L124-125 when `_has_open_import_or_pan_claim(db, user.id)` (~L193-218) is true. In `head_change.py`: `START_CODE_ELIGIBILITY_REASONS` (~L65-75) containing `"import_in_progress"`, and `_reason_error` with an `import_in_progress` branch (~L424-429, status 409). Callers of `member_eligibility` are all in `head_change.py` (start-code, start, list, `_contact_in_use_after_integrity`, `complete_head_change`). Report any difference.

## The contract (fixed here; do not rename or reshape)
- `EligibilityReason` becomes a `Literal` of **exactly these eleven values, in this order**: `no_email`, `no_phone`, `same_email_as_head`, `same_phone_as_head`, `email_in_use`, `phone_in_use`, `pan_registered_elsewhere`, `no_pan`, `label_missing`, `account_pending_deletion`, `head_change_already_open`.
- `member_eligibility` keeps its signature and raises `MemberNotFoundError` exactly as today; it simply has no import branch. `_has_open_import_or_pan_claim` is deleted, with any imports only it used (`Import`, `TERMINAL_STATES`, the PAN-pending check).
- `START_CODE_ELIGIBILITY_REASONS` loses `"import_in_progress"`; `_reason_error` loses its import branch (the other branches are untouched).
- One comment where the branch was: "A pending or abandoned import never blocks a head change (owner, 24 Nov 2026); unfinished reviews are settled inside `complete_head_change`."
- **Not changed:** the swap, `complete_head_change`, `HeadChangeResult`, any route, any response model, the front end. (After this task alone, an unfinished review no longer blocks and is **not yet** discarded: Task 2 adds that. Do not add a stopgap.)

## Tests first (written and run before the code; red for the stated reason)
In `backend/tests/services/auth/test_head_eligibility.py` (helpers `_eligible_household()` returning `db, user, head, candidate`, `ACTIVE_IMPORT_STATUSES` at ~L246):
- replace `test_import_in_progress_for_each_non_terminal_import_status` (~L260-273) with `test_no_import_status_blocks_eligibility`, parametrised over **every** `ImportStatus` member (not only `ACTIVE_IMPORT_STATUSES`), each building an `Import` for the candidate member in that status and asserting `member_eligibility(db, user, candidate.id) == []`;
- keep `test_terminal_import_does_not_block_eligibility` (~L286) unchanged;
- replace `test_live_pan_claim_is_import_in_progress_but_an_expired_claim_is_not` (~L301-307) with `test_a_live_pan_claim_does_not_block_eligibility` (a future `pan_pending_until` on the candidate: `[]`; an expired one: `[]`);
- change `test_reasons_are_returned_in_the_documented_order` (~L330) to the eleven-value order above;
- add `test_reason_list_has_exactly_the_eleven_values` (`typing.get_args(EligibilityReason)` equals the list) and `test_each_of_the_other_eleven_reasons_still_blocks` (parametrised, one case per remaining reason, reusing the existing helpers and the setups that already produce each reason in this file; if one reason has no existing setup helper, say so in the report rather than inventing a fragile one).
In `backend/tests/services/auth/test_head_change_flow.py`: add `test_start_code_and_start_succeed_while_a_cams_request_waits` (a `WAITING_FOR_USER` `Import`, `source_tab="request"`, `expires_at` 48 hours ahead, for the candidate member) and `test_start_succeeds_with_an_unfinished_review_open` (a `PREVIEWING` `Import` for the candidate); **update** the assertion at ~L593 that lists `import_in_progress` so it matches the new behaviour (read the test; it likely pins the reasons list or a refusal).
In `backend/tests/api/test_head_change_routes.py` (needs `TestClient`: written, tried once, BLOCKED if it stalls): change `test_eligibility_reports_an_open_change_and_an_open_statement_import` (~L652; the list at ~L664 contains `import_in_progress`) so the import part asserts **no** import reason is reported, and add `test_eligibility_route_has_no_import_reason_with_a_waiting_cams_request`.
Report, for each existing test you changed, what it pinned and what you changed.

## Run these only
```
cd backend
"C:\Users\Dell\Desktop\MVP v1\MVP_V1_MF_only\backend\.venv\Scripts\python.exe" -m pytest tests/services/auth/test_head_eligibility.py tests/services/auth/test_head_change_flow.py tests/services/auth/test_head_change_swap.py tests/services/auth/test_head_change_undo.py tests/api/test_head_change_routes.py -q -p no:cacheprovider
```
Baseline before any change (Claude, 25 Nov, on this branch): these five files = **167 passed**. If an API test stalls in the sandbox, report BLOCKED with the exact error; Claude runs it.

## Files you may touch
`backend/app/services/auth/head_eligibility.py`; `backend/app/services/auth/head_change.py` (**only** the `START_CODE_ELIGIBILITY_REASONS` set and the `_reason_error` branch); the three test files named above (only the tests named above).
**Do not touch:** `frontend/**`, migrations, `complete_head_change` and the swap, `backend/app/services/auth/schemas.py`, `backend/app/api/**`, `backend/app/services/import_/**`.

## Constraints
Backend changes are additive only in effect (the old staging link shares this backend: it can only ever see fewer reasons); **no migration; Alembic stays 0054**; no new dependency; invented data only; no network; git read-only; no deletion flags or recursive deletes. Tests first; red test files are fixed once written.

## Report format
One fenced block `CODEX REPORT: hofa-be-1`: status (DONE, PARTIAL or BLOCKED); baseline HEAD; drift; which tests were red first and why; the existing tests you changed and what you changed in each; files and functions changed with a one-line reason each; commands with pass and fail counts; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-25-hofa-be-1-handoff.md (your task: hofa-be-1, owner-approved)
Open Docs/superpowers/plans/2026-11-25-hof-part-a-plan.md (Task 1) for the context. Work only in C:\Users\Dell\lanes\unifolio-hofa-be on branch batch/hofa-be. Git is read-only. No deletion flags or recursive deletes. Write the failing tests first, run them, then change only the files the handoff lists. If the sandbox cannot run a test, reply BLOCKED with the exact error and stop that part.
Run tests with: cd backend; "C:\Users\Dell\Desktop\MVP v1\MVP_V1_MF_only\backend\.venv\Scripts\python.exe" -m pytest <files> -q -p no:cacheprovider
Reply with the CODEX REPORT block from the handoff, nothing else.
```
