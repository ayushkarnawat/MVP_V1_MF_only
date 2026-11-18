# Handoff: b2-address-guard (Batch B, task B-2)
**Status:** OPEN (written 2026-11-18; relay to Codex only after B-1 is committed on `batch/b-journey`)
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-b-journey-plan.md` (Task B-2). Design: `Docs/orchestration/2026-11-12-batch-b-planning-workbook.html`, section 7b parts B and C (SB2 to SB7, SF3, SF4) and part F (what the review will attack).
**Worker:** Codex, backend only. **Reviewer and committer:** Claude. **Adversarial review: yes** (security task).
**Work in:** `D:\unifolio-b-journey` (branch `batch/b-journey`, starting from the commit that contains B-1). Never in `D:\Unifolio code`.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), `Docs/orchestration/2026-11-18-client-address-verification.md`, then this file.

## Task
A per-address guard on the three code-request routes. One client address may try only a limited number of **different** email or phone addresses in a window. It runs **before** any "No account found" (404) or "already exists" (409) answer, so probing for registered addresses is limited too. Nothing about the per-address rules changes (60 s resend wait, 5 min code life, 5 wrong tries stay as they are).

## Decided numbers and message (owner, 18 Nov)
- Window **10 minutes**. Limits: **30 different addresses** counted over **all** requests ("checks"), and **10 different addresses** among requests that reach the point of sending a code ("codes").
- A request for an address the same client already tried in the window is **never** limited by the guard (one person retrying their own address is the 60 s rule's business, not this guard's).
- The 429 body when the guard limits a request: `{"detail": "Too many attempts from this network. Try again in N minutes.", "code": "request_limited", "retry_after_seconds": S}` where S is the seconds until the oldest counted request leaves the window (at least 1) and N = ceil(S / 60), at least 1; use "minute" when N is 1. Build it with a `JSONResponse` exactly the way B-1 built `_throttled_response` (same file, a sibling `_limited_response`), **not** an `HTTPException`. The `detail` sentence is plain words for the phone screens and the old link. Never name the address or the other emails tried.

## Plan correction: two phases (so "10 for codes, 30 for checks" can be true before the lookup)
The plan lists one call with a `kind`. A guard that runs before the lookups cannot know whether a code will be sent, so it runs in two steps:
1. **`begin`** (first thing in the route, before any `find_*`, `resolve_*` or pending-token lookup): counts the distinct identifier hashes this address hash used in the window across **all** rows; if that count is already `>= check_limit` and this identifier is new for this address, raise `RequestGuardLimited(retry_after_seconds)`. Otherwise insert one row (outcome `pending`) and return a ticket holding the row id.
2. **`before_code`** (just before `create_otp_request`, i.e. only on the path that will send a code): counts distinct identifier hashes among this address's rows in the window whose outcome is `code_sent` or `held`, plus this one; if that would exceed `code_limit` and this identifier is new in that set, raise `RequestGuardLimited`.
3. **`record_outcome(db, ticket, outcome)`** sets the row's outcome: `unknown_account` (the 404), `account_exists` (the 409), `held` (the 60 s rule answered 429), `code_sent`.
Return the ticket (or `None` when the guard is off or skipped) from `begin`; the plan's `-> None` is corrected. Keep the other names from the plan: `check_and_record` may be your name for `begin`; say what you chose in the report.

## Facts already checked (2026-11-18, base after B-1)
- `get_client_ip(request)` (`backend/app/services/auth/device_info.py:33`) returns the **last** `X-Forwarded-For` entry validated with `ipaddress`, else the socket address, else `None`. Verified safe on both hosts (AWS load balancer in append mode; Caddy v2.11 replaces the header): `2026-11-18-client-address-verification.md`. **Do not change its behaviour.** Do rewrite its docstring so it names both set-ups and the condition that makes "last entry" safe ("the app is never reachable except through one of these proxies"). Add tests: one entry (Caddy style), several entries with a forged first one (load balancer style), no header (socket address), garbage or over-long values (`None`).
- Routes (all in `backend/app/api/auth.py`): `signup_email` (`POST /auth/signup/email`; 409 "already exists" at the top), `request_email_otp` (`POST /auth/email-otp/request`; pending-token branch with 409 and 401, and the `flow == "login"` 404 "No account found for that email"), `request_otp` (`POST /auth/otp/request`; pending-token 401 and 409 branches, `flow` signup 409, `flow` login 404). **Not** `request_contact_change` (a signed-in route).
- Identifier normalisation: emails already arrive lower-cased and trimmed through `normalize_email` (`services/auth/schemas.py:18`); for the guard hash the same canonical form (so `A@x.com` and ` a@x.com ` count once). Phones: hash the normalised form the route already uses (find the helper; one standard form).
- Settings class `app/config.py` (`pydantic_settings`, env names are the upper-case field names). Startup checks live in `lifespan` in `app/main.py` (`_assert_pan_keys_configured` is the pattern).
- Cron convention: `$RUN <name> -m app.scripts.<module>` in `deploy/leapswitch/crontab.leapswitch` (see `cas-file-expiry-daily`). Job windows to avoid: 05:40 to 06:35, 10:30, 14:00 to 14:15.
- Migration head today is **0053** (`0053_primary_goals_life_goals.py`). Re-check the head before writing the file; take the next free number (expected **0054**); model: `0053`'s header style. Support SQLite and Postgres.

## Build
- `backend/app/models/auth.py`: `AuthRequestGuard` (`__tablename__ = "auth_request_guard"`): `id` Uuid pk (default `uuid.uuid4`), `ip_hash` String(64), `identifier_hash` String(64), `route` String, `outcome` String, `created_at` DateTime(timezone=True); index `(ip_hash, created_at)`.
- `backend/alembic/versions/0054_auth_request_guard.py` (new): create table and index; a downgrade that drops both. Test upgrade then downgrade on SQLite and (if `TEST_DATABASE_URL` is set) Postgres.
- `backend/app/config.py`: `auth_guard_enabled: bool = True`, `auth_guard_secret: str = ""`, `auth_guard_code_limit: int = 10`, `auth_guard_check_limit: int = 30`, `auth_guard_window_minutes: int = 10`.
- `backend/app/services/auth/request_guard.py` (new): keyed hashing with HMAC-SHA256 and the secret (stable, keyed: a different secret gives different hashes); IPv4 as is, **IPv6 truncated to its first 64 bits** before hashing; `begin`, `before_code`, `record_outcome`, `purge_older_than(db, hours=24) -> int`; the `RequestGuardLimited(retry_after_seconds)` exception.
  - **Failure path (SB6):** if reading or writing the guard table raises, let the request through, write one log line (no email, phone or raw address), and carry on. **Off switch:** `auth_guard_enabled = False` skips everything.
  - **Empty secret:** skip the guard, log an ERROR once per process. In `lifespan` (only that function in `main.py`), when `environment == "production"` and the guard is enabled and the secret is empty, refuse to start (same style as `_assert_pan_keys_configured`); in staging and development never refuse.
  - **No address available** (`get_client_ip` returned `None`): skip the guard and log a short line.
  - **Logging (SB7):** when a request is limited, log one line with a **short prefix of the address hash only** (for example the first 8 characters) and the route name. Never the email, the phone, or the raw address; a test checks `caplog`.
  - Concurrency: two simultaneous requests may both pass by one; do not lock.
- `backend/app/api/auth.py`: call `begin` first in the three routes and map `RequestGuardLimited` to `_limited_response`; call `before_code` immediately before each `create_otp_request` in those routes; call `record_outcome` on each path (404 `unknown_account`, 409 `account_exists`, throttled `held`, success `code_sent`). The existing answers, their order after the guard, and their sentences do not change.
- `backend/app/scripts/clean_auth_guard.py` (new): `main()` deletes rows older than 24 h and prints a count (model: `app/scripts/expire_cas_files.py`); callable as `python -m app.scripts.clean_auth_guard`.
- `deploy/leapswitch/crontab.leapswitch`: one line, `15 3  *  *  *              $RUN auth-guard-cleanup            -m app.scripts.clean_auth_guard`, placed with the other daily jobs (03:15 is outside every job window). The AWS schedule is written in the M1 deploy guide, not here.

## Tests first (name them; report which were RED first)
`backend/tests/services/auth/test_request_guard.py` (new): `test_hashes_are_keyed_and_stable`; `test_ipv6_uses_first_64_bits`; `test_identifier_variants_count_once`; `test_thirty_first_different_address_is_limited_with_seconds_left` (checks); `test_eleventh_different_address_asking_for_a_code_is_limited_with_seconds_left` (codes); `test_probes_that_send_no_code_do_not_use_up_the_code_limit`; `test_same_address_retried_is_never_limited_by_the_guard`; `test_two_client_addresses_are_counted_separately`; `test_unknown_email_probe_is_counted_before_the_404` (the 31st probe answers 429, not 404); `test_existing_email_probe_is_counted_before_the_409`; `test_table_unreadable_lets_request_through_and_logs` (patch the query to raise); `test_disabled_setting_skips_guard`; `test_empty_secret_skips_and_logs_error`; `test_no_client_address_skips`; `test_log_line_has_short_prefix_only` (no email, phone or raw address in `caplog`); `test_purge_deletes_rows_older_than_24h`; migration test on SQLite and Postgres (upgrade, downgrade).
`backend/tests/api/test_auth_routes.py` and `test_email_otp_routes.py`: the 429 body of a limited request has exactly `detail`, `code == "request_limited"`, integer `retry_after_seconds`, and `detail` is the readable sentence without any address in it; the guard applies to all three routes; an old client reading only `detail` still gets a readable sentence; a request for an unregistered address twice in a row is still 404 both times (B-3, the guard limits are not reached).
`backend/tests/services/auth/test_device_info.py`: the four `get_client_ip` cases above (header handling unchanged).
`backend/tests/test_main_startup.py` (or the existing startup test file): production with the guard enabled and an empty secret refuses to start; staging and development start.
Run each new test, see it fail for the stated reason **before** implementing.

## Test environment limit (found on B-1, 18 Nov)
Your sandbox cannot run any test that uses `TestClient` (the API tests): the run stalls in `asyncio` waiting for a loopback socket (`socket.accept` in `_fallback_socketpair`). Service-level and pure-function tests run fine. So: **write the API tests anyway** (they are part of the task), run the service-level ones and watch them go red then green, and in your report list every test you could not run and why. Claude runs the API tests after you; do not edit configs or add timeouts to get round it. If a service-level test also stalls, report BLOCKED with the exact output and stop.

## Run these only
```
cd backend
"D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest tests/services/auth/test_request_guard.py tests/services/auth/test_device_info.py tests/api/test_auth_routes.py tests/api/test_email_otp_routes.py tests/services/auth/test_otp.py -v
"D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest tests/api/test_head_change_routes.py -k "429 or throttl" -v
```
plus the startup test file you touched, and `pytest tests/functional_postgres -k otp` only if `TEST_DATABASE_URL` is set. No full suite.

## Files you may touch
`backend/app/models/auth.py`, `backend/alembic/versions/0054_auth_request_guard.py`, `backend/app/config.py`, `backend/app/services/auth/request_guard.py`, `backend/app/services/auth/device_info.py` (docstring only), `backend/app/api/auth.py`, `backend/app/main.py` (the one startup check in `lifespan`), `backend/app/scripts/clean_auth_guard.py`, `deploy/leapswitch/crontab.leapswitch`, and the test files named above. Anything else: Deviations in the report.
## Do not touch
`frontend/**`; the Head of Family routes and `head_change.py`; `otp.py`'s constants; `get_client_ip`'s behaviour; any other migration; `email_templates.py`; `auth-tokens.css`; any `ls-staging` configuration.

## Constraints
Additive only (the old staging link shares this API and database: no field removed, no meaning changed; the new table is new). No real data; never log an email, phone, code, token or raw address. Git is read-only for you.

## Open questions (flag, do not guess)
- Is `begin`'s count over all rows heavy on Postgres at your expected volume? (One indexed query; say if you think a cheaper form exists.)
- Any route besides the three that answers "No account found" or "already exists" before a code (list them; do not edit them).
- Is the phone's normalised form available at the route (and the same one the OTP row uses)?

## Report format
One fenced block `CODEX REPORT: b2-address-guard`: status; baseline HEAD; exact commands with counts; which tests were RED first and why; `git status --short`; the migration number you used and the downgrade test result; one real example 429 body; names you chose for `begin` and the ticket; Deviations; Open questions.

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-client-address-verification.md
4. Docs/orchestration/2026-11-18-b2-address-guard-handoff.md (your task: B-2)
Work only in D:\unifolio-b-journey on branch batch/b-journey. Tests first. Git is read-only. Do not touch frontend/**.
Run tests with: cd backend; "D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest <files>   (if the sandbox cannot run it, reply BLOCKED with the exact error, do not change any config)
Reply with the CODEX REPORT block from the handoff, nothing else.
```
