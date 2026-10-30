/* ===== 31 Oct patch: item cards, plain-language steps, answers, timeline (runs after the data scripts, before the page renders) ===== */
(function () {
  function D(n) { return DEEP.filter(function (d) { return d.n === n; })[0]; }
  function add(d, key, text) { (d[key] || (d[key] = [])).push(text); }
  function rep(d, key, needle, text) {
    var a = d[key] || (d[key] = []);
    for (var i = 0; i < a.length; i++) { if (String(a[i]).indexOf(needle) >= 0) { a[i] = text; return; } }
    a.push(text);
  }
  function ans(n, text) { (ANSWERS[n] = ANSWERS[n] || []).push(text); }

  /* ---- 01 Head of Family ---- */
  var d1 = D("01");
  add(d1, "after", "Emails: the code emails use the same email template as sign-in codes with new wording (different headline, a 10-minute note, who is changing what). Two notice emails are new: Head changed, and the 24-hour Undo link. Wording is in the Item 1 build section.");
  add(d1, "after", "Phone codes use the existing stub (D37). The test code returned by the server is shown under each phone box as 'Test mode: no SMS is sent yet. Your phone code is ...'.");
  add(d1, "after", "Buttons: Change Head of Family, Send codes, Confirm change and Confirm and move sign-in use the shared primary button, brand green #22C55E with white text.");
  add(d1, "after", "The database swap, every error state, the label table and the extra situations are in the section 'Item 1 build: Change Head of Family, in detail'.");
  rep(d1, "backend", "Migration 0047", "Migration 0047: household_members.is_head with a partial unique index (one head per account) and a backfill that sets the head on each account's self row; table head_change_requests (with four verified-at stamps, snapshots for undo, undo token hash); a purpose column and a time-to-live parameter for otp_requests so head-change codes can never be replayed as login codes.");
  rep(d1, "risks", "Phone codes cannot go live today", "Phone codes run on the development stub (D37), so the flow is complete but its phone step proves nothing about the real phone until an SMS provider exists. This does not block the build.");
  add(d1, "risks", "White text on #22C55E has a contrast ratio of 2.28:1 (standard asks 4.5:1 for normal text, 3:1 for large). Built as requested; one token if you later want #15803D (5.0:1).");
  add(d1, "tests", "The stub code appears in the dialog only when the API returns it; a head-change code cannot sign anyone in; each error code in the table returns its own message beside the right box.");
  d1.qs = (d1.qs ? d1.qs + ", " : "") + "D40";

  /* ---- 02 Consolidated holdings ---- */
  var d2 = D("02");
  rep(d2, "frontend", "HoldingsTable: group rows", "HoldingsTable: group rows by fund (the earlier layout, decided 31 Oct). The parent row keeps every column of requirement 2.2 (units, average price, invested, current value, unrealised, realised, XIRR) with a small split bar under the fund name that shows each member's share. A + button opens one row per member with the same columns and the masked folio. Spacing is improved: taller rows, more padding in every cell, second lines on their own line, tinted member rows, and a wider table that scrolls sideways on a narrow screen instead of squeezing; on a phone the rows become cards with the expansion inside the card. Add an expand control with aria-expanded and keyboard support.");
  rep(d2, "frontend", "Add Realised gain and Folio columns", "Realised gain stays a column on the parent and member rows; the masked folio sits under the member name (requirements 2.2 and 2.4).");
  add(d2, "risks", "The 8-column table was judged crowded on 31 Oct and the member-card redraw was set aside; this layout returns with roomier spacing. If it still feels tight on real data, the member-card idea remains available.");

  /* ---- 03 Market cap ---- */
  var d3 = D("03");
  add(d3, "after", "Why the note: the three slices add to 100% of the equity we could sort into Large, Mid and Small. Overseas stocks, new listings and unmatched stocks have no AMFI bucket. The note says what the 100% is of. Shown when the unsorted part is 0.5% or more; can be a tooltip. See the item 3, 4 and 5 rules section.");

  /* ---- 04 Fund manager ---- */
  var d4 = D("04");
  rep(d4, "after", "Co-managed funds carry", "Co-managed funds: the main manager gets the whole fund value (D7 option A). When no manager is marked main, the first listed is used and marked 'assumed' (D38). The case table in the item 3, 4 and 5 rules section lists every situation (no main manager, two equal co-managers, equity and debt sleeves, overseas and gold specialists, handovers).");
  rep(d4, "after", "Each fund shows only its primary manager", "Each fund counts once, to its main manager: name, fund house, allocation percentage and rupee amount. The LinkedIn icon is on hold (31 Oct).");
  rep(d4, "backend", "Amount:", "Amount: the main manager gets the fund's full household value; the equal split is dropped for the card. Totals add to at most the portfolio value. Each manager row also records whether the main manager was marked by the source or assumed.");
  rep(d4, "backend", "Migration 0048", "ON HOLD (31 Oct): LinkedIn. The fund_managers table (migration 0048, reserved), the verification process and the LinkedIn icon are deferred. Item 4 ships without them: no new table, no migration.");
  add(d4, "tests", "The manager sentence 'Funds with more than one manager are divided equally' is removed from the card; a test checks it is gone.");
  add(d4, "tests", "Role table cases from the rules section: sleeves, two co-managers, no marked manager (assumed), a future 'w.e.f.' handover, lead on one fund and assistant on another.");
  d4.qs = (d4.qs ? d4.qs + ", " : "") + "D38";

  /* ---- 05 Overlap ---- */
  var d5 = D("05");
  add(d5, "after", "Empty states: no equity funds, one fund, a category with none or one fund, funds without a published portfolio, and funds in other categories each have defined wording (item 3, 4 and 5 rules section). A category with one fund is greyed ('1 fund, nothing to compare') and opens a message with a button to All funds.");
  add(d5, "after", "What counts as equity (D14): the category allowlist (SEBI Equity Schemes, equity index funds and ETFs, Aggressive Hybrid) plus the definition rule for judgement categories (at least 65% domestic equity after hedging in the latest published portfolio). Arbitrage, debt, liquid, gold and international are excluded.");
  add(d5, "tests", "One equity fund: the page says overlap needs two; a category with one fund opens the one-fund message and the All funds button; a Mid Cap fund held alone does not break the Large Cap tab.");

  /* ---- 07 P/E and P/B ---- */
  var d7 = D("07");
  rep(d7, "after", "The current Portfolio Valuation vs. Benchmarks section stays exactly as it is.", "The Portfolio Valuation vs. Benchmarks section stays on the page, but its P/E and P/B are now built the same way as the fund table (Q4 answered 31 Oct): from the funds' own figures, factsheet where printed, otherwise computed from NSE/BSE data. Its look and its two collapsible lists are unchanged. Forward versus trailing is handled by D39.");
  add(d7, "after", "Labels: short labels (Factsheet, NSE/BSE) beside each number, a hover note (tap on a phone) with the basis in plain words, and a one-line footnote under the table (Q5, both).");
  add(d7, "after", "The info text carries a plain-words disclaimer on why a harmonic mean is used: it adds up the funds' earnings and divides the total price by them, the way a fund would, instead of averaging the ratios, which would overstate the multiple when a few holdings are expensive (D17, Q6).");
  add(d7, "after", "Order of work (Q3): Step 0 checks first, then Phase A, then B, then C. Details and the VM checks are in the Item 7 build, factsheet check and Step 0 sections.");
  add(d7, "risks", "The portfolio line now mixes sources. Mixed forward and trailing P/E is handled by D39 (recommended: the portfolio line uses one basis).");
  d7.qs = (d7.qs ? d7.qs + ", " : "") + "D39";

  /* ---- 08 Performance Ranking ---- */
  var d8 = D("08");
  rep(d8, "backend", "Retire the composite calculation", "Delete the composite Fund Ranking (D36, option B): fund_ranking.py, SchemeRanking and RankingWeight, the /analytics/funds/{id}/ranking route, the FundRanking schema types and four backend tests. Migration 0051 drops scheme_rankings and ranking_weights. First check the Home backend spec's mention of scheme_rankings (the app code appears not to read it).");
  add(d8, "after", "Look (the earlier lane layout, with the larger rank): each fund has a row with its logo and name and, per period, a dot on a line from best (left) to last (right) with the top quarter stretched in green. The rank (for example 4/38) keeps the larger size from the redesign. One group heading, 'Performance Ranking', and a different card heading.");
  add(d8, "after", "Banner copy: 'Your funds rank in the top quarter in 9 of 11 comparisons. A rank such as 4/38 means this fund is 4th best out of 38 funds in the same category. Lower is better.'");
  rep(d8, "frontend", "Replace FundRankingGroup", "Replace FundRankingGroup with a Performance Ranking group: the lane layout (a row per fund, a dot on a line per period) with the rank shown large, a tooltip with peer count and plan type, a not-enough-history state, and for index funds the disclaimer in place of ranks. Group heading 'Performance Ranking'; the card's own heading is 'Rank in your fund\'s category' so the title is not printed twice. Update GROUP_TITLES, RANK_WEIGHTS and its helpers, and the tests that name them. Print and mobile: per D12.");
  add(d8, "risks", "The print view and the phone app still draw the old Fund Ranking from the old payload (D12 option B), so the deletion must keep the legacy sections compiling or remove their Fund Ranking block together with the route.");

  /* ---- 09 Category Average Comparison ---- */
  var d9 = D("09");
  rep(d9, "after", "Cleaner layout: one card per fund", "Look (the earlier layout, decided 31 Oct): one card per fund; each period row shows a filled dot for the fund and a hollow dot for the category average on one scale, a coloured line for the gap (green when ahead, red when behind) and the exact figures beside it (for example +8.6 pts, 28.4% vs 19.8%). A summary at the top answers the question first; chips filter the cards (All funds, Behind somewhere, Ahead everywhere). Everything is open: no rank, no percentile, nothing to click.");
  add(d9, "after", "Banner copy (the plain wording is kept): 'Your funds beat their category average in 10 of 11 comparisons. Each number is your fund's return minus the average return of funds in the same category, in percentage points. Plus is better.' Known limit of this layout: when a gap is under about half a point the two dots almost touch, and the number beside the line carries the information.");
  add(d9, "after", "The category average is the simple average of all funds in the category and plan type (D4 option A). Funds with no AMFI size figure are no longer left out, so peer counts and averages can change from what users saw.");
  rep(d9, "risks", "D4 (weighted or simple average)", "D4 is answered (simple average): the displayed category averages will change for categories where large funds differ from small ones. List before-and-after averages for a real household before release.");

  /* ---- 10 Fund Quality Scores ---- */
  var d10 = D("10");
  add(d10, "after", "Clarification (31 Oct): only the Fund Quality Score is hidden and still computed. The composite Fund Ranking is not part of this item: item 8 replaces it and D36 option B deletes its code and tables.");

  /* ---- 11 Benchmark ---- */
  var d11 = D("11");
  add(d11, "after", "Decision D34, answered: option C (each fund's own factsheet benchmark) with option B (the fixed category mapping) as the fallback. D35 follows: a fund whose declared benchmark is missing or has no data shows the fallback, labelled as a proxy, with the declared name beside it.");
  add(d11, "backend", "Index data: replace the database enum of index names with a registry table (a text key, the NSE name, family, source, return type). A new Postgres enum value per index would need a migration each. Keep the 8 existing keys unchanged so stored payloads and the old UI still resolve. About 40 more NSE indices are config entries plus a one-time history fetch (about 45 requests per day, paced).");
  add(d11, "backend", "Name matching: factsheets print one index in many ways ('NIFTY 50 TRI', 'Nifty 50 Total Return Index', 'NIFTY 50-TRI'). A normaliser maps them to registry keys; scheme_benchmark stores the raw name, the matched key, the match quality (exact, proxy, none) and the month. Names that print only a price index ('NIFTY SMALLCAP 250 INDEX') are treated as the total-return series and marked.");
  add(d11, "backend", "Composite benchmarks (for example '50% NIFTY 500 TRI + 30% ...') are blends of several indices. They are built from the components with a stated rebalancing assumption, or shown as 'not available'. Decide per case in the Step 0 review; never invent the blend silently.");
  add(d11, "backend", "BSE indices (BSE 100, 200, 500, Sensex TRI) have no free source: map to the NSE counterpart labelled 'proxy: NSE' until licensed data exists. CRISIL series are not available: show the declared name and the fallback, labelled.");
  add(d11, "risks", "The niftyindices endpoint is not an official API. Names fail silently with an empty 200, so every new index needs a daily health alert; back-cast history for strategy indices is model data and must be labelled. Redistribution of index levels may need a licence: show derived returns only.");
  add(d11, "risks", "Whole factsheet review: do it as Step 0 now, before the plan, because it decides which indices, proxies and blends are needed; build the mapping during Run 3. See the factsheet check and Step 0 sections.");

  /* ---- 12 Switches ---- */
  var d12 = D("12");
  d12.where = ["new UI: Transactions page, Cash Flow Over Time card (features/mutual-funds/transactions/TransactionsPage.tsx, CashFlowStrip.tsx, CashFlowBars): the true counterpart of the old Investment & Withdrawal card", "old UI reference: features/analytics/InvestmentWithdrawalSection.tsx (five tiles, a 'Switched between funds' line with the Include switches button at its right, Monthly/Yearly toggle, bars, legend, SIP strip)", "backend: investment_withdrawal.py (switch totals already returned)"];
  d12.before = ["Old card: five tiles (Invested, Withdrawn, Net Invested, Current Value, Absolute Gain), then 'Switched between funds: none' with an outlined Include switches button at its right, then a bar chart and the SIP strip. The button's on/off state is hard to see.", "New Transactions card: four tiles (Invested, Withdrawn, Net switched, Net invested), bars that always include switched-out money in 'Withdrawn + switched out', a SIP banner and the ledger. No include-switches control and no 'Switched between funds' line.", "Performance page: four tiles inside the Returns card. Its first tile is labelled 'Total Invested' but shows net invested, a mislabel found while reading the code.", "With switches included the old screen shows invested + switched in and withdrawn + switched out; Net invested and Absolute Gain never include switches."];
  d12.after = ["Where: the Transactions card, in the same relative place as the old one: a line directly under the tiles, 'Switched between funds: ₹X in N switches' (or 'none'), with the control at its right.", "The control is a clear two-state switch that writes its state: 'Switches: Included' / 'Excluded', plus one line saying which figures change. Never colour alone.", "Included: Invested and Withdrawn tiles and the bars add switched in and switched out. Excluded: they do not. Net invested is unchanged either way, and says so.", "The always-on 'Withdrawn + switched out' bar label is made consistent with the switch.", "The PDF print stays 'Excluded'. Green button and focus ring rules apply."];
  d12.risks = ["Confirm D19: the placement moved from the Performance page to Transactions because that is the real counterpart.", "Fix or leave the 'Total Invested' label on the Performance page: it shows net invested. Small, but the same word means two figures.", "Mixed meaning of 'switches' across cards (Net switched tile versus the switch)."];

  /* ---- 13 Asset allocation ---- */
  var d13 = D("13");
  rep(d13, "after", "Four classes", "Five slices: Equity, Debt (including cash), Gold, Real Estate (REITs and InvITs) and Others (D6 plus your 31 Oct addition). No market-cap ring. Others is grey, last, hidden at 0%.");
  add(d13, "backend", "Others = positive derivative rows and rows the fund house leaves unclassified or labels other. Negative derivative lines are still ignored and counted in the coverage note, so Others never goes negative. Clicking Others lists the funds behind it.");
  add(d13, "tests", "A derivative row and an unclassified row land in Others; a negative futures row does not; Others at 0% is not drawn; the five slices add to 100 within rounding.");

  /* ---- Decisions of 31 Oct (second round) ---- */
  var d6 = D("06");
  rep(d6, "after", "The card and its link are gone", "Stock Concentration is removed from every screen (decided 31 Oct, earlier plan kept): the Overlap page card, the legacy desktop section, the PDF print view, the phone view, the link helper, their tests and fixtures. The backend curve (compute_concentration, ConcentrationPoint, total_stock_count) is left in place for now and removed in a later release, once a test confirms nothing reads it (Home reads its concentration facts from stored stock holdings, not from this field). The screen removal is deletion only, so it is the one exception to D12 (print and mobile otherwise keep the old layout). The Holdings page keeps its All Stocks table.");
  rep(d6, "backend", "Stop computing the curve", "Later release (the earlier plan, kept on 31 Oct): stop computing the curve and delete the payload fields after every screen has stopped reading them (UI first, backend second, so old clients never break). First confirm by test that Home does not read the field before deleting.");
  add(d6, "risks", "Read as: Stock Concentration goes from every screen now; the backend curve goes later. If 'everywhere' was also meant to include the Overall Stock Holdings table on Holdings, say so; the plan keeps that table.");
  rep(d13, "backend", "Decide the arbitrage toggle", "The 'arbitrage funds as cash' toggle stays exactly as today (decided 31 Oct).");
  rep(d12, "risks", "Fix or leave the 'Total Invested' label", "Decided 31 Oct: fix the label. The first tile of the Performance page Returns card is renamed 'Net invested', because it shows net invested. Tooltip and tests updated; no figure changes.");
  add(d12, "after", "The Performance page tile 'Total Invested' is renamed 'Net invested' so the word matches the figure (decided 31 Oct).");
  add(d5, "after", "Equity test (settled 30 Oct from the Step 0 counts): the SEBI Equity categories are included by name, in both stored spellings (about 80 funds held); index funds, Multi Asset, Balanced Advantage, Equity Savings and the Children's Fund (about 18 funds) are decided by the 65% data rule on their latest published portfolio; Arbitrage and debt are excluded. The category-list test must cover both spellings and 'Index Funds - Equity Funds'.");
  ans("06", "Decided 31 Oct: remove it from every screen now (card, legacy section, print, phone); the backend curve is removed in a later release, as in the earlier plan. The Holdings All Stocks table stays unless you say 'everywhere' meant that too.");
  ans("11", "Decided 31 Oct (recommended policy): BSE benchmarks show as a labelled NSE proxy; blended benchmarks are built from their components with a stated rule or shown as 'not available', decided case by case in the Step 0 review; derived returns only, never raw index levels.");
  ans("13", "Decided 31 Oct: the arbitrage-as-cash toggle stays as it is.");
  ans("12", "Decided 31 Oct: the 'Total Invested' tile on Performance is renamed 'Net invested'.");

  add(d11, "backend", "Price-endpoint check (Step 0, 30 Oct): the price endpoint echoes the index name in INDEX_NAME (its Index Name field is blank), so validation reads INDEX_NAME for price series and Index Name for total-return series. The Nifty 50 Arbitrage close can dip from one day to the next (2,747.05 on 30 Sep, 2,745.42 on 1 Oct), so it still has to be compared with a factsheet figure before it is used as a return series (S9).");
  add(d7, "after", "Phase B feasibility (Step 0, 30 Oct): the BSE bhavcopy works from the VM and its address pattern is verified; 96 equity stocks held by funds have no NSE symbol and 278 have no stored P/E, so Phase B is small (about a day). Phase C waits on S6 (the NSE filing endpoint, not yet tested).");
  ans("07", "Step 0 result (30 Oct): five houses print per-scheme P/E and P/B (Invesco, ITI, Kotak by hand; UTI and ABSL automatic); Edelweiss prints only the index's figures; no image-only pages in 4,355 scanned pages.");
  ans("05", "Step 0 result (30 Oct): staging households hold about 80 funds in SEBI Equity categories and about 18 hybrid or index funds that the 65% data rule decides.");

  /* ---- Plain-language steps: add the new points ---- */
  PLAIN["12"].plain = "A switch moves money between two funds of the same fund house. Users should clearly see whether switches are counted. The old screen had an 'Include switches' button whose state was hard to see, in a line just under the five tiles. In the new screens the matching card is Transactions, Cash Flow Over Time, which has no such control. We add a clear on/off switch with a visible word ('Switches: Included') in the same place, a line under the tiles.";
  PLAIN["12"].screen = [["Mutual Funds > Transactions > Cash Flow Over Time", "/portfolio/mutual-funds/transactions", "features/mutual-funds/transactions/CashFlowStrip.tsx"], ["Reference: the old Investment & Withdrawal card", "legacy analytics", "features/analytics/InvestmentWithdrawalSection.tsx"]];
  PLAIN["13"].plain += " Plus a fifth slice, Others, for anything that is not equity, debt (including cash), gold or real estate.";
  PLAIN["08"].plain = "Ranking means: among all funds in the same SEBI category, where does this fund stand? The Fund Ranking group on Other Analytics (a composite rating and a leaderboard) is replaced by Performance Ranking: for 1, 3 and 5 years each fund shows its rank as a large number such as 4/38, with a dot on a line that shows where it sits from best to last. The old composite rating and its code and tables are deleted (D36).";
  PLAIN["09"].plain = "The old section ranked each fund and showed a badge and text like '86th pct'. Now it is Category Average Comparison: no rank and no percentile, and for every fund each period shows a dot for the fund and a dot for the category average, a coloured line for the gap and the exact figures beside it.";

  /* ---- Answers boxes ---- */
  ans("01", "Answered 31 Oct: emails use the same template with new wording; the phone code is the stub and is shown on screen; green buttons are #22C55E with white text; every error state and the database swap are written out (Item 1 build section).");
  ans("02", "Decided 31 Oct (third round): back to the earlier table layout (split bar in the parent row, + opens member rows with the masked folio), with improved spacing. The member-card redraw is set aside.");
  ans("03", "Asked 31 Oct: what is the 'not classified' line? Explained in the rules section; kept as a short note (D8 option A).");
  ans("04", "Answered 31 Oct: yes, the main manager gets the full value (D7 option A). Cases with no main manager are in the rules section; D38 is answered (first listed, marked assumed). LinkedIn is ON HOLD: no table, no icon, no verification work for now.");
  ans("S", "ON HOLD (31 Oct): stopped SIPs are paused. D25 to D27 wait and no SIP fixes are built.");
  ans("05", "Answered 31 Oct: what the page shows with no funds or one fund in a category is defined in the rules section. D14: option A plus anything equity by definition.");
  ans("07", "Answered 31 Oct: Q1 to Q6 and D17. The portfolio line now uses the same method as the fund table (D39 asks about forward versus trailing). The mockup of this item is the one used everywhere.");
  ans("08", "Decided 31 Oct: the earlier lane layout, with the larger rank size from the redesign; one group heading and a different card heading; plain banner. Composite Fund Ranking deleted (D36 option B).");
  ans("09", "Decided 31 Oct (third round): back to the earlier dot-on-a-line layout with the plain banner; simple average (D4 A); logos. The gap-tile redraw is set aside.");
  ans("11", "Answered 31 Oct: option C with B as the fallback; whole factsheet review is Step 0; index data gap plan in Audit C.");
  ans("12", "Answered 31 Oct: same place as the old screen. In the new UI that is the Transactions card (D19, to confirm).");
  ans("13", "Answered 31 Oct: add a fifth slice, Others.");

  /* ---- Blast radius: migration cells ---- */
  BLAST.forEach(function (r) {
    if (r[0] === "01") r[5] = "Migration 0047 (flag, request table, OTP purpose); undone only by repeating the flow";
    if (r[0] === "04") r[5] = "Migration 0048 (drop the table)";
    if (r[0] === "07") r[5] = "Migration 0050 (reported valuation table, stock columns)";
    if (r[0] === "08") r[2] = "Medium"; if (r[0] === "08") r[5] = "Migration 0051 drops the composite ranking tables (D36 option B)";
    if (r[0] === "09") r[5] = "None (the index mapping lives in 0049)";
    if (r[0] === "11") r[5] = "Migration 0049 (scheme benchmark and index registry)";
  });

  /* ---- Timeline and runs: the 31 Oct plan ---- */
  TIMELINE.length = 0;
  TIMELINE.push(
    ["Now to 13 Nov", "Step 0 and Run 0 (you, the VM, then Claude)", "The first VM session ran on 30 Oct (results in the Step 0 section). Still open: the home and benchmark-matrix baselines (after 06:35 IST on a trading day), S6, S8 to S10, and the second factsheet capture after the 10 Nov job. Claude writes one handoff per run from the implementation plan.", "About 2 days of plan work and half a day on the VM, over two weeks of calendar time"],
    ["Runs 1 to 7", "Codex builds, Claude reviews, one run at a time", "Run 1 Allocation, Fund Manager (without LinkedIn) and Overlap; Run 2 Other Analytics (item 7 Phase A, ranking, category average, hide scores, composite deletion); Run 3 benchmarks and switches (stopped SIPs on hold); Run 4 consolidated holdings; Run 5 and 6 Head of Family; Run 7 the logo pass. Each run is checked locally before the next. Nothing is deployed in between.", "About 19 to 20 working days, plus 1.5 days of hand checks"],
    ["Optional", "Item 7 Phases B and C", "BSE price file for BSE-only stocks, and official filings for P/B. Only if Step 0 shows many funds rely on the computed path.", "1 day and 3 days"],
    ["After the last run", "Documentation update", "PRD-04, decisions, DEFERRED_FEATURES, schema documents, the Fund Ranking replacement list, session notes, register, deploy guide (migrations 0047 to 0051, forced recompute).", "About 1.5 working days"],
    ["Last step", "Staging, once", "One deploy of everything, one forced recompute, the timing scripts, then manager QA across all items, including the hand-over with two real inboxes.", "About 2 working days"],
    ["Total", "7 Codex runs and one staging", "Sequential, because one Codex session runs at a time.", "About 26 to 28 working days without Phases B and C, about 30 to 32 with them, or 5 to 7 calendar weeks including waiting. Stopped SIPs and LinkedIn are on hold and not counted. A planning estimate, not a promise."]
  );
  RUNS.length = 0;
  RUNS.push(
    ["Run 0", "Plan", "Claude only", "One implementation plan for all in-scope items, organised by run (confirmed 31 Oct), and one handoff per run; Step 0 items are written as gates; SIP fixes and the LinkedIn table are on hold.", "", "Owner reads and approves", "", "2 days"],
    ["Run 1", "Build", "Items 3, 13, 4, 5, 6", "Market cap note; asset class with five slices; Fund Manager cards and table with the main-manager rule (no LinkedIn, on hold); Overlap equity-only, category tab and empty states; remove Stock Concentration from every screen (the backend curve is removed in a later release).", "cap_allocation.py, asset_allocation_lookthrough.py, fund_manager_allocation.py, overlap.py, AllocationPage, OverlapPage", "Orchestrator checks, one adversarial review, one fix round", "About 30 files", "2 days"],
    ["Run 2", "Build", "Items 7 (Phase A), 8, 9, 10", "Valuation by Fund and the portfolio line on the same method (0050); Performance Ranking; Category Average Comparison (simple average, no rank); hide Fund Quality Scores; delete the composite ranking (0051).", "valuation.py, category_ranking.py, fund_ranking.py (deleted), recompute.py, Other Analytics groups", "Orchestrator checks, one review, hand check of figures", "About 40 files", "5 days, plus 0.5 day by hand"],
    ["Run 3", "Build", "Items 11, 12 (stopped SIPs on hold)", "Benchmark golden tests; factsheet benchmarks, index registry and new NSE indices, proxies, name normaliser (0049); the switch on Transactions.", "benchmark.py, benchmark_windows.py, benchmark_select.py, factsheet import files, investment_withdrawal.py, TransactionsPage", "Orchestrator checks, one review; deeper review if a number changes", "About 30 files", "4 days, plus 1 day by hand"],
    ["Run 4", "Build", "Item 2", "Consolidated holdings: the family table with a split bar and member rows (masked folios), roomier spacing.", "holdings.py, HoldingsTable, OverviewPage", "Hand check of every figure, adversarial and deeper review", "About 12 files", "2 days"],
    ["Run 5", "Build", "Item 1 backend", "Migration 0047, eligibility, four codes (phone stub), swap, undo, emails, audit.", "models/user.py, auth services, household_members.py, 9 files that read the Self row", "Adversarial plus deeper review (auth and data safety)", "About 25 files", "3 days"],
    ["Run 6", "Build", "Item 1 frontend", "Family page button, dialog with stub code, pending banner, re-consent wording.", "FamilyPage, auth screens", "Orchestrator checks, one review", "About 10 files", "1.5 days"],
    ["Run 7", "Build", "Logos, headings, buttons", "SchemeLogo on every listed screen, one heading per card, green token.", "about 30 frontend files", "Orchestrator checks", "About 30 files", "2 days"],
    ["Optional", "Build", "Item 7 Phases B and C", "BSE price file; official filings for P/B.", "stock_fundamentals_client.py", "One review", "About 15 files", "1 day and 3 days"],
    ["Docs", "After all runs", "Documentation update", "Includes the Fund Ranking replacement list.", "", "Owner reviews the diff", "", "1.5 days"],
    ["Staging", "Last step", "Deploy and QA, once", "Deploy, forced recompute, timing scripts, manager QA, hand-over test.", "", "Manager QA", "", "2 days"]
  );
})();
