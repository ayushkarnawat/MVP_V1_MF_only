# Packet G6 for Gemini (Antigravity): Home page assembly and route flip (Home front-end run 5 of 5)
**Status:** READY FOR GEMINI (written 26 Oct 2026). **Worker:** Gemini in Antigravity (Flash, high). **Orchestrator and verifier:** Claude Code. **Branch and folder:** `feat/home-frontend`, in the git worktree `/home/ayush/wt/home-fe` on WSL (open it in Antigravity as `W:\home\ayush\wt\home-fe`). G4 (allocation) and G5 (movers, worth a look) are already merged into this branch; nobody else works in this folder.
**Parent plan:** `Docs/superpowers/plans/2026-10-23-home-frontend-plan.md` task T11 (the page and the route); T10 (News) is **out of scope**: this packet leaves one marked, empty slot. Signed-off copy and structure: the mockup `Docs/orchestration/2026-10-23-home-design-mockups.html`, layout `2026-10-23-home-layout.md` sections 1 to 4, register `ui-redesign-decisions-register.md` (C83, C99, C106, C107, L9). This packet is the whole truth for this run: where the plan and this packet differ, **this packet wins**. Method: `Docs/orchestration/2026-10-26-execution-plan-v2.md` sections 2 to 4. Data shapes: `frontend/src/features/home/types.ts`; real backend responses: the 29 golden fixtures in `frontend/src/features/home/fixtures/` (orchestrator-owned, never edit).

## What this run is, in one paragraph
The tests are **already written and committed red** (six new test files, a test support file, edits to nine older test files). Write **three new files and make two one-line-sized edits** so that they pass, one step at a time, running the checkpoint command after every step and keeping the real output. Do not change any test, `types.ts`, a fixture or the test support file. The page is **connected**: it reads the family or member scope and the import opener from the shell, loads each section through `useHomeSection` (one section never blocks another), keeps the page state (period, custom range, benchmark, hide values, movers grouping) and passes everything to the section components built in earlier runs. All presentation stays in those components.

## Rules (read twice)
1. **Scope.** Create **only** the three files and make **only** the two edits in section 3. Anything else (tests, `types.ts`, fixtures, `testing/`, `package.json`, earlier components) is out of bounds.
2. **Never edit a test to make it pass.** If a test seems wrong, stop and describe it in the report (the orchestrator validated every test against a working solution and fixed the brittle ones on the way).
3. **Run the checkpoint command after every step** and keep its real output for the report; fix your code, not the test.
4. **No new dependency, no `npm install`.**
5. **No float formatting of money or percentages.** Never `parseFloat`, `toFixed` or `Intl` in any Home file, **comments included** (a guard test greps whole file text). The page formats nothing itself: every displayed value comes from the section components.
6. **No hard-coded colours in `.tsx` files** (no `#` followed by hex digits, no `rgb(`, comments included): the page needs none. **Other features may not be imported** (`../../shell/...` and `../../lib`, `@/components/ui/...` are allowed; `../dashboard`, `../auth/...` except `../auth/session` are not).
7. **Exact strings, test ids and class names.** Every test id, attribute and class token in section 4 must be used exactly as written. A `data-testid` wrapper has no other role: do not add roles or labels to them.
8. **Do not refactor, rename or "improve" anything outside the file map.** 2-space indentation, double quotes, semicolons, `@/` imports for project code (the existing Home files use relative imports for neighbours; follow section 4 exactly).
9. **If anything differs from this packet, stop and report it.**
10. **Run every command inside WSL** (Step 0).

