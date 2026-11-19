# Debt Mutual Funds in Unifolio: What Is Unsettled, Missing or Unsure

**Prepared 19 Nov 2026, for review by our CA stakeholder.**
**How this was made:** I read our product documents, decision logs, research notes and the backend code on the docs/redesign branch. Nothing here is guesswork about what the code does. Where I could not confirm something, I say so. I did **not** do outside web research for this list; the tax points in Section 1 are general knowledge and are marked "please confirm".

**One-line summary:** Equity funds have their own data, scoring and look-through work. Debt funds do not. There is no debt document or debt plan. Debt is handled by a few shortcuts that treat all debt funds almost alike, which is not how a CA would see them (credit risk, interest-rate risk and tax all differ a lot between debt funds).

---

## 1. Things we have not built at all

**1.1 Tax on gains (capital gains) is not built for any fund, debt included.**
- We have no short-term / long-term gain report. It was planned and deferred (10-Oct decision).
- For debt this matters most. The plan notes the "post-1 April 2023 debt-fund rule" and the "23 July 2024 rate changes" but no one has written down the exact rule set we will apply.
- *Please confirm / advise:* the rule for units bought after 1 Apr 2023 (taxed at slab rate, no long-term benefit); the old rule for units bought before that date (holding period, indexation); and how the definition of a "specified mutual fund" (a fund mostly in debt) changed from 1 Apr 2025. The line between "equity-taxed" and "debt-taxed" funds is where we are least sure.
- The plan decides equity versus debt tax treatment from the fund's SEBI category name. That is risky for hybrids, arbitrage funds, equity savings funds, funds of funds, gold/silver funds and international funds. Nobody has listed which category gets which tax treatment.

**1.2 We do not store anything about the quality or maturity of the bonds a debt fund holds.**
- The data tables have no place for **credit rating, yield to maturity (YTM), coupon, maturity date, average maturity or modified duration**. I searched the database models and found none of these.
- Fund houses do publish rating and yield in their monthly portfolio files. Our reader reads the rating column but treats it as an "industry/sector" label for equity, and then throws debt rows away for the equity features.
- "Debt by credit rating" (for example how much is AAA, AA, below AA) was decided as "later" and is **not built** (Q27, option B).
- Result: we cannot say whether a debt fund is safe or risky. We cannot tell a safe fund from one that holds weak credits. This is the main thing a CA will notice.

**1.3 We do not measure a fund's actual interest-rate risk (duration).**
- We use only the SEBI category name (Liquid, Short Duration, etc.) as a stand-in. A fund can sit in a category but drift from it in practice.

**1.4 Direct bonds, fixed deposits and other debt the user owns outside mutual funds are "Coming soon".**
- The Home screen shows "FDs and bonds" as not live. This is a deliberate MVP scope limit, but a family's real debt allocation is understated until it is built.

---

## 2. Things we tried and could not get (blocked data)

**2.1 Official benchmarks for debt funds are not available to us free.**
- A benchmark is the index a fund is measured against. For debt funds these are mostly published by CRISIL, and some by NSE.
- We checked three ways (31 Oct): NSE's data tool lists only 12 government-bond indices, 3 money-market indices, 3 state-loan (SDL) indices and the target-maturity series. Its **Corporate Bond list is empty**. CRISIL publishes PDFs only and has no data feed we may use (its terms forbid redistribution).
- What is **not available**: Liquid, Low Duration, Ultra Short, Short, Medium, Composite Debt (A-I, A-II, A-III), Corporate Bond, Banking & PSU, Dynamic Bond, CRISIL Liquid/Overnight, CRISIL Gilt, and the whole "Hybrid Composite Debt" family (15:85, 50:50, 65:35 and 70:30) and Equity Savings indices.
- **Size of the gap:** about 15% of all benchmark names printed in factsheets are Nifty debt indices and 17% are CRISIL indices. We hold none of them. Overall about 84% of printed benchmarks are not in our data.
- **Government-bond (G-Sec) indices from NSE give a price series only.** That leaves out the interest earned, which is most of a bond fund's return. It would understate the benchmark. So even the indices we can see are not a fair yardstick unless a total-return version is found.
- **What users see today:** either "As printed in the fund house's factsheet" (fixed periods only, no daily line) or "No benchmark".
- Owner rule (3 Nov): never show a wrong index. So debt funds are not compared with the Nifty 500. This replaced the earlier behaviour (a liquid fund once showed the Nifty 500).

