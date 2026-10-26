# Packet G3 for Gemini (Antigravity): Home sections 1 to 3 (greeting, wealth card, glance) (Home front-end run 2 of 5)
**Status:** READY FOR GEMINI (written 26 Oct 2026). **Worker:** Gemini in Antigravity (Flash, high). **Orchestrator and verifier:** Claude Code. **Branch and folder:** `feat/home-frontend`, in the git worktree `/home/ayush/wt/home-fe` on WSL (open it in Antigravity through the Windows drive `W:` as `W:\home\ayush\wt\home-fe`). Only this folder and branch are yours; do not touch the main checkout `D:\Unifolio code` or the folder `ui-kit`.
**Parent plan:** `Docs/superpowers/plans/2026-10-23-home-frontend-plan.md` tasks T6 (sections 1 and 2) and T7's Glance part. Signed-off copy and structure: the mockup `Docs/orchestration/2026-10-23-home-design-mockups.html` (sections 1 to 3), layout doc `2026-10-23-home-layout.md` section 3. This packet is the whole truth for this run: where the plan and this packet differ, **this packet wins**. Method: `Docs/orchestration/2026-10-26-execution-plan-v2.md` sections 2 to 4. The data shapes are in `frontend/src/features/home/types.ts` and the real backend responses are the golden fixtures in `frontend/src/features/home/fixtures/` (both orchestrator-owned, already in the folder: never edit them).

## What this run is, in one paragraph
The tests are **already written and committed red** (eight new test files) together with the fixtures. Your job is to write seven implementation files so that those tests pass, one step at a time, running the checkpoint command after every step and keeping the real output. You must not change any test, `types.ts` or a fixture. The components are **presentational**: they receive their data as props and report user actions through callbacks; fetching, scope switching and page layout come in a later run. No route and no page is built here.

## Rules (read twice; these are the rules Gemini runs most often break)
1. **Scope.** You may create **only** the seven files in section 3. Anything else, including any test file, `types.ts`, a fixture, `package.json` and every file from earlier runs, is out of bounds.
2. **Never edit a test to make it pass.** If a test seems wrong, stop and describe it in the report (the orchestrator wrote every test and validated it against a working solution).
3. **Run the checkpoint command after every step** and keep its real output for the report. If a command fails, fix your code (not the test), run it again, and only then continue.
4. **No new dependency** and **no `npm install`.** Use what is installed: React 19, `lucide-react`, the shared kit, the Home foundations from G2.
5. **No float arithmetic on money or percentages.** Amounts and percentages are decimal strings: use the helpers in `homeFormat.ts`. Never `parseFloat`, `toFixed` or `Intl` in any Home file, **comments included** (a guard test greps whole file text). The only use of `Number(` allowed is turning a chart point into a coordinate for the chart; never for text shown to the user.
6. **No hard-coded colours in `.tsx` files** (no `#` followed by hex digits, no `rgb(`, comments included): CSS variables only. Other features may not be imported.
7. **Exact strings.** Every visible string, accessible name, test id and attribute in section 4 must be used exactly as written (including the en dash `–` in a date range and the bullet string `••••••`).
8. **Do not refactor, rename or "improve" anything outside the file map.** Match the surrounding code: 2-space indentation, double quotes, semicolons, `@/` imports for project code.
9. **If anything differs from this packet** (a file is missing, a command prints something unexpected) **stop and report it**.
10. **Run every command inside WSL** (Step 0).

## Step 0: environment check (do this first, and report the output)
Same method as the previous run: the folder is opened as `W:\home\ayush\wt\home-fe`; **every command (`git`, `npm`, `npx`, `grep`, `cd`) runs inside WSL**, prefixed `wsl.exe -d Ubuntu --cd /home/ayush/wt/home-fe -- <command>` for git and `wsl.exe -d Ubuntu --cd /home/ayush/wt/home-fe/frontend -- <command>` for npm/npx; a command containing `|` is run as `... -- bash -c "<command>"`.
Run, from `/home/ayush/wt/home-fe`, and report the output of each:
```
git branch --show-current          # expect: feat/home-frontend
git log --oneline -4               # expect the top line to start with: test(home): failing tests for Home sections 1 to 3
git status --short                 # expect: nothing printed
cd frontend && npx tsc -b          # expect: errors only about the seven missing modules (red state), nothing else
npx vitest run src/features/home/api.test.ts           # expect: 16 passed (the foundations from the previous run are present)
npx vitest run src/features/home/fixtures/fixtures.test.ts   # expect: 29 passed (the golden fixtures are present)
npx vitest run src/features/home/homeCopy.test.ts      # expect: FAIL, "Failed to resolve import ./homeCopy" (red state)
```
State which way you run commands and whether you can edit files. If any expectation fails, **stop and report**.

