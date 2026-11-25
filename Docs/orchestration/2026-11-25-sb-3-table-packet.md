# Packet SB-3: the holdings table's caution note (Antigravity)
**Summary bar polish, item 12; Plan 4, Task 4.** The shared `XirrCautionChip` now has two variants (SB-1, merged in `batch/sb`): `pill` (the tiles; bordered, tinted, with a status dot) and `note` (the table: no border, a dot and a small coloured line). You make the Mutual Funds holdings table use the shared `note` chip, so the table and the tiles can never drift. **Words, tooltips and numbers do not change. The PDF report must look exactly as today (owner rule, 25 Nov): the table is also drawn inside the printed report, so the print look is kept as it is.** Visual spec: `Docs/orchestration/2026-11-24-head-of-family-d11-plan.html`, lines 178 to 254 (the `.cell-note` rule and the `xtab` table). Full rules and tokens: `Docs/orchestration/2026-11-25-sb-1-primitives-packet.md` (read it; it wins on anything not said here).

**Your clone:** `C:\Users\Dell\ag-sb3` (branch `ag/sb3-table`, cut from `batch/sb`). Work only there. Never run a git command that changes anything.
**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), `Docs/orchestration/2026-11-18-palette-reference-for-workers.md`, the SB-1 packet, then this packet.
**If your tools cannot run WSL or npm:** run **no** shell command at all, request no bypass; make the edits, re-read the edited file once, and report "checks not run (tools unavailable)": Claude runs every check.

## The one file you change
`frontend/src/features/mutual-funds/overview/HoldingsTable.tsx`. **No new file** (the folder is capped at 70 files by `features/mutual-funds/guards.test.ts`). **Do not touch** `components/**` (`XirrCautionChip.tsx` is finished), any test, any baseline JSON, `backend/**`, `frontend/src/mobile/**`, the Mutual Funds `SummaryStrip.tsx` (SB-2), any other file. No wording of your own; no emojis.

## The work
1. **Print stays as it is.** Rename the local function `CautionChip` (~L53-75) to `PrintCautionChip` and keep it **byte for byte** (same classes, same text, `role="note"`, `data-testid="xirr-caution"`, title, aria-label), but use it **only when `printMode` is true**. (`usePrintMode()` is already called inside it; keep that.)
2. **Screen uses the shared chip.** `import { XirrCautionChip } from "@/components/XirrCautionChip"` (use the import style the file already uses for neighbours). Rewrite `XirrFigure` (~L76-82) so that: `const printMode = usePrintMode();` and `{caution ? (printMode ? <PrintCautionChip caution={caution} /> : <XirrCautionChip caution={caution} variant="note" />) : null}`. The wrapper `<div className="flex flex-col items-start gap-0.5">` and the figure `<span>{formatXirr(value)}</span>` stay for print; **on screen the wrapper aligns to the end**: `className={printMode ? "flex flex-col items-start gap-0.5" : "flex flex-col items-end gap-0.5"}`.
3. **Right-align the two numeral columns on screen only** (the page's mockup: `xtab .r`). In the single-member table: the `<td data-testid="returns">` and `<td data-testid="xirr">` (~L315-323) get `text-right` when `!printMode` (leave their other classes); the header cells of the **Returns** and **XIRR** columns (columns array ~L167-168; find where these headers render and add `text-right` for these two when `!printMode`; the sort button inside must stay clickable and keep its label, tooltip and `data-clickable`/`data-effect`; if the header button is `inline-flex`, align it with `justify-end`). In the family table: the two `<td>`s of `FamilyReturns`-style figures at the end of the row (~L414-422, `FAMILY_COLUMNS[7]` and `[8]`) get `text-right` when `!printMode`, and the matching header cells the same. **In print mode nothing changes** (`printMode` classes stay exactly as today).
4. Nothing else in the file changes.

## What must be true
Screen (non-print): under the XIRR figure the note shows a small status dot and the same words (`held under 1 yr` in the warm colour, `one transaction` in the neutral colour), right-aligned with the figure, with the same tooltip; the Returns and XIRR numbers and their headers are right-aligned in both tables; sorting by Returns and by XIRR still works both ways; no horizontal scroll that was not there before. Print (the PDF report, `usePrintMode()` true): **identical to today**.

## Checks (Claude runs them; you only make the edit)
Expected before your work: `HoldingsTable.test.tsx > shared table caution note > table_note_uses_the_shared_caution_component` is red (`data-variant` and `caution-dot` missing); after: it and every other test of the file green (the print-mode tests keep passing because print keeps the old chip), `features/mutual-funds/guards.test.ts` green, `types` and `lint` clean.

## Report (one block, nothing else)
Failing counts before and after (or "checks not run (tools unavailable)"); commands and results; `git status --short` (expected: only `HoldingsTable.tsx`); decisions the packet did not cover (including where you found the column headers); anything you could not check; Open questions.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-palette-reference-for-workers.md
4. Docs/orchestration/2026-11-25-sb-1-primitives-packet.md (the shared blocks and rules)
5. Docs/orchestration/2026-11-25-sb-3-table-packet.md (your task: SB-3)
Work only in C:\Users\Dell\ag-sb3 on branch ag/sb3-table.
IMPORTANT: run NO shell commands at all: no wsl.exe, no npm or npx, no git, no tests, no type check, no lint, and never request a sandbox bypass. This machine blocks them and a blocked command stops your whole task. Ignore every "run the checks" instruction: Claude runs all checks after you.
Do only this: read the packets, edit the ONE file the packet names with your file tools, re-read it once for syntax, imports and strings, then reply.
Do not touch backend/**, frontend/src/mobile/**, frontend/src/components/**, any *.test.* file, any baseline JSON, the Mutual Funds SummaryStrip.tsx, or any file other than frontend/src/features/mutual-funds/overview/HoldingsTable.tsx. The PDF (print mode) must look exactly as today. Use no wording of your own. Reply with the report block from the packet, writing "checks not run (tools unavailable)" for every check, nothing else.
```
