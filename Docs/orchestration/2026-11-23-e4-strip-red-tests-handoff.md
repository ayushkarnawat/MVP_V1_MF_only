# Handoff: E-4 red tests for the date strip (Batch E, Codex, new test files only)
**Status:** READY TO RELAY (written 2026-11-23). **Approved:** the owner approved Batch E and its date policy on 23 Nov (`decisions.md`, "Dates (E)"); E-3 (`dataDates.ts`, `DataDateLabel.tsx`) is merged on `batch/e-dates` (`79e3181a`).
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-e-dates-plan.md` (Tasks E-4/E-5 and the **amendments at its end, which replace the plan's strip test list**). **Spec:** `Docs/orchestration/2026-11-13-batch-e-planning-workbook.html` (section 2, layout B). Date facts: `Docs/orchestration/2026-11-20-date-audit.md` (sections 2 and 4).
**Worker:** Codex. **It cannot run the front-end checks (no WSL): write the tests, do not try to run vitest, report BLOCKED on running.** Claude runs `wave-fe-check.sh ed test src/features/mutual-funds/frame` and confirms each test is red for the stated reason.
**Work in:** `C:\Users\Dell\lanes\unifolio-e-dates` (worktree, branch `batch/e-dates`). Git is read-only. Never in the main checkout.
Read first: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins), then this file; then open `frontend/src/lib/dataDates.ts`, `frontend/src/features/mutual-funds/common/SectionCard.tsx` (`InfoMark`) and `frontend/src/features/mutual-funds/types.ts` (`LookthroughCoverage`).

## The interfaces (fixed here; write the tests against them, do not write the code)
New file `frontend/src/features/mutual-funds/frame/stripEntries.ts`:
```ts
import type { DataDateKind } from "../../../lib/dataDates";
import type { MfTabId } from "../../../lib/pageSections";
export interface StripDates { pricesIso?: string | null; holdingsIso?: string | null; ratiosIso?: string | null; feesIso?: string | null; marketCapListIso?: string | null }
export interface StripEntry { kind: DataDateKind; iso: string; explain: string }
export interface OlderMarker { label: string; items: string[] }
export function stripEntriesForTab(tab: MfTabId, dates: StripDates): StripEntry[];
export function olderHoldingsMarker(funds: Array<{ scheme_name: string; age_tag: "older_than_60_days" | "on_cycle" | null }>): OlderMarker | null;
```
New file `frontend/src/features/mutual-funds/frame/DateStrip.tsx`: `export function DateStrip(props: { entries: StripEntry[]; olderMarkers: OlderMarker[] })`.

**Which tab gets which entries (owner decision, 23 Nov): a strip exists only on Allocation and Other Analytics.** `stripEntriesForTab("allocation", d)` returns, in this order, `prices` (`d.pricesIso`), `holdings` (`d.holdingsIso`), `marketCapList` (`d.marketCapListIso`). `stripEntriesForTab("analytics", d)` returns `prices`, `holdings`, `ratios` (`d.ratiosIso`), `fees` (`d.feesIso`). **Every other tab (`overview`, `performance`, `holdings`, `transactions`, `overlap`) returns `[]`**, whatever the dates are. An entry whose iso is `null`, `undefined` or empty is left out (a tab never gains a date it does not have).
**The explain sentences are fixed (plain words, exact text):**
- prices: `Prices: the latest day on which most of your funds have a price. Changes every trading day.`
- holdings: `Holdings: what each fund held at its last monthly disclosure. Changes once a month.`
- ratios: `Ratios: stock P/E and P/B from NSE and BSE daily data. Changes every trading day.`
- fees: `Fees: each fund's expense ratio (TER) for its latest reference month. Changes about once a month.`
- marketCapList: `Market-cap list: the AMFI list that sorts stocks into large, mid and small. Changes twice a year.`

`olderHoldingsMarker(funds)`: keeps the funds whose `age_tag === "older_than_60_days"`; none -> `null`; else `{ label, items }` with `items` the fund names in input order and `label` `"1 fund has older holdings"` or `"N funds have older holdings"` (plain words, exact).

`DateStrip` renders nothing (null) when `entries` is empty. Otherwise: a wrapper `data-testid="date-strip"`; one line `data-testid="date-strip-line"` whose text is each entry's `formatDataDate(kind, iso)` joined by ` · ` (so `Prices as on 12 Nov 2026 · Holdings as on September 2026`); an `InfoMark` with `testId="date-strip-info"` whose text is the entries' explain sentences joined by one space; and for each older marker a line `data-testid="date-strip-older"` with the label and an `InfoMark` (`testId="date-strip-older-info"`) whose text is the item names joined by `, `. Markers render only when passed. The strip does **not** use `PageLayout`'s header slots (`search`, `actions`) and has no buttons of its own.

## Tests to write (new files only; names fixed)
`frontend/src/features/mutual-funds/frame/stripEntries.test.ts`:
`allocation lists prices, holdings and the market-cap list in that order`; `other analytics lists prices, holdings, ratios and fees in that order`; `overview, performance, holdings, transactions and overlap have no strip entries`; `an entry without a date is left out and a tab never gains one`; `explain sentences are exactly the agreed words`; `older marker names only funds tagged older than 60 days and counts them`; `older marker is null when no fund is old`; `singular label for one fund`.
`frontend/src/features/mutual-funds/frame/DateStrip.test.tsx`:
`renders one line with the dates joined by a dot (prices and holdings, holdings as a month)`; `renders nothing without entries`; `the info mark carries all explain sentences`; `an older marker shows its label and its info names the funds`; `no older line when no marker is passed`; `the strip has no button and no header-slot wrapper`; `dark mode: only token colours` (assert the rendered markup contains no `#` colour and no inline `style` colour).
Dates in tests: invented, e.g. `2026-11-12` and `2026-09-30`. Fund names invented ("Example Growth Fund"). Test files are LF, UTF-8.
**Each test must fail first for the stated reason: the two modules do not exist.** (Claude confirms.)

## Files
**Create only:** the two test files above. **Do not create** `stripEntries.ts` or `DateStrip.tsx` (the strip's build is next, by another worker). **Do not touch** anything else.

## Report (one block, `CODEX REPORT: e4-strip-red-tests`)
Status; baseline HEAD; files created; per file the test count and expected red reason; `git status --short`; interface questions (if a signature above makes a test impossible, say which); not run (BLOCKED on running, reason); decisions the handoff did not cover.

## Paste-ready prompt
```
Front-end test writer for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-23-e4-strip-red-tests-handoff.md (your task: E-4)
Work only in C:\Users\Dell\lanes\unifolio-e-dates on branch batch/e-dates. Git is read-only. No deletion flags or recursive deletes. Write only the two new test files the handoff names, exactly against the interfaces it fixes; do not create the modules; touch nothing else. You cannot run the front-end checks: do not try, report BLOCKED on running.
Reply with the CODEX REPORT block from the handoff, nothing else.
```
