# Handoff: ui-redesign QI-B (Portfolio Quick Insights backend: one read route, five insights)
**Status:** READY (written 27 Oct 2026, not yet run)
**Parent plan:** `Docs/superpowers/plans/2026-10-23-portfolio-home-page-implementation.md` **Task 7 backend part only** (the front end stays with Gemini, later). Design: `Docs/orchestration/2026-10-23-portfolio-home-page-design.md` section 2.4 (the five-insight table). Register: C119 deferred Quick Insights because "Portfolio has no holdings/SIP/AMC route and may not import the Dashboard"; this handoff adds that route. This handoff overrides the plan and the design where they differ (decisions Q1 to Q8 below, for the register as C150 onward; the owner may veto).
**Branch:** `feat/portfolio-insights`, created from `leapswitch-redesign` (the Home, Mutual Funds, Portfolio and News PRs are in it). **Worker:** Claude Code (Sonnet), one session in the WSL shell. **Orchestrator:** Claude Code in the main session, who verifies and merges docs; the worker never pushes.
**Worker rules specific to this repo (read first):** you are the *implementer*. `CLAUDE.md` tells sessions to invoke the task-observer and model-orchestration skills and to delegate to Codex: **ignore both here** (do not invoke, do not delegate, no subagents). Read `AGENTS.md` for setup and non-negotiables; follow the superpowers TDD and verification-before-completion skills.

## 1. Purpose and non-goals
One additive **GET** that returns the five Quick Insights of the Portfolio page for the selected scope as structured data, so the front end formats text and never computes. **Non-goals:** any front end; the sentence copy (the front end writes it); a SIP summary endpoint for other pages; changes to `/sips`, `/holdings`, Home or the existing Portfolio routes; a migration (**none is needed**: every input is already read by the Dashboard and Home from existing tables; say so in the report); background jobs; caching.

Same rules as Portfolio: `Decimal` never `float` (no `float()` or float literals in the new modules; a test greps for it); the route **never writes and never recomputes Analytics** (no `compute_*` of `app.services.analytics`, no snapshot rebuild, no `dispatch`, no INSERT/UPDATE/DELETE; a test asserts it); the figures agree with the other Portfolio routes to the paisa.

## 2. Setup and baseline (run; record the output; red means STOP)
```
cd /home/ayush/wt/docs && git log --oneline -1 leapswitch-redesign
git worktree add /home/ayush/wt/portfolio-insights -b feat/portfolio-insights leapswitch-redesign
cd /home/ayush/wt/portfolio-insights/backend
test -f app/api/portfolio.py && test -f app/api/home_news.py && test -f tests/fixtures/portfolio/summary_family.json && echo BASE-OK   # else STOP
PY="/mnt/d/Unifolio code/backend/.venv/bin/python"          # shared venv, Python 3.14, quote it (the path has a space)
"$PY" -m alembic heads                                       # record it; this work must not change it
"$PY" -m pytest -p tests.offline_http tests/api/test_portfolio_routes.py tests/services/dashboard/test_holdings.py tests/api/test_dashboard_sips_route.py -q -p no:cacheprovider --disable-warnings
```
Every later pytest command: `"$PY" -m pytest -p tests.offline_http <files> -q -p no:cacheprovider --disable-warnings`. Do not run the full suite; `tests/services/analytics/test_portfolio_disclosure_parsing.py` cannot be collected (`xlwt` missing): exclude it, install nothing.

