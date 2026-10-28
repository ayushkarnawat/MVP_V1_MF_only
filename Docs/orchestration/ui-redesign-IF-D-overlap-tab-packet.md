# Packet IF-D for Gemini (Antigravity): Individual Fund page, the Overlap tab (normal state, comparison state with six sub-tabs, the third route goes live)
**Status:** READY FOR GEMINI once IF-C is committed and `feat/if-overlap` is rebased onto it and pushed (written 28 Oct 2026; the red tests are committed locally as `aff739c2` on `feat/if-overlap`, which today sits on the IF-C RED commit `3711b620`; nothing is pushed). **Worker:** Gemini in Antigravity (Flash, high). **Orchestrator and verifier:** Claude Code. **Branch and folder:** `feat/if-overlap`, in the git worktree `/home/ayush/wt/if-fe` on WSL (open it in Antigravity as `W:\home\ayush\wt\if-fe`), the same worktree that built IF-C on `feat/if-live`. **Stacking:** IF-D builds on IF-C. The orchestrator commits the IF-C green work on `feat/if-live`, rebases `feat/if-overlap` onto it (the IF-D red commit is the only commit that moves) and pushes it; only then is the owner's sync (section 7) run. **Step 0 is therefore written for the state "IF-C green + IF-D red".** The red-test commit message starts `test(individual-fund): failing tests for the Overlap tab (IF-D)`. Never touch another worktree.
**Parent documents:** mutual-funds frontend plan Task 15 (`Docs/superpowers/plans/2026-10-24-mutual-funds-frontend-plan.md`, "Overlap Analysis tab, normal and comparison states"); mockups `2026-10-24-mutual-funds-individual-fund-mockup.html` (normal state and comparison state) and `2026-10-23-individual-fund-design-mockups.html`; register C118 (the page keeps three tabs), C121 (T15 is MF-D), C124, C132, C133, C139, C166; backend handoff `ui-redesign-IB-individual-fund-backend-handoff.md` section A.2 (routes 16 and 17) and the BT5 definitions; the real golden fixtures `backend/tests/fixtures/fund/overlap_fund.json`, `overlap_compare.json`, `overlap_unavailable.json` (already in `frontend/src/features/individual-fund/fixtures`, byte-identical, checked with a hash compare against `wt\IFBE`); sibling packets `ui-redesign-IF-C-go-live-packet.md` (the shape of this one) and `ui-redesign-IF-B2-individual-fund-packet.md`. Method: `Docs/orchestration/2026-10-26-execution-plan-v2.md` sections 2 to 4. **This packet is the whole truth for this run: where an earlier packet, the plan or the handoff text and this packet differ, this packet wins** (section 6 lists every difference and why).

## What this run is, in one paragraph
The Individual Fund page has an Overview tab and an Insights tab (live since IF-C) and a greyed "Overlap" tab. This run builds the Overlap tab: **one screen with two states and no URL change**. The *normal state* shows how much of this fund's stock holdings are also held by the other funds in the chosen view (a donut, a three-part distribution bar, the table of common stocks, the common stocks grouped by sector with in-place expansion, one "Quick insights" sentence, and the "Top Funds with Overlap" list). A click (or Enter) on a fund in that list opens the *comparison state*: both funds' headers, an overlap donut, a "Back to <fund>'s overlap" control, six real sub-tabs (Overview with the impact donut, Common Holdings, Unique Holdings, Sector Comparison, Market Cap Comparison, Performance Comparison which calls the existing performance route for each fund) and a "Key takeaways" sentence. The tests, the helper test and the edits to five existing test files are **already written and committed red** (the three Overlap golden fixtures and the Overlap response types in `types.ts` were added in IF-C). You **create 15 source files** (14 in a new folder `features/individual-fund/overlap/` plus `OverlapPage.tsx`) and **edit 7 existing source files**; no backend change, no new endpoint, no new dependency. The Overlap route file flips from placeholder to live (the `status` and `page` lines only), the Overlap tab in `FundPageFrame.tsx` becomes a real link, and the greyed "See Overlap" link on the Insights tab becomes a real link to this tab.

## Rules (read twice)
1. **Scope.** Create the 15 files and edit the 7 files in section 3, nothing else. Every test file, `types.ts`, everything in `fixtures/`, `__support__/`, `fundCopy.ts`, `fundFormat.ts`, `useFundSection.ts`, the other route files, the shell, the kit (`src/components/**`), `lib/`, Home, Planning, Mutual Funds, Profile and every other source file are out of bounds.
2. **Never edit a test, a fixture or `types.ts` to make it pass.** If a test seems wrong, stop and describe it in the report (the orchestrator validated every test against a working solution, and checked 20 deliberate breaks of that solution: 19 are caught, the 20th is covered by the extra scope test).
3. **Run the checkpoint command after every step**, keep its real output for the report; fix your code, not the test.
4. **No new dependency, no `npm install`.**
5. **No float formatting of money or percentages.** Never write `parseFloat`, `toFixed` or `Intl.` in any Individual Fund source file, **comments included** (a guard test greps whole file text), and no `console.`. `Number(...)` only to turn a figure into a chart coordinate or a pie value. Show money and percent only through `formatRupees`, `formatPercent` (`@/lib/format`) and the helpers in `fundFormat.ts`; compare or add Decimal strings only with `compareDecimalStrings`, `diffDecimalStrings`, `sumDecimalStrings` (`@/lib/decimal`).
6. **No hard-coded colours** in the feature's `.tsx` files, **comments included** (a guard greps `#` followed by hex digits and `rgb(`). Use the tokens named in section 4 (`var(--c2)`, `var(--ui-divider)` ...).
7. **Do not import another feature** (only `@/lib/*`, `@/components/*`, `@/shell/*`, `features/auth/session` and the Individual Fund folder itself). Do not import from `features/mutual-funds` (it has its own, different overlap page).
8. **Links only through `paths`**; the backend is called only from `api.ts`.
9. **Exact strings.** Every string in quotes in section 4 is checked by a test, character for character (the `·` is U+00B7, the `₹` U+20B9, the apostrophes are plain `'`).
10. **Do not refactor, rename or "improve" anything outside the file map.** 2-space indentation, double quotes, semicolons, no `any`, no unused locals or imports (`tsc -b` is strict).
11. **Lint.** `oxlint` warns when a file exports a component and also a constant or a hook: the component files below export components (and interfaces) only; `overlapLogic.ts` exports functions, types and one constant (it has no component). Do not add `oxlint-disable` comments.
12. **Hooks run before any early return** (`TopOverlapFunds` returns early when its list is empty: its hooks come first).
13. **If anything differs from this packet, stop and report it.**
14. **Run every command inside WSL** (Step 0). If one test fails with an "Unable to find an element ... timed out" message, or `src/shell/portedFlow.test.tsx` fails on a long run, re-run that file alone (`npx vitest run <file> --maxWorkers=4`) before you report it: the machine is shared and a one second `findBy` can time out under load. A test that fails twice in a row alone is real. Never run two `vitest` or `tsc` commands at the same time.

