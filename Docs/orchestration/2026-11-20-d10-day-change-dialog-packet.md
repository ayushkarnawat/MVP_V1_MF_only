# Packet D-10: the "Everything that changed today" pop-up component (Antigravity, front end)
**Batch D, item 15.** Owner approved Batch D on 19 Nov. Plan: `Docs/superpowers/plans/2026-11-17-batch-d-charts-plan.md` (Task D-10; read "Global Constraints" and "Review Focus"). **Spec: `Docs/orchestration/2026-11-13-batch-d-planning-workbook.html`, section 4 ("View all by day's change" pop-up).** Open that file in a browser: it has a working mockup of all eleven stages (pick a stage, or click inside it), with the measurements and the copy. **The workbook is the design: if your build and the mockup differ, the mockup wins; if the mockup and these tests differ, stop and say so.** Colours come only from the palette tokens (`Docs/orchestration/2026-11-18-palette-reference-for-workers.md`; the text on the bright green is dark `#111111`, white only on the pressed deep green). Why Antigravity: the front-end checks run for you.

**Your clone:** `C:\Users\Ayush\ag-d10` (branch `ag/d10-day-change-dialog`, cut from `batch/d-popup` at `7e90fade`'s code, which is the D-9 red tests `596d7394`). Work only there. Never edit `D:\Unifolio code`. Never run a git command that changes anything.
**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), `Docs/orchestration/2026-11-18-palette-reference-for-workers.md`, `Docs/orchestration/2026-11-20-d9-popup-red-tests-handoff.md` (the interface and the decisions on stage 4), then this packet.

## The task
Create **`frontend/src/features/home/components/DayChangeDialog.tsx`** so that `DayChangeDialog.test.tsx` (14 tests, written by D-9) passes. **Do not wire it into `Movers.tsx`**: the link, the fetch on open and the `Movers` props are task D-11 (Codex); the three red tests in `Movers.test.tsx` stay red until then.
- **Props are fixed** (do not add or rename any):
  ```ts
  export interface DayChangeDialogProps {
    open: boolean;
    onClose: () => void;                       // Escape, the cross, the footer Close and an outside click each call it once
    initialView: MoversView;                   // the card's grouping when the link was clicked
    card: MoversResponse;                      // net change, percent and the Gained/Lost totals are copied from it AT ONCE (stage 2)
    loadAll: (view: MoversView) => Promise<MoversAllResponse>;   // one call per view, on its FIRST visit; a view already fetched is reused
    hideValues: boolean;                       // rupees become dots, percentages stay
  }
  ```
  The types `MoversAllResponse`, `MoverAllBarOut`, `MoverWaitingOut` already exist in `features/home/types.ts` (D-9 added them; do not change them).
