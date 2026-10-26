# Packet G2 for Gemini (Antigravity): Home foundations and controls (Home front-end run 1 of 5)
**Status:** READY FOR GEMINI (written 26 Oct 2026). **Worker:** Gemini in Antigravity (Flash, high). **Orchestrator and verifier:** Claude Code. **Branch and folder:** `feat/home-frontend`, in the git worktree `/home/ayush/wt/home-fe` on WSL (open it in Antigravity through the Windows drive `W:` as `W:\home\ayush\wt\home-fe`). Only this one folder and branch are yours; do not touch the main checkout `D:\Unifolio code` or the folder `ui-kit`.
**Parent plan:** `Docs/superpowers/plans/2026-10-23-home-frontend-plan.md` tasks T1, T2, T3 and T5. This packet is the whole truth for this run: where the plan and this packet differ, **this packet wins**. Method and reasons: `Docs/orchestration/2026-10-26-execution-plan-v2.md`, sections 2 to 4. The API shapes you code against are in `frontend/src/features/home/types.ts` (already in the folder; it is the contract, do not edit it).

## What this run is, in one paragraph
The tests are **already written and committed** (eight new test files plus a guards file, all failing because nothing is implemented) together with `types.ts`. Your job is to write nine implementation files so that those tests pass, one step at a time, running the checkpoint command after every step and keeping the real output. You must not change any test and not `types.ts`. This run builds the foundations of the Home page (colour aliases, formatting helpers, the API client and a data hook) and three small controls (period buttons, benchmark dropdown, date-range calendar). No page and no route is built here.

## Rules (read twice; these are the rules Gemini runs most often break)
1. **Scope.** You may create or edit **only** the nine files in section 3. Anything else, including any test file, `types.ts` and `package.json`, is out of bounds.
2. **Never edit a test to make it pass.** If a test seems wrong, stop and describe it in the report (the orchestrator wrote every test and validated it against a working solution, so a failing test means your code differs from the specification).
3. **Run the checkpoint command after every step** and keep its real output for the report. Do not claim a step passes without the output. If a command fails, fix your code (not the test), run it again, and only then continue.
4. **No new dependency** and **no `npm install`.** Use what is installed (React 19, `@testing-library/react`, vitest, `lucide-react`). There is no calendar library: the calendar is hand-built.
5. **No float arithmetic on money or percentages.** Amounts are decimal strings; use the helpers in `src/lib/format.ts`. Never `parseFloat`, `toFixed` or `Intl` in any Home file, **comments included** (a guard test greps the whole file text for those words).
6. **No hard-coded colours in `.tsx` files.** Use CSS variables only (`var(--ui-text)`, `var(--pos-bg)`, `var(--home-bench)`, and so on); a guard test greps for `#` followed by 3 to 8 hex characters and for `rgb(`, comments included. Other features may not be imported (relative or through the `@/features/...` alias) except `../auth/session`.
7. **Exact strings.** Every user-visible string, accessible name, attribute and file name in section 4 must be used exactly as written.
8. **Do not refactor, rename or "improve" anything outside the file map.** Match the surrounding code: 2-space indentation, double quotes, semicolons. Do not add comments about the task.
9. **If anything differs from this packet** (a file is missing, a command prints something unexpected, a symbol does not exist) **stop and report it**; do not improvise.
10. **Run every command inside WSL** (see Step 0). Never run `git`, `npm` or `npx` as plain Windows commands in this folder.

## Step 0: environment check (do this first, and report the output)
The folder lives on WSL's disk and is opened in Antigravity through the Windows drive `W:` (`W:\home\ayush\wt\home-fe` is the same folder as `\\wsl.localhost\Ubuntu\home\ayush\wt\home-fe`). **Every command (`git`, `npm`, `npx`, `grep`, `cd`) must run inside WSL.** If your terminal is a Windows terminal, prefix each command: `wsl.exe -d Ubuntu --cd /home/ayush/wt/home-fe -- <command>` for git commands and `wsl.exe -d Ubuntu --cd /home/ayush/wt/home-fe/frontend -- <command>` for npm/npx commands. Windows PowerShell treats `|` as a pipe, so run any command containing `|` as `... -- bash -c "<command>"`.
Run, from `/home/ayush/wt/home-fe`, and report the output of each:
```
git branch --show-current          # expect: feat/home-frontend
git log --oneline -4               # expect the top line to start with: test(home): failing tests for the Home foundations
git status --short                 # expect: nothing printed
cd frontend && npx tsc -b          # expect: errors only about the missing modules (this is the red state), nothing else
npx vitest run src/lib/format.test.ts   # expect: 29 passed (the shared kit is present)
npx vitest run src/features/home/homeFormat.test.ts   # expect: FAIL, "Failed to resolve import ./homeFormat"
```
State which way you run commands (WSL terminal or `wsl.exe` prefix) and whether you can edit files in the folder. If any expectation fails, **stop and report**.