## Step 0: environment check (do this first, and report the output)
The folder is opened as `W:\home\ayush\wt\if-fe`; **every command (`git`, `npm`, `npx`, `grep`, `cd`) runs inside WSL**: `wsl.exe -d Ubuntu --cd /home/ayush/wt/if-fe -- <command>` for git, `wsl.exe -d Ubuntu --cd /home/ayush/wt/if-fe/frontend -- <command>` for npm/npx; a command containing `|` is run as `... -- bash -c "<command>"`.
Run and report the output of each:
```
git status --short                 # expect: nothing printed (run this FIRST, before anything else)
git branch --show-current          # expect: feat/if-overlap
git log --oneline -3               # expect: top line "... test(individual-fund): failing tests for the Overlap tab (IF-D)", then the orchestrator's IF-C commit, then "3711b620 test(individual-fund): failing tests for going live on the real backend fixtures (IF-C)"
cd frontend && npx tsc -b          # expect exactly 30 error lines, every one in a *.test.ts(x) file, none in a source file: SeeOverlapLink.test.tsx 3 (schemeId not on FactRow/InsightList/StrengthsConsiderations props), overlap/overlapApi.test.ts 7 (overlap and overlapCompare missing on fundPageApi), overlap/ComparisonTabs.test.tsx 5, overlap/overlapLogic.test.ts 2, overlap/ComparisonPanels.test.tsx 2, and 1 each for OverlapPage.test.tsx, OverviewPage.test.tsx, overlap/ComparisonOverview, ComparisonState, DistributionBar, NormalState, OverlapDonut, OverlapTab, PerformancePanel, SectorOverlap and TopOverlapFunds (cannot find module)
npx vitest run src/features/individual-fund/fixtures                  # expect: 1 file, 52 passed
npx vitest run src/features/individual-fund --maxWorkers=4            # expect: Test Files 19 failed | 26 passed (45); Tests 14 failed | 568 passed (582)   (14 suites cannot import their module: OverlapPage, OverviewPage, and overlap/ ComparisonOverview, ComparisonPanels, ComparisonState, ComparisonTabs, DistributionBar, NormalState, OverlapDonut, OverlapTab, PerformancePanel, SectorOverlap, TopOverlapFunds, overlapLogic; the 14 failed tests are overlapApi 6, SeeOverlapLink 5, FundPageFrame 1, InsightsPage 1, guards 1)
npx vitest run src/features/planning --maxWorkers=4                   # expect: Test Files 20 passed (20); Tests 324 passed (324)
npx vitest run src/shell src/App.test.tsx --maxWorkers=4              # expect: Test Files 1 failed | 26 passed (27); Tests 1 failed | 346 passed (347)   (only the live-routes list in wrappers.test.tsx)
npx vitest run src/components/mf --maxWorkers=4                       # expect: Test Files 9 passed (9); Tests 50 passed (50)
npx vitest run src/components/ui/charts src/lib src/styles            # expect: Test Files 17 passed, Tests 190 passed
```
State which way you run commands and whether you can edit files. If any expectation fails, **stop and report** (above all: if the IF-C tests are not all green, IF-C has not been committed yet and this run must not start).

## Goal
Make the Overlap tab work on the real backend and reachable in the app: (1) the Overlap route (`/portfolio/mutual-funds/funds/:schemeId/overlap`) loads the real page instead of the "Coming soon" placeholder; (2) the page's Overlap tab is a real link (Overview, Overlap and Insights are all links); (3) the Insights tab's "See Overlap" link goes to the Overlap tab.
**Non-goals:** any change to Overview or Insights behaviour other than the two links; a separate URL for the comparison (the plan and the mockup say one screen, two states); recommendation callouts ("Our view", "Consider Review", "See recommended alternative funds" are dropped by the owner), an Action column, AUM and expense-ratio fields in the comparison header (the response has no such field, section 6 backend ask BA1); a stat band above the tabs; any backend change; any fixture or type edit.

## 3. File map
**Create (15 source files):**
- `frontend/src/features/individual-fund/overlap/overlapLogic.ts` (Step 1)
- `.../overlap/OverlapDonut.tsx`, `DistributionBar.tsx`, `SectorOverlap.tsx`, `TopOverlapFunds.tsx` (Step 2)
- `.../overlap/CommonHoldingsTable.tsx`, `NormalState.tsx` (Step 3)
- `.../overlap/ComparisonTabs.tsx`, `ComparisonOverview.tsx`, `HoldingsPanels.tsx`, `BarPanels.tsx`, `PerformancePanel.tsx` (Step 4)
- `.../overlap/ComparisonState.tsx`, `OverlapTab.tsx` (Step 5)
- `frontend/src/features/individual-fund/OverlapPage.tsx` (Step 6)

**Edit (7, only the lines named):**
- `frontend/src/features/individual-fund/api.ts` (Step 1: two methods and two type imports)
- `frontend/src/features/individual-fund/FundPageFrame.tsx` (Step 6: tab type, breadcrumb word, the Overlap tab)
- `frontend/src/shell/routes/portfolio-mutual-funds-fund-overlap.route.tsx` (Step 6: the `status` and `page` lines only)
- `frontend/src/features/individual-fund/insights/FactRow.tsx`, `InsightList.tsx`, `StrengthsConsiderations.tsx`, `frontend/src/features/individual-fund/InsightsPage.tsx` (Step 7)

**Do not touch:** every `*.test.ts(x)` file, `types.ts`, `fixtures/`, `__support__/`, `fundCopy.ts`, `fundFormat.ts`, `useFundSection.ts`, the Overview and Insights cards, `OverviewPage.tsx`, the other route files, `package.json`, `package-lock.json`, `src/index.css`, `src/lib/**`, `src/components/**`, the rest of `src/shell/**`, `src/features/**` outside the files above, anything under `backend/` or `Docs/`.
**Tests to satisfy (committed; read each before its step):** `overlap/overlapApi.test.ts`, `overlap/overlapLogic.test.ts`, `overlap/OverlapDonut.test.tsx`, `DistributionBar.test.tsx`, `SectorOverlap.test.tsx`, `TopOverlapFunds.test.tsx`, `NormalState.test.tsx`, `ComparisonTabs.test.tsx`, `ComparisonOverview.test.tsx`, `ComparisonPanels.test.tsx`, `PerformancePanel.test.tsx`, `ComparisonState.test.tsx`, `OverlapTab.test.tsx`, `OverlapPage.test.tsx`, `insights/SeeOverlapLink.test.tsx`, and the five existing test files whose Overlap assertions were flipped: `FundPageFrame.test.tsx` (the tab strip), `OverviewPage.test.tsx` and `InsightsPage.test.tsx` (the Overlap route is live), `src/shell/routes/wrappers.test.tsx` (the live-routes list gains `portfolio-mutual-funds-fund-overlap`), `guards.test.ts` (the list of files it expects to find).
**Already in the folder (do not edit):** `types.ts` (`OverlapResponse`, `OverlapCompareResponse` and their parts, `Unavailable`); `fixtures/overlap_fund.json`, `overlap_compare.json`, `overlap_unavailable.json`; `components/SectionState.tsx` (loading, unavailable, error), `components/Segmented.tsx`; `useFundSection.ts`; `FundPageContext` and `FundPageFrame` (exported from `FundPageFrame.tsx`); `fundCopy.ts` (`DEFAULT_PERIOD`, `PERFORMANCE_PERIODS`, `unavailableText`); `fundFormat.ts` (`alignToDates` from IF-C, `axisLabel`, `changeDirection`, `formatDate`, `formatSignedPercent`); the kit `PieChart`, `PieSlice`, `LineAreaChart` (`@/components/ui/charts`); `SchemeLogo`; `AppLink` and `paths.mutualFunds.fundOverlap(schemeId)`.

## 4. Specifications
Common to the cards: a card is `<section aria-labelledby="...">` with classes `min-w-0 space-y-3 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5` and a heading `<h3 id="..." className="text-base font-semibold text-[var(--ui-text)]">`; muted text is `text-[var(--ui-text-muted)]`. The tests check roles, names, `data-testid`s, attributes and text, not class names, except where a class or colour token is named below. Money and percent: `formatRupees(x)` gives `₹2,250`, `formatPercent(x, { digits: 1 })` gives `18.0%`.