## Step 0: environment check (do this first, and report the output)
The folder is opened as `W:\home\ayush\wt\home-fe`; **every command (`git`, `npm`, `npx`, `grep`, `cd`) runs inside WSL**: `wsl.exe -d Ubuntu --cd /home/ayush/wt/home-fe -- <command>` for git, `wsl.exe -d Ubuntu --cd /home/ayush/wt/home-fe/frontend -- <command>` for npm/npx; a command containing `|` is run as `... -- bash -c "<command>"`.
Run and report the output of each:
```
git branch --show-current          # expect: feat/home-frontend
git log --oneline -4               # expect the top line to start with: test(home): failing tests for the Home page assembly
git status --short                 # expect: nothing printed
cd frontend && npx tsc -b          # expect exactly 5 errors, all "Cannot find module": './HomePage' (3 test files), './homeToday', './useStaleWhileLoading'
npx vitest run src/features/home/sections/WealthCard.test.tsx   # expect: 30 passed (the earlier runs are present)
npx vitest run src/features/home                                # expect: Test Files 6 failed | 27 passed (33); Tests 1 failed | 393 passed (394)  (red state)
npx vitest run src/shell src/App.test.tsx                       # expect: Test Files 2 failed | 25 passed (27); Tests 2 failed | 346 passed (348)  (the two route-flip tests are red)
```
State which way you run commands and whether you can edit files. If any expectation fails, **stop and report**.

## Goal
The Home page itself: the greeting, the wealth card, the glance card, the allocation and family section, the movers, "worth a look" and a marked news slot, laid out as signed off, each loaded on its own, with the controls wired (period, custom range, benchmark, hide values, movers grouping, family member selection) and with Home switched on as the real `/home` page.
**Non-goals:** no change to any section component, to the kit, to `types.ts` or to the shell except the one route file; no news (slot only); no failed-import banner (no data source exists yet, see the orchestrator notes); no analytics tracking; no per-class popup (`onClassClick` is not passed); fund links stay greyed inside the sections.

## 3. File map
**Create (3), all under `frontend/src/features/home/`:**
- `homeToday.ts`
- `useStaleWhileLoading.ts`
- `HomePage.tsx`

**Edit (2, nothing else in these files):**
- `frontend/src/features/home/api.ts`: in `homePath`, the member branch becomes `` base = `/household-members/${encodeURIComponent(scope.memberId)}/home/${section}`; `` (register L9).
- `frontend/src/shell/routes/home.route.tsx`: `status: "live"` and `page: () => import("../../features/home/HomePage")` (the route flip, Step 5). Every other field stays as it is.

**Do not touch:** every `*.test.ts(x)` file, `features/home/testing/`, `types.ts`, `fixtures/`, `package.json`, `package-lock.json`, `src/index.css`, the rest of `src/shell/**`, `src/components/ui/**`, `src/lib/**`, everything created in earlier runs, anything under `backend/` or `Docs/`.
**Tests to satisfy (committed; read each before its step):** `homeToday.test.ts`, `api.encode.test.ts`, `useStaleWhileLoading.test.tsx`, `HomePage.test.tsx`, `HomePage.controls.test.tsx`, `HomeRoute.test.tsx`; `fixtures/fixtures.test.ts` (now 29 files, already green); the nine older test files the orchestrator edited for the flip (`src/App.test.tsx` and eight under `src/shell/`: read them, do not edit them); `guards.test.ts` is checked at the end and scans your new files. `features/home/testing/homeApi.ts` is the fake backend the page tests use: read it to see exactly which URLs the page may call and how.
**Available to import:** `./api` (`getHomeSummary`, `getBenchmarks`, `getAllocation`, `getWorthALook`, `getWealthSeries`, `getMovers`), `./useHomeSection` (`useHomeSection`, `HomeSection`), `./components/benchmarkChoice` (`pickBenchmark`, `readStoredBenchmark`, `writeStoredBenchmark`), `./components/DateRangeCalendar` (type `DateRange`), the six sections under `./sections/` (read their props interfaces), `./types`, and from the shell `useScope` and `useImport` (`../../shell/scope/ScopeContext`) and `MiraComingSoonDialog` (`../../shell/mira/MiraComingSoonDialog`).

