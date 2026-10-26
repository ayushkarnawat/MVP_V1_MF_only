# Handoff: ui-redesign HB4 (Home "Worth a look" cards, benchmark list and recommendation, a shared stored-section reader)
**Status:** DONE and verified by the orchestrator (26 Oct 2026); see the Orchestrator record at the end
**Parent plan:** `Docs/superpowers/plans/2026-10-23-home-backend-plan.md` Tasks **T9 (`worth.py`)** and **T10 (benchmark list and recommendation)**. Spec: `Docs/orchestration/2026-10-23-home-functionality-backend-spec.md` section 7 (Worth a look) and the benchmark lines of sections 4 and 11. Run catalogue: `2026-10-24-ui-redesign-orchestrator-handoff.md`, run **HB4**; the routes and the synthetic gate are HB5 (the next run, not this one). Codex session order and why: `2026-10-26-execution-plan-v2.md` section 3 (this is session C1, part one).
**Branch:** `feat/home-snapshot` (HB1 to HB3b are on it; **it now also contains `feat/mf-backend`**, which supplies `BenchmarkIndex.NIFTY_SMALLCAP_250` and `ALL_BENCHMARK_INDICES`; migration head is `0045`; the baseline was 275 tests green across the Home, holdings, benchmark and window files before this run). **Orchestrator:** Claude Code · **Worker:** Codex (manual relay). One working tree, one run at a time: do not switch branches. The shapes below are decided by the orchestrator and are exact; where the plan or spec is looser, this document wins. Decisions are logged in `ui-redesign-decisions-register.md` (entries C59 onward); do not re-litigate them, put doubts under Open questions.

Everything is `Decimal` (never `float`) and every function below that says "pure" never reads the clock or the database. **Home never recomputes Analytics**: every number in this run comes from a **stored Analytics section** or from a reference table, never from a `compute_*` function of the analytics package.