### Step 1: `api.ts` and `overlap/overlapLogic.ts`
Read `overlap/overlapApi.test.ts` (6 tests) and `overlap/overlapLogic.test.ts` (10 tests).
**`api.ts`:** add `OverlapCompareResponse` and `OverlapResponse` to the existing `import type { ... } from "./types"` (alphabetical, after `ManagerResponse`), and append two methods to `fundPageApi` after `insights`:
```ts
  overlap(schemeId: string, scope: string, signal?: AbortSignal): Promise<OverlapResponse | Unavailable> {
    return get<OverlapResponse | Unavailable>(fundPagePath(schemeId, "overlap", { scope }), signal);
  },

  overlapCompare(
    schemeId: string,
    otherSchemeId: string,
    scope: string,
    signal?: AbortSignal
  ): Promise<OverlapCompareResponse | Unavailable> {
    return get<OverlapCompareResponse | Unavailable>(
      fundPagePath(schemeId, `overlap/${encodeURIComponent(otherSchemeId)}`, { scope }),
      signal
    );
  },
```
**`overlap/overlapLogic.ts`** (create exactly):
```ts
import { compareDecimalStrings } from "@/lib/decimal";
import { formatPercent } from "@/lib/format";
import type { OverlapCompareResponse, OverlapDistribution, OverlapResponse } from "../types";

export type ComparisonTabId = "overview" | "common" | "unique" | "sector" | "market_cap" | "performance";

export const COMPARISON_TABS: readonly { id: ComparisonTabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "common", label: "Common Holdings" },
  { id: "unique", label: "Unique Holdings" },
  { id: "sector", label: "Sector Comparison" },
  { id: "market_cap", label: "Market Cap Comparison" },
  { id: "performance", label: "Performance Comparison" },
];

export function stocks(count: number): string {
  return `${count} ${count === 1 ? "stock" : "stocks"}`;
}

/** "3 common stocks out of 12 total holdings" (the donut caption of the normal state). */
export function commonStocksCaption(common: number, total: number): string {
  const holdings = total === 1 ? "holding" : "holdings";
  return `${common} common ${common === 1 ? "stock" : "stocks"} out of ${total} total ${holdings}`;
}

/** "3 common stocks out of 12 and 3 total holdings respectively" (the donut caption of the comparison state). */
export function comparisonCaption(common: number, totalA: number, totalB: number): string {
  return `${common} common ${common === 1 ? "stock" : "stocks"} out of ${totalA} and ${totalB} total holdings respectively`;
}

/** Each fund's stock count, derived from the comparison counts (its unique stocks plus the common ones). */
export function fundStockTotals(counts: OverlapCompareResponse["counts"]): { a: number; b: number } {
  return { a: counts.unique_a + counts.common, b: counts.unique_b + counts.common };
}

/**
 * A bar width in percent of the widest bar, for drawing only (a coordinate, never shown as a figure).
 * Zero, a missing max or a max of zero gives 0; the result is clamped to 0 to 100.
 */
export function barWidth(value: string | null | undefined, max: string | null | undefined): number {
  if (value == null || max == null) return 0;
  const top = Number(max);
  const own = Number(value);
  if (!Number.isFinite(top) || !Number.isFinite(own) || top <= 0 || own <= 0) return 0;
  return Math.min(100, Math.round((own / top) * 10000) / 100);
}

/** The widest value of a list of Decimal strings ("0" for an empty list). */
export function maxDecimal(values: readonly string[]): string {
  return values.reduce((best, value) => (compareDecimalStrings(value, best) === 1 ? value : best), "0");
}

export type DistributionKey = "unique_to_fund" | "common" | "unique_to_others";

export interface DistributionSegment {
  key: DistributionKey;
  label: string;
  count: number;
  pct: string;
}

/** The three segments of the Overlap Distribution bar, always in this order, with the backend's own percent strings. */
export function distributionSegments(distribution: OverlapDistribution): DistributionSegment[] {
  return [
    { key: "unique_to_fund", label: "Unique to this fund", count: distribution.unique_to_fund_count, pct: distribution.unique_to_fund_pct },
    { key: "common", label: "Common to your other funds", count: distribution.common_count, pct: distribution.common_pct },
    { key: "unique_to_others", label: "Unique to your other funds", count: distribution.unique_to_others_count, pct: distribution.unique_to_others_pct },
  ];
}

/** The "Quick insights" sentence of the normal state, built only from the response's own figures. */
export function quickInsight(overlap: OverlapResponse): string {
  if (overlap.total_stock_count === 0) return "No stock holdings are published for this fund yet.";
  if (overlap.common_stock_count === 0) {
    return `None of this fund's ${stocks(overlap.total_stock_count)} ${overlap.total_stock_count === 1 ? "is" : "are"} held by your other funds.`;
  }
  const verb = overlap.common_stock_count === 1 ? "is" : "are";
  const lead = `${overlap.common_stock_count} of this fund's ${stocks(overlap.total_stock_count)} ${verb} also held by other funds in your portfolio, together ${formatPercent(overlap.overlap_pct, { digits: 1 })} of this fund.`;
  const top = overlap.by_sector[0];
  return top ? `${lead} The most overlap is in ${top.sector} (${formatPercent(top.pct, { digits: 1 })}).` : lead;
}

/** The sector where the two funds share the most (by the `common` weight), or null when they share nothing. */
export function topCommonSector(sectors: OverlapCompareResponse["sector_comparison"]): string | null {
  let best: { sector: string; common: string } | null = null;
  for (const row of sectors) {
    if (compareDecimalStrings(row.common, best?.common ?? "0") === 1) best = row;
  }
  return best ? best.sector : null;
}

