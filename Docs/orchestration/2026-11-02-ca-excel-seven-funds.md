# Excel for the chartered accountant: seven funds, five parameters (to build after the deploy)

**Status (2 Nov 2026): NOT SENT, scheduled for after the S.1 staging deploy. The step-by-step runbook is `2026-11-02-ca-excel-runbook.md` (trigger phrase inside).** The owner's decision: one complete Excel, sent once, not in parts; holdings as of the **September 2026** disclosures (no waiting for the October files around 10 Nov). Owed items are also in the deploy ledger (`2026-10-31-staging-deploy-guide-change-requests.md`, section 4.6).

## What he asked for
Funds: Nippon India Large Cap, Motilal Oswal (one of three, see below), Axis Multicap, Bandhan Small Cap, ICICI Prudential Flexi Cap, Parag Parikh Flexi Cap, and the Motilal momentum fund. Parameters: (1) large, mid and small allocation, (2) category average comparison, (3) ranking, (4) P/E and P/B, (5) top 10 stock holdings with %. Purpose: he checks our data for accuracy.

## Why it is not sent now (evidence from the staging data, 2 Nov)
- **Three of the five figures will change when the pending release is deployed.** Staging still runs the old logic: the large/mid/small split is not yet normalised to 100% over classified stocks (Run 1); the category comparison is still size-weighted with a rank (Run 2 moves it to simple averages, no rank); the old composite rank was deleted in migration 0048 and replaced by Performance Ranking (not deployed); P/E and P/B coverage improves with the BSE price-file fix (T2.11) and the filings book-value job (T2.12 Step B, after Run 5).
- **P/E and P/B coverage today** (share of each fund's value that has a stored figure, September holdings): Nippon Large Cap 96.1% / 99.3%; Motilal Active Momentum 73.8% / 84.7%; Motilal Nifty 200 Momentum 30 93.9% / 98.0%; Motilal Nifty 500 Momentum 50 92.0% / 98.1%; Axis Multicap 87.0% / 95.4%; ICICI Flexi Cap 93.9% / 96.8%; Parag Parikh Flexi Cap 73.5% / 73.5% (foreign holdings have no domestic ratio).
- **Bandhan Small Cap has no holdings in the system.** Bandhan is a manual-upload house: all 870 of its scheme batches are "awaiting manual upload". The Bandhan monthly portfolio workbook has not been loaded (the Bandhan files on the VM are factsheet PDFs and a debt-fund test sample).
- **"Motilal momentum fund" matches three funds** and needs his answer.
- Stock P/E and P/B refresh daily (the stock table was last refreshed 1 Nov); holdings change monthly; the AMFI market-cap list in use is effective 1 Jul 2026.

## Before the Excel can be built (owed)
1. **Bandhan September 2026 portfolio workbook.** The owner downloads the 30 Sep 2026 monthly portfolio file(s) that include Bandhan Small Cap from `https://bandhanmutual.com/downloads/portfolio-summary/monthly` (the page's listing is encrypted, so a person must download it; the repo's debt-fund sample is named `bandhan-debt-funds_asof_2026-09-30.xlsx`, so the equity one is the same style), saves it in one folder and tells the orchestrator the path. The orchestrator then (a) parses it locally without touching staging, (b) on the owner's go, imports it on the VM (an allowed hand import of an owner-supplied file): `scripts/jobs/import_manual_portfolio_disclosures.py --amc "Bandhan Mutual Fund" --file <file> --as-of 2026-09-30`, and (c) checks that Bandhan Small Cap shows its holdings and a top 10. Doing it before the deploy is fine and recommended; it does not depend on the release.
2. **Which Motilal momentum fund** (the CA's answer): Active Momentum Fund, Nifty 200 Momentum 30 Index Fund, or Nifty 500 Momentum 50 Index Fund.
3. The S.1 deploy done, the forced analytics recompute finished, T2.11 live and T2.12 Step B built and run once (so P/E and P/B coverage is final).

## Workbook specification (build after the deploy, from the system's own stored results)
One `.xlsx`, one file, sheets in this order:
- **Read me**: purpose; the date of every kind of figure (below); the meaning and formula of every column; coverage notes; limitations; who to contact; export date and the deployed commit.
- **Summary**: one row per fund with all five parameters.
- **Allocation**: large, mid, small and the unclassified share, with the stated rule (percentages over classified stocks, plus the unclassified share shown separately); the AMFI list date.
- **Category comparison**: fund return versus the category simple average for 1, 3 and 5 years (a 3-year floor, as the screen applies), the category, the number of funds in the average, and the plan type.
- **Ranking**: Performance Ranking as the screen shows it (ties 1,2,2,4; index funds are not ranked, they carry the disclaimer); the period and the number of funds ranked.
- **P/E and P/B**: the fund-level figure, the method (weighted harmonic mean of the stocks' ratios, weighted by each stock's share of equity), the coverage % of equity behind it, and what is excluded.
- **Top 10**: stock name, sector, ISIN, % of the fund (as disclosed), and the total of the top 10; the full holdings sheet per fund is optional and cheap to add.
- **Checks**: weights sum to the disclosed equity %, top-10 total, coverage figures, and the as-of dates, so he can see at a glance what was checked.

**What "September data" means (state this plainly in the Read me and the message):**
- Holdings, top 10 and the market-cap split: the fund houses' disclosures **as of 30 Sep 2026**, with the AMFI market-cap list effective 1 Jul 2026. He can compare these one-to-one with the fund houses' own September disclosures.
- P/E and P/B: each stock's ratio **as of the export date** (the system stores only the latest, refreshed daily) applied to the September holdings. They will not equal a fund-house factsheet's 30 Sep P/E and P/B, and he should be told so in advance. None of these seven funds has a factsheet-reported P/E and P/B in our readers (those exist for Invesco, ITI, Kotak and Aditya Birla Sun Life only).
- Returns behind the category comparison and ranking: windows ending on the **export date's** latest NAV, not 30 Sep.
- If an exact 30 Sep P/E and P/B comparison is required, that needs historical ratios that the system does not keep; say so rather than imply it.

## Message to send him now (plain words; replace the bracketed parts)
> Hi [Name],
>
> Thank you for offering to check our data. I'd like to send you the Excel **once, complete**, not in pieces, so you are always looking at the final numbers. It will cover the seven funds you listed, with the five things you asked for: the large, mid and small split, the comparison with the category average, the ranking, P/E and P/B, and the top 10 holdings with percentages.
>
> **Why I am not sending it today.** We are finishing an update to how four of these figures are calculated: the large/mid/small split, the category comparison, the ranking, and P/E and P/B. If I sent the Excel now, it would show the older method, and several numbers would change within days. You would be checking figures that our users will not actually see, and your time would be wasted. I would rather send you one file that matches what the product will show.
>
> Two small things we are finishing at the same time: one fund house (Bandhan) needs its monthly holdings file loaded by hand, and I need one answer from you, below.
>
> **What you will receive:** a single Excel with a first page that explains every column: where each number comes from, which date it is for, and how it is calculated. The fund holdings, top 10 and large/mid/small split will be based on the fund houses' own **30 September 2026** disclosures, so you can compare them directly with what the fund houses published for September. P/E, P/B and the return-based comparisons are calculated on the latest market prices at the time of export, so I will mark those clearly and they will not match a 30 September factsheet exactly.
>
> **When:** [date]. I will confirm the exact day as soon as the update is live; if it moves, I will tell you straight away.
>
> **One question:** by "Motilal momentum fund", do you mean the Motilal Oswal Active Momentum Fund, the Nifty 200 Momentum 30 Index Fund, or the Nifty 500 Momentum 50 Index Fund?
>
> Thank you,
> [Name]

## Why the CEO can be confident
- Holdings, top 10 and the market-cap split come straight from each fund house's own September disclosure, are checked for completeness (weights add up, coverage shown) and can be compared line by line with the published files.
- The Excel is produced from the system's own stored results after the update is live, so it matches what users see, and each figure's date and method is written on the first page.
- Where a figure cannot be "as of 30 September" (P/E, P/B, returns), the file says so plainly, so nothing is overstated.
- The file is built only after the checks pass (the deploy checks, the recompute, the coverage check), and the numbers are hand-spot-checked against the disclosures before it is sent.
