# Handoff: T14 red tests for search on Home, History, Portfolio, Planning and Import history (Batch K, Codex, new test files only)
**Status:** READY TO RELAY (written 2026-11-23). **Approved:** the owner approved Batch K's plan and the 23 Nov decisions (`decisions.md`). **Same method and rules as T11 and T13** (`2026-11-23-t11-page-search-red-tests-handoff.md`, `2026-11-23-t13-fund-page-search-red-tests-handoff.md`: read both first): the existing live UI must not change; with the box or the new field unused every page renders as before; no existing test changes; tests mock `PageSearch` with a stub that also records `jumpOnly` (`data-jump-only`), and use `useScope().userId` for `userId`; no import of another feature except `features/auth/session`; **read each feature's own `guards*.test.ts*` and follow them** (Home, Portfolio, Planning and History use the `@/` alias).
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-k-search-plan.md` (Task T14). **Spec:** `Docs/orchestration/2026-11-09-search-bar-planning.html`, the table "Front end: changes to existing pages" (rows Home, History, Portfolio and Planning, Import history).
**Worker:** Codex. **It cannot run the front-end checks (no WSL): write the tests, do not try to run vitest, report BLOCKED on running.** Claude runs `wave-fe-check.sh ks test ...` and confirms each new test is red for the stated reason.
**Work in:** `C:\Users\Dell\lanes\unifolio-k-search` (worktree, branch `batch/k-search`). Git is read-only. Never in the main checkout.
Read first: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins), the two handoffs above, then this file; then the real code: `home/HomePage.tsx` and `home/sections/Greeting.tsx`, `history/HistoryView.tsx` (the header `flex` row with the Range group), `portfolio/PortfolioPage.tsx` and `planning/PlanningPage.tsx` (their `PageLayout`; its optional `search` slot already exists in `shell/layout/PageLayout.tsx`), `profile/ImportHistorySection.tsx`, `profile/historyGroups.ts`, `import/types.ts` (`HouseholdImportHistoryItem`), and `frontend/src/components/search/PageSearch.tsx` (the box and its new `jumpOnly` prop from T13).

## The interfaces (fixed here; write tests against them, do not write the code)
**Four jump-only mounts.** Each mounts `<PageSearch pageKey noun total={0} matched={0} chipsAllowed={[]} jumpOnly userId={useScope().userId ?? null} />` and changes nothing else:
- **Home** (`home/HomePage.tsx` / `sections/Greeting.tsx`): `pageKey "home"`, `noun "funds"`; in the greeting row on the right, **before** the members chip (read `Greeting.tsx`: the chip button that opens the members popup); the greeting text, the chip, the import and top-mover callbacks are unchanged; no `?q=` ever (jump-only).
- **History** (`history/HistoryView.tsx`): `pageKey "history"`, `noun "months"`; in the header flex row, before the Range group. The page uses `--color-*` tokens: this is a mount only (the box brings its own styles).
- **Portfolio** (`portfolio/PortfolioPage.tsx`): `pageKey "portfolio"`, `noun "investments"`; passed as `PageLayout`'s `search` prop.
- **Planning** (`planning/PlanningPage.tsx`): `pageKey "planning"`, `noun "scenarios"`; passed as `PageLayout`'s `search` prop on **all three views** (landing, plan the future, explore the market). **Selecting a matching scenario through `planningHistory.ts` and opening "More scenarios" is NOT part of T14** (it needs a new result action; follow-up T14b): do not write tests for it.
**Import history** (new pure file `profile/importHistorySearch.ts`, plus a plain field on the section):
```ts
export function filterImportGroups(groups: HouseholdImportHistoryItem[][], text: string): HouseholdImportHistoryItem[][];
```
`groups` are the section's groups (rows sharing `groupKey`, in the order the section shows them). A group is kept when **every word** of the text matches the combined searchable text of its rows: each row's `member_name`; the statement dates in all three forms (`2026-09-12`, `12 Sep 2026`, `September 2026`, for both `statement_from_date` and `statement_to_date`); the import month and day of `uploaded_at` (`2026-11-03`, `3 Nov 2026`, `November 2026`); and `status` with underscores as spaces (`needs review`). Word matching is the shared one (`parseQuery(text).words`, normalised, start-of-word or inside a word of 3+ letters). Empty text returns the groups unchanged (same arrays). Do not use `Intl` or `toFixed`; month names come from a table.
`ImportHistorySection` gains, in its card heading row (right of the title `Import History`), a plain field `<input aria-label="Search imports" placeholder="Search imports" />` (local state, no dropdown, no address); it appears **only when there is at least one import**; filtering applies to the groups it shows; with no match the line `No imports match "{text}".` replaces the list (the only new copy); the delete flow, the group layout and the text of every row are unchanged. Page-filter only: no dropdown groups.

## Tests to write (new files only; names fixed)
`home/HomePage.search.test.tsx` (model the data mocks on `HomePage.test.tsx`): `the box is mounted in the greeting row with pageKey home in jump-only mode`; `it sits before the members chip`; `no q is read or written` (the address has no `q` after typing); `the greeting, chip and callbacks are unchanged with the box mocked out`.
`history/HistoryView.search.test.tsx`: `the box is mounted in the header row with pageKey history in jump-only mode`; `it sits before the Range group`; `the Range buttons and the chart are unchanged`.
`portfolio/PortfolioPage.search.test.tsx`: `PageLayout gets the box through its search slot (pageKey portfolio, jump-only)`; `the header actions are unchanged`; `with the box mocked out the page renders as before`.
`planning/PlanningPage.search.test.tsx`: `the box is mounted on the landing view`; `... on the plan-the-future view`; `... on the explore-the-market view` (each pageKey planning, jump-only); `the existing buttons and titles are unchanged`.
`profile/importHistorySearch.test.ts`: `empty text returns the groups unchanged`; `matches a member name`; `matches the statement dates in all three forms`; `matches the import month`; `matches the status with spaces`; `every word must match, across the rows of one group`; `a group with two people is kept when either matches a name word and all other words match somewhere in the group`; `no match gives an empty list`.
`profile/ImportHistorySection.search.test.tsx` (model the loaders on `ImportHistorySection.test.tsx`): `the field appears only when there are imports`; `typing filters the groups`; `no match shows No imports match "x".`; `clearing the field restores every group`; `deleting an import still works while a filter is on`; `with the field empty the section renders exactly as before`.
Invented data only; dates from the fixtures. No `@testing-library/user-event`; `fireEvent`/`act`; no `any`, `parseFloat`, `toFixed`, `Intl.`.
**Each new test must fail first for the stated reason:** the pages do not mount the box (and, for jump-only, they do not pass `jumpOnly`); the module and the field do not exist. (Claude confirms.)

## Files
**Create only:** the seven test files above. **Do not create** the module or touch any existing file or test.

## Report (one block, `CODEX REPORT: t14-page-search-red-tests`)
Status; baseline HEAD; files created; per file the test count; `git status --short`; interface questions (anything in a rule above that cannot be tested as written, with the real DOM or type that conflicts, for example the exact greeting-row structure); not run (BLOCKED on running, reason); decisions the handoff did not cover.

## Paste-ready prompt
```
Front-end test writer for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-23-t11-page-search-red-tests-handoff.md and 2026-11-23-t13-fund-page-search-red-tests-handoff.md (the method)
4. Docs/orchestration/2026-11-23-t14-page-search-red-tests-handoff.md (your task: T14 red tests)
Work only in C:\Users\Dell\lanes\unifolio-k-search on branch batch/k-search. Git is read-only. No deletion flags or recursive deletes. Write only the seven new test files the handoff names, exactly against the interfaces and rules it fixes; do not create the module; do not edit any existing file or test. Do not use @testing-library/user-event. You cannot run the front-end checks: do not try, report BLOCKED on running.
Reply with the CODEX REPORT block from the handoff, nothing else.
```