/** The "Key takeaways" sentence of the comparison state. */
export function keyTakeaway(compare: OverlapCompareResponse): string {
  const { common } = compare.counts;
  if (common === 0) return "These two funds hold no stock in common.";
  const lead = `These two funds share ${stocks(common)} worth a combined ${formatPercent(compare.impact.common_both.pct, { digits: 1 })} of your portfolio.`;
  const sector = topCommonSector(compare.sector_comparison);
  return sector ? `${lead} They overlap most in ${sector}.` : lead;
}
```
**Checkpoint 1:** `npx vitest run src/features/individual-fund/overlap/overlapApi.test.ts src/features/individual-fund/overlap/overlapLogic.test.ts` → expect **2 files passed, Tests 16 passed** (6 + 10).

### Step 2: `OverlapDonut`, `DistributionBar`, `SectorOverlap`, `TopOverlapFunds` (all in `overlap/`)
Read their four tests first. All text figures come from the props; nothing is hard-coded to the golden.
- **`OverlapDonut({ pct, label, caption })`** (`pct` a percent Decimal string such as `"18.0000"`). A wrapper `<div data-testid="overlap-donut" role="img" aria-label={`Overlap ${figure}`}>` (`figure` = `formatPercent(pct, { digits: 1 })`, e.g. `Overlap 18.0%`), 160 px square, `relative`. Inside: the kit `<PieChart data={data} size={160} innerRadius={56} padAngle={0.02} cornerRadius={3} className="h-full w-full">` with one `<PieSlice key={slice.label} index={index} />` per slice, and an absolutely centred `<span data-testid="overlap-donut-figure">` holding `figure`. `data` is exactly two entries: `{ label: "Overlap", value: Number(pct), color: "var(--c2)", formattedValue: pct }` and `{ label: "Not overlapping", value: <rest>, color: "var(--ui-divider)", formattedValue: rest }` where `rest = diffDecimalStrings("100", pct)` (exact decimal subtraction) and `value` is `Number(rest)` or `0` when that is not above zero (`17.3333` gives `82.6667`, `100.0001` gives `0`). Beside the donut: `<p data-testid="overlap-donut-label">{label}</p>` and `<p data-testid="overlap-donut-caption">{caption}</p>`.
- **`DistributionBar({ distribution })`** (`OverlapDistribution`). Local state `selected: DistributionKey | null`. Uses `distributionSegments`, `barWidth`, `stocks`. Root `<div role="group" aria-label="Overlap distribution">`. (a) A decorative bar `<div aria-hidden="true">` (3 px-tall rounded track, `flex`) holding one `<div>` per segment with `data-testid={`distribution-segment-${key}`}`, `data-pct={segment.pct}` (the raw backend string), `data-selected="true|false"`, `data-dimmed="true"` when something else is selected (else `"false"`), `style={{ width: `${barWidth(segment.pct, "100")}%`, background: <colour> }}` (colours: `unique_to_fund` `var(--c2)`, `common` `var(--c3)`, `unique_to_others` `var(--c4)`), a `title` of `` `${label}: ${stocks(count)}, ${formatPercent(pct, { digits: 1 })}` `` (e.g. `Unique to this fund: 9 stocks, 75.0%`), and an `onClick` that toggles the selection. (b) A `<ul>` of three rows, each `<li><button type="button" aria-pressed={selected === key} data-testid={`distribution-row-${key}`}>` whose text is the label, then `` `${stocks(count)} · ${formatPercent(pct, { digits: 1 })}` `` (e.g. `Unique to this fund9 stocks · 75.0%` as `textContent`: the label span and the figures span are adjacent). A click toggles (selecting the selected one clears it). The non-selected rows get `opacity-60` and the non-selected bar segments `opacity-25` while something is selected. (c) `<p data-testid="distribution-selected" aria-live="polite">` that is empty when nothing is selected and otherwise reads `` `${label}: ${stocks(count)}, ${formatPercent(pct, { digits: 1 })} of the stocks across all your funds.` ``.
- **`SectorOverlap({ sectors })`** (`OverlapSector[]`). Local state `open: string | null` (the open sector name; one at a time). Empty list: `<p data-testid="sector-empty">No common stocks to group by sector.</p>` and no list. Otherwise `<ul aria-label="Common holdings by sector">`, one `<li>` per sector in the given order: a `<button type="button" aria-expanded={isOpen} aria-controls={panelId} data-testid={`sector-row-${sector.sector}`}>` containing a rotating `ChevronRight` icon (`aria-hidden`), the sector name, an `aria-hidden` track holding a bar `<span data-testid={`sector-bar-${sector.sector}`} style={{ width: `${barWidth(sector.pct, widest)}%` }}>` (`widest = maxDecimal(all sector pct)`, so the widest bar is `100%`), and `formatPercent(sector.pct, { digits: 1 })` (the button's text is e.g. `Industrials7.0%`). Clicking it opens that sector and closes any other; clicking the open one closes it. Below each button a `<div id={panelId} role="region" aria-label={`${sector.sector} stocks`} hidden={!isOpen}>` (`panelId` = `sector-stocks-${index}`) that renders, only while open, a `<ul>` with one `<li>` per stock: `<span>{name}</span><span>{formatPercent(weight, { digits: 1 })}</span>` (text `Golden Stock 37.0%`).
- **`TopOverlapFunds({ funds, fundName, onCompare, restoreFocusId })`** (`restoreFocusId` optional, default `null`). This is the **compare picker: a labelled listbox**. Empty list: `<p data-testid="top-funds-empty">No other fund in your portfolio has published holdings to compare with.</p>` and no listbox (hooks first, then this return). Otherwise: a line `Choose a fund to see a full side-by-side comparison with {fundName}.` (one text node, as a `<p>`), an `aria-hidden` header line (`Fund name` on the left, `Overlap % · Common stocks` on the right; there is **no Action column**), and `<div role="listbox" aria-label="Funds to compare">` (scrolls: `max-h-96 overflow-auto`) holding one `<div role="option">` per fund, in the API order and **not capped** (14 funds give 14 options): `data-testid={`top-fund-${scheme_id}`}`, `aria-selected={index === active}`, `tabIndex={index === active ? 0 : -1}` (roving focus; `active` is local state, initially the index of `restoreFocusId` in the list or `0`), `onClick` calls `onCompare(scheme_id)`, `onFocus` makes it active. Content: `<span>{scheme_name}</span>`, then `{" "}`, then `<span>{formatPercent(overlap_pct, { digits: 1 })} overlap · {stocks(common_stock_count)} in common</span>`; the option's accessible name is therefore `Golden Peer 1 Fund 18.0% overlap · 3 stocks in common`. Keys on an option (`event.preventDefault()` for every handled key): `ArrowDown` and `ArrowUp` move to the next or previous option **without wrapping** (stop at the ends); `Home` the first; `End` the last (moving = set active and call `.focus()` on that option, keep refs in a `useRef<(HTMLDivElement | null)[]>([])`); `Enter` and `" "` call `onCompare` for that option; any other key does nothing and is not prevented. A `useEffect` focuses the option of `restoreFocusId` on mount (nothing when the id is not listed, so focus stays on `body`). Rows have hover background and a focus ring (`focus-visible:outline ... var(--ui-focus)`).
**Checkpoint 2:** `npx vitest run src/features/individual-fund/overlap/OverlapDonut.test.tsx src/features/individual-fund/overlap/DistributionBar.test.tsx src/features/individual-fund/overlap/SectorOverlap.test.tsx src/features/individual-fund/overlap/TopOverlapFunds.test.tsx` → expect **4 files passed, Tests 21 passed** (2 + 5 + 5 + 9).

### Step 3: `CommonHoldingsTable` and `NormalState`
Read `NormalState.test.tsx` (10 tests).
- **`CommonHoldingsTable({ holdings })`** (`OverlapCommonHolding[]`). Empty: `<p data-testid="common-empty">None of this fund's stocks are held by your other funds.</p>` (no table). Else a scrolling wrapper (`max-h-96 overflow-auto`, so the table is **not capped**) and `<table aria-label="Common holdings">` with a sticky `<thead>` of five `<th scope="col">`: `Stock`, `Sector`, `In this fund`, `Of your portfolio`, `Also held in`; one `<tr data-testid={`common-row-${isin}`}>` per holding in the API order with five `<td>`: name (bold), sector (muted), `formatPercent(fund_weight, { digits: 1 })`, `formatPercent(portfolio_weight, { digits: 1 })` (right-aligned), and the names of `held_in_funds` joined with `", "`.
- **`NormalState({ overlap, fundName, onCompare, restoreFocusId })`** (`overlap: OverlapResponse`, `restoreFocusId?: string | null`, default `null`). Root `<div data-testid="overlap-normal" className="space-y-5">`. First a block with `<h2 className="text-lg font-semibold ...">Overlap with Your Portfolio</h2>`, `<p>How much of this fund's holdings are duplicated elsewhere in your portfolio.</p>` and, only when there is a coverage note, `<p data-testid="overlap-coverage" className="text-xs ...">`. **Coverage note** (a local function): collect sentences: when `coverage.funds_without_disclosure` is not empty, `` `Holdings are not published yet for ${names joined ", "}, so they are not counted.` ``; when `compareDecimalStrings(coverage.covered_value_pct, "100") === -1`, `` `Funds with published holdings cover ${formatPercent(covered_value_pct, { digits: 1 })} of your portfolio's value.` ``; join the sentences with a single space; none gives no note (the golden: covered `100.0000`, no missing fund, no note). Then a grid `grid gap-5 min-[1100px]:grid-cols-2` of five cards (headings `h3`, in this order, ids of your choice): (1) **Overlap Summary**: `OverlapDonut` with `pct={overlap.overlap_pct}`, `label="overlap with your portfolio"`, `caption={commonStocksCaption(common_stock_count, total_stock_count)}`, then `DistributionBar` with `overlap.distribution`; (2) **Common Holdings by Sector**: a line `Choose a sector to see which stocks make it up.` then `SectorOverlap sectors={overlap.by_sector}`; (3) **Common Holdings** (spans both columns: wrap in `<div className="min-[1100px]:col-span-2">`): `CommonHoldingsTable`; (4) **Quick insights**: `<p data-testid="quick-insight">{quickInsight(overlap)}</p>`; (5) **Top Funds with Overlap**: `TopOverlapFunds funds={overlap.top_overlap_funds} fundName={fundName} onCompare={onCompare} restoreFocusId={restoreFocusId}`. A card with its `aria-labelledby` heading is found by tests as `getByRole("region", { name: "Overlap Summary" })`. The words "Our view", "Consider Review", "recommended alternative" and "Action" appear nowhere.
**Checkpoint 3:** `npx vitest run src/features/individual-fund/overlap/NormalState.test.tsx` → expect **1 file passed, Tests 10 passed**.

