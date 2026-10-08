# Sub-project 1 — Planning Doc (running, not yet a final spec)

**Status: planning/brainstorming only. Nothing in this doc has been executed — no code,
no migrations, no live spikes, no staging changes.** Per the brainstorming skill's
architectural path, this stays a working planning doc until every attribute in scope has
been through clarifying questions + a presented design, at which point it graduates into
a real spec (`Docs/superpowers/specs/YYYY-MM-DD-...-design.md`) and an implementation plan.

**Scope of Sub-project 1:** the lowest-risk path identified in
`Docs/analytics/2026-10-06-analytics-pdf-attribute-gap-analysis.md` §5 — bucket B (09
ranking, 12 TRI benchmark, 14 investment/withdrawal analysis) + bucket C (04 fund manager
allocation, 11 drawdown scenarios), all independent, none blocked on the look-through
engine (bucket D, which is Sub-project 2).

**Covered so far in this doc:** all five attributes in scope (09, 11, 04, 12, 14) — backend/
data design closed for every one as of 2026-10-08. See "Next in this planning pass" at the
end of this doc for what remains (the consolidated frontend pass and the formal spec/
artifact sign-off).

---

## Attribute 09 — Mutual fund ranking

Confirmed (`decisions.md` 2026-10-06): not a Scorer conflict, an independent net-new
feature on the PDF's own 5-factor formula (`0.25×3Y + 0.25×5Y + 0.20×category-relative +
0.15×low-vol + 0.15×low-TER`). Build-vs-scrape resolved 2026-10-08: build in-house, not
scrape MoneyControl/AdvisorKhoj/CRISIL — (a) every input the formula needs already exists
or is cheaply derivable in this codebase, (b) scraping/redisplaying a third party's own
*computed ranking product* (CRISIL's category rankings are a commercially licensed
product, distinct from scraping a regulatory public disclosure like a factsheet, which
attributes 04/15 already do) is a durability and legal risk a from-scratch computation
doesn't carry. Ayush confirmed this direction 2026-10-08.

### "Category-relative" mechanic — resolved 2026-10-08, grounded in researched precedent

Three candidates were on the table (`decisions.md` 2026-10-06): (a) single-period alpha
vs. category average, (b) AdvisorKhoj-style multi-period consistency, (c) CRISIL-style
overlapping-window weighting. Fresh WebSearch research this session (CRISIL's own
published methodology PDF, Value Research's fund-rating methodology, Morningstar's
star-rating methodology, and CAPM "alpha" terminology for disambiguation) found:

- **CRISIL** doesn't have a standalone "category-relative" parameter at all — "mean
  return" and "volatility" are its only atomic inputs, blended across four overlapping
  windows (36/27/18/9 months). No citable distinct formula for (c) exists; ruled out as
  not a real precedent, not just "hard to find."
- **Value Research's "Return Grade"** is the closest real precedent: a fund's
  risk-adjusted return (vs. a risk-free rate) compared against its *category's average*
  risk-adjusted return, as its own standalone scored dimension — i.e., "fund vs. category
  average" genuinely is an established, named rating axis in the industry, not an
  invented concept. This directly validates (a)'s shape.
- **CAPM alpha** (fund return vs. a market benchmark, risk/beta-adjusted) is a *different*
  concept from "vs. category average" — confirms these shouldn't be conflated, and that
  (a)'s framing (peer-vs-peer, not fund-vs-benchmark) is the right one for a feature whose
  entire premise is peer ranking.

**Resolved formula, simplified from Value Research's precedent:**
`category_relative = fund's own blended return − category's AUM-weighted average blended
return`, where "blended return" reuses `category_ranking.py`'s existing 40%/60% 3yr/5yr
blend (`_blend_returns`) and "category average" reuses its existing AUM-weighted average
(`_aum_weighted_average`) — both already built for FR-4, zero new computation. The
risk-free-rate adjustment Value Research applies is **deliberately dropped**: (1) no
risk-free-rate time series exists anywhere in this codebase today — adding one would be a
new, undesirable data dependency for a single formula input; (2) the PDF's own formula
already has a separate explicit 0.15 low-volatility weight, so re-introducing a
risk-adjustment inside category-relative would double-count volatility against that
weight. This simplification is a documented, deliberate corner cut, not an oversight.

### Normalization — every component is a percentile rank, not a raw number (CLAUDE.md
"stop and say so" judgment call, flagged explicitly)

The PDF's literal wording (`0.25×(3Y return) + ...`) can't mean raw numbers added
together — a 3Y CAGR (e.g. 0.18), a category-relative delta (e.g. 0.02), and a TER
percentage (e.g. 1.2) are on incompatible scales; summing them directly would make the
"low-TER" and "category-relative" terms numerically meaningless next to the return terms.
The only internally consistent reading: every one of the 5 components is first converted
to a **percentile rank within the category (0–100, higher = better)**, then the 0.25/0.25/
0.20/0.15/0.15 weights are applied to those percentiles, matching how `scorer.py`'s own
Scorer v1 already combines its 3 heterogeneous components (Return/Risk/Consistency
percentiles) into one composite score — same mechanism, different formula/weights, not an
invented approach. Reuses `category_ranking.py`'s `_rank_and_percentile` for all 5
components (inverting sort direction for low-volatility and low-TER, same as Scorer
already does for its own Risk component).

### Eligibility and edge cases — reuse existing bars, don't invent new ones

- **Minimum 3Y history to be ranked at all** — same floor `category_ranking.py`/
  `scorer.py` already enforce (and matches CRISIL/Value Research/Morningstar's own
  published eligibility floors, confirmed via this session's research). Below it:
  `insufficient_history=True`, not ranked — same field/semantics `CategoryRankRow`/
  `FundScoreRow` already use.
- **Thin category** — reuse the existing `_THIN_CATEGORY_THRESHOLD = 5` constant and its
  existing semantics (still ranked, just flagged `thin_category=True`) rather than
  adopting Value Research's stricter "≥10 comparable funds" floor — consistent with this
  codebase's own already-established bar, not a new one.
- **Missing 5Y history (has 3Y, not yet 5Y):** the 0.25 weight for the missing component
  is redistributed proportionally across whichever components *are* available for that
  scheme (generalizing `category_ranking.py`'s existing "3yr-only schemes use 100% 3yr"
  precedent, which already does exactly this for the 2-component case, to the 5-component
  case here). Applies the same way if TER or volatility data happen to be unavailable for
  a given scheme.
- **1Y return for display:** resolved as part of this design, not a separate open item —
  see below; the formula still never uses 1Y as a weighted input, only as a display
  column.

### Schema — two new tables, structurally parallel to existing ones

```sql
-- One row per scheme per day the ranking was computed, structurally
-- identical in spirit to fund_scores (Scorer v1's own table) but a
-- distinct table, per decisions.md's "not a Scorer conflict" ruling —
-- these are two different formulas and must never share one row shape.
CREATE TABLE scheme_rankings (
    scheme_id            UUID NOT NULL REFERENCES schemes(id),
    computed_at           TIMESTAMPTZ NOT NULL,  -- pinned to day-start, same idempotency trick as fund_scores.computed_at
    composite_score       NUMERIC(5,2) NOT NULL, -- 0-100, weighted sum of the 5 percentiles (post-renormalization)
    category_rank         INTEGER,
    category_size         INTEGER NOT NULL,
    percentile            NUMERIC(5,2),          -- composite_score's own rank within category (for "top X%" display)
    return_1y             NUMERIC(8,6),          -- display-only, never a weighted input
    return_3y             NUMERIC(8,6),
    return_5y             NUMERIC(8,6),          -- NULL if <5yr history -- triggers the renormalization above
    category_relative      NUMERIC(8,6),          -- fund blended return minus category AUM-weighted blended average
    downside_deviation     NUMERIC(8,6),          -- raw value, same metric scorer.py already computes -- sign NOT inverted here (display)
    ter_value              NUMERIC(5,2),          -- raw %, from scheme_ter -- never duplicated, just the value used this run
    return_3y_percentile   NUMERIC(5,2),
    return_5y_percentile   NUMERIC(5,2),
    category_relative_percentile NUMERIC(5,2),
    volatility_percentile  NUMERIC(5,2),          -- already inverted (low vol = high percentile)
    ter_percentile         NUMERIC(5,2),          -- already inverted (low TER = high percentile)
    PRIMARY KEY (scheme_id, computed_at)
);

-- Singleton config table, DB-backed/no-admin-UI per decisions.md 2026-10-06.
-- Seeded once via migration with the PDF's own 25/25/20/15/15 split; edited
-- directly via the existing SSM-tunnel + psql/DBeaver pattern thereafter.
-- A missing/empty table is NOT a failure mode -- the service layer falls
-- back to the same hardcoded defaults the migration seeds, so a row
-- accidentally deleted in staging degrades to "PDF defaults", not a crash.
CREATE TABLE ranking_weights (
    id                     BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),  -- enforces exactly one row, same trick as any singleton table
    weight_return_3y        NUMERIC(4,3) NOT NULL DEFAULT 0.25,
    weight_return_5y        NUMERIC(4,3) NOT NULL DEFAULT 0.25,
    weight_category_relative NUMERIC(4,3) NOT NULL DEFAULT 0.20,
    weight_low_volatility    NUMERIC(4,3) NOT NULL DEFAULT 0.15,
    weight_low_ter           NUMERIC(4,3) NOT NULL DEFAULT 0.15,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Both tables land in one new migration, `backend/alembic/versions/0033_scheme_rankings_and_
ranking_weights.py` (0033 is the next free number — confirmed by listing
`backend/alembic/versions/` directly, latest existing is `0032_transaction_stamp_duty.py`).

### Computation flow — new module `fund_ranking.py`, a structural sibling of `scorer.py`

Reuses, with zero changes needed to any of them:
- `scheme_universe.get_category_universe` — same category-universe fetch Scorer/Category
  Ranking already use.
- `category_ranking._aum_weighted_average`, `category_ranking._rank_and_percentile` —
  used as-is, both already public-enough within the module (same import pattern
  `scorer.py` already uses for these two).
- `risk_metrics.build_monthly_series_bulk`, `compute_downside_deviation` — same 5-year
  monthly-series/downside-deviation computation Scorer already runs for its own Risk
  component; attribute 09's low-volatility input reuses this verbatim, same window.
- `ter._latest_ter_for_scheme` — same per-scheme TER lookup `scorer.py`'s
  `_category_ter_context` already uses, but percentile-ranked here (full 0.15-weighted
  component) rather than Scorer's small ±0.25 dead-zone nudge — a deliberate difference
  from Scorer's TER treatment, not an inconsistency: the PDF's formula gives TER a real
  weighted share, Scorer's doesn't.

One genuinely new (small) piece added to `category_ranking.py` itself: `_compute_category_returns`
currently only exposes the *blended* 3yr/5yr return per scheme (`returns[scheme.id] =
_blend_returns(r3, r5)`) — it already computes `r3` and `r5` separately before blending
them away. Attribute 09 needs those two raw values (plus a new 1yr anchor) for display and
for independent percentile-ranking, so this function gains a second return value exposing
`{scheme_id: (r1, r3, r5, blended)}` instead of just `{scheme_id: blended}` — an additive
change, `scorer.py`'s existing call sites are unaffected (they keep using the blended dict
as before).

**Per request/day, step by step:**
1. Get the category universe (same as Scorer).
2. Compute `{scheme_id: (r1, r3, r5, blended)}` for the whole universe (the extended
   `category_ranking` function above).
3. Compute the category's AUM-weighted average blended return (`_aum_weighted_average`),
   then `category_relative[scheme_id] = blended[scheme_id] - category_avg_blended` for
   every scheme.
4. Compute downside deviation per scheme (reused from `risk_metrics`, same as Scorer),
   negate for "lower is better" ranking.
5. Fetch TER per scheme for the category (reused from `ter.py`), negate for "lower is
   better" ranking.
6. Percentile-rank r3, r5, category_relative, (-downside_deviation), (-ter) each
   independently within the category via `_rank_and_percentile`.
7. Read `ranking_weights` (or fall back to hardcoded PDF defaults if the table's empty).
   Renormalize weights across whichever of the 5 percentiles are non-`None` for this
   scheme (missing-5Y/missing-TER/missing-volatility case).
8. `composite_score = Σ(renormalized_weight × percentile)` for the available components.
9. Rank `composite_score` across the category (`_rank_and_percentile` again, same as
   Scorer's `_finish_fund_score` ranks `composite`) to get `category_rank`/`percentile`.
10. Upsert one `scheme_rankings` row, `computed_at` pinned to day-start, same
    IntegrityError-tolerant one-row-per-day pattern `scorer.py`'s `_finish_fund_score`
    already uses verbatim (two concurrent requests racing past a check-then-insert both
    attempt the insert; the loser's `IntegrityError` is swallowed, its own freshly
    computed result is still returned to its caller).

### No new job, no new infra — the concrete "much smaller build"

Every input is already either cached on-demand (NAV, via the existing `warm_nav_history`)
or already refreshed by an existing scheduled job with no relation to this feature (TER by
`ter_daily`, AAUM by the existing quarterly job). Attribute 09 adds **zero new external
data source and zero new scheduled job** — it's computed on-demand, exactly like Scorer v1
and Category Ranking already are (`compute_fund_score`/`compute_category_ranking`'s
existing request-time posture), with the same 15-minute in-process cache idiom
(`_category_score_cache`-style) worth adding here too for the same reason Scorer added
one: a category-wide computation repeated across multiple requests/holdings in the same
category within a session shouldn't be recomputed from scratch every time.

### API contract

- `GET /analytics/funds/{scheme_id}/ranking` — 1:1 structural peer of the existing
  `GET /analytics/funds/{scheme_id}/score`, same `Scheme`-lookup-then-404 pattern in
  `api/analytics.py`. Returns a new `FundRankingRow` schema (scheme_id, scheme_name,
  category_unavailable, insufficient_history, thin_category, composite_score,
  category_rank, category_size, percentile, plus every raw/percentile field from
  `scheme_rankings` above — same "never a bare number, always the evidence behind it"
  principle `FundScoreRow` already follows).
- Aggregate portfolio-level endpoint mirroring `compute_portfolio_score`/
  `get_aggregate_category_ranking`'s existing pattern — groups held schemes by category
  the same way (`compute_portfolio_score`'s existing `schemes_by_category` loop,
  copy-pasted structurally) so a portfolio with multiple holdings in one category still
  computes that category's universe/returns/volatility/TER once, not once per holding.
  New schemas: `FundRankingSummary` (`funds: list[FundRankingRow]`),
  `AggregateFundRankingResponse` (`members`, `ranking`) — same shape as
  `AggregateCategoryRankingResponse`.

### Still open after this design (small, not blocking)

- The `ranking_weights` seed values are the PDF's own 25/25/20/15/15 split — only the
  *category-relative mechanic* was flagged as possibly overstated by Ayush, not this
  specific weighting split, so no change proposed here; flagging only so it isn't silently
  assumed settled without having been separately asked about.

## Admin-configurability (applies to both 09 and 11)

Decided (`decisions.md` 2026-10-06): DB-backed tables, no admin UI. No admin role/
permission system exists anywhere in the codebase today, so building one would be a
first-ever admin surface — disproportionate to either attribute's scope. Both 09's
weights (the `ranking_weights` singleton table, schema above) and 11's scenario dates are
edited directly via the existing SSM-tunnel + `psql`/DBeaver access pattern, same as
staging data resets already work. For 11
specifically, this is paired with a documented "how to add a scenario" guide (see below)
rather than a UI, since scenario additions need judgment (sourcing/verifying real market
dates), not just data entry.

---

## Attribute 11 — Drawdown / stress-test scenarios

### What's actually being built (clarified through brainstorming, supersedes the PDF's
literal wording)

Take the client's **actual current portfolio** (today's real scheme weights and rupee
values) and replay it through a historical market-stress window using **real per-scheme
NAV history** — "if my ₹20Cr portfolio existed during the COVID crash, what would have
happened to its value, scheme by scheme." This is the PDF's existing "back-tested" mode,
made concrete: output is a per-scheme rupee breakdown table (today's value → scenario-
trough value → % fall → portfolio total), not just one aggregate percentage, and the
underlying per-scheme fall numbers must be real historical fact, computed once and
reused identically every time (never re-derived differently per request) — "should not
be randomly changing."

### Schema — no single benchmark_index column

A scenario is just `name`, `start_date`, `end_date`, `description`. At render time, the
comparison shows portfolio fall alongside fall for *every* benchmark index that has real
coverage for that window (read live from `benchmark_index_history`, not a hardcoded
link) — not locked to one designated benchmark per scenario. Nifty Midcap 150 and Nifty
LargeMidcap 250 only launched ~2016-17, so older scenarios (2008, 2011) will only ever
have Nifty 50/Nifty 500 columns — expected and fine, same "didn't exist yet" handling
used elsewhere in the PDF's own spec.

### Scenario library — expanded 2026-10-08 into the "Scenario Simulator" taxonomy (Ayush's
addition, reconciled against the original 8)

**Reconciliation first, since Ayush asked explicitly to check what's already decided
against what's new, not silently merge:**

- **COVID crash** and **2022 global tightening (Rate hikes + Russia-Ukraine)** really were
  already in the original 8-row table — Ayush's "already on your list" is correct for
  these two. Both get their dates/stats tightened below using his sourced figures.
- **Post-COVID bull run** is **not** actually in the original table — the original table
  had zero bull-run-category rows, only crashes/corrections. Flagging this mismatch rather
  than treating it as already covered: it's net-new here, added as the first entry in a
  brand-new Bull Runs category that didn't exist before this pass.
