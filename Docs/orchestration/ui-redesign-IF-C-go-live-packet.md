# Packet IF-C for Gemini (Antigravity): Individual Fund goes live (the real backend golden fixtures replace the spec fixtures; the Overview and Insights routes stop being placeholders; the category line is put on the fund's own dates)
**Status:** READY FOR GEMINI once the orchestrator has pushed `feat/if-live` (written 28 Oct 2026; the red tests are committed locally as `3711b620`, nothing is pushed). **Worker:** Gemini in Antigravity (Flash, high). **Orchestrator and verifier:** Claude Code. **Branch and folder:** `feat/if-live`, in the git worktree `/home/ayush/wt/if-fe` on WSL (open it in Antigravity as `W:\home\ayush\wt\if-fe`). The branch is `origin/leapswitch-redesign` at `ce10451d` (which already has the Individual Fund page, IF-A to IF-B2, all green) plus one commit: the red-test commit `3711b620` (message starts `test(individual-fund): failing tests for going live on the real backend fixtures (IF-C)`). Never touch another worktree.
**Parent documents:** register C166 (the Individual Fund routes stay placeholders until the backend ships), C118, C124 (page choices and the additive backend fields), C129; backend handoff `ui-redesign-IB-individual-fund-backend-handoff.md` Appendix A (the 17 routes) and A.3 (the golden fixture list); the backend source of truth is the merged branch `merge/if-backend` (worktree `wt\IFBE`), golden files `backend/tests/fixtures/fund/*.json` (35 files, written by `backend/scripts/write_fund_fixtures.py`); sibling packets `ui-redesign-IF-A`, `IF-B1`, `IF-B2` (the page) and `ui-redesign-ASKS-FE-M-mutual-funds-packet.md` (the fixture-sync pattern this packet copies). Method: `Docs/orchestration/2026-10-26-execution-plan-v2.md` sections 2 to 4, the same as every earlier packet. **This packet is the whole truth for this run: where an earlier packet, the plan or the handoff text and this packet differ, this packet wins** (section 6 lists every difference between what the front end assumed and what the real backend sends, and why each test changed).

## What this run is, in one paragraph
Until now the Individual Fund page was built against 32 hand-written "spec" fixtures and its two routes were placeholders (register C166). The backend has shipped. The tests, fixtures and types are **already written and committed red**: the 35 files in `frontend/src/features/individual-fund/fixtures/*.json` are now **byte-identical copies of the backend goldens** (never edit one), `types.ts` has the real shapes (a nullable holding ISIN, the Overlap response types), `fixtures/{schema,index,fixtures.test}.ts` are updated, 22 existing test files are re-derived against the real numbers, the test-only override `__support__/liveRoutes.ts` is deleted, and the live-routes list in the shell test now expects the two Individual Fund routes. You edit **four existing source files and create no file**: add one small pure function `alignToDates` to `fundFormat.ts`, use it in `PerformanceChart.tsx` (the real category series is daily, 366 points, while the fund series has one point per NAV day, 260, and the chart reads every line by position), and change the `status` and `page` lines of the two route files `portfolio-mutual-funds-fund.route.tsx` and `portfolio-mutual-funds-fund-insights.route.tsx` from placeholder to live. The Overlap tab, its route and its "See Overlap" links stay exactly as they are (greyed, "Coming soon"): they are packet IF-D. **No backend change, no new endpoint, no Overlap UI.**

