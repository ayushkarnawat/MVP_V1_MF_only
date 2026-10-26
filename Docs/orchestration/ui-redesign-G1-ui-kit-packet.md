# Packet G1 for Gemini (Antigravity): the shared UI kit (runs K1 and K2), the Gemini pilot
**Status:** READY FOR GEMINI (written 26 Oct 2026). **Worker:** Gemini in Antigravity (Flash, high). **Orchestrator and verifier:** Claude Code. **Branch and folder:** `feat/ui-kit`, in the git worktree `/home/ayush/wt/ui-kit` on WSL (Windows path `\\wsl.localhost\Ubuntu\home\ayush\wt\ui-kit`). Only this one folder and branch are yours; do not touch the main checkout `D:\Unifolio code`.
**Parent plan:** `Docs/superpowers/plans/2026-10-24-shared-ui-kit-plan.md` (tasks 1 and 2). This packet is the whole truth for this run: where the plan and this packet differ, **this packet wins**. Execution method and the reasons for it: `Docs/orchestration/2026-10-26-execution-plan-v2.md` sections 2 to 4.

## What this run is, in one paragraph
The tests for the kit are **already written and committed** (commit `ce872db7`, eight test files, 117 tests, all failing because nothing is implemented). Your job is to write the implementation files so that those tests pass, one step at a time, running the checkpoint command after every step and keeping the real output. You must not change any test.

## Rules (read twice; these are the rules Gemini runs most often break)
1. **Scope.** You may create or edit **only** the files in section 3. Anything else, including any test file, is out of bounds.
2. **Never edit a test to make it pass.** If a test seems wrong, stop and describe it in the report (the orchestrator wrote and validated every test against a working solution, so a failing test means your code differs from the specification).
3. **Run the checkpoint command after every step** and paste its real output into your notes for the report. Do not claim a step passes without the output. If a command fails, fix your code (not the test), run it again, and only then continue.
4. **No new dependency.** Use only what is installed: React 19, `d3-shape`, `@visx/responsive`, `@testing-library/react`, vitest. Do not run `npm install`.
5. **No float arithmetic on money.** In `format.ts`, amounts and percents are processed as digit strings with `BigInt`; the only allowed use of `Number(` in that file is for the month number inside `formatDate`. Never `parseFloat`, `toFixed` or `Intl` on an amount.
6. **Exact strings.** Every user-visible string, test id, attribute name and CSS variable name in section 4 must be used exactly as written.
7. **Do not refactor, rename or "improve" anything outside the file map.** Do not reformat existing files. Do not add comments about the task. Match the surrounding code: 2-space indentation, double quotes, semicolons, `import { x } from "@/lib/..."` for project imports.
8. **If anything differs from this packet** (a file is missing, a command prints something unexpected, a symbol does not exist) **stop and report it**; do not improvise.

## Step 0: environment check (do this first, and report the output)
The folder is on WSL. If Antigravity can open it as a WSL folder, use its terminal inside WSL. If not, open the Windows path above and run every command below through WSL by prefixing `wsl.exe -d Ubuntu --cd /home/ayush/wt/ui-kit/frontend -- ` (for example `wsl.exe -d Ubuntu --cd /home/ayush/wt/ui-kit/frontend -- npx tsc -b`). Never run `npm`/`npx` from Windows itself: the installed `node_modules` only works inside WSL.
Run, from `/home/ayush/wt/ui-kit` and report the output of each:
```
git branch --show-current          # expect: feat/ui-kit
git log --oneline -4               # expect one of the four lines to start with: ce872db7 test(ui-kit): failing tests ...
git status --short                 # expect: nothing printed
cd frontend && npx tsc -b          # expect: no output (exit code 0)
npx vitest run src/lib/chartPointer.test.ts      # expect: 3 passed
npx vitest run src/lib/format.test.ts            # expect: FAIL, "Failed to resolve import ./format" (this is the red state)
```
Also state which of the two ways you are running commands (WSL terminal or `wsl.exe` prefix) and whether you can edit files in the folder. If any expectation fails, **stop and report**.

## Goal
Add the shared data-viz and semantic palette tokens, display formatting helpers, click-affordance class strings, the chart morph hook and three chart components (`LineAreaChart`, `GroupedBarChart`, `ScatterChart`), so that the Home, Individual Fund and Mutual Funds pages import them from one place.
**Non-goals:** no page work, no change to existing charts (`pie-chart.tsx`, `bar-chart.tsx` and the others), no change to `tokens.css` or any `--shell-*` variable, no new package.

