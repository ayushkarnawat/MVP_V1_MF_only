# Handoff: ui-redesign HB5b (finish the Home API: one rounding decision, the real fixture variants, the missing tests, the full gate)
**Status:** READY FOR CODEX (written 26 Oct 2026, not yet run)
**Parent:** `ui-redesign-HB5-home-routes-handoff.md` (read it first, in full: its contracts, decisions 1 to 8, Task 0 to 4 and Constraints still apply and this file only changes or completes what is listed here). Codex session **C1c**. Branch `feat/home-snapshot`, HEAD `b646ab1c` (HB5 part 1, 243 tests green, verified by the orchestrator: scope, the neighbours, hygiene). One working tree: do not switch branches.
**What part 1 left:** the twelve routes, models, composition, wealth series and the gate script exist and are good; **Task 3 was not finished** (the 24 fixture files exist but most variant files are placeholders: they hold the base household, not the variant their name says; the no-write, statement-count, parity and display-name tests are missing) and **Task 4 stopped at the first failed invariant** (a one-paisa mismatch). This run closes both. Decisions are logged as register C88 to C90; do not re-litigate them.

## Decision C88 (answers your open question): one definition of "portfolio value" for the whole Home API
**Portfolio value = the sum, over the valued holdings rows, of `quantize_amount(Decimal(row.current_value))` (0.01, ROUND_HALF_UP, each row rounded before the sum).** This is the convention `allocation.py` (HB3b), `worth.py` (HB4) and the movers (per fund) already use, and it is what a person gets adding up the rounded numbers on screen. You may **not** edit `allocation.py`; change the other side:
1. `api/home.py::_total_value` (summary `total_value`) uses this definition (today it sums the exact strings and rounds once).
2. In `wealth.py`, `end_value` is this same headline figure. The series' last point must equal it: when the last point's date is the `end` date (it always is when `end == nav_as_of` and the scope has valued funds), **replace that point's value with the headline figure**, and say so in a short comment (the exact sum of units times NAV can differ from the sum of rounded rows by a few paise; the chart does not show it, the headline must agree with the donut and the table). Earlier points keep the exact sum quantized once. `start_value` keeps the point's value.
3. The invariant chain is then `wealth.points[-1].value == wealth.end_value == summary.total_value == allocation.total_value` to the paisa. Update the gate's `value_chain` check and the route tests accordingly.
4. The Dashboard parity test (HB5 Task 3 item 4) compares `summary.total_value` with the sum of `quantize_amount(Decimal(current_value))` over the valued rows of `GET /household/aggregate/holdings` (and the member route), not with the exact sum; add a comment saying why.

## Decision C89: finish the wealth query bound
`wealth.py` loads every benchmark level from the beginning of history (`date <= end` only). Bound it below: `date >= start_effective - 10 days` (same lookback the stored-levels loader uses; `benchmark_return` still reports `clipped` correctly because the first available level is then later than the start). Add a test: levels exist before the window; the first returned point and `pct` are unchanged; a request whose start is more than 10 days before the first level still gives `clipped: true`.

