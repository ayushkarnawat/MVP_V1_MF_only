# Batch I, task I-7 (step 1): print audit of every section of the seven Mutual Funds tabs
**Written 2026-11-24 by the orchestrator.** Method: four read-only reviews (Overview; Performance and Allocation; Holdings, Transactions and Overlap; Other Analytics and the shared pieces), each citing code lines and comparing with the sample report pages. I read their reports and spot-checked the claims that drive decisions; **line references are the reviewers', not all re-verified**. The list audited is `frontend/src/lib/pageSections.ts` (`SECTION_LISTS`, 24 sections today). Plan: `Docs/superpowers/plans/2026-11-17-batch-i-pdf-export-plan.md` (Tasks I-6, I-7). Sample: `2026-11-13-batch-i-sample-report/` (39 pages).

## 1. The finding that needs the owner's decision
**The approved sample report is not what the screens' components print.** The sample (17 Nov) is a separately designed document: it replaces most charts with plain tables, adds data the screens do not show, and orders some sections differently. The plan says the PDF prints "the screens' own components in a print mode" (workbook: "It does not yet use the real section components... it shows the intended look and length"). So the finished PDF's section pages will look like **the app's cards** (donuts, bars, dots on lines), not like the sample's tables, unless we choose otherwise. What matches the sample exactly either way: the cover, contents, running header and footer, tab headings, notes page (the template lane, G-a).
Differences that are about **data the screens do not have today** (not just styling):
| Section | Sample shows, screen does not |
|---|---|
| Summary (Overview, not in the section list) | "Current value by fund" bars; a "Highlights" card (best performer, largest holding, first investment) |
| SIPs | Since, Instalments, Total invested columns |
| Mutual Funds | Units and NAV columns; no Category or Today's change |
| Family Members | Funds, Invested, XIRR, Share, a Household total |
| Returns | a "Returns by fund" 1Y/3Y/5Y table with a Nifty 50 row; no headline XIRR or tiles |
| Look-Through Asset Allocation | rupee values in the legend; a by-fund percentage matrix; a Cash class |
| Market-Cap / Portfolio Allocation / Fund Manager | by-fund matrices, plain tables instead of donuts |
| All Transactions | Units, NAV, Folio columns (the screen shows them only in an opened row) |
| Overlap Impact | a four-line "Summary" table instead of the donut |
**Options.** A (recommended): **print the screens' components with print variants** (this plan); the sample's extra data is not in M4. The PDF shows the same numbers and wording as the screens (the program's rule: same numbers, same wording, dates in E's words), at the cost of not looking like the sample's section pages. B: **build print-only table layouts to match the sample**, which needs new fields from the back end (SIP history, per-member XIRR, per-fund class matrices, units and NAV) and is a much larger task. C (hybrid): A everywhere, plus the sample's table form for the few HEAVY sections where the data already exists (Portfolio History: the year-by-year table is derivable from the history points; Benchmark Comparison: a table of XIRR by window; Cash Flow: yearly chart and table). **Recommendation: C**, because the HEAVY sections need a static version anyway.
**Folio numbers (reviewer's question, answered):** the owner's decision stands (17 Nov, Q3 A): folios print in full, **following the dialog's "Show folio numbers" option** (which starts from the eye icon); PAN never prints. Nothing in the brief said folios never print.

## 2. What every section needs (the print foundation, built once; Codex task "I-6/I-7 foundation")
1. **A print root**: `data-theme="light"` (all sections use theme variables; the dark media query is guarded by `:root:not([data-theme="light"])`, so this one attribute fixes colour), animations off, a **fixed render width** (about 180 mm, 680 px) and a **fixed viewport** chosen on purpose: several cards pick one or two columns from the *window* width (`lg:`, `md:`, `sm:` in `TerLadder`, `ValuationSpectrum`, `CategoryRankingGroup`, `HoldingsTable`), so the renderer's viewport decides the layout.
2. **A `PrintMode` context** the section components read (no `printMode` prop exists in `features/mutual-funds` today; the OLD `features/analytics` sections have such props and are the pattern to copy: hide controls, show every tab's content stacked, start collapsibles open, replace hover and interactive legends with text, cap very long lists with a note).
3. **`SectionCard` in print mode**: no `InfoMark` (its popover text exists only on hover, so it never prints; the Notes page repeats the explanations), no Retry button, no skeleton: the print route renders only in the ready state and waits for every section to settle (a failed section prints its failure text in place).
4. **Chart animation**: `LineAreaChart` and `PieChart` animate in on mount (about 1.1 s) and the mount animation does not honour reduced motion; a capture straight after load shows half-drawn charts. Print mode needs duration 0 (or a ready flag set after the animation) and a fixed `width` (the line chart and bar charts take a `width` prop; the donuts are fixed 236 px).
5. **Page controls**: `PageSearch` text, chips and any saved page-search state must be ignored (render with `query=""`); no filters.
6. **Frame**: render the section components directly, not the Page components (the frame adds the tab bar, search box, section rail, date strip, Mira dialog, an "Add Investment" button). `useMfFrame()` throws outside the frame: the foundation checks and fixes any section that calls it.
7. **Folio display**: `FolioNumber` follows an eye-icon setting kept in the browser; the print route must use the dialog's option instead (full number, masked form, or none), with no toggle button.
8. **Images**: `SchemeLogo` loads remote images with an initials fallback: wait for them or print initials only.
9. **Page breaks**: `break-inside: avoid` on rows and list items, repeated table headers (`thead` as a header group), a card taller than one page is allowed to split between rows (a whole-card `avoid` is ignored by browsers when the card is taller than a page).
10. **Dates**: each section's footer uses the same helpers as the screens (`formatDataDate`, `DataDateLabel`), never typed wording.

## 3. Section by section
Variants: **NONE** prints as is in print mode; **LIGHT** = a print-mode switch that hides controls and opens what is collapsed; **HEAVY** = a static or different version. Sample = the sample page(s).
### Overview (sample pages 4 to 8)
| Section | Variant | What changes in print |
|---|---|---|
| overview-value-over-time | **HEAVY** | Static chart: fixed width, no tooltip, printed legend; hide period buttons, benchmark checklist, calendar; print **one chosen period** (decision: the sample prints the whole history, month-end, 2014 to 2026; the screen defaults to 1Y). Add axes labels. |
| overview-sips | **HEAVY** (small) | Replace tabs, date caps and month arrows by a flat table of **all** active SIPs (fund, member, instalment, next date) plus the monthly total and a stopped list; "This month" would need its own fetch, drop it. The cards can pass one page at 20+ SIPs. |
| overview-mutual-funds | **LIGHT** (member view) / **HEAVY-ish** (family view) | Hide the Compare and Mira buttons, sort buttons, row click; family view: force a table layout (the 960 px minimum width and the phone breakpoints must not apply), **expand every per-member child row**, folios by the dialog option. |
| overview-amc-allocation | **LIGHT** | Donut flat (no hover or selection); legend with rupee value as well as percent (the screen legend has percent only); the per-AMC drill-down modal is optional (not in the sample). Colours repeat after 8 AMCs. |
| overview-family-members | **LIGHT** | No click handlers, no helper text; absent in member view: print nothing there. |
| overview-quick-insights | **NONE** | Short list of generated lines. |
Not in the list but on the page: **Summary strip** (sample page 4): LIGHT: lifetime XIRR fixed, no toggle or disclaimer button, print the disclaimer text and the stale/unpriced fund names (today title-tooltip only). **Sold funds**: collapsed on screen; force open, no button (sample page 6 shows it). Coverage-gap banner: skip, or one caveat line if gaps exist. Dismissible post-import notice, compare-distributors dialog: never print.
### Performance (sample pages 9 to 11)
| Section | Variant | What changes in print |
|---|---|---|
| performance-returns | **LIGHT** | No basis toggle or Retry; print the lifetime XIRR and a second labelled "current holdings" XIRR (today visible only after toggling); disclaimer panel expanded (reword sentences that say "above"); the fund-XIRR table may split across pages. |
| performance-portfolio-history | **HEAVY** | The screen chart has **no axes and shows values only on hover**. Print: axes (y ticks, year labels), no dots or hover, and a **year-by-year table** (year end, invested, value, gain) derived from the December history points (no new endpoint if history has month-ends). Range: print "All". |
| performance-benchmark-comparison | **HEAVY** | Replace the race track and tabs with static tables: portfolio and the benchmarks by window (1Y/3Y/5Y/SI) and difference; then **every** fund vs its declared benchmark (the screen shows 5 and a "Show more"; details hidden until opened). The index choice is React state only: print uses a fixed set (decision: Nifty 500 default, or all eight as columns, which is cheapest). |
### Allocation (sample pages 12 to 15; the date strip is on this tab)
| Section | Variant | What changes in print |
|---|---|---|
| allocation-asset-class | **LIGHT** + a block | No arbitrage checkbox, chart toggle, drill buttons; donut with a legend that includes **rupee value**; print the "arbitrage as cash-like" variant as one sentence; a static "contributing funds" list per class (today only after a click). Five classes on screen (equity, debt, gold, real estate, others); the sample has Cash. |
| allocation-market-cap | **LIGHT** (donut) / **HEAVY** (stock lists) | Hide controls; the top-stock lists per bucket (hidden until a slice click) as a static table without per-stock fund detail (page count). |
| allocation-category-amc | **LIGHT to HEAVY** | Print **both** views (By Category, then By AMC), descending, no tabs, sort or chart toggle; donut plus legend with rupee value, or tables (more robust beyond 12 slices). |
| allocation-fund-manager | **LIGHT** | No Cards/Table toggle: print the table layout with every manager expanded (funds as sub-rows); regularly exceeds one page: break between rows; keep the "no manager data" warning. |
Date strip (Allocation and Other Analytics): print its words in each section's footer; the "older holdings" pill belongs in the footer only when present.
### Holdings, Transactions, Overlap (sample pages 16 to 35)
| Section | Variant | What changes in print |
|---|---|---|
| holdings-top-by-fund | **LIGHT** | The screen shows **one fund at a time** (a chip picker, default the first): print **one block per fund** (top 10 rows each), no chips or helper text. |
| holdings-all-stocks | **LIGHT** | No sort, search, per-row expand: open every row's "held in" detail (or list the funds inline), repeat the header, links as plain text; consider a top-N cap with a note (no cap in the component; the back end may truncate). |
| transactions-cash-flow | **HEAVY** (bars) + LIGHT | The monthly bars are ~144 columns (about 5000 px) and have no value labels: print **yearly** with value labels, or a yearly table; tiles as static boxes; print "Excluded" switches with its label line; SIP banner as is; no drill. |
| transactions-ledger | **LIGHT** | **All rows** (the screen pages at 50 with "Show all"), no filter or per-row expand, repeat header, `tr` no-split; add Units and NAV columns (and Folio only per the dialog option). Thousands of rows are possible: the sample's 448 rows are about 13 pages; decide a warning or cap beyond a size (I-13 measures). |
| overlap-common-holdings | **LIGHT** | All rows (screen cap 10, sample 20), no chevrons or toggle, **list every fund in the cell** instead of "+N" chips. Card title carries a number prefix ("1. Common Holdings"); the contents list uses the section list's titles. |
| overlap-heatmap | **HEAVY** | Static heatmap: up to 12 funds is about 690 px, borderline for 680: scale the cells, add a **fund-name key** (cells show logos or initials; full names are in a tooltip), legend; the selected pair's shared stocks as a plain list below, scroll cap removed. |
| overlap-top-pairs | **LIGHT** | All pairs or a cap with a "showing N of M" note (up to 66 pairs at 12 funds; the old page caps at 15), no "View more" column, **no name truncation**, keep the key insights text. |
| overlap-impact | **LIGHT** | Donut with no default selection (it defaults to "top 3" popped out): pass no selection; static legend; keep "What drives the overlap". The sample shows a summary table instead. |
Also on these tabs: SIP banner, cash-flow strip, stat strip: print as static boxes; period drill, pair detail's interaction, category tabs ("All funds" printed), switches control: controls only; the coverage banner and the "funds not shown" note carry information and should print.
### Other Analytics (sample pages 36 to 38)
| Section | Variant | What changes in print |
|---|---|---|
| analytics-cost | **LIGHT to HEAVY** | TER ladder: open every row (a single `openId` today, so "all open" needs the print mode), reword the "click a fund" line; valuation spectrum: fix one view (spectrum, default); valuation-by-fund: expand the three collapsed lists and the "how the average works" paragraph, remove `min-width: 640px` and the scroll wrapper, and **print the Nifty 500 value** (the tick's value is title-only today). The sample shows three plain tables here. |
| analytics-category | **LIGHT** | Hide the filter chips; cards one per fund; keep the sentences. |
| analytics-ranking | **LIGHT** | Drop `min-width: 640px` and the scroll wrapper; repeat the header; keep everything. |
The "Fund Quality Scorer" group is switched off (`SHOW_FUND_QUALITY_SCORES = false`) and so is not in the section list; **the sample's page 37 shows it, and the PDF will skip it** while the flag is off.

## 4. Suggested split into Codex handoffs (I-7 step 2)
(1) **Print foundation:** the print root, `PrintMode` context, `SectionCard` print behaviour, chart animation off and fixed widths, `FolioNumber` by option, ready marker, fixed viewport (with I-6). (2) Overview group (3 HEAVY items, the summary strip, sold funds, family view). (3) Performance group (portfolio history and benchmark comparison statics, returns). (4) Allocation group. (5) Holdings and Transactions (ledger all rows, cash flow yearly, top holdings per fund). (6) Overlap group (heatmap key, pairs, common holdings). (7) Other Analytics group. Groups 2 to 7 are independent once (1) lands. Antigravity is needed only if a static chart needs a new look (the Portfolio History and Cash Flow statics): a packet when we reach it.

## 5. Open decisions for the owner
1. **A, B or C** above (recommended C).
2. **Period for the Overview "Value over time"**: the screen defaults to 1Y; the sample prints the whole history. Recommended: whole history.
3. **Benchmark set for the Benchmark Comparison print**: Nifty 500 only, or all eight indices as columns. Recommended: all eight (cheapest, and the choice is not stored anyway).
4. **Very long ledgers**: print every row always, or warn above a size (for example 1,500 rows). Recommended: print all, with a note in the dialog when the report will be long; I-13 measures the cost.
5. **The ledger's Folio column**: follows the dialog option (decided): confirm the dialog option also governs the family holdings table's folios.