## 3. File map
**Create (7):**
- `frontend/src/styles/palette-tokens.css`
- `frontend/src/lib/format.ts`
- `frontend/src/lib/clickable.ts`
- `frontend/src/components/ui/charts/use-morph.ts`
- `frontend/src/components/ui/charts/line-area-chart.tsx`
- `frontend/src/components/ui/charts/grouped-bar-chart.tsx`
- `frontend/src/components/ui/charts/scatter-chart.tsx`
**Modify (2):**
- `frontend/src/index.css`: add the single line `@import "./styles/palette-tokens.css";` directly **after** the existing first line `@import "./styles/tokens.css";`.
- `frontend/src/components/ui/charts/index.ts`: append four lines at the end: `export * from "./use-morph";`, `export * from "./line-area-chart";`, `export * from "./grouped-bar-chart";`, `export * from "./scatter-chart";` (keep every existing line).
**Do not touch:** every `*.test.ts(x)` file, `frontend/src/styles/tokens.css`, `frontend/src/shell/**`, the existing chart files, `frontend/package.json`, `package-lock.json`, anything under `backend/` or `Docs/`.
**The tests you must satisfy (already committed, read them before each step; they are the contract):** `src/styles/palette-tokens.test.ts` (34 tests), `src/lib/format.test.ts` (29), `src/lib/clickable.test.ts` (5), `src/components/ui/charts/use-morph.test.ts` (17), `line-area-chart.test.tsx` (12), `grouped-bar-chart.test.tsx` (8), `scatter-chart.test.tsx` (8), `guards.test.ts` (4).

## 4. Specifications

### Step 1: `palette-tokens.css` and the import
Create the file with exactly this content (it is data, not logic), then add the import line to `index.css`.
```css
/* Data-viz and semantic palette shared by the redesigned pages (the shared UI kit).
   Light is the default; dark follows the system setting unless data-theme="light" forces light,
   and data-theme="dark" forces dark. The shell keeps its own --shell-* variables (shell-tokens.css);
   tokens.css is untouched. */
:root {
  /* data-viz series (the names the Mutual Funds mockups use) */
  --c1: #22C55E;
  --c2: #0D9488;
  --c3: #2563EB;
  --c4: #6366F1;
  --c5: #8B5CF6;
  --c6: #D97706;
  --c7: #EC4899;
  --c8: #C1272D;

  /* semantic: solid, text and tint */
  --pos: #22C55E;
  --pos-text: #15803D;
  --pos-bg: #EAFBF0;
  --warn: #D97706;
  --warn-text: #B45309;
  --warn-bg: #FEF3E2;
  --neg: #E5484D;
  --neg-text: #C1272D;
  --neg-bg: #FDECEC;

  /* surfaces, text and interaction */
  --ui-page: #FCFCFC;
  --ui-card: #F5F5F5;
  --ui-elevated: #FFFFFF;
  --ui-divider: #ECECEC;
  --ui-border-hover: #B8B8B8;
  --ui-row-hover: #ECECEC;
  --ui-text: #111111;
  --ui-text-muted: #717171;
  --ui-focus: #22C55E;
  --ui-disabled-text: #C4C4C4;
  --ui-disabled-border: #DFDFDF;
  --ui-tooltip-bg: #2A2A2A;
  --ui-tooltip-text: #FFFFFF;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --c1: #22C55E;
    --c2: #2DD4BF;
    --c3: #60A5FA;
    --c4: #818CF8;
    --c5: #A78BFA;
    --c6: #FBBF24;
    --c7: #F472B6;
    --c8: #F87171;

    --pos: #22C55E;
    --pos-text: #34D399;
    --pos-bg: rgba(34, 197, 94, 0.14);
    --warn: #FBBF24;
    --warn-text: #FBBF24;
    --warn-bg: rgba(251, 191, 36, 0.14);
    --neg: #F87171;
    --neg-text: #F87171;
    --neg-bg: rgba(248, 113, 113, 0.16);

    --ui-page: #111111;
    --ui-card: #1A1A1A;
    --ui-elevated: #212121;
    --ui-divider: #2E2E2E;
    --ui-border-hover: #4A4A4A;
    --ui-row-hover: #212121;
    --ui-text: #FCFCFC;
    --ui-text-muted: #A3A3A3;
    --ui-focus: #22C55E;
    --ui-disabled-text: #5A5A5A;
    --ui-disabled-border: #2E2E2E;
    --ui-tooltip-bg: #212121;
    --ui-tooltip-text: #FCFCFC;
  }
}

[data-theme="dark"] {
  --c1: #22C55E;
  --c2: #2DD4BF;
  --c3: #60A5FA;
  --c4: #818CF8;
  --c5: #A78BFA;
  --c6: #FBBF24;
  --c7: #F472B6;
  --c8: #F87171;

  --pos: #22C55E;
  --pos-text: #34D399;
  --pos-bg: rgba(34, 197, 94, 0.14);
  --warn: #FBBF24;
  --warn-text: #FBBF24;
  --warn-bg: rgba(251, 191, 36, 0.14);
  --neg: #F87171;
  --neg-text: #F87171;
  --neg-bg: rgba(248, 113, 113, 0.16);

  --ui-page: #111111;
  --ui-card: #1A1A1A;
  --ui-elevated: #212121;
  --ui-divider: #2E2E2E;
  --ui-border-hover: #4A4A4A;
  --ui-row-hover: #212121;
  --ui-text: #FCFCFC;
  --ui-text-muted: #A3A3A3;
  --ui-focus: #22C55E;
  --ui-disabled-text: #5A5A5A;
  --ui-disabled-border: #2E2E2E;
  --ui-tooltip-bg: #212121;
  --ui-tooltip-text: #FCFCFC;
}
```
**Checkpoint 1** (from `frontend/`): `npx vitest run src/styles/palette-tokens.test.ts` → expect **34 passed**.

