# Handoff: hbcd-be-1b (finish hbcd-be-1: the two call sites and the two read routes; Codex, lane BE)
**Status:** READY TO RELAY (written 2026-11-25). **Parent:** `Docs/orchestration/2026-11-25-hbcd-be-1-handoff.md` (read it first: the contract, the rule and the constraints are unchanged and still apply).
**Worker:** Codex, backend only. **Its sandbox cannot run the confirm, deletion or API tests (a `C:\tmp` permission error and a stalled `TestClient`): write the code carefully and do not try to run those; Claude runs them.** **Reviewer and committer:** Claude.
**Work in:** `C:\Users\Dell\lanes\unifolio-hbcd-be` (worktree, branch `batch/hbcd-be`, **reuse**; it holds your hbcd-be-1 work, uncommitted: leave it). Never in the main checkout.
Read first: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md`, then this file.

## State (Claude ran the six test files on 25 Nov)
**10 failed, 120 passed.** Your service helpers are green. The 10 red tests fail for the right reasons: the two confirm tests (the waiting request stays `waiting_for_user`), the deletion test (the placeholder-only member is not removed), and the seven API tests (`400`: `/cas-imports/pending` and `/cas-imports/cams-link` are read as an import id by `GET /cas-imports/{import_id}`). Do not change any test file.

## What to build (exactly the contract of hbcd-be-1; nothing new)
1. `backend/app/services/import_/confirm_people.py`: after the person-import row is added and flushed (`db.add(import_rec); db.flush()`, ~L329-330), call `close_member_requests(db, [member.id])` (import it from `cams_portal`; watch for a circular import and import inside the function if needed). One call per member whose person-import row is created, inside the same transaction.
2. `backend/app/services/import_/deletion.py` (~L164): the `left = db.query(Import.id).filter(Import.household_member_id == member_id, Import.status.notin_(PREVIEW_STATUSES)).first() is not None` query also excludes `CAMS_PLACEHOLDER_STATUSES` (import it from `state_machine`), so a member with only a placeholder has no statement left.
3. `backend/app/api/cas_imports.py`: add the two models and the two routes of the contract, **declared BEFORE `GET /cas-imports/{import_id}`** (~L94): `GET /cas-imports/pending?member_id=<uuid>` (response `CASPendingResponse`; invalid uuid answers 400 like the neighbours; `require_member(db, user.id, member_uuid)`; uses `get_pending_request`; `expires_at` as the row's datetime) and `GET /cas-imports/cams-link` (response `CASCamsLinkResponse`, `cams_url = build_cams_mailback_url()`); both with `Depends(get_data_user)` and `Depends(get_db)`. Read the failing tests in `tests/api/test_cams_request_routes.py` first: they fix the exact response shape and the status codes.

## Files you may touch
`backend/app/services/import_/confirm_people.py`, `backend/app/services/import_/deletion.py`, `backend/app/api/cas_imports.py`. **Do not touch** any test file or any other file.

## Constraints
Additive only; no migration (Alembic stays 0054); no new dependency; git read-only; no deletion flags or recursive deletes. Do not weaken or change any existing test.

## Report format
One fenced block `CODEX REPORT: hbcd-be-1b`: status; files and functions changed with a one-line reason each; the exact route response shape you implemented; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-25-hbcd-be-1-handoff.md (the contract, read first)
4. Docs/orchestration/2026-11-25-hbcd-be-1b-handoff.md (your task: hbcd-be-1b, owner-approved)
Work only in C:\Users\Dell\lanes\unifolio-hbcd-be on branch batch/hbcd-be (reuse; it holds your hbcd-be-1 work, uncommitted: leave it). Git is read-only. No deletion flags or recursive deletes. You cannot run the confirm, deletion or API tests in your sandbox: do not try; write the code carefully (declare the two new GET routes BEFORE GET /cas-imports/{import_id}). Claude runs the tests. Change only the three files the handoff lists; change no test file.
Reply with the CODEX REPORT block from the handoff, nothing else.
```
