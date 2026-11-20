# RK-5: cross-checks against AMFI and SEBI references (20 Nov 2026), part 2

Follows `2026-11-19-rk5-cross-checks.md` (part 1: T10-2) and `2026-11-18-rank-verification-protocol.md`. Official public data only. Nothing in the app or the database was changed: the staging read was one `SET TRANSACTION READ ONLY` query, rolled back. **Done now: T10-7, T10-8, S4, S5 (partly, see the end). RK-5 is complete except for the three fund-house pages that did not load.**

## T10-7: live funds per category at 31 Oct 2026, the app against AMFI's monthly report (S3)
**Label:** S3 = `https://portal.amfiindia.com/spages/amoct2026repo.pdf` (AMFI's report for October 2026, "No. of Schemes as on October 31, 2026"; read as text from the saved PDF, nothing typed by hand). The app's side = the `schemes` and `nav_history` tables on staging, read 20 Nov 2026 about 21:00 IST. A "fund" is one scheme once, whatever its plans and options (AMFI counts the same way): distinct fund house plus base name.

**How the app's count was made.** Three counts per category: (a) active in the app; (b) active and with a stored price dated 27 Oct or later; (c) (b) and first priced on or before 31 Oct. The app keeps price history only for the categories it ranks or pools, so (b) and (c) exist for those categories only; elsewhere (a) is the only count, and (a) also includes matured and merged funds (the flag is not switched off when a fund closes), so (a) is an upper bound.

| Category (AMFI's name) | AMFI 31 Oct | App (c), where history is kept | App (a) active |
|---|---|---|---|
| Multi Cap | 33 | 33 | 33 |
| Large Cap | 35 | 35 | 35 |
| Large & Mid Cap | 36 | 36 | 37 |
| Mid Cap | 34 | 34 | 34 |
| Small Cap | 36 | 36 | 37 |
| Flexi Cap | 47 | **46** | 46 |
| Dividend Yield | 12 | n/a | 12 |
| Value | 24 | 24 | 24 |
| Contra | 6 | 6 | 6 |
| Focused | 28 | 28 | 28 |
| Sectoral (60) + Thematic (194) | 254 | **255** | 256 |
| ELSS | 39 | 39 | 41 |
| Conservative Hybrid | 18 | n/a | **19** |
| Balanced Hybrid | 5 | n/a | 5 |
| Aggressive Hybrid | 30 | 30 | 30 |
| Balanced Advantage / Dynamic Asset Allocation | 37 | **38** | 38 |
| Multi Asset Allocation | 37 | 37 | 37 |
| Arbitrage | 40 | 40 | 40 |
| Equity Savings | 24 | 24 | 26 |
| Overnight | 40 | n/a | 40 |
| Liquid | 44 | 44 | 48 |
| Ultra Short to Short Term | 25 | n/a | 25 |
| Short Term | 26 | 26 | 30 |
| Corporate Bond | 21 | 21 | 22 |
| Banking and PSU | 20 | n/a | 20 |
| Floating Interest Rates | 12 | n/a | 12 |
| Retirement / Children's | 29 / 11 | n/a | 29 / 11 |
| Life Cycle (5, 10, 15, 30 years) | 2, 2, 2, 1 | n/a | 2, 2, 2, 1 |
| Equity index funds | 287 | n/a | 287 ("Other Scheme - Index Funds") |
| Other debt categories (Ultra Short Term, Money Market, Medium Term, Medium to Long, Long Term, Dynamic, Credit Risk, Gilt, 10-year Gilt, Sectoral Debt) | 26, 27, 13, 13, 11, 22, 13, 23, 5, 2 | n/a | 30, 32, 18, 14, 12, 27, 18, 26, 8, 3 (upper bounds: includes matured and merged funds) |

**Result.** Where the app keeps price history (19 categories, all the equity ones, most hybrid, Liquid, Short Term, Corporate Bond), 16 match AMFI exactly and **3 differ by one**: Flexi Cap (app 46, AMFI 47), Balanced Advantage (app 38, AMFI 37), Sectoral and Thematic together (app 255, AMFI 254). Where only the active count exists, the categories that AMFI itself lists as live agree except the debt ones, where the active flag keeps closed funds, as stated. Conservative Hybrid is one above (19 against 18) and cannot be narrowed without price history.

**What the three differences are.** Not traced to a named fund: AMFI's report gives counts, not names, so the one fund in each case cannot be named from it. A one-fund difference in either direction is consistent with a classification the fund house and AMFI's NAV file hold differently, or with a fund counted on one side only. **These do not change any rank or average this release builds** (they are one fund in a pool of 35 to 255) and are recorded, not fixed. To trace one: obtain AMFI's scheme list for 31 Oct (S2 as it stood then) and diff names for those three categories.

**A finding the table shows (for the owner).** AMFI's October report lists **Sectoral Fund (60) and Thematic Fund (194) as two categories**; AMFI's price file the app reads still labels all of them "Equity Scheme - Sectoral/ Thematic", and the app ranks them as one pool of 255. The two counts add up to the app's pool (254 against 255), so the pool holds the same funds, but a sector fund (a banking fund) and a theme fund (for example an electric-vehicle fund) sit in the same ranking. The price file carries no field to split them, so the split would have to come from a list, the names, or a manual map. **Not changed; an owner question (is one pool acceptable, as it is today and as SEBI's 2017 circular defines it, or should it be split).**

## T10-8 and S4: the app's category names against SEBI's categorisation circular
**Label:** S4 = SEBI circular SEBI/HO/IMD/DF3/CIR/P/2017/114 of 6 October 2017, "Categorization and Rationalization of Mutual Fund Schemes". SEBI's own page returned only the title and date to the fetch tool, so the text was read from the copy AMFI hosts (`amfiindia.com/Themes/Theme1/downloads/1507291273374.pdf`, 8 pages, text extracted). Later changes (Flexi Cap added by a later circular; the life-cycle, retirement and sectoral-debt rows that AMFI's report carries) are **not** in this document; they were taken from AMFI's October 2026 report (S3) instead.

