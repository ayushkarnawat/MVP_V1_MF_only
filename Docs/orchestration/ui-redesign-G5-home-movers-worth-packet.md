# Packet G5 for Gemini (Antigravity): Home movers and "worth a look" sections (Home front-end run 4 of 5)
**Status:** READY FOR GEMINI (written 26 Oct 2026). **Worker:** Gemini in Antigravity (Flash, high). **Orchestrator and verifier:** Claude Code. **Branch and folder:** `feat/home-frontend-b`, in the git worktree `/home/ayush/wt/home-fe2` on WSL (open it in Antigravity as `W:\home\ayush\wt\home-fe2`). This packet runs **at the same time as packet G4**, which works in a different folder and branch (`/home/ayush/wt/home-fe`, branch `feat/home-frontend`): never touch that folder, and touch only your own file map, so the two branches merge cleanly.
**Parent plan:** `Docs/superpowers/plans/2026-10-23-home-frontend-plan.md` tasks T8 (movers) and T9 (worth a look). Signed-off copy and structure: the mockup `Docs/orchestration/2026-10-23-home-design-mockups.html` (sections 5 and 6), layout `2026-10-23-home-layout.md` sections 4 and 5. This packet is the whole truth for this run: where the plan and this packet differ, **this packet wins**. Method: `Docs/orchestration/2026-10-26-execution-plan-v2.md` sections 2 to 4. Data shapes: `frontend/src/features/home/types.ts`; real backend responses: the golden fixtures in `frontend/src/features/home/fixtures/` (orchestrator-owned, never edit).

## What this run is, in one paragraph
The tests are **already written and committed red** (five new test files). Write five implementation files so that they pass, one step at a time, running the checkpoint command after every step and keeping the real output. Do not change any test, `types.ts` or a fixture. The components are **presentational** (props in, callbacks out); no fetching, hooks for data, routes or page here.

## Rules (read twice)
1. **Scope.** Create **only** the five files in section 3. Anything else (tests, `types.ts`, fixtures, `package.json`, earlier files) is out of bounds.
2. **Never edit a test to make it pass.** If a test seems wrong, stop and describe it in the report (the orchestrator validated every test against a working solution).
3. **Run the checkpoint command after every step** and keep its real output for the report; fix your code, not the test.
4. **No new dependency, no `npm install`.**
5. **No float formatting of money or percentages.** Never `parseFloat`, `toFixed` or `Intl` in any Home file, **comments included** (a guard test greps whole file text). `Number(` and `Math.round` are allowed only for geometry (bar widths, scale positions); displayed text comes from the string helpers in `homeFormat.ts` and from the exact-decimal helpers below.
6. **No hard-coded colours in `.tsx` files** (no `#` followed by hex digits, no `rgb(`, comments included): CSS variables only. The one exception is the score chip colour, which comes from `scoreBand` in `homeFormat.ts` and is set from a variable in code, never typed. Other features may not be imported.
7. **Exact strings.** Every visible string, accessible name, test id and attribute in section 4 must be used exactly as written (including `·`, `▲`, `▼`, `—`, `₹`).
8. **Do not refactor, rename or "improve" anything outside the file map.** 2-space indentation, double quotes, semicolons, `@/` imports for project code.
9. **If anything differs from this packet, stop and report it.**
10. **Run every command inside WSL** (Step 0).

## Step 0: environment check (do this first, and report the output)
The folder is opened as `W:\home\ayush\wt\home-fe2`; **every command (`git`, `npm`, `npx`, `grep`, `cd`) runs inside WSL**: `wsl.exe -d Ubuntu --cd /home/ayush/wt/home-fe2 -- <command>` for git, `wsl.exe -d Ubuntu --cd /home/ayush/wt/home-fe2/frontend -- <command>` for npm/npx; a command containing `|` is run as `... -- bash -c "<command>"`.
Run and report the output of each:
```
git branch --show-current          # expect: feat/home-frontend-b
git log --oneline -4               # expect the top line to start with: test(home): failing tests for the Home movers
git status --short                 # expect: nothing printed
cd frontend && npx tsc -b          # expect: errors only about the missing modules (red state), nothing else
npx vitest run src/features/home/sections/WealthCard.test.tsx   # expect: 30 passed (the previous run is present)
npx vitest run src/features/home/moversCopy.test.ts             # expect: FAIL, "Failed to resolve import ./moversCopy" (red state)
```
State which way you run commands and whether you can edit files. If any expectation fails, **stop and report**.

