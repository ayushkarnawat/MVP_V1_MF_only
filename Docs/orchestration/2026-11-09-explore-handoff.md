# Explore feature: planning handoff (9 Nov 2026)

**Status:** planning paused, not finished. Nothing is built. No code, no migration, no config was changed. This document lets a fresh session resume exactly where the last one stopped.
**Branch:** `leapswitch-redesign` (worktree `C:\Users\Dell\Desktop\MVP v1\wt\docs`). GitHub account in use: `aditi-unifolio`.
**Owner:** Aditi (aditi.shanbhag@unifolio.in). Her counterpart on the repo is Ayush (`ayushkarnawat`).

## 1. What Explore is, in the owner's words

A signed-in user should be able to **explore the market**: see what other mutual funds exist apart from the ones in their own portfolio, how they work, and basic analytics on them. The owner clarified on 9 Nov, after the last workbook version was published:

> The point of Explore is not just to compare with my current holdings. The main point is to see what other things I can do, to literally explore the market.

**Consequence for the plan (not yet applied to the workbook).**
- Discovery is the primary job: search any fund, browse categories and fund houses, learn how categories work, screen and compare. The portfolio lens (held badge, overlap with my portfolio) is secondary and optional, not the purpose.
- Q1 in the workbook still reads "Learn, then compare with my holdings" (option C, chosen). The owner's clarification means that answer should be reworded or reopened. Ask her which: reword C to "Explore the market; the portfolio is a light lens", or reopen Q1.
- Q12 ("when does overlap with my portfolio ship") loses urgency. My earlier pick was Phase 2; it can now be Phase 3 or dropped.
- The home mockup's "Your portfolio, for context" strip is optional and should not be the first thing on the page.
- Open question for her: does "what other things I can do" mean only mutual funds (the MVP is MF-only), or also other instruments? Assume MF-only unless she says otherwise.

## 2. What exists (read these first)

| File | What it is |
|---|---|
| `Docs/orchestration/2026-11-09-explore-feature-decisions-v2.html` | **The main deliverable.** About 270 KB self-contained workbook: feasibility, hi-fi UI mockups, flows, API, data model, nightly jobs with time and cost, frontend changes, phasing, deploy, compliance research, prior art, risks, conflicts, 16 decisions. **Untracked, uncommitted.** |
| `Docs/orchestration/2026-11-09-explore-feature-decisions-v1.html` | The earlier overview. Superseded by v2. Untracked. |
| `Docs/orchestration/2026-11-09-search-bar-planning.html` | The other session's page-wise search plan (committed in `733fc8bf`). Source of the mockup kit and look. |
| `Docs/orchestration/2026-11-09-explore-handoff.md` | This file. Untracked. |
| Published artifact (private to the old account) | https://claude.ai/artifact/PKas6ffafN7dinTUvcRcL1 (version 4). A new account cannot open it. Use the repo HTML. |

The user will commit these herself. **Do not commit or push unless she says so.**

## 3. Decisions so far

Answered by the owner (shown locked in the workbook, with a "Chosen" badge on her pick):

| Q | Answer | Note |
|---|---|---|
| Q1 | Learn, then compare with my holdings | **Being clarified, see section 1.** |
| Q2 | Signed-in users only, for now | Public Explore is a later, separate project. |
| Q5 | Hide or badge funds the user holds | Her note: a "You already hold this fund" badge. I read it as a badge, held funds stay visible. |
| Q11 | Plan now, build after Priority 1 and the search design | Priority 1 deadline was 10 Nov 2026 06:00 (fund-manager factsheet access). |

Still open (each has options, detail and my pick in the workbook): Q3 catalogue, Q4 score and ranking posture, Q6 placement and name, Q7 "how it works" content, Q8 missing data in lists, Q9 new table and nightly jobs, Q10 first slice, Q12 overlap timing, Q13 fund page route, Q14 job schedule and host, Q15 search endpoint, Q16 return calculation convention.

