# Unifolio change briefing: handoff

**Date:** 2026-10-29 · **Status:** planning only. Nothing is implemented. Nothing is committed.

## What this is

The product team sent a PDF, `UNIFOLIO_Developer_Change_Requirements.pdf` (13 change requests, Oct 2026; it is at
`C:\Users\Dell\Downloads\`, outside the repo). In the previous session we read it, compared every requirement
with the current code, and built a briefing: what each change means, what already exists, difficulty, scope,
how to build it, what it touches, and open decisions.

The briefing is `Docs/orchestration/unifolio-change-briefing.html` (standalone, open it in a browser). It was
first published as a private Claude artifact; the link only works for the original account, so use this file.

## The 13 changes in one line each

1. Head of Family: do not auto-assign; add change flow with OTP from old and new head.
2. Family holdings tab: consolidate the same fund across members, with a + expand per member and folio numbers.
3. Market Cap Allocation: only Large, Mid, Small, totalling 100%.
4. Fund Manager: primary manager only, with name, AMC, allocation %, amount, LinkedIn link.
5. Equity Fund Overlap: simplify, add an info button, highlight above about 35%, DIY picker for 2 to 5 funds, equity funds only.
6. Remove the Stock Concentration block.
7. P/E and P/B: fund-wise, info button, disclaimer, verify the data.
8. Performance Ranking: rank within SEBI category for 1, 3, 5 years, shown as Rank / Total.
9. Category Average Comparison: fund vs category average; index funds vs their underlying index.
10. Remove the Fund Quality Scorer and Composite Ratings.
11. Benchmark Comparison: audit that returns use exact cash flows and one consistent method.
12. Investment and Withdrawal: make the include-switches state clearly visible.
13. Look-Through Asset Allocation: Equity, Gold, Debt, Real Estate; no market cap split.

## Findings that matter (from a read-only code scan)

- **Already built, fully or mostly:** item 12 (toggle exists, default off; only the visible state is weak), 7.1 (app is MF-only), 11 (benchmark XIRR already replays each transaction against the index), 1.1 (CAS-detected people get no relationship), and the Large/Mid/Small buckets in item 3. Items 5, 8, 9 and 13 have working versions that need reshaping.
- **Hardest:** item 1 (no "head" field exists; the account owner's `self` row is assumed fixed in at least five places; phone OTP has no real SMS provider) and item 2 (per-holding XIRR and folio numbers do not exist; collides with the redesign).
- **Easiest:** items 3, 6, 12 (small); item 10 is conceptually easy but touches about 20 files.
- **Stock Concentration (item 6) is a block inside the Overlap card, not a tab.**
- **No migration is needed for most items:** analytics results are stored as JSON per section and recompute daily. Migrations are needed only for new columns or tables (LinkedIn, a head flag, dropping score tables).
- **Every analytics UI change must be made three times:** desktop, print and mobile views.
- **Factsheets carry no LinkedIn links.** They give manager name, start date, experience and sometimes a role. The only "LinkedIn" text found in saved factsheet text is a fund house's own social-media footer. Clickable links inside the PDFs were not checked.

## Branch caveat (decide first)

The repo's `feat/shell-nav-switch` branch lacks the redesign work on `fix/holdings-open-fund-page` (windowed
1Y/3Y/5Y benchmark returns, fund page, fund-vs-fund overlap). Items 2, 8, 9 and 11 overlap it. At the moment this
handoff was written the main checkout was on a detached HEAD at `origin/leapswitch-redesign`, so check
`git status` and `git branch --show-current` before doing anything.

## The nine open decisions (my recommendation first)

The HTML has full options with pros and cons. These are the picks:

| # | Question | Recommendation |
|---|---|---|
| D1 | Which branch to build on | The redesign line, if it is the one that ships |
| D2 | How to remove Scorer and Composite Ratings (item 10; conflicts with PRD-04 and decisions of 2026-08-13 and 2026-10-06) | Hide in UI and stop computing; keep code and tables |
| D3 | What a "head" is and how both people confirm (item 1) | Separate head flag; email OTP for both at launch |
| D4 | Category average (item 9) | Simple average |
| D5 | Ranking index funds (items 8, 9) | Do not rank; compare to their index |
| D6 | Cash and REITs in asset allocation (item 13) | Fold cash into Debt; label "Real Estate (REITs and InvITs)" |
| D7 | Manager "amount" and who is primary (item 4) | Full fund value to the primary, with a "managed with others" note |
| D8 | Cap buckets to 100% (item 3) | Normalise over classified stocks, with a note on the unclassified share |
| D9 | DIY overlap picker scope (item 5B) | Any fund with published holdings, via search |

**LinkedIn (4.4):** recommended a hybrid: hand-verified links only for managers of funds users hold, stored once per
manager and fund house with a "verified on" date; show nothing when unsure; no scraping. The number of distinct
managers in our data has not been counted yet, and it decides how realistic a manual list is.

## Suggested build order

1. Quick wins: items 12, 6, 10 (after D2), 3, 5A, 7.4 and 7.5.
2. Core analytics: 5C then 5B, 13 and 7.3, 8 and 9 together, 11, 4.
3. Big and risky: item 2, then item 1.

## Project rules to follow

- Read `AGENTS.md` first, then `CLAUDE.md`. Ask before assuming anything the docs mark as open.
- If a PRD, ADR or the schema conflicts with a request, stop and say so; do not resolve it silently.
- TDD is mandatory (red, green, refactor). Money is `Decimal`.
- Do not implement or commit until the decisions above are answered and the user says go.

## Where to resume

1. Open the briefing HTML and read the decisions section at the end.
2. Get the user's answers to D1 to D9 and the LinkedIn choice, starting with D1.
3. Then write the implementation plan, in the order above, with a test-first task list per item.

## Update 2026-10-29 (later)

- D1 answered: all work goes on `leapswitch-redesign` (worktree `C:\Users\Dell\Desktop\MVP v1\wt\docs`; use `git.exe` for git there from WSL).
- The briefing HTML now has: deep dive parts 1 to 3 (corrections found on the redesign line, per-item flows, backend/frontend/database changes, ER diagrams, tests first), a plain-language walkthrough and step-by-step build list per item, the screen and route for every change with design-PDF mockups, an extra item on Stopped (cancelled) SIPs, a blast-radius table, a timeline with effort estimates, a loading-time analysis, and new questions D10 to D31.
- Item 2 (consolidated holdings): stakeholder explanation and sketch added. It applies in the family (combined) view (D22). A 24 s stakeholder video (competitor Family Group table) was reviewed by frames only; the audio was not transcribed.
- Stopped SIPs: current logic documented from `backend/app/services/dashboard/sip.py`; likely causes of wrong "stopped" rows are step-up amounts, stale statements, bounced instalments, and sold funds. Needs the stakeholder's real examples to confirm (D25 to D27).
- Still nothing implemented.

## Update 2026-10-29 (answers)

- Answered: D1 (build on `leapswitch-redesign`), D3 option B, D7 (amount = rupee value behind the allocation percentage; follow-up still open on how a co-managed fund is shared), D10 option B (the sign-in moves to the new head), D20 (folio numbers masked only).
- D10 B and D3 B pull against each other (moving the sign-in makes relationship labels wrong unless flipped, D29). Needs the owner's confirmation. Follow-ups D28 to D31 (phone number, labels, new head already has an account, undo window) and an edge-case table are in the briefing.
- Only existing members can be head for now; the "make the new member head at Add Member" option is in `DEFERRED_FEATURES.md`.
- The briefing now has after-change mockups for every item and a screen map. The reference video was deleted from the repo and no frames from it, nor pages from the design PDF, are embedded.

## Update 2026-10-29 (hold and run plan)

- Items 5 (equity overlap) and 10 (remove Scorer and Composite Ratings) are ON HOLD. Questions D2, D9, D11, D14 and D15 wait with them. Item 6 (remove Stock Concentration) is not on hold.
- Execution is the Claude (orchestrator) plus Codex (worker) method used for Sub-project 1, Sub-project 2 and the analytics fixes. Six Codex runs, sequential: Run 1 items 3, 13, 4, 6; Run 2 items 7, 8, 9; Run 3 items 11, 12 and the stopped-SIP fixes; Run 4 item 2; Run 5 item 1 backend; Run 6 item 1 frontend. Nothing is deployed between runs: staging happens once, as the last step, after all runs and the documentation update. About 17 to 19 working days. Detail and estimates are in the briefing's "Timeline and effort" section.
- Recommendation: one implementation plan covering all in-scope items, organised by run (Sub-project 1 used one plan per attribute and Sub-project 2 two plans, so this is a choice, not a rule). Not written yet.
- The stakeholder sketch image was removed from the briefing. Answered questions now show a bold ANSWERED badge and the chosen option.

## Update 2026-10-30 (stakeholder changes and audits)

- Item 5 reduced to a category tab on the Overlap page (drop-down: Large, Mid, Small, Flexi Cap); page look and bands 20/40 unchanged. No 35% highlight, equity filter or DIY picker. Joins Run 1 (shares the page with item 6).
- Item 10 reduced: hide only "Fund Quality Scores" on Other Analytics, stop computing it, keep all code behind two switches. Trap found: the frontend store polls every 3 s while any name in `ANALYTICS_SECTION_NAMES` is missing, so the name list must switch with the calculation. Joins Run 2.
- Item 9: renamed Category Average Comparison, rank removed, tables open. Item 8 (Rank/Total table) withdrawn (D33 to confirm). The user wrote "item 4 fund overlap"; it is item 5 here.
- Audits A to D added (what "13th pct, Top 87%" means; effect of removing rank/score on backend and time; benchmark choice for item 11; contributing funds in the asset-class card). Read from code only; nothing run on real data.
- Solved badges: D2, D5, D9, D11, D14, D15. New questions: D32 (score consumers), D33 (item 8 vs 9), D34 (benchmark mapping).
- Nothing implemented; nothing pushed.

## Update 2026-10-30 (second round of stakeholder answers)

- Item 5: 5C kept (overlap for equity funds only) plus the By category tab. D14 reopened (which categories count as equity). Today's code has no equity check.
- Item 8: back as first proposed. Performance Ranking (Rank / Total for 1, 3, 5 years) replaces the Fund Ranking group (composite rating, leaderboard). D36: delete or only stop using the old composite code.
- Item 9: rank badge and percentile text removed from screen and backend, including their calculation. Blended return stays as an internal helper for the Fund Quality Score.
- Item 10: Fund Quality Scores hidden on Other Analytics only; the Individual Fund score card stays. The score keeps being computed (fund page, Home, Insights read it). D32 reworded.
- Item 11: option C. Each fund compared with the benchmark in its own factsheet. New table scheme_benchmark (migration 0049, shared with the index-fund mapping). Many declared benchmarks have no index data; D35 asks what to show. Estimate now about 19 to 21 working days.
- Item 7: today's valuation section kept; excluded lists collapsible; fund-wise section below.
- New audits: E (how P/E and P/B are made) and F (how the category average is calculated). Mockups for items 5, 7, 8, 9, 10 were redrawn from the real components.
- Solved: D2, D9, D11, D15, D16, D33. Answered: D34. Nothing implemented; nothing pushed.

- D5 answered (option A): index funds are not ranked in Performance Ranking; the row shows a disclaimer that their comparison is in the benchmark comparison.

## Update 2026-10-30 (late)

- Item 7: fund-wise P/E and P/B = factsheet value where printed, otherwise computed from NSE/BSE data; new section "Item 7 build" with verified source tests (BSE API blocked, NSE Integrated Filing works for P/B, BSE price file works).
- UI mockups redesigned for all items (summary headlines, dumbbell and rank-lane visuals, overlap category cards, Other Analytics summary board).
- Stale wording cleaned across the briefing: screen lists (item 9 no longer lists the Performance block; items 3, 11, 13 now list Home or the fund page where they change), plan total about 19 to 21 working days, items 5/8/10 status text.
- Nothing implemented; commits are documentation only.

## Update 2026-10-31

- Item 1: Family Members list kept as today; only a Change Head of Family button is added. Both people verify both email and phone (four codes). New D37: no SMS provider exists yet (blocks item 1). D28 solved. Plan about 20 to 22 working days.
- Item 3: donut kept. Item 4: Fund Manager Allocation has Cards (default) and Table; Donut and Bar Chart removed.
- Item 10 and 11 mockups scoped back so nothing outside the item changes. Mockups use the app palette (palette-tokens.css) and fonts (DM Sans, Manrope).

## Update 2026-10-31 (second round: answers, research, Step 0, run plan)

**State:** planning only. Nothing implemented. The briefing HTML is the source of truth (the Claude artifact is a copy). All decisions are answered or solved except D25 to D27 (stopped SIPs), which are ON HOLD together with LinkedIn (item 4.4). Item 6 is decided: Stock Concentration is removed from every screen now (Overlap card, legacy section, print, phone), and the backend curve (compute_concentration, ConcentrationPoint, total_stock_count) is removed in a later release once a test confirms nothing reads it, as in the earlier plan. The Holdings All Stocks table stays.

**Answers recorded:** D38 first listed is main, marked assumed. D39 the portfolio P/E line uses one basis (trailing). D40 the five item 1 design points accepted (Self moves to the new head in the same transaction; no PAN means not eligible; origin unchanged; onboarding answers inherited; purpose column plus a request table). D19 the switch goes on Transactions, Cash Flow Over Time (not Performance). D2 only the Fund Quality Score is hidden; the composite Fund Ranking is replaced by Performance Ranking and deleted (D36 option B, migration 0051). D12 option B (the new UI has no PDF export). D4 to D8 option A. D14 category allowlist plus the 65% equity definition; judgement hybrids excluded until the S7 counts arrive. D17 harmonic mean with a plain-words disclaimer. Q1 to Q6 of item 7 answered; Phases: Step 0 first, then A, B, C. Item 13 keeps the arbitrage toggle and gains a fifth slice, Others. Item 12 also renames the Performance tile "Total Invested" to "Net invested". Item 11 policy: BSE as a labelled NSE proxy; blends built with a stated rule or "not available"; derived returns only. Factsheet PDFs are kept for three months. Plan shape: one implementation plan organised by run.

**New sections in the briefing:** Item 1 build (database swap table by table, the single transaction, emails, stub code display, error table, label table); Item 3, 4 and 5 rules (market cap note, main-manager cases, equity definition, empty states, Others slice); Design rules (fund logos everywhere, one heading per card, plain banners, green buttons #22C55E with white text, real numbers first); Item 7 methodology gaps (19 rows); Monthly factsheet check; Step 0 (S1 to S12 with commands); Execution playbook; Audit B (category average backend change) and Audit C (gap 1 and gap 2). Mockups redrawn for items 1, 3, 12 and 13; items 2, 8 and 9 were redrawn and then returned (third round, 31 Oct): item 2 is the earlier table with a split bar and roomier spacing, item 8 is the earlier lane layout with the larger rank, item 9 is the earlier dot-on-a-line layout with the plain banner.

**Factsheet findings (scanned 31 Oct):** only five houses print a per-scheme P/E and P/B: Invesco (forward), ITI, Kotak (hand-import) and UTI, ABSL (automatic). All benchmarks print in text. No image-only pages in 94 PDFs (about 7,100 pages). Cached files are from 9 to 10 Oct; Step 0 repeats the scan on the VM's current files.

**Run plan (about 26 to 28 working days; 30 to 32 with item 7 Phases B and C):** Run 0 plan; Run 1 items 3, 13, 4 (no LinkedIn), 5, 6; Run 2 item 7 Phase A, 8, 9, 10 and the composite deletion (0050, 0051); Run 3 items 11 and 12 (0049); Run 4 item 2; Run 5 and 6 item 1 (0047); Run 7 the logo pass; then docs, then staging once. Migration 0048 is reserved for LinkedIn and not built.

**Next:** write the implementation plan and one handoff per run (model-orchestration method), with Step 0 items as gates. The VM session is scheduled during Run 1; a second factsheet capture follows the 10 Nov job. Helper scripts (factsheet scan, fetch-and-keep wrapper) are embedded in the briefing's Step 0 section and are not in the repo.

## Update 2026-10-31 (first VM session, 30 Oct: results)

Run from the manager's laptop by the manager's Claude in two sessions (bundles `results.tgz`, `results2.tgz`). Full tables are in the briefing's Step 0 section.

- **Factsheets (S2, S3):** 36 of 40 automatic houses accepted, 38 fetched, 48 PDFs (288 MB, 4,355 pages), no image-only page. Not accepted: Angel One (403), Sundaram (no factsheet link), SBI and Mahindra Manulife (files older than 45 days). Per-scheme P/E and P/B: ABSL and UTI automatically (plus Invesco, ITI, Kotak by hand). Edelweiss prints only the index's figures. Every house prints a benchmark in text.
- **Sources (S4, S5):** NSE P/E file, security master, niftyindices total-return and price endpoints, AMFI and the BSE bhavcopy all answer 200 from the VM (the bhavcopy address pattern is verified); the BSE API answers 403. S6 (NSE filing endpoint) is still untested.
- **Counts (S7):** 565 distinct managers (LinkedIn on hold); 278 equity stocks with no stored P/E; 96 with no NSE symbol; 32 categories held (about 81 funds in SEBI Equity categories, about 8 hybrids and 10 index funds decided by the 65% data rule); seven houses with no manager data (about 420 scheme rows), Carnelian missing from the registry.
- **Recompute (S11):** all users 6 min 10.9 s; one user was skipped because of a stale claim left by a stopped run, cleared by a 4 min 7.5 s one-household recompute. Never stop a running recompute.
- **Timings:** month detail 243 to 261 ms (pass); fund page 74 to 107 ms per call (over 50 ms, already known); home and benchmark matrix not measured (today's NAV not stored; the scripts abort on writes). Re-run after 06:35 IST on a trading day.
- **Plan changes:** gates G1, G3, G4 received and G7 mostly received; Task 1.4 uses the 65% data rule for hybrids and index funds; Task 2.11 (Phase B) is a go and Task 2.12 (Phase C) waits on S6; Run 2 waits for the home and benchmark baselines; the staging step carries the recompute lessons.

## Update 2026-10-31 (factsheet state review)

New file `Docs/orchestration/2026-10-31-factsheet-state-and-benchmark-gaps.md` (with a "Revision 2" section) holds the October status per house, P/E and P/B coverage, benchmark gaps by family and the VM commands. New scripts (owner's `step0` folder, not in the repo): `check_publication.py` (has each automatic house published October) and `verify_benchmark_sources.sh` (niftyindices names, Arbitrage S9, source reachability). Decisions: the owner supplies October files by hand where a page shows them; four houses move to hand import (plan Task 1.5b); CRISIL, BSE and gold/silver are built only if a free permitted source is found, otherwise the category fallback. New finding: niftyindices terms of use prohibit automated collection without written consent (S10); needs an owner decision.

Scope change (30 Oct, later): the next session (the manager's account) also writes the final implementation plan, a readiness review and the execution handoff (prompt file: `2026-10-31-step0-completion-session-prompt.md`, steps E to G). Handoff documents were previously held back for this session only.

## Update 2026-10-31 (evening): Step 0 closed, final plan, readiness review, execution handoff

**State:** planning only; nothing implemented. Step 0 is done. Evidence and every decision are in `Docs/orchestration/2026-10-31-factsheet-state-and-benchmark-gaps.md` (**Revision 3**, which wins over Revisions 1 and 2). The final plan is `Docs/superpowers/plans/2026-10-31-change-requests-implementation-plan.md` (Revision 3 banner); the proof of readiness is `Docs/superpowers/plans/2026-10-31-readiness-review.md`; the hand-over to the executing session is `Docs/superpowers/plans/2026-10-31-execution-handoff.md` (with the prompt to paste). Run 1 handoffs exist: `Docs/orchestration/cr-r1-*-handoff.md` (five files). Runs 2 to 7 handoffs are written at the start of each run.

**Decisions recorded (owner, 31 Oct):**
- **S10 ignored.** Staging keeps using the niftyindices endpoints; the owner writes to NSE Indices separately; privacy policy and terms get a note before production. No release gate.
- **S9 closed:** Nifty 50 Arbitrage's price series equals the printed total returns (7.33, 7.42 to 7.43, 6.69) and is used as a total-return series. Built in Run 3, Task 3.1.
- **S8 closed:** debt A-I/A-II/A-III, Hybrid Composite Debt and Equity Savings indices are not available from any free source. Rule: use whichever is more accurate: printed benchmark returns for the fund page's returns table (the only place that needs fixed periods only), the labelled category index for everything that needs a daily series (chart, beta, peers, Home wealth chart, transaction-date XIRR). Checked in the code on 31 Oct (report R3.8). Today only equity funds have a benchmark at all.
- **Gold and silver:** a gold or silver ETF's NAV from our own history as a labelled comparison, with a 0.5-point check against a printed gold return (Task 3.1b); otherwise printed returns only.
- **The 18 undecided funds:** the 65% rule on **net** domestic equity after hedges; a fund with no holdings data is left out with a plain sentence, not "excluded: no data".
- **Plain-words rule for every label** (no "TRI", "proxy", "fallback"; blends explained in one sentence).
- **Manual import for this month only** for Angel One, SBI, Sundaram and Mahindra (Task 1.5b): the registry is not changed; a `--this-month-only` flag (and `--as-of` for the 45-day staleness check); the importer must be run at the staging deploy and checked in the live app; next month the automatic job is the test; after a second failed month the owner moves a house to manual. Files are on the VM (`/home/deploy/factsheets-oct2026`).
- **P/E and P/B with the AMC data and the benchmarks:** one monthly factsheet import feeds managers, P/E and P/B and benchmarks; the Run 1 import happens before Runs 2 and 3 so they have the October files to test against.
- **S6:** NSE list and detail addresses work but the detail has no book value; Task 2.12 starts with one XBRL check.

**Findings worth knowing:** (1) the factsheets the owner uploaded are all September data, which is "the October issue"; Axis has none and stays on 31 Aug; (2) nine houses were hand-imported and the monthly job ran (35 processed, 5 failed); Sundaram has zero stored manager rows; (3) **Sundaram has a reader** (Revision 2 was wrong); (4) the importer's own check **rejects the SBI passive and Mahindra files** because both houses changed how they print fund managers; Sundaram, Angel One and SBI active are accepted; (5) an independent review of the plan found 8 groups of problems, all fixed in the plan (readiness review section 4); (6) the VM's `reference_period` is the import month, not the data month.

**Next:** hand the execution prompt to the intern; Step 0 of execution is the starting commit, the Codex clone and the cheap Git probe, then Run 1 Task 1.5b step 1 (local reader probe). The manager measures the G2 baselines after 06:35 IST on a trading day before Run 2. Re-run `check_publication.py` on 3, 6 and 10 Nov (later). The briefing page and a new artifact copy carry these results (section "Step 0 closed").