## Facts about the stored sections (verified by the orchestrator in the code; do not re-derive)
- Table `analytics_sections` (`app/models/analytics.py`), primary key `(user_id, scope_key, section)`, `scope_key` is `"combined"` or `str(household_member_id)`; `payload` JSON; `computed_at` (naive on SQLite: treat as UTC); `failed_at`. HB3b already reads one of them (`app/services/home/allocation.py`): read its `load_allocation` and `parse_stored_allocation` first; this run **extracts the freshness rule into a shared reader** (Task 0) and reuses it.
- **Payload shapes differ by scope:** `combined` is the *wrapped* `Aggregate...Response.model_dump(mode="json")` and a member scope is the bare summary. The wrapper keys: section `score` wraps under `"score"` (summary `PortfolioScoreSummary`: `funds: list[FundScoreRow]` with `scheme_id`, `risk_adjusted_tier` 1 to 5 or null, `final_score`), section `category_ranking` under `"ranking"` (`CategoryRankingSummary`: `funds: list[CategoryRankRow]` with `scheme_id`, `periods: {"1y","3y","5y"} -> {fund_return, category_avg, peers}` as strings), section `stock_holdings` under `"stock_holdings"` (`StockHoldingsSummary`: `rows: list[StockHoldingRow]` already sorted largest first, equity only, each with `isin`, `instrument_name`, `exposure_pct` (percent of **total portfolio value**), `exposure_value`; plus `holdings_as_of`, `hide_headlines`, `coverage.covered_value_pct`), section `cap_allocation` under `"cap_allocation"` (`CapAllocationSummary`: `buckets: list[{key: "LARGE"|"MID"|"SMALL"|"OTHER", value, percentage_total, percentage_equity, ...}]`, `hide_headlines`), section `asset_allocation` under `"asset_allocation"` (already handled by HB3b). `Decimal` values are JSON **strings**. All of these are in `app/services/analytics/schemas.py` and are written by `app/services/analytics/recompute.py` (`_SECTIONS`).
- **Tier meaning (the plan's check V2, settled):** `risk_adjusted_tier` is made from the fund's composite percentile within its category (`scorer.py::_tier_from_percentile`): `>= 80` is 5, `>= 60` is 4, `>= 40` is 3, `>= 20` is 2, below 20 is **1 (the weakest fifth)**. "Weak fund" therefore means tier 1.
- Return units: `scheme_return`, `fund_return` and `category_avg` in `category_ranking` are **decimal fractions** as strings (the same convention as XIRR: `0.12` is 12 percent). Confirm this from `tests/services/analytics/test_category_ranking.py` before you rely on it and say so under Findings; if it is a percent instead, stop and report.
- TER is stored in `scheme_ter` (`scheme_id`, `reference_period`, `ter_value`, nullable meaning "checked, none found") as a percent number (for example `1.25` is 1.25 percent); `Scheme.plan_type` (`SchemePlanType`, nullable) and `Scheme.sebi_category` (non-nullable string) are on the scheme row.

## Task 0: `app/services/home/stored.py`, the shared freshness reader (refactor first, behaviour unchanged)
```python
SECTION_WRAPPER_KEYS: Mapping[str, str] = {"asset_allocation": "asset_allocation", "score": "score",
    "category_ranking": "ranking", "stock_holdings": "stock_holdings", "cap_allocation": "cap_allocation"}

@dataclass(frozen=True)
class StoredSection:
    section: str
    payload: Mapping[str, Any]      # the summary body, already unwrapped
    computed_at: datetime           # timezone-aware (naive treated as UTC)

def unwrap_section(section: str, payload: Mapping[str, Any]) -> Mapping[str, Any] | None: ...
def scope_key_for(scope: Literal["aggregate", "member"], household_member_ids: Sequence[uuid.UUID]) -> str: ...
def load_fresh_sections(db: Session, user_id: uuid.UUID, *, scope_key: str, sections: Sequence[str],
                        household_member_ids: Sequence[uuid.UUID]) -> dict[str, StoredSection]: ...
```
- `unwrap_section`: when the wrapper key for that section is present in `payload` use `payload[wrapper_key]`, otherwise treat `payload` as the bare body; return `None` if the result is not a mapping. Unknown section names raise `ValueError`.
- `scope_key_for`: `"combined"` for `"aggregate"`, `str(household_member_ids[0])` for `"member"`.
- `load_fresh_sections`: **one** query for the requested rows (`section IN (...)`, the given user and scope key), **one** query for `latest = max(coalesce(Import.confirmed_at, Import.uploaded_at))` over confirmed imports of the given members (skipped when no rows came back); a section is returned only when its row exists, `failed_at is None`, the payload unwraps, and its `computed_at >= latest` (timezone-aware comparison, `latest is None` counts as fresh). Missing or unusable sections are simply absent from the result. **Exactly the rule `load_allocation` applies today** (copy its comparison semantics, including the naive-datetime handling).
- Refactor `load_allocation` in `home/allocation.py` to call `load_fresh_sections(..., sections=["asset_allocation"])` instead of its inline query code. `parse_stored_allocation` keeps its own unwrapping (its tests stay green untouched). **No existing test in `test_allocation.py` may change; the statement counts it asserts (2 with a usable section, 3 on the fallback, 0 with no holdings) must still hold.**
Tests first in `backend/tests/services/home/test_stored.py`: `unwrap_section` for the wrapped and bare shape of every section name (build the payloads from the real pydantic models with `model_dump(mode="json")`, as `test_allocation.py` does), unknown name raises, non-mapping body gives None; `scope_key_for`; the loader: row present and fresh is returned unwrapped; absent; `failed_at` set; older than the latest confirmed import; equal timestamp is fresh; a pending import newer than the section does not count; another member's later import does not count for a member scope; naive `computed_at` accepted; two sections requested in one call cost **2 statements in total** and no rows costs **1**; written with the real writer `recompute._upsert_section`.

## Task 1: T9 `app/services/home/worth.py` and `worth_config.py`
`worth_config.py` holds the thresholds in one place (the plan: "thresholds live in one config module"):
```python
@dataclass(frozen=True)
class WorthThresholds:
    max_cards: int = 3
    weak_tier: int = 1
    weak_min_share_pct: Decimal = Decimal("2")
    underperform_gap_pp: Decimal = Decimal("3")        # category average minus fund, in percentage points, at or above
    underperform_min_share_pct: Decimal = Decimal("3")
    expense_gap_pp: Decimal = Decimal("0.5")            # fund TER minus category average TER, strictly more than
    expense_min_share_pct: Decimal = Decimal("3")
    concentration_top5_pct: Decimal = Decimal("20")     # percent of total portfolio value held in the top five stocks, at or above
    concentration_min_coverage_pct: Decimal = Decimal("50")
DEFAULT_THRESHOLDS = WorthThresholds()
```
(These are the orchestrator's starting values; the plan says they are calibrated on the synthetic set and shown to the owner before locking. **You do not calibrate.** The orchestrator runs the real numbers afterwards and edits only this file.)

`worth.py`, types (exact):
```python
@dataclass(frozen=True)
class FundFacts:
    scheme_id: uuid.UUID; name: str; category: str | None; plan_type: str | None
    value: Decimal                       # current value in rupees, 0.01-quantized, summed over every member and folio
    tier: int | None; final_score: Decimal | None
    return_1y: Decimal | None; category_avg_1y: Decimal | None      # decimal fractions
    ter: Decimal | None; category_avg_ter: Decimal | None            # percent numbers

@dataclass(frozen=True)
class StockExposure:
    name: str; isin: str | None; exposure_pct: Decimal               # percent of total portfolio value

@dataclass(frozen=True)
class ConcentrationFacts:
    top_stocks: tuple[StockExposure, ...]      # largest first, at most five
    top5_pct: Decimal                          # sum of their exposure_pct
    holdings_as_of: date | None
    coverage_pct: Decimal | None               # share of portfolio value that has a disclosure
    hide_headlines: bool
    earlier_top5_pct: Decimal | None           # the same five stocks in the disclosure about three months earlier; None when not available
    earlier_as_of: date | None

@dataclass(frozen=True)
class Card:
    kind: Literal["weak_fund", "underperforming", "high_expense", "concentration"]
    rank: int                                  # 1-based position in the returned tuple
    scheme_id: uuid.UUID | None; scheme_name: str | None
    evidence: Mapping[str, Any]                # JSON-safe: strings, ints, None, lists and dicts of those

def build_worth_cards(funds: Sequence[FundFacts], concentration: ConcentrationFacts | None,
                      thresholds: WorthThresholds = DEFAULT_THRESHOLDS) -> tuple[Card, ...]: ...
```
Rules (every one needs a test; boundaries are tested on both sides):
1. `total = sum(f.value)`; `share_pct(f) = value / total * 100` quantized to 0.01 ROUND_HALF_UP; `total <= 0` returns `()`.
2. **weak_fund:** `tier == weak_tier` and `share_pct >= weak_min_share_pct`. Evidence `{"tier": int, "final_score": str|None, "share_pct": str, "category": str|None}`.
3. **underperforming:** both `return_1y` and `category_avg_1y` are not None, `gap_pp = (category_avg_1y - return_1y) * 100` quantized to 0.01, `gap_pp >= underperform_gap_pp` and `share_pct >= underperform_min_share_pct`. Evidence `{"fund_1y_pct": str, "category_avg_1y_pct": str, "gap_pp": str, "share_pct": str, "category": str|None}` (the two returns shown as percent: the fraction times 100, 0.01-quantized).
4. **high_expense:** both TERs not None, `gap_pp = ter - category_avg_ter` quantized to 0.01, `gap_pp > expense_gap_pp` (**strictly more**) and `share_pct >= expense_min_share_pct`. Evidence `{"ter": str, "category_avg_ter": str, "gap_pp": str, "plan_type": str|None, "share_pct": str}` (TERs 0.01-quantized).
5. **concentration (a portfolio card, `scheme_id` None):** `concentration` is not None, not `hide_headlines`, `coverage_pct` is not None and `>= concentration_min_coverage_pct`, and `top5_pct >= concentration_top5_pct`. Evidence `{"top5_pct": str, "stocks": [{"name", "isin", "exposure_pct"}], "holdings_as_of": iso|None, "earlier_top5_pct": str|None, "earlier_as_of": iso|None, "approximate": True}` (all percents 0.01-quantized strings).
6. **One card per fund:** a fund that meets several fund signals keeps only the highest-priority one (weak_fund over underperforming over high_expense).
7. **Order, most severe first:** by kind priority `weak_fund` (1), `underperforming` (2), `concentration` (3), `high_expense` (4); inside a kind: weak by `share_pct` descending then `final_score` ascending then name; underperforming and high_expense by `gap_pp` descending then `share_pct` descending then name; the result is cut to `max_cards`. `rank` is the 1-based position after the cut.
8. Nothing flagged returns `()` (the page then shows the plain text "Nothing needs attention").
**Hand fixture (I computed every value; use exactly this):** funds, all with `plan_type="direct"`: F1 "Alpha Equity" value `50000.00`, tier 1, final_score `22.00`, return_1y `0.08`, category_avg_1y `0.15`, ter `1.20`, category_avg_ter `0.90`; F2 "Beta Flexi" `30000.00`, tier 3, `0.10`, `0.12`, ter `1.70`, category_avg_ter `1.00`; F3 "Gamma Small" `15000.00`, tier 4, `0.05`, `0.12`, ter `0.80`, category_avg_ter `0.85`; F4 "Delta Debt" `5000.00`, tier 2, return_1y None, category_avg_1y None, ter None, category_avg_ter None. Concentration: five stocks summing `top5_pct = 24.00`, `coverage_pct = 80`, `hide_headlines` False, earlier values None. Shares 50.00, 30.00, 15.00, 5.00. Expected: F1 meets weak and underperforming (gap 7.00) and high expense (gap 0.30, no) so it keeps **weak_fund**; F2 underperforming gap `2.00` (below 3, no), high expense gap `0.70` yes; F3 underperforming gap `7.00` yes, expense no; F4 none. Candidates in order: weak_fund F1, underperforming F3, concentration, high_expense F2; with `max_cards=3` the result is **[weak_fund F1 (rank 1), underperforming F3 (rank 2), concentration (rank 3)]**; with `max_cards=4` F2's high_expense card is rank 4. Evidence for F3: `{"fund_1y_pct": "5.00", "category_avg_1y_pct": "12.00", "gap_pp": "7.00", "share_pct": "15.00", "category": ...}`.
Boundary tests: tier 1 versus 2; share `1.99` versus `2.00` (weak) and `2.99` versus `3.00` (underperforming and expense); gap exactly `3.00` is a card and `2.99` is not; expense gap exactly `0.50` is **not** a card and `0.51` is; concentration `19.99` versus `20.00`; coverage `49.99` versus `50.00`; `hide_headlines` True gives no concentration card; `total == 0` gives `()`; one fund meeting all three signals gives one card; ties break as stated; a seeded random property test (`random.Random(seed)`, a few hundred cases): never more than `max_cards` cards, ranks are 1..n, no scheme appears twice, output order is stable under shuffling the input funds.

### The loader `load_worth_facts` (reads only; no recompute)
```python
@dataclass(frozen=True)
class WorthFacts:
    funds: tuple[FundFacts, ...]
    concentration: ConcentrationFacts | None
    unavailable: tuple[str, ...]        # stored sections that were missing or stale: any of "score", "category_ranking", "stock_holdings"

def load_worth_facts(db: Session, user_id: uuid.UUID, *, scope: Literal["aggregate", "member"],
                     household_member_ids: Sequence[uuid.UUID], holdings: Sequence[HoldingRow]) -> WorthFacts: ...
```
(It is synchronous: it awaits nothing; the route passes in the holdings rows it already fetched with `compute_holdings(..., allow_stale_today=True)`.)
- Values: the valued rows of `holdings` (`nav_unavailable` False, `current_value` not None), each `quantize_amount(Decimal(row.current_value))`, summed per `scheme_id` across members; `name`, `category` (`HoldingRow.sebi_category`, which MB2 added, `None` when empty), `plan_type` from the row's `plan_type` value (the row's `PlanType` enum value as a string; if a scheme appears with two plan types keep the plan type of the row with the larger value).
- Stored sections (**one** call): `load_fresh_sections(..., sections=["score", "category_ranking", "stock_holdings"])`. A section that is not returned is listed in `unavailable` and its signals are skipped (the funds then simply carry `None` for those facts).
- `tier` and `final_score` per scheme from the `score` section's `funds` (match on `scheme_id` string; `risk_adjusted_tier` int or None; `final_score` Decimal or None). `return_1y` and `category_avg_1y` from the `category_ranking` section: `funds[].periods["1y"]` `fund_return` and `category_avg`.
- **TER facts (reference tables, two statements):** (a) each held scheme's latest non-null `scheme_ter.ter_value` (the row with the newest `reference_period` whose `ter_value` is not null); (b) the **unweighted mean** `ter_value` of the latest non-null TER over every scheme that has the same `sebi_category` and `plan_type` as the held fund (one grouped statement for all `(sebi_category, plan_type)` pairs of the held funds; the held fund itself is included in its own category's mean). A scheme with no plan type or no category gets `category_avg_ter` None. Quantization: leave the stored scale.
- **Concentration:** from the `stock_holdings` section: `top_stocks` = the first five `rows` (already largest first; keep their order; `name = instrument_name`), `top5_pct` = the sum of their `exposure_pct`, `holdings_as_of`, `hide_headlines`, `coverage_pct = Decimal(coverage["covered_value_pct"])`. No rows gives `concentration=None`.
- **Earlier month (the "three months ago" bar, owner decision H6):** `load_earlier_top5(db, *, scheme_values, total_value, isins, current_as_of)` returns `(earlier_top5_pct, earlier_as_of)` or `(None, None)`: `cutoff` = `current_as_of` minus three calendar months (day clamped to the month end); for **every held scheme that has at least one WRITTEN disclosure batch** take its newest `WRITTEN` `DisclosureBatch` with `as_of_date <= cutoff` and `as_of_date > cutoff - 45 days`; **if any such scheme has none, return `(None, None)`** (an undercount would be worse than no bar); otherwise `earlier_top5_pct = sum over schemes of scheme_value * (sum of pct_to_nav of that batch's rows whose isin is in isins) / 100`, divided by `total_value` times 100, 0.01-quantized; `earlier_as_of` = the oldest batch date used. Schemes with no WRITTEN batch at all are ignored. One statement for the batches and one for the rows regardless of the number of schemes. With the current 3-month retention this will return `(None, None)` for months; it must still be correct and tested on synthetic batches.
- Statement budget (counted with a SQLAlchemy `before_cursor_execute` listener): stored sections 2 (or 1 when nothing is stored) + TER latest 1 + category means 1 + earlier month 2 at most. No holdings gives `WorthFacts((), None, <all three>)` with **0** statements.
Tests first: hand fixture through the real writer (`_upsert_section` with payloads built from the real pydantic models for `score`, `category_ranking`, `stock_holdings`, combined and member shapes), TER rows including a null `ter_value` newest row (the older non-null is used), a mean over three schemes of one category and plan type, a scheme without a plan type; each stored section missing in turn (listed in `unavailable`, other signals still work); stale and failed sections; the earlier-month cases (all schemes covered, one scheme missing the batch gives None, a batch older than 45 days before the cutoff gives None, a young fund with no batch before the cutoff gives None, a scheme with no WRITTEN batch at all is ignored, the month-end clamp 31 May to 28 Feb); the statement counts; and an end-to-end test: loader output through `build_worth_cards` equals the hand-fixture cards. **Never call any `compute_*` function from `app.services.analytics`** (patch them to raise in the loader tests).