### Step 2: `lib/format.ts`
Export exactly: `formatRupees`, `formatCompactRupees`, `formatPercent`, `formatDate`, `scoreBand`, and the types `PercentOptions` and `ScoreBand`. Read `src/lib/format.test.ts` first: it lists every case. Rules:
- Input values are decimal **strings** from the server. Parse with the pattern `^([+-]?)(\d+)(?:\.(\d*))?$` after `trim()`; anything else is "unreadable". Work on the digits with `BigInt`; never convert an amount to a JavaScript number.
- The dash is the single character `—` (U+2014). `null`, `undefined`, `""` and unreadable input all give `—`.
- **Rounding is half up on the magnitude** (round the absolute value, then restore the sign): look at the digit after the last kept digit; `5` or more rounds up.
- `formatRupees(value)`: round to whole rupees; group digits Indian-style (last three digits, then groups of two: `1833250` → `18,33,250`); prefix `₹`; a negative number puts `-` **before** the `₹`; a value that rounds to zero prints `₹0` with no sign (no negative zero).
- `formatCompactRupees(value)`: let `r` be the whole-rupee value after rounding. If `r < 100000` return `formatRupees(value)`. Otherwise show crore if `r >= 10000000`, else lakh; lakh = `r / 100000`, crore = `r / 10000000`, each shown with exactly two decimals (rounded half up, using BigInt arithmetic), suffix ` L` or ` Cr` (a space before the suffix), `₹` first, `-` before the `₹` for negatives. **Carry rule:** if the lakh figure would round to `100.00` or more, show it in crore instead (`9999999` → `₹1.00 Cr`).
- `formatPercent(value, options?)`: the input is **already a percent number** (`"46.7"` means 46.7%). `options.digits` defaults to 1; round half up at that many decimals; append `%`; with `options.signed` a `+` is added in front of **positive** values only; a value that rounds to zero prints without any sign (`0.0%`); a negative value keeps `-`. With `digits: 0` there is no decimal point (`"12.5"` → `13%`).
- `formatDate(iso)`: the first ten characters `YYYY-MM-DD` become `DD Mon YYYY` with the day kept as two digits (`2026-01-05` → `05 Jan 2026`), month names `Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec`; a timestamp is accepted (use only its date part); month outside 1 to 12 or any other shape gives `—`.
- `scoreBand(finalScore: number): {word: string; color: string}`: `>= 85` Excellent `#15803D`; `>= 70` Strong `#22C55E`; `>= 55` Good `#65A30D`; `>= 40` Average `#CA8A04`; `>= 25` Weak `#EA580C`; otherwise Poor `#C1272D`; a non-finite number is Poor.
**Checkpoint 2:** `npx vitest run src/lib/format.test.ts` → expect **29 passed**.

