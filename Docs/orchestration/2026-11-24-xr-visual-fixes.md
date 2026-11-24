# XIRR leads, Returns on the flip side: visual fixes after the orchestrator's browser check (24 Nov 2026)

**Status:** READY TO RELAY. Both lanes passed their red tests and are merged into `batch/xr-returns` (tiles `a6fb5d58`, table `df8e6453`, plus the backend). The orchestrator then rendered the two tiles and both tables in a real browser (a throwaway harness, 1440x900, light and dark, strip width 1100 px) and measured them. Everything matches the design except the items below. **Fix only these; change nothing else.** All numbers are measured in the browser, not guessed.

**Rules unchanged:** work only in your clone; git is read-only for you; no wording of your own; tokens only; the red tests stay green (run the same commands as in your packet and report counts); do not touch `*.test.*` files. The orchestrator has already merged the latest `batch/xr-returns` (including this document) into your branch; just work.

## FE-1 (tiles, clone `C:\Users\Dell\ag-xr1`, branch `ag/xr1-tiles`): the tile height must not change when the tile is flipped
Measured on both tiles (Portfolio and Mutual Funds): the XIRR face and the Returns face differ in height, so the strip jumps on a flip.

| Case | XIRR face | Returns face | Cause |
|---|---|---|---|
| A chip shows (`held under 1 yr` or `one transaction`) | 23 px chip row | 20 px empty chip row | the chip row is `min-h-5` (20 px) but the chip is 23 px tall |
| The opening-balance disclaimer link shows | caption row 51 px (3 lines) | caption row 66 px (4 lines) | the Returns-face link text (`Since purchase, not annualised — opening-balance disclaimer may apply ›`) is longer and wraps to a fourth line; the row only reserves `min-h-8` (32 px) |

**Make exactly these two changes in both `frontend/src/features/portfolio/sections/SummaryStrip.tsx` and `frontend/src/features/mutual-funds/overview/SummaryStrip.tsx`:**
1. The chip row: change `min-h-5` to `min-h-6` (24 px) on **both** faces, so a face with a chip and a face without take the same height.
2. The caption row: keep `min-h-8` when there is no disclaimer; **when a disclaimer exists for the shown view, use `min-h-[4.25rem]` (68 px) on both faces** (a conditional class on the same `div`). Do not change the link text.
Then check yourself in the tests that nothing else moved, and report. **Expected after the fix (the orchestrator will measure):** with a chip, XIRR face and Returns face are the same height; with the disclaimer, the same height on both faces.

## FE-2 (table, clone `C:\Users\Dell\ag-xr2`, branch `ag/xr2-table`): the PDF export's Overview table is too cramped
Screen tables are correct at 960, 1100 and 1440 px: no horizontal scroll, the columns, chips and dashes are as designed. **Do not change the screen look.** In **print mode only** (`usePrintMode()` is not null), the single-member table has eight equal-width columns (`table-fixed`, 80 px each at an A4 content width of about 680 px and 11 px text), so:
- the Invested and Value numbers (`₹12,00,000`) overflow their cell and touch each other (`scrollWidth` greater than `clientWidth`);
- the `held under 1 yr` chip wraps onto three lines in the XIRR cell;
- the Fund names wrap onto four or five lines.
The family table in print is fine (57 px columns, no overflow): leave it.

**Make exactly these changes in `frontend/src/features/mutual-funds/overview/HoldingsTable.tsx`, single-member table, print mode only (the screen classes stay as they are):**
1. Header cells: `Fund` gets `style={{ width: "24%" }}` and `Category` gets `style={{ width: "11%" }}` in print mode (the family table already does this for Fund).
2. Every body and footer cell of the single-member table uses `px-1` instead of `px-4` in print mode (as the family cells already do with `px-1 py-3`), keeping `py-3`.
3. The local `CautionChip` in print mode: `text-[10px]`, `px-1.5`, `leading-tight`, `text-center`, and allow wrapping (`whitespace-normal`) so a long chip takes at most two lines and never overflows its cell. Screen mode keeps today's chip classes.
**Expected after the fix (the orchestrator will measure at 680 px with 11 px text):** no cell has `scrollWidth` greater than `clientWidth`; the XIRR chip takes at most two lines; the Fund name takes at most three lines.

## Paste-ready prompts (reuse the same two projects; nothing new to create)

FE-1: worker Antigravity; project `C:\Users\Dell\ag-xr1` (reuse); branch `ag/xr1-tiles`.
```
You are the frontend worker for Unifolio (Antigravity). Read Docs/orchestration/2026-11-24-xr-visual-fixes.md, section FE-1 only. Work only in C:\Users\Dell\ag-xr1 on branch ag/xr1-tiles. Make exactly the two changes in the section, in the two SummaryStrip.tsx files it names, and nothing else. Never run a git command that changes anything. Do not touch backend/**, any *.test.* file, or any other file. Use no wording of your own. Re-run the same test, types and lint commands as in your packet and reply with a short report: the two changes, the counts, git status --short, anything you could not check.
```

FE-2: worker Antigravity; project `C:\Users\Dell\ag-xr2` (reuse); branch `ag/xr2-table`.
```
You are the frontend worker for Unifolio (Antigravity). Read Docs/orchestration/2026-11-24-xr-visual-fixes.md, section FE-2 only. Work only in C:\Users\Dell\ag-xr2 on branch ag/xr2-table. Make exactly the three print-mode changes in the section, in frontend/src/features/mutual-funds/overview/HoldingsTable.tsx, and nothing else; the screen look must not change. Never run a git command that changes anything. Do not touch backend/**, any *.test.* file, or any other file. Use no wording of your own. Re-run the same test, types and lint commands as in your packet and reply with a short report: the three changes, the counts, git status --short, anything you could not check.
```
