# Handoff: E-8 red tests for the P/E and P/B "i" on Valuation by Fund (Batch E, Codex, new test files only)
**Status:** READY TO RELAY (written 2026-11-23). **Approved:** the owner's decisions of 23 Nov (`decisions.md`): the shared "i" popover is approved and built (E-7, `batch/e-dates` at `5fd20c26`); the per-fund "i" replaces the P/E and P/B source pills; the "As on" column and the footnote go.
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-e-dates-plan.md` (Tasks E-8 and E-9). **Design:** `Docs/orchestration/2026-11-13-batch-e-planning-workbook.html` (item 16). Audit: `Docs/orchestration/2026-11-20-date-audit.md` (rows #6 to #8 and section 7).
**Worker:** Codex. **It cannot run the front-end checks (no WSL): write the tests, do not try to run vitest, report BLOCKED on running.** Claude runs `wave-fe-check.sh ed test src/features/mutual-funds/other` and confirms each new test is red for the stated reason.
**Work in:** `C:\Users\Dell\lanes\unifolio-e-dates` (worktree, branch `batch/e-dates`). Git is read-only. Never in the main checkout.
Read first: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins), then this file; then open `frontend/src/features/mutual-funds/other/ValuationByFund.tsx`, `ValuationByFund.test.tsx` (the fixtures and the mount helper are the model: reuse the same `sample()` data shape and mocks), `otherLogic.ts`, `frontend/src/features/mutual-funds/types.ts` (`ValuationValue`, `ValuationFund`), `frontend/src/components/info/InfoPopover.tsx`, and `frontend/src/lib/dateRange.ts` (`formatMonthYear` gives "September 2026") and `frontend/src/lib/dataDates.ts` (`formatDataDate("ratios", iso)` gives "Ratios as on 12 Nov 2026").

## The interfaces (fixed here; write tests against them, do not write the code)
In `frontend/src/features/mutual-funds/other/otherLogic.ts` (the build is the next task, E-9):
```ts
export const KNOWN_VALUE_SOURCES = ["factsheet", "computed", "none"] as const;
export function sourceSentence(
  value: { source: string; basis: string | null; method: string | null; coverage_pct: string | null; as_of: string | null; reason?: string | null; unavailable_reason?: string | null },
  kind: "pe" | "pb",
): string;
```
**The sentences are fixed (plain words, exact text; `{Month Year}` is `formatMonthYear(as_of)`, e.g. `October 2026`):**
- `factsheet`, basis `forward`: `Printed on the fund's factsheet for {Month Year}, based on forward earnings.` (for both P/E and P/B the words are `forward earnings`).
- `factsheet`, basis `trailing`: `Printed on the fund's factsheet for {Month Year}, based on trailing earnings.` for `pe`, `... based on trailing book value.` for `pb`.
- `factsheet`, any other basis: `Printed on the fund's factsheet for {Month Year}.`
- `computed`: `Worked out from the fund's published holdings. Stock ratios come from NSE and BSE daily data, combined as a {method words}. Covers {N}% of the fund's equity. {Ratios date}.` where `{method words}` is `harmonic mean` for method `harmonic`, `weighted average` for `weighted_average`, and for anything else the sentence reads `combined into one figure` instead of `combined as a ...`; `{N}` is `coverage_pct` rounded to a whole number with no float (`"92.4"` gives `92`, `"100"` gives `100`), and when `coverage_pct` is null the whole `Covers ...` sentence is left out; `{Ratios date}` is `formatDataDate("ratios", as_of)` (e.g. `Ratios as on 12 Oct 2026`), left out when `as_of` is null.
- `none` (a withheld figure): the **same plain words the cell shows today**: `unavailable_reason` when set; otherwise `Not enough data.` followed by a space and `reason` when `reason` is set; otherwise `Not enough data.`
- any other source: `We could not tell where this figure comes from.`

In the UI (`ValuationByFund.tsx`, built in E-9): each fund row shows **one "i" right after the fund name**, built on `InfoPopover` (its trigger is a button named `P/E and P/B for {scheme_name}`; `title` is the fund name). Its popover has two labelled parts and a closing line, in this order: a paragraph starting `P/E: ` plus `sourceSentence(fund.pe, "pe")`, a paragraph starting `P/B: ` plus `sourceSentence(fund.pb, "pb")`, then the line `Indicators, not a recommendation.` The source pills (buttons named `P/E source for ...` and `P/B source for ...`), the footnote paragraph (`Factsheet: printed by the fund house; fwd means forward earnings. ...`) and the `As on` column header and cells are **gone**. The range bars, the Nifty 500 tick, the headline sentence, the card's own "How the portfolio average works" button and the stock lists stay exactly as they are.

