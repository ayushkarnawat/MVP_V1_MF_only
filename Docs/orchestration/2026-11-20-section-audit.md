# Batch F, task F-2: Mutual Funds section audit

Read-only audit of `D:\unifolio-f-nav` (HEAD `04f8077b`), `frontend/src/features/mutual-funds`. Titles are quoted from the code. "Card" means `SectionCard` (`common/SectionCard.tsx`). `SectionCard` renders `<section aria-labelledby={useId()}>` with an `<h3>`, and takes no `id` prop. In loading it shows a `role="status"` skeleton (h-24 by default). In `failed` or `error` it shows "This section failed to load, but the rest of the page is unaffected." plus Retry.

## Count check against the program's expectation

| Tab | Expected | Found | Difference |
|---|---|---|---|
| Overview | 8 (7 + graph) | 8 in the full Family Combined case, with fewer in other cases (see notes) | None, but 3 of the 8 are conditional |
| Performance | 3 | 3 | None |
| Allocation | 4 | 4 | None |
| Holdings | 2 | 2 | None |
| Transactions | 2 | 2 | None |
| Overlap | 4 | 4 numbered cards (plus an unnumbered stat strip, see below) | None |
| Other Analytics | 4 groups | **3 visible groups.** `SHOW_FUND_QUALITY_SCORES = false` (`other/otherLogic.ts:17`) hides "Fund Quality Scorer". The code still defines 4. | **One group fewer** |

## Overview (`overview/OverviewPage.tsx`, rendered in `OverviewBody`)

Render order is: `CoverageGapGate` (banner, not a section), then the rows below. `PostImportNotice` sits above `OverviewBody`.

