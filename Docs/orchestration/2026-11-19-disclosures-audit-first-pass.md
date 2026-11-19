# Portfolio disclosures audit, first pass (Batch L, L-3 and L-4)

**Taken 19 Nov 2026, day 19 of the month, after the M1 deploy**, with the read-only script `backend/scripts/audit_disclosures/run_audit.py` (queries E1 to E5) against the staging database, target month end **31 Oct 2026** (the November round), prior month 30 Sep. Nothing was written. Raw output (29,175 lines, fund-house and fund names only) is kept outside the repository. This is a **first pass**: the job still runs through day 20 and the by-hand files are not imported yet, so the final pass comes after day 20 and after the imports (L-8). Every number below comes from the query output; nothing is estimated.

## The three measures (in the plan's order)
| | Written for 31 Oct | Of | Share |
|---|---|---|---|
| **1. Funds (the headline)**: live scheme series at the 50 fund houses that are expected to publish | 6,351 | 14,403 | **44.1%** |
| of which automatic houses | 6,351 | 12,706 | 50.0% |
| of which by-hand houses (Edelweiss, Mahindra Manulife, Invesco, ITI, JM Financial, HSBC, Bandhan) | 0 | 1,697 | 0.0% |
| ceiling if every by-hand file were imported today | 8,048 | 14,403 | 55.9% |
| **2. Money** (average assets, newest AMFI period on or before 31 Oct for every fund: **no fund has a same-month figure**) | covered 81.7% of the assets that have a figure | 8,522 of 14,403 funds have one | 81.7% |
| **3. Fund houses** with at least one written batch | 35 | 50 (the five publish-nothing houses are not in the data) | 70% |

How to read measure 1 (this matters): the 14,403 rows are every live **series** (each plan and each Growth or IDCW option is its own row). Split by kind: the ordinary plan and option series (Direct or Regular, Growth or IDCW) are covered at **65.6% to 67.5%** each, while the **5,573 rows with no plan or option word in the name** (exchange-traded funds, fixed-maturity plans, FOFs and similar) are covered at **9.1%**; they are what drags the headline down. Grouped into funds (house plus base name, 3,433 funds) **45.2%** have at least one written series. Whether the job is meant to cover ETFs and fixed-maturity plans at all is a **question for the owner** (below), not something this audit can decide.

Money: 5,881 funds have no assets figure at all and every figure that exists is from an older period (AMFI's assets table is quarterly), so the 81.7% is "of the money we can see", an approximation as the plan said it would be. The by-hand houses hold 9.0% of that money.

Written, failed and waiting for a person, for the target month: **6,355 written, 85 failed, 1,692 awaiting a manual upload** (all seven by-hand houses), and 6,275 live series with **no batch row at all**. Freshness from the date inside the file: 6,351 fresh, 1,145 stale (newest written batch is an older month), 6,907 none.

## What is wrong, in order of size
1. **Eight automatic fund houses worked last month and have nothing for October** (no batch, not even a failed one, so the job did not find or read a file; layout change, wrong page or "not published yet" are all possible and are exactly what L-5 must check by hand): Franklin Templeton (171 written last month, 0 now, of 321 live), WhiteOak (70), Bajaj Finserv (108), Trust (45), Samco (26), Zerodha (20; and a separate "Zerodha CASE" house with 25 live funds and nothing in either month), Angel One (14), AlphaGrep (12). Together about 466 funds that were covered in September.
2. **ICICI Prudential: 59 failed target-month batches** of its 2,512 live series (written 551, last month 569), and no structured reason is stored for any failed batch (all 172 failed rows in the two months show an empty reason, which is what a failed 90 to 101 percent weight check looks like). Other houses with failures: Groww 12, Tata 6, DSP 4, quant 4.
3. **The seven by-hand houses: 1,692 funds waiting for the files** (Bandhan 435, Edelweiss 312, HSBC 282, Invesco 249, JM Financial 178, Mahindra Manulife 122, ITI 114). Edelweiss had 281 written last month and JM Financial 16; the other five had nothing then either.
4. **Large falls among houses that still work**: LIC 75 now against 145, Motilal Oswal 161 against 191, Canara Robeco 82 against 112 (cause unknown; L-5).
5. **Partly covered**: ICICI 551 of 2,512, UTI 373 of 1,379, Nippon India 610 of 1,870, Sundaram 96 of 277, Kotak 394 of 951, HDFC 355 of 579; a large part of that is the ETF and fixed-maturity series in point "How to read measure 1".

## Not measured, and what this pass cannot say
- **Causes.** The job log for 1 to 18 Nov is not available to this audit (the daily job's output has no log file; the alert mail may hold the day-10 note). Causes above are inferred only from October against September and still need L-5 (open each house's page once by hand).
- **Whether a missing batch is a problem** for ETFs, fixed-maturity plans and closed or maturing funds: unknown.
- Money uses an older assets period for every fund (stated above).

## Decisions for the owner
1. **Should ETFs, fixed-maturity plans and funds of funds count in the coverage figure** (and does the job need to read them), or should the headline be about open-ended plan and option series only (about 66%)? My suggestion: report both, lead with the open-ended figure, and list the others separately.
2. **Which of the eight regressed houses matter first?** My suggestion: Franklin Templeton (171 funds), Bajaj Finserv (108), WhiteOak (70), Trust (45), then the small ones.
3. **The seven by-hand imports** (L-8) are the owner's own action with the commands in `portfolio-disclosure-manual-import-guide.md`; after them a re-run of E1 and E4 refreshes this table (final pass after day 20).

## Next
L-5 (open the eight regressed houses' pages and ICICI's failing files by hand, record what changed; blocked sites need the owner's browser), L-6 (the forwardable report), L-7 (fix proposals through the Batch A review gate: keep failure reasons in the database is the obvious first one). Re-run `run_audit.py` after day 20 and after the imports.
