# Handoff: T08 red tests for the search box and the notice (Batch K, Codex, new test files only)
**Status:** READY TO RELAY (written 2026-11-23). **Approved:** the owner approved Batch K's plan and the 23 Nov decisions (`decisions.md`).
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-k-search-plan.md` (Task T08, "Claude red tests"; Global Constraints; Review Focus). **Spec:** `Docs/orchestration/2026-11-09-search-bar-planning.html`: the section "How the box behaves", the box as a state machine (Rest, Open empty, Typing, Chosen, Closed with text), the page contract, and the one-row-of-every-result-type table. Read those first.
**Worker:** Codex. **It cannot run the front-end checks (no WSL): write the tests, do not try to run vitest, report BLOCKED on running.** Claude runs `wave-fe-check.sh ks test src/components/search` and confirms each new test is red for the stated reason.
**Work in:** `C:\Users\Dell\lanes\unifolio-k-search` (worktree, branch `batch/k-search`). Git is read-only. Another Codex task writes the T09 hook tests in the same folder at the same time: **you create only the two files named below**, so nothing collides.
Read first: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins), then this file; then `frontend/src/components/search/` (`searchTypes.ts`, `searchResultTypes.ts` for `ResultRow`, `ResultGroup`, `ResultAction`, `PageFilterSource`; `buildResults.ts`, `queryParser.ts`, `useSearchIndex.ts`, `recentSearches.ts`), `frontend/src/shell/scope/scopeTypes.ts` (`scopeJump`) and `docs/orchestration/2026-11-23-t09-hooks-red-tests-handoff.md` (the hooks the box uses: `usePageSearchState`, `useScopeJump`).

## The interface (fixed here)
`frontend/src/components/search/PageSearch.tsx`: `export function PageSearch(props: PageSearchProps)` with
```ts
interface PageSearchProps {
  pageKey: string;                 // e.g. "transactions"
  noun: string;                    // "transactions" (for "6 of 41 transactions")
  total: number;                   // what the page has
  matched: number;                 // what the page shows now (the page counts its own matches)
  chipsAllowed: Array<"period" | "member" | "category">;
  extraResults?: ResultRow[];      // rows only this page can offer
  userId: string | null;           // for the recents; the page passes the signed-in user's id
}
```
`frontend/src/components/search/SearchNotice.tsx`: `export function SearchNotice()` (no props): reads `useScope().scopeJump`.
**What the box uses (all are mocked in the tests with `vi.mock`, so write the tests against these module paths and shapes):** `./useSearchIndex` -> `useSearchIndex(): { status, data, retry, load }`; `./buildResults` -> `buildResults(parsed, source, index, registry, recents, scope)` returning `ResultGroup[]`; `./queryParser` -> `parseQuery` (use the real one); `./searchRegistry` -> `buildSectionEntries()`; `./usePageSearchState` -> `usePageSearchState(pageKey)`; `./useScopeJump` -> `useScopeJump(userId)`; `./recentSearches` -> `readRecentFunds`, `readRecentSearches`, `pushRecentSearch`. Navigation uses `useNavigate`; the member switch uses `useScope()`.

## Behaviour to test (the eight states, from the spec; all texts below are fixed)
1. **Rest:** one input with `role="combobox"`, `aria-expanded="false"`, `aria-label` `Search {noun}`, placeholder `Search {noun}`, and a hint element `data-testid="search-hint"` that reads `Ctrl S` (or `Cmd S` when `navigator.platform` contains "Mac"). The listbox is not in the document.
2. **Open, empty:** focusing or clicking the input opens the dropdown (`aria-expanded="true"`, a `role="listbox"`), shows the recent funds (`Recent funds`, rows named from the index by id; an id the index does not know is skipped) and the recent searches (`Recent searches`, plain text rows); **the first open calls `load()` of the index once** (not on every open).
3. **Typing:** each change rebuilds the groups through `buildResults`; **the first row is always the page-match row** `{matched} of {total} {noun}` (role `option`, `data-testid="row-page-match"`); group labels come from the `ResultGroup.label`; **the page does not filter while typing**: `setText` of the page-state hook is **not** called until Enter. The draft is local to the box. A polite live region (`role="status"`, `data-testid="search-live"`) says `{n} results` (`1 result` for one), counting the shown rows.
4. **Chosen:** Enter on the active row runs its action: `jump-fund` calls `jumpTo(fund)` of the scope-jump hook (the row's `switchTo` only changes its hint, see 7); `filter` calls `addChip(chip)`; `go` navigates to `path` (with `text` as the `q` of the target address when given, and `sectionId` passed as the section of the intent); `switch-member` calls the scope's `setMember(memberId)`; `none` (a greyed "Coming soon" row, `disabled`) does nothing and cannot be activated. After any action the dropdown closes and the draft clears; the typed text is pushed to the recent searches only when Enter ran on the page-match row or on no row.
5. **Enter on the page-match row (or with no active row):** `setText(draft)` of the page-state hook is called (the page filters), the dropdown closes, `pushRecentSearch(userId, draft)` is called when the draft is not empty.
6. **Closed with text:** after step 5 the input shows the text and the chips stay (each chip is a button `Remove filter {value}` that calls `removeChip`); **Esc clears the text (`setText("")`) and, with no text, closes**; Backspace in an empty input removes the last chip.
7. **No match / error / hand-off rows:** when `buildResults` returns no rows the dropdown shows `Nothing found for "{text}".` under the page-match row; when `useSearchIndex().status === "error"` it shows `Some results are unavailable right now.` and a button `Try again` that calls `retry()`, while the page-match row and the page's own `extraResults` still show; sold funds show the tag `Sold` (the row's `tag` is rendered as given); a hand-off row is any `go` row with `text`: its subtitle is rendered. Each active or hovered row shows its hint in `data-testid="row-hint-{id}"`: `jump-fund` with `switchTo` -> `Switches to {label}`, `jump-fund` without it -> `Go`, `go` -> `Go`, `filter` -> `Filter`, `switch-member` -> `Switches to {label}`, a `disabled` row -> `Coming soon`.
8. **Keyboard and ARIA:** ArrowDown and ArrowUp move the active option and set `aria-activedescendant` on the input to that option's id (wrapping at the ends); the options have `role="option"` and `aria-selected`; **Ctrl+S and Cmd+S focus the box and open it and call `preventDefault` on the keydown, only while the box is mounted** (after unmount the same key press is not prevented); Tab closes the dropdown and leaves; focus returns to the input after a chip is removed; Esc with the dropdown open and text typed clears the draft first.
9. **The notice (`SearchNotice.test.tsx`):** with `scopeJump = { label: "Asha", undo }` it renders `role="status"` text `Switched to Asha.` and a button `Undo` that calls `undo`; with `scopeJump` null or undefined it renders nothing; it has no auto-dismiss timer (the provider ends it); the button carries `data-clickable=""`.
10. **Existing screens unchanged:** `PageSearch` with an empty draft and no chips renders only the input and the hint (nothing else in the document), and imports nothing from `features/*` except `getToken` (assert the module source with a read of the file, as `noFeatureImports.test.ts` does, or leave that to the existing guard and say so).
Use invented data ("Example Growth Fund", members "Asha" and "Bela", a fund held only by Bela, a sold fund). Fake the clock only where a timer is involved. No `@testing-library/user-event` (not installed): use `fireEvent`, `act`.

## Tests to write (new files only; names fixed)
`PageSearch.test.tsx`: one `describe` per numbered group above, test names starting with the state: `rest: ...`, `open empty: ...`, `typing: ...`, `chosen: ...`, `enter on the page match: ...`, `closed with text: ...`, `no match ...`, `index error ...`, `hints ...`, `keyboard ...`, `Ctrl+S ...`, `empty box renders only the input`. `SearchNotice.test.tsx`: the group 9 tests.
**Each test must fail first for the stated reason: the two components do not exist** (and, for the hooks they use, T09's modules do not exist yet either: `vi.mock` them with factories so the tests do not depend on T09's build).

## Files
**Create only:** `frontend/src/components/search/PageSearch.test.tsx` and `SearchNotice.test.tsx`. **Do not create** the components. **Do not touch** anything else (the other Codex task owns the four T09 test files).

## Report (one block, `CODEX REPORT: t08-box-red-tests`)
Status; baseline HEAD; files created; per file the test count; `git status --short`; interface questions (if a text or signature above makes a test impossible, say which); not run (BLOCKED on running, reason); decisions the handoff did not cover.

## Paste-ready prompt
```
Front-end test writer for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-23-t08-box-red-tests-handoff.md (your task: T08 red tests)
Work only in C:\Users\Dell\lanes\unifolio-k-search on branch batch/k-search. Git is read-only. No deletion flags or recursive deletes. Write only the two new test files the handoff names, exactly against the interface and texts it fixes; do not create the components; touch nothing else (another Codex task writes other test files in the same folder). Do not use @testing-library/user-event. You cannot run the front-end checks: do not try, report BLOCKED on running.
Reply with the CODEX REPORT block from the handoff, nothing else.
```
