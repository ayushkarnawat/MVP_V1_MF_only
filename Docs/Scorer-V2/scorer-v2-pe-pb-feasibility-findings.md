# Scorer v2 — PE/PB Valuation Data Feasibility Findings

Investigation date: 2026-08-24. Question: can the Valuation Overlay component (5% weight,
PE/PB vs. category average) be built, and how.

**Superseding update, 2026-10-21 (task #6 of the Scorer V2 brainstorming pass):** Path A
below was effectively taken already — not for Scorer V2, but for Sub-project 2's
look-through/valuation feature (Attribute 15, built and live on staging 2026-10-14). The
"nothing to build on" framing immediately below is now **stale**; everything that section
said was missing now exists. See "## Task #6 resolution" at the bottom of this doc for
the current, code-verified answer: a per-scheme valuation aggregator is feasible today,
cheaply, by reusing this existing infrastructure — read that section first, the rest of
this file is historical context for how we got here.

## Existing codebase: nothing to build on (STALE — see update above)

No holdings, portfolio-disclosure, or stock-fundamentals integration exists anywhere in
the backend today (`backend/app/services/analytics/`, `backend/app/integrations/`
searched). The only external data clients are NAV (`amfi_navall`/`mfapi` cache), AAUM
(`amfi_aaum_client.py`), TER (`amfi_ter_client.py`), and NSE index levels
(`nse_indices_client.py`). Valuation is a genuinely new data category for this platform,
not an extension of something partially there.

## No official free API for fund-level PE/PB in India

Searched for SEBI/AMFI-published PE/PB, and for Value Research / Morningstar India APIs.
Neither publishes a public, programmatic feed for fund-level PE/PB. SEBI's monthly
cumulative report and half-yearly portfolio disclosure (Regulation 59A) don't include
PE/PB either — they cover holdings, turnover ratio, and (as of a 2025 circular)
Information Ratio, but not valuation ratios.

## Three viable paths

**A. Build in-house.**
1. Ingest each AMC's portfolio disclosure (holdings + weights) — SEBI mandates half-yearly
   disclosure by regulation; most AMCs publish monthly in practice. **No standard format or
   API** — each AMC publishes its own file on its own site. This is the hardest sub-problem,
   harder than getting the PE/PB numbers themselves.
2. Get stock-level PE/PB for every constituent holding. Viable paid options exist here
   (e.g. FinEdge's financial data API; several NSE/BSE data vendors) — nowhere near
   Bloomberg/Refinitiv's ~$24k/seat tier some global vendors quote for India coverage.
3. Compute fund-level PE/PB as a **weighted harmonic mean** across holdings — this is
   Value Research's own published methodology for exactly this calculation, not a guess:
   "the accurate way to calculate the P/E ratio of a mutual fund is to use the weighted
   harmonic mean method... appropriate weightage to both price and earnings of each
   stock." A citable formula, not internal engineering judgment.
4. Aggregate to category average the same way the rest of the scorer already aggregates
   (category-wide percentile ranking).

Consistent with how the rest of this scorer is built — every other component is computed
from primitives (NAV history, monthly series) rather than sourced pre-computed from a
third party. Genuinely the largest new engineering surface in scorer v2: a new AMC-by-AMC
ingestion pipeline, a stock master dataset, and a refresh cadence policy (monthly
disclosures typically lag by ~10 days).

**B. Buy a licensed feed.** Morningstar Direct, ICRA Analytics, or CRISIL license
fund-level PE/PB directly — zero engineering lift for the number itself, but this is a
cost/contract decision, not an engineering one.

**C. Scrape an aggregator site** (Value Research, Moneycontrol). Fragile, ToS risk — not
recommended for a production financial product without legal review.

## Recommendation

Path A is the better fit for this codebase's existing pattern (own the calculation), but
A vs. B is fundamentally a build-cost-and-time vs. license-cost tradeoff that only you (or
whoever owns the budget) can make — captured as open question #6 in
`Docs/Scorer-V2/Scorer-v2-Calculation-Annex-Open-Questions.md`. If A is chosen, the AMC-disclosure
ingestion format survey (which AMCs publish what, how consistent the formats are) should
be the very first spike, since it's the piece most likely to blow up in scope.

## Sources

- [SEBI Portfolio Disclosures](https://www.sebi.gov.in/sebi_data/commondocs/cirmfd142002_h.html)
- [SEBI — Information Ratio disclosure mandate, 2025](https://www.business-standard.com/markets/mutual-fund/sebi-mandates-disclosure-of-information-ratio-for-equity-mutual-funds-125011701185_1.html)
- [Value Research — Key Ratios methodology (weighted harmonic mean)](https://www.valueresearchonline.com/key-ratios/)
- [Morningstar India — Mutual Fund Research Tools](https://www.morningstar.in/tools/mutual-fund-detailed-portfolio.aspx)
- [FinEdge Financial Data API](https://www.finedgeapi.com/)

## Task #6 resolution (2026-10-21): yes, a per-scheme aggregator is feasible, and cheaply

Everything Path A called "the largest new engineering surface in scorer v2" has already
been built — not for Scorer V2, but for Sub-project 2's Attribute 15 (portfolio-level
valuation on the Analytics dashboard, live on staging since 2026-10-14). Traced the actual
code, not assuming the August plan still matches reality:

**What already exists, reusable as-is:**
- **AMC disclosure ingestion** (the predicted "hardest sub-problem"): `DisclosureBatch` +
  `SchemeHolding` (`backend/app/models/reference.py`) — a genuinely scheme-level,
  **household-independent** table. `DisclosureBatch` is keyed by `(scheme_id, as_of_date)`
  alone; `SchemeHolding` carries `isin`, `asset_type`, `market_value`, and **`pct_to_nav`
  already computed** — exactly the per-scheme weight a valuation aggregator needs, with no
  further calculation required.
- **Stock-level PE/PB**: `StockMaster` (same file), keyed by `isin` alone, platform-wide,
  refreshed by its own daily job (`refresh_stock_fundamentals_daily.py` — see the delegation
  log's Attribute 15 entry, built 2026-10-14, Opus-reviewed).
- **The weighted-harmonic-mean aggregation itself**, exactly the Value-Research-cited
  formula this doc proposed in August: `backend/app/services/analytics/valuation.py`'s
  `metric()` function — already live, already handles missing/invalid ratios per holding
  (loss-making P/E, unavailable P/B, no ISIN disclosed), already enforces a minimum coverage
  threshold (`VALUATION_MIN_COVERAGE = 0.70`) before trusting the number.

**What's net-new, and it's small:** `compute_valuation()` and the `get_lookthrough_table()`
it calls are currently wired for a **household's blended holdings across every scheme a
user owns** (`household_member_ids: list[uuid.UUID]` → sums `pct_to_nav`-weighted exposure
across N schemes). Scorer V2 needs the inverse and simpler case: one `scheme_id`, no
blending. Concretely: look up that scheme's latest `DisclosureBatch`, join its
`SchemeHolding` rows to `StockMaster` by ISIN, and run the exact same harmonic-mean-by-
`pct_to_nav` formula already in `valuation.py`'s `metric()` — a sibling function, not a new
mechanism. No new data source, no new table, no new ingestion pipeline. Options A vs. B
(build vs. license) from the original analysis are moot now — A is already done.

**Empirical check (2026-10-21): real per-scheme coverage, run against LeapSwitch staging
Postgres, not assumed.** The open question above was whether `VALUATION_MIN_COVERAGE` (70%,
calibrated for household-blended exposure) holds up for a single scheme scored in isolation.
Query (latest `WRITTEN` `DisclosureBatch` per scheme, equity-only `SchemeHolding` rows joined
to `StockMaster` by ISIN, fraction of equity value with a valid `pe_ratio`/`pb_ratio`):

```
schemes_with_equity | pe_clears_70pct | pb_clears_70pct | avg_pe_coverage | avg_pb_coverage | p5 | p10 | median
                4183 |            3979 |            3995 |            90.3% |           94.2% | 72.6% | 85.4% | 95.3%
```

**Decision: keep `VALUATION_MIN_COVERAGE = 0.70` unchanged — no redesign needed.** Even the
5th percentile of schemes (72.6%) clears the 70% floor; only 204 of 4,183 schemes
with any equity exposure (4.9%) fall short, and of those, 192 are below 50% (near-zero
ISIN-matchable equity — the exact case the floor exists to exclude, not a borderline miss).
The household-blended threshold transfers to per-scheme use without adjustment. This closes
the one open item from the original finding below; no further calibration work needed before
building the sibling function.

**Finalized implementation, ready to paste at execution time — not just a design sketch.**
Per Ayush's instruction (2026-10-21): since the shape is fully known, write it as the actual
diff now rather than re-deriving it in a future session. Two pieces: (1) factor the existing
per-holding ratio logic in `valuation.py`'s `metric()` into a shared, scheme-agnostic helper
(ladder rung 2 — reuse what's already correct rather than duplicate it), (2) add the new
single-scheme entry point on top of it.

```python
# backend/app/services/analytics/valuation.py — add this helper, then have
# compute_valuation()'s existing inner metric() delegate to it (see note below).

def _valuation_metric(
    rows: list[tuple[str | None, str, Decimal]],  # (isin, instrument_name, value)
    total_equity: Decimal,
    master: dict[str, StockMaster],
    field: str,
    *,
    suppress: bool = False,  # household privacy gate (hide_headlines); always False for a single scheme
) -> ValuationMetric:
    covered, inverse, dates, missing = _ZERO, _ZERO, [], []
    for isin, instrument_name, value in rows:
        stock = master.get(isin)
        ratio = getattr(stock, field) if stock else None
        valid = ratio is not None and ratio.is_finite() and ratio > 0
        if valid:
            covered += value
            inverse += value / ratio
            dates.append(stock.as_of_date)
        else:
            reason = ("No ISIN disclosed" if isin is None else "No fundamentals available for this ISIN" if stock is None
                      else stock.footnote
                      or ("P/E excluded: loss-making or unavailable earnings" if field == "pe_ratio" else "P/B unavailable"))
            missing.append(ValuationMissingHolding(
                isin=isin, instrument_name=instrument_name, exposure_value=value,
                percentage_equity=value / total_equity * 100 if total_equity else _ZERO, reason=reason,
            ))
    fraction = covered / total_equity if total_equity else _ZERO
    enough = bool(total_equity and fraction >= VALUATION_MIN_COVERAGE and inverse > 0)
    ratio = (covered / inverse).quantize(_PRECISION, rounding=ROUND_HALF_UP) if enough and not suppress else None
    return ValuationMetric(ratio=ratio, coverage_pct=fraction*100, enough_data=enough,
                           as_of_date=min(dates, default=None), missing=missing)


async def compute_scheme_valuation(db: Session, scheme_id: uuid.UUID) -> SchemeValuation | None:
    """Scorer V2 Valuation component: one scheme's own PE/PB, no household blending.

    Pass the HELD scheme_id directly — no peers.representative_of resolution needed here,
    unlike the NAV-based risk metrics. write_disclosure_batch() writes an identical
    DisclosureBatch to every plan/option row of a fund's family (confirmed in
    portfolio_disclosure_writer.py: "holdings are identical across a fund's plan variants"),
    so a held IDCW scheme already has its own correct, non-distorted holdings disclosure.
    Returns None if this scheme has no written disclosure batch at all.
    """
    batch = (
        db.query(DisclosureBatch)
        .filter(DisclosureBatch.scheme_id == scheme_id, DisclosureBatch.status == DisclosureBatchStatus.WRITTEN)
        .order_by(DisclosureBatch.as_of_date.desc())
        .first()
    )
    if batch is None:
        return None
    holdings = db.query(SchemeHolding).filter(SchemeHolding.batch_id == batch.id).all()
    equity = [h for h in holdings if h.asset_type in _EQUITY]
    total_equity = sum((h.market_value for h in equity), _ZERO)
    isins = {h.isin for h in equity if h.isin is not None}
    master = {s.isin: s for s in db.query(StockMaster).filter(StockMaster.isin.in_(isins)).all()} if isins else {}

    def metric(field):
        return _valuation_metric(
            rows=[(h.isin, h.instrument_name, h.market_value) for h in equity],
            total_equity=total_equity, master=master, field=field,
        )

    return SchemeValuation(scheme_id=scheme_id, as_of_date=batch.as_of_date, pe=metric("pe_ratio"), pb=metric("pb_ratio"))
```

```python
# backend/app/services/analytics/schemas.py — new schema, sibling to ValuationSummary
class SchemeValuation(BaseModel):
    scheme_id: uuid.UUID
    as_of_date: date
    pe: ValuationMetric
    pb: ValuationMetric
```

**Required edit to the existing household path (so there's one formula, not two):** replace
`compute_valuation()`'s inner `metric(field)` body with a call to `_valuation_metric`:

```python
    def metric(field):
        return _valuation_metric(
            rows=[(r.isin, r.instrument_name, r.exposure_value) for r in equity],
            total_equity=total_equity, master=master, field=field, suppress=table.hide_headlines,
        )
```

Needs `from app.models.enums import DisclosureBatchStatus` and `from app.models.reference
import DisclosureBatch, SchemeHolding` added to `valuation.py`'s imports. Imports (`uuid`,
`Decimal`, `ROUND_HALF_UP`, `AssetType`, `StockMaster`, `ValuationMetric`,
`ValuationMissingHolding`, `VALUATION_MIN_COVERAGE`, `_EQUITY`, `_ZERO`, `_PRECISION`) are
already present in the file and reused as-is, no duplication.

**What the scorer caller does with this:** `scorer.py`'s Valuation component calls
`compute_scheme_valuation(db, scheme.id)` (the user's actual held scheme — not
`peers.representative_of`, see the docstring above for why this differs from the risk
metrics), gets back `pe`/`pb` ratios with `enough_data`, and percentile-ranks `pe.ratio`
(lower is "cheaper") against the same category peer universe the other components use. If
`enough_data` is False for a given fund (the 4.9% tail above), that fund's Valuation component
follows the same §5 no-silent-substitution + visible-disclosure rule as the other exclusion
cases in the benchmark-coverage doc — carried into task #10, not re-litigated here.
