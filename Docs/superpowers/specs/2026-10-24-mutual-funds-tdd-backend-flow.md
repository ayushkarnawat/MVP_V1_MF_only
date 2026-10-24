# Mutual Funds Page Redesign — Technical Design & Backend Flow

**Companion to:** `Docs/PRDs/PRD-06-Mutual-Funds-Page-Redesign.md` (requirements) and
`Docs/orchestration/2026-10-23-mutual-funds-page-design.md` ("design.md" below, full
content spec). This document is the "how the flow changes" / technical-design layer the
owner asked for by name (2026-10-24) — it does not repeat design.md's content mapping,
only the backend mechanics and the handful of genuinely new work items.

## 1. Existing flow (unchanged by this redesign, for context)

All 15 analytics sections are precomputed, not computed per-request: a background job
recomputes all 15 for `"combined"` + every household member on CAS import, CAS retry, and
a daily backstop job, storing results in `analytics_sections` keyed by
`(user_id, scope_key, section)`. Everything renders from `GET /analytics/{scope}` — one
endpoint, already-fetched payload, the frontend just reads nested fields. This pattern is
**kept as-is** (design.md §5, Q5 resolved: Option B over a new on-demand endpoint,
explicitly trading backend load for read speed). The redesign's pages are mostly a
re-layout of this same payload into 7 routes instead of one long scroll — see the
restructure/relayout companion doc for the page-by-page breakdown.

## 2. New backend work (the only genuinely new computation; everything else is reuse)

### 2.1 `sebi_category` on the dashboard `HoldingRow`

Overview's holdings table needs a per-scheme category column. The field already exists on
the `Scheme` reference model (`backend/app/models/reference.py:28`) and is already used by
`category_ranking`/`ranking` — this is additive only: add `sebi_category: str | None` to
`backend/app/services/dashboard/schemas.py:55`'s `HoldingRow`, joined from the
scheme-master the dashboard already reads. No migration, no new table. (design.md §3, Q3)

### 2.2 Four additional benchmark indices

`nse_indices_client.py`'s `BenchmarkIndex` enum has exactly 4 members today
(`nifty_50`/`nifty_500`/`nifty_largemidcap_250`/`nifty_midcap_150`) with a deliberately
static 4-entry name-mapping dict. Add 4 enum members — Nifty Next 50, Nifty Smallcap 250,
Nifty 100, Nifty 200 (owner-confirmed 2026-10-23) — their `_TRADING_INDEX_NAME` entries,
and a one-time backfill via the existing `nse_indices_client` fetch-and-cache mechanism
(same mechanism, more rows — not a new integration). A non-NSE index (e.g. BSE Sensex)
is explicitly out of scope; it would need an entirely separate data source. (design.md
§7.1)

### 2.2.1 Windowed XIRR (new math, not a reuse of since-inception XIRR)

Today's benchmark XIRR is always since-inception. The time-window requirement (1Y / 3Y /
5Y / Since Inception, matching `category_ranking`'s existing periods) needs trailing-N-year
cash-flow windowing logic — a new, separate calculation path from the existing
since-inception XIRR, not a parameter on it. (design.md §7.1)

### 2.2.2 Precompute shape for the index × window matrix

For each scope (`"combined"` + every household member), store one payload per
`(index × time-window)` combination inside the existing `benchmark`/`benchmark_funds`
analytics-section JSON — e.g. 8 indices × 4 windows once the new indices land — recomputed
by the same background job that recomputes everything else on CAS import/retry/daily
backstop. The frontend's benchmark/time-window picker (whatever widget shape a given round
uses — see PRD-06 §4.1) selects a key into this already-fetched payload: zero extra
network round-trips once the page has loaded, which is the speed property Option B
(§1 above) is for. (design.md §7.1)

### 2.3 Fund Overlap — "excluded funds" count (needs a backend check, not yet confirmed)

Unconfirmed whether `overlap` already tracks which owned funds it excluded (e.g. missing
look-through data) separately from the funds it scored, or whether it only ever returns
the funds it *could* score. **If the latter**, "N excluded" is new but cheap: derive as
`(total owned funds) − (funds present in overlap.matrix)`. Needs a quick check of
`overlap.py`'s current return shape before this is built, not assumed free. (design.md
§7.5, top-stat-strip)

### 2.4 Per-fund market-cap aggregation (needed only for Fund-vs-Fund Comparison's Market
    Cap tab)

