# Planning (market scenarios) Frontend Implementation Plan

> **For agentic workers:** execution method chosen by the owner (23 Oct): the **claude-codex method** of the `model-orchestration` skill (Claude orchestrates; Codex implements and self-tests; one handoff doc per delegated task under `Docs/orchestration/`; mandatory adversarial review before a task is `DONE`; the orchestrator does all staging, commits and merges, and only on the owner's word). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Planning page: a landing with two cards, a Coming soon view, and the market-scenario list and detail, by adding a desktop variant to the existing Scenarios screen without changing the classic behaviour that mobile and the old tab flow use.

**Architecture:** `ScenariosScreen` is renamed internally to a classic component and wrapped by a thin `ScenariosScreen` that takes `variant?: "classic" | "planning"`; the planning branch renders new components in `frontend/src/features/scenarios/planning/`. `PlanningPage` owns landing, Coming soon and browser-history steps and renders the planning variant. Charts are one small plain-markup component, no chart library.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind 3.4, lucide-react 0.475, vitest and Testing Library; decimal-string helpers in `lib/decimal`.

**Spec:** `Docs/orchestration/2026-10-23-planning-scenarios-functionality-backend-spec.md` (sections 1 to 5, 11), `-layout.md`, `-design-system.md`, `-reuse-vs-new.md`, `-tdd.md` section 2, the mockups workbook `-design-mockups.html` (visual reference), decisions L1 to L44 in `-decisions-v1.html`. API shapes come from `Docs/superpowers/plans/2026-10-23-planning-scenarios-backend-plan.md` Task 1.

**Branch:** `feat/planning-scenarios` (frontend part). Touches `frontend/src/features/scenarios/{types.ts,api.ts,ScenariosScreen.tsx,ScenariosScreen.test.tsx,api.test.ts}`, new files under `frontend/src/features/scenarios/planning/`, and the Planning route file under `frontend/src/shell/routes/`. No commit or push without the owner's word: every task ends in a checkpoint, not a commit.

## Global Constraints

- Mobile is untouched. `ScenariosScreen` with no props behaves exactly as today; every existing scenarios test and `mobile/MobileRoot.test.tsx` stay unchanged and green.
- No raw hex in components. Colours come from the scoped token names defined by the Home frontend plan T1 (`features/home/home-tokens.css`, `--ui-*`) and the shell tokens (`--shell-*`). Import the Home token file once from `planning/PlanningScenarios.tsx`. If a needed token (for example Warning or Informational text or tint) is missing there, stop and tell the owner; do not define a hex locally.
- Money and percentages stay decimal strings from the API to the screen. Use `lib/decimal` and `rupees` from `ResultParts`; never `parseFloat` a money value. Numbers may be converted only for bar geometry in `barScale`.
- Approved wording (L39) is used verbatim from `planning/planningCopy.ts` (Task 2).
- No chart library. No tooltip on bars (L40). Smooth scroll is skipped when `prefers-reduced-motion` is set.
- Icons are the approved set (L44): `Sprout`, `ChartColumn`, `TrendingDown`, `TrendingUp`, `Percent`, `Sparkles`, `Snowflake`, `Lightbulb`, `ChevronLeft`, `ChevronRight`, `Info`; confirm each export exists in the installed lucide-react (`node -e "console.log(Object.keys(require('lucide-react')).includes('ChartColumn'))"` from `frontend/`); swap with the owner's word if one is missing.
- No live network in tests; mock `./api` as the existing tests do. Run only the test files a task touches.
- Desktop only; light and dark through the tokens.

## Review Focus

- Browser Back after a refresh: the page returns to the landing and Back does not trap the user on a dead state (Task 9).
- A member chosen, then another scenario opened: the same member stays chosen; leaving Planning resets it (Task 8).
- A result with `benchmarks: []` (multi-phase, freeze): no benchmark tile and no benchmark chart; and one with `portfolio_impact_pct: null` (pre-2006): index return only, no gap line; never "NaN" or "null" text (Tasks 4 and 7).
- A household whose every fund is frozen or has no data: coverage line says so, charts hidden, no empty bars (Tasks 3 and 7).
- A very long scenario or fund name and a one-member household: text truncates inside its box and the member dropdown still renders (Tasks 6 and 7).

## File Structure

New, all under `frontend/src/features/scenarios/planning/`, each with a `.test.ts(x)`:
`planningCopy.ts`, `scenarioFormat.ts`, `planningHistory.ts`, `DivergingBars.tsx`, `BenchmarkChart.tsx`, `AssetClassChart.tsx`, `StatTile.tsx`, `tiles.ts`, `MemberSelect.tsx`, `MiraInsightsCard.tsx`, `MemberRows.tsx`, `ScenarioCard.tsx`, `ScenarioList.tsx`, `ScenarioDetail.tsx`, `PlanningScenarios.tsx`, `PlanningPage.tsx`. Existing files edited: `types.ts`, `api.ts` (additive), `ScenariosScreen.tsx` (wrapper), and the Planning route file.

## Dependencies

Shell PR 1 (router, registry, `shell/mira/MiraComingSoonDialog.tsx`) for Task 9; Home frontend plan T1 (token file) for Task 3 onward; backend plan Task 1 for the real response fields (frontend tasks use fixtures and can start without it). Delivery order is shell PR 1, Home T1, then Planning (L42).

---

### Task 1: Types and API

**Files:**
- Modify: `frontend/src/features/scenarios/types.ts`, `frontend/src/features/scenarios/api.ts`
- Test: `frontend/src/features/scenarios/api.test.ts`

**Interfaces:**
- Produces (all additive and optional so existing fixtures and mobile compile): `ScenarioSummary.description?: string`; `ScenarioMemberFund.is_proxied?: boolean`, `.proxy_basis?: string | null`, `.is_frozen?: boolean`; `ScenarioResult.by_asset_class?: ScenarioAssetClass[]`, `.funds_data_available?: boolean`; `interface ScenarioAssetClass { bucket: string; rupee_impact: string; covered_value: string; pct: string | null }`; `getScenarioResult(scenarioId: string, signal?: AbortSignal, memberId?: string): Promise<ScenarioResult>`.

- [ ] **Step 1: Write the failing tests** in `api.test.ts`: `getScenarioResult("abc", undefined, "m1")` requests `/scenarios/abc/results?member_id=m1`; without `memberId` the URL is unchanged `/scenarios/abc/results`; the id and member id are URL-encoded.
- [ ] **Step 2: Run to verify they fail.** Run: `cd frontend && npx vitest run src/features/scenarios/api.test.ts`. Expected: FAIL on the member case.
- [ ] **Step 3: Implement** the types and the third parameter (append `?member_id=` only when given).
- [ ] **Step 4: Run; expected PASS.** Then run `npx tsc --noEmit -p .` once to confirm mobile and existing code still type-check.
- [ ] **Step 5: Checkpoint.**

### Task 2: Copy, formatting and history utilities

**Files:**
- Create: `planning/planningCopy.ts`, `planning/scenarioFormat.ts`, `planning/planningHistory.ts` and their tests.

**Interfaces:**
- Produces:
  - `planningCopy.ts` exports string constants with the approved text: `TITLE = "Planning"`, `SUBTITLE = "Explore different financial scenarios to plan better and make more informed decisions."`, `PLAN_FUTURE_LINE = "Set goals, adjust assumptions and see how your wealth can grow over time."`, `EXPLORE_LINE = "See how your portfolio might perform in historical and hypothetical market events."`, `COMING_SOON_LINE = "Goal planning is on its way: retirement, your child's education, a home purchase and wealth goals."`, `NIFTY_CAVEAT = "Compared with an equity index. Debt and gold funds in your portfolio do not move like it."`, `PRE_2006_NOTE = "Fund prices were not reported before 2006, so only the index is shown for this event."`, `NO_HOLDINGS_LINE = "Import a statement to see how your funds would have done."`, and `outperformText(gap: string): string` returning `Outperformed by 13.1 percentage points` for a positive gap and `Behind by 2.0 percentage points` for a negative one (gap is the signed 2 dp string from `outperformedBy`, shown to 1 dp).
  - `scenarioFormat.ts`: `signedPct(value: string, digits?: number): string` (real minus sign `−`, `+` for positive, default 1 dp); `outperformedBy(portfolioPct: string | null, benchmarkPct: string | null): string | null` (signed 2 dp string via integer cents, null if either is null); `barScale(values: string[]): { zero: number; widths: number[]; sides: ("left" | "right")[] }` (zero is the zero line position in percent of the track; all-negative puts it at 100, all-positive at 0; an all-zero chart returns widths of 0).
  - `planningHistory.ts`: `type PlanningHistoryState = { planning: "landing" | "future" | "market"; scenarioId: string | null }`; `pushPlanningState(state: PlanningHistoryState): void` (pushes, keeping other keys of `window.history.state` such as `unifolioTab`); `readPlanningState(): PlanningHistoryState | null` (null when absent or malformed).

- [ ] **Step 1: Write the failing tests:** `outperformedBy("-17.09","-30.20") === "13.11"`; `outperformedBy("-30.20","-17.09") === "-13.11"`; `outperformedBy("0.10","0.20") === "-0.10"` (no float drift); `outperformedBy(null,"1") === null`; `signedPct("-1.2") === "−1.2%"`, `signedPct("0") === "0.0%"`, `signedPct("12.34", 2) === "+12.34%"`; `barScale(["-10","5"])` has `zero` about 66.67 and sides `["left","right"]`; `barScale(["0","0"]).widths` all 0; `outperformText("13.11") === "Outperformed by 13.1 percentage points"`, `outperformText("-2.00") === "Behind by 2.0 percentage points"`; history: push then read round-trips, other keys survive, garbage state reads null.
- [ ] **Step 2: Run to verify they fail.** Run: `cd frontend && npx vitest run src/features/scenarios/planning/scenarioFormat.test.ts src/features/scenarios/planning/planningHistory.test.ts`. Expected: FAIL (missing modules).
- [ ] **Step 3: Implement** the three files per the signatures; use BigInt or integer cents for `outperformedBy`, reuse `formatDecimal` from `lib/decimal` where it fits.
- [ ] **Step 4: Run; expected PASS.**
- [ ] **Step 5: Checkpoint.**

### Task 3: Bar charts

**Files:**
- Create: `planning/DivergingBars.tsx`, `planning/BenchmarkChart.tsx`, `planning/AssetClassChart.tsx` and tests.

**Interfaces:**
- Consumes: `barScale`, `signedPct` (Task 2), `rupees`, `benchmarkLabel` (from `../ResultParts`), `ScenarioAssetClass`, `ScenarioBenchmark`.
- Produces: `DivergingBars({ rows, ariaLabel }: { rows: BarRow[]; ariaLabel: string })` with `interface BarRow { label: string; value: string; text: string; tone: "gain" | "loss" | "index" }`; `BenchmarkChart({ portfolioPct, benchmarks }: { portfolioPct: string | null; benchmarks: ScenarioBenchmark[] })` (returns `null` when `benchmarks` is empty; the portfolio bar first, tone by sign; index bars tone `index` using the Home benchmark colour token, L43); `AssetClassChart({ rows, coveredValue, totalValue }: { rows: ScenarioAssetClass[]; coveredValue: string | null; totalValue: string | null })` (rupee bars with the percent printed beside each, caption `Covers ₹X of ₹Y`, returns `null` when `rows` is empty).
- Each row is focusable (`tabIndex={0}`) with an accessible name such as "Equity, −₹11,61,000, −27.0%"; no tooltip.

- [ ] **Step 1: Write the failing tests:** `DivergingBars.test.tsx`: negative bar sits left of the zero line and positive right (assert inline style sides), widths proportional to the largest absolute value, every row has an accessible name containing its text, an all-zero chart renders a "No change to show" line and no bars; `BenchmarkChart.test.tsx`: renders nothing for `benchmarks: []`, portfolio bar first, five index rows labelled with `benchmarkLabel`; `AssetClassChart.test.tsx`: rows keep the given order, caption shows covered and total in Indian grouping, nothing renders for `[]`.
- [ ] **Step 2: Run to verify they fail.** Run: `cd frontend && npx vitest run src/features/scenarios/planning/DivergingBars.test.tsx src/features/scenarios/planning/BenchmarkChart.test.tsx src/features/scenarios/planning/AssetClassChart.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** with plain elements and Tailwind classes using the `--ui-*` token variables; bar geometry from `barScale`.
- [ ] **Step 4: Run; expected PASS.**
- [ ] **Step 5: Checkpoint.**

### Task 4: Tiles, member select, Mira card

**Files:**
- Create: `planning/StatTile.tsx`, `planning/tiles.ts`, `planning/MemberSelect.tsx`, `planning/MiraInsightsCard.tsx` and tests.

**Interfaces:**
- Produces: `StatTile({ caption, value, line, tone }: { caption: string; value: string; line?: ReactNode; tone?: "gain" | "loss" | "neutral" })`; `buildTiles(result: ScenarioResult): TileSpec[]` with `TileSpec { key: "return" | "rupees" | "benchmark" | "coverage"; caption: string; value: string; line?: string; tone: "gain" | "loss" | "neutral" }`: return tile from `portfolio_impact_pct` (omitted when null), rupee tile from `rupee_impact` via `rupees`, benchmark tile from the `nifty_50` entry of `benchmarks` with `outperformText(outperformedBy(...))` and `NIFTY_CAVEAT` (omitted when there is no `nifty_50` entry; when `portfolio_impact_pct` is null the tile still shows the index return but no gap line and no caveat, which is the pre-2006 case), coverage tile `Based on ₹X` with line `of your ₹Y`, plus `n fund(s) have no data for this period` when `no_data_funds > 0`; `MemberSelect({ members, value, onChange }: { members: { id: string; name: string }[]; value: "family" | string; onChange: (value: string) => void })` with the first option "Family combined"; `MiraInsightsCard({ onLearnMore }: { onLearnMore: () => void })` (title "Insights from Mira", line "Coming soon.", button "Learn more").

- [ ] **Step 1: Write the failing tests:** `tiles.test.ts`: standard result gives four tiles in order; a result with `benchmarks: []` gives no benchmark tile; `portfolio_impact_pct: null` with a `nifty_50` benchmark gives no return tile and a benchmark tile with the index return only (no gap line), and no tile text contains "null" or "NaN"; positive and negative gap texts; coverage line singular "1 fund has" and plural; `MemberSelect.test.tsx`: lists "Family combined" first then members, calls `onChange` with the member id; `MiraInsightsCard.test.tsx`: clicking Learn more calls `onLearnMore`.
- [ ] **Step 2: Run to verify they fail.** Run: `cd frontend && npx vitest run src/features/scenarios/planning/tiles.test.ts src/features/scenarios/planning/MemberSelect.test.tsx src/features/scenarios/planning/MiraInsightsCard.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the four files; `MemberSelect` wraps the app's `ui/select` or a native `select` with the same styling the app already uses for selects (read `ui/select.tsx` first).
- [ ] **Step 4: Run; expected PASS.**
- [ ] **Step 5: Checkpoint.**

### Task 5: Member rows with Estimate and Frozen labels

**Files:**
- Create: `planning/MemberRows.tsx`, `planning/proxyLabel.ts` and tests.

**Interfaces:**
- Produces: `proxyLabel(basis: string | null): string` (returns `"Category average estimate"` when `basis` starts with `sebi_category_average:`, otherwise `"Asset-class average estimate"`, matching the existing `FundRow`); `MemberRows({ result, selectedMemberId }: { result: ScenarioResult; selectedMemberId: "family" | string })`: in family mode a "By family member" card with expandable rows (first row "Biggest contributor" as today), in single-member mode a "Funds for <name>" card with funds open (L37); fund row shows name, `rupees(rupee_impact)`, an `Estimate` chip (title = `proxyLabel(proxy_basis)`) when `is_proxied`, and `Redemptions frozen` text instead of the amount when `is_frozen`.

- [ ] **Step 1: Write the failing tests:** chip with tooltip text for a proxied fund, Frozen text for a frozen fund, neither for a real-data fund, the same fund under two members shows the same label in both, single-member mode shows the heading "Funds for Asha" with funds visible without a click, a member with `funds: []` shows "No holdings for this member."
- [ ] **Step 2: Run to verify they fail.** Run: `cd frontend && npx vitest run src/features/scenarios/planning/MemberRows.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** Model the expand control on `Members` in `ResultParts.tsx` (same `aria-expanded` pattern); do not import or edit it.
- [ ] **Step 4: Run; expected PASS.**
- [ ] **Step 5: Checkpoint.**

### Task 6: Scenario card and list

**Files:**
- Create: `planning/ScenarioCard.tsx`, `planning/ScenarioList.tsx` and tests.

**Interfaces:**
- Consumes: `ScenarioSummary`, `formatDateRange` (`@/lib/dateRange`), `signedPct`.
- Produces: `ScenarioCard({ scenario, selected, onSelect }: { scenario: ScenarioSummary; selected: boolean; onSelect: (id: string) => void })` showing type icon (CRASH `TrendingDown`, BULL_RUN `TrendingUp`, POLICY_RATE `Percent`, HYPOTHETICAL `Sparkles`), name (two lines, truncated), dates, description line (two lines, full text in `title`), the stat `Nifty 50: x%` from `quick_market_pct` in the gain or loss text token (none for hypothetical, freeze, multi-phase), badges (Freeze with `Snowflake`, an ongoing dot, Assumption-based), a chevron, and a green outline when `selected`; `ScenarioList({ curated, all, selectedId, onSelect }: { curated: ScenarioSummary[]; all: ScenarioSummary[]; selectedId: string | null; onSelect: (id: string) => void })` with curated cards, a `More scenarios` / `Hide` toggle (`aria-expanded`), and the pills All, Crashes, Bull Runs, Policy / Rate (Hypothetical only when such scenarios exist) filtering the remaining cards; layout classes give 5, 3 or 2 columns per the layout document.

- [ ] **Step 1: Write the failing tests:** card shows description, dates, stat coloured by sign (class or token assertion), no stat for a freeze scenario, Freeze and ongoing badges, selected outline, long name truncates (class `line-clamp-2`); list shows curated first, More reveals pills and the remaining cards, pill filters only the remaining, Hypothetical pill absent when no such scenario, clicking a card calls `onSelect` with its id, a selected card hidden by a pill change stays selected in state (the list does not call `onSelect(null)`; L38).
- [ ] **Step 2: Run to verify they fail.** Run: `cd frontend && npx vitest run src/features/scenarios/planning/ScenarioCard.test.tsx src/features/scenarios/planning/ScenarioList.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** Copy the picker's grouping logic (`curatedIds` set, `remaining`, category list) into `ScenarioList`; do not import from `ScenarioPicker.tsx`.
- [ ] **Step 4: Run; expected PASS.**
- [ ] **Step 5: Checkpoint.**

### Task 7: Scenario detail

**Files:**
- Create: `planning/ScenarioDetail.tsx` and test.

**Interfaces:**
- Consumes: Tasks 3 to 5 components, `buildTiles`, `resolveResultShape` (`../resolveResultShape`), `Compliance`, `NO_DATA`, `rupees` (`../ResultParts`), `NO_HOLDINGS_LINE`, `PRE_2006_NOTE`.
- Produces: `ScenarioDetail(props: { result: ScenarioResult; members: { id: string; name: string }[]; selectedMemberId: "family" | string; onMemberChange: (id: string) => void; refreshing: boolean; onImport: () => void; onLearnMore: () => void })`. Heading row (name, dates via `formatDateRange`, description, `MemberSelect`), `Compliance` line directly under it (L30), then by shape (L23, L24, L41): standard: tiles, `BenchmarkChart` and `AssetClassChart` and `MiraInsightsCard`, `MemberRows`; multi-phase: tiles without the benchmark tile, phase cards (reuse the markup of `MultiPhaseResultView` for the three cards; do not import the view), `AssetClassChart` and Mira, `MemberRows`; redemption freeze: the existing freeze banner text (`This wasn't a price fall — a ~20-month liquidity freeze`, `Frozen, not %`) or `None of your funds were frozen in this event`, then `MemberRows`; pre-2006 (`funds_data_available === false`): only the benchmark tile and `BenchmarkChart` without a portfolio bar, `PRE_2006_NOTE`, Mira; no holdings (`total_value` null or `"0.00"` and `by_member` funds all empty): `NO_HOLDINGS_LINE` and an "Import a statement" button calling `onImport`, no tiles or charts; hypothetical: not rendered (the list never offers it while the flag is off). When `refreshing` is true the tiles and charts get `opacity-60` and keep their content (no layout jump).

- [ ] **Step 1: Write the failing tests** using fixtures from `../testFixtures` extended with the new fields: standard shows four tiles, both charts, the Mira card and member rows; multi-phase has no benchmark tile and no benchmark chart; freeze shows the banner and no tiles; `funds_data_available: false` shows the note and the benchmark chart without a portfolio row; no-holdings shows the line and the Import button and clicking it calls `onImport`; `refreshing` dims; a one-member household still renders the dropdown; a 200-character scenario name does not overflow (class `break-words` or `line-clamp`).
- [ ] **Step 2: Run to verify they fail.** Run: `cd frontend && npx vitest run src/features/scenarios/planning/ScenarioDetail.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the composition; shapes via `resolveResultShape`, pre-2006 and no-holdings as conditions checked first.
- [ ] **Step 4: Run; expected PASS.**
- [ ] **Step 5: Checkpoint.**

### Task 8: The planning flow and the screen variant

**Files:**
- Create: `planning/PlanningScenarios.tsx` and test.
- Modify: `frontend/src/features/scenarios/ScenariosScreen.tsx`, `frontend/src/features/scenarios/ScenariosScreen.test.tsx`

**Interfaces:**
- Consumes: `listScenarios`, `getScenarioResult` (with `memberId`), `ScenarioList`, `ScenarioDetail`.
- Produces: `interface PlanningBinding { selectedId: string | null; onSelect: (id: string | null) => void; onImport: () => void; onLearnMore: () => void }`; `PlanningScenarios(props: PlanningBinding)`; `ScenariosScreen(props?: { variant?: "classic" | "planning"; planning?: PlanningBinding })`.
- `PlanningScenarios` behaviour: fetches curated and full lists on mount (abort on unmount; error card "Scenarios aren't available right now." with Try again, as the classic screen); when `selectedId` is set fetches the family result, derives `members` once from `by_member` entries whose `funds` is non-empty, keeps them while the member changes, refetches with `memberId` on change (previous result stays while loading: `refreshing`), keeps the chosen member across `selectedId` changes (a ref), shows skeletons for the first load, and scrolls the detail heading into view with `behavior: "smooth"` unless `window.matchMedia("(prefers-reduced-motion: reduce)").matches`. A failed member fetch reverts the dropdown to the previous member and shows the error in the detail.
- `ScenariosScreen.tsx`: rename the current function to `ClassicScenariosScreen` (body unchanged) and export `ScenariosScreen` that returns `<PlanningScenarios {...planning} />` when `variant === "planning" && planning`, otherwise `<ClassicScenariosScreen />`. No other line of the classic body changes.

- [ ] **Step 1: Write the failing tests:** `ScenariosScreen.test.tsx` gains `it("renders the classic screen when no variant is given")` (the existing tests already prove behaviour) and `it("renders the planning flow for variant planning")` (mock `./planning/PlanningScenarios` and assert it receives the binding); `PlanningScenarios.test.tsx`: loads both lists; selecting calls `onSelect` and fetching the result with `memberId` undefined; choosing a member refetches with that id and keeps the old numbers while loading; the member stays chosen when `selectedId` changes; a failed member fetch reverts the dropdown; smooth scroll is called, and not under reduced motion (mock `matchMedia` and `Element.prototype.scrollIntoView`); list error shows Try again.
- [ ] **Step 2: Run to verify they fail.** Run: `cd frontend && npx vitest run src/features/scenarios/planning/PlanningScenarios.test.tsx src/features/scenarios/ScenariosScreen.test.tsx`. Expected: FAIL on the new cases only.
- [ ] **Step 3: Implement** both files as above.
- [ ] **Step 4: Run both files, then `npx vitest run src/features/scenarios src/mobile/MobileRoot.test.tsx src/features/dashboard/MainDashboardFlow.test.tsx`; expected all PASS with no existing test edited.**
- [ ] **Step 5: Checkpoint.**

### Task 9: Planning page, history and route

**Files:**
- Create: `planning/PlanningPage.tsx` and test.
- Modify: the Planning route file under `frontend/src/shell/routes/` (named per the shell PR 1 plan, for example `planning.route.tsx`; confirm its name and that the registry row `planning` is `live` with no `planning-scenarios` row, as contract v1.5 says, updating the registry only if shell PR 1 or 2 did not already).

**Interfaces:**
- Consumes: `PlanningBinding`, `ScenariosScreen`, `pushPlanningState`, `readPlanningState`, `planningCopy`, the shell's Mira dialog (props as defined in shell PR 1 plan T5).
- Produces: `PlanningPage()` with state `{ view: "landing" | "future" | "market"; scenarioId: string | null }`. Landing: `TITLE`, `SUBTITLE`, two cards (`Sprout` and `ChartColumn` icon tiles, titles "Plan your future" and "Explore market scenarios", lines `PLAN_FUTURE_LINE` and `EXPLORE_LINE`, decorative arrow). Choosing a card pushes a history entry and replaces the landing with the view and a "Back to Planning" link (`ChevronLeft`). Future view: heading, `PLAN_FUTURE_LINE`, a note "Coming soon" with `COMING_SOON_LINE`, no controls. Market view: heading "Explore market scenarios", the classic disclaimer subtitle, `<ScenariosScreen variant="planning" planning={...} />`. A `popstate` listener restores state from `readPlanningState()`; on mount the page `replaceState`s `{planning: "landing", scenarioId: null}` so a refresh returns to the landing. `onImport` navigates to the import route (use the shell's navigation helper; contract path `/import`); `onLearnMore` opens the shell Mira dialog.

- [ ] **Step 1: Write the failing tests:** landing shows both cards; Plan your future shows Coming soon and Back returns; Explore shows the market view; selecting a scenario pushes an entry; `popstate` steps detail then list then landing; mounting with a stale `history.state` of `{planning:"market"}` resets to the landing; the page does not render the old "Scenarios" heading from the classic screen; Mira Learn more opens the dialog (mock the shell dialog).
- [ ] **Step 2: Run to verify they fail.** Run: `cd frontend && npx vitest run src/features/scenarios/planning/PlanningPage.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** `PlanningPage` and mount it from the route file; run the shell's route-registry test if it asserts the Planning rows.
- [ ] **Step 4: Run the new test and the shell registry test it touches; expected PASS.**
- [ ] **Step 5: Checkpoint.**

### Task 10: Final verification

- [ ] **Step 1:** Run `cd frontend && npx vitest run src/features/scenarios src/mobile/MobileRoot.test.tsx src/features/dashboard/MainDashboardFlow.test.tsx`. Expected: all PASS, no existing test file edited except the additions in `api.test.ts` and `ScenariosScreen.test.tsx`.
- [ ] **Step 2:** `npx tsc --noEmit -p .` passes; `grep -rn "#[0-9A-Fa-f]\{6\}" src/features/scenarios/planning` returns nothing (no raw hex).
- [ ] **Step 3:** With the backend plan done and the dev servers running, open `/planning` in the browser pane and walk the flows in `-flows.md` (landing, Plan your future and Back, list, a standard scenario, a member change, a pre-2006 scenario, browser Back, dark mode). Report anything not seen.
- [ ] **Step 4:** Report to the owner: files changed, tests run, what was checked in the browser, what was not, and that nothing is committed.

## Self-Review

Spec coverage: landing and Back (T9, L13), Coming soon (T9, L2, L32), list structure and page-29 card (T6, L3, L8, L17, L18), detail below with scroll (T8, L14), history (T2, T9, L15), member dropdown and memory (T4, T8, L19), tiles (T4, L7, L22), two charts in rupees with percent beside, six groups, index colour (T3, L6, L20, L21, L28, L43), Mira card with button (T4, T7, L26), member rows with Estimate and Frozen and single-member heading (T5, L25, L35, L37), shapes and pre-2006 and no-holdings (T7, L23, L24, L41), disclaimer position (T7, L30), variant switch with classic untouched (T8, L36), wording (T2, L39), no tooltips (T3, L40), icons (Global Constraints, L44), delivery order (Dependencies, L42). Out of scope as decided: line chart, extra tiles, benchmark switch, date picker, tracking, mobile. Type names are used consistently (`PlanningBinding`, `ScenarioAssetClass`, `buildTiles`, `MemberRows`, `outperformedBy`).
