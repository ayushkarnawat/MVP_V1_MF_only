# Analytics UX Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans, applied through the Claude–Codex method in
> "Execution method" below. Steps use checkbox (`- [ ]`) syntax. **Execution started 2026-10-20 (user said go).**

**Goal:** Deliver the 12 analytics/scenario/history UX changes and 7 extra fixes agreed on the
"Analytics UX Changes" artifact (v18, all 22 questions answered), in six phases (P1–P6), all in this one document.

**Architecture:** Mostly frontend rendering changes plus small additions to existing analytics
payloads (extra fields, all with defaults so saved payloads still load). Two data migrations
(scenario phase dates, scenario-name unique index) and one new read-only endpoint pair (History
month detail). No new table, no new background job.

**Tech Stack:** FastAPI + SQLAlchemy + Alembic (backend); React/Vite/TypeScript, vitest (frontend);
the existing `@visx` charts, `lib/decimal.ts` money helpers, `--color-*` design tokens.

**Spec:** the artifact "Analytics UX Changes" v18 (https://claude.ai/artifact/5VLkggLgtYoifdS5RS1rgJ,
private, plus its `other-fixes.html` page). Codex cannot open it, so this plan carries every
decision verbatim in "Locked decisions". Pre-flight step P0.5 saves a copy into the repo.

## Phases (each ships working software on its own)

| Phase | Covers | Migration |
|---|---|---|
| P1 | Labels, copy, Direct/Regular bar, tier colours, score explainer, scenario dates, Franklin headline, AMC/Category sort order (items 6, 7, 10, 11; fixes 1, 2, 4, 6, 7) | none |
| P2 | US-Iran phase dates, duplicate scenarios, unique index (fixes 3, 5) | 0042 data, 0043 index |
| P3 | Item 1: negative bars, switches hybrid, opening holdings, fund-wise breakdown; item 2 (verify) | none |
| P4 | Items 4, 5, 8: 1Y/3Y/5Y tables, ranking basis labels, category averages | none |
| P5 | Items 3, 9: fund manager table, TER in rupees and fund-wise table | none |
| P6 | Item 12: History graph hover, click, month-detail pop-up | none |

**Order and dependencies.** P1, P2, P4, P5 are independent of each other. **P3 must land before P6**
(P6's "money moved" reuses P3's `direction_for`). Recommended order: P1 → P2 → P3 → P4 → P5 → P6,
cheapest and lowest-risk first. Each phase ends with its own verification gate and can be deployed alone.

## Global Constraints

- **Test-driven, always** (`AGENTS.md`): failing test first, then minimal code. No code step without
  its test step before it.
- **`Decimal`, never `float`, for money/units/NAV** on the backend. On the frontend money stays a
  decimal string and goes through `lib/decimal.ts` (`sumDecimalStrings`, `diffDecimalStrings`,
  `formatIndianCurrency`); `parseFloat` is allowed only for chart coordinates, never for displayed
  text.
- **Run only the affected tests**, never the full suites. Backend: `cd backend && python -m pytest
  <files> -q 2>&1 | tail -8`. Frontend: `cd frontend && npx vitest run <files> 2>&1 | tail -20`.
  Type check: `cd frontend && npx tsc -b 2>&1 | tail -8`. Add a file to the list if a change reaches
  code outside it.
- **New payload fields always have defaults** (backend `= default`; frontend treats a missing field as
  absent and falls back), so a saved `analytics_sections` payload from before the change still renders.
- **No new table and no migration** except `0042`/`0043` in P2. If any task seems to need one, stop
  and raise it (the user asks for table reuse to be justified first).
- **Use the existing design tokens** (`--color-*` in `frontend/src/styles/tokens.css`), no new
  dependency, no new chart library. Tier colours are the one exception, added as `--tier-*` tokens (P1-T5).
- **Dates:** exact form `20 January 2020 – 31 March 2020`; open end `28 February 2026 – ongoing`;
  month-only form `March 2020` only when an exact date is unavailable. Read day/month/year from the
  ISO text, never through a `Date` object (no time-zone shift).
- **Money display:** Indian grouping (`₹2,98,32,774`); negatives lead with the sign: `-₹2,40,000`.
- **Never push.** Never commit unrelated working-tree changes: stage explicit paths only (the tree
  holds unrelated deletions and untracked files today).
- **Synthetic CAS only** for value checks (password `MF@123`, `Docs/CAS Files/synthetic/pdfs/`); never
  real statements.
- Migrations: next free revision at execution time (head today is `0041`; confirm with
  `cd backend && alembic heads` before naming).

## Locked decisions (from the artifact; all 22 questions answered)

| Q | Decision |
|---|---|
| 1 | Switches shown as their own pair; toggle "Include switches" adds switched-in to Invested and switched-out to Withdrawn; Net invested and Gain unchanged; line "Switched between funds ₹X in N switches" always shown; mergers/face-value conversions excluded; fund-wise breakdown with switched in/out columns |
| 2 | Fund manager table: manager, AMC, current value, % of overall portfolio. No overlap shown, so each fund's value is divided equally among its managers; one-line footnote says so |
| 3, 4 | Category comparison table 1Y/3Y/5Y (trailing), AUM-weighted category average per period; blended 3Y/5Y stays the rank basis, named as such |
| 5 | Fund ranking: returns per horizon beside one labelled composite rank; no per-horizon ranks |
| 6, 7 | TER yearly cost in rupees, projected "Next 1 / 3 / 5 years" at today's value and TER (value × TER × years); totals row for funds with a TER; funds without TER shown with dashes and left out of totals |
| 8 | Dates: exact on every scenario screen (picker card, opened-screen header, phase cards); month only as fallback |
| 9, 10 | AMC allocation opens smallest first, ordered by share of portfolio, toggle to largest first; applies to AMC tab, Category tab, and main dashboard donut (desktop and mobile); asset-class view keeps its fixed order |
| 11 | Opening holdings leave the bars; shown as a figure above the chart; Invested tile still includes them |
| 12 | Franklin screen with no frozen fund: neutral headline "None of your funds were frozen in this event", funds listed; no portfolio impact figure |
| 13 | Tier badge ramp: T1 `#22C55E`, T2 `#85DFA6`, T3 `#94A3B8`, T4 `#F59E0B`, T5 `#EF4444`, dark text; dark-mode variants in P1-T5 |
| 14 | Keep Category Ranking and Fund Ranking ranks; name the basis on each |
| 15 | No migration; nothing new stored in `scheme_rankings` |
| 16 | Correct the two US-Iran phase end dates in the data (Shock ends 2026-04-01, Partial recovery ends 2026-07-07) |
| 17 | Unique index on top-level scenario names, after the duplicate clean-up |
| 18 | History per-fund details computed on click, no new table (click time to be measured first, gate P6-T1) |
| 19 | History pop-up splits the month's change into new money and market movement |
| 20 | History keeps month-ends only; subtitle names the last date |
| 21 | Phone: first tap selects and shows a card; "See details" or second tap opens the sheet |
| 22 | Family view: one merged fund list with member filter buttons |

Also decided in the artifact (no question number): benchmark labels "Total Return" (the maths uses TRI);
scenario benchmark list gets a readable label for `nifty_largemidcap_250` plus a readable fallback; ranking
line reads "Trailing the category average by 2.97%" with a falling arrow; "S20" removed from user-visible
text; the shaded History area is renamed "Cost of holdings"; a partial month's cost excludes the unpriced fund.

## Review Focus (inputs the spec implies but no single task would otherwise test)

1. **A fund with one, two, five or zero managers** in the manager split: shares must add back to the
   fund's value to the paisa; zero managers means the fund is "not available", never ₹0 under a manager. (P5-T1)
2. **Saved payloads from before the change** (new fields absent): every changed section must render, not
   crash or show `NaN`/`undefined`. (every frontend task; explicit test in P3-T3, P4-T4, P5-T4, P6-T4)
3. **Accounts at the edges:** one month of history, a month with no holdings, a partial month, a portfolio
   with no TER at all, a Direct-only portfolio, an account with only switches. (P3, P5, P6)
4. **Month and date boundaries:** 31 March vs 1 April, leap day, a switch posting in the next month, a
   month-end that is not a trading day. (P1-T7, P3-T1, P6-T1)
5. **Money display of negatives and rounding:** `-₹…` everywhere, half-up to the rupee on screen, the
   breakdown totals equal the section tiles. (P1-T3, P3-T4, P6-T4)

## Execution method (the Claude–Codex method, `model-orchestration` skill)

**Roles.** Claude is the orchestrator: writes handoff docs, verifies, runs the review gate, performs all
git staging and commits. Codex is the default implementer (dispatched via `codex:codex-rescue`,
`run_in_background: true`), self-tests where it can, and never touches git (the sandbox cannot write
`.git`). Sonnet subagents are the reviewer/implementer fallback.

**Runs, not tasks, are the dispatch unit.** Tasks that share files or interfaces are batched into one
run (one handoff, one implementation, one review), per the user's token-budget rule. Fourteen runs:

| Run | Tasks | Model notes |
|---|---|---|
| R1 | P1-T1…T4 (labels, copy, Direct/Regular bar) | frontend, small |
| R2 | P1-T5, P1-T6 (tier colours; score explainer after the doc check) | T6 gated on a Claude-led check |
| R3 | P1-T7…T9 (dates, Franklin, sort order) | frontend |
| R4 | P2-T1, P2-T2 | **Opus review** (migrations) |
| R5 | P3-T1, P3-T2, P3-T6 (backend classification and schema, frontend logic, XIRR proof) | **Opus review** (money classification) |
| R6 | P3-T3…T5 (chart, section UI, harness check) | |
| R7 | P4-T1, P4-T2 (backend periods) | |
| R8 | P4-T3…T5 (frontend tables, labels) | |
| R9 | P5-T1, P5-T2 (manager split, table) | |
| R10 | P5-T3, P5-T4 (TER) | |
| R11 | P6-T1, P6-T2 (snapshot refactor, endpoints) | **Opus review** (shared calculation) |
| R12 | P6-T3…T6 (frontend) | |
| R13 | Final: docs updates (F1) | Claude |
| R14 | Final: whole-branch review and synthetic gate (F2) | **Opus review, with approval** |

**Per-run procedure** (every run, no exceptions):
1. Claude pre-flight: read the files in the run's tasks, confirm line numbers (they drift), write
   `Docs/orchestration/ux-fixes-r<N>-<slug>-handoff.md` from `handoff-doc-template.md` (Status OPEN),
   append one line to `Docs/orchestration/delegation-log.md`.
2. **First dispatch of the session only:** run the three-step probe from `delegation-rules.md` (write a
   file, `git add`, `git commit` at the dispatch location) before any large copy. Expect git to fail in the
   sandbox; if source writes also fail, use the native-filesystem clone procedure recorded there.
3. Dispatch Codex (`run_in_background: true`, `description` set). Wait for the task notification; never poll.
4. Claude verifies independently: `git status`, `git diff --stat`, then the run's affected tests (touched-area
   only on intermediate rounds; the run's full affected list on the round expected to close).
5. **Mandatory review gate:** dispatch `/codex:adversarial-review` against the run's scope via
   `codex:codex-rescue` (never with `isolation: worktree`). **Tell the user up front that the result needs a
   manual relay** (`/codex:status <id>` then `/codex:result <id>`, which only the user can type). Fix findings
   per "Review-loop fix authorship"; Opus review only where marked and only with approval.
6. Commit (orchestrator, explicit paths, after D1 is answered). Update the handoff Status to DONE and the
   delegation log. Never push.

**If Codex quota is exhausted** (it was for SP2 Run 12): Claude builds the run directly, reviewed by a Sonnet
subagent, and the log line says so.

**Synthetic gate per phase.** After a phase's review, run the synthetic harness for the files named in that
phase and record the result in the handoff (pattern: `Docs/CAS Files/synthetic/harness/sp2_checks.py`).
Final gate F2 runs the standard `rundeep.sh` set with `ANALYTICS=1`.

## P0: Pre-flight (Claude, before R1, after "go")

- [ ] **P0.1** `git status` and `git branch --show-current`; create the work branch per D2; confirm the unrelated working-tree changes are left alone (stage explicit paths only).
- [ ] **P0.2** `cd backend && alembic heads`; confirm the head is `0041_stock_master_and_index_valuation`. If it moved, renumber `0042`/`0043` in P2 and their `down_revision`.
- [ ] **P0.3** Codex readiness: the three-step probe from `model-orchestration/references/delegation-rules.md` (write a file, `git add`, `git commit` at the dispatch location). If `/mnt/*` writes fail, use the native-filesystem clone procedure recorded there.
- [ ] **P0.4** Confirm the working tree builds: `cd frontend && npx tsc -b 2>&1 | tail -8` (record any pre-existing errors so they are not blamed on this work).
- [ ] **P0.5** Save a copy of the artifact (v18) and `other-fixes.html` to `Docs/orchestration/analytics-ux-changes-spec/` so Codex can read the spec. Stage it with the first commit (D1).
- [ ] **P0.6** Read `Docs/orchestration/delegation-log.md` tail and the handoff template; no code step.


## Phase P1: Quick Fixes


**Goal:** Fix labels, copy and presentation problems that need no backend change: benchmark labels,
scenario benchmark names, three copy errors, the empty Direct/Regular bar, tier badge colours, the
score explainer, scenario dates, the Franklin headline, and the allocation sort order.

**Architecture:** Frontend-only edits to existing components, plus three small new units
(`lib/dateRange.ts`, `lib/allocationSort.ts`, `tierStyle.ts`). No payload or schema change.

**Tech Stack:** React/TypeScript, vitest, existing `--color-*` tokens.

**Spec:** artifact v18 items 6, 7, 10, 11 and other-fixes 1, 2, 4, 6, 7; decisions Q8, Q9, Q10, Q12, Q13.

**Test command (all tasks):** `cd frontend && npx vitest run <files> 2>&1 | tail -20`. Mobile and print
views reuse these components, so no mobile/print file changes are needed; each task lists the shared
screens to eyeball.

---

### Task P1-T1: Benchmark labels say "Total Return" (run R1)