## Task 2: T10 `app/services/home/benchmarks.py`
```python
@dataclass(frozen=True)
class BenchmarkOption: index: BenchmarkIndex; label: str
HOME_BENCHMARKS: tuple[BenchmarkOption, ...]   # NIFTY_50 "Nifty 50", NIFTY_500 "Nifty 500", NIFTY_LARGEMIDCAP_250 "Nifty LargeMidcap 250", NIFTY_MIDCAP_150 "Nifty Midcap 150", NIFTY_SMALLCAP_250 "Nifty Smallcap 250", in this order

@dataclass(frozen=True)
class Recommendation: index: BenchmarkIndex; reason: Literal["large_cap_heavy","large_and_mid","mid_heavy","small_heavy","broad_mixed","unavailable"]

def recommend_benchmark(cap_mix: Mapping[str, Decimal] | None) -> Recommendation: ...
def load_cap_mix(db, user_id, *, scope, household_member_ids) -> dict[str, Decimal] | None: ...
```
`cap_mix` maps `"LARGE"`, `"MID"`, `"SMALL"` to the percentage of **equity** (the stored `percentage_equity`). `recommend_benchmark` (thresholds are module constants, orchestrator's starting values): `None` or `total = LARGE + MID + SMALL <= 0` gives `NIFTY_500` with reason `"unavailable"`; shares `l, m, s` are each bucket divided by `total` times 100; first match wins: (1) `s >= 35` is `NIFTY_SMALLCAP_250` `small_heavy`; (2) `m >= 50` is `NIFTY_MIDCAP_150` `mid_heavy`; (3) `l >= 65` is `NIFTY_50` `large_cap_heavy`; (4) `l + m >= 85` and `l >= 20` and `m >= 20` is `NIFTY_LARGEMIDCAP_250` `large_and_mid`; (5) otherwise `NIFTY_500` `broad_mixed`. Tests: one per rule on both sides of its threshold (34.99 vs 35, 49.99 vs 50, 64.99 vs 65, 84.99 vs 85 and 19.99 vs 20), the examples (Large 60 Mid 20 Small 15 gives broad_mixed; Large 80 gives Nifty 50; Large 55 Mid 40 Small 5 gives LargeMidcap; Mid 70 gives Midcap; Small 40 gives Smallcap; 50/25/25 gives broad_mixed), `None`, zeros, a cap mix that does not add to 100 is renormalised, and `HOME_BENCHMARKS` is exactly the five in order and each member exists in `BenchmarkIndex`.
`load_cap_mix`: from the stored `cap_allocation` section through `load_fresh_sections`; `buckets` entries with `key` in LARGE, MID, SMALL give `Decimal(percentage_equity)`; a missing section, `hide_headlines` true, or a bucket missing gives `None`. Statement count 2 (1 when nothing is stored). Tests with the real writer and the real pydantic models (`CapAllocationSummary`), combined and member shapes.

## Test commands (run only these; no full suite)
Use the WSL venv (Python 3.14); `.venv-win` is incomplete on this laptop. From PowerShell:
```
wsl.exe -d Ubuntu --cd "D:\Unifolio code\backend" -- .venv/bin/python -m pytest tests/services/home -q -p no:cacheprovider --disable-warnings
```
and, the same way, the neighbours: `tests/services/analytics/test_recompute.py`, `tests/services/analytics/test_category_ranking.py`, every file `git grep -l "analytics_sections\|_upsert_section" -- tests` finds that is not in `tests/services/home`, and `tests/services/dashboard/test_holdings.py`. `tests/services/analytics/test_portfolio_disclosure_parsing.py` cannot be collected locally (`xlwt` is not in the WSL venv): exclude it and say so; do not install anything. In WSL itself: `cd backend` then `.venv/bin/python -m pytest <files> -q -p no:cacheprovider --disable-warnings`. Report every command and its last lines. If a run stalls or the sandbox blocks it, report BLOCKED with the exact error; do not edit configs.

## Constraints
`Decimal` never `float` (no `float()` and no float literals in the new modules). TDD: see each new test fail for the right reason first and say which were RED. Additive, except the Task 0 refactor of `load_allocation`. **Allowed files:** `backend/app/services/home/stored.py`, `worth_config.py`, `worth.py`, `benchmarks.py` (new), `backend/app/services/home/allocation.py` (only the Task 0 refactor), `backend/tests/services/home/test_stored.py`, `test_worth.py`, `test_benchmarks.py` (new), `test_allocation.py` (**only if an import path must change; no assertion may change**), and this handoff's Report block. **Do not edit** `holdings.py`, any analytics module, `recompute.py`, any route, `movers.py`, `summary.py`, `series.py`, `units.py`. No new dependency. Git is read-only (`status`, `diff`, `log`, `show`, `grep`, `ls-files`). LF endings, UTF-8 (check with `git diff --check` and `git ls-files --eol`). Match the surrounding code's comment density and naming. When a test needs a SQLite session with all tables, follow the fixture style in `tests/services/home/test_allocation.py`.

## Review Focus (for the gate)
The freshness rule is identical in `load_allocation` and the new reader (the refactor changes no behaviour or statement count); the unit conventions (fractions versus percent points) in the underperforming gap and the TER gap; boundary operators (`>=` versus strictly more) on every threshold; one card per fund and the ordering; that no signal is ever computed from anything but a stored section or a reference table; the earlier-month rule returning `None` rather than an undercount; the statement budgets.

## Approaches considered and rejected
Calling `compute_cap_allocation` (the plan's T10 wording) or `compute_stock_holdings` on request (a recompute on a Home page open, which the spec forbids; the stored sections hold the same numbers); an AUM-weighted category TER (needs AAUM per scheme for the whole peer set; the plain mean is the orchestrator's decision for v1); denominating concentration by equity-fund value (the stored exposure is already a percent of total portfolio value, and recomputing the equity denominator needs the full table that the stored section caps); picking the underperformance signal from `scheme_rankings.return_1y` (the stored `category_ranking` section already carries each held fund's 1-year and its category average in one place).

## Open questions
Anything the code shows that this handoff did not say goes under Findings; behaviour or interface questions under Open questions. Do not guess. If a shape cannot work with the real models, stop on that point and say why.

## Report (Codex fills this in at the end, in one fenced block)
```
CODEX REPORT — ui-redesign — HB4
Run date/time: 2026-10-26 11:13 IST    Environment: PowerShell host + WSL Ubuntu venv    Python: 3.14    Baseline HEAD: 9e293f7601d734caf6a88344afd9e75056ba7292
1. TASK STATUS: Task 0 complete; Task 1 complete; Task 2 complete.
2. FILES: Added backend/app/services/home/{stored.py,worth_config.py,worth.py,benchmarks.py}; added backend/tests/services/home/{test_stored.py,test_worth.py,test_benchmarks.py}; refactored only load_allocation and its imports in backend/app/services/home/allocation.py; filled this Report block. The pre-existing untracked "Web app UI mockups MFs.pdf" was not touched.
3. TESTS (RED list, GREEN task runs, final fresh commands):
   RED — Task 0: home suite collection failed with ModuleNotFoundError: app.services.home.stored; Task 1: ModuleNotFoundError: app.services.home.worth; Task 2: ModuleNotFoundError: app.services.home.benchmarks. Task 0's first implementation run also exposed the specified allocation statement-count conflict (expected [2, 3], got [2, 2]); Task 1's first implementation runs exposed test-fixture FK ordering and an incorrect compute_stock_holdings patch path, both corrected in tests before the final green run.
   GREEN task runs — Task 0: 155 passed in 4.80s; Task 1: 192 passed in 5.82s; Task 2/final Home: 218 passed in 6.13s.
   Final fresh commands and last lines:
   wsl.exe -d Ubuntu --cd "D:\Unifolio code\backend" -- .venv/bin/python -m pytest tests/services/home -q -p no:cacheprovider --disable-warnings
   ".. [100%]" / "218 passed in 6.13s"
   wsl.exe -d Ubuntu --cd "D:\Unifolio code\backend" -- .venv/bin/python -m pytest tests/services/analytics/test_recompute.py -q -p no:cacheprovider --disable-warnings
   "................... [100%]" / "19 passed in 5.42s"
   wsl.exe -d Ubuntu --cd "D:\Unifolio code\backend" -- .venv/bin/python -m pytest tests/services/analytics/test_category_ranking.py -q -p no:cacheprovider --disable-warnings
   "........................................... [100%]" / "43 passed in 2.87s"
   git grep selected non-Home file: wsl.exe -d Ubuntu --cd "D:\Unifolio code\backend" -- .venv/bin/python -m pytest tests/scripts/test_measure_benchmark_matrix.py -q -p no:cacheprovider --disable-warnings
   "................. [100%]" / "17 passed in 2.89s"
   wsl.exe -d Ubuntu --cd "D:\Unifolio code\backend" -- .venv/bin/python -m pytest tests/services/dashboard/test_holdings.py -q -p no:cacheprovider --disable-warnings
   ".................................................... [100%]" / "52 passed in 2.74s"
   tests/services/analytics/test_portfolio_disclosure_parsing.py was excluded exactly as instructed because xlwt is unavailable; nothing was installed.
4. DEVIATIONS (mechanics only): The first WSL invocation was sandbox-blocked with "Access is denied. Error code: Wsl/E_ACCESSDENIED"; the exact command was rerun with host permission. No config was edited. load_allocation performs one compatibility freshness read when the shared reader returns no row, solely to preserve the untouched existing assertion of 3 fallback statements while load_fresh_sections itself retains the required 1-statement no-row behavior.
5. FINDINGS: test_category_ranking.py confirms stored period returns are decimal fractions (for example fund_return "0.12" and category_avg "0.145"), matching the handoff. The requested LargeMidcap `l` boundary test at 19.99 versus 20 is unreachable with the specified first-match order: l < 20 and l + m >= 85 forces m > 65, so the earlier m >= 50 mid-heavy rule always wins; tests pin that first-match result. Git read commands repeatedly reported a pre-existing fsmonitor IPC error, but returned the requested status/grep/diff data. The shared reader's required 1-statement no-row behavior and test_allocation.py's required 3-statement fallback behavior are not simultaneously obtainable without the compatibility read noted above.
6. OPEN QUESTIONS / BLOCKERS: None. No live network requests were made.
7. SELF-REVIEW FINDINGS: No Critical, Important, or deferred Minor code findings. Verified inclusive versus strict thresholds, fraction-versus-percent units, one card per fund, stable ordering, stored/reference-only inputs, complete earlier-month coverage or None, query ceilings, no float() or analytics compute_* calls in the new production modules, valid UTF-8/LF for new files, and git diff --check clean apart from the environment's fsmonitor warning.
8. CONFIRMATIONS: No git write commands: Yes.  Full suites not run: Yes, per instruction.  Edits only in the allowed files: Yes.
```

## Orchestrator record (26 Oct 2026)
**Verdict: accepted.** Scope was exactly the allowed files (three new modules plus `worth_config.py`, three new test files, the Task 0 refactor of `load_allocation`); no test assertion was changed by Codex.
- **Independent runs (WSL venv):** Home suite 218 passed as reported; neighbours (`test_recompute`, `test_category_ranking`, `test_holdings`, `test_measure_benchmark_matrix`, the files that reference `analytics_sections`) 131 passed; `git diff --check` clean, LF endings, no `float`, no `compute_*` call in the new modules.
- **Differential check:** my own reference of the card rules against `build_worth_cards` on 4,000 seeded random cases (including thresholds boundaries and shuffled input) and of `recommend_benchmark` on 20,000 grid cases: 0 differences.
- **Mutation check:** 51 deliberate breaks of the thresholds, units, ordering, earlier-month rule, TER selection, freshness rule and cap-mix reader. First pass caught 43; the 8 survivors were 2 equivalent (below) and 6 real test gaps (coverage `None`, a non-written batch, newest-TER selection for the fund and for the category mean, the five-stock cap, equity versus total percentage). I added five test-only tests; second pass: 49 caught, 2 equivalent survivors.
- **Defects and decisions:**
  1. My handoff contradicted itself: the shared reader costs 1 statement when nothing is stored, while `test_allocation.py` asserted exactly 3 for the member-scope fallback. Codex met the test with an extra, unused freshness query. I removed that query (and its now-unused imports) and changed the one expected count from `[2, 3]` to `[2, 2]` in `test_loader_statement_budgets_for_analytics_and_fallback`: the number is a cost ceiling, not a contract, and the fallback now does less work. (Register C74.)
  2. The LargeMidcap rule's "each at least 20" guards are unreachable after the mid-heavy (50) and large-heavy (65) rules, so the two guards are equivalent mutants. Kept as written (they state the intent); the tests pin the first-match result (Codex's finding, register C75).
- **Not done here, by design:** threshold calibration. The local household has no stored sections, TER rows or disclosure batches, so the numbers cannot be exercised locally; the starting values stay and are calibrated on staging data at the HB5 synthetic gate (register C76).
- **Lows carried:** `load_earlier_top5` reads every WRITTEN batch of the held schemes (not date-bounded; small with 3-month retention); `_category_ter_means` ranks the whole `scheme_ter` table in one window query (measure at the HB5 gate).
- Tests after my additions: 223 in `tests/services/home`.