## 3. What exists (read these first)
- `app/api/portfolio.py`: `_envelope(ctx, inputs, now_ist)`, `_members(ctx)`, `_load_inputs(db, ctx, today, lookback_days=15, view="fund")` and the six routes; the pattern to copy (`resolve_scope` gives 404 for a foreign member through `require_member`, body `{"detail":"Household member not found."}`). `get_now_ist` comes from `app.api.home`.
- `app/services/dashboard/portfolio_schemas.py`: `PortfolioDecimal` (plain string, never a signed zero), `zero_unsigned`, `Envelope`, `MemberOut`, `HomeModel` (`extra="forbid"`).
- `HomeInputs.holdings` (`HoldingRow`: `scheme_id`, `scheme_name`, `amc_name`, `plan_type` in `direct|regular|unclassified`, `units_held`, `current_value`, `nav_unavailable`, `stale_nav`, `price_from_statement`), loaded with `stored_only=True` and `allow_stale_today=True`. **Portfolio value convention (register C88):** the sum over valued rows of `quantize_amount(Decimal(row.current_value))`; a valued row is `not nav_unavailable and current_value is not None`.
- `app/services/dashboard/sip.py::compute_active_sips(db, member_ids, include_stopped=False) -> list[SipRow]` (the same list `/sips` returns; a row is a SIP series, `series_count` counts parallel twins of one amount in one month, `sip_amount` is the latest instalment as `"5000.00"`). **Read it fully first.** Caveat: `active` there is measured against the folio's latest confirmed statement end and falls back to `date.today()` (not the injected clock). Do not edit it; make test data deterministic (a confirmed import with a `statement_to_date`), and if you cannot, stop and report.
- Tests: `tests/api/home_fixture.py` (`build_home_fixture(variant=..., now=..., fund_count=...)`, `seed_home_household`, `uid`, `FIXED_NOW` Fri 2026-10-23 18:30 IST; variants include `base`, `empty`, `partial`, `redemption`, `all_down`) and `tests/api/test_portfolio_routes.py` (copy its client, auth, clock and SELECT-only listener helpers). It has no SIP rows today: seed `PURCHASE_SIP` transactions in your own test helper, not in the shared fixture file (do not edit `home_fixture.py`). Golden-file pattern: `scripts/write_portfolio_fixtures.py` and `tests/fixtures/portfolio/`.

## 4. Decisions fixed for this run (do not re-litigate; open questions only under section 11)
- **Q1, route:** `GET /household/aggregate/portfolio-insights` and `GET /household-members/{member_id}/portfolio-insights`, in a **new** file `app/api/portfolio_insights.py` (`router = APIRouter(tags=["portfolio"])`), importing `_envelope`, `_members`, `_load_inputs` from `app.api.portfolio` (no edit to that file) and registered by one `include_router` line in `app/main.py`. No query parameters. Auth `Depends(get_active_user)`, `get_db`, `get_now_ist`; thin handler; `response_model` set.
- **Q2, one pass:** inputs are loaded once with `_load_inputs(..., lookback_days=15, view="fund")` (stored prices only, same as the other routes), plus one `compute_active_sips(db, list(ctx.member_ids))`. All five insights come from those two sources. Statement counts must not grow with the number of funds.
- **Q3, which rows count:** valued rows with `Decimal(units_held) > 0`. A fund without a NAV is excluded from every value, share and count, is named in `missing_funds` and sets `partial` (the envelope does that already; do not recompute it). A frozen or statement-priced fund (`stale_nav`, `price_from_statement`) is valued at its stored price and counted like any other, exactly as `portfolio-summary` does; no extra flag in this response.
- **Q4, denominators:** `total` = the C88 total over the counted rows. Every percentage is `value / total * 100`, `Decimal`, quantized to 4 places `ROUND_HALF_UP`; every money value to `0.01` through `quantize_amount`. Strings via `PortfolioDecimal`. Percentages are **not** forced to sum to 100.0000.
- **Q5, grouping:** a fund is a `scheme_id`, summed across members and across rows of that scheme in aggregate scope (the same fund held by two members is one fund). An AMC is the exact `amc_name` string (blank or missing becomes `"Unknown AMC"`). Ties (equal value) break by name ascending, then `scheme_id` ascending, so the answer never flips between runs.
- **Q6, plan split:** by value over the counted rows: `direct`, `regular`, `unclassified` (a row whose `plan_type` is `unclassified`; shown as its own entry, never folded into another).
- **Q7, SIPs:** from `compute_active_sips(..., include_stopped=False)`. `active_count` = the sum of `series_count` over the rows (parallel twins are separate SIPs); `monthly_total` = the sum of `Decimal(sip_amount) * series_count`, quantized `0.01`. This deliberately differs from the plan's `sum(sip_amount)` (which under-counts twins); see Open question 1. SIPs of a household with no counted holdings are 0 and `"0.00"`.
- **Q8, empty states:** `empty` is true when there are no counted rows. `empty_reason` is `null`, `"no_holdings"` (no rows at all) or `"no_prices"` (holdings exist but none has a price). When `empty`, every insight except `sips` is `null` and `fund_count` is zero (see schema). Never return 500 or 404 for an empty scope.

