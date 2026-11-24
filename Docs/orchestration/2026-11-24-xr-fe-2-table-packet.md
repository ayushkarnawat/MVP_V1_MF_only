# Packet XR-FE-2: the Returns and XIRR columns in the holdings list, screen and PDF page (Antigravity)
**XIRR leads, Returns on the flip side. Task 6.** The red tests are written and committed (`xr-fe-1a`); the backend sends every field they read (xr-be-1 committed, xr-be-2 in progress: you build against fixtures, never the live backend). You make the red tests pass and change nothing else. **Spec (the design):** `Docs/orchestration/2026-11-24-xirr-vs-returns-plan.html`, section "Holdings list mockups" (single-member and family drawings) and the decisions Q5 and Q6. Plan: `Docs/superpowers/plans/2026-11-24-xirr-vs-returns-plan.md` (Task 6). Owner decisions bind you: **the columns after Gain/Loss are Returns then XIRR; XIRR is the real annualised rate; both columns have equal weight; the caution chip sits on the XIRR cell only, where the row has a caution; the old `since purchase` label under the XIRR value is gone.** The PDF export's Overview page prints this same table and **follows the screen**. Copy rules: plain words, **no em dashes**, **no wording of your own**: every string you may show is listed below.

**Your clone:** `C:\Users\Dell\ag-xr2` (branch `ag/xr2-table`, cut from `batch/xr-returns`). Work only there. Never run a git command that changes anything.
**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), `Docs/orchestration/2026-11-18-palette-reference-for-workers.md`, then this packet.

## What the data looks like (additive; any field may be absent or null; an old stored payload has no `since_purchase_return` for mature funds and no `xirr_caution`: it must render a dash for Returns, the XIRR as before, and no chip)
- **Main rows (single-member table):** `xirrByScheme[scheme_id]` is the annualised rate (a decimal string such as `"0.418"`, or null: the existing dash). `xirrMetaByScheme[scheme_id]` (`SchemeXirrMeta`) gives `since_purchase_return` and `xirr_caution`. `xirr_basis` and `xirr_as_of` are **no longer read for display**.
- **Family table:** each `ConsolidatedHolding` (parent) and each `ConsolidatedHoldingChild` carries its own `xirr`, `since_purchase_return`, `xirr_caution`. With more than four members the children arrive with nulls: dashes.
- Figures are formatted with the existing `formatXirr` (`"0.418"` shows `41.8%`, `"-0.001"` shows `-0.1%`, `"0"` shows `0.0%`, null shows `—`; no plus sign). The chip texts and tips are in `CAUTION_CHIP` of `lib/xirrDisplay.ts` (already built, do not edit): `young` is `held under 1 yr`, `single_transaction` is `one transaction`.

## What to build

### 1. `frontend/src/features/mutual-funds/mfCopy.ts` (the sort key)
`SortKey` gains `"returns"`; the `validKeys` list in `parseSort` gains `"returns"`; `sortHoldings(rows, sort, xirrByScheme, returnsByScheme?)` gains an **optional** fourth parameter `returnsByScheme?: Record<string, string | null | undefined>` and a `case "returns": return returnsByScheme?.[row.scheme_id] ?? null;` (missing values sort last in both directions, as every key does today). `case "xirr"` still reads `xirrByScheme` (the annualised rate only). Existing callers and tests of `sortHoldings` keep working unchanged.

