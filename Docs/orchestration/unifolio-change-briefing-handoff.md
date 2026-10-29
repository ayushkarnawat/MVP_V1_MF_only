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
