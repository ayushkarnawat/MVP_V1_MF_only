# Packet: E-9 the per-fund "i" on Valuation by Fund (Batch E, Antigravity)
**Status:** READY TO RELAY (written 2026-11-23). **Approved:** the owner's decisions of 23 Nov (`decisions.md`): one "i" per fund replaces the P/E and P/B source pills; the footnote and the "As on" column go. Codex's red tests are merged on `batch/e-dates` (E-8, the commit after `6faf6561`); the shared popover (`components/info/InfoPopover.tsx`) is built (E-7).
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-e-dates-plan.md` (Task E-9). **The two new test files are fixed: you do not edit, weaken or delete `sourceSentence.test.ts` or `ValuationByFund.info.test.tsx`.** The exact sentences, the interface and the layout of the popover are written in `Docs/orchestration/2026-11-23-e8-valuation-info-red-tests-handoff.md` ("The interfaces"): **read it first, it is the specification you build to.**
**Worker:** Antigravity (Gemini). Frontend only. **Your clone:** `C:\Users\Dell\ag-e9` (branch `ag/ag-e9`, cut from `batch/e-dates`). Work only there. Never run a git command that changes anything. Never touch `backend/**`.
Read first: `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins), the E-8 handoff above, then this file; then open `frontend/src/features/mutual-funds/other/ValuationByFund.tsx`, `otherLogic.ts`, `ValuationByFund.test.tsx`, `frontend/src/components/info/InfoPopover.tsx`, `frontend/src/lib/dateRange.ts` and `frontend/src/lib/dataDates.ts`.
**Checks:** `wsl.exe -d Ubuntu -- env UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash "/mnt/c/Users/Dell/ag-e9/Docs/orchestration/wave-fe-check.sh" ag-e9 test src/features/mutual-funds/other` (also `types`, and `lint src/features/mutual-funds/other`).

## What to build
1. In `otherLogic.ts`: `KNOWN_VALUE_SOURCES` and `sourceSentence(value, kind)` exactly as fixed in the E-8 handoff (the sentences, the whole-percent rounding **without float**, the order of the clauses, the default sentence). Use `formatMonthYear` from `lib/dateRange.ts` for `{Month Year}` and `formatDataDate("ratios", as_of)` for the ratios date. No new wording of your own.
2. In `ValuationByFund.tsx`: delete the `Source` pill component and its two uses; delete the footnote paragraph (`Factsheet: printed by the fund house; ... Indicators, not a recommendation.`); delete the `As on` column (header, cell, the `AsOn` component and the now-unused `formatDate` import) and change the table column widths so P/E and P/B share the freed space (`w-[30%]` fund, `w-[35%]` P/E, `w-[35%]` P/B); add **one "i" right after each fund name** built on `InfoPopover` (label `P/E and P/B for {scheme_name}`, title = the fund name, side `bottom`), with the content in the order and words the E-8 handoff fixes: `P/E: ` + sentence, `P/B: ` + sentence, then `Indicators, not a recommendation.`. Keep the range bars, the Nifty 500 tick, the headline sentence, the card's own "How the portfolio average works" button and the two stock lists exactly as they are.
3. Update `frontend/src/lib/dataDates.test.ts`: **remove the one allowlist line** `"features/mutual-funds/other/ValuationByFund.tsx"` (and its comment "Temporary: E-9 ...") so the hard-coded-wording scan covers this file again; the file must then contain no literal "as on" or "as of" (the sentences come from the module and `sourceSentence`).
4. Update `ValuationByFund.test.tsx`: retire exactly the obsolete assertions the E-8 report lists (lines about the as-on date cells, `label shows Factsheet, Factsheet fwd or NSE/BSE`, `hover note names basis and method, and tapping also opens it`, and the first test's `12 Oct 2026` and `10 Oct 2026` checks and its title word "as-on date"). Keep every other assertion and the test count otherwise unchanged. List each removed or edited assertion in the report.
Other files that read the pills (`CostValuationGroup.test.tsx`, `OtherAnalyticsPage.test.tsx`): if one of their assertions breaks because of the removal, change only that assertion and list it (the clickable-control count on the page may change: each pill button is gone and each fund gains an "i" button; update the number with a comment as a previous task did).
Run the whole `src/features/mutual-funds/other` folder, `src/lib/dataDates.test.ts`, `types`, `lint`.

## Files
**May change:** `otherLogic.ts`, `ValuationByFund.tsx`, `ValuationByFund.test.tsx`, `lib/dataDates.test.ts` (the one allowlist line), and, only if an assertion breaks for the reason above, `CostValuationGroup.test.tsx` and `OtherAnalyticsPage.test.tsx`. **Do not touch:** the two E-8 test files, `InfoPopover.tsx`, `SectionCard.tsx`, any other card, `guards.test.ts`, `frontend/src/mobile/**`, `backend/**`, `package.json`, lockfiles. If something else needs an edit, stop and report it.
Rules: tokens only, no hex; no `any`, `parseFloat`, `toFixed`, `Intl.`, `console.`; decimals stay strings (the coverage percent rounding is integer or string arithmetic); every `<button` has `data-clickable` and a `data-effect` (the popover trigger already carries them); plain words, no em dashes; no new dependency. You cannot see the screen: say so.

## Report (one block)
Lane `ag-e9`; failing counts before and after with the exact commands; `git status --short`; every old assertion removed or edited (file, line, old text); decisions the packet did not cover; anything not checked (visual); open questions. No narration.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-23-e8-valuation-info-red-tests-handoff.md (the specification: the sentences and the popover layout)
4. Docs/orchestration/2026-11-23-e9-valuation-info-packet.md (your task: E-9)
Work only in C:\Users\Dell\ag-e9 on branch ag/ag-e9. The two E-8 test files (sourceSentence.test.ts and ValuationByFund.info.test.tsx) are fixed: run them first (show them fail), then build until they pass. Touch only the files the packet lists. Never run a git command that changes anything. Reply with the report block from the packet, nothing else.
```
