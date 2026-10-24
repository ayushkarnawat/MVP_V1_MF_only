# Mutual Funds Page (`/portfolio/mutual-funds`) — Design

**Status (2026-10-23, updated again same day):** First full pass written in one batch; the
owner then resolved all 12 flagged questions in `2026-10-23-mutual-funds-page-decisions.html`
in one message (Q1–Q9, Q11, Q12 settled outright; Q10/Overlap explicitly pulled out for its
own deeper design pass rather than a quick confirm — see §7.5). That revision folded every
answer in, corrected one factual claim from the owner's answer to Q5 against the real code
(the "we already run a background job for more indices" premise doesn't hold — see §7.1), and
both mockups were fully rebuilt to match. **Same-day follow-up revision:** the owner (a) picked
the recommended benchmark indices outright, closing Q5's last open sub-item, and (b) gave a
fully detailed, screenshot-referenced Overlap spec that **removes the two-fund compare feature
from the portfolio level entirely** — it moves to the future per-fund page instead, reached
only by clicking a row in that page's overlap table, never by a free picker at this level.
§7.5/§7.5.1 are rewritten accordingly, and this creates a genuine conflict with the locked
nav-shell contract's `portfolio-mutual-funds-overlap-compare` route (flagged in §0/§7.5, not
silently resolved). The owner also said they remain unhappy with both mockups' overall layout
fidelity and offered section-by-section reference screenshots — that offer is still open, see
§10. Nothing here is built as product code yet.

**Companion artifacts:**
- `2026-10-23-mutual-funds-page-decisions.html` — the one artifact to resolve every open
  question below.
- `2026-10-23-mutual-funds-skeleton-mockup.html` — box-and-label wireframe, every page.
- `2026-10-23-mutual-funds-hifi-mockup.html` — high-fidelity mockup, every page.

**Sibling precedent:** this follows the exact process and artifact shape used for the
Portfolio home page (`2026-10-23-portfolio-home-page-design.md` +
`-decisions.html`/`-skeleton-mockup-v9.html`/`-hifi-states.html`), including inheriting its
design-token system (DM Sans/Manrope, `--brand:#22C55E`, the data-viz palette, the
`.clickable` hover language) so the two pages feel like one product.

**Superseded 2026-10-24:** the per-fund detail page
(`/portfolio/mutual-funds/funds/:schemeId` + `/overlap` + `/insights`) was originally
out of scope this round (routes reserved by the nav-shell contract, page deferred to a
later design effort — §7.5.1 covered it only as a feasibility read). The owner has since
asked for it to be built now, specifically because the fund-vs-fund comparison feature
needs a home and §11.3 resolves that home as this page's Overlap tab. See §7.5.1 (now
in-scope) and §11.3 (resolved) below.

**Further update, 2026-10-24 (same day, end of session):** all 8 mockups (plus the
Transactions mockup, now formally tracked) are signed off, and a cross-cutting audit
against live production components has been completed and actioned — see §11.6 for the
4 findings and the 2 items explicitly deferred as frontend/production follow-up work.

---

## 0. Route map (locked by the nav-shell contract — not invented here)

Per `2026-10-22-nav-shell-contract-v1.md` §5/§10 (v1.2, confirmed 23 Oct), these paths and
route IDs are **fixed**; this design fills in what each one renders, it does not choose the
IDs or paths:

| Route ID | Path | Renders (this design) |
|---|---|---|
| `portfolio-mutual-funds` | `/portfolio/mutual-funds` | **Overview** — Sections 1-4 below. Replaces today's `DashboardView`. |
| `portfolio-mutual-funds-performance` | `/portfolio/mutual-funds/performance` | §7.1 Performance |
| `portfolio-mutual-funds-allocation` | `/portfolio/mutual-funds/allocation` | §7.2 Allocation |
| `portfolio-mutual-funds-holdings` | `/portfolio/mutual-funds/holdings` | §7.3 Holdings (stock look-through) |
| `portfolio-mutual-funds-transactions` | `/portfolio/mutual-funds/transactions` | §7.4 Transactions |
| `portfolio-mutual-funds-overlap` | `/portfolio/mutual-funds/overlap` | §7.5 Overlap — portfolio level, no compare sub-feature (resolved 2026-10-23) |
| ~~`portfolio-mutual-funds-overlap-compare`~~ | ~~`/portfolio/mutual-funds/overlap/compare`~~ | **Resolved 2026-10-24: removed by nav-shell contract v1.6.** The owner removed the two-fund compare feature from the portfolio level (2026-10-23); the comparison is a second state of the Individual Fund page's Overlap tab (§7.5.1, §11.3). |
| `portfolio-mutual-funds-analytics` | `/portfolio/mutual-funds/analytics` | §7.6 Other Analytics — today wraps the unchanged `AnalyticsView` per the shell's bridging rule; this design specifies what it becomes once rebuilt |
| `portfolio-mutual-funds-history` | `/portfolio/mutual-funds/history` | Temporary-only — content folds into §7.1 Performance, route retired once that ships (Q2 resolved) |
| `portfolio-mutual-funds-fund` (+`/overlap`,`/insights`) | `/portfolio/mutual-funds/funds/:schemeId` | **In scope as of 2026-10-24** — §7.5.1 is now the content spec (fund header/Overview, Overlap Analysis tab with its two states, Insights tab) |

Per the contract's §3 scope rule, moving between these seven in-page tabs **keeps the
picked household member** (doesn't reset to Family Combined like normal cross-page nav),
because they all belong to the same sidebar row ("Mutual Fund"). This extends to the future
per-fund page too (confirmed in the contract, §10).

The in-page tab strip itself is built with the shell's `<PageLayout tabs={...} />` prop
(§6) — this design does not build its own tab-switcher component.

---

## 1. Overview page — Section 1: Summary strip

Identical pattern to the Portfolio home page's Section 1 (`2026-10-23-portfolio-home-page-design.md`
§1 / hifi `.strip`/`.metric` markup), reused verbatim for layout and component, scoped to
Mutual Funds holdings only instead of all asset classes:

