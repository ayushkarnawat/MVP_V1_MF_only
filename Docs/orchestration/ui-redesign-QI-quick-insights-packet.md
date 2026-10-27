# Packet QI for Gemini (Antigravity): the Portfolio Quick Insights card, front end (Portfolio plan task 7, Quick Insights part)
**Status:** READY FOR GEMINI (written 27 Oct 2026). **Worker:** Gemini in Antigravity (Flash, high). **Orchestrator and verifier:** Claude Code. **Branch and folder:** `feat/portfolio-page`, in the git worktree `/home/ayush/wt/portfolio-fe` on WSL (open it in Antigravity as `W:\home\ayush\wt\portfolio-fe`). It is stacked on PF1 (the Portfolio page, commit `82d1b976`, green): the page, its sections, `types.ts` and the kit are already on this branch; nobody else works in this folder.
**Parent plan:** `Docs/superpowers/plans/2026-10-23-portfolio-home-page-implementation.md` task 7 (only its Quick Insights half; the Family Members half shipped in PF1). Design: `Docs/orchestration/2026-10-23-portfolio-home-page-design.md` section 2.4 (the five-insight table). Signed-off copy and look: `2026-10-23-portfolio-home-page-hifi-states.html` (the Quick Insights block under Family Members). Register: C119 (Quick Insights deferred until a route exists), C151 (the backend route). **Backend contract:** `Docs/orchestration/ui-redesign-QI-quick-insights-backend-handoff.md` section 5 (response schema) and section 4 (rules Q1 to Q8). **The route is not built yet**: the data in `frontend/src/features/portfolio/fixtures/insights/` are **SPEC fixtures** hand-built from that schema with exact Decimal arithmetic (the marker `FIXTURE_STATUS = "SPEC FIXTURE"`, orchestrator-owned, never edit); they are replaced later by the backend golden files `backend/tests/fixtures/portfolio/insights_*.json` (same names) without any change to your code. The types are in `types.ts` (section "Quick Insights", already written). **This packet is the whole truth for this run: where the plan, the design and this packet differ, this packet wins** (section 6 lists every difference). Method: `Docs/orchestration/2026-10-26-execution-plan-v2.md` sections 2 to 4, and PF1's packet `ui-redesign-PF1-portfolio-page-packet.md` (same rules, same helpers).

## What this run is, in one paragraph
The tests are **already written and committed red** (five test files: the fixture guard, the API function, the copy functions, the card, and the page; plus one edit to the existing `PortfolioPage.test.tsx`: its default fake backend now also answers the insights route and its call count is 6). Write **two new files and make two small edits** so that they pass, one step at a time, running the checkpoint command after every step and keeping the real output. Do not change any test, `types.ts` or a fixture. The card is the last card of the Portfolio page, under Family Members: five one-line insights for the family or the one member being viewed, loaded by its own request, with its own loading and error states, and hidden when there is nothing to say.

## Rules (read twice)
1. **Scope.** Create **only** the two files in section 3 and edit **only** `api.ts` and `PortfolioPage.tsx` in the same folder. Everything else (tests, `types.ts`, fixtures, `package.json`, Home files, other shell files, `FamilyMembers.tsx` and the other PF1 sections) is out of bounds.
2. **Never edit a test to make it pass.** If a test seems wrong, stop and describe it in the report (the orchestrator validated every test against a working solution and against seven deliberate breaks).
3. **Run the checkpoint command after every step** and keep its real output; fix your code, not the test.
4. **No new dependency, no `npm install`.**
5. **No float formatting of money or percentages.** Never write `parseFloat`, `toFixed` or `Intl` in any Portfolio source file, **comments included** (a guard test greps whole file text), and no `console.`. All text comes from `@/lib/format` (`formatRupees`, `formatPercent`); `Number(...)` is not needed here at all.
6. **No hard-coded colours in `.tsx` files** (no `#` followed by hex digits, no `rgb(`/`rgba(`, comments included): CSS variables only.
7. **Do not import another feature.** Portfolio may import only `@/lib/*`, `@/components/*`, `@/shell/*`, `features/auth/session` and its own folder. Nothing from `features/home` or `features/dashboard`.
8. **Exact strings.** Every visible string, accessible name, test id and attribute in section 4 must be used exactly as written (including `—` and `'`).
9. **Do not refactor, rename or "improve" anything outside the file map.** 2-space indentation, double quotes, semicolons, `@/` or relative imports for project code (no `any`).
10. **If anything differs from this packet, stop and report it.**
11. **Run every command inside WSL** (Step 0). Never run two `vitest` or `tsc` commands at the same time; if tests time out under load, rerun with `--maxWorkers=4`.

