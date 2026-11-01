# Run 5 common rules (both `cr-r5-*` handoffs point here)

Run 5 of 7: Head of Family, backend (item 1). Plan: `Docs/superpowers/plans/2026-10-31-change-requests-implementation-plan.md`, section "Run 5". Design source: the briefing's "Item 1 build" section (`Docs/orchestration/briefing-build/sections/sec_i1.html`, readable as text): the table-by-table swap, the single transaction, the emails, the error table, the label tables. Commit prefix `cr-r5:`. Everything in `cr-r2-common-rules.md`, `cr-r3-common-rules.md` and `cr-r4-common-rules.md` applies (method, lessons, report format) with these changes.

## Setup
- Codex works in the Windows clone `C:\Users\Ayush\cr-run-1`, synced by the orchestrator to the Run 4 end. Codex never runs `git add` or `git commit`.
- Python: `D:\Unifolio code\backend\.venv-win\Scripts\python.exe -m pytest <files>` run from the clone's `backend` folder (the venv is shared; it has pytest, tzdata and the app requirements). Set `TZ=UTC` is not possible on Windows: if a date test fails only because of the time zone, say so.
- **Postgres functional tests are mandatory in this run.** Docker Desktop must be running, then `docker compose up -d postgres` from the repo root (port 5433). `TEST_DATABASE_URL=postgresql+psycopg2://unifolio:unifolio@localhost:5433/unifolio_test`. Never point anything at staging or any shared database.
- No frontend work in Run 5 (that is Run 6).

## This run is security-sensitive: hard rules
1. **Existing sign-in behaviour does not change.** Sign-in code wording, the 5-minute window, existing error strings, existing function parameter names and positions. `create_otp_request` and `verify_otp` already exist with the signature `verify_otp(db, identifier, otp, channel)`: keep every existing parameter name and position, and add `purpose` and `commit` as **keyword-only with defaults** (`purpose="login"`, `commit=True`). The plan's interface text writes `code=`; the repo's name is `otp`. Do not rename it. Callers that pass nothing new must see byte-identical behaviour (golden test for the sign-in email HTML).
2. **Purpose isolation both ways.** A head-change code can never sign anyone in; a sign-in code can never confirm a head change. The lookup filters on purpose, not just on identifier.
3. **Secrets.** Codes, the undo token, PANs and full emails or phone numbers are never logged. The undo token is stored only as a hash and compared in constant time. The stub code is returned in the `otp` field only when `OTP_DELIVERY_MODE` is the stub mode; in SES mode the response never contains a code (test it).
4. **Limits.** Each of the four codes has its own five-try lock and its own 60-second resend throttle. A wrong code on one never counts against another.
5. **Authorisation.** Every route uses the active-user dependency (a pending-deletion account gets 403). The member and the request must belong to the caller's own account; a foreign id gets exactly the response an unknown id gets (no hint that it exists). Only the account's current head can start or cancel.
6. **One transaction.** The swap and undo run in one transaction with no internal commit (every helper they call takes `commit=False`). Lock order: `users`, then members by id, then the request, all `FOR UPDATE`. Any failure before the final commit rolls back everything (test with a forced failure midway, on SQLite and Postgres). A unique-rule `IntegrityError` at commit returns `contact_in_use`, never a 500.
7. **The one-Self index is checked per statement.** Order: clear the old head's row, flush, then set the new head's row. Test that this order never violates the index.
8. **Consent is append-only.** Never update or delete a consent row. Withdrawals are inserted with surface `head_change`.
9. **Emails after commit.** A failed email never undoes the swap; log it without the address and leave it retryable.
10. **The 15 places that read `relationship == SELF` are not edited.** The nine backend files that read Self are `api/auth.py`, `api/home.py` and, under `services/`, `dashboard/household_members.py`, `dashboard/member_merge.py`, `dashboard/member_profile.py`, `dashboard/profile_completion.py`, `import_/deletion.py`, `import_/people_resolution.py`, `import_/service.py`. They stay correct because the swap moves Self in the same transaction. Their tests are the regression suite for T5.6.
11. **Migration 0050 only.** `down_revision` is `0049_benchmark_index_registry`. Up, down, up on Postgres. No other migration is created.
12. **Error messages** are the briefing's error table, verbatim, as `{code, message}`. Do not reword. Do not invent new codes without listing them in the report.
13. Plain words on every user string. No visual check is possible: say so where relevant.

## When the plan or briefing is silent or ambiguous
List the real code you found, state the reading you chose, and flag it in the report. For anything that decides who can sign in, **stop and ask** (two options and a recommendation) instead of choosing.

## Known failures that are not yours
5 backend tests need `backend/.cache/amfi_navall/nav_all.txt`; date tests that only fail on the 31st of a month; one test that wants `D:\tmp\unifolio-backend-pytest` (`test_upsert_nav_history_is_conflict_safe_across_sessions`).

## Gate (stricter: sign-in and data safety)
Adversarial review of `cr-run-4-done..HEAD` plus a scoped second round on the swap, undo and code handling. The orchestrator commits and tags `cr-run-5-done` locally; nothing is pushed or deployed.