### 2. `frontend/src/features/mutual-funds/overview/HoldingsTable.tsx`
- **Imports:** remove `resolveXirrDisplay`, `SINCE_PURCHASE_CAPTION`, `SINCE_PURCHASE_SHORT_LABEL` and the `XirrCellContent` function. Import `CAUTION_CHIP` and `type XirrCaution` from `../../../lib/xirrDisplay`.
- **`SchemeXirrMeta`** gains `xirr_caution?: XirrCaution | null`.
- **A local chip** (inside this file, not shared, because the other lane creates the shared one in parallel and the orchestrator will unify them later): `function CautionChip({ caution }: { caution: XirrCaution })` returning `<span role="note" data-testid="xirr-caution" title={CAUTION_CHIP[caution].tip} aria-label={CAUTION_CHIP[caution].tip} className=...>{CAUTION_CHIP[caution].text}</span>`. Classes: always `inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-medium`; `young` adds `bg-[var(--warn-bg)] text-[var(--warn-text)]`; `single_transaction` adds `border border-[var(--ui-divider)] bg-[var(--ui-card)] text-[var(--ui-text-muted)]`. Tokens only.
- **An XIRR cell body used by both tables:** `function XirrFigure({ value, caution }: { value: string | null | undefined; caution: XirrCaution | null | undefined })` returning `<div className="flex flex-col items-start gap-0.5"><span>{formatXirr(value)}</span>{caution ? <CautionChip caution={caution} /> : null}</div>`. (The chip sits **under** the value so the column stays narrow.) With no caution the cell's `textContent` is exactly `formatXirr(value)` (a test checks it).
- **Single-member table, header:** `sortColumns` becomes Invested, Value, Gain/Loss, **Returns** (`key: "returns"`), **XIRR** (`key: "xirr"`), Today's change, in that order. The `th` of Returns carries `title="Total gain as a share of money paid in, not annualised."` and the `th` of XIRR carries `title="Yearly rate, worked out from the dates of your investments."` (a test reads the `title` attribute of the `columnheader`; keep the sort button inside the `th` as today). Print mode keeps its plain-label header (the `title` attributes stay).
- **Single-member table, rows:** after the Gain/Loss `td`, a new `td` `data-testid="returns"` with the same classes as the Gain/Loss cell's neighbours (`py-3 px-4 font-medium text-[var(--ui-text)]`) showing `formatXirr(xirrMetaByScheme?.[row.scheme_id]?.since_purchase_return)`; then the existing XIRR `td` (`data-testid="xirr"`, same classes) containing `<XirrFigure value={xirrByScheme[row.scheme_id]} caution={xirrMetaByScheme?.[row.scheme_id]?.xirr_caution} />`. **Equal weight:** no bold, no muted, no colour on either figure. The `tfoot` gets one more empty `td` (its cell count must match the header).
- **Sorting:** `sortHoldings(filteredRows, sort, xirrByScheme, returnsByScheme)` where `returnsByScheme` is built from `xirrMetaByScheme` (`since_purchase_return` per scheme). Remove `displayedXirrByScheme` (the swapped values): XIRR sorts by the annualised rate only.
- **Family table:** `FAMILY_COLUMNS` gains `{ label: "Returns", key: "returns" }` immediately before `{ label: "XIRR", key: "xirr" }` (so nine columns). Header cells for those two get the same `title` tooltips as above (family `th` elements; keep the existing sort buttons). `FamilyFigures`: after the six existing figure cells, add a Returns `td` (`data-testid={child ? "child-returns" : "returns"}`) showing `formatXirr(row.since_purchase_return)` with the same classes as the XIRR cell and the same small mobile label pattern (`FAMILY_COLUMNS[7].label`), then the XIRR `td` (`data-testid={child ? "child-xirr" : "xirr"}`, **now with a test id on the parent too**) containing `<XirrFigure value={row.xirr} caution={row.xirr_caution} />` and its mobile label `FAMILY_COLUMNS[8].label`. The parent row and each child use **their own** figures. In `valueFor` (family sort): `xirr` reads `r.xirr`, `returns` reads `r.since_purchase_return` (no more `resolveXirrDisplay`). The family table's `sm:min-w-[960px]` stays unless the orchestrator's screenshot shows overflow (he will tell you).
- Nothing else in either table changes: the Fund and Category columns, the totals row values, filters, expand and collapse, folio eye, the family phone cards, the plan badge, the links.

### 3. `frontend/src/features/mutual-funds/overview/OverviewPage.tsx` (the mapping)
In the `xirrByScheme, xirrMetaByScheme` memo, each fund's meta becomes `{ xirr_as_of: fund.xirr_as_of, xirr_basis: fund.xirr_basis, since_purchase_return: fund.since_purchase_return, xirr_caution: fund.xirr_caution }` (the two old keys stay in the object; only the new one is added).

### 4. `frontend/src/print/groups/overview/OverviewSections.tsx` (the PDF page's mapping)
The same `meta[fund.scheme_id] = { ..., xirr_caution: fund.xirr_caution }` line, nothing else. The PDF page then shows the same two columns and the chip through the shared table. The print tests check headers, cells and that the page stays static (no buttons); `title` attributes and the chip span are allowed there.

