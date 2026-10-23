# Individual fund page: desktop layout and states (draft v1)

**Status:** draft, 2026-10-23. Planning only. Doc 2. Layout and behaviour, not visual design (that is the design workbook). Shell contract v1.4: route ids `portfolio-mutual-funds-fund` (Overview), `-fund-insights`, `-fund-overlap`; path `/portfolio/mutual-funds/funds/:schemeId` (+ `/insights`, `/overlap`); layout `app`; scope `family-or-member`. Mobile untouched.

## 1. Page frame (both tabs)

```
+--------------------------------------------------------------------+
| Breadcrumb: Investments > Mutual Funds > <Fund name> [> Insights]  |
+--------------------------------------------------------------------+
| [logo] <Fund name>                         [+ Add Investment] [...] |
|        Direct Plan · Flexi Cap · <AMC>      (both greyed, L10/D2)   |
+--------------------------------------------------------------------+
| Overview tab only: stat row (5 tiles) + score card                  |
+--------------------------------------------------------------------+
| Tabs: Overview | Overlap (greyed) | Insights                        |
+--------------------------------------------------------------------+
| tab content                                                         |
```

The title block and tab strip are shared by both tabs (they are the page's `PageLayout` header). The stat row and score card sit above the tab strip on Overview and are not shown on Insights (PDF p.26). Tab switching changes only the route, so the member picked in the shell is kept (contract section 3, same sidebar row).

## 2. Overview tab (desktop at 1280 px and wider)

```
+-----------------------------------------+----------------------------+
| Performance chart (chips 1M..All,        | Your Investment Details    |
| legend with three figures)               | (units, NAV, amounts,      |
|                                          |  dates, folios)            |
+-----------------------------------------+----------------------------+
| Returns table (Inception | Current)      | Risk Metrics (3Y)          |
+-----------------------------------------+----------------------------+
| Top 10 Holdings (two columns of five,    | Fund Allocation (donut,    |
| View all holdings)                       |  three tabs)               |
+-----------------------------------------+----------------------------+
```

Left column about 62% of the width, right column about 38% (as the PDF). Below 1280 px the right column stacks under the left in the order Performance, Your Investment, Returns, Risk, Top 10, Allocation. Minimum supported width 1024 px.

## 3. Insights tab

```
+--------------------------------------------------------------------+
| Smart Insights (Beta): three fact cards (performance, overlap,     |
| management), Ask Mira a follow-up (opens the Mira popup)           |
+-----------------------------------+--------------------------------+
| Key Insights                      | Strengths and Considerations   |
+-----------------------------------+--------------------------------+
| Rolling Returns                   | Period Returns                 |
+-----------------------------------+--------------------------------+
| Risk-Return (3 Years)             | Fund Manager and Strategy      |
+-----------------------------------+--------------------------------+
```

Two equal columns at 1100 px and wider, one column below. The three-column version in the first mockup looked crowded (owner, 23 Oct), so the page uses two columns, 20 px gaps and roomier cards. The monthly added/removed stocks block was dropped by the owner and is not part of this page.

## 4. Loading order and data

Tier 1 on mount (`summary`), tier 2 together (`performance`, `returns`, `risk`, `portfolio-composition`, `manager`), tier 3 afterwards and lazily (`score`, `peers/*`, `insights`); on the Insights tab the Insights tab's calls start when the tab is opened (and tier 1 is reused). Each section fetches and renders on its own; a failed section shows its own card error and the page never blanks.

Measured on staging (23 Oct): tier 1 and 2 content is ready almost immediately from stored prices; tier 3 cards (category line, score, peer cells, insights, scatter, rolling, period returns) take 2.0 to 4.5 s the first time a category is opened in a process, so they show skeletons for that long and then fill in; later opens in the same category are fast.

## 5. State matrix (per section)

| Section | Loading | Empty or unavailable | Partial | Error | Not held (E4) |
|---|---|---|---|---|---|
| Title block | name skeleton | unknown fund: not-found page | no logo: initials tile | page error | normal |
| Stat tiles, details | tile skeletons | none | share of portfolio hidden if not computable; XIRR "n/a" if not computable | tile error with retry | "Not held by <name>" with a link to Family Combined |
| Score card | ring skeleton | "Not enough history" or thin-category note | stored vs computed has no visible difference | card error | shown (fund-level) |
| Performance | chart skeleton | "No price history yet" (CAS-only fund) | fund younger than period: "Since launch" note; benchmark missing: line omitted with note; category pending: third line fades in | chart error | shown |
| Returns table | row skeletons | dashes for periods longer than the history | category cells pending until tier 3; Current mode hidden columns | table error | Current mode: "Not held by <name>"; Inception shown |
| Risk metrics | bars skeleton | "Not enough history" (under 1 year) | window shorter than 3 years is printed; beta missing for non-equity funds | card error | shown |
| Top 10, allocation, all holdings | skeleton | "Holdings not available yet for this fund house" | age tag "older than 60 days" | card error | shown |
| Smart Insights cards | card skeletons | "Not enough data to draw insights yet" | fewer than three cards | card error | shown, overlap fact skipped |
| Key Insights, Strengths, Considerations | list skeleton | rule with a missing input is skipped; none left: "Not enough data to draw insights yet" | list shows what could be computed | card error | shown, overlap and personal facts skipped |
| Fund manager | skeleton | "Manager details not available for this fund house" | name and tenure only (L9) | card error | shown |
| Rolling, Period Returns, scatter | chart skeleton | thin category note on the scatter | fund younger than the window: shorter line with a note | chart error | shown |

## 6. Scope behaviour (family versus member)

Under Family Combined: units, amounts, folios and XIRR are summed or pooled across members; the folio list names the member. Choosing a member in the shell re-scopes the personal sections only; fund-level sections (chart, risk, composition, manager, peers, insights except overlap) do not change. A member who does not hold the fund sees the fund with personal tiles replaced by the short message (E4 A).

## 7. Interactions (L14, D1 A)

Every figure, row, chip and chart element responds; the full list is the click map (workbook section 10): tiles open drill-downs, rows open evidence popups, chart points show tooltips, period chips and legend items change the chart. Unbuilt targets are greyed and disabled with a short tooltip (D2 B): the Overlap tab, Add Investment, the "..." menu, Update, and the manager's approach and style. The score card opens the existing `FundScoreDetailModal` (L2). "View all holdings" opens a wide panel (A6 A; container choice is mockup question M5).

## 8. Links

| Link | Target | State |
|---|---|---|
| Breadcrumb Investments | `/portfolio` | live when the Investments page is live, else greyed |
| Breadcrumb Mutual Funds | `/portfolio/mutual-funds` | live (existing Dashboard) |
| Tabs | `/portfolio/mutual-funds/funds/:id`, `.../insights`, `.../overlap` | Overlap greyed until live (L17) |
| Overlap row in Key Insights | Overlap tab | greyed |
| Entry points (E3 A) | Home contributors rows and later Mutual Funds pages; the typed URL | no change to existing screens |

All links are built with the shell's typed `paths` builders; none is hard-coded.