## Goal
Two cards of the Home page: **What moved today** (net change, a gained/lost split bar, rows of the biggest gainers and losers grouped by sector, category or fund, an "others" line and a small panel listing the funds behind a row) and **Worth a look** (up to three cards that point to a weak fund, an underperforming fund, high costs or concentrated holdings).
**Non-goals:** no fetching, no page layout, no change to the kit or to earlier files, no working "View all..." or "Review..." links (they are greyed, "Coming soon").

## 3. File map
**Create (5), all under `frontend/src/features/home/`:**
- `moversCopy.ts`
- `components/MoverRow.tsx`
- `sections/Movers.tsx`
- `worthCopy.ts`
- `sections/WorthALook.tsx`
**Do not touch:** every `*.test.ts(x)` file, `types.ts`, `fixtures/`, `package.json`, `package-lock.json`, `src/index.css`, `src/shell/**`, `src/components/ui/**`, `src/lib/**`, everything created in earlier runs, anything under `backend/` or `Docs/`.
**Tests to satisfy (committed; read each before its step):** `moversCopy.test.ts`, `components/MoverRow.test.tsx`, `sections/Movers.test.tsx`, `worthCopy.test.ts`, `sections/WorthALook.test.tsx`; `guards.test.ts` is checked at the end and scans your new files.
**Available to import:** `../homeFormat` (`formatRupees`, `formatSignedRupees`, `formatPercent`, `formatSignedPercent`, `formatDate`, `changeDirection`, `scoreBand`, ...; read the file for exact signatures), `../components/ChangeBadge` (props `amount`, `pct`), `../components/PartialDataBadge` (prop `missingFunds`), `CLICK_ROW` from `@/lib/clickable`, `Skeleton` from `@/components/ui/skeleton`, lucide icons (`ArrowRight`, `ChevronRight`, `X`, `Factory`, `Layers`, `Briefcase`).

## 4. Specifications

### Step 1: `moversCopy.ts`
Pure functions; read `moversCopy.test.ts` (17 tests).
- `sumDecimals(values: string[]): string`: **exact** sum of money strings as a two-decimal string. Add as whole paise in a `BigInt`: parse `^([+-]?)(\d+)(?:\.(\d*))?$` (an unreadable value counts as zero), pad the fraction to three digits, take two as paise and round half away from zero on the third. Print `-` only for a negative total, then whole part, `.`, and two digits. `[]` gives `0.00`; `["-0.01","0.01"]` gives `0.00`.
- `splitShares(gains, losses, othersChange)` returns `{ gained: string; lost: string; gainedPct: number }`: gained = sum of the gains' `change` plus `othersChange` **if positive**; lost = the absolute value of the sum of the losses' `change` plus `othersChange` **if negative**; both as exact two-decimal strings (non-negative). `gainedPct` = gained / (gained + lost) × 100 rounded to one decimal (`Math.round(x * 10) / 10`), and `0` when the total is zero.
- `barHalfWidth(change: string, maxAbs: number): number`: `0` when the amount is not above zero or `maxAbs` is not above zero; otherwise `Math.min(50, Math.round(abs / maxAbs * 500) / 10)` (a bar grows from the middle, so the largest amount fills half the track).
- `groupLabel(view)`: `Sector`, `Category` or `Fund`.
- `barSubtitle(bar)`: `""` for no funds, `1 fund`, or `N funds` (by `bar.funds.length`).
- `othersLabel(count)`: `1 other` or `N others`.
**Checkpoint 1** (from `frontend/`): `npx vitest run src/features/home/moversCopy.test.ts` → expect **17 passed**.

### Step 2: `components/MoverRow.tsx`
Export `MoverRow` with props `{ bar: MoverBarOut; view: MoversView; maxAbs: number; onOpen: (bar: MoverBarOut) => void }`. Read `MoverRow.test.tsx` (7 tests).
- Root `<div role="button" tabIndex={0} data-testid={`mover-${bar.key}`}>`, classes include `CLICK_ROW`. Click and `Enter` call `onOpen(bar)`; Space calls `event.preventDefault()` then `onOpen(bar)`; any other key does nothing.
- Top line: a tile `<span data-testid={`mover-tile-${bar.key}`} data-view={view}>` holding an icon (`Factory` for sector, `Layers` for category, `Briefcase` for fund, size 16, `aria-hidden`); the label (truncate, medium weight) with the subtitle `barSubtitle(bar)` under it when it is not empty (muted, small); the amount `formatSignedRupees(bar.change)` (semibold, tabular, colour set through `style`); a `ChevronRight` (muted).
- The colour is `var(--neg-text)` when `changeDirection(bar.change) === "down"`, otherwise `var(--pos-text)`.
- Below: a centred bar: a track `<div aria-hidden="true">` (relative, height 2, rounded, background `var(--ui-divider)`) with a thin middle line, and inside it `<i data-testid={`mover-bar-${bar.key}`} data-side={isLoss ? "loss" : "gain"}>` absolutely positioned: width `` `${barHalfWidth(bar.change, maxAbs)}%` ``, the same colour as background, `left: "50%"` for a gain and `right: "50%"` for a loss.
**Checkpoint 2:** `npx vitest run src/features/home/components/MoverRow.test.tsx` → expect **7 passed**.

