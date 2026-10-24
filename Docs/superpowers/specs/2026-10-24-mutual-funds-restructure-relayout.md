# Mutual Funds Page — Restructure & Relayout

**Companion to:** `Docs/PRDs/PRD-06-Mutual-Funds-Page-Redesign.md` and
`Docs/orchestration/2026-10-23-mutual-funds-page-design.md` ("design.md" below). The owner
asked for "how the analytics section is being restructured" and "how the section is being
relaid-out" as two named documents (2026-10-24); both questions are answered by the same
underlying change, so this is one document covering both rather than two near-duplicates
repeating design.md's §0/§5/§6 — those sections are the source of truth; this document is
a short, directly-answerable framing of the same material for anyone who wants the
restructure/relayout story without reading the full design.md.

## 1. What "restructure" means here

**Before:** one long-scrolling analytics page (`features/analytics/`, 21 React
components, `AnalyticsView`) sitting separately from the holdings dashboard
(`DashboardView.tsx`). A user wanting "just Performance" or "just Overlap" had to scroll
past everything else.

**After:** 7 in-page tabs under the single `/portfolio/mutual-funds` route family (locked
by the nav-shell contract, design.md §0):

| Tab | Route | What moves here |
|---|---|---|
| Overview | `/portfolio/mutual-funds` | Today's `DashboardView` content, reshaped — summary strip, holdings table, AMC/family/insights, plus the new SIPs section |
| Performance | `/portfolio/mutual-funds/performance` | `BenchmarkSection` + the full `HistoryView`/`HistoryDetailModal` content (folded in, not trimmed) |
| Allocation | `/portfolio/mutual-funds/allocation` | `AllocationSection` (By-AMC half), `AssetAllocationSection`, `CapAllocationSection` (promoted to first-class), `FundManagerSection` |
| Holdings | `/portfolio/mutual-funds/holdings` | `StockHoldingsSection` |
| Transactions | `/portfolio/mutual-funds/transactions` | `InvestmentWithdrawalSection` + `PeriodBreakdownTable` |
| Fund Overlap | `/portfolio/mutual-funds/overlap` (exactly 3 artifacts total, see §3) | `OverlapSection`, fully rebuilt |
| Other Analytics | `/portfolio/mutual-funds/analytics` | `ValuationSection`, `TerSection`+`FundTerTable`, `CategoryRankingSection`+`PeriodReturnsTable`, `FundRankingSection`, `ScorerSection` family — grouped into 4 visually distinct sub-sections, not one flat list |
| Individual Fund page | `/portfolio/mutual-funds/funds/:schemeId` (in scope 2026-10-24) | Standalone page, own header + 3 tabs (Overview/Overlap Analysis/Insights); carries 2 of Fund Overlap's 3 artifacts — see §3 |

Full component-by-component mapping, with nothing silently dropped (every one of the 21
components has a named destination): design.md §6.

**Why this shape:** the owner's own framing was "full UI/UX revamp with little-to-no
backend change expected" — this restructure is a navigation/composition change (one long
scroll → 7 addressable routes reading the same already-computed data), not a data-model
change. See the TDD/backend-flow companion doc for the short list of items that ARE new
backend work.

## 2. What "relayout" means here

Each of the 7 destinations gets its own visual/interaction design pass — UI layout is
explicitly the builder's creative call per design.md's intro to §7, content/data mapping
is what's specified. Two sections were flagged by the owner as needing more than a
like-for-like port:

- **Transactions**: today's `InvestmentWithdrawalSection` UI was called "still pretty
  shit" by the owner — same ledger, same drill-down, same numbers, but a genuine visual
  hierarchy/interaction redesign, not a straight port (design.md §7.4).
- **Fund Overlap**: rebuilt from scratch per a fresh set of owner-provided reference
  screenshots (stat strip, Common Holdings table, Heatmap, Top Pairs + Key Insights,
  Impact donut) — see design.md §7.5 for the full relayout spec, and §3 below for how this
  is now splitting into multiple artifacts.

Every relaid-out page must also satisfy the cross-cutting interactivity rule (design.md
§11.1): every element is either meaningfully clickable with a visible cause-and-effect
link to what it changes, or hoverable with a popup. This rule is itself part of the
relayout story — it's why the Allocation mockup's Round 5 legend-click mechanic was
reworked in Round 6 (see the mockup file's own locked-note annotation for the before/after)
rather than left as "already built."

## 3. Fund Overlap's relayout is also a restructure (the two aren't fully separable here)

Originally Fund Overlap was one artifact (portfolio-level `/overlap`) with a fund-level tab
and a fund-vs-fund comparison screen scoped as *future, out-of-this-round* content
(design.md §7.5.1). The owner's 2026-10-24 instruction asked this to expand — **resolved
the same day via AskUserQuestion** to exactly 3 artifacts, not an open 3-vs-4 count:

1. **Portfolio-wide overlap** — `/portfolio/mutual-funds/overlap`, standalone route.
   Built: `2026-10-24-mutual-funds-overlap-mockup.html`.
2. **Individual-fund overlap** — the Individual Fund page's Overlap Analysis tab, **normal
   state**. Lives inside `/portfolio/mutual-funds/funds/:schemeId`, not its own route.
3. **Fund-vs-fund comparison** — the same tab's **comparison state**, reached only by
   clicking a row in (2)'s "Top Funds with Overlap" table. Also not its own route — one
   screen, two states, toggled in place with a labeled back control.

(2) and (3) are both built in `2026-10-24-mutual-funds-individual-fund-mockup.html`, and
are what the owner's original "two states" phrasing referred to — not a 4th artifact. This
was simultaneously a restructure (3 artifacts instead of 1, 2 of them newly brought
in-scope rather than deferred) and a relayout (each needed its own visual treatment),
which is why it's flagged here rather than filed under only one of the two document names.
No open question remains on count or shape for this section.

## 4. Temporary route retirement

`portfolio-mutual-funds-history` (`/portfolio/mutual-funds/history`) is a temporary-only
route — its content folds into Performance (§1 above) and the route retires once
Performance ships, per the nav-shell contract's own change-note process (design.md §0).
This is the one case where "restructure" includes a route actually disappearing, not just
content moving — flagged so it isn't missed during implementation.
