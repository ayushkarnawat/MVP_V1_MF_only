# Handoff: xr-be-2 (XIRR leads, Returns on the flip side; Task 3: the caution and since-purchase on holdings rows, stored fund rows, the tile responses and the routes, Codex)
**Status:** READY TO RELAY (written 2026-11-24). **Approved:** the owner approved the plan on 24 Nov 2026. xr-be-1 (the rule) is verified and committed (`7bca7003` on `batch/xr-be`; 124 passed, 3 xfailed on its files; 3523 passed on the wider API, dashboard and analytics run).
**Parent plan:** `Docs/superpowers/plans/2026-11-24-xirr-vs-returns-plan.md` (Task 3; read "Global Constraints" and "Review Focus"). **Spec:** `Docs/orchestration/2026-11-24-xirr-vs-returns-plan.html`. If the spec, the plan and the code disagree, stop and say so.
**Worker:** Codex, backend only. **It cannot run FastAPI `TestClient` or async tests in its sandbox: write them, try once, report BLOCKED with the exact error; Claude runs them.** **Reviewer and committer:** Claude.
**Work in:** `C:\Users\Dell\lanes\unifolio-xr-be` (the same worktree, branch `batch/xr-be`, now at the xr-be-1 commit plus the docs merged in). Never in the main checkout.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## What and why
xr-be-1 made `portfolio_xirr_display` return the annualised rate always, the since-purchase return for every basis (when money was paid in), and a `caution` (`young` or `single_transaction`), and made `DashboardXirrSummary` carry `lifetime_xirr_caution` and `current_holdings_xirr_caution`. This task **sends all of it to the browser, additively**: the two tile cautions on the three tile responses, `xirr_caution` on every holdings row (consolidated parent and children) and on the stored per-fund rows. The front end (Antigravity) and the red tests it builds against are already written and read exactly these names. Nothing else changes: no new route, no removed or renamed field, **no migration, Alembic stays 0054**. The old staging link shares this backend.

## Wave-start check (report drift, do not fix drift)
Confirm: `FundBenchmarkRow` in `backend/app/services/analytics/schemas.py` (fields `xirr_as_of`, `xirr_basis`, `since_purchase_return`) and its build in `backend/app/services/analytics/benchmark.py` (the `FundBenchmarkRow(...)` call that already passes `xirr_basis=display.basis` and `since_purchase_return=...`); `HoldingXirrFields` and `consolidate_holdings` in `backend/app/services/dashboard/holdings.py`; the stored-payload read loop in `backend/app/services/dashboard/aggregate.py` (it whitelists `xirr_basis` values); `ConsolidatedHolding` and `ConsolidatedHoldingChild`, `AggregateHoldingsResponse` and `MemberHoldingsResponse` in `backend/app/services/dashboard/schemas.py`; the tile response in `backend/app/services/dashboard/portfolio_schemas.py` and its construction in `portfolio_summary.py`; the member route in `backend/app/api/dashboard.py` (around the `MemberHoldingsResponse(...)` return). Report any difference.

