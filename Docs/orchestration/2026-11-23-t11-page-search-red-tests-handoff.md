# Handoff: T11 red tests for search on Overview, Transactions and Holdings (Batch K, Codex, new test files only)
**Status:** READY TO RELAY (written 2026-11-23). **Approved:** the owner approved Batch K's plan and the 23 Nov decisions (`decisions.md`).
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-k-search-plan.md` (Task T11; Global Constraints: "the existing live UI must not change", matching rules, address `?q=` and `?f=`). **Spec:** `Docs/orchestration/2026-11-09-search-bar-planning.html`, the table "Front end: changes to existing pages" (Overview, Transactions, Holdings rows) and the page contract (`pageKey`, `noun`, `total`, `matched`, `chipsAllowed`).
**Worker:** Codex. **It cannot run the front-end checks (no WSL): write the tests, do not try to run vitest, report BLOCKED on running.** Claude runs `wave-fe-check.sh ks test src/features/mutual-funds` and confirms each new test is red for the stated reason.
**Work in:** `C:\Users\Dell\lanes\unifolio-k-search` (worktree, branch `batch/k-search`). Git is read-only. Never in the main checkout.
Read first: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins), then this file; then the real code: `frontend/src/features/mutual-funds/overview/{OverviewPage,HoldingsTable,SipTimeline}.tsx` (the raw "Search investments" input and the `query` prop), `transactions/{TransactionsPage,Ledger,transactionsLogic}.ts*` (`ledgerRows`, `LedgerFilter`, `kindOf`, `filterFor`), `holdings/{HoldingsPage,AllStocksTable,holdingsLogic}.ts*` (`equityRows`, `StockHoldingRow`), `frontend/src/features/mutual-funds/types.ts` (`HoldingRow`, `ConsolidatedHolding`, `SipRow`, `InvestmentWithdrawalEntry`, `StockHoldingRow`, `StockHoldingsSummary`), and `frontend/src/components/search/` (`matcher.ts` `matchesItem`, `queryParser.ts` `parseQuery`, `searchResultTypes.ts`) and the T09 handoff `2026-11-23-t09-hooks-red-tests-handoff.md` (`usePageSearchState`, `SearchChip`).
**Rules that bind the tests (Global Constraints):** a page owns its filtering; **with the box empty every page renders as before** (nothing existing changes: the existing tests stay green and you do not edit them); the typed text and chips live in the address (`?q=`, `?f=kind:value`); features may use `components/search` and `lib` but **not other features** (only `features/auth/session`); the signed-in user's id comes from `useScope().userId` (already in the scope value).

## The interfaces (fixed here; write tests against them, do not write the code)
**Shared:** every page mounts `PageSearch` (from `components/search/PageSearch`, built by T08) with `{ pageKey, noun, total, matched, chipsAllowed, userId: useScope().userId ?? null }`. In the page tests **mock `PageSearch`** with a stub that renders `<div data-testid="page-search-stub" data-page-key data-noun data-total data-matched data-chips-allowed>` (chips allowed as a JSON string) and nothing else, and use the **real** `usePageSearchState` through a `MemoryRouter` with `?q=` and `?f=` in the initial address.
**Overview** (new pure file `overview/overviewSearch.ts`):
```ts
export interface SearchableHolding { scheme_name: string; amc_name?: string; category?: string | null; sebi_category?: string | null; household_member_id?: string; household_member_name?: string; children?: Array<{ household_member_id: string; household_member_name: string }> }
export function filterHoldingRows<T extends SearchableHolding>(rows: T[], text: string, chips: SearchChip[]): T[];
export function filterSipRows(rows: SipRow[], text: string, chips: SearchChip[]): SipRow[];
```
Rules: `text` goes through `parseQuery`; **every word** must match (any order) one of: scheme name, fund house (`amc_name`, an alias field), category (`category` or `sebi_category`), member name (own or any child's). Matching is `matchesItem(words, item) > 0` with fields `{ value, kind }` where the name and category fields are `"name"`/`"text"` as in `matcher.ts`. Chips: `category:<name>` keeps rows whose category equals it (case-insensitive); `member:<memberId>` keeps rows whose `household_member_id` or any child's equals it; a `period` chip is ignored on Overview. Empty text and no chips returns the input array unchanged (same order, same objects). The SIP rows match on `scheme_name` and `household_member_name` (and a `member:` chip on `household_member_id`).
**Transactions** (new pure file `transactions/ledgerSearch.ts`):
```ts
export function typeWordToFilter(typeWord: string | undefined): LedgerFilter | null;   // "purchase" -> "purchases", "redemption" -> "redemptions", "switch" -> "switches", anything else or undefined -> null
export function searchLedgerRows(rows: LedgerRow[], text: string, chips: SearchChip[]): LedgerRow[];
```
`searchLedgerRows` works on the rows `ledgerRows(buckets, filter)` already built and keeps their order. Rules (`parseQuery(text)`): remaining `words` must all match the fund name or the member name; a `typeWord` keeps rows whose `filterFor(kind)` equals `typeWordToFilter(typeWord)`; a `year` keeps rows whose `entry.date` starts with that year; a `month` plus `year` keeps rows in that month (`YYYY-MM`); an `amount` keeps rows whose `entry.amount` equals it as a decimal (no float: compare normalised decimal strings, `"50000"` equals `"50000.00"`, a `₹` and commas in the query are dropped by the parser); a `member:<memberId>` chip keeps rows of that `household_member_id`; a `period:<YYYY>` or `period:<YYYY-MM>` chip keeps rows whose date starts with it; a `category` chip is ignored. Empty text and no chips returns the rows unchanged.
**Holdings** (new pure file `holdings/stockSearch.ts`):
```ts
export function filterStockRows(rows: StockHoldingRow[], text: string): StockHoldingRow[];
export function stockSearchNote(summary: { truncated: boolean; total_stock_count: number }, shown: number): string | null;
```
`filterStockRows`: every word must match the stock name (`instrument_name`), its ISIN (prefix match), or the name of any `contributing_funds` fund (`scheme_name`); empty text returns the rows unchanged. `stockSearchNote`: `Searching the largest {shown} of {total_stock_count} stocks` when `truncated` is true, otherwise `null` (owner decision Q7: the 100-stock cap is disclosed).

## Tests to write (new files only; names fixed)
`overview/overviewSearch.test.ts`: `empty text and no chips return the rows untouched`; `every word must match, in any order`; `a fund house word finds the fund through its alias`; `a category word finds funds of that category`; `a member name finds the member's funds, including a family row's children`; `category chip keeps only that category`; `member chip keeps rows of that member or with a child of that member`; `a period chip is ignored on Overview`; `SIP rows match by fund and member`; `a member chip filters SIP rows`.
`overview/OverviewPage.search.test.tsx` (mock `PageSearch` as above; model the data mocks on `OverviewPage.test.tsx`): `the raw Search investments input is gone`; `the box gets pageKey overview, noun funds, chips category and member`; `total is the number of funds and matched is the number shown`; `?q= filters the funds table`; `?f=category: filters the table`; `?q= also filters the SIP capsules`; `with no q and no f the table and the SIP capsules are exactly as before` (same rows as a render without the box); `the no-match message still reads No funds match "x" when nothing matches` (text kept as today).
`transactions/ledgerSearch.test.ts`: `typeWordToFilter maps the three words and nothing else`; `fund and member words filter the rows`; `a type word keeps only that kind (a reversal counts as a purchase as filterFor says)`; `a year keeps that year`; `a month and a year keep that month`; `an amount matches as a decimal, not as text`; `a member chip filters`; `period chips filter by year and by month`; `order is kept`; `empty input returns the rows unchanged`.
`transactions/TransactionsPage.search.test.tsx`: `the box gets pageKey transactions, noun transactions, chips period and member`; `total is all ledger rows and matched is the rows shown after the type toggle and the search`; `?q= cuts the ledger`; `a type word in ?q= switches the type toggle to that type (aria-pressed)`; `the type toggle still works with no q`; `with no q and no f the ledger is exactly as before`.
`holdings/stockSearch.test.ts`: `empty text returns the rows unchanged`; `matches name, ISIN prefix and contributing fund names`; `every word must match`; `the note appears only when the list is truncated and names both numbers`.
`holdings/HoldingsPage.search.test.tsx`: `the box gets pageKey holdings, noun stocks and no chips`; `total is the number of stock rows and matched the number shown`; `?q= filters the all-holdings table and leaves the top-by-fund card alone`; `the truncation note shows when the list is truncated`; `with no q the page is exactly as before`.
Invented data only (names like "Example Growth Fund", members "Asha" and "Bela", ISINs like "INE000000001"). No `@testing-library/user-event`; `fireEvent`/`act`; no `any`, `parseFloat`, `toFixed`, `Intl.`.
**Each new test must fail first for the stated reason:** the three new pure modules do not exist; the pages still have the raw input / do not mount `PageSearch` / do not read `?q=`. (Claude confirms.)

## Left out on purpose (small radius; they follow as T11b)
Overview's sold-funds list (it lives in the legacy `components/mf` and has its own guard), opening the Transactions period panel from a month or year, and selecting a fund chip on a Holdings fund match. Do not write tests for these.

## Files
**Create only:** the seven test files above. **Do not create** the new modules. **Do not touch** any existing file or test, `components/search/**`, the shell, `package.json`.

## Report (one block, `CODEX REPORT: t11-page-search-red-tests`)
Status; baseline HEAD; files created; per file the test count; `git status --short`; interface questions (if a rule above makes a test impossible, say which, with the real type that conflicts); not run (BLOCKED on running, reason); decisions the handoff did not cover.

## Paste-ready prompt
```
Front-end test writer for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-23-t11-page-search-red-tests-handoff.md (your task: T11 red tests)
Work only in C:\Users\Dell\lanes\unifolio-k-search on branch batch/k-search. Git is read-only. No deletion flags or recursive deletes. Write only the seven new test files the handoff names, exactly against the interfaces and rules it fixes; do not create the modules; do not edit any existing file or test. Do not use @testing-library/user-event. You cannot run the front-end checks: do not try, report BLOCKED on running.
Reply with the CODEX REPORT block from the handoff, nothing else.
```
