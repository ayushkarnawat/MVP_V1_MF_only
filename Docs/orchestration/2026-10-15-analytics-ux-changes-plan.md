# Analytics & Scenarios UX Changes — Plan (Sub-project 1)

Date: 2026-10-15 · Status: **PLAN ONLY — nothing built. Build starts on an explicit go.**

Source: UX review points from the user (7 points), plus 3 follow-ups the same day
(year-wise tables for category ranking and fund ranking; TER in rupees and fund-wise
TER; date range inside an opened scenario). Findings below come from a read-only look
at the code; nothing was run against real data.

## Summary table

| # | Item | Backend change? | Size | Blocked on |
|---|------|-----------------|------|-----------|
| 1 | Investment & withdrawal: positive/negative bars; withdrawn shows zero | Maybe (if a classification bug) | Small–medium | Cause of zero; Q1 |
| 2 | Benchmark XIRR uses exact transaction dates? | No (verify + test) | Small | — |
| 3 | Fund manager table: Name, AMC, Allocation %, Amount | Yes (AMC, %) | Medium | Q2 |
| 4 | Category average: show return period | Yes (per-period fields) | Medium | Q3, Q4 |
| 5 | Fund ranking: show time horizon | Yes if per-horizon ranks | Medium–large | Q5 |
| 6 | Direct vs Regular: hide bars with no data | No | Small | — |
| 7 | Explain Fund Quality Score & Composite Rating | No | Small | Doc-vs-code check |
| 8 | Category ranking & fund ranking: year-wise table | Yes | Medium–large | Q4 |
| 9 | TER: rupee view + fund-wise TER table (TER, value, yearly cost 1/3/5Y) | Yes | Medium | Q6, Q7 |
| 10 | Scenarios: date range inside an opened scenario | No | Small | Q8 |

Items 4, 5 and 8 touch the same two sections and should be designed as one shared table.
Items 6 and 9 both touch `TerSection.tsx` and should go together.

---

## 1. Investment & withdrawal — bar graph and zero withdrawals

**Today**
- `frontend/src/components/ui/charts/bar-chart.tsx` draws two upward bars per period.
  `barHeight` clamps anything below zero to zero, so nothing can draw downward.
- Withdrawals are only `REDEMPTION`, `DIVIDEND_PAYOUT`, `REVERSAL`
  (`backend/app/services/dashboard/cash_flow.py`). Switch-outs, STP-outs and gifts are
  deliberately excluded (`investment_withdrawal.py`, `_direction`).

**Plan**
1. **Find out why Withdrawn is zero first.** Run the affected account through
   `compute_investment_withdrawal`; list its transaction types against the
   `invested`/`withdrawn` directions.
   - If the CAS only has switches or no redemptions, zero is correct. Add a clear
     note, no code fix.
   - Otherwise it is a classification bug in the importer or the type mapping.
2. Redraw the chart with withdrawals below a zero baseline; y-scale spans largest
   withdrawal to largest investment. Keep click-to-see-transactions, keyboard handling
   and the sideways scroll.
3. Update the legend, and the mobile and print views that reuse the section.

## 2. Benchmark XIRR and exact transaction dates

**Finding: it already does.** `_benchmark_xirr_for_transactions` (`benchmark.py`) takes
each transaction's index level on or before its date, buys/sells hypothetical index
units, and values the remaining units at today's level. The cash-flow dates fed to
`xirr()` are the real ones.

**Only caveat:** a transaction on a non-trading day uses the previous trading day's
level.

**Plan:** a written verification with one worked SIP stream checked against an
independent XIRR, plus a test that locks the behaviour. Optional footnote on the page.
No code change expected.

## 3. Fund manager allocation — four columns

**Today:** expandable manager cards showing a rupee value (`FundManagerSection.tsx`,
`fund_manager_allocation.py`). `ManagerGroup` has no AMC and no percentage.

**Plan**
- Table: Fund Manager Name · AMC Name · Allocation % · Amount.
- Backend: add `amc_name` (from the holding's `amc_name`) and Allocation % (manager
  value ÷ portfolio total). A manager at two AMCs gets one row per manager-and-AMC pair.
- **Overlap issue:** a fund with two managers is currently counted in full under each,
  so percentages would sum to more than 100%. See Q2.

## 4. Category average — return period

**Today:** `category_avg_return` is the AUM-weighted average of a **blended 3Y/5Y CAGR**,
and `scheme_return` is the same blend; the UI never says so. The backend already
computes `r1`, `r3`, `r5` per scheme (`category_ranking.py`,
`_compute_category_returns_detailed`).

**Plan:** show the period explicitly. Recommended: 1Y/3Y/5Y columns for the fund and
for the category average (see item 8), and label the blended figure as the ranking
basis. Fallback: just label the existing numbers.

## 5. Fund ranking — time horizon

**Today:** the rank is a composite score (3Y return 25%, 5Y return 25%, plus other
components — `fund_ranking.py`, `FundRankingSection.tsx`), so it has no single
horizon.

**Plan**
- Minimum: label every rank line with what it is ranked on, plus a short "what's in the
  rank" tooltip. Funds with a 3Y but no 5Y record need a different label.
- Fuller option: a real rank per horizon (see item 8), which needs a separate ordering
  and peer count per horizon. This is the larger backend change.

## 6. Direct vs Regular — hide bars with no data

**Today:** `TerSection.tsx` shows the comparison when either TER is non-null; the
"orange/green lines" are the two bars.