My picks, for reference: Q3 Direct Growth equity and hybrid first; Q4 score on fund pages, no default rankings; Q6 main sidebar item named "Explore"; Q7 template blurbs plus 37 one-line SEBI definitions; Q8 show with a "Limited data" chip; Q9 phased (table after Phase 1 measurements); Q10 search plus fund page first; Q12 Phase 2 (now probably later); Q13 new `/explore/funds/:schemeId` route; Q14 06:17 and 06:45 on both hosts; Q15 Explore builds market-wide search and shares the normaliser and dropdown with the Search Plan; Q16 use the fund page's return convention everywhere Explore displays returns.

## 4. Key findings (from five investigations on 9 Nov)

**Feasibility.** Of the 15 analytics in the PDF, 8 already work for any single fund with no user data, 3 need a small wrapper, 2 are portfolio-level with a browse twin (AMC, category), 2 are user-only (XIRR, investment and withdrawal). The individual fund page is fully built and its fund-level routes already serve any fund; only `/fund-page/{id}/summary` returns 404 for a fund nobody holds (`backend/app/services/fund_page/summary.py` line 104), which makes the whole page show "Fund not found". No search, list or screener endpoint exists.

**Catalogue.** The AMFI file (6 Oct) has 14,356 rows; about 8,786 are live; 2,179 distinct funds; 128 category-and-plan pools with 4,238 fund series; 23 pools under 5 funds. The `is_active` flag is not a liveness flag (39% are dead funds with 2018 to 2022 prices).

**Prices.** The daily 06:00 job refreshes only held funds plus their category peers. AMFI's `NAVAll.txt` (about 1.5 MB, one request) already carries every scheme's latest price; the parser reads it and throws the price away. One request can replace about 14,000 per-fund downloads.

**Proposed new pieces.** Table `explore_fund_metrics` (one row per fund, overwritten nightly, about 25 MB with indexes), migration 0054 (and a 2027 price-table partition, which does not exist today), J1 price top-up at 06:17 IST, J2 metrics job at 06:45 IST (estimated 3 to 6 minutes, plan 5 to 10; never run), J4 freshness check at 08:30, J3 weekly gap repair optional. Estimated AWS cost about $0.65 a month against a $68.46 bill; VM cost ₹0 extra if it fits (memory and disk are the limits, the VM root disk resize is still pending).

**Frontend.** React 19, Vite, react-router 7, one auto-discovered route file per route under `src/shell/routes/`. A new main menu row needs the contract (v1.7) change note and both reviewers (CODEOWNERS), plus edits to `registry.test.ts`. No pagination, debounce, combobox or shared sortable table exists. Two existing bugs a not-held page would expose: `StatBand.tsx` line 54 and `InvestmentDetails.tsx` line 528 read `selectedMember` without checking the view mode.

**Compliance (research only, not legal advice, not independently verified).** No SEBI text says a formula-based ranked list is investment advice, and none says it is not. Sharpest indirect risk is Regulation 16A (ties with regulated entities). Peers split: Morningstar India registered, Value Research and Advisorkhoj disclaim. SEBI categorisation circular of 26 Feb 2026 lists 40 categories (37 need explainers). A lawyer must decide; the workbook lists wording rules and open legal questions.

**Two returns conventions** exist in code (whole-year CAGR in the scorer and ranking; day-count annualised on the fund page). Lists must not mix them (Q16).

## 5. The Search Plan finding

The other session's plan (`2026-11-09-search-bar-planning.html`) is page-wise and searches only the family's own data. It dropped the "All funds" group from decision L39 and keeps the top-bar box as "Ask Mira". So market-wide fund search is Explore's to build. Explore should reuse its dropdown look and the single normaliser, not duplicate them.

## 6. Mockups

