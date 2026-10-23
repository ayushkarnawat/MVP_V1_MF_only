# PRD: Individual fund page, Overview and Insights, MF-only, desktop (draft v1)

**Status:** draft, 2026-10-23, for owner review. A new document; no existing PRD has been edited (section 9 lists where existing PRDs may need a note, to be asked first). Source of truth: `Docs/Web app UI mockups MFs.pdf` pages 24 and 26 and the planning workbook (L1 to L19).

## 1. Problem and goal

A user who sees a fund on Home or in a list has nowhere to look at that one fund: how it has performed against its benchmark and category, what the user's own money has done in it, how risky it is, what it holds, who runs it and what stands out. Goal: one page per held fund that answers those questions with numbers the app already trusts, every element opening the evidence behind it.

## 2. Users

Indian retail mutual fund investors tracking one or more family members' portfolios (Family Combined or one member). Held funds only this round.

## 3. Scope

In: Overview tab, Insights tab, the title block, breadcrumb, tab strip. Out: Overlap tab (another owner builds it, route reserved, L17), Performance, Holdings, Peer Comparison and Transactions tabs, search, mobile, funds the household does not hold, Mira text, manager photo and strategy content, any edit of existing screens.

## 4. Requirements

**Header and tiles**
- FR-1 Title block: AMC logo (existing component, first-letter fallback), fund name, pills for plan, category and fund house; no Growth pill. Add Investment, the "..." menu and Update are shown disabled (L10, D2).
- FR-2 Stat tiles: current value with share of portfolio, invested, total gain with percent, XIRR (no sub-line), expense ratio. Each opens a drill-down.
- FR-3 Score card: ring with the fund's `final_score`, verdict and sentence; opens the existing score popup unchanged. Score is stored-first, else computed for this fund.
- FR-4 Tabs: Overview, Overlap (disabled), Insights; the member picked in the shell is kept.

**Overview**
- FR-5 Performance chart: chips 1M, 3M, 6M, 1Y, 3Y, 5Y, All; lines for the fund, its benchmark (index total return, chosen from the fund's category) and its category average; legend with period returns; tooltip; legend items toggle lines.
- FR-6 Returns table with a toggle Inception | Current. Inception: fund, benchmark and category for 1M to 5Y and Since Inception. Current: your XIRR and the same cash flows in the benchmark for 1Y, 3Y, 5Y and since first investment.
- FR-7 Your Investment Details: units, average and current NAV, invested, current value, gain, XIRR, first and last investment, folio numbers (masked, copyable).
- FR-8 Risk Metrics (3 years): volatility, maximum drawdown, Sharpe, beta with a band label each, and the window printed.
- FR-9 Top 10 Holdings with stock count and a full holdings panel; Fund Allocation donut with Market Cap, Sector and Asset Type tabs and the disclosure date.

**Insights**
- FR-10 Smart Insights: the top three facts from the insights engine as cards (long-term performance, overlap, fund management), each opening its evidence, and a follow-up button that opens the Mira popup. Heading and attribution: question M11 (replaces the earlier placeholder decision L7).
- FR-11 Key Insights, Strengths and Considerations: fixed-template facts from computed numbers with evidence popups; no advice wording; a fact with missing input is omitted.
- FR-12 Fund Manager and Strategy: name, role and managing-since; photo, biography, approach and style marked Coming soon.
- FR-13 Rolling Returns (windows 1, 3, 5 years), Period Returns (bar width follows the chip) and Risk-Return scatter (3-year, fund highlighted).

**Behaviour**
- FR-15 Every figure, row, chip and chart element opens something or responds, and looks it through hover and cursor treatment; unbuilt targets are greyed with a tooltip (L14, D2).
- FR-16 Family Combined pools units, amounts, folios and XIRR; a member who does not hold the fund sees the fund with personal tiles replaced by "Not held by <name>".
- FR-17 Every section loads independently; a failure or missing data is shown per section in words.

## 5. Non-functional

Set from the 23 Oct staging measurement (46-fund household, three categories): tier 1 under 300 ms from stored prices (estimate; the old household-wide path costs 20 to 22 s and is not used), tier 2 each under 50 ms (measured 10 to 19 ms), tier 3 first open of a category under 5 s behind skeletons (measured 2.0 to 4.5 s), later opens fast from the cache. Money and units are `Decimal`. Light and dark themes. Desktop 1024 px and wider. No new table, job or package. No live price downloads except one fund with no price in 3 days.

## 6. Success measures and tracking

Event tracking is deferred for the redesign (same decision as Home, 23 Oct). Measures to add when tracking returns: page opens per active user, Insights tab opens, drill-down opens, score popup opens, time to first card.

## 7. Risks

Cold-start cost of the category peer pass (measured 2.0 to 4.5 s per fund; the 10-year peer series is the largest part).  Missing data presented as fact: fund managers (five fund houses), disclosures (ten hand-imported houses), TRI rows on staging. Template insights read as advice (banned-word test). Equity benchmark shown for debt and hybrid funds (hidden for non-equity, S9). Hot-linked logos break or leak a request to the AMC site. Everything-clickable scope (about 25 targets, fixed by the click map).

## 8. Rollout

Staged with the redesign after the shell (PR 1) and Home are built; the Overlap tab goes live when its owner replaces its route file. No feature flag (staging is the test bed, as Home).

## 9. Conflicts with existing documents (for the owner; nothing edited)

- The Dashboard's per-fund `FundDetailModal` and signal graph are the old per-fund view; this page does not replace or edit them. PRD-03 (Main Dashboard) may need a note that the per-fund view moves to this page when the redesign ships (ask first, same approach as the Home PRD-03 note).
- PRD-04 (Analytics) describes the score and rankings for the Analytics screen; showing the same score per fund here is consistent, but its fund-level API surface is extended (`/fund-page/...`); the TDD document's API list would gain a line (ask first).
- The PDF mockup numbers do not reconcile (units times NAV, return windows, expense ratio); they are illustrative and not used as test data (workbook section 8).
- The risk-free rate and band thresholds are new constants not in any existing document; they are recorded in the backend decisions proposal.
