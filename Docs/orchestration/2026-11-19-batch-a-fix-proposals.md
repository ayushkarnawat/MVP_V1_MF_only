# Batch A: fix proposals for your review (19 Nov 2026)

**How to read this.** The review gate stands: **no code that changes a number is written until you approve a proposal, one at a time.** Each proposal has the six parts the plan asks for: the cause with its evidence, the change, before and after, risk and reach, the failing test that is written first, and your decision. Nothing here is built. Evidence: `2026-11-19-rk4-real-pool-reconciliation.md` (staging, 19 Nov, 46 of 46 held funds priced), `2026-11-18-xr2-caller-audit-table.txt`, the 25 XIRR fixtures (agree with Excel and an independent solver), and the seven category-average checks (CA-3).

**What is ready and what is not.**
| ID | Plain name | Changes a number | Evidence | My recommendation |
|---|---|---|---|---|
| FX-10a | A real Direct fund is missing from its category ranking | Yes: "out of N", ranks | Real data, 5 funds | Approve |
| FX-10d | Only the Growth option is ranked (two parts) | Yes: ranks, the category average | Real data, 5 funds | Approve both parts |
| FX-10b | The category average counts the same funds the rank counts | Yes: the category average | Real data, 4 to 1 extra funds per group | Approve |
| FX-9a | The older blended average (kept for print and phone views) | Yes, in those views only | CA-3 T9-5 | Your decision (two options) |
| FX-8c | One end date for every XIRR figure | Yes: XIRR moves by up to 0.5 point | XR-2 caller audit | Approve |
| FX-8d | The tile and the column come from the same inputs | Yes, when they differ today | XR-2, T8-7 not yet run | Approve with FX-8c |
| FX-8e | A fund held a few months, and flows that net to zero | Yes: display | 25 fixtures, T8-9 | Your decision (three options) |
| FX-10c | One common end date for a pool | No number today | RK-4: 0 mixed end dates | Park (guard only if it appears) |
| FX-8a, FX-8b | A held fund with no price | Only if a price is missing | **Needs XR-3 (synthetic tests T8-4, T8-5), not run yet** | Written after XR-3 |

Recommended order to read them: FX-10a, FX-10d, FX-10b (the rank and average family, one root), then FX-9a, then FX-8c with FX-8d, then FX-8e.