**Files:**
- Modify: `frontend/src/features/analytics/BenchmarkSection.tsx:27-30` (four labels)
- Test: `frontend/src/features/analytics/BenchmarkSection.test.tsx:53-56` (same four strings)

**Interfaces:** Produces: none. Consumes: none.

- [ ] **Step 1: Failing test.** In the existing test, change the four expected strings to
  `"Nifty 50 (Total Return)"`, `"Nifty 500 (Total Return)"`, `"Nifty LargeMidcap 250 (Total Return)"`,
  `"Nifty Midcap 150 (Total Return)"`.
- [ ] **Step 2: Run** `npx vitest run src/features/analytics/BenchmarkSection.test.tsx` — expect FAIL on the old labels.
- [ ] **Step 3: Implement.** Replace "Price Return" with "Total Return" in the four label strings. Do not touch the maths.
- [ ] **Step 4: Run** the same file — expect PASS. Also `npx vitest run src/features/analytics/AnalyticsView.test.tsx` (it renders this section).
- [ ] **Step 5: Commit** (D1) `git add` the two files; `fix: benchmark labels say Total Return, matching the TRI maths`.

### Task P1-T2: Scenario benchmark names never show a raw key (run R1)

**Files:**
- Modify: `frontend/src/features/scenarios/ResultParts.tsx:76-82` (the label map in `Benchmarks`)
- Test: `frontend/src/features/scenarios/ResultParts.test.ts`, `StandardResultView.test.tsx`

**Interfaces:**
- Produces: `export function benchmarkLabel(name: string): string` in `ResultParts.tsx`.
- Rule: known keys map to `nifty_50 → "Nifty 50"`, `nifty_500 → "Nifty 500"`, `nifty_largemidcap_250 → "Nifty LargeMidcap 250"`,
  `nifty_midcap_150 → "Nifty Midcap 150"`, `nifty_smallcap_250 → "Nifty Smallcap 250"`. A name that contains `_` and is
  unknown becomes its words capitalised (`nifty_next_50 → "Nifty Next 50"`). A name without `_` (for example
  `"Your portfolio"`) is returned unchanged.

- [ ] **Step 1: Failing tests** in `ResultParts.test.ts`: `expect(benchmarkLabel("nifty_largemidcap_250")).toBe("Nifty LargeMidcap 250")`;
  `expect(benchmarkLabel("nifty_next_50")).toBe("Nifty Next 50")`; `expect(benchmarkLabel("Your portfolio")).toBe("Your portfolio")`.
  In `StandardResultView.test.tsx` add a benchmark row named `nifty_largemidcap_250` to the fixture and assert
  `getByText("Nifty LargeMidcap 250")` and `queryByText("nifty_largemidcap_250")` is null.
- [ ] **Step 2: Run** both files — expect FAIL (`benchmarkLabel` not exported).
- [ ] **Step 3: Implement** `benchmarkLabel` and call it where `labels[row.name] ?? row.name` is today.
- [ ] **Step 4: Run** the two files plus `ScenariosScreen.test.tsx` — expect PASS.
- [ ] **Step 5: Commit** `fix: readable scenario benchmark names, no raw index keys`.

### Task P1-T3: Three copy fixes (run R1)

**Files:**
- Modify: `frontend/src/features/analytics/CategoryRankingSection.tsx:5,206-221`; `frontend/src/features/scenarios/ResultParts.tsx:9-17` (`rupees`);
  `frontend/src/features/analytics/ScorerSection.tsx:187`; `frontend/src/features/analytics/FundScoreDetailModal.tsx:73`
- Test: `CategoryRankingSection.test.tsx`; `ResultParts.test.ts`; `MultiPhaseResultView.test.tsx:9`; `AnalyticsView.test.tsx:280`;
  `ScorerSection.test.tsx`; `FundScoreDetailModal.test.tsx`

**Interfaces:** `rupees(value: string | null): string` keeps its signature; only its negative output changes.

- [ ] **Step 1: Failing tests.**
  - `CategoryRankingSection.test.tsx`, new test `"writes a shortfall without a second minus and with a falling arrow"`: a fund with return below the
    category average; `expect(screen.getByText(/Trailing the category average by/)).toBeInTheDocument()`; `expect(screen.queryByText("-2.97%")).toBeNull()`;
    `expect(container.querySelector(".lucide-trending-down")).not.toBeNull()`; the outperforming case still shows `lucide-trending-up`.
  - `ResultParts.test.ts`: `expect(rupees("-8327040.00")).toBe("-₹83,27,040")`; `expect(rupees("240000")).toBe("₹2,40,000")`; zero stays `"₹0"` (no sign).
  - Update `MultiPhaseResultView.test.tsx:9` to expect `"-₹2,40,000"`. Run `grep -rn "₹-" frontend/src --include=*.test.*` and update every hit.
  - Update `AnalyticsView.test.tsx:280`, `ScorerSection.test.tsx`, `FundScoreDetailModal.test.tsx` to expect `"Unifolio Fund Score"` and `"Tap for score breakdown"` and no `"S20"` in visible text.
- [ ] **Step 2: Run** all six test files — expect FAIL.
- [ ] **Step 3: Implement.** Ranking line: text `Trailing the category average by <strong>{Math.abs(diff).toFixed(2)}%</strong>`; import `TrendingDown` and pick the icon by sign of `diff`.
  `rupees`: put the minus before the symbol. Remove "S20" from the two visible strings only (comments, component names and test `describe` labels may keep it).
- [ ] **Step 4: Run** the six files plus `StandardResultView.test.tsx` and `ScenariosScreen.test.tsx` — expect PASS.
- [ ] **Step 5: Commit** `fix: ranking shortfall wording and arrow, sign before rupee symbol, drop S20 from user text`.

### Task P1-T4: Direct vs Regular draws only the bars that have data (run R1)

**Files:**
- Modify: `frontend/src/features/analytics/TerSection.tsx:181-228` (visibility check at 182 and both bars)
- Test: `frontend/src/features/analytics/TerSection.test.tsx`

**Interfaces:**
- Produces: `function planBarState(summary: WeightedTerSummary | undefined): "bar" | "none-held" | "no-ter"` (module-private).
  `"bar"` when `weighted_ter` is non-null; `"none-held"` when `total_value` is zero or the summary is absent; otherwise `"no-ter"`.

- [ ] **Step 1: Failing tests** (names exact):
  - `"draws both bars when both plans have a TER"`: Direct `0.70`, Regular `1.47` → both `Direct Plans TER` and `Regular Plans TER` present.
  - `"draws only the Direct bar and says there are no Regular plans"`: Regular summary with `weighted_ter: null`, `total_value: "0.00"` →
    `queryByText("Regular Plans TER")` null and `getByText("No Regular plans in this portfolio, so there is nothing to compare against.")`.
  - `"says no TER is on record when the plan is held but has none"`: Regular `weighted_ter: null`, `total_value: "50000.00"` →
    `getByText("No TER on record for the Regular plans you hold.")`, no Regular bar.
  - `"hides the comparison block when neither plan has a TER"`: `queryByText("Direct vs. Regular Fee Comparison")` null.
  - Keep the two existing tests green.
- [ ] **Step 2: Run** `npx vitest run src/features/analytics/TerSection.test.tsx` — expect FAIL.
- [ ] **Step 3: Implement** `planBarState`; render the block when at least one side is `"bar"`; render each side's bar only for `"bar"`; show the matching one-line note for the other side. The percentage cards above are unchanged.
- [ ] **Step 4: Run** `TerSection.test.tsx` and `AnalyticsView.test.tsx` — expect PASS.
- [ ] **Step 5: Commit** `fix: Direct vs Regular comparison hides a plan with no data`.

### Task P1-T5: Tier badge colours, five-step ramp (run R2)

**Files:**
- Modify: `frontend/src/styles/tokens.css` (add `--tier-1-bg … --tier-5-fg` to all four blocks: `:root`, `prefers-color-scheme: dark`, `[data-theme="dark"]`, `[data-theme="light"]`);
  `ScorerSection.tsx:87-89,208-210`; `FundScoreCard.tsx:299`; `FundScoreDetailModal.tsx` (wherever "Tier N of 5" renders: `grep -n "Tier" FundScoreDetailModal.tsx`)
- Create: `frontend/src/features/analytics/tierStyle.ts`
- Test: `frontend/src/features/analytics/tierStyle.test.ts` (new); `FundScoreCard.test.tsx`; `ScorerSection.test.tsx`

**Interfaces:**
- Produces: `export function tierBadgeStyle(displayTier: number): { backgroundColor: string; color: string }` returning
  `var(--tier-N-bg)` / `var(--tier-N-fg)`; tiers below 1 or above 5 clamp to 1 and 5.
- Produces: `export function portfolioVerdict(score: number): { label: string; color: string }`:
  `score >= 70` → `"High Quality Portfolio"`, `var(--color-positive)`; `score >= 50` → `"Moderate Quality Portfolio"`, `var(--color-text-secondary)`;
  else `"Needs Review"`, `var(--color-warning)`. The three colours live in one exported const `PORTFOLIO_VERDICT_COLOURS` so decision D4 is a one-line change.
- Token values — light: T1 `#22C55E`, T2 `#85DFA6`, T3 `#94A3B8`, T4 `#F59E0B`, T5 `#EF4444`, all `fg: #111111`.
  Dark: T1 `#22C55E`/`#111111`, T2 `#1E783F`/`#F5F5F5`, T3 `#475569`/`#F5F5F5`, T4 `#F59E0B`/`#111111`, T5 `#F87171`/`#111111`.

- [ ] **Step 1: Failing tests.**
  - `tierStyle.test.ts`: five tiers return five distinct `backgroundColor` strings; `tierBadgeStyle(1).backgroundColor === "var(--tier-1-bg)"`; `tierBadgeStyle(0)` equals tier 1 and `tierBadgeStyle(9)` equals tier 5;
    `portfolioVerdict(70).label === "High Quality Portfolio"`, `portfolioVerdict(69.9)` is Moderate, `portfolioVerdict(50)` Moderate, `portfolioVerdict(49.9).label === "Needs Review"`.
  - `FundScoreCard.test.tsx` new test: a fund with display tier 5 → the badge element's `style` attribute contains `--tier-5-bg`; a tier 1 fund contains `--tier-1-bg`; the words `Tier 5 of 5` are still present.
  - `ScorerSection.test.tsx`: the portfolio label element's `style` contains the colour from `portfolioVerdict`.
- [ ] **Step 2: Run** the three files — expect FAIL.
- [ ] **Step 3: Implement** the tokens, the two functions, and apply `style={tierBadgeStyle(displayTier)}` to every element that renders "Tier N" (remove the fixed `bg-[var(--color-accent)] text-white` classes there). Label colour from `portfolioVerdict`.
- [ ] **Step 4: Run** the three files plus `FundScoreDetailModal.test.tsx` and `AnalyticsView.test.tsx`; `npx tsc -b`. Eyeball light and dark in the browser (`npm run dev`) for contrast.
- [ ] **Step 5: Commit** `feat: five-step tier badge colours with dark text`.

### Task P1-T6: Score explainer panel (run R2) — gated on a Claude-led check

**Files:**
- Create: `frontend/src/features/analytics/scoreExplainerCopy.ts` (verified text constants), `ScoreExplainer.tsx`, `ScoreExplainer.test.tsx`
- Modify: `ScorerSection.tsx` (header area: a "How is this calculated?" toggle that shows the panel)
- Create (Claude): `Docs/orchestration/<date>-score-explainer-check.md`

**Interfaces:** Produces `export function ScoreExplainer(): JSX.Element` (no props; collapsed by default, `printMode` of the section hides it).

- [ ] **Step 1 (Claude, not Codex): reconcile the doc and the code.** Read `Docs/Scorer-V2/Updated_and_Approved_Unifolio_Fund_Scoring_Methodology.md` and
  `backend/app/services/analytics/scorer.py` and `fund_ranking.py`. Record in the check doc: the three score weights (shown today as 45/30/25), the five tier bands, the verdict bands (70/50),
  how `risk_adjusted_tier` and `cost_adjustment` relate to those weights, and the composite rating's five weights (25/25/20/15/15). **If the doc and the code disagree, STOP and report to the user. Do not choose.**
- [ ] **Step 2: User approves the copy** (D7). The approved text becomes `scoreExplainerCopy.ts`.
- [ ] **Step 3: Failing tests** in `ScoreExplainer.test.tsx`: `"is closed until asked"` (panel text absent; button name "How is this calculated?" present);
  `"opens to show the three score weights"` (after click, text contains `45%`, `30%`, `25%`); `"explains the five tiers"` (contains `Tier 1` and `Top 20%`); `"explains the composite rating weights"` (contains `25%`, `20%`, `15%`);
  `"closes again"`. In `ScorerSection.test.tsx`: the toggle appears, and does not appear in `printMode`.
- [ ] **Step 4: Run** both files — expect FAIL.
- [ ] **Step 5: Implement** the component from the constants; a native `<button aria-expanded>` plus a region; no new dependency.
- [ ] **Step 6: Run** both files and `AnalyticsView.test.tsx` — expect PASS.
- [ ] **Step 7: Commit** `feat: how-is-this-calculated panel for the quality score`.

### Task P1-T7: Exact scenario dates on every scenario screen (run R3)

**Files:**
- Create: `frontend/src/lib/dateRange.ts`, `frontend/src/lib/dateRange.test.ts`
- Modify: `frontend/src/features/scenarios/ScenarioPicker.tsx:38`; `ScenariosScreen.tsx` (under the `<h2>` at line 67); `MultiPhaseResultView.tsx:6`
- Test: `ScenarioPicker.test.tsx`, `ScenariosScreen.test.tsx`, `MultiPhaseResultView.test.tsx`