### Step 4: the comparison building blocks
Read the four tests first.
- **`ComparisonTabs({ selected, onSelect, renderPanel })`** (`ComparisonTabId`; `renderPanel: (tab) => ReactNode`). A real tab widget. `<div role="tablist" aria-label="Comparison views">` (horizontal scroll allowed) with one `<button type="button" role="tab" id={`cmp-tab-${id}`} aria-selected={id === selected} aria-controls={`cmp-panel-${id}`} tabIndex={id === selected ? 0 : -1}>` per `COMPARISON_TABS` entry (label text), `onClick` calls `onSelect(id)`. Keys (all with `preventDefault`, selection follows focus): `ArrowRight` next, `ArrowLeft` previous, **both wrapping**, `Home` first, `End` last; each calls `onSelect(newId)` and focuses that tab (refs); other keys do nothing and are not prevented. Below, **six** `<div role="tabpanel" id={`cmp-panel-${id}`} aria-labelledby={`cmp-tab-${id}`} hidden={id !== selected} tabIndex={0}>` (all six always in the DOM so every `aria-controls` points at a real element); **only the selected one contains `renderPanel(id)`**, the other five are empty (so nothing is fetched or drawn before its tab is opened; `renderPanel` is called for the selected tab only). The component is controlled (no state of its own). Selected tab style: `border-b-2 border-[var(--ui-focus)] text-[var(--ui-text)]`, others `border-transparent text-[var(--ui-text-muted)]`.
- **`ComparisonOverview({ data })`** (`OverlapCompareResponse`). Local state `selected: ImpactKey | null` with `ImpactKey = "common_both" | "unique_a" | "unique_b" | "other_funds"`. (a) A `<dl>` of three boxes: `data-testid="count-unique-a"` (`<dt>Unique to {fund_a.scheme_name}</dt><dd>{counts.unique_a}</dd>`), `count-common` (`Common holdings`, `counts.common`), `count-unique-b` (`Unique to {fund_b.scheme_name}`, `counts.unique_b`). (b) The impact donut: `<div data-testid="impact-donut" role="img" aria-label="Impact on your portfolio">` with the kit `PieChart` (`size={180}`, `innerRadius={62}`, `padAngle={0.02}`, `cornerRadius={3}`) and one `PieSlice` per **drawn** slice. The four rows, in this order and with these labels: `common_both` `Common to both funds`, `unique_a` `` `Only in ${fund_a.scheme_name}` ``, `unique_b` `` `Only in ${fund_b.scheme_name}` ``, `other_funds` `Your other funds`; colours `var(--c2)`, `var(--c3)`, `var(--c4)`, `var(--c6)`. **Drawn slices** are the rows whose `impact[key].pct` is above zero (`Number(pct) > 0`; a zero row is left out of the pie but keeps its legend row). Pie data per drawn row: `{ label, value: Number(pct), color, formattedValue: pct }`, **where `color` is the row's colour when nothing is selected or this row is selected, and `"var(--ui-divider)"` for every other row while one is selected** (the isolate effect; the kit pie has no per-slice opacity). Centre text: `<span data-testid="impact-centre-figure">` = `formatPercent(<selected row's pct, or common_both.pct when nothing is selected>, { digits: 1 })` and `<span data-testid="impact-centre-label">` = the selected row's label, or `combined weight of common holdings` when nothing is selected. (c) A legend `<ul aria-label="Impact on your portfolio">` of four `<li><button type="button" aria-pressed={selected === key} data-testid={`impact-row-${key}`} data-dimmed="true|false">` (dimmed = another row selected; add `opacity-60`), text: the label, then `` `${formatRupees(amount)} · ${formatPercent(pct, { digits: 1 })}` `` (e.g. `Common to both funds₹441 · 18.6%`). A click toggles the selection. (d) A last line `{stocks(counts.common)} in common. Amounts are the value of those holdings across both funds, as a share of your portfolio.`
- **`HoldingsPanels.tsx`** exports two components, both taking `{ data }`. **`CommonHoldingsPanel`**: with no `common_holdings`, `<p data-testid="compare-common-empty">These two funds hold no stock in common.</p>`; otherwise (scroll wrapper) `<table aria-label="Common holdings of the two funds">` whose five `<th scope="col">` are `Stock`, `Sector`, the full name of fund A, the full name of fund B, `Combined`; one `<tr data-testid={`compare-common-${isin}`} title={...}>` per holding in the API order with five `<td>`: name, sector, `formatPercent(weight_a, { digits: 1 })`, `formatPercent(weight_b, { digits: 1 })`, `formatRupees(combined)` (`169.50` gives `₹170`). The row `title` is `` `${name}: ${wA} of ${nameA}, ${wB} of ${nameB}, ${rupees} combined` `` with the formatted figures (`Golden Stock 3: 7.0% of Alpha Flexi Cap Fund - Direct Plan, 10.0% of Golden Peer 1 Fund, ₹170 combined`). **`UniqueHoldingsPanel`**: a line `The five largest stocks only one of the two funds holds.` and a two-column grid (`min-[900px]:grid-cols-2`) of two `<section aria-labelledby="unique-a">` / `unique-b` (heading `<h4 id="unique-a">` text `` `Unique to ${nameA}` `` / `` `Unique to ${nameB}` ``). Each lists its `unique_holdings.a|b` as `<li title={`${name} (${sector}): ${formatPercent(weight, { digits: 1 })} of the fund`}>` with `<span>{name} <span>{sector}</span></span><span>{formatPercent(weight, { digits: 1 })}</span>` (the `<li>` text is `Golden Stock 4 Healthcare8.0%`: a space between name and sector). An empty list shows `<p data-testid="unique-a-empty">` (or `unique-b-empty`) with `` `Every stock ${thisFund} holds is also in ${otherFund}.` `` and no `<li>`.
- **`BarPanels.tsx`** exports **`SectorComparisonPanel({ data })`** and **`MarketCapPanel({ data })`**, and a private `Figure({ value, widest, tone, testId })` = `<div><span>{formatPercent(value, { digits: 1 })}</span><span aria-hidden="true" (track)><span data-testid={testId} style={{ width: `${barWidth(value, widest)}%`, background: tone }} /></span></div>`. *Sector*: no rows gives `<p data-testid="compare-sector-empty">No sector breakdown is available for these funds.</p>`; else `<table aria-label="Sector comparison">`, columns `Sector`, `Common to both`, fund A name, fund B name; one `<tr data-testid={`sector-compare-${sector}`} title={`${sector}: ${common} common to both, ${a} of ${nameA}, ${b} of ${nameB}`}>` per row in the API order, with the sector in a `<th scope="row">` and three `<td>` each a `Figure` (testIds `sector-bar-common-${sector}`, `sector-bar-a-${sector}`, `sector-bar-b-${sector}`; tones `var(--c2)`, `var(--c3)`, `var(--c4)`); **all bars share one scale**: `widest = maxDecimal(every common, a and b value)`. *Market cap*: a line `Share of each fund's stocks by company size.` and `<table aria-label="Market cap comparison">` with columns `Size`, fund A name, fund B name and four rows `Large Cap`, `Mid Cap`, `Small Cap`, `Other` (keys `large`, `mid`, `small`, `other` of `data.market_cap.a` and `.b`), each `<tr data-testid={`marketcap-${key}`} title={`${label}: ${a} of ${nameA}, ${b} of ${nameB}`}>` (`Large Cap: 60.0% of Alpha ..., 70.0% of Golden ...`), `<th scope="row">` label and two `Figure` cells (testIds `marketcap-bar-a-${key}`, `marketcap-bar-b-${key}`; tones `var(--c3)`, `var(--c4)`), **scale `widest="100"`** (they are percents of the fund).
- **`PerformancePanel({ aId, bId, aName, bName })`**: the Performance Comparison sub-tab; **it calls the existing performance route once for each fund** (no new endpoint). Local state `period` (`PerformancePeriod`, initial `DEFAULT_PERIOD`). Two `useFundSection<PerformanceResponse>` calls: `fundPageApi.performance(aId, period, signal)` with deps `[aId, period]`, and the same for `bId`. Layout: `<Segmented label="Comparison period" options={PERFORMANCE_PERIODS mapped to { value, label }} value={period} onChange={setPeriod} />` (always shown), then `<SectionState status={status} label="performance comparison" onRetry={retry}>` with `status = "loading"` if either section is loading, else `"error"` if either is in error, else `"ready"`, and `retry` = both sections' `retry`. (Do not pass `reason`: an unavailable fund is handled inside the ready body.) The ready body: (1) `dates` = the dates of `(a.data ?? b.data).fund` (empty if neither); `series` = for each fund that has data, `{ key: "a" | "b", name, color, values: alignToDates(fund.data.fund, dates) }` with colours `var(--c2)` (A, plus `area: true`) and `var(--c3)` (B) — **both lines are put on the same dates with `alignToDates` from IF-C** because the two funds have a NAV on different days and the chart reads lines by position; (2) `<ul aria-label="Chart legend">` of two `<li data-testid="perf-legend-a">` / `perf-legend-b`: colour dot, the name, and `<b>` with `formatSignedPercent(data.period_returns.fund, 1)` or `—` when that fund has no data (text `Alpha ...+10.0%`), the `<b>` coloured by `changeDirection` (up `text-[var(--pos-text)]`, down `text-[var(--neg-text)]`, otherwise `text-[var(--ui-text)]`); (3) when `series.length > 0`, `<LineAreaChart series={series} labels={(i) => axisLabel(dates[i] ?? "", period)} tooltipLabel={(i) => formatDate(dates[i])} formatValue={(v) => formatSignedPercent(String(v), 1)} ariaLabel={`Performance comparison chart for ${period}`} height={250} />`; (4) `<table aria-label="Performance comparison">` with `Period`, fund A name, fund B name headers and one row: `<th scope="row">` = `Return since launch` when `period === "All"` else `` `${period} return` ``, then `<td data-testid="perf-return-a">` and `perf-return-b` = `formatSignedPercent(period_returns.fund, 1)` or `—` (same direction colours); (5) for each fund whose section status is `"unavailable"`, `<p data-testid="perf-unavailable-a">` (or `-b`) `` `${name}: ${unavailableText(reason)}` `` (e.g. `... : No price history yet for this fund.`); (6) when any fund's `since_launch` is true, `<p data-testid="perf-note">One of these funds is younger than the selected period, so its line starts at its launch date.</p>` (define this sentence as a local `const`, not exported). Expense ratio, AUM and CAGR rows are **not** shown (section 6, BA2).
**Checkpoint 4:** `npx vitest run src/features/individual-fund/overlap/ComparisonTabs.test.tsx src/features/individual-fund/overlap/ComparisonOverview.test.tsx src/features/individual-fund/overlap/ComparisonPanels.test.tsx src/features/individual-fund/overlap/PerformancePanel.test.tsx --maxWorkers=4` → expect **4 files passed, Tests 35 passed** (6 + 6 + 11 + 12).