| tab | # | title (as in code) | proposed id | SectionCard? (file, component) | empty / failure | notes |
|---|---|---|---|---|---|---|
| overview | 1 | none visible. `aria-label="Portfolio summary"` (metric labels "Total Portfolio Value", "Total Invested", "Unrealised Gain", "Realised Gain", "XIRR") | `overview-summary` | No. Bespoke `<section>` in `overview/SummaryStrip.tsx`, `SummaryStrip` | Loading: `<section role=status aria-label="Loading summary">` with 5 skeletons. Error: h4 "Couldn't load your portfolio summary" plus Retry. Never empty (the page's empty state replaces everything). | Flex column of a section plus a "Why this return may be misleading" modal. No heading, so there is no label to put in an index. |
| overview | 2 | "Value over time" (h3, passed as `headerLeft` to `WealthGraph`) | `overview-value-over-time` | No. `OverviewWealthGraph` in `OverviewPage.tsx`, wrapping `components/wealth-graph/WealthGraph.tsx`. `<section aria-label="Value over time">` inside `<div data-legacy="wealth-graph" className="contents">`. | Returns `null` until holdings are ready, and also in member mode with no member id. `WealthGraph` has its own loading skeleton and an error state with Retry. | Appears after first paint, so it pushes everything below it down. |
| overview | 3 | "SIPs" (h3, `id="sip-title"`) | `overview-sips` | No. `overview/SipTimeline.tsx`, `SipTimeline` | Loading: "Loading SIPs" skeleton h-32. Error: h4 "Couldn't load your SIPs" plus Retry. Empty: "No active SIPs." | Hard-coded `id="sip-title"`. The month calendar loads on its own ("Loading month"). |
| overview | 4 | "Mutual Funds (N)", where N is the filtered row count and changes with the search box (h3, `id="holdings-title"`) | `overview-mutual-funds` | No. `overview/HoldingsTable.tsx`, `HoldingsTable` (and the aggregate-mode `FamilyHoldingsTable`, same title) | Loading: "Loading holdings" skeleton. Error: h4 "Couldn't load your holdings" plus Retry. Empty after search: `No funds match "<query>"`. | The index label must be the static "Mutual Funds". The `holdings-title` id is hard-coded in two mutually exclusive branches. |
| overview | 5 | "Sold funds (N)" (this is a `<button>` toggle, not a heading) | `overview-sold-funds` | No. `components/mf/SoldFundsSection.tsx` (legacy), inside `<div data-legacy="sold-funds" className="contents">` | Returns `null` when no fully-sold funds exist, and while data is loading. Collapsed by default. | `components/mf/*` is a legacy component that the guard allows only in `OverviewPage` and `CoverageGapGate`, and only inside a `data-legacy` wrapper. |
| overview | 6 | "AMC Allocation" (h3) | `overview-amc-allocation` | No. `overview/OverviewCards.tsx`, `AmcAllocationCard` | Loading: "Loading AMC allocation" skeleton h-64. Error: h4 "Couldn't load your AMC allocation" plus Retry. | Grid `lg:grid-cols-3` with rows 6, 7 and 8. |
| overview | 7 | "Family Members" (h3) | `overview-family-members` | No. `OverviewCards.tsx`, `FamilyMembersCard` | Returns `null` in member mode. Loading: "Loading family members". Error: h4 "Couldn't load family members" plus Retry. A single-member household shows the h3 with "You're the only member in this household..." | Present only in aggregate mode. |
| overview | 8 | "Quick Insights" (h3) | `overview-quick-insights` | No. `OverviewCards.tsx`, `QuickInsightsCard` | The card appears only when both holdings and allocation have data. A "Loading quick insights" skeleton shows while either is loading. After an error it is absent (renders `null`, no message). | Always rendered last. |

Whole-page states render no sections: "Couldn't load your mutual funds" (holdings and allocation both failed), and "No mutual funds yet" (no holdings).

## Performance (`performance/PerformancePage.tsx`, `PerformanceBody`)

| tab | # | title | proposed id | SectionCard? | empty / failure | notes |
|---|---|---|---|---|---|---|
| performance | 1 | "Returns" (h3) | `performance-returns` | No. Bespoke `<section data-testid="block-returns">`, `ReturnsBlock` | Each part has its own states (XIRR skeleton or alert, money skeleton or retry, "Fund XIRR at a glance" skeleton or retry). | Contains the h4 "Fund XIRR at a glance" as a sub-block. |
| performance | 2 | "Portfolio History" (h3) | `performance-portfolio-history` | No. `<section data-testid="block-history">`, `HistoryBlock` | Loading: "Loading history" skeleton h-64. Error: "History couldn't be loaded. Please try again." plus Retry. Empty: "No history yet". | The range buttons are hidden when there is no data. |
| performance | 3 | "Benchmark Comparison (XIRR)" (h3) | `performance-benchmark-comparison` | No. `performance/BenchmarkBlock.tsx`, `<section data-testid="block-benchmark">`, `BenchmarkBlock` | Loading: skeleton h-32. Error: "Couldn't load the benchmark comparison." plus Retry. Also "Only Since Inception is available right now..." | Tab and window switches change the height. |

If all four analytics calls fail, the page replaces everything with "Couldn't load your performance data".

## Allocation (`allocation/AllocationPage.tsx`)

| tab | # | title | proposed id | SectionCard? | empty / failure | notes |
|---|---|---|---|---|---|
| allocation | 1 | "Look-Through Asset Allocation" | `allocation-asset-class` | Yes. `allocation/AssetClassCard.tsx`, `AssetClassCard` | Standard card states. Empty: "No look-through asset allocation data available". Also "Asset allocation is updating." | The wrapper div already has `id="asset-allocation"`. |
| allocation | 2 | "Market-Cap Allocation" | `allocation-market-cap` | Yes. `MarketCapCard.tsx`, `MarketCapCard` | Empty: "No market-cap allocation data available" | The wrapper div already has `id="market-cap"`. `AssetClassCard.tsx:336` calls `getElementById("market-cap")`, so a rename must keep that working. |
| allocation | 3 | "Portfolio Allocation" | `allocation-category-amc` | Yes. `CategoryAmcCard.tsx`, `CategoryAmcCard` | Empty: "No allocation data available for this selection" | The slug follows the existing `data-testid="card-category-amc"`. |
| allocation | 4 | "Fund Manager Allocation" | `allocation-fund-manager` | Yes. `FundManagerCard.tsx`, `FundManagerCard` | Empty: "No fund manager data available" | None |

If all four analytics calls fail, the page shows "Couldn't load your allocation data". Note that `onRetry` retries only the first call (`asset.retry()`).

## Holdings (`holdings/HoldingsPage.tsx`)

| tab | # | title | proposed id | SectionCard? | empty / failure | notes |
|---|---|---|---|---|---|---|
| holdings | 1 | "Top Holdings by Fund" | `holdings-top-by-fund` | Yes. `holdings/TopHoldingsByFund.tsx`, `TopHoldingsByFund` | Empty: "No stock holdings to show yet" | None |
| holdings | 2 | "All Holdings Across Your Portfolio" | `holdings-all-stocks` | Yes. `holdings/AllStocksTable.tsx`, `AllStocksTable` | Empty: "No equity stocks disclosed for this selection" | The wrapper already has `id="all-holdings"`. |

Both cards share one call (`stock_holdings`). On error the page shows "Couldn't load your holdings data".

## Transactions (`transactions/TransactionsPage.tsx`)

| tab | # | title | proposed id | SectionCard? | empty / failure | notes |
|---|---|---|---|---|---|---|
| transactions | 1 | "Cash Flow Over Time" | `transactions-cash-flow` | Yes. `TransactionsPage.tsx` (inline `SectionCard`) | Empty: "No transactions yet". Standard card states. | The cash-flow strip (`CashFlowStrip`) is inside this card, not a separate block, so it needs no wrapper. |
| transactions | 2 | "All Transactions" | `transactions-ledger` | Yes. `TransactionsPage.tsx` (inline `SectionCard`, containing `Ledger`) | `Ledger` has its own empty state (`rows.length === 0`). | Wrapper `data-testid="card-ledger"`. The strip tiles call `scrollIntoView` on that wrapper. |

On error the page shows "Couldn't load your transactions". Both cards use the same call (`investment_withdrawal`).

## Overlap (`overlap/OverlapPage.tsx`)

| tab | # | title | proposed id | SectionCard? | empty / failure | notes |
|---|---|---|---|---|---|
| overlap | 1 | "1. Common Holdings" | `overlap-common-holdings` | Yes. `overlap/CommonHoldings.tsx`, `CommonHoldings` | Empty: "No stocks are held by more than one of your funds." | Depends on a different call (`stock_holdings`), so it can load later than the others. |
| overlap | 2 | "2. Overlap Heatmap" | `overlap-heatmap` | Yes. `Heatmap.tsx`, `Heatmap` | Standard card states | None |
| overlap | 3 | "3. Top Overlapping Fund Pairs" | `overlap-top-pairs` | Yes. `TopPairs.tsx`, `TopPairs` | Empty: "No pairs above this threshold." | None |
| overlap | 4 | "4. Overlap Impact" | `overlap-impact` | Yes. `ImpactDonut.tsx`, `ImpactDonut` | Message "No fund pairs overlap above the low band..." | None |

Not index sections, but present above card 1: a view tablist ("All funds" and "By category"), `CategoryTabs`, category cards, an aside "Funds not shown", and `data-testid="card-stat-strip"` (`CoverageBanner` plus `StatStrip`, four stat tiles, with no heading).

The four cards are shown only when the selection has two or more funds and the category card grid is not showing. Otherwise the page shows a single empty block (`data-testid="overlap-empty"`: "No equity funds to compare.", "No funds in this category.", or "Overlap needs at least two funds with published holdings."), or the category card grid. On error the page shows "Couldn't load overlap analysis".

## Other Analytics (`other/OtherAnalyticsPage.tsx`, the `Group` component)

| tab | # | title (`GROUP_TITLES`) | proposed id | SectionCard? | empty / failure | notes |
|---|---|---|---|---|---|---|
| analytics | 1 | "Cost & Valuation" | `analytics-cost` | No. `<section data-testid="group-cost">` with an h2 and a numbered badge. Contains cards "Total Expense Ratio (TER) & Cost Analysis", "Portfolio Valuation vs. Benchmarks" and "Valuation by Fund" (the third only when `valuation.data.funds` is defined). | The group header always renders. The cards inside handle their own states. | The heading id is `heading-cost`. |
| analytics | (hidden) | "Fund Quality Scorer" | `analytics-scorer` | No. Same `Group`. Card: "Fund Quality Scores". | Not rendered, because `SHOW_FUND_QUALITY_SCORES = false`. | Flipping the flag makes the visible index 4 and shifts the badge numbers. |
| analytics | 2 | "Category Average Comparison" | `analytics-category` | No. `Group`. Card: "Returns against the category average". | Card states | None |
| analytics | 3 | "Performance Ranking" | `analytics-ranking` | No. `Group`. Card: "Rank in your fund's category". | Empty: "No performance ranking data available." Also "Performance rankings are updating." | None |

On a TER error the page replaces all groups with "Couldn't load your analytics".

## Findings (a) to (f)

**(a) Side rail (3 or more sections).**

| Tab | Rail? | Why |
|---|---|---|
| Overview | Yes | 8 sections (5 to 8 depending on scope and data; see (d)) |
| Performance | Yes | 3 sections |
| Allocation | Yes | 4 sections |
| Holdings | No | 2 sections |
| Transactions | No | 2 sections |
| Overlap | Yes | 4 sections, but only when the four cards render. In the fewer-than-two-funds, category-grid and error cases there are 0 sections, so the rail must hide. |
| Other Analytics | Yes | 3 groups now, 4 if the scorer flag is turned on |

The rail should count rendered sections, not the static list.

**(b) Height changes after first paint.**
- Every page is a `React.lazy` route (`shell/layout/PageBoundary.tsx`) inside `Suspense`, so the whole page appears after its chunk loads.
- All card sections go skeleton to content. Skeletons are short (h-24 default, h-32 to h-64 for some) and the content is much taller.
- Overview:
  - The wealth graph is absent until holdings load, then inserts itself with a skeleton.
  - Sold funds appears later, and grows when expanded.
  - Quick Insights and Family Members appear or disappear with their data.
  - `CoverageGapGate` and `PostImportNotice` can insert at the top.
  - SIP calendar and month detail load separately.
- Performance: Portfolio History (h-64 skeleton) and Benchmark Comparison grow, and the tab and window toggles change height.
- Allocation and Transactions: drill panels (`DrillPanel`, `PeriodDrill`) add height on click. `AssetClassCard` and `DrillPanel` also call `scrollIntoView`.
- Overlap: the four cards collapse into one empty message, or into the category grid, after the overlap data arrives. Common Holdings loads on a separate call.
- Other Analytics: "Valuation by Fund" appears only after valuation data arrives.
- Any scroll-spy must re-measure (`ResizeObserver`) rather than cache offsets.

**(c) Overlap numbering.** The "1." to "4." prefixes are literal strings in the titles (`CommonHoldings.tsx:36`, `Heatmap.tsx:51`, `TopPairs.tsx:37`, `ImpactDonut.tsx:45`), not computed. A rail would show them as is, or drop them. Strip them if the rail adds its own numbers. If a card is ever hidden, the numbers do not renumber.

**(d) Should the Summary strip and the Sold funds list count as sections?**

My recommendation is no for both, which gives Overview an index of 6 (5 in member scope). That is below the program's 7 or 8, so I am flagging it.
- **Summary strip.** It has no visible title and has no card chrome. It is the first block under the H1, and nothing needs to scroll to it. An index entry would need an invented label. It is not a card, so a stable id would sit on a wrapper. The only argument for including it is a "top of page" entry, and the H1 or the top of the rail serves that.
- **Sold funds.** It is conditional (absent when nothing is fully sold, and also absent while loading). It is a collapsed disclosure, not a content block. Its label contains a count. An entry that appears and disappears is confusing in a rail. Treat it as a footnote of "Mutual Funds".
- Still add `id` wrappers on both if the program wants them (the legacy wrapper for Sold funds already exists). Mark them as not indexed.
- Layout note: rows 6, 7 and 8 sit in one `lg:grid-cols-3` row, so three entries share one scroll position at lg widths. The active-section logic needs to handle that.

**(e) Scrolling.**
- Confirmed: `shell/layout/AppLayout.tsx:26` is `<main ref={pageArea} className="min-h-0 flex-1 overflow-y-auto p-6">`. The outer div is `h-screen overflow-hidden`, so the window and body do not scroll.
- `pageArea` is a local `useRef` in `AppLayout`, and it scrolls to top on pathname change. It is not exposed to descendants.
- `MemberBanners` render inside `main`, above the page. `PageLayout` has no sticky header (`TopBar` is outside `main`).
- Inner scrollers: many `overflow-x-auto` table wrappers, `overlap/PairDetail.tsx:69` (`max-h-80 overflow-y-auto`, the shared-stocks list), and `CashFlowBars.tsx` (`overflow-x-auto`).
- `components/mf/PostImportNotice.tsx:159` (`max-h-[85vh] overflow-y-auto`) is a dialog.
- `components/Modal.tsx` sets `body.style.overflow` for sheets only.
- Existing `scrollIntoView` callers: `TransactionsPage.tsx:55`, `PeriodDrill.tsx`, `DrillPanel.tsx`, and `AssetClassCard.tsx:337`. They scroll `main` already. `scrollIntoView` ignores `p-6`, so sections need `scroll-mt-6`.
- How the frame gets a ref. `MfFrameContextValue` is only `{ openMira }` (`MutualFundsFrame.tsx`).
  - Option 1 (lowest blast radius): the frame renders a wrapper element with a ref and calls `ref.current.closest("main")` in an effect, then exposes that element through `useMfFrame()` (add a `scrollRoot` value).
  - Option 2 (cleaner): `AppLayout` provides `pageArea` through a small shell context (shell imports are allowed by the guards).
  - Each page renders its own `<MutualFundsFrame tab=...>`, so the frame remounts on every tab change. The rail needs no cross-tab state.
  - `useMfFrame` throws outside the frame, so tests that render pages without it must be checked.

**(f) What `guards.test.ts` requires of any new file under `features/mutual-funds`.**
- **File count.** `expect(names).toHaveLength(56)`. The current count of non-test `.ts` and `.tsx` files (excluding `fixtures/`, `types.ts` and `testing.tsx`) is 56. Any new source file makes it 57 and fails the test until the number is updated. The test also lists expected file names, so a new file needs no entry there unless the test should require it. Test files (`*.test.ts(x)`) are not scanned or counted.
- **Buttons.** Per `.tsx` file, the count of `<button` must not exceed the count of `data-clickable`. (The check is a lowercase text match, so `<Button>` is not counted, but the project convention is to mark both.)
- **Forbidden patterns, comments included:**
  - `parseFloat`, `toFixed` or `Intl.`
  - Hard-coded colours (`#` followed by 3 to 8 hex digits and a word boundary, `rgb(`, `rgba(`, `hsl(`, `hsla(`). Use CSS variables only. A slug such as `#add...` or `#bad...` in a string could trip the hex check.
  - `console.`
  - `: any`, `as any`, `<any>`, `any[]`. A comment containing "note: any" matches `:\s*any\b`.
  - The text "Sync Investments" or "Download PDF".
- **Imports.**
  - No imports from other features except `features/auth/session`, including through the `@/features/...` alias.
  - No imports of `shell/testing`, `setupTests`, `/testing` or `./fixtures`.
  - Legacy `components/mf/{CoverageGapBanner,OpeningBalanceModal,SoldFundsSection,PostImportNotice}` may be imported only by `overview/CoverageGapGate.tsx` and `overview/OverviewPage.tsx`, and those files must contain `data-legacy`. A new file importing any of them fails.

## Surprises

1. Other Analytics has 3 visible groups, not 4. "Fund Quality Scorer" is behind `SHOW_FUND_QUALITY_SCORES = false`.
2. Only Allocation, Holdings, Transactions and Overlap use `SectionCard`. Overview, Performance and Other Analytics use bespoke `<section>` blocks, and `SectionCard` has no `id` prop. Ids will have to go on wrapper divs (as `asset-allocation`, `market-cap` and `all-holdings` already do).
3. Existing ids `asset-allocation`, `market-cap` and `all-holdings` are already in use, and `AssetClassCard.tsx:336` looks up `market-cap` by id.
4. Overview's section count is dynamic (8 in the full aggregate case; Family Members absent in member mode; Sold funds and the wealth graph are conditional). Overlap collapses from 4 cards to 0 for fewer than 2 funds, so the rail must key off rendered sections.
5. The guard asserts exactly 56 non-test files. Any new file under `features/mutual-funds` needs that number bumped in the same change.
