# Factsheet state, P/E and P/B coverage, and benchmark gaps (Step 0, 30 Oct 2026)

Source: the two VM result bundles of 30 Oct (`results.tgz`, `results2.tgz`), the 12 Oct per-house scan (`per_amc_detail.csv`), the resolver registry (`fund_manager_resolvers.py`) and the stored index list (`BenchmarkIndex`, 8 members). Nothing here was run on staging beyond what the 30 Oct sessions already did.

**Naming convention used below.** A factsheet "labelled month M" carries data as of the end of month M-1 for most houses (DSP's "September" file is "as on 31 Aug"). So the newest possible file on 30 Oct is the one labelled **October** (data as of 30 Sep). This is inferred from the 12 Oct scan, not confirmed for every house.

## 1. Which houses have the October file

### 1a. Automatic fetch (40 houses), run of 30 Oct

| Group | Houses | Count |
|---|---|---|
| **October file fetched** (newest possible) | Aditya Birla Sun Life, Edelweiss, Mirae Asset, Nippon India, UTI, quant | 6 |
| **September file fetched** (one cycle behind: October file not yet on the site, or not yet picked up) | 360 ONE, Abakkus, ASK, Bank of India, Baroda BNP Paribas, Canara Robeco, Capitalmind, Choice, DSP, Groww, HSBC, Helios, LIC, Motilal Oswal, NJ, Navi, Old Bridge, PGIM, PPFAS, Samco, Shriram, Tata, Taurus, Unifi, Union, Wealth Company, Zerodha | 27 |
| **File name carries no month** (month not readable from the link; the job's own freshness check accepted it) | Franklin Templeton, Jio BlackRock, Quantum | 3 |
| **Not accepted** | Angel One (403 from the VM), Sundaram (page shows no factsheet link), SBI (newest file is August or older, rejected as stale), Mahindra Manulife (rejected as stale; file names carry no month) | 4 |

(36 accepted = 6 + 27 + 3; 4 not accepted.) Note the job's rule is "no older than 45 days", so a September file is still accepted on 30 Oct; it is not an error, but those 27 houses will need a re-run once their October file appears (repeat the job on 3 Nov and again after the 10 Nov scheduled run).

### 1b. Hand-import houses (10), last files on record (12 Oct)

| House | Newest file we hold | Needs for October |
|---|---|---|
| Axis | data as of 31 Aug | the October issue (30 Sep) |
| Bandhan | data as of 30 Sep (October issue) | up to date |
| HDFC (two files: active and passive) | 31 Aug | both October files |
| ICICI Prudential | 30 Sep (file stamped 28 Sep) | up to date |
| Invesco | 31 Aug | the October issue |
| ITI | 31 Aug | the October issue |
| JM Financial | 31 Aug (September issue) | the October issue |
| Kotak | 30 Sep | up to date |
| Trust | 30 Sep | up to date |
| WhiteOak | 31 Aug | the October issue |

So **6 of the 10 are one cycle behind** (Axis, HDFC, Invesco, ITI, JM Financial, WhiteOak); 4 are current (Bandhan, ICICI, Kotak, Trust). These were last imported into staging from the 12 Oct files; whether the staging database holds anything newer is checked by the query in section 5.

### 1c. No usable factsheet (5 houses, 33 funds)

Bajaj Finserv (newest file July 2026), AlphaGrep, IL&FS (IDF), Lakshya, Monarch: none publishes a current factsheet. Carnelian (5 scheme rows) is not in the registry at all. Nothing to download.

## 2. Houses to update by hand, with links

Links come from the registry; a house marked "no link" is reached from the house's own site (the registry has none because the page needs a browser).

| House | Why by hand | Where | Save as |
|---|---|---|---|
| Angel One | 403 to scripts | https://www.angelonemf.com/downloads (browser) | `angelone_2026-10.pdf` |
| Sundaram | page shows no factsheet link to scripts | https://www.sundarammutual.com/fundwise-factsheet (browser; fund-wise files, see note) | `sundaram_2026-10.pdf` |
| SBI | job found only August or older | https://www.sbimf.com/factsheets (active and passive, both required) | `sbi_active_2026-10.pdf`, `sbi_passive_2026-10.pdf` |
| Mahindra Manulife | job found only stale files | https://www.mahindramanulife.com/downloads | `mahindra_2026-10.pdf` |
| Axis, HDFC (2 files), ICICI, ITI, Kotak, Trust, WhiteOak | monthly hand import | each house's own factsheet page (no link stored) | `<house>_2026-10.pdf` |
| Bandhan | 401 (needs a key; no workaround) | https://bandhanmutual.com/downloads/factsheets | `bandhan_2026-10.pdf` |
| Invesco | CloudFront 403 | https://invescomutualfund.com/literature-and-form?tab=Factsheets | `invesco_2026-10.pdf` |
| JM Financial | 406 | https://www.jmfinancialmf.com/downloads/Factsheet/Factsheet | `jm_2026-10.pdf` |

**Important limit.** The hand-import command only accepts houses registered as `MANUAL` (`import_manual_fund_managers.py` exits with "isn't a manual-import AMC" otherwise). The ten above already are. **Angel One, Sundaram, SBI and Mahindra are registered as automatic**, so the command refuses them. Moving them to `MANUAL` is a one-line registry change per house (the 10 Oct rule already allows it: "set `ResolverKind.MANUAL` + a `note`"), which is code and goes through the normal plan, not a VM command. Until then those four stay one cycle behind or empty. Sundaram also has no registered reader, so a file for it would not be read even after the change; that needs a layout (a Codex task).

## 3. P/E and P/B in the factsheets

Checked on 83 cached files (12 Oct) and the VM's 48 current files (30 Oct), page by page, with a visual check where the text layer was empty.

| House | Mode | Prints per-scheme P/E and P/B | Schemes with a figure | Notes |
|---|---|---|---|---|
| **Aditya Birla Sun Life** | auto | **Yes** | 30 snapshot entries (4 show NA) | trailing |
| **UTI** | auto | **Yes, fund and benchmark** | 26 of about 100 scheme pages | active equity only |
| **Invesco** | hand | **Yes** | 22 of about 48 | equity funds |
| **ITI** | hand | **Yes** | 14 of about 31 | |
| **Kotak** | hand | **Yes** | 33 pages of about 158 | one figure basis per page |
| Edelweiss | auto | **Index only**, not the fund | 21 of about 25 passive pages | the printed figure is the index's |
| SBI | auto | No per scheme; one index table (Nifty 50 TRI P/E 20.36, P/B 2.92) | 1 table page | not usable per fund |
| Quantum | auto | No per scheme; index table | 0 | |
| PGIM, Jio BlackRock | auto | commentary only ("Nifty 500 P/E 22.73") | 0 | market, not fund |
| Axis, Bandhan, HDFC, ICICI, JM, Trust, WhiteOak | hand | No (HDFC and ICICI only a glossary) | 0 | |
| All other automatic houses (about 30) | auto | No | 0 | |

**Count: 5 houses print a per-scheme P/E and P/B (3 hand-import, 2 automatic). About 45 of about 55 houses do not.** For all other funds the app uses the computed path (holdings-weighted), which is the plan's default. No file has an image-only page, so no OCR is needed.

## 4. Benchmark comparison

### 4a. Does the factsheet print the benchmark?

Yes for every house we could read. All 38 houses fetched on 30 Oct and all 10 hand-import houses print the benchmark name in text, as "Benchmark", "Tier I Benchmark" or "Benchmark Index" next to each scheme. That is a name, not a return series: the return series comes from our own index history (next section). Not readable: the 5 no-factsheet houses and the 4 not accepted this month (their last mapping or the category fallback is used).

### 4b. Which printed benchmarks are not in our history

Our history (`benchmark_index_history`) holds **8 equity indices**, each with a price series and a total-return series: Nifty 50, Nifty 500, Nifty Next 50, Nifty 100, Nifty 200, Nifty Midcap 150, Nifty Smallcap 250 and Nifty LargeMidcap 250 (plus stored index P/E and P/B for some). The scan of benchmark names printed in factsheets (2,228 benchmark mentions, 838 distinct strings, many being the same index spelled differently) splits as follows. These are page mentions, not funds, so read them as proportions.

| Family | Distinct strings | Mentions | Share | In our history? | Main examples |
|---|---|---|---|---|---|
| The 8 stored indices | 14 | 359 | 16% | **Yes** | Nifty 500 TRI (about 140 under all spellings), Nifty 50 TRI, Nifty 100 TRI, Midcap 150, Smallcap 250, LargeMidcap 250, Next 50 |
| Other Nifty indices (equity and hybrid) | 248 | 599 | 27% | **No** | Nifty 500 Multicap 50:25:25 TRI (about 32), Nifty Bank TRI (20), India Consumption (18), 50 Arbitrage (about 34 across spellings), IT (16), 100 ESG (14), Financial Services (13), Equity Savings (about 20), India Manufacturing (12), Healthcare, Energy, Total Market, Quality 30, Momentum, Value 50, Private Bank, Infrastructure, Equal Weight |
| Nifty debt and rate indices | 159 | 333 | 15% | **No** | 1D Rate (25), Short Duration A-II (16), Hybrid Composite Debt 50:50 (13+3), Low Duration (12), Liquid (11), Composite Debt (11+5), Banking and PSU (10), Corporate Bond (9), Ultra Short, Medium Duration, G-Sec, SDL |
| CRISIL indices | 167 | 378 | 17% | **No** (different provider) | Liquid Overnight (20), Liquid Debt A-I (17), Hybrid 35+65 Aggressive (16), Dynamic Bond A-III (16), Dynamic Gilt (15), 10 Year Gilt (10), Credit |
| BSE indices | 92 | 270 | 12% | **No** (different provider) | BSE 500 TRI (50), BSE Sensex TRI (48), BSE 200, BSE 100, Healthcare, Teck, PSU, 250 Smallcap, Midcap 150 |
| Gold and silver prices | 30 | 126 | 6% | **No** | Domestic price of physical gold (about 70 with variants), of silver (about 30), blends |
| Other (global, blends, MSCI, S&P) | 128 | 163 | 7% | **No** | MSCI Golden Dragon, S&P Global 1200 blends, custom "65% Nifty 50 TRI + ..." blends |

**So roughly 84% of benchmark mentions are not in our history.** Today those funds use the category fallback (a stored index chosen from the fund's SEBI category), which is why the plan's Run 3 adds an index registry and a per-scheme benchmark.

### 4c. What the plan will add, and what it does not

| Need | Source | Verified from the VM? | In the plan |
|---|---|---|---|
| Other Nifty equity and hybrid indices (about 27%) | niftyindices total-return and price endpoints (the same ones the daily job uses; the price endpoint echoes the name in `INDEX_NAME`) | Yes, 200 on 30 Oct | **Run 3, task 3.1, first batch** (about 20 indices: Bank, IT, Financial Services, Consumption, Manufacturing, Healthcare, Energy, Multicap 50:25:25, 100 ESG, Quality 30, Momentum, Value 50, Total Market, Private Bank, Infrastructure, Equal Weight, Next 50 variants, 50 Arbitrage, Equity Savings) |
| Nifty debt and rate indices (15%) | same endpoints (names must be confirmed: S8) | Not tested yet | Second batch of task 3.1, after S8 |
| Nifty 50 Arbitrage | price endpoint returns the close, which dips day to day (2,747.05 on 30 Sep, 2,745.42 on 1 Oct), so it may not be the return series | Partly (S9) | held until compared with a factsheet figure |
| CRISIL indices (17%) | CRISIL's own site (licence terms unknown) | No | **Not planned**; those funds keep the category fallback until S10 (terms and licence) says otherwise |
| BSE indices (12%) | BSE's own index site | BSE API returns 403 from the VM | Only BSE 500 and Sensex TRI are common enough to consider; **not planned** until a source is shown to work |
| Gold and silver price | an official domestic price series | Not tested | Not planned in this release (needs a source decision) |
| Custom blends and global | none | n/a | Not planned |

## 5. Commands for the VM

All run from the repo checkout on the VM, `cd /opt/unifolio-redesign/deploy/leapswitch`. Read-only unless marked. Nothing here deploys, resets or touches the database apart from the two marked "writes".

**5a. What is stored now, per house (read only).** Shows the newest data month per fund house and how many schemes have a manager row, so we know which houses are really behind on staging:
```bash
set -a; . ./.env; set +a
sudo docker compose exec -T postgres psql -U "$DB_USERNAME" "$DB_NAME" -c "select s.amc_name, max(f.reference_period) as newest_period, count(distinct f.scheme_id) as schemes_with_manager, count(distinct s.id) filter (where s.is_active) as active_schemes from schemes s left join scheme_fund_managers f on f.scheme_id = s.id group by 1 order by 2 nulls first, 1;"
```

**5b. Which indices are stored (read only):**
```bash
sudo docker compose exec -T postgres psql -U "$DB_USERNAME" "$DB_NAME" -c "select index_name, return_type, count(*), min(date), max(date) from benchmark_index_history group by 1,2 order by 1,2;"
```

**5c. Put the files on the VM** (from your laptop, one folder; `scp` each file or the folder):
```bash
scp -r ./factsheets-oct2026 deploy@<VM-ADDRESS>:/home/deploy/factsheets-oct2026
```

**5d. Hand import, one house at a time (writes `scheme_fund_managers`; this is the same job the monthly routine uses, rows marked MANUAL).** The backend container cannot see the VM's folders, so the folder is mounted read-only for the run. Example for Axis; repeat per house with its exact registry name and file(s):
```bash
sudo docker compose run --rm -T -v /home/deploy/factsheets-oct2026:/fs:ro backend python scripts/jobs/import_manual_fund_managers.py --amc "Axis Mutual Fund" --pdf /fs/axis_2026-10.pdf
```
HDFC takes two files: `--amc "HDFC Mutual Fund" --pdf /fs/hdfc_active_2026-10.pdf --pdf /fs/hdfc_passive_2026-10.pdf`. The exact names the command accepts are the registry keys: `Axis Mutual Fund`, `Bandhan Mutual Fund`, `HDFC Mutual Fund`, `ICICI Prudential Mutual Fund`, `Invesco Mutual Fund`, `ITI Mutual Fund`, `JM Financial Mutual Fund`, `Kotak Mahindra Mutual Fund`, `Trust Mutual Fund`, `WhiteOak Capital Mutual Fund`. Each prints `matched=N unmatched=M`; compare N with last month's (Priority 1 doc). The command checks every file first and writes nothing if a file is stale or wrong.

**5e. Then re-run the automatic job for the houses that moved to October (writes, the agreed job):**
```bash
sudo ./scripts/run-job.sh fund-managers-monthly scripts/jobs/refresh_fund_managers_monthly.py
```
Do not stop it once started; it prints nothing until it ends (about 4 minutes).

**5f. Repeat the scan of the new PDFs** (the scan script already on the VM from Step 0, `scan_factsheets.py`, run over the new folder) so the P/E, P/B and benchmark counts above are refreshed for the October files.

## 6. What I recommend, and what is open

1. Download the October files for the 6 hand houses that are behind (Axis, HDFC x2, Invesco, ITI, JM Financial, WhiteOak) and run 5d. That moves 6 of 10 houses to October.
2. Decide whether Angel One, Sundaram, SBI and Mahindra move to `MANUAL` (a one-line registry change each; Sundaram also needs a reader). Until then they stay one cycle behind.
3. Decide on CRISIL, BSE and gold/silver: they are 35% of benchmark mentions and have no source in the plan. S10 (terms and licence) is the gate for CRISIL.
4. Repeat the scan and the job after the 10 Nov run; then update this note.
5. Still open from Step 0: S6, S8 (debt index names), S9 (Arbitrage series), S10.

---

# Revision 2 (owner review, 30 Oct): what changes and the new commands

This section supersedes sections 1b, 2, 4c, 5 and 6 where they differ.

## R1. Who to ask for an October file: the rule

The owner's rule: if a house has published October and we do not hold it, send it; if the house has not published yet, that is the house's lateness, not ours.

- **Automatic houses (27 on September, 3 with no month in the link name).** The job takes the newest-dated link on the house's page and only falls back to an older one if the newest fails its checks. A September file therefore means either October is not on the page, or October is on the page and was rejected. A new read-only script settles which: `check_publication.py` (command R4a). Its output has `october_listed` per house. **YES with September chosen = ours (send or fix); no = the house's.** The script cannot say on what date a house published, only whether the page lists October on the day it runs; so run it again on 3 Nov, 6 Nov and 10 Nov.
- **Hand-import houses (10) and the 4 not accepted.** No script can see these pages (they block scripts), so the owner checks each page in a browser. Checklist below.

| Give me the October file if the page already shows it | How I use it |
|---|---|
| Axis, HDFC (2 files), Invesco, ITI, JM Financial, WhiteOak (behind on 31 Aug) | hand import, command R4c |
| Bandhan, ICICI, Kotak, Trust (already on 30 Sep) | only if a newer file exists |
| Angel One | 403 to scripts; needs the move to hand import (R2) |
| Sundaram | page changed; needs the move to hand import plus a reader (R2) |
| SBI, Mahindra Manulife | the job found only August or older, so October is probably not published; give a file only if the page shows October |

## R2. Decision recorded: four houses move to hand import

Because the owner will supply Angel One, Sundaram, SBI and Mahindra by hand, the plan gets a Run 1 task: `ResolverKind.MANUAL` plus a note for each (readers already exist for Angel One, SBI and Mahindra; **Sundaram has no reader and needs one**). SBI and Mahindra keep the automatic path too if their page later lists the file. Nothing is changed until the plan is executed.

## R3. P/E and P/B: after the files arrive

Once the October files are in, I repeat the scan on every file (the automatic PDFs refetched plus the hand files) with a wider label list (P/E, PE Ratio, Price to Earnings, Price/Earnings, P/B, PB, Price to Book) and the benchmark-name extraction, and refresh the table in section 3 and the benchmark table in 4b. The first pass stays the baseline: 5 houses print a per-scheme figure. If the wider pass finds more, the reader list grows (Phase A in the plan); if not, the computed path from holdings stays the default. No other source gives a fund-level P/E.

## R4. Commands (all on the VM; read-only unless marked)

Put the scripts in `/home/deploy/step0` on the VM: `check_publication.py` (sha 7f8bb98d44ec0605) and `verify_benchmark_sources.sh` (sha a31d7bafe8aa9dac). Both are in the owner's `step0` folder, not in the repo.

**R4a. Has each automatic house published October? (read only, no download, no database)**
```bash
cd /opt/unifolio-redesign/deploy/leapswitch
sudo docker compose run --rm -T -v /home/deploy/step0:/s0:ro backend python /s0/check_publication.py > /home/deploy/step0/out/publication_$(date +%F).csv
column -s, -t < /home/deploy/step0/out/publication_$(date +%F).csv | cut -c1-200
```
Send back the CSV. Houses with `october_listed` = YES whose job file was September are ours.

**R4b. Verify every unverified benchmark source (read only):**
```bash
bash /home/deploy/step0/verify_benchmark_sources.sh
```
It tests the niftyindices price and total-return endpoints for 36 index names (the debt, hybrid, arbitrage and extra equity names printed in factsheets), prints the last 12 days of Nifty 50 Arbitrage from both endpoints (S9), and checks reachability of the BSE, CRISIL, IBJA, LBMA, RBI and MCX pages. Send back `/home/deploy/step0/out/bench_verify_<date>.log`.

**R4c. Hand import** (writes `scheme_fund_managers`, rows marked MANUAL), after you upload the files: unchanged from 5c and 5d above. **R4d. Re-run the automatic job** (writes, the agreed job): unchanged from 5e. **R4e. Re-scan** the new folder with `scan_factsheets.py` as in Step 0.

## R5. Benchmarks: what is built and how

| Family | Share of mentions | Decision | Status of the source |
|---|---|---|---|
| Other Nifty equity, hybrid and debt indices | about 42% | **Build** (Run 3, task 3.1, two batches) from the niftyindices endpoints we already use, subject to S10 | Equity names verified on 30 Oct; debt and hybrid names to be verified by R4b |
| BSE indices | 12% | **Build only if a free source exists; otherwise the stored fallback.** A web search found no free official absolute total-return series for the BSE TRIs (a price archive exists on bseindia.com but its terms are unread, and the BSE API returns 403 from the VM). Nothing was fetched or confirmed. | R4b reaches the pages; terms to be read |
| CRISIL | 17% | **Build only if a free source exists; otherwise the fallback.** CRISIL publishes recent-return factsheets, not a daily history, and its terms appear to forbid redistribution (read from a search summary, not the page). | R4b reaches the pages |
| Gold and silver | 6% | **Build only if a free source exists.** The LBMA series moved to a licence-gated portal in Nov 2025 and IBJA has no free history (search findings, unverified). One free internal alternative needs the owner's decision: a gold or silver ETF's NAV from our own NAV history as a labelled proxy (it tracks the domestic price less costs). | R4b reaches the pages |
| Custom blends and global | 7% | fallback | none |

The fallback is the plan's existing one: the stored index chosen from the fund's category, labelled as such.

## R6. Step 0 items S6, S8, S9, S10: what each is and what I need

| Item | What it is | How I fix it | What I need from you |
|---|---|---|---|
| **S6** | Book value from official filings (Phase C) needs NSE's filing endpoint, which is not in the repo | find the request address the NSE results page itself calls, then test it from the VM | Optional shortcut: open the NSE financial results page in your browser, press F12, Network tab, load a company's results, and send me the address of the data request. Otherwise I test candidate addresses on the VM |
| **S8** | Exact names the niftyindices endpoint accepts for debt and hybrid indices | R4b tries 36 spellings on both endpoints | nothing; run R4b |
| **S9** | The Nifty 50 Arbitrage price endpoint returns a close that dips day to day (2,747.05 then 2,745.42), so it may not be a total-return series; factsheets name a "Nifty 50 Arbitrage TRI" | R4b prints both endpoints' recent values, which I compare with an arbitrage fund's printed benchmark return | nothing; run R4b |
| **S10** | **Terms of use and licence for index data.** I read the niftyindices terms of use on 30 Oct. In my reading they allow personal, non-commercial use only, prohibit systematic or automated collection (scraping, extraction) without NSE Indices' written consent, and prohibit aggregating or copying site content. They list "Data Subscription" and "Authorised Data Vendors" as the licensed routes. | I cannot grant myself consent; this is a business decision | **A decision from you or the manager:** write to NSE Indices for permission or a data subscription, or accept the risk for staging only. This affects the daily benchmark job that already runs, not only the new indices. Until answered, the plan builds the new indices but releases none of them to users |
