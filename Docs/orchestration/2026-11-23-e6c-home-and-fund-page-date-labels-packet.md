# Packet: E-6c date labels on Home and the fund page (Batch E, Antigravity)
**Status:** READY TO RELAY (written 2026-11-23). **Approved:** the owner's date decisions of 23 Nov (`decisions.md`, "Dates (E)").
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-e-dates-plan.md` (Task E-6 and its amendments). **Audit:** `Docs/orchestration/2026-11-20-date-audit.md`, sections 1, 2 and 5 (row numbers below are its rows). Words are fixed here: **copy never changes except where this packet says so.** The other half of E-6 (the Mutual Funds tabs and Portfolio tile, rows 1 to 7) is lane `ag-e6a`; do not touch its files.
**Worker:** Antigravity (Gemini). Frontend only. **Your clone:** `C:\Users\Dell\ag-e6c` (branch `ag/ag-e6c`, cut from `batch/e-dates`). Work only there. Never run a git command that changes anything. Never touch `backend/**`.
Read first: `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins), then this file; open `frontend/src/lib/dataDates.ts` and `frontend/src/components/DataDateLabel.tsx`.
**Checks** (from PowerShell): `wsl.exe -d Ubuntu -- env UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash "/mnt/c/Users/Dell/ag-e6c/Docs/orchestration/wave-fe-check.sh" ag-e6c test <paths under src/>` (also `types`, and `lint <paths>`).

## Step 0: one small addition to the date module (you own this edit; the other lane does not touch the module)
Add to `frontend/src/lib/dataDates.ts` (and tests in `dataDates.test.ts`, written first): `export function formatDataDateTail(kind: DataDateKind, iso: string | null | undefined): string` returning the phrase **without its leading noun**: `as on 23 Oct 2026` for `prices` and `ratios`, `as on September 2026` for `holdings`, `fees`, `factsheet`, `managerDetails`, `effective 1 Jul 2026` for `marketCapList`; `""` for an invalid date. `formatDataDate` must keep returning exactly what it does today (refactor it to use the tail helper only if every existing test stays green). This lets a sentence such as "All holdings, as on September 2026" be built without writing "as on" in a screen file.

## The labels (rebuild through the module; keep testids, classes and layout)
| Row | File (under `frontend/src/features/`) | Today | After |
|---|---|---|---|
| 10 | `home/components/dayChangeHelpers.ts` (~118-124) | `Friday 23 Oct 2026 · prices as on 23 Oct` / `Prices as on 23 Oct` | `Friday 23 Oct 2026 · Prices as on 23 Oct 2026` / `Prices as on 23 Oct 2026` (module, kind `prices`, with the year) |
| 11 | `home/components/DayChangeDialog.tsx` (~746) | `No fund had a new price. Latest prices are as on Friday 23 Oct 2026.` | `No fund had a new price. Prices as on Friday 23 Oct 2026.` |
| 12 | same file, `price-day-note` (~753, formerly ~255) | `Latest prices are from Friday 23 Oct 2026.` | `Prices as on Friday 23 Oct 2026.` (the owner's decision: this note's wording) |
| 14 | `home/sections/WorthALook.tsx` (~188) | `Approximate · holdings as of Sep 2026` | `Approximate · Holdings as on September 2026` |
| 17 | `individual-fund/overview/InvestmentDetails.tsx` (~97) | `as of 23 Oct 2026` beside the current NAV | `Prices as on 23 Oct 2026` (`<DataDateLabel kind="prices" />`) |
| 18 | `individual-fund/overview/TileDialog.tsx` (~43) | row `NAV as of` / `23 Oct 2026` | row label `NAV`, value `as on 23 Oct 2026` (`formatDataDateTail("prices", iso)`) |
| 19 | same file (~167) | row `As of` / `30 Sep 2026` | row label `Expense ratio`, value `as on March 2026`-style month (`formatDataDateTail("fees", iso)`); keep the row's order and testid |
| 20 | `individual-fund/overview/TopHoldings.tsx` (~161) | `Disclosure as of 30 Sep 2026.` | `Holdings as on September 2026.` (`formatDataDate("holdings", iso)` plus the final full stop as today) |
| 21 | `individual-fund/overview/AllHoldingsDialog.tsx` (~70) | `All holdings, as of 30 Sep 2026` | `All holdings, as on September 2026` (title text `All holdings, ` + `formatDataDateTail("holdings", iso)`) |
| 22 | `individual-fund/fundCopy.ts` (~192-199, `allocationNote`) | `...Disclosure as of 30 Sep 2026.` / `Sector from the fund's disclosure, as of ...` / `Share of the fund's portfolio, as of ...` | the same four sentences with `as of 30 Sep 2026` replaced by `formatDataDateTail("holdings", iso)` (`as on September 2026`); the rest of each sentence unchanged |
| 23 | `individual-fund/insights/FundManagerCard.tsx` (~211) | row `Details as of` / `30 Sep 2026` | row label `Manager details`, value `as on September 2026` (`formatDataDateTail("managerDetails", iso)`) |
Also: **delete `formatAsOf`** from `home/homeFormat.ts` (never called) and its test; **merge the two `formatMonthYear` copies**: delete `home/worthCopy.ts`'s copy, import `formatMonthYear` from `frontend/src/lib/dateRange.ts` (the long form, "September 2026", wins) in its one caller (`WorthALook.tsx`) or drop the call where row 14 now uses the module. **Row 15 (News):** the sentence `About 5% of your portfolio (holdings as of Sep 2026)` comes from the back end (Claude rewords it to `... (holdings as on September 2026)`): update only the fixture `news_specific_three.json` text and the matching assertion in `home/sections/News.test.tsx` (~116) to the new sentence.
**Leave exactly as they are:** rows 9, 13, 16, 24 (score card `Updated`), 25 (back end), event dates (transactions, SIP dates, "managing since", first and last investment, window ends, chart axes and tooltips), `formatDate`, `formatExactDate`, `formatDayMonth`, `formatWeekdayDate`, the Performance month pop-up. The legacy print sections (`features/analytics/*`, `TerSection.tsx`) wait for Batch I: do not touch them.

## Tests (update old assertions in the same change; list each in the report)
Audit section 5 gives each old string: `DayChangeDialog.test.tsx` (243, 330), `homeFormat.test.ts` (`formatAsOf` cases go with the function), `WorthALook.test.tsx` (91), `News.test.tsx` (116), `fundCopy.test.ts` (124-128), `FundAllocation.test.tsx` (75-90), `TopHoldings.test.tsx` (44, 128, 136), `AllHoldingsDialog.test.tsx` (32), `InvestmentDetails.test.tsx` (53), `StatBand.test.tsx` (130, 157), `FundManagerCard.test.tsx` (108), plus tests of any helper you change. Write the new expected strings first and see the old code fail; then change the code. **Only the strings in this packet may change in an assertion**; any other failing assertion is a finding: stop and report it.
Run: `ag-e6c test src/features/home src/features/individual-fund src/lib`, then `types`, then `lint` on those folders.

## Files
**May change:** the eleven component and helper files above, `home/homeFormat.ts`, `home/worthCopy.ts`, `lib/dataDates.ts` and `lib/dataDates.test.ts` (step 0 only; the pending scan test stays `it.skip`), the fixture, and the test files named above. **Do not touch:** the six files of lane `ag-e6a` (`mutual-funds/overview|allocation|other`, `portfolio/sections/SummaryStrip`), `DataDateLabel.tsx`, `MutualFundsFrame.tsx`, `SectionCard.tsx`, `guards.test.ts`, `ScoreCard.tsx`, `frontend/src/mobile/**`, `backend/**`, `package.json`, lockfiles. Anything else that needs an edit: stop and report it.

## Rules
Tokens only, no hex; no `parseFloat`/`toFixed`/`Intl.`/`console.`/`any`; no new dependency. Plain words, no em dashes. The Home and fund-page files keep their weekday forms for the day-change pop-up: those two files (`dayChangeHelpers.ts`, `DayChangeDialog.tsx`) may still contain the literal words "Prices as on" because the module cannot format a weekday; Claude lists them in the scan's allowlist. You cannot see the screen: say so.

## Report (one block)
Lane `ag-e6c`; failing counts before and after with the exact commands; `git status --short`; every old assertion changed (file, old, new); the exact new `formatDataDateTail` outputs; decisions the packet did not cover; anything not checked (visual); open questions. No narration.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-23-e6c-home-and-fund-page-date-labels-packet.md (your task: E-6c)
Work only in C:\Users\Dell\ag-e6c on branch ag/ag-e6c. Step 0 first (the small addition to the date module, tests first), then the labels. Tests first (show them fail for the old wording), then change the code. Touch only the files the packet lists. Never run a git command that changes anything. Reply with the report block from the packet, nothing else.
```
