# Date audit for Batch E (task E-2), read-only, 20 Nov 2026

Source: worktree `D:\unifolio-e-dates` (front end `frontend/src`, back end `backend/app`). Nothing was edited. Paths below are relative to `frontend/src` unless they start with `backend/`. "Daily" = exact-day data (prices). "Monthly" = month-end data (holdings, TER, factsheet).

## 1. Helpers found (the date-formatting functions)

| Helper | Where | Output | Notes |
|---|---|---|---|
| `formatDate` | `lib/format.ts:132` | `12 Nov 2026` (day zero-padded, 3-letter month) | The workhorse on every tab; individual fund re-exports it from `features/individual-fund/fundFormat.ts:6`. Other unrelated copies: `components/FundSignal.tsx:81`, `features/profile/ImportHistorySection.tsx:20`. |
| `holdingsDate` | `components/mf/lookthroughDisplay.ts:33` | `12 Oct 2026` via `Intl en-GB` | Used only by the legacy/print Analytics sections (section 3). Unverified: newer ICU may print `Sept`, where `formatDate` always prints `Sep`. |
| `formatExactDate` | `lib/dateRange.ts:12` | `12 November 2026` (long month, no padding) | Used by History page and legacy `PeriodBreakdownTable`. Not used on the seven tabs. |
| `formatMonthYear` copy 1 | `lib/dateRange.ts:21` | `September 2026` (long month) | Used by History page only. |
| `formatMonthYear` copy 2 | `features/home/worthCopy.ts:16` | `Sep 2026` (short month, built from `formatDate`) | Used by Home "Worth a look" only. Two copies, two outputs. |
| `formatDayMonth` copy 1 | `features/home/homeFormat.ts:50` | `23 Oct` (no year) | Day-change pop-up, 1D chart note on Home. |
| `formatDayMonth` copy 2 | `components/wealth-graph/WealthGraph.tsx:64` (local, not exported) | `23 Oct` | Identical body; used by the shared graph on Overview and Home. |
| `formatAsOf` | `features/home/homeFormat.ts:58` | `as of 23 Oct` | Defined and tested (`homeFormat.test.ts:124`) but **never called** in app code. Dead code that uses the wrong word. |
| `formatWeekdayDate` | `features/home/components/dayChangeHelpers.ts:100` | `Friday 23 Oct 2026` | Day-change pop-up only. |
| `formatDataDate` | does not exist | - | - |
| `formatDdMmYyyy` | `lib/utils.ts:18` | `23-10-2026` | Legacy `FundDetailModal` "NAV Date" only (unrouted dashboard). |

## 2. Master table of data-date labels (live screens)

Tier: D = daily, M = monthly. "Event?" = policy leaves it alone.

