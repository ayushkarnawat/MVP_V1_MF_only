import html, os, sys
N = sys.argv[1]
E = html.escape

# ---- benchmark coverage by family (mentions from the factsheet audit; top 41 distinct names, about one per scheme page) ----
B = [  # name, mentions, family
 ("NIFTY 500 TRI",140,"nse"),("DOMESTIC PRICE OF PHYSICAL GOLD",54,"gold"),("NIFTY 50 TRI",52,"nse"),("BSE 500 TRI",50,"bse"),("BSE SENSEX TRI",48,"bse"),
 ("NIFTY MIDCAP 150 TRI",33,"nse"),("NIFTY SMALLCAP 250 TRI",31,"nse"),("NIFTY LARGE MIDCAP 250 TRI",30,"nse"),("NIFTY 1D RATE INDEX",25,"nsep"),
 ("NIFTY 500 MULTICAP 50:25:25 TRI",25,"nse"),("NIFTY 100 TRI",24,"nse"),("DOMESTIC PRICE OF PHYSICAL SILVER",24,"gold"),("CRISIL LIQUID OVERNIGHT INDEX",20,"crisil"),
 ("NIFTY BANK TRI",20,"nse"),("NIFTY INDIA CONSUMPTION TRI",18,"nse"),("NIFTY NEXT 50 TRI",18,"nse"),("NIFTY 50 ARBITRAGE INDEX",17,"nsep"),("CRISIL LIQUID DEBT A-I INDEX",17,"crisil"),
 ("NIFTY SHORT DURATION DEBT INDEX A-II",16,"nsed"),("CRISIL HYBRID 35+65 - AGGRESSIVE INDEX",16,"crisil"),("CRISIL DYNAMIC BOND A-III INDEX",16,"crisil"),("NIFTY IT TRI",16,"nse"),
 ("CRISIL DYNAMIC GILT INDEX",15,"crisil"),("NIFTY 100 ESG TRI",14,"nse"),("NIFTY 50 HYBRID COMPOSITE DEBT 50:50 INDEX",13,"nsed"),("NIFTY FINANCIAL SERVICES TRI",13,"nse"),
 ("NIFTY LOW DURATION DEBT INDEX A-I",12,"nsed"),("NIFTY EQUITY SAVINGS INDEX",12,"nsed"),("NIFTY INDIA MANUFACTURING TRI",12,"nse"),("BSE 200 TRI",11,"bse"),("NIFTY LIQUID INDEX A-I",11,"nsed"),
 ("NIFTY COMPOSITE DEBT INDEX A-III",11,"nsed"),("BSE 100 TRI",11,"bse"),("NIFTY BANKING & PSU DEBT INDEX A-II",10,"nsed"),("CRISIL 10 YEAR GILT INDEX",10,"crisil"),("NIFTY HEALTHCARE TRI",10,"nse"),
 ("NIFTY ENERGY TRI",10,"nse"),("NIFTY 50 ARBITRAGE TRI",10,"nsep"),("NIFTY CORPORATE BOND INDEX A-II",9,"nsed"),("NIFTY 50 HYBRID COMPOSITE DEBT 15:85 INDEX",9,"nsed"),("BSE HEALTHCARE TRI",9,"bse"),
]
fam = {
 "nse": ("NSE equity, strategy and sector total-return series", "Works today through the endpoint the app already uses. Config entry plus a one-time history fetch. Tested live on 30 Oct.", "Coverable now"),
 "nsep": ("NSE price-history series (Nifty 1D Rate, Nifty 50 Arbitrage)", "Served by the price endpoint, not the total-return one. Must be checked to behave like a return series (S9).", "Coverable after a check"),
 "nsed": ("NSE debt, hybrid and savings indices", "Both endpoints returned nothing under the names tried. The names or endpoint must be found (S8, about 30 minutes in a browser).", "Needs data work"),
 "bse": ("BSE indices (BSE 100, 200, 500, Sensex, sector)", "BSE publishes price levels only; total-return data belongs to Asia Index (S&P DJI). API and site blocked to our requests. Use the NSE counterpart labelled as a proxy until a licence exists.", "Proxy, or licence"),
 "crisil": ("CRISIL indices", "No public download found. Fund factsheets print only period returns. Show the declared name and the labelled category fallback.", "Not cheaply available"),
 "gold": ("Domestic price of physical gold and silver", "Not an index feed: needs a price series (a different job and table) or a gold ETF as a labelled proxy.", "Different data"),
}
tot = sum(m for _, m, _ in B)
agg = {}
for n, m, f in B:
    a = agg.setdefault(f, [0, 0]); a[0] += 1; a[1] += m