### Step 3: `sections/Movers.tsx`
Export `Movers` and `MoversProps`:
```ts
export interface MoversProps {
  status: "loading" | "error" | "data";
  data: MoversResponse | null;
  view: MoversView;
  onViewChange: (view: MoversView) => void;
  onRetry: () => void;
}
```
Read `Movers.test.tsx` (22 tests). Root: one `<section>` card with `rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5`. Title text `What moved today` is an `<h3>`.
- **Loading:** `<section role="status" aria-label="Loading movers">` with skeletons. **Error, or `data` null:** the title, `Could not load movers.` and a button `Try again` (`onRetry`).
- **Nothing moved** (`gains` and `losses` empty and `others_count` is `0`): the title and the text `No movement data yet`.
- **Normal**, top to bottom:
  1. Header: the title; when `data.estimated`, a pill `Estimated` inside an element with `title="Spread over each fund's sectors using its latest monthly holdings"`; `PartialDataBadge` when `data.partial` (with `data.missing_funds`). On the right a `<div role="group" aria-label="Group by">` of three `<button type="button" aria-pressed={...}>` labelled `groupLabel(option)` for `sector`, `category`, `fund` in that order; click calls `onViewChange(option)`.
  2. When `data.fell_back`: `<p data-testid="movers-fallback">` with exactly `Sector view needs holdings for at least half of your funds, so categories are shown instead.`
  3. `Net change today` (caption) and `<ChangeBadge amount={data.net_change} pct={data.net_pct} />`.
  4. The split bar `<div data-testid="movers-split">` (a flex row, rounded, overflow hidden): `<i data-testid="split-gain">` only when gained is not `0.00`, width `` `${gainedPct}%` ``, background `var(--pos-text)`; `<i data-testid="split-loss">` only when lost is not `0.00`, width `` `${roundOne(100 - gainedPct)}%` `` (`roundOne = x => Math.round(x * 10) / 10`), background `var(--neg-text)`. Under it two spans: `` `Gained ${formatRupees(gained)}` `` and `` `Lost ${formatRupees(lost)}` ``.
  5. When `data.gains` is not empty: caption `Lifted your portfolio` and one `MoverRow` per gain (in the given order). When `data.losses` is not empty: caption `Pulled it down` and one `MoverRow` per loss. `maxAbs = Math.max(0, ...all gains and losses .map(bar => Math.abs(Number(bar.change))))`. The row's `onOpen` opens the panel.
  6. When `data.others_count > 0`: `<div data-testid="movers-others">` (**no role**, not clickable) with `othersLabel(data.others_count)` and `formatSignedRupees(data.others_change)` (negative colour when `changeDirection(...) === "down"`, otherwise positive).
  7. **Panel** for the opened row: `<div role="dialog" aria-label={`${bar.label} funds`} tabIndex={-1}>` with the label, a close button `<button type="button" aria-label="Close">` (an `X` icon, `aria-hidden`) and a `<ul>` with one `<li>` per fund: the name, and **only when `fund.change` is not null** `formatSignedRupees(fund.change)`. Focus the dialog when it opens (a `useEffect` + ref is fine). `Escape` (keydown on the dialog) and the close button close it. **The panel remembers the view it was opened in** and is shown only while `opened.view === view`, so changing the view closes it without an effect: `useState<{ bar; view } | null>`.
  8. Footer: a greyed link `<span aria-disabled="true" title="Coming soon">View all by day's change` + an `ArrowRight` icon (muted, `cursor-not-allowed`), and a footnote: `Sector figures are estimates and add up to the exact change.` when `data.estimated`, otherwise `Rows add up to the net change.`
**Checkpoint 3:** `npx vitest run src/features/home/sections/Movers.test.tsx` → expect **22 passed**.