## Task A: the real fixture variants and the semantics guard
Extend `tests/api/home_fixture.py` with **factories for the variants** (the same deterministic ids, NAVs and clock as the base unless stated), and make `write_home_fixtures.py` generate each file from the variant its name says. Replace the placeholders; **the following facts are asserted by a new `test_home_fixture_semantics` test that opens each committed JSON file** (so a placeholder can never come back):
| File | Variant | Facts the test asserts |
|---|---|---|
| `summary_family.json` | base, aggregate | `scope` aggregate, `members` has 2 entries, `members_connected` 2 of 2, `data_line` set, `has_holdings` true, `total_value` `5212.00`, `change_amount` `12.00` |
| `summary_member.json` | base, member Dev | `scope` member, `data_line` null, `scope_label` ends with `'s portfolio` |
| `summary_empty.json` | household with members and **no holdings** | `has_holdings` false, `total_value` `0.00`, `change_amount` `0.00`, `direction` flat, `nav_as_of` null, `members_connected` 0 |
| `summary_partial.json` | one fund has **no NAV at all** | `partial` true, exactly that fund in `missing_funds`, `total_value` excludes it |
| `summary_weekend.json` | clock Mon 2026-10-26 10:00 IST | `greeting` morning, `nav_as_of` 2026-10-23, `since_label` as `build_summary` gives |
| `wealth_1d_family.json` | base, `period=1D` | `change_method` price_only, `change_amount` `12.00`, two points (22 and 23 Oct), `benchmark` null |
| `wealth_1m_family_benchmark.json` | base, `period=1M&benchmark=nifty_50` | `benchmark.available` true, `benchmark.points` same dates as `points` from `effective_start`, `clipped` false |
| `wealth_1y_member_clipped.json` | member, `period=1Y&benchmark=nifty_smallcap_250` (levels start 2026-09-01) | `clipped` true, `effective_start` `2026-09-01`, `points` start at the first transaction date (series starts inside the period) |
| `wealth_custom_empty_range.json` | `period=custom` wholly before the first transaction | `empty` true, `points` `[]`, `start_value` `0.00`, `end_value` `0.00` |
| `wealth_partial.json` | the no-NAV variant, `period=1M` | `partial` true, the fund named in `missing_funds` |
| `allocation_family.json` | base + stored `asset_allocation` section | `source` analytics, `approximate` false, `members` 2 entries whose values sum to `total_value`, 4 live and 4 coming-soon classes |
| `allocation_member.json` | same, member scope | `members` null |
| `allocation_fallback.json` | **no stored section** | `source` dashboard_buckets, `approximate` true |
| `allocation_empty.json` | no holdings | `total_value` `0.00`, live classes with zero values, coming-soon classes with `null` value and percentage |
| `movers_sector.json` | base + disclosures giving coverage of at least 50 percent, `by=sector` | `view` sector, `estimated` true, `fell_back` false, `coverage_pct` at least `50.00` |
| `movers_category_fallback.json` | no disclosures, `by=sector` | `requested_view` sector, `view` category, `fell_back` true |
| `movers_fund.json` | base, `by=fund` | 2 gains, 1 loss, `others_count` 1, bar funds carry their own `change` |
| `movers_all_down.json` | every fund's latest NAV below the previous | `gains` `[]`, `losses` non-empty, `net_change` negative |
| `movers_empty.json` | no holdings | `gains` and `losses` `[]`, `others_count` 0, `net_change` `0.00` |
| `worth_three_cards.json` | stored sections that fire a weak fund, an underperformer and a concentration card (the HB4 hand fixture's numbers) | `state` cards, three cards in the order of HB4 rule 7 |
| `worth_none.json` | stored sections present, nothing over any threshold | `state` nothing_flagged, `cards` `[]`, `unavailable` `[]` |
| `worth_unavailable.json` | no stored sections | `state` unavailable, `unavailable` lists all three |
| **new** `worth_concentration_with_earlier.json` | as three cards plus WRITTEN disclosure batches about three months earlier for every held fund | the concentration card's `evidence.earlier_top5_pct` and `earlier_as_of` are set |
| `benchmarks_family.json` | stored `cap_allocation` giving Large 60 / Mid 25 / Small 15 | exactly the five options in order, one `recommended`, `reason` large_and_mid |
| `benchmarks_no_mix.json` | no stored cap section | `reason` unavailable, `recommended_index` nifty_500 |
All 25 files are compared with live route output (HB5 Task 3 item 2) and regenerated only by `write_home_fixtures.py`. The writer must not import from `tests/` at runtime if that can be avoided: put the factories where both can import them without a test-only path (`tests/api/home_fixture.py` is fine if the writer adds `backend` to `sys.path` itself; say which you did). Hand-check, and list in the report, the arithmetic of: `wealth_1m_family_benchmark` (benchmark percent at the last point), `allocation_family` (member shares), `movers_sector` (one sector's total) and `worth_three_cards` (each card's numbers).

## Task B: the missing tests of HB5 Task 3 (items 3 to 10, as written there, with C88 applied)
Write each test red first and list which were RED: (3) the reconciliation invariants on **every** variant of the table above; (4) Dashboard parity (C88.4); (5) no writes and no recompute on all twelve routes (statement listener sees SELECT only; every analytics `compute_*`, the snapshot rebuild and `dispatch` patched to raise); (6) statement counts independent of fund count (3 versus 9 funds) on all twelve routes; (7) query validation (custom without dates, `from > to`, a benchmark outside the five, a range reaching beyond today clamped); (8) the display-name rule, greeting boundaries 11:59, 12:00, 16:59, 17:00 IST and the weekend case; (9) one-point series, first transaction inside the period (the purchase not counted as gain, hand-computed), a redemption inside the period, a fund without a NAV; (10) the OpenAPI money-fields-are-strings walk. Items already covered by part 1 tests (auth/404, schema) are not repeated.

## Task C: the full gate (HB5 Task 4), completed
`home_synthetic_gate.py` must **run every scenario even after a failure** (collect results, print `PASS`/`FAIL` per check with both numbers, print a final table, exit non-zero if any check failed), keep working on a copy of the source file, and keep the sha256 before and after. The checks per scenario: identity (summary `change_amount` == movers `net_change` == wealth 1D `change_amount`), mover sum (gains + losses + others == net), value chain (C88.3), holdings parity (C88.4 definition), allocation family bar sums to the total (aggregate), worth state, plus `partial`/`missing_funds` agree across summary, wealth, movers. Scenarios and the SQL that creates them are exactly those of HB5 Task 4. Run it on `/home/ayush/s25/s25.db` and paste the full output. If a **different** invariant fails on real data, do not change code to hide it: report it with both numbers under Open questions (this is the point of the gate).

## Test commands (run only these; no full suite)
The HB5 commands, with these additions at the end: `tests/api/test_home_routes.py tests/services/home` (all of it), the neighbours listed in HB5 (including the five `tests/api/test_dashboard_*` files the orchestrator found: `git grep -l "household/aggregate" -- tests/api`), and the gate. `tests/services/analytics/test_portfolio_disclosure_parsing.py` is excluded as before. Baseline: **243 tests** in the first command; neighbours 88 + 41 passing.

## Constraints (unchanged from HB5, plus)
Allowed files: those of HB5, **plus** `backend/tests/fixtures/home/worth_concentration_with_earlier.json` and the two reports. Still forbidden: `allocation.py`, `movers.py`, `series.py`, `summary.py`, `units.py`, `worth.py`, `benchmarks.py`, `stored.py`, every analytics module, `holdings.py`. If one of them needs a change, stop on that point and report. Git read-only; LF endings; Decimal never float.

## Review Focus (for the gate)
C88 applied everywhere and only there (the last wealth point, the headline, the parity test); every fixture says what its name says (the semantics test is the guard); the benchmark lower bound; the gate continuing after a failure and the source hash unchanged; no writes on any route; statement counts flat in the number of funds.

## Report (Codex fills this in at the end, in one fenced block)
```
CODEX REPORT — ui-redesign — HB5b
Run date/time:    Environment:    Python: 3.14    Baseline HEAD: b646ab1c
1. TASK STATUS (C88, C89, Task A, B, C):
2. FILES (added and changed):
3. TESTS (RED list, GREEN task runs, final fresh commands and last lines; the gate output in full):
4. DEVIATIONS (mechanics only):
5. FINDINGS (hand-checked fixtures with the arithmetic; anything the real data showed):
6. OPEN QUESTIONS / BLOCKERS:
7. SELF-REVIEW FINDINGS:
8. CONFIRMATIONS: No git write commands: ___  Full suites not run: ___  Edits only in the allowed files: ___  ~/s25/s25.db unmodified (sha256 before and after): ___
```