## Owner decisions, 19 Nov 2026 (recorded the same day)
| Proposal | Decision | Note |
|---|---|---|
| FX-10a | **Approved** | Handoff written: `2026-11-19-rk7a-pool-representative-fixes-handoff.md` |
| FX-10d (both parts) | **Approved** | Same handoff. The 17 Nov rule "IDCW in no pool" is the plan's own decision (A2 workbook, section 4); the real-data check found the app breaking it in three cases |
| FX-10b (average counts the rank's funds) | **Approved** | Next Codex task (it touches `category_ranking.py`, so it follows the handoff above) |
| FX-9a, legacy blend | **Option A: exactly what the workbook designed** | Same task as FX-10b (same file) |
| FX-8c | **Approved on the condition "if the effect is not big"** | Size is given under FX-8c below; applied on that condition |
| FX-8d | **Approved with FX-8c** | Its test T8-7 comes from XR-3 |
| FX-8e | **Approved as recommended: option 1** (return since purchase, labelled "not annualised", for holdings under a year) **plus a dash for flows that net to zero** | Options restated under FX-8e |
| FX-10c | **Parked** (not approved) | Plain meaning under FX-10c |
| FX-8a, FX-8b | **Proposals written after XR-3 (run 19 Nov)**; waiting for your decision | See the last section |

**How these map to the plan's IDs (so nothing is hidden).** The plan lists FX-8a to FX-8e, FX-9a and FX-10a to FX-10d. What I wrote differs in three places. (1) The plan's **FX-10a** also says "retry and complete the price history for every peer before a total is shown" and "replace the 30-day rule only if the ledger shows it drops live funds". The real-data ledger showed **neither** happening today, so by the plan's own condition those two parts are not triggered and are not in the fix. What I wrote as FX-10a is the plan's "correct the grouping of schemes into funds". (2) What I labelled **FX-10b** is really the plan's **FX-9a** ("anything CA-3 shows wrong"): CA-3 found that the average pool and the rank pool differ. The plan's own **FX-10b** (a difference from an official reference only by definition: you decide) belongs to RK-5, the cross-check against AMFI and SEBI, **which has not been done**, so it is still open. (3) FX-10d, FX-10c, FX-8c, FX-8d and FX-8e match the plan.

---

## FX-10a: A real Direct fund is missing from its category ranking
**Cause and evidence.** For each fund the app picks one series to stand for it. `get_category_peers` (`scheme_universe.py`) accepts a series whose plan is unknown and takes the Growth series with the lowest code. The ranked pool (`load_ranking_pools`) then keeps only the exact plan, so a fund represented by an unknown-plan series **vanishes from the ranking** while its real Direct Growth series is never looked at. Real cases on staging: Bank of India Large & Mid Cap (110599 chosen, Direct 119350 lost), Bank of India ELSS (111709 / 119351), Baroda BNP Paribas Corporate Bond (150229 / 150237), Baroda BNP Paribas Liquid (101408 / 119415), Axis Liquid (112713 / 120389).
**Change.** Choose the representative only among series of the wanted plan; an unknown-plan series is used only when the fund has no series of that plan, and then it is not ranked (as the recount does).
**Before and after.** Large & Mid Cap (Direct) "out of" **32 becomes 33**; Corporate Bond (Direct) over 1Y and 3Y **20 becomes 21**; in Liquid and ELSS the members change (the swapped funds are the ones listed), the count does not. Same synthetic fixture for the test; real values re-measured on staging after the fix.
**Risk and reach.** Any held fund in these six groups sees "out of N" and possibly its rank change by one. No stored result is wrong in a way users cannot see: they just lack one peer. A one-time stored-result rebuild (already planned for M2).
**Failing test first.** A fund with two Growth series, an unknown-plan one with the lower code and a Direct one: today the pool lacks the fund; expected: it is in the Direct pool with the Direct series.
**Decision:** approve / change / reject: ________

## FX-10d: Only the Growth option is ranked (two parts)
**Cause and evidence.** (a) `rank_key` decides "Growth" by finding the word anywhere in the fund name and option text, so a fund with "Growth" in its name makes all its options look like Growth and the lowest code wins: **Nippon India Growth Mid Cap Fund is ranked by its Bonus Option** (118665 Direct, 100376 Regular) instead of the Growth Option (118668, 100377). The test for IDCW also misses the spelled-out "Income Distribution cum capital withdrawal" and "IDWC". (b) A fund with **no Growth series** is represented by its IDCW series: Navi Liquid Direct (Monthly IDCW - Payout), HSBC Liquid Direct (Daily IDCW), LIC ULIS (IDCW Reinvestment, in ELSS). The code's own comment says an IDCW NAV drops at each payout and understates the fund, and you decided on 17 Nov that IDCW is in no pool.
**Change.** (a) Read the option words only (Growth, Bonus, IDCW, spelled-out income distribution, payout, reinvestment), never the fund name; Bonus is not Growth. (b) A fund with no Growth series is left out of the ranking and the average and **listed with the reason "no Growth series"** (your 17 Nov decision's wording).
**Before and after.** (a) Mid Cap (Direct and Regular): the Nippon fund's return changes from the bonus option's to the Growth option's; count unchanged. (b) Liquid (Direct): Navi and HSBC leave the pool; the Baroda and Axis Growth funds (see FX-10a) join; count 37 stays; ELSS: LIC ULIS leaves. Values for a held fund: measured after the fix (not available before it).
**Risk and reach.** Ranks in three groups can shift by the number of swapped funds; a daily-IDCW liquid fund no longer pulls the Liquid average down. The held-IDCW "ranked as Growth" label (RK-8) already covers a held IDCW plan.
**Failing test first.** Part (a): a fund named "X Growth Fund" with a Bonus series of lower code than its Growth series: expected pool member is the Growth series. Part (b): a fund with only an IDCW Direct series: expected not in the pool and in the exclusion list with "no Growth series". Both in the existing RK-3 synthetic category.
**Decision:** (a) approve / change / reject: ________   (b) approve / change / reject: ________

## FX-10b: The category average counts the same funds the rank counts (plan ID: FX-9a, part 1)
**Cause and evidence.** `load_category_pool` builds the average from the whole peer set, which still holds series the ranked pool drops: unknown-plan series, IDCW representatives and index series (the Navi ELSS Nifty 50 Index fund sits in the ELSS average; the Index Funds group has 272 funds in an average and none in a rank). Real data: the app's set is 1 to 4 funds larger than the recount's in 15 of 19 groups. CA-3 found the same by code reading.
**Change.** One pool for both: the average uses the ranked pool (Growth, the wanted plan, no index or ETF series). The Index Funds category keeps its average over its own funds (the one place an index series is the point), as today.
**Before and after.** Per group the average moves by the weight of the 1 to 4 funds that leave; the size of each move is measured on the same staging data once built (not known today). In the test fixture: the same category with a plan-unknown fund and an index fund, average before and after.
**Risk and reach.** Every category average and every "compared with category" line can move slightly; the Excel I will build later (CA-6) reads the same pool, so it will match the screen.
**Failing test first.** CA-3's T9-6 (same funds in both pools except the index rule) already runs; add the plan-unknown and IDCW cases to it so it fails today.
**Decision:** approve / change / reject: ________

## FX-9a: The older blended average (kept for print and phone views) (plan ID: FX-9a, part 2)
**Cause and evidence.** The workbook blends the displayed 3Y and 5Y averages (40% of the 3Y, 60% of the 5Y). The app blends fund by fund and counts a fund with no 5Y return at 100% of its 3Y return. With one 3Y-only fund the app gives **0.2650** against the workbook's **0.2200**; with identical period pools both give 0.3100 (CA-3 T9-5, run by me and by Codex).
**Options.** **A:** blend the displayed averages as the workbook says (recommended: the workbook is the design). **B:** keep the per-fund blend and change the workbook. **C:** retire the older blend now (it is kept only until the cleanup release).
**Risk and reach.** Only the views that still show the older figure (desktop print and phone). A is a small change; C removes a number users may be looking at.
**Failing test first.** T9-5 is already written and held as an expected failure; it turns green with A.
**Decision:** A / B / C: ________

## FX-8c: One end date for every XIRR figure
**Cause and evidence.** The final flow (today's value) is dated by the server clock, not the price date, and each caller dates it differently. On one invented household the same whole-history figure is **44.69%** (the dashboard, final flow 6 Jan), **44.57%** (the benchmark windows, 7 Jan) and **45.06%** (the fund page, 3 Jan): `2026-11-18-xr2-caller-audit-table.txt`.
**Change.** The final flow carries the date of the price it uses, the same for every caller.
**Before and after.** Before: three figures as above. After: one figure, the one for the price date (the fixture test pins the exact value).
**Risk and reach.** Every XIRR figure can move at weekends and holidays (a price dated Friday is no longer treated as Monday). **How big:** moving the end date by one day moves the rate by about *the rate divided by the days invested*. On the invented household above (45% over about 13 months) that is about 0.12 of a point per day, which is the whole 44.69 against 44.57 difference. For a household held three years at 15% it is about 0.014 of a point per day, and for five years at 12% about 0.007. A weekend (two to three days) therefore moves a long-held portfolio by well under a tenth of a point, and only a short, high-return holding by a few tenths. This is an estimate from the formula and the fixture; the exact before and after on the staging households is measured when the fix is built. Stored results rebuilt once.
**Failing test first.** The XR-2 caller-audit fixture: the callers' last dates must be equal.
**Decision:** approve / change / reject: ________

## FX-8d: The tile and the column come from the same inputs
**Cause and evidence.** The tile is computed live; the per-fund column is a stored result from the 06:30 run (finding F3, F8). One household can show 9.4% and 9.0% side by side with nothing to explain it (workbook A1). The synthetic test T8-7 is part of XR-3 and is not run yet; the cause is read in code and in the caller audit.
**Change.** Both read the same inputs and the same price date, and the screen says which date.
**Before and after.** Made-up numbers from the workbook: 9.4% and 9.0% become one figure.
**Risk and reach.** The Mutual Funds holdings page and the Home tile. No new endpoint; additive fields.
**Failing test first.** T8-7: the tile and the stored column agree for the same household and day.
**Decision:** approve / change / reject: ________

## FX-8e: A fund held a few months, and flows that net to zero
**Cause and evidence.** A short holding is annualised into an extreme percentage: the same lump-sum gain annualises to **109%** over three months and **219%** over one month (XR-2). A set of flows that nets to zero on one day gives 0% in the app, a spreadsheet error in Excel and no answer from the independent solver.
**Options.** **1:** show the return since purchase for holdings under a year, labelled "not annualised" (a three-month 20% gain would read 20%, not 109%). **2:** show a dash and say why. **3:** keep the annualised figure and add a note. For the net-zero case: show a dash ("not meaningful") instead of 0% (recommended in every option).
**Recommended:** option 1 (it keeps a number, and an absolute return for under a year is the usual fund-performance convention); you decide.
**Failing test first.** T8-9 short-period fixtures plus the same-day net-zero fixture (today held as a strict expected failure).
**Decision:** 1 / 2 / 3: ________   Net-zero dash: yes / no: ________

## FX-10c: One common end date for a pool (parked)
**In plain words:** each fund's return in a category ends on that fund's own latest price. If some fund houses publish late, the funds in one pool end on different days (up to three days apart for the peers), so a rank compares returns measured on different days. The fix would measure every fund in a pool to one common day. Today every pool ends within a day or two of each other, so it changes no number.
RK-4 found **no pool with end dates more than 4 days apart** (0 flags in 19 groups) with all held funds priced. Nothing to fix today; the chart's end-date rule (Batch D, D-12) can use the pool's newest date. **I will re-run the check after the first weekend and holiday and bring it back only if a flag appears.** Decision: park / build the guard now: ________

## FX-8a and FX-8b: A held fund with no price (written after XR-3)
All 46 held staging funds are priced today, so neither can be shown on real data. They are proven by the synthetic tests T8-4 and T8-5 inside XR-3 (the next Codex task); the proposals follow that result.

---
## What happens after your decisions
Each approved proposal becomes one fix task (failing test first, one Codex task at a time, my review), then the stored-result rebuild and before-and-after check at M2. Rejected ones are closed with your reason. Nothing is deployed before the whole-plan review (XR-7, RK-11, CA-10) and the M2 guide.

---
## FX-8a and FX-8b: a held fund with no price (written after XR-3, 19 Nov)
**Evidence (XR-3, run by me, `1d61abb2` on `batch/a-numbers`).** On an invented two-fund household, one fund unpriced: the headline XIRR reads **-45%** (the unpriced fund's purchases stay in the flows, its value is left out) where the household is **+15%** with both funds valued, or **+10%** if the unpriced fund were left out whole (flows and value together). The per-fund job raises `TypeError: conversion from NoneType to Decimal is not supported` at `analytics/benchmark.py:169` for the same holding, which could blank the per-fund column. On staging today all 46 held funds are priced, so neither can happen to a real household right now; it is the rarer case of a fund with no price at all.
**FX-8a change (workbook).** Give every held fund a value, in order: the stored price on or before today (kept with its date); if none, retry the live source; then the latest stored price of any age, marked stale as the screens already do; then the statement's own closing price. Only a fund that has never had a price anywhere is left out, and then **both its flows and its value are left out together**. **FX-8b change.** The per-fund job skips a fund without a value and keeps every other fund's figure.
**Before and after.** -45% becomes +15% (a stale or statement price) or +10% (never priced, left out whole). **Risk and reach.** Only households with an unpriced fund; no change for any household whose funds are all priced (all staging households today). **Failing tests first:** `test_fund_without_nav_is_not_silently_dropped` and `test_per_fund_job_with_no_nav_holding_does_not_raise` (both written, held as strict expected failures).
**Decision FX-8a:** approve / change / reject: ________   **Decision FX-8b:** approve / change / reject: ________
