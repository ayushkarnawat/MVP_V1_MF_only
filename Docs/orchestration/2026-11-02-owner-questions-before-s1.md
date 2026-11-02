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