**2.2 One debt benchmark we can get is not yet checked.** The Nifty 1D Rate index (used for Liquid/Overnight funds) is available, but its figures have **not** been compared with the returns fund houses print. Arbitrage was checked (within 0.01 points). 1D Rate was not.

**2.3 Fund-house portfolio files (what each debt fund holds) are only partly in hand.**
- A 19-Nov audit found ordinary fund series covered about 66%, but **fixed-maturity plans, ETFs and funds of funds only about 9%**.
- Whether missing files for fixed-maturity plans and matured funds are a real problem is "unknown" in the audit.
- Several debt files have gaps even when we do hold them. Example: one debt fund's lines with a recognised ISIN add up to only about 90% of the fund; the rest are items without an ISIN (interest-rate swaps, TREPS, receivables).
- Debt funds report **fortnightly** at some fund houses and monthly at others. The plan was built around monthly.
- Bandhan's monthly page lists only its debt portfolio, not the rest. Some fund houses block our software.

**2.4 Fund-manager data (applies to debt funds too).**
- 10 fund houses need a person to download factsheets by hand every month. 5 fund houses publish no usable factsheet (33 live funds).
- The first automatic run was due **10 Nov 2026**, and today is 19 Nov. I could not tell from the documents whether the hand imports or the decisions were done. The 3-Nov status notes list them as still owed.
- Some debt-sleeve managers show up as the "main manager" of equity index funds (Motilal Oswal case). The owner decision is still open.

---

## 3. Numbers we made up by judgement (no reliable source)

**3.1 Hypothetical stress-test percentages for debt funds.**
- The "what if" scenarios (rate shock, rupee crash, equity bubble burst and so on) give each asset type an assumed % change. For debt there are two buckets: "Debt-short" and "Debt-long". Examples: rate-shock scenario: short -1%, long -4%; Fed pivot scenario: short +1%, long +4%; rupee shock: short -2%, long -6%.
- These come from our own reasoning (they cite the 2013 Taper Tantrum and the 2022-23 rate hikes) and are **not computed from data** or checked against any external source.
- The feature is **switched off** in the code until someone reviews "the 45 hypothetical assumptions". That review has not happened.
- *Please advise:* are these numbers reasonable, and who should sign them off?

**3.2 How a fund gets put into "short" or "long" debt is a crude word match.**
- Short = the fund's category or name contains liquid, overnight, money market or ultra short. Everything else with "debt", "income", gilt etc. becomes "long".
- Consequences I found in the code: **Low Duration, Short Duration, Banking & PSU, Floating Rate, Corporate Bond, Credit Risk and Gilt funds are all lumped together as "long debt"** and get the same assumed fall. A Low Duration fund and a 10-year Gilt fund behave very differently. Credit Risk funds (default risk) are treated like government-bond funds (interest-rate risk).
- **Arbitrage funds are counted as "short debt" in scenarios** even though tax law treats them as equity funds and they hold equity-linked positions. In the asset-allocation view, arbitrage and cash are also counted as debt.
- Dynamic Bond and 10-year Gilt (very different risk) sit in the same bucket.

**3.3 Real historical crisis windows are researched, but the effect on each debt fund type is estimated from category averages.** The IL&FS (2018) window was corrected from an earlier stakeholder figure to **Aug-Nov 2018** after checking. The Franklin Templeton (2020) wind-up is shown as "frozen, no % given" for the 6 named schemes. For other debt funds the broader category average is used as a stand-in. Whether that is a fair stand-in is not settled.