## 5. Response schema (exact; Pydantic v2, `extra="forbid"`, in new file `app/services/dashboard/portfolio_insights_schemas.py`)
```python
class LargestHoldingOut(HomeModel):  scheme_id: str; fund_name: str; amc_name: str; value: PortfolioDecimal; pct_of_portfolio: PortfolioDecimal
class FundSpreadOut(HomeModel):      fund_count: int; amc_count: int
class PlanSplitEntryOut(HomeModel):  value: PortfolioDecimal; pct: PortfolioDecimal
class PlanSplitOut(HomeModel):       direct: PlanSplitEntryOut; regular: PlanSplitEntryOut; unclassified: PlanSplitEntryOut
class LargestAmcOut(HomeModel):      amc_name: str; value: PortfolioDecimal; pct_of_portfolio: PortfolioDecimal; fund_count: int
class SipInsightOut(HomeModel):      active_count: int; monthly_total: PortfolioDecimal
class InsightsOut(HomeModel):
    largest_holding: LargestHoldingOut | None
    spread: FundSpreadOut                      # {0, 0} when empty
    plan_split: PlanSplitOut | None
    largest_amc: LargestAmcOut | None
    sips: SipInsightOut                        # always present
class PortfolioInsightsResponse(Envelope):
    members: list[MemberOut] | None            # the household's members in created order in aggregate scope, null in member scope
    total_value: PortfolioDecimal              # the denominator (C88), "0.00" when empty
    empty: bool
    empty_reason: Literal["no_holdings", "no_prices"] | None
    insights: InsightsOut
```
Example (family, abbreviated): `"total_value":"8222736.44"`, `"largest_holding":{"scheme_id":"...","fund_name":"...","amc_name":"...","value":"1220931.30","pct_of_portfolio":"14.8478"}`, `"spread":{"fund_count":9,"amc_count":6}`, `"plan_split":{"direct":{"value":"...","pct":"62.1000"},"regular":{...},"unclassified":{"value":"0.00","pct":"0.0000"}}`, `"sips":{"active_count":3,"monthly_total":"17000.00"}`. Plan-split and AMC percentages are of the same `total_value`, so `direct.value + regular.value + unclassified.value == total_value` to the paisa (a test asserts it).

