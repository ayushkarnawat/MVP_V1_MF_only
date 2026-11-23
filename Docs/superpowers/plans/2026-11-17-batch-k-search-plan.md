# Batch K: Page-wise Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read `Docs/orchestration/wave-common-rules.md` first; it wins where it differs.

**Goal:** In wave 3 (milestone M3), ship page-wise search (jump plus filter) on every Portfolio-area page, Home, Planning and Import history: a shared combobox, a household search index endpoint, eight result types (funds, categories, fund managers, members, SIPs, transactions, stocks, pages and sections), recent funds and recent searches, member switching with Undo, and the top bar without its search box (Ask Mira left; selector, + Add data, divider, theme right). One release, one staging check.

**Architecture:** One new read-only endpoint `GET /household/search-index` (plain `def`, whole household, no pricing, no migration). One shared folder `frontend/src/components/search/` (features may not import other features and the Mutual Funds guard test counts that folder's files). Each page keeps its own filtering and passes a small contract to the box. Shell edits (PageLayout slot, TopBar, scope intent, logout clearing) are done by the orchestrator, not a worker.

**Tech Stack:** FastAPI, SQLAlchemy, pytest; React, TypeScript, Vitest (`fireEvent` only, no user-event). No new dependency, no new library; the matcher is our own code.

**Spec:** `Docs/orchestration/2026-11-09-search-bar-planning.html` (all 23 questions answered or removed; sections: what exists, types, pages, UI mockups U1 to U6, integration, back end, implementation plan, traps). The matching rules, page-by-page change table, endpoint shape, test lists and 10 traps are in that document's implementation section; this plan fixes tasks, owners and order and does not repeat them. Program rules: `2026-11-17-program-execution-and-deployment-plan.html`.

## How this plan is used (read first)

- **Packets and handoffs are not written here.** The orchestrator writes each Antigravity packet (search-fe-3 the box, search-fe-5 to search-fe-8 the pages) and the Codex handoff (search-be-1) in detail when the task starts, from the artifact's mockups and the repo as it is that day. Red tests are committed before each packet runs.
- **The existing live UI must not change.** Every page looks exactly as today with the box empty, except the added box and the re-arranged top bar. Baseline screenshots of every page are taken before any change (T00); each packet lists the only files that may change; gate G3 checks it first.
- **Waits for (program section 4):** B and C settle the shell frame (C may already add a "scope intent"-like landing after the reset rule in task C-9: reuse its helper, do not build a second one; tell the orchestrator); **F's section list exists** (`frontend/src/lib/pageSections.ts`, F-3): search's "pages and sections" results and `searchRegistry.ts` **read that list, they do not keep their own** (change against the artifact's wording). K goes before E and I in shared files: `shell/layout/TopBar.tsx` (K first, I adds Export PDF after), `MutualFundsFrame.tsx` (K, then E, then F's rail), `SectionCard` anchors (F first, K rebases).
- **Wave-start check:** confirm `shell/layout/TopBar.tsx` (readOnly "Search" input opening the Mira dialog; buttons "+ Add data", "Ask Mira"; `FamilySelector`; theme toggle), `shell/layout/PageLayout.tsx` (props: title, subtitle, actions, tabs, children), `shell/scope/ScopeProvider.tsx` and `resetRule.ts`, `features/auth/AuthContext.tsx` (logout clears only the token), `features/mutual-funds/overview/OverviewPage.tsx` (the existing raw "Search investments..." input), `features/mutual-funds/guards.test.ts` (56 files; `data-clickable` on every button), `backend/app/services/dashboard/holdings.py` and `lot_rules.apply_lot_rules`, `dashboard/sip.py` `compute_active_sips(..., include_stopped=True, today=...)`, `analytics/fund_manager_allocation.py` `pick_main_manager` (if private, T01 adds a one-line public wrapper with a test), `backend/app/api/fund_page.py` for the router style, `lib/amcLogos.ts` `getAmcInfo`, F's list from F-3. Report drift.
- **Branch:** `batch/k-search` from `leapswitch-redesign` at wave 3 start (lane worktree `wt/search`, worker branch `search-src` for red tests, front-end worker in a separate Windows clone, back-end worker in a fresh WSL clone per task, as in the QA-fixes lane). Never force-push, never push to main.
- **Builders:** Codex = back end (Q20 A), one task at a time; if it cannot dispatch for environment reasons, fallback is a second Claude in WSL (same report block). Antigravity = the box and pages, **up to three lanes at once** in separate clones when files are disjoint: G-a = the box (`components/search/PageSearch.tsx`, `SearchNotice.tsx`, T08); G-b = the pure logic and hooks (T06, T07, T09); G-c = the page tasks after G2, split by disjoint page folders (T11 to T14). Claude = shell edits, scope intent, reviews, screenshots, gates.

## Global Constraints

- **Search is jump plus filter.** Jump is **not** limited by the family or member selector: a fund held only by another member shows "Held by X" and switches the selector (one holder: that person; several holders not including the viewed one: Family) with a notice and Undo; jumps from Home, Portfolio and Planning need the scope intent (Q19 A: applied after the reset rule, tests on the **real** `ScopeProvider`, not `TestScopeProvider`).
- **Eight result types only:** funds, categories, fund managers (**only the main manager**, Q22 B, via `pick_main_manager`, two-month freshness rule), members, SIPs (including stopped, `include_stopped=True`), transactions, stocks (top 100 by size, with the note "Searching the largest 100 of N stocks"), pages and sections (from F's list; unbuilt pages greyed "Coming soon", not clickable, at most two per search). Removed: fund houses as their own result (typing a house finds its funds), folios, sectors, terms, actions, smart filters, the Ask Mira dropdown row.
- Matching: normalise (lower case, drop "₹" and commas, collapse spaces, "-" and "&" as spaces); all words, any order; a word matches the start of a field word, or inside a word if 3 or more letters; aliases through `getAmcInfo`; spelling forgiveness (one edit for 4 to 7 letters, two for 8 or more; name-like fields only, ranked below exact; own code in `matcher.ts`); parser for type words, a year, a month plus year, an amount (transactions). Caps: 3 rows per group, "See all N" up to 20, 30 rows max; the page itself is never capped.
- Typing updates the dropdown only; **the page list filters on Enter** (Q15 C). Address: `?q=` and `?f=kind:value` (category, member, period) with `setSearchParams(next, {replace: true})`, beside `?sort=&dir=`; one-time router state `searchIntent` (scope, section, open).
- Shortcut: **Ctrl+S (Windows) / Cmd+S (Mac)** opens the box (Q12), the app stops the browser's "Save page" only while the box is on screen and only for that key press (one constant, changeable).
- Recent funds (last few opened, by id) and the last 5 typed searches (Q13 A+B): per signed-in user id, browser storage only with try/catch, cleared on logout, never sent anywhere; the typed text never reaches analytics or logs.
- Back end: additive, whole household of the signed-in user, `get_data_user` (401, 403, re-consent 403 as other data routes), `get_db`, `get_now_ist`; plain `def`; no commit; no pricing (no NAV read, fetch or write); open vs sold by replaying `apply_lot_rules` (never a plain unit sum); no folios, sectors, amounts, units or prices in the response; response fields: `generated_at`, `funds[]` with `scheme_id`, `name`, `amc_name`, `sebi_category`, `plan_type`, `main_manager`, `holders[]` (`member_id`, `member_name`, `state` open|sold, `sip` `{status, next_due_date}`|null); new `backend/app/api/search.py` and `backend/app/services/search/{index,positions,schemas}.py`, one `include_router` line in `main.py`; no migration (head stays 0053).
- Logout: `clearSearchState()` and `invalidateApiCache()`; the index request uses `cache: "no-store"` and the store is keyed by token.
- Rows show names, counts, tags and dates, never rupee amounts. No hex colours; pages use `--ui-*`, the shell `--shell-*`, History `--color-*` (the box takes `--ui-*` and exposes class hooks for History). Feature code may not use `parseFloat`, `toFixed` or `Intl.`; no new dependency; phone unchanged; no GA4 events.
- Top bar (Q23 A): Ask Mira at the left; selector, + Add data, a divider and the theme toggle at the right. The look changes drawn in the mockups (wide green-tinted Ask Mira pill with the hint, divider, softer corners) apply to the live app **only if the user approves them**; otherwise only the position changes and each control keeps its current look.
- Packets are written at execution time; allowed-files lists forbid editing existing strings or classes beyond what a packet names.

## Review Focus

- Privacy: a second user's members and funds never appear; logout then login as someone else shows nothing from the first (also the 60-second GET cache).
- A fund fully redeemed at the same price shows as sold (the realised-gain list would miss it); the open/sold answer equals `compute_holdings` for the same data (parity test).
- Query count is fixed whether the household has 3 or 40 funds.
- Stale responses: a slow index answer must not overwrite a newer one; a failed index shows "some results unavailable" and the page still filters.
- Scope intent: a jump from Home to a fund held only by Asha lands on Asha and survives the reset rule; Undo restores the previous selector.
- Existing behaviour unchanged: with the box empty every page renders as before (screenshots); the guard tests stay green, with any file-count change reviewed.
- Keyboard: arrows, Enter, Esc (clears then closes), Tab leaves; `aria-activedescendant`, a live region that says "3 results"; focus returns.
- The Ctrl+S default is prevented only while the box is on screen.
- Planning selects a scenario through its own history helper (`planningHistory.ts`), not `?q=`; `src/shell/` code may not touch `window.history`.
- Typing speed on a ledger of thousands of rows.

## File Structure

| File | Responsibility |
|---|---|
| `backend/app/api/search.py`, `backend/app/services/search/{index,positions,schemas}.py` (new) + one line in `backend/app/main.py` | The endpoint, positions (open/sold), schemas. |
| `backend/tests/api/test_search_index.py`, `backend/tests/services/search/*`, `backend/tests/functional_postgres/test_search_index_pg.py` (new) | Back-end tests. |
| `frontend/src/components/search/` (new, see the artifact's file list) | `PageSearch.tsx`, `SearchNotice.tsx`, `searchTypes.ts`, `matcher.ts`, `queryParser.ts`, `buildResults.ts`, `searchApi.ts`, `searchIndexStore.ts`, `useSearchIndex.ts`, `searchRegistry.ts` (reads F's `lib/pageSections.ts`), `usePageSearchState.ts`, `useSearchIntent.ts`, `useScopeJump.ts`, `recentSearches.ts`, and one test file per module. |
| `frontend/src/shell/layout/{PageLayout,TopBar}.tsx` (+ tests) | `search?: ReactNode` slot; TopBar without its search box, re-arranged. |
| `frontend/src/shell/scope/{ScopeProvider.tsx,scopeIntent.ts}` | Applies `searchIntent.scope` after the reset rule. |
| `frontend/src/features/auth/AuthContext.tsx` | Logout also clears search state and the GET cache. |
| the pages in the artifact's change table | One small edit each (see section 2 of its implementation plan). |

## Task list

IDs follow the artifact (T00 to T20); the builders reflect the program plan (Codex back end, Antigravity up to three lanes, Claude shell and gates).

| Task | What | Builder | Size | Gate |
|---|---|---|---|---|
| T00 | Prepare: lane and worktree, baseline suites and screenshots, spec and plan copies, decisions entry (L39 and L46 superseded), answers recorded | Claude | S | |
| T01 | Back-end contract: field names, example payloads, fixtures, red-tests outline; public wrapper for `pick_main_manager` if needed | Claude | S | |
| T02 | Endpoint and service (search-be-1) | Codex | M | |
| T03 | Verify, suites, review, back-end docs | Claude + reviewer | S | G1 |
| T04 | Shell: PageLayout slot, TopBar without its box and re-arranged, logout clearing, contract note | Claude | S | |
| T05 | Shell: scope intent in `ScopeProvider`, tests on the real provider | Claude | M | |
| T06 | Matcher with spelling forgiveness, parser, builder (search-fe-1) | Antigravity G-b | M | |
| T07 | API call, index store, hook, recents, invalidation (search-fe-2) | Antigravity G-b | S | |
| T08 | The box and dropdown, the notice (search-fe-3) | Antigravity G-a | L | |
| T09 | Registry (reads F's list), address, intent and scope-jump hooks (search-fe-4) | Antigravity G-b | M | |
| T10 | Review the shared component, screenshots vs mockups | Claude + reviewer | S | G2 |
| T11 | Overview, Transactions, Holdings (search-fe-5) | Antigravity G-c | L | |
| T12 | Performance, Allocation, Overlap, Other Analytics (search-fe-6) | Antigravity G-c | L | |
| T13 | Fund page frame, all-holdings dialog, compare list, insights (search-fe-7) | Antigravity G-c (parallel with T11 if files do not overlap) | M | |
| T14 | Home, History, Portfolio, Planning, Import history (search-fe-8) | Antigravity G-c | M | G3 |
| T15 | Full suites, local-stack browser run with synthetic statements, screenshots, gate record | Claude | M | |
| T16 | Whole-release independent review and fixes (each finding red test first) | Reviewer + Claude | M | G4 |
| T17 | Docs (backend.md, decisions.md, log.md, session.md, DEFERRED_FEATURES.md, API reference, shell contract log) | Claude | S | |
| T18 | M3 notes for the deploy guide and the QA checklist inputs | Claude | S | |

Deploy and QA: the M3 deploy guide is written at M3 (backend first, then frontend); the single QA round runs after M4 (program decision 17 Nov). T19 and T20 of the artifact (your QA, staging deploy) follow the program's milestones, not this plan.

Parallelism: T02 (Codex), T04 and T05 (Claude), T06 and T07 (Antigravity G-b) all start after T00 and touch different files; T08 (G-a) starts when T06 and T07 are done; T09 after T05; page tasks wait for G2.

---

### Task T01: Back-end contract (Claude)

- [ ] **Step 1:** Fix the exact field names and `plan_type` values from the existing models; write example payloads and fixtures (a two-member family, three funds, one sold fund, one stopped SIP, one fund with no main manager); outline the red tests (below). If `pick_main_manager` is private, add a one-line public wrapper in `fund_manager_allocation.py` with a test that its behaviour is unchanged.

### Task T02: Endpoint and service (Codex, search-be-1)

**Files:** Create `backend/app/api/search.py`, `backend/app/services/search/{__init__,index,positions,schemas}.py`; modify `backend/app/main.py` (one `include_router`); Test: `backend/tests/api/test_search_index.py`, `backend/tests/services/search/test_positions.py`, `backend/tests/functional_postgres/test_search_index_pg.py`.

**Interfaces:**
- Produces `GET /household/search-index -> SearchIndexResponse` (`generated_at: datetime`, `funds: list[SearchFund]`), `SearchFund(scheme_id: str, name: str, amc_name: str, sebi_category: str | None, plan_type: str, main_manager: str | None, holders: list[SearchHolder])`, `SearchHolder(member_id: str, member_name: str, state: Literal["open", "sold"], sip: SearchSip | None)`, `SearchSip(status: str, next_due_date: date | None)`.
- Produces `build_search_index(db: Session, user_id: uuid.UUID, today: date) -> SearchIndexResponse`; `open_or_sold(transactions: Sequence[Transaction]) -> Literal["open", "sold"]` using `lot_rules.apply_lot_rules`.

- [ ] **Step 1: Write failing tests** (names): `test_requires_sign_in_401_403_pending_deletion_and_reconsent`; `test_household_only_second_user_never_appears`; `test_shape_family_of_two_three_funds_holders_states_sip_next_due`; `test_sold_fund_including_sold_at_same_price`; `test_matches_compute_holdings_open_funds`; `test_no_pricing_and_read_only` (NAV fetch stubbed to fail the test if called; only SELECT statements; modelled on `test_portfolio_no_fetch_no_write.py`); `test_query_count_fixed_for_3_and_40_funds` (`before_cursor_execute` listener); `test_main_manager_parity_with_allocation_page_and_old_period_ignored_and_none_is_null`; `test_response_has_no_amounts_units_prices_folios`; Postgres: the same shape test on the real partitioned transactions table (needs `TEST_DATABASE_URL`).
- [ ] **Step 2: Run** `cd backend && pytest tests/api/test_search_index.py tests/services/search -v`. Expected: FAIL.
- [ ] **Step 3: Implement** the service in the steps of the artifact's section 3 (members, folios and transactions in one batch, replay lot rules per member and fund, scheme facts in one query, `compute_active_sips`, main manager query with the two-month rule, sort funds by name and holders by member order); router style as `fund_page.py`.
- [ ] **Step 4: Run** the files. Expected: PASS. Measure the endpoint on the largest synthetic household (40 or more funds) with `backend/scripts/measure_home_staging.py`'s approach and record it in the gate document.

### Task T03 (G1): Verify the endpoint (Claude + reviewer)

- [ ] **Step 1:** Run the new tests and the auth and api suites around them; a fresh reviewer attacks: privacy (only the signed-in household), no pricing, query count, sold-fund logic, parity with the holdings code. Findings become red tests first.

### Task T04: Shell edits (Claude)

**Files:** Modify `frontend/src/shell/layout/PageLayout.tsx`, `TopBar.tsx`, their tests, `frontend/src/features/auth/AuthContext.tsx`; the shell contract document's change log.

**Interfaces:** `PageLayout({ ..., search?: ReactNode })` draws `search` in the header row before `actions`; `TopBar` renders Ask Mira at the left and the selector, + Add data, a divider and the theme toggle at the right (no search input, no Mira-dialog state that only the box used; Ask Mira keeps its own); logout calls `clearSearchState()` and `invalidateApiCache()`.

- [ ] **Step 1: Write failing tests:** `PageLayout renders search before actions and nothing when absent`; `TopBar has no search input and its Ask Mira button still opens the Mira dialog`; `TopBar control order: Ask Mira left; selector, Add data, divider, theme right`; `no-selector pages omit the selector without moving the rest`; `logout clears search state and the GET cache`.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/shell/layout src/features/auth`. Expected: FAIL. **Step 3: Implement.** **Step 4: Run** them, `npx tsc -b`, `npx oxlint src/shell src/features/auth`. Expected: PASS; one change-log line in the shell contract.

### Task T05: Scope intent (Claude)

**Files:** Modify `frontend/src/shell/scope/ScopeProvider.tsx`; create `scopeIntent.ts`; Test: `ScopeProvider.test.tsx` (on the **real** provider).

**Interfaces:** Produces `readScopeIntent(state: unknown): { scope: "family" | { memberId: string } } | null`; the provider applies it once after the reset rule runs and clears it.

- [ ] **Step 1: Write failing tests:** `a jump from Home with intent member Asha ends on Asha after the reset rule`; `a jump with intent family ends on family`; `intent is applied once and cleared`; `no intent: the reset rule behaves as today`; `Undo restores the previous selector`. If C-9 already added a landing mechanism, build on it and keep both sets of tests green.
- [ ] **Step 2: Run** `npx vitest run src/shell/scope`. Expected: FAIL. **Step 3: Implement.** **Step 4: Run** the folder. Expected: PASS.

### Tasks T06, T07, T09: Pure logic and hooks (Antigravity G-b; red tests by Claude first)

**Files:** `components/search/{matcher,queryParser,buildResults,searchTypes,searchApi,searchIndexStore,useSearchIndex,recentSearches,searchRegistry,usePageSearchState,useSearchIntent,useScopeJump}.ts` and their tests.

**Interfaces:** `matchesItem(words: string[], item: SearchableItem): number` (rank, 0 = no match); `parseQuery(text: string): { words: string[]; typeWord?: string; year?: number; month?: string; amount?: string }`; `buildResults(query: ParsedQuery, source: PageFilterSource, index: SearchIndex | null, registry: SectionEntry[], recents: Recents): ResultGroup[]`; `useSearchIndex(): { status: "idle" | "loading" | "ready" | "error"; data: SearchIndexResponse | null; retry(): void }`; `clearSearchState(): void`; `invalidateSearchIndex(): void`; `usePageSearchState(pageKey: string): { text: string; chips: Chip[]; setText; addChip; removeChip }` (`?q=`, `?f=`, replace); `useScopeJump(): { jumpTo(fund: SearchFund, intent?: ScopeIntent): void }`.

- [ ] **Step 1 (Claude, red tests committed first):** matcher ranking, word rules, aliases, wrong-letter and swapped-letter spelling cases and words too short to forgive; parser (type word, year, month, amount); group caps (3, 20, 30); store (one fetch, keyed by token, invalidated, cleared); recents helper (per user, last 5, try/catch, cleared); address round trip with replace; intent read once; registry reads `SECTION_LISTS` from F's `lib/pageSections.ts`, plus shell registry for "Coming soon" rows.
- [ ] **Step 2 (packet at start of each task, written by the orchestrator):** allowed files, interfaces above, example payload, which tests must go green. **Step 3: Build.** **Step 4: Run** `cd frontend && npx vitest run src/components/search`, then `npx tsc -b`, `npx oxlint src/components/search`. Expected: PASS.

### Task T08: The box (Antigravity G-a)

**Files:** `components/search/PageSearch.tsx`, `SearchNotice.tsx`, tests.

**Interfaces:** `PageSearch(props: { pageKey: string; noun: string; total: number; matched: number; chipsAllowed: Array<"period" | "member" | "category">; extraResults?: ResultRow[] })`; combobox ARIA (`role="combobox"` on the input, `role="listbox"`, `aria-activedescendant`, live region "3 results").

- [ ] **Step 1 (Claude red tests):** all eight states from the artifact (rest, open-empty with recents, typing with the page-match first row, chosen, closed-with-text, no-match, index error "some results unavailable", sold/hand-off rows); keyboard paths; Ctrl+S and Cmd+S; ARIA; chips; focus return; the notice with Undo; hover tags (go, switches to X, filter).
- [ ] **Step 2 (packet):** the artifact's mockups U2 to U5 (box states, row types, fund-house simplification, journeys), measurements, tokens; the note that the mockup is artifact-only and the live app keeps its look. **Step 3: Build.** **Step 4: Run** `src/components/search`, `tsc -b`, `oxlint`. Expected: PASS.

### Task T10 (G2): Review the shared component (Claude + reviewer)

- [ ] **Step 1:** Screenshots of the box states next to the mockups at 1280x600, 1440x810, 1536x730, light and dark; a fresh reviewer checks accessibility, keyboard paths, stale responses, logout clearing, nothing stored that should not be. Exact differences go back to the worker. No page task starts before G2.

### Tasks T11 to T14: The pages (Antigravity G-c, one packet per page group)

**Files:** exactly the files in the artifact's change table (Overview, Transactions, Holdings; Performance, Allocation, Overlap, Other Analytics; Fund page, all-holdings dialog, compare list; Home, History, Portfolio, Planning, Import history) plus their tests; new section anchors come from F's list (do not add a second set).

- [ ] **Step 1 (Claude, per group, red tests first):** per page: filter result, count text ("6 of 41 transactions"), no-match text, chip add and remove, hand-off row, address round trip, existing tests still pass, with the box empty the page renders as before (`renders as before with the box empty`), Overview both the family table and the single-member table use the same matcher call, Overview SIP capsules and sold list filter too, Transactions type word kept in sync with the type toggle and a month or year opens the period panel, Holdings "largest 100 of N" note, Planning selects the scenario through its own helper and opens "More scenarios" when the match is hidden, Home and History jump-only, Import history filters by member, statement dates, import month and status.
- [ ] **Step 2 (packet each):** allowed files, page contract (`pageKey`, `noun`, `total`, `matched`, `chipsAllowed`, `extraResults`), where the box sits (utility slot, PageLayout `search`, header rows), tokens, the exact existing code that must not change. **Step 3: Build.** **Step 4: Run** each page's tests, then `npx tsc -b` and `npx oxlint` on the touched folders; `features/mutual-funds/guards.test.ts` stays green.
- [ ] **Step 5 (G3, after T14):** Claude and a reviewer check existing behaviour unchanged (screenshot diff list), guard diffs, scope switching and Undo, address round trips.

### Task T15 / T16 / T17 / T18

- [ ] **Step 1 (T15, Claude):** Full front-end suite (`vitest run`, `tsc -b`, `oxlint`, build; the three tests known to fail only under full-suite load are recorded, not hidden), back-end suites around auth, api and services; a local-stack browser run with the synthetic statements: type, jump, switch member and Undo, hand-off, reload with `?q=`, logout then login as someone else; screenshots next to the mockups; typing smoothness on the largest ledger; the gate record `Docs/orchestration/search-gate.md`.
- [ ] **Step 2 (T16, G4):** a fresh reviewer reads the full range; each finding that reproduces becomes a red test first. This gate is not skipped (Q21 A).
- [ ] **Step 3 (T17):** Update the docs listed in T17 of the artifact on the user's go.
- [ ] **Step 4 (T18):** Give the M3 deploy guide (written at M3) its facts: new endpoint (backend first, then frontend; if the frontend loads first the box still filters and shows "some results unavailable"); no migration; rollback is the previous frontend tag (the endpoint is unused and harmless); the draft post-deploy checks (endpoint answers for a real household, the box finds a held fund, a jump with a member switch works, hand-offs fill the box, logout then login as another user shows nothing from the first).

## Self-Review notes

- Spec coverage: endpoint (T02), shell (T04, T05), logic and hooks (T06, T07, T09), box (T08), pages (T11 to T14), gates G1 to G4, docs, deploy facts. Removed result types and Q-answers are in Global Constraints.
- Changes against the earlier artifact, flagged: the artifact assumed Gemini ran tasks one at a time and Claude ran the lane; the program plan allows up to three Gemini lanes and makes Codex the back-end builder; the artifact's own section registry is replaced by reading F's shared list.
- Packets and handoffs: not written here, by instruction.

## Amendments (23 Nov 2026, owner decisions)
- **Top bar (T04): the mockup's new look is APPROVED and applies to the live app**, together with the new arrangement: Ask Mira at the left as the wide green-tinted pill with its hint, a divider before the controls at the right (family selector, + Add data, divider, theme toggle), softer corners (search spec section 1). This is the one deliberate exception to "existing screens do not change". The orchestrator does T04's logic (slot, order, logout clearing); the look may go to an Antigravity packet from the mockup's measurements once the logic is in and tested.
- The registry reads F's section list (`frontend/src/lib/pageSections.ts`): Overview 6 sections, Other Analytics 3 (see F's amendment).
- Round 1 lanes (see `Docs/orchestration/2026-11-20-m3-lane-plan.md`) are search-be-1 (Codex), search-fe-1 and search-fe-2 (Antigravity); T04 and T05 are the orchestrator's.