**Interfaces:**
- Produces in `lib/dateRange.ts`:
  - `formatExactDate(iso: string | null | undefined): string | null` — `"2020-01-20"` → `"20 January 2020"`; `null` unless a real calendar date (month 1–12, day within the month, leap years honoured).
  - `formatMonthYear(iso: string | null | undefined): string | null` — accepts `YYYY-MM-DD` or `YYYY-MM`; `"2020-03"` → `"March 2020"`.
  - `formatDateRange(start: string | null | undefined, end: string | null | undefined, ongoing: boolean): string | null` —
    each side uses `formatExactDate(x) ?? formatMonthYear(x)`; both → `"a – b"`; same value on both sides → once; end absent and `ongoing` → `"a – ongoing"`;
    only one side usable → that side alone; none → `null`. Day, month and year are read from the text, never through `Date`.

- [ ] **Step 1: Failing tests in `dateRange.test.ts`:**
  `formatDateRange("2020-01-20","2020-03-31",false)` → `"20 January 2020 – 31 March 2020"`;
  `("2026-02-28",null,true)` → `"28 February 2026 – ongoing"`;
  `("2024-02-29","2024-02-29",false)` → `"29 February 2024"`;
  `("2020-03",null,false)` → `"March 2020"`;
  `("2020-13-40","2020-06-30",false)` → `"30 June 2020"` (unusable start dropped);
  `(null,null,false)` → `null`; `("2023-02-29",null,false)` → `"February 2023"` (invalid exact date falls back to month);
  `("2020-03-31","2020-04-01",false)` → `"31 March 2020 – 1 April 2020"`.
  Component tests: `ScenarioPicker.test.tsx` — card shows `"20 January 2020 – 31 March 2020"` and not the ISO text; `ScenariosScreen.test.tsx` — an opened scenario renders an element with `data-testid="scenario-dates"` for the standard, freeze and multi-phase shapes, and a hypothetical scenario with no dates renders none;
  `MultiPhaseResultView.test.tsx` — the Shock card reads `"28 February 2026 – 2 April 2026"`.
- [ ] **Step 2: Run** the four files — expect FAIL.
- [ ] **Step 3: Implement** the three functions (validation table of days per month; leap-year rule) and use `formatDateRange` in the three places; render the picker and header lines only when non-null.
- [ ] **Step 4: Run** the four files plus `resolveResultShape.test.ts` — expect PASS.
- [ ] **Step 5: Commit** `feat: exact dates on every scenario screen, month only as a fallback`.

### Task P1-T8: Franklin screen is honest when nothing was frozen (run R3)

**Files:**
- Modify: `frontend/src/features/scenarios/RedemptionFreezeResultView.tsx:6`
- Test: `frontend/src/features/scenarios/RedemptionFreezeResultView.test.tsx`

**Interfaces:** consumes `result.by_fund[].is_frozen: boolean` (already in `ScenarioFund`).

- [ ] **Step 1: Failing tests:** `"shows the freeze headline when a held fund was frozen"` (existing fixture; `getByText("Frozen, not %")`);
  `"shows a neutral headline when no held fund was frozen"` (all `is_frozen: false` → `getByText("None of your funds were frozen in this event")`, `queryByText("Frozen, not %")` null, fund rows still listed);
  `"keeps the freeze headline when only some funds were frozen"` (mixed → headline present).
- [ ] **Step 2: Run** the file — expect FAIL on the second test.
- [ ] **Step 3: Implement:** compute `frozenCount`; render the existing block when `frozenCount > 0`, else a neutral bordered block with the sentence. No portfolio impact figure is added.
- [ ] **Step 4: Run** `RedemptionFreezeResultView.test.tsx` and `ScenariosScreen.test.tsx` — expect PASS.
- [ ] **Step 5: Commit** `fix: Franklin screen no longer says Frozen when no fund was frozen`.

### Task P1-T9: AMC, Category and dashboard donut sort order (run R3)

**Files:**
- Create: `frontend/src/lib/allocationSort.ts`, `allocationSort.test.ts`, `frontend/src/components/AllocationSortToggle.tsx`, `AllocationSortToggle.test.tsx`
- Modify: `frontend/src/components/AllocationDonut.tsx` (`AllocationItem` gets optional `colorIndex?: number`; palette uses `item.colorIndex ?? idx`);
  `features/analytics/AllocationSection.tsx` (tabs at 67-83, donuts at 94/102/120); `features/dashboard/DashboardView.tsx:541`; `mobile/features/dashboard/MobileDashboardView.tsx:765`
- Test: `AllocationSection.test.tsx`, `AllocationDonut.test.tsx`, `DashboardView.test.tsx`

**Interfaces:**
- Produces: `export type SortOrder = "asc" | "desc"`; `export function sortAllocationItems<T extends { label: string; percentage: string }>(items: T[], order: SortOrder): T[]`
  — by `percentage` using `compareDecimalStrings`; ties broken A to Z by `label` in both orders; returns a new array.
- Produces: `AllocationSortToggle({ order, onChange }: { order: SortOrder; onChange: (o: SortOrder) => void })` — two buttons "Smallest first" and "Largest first" with `aria-pressed`.
- Rule: the default is `"asc"`. Assign `colorIndex` from the original order **before** sorting so a slice keeps its colour when the order flips. The asset-class view keeps its fixed order and shows no toggle. Print view uses the default order and no toggle. Confirm the `AllocationItem` field names (`label`, `percentage`) in `AllocationDonut.tsx:17-30` before coding.

- [ ] **Step 1: Failing tests.**
  - `allocationSort.test.ts`: `[A 42, B 31, C 18, D 9]` ascending → D, C, B, A; descending → A, B, C, D; two items at `10.00` order by label; empty array → `[]`; one item unchanged; input array not mutated.
  - `AllocationSortToggle.test.tsx`: renders both buttons; the active one has `aria-pressed="true"`; clicking the other calls `onChange("desc")`.
  - `AllocationSection.test.tsx`: the AMC tab lists the smallest share first by default (compare `getAllByTestId`/text order); clicking "Largest first" reverses it; the same on the Category tab; `printMode` shows both lists in the default order and no toggle.
  - `AllocationDonut.test.tsx`: an item with `colorIndex: 3` uses palette slot 3 regardless of its position.
  - `DashboardView.test.tsx`: the AMC list on the dashboard defaults to smallest first.
- [ ] **Step 2: Run** the six files — expect FAIL.
- [ ] **Step 3: Implement** the sort helper, the toggle, `colorIndex`, and wire all three screens. State is per visit, not persisted.
- [ ] **Step 4: Run** the files above plus `AnalyticsView.test.tsx`; `npx tsc -b`.
- [ ] **Step 5: Commit** `feat: AMC and Category allocation open smallest first, with a toggle`.

---

### P1 verification gate

- [ ] Run every P1 test file above together once; `npx tsc -b` clean; `npx oxlint` on touched files.
- [ ] Browser check on light and dark: tier badges, the allocation toggle, the scenario header dates. (`npm run dev`; synthetic account.)
- [ ] `/codex:adversarial-review` per run (R1, R2, R3) with the manual-relay warning to the user; findings fixed; handoffs set to DONE.


## Phase P2: Scenario Data Fixes


**Goal:** Fix the two scenario data problems: the US-Iran phases count their boundary days twice, and every
scenario appears twice in the picker on staging. Add a guard so the duplicates cannot return.

**Architecture:** One data migration (`0042`) corrects two phase end dates; a pair of scripts diagnoses and
removes duplicate scenario rows; a second migration (`0043`) adds a partial unique index on top-level
scenario names and refuses to run while duplicates exist. Nothing in this phase is run against staging by the
runs: staging steps go into the deploy guide (D3).

**Tech Stack:** Alembic, SQLAlchemy, pytest. The seed lives in
`backend/alembic/versions/0037_seed_scenario_library.py` and must not be edited (applied everywhere).

**Spec:** artifact other-fixes 3 and 5; decisions Q16, Q17. The measured evidence for fix 5 is in the artifact
(per-fund whole-event vs phases compounded: −2.28% vs −3.68% as built, −2.28% with the boundary fixed).

**Migration numbers:** confirm the head with `cd backend && alembic heads` first (it is `0041` today). If it has
moved, renumber both files and their `down_revision` values.

**Test command:** `cd backend && python -m pytest <files> -q 2>&1 | tail -8`.

---

### Task P2-T1: US-Iran phase end dates (migration 0042) (run R4)

**Files:**
- Create: `backend/alembic/versions/0042_us_iran_phase_end_dates.py`
- Test: `backend/tests/test_migrations.py` (new tests), `backend/tests/services/analytics/test_scenario_engine.py` (one new test)

**Interfaces:**
- Produces: migration `revision = "0042"`, `down_revision = "0041"`.
  - `upgrade()` sets `end_date = 2026-04-01` on the row named `"US-Iran war -- Shock"` and `end_date = 2026-07-07` on `"US-Iran war -- Partial recovery"`, both only where `parent_scenario_id IS NOT NULL` (the separator is a double hyphen). Matching by name updates every copy, so duplicates are all corrected.
  - `downgrade()` restores `2026-04-02` and `2026-07-08`.
  - The Relapse row (`2026-07-08` to ongoing) and the parent row are untouched.
  - The migration does not recompute results (it has no price data); see Step 6.