- **2015-16 China slowdown** (original: Mar 2015–Feb 2016) and **FPI-led correction**
  (original: Sep 2024–Mar 2025) overlap two of Ayush's new entries (China crash/yuan
  devaluation; Oct 2024–Mar 2025 correction) but with different, more specific windows and
  sourced stats. His tighter windows are adopted below as the authoritative version,
  replacing the originals — not kept as a second duplicate row.
- **2019 pre-COVID slowdown** isn't in Ayush's new list at all. Nothing instructed removing
  it, so it's kept, just not promoted to a curated picker card (see curation section
  below).
- One line in Ayush's message — *"stock market today sensex nifty why stock market is
  falling today trump warning crude oil price"* — reads like an accidental paste of a
  search-suggestion dropdown, not an intended 32nd scenario. Treated as noise, not added as
  a row. Flagging it explicitly rather than silently dropping it, in case that's wrong.

**Primary-source date verification — done, 2026-10-08, per Ayush's explicit "do the
research now" instruction.** Every historical/policy row (categories A, B, C — the
HYPOTHETICAL rows in category D need no such check by design) has been cross-checked via
multiple independent sources (Wikipedia, Business Standard, Business Today, official RBI
press releases, contemporaneous reporting), not just carried over from Ayush's own recalled
figures. The table below reflects the **verified** windows/stats, with every correction
against Ayush's original message called out explicitly in that row's Notes column rather
than silently fixed — so nothing here is lost history. Two rows (Franklin Templeton
wind-up, US-Iran war) need more than date-checking — see the dedicated subsections after
the table.

**A. Crashes and shocks**

| Scenario | Window | `scenario_type` | Notes |
|---|---|---|---|
| Dot-com bust | Mar 2000 – Oct 2002 | CRASH | Tests IT/tech concentration. Pre-dates almost every live scheme and most benchmark history — the proxy-mapping subsection below is load-bearing here, not optional. |
| GFC (2008) | Jan 2008 – Oct 2008 | CRASH | Sensex ~-60% peak-to-trough per Ayush, crude spiked beforehand. Equity-heavy-family benchmark. Carried over from the original table, description tightened. |
| Eurozone debt crisis (2011) | Nov 2010 – Dec 2011 | CRASH | Slow grind down, weak rupee. Carried over unchanged. |
| Taper tantrum (2013) | May 2013 – Sep 2013 | CRASH | Rupee ~55→68, bond yields spiked. Tests debt funds and INR exposure specifically — the first scenario in this library where a *debt* category fall, not an equity one, is the point. |
| China crash / yuan devaluation | Aug 2015 – Jan 2016 | CRASH | Replaces the original "2015-16 China slowdown" row (Mar 2015–Feb 2016) with Ayush's tighter, sourced window. EM risk-off. |
| Demonetisation (2016) | Nov 2016 – Jan 2017 | CRASH | Domestic cash shock — real estate, small caps, NBFCs hit hardest. First scenario where the household's *allocation mix* (not just equity vs. debt) drives who gets hurt. |
| Budget 2018 LTCG reintroduction | Feb 2018 (single trading day, ±1-2 days) | POLICY_RATE | First scenario where `start_date = end_date` (or a 2-3 day window) — see the "single-day shocks" note below the table. A tax-policy shock, tests tax-drag modelling, not a market-stress one — categorized POLICY_RATE not CRASH despite being in Ayush's "crashes" list, since the mechanism (a tax-law change, not a sell-off) matches category C's other entries structurally. Flagging this recategorization rather than filing it where he listed it, since the scheme-level fall number here means something different (a tax-rule change, not a price shock) and a future reader needs to know that was a deliberate call, not an oversight. |
| IL&FS / NBFC crisis (2018) | **Aug 2018 – Nov 2018** (corrected) | CRASH | Credit event + small/midcap drawdown after. Tests credit-risk debt funds. **Verified window differs from Ayush's "Jan 2018 – Oct 2018"**: IL&FS's very first (small, contained) default was actually Jun 2018, but the market-moving crisis is precisely dated to the **27-28 Aug 2018** commercial-paper default, escalating to a sector-wide NBFC sell-off on **21-24 Sep 2018** (HDFC/Bajaj Finance alone lost ~₹18,600cr/₹13,800cr market cap in 3 days), with cumulative defaults reaching ₹46.4bn by Nov 2018. The small/midcap drawdown continued well into 2019, but the acute shock window is Aug-Nov 2018, not starting Jan 2018. |
| COVID crash | **Jan 2020 – Mar 2020** (corrected) | CRASH | **Already on the list** — but verification found Ayush's "Feb 2020" start understates it: Nifty hit its **actual all-time pre-crash high of 12,430 on 20 Jan 2020**, held up through most of Feb (41,323 on 19 Feb), then fell sharply from 19 Feb as COVID spread, bottoming at **7,511 on 23 Mar 2020** — a ~38% fall in ~45 trading days, confirming Ayush's stat. Window corrected to start at the actual peak (Jan 2020), not the acceleration point (Feb 2020). |
| Franklin Templeton wind-up (2020) | Apr 2020 – Jun 2020 (approx.) | CRASH | Deliberately kept separate from COVID per Ayush's explicit instruction, to isolate illiquid-debt stress specifically. **Structurally different from every other row** — see its own subsection below, don't build it as a plain NAV-replay scenario without reading that first. |
| 2022 global tightening | Oct 2021 – Jun 2022 | CRASH | **Already on the list, stats verified.** Russia-Ukraine + Fed hikes + record FPI outflows, new-age tech hit hardest. **Verified: Nifty fell from its Oct 2021 peak (~18,604) to its Jun 2022 low (~15,183) ≈ -18.4%** — confirms Ayush's "~18%" figure precisely, no correction needed. |
| Adani-Hindenburg (2023) | Jan 2023 – Feb 2023 | CRASH | Single-group collapse. Ayush flags this as "the best showcase for Correlation X-Ray" — **that feature doesn't exist anywhere in this doc or the codebase today**; see the dedicated open-item subsection below rather than assuming what it means. Buildable as a normal fund-level crash scenario regardless. |
| SVB / Credit Suisse (2023) | Mar 2023 | CRASH | Global banking scare, mild India impact — expect small fall numbers here, that's the correct output, not a bug. |
| Oct 2024 – Mar 2025 correction | **Sep 2024 – Mar 2025** (corrected) | CRASH | **Verification reverses the Oct2024→Sep2024 swap made earlier in this doc**: Nifty's actual all-time high before this correction was **26,277.35 on 27 Sep 2024**, not in October — so the *original* table's "FPI-led correction, Sep 2024-Mar 2025" window (which this row was meant to replace) was the more accurate one all along. Peak-to-trough: Nifty fell ~10.4% off the Sep 2024 high at its worst, with Oct 2024 alone down 6.2% on record FPI outflows (₹94,017cr sold that month, a 12-year low for FPI equity holding) despite domestic buying cushioning the fall; Ayush's "~16%" figure is plausible for the full Sep-Mar drawdown including the slower Nov-Mar grind, not just the Oct leg. |
| Trump tariff shock (2025) | **2 Apr – 15 Apr 2025** (verified, was "exact window TBD") | CRASH | Trump's "Liberation Day" reciprocal tariffs (26% on India) were announced 2 Apr 2025 (market actually closed *up* that day — the shock hit the next session); deepest single-day crash ("Black Monday") was **6-7 Apr 2025** (Sensex -2.95%/Nifty -3.24% on the 7th, ~₹16 lakh crore wiped out); Trump's 90-day tariff-pause announcement (9 Apr) sparked the rebound; by **15 Apr 2025** Nifty/Sensex had fully recouped all losses since 2 Apr, outpacing global peers. A clean ~2-week V-shape, confirming Ayush's "sharp crash and rebound" description. |
| US-Iran war (2026) | From 28 Feb 2026, **ongoing, no end date yet** | CRASH | Multi-phase — do not model as one flat window. Full design in its own subsection below; this row is the parent/group row only. |

**B. Bull runs and recoveries** (new category — the original table had none)

| Scenario | Window | `scenario_type` | Notes |
|---|---|---|---|
| 2003-07 India bull run | Apr 2003 – Jan 2008 | BULL_RUN | Sensex ~6-7x. Tests secular-rally compounding. |
| Post-GFC rebound | Mar 2009 – Nov 2010 | BULL_RUN | V-shaped recovery, rewards staying invested through GFC's trough. |
| Post-COVID bull run | Mar 2020 – Oct 2021 | BULL_RUN | **Not actually already on the list** (see reconciliation note above) — net-new despite Ayush describing it as already present. **Verified: Nifty rose from its 23 Mar 2020 low (~7,511) to ~18,600 by Oct 2021 — a confirmed ~140-145% gain** (sources cite anywhere from 128% to 145% depending on the exact reference points used), corroborating Ayush's "+140%" figure rather than contradicting it. Small caps and new-age IPOs ran far ahead of this headline number. |
| 2023 – Sep 2024 broad rally | Jan 2023 – Sep 2024 | BULL_RUN | Midcap/smallcap + SIP-boom phase. Tests whether the portfolio kept pace or lagged the rally. Not independently re-verified against a primary source beyond the Sep 2024 peak date confirmed above (26,277.35 on 27 Sep 2024) — no discrepancy found, just not a dedicated search target this pass. |
| Gold and silver rally (2024-26) | 2024 – **ongoing, verified still live** | BULL_RUN | Shows what a precious-metals allocation would have captured. **Verified ongoing as of this check**: gold +23% (2024), then +60%+ (2025, record highs through the year), continuing to a fresh all-time high ($5,595/oz) as recently as **29 Jan 2026**; silver breached ₹2 lakh/kg in Dec 2025 (~+130% for 2025 alone). Some analysts now flag 2026 consolidation/profit-booking risk, but no reversal has occurred — `is_ongoing = true` confirmed correct, needs the same periodic recompute treatment as the US-Iran war, not a one-time backfill. |

**C. Political, policy and rate shocks** (new category — Budget 2018 LTCG moved here too, see its row above)

| Scenario | Window | `scenario_type` | Notes |
|---|---|---|---|
| 2004 election result | 17 May 2004 (single day) | POLICY_RATE | **Verified, correcting Ayush's "~-11%" figure**: Sensex actually fell **-15.52%** that day (to 4,282.98, its biggest single-day crash in history at the time), while Nifty fell even further, **-17.47%**. The market-wide circuit breaker was triggered **twice** in one session (trading halted first after an 11% open, resumed, then halted again), one of only a handful of times this breaker has ever fired. Trigger: NDA's surprise election defeat, fear of Left-supported coalition policy reversal. |
| 2024 election result | 4 Jun 2024 (single day) | POLICY_RATE | **Verified, Ayush's "~-6%" figure confirmed closely**: Sensex closed **-5.74%** (72,079, off a 6,200-point intraday crash), Nifty closed **-5.93%** (21,885). Recovery was fast and precisely dateable: by **6-7 Jun 2024** (2-3 trading days later) both indices had not just recovered but hit fresh all-time highs, a ~9% intraday swing from the result-day low. Tests panic-selling behaviour specifically — the output framing here should flag "the portfolio that held through this recovered within 2-3 trading days," not just the single-day fall. |
| RBI hiking cycle (2022-23) | **4 May 2022 – 8 Feb 2023** (exact MPC dates verified) | POLICY_RATE | Repo 4.0% → 6.5% over 6 consecutive hikes, confirmed via RBI's own MPC resolutions: 4 May 2022 (+40bps→4.40%), 8 Jun 2022 (+50bps→4.90%), 5 Aug 2022 (+50bps→5.40%), 30 Sep 2022 (+50bps→5.90%), 7 Dec 2022 (+35bps→6.25%), **8 Feb 2023** (+25bps→6.50%, final hike, cycle total +250bps). Tests debt-fund mark-to-market losses — this is a *debt*-category scenario, same family as Taper Tantrum above. |
| Rate cut cycle (2025) | **7 Feb 2025 – 5 Dec 2025** (verified, no longer ongoing) | POLICY_RATE | **Resolves Ayush's "exact end TBD — may still be ongoing" flag: this cycle has definitively ended, it is not `is_ongoing`.** RBI cut repo 6.5%→5.25% in a cumulative 125bps across 2025 (first cut Feb 2025, breaking an 11-meeting hold; last cut 3-5 Dec 2025 MPC). RBI then held 5.25% through four straight 2026 meetings (Feb/Apr/Jun/Aug), before **reversing course entirely on 7 Oct 2026**, hiking back to 5.50% — the first hike in ~4 years, with a 4-2 MPC vote for a "calibrated tightening" stance and a further Dec 2026 hike flagged by analysts as likely. The reverse case (duration funds win) is real and dateable to Feb-Dec 2025 only; anything modelled past Dec 2025 would actually need the *opposite* framing (a renewed tightening scenario), which is out of scope for this row — flagging this as a live, recent reversal so a future reader doesn't assume the cut cycle is still in effect. |

**D. Forward-looking hypotheticals** (new category, new *mechanism* — see the dedicated
subsection below; these are not NAV-replayed at all)

| Scenario | Stated assumption | `scenario_type` |
|---|---|---|
| Strait of Hormuz closure | Crude above $150 | HYPOTHETICAL |
| US recession + Fed pivot | — (assumption TBD at admin-entry time) | HYPOTHETICAL |
| AI/tech valuation bust | US tech -40%, spillover to Indian IT | HYPOTHETICAL |
| Rupee sharp depreciation | Rupee past 105 | HYPOTHETICAL |
| Indian equity "lost decade" | Prolonged sideways market, tests SIP discipline | HYPOTHETICAL |

**Single-day/short-window shocks (Budget 2018 LTCG, both election results):** nothing
schema-wise changes for these — `start_date = end_date` (or a 2-3 day window) just means
Step 2's "fall from first NAV in window to lowest NAV in window" collapses to "fall from
the prior trading day's NAV to this one." No special-casing needed in the compute engine,
only a note so a future reader doesn't assume every scenario needs a multi-week window.

### Documentation for adding scenarios later

A reference doc (not yet written) covering: the fields needed (now including
`scenario_type`, and for HYPOTHETICAL rows the assumption table instead of dates), how to
verify a real peak-to-trough window (cross-check 2+ sources, prefer NSE's own index
history over secondary blog aggregations), how to decide if a new event needs multi-phase
modelling (does the market move in genuinely distinct legs with a reversal in between, like
US-Iran, or is it one continuous move), and a worked example of each of the three scenario
shapes (plain historical, multi-phase historical, hypothetical) — so a future "add
scenario X" request has a template to follow regardless of which shape it is.

### Data architecture — Option B (precomputed per-scenario table), confirmed over
Option A (live per-request query)

Ayush confirmed: **one shared table per scenario** (NOT per-user, NOT per-portfolio) —
every portfolio's stress-test just filters the same precomputed dataset down to its own
holdings. This also gives a standalone "which funds did best/worst in this scenario"
leaderboard view for free, as a side effect of the same data.

**Step 1 — one-time NAV backfill (scenario-count-independent).** `mfapi.in` returns a
scheme's *entire* NAV history in one call (confirmed by reading `nav.py`), so warming a
scheme's history once covers every scenario's date window simultaneously — this cost is
paid exactly once, regardless of whether there are 4 scenarios or 31.
- Scope: all rows in our own `schemes` table (today, `nav_history` is only warmed for
  schemes someone actually holds, per `refresh_nav_daily.py`'s `Folio` join) — **not**
  `mfapi.in`'s full universe (37,939 scheme codes live-checked 2026-10-08, going back to
  schemes that matured/closed decades ago). Our `schemes` table only carries today's live
  AMFI scheme master, so this is bounded to its real row count, not `mfapi.in`'s — proxy
  mapping already covers pre-existence via category/asset-class averages, so there's no
  need to also backfill every historically-closed scheme `mfapi.in` happens to still
  serve.
- **Real row counts, live-verified 2026-10-08** (staging bastion started for this
  check, SSM-tunnel + `psql`, then re-stopped afterward): `schemes` = **14,380** total
  (14,357 `is_active = true`) — matches the doc's prior ~14,354 estimate almost exactly.
  `nav_history` = **6,310,268** rows today, across only **3,842** distinct schemes (the
  held-schemes-only scope `refresh_nav_daily.py` already warms) — an average of ~1,642
  rows/scheme already backfilled. **10,538 schemes (14,380 − 3,842) currently have zero
  `nav_history` rows** — that's the actual Step 1 target set, not all 14,380 (the 3,842
  already-warmed schemes are skipped automatically by the resumability logic below, since
  a scheme's first-ever fetch already pulls its *complete* history, not a partial window —
  confirmed by reading `_fetch_nav_history_uncached`, which has no date-range parameter).
  At the already-observed ~1,642 rows/scheme average, the real remaining backfill is
  ≈10,538 × 1,642 ≈ **17.3M new rows** — in the same order of magnitude as the original
  "~20-30M" guess, but now grounded in a real number instead of a napkin estimate.

**`mfapi.in` dependency — investigated in detail, 2026-10-08, per Ayush's explicit
instruction to check this before anything else.** Ayush had heard `mfapi.in`'s pipeline
may have shifted to `portal.amfiindia.com`. Verified directly, not guessed:
- `portal.amfiindia.com` is real, but it is **not a developer-facing NAV API** — it's
  AMFI's own site (same old frameset-based `amfiindia.com` design, now served from this
  domain). What moved there is AMFI's raw plain-text NAV dump
  (`.../spages/NAVAll.txt`), the file third-party scrapers like `mfapi.in` parse as their
  own upstream source — confirmed live: `amfiindia.com/spragmt/NAVAll.txt` now 302-
  redirects to `portal.amfiindia.com/spages/NAVAll.txt`.
