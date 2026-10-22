# Analytics UX + Chandra fix: staging QA results and follow-ups (LeapSwitch, 2026-10-22)

Source: the user's screenshots from the staging QA run (guide: `2026-10-20-leapswitch-staging-deploy-guide-analytics-and-chandra.md`, Steps 11 to 13). Nothing here has been fixed yet; the follow-ups below are documented to be done later.

## Follow-ups (not fixed)

### F1. History hover: the tooltip is a box below the chart, not a floating pop-up (user decision: document now, fix later)
**What the user saw:** hovering a month on the History chart shows a guide line and an enlarged dot, but the details (month, portfolio value, cost of holdings, gain) appear in a **box underneath the chart**. The user wanted a **pop-up that floats next to the pointer, like the one in the artifact** (and like the hover on the holdings pop-up graph, `frontend/src/components/FundSignal.tsx`).
**What the artifact specified** (`Docs/orchestration/analytics-ux-changes-spec/analytics-ux-changes-v18.html`, the "hovering over June 2025" mockup, item 12):
- A tooltip **beside the guide line**, on the left of it so it never runs off the right edge, **flipping to the right near the left edge** (it never leaves the chart).
- Content: month; Value; Cost of holdings; **Gain with a percentage** ("+₹53,90,000 (+38.9%)"); **"Since May 2025 +₹2,50,000 (+1.3%)"** (the change since the previous month); and the hint **"Click for the fund-wise details"**.
- A legend entry for the hollow dot ("A fund had no price").
**What was built (P6-T4):** a block below the chart with month, portfolio value, cost of holdings and gain in rupees only. Missing versus the artifact: the floating placement and side-flipping, the gain percentage, the "since previous month" line, the click hint, and (to check) the hollow-dot legend entry.
**Why it happened:** the plan I wrote for P6-T4 listed the tooltip fields but not the floating placement, the flip rule, the percentage or the previous-month line, so the build followed the plan and not the mockup. This is a plan gap, not a Codex deviation.
**Fix, when picked up (frontend only, small):** in `frontend/src/features/history/HistoryChart.tsx` position the tooltip next to the guide (clamped inside the chart, flips side near an edge), add the gain percentage and the "since the previous month" line (decimal-string maths via `lib/decimal.ts`), add the click hint, keep the phone flow (first tap shows the card, "See details" or a second tap opens the sheet), and update `HistoryChart.test.tsx`. Look at how `FundSignal.tsx` positions its hover.

### To check (observations from the screenshots, not confirmed defects)
- **C1. Month-detail table columns.** The December 2021 pop-up shows Fund, Units, NAV (date), Value, Cost; the plan also lists **Change** and **Market movement** columns per fund. Check whether they are present to the right (horizontal scroll) or missing at that width.
- **C2. Page shift while a sheet or pop-up is open.** With the pop-up open the page's scrollbar disappears (the scroll lock sets the body to `overflow: hidden`), which can nudge the layout sideways. Consider `scrollbar-gutter: stable` on the page.
- **C3. The fund score pop-up shows "5.8 / 10"** while the card behind it shows "58.1 / 100". It is the same number on two scales (pre-existing, not from this work); worth unifying later.
- **C4. Partial months on staging.** The family History chart shows hollow (partial-month) dots from about 2021 to 2023 and the December 2021 pop-up names WhiteOak Capital Flexi Cap as having no price. The guide predicted none on staging; the cause is synthetic holdings in funds that had no NAV yet (the fund launched later than the holding date in the synthetic statement). Not a failure of the code; the guide's expectation was wrong.
- **C5. Hollow-dot legend** ("A fund had no price" in the artifact): not visible in the screenshots; check below the chart.

## What the screenshots show, against the QA checklist
| Item | Evidence | Result |
|---|---|---|
| B1 Allocation | Analytics, By Category: "Smallest first / Largest first" toggle, list runs 0.4% up to 9.3% | **pass** (Category tab). AMC tab, main dashboard donut and phone not shown |
| B2 Labels | Benchmark list reads "Nifty 50 / 500 / LargeMidcap 250 / Midcap 150 (Total Return)" | **pass** for benchmarks. The shortfall wording and "no S20" not shown |
| B3 Score and tiers | Tier badges T1 green, T3 slate, T5 red (light mode); "Moderate Quality Portfolio"; the "How is this calculated?" toggle is present but **collapsed**; the open pop-up shown is the older fund-score pop-up | **partial**: tier colours pass in light mode; the new explainer text, dark mode and print not shown |
| B4 Rankings | Category ranking: "Ranked on the blended 3Y/5Y return.", "Compared with Direct plan peers", 1Y/3Y/5Y table (Fund, Category average, Difference), "Category average covers 36 funds (1Y), 36 (3Y), 27 (5Y)" | **pass** for Category ranking. Fund ranking and the two-section consistency not shown |
| B5 Fund managers | Four-column table (manager, AMC, current value, % of overall portfolio) | **pass** for the table; the "Covered by manager data" row and the footnote are below the visible area |
| B6 TER | Cards show "₹2,38,529 / year at today's value"; "No Regular plans in this portfolio, so there is nothing to compare against."; fund-wise table with Next 1 year / 3 years / 5 years | **pass** (totals row below the visible area) |
| B8 Scenarios | Each scenario once; exact dates ("20 January 2020 – 31 March 2020", "28 February 2026 – ongoing"); Franklin shows "Freeze" | **pass** for the picker. Opened screens, US-Iran phases and the Franklin neutral headline not shown |
| B9 History chart | Guide line and dot follow the pointer; subtitle "Month-end values · latest 30 September 2026"; axis labels | **partial**: works, but the hover details are in a box below (see F1) |
| B10 Pop-up | December 2021: loading finished, All / ANAND / AYUSH filters, "Incomplete prices: WhiteOak Capital Flexi Cap Fund…" banner, change and market movement shown as "—", portfolio value ₹49,89,497, new money ₹1,12,041, fund table with member names | **pass** for the partial-month behaviour (see C1) |
| QA-1 (Chandra A) | Household Total Invested **₹1,52,65,999** (expected about ₹1,52,66,000) | **pass** for the household total. The HDFC and Sundaram per-fund checks not shown |
| QA-2 (Chandra B) | Household XIRR **124.90%** with the ⓘ and "90% of this return is based on an undated opening balance — may be inflated. Tap to see why."; popup "Why this return may be misleading" with Shown Lifetime XIRR 124.90% and **Without the undated portion −10.18%** | **pass** for the household-total tile (the guide said to record it: **124.90% / 90% / −10.18%**). The per-member figures not shown |

## Not yet covered by the screenshots
B7 (Investment & Withdrawal, the switches toggle and the fund-wise table) on the `kfin_pk_10yr` and `p20_10yr` accounts; the new explainer text; dark mode; the print view; B11 (phone width and the bottom sheet); QA-3, QA-4, QA-5; the Step 13 History click-time measurement on the VM; the Step 10b result.
