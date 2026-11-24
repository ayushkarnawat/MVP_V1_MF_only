# Handoff: xr-be-1 (XIRR leads, Returns on the flip side; Task 2: the backend rule and the tile path, Codex)
**Status:** READY TO RELAY (written 2026-11-24). **Approved:** the owner approved the plan on 24 Nov 2026 and said to start execution (all 11 design questions answered).
**Parent plan:** `Docs/superpowers/plans/2026-11-24-xirr-vs-returns-plan.md` (Task 2; read "Global Constraints" and "Review Focus"). **Spec (the design):** `Docs/orchestration/2026-11-24-xirr-vs-returns-plan.html`. If the spec, the plan and the code disagree, stop and say so.
**Worker:** Codex, backend only. **It cannot run FastAPI `TestClient` or async tests in its sandbox (they stall): write them, try once, report BLOCKED with the exact error; Claude runs them.** Pure-function and service-level tests (`db_session` tests that do not use `asyncio.run` or `TestClient`) normally run: run those. **Reviewer and committer:** Claude.
**Work in:** `C:\Users\Dell\lanes\unifolio-xr-be` (worktree, branch `batch/xr-be`). Never in the main checkout.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## What and why (owner decisions, 24 Nov 2026)
Today `portfolio_xirr_display` swaps to the since-purchase return for anything under 365 days, so a screen labelled "XIRR" shows a number that is not an XIRR. The owner decided: **XIRR (annualised) is always the headline; Returns (since purchase) is always available beside it.** This task changes the one backend function behind the tile figures, so that (a) the annualised rate is always returned, (b) the since-purchase return is always returned when money was paid in (not only under a year), and (c) an optional **caution** says why a young or single-purchase XIRR should be read with care. Nothing else in this task: the per-fund stored rows, the holdings rows, the response schemas and the routes are the next task (xr-be-2).

## Wave-start check (report drift, do not fix drift)
Confirm in `backend/app/services/dashboard/xirr.py`: `portfolio_xirr_display(rate, cash_flows)` (the 365-day test at `(end - min(day ...)).days >= 365`), `PortfolioXirrDisplay(rate, basis, since_purchase_return)`, `DashboardXirrSummary` (fields `lifetime_xirr_basis`, `current_holdings_xirr_basis`, `lifetime_since_purchase`, `current_holdings_since_purchase`), `calculate_dashboard_xirr` building `lifetime` and `current` through `portfolio_xirr_display`. `XirrBasis` lives in `backend/app/services/dashboard/schemas.py`. Callers of `portfolio_xirr_display`: `calculate_dashboard_xirr` and `backend/app/services/analytics/benchmark.py` (per fund). Report any difference.

## The contract (fixed here; do not rename or reshape)
```python
# backend/app/services/dashboard/schemas.py, beside XirrBasis (the type only in this task)
XirrCaution = Literal["young", "single_transaction"]

# backend/app/services/dashboard/xirr.py
@dataclass(frozen=True)
class PortfolioXirrDisplay:
    rate: Decimal | None = None
    basis: XirrBasis | None = None                 # unchanged meaning; kept for the old link; no screen reads it any more
    since_purchase_return: Decimal | None = None   # now filled for EVERY basis when money was paid in
    caution: XirrCaution | None = None             # NEW

def portfolio_xirr_display(rate: Decimal | None, cash_flows: list[tuple[date, Decimal]]) -> PortfolioXirrDisplay: ...
# DashboardXirrSummary gains: lifetime_xirr_caution: XirrCaution | None = None ; current_holdings_xirr_caution: XirrCaution | None = None
```
**Rule.** Let `end = cash_flows[-1][0]` (the valuation date), `first = min` of the dates, `age = (end - first).days`, `paid` = sum of the negative amounts, `received` = sum of the positive amounts, `purchase_count` = the number of negative amounts in `cash_flows[:-1]` (the last entry is the final valuation, never a purchase).
- All flows on one day: **exactly as today** (the rate only if they do not net to zero; no basis, no since-purchase, no caution).
- `rate` is returned as given. `basis` **exactly as today**: `annualised` when `age >= 365` and the rate is not None; `since_purchase` when `age < 365` and money was paid in; otherwise as today.
- `since_purchase_return` = `(received / paid - 1)` normalised (`.normalize()`, then `format(..., "f")` as today so "0.2" not "0.20000"), **for every basis, whenever `paid > 0`**; otherwise None.
- `caution`, only when `rate is not None` **and** `paid > 0`: `"young"` if `age < 365`; else `"single_transaction"` if `purchase_count == 1`; else None. If both apply, `young` wins.
- "Purchase flow" is whatever negative amounts the caller's flow list already holds, so it follows the existing flow rules: a reinvested dividend is never in the list; a switch-in is a negative amount only in the Current-holdings flows and the per-fund flows (`extra_debit_types`), not in the lifetime flows; a gift received is a negative amount (money put in). **Two purchases on the same day are two flows** (so that fund or portfolio is "multiple": no single-transaction caution).
- `calculate_dashboard_xirr` fills the two new summary fields from its `lifetime` and `current` displays, **each view judged on its own flows**. The returned tile `since_purchase` fields are now filled for every basis.
- Add one comment on `portfolio_xirr_display`: why XIRR always leads and the caution is only a warning (owner decision, 24 Nov 2026); that `basis` is kept for the old link and no screen reads it.