## Tests to write (new files only; names fixed)
`frontend/src/features/mutual-funds/other/sourceSentence.test.ts`:
`factsheet forward names the month and forward earnings`; `factsheet trailing says earnings for P/E and book value for P/B`; `factsheet with an unstated basis has no basis clause`; `computed names NSE and BSE, the method, the coverage and the ratios date`; `computed with an unstated method reads combined into one figure`; `computed without coverage leaves the coverage sentence out`; `coverage rounds a decimal string to a whole percent without float`; `a withheld figure repeats the reason the cell shows (unavailable reason first, then Not enough data plus reason, then Not enough data)`; `an unknown source falls back to the default sentence`; `every known source has a sentence (KNOWN_VALUE_SOURCES covers the ValuationValue source union)` (assert `KNOWN_VALUE_SOURCES` equals `["factsheet","computed","none"]` and that `sourceSentence` returns something other than the default for each).
`frontend/src/features/mutual-funds/other/ValuationByFund.info.test.tsx` (same mocks and `mount` pattern as `ValuationByFund.test.tsx`; render `CostValuationGroup`):
`no source pill remains` (no button named like `source for`); `each fund has one "i" right after its name` (a button `P/E and P/B for {name}` inside each fund row, after the logo and name); `the popover shows the P/E part, the P/B part and the closing line` (click the "i", find the dialog, assert the three texts for a factsheet-forward fund and a computed fund using the `sourceSentence` texts); `a withheld figure shows its reason in the popover too` (the HDFC fixture row: the popover's P/E paragraph contains `Less than 60% of this fund's equity has a usable P/E value.` prefixed as `Not enough data. `); `the As on column and the footnote are gone` (no column header `As on`, no cell `12 Oct 2026`, no text `fwd means forward earnings`); `range bars and the Nifty 500 tick stay` (the existing label queries still match); `keyboard and hover both open it` (hover after a short pause with fake timers; focus plus Enter pins it; Escape closes and focus returns to the "i"); `the card keeps its own information button` (`How the portfolio average works` still toggles its text).
Invented data only (the fixture names already are). Dates in tests come from the fixtures (`as_of` "2026-10-12", "2026-10-10").
**Each new test must fail first for the stated reason:** `sourceSentence`/`KNOWN_VALUE_SOURCES` do not exist; the "i" and the removals do not exist yet. (Claude confirms.)

## Old assertions that E-9 will have to replace (list only; do NOT edit `ValuationByFund.test.tsx` now)
In `ValuationByFund.test.tsx`: the `12 Oct 2026` and `10 Oct 2026` cell checks in the first test and the test name "as-on date"; `label shows Factsheet, Factsheet fwd or NSE/BSE`; `hover note names basis and method, and tapping also opens it`; any other assertion on the pills or the footnote. In your report, list every old assertion you found that the change makes obsolete (file, line, text), so E-9 can retire them one by one.

## Files
**Create only:** the two test files above. **Do not touch:** any other file, `package.json`, the lock file, `otherLogic.ts`, `ValuationByFund.tsx`, `ValuationByFund.test.tsx`, `guards.test.ts`.
Rules: no `any`, `parseFloat`, `toFixed`, `Intl.`, `console.`, no hex; LF, UTF-8; plain words; no `@testing-library/user-event` (not installed: use `fireEvent`, and fake timers where a pause is needed).

## Report (one block, `CODEX REPORT: e8-valuation-info-red-tests`)
Status; baseline HEAD; files created; per file the test count and the expected red reason of each test; the list of old assertions E-9 must replace; `git status --short`; interface questions (if a signature or sentence above makes a test impossible, say which); not run (BLOCKED on running, reason); decisions the handoff did not cover.

## Paste-ready prompt
```
Front-end test writer for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-23-e8-valuation-info-red-tests-handoff.md (your task: E-8)
Work only in C:\Users\Dell\lanes\unifolio-e-dates on branch batch/e-dates. Git is read-only. No deletion flags or recursive deletes. Write only the two new test files the handoff names, exactly against the interfaces and sentences it fixes; do not write the code and do not edit ValuationByFund.test.tsx; touch nothing else. Do not use @testing-library/user-event. You cannot run the front-end checks: do not try, report BLOCKED on running.
Reply with the CODEX REPORT block from the handoff, nothing else.
```