`MarketCapClassification` (the ISIN-level Large/Mid/Small/Other table Allocation's Market
Cap section already surfaces portfolio-wide) needs a new aggregation scoped to one
individual fund at a time, for the comparison screen's Market Cap Comparison tab. Same
underlying data, a new grouping — not a new backend field, not a new data source.
(design.md §7.5.1)

## 3. What does NOT need new backend work (confirm before assuming otherwise)

Allocation's five breakdowns (`allocation.by_amc`, `cap_allocation`, `fund_manager`,
`allocation.by_category`/`category_ranking`, `asset_allocation`), Holdings' stock
look-through (`stock_holdings.rows[].contributing_funds`), Transactions
(`InvestmentWithdrawalSection`'s existing cash-flow ledger), Other Analytics' four groups
(Valuation, TER, Scorer, Fund Ranking, Category Ranking — all existing sections, just
regrouped visually) are all already computed today. The multi-chart-representation
requirement (PRD-06 §4.2) is a frontend rendering choice over existing data, not a new
backend need — picking "bar" vs "pie" for an already-fetched `{label, pct, value}` array
is client-side only.

## 4. Data flow diagram (text form)

```
CAS import / retry / daily backstop job
        |
        v
 background recompute job --> writes all 15 analytics_sections
        |                      (+ 2.2.2's index x window matrix once built)
        v
 analytics_sections table, keyed (user_id, scope_key, section)
        |
        v
 GET /analytics/{scope}  -->  one JSON payload, all sections
        |
        v
 7 frontend routes (Overview tab + 6 sub-pages) each read their
 slice of the same payload -- no new endpoint per page
```

This is unchanged in shape by the redesign; the redesign changes which frontend route
reads which slice, not how the slice gets computed or served (design.md §5/§6 for the
full component-to-route mapping).

## 5. Open items carried from design.md, not re-litigated here

- The nav-shell route conflict (`portfolio-mutual-funds-overlap-compare` has nothing to
  render once the compare feature moved off the portfolio level, resolved to live inside
  the Individual Fund page's Overlap Analysis tab instead) — still needs a contract change
  with the nav-shell owner, design.md §0/§7.5. Not resolved by the artifact-count decision
  below; this is a routing-table conversation, not a design one.
- ~~Fund Overlap's exact artifact count (3 vs 4) and the "two states" reference~~ —
  **resolved 2026-10-24** via AskUserQuestion: exactly 3 artifacts (portfolio-level
  overlap; the Individual Fund page's Overlap Analysis tab normal state; the same tab's
  comparison state). No 4th artifact, no separate route for the comparison screen. §2.4's
  per-fund market-cap aggregation estimate is unaffected — it was already scoped to the
  comparison screen's Market Cap tab regardless of artifact count.

## 6. Cross-cutting audit (2026-10-24) — confirms no new backend work, flags 2 frontend gaps

A field-by-field audit of every mockup's "Data source mapping" table against the live
production components (`CoverageBanner.tsx`, `ValuationSection.tsx`, `OverlapSection.tsx`,
`InvestmentWithdrawalSection.tsx`) found 4 gaps, all of them **frontend mockup
completeness gaps, not missing backend computation** — every field involved
(`sip_summary`, `gifts_net`, `opening_holdings`, `CoverageBanner`'s per-fund reason list +
`excluded_share`, `ValuationSection`'s `hide_headlines`/`enough_data`/`metric.missing`/
`footnotes`, `OverlapSection`'s `concentration`/`total_stock_count`) already exists in the
`analytics_sections` payload today and is already rendered by the real production
component — the mockups simply hadn't represented it yet. Full record:
`Docs/orchestration/2026-10-24-mutual-funds-cross-cutting-audit-findings.md`.

- Transactions' 3 missing fields and Fund Overlap's Stock Concentration block: now fully
  represented in their mockups, reusing existing fields, zero new backend work.
- `CoverageBanner` full port (Holdings, Other Analytics, Fund Overlap) and
  `ValuationSection`'s full edge-state rendering (Other Analytics): each mockup currently
  shows only a simplified headline-% stub, deliberately deferred per owner instruction.
  **This is purely a frontend mockup/implementation gap to close in a later round** — the
  underlying fields are already computed and already consumed by the existing production
  components (Allocation's mockup already demonstrates the full `CoverageBanner` pattern);
  there is no new backend work item to add to §2 above for either of these.