## Red tests (written and committed; fixed: do not edit, weaken or delete)
`frontend/src/features/mutual-funds/overview/HoldingsTable.test.tsx` (**17 of 60 fail now**), `frontend/src/features/mutual-funds/overview/OverviewPage.test.tsx` (**1 of 46**), `frontend/src/print/groups/overview/overview.print.test.tsx` (**6 of 29**). Before you start run these three files and **confirm those counts**. When done: all pass, plus `src/features/mutual-funds` (all of it, including `mfCopy.test.ts` and `guards.test.ts`, whose file count stays **70**: you add no file) and `src/print`.

## Files you may change
`frontend/src/features/mutual-funds/mfCopy.ts`, `frontend/src/features/mutual-funds/overview/HoldingsTable.tsx`, `frontend/src/features/mutual-funds/overview/OverviewPage.tsx`, `frontend/src/print/groups/overview/OverviewSections.tsx`. Anything else: stop and report.
## Do not touch
`backend/**`, `frontend/src/mobile/**`, any `*.test.*` file, `frontend/src/lib/xirrDisplay.ts` and the `types.ts` files (done), the two `SummaryStrip.tsx` files and `frontend/src/components/**` (another lane owns them), the legacy dashboard, the fund page, `package.json`, the lockfile, any token or CSS file.

## Rules that apply here
Tokens only, no hex colours; light and dark come from the tokens; keyboard focus unchanged (the sort buttons inside the headers stay the only new focus stops); every `<button` carries `data-clickable`; no `parseFloat`, `toFixed`, `Intl.`, `console.` or `any`; features may not import other features. **You cannot see the screen:** say so in the report. The orchestrator screenshots the single-member table, the family table and the PDF page at 1280x600 and 1440x810 and tells you exactly what to fix (the two added columns must not create a horizontal scroll where there was none, and must fit the printed page width).

## Checks (PowerShell)
```
wsl.exe -d Ubuntu -- env UNIFOLIO_WT_ROOT=/mnt/c/Users/Dell/lanes UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash /mnt/c/Users/Dell/ag-xr2/Docs/orchestration/wave-fe-check.sh ag-xr2 test src/features/mutual-funds/overview/HoldingsTable.test.tsx src/features/mutual-funds/overview/OverviewPage.test.tsx src/print/groups/overview/overview.print.test.tsx
wsl.exe -d Ubuntu -- env UNIFOLIO_WT_ROOT=/mnt/c/Users/Dell/lanes UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash /mnt/c/Users/Dell/ag-xr2/Docs/orchestration/wave-fe-check.sh ag-xr2 test src/features/mutual-funds src/print
wsl.exe -d Ubuntu -- env UNIFOLIO_WT_ROOT=/mnt/c/Users/Dell/lanes UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash /mnt/c/Users/Dell/ag-xr2/Docs/orchestration/wave-fe-check.sh ag-xr2 types
wsl.exe -d Ubuntu -- env UNIFOLIO_WT_ROOT=/mnt/c/Users/Dell/lanes UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash /mnt/c/Users/Dell/ag-xr2/Docs/orchestration/wave-fe-check.sh ag-xr2 lint src/features/mutual-funds src/print
```
Expected `types` result: one error remains that belongs to the other lane (`MeasureFlip.test.tsx` cannot find `./MeasureFlip`); report it, do not fix it. If WSL is denied on your machine, run `npx vitest run <paths>`, `npx tsc -b`, `npx oxlint <paths>` in PowerShell inside the clone.

## Report (one block, nothing else)
Failing counts before (expect 17, 1, 6) and after; the exact commands and results; `git status --short` (only the four files above, plus untracked docs); decisions the packet did not cover; anything you could not check (visual); Open questions.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-palette-reference-for-workers.md
4. Docs/orchestration/2026-11-24-xr-fe-2-table-packet.md (your task: XR-FE-2)
Work only in C:\Users\Dell\ag-xr2 on branch ag/xr2-table. Tests first: run the three named test files and confirm the failing counts before you change anything. Never run a git command that changes anything. Do not touch backend/**, frontend/src/mobile/**, any *.test.* file, or any file outside the packet's Files list. Use no wording of your own: every string is in the packet. Reply with the report block from the packet, nothing else.
```