### Step 3: `lib/clickable.ts`
Export four string constants `CLICK_CARD`, `CLICK_ROW`, `CLICK_FIGURE`, `DISABLED` (Tailwind class strings; join the parts with a single space). Use these exact class tokens (read `src/lib/clickable.test.ts`):
- A shared focus part `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]` is included in `CLICK_CARD`, `CLICK_ROW` and `CLICK_FIGURE`.
- `CLICK_CARD`: `cursor-pointer border border-[var(--ui-divider)] transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-px hover:border-[var(--ui-border-hover)] hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0` + the focus part.
- `CLICK_ROW`: `cursor-pointer transition-colors duration-150 hover:bg-[var(--ui-row-hover)] motion-reduce:transition-none` + the focus part.
- `CLICK_FIGURE`: `cursor-pointer underline decoration-dotted decoration-[var(--ui-text-muted)] underline-offset-4 hover:decoration-[var(--ui-text)]` + the focus part.
- `DISABLED`: `cursor-not-allowed border border-[var(--ui-disabled-border)] text-[var(--ui-disabled-text)] hover:translate-y-0 hover:shadow-none` (no focus part, no `cursor-pointer`).
No literal colours (`#...`) and no `--shell-` anywhere in these strings. Put a short comment above them saying the element itself must also have `tabIndex={0}`, a button role and Enter/Space handling, and that these strings only style it.
**Checkpoint 3:** `npx vitest run src/lib/clickable.test.ts` → expect **5 passed**.

### Step 4: `components/ui/charts/use-morph.ts`
Export `resample`, `niceTicks`, `useMorph`. Read `use-morph.test.ts` (17 tests).
- `resample(values: number[], count: number): number[]`: `count <= 0` → `[]`; empty input → `count` zeros; same length → a **copy** (not the same array); one input value → that value repeated `count` times; `count === 1` → `[values[0]]`; otherwise linear interpolation: output index `i` maps to position `i * (n - 1) / (count - 1)` in the input, value = lower + (upper - lower) × fractional part (first and last points are kept).
- `niceTicks(lo: number, hi: number): number[]`: non-finite input → `[0, 1]`; if `hi <= lo` then `hi = lo + 1`; `raw = (hi - lo) / 5`; `power = 10 ** Math.floor(Math.log10(raw))`; `step` = the smallest of `1×power, 2×power, 5×power, 10×power` that is `>= raw` (allow `1e-12` slack); `first = Math.floor(lo / step + 1e-9)`; walk `k = first, first+1, ...`, tick = `Number((k * step).toFixed(10))`, push each tick and stop **after pushing the first tick that is `>= hi - 1e-9 * step`**. So the first tick is at or below `lo` and the last at or above `hi`. Examples: `niceTicks(0, 100)` → `[0,20,40,60,80,100]`; `niceTicks(0, 1)` → `[0,0.2,0.4,0.6,0.8,1]`; `niceTicks(-50, 150)` → `[-50,0,50,100,150]`; `niceTicks(0, 87)` ends at `100`.
- `useMorph(target: number[][], options?: {durationMs?: number}): number[][]` (a React hook; `durationMs` defaults to 400). It returns the arrays to draw.
  - First render: returns `target` as given, no animation.
  - When the **numbers** in `target` change (compare `JSON.stringify(target)`, not array identity): animate from what is currently shown to the new target over `durationMs` using `requestAnimationFrame` and `performance.now()`, easing `1 - (1 - t) ** 3` with `t = min(1, elapsed / durationMs)`; before animating, resample each old series to the new series' length with `resample` (a series with no old counterpart starts at its own target). When `t` reaches 1 the returned arrays are the target itself.
  - If `window.matchMedia("(prefers-reduced-motion: reduce)").matches` (guard `typeof window.matchMedia === "function"`), or `durationMs <= 0`: set the new target immediately with no animation.
  - A new target while an animation is running cancels it (`cancelAnimationFrame`) and starts the next animation from the frame currently shown. Re-rendering with equal numbers must **not** restart or reset the animation. Cancel the frame on unmount.
  - Implementation shape that works: `useState` for the shown arrays, a ref holding the latest shown arrays, a ref for the frame id, a ref marking the first render, a ref holding the latest `target`, and one `useEffect` whose dependency is the content key and `durationMs`.