## 4. Specifications

### Step 1: `homeToday.ts` and the `api.ts` edit
Read `homeToday.test.ts` (4 tests) and `api.encode.test.ts` (3 tests).
- `homeToday.ts` exports `istToday(now: Date = new Date()): string`: the Indian calendar date as `YYYY-MM-DD`: `new Date(now.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10)` (IST is UTC+5:30; the backend counts days in IST).
- Make the `api.ts` edit from section 3.
**Checkpoint 1** (from `frontend/`): `npx vitest run src/features/home/homeToday.test.ts src/features/home/api.encode.test.ts src/features/home/api.test.ts` → expect **Test Files 3 passed, Tests 23 passed** (4 + 3 + 16 older).

### Step 2: `useStaleWhileLoading.ts`
Read `useStaleWhileLoading.test.tsx` (6 tests). Export the type `StaleAwareSection<T> = HomeSection<T> & { refreshing: boolean }` and the hook
`useStaleWhileLoading<T>(section: HomeSection<T>, resetKey: string): StaleAwareSection<T>`.
Why: when the period, benchmark or movers grouping changes, `useHomeSection` goes back to `loading`, which would replace the whole card with a skeleton and unmount the control the user just pressed (keyboard focus is lost). This hook keeps showing the last data **as data** while the same scope reloads.
- State: `useState<{ key: string; data: T } | null>(null)` called `kept`.
- During render (setting state in render is allowed here, it is the pattern `useHomeSection` itself uses): when `section.status === "data"` and `section.data !== null`, and `kept` is `null` or its `key !== resetKey` or its `data !== section.data`, call `setKept({ key: resetKey, data: section.data })`. When `section.status === "error"` and `kept !== null`, call `setKept(null)` (an error, then a retry, must not bring old data back).
- Return: when `section.status === "loading"` and `kept !== null` and `kept.key === resetKey`: `{ ...section, status: "data", data: kept.data, refreshing: true }`. Otherwise `{ ...section, refreshing: false }`.
**Checkpoint 2:** `npx vitest run src/features/home/useStaleWhileLoading.test.tsx` → expect **6 passed**.

### Step 3: `HomePage.tsx`, structure and loading (checkpoint 3)
Read `HomePage.test.tsx` (31 tests) and `testing/homeApi.ts`. Export `HomePage` as a named export **and** as the default export: `export function HomePage({ today }: { today?: string } = {})`, then `export default HomePage;`. `today` is an ISO date for tests; when absent use `istToday()`.

**Scope and shell.** `const { viewMode, memberId, scopeKey, selectedMember, setMember, setAggregate } = useScope();` and `const { openImport } = useImport();`. `const scope: HomeScopeArg = { viewMode, memberId };` (type from `./types`). The page opens in whatever scope the shell gives (the shell already starts every visit in Family Combined); the page never stores scope itself.

**Page state (all `useState`, nothing persisted except the benchmark):**
- `period: HomePeriod`, initial `"1M"`.
- `appliedRange: { from: string; to: string } | null`, initial `null` (the custom range that is in force).
- `draftRange: DateRange`, initial `{ from: null, to: null }` (what the calendar shows while the user is choosing).
- `chosenBenchmark: string | null`, initial `readStoredBenchmark()` (lazy initialiser).
- `hidden: boolean`, initial `false` (resets on every visit because it is plain component state).
- `moversView: MoversView`, initial `"sector"`.
- `miraOpen: boolean`, initial `false`.

**Sections (each its own `useHomeSection`, so each loads, fails and retries alone).** The loader closes over `scope`; the dependency array decides when it reloads:
- `summary = useHomeSection(signal => getHomeSummary(scope, signal), [scopeKey])`
- `benchmarks = useHomeSection(signal => getBenchmarks(scope, signal), [scopeKey])`
- `allocation = useHomeSection(signal => getAllocation(scope, signal), [scopeKey])`
- `worth = useHomeSection(signal => getWorthALook(scope, signal), [scopeKey])`
- the wealth series and the movers (Step 4), because they take the controls.

