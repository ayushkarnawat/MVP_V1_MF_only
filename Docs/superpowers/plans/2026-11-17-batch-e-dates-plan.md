# Batch E: Date Policy, Page Strip and the P/E and P/B "i" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read `Docs/orchestration/wave-common-rules.md` first; it wins where it differs.

**Goal:** In wave 4 (milestone M3), make every data date in the app follow one policy (two tiers, one wording "as on"), state the dates once in a strip under the Mutual Funds tabs with details in each card's "i", and replace the P/E and P/B source pills with one "i" per fund.

**Architecture:** One date module decides wording, format and the older-data rule; one small label component renders it. One shared "i" popover component under `frontend/src/components/` (features may not import other features) replaces the bespoke patterns for this batch's cards, and `InfoMark` is rebuilt on it. No backend, no database, no migration, no new dates anywhere that shows none today.

**Tech Stack:** React, TypeScript, Vitest, Tailwind tokens. Optional new dependency `@radix-ui/react-popover` (see Task E-7: needs the user's explicit yes; the tooltip-based fallback exists).

**Spec:** `Docs/orchestration/2026-11-13-batch-e-planning-workbook.html` (Q1 B two tiers; Q2 B one strip with details in the "i"; 17 Nov: no new dates, category average has no "i", E-5 and E-8 retired). Program rules: `2026-11-17-program-execution-and-deployment-plan.html`.

## How this plan is used (read first)

- **Packets and handoffs are not written here.** The orchestrator writes the Antigravity packets (the strip, the popover, the "i" placement) and each Codex handoff in detail when the task starts, taking measurements and copy from the workbook's drawings.
- **Waits for (program section 4):** A's verdicts (wording follows the verified numbers) and K merged (K edits the same page headers); F's section list exists from wave 3. E goes **before** F's visible index: both edit `MutualFundsFrame.tsx`; order is K, then E, then F's rail.
- **Wave-start check:** list again every date label and helper: `formatDate` (`frontend/src/lib/format.ts`), `formatExactDate`, `holdingsDate`, `formatDayMonth`, `formatAsOf`, both `formatMonthYear` (`frontend/src/lib/dateRange.ts` and a second one; the duplicate to merge), the about 20 "as on"/"as of" labels in about 15 files, `InfoMark` and `SectionCard` (`features/mutual-funds/common/SectionCard.tsx`), `ValuationByFund.tsx` and `CategoryRankingGroup.tsx` (`features/mutual-funds/other/`), `MutualFundsFrame.tsx` (`features/mutual-funds/frame/`), and Home's price-day rule in `backend/app/services/home/movers.py` (`_price_day`). Report drift.
- **Branch:** `batch/e-dates` from `leapswitch-redesign` at wave 4 start, after K is merged. Ships in M3.
- **Builders:** Codex = date module, label component, label replacement, popover logic, P/E P/B logic, all tests, one task at a time. Antigravity = the strip look and the popover look, lanes G-a (strip) and G-b (popover and the per-fund "i"), disjoint files.

## Global Constraints

- **No new dates.** Wherever the app shows no date today (XIRR tile, category average, rank) it still shows none. The strip lists only the data kinds a tab already dates; Transactions has no strip. The server replies are not changed.
- Tiers: daily data (prices, NAV, today's change) = exact day, "Prices as on 12 Nov 2026"; monthly data (holdings, fees, factsheet ratios, manager details) = month, "Holdings as on September 2026". Event dates (transactions, SIP due dates, "managing since", first and last investment), chart axes and tooltips (Batch D), and News ("Updated 3 hours ago") are unchanged.
- One word: "as on" everywhere, never mixed with "as of". One price date: every "Prices as on" uses Home's rule (the latest recent day on which funds holding at least half of the portfolio have a price), the same as A's common end date; funds still waiting keep the existing "Partial" badge.
- The category average card stays exactly as it is (its one-sentence tooltip and footer legend line).
- The existing `InfoMark` keeps its name and its text property; the roughly 20 cards that use it through `SectionCard` need no edit and gain click and keyboard behaviour.
- A test fails if a screen hard-codes "as on" or "as of" wording outside the date module (event-date helpers stay).
- Phone out of scope. Strip entries and popover content are data (tier-able later), the strip does not use the header slot that search and the section index share.
- No new dependency unless the user says yes to `@radix-ui/react-popover` (stack-level change). Never log or send dates or values to analytics.

## Review Focus

- A fund with no stock ratios or a withheld figure: the popover says why, in the same plain words the cell shows today; a fund with an unknown source shows a safe default sentence and a test fails on an unknown source.
- A strip with one entry on a tab and a card whose data is older than its usual cycle: the amber older-data marker names the funds; a data kind with no cadence tag shows no marker.
- Month-end stored as a date ("Ref: 30 Sep 2026") renders as a month ("as on September 2026").
- Late publisher drags the price date back: the at-least-half rule holds, "Partial" badge shows.
- Keyboard only: Tab to an "i", Enter pins, Escape closes, focus returns; hover opens after a short pause; the popover flips at screen edges at 1280x600.
- Existing tests that read old label text are updated in the same change (each old string listed in the handoff).
- Dark mode of the strip and popover.

## File Structure

| File | Responsibility |
|---|---|
| `frontend/src/lib/dataDates.ts` (new) | The date module: `DataDateKind`, `formatDataDate`, `olderDataMarker`, the kind-to-tier table. |
| `frontend/src/components/DataDateLabel.tsx` (new) | `DataDateLabel` renders the phrase from the module. |
| `frontend/src/components/info/InfoPopover.tsx` (new) | Shared "i": hover or focus opens, click pins, Escape closes. |
| `frontend/src/features/mutual-funds/common/SectionCard.tsx` | `InfoMark` rebuilt on `InfoPopover` (same name, same text prop). |
| `frontend/src/features/mutual-funds/frame/MutualFundsFrame.tsx` + `DateStrip.tsx` (new, same folder) | The strip, its "i" and the older-data marker. |
| `frontend/src/features/mutual-funds/other/ValuationByFund.tsx` + `otherLogic.ts` | Pills, footnote and "As on" column removed; one "i" per fund; source-to-sentence map. |
| `frontend/src/features/mutual-funds/other/CategoryRankingGroup.tsx` and about 15 other files | As-of labels use the module; per-card footer lines removed in favour of strip and card "i". |
| `frontend/src/lib/dateRange.ts` | The duplicate `formatMonthYear` merged. |

## Task list

| Task | What | Builder | Size | Order |
|---|---|---|---|---|
| E-1 | Wave-start check; handoffs and packets | Claude | M | first |
| E-2 | Date audit: every date label on every screen | Claude | M | first (read-only) |
| E-3 | Date module and label component, tests first | Codex | M | after E-2 |
| E-4 | Red tests for the strip | Codex | S | after E-3 |
| E-5 | The strip, its "i", the older-data marker | Antigravity (G-a) | M | after E-4 |
| E-6 | Replace the about 20 labels; merge the month helper; hard-coded-wording test | Codex | M | after E-3 |
| E-7 | Shared "i" popover and `InfoMark` rebuild | Codex logic, Antigravity look (G-b) | M | after the user's dependency yes |
| E-8 | Red tests for P/E and P/B | Codex | S | after E-7 |
| E-9 | Per-fund "i", remove pills, footnote, column; source map | Codex (logic), Antigravity (G-b look) | M | after E-7 and the fact-sheet fixes |
| E-10 | Screens vs mockups, dark mode, keyboard, three sizes | Claude | M | after E-5, E-9 |
| E-11 | Whole-batch review, M3 notes | Claude | M | last |

(IDs E-5 and E-8 of the workbook were retired with the category "i"; this plan renumbers.)

---

### Task E-2: Date audit (Claude, read-only)

- [ ] **Step 1:** List every date label on the seven Mutual Funds tabs, Home, the fund page and Portfolio: helper, wording, meaning, tier. Confirm per tab which strip entries exist (workbook section 2 table is the starting reading); remove an entry for any kind the tab does not date today. Deliver as `Docs/orchestration/2026-11-xx-date-audit.md` (named in the handoff). Note any screen where the policy does not fit and bring it to the user.

### Task E-3: Date module and label component

**Files:** Create `frontend/src/lib/dataDates.ts`, `frontend/src/lib/dataDates.test.ts`, `frontend/src/components/DataDateLabel.tsx`, `DataDateLabel.test.tsx`.

**Interfaces:**
- Produces `type DataDateKind = "prices" | "holdings" | "ratios" | "fees" | "marketCapList" | "factsheet" | "managerDetails"`.
- Produces `formatDataDate(kind: DataDateKind, iso: string): string` giving `"Prices as on 12 Nov 2026"` for `prices` and `ratios`, `"Holdings as on September 2026"` for `holdings`, `"Fees as on September 2026"` for `fees`, `"Market-cap list effective 1 Jul 2026"` for `marketCapList`.
- Produces `olderDataMarker(kind: DataDateKind, iso: string, today: Date): { older: boolean; label: string | null }` (holdings older than about 60 days; half-yearly kinds past due; a kind with no cadence returns `{ older: false, label: null }`).
- Produces `DataDateLabel({ kind, iso, className? })`.

- [ ] **Step 1: Write failing tests:** the four exact strings above; `a month-end date renders as a month`; `event dates are not formatted by this module`; `olderDataMarker flags holdings older than 60 days`; `no marker for a kind with no cadence`; `invalid or null iso renders nothing`; `a source file scan finds no hard-coded "as on" or "as of" outside dataDates.ts and its tests` (scans `frontend/src/features` and `components`, with a documented allowlist for event-date helpers; expected to FAIL until E-6).
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/lib/dataDates.test.ts src/components/DataDateLabel.test.tsx`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the module and component (timezone-safe: parse ISO dates as calendar dates, not local midnights).
- [ ] **Step 4: Run** both files. Expected: PASS except the scan test, which is marked pending until E-6.

### Task E-4 / E-5: The strip

**Files:** Create `frontend/src/features/mutual-funds/frame/DateStrip.tsx` (look by Antigravity), tests `DateStrip.test.tsx`, `MutualFundsFrame.test.tsx`.

**Interfaces:** `DateStrip({ entries, olderMarkers }: { entries: { kind: DataDateKind; iso: string; explain: string }[]; olderMarkers: { label: string; items: string[] }[] })` renders one line "Prices as on 12 Nov 2026 · Holdings as on September 2026", an "i" (the shared popover) listing each entry with what it means and how often it changes, and an amber marker such as "2 funds have older holdings" whose "i" names them. `MutualFundsFrame` places it under the tabs and above the cards and passes entries by tab (data table in the frame, not hard-coded in JSX).

- [ ] **Step 1 (E-4, Codex red tests):** `Overview shows only "Prices as on …"`; `Transactions has no strip`; `Holdings and Overlap show prices and holdings`; `Performance shows prices`; `Other analytics shows prices, holdings, ratios and fees`; `Allocation shows prices, holdings and market-cap list`; `older-data marker appears only when olderDataMarker says so and its "i" names the funds`; `the strip does not use the header slot`.
- [ ] **Step 2: Run** `npx vitest run src/features/mutual-funds/frame`. Expected: FAIL.
- [ ] **Step 3 (E-5, Antigravity packet):** orchestrator writes the packet at this point: workbook section 2 layout B drawing, measurements, the amber marker, dark mode, spacing under the tabs at 1280x600; the "Do not touch" list: the header slot, `SectionCard` (E-7's), backend.
- [ ] **Step 4: Build.** **Step 5: Run** the frame tests, `npx tsc -b`, `npx oxlint src/features/mutual-funds`. Expected: PASS. Orchestrator screenshots at three sizes, light and dark.

### Task E-6: Replace the labels

**Files:** Modify every file the E-2 audit lists (about 15, in allocation, other-analytics, overlap, holdings, fund-page components and Home); `frontend/src/lib/dateRange.ts` (merge the duplicate `formatMonthYear`); update the tests that read old text.

- [ ] **Step 1: Write failing tests:** the pending scan test from E-3 becomes active; `no component calls a date helper directly for an as-of label`; per-card footer lines removed where the strip and card "i" now say it; update expected strings in the existing tests (each old string listed in the handoff).
- [ ] **Step 2: Run** the scan test and the touched files' tests. Expected: FAIL.
- [ ] **Step 3: Implement** with `DataDateLabel` or `formatDataDate`; the six helpers stay for event dates; the duplicate `formatMonthYear` is merged into one.
- [ ] **Step 4: Run** every touched component's tests, `tsc -b`, `oxlint` on the touched folders. Expected: PASS.

### Task E-7: Shared "i" popover (needs the user's dependency yes)

**Files:** Create `frontend/src/components/info/InfoPopover.tsx`, `InfoPopover.test.tsx`; modify `features/mutual-funds/common/SectionCard.tsx` (`InfoMark`); `frontend/package.json` and lockfile only if the user says yes.

**Interfaces:** `InfoPopover({ label, title?, children, side? }: InfoPopoverProps)` renders a real button (the same small circled "i"); `InfoMark({ text }: { text: string })` keeps its current signature and is built on it.

- [ ] **Step 0:** Ask the user once: add `@radix-ui/react-popover` (recommended, same family as tooltip and dialog) or build on the installed tooltip. Record the answer in the handoff. Do not touch `package.json` without a yes.
- [ ] **Step 1: Write failing tests:** `opens on hover after a short pause and on focus`; `click or Enter pins it open`; `Escape and outside click close it and focus returns to the icon`; `content scrolls and width is capped`; `placement flips at the screen edge`; `InfoMark with a text prop still shows that text and gains click behaviour`; `the existing SectionCard tests pass unchanged`.
- [ ] **Step 2: Run** `npx vitest run src/components/info src/features/mutual-funds/common`. Expected: FAIL.
- [ ] **Step 3: Implement** (Codex logic and accessibility; Antigravity styles the popover from a packet: card colours, light and dark, same circled "i").
- [ ] **Step 4: Run** the two folders, `tsc -b`, `oxlint`. Expected: PASS.

### Task E-8 / E-9: P/E and P/B "i"

**Files:** Modify `frontend/src/features/mutual-funds/other/ValuationByFund.tsx` (delete the Source pill component and its two uses, the footnote, the "As on" column and `AsOn`), `otherLogic.ts` (the source-to-sentence map); tests `ValuationByFund.test.tsx`, `otherLogic.test.ts`.

**Interfaces:** Produces `sourceSentence(value: { source: string; basis: string | null; method: string | null; coverage: number | null; date: string | null }): string` in `otherLogic.ts`, with a safe default sentence for unknown sources and one line per source: factsheet ("Printed on the fund's factsheet for September 2026, based on forward earnings."), forward factsheet, computed ("Worked out from the fund's published holdings. Stock ratios come from NSE and BSE daily data, combined as a harmonic mean. Covers 92% of the fund's equity. Ratios as on 12 Nov 2026."); a "loaded by hand" source gets its line when the fact-sheet fixes land. The popover has two parts (P/E, P/B), keeps the line "Indicators, not a recommendation.", and says why a withheld figure is withheld.

- [ ] **Step 1 (E-8, Codex red tests):** `no source pill remains`; `each fund has one "i" right after its name`; `popover shows the factsheet, forward factsheet and computed sentences`; `a withheld figure shows its reason`; `an unknown source fails the map test and falls back to the default sentence in the UI`; `range bars and the Nifty 500 tick stay`; `the As on column and footnote are gone`; `keyboard and hover both open it`.
- [ ] **Step 2: Run** `npx vitest run src/features/mutual-funds/other`. Expected: FAIL.
- [ ] **Step 3 (E-9):** The orchestrator writes the packet for the look; Codex builds the logic; check the final list of sources from the fact-sheet fixes (C3, the manager's work) before finishing and add one line per new source.
- [ ] **Step 4: Run** the folder tests, `tsc -b`, `oxlint`. Expected: PASS.

### Task E-10 / E-11 (Claude)

- [ ] **Step 1 (E-10):** Compare screens with the mockups at 1280x600, 1440x810, 1536x730, light and dark; keyboard-only and screen-reader checks on the strip's "i" and a fund's "i"; send exact differences back.
- [ ] **Step 2 (E-11):** A fresh adversarial reviewer reads the diff against Review Focus; merge `leapswitch-redesign` into `batch/e-dates`, rerun affected tests, merge in. Give the M3 deploy guide (written at M3): frontend only; no backend change; the draft staging check (workbook section 9); stored results from before the deploy need nothing here.

## Self-Review notes

- Spec coverage: item 11 (E-2 to E-6), item 16 (E-7 to E-9), item 9 dropped (no task, card untouched).
- Open decision for the user before E-7: the new dependency. Fallback is the tooltip.
- Packets and handoffs: not written here, by instruction.
