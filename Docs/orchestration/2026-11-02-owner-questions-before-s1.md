# Questions for the owner before the staging deploy (S.1)

One sheet, plain words. Answer by writing the number and your choice, for example "Q3: A, Q4: B". **If you say "all recommended", every question below takes the option marked Recommended.** Nothing here blocks the build; it only blocks S.1, so answers are needed before the deploy, not now.

## Things I will do myself (no answer needed)
- **O6, the 18-fund list.** I run the read-only query on the VM before the deploy: for each hybrid or index fund, how much of it is in Indian shares and whether it is counted in the overlap. I show you the result table; you only confirm.
- **O7, the fund-manager readings.** I pull the real list of manager role words from the VM (for example "Associate", "Co-Fund Manager", "Equity portion") and write down how each one is read (who counts as the main manager). You only confirm or correct my reading.
- **Printed returns for the benchmark check.** The factsheets are already on this machine (`D:\Factsheets October`, `D:\factsheets`). I pick about six funds that track different indices, read their printed 1, 3 and 5 year returns myself, and compare them with what the system computes. You do not need to supply anything. If you want a specific fund checked, tell me its name.

## Questions I do need you to answer

### Q1 (O8). Should Real Estate show as its own slice on Home?
Real Estate here means REITs and InvITs held through funds ("Real Estate (REITs and InvITs)"). The asset-class chart now has five slices: Equity, Debt, Gold, Real Estate, Others.
- **A (Recommended): show it live.** It is real money in the portfolio, and hiding it makes the slices not add up to the real total.
- B: fold it into Others for now and add the slice later.

### Q2 (O11-a). The "enough data" rule for the portfolio's overall P/E and P/B.
The overall P/E and P/B of a portfolio is only shown when we have the ratio for at least **70%** of the portfolio's shares (by value). Below that, we show a dash instead of a number that would be misleading.
- **A (Recommended): 70%.**
- B: a lower bar such as 50%. You see a number more often, but it can be wrong because half the portfolio is missing from it.
- C: a higher bar such as 90%. Safer, but many portfolios show a dash.

### Q3 (O11-b). How the system decides a fund is an "index fund" for the ranking note.
Today: a fund counts as an index fund if its name contains the word "index" or "ETF". These funds get a note that they are not ranked against active funds the same way.
- **A (Recommended): keep the words rule.** It is simple and right for almost every fund. A fund with a misleading name can be fixed by hand later.
- B: use the fund's official category from the regulator list instead (more exact, but some categories are missing for new funds).

### Q4 (O11-c). Price/earnings for stocks listed only on BSE.
For stocks with no NSE listing (96 of the shares we hold) we compute the ratio as BSE closing price divided by earnings (or book value) from Yahoo, and if that is not available we use the data provider's ratio, then screener.in. A ratio is never stored when the price, earnings or book value is zero or negative.
- **A (Recommended): keep this order.**
- B: show a dash for BSE-only stocks until an official source exists (cleaner, but 96 stocks would show no ratio).

### Q5 (O11-d). Averages on the fund page versus the category comparison.
The fund page weights its numbers by how big each holding is. The Category Average comparison uses a simple average (every fund counts equally).
- **A (Recommended): leave it as built.** Each is the usual way for its screen.
- B: make both weighted, or both simple (more consistent, but a change in the build).

### Q6 (O11-e). Benchmark indices: 23 registered instead of about 40.
We register 23 indices that we could verify from a public source. Some funds track an index we do not have; for those the screen says "As printed in the fund house's factsheet" (the fund's own figure) or "Closest index we hold" rather than showing a wrong index.
- **A (Recommended): ship with 23**, add more later one row at a time as sources are verified.
- B: hold the deploy until more are verified (slower).

### Q7 (O11-f). Plain-word labels for where a benchmark number comes from.
We replaced the plan's two labels with four plain-word ones: "From the fund's factsheet" (the index named in the fund's own factsheet), "Closest index we hold" (the factsheet's index is not one we have, so the nearest one), "Chosen by the fund's category" (no index named, so the category's standard one), and "No benchmark". A fund we cannot build a benchmark for but whose factsheet prints the returns shows "As printed in the fund house's factsheet".
- **A (Recommended): keep these plain words.**
- B: go back to the plan's two labels.

### Q8 (O11-g). Benchmark notes.
Extra notes about each benchmark are kept in the backend only and not shown on screen.
- **A (Recommended): backend only for now.** Less clutter; they can be shown later.
- B: show them as a small note under the benchmark name.

### Q9 (O9). Real UTI and Groww factsheets.
Their benchmark and P/E readers are unfinished because I have not seen the real files. Until then these funds show "As printed in the fund house's factsheet" or "No benchmark", never a wrong one.
- **A (Recommended): ship without them**, send the two PDFs whenever you can (drop them in `D:\Factsheets October`).
- B: wait for the files before the deploy.

### Q10 (gold and silver funds, from the Run 3 review). 
Funds that hold gold or silver show only their printed returns, not a computed comparison, because the computed check is not wired in yet. You accepted this earlier (O2).
- **A (Recommended): confirm it stays that way for this release.**
- B: wire the check now (about a day more).

