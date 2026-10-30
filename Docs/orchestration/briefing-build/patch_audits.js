/* ===== 31 Oct patch: Audit B (category average backend change) and Audit C (gap 1 and gap 2) ===== */
(function () {
  function A(id) { return AUDITS.filter(function (a) { return a.id === id; })[0]; }
  var b = A("aud-b"), c = A("aud-c");

  if (b) b.blocks.push(
    { h: "Category Average Comparison: the backend change in detail (added 31 Oct)", p: [
      "Everything below is read from category_ranking.py and its readers. It covers removing the rank and percentile, and the switch to a simple average (D4 option A, answered 31 Oct). Nothing is built."
    ] },
    { h: "What goes, what stays, who else reads it", table: {
      head: ["Piece", "What it does today", "Change", "Who else reads it", "Effect on computing time"],
      rows: [
        ["Rank, percentile and category size on each fund (category_rank, percentile, category_size)", "Sorts the category by the blended score and gives each held fund a position.", "Removed from the calculation and from the stored payload.", "Only this section (screen, print, mobile, tests). Home reads only the 1-year return and 1-year category average.", "Almost none: a sort of at most about 1,150 numbers per fund, after the heavy part."],
        ["The blended return on each fund (scheme_return)", "Was the sort key; also printed in a sentence that is being removed.", "Removed from the payload. The blended 3Y/5Y calculation stays as an internal helper.", "The Fund Quality Score reads the same helper (the score keeps being computed, D32).", "None."],
        ["The sort helper _rank_and_percentile", "Does the sorting.", "Deleted. fund_ranking.py also imported it, but that file is deleted in the same release (D36 option B), and item 8 builds its own per-period rank.", "Nothing else after item 8 and the deletion land.", "None."],
        ["Weighted average using each fund's average assets (AMFI)", "Weights every peer's return by its size; a peer with no size figure is silently left out.", "Replaced by a simple average of all funds in the category and plan type, per period (D4 option A).", "Item 9 only. Check whether anything else uses the AMFI size lookup before removing it (the cost section reads TER and size from other tables).", "Slightly less work: one pass, no weights."],
        ["NAV history for every peer, on four dates", "The expensive part: reads each peer's NAV 1, 3 and 5 years back and today. Cached 15 minutes, shared across household scopes.", "No change. The always-open tables and the new Performance Ranking both reuse this cache.", "Performance Ranking, the Fund Quality Score.", "None. Removing the rank does not shrink it."],
        ["Stored payload and old rows", "JSON per scope and section.", "Add-first rule: the screen ignores the old fields; one forced recompute after the single staging deploy replaces the stored rows.", "Home, the fund page and the Insights engine read stored sections, so fields are removed only after the screens stop reading them.", "n/a"],
        ["Tests and fixtures", "test_category_ranking, the Other Analytics page tests, Home 'Worth a look' tests.", "Update: no rank or percentile fields; a simple-average golden test; Home still receives the 1-year figures.", "n/a", "n/a"]
      ] } },
    { h: "Numbers that will move, and the check before release", ul: [
      "Category averages change wherever large funds differ from small ones, because every fund now counts equally. Peer counts can rise by the funds that had no size figure.",
      "Funds under 3 years old are still left out of every period (the 3-year floor is kept, because relaxing it would change every average).",
      "Before release, list each held fund's category average before and after on one real household (Step 0, S11) and keep the list with the release notes."
    ] }
  );

  if (c) c.blocks.push(
    { h: "Gap 1 in detail: benchmarks the factsheets name that we hold no data for (added 31 Oct)", p: [
      "Of the 41 most-printed benchmark names, 16 NSE total-return series work today through the endpoint the app already uses (about half of all mentions), 12 more need a check or the right NSE name, 5 are BSE indices, 6 are CRISIL series and 2 are gold and silver prices. The factsheet check section has the full table."
    ] },
    { h: "How each kind is covered", table: {
      head: ["Kind", "What we do", "Needs"],
      rows: [
        ["NSE equity, strategy and sector total-return series (about 40 more indices)", "Add them to the new index registry as config entries and fetch each history once. One request per index per day, paced.", "Code only. Tested live: the endpoint serves them with the same request shape. Some names differ in spacing (for example the 50:25:25 index has no space after Nifty)."],
        ["Nifty 50 Arbitrage, Nifty 1D Rate", "Served by the price endpoint. Add after checking that the level behaves like a total-return series.", "Check S9, then config."],
        ["NSE debt, hybrid and savings indices", "Find the trading names or the endpoint (a browser network trace, about 30 minutes), then add as above.", "Check S8."],
        ["BSE indices (100, 200, 500, Sensex, sector)", "Show the NSE counterpart labelled 'proxy: NSE' on screen and in the data. Ask Asia Index (S&P DJI) about licensed total-return data.", "S10 licence enquiry. Until then a labelled proxy; never an unlabelled one."],
        ["CRISIL series", "No public data. Show the declared benchmark's name and the fixed category fallback, labelled. Do not rebuild a blend silently.", "A licence or data from the fund houses; ask (S10)."],
        ["Gold and silver price benchmarks", "A different data feed (a price series or a gold ETF as a labelled proxy). Deferred.", "A new small job and table."],
        ["Blends such as '50% Nifty 500 TRI + 30% ...'", "Build from the component indices with a stated rebalancing rule, or show 'not available'. Decide per blend in the Step 0 review.", "A written rule, then a test against a factsheet figure."],
        ["Names that print only a price index", "Treated as the matching total-return series and marked as such.", "A normaliser and a mark in the data."],
        ["Additional (Tier 2) benchmark", "Stored next to the Tier 1 benchmark; only Tier 1 is compared on screen.", "A second column."]
      ] } },
    { h: "Benchmarks we hold or can read but do not use today", ul: [
      "Nifty 100 and Nifty Smallcap 250 history is already in our data (migration 0045) but the category rule never picks them: a Large Cap fund gets Nifty 50 and a Small Cap fund gets Nifty 500. Option C uses what the fund's own factsheet names.",
      "Nifty Next 50 and Nifty 200 are held and unused by the same rule.",
      "Every factsheet we could read prints a benchmark in text, but nothing reads it yet. WhiteOak, UTI and the multi-scheme layouts need positional extraction.",
      "The index funds' tracked index is printed in the same line, so the index-fund mapping (item 9) and the benchmark (item 11) come from one new table."
    ] },
    { h: "Gap 2 in detail: factsheet gaps (added 31 Oct)", p: [
      "About 689 live funds sit in the 10 hand-import houses and about 33 have no factsheet at all. The scan of the 11 hand-import PDFs shows that every one of them prints its benchmark in text, so the benchmark can be read from the same files the hand import already uses; it does not add a new download."
    ] },
    { h: "How gap 2 is covered", after: [
      "Hand-import houses: the import command reads managers today. It is extended to read the benchmark (and P/E and P/B for Invesco, ITI and Kotak) from the same PDFs. The import stays a monthly manual step; the missed-month alert (Priority 1) is built in Run 2.",
      "Automatic houses: the same readers run inside the monthly job. A house that fails that month keeps last month's mapping, marked with its age.",
      "No factsheet (AlphaGrep, IL&FS IDF, Lakshya, Monarch) and stale (Bajaj Finserv): the fund's benchmark is read from its scheme information document by hand once and stored with source 'document', or the category fallback is used and labelled.",
      "Every fund shows where its benchmark came from: factsheet, document, proxy, category fallback or none. The monthly check records how many funds are in each group; that is the number to drive down.",
      "Funds with no declared benchmark and no usable fallback (some debt and hybrid funds) show no benchmark, as the fund page already does, instead of Nifty 500."
    ] }
  );
})();