## Goal
Give the Home page its building blocks: scoped colour aliases, number and date formatting on top of the shared kit, a typed API client for the six Home endpoints, a data hook with cancellation, and the period, benchmark and date-range controls.
**Non-goals:** no page, no section component, no route, no chart, no change to anything under `src/shell/`, `src/components/ui/`, `src/lib/` or `src/styles/`, no new package.

## 3. File map
**Create (9), all under `frontend/src/features/home/`:**
- `home-tokens.css`
- `homeFormat.ts`
- `api.ts`
- `useHomeSection.ts`
- `components/calendarMath.ts`
- `components/benchmarkChoice.ts`
- `components/PeriodSelector.tsx`
- `components/BenchmarkSelect.tsx`
- `components/DateRangeCalendar.tsx`
**Do not touch:** every `*.test.ts(x)` file, `features/home/types.ts`, `frontend/package.json`, `package-lock.json`, `src/index.css` (the Home page imports `home-tokens.css` in a later run), anything under `backend/` or `Docs/`.
**The tests you must satisfy (already committed; read each before its step; they are the contract):** `home-tokens.test.ts`, `homeFormat.test.ts`, `api.test.ts`, `useHomeSection.test.tsx`, `components/calendarMath.test.ts`, `components/benchmarkChoice.test.ts`, `components/PeriodSelector.test.tsx`, `components/BenchmarkSelect.test.tsx`, `components/DateRangeCalendar.test.tsx`, and `guards.test.ts` (checked at the end).

## 4. Specifications

### Step 1: `home-tokens.css`
Create exactly this content (data, not logic). It is not imported anywhere yet.
```css
/* Home-only colour aliases. The data-viz, semantic and surface tokens come from palette-tokens.css (the shared kit). */
:root {
  --home-bench: var(--c3);
  --home-pos-border: #EAFBF0;
  --home-neg-border: #F6C6C7;
  --home-warn-border: #FCE0B0;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --home-bench: var(--c3);
    --home-pos-border: rgba(34, 197, 94, 0.35);
    --home-neg-border: rgba(248, 113, 113, 0.35);
    --home-warn-border: rgba(251, 191, 36, 0.35);
  }
}

[data-theme="dark"] {
  --home-bench: var(--c3);
  --home-pos-border: rgba(34, 197, 94, 0.35);
  --home-neg-border: rgba(248, 113, 113, 0.35);
  --home-warn-border: rgba(251, 191, 36, 0.35);
}
```
**Checkpoint 1** (from `frontend/`): `npx vitest run src/features/home/home-tokens.test.ts` → expect **9 passed**.

### Step 2: `homeFormat.ts`
Re-export from `../../lib/format` (the same functions, not copies): `formatRupees`, `formatCompactRupees`, `formatPercent`, `formatDate`, `scoreBand`. Then add these exports. Values are decimal **strings** (`string | null | undefined`); the dash is `—` (U+2014). Read `homeFormat.test.ts` for every case.
- `changeDirection(value): "up" | "down" | "flat"`: after `trim()`, match `^([+-]?)(\d+)(?:\.(\d*))?$`; unreadable, empty, null or undefined → `"flat"`; all digits zero (including `-0.00`) → `"flat"`; otherwise `"up"` for no sign or `+`, `"down"` for `-`. Do not convert to a number: look at the digits.
- `formatSignedRupees(value)`: `text = formatRupees(value)`; if `text` is `—` return it; if `text` is `₹0` return `₹0`; if it starts with `-` return it; otherwise return `"+" + text`.
- `formatSignedCompactRupees(value)`: the same rule over `formatCompactRupees`.
- `formatSignedPercent(value, digits = 2)`: `formatPercent(value, { digits, signed: true })`.
- `formatDayMonth(iso)`: `text = formatDate(iso)`; if it is `—` return `—`; otherwise the first two space-separated parts (`"23 Oct 2026"` → `"23 Oct"`).
- `formatAsOf(iso): string | null`: `null` when `formatDayMonth(iso)` is `—`, otherwise `` `as of ${formatDayMonth(iso)}` ``.
- `greetingLine(greeting: "morning" | "afternoon" | "evening", name: string): string`: `` `Good ${greeting}, ${name.trim()}` `` or, when the trimmed name is empty, `` `Good ${greeting}` ``.
**Checkpoint 2:** `npx vitest run src/features/home/homeFormat.test.ts` → expect **26 passed**.

