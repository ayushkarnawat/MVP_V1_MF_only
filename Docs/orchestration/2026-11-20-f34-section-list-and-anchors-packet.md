# Packet F-3 + F-4 (Batch F stage 1): the shared section list and the anchors on the seven Mutual Funds tabs (Antigravity, front end, one worker, in this order)
**Batch F, wave 3 (stage 1).** Plan: `Docs/superpowers/plans/2026-11-17-batch-f-section-index-plan.md` (Tasks F-3 and F-4; "Global Constraints" and "Review Focus"). **Spec:** `Docs/orchestration/2026-11-13-batch-f-planning-workbook.html`. **The audit this packet is built from: `Docs/orchestration/2026-11-20-section-audit.md` (read it fully first: titles are quoted from the code and each section's file is named).** The visible rail is stage 2 (later); here only the list, the ids and a guard test. **The pages must look and behave exactly as today:** one `id` and one scroll-margin class per section, nothing restyled. One of four lanes that run at the same time on disjoint files (K-T06 `ag-k1`, K-T07 `ag-k2`, E-3 `ag-e3`, this).

**Your clone:** `C:\Users\Ayush\ag-f34` (branch `ag/ag-f34`, cut from `batch/f-nav`). Work only there. Never edit `D:\Unifolio code`. Never run a git command that changes anything.
**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), the audit, then this packet.

## Decisions taken (orchestrator, 20 Nov; the owner may change them)
Summary strip and Sold funds are **not** index sections (no title; conditional disclosure): Overview has **6** entries. Other Analytics lists its **3 visible groups** (the scorer group is behind `SHOW_FUND_QUALITY_SCORES = false`; do not list it). Overlap titles in the list carry **no** "1." to "4." prefix. `id` and `anchor` are the same string (the DOM id, and the URL hash `#<anchor>`). The index shows only sections that are rendered (a later task keys the rail off the DOM); the list is the static master.

## Part 1 (F-3): `frontend/src/lib/pageSections.ts` and `pageSections.test.ts`
```ts
export type MfTabId = "overview" | "performance" | "allocation" | "holdings" | "transactions" | "overlap" | "analytics";
export interface PageSection { id: string; title: string; anchor: string; tier: "standard" | "pro" }   // all "standard"; anchor === id
export const MIN_SECTIONS_FOR_INDEX = 3;
export const SECTION_LISTS: Record<MfTabId, PageSection[]>;
export function sectionsForTab(tab: MfTabId): PageSection[];
export function indexVisible(tab: MfTabId): boolean;     // sectionsForTab(tab).length >= MIN_SECTIONS_FOR_INDEX
```
Lists (ids and titles from the audit; titles as the cards show them without counts or numbers):
- overview: `overview-value-over-time` "Value over time"; `overview-sips` "SIPs"; `overview-mutual-funds` "Mutual Funds"; `overview-amc-allocation` "AMC Allocation"; `overview-family-members` "Family Members"; `overview-quick-insights` "Quick Insights".
- performance: `performance-returns` "Returns"; `performance-portfolio-history` "Portfolio History"; `performance-benchmark-comparison` "Benchmark Comparison (XIRR)".
- allocation: `allocation-asset-class` "Look-Through Asset Allocation"; `allocation-market-cap` "Market-Cap Allocation"; `allocation-category-amc` "Portfolio Allocation"; `allocation-fund-manager` "Fund Manager Allocation".
- holdings: `holdings-top-by-fund` "Top Holdings by Fund"; `holdings-all-stocks` "All Holdings Across Your Portfolio".
- transactions: `transactions-cash-flow` "Cash Flow Over Time"; `transactions-ledger` "All Transactions".
- overlap: `overlap-common-holdings` "Common Holdings"; `overlap-heatmap` "Overlap Heatmap"; `overlap-top-pairs` "Top Overlapping Fund Pairs"; `overlap-impact` "Overlap Impact".
- analytics: `analytics-cost` "Cost & Valuation"; `analytics-category` "Category Average Comparison"; `analytics-ranking` "Performance Ranking".
**Tests first** (names from the plan, counts per the decisions above): `every tab has a list`; `ids and anchors are unique across all tabs`; `anchors are lower-case slugs prefixed by their tab id`; `counts: overview 6, performance 3, allocation 4, holdings 2, transactions 2, overlap 4, analytics 3`; `indexVisible is false for holdings and transactions and true for the others`; `overlap titles carry no leading number`; `anchor equals id`. This module is shared (the search box and the later PDF export read it): it may import **nothing** from `features/`.