## Goal
Build the Home page's first three sections as props-driven components: the greeting with its one-sentence status and family-members chip, the wealth card with its headline, change, benchmark line, chart, period and benchmark controls and custom date range, and the "Your money, at a glance" card.
**Non-goals:** no fetching, no hooks, no routing, no page, no news, no allocation, no movers, no change to the kit or to the controls built in the previous run.

## 3. File map
**Create (7), all under `frontend/src/features/home/`:**
- `homeCopy.ts`
- `components/ChangeBadge.tsx`
- `components/HideValuesButton.tsx`
- `components/PartialDataBadge.tsx`
- `sections/Greeting.tsx`
- `sections/Glance.tsx`
- `sections/WealthCard.tsx`
**Do not touch:** every `*.test.ts(x)` file, `types.ts`, everything under `fixtures/`, `frontend/package.json`, `package-lock.json`, `src/index.css`, `src/shell/**`, `src/components/ui/**`, `src/lib/**`, the files of the previous run, anything under `backend/` or `Docs/`.
**The tests you must satisfy (already committed; read each before its step):** `homeCopy.test.ts`, `components/ChangeBadge.test.tsx`, `components/HideValuesButton.test.tsx`, `components/PartialDataBadge.test.tsx`, `sections/Greeting.test.tsx`, `sections/Glance.test.tsx`, `sections/WealthCard.test.tsx`, plus `fixtures/fixtures.test.ts` (already green) and `guards.test.ts` (checked at the end; it now also scans your new files).
**Available to import:** from `../homeFormat` (relative): `formatRupees`, `formatCompactRupees`, `formatPercent`, `formatDate`, `formatDayMonth`, `formatAsOf`, `formatSignedRupees`, `formatSignedCompactRupees`, `formatSignedPercent`, `changeDirection`, `greetingLine`; the controls `PeriodSelector`, `BenchmarkSelect`, `DateRangeCalendar` (and its type `DateRange`) from `../components/...`; `CLICK_CARD` from `@/lib/clickable`; `Skeleton` from `@/components/ui/skeleton`; **`LineAreaChart` exactly as `import { LineAreaChart } from "@/components/ui/charts";`** (the test replaces that module path); icons from `lucide-react` (`Sun`, `Moon`, `Eye`, `EyeOff`, `Sparkles`, `TriangleAlert`, `Info`, `ChevronRight`, `ChevronDown`, `Upload`, `Wallet`, `CircleAlert`, `Calendar`, `ArrowRight`).

## 4. Specifications