- **What it shows** (all from the workbook section 4; the tests pin the words that matter): dialog named **"Everything that changed today"**; the date and the net change tinted green, red or grey with the gained-versus-lost bar and both totals; a soft pill switch **Fund, Category, Sector** (a `role="group"` named **"Group by"** with three buttons, `aria-pressed`, starting on `initialView`); the list: **gainers then losers, largest first**, each row with the fund logo (`SchemeLogo`), name, a bar that grows left (lost) or right (gained) **from one centre line**, the rupee change with its percentage underneath where the data has one; group headers with subtotals that stay at the top while the list scrolls (`position: sticky`); a collapsed group **"No change"** at the end (button with `aria-expanded`); funds **waiting for today's price** listed apart with a clock mark, never as zero, with a **Partial** badge (reuse `PartialDataBadge`); the **Estimated** badge and the estimate footer in the sector view; the footer line "Rows add up to the net change." (sector: the estimate wording the card uses) and a Close button.
- **States:** loading (the summary is already there, copied from the card; the list shows a placeholder with the text **"Loading every fund"**), the fund, category and sector views, a category row that **opens its funds** (button with `aria-expanded`, funds listed under it), the waiting list, markets closed (a grey summary and a short message with the date of the latest prices, not an empty list), and an error (the summary stays, the list says it could not load and offers **"Try again"**, which repeats the fetch; the card behind is untouched).
- **Data rules:** every amount arrives as a decimal **string**; format with `formatRupees` / `formatSignedRupees` / `formatSignedPercent` from `../homeFormat`; **never add or round money in the client** (the totals come from the card; the rows already add up). Hide-values: the dots are `••••••` (see `AllocationClassDialog.tsx` for the same rule and its `MASK`); percentages stay.
- **Dialog behaviour (a real dialog):** use the app's `Dialog` primitive (`@/components/ui/dialog`) the way `AllocationClassDialog.tsx` does; focus moves in on open and is **trapped**; **Escape, the cross and an outside click close it**; focus **returns to the link that opened it** (it is the caller's element: accept it the way `TutorialDialog.tsx` does with its optional return target, or let the primitive restore it; the test "Escape, the cross and an outside click close it; focus is trapped inside and returns to the link" decides). Rows sit in a list a screen reader can walk. The pop-up is for the laptop; the phone version is planned later and `frontend/src/mobile/**` is untouched.
- **Reuse, do not copy:** `MoverRow` (its bar and subtitle rules, `moversCopy.ts`), `ChangeBadge`, `FundLink` (a row that is exactly one fund links to its page), `PartialDataBadge`, `SchemeLogo`. If a row needs something `MoverRow` does not do (the centre-line bar), build it in the new file; do not edit `MoverRow` (its tests are the card's oracle).

## Tests
`src/features/home/components/DayChangeDialog.test.tsx` is the oracle: **run it first and show it fail (the module does not exist), then make it pass.** Every older test under `features/home` must pass unchanged. Do not edit any test. If a test cannot be satisfied from the data the route returns, or two tests contradict each other: **stop and report**, do not bend the component.

## Files you may change
New: `frontend/src/features/home/components/DayChangeDialog.tsx` (and, only if it helps, one small helper file next to it, listed in the report). Anything else (including `Movers.tsx`, `HomePage.tsx`, `types.ts`, `homeFormat.ts`, `moversCopy.ts`, any test): **stop and report**.
## Do not touch
`backend/**`, `frontend/src/mobile/**`, `features/home/home-tokens.css`, `home-tokens.test.ts`, `index.css`, `package.json`, lockfiles, `MoverRow.tsx`, the existing one-row panel in `Movers.tsx`.

## Checks (PowerShell)
```
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-d10 test src/features/home/components/DayChangeDialog.test.tsx
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-d10 test src/features/home
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-d10 types
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-d10 lint src/features/home
```
Expected after your work: all 14 `DayChangeDialog` tests pass; the three `Movers` D-11 tests are the only red ones in `features/home`; types clean; lint adds no warning. If WSL is denied on your machine, run the same in PowerShell inside the clone: `npx vitest run <paths>`, `npx tsc -b`, `npx oxlint <paths>`.

## Report (one block, nothing else)
Failing counts before and after; the exact commands and results; `git status --short`; the exact export of the new file; which existing components you reused and what you built new; decisions the packet did not cover; anything you could not check (visual: the orchestrator compares the dialog to the mockup at 1280x600, 1440x810 and 1536x730, light and dark); Open questions.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-palette-reference-for-workers.md
4. Docs/orchestration/2026-11-20-d9-popup-red-tests-handoff.md
5. Docs/orchestration/2026-11-20-d10-day-change-dialog-packet.md (your task: D-10)
Open Docs/orchestration/2026-11-13-batch-d-planning-workbook.html, section 4, and build to its mockup (the workbook is the design). Work only in C:\Users\Ayush\ag-d10 on branch ag/d10-day-change-dialog. Tests first: run DayChangeDialog.test.tsx and show it fail before you create the component; then make it pass. Create only frontend/src/features/home/components/DayChangeDialog.tsx (plus at most one small helper beside it); do not wire it into Movers.tsx (that is task D-11). Props are fixed by the packet. Never run a git command that changes anything. Do not touch backend/**, frontend/src/mobile/**, home-tokens.css, home-tokens.test.ts, MoverRow.tsx or any test. Reply with the report block from the packet, nothing else.
```
