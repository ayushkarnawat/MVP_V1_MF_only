# Analytics PDF × Current Codebase — Attribute-by-Attribute Gap Analysis

**Date:** 2026-10-06
**Status:** Understanding pass — no build decisions made yet, this is the input to planning
**Source spec:** `Docs/Unifolio_MF_Portfolio_Analytics_Requirements.pdf` ("Mutual Fund Portfolio
Analytics" PRD, v1.0, Sept 2026, stakeholder-authored) — **this is now the analytics build
target**, superseding the scope (not necessarily every formula) of `Docs/PRD-04-MF-Analytics-Dashboard.md`
v1.0 (2026-07-22) wherever the two differ.
**Constraint from Ayush (2026-10-06):** everything is built in-house, no paid third-party
data-vendor APIs. Free/public regulatory sources (AMFI, NSE, BSE, SEBI, AMC-published
disclosures) are fine and already how the codebase sources NAV/TER/scheme-master data today —
the "no external APIs" rule is about not paying a vendor (Morningstar/CRISIL/ICRA/screener.in
paid tiers/etc.), not about avoiding public data feeds entirely.

---

## 0. The architectural core: the look-through engine (PDF section 00)

**What it means:** one shared formula, computed once, that everything else reads from:

```
Client exposure to a security = Σ over all funds ( Fund weight in client portfolio × Security weight inside that fund )
```

Fund weight = scheme's current value ÷ total MF portfolio value. Security weight = that stock's
% of the fund's net assets, **sourced from the fund's monthly portfolio disclosure** — the
stock-level holdings data.

**Current status: ⬜ Not built. Zero stock-level holdings data exists anywhere in the codebase
today.** Confirmed by grep across `backend/` and `Docs/` — there is no ingestion of what any
fund actually holds (stocks, weights, sectors). The only fund-level data we have is scheme
*metadata*: category, AMC, TER, NAV, AUM. This is the single biggest gap between the PDF and
today's build, and it is the dependency for attributes 02, 04 (partially), 06, 10, 13, 15 below
— 6 of the PDF's 15 attributes sit behind this one missing data source.

This was already flagged as a known gap in `Docs/PRD-04-MF-Analytics-Dashboard.md` (lines
102-120, "Out of Scope / Data-Gated") and investigated once already for a narrower purpose in
`Docs/orchestration/scorer-v2-pe-pb-feasibility-findings.md` (2026-08-24, written for Scorer
v2's PE/PB component specifically). That investigation's Path A (in-house AMC-disclosure
ingestion) is the right starting shape for this PDF's full look-through engine too, but it
recommended pairing it with a **paid** stock-level PE/PB vendor — which conflicts with the
new in-house-only constraint and needs re-scoping (see Open Questions below).

**Build-order implication (per the PDF's own "Suggested Build Phases" on its last page):**
this is explicitly Phase 2, after Phase 1 "Core" (which is mostly already built). The PDF's own
authors agree it should not be attempted first — but it does need to be built before 6 of the
15 attributes are possible at all.

---

## 1. Attribute-by-attribute status

| # | Attribute | PDF formula (condensed) | Status | Where it lives today | Needs look-through engine? |
|---|---|---|---|---|---|
| 01 | Portfolio XIRR | Newton-Raphson XIRR over all cash flows, one solve, excl. internal switches/STPs at portfolio level | ✅ Built | `xirr.py`, dashboard header + Analytics `BenchmarkSection` | No |
| 02 | Large/Mid/Small Cap allocation | Classify each look-through stock via AMFI's semi-annual market-cap list, sum by bucket | ⬜ Not built | — | **Yes** |
| 03 | AMC allocation | Direct grouping of scheme value by AMC, no look-through needed | ✅ Built | `allocation.py` (`by_amc`), `AllocationSection.tsx` toggle | No |
| 04 | Fund manager allocation | Fund value × manager's share (1/n co-managers, or by role) | ⬜ Not built | — | No (fund-level split, not stock-level) — but needs new data: fund-manager names/roles/tenure, not currently ingested anywhere |
| 05 | Category allocation | Direct grouping of scheme value by SEBI category | ✅ Built | `allocation.py` (`by_category`), `AllocationSection.tsx` | No |
| 06 | Overall stock holdings (look-through) | Σ(fund weight × stock weight), matched by ISIN | ⬜ Not built | — | **Yes** |
| 07 | Total expense ratio — portfolio level | AUM-weighted TER across holdings | ✅ Built | `ter.py`, `amfi_ter_client.py`, `TerSection.tsx` | No |
| 08 | Category average comparison | Fund metric vs. category average, like-for-like (Direct/Direct, Regular/Regular), sectoral vs. index | ✅ Built (as "category ranking") | `category_ranking.py`, `CategoryRankingSection.tsx` | No |
| 09 | Mutual fund ranking | Peer rank + composite score: **0.25×3Y + 0.25×5Y + 0.20×cat-relative + 0.15×low-vol + 0.15×low-TER** | 🟡 Built differently — **formula conflict, see Open Questions** | `scorer.py` (Scorer v1: 45% Return / 30% Downside-Risk / 25% Consistency) | No |
| 10 | Portfolio overlap | Σ min(weight in A, weight in B) per stock pair, matched by ISIN, symmetric | ⬜ Not built | — | **Yes** |
| 11 | Drawdown — scenario analysis | Replay current holdings through historical crash windows; actual vs. back-tested modes | ⬜ Not built | — | No (needs NAV history + an admin-configurable scenario-date table, not stock-level data) |
| 12 | Historical returns + benchmark comparison | Absolute (≤1Y) / CAGR (>1Y) vs. **TRI** benchmarks (Nifty 50/500, BSE 100/500) | 🟡 Built differently — **TRI conflict, see Open Questions** | `benchmark.py`, `nse_indices_client.py`, `BenchmarkSection.tsx` (currently price-return, honestly labeled) | No |
| 13 | Asset allocation within MF portfolio | Σ(fund weight × fund's % in equity/debt/gold/cash), from fund's actual portfolio not its category | ⬜ Not built | — | **Yes** (for the equity/debt/gold/cash split itself; category-level proxy is not what the PDF asks for) |
| 14 | Investment & withdrawal analysis | Classify transactions (purchase/SIP=invest, redemption/SWP/IDCW=withdraw, switch/STP=ignore at portfolio level), monthly/yearly roll-up | 🟡 Partially built | Dashboard cash-flow views exist on PRD-03 (Main Dashboard); not confirmed as a dedicated Analytics-section screen with this exact classification table | No |
| 15 | Portfolio P/E and P/B | Harmonic mean: `1 ÷ Σ(wᵢ ÷ P/Eᵢ)`, equity-only, loss-makers excluded | ⬜ Not built | — | **Yes**, plus a new data need: per-stock P/E and P/B (see Open Questions — this is the one PDF data input that explicitly names "market data vendor") |

**Scorecard: 5 of 15 fully built as specified, 2 built but with a formula/data conflict against
the PDF, 1 partially built on the wrong dashboard, 7 not built at all (6 of those 7 blocked on
the look-through engine).**

---

## 2. Interdependency map

```
                      ┌─────────────────────────────┐
                      │ 00 · Look-through engine     │   ← THE gap. Needs stock-level
                      │ (fund weight × stock weight) │     holdings per fund (monthly,
                      └──────────────┬──────────────┘     AMC-disclosed).
                                     │
        ┌──────────────┬────────────┼────────────┬──────────────┬──────────────┐
        ▼              ▼            ▼            ▼              ▼              ▼
   02 Cap alloc    06 Stock      10 Overlap   13 Asset       15 P/E,P/B    (future: Scorer v2's
   (+ AMFI cap     holdings      (ISIN-       alloc within   (+ needs      valuation-overlay
   list, 6-mo)     (+ ISIN       matched,     fund (equity   per-stock     component; also the
                   matching)     symmetric)   /debt/gold)    P/E,P/B       user's "Correlation
                                                              input)        X-Ray"/"Holdings
                                                                            News Feed" ideas)

   Independent of the look-through engine (already built or buildable without it):
   01 XIRR ✅ · 03 AMC alloc ✅ · 04 Manager alloc (new data, no look-through) ·
   05 Category alloc ✅ · 07 TER ✅ · 08 Category comparison ✅ ·
   09 Ranking (formula conflict only) · 11 Drawdown scenarios (NAV history only) ·
   12 Benchmark (TRI-source conflict only) · 14 Investment/withdrawal (dashboard-boundary only)
```

The practical read: **9 of the 15 attributes have nothing to do with the look-through engine.**
Of those 9, 5 are done, 2 have a conflict to resolve (formula/TRI — small, discrete decisions),
1 needs new but simple data (fund-manager names/roles), and 1 needs relocating/reshaping from
PRD-03 to PRD-04. Only 6 attributes are genuinely blocked on the big infrastructure project.

---

## 3. Synthesis — four buckets

### A. Already done, matches the PDF spec, don't redo
- 01 Portfolio XIRR
- 03 AMC allocation
- 05 Category allocation
- 07 Total expense ratio (portfolio level)
- 08 Category average comparison

### B. Built, but needs rework to match this PDF exactly (conflicts to resolve first)
- **09 Mutual fund ranking** — Scorer v1's formula (45/30/25) ≠ the PDF's formula (25/25/20/15/15)
  ≠ the approved-but-unbuilt Scorer v2 (11-component). Three different formulas now exist across
  three documents. Need a decision: does this PDF's formula replace Scorer v1 outright, get
  reconciled with the already-approved Scorer v2, or is the PDF's version illustrative/simplified
  and the real target is still Scorer v2?
- **12 Historical returns + benchmark comparison** — PDF assumes TRI benchmark data is simply
  available; `tri-benchmark-deferred-plan.md` already recorded that true TRI sourcing is an open
  feasibility question (no confirmed free TRI feed), and price-return was shipped instead with
  an honest label. This PDF either needs that feasibility question resolved first, or needs to
  accept the same "(Price Return)" labeling it didn't ask for.
- **14 Investment & withdrawal analysis** — exists but on the wrong dashboard (Main Dashboard /
  PRD-03) with an unconfirmed transaction-classification match to the PDF's exact table. Needs
  verification against PRD-03's actual implementation, not assumed as "build from scratch."

### C. Net-new, no look-through dependency — straightforward adds
- **04 Fund manager allocation** — needs a new data source (manager names/roles/tenure per
  scheme — typically sourced from scheme factsheets/SID, which are free AMC-published PDFs, same
  shape of problem as AMC TER disclosures already solved by `amfi_ter_client.py`'s pattern).
- **11 Drawdown — scenario analysis** — needs an admin-configurable scenario-date table (crash
  windows, e.g. COVID, 2022 rate hikes) and NAV-history replay logic. All inputs (NAV history,
  benchmark index values) already exist in the codebase; this is computation + UI, not a new
  data-ingestion project.

### D. Net-new, blocked on the look-through engine (the big project)
- 00 Look-through engine itself (foundation)
- 02 Large/Mid/Small Cap allocation
- 06 Overall stock holdings
- 10 Portfolio overlap
- 13 Asset allocation within MF portfolio (equity/debt/gold/cash split)
- 15 Portfolio P/E and P/B

---

## 4. Open questions before planning (need your call, not silently resolved)

1. **Ranking formula (09):** which of the three formulas (PDF's 5-factor, live Scorer v1, approved
   Scorer v2) is the actual target? This affects whether 09 is "done," "needs a tweak," or "needs
   the whole Scorer v2 project."
2. **TRI sourcing (12):** does adopting this PDF mean committing to solving true TRI sourcing now
   (revisiting `tri-benchmark-deferred-plan.md`'s feasibility question), or is price-return with
   labeling still acceptable and the PDF's "use TRI" line is aspirational?
3. **Stock-level P/E, P/B, sector data (15, and feeds 06's sector cut):** the PDF's own data-inputs
   table names "Exchange / market data vendor" as the source for this — which is precisely the kind
   of paid third-party feed the in-house-only rule rules out. Free alternatives exist (scrape
   NSE/BSE company-fundamentals pages, parse data out of AMC-published factsheets, or build P/E
   from raw financials) but all are more engineering work than a vendor API, and accuracy/upkeep
   risk is real for a product whose stated bar (per `Analytics-Dashboard-Formula-Implementation-Review.md`)
   is "100% accuracy." This is the one spot where "in-house, no external APIs" and "build this PDF
   attribute" are in the most tension — worth deciding the acceptable approach before scoping 15.
4. **Portfolio-disclosure ingestion format survey:** per the existing feasibility doc, this should
   be the first spike regardless of which attributes get prioritized, since it's the piece "most
   likely to blow up in scope" (40+ AMCs, inconsistent monthly PDF/Excel formats, no single
   aggregated public feed). Worth doing before committing to a build order for bucket D.

---

## 5. What I'd suggest, pending your steer

Given the interdependency map, the lowest-risk path is: resolve the three small conflicts in
bucket B first (cheap decisions, no new infra), ship bucket C's two straightforward adds next
(real value, no blocking dependency), and treat bucket D as its own project starting with the
AMC-disclosure-format survey spike — because every attribute in that bucket (and Scorer v2's
PE/PB component, and your "Correlation X-Ray"/"Holdings News Feed" ideas) depends on getting that
one data pipeline right, so it's worth derisking before committing to a timeline for any of them.