Section 3 of the v2 workbook has hi-fi mockups in the app's own look (shell, tokens, DM Sans and Manrope, light and dark toggle), built with the Search Plan's mockup kit (`.m-*` classes, with its `.n` class renamed `.mn` to avoid clashes). Screens: home, search states, category page, fund page not held and held, screener, compare, what-if, states. Fund names and numbers are made up. The outlines for new and changed items are off by default with a toggle. If you edit them, edit the HTML directly; the generating script was a temporary file and is not kept.

## 7. How to work with this owner (project rules that apply)

- Read `AGENTS.md` and `CLAUDE.md` first. `CLAUDE.md` says to invoke the `task-observer` skill at the start of a task session, and to ask before assuming anything the docs mark as open.
- Planning only: do not implement anything. The owner wants brainstorming, detail and decisions first. Use the `superpowers:brainstorming` skill.
- When a PRD, ADR or schema conflicts with the plan, say so; do not resolve silently. Conflicts found so far are in workbook section 18.
- She wants artifacts in the same house style as earlier workbooks, in as much depth as possible, with options, "what it does", "how we build it", pre and post flows, and cost. She asked for real UI mockups, not wireframes.
- Answered questions keep the same layout as open ones, with an "answered" badge on the card and a "Chosen" badge on the option.
- Use made-up fund names in mockups. Use Decimal-never-float, and no advice wording ("best", "buy", "recommended").
- Never claim a figure is measured if it is an estimate. The workbook labels fact versus estimate; keep doing that. No database was queried, no job run, no timing measured in this planning.
- Before publishing an artifact, build it as a file in the repo's `Docs/orchestration/` and update the published artifact from the same file path.

## 8. Next steps, in order

1. Ask the owner how to apply the Q1 clarification (reword or reopen), then update the workbook: Q1 card, Q12 pick and urgency, the home mockup's portfolio strip order, section 1's Q1 row, and the intro of section 2.
2. Re-check the phasing. With discovery as the main point, Phase 2 (categories, fund-house pages, metrics table) is the heart of the feature, and the fit-with-portfolio card is a later extra.
3. Get her answers on the open questions, starting with Q3, Q4, Q6, Q9 and Q10. Q4 needs a compliance view from someone qualified.
4. Counts still to run on the staging copy before the spec is final: live funds, TER, AUM, benchmark, valuation, holdings by fund house, managers, price table size, the cold cost of a held-set query, AWS database CPU credits, VM free memory and disk at 06:45.
5. Only after answers: a spec per phase and an Explore PRD (new scope; AGENTS.md says not to build what is not scoped), then the contract v1.8 change note for the nav shell.

## 9. Resume prompt

The prompt to paste into the new account is below.

```text
You are resuming a planning session on the Unifolio MF MVP repo (branch leapswitch-redesign, GitHub account aditi-unifolio). We were planning the "Explore" feature and I paused at 92% usage on my old account. Do not implement anything; this is planning only.

First read, in order: AGENTS.md, CLAUDE.md, then Docs/orchestration/2026-11-09-explore-handoff.md (the full handoff), then Docs/orchestration/2026-11-09-explore-feature-decisions-v2.html (the workbook; read its text, sections 1 to 20 and the decision cards Q1 to Q16, and look at the UI mockups in section 3). Also skim Docs/orchestration/2026-11-09-search-bar-planning.html because Explore shares its look and its normaliser. The published artifact link in the handoff is private to my old account, so use the repo files. If any of these files are missing, tell me and stop.

Then follow CLAUDE.md (invoke the task-observer skill) and use the brainstorming skill. Summarise back to me in under 250 words what Explore is, what is decided, what is open, and the one correction I made: the main point of Explore is to explore the market and see what else I can do, not mainly to compare with my current holdings. Then ask me how to apply that correction to the workbook (reword Q1 or reopen it) and carry on from the "Next steps" in the handoff. Keep the same house style and depth as the existing workbook; label facts versus estimates; do not commit or push unless I say so.
```
