# Packet: E-6a date labels on the Mutual Funds tabs and the Portfolio tile (Batch E, Antigravity)
**Status:** READY TO RELAY (written 2026-11-23). **Approved:** the owner's date decisions of 23 Nov (`decisions.md`, "Dates (E)").
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-e-dates-plan.md` (Task E-6 and its amendments). **Audit (the list of every label and the old text of every test):** `Docs/orchestration/2026-11-20-date-audit.md`, sections 2 and 5. **Design:** `Docs/orchestration/2026-11-13-batch-e-planning-workbook.html` (section 2). Words are fixed below: **copy never changes except where this packet says so.**
**Worker:** Antigravity (Gemini). Frontend only. **Your clone:** `C:\Users\Dell\ag-e6a` (branch `ag/ag-e6a`, cut from `batch/e-dates`). Work only there. Never run a git command that changes anything. Never touch `backend/**`.
Read first: `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins), then this file. Open `frontend/src/lib/dataDates.ts` (the module you must use) and its test.
**Checks** (from PowerShell; the roots are set for this laptop):
```
wsl.exe -d Ubuntu -- env UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash "/mnt/c/Users/Dell/ag-e6a/Docs/orchestration/wave-fe-check.sh" ag-e6a test <paths under src/>
... ag-e6a types
... ag-e6a lint <paths>
```

## The task (replace the wording through the module; nothing else changes)
Every label below is built today with `formatDate` and a hard-coded "as on" or "Ref:". Rebuild each from `formatDataDate(kind, iso)` (or `<DataDateLabel kind iso />`), so no source file outside the module writes "as on" or "as of" itself. Keep every `data-testid`, class, layout and the order of the parts. Keep a part out when its date is missing, as today.
| # | File (under `frontend/src/features/`) | Today | After |
|---|---|---|---|
| 1 | `mutual-funds/overview/SummaryStrip.tsx` (~388, `xirr-as-of`) | `As on 12 Nov 2026` | `Prices as on 12 Nov 2026` (kind `prices`) |
| 2 | `portfolio/sections/SummaryStrip.tsx` (~372, `xirr-as-of`) | `As on 12 Nov 2026` | `Prices as on 12 Nov 2026` |
| 3 | `mutual-funds/allocation/AssetClassCard.tsx` (~89, `as-on`) | `Values as on 24 Oct 2026 · Holdings as on 30 Sep 2026` | `Prices as on 24 Oct 2026 · Holdings as on September 2026` |
| 4 | `mutual-funds/allocation/MarketCapCard.tsx` (~172, `as-on`) | same, then `· AMFI classification effective from 01 Jul 2026.` | `Prices as on 24 Oct 2026 · Holdings as on September 2026 · Market-cap list effective 1 Jul 2026.`; the no-classification sentence `No applicable AMFI classifications for these holdings.` stays exactly |
| 5 | `mutual-funds/other/TerLadder.tsx` (~53, `ter-ref`) | `Ref: 31 Mar 2026` | `Fees as on March 2026` (kind `fees`) |
| 6 | `mutual-funds/other/ValuationSpectrum.tsx` (~56, `coverage-<kind>`) | `Ratio data cover 86.4% of equity exposure · Fundamentals as on 23 Oct 2026` | `... · Ratios as on 23 Oct 2026` (kind `ratios`); the coverage part unchanged |
| 7 | `mutual-funds/other/ValuationSpectrum.tsx` (~157, `valuation-dates`) | `Values as on 24 Oct 2026 · Holdings as on 30 Sep 2026.` | `Prices as on 24 Oct 2026 · Holdings as on September 2026.` |
Monthly data shows as a month (the module does it). **The per-card lines stay for now** (the strip that replaces them is built later; removing them now would leave the cards with no date): do not delete a line, only rebuild its words.

## Tests (update the old assertions in the same change; list each in the report)
Per audit section 5, in these files only: `mutual-funds/allocation/AssetClassCard.test.tsx`, `MarketCapCard.test.tsx`, `mutual-funds/other/TerLadder.test.tsx`, `ValuationSpectrum.test.tsx`, `mutual-funds/overview/SummaryStrip.test.tsx`, `portfolio/sections/SummaryStrip.test.tsx`. Write the new expected strings first, run them (they fail for the old wording), then change the components. **Changing an old assertion is allowed only for the strings in the table above**; any other assertion that breaks is a finding: stop and report it.
Run: `ag-e6a test src/features/mutual-funds/allocation src/features/mutual-funds/other src/features/mutual-funds/overview src/features/portfolio`, then `types`, then `lint` on those folders.

## Files
**May change:** the six component files and the six test files above, nothing else. **Do not touch:** `lib/dataDates.ts` or its tests (the pending scan test stays skipped: Claude enables it after the other lane merges), `DataDateLabel.tsx`, `ValuationByFund.tsx` (the "As on" column goes in a later task), `MutualFundsFrame.tsx`, any Home or fund-page file (another lane owns them), `SectionCard.tsx`, `guards.test.ts`, `frontend/src/mobile/**`, `backend/**`, `package.json`, lockfiles.
If a file outside this list needs an edit (for example a shared helper), stop and report it under Open questions.

## Rules
Tokens only, no hex; no `parseFloat`/`toFixed`/`Intl.`/`console.`/`any`; no new dependency; no change to a string this packet does not list. You cannot see the screen: say so in the report; Claude takes the screenshots.

## Report (one block)
Lane `ag-e6a`; failing counts before and after with the exact commands; `git status --short`; every old assertion you changed (file, old string, new string); decisions the packet did not cover; anything not checked (visual); open questions. No narration.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-23-e6a-tabs-date-labels-packet.md (your task: E-6a)
Work only in C:\Users\Dell\ag-e6a on branch ag/ag-e6a. Tests first (show them fail for the old wording), then change the components. Use formatDataDate or DataDateLabel from frontend/src/lib/dataDates.ts; do not edit that module. Touch only the files the packet lists. Never run a git command that changes anything. Reply with the report block from the packet, nothing else.
```