## Rules (read twice)
1. **Scope.** Edit **only** the four files in section 3. Everything else (every test, `types.ts`, everything in `fixtures/`, `__support__/`, `api.ts`, `package.json`, the other route files including `portfolio-mutual-funds-fund-overlap.route.tsx`, the shell, the kit, `lib/`, Home, Planning, Mutual Funds, Profile, and every other source file of the feature) is out of bounds. **Create no file.**
2. **Never edit a test, a fixture or `types.ts` to make it pass.** If a test seems wrong, stop and describe it in the report (the orchestrator validated every test against a working solution and checked it with deliberate breaks).
3. **Run the checkpoint command after every step** and keep its real output for the report; fix your code, not the test.
4. **No new dependency, no `npm install`.**
5. **No float formatting of money or percentages.** Never write `parseFloat`, `toFixed` or `Intl.` in any Individual Fund source file, **comments included** (a guard test greps whole file text), and no `console.`. `Number(...)` is allowed only to turn a figure into a chart coordinate, which is exactly what `alignToDates` does.
6. **No hard-coded colours** in the feature's `.tsx` files, **comments included** (the guard test greps).
7. **Do not import another feature** into the Individual Fund folder (only `@/lib/*`, `@/components/*`, `@/shell/*`, `features/auth/session` and its own folder). This packet needs no new import: `SeriesPoint` is already imported in `fundFormat.ts`.
8. **Links only through `paths`**; the backend is called only from `api.ts`; neither file is touched in this run.
9. **Exact strings.** The two route files change in exactly the two lines shown in section 4, character for character (the import path included).
10. **Do not refactor, rename or "improve" anything outside the file map.** 2-space indentation, double quotes, semicolons, no `any`, no unused locals or imports (`tsc -b` is strict).
11. **Lint.** `oxlint` warns when a file exports a component and also a constant or a hook: `fundFormat.ts` exports functions only. Do not add `oxlint-disable` comments.
12. **If anything differs from this packet, stop and report it.**
13. **Run every command inside WSL** (Step 0). If one test fails with an "Unable to find an element ... timed out" message, or `src/shell/portedFlow.test.tsx` fails on a long run, re-run that file alone (`npx vitest run <file> --maxWorkers=4`) before you report it: the machine is shared and a one second `findBy` can time out under load. A test that fails twice in a row alone is real. Never run two `vitest` or `tsc` commands at the same time.

## Step 0: environment check (do this first, and report the output)
The folder is opened as `W:\home\ayush\wt\if-fe`; **every command (`git`, `npm`, `npx`, `grep`, `cd`) runs inside WSL**: `wsl.exe -d Ubuntu --cd /home/ayush/wt/if-fe -- <command>` for git, `wsl.exe -d Ubuntu --cd /home/ayush/wt/if-fe/frontend -- <command>` for npm/npx; a command containing `|` is run as `... -- bash -c "<command>"`.
Run and report the output of each:
```
git status --short                 # expect: nothing printed (run this FIRST, before anything else)
git branch --show-current          # expect: feat/if-live
git log --oneline -3               # expect the top line to start with: test(individual-fund): failing tests for going live on the real backend fixtures (IF-C)   (then ce10451d Merge fix/mf-amc-card-small-screens ...)
cd frontend && npx tsc -b          # expect exactly 1 error line: src/features/individual-fund/fundFormat.test.ts(5,3): error TS2305: Module '"./fundFormat"' has no exported member 'alignToDates'.  Nothing else, nothing in a source file.
npx vitest run src/features/individual-fund/fixtures                  # expect: 1 file, 52 passed (the contract guard against the real goldens is green already)
npx vitest run src/features/individual-fund --maxWorkers=4            # expect: Test Files 6 failed | 24 passed (30); Tests 17 failed | 576 passed (593)   (fundFormat 6, FundPageFrame 3, InsightsPage 3, OverviewPage 2, PerformanceChart 2, RiskReturnScatter 1)
npx vitest run src/features/planning --maxWorkers=4                   # expect: Test Files 1 failed | 19 passed (20); Tests 2 failed | 322 passed (324)   (MemberRows: the fund-name link tests)
npx vitest run src/shell src/App.test.tsx --maxWorkers=4              # expect: Test Files 1 failed | 26 passed (27); Tests 1 failed | 346 passed (347)   (only the live-routes list in wrappers.test.tsx)
npx vitest run src/components/mf --maxWorkers=4                       # expect: Test Files 9 passed (9); Tests 50 passed (50)
npx vitest run src/components/ui/charts src/lib src/styles            # expect: Test Files 17 passed, Tests 190 passed
```
State which way you run commands and whether you can edit files. If any expectation fails, **stop and report**.

