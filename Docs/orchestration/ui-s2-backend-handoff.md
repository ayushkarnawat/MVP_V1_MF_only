# Handoff: ui-s2 backend, Home allocation funds and new funds (tasks 2.1, 2.3, 2.4)

**Status:** OPEN. **Worker:** Codex (backend only). **Rules:** `Docs/orchestration/ui-common-rules-codex.md`. **Plan:** `Docs/orchestration/2026-11-02-ui-round-2-and-auth-redesign-implementation-plan.md`, Stage S2, Tasks 2.1, 2.3, 2.4 (the task text is the spec). Alembic head `0052`. Start commit `0b73a390`.
Never touch `frontend/**`. Never run a git command that changes anything. Tests first. Money is `Decimal`.

Run the tasks in order: 2.1, then 2.3, then 2.4. Re-run each task's tests before starting the next. Names cited in the plan were re-read at `0b73a390` (see `ui-run-log.md`) and are unchanged.

## Decisions the plan left to the orchestrator
1. **Invested amount is not netted** (Task 2.3): `invested_amount` = purchases + SIPs + switch-ins of this import only. Redemptions are ignored. Say so in the field docstring.
2. For the `analytics` source, read funds from the stored look-through section. If the stored section has no per-class funds, return an empty list. Do not recompute analytics.
3. Sign-up import detection (Task 2.4): `uploaded_at < owner.onboarding_completed_at`, or onboarding not completed. Onboarding completed with a null `onboarding_completed_at` = an existing user, so not a sign-up import.

## Contract (the frontend builds against these shapes)
`GET /home/allocation`, each class row gains `funds` (default `[]`):
```json
{"key":"equity","label":"Equity","status":"live","value":"1250000.00","percentage":"62.50",
 "funds":[{"scheme_id":"7c1f0f5e-2d0a-4a43-9f1b-3d2a8e5b1a10","name":"Example Flexi Cap Fund - Direct Growth","value":"800000.00","share_of_class":"64.00"},
          {"scheme_id":"b1e4c2aa-0000-4000-8000-000000000002","name":"Example Large Cap Fund - Direct Growth","value":"450000.00","share_of_class":"36.00"}]}
```
`POST /imports/sessions/{id}/confirm`: each item of `people` gains `new_funds` (default `[]`) and `created` (default `false`):
```json
{"person_key":"p1","member_id":"...","name":"Priya Sharma","import_id":"...","added":42,"skipped":0,"created":false,
 "new_funds":[{"scheme_id":"...","scheme_name":"Example Flexi Cap Fund - Direct Growth","amc_name":"Example AMC",
   "invested_amount":"150000.00","latest_transaction_date":"2026-10-28","transaction_count":3,
   "transactions":[{"date":"2026-10-28","type":"PURCHASE_SIP","amount":"5000.00","units":"31.2500"}]}]}
```
`GET /imports/{import_id}/new-funds` returns the `new_funds` list above (`[]` for a sign-up import, 404 for another user's import). Decimals are strings, dates are ISO.
If the code forces a different field name, keep the code's name and list the difference in your report; the orchestrator updates the frontend fixture.

## Verify
Per task as in the plan. At the end: `tests/services/home`, `tests/services/import_`, `tests/api`. Do not run the synthetic CAS gate; the orchestrator does.
