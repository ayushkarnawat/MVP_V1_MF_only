# Rank "out of N": verification protocol and sources (Batch A2, task RK-2)

Written 18 Nov 2026. Spec: `Docs/orchestration/2026-11-17-batch-a2-rank-denominators-planning-workbook.html` (sections 3 to 5). This is a working note, not a stakeholder page. Official public data only (AMFI, SEBI, fund houses' own pages); no outside ranking or rating site is used, read, scraped or quoted.

## The question
For a held fund the app says "rank R of N" within its category and plan. Is N the number of funds that really belong in that comparison, and is R counted on the same funds and the same end date?

## Rule for real-data statements
A sentence of the form "this number is right or wrong" about real data is made only from runs **after the first clean unattended NAV run on 17 Nov 2026**, and every such result is labelled with the time of the run and how many funds had that day's price. Earlier real-data runs are the labelled baseline only. Synthetic runs (the RK-3 recount against an invented AMFI sample) carry no such rule.

## Sources S1 to S6 (confirmed on 18 Nov 2026 unless marked)

| ID | Source | Where | What we take | Status |
|---|---|---|---|---|
| S1 | AMFI daily price file (the app reads the same file) | `https://portal.amfiindia.com/spages/NAVAll.txt` (also `NAVOpen.txt`, `NAVClose.txt`, `NAVInterval.txt`) | every scheme, code, name, latest price and the price's own date | **Confirmed** on the AMFI NAV page (18 Nov). Download columns not opened; the app's parser documents them. |
| S2 | AMFI scheme data | `https://portal.amfiindia.com/DownloadSchemeData_Po.aspx?mf=0` | columns: AMC, Code, Scheme Name, Scheme Type, Scheme Category, Scheme NAV Name, Scheme Minimum Amount, Launch Date, Closure Date, ISIN Div Payout/ISIN Growth, ISIN Div Reinvestment | **Confirmed**: a comma-separated file of about 4 million characters; header read on 18 Nov. **Caution:** the first rows show a Closure Date equal to the Launch Date for live schemes (24 Feb 1995 for both), so a closure date is **not** read as "closed" without a second sign (a blank or a later date, and a missing price); treat as a data quirk to confirm in T10-2. Only the first 100,000 characters were read. |
| S3 | AMFI monthly scheme and folio counts | `https://portal.amfiindia.com/spages/am<mon><year>repo.pdf` (for example `amjul2026repo.pdf` for 31 July 2026) | number of schemes per category at a month-end | **Confirmed** that the series exists for Feb 2025 to Jul 2026 (search results); the per-category table was **not** read in full. No file for Aug to Oct 2026 was retrieved: the 31 Oct 2026 file may or may not be published yet (check by its URL pattern in RK-5). The AMFI "Monthly Note" PDFs are fund flows, **not** scheme counts. |
| S4 | SEBI categorisation circulars (the October 2017 categorisation and rationalisation circular and later updates) | sebi.gov.in | what each category means and which schemes may sit in it | **Not opened.** A person reads it in RK-5 and records only the category names and definitions. |
| S5 | Fund houses' own scheme lists, factsheets and notices | each fund house's site | which options a scheme has; merger and closure notices | **Not opened.** A manual sample of a few funds per held category in RK-5. |
| S6 | A second price source | the stored price history of the price service the app already uses | dated prices for the same schemes | Used in RK-4 (returns for 5 funds per category, 2 decimals). |

Sources that cannot be downloaded automatically are read by a person who records only what the table lists. Anything I could not open is stated as **not done**; none is guessed.

## Tests, in order, and who runs them
| ID | What | Who | When |
|---|---|---|---|
| T10-1 | The pool rebuilt independently from S1, step by step (RK-3's script), equal to the app's pool at every step; every difference named | Codex builds (RK-3); Claude runs on real data in RK-4 | synthetic now, real after 17 Nov clean run |
| T10-2 | S2 category, plan and option against what the app reads from each scheme name | Claude | after RK-3 |
| T10-3 | Returns for 5 funds per category recomputed from S6, 2 decimals | Codex (RK-4) | after clean run |
| T10-4 | End dates of every pool fund; the rank on mixed dates against one common date | Codex (RK-4) | after clean run |
| T10-5 | Stored rank (06:30) against a fresh evening computation | Codex (RK-4) | after clean run |
| T10-6 | Growth only: zero IDCW or dividend series in any pool; the number set aside is in the ledger | Codex (RK-3 synthetic, RK-4 real); one result also serves CA-3's T9-7 | |
| T10-7 | Our count of live schemes per category at a month-end against S3's count | Claude | after RK-3 |
| T10-8 | App category names against SEBI's categorisation (S4), including the merged spellings from Batch C | Claude | after RK-2 (the merge is built: C-3) |

## Every difference goes in exactly one of R1 to R12
R1 whole category vs funds with a return in the period; R2 Direct and Regular together or apart; R3 index funds, ETFs and funds of funds; R4 category definition (SEBI's, or merged); R5 different as-of dates for prices and returns; R6 a peer whose price history failed to load (our bug); R7 one fund counted twice or two merged by base-name parsing (our bug); R8 the 30-day "live" rule drops a late publisher; R9 tie handling; R10 a public source stale or counting by scheme not by option, for a month-end not today; R11 returns ending on different dates (our bug); R12 IDCW or dividend counted (decided: Growth only). A "definition" difference is not a bug; it goes to the owner as keep, change or show both (FX-10b). A "our bug" difference becomes a fix proposal (FX-10a, FX-10c, FX-10d).

## Ledger reasons (RK-3's script, fixed list)
`not_live`, `idcw`, `other_plan_type`, `second_option_of_fund`, `index_or_etf`, `no_history_for_period`, `closed_or_merged`; plus two flags that are not reasons: `mixed_end_dates` and `mis_named`.

## Not done yet
No real-data run, no cross-check against S2, S3, S4, S5; those need RK-3 and the first clean-run labelling above. A "which AMFI file carries category by month" question is answered (S3 is the file); whether S3's per-category table maps one-to-one onto the app's categories is T10-7's job.