### Step 5: `ComparisonState` and `OverlapTab`
Read `ComparisonState.test.tsx` (15 tests) and `OverlapTab.test.tsx` (13 tests).
- **`ComparisonState({ ctx, otherSchemeId, onBack })`** (`ctx: FundPageContext` from `../FundPageFrame`). Local state `tab: ComparisonTabId` (initial `"overview"`; the choice stays selected while the pair loads or reloads). `compare = useFundSection<OverlapCompareResponse>((signal) => fundPageApi.overlapCompare(ctx.schemeId, otherSchemeId, ctx.scope, signal), [ctx.schemeId, otherSchemeId, ctx.scope])`. A `useEffect` with `[]` focuses the heading ref when the state opens (a screen reader hears the new state). Root `<div data-testid="overlap-comparison" className="space-y-5">`. Top row: the **Back control** `<button type="button" onClick={onBack}>` with an `ArrowLeft` icon (`aria-hidden`) and the text ``Back to ${ctx.summary.scheme.name}'s overlap`` (accessible name `Back to Alpha Flexi Cap Fund - Direct Plan's overlap`), always shown (also while loading, unavailable or failed), and `<h2 ref tabIndex={-1} className="... outline-none">Fund comparison</h2>`. Below: `<SectionState status={compare.status} label="comparison" reason={compare.reason} onRetry={compare.retry}>` (so `no_disclosure` and `not_held` show the shared explanatory sentence, an error shows the shared box with Retry, and no tab strip is drawn in those cases). Ready body: (1) a header grid with two fund cards `<div data-testid="compare-fund-a">` / `compare-fund-b` (A left, B right, an `aria-hidden` `vs` between): `<SchemeLogo schemeName={fund.scheme_name} size="md" />`, the name, and `Current value {formatRupees(fund.current_value)}` (`Current value ₹2,250`); (2) `<OverlapDonut pct={data.overlap_pct} label="overlap" caption={comparisonCaption(counts.common, totals.a, totals.b)} />` with `totals = fundStockTotals(counts)`; (3) `<ComparisonTabs selected={tab} onSelect={setTab} renderPanel={...} />` mapping `overview` to `ComparisonOverview`, `common` to `CommonHoldingsPanel`, `unique` to `UniqueHoldingsPanel`, `sector` to `SectorComparisonPanel`, `market_cap` to `MarketCapPanel`, `performance` to `<PerformancePanel aId={data.fund_a.scheme_id} bId={data.fund_b.scheme_id} aName={data.fund_a.scheme_name} bName={data.fund_b.scheme_name} />`; (4) `<section aria-labelledby="key-takeaways-title"><h3 id="key-takeaways-title">Key takeaways</h3><p data-testid="key-takeaways">{keyTakeaway(data)}</p></section>`.
- **`OverlapTab({ ctx })`**: **one piece of navigation state, no URL change**. Local state `compareWith: string | null` (initial `null`) and `lastCompared: string | null` (initial `null`). `overlap = useFundSection<OverlapResponse>((signal) => fundPageApi.overlap(ctx.schemeId, ctx.scope, signal), [ctx.schemeId, ctx.scope])` (called on every render, before the branch). When `compareWith !== null` render `<ComparisonState ctx={ctx} otherSchemeId={compareWith} onBack={() => { setLastCompared(compareWith); setCompareWith(null); }} />`. Otherwise `<SectionState status={overlap.status} label="overlap" reason={overlap.reason} onRetry={overlap.retry}>` around `<NormalState overlap={overlap.data} fundName={ctx.summary.scheme.name} onCompare={setCompareWith} restoreFocusId={lastCompared} />` (render it only when `overlap.data` is not null). Going back does **not** ask for the overlap again (the hook lives in `OverlapTab`), and the row that was opened takes focus again.
**Checkpoint 5:** `npx vitest run src/features/individual-fund/overlap/ComparisonState.test.tsx src/features/individual-fund/overlap/OverlapTab.test.tsx --maxWorkers=4` → expect **2 files passed, Tests 28 passed** (15 + 13).

### Step 6: `OverlapPage.tsx`, the frame, the route
Read `OverlapPage.test.tsx` (11 tests), the changed tab-strip test in `FundPageFrame.test.tsx`, and the flipped assertions in `OverviewPage.test.tsx`, `InsightsPage.test.tsx`, `wrappers.test.tsx`, `guards.test.ts`.
- **Create `OverlapPage.tsx`** (exactly):
```tsx
import { useParams } from "react-router";
import { FundPageFrame } from "./FundPageFrame";
import { OverlapTab } from "./overlap/OverlapTab";

export function OverlapPage({ schemeId }: { schemeId: string }) {
  return (
    <FundPageFrame schemeId={schemeId} tab="overlap">
      {/* The key makes a member switch (or another fund) start again from the normal state. */}
      {(ctx) => <OverlapTab key={`${ctx.schemeId}:${ctx.scope}`} ctx={ctx} />}
    </FundPageFrame>
  );
}

export default function OverlapRoute() {
  const { schemeId } = useParams();
  return <OverlapPage schemeId={schemeId ?? ""} />;
}
```
- **`FundPageFrame.tsx`, three small edits.** (1) `export type FundTab = "overview" | "overlap" | "insights";`. (2) In the breadcrumb branch for the non-Overview tabs the current-page word `Insights` becomes `{tab === "overlap" ? "Overlap" : "Insights"}` (the crumbs, the fund link and the chevrons stay). (3) In the tab strip the disabled `<span aria-disabled="true" tabIndex={0} title={COMING_SOON} ...>Overlap</span>` is replaced by an `AppLink` exactly like the other two tabs:
```tsx
          <AppLink
            to={paths.mutualFunds.fundOverlap(schemeId)}
            className="pb-3 text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] transition-colors border-b-2 border-transparent"
            activeClassName="text-[var(--ui-text)] !border-[var(--ui-focus)]"
          >
            Overlap
          </AppLink>
```
  (`COMING_SOON` is still used by the two header buttons, keep its import.) The tab order stays Overview, Overlap, Insights. `AppLink` already draws a greyed "Coming soon" tab when the route is not live, which a test checks.
- **`portfolio-mutual-funds-fund-overlap.route.tsx`**, exactly these two lines change (the import path included):
```diff
-  status: "placeholder",
+  status: "live",
   title: "Fund Overlap",
-  page: () => import("../layout/PlaceholderPage"),
+  page: () => import("../../features/individual-fund/OverlapPage"),
```
**Checkpoint 6:** `npx vitest run src/features/individual-fund/OverlapPage.test.tsx src/features/individual-fund/FundPageFrame.test.tsx src/features/individual-fund/OverviewPage.test.tsx src/features/individual-fund/InsightsPage.test.tsx src/features/individual-fund/guards.test.ts src/shell/routes/wrappers.test.tsx --maxWorkers=4` → expect **6 files passed, Tests 98 passed** (11 + 15 + 24 + 15 + 8 + 25; re-run once if a `findBy` times out).

### Step 7: the "See Overlap" link on the Insights tab
Read `insights/SeeOverlapLink.test.tsx` (7 tests); the existing `FactRow`, `InsightList`, `StrengthsConsiderations` tests render without a `schemeId` and must stay green (the greyed stub stays when no `schemeId` is given).
- **`FactRow.tsx`:** add `import { AppLink } from "@/shell/nav/AppLink";` and `import { paths } from "@/shell/nav/paths";` (after the `@/lib/clickable` import); add an optional prop `schemeId?: string` to `FactRowProps` (with a one-line doc comment) and to the destructuring `({ fact, onOpen, schemeId })`. Replace the single `{fact.id === "overlap" && (<span data-testid="overlap-link" aria-disabled ...>See Overlap</span>)}` by two blocks: `{fact.id === "overlap" && schemeId !== undefined && (...)}` rendering `<span data-testid="overlap-link" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} className="shrink-0 rounded-md border border-[var(--ui-divider)] px-2 py-0.5 text-xs font-medium text-[var(--c2)] hover:underline"><AppLink to={paths.mutualFunds.fundOverlap(schemeId)}>See Overlap</AppLink></span>` (the row itself opens the evidence, so a click or key on the link must not also open it), and the **old greyed span unchanged** under `{fact.id === "overlap" && schemeId === undefined && (...)}`. Put the explanatory comment above the new `<span>` (a `//` comment inside the parentheses is fine in JSX only as `{/* ... */}`; if that does not compile, put the comment above the `return`).
- **`InsightList.tsx`** and **`StrengthsConsiderations.tsx`:** add optional `schemeId?: string` to their props interface, destructure it, and pass `schemeId={schemeId}` to every `<FactRow ... />` they render (one in `InsightList`, two in `StrengthsConsiderations`).
- **`InsightsPage.tsx`:** pass `schemeId={schemeId}` to `<InsightList />` and `<StrengthsConsiderations />`.
**Checkpoint 7:** `npx vitest run src/features/individual-fund/insights src/features/individual-fund/InsightsPage.test.tsx --maxWorkers=4` → expect **Test Files 11 passed, Tests 106 passed** (the insights folder 10 files including `SeeOverlapLink` 7 tests, plus `InsightsPage` 15).

