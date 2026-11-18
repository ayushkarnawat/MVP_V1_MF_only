# Packet C-7: the `FolioNumber` component and the screens that show a folio (Antigravity, lane G-c)
**Batch C, item 17c.** Plan: `Docs/superpowers/plans/2026-11-17-batch-c-holdings-hygiene-plan.md` (Task C-7). **Design source: `Docs/orchestration/2026-11-12-batch-c-planning-workbook.html`, section 4** ("Show the full folio number": the drawings Today, After shown, After hidden with the eye; fund page folio rows; ledger row detail; and "How the eye icon works"). The workbook is the design: a deviation is a defect; if a drawing and the real component disagree, stop and say so.

**Your clone:** `C:\Users\Ayush\ag-c7` (branch `ag/c7-folio-number`, cut from `batch/c-hygiene` at `60a92898`). Work only there. Never edit `D:\Unifolio code`. Never run a git command that changes anything.
**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), `Docs/orchestration/2026-11-18-palette-reference-for-workers.md`, then this packet.

## What you build
Every screen that shows a folio number shows the **full number as printed** (for example `10234567 / 0`) with a small **eye button** beside it. One click on any eye hides **all** folio numbers in the app at once; the hidden form is `XXXX` + the last four characters of the folio part + the sub-folio (`XXXX4567 / 0`); one more click shows them again. The choice is remembered in this browser and the default is shown (all of that logic already exists, see below). The old masked text (`folio_masked`, the ledger's `folio`) is **never shown again** on these screens; those fields stay in the data for the old staging link and must not be removed from types or fixtures.

## What already exists (committed on your branch; do not rewrite)
- `frontend/src/lib/folioVisibility.ts`: `maskFolio(folio)` and `useFolioVisibility(): { hidden, toggle }` (shared store, saved in `localStorage`, tested green). **Use these; no screen builds its own mask or its own state.**
- The types now carry the full number: `FolioSlice.folio_number` (holdings rows), `FolioInfo.folio_number` (fund page), `InvestmentWithdrawalEntry.folio_number?` (ledger); fixtures and fixture tests are updated.
- `frontend/src/components/mf/FolioNumber.tsx` is a **stub that returns nothing**: replace it with the real component (below). Keep its exported name and props: `FolioNumber({ value, showCopy })`.

## The component (`components/mf/FolioNumber.tsx`)
```
<span class="inline-flex flex-wrap items-center gap-1.5">
  {copy status text, as the fund page shows it today: "Copied" role="status" / the failure role="alert", before the number}
  <span class="font-mono [overflow-wrap:anywhere]">{hidden ? maskFolio(value) : value}</span>   ← ONE text node: the number or its hidden form
  {showCopy && <copy button>}
  <eye button>
</span>
```
- **Number:** monospace, wraps anywhere inside its cell (workbook `overflow-wrap:anywhere`). It takes its size and colour from where it sits; each screen keeps the text classes its line has today (see "Per screen"). Never truncate.
- **Eye button:** `<button type="button">`, `aria-label` `Hide folio numbers` when shown and `Show folio numbers` when hidden, `aria-pressed={hidden}`, only an icon inside (no visible text): lucide `Eye` when shown, `EyeOff` (slashed) when hidden, size 14, `aria-hidden`. Look (workbook `.eyeb`, in tokens): 22 × 22 px (`h-[22px] w-[22px]`), `rounded-md` (6px), `border border-[var(--ui-disabled-border)]`, `bg-[var(--ui-elevated)]`, icon `text-[var(--ui-text-muted)]` and `hover:text-[var(--ui-text)]`, hover background `hover:bg-[var(--ui-row-hover)]`, `inline-flex items-center justify-center`, **visible keyboard focus**: `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]` (palette: 2px #22C55E ring on every interactive element). Click calls `toggle`.
- **Copy button (only when `showCopy`, the fund page rows):** `<button type="button">` with the lucide `Copy` icon (14px, becomes `Check` for 2 seconds after a copy), same 22px footprint without the border, `text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]`, same focus ring. `aria-label` = `Copy folio number ${shown}` where `shown` is what is on screen (so a hidden number is never in its name). Shown: `title="Copies the full number"`, click calls `navigator.clipboard.writeText(value)` (the number, no request to the server), shows `Copied` (role `status`, text `text-xs text-[var(--pos-text)]`) for 2000 ms, clears its timer on unmount. If the clipboard is missing or refuses: `Couldn't copy the folio number.` (role `alert`, `text-xs text-[var(--neg-text)]`). Hidden: `aria-disabled="true"`, `title="Show the number to copy it"`, dimmed (`opacity-40 cursor-not-allowed`), a click does nothing. Do not use the `disabled` attribute (the tip must still show).
- No analytics, no logging, no network call from this component. Never put the number in a `title`, an `id`, a `data-*` attribute or a `console` call.

## Per screen (keep everything not listed exactly as it is today)
1. **`features/mutual-funds/overview/HoldingsTable.tsx`**, two places. (a) The single-member line (around line 404): `{member name}{folios · folio_masked}` becomes the member name, then ` · ` and a `FolioNumber value={f.folio_number}` for each folio (keep the muted `text-xs` of that line). (b) The expanded member rows (around line 428): the `<span>` that printed `f.folio_masked` becomes `<span className="mt-1 block text-xs text-[var(--ui-text-muted)]"><FolioNumber value={f.folio_number} /></span>` per folio.
2. **`features/individual-fund/overview/InvestmentDetails.tsx`**, `FolioRow`: show `<FolioNumber value={folio.folio_number} showCopy />` on the right (number `font-mono text-xs font-semibold text-[var(--ui-text)]` as today). **Delete** the call to `fundPageApi.folioNumber`, the local `copyState` timer logic and the old combined number-plus-icon button: FolioNumber now owns copy. Keep the `<li data-testid={`folio-${folio.folio_id}`}>`, the left label (`Folio · {member}` or `Folio number`) and the row layout. Leave `fundPageApi.folioNumber` itself in `api.ts` (the backend endpoint stays).
3. **`features/individual-fund/overview/TileDialog.tsx`** (the "Current value" drill-down): the `<dd>` that printed `folio.folio_masked` shows `<FolioNumber value={folio.folio_number} />` (the `<dd>` text must equal the number only; the eye has no text).
4. **`features/mutual-funds/transactions/transactionsLogic.ts`**, `ledgerDetail`: the `folio` it returns now comes from `entry.folio_number` (a non-empty string), not from `entry.folio`. `LedgerDetail.folio` keeps its name. An entry with only the old masked `folio` and no `folio_number` counts as having no folio. Update the doc comment above it (it says "as the backend masked it").
5. **`features/mutual-funds/transactions/Ledger.tsx`** (around line 234): the `Folio` fact's `<dd>` shows `<FolioNumber value={extra.folio} />` instead of the raw text (keep its `font-mono text-[11px] text-[var(--ui-text)]`).
6. **`components/mf/OpeningBalanceModal.tsx`**: delete the local `maskFolio` function and print `Folio: ` followed by `<FolioNumber value={gap.folio_number} />` in the same sentence line (keep the rest of the line: the red "units missing" text and the date).
Nothing else in these files changes. No other screen is touched.

## Colours
Only the tokens named above (`--ui-*`, `--pos-text`, `--neg-text`). No hex colours. Dark mode follows the tokens.

## Red tests (already written and committed; fixed, do not edit, weaken or delete)
33 fail now. Run these and confirm **33 failed** before you start:
`src/components/mf/FolioNumber.test.tsx` (11), `src/components/mf/OpeningBalanceModal.test.tsx` (1), `src/features/individual-fund/overview/InvestmentDetails.test.tsx` (6), `src/features/individual-fund/overview/StatBand.test.tsx` (1), `src/features/mutual-funds/overview/HoldingsTable.test.tsx` (5), `src/features/mutual-funds/transactions/Ledger.asks.test.tsx` (5), `.../TransactionsPage.asks.test.tsx` (1), `.../transactionsLogic.asks.test.ts` (3).
When done all pass, and so does everything else under `src/components/mf`, `src/features/mutual-funds`, `src/features/individual-fund` and `src/lib`.

## Files you may change
`frontend/src/components/mf/FolioNumber.tsx`, `frontend/src/components/mf/OpeningBalanceModal.tsx`, `frontend/src/features/mutual-funds/overview/HoldingsTable.tsx`, `frontend/src/features/individual-fund/overview/InvestmentDetails.tsx`, `frontend/src/features/individual-fund/overview/TileDialog.tsx`, `frontend/src/features/mutual-funds/transactions/transactionsLogic.ts`, `frontend/src/features/mutual-funds/transactions/Ledger.tsx`. Anything else: stop and report.
## Do not touch
`backend/**`, `frontend/src/mobile/**` (a separate check of the phone screens comes later; do not edit any phone file even if it reads a folio), `lib/folioVisibility.ts`, every `*.test.*` file and fixture, the types files, `individual-fund/api.ts`, `package.json`.

## Checks (PowerShell)
```
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-c7 test src/components/mf src/lib src/features/mutual-funds src/features/individual-fund
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-c7 types
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-c7 lint src/components/mf src/lib src/features/mutual-funds src/features/individual-fund
```
`lint` must show no unused imports or code left over from the old copy logic.

## Report (one block, nothing else)
Failing counts before (expect 33) and after; exact commands and results; `git status --short` (only files from the list, plus untracked docs); decisions the packet did not cover; anything you could not check (visual; dark mode; phone width); Open questions. The orchestrator screenshots each screen (holdings expanded row, fund page rows, the drill-down, the ledger detail, the coverage-gap dialog) shown and hidden at 1280×600, 1440×810 and phone width, next to the workbook drawings, and sends exact differences; fix only those.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-palette-reference-for-workers.md
4. Docs/orchestration/2026-11-18-c7-folio-number-packet.md (your task: C-7)
Work only in C:\Users\Ayush\ag-c7 on branch ag/c7-folio-number. Tests first: run the named test folders and confirm 33 fail before you change anything. Never run a git command that changes anything. Do not touch backend/** or any file outside the packet's Files list.
When done, reply with the report block from the packet, nothing else.
```