**3.4 Fixed 6.5% "risk-free rate" in risk ratios.**
- The Sharpe-type figure on the fund page uses a flat 6.5% risk-free rate for all periods and all funds (a setting in the code).
- Liquid and short debt funds earn close to the risk-free rate. A wrong fixed number can make their risk-adjusted ratios look strange or unstable. Not reviewed for debt.
- *Please advise:* what risk-free rate should we use (91-day T-bill? repo? changing with the year?).

---

## 4. Scoring (the Unifolio Fund Score): not finished, and built around equity

- **Scorer V2 is not built.** Work was **paused on 22 Oct 2026** with one decision waiting for the owner. Only the older scorer is live.
- The score has 11 equity-style parts. For debt funds these are doubtful or not answered anywhere in the documents:
  - **Valuation (5%) uses P/E and P/B, which do not apply to a bond fund.** I could not find a rule saying what happens for debt funds.
  - **Max drawdown, up/down capture, information ratio** assume a benchmark. For debt, benchmarks are missing (see 2.1).
  - **Corporate Bond funds:** decided to leave out the three benchmark-based parts (22.5% of the weight) and re-spread the rest over 8 parts. We call the accuracy cost "low to moderate". That is our own opinion, not something tested.
  - **Hybrid funds:** the benchmark would be a mix we build ourselves, and users must be told it is "Unifolio-constructed, not an official index". The plan relied on the G-Sec composite for the debt part, but we later found that index has price-only data. **These two notes disagree, and I could not find where it was reconciled.**
  - The "no benchmark, so excluded from the score" rule must also be shown to the user. The wording of that message has not been decided.
- **Comparing a debt fund only with its own category** needs at least 15 funds. Many debt categories fall short, so the plan merges neighbouring categories (our own rule). For example:
  - Gilt with 10-year constant duration (5 funds) is scored against plain Gilt (23 funds).
  - Long Duration (11) and Medium-to-Long (13) are merged (24 funds).
  - Medium Duration (14) is merged into Short Duration (27).
  - These merges are our judgement that adjacent maturity bands can be compared. The plan does not merge Credit Risk with Corporate Bond because they differ in credit risk.
  - Categories left as "low confidence" (not merged): Floating Rate, Credit Risk (borderline, exactly 15), Fixed Term Plans, Life Cycle funds, Retirement and Children's funds, "Other" debt.
  - *Please advise:* is merging adjacent maturity bands acceptable, and does a "low confidence" tag protect the user enough?
- SEBI's **26 Feb 2026** circular changed some categories (new "Life Cycle" funds, Solution-Oriented schemes closed to new money). I did not check whether it changed any debt categories. Many AMCs have not relabelled their funds yet.
- The expense-ratio part compares a fund with its category average. For debt funds the ratio is small and differences matter a lot; not reviewed for debt. A matured fixed-maturity plan has no expense ratio and is marked "never matches".

---

## 5. Accuracy doubts on numbers already shown to users

**5.1 A debt fund with no available price can disappear.** The old note says a held fund with no price silently vanished from holdings and totals. The code now carries a "price unavailable" flag, but whether every screen shows it clearly is not confirmed. Unusual debt units are the likely trigger (example: IL&FS infrastructure debt units have a ₹10 lakh unit price, which crashed the price load until fixed in migration 0038).

**5.2 Side pockets / segregated portfolios.** The system has a "segregation" transaction type, and treats segregated units as extra holdings. I did not find a documented check using a real side-pocket statement. How cost is split between the main fund and the side pocket, and how a zero or frozen NAV is valued, is not proven.

**5.3 Fixed-maturity plans and funds that have matured or are winding up.** Not handled as a special case. We do not know how a matured plan shows, whether its maturity payout lands correctly, or whether the fund vanishes from the price feed. A comment in the code already notes matured plans drop out of the AMFI feed.

**5.4 Opening-balance cost.** For statements with opening balances (10-year files) our cost and return numbers are approximate. A plausibility guard was added after a real client case, and a later test (3 Nov) showed a gate failure on the opening-cost convention. This affects all funds, but especially debt funds held for a long time, since the real cost and date are unknown. Marked "approximate" only in some places.