## Files you asked about
- **Bandhan Mutual Fund monthly portfolio file, 30 September 2026:** https://bandhanmutual.com/downloads/portfolio-summary/monthly . A person has to download it (the page's list is protected). Download the equity portfolio file that includes **Bandhan Small Cap Fund** (if unsure, download every September 2026 file for Bandhan). Save it in a folder such as `D:\Bandhan Sept 2026` and tell me the path. I do the hand import and check, as written in `2026-11-02-ca-excel-runbook.md`.
- **The CA's answer on Motilal Oswal and Direct versus Regular:** noted. We use all the Motilal momentum funds as examples and both Direct and Regular plans, as data checks. I will list both plans for every fund in the Excel and mark the Read me sheet accordingly.

## Triggers I have set
- Reminder on **9 Nov 09:00 IST**: the fund-managers-monthly job runs tomorrow 06:00 IST; which houses need their factsheet downloaded and hand-imported first.
- Read-only check on **10 Nov 07:00 IST**: did the 06:00 run work, which houses were skipped. These run while this app is open; if it is closed they run when it next opens.

---

## Owner's answers (2 Nov 2026) and what each one adds to the build
| Q | Answer | What it becomes |
|---|---|---|
| Q1 | A: Real Estate shows live | nothing to build (already built); QA row Q1 |
| Q2 | Show the portfolio P/E and P/B from **60% coverage** (not 70%); **below that, never a bare dash: show a reason** ("Not enough data: ratios are available for X% of this portfolio's shares") | **Build W1**: lower the rule to 60% (one constant) and replace the dash with a plain reason sentence and the coverage percentage, on every screen that shows the portfolio P/E and P/B (payload carries the reason; screens render it); tests |
| Q3 | A with a fallback: the words rule ("index", "ETF") **plus** the regulator category as a second test | **Build W2**: a fund is an index fund if its name has the words OR its stored category is an index or ETF category; tests for both paths and for a fund that matches neither |
| Q4 | A: keep the order (BSE close / Yahoo, provider ratio, screener.in); more layers welcome if research finds an accurate one | **Research R1** (no build unless a source is verified): see the notes below |
| Q5 | B: make both weighted | **Build W3**: Category Average becomes fund-size weighted (the weighted helper `_aum_weighted_average` already exists in `category_ranking.py`; the simple helper `_simple_average` is what changes). Backend only plus one plain sentence on the screen ("weighted by fund size") and tests; funds with no size on record are left out of the weighted figure and counted in a note. **Size: about half a day.** |
| Q6 | A with work: list the 23 indices and their sources; try again for the missing ones; explain on screen | **List R2** below; **Research R3** (re-run `verify_benchmark_sources.sh` on the candidates; each verified one is one registry row, no migration); **Build W4**: a plain "how this benchmark was chosen" explanation on every screen that shows a benchmark |
| Q7 | A, and **make "No benchmark" the very last fallback** | **Build W5**: the selection order becomes factsheet index, then closest index we hold, then the category's standard index, and only then "No benchmark"; check every held fund on the VM before the deploy for how many still end on "No benchmark" |
| Q8 | B with less clutter: a small "i" icon beside the benchmark name; the note shows on hover and on keyboard focus or tap | **Build W6**: an accessible info icon that shows the backend note (hover, focus and tap) |
| Q9 | Add UTI and Groww factsheets before the deploy | Links below; then **Build W7**: the UTI and Groww benchmark and P/E readers from the real files |
| Q10 | A | nothing to build |

### R2. The 23 registered benchmark indices (all from the NSE Indices total-return endpoint unless noted)
Nifty 50, Nifty 500, Nifty LargeMidcap 250, Nifty Midcap 150, Nifty Next 50, Nifty Smallcap 250, Nifty 100, Nifty 200, Nifty Bank, Nifty IT, Nifty Financial Services, Nifty India Consumption, Nifty India Manufacturing, Nifty Energy, Nifty Total Market, Nifty Private Bank, Nifty Infrastructure, Nifty Midcap 100, Nifty Smallcap 100, Nifty Smallcap 50, Nifty500 Multicap 50:25:25 (all total-return series from the endpoint); **Nifty 50 Arbitrage** (a verified NSE price endpoint, total-return type); **Nifty 1D Rate Index** (registered but inactive). Not found so far (candidates in `verify_benchmark_sources.sh`): Quality 30, Value 50, ESG, Healthcare, factor indices, G-Sec and SDL indices.

### R1. Extra layers for BSE-only stock ratios (to research, not build yet)
(1) BSE's own results filings in XBRL, the BSE twin of the NSE Integrated Filing source built in T2.12 (book value and EPS for BSE-only companies straight from the exchange); (2) the company's own filed results for trailing EPS. Both would replace the Yahoo step with an official source. Decision after a one-stock probe from the VM.

### Where the files are
- **Groww:** the monthly factsheet page is https://www.growwmf.in/downloads/fact-sheet ; the September 2026 file the system already fetched on 30 Oct is https://assets-netstorage.growwmf.in/compliance_docs/Downloads/Fact%20Sheet/2026%20-%202027/Monthly%20Factsheet%20Sept%202026.pdf
- **UTI:** the factsheet is called "Fund Watch". Download both "Fund Watch (Active)" and "Fund Watch (Passive)" for September 2026 from https://www.utimf.com/downloads/fund-watch (the list loads from a protected API, so it must be a person in a browser). Save into `D:\Factsheets October`.
- **Bandhan:** the file in `D:\Bandhan` on 2 Nov is **the wrong file**: it is the DEBT funds portfolio as on **30 Oct 2026**. I need the EQUITY portfolio that contains Bandhan Small Cap Fund, as on **30 Sep 2026** (the same date as the other houses), from https://bandhanmutual.com/downloads/portfolio-summary/monthly (the month list should have September 2026 below October).