SEBI's 2017 list: **Equity (10):** Multi Cap, Large Cap, Large & Mid Cap, Mid Cap, Small Cap, Dividend Yield, Value (a fund house may offer Value or Contra, not both), Focused, Sectoral/Thematic, ELSS. **Debt (16):** Overnight, Liquid, Ultra Short Duration, Low Duration, Money Market, Short Duration, Medium Duration, Medium to Long Duration, Long Duration, Dynamic Bond, Corporate Bond, Credit Risk, Banking and PSU, Gilt, Gilt with 10-year constant duration, Floater. **Hybrid (6):** Conservative, Balanced or Aggressive, Dynamic Asset Allocation or Balanced Advantage, Multi Asset Allocation, Arbitrage, Equity Savings. **Solution oriented (2):** Retirement, Children's. **Other (2):** Index Funds and ETFs, Funds of Funds (overseas and domestic).

| Check | Result |
|---|---|
| Every app category name for a live fund maps to a SEBI or AMFI-report category | **Yes.** The app takes AMFI's own labels ("Equity Scheme - Mid Cap Fund" and so on); each maps one to one. |
| Names that differ in wording only | "Floating Interest Rates Fund" (AMFI) for SEBI's "Floater Fund"; "10-year Constant Maturity Gilt Fund" for "Gilt with 10 year constant duration"; "Ultra Short to Short Term" is AMFI's label for the new in-between row. Same funds; no change needed. |
| In the app and AMFI's report but not in the 2017 circular | Flexi Cap (added later), Life Cycle funds, Sectoral debt: all appear in AMFI's October 2026 report, so they are current categories. |
| Value and Contra | Both appear in AMFI's list (24 and 6 funds); the circular's "either Value or Contra" rule applies per fund house, so the app correctly keeps them as two categories. |
| Old pre-2017 labels still stored | The database still holds funds under "Income" (1,106), "Growth" (70), "Gilt" (2), a bare "ELSS" (21) and "Children's Fund - Childrens' Fund" (1): AMFI's labels from before the 2017 rationalisation, on closed or old funds (not verified fund by fund). The app keeps no price history for these labels, because no pool or ranking uses them, so they cannot enter a ranked pool or average. Not changed; listed so nobody is surprised when they see them in a raw table. |
| The Batch C merged spellings | The merge (C-3) is in the candidate; no category appears twice under two spellings in the table above. |

## S5: a few fund houses' own pages (merger and closure notices, options)
Six funds were tried; **three pages loaded and three did not** (the fund house's site rendered nothing the fetch tool could read: SBI Contra Fund, ICICI Prudential Liquid Fund; Parag Parikh's listing showed the scheme but not its options).

| Fund | What the fund house's page said |
|---|---|
| Motilal Oswal Midcap Fund | Category wording "predominantly investing in mid cap stocks". Plans: Direct and Regular, each as Growth, Payout and Reinvestment. **Matches the app's Growth-only rule** (Payout and Reinvestment are income options and stay out of the pool). No merger or closure notice shown. |
| HDFC Mid Cap Fund | Mid-cap wording; Direct and Regular, Growth and IDCW. Consistent with the rule. No notice shown. |
| Nippon India Small Cap Fund | Small-cap wording; options include Growth, a Bonus option and IDCW. **A Bonus option is not Growth, as the rule treats it.** A 2023 notice limiting new subscriptions; no merger or closure notice. |
| Parag Parikh Flexi Cap Fund | Listed with Direct and Regular prices; options not shown on the listing. No notice shown. |
| SBI Contra Fund, ICICI Prudential Liquid Fund | Page did not render; nothing read. |

**Result.** No merger, closure or name-change notice appeared on any page that loaded, and the option names on the three readable pages agree with how the app decides Growth. **Not covered:** the three pages that did not load. A person with a browser can open those three in a minute; nothing here suggests a problem.

## What RK-5 now says in one paragraph
The app's category list is AMFI's current list, which follows SEBI's circular plus its later additions. Live-fund counts agree with AMFI's October report in 16 of 19 comparable categories and are off by one fund in the other three. Two things go to the owner, neither changing this release: the Sectoral and Thematic funds share one ranking pool although AMFI's report now counts them as two categories; and the three one-fund count differences are not traced to a named fund.
