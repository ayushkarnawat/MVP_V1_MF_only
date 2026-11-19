# Handoff: fe1a-xirr-labels-red-tests (Batch A, FX-8d and FX-8e, front end, step 1: red tests and types only)
**Status:** READY TO RELAY (written 2026-11-19). The backend for FX-8d and FX-8e is done and committed (`batch/a-xirr-fixes` 384ba2d1). This task writes **only the failing tests and the TypeScript types** that the front-end builder (Antigravity) then makes pass in step 2 (FE-1b, written after you report). Runs **at the same time as** `2026-11-19-ca6-category-average-excel-handoff.md` (different worktree and files).
**Why a separate test step:** the wave rules say the red tests are written first by Codex or the orchestrator and the screen builder does not edit them (`Docs/orchestration/wave-common-rules.md`, "Tests").
**Spec:** `Docs/orchestration/2026-11-17-batch-a1-xirr-planning-workbook.html` (finding F3, F8; FX-8d "the screen says which date"; FX-8e option 1 "show the return since purchase"; the drawing "A fund held for 3 months"). The owner approved: FX-8d, and FX-8e option 1 plus a dash for flows that net to zero. Copy rules: plain words, **no em dashes in user-visible text**, no advice wording.
**Worker:** Codex (tests and types only). **Reviewer and committer:** Claude.
**Work in:** `D:\unifolio-a-xirr` (branch `batch/a-xirr-fixes`). Frontend folder `D:\unifolio-a-xirr\frontend`. Never in `D:\Unifolio code`.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## The new backend fields (already in the API; all optional, `null` when absent)
- **Tile** (every response that carries `current_holdings_xirr`: the portfolio summary, the aggregate and member holdings responses): `xirr_as_of` (an ISO date string, the price date the figure uses), `lifetime_xirr_basis` and `current_holdings_xirr_basis` (`"annualised"` or `"since_purchase"`), `lifetime_since_purchase` and `current_holdings_since_purchase` (a decimal string such as `"0.2"`, the absolute return). When the basis is `since_purchase`, the existing `lifetime_xirr` or `current_holdings_xirr` still holds the annualised rate; **the screen shows the since-purchase figure instead**.
- **Per fund** (the analytics benchmark funds row `FundBenchmarkRow`, the consolidated holding row and its children): `xirr_as_of`, `xirr_basis`, `since_purchase_return`. `xirr` is `null` for flows that net to zero on one day.
Old payloads (without these fields) must keep rendering exactly as today.

## Where the figures are drawn (re-check; report drift)
`frontend/src/features/portfolio/sections/SummaryStrip.tsx` (the Portfolio XIRR tile: `shownXirr`, `value-xirr`, `xirr-caption`), `frontend/src/features/mutual-funds/overview/SummaryStrip.tsx` and `OverviewPage.tsx` (the Mutual Funds tile; `XirrBundle`), `frontend/src/features/mutual-funds/overview/HoldingsTable.tsx` (the per-fund XIRR column: the main row reads `xirrByScheme[scheme_id]`, built in `OverviewPage.tsx` from `bench.data.funds[].fund_xirr`; child rows read `row.xirr`), and the type files `portfolio/types.ts`, `mutual-funds/types.ts`, `dashboard/types.ts`. **Out of scope:** `frontend/src/mobile/**` (phone), the legacy dashboard, the individual fund page, benchmark and window figures (the owner narrowed FX-8e to the two tile figures and the per-fund column).

## What to write
1. **Types (additive, optional fields only)** in `portfolio/types.ts`, `mutual-funds/types.ts` and `dashboard/types.ts` for exactly the fields above, using one shared union type name (for example `XirrBasis = "annualised" | "since_purchase"`) defined once where the other XIRR types live.
2. **Failing tests (vitest), new files next to the components or added to the existing test files for each case:**
   - `portfolio/sections/SummaryStrip` tests: (a) basis `since_purchase` shows the since-purchase percentage (for example `"0.2"` reads `20.0%` in the app's existing percent format; use the existing `formatXirr`) in `value-xirr` and the caption `Return since purchase, not annualised`; (b) basis `annualised` or absent: unchanged value and caption (a regression guard, passes today); (c) `xirr_as_of` present: a line `As on 18 Nov 2026` style (use the app's existing date formatter; pick the format other tile captions use and say which) with `data-testid="xirr-as-of"`; absent: no such line; (d) the Lifetime/Current basis switch shows the matching basis for each.
   - Mutual Funds overview tile tests: the same (a) to (d) on the `XirrBundle` tile.
   - `HoldingsTable` tests: (e) a main row whose fund has `xirr_basis: "since_purchase"` shows the since-purchase percentage with the small label `since purchase` and an accessible name `Return since purchase, not annualised`; (f) a row with `annualised` or no basis: unchanged; (g) `xirr: null` shows the existing dash; (h) sorting by XIRR still sorts by the figure shown (the since-purchase figure for a short row, the annualised rate otherwise); (i) a child row uses `row.xirr_basis` and `row.since_purchase_return`.
   - Add the **props or helper the builder will need as a documented contract in the test itself** (for example a new optional prop `xirrMetaByScheme` on `HoldingsTable` and the helper that `OverviewPage` uses to fill it from the analytics funds): say in the report exactly which names the tests assume, so the builder implements those and no others.
3. **Run every new test and report it red for the stated reason** (a missing prop, a missing label, an unchanged figure); the regression guards must pass today.

## Run these only
```
cd frontend
npx vitest run src/features/portfolio/sections src/features/mutual-funds/overview --maxWorkers=2
npx tsc -b
npx oxlint src/features/portfolio src/features/mutual-funds
```
Use the orchestrator's script if `node_modules` is not available in the worktree: from WSL, `bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ax test src/features/portfolio/sections src/features/mutual-funds/overview` (lane `ax` is this worktree), and `... ax types`, `... ax lint src/features/portfolio src/features/mutual-funds`. If you cannot run them, report BLOCKED with the exact error; the orchestrator runs them. **`tsc` must pass after your type additions; the new tests are the only red ones.**

## Files you may touch
The three `types.ts` files (additive fields and the shared union only) and test files under `frontend/src/features/portfolio/sections/`, `frontend/src/features/mutual-funds/overview/` (existing test files may get new `it` blocks; do not change existing assertions). **Do not touch** any component (`*.tsx` that is not a test), `frontend/src/mobile/**`, `backend/**`, fixtures other than a new test-local one, `package.json`, lockfiles.

## Constraints
No new dependency. No hex colours or visual work (no screen file is changed in this step). Invented data only. Git read-only. No deletion flags or recursive deletes.

## Report format
One fenced block `CODEX REPORT: fe1a-xirr-labels-red-tests`: status; baseline HEAD; drift; the types added; every new test with its red reason or "guard, passes today"; the exact names (props, helpers, test ids, copy strings) the tests assume; commands with counts; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Frontend test writer for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-19-fe1a-xirr-labels-red-tests-handoff.md (your task: FE-1a, red tests and types only)
Work only in D:\unifolio-a-xirr (frontend folder) on branch batch/a-xirr-fixes. Git is read-only. No deletion flags or recursive deletes. Change no component and no backend file: add only the optional type fields and the new tests the handoff names. The new tests must be red for the stated reason; the guards must pass today. tsc must pass.
Run checks with the commands in the handoff (if the sandbox cannot run them, reply BLOCKED with the exact error, do not change any config).
Reply with the CODEX REPORT block from the handoff, nothing else.
```