### Step 8: final checks (from `frontend/`, in this order; paste every output)
```
npx tsc -b                                                          # expect: no output
npx oxlint src/features/individual-fund src/features/planning src/shell   # expect: exit code 0, no warning
npx vitest run src/features/individual-fund --maxWorkers=4          # expect: Test Files 45 passed, Tests 721 passed
npx vitest run src/features/planning --maxWorkers=4                 # expect: Test Files 20 passed, Tests 324 passed
npx vitest run src/shell src/App.test.tsx --maxWorkers=4            # expect: Test Files 27 passed, Tests 347 passed
npx vitest run src/components/mf --maxWorkers=4                     # expect: Test Files 9 passed, Tests 50 passed
npx vitest run src/components/ui/charts src/lib src/styles          # expect: Test Files 17 passed, Tests 190 passed
npm run build                                                       # expect: "built in" with no error (a chunk-size warning is normal)
cd .. && git status --short -uall                                   # expect: " M" for exactly the 7 edited files and "??" for exactly the 15 created files of section 3, nothing else
```
**Do not commit and do not push.** The orchestrator verifies and commits.

## Stop conditions
Stop and report if: Step 0 does not match (above all, IF-C not green); a checkpoint still fails after two honest attempts; a test appears to contradict this packet; you would need to edit a file outside section 3 (above all a test, `types.ts`, a fixture, `fundCopy.ts`, `fundFormat.ts`, a kit component or `Planning`); a command needs `npm install`; you are tempted to add a URL or a route for the comparison, a recommendation callout, an Action column, an AUM or expense-ratio field, a new backend call other than the two in Step 1 and the existing performance route, or an import from another feature.

## 5. Report (fill in at the end, in one fenced block, with the real command outputs)
```
GEMINI REPORT — ui-redesign — IF-D (Individual Fund: the Overlap tab)
Model and tool:    Date/time:
0. ENVIRONMENT: WSL terminal or wsl.exe prefix? Could you edit files? Step 0 outputs (all nine):
1. FILES CREATED (15) AND EDITED (7), exact paths; confirm nothing else changed and the five existing test files and types.ts/fixtures are untouched:
2. CHECKPOINTS: for each of 1 to 7, the command and the last lines of its output (passed counts):
3. FINAL CHECKS (step 8), full outputs:
4. ANYTHING THAT DIFFERED FROM THE PACKET, and what you did:
5. TESTS THAT SEEMED WRONG (if any), with the exact failing assertion:
6. THINGS YOU COULD NOT DO OR VERIFY (no browser pass? say so):
7. CONFIRMATIONS: tests untouched: yes/no; types.ts and fixtures untouched: yes/no; files outside the file map untouched: yes/no; no parseFloat/toFixed/Intl/console and no hard-coded colour in the new files: yes/no; no import from another feature: yes/no; the comparison has no URL or route: yes/no; no npm install: yes/no; nothing committed: yes/no
```