## Step 0: environment check (do this first, and report the output)
The folder is opened as `W:\home\ayush\wt\portfolio-fe`; **every command (`git`, `npm`, `npx`, `grep`, `cd`) runs inside WSL**: `wsl.exe -d Ubuntu --cd /home/ayush/wt/portfolio-fe -- <command>` for git, `wsl.exe -d Ubuntu --cd /home/ayush/wt/portfolio-fe/frontend -- <command>` for npm/npx; a command containing `|` is run as `... -- bash -c "<command>"`.
Run and report the output of each:
```
git branch --show-current          # expect: feat/portfolio-page
git log --oneline -3               # expect the top line to start with: test(portfolio): failing tests for Quick Insights (QI)
git status --short                 # expect: nothing printed
cd frontend && npx tsc -b          # expect exactly 4 error lines, all in test files: "has no exported member 'getPortfolioInsights'" (insightsApi.test.ts); "Cannot find module './quickInsightsCopy'" and "Parameter 'line' implicitly has an 'any' type" (quickInsightsCopy.test.ts); "Cannot find module './QuickInsights'" (QuickInsights.test.tsx)
npx vitest run src/features/portfolio/fixtures        # expect: Test Files 2 passed (2); Tests 38 passed (38) (the PF1 contract guard and the new spec-fixture guard are green already)
npx vitest run src/features/portfolio                 # expect: Test Files 5 failed | 12 passed (17); Tests 21 failed | 226 passed (247)  (red state: two suites cannot import their module; failing tests: insightsApi 5, PortfolioPage 1, PortfolioPage.insights 15)
npx vitest run src/shell src/App.test.tsx             # expect: Test Files 27 passed (27); Tests 348 passed (348)
npx vitest run src/components/ui/charts src/lib src/styles   # expect: Test Files 16 passed (16); Tests 188 passed (188)
```
Note on the red count: the two suites that cannot import (`quickInsightsCopy.test.ts`, `QuickInsights.test.tsx`) count as failed files with no tests; `PortfolioPage.insights.test.tsx` has 3 tests that already pass (they assert that something is absent); that is expected.
State which way you run commands and whether you can edit files. If any expectation fails, **stop and report**.

## Goal
The **Quick Insights** card of the Portfolio page (`/portfolio`): under the Family Members card, five check-marked one-line insights about the holdings of the family (or the selected member): the largest holding, the spread across AMCs and funds, the Direct/Regular split, the largest AMC exposure, and the active SIPs. It loads by its own request and never blocks, or is blocked by, another section.
**Non-goals:** no change to any other card, to `FamilyMembers.tsx`, to the page error or empty states; no links (the design has none); no per-insight tooltip; no hide-values; nothing computed in the browser (the backend sends every figure; you only format text).

## 3. File map
**Create (2), under `frontend/src/features/portfolio/`:**
- `quickInsightsCopy.ts`
- `sections/QuickInsights.tsx`

**Edit (2), under `frontend/src/features/portfolio/`:**
- `api.ts` (add one import name and one function)
- `PortfolioPage.tsx` (add two imports, one hook, one element)

**Do not touch:** every `*.test.ts(x)` file (including `PortfolioPage.test.tsx`, which the orchestrator already edited), `types.ts`, `fixtures/` (both the PF1 files and `fixtures/insights/`), `package.json`, `package-lock.json`, `src/index.css`, `src/features/home/**`, `src/features/dashboard/**`, `src/shell/**`, `src/components/**`, `src/lib/**`, anything under `backend/` or `Docs/`.
**Tests to satisfy (committed; read each before its step):** `insightsApi.test.ts` (7), `quickInsightsCopy.test.ts` (24), `sections/QuickInsights.test.tsx` (14), `PortfolioPage.insights.test.tsx` (18) and the edited `PortfolioPage.test.tsx` (19); `guards.test.ts` scans your files at the end; `fixtures/insights/fixtures.test.ts` and `fixtures/fixtures.test.ts` are already green.
**Available to import:** `@/lib/format` (`formatRupees`, `formatPercent(value, { digits })`), `@/components/ui/skeleton` (`Skeleton`), lucide icons (`Check`), `./types` (read the "Quick Insights" section at the end first), and what PF1 already has in this folder (`usePortfolioSection`, `api.ts`).