## Goal
Make the Individual Fund page work on the real backend and reachable in the app: (1) the Overview route (`/portfolio/mutual-funds/funds/:schemeId`) and the Insights route (`.../insights`) load the real pages instead of the "Coming soon" placeholder, so every existing fund link (the Planning "By family member" fund names, the page's own breadcrumb and Overview/Insights tabs) becomes a real link; (2) the Performance chart draws the category line on the fund's own dates.
**Non-goals:** the Overlap tab, route, page, links and fixtures' UI (IF-D: the Overlap tab in `FundPageFrame.tsx` stays the disabled "Coming soon" span, the "See Overlap" link in a fact row stays the greyed stub, and `portfolio-mutual-funds-fund-overlap.route.tsx` stays a placeholder); wiring new entry points to the fund page (the Mutual Funds holdings and overview rows still open the old Fund Details popup, Home news and movers keep their own greyed "Coming soon" links, see section 6 default 12); any backend change (section 6 lists the backend asks); any fixture or type edit.

## 3. File map
**Create:** none. **Edit (4, nothing else in these files):**
- `frontend/src/features/individual-fund/fundFormat.ts` (Step 1: add `alignToDates`)
- `frontend/src/features/individual-fund/overview/PerformanceChart.tsx` (Step 2)
- `frontend/src/shell/routes/portfolio-mutual-funds-fund.route.tsx` (Step 3: the `status` and `page` lines only)
- `frontend/src/shell/routes/portfolio-mutual-funds-fund-insights.route.tsx` (Step 3: the `status` and `page` lines only)

**Do not touch:** every `*.test.ts(x)` file, `types.ts`, `fixtures/` (the 35 JSON files, `schema.ts`, `index.ts`, `fixtures.test.ts`), `__support__/`, `api.ts`, `FundPageFrame.tsx`, `portfolio-mutual-funds-fund-overlap.route.tsx`, `package.json`, `package-lock.json`, `src/index.css`, `src/lib/**`, `src/components/**`, the rest of `src/shell/**`, `src/features/**` outside the four files, anything under `backend/` or `Docs/`.
**Tests to satisfy (committed; read each before its step):** `fundFormat.test.ts` (the new `alignToDates` block, 6 tests), `overview/PerformanceChart.test.tsx` (the two tests about the category line), `OverviewPage.test.tsx` (the live real-route test and the route-files test), `InsightsPage.test.tsx` (the tab-strip test, the live real-route test and the route-files test), `FundPageFrame.test.tsx` (the tab strip now uses the real registry), `insights/RiskReturnScatter.test.tsx` (a held peer's link goes to its fund page), `src/features/planning/components/MemberRows.test.tsx` (fund names are links), `src/shell/routes/wrappers.test.tsx` (the live-routes list). `fixtures/fixtures.test.ts` (52) is already green: it compares the 35 goldens with `types.ts`.
**Already in the folder (do not edit):** `SeriesPoint` in `types.ts` (`{ date: string; pct: string }`), the `seriesValues` and `lastPct` helpers beside the new function, `AppLink` (a link renders as a real link when its route is `live`, otherwise as a greyed "Coming soon" span, so flipping a route is all the app needs).

## 4. Specifications
### Step 1: `alignToDates` (`fundFormat.ts`)
Add this function after `seriesValues` and before `lastPct`, exactly:
```ts
/**
 * One number per wanted date, read from a date-ordered series. The category series is daily while the fund series skips days
 * without a NAV, and the chart reads every line by position, so the category line is put on the fund's own dates: a wanted date
 * the series lacks takes the nearest earlier point (a date before the first point takes the first value).
 */
export function alignToDates(
  points: SeriesPoint[] | null | undefined,
  dates: readonly string[]
): number[] {
  if (!points || points.length === 0 || dates.length === 0) return [];
  const values: number[] = [];
  let next = 0;
  for (const date of dates) {
    while (next + 1 < points.length && points[next + 1].date <= date) next += 1;
    values.push(Number(points[next].pct));
  }
  return values;
}
```
Behaviour the tests check: one number per wanted date; an exact date takes that point's value; a missing date takes the nearest earlier point (ISO dates compare as text); a date before the first point takes the first point's value, a date after the last keeps the last; an empty, `null` or `undefined` series, or no wanted dates, gives `[]`; neither list is changed.
**Checkpoint 1:** `npx vitest run src/features/individual-fund/fundFormat.test.ts` → expect **1 file passed, Tests 132 passed**.

### Step 2: the category line on the fund's dates (`PerformanceChart.tsx`)
Two changes, nothing else in the file: add `alignToDates` to the existing import from `"../fundFormat"` (a new line `  alignToDates,` before `  axisLabel,`), and in the `category` series replace `values: seriesValues(categoryReady.points),` with
```tsx
values: alignToDates(categoryReady.points, data.fund.map((point) => point.date)),
```
(`seriesValues` stays imported: the fund and benchmark series still use it.) The legend figure for the category stays `lastPct(categoryReady.points)`, the last category point.
Behaviour the tests check: the chart gets, for the category, exactly one value per fund point (260 values for the 1Y golden), each the category value on that fund date (`[0, 0.0282, 0.0842, 0.1125, ...]` for the first four; the Saturday 25 Oct 2025 is not a fund date and its 0.0561 is skipped); a fund date the category lacks takes the earlier category value; the fund and benchmark values are unchanged; the legend shows `+10.8%` for the category (the last point 10.8332).
**Checkpoint 2:** `npx vitest run src/features/individual-fund/overview --maxWorkers=4` → expect **Test Files 11 passed, Tests 217 passed** (re-run once if one `findBy` times out).

### Step 3: the two routes go live (`portfolio-mutual-funds-fund.route.tsx`, `portfolio-mutual-funds-fund-insights.route.tsx`)
In each file change exactly two lines. `portfolio-mutual-funds-fund.route.tsx`:
```diff
-  status: "placeholder",
+  status: "live",
   title: "Fund Overview",
-  page: () => import("../layout/PlaceholderPage"),
+  page: () => import("../../features/individual-fund/OverviewPage"),
```
`portfolio-mutual-funds-fund-insights.route.tsx`:
```diff
-  status: "placeholder",
+  status: "live",
   title: "Fund Insights",
-  page: () => import("../layout/PlaceholderPage"),
+  page: () => import("../../features/individual-fund/InsightsPage"),
```
Do **not** touch `portfolio-mutual-funds-fund-overlap.route.tsx` (it stays `status: "placeholder"` with the placeholder page). The default export of each page module is its route component (`OverviewRoute`, `InsightsRoute`), which is what the registry loads.
Behaviour the tests check: both routes are `live` with their path, label and `family-or-member` scope unchanged and their `page()` resolving to the real route component; the Overlap route is still a placeholder; the live-routes list in the shell test has the two new ids; the real registry renders the Overview and Insights pages inside the shell; the page's Overview and Insights tabs and breadcrumb are links with `href`; the Planning fund names are links to `/portfolio/mutual-funds/funds/<id>` (an id with a space or slash is encoded) and the scatter's held-peer link navigates.
**Checkpoint 3:** `npx vitest run src/features/individual-fund src/features/planning src/shell src/App.test.tsx --maxWorkers=4` → expect **Test Files 77 passed (77), Tests 1264 passed (1264)** (individual-fund 30 / 593, planning 20 / 324, shell and App 27 / 347).

### Step 4: final checks (from `frontend/`, in this order; paste every output)
```
npx tsc -b                                                          # expect: no output
npx oxlint src/features/individual-fund src/features/planning src/shell   # expect: exit code 0, no warning
npx vitest run src/features/individual-fund --maxWorkers=4          # expect: Test Files 30 passed, Tests 593 passed
npx vitest run src/features/planning --maxWorkers=4                 # expect: Test Files 20 passed, Tests 324 passed
npx vitest run src/shell src/App.test.tsx --maxWorkers=4            # expect: Test Files 27 passed, Tests 347 passed
npx vitest run src/components/mf --maxWorkers=4                     # expect: Test Files 9 passed, Tests 50 passed
npx vitest run src/components/ui/charts src/lib src/styles          # expect: Test Files 17 passed, Tests 190 passed
npm run build                                                       # expect: "built in" with no error (a chunk-size warning is normal)
cd .. && git status --short -uall                                   # expect: " M" for exactly the four files of section 3, nothing else
```
**Do not commit and do not push.** The orchestrator verifies and commits.

## Stop conditions
Stop and report if: Step 0 does not match; a checkpoint still fails after two honest attempts; a test appears to contradict this packet; you would need to edit a file outside section 3 (above all a test, `types.ts`, a fixture, `FundPageFrame.tsx`, the Overlap route file or `api.ts`); a command needs `npm install`; you are tempted to create a file, to make the Overlap tab or a "See Overlap" link clickable, to hide or round the backend's insight text, or to add a link from another page to the fund page.

## 5. Report (fill in at the end, in one fenced block, with the real command outputs)
```
GEMINI REPORT — ui-redesign — IF-C (Individual Fund goes live on the real backend fixtures)
Model and tool:    Date/time:
0. ENVIRONMENT: WSL terminal or wsl.exe prefix? Could you edit files? Step 0 outputs (all nine):
1. FILES EDITED (exact paths; confirm none created and the Overlap route file untouched):
2. CHECKPOINTS: for each of 1 to 3, the command and the last lines of its output (passed counts):
3. FINAL CHECKS (step 4), full outputs:
4. ANYTHING THAT DIFFERED FROM THE PACKET, and what you did:
5. TESTS THAT SEEMED WRONG (if any), with the exact failing assertion:
6. THINGS YOU COULD NOT DO OR VERIFY:
7. CONFIRMATIONS: tests untouched: yes/no; types.ts and fixtures untouched: yes/no; files outside the file map untouched: yes/no; no file created: yes/no; Overlap route still a placeholder: yes/no; nothing imported from another feature: yes/no; no npm install: yes/no; nothing committed: yes/no
```

## 6. Spec conflicts, defaults and backend asks (not for Gemini; for the orchestrator and the register)
**Fixture sync (the pattern of ASKS-FE-M).** The front end had 27 spec fixtures in `features/individual-fund/fixtures` (plus `schema.ts`, `index.ts`, `fixtures.test.ts`) built from the contract text. Now: all **35** backend goldens are copied byte-identical (`cmp` against `wt\IFBE\backend\tests\fixtures\fund\*.json` shows no difference at the time of writing); the same 32 names, **no renames**; the three new ones are `overlap_fund`, `overlap_compare`, `overlap_unavailable` (copied and schema-guarded by `fixtures.test.ts`; no Overlap UI test, that is IF-D). `index.ts` now exports the real ids (`IDS.scheme` `2c652f6f-...`, `asha`, `dev`, `folioAsha`, `folioDev`, `peer1`, `debtScheme`, `youngScheme`, `casScheme`); `IDS.meera` is kept as a member id that is in **no** golden. `types.ts` changes: `HoldingRowOut.isin` is `string | null` (the golden's government-bond and cash lines have no ISIN) and the 12 Overlap response types are added (guarded, not yet used by the UI); `scatter.held` and `returns.benchmark_label` stay optional additive fields.
**Fixtures are final:** all 35 files were re-compared with `cmp` against `wtIFBE` branch `merge/if-backend` tip `c2100abe` (no difference). Nothing is pending. The three that changed late (`score_computed`, `insights_full`, `insights_sparse`) are read by `ScoreCard.test.tsx` (57 / 100, "10.0% vs 10.8%"), `SmartInsightsCards.test.tsx` and `StrengthsConsiderations.test.tsx` (the five-year fact is a consideration, "10%" against 10.8396%); `insights_sparse` is read by the guard test only.
**Where the real backend differs from what the front end assumed (each is a numbered default for a register entry; the tests changed accordingly, no test was loosened):**
1. **Only two of the three Individual Fund route files go live.** The task text said three; the Overlap route has no page to load (IF-D), so `portfolio-mutual-funds-fund-overlap.route.tsx` stays a placeholder and the Overlap tab stays the disabled span in `FundPageFrame.tsx`. Tests assert exactly that (Overview live, Insights live, Overlap placeholder).
2. **The category series is on another date grid than the fund series.** `peers/series` is daily (366 calendar days for 1Y) while `performance` has one point per NAV day (260); the chart is index-based, so the category line was drawn against the wrong dates. Default: `alignToDates` puts the category on the fund's dates (nearest earlier value). The benchmark series has the same dates as the fund (checked), so it is untouched.
3. **Ids and members.** The real member-scope golden `summary_member` is **Dev Rao** (not Asha: 750.00 now, 50.000 units, 600.00 in), `summary_not_held` is Dev's scope (held by ASHA RAO only), `held_by_other_members` has one name. Tests use `IDS.dev` for member scope and not-held; a second "two names" case is hand-made.
4. **Summary numbers.** Family: 2,250.00 / 1,600.00 / +650.00 (+40.6250), share of portfolio 94.5378, XIRR `0.1234` (a fraction: 12.3%), expense ratio 0.70, reference period 30 Sep 2026 (it was 0.62 and 1 Sep). The member golden has `share_of_portfolio_pct: null`, XIRR `0.17352...` (17.4%). The CAS-only golden has an XIRR and a share (it has no history and no expense ratio): the "missing XIRR reads a dash" case is hand-made by nulling it.
5. **Folio mask is `XXXXX` plus the last four characters** (`XXXXX9183`, `XXXXX5678`, and `XXXXXNLY1` for a CAS-only folio). A single-folio member view labels the row "Folio number", the family view "Folio · <member>".
6. **Score.** Stored golden 78.50 (ring 79, band Strong, "11.5% vs 9.5%", percentiles 82 and 72, "4 of 5 rolling windows"); `consistency_hit_rate` is a percent here (`"80.00"`, it was a fraction `0.80`; unused by the UI); `scheme_return` and `category_avg_return` are fractions. The computed golden's `computed_at` carries `+05:30`, the stored one `Z`; both format to "23 Oct 2026".
7. **Risk goldens are degenerate synthetic data** (volatility `0.0050` so "0.0%", drawdown `0.0000`, Sharpe `698.7295` so "698.73" with the bar stopped at 100%, beta `0.7407` "Lower risk" tone `pos`; the bands are `Low`, `Low`, `Good`, `Lower risk`, all `pos`). The proportions test therefore uses a hand-made body with realistic values (14.2 / -18.4 / 0.82 / 0.98, bars 47.3 / 40.9 / 41 / 65.3), and says so in a comment. The golden named `risk_life_window` is **really a debt fund** (`life_window: false`, every band and tone `null`, beta `null` with reason `no_benchmark`); there is no golden for a young equity fund (`life_window: true`) or for a beta with `insufficient_shared_dates`, so those two tests build their body by hand. The non-equity case (no band chips, no beta row) is now tested on the real debt golden.
8. **Composition is a partial portfolio.** Asset types add to 94 (Equity 78, Debt 12, Cash and equivalents 4), sectors to 78, market-cap thirds of 33.3333, `unclassified_pct` 16.0000, 12 stocks, top 10 weights 8, 8, 8, 7, 7, 7, 6, 6, 6, 5. The sector list ends with a slice named **"Unclassified"** (the spec had "Others"); the top-10 even contains a stock in that sector. The pie draws shares of what the list holds; nothing assumes 100. `holdings_all` has 14 rows including a government bond (12.0, `isin: null`, sector "Sovereign") and the cash line; it ranks first by weight.
9. **Insights shape.** The `overlap` fact is in the **key** list (tone `info`), not under considerations; `top_three` mixes lists (the first card is a `consideration` with tone `warn`); the five-year fact is a consideration when the fund trails its category. Order in each list is the API order. Fact titles already cover every real id (`top5_weight`, `market_cap_spread`, `peer_beat_years`, `lagging_years` ...).
10. **Rolling and period series.** Rolling (3Y): 36 month-end points, no gaps (`window=1|3|5` is what `api.ts` already sends); the gap-filling tests build gaps by hand. Period returns 1Y: 13 monthly buckets with a partial first and last bucket ("Oct 2025" from 23 Oct, "Oct 2026" to 23 Oct); 5Y: 6 yearly buckets ("2021" partial ... "2026 YTD"). No missing figure anywhere: the dash-in-popup and zero-bar cases are hand-made.
11. **Scatter.** The backend does **not** send the additive `held` flag (register C124 is still a backend ask), so a peer's dot opens a card without a "You hold it" row and **never links**; the "held peer links to its fund page" test sets `held` by hand. The thin golden carries a median (`0.0048`), so the median line shows whenever the backend sends one (it was hidden for thin categories in the spec fixture). Volatilities are tiny (`0.0050`), so the card prints "0.0%", the same as the Risk Metrics card.
12. **Fund links now enabled, and what does not link yet.** `AppLink` enables a link when its route is live, so flipping two routes enables: the Planning "By family member" fund names (`MemberRows`, the only place outside the page that builds `paths.mutualFunds.fund`), the page's breadcrumb and its Overview and Insights tabs, and the scatter's held-peer link (none today, default 11). **No link leads to a page that cannot load:** the Overlap path is built nowhere as a link (the tab is a span, the "See Overlap" row link is a static greyed stub), and an unknown or never-held fund id answers 404, which the frame shows as "Fund not found". **Not linked yet (a follow-up wiring packet, not IF-C):** the Mutual Funds holdings and overview rows (they open the old Fund Details popup), Home news and movers and Worth-a-look (their own greyed "Coming soon" links, which are about stocks and tickers, not this page), the Settings rows' "Coming soon" tags (unrelated), and the Overview card's `RiskReturnScatter`-style peer links (default 11).
13. **Test plumbing.** `__support__/liveRoutes.ts` is deleted (no more route override: the real registry is used by `OverviewPage`, `InsightsPage`, `RiskReturnScatter` and `FundPageFrame` tests); `MemberRows.test.tsx` (Planning) uses the real registry and flips the route back by hand for its "not live" case; the shell live-routes list gains `portfolio-mutual-funds-fund` and `portfolio-mutual-funds-fund-insights`.
**Backend asks (nothing to build in this repo; the elements are hidden or shown as-is until they are answered):**
- **BA1.** `held` on every scatter point (register C124). Hidden: no "You hold it" row, no peer links.
- **BA2.** `benchmark_label` on the returns routes (C124). Default: the row says "Benchmark" (the Performance route already sends "Nifty 500").
- **BA3.** Insight sentences and evidence carry unrounded decimals ("a category average of 1.033333333333333333333333333%", and in the older sparse golden "10.00723348918951425466156498%") and raw ISO dates ("since 2018-04-01"). The page prints the backend text verbatim and does not re-round it; ask the backend to format numbers and dates in the sentence.
- **BA4.** The category series (`peers/series`) is on calendar days while the fund series is on NAV days; the front end aligns them (default 2). Optional: send the category on the fund's dates.
- **BA5.** Goldens that do not exist: a young equity fund risk (`life_window: true`), beta with `insufficient_shared_dates`, a performance with a missing figure, and `risk_life_window.json` is misnamed (it is a debt fund with `life_window: false`). Add them, or rename the file.
- **BA6.** `risk_equity` golden is a near-flat synthetic series (volatility 0.005, drawdown 0, Sharpe 698.73); worth a more realistic synthetic series so the page can be eyeballed against believable figures.
**Defaults taken, needing register entries (numbered here for the entry; C-numbers assigned by the orchestrator):** 1 two routes live, Overlap stays a placeholder; 2 `alignToDates` puts the category line on the fund's dates; 3 `IDS` rebuilt from the goldens, member scope and not-held are Dev Rao; 4 gap and edge cases the goldens lack are hand-made in the tests, marked in comments, and the debt golden covers the non-equity risk case; 5 backend text shown verbatim (BA3); 6 the scatter median shows whenever sent; 7 no `held` flag means no row and no peer link; 8 Overlap response types added to `types.ts` and guarded, unused by the UI; 9 composition and allocation make no 100 percent assumption, sector slice is "Unclassified"; 10 insights lists as the API orders them, overlap is a key fact; 11 `liveRoutes.ts` deleted and tests use the real registry; 12 the fund page is linked from Planning and from itself only, the other entry points are a follow-up.
**Unverified:** no browser pass (the page was not opened on a running backend or in light and dark; the category line alignment is covered by a chart-props stub, not by looking at the chart); the degenerate risk figures and the 0.0% scatter volatility look odd on screen; the Planning fund-name link was only checked by test; the re-copy of the two pending goldens (see above); the full `src` run (380 files, 4,950 tests) had one load timeout in `portedFlow.test.tsx`, which passes alone.
**Verification record (orchestrator, 28 Oct):** reference solution in `C:\Users\Dell\Desktop\MVP v1\ref\if-fe-ref-c` (never committed): `tsc -b` exit 0; `oxlint src/features/individual-fund src/features/planning src/shell` exit 0 and silent; individual-fund 30 files / 593 tests (baseline 30 / 569: +24 tests; red state 6 failed files, 17 failed tests); planning 20 / 324 (red: 1 file, 2 tests); shell and App 27 / 347 (red: 1 test); `src/components/mf` 9 / 50; kit (`charts`, `lib`, `styles`) 17 / 190 (unchanged by this packet; the earlier packets recorded 16 / 188 before later merges); `npm run build` built; the whole `src` run 380 files / 4,950 tests, 1 load flake. File map: 0 new files, 4 edited (about 25 changed lines). Mutation checks on the reference, all caught: an exact date taking the previous point (5 tests fail), a date before the first point returning 0 (1), the Overlap route flipped to live (2), the Insights route pointing at the Overview page (3), and the red state itself proves the category-alignment, route-live and live-routes-list tests fail without the change.

## 7. Gemini prompt (paste into the Gemini window for folder `W:\home\ayush\wt\if-fe`)
**SYNC FIRST (owner runs this once, before pasting; Gemini must not run it).** The branch `feat/if-live` exists on the manager machine only until the orchestrator pushes it (`git -C "C:\Users\Dell\Desktop\MVP v1\wt\IFC" push -u origin feat/if-live`). Then, in WSL (`wsl.exe -d Ubuntu`), replace the old `if-fe` worktree (it holds the pushed IF-B2 branch `feat/individual-fund-frontend`; make sure `git -C /home/ayush/wt/if-fe status --short` shows nothing you need first):
```
git -C /home/ayush/wt/docs fetch origin
git -C /home/ayush/wt/docs log --oneline -1 origin/feat/if-live          # must show: test(individual-fund): failing tests for going live on the real backend fixtures (IF-C)
git -C /home/ayush/wt/if-fe status --short                               # must print nothing (anything listed must already be on origin; otherwise stop and ask the orchestrator)
mv /home/ayush/wt/if-fe/frontend/node_modules /home/ayush/if-fe-node_modules   # keep the installed packages; never npm install
git -C /home/ayush/wt/docs worktree remove --force /home/ayush/wt/if-fe
git -C /home/ayush/wt/docs worktree add /home/ayush/wt/if-fe -b feat/if-live --track origin/feat/if-live
mv /home/ayush/if-fe-node_modules /home/ayush/wt/if-fe/frontend/node_modules
git -C /home/ayush/wt/if-fe status --short                               # must print nothing
git -C /home/ayush/wt/if-fe log --oneline -3                             # top must be the red-test commit above, then ce10451d
```
```
You are the front-end builder for the Unifolio UI redesign. Open the folder W:\home\ayush\wt\if-fe (WSL path /home/ayush/wt/if-fe, branch feat/if-live). Before anything else run `git status --short` and `git log --oneline -3` inside WSL; the first must print nothing and the top commit must be the red-test commit the packet names (test(individual-fund): failing tests for going live on the real backend fixtures (IF-C)). If not, STOP and report; do not fix it yourself. Read, completely and in order, Docs/orchestration/ui-redesign-IF-C-go-live-packet.md (also at W:\home\ayush\wt\docs\Docs\orchestration\ui-redesign-IF-C-go-live-packet.md). It is the whole truth for this run: do Step 0 first and report its outputs, then follow every step, rule and checkpoint exactly. The tests and the 35 real backend fixtures are already committed (red); you edit only the four source files the packet names (individual-fund/fundFormat.ts, individual-fund/overview/PerformanceChart.tsx, and the status and page lines of shell/routes/portfolio-mutual-funds-fund.route.tsx and portfolio-mutual-funds-fund-insights.route.tsx), exactly as specified, and you create no file. Never edit a test, a fixture or types.ts, never touch the Overlap route file or FundPageFrame.tsx, never run npm install, never commit, never make the Overlap tab or a "See Overlap" link clickable, never import another feature into the Individual Fund folder. Run every command inside WSL (wsl.exe -d Ubuntu --cd /home/ayush/wt/if-fe ...) and never run two vitest or tsc commands at once. If a findBy times out in a file you did not touch, or portedFlow.test.tsx fails on a long run, re-run that file alone with --maxWorkers=4 before you report it. When done, send the report in the packet's report template with real command outputs. If anything differs from the packet, stop and report it.
```