## Tests first (written and run before the code; red for the stated reason)
**New file `backend/tests/services/dashboard/test_xirr_caution.py`** (pure function, no database; build flows with `date.today()` offsets):
`young_single_purchase_is_young` (e.g. `[(D-90,-1000),(D,+1200)]`: since "0.2", basis since_purchase, caution young); `exactly_365_days_one_purchase_is_single_transaction` (`[(D-365,-1000),(D,+1250)]`: basis annualised, since "0.25", caution single_transaction); `two_purchases_over_a_year_have_no_caution` (`[(D-365,-500),(D-200,-500),(D,+1300)]`: since "0.3", caution None); `two_purchases_on_the_same_day_are_two_flows` (`[(D-400,-500),(D-400,-500),(D,+1300)]`: caution None); `young_wins_over_single_transaction`; `net_zero_on_one_day_has_no_caution_and_no_since_purchase`; `no_money_paid_gives_no_since_purchase_and_no_caution`; `no_rate_gives_no_caution`; `a_loss_is_reported_as_a_negative_since_purchase_return` (`[(D-90,-1000),(D,+850)]`: "-0.15"); `the_rate_and_the_basis_are_unchanged_for_every_fixture` (loop `FIXTURES` from `tests/services/analytics/xirr_reference/fixtures.py`: rate equals `xirr(flows)` and basis follows the 365-day rule exactly as before).
**Service level, in the same new file or `test_xirr_short_period.py`, using the existing `_disclaimer_scenario(db, phone, start, units, nav, top_ups, current_value=..., units_held=..., typed_txns=[...])` helper:** `a_switch_in_counts_as_a_purchase_flow_in_the_current_holdings_view` (a purchase about 800 days ago and a `SWITCH_IN` about 500 days ago: lifetime caution `single_transaction`, current caution None); `a_reinvested_dividend_is_not_a_purchase_flow` (one purchase about 800 days ago plus a `DIVIDEND_REINVEST`: lifetime caution `single_transaction`); `lifetime_and_current_views_get_their_own_caution`.
**Existing tests that pin the old behaviour and must change (list each in the report):** in `backend/tests/services/analytics/xirr_reference/test_xirr_short_period.py` the helper `_assert_tile_display` and its callers (extend it to take the expected caution), `test_t8_9_fixtures_choose_basis_without_changing_the_rate` (the 366-day case: basis annualised, since-purchase now the formatted `received/paid - 1`, caution `single_transaction`; the three young cases keep their since-purchase values and get caution `young`), `test_exactly_365_days_is_annualised` (since-purchase now filled; caution `single_transaction`), `test_every_fund_over_a_year_is_unchanged` (rate and basis unchanged; `since_purchase_return` now filled on the parent and the child rows), and any assertion in `backend/tests/api/test_dashboard_aggregate_routes.py`, `test_dashboard_holdings_route.py`, `test_portfolio_routes.py` that expects `since_purchase` to be None for an annualised case (change only the expected value; the new `*_caution` response fields are the next task). `grep -rn "since_purchase" backend/tests` to find them. Do not weaken any assertion about the rate, the basis or the dash.

## Run these only
```
cd backend
"C:\Users\Dell\Desktop\MVP v1\MVP_V1_MF_only\backend\.venv\Scripts\python.exe" -m pytest tests/services/dashboard/test_xirr_caution.py tests/services/analytics/xirr_reference tests/services/dashboard/test_xirr.py -q -p no:cacheprovider
```
Baseline before any change (Claude, 24 Nov): `tests/services/analytics/xirr_reference` plus `tests/services/dashboard/test_xirr.py` = 111 passed, 3 xfailed; the three API route files = 35 passed. If an API test stalls in the sandbox, report BLOCKED with the exact error; Claude runs it.

## Files you may touch
`backend/app/services/dashboard/xirr.py`; `backend/app/services/dashboard/schemas.py` (**only** add the `XirrCaution` literal beside `XirrBasis`); the new test file; the existing test files named above (only the expectations named above).
**Do not touch:** `frontend/**`, migrations, any response schema or route (that is xr-be-2), `backend/app/services/analytics/benchmark.py` (it keeps working through the same function), `aggregate.py`, `holdings.py`, `portfolio_summary.py`, `backend/app/api/dashboard.py`.

## Constraints
Backend changes are additive only; **no migration**; no new dependency; `Decimal`, never `float`, strings out; invented data only; no network; git read-only; no deletion flags or recursive deletes. The old staging link shares this backend: no existing field changes meaning except that `since_purchase` values are now filled for annualised cases too (the owner's decision).

## Report format
One fenced block `CODEX REPORT: xr-be-1`: status (DONE, PARTIAL or BLOCKED); baseline HEAD; drift; which tests were red first and why; the existing tests you changed and what you changed in each; files and functions changed with a one-line reason each; commands with pass and fail counts; `git status --short`; Deviations; Open questions (including anything about switches, gifts or bonus units in the flow lists that the owner's "purchase flow" rule did not cover).

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-24-xr-be-1-handoff.md (your task: xr-be-1, owner-approved)
Open Docs/superpowers/plans/2026-11-24-xirr-vs-returns-plan.md (Task 2) for the context. Work only in C:\Users\Dell\lanes\unifolio-xr-be on branch batch/xr-be. Git is read-only. No deletion flags or recursive deletes. Write the failing tests first, run them, then change only the files the handoff lists. If the sandbox cannot run a test, reply BLOCKED with the exact error and still write the tests and the code.
Run tests with: cd backend; "C:\Users\Dell\Desktop\MVP v1\MVP_V1_MF_only\backend\.venv\Scripts\python.exe" -m pytest <files> -q -p no:cacheprovider
Reply with the CODEX REPORT block from the handoff, nothing else.
```