## 4. Specifications

### Step 1: `api.ts`
Add `PortfolioInsightsResponse` to the existing type import and, after `getPortfolioValueSeries`, one function:
```ts
export async function getPortfolioInsights(
  scope: PortfolioScopeArg,
  signal?: AbortSignal
): Promise<PortfolioInsightsResponse> {
  const res = await authFetch(portfolioPath(scope, "portfolio-insights"), { signal });
  return res.json();
}
```
`portfolioPath` needs no change (the section name `"portfolio-insights"` is already in the `PortfolioSectionName` union): aggregate gives `/household/aggregate/portfolio-insights`, member gives `/household-members/<encoded id>/portfolio-insights`, no query string.
**Checkpoint 1** (from `frontend/`): `npx vitest run src/features/portfolio/insightsApi.test.ts` → expect **7 passed**.

### Step 2: `quickInsightsCopy.ts`
Pure functions; read `quickInsightsCopy.test.ts` (24 tests). Exports:
```ts
export type InsightId = "largest-holding" | "spread" | "plan-split" | "largest-amc" | "sips";
export interface InsightPart { text: string; bold: boolean }
export interface InsightLine { id: InsightId; parts: InsightPart[] }
export function countLabel(count: number, one: string, many: string): string
export function insightLines(insights: PortfolioInsights): InsightLine[]
export function insightText(line: InsightLine): string
export function hasInsights(data: PortfolioInsightsResponse): boolean
```
- `countLabel`: `` `${count} ${count === 1 ? one : many}` `` (zero uses the plural).
- `insightLines` returns the lines **in this order**, leaving out a line whose rule fails (never a placeholder, never a zero). It must not change its argument. Percent text always comes from `formatPercent(value, { digits })` on the backend's decimal string (it rounds half up on the text: `62.5000` with 0 digits gives `63%`); money from `formatRupees` (`118000.00` gives `₹1,18,000`).
  1. `largest-holding`, when `largest_holding` is not null: parts `Your largest holding is ` (plain), the `fund_name` (**bold**), then plain `` ` — ${formatPercent(pct_of_portfolio, { digits: 1 })} of your total portfolio` `` (the dash is an em dash with a space on each side). Example: `Your largest holding is Parag Parikh Flexi Cap Fund - Direct Plan - Growth — 33.0% of your total portfolio`.
  2. `spread`, when `spread.fund_count > 0`: plain `Spread across `, bold `countLabel(amc_count, "AMC", "AMCs")`, plain ` and `, bold `countLabel(fund_count, "fund", "funds")`. Example: `Spread across 5 AMCs and 6 funds`; one of each gives `Spread across 1 AMC and 1 fund`.
  3. `plan-split`, when `plan_split` is not null: bold `` `${formatPercent(direct.pct, { digits: 0 })} Direct` ``, plain `` `, ${formatPercent(regular.pct, { digits: 0 })} Regular` ``. Direct and Regular are always written (even `0% Regular`). **Unclassified:** let `u = formatPercent(unclassified.pct, { digits: 0 })`; only when `u !== "0%"` add a third plain part `` `, ${u} Unclassified` `` (a share that rounds to zero is not mentioned). Example: `69% Direct, 30% Regular`.
  4. `largest-amc`, when `largest_amc` is not null: plain `Your largest single AMC exposure is `, bold `` `${amc_name} at ${formatPercent(pct_of_portfolio, { digits: 0 })}` `` (the AMC name exactly as the backend sends it). Example: `Your largest single AMC exposure is HDFC Mutual Fund at 46%`.
  5. `sips`, only when `sips.active_count > 0`: bold `formatRupees(monthly_total)`, plain ` in active SIPs scheduled this month`. Example: `₹17,000 in active SIPs scheduled this month`.
