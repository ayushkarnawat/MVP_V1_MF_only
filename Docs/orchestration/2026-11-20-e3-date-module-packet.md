# Packet E-3 (Batch E): the date module and the label component (Antigravity, front end, lane E-a)
**Batch E.** Plan: `Docs/superpowers/plans/2026-11-17-batch-e-dates-plan.md` (Task E-3; "Global Constraints" and "Review Focus"). **Spec:** `Docs/orchestration/2026-11-13-batch-e-planning-workbook.html` (Q1 B: two tiers; one word "as on"; no new dates anywhere). New files only: this is the base the strip, the label replacement and the "i" popover will use later. One of four lanes that run at the same time on disjoint files (K-T06 `ag-k1`, K-T07 `ag-k2`, F-3/F-4 `ag-f34`, this).

**Your clone:** `C:\Users\Ayush\ag-e3` (branch `ag/ag-e3`, cut from `batch/e-dates`). Work only there. Never edit `D:\Unifolio code`. Never run a git command that changes anything.
**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this packet. (The date audit `Docs/orchestration/2026-11-20-date-audit.md` may be present by now: read it if it is; it lists every label this module will serve.)

## The task (new files only; tests first: show them fail, then make them pass)
Create `frontend/src/lib/dataDates.ts`, `frontend/src/lib/dataDates.test.ts`, `frontend/src/components/DataDateLabel.tsx`, `frontend/src/components/DataDateLabel.test.tsx`.

**Policy (the whole point):** two tiers and one word. **Daily** data (prices, NAV, today's change) = the exact day: `"Prices as on 12 Nov 2026"`. **Monthly** data (holdings, fees, factsheet ratios, manager details) = the month: `"Holdings as on September 2026"`. The word is **"as on"** everywhere, never "as of". **No new dates:** this module only formats a date it is given; it never invents one. Event dates (transactions, SIP due dates, "managing since", first and last investment), chart axes and tooltips, and News ("Updated 3 hours ago") are **not** its business (the existing helpers stay for those).

**`dataDates.ts` interfaces:**
```ts
export type DataDateKind = "prices" | "holdings" | "ratios" | "fees" | "marketCapList" | "factsheet" | "managerDetails";
export function formatDataDate(kind: DataDateKind, iso: string): string;
export function olderDataMarker(kind: DataDateKind, iso: string, today: Date): { older: boolean; label: string | null };
```
- `formatDataDate`: `prices` and `ratios` -> `"Prices as on 12 Nov 2026"` (for `ratios` the same day format with the word "Ratios": `"Ratios as on 12 Nov 2026"`; the plan's text lists `prices` and `ratios` as exact-day kinds: use **"Prices as on …"** for `prices` and **"Ratios as on …"** for `ratios`); `holdings` -> `"Holdings as on September 2026"`; `fees` -> `"Fees as on September 2026"`; `factsheet` and `managerDetails` -> month form with their own word (`"Factsheet as on September 2026"`, `"Manager details as on September 2026"`); `marketCapList` -> `"Market-cap list effective 1 Jul 2026"` (the one allowed exception to "as on": it is an effective date). **A month-end stored as a full date renders as a month** ("2026-09-30" for `holdings` gives "September 2026"). **Timezone-safe:** parse an ISO `YYYY-MM-DD` (or an ISO date-time) as a **calendar date**, never as a local midnight that can slip a day; no `Intl` (a feature guard forbids `Intl.`, and `parseFloat`/`toFixed`): use a constant month-name table. Invalid, empty or null input returns an empty string and `DataDateLabel` renders nothing.
- `olderDataMarker`: holdings older than about **60 days** from `today` -> `{ older: true, label: "Older than usual" }`-style short label (choose the wording `"Older than usual"`); a half-yearly kind (`marketCapList`, `factsheet`) past its due date (older than ~200 days); **a kind with no cadence returns `{ older: false, label: null }`** (prices, ratios, fees, managerDetails have no marker today); invalid input returns `{ older: false, label: null }`.
- **`DataDateLabel({ kind, iso, className? })`** renders the phrase from the module in a `<span>` (no styling beyond `className`; tokens only elsewhere); renders **nothing** for an invalid or empty date.

## Tests (write first)
`dataDates.test.ts`: the exact strings above (`"Prices as on 12 Nov 2026"`, `"Holdings as on September 2026"`, `"Fees as on September 2026"`, `"Market-cap list effective 1 Jul 2026"`); a month-end date renders as a month; **an ISO date-time such as `2026-09-30T20:30:00Z` does not slip a day or a month in any timezone** (set `process.env.TZ` in two test cases or assert on the pure parsing); **event dates are not formatted by this module** (there is no kind for them; document it in a test name); `olderDataMarker` flags holdings older than 60 days and not younger; no marker for a kind with no cadence; invalid or null input. `DataDateLabel.test.tsx`: renders the phrase; renders nothing for an invalid date; passes `className`.
**One more test, pending by design:** `a source file scan finds no hard-coded "as on" or "as of" outside dataDates.ts and its tests` scanning `frontend/src/features` and `frontend/src/components` sources (excluding tests, `dataDates.ts` and a documented allowlist for the event-date helpers `lib/format.ts` and the files the date audit lists as event dates). It will **fail today** because about 20 labels still hard-code the wording: write it with **`it.skip`** and a comment "enabled by task E-6 (the label replacement)"; **show in your report how many files it would flag today** (run it once un-skipped, then skip it again). Do not leave a failing test in the suite.

## Files you may change
Exactly the four files above. Anything else: stop and report. **Do not touch** `lib/format.ts`, `lib/dateRange.ts`, any page or label, `SectionCard.tsx`, `MutualFundsFrame.tsx`, `components/search/**`, `backend/**`, `frontend/src/mobile/**`, `package.json`, lockfiles.

## Checks (PowerShell, from your clone)
```
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-e3 test src/lib/dataDates.test.ts src/components/DataDateLabel.test.tsx
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-e3 types
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-e3 lint src/lib src/components
```
If WSL is denied on your machine, run the same in PowerShell inside the clone: `npx vitest run <paths>`, `npx tsc -b`, `npx oxlint <paths>`.

## Report (one block, nothing else)
Failing counts before and after; the exact commands and results; `git status --short`; the exact exports; how many files the pending scan test would flag today (list them); decisions the packet did not cover; Open questions.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-20-e3-date-module-packet.md (your task: E-3)
Work only in C:\Users\Ayush\ag-e3 on branch ag/ag-e3. New files only: tests first (show them fail), then make them pass. The pending scan test is it.skip by design. Never run a git command that changes anything. Touch only the four files the packet lists. Reply with the report block from the packet, nothing else.
```
