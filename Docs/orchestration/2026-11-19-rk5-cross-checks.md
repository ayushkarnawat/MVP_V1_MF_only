# RK-5: cross-checks against AMFI and SEBI references (19 Nov 2026), part 1

Follows `2026-11-18-rank-verification-protocol.md`. Official public data only. Run from the staging VM, in memory, nothing written. **Done: T10-2 (this file); T10-7, T10-8, S4 and S5 are done in `2026-11-20-rk5-cross-checks-part-2.md`.**

## T10-2: the app's category and plan against AMFI's own scheme data (S2)
**Label:** 19 Nov 2026, about 18:30 IST. S2 = `DownloadSchemeData_Po.aspx?mf=0` (16,528 schemes, columns AMC, Code, Scheme Name, Scheme Type, Scheme Category, Scheme NAV Name, launch and closure dates). The app's side = the NAVAll file the app reads (14,478 schemes, all of them also in S2). Compared for the **9,082** schemes that have a price dated 2026 (the live ones).

| Check | Result |
|---|---|
| **Category:** the app's category against S2's "Scheme Category" | **Equal for 9,045 of 9,082 (99.6%).** The other 37 are one spelling: AMFI's NAVAll writes "Children's Fund", S2 writes "Children s Fund" (the same category; 29 in Solution Oriented, 8 in a second heading). No real category disagreement. |
| **Plan:** S2's "Scheme NAV Name" states exactly one plan (Direct or Regular) for 7,686 schemes | The app agrees for **7,405 (96.3%)**. |
| of the 281 that differ | **279 are schemes the app leaves with an unknown plan** (152 that S2 says are Direct and 127 Regular; the examples are segregated portfolios such as a credit-risk fund's 2020 segregated series). **Two are AMFI's own mis-named schemes** (a HSBC Liquid scheme named "Regular Plan - Direct", a Kotak Liquid scheme named "Direct Plan - Weekly..." that S2 reads the other way). |
| Plan not stated in S2's NAV name | 908 schemes the app counts as **Regular** (a name without "Direct" is treated as Regular, the AMFI convention), 112 as Direct, 376 as unknown. |

**What it means for the rank.** The unknown-plan schemes are exactly the ones the approved fix FX-10a now keeps out of a Direct or Regular pool (a segregated portfolio is not a fund to rank), so they cannot distort "out of N". The 908 unlabelled-as-Regular schemes are an assumption the app makes (older funds named without a plan word); it is the AMFI convention and is stated in the Read me of the rank workbook. The two mis-named schemes are AMFI's naming errors; they would be in the wrong plan in either source.

## Not done (stated, not guessed)
- **T10-7** (our live-scheme count per category at a month-end against AMFI's monthly report S3, a PDF): not run. The per-category table has to be read from the PDF and mapped to the app's categories.
- **T10-8 and S4** (the app's category names and definitions against SEBI's categorisation circular): not run; a person has to read the circular.
- **S5** (a few funds per held category against their fund houses' own pages: merger and closure notices): not run.
- **T10-3** (returns for 5 funds per category from the stored price history) and **T10-5** (the stored 06:30 rank against a fresh evening computation): not run. Both need the staging database; they come with the real-data verification of the two workbooks.