rows = ""
for k in ("nse", "nsep", "nsed", "bse", "crisil", "gold"):
    n, m = agg[k]
    rows += f"<tr><td><b>{E(fam[k][0])}</b></td><td>{n}</td><td>{m} ({round(m/tot*100)}%)</td><td>{E(fam[k][2])}</td><td>{E(fam[k][1])}</td></tr>"

top = "".join(f"<tr><td>{E(n.title().replace('Tri','TRI').replace('Nifty','Nifty').replace('Crisil','CRISIL').replace('Bse','BSE'))}</td><td>{m}</td><td>{E(fam[f][2])}</td></tr>" for n, m, f in B[:16])

fscheck = f"""  <section class="sec" aria-labelledby="fscheck">
    <div class="sec-head">
      <h2 id="fscheck">Monthly factsheet check: what we collect, what it holds, and how to run it every month</h2>
      <p>Item 7 (P/E and P/B) and item 11 (benchmarks) both depend on factsheets. This section records what the factsheets we have actually print, for the houses fetched automatically and the ones imported by hand, and sets out a repeatable monthly check. It is built from a scan of 94 distinct factsheet PDFs and the saved text of the rest (October 2026, mostly 31 Aug and 30 Sep data), plus the live scan of the 11 hand-import files run on 31 Oct. Nothing was read from the VM yet; that is Step 0.</p>
    </div>

    <article class="panel">
      <div class="block after"><h3>What we take from factsheets, today and planned</h3>
        <div class="tblwrap"><table class="tbl"><thead><tr><th>Item</th><th>Today</th><th>Planned</th><th>Where it is read</th></tr></thead><tbody>
          <tr><td>Fund managers (name, role, since)</td><td>Yes, monthly, 40 houses automatically and 10 by hand</td><td>Same</td><td><code>fund_manager_layouts.py</code>, <code>amfi_factsheet_client.py</code></td></tr>
          <tr><td>Per-scheme P/E and P/B</td><td>No</td><td>Item 7, from the 5 houses that print them</td><td>New readers, same files</td></tr>
          <tr><td>Benchmark name per scheme (and the tracked index of index funds)</td><td>No</td><td>Item 11 and item 9 (D34 option C, D24)</td><td>New readers, same files</td></tr>
          <tr><td>Not from factsheets</td><td colspan="3">Portfolio holdings (separate monthly disclosure files), expense ratios and average assets (AMFI and the fund houses' own files), NAV (AMFI daily).</td></tr>
        </tbody></table></div>
        <p>The monthly job holds each PDF in memory only and keeps nothing, and the 10 hand-import houses are never fetched by it. So today there is no way to look back at what a factsheet said. Step 0 adds a wrapper that keeps the files.</p>
      </div>

      <div class="block"><h3>Which houses print a per-scheme P/E and P/B</h3>
        <p><b>Only 5 of about 55 fund houses do.</b> Everyone else prints none, or only the index's figure, or only a glossary definition. All the figures that exist are in the text layer (no OCR needed), but three of the five need positional extraction because the label and the value are separate text runs.</p>
        <div class="tblwrap"><table class="tbl"><thead><tr><th>Fund house</th><th>Fetched</th><th>Labels</th><th>Basis and method</th><th>Schemes with the figure</th></tr></thead><tbody>
          <tr><td><b>Invesco</b></td><td>By hand</td><td>"Fund P/E - FY27E", "Fund P/B" (example 30.63, 4.65)</td><td>P/E <b>forward</b> (FY27E), P/B trailing 12 months, weighted harmonic mean (stated)</td><td>22 of about 48</td></tr>
          <tr><td><b>ITI</b></td><td>By hand</td><td>"Average P/E", "Average P/B" in a Ratios block</td><td>Not stated. Positional extraction needed.</td><td>14 of about 31</td></tr>
          <tr><td><b>Kotak</b></td><td>By hand</td><td>"P/E", "P/BV" (marked ^^), example 25.52, 2.89</td><td>Not stated. Footnote: ICRA MFI Explorer, Bloomberg. Positional extraction needed.</td><td>about 33 of about 158 pages</td></tr>
          <tr><td><b>UTI</b></td><td>Automatic</td><td>"P/E" and "P/B" under Quantitative Indicators, fund and benchmark side by side (23.72 | 21.32)</td><td>Harmonic mean (stated); trailing or forward not stated. Positional extraction needed.</td><td>26 of about 100</td></tr>
          <tr><td><b>Aditya Birla Sun Life</b></td><td>Automatic</td><td>"Avg. P/E", "Avg P/BV" in an Equity Snapshot table</td><td>Not stated (glossary: weighted average)</td><td>about 26 numeric of 30 rows</td></tr>
        </tbody></table></div>
        <p><b>No per-scheme figure:</b> Edelweiss, Quantum and SBI passive print the <i>index's</i> P/E and P/B for index funds (not the fund's); HDFC (active and passive) and ICICI print only a glossary definition of Average P/E; JM, PGIM, Jio BlackRock, Union, Abakkus, Old Bridge and Tata mention P/E only in market commentary; and Axis, Bandhan, Trust, WhiteOak and about 25 others print nothing. I confirmed this on the live scan for Axis, Bandhan, Trust, WhiteOak, HDFC and ICICI, and by looking at an HDFC scheme page (it shows turnover, standard deviation, beta and Sharpe, and no P/E).</p>
        <p><b>Second scan, 31 Oct, the automatic houses.</b> I ran my own scan over all 83 cached factsheet PDFs of the automatically fetched houses (5,822 pages), and a positional check on every page that mentions P/E or P/B. Result: only <b>Aditya Birla Sun Life</b> (92 pages across 3 files) and <b>UTI</b> (26 scheme pages, fund and benchmark side by side) print a per-scheme P/E and P/B. A single PPFAS page lists index P/Es in market commentary, and PGIM's page uses the Nifty 500 P/E as an allocation rule; neither is a fund figure. Quantum prints index-level figures. This matches the audit. <b>Limits:</b> these are the files cached on 9 to 10 Oct (31 Aug and 30 Sep data), not a fresh fetch from the VM; the check starts from pages that carry a P/E or P/B label, so a figure printed with no label text would be missed; no OCR was run. Step 0 (S2, S3) has now repeated it on the VM's current files (next paragraph).</p>
        <p><b>VM scan, 30 Oct (Step 0 S2 and S3), the automatic houses on current files.</b> The VM fetched 38 of the 40 automatic houses; Angel One is blocked with a 403 and Sundaram's page shows no factsheet link. SBI and Mahindra Manulife were downloaded but rejected as stale (their latest file is older than 45 days), so 36 houses were accepted. The scan covered 48 distinct PDFs (288 MB, 4,355 pages): none is image-only and 5 pages are blank or vector. <b>Per-scheme P/E and P/B: Aditya Birla Sun Life (30 pages) and UTI (28 pages).</b> Edelweiss prints Index P/E and Index P/B for its index funds (21 pages), which are the index's figures, not the fund's. Quantum prints an index table, and PGIM, Tata, SBI, Union and others mention P/E only in commentary or a glossary. Every one of the 38 houses prints its benchmark in text. This matches the cached-file scans: the five fund-level houses are Invesco, ITI and Kotak (by hand) and UTI and ABSL (automatic).</p>
        <p><b>Consequence for item 7:</b> the computed path (from holdings and NSE/BSE data) will carry most funds. Factsheet figures cover five houses, and they are not alike: forward versus trailing, a stated harmonic mean versus unstated. Each stored value therefore carries its basis and method.</p>
      </div>

      <div class="block"><h3>Text or image? Where numbers could hide</h3>
        <ul>
          <li><b>The 11 hand-import PDFs (live scan, 31 Oct):</b> 1,341 pages, <b>no image-only page</b>. The largest image on any page covers under 0.1% of it (a logo or riskometer). Axis, Bandhan, Trust and WhiteOak have no P/E or P/B lines at all; HDFC and ICICI have glossary text only; JM has commentary only.</li>
          <li><b>The 83 cached PDFs of the automatic houses (second scan, 31 Oct):</b> 5,822 pages: 5,764 text pages, 50 with only small images, 8 blank or vector, <b>none image-only</b>, and no image larger than a sliver of a page. Every figure that exists is text. Scheme pages have almost no large images. HSBC and Mirae scheme pages were looked at on screen: charts and riskometers, no P/E or P/B.</li>
          <li><b>Not proven:</b> no OCR was run; a figure drawn as vector graphics would not show as an image; most houses' pages were not rendered by eye; Nippon exists only as saved text. The scan script flags any page with large images and little text, so the check is repeatable each month.</li>
        </ul>
      </div>

      <div class="block"><h3>Benchmarks</h3>
        <p><b>Every house that could be read prints a benchmark per scheme, in text.</b> Label variants: "Benchmark", "Benchmark Name", "Benchmark Index", "Tier 1 Benchmark", "First Tier Benchmark", "Scheme Benchmark", and an "Additional Benchmark" at several houses (HDFC prints both, for example Nifty 100 TRI and BSE Sensex TRI). WhiteOak, UTI and the multi-scheme layouts (Groww, Franklin) need positional extraction. Index funds and ETFs print their tracked index in the same line, for example "Benchmark Nifty 50 TRI" (Edelweiss, Mirae, Navi, Axis), "Tier I Benchmark - Nifty 50 TRI" (Quantum) and "NASDAQ-100 TRI" (Motilal Oswal), which settles D24.</p>
        <p><b>Many are blends:</b> ITI and Invesco print Tier I benchmarks such as "50% NIFTY 500 TRI + 30% ...". A blend is a weighted mix of several indices and needs a stated rebalancing rule or must be shown as not available.</p>
        <p>The 41 most-printed distinct names (the real list is several hundred), grouped by how we can get their data:</p>
        <div class="tblwrap"><table class="tbl"><thead><tr><th>Family</th><th>Distinct names</th><th>Mentions</th><th>Status</th><th>What it takes</th></tr></thead><tbody>{rows}</tbody></table></div>
        <p>So about <b>{round((agg['nse'][1])/tot*100)}% of mentions are coverable today</b> through the endpoint we already use, and another {round((agg['nsep'][1]+agg['nsed'][1])/tot*100)}% need either a check or the right index names. Roughly {round((agg['bse'][1])/tot*100)}% are BSE indices (proxy for now), {round((agg['crisil'][1])/tot*100)}% CRISIL (not available) and {round((agg['gold'][1])/tot*100)}% gold and silver prices (a different feed). These shares describe mentions of the 41 most frequent names, not exact fund counts.</p>
        <div class="tblwrap"><table class="tbl"><thead><tr><th>Most-printed names</th><th>Mentions</th><th>Data</th></tr></thead><tbody>{top}</tbody></table></div>
      </div>

      <div class="block"><h3>What is still missing</h3>
        <ul>
          <li><b>No factsheet, or no manager data:</b> Sundaram (277 scheme rows; its page shows no factsheet link, a change from 28 Oct), Bajaj Finserv (108; only stale files, no reader), IL&amp;FS IDF (12), AlphaGrep (12), Monarch (4) and Lakshya (2) publish none, and Carnelian (5) is not in the factsheet registry at all. In all, about 420 scheme rows have no manager data. Angel One (16 rows) is blocked with a 403, and SBI and Mahindra Manulife published files older than 45 days. These funds use the category fallback for benchmarks and the computed path for P/E and P/B.</li>
          <li><b>Not yet examined:</b> the 10 hand-import houses on this month's files (they were scanned on the 12 Oct files only), and the November files after the 10 Nov job (Step 0 S2 and S3 repeat). A positional pass over Kotak, ITI and UTI would give exact scheme counts; the numbers above are heuristic counts.</li>
          <li><b>Exact counts:</b> a positional pass over Kotak, ITI and UTI would give exact scheme counts; the numbers above are heuristic counts.</li>
        </ul>
      </div>

      <div class="block after"><h3>The monthly check (a procedure to repeat)</h3>
        <ol>
          <li><b>Day of the job (10th, 06:00 IST).</b> Confirm the cron is installed and the disk has room. Nothing else to run.</li>
          <li><b>Same day or next morning: read the result.</b> <code>grep -E "refresh_fund_managers_monthly|FUND_MANAGER_ALERT"</code> the log. Compare houses processed with last month. Any <code>stale_month</code>, <code>fetch_failed</code>, <code>no_factsheet_link</code> or <code>matching_collapsed</code> is a follow-up. (The job exits 0 even when houses fail, so nothing emails; the missed-month alert is still not built, Priority 1.)</li>
          <li><b>Hand-import the 10 houses the same day</b> (the 45-day freshness check refuses old files): Axis, Bandhan, HDFC (two files), ICICI, Invesco, ITI, JM, Kotak, Trust, WhiteOak. The import command reads managers, and will also read P/E, P/B and benchmark once built.</li>
          <li><b>Keep the files</b> (decided 31 Oct). Use the fetch-and-keep wrapper (Step 0, S2) so the PDFs are saved, and keep them for three months. They are public documents, about 400 to 600 MB a month. Without them nothing can be re-checked.</li>
          <li><b>Run the scan</b> on the month's folder (Step 0, S3) and compare with last month's <code>files.csv</code>: for each house, pages with P/E, pages with P/B, pages with a benchmark, and image-only pages.</li>
          <li><b>Parser-health alerts</b> (to be built with item 7): a house that printed P/E last month and printed none this month; a benchmark count that drops by a fifth; any house with image-only pages (needs OCR); a P/E or P/B outside the sanity range (P/E 3 to 200, P/B 0.2 to 40); a manager or benchmark parse with no match.</li>
          <li><b>Record</b> the month's counts in one small log (houses fetched, houses by hand, funds with a factsheet P/E, funds with a declared benchmark, funds on the fallback). This is the number to watch.</li>
        </ol>
        <p><b>Who:</b> the person who runs the monthly hand import, which is already manual. About an hour a month once the scripts are in the repo. The scan, the keep-files wrapper and the health alerts are written as part of Run 2 and Run 3; until then the scripts in the Step 0 section do the job by hand.</p>
      </div>
    </article>
  </section>

"""