## The contract (fixed here; the front end already reads these names; do not rename or reshape)
```python
# XirrCaution already exists in dashboard/schemas.py (xr-be-1). All new fields are OPTIONAL with default None, appended AFTER the last existing since_purchase field of each model.
# 1. the three tile responses (AggregateHoldingsResponse and MemberHoldingsResponse in dashboard/schemas.py; the portfolio summary response in dashboard/portfolio_schemas.py):
lifetime_xirr_caution: XirrCaution | None = None
current_holdings_xirr_caution: XirrCaution | None = None
# 2. ConsolidatedHolding, ConsolidatedHoldingChild (dashboard/schemas.py), FundBenchmarkRow (analytics/schemas.py), and the HoldingXirrFields TypedDict (dashboard/holdings.py):
xirr_caution: XirrCaution | None = None
```
Fill rules:
- Tile responses: from `DashboardXirrSummary.lifetime_xirr_caution` and `current_holdings_xirr_caution` in all three places that already copy the basis keys (`aggregate.py`'s `get_aggregate_holdings`, the member route in `api/dashboard.py`, `portfolio_summary.py`).
- Stored per-fund rows: `benchmark.py` passes `xirr_caution=display.caution` where it already passes the basis. (Each fund is judged on its own flows, per fund, as xr-be-1's function already does.)
- `aggregate.py` reads `fund.get("xirr_caution")` from each stored fund and passes it on **only when it is exactly `"young"` or `"single_transaction"`**, otherwise `None` (the same whitelist style as `xirr_basis`). An old stored payload without the key must load, with `xirr_caution` None and the other fields as they are.
- `consolidate_holdings` already spreads the `HoldingXirrFields` dict into the parent (scope `combined`) and each child (scope = member id); adding the key to the TypedDict and to `aggregate.py`'s dict makes both carry their own caution. Do not compute anything on read; the table reads stored results.
- Field order matters: `tests/api/test_portfolio_routes.py` lines near 49, 74 and 96 assert `list(response.model_fields) == [...]` for the tile response models. Append the two new fields **right after `current_holdings_since_purchase`** in each model and update those lists accordingly.

## Tests first (written and run before the code; red for the stated reason)
Names are fixed:
- `backend/tests/services/analytics/xirr_reference/test_xirr_short_period.py` (extend): `stored_column_carries_since_purchase_and_caution_for_every_fund`; `a_fund_bought_once_inside_a_mature_household_has_its_own_single_transaction_caution` (two funds in one household, both over 365 days, one with a second purchase: the stored rows show `single_transaction` for one and None for the other, and the aggregate tile shows None for the household); `consolidated_parent_and_children_each_carry_their_own_caution` (a family, one member's fund young, the other's not).
- `backend/tests/services/analytics/xirr_reference/test_xirr_metadata.py` (extend): `an_old_stored_row_without_the_caution_key_still_loads` (next to the existing old-row test).
- API (try once; BLOCKED if the sandbox stalls): in `backend/tests/api/test_dashboard_aggregate_routes.py`, `test_dashboard_holdings_route.py` and `test_portfolio_routes.py`: `aggregate_route_sends_both_numbers_and_the_two_tile_cautions`; `member_holdings_route_sends_both_numbers_and_the_two_tile_cautions`; `portfolio_summary_route_sends_both_numbers_and_the_two_tile_cautions`; `old_fields_are_still_present_unchanged` (the basis keys, both since-purchase keys, `xirr`, `xirr_as_of`); `no_new_field_is_required_in_the_response` (every new field has a default: validate a response built without them).
- Update the three `model_fields` list assertions as described. If a backend JSON fixture under `backend/tests/fixtures/portfolio/summary_*.json` is compared with a real response by a test (`grep -rn "summary_family\\|summary_member" backend/tests`), add the two new keys (value null) to those fixtures; if no test compares them, leave them alone and say so.

## Run these only
```
cd backend
"C:\Users\Dell\Desktop\MVP v1\MVP_V1_MF_only\backend\.venv\Scripts\python.exe" -m pytest tests/services/analytics/xirr_reference tests/services/dashboard/test_xirr_caution.py tests/api/test_dashboard_aggregate_routes.py tests/api/test_dashboard_holdings_route.py tests/api/test_portfolio_routes.py -q -p no:cacheprovider
```
Baseline now (Claude, 24 Nov, after xr-be-1): `tests/services/analytics/xirr_reference` plus `tests/services/dashboard/test_xirr_caution.py` plus `test_xirr.py` = 124 passed, 3 xfailed; the three API route files = 35 passed. If an API test stalls, report BLOCKED with the exact error; Claude runs it.

## Files you may touch
`backend/app/services/dashboard/schemas.py`, `portfolio_schemas.py`, `portfolio_summary.py`, `holdings.py`, `aggregate.py`; `backend/app/api/dashboard.py`; `backend/app/services/analytics/schemas.py`, `benchmark.py`; the test files named above; the JSON fixtures only if a test needs them (list them).
**Do not touch:** `backend/app/services/dashboard/xirr.py` (done), `frontend/**`, migrations, any other service, any existing assertion about a rate, a basis or a dash (only the `model_fields` lists change, and only by the two new names).

## Constraints
Additive only; **no migration**; no new dependency; `Decimal`, never `float`; invented data only; no network; git read-only; no deletion flags or recursive deletes.

## Report format
One fenced block `CODEX REPORT: xr-be-2`: status (DONE, PARTIAL or BLOCKED); baseline HEAD; drift; which tests were red first and why; files and functions changed with a one-line reason each; commands with pass and fail counts; a real example of each changed response shape (the tile, a consolidated row with children, a stored fund row) showing the new fields; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-24-xr-be-2-handoff.md (your task: xr-be-2, owner-approved)
Open Docs/superpowers/plans/2026-11-24-xirr-vs-returns-plan.md (Task 3) for the context. Work only in C:\Users\Dell\lanes\unifolio-xr-be on branch batch/xr-be. Git is read-only. No deletion flags or recursive deletes. Write the failing tests first, run them, then change only the files the handoff lists. If the sandbox cannot run a test, reply BLOCKED with the exact error and still write the tests and the code.
Run tests with: cd backend; "C:\Users\Dell\Desktop\MVP v1\MVP_V1_MF_only\backend\.venv\Scripts\python.exe" -m pytest <files> -q -p no:cacheprovider
Reply with the CODEX REPORT block from the handoff, nothing else.
```