**Benchmark.** `benchmarkOptions = benchmarks.data?.options ?? []`; `benchmarkSettled = benchmarks.status !== "loading"`; `benchmark = benchmarks.data ? pickBenchmark(benchmarks.data.options, chosenBenchmark, benchmarks.data.recommended_index) : null`.

**Wealth series.** The backend adds no benchmark unless the page names one, so the page waits until the benchmark list has answered (success **or** failure) before asking for the series, and then asks exactly once. Use this helper (module level, not exported):
```ts
// A request that waits until the page cancels it: used while the wealth series is not ready to be asked for.
function idleUntilAborted<T>(signal: AbortSignal): Promise<T> {
  return new Promise<T>((_, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
}
```
and this section:
```ts
const wealthRaw = useHomeSection<WealthSeriesResponse>(
  signal => {
    if (!benchmarkSettled) return idleUntilAborted(signal);
    if (period === "custom") {
      if (!appliedRange) return idleUntilAborted(signal);
      return getWealthSeries(scope, { period, from: appliedRange.from, to: appliedRange.to, benchmark: benchmark ?? undefined }, signal);
    }
    return getWealthSeries(scope, { period, benchmark: benchmark ?? undefined }, signal);
  },
  [scopeKey, period, appliedRange?.from ?? null, appliedRange?.to ?? null, benchmarkSettled, benchmark],
);
const wealth = useStaleWhileLoading(wealthRaw, scopeKey);
```
`from` and `to` are sent only for `custom`; the benchmark is left out (not an empty string) when `null`.

**No holdings.** `noHoldings = summary.status === "data" && summary.data !== null && !summary.data.has_holdings`. While the summary is still loading or failed, nothing is hidden.

**Layout (exact test ids and class tokens).** A root `<div data-testid="home-page" className="space-y-6">` with, in this order:
1. `<div data-testid="home-greeting">` holding `Greeting` (`status={summary.status}`, `summary={summary.data}`, `onImport={openImport}`).
2. `<div data-testid="home-wealth">` holding `WealthCard` (Step 4 lists the props).
3. Only when `!noHoldings`, a fragment with:
   - `<div data-testid="home-grid" className="grid gap-6 xl:grid-cols-2">` containing, in this DOM order (which is also the stacking order below 1280 px):
     - `<div data-testid="home-glance" className="empty:hidden xl:col-start-1">` holding `Glance` (`status={glanceStatus}`, `summary={summary.data}`, `movers={movers.data}`, `onOpen={() => setMiraOpen(true)}`);
     - `<div data-testid="home-allocation" className="xl:col-start-2 xl:row-span-2 xl:row-start-1">` holding `Allocation` (`status`, `data`, `scope={viewMode}`, `memberName={selectedMember?.name ?? null}`, `onSelectMember={setMember}`, `onShowFamily={setAggregate}`, `onRetry={allocation.retry}`; **no** `onClassClick`);
     - `<div data-testid="home-movers" className="xl:col-start-1">` holding `Movers` (`status={movers.status}`, `data={movers.data}`, `view={moversView}`, `onViewChange={setMoversView}`, `onRetry={movers.retry}`);
   - `<div data-testid="home-worth" className="empty:hidden">` holding `WorthALook` (`status={worth.status}`, `data={worth.data}`);
   - **the news slot**, exactly: `{/* NEWS SLOT (plan T10): the News section mounts here once the news backend exists. Nothing is fetched yet. */}` followed by `<div data-testid="home-news-slot" aria-hidden="true" />` (empty: no children, no text, no request).
4. Last, outside the conditional: `<MiraComingSoonDialog open={miraOpen} onOpenChange={setMiraOpen} />`.
No `PageLayout`, no `<main>` and no page title: the shell supplies the frame and the greeting is the page's only `h1`.