gaps = """  <section class="sec" aria-labelledby="valgaps">
    <div class="sec-head">
      <h2 id="valgaps">Item 7 methodology gaps, and how each one is covered</h2>
      <p>The earlier methodology listed what was unverified. Each gap now has a cause, a way to cover it, and the check that proves it. "Where" says whether it needs the VM.</p>
    </div>
    <article class="panel">
      <div class="block"><div class="tblwrap"><table class="tbl"><thead><tr><th>Gap</th><th>Why it matters</th><th>How we cover it</th><th>Check (where)</th></tr></thead><tbody>
        <tr><td><b>1. Factsheet coverage was unknown</b></td><td>Decides how many funds show a printed figure.</td><td>Now known: 5 houses print per-scheme P/E and P/B (Invesco, ITI, Kotak by hand; UTI, ABSL automatic), confirmed on the VM's current files for the automatic houses on 30 Oct. The rest use the computed path.</td><td>Repeat after the 10 Nov job; the monthly check</td></tr>
        <tr><td><b>2. Forward versus trailing</b></td><td>Invesco's P/E is forward (FY27E); the others trailing or unstated. A portfolio line cannot mix them silently.</td><td>Every stored value keeps its basis. The fund table shows the printed value with 'fwd' and a plain-words hover note (Q2). The portfolio line uses one basis (D39).</td><td>Unit tests on the resolver</td></tr>
        <tr><td><b>3. Averaging method differs by house</b></td><td>UTI and Invesco state a harmonic mean; Kotak and ITI do not say.</td><td>Store the method (harmonic, weighted average, not stated). The label says 'method not stated' where true. Our own computation stays harmonic (D17, Q6) with the plain-words reason.</td><td>Parser tests per house</td></tr>
        <tr><td><b>4. Label and value are separate text</b></td><td>Kotak, ITI and UTI would be misread by a line-by-line parser.</td><td>Positional extraction (word boxes) for those three, as already done for Axis, ICICI, Franklin, LIC and Taurus.</td><td>Fixture tests from saved snippets</td></tr>
        <tr><td><b>5. A figure could be inside a picture</b></td><td>A house could print it as an image.</td><td>The monthly scan flags image-only pages. If any appear, OCR for that house only. None found in 94 PDFs so far.</td><td>S3 (VM)</td></tr>
        <tr><td><b>6. A parse error reaching the screen</b></td><td>A misread table could show P/E 0 or 4,000.</td><td>Sanity range (P/E 3 to 200, P/B 0.2 to 40): outside is treated as not found and logged. This catches impossible values only; a fund house's own mistake would be shown (your decision).</td><td>Unit tests</td></tr>
        <tr><td><b>7. BSE's own data is blocked</b></td><td>BSE-only stocks have no P/E from NSE.</td><td>The BSE price file (works from the VM, verified 30 Oct) identifies and prices them. Their ratios use the same labelled fallbacks as P/B today (Yahoo, screener.in) and are marked unofficial; below the 70% coverage floor a fund shows 'Not enough data'. The BSE data API answers 403 from the VM, so BSE's own ratios are not planned.</td><td>S5 done 30 Oct</td></tr>
        <tr><td><b>8. How many BSE-only stocks funds really hold</b></td><td>The scale decides if Phase B is worth building.</td><td>Counted on staging, 30 Oct: <b>96</b> equity stocks held by funds have no NSE symbol (BSE-only candidates) and 278 have no stored P/E (some are loss-making, some BSE-only). Small enough that Phase B is a one-day task.</td><td>S7 done 30 Oct</td></tr>
        <tr><td><b>9. Which NSE column is right (P/E or Adjusted P/E)</b></td><td>The NSE file has two P/E columns; only the first is read.</td><td>Read NSE's definition of the adjusted column and compare both against a known stock; document the choice.</td><td>Desk check plus S4 (VM)</td></tr>
        <tr><td><b>10. P/B depends on Yahoo and screener.in</b></td><td>Unofficial sources can break or change.</td><td>Phase C: book value from the latest year-end or half-year filing (equity attributable to owners divided by shares in issue, times the day's price). One stated basis. Yahoo and screener.in stay only as labelled fallbacks.</td><td>S6 (VM)</td></tr>
        <tr><td><b>11. Banks, insurers and finance companies</b></td><td>They file in different formats; one formula may not fit.</td><td>Test one of each in the spike. If the formula does not apply, those stocks keep the fallback and are named in the excluded list.</td><td>S6 (VM)</td></tr>
        <tr><td><b>12. The September half-year filing</b></td><td>The June quarterly filing has no balance sheet; only year-end and half-year do.</td><td>Spike: open the September XBRL file and confirm it holds equity and shares. Book value is up to 6 to 12 months old, and its date is shown.</td><td>S6 (VM)</td></tr>
        <tr><td><b>13. Request volume and pacing</b></td><td>About two requests per stock per new filing; a few thousand stocks.</td><td>Refresh only when a new filing appears; pace like the existing stock job (0.3 s). Estimate the total in the spike before building.</td><td>S6 (VM)</td></tr>
        <tr><td><b>14. The staging VM's address</b></td><td>Exchanges block some cloud addresses; tests so far were from a developer machine.</td><td>Tested from the VM on 30 Oct: the NSE P/E file, the security master, niftyindices (total-return and price endpoints), AMFI and the BSE bhavcopy all answered 200; the BSE API answered 403 as expected. The NSE Integrated Filing endpoint (S6) is not tested yet. If a source is blocked later, that phase stops and the fallback stays.</td><td>S4, S5 done; S6 open</td></tr>
        <tr><td><b>15. Terms of use</b></td><td>Automated download of exchange data may be restricted; index levels may need a licence.</td><td>Written check before scaling (S10). Show derived returns only, not raw index levels.</td><td>S10 (a person)</td></tr>
        <tr><td><b>16. Freshness</b></td><td>A printed value is a month-end figure.</td><td>Use the latest factsheet value only if it is at most about 75 days old on the NAV date (Q1); the date is shown beside every number. Direct and Regular plans of one scheme share the printed value.</td><td>Unit tests</td></tr>
        <tr><td><b>17. Layout changes and skipped months</b></td><td>A house changes its factsheet and the parser silently finds nothing.</td><td>Parser-health alerts and the monthly check above; the missed-month alert for the 10 hand-import houses (Priority 1) is part of Run 2.</td><td>Monthly check</td></tr>
        <tr><td><b>18. Overseas and loss-making holdings</b></td><td>No P/E exists for them; they would lower coverage.</td><td>Overseas holdings are counted separately and not called missing. Loss-making stocks are excluded from the harmonic mean and named, as today.</td><td>Unit tests</td></tr>
        <tr><td><b>19. Factsheet month versus NAV date</b></td><td>The August factsheet's figures are used in October.</td><td>The as-on date comes from the factsheet's own caption and is shown. Older than the 75-day rule falls back to computing.</td><td>Unit tests</td></tr>
      </tbody></table></div></div>
    </article>
  </section>

"""
open(os.path.join(N, "sections", "sec_fscheck.html"), "w", encoding="utf-8").write(fscheck)
open(os.path.join(N, "sections", "sec_valgaps.html"), "w", encoding="utf-8").write(gaps)
print("fscheck", len(fscheck), "gaps", len(gaps), "| shares:", {k: (v[0], v[1], round(v[1]/tot*100)) for k, v in agg.items()}, "total", tot)