### Step 3: `api.ts`
Imports: `API_BASE_URL`, `ApiError`, `cachedFetch`, `parseErrorDetail` from `../../lib/apiClient`; `getToken` from `../auth/session`; types from `./types`. Copy the private `authFetch` pattern of `src/features/dashboard/api.ts` (bearer token header only when a token exists; `cachedFetch(`${API_BASE_URL}${path}`, { ...options, headers })`; on `!res.ok` throw `new ApiError(res.status, await parseErrorDetail(res))`), but keep it private to this file.
Exports (read `api.test.ts`, 16 tests):
- `homePath(scope: HomeScopeArg, section: HomeSectionName, query?: Record<string, string | undefined>): string`: aggregate → `/household/aggregate/home/${section}`; member → `/household-members/${scope.memberId}/home/${section}`, throwing `new Error("memberId is required for member scope")` when `memberId` is null. Query: build a `URLSearchParams` appending, in insertion order, only entries whose value is a non-empty string; append `?` + the string only when it is not empty.
- `getHomeSummary(scope, signal?)`, `getAllocation(scope, signal?)`, `getWorthALook(scope, signal?)`, `getBenchmarks(scope, signal?)`: GET the section; return the parsed JSON typed as `SummaryResponse`, `AllocationResponse`, `WorthResponse`, `BenchmarksResponse`.
- `getWealthSeries(scope, query: WealthSeriesQuery, signal?)`: query keys in this order: `period`, `from`, `to`, `benchmark`; returns `WealthSeriesResponse`.
- `getMovers(scope, by: MoversView, signal?)`: query `{ by }`; returns `MoversResponse`.
Every fetcher passes `{ signal }` to `authFetch` so the abort signal reaches `fetch`.
**Checkpoint 3:** `npx vitest run src/features/home/api.test.ts` → expect **16 passed**.

### Step 4: `useHomeSection.ts`
Export `useHomeSection<T>(load: (signal: AbortSignal) => Promise<T>, deps: readonly unknown[])` returning `{ status: "loading" | "data" | "error"; data: T | null; error: unknown; retry: () => void }` (also export the type `HomeSection<T>` for that return value). Read `useHomeSection.test.tsx` (7 tests).
- Behaviour: on mount and whenever the dependencies change, set `{status: "loading", data: null, error: null}` (never keep old numbers on screen), create an `AbortController`, call `load(controller.signal)`; on success set `data`; on failure set `error` unless the controller was aborted or the error is an `AbortError` (then ignore it). The effect cleanup aborts the controller, so a late answer of an earlier request can never overwrite a newer one. `retry()` loads again with the same dependencies.
- Implementation shape that works: keep the latest `load` in a ref (so an inline function does not retrigger the effect); `const key = JSON.stringify(deps)`; a `useState` for an `attempt` counter that `retry` increments; one `useEffect` whose dependency array is `[key, attempt]`; a `useState` holding the `{status, data, error}` object. Dependencies equal in content must not reload.
Also: an error that arrives after its request was aborted is ignored whatever its type (check `controller.signal.aborted`, and also ignore any error named `AbortError`); the dependencies must be JSON-serialisable (they are strings and numbers in practice).
**Checkpoint 4:** `npx vitest run src/features/home/useHomeSection.test.tsx` → expect **8 passed**.