## Part 2 (F-4): anchors and the guard test
- **`SectionCard`** (`features/mutual-funds/common/SectionCard.tsx`) gains an optional `anchor?: string`: when given, its `<section>` carries `id={anchor}` and the class `scroll-mt-6` (the page area `<main>` has `p-6`, and `scrollIntoView` ignores padding); the heading id stays `useId()` and `aria-labelledby` stays; **without `anchor` the output is byte-for-byte unchanged**. Pass the anchor from every card of Allocation (4), Holdings (2), Transactions (2), Overlap (4) with the ids above. **Keep the existing wrapper ids working** (`asset-allocation`, `market-cap`, `all-holdings`; `AssetClassCard.tsx` looks up `market-cap` with `getElementById`): the new ids are on the card sections, the old ones stay where they are.
- **The bespoke sections** (Overview 6, Performance 3, Other Analytics 3): put the `id` and `scroll-mt-6` on the section's own root element where the component can take it with a one-line change (name each touched file in the report); where it cannot (a legacy or shared component), use a small wrapper `SectionAnchor({ anchor, children })` (new file `features/mutual-funds/common/SectionAnchor.tsx`) that renders `<div id={anchor} className="scroll-mt-6">`; **inside a grid (the AMC / Family Members / Quick Insights row is one `lg:grid-cols-3` row) the wrapper must not change the layout**: give it `className="scroll-mt-6 h-full"` and compare. Overview "Mutual Funds" renders in two branches (aggregate `FamilyHoldingsTable` and member `HoldingsTable`): both get the anchor. The wealth graph: the `<section aria-label="Value over time">` in `OverviewWealthGraph`. Other Analytics: the `Group` component takes the anchor from a prop per group (`analytics-cost`, `analytics-category`, `analytics-ranking`).
- **Guard test** `features/mutual-funds/frame/sectionGuard.test.tsx`: for each tab, render the page with the existing fixtures (`features/mutual-funds/fixtures`; see how the page tests do it with `renderInShell`) in a state where every section of the list renders, and assert **every id in `sectionsForTab(tab)` exists exactly once in the DOM**; and assert **every `SectionCard` on the page is either in the list or carries a marker `data-section-excluded`** (add that attribute to any card you deliberately leave out; the audit found none today). Use the fixtures' full aggregate case for Overview (6), and say in a comment which states hide which sections (member mode hides Family Members; Overlap has 0 sections with fewer than two funds).
- **`features/mutual-funds/guards.test.ts`** asserts exactly 56 source files, no `parseFloat`/`toFixed`/`Intl.`/`console.`/hex colours/`any`, and that every `<button` has `data-clickable`. A new source file (`SectionAnchor.tsx`) makes the count 57: **change that number by exactly the new files and report the change**; do not weaken any other assertion. Do not add buttons.

## Tests
Before anything: run `src/features/mutual-funds src/lib` and note the starting counts. Write the F-3 tests and the F-4 guard test first and show them fail; then build. Every existing test must pass unchanged (except the guard count above).

## Files you may change
`frontend/src/lib/pageSections.ts` + test; `features/mutual-funds/common/{SectionCard.tsx,SectionAnchor.tsx}`; the page and card files the audit names for the seven tabs (one small edit each: an `id`/`anchor` prop and the `scroll-mt-6` class); `features/mutual-funds/frame/sectionGuard.test.tsx`; `features/mutual-funds/guards.test.ts` (the count only). Anything else: stop and report.
## Do not touch
`MutualFundsFrame.tsx`, `AppLayout.tsx`, any style, copy or layout, `components/search/**` (the K lanes), `frontend/src/mobile/**`, `backend/**`, `package.json`, lockfiles, the fund page and the compare-two-funds page.

## Checks (PowerShell, from your clone)
```
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-f34 test src/features/mutual-funds src/lib
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-f34 types
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-f34 lint src/features/mutual-funds src/lib
```
If WSL is denied on your machine, run the same in PowerShell inside the clone: `npx vitest run <paths>`, `npx tsc -b`, `npx oxlint <paths>`.

## Report (one block, nothing else)
Counts before and after; the exact commands and results; `git status --short`; every existing file you touched with the one-line change; every assertion you changed (the guard count) with the reason; where you used a wrapper and why; decisions the packet did not cover; what you could not check (visual: the orchestrator compares every tab before and after at 1280x600, 1440x810 and 1536x730); Open questions.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-20-section-audit.md
4. Docs/orchestration/2026-11-20-f34-section-list-and-anchors-packet.md (your task: F-3 then F-4)
Work only in C:\Users\Ayush\ag-f34 on branch ag/ag-f34. Part 1 (the list) first, then part 2 (the anchors and the guard test). Tests first: show them fail, then make them pass. The pages must look and behave exactly as today: only an id and a scroll-margin class per section. Never run a git command that changes anything. Touch only the files the packet lists. Reply with the report block from the packet, nothing else.
```