## 6. Tasks (test first, red first; **one commit per task** on `feat/portfolio-insights`, message `feat(portfolio): quick insights - <task>`; list which tests were RED)
1. **Models**: `portfolio_insights_schemas.py` as in section 5 (+ a model test: extra fields forbidden, decimals serialise as strings, no signed zero).
2. **Pure function** `app/services/dashboard/portfolio_insights.py::compute_portfolio_insights(holdings, sip_rows) -> <total_value, empty, empty_reason, insights>`. Hand-computed fixtures in `tests/services/dashboard/test_portfolio_insights.py`: build `HoldingRow` lists by hand and compute the expected strings by hand in the test comments (for example three funds 600000.00 / 300000.00 / 100000.00 give largest 60.0000, AMC split, plan split); cases: two members holding one scheme (summed, one fund), two AMCs equal in value (tie rule), a blank `amc_name`, an `unclassified` row, a no-NAV row (excluded, not counted), a stale and a statement-priced row (counted), `units_held` 0 (excluded), per-row rounding (`1.005` + `1.005` gives `2.02`, as in `test_portfolio_summary.py`), parallel SIPs (`series_count` 2 of 5000.00 gives count 2, total `10000.00`), empty list, all rows unpriced (`no_prices`). Property over seeded random inputs (`random.Random(seed)`, a few hundred cases): plan values sum to `total_value`; every pct is between 0 and 100; largest-holding value is the maximum of the per-scheme sums.
3. **Route** `app/api/portfolio_insights.py` + registration. `tests/api/test_portfolio_insights_routes.py`: (a) shape and values for aggregate and each member on the base household with seeded SIPs; (b) **parity**: `insights total_value == portfolio-summary total_value`, `largest_holding.value` appears in `GET /household/aggregate/holdings` after the same C88 sum, `sips.active_count` equals the sum of `series_count` over `GET .../sips` rows, on `base`, `partial`, `redemption`, `all_down`; (c) auth 401; foreign member 404 **with the same body** as `GET /household-members/{id}/portfolio-summary` for the same id, and 404 for a random unknown id; (d) empty household and a member with no data: 200, `empty: true`, `empty_reason: "no_holdings"`, `sips` zero, `members` lists every member with `has_data` false for the empty one in aggregate; (e) `partial` variant: the no-NAV fund is in `missing_funds`, `partial` true, excluded from `total_value` and from `fund_count`; (f) no writes and no recompute (SELECT-only listener; analytics `compute_*`, snapshot rebuild and `dispatch` patched to raise); statement count with 3 versus 9 funds is equal (measured after the shared holdings cache is warm, as in the Portfolio test); (g) OpenAPI: every money and percentage field is a string, `members` null in member scope; (h) a grep test: no `float` in the three new modules.
4. **Injected-bug check** (not a committed test; record in the report): temporarily introduce each of these in the pure function, see at least one named test go red, then revert: (i) percentage computed from the unrounded sum instead of the C88 total; (ii) direct and regular swapped; (iii) `sip_amount` summed without `series_count`; (iv) a no-NAV row counted in `fund_count`; (v) largest AMC chosen by fund count instead of value. If a bug stays green, add the missing test. Confirm with `git diff` that nothing is left in the tree.
5. **Golden fixtures** (the front end copies them): `backend/scripts/write_portfolio_insights_fixtures.py` writes into `backend/tests/fixtures/portfolio/`: `insights_family.json`, `insights_member.json`, `insights_empty.json`, `insights_partial.json`, `insights_no_sips.json`, `insights_no_prices.json`. The test **compares read-only** (never writes then compares: that can never fail) and a `test_portfolio_insights_fixture_semantics` opens each file and asserts what its name promises (family lists 2 members and all five insights non-null with `sips.active_count > 0`; member has `members: null`; empty has `empty` true, `empty_reason` `"no_holdings"` and every insight except `sips` null; partial has `partial` true and the fund named; no_prices has `empty_reason` `"no_prices"`; no_sips has `sips` `{0, "0.00"}` with the other four non-null; in every file the plan values sum to `total_value`). Deterministic: fixed clock, fixed uuids from `uid`.
6. **Synthetic check** (read-only; no new gate script): run the new route in a throwaway script of your own (not committed, in your scratchpad) against `/home/ayush/s25/s25.db` via the same override pattern as `scripts/portfolio_synthetic_gate.py`, for aggregate, `member_rohan` and `member_priya`; paste each `total_value`, `largest_holding`, `spread` and `sips`, and state whether `total_value` equals `portfolio-summary` (base was `8222736.44`). Record the sha256 of the source before and after (must match). A mismatch is reported with both numbers, not hidden.

