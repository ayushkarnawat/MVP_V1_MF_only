# Packet FE-1b: the "as on" date, "not annualised" and the dash on the XIRR figures (Antigravity)
**Batch A, FX-8d and FX-8e, front end.** The backend is done and committed (`batch/a-xirr-fixes` 384ba2d1: it already sends the new fields). The red tests and types are done (`a29b8282`, FE-1a). You make the red tests pass and change nothing else. Spec: `Docs/orchestration/2026-11-17-batch-a1-xirr-planning-workbook.html` (FX-8d "the screen says which date"; FX-8e option 1, "show the return since purchase"). Owner decisions, 19 Nov: FX-8d approved; FX-8e option 1 approved, plus a dash for flows that net to zero (already a dash today). Copy rules: plain words, **no em dashes**, no advice wording.

**Your clone:** `C:\Users\Ayush\ag-fe1b` (branch `ag/fe1b-xirr-labels`, cut from `batch/a-xirr-fixes` at `a29b8282`). Work only there. Never edit `D:\Unifolio code`. Never run a git command that changes anything.
**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), `Docs/orchestration/2026-11-18-palette-reference-for-workers.md`, then this packet.

## What the API sends (additive; each may be absent or null; old payloads must render exactly as today)
- **Tile figures** (Portfolio summary; Mutual Funds holdings): `xirr_as_of` (ISO date), `lifetime_xirr_basis`, `current_holdings_xirr_basis` (`"annualised"` or `"since_purchase"`), `lifetime_since_purchase`, `current_holdings_since_purchase` (a decimal string, e.g. `"0.2"`). The existing `lifetime_xirr` and `current_holdings_xirr` still hold the **annualised** rate.
- **Per fund** (analytics benchmark funds row, consolidated holding row and its children): `xirr_as_of`, `xirr_basis`, `since_purchase_return`; `xirr` is `null` for flows that net to zero on one day (the existing dash).

## Behaviour to build (the tests are the exact oracle)
1. **Portfolio tile** `features/portfolio/sections/SummaryStrip.tsx`. For the shown basis (Lifetime or Current): when that figure's basis is `since_purchase` and its since-purchase value is not null, show `formatXirr(since_purchase_value)` in `value-xirr` and the caption `Return since purchase, not annualised` (this replaces the existing caption, `Since inception` or `Current holdings`, for that figure only). Otherwise exactly today's value and caption. When `xirr_as_of` is a non-empty string, add one line inside the `metric-xirr` tile: `data-testid="xirr-as-of"`, text `As on ` + `formatDate(xirr_as_of)` (`import { formatDate } from "@/lib/format"`), small muted text like the caption (`text-xs text-[var(--ui-text-muted)]`). Absent or null: no such line. The opening-balance disclaimer link keeps working (it uses whatever caption is shown).
2. **Mutual Funds tile** `features/mutual-funds/overview/SummaryStrip.tsx`: the same, reading the `XirrBundle` keys `lifetime`, `current`, `lifetime_xirr_basis`, `current_holdings_xirr_basis`, `lifetime_since_purchase`, `current_holdings_since_purchase`, `xirr_as_of`. In `features/mutual-funds/api.ts`, `getHoldingsBundle` must copy the five API metadata keys into `XirrBundle` under their API names (`body.xirr_as_of ?? null`, and so on); existing keys unchanged.
3. **Holdings table** `features/mutual-funds/overview/HoldingsTable.tsx`: a new optional prop `xirrMetaByScheme?: Partial<Record<string, { xirr_as_of?: string | null; xirr_basis?: XirrBasis | null; since_purchase_return?: string | null }>>` keyed by `scheme_id`. **Main row:** when `xirrMetaByScheme[scheme_id]?.xirr_basis === "since_purchase"` and `since_purchase_return` is not null, the XIRR cell (`data-testid="xirr"`) shows `formatXirr(since_purchase_return)` plus a small label `since purchase` (muted, `text-[11px]`) whose accessible name is `Return since purchase, not annualised` (use `aria-label` on a `<span>`; a `title` with the same words is welcome). Otherwise exactly today's cell (the `xirrByScheme` value, or the existing dash for `null`). **Consolidated parent rows and expanded children** (`xirr` cells; the child cell has `data-testid="child-xirr"`): the same rule using the row's own `xirr_basis` and `since_purchase_return`. **Sorting by XIRR** uses the **figure shown** (the since-purchase value for a short row, otherwise the annualised rate), in both directions, for main rows and for parents.
4. **OverviewPage** `features/mutual-funds/overview/OverviewPage.tsx`: build `xirrMetaByScheme` from `bench.data.funds` in the same mapping as `xirrByScheme` (`xirr_as_of`, `xirr_basis`, `since_purchase_return` under the API names) and pass it to `HoldingsTable`.
5. A small shared helper is welcome (a new file such as `features/mutual-funds/xirrDisplay.ts` exporting a function that returns the figure to show and its label for a basis and two values) so the three places use one rule; keep the Portfolio tile on its own import boundary (features may not import other features: if the Portfolio tile needs the same rule, write its few lines locally or put a helper under `src/lib/`; say which in the report).