**Checkpoint 4:** `npx vitest run src/components/ui/charts/use-morph.test.ts` → expect **17 passed**.

### Step 5: `components/ui/charts/line-area-chart.tsx`
Export `LineAreaChart`, and the types `LineSeries`, `SecondSeries`, `LineAreaChartProps`. Read `line-area-chart.test.tsx` (12 tests). Follow the pattern of the existing `bar-chart.tsx` for the `width` prop: when `width` is given render the SVG directly; otherwise wrap it in `ParentSize` from `@visx/responsive` and render only when the measured width is `> 0`. Default `height` 240.
Props: `series: LineSeries[]` (`{key, name, color, values: number[], area?: boolean, visible?: boolean}`), `secondSeries?: {name, color, values: number[]}` (percent numbers drawn against a right-hand axis), `labels: (index) => string`, `tooltipLabel?: (index) => string`, `formatValue: (value: number) => string`, `formatPercent?: (value: number) => string` (default `` v => `${v}%` ``), `ariaLabel: string`, `height?`, `width?`.
Layout constants (the tests depend on them): margin top 12, bottom 24, left 56, right 12 (right is **52** when `secondSeries` is given); `plotWidth = width - 56 - marginRight`; `plotHeight = height - 12 - 24`.
Behaviour:
1. `visible` = series whose `visible !== false`. Hidden series are not drawn and do not affect the axis or tooltip.
2. The y ticks come from `niceTicks(min, max)` over all values of the visible series (the **target** values, not the morphed ones). `y(v) = 12 + plotHeight × (1 - (v - firstTick) / (lastTick - firstTick))`. `x(i, n) = 56 + (n <= 1 ? plotWidth / 2 : i × plotWidth / (n - 1))`.
3. Drawn values come from `useMorph([...visible values, ...(secondSeries ? [secondSeries.values] : [])])`; draw each line from the morphed array at the same position (fall back to the raw values if missing).
4. Paths use `d3-shape`: `line` and `area` with `curveMonotoneX`; the area runs from the line down to `y = 12 + plotHeight`.
5. If there is no point at all (every visible series empty, or no series): render only the SVG with one `<rect data-testid="chart-frame">` (x 56, y 12, plotWidth × plotHeight, no fill, stroke `var(--ui-divider)`). No ticks, no paths, no error.
6. Root element: a `<div style={{position: "relative", width, height}}>` containing the `<svg role="img" aria-label={ariaLabel} viewBox="0 0 {width} {height}" width height>`; the tooltip is a sibling `<div>` after the svg.
7. Elements and exact test ids:
   - per y tick: `<line data-testid="grid-line">` (dashed, `stroke="var(--ui-divider)"`) and `<text data-testid="y-tick">` with `formatValue(tick)`, anchored end at x = 48, vertically centred on the tick;
   - with `secondSeries`: per tick of `niceTicks` over the second values, `<text data-testid="y2-tick">` with `formatPercent(tick)` at x = `56 + plotWidth + 8`, and a path `data-testid="series-line-second"` (only when it has more than one value) scaled to its own axis;
   - x labels: `labelStep = max(1, ceil(pointCount / 6))`; one `<text data-testid="x-label">` with `labels(i)` for each index divisible by `labelStep` (so at most six, index 0 always first), at `y = height - 6`;
   - per visible series with more than one value: `<path data-testid="series-line-{key}">` (`fill="none"`, `stroke` = its colour, width 2) and, when `area` is true, `<path data-testid="series-area-{key}" fill="url(#{uid}-{key})">` plus a `<linearGradient id="{uid}-{key}">` in `<defs>` with two stops (offset 0% opacity 0.28, offset 100% opacity 0, both in the series colour); get `uid` from React's `useId()`;
   - a series with exactly **one** value draws `<circle data-testid="series-dot-{key}" r="4">` at the centre x and no line or area;
   - an overlay `<rect data-testid="chart-overlay">` covering the plot area (transparent fill, `style={{cursor: "crosshair"}}`) with `onPointerMove` and `onPointerLeave`.