### Step 1: `homeCopy.ts`
Pure functions; read `homeCopy.test.ts`. `unsigned(text)` is a private helper that strips one leading `+` or `-` from a string.
- `periodLabel(period)`: `1D` → `today`, `1W` → `this week`, `1M` → `this month`, `1Y` → `this year`, `custom` → `in range`.
- `wealthCaption(scope, memberName?)`: `aggregate` → `Your family's wealth`; `member` → `${memberName}'s wealth`, or `Your wealth` when the name is missing, `null` or blank.
- `periodNote(period, data)`: for `1D` with at least two points: `` `1D compares two NAV days (${formatDayMonth(first.date)} and ${formatDayMonth(last.date)}). Mutual fund NAVs publish once a day, so there is no intraday line.` `` (first and last point of `data.points`); otherwise the empty string (also when `data` is `null`).
- `buildStatusSentence(summary, movers?)` (the greeting's sentence; `movers` is accepted and not used yet): `null` when `summary.has_holdings` is false. Direction comes from `summary.direction` (never recomputed). Flat: `` `${scope_label} is little changed ${since_label}.` ``. Up or down: `` `${scope_label} is ${direction} ${formatRupees(unsigned(change_amount))}` `` + (when `change_pct` is not null: `` ` (${formatPercent(unsigned(change_pct), { digits: 2 })})` ``) + `` ` ${since_label}.` `` + (when `top_contributor` is not null: `` ` ${top_contributor} drove most of the ${direction === "up" ? "gains" : "losses"}.` ``).
- `buildGlanceSentence(summary, movers)`: `null` without holdings. Flat: `` `Your portfolio is little changed ${since_label}.` ``. Up: `` `Your portfolio gained ${formatRupees(unsigned(change_amount))} ${since_label}` `` then, when `movers` is not null and `movers.gains[0]` exists, `` `, with ${label.toLowerCase()} contributing the most.` `` else `.`. Down: the same with `lost` and `movers.losses[0]` and `` `, with ${label.toLowerCase()} weighing on it the most.` ``.
**Checkpoint 1** (from `frontend/`): `npx vitest run src/features/home/homeCopy.test.ts` → expect **20 passed**.

### Step 2: `components/ChangeBadge.tsx`, `HideValuesButton.tsx`, `PartialDataBadge.tsx`
Read their three test files.
- `ChangeBadge({ amount, pct, hidden })` (`amount` and `pct` are `string | null`, `hidden` optional): one `<span data-testid="change-badge" data-direction={...}>`. `direction = changeDirection(amount)`. Text: `amount === null` → `—`; hidden → `••••••`; otherwise `` `${arrow} ${formatSignedRupees(amount)}` `` + (when `pct` is not null: `` ` (${formatSignedPercent(pct)})` ``) with arrow `▲` (up), `▼` (down), `–` (flat, en dash). Colour with Tailwind arbitrary values: up `text-[var(--pos-text)]`, down `text-[var(--neg-text)]`, flat `text-[var(--ui-text-muted)]`; semibold, tabular numbers.
- `HideValuesButton({ hidden, onToggle })`: `<button type="button" aria-label title aria-pressed>` where the label and title are `Show values` when `hidden` else `Hide values`, `aria-pressed={hidden}`; icon `EyeOff` when hidden else `Eye` (size 16, `aria-hidden`); clicking calls `onToggle()`. Style: small bordered icon button with the focus outline `focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]`.
- `PartialDataBadge({ missingFunds })`: renders `null` when the list is empty. Otherwise `<span role="note" title={`Missing: ${names}`} aria-label={`Partial data. Missing: ${names}`}>` with a `TriangleAlert` icon (`aria-hidden`) and the text `Partial data`; `names` is the funds' `name`s joined with `, ` in the order given. Pill style using `bg-[var(--warn-bg)] text-[var(--warn-text)]`.
**Checkpoint 2:** `npx vitest run src/features/home/components/ChangeBadge.test.tsx src/features/home/components/HideValuesButton.test.tsx src/features/home/components/PartialDataBadge.test.tsx` → expect **3 files, 17 tests passed**.

### Step 3: `sections/Greeting.tsx`
Export `Greeting` with props `{ status: "loading" | "error" | "data"; summary: SummaryResponse | null; onImport: (memberId?: string) => void }`. Read `Greeting.test.tsx` (16 tests).
- **Loading:** `<div role="status" aria-label="Loading greeting">` holding two `Skeleton` lines; no heading.
- **Error, or data without a summary:** only `<h1>Welcome back</h1>`.
- **No holdings** (`summary.has_holdings` false): `<h1>` with `greetingLine(summary.greeting, summary.display_name)`, then the text `Import a statement to see your portfolio.` and a button `Import statement` whose click calls `onImport()` **with no argument**. No sentence, no chip.
- **Normal:** `<h1>` with the same `greetingLine` and, inside it before the text, a `Sun` icon for `morning` and `afternoon` or a `Moon` icon for `evening`, each with `data-testid="greeting-icon"` and `data-icon="sun"` / `"moon"`, `aria-hidden`. Below it `<p data-testid="greeting-sentence">` with `buildStatusSentence(summary)`. When `summary.data_line` is not null: a chip `<button type="button" data-testid="members-chip" aria-expanded={open} aria-haspopup="dialog">` showing a small dot, the data line text and a `ChevronRight`; clicking toggles a panel `<div role="dialog" aria-label="Family members">` (pressing `Escape` on the panel closes it) with a `<ul>` of `<li>`, one per `summary.members` entry, in order: the member's `name`, then `Data imported` when `has_data` else `No data yet`; a member without data also gets a button `Import statement` whose click calls `onImport(member.id)`. The panel is closed initially.
**Checkpoint 3:** `npx vitest run src/features/home/sections/Greeting.test.tsx` → expect **16 passed**.

### Step 4: `sections/Glance.tsx`
Export `Glance` with props `{ status: "loading" | "error" | "data"; summary: SummaryResponse | null; movers: MoversResponse | null; onOpen: () => void }`. Read `Glance.test.tsx` (6 tests).
- **Loading:** `<div role="status" aria-label="Loading summary">` with a card-shaped `Skeleton`.
- **Renders nothing** (`return null`) on error, without a summary, with no holdings, or when `buildGlanceSentence(summary, movers)` is `null`: this card never shows a sentence that could disagree with the headline.
- **Otherwise** one card: `<div role="button" tabIndex={0}>` whose class list includes `CLICK_CARD` (from `@/lib/clickable`) plus `rounded-xl bg-[var(--ui-elevated)] p-4`; inside: a row with `<h3>` containing a `Sparkles` icon and the text `Your money, at a glance`, and on the right the text `Understand today's change` followed by an `ArrowRight` icon; then `<p>` with the sentence; then a small muted `<p>` with `Based on available investment data`. Clicking, or pressing `Enter`, or pressing Space (call `event.preventDefault()` for Space) calls `onOpen()`.
**Checkpoint 4:** `npx vitest run src/features/home/sections/Glance.test.tsx` → expect **6 passed**.

### Step 5: `sections/WealthCard.tsx`
Export `WealthCard` and the interface `WealthCardProps`:
```ts
export interface WealthCardProps {
  status: "loading" | "error" | "data";
  data: WealthSeriesResponse | null;
  scope: "aggregate" | "member";
  memberName?: string | null;
  period: HomePeriod;
  onPeriodChange: (period: HomePeriod) => void;
  customRange: DateRange;
  onCustomRangeChange: (range: DateRange) => void;
  today: string;                      // ISO date the calendar treats as "today"
  benchmarkOptions: BenchmarkOptionOut[];
  benchmark: string | null;           // the selected benchmark index
  onBenchmarkChange: (index: string) => void;
  hidden: boolean;
  onToggleHidden: () => void;
  onRetry: () => void;
  onImport: () => void;
  onInfo?: () => void;
}
```
Read `WealthCard.test.tsx` (30 tests) in full first: it replaces the kit chart by a stub that records the props you pass. The root of the component is **one `<div>` card** (`rounded-xl bg-[var(--ui-elevated)] p-4` and a divider border).
- **Caption:** `<span data-testid="wealth-caption">` with `wealthCaption(scope, memberName)`, always shown; when `onInfo` is given an icon button `aria-label="How is this calculated?"` (an `Info` icon) next to it calls `onInfo()`.
- **Loading:** `<div role="status" aria-label="Loading wealth graph">` with skeleton blocks; no caption controls, no period buttons.
- **Error, or `data` null:** the caption, the text `Could not load your wealth graph.` and a button `Try again` (calls `onRetry()`); no headline, no chart.
- **Empty** (`data.empty`): the caption; for `period === "custom"` the text `No investments in this range.` and the period controls (see below) still shown, no import button; otherwise the text `No investments yet.` with a button `Import statement` (calls `onImport()`), no controls.
- **Normal:** top row: caption (and info button) on the left; on the right `PartialDataBadge` (only when `data.partial`, with `data.missing_funds`) and `BenchmarkSelect` (`options={benchmarkOptions}`, `value={benchmark}`, `onChange={onBenchmarkChange}`). Headline row: `<span data-testid="wealth-total">` with `formatRupees(data.end_value)`, or `••••••` when `hidden`; next to it `HideValuesButton` (`hidden`, `onToggle={onToggleHidden}`). Change row: `ChangeBadge` (`amount={data.change_amount}`, `pct={data.change_pct}`, `hidden`) and the muted text `` `Portfolio change ${periodLabel(period)}` ``. Benchmark line: only when `data.benchmark` is not null, `data.benchmark.available` is true and its `pct` is not null: `<div data-testid="benchmark-line">` with `` `${label} ${formatSignedPercent(pct)}` `` plus, when `clipped`, `` ` since ${formatDayMonth(effective_start)}` `` (use the blue `text-[var(--home-bench)]`, a `ChevronDown` icon optional). It is **not** masked when values are hidden.
- **Chart:** `<LineAreaChart>` (imported exactly as stated above) with props: `series={[{ key: "value", name: "Portfolio", color: "var(--c1)", values: data.points.map(point => Number(point.value)), area: true }]}`; `secondSeries` **only when** `benchmark.available && !benchmark.clipped && benchmark.points.length === data.points.length`: `{ name: benchmark.label, color: "var(--home-bench)", values: benchmark.points.map(point => Number(point.pct)) }` (otherwise leave the prop out entirely); `labels={index => formatDayMonth(data.points[index].date)}`; `tooltipLabel={index => formatDate(data.points[index].date)}`; `formatValue={hidden ? () => "••••••" : value => formatCompactRupees(String(Math.round(value)))}`; `formatPercent={value => formatSignedPercent(String(value), 1)}`; `ariaLabel="Portfolio value over time"`. (A benchmark whose history starts after the period is not drawn: its points would not line up with the portfolio's days.)
- **Note:** `<p data-testid="wealth-note">` is always rendered; its text is the non-empty ones of these, joined with a single space: `periodNote(period, data)`; when `benchmark.clipped` and `effective_start` is not null, `` `Benchmark history starts on ${formatDate(effective_start)}.` ``; when `data.benchmark` exists but is not `available`, `Benchmark data is not available for this period.`
- **Controls row:** `PeriodSelector` with `value={period}`, `customLabel` set only when `period === "custom"` and both ends of `customRange` are set, as `` `${formatDayMonth(from)} – ${formatDayMonth(to)}` `` (en dash), and `onChange`: call `onPeriodChange(chosen)` and, when `chosen === "custom"`, open the calendar popover. On the right: when `period === "custom"` a button `aria-label="Choose dates"` that toggles the popover, showing the range text (same format as above) or `Choose dates` when the range is not complete; for every other period the muted text `Change excludes new money`.
- **Calendar popover:** local state `open`. When open, render below the controls an absolutely positioned panel (`bg-[var(--ui-elevated)]`, divider border, shadow) containing `DateRangeCalendar` with `today={today}`, `value={customRange}`, `onChange={range => { onCustomRangeChange(range); if (range.from && range.to) setOpen(false); }}`. The popover also closes when the `period` prop **changes to a value other than `"custom"`** (an effect on `period`), but stays open when `period` does not change.
**Checkpoint 5:** `npx vitest run src/features/home/sections/WealthCard.test.tsx` → expect **30 passed**.

### Step 6: final checks (from `frontend/`, in this order; paste every output)
```
npx tsc -b                                          # expect: no output
npx oxlint src/features/home                        # expect: Found 0 warnings and 0 errors
npx vitest run src/features/home                    # expect: Test Files 18 passed, Tests 243 passed
npx vitest run src/components/ui/charts src/lib src/styles   # expect: Test Files 16 passed, Tests 188 passed
npm run build                                       # expect: "built in" with no error (a chunk-size warning is normal)
cd .. && git status --short                         # expect only the seven new files under frontend/src/features/home
```
**Do not commit and do not push.** The orchestrator verifies and commits.

## Stop conditions
Stop and report (do not improvise) if: Step 0 does not match; a checkpoint still fails after two honest attempts; a test appears to contradict this packet; you would need to edit a file outside section 3; a command needs `npm install`.

## Report (fill this in at the end, in one fenced block, and paste the real command outputs)
```
GEMINI REPORT — ui-redesign — G3 (Home sections 1 to 3)
Model and tool:    Date/time:
0. ENVIRONMENT: WSL terminal or wsl.exe prefix? Could you edit files? Step 0 outputs (all seven):
1. FILES CREATED (exact paths):
2. CHECKPOINTS: for each of 1 to 5, the command and the last lines of its output (passed counts):
3. FINAL CHECKS (step 6), full outputs:
4. ANYTHING THAT DIFFERED FROM THE PACKET, and what you did:
5. TESTS THAT SEEMED WRONG (if any), with the exact failing assertion:
6. THINGS YOU COULD NOT DO OR VERIFY:
7. CONFIRMATIONS: tests untouched: yes/no; types.ts and fixtures untouched: yes/no; files outside the file map untouched: yes/no; no npm install: yes/no; nothing committed: yes/no
```

## Orchestrator notes (not for Gemini)
- **Packet validation:** the tests were validated against a private reference implementation (a Sonnet agent working from the tests and this specification, outside the repo in `~/home-fe-ref3`); its findings are applied before release (see the register entry). The copy of every sentence comes from the signed-off mockup; the wording for the down-day variants (`lost ... weighing on it the most`, `drove most of the losses`) and the benchmark notes are the orchestrator's, logged as register C99.
- **Decisions this packet fixes (register C99, C100):** a benchmark whose history starts after the period is shown as a text line with "since DD Mon" and a note, not drawn (its points cannot line up with the portfolio's days); the greeting's top mover is plain text for now (the mockup makes it a link to the movers popup, added with the page assembly run); an error in the greeting shows "Welcome back" because the name is only known from the summary; the percent sign style is "-" not "−" as decided for the kit (C68).