**5.5 Dividends (IDCW) on debt funds** are handled as payouts and reinvestments in the return maths. The treatment of tax already deducted at source on these payouts is not documented.

**5.6 Dashboard allocation label** groups a fund as "Debt" if its category contains words like debt, income, liquid, money market. Odd categories (index funds, ETFs and funds of funds that hold bonds) rely on the fund name instead, which can misfile.

**5.7 Dashboard price refresh** re-downloads each fund's price history on every open: 4.5 s for 12 funds, 19-23 s for 42-46 funds. A known gap, left as is. Not debt-specific, but families with many liquid/debt funds feel it.

---

## 6. Things that are unorganised (no home, no owner)

- **There is no debt PRD, plan or tracker.** Debt notes are spread over at least ten documents: scenario planning, scorer annexes, benchmark research, deferred-features, disclosure audits and the decision log. Equity has its own look-through plan; debt does not.
- **Deferred but not scheduled:** the debt-fund benchmark rule (#24), capital gains (#20), debt by credit rating (Q27), Equity Savings hedged portion (Q26).
- **Equity Savings funds** (part equity, part arbitrage, part debt) currently end with "no benchmark". Their split between equity and debt is not built.
- **Decision owners:** several debt choices are waiting on the product owner (Scorer V2 scope, scenario review, benchmark choices, manager labels) with no dates.

---

## 7. Questions I would like our CA to answer

1. **Tax rules:** which fund types are taxed as debt and which as equity, for purchases before and after 1 Apr 2023, and from 1 Apr 2025? What exact treatment for hybrid, arbitrage, equity savings, funds of funds, gold/silver and international funds?
2. **Which debt facts should we show users?** Is it enough to show category and past return, or must we also show credit rating mix, YTM, average maturity and duration?
3. **Benchmarks:** if we cannot get the official CRISIL/NSE series, is it acceptable to (a) show the factsheet's printed returns only, (b) use a clearly labelled proxy, or (c) show no benchmark? Which is the least misleading for a Corporate Bond, Banking & PSU or Gilt fund?
4. **Risk-free rate:** which rate and what source should we use for risk-adjusted ratios on debt funds?
5. **Stress-test assumptions:** can he sanity-check the debt percentages in 3.1, or suggest a published source (for example a rate-shock method using duration)?
6. **Peer groups:** is it fair to merge adjacent duration categories (Section 4), and should Credit Risk funds ever be compared with Corporate Bond funds?
7. **Special cases:** how should we treat side pockets, fixed-maturity plans at and after maturity, and wound-up funds, for both value shown and tax?
8. **Arbitrage and cash:** should arbitrage funds and cash-like holdings count as "debt" in asset allocation, or as equity/cash? (Tax law treats arbitrage as equity.)
9. **Scoring:** should a debt fund be scored on a different set of parts than equity (for example credit quality, duration, expense ratio, consistency of returns) and drop P/E, P/B and equity-style capture ratios?
10. **Where to start:** which three of the items above carry the most risk for a family-office or HNI client?

---

## Where I looked (for follow-up)

Docs: `DEFERRED_FEATURES.md`; `Docs/data-resources-reference.md`; `Docs/Scorer-V2/` (annex, benchmark research, resume note); `Docs/analytics/2026-10-07-sub-project-1-planning.md` and the scenario spec; `Docs/orchestration/2026-10-31-factsheet-state-and-benchmark-gaps.md`; `Docs/orchestration/2026-11-03-o6-o7-readings.md`; `Docs/orchestration/2026-11-19-disclosures-*`; `Docs/investigations/2026-10-06-cas-import-deferred-items.md`; `Docs/Analytics-Dashboard-Internal-Correction-Plan.md`.
Code: `analytics/scenario_asset_class.py`, `benchmark_selection.py`, `benchmark_registry.py`, `asset_allocation_lookthrough.py`, `portfolio_disclosure_parsing.py`; `dashboard/allocation_labels.py`; `fund_page/risk.py`; `config.py`.
