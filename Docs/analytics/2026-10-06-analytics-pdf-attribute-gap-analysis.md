# Analytics PDF × Current Codebase — Attribute-by-Attribute Gap Analysis

**Date:** 2026-10-06
**Status:** Understanding pass — four open questions below are now resolved (2026-10-06, see
`decisions.md`'s "Analytics PDF open questions (4 of 4 answered)" entry); build-order planning
itself has not started.
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
| 09 | Mutual fund ranking | Peer rank + composite score: **0.25×3Y + 0.25×5Y + 0.20×cat-relative + 0.15×low-vol + 0.15×low-TER** | ⬜ Not built — **independent net-new feature, not a Scorer conflict (resolved 2026-10-06)** | — (Scorer v1 lives at `scorer.py`, unrelated) | No |
| 10 | Portfolio overlap | Σ min(weight in A, weight in B) per stock pair, matched by ISIN, symmetric | ⬜ Not built | — | **Yes** |
| 11 | Drawdown — scenario analysis | Replay current holdings through historical crash windows; actual vs. back-tested modes | ⬜ Not built | — | No (needs NAV history + an admin-configurable scenario-date table, not stock-level data) |
| 12 | Historical returns + benchmark comparison | Absolute (≤1Y) / CAGR (>1Y) vs. **TRI** benchmarks (Nifty 50/500, BSE 100/500) | 🟡 Built on price-return — **TRI sourcing confirmed feasible 2026-10-06, implementation not started** | `benchmark.py`, `nse_indices_client.py`, `BenchmarkSection.tsx` (currently price-return, honestly labeled); TRI feasibility: `Docs/analytics/investigations/2026-10-06-tri-sourcing-feasibility-confirmed.md` | No |
| 13 | Asset allocation within MF portfolio | Σ(fund weight × fund's % in equity/debt/gold/cash), from fund's actual portfolio not its category | ⬜ Not built | — | **Yes** (for the equity/debt/gold/cash split itself; category-level proxy is not what the PDF asks for) |
| 14 | Investment & withdrawal analysis | Classify transactions (purchase/SIP=invest, redemption/SWP/IDCW=withdraw, switch/STP=ignore at portfolio level), monthly/yearly roll-up | 🟡 Confirmed real gap (checked `cash_flow.py` directly, 2026-10-06) | `cash_flow.py` lives on PRD-03 (Main Dashboard): only purchase/SIP as debit, redemption/dividend as credit; switches entirely excluded (not even fund-level), no SWP handling, no monthly/yearly roll-up, no 5-tile summary | No |
| 15 | Portfolio P/E and P/B | Harmonic mean: `1 ÷ Σ(wᵢ ÷ P/Eᵢ)`, equity-only, loss-makers excluded | ⬜ Not built | — | **Yes**, plus a new data need: per-stock P/E and P/B — **resolved 2026-10-06: build free in-house (NSE/BSE scraping + AMC factsheets), no paid vendor** |

**Scorecard: 5 of 15 fully built as specified, 1 (12) built on price-return with TRI now a
confirmed-feasible but unbuilt upgrade, 1 (14) confirmed as a real gap on the wrong dashboard, 8
not built at all (6 of those 8 blocked on the look-through engine, 09 and 11 are not).**

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
   09 Ranking (independent net-new, own 5-factor formula) · 11 Drawdown scenarios (NAV history only) ·
   12 Benchmark (TRI sourcing confirmed feasible, build not started) · 14 Investment/withdrawal (dashboard-boundary, confirmed real gap)
```

The practical read: **9 of the 15 attributes have nothing to do with the look-through engine.**
Of those 9, 5 are done, 1 (12) needs a small well-scoped TRI build, 1 (09) is a net-new feature on
its own formula, 1 (04) needs new but simple data (fund-manager names/roles), 1 (11) is
computation+UI only, and 1 (14) needs relocating/reshaping from PRD-03 to PRD-04. Only 6
attributes are genuinely blocked on the big infrastructure project.

---

## 3. Synthesis — four buckets

**Revised 2026-10-06:** bucket B (below) was originally framed as "three conflicts to resolve."
All three are now resolved (see §4) and none turned out to be a real formula/data conflict —
09 was a misreading (it was never in conflict with anything), 12 is a confirmed-feasible small
build, and 14 is a confirmed real gap, not an unconfirmed one. Kept as its own bucket below since
these three still aren't "done" or "straightforward new," but the bucket's old name/framing no
longer applies.

### A. Already done, matches the PDF spec, don't redo
- 01 Portfolio XIRR
- 03 AMC allocation
- 05 Category allocation
- 07 Total expense ratio (portfolio level)
- 08 Category average comparison

### B. Resolved this session, each its own small scoped task (not conflicts)
- **09 Mutual fund ranking** — **not a Scorer conflict.** Confirmed by Ayush: this is an
  independent, open-methodology-inspired (AdvisorKhoj/MoneyControl-style) peer-ranking feature on
  its own 5-factor formula (25/25/20/15/15), performance-driven, fund-vs-fund. The Scorer (v1 live,
  v2 approved-but-on-hold pending all 11 components having real data) is a separate, unrelated
  feature — no reconciliation needed. Build 09 net-new on the PDF's formula directly.
- **12 Historical returns + benchmark comparison** — TRI sourcing reopened per Ayush's request for
  a full deep dive, and resolved: a free, reachable sibling NSE endpoint serves real TRI data for
  all 4 benchmark indices (`Docs/analytics/investigations/2026-10-06-tri-sourcing-feasibility-confirmed.md`).
  Small, well-scoped build (schema `series_type` field + a second fetch function). **Still open:
  implement now as part of this PDF's work, or schedule separately** — a sequencing call, not a
  feasibility one.
- **14 Investment & withdrawal analysis** — confirmed (by reading `cash_flow.py` directly) to be a
  real gap, not just "unconfirmed": lives on PRD-03, excludes switches/SWP entirely, no monthly/
  yearly roll-up, no 5-tile summary. **Reclassified by Ayush, 2026-10-06: this is bucket-D-adjacent
  net-new work, not a small "verify and move" task** — despite having no look-through dependency
  (it reads `transactions` directly), the actual build is a full new Analytics-section screen with
  new classification logic, a new roll-up/aggregation path, and SIP-miss tracking — comparable in
  size to a bucket D item, not a bucket C-sized add. Sequenced with bucket D's planning effort for
  that reason, even though it has no technical dependency on the look-through engine.

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
- 15 Portfolio P/E and P/B — stock-level P/E, P/B source resolved: free in-house NSE/BSE
  scraping + AMC factsheets, no paid vendor (see §4)

---

## 4. Open questions — all 4 answered 2026-10-06

Full record: `decisions.md`'s "2026-10-06 — Analytics PDF open questions (4 of 4 answered)" entry.

1. **Ranking formula (09) — answered.** Not a three-way conflict; the PDF's formula is 09's own,
   independent of Scorer v1/v2 entirely. Build it as-is.
2. **TRI sourcing (12) — answered.** Reopened per explicit request, deep-dive investigation done,
   confirmed free and reachable. `Docs/analytics/investigations/2026-10-06-tri-sourcing-feasibility-confirmed.md`.
   Sequencing (now vs. separate ticket) still open.
3. **Stock-level P/E, P/B, sector data (15, and feeds 06's sector cut) — answered.** Build free
   in-house (NSE/BSE scraping, AMC factsheets), accepting the extra engineering/upkeep cost to stay
   within the in-house-only rule. No paid vendor exception.
4. **Portfolio-disclosure ingestion format survey — answered, started.** First-pass spike complete:
   `Docs/analytics/investigations/2026-10-06-amc-portfolio-disclosure-format-survey.md`. Headline finding:
   it's a SEBI-prescribed format (ISIN, Industry, Quantity, Market Value, **% to NAV** all
   regulatorily mandated), not 40+ ad hoc inventions — substantially de-risks the look-through
   engine's core data-quality question. Still open: no single aggregated cross-AMC feed (~40
   separate fetches) and file URLs not yet confirmed machine-fetchable (JS-rendered pages) —
   "spike 2" (pull/diff 8-10 real AMC files) is the recommended next step, not yet done.

---

## 5. What I'd suggest, pending your steer

With bucket B's three items now resolved rather than open, the lowest-risk path is: ship bucket
B's three small scoped tasks (09 net-new, 12's TRI build, 14's real Analytics-section build) and
bucket C's two straightforward adds first (all independent, no blocking dependency), and treat
bucket D as its own project starting with AMC-disclosure survey "spike 2" (pull/diff 8-10 real
files) — because every attribute in that bucket (and Scorer v2's PE/PB component, and your
"Correlation X-Ray"/"Holdings News Feed" ideas) depends on getting that one data pipeline right,
so it's worth derisking before committing to a timeline for any of them.