- AMFI changed that file's own column layout in Aug 2026 (6-column →
  8-column, splitting Plan/Option out of the scheme-name field) as part of the same
  redesign, and is sunsetting the **old 6-column format entirely on 30 Sep 2026**
  (AMFI's own [NAV Download page](https://www.amfiindia.com/net-asset-value/nav-download)).
  A public GitHub issue ([portfolio-performance/portfolio#5961](https://github.com/portfolio-performance/portfolio/issues/5961))
  reports this broke several NAV-consuming tools, including a claim that `mfapi.in`
  itself "stopped receiving new NAVs after 18-Aug-2026."
- **Live-tested against our own target, not taken on faith:** hit `api.mfapi.in/mf/118834`
  directly — returned NAVs dated 07-10-2026 and 06-10-2026 (i.e. the last two business
  days as of this check), with **zero gap around the reported 18-Aug-2026 breakage
  window** (checked day-by-day; 17-Aug through 21-Aug all present and consecutive). Same
  clean, continuous result on a second, unrelated scheme. `mfapi.in`'s own maintainers
  evidently already patched their AMFI-format parser for the Aug column change — the
  GitHub issue describes a real, since-resolved incident, not a current outage.
- **Conclusion: no design change.** `mfapi.in` remains the right source — it's confirmed
  live, current, and already resilient to AMFI's own format churn (which is exactly the
  kind of fragile raw-text parsing Unifolio would otherwise have to reimplement itself if
  it hit `portal.amfiindia.com/spages/NAVAll.txt` directly; that file also hard-caps a
  single historical-NAV download request at 90 days, far worse for a bulk backfill than
  `mfapi.in`'s one-call-per-scheme full history). **Flagged as an accepted, monitored
  external-dependency risk, not a blocker**: `mfapi.in` is free/unofficial/undocumented
  and has already had at least one format-driven hiccup this year — the batching design
  below includes a circuit breaker specifically so a *future* recurrence surfaces loudly
  instead of silently corrupting the backfill.

### Step 1 batching strategy — step-by-step, phase-by-phase, one-time, isolated from
production

Ayush's core concern: *"we try to get all the 20-30 million rows at once, it's gonna not
work... let's not break our API and break everything."* Answered point by point:

**1. Runs as its own isolated one-off process, never inside the live API.** New script
`backend/scripts/jobs/backfill_scheme_nav_history.py`, structured exactly like
`refresh_nav_daily.py` (own `SessionLocal()`, own `asyncio.run`, own module-level
`_nav_http_client` singleton inside `nav.py` since that's a process-global, not shared
across processes). Launched as a **manual one-off ECS Fargate RunTask** on the same task
definition/cluster the scheduled jobs already use (`aws ecs run-task`, not an
EventBridge schedule — this only ever runs once, plus rare small top-ups, so it doesn't
need its own `locals.jobs` entry). Because it's a separate OS process, it does **not**
compete with the live backend's own request-handling connection pool for production
traffic — the only things it actually shares with production are (a) `mfapi.in`'s
servers, and (b) the RDS instance, both addressed below.

**2. Fixed scheme list, fetched once up front.** `SELECT * FROM schemes` (no join
needed — unlike `refresh_nav_daily.py`'s held-schemes-only scope, this wants the whole
master) ordered deterministically by `id` so repeated runs chunk identically.

**3. Resumable by construction, no new table.** Before chunking, run
`SELECT DISTINCT scheme_id FROM nav_history` once and subtract that set from the full
scheme list — whatever's left is "still needs backfilling." A process killed, OOM'd, or
deliberately stopped partway through loses nothing: re-running the same script just picks
up the remaining schemes. No separate progress-tracking table, no manual checkpoint
bookkeeping — `nav_history` itself *is* the checkpoint.

**4. Batch size ~150 schemes, processed strictly sequentially, one batch at a time —
never the whole list concurrently.** Each batch calls the **existing, unmodified**
`warm_nav_history(db, batch)` — no new fetch/parse/upsert logic, this reuses the exact
function the daily job and category-ranking already run in production. `~150` keeps a
single batch's concurrent-fetch burst at roughly the shared `httpx.AsyncClient`'s own
100-connection cap, rather than firing all 14k+ coroutines into the event loop at once (the
real "20-30M rows in memory at once" risk: `warm_nav_history` gathers all of a batch's
fetched rows in memory before its one grouped commit, so batch size directly bounds peak
memory — ~150 schemes × ~5,000 rows/scheme worst case ≈ 750K rows in flight at any one
moment, not 20-30M).

**5. One commit per batch (already how `warm_nav_history` works) = a natural
checkpoint boundary.** If the process dies mid-run, only the *current* batch's unwritten
rows are lost — everything already committed in prior batches survives untouched, and
point 3's resumability picks the dropped batch back up on the next run.

**6. Deliberate pacing between batches — a fixed 2-3 second sleep after each batch's
commit.** Turns continuous hammering into visibly separated waves hitting `mfapi.in`,
each wave capped near its own connection limit rather than an unbroken flood. For the
real **10,538-scheme** target ÷ ~150/batch ≈ **71 batches**, wall-clock is still
dominated by real fetch latency (the existing 2-6 hour estimate), but now from an
explicit, inspectable loop instead of a hand-waved "throttle it."

**7. Circuit breaker — abort (not silently continue) if a batch's failure rate is high.**
Track successes/failures per batch (`warm_nav_history` already logs this shape); if a
single batch sees >25% of its schemes fail to fetch, log loudly and stop the whole run
rather than ploughing through what might be `mfapi.in` rate-limiting or blocking this IP.
Safe to abort because of point 3 — re-running later (once whatever triggered it clears)
just resumes from the same unprocessed set, no re-fetch of what already succeeded.

**8. Progress visibility.** One `logger.info` per batch: `batch N/71, X/10,538 schemes
done (Y%), Z failures this batch, elapsed so far`. Mirrors the existing
`warm_nav_history`/`refresh_nav_daily.py` logging pattern — no new tooling.

**9. Scheduling window (staging).** Run manually at a time clear of two things: (a) the
cluster of existing 06:00-06:30 UTC (11:30 AM-12:00 PM IST) jobs
(`nav_daily`/`scheme_master_daily`/`benchmark_daily`/`analytics_recompute_daily`), so this
one-off backfill isn't itself a second concurrent `mfapi.in` consumer from the same NAT
IP at the same moment as the daily job; (b) staging's 9 PM-5 AM IST nightly
stop window (RDS/backend/`fck-nat` are off then, so the task can't even run). Any
daytime slot outside that cluster works.

**10. This genuinely is a one-time job, confirmed.** Once every scheme in `schemes` has
≥1 `nav_history` row, re-running the script is a no-op (point 3's resumability finds
nothing left to do) except for the trivial top-up case of newly-listed schemes added by
`scheme_master_daily` after this run — those get picked up by the same script,
cheaply, on an occasional re-run, not a full 2-6 hour repeat. The *only* other
recurring work already documented elsewhere (Step 2, not Step 1) is periodic
re-computation for `is_ongoing` scenarios (e.g. US-Iran's open Phase 3) as new NAV data
arrives day to day.

- AWS cost: Fargate compute a few cents–$2 one-time; storage <$0.50/month ongoing. Both
  negligible, and **unaffected by scenario count** — the backfill doesn't get bigger with
  more scenarios.

**Step 2 — per-scenario fall-% table (scales with scenario count, but trivially).** Reuses
`category_ranking.py`'s `_bulk_nav_on_or_before` bounded-query pattern across the full
scheme master instead of one category. ~14,354 rows per scenario; 15 scenarios ≈ 215,000
rows total — an order of magnitude smaller than Step 1's NAV rows. Computation: seconds
per scenario, a minute or two total for 15. Permanent storage, not a TTL cache — a
historical scenario's numbers never change once computed.

**Step 3 — serving a user's stress test (steady-state, forever after).** One indexed
`SELECT` filtered to the scenario and the portfolio's held schemes. Sub-200ms, same cost
class as existing holdings/category-ranking endpoints, no live NAV computation, no
network call. This is the entire reason to precompute.

### Schema extension, 2026-10-08 — scenario taxonomy, phases, proxy flag, curation rank

Everything below extends Option B's existing tables; nothing here changes Step 1 (the
scheme-wide NAV backfill) or the overall precompute-once/serve-cheap shape — it only adds
columns/tables Step 2 and Step 3 read and write.

```sql
-- Extends the existing `scenarios` table (today: name, start_date, end_date, description)
ALTER TABLE scenarios
  ADD COLUMN scenario_type TEXT NOT NULL DEFAULT 'CRASH'
    CHECK (scenario_type IN ('CRASH', 'BULL_RUN', 'POLICY_RATE', 'HYPOTHETICAL')),
    -- Matches Ayush's 4 categories exactly. Doubles as the historical-vs-hypothetical
    -- switch: HYPOTHETICAL is the ONLY value that skips NAV replay entirely (see below) —
    -- no separate boolean needed, one field does both jobs.
  ALTER COLUMN end_date DROP NOT NULL,
    -- Needed for is_ongoing scenarios (US-Iran war, gold/silver rally, rate cut cycle)
    -- where there is no end yet.
  ADD COLUMN is_ongoing BOOLEAN NOT NULL DEFAULT false,
    -- true = this scenario (or phase) hasn't concluded. Step 2 must re-run for these on
    -- every scheduled refresh (piggyback on the existing daily NAV job's schedule) until
    -- flipped false by whoever maintains the scenario library.
  ADD COLUMN display_rank INTEGER NULL,
    -- NULL = exists, computed, queryable via "More scenarios" but not a curated picker
    -- card. Non-NULL = shown as a curated card, ordered ascending. See the Picker
    -- curation subsection for which scenarios get a rank.
  ADD COLUMN parent_scenario_id UUID NULL REFERENCES scenarios(id),
  ADD COLUMN phase_label TEXT NULL,
    -- e.g. 'Shock', 'Partial recovery', 'Relapse'. Set only when parent_scenario_id IS NOT NULL.
  ADD COLUMN phase_order INTEGER NULL;
    -- Display order of phases under their parent card.

-- Per-scheme precomputed result, extended with the proxy flag (Step 2's output table)
CREATE TABLE scenario_scheme_results (
  scenario_id   UUID NOT NULL REFERENCES scenarios(id),
  scheme_id     UUID NOT NULL REFERENCES schemes(id),
  pct_change    NUMERIC(6, 2) NULL,
    -- NULL only in the "no comparable data at all" edge case (see proxy mapping below) —
    -- never a fabricated number standing in for "we don't actually know."
  is_proxied    BOOLEAN NOT NULL DEFAULT false,
  proxy_basis   TEXT NULL,
    -- e.g. 'sebi_category_average:Equity Scheme - Large Cap Fund', or
    -- 'asset_class_average:Equity', or 'no_comparable_data'. NULL when is_proxied = false.
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scenario_id, scheme_id)
);
-- Invariant Step 2 must guarantee: every active scheme in the scheme master gets exactly
-- one row per non-hypothetical scenario — real or proxied, never a missing row. This
-- keeps Step 3's serving query branch-free: it never needs an "is there a row at all"
-- fallback, only an "is_proxied" display check.

-- Category-level averages, computed BEFORE the proxy pass reads them (Step 2a below)
CREATE TABLE scenario_category_averages (
  scenario_id     UUID NOT NULL REFERENCES scenarios(id),
  sebi_category   TEXT NOT NULL,
  avg_pct_change  NUMERIC(6, 2) NOT NULL,
  scheme_count    INTEGER NOT NULL,  -- how many REAL (non-proxied) schemes fed this average
  PRIMARY KEY (scenario_id, sebi_category)
);

-- Hypothetical-scenario assumptions (admin-entered, see mechanism below)
CREATE TABLE scenario_hypothetical_assumptions (
  scenario_id        UUID NOT NULL REFERENCES scenarios(id),
  asset_class        TEXT NOT NULL CHECK (asset_class IN ('Equity', 'Debt', 'Hybrid', 'Other')),
  assumed_pct_change NUMERIC(6, 2) NOT NULL,
  assumption_note    TEXT NOT NULL,  -- mandatory, shown in the UI next to the number
  PRIMARY KEY (scenario_id, asset_class)
);
```

`asset_class` reuses the existing `asset_class_bucket()` helper
(`app/services/dashboard/allocation_labels.py`, already used for allocation breakdowns —
maps a scheme's `sebi_category` string to one of `Equity`/`Debt`/`Hybrid`/`Other` via
simple substring checks) — not a new taxonomy. This is the same reuse pattern as
attributes 04/12/14: check for an existing helper before inventing a classification.

### Multi-phase scenario model — worked example: US-Iran war

A scenario "group" is a normal `scenarios` row (`parent_scenario_id IS NULL`) whose
`start_date`/`end_date` span the entire event, used for the single top-level picker card
and a whole-event summary number. Each phase is a separate `scenarios` row with
`parent_scenario_id` pointing at the group, its own `start_date`/`end_date`, and a
`phase_label`/`phase_order`. Phases go through Step 1/2's compute pipeline exactly like any
other scenario — **no special-casing in the compute engine itself**, only in how the API
groups rows for the UI (one card, expandable into per-phase numbers).

Confirmed via a live check today (2026-10-08, see Sources below) before writing any of
this, per Ayush's explicit instruction not to guess: the war is **still ongoing**, no
ceasefire in force, talks stalled, further strikes "possible" post-US-midterms. So:

| Row | `phase_label` | Window | Basis |
|---|---|---|---|
| Group | — | 28 Feb 2026 → **NULL (ongoing)** | Whole-event card |
| Phase 1 | Shock | 28 Feb 2026 – 2 Apr 2026 | Sensex/Nifty ~-12% by 2 Apr; US crude +27% to ~$115 in early March |
| Phase 2 | Partial recovery | 2 Apr 2026 – 8 Jul 2026 | Markets rallied sharply 12 Jun when Trump declared the war over |
| Phase 3 | Relapse | 8 Jul 2026 → **NULL (ongoing)** | Nifty fell >2% on 8 Jul when the interim deal was called off, rupee past 95.50; per the 2026-10-08 check, still unresolved — low-intensity fighting continuing, no ceasefire, further strikes flagged as possible |

`is_ongoing = true` on both the group and Phase 3 rows. Because of this, Phase 3 is not a
one-time backfill-and-done scenario like the rest of the library — it needs the same
periodic recompute as the Gold/silver rally (confirmed above, also still ongoing), re-
running Step 1/2 for just this scenario on a schedule until someone flips `is_ongoing` to
`false` once the conflict actually concludes with a verifiable end date. (The Rate cut
cycle, by contrast, is resolved above: it is **not** ongoing — it ended Dec 2025 and has
since reversed into a hiking cycle.)

**Phase-boundary dates verified, 2026-10-08**, against Wikipedia's "Timeline of the 2026
Iran war"/"2026 Iran war ceasefire" articles: the **28 Feb 2026** strikes/shock start date
matches exactly. The event's real course is messier than a clean 3-phase split — there
were actually two ceasefires and a blockade in between (an 8 Apr pause, a 13 Apr naval
blockade, a 21 Apr "indefinite" ceasefire extension, the 17 Jun Islamabad Memorandum, then
collapse starting 6-7 Jul strikes and a confirmed **8 Jul 2026** ceasefire breakdown,
followed by a second blockade from 14 Jul that continues today) — but Ayush's 3-phase
simplification (shock / partial recovery / relapse) is a reasonable compression of this for
stress-test purposes, and its two hinge dates (2 Apr, 8 Jul) both land correctly within the
real timeline (2 Apr is inside the Feb28-Apr7 Strait-closure shock window; 8 Jul is the
Wikipedia-confirmed ceasefire-collapse date). **Not separately verified**: the market-
specific percentages (Sensex/Nifty ~-12% by 2 Apr, crude +27% to ~$115) — no primary NSE/
MCX source was found covering this specific war's market impact in the searches run this
pass; these remain Ayush's own figures, flagged here rather than silently treated as
confirmed. Still genuinely ongoing (low-intensity fighting, no resolution) as of this
check — Phase 3's open `end_date` stands.

### Franklin Templeton wind-up — structurally different from every other crash row

Every other scenario in this library is a broad-market/sector window where the *same*
compute pipeline (fall from pre-window NAV to window-trough NAV) is meaningful for
whichever schemes a household happens to hold. Franklin Templeton's April 2020 wind-up is
not that — it was a liquidity freeze in **6 specific debt schemes** (Franklin's own credit-
risk/low-duration funds), not a market-wide price move. Two things compute from the same
window but mean different things, and both should be shown, not collapsed into one number:

1. **If a household actually holds one of the 6 wound-up schemes:** the real stress isn't a
   NAV fall at all — it's that redemptions were frozen for ~20 months regardless of NAV.
   This needs its own flag on the scheme row (`had_redemption_freeze BOOLEAN`, set by hand
   for exactly these 6 schemes — there is no general mechanism to detect "was this scheme's
   redemption frozen," so this is manual, admin-entered data, same posture as scenario
   dates themselves) rather than being represented purely through `pct_change`. **The 6
   schemes, verified 2026-10-08 (not guessed — see Sources at the end of this section):**
   Franklin India Low Duration Fund, Franklin India Ultra Short Bond Fund, Franklin India
   Short Term Income Plan, Franklin India Credit Risk Fund, Franklin India Dynamic Accrual
   Fund, Franklin India Income Opportunities Fund — all wound up effective 23-24 Apr 2020.
   Match against `schemes.base_name` (same normalized-name matching already built for
   attribute 04, not a new matcher) across every Direct/Regular/Growth/IDCW variant of
   these 6, same "resolve once per scheme family" propagation pattern as attribute 04.
2. **For every other debt-fund holding (the overwhelming majority of households):** the
   scenario still has a meaningful answer — the broader illiquid/credit-risk debt category's
   spread-widening and NAV markdowns in Apr-Jun 2020, computed exactly like any other
   scenario via the standard Step 1/2 pipeline. This is what "tests illiquid debt
   specifically" actually measures for almost every real household running this scenario.

Both pieces use the existing schema (scenario row + `scenario_scheme_results`, plus one new
manually-flagged boolean for the 6 specific schemes) — no new table needed, just a note
that this scenario's *interpretation* at serve time differs from a pure price-replay, and
the frontend copy for this one card needs to say so explicitly rather than presenting a
`pct_change` number as if it were a normal market fall.

Sources (Franklin Templeton wind-up, verified 2026-10-08):
[Value Research — Franklin Templeton winding up six debt funds](https://www.valueresearchonline.com/stories/47970/franklin-templeton-winding-up-six-of-its-debt-funds/),
[Franklin Templeton India — official wind-up page](https://www.franklintempletonindia.com/market-insights/winding-up-of-specific-schemes).

### How every scenario's values actually get filled — no scraping, no new third-party API

Ayush asked this explicitly, so stating it plainly rather than leaving it implied in the
architecture above: **every historical scenario (categories A/B/C) is filled from the same
NAV-history pipeline the product already runs daily** — `mfapi.in` via the existing
`nav.py`/`warm_nav_history` client, the same one `refresh_nav_daily.py` and
`category_ranking.py` already depend on. There is no new data source, no HTML scraping, and
no new external API integration anywhere in this design. The only "fetch" work is Step 1's
one-time full-scheme-master backfill (warming history for schemes nobody holds yet, so
every scenario — past or future-added — can be computed without a fresh network call at
serve time).

**Hypothetical scenarios (category D) fetch nothing at all, from anywhere.** They're pure
arithmetic over data Unifolio already has: the household's current holding value (already
computed by the existing `holdings.py` pipeline) multiplied by an admin-entered assumption
percentage. No API, no NAV lookup, no scrape — this is the one place in the whole design
with zero external dependency.

**Recomputed cost/time for the real scenario count (31, not the original draft's 15) —
AWS-wise, time-wise, efficiency-wise, each addressed directly:**

- **Step 1 (NAV backfill) is unaffected — this is the point of Option B.** Confirmed again
  here since it's easy to miss: Step 1's cost is a function of *scheme count* (~14,354),
  never *scenario count*, because `mfapi.in` returns a scheme's entire history in one call
  regardless of which scenarios will later read from it. Going from 8 scenarios to 31
  changes this step's cost and time by exactly zero. Still the same few-cents-to-$2
  one-time Fargate compute, <$0.50/month ongoing storage, 2-6 hour throttled wall-clock
  run (unchanged from the original estimate).
- **Step 2 (per-scenario fall-% + proxy computation) does scale with scenario count, but
  stays trivial.** Recomputed for 31: ~14,354 schemes × 31 scenarios ≈ 445,000 rows in
  `scenario_scheme_results` (up from the original ~215,000-row estimate for 15) — still an
  order of magnitude smaller than Step 1's 20-30M NAV rows, and still a single indexed
  bulk query per scenario, not a per-scheme round trip. The proxy pass adds two more bounded
  operations per scenario on top of the original single NAV-lookup pass: a `GROUP BY
  sebi_category` aggregation (producing `scenario_category_averages`, ~31 scenarios × ~250
  distinct `sebi_category` values ≈ 7,750 rows total — negligible) and a fill-in pass for
  schemes that failed the real-data check. None of these are per-scheme network calls —
  they're in-process aggregation over data Step 1 already fetched. Realistic estimate:
  low-single-digit seconds per scenario even for the most-proxied cases (dot-com bust, GFC
  — where most of today's schemes didn't exist yet and the category-average/asset-class
  fallback path runs for a larger share of rows), so well under 2 minutes total for all 31
  combined. AWS cost: the same Fargate task already budgeted for Step 1, or — since this
  step is pure DB compute with no outbound network call — could just as easily run as a
  cheap scheduled Lambda; either way, cents, not dollars.
- **Step 3 (serving) is provably unaffected by scenario count.** It was always "one indexed
  `SELECT` filtered to `scenario_id` + held `scheme_id`s" — adding 23 more scenarios adds
  23 more possible values for one `WHERE` clause's parameter, not more work per request.
  Sub-200ms holds regardless of whether the library has 8 or 31 or 100 scenarios.
- **`is_ongoing` scenarios (US-Iran war Phase 3, Gold/silver rally, possibly Rate cut
  cycle) need periodic re-runs of Step 1+2 for just that one scenario**, not the whole
  library — piggyback on the existing daily NAV job's schedule (it already runs daily;
  re-running Step 2 for 2-3 `is_ongoing` scenarios as part of that same job is seconds of
  extra work on an already-scheduled task, not a new job/infra entry).

**Net answer to "how expensive/slow is this now that scenario count nearly quadrupled
(8→31)":** negligible change. The expensive, risk-bearing part was always Step 1 (the
external `mfapi.in` backfill), and that cost was designed from the start to be
scenario-count-independent — which is exactly why Option B was chosen over Option A back
when there were only 8 scenarios. The scenario-count increase only touches Step 2, which
was already the cheap part by an order of magnitude.

### Proxy mapping — the hardest part, per Ayush's own framing ("don't fake precision")

Applies to every non-HYPOTHETICAL scenario. For each scheme in the full scheme master,
against scenario S's window `[start, end]`:

1. **Real data check.** If the scheme's earliest `nav_history` row is on or before
   `start`, it has genuine coverage — compute `pct_change` from real NAV (lowest NAV in the
   window vs. the NAV just before `start`, for crashes/corrections; last vs. first NAV in
   the window for bull runs/recoveries). Insert into `scenario_scheme_results` with
   `is_proxied = false`. This pass runs for **every** scheme first, before any proxy
   lookup — proxies must only ever be built from real data, never from other proxies, or
   the "precision" being faked compounds silently.
2. **Build the category averages** (`scenario_category_averages`): for each `sebi_category`
   present among schemes with real coverage from step 1, average their `pct_change`. This
   table only contains real-data averages.
3. **Category-level proxy.** For every scheme that failed step 1 (launched after `start`,
   or otherwise has no coverage), look up its own `sebi_category` in
   `scenario_category_averages`. If present: insert a row with `is_proxied = true`,
   `pct_change` = that average, `proxy_basis = 'sebi_category_average:<category>'`.
4. **Asset-class-level fallback.** If the scheme's own `sebi_category` has zero real
   schemes for this scenario (common for very old scenarios like the dot-com bust, where
   whole categories didn't exist yet), fall back to the broader `asset_class_bucket()`
   grouping (Equity/Debt/Hybrid/Other) computed the same way from real data, flagged
   `proxy_basis = 'asset_class_average:<bucket>'`.
5. **Honest "no data" floor.** If even the asset-class average has no real schemes to draw
   on, store `pct_change = NULL`, `is_proxied = true`, `proxy_basis = 'no_comparable_data'`.
   The frontend must render this as "not enough historical data to estimate" — **never** a
   synthesized number. This is the literal implementation of "don't fake precision."

**Display rule (frontend, noted here so it isn't lost before the consolidated frontend
pass):** a proxied row's `pct_change` is stored at full precision for auditability, but
shown in the UI rounded to the nearest 5% band with a visibly distinct treatment (e.g. a
"~" prefix and a tooltip: *"[Scheme] didn't exist in [year] — shown using the [category]
average for this period"*). Real (non-proxied) rows show their exact computed number with
no such caveat.

### Hypothetical scenarios (category D) — a genuinely different mechanism, not NAV replay

Historical scenarios replay something that actually happened; hypotheticals haven't
happened, so there is no NAV history to look up for *any* scheme, held or not — the
proxy-mapping machinery above doesn't apply here at all, and isn't needed, since every
scheme is in the same boat.

Mechanism: `scenario_hypothetical_assumptions` holds one row per
(`scenario_id`, `asset_class`) — an admin-entered assumed `%` move for each of the same 4
`asset_class_bucket()` buckets used by the proxy fallback above (deliberately coarse, not
per-`sebi_category`, since a hypothetical is a judgment call about broad asset classes, not
a claim of category-level precision). At serve time, for each held scheme: resolve its
`sebi_category` to an `asset_class` via the existing helper, look up that scenario's
assumption row, and apply `hypothetical_value = current_value * (1 + assumed_pct_change /
100)`. No "trough," no window, no proxy flag — just today's holding value times the stated
assumption.

`assumption_note` is a mandatory field, not optional metadata — Ayush's instruction was
"mark hypotheticals as assumption-driven and state the assumptions." The UI must show this
note next to every hypothetical number, and category D's scenarios are labelled visibly
differently from A/B/C throughout the picker and the results screen (a hard requirement
from Ayush, not a nice-to-have) — e.g. a distinct card border/icon and a persistent banner
("This is a hypothetical scenario based on a stated assumption, not a historical replay")
wherever results are shown.

**Admin-configurability:** these assumption rows are Unifolio-authored judgment calls
(what % would AI/tech stocks plausibly fall, not an externally-sourced fact) — same
DB-backed manual-entry pattern already decided for 09's weights and 11's scenario dates,
not a new precedent. Consistent with the existing manual-entry-precedent-scope boundary:
this is exactly the kind of Unifolio-curated data that pattern was meant for, unlike
externally-sourced facts (e.g. 04's fund managers), which it explicitly does not cover.

### Family-level output — "the differentiator," per Ayush

Builds directly on Step 3's existing per-scheme breakdown; nothing new architecturally,
just a wider `WHERE`/`GROUP BY`. Today's design already scopes serving to "the portfolio's
held schemes" for one viewer; family-level output means scoping to **every household
member's folios**, not collapsing to a single total early:

```sql
SELECT ssr.scenario_id, f.household_member_id, h.scheme_id,
       h.current_value, ssr.pct_change, ssr.is_proxied,
       h.current_value * ssr.pct_change / 100 AS rupee_impact
FROM scenario_scheme_results ssr
JOIN holdings h ON h.scheme_id = ssr.scheme_id
JOIN folios f ON f.id = h.folio_id
WHERE ssr.scenario_id = :scenario_id
  AND f.household_member_id IN (:household_member_ids)
ORDER BY rupee_impact ASC;  -- biggest loss first, surfaces "who/what drove it"
```

(Illustrative — exact join shape depends on the live `holdings`/`folios` schema at
implementation time, not re-verified column-by-column here.) The result set, grouped by
`household_member_id`, is what lets the UI say "this scenario cost the household ₹X, of
which ₹Y came from [Member]'s holding in [Scheme]" — surfacing the single biggest
contributor rather than only a blended household total. This is explicitly **not** the
Family Liquidity Stress Test Ayush mentioned as a future, separate feature — this is just
running the existing per-scheme stress test across the whole household instead of one
member's portfolio, which this design already gives for free. The Liquidity Stress Test
itself is out of scope here and not designed in this pass.

### Picker curation — capped at 6-8 cards, per Ayush's "insight, not methodology" principle

`display_rank` (schema above) is the entire mechanism — no separate "featured" flag, no
`LIMIT` clause masquerading as curation. API shape: `GET /scenarios?curated=true` returns
only rows with `display_rank IS NOT NULL`, ordered ascending; `GET /scenarios` (or an
`?all=true` variant) returns everything, for the "More scenarios" expansion. Phase rows
never get their own `display_rank` — only group/standalone scenarios appear in the picker;
phases surface only after a card is opened.

**Default curated set, confirmed 2026-10-08 (Ayush: "keep it just anything that you feel is
correct"):** COVID crash, 2022 global tightening, GFC (2008), Post-COVID bull run, Franklin
Templeton wind-up (the illiquid-debt showcase), Adani-Hindenburg (concentration showcase),
US-Iran war (ongoing, most currently-relevant), AI/tech valuation bust (lead hypothetical,
clearly labelled as such). Mixes crash/bull/ongoing/hypothetical deliberately rather than
curating 8 crashes. Every other scenario in the library is still fully computed and
servable, just reached via "More," not shown as a default front card. **Decided, not open
— the 8 `display_rank` values above are final for this pass** (revisit only if real usage
data later suggests a different default mix, same posture as every other "revisit once
there's real data" item in this sub-project).

### Compliance framing — implement now, remove only if the SEBI consultant objects

Ayush's instruction (2026-10-08 follow-up): implement the "what you'd have captured, not a
prediction" framing now, and remove it later only if his SEBI consultant's review says to —
not block the build on that review. Working copy, now the shipped default: *"Here's what
this portfolio would have captured during [period], based on actual historical fund
performance — not a prediction of future returns."* Same framing extends to every
historical scenario, not just bull runs (crash scenarios already read as "replay," but the
same disclaimer line should appear everywhere a historical % is shown, for consistency).
**Still genuinely open, carried forward, not resolved here:** the actual SEBI consultant
review itself — Ayush's own words were conditional ("if you want to remove it, we'll
remove it"), meaning the copy above ships as a working default, not a compliance-cleared
final. Whoever does that review later should treat this paragraph as the thing to check,
not assume it was already legally vetted.

### "Correlation X-Ray" — confirmed undefined today, documented with an explicit revisit trigger

Ayush's message calls Adani-Hindenburg "the best showcase for Correlation X-Ray, since
funds and direct stocks both held it" — implying a feature that cross-references a
directly-held stock against the same stock's exposure inside a held fund. **This doesn't
exist anywhere in this planning doc, the gap-analysis doc, or the codebase today.** It
clearly depends on knowing a fund's underlying holdings, which is exactly the
look-through-engine foundation that Sub-project 2 (not this one) is building.
Adani-Hindenburg is fully buildable now as an ordinary fund-level crash scenario regardless
(no dependency) — nothing about attribute 11 waits on this.

Per Ayush's explicit instruction ("make it documented in such a way that it brings it back
once you figure out sub-project 2"), this isn't left as a loose doc note — it's recorded as
a tracked row in `DEFERRED_FEATURES.md`'s PRD-04 table (added 2026-10-08), alongside the
already-listed "Stock-level fund overlap detection" item, which needs the exact same
underlying look-through data. **Revisit trigger, stated explicitly so it's not missed:**
once Sub-project 2's look-through engine is built and a fund's underlying holdings are
queryable, come back to this doc and design "Correlation X-Ray" as a cross-reference view
on top of the Adani-Hindenburg scenario (and any other scenario where a direct stock and a
fund both held the same name) — not before.

Sources (2026-10-08 US-Iran war status check):
[Iran War 2026 — Day 220 Update](https://www.globalsecurity.org/military/ops/iran-war-oprep.htm),
[2026 Iran war](https://en.wikipedia.org/wiki/2026_Iran_war),
[2026 Iran war ceasefire](https://en.wikipedia.org/wiki/2026_Iran_war_ceasefire),
[CBS News live updates](https://www.cbsnews.com/live-updates/iran-war-us-negotiations-strait-of-hormuz-oil/).

### Seed data — ready-to-run INSERT script for the scenario library

So the scenario metadata itself needs no further authoring once this plan is approved —
only date re-verification against a primary source, which can edit this script's literal
values rather than requiring it to be written from scratch. Dates/stats are exactly as
documented in the tables above (Ayush's own figures, not yet independently verified).

```sql
-- Plain (non-phased, non-hypothetical) scenarios: all of category A except US-Iran war,
-- all of B, all of C.
INSERT INTO scenarios (id, name, description, start_date, end_date, scenario_type, is_ongoing, display_rank)
VALUES
  (gen_random_uuid(), 'Dot-com bust', 'Tests IT/tech concentration.', '2000-03-01', '2002-10-31', 'CRASH', false, NULL),
  (gen_random_uuid(), 'Global Financial Crisis (2008)', 'Sensex ~-60% peak-to-trough; crude spiked beforehand.', '2008-01-01', '2008-10-31', 'CRASH', false, 3),
  (gen_random_uuid(), 'Eurozone debt crisis (2011)', 'Slow grind down, weak rupee.', '2010-11-01', '2011-12-31', 'CRASH', false, NULL),
  (gen_random_uuid(), 'Taper tantrum (2013)', 'Rupee ~55->68, bond yields spiked. Tests debt funds/INR exposure.', '2013-05-01', '2013-09-30', 'CRASH', false, NULL),
  (gen_random_uuid(), 'China crash / yuan devaluation', 'EM risk-off.', '2015-08-01', '2016-01-31', 'CRASH', false, NULL),
  (gen_random_uuid(), 'Demonetisation (2016)', 'Domestic cash shock -- real estate, small caps, NBFCs hit hardest.', '2016-11-01', '2017-01-31', 'CRASH', false, NULL),
  (gen_random_uuid(), 'Budget 2018 LTCG reintroduction', 'Tax-policy shock, tests tax-drag modelling.', '2018-02-01', '2018-02-02', 'POLICY_RATE', false, NULL),
  (gen_random_uuid(), 'IL&FS / NBFC crisis (2018)', 'Credit event (27-28 Aug 2018 CP default, 21-24 Sep sector sell-off) + small/midcap drawdown after. Tests credit-risk debt funds.', '2018-08-01', '2018-11-30', 'CRASH', false, NULL),
  (gen_random_uuid(), '2019 pre-COVID slowdown', 'Carried over from the original library.', '2019-06-01', '2019-11-30', 'CRASH', false, NULL),
  (gen_random_uuid(), 'COVID crash', 'Nifty ~-38% in ~45 trading days, from the 20 Jan 2020 ATH (12,430) to the 23 Mar 2020 low (7,511).', '2020-01-20', '2020-03-31', 'CRASH', false, 1),
  (gen_random_uuid(), '2022 global tightening', 'Russia-Ukraine + Fed hikes + record FPI outflows. Nifty ~-18.4% (18,604 to 15,183), new-age tech hit hardest.', '2021-10-01', '2022-06-30', 'CRASH', false, 2),
  (gen_random_uuid(), 'Adani-Hindenburg (2023)', 'Single-group collapse. See the Correlation X-Ray open item.', '2023-01-01', '2023-02-28', 'CRASH', false, 6),
  (gen_random_uuid(), 'SVB / Credit Suisse (2023)', 'Global banking scare, mild India impact.', '2023-03-01', '2023-03-31', 'CRASH', false, NULL),
  (gen_random_uuid(), 'Oct 2024 - Mar 2025 correction', 'Nifty ~-10.4% off its 27 Sep 2024 ATH (26,277), -6.2% in Oct alone on record FPI outflows (Rs94,017cr).', '2024-09-01', '2025-03-31', 'CRASH', false, NULL),
  (gen_random_uuid(), 'Trump tariff shock (2025)', '"Liberation Day" tariffs announced 2 Apr; deepest crash 6-7 Apr (Sensex -2.95%); fully recovered by 15 Apr.', '2025-04-02', '2025-04-15', 'CRASH', false, NULL),
  (gen_random_uuid(), '2003-07 India bull run', 'Sensex ~6-7x. Tests secular-rally compounding.', '2003-04-01', '2008-01-31', 'BULL_RUN', false, NULL),
  (gen_random_uuid(), 'Post-GFC rebound', 'V-shaped recovery, rewards staying invested.', '2009-03-01', '2010-11-30', 'BULL_RUN', false, NULL),
  (gen_random_uuid(), 'Post-COVID bull run', 'Nifty ~+140-145% (7,511 to ~18,600). Small caps and new-age IPOs ran far ahead.', '2020-03-23', '2021-10-31', 'BULL_RUN', false, 4),
  (gen_random_uuid(), '2023 - Sep 2024 broad rally', 'Midcap/smallcap + SIP-boom phase.', '2023-01-01', '2024-09-27', 'BULL_RUN', false, NULL),
  (gen_random_uuid(), 'Gold and silver rally (2024-26)', 'Gold +23% (2024), +60%+ (2025), fresh ATH 29 Jan 2026. Still ongoing, verified 2026-10-08.', '2024-01-01', NULL, 'BULL_RUN', true, NULL),
  (gen_random_uuid(), '2004 election result', 'Sensex -15.52% intraday (to 4,282.98), Nifty -17.47%; market-wide circuit breaker triggered twice.', '2004-05-17', '2004-05-17', 'POLICY_RATE', false, NULL),
  (gen_random_uuid(), '2024 election result', 'Sensex -5.74% (72,079), Nifty -5.93% (21,885); both at fresh ATHs again within 2-3 trading days (by 6-7 Jun). Tests panic-selling behaviour.', '2024-06-04', '2024-06-04', 'POLICY_RATE', false, NULL),
  (gen_random_uuid(), 'RBI hiking cycle (2022-23)', 'Repo 4.0% -> 6.5% over 6 MPC hikes (4 May 2022 to 8 Feb 2023, +250bps total). Tests debt-fund mark-to-market losses.', '2022-05-04', '2023-02-08', 'POLICY_RATE', false, NULL),
  (gen_random_uuid(), 'Rate cut cycle (2025)', 'Reverse case: duration funds win. Repo 6.5%->5.25% (125bps cumulative). Concluded, not ongoing -- RBI reversed to a hike on 7 Oct 2026.', '2025-02-07', '2025-12-05', 'POLICY_RATE', false, NULL);

-- Franklin Templeton wind-up: its own row since it needs the had_redemption_freeze flag
-- (see its subsection above) rather than being treated as a plain price-replay scenario.
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS had_redemption_freeze_schemes TEXT[] NULL;
INSERT INTO scenarios (id, name, description, start_date, end_date, scenario_type, is_ongoing, display_rank, had_redemption_freeze_schemes)
VALUES (
  gen_random_uuid(), 'Franklin Templeton wind-up (2020)',
  'Debt fund liquidity freeze, kept separate from COVID to test illiquid debt specifically.',
  '2020-04-01', '2020-06-30', 'CRASH', false, 5,
  ARRAY['Franklin India Low Duration Fund', 'Franklin India Ultra Short Bond Fund',
        'Franklin India Short Term Income Plan', 'Franklin India Credit Risk Fund',
        'Franklin India Dynamic Accrual Fund', 'Franklin India Income Opportunities Fund']
);

-- US-Iran war: group + 3 phases (multi-phase model). Dates per the 2026-10-08 WebSearch
-- check -- Phase 3's end_date is genuinely NULL (war ongoing), not a placeholder.
WITH us_iran_group AS (
  INSERT INTO scenarios (id, name, description, start_date, end_date, scenario_type, is_ongoing, display_rank)
  VALUES (gen_random_uuid(), 'US-Iran war (2026)',
          'Multi-phase -- see phases. Verify current status again before treating as closed.',
          '2026-02-28', NULL, 'CRASH', true, 7)
  RETURNING id
)
INSERT INTO scenarios (id, parent_scenario_id, name, description, start_date, end_date, scenario_type, is_ongoing, phase_label, phase_order)
SELECT gen_random_uuid(), id, name, description, start_date, end_date, 'CRASH', is_ongoing, phase_label, phase_order
FROM us_iran_group, (VALUES
  ('US-Iran war -- Shock', 'Sensex/Nifty ~-12% by 2 Apr; US crude +27% to ~$115 in early March.', DATE '2026-02-28', DATE '2026-04-02', false, 'Shock', 1),
  ('US-Iran war -- Partial recovery', 'Markets rallied sharply 12 Jun when Trump declared the war over.', DATE '2026-04-02', DATE '2026-07-08', false, 'Partial recovery', 2),
  ('US-Iran war -- Relapse', 'Nifty fell >2% on 8 Jul when the interim deal was called off; rupee past 95.50. Still unresolved as of 2026-10-08.', DATE '2026-07-08', NULL, true, 'Relapse', 3)
) AS phases(name, description, start_date, end_date, is_ongoing, phase_label, phase_order);

-- Category D -- hypothetical scenarios. No start/end dates; assumptions filled in next.
INSERT INTO scenarios (id, name, description, start_date, end_date, scenario_type, is_ongoing, display_rank)
VALUES
  (gen_random_uuid(), 'Strait of Hormuz closure', 'Crude above $150.', NULL, NULL, 'HYPOTHETICAL', false, NULL),
  (gen_random_uuid(), 'US recession + Fed pivot', 'Assumption TBD at admin-entry time.', NULL, NULL, 'HYPOTHETICAL', false, NULL),
  (gen_random_uuid(), 'AI/tech valuation bust', 'US tech -40%, spillover to Indian IT.', NULL, NULL, 'HYPOTHETICAL', false, 8),
  (gen_random_uuid(), 'Rupee sharp depreciation', 'Rupee past 105.', NULL, NULL, 'HYPOTHETICAL', false, NULL),
  (gen_random_uuid(), 'Indian equity "lost decade"', 'Prolonged sideways market, tests SIP discipline.', NULL, NULL, 'HYPOTHETICAL', false, NULL);

-- Example assumption rows for the one curated hypothetical (AI/tech valuation bust) --
-- a template for the admin filling in the other 4's assumed_pct_change/assumption_note.
INSERT INTO scenario_hypothetical_assumptions (scenario_id, asset_class, assumed_pct_change, assumption_note)
SELECT id, asset_class, pct, note FROM scenarios, (VALUES
  ('Equity', -22.0, 'Assumes Indian equity falls ~55% as much as a 40% US tech crash, via IT-sector spillover, not a 1:1 move.'),
  ('Debt', -2.0, 'Minor mark-to-market drag from a broader risk-off move; not the primary channel.'),
  ('Hybrid', -12.0, 'Blended from the Equity/Debt assumptions above at a typical 60/40 hybrid mix.'),
  ('Other', -22.0, 'Treated like Equity for gold/commodity-adjacent funds pending a sharper assumption.')
) AS a(asset_class, pct, note)
WHERE scenarios.name = 'AI/tech valuation bust';
```

Not yet run anywhere — this is the script to execute via the existing SSM-tunnel +
`psql`/DBeaver access pattern once the dates above have had their primary-source
verification pass (or sooner, if Ayush would rather seed now and correct dates in place
later — either order works since `UPDATE scenarios SET start_date = ... WHERE name = ...`
is a one-line fix per row, not a re-plan).

### Testing/safety sequencing before the backfill ever runs — planned now, executed later

Ayush's explicit instruction: proper, careful testing before touching the real API at
scale, and the backfill must never risk disrupting staging testers or the production
daily NAV job. Agreed sequencing, **none of which has been executed yet**:

1. **Spike runs from local dev only, never staging.** Hits the real `mfapi.in` (has to be
   real to get honest numbers) but writes to the local DB only, over the local machine's
   own egress IP — not the AWS NAT gateway IP staging and the production daily job share.
   Even a worst-case block from `mfapi.in` during this spike has zero effect on staging
   or the daily job, since the egress paths are completely separate.
2. **Small, controlled batch first** — ~200-500 schemes not currently held by any staging
   user, timed and logged (fetch latency, error/429 rate, any throttling signal) — before
   ever considering the real 10,538-scheme target.
3. **Only after that comes back clean** does running the real backfill get proposed — via
   the "Step 1 batching strategy" design above (resumable, 150-scheme batches, circuit
   breaker, scheduled clear of the 06:00-06:30 UTC job cluster), as its own off-hours
   one-off Fargate task, never run ad hoc during a window testers might be active in.
4. **Staging's `nav_history` is never touched by the spike** — the real backfill, when
   eventually scheduled, is the first and only thing in this whole plan to touch staging.

**Open items needing real verification before committing to the backfill:**
- ~~Real current `nav_history` row count~~ — **done, 2026-10-08**: see the "Real row
  counts, live-verified" paragraph above (14,380 schemes, 10,538 still need backfilling).
- Real `mfapi.in` throughput/rate-limit behavior under sustained load (the local-only
  spike above) — still not done; this is the one item in this sequencing that a doc-only
  pass can't substitute for.
- ~~Each scenario's exact date range, verified against a primary source~~ — **done,
  2026-10-08**: every historical/policy row in the scenario library table above now
  carries verified windows/stats (cross-checked via Wikipedia, Business Standard, Business
  Today, RBI's own MPC press releases, and contemporaneous reporting — not NSE's raw index
  API directly, which wasn't accessed in this pass, but multiple independent secondary
  sources agreeing on the same figures). Five rows changed from Ayush's original figures
  (IL&FS window, COVID crash start date, Oct2024-Mar2025 peak date/window, Trump tariff
  shock's exact window, 2004 election's exact %), each flagged inline in its row rather than
  silently corrected; the rest (2022 tightening, 2024 election, RBI hiking cycle, post-COVID
  bull run) were confirmed as stated, no correction needed. A true NSE-own-index-history
  pull (rather than secondary-source cross-checking) remains a nice-to-have, not a blocker —
  flag if Ayush wants that extra rigor before the real backfill runs.
- US-Iran war Phase 3's end date specifically, since the conflict is confirmed still
  unresolved as of this pass (2026-10-08) — cannot be locked until it actually concludes.
  Phase boundary dates themselves are now verified against Wikipedia's war timeline (see
  the dedicated subsection); only the market-specific percentages remain unverified.
- ~~Gold/silver rally and Rate cut cycle (2025): confirm whether each should be marked
  `is_ongoing = true` or has in fact already concluded.~~ — **done, 2026-10-08**: Gold/
  silver rally confirmed still ongoing (`is_ongoing = true` stands, fresh ATH as recently as
  29 Jan 2026). Rate cut cycle resolved the other way — it is **not** ongoing, it ended Dec
  2025 and has since reversed into a tightening cycle (7 Oct 2026 hike); window is
  7 Feb 2025 – 5 Dec 2025, `is_ongoing = false`.
- Franklin Templeton's 6 specific wound-up schemes, to manually flag
  `had_redemption_freeze` on — a short, fixed list, not a general mechanism.
- Ayush's sign-off on the proposed 8-scenario curated picker set, and his SEBI
  consultant's review of the bull-run/historical-replay framing (both flagged as open in
  their own subsections above, not decided unilaterally here).

---

## Attribute 04 — Fund manager allocation

### The gap-analysis doc's framing was wrong, corrected 2026-10-08

§3 bucket C originally described this as "same shape of problem as AMC TER disclosures
already solved by `amfi_ter_client.py`'s pattern." Checked directly and that's false: TER
has one official AMFI bulk JSON endpoint covering every scheme at once. Fund manager
name/role/tenure has **no AMFI or SEBI bulk JSON/API source at all** — confirmed by
checking AMFI's own `research-information` page tree (no SID/KIM/scheme-document link
anywhere in it) and searching for a hidden JSON endpoint behind any AMFI scheme-document
search widget (none found, unlike the TER/TRI precedents this session where that exact
kind of hidden-API search paid off).

### Explicitly ruled out, per Ayush's direction (not a flaky-third-party dependency)
- `mf.captnemo.in` — re-exports Kuvera's own dataset, Kuvera-listed funds only, no
  tenure/role field, site's own docs say "accuracy of data is not guaranteed."
- Parse.bot's unofficial MFCentral API wrapper — paid/credit-metered, ~6,000 of ~14,354
  schemes (MFCentral itself seems to only list actively-distributed retail schemes), and
  is itself a third-party scraper-as-a-service over a site that actively 403s a plain
  unauthenticated fetch (bot-protected) — same flakiness risk class, just paid.
  `mfcentral.com` is nonetheless notable as a *source*: it's CAMS+KFintech's own joint
  RTA platform (same two RTAs behind ~95% of actual AMC record-keeping) and its own
  explore-funds surface does carry a `fundManager` field per the wrapper's description —
  but scraping it directly inherits the bot-protection/ToS risk, not a clean fit either.
- Value Research Online / Moneycontrol scraping — no official API, standard commercial
  ToS risk, DOM structure not documented/stable, same "flaky scraper" risk class.

### What's actually authoritative and freely available: the Scheme Information Document (SID)
Every scheme's SID is a SEBI-mandated, standardized-format regulatory filing (format
simplified/standardized further effective 2024-04-01) with a dedicated Fund Manager
section (name, other schemes managed, tenure context) — the single legally-authoritative
source, same legal footing as the TER data this codebase already pulls. Individual SIDs
*are* centrally hosted by AMFI itself at `portal.amfiindia.com/spages/{numeric-id}.pdf`
(confirmed via several real examples), not scattered across 44 AMC websites — this part
of the original gap-analysis instinct ("same shape as TER") is directionally right.

**The one real unresolved unknown:** there is no confirmed bulk index mapping
scheme_code/ISIN → that numeric SID PDF id across the full scheme master. Checked AMFI's
own site tree for a hidden JSON API behind a scheme-document search widget (the same kind
of thing that made the TER and TRI builds cheap this session) and found none exposed —
but this was a page-level check, not an exhaustive one. This is the single highest-value
thing to verify before committing to a design, because it decides whether attribute 04 is
"one more well-scoped AMFI bulk-JSON client, PDF-text-extraction step instead of JSON
parsing" (cheap, same shape as TER) or a genuinely harder per-AMC crawl problem.

**Recommended next step (a spike, not yet run):** directly investigate whether AMFI (or
SEBI's own filing system) exposes a bulk SID index — e.g. by inspecting network requests
behind AMFI's actual in-browser SID search UI (if one exists beyond what the page-tree
fetch covered), or checking whether AMC circulars/addenda filed with AMFI reference a
queryable scheme-to-SID mapping. If that comes back empty, the fallback is a per-AMC (not
per-scheme) crawl of each AMC's own "statutory disclosures" page for its SID index — 44
AMCs, not 14,354 schemes, which is a much smaller problem than it first sounds, and each
AMC's SID *filenames/structure* is internally consistent even if the host differs.

### Pipeline shape, once the discovery mechanism is confirmed (not yet designed in detail)
Ayush's explicit direction (2026-10-08): this should be a **scheduled background job
covering the full scheme universe**, same pattern as the existing AMFI/NAV background
jobs — not manual per-scheme entry scaled by user activity. A `scheme_fund_managers`
table (scheme_id, manager_name, role, managing_since) populated by a weekly (or similar
cadence) job that re-fetches/re-parses SIDs and upserts, mirroring `amfi_ter_client.py`'s
upsert idiom. PDF-text-extraction for the Fund Manager section is a new step for this
codebase's *analytics* services, but not a new tooling category overall — CAS import
already does PDF parsing (`casparser`/custom logic) elsewhere in the codebase.

**Full design (schema details, job scheduling, SID-template parsing approach,
discovery-mechanism outcome) deliberately deferred until the discovery spike above is
actually run** — no point designing a parser against an index-discovery mechanism that
might not exist as currently guessed.

## Attribute 04 — deeper research pass, 2026-10-08 (ROI of ruled-out options, MFCentral
official-access clarification, VR/Moneycontrol feasibility, SID-vs-Factsheet deep dive)

Ayush asked for the full comparative picture before closing this attribute down — not
just "which options are ruled out" but how much each would actually have delivered, and a
proper look at the two live leads (official MFCentral access already applied for; direct
scraping of Value Research/Moneycontrol, ToS risk explicitly accepted by Ayush). All of
the below is live-verified this session (curl/WebFetch against the real endpoints), not
secondary-source guessing.

### ROI of the ruled-out options (coverage vs. what they'd actually deliver)

| Option | Coverage | Fields | Real cost |
|---|---|---|---|
| `mf.captnemo.in` | Kuvera-listed funds only (unquantified subset of ~14,354) | Single `fund_manager` string, semicolon-joined for co-managers — no tenure, no role split | Free, but "accuracy not guaranteed" per its own docs; no refresh guarantee |
| Parse.bot MFCentral wrapper | ~6,000 of ~14,354 schemes (MFCentral's own "actively distributed" universe) | `fundManager` string per scheme, plus NAV/AUM/returns/category — richer than captnemo but same single-string shape | $0-$1,000/mo tiered by credit volume (`explore_mutual_funds`/`get_fund_details` both 1 credit/call — cheap per call, but it's a recurring bill for a wrapper over a site we don't control, with zero legal/official standing) |
| Value Research Online scrape | Near-total (VR covers virtually every live scheme) | Fund manager + tenure shown on fund pages (format not confirmed — site is blocked, see below) | **Live-verified 2026-10-08: a direct `curl` with a real browser user-agent gets a flat 403** — this isn't a soft JS/paywall gate, it's active bot-blocking (WAF/Cloudflare-class) at the HTTP layer, before any scraping logic even runs |
| Moneycontrol scrape | Near-total | Fund manager field exists (`Fund Manager(s)` label confirmed live in the page's HTML) | **Live-verified 2026-10-08: the value itself is NOT in the server-rendered HTML.** The embedded Next.js data payload literally contains `"fund_managers_details":[]` — empty. The name is filled in by a client-side API call after the page loads, which a plain HTTP scraper never sees. Getting it requires a headless browser (Playwright/Puppeteer) driving a real page load *and* capturing that specific internal async API call via network-traffic inspection — this is a materially bigger, more fragile build than a simple HTML-parse scraper, independent of ToS risk |

**The practical read Ayush asked for:** accepting the ToS risk on VR/Moneycontrol does
not make either of them easy. VR is already hardened against exactly this kind of access
(outright blocked at the network layer); Moneycontrol isn't blocked, but its data isn't
reachable by the scraping technique this codebase already uses anywhere else (static
HTML/JSON parse) — it needs a browser-automation layer that's a new category of
infrastructure for this project, with its own maintenance burden (the internal API it
calls could change shape with zero notice, same as any undocumented endpoint, except
discovering it again requires re-doing the network-trace work, not just re-reading
page HTML).

### MFCentral — official access (already applied for) vs. the unofficial wrapper: these solve different problems

Confirmed via KFintech's own investor-relations disclosures: MFCentral's **real, official
API suite for AMFI-registered distributors/RIAs** exists and is in production use
("delivering over 50 million personalised statements" to fintechs already on it) — but
it's organized as **Non-Financial Transaction APIs, Financial Transaction APIs, and
Information-Only APIs (e.g. Capital Gains, distributor-level CAS)**. Every category named
in public disclosures is about **investor-level data** (holdings, transactions, CAS,
capital gains) reachable once a specific investor has linked/authenticated — there is no
public evidence of a **scheme-master metadata API** (fund manager name, AUM, category,
etc.) in that official suite. The `fundManager` field that DOES exist in the wild is only
visible through Parse.bot's *unofficial* wrapper — which readers of its own page are told
plainly is reverse-engineered off MFCentral's public investor-facing website, not off the
official distributor API.

**So: the ARN-based official MFCentral access being applied for is likely NOT a shortcut
to attribute 04's fund-manager problem** — it solves a different, arguably bigger problem
(pulling investor CAS/transaction data directly via API instead of this codebase's current
PDF-statement-parsing import pipeline), which is worth its own separate conversation once
that access actually comes through, but shouldn't be assumed to also hand us scheme-level
fund-manager metadata as a side effect. Worth explicitly re-checking once the access is
granted (an official partner API spec, not public, may turn out to include more than the
press-release-level categories found here) — but not something to plan around yet.

### SID vs. the (newly found) AMFI monthly Factsheet page — which is the better authoritative target

Two AMFI-adjacent, non-third-party candidates exist, found and compared live this session:

**1. Scheme Information Document (SID)** — the SEBI-mandated legal offer document.
Standardized section structure (format simplified 2024-04-01), dedicated Fund Manager
section (name + other schemes managed, sometimes tenure). Centrally hosted by AMFI at
`portal.amfiindia.com/spages/{numeric-id}.pdf` (real examples confirmed live) — but no
confirmed bulk index from scheme_code/ISIN to that numeric id (checked for a hidden JSON
API the way the TER/TRI endpoints were found this session; none surfaced). Heavy document
(60-100+ pages per scheme), updated only "whenever material" (irregular cadence, not a
clean weekly/monthly rhythm).

**2. AMFI's own monthly Factsheet page** (`amfiindia.com/online-center/download-factsheets`,
found this session, not in the original gap-analysis) — **a better-shaped candidate**:
- Organized per-AMC (51 fund houses listed, live-verified), same "handful of entries, not
  14,354" shape as the TER endpoint's AMC-at-a-time pattern.
- Industry convention: one combined factsheet PDF per AMC per month, covering every one of
  that AMC's schemes as a one-page profile each — Fund Manager is always one of the first
  fields on each scheme's page, far more consistently positioned than inside a full SID's
  legal prose.
- Naturally monthly cadence — fits a scheduled refresh job without the "irregular SID
  update" problem.
- Not SEBI-mandated to the same rigor as SID (an industry norm, not a legal requirement),
  so marginally less authoritative, but operationally much more usable.
- **Resolved below (2026-10-08 spike) — see "Discovery spike, resolved positively."**

### Discovery spike — run 2026-10-08, resolved positively

Ayush asked to stop deferring and just run it. Result: **the discovery mechanism exists
and is AMFI-maintained, not third-party.** The Factsheet page
(`amfiindia.com/online-center/download-factsheets`) is Next.js but **server-renders its
data inline** — curl with a plain browser user-agent (no headless browser needed) returns
a 290KB HTML payload with an embedded Strapi-CMS JSON blob covering every AMC, confirmed
live: 56 AMC entries, each carrying (among other fields) `amc_name`, `amc_website`,
`amc_monthly_mf_factsheets` (a direct link into that AMC's own factsheet-downloads page),
and `statement_of_information` (a direct AMFI-hosted SAI PDF, `portal.amfiindia.com/
spages/sai{id}.pdf`). The dozen guessed `/api/...` endpoints from the earlier pass were a
dead end for a different reason than assumed — there was never a separate API call to
find; the data was already server-rendered into the page's own HTML the whole time.

- **50 of 56 AMCs have a populated `amc_monthly_mf_factsheets` link** (6 empty — small/
  newly-registered AMCs: AlphaGrep, Carnelian, Jio BlackRock, Lakshya, Monarch Networth,
  Nuvama — a one-time manual lookup for 6 entries, not a blocker).
- Spot-checked several of the 50 links directly: some resolve straight to a specific
  current-month factsheet PDF already (e.g. Bank of India, Old Bridge); others land on
  the AMC's own factsheet-listing page (one more hop, but to a known, AMC-owned URL, not
  a blind search).
- Also downloaded a real AMFI-hosted SAI PDF (`sai62.pdf`, 360 ONE AMC, 177 pages) to
  check its "Information on Key Personnel" section: it lists every fund manager employed
  by the AMC (name, designation, age, qualification, experience) but — confirmed by
  searching the extracted text — **does not map individual schemes to individual
  managers.** That mapping lives at the scheme level (SID's "Fund Managers of the
  Scheme" section, or each scheme's one-pager in the monthly factsheet), not the
  AMC-wide SAI. So SAI is useful context (a manager-name roster per AMC, handy for
  cross-checking parsed names) but the factsheet remains the primary source for the
  actual scheme→manager assignment.

**Resolved pipeline shape:**

1. One HTTP GET to the AMFI Factsheet page, regex/JSON-extract the embedded per-AMC
   directory → ~56 known AMC entries with their factsheet-page URLs. No guessing, no
   third-party wrapper, AMFI-maintained (self-correcting if an AMC changes its own URL,
   since AMFI's own directory would need updating too — same durability property as the
   TER feed).
2. Per AMC (~56, bounded, not 14,354): follow its factsheet link, locate the current
   month's PDF — the one place genuine per-AMC-specific logic is needed, since each
   AMC's own downloads page has its own layout. Comparable in shape to CAS import's
   existing per-RTA (CAMS/KFintech) specific logic — a handful of integrations, not
   thousands.
3. Parse each AMC's factsheet PDF (same `pypdf` text-extraction idiom verified against
   the SAI PDF above) — one page per scheme, "Fund Manager" reliably near the top of
   each scheme's profile. Fuzzy-match the scheme name into the local `schemes` table
   (same `SequenceMatcher` idiom as `amfi_ter_client.py`).
4. Upsert into a new `scheme_fund_managers` table (scheme_id, manager_name, role,
   reference_period) — same upsert/`_mark_checked_no_match` idiom as TER, so an AMC
   whose PDF can't be parsed this month doesn't re-trigger a full rescan every run.
5. Scheduled monthly (factsheets are a monthly publication) — same EventBridge/Fargate
   pattern as the existing batch jobs, not a new infra category.

### Per-AMC PDF resolution — live-sampled 2026-10-08, all three tiers confirmed with evidence

The AMC directory re-extracted correctly this pass (fixed a positional-misalignment bug
from the first extraction attempt — the embedded data is a Next.js RSC streaming payload,
`self.__next_f.push([1,"c:..."])`, a JSON-escaped string that must be unescaped and
`json.loads`-ed as one object, not regex-scraped as two flat lists): **57 AMCs**, not 56.
51 have a populated `amc_monthly_mf_factsheets` link; 6 are empty (AlphaGrep, Carnelian,
IL&FS Infra, Lakshya, Monarch Networth, Nuvama — small/newly-registered AMCs, permanently
`MANUAL_PENDING`, not a blocker).

Live-fetched 9 of the 51 landing pages (`curl -L` with a browser UA — same method as the
AMFI directory page itself, no headless browser) to characterize what "find this month's
PDF" actually requires. Confirmed three genuinely different cases exist, not one uniform
pattern:

| AMC | Result |
|---|---|
| Nippon India | Static HTML, regex for `factsheet` + `.pdf` finds dated files directly (`Nippon-FS-Feb-2026.pdf`) — **zero extra work** |
| DSP | Static HTML, same regex finds `dsp-factsheet-june-2026.pdf` directly among 47 PDF links (most are unrelated "investment framework" docs — the regex must require a `factsheet` substring, not just any `.pdf`) |
| Axis, SBI | Static HTML returned, but **zero `.pdf` links of any kind** — the downloads widget is a client-side-rendered component fetching from a backend API this page's HTML never reveals. Needs a one-time per-AMC network-trace (browser devtools) to find that API, done lazily per AMC, not upfront for all 51 |
| Bandhan, UTI | Same as Axis/SBI (confirmed via `id="root"` / Angular Material markers = SPA shell, no server content) |
| Kotak | **Hard-blocked** — returned a Radware bot-protection/CAPTCHA challenge page, not real content. A different category from "needs JS": no network trace will help without defeating a WAF, which is out of scope. Permanent `MANUAL_PENDING` unless revisited |

This is real, not guessed: **2 of 9 sampled AMCs are resolvable today with zero extra
engineering** (regex over static HTML); most of the rest need one bounded per-AMC
investigation (find their backend API, same shape as reverse-engineering one site, not
50); one confirmed category is a dead end. This generalizes to a 3-tier resolver
architecture below, not a single algorithm — the plan explicitly ships a working pipeline
with partial coverage now and grows coverage over time, exactly like TER's own posture
(a scheme missing this month's data falls back to its last known value, never blocks).

### Resolver architecture (engineer-ready — no further design pass needed)

**A code-level registry, not a new DB config table.** Which extraction strategy applies to
which AMC is an engineering decision that changes maybe once a year (an AMC redesigns its
site) — not operational data a non-engineer needs to edit at runtime. A Python dict is the
right weight; a DB-backed admin-editable config table would be solving a problem (ops
self-service) nobody has, so it's explicitly rejected here (YAGNI), not deferred.

```python
# backend/app/services/analytics/fund_manager_resolvers.py
from enum import Enum

class ResolverKind(Enum):
    STATIC_REGEX = "static_regex"   # factsheet PDF link discoverable via plain GET + regex
    MANUAL_PENDING = "manual_pending"  # known AMC, no automated path yet (JS widget, WAF-blocked, or no link at all)

AMC_RESOLVERS: dict[str, ResolverKind] = {
    "Nippon India": ResolverKind.STATIC_REGEX,
    "DSP": ResolverKind.STATIC_REGEX,
    # ... every other AMC defaults to MANUAL_PENDING until a per-AMC network
    # trace confirms a JSON_API approach is worth adding — see "Still open"
    # below for exactly how to add one.
}
```

- **`STATIC_REGEX`:** `GET` the AMC's `amc_monthly_mf_factsheets` URL (from the AMFI
  directory), extract all `href`s matching `(?i)[\w./%-]*factsheet[\w./%-]*\.pdf`, take the
  most-recently-dated match (parse the date token out of the filename, e.g. `Feb-2026`/
  `june-2026` — both appeared in the two confirmed examples; a filename with no parseable
  date is skipped, not guessed at). This is the entire Tier-1 implementation; no new
  dependency (`httpx` + `re`, already used by `amfi_ter_client.py`).
- **`MANUAL_PENDING`:** skip the AMC entirely this run, increment a `skipped` counter in
  the job's summary log line. Never raises, never blocks the rest of the batch — same
  posture as `_mark_checked_no_match`.
- **Adding a `JSON_API` tier later (not built now, but the shape is fully specified so
  it's a mechanical addition when an engineer does the per-AMC network trace):** a third
  `ResolverKind.JSON_API` whose dict value carries `(endpoint_url_template, response_json_path)`
  and a resolver function that does a second-level `httpx.get` against that endpoint
  instead of regexing HTML. Adding AMC #3 is then: trace its network tab once, add one dict
  entry, done — no architecture change.

### Extraction — grounded in two real factsheet PDFs, not assumed

Downloaded and parsed real current-month factsheets (`pypdf`, same idiom as the SAI
inspection) to confirm the "Fund Manager" block's actual text shape, since this directly
decides the DB schema:

- **DSP** (170-page factsheet, one page per scheme): `FUND MANAGER | Bhavin Gandhi | Total
  work experience of 21 years. | Managing this Scheme since March 01, 2024.` — and for
  multi-manager schemes, a second `<Name> | Total work experience... | Managing this
  Scheme since <date>.` block repeats immediately after, **no role label at all** — order
  is the only signal of primary-vs-co-manager.
- **Nippon** (158 pages): `Fund Manager(s) | Sailesh Raj Bhan (Managing Since Aug 2007) |
  Total Experience 30 years | Bhavik Dave (Assistant Fund Manager) (Managing Since Aug
  2024) | Total Experience more 13 years` — here a role **is** explicitly labeled inline
  ("Assistant Fund Manager") for the second manager, but not the first (implying "primary"
  is the unlabeled default).

**This directly resolves the "final schema for `role`" open item:** don't model an enum
(primary/co-manager/assistant) — the source data doesn't consistently support one. Model:

```sql
CREATE TABLE scheme_fund_managers (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheme_id        UUID NOT NULL REFERENCES schemes(id),
    manager_name     TEXT NOT NULL,
    role             TEXT NULL,        -- verbatim inline label when the source states one
                                       -- (e.g. "Assistant Fund Manager"); NULL when unlabeled
    sequence_order   SMALLINT NOT NULL, -- 0-based position in the source's own listing —
                                       -- the only consistently-present primary/co signal
    managing_since_raw TEXT NULL,     -- verbatim as printed ("March 01, 2024" / "Aug 2007")
    managing_since   DATE NULL,       -- best-effort parsed, day=1 when source gives only
                                       -- month+year; NULL if unparseable — never blocks the
                                       -- row, same degrade-gracefully posture as SchemeTer
    reference_period DATE NOT NULL,   -- first-of-month, same convention as SchemeTer
    match_method     TEXT NOT NULL CHECK (match_method IN ('EXACT', 'FUZZY')),
    match_confidence NUMERIC(4,3) NOT NULL, -- 1.000 for EXACT; SequenceMatcher ratio for FUZZY
    UNIQUE (scheme_id, manager_name, reference_period)
);
```

Parsing algorithm per scheme-page: locate `Fund Manager` (case-insensitive, matches both
DSP's `FUND MANAGER` and Nippon's `Fund Manager(s)`), then repeatedly match
`<Name>\s*(?:\(([^)]*)\))?.*?Managing (?:this Scheme )?[Ss]ince\s+([A-Za-z]+\.?\s*\d{0,2},?\s*\d{4})`
until the next non-matching line (the AUM/NAV block that always follows) — `role` captures
the optional parenthetical immediately after the name if present (Nippon), else NULL (DSP).
This is a best-effort regex against free-text PDF extraction, same honesty as everything
else here — a factsheet whose layout doesn't match either observed shape produces zero
matched managers for that scheme this month, logged, not a crash, and not silently wrong
(no row is better than a wrong row).

### Matching — redesigned 2026-10-08 per Ayush's direction, deterministic wherever the
source document actually allows it (flagging an honest constraint first)

Ayush asked to replace fuzzy matching with a deterministic AMFI-code/ISIN join, citing bad
past experience with TER's fuzzy matching. Before designing the replacement: **a real
constraint from the source document itself means a zero-fuzziness join isn't fully
achievable, and it's important to say so plainly rather than silently paper over it (both
the real DSP and Nippon factsheet pages were re-inspected specifically for this — grep'd
for "isin" across every page of both PDFs). The scheme's own ISIN/AMFI code is never
printed on its factsheet profile page** — the only "ISIN" occurrences found (9 pages in
DSP, 81 in Nippon) are in the *portfolio holdings* tables (the ISINs of the bonds/stocks
the fund invests in), not the scheme's own identity. The scheme is identified on its own
factsheet page by free-text name only (e.g. "DSP Flexi Cap Fund (erstwhile known DSP
Equity Fund)"). So there is no printed AMFI code or ISIN to join on directly from this
document — some form of name resolution is structurally unavoidable at the point a
factsheet's free-text name meets our DB.

**That said, this is confirmed good news, not a dead end:** our local `schemes` table is
already keyed deterministically off AMFI's own official daily scheme-master feed —
`scheme_master.py`'s `refresh_scheme_master()` ingests `NAVAll.txt` (the exact same feed
`amfi_ter_client.py`'s docstring references) and stores `amfi_code` (AMFI's own scheme
code, the actual primary join key — confirmed live at `backend/app/services/analytics/
scheme_master.py:39,42`), `isin`, `isin_reinvest`, and a suffix-stripped `base_name` per
row, refreshed daily. This lets the unavoidable name-resolution step be redesigned so its
risk profile is nothing like TER's:

0. **Try an exact deterministic match first — no fuzziness at all.** After the
   normalization in step 2 below, compare the factsheet name against every AMC-scoped
   candidate's normalized `base_name` for literal string equality. In the common case
   (the factsheet's marketing name and AMFI's `base_name` agree once boilerplate is
   stripped — expected to be the majority of schemes, since both ultimately describe the
   same SEBI-registered product) this resolves the `amfi_code` with **zero** fuzzy
   involvement, `match_method='EXACT'`, `match_confidence=1.0`. Fuzzy matching (steps 1-4
   below) only runs as a fallback when no exact match is found — it is one layer of a
   hybrid pipeline, not the only mechanism, per Ayush's direction that fuzzy-only is the
   part to move away from, not fuzzy-at-all.
1. **Scope candidates to one AMC, not the whole universe.** TER's fuzzy match had to
   search across all ~14,354 schemes with no way to narrow the field — a bad match there
   means picking the wrong scheme out of thousands. This pipeline processes one AMC's
   factsheet at a time, so the candidate pool for any given scheme name is just that one
   AMC's own product list (typically 20-60 schemes) — a wrong match here would have to beat
   out a tiny, AMC-scoped field, structurally far less likely.
2. **Normalize before matching, deterministically, not fuzzily.** Factsheet names carry
   known boilerplate noise not present in `base_name` (confirmed live: DSP's
   "(erstwhile known X)" parenthetical). Strip known boilerplate patterns
   (`\(erstwhile known.*?\)`, trailing scheme-type descriptors already implied by
   `sebi_category`) with plain regex *before* any fuzzy step — this is exact, not
   probabilistic, and removes the single biggest source of spurious score drag. This same
   normalization also feeds step 0's exact-match fast path, so it only needs writing once.
3. **Match against the single canonical AMFI name, not a possibly-drifted local one.**
   TER's own docstring explains its fuzziness came from comparing a *locally stored,
   suffix-bearing* `Scheme.name` against AMFI's plan-generic name. Here, match the
   (normalized) factsheet name against the **same canonical `base_name` already used to
   key every local scheme row** — both sides are now suffix-stripped names from/aligned-to
   the same authoritative source, a structurally easier comparison than TER ever had.
4. **Raise the acceptance bar.** With a scoped pool and normalized, canonical-aligned
   names, a correct match should score far above TER's 0.55 (which existed specifically to
   tolerate TER's known suffix mismatch — a problem this pipeline doesn't have, having
   solved it in step 2). Set `MIN_MATCH_CONFIDENCE = 0.80` here; anything below is treated
   as unmatched (logged, surfaced in the coverage metric), never silently attached. A
   future session can tune this with real data once the first resolvers are live, but 0.80
   is the right conservative starting point for a scoped, normalized match.
5. **Ambiguity guard — refuse to auto-pick between near-twin schemes.** This is the layer
   that most directly protects against Ayush's stated worst case: fuzzy matching silently
   attaching a manager to the *wrong* fund (e.g. an AMC's "XYZ Flexi Cap Fund" vs. "XYZ
   Flexi Cap Fund — Series 2", a real pattern AMCs use). Compute the fuzzy score against
   every AMC-scoped candidate, not just the best one. If the top score clears 0.80 but the
   **second-best score is within 0.05 of it**, treat the match as ambiguous: write no row,
   log it (`scheme_name=... top_candidate=... top_score=... runner_up=... runner_up_score=
   ...`), surface it in the coverage metric as `ambiguous`, not `unmatched` (a distinct
   failure mode worth distinguishing operationally — "couldn't find a candidate" vs. "found
   two that looked equally right"). No row is strictly safer than a 50/50-confidence row
   pointing at a competitor fund within the same AMC.
6. **Resolve once per scheme family, attach via an exact SQL join.** A fund manager is a
   fact about the *scheme*, not a specific plan-variant row — confirmed by both DSP and
   Nippon's own factsheets, which list Regular and Direct Plan NAVs together under one
   `FUND MANAGER` field. So steps 0-5 above run **once** per factsheet-listed scheme name,
   yielding one `amfi_code`. From there, every local plan-variant row sharing that
   `amfi_code` (`WHERE amfi_code = :matched_code` — an exact equality join, zero
   fuzziness) gets the same upserted manager row. This is the step that most directly
   answers Ayush's original propagation concern: the *propagation* across
   Direct/Regular/Growth/IDCW variants, which is where a bad per-row match would otherwise
   compound, is fully deterministic by construction — only one judgment call is made per
   scheme, not one per row.

**Net honest answer to "can this be fully deterministic":** no — the factsheet PDF itself
doesn't carry a joinable code, so a name-resolution step can't be deleted outright. What
this redesign delivers instead, per Ayush's follow-up ("a hybrid integrated structure
where fuzzy matching is not the only thing... even some parts of fuzzy matching is
acceptable"): a **hybrid, multi-layer pipeline** where most schemes resolve via step 0's
exact match with zero fuzziness at all, fuzzy matching is a scoped/normalized/
high-threshold fallback rather than the primary mechanism, an explicit ambiguity guard
refuses to auto-pick between look-alike schemes (the actual risk Ayush flagged —
attaching data to a competitor's fund within the same AMC), and the one unavoidable
judgment call per scheme is made exactly once, then propagated deterministically. This
eliminates every part of TER's design that made past experience bad (global, unscoped,
un-normalized, low-threshold, per-row, no ambiguity check) while being honest that a name
step still exists for the minority of schemes that don't hit the exact-match fast path.

### Accuracy measurement — persisted per match, not just logged

Every upserted `scheme_fund_managers` row records how it was resolved, so match quality is
queryable later without re-deriving it from logs:

```sql
match_method       TEXT NOT NULL CHECK (match_method IN ('EXACT', 'FUZZY')),
match_confidence   NUMERIC(4,3) NOT NULL, -- 1.000 for EXACT; the SequenceMatcher ratio for FUZZY
```

This gives a direct accuracy signal without a dashboard (YAGNI, same posture as "Coverage
observability" below): a one-off query (`SELECT match_method, count(*), avg(match_confidence)
FROM scheme_fund_managers GROUP BY match_method`) tells us, at any time, how much of the
pipeline's coverage rests on the zero-fuzziness fast path vs. the fuzzy fallback, and the
real confidence distribution of the fuzzy matches that did get accepted. Ambiguous and
unmatched cases aren't rows at all (step 5 above) — they're counted in the per-run log
line (`resolved=%d skipped=%d unmatched_schemes=%d ambiguous_schemes=%d`), which is the
right place for them since there's no scheme row to attach a confidence column to.

### Job wiring — the why, when, what, how, and cost (engineer-ready, no further pass needed)

**Why a scheduled job at all (vs. on-demand like `nav.py`):** fund-manager assignments are
a bulk fact — one AMC's factsheet covers every scheme that AMC runs, same reasoning as
`ter.py`'s comment on why TER is bulk-refreshed rather than per-scheme-fetched. There's
also no per-user trigger that would naturally prompt a refresh (unlike NAV, which is
pulled on-demand when a user views their dashboard) — AMCs publish monthly on their own
schedule, independent of any Unifolio user action, so a time-based trigger is the only
sensible one.

**What the job does, step by step, every run:**
1. `GET` the AMFI Factsheet directory page (`amfiindia.com/online-center/download-
   factsheets`), parse the embedded RSC JSON payload → the current list of AMCs and their
   `amc_monthly_mf_factsheets` URLs (re-fetched every run, not cached — it's one cheap GET,
   and AMCs occasionally change their own site layout, so always using AMFI's latest
   pointer is safer than caching a stale one).
2. For each AMC with a `STATIC_REGEX` entry in `AMC_RESOLVERS` (everything else is skipped
   and counted, per the `MANUAL_PENDING` tier): `GET` that AMC's factsheet landing page,
   regex for the most-recently-dated `factsheet...pdf` link, download it.
3. Parse every scheme page in that PDF for the `Fund Manager` block (the regex specified
   above), run the matching algorithm above per scheme name found, upsert into
   `scheme_fund_managers` for every plan-variant row sharing the resolved `amfi_code`.
4. Log one summary line (`resolved=%d skipped=%d unmatched_schemes=%d`) and exit.

**When:** `cron(0 6 10 * ? *)` — 06:00 IST on the 10th of each month. Chosen because AMCs
typically publish their monthly factsheet within the first ~7-10 days after month-end (an
industry norm, not independently re-verified against a specific SEBI clause this session —
flagged as an assumption, not a confirmed regulatory fact); the 10th gives a buffer past
that window. Clear of the existing 06:00 `nav_daily`/`benchmark_daily` jobs (different
day-of-month granularity avoids any real contention) and distinct from `ter_monthly`'s
`cron(0 6 1 * ? *)` (1st of the month) — deliberately offset 9 days later so this job isn't
racing TER's for the same Fargate capacity, though both could in practice run concurrently
without issue (each job gets its own task definition).

**How it runs (infra — no new category, a copy-paste addition to an existing file):**
`infra/modules/scheduler/main.tf`'s `locals.jobs` map gets one new entry:
```hcl
fund_managers_monthly = {
  slug                = "fund-managers-monthly"
  command             = ["python", "scripts/jobs/refresh_fund_managers_monthly.py"]
  schedule_expression = "cron(0 6 10 * ? *)"
  task_role_arn       = null
}
```
This automatically gets its own `aws_ecs_task_definition` (via the module's existing
`for_each = local.jobs`) and its own CloudWatch log group (`/ecs/${environment}-job-
fund-managers-monthly`, 7-day retention) — identical mechanism to every other job already
in this file, confirmed by reading `infra/modules/scheduler/main.tf` directly, not
assumed. Two new application files: `backend/app/services/analytics/
amfi_factsheet_client.py` (the service logic — the 1:1 structural peer of
`amfi_ter_client.py`) and `backend/scripts/jobs/refresh_fund_managers_monthly.py`
(identical `main_async`/`main` boilerplate to `refresh_ter_monthly.py`, confirmed by
reading that file directly).

**AWS cost (real numbers, not a guess):** every job in `infra/modules/scheduler/main.tf`
shares one Fargate sizing regardless of which script runs — confirmed live:
`cpu = "512"` (0.5 vCPU), `memory = "1024"` (1 GB). Using AWS Fargate's published on-demand
per-second billing rate (verified for us-east-1 at $0.04048/vCPU-hour + $0.004445/GB-hour;
ap-south-1's exact current rate wasn't independently re-confirmed this session and
typically runs somewhat higher, but the conclusion below doesn't change even if doubled):

- Cost per hour of runtime: `(0.5 × $0.04048) + (1 × $0.004445)` ≈ **$0.02469/hour**.
- This job runs once a month for, realistically, a few minutes (one directory GET + 2
  AMC PDF downloads/parses at launch, growing slowly as more `STATIC_REGEX`/`JSON_API`
  resolvers are added over time) — even a pessimistic 10-minute runtime costs
  `$0.02469 × (10/60)` ≈ **$0.0041 per run**, i.e. **under half a cent, once a month.**
  EventBridge Scheduler's own invocation cost ($1 per million invocations) and 7-day
  CloudWatch log storage for a few KB of log lines are both immaterial on top of that.
- **Conclusion: this job's AWS cost is not a real line item** — it's a fraction of a cent
  per month, dwarfed by engineering time to build/extend resolvers, which is the actual
  cost driver here, not infrastructure spend.

### SAI ingestion — decided: skip, with full reasoning (so this doesn't get silently
re-litigated during execution)

**The decision:** do not ingest the AMFI-hosted SAI PDFs as any part of this pipeline, now
or as a future enhancement, unless a future session surfaces genuinely new information
that changes the finding below.

**What was actually checked, live, not assumed:** downloaded a real SAI
(`sai62.pdf`, 360 ONE AMC, 177 pages) and searched its full extracted text for scheme-level
manager-assignment language (keyword search for "manages"/"schemes managed" patterns, the
natural place such a mapping would appear). Found: SAI's "Information on Key Personnel"
section lists every fund manager **employed by the AMC** — name, designation, age,
qualification, total experience — but with **no table or sentence tying a specific
manager to a specific scheme.** That mapping exists only at the scheme level, in either
the SID's "Fund Managers of the Scheme" section or (confirmed live, see above) the monthly
factsheet's per-scheme `FUND MANAGER` field.

**Pros of ingesting SAI anyway (considered, then rejected):**
- It's AMFI-hosted at a predictable URL per AMC (`statement_of_information` field, same
  directory payload as the factsheet links) — technically cheap to *fetch*.
- Could serve as a secondary cross-check roster — e.g. flag a factsheet-parsed name that
  doesn't appear anywhere in the AMC's own SAI roster as suspicious (a weak data-quality
  signal).

**Cons (why these pros don't outweigh the cost):**
- **Zero incremental coverage.** The one thing this pipeline actually needs — which
  manager runs which scheme — is not in the SAI at all. Ingesting it buys no new data,
  only a roster that's a strict subset of information the factsheet parse already needs to
  produce anyway (every manager mentioned in a scheme's `FUND MANAGER` field is, by
  definition, also one of the AMC's employed managers).
- **A second, differently-shaped parser for near-zero benefit.** SAI's "Key Personnel"
  section is prose/biography-formatted (name, designation, age, qualification, experience,
  in paragraph or loosely tabular form that varies more AMC-to-AMC than the factsheet's
  standardized block), not the clean structured
  `name / experience / managing-since` triplet the factsheet reliably provides. Building a
  second extractor for this format is real, separate engineering cost.
- **The cross-check idea is weak in practice.** A factsheet-parsed name failing to appear
  in a loosely-formatted SAI roster is just as likely to be an SAI-parsing miss (prose is
  harder to parse reliably than the factsheet's tabular block) as a genuine data-quality
  problem — a noisy signal not worth the cost of producing it.
- **No scheme-level mapping anywhere else in SAI either** — this isn't a case of "the data
  is in SAI but just hard to get to;" the keyword search above confirms the mapping simply
  isn't recorded in this document at all, at any AMC (SAI is explicitly an AMC-level, not
  scheme-level, regulatory disclosure by design).

**Conclusion:** the factsheet alone is both necessary and sufficient for attribute 04's
actual requirement. SAI ingestion is rejected on cost/benefit grounds, not deferred for
later — there is no future state where SAI becomes useful for this specific attribute
unless AMFI/SEBI changes what SAI is required to contain, which is outside Unifolio's
control and not worth designing around speculatively.

**If this is ever revisited (documented so a future session doesn't have to redo this
analysis from scratch):** the only scenario that would change this conclusion is AMFI/SEBI
changing the SAI's mandated content to include a scheme-level manager mapping — something
Unifolio can't predict or control, so nothing is being speculatively built against it now.
If, independently of that, a future need emerges for an AMC-wide roster for a *different*
purpose (e.g. an "all managers at this AMC" admin view, or a standalone data-quality
cross-check job unrelated to attribute 04), that would be its own separately-scoped
piece of work — a new SAI parser built for its own stated requirement, not bolted onto
this pipeline. This is noted here as a possible future "phase 2," not a commitment, and
not a dependency of anything in Sub-project 1.

### Coverage observability

One `logger.info` summary line per run (`"refresh_fund_managers_monthly: resolved=%d
skipped=%d unmatched_schemes=%d ambiguous_schemes=%d", ...`) — same level of observability
as the existing TER job, which has no dashboard either, plus the persisted
`match_method`/`match_confidence` columns above for point-in-time accuracy queries. A
dedicated coverage dashboard is YAGNI until there's evidence the log line isn't enough.

### Remaining work, explicitly scoped (not open-ended)

The only thing left for implementation is mechanical, not design: build the two confirmed
`STATIC_REGEX` resolvers (Nippon, DSP) plus the `scheme_fund_managers` migration and the
job wiring above — a working, if partial, pipeline ships from day one. Growing coverage
past those two AMCs is a repeatable, bounded unit of work (one network trace + one dict
entry per AMC, per the `JSON_API` tier shape already specified) that can happen
incrementally after this sub-project ships, the same way TER's own coverage was never
"100% or nothing." Kotak (WAF-blocked) and the 6 empty-link AMCs stay `MANUAL_PENDING`
indefinitely unless a future session decides a bot-protection bypass is worth the
engineering cost — not proposed here.

Moneycontrol/VR scraping is no longer under consideration given this clean AMFI-sourced
path exists — ranked last in the prior research pass anyway, now entirely superseded.

## Attribute 12 — TRI benchmark sourcing

### Sequencing decision: build now, in this sub-project — not deferred

Ayush's instruction was conditional: build TRI now, in Sub-project 1, if it turns out to
be easy; otherwise schedule it separately. It genuinely is easy — confirmed by live
testing against the real endpoint this session, not assumed. **Decision: build it now.**

### What "TRI" is and why it matters for analytics

A price-return index (what the existing `nse_indices_client.py` already fetches) tracks
only index-constituent price moves. A Total Return Index additionally reinvests the
dividends those constituents pay out, the same way a real mutual fund's NAV implicitly
does. Comparing a fund's NAV growth against a price-return benchmark therefore
systematically understates the benchmark's true return (it's missing the dividend
component the fund itself captures) — a well-known, SEBI-flagged distortion industry-wide,
and the reason attribute 12 exists in the gap analysis at all: benchmark comparisons
elsewhere in this codebase (ranking, scenario analysis) are only as honest as the
benchmark series they're measured against.

### Live-verified discovery — same host, same request shape as the existing client

The existing `nse_indices_client.py` fetches price-return history via
`POST https://www.niftyindices.com/BackPage/getHistoricaldatatabletoString`, with a
`cinfo` field holding a JSON string (`{name, startDate, endDate, indexName}`), returning
rows with `HistoricalDate`/`CLOSE`. Two guesses were tried and ruled out live before
finding the right path, worth recording so a future session doesn't re-try them: (1)
guessing a "TRI"-suffixed trading name (e.g. "Nifty 50 TRI") on this SAME endpoint —
returned an empty array, confirmed via a real request, not assumed; (2) a different
endpoint path found via a community doc, `/Backpage.aspx/getTotalReturnIndexString` (note
the casing) — returned a 302 ASP.NET redirect, the same "wrong path" symptom this
client's own docstring already documents for an earlier corrected guess.

Applying the SAME casing fix already proven in this codebase (`/BackPage/`, not
`/Backpage.aspx/`) to the TRI path by analogy worked on the first try, live:
**`POST https://www.niftyindices.com/BackPage/getTotalReturnIndexString`** — identical
request shape (`cinfo` JSON string), identical host, identical auth-none posture as the
existing price-index endpoint. Response rows carry `Date`, `TotalReturnsIndex` (the gross
TRI value — universally present across every index tested), and `NTR_Value` (net of a
withholding-tax adjustment — confirmed present for broad-market indices, blank `"-"` for
sector/style indices, so must be modeled as optional, not required).

**Confirmed live for all 4 trading names the existing client already supports — zero new
name-mapping needed, reusing `_TRADING_INDEX_NAME` as-is:**

| Benchmark | Trading name (unchanged) | TRI value sampled (10 Sep 2026) | Same-date price-return close |
|---|---|---|---|
| Nifty 50 | "Nifty 50" | 35,674.37 | 23,477.80 |
| Nifty 500 | "Nifty 500" | 37,403.65 | — |
| Nifty LargeMidcap 250 | "NIFTY LARGEMID250" | 21,759.83 | — |
| Nifty Midcap 150 | "Nifty Midcap 150" | 29,610.86 | — |

The TRI value being meaningfully higher than the same date's price-return close (35,674
vs. 23,478 for Nifty 50) is the expected dividend-reinvestment uplift confirming this is
genuine TRI data, not a coincidence or a misread field.

### Schema decision: extend `BenchmarkIndexHistory`, not a new parallel table

Add one column, `return_type` (`PRICE` / `TRI`, `NOT NULL DEFAULT 'PRICE'` for the
backfill-safety of existing rows), to the existing `benchmark_index_history` table, and
widen its natural key from `(index_name, date)` to `(index_name, date, return_type)`. A
new parallel table (`benchmark_tri_history`) was considered and rejected: the row shape is
identical (`index_name`, `date`, `value`) — a new table would just be this same shape
duplicated, with every future query that wants "a benchmark series" needing to know which
of two tables to look in. One table with a dimension column is the simpler, YAGNI-correct
choice, and it's an additive migration (new nullable-then-backfilled column + widened
unique constraint) — no existing row or reader breaks.

**Migration, concretely (Alembic, mirrors the existing `0021`/`0022` append-only pattern):**
```sql
ALTER TABLE benchmark_index_history
    ADD COLUMN return_type TEXT NOT NULL DEFAULT 'PRICE'
        CHECK (return_type IN ('PRICE', 'TRI'));
ALTER TABLE benchmark_index_history
    DROP CONSTRAINT benchmark_index_history_pkey,
    ADD PRIMARY KEY (index_name, date, return_type);
```
ORM model change (`backend/app/models/reference.py:64-69`, current fields confirmed by
reading the file directly): add `return_type: Mapped[BenchmarkReturnType] = mapped_column(
enum_column(BenchmarkReturnType), primary_key=True, server_default="PRICE")` alongside the
existing `index_name`/`date`/`value` columns — same `enum_column` idiom already used for
`index_name`'s `BenchmarkIndex` enum, so this is a pattern the codebase already has, not a
new one.

**Consumer contract — the one caller-side change:** `get_index_level_on_or_before` (the
existing sync cache-only lookup) gains a `return_type: BenchmarkReturnType = PRICE`
parameter, defaulting to `PRICE` so every existing caller keeps working unmodified; call
sites that specifically want TRI (ranking/scenario-analysis code consuming this for
attributes 09/11, once those are built) pass `return_type=BenchmarkReturnType.TRI`
explicitly. No existing caller needs to change.

### Job wiring — extends the existing `benchmark_daily` job, not a new one

This does not need a new scheduled job entry. `nse_indices_client.py` already has a daily
job (`benchmark_daily`, confirmed in `infra/modules/scheduler/main.tf`'s `locals.jobs`)
fetching price-return history for the same 4 trading names on the same schedule. Add one
new method, `_fetch_tri_history`, mirroring the existing `_fetch_index_history` exactly
(same `cinfo` request-building, same date-range-gap-filling logic) but pointed at the new
endpoint path and reading `TotalReturnsIndex`/`NTR_Value` instead of
`HistoricalDate`/`CLOSE`; call it alongside the existing fetch inside the same
`ensure_index_history_fresh` daily run, tagging upserted rows `return_type='TRI'`. Net
infra change: **zero** — no new Terraform, no new task definition, no new CloudWatch log
group. The existing job's runtime grows by one extra HTTP round-trip per index (4 extra
requests/day total) — immaterial against its existing 4-request price-return fetch,
and well inside the same Fargate task's existing sizing (no cost delta worth computing
separately; it rides entirely on the already-provisioned `benchmark_daily` job).

### Remaining work for attribute 12, explicitly scoped

Mechanical only, same posture as attribute 04's "remaining work": the migration (one
column, one widened constraint), the new `_fetch_tri_history` method (a near-copy of an
existing, working method against a proven endpoint), and wiring `get_index_level_on_or_before`
callers that need TRI specifically to pass `return_type='TRI'` into the existing
cache-only lookup query. No open design questions remain.

## Attribute 14 — Investment & withdrawal analysis

### Scope decision, confirmed 2026-10-08: portfolio-level only, fund-level drill-down
documented but not built

The source PDF's classification table gives switches/STP a different treatment at
"portfolio level" (ignore) vs. "fund level" (investment/withdrawal), but its own "how to
show it" section only describes portfolio-level UI (5 tiles, monthly/yearly chart, SIP
analysis) — no fund-level invest/withdraw screen is actually specified anywhere. Flagged
this as a genuine scope fork rather than guessing; **Ayush confirmed: build portfolio-level
only for now.** Reasoning: it's the only view the source document's own mockup/spec
actually describes; a fund-level breakdown is real extra engineering (different
classification rules, a new aggregation path, a new UI surface with no described mockup)
with no current stated need. The fund-level option is fully documented below (see "Future
phase 2") specifically so that if it's wanted later, no re-planning or re-discovery is
needed — the architecture, schema, and flow changes are written out now, while the context
is fresh.

### What already exists vs. what's genuinely new (checked directly, not assumed)

- **`cash_flow.py` (PRD-03) is backend-only and currently unused by the frontend.**
  Confirmed by reading the file and grepping the frontend: `frontend/src/features/
  dashboard/api.ts` has typed helper functions (`getMemberCashFlow`, `getAggregateCashFlow`)
  calling the existing `/household-members/{id}/cash-flow` and `/household/aggregate/
  cash-flow` endpoints, but **zero `.tsx` components anywhere in the frontend call either
  function** — the data plumbing exists, nothing renders it today. This is a genuinely new
  screen, not a relocation of an already-visible one.
- **SIP-miss tracking already exists, fully built, and must be reused, not reinvented.**
  `app/services/dashboard/sip.py`'s `compute_active_sips` (active/stopped SIP series,
  `missed_instalments` against the folio's latest confirmed statement) and
  `compute_sips_for_month` (per-month expected/actual instalment rows) already implement
  exactly what the PDF's "SIP analysis (active SIPs, total monthly SIP amount, missed
  instalments)" requirement asks for. Attribute 14 wires these in, it doesn't rebuild them.
- **Current value already exists, per-folio, in `holdings.py`.** `compute_holdings`
  already computes `current_value = total_units * current_nav` per folio (confirmed by
  reading the file directly, `holdings.py:262`). Attribute 14's 5th tile sums these across
  the household's folios rather than re-deriving NAV lookups a second time.

### Classification — reuse `cash_flow.py`'s existing debit/credit sets directly, don't
redefine them

Comparing the PDF's portfolio-level classification table against `cash_flow.py`'s existing
`_DEBIT_TYPES`/`_CREDIT_TYPES` (already read in full): they are **economically identical**.
Purchase/SIP → invested (`_DEBIT_TYPES`); Redemption/SWP (both land on the single
`REDEMPTION` type — `casparser` itself has no separate SWP category, confirmed by reading
its own enum) and Dividend (IDCW) payout → withdrawn (`_CREDIT_TYPES`, same set XIRR
already uses); Switch in/out/STP → ignored at portfolio level (already excluded from both
sets); Dividend reinvestment → ignored (already excluded from both sets, no new units'
worth of "new money"). This is the same reasoning `benchmark.py` and `dashboard/xirr.py`
already rely on by importing `_DEBIT_TYPES`/`_CREDIT_TYPES` from `cash_flow.py` directly
rather than redefining them — attribute 14's new module does the same, becoming a third
consumer of one canonical classification rather than a fourth definition that could drift
from the other three over time.

**One assumption, flagged rather than silently made:** `GIFT_IN`/`GIFT_OUT`/`BONUS` aren't
mentioned in the PDF's table at all. Following `cash_flow.py`'s own existing precedent
(gifts are "not cash," already excluded from its debit/credit sets, with XIRR valuing them
separately) — exclude them from attribute 14's invest/withdraw totals too, for the same
reason. Not expected to be controversial, but it's a real decision, written down rather
than made invisibly.

### The 5 tiles — formula, grounded in the PDF's own worked example

```
total_invested  = sum(txn.amount for txn in household's transactions where type in _DEBIT_TYPES)
total_withdrawn = sum(txn.amount for txn in household's transactions where type in _CREDIT_TYPES)
net_invested    = total_invested - total_withdrawn
current_value   = sum(current_value for every HoldingRow across the household's folios)
absolute_gain   = current_value + total_withdrawn - total_invested   # PDF's own formula
```
Sanity-checked against the PDF's own worked example (₹38.4L + ₹6.0L − ₹35.0L = ₹9.4L gain)
— the formula is applied as-given, not reinterpreted.

### Monthly/yearly roll-up and chart — new module, on-the-fly aggregation, no new table

New module: `app/services/analytics/investment_withdrawal.py` (lives under `analytics/`,
not `dashboard/`, since this is PRD-04's Analytics section, matching attribute 04/09/11/12's
existing location — `cash_flow.py` itself stays exactly where it is, serving PRD-03/XIRR
unchanged; this is a new, separate consumer, not a replacement). No new database table —
same posture as `sip.py`, which computes everything on-the-fly from `transactions` at
request time; a `household`'s full transaction history is small enough (hundreds, not
millions, of rows) that a precomputed roll-up table would be premature optimization.

Bucketing: group the same classified transaction list by `(year, month)` for the monthly
view and by `year` for the yearly view, summing `invested`/`withdrawn`/`net` per bucket.
**"Tap a bar for transactions" is answered by including each bucket's own transaction list
in the same response** (reusing the existing `CashFlowEntry` shape, just with
`direction: "invest" | "withdraw"` instead of today's `"debit"/"credit"` labels, to match
this attribute's own vocabulary) — this avoids a second round-trip per bar-tap; the
frontend already has everything it needs the moment the roll-up loads.

**API shape (new endpoint, same auth/household-scoping pattern as every other dashboard/
analytics route):**
```
GET /household/aggregate/investment-withdrawal
{
  "tiles": { "total_invested": "...", "total_withdrawn": "...", "net_invested": "...",
             "current_value": "...", "absolute_gain": "..." },
  "monthly": [ { "period": "2026-03", "invested": "...", "withdrawn": "...", "net": "...",
                 "entries": [ CashFlowEntry, ... ] }, ... ],
  "yearly":  [ { "period": "2026", "invested": "...", "withdrawn": "...", "net": "...",
                 "entries": [ CashFlowEntry, ... ] }, ... ],
  "sip": { "active": [SipRow, ...], "total_monthly_sip_amount": "...",
           "missed_count": <int> }
}
```
`sip` reuses `compute_active_sips` as-is; `total_monthly_sip_amount` sums `sip_amount`
across rows with `status == "active"`; `missed_count` is the count of active series whose
`missed_instalments(...)` is > 0 (a stricter signal than the "stopped after 3" cutoff
`sip.py` already uses for its own active/stopped classification — surfaced here as a
simple count for the tile, not a new computation).

### Job/infra: none — synchronous, on-demand, same posture as every other dashboard/
analytics read endpoint. No scheduled job, no new table, no new Terraform.

### Future phase 2 — fund-level drill-down, documented now so it's not re-planned later

**Not being built now.** Written out so a future session can execute directly if this is
ever requested, without repeating this discovery or re-designing from scratch:

- **Classification changes per-fund, not per-household.** At fund level, `SWITCH_IN`
  becomes an investment into the receiving scheme and `SWITCH_OUT` becomes a withdrawal
  from the sending scheme (the PDF's own table, "Fund level" column) — the exact opposite
  of today's portfolio-level exclusion. This needs its own classification set,
  `_FUND_LEVEL_DEBIT_TYPES`/`_FUND_LEVEL_CREDIT_TYPES` (adds `SWITCH_IN` to debits,
  `SWITCH_OUT` to credits, same base sets otherwise) — not a flag on the existing sets, to
  keep the portfolio-level sets' meaning (and every existing consumer relying on them:
  XIRR, `benchmark.py`, this attribute's own portfolio tiles) completely unchanged.
- **Aggregation becomes per-scheme, not per-household.** The same bucketing logic above
  (month/year groups, invested/withdrawn/net sums) runs once per `scheme_id` within a
  household's folios, rather than once across all of them.
- **New API shape:** either a `?scheme_id=` filter on the same endpoint, or a nested
  per-scheme breakdown alongside the existing household-wide response — a call to make at
  build time based on how the frontend wants to navigate into it (see below).
- **Frontend:** no mockup exists for this in the source PDF — the natural fit, if built,
  would be a per-fund expand/drill-down from the holdings table (where a user already
  picks a specific scheme) rather than a new top-level section, surfacing the same 5-tile
  shape scoped to one scheme. This is a design call for whenever this phase is actually
  greenlit, not decided now.
- **Trigger for revisiting:** no specific trigger identified (unlike the SAI future-phase
  note, which has a concrete trigger — a SEBI/AMFI content change). This is purely
  "if a future need for per-fund invest/withdraw visibility is identified," with no
  anticipated timeline.

### Frontend placement (brief — full mockup pass deferred, see below)

New section component, `frontend/src/features/analytics/InvestmentWithdrawalSection.tsx`,
added as a new sibling to `AnalyticsView.tsx`'s existing sections (`AllocationSection`,
`BenchmarkSection`, `CategoryRankingSection`, `ScorerSection`, `TerSection`) — same
established pattern, not a new one. Detailed mockups/visual design for this (and the rest
of Sub-project 1's attributes) are explicitly deferred to a dedicated frontend-focused pass
— see "Next in this planning pass" below for the sequencing Ayush confirmed.

## Next in this planning pass

**All five attributes in Sub-project 1 (04, 09, 11, 12, 14) are now fully closed at the
backend/data-design level** as of 2026-10-08 — resolver architecture, schema, computation
logic/flow, eligibility rules, job wiring (or explicit no-new-job rulings), and API shape
are all resolved with live evidence or direct precedent, nothing pushed to an
implementation-time design pass. 09's "category-relative" mechanic (the last open backend
item in the whole sub-project) was resolved and signed off this same day, grounded in
Value Research's "Return Grade" precedent and reusing `scorer.py`'s existing
percentile-composite architecture wholesale — see its section above.

**Confirmed: frontend mockups/visual design for every attribute in this sub-project are
explicitly deferred, not forgotten** — Ayush wants one dedicated pass covering all five
attributes together (detailed mockups added to the eventual HTML visual artifact that's
already a required deliverable for this sub-project, same `spec.md` + matching-HTML-
artifact gate as before), now that every backend design is settled. Sequencing, in his own
words: backend/data design for all attributes first (**done**), then one consolidated
frontend pass, then the formal spec+artifact sign-off — not attribute-by-attribute
frontend design as each backend design closed.

**Remaining before Sub-project 1's execution plan is truly final** (separate from the
09/11 backend rework, both now resolved): the way AMC/benchmark/TER data loads is
currently being reworked elsewhere in the codebase (flagged 2026-10-08, broader than this
doc) still needs re-understanding, since it may change assumptions this doc's attribute
04/09/12 designs lean on (all three read `scheme_ter`/AMC factsheet data in some form).
Not yet investigated this session.

**Next step:** the consolidated frontend/mockup pass for all five attributes, followed by
graduating this running doc into the formal `spec.md` + HTML visual artifact, both
requiring Ayush's sign-off per the sub-project planning gate.