| # | Screen | File:line | Helper | Visible wording (today) | Means | Tier | Event? |
|---|---|---|---|---|---|---|---|
| 1 | MF Overview, XIRR tile | `features/mutual-funds/overview/SummaryStrip.tsx:388` | `formatDate` | `As on 12 Nov 2026` | latest holding price day (`xirr_as_of`) | D | No |
| 2 | Portfolio, XIRR tile | `features/portfolio/sections/SummaryStrip.tsx:372` | `formatDate` | `As on 12 Nov 2026` | same | D | No |
| 3 | MF Allocation, asset class | `features/mutual-funds/allocation/AssetClassCard.tsx:89` | `formatDate` x2 | `Values as on 24 Oct 2026 · Holdings as on 30 Sep 2026` | prices; holdings disclosure | D; M shown as a day | No |
| 4 | MF Allocation, market cap | `.../allocation/MarketCapCard.tsx:172` | `formatDate` x3 | same line, then `· AMFI classification effective from 01 Jul 2026.` (or `No applicable AMFI classifications for these holdings.`) | prices; holdings; market-cap list | D; M; half-yearly list | No |
| 5 | MF Other, TER | `.../other/TerLadder.tsx:53` | `formatDate` | `Ref: 31 Mar 2026` | fees (TER reference period, `scheme_ter`) | M shown as a day | No |
| 6 | MF Other, valuation panels (P/E, P/B) | `.../other/ValuationSpectrum.tsx:56` | `formatDate` | `Ratio data cover 86.4% of equity exposure · Fundamentals as on 23 Oct 2026` | stock ratios (oldest stock date) | D | No |
| 7 | MF Other, valuation | `.../other/ValuationSpectrum.tsx:157` | `formatDate` x2 | `Values as on 24 Oct 2026 · Holdings as on 30 Sep 2026.` | prices; holdings | D; M as a day | No |
| 8 | MF Other, valuation by fund | `.../other/ValuationByFund.tsx:142` header, cells `:115-118` | `formatDate` | column `As on`; cell `12 Oct 2026`, or two stacked lines `P/E 12 Oct 2026` / `P/B 10 Oct 2026` | per fund: factsheet ratio = factsheet month-end; computed ratio = stock-ratio day | M or D, mixed in one column | No |
| 9 | MF Performance, month pop-up | `.../performance/PerformancePage.tsx:186,218` | `formatDate` | column `NAV (date)`, cell `30 Sep 2026` | the price used for that month | D, no label word | Borderline (a row's price day) |
| 10 | Home, day-change pop-up date line | `features/home/components/dayChangeHelpers.ts:118,124` | `formatWeekdayDate`+`formatDayMonth` | `Friday 23 Oct 2026 · prices as on 23 Oct` or `Prices as on 23 Oct` | prices | D | No (today's day beside it is an event day) |
| 11 | Home, day-change pop-up | `.../DayChangeDialog.tsx:746` | `formatWeekdayDate` | `No fund had a new price. Latest prices are as on Friday 23 Oct 2026.` | prices | D | No |
| 12 | Home, day-change pop-up | `.../DayChangeDialog.tsx:255` | `formatWeekdayDate` | `Latest prices are from Friday 23 Oct 2026.` | prices | D | No ("from", not "as on") |
| 13 | Home / MF Overview graph note | `features/home/homeCopy.ts:45`, `components/wealth-graph/WealthGraph.tsx:76` | `formatDayMonth` | `1D compares two NAV days (22 Oct and 23 Oct). Mutual fund NAVs publish once a day...` | two price days | D | Chart note; probably leave |
| 14 | Home, Worth a look (concentration) | `features/home/sections/WorthALook.tsx:188` | `formatMonthYear` (copy 2) | `Approximate · holdings as of Sep 2026` | holdings | M | No |
| 15 | Home, News exposure line | text from `backend/app/services/news/copy.py:59`, shown at `features/home/sections/News.tsx:157` | backend | `About 5% of your portfolio (holdings as of Sep 2026)` | holdings | M | No; the back end writes the text |
| 16 | Home, News stale | `features/home/newsCopy.ts:39` | none | `Updated 3 h ago` | feed age | - | **Event/age, unchanged** |
| 17 | Fund page, Investment details | `features/individual-fund/overview/InvestmentDetails.tsx:97` | `formatDate` | `as of 23 Oct 2026` beside current NAV | prices | D | No |
| 18 | Fund page, tile pop-up | `.../overview/TileDialog.tsx:43-45` | `formatDate` | row `NAV as of` / `23 Oct 2026` | prices | D | No |
| 19 | Fund page, tile pop-up (expense ratio) | `.../overview/TileDialog.tsx:167-170` | `formatDate` | row `As of` / `30 Sep 2026` | fees | M as a day | No |
| 20 | Fund page, Top holdings | `.../overview/TopHoldings.tsx:161` | `formatDate` | `Disclosure as of 30 Sep 2026.` | holdings | M as a day | No |
| 21 | Fund page, All holdings pop-up title | `.../overview/AllHoldingsDialog.tsx:70` | `formatDate` | `All holdings, as of 30 Sep 2026` | holdings | M as a day | No |
| 22 | Fund page, allocation note | `.../overview/FundAllocation.tsx:153,263` via `fundCopy.ts:192-199` | `formatDate` | `...Disclosure as of 30 Sep 2026.` / `Sector from the fund's disclosure, as of ...` / `Share of the fund's portfolio, as of ...` | holdings | M as a day | No |
| 23 | Fund page, Fund manager pop-up | `.../insights/FundManagerCard.tsx:211-214` | `formatDate` | row `Details as of` / `30 Sep 2026` | manager details (factsheet) | M as a day | No |
| 24 | Fund page, Score card | `.../overview/ScoreCard.tsx:244-249` | `formatDate` | row `Updated` / `23 Oct 2026` | score computed_at | not a data tier | Neither; owner decision |
| 25 | Fund page, benchmark note | text from `backend/app/services/analytics/benchmark_notes.py:5`, built at `backend/app/services/fund_page/returns.py:167`; shown by `components/BenchmarkInfoNote.tsx` | back end | `Benchmark returns are as printed in the fund house's factsheet for 2026-09-30.` (raw ISO date) | factsheet | M | No; back end writes the text |
| 26 | Portfolio History page | `features/history/HistoryChart.tsx:40` | `formatExactDate` | `Month-end values · latest 31 October 2026` | month-end price | D/M | Chart caption |

Event dates seen and excluded (policy unchanged): transactions `Ledger.tsx`, `PeriodDrill.tsx`, `transactionsLogic.ts:188` (missed SIP); SIP dates `SipTimeline.tsx:124,237,249,330`; "Managing since" `FundManagerCard.tsx:106,190`; first/last investment `InvestmentDetails.tsx:145,151`, `TileDialog.tsx:82,88,138`; window ends (`Measured from` `BenchmarkBlock.tsx:215,625`; risk window `RiskMetrics.tsx:150,192`, `PeriodReturnsChart.tsx:220`, `RiskReturnScatter.tsx:98`); chart axes and tooltips (`WealthGraph.tsx:460,598,605,640,663-664`, `PerformanceChart.tsx:78,298`, `RollingReturnsChart.tsx:126`, `PerformancePanel.tsx:135`); News `Updated ... ago`.

## 3. Legacy and print surface (not one of the seven tabs, still live)

`features/analytics/*` is not routed in the app shell (`AnalyticsWrapper` has no route) but `PrintAnalyticsView` (the PDF export route, `main.tsx`) renders it. It uses `holdingsDate`. Wording: `AssetAllocationSection.tsx:34`, `CapAllocationSection.tsx:70-71`, `OverlapSection.tsx:51`, `StockHoldingsSection.tsx:63` (`Values as on ... · Holdings as on ...`), `StockHoldingsSection.tsx:20` (`Holdings as on {per-fund day}`), `ValuationSection.tsx:30,41,59` (`Fundamentals as on`, `As on`), `TerSection.tsx:87` (`Ref: 2026-03-31`, raw ISO, no helper). Also `components/mf/FundDetailModal.tsx:119` (`NAV Date`, unrouted dashboard). Total labels: 26 live rows above across about 22 files, plus about 9 legacy strings in 6 files.

## 4. What each tab dates today (strip-entry eligibility)

A strip entry may exist only for a kind the tab already dates. Y = dated today (row numbers from section 2).

| Tab | prices | holdings | ratios | fees | market-cap list | factsheet | manager details |
|---|---|---|---|---|---|---|---|
| Overview | Y (#1, in XIRR tile only) | - | - | - | - | - | - |
| Performance | - (#9 is a per-row cell) | - | - | - | - | - | - |
| Allocation | Y (#3, #4) | Y (#3, #4) | - | - | Y (#4) | - | - (Fund Manager card shows no date) |
| Holdings | - | - | - | - | - | - | - |
| Transactions | none (event dates only) | - | - | - | - | - | - |
| Overlap | - | - | - | - | - | - | - |
| Other | Y (#7) | Y (#7) | Y (#6, #8) | Y (#5) | - | Y only as the "Factsheet" pill (#8 dates it) | - |

Fund page dates prices, holdings, fees, manager details, factsheet (benchmark note). Home dates prices and holdings. Portfolio dates prices only (XIRR tile).

## 5. Existing tests that assert the old text (later task must update)

| File | Old strings |
|---|---|
| `features/mutual-funds/allocation/AssetClassCard.test.tsx:27` | `Values as on 24 Oct 2026 · Holdings as on 30 Sep 2026` |
| `features/mutual-funds/allocation/MarketCapCard.test.tsx:28,45` | same plus `AMFI classification effective from 01 Jul 2026.`; `No applicable AMFI classifications for these holdings.` |
| `features/mutual-funds/other/TerLadder.test.tsx:23,49` | `Ref: 31 Mar 2026`; testid `ter-ref` |
| `features/mutual-funds/other/ValuationSpectrum.test.tsx:15,31,32` | `Values as on 24 Oct 2026 · Holdings as on 30 Sep 2026.`; `Fundamentals as on 23 Oct 2026` / `22 Oct 2026` |
| `features/mutual-funds/other/ValuationByFund.test.tsx:35-41` | `12 Oct 2026`, `10 Oct 2026` cells; test name "as-on date" |
| `features/mutual-funds/overview/SummaryStrip.test.tsx:48,56` | `As on ${formatDate(date)}`; absence of `xirr-as-of` |
| `features/portfolio/sections/SummaryStrip.test.tsx:300-310` | `As on ${formatDate(date)}`; absence of `xirr-as-of` |
| `features/home/components/DayChangeDialog.test.tsx:243,330` | `Latest prices are from Friday 23 Oct`; `/Latest prices.*23 Oct 2026/` |
| `features/home/homeFormat.test.ts:109-126` | `formatDayMonth` outputs, `formatAsOf` -> `as of 23 Oct` |
| `features/home/homeCopy.test.ts:36-39`, `features/home/sections/WealthCard.test.tsx:328-330`, `components/wealth-graph/WealthGraph.test.tsx:411-414` | `1D compares two NAV days (22 Oct and 23 Oct)` |
| `features/home/sections/WorthALook.test.tsx:91` | `Approximate · holdings as of Sep 2026` |
| `features/home/sections/News.test.tsx:116` (fixture `news_specific_three.json:34`) | `About 5% of your portfolio (holdings as of Sep 2026)` |
| `features/home/newsCopy.test.ts:50-52`, `News.test.tsx:164-180`, `HomePage.news.test.tsx:139` | `Updated 1 d ago` etc. (event, unchanged) |
| `features/individual-fund/fundCopy.test.ts:124-128` | the four `allocationNote` sentences with `as of 30 Sep 2026` |
| `features/individual-fund/overview/FundAllocation.test.tsx:75-90` | same sentences |
| `features/individual-fund/overview/TopHoldings.test.tsx:44,128,136` | `Disclosure as of 30 Sep 2026.`; dialog name `All holdings, as of 30 Sep 2026` |
| `features/individual-fund/overview/AllHoldingsDialog.test.tsx:32` | `All holdings, as of 30 Sep 2026` |
| `features/individual-fund/overview/InvestmentDetails.test.tsx:53` | `as of 23 Oct 2026` |
| `features/individual-fund/overview/StatBand.test.tsx:130,157` | rows `NAV as of`, `As of` |
| `features/individual-fund/insights/FundManagerCard.test.tsx:108` | `Details as of` / `30 Sep 2026` |
| `features/individual-fund/overview/ScoreCard.test.tsx:117,129` | `score-updated` value `23 Oct 2026` (label `Updated`) |
| `features/individual-fund/overview/ReturnsTable.test.tsx:275-290` | fixture text `Printed in the factsheet as of 30 Sep 2026.` |
| `features/analytics/CapAllocationSection.test.tsx:33`, `features/analytics/StockHoldingsSection.test.tsx:24` | `AMFI classification effective from 1 Jan 2026`; `Values as on 13 Oct 2026.*Holdings as on 31 Mar 2026` |
| `backend/tests/services/fund_page/test_benchmark_select.py:73` | `...factsheet for 2026-09-30.` |

## 6. The two info-icon patterns, and others

**InfoMark** (`features/mutual-funds/common/SectionCard.tsx:9`): a `span role="img"` with letter "i", tabIndex 0, `title`, `data-tooltip` and `aria-label` (native/CSS tooltip, no popover, no state). Used by `SectionCard`'s `info` prop on 13 cards (AssetClass, CategoryAmc, MarketCap, AllStocks, TopHoldingsByFund, CategoryRanking, TER, Valuation, Scorer, CommonHoldings, Heatmap, ImpactDonut, TopPairs) and directly 9 times: `OverviewCards.tsx` (3), `SipTimeline.tsx`, `SummaryStrip.tsx` (2), `BenchmarkBlock.tsx`, `PerformancePage.tsx` (2). Total 22 uses.

**Radix-tooltip button pattern** (controlled open on hover, focus and click): `features/individual-fund/components/Segmented.tsx:21` `InfoButton` (lucide `Info`, used by 5 components: PeriodReturnsChart, PerformancePanel, FundAllocation, PerformanceChart, ReturnsModeToggle) and the P/E and P/B `Source` pill in `ValuationByFund.tsx:31`.

Other bespoke ones: `components/BenchmarkInfoNote.tsx` (hover/focus note, own state, Escape closes; 4 uses: PerformanceChart x2, ReturnsTable, MF `BenchmarkBlock.tsx:614`); `features/home/sections/WealthCard.tsx:68` (Info button that opens a dialog); `RiskMetrics.tsx:32` (row click opens a pop-up). Static banners using `Info` (InfoNotice, planning) are not popovers.

## 7. P/E and P/B source pills (`ValuationByFund.tsx:31-34`)

Pill label logic: `source === "factsheet"` -> `Factsheet`, or `Factsheet fwd` when `basis === "forward"`; any other source (`computed`; `none` never reaches a pill because only usable values render one) -> `NSE/BSE`. The tooltip sentence is built there, not in `otherLogic.ts` (which only holds `KIND_TEXT` and `deltaSentence`): `Basis: {forward earnings | trailing earnings | trailing book value | not stated}. Method: {harmonic mean | weighted average | not stated}.` Values handled (`types.ts:567`): `factsheet`, `computed`, `none`. Sentence each would need under the policy: `factsheet` -> "Ratios from the fund house's factsheet as on {Month Year}" (monthly); `computed` -> "Worked out from the fund's holdings as on {Month Year} and stock ratios as on {day}" (two tiers in one sentence; owner decision); `none` -> no pill, the cell shows the reason text.

## 8. Home's price-day rule (`backend/app/services/home/movers.py`, `_price_day` line 220)

1. Candidates are the up-to-15 newest price dates (`PRICE_DAY_LOOKBACK`) across funds with a daily price (statement-priced funds ignored); each fund is weighted by units x its own latest price.
2. The chosen day is the newest candidate on which funds holding at least 50% of the portfolio value (`PRICE_DAY_COVERAGE`) have a price; this stops a weekend month-end price from one AMC becoming "the day". Funds without that day use their latest earlier price.
3. `compute_movers` then sets `nav_as_of` (`as_of_nav_date`) to the newest date among the funds priced on that basis; funds behind it, or more than 10 days older than today, are "waiting for price" and make the card Partial. The pop-up (`compute_all_mover_rows`, line 368) always lists that same day's rows.

## 9. Places where the policy does not fit (owner to decide)

1. **XIRR tile shows a date today** (#1, #2, plus tests asserting it). The brief says it shows none. Remove it, or keep it? Adding or keeping conflicts with "no new dates".
2. **Monthly data is shown as an exact day** (#3, #4, #5, #7, #19-#23): `30 Sep 2026` must become `September 2026`. Two `formatMonthYear` copies give `September 2026` and `Sep 2026`.
3. **Valuation by fund "As on" column** (#8) mixes monthly (factsheet) and daily (computed) dates, sometimes two stacked.
4. **Market-cap list** uses "effective from", a half-yearly date (1 Jan / 1 Jul): which tier and word?
5. **Day-change pop-up** mixes "from" and "as on" (#11, #12), omits the year in #10, and puts an event day (today) beside the data day.
6. **Score card "Updated"** (#24) is a computation date, neither tier.
7. **Back-end sentences** (#15, #25) carry their own date wording and format (ISO date in #25); changing them needs a back-end change and test change.
8. **Performance month pop-up** (#9) dates each row's price; label or leave?
9. `formatAsOf` is unused and says "as of"; `Values as on` is used for prices on six screens (policy word is `Prices`).
10. Legacy print/export sections (section 3) carry the old wording and raw ISO `Ref:`; in or out of scope?
