# Handoff: T12 red tests for search on Performance, Overlap and Other Analytics (Batch K, Codex, new test files only)
**Status:** READY TO RELAY (written 2026-11-23). **Approved:** the owner approved Batch K's plan and the 23 Nov decisions (`decisions.md`). **Same method as T11** (`2026-11-23-t11-page-search-red-tests-handoff.md`: read it first, its rules bind here too: a page owns its filtering; with the box empty every page renders as before and no existing test changes; text and chips live in the address; pages get the user id from `useScope().userId`; no import of other features except `features/auth/session`; tests mock `PageSearch` with the same stub and use the real `usePageSearchState` through a `MemoryRouter` with `?q=` in the address).
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-k-search-plan.md` (Task T12). **Spec:** `Docs/orchestration/2026-11-09-search-bar-planning.html`, the table "Front end: changes to existing pages" (rows Performance, Allocation, Overlap, Other Analytics).
**Worker:** Codex. **It cannot run the front-end checks (no WSL): write the tests, do not try to run vitest, report BLOCKED on running.** Claude runs `wave-fe-check.sh ks test src/features/mutual-funds` and confirms each new test is red for the stated reason.
**Work in:** `C:\Users\Dell\lanes\unifolio-k-search` (worktree, branch `batch/k-search`). Git is read-only. Never in the main checkout.
Read first: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins), the T11 handoff, then this file; then the real code: `performance/{PerformancePage,BenchmarkBlock,benchmarkLogic}.ts*`, `overlap/{OverlapPage,TopPairs,CommonHoldings,PairDetail,overlapLogic}.ts*`, `other/{OtherAnalyticsPage,CostValuationGroup,TerLadder,ValuationByFund,CategoryRankingGroup,PerformanceRankingGroup,ScorerGroup,otherLogic}.ts*`, and in `types.ts`: `FundBenchmarkRow`, `OverlapPair`, `OverlapCommonStock`, `OverlapSummary`, `FundTerRow`, `ValuationFund`, `CategoryRankRow`, `FundRankingRow`; and `frontend/src/components/search/{queryParser,matcher,usePageSearchState}.ts`.

## The interfaces (fixed here; write tests against them, do not write the code)
**Shared matching rule** (all three pure modules): `parseQuery(text).words` must **all** match (any order) through `matchesItem(words, item) > 0` with name-like fields as `{ kind: "name" }` and secondary fields as `{ kind: "text" }`; empty text returns the input array unchanged (same order, same objects).
- **Performance**, new pure file `performance/performanceSearch.ts`: `export function filterBenchmarkFunds(rows: FundBenchmarkRow[], text: string): FundBenchmarkRow[]` (fields: `scheme_name` as name, `benchmark_index` as text).
- **Overlap**, new pure file `overlap/overlapSearch.ts`: `export function filterOverlapPairs(pairs: OverlapPair[], text: string): OverlapPair[]` (a pair matches when every word matches `fund_a.scheme_name`, `fund_b.scheme_name`, or the name of any of its `common_stocks`); `export function filterCommonStocks(stocks: OverlapCommonStock[], text: string): OverlapCommonStock[]` (fields: `instrument_name` as name, `isin` as text, ISIN prefix match).
- **Other Analytics**, new pure file `other/otherSearch.ts`: `export interface SearchableFundRow { scheme_name: string; category_name?: string | null; category?: string | null; sebi_category?: string | null; plan_type?: string | null }` and `export function filterFundRows<T extends SearchableFundRow>(rows: T[], text: string): T[]` (name: `scheme_name`; text: the category fields and `plan_type`).
**Pages:** each mounts `<PageSearch pageKey noun total matched chipsAllowed userId />` in the frame's `utility` slot (`MutualFundsFrame`'s `utility` prop):
- Performance: `pageKey "performance"`, `noun "funds"`, `chipsAllowed []`; `total` = number of rows in the fund-versus-benchmark list, `matched` = rows shown; `?q=` filters that list (`BenchmarkBlock`'s per-fund rows); **nothing else on the page changes** (the portfolio tiles, the history table, the month table and the charts are untouched).
- Overlap: `pageKey "overlap"`, `noun "pairs"`, `chipsAllowed []`; `total` = pairs in the top-pairs list, `matched` = pairs shown; `?q=` filters `TopPairs` with `filterOverlapPairs` and the common-stocks list of the open pair with `filterCommonStocks`; the heatmap, the donut and the stat strip are untouched.
- Other Analytics: `pageKey "analytics"`, `noun "funds"`, `chipsAllowed []`; `total` = number of funds in the cost (TER) summary, `matched` = how many of them match; `?q=` filters, with `filterFundRows`, the rows of **Valuation by Fund**, the **Category comparison** cards, the **Performance ranking** table and the **TER ladder's** per-fund rows when it lists funds individually (read the code; if a group lists no per-fund rows, it is left alone and the test says so). The cards, headings and explanations stay as today; a list that ends up with no rows shows the empty text it already has (do not invent copy).

## Tests to write (new files only; names fixed)
`performance/performanceSearch.test.ts`: `empty text returns the rows untouched`; `every word must match, in any order`; `matches the fund name and the benchmark index name`; `no match gives an empty list`.
`performance/PerformancePage.search.test.tsx`: `the box gets pageKey performance, noun funds and no chips`; `total is the number of benchmark rows and matched the number shown`; `?q= filters the fund versus benchmark list`; `the rest of the page is unchanged with ?q=` (a tile and the history block are still there); `with no q the list is exactly as before`.
`overlap/overlapSearch.test.ts`: `empty text returns pairs and stocks untouched`; `a fund name finds its pairs`; `a stock name finds the pairs that share it`; `every word must match`; `common stocks match name or ISIN prefix`.
`overlap/OverlapPage.search.test.tsx`: `the box gets pageKey overlap, noun pairs`; `total and matched count pairs`; `?q= filters the top pairs`; `?q= filters the common stocks of the open pair`; `the heatmap is unchanged with ?q=`; `with no q the page is exactly as before`.
`other/otherSearch.test.ts`: `empty text returns rows untouched`; `matches name`; `matches category and plan type`; `every word must match`.
`other/OtherAnalyticsPage.search.test.tsx`: `the box gets pageKey analytics, noun funds`; `total is the number of cost funds and matched the number matching`; `?q= filters Valuation by Fund`; `?q= filters the category comparison cards`; `?q= filters the performance ranking`; `headings and explanations stay with ?q=`; `with no q the page is exactly as before`.
Invented data only (the fixtures already use invented names; extend them locally in the test, not in shared fixtures). No `@testing-library/user-event`; `fireEvent`/`act`; no `any`, `parseFloat`, `toFixed`, `Intl.`.
**Each new test must fail first for the stated reason:** the three pure modules do not exist; the pages do not mount `PageSearch` or read `?q=`. (Claude confirms.)

## Left out on purpose (follow-up T12b)
The Performance month table, the Allocation page (the "open this slice" intent and the highlighted manager card), the TER ladder if it lists no individual funds. Do not write tests for these.

## Files
**Create only:** the six test files above. **Do not create** the new modules. **Do not touch** any existing file or test, `components/search/**`, the shell, `package.json`.

## Report (one block, `CODEX REPORT: t12-page-search-red-tests`)
Status; baseline HEAD; files created; per file the test count; `git status --short`; interface questions (if a rule above makes a test impossible, say which, with the real type or DOM that conflicts); which Other Analytics groups list per-fund rows and which do not; not run (BLOCKED on running, reason); decisions the handoff did not cover.

## Paste-ready prompt
```
Front-end test writer for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-23-t11-page-search-red-tests-handoff.md (the method)
4. Docs/orchestration/2026-11-23-t12-page-search-red-tests-handoff.md (your task: T12 red tests)
Work only in C:\Users\Dell\lanes\unifolio-k-search on branch batch/k-search. Git is read-only. No deletion flags or recursive deletes. Write only the six new test files the handoff names, exactly against the interfaces and rules it fixes; do not create the modules; do not edit any existing file or test. Do not use @testing-library/user-event. You cannot run the front-end checks: do not try, report BLOCKED on running.
Reply with the CODEX REPORT block from the handoff, nothing else.
```