8. Hover: `onPointerMove` computes the index with `indexFromClientX(event.clientX, event.currentTarget.getBoundingClientRect(), pointCount, plotWidth, 0)` from `@/lib/chartPointer` and stores it in state; `onPointerLeave` clears it. While set: a `<line data-testid="crosshair">` at that x from the plot top to bottom, and `<div role="tooltip" data-testid="chart-tooltip">` (absolute, `top: 8`, `left` = crosshair x + 10 limited to `[0, width - 170]`, `pointerEvents: "none"`, background `var(--ui-tooltip-bg)`, colour `var(--ui-tooltip-text)`) holding `<div data-testid="tooltip-title">` with `(tooltipLabel ?? labels)(index)` and then one `<div data-testid="tooltip-row">` per visible series that has a value at that index, text exactly `${name}: ${formatValue(value)}`, then, if `secondSeries` has a value there, a last row `${secondSeries.name}: ${formatPercent(value)}`.
**Checkpoint 5:** `npx vitest run src/components/ui/charts/line-area-chart.test.tsx` → expect **12 passed**.

### Step 6: `components/ui/charts/grouped-bar-chart.tsx`
Export `GroupedBarChart` and the types `GroupedBucket`, `GroupedBarChartProps`. Read `grouped-bar-chart.test.tsx` (8 tests). Same `width` / `ParentSize` pattern as Step 5; default `height` 220.
Props: `buckets: {label: string; values: number[]}[]` (one value per series), `seriesColors: string[]`, `formatValue: (value: number) => string`, `ariaLabel: string`, `onBucketClick?: (index: number) => void`, `height?`, `width?`.
Constants: margin top 12, right 12, bottom 26, left 12; `GAP = 2` between bars of one group.
Behaviour:
1. Build one array per series (`buckets.map(b => b.values[seriesIndex] ?? 0)`) and pass them to `useMorph`; **the number of groups drawn is the length of the morphed arrays** (so when the bucket count changes, the first animation frame already has the new count). Labels and click handlers come from `buckets[index]` and are only rendered for `index < buckets.length`.
2. No buckets or no values: `<svg role="group" aria-label>` with only `<rect data-testid="chart-frame">`.
3. Ticks: `niceTicks(Math.min(0, ...allTargetValues), Math.max(0, ...allTargetValues))`; `y(v) = 12 + plotHeight × (1 - (v - firstTick) / (lastTick - firstTick))`; zero line at `y(0)`: `<line data-testid="bar-baseline" x1 x2 y1 y2>` with `y1 = y2 = y(0)`.
4. `slot = plotWidth / count`; `barWidth = max(1, min(slot × 0.7, slot - 2) / seriesCount - 2)`; a group is `seriesCount × (barWidth + 2) - 2` wide and centred in its slot. Each bar `<rect data-testid="bar-{groupIndex}-{seriesIndex}" rx="2" fill={colour}>` has `y = min(y(value), y(0))` and `height = |y(value) - y(0)|` (so negatives hang below the zero line).
5. Each group is a `<g data-testid="bucket-{index}">` containing a transparent full-slot hit `<rect>`, the bars, and (if the bucket exists) `<text data-testid="bucket-label">` with the label, centred, at `y = height - 8`. Attributes on the `<g>`: `data-dimmed` = `"true"` when some **other** group is hovered, else `"false"`; `opacity` 0.4 when dimmed else 1; `role="button"`, `tabIndex={0}` and `aria-label` = `` `${label}: ${values.map(formatValue).join(", ")}` `` **only when** `onBucketClick` is given and the bucket exists; `onClick` calls `onBucketClick(index)`; `onKeyDown` on `Enter` or `" "` calls `event.preventDefault()` then `onBucketClick(index)`; `onPointerEnter` sets the hovered index, `onPointerLeave` clears it. The `<svg>` has `role="group"` and `aria-label={ariaLabel}`.
**Checkpoint 6:** `npx vitest run src/components/ui/charts/grouped-bar-chart.test.tsx` → expect **8 passed**.