- [ ] **Step 1: Failing tests.** In `test_migrations.py` (pattern: `_alembic(...)` subprocess on a `tmp_path` SQLite file, inspected with `sqlite3`, as `test_0036_0037_scenarios_seed_roundtrip` does):
  - `test_0042_us_iran_phase_dates_roundtrip(tmp_path, monkeypatch)`: upgrade to `0042`; assert Shock `end_date == "2026-04-01"`, Partial recovery `end_date == "2026-07-07"`, Relapse `start_date == "2026-07-08"` and `end_date is None`; downgrade to `0041`; assert `"2026-04-02"` and `"2026-07-08"` are back.
  - `test_phases_of_every_scenario_never_overlap_after_0042`: after upgrading, for every parent that has phases, ordered by `phase_order`, each phase's `end_date` is strictly before the next phase's `start_date`.
  - In `test_scenario_engine.py`, `test_back_to_back_phases_compound_to_the_whole_event_per_fund`: one scheme with daily NAVs across Feb to Jul 2026; a parent `2026-02-28`→`2026-07-31` and three back-to-back phases (`02-28→04-01`, `04-02→06-30`, `07-01→07-31`, each starting the day after the previous ends); call `compute_scenario_results` on all four; assert `abs((1+a)*(1+b)*(1+c) - 1 - parent) < 0.0002` on the stored `pct_change` values divided by 100. (Use the module's existing fixture helpers.)
- [ ] **Step 2: Run** `pytest tests/test_migrations.py -k "0042 or never_overlap" tests/services/analytics/test_scenario_engine.py -k "back_to_back" -q` — expect FAIL (revision missing).
- [ ] **Step 3: Implement** the migration with `sa.table("scenarios", ...)` typed `sa.Date()` columns and Python `date` objects (portable to SQLite and Postgres).
- [ ] **Step 4: Run** the same tests — expect PASS. Run `pytest tests/test_migrations.py -q` once for the file (it contains the 0037 roundtrip that must still pass).
- [ ] **Step 5 (Claude, read-only):** read `backend/scripts/jobs/refresh_nav_daily.py` and `backend/scripts/compute_all_scenarios.py` and record in the handoff whether the daily NAV job recomputes phase rows. If it does not, the deploy guide must include `python scripts/compute_all_scenarios.py` after the migration; if it does, say so and rely on it.
- [ ] **Step 6: Commit** (D1) `fix: US-Iran phases no longer share boundary days (migration 0042)`.

### Task P2-T2: Duplicate scenarios — diagnose, clean up, guard (run R4)

**Files:**
- Create: `backend/scripts/diagnose_duplicate_scenarios.py`, `backend/scripts/dedupe_scenarios.py`, `backend/alembic/versions/0043_scenarios_unique_top_level_name.py`
- Modify: `backend/app/models/reference.py` (`Scenario.__table_args__` gains the same partial unique index)
- Test: `backend/tests/scripts/test_dedupe_scenarios.py` (new), `backend/tests/test_migrations.py`

**Interfaces:**
- `diagnose_duplicate_scenarios.py`: `def find_duplicate_scenarios(db: Session) -> list[DuplicateGroup]`, where
  `DuplicateGroup(name: str, copies: list[ScenarioCopy])` and `ScenarioCopy(scenario_id: uuid.UUID, result_rows: int, has_quick_stats: bool, phase_count: int)`.
  Only top-level rows (`parent_scenario_id IS NULL`) are grouped. `main()` prints a table and exits 0; it never writes.
- `dedupe_scenarios.py`: `def dedupe_scenarios(db: Session, *, apply: bool) -> DedupeReport`, `DedupeReport(kept: list[uuid.UUID], removed: list[uuid.UUID], rows_deleted: dict[str, int])`.
  Keep rule per name: the copy with the most `scenario_scheme_results` rows; ties → the one with non-null `quick_market_pct`; ties → the smallest `str(id)`.
  `apply=False` (the CLI default) changes nothing and returns what it would remove. Removal deletes, in order: results, category averages and hypothetical assumptions of the copy's phase rows, the phase rows, then the same three tables for the copy itself, then the copy.
- Migration `0043`: `revision = "0043"`, `down_revision = "0042"`. `upgrade()` first checks for duplicates and raises `RuntimeError("Duplicate top-level scenario names exist; run scripts/dedupe_scenarios.py --apply first")` if any; then creates unique index `uq_scenarios_top_level_name` on `scenarios(name)` with `postgresql_where=sa.text("parent_scenario_id IS NULL")` and `sqlite_where=sa.text("parent_scenario_id IS NULL")`. `downgrade()` drops it.

- [ ] **Step 1: Failing tests.**
  - `test_dedupe_scenarios.py` (in-memory SQLite, `Base.metadata.create_all`; build with `Scenario`, `ScenarioSchemeResult` models; note the new model-level index means duplicate rows must be inserted on a DB created without it, so create the tables then drop `uq_scenarios_top_level_name` in the fixture):
    `test_finds_a_duplicated_name_and_reports_which_copy_has_results`; `test_dry_run_changes_nothing`; `test_apply_keeps_the_copy_with_results_and_deletes_the_other_with_its_children`;
    `test_apply_removes_a_duplicate_parents_phase_rows_too`; `test_a_tie_keeps_the_copy_with_quick_stats`; `test_no_duplicates_is_a_no_op`; `test_phase_rows_sharing_a_name_across_different_parents_are_not_duplicates`.
  - `test_migrations.py`: `test_0043_unique_top_level_name_roundtrip` (upgrade to 0043, inserting a second top-level row with an existing name raises `sqlite3.IntegrityError`; two phase rows with the same name under different parents are allowed; downgrade drops the index);
    `test_0043_refuses_to_run_while_duplicates_exist` (upgrade to 0042, insert a duplicate top-level name, upgrade to 0043 → non-zero return code and the message in stderr).
- [ ] **Step 2: Run** both files — expect FAIL.
- [ ] **Step 3: Implement** the two scripts, the migration, and the model index. Both scripts take the database from the same environment variable the app uses and print which database they are about to touch before doing anything.
- [ ] **Step 4: Run** `pytest tests/scripts/test_dedupe_scenarios.py tests/test_migrations.py tests/api/test_scenarios_api.py tests/services/analytics/test_scenario_engine.py -q`. If an existing test inserts two top-level scenarios with one name, give them distinct names; do not weaken the index.
- [ ] **Step 5: Commit** (D1) `feat: scenario duplicate tooling and a unique index on top-level names (migration 0043)`.

---

### P2 execution notes
**Added during execution (2026-10-20, user decision after the Opus review):** `dedupe_scenarios` also carries a data-loss guard. `ScenarioCopy` gained `assumption_count`; the diagnose table shows an `Assumptions` column; `DedupeReport.blocked` lists any group where a copy to remove holds more phases or hypothetical assumptions than the copy to keep, the dry run prints them as `BLOCKED`, and `--apply` raises `DedupeBlocked` (exit code 1, nothing deleted) until the user resolves that group by hand. The keep rule itself (Q17) is unchanged.
**Not verified locally:** the two migrations on PostgreSQL (Docker access was denied in this environment); the Postgres roundtrip test is written (`test_0043_postgres_unique_top_level_name_roundtrip`, uses `head`) and must run before deploy.
**Deploy-guide steps this phase needs (in order):** diagnose on each database and review the output with the user; `dedupe_scenarios.py` dry run; `--apply` (only if nothing is BLOCKED); `alembic upgrade head`; **`python scripts/compute_all_scenarios.py`** (the daily NAV job only recomputes `is_ongoing` scenarios, and Shock/Partial recovery are settled).

### P2 verification gate

- [ ] Both migrations run up and down on a fresh SQLite database; on the local Postgres container too: `docker compose up postgres`, then the two migration tests against it (follow the `test_0028_postgres_…` pattern in `test_migrations.py`), because the partial index syntax differs.
- [ ] Review gate per run (R4), **Opus review** (D5): migrations and data deletion.
- [ ] **Not run by the plan:** the diagnosis query and the clean-up on staging and production. They go into the deploy guide as separate, user-confirmed steps (D3): run `diagnose_duplicate_scenarios.py` on each database, look at the output together, then `dedupe_scenarios.py` (dry run), then `--apply`, then `alembic upgrade head`. The order matters, because `0043` refuses to run while duplicates exist.


## Phase P3: Investment & Withdrawal


**Goal:** Make the Investment & Withdrawal section show withdrawals below a zero line, show switches as their
own in-and-out pair with an "Include switches" toggle, move the opening holdings out of the bars, and replace the
flat transaction list with a fund-wise breakdown. Also prove, with a test and a worked check, that the benchmark
XIRR already uses each transaction's own date (item 2).

**Architecture:** The backend classification (`direction_for`) gains switch and opening directions and the section
payload gains four total fields and two bucket fields, all defaulted. The frontend does the toggle arithmetic, so one
payload serves both views. The bar chart gets a baseline layout. No table, no migration.

**Tech Stack:** SQLAlchemy/pytest; React/`@visx`/vitest.

**Spec:** artifact item 1 (decisions Q1, Q11), item 2. **P6 depends on this phase** (it reuses `direction_for`).

**Test commands:** backend `cd backend && python -m pytest <files> -q 2>&1 | tail -8`;
frontend `cd frontend && npx vitest run <files> 2>&1 | tail -20`.

---

### Task P3-T1: Classification, totals and schema (backend) (run R5)

**Files:**
- Modify: `backend/app/services/lot_rules.py` (add `is_conversion_description`); `backend/app/services/import_/parser.py:324-326` (`_is_conversion` calls it);
  `backend/app/services/analytics/investment_withdrawal.py:34-55,104-183`; `backend/app/services/analytics/schemas.py:274-315`;
  `backend/tests/services/analytics/test_recompute.py:87` (fixture result)
- Test: `backend/tests/services/analytics/test_investment_withdrawal.py`, `test_investment_withdrawal_schemas.py`,
  new `backend/tests/services/test_lot_rules_conversion.py`; existing parser tests must stay green (`ls backend/tests/services/import_/test_parser*.py`)

**Interfaces:**
- Produces: `lot_rules.is_conversion_description(description: str | None) -> bool` — case-insensitive, true if the text contains `"face value"` or `"merger"`.
- Produces: `investment_withdrawal.direction_for(txn: Transaction) -> str | None` (replaces `_direction(txn_type)`):
  `OPENING_BALANCE → "opening"`, `REVERSAL → "reversal"`, `PURCHASE`/`PURCHASE_SIP → "invested"`, `REDEMPTION`/`DIVIDEND_PAYOUT → "withdrawn"`,
  `SWITCH_IN → "switched_in"`, `SWITCH_OUT → "switched_out"`, except any switch whose `raw_description` satisfies `is_conversion_description` → `None`;
  gifts, bonus, STT, stamp duty, misc, segregation, dividend reinvest → `None`. Keep using `cash_flow._DEBIT_TYPES`/`_CREDIT_TYPES` for the cash sets (do not redefine them).
- Schema (all new fields defaulted so old payloads load): `InvestmentWithdrawalBucket.switched_in: str = "0.00"`, `.switched_out: str = "0.00"`;
  `InvestmentWithdrawalResult.total_switched_in: str = "0.00"`, `.total_switched_out: str = "0.00"`, `.switch_count: int = 0`, `.opening_holdings: str = "0.00"`.
  Entry `direction` is still `str`; its values now also include `"switched_in"`, `"switched_out"`, `"opening"`.
- Rules: bucket `invested = Σ invested − Σ reversal` (opening excluded); `total_invested = Σ buckets' invested + opening_holdings` (the value it had before);
  `net_invested`, `absolute_gain` and the gift handling are unchanged (switches never enter them); amounts are `paid_amount(txn)`;
  `switch_count = max(number of switched_out entries, number of switched_in entries)`; a zero-amount switch (from opening holdings) stays in `entries` and counts, adding ₹0.

- [ ] **Step 1: Failing tests** (extend the `_txn` helper with a `raw_description=None` argument):
  - `test_switch_legs_get_their_own_directions`: out 400000 and in 400000 in one month → that bucket `switched_out == "400000.00"`, `switched_in == "400000.00"`, `invested == "0.00"`, `withdrawn == "0.00"`; `result.switch_count == 1`; `total_switched_out == "400000.00"`.
  - `test_switches_do_not_change_net_invested_or_gain`: same cash purchase with and without the two switch legs → equal `net_invested` and `absolute_gain`.
  - `test_a_merger_or_face_value_conversion_is_not_a_switch`: `SWITCH_OUT` with `raw_description="Face value change"` and `SWITCH_IN` with `"Merger of X into Y"` → no `switched_*` amounts, `switch_count == 0`, neither in any bucket's `entries`.
  - `test_a_switch_from_opening_holdings_counts_but_adds_nothing`: amount `0.00` → one entry with amount `"0.00"`, `switch_count == 1`, sums `"0.00"`.
  - `test_opening_holdings_are_reported_apart_and_left_out_of_the_bars`: `OPENING_BALANCE` 500000 in January and a purchase of 10000 in February → `opening_holdings == "500000.00"`, January `invested == "0.00"`, February `"10000.00"`, `total_invested == "510000.00"`, and `total_invested == sum(b.invested for b in monthly) + opening_holdings`.
  - `test_a_switch_posting_in_the_next_month_lands_in_that_month`: out on 31 March, in on 1 April → March bucket `switched_out`, April bucket `switched_in`.
  - `test_direction_for_covers_every_transaction_type` (parametrised over `TransactionType`): each result is one of the six strings or `None`; gifts, bonus, STT, stamp duty, misc, segregation and dividend reinvest give `None`.
  - Schemas: `test_new_fields_default_so_old_payloads_load` — build `InvestmentWithdrawalResult` without the new fields; assert the defaults.
  - `test_lot_rules_conversion.py`: `"Merger of A"` and `"Face Value Change"` true; `"SIP purchase"`, `""` and `None` false.
  - `test_recompute.py:87`: the fake result still constructs (the new fields default).
- [ ] **Step 2: Run** the four test files — expect FAIL (`direction_for` missing).
- [ ] **Step 3: Implement** `is_conversion_description`, make the parser call it (DRY; behaviour identical), implement `direction_for` and the aggregation changes.
- [ ] **Step 4: Run** the four files, the parser tests, and `tests/services/analytics/test_recompute.py` — expect PASS. Run `ls backend/tests/services/import_/` to name the parser files.
- [ ] **Step 5: Commit** (D1) `feat: switches and opening holdings classified apart in Investment & Withdrawal`.

### Task P3-T2: Frontend types and pure logic (run R5)

**Files:**
- Modify: `frontend/src/features/analytics/types.ts:293-327`
- Create: `frontend/src/features/analytics/investmentWithdrawalMath.ts`, `periodBreakdown.ts`, and `…test.ts` for each

**Interfaces:**
- Types: `InvestmentWithdrawalEntry.direction` becomes `"invested" | "withdrawn" | "reversal" | "switched_in" | "switched_out" | "opening"`;
  `InvestmentWithdrawalBucket` adds optional `switched_in?: string`, `switched_out?: string`;
  `InvestmentWithdrawalResult` adds optional `total_switched_in?: string`, `total_switched_out?: string`, `switch_count?: number`, `opening_holdings?: string`. (Optional, so a saved payload without them type-checks and renders.)
- `tilesFor(data: InvestmentWithdrawalResult, includeSwitches: boolean): { invested: string; withdrawn: string; net: string }` —
  `invested = sumDecimalStrings([data.total_invested, includeSwitches ? data.total_switched_in ?? "0" : "0"])`, `withdrawn` likewise with `total_switched_out`, `net = data.net_invested` always.
- `toBarData(buckets: InvestmentWithdrawalBucket[], includeSwitches: boolean): BarChartDatum[]` — `{ period, invested: Number(b.invested), withdrawn: Number(b.withdrawn), switchedIn: includeSwitches ? Number(b.switched_in ?? 0) : 0, switchedOut: includeSwitches ? Number(b.switched_out ?? 0) : 0 }` (`Number` for chart geometry only).
- `periodBreakdown.ts`:
  - `export interface FundBreakdownRow { schemeName: string; memberNames: string[]; invested: string; withdrawn: string; switchedIn: string; switchedOut: string; net: string; entries: InvestmentWithdrawalEntry[] }`
  - `groupByFund(entries: InvestmentWithdrawalEntry[], memberId: string | null): { rows: FundBreakdownRow[]; opening: string }` — filters by member when `memberId` is set; merges the same fund across members; `opening` is the sum of `direction === "opening"` entries and those entries are not in any row; reversal entries subtract from `invested`;
    `net = invested − withdrawn + switchedIn − switchedOut`; rows sorted by largest total movement, ties by scheme name. All money via `lib/decimal.ts`.
  - `breakdownTotals(rows: FundBreakdownRow[]): { invested: string; withdrawn: string; switchedIn: string; switchedOut: string; net: string }`.
  - `transactionLabel(entry: InvestmentWithdrawalEntry): string` — `purchase_sip → "SIP"`, `purchase → "Lump sum"`, `redemption → "Redemption"`, `dividend_payout → "Dividend payout"`, `switch_in → "Switch in"`, `switch_out → "Switch out"`, `reversal → "Bounced SIP (reversed)"`, `opening_balance → "Opening holdings"`, otherwise `toTitleCase(type)`.

- [ ] **Step 1: Failing tests:** `tilesFor` off/on (Invested rises by `total_switched_in`, Withdrawn by `total_switched_out`, `net` identical) and with the optional fields missing (on equals off); `toBarData` off/on; `groupByFund` merges one fund across two members, applies the member filter, sorts, nets a reversal, separates `opening`; `breakdownTotals` equals the sum of rows and, for a bucket's entries, equals that bucket's `invested`/`withdrawn`; `transactionLabel` for each type.
- [ ] **Step 2: Run** `npx vitest run src/features/analytics/investmentWithdrawalMath.test.ts src/features/analytics/periodBreakdown.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** the types and the three modules.
- [ ] **Step 4: Run** the two files plus `npx tsc -b` — expect PASS and a clean type check.
- [ ] **Step 5: Commit** (D1) `feat: investment-withdrawal types, toggle arithmetic and fund-wise grouping`.

### Task P3-T6: Prove the benchmark XIRR uses each transaction's own date (run R5)

**Files:**
- Test: `backend/tests/services/analytics/test_benchmark*.py` (find with `ls backend/tests/services/analytics | grep -i bench`)
- Create (Claude): `Docs/orchestration/<date>-benchmark-xirr-check.md`

**Interfaces:** consumes `benchmark._benchmark_xirr_for_transactions(db, transactions, index, extra_debit_types=frozenset())` unchanged.

- [ ] **Step 1: Failing/pinning tests** (write them as passing characterisation tests; they must pass on today's code, and fail if the date handling regresses):
  - `test_benchmark_xirr_prices_each_transaction_on_its_own_date`: three purchases on three dates with a TRI series that moves between them; compare the function's result with an independent Decimal XIRR written in the test (bisection on the NPV of the flows `(date, −amount)` plus the end value `units × today_level`); equal within `Decimal("0.0001")`.
  - `test_a_transaction_on_a_market_holiday_uses_the_previous_trading_days_level`: purchase on a Sunday; levels exist for the Friday and the Monday; assert the hypothetical units equal `amount / friday_level`.
- [ ] **Step 2: Run** the file — expect PASS (these pin existing behaviour). If either fails, stop and report: the artifact's claim would be wrong.
- [ ] **Step 3 (Claude):** write the check doc: the worked SIP example (three monthly purchases), the two numbers (app and independent), and the holiday rule. One page.
- [ ] **Step 4: Commit** (D1) `test: pin benchmark XIRR date handling, with a worked check`.

### Task P3-T3: Bar chart: baseline, negative bars, switch segments (run R6)

**Files:**
- Modify: `frontend/src/components/ui/charts/bar-chart.tsx` (`BarChartDatum` at 7, `barHeight` at 46, bars at 55-87)
- Test: `frontend/src/components/ui/charts/bar-chart.test.tsx`

**Interfaces:**
- `BarChartDatum` gains `switchedIn?: number; switchedOut?: number`. No new prop.
- Layout: `up = invested + switchedIn`, `down = withdrawn + switchedOut` per period; `maxUp = Math.max(1, …up)`, `maxDown = Math.max(0, …down)`;
  `baselineY = MARGIN.top + plotHeight * maxUp / (maxUp + maxDown)` (so with no withdrawals the baseline is the bottom of the plot);
  invested bars grow up from `baselineY`, withdrawn bars grow down from it; the switch segments stack beyond them with `fill-opacity` 0.45.
  Negative `invested` (a reversal) still draws as zero height. A thin baseline `<line data-testid="bar-baseline">`.
- Test ids kept: `bar-group-${period}`, `bar-invested-${period}`, `bar-withdrawn-${period}`; new: `bar-switched-in-${period}`, `bar-switched-out-${period}`. Keyboard and `onBarClick` behaviour unchanged.

- [ ] **Step 1: Failing tests:** `"draws withdrawals below the baseline"` (withdrawn rect `y` ≥ baseline `y1`; invested rect bottom equals baseline); `"puts the baseline at the bottom when nothing was withdrawn"`;
  `"stacks lighter switch segments beyond the cash bars"` (switched-in rect sits above the invested rect, switched-out below the withdrawn rect, both with `fill-opacity` 0.45); `"a period with no movement has no bar but is still tappable"`;
  update `"scales the tallest bar to the full plot height…"` for the new geometry; keep the existing keyboard, scroll and label tests green.
- [ ] **Step 2: Run** `bar-chart.test.tsx` — expect FAIL.
- [ ] **Step 3: Implement** the layout (compute spans from the baseline; no new dependency).
- [ ] **Step 4: Run** `bar-chart.test.tsx` and `InvestmentWithdrawalSection.test.tsx` — expect PASS.
- [ ] **Step 5: Commit** (D1) `feat: investment-withdrawal bars draw withdrawals below a zero baseline`.

### Task P3-T4: Section UI: toggle, switched line, opening figure, fund-wise breakdown (run R6)

**Files:**
- Modify: `frontend/src/features/analytics/InvestmentWithdrawalSection.tsx` (tiles 118-122, chart 151-155, `PeriodTransactions` 60-81)
- Create: `frontend/src/features/analytics/PeriodBreakdown.tsx`
- Test: `frontend/src/features/analytics/InvestmentWithdrawalSection.test.tsx`, new `PeriodBreakdown.test.tsx`

**Interfaces:**
- `PeriodBreakdown({ bucket, periodTitle }: { bucket: InvestmentWithdrawalBucket; periodTitle: string })` renders: a summary strip (Invested, Withdrawn, Switched in, Switched out, and `Opening holdings ₹X` when non-zero);
  member filter buttons only when the bucket's entries span more than one member; a table Fund | Invested | Withdrawn | Switched in | Switched out | Net with a totals row; each row's arrow (`button`, `aria-expanded`) opens that fund's transactions (date, member, `transactionLabel`, amount). An empty bucket shows `"No transactions in this period"`.
- Section: `includeSwitches` state (default `false`, not persisted); a `button aria-pressed` named `"Include switches"`; tiles from `tilesFor`; under the tiles a line `Switched between funds: ₹X in N switches` (X = `total_switched_out`; with none: `Switched between funds: none`);
  above the chart, when `opening_holdings` is non-zero, `Opening holdings ₹X (in Invested, not drawn as a bar)`; chart data from `toBarData`; legend adds a lighter swatch "Switched" only while the toggle is on.
  `printMode`: no toggle and no breakdown (as today's tap-less print).

- [ ] **Step 1: Failing tests** (section): `"the toggle adds switches to Invested and Withdrawn and leaves Net invested and Gain alone"`; `"shows the switched-between-funds line, and 'none' when there were none"`;
  `"shows the opening holdings figure above the chart"`; `"an old payload without the switch fields still renders"` (no `NaN`, line says none, toggle changes nothing);
  `"tapping a period shows the fund-wise table with totals equal to that period's Invested and Withdrawn"`; `"the member filter isolates one person's rows"`; `"opening a fund shows its transactions with plain labels"` (`SIP`, `Redemption`);
  `"print mode has no toggle and no breakdown"`. `PeriodBreakdown.test.tsx`: renders the summary chips, totals row, and the empty state.
  Update the existing section tests that read the old flat list (`"tapping a period lists that period's transactions…"`, `"labels a bounced SIP…"`).
- [ ] **Step 2: Run** the two files — expect FAIL.
- [ ] **Step 3: Implement** `PeriodBreakdown` and the section changes using `tilesFor`, `toBarData`, `groupByFund`, `breakdownTotals`, `transactionLabel`. Delete `PeriodTransactions`.
- [ ] **Step 4: Run** both files, `AnalyticsView.test.tsx`, `npx tsc -b`.
- [ ] **Step 5: Commit** (D1) `feat: switches toggle and fund-wise breakdown in Investment & Withdrawal`.

### Task P3-T5: Synthetic check and screen reuse (run R6, Claude)

**Files:**
- Create: `Docs/CAS Files/synthetic/harness/ux_checks.py` (follow `sp2_checks.py` for structure and how it reads the harness output)

- [ ] **Step 1 (Claude):** write the Investment & Withdrawal checks in `ux_checks.py`, run for `r2_couple_rohan_priya_10yr.pdf`, `big_family_ayush_anand_7yr.pdf` and `p20_10yr.pdf`:
  (1) `total_invested == Σ monthly.invested + opening_holdings` and the same for yearly; (2) `total_withdrawn == Σ monthly.withdrawn`; (3) `net_invested == total_invested − total_withdrawn`;
  (4) no entry marked `switched_*` has a description containing "merger" or "face value"; (5) for `r2`, the March 2023 bucket has `withdrawn > 0` (the house down-payment redemptions in the file's README); (6) `switch_count` equals the number of switch legs in the file's rows (where any).
- [ ] **Step 2:** run the harness from `backend/`: `MASTER_FILE=… SEQ=<file> OUT=<path> ANALYTICS=1 python -m pytest "../Docs/CAS Files/synthetic/harness/test_deep.py" -q --rootdir "../Docs/CAS Files/synthetic/harness" 2>&1 | tail -15`, then `ux_checks.py` on the output. Record counts and any mismatch in the R5/R6 handoffs.
- [ ] **Step 3:** open the analytics screen for the phone view (`MobileAnalyticsView`) and the print view (`PrintAnalyticsView`) in the browser and confirm the toggle appears on the phone, not in print. No code change expected; if one is needed, add a test first.
- [ ] **Step 4: Commit** (D1) `test: synthetic checks for the investment-withdrawal reconciliation`.

---

### P3 execution notes (2026-10-20, from the Opus review of R5)

- **P3-T1 must not ship to staging without P3-T4/T5.** The current `InvestmentWithdrawalSection.tsx` labels every entry that is not invested or a reversal as "Withdrawn" in red, and bucket entries now include opening, switched-in and switched-out entries; until P3-T4/T5 replace that list, tapping a bar mislabels them. The branch is fine, a deploy is not.
- **For P6-T2:** `direction_for` has its own `opening` direction. P6's `new_money` must decide explicitly whether a month's opening balance is new money; if it is not, that value surfaces as market movement in that month. Decision recorded for P6-T2: opening-balance rows are **not** new money (they are holdings that pre-date the statement), shown in the first month's detail as a separate line "Opening holdings".
- **Known limits (accepted, documented):** `direction_for` decides from one row's description, so a conversion pair where only one leg says "merger" or "face value" is half-excluded; amount-less SWITCH pairs without that text count as real switches (the parser stores no conversion flag). `switch_count` is max(switch-in count, switch-out count); the in and out totals can legitimately differ (STT or exit load, a partner folio missing), so with the toggle on Invested minus Withdrawn is not the Net invested tile and the UI must not imply it is. `groupByFund` merges by fund name (entries carry no scheme id). Old saved payloads keep the old opening split until recomputed.

### P3 verification gate

- [ ] All P3 test files together once; `npx tsc -b` clean.
- [ ] Review gate for R5 (**Opus review**, D5: the money classification) and R6, each via `/codex:adversarial-review` with the manual-relay warning.
- [ ] The synthetic results (P3-T5) recorded and every check passing.


## Phase P4: Return Periods and Ranking Labels


**Goal:** Show 1Y, 3Y and 5Y returns for the fund and its category (with an AUM-weighted category average per
period) in both the Category Ranking and Fund Ranking sections, and name the basis of each rank on screen.

**Architecture:** The 1Y/3Y/5Y returns and all the prices behind them are already computed
(`_compute_category_returns_detailed`) and thrown away; keep them. One shared pure function
(`category_period_averages`) produces the per-period category averages for both sections, so they always agree.
One shared frontend table component renders them. No new price lookup, table, migration or job.

**Tech Stack:** SQLAlchemy/pytest; React/vitest; existing `components/ui/table.tsx`.

**Spec:** artifact items 4, 5, 8 (decisions Q3, Q4, Q5, Q14, Q15). Returns are decimal **fractions** as strings
(the existing convention; the screen formats them as percentages).

**Test commands:** backend `cd backend && python -m pytest <files> -q 2>&1 | tail -8`;
frontend `cd frontend && npx vitest run <files> 2>&1 | tail -20`.

---

### Task P4-T1: Category ranking carries per-period returns and averages (backend) (run R7)

**Files:**
- Modify: `backend/app/services/analytics/category_ranking.py` (cache at 67-70; `_category_returns` at 166; `compute_category_ranking` at 223-288); `backend/app/services/analytics/schemas.py` (`CategoryRankRow` at 185-201)
- Test: `backend/tests/services/analytics/test_category_ranking.py`

**Interfaces:**
- Produces in `schemas.py`: `class PeriodReturn(BaseModel): fund_return: str | None = None; category_avg: str | None = None; peers: int = 0`.
- `CategoryRankRow` gains `periods: dict[str, PeriodReturn] = Field(default_factory=dict)` (keys `"1y"`, `"3y"`, `"5y"`) and `plan_type: str | None = None` (`"direct"` / `"regular"`, from `scheme.plan_type.value`).
- Produces in `category_ranking.py`:
  `def category_period_averages(detailed: dict[uuid.UUID, tuple[Decimal | None, Decimal, Decimal | None, Decimal]], aaum_by_scheme: dict[uuid.UUID, Decimal]) -> dict[str, tuple[Decimal | None, int]]`
  — for each of `"1y"` (tuple index 0), `"3y"` (1), `"5y"` (2): the pool is the schemes whose value for that period is not `None`; the average is `_aum_weighted_average(pool_returns, aaum_by_scheme)` (`None` when there is no AUM data); the count is the pool size.
- Produces: `async def _category_returns_detailed(db, universe, today, *, cache_key=None) -> dict[uuid.UUID, tuple[Decimal | None, Decimal, Decimal | None, Decimal]]` with the existing 15-minute, per-day cache (its cache now stores the detailed tuples). `_category_returns` becomes a projection of it onto the blended value and keeps its signature (the scorer imports it at `scorer.py:27`).
- Rule: for a fund whose representative has no value for a period, `fund_return` is `None` for that period while `category_avg` and `peers` are still given. For unavailable or insufficient-history rows `periods` is `{}`.

- [ ] **Step 1: Failing tests:**
  - `test_category_period_averages_weights_each_period_by_aum`: schemes A (r1 0.10, r3 0.12, r5 0.14, AUM 300) and B (r1 0.20, r3 0.22, r5 None, AUM 100) → 1Y average `0.125`, 3Y `0.145`, 5Y `0.14` with counts `2, 2, 1`.
  - `test_category_period_averages_are_none_without_aum_but_still_count_peers`.
  - `test_compute_category_ranking_carries_the_three_periods_for_the_held_fund`: `row.periods["3y"].fund_return == str(r3)`, `.category_avg == str(expected)`, `.peers == pool size`.
  - `test_a_fund_with_no_5y_shows_no_fund_return_but_keeps_the_category_average`.
  - `test_periods_are_empty_for_unavailable_and_insufficient_history_rows`.
  - `test_plan_type_is_carried_as_direct_or_regular`.
  - `test_detailed_returns_are_computed_once_for_the_blended_and_the_period_views`: call `_category_returns` then `_category_returns_detailed` for one category on one day; the underlying compute runs once.
  - Existing cache tests (`…caches_across_calls_for_same_category`, `…recomputes_once_ttl_has_expired`, `…recomputes_on_calendar_day_rollover`, `…cache_is_isolated_per_category`, `…keeps_full_universe_and_plan_peers_separate`) keep their meaning; where they patch `_compute_category_returns`, patch `_compute_category_returns_detailed` instead.
- [ ] **Step 2: Run** `test_category_ranking.py` — expect FAIL.
- [ ] **Step 3: Implement** the schema, the helper, the cached detailed function and the row fields.
- [ ] **Step 4: Run** `test_category_ranking.py`, `test_scorer*.py` (the scorer uses `_category_returns`), `tests/services/analytics/test_recompute.py`, `tests/api/test_analytics_route.py` — expect PASS.
- [ ] **Step 5: Commit** (D1) `feat: category ranking carries 1Y/3Y/5Y fund returns and category averages`.

### Task P4-T2: Fund ranking carries horizons, consistent with the category ranking (backend) (run R7)

**Files:**
- Modify: `backend/app/services/analytics/fund_ranking.py` (`_compute_category_ranking_scores` 103-175; `_finish_fund_ranking` 260-323; `FundRankingRow(` sites at 202, 281, 314); `schemas.py` (`FundRankingRow` 338-355)
- Test: `backend/tests/services/analytics/test_fund_ranking.py`, new `test_period_consistency.py`

**Interfaces:**
- `FundRankingRow` gains `horizons: dict[str, PeriodReturn] = Field(default_factory=dict)` and `plan_type: str | None = None`.
- In `_compute_category_ranking_scores`, after the per-scheme loop, attach `scores[scheme_id]["horizons"]`: for `"1y"`, `"3y"`, `"5y"` the fund's own return, and the category average and peer count from the shared `category_period_averages(detailed, aaum_by_scheme)` (reuse the `aaum_by_scheme` already loaded there).
- Rule: when the category has fewer than `_MIN_RANKED_PEERS` (3) ranked funds, `horizons` still carries the fund's own returns but `category_avg` is `None`. The stored `SchemeRanking` row is **unchanged** (it already stores the three returns).

- [ ] **Step 1: Failing tests:**
  - `test_ranking_row_carries_horizons_with_the_shared_category_averages`.
  - `test_too_few_peers_row_has_own_returns_but_no_category_average`.
  - `test_horizons_are_empty_for_unavailable_and_insufficient_history_rows`.
  - `test_five_year_missing_gives_no_fund_return_but_a_category_average`.
  - `test_the_stored_ranking_row_is_unchanged` (same columns and values as before, one row per fund per day).
  - `test_period_consistency.py::test_both_sections_show_the_same_category_average_for_the_same_fund`: build one category (four schemes, AUM, NAVs); run `compute_category_ranking` and `compute_portfolio_ranking` for a held fund; for each of `1y`, `3y`, `5y` assert equal `category_avg` strings and equal `peers`; and `periods[k].fund_return` equals `horizons[k].fund_return`.
- [ ] **Step 2: Run** the two files — expect FAIL.
- [ ] **Step 3: Implement** the attachment and the three `FundRankingRow(` call sites.
- [ ] **Step 4: Run** `test_fund_ranking.py`, `test_period_consistency.py`, `test_recompute_fund_ranking_section.py`, `test_category_ranking.py` — expect PASS.
- [ ] **Step 5: Commit** (D1) `feat: fund ranking carries per-period returns beside the composite rank`.

### Task P4-T3: Shared period-returns table (frontend) (run R8)

**Files:**
- Create: `frontend/src/features/analytics/PeriodReturnsTable.tsx`, `PeriodReturnsTable.test.tsx`, `percentFormat.ts`
- Modify: `frontend/src/features/analytics/types.ts` (`CategoryRankRow` at 47, `FundRankingRow` at 350); `CategoryRankingSection.tsx` (move `formatRawFractionPercent` out, import it)

**Interfaces:**
- Types: `export interface PeriodReturn { fund_return: string | null; category_avg: string | null; peers: number }`;
  `CategoryRankRow.periods?: Partial<Record<"1y" | "3y" | "5y", PeriodReturn>>`, `plan_type?: string | null`;
  `FundRankingRow.horizons?: Partial<Record<"1y" | "3y" | "5y", PeriodReturn>>`, `plan_type?: string | null`. (Optional so old saved payloads type-check.)
- `percentFormat.ts`: `export function formatRawFractionPercent(value: string | null): string` — the function that lives at `CategoryRankingSection.tsx:27` today, moved unchanged.
- `PeriodReturnsTable({ periods }: { periods: Partial<Record<"1y" | "3y" | "5y", PeriodReturn>> | undefined })` — returns `null` when `periods` is absent or empty. Columns 1Y, 3Y, 5Y; rows "Fund", "Category average", "Difference" (fund minus category, in percentage points with sign, via `diffDecimalStrings`; `—` when either side is null); a caption line `Category average covers {n1} funds (1Y), {n3} (3Y), {n5} (5Y).` Uses `components/ui/table.tsx`.

- [ ] **Step 1: Failing tests:** renders three period columns and the three rows with formatted percentages; `—` for a null fund return (its difference also `—`); the difference carries `+` or `-`; the caption shows each peer count; `periods={undefined}` and `{}` render nothing.
- [ ] **Step 2: Run** `npx vitest run src/features/analytics/PeriodReturnsTable.test.tsx src/features/analytics/CategoryRankingSection.test.tsx` — expect FAIL.
- [ ] **Step 3: Implement** the helper move, the types and the component.
- [ ] **Step 4: Run** the same files plus `npx tsc -b` — expect PASS.
- [ ] **Step 5: Commit** (D1) `feat: shared 1Y/3Y/5Y returns table component`.

### Task P4-T4: Category ranking section shows periods and names its basis (run R8)

**Files:**
- Modify: `frontend/src/features/analytics/CategoryRankingSection.tsx` (per-fund card, around 80-221)
- Test: `frontend/src/features/analytics/CategoryRankingSection.test.tsx`, `AnalyticsView.test.tsx` (heading asserts stay)

**Interfaces:** consumes `PeriodReturnsTable`, `CategoryRankRow.periods`, `.plan_type`.

- [ ] **Step 1: Failing tests:** `"names the rank basis"` (text `Ranked on the blended 3Y/5Y return.`); `"names the plan type of the peers"` (`plan_type: "direct"` → `Compared with Direct plan peers`; `"regular"` → `Regular plan peers`; missing → neither);
  `"shows the 1Y/3Y/5Y table when periods are present"` (the three headers and the fund's `12.4%`); `"renders an old payload without periods and without plan type"` (no table, no crash, existing figures unchanged).
- [ ] **Step 2: Run** the file — expect FAIL.
- [ ] **Step 3: Implement** the three additions inside each fund card; the blended `Fund return` and `Category avg` figures stay, now explained by the basis line.
- [ ] **Step 4: Run** `CategoryRankingSection.test.tsx`, `AnalyticsView.test.tsx` — expect PASS.
- [ ] **Step 5: Commit** (D1) `feat: category ranking shows 1Y/3Y/5Y and names its basis`.

### Task P4-T5: Fund ranking section names its basis and shows returns per horizon (run R8)

**Files:**
- Modify: `frontend/src/features/analytics/FundRankingSection.tsx` (`rankLine` 47-54; `ComponentRow` list near 163-164; `FundLeaderboardCard` header ~120-135)
- Test: `frontend/src/features/analytics/FundRankingSection.test.tsx`

**Interfaces:** consumes `PeriodReturnsTable`, `FundRankingRow.horizons`, `.plan_type`. Extract the five weights into one exported const `RANK_WEIGHTS` (label, weight) used by both the basis line and the `ComponentRow` list, so they cannot drift.

- [ ] **Step 1: Failing tests:** `"names the basis of the overall rank"` (text `Overall rank = composite score: 3Y return 25%, 5Y return 25%, category-relative 20%, low volatility 15%, low TER 15%.`);
  `"shows the returns table under the rank line when horizons are present"`; `"labels the neighbour scores"` (caption `Composite score, 0 to 100`); `"names the plan type of the peers"`;
  `"an old payload without horizons still renders"`; the existing eleven tests stay green.
- [ ] **Step 2: Run** the file — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `FundRankingSection.test.tsx`, `AnalyticsView.test.tsx`, `npx tsc -b`.
- [ ] **Step 5: Commit** (D1) `feat: fund ranking names its basis and shows returns per horizon`.

---

### P4 verification gate

- [ ] All P4 test files together once; `npx tsc -b` clean.
- [ ] Review gate for R7 and R8 via `/codex:adversarial-review` (manual relay warning).
- [ ] Synthetic check, added to `ux_checks.py` (Claude), run on `r2…`, `big_family…`, `p20_10yr.pdf`:
  for every held fund, `periods[k].category_avg` (category ranking) equals `horizons[k].category_avg` (fund ranking) for `k` in `1y`, `3y`, `5y`;
  `periods["3y"].fund_return` equals the ranking's `components.return_3y.raw`; `periods["1y"].fund_return` equals its `return_1y`; a Direct fund says `direct`, a Regular fund `regular`.


## Phase P5: Fund Manager Table and TER in Rupees


**Goal:** (1) Replace the expandable fund-manager cards with one table: manager, AMC, current value, % of the
overall portfolio, with each fund divided equally among its managers. (2) Show TER in rupees: yearly cost on the
three cards and a fund-wise table projecting the cost over the next 1, 3 and 5 years.

**Architecture:** Both change an existing backend calculation and its payload (new fields, all defaulted) and replace
the matching frontend rendering. No new table, migration or job. The manager data holds no per-manager share, so the
equal split is an assumption and is footnoted on screen.

**Tech Stack:** SQLAlchemy/pytest; React/vitest; existing `components/ui/table.tsx`.

**Spec:** artifact items 3 and 9 (decisions Q2, Q6, Q7). Money is `Decimal` in the backend and decimal strings in
the frontend.

**Test commands:** backend `cd backend && python -m pytest <files> -q 2>&1 | tail -8`;
frontend `cd frontend && npx vitest run <files> 2>&1 | tail -20`.

---

### Task P5-T1: Fund manager values split equally, grouped by manager and AMC (backend) (run R9)

**Files:**
- Modify: `backend/app/services/analytics/fund_manager_allocation.py` (function at 32; per-scheme values 66-70; grouping loop 72-91; sort 93-104); `backend/app/services/analytics/schemas.py` (366-392)
- Test: `backend/tests/services/analytics/test_fund_manager_allocation.py`, `test_recompute_fund_manager_section.py`

**Interfaces:**
- Produces: `def _split_equally(value: Decimal, parts: int) -> list[Decimal]` — each part is `(value / parts)` rounded **down** to `0.01`; the leftover paise are added to the first part so `sum(parts) == value` exactly; `parts < 1` raises `ValueError`.
- Schema: `ManagerGroup` gains `amc_name: str = ""` and `percentage: str = "0.00"`; its existing fields stay (`funds` stays populated; each `ManagerFundRow.household_value` is now that manager's share of the fund, so a manager's rows add to their total).
  `FundManagerAllocationSummary` gains `portfolio_value: str = "0.00"`, `covered_value: str = "0.00"`, `covered_percentage: str = "0.00"`.
- Rules: group by `(manager_name, amc_name)` with `amc_name` from the holding; a fund's value (combined across members, as today) is split with `_split_equally` among its managers in `sequence_order` order;
  `portfolio_value` = the sum of **all** holdings' current values (including funds with no manager data); `percentage = total / portfolio_value × 100` quantized to `0.01` (`"0.00"` when the portfolio is zero);
  `covered_value` = the sum of manager totals divided back to funds (equals the value of funds that have manager data); `covered_percentage` likewise; sort by total descending, ties by manager name;
  a fund with no manager rows in the three-month window stays in `unavailable_schemes` and in no manager row.

- [ ] **Step 1: Failing tests:**
  - `test_split_equally_adds_back_to_the_value_to_the_paisa`: `_split_equally(Decimal("100.00"), 3) == [Decimal("33.34"), Decimal("33.33"), Decimal("33.33")]`; `parts=1` returns the value; `_split_equally(Decimal("0.01"), 2) == [Decimal("0.01"), Decimal("0.00")]`; `parts=0` raises `ValueError`.
  - `test_two_managers_on_one_fund_each_get_half`: fund ₹1,00,000, two managers → each `"50000.00"`.
  - `test_a_manager_on_two_funds_sums_the_shares`: funds Alpha Flexi Cap ₹1,00,000 (Anita, Vikram), Alpha Value ₹1,00,000 (Anita), Beta Large Cap ₹2,00,000 (Dev) → Anita `"150000.00"`/`"37.50"`, Vikram `"50000.00"`/`"12.50"`, Dev `"200000.00"`/`"50.00"`; `covered_percentage == "100.00"`.
  - `test_five_managers_on_one_fund_share_it_and_add_back`.
  - `test_percentage_uses_the_whole_portfolio_including_funds_without_manager_data`: add an unavailable fund of ₹50,000 → `portfolio_value == "450000.00"`, Dev `"44.44"`, `covered_percentage == "88.89"`, the fund listed under `unavailable_schemes`.
  - `test_a_manager_at_two_amcs_gets_one_row_per_amc`.
  - `test_managers_are_sorted_by_value_then_name`.
  - `test_a_fund_with_no_manager_rows_is_unavailable_not_zero`.
  - `test_new_summary_fields_default_for_old_payloads`.
  - Update the existing expectations that assumed a fund's full value under every manager (`…groups_by_manager_and_sums_value`, `…a_fund_held_by_two_members_appears_once_with_their_combined_value`, `…a_managers_role_is_per_fund…`).
- [ ] **Step 2: Run** the two files — expect FAIL.
- [ ] **Step 3: Implement** the helper and the changed grouping and totals.
- [ ] **Step 4: Run** both files and `tests/services/analytics/test_recompute.py` — expect PASS.
- [ ] **Step 5: Commit** (D1) `feat: fund manager values divided among a fund's managers, with AMC and portfolio share`.

### Task P5-T2: Fund manager table (frontend) (run R9)

**Files:**
- Modify: `frontend/src/features/analytics/FundManagerSection.tsx` (58-123); `types.ts` (`ManagerGroup` at 386, `FundManagerAllocationSummary` at 399)
- Test: `frontend/src/features/analytics/FundManagerSection.test.tsx`

**Interfaces:**
- Types: `ManagerGroup.amc_name?: string; ManagerGroup.percentage?: string`; `FundManagerAllocationSummary.portfolio_value?: string; .covered_value?: string; .covered_percentage?: string` (optional for old payloads).
- Rendering: a table with exactly four columns **Fund manager | AMC | Current value | % of portfolio**; a total row labelled `Covered by manager data` showing `covered_value` and `covered_percentage`; the footnote `Funds with more than one manager are divided equally between them.`; the existing "Fund manager data for these schemes isn't available yet." list stays. No role badges, no expandable fund list. `printMode` renders the same table.
  Old payload (no `percentage`): AMC and % show `—`, value shows `total_household_value`, no crash.

- [ ] **Step 1: Failing tests:** `"shows exactly four columns"` (header texts); `"shows each manager's AMC, value and share"` (Anita, Alpha Mutual Fund, `₹1,50,000`, `37.5%`); `"shows the covered total row and the equal-split footnote"`; `"keeps the not-available list"`; `"print mode shows the same table"`; `"an old payload without AMC and percentage renders dashes, not NaN"`; `"skeleton while loading"`. Replace the old card and expand tests (lines 21-70 today).
- [ ] **Step 2: Run** the file — expect FAIL.
- [ ] **Step 3: Implement** with `components/ui/table.tsx`; delete the expand state.
- [ ] **Step 4: Run** `FundManagerSection.test.tsx`, `AnalyticsView.test.tsx`, `npx tsc -b`.
- [ ] **Step 5: Commit** (D1) `feat: fund manager section is one four-column table`.

### Task P5-T3: TER yearly cost and per-fund rows (backend) (run R10)

**Files:**
- Modify: `backend/app/services/analytics/ter.py` (`_summarize` 54, `compute_weighted_ter` 98, `compute_direct_regular_ter_comparison` 103); `backend/app/services/analytics/schemas.py` (114-130)
- Test: `backend/tests/services/analytics/test_ter.py`

**Interfaces:**
- Produces in `schemas.py`: `class FundTerRow(BaseModel): scheme_id: str; scheme_name: str; plan_type: str | None; ter: str | None; value: str; cost_1y: str | None; cost_3y: str | None; cost_5y: str | None`.
- `WeightedTerSummary` gains `cost_1y: str | None = None`, `cost_3y: str | None = None`, `cost_5y: str | None = None`, `funds: list[FundTerRow] = Field(default_factory=list)`.
- Rules: per fund, `cost_1y = (value × ter / 100)` rounded half-up to `0.01`; `cost_3y = cost_1y × 3` and `cost_5y = cost_1y × 5` (exact multiples of the rounded yearly cost, so rows add exactly);
  every summary's `cost_*` is the **sum of its funds' rounded costs** (not a separately rounded total); `None` when nothing is covered.
  `funds` is filled **only** by `compute_weighted_ter` (the portfolio summary): one row per scheme with the members' holdings combined, sorted by value descending; funds with no TER have `ter`/costs `None`, appear in `funds`, and stay out of totals.
  The Direct and Regular summaries get `cost_*` but `funds == []`. `plan_type` comes from the `Scheme` row (check whether `HoldingRow` carries it before adding a lookup).
  `_summarize`'s signature may gain what it needs; keep `weighted_ter` unchanged.

- [ ] **Step 1: Failing tests:**
  - `test_yearly_cost_is_value_times_ter_per_fund`: ₹4,00,000 at `0.65` → `cost_1y "2600.00"`, `cost_3y "7800.00"`, `cost_5y "13000.00"`.
  - `test_totals_equal_the_sum_of_the_fund_rows`: funds ₹4,00,000@0.65, ₹3,50,000@1.10, ₹2,00,000@0.90 and ₹50,000 with no TER → `cost_1y "8250.00"`, `cost_3y "24750.00"`, `cost_5y "41250.00"`, `weighted_ter "0.87"`, four rows in `funds`, the no-TER row has `ter is None`.
  - `test_direct_plus_regular_costs_add_up_to_the_portfolio`: Direct `2600.00` + Regular `5650.00` equals the portfolio `8250.00` (assert on the three summaries from `compute_direct_regular_ter_comparison` and `compute_weighted_ter`).
  - `test_a_fund_without_ter_is_listed_and_left_out_of_totals`.
  - `test_a_fund_held_by_two_members_is_one_row_with_combined_value`.
  - `test_nothing_covered_gives_no_costs`: `cost_1y is None`, `funds` still lists the holdings.
  - `test_rounding_adds_exactly`: ₹3,33,333.33 at `0.75` → `cost_1y "2500.00"`, `cost_3y "7500.00"`.
  - `test_new_fields_default_for_old_payloads`.
- [ ] **Step 2: Run** `test_ter.py` — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `test_ter.py` and `tests/services/analytics/test_recompute.py` — expect PASS.
- [ ] **Step 5: Commit** (D1) `feat: TER yearly cost in rupees and per-fund rows`.

### Task P5-T4: TER rupees on the cards and the fund-wise table (frontend) (run R10)

**Files:**
- Modify: `frontend/src/features/analytics/TerSection.tsx` (cards 79-176; below the bars); `types.ts` (`WeightedTerSummary` at 24)
- Create: `frontend/src/features/analytics/FundTerTable.tsx`, `FundTerTable.test.tsx`
- Test: `frontend/src/features/analytics/TerSection.test.tsx`

**Interfaces:**
- Types: `FundTerRow { scheme_id; scheme_name; plan_type: string | null; ter: string | null; value: string; cost_1y: string | null; cost_3y: string | null; cost_5y: string | null }`; `WeightedTerSummary.cost_1y?`, `.cost_3y?`, `.cost_5y?` (`string | null`), `.funds?: FundTerRow[]` — all optional.
- Cards: under each card's percentage, when `cost_1y` is present, `₹8,250 / year at today's value` (portfolio, Direct and Regular cards).
- `FundTerTable({ funds, summary }: { funds: FundTerRow[]; summary: WeightedTerSummary })`: columns **Fund | TER | Your value | Next 1 year | Next 3 years | Next 5 years**; funds without a TER show `—` in TER and the three cost columns; a totals row `Total (N funds with a TER)` using the summary's `cost_*` and covered value; under the table `Projected fees if your value and each fund's TER stay as they are today. Not a forecast of returns.` and, when any fund has no TER, `N funds without a TER are not included.`; the table scrolls sideways inside its container on a phone.
  Old payload (no `funds`, no `cost_*`): no table, no ₹ lines, no crash.

- [ ] **Step 1: Failing tests:** cards show `₹8,250 / year` (and Direct `₹2,600`, Regular `₹5,650`); the table shows the three funds with `₹2,600`, `₹7,800`, `₹13,000` for the first and dashes for the no-TER fund; the totals row reads `₹8,250`, `₹24,750`, `₹41,250`; both notes appear; an old payload renders without the table and without NaN; `printMode`-equivalent (the section is the same component) shows the table.
- [ ] **Step 2: Run** `FundTerTable.test.tsx` and `TerSection.test.tsx` — expect FAIL.
- [ ] **Step 3: Implement** the table (decimal strings only, `formatIndianCurrency`) and the card lines.
- [ ] **Step 4: Run** both files, `AnalyticsView.test.tsx`, `npx tsc -b`.
- [ ] **Step 5: Commit** (D1) `feat: TER in rupees on the cards and a fund-wise cost table`.

---

### P5 verification gate

- [ ] All P5 test files together once; `npx tsc -b` clean.
- [ ] Review gate for R9 and R10 via `/codex:adversarial-review` (manual relay warning).
- [ ] Synthetic check added to `ux_checks.py` (Claude), run on `r2…`, `big_family…`, `p20_10yr.pdf`:
  `Σ funds.cost_1y == summary.cost_1y`; Direct + Regular `cost_1y` == portfolio `cost_1y` (for `p20_10yr`, which holds both); `covered_percentage ≤ 100` and `Σ manager totals == covered_value`;
  `p20_10yr` shows the HDFC Flexi Cap Direct and Regular funds as one manager list entry set with each fund split across its managers (a manager appearing in both is summed).


## Phase P6: History Graph Hover, Click and Month Detail


**Goal:** Make the History graph interactive: a hover marker and tooltip, a click that opens a month-detail
pop-up (per-fund values, what moved the portfolio that month: new money vs market movement), and keyboard and
phone behaviour. Fix the partial-month cost distortion on the way.

**Architecture:** One shared month-valuation function in `services/dashboard/snapshots.py` used by both the stored
month-end snapshots and a new on-click month-detail computation (decision Q18: computed on click, no new table).
Two read-only endpoints return the detail. The chart is rewritten around a pointer scrubber modelled on
`FundSignal.tsx`.

**Tech Stack:** FastAPI/SQLAlchemy/pytest; React/vitest, existing `components/Modal.tsx`.

**Spec:** artifact item 12 (decisions Q18–Q22). Current code: `frontend/src/features/history/{HistoryChart,HistoryView,api}.tsx|ts`
(chart is a plain SVG, 65 lines, `data-point` circles); `backend/app/services/dashboard/snapshots.py`
(`_compute_member_months`, `get_snapshots`); endpoints in `backend/app/api/dashboard.py:249` and `:309`;
schemas in `backend/app/services/dashboard/schemas.py:149`.

**Test commands:** backend `cd backend && python -m pytest <files> -q 2>&1 | tail -8`;
frontend `cd frontend && npx vitest run <files> 2>&1 | tail -20`.

---

### Task P6-T1: Click-time gate, shared month valuation, partial-month cost fix (backend) (run R11)

**Files:**
- Modify: `backend/app/services/dashboard/snapshots.py` (month loop inside `_compute_member_months`)
- Create: `backend/scripts/measure_month_detail.py` (read-only timing script)
- Test: `backend/tests/services/dashboard/test_snapshots.py`

**Interfaces:**
- Produces: `@dataclass FundMonthValue: scheme_id: uuid.UUID; scheme_name: str; units: Decimal; nav: Decimal | None; nav_date: date | None; value: Decimal; cost: Decimal; priced: bool`
  and `def value_month(month_end: date, folios, states: dict, schemes: dict, series: dict, dates: dict) -> list[FundMonthValue]` — the per-folio body of today's loop, extracted unchanged except for the cost fix below.
  `_compute_member_months` calls it and sums; its stored output must be identical to today's for every fully-priced month.
- **Cost fix (decided in the artifact):** a fund with no price on the month-end (`priced == False`) contributes **neither value nor cost** to that month's totals (today it adds cost but no value, which distorts the shaded area); it is still listed in `missing_scheme_ids`.

- [ ] **Step 1: Failing tests:**
  - `test_value_month_returns_one_row_per_held_folio_with_units_nav_value_cost`.
  - `test_unpriced_fund_adds_no_cost_and_no_value_and_is_flagged`: month where fund B has no NAV yet → snapshot `invested_value` excludes B's cost, `is_partial` true, B in `missing_scheme_ids`.
  - `test_fully_priced_months_unchanged_by_the_refactor`: compare against a stored expectation computed before the refactor on an existing fixture.
  - `test_month_end_that_is_not_a_trading_day_uses_the_last_earlier_nav`.
  - `test_zero_nav_is_a_real_value` (keeps the existing segregated-portfolio behaviour).
- [ ] **Step 2: Run** `tests/services/dashboard/test_snapshots.py` — expect FAIL.
- [ ] **Step 3: Implement** the extraction and fix.
- [ ] **Step 4: Run** the file plus `tests/services/dashboard/test_dashboard_api.py` (or the file that covers the snapshots endpoints; find it with `grep -ln snapshots backend/tests -r`) — expect PASS.
- [ ] **Step 5 (Claude): the click-time gate (D6).** Write `scripts/measure_month_detail.py` which, for a member id, times `get_month_detail` (from P6-T2) 10 times over different months and prints the median and worst. Run it **after P6-T2** against the local database loaded with `big_family_ayush_anand_7yr.pdf` (46 funds). If the median exceeds the D6 threshold, **stop** and raise Q18 option B (store per-fund month rows) with the user. Record the numbers in the handoff.
- [ ] **Step 6: Commit** (D1) `refactor: shared month valuation; an unpriced fund adds no cost to a month`.

### Task P6-T2: Month-detail endpoints (backend) (run R11)

**Files:**
- Modify: `backend/app/services/dashboard/snapshots.py` (new `get_month_detail`, `get_aggregate_month_detail`), `backend/app/services/dashboard/schemas.py`, `backend/app/api/dashboard.py`
- Test: `backend/tests/services/dashboard/test_month_detail.py` (new), `backend/tests/api/test_dashboard_snapshots_api.py` (new or the existing file that covers snapshots)

**Interfaces:**
- Consumes: `value_month` (P6-T1); `direction_for(txn)` from `app/services/analytics/investment_withdrawal.py` (P3-T1) returning `opening/reversal/invested/withdrawn/switched_in/switched_out/None`.
- Schemas: `MonthFundRow(scheme_id, scheme_name, household_member_id, household_member_name, units, nav, nav_date, value, cost, change_in_value, new_money, switched_net, market_movement, priced: bool)` all money as decimal strings; `MonthDetail(month: date, previous_month: date | None, total_value, previous_value, change, new_money, market_movement, switched_in, switched_out, is_partial, missing_scheme_names, funds: list[MonthFundRow])`.
- Endpoints: `GET /household-members/{member_id}/snapshots/{month}` (`require_member` first) and `GET /household/aggregate/snapshots/{month}`; `month` is `YYYY-MM-DD` and must be a month-end that the snapshots list contains, else **404**; a malformed date is 422.
- Rules: for each fund, `change_in_value = value − previous_value` (previous month's value of the same fund, 0 if not held then); `new_money = Σ invested − Σ withdrawn` over transactions in `(previous month-end, month-end]` classified by `direction_for` (opening balances and reversals follow P3's rules; merger conversions are ignored);
  `switched_net = switched_in − switched_out`; `market_movement = change_in_value − new_money − switched_net`. Portfolio totals are the sums of the rows, so **`change == new_money + market_movement`** and, across the whole portfolio, `switched_net == 0` (up to the paisa) when both legs are in the household.
  First month: `previous_month is None`, previous values 0. Funds sold out during the month stay in the list with value 0. Unpriced funds appear with `priced=false`, value/market movement `null`, and are named in `missing_scheme_names`.
  Aggregate: rows from every member, merged into one list (a fund held by two members is two rows, one per member).

- [ ] **Step 1: Failing tests:**
  - `test_totals_equal_the_sum_of_the_fund_rows`.
  - `test_change_equals_new_money_plus_market_movement` on a fixture with a SIP, a lumpsum, a redemption and a price move.
  - `test_a_switch_moves_value_between_funds_and_nets_to_zero`.
  - `test_first_month_has_no_previous_month`.
  - `test_a_fund_sold_out_in_the_month_is_listed_with_zero_value`.
  - `test_a_switch_posting_in_the_next_month_lands_in_that_month`.
  - `test_an_unpriced_fund_is_flagged_not_zero_valued`.
  - `test_unknown_month_is_404_and_malformed_month_is_422`.
  - `test_member_of_another_user_is_404` (ownership).
  - `test_aggregate_merges_members_one_row_per_member_per_fund`.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** `get_month_detail(db, member_ids: list[uuid.UUID], month: date) -> MonthDetail | None` (shared by both endpoints; the member endpoint passes one id) and the routes. Reuse the transaction loader and FIFO pass the snapshot code already uses; do not add a second one.
- [ ] **Step 4: Run** the new test files plus `test_snapshots.py` — expect PASS. Then do the P6-T1 Step 5 timing.
- [ ] **Step 5: Commit** (D1) `feat: month-detail endpoints for the History pop-up`.

### Task P6-T3: Frontend API, types and a shared chart-pointer helper (run R12)

**Files:**
- Modify: `frontend/src/features/history/api.ts`, `frontend/src/features/dashboard/api.ts` (+ `types.ts`), `frontend/src/components/FundSignal.tsx:89`, `frontend/src/mobile/features/holdings/MobileFundDetailView.tsx:46`
- Create: `frontend/src/lib/chartPointer.ts`, `chartPointer.test.ts`
- Test: `frontend/src/features/history/api.test.ts`

**Interfaces:**
- `chartPointer.ts`: `export function indexFromClientX(clientX: number, rect: { left: number; width: number }, pointCount: number, chartWidth: number, padX: number): number` — the closed-form inverse from `FundSignal.tsx:89`, same behaviour, `padX` passed in. Both existing callers import it (behaviour unchanged; their tests still pass).
- `HistoryPoint` gains `valueText: string; investedText: string | null` (decimal strings) next to the existing numbers (kept for plotting only).
- `MonthDetail`/`MonthFundRow` TS types mirroring P6-T2 (money as strings); `getMemberMonthDetail(memberId, month)` and `getAggregateMonthDetail(month)` in `dashboard/api.ts`.

- [ ] **Step 1: Failing tests:** `chartPointer.test.ts` (clamps below 0 and above width, one point returns 0, rounds to nearest index, zero-width rect returns 0); `api.test.ts` — `toPoints` keeps `valueText` exactly as the decimal sum (`"1234.50"`), and the two new fetchers call the right URLs.
- [ ] **Step 2: Run** the two files — expect FAIL.
- [ ] **Step 3: Implement** and switch both existing callers to the shared helper.
- [ ] **Step 4: Run** `chartPointer.test.ts`, `api.test.ts`, `FundSignal.test.tsx`, `MobileFundDetailView.test.tsx`, `npx tsc -b`.
- [ ] **Step 5: Commit** (D1) `refactor: shared chart pointer helper; History API types and fetchers`.

### Task P6-T4: Interactive History chart (run R12)

**Files:**
- Modify: `frontend/src/features/history/HistoryChart.tsx` (rewrite), `HistoryView.tsx`, `frontend/src/features/history/HistoryView.test.tsx`
- Create: `frontend/src/features/history/HistoryChart.test.tsx`

**Interfaces:**
- `HistoryChart({ points, onSelectMonth, selectedMonth }: { points: HistoryPoint[]; onSelectMonth: (month: string) => void; selectedMonth: string | null })`.
- Behaviour: pointer move snaps a vertical guide and marker to the nearest month (via `indexFromClientX`) and shows a tooltip with `Mar 2024`, `Portfolio value ₹…`, `Cost of holdings ₹…`, and the gain (value − cost) when `investedText` exists; a partial month's tooltip names the missing funds. Click selects and calls `onSelectMonth`. Arrow keys move the guide, Enter selects, Escape clears (the SVG is focusable with an `aria-label`).
  Axes: y-axis labels (₹ compact, e.g. `₹50L`) and x-axis year ticks; legend: solid line `Portfolio value`, shaded area `Cost of holdings` (renamed from the unlabelled area). Subtitle: `Month-end values · latest {formatted last month-end}`.
  Phone: pointer events work with touch; first tap shows the tooltip/card, a "See details" button on that card or a second tap on the same month calls `onSelectMonth` (Q21).
  Old/edge data: one month, no `invested`, all-partial months render without NaN.

- [ ] **Step 1: Failing tests (rewrite the old ones that count `data-point`):** hover shows the tooltip with the exact formatted value and cost; the tooltip gain is `diffDecimalStrings` of the two texts (no float); a partial month's tooltip lists the funds; click calls `onSelectMonth` with the ISO month; ArrowRight/ArrowLeft/Enter/Escape behave; legend reads `Cost of holdings`; one-month series renders; points without `invested` hide the cost line, area and gain; first-tap shows the card and second-tap selects on a touch pointer; subtitle names the last month-end.
- [ ] **Step 2: Run** `HistoryChart.test.tsx`, `HistoryView.test.tsx` — expect FAIL.
- [ ] **Step 3: Implement** with plain SVG (no new library); `parseFloat` only for coordinates.
- [ ] **Step 4: Run** both files and `npx tsc -b`.
- [ ] **Step 5: Commit** (D1) `feat: History chart hover, selection and keyboard support`.

### Task P6-T5: Month-detail pop-up (run R12)

**Files:**
- Modify: `frontend/src/components/Modal.tsx` (+ `Modal.module.css`, `Modal.test.tsx`): add `variant?: "center" | "sheet"` (default `"center"`, existing callers unchanged); `"sheet"` anchors to the bottom of the viewport on phones.
- Create: `frontend/src/features/history/HistoryDetailModal.tsx`, `HistoryDetailModal.test.tsx`
- Modify: `HistoryView.tsx` (fetch on select, loading and error states)

**Interfaces:**
- `HistoryDetailModal({ detail, viewMode, onClose }: { detail: MonthDetail; viewMode: "member" | "aggregate"; onClose: () => void })`.
- Content: title `March 2024`; tiles `Portfolio value`, `Change this month`, split into `New money` and `Market movement` (negative shown `-₹…`, with the sentence `Market movement is what is left after new money and switches.`); a `Switched between funds ₹X in/out` line only when non-zero; fund table: Fund | Units | NAV (date) | Value | Cost | Change | Market movement, sorted by value descending, sold-out funds last; unpriced funds show `—` and `No price for this month`; a partial-month banner naming the funds.
  Family view: one merged list with member filter buttons (`All` + each member); totals above the table follow the filter (computed from rows with `sumDecimalStrings`, matching the unfiltered totals when `All`).
  Uses `Modal variant="sheet"` below the phone breakpoint and the centre modal above it. Loading shows a skeleton; a failed fetch shows `Couldn't load this month. Try again.` with a retry button.

- [ ] **Step 1: Failing tests:** tiles show the API figures and the explanatory sentence; funds listed in value order with dashes for unpriced ones; the member filter changes the table and totals, `All` restores the API totals; a negative market movement renders `-₹…`; the switched line is hidden when zero; partial banner; loading, error and retry; Escape closes; `Modal.test.tsx` — default variant unchanged, `sheet` adds the sheet class.
- [ ] **Step 2: Run** `HistoryDetailModal.test.tsx`, `Modal.test.tsx` — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both, `HistoryView.test.tsx`, `FundScoreDetailModal.test.tsx` (the other `Modal` user), `npx tsc -b`.
- [ ] **Step 5: Commit** (D1) `feat: History month-detail pop-up`.

### Task P6-T6: Synthetic checks (run R12, Claude)

**Files:**
- Modify: `Docs/CAS Files/synthetic/harness/ux_checks.py` (created in P3-T5)

- [ ] **Step 1:** add six invariants, run on `r2_couple_rohan_priya_10yr.pdf`, `big_family_ayush_anand_7yr.pdf`, `p20_10yr.pdf` for every month and for the family view:
  (1) `change == new_money + market_movement`; (2) Σ fund `value` == `total_value` of the matching stored snapshot; (3) switches net to zero across the household; (4) Σ new money across all months equals the P3 `net_invested` for the same period (minus opening holdings); (5) a partial month lists exactly the unpriced funds; (6) the first month has no previous month.
- [ ] **Step 2:** run; every check passes. Record in the handoff.

---

### P6 execution notes (2026-10-20, from the Run 12 Opus review and the timing gate)

**Final `MonthDetail` contract (binding for P6-T3 to T6; supersedes the plan's earlier field list):** `month`, `previous_month`, `total_value`, `previous_value`, `change` (**nullable**), `new_money`, `opening_holdings`, `switches_net`, `gifts_net`, `market_movement` (**nullable**), `switched_in`, `switched_out`, `is_partial`, `missing_scheme_names`, `funds[]`. Rows (`MonthFundRow`) add `opening_holdings`, `switched_net`, `gifts_net`. **The identity is `change = new_money + opening_holdings + switches_net + gifts_net + market_movement`** (market movement is the residual). For a partial month (a fund with no comparable price this month or last) `change` and `market_movement` are `null`: the pop-up shows them as unavailable with the banner naming the funds, never a figure. The pop-up shows an "Opening holdings" line only in a month where it is non-zero, a "Switches (net)" line only when `switches_net` is non-zero (a switch whose legs fall in different months or differ in amount), and a "Gifted units" line only when `gifts_net` is non-zero. Opening balances are not new money; gifts are not new money. A gift with no recorded amount cannot be valued and stays inside market movement (known limit). **`missing_scheme_names` / `is_partial` mean "no comparable price"**: a fund with no price at this month-end, or one held at the previous month-end without a price there (priced now, or sold out in the month); the banner reads "Incomplete prices".
**Decisions (user, 2026-10-20):** switches get their own line (market movement stays the residual); gifts get their own line; a partial month blanks `change` too; click speed: optimise first, re-measure.
**P6-T1 Step 5 (click-time gate, D6), done.** Before optimisation the family view failed (median 1,433 ms; Ayush 740, Anand 931). After the click path was made read-only (stored months are read without a rebuild/rewrite when only some month is partial; no network price fetch and no commit on a click; one history walk per member; NAVs read only up to the clicked month) the same 46-fund synthetic account measured on SQLite: Ayush median 656 ms (worst 1,117), Anand 441 ms (worst 616), **aggregate 977 ms (worst 1,540)** against the 1,000 ms limit: PASS, but only just, and on this machine's slow `/mnt/c` disk with SQLite. The click-time number must be re-measured on staging (PostgreSQL) after deploy; if the family view is over 1 s there, the next step is Q18 option B (stored per-fund month rows). The pop-up must show a loading state regardless. Script: `backend/scripts/measure_month_detail.py` (read-only guard, `--aggregate`, `--limit`); harness: `Docs/CAS Files/synthetic/harness/test_month_detail_timing.py`.

### P6 verification gate

- [ ] All P6 backend and frontend test files together once; `npx tsc -b`; `npx oxlint` on touched files.
- [ ] D6 timing recorded; gate passed or Q18 option B raised.
- [ ] Review gate for R11 (**Opus review**, shared calculation) and R12 via `/codex:adversarial-review` (manual relay warning).
- [ ] Browser check by the user on staging after deploy: hover, click, keyboard, phone width, family view filter.

## Decisions (answered 2026-10-20)

- **D1 Commits:** one commit per task by Claude, explicit paths, **never push**.
- **D2 Branch:** all work on the current branch `feat/leapswitch-staging` (no new branch; `main` is 926 commits behind and lacks migrations 0003-0041).
- **D3 Staging operations:** separate user-confirmed deploy-guide steps, not part of the runs (default, not yet separately confirmed).
- **D4 Portfolio label colours:** High green / Moderate slate / Needs Review amber, same ramp as the tier badges.
- **D5 Opus:** approved for R4, R5, R11 and R14.
- **D6 History click-time gate:** 1 second median (default, not yet separately confirmed).
- **D7 Score explainer copy:** Claude drafts, the user reviews the text in the diff before it ships (default, not yet separately confirmed).

## Final tasks

### F1: Documentation (R13, Claude)
- [ ] Update `Docs/PRD-04-MF-Analytics-Dashboard.md` for the changed sections, `backend.md` (payload fields,
  new endpoints, migrations 0042/0043), `database.md` (the two migrations), `decisions.md` (the locked decisions
  above), `log.md` (one dated entry), `session.md` (overwrite status). Run no tests; read back the diffs.
- [ ] Commit (D1): `docs: analytics UX fixes — PRD-04, backend, database, decisions, log`.

### F2: Whole-branch gate (R14)
- [ ] Run every phase's affected tests together once; `npx tsc -b`; `npx oxlint` on touched frontend files.
- [ ] Synthetic harness: `r2_couple_rohan_priya_10yr.pdf`, `big_family_ayush_anand_7yr.pdf`, `p20_10yr.pdf`
  through `test_deep.py` with `ANALYTICS=1` and the new `ux_checks.py` (P3-T5, P6-T6); every check passes.
- [ ] `/codex:adversarial-review` over the whole branch diff (manual relay), then Opus review if D5 approved.
- [ ] Write `Docs/orchestration/<date>-staging-deploy-guide-analytics-ux.md` (terminals labelled A tunnel / B db /
  C AWS per command block; start and stop the bastion; migrations 0042/0043; scenario clean-up and recompute
  steps; check on the staging screens listed in the artifact). Do not run any staging step.

## Self-review (run when writing this plan)

- **Spec coverage:** items 1–12 map to P3, P3, P5, P4, P4, P1, P1, P4, P5, P1, P1, P6; fixes 1–7 map to P1 (1, 2, 4, 6, 7) and P2 (3, 5); Q1–Q22 are in "Locked decisions".
- **Type consistency:** `direction_for`/`is_conversion_description` (P3-T1) are consumed by P6-T2;
  `PeriodReturn`/`category_period_averages` (P4-T1) by P4-T2; `formatDateRange` (P1-T7) by P1-T7 only.
- **Proportion:** tasks give signatures, test names and assertions, not bodies.