**Plan:** draw each bar only if that plan has data. One plan only → one bar with a
note. Neither → nothing. Tests for all three cases.

## 7. Explain Fund Quality Score & Composite Rating

**Today:** one subtitle in `ScorerSection.tsx`: "45% Return, 30% Downside Risk & 25%
Consistency".

**Plan**
- A "How is this calculated?" panel or modal: plain-language component definitions,
  weights, the peer group, and how a score maps to a verdict (70+ "High Quality", etc.).
- Take the wording from `Docs/Updated_and_Approved_Unifolio_Fund_Scoring_Methodology.md`.
  **Check that doc against `scorer.py` first**; if they disagree, stop and flag it
  (per CLAUDE.md), don't resolve silently.
- Add "unavailable" messages for funds with too little history.

## 8. Category ranking & fund ranking — year-wise table

Interpretation to confirm (Q4): **trailing periods (1Y, 3Y, 5Y)**, not calendar years.

**Category ranking and peer comparison**
- One table per fund: rows "Your fund", "Category average", optionally "Difference";
  columns 1Y, 3Y, 5Y. Missing history shows "—", never zero.
- The blended figure stays as the rank basis and is labelled as such.

**Fund ranking**
- One row per horizon with the fund's rank and peer count ("1Y: 4 of 31"). A fund with
  no 5Y history is not in the 5Y peer group.
- The composite rank stays as the headline, clearly labelled.

**If calendar years are meant instead:** nothing computes this today; we would need
per-calendar-year NAV returns for the fund and every peer. Doable on top of
`warm_nav_history` / `_bulk_nav_on_or_before`, but it adds lookups per scheme and risks
the analytics speed fix, so it would need the same caching.

**Shared:** one reusable table component for both sections; mobile layout (scroll or
stack, matching the existing mobile sections); print view always expanded.

## 9. TER — rupee view and fund-wise TER table

**Today:** TER is percentage-only, weighted by the user's own holding value
(`WeightedTerSummary`, `DirectRegularTerComparison` in `schemas.py`; `analytics/ter.py`;
`TerSection.tsx`). No per-fund breakdown, no rupee figure.

**Plan**
- Rupee view: yearly cost = value × TER, shown beside the % on the portfolio, Direct
  and Regular cards (e.g. "0.82% · ₹4,100/yr").
- Fund-wise table: Fund · TER · Your value · Yearly cost, with Yearly cost split into
  1Y / 3Y / 5Y sub-columns, and a totals row. Funds with no TER show "—", stay out of
  the totals, and are listed (as `uncovered_schemes` already is).
- Backend: a per-fund TER list in the TER response plus yearly cost fields; update
  schemas, `types.ts` and PRD-04.
- Ties to item 6; mobile and print reuse `TerSection`.
- Tests: fund with no TER, only-Direct and only-Regular portfolios, totals that skip
  uncovered funds.

**1Y/3Y/5Y meaning (Q6):** (a) cumulative cost over 1, 3, 5 years at today's value and
TER — a projection, labelled as an estimate (recommended); or (b) actual cost paid over
the past 1, 3, 5 years, which needs TER history and holdings over time and may not be
supported by the stored data.

## 10. Scenarios — date range inside an opened scenario

**Today:** the picker card shows dates (`ScenarioPicker.tsx:38`); the opened screen
shows only the name (`ScenariosScreen.tsx:67`), except the multi-phase view, which has
dates per phase. The result already carries `scenario.start_date` / `end_date`, so
**no backend change**.

**Plan:** show the range under the name in `ScenariosScreen.tsx`, so every result shape
(standard, hypothetical, redemption freeze, multi-phase) gets it in one place. Ongoing →
"start – ongoing". No dates → show nothing. Match the picker's format (or change both,
Q8). Mobile check, one test per result shape.

---

## Suggested order

| Group | Items | Notes |
|-------|-------|-------|
| A. Verify first | 1 (cause of zero), 2, 7 (doc vs code) | Small; decides what else changes |
| B. Frontend only | 6, 10, 7 (copy), 5 (label only) | Small |
| C. Frontend + backend | 1 (chart), 3, 4, 9 | Medium |
| D. Larger | 8, 5 (per-horizon ranks) | Needs Q4/Q5 decided |

Cross-cutting: update PRD-04 and the response schemas for items 3, 4, 5, 8, 9; run only
the affected test files; check mobile and print views for every change; flag (don't
silently resolve) any conflict with a PRD, ADR or the schema.

## Open questions (need your answer before building)

1. **Item 1:** should switch-outs count as withdrawals? (Today they're internal movements.)
2. **Item 3:** a fund with two managers — (a) show overlapping percentages with a note,
   or (b) split the fund's value equally among its managers so they sum to 100%?
3. **Item 4:** per-period columns (recommended) or just a label on the existing numbers?
4. **Items 4/8:** is "year wise" trailing periods (1Y/3Y/5Y) or calendar years? If
   calendar, how many years back? Should the category average stay AUM-weighted?
5. **Items 5/8:** real separate rank per horizon, or fund returns per horizon beside one
   labelled composite rank?
6. **Item 9:** 1Y/3Y/5Y yearly cost — (a) estimate at today's value and TER, or (b)
   actual past cost?
7. **Item 9:** should the totals row show total yearly cost, matching the sum of funds?
8. **Item 10:** keep the picker's date format, or change both screens to a friendlier one
   (e.g. "Mar 2020 – Jun 2020")?