- **Total Portfolio Value** (MF only) + green/red sparkline, no "vs 1 Jan 2025" comparison
  line (explicitly removed per the owner — the home page's hi-fi mockup had drifted into
  inventing that line once already; see `feedback_locked_skeleton_content_fidelity`
  memory — this design states "no comparison line" explicitly so it can't drift back in).
- **Total Invested**, **Unrealised Gain**, **Realised Gain** — same metric definitions as
  the Dashboard today, scoped to MF.
- **XIRR** with the existing Lifetime/Current toggle + opening-balance disclaimer, reused
  verbatim from `DashboardView.tsx` (the exact block the sibling Home page design already
  reused — same component, same props, same disclaimer copy).
- Header: **"All Investments"** stays (not "Mutual Funds" — matches the owner's mockup).
  **"Add Investment"** button stays, reuses the existing import flow (`useImport()`).
  **"Sync Investments" is explicitly removed** — no backend change, this is a button
  deletion only.
- **A "synopsis."** **Q1 — resolved: Option A.** One auto-generated sentence, same pattern
  as the Home page's Quick Insights ("Spread across 6 AMCs and 24 funds, 72% Direct"). Zero
  new backend work — built from `allocation.by_amc` (AMC/fund count) and the existing
  `plan_type` split already in `HoldingRow`.

**Backend:** no new endpoint — same aggregate-on-request pattern as Home (BD1 in
`decisions.md`'s 2026-10-23 entry), scoped to `asset_class`-equivalent "mutual fund"
holdings only (already the only asset class with real data, so in practice no filter
changes today's totals).

---

## 2. Overview page — Section 2: In-page tab menu

A vertical column, the seven tabs listed in §0 (Overview active, the other six as links),
built with `<PageLayout tabs={...} />`. No search bar (confirmed fine to omit — the owner
dropped `HoldingsTable`'s existing "Search funds or AMCs..." search box from this redesign).
Filter/Sort controls visible in the owner's annotated mockup belong to Section 3's table,
not this column — confirmed with the owner mid-session, documented here so it isn't
re-litigated.

---

## 3. Overview page — Section 3: Holdings table

A new table, not a reskin of today's `HoldingsTable.tsx`. Columns, left to right, per the
owner's explicit order:

| Column | Source | Notes |
|---|---|---|
| **Mutual Funds (24)** heading | `holdings.length` | Live count, not a static label |
| Fund Name + AMC logo | `scheme_name` + `SchemeLogo` (`frontend/src/components/SchemeLogo.tsx`) keyed off `amc_name`/`scheme_name` via `getAmcInfo()` | **Reuse, not rebuild** — confirmed zero current callers of `SchemeLogo` in `HoldingsTable`/`FundDetailModal` (real gap in today's table, fixed by wiring this in) |
| Plan type | `plan_type` (Direct/Regular) via existing `PlanBadge` | **Q4 — resolved:** Direct/Regular only this round. Growth/IDCW logged in `DEFERRED_FEATURES.md` — no field anywhere in the schema or CAS-import pipeline distinguishes them today, and scoping it means checking what CAMS/KFintech statements actually expose first. |
| Category | `sebi_category` (new field, see Q3) | **Q3 — resolved:** add it. |
| Total Invested | `amount_invested` | Existing field |
| Current Value | `current_value` | Existing field |
| Gain/Loss | `unrealized_gain` (+ `realized_gain` for sold positions, see `SoldFundsSection` pattern) | Existing field |
| XIRR (Lifetime/Current toggle) | same per-row XIRR already computed for the Dashboard | Existing |

Rows clickable → future per-fund detail page (`/portfolio/mutual-funds/funds/:schemeId`) —
**out of scope this round**; until that page exists, rows should open today's
`FundDetailModal` as an interim behavior (cheapest option, zero new work) unless the owner
wants rows disabled instead. Not flagged as a decision — treated as the obvious interim
default; raise only if the owner disagrees.

**Q3 — resolved: add `sebi_category: str | None` to the dashboard `HoldingRow` schema.**
Frontend `types.ts` already declares `category?: string`; the backend Pydantic `HoldingRow`
(`backend/app/services/dashboard/schemas.py:55`) gets the new field, joined from the
scheme-master the dashboard already reads — additive, no migration, no new table.

**Cross-check the owner asked for, against the real code:** the owner pointed at "the market
cap allocation function" as possibly useful here. Checked — `cap_allocation.py`'s
`MarketCapClassification` table is a **different taxonomy at a different grain**: a per-*stock*
(ISIN-level) Large/Mid/Small/Other bucket, used for the equity look-through (Allocation page's
Market Cap section, Q6 below), not a per-*fund* category. The field this column actually
needs — `sebi_category`, a per-scheme string like "Flexi Cap Fund," "Large Cap Fund," "ELSS" —
already exists on the `Scheme` reference model (`backend/app/models/reference.py:28`) and is
already used by `category_ranking`/`ranking`. Both systems are real and already built; they
serve two different columns/pages (Category here, Market Cap on Allocation) and must not be
conflated when implementing.

**Q4 — resolved: Direct/Regular only this round.** Growth/IDCW deferred —
`DEFERRED_FEATURES.md`'s 2026-10-23 "Mutual Funds page redesign" entry.

---

## 4. Overview page — Section 4: AMC allocation + family + insights

Same structural pattern as the Home page's Section 4 (pie/donut + state list, family-member
breakdown bar, Quick Insights), reused and relabeled:

- **Donut: AMC allocation**, not asset-class allocation. **Already computed, zero new
  backend work** — `AllocationSummary.by_amc` exists today at the dashboard level
  (`schemas.py:118`, same shape as the asset-class buckets the Home page pie already
  consumes) and is already wired to `AllocationDrilldownModal` (click a slice/legend row →
  modal listing that AMC's holdings) in `DashboardView.tsx` today. Both the chart and legend
  rows clickable, same component, same interaction — direct reuse.
- **Family-member allocation** — identical pattern/component to the Home page's Section 4
  (clickable bar + row list, switches `useScope()`).
- **Quick Insights** — same concept as Home, different content. Candidates already
  computable without new backend work: "Spread across N AMCs and M funds," "X% Direct,
  Y% Regular," "Your largest single AMC exposure is X%" (same `by_amc` data), "₹X in active
  SIPs scheduled this month" (`investment_withdrawal.sip_summary`). These four are the
  direct MF-scoped analogues of the Home page's five and need no new decision — they're the
  reasonable default; flag only if the owner wants different ones.

---

## 5. Sub-pages — architecture note (read before §7)

**All 15 analytics sections are precomputed**, not computed per-request: a background job
recomputes all 15 for `"combined"` + every household member on CAS import/retry/daily
backstop, stored in `analytics_sections` keyed by `(user_id, scope_key, section)`, served
via one endpoint (`GET /analytics/{scope}`). **Q5 — resolved: stay inside this pattern.**
The owner chose precompute-every-combination (Option B) over a new on-demand endpoint,
explicitly prioritizing read speed over backend load/complexity. See §7.1 for what that
means concretely and a factual correction to the owner's stated premise about extra indices
already existing.

Everything else the owner asked for on the sub-pages (Allocation's five breakdowns,
Holdings' stock look-through, Overlap's heatmap/pairs/common-holdings/concentration) is
**already computed today**, just not laid out as its own page — see §7 for the exact field
mapping. This means most of the Performance/Allocation/Holdings/Overlap work is genuinely
"restructure the existing long scroll into discrete pages," matching the owner's own framing
("the analytics aspect... full UI/UX revamp with little-to-no backend change expected").

---

## 6. Current → new page mapping (full inventory, nothing dropped)

Every one of today's 21 analytics frontend components, mapped to its new home. Confirms the
owner's "nothing may be silently dropped" requirement — anything not obviously mapped is
called out as its own decision rather than silently placed:

| Today (`features/analytics/`) | New home |
|---|---|
| `AllocationSection` (By Category / By AMC) | Split: By-AMC → Overview §4 + Allocation sub-page; By-Category (SEBI) → Allocation sub-page |
| `AssetAllocationSection` (Equity/Debt/Gold/Cash-like + arbitrage toggle) | Allocation sub-page |
| `CapAllocationSection` (Large/Mid/Small/Other, embedded in AssetAllocationSection today) | Allocation sub-page, **own first-class section — Q6 resolved (A)** |
| `StockHoldingsSection` (top stocks + per-fund contribution) | Holdings sub-page — exact match for the owner's spec, already has `contributing_funds` |
| `OverlapSection` (heatmap, pairs, concentration curve) | Overlap sub-page main view — fully rebuilt, see §7.5 |
| `ValuationSection` (P/E, P/B vs indices) | Other Analytics, **"Cost & Valuation" group — Q7 resolved**, see below |
| `TerSection` + `FundTerTable` (cost analysis, Direct-vs-Regular) | Other Analytics, **"Cost & Valuation" group — Q7 resolved** |
| `CategoryRankingSection` + `PeriodReturnsTable` | Other Analytics, **its own distinct, clearly-sectioned group — Q7 resolved**, see below |
| `FundManagerSection` | Allocation sub-page (owner explicitly listed "fund manager" as one of Allocation's five breakdowns) |
| `FundRankingSection` | Other Analytics, **its own group — corrected 2026-10-23, see below.** This is the *non-proprietary* composite ranking (3Y return 25% / 5Y return 25% / category-relative 20% / low volatility 15% / low TER 15%) — distinct from the Scorer row below. Stays on the portfolio-level analytics pages; not removed, not moved. |
| `ScorerSection` + `ScoreExplainer` + `FundScoreCard` + `FundScoreDetailModal` | Other Analytics, **its own group — Q7 resolved**; this is Unifolio's *proprietary* Unifolio Score (45% Return / 30% Downside Risk / 25% Consistency). **Corrected 2026-10-23:** full detail view (tier badge, strengths/watch-outs, "how we calculate this") stays here permanently, in addition to eventually also appearing on the future per-fund page — not an either/or, not interim — **Q8 corrected, see §8** |
| `BenchmarkSection` | Performance sub-page, rebuilt per §7.1 |
| `InvestmentWithdrawalSection` + `PeriodBreakdownTable` | Transactions sub-page, unchanged in substance — **Q11 resolved (A)** — but its current UI is flagged by the owner as weak and needs a genuine visual redesign, not a straight port |
| `CoverageBanner` | Shared, reused wherever its parent section lands |
| `print/PrintAnalyticsView` | **Code untouched, UI entry point removed — Q9 resolved (C, modified)**, see §8 |

**Q7 — resolved: Other Analytics is not a flat grab-bag; it gets four distinct, visually
separated groups, each reads like its own mini-section rather than one undifferentiated
list.** The owner's reasoning: Category Ranking is a big, complex section and self-admittedly
doesn't belong flatly lumped with everything else, but also doesn't earn a full 8th top-level
tab on its own. Resolution:
1. **"Cost & Valuation"** — Valuation (P/E, P/B) + TER & Cost Analysis grouped together under
   one clearly labeled area (two cards/panels, shared heading) — this is also the data the
   future per-fund page's small expense-ratio box reuses, per the owner.
2. **"Fund Quality Scorer"** — unchanged, its own clearly separated group. This is Unifolio's
   proprietary score (45% Return / 30% Downside Risk / 25% Consistency vs. SEBI peers).
3. **"SEBI Category Ranking & Peer Comparison"** — its own clearly separated, visually
   distinct group (not folded into Allocation's category breakdown, not flattened into the
   same list as the other two groups) — large enough and different enough in kind (relative
   peer ranking vs. absolute cost/valuation numbers) to read as a section in its own right.
4. **"Fund Ranking"** — **corrected 2026-10-23, reversing the prior "removed entirely"
   call below.** Its own clearly separated group: the composite rank (3Y return 25% / 5Y
   return 25% / category-relative 20% / low volatility 15% / low TER 15%) with the leaderboard
   view (a fund's neighbors immediately above/below it in its category) shown live today.

**Correction, 2026-10-23 — Fund Ranking stays in Other Analytics; the earlier "removed
entirely" call conflated two distinct features and is reversed.** `FundRankingSection`
(attribute #09, the non-proprietary composite ranking above) is **not** the same thing as
`ScorerSection` (the proprietary Unifolio Score, item 2 above) — the original Q7 discussion
mistakenly treated "a proprietary per-fund ranking" as covering both. Fund Ranking is a
transparent, formula-only composite of return/volatility/cost metrics, not a per-fund-page-only
concept, and the owner confirmed it belongs on the portfolio-level analytics pages after all.
Separately, the proprietary Unifolio Score (`ScorerSection`) is **also** confirmed to keep its
full detail view here, permanently — not displaced by its eventual appearance on the future
per-fund page (see Q8's correction in §8). `DEFERRED_FEATURES.md`'s matching entry is corrected
to match — nothing here was ever deleted, this was a frontend-placement call, now reversed.

---

## 7. Sub-pages — content spec

UI layout/visual design for all six is explicitly the builder's creative call (the owner's
own words) — content and data mapping is what's specified here.

### 7.1 Performance

- **Detailed XIRR section** (not a bare number) — reuse the Dashboard's Lifetime/Current
  XIRR + disclaimer component, expanded with the per-fund XIRR table (`BenchmarkSection`'s
  Tab 2 already has this: fund XIRR vs its assigned benchmark).
- **Absolute return** — already computed: `investment_withdrawal.absolute_gain`. No new
  backend work.
- **Portfolio value history — the full `HistoryView` content, folded in verbatim (Q2/Q11
  resolved).** The owner was explicit this isn't a trimmed-down summary: everything
  `HistoryView.tsx`/`HistoryDetailModal.tsx` do today comes along, unchanged in substance,
  as a complete section inside Performance — not replaced by Section 1's sparkline, not
  reduced to a smaller chart. **Live-app reference now in hand (2026-10-23), confirming both
  pieces below exactly:**
  - The month-end value line chart with its 1Y/3Y/5Y/All range toggle, portfolio-value line
    + cost-of-holdings shaded area, "hollow dot = a fund had no price that month" annotation
    — `HistoryView.tsx`'s existing chart component, relocated, not rebuilt.
  - Click-a-month → the existing `HistoryDetailModal` unchanged: per-member filter chips,
    the four value/change/new-money/market-movement tiles, and the full per-fund table
    (units, NAV+date, value, cost) with its member-attribution subtext per row.
  - The temporary `portfolio-mutual-funds-history` route is retired once this ships, per the
    nav-shell contract's own change-note process (the contract names this exact condition:
    "until the Mutual Funds owner ships the real in-page menu").
  - This is additive to Performance, not a replacement for the benchmark section below —
    Performance ends up with three stacked blocks: XIRR+absolute-return, this value-history
    block, then the benchmark-comparison block.
- **Benchmark-comparison bar graph with a benchmark dropdown and a time-frame dropdown —
  Q5 resolved: Option B, precompute every combination; this is new, scoped backend work,
  not a reuse of an existing broader job.**

  **Correction to the owner's stated premise:** checked `nse_indices_client.py` and the
  `BenchmarkIndex` enum directly — there is no existing background job computing more
  indices than the 4 already in use. The enum has exactly 4 members
  (`nifty_50`/`nifty_500`/`nifty_largemidcap_250`/`nifty_midcap_150`), and the index-name
  mapping is a hardcoded 4-entry dict with a comment stating it's deliberately static
  ("only 4 members, no need to fetch IndexMapping.json at runtime"). Nothing today fetches
  or stores any other NSE index's history. Adding indices is itself new scoped work: add
  enum members, add their NSE trading-index name to the static mapping, backfill history via
  the existing `nse_indices_client` fetch-and-cache mechanism (same mechanism, more rows —
  not a new integration). **Resolved (2026-10-23): the owner confirmed the recommended
  candidates as-is — Nifty Next 50, Nifty Smallcap 250, Nifty 100, Nifty 200**, all served by
  the same NSE source with zero new integration. A non-NSE index (e.g. BSE Sensex) would need
  an entirely separate data source and stays out of scope unless specifically requested later.
  New `BenchmarkIndex` enum members + `_TRADING_INDEX_NAME` entries + a backfill for these 4,
  on top of the existing 4, is now buildable content for the plan.

  **Time windows:** 1Y / 3Y / 5Y / Since inception (matching `category_ranking`'s existing
  periods for familiarity), computed as **windowed XIRR**, which is new math — today's
  benchmark XIRR is always since-inception; a trailing-N-year XIRR needs its own cash-flow
  window logic, not a reuse of the existing since-inception calculation.

  **Precompute shape (Option B):** for each scope, store one payload per
  `(index × time-window)` combination chosen above — e.g. 4 (or more, once indices are
  picked) × 4 windows — inside the existing `benchmark`/`benchmark_funds` analytics
  sections' JSON, recomputed by the same background job that recomputes everything else on
  CAS import/retry/daily backstop. The frontend dropdown then just selects a key into an
  already-fetched payload — genuinely zero extra network round-trips once loaded, which is
  the speed property the owner is prioritizing.

### 7.2 Allocation

Five breakdowns per the owner's list — AMC, market cap, fund manager, category, asset
class — all five **already computed**, no new backend work beyond the category-column item
in Q3 (which is a holdings-table concern, not this page):
- AMC → `allocation.by_amc`
- Market cap → `cap_allocation`, **own first-class section (Q6 resolved, A)**. The owner's
  one condition: it must carry over **all** of `CapAllocationSection`'s current content —
  every bucket (Large/Mid/Small/Other), the equity-vs-total percentage split, the
  classification-as-of date, the drill-down row lists — nothing trimmed, just promoted to a
  standalone section instead of nested inside Asset Class's equity drill-down.
- Fund manager → `fund_manager`
- Category (SEBI) → `allocation.by_category` / `category_ranking`'s per-fund `sebi_category`
- Asset class → `asset_allocation` (equity/debt/gold/cash-like, with the existing arbitrage
  toggle)

### 7.3 Holdings (stock look-through)

- Top 10 stock holdings per fund — not directly computed today (today's `stock_holdings`
  section is portfolio-wide, not per-fund-top-10), but `contributing_funds` on each
  portfolio-wide stock row already carries `fund_weight_pct`/`stock_weight_pct` per fund,
  so a per-fund top-10 view is a client-side re-sort of already-returned data, not new
  backend computation.
- All stock holdings across the portfolio, stock name + allocation % + contributing-fund
  count/list — **exact match**, already computed (`stock_holdings.rows[].contributing_funds`).

### 7.4 Transactions

**Q11 — resolved: Transactions = `InvestmentWithdrawalSection`'s cash-flow ledger**
(invested/withdrawn/switched, monthly/yearly buckets, drill-down to dated per-fund
transactions via `PeriodBreakdownTable`), unchanged in substance, restructured into this
page's layout. `HistoryView`'s value-over-time content does **not** live here — it folds
into Performance instead (§7.1) per Q2's resolution.

**The owner flagged today's UI for this content as weak ("still pretty shit") and wants a
genuine visual redesign here** — not a like-for-like port of `InvestmentWithdrawalSection`'s
current look. Data/behavior stays the same (same ledger, same drill-down, same numbers);
layout, visual hierarchy, and interaction polish get the same "insane creativity within the
color/font system" treatment as the rest of this page. No new backend work either way.

### 7.5 Overlap — portfolio level, `/portfolio/mutual-funds/overlap` (resolved 2026-10-23, supersedes the previous revision)

**Superseding update:** the owner walked through a fresh, more precise set of reference
screenshots and made one structural decision explicit, stated twice: **there is no two-fund
compare feature at the portfolio level — no `/overlap/compare` route, no picker, nothing.**
The compare feature the previous revision placed at `§7.5.1` has moved entirely to the
*fund-level* page (see the repurposed §7.5.1 below) — it's reached only by clicking a row in
that page's "Top Funds with Overlap" table, never by picking two funds from the portfolio
Overlap page. This also drops the standalone "portfolio exposure to common vs. unique
holdings" 2-way split from the previous revision — the owner's new reference shows a more
refined 3-way version of the same idea (Impact section, below), so that supersedes it rather
than sitting alongside it.

**⚠ Conflicts with the locked nav-shell contract — flagging per CLAUDE.md's working-style
rule rather than silently resolving:** v1.2 reserves `portfolio-mutual-funds-overlap-compare`
→ `/portfolio/mutual-funds/overlap/compare` specifically for this page. With the compare
feature removed from this level entirely, that route has nothing to render. Since the owner
is already coordinating with the nav-shell owner on the fund-level page's routes, the clean
fix is to have that conversation cover dropping (or repurposing) this route in the contract's
next revision — not something this design can resolve unilaterally. Not treating this as
"my call to make quietly."

**Everything below is already computed today** (`overlap` section: `matrix`,
`pairs_above_low`, `concentration`, `bands`, plus `stock_holdings.rows[].contributing_funds`
for the fund-logo/exposure detail), so this whole page is a UI/composition build, not a
backend gap — except the two sub-items flagged inline below.

**Top stat strip (4 tiles, sits above all four sections):**
- **Funds analysed** — e.g. "12 of 15" with a sub-line "3 funds excluded due to unavailable
  holdings." **Needs a backend check, not yet confirmed:** does `overlap` already track which
  owned funds it excluded (e.g. missing look-through data) separately from the funds it
  scored, or does it only ever return the funds it *could* score? If the latter, "excluded"
  count is new, derivable as (total owned funds) − (funds present in `overlap.matrix`) — cheap,
  but worth stating as new rather than assuming it's already there.
- **Fund pairs with overlap** — e.g. "8 pairs" with sub-line "out of 66 possible pairs (12
  funds)." The denominator is `nC2` of the analysed-funds count — trivial client-side math,
  not a new backend field.
- **Highest overlap** — e.g. "64%," sub-line names the top pair. Max of `overlap.matrix`.
- **Overlap risk** — a qualitative label (Low/Moderate/High banded off `overlap.concentration`
  or the highest-pair %) with a one-line explanation. New, simple banding logic, not new data.

**Section 1 — Common Holdings:** table, columns # / Stock / Held in (N funds) / Total
Portfolio Exposure % / Top Funds (logo chips with a "+N" overflow badge). Shows the top 10 by
default, "View all common holdings →" expands to the full list. Built from
`overlap.matrix[pair].common_stocks` aggregated across every overlapping pair plus
`stock_holdings.rows[].contributing_funds` for the per-stock fund list and exposure %.

**Section 2 — Overlap Heatmap:** fund × fund grid, cell = overlap % banded into 3 tiers —
**Low (<20%) / Moderate (20% to <40%) / High (≥40%)** — a legend with those 3 bands, not the
older reference screenshot's 4-tier legend (<10% / 10-25% / 25-50% / >50%). **Resolved
2026-10-23:** that 4-tier legend doesn't match anything this backend computes; the real
thresholds are `OVERLAP_BAND_LOW`/`OVERLAP_BAND_HIGH` = 20/40 in `overlap.py` (also asserted in
`test_overlap.py:69`), confirmed live in both the 2026-10-23 analytics PDF and the live-app
overlap-matrix screenshot. From `overlap.matrix`/`overlap.bands`, rebuilt in this product's own
palette, not the reference's literal colors.

**Section 3 — Top Overlapping Fund Pairs:** table, columns # / Fund 1 / Fund 2 / Overlap %
(colored bar) / Shared Stocks / Combined Weight, with "View all fund overlaps →" to expand.
Below it, a **Key Insights** callout box with 2-3 auto-generated sentences (e.g. "Kotak Multi
Cap and JM Flexi Cap have 64% common holdings, making them highly similar," "Your top 3
overlapping pairs account for 41.1% of your portfolio value," "Consider reviewing these funds
to improve diversification"). From `overlap.pairs_above_low` plus a new lightweight
sentence-generation step — same pattern as Q1's Overview synopsis, not a new data source.

**Section 4 — Overlap Impact on Your Portfolio:** a radial/donut gauge, center value "41.1%
of portfolio in top 3 overlapping pairs," with a 3-row legend: Top 3 overlapping pairs (%, ₹),
Other overlapping pairs (%, ₹), Unique holdings (%, ₹). From `overlap.concentration`/`bands`
cross-referenced with portfolio value — this is the resolved, more precise replacement for the
previous revision's 2-way common/unique split.

#### 7.5.1 Individual Fund page (`/portfolio/mutual-funds/funds/:schemeId`) — in scope as of 2026-10-24

**Status change, 2026-10-24:** this sub-section was originally written as a feasibility
read only ("how much of these can we do and how much we cannot"), explicitly out of scope
for this round. The owner has since asked for this page to be built now. The content below
is unchanged from the original feasibility read (it was already detailed and
screenshot-referenced) — only its status changes, from "context only" to "the spec."

**Page shape, resolved 2026-10-24 (§11.3):** a single page with its own header and tabs —
not a standalone Overlap-only page. Tabs: **Overview** (fund header fields below, reused
for every tab), **Overlap Analysis** (this sub-section's content, with two states — see
below), **Insights** (points at the existing Fund Quality Scorer detail view, §6/§8 —
same full detail component Other Analytics already shows, not a rebuild).

**Overlap Analysis tab — two states of one screen, not two routes (resolved 2026-10-24,
§11.3):** the owner's "two states" phrasing refers to this tab specifically — a **normal
state** (this fund's own overlap-with-portfolio view, first list below) and a **comparison
state** (fund-vs-fund, second list below), reached by clicking a row in the normal state's
"Top Funds with Overlap" table. Both states render inside the same tab/screen (toggle, not
navigation to a different URL) — matching the original "reached only by clicking a row"
mechanic, now confirmed as the final shape rather than a placeholder. Returning from the
comparison state back to the normal state is itself a interactive affordance per §11.1 (a
clearly labeled back control, not a browser-back-only escape).

**Fund-level Overlap Analysis tab, normal state, per the owner's walkthrough — build,
feasibility all "yes, already-computed data" unless noted:**
- Fund header: name/logo, plan badge, Current Value, AUM, Expense Ratio — all already-computed
  fields (same ones §7.5.1's old content and §3's holdings table already use).
- Overlap-with-portfolio donut: overlap %, "N common stocks out of A total holdings." From
  `overlap.matrix` scoped to this one fund.
- Common Holdings table, Overlap Distribution bar (unique-to-this-fund / common / unique-to-
  others), Common Holdings by Sector bar chart, Quick Insights / Key Takeaways box — all the
  same `contributing_funds`/`sector_raw` derivations §7.3/§7.5 already use, scoped to one fund.
- **Explicitly drop, per the owner:** the "Our view / Consider Review" recommendation callout,
  and "See recommended alternative funds" — neither gets built, at this level or the fund-vs-
  fund screen below.
- **Top Funds with Overlap** table: Fund Name / Overlap % / Common Stocks. **No Action column**
  — the owner explicitly dropped it ("the action column should be dropped as well, it doesn't
  matter"). Row click is the *only* entry point into the fund-vs-fund comparison screen below —
  there is no separate picker anywhere on this page either.

**Overlap Analysis tab, comparison state (reached only by that row click, same tab/screen as the normal state above):**
- Header: both funds' name/logo/plan badge, Current Value/AUM/TER for each, and an overlap
  donut with "N common stocks out of X and Y total holdings."
- Tabs: Overview / Common Holdings / Unique Holdings / Sector Comparison / Market Cap
  Comparison / Performance Comparison.
- Portfolio Overlap: counts (unique to A / common / unique to B) plus a ₹/% donut split across
  common-both-funds / unique-to-A / unique-to-B / other funds. Same `overlap.matrix[pairKey]`
  and `contributing_funds` derivation as the old §7.5.1 draft's two-fund content.
- Sector Exposure Comparison: grouped bars, common holdings vs. Fund A vs. Fund B, by sector —
  same `sector_raw` grouping as the portfolio-level design already specifies elsewhere.
- Common Holdings table: stock / sector / Fund A weight / Fund B weight / combined weight.
- Unique Holdings: two-column top-5 lists per fund, same derivation as the portfolio page's
  Common Holdings section, scoped to two funds.
- Key Takeaways callout — same auto-generated-sentence pattern as §7.5's Key Insights.
- **One genuinely new data need:** the Market Cap Comparison tab needs per-fund market-cap
  buckets (the same `MarketCapClassification` data §7.2's Allocation page already surfaces
  portfolio-wide) computed per individual fund instead — a new aggregation over existing data,
  not a new backend field.

**Net feasibility read:** everything above is buildable from data this design already relies
on (`overlap.matrix`, `stock_holdings.rows[].contributing_funds`, `sector_raw`,
`MarketCapClassification`) — zero new backend integrations anticipated, same as the portfolio-
level page. The only new backend *work* (not new data sources) is: per-fund market-cap
aggregation, the "excluded funds" count flagged in §7.5's top-stat-strip, and whatever route
the nav-shell owner settles on. None of this blocks the current round's build.

### 7.6 Other Analytics

**Q7 — resolved**, see §6 above for the four-group structure (Cost & Valuation / Fund
Quality Scorer / SEBI Category Ranking & Peer Comparison / Fund Ranking — the last restored
2026-10-23, not removed). Until
rebuilt, this route wraps the unchanged `AnalyticsView` per the shell contract's bridging
rule; this design now specifies its target content (§6), so it's no longer the lowest-detail
sub-page, just still lower build priority than the other five per the owner's own framing.

---

## 8. Cross-cutting questions — resolved

**Q8 — corrected 2026-10-23.** Original resolution (B) had `FundScoreDetailModal` migrate
to the future per-fund page's `/insights` route, with Other Analytics' Scorer group keeping it
only as an interim measure. The owner has since confirmed this is not an either/or: the full
detail view (tier badge, strengths/watch-outs, "how we calculate this" methodology text) stays
in Other Analytics' Scorer group **permanently**, in addition to also appearing on the future
per-fund page once built. Both surfaces show the same detail, independently — nothing here is
interim or scheduled for removal.

**Q9 — resolved (C, modified): hide the UI entry point, keep all code working and
untouched.** Not a straight "defer and leave visible" — the owner wants the "Download PDF"
affordance **removed from the frontend** across the new Mutual Funds pages (no visible button
anywhere in this redesign), while `pdf_export.py` and every frontend PDF-export component
stay in the codebase, fully functional, unchanged — dormant, not deleted. Logged in
`DEFERRED_FEATURES.md`'s 2026-10-23 entry specifically so a later cleanup pass doesn't treat
the now-unreferenced button component or route as dead code and remove it. Revisit
combined-vs-per-page export once the six pages are built and proven.

**Q10 — resolved**, superseded by the full Overlap rebuild in §7.5/§7.5.1 above (the owner
pulled this out of a one-line confirmation into its own detailed spec, then revised it again
on 2026-10-23 with reference screenshots to remove the compare feature from the portfolio
level entirely and relocate it to the future per-fund page).

**Q12 — resolved (A), confirmed.** `FundDetailModal` stays the interim click target for
holdings-table rows. Noted context (not a scope change): the owner says the real per-fund
page is being designed/built in parallel to this page, so this interim modal may be
short-lived — when that page ships, Section 3's rows should be repointed to it as a small
follow-up change, not re-litigated as a fresh decision.

---

## 9. Explicitly deferred / not in this round

- ~~Per-fund detail page~~ — **moved in-scope 2026-10-24**, see §7.5.1/§11.3. Fund Ranking
  and the Fund Score detail modal's eventual home both point here (§6, §8) — unchanged by
  this status change, the modal still also keeps its permanent home in Other Analytics
  (§8's Q8 correction).
- `scenario_engine`/`scenario_asset_class` ("Scenarios") — not part of the owner's 7-tab
  list, not touched by this design, stays wherever it lives today (`/planning/scenarios`
  per the nav-shell contract).
- Growth/IDCW plan sub-type (Q4) and the PDF export UI (Q9, code kept, button hidden) — both
  logged in `DEFERRED_FEATURES.md`'s 2026-10-23 "Mutual Funds page redesign" entry.
- (Resolved 2026-10-23: the 4 additional benchmark indices are now picked — Nifty Next 50,
  Nifty Smallcap 250, Nifty 100, Nifty 200, see §7.1. Dropped from this deferred list.)

---

## 10. Next step

All 12 flagged questions are resolved, including the benchmark-index sub-item (2026-10-23:
Nifty Next 50, Nifty Smallcap 250, Nifty 100, Nifty 200). The Overlap section was then
substantially revised the same day per new reference screenshots (§7.5/§7.5.1) — both mockups
need another targeted rebuild of just the Overlap section to match. Two things still need the
owner's input before `superpowers:writing-plans`:
1. ~~The nav-shell route conflict flagged in §0/§7.5 (`portfolio-mutual-funds-overlap-compare`
   has nothing to render now)~~ — **resolved 2026-10-24**: contract v1.6 removes the route.
2. The owner said they remain unhappy with both mockups' overall layout fidelity (beyond
   Overlap) and offered to provide section-by-section reference screenshots — that offer is
   still open; worth taking them up on it before doing another full blind rebuild pass of the
   other five sub-pages.

---

## 11. Cross-artifact design philosophy (consolidated 2026-10-24 — supersedes any
    narrower statement of the click→panel pattern earlier in this doc)

**Status:** this section is the single source of truth for every section-by-section
decision across every mockup artifact in this sub-project (Overview, Performance,
Allocation, Holdings, Transactions, Fund Overlap variants, Other Analytics, and the
future Individual Fund / Fund Comparison pages). Written after Round 5 of the Overview/
Performance/Allocation mockups, in response to the owner's explicit instruction to
"broaden design sense," consolidate everything discussed so far, and fix a named
anti-pattern before any further artifact is built. Per the owner: **"If it fits in this
philosophy, do this"** — i.e. every future section-level design call should be checked
against §11.1 before anything else.

### 11.1 The interactivity rule (hard requirement, zero exceptions)

Every element on every page is one of exactly two things:

1. **Clickable, with real UI/UX meaning.** A click must (a) have a visible,
   unambiguous cause-and-effect connection to whatever it changes — the user should
   never wonder "why did that happen when I clicked this?" — and (b) actually do, show,
   or let the user edit something they're glad to know, not just surface a value that
   was already visible. A click that updates some other part of the page with no visual
   link back to what was clicked is a **dead click** even if it technically "does
   something" — the owner's standard is "the user has no idea why I'm clicking this" is
   a failing outcome regardless of whether the backend-equivalent data changed.
2. **Not clickable, but hoverable with a popup.** If an element carries information
   worth surfacing but isn't a candidate for #1 (nothing meaningful to drill into, nowhere
   useful to send the user), it must still respond to hover with a popup/tooltip. Static,
   inert elements that are neither clickable-with-meaning nor hoverable are not allowed.

**Reference patterns — "done perfectly," re-use this shape, don't reinvent it per
section:**
- **Performance's benchmark "race track"**: clicking a marker on the horizontal track
  opens a detail panel directly tied to that marker (the panel's position/framing reads
  as "born from" the click point, not just a passive refresh of an unrelated panel).
- **Overview's SIP date-capsule timeline**: clicking a capsule/tab is self-evidently
  about that date/tab; the resulting content change is spatially and visually anchored
  to the thing clicked.
- **Market Cap's `.drill-panel`/`.drill-row` mechanic** (Allocation page, pre-existing):
  clicking a stock row expands a panel immediately beneath that row, with the row itself
  visibly marked as "open" (e.g. highlighted/expanded chevron) — the connection between
  click and result is physically adjacent and visually marked, not just "something below
  changed."

**Named anti-pattern — what NOT to do, and the reason the Round 5 Allocation legend-click
work must be reworked:** a legend row (Asset Class / Category-AMC donut legends) that,
when clicked, silently updates a separate drill panel elsewhere on the card with no
highlight on the clicked row, no visual connector, and no framing that ties the panel's
new content back to the specific row clicked. This technically "worked" (data was
correct, no dead click in the literal sense) but fails the rule because the user has no
way to perceive *why* the panel changed. **Fix direction for any such case:** mark the
clicked row as visibly active/selected (background tint, left-border accent, or similar —
matching the existing `.mgr-row.is-open` chevron-rotation treatment already used
elsewhere on the same page), and keep the resulting panel adjacent enough, and clearly
re-titled with the clicked item's name, that the cause-effect link is obvious at a glance
— the same physical-adjacency-plus-explicit-labeling shape as the Market Cap drill-row,
not a new mechanic.

### 11.2 Functional capabilities that must survive UI redesign even when not visually
    obvious in a given mockup

Two capabilities were flagged this round as things a UI redesign must not silently drop,
even if the final visual never looks like the old dropdown-based UI:

- **Performance — benchmark index selection + time-window selection.** The owner's
  concern: replacing the old benchmark dropdown + time-frame dropdown with the chip-based
  index toggles and segmented time-window control (Round 5) must not be read as removing
  the *capability* to choose which benchmark(s) to compare against and which window
  (Since Inception / 1Y / 3Y / 5Y, per §7.1) to view. The chip/segmented-control UI
  already satisfies this functionally (confirmed: it's the same selection action in a
  different widget shape) — this is **documented here as a hard requirement on the
  plan**, not a mockup-level change. Any future rebuild of Performance must preserve
  "pick benchmark(s), pick time window" as a user action somewhere on the page, in
  whatever visual form fits that round's creative pass.
- **Allocation — selectable chart representation per breakdown.** By AMC, By Fund
  Manager, By Category (SEBI), and By Asset Class must each let the user pick how that
  breakdown is visualised — pie/donut, bar graph, or another chart type — rather than
  being locked to a single fixed visualization (today's Round 5 mockup uses donuts
  throughout; this is a **new requirement**, not yet built into any mockup). Market Cap's
  section is unaffected unless the owner says otherwise — it wasn't named in this
  requirement. **Open build note:** the per-section chart-type picker itself must also
  satisfy §11.1 — i.e. switching chart type is an explicit, visibly-labeled control
  (e.g. a small pie/bar toggle in the card header), not a hidden gesture.

### 11.3 Fund Overlap — restructure into multiple artifacts (resolved 2026-10-24)

The owner's original instruction (2026-10-24, verbally dictated): *"the overlapping
artifact that you will make will actually be four artifacts or three artifacts, which is
the overall portfolio one, the overall individual one, the comparison one, the two states,
and everything."* Asked directly for clarification; resolved as follows.

**Final shape — 3 artifacts, confirmed:**
1. **Portfolio-wide overlap** — `/portfolio/mutual-funds/overlap`, the existing §7.5 spec
   (stat strip, Common Holdings, Heatmap, Top Pairs + Key Insights, Impact donut).
   Standalone top-level route, unchanged.
2. **Individual/single-fund overlap** — the Overlap Analysis tab on the Individual Fund
   page (`/portfolio/mutual-funds/funds/:schemeId`, now in-scope — §7.5.1), **normal
   state**: fund header, overlap-with-portfolio donut, Common Holdings table, Overlap
   Distribution bar, Sector bar, Quick Insights.
3. **Fund-vs-fund comparison** — the same Overlap Analysis tab's **comparison state**,
   reached by clicking a row in state 2's "Top Funds with Overlap" table. Not a separate
   route — a second state of the same tab/screen.

**"The two states" — resolved:** this phrase refers specifically to item 2/3 above — the
Individual Fund page's Overlap Analysis tab has exactly two states (normal, comparison),
not two separate pages. The owner confirmed this directly: *"The two states I['m] trying
[to] say [is] individual normal state, individual comparison state — one we answered
before. Not anything particular, just individual fund overlap normal state, individual
fund overlap comparison state."* So the "4 vs 3" ambiguity resolves to **3**: the "4th"
candidate some phrasings implied doesn't exist as a separate artifact — the comparison
view was always going to exist, just as a state rather than a route.

**Individual Fund page itself — resolved (separate confirming question, same session):**
it's a standalone page with its own header/tabs (Overview, Overlap Analysis, Insights),
not the same artifact as the overlap tab alone — see §7.5.1's rewritten intro.

**"CDD" document — resolved:** skipped. No standard CDD convention exists elsewhere in
this repo (PRD/TDD/ADR are the established set); the owner confirmed this is fine to skip
rather than invent a document type with no precedent — the PRD/TDD/restructure docs
already cover the same ground.

### 11.4 Data-consistency discipline (carried forward, now stated as a standing rule)

Any fund name that appears in more than one place on the same page — a legend drill-list,
a table row, a detail panel, a modal — must carry exactly one ₹ value everywhere it
reappears, unless the two figures are legitimately different aggregation levels (e.g. a
fund split across co-managers, where the page's own caption already explains the split).
Established this round while building Allocation's drill-datasets; re-check this
explicitly before shipping any new artifact that reuses the same sample-fund dataset
across sections.

### 11.5 Document set for this sub-project (location convention, repo-standard)

Following this repo's existing convention (`Docs/PRDs/` for PRDs, `Docs/superpowers/
specs/` for specs, `Docs/superpowers/plans/` for implementation plans), the full
document set requested for this sub-project, beyond this design.md and the HTML mockups,
is tracked and built incrementally rather than invented ad hoc per artifact — see the
handoff document for the current build status of each.

### 11.6 Cross-cutting audit (2026-10-24) — 4 findings against live production, 2 deferred

After all 8 mockups were signed off, every production component under
`frontend/src/features/analytics/` was audited against each mockup's own "Data source
mapping" table (grep for the production component's actual field names — zero matches
meant genuinely absent, not just renamed). Full per-finding record:
`Docs/orchestration/2026-10-24-mutual-funds-cross-cutting-audit-findings.md`.

1. **Investment & Withdrawal cashflow** (Transactions) — not a missing feature as first
   flagged; 3 genuinely missing fields (SIP/missed-instalment summary, gifts-net,
   opening-holdings) built in full.
2. **`CoverageBanner`** (present only in Allocation) — missing from Holdings, Other
   Analytics, Fund Overlap. Per owner instruction, a simple headline-%-only stub was
   added to all 3 rather than the full port. **Deferred:** the per-fund reason list
   (not-published/not-available/stale) + derivative-exclusion share, for all 3 sections —
   Allocation's existing `.coverage-banner` markup is the template.
3. **`ValuationSection` edge states** (Other Analytics) — `hide_headlines`/`enough_data`
   thresholds and the `footnotes` array had no mockup representation. Per owner
   instruction ("same for this" as #2), a one-line both-thresholds sentence + one example
   footnote was added. **Deferred:** the real hidden-ratio/not-enough-data rendered
   states, the full per-stock exclusions list, the full footnotes array.
4. **Stock Concentration** (Fund Overlap) — entirely absent. Per owner instruction ("same
   vibe, creatively presented... UX/UI should be enhanced"), built in full as a new
   Section 5: SVG cumulative-exposure curve, clickable concentration chips, and a
   headline sentence, following the §11.1 interactivity rule exactly as production does
   (chart, chips, and headline all call the same destination, matching
   `OverlapSection.tsx`'s single shared `onOpenStocks` handler). The 3 smaller edge
   states it also surfaced (sub-2-funds empty state, no-pairs-above-threshold empty
   state, matrix-truncation note) are documented in an inline "what this section shows in
   other scenarios" panel rather than live-toggled — building live toggles would require
   degrading the already-signed-off 12-fund/20-pair happy-path dataset.

Both deferred items (#2, #3) are frontend/production implementation gaps, not design
decisions still pending — see the TDD/backend-flow companion doc §6 for confirmation that
no new backend computation is needed for either, and the handoff doc's item 8/9 for where
this is tracked going forward.