## 7. Test commands (run only these)
New test files; then `tests/api/test_portfolio_routes.py tests/services/dashboard/test_portfolio_summary.py tests/services/dashboard/test_instrument_allocation.py tests/services/dashboard/test_value_series.py` (Portfolio baseline, must stay as it was at section 2); `tests/api/test_home_routes.py tests/services/home` (Home baseline); `tests/api/test_dashboard_sips_route.py tests/services/dashboard/test_holdings.py` (neighbours). Final: one combined fresh run of all of these and paste its last line.

## 8. File map
**Allowed (new):** `backend/app/api/portfolio_insights.py`; `backend/app/services/dashboard/{portfolio_insights_schemas,portfolio_insights}.py`; `backend/scripts/write_portfolio_insights_fixtures.py`; `backend/tests/api/test_portfolio_insights_routes.py`; `backend/tests/services/dashboard/test_portfolio_insights.py`; the six `backend/tests/fixtures/portfolio/insights_*.json`. **Allowed (edit):** `backend/app/main.py` (one import and one `include_router` line, nothing else); this handoff's Report block.
**Do not edit:** `app/api/portfolio.py`, `home.py`, `dashboard.py`; anything under `app/services/home/`, `app/services/analytics/`; `holdings.py`, `sip.py`, `xirr.py`, `schemas.py`, `aggregate.py`, `allocation.py`; `tests/api/home_fixture.py`; any migration or model; the decisions register. No new dependency. If something in a forbidden file must change, stop on that point and say why.

## 9. Constraints
Additive only. LF endings, UTF-8 (`git diff --check`). Comment density and naming like the surrounding code; comment the *why* of the tie rule, the twin-counting rule and the `unclassified` entry. Git: `add` and `commit` on `feat/portfolio-insights` only (one per task, end each message with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`); no push, no merge, no other branch, no stash/reset/rebase. No live network. **Staging:** nothing to do (no migration, no job, no setting); this deploys with the Portfolio backend and the front end may call it once merged.

## 10. Stop conditions
Stop and report (do not improvise) when: the baseline in section 2 is red or `alembic heads` is not what you recorded; `compute_active_sips` cannot be made deterministic in tests without editing a forbidden file; a parity check differs by even one paisa and the cause is not in your code; the plan, this handoff and the code disagree on a shape; a forbidden file would need a change.

## 11. Open questions (for the owner; the handoff uses the stated default)
1. **Twins in the SIP count/total (Q7):** default counts parallel twins separately and multiplies by `series_count`. The plan's `sum(sip_amount)` would show half for a household running two identical SIPs. Veto means: `active_count` = number of rows, `monthly_total` = `sum(sip_amount)`.
2. **"Funds" versus "AMCs" (design says "N AMCs and M funds"):** the response carries both; the front end picks the wording.
3. Anything the code shows that this handoff did not say goes under Findings; behaviour or interface questions go here. Do not guess.

## 12. Review Focus (for the gate)
C88 total and per-row rounding; parity with `portfolio-summary` and `/sips` to the paisa; no-NAV rows excluded everywhere; tie rules deterministic; `unclassified` never folded; empty reasons; 404 body identical to the other Portfolio routes; no `float`, no writes, flat statement counts; golden comparison read-only; injected-bug list actually exercised.

## 13. Report (the worker fills this in at the end, in one fenced block)
```
WORKER REPORT — ui-redesign — QI-B (Portfolio Quick Insights backend)
Run date/time:    Worker (tool and model):    Python:    Baseline HEAD:    alembic heads (before/after):
1. TASK STATUS (Tasks 1 to 6, one line each, with commit hash):
2. FILES (added and changed; confirm against git status):
3. TESTS (RED list per task; final combined command and its last line; Task 6 synthetic output in full with sha256 before/after):
4. INJECTED-BUG CHECK (each of i to v: test that went red, or the test you added):
5. DEVIATIONS (mechanics only):
6. FINDINGS:
7. OPEN QUESTIONS / BLOCKERS:
8. CONFIRMATIONS: no push/merge/other branch; full suite not run; edits only in allowed files; no float in new modules; source db unmodified.
```
