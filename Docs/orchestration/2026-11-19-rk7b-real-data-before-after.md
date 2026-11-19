# RK-7 (FX-10a, FX-10d, FX-10b, FX-9a) on staging data: category averages before and after (19 Nov 2026)

**Label:** run 19 Nov 2026 about 15:50 IST on the staging database; AMFI newest price date 18 Nov; 46 of 46 held funds priced. Read-only (a transaction that is always rolled back). **Before** = the code deployed on staging (M1). **After** = the four approved fixes (`batch/a-fixes` 851bea0b plus 572e71ad) mounted into a throwaway container; nothing is deployed. Public category data only. All figures are percent per year.

How to read it: the category average is the size-weighted average of the funds in the ranked pool. "Older blended figure" is the legacy number kept for print and phone views: before = a per-fund 40/60 blend, after = 40% of the 3Y average plus 60% of the 5Y average (the workbook's formula).

| Category (plan) | 1Y avg: before to after | 3Y avg | 5Y avg | Older blended figure | Funds in 3Y average |
|---|---|---|---|---|---|
| Debt Scheme - Corporate Bond Fund (Direct) | 4.19 to 4.19 | 7.05 to 7.06 | 6.39 to 6.39 | 6.68 to 6.66 | 21 to 21 |
| Debt Scheme - Liquid Fund (Direct) | 1.62 to 2.13 | 3.97 to 4.28 | 4.38 to 4.60 | 4.26 to 4.47 | 36 to 33 |
| Equity Scheme - ELSS (Direct) | 2.35 to 2.37 | 13.16 to 13.15 | 11.52 to 11.52 | 12.19 to 12.18 | 38 to 36 |
| Equity Scheme - Flexi Cap Fund (Direct) | 1.83 to 1.83 | 13.93 to 13.93 | 12.63 to 12.63 | 13.29 to 13.15 | 37 to 37 |
| Equity Scheme - Focused Fund (Direct) | 5.91 to 5.91 | 15.44 to 15.44 | 12.77 to 12.77 | 13.84 to 13.84 | 27 to 27 |
| Equity Scheme - Large & Mid Cap Fund (Direct) | 2.29 to 2.29 | 14.65 to 14.65 | 13.37 to 13.37 | 13.88 to 13.88 | 26 to 26 |
| Equity Scheme - Large Cap Fund (Direct) | 0.01 to 0.01 | 11.79 to 11.79 | 10.58 to 10.58 | 11.08 to 11.06 | 30 to 30 |
| Equity Scheme - Large Cap Fund (Regular) | -0.93 to -0.93 | 10.74 to 10.74 | 9.55 to 9.55 | 10.06 to 10.03 | 30 to 30 |
| Equity Scheme - Mid Cap Fund (Direct) | 3.51 to 3.72 | 15.63 to 15.49 | 15.75 to 15.46 | 15.83 to 15.47 | 29 to 28 |
| Equity Scheme - Mid Cap Fund (Regular) | 1.94 to 2.03 | 14.21 to 14.17 | 14.10 to 14.07 | 14.31 to 14.11 | 29 to 28 |
| Equity Scheme - Multi Cap Fund (Direct) | 2.67 to 2.67 | 13.79 to 13.79 | 14.88 to 14.88 | 14.28 to 14.45 | 23 to 23 |
| Equity Scheme - Multi Cap Fund (Regular) | 1.38 to 1.38 | 12.80 to 12.80 | 13.80 to 13.80 | 13.06 to 13.40 | 23 to 23 |
| Equity Scheme - Sectoral/ Thematic (Direct) | 1.48 to 0.27 | 14.28 to 13.80 | 13.40 to 13.08 | 14.23 to 13.37 | 142 to 142 |
| Equity Scheme - Small Cap Fund (Direct) | 6.87 to 6.67 | 13.56 to 13.60 | 15.74 to 15.74 | 14.81 to 14.89 | 26 to 25 |
| Equity Scheme - Small Cap Fund (Regular) | 5.24 to 5.10 | 11.73 to 11.72 | 13.92 to 13.92 | 13.03 to 13.04 | 26 to 25 |
| Hybrid Scheme - Arbitrage Fund (Direct) | 6.62 to 6.62 | 7.37 to 7.37 | 6.91 to 6.91 | 7.10 to 7.09 | 27 to 26 |
| Hybrid Scheme - Multi Asset Allocation (Direct) | 3.80 to 3.80 | 14.71 to 14.71 | 14.55 to 14.55 | 14.57 to 14.61 | 15 to 15 |
| Other Scheme - Index Funds (Direct) | 1.06 to 1.12 | 10.39 to 10.31 | 9.10 to 9.11 | 9.64 to 9.59 | 137 to 130 |
| Solution Oriented Scheme - Children's Fund (Direct) | 4.02 to 4.02 | 14.48 to 14.48 | 13.46 to 13.46 | 13.87 to 13.87 | 9 to 9 |

## What it shows
- **Where the pool is now exactly the ranked pool:** for the 3Y and 5Y averages the funds counted equal the ranked pool's funds in every group except Index Funds (an index category has no rank pool by design). The 1Y average still differs from the 1Y rank pool in every group **by design**: the average has a three-year floor (a fund with no 3Y return is in no period), the 1Y rank pool does not.
- **How big the moves are:** most averages move by 0.0 to 0.5 of a point. The largest: Sectoral/Thematic 1Y 1.48 to 0.27 (index and ETF series that sat in the average are out), Liquid 3Y 3.97 to 4.28 and 1Y 1.62 to 2.13 (two IDCW series out, two Growth series in), Mid Cap 3Y about -0.14 (the Nippon Bonus option replaced by its Growth option). Fund counts in the 3Y average fall in eight groups (by 1 to 3 in seven, and by 7 in Index Funds).
- **The older blended figure** is a different formula and moves more than the period averages: most groups by under 0.4 of a point (for example Flexi Cap 13.29 to 13.15, Multi Cap Regular 13.06 to 13.40), the largest Sectoral/Thematic 14.23 to 13.37.
- This list is an input to the M2 deploy guide's "numbers that change, with before and after".