## Red tests (already written and committed; fixed, do not edit, weaken or delete)
`frontend/src/features/portfolio/sections/SummaryStrip.test.tsx`, `frontend/src/features/mutual-funds/overview/SummaryStrip.test.tsx`, `frontend/src/features/mutual-funds/overview/HoldingsTable.test.tsx` (22 new tests: **11 red now**, 11 guards that pass today). Before you start run the three files and confirm **11 failed**. When done: all pass, plus the rest of `src/features/portfolio` and `src/features/mutual-funds`.

## Files you may change
`frontend/src/features/portfolio/sections/SummaryStrip.tsx`, `frontend/src/features/mutual-funds/overview/SummaryStrip.tsx`, `frontend/src/features/mutual-funds/overview/HoldingsTable.tsx`, `frontend/src/features/mutual-funds/overview/OverviewPage.tsx`, `frontend/src/features/mutual-funds/api.ts`, and (new, optional) one helper file as in item 5. Anything else: stop and report.
## Do not touch
`backend/**`, `frontend/src/mobile/**` (phone stays as it is), any `*.test.*` file, the three `types.ts` files (done), `package.json`, the individual fund page, benchmark and window figures, the legacy dashboard.

## Rules that apply here
Tokens only (`--ui-*`, `--pos`, ...), no hex colours; every state in the packet exists; keyboard focus unchanged; a figure never gets a new colour; "not annualised" is plain text, not a tooltip-only fact (the caption and the visible `since purchase` label are visible). You cannot see the screen: say so in the report; the orchestrator screenshots it.

## Checks (PowerShell)
```
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-fe1b test src/features/portfolio/sections/SummaryStrip.test.tsx src/features/mutual-funds/overview/SummaryStrip.test.tsx src/features/mutual-funds/overview/HoldingsTable.test.tsx
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-fe1b test src/features/portfolio src/features/mutual-funds
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-fe1b types
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-fe1b lint src/features/portfolio src/features/mutual-funds
```
If WSL is denied on your machine (it was for Codex), run the same in PowerShell inside the clone: `npx vitest run <paths>`, `npx tsc -b`, `npx oxlint <paths>`.

## Report (one block, nothing else)
Failing counts before (expect 11) and after; the exact commands and results; `git status --short` (only the files above, plus untracked docs); decisions the packet did not cover (including where the shared rule lives); anything you could not check (visual); Open questions.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-palette-reference-for-workers.md
4. Docs/orchestration/2026-11-20-fe1b-xirr-labels-packet.md (your task: FE-1b)
Work only in C:\Users\Ayush\ag-fe1b on branch ag/fe1b-xirr-labels. Tests first: run the three named test files and confirm 11 fail before you change anything. Never run a git command that changes anything. Do not touch backend/**, frontend/src/mobile/**, any *.test.* file, or any file outside the packet's Files list. Reply with the report block from the packet, nothing else.
```