**Glance status.** `"error"` when `summary.status === "error"`; otherwise `"loading"` when `summary.status === "loading"` or `movers.status === "loading"`; otherwise `"data"` (a failed movers request still shows the glance card, without its mover clause).
**Checkpoint 3:** `npx vitest run src/features/home/HomePage.test.tsx` → expect **31 passed**. (Steps 3 and 4 are one file: write Step 4's handlers first if the structure alone cannot compile, then run the checkpoint.)

### Step 4: `HomePage.tsx`, controls and wiring (checkpoint 4)
Read `HomePage.controls.test.tsx` (24 tests).
- **Movers** section, written like the wealth one: `moversRaw = useHomeSection(signal => getMovers(scope, moversView, signal), [scopeKey, moversView])` and `movers = useStaleWhileLoading(moversRaw, scopeKey)`. Changing the grouping therefore asks only for the movers, keeps the card and the grouping buttons on screen (focus stays on the pressed button), and a scope change still shows skeletons.
- **Period.** `handlePeriodChange(next)`: when `next === "custom"` and there is no `appliedRange`, do nothing (the calendar inside the card collects the dates first, and the previous period stays selected); otherwise `setPeriod(next)`. Choosing `1D`, `1W`, `1M` or `1Y` after a custom range goes back to a preset and sends no `from` or `to`; choosing Custom again re-applies the earlier range.
- **Custom range.** `handleRangeChange(range)`: `setDraftRange(range)`; and only when both `range.from` and `range.to` are set, `setAppliedRange({ from: range.from, to: range.to })` and `setPeriod("custom")`. One chosen date alone never triggers a request.
- **Benchmark.** `handleBenchmarkChange(index)`: `setChosenBenchmark(index)` and `writeStoredBenchmark(index)` (remembered per device; the helper already guards blocked storage).
- **Import.** `importForScope = () => { if (viewMode === "member" && memberId) openImport(memberId); else openImport(); }` (call `openImport()` with **no argument** for the family: a test checks the call has no arguments).
- **`WealthCard` props:** `status={wealth.status}`, `data={wealth.data}`, `scope={viewMode}`, `memberName={selectedMember?.name ?? null}`, `period={period}`, `onPeriodChange={handlePeriodChange}`, `customRange={draftRange}`, `onCustomRangeChange={handleRangeChange}`, `today={todayIso}`, `benchmarkOptions={benchmarkOptions}`, `benchmark={benchmark}`, `onBenchmarkChange={handleBenchmarkChange}`, `hidden={hidden}`, `onToggleHidden={() => setHidden(value => !value)}`, `onRetry={wealth.retry}`, `onImport={importForScope}`, `onInfo={() => setMiraOpen(true)}`. (`todayIso = today ?? istToday()`.)
- **Hide values** affects only what `WealthCard` hides (the big number and its change); the other sections are unchanged.
- **Mira.** The glance card and the wealth card's "How is this calculated?" button both open the shared dialog (`miraOpen`).
**Checkpoint 4:** `npx vitest run src/features/home/HomePage.test.tsx src/features/home/HomePage.controls.test.tsx` → expect **Test Files 2 passed, Tests 55 passed** (31 + 24).

### Step 5: the route flip
Read `HomeRoute.test.tsx` (6 tests) and the nine edited older tests. Edit `frontend/src/shell/routes/home.route.tsx`: `status: "live"` and `page: () => import("../../features/home/HomePage")`; nothing else in the file changes. `/home` (and `/`, which redirects to it) now shows the Home page; the old Dashboard route `/portfolio/mutual-funds` is untouched and keeps working.
**Checkpoint 5:** `npx vitest run src/features/home/HomeRoute.test.tsx src/shell src/App.test.tsx` → expect **Test Files 28 passed, Tests 354 passed** (6 + 339 shell + 9 App). If one shell test fails once with a timeout and passes when its file is run alone, run it alone and report it (the machine can be loaded; `portedFlow.test.tsx` is known to be slow).

### Step 6: final checks (from `frontend/`, in this order; paste every output)
```
npx tsc -b                                          # expect: no output
npx oxlint src/features/home                        # expect: Found 0 warnings and 0 errors
npx vitest run src/features/home                    # expect: Test Files 33 passed, Tests 465 passed
npx vitest run src/shell src/App.test.tsx           # expect: Test Files 27 passed, Tests 348 passed
npx vitest run src/components/ui/charts src/lib src/styles   # expect: Test Files 16 passed, Tests 188 passed
npm run build                                       # expect: "built in" with no error (a chunk-size warning is normal)
npx vitest run                                      # expect: Test Files 200 passed, Tests 2017 passed (on a loaded machine an unrelated file can time out: re-run that file alone and report it)
cd .. && git status --short                         # expect exactly the five lines below
```
Expected `git status --short`:
```
 M frontend/src/features/home/api.ts
 M frontend/src/shell/routes/home.route.tsx
?? frontend/src/features/home/HomePage.tsx
?? frontend/src/features/home/homeToday.ts
?? frontend/src/features/home/useStaleWhileLoading.ts
```
**Do not commit and do not push.** The orchestrator verifies and commits.

## Stop conditions
Stop and report if: Step 0 does not match; a checkpoint still fails after two honest attempts; a test appears to contradict this packet; you would need to edit a file outside section 3; a command needs `npm install`.

## Report (fill in at the end, in one fenced block, with the real command outputs)
```
GEMINI REPORT — ui-redesign — G6 (Home page assembly and route flip)
Model and tool:    Date/time:
0. ENVIRONMENT: WSL terminal or wsl.exe prefix? Could you edit files? Step 0 outputs (all seven):
1. FILES CREATED AND EDITED (exact paths):
2. CHECKPOINTS: for each of 1 to 5, the command and the last lines of its output (passed counts):
3. FINAL CHECKS (step 6), full outputs:
4. ANYTHING THAT DIFFERED FROM THE PACKET, and what you did:
5. TESTS THAT SEEMED WRONG (if any), with the exact failing assertion:
6. THINGS YOU COULD NOT DO OR VERIFY:
7. CONFIRMATIONS: tests untouched: yes/no; types.ts, fixtures and testing/ untouched: yes/no; files outside the file map untouched: yes/no; no npm install: yes/no; nothing committed: yes/no
```

## Orchestrator notes (not for Gemini)
- **Validation:** the tests were validated against a private Sonnet-built reference (`~/home-fe-ref6`: `tsc` clean, `oxlint` 0 warnings, Home folder 465 tests, shell plus App 348, charts/lib/styles 188, whole suite 200 files and 2017 tests, build clean); the counts above come from that run. A 17-mutation check of `HomePage.tsx` (no wait for the benchmark list, no stale-keeping on wealth or movers, wrong dependency lists, hidden empty state, member import, custom without range, benchmark not stored, glance ignoring movers loading, news slot with content, wrong grid column, sends from/to always, family link unwired, wrong retry, worth shown when empty) was caught 16 times; the survivor was an equivalent mutant. Red state in the worktree: Home folder 6 files fail to load and 1 test fails (`api.encode`), shell plus App 2 tests fail (the flip). **Tests found brittle or wrong and fixed (the reference is untouched by these):** (1) "starts from the remembered benchmark" raced the client GET cache (the first visit's request finished after the second `mockHomeApi()` cleared the cache): the test now waits for the first visit to settle; (2) "applies the earlier range again" counted fetches although the identical request is served from the 60-second client cache: it now asserts the screen; (3) the route test searched for "Coming soon", which the allocation and worth sections also print: it now asserts the h1; (4) under the whole-suite run (many files in parallel) 1-second `findBy` queries timed out: the three page test files now set `asyncUtilTimeout` to 5000 ms; (5) `homeApi.ts` used a constructor parameter property that `erasableSyntaxOnly` forbids (a type error, found by `tsc`).
- **The flip ripple:** making Home live changes 14 existing tests that used the real registry and relied on `/home` being the Coming soon placeholder (`AppLink`, `useAppNavigate`, `modeMemory`, `Sidebar`, `ShellRoot`, `AppLayout`, `portedFlow`, `wrappers`, `App`). They were edited before this packet, not by Gemini: the ones that use Home as the placeholder example now map it to `placeholder`; the ones that render `/home` mock `features/home/HomePage` as `<h1>Home</h1>` (the existing pattern for Dashboard and Planning); `wrappers.test` now lists `home` among the live routes; `App.test` now expects no Coming soon text. `portedFlow.test.tsx` ("records Analytics and Planning URLs...") is flaky under load in the worktree (passes alone); it is unrelated to this change.
- **Fixtures:** the backend set had grown to 29 files; the four new ones (`summary_statement_priced_fund`, `wealth_1m_fund_sold_in_period`, `wealth_1m_statement_priced_fund`, `wealth_custom_past_range`) are copied in and `fixtures.test.ts` now asserts 29 and, when the backend folder is in the checkout, that every file there has an identical copy (so the next backend change fails a front-end test).
- **Route flip choice (proposed register entry C119).** The plan says to replace `home.route.tsx` and set it live; no feature flag or environment switch exists anywhere in the front end (searched), and the shell contract (decision SF1 B) says `/home` shows Coming soon "until the Home PR sets its status to live". Options: (A) flip in this packet, one two-field edit, reversible by one revert, the old Dashboard stays at `/portfolio/mutual-funds`; (B) add an environment flag (new machinery, a second code path to test, nothing in the plan asks for it); (C) leave the placeholder and flip at integration I1 (the page would ship untested in the shell). **Chosen: A**, because the redesign branch ships as one unit (nothing is live for users before the new link), the flip is what the plan's T11 asks for, and the 14 affected tests were updated and pass both before and after the flip (except the two that assert the flip itself). If the owner prefers C, drop Step 5 and the route edit and revert the two flip assertions.
- **Choices to record:** page state is local (no URL parameters: the plan has none for Home; scope comes from the shell); the wealth request waits for the benchmark list so the first visit makes one request, and a failed list means a series without a benchmark; the wealth card and the movers keep their last data while the same scope reloads (focus and layout stay stable) while any scope change shows skeletons, never stale numbers; Custom needs a complete range before it takes effect (the previous period stays highlighted while the calendar is open); the client GET cache means returning to an earlier period within 60 seconds makes no new request; the info button and the glance card both open the Ask Mira dialog; no-holdings hides everything below the wealth card including the news slot; Glance waits for both the summary and the movers before it shows (a skeleton only until the first movers answer; a later grouping change keeps it on screen because the movers keep their last data); register L9 (member id encoding) is closed by Step 1; fixtures 25 to 29.
- **Questions for the owner (at most five):** (1) flip `/home` now (option A) or at integration? (2) the failed-import banner and "Your statement is being processed" note (layout F3, decision H10) have no data source in the front end (the import opener only opens the flow and the post-import notice goes to the Dashboard): is a backend import-status route wanted, or do the two states wait? (3) register C99 says the greeting's top mover becomes a link to the movers popup "with page assembly": `Greeting` has no prop for it, so it needs a small G3 change plus a popup trigger on `Movers`: do it now or later? (4) Hide values: only the wealth number and its change (the plan), or also the allocation, movers and family amounts? (5) the glance sentence names the top mover of the grouping the user has selected (sector, category or fund), so it can change wording when the grouping changes: pin it to the sector view instead (one extra request)? Register L13 (a fund redeemed on the latest price date counts in the day's change) is still open for the parity step.