- `insightText(line)`: the parts' texts joined with nothing in between.
- `hasInsights(data)`: `!data.empty && insightLines(data.insights).length > 0`.
**Checkpoint 2:** `npx vitest run src/features/portfolio/quickInsightsCopy.test.ts` → expect **24 passed**.

### Step 3: `sections/QuickInsights.tsx`
Export `QuickInsights` and `QuickInsightsProps` = `{ status: "loading" | "error" | "data"; data: PortfolioInsightsResponse | null; onRetry: () => void }`. Read `QuickInsights.test.tsx` (14 tests). Card class: `rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5` (the same as the Allocation and Family cards).
- **Loading:** `<section role="status" aria-label="Loading quick insights">` with a title skeleton (`h-6 w-36`) and three line skeletons (`Skeleton`).
- **Error, or `data` null:** a card with `<h4>Couldn't load your quick insights</h4>`, the text `This section failed to load, but the rest of the page is unaffected.` and a button `Retry` (`onRetry`); the same shape as the Family card's error.
- **Nothing to say:** when `hasInsights(data)` is false, return `null` (the card is not drawn at all: no heading, no message). This covers `empty` true (either reason) and a response from which no line survives.
- **Data:** `<section aria-labelledby="insights-title">` holding a header row (title left, subtitle right, baseline aligned, wraps on a phone): `<h3 id="insights-title">Quick Insights</h3>` and a small muted `<span>` with `From your current holdings`. Then `<ul aria-label="Quick insights">` with one `<li data-testid={`insight-${line.id}`}>` per line of `insightLines(data.insights)`, in order (flex row, gap 10 px, 13 px text, line height 1.5, top aligned). Each `li` holds, first, a decorative check `<span data-testid="insight-check" aria-hidden="true">` (a 17 px round `bg-[var(--pos)] text-white` circle, centred, `shrink-0`, 1 px top margin) containing a lucide `Check` icon (10 px, stroke width 3), and then a `<span>` with the line's parts in order: a **bold** part is a `<b>` element, a plain part is a `<span>` (or text). The `li`'s `textContent` must equal `insightText(line)` exactly (the check has no text). **No link, no button** on a data card.
**Checkpoint 3:** `npx vitest run src/features/portfolio/sections/QuickInsights.test.tsx` → expect **14 passed**.

### Step 4: `PortfolioPage.tsx`
Read `PortfolioPage.insights.test.tsx` (18 tests) and the edited `PortfolioPage.test.tsx` (19). Edits, nothing else:
- import `getPortfolioInsights` from `./api` (next to the other three) and `QuickInsights` from `./sections/QuickInsights`;
- a fifth section hook, placed before the `family` hook, with the same shape as the summary and allocation hooks: `const insights = usePortfolioSection((signal) => getPortfolioInsights(scope, signal), [scopeKey]);` (deps are `[scopeKey]`: it reloads on **every** scope change, family to member and member to member, and shows its loading state with no stale data, exactly like the summary);
- in the "Otherwise" branch of the body, **after** `<FamilyMembers ... />` and still inside the same fragment: `<QuickInsights status={insights.status} data={insights.data} onRetry={insights.retry} />`. It is the last element of the column (the test checks that nothing follows it).
The page error state, the empty state, the retry of the page error (`summary.retry()` and `allocation.retry()` only), the header and every other line stay exactly as they are. Because the hooks always run, the insights request is also sent in the page-error and empty states (the card is simply not drawn there), and the page-error Retry must **not** reload it.
**Checkpoint 4:** `npx vitest run src/features/portfolio/PortfolioPage.insights.test.tsx src/features/portfolio/PortfolioPage.test.tsx` → expect **Test Files 2 passed, Tests 37 passed** (18 + 19). A few "not wrapped in act(...)" warnings are normal.

### Step 5: final checks (from `frontend/`, in this order; paste every output)
```
npx tsc -b                                          # expect: no output
npx oxlint src/features/portfolio                   # expect: no output and exit code 0 (this oxlint prints nothing when clean)
npx vitest run src/features/portfolio               # expect: Test Files 17 passed, Tests 285 passed
npx vitest run src/shell src/App.test.tsx           # expect: Test Files 27 passed, Tests 348 passed
npx vitest run src/components/ui/charts src/lib src/styles   # expect: Test Files 16 passed, Tests 188 passed
npm run build                                       # expect: "built in" with no error (a chunk-size warning is normal)
cd .. && git status --short                         # expect exactly:  " M frontend/src/features/portfolio/PortfolioPage.tsx",  " M frontend/src/features/portfolio/api.ts",  "?? frontend/src/features/portfolio/quickInsightsCopy.ts",  "?? frontend/src/features/portfolio/sections/QuickInsights.tsx"
```
**Do not commit and do not push.** The orchestrator verifies and commits.

