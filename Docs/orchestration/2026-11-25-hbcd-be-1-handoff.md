# Handoff: hbcd-be-1 (Head of Family Parts B, C, D: close a waiting CAMS request on import; read the waiting request; the CAMS address; Codex, lane BE; Tasks 1 and 3)
**Status:** READY TO RELAY (written 2026-11-25). **Approved:** the owner approved the plans on 25 Nov 2026 (decisions Q5 A, Q6 A, Q7 A; "start" given). **Patch 2** work, started early on a branch that already holds patch 1's Head of Family backend (no file overlap with Tasks 1 and 3).
**Parent plan:** `Docs/superpowers/plans/2026-11-25-hof-bcd-adddata-plan.md` (Tasks 1 and 3; read "Global Constraints" and "Review Focus"), master plan `Docs/superpowers/plans/2026-11-25-qa-patches-master-plan.md`. **Spec:** `Docs/orchestration/2026-11-24-head-of-family-d11-plan.html` (page version 16, Parts B, C, D, scenarios S1 to S15). If the spec, the plan and the code disagree, stop and say so.
**Worker:** Codex, backend only. **It cannot run `TestClient`, async or Postgres tests in its sandbox: write them, try once, report BLOCKED with the exact error; Claude runs them.** Service-level `db_session` tests that do not use `asyncio.run` normally run: run those. **Reviewer and committer:** Claude.
**Work in:** `C:\Users\Dell\lanes\unifolio-hbcd-be` (worktree, branch `batch/hbcd-be`, **reuse**; it already holds patch 1's Head of Family backend). Never in the main checkout.
Read first: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## What and why
A CAMS request ("Request from CAMS") creates a placeholder `Import` row that waits for the emailed statement (`WAITING_FOR_USER`, 48 hours). Today importing that member's statement does **not** close the placeholder, so the Add data page keeps showing a waiting request for a member who already has the data, and Cancel sometimes does nothing. This task makes an import close **that member's** waiting request, and adds two read routes the front end will use (the waiting request from the server, and the fixed CAMS address).

## Wave-start check (Claude ran it on 25 Nov; report any difference, do not fix drift)
`backend/app/services/import_/state_machine.py` `ALLOWED_TRANSITIONS`: `REQUESTING_CAS` can go to `WAITING_FOR_USER` or `UPLOAD_STARTED` **only (not `EXPIRED`)**; `WAITING_FOR_USER` can go to `UPLOAD_STARTED` or `EXPIRED`. **So `close_member_requests` closes only `WAITING_FOR_USER` rows** (a `REQUESTING_CAS` row is momentary and is left alone). `cams_portal.py`: `build_cams_mailback_url()` (L20), `initiate_cams_request` (L26), `cancel_pending_request(db, import_id, user_id)` (L78; joins `HouseholdMember` by `user_id`, excludes `PREVIEW_STATUSES`, sets `EXPIRED`, commits), `expire_stale_cams_requests(db, now=None)` (L99). `api/imports.py` L104 holds `_CAMS_PLACEHOLDER_STATUSES = (REQUESTING_CAS, WAITING_FOR_USER, EXPIRED)` used at L119 by the history route. `confirm_people.py` creates each person's import row at ~L323-330 (`Import(... household_member_id=member.id, status=ImportStatus.CONFIRMED ...)`, then `db.add`, `db.flush()`). `deletion.py` ~L164 `left = db.query(Import.id).filter(Import.household_member_id == member_id, Import.status.notin_(PREVIEW_STATUSES)).first() is not None`. `api/cas_imports.py`: `GET /cas-imports/{import_id}` at L94 (**a path parameter**), `POST /cas-imports/request` (~L293), `POST /cas-imports/{import_id}/cancel` (~L325); `require_member(db, user.id, member_uuid)` from `services/dashboard/member_details.py`; auth dependency `get_data_user`. Existing test files: `tests/services/import_/test_cams_portal.py`, `test_state_machine.py`, `test_confirm_people.py`, `test_deletion_links.py`, `tests/api/test_cams_request_routes.py`, `tests/api/test_import_history_delete_routes.py`.

## The contract (fixed here; do not rename or reshape)
```python
# state_machine.py  (MOVED here from api/imports.py; api/imports.py imports it, no other change there)
CAMS_PLACEHOLDER_STATUSES: tuple[ImportStatus, ...] = (ImportStatus.REQUESTING_CAS, ImportStatus.WAITING_FOR_USER, ImportStatus.EXPIRED)

# cams_portal.py
def close_member_requests(db: Session, member_ids: Sequence[uuid.UUID]) -> int
    # every Import row whose household_member_id is in member_ids AND status == WAITING_FOR_USER is moved to EXPIRED with transition_status; no other status, no other member; returns how many were closed; does NOT commit (the caller's transaction owns the commit); flushes nothing it does not need
def get_pending_request(db: Session, user_id: uuid.UUID, member_id: uuid.UUID, now: datetime | None = None) -> Import | None
    # the member's WAITING_FOR_USER row with expires_at > now (now defaults to datetime.now(timezone.utc)); scoped by the member's user_id; None when nothing waits. A row past its 48 hours that the nightly job has not yet swept is NOT returned (read expires_at, not only the status).

# api/cas_imports.py  (DECLARE BOTH ROUTES BEFORE `GET /cas-imports/{import_id}` (~L94), or the path parameter swallows them: "pending" and "cams-link" would be read as an import id)
class CASPendingRequest(BaseModel): import_id: str; household_member_id: str; expires_at: datetime
class CASPendingResponse(BaseModel): pending: CASPendingRequest | None
# GET /cas-imports/pending?member_id=<uuid> -> CASPendingResponse     (get_data_user; invalid uuid -> 400 like the neighbours; require_member(db, user.id, member_uuid), so another user's member id answers whatever require_member answers)
class CASCamsLinkResponse(BaseModel): cams_url: str
# GET /cas-imports/cams-link -> CASCamsLinkResponse                    (get_data_user; cams_url = build_cams_mailback_url())
```
**Rule (Task 1).** `confirm_people.py` calls `close_member_requests(db, [member.id])` for **each member whose person-import row it creates**, right after that row's `db.flush()`, inside the same transaction (so a failed confirm closes nothing). `deletion.py`'s "statement left" query adds `Import.status.notin_(CAMS_PLACEHOLDER_STATUSES)` so a member who has only a placeholder counts as having **no statement** (and the "untouched detected member" removal rule then applies). **Not changed:** `cancel_pending_request` (it already sets `EXPIRED`), `expire_stale_cams_requests`, any response model of an existing route, any other status, the history route's behaviour (it only imports the moved constant).

## Tests first (written and run before the code; red for the stated reason)
**`tests/services/import_/test_cams_portal.py`:** `test_close_member_requests_leaves_other_statuses_alone` (a `REQUESTING_CAS`, a `CONFIRMED`, an `UPLOAD_STARTED` and an already `EXPIRED` row for the member are untouched; a `WAITING_FOR_USER` row becomes `EXPIRED`; the count is right), `test_close_member_requests_only_touches_the_given_members`, `test_get_pending_request_returns_the_waiting_row`, `test_get_pending_request_ignores_a_request_past_its_expiry` (pass an explicit `now`), `test_get_pending_request_is_scoped_to_the_user`. **`tests/services/import_/test_confirm_people.py`:** `test_confirming_an_import_closes_the_members_waiting_request`, `test_confirm_closes_only_that_members_request` (two members in one statement plus a third member with a waiting request that stays open; the other user's request is untouched). **`tests/services/import_/test_deletion_links.py`:** `test_a_member_with_only_a_waiting_request_is_handled_as_having_no_statement`. **`tests/services/import_/test_state_machine.py`:** `test_placeholder_constant_is_the_one_the_history_route_uses` (`from app.api import imports` and `from app.services.import_.state_machine import CAMS_PLACEHOLDER_STATUSES` are the same object). **`tests/api/test_cams_request_routes.py`** (`TestClient`: written, tried once, BLOCKED if it stalls): `test_waiting_request_is_readable_for_each_member`, `test_pending_is_null_when_nothing_waits`, `test_pending_ignores_a_request_past_its_expiry`, `test_pending_is_scoped_to_the_user_and_member`, `test_cancel_works_with_the_id_the_server_gave` (request, read pending, cancel with that id, pending is then null), `test_cams_link_returns_the_fixed_address_and_needs_a_session` (200 with a session and the address `build_cams_mailback_url()` returns; the route without a session is refused), `test_pending_and_cams_link_are_not_read_as_an_import_id` (the two paths do not hit `GET /cas-imports/{import_id}`). **Report for each test whether it ran or was BLOCKED.**

## Run these only
```
cd backend
"C:\Users\Dell\Desktop\MVP v1\MVP_V1_MF_only\backend\.venv\Scripts\python.exe" -m pytest tests/services/import_/test_cams_portal.py tests/services/import_/test_state_machine.py tests/services/import_/test_confirm_people.py tests/services/import_/test_deletion_links.py tests/api/test_cams_request_routes.py tests/api/test_import_history_delete_routes.py -q -p no:cacheprovider
```
**Baseline (Claude, 25 Nov, on this branch): 114 passed.** Async or `TestClient` tests that stall: report BLOCKED with the exact error.

## Files you may touch
`backend/app/services/import_/state_machine.py`, `cams_portal.py`, `confirm_people.py`, `deletion.py`, `backend/app/api/imports.py` (only the import of the moved constant), `backend/app/api/cas_imports.py` (only the two new routes and their models); the test files named above (only the tests named above).
**Do not touch:** `frontend/**`, migrations, `head_change.py` and the rest of `services/auth/**`, any other route, `backend/scripts/**` (the clean-up script is hbcd-be-2).

## Constraints
Additive only (the old staging link shares this backend): two new routes, no route or field removed or changed; **no migration, Alembic stays 0054**; no new dependency or setting; invented data only; no network; git read-only; no deletion flags or recursive deletes. Tests first; red test files are fixed once written. Do not weaken any existing test.

## Report format
One fenced block `CODEX REPORT: hbcd-be-1`: status (DONE, PARTIAL or BLOCKED); baseline HEAD; drift; which tests were red first and why; files and functions changed with a one-line reason each; commands with pass and fail counts and which tests were BLOCKED; `git status --short`; Deviations; Open questions (including anything about a member removed in the same transaction as its request closing).

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-25-hbcd-be-1-handoff.md (your task: hbcd-be-1, owner-approved)
Open Docs/superpowers/plans/2026-11-25-hof-bcd-adddata-plan.md (Tasks 1 and 3) for the context. Work only in C:\Users\Dell\lanes\unifolio-hbcd-be on branch batch/hbcd-be (reuse; it already holds patch 1's Head of Family backend). Git is read-only. No deletion flags or recursive deletes. Write the failing tests first, run the service-level tests, then change only the files the handoff lists. If the sandbox cannot run a test (TestClient, async, Postgres), reply BLOCKED with the exact error and stop that part. Remember: declare the two new GET routes BEFORE GET /cas-imports/{import_id}.
Run tests with: cd backend; "C:\Users\Dell\Desktop\MVP v1\MVP_V1_MF_only\backend\.venv\Scripts\python.exe" -m pytest <files> -q -p no:cacheprovider
Reply with the CODEX REPORT block from the handoff, nothing else.
```
