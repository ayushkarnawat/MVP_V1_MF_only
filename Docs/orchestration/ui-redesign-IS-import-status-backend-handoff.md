> **DROPPED (owner decision, 27 Oct): do not run this handoff.** The old system had no failed-import tracking, so the failed-import banner and 'statement is being processed' note are not built; nothing here is invented. Kept only as a record.

# Handoff: ui-redesign IS (Home import-status backend: failed-import banner + "statement is being processed" note)
**Status:** DRAFT, NOT READY TO RUN until the owner answers Open question 1 (written 27 Oct 2026). **Worker:** Claude Code (Sonnet), one terminal session. **Orchestrator:** Claude Code in the main session, who verifies and makes every commit.
**Why:** register C120 parked two Home items for lack of a data source: the failed-import banner (layout F3, owner H10: "sits above everything") and the "Your statement is being processed" note shown with skeletons (layout line 44). Front-end consumer: the G6 Home assembly; the front end waits for the golden fixtures of Task 7.
**Branch:** `feat/home-import-status`, created from `leapswitch-redesign` after PRs #10 (Home), #12, #15 are merged in (the orchestrator says when). Do not switch branches.
**Worker rules specific to this repo (read first):** `CLAUDE.md` tells sessions to invoke task-observer and model-orchestration and to delegate to Codex: **ignore both here** (do not invoke, delegate or spawn subagents). Read `AGENTS.md`; follow superpowers TDD and verification-before-completion.

## 1. What exists (verified by the orchestrator in code, 27 Oct; confirm by reading before you build)
- **Table `imports`** (`app/models/imports.py`, class `Import`): `household_member_id`, `status` (`ImportStatus`), `error_type`, `error_code`, `error_message`, `uploaded_at`, `confirmed_at`, `statement_from_date/to_date`, `expires_at`, `upload_group_id`, `preview_state`. **Nothing ever writes `IMPORT_FAILED`, `FAILED`, `error_type`, `error_code` or `error_message`** (grep `app/` shows only the read in `api/cas_imports.py::_serialize_import_response`). Only `PREVIEWING`, `PROCESSING` (preview_store / service / confirm_people), `CONFIRMED` (confirm_people.py:321), `WAITING_FOR_USER`/`EXPIRED` (CAMS placeholder) and `IMPORT_SUCCESSFUL` (coverage_gap.py opening-balance row) are written.
- **Flow:** `POST /imports/parse` parses in the request; a parse failure is an HTTP 422 with `detail.code` (`ParseError.code`) and **leaves no row**. A successful parse makes a `PREVIEWING` row (encrypted `preview_state`, 30-minute-style TTL via `expires_at`). `POST /imports/confirm` claims the row to `PROCESSING` (service.py ~1044, confirm_people.py ~283) and writes a `CONFIRMED` row per person in the same request; any error is mapped to an HTTP code and the transaction rolls back, so the row returns to `PREVIEWING` or is gone. So "failed" leaves no durable trace today. Whether the `PROCESSING` claim is ever committed and visible to another request is **unverified** (Task 0).
- **Existing history routes to mirror, not touch:** `GET /imports/history` (`api/imports.py`, hides `PREVIEW_STATUSES` and CAMS placeholders) and `GET /household-members/{id}/cas-imports` (`api/cas_imports.py`). **A new `IMPORT_FAILED` row would appear in both** (neither filters it) and in `_has_data` neighbours: this is why Task 1 uses a separate table.
- **Known codes today** (`detail.code` in `api/imports.py` and `services/import_/`): `wrong_password`, `scanned_pdf`, `damaged_pdf`, `unknown_issuer`, `invalid_file`, `file_too_large`, `pan_conflict`, `pan_belongs_to_other_member`, `pan_mismatch_for_member`, `cross_account_pan_blocked`, `confirm_invalid`, `name_not_on_statement`, `invalid_name`, `name_not_editable`, `invalid_choice`; non-failures: `already_imported`, `session_expired`, prompts (409 `ImportPromptError`).
- **Home pattern:** `app/api/home.py` (router, `get_now_ist`), `app/api/home_news.py` (a second Home router file: copy its registration style), `app/services/home/context.py::resolve_scope(db, user, member_id)` -> `ScopeContext(scope, member_id, member_ids, members: tuple[MemberOut], member_name)`; a foreign member id raises the 404 `{"detail": "Household member not found."}` inside it via `require_member`. `app/services/home/schemas.py`: `HomeModel` (`extra="forbid"`), `MemberOut(id, name, has_data)`. Latest alembic head is `0046_job_runs`. Home tests: `tests/api/home_fixture.py` (`build_home_fixture`, `FIXED_NOW` = Fri 2026-10-23 18:30 IST).
- **"Last success"** = the member's newest `Import` with `status == CONFIRMED` (the same rule as `_has_data` in `dashboard/aggregate.py`; use its `confirmed_at`, falling back to `uploaded_at`).