### Step 4: `worthCopy.ts`
Pure functions; read `worthCopy.test.ts` (24 tests). It may import `sumDecimals` from `./moversCopy` and `formatDate`, `formatPercent`, `scoreBand` from `./homeFormat`.
- `formatMonthYear(iso)`: month name and year (`Sep 2026`) taken from `formatDate(iso)` (which prints `30 Sep 2026`: use its second and third words); `—` when `formatDate` gives no three-word date.
- `percentPointDifference(a, b)`: exact `a - b` as a two-decimal string, with `sumDecimals([a, negated b])` (negate by flipping a leading `-` / `+`, otherwise prefix `-`).
- `worthChip(kind)`: `weak_fund` and `underperforming` give `Performance`; `high_expense` gives `Cost`; `concentration` gives `Concentration`.
- `worthHeadline(card)`: fund name = `card.scheme_name` trimmed, or `This fund` when empty/null (never the word `null`). `weak_fund`: `<name> is among the weakest in its category`; `underperforming`: `<name> is lagging its category`; `high_expense`: `<name> costs more than its category`; `concentration`: `Your portfolio is becoming more concentrated` when both `evidence.top5_pct` and `evidence.earlier_top5_pct` are usable and the exact difference (top minus earlier) is above zero, otherwise `A large share of your portfolio sits in a few stocks`. Evidence values are `unknown`: accept only a non-empty string or a finite number (turned into a string).
- `scoreChip(card)`: `null` unless the kind is `weak_fund` and `evidence.final_score` is a finite number; otherwise `{ text: `Score: ${band.word}`, color: band.color }` with `band = scoreBand(Number(final_score))`.
- `worthDetail(card)`: `weak_fund` with `evidence.share_pct`: `` `This fund is ${formatPercent(share, { digits: 1 })} of your portfolio and sits in the lowest group for its category.` ``; `high_expense` with `evidence.gap_pp`: `` `${gap} percentage points above the average for the same plan type.` ``; otherwise `""`.
- `costScale(ter, avg)` returns `{ tick, dot }`: `scaleMax = Math.max(1.5, Number(ter), Number(avg))`; `tick` = avg / scaleMax × 100 and `dot` = ter / scaleMax × 100, each rounded to one decimal.
- `comparisonBars(fund, category)` returns `{ fund: { width, side }, category: { width, side } }`: `scale = Math.max(abs(fund), abs(category), 1)`; `width = Math.round(abs / scale * 500) / 10`; `side` is `loss` when the value is below zero, otherwise `gain`.
- `concentrationTrend(evidence)`: `null` unless both `earlier_top5_pct` and `top5_pct` are usable. `difference = percentPointDifference(top, earlier)`; `points` = the whole part of the difference's absolute value, plus one when the first fractional digit is 5 or more. `chip` = `No change` when `points` is `0`, otherwise `▲ N pts` (rise) or `▼ N pts` (fall; a difference starting with `-`). `earlier` = `` `${formatPercent(earlier, { digits: 0 })} earlier` ``.
**Checkpoint 4:** `npx vitest run src/features/home/worthCopy.test.ts` → expect **24 passed**.