## 6. Spec conflicts, defaults and backend asks (not for Gemini; for the orchestrator and the register)
**What the red commit changes in files IF-C owns.** The red commit `aff739c2` contains only IF-D tests, but five existing test files assert the *old* Overlap state and had to be flipped: `FundPageFrame.test.tsx` (tab strip: Overlap is a link, not a disabled span), `OverviewPage.test.tsx` and `InsightsPage.test.tsx` (the route test said "Overlap stays a placeholder until IF-D"), `shell/routes/wrappers.test.tsx` (live-routes list gains `portfolio-mutual-funds-fund-overlap`), `guards.test.ts` (expected file names gain the 15 new sources). No IF-C test was touched otherwise; the IF-C green solution passes everything except those assertions, which is exactly Step 0. The fixtures and `types.ts` were not touched (the Overlap types and the three goldens came with IF-C; hashes re-checked against `wt\IFBE`).
**Where the real contract differs from the plan text and the mockup (each is a numbered default for a register entry; the tests changed accordingly):**
1. **Folder `features/individual-fund/overlap/`**, not `features/fund-page/overlap` (owner decision). Plan file names kept where they still fit (`OverlapTab`, `ComparisonTabs`); `NormalState`/`ComparisonState` as in the plan; `useFundOverlap.ts` and `api.ts` are not created (the page's `useFundSection` and the existing `api.ts` do the job); the plan's separate `FundTabs.tsx` does not exist (the tab strip lives in `FundPageFrame.tsx`).
2. **Third route live.** `portfolio-mutual-funds-fund-overlap` flips to live (`status`, `page`); the Overlap tab in the frame becomes a real link; the live-routes list in `wrappers.test.tsx` gains the id. All three Individual Fund routes are now live.
3. **One screen, two states, no URL** (plan, design.md section 11.3): `OverlapTab` holds `compareWith`; `OverlapPage` keys `OverlapTab` by scheme and scope so a member switch (or another fund) starts again from the normal state; Back does not refetch the overlap and refocuses the opened row; entering the comparison focuses its heading.
4. **The compare picker is the "Top Funds with Overlap" list drawn as a labelled listbox** (`role="listbox"`, options, roving tabindex, ArrowUp/Down/Home/End without wrapping, Enter and Space open) with no Action column and rows as the only entry (plan, mockup, owner brief). Not limited to 12 (the backend sends every disclosed fund). Selection-follows-focus is used for `aria-selected` (the list is a chooser, not a multi-select).
5. **The six comparison sub-tabs are a real `tablist`/`tab`/`tabpanel`** with automatic activation, wrapping arrows, Home/End, and all six panels present (five empty and hidden) so every `aria-controls` is valid; only the selected panel is mounted (so the performance routes are not called until that sub-tab opens).
6. **Unavailable states use the shared `SectionState` and `unavailableText`.** The backend emits exactly two reasons for both routes: `no_disclosure` ("Holdings not available yet for this fund house.") and `not_held` ("You don't hold this fund in this view."); an unknown reason reads "Not available right now." and never crashes. The comparison keeps its Back control in every state. The golden `overlap_unavailable.json` holds only `no_disclosure`; the `not_held` case is hand-made in tests.
7. **Quick insights and Key takeaways are sentences built in the front end** from the response (`quickInsight`, `keyTakeaway`: counts, shares, the biggest sector; no advice words; the "Our view / Consider Review" callout and "See recommended alternative funds" stay dropped).
8. **Performance Comparison calls route 3 (`performance`) for each fund**, 1Y by default with the same chips as the Overview chart; the second fund's line is put on the first fund's dates with IF-C's `alignToDates`; the row shows the cumulative return over the period (the mockup shows CAGR for 3Y and 5Y and an Expense Ratio row: not available from the performance route, hidden, BA2). A fund without history keeps a dash and its reason; both lines missing draws no chart.
9. **Comparison header shows logo (by scheme name only), name and current value.** The mockup also shows AUM and TER and an AMC-based logo; the response (`CompareFund`) has no such field, so they are hidden (BA1). Fund A's value equals the summary tile for the same view (tested).
10. **Bars are plain `div`s** with widths relative to the widest figure of the table (sector comparison) or to 100 (market cap, distribution), and a native `title` tooltip with the exact figures on every non-clickable row (mockup motion spec, section 11.1). Money and percent are formatted from the Decimal strings; bar widths and pie values use `Number()` as chart coordinates only.
11. **The impact donut "isolate on click" draws the other slices in `var(--ui-divider)`** (the kit pie has no per-slice opacity; the mockup dims to 25% opacity). The distribution bar and legend rows do use opacity.
12. **Coverage note** shown only when the response says funds are not covered (`funds_without_disclosure` non-empty or `covered_value_pct` below 100); the golden has none.
13. **Totals per fund in the comparison caption are derived** (`unique + common`) because `CompareFund` carries no stock count.
14. **"See Overlap" on the Insights tab becomes a real link** through an optional `schemeId` prop (`FactRow`, `InsightList`, `StrengthsConsiderations`, `InsightsPage`); without it the greyed stub stays (existing tests render without a router). The link sits inside the row's `role="button"` element and stops click and key propagation; this nested interactive element is an accessibility compromise (a screen reader may flag it) accepted to keep the row layout; a later redesign could make the row a non-button container with a separate "Details" button. No other greyed link in the app is touched (Home and Mutual Funds entry points remain a follow-up wiring packet).
15. **No stat band above the Overlap tab** (the mockup's header shows value, AUM and TER; the shared frame header already shows name, plan, category and AMC).
**Backend asks (nothing to build in this repo; elements hidden until answered):**
- **BA1.** `amc_name` (for the real logo), `aum` and `expense_ratio` on `fund_a`/`fund_b` of route 17 (mockup header). Hidden today.
- **BA2.** A 3Y/5Y CAGR (annualised) and the expense ratio of the second fund for the Performance Comparison table (mockup rows). Hidden; cumulative return shown.
- **BA3.** Goldens that do not exist: `not_held` for route 16 and routes 17, `no_disclosure` for the other fund of route 17, a comparison with a fund in an unknown (`Other`) sector bucket, a member-scope overlap. (Hand-made in tests.)
- **BA4.** **Possible inconsistency to check:** the `insights_full` golden's overlap fact says "Portfolio overlap with Golden Peer 1 Fund is 35%." while the overlap golden says the same pair overlaps by 18.0000 (and the comparison golden 18.0000). If both use the pair overlap definition the numbers should agree; the front end shows each text as sent.
- **BA5.** `held_in_funds` and `top_overlap_funds` carry fund ids and names but no link to the fund pages; if a fund's own page should be reachable from the comparison header, say so (not linked today: the fund may not be held in the chosen view).
**Defaults taken, needing register entries (numbered above, C-numbers assigned by the orchestrator):** 1 folder; 2 third route live and tab enabled; 3 one screen two states, key by scheme and scope, focus handling; 4 compare picker as labelled listbox; 5 real tabs, only the selected panel mounted; 6 shared SectionState for the two unavailable reasons; 7 front-end sentences, callouts dropped; 8 performance comparison via route 3 with alignment, no CAGR or expense ratio; 9 comparison header without AUM or TER; 10 plain-div bars with native tooltips; 11 isolate effect by colour; 12 coverage note; 13 derived per-fund totals; 14 "See Overlap" link through an optional prop, nested-interactive caveat; 15 no stat band.
**Unverified:** no browser pass (the page was not opened on a running backend, in light and dark, or at 1024 and mobile widths; every chart is a stub in the tests, so the pie slices, the bar widths and the tab strip's horizontal scroll were not seen); the isolate-by-colour effect and the sticky table headers were not looked at; screen reader behaviour (listbox, tabs, focus moves, the nested link) is covered by role/attribute tests only; the packet's checkpoint counts come from the reference on a machine under load (feature folder re-run once after one load flake in `OverviewPage.test.tsx`, which passes alone). Mutation checks on the reference (20 deliberate breaks: arrow `preventDefault`, list wrapping, all panels rendered, tab roving, scope key, no alignment, wrong period for the second fund, accordion single-open, distribution toggle, isolate colour, heading focus, refetch on scope, focus restore, decimal compare, coverage note, exact decimal rest, rupee formatting, breadcrumb word, id encoding, link stop-propagation, bar scale): 19 caught at once; the 20th (scope in the comparison's request key) was a survivor and has its own test now.
**Verification record (orchestrator, 28 Oct):** reference solution in `C:\Users\Dell\Desktop\MVP v1\ref\if-fe-ref-d` (IF-C green sources + the IF-D solution, never committed); `tsc -b` exit 0; `oxlint src/features/individual-fund src/features/planning src/shell` exit 0 and silent; individual-fund **45 files / 721 tests** (IF-C green: 30 / 593, +15 files, +128 tests); planning 20 / 324; shell and App 27 / 347; `src/components/mf` 9 / 50; kit (`charts`, `lib`, `styles`) 17 / 190; `npm run build` built. Step 0 state ("IF-C green + IF-D red", worktree `ref\if-fe-ref-d0` at `aff739c2` plus the four IF-C source files): tsc 30 error lines (all in test files), feature 19 failed files / 14 failed tests (568 passed of 582), shell+App 1 failed test (346 passed), planning/mf/kit unchanged. File map: **15 new source files, 7 edited** (about 1,400 lines of source).

## 7. Gemini prompt (paste into the Gemini window for folder `W:\home\ayush\wt\if-fe`)
**SYNC FIRST (owner runs this once, before pasting; Gemini must not run it).** Order of events: (1) Gemini finishes IF-C on `feat/if-live`; (2) the orchestrator verifies and commits it there and pushes `feat/if-live`; (3) the orchestrator rebases `feat/if-overlap` onto it (`git -C "C:\Users\Dell\Desktop\MVP v1\wt\IFD" rebase feat/if-live`, the IF-D red commit is the only commit that moves; its message stays `test(individual-fund): failing tests for the Overlap tab (IF-D)`) and pushes it (`git -C "C:\Users\Dell\Desktop\MVP v1\wt\IFD" push -u origin feat/if-overlap`). Then, in WSL (`wsl.exe -d Ubuntu`), switch the same worktree to the new branch (the IF-C work is committed, the installed packages stay):
```
git -C /home/ayush/wt/if-fe status --short                               # must print nothing (anything listed must already be on origin; otherwise stop and ask the orchestrator)
git -C /home/ayush/wt/if-fe fetch origin
git -C /home/ayush/wt/if-fe log --oneline -3 origin/feat/if-overlap      # top must be: test(individual-fund): failing tests for the Overlap tab (IF-D); then the IF-C commit; then 3711b620 ...
git -C /home/ayush/wt/if-fe switch -c feat/if-overlap --track origin/feat/if-overlap
git -C /home/ayush/wt/if-fe branch --show-current                        # must print: feat/if-overlap
git -C /home/ayush/wt/if-fe status --short                               # must print nothing
```
If `switch` refuses (a leftover local change), do not force it: use the replace procedure of the IF-C packet (move `frontend/node_modules` out, `git -C /home/ayush/wt/docs worktree remove --force /home/ayush/wt/if-fe`, `git -C /home/ayush/wt/docs worktree add /home/ayush/wt/if-fe -b feat/if-overlap --track origin/feat/if-overlap`, move `node_modules` back).
```
You are the front-end builder for the Unifolio UI redesign. Open the folder W:\home\ayush\wt\if-fe (WSL path /home/ayush/wt/if-fe, branch feat/if-overlap). Before anything else run `git status --short` and `git log --oneline -3` inside WSL; the first must print nothing and the top commit must be the red-test commit the packet names (test(individual-fund): failing tests for the Overlap tab (IF-D)), sitting on the IF-C commit. If not, STOP and report; do not fix it yourself. Read, completely and in order, Docs/orchestration/ui-redesign-IF-D-overlap-tab-packet.md (also at W:\home\ayush\wt\docs\Docs\orchestration\ui-redesign-IF-D-overlap-tab-packet.md). It is the whole truth for this run: do Step 0 first and report its outputs, then follow every step, rule and checkpoint exactly. The tests and the real backend fixtures are already committed (red); you create the 15 source files and edit the 7 source files the packet names, exactly as specified (the overlap/ folder under features/individual-fund, OverlapPage.tsx, and the named lines of api.ts, FundPageFrame.tsx, the Overlap route file, FactRow.tsx, InsightList.tsx, StrengthsConsiderations.tsx and InsightsPage.tsx). Never edit a test, a fixture or types.ts, never touch any other file, never run npm install, never commit, never add a URL or route for the comparison, never write parseFloat, toFixed, Intl. or a hard-coded colour (comments included), never import another feature into the Individual Fund folder. Run every command inside WSL (wsl.exe -d Ubuntu --cd /home/ayush/wt/if-fe ...) and never run two vitest or tsc commands at once. If a findBy times out in a file you did not touch, or portedFlow.test.tsx fails on a long run, re-run that file alone with --maxWorkers=4 before you report it. When done, send the report in the packet's report template with real command outputs. If anything differs from the packet, stop and report it.
```