## 2. Decisions fixed for this run (defaults; the owner may veto before it runs)
1. **Read-only route, additive storage only.** One GET pair; a new table for failures (Task 1); no existing column, route, model or status changes meaning.
2. **Per member, most recent only.** Each member in scope gets one `ImportStateOut`. Precedence: `processing` (a live claim) beats `failed` beats `ok`/`none`. `failed` shows only when the failure is **newer than the member's last success** and within `FAILURE_VISIBLE_DAYS = 14`; any later successful import clears it with no dismiss action (no write route in this feature).
3. **Codes only, no copy.** The API returns a closed `reason_code` set; the front end owns the wording (never leak parser text or file names; `error_message` is never exposed). No PII beyond the member `name` that `MemberOut` already exposes.
4. **Dates are IST calendar dates** (`YYYY-MM-DD`), never timestamps, from `get_now_ist()` conventions.
5. Same 404 body for a foreign id as every Home route (via `resolve_scope`); no new ownership helper.

## 3. Reason codes (closed set; unknown input maps to `other`)
| `reason_code` | Source `detail.code` values |
|---|---|
| `wrong_password` | `wrong_password`, `password` |
| `scanned_pdf` | `scanned_pdf` |
| `unreadable_file` | `damaged_pdf`, `invalid_file`, `file_too_large` |
| `unsupported_statement` | `unknown_issuer` |
| `pan_conflict` | `pan_conflict`, `pan_belongs_to_other_member`, `pan_mismatch_for_member`, `cross_account_pan_blocked` |
| `could_not_save` | `confirm_invalid`, `name_not_on_statement`, `invalid_name`, `name_not_editable`, `invalid_choice`, and any unexpected exception in confirm |
| `other` | everything else |
Not failures, never recorded: `already_imported`, `session_expired`, 409 prompts the user can answer, a user discard. Put the mapping in one pure function `map_reason(code: str | None) -> str` (Task 2) used by both writer and reader.

## 4. JSON schema (Pydantic v2, `extra="forbid"`, new file `app/services/home/import_status_schemas.py`)
```python
ImportState = Literal["none", "ok", "processing", "failed"]
ReasonCode = Literal["wrong_password","scanned_pdf","unreadable_file","unsupported_statement","pan_conflict","could_not_save","other"]
class ImportStateOut(HomeModel):
    member_id: str; name: str                      # MemberOut fields only
    state: ImportState                             # none = never imported and nothing running
    processing_since: date | None                  # set only when state == "processing"
    failed_on: date | None                         # set only when state == "failed"
    reason_code: ReasonCode | None                 # set only when state == "failed"
    last_success_on: date | None                   # newest CONFIRMED date, any state
class ImportStatusResponse(HomeModel):
    scope: Literal["aggregate","member"]; member_id: str | None; computed_at: datetime
    any_processing: bool; any_failed: bool         # convenience for the banner/note
    members: list[ImportStateOut]                  # household order (created_at, id) in aggregate; exactly one in member scope
```
Routes (new router file `app/api/home_import_status.py`, `tags=["home"]`, auth `get_active_user`, `get_db`, `get_now_ist` imported from `app.api.home`; one `include_router` line in `app/main.py`):
`GET /household/aggregate/home/import-status` and `GET /household-members/{member_id}/home/import-status`. A GET that never writes, never recomputes Analytics, never dispatches.