## Stop conditions
Stop and report if: Step 0 does not match; a checkpoint still fails after two honest attempts; a test appears to contradict this packet; you would need to edit a file outside section 3; a command needs `npm install`; you are tempted to import Home or Dashboard code.

## 5. Report (fill in at the end, in one fenced block, with the real command outputs)
```
GEMINI REPORT — ui-redesign — QI (Portfolio Quick Insights card, front end)
Model and tool:    Date/time:
0. ENVIRONMENT: WSL terminal or wsl.exe prefix? Could you edit files? Step 0 outputs (all eight):
1. FILES CREATED AND EDITED (exact paths):
2. CHECKPOINTS: for each of 1 to 4, the command and the last lines of its output (passed counts):
3. FINAL CHECKS (step 5), full outputs:
4. ANYTHING THAT DIFFERED FROM THE PACKET, and what you did:
5. TESTS THAT SEEMED WRONG (if any), with the exact failing assertion:
6. THINGS YOU COULD NOT DO OR VERIFY:
7. CONFIRMATIONS: tests untouched (including PortfolioPage.test.tsx): yes/no; types.ts and fixtures untouched: yes/no; files outside the file map untouched: yes/no; nothing imported from features/home or features/dashboard: yes/no; no npm install: yes/no; nothing committed: yes/no
```