### Step 5: `sections/WorthALook.tsx`
Export `WorthALook` and `WorthALookProps` (`{ status: "loading" | "error" | "data"; data: WorthResponse | null }`). Read `WorthALook.test.tsx` (14 tests).
- **Loading:** `<section role="status" aria-label="Loading worth a look">` with a title skeleton and three card skeletons. **Error, or `data` null:** `<section>` with `<h3>Worth a look</h3>` and `Could not check right now.` (the section never blocks the page). **`data.state === "unavailable"`:** return `null` (render nothing). **`data.state === "nothing_flagged"`:** the title and the plain text `Nothing needs attention.` (no card).
- **Otherwise:** `<h3>Worth a look</h3>` and a grid (`grid gap-3 md:grid-cols-3`) with one card per entry of `data.cards` **in the given order** (never invent a card). Each card: `<div data-testid={`worth-card-${card.kind}`}>` (`rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4`):
  - Chips row: a chip with `worthChip(kind)` (classes `rounded-full bg-[var(--warn-bg)] px-2 py-0.5 text-xs font-medium text-[var(--warn-text)]`), and when `scoreChip(card)` is not null a second chip with its text, `data-score-color={score.color}` and the text colour set through `style={{ color: score.color }}`.
  - `<h3>` with `worthHeadline(card)`; a muted `<p>` with `worthDetail(card)` when it is not empty.
  - A visual by kind (each returns nothing if its evidence is missing; strings via `str(value)` = non-empty string or finite number, else `null`):
    - `underperforming` (`evidence.fund_1y_pct`, `evidence.category_avg_1y_pct`): a caption `Last 1 year`, then two rows `This fund` and `Category`, each: label, a centred track (as in `MoverRow`, with the bar `<i data-testid="compare-fund">` / `data-testid="compare-category"`, `data-side`, width `` `${width}%` `` from `comparisonBars`, `left: "50%"` for a gain and `right: "50%"` for a loss, `var(--pos-text)` / `var(--neg-text)` as background), and the value `formatSignedPercent(value, 1)`.
    - `high_expense` (`evidence.ter`, `evidence.category_avg_ter`): a track with `<i data-testid="cost-tick" style={{ left: `${tick}%` }}>` (thin muted tick) and `<i data-testid="cost-dot" style={{ left: `${dot}%` }}>` (small dot, `var(--warn-text)`), and under it two captions: `` `Category average ${formatPercent(avg, { digits: 2 })}` `` and `` `This fund ${formatPercent(ter, { digits: 2 })}` ``.
    - `concentration`: a caption `` `Approximate · holdings as of ${formatMonthYear(str(evidence.holdings_as_of))}` ``; the share `<span data-testid="concentration-pct">` = `formatPercent(top5_pct, { digits: 0 })` (large) followed by `` `of your portfolio value sits in just ${stocks.length} stocks` ``; when `concentrationTrend(evidence)` is not null, a chip `<span data-testid="concentration-trend">` with `trend.chip` and the text `trend.earlier`; a stacked bar with one `<i data-testid={`stock-segment-${index}`} data-color={`var(--c${index + 1})`}>` per stock (`style` width `` `${Number(stock.exposure)}%` `` and background the same variable); and a legend `<ul>` with `<li>` per stock: a small dot in the same colour and `` `${name} ` `` followed by a bold `formatPercent(exposure, { digits: 1 })`. `stocks` come from `evidence.stocks`: keep only array items that are objects with a usable `name` and `exposure_pct`; anything else gives an empty list.
  - A greyed link at the bottom: `<span aria-disabled="true" title="Coming soon">` with the text `Review this fund` (`weak_fund`, `underperforming`), `See how costs compare` (`high_expense`) or `See what is driving it` (`concentration`) and an `ArrowRight` icon.
**Checkpoint 5:** `npx vitest run src/features/home/sections/WorthALook.test.tsx` → expect **14 passed**.

### Step 6: final checks (from `frontend/`, in this order; paste every output)
```
npx tsc -b                                          # expect: no output
npx oxlint src/features/home                        # expect: Found 0 warnings and 0 errors
npx vitest run src/features/home                    # expect: Test Files 23 passed, Tests 327 passed
npx vitest run src/components/ui/charts src/lib src/styles   # expect: Test Files 16 passed, Tests 188 passed
npm run build                                       # expect: "built in" with no error (a chunk-size warning is normal)
cd .. && git status --short                         # expect only the five new files under frontend/src/features/home
```
**Do not commit and do not push.** The orchestrator verifies and commits.

## Stop conditions
Stop and report if: Step 0 does not match; a checkpoint still fails after two honest attempts; a test appears to contradict this packet; you would need to edit a file outside section 3; a command needs `npm install`.

## Report (fill in at the end, in one fenced block, with the real command outputs)
```
GEMINI REPORT — ui-redesign — G5 (Home movers and worth a look)
Model and tool:    Date/time:
0. ENVIRONMENT: WSL terminal or wsl.exe prefix? Could you edit files? Step 0 outputs (all six):
1. FILES CREATED (exact paths):
2. CHECKPOINTS: for each of 1 to 5, the command and the last lines of its output (passed counts):
3. FINAL CHECKS (step 6), full outputs:
4. ANYTHING THAT DIFFERED FROM THE PACKET, and what you did:
5. TESTS THAT SEEMED WRONG (if any), with the exact failing assertion:
6. THINGS YOU COULD NOT DO OR VERIFY:
7. CONFIRMATIONS: tests untouched: yes/no; types.ts and fixtures untouched: yes/no; files outside the file map untouched: yes/no; no npm install: yes/no; nothing committed: yes/no
```

## Orchestrator notes (not for Gemini)
- **Validation:** the tests were validated against a private Sonnet-built reference (`~/home-fe-ref5`); the counts in this packet are from that reference run, re-run by the orchestrator (register C107).
- **Decisions (register C107):** the "others" row is not expandable (the API gives only a count and an amount); the sector-view panel shows no per-fund amount (not known), the fund-view panel does; "worth a look" renders nothing when no stored analysis exists and never blocks the page; "Review..." and "View all..." links are greyed until their target pages exist; the split bar counts "others" on the side of its sign so that Gained minus Lost equals the net change exactly.