## 5. Tasks (test first, red first, one commit per task by the orchestrator; list the RED tests in the report)
**Task 0, verify and report (no code).** (a) Does any request-visible `PROCESSING` row exist? Read `claim_session_for_confirm` and `confirm_people` for where the claim is committed; state "visible after commit at <file:line>" or "never committed before the final commit". If never visible, `processing` can only come from the recompute claim (b). (b) `AnalyticsRecomputeStatus.started_at` (`app/services/analytics/recompute.py`, household-level, stale ceiling `_STALE_RECOMPUTE_CEILING`): readable without writing? Report both facts with line numbers. **Stop and report if (a) and (b) both give no usable signal** (then "being processed" needs a different source; Open question 2).

**Task 1, FIRST AND CLEARLY MARKED: durable failure storage (the only schema change).** Nothing durable exists for failures, so add a table; do not reuse `imports` (it would leak into both history routes and any status filter).
- Migration `0047_import_failures.py`, `down_revision = "0046"`: `CREATE TABLE import_failures(id uuid pk, household_member_id uuid fk household_members ON DELETE CASCADE not null, reason_code varchar(32) not null, occurred_at timestamptz not null)`, index `(household_member_id, occurred_at DESC)`. Additive: no backfill, no change to an existing table; downgrade drops the table. **Migration risk to state in the report:** one new revision on the shared head (collision if another branch also takes `0047`: run `alembic heads` and expect exactly `0047 (head)`); runs on SQLite (tests) and Postgres (staging); a writer failure must never mask the user's real error (see below).
- Model `app/models/import_failure.py` (register it where the other models are imported so Alembic autogenerate and `Base.metadata` see it).
- Writer `app/services/import_/failure_log.py::record_import_failure(member_id, raw_code)`: opens its **own short session** (`SessionLocal`, as `_dispatch_recompute...` does), inserts `map_reason(raw_code)`, commits, and **swallows and logs any exception** (never raises, never rolls back the caller's session).
- Hooks, minimal and in `app/api/imports.py` only, right where the existing `HTTPException` is raised: the `ParseError` handler in `/parse` (member known from the form), and the confirm error mapper for the `ConfirmInvalidError`/`PanConflictError`/generic-failure branches (member from the request or session). **Do not record** `AlreadyImportedError`, `SessionExpiredError`, prompts, discards. No behaviour change to any response (status codes and bodies byte-identical; a test asserts it).
- Tests (RED first): migration upgrade/downgrade round trip on SQLite; `map_reason` table-driven over every row of section 3 plus `None` and an unknown string; writer inserts one row; writer swallows a DB error; `/parse` with a wrong password records `wrong_password` for that member and still returns the same 422 body; `already_imported` and `session_expired` record nothing. **If you find the hook point is not a clean one-line addition, stop and report** (Open question 3).

**Task 2, pure logic `app/services/home/import_status.py`:** `map_reason`; `derive_member_state(*, now_ist, last_success_at, latest_failure, processing_since) -> ImportStateOut fields` (pure, no DB): precedence per decision 2; `failed` needs `failed_at > last_success_at` and age <= 14 days (IST date arithmetic); `processing_since` only if within the stale ceiling (a claim older than it is ignored); `none` when no success, no failure, no processing. Table-driven tests: processing beats a newer failure; failure then success clears; success then failure shows failed; failure 15 days old hidden; boundary day 14 shown; stale processing ignored; never-imported member is `none`; failed on the same IST day as the last success but earlier is hidden (compare timestamps, display dates).

**Task 3, loader + routes:** `load_import_status(db, ctx, now_ist)` with **three** set-based queries for all members in scope (latest `CONFIRMED` per member, latest `import_failures` per member, the processing signal from Task 0), not one per member; routes thin as in `home_news.py`; `response_model` set. Do not edit `app/api/home.py` or `app/services/home/schemas.py`.

**Task 4, route tests** (`tests/api/test_home_import_status_routes.py`, hand-built fixtures on `build_home_fixture`, inserting `Import`/`ImportFailure`/recompute-claim rows directly; no parser, no network):
1. 401 unauthenticated; foreign `member_id` returns the identical 404 body as `GET /household-members/{foreign}/home/summary`; malformed uuid 422 like Home.
2. Aggregate lists every member in created order with `members[i].name` equal to Home's `MemberOut`; member scope lists exactly one.
3. Scenarios (each asserts all fields of the entry): never imported (`none`); imported only (`ok`, `last_success_on` set); processing; failed after success; failed then re-imported (`ok`); two failures (only the latest `reason_code`/`failed_on`); mixed household (one failed, one ok, one processing: `any_failed` and `any_processing` true); failed 15 days ago (hidden); each of the 7 reason codes round-trips.
4. Another household's failure/processing never leaks (two users, assert member lists and bodies).
5. No writes, no recompute: SELECT-only SQLAlchemy listener; analytics `compute_*`, snapshot rebuild and `dispatch` patched to raise; statement count flat for 2 versus 6 members.
6. PII/leak guard: the serialised body contains no key beyond the schema, no `error_message`, no file name, no raw code outside `ReasonCode`.
7. OpenAPI: `state` and `reason_code` are enums with exactly the values above; dates are `date` formatted, `member_id` is a string.
8. Parity: `members[*].last_success_on` is non-null exactly when Home's `MemberOut.has_data` is true.

**Task 5, golden fixtures** for the front end, generated by `backend/scripts/write_import_status_fixtures.py` into `backend/tests/fixtures/home/` and compared **read-only** in a test (never write-then-compare): `import_status_none.json`, `import_status_ok.json`, `import_status_processing.json`, `import_status_failed_wrong_password.json`, `import_status_failed_scanned_pdf.json`, `import_status_family_mixed.json`, `import_status_member_failed.json`. A `test_import_status_fixture_semantics` opens each file and asserts what its name promises (e.g. `family_mixed` has 3 members with states `failed`, `ok`, `processing` and both flags true; `member_failed` has `scope == "member"` and one entry). Use `FIXED_NOW`; no wall-clock values in any file.

**Task 6, neighbours only:** run the commands below; no gate script is needed (read-only route on hand-built data).

## 6. Test commands (run only these; no full suite)
From the repo's WSL venv: `"$PY" -m pytest -p tests.offline_http <files> -q -p no:cacheprovider --disable-warnings` with `--basetemp=/tmp/pytest-IS` (**own basetemp, never shared with another run**). Baseline first (record, red means STOP): `tests/api/test_home_routes.py tests/services/home tests/api/test_imports*.py tests/api/test_cas_imports*.py` plus `"$PY" -m alembic heads` expecting `0046 (head)`. After Task 1: `alembic heads` expects `0047 (head)`. Final: the new files, then the baseline set again (must equal the recorded baseline plus your new tests). Exclude `tests/services/analytics/test_portfolio_disclosure_parsing.py` (`xlwt` missing). Install nothing.

## 7. Checkpoints (print exactly these lines in your terminal as you go)
`IS-CHECKPOINT T0 done: processing signal = <source>` ; `IS-CHECKPOINT T1 red/green: migration+writer+hooks` ; `IS-CHECKPOINT T2 green` ; `IS-CHECKPOINT T3 green` ; `IS-CHECKPOINT T4 green: <n> tests` ; `IS-CHECKPOINT T5 fixtures: 7 files` ; `IS-CHECKPOINT FINAL: baseline equal, alembic 0047 head`.

## 8. Scope and file map
**Allowed (new unless noted):** `backend/alembic/versions/0047_import_failures.py`; `backend/app/models/import_failure.py` and its one import line wherever models are registered; `backend/app/services/import_/failure_log.py`; `backend/app/services/home/{import_status,import_status_schemas}.py`; `backend/app/api/home_import_status.py`; `backend/app/main.py` (one `include_router` line); `backend/app/api/imports.py` (the Task 1 hook lines **only**); `backend/scripts/write_import_status_fixtures.py`; the tests named above and the 7 fixtures; this handoff's Report block. **Do not edit:** `app/api/home.py`, `app/services/home/{context,schemas,summary,wealth,...}.py`, `app/models/imports.py`, `app/models/enums.py`, `state_machine.py`, `preview_store.py`, `service.py`, `confirm_people.py`, `cas_imports.py`, `dashboard/*`, `analytics/*`, any other migration. If one of them must change, stop on that point and say why.

## 9. Constraints
Additive only; no new dependency; no float; LF endings, UTF-8 (`git diff --check`, `git ls-files --eol`). Git is read-only for you (`status`, `diff`, `log`, `show`, `grep`, `ls-files`): do not commit, push or switch branches. No real HTTP. Match surrounding comment density; comment the *why* of the 14-day window, the own-session writer and the never-raise rule.

## 10. Stop conditions (stop at once and report; do not work around)
Baseline red; `alembic heads` not `0046 (head)` at the start; Task 0 finds no usable processing signal; the failure hook needs more than a one-line addition per branch or would change any response body/status; Postgres-only SQL is needed (the suite runs on SQLite); a forbidden file seems to need changing; any step would write from a GET; the owner's veto on a section-2 default arrives.

## 11. Review focus (for the gate)
No write path reachable from the GET routes; the failure writer cannot raise into or roll back the user's request; no response body changed on `/parse` or `/confirm`; `imports` untouched so History and `_has_data` are unaffected; every foreign id returns the Home 404 body; closed code set with nothing raw leaked; state precedence and the 14-day boundary; flat statement count; fixtures compared read-only and named by semantics; migration is additive with a working downgrade.

## 12. Approaches considered and rejected
Writing `IMPORT_FAILED` rows into `imports` (pollutes both history routes, may disturb status filters, touches write paths in forbidden files); parsing `error_*` columns (never populated); deriving failure from absence of a `CONFIRMED` row (cannot tell failed from not yet tried); a dismiss/acknowledge write route (YAGNI: a later success clears it; revisit if the banner proves sticky); exposing raw `detail.message` (may carry file or PAN-adjacent text).

## 13. Open questions (owner; the worker never guesses)
1. **Approve the new table `import_failures` and the hooks in `api/imports.py`** (decisions 1 and 2 and Task 1)? Without storage there is no failed state at all.
2. What should "being processed" mean when no request-visible `PROCESSING` row exists: the household analytics-recompute claim (so the note can show for minutes after a confirm), or only a live claim? Default: both, via Task 0.
3. Failure visibility window 14 days and no dismiss: acceptable, or should the banner expire sooner (for example 3 days) or be dismissible?
4. Should upload-time failures with no known member (a bad file posted before a member is chosen) be ignored? Default: yes, only member-bound failures are recorded.

## 14. Report (the worker fills this in at the end, in one fenced block)
```
WORKER REPORT — ui-redesign — IS (import-status backend)
Run date/time:    Worker (tool and model):    Python:    Baseline HEAD:
1. TASK STATUS (T0 to T6):
2. FILES (added and changed):
3. TESTS (RED list; baseline numbers before/after; final command and last line; alembic heads before/after):
4. TASK 0 FACTS (processing signal with file:line; recompute-claim readability):
5. MIGRATION RISK NOTES (head collision check, downgrade tested, SQLite and Postgres):
6. DEVIATIONS (mechanics only):
7. FINDINGS:
8. OPEN QUESTIONS / BLOCKERS:
9. SELF-REVIEW FINDINGS (no GET writes; no float; response bodies of /parse and /confirm unchanged; git status = allowed files):
10. CONFIRMATIONS (no git writes; no full suite; own basetemp used; edits only in allowed files):
```