### Step 7: `components/ui/charts/scatter-chart.tsx`
Export `ScatterChart` and the types `ScatterPoint`, `ScatterChartProps`. Read `scatter-chart.test.tsx` (8 tests). Same `width` / `ParentSize` pattern; default `height` 280.
Props: `points: {id: string; name: string; x: number; y: number; highlight?: boolean}[]`, `xLabel: string`, `yLabel: string`, `ariaLabel: string`, `onPointClick?: (id: string) => void`, `height?`, `width?`.
Constants: margin top 12, right 16, bottom 44, left 56.
Behaviour: no points → `<svg role="group" aria-label>` with only `<rect data-testid="chart-frame">`. Otherwise x ticks = `niceTicks(min x, max x)`, y ticks = `niceTicks(min y, max y)` (so the ticks cover every point); `px(v) = 56 + plotWidth × (v - x0) / (x1 - x0)`, `py(v) = 12 + plotHeight × (1 - (v - y0) / (y1 - y0))` with `x0, x1, y0, y1` the first and last tick of each axis. Render: per x tick `<text data-testid="x-tick">` (its number) at `y = 12 + plotHeight + 16`, centred; per y tick a dashed grid `<line>` and `<text data-testid="y-tick">` anchored end at x = 48; `<text data-testid="x-axis-title">` with `xLabel` centred under the plot at `y = height - 6`; `<text data-testid="y-axis-title">` with `yLabel` at x = 14 rotated −90° about its own position. Per point a `<g data-testid="point-{id}" data-highlight="true|false">` with `role="button"`, `tabIndex={0}` only when `onPointClick` is given, `aria-label` always = `` `${name}: ${xLabel} ${x}, ${yLabel} ${y}` ``, `onClick` and Enter/Space (`preventDefault` then call) calling `onPointClick(id)`, containing one `<circle>`: `r` 8 when highlighted else 5; fill `var(--c2)` (highlight) or `var(--c3)` with `fillOpacity` 0.7 (others); highlighted circles have `stroke="var(--ui-text)"` and `strokeWidth` 2, others `stroke="none"`. A single point must not throw.
**Checkpoint 7:** `npx vitest run src/components/ui/charts/scatter-chart.test.tsx` → expect **8 passed**.

### Step 8: exports and guards
Append the four export lines to `components/ui/charts/index.ts` (section 3). **Checkpoint 8:** `npx vitest run src/components/ui/charts/guards.test.ts` → expect **4 passed**.

### Step 9: final checks (from `frontend/`, in this order; paste every output)
```
npx tsc -b                                          # expect: no output
npx oxlint src/components/ui/charts/use-morph.ts src/components/ui/charts/line-area-chart.tsx src/components/ui/charts/grouped-bar-chart.tsx src/components/ui/charts/scatter-chart.tsx src/lib/format.ts src/lib/clickable.ts   # expect: Found 0 warnings and 0 errors
npx vitest run src/components/ui/charts src/lib src/styles   # expect: Test Files 16 passed, Tests 188 passed
npm run build                                        # expect: "built in" with no error (a chunk-size warning is normal)
grep -nE "parseFloat|toFixed|Intl\." src/lib/format.ts  # expect: no output
cd .. && git status --short                          # expect only the 7 new files and the 2 modified files (index.css, charts/index.ts)
```
**Do not commit and do not push.** The orchestrator verifies and commits.

## Stop conditions
Stop and report (do not improvise) if: Step 0 does not match; a checkpoint still fails after two honest attempts; a test appears to contradict this packet; you would need to edit a file outside section 3; a command needs `npm install`.

## Report (fill this in at the end, in one fenced block, and paste the real command outputs)
```
GEMINI REPORT — ui-redesign — G1 (shared UI kit)
Model and tool:    Date/time:
0. ENVIRONMENT: WSL terminal or wsl.exe prefix? Could you edit files? Step 0 outputs (all six):
1. FILES CHANGED (exact paths):
2. CHECKPOINTS: for each of 1 to 8, the command and the last lines of its output (passed counts):
3. FINAL CHECKS (step 9), full outputs:
4. ANYTHING THAT DIFFERED FROM THE PACKET, and what you did:
5. TESTS THAT SEEMED WRONG (if any), with the exact failing assertion:
6. THINGS YOU COULD NOT DO OR VERIFY:
7. CONFIRMATIONS: tests untouched: yes/no; files outside the file map untouched: yes/no; no npm install: yes/no; nothing committed: yes/no
```

## Orchestrator notes (not for Gemini)
- **Packet validation:** every test was written against, and passes with, the orchestrator's own reference implementation (kept outside the repo in `~/kit-reference`; 188 tests green in the three folders, `tsc`, `oxlint` and `npm run build` clean). If Gemini cannot finish after the corrective round allowed by the escalation rule, the reference is the fallback and the pilot's result is recorded as a failure of the model, not of the packet.
- **What this pilot measures:** whether Flash on high follows a file allow-list, runs the checkpoint commands, leaves tests alone, and reproduces fixed DOM contracts without improvising. The findings go into the guardrail block of the next packets.