## 6. Spec conflicts, defaults and backend asks (not for Gemini; for the orchestrator and the register)
**Conflicts found and how this packet resolves them (precedence: mockup, register and owner decisions, design docs, plan; the backend handoff counts as an owner-approved contract):**
- **Where the card sits.** The hi-fi mockup draws Quick Insights inside the Family Members card, under a divider; the plan puts both in one component (`PortfolioFamilySection`). PF1 already shipped Family Members as its own section with its own loading, error and one-member states, and Quick Insights has its own request, so a failed or empty insights call must not blank the family card and a one-member household must still see its insights. Default: a **separate card directly under Family Members** with the mockup's title, subtitle and check-mark list. Owner may veto and ask to merge them into one card.
- **How it loads.** The plan fetches `/sips`, holdings and allocation in the page and computes in the browser (and may not import the Dashboard); register C151 and the backend handoff replace that with one read route (`portfolio-insights`). Default: one request through the PF1 section-hook pattern, scope = family or member, the browser only formats text.
- **SIP count/total.** The design sums `sip_amount` of active rows; the handoff multiplies by `series_count` so twin SIPs are not under-counted (C151). The front end shows the backend's `monthly_total` untouched.
- **"N AMCs and M funds".** The design says AMCs first, then funds; the response has both counts; the card writes them in that order.
- **Plan/AMC percentages.** The mockup shows whole percents for the plan split and the AMC and one decimal for the largest holding (`18.2%`, `72% Direct`, `HDFC at 24%`). Default: exactly that (0 digits, 0 digits, 1 digit); direct plus regular may then add to 99 or 101 (rounding), accepted.
- **AMC name.** The mockup shortens it ("HDFC"); the backend sends the full AMC name ("HDFC Mutual Fund"). Default: shown as sent, no shortening in the browser.
**Defaults taken, needing register entries (not numbered here):**
1. Quick Insights is its own card under Family Members (see above), with its own request that reloads on every scope change (`[scopeKey]`) and is not repeated by the page-error Retry.
2. Empty scope (`empty` true: no holdings, or holdings without any price) draws **no card and no message**: the design has no copy for it, the page's own empty state covers a zero-holding family, and the backend returns every insight null in that case. A failed request shows the card-level error (same wording pattern as the other cards: "Couldn't load your quick insights").
3. A line the data cannot support is left out, not faked: no SIP line when no SIP is active (never "₹0 in active SIPs"), no spread line when there are no funds, no line for a null insight. Partial responses (a fund without a NAV) are shown like any other: the backend already left that fund out of every figure, and the other cards' "N on last known NAV" chip is not repeated here.
4. Singular wording: `1 AMC`, `1 fund` (the design only shows plurals).
5. Plan split: Direct and Regular are always written; Unclassified (backend Q6, never folded into another entry) is added as `, N% Unclassified` only when it rounds to at least 1%.
6. The lines are plain text: the design has no links (the SIP line could one day point to the SIP page; not built).
7. No "See why" or tooltip per insight; the card subtitle is the mockup's "From your current holdings".
**Backend asks (additive; none blocks the run):** (1) build the route `GET /household/aggregate/portfolio-insights` and `GET /household-members/{member_id}/portfolio-insights` per the handoff, then replace the six spec fixtures in `fixtures/insights/` with the backend golden files (`backend/tests/fixtures/portfolio/insights_*.json`), set `FIXTURE_STATUS` to `"BACKEND GOLDEN"` and update the one assertion on it in `fixtures/insights/fixtures.test.ts` (and the hard-coded family numbers in the front-end tests if the golden household differs); (2) a short AMC name next to `amc_name` if the owner wants the mockup's "HDFC at 24%" (default shows the full name); (3) the SIP sentence says "this month" but the backend `monthly_total` is the sum of the latest instalments of active SIPs, not a calendar-month schedule (handoff Q7): wording kept from the design, flag if the owner wants "per month" instead.
**Verification record (orchestrator, 27 Oct):** PF1 baseline on `82d1b976` before this work: `tsc -b` clean, Portfolio folder 12 files / 200 tests, shell + App 27 / 348, kit (`charts`, `lib`, `styles`) 16 / 188. Red state at the QI commit: Portfolio folder 5 failed | 12 passed files, 21 failed | 226 passed tests (247). The reference solution at `C:\Users\Dell\Desktop\MVP v1\ref\portfolio-fe-ref-qi` passes: `tsc -b` clean, `oxlint src/features/portfolio` silent exit 0, Portfolio folder 17 files / 285 tests (200 PF1 + 22 spec-fixture guard + 7 API + 24 copy + 14 card + 18 page-insights), shell + App 27 / 348 (unchanged), kit 16 / 188, `npm run build` ok. Deliberate breaks of the reference, each caught: unclassified shown whenever its value is above zero (5 tests), SIP line at zero active SIPs (6), `hasInsights` ignoring `empty` (1), largest-holding name not bold (2), check mark not `aria-hidden` (1), insights hook keyed on view mode instead of scope key (1; the first version of the tests missed this one and the member-to-member test was added), singular wording removed (caught by the copy test). Tests added beyond PF1 never change an existing PF1 test except `PortfolioPage.test.tsx` (default fake backend answers the insights route; the family call list gains the insights path and the count goes from 5 to 6).

## 7. Gemini prompt (paste into the Gemini window for folder `W:\home\ayush\wt\portfolio-fe`)
```
You are the front-end builder for the Unifolio UI redesign. Open the folder W:\home\ayush\wt\portfolio-fe (WSL path /home/ayush/wt/portfolio-fe, branch feat/portfolio-page). Before anything else run `git status --short` and `git log --oneline -3`; the first must print nothing and the top commit must be the red-test commit the packet names (test(portfolio): failing tests for Quick Insights (QI)). If not, STOP and report; do not fix it yourself. Read, completely and in order, Docs/orchestration/ui-redesign-QI-quick-insights-packet.md (also at W:\home\ayush\wt\docs\Docs\orchestration\ui-redesign-QI-quick-insights-packet.md). It is the whole truth for this run: do Step 0 first and report its outputs, then follow every step, rule and checkpoint exactly. The tests are already written and red; you create the two implementation files (quickInsightsCopy.ts and sections/QuickInsights.tsx) and edit only the two files the packet names (api.ts and PortfolioPage.tsx), exactly as specified. Never edit a test, fixture or types.ts, never run npm install, never commit. Run every command inside WSL (wsl.exe -d Ubuntu --cd /home/ayush/wt/portfolio-fe ...) and never run two vitest or tsc commands at once. If tests time out under load, rerun with --maxWorkers=4. When done, send the report in the packet's report template with real command outputs. If anything differs from the packet, stop and report it.
```