### Step 5: `components/calendarMath.ts` and `components/benchmarkChoice.ts`
`calendarMath.ts` exports (read `calendarMath.test.ts`, 19 tests; all work on plain integers and ISO strings, no `Date` object needed for the arithmetic):
- `daysInMonth(year, month)` (month 1 to 12; leap years follow the Gregorian rule: divisible by 4 and not by 100, or by 400).
- `isoDate(year, month, day)` → `YYYY-MM-DD`, month and day zero-padded.
- `minSelectableDate(today: string, years = 10)` → the ISO date `years` years before `today` with the day clamped to the month's length (`2028-02-29` with 10 years → `2018-02-28`).
- `shiftMonth(year, month, delta)` → `{ year, month }` moved by `delta` months across year boundaries.
- `leadingBlanks(year, month)` → how many empty cells come before the 1st when the week starts on **Monday** (Monday = 0 … Sunday = 6). Compute the weekday of the 1st with a known algorithm (for example Sakamoto's) or `new Date(Date.UTC(year, month - 1, 1)).getUTCDay()` and convert Sunday-first to Monday-first.
- `monthTitle(year, month)` → `"October 2026"` (English month names).
`benchmarkChoice.ts` exports (read `benchmarkChoice.test.ts`, 6 tests): `BENCHMARK_STORAGE_KEY = "home.benchmark"`; `readStoredBenchmark(): string | null` and `writeStoredBenchmark(index: string): void`, both wrapped in `try/catch` so a blocked or full storage never throws (read returns `null` on any failure); `pickBenchmark(options: BenchmarkOptionOut[], stored: string | null, recommendedIndex: string): string | null`: the stored value if it is one of the options' `index` values; else the recommended index if it is one of them; else the first option's index; `null` when there are no options.
**Checkpoint 5:** `npx vitest run src/features/home/components/calendarMath.test.ts src/features/home/components/benchmarkChoice.test.ts` → expect **2 files, 25 tests passed**.

### Step 6: `components/PeriodSelector.tsx`
Export `PeriodSelector` with props `{ value: HomePeriod; onChange: (period: HomePeriod) => void; customLabel?: string; disabled?: boolean }`. Read `PeriodSelector.test.tsx` (8 tests).
- A `<div role="radiogroup" aria-label="Period">` with five `<button type="button" role="radio">` in this order and with this text: `1D`, `1W`, `1M`, `1Y`, `Custom` (the last shows `customLabel` instead when it is given); their values are `"1D" | "1W" | "1M" | "1Y" | "custom"`.
- `aria-checked` is `"true"` only on the button whose value equals `value`; `tabIndex` is `0` on that button and `-1` on the others (roving focus). Clicking a button calls `onChange(its value)` (also when it is already selected). `ArrowRight` / `ArrowLeft` on a button call `onChange` with the next / previous period in the order above, wrapping around (`custom` → `1D`, `1D` → `custom`); other keys do nothing. After a key press, move DOM focus to the newly selected button (use refs). `disabled` disables all five buttons.
- Style with Tailwind and CSS variables only: a pill group (`rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-card)] p-0.5`), selected button `bg-[var(--ui-elevated)] text-[var(--ui-text)] shadow-sm`, others `text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]`, keyboard focus `focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]`.
The arrow-key handler must call `event.preventDefault()` and move DOM focus (`element.focus()` on the button of the new period); a test checks the focus. Handling `ArrowUp`/`ArrowDown` like `ArrowLeft`/`ArrowRight` is allowed but not required.
**Checkpoint 6:** `npx vitest run src/features/home/components/PeriodSelector.test.tsx` → expect **9 passed**.

### Step 7: `components/BenchmarkSelect.tsx`
Export `BenchmarkSelect` with props `{ options: BenchmarkOptionOut[]; value: string | null; onChange: (index: string) => void; disabled?: boolean }`. Read `BenchmarkSelect.test.tsx` (5 tests).
- A native `<select aria-label="Benchmark">` (not the Radix select) with one `<option value={index}>` per option, in the given order; the text is the `label`, and `` `${label} (recommended)` `` for the option whose `recommended` is true. The value is `value ?? ""`. `onChange` receives the chosen option's `index` string. The select is disabled when `disabled` is true or there are no options.
- Style with Tailwind and CSS variables (`rounded-md border border-[var(--ui-divider)] bg-[var(--ui-elevated)] px-2 py-1 text-sm text-[var(--ui-text)]`, focus outline as in Step 6, disabled `cursor-not-allowed text-[var(--ui-disabled-text)]`).
**Checkpoint 7:** `npx vitest run src/features/home/components/BenchmarkSelect.test.tsx` → expect **5 passed**.

### Step 8: `components/DateRangeCalendar.tsx`
Export `DateRangeCalendar` and the type `DateRange = { from: string | null; to: string | null }` (ISO dates). Props: `{ today: string; value: DateRange; onChange: (range: DateRange) => void; maxYears?: number }` (`maxYears` defaults to 10). Read `DateRangeCalendar.test.tsx` (21 tests). It is **controlled for the range** and keeps only the visible month in its own state.
- **Visible month:** state `{year, month}`, initialised from `value.to ?? value.from ?? today`. Header: a `<span aria-live="polite">` with `monthTitle(year, month)`; a `<button type="button" aria-label="Previous month">` and a `<button type="button" aria-label="Next month">` (chevron icons from `lucide-react`; the buttons contain no digits). **Previous is disabled** when the visible month is the month of `minSelectableDate(today, maxYears)` (or earlier); **Next is disabled** when the visible month is the month of `today` (or later). They move by one month with `shiftMonth`.
- **Grid:** a `<table>`; `<thead>` with one row of `<th scope="col">` containing `Mo`, `Tu`, `We`, `Th`, `Fr`, `Sa`, `Su`; `<tbody>` rows of seven `<td>`: `leadingBlanks` empty cells, one cell per day with a `<button type="button">` whose text is the day number (`1`, `2`, …, no padding) and `aria-label` is `` `${day} ${monthName} ${year}` `` (for example `23 October 2026`), then empty cells to complete the last week.
- **Disabled days:** a day is `disabled` when its ISO date is after `today` or before `minSelectableDate(today, maxYears)` (compare ISO strings).
- **Click:** with `from` and `to` as in `value` and `clicked` the ISO date: if `from` is null or `to` is not null → `onChange({ from: clicked, to: null })`; otherwise (`from` set, `to` null): if `clicked < from` → `onChange({ from: clicked, to: null })`, else `onChange({ from, to: clicked })` (clicking the start day again gives a one-day range).
- **Marking:** let `end = value.to ?? value.from`. A day button gets `data-range` = `"single"` when `from` and `to` are both set and equal; `"start"` when it equals `from` (and `to` differs or is null); `"end"` when it equals `to` (and `from` differs); `"middle"` when strictly between `from` and `to`; no `data-range` attribute otherwise. `aria-pressed` is `"true"` when the day is inside `[from, end]` (inclusive) and `"false"` otherwise (when `from` is null nothing is pressed).
- Style with Tailwind and CSS variables: selected start/end `bg-[var(--pos)] text-[var(--ui-elevated)]`, middle `bg-[var(--pos-bg)] text-[var(--pos-text)]`, hover `hover:bg-[var(--ui-row-hover)]`, disabled `text-[var(--ui-disabled-text)] cursor-not-allowed`, today's cell nothing special. Day buttons about `h-8 w-8 rounded-md text-sm`.
**Checkpoint 8:** `npx vitest run src/features/home/components/DateRangeCalendar.test.tsx` → expect **21 passed**.

### Step 9: final checks (from `frontend/`, in this order; paste every output)
```
npx tsc -b                                          # expect: no output
npx oxlint src/features/home                        # expect: Found 0 warnings and 0 errors
npx vitest run src/features/home                    # expect: Test Files 10 passed, Tests 125 passed (the guards file included, 6 tests)
npx vitest run src/components/ui/charts src/lib src/styles   # expect: Test Files 16 passed, Tests 188 passed (nothing else broke)
npm run build                                       # expect: "built in" with no error (a chunk-size warning is normal)
cd .. && git status --short                         # expect only the nine new files under frontend/src/features/home
```
**Do not commit and do not push.** The orchestrator verifies and commits.

## Stop conditions
Stop and report (do not improvise) if: Step 0 does not match; a checkpoint still fails after two honest attempts; a test appears to contradict this packet; you would need to edit a file outside section 3; a command needs `npm install`.

## Report (fill this in at the end, in one fenced block, and paste the real command outputs)
```
GEMINI REPORT — ui-redesign — G2 (Home foundations)
Model and tool:    Date/time:
0. ENVIRONMENT: WSL terminal or wsl.exe prefix? Could you edit files? Step 0 outputs (all six):
1. FILES CREATED (exact paths):
2. CHECKPOINTS: for each of 1 to 8, the command and the last lines of its output (passed counts):
3. FINAL CHECKS (step 9), full outputs:
4. ANYTHING THAT DIFFERED FROM THE PACKET, and what you did:
5. TESTS THAT SEEMED WRONG (if any), with the exact failing assertion:
6. THINGS YOU COULD NOT DO OR VERIFY:
7. CONFIRMATIONS: tests untouched: yes/no; types.ts untouched: yes/no; files outside the file map untouched: yes/no; no npm install: yes/no; nothing committed: yes/no
```

## Orchestrator notes (not for Gemini)
- **Packet validation:** every test passes with a private reference implementation (outside the repo in `~/home-fe-ref`, built by a Sonnet agent from the tests and this specification, then re-run by me: `tsc` clean, `oxlint` 0 warnings, 125 Home tests and the 188 kit tests green). The agent's findings were applied before release: three tests were tightened (an ordinary error after an abort, focus moving with the arrow keys, the `@/features` alias in the isolation guard). If Gemini cannot finish after the corrective round allowed by the escalation rule, the reference is the fallback.
- Not pinned by tests, left to the worker: the exact selection colours of the calendar, and the calendar does not re-sync its visible month when the parent changes `value` later (fine for G3; the page opens the calendar fresh each time).
- **What this run adds to the pilot evidence:** the G1 pilot passed every checkpoint; G2 raises the difficulty with a hook that must cancel requests, a hand-built calendar with keyboard-free but fully tested selection logic, and tighter lint (no `float`, no hex colour) enforced by a guard test.
