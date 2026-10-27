# Packet ASKS-FE-M for Gemini (Antigravity): Mutual Funds, the new backend fields shown in the front end (ledger units, NAV and folio; the missed SIP fund and date; the funds behind each Asset Class; the inclusive pairs list and the stock-level impact drivers on Overlap)
**Status:** READY FOR GEMINI once the orchestrator has pushed or shown you the committed tests (written 27 Oct 2026). **Worker:** Gemini in Antigravity (Flash, high). **Orchestrator and verifier:** Claude Code. **Branch and folder:** `feat/mf-frontend`, in the git worktree `/home/ayush/wt/mf-fe` on WSL (open it in Antigravity as `W:\home\ayush\wt\mf-fe`). The branch is the green MF-D1 commit `f8334c63` plus one commit: the red-test commit `c25dc08d` (message starts `test(mutual-funds): failing tests for the new backend fields (ASKS-FE-M)`). Never touch another worktree.
**Parent documents:** register C132/C133 (the first MF-B defaults: the ledger had no units/NAV/folio, the missed-SIP tooltip was generic, the Asset Class drill showed only the class total), C139 (asks logged: TER saving, stock-level overlap impact, inclusive `pairs_above_low`), C159 (MF-D1), C160/C161 (the backend merged in PR #23, `feat/backend-mf-asks`, the contract below); mockups `2026-10-24-mutual-funds-transactions-mockup.html` (ledger row detail "Units, NAV, Folio"; the missed-instalment badge tooltip), `2026-10-24-mutual-funds-allocation-mockup.html` (the Asset Class drill "contributing funds" rows, "x% of Debt"), `2026-10-24-mutual-funds-overlap-mockup.html`, `2026-10-24-mutual-funds-other-analytics-mockup.html` (TER); `2026-10-23-mutual-funds-page-design.md`. **This packet is the whole truth for this run: where a mockup and this packet differ, this packet wins** (section 6 lists every difference and why). Method: `Docs/orchestration/2026-10-26-execution-plan-v2.md` sections 2 to 4, the same as packets MF-A, MF-B, MF-C and MF-D1.

## Backend contract (merged, additive, every field optional)
Read from `backend/app/services/analytics/schemas.py` (branch `feat/backend-mf-asks`, same content as merged). **All fields below can be absent (old stored payloads) and can be `null`: handle both, hide the element when absent, never invent a value.** No endpoint changes: the fields arrive in sections the pages already load (`investment_withdrawal`, `asset_allocation`, `overlap`).
1. **Ledger entries** (`investment_withdrawal.monthly[].entries[]` and `yearly[].entries[]`): `units`, `nav` (Decimal strings) and `folio` (masked: `XXXX` plus the last four letters or digits, so folio `1234567/89` arrives as `XXXX6789`).
2. **`sip_summary.missed_sip_fund`** (string) and **`missed_sip_date`** (`"YYYY-MM-DD"`), the SIP with the most missed instalments and the date of the first one it missed; both null when nothing is missed.
3. **Asset classes** (`asset_allocation.as_disclosed.classes[]` and `arbitrage_as_cash.classes[]`): `funds: [{scheme_id, scheme_name, value, percentage}]`, largest first, only funds with a positive part; `percentage` is the share **of the class** (not of the portfolio).
4. **TER** `annual_ter_saving` on fund rows: **already built by MF-C** (`other/otherLogic.ts` `terBadge` and `savingsLine`, `types.ts`, tests in `TerLadder.test.tsx` and `otherLogic.test.ts`). **Nothing to do for TER in this packet.** Do not touch the dashboard's own `annual_ter_saving` (a percentage-point gap, a different field).
5. **Overlap**: `impact_pairs` (the top 3 pairs above the low band, each with up to 5 `drivers: {isin, instrument_name, contribution_pct, share_of_pair_pct}`) and `pairs_at_low_boundary` (pairs at exactly the low band). `pairs_above_low` stays strict, so the inclusive list is `pairs_above_low` plus `pairs_at_low_boundary`, re-sorted by overlap.

## What this run is, in one paragraph
The tests, fixtures and types are **already written and committed red** (12 new test files, one new fixture file `fixtures/mfAsks.ts`, additions to `types.ts`). Edit **eight existing source files and create no new file** so that they pass, one group at a time, running the checkpoint command after every step and keeping the real output. Do not change any test, `types.ts` or anything in `fixtures/`. The result: opening a ledger row on **Transactions** shows its Units, NAV and Folio when the backend sent them; the missed-instalment badge on the SIP banner names the fund and the due date; the **Asset Class drill** on Allocation lists the contributing funds of the selected class; on **Overlap**, the Top Pairs table also lists the pairs at exactly the low band, and the Overlap Impact card gains a "What drives the overlap" section with the biggest shared stocks of the top pairs. With old payloads every page looks exactly as before. **No Individual Fund page, no route, no backend change.**

## Rules (read twice)
1. **Scope.** Edit **only** the eight files in section 3. Everything else (tests, `types.ts`, fixtures, `testing.tsx`, `package.json`, every route file, the shell, Home and Portfolio files, the old Dashboard, History and Analytics screens, the Individual Fund route, `components/`, the other Mutual Funds tabs and every other file in the feature folder) is out of bounds. **Create no file.**
2. **Never edit a test to make it pass.** If a test seems wrong, stop and describe it in the report (the orchestrator validated every test against a working solution and checked it with deliberate breaks).
3. **Run the checkpoint command after every step** and keep its real output for the report; fix your code, not the test.
4. **No new dependency, no `npm install`.**
5. **No float formatting of money or percentages.** Never write `parseFloat`, `toFixed` or `Intl` in any Mutual Funds source file, **comments included** (a guard test greps whole file text), and no `console.`. Format with the helpers already imported: `formatRupees`, `formatPercent` (`../../../lib/format`) and `formatDecimal` (`../../../lib/decimal`).
6. **No hard-coded colours** in the feature's files (no `#` followed by 3 to 8 hex digits, no `rgb(`/`rgba(`/`hsl(`, comments included): use the existing `var(--ui-...)` tokens as written below.
7. **Do not import another feature.** The feature may import only `@/lib/*`, `@/components/*`, `@/shell/*`, `features/auth/session` and its own folder. This packet needs no new import outside `../../../lib/*` and the feature's own files.
8. **Exact strings.** Every visible string, accessible name, test id and attribute in section 4 must be used exactly as written (the `×` in a pair title is the multiplication sign U+00D7, the `·` is U+00B7, the `—` is an em dash).
9. **Mark every control the feature owns.** This packet adds **no** `button`, so the guard's count of `data-clickable` against `<button` stays as it is. The new rows are plain text: do not make them clickable.
10. **Do not refactor, rename or "improve" anything outside the file map.** 2-space indentation, double quotes, semicolons (no `any`, no unused locals or imports: `tsc -b` is strict; the removed `MISSED_TOOLTIP` constant and the `sortedPairs` import in `TopPairs.tsx` must really go).
11. **Lint.** `oxlint` warns when a file exports a component and also a constant or a hook: the logic files export functions and types only; component files export components and `interface`/`type` declarations only. Do not add `oxlint-disable` comments.
12. **If anything differs from this packet, stop and report it.**
13. **Run every command inside WSL** (Step 0). If tests time out under load, add `--maxWorkers=4` and never run two `vitest` or `tsc` commands at the same time.

## Step 0: environment check (do this first, and report the output)
The folder is opened as `W:\home\ayush\wt\mf-fe`; **every command (`git`, `npm`, `npx`, `grep`, `cd`) runs inside WSL**: `wsl.exe -d Ubuntu --cd /home/ayush/wt/mf-fe -- <command>` for git, `wsl.exe -d Ubuntu --cd /home/ayush/wt/mf-fe/frontend -- <command>` for npm/npx; a command containing `|` is run as `... -- bash -c "<command>"`.
Run and report the output of each:
```
git branch --show-current          # expect: feat/mf-frontend
git log --oneline -3               # expect the top line to start with: test(mutual-funds): failing tests for the new backend fields (ASKS-FE-M)
git status --short                 # expect: nothing printed
cd frontend && npx tsc -b          # expect exactly 15 error lines, all in *.asks.test.ts files: five "has no exported member" (classFunds, impactPairs, inclusivePairs, ledgerDetail, missedSipTooltip) plus implicit-any lines that follow from them; nothing else, nothing in a source file
npx vitest run src/features/mutual-funds --maxWorkers=4   # expect: Test Files 12 failed | 49 passed (61); Tests 51 failed | 893 passed (944)
npx vitest run src/components/mf --maxWorkers=4           # expect: Test Files 9 passed (9); Tests 48 passed (48)
npx vitest run src/shell src/App.test.tsx --maxWorkers=4  # expect: Test Files 27 passed (27); Tests 348 passed (348)
npx vitest run src/components/ui/charts src/lib src/styles   # expect: Test Files 16 passed, Tests 188 passed
```
State which way you run commands and whether you can edit files. If any expectation fails, **stop and report**.

## Goal
Show, from the signed-off mockups and the merged backend fields: (1) ledger **units, NAV, folio**; (2) the **missed SIP** fund and date in the badge tooltip; (3) the **funds behind each asset class** in the Asset Class drill; (4) the **inclusive pairs list** (pairs at the low band too) in Top Pairs; (5) the **stock-level impact drivers** under the Overlap Impact donut. Family view and member view alike (nothing in these changes depends on the scope).
**Non-goals:** TER (already done); the Individual Fund page; any export; changing the Overlap Impact donut, the stat strip or the key insights (they stay on the strict `pairs_above_low`); a clickable fund row in the drill (the mockup rows are not clickable); changing the period drill table on Transactions; any backend change.

## 3. File map
**Create:** none. **Edit (8, nothing else in these files):**
- `frontend/src/features/mutual-funds/transactions/transactionsLogic.ts` (Step 1)
- `frontend/src/features/mutual-funds/transactions/SipBanner.tsx` (Step 1)
- `frontend/src/features/mutual-funds/transactions/Ledger.tsx` (Step 1)
- `frontend/src/features/mutual-funds/allocation/allocationLogic.ts` (Step 2)
- `frontend/src/features/mutual-funds/allocation/AssetClassCard.tsx` (Step 2)
- `frontend/src/features/mutual-funds/overlap/overlapLogic.ts` (Step 3)
- `frontend/src/features/mutual-funds/overlap/TopPairs.tsx` (Step 3)
- `frontend/src/features/mutual-funds/overlap/ImpactDonut.tsx` (Step 3)

**Do not touch:** every `*.test.ts(x)` file, `types.ts`, `fixtures/` (including the new `fixtures/mfAsks.ts`), `testing.tsx`, `package.json`, `package-lock.json`, `src/index.css`, `src/lib/**`, `src/components/**`, `src/shell/**` (no route file changes in this run), `src/features/**` outside the Mutual Funds folder, anything under `backend/` or `Docs/`. The guard test's file count stays 53 (no file is added).
**Tests to satisfy (committed; read each before its step):** `transactions/transactionsLogic.asks.test.ts` (5), `SipBanner.asks.test.tsx` (5), `Ledger.asks.test.tsx` (7), `TransactionsPage.asks.test.tsx` (2); `allocation/allocationLogic.asks.test.ts` (4), `AssetClassCard.asks.test.tsx` (9), `AllocationPage.asks.test.tsx` (1); `overlap/overlapLogic.asks.test.ts` (10), `TopPairs.asks.test.tsx` (10), `ImpactDonut.asks.test.tsx` (11), `OverlapPage.asks.test.tsx` (2); and `fixtures/mfAsks.test.ts` (10, already green: it checks the fixture arithmetic). Read `fixtures/mfAsks.ts` first: it shows the exact shape of every new field and how each number was derived (units = amount / NAV, class funds add up to the class value, drivers are the smaller fund weight and its share of the pair overlap).
**Already in the folder (do not edit):** the types (`InvestmentWithdrawalEntry.units/nav/folio`, `InvestmentWithdrawalResult["sip_summary"].missed_sip_fund/missed_sip_date`, `AssetAllocationClass.funds`, `AssetAllocationClassFund`, `OverlapSummary.impact_pairs/pairs_at_low_boundary`, `OverlapImpactPair`, `OverlapDriver`), `formatDecimal` in `src/lib/decimal.ts` (exact two-place half-up), `formatDate` in `src/lib/format.ts`.

## 4. Specifications
Visual language: the feature's own `--ui-*` tokens and the existing class strings, copied below. Only structure, text, test ids and attributes are checked.

### Step 1: Transactions (`transactionsLogic.ts`, `SipBanner.tsx`, `Ledger.tsx`)
Make exactly these changes (a unified diff against the current files; lines starting with `+` are added, `-` removed):
```diff
--- a/frontend/src/features/mutual-funds/transactions/Ledger.tsx
+++ b/frontend/src/features/mutual-funds/transactions/Ledger.tsx
@@ -14,6 +14,7 @@ import {
   LEDGER_PAGE,
   type LedgerFilter,
   type LedgerKind,
+  ledgerDetail,
   ledgerRows,
 } from "./transactionsLogic";
 
@@ -177,6 +178,7 @@ export function Ledger({ buckets, filter, onFilter }: LedgerProps) {
 
                   if (!isOpen) return [el];
 
+                  const extra = ledgerDetail(row.entry);
                   const detailRow = (
                     <tr
                       key={`detail-${id}`}
@@ -215,10 +217,30 @@ export function Ledger({ buckets, filter, onFilter }: LedgerProps) {
                               {id}
                             </dd>
                           </div>
+                          {extra?.units != null && (
+                            <div>
+                              <dt className="text-[var(--ui-text-muted)]">Units</dt>
+                              <dd className="font-medium text-[var(--ui-text)]">{extra.units}</dd>
+                            </div>
+                          )}
+                          {extra?.nav != null && (
+                            <div>
+                              <dt className="text-[var(--ui-text-muted)]">NAV</dt>
+                              <dd className="font-medium text-[var(--ui-text)]">{extra.nav}</dd>
+                            </div>
+                          )}
+                          {extra?.folio != null && (
+                            <div>
+                              <dt className="text-[var(--ui-text-muted)]">Folio</dt>
+                              <dd className="font-mono text-[11px] text-[var(--ui-text)]">{extra.folio}</dd>
+                            </div>
+                          )}
                         </dl>
-                        <p className="mt-3 text-xs text-[var(--ui-text-muted)]">
-                          Units, NAV and folio are not part of this data yet.
-                        </p>
+                        {extra === null && (
+                          <p className="mt-3 text-xs text-[var(--ui-text-muted)]">
+                            Units, NAV and folio are not part of this data yet.
+                          </p>
+                        )}
                       </td>
                     </tr>
                   );
--- a/frontend/src/features/mutual-funds/transactions/SipBanner.tsx
+++ b/frontend/src/features/mutual-funds/transactions/SipBanner.tsx
@@ -1,14 +1,14 @@
 import { formatRupees } from "../../../lib/format";
 import type { InvestmentWithdrawalResult } from "../types";
+import { missedSipTooltip } from "./transactionsLogic";
 
 export interface SipBannerProps {
   summary: InvestmentWithdrawalResult["sip_summary"];
 }
 
-const MISSED_TOOLTIP =
-  "A scheduled SIP instalment did not appear on the latest statement.";
-
 export function SipBanner({ summary }: SipBannerProps) {
+  const missedTooltip = missedSipTooltip(summary);
+
   if (summary.active_count === 0) {
     return (
       <div
@@ -44,8 +44,8 @@ export function SipBanner({ summary }: SipBannerProps) {
           role="note"
           tabIndex={0}
           data-testid="sip-missed"
-          title={MISSED_TOOLTIP}
-          data-tooltip={MISSED_TOOLTIP}
+          title={missedTooltip}
+          data-tooltip={missedTooltip}
           className="rounded-full bg-[var(--warn-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--warn-text)] cursor-help"
         >
           {summary.missed_count} missed{" "}
--- a/frontend/src/features/mutual-funds/transactions/transactionsLogic.ts
+++ b/frontend/src/features/mutual-funds/transactions/transactionsLogic.ts
@@ -1,4 +1,5 @@
-import { diffDecimalStrings, sumDecimalStrings } from "../../../lib/decimal";
+import { diffDecimalStrings, formatDecimal, sumDecimalStrings } from "../../../lib/decimal";
+import { formatDate } from "../../../lib/format";
 import { MONTHS_LONG } from "../mfCopy";
 import type {
   InvestmentWithdrawalBucket,
@@ -158,3 +159,32 @@ export function barHeights(
     };
   });
 }
+
+export interface LedgerDetail {
+  units: string | null;
+  nav: string | null;
+  folio: string | null;
+}
+
+const present = (value: string | null | undefined): value is string => typeof value === "string" && value.trim() !== "";
+
+/** The optional units, NAV and folio of one ledger entry (backend C160), ready to show; null when the entry has none of
+ * them (an old payload), so the row keeps its "not part of this data yet" sentence. Units are shown as sent (they carry
+ * three places), the NAV in rupees to two places, the folio as the backend masked it. */
+export function ledgerDetail(entry: InvestmentWithdrawalEntry): LedgerDetail | null {
+  const units = present(entry.units) ? entry.units : null;
+  const nav = present(entry.nav) ? `₹${formatDecimal(entry.nav)}` : null;
+  const folio = present(entry.folio) ? entry.folio : null;
+  return units === null && nav === null && folio === null ? null : { units, nav, folio };
+}
+
+const MISSED_SIP_GENERIC = "A scheduled SIP instalment did not appear on the latest statement.";
+
+/** The tooltip of the missed-instalment badge: names the fund and the due date of the first missed instalment when the
+ * backend sends both (the mockup's wording), otherwise the generic sentence. */
+export function missedSipTooltip(summary: InvestmentWithdrawalResult["sip_summary"]): string {
+  const fund = summary.missed_sip_fund;
+  const due = formatDate(summary.missed_sip_date);
+  if (!present(fund) || due === "—") return MISSED_SIP_GENERIC;
+  return `${fund} — SIP due ${due} was not debited`;
+}
```
Behaviour the tests check:
- `ledgerDetail(entry)`: `null` when units, NAV and folio are all absent, `null` or an empty string; otherwise `{ units, nav, folio }` where **units are shown as the backend sent them** (`"200.000"`, three places kept), **NAV is `₹` plus `formatDecimal(nav)`** (two places, half-up: `"43.6250"` gives `₹43.63`, `"43.6249"` gives `₹43.62`) and the folio is shown as sent; a missing part is `null`.
- `missedSipTooltip(summary)`: `"<fund> — SIP due <dd Mon yyyy> was not debited"` (for example `HDFC Mid-Cap Opportunities Fund — SIP due 05 Oct 2026 was not debited`) when the fund is a non-empty string and the date formats; otherwise the existing generic sentence. The badge keeps its text, `role="note"`, `title` and `data-tooltip` (both the same text).
- The expanded ledger row keeps its five facts (Member, Transaction, Date, Amount, Transaction ID) and, **after them**, adds Units, NAV and Folio, each only when it exists; the old sentence "Units, NAV and folio are not part of this data yet." shows **only** when the entry has none of the three. The table keeps its four columns.
**Checkpoint 1:** `npx vitest run src/features/mutual-funds/transactions --maxWorkers=4` → expect **Test Files 10 passed, Tests 89 passed** (the four new files hold 5, 5, 7 and 2 of them).

### Step 2: Asset Class drill (`allocationLogic.ts`, `AssetClassCard.tsx`)
```diff
--- a/frontend/src/features/mutual-funds/allocation/AssetClassCard.tsx
+++ b/frontend/src/features/mutual-funds/allocation/AssetClassCard.tsx
@@ -11,6 +11,7 @@ import {
   assetSlices,
   CAP_LABELS,
   chartPct,
+  classFunds,
   colorAt,
   hasNegative,
   largestSlice,
@@ -60,6 +61,7 @@ export function AssetClassCard({
   const containsNegative = useMemo(() => hasNegative(slices), [slices]);
 
   const selectedSlice = validSelected ? slices.find(s => s.key === validSelected) ?? null : null;
+  const funds = variant && validSelected ? classFunds(variant, validSelected) : null;
 
   const R_OUTER = 88;
   const R_INNER = 56;
@@ -363,6 +365,35 @@ export function AssetClassCard({
                   ))}
               </ul>
 
+              {funds !== null && funds.length > 0 && (
+                <div className="mt-3 flex flex-col gap-1.5">
+                  <p data-testid="drill-funds-title" className="text-xs font-semibold text-[var(--ui-text)]">
+                    Contributing funds
+                  </p>
+                  <ul aria-label="Contributing funds" className="flex flex-col gap-1 text-xs">
+                    {funds.map(fund => (
+                      <li
+                        key={fund.scheme_id}
+                        data-testid={`drill-fund-${fund.scheme_id}`}
+                        className="flex items-center justify-between gap-3 rounded-lg border border-[var(--ui-divider)] px-3 py-2"
+                      >
+                        <span data-testid={`drill-fund-name-${fund.scheme_id}`} className="text-[var(--ui-text)]">
+                          {fund.scheme_name}
+                        </span>
+                        <span data-testid={`drill-fund-value-${fund.scheme_id}`} className="font-medium text-[var(--ui-text)]">
+                          {`${formatRupees(fund.value)} · ${formatPercent(fund.percentage, { digits: 1 })} of ${selectedSlice.label}`}
+                        </span>
+                      </li>
+                    ))}
+                  </ul>
+                </div>
+              )}
+              {funds !== null && funds.length === 0 && (
+                <p data-testid="drill-funds-empty" className="mt-3 text-xs text-[var(--ui-text-muted)]">
+                  No fund adds a positive amount to this class.
+                </p>
+              )}
+
               {validSelected === "equity" ? (
                 <button
                   type="button"
@@ -378,11 +409,11 @@ export function AssetClassCard({
                 >
                   See the stock-level split in Market-Cap Allocation
                 </button>
-              ) : (
+              ) : funds === null ? (
                 <p data-testid="drill-gap-note" className="mt-2 text-xs text-[var(--ui-text-muted)]">
                   A fund-by-fund breakdown isn't available for this class yet; the look-through produces one total for it.
                 </p>
-              )}
+              ) : null}
             </DrillPanel>
           )}
         </div>
--- a/frontend/src/features/mutual-funds/allocation/allocationLogic.ts
+++ b/frontend/src/features/mutual-funds/allocation/allocationLogic.ts
@@ -2,6 +2,7 @@ import { compareDecimalStrings, sumDecimalStrings } from "../../../lib/decimal";
 import { percentOf, slugify } from "../mfCopy";
 import type {
   AnalyticsAllocationBucket,
+  AssetAllocationClassFund,
   AssetAllocationVariant,
   AssetClassKey,
   CapAllocationSummary,
@@ -202,3 +203,9 @@ export function fundsInSlice(
 
   return { funds, count: funds.length };
 }
+
+/** The funds behind one asset class (backend C160), in the order the backend sent them (largest first); null when the
+ * payload has none for the class (an old payload), which is different from an empty list. */
+export function classFunds(variant: AssetAllocationVariant, key: AssetClassKey): AssetAllocationClassFund[] | null {
+  return variant.classes.find(item => item.key === key)?.funds ?? null;
+}
```
Behaviour the tests check: `classFunds(variant, key)` returns that class's `funds` untouched (no re-sorting, no filtering), `null` when the class or its `funds` is absent or null, and `[]` for an empty list. In the drill panel, **between the class-total/size-split list and the market-cap link or note**: a non-empty list shows a title "Contributing funds" (`data-testid="drill-funds-title"`) and a `ul` named "Contributing funds" with one `li` per fund (`data-testid="drill-fund-<scheme_id>"`, a name span `drill-fund-name-<scheme_id>`, a value span `drill-fund-value-<scheme_id>` reading exactly `₹11,90,000 · 35.9% of Equity`: rupees, one-place percentage **of the class**, the class label); an empty list shows "No fund adds a positive amount to this class." (`drill-funds-empty`) and no list; **the old "A fund-by-fund breakdown isn't available..." note (`drill-gap-note`) shows only when `funds` is absent or null**. Equity keeps its size split and the Market-Cap link. The funds follow the arbitrage switch (they come from the variant on screen). No new control.
**Checkpoint 2:** `npx vitest run src/features/mutual-funds/allocation --maxWorkers=4` → expect **Test Files 9 passed, Tests 112 passed** (the three new files hold 4, 9 and 1 of them).

### Step 3: Overlap (`overlapLogic.ts`, `TopPairs.tsx`, `ImpactDonut.tsx`)
```diff
--- a/frontend/src/features/mutual-funds/overlap/ImpactDonut.tsx
+++ b/frontend/src/features/mutual-funds/overlap/ImpactDonut.tsx
@@ -4,7 +4,7 @@ import type { AnalyticsCardProps } from "../allocation/allocationLogic";
 import { SectionCard } from "../common/SectionCard";
 import { SlicedDonut } from "../common/charts";
 import type { OverlapSummary, Slice } from "../types";
-import { impactBreakdown } from "./overlapLogic";
+import { impactBreakdown, impactPairs, pairKey } from "./overlapLogic";
 
 const COLORS: Record<string, string> = {
   top3: "var(--neg)",
@@ -22,6 +22,7 @@ export function ImpactDonut({
 
   const count = data ? Math.min(3, data.pairs_above_low.length) : 0;
   const rows = data ? impactBreakdown(data) : [];
+  const drivers = data ? impactPairs(data) : [];
 
   const slices: Slice[] = rows.map(r => ({
     key: r.key,
@@ -117,6 +118,43 @@ export function ImpactDonut({
               </div>
             </>
           )}
+
+          {drivers.length > 0 && (
+            <section data-testid="impact-drivers" aria-label="What drives the overlap" className="space-y-3 border-t border-[var(--ui-divider)] pt-4">
+              <h4 className="text-sm font-semibold text-[var(--ui-text)]">What drives the overlap</h4>
+              <p className="text-xs text-[var(--ui-text-muted)]">The biggest shared stocks behind your top overlapping pairs.</p>
+              {drivers.map(pair => {
+                const key = pairKey(pair.fund_a.scheme_id, pair.fund_b.scheme_id);
+                const title = `${pair.fund_a.scheme_name} × ${pair.fund_b.scheme_name}`;
+                return (
+                  <div key={key} data-testid={`impact-pair-${key}`} data-pair={key} className="space-y-1.5">
+                    <div className="flex flex-wrap items-baseline justify-between gap-2">
+                      <h5 data-testid={`impact-pair-title-${key}`} className="text-xs font-semibold text-[var(--ui-text)]">{title}</h5>
+                      <span data-testid={`impact-pair-overlap-${key}`} className="text-xs text-[var(--ui-text-muted)]">
+                        {`${formatPercent(pair.overlap_pct, { digits: 0 })} overlap`}
+                      </span>
+                    </div>
+                    <ul aria-label={`Stocks driving ${title}`} className="flex flex-col gap-1 text-xs">
+                      {pair.drivers.map(stock => (
+                        <li
+                          key={stock.isin}
+                          data-testid={`impact-driver-${key}-${stock.isin}`}
+                          className="flex items-center justify-between gap-3 rounded-lg border border-[var(--ui-divider)] px-3 py-2"
+                        >
+                          <span data-testid={`impact-driver-name-${key}-${stock.isin}`} className="text-[var(--ui-text)]">
+                            {stock.instrument_name}
+                          </span>
+                          <span data-testid={`impact-driver-value-${key}-${stock.isin}`} className="text-[var(--ui-text-muted)]">
+                            {`${formatPercent(stock.contribution_pct, { digits: 2 })} of net assets · ${formatPercent(stock.share_of_pair_pct, { digits: 1 })} of the overlap`}
+                          </span>
+                        </li>
+                      ))}
+                    </ul>
+                  </div>
+                );
+              })}
+            </section>
+          )}
         </div>
       )}
     </SectionCard>
--- a/frontend/src/features/mutual-funds/overlap/TopPairs.tsx
+++ b/frontend/src/features/mutual-funds/overlap/TopPairs.tsx
@@ -8,9 +8,9 @@ import {
   buildOverlapInsights,
   combinedWeight,
   fundInitials,
+  inclusivePairs,
   PAIR_LIMIT,
   pairKeyOf,
-  sortedPairs,
 } from "./overlapLogic";
 
 export interface TopPairsProps extends AnalyticsCardProps<OverlapSummary> {
@@ -27,7 +27,7 @@ export function TopPairs({
 }: TopPairsProps) {
   const [showAll, setShowAll] = useState(false);
 
-  const pairs = data ? sortedPairs(data.pairs_above_low) : [];
+  const pairs = data ? inclusivePairs(data) : [];
   const displayed = showAll ? pairs : pairs.slice(0, PAIR_LIMIT);
   const insights = data ? buildOverlapInsights(data) : [];
 
--- a/frontend/src/features/mutual-funds/overlap/overlapLogic.ts
+++ b/frontend/src/features/mutual-funds/overlap/overlapLogic.ts
@@ -7,6 +7,7 @@ import type {
   ConcentrationPoint,
   FundContribution,
   OverlapFund,
+  OverlapImpactPair,
   OverlapPair,
   OverlapSummary,
   StockHoldingRow,
@@ -79,7 +80,7 @@ export function findPair(summary: OverlapSummary, key: string | null): OverlapPa
   if (inMatrix) return inMatrix;
   const inAboveLow = summary.pairs_above_low.find(p => pairKeyOf(p) === key);
   if (inAboveLow) return inAboveLow;
-  return null;
+  return (summary.pairs_at_low_boundary ?? []).find(p => pairKeyOf(p) === key) ?? null;
 }
 
 export function riskBand(summary: OverlapSummary): Band | null {
@@ -294,3 +295,24 @@ export function concentrationCurve(points: ConcentrationPoint[]): { points: Curv
 export function allStocksPath(): string {
   return `${paths.mutualFunds.holdings()}#all-holdings`;
 }
+
+/** The pairs the Top Pairs table lists: those above the low band plus those exactly at it (backend C160 leaves
+ * `pairs_above_low` strict), each pair once, largest overlap first. The stat strip counts pairs at the band as
+ * overlapping too, so the table agrees with it. */
+export function inclusivePairs(summary: OverlapSummary): OverlapPair[] {
+  const seen = new Set<string>();
+  const joined: OverlapPair[] = [];
+  for (const pair of [...summary.pairs_above_low, ...(summary.pairs_at_low_boundary ?? [])]) {
+    const key = pairKeyOf(pair);
+    if (seen.has(key)) continue;
+    seen.add(key);
+    joined.push(pair);
+  }
+  return sortedPairs(joined);
+}
+
+/** The top pairs with the stocks behind their overlap (backend C160), in the backend's order; empty when the field is
+ * absent or null, and a pair with no drivers is left out. */
+export function impactPairs(summary: OverlapSummary): OverlapImpactPair[] {
+  return (summary.impact_pairs ?? []).filter(pair => pair.drivers.length > 0);
+}
```
Behaviour the tests check:
- `inclusivePairs(summary)`: `pairs_above_low` plus `pairs_at_low_boundary` (absent or null counts as empty), each pair once (same `pairKeyOf`), sorted by `sortedPairs` over the **merged** list; it does not mutate the summary.
- `impactPairs(summary)`: `summary.impact_pairs` in the backend's order (absent or null gives `[]`), leaving out any pair whose `drivers` list is empty.
- `findPair` also finds a pair that is only in `pairs_at_low_boundary` (after the matrix and `pairs_above_low`).
- **Top Pairs** lists `inclusivePairs(data)`: a pair at the low band appears as its own row (numbered, 20% overlap, its shared-stock count and combined weight, bar `data-band` `moderate`), can be selected, counts towards the five-row limit; "No pairs above this threshold." only when the inclusive list is empty. The **key insights stay on the strict `pairs_above_low`** (unchanged `buildOverlapInsights`).
- **Overlap Impact** keeps its donut, headline and three rows exactly as before and, when `impactPairs` is not empty, adds below them a section (`data-testid="impact-drivers"`, `aria-label="What drives the overlap"`) with the heading "What drives the overlap", the line "The biggest shared stocks behind your top overlapping pairs." and one block per pair (`data-testid="impact-pair-<pairKey>"`, `data-pair="<pairKey>"`; title `<fund A> × <fund B>` in `impact-pair-title-<pairKey>`; `41% overlap` in `impact-pair-overlap-<pairKey>`; a `ul` named `Stocks driving <fund A> × <fund B>` with one `li` per driver, `data-testid="impact-driver-<pairKey>-<isin>"`, name in `impact-driver-name-<pairKey>-<isin>`, value in `impact-driver-value-<pairKey>-<isin>` reading exactly `7.80% of net assets · 19.2% of the overlap`: the contribution to two places, the share of the pair to one place). `pairKey` is the existing helper (the two scheme ids sorted and joined with `~`). Without the field, nothing is added. No new control.
**Checkpoint 3:** `npx vitest run src/features/mutual-funds/overlap --maxWorkers=4` → expect **Test Files 12 passed, Tests 165 passed** (the four new files hold 10, 10, 11 and 2 of them).

### Step 4: the whole folder and the guards
`npx vitest run src/features/mutual-funds --maxWorkers=4` → expect **Test Files 61 passed, Tests 944 passed**.

### Step 5: final checks (from `frontend/`, in this order; paste every output)
```
npx tsc -b                                          # expect: no output
npx oxlint src/features/mutual-funds                # expect: exit code 0, no warning
npx vitest run src/features/mutual-funds --maxWorkers=4   # expect: Test Files 61 passed, Tests 944 passed
npx vitest run src/components/mf --maxWorkers=4           # expect: Test Files 9 passed, Tests 48 passed
npx vitest run src/shell src/App.test.tsx --maxWorkers=4  # expect: Test Files 27 passed, Tests 348 passed
npx vitest run src/components/ui/charts src/lib src/styles   # expect: Test Files 16 passed, Tests 188 passed
npm run build                                       # expect: "built in" with no error (a chunk-size warning is normal)
cd .. && git status --short -uall                   # expect: " M" for exactly the eight files of section 3, nothing else
```
**Do not commit and do not push.** The orchestrator verifies and commits.

## Stop conditions
Stop and report if: Step 0 does not match; a checkpoint still fails after two honest attempts; a test appears to contradict this packet; you would need to edit a file outside section 3 (above all a test, `types.ts`, a fixture, a route file or anything in `components/`); a command needs `npm install`; you are tempted to create a file, make a fund or stock row clickable, change the strict lists the donut, stat strip or insights use, or open the Individual Fund page.

## 5. Report (fill in at the end, in one fenced block, with the real command outputs)
```
GEMINI REPORT — ui-redesign — ASKS-FE-M (new backend fields in the Mutual Funds front end)
Model and tool:    Date/time:
0. ENVIRONMENT: WSL terminal or wsl.exe prefix? Could you edit files? Step 0 outputs (all eight):
1. FILES EDITED (exact paths; confirm none created):
2. CHECKPOINTS: for each of 1 to 4, the command and the last lines of its output (passed counts):
3. FINAL CHECKS (step 5), full outputs:
4. ANYTHING THAT DIFFERED FROM THE PACKET, and what you did:
5. TESTS THAT SEEMED WRONG (if any), with the exact failing assertion:
6. THINGS YOU COULD NOT DO OR VERIFY:
7. CONFIRMATIONS: tests untouched: yes/no; types.ts, fixtures and testing.tsx untouched: yes/no; files outside the file map untouched: yes/no; no file created: yes/no; nothing imported from another feature: yes/no; no new button added: yes/no; no npm install: yes/no; no route file touched: yes/no; nothing committed: yes/no
```

## 6. Spec conflicts, defaults and backend asks (not for Gemini; for the orchestrator and the register)
**Conflicts found and how this packet resolves them (precedence: mockup, register and owner decisions, design docs, plan):**
- **Ledger columns.** The Transactions mockup draws Units and NAV as columns in the period-drill table and Units, NAV and Folio in the expanded ledger row; register C132 fixed the ledger at Date, Fund, Type, Amount. Default: **only the expanded row** gets the three facts (the ledger's four columns and the by-fund period drill, which groups entries, are unchanged).
- **Asset Class drill, equity.** The mockup's Equity drill lists top stocks ("top holdings"), the others "contributing funds"; register C132 fixed the Equity drill as class total, size split and a Market-Cap link, and the backend sends `funds` for every class including equity. Default: **contributing funds for all four classes, equity included**, kept below the existing size split and above the Market-Cap link; the stock-level view stays the Market-Cap card's job.
- **Inclusive pairs and the other overlap blocks.** The backend left `pairs_above_low` strict. Default: the Top Pairs table is inclusive (it then agrees with the stat strip, which already counts pairs at the band as overlapping); the Overlap Impact donut, its headline and the key insights stay on the strict list, because "top 3 overlapping pairs" is defined on it and `impact_pairs` is derived from it.
**Defaults taken, needing register entries (numbered here for the entry; C-numbers assigned by the orchestrator):**
1. Ledger units, NAV and folio appear in the expanded ledger row only, after the existing facts, each only when sent; units as sent (three places), NAV in rupees to two places half-up, folio as masked; the "not part of this data yet" sentence shows only when an entry has none of the three.
2. The missed-SIP indication stays the existing badge on the SIP banner (the mockup's place); only its tooltip changes to "`<fund> — SIP due 05 Oct 2026 was not debited`" (mockup wording) when both parts arrive, else the generic sentence. No new visible text.
3. The Asset Class drill lists contributing funds for all four classes (value, share of the class, class label), in the backend's order, plain rows (the mockup rows are not clickable); an empty list says "No fund adds a positive amount to this class."; the "not available yet" note shows only when the field is absent or null.
4. Top Pairs is the inclusive list (`pairs_above_low` plus `pairs_at_low_boundary`, deduplicated by pair, re-sorted by overlap); `findPair` also looks in the boundary list; donut, headline and key insights stay strict.
5. Stock-level impact breakdown: a static "What drives the overlap" section inside the Overlap Impact card (no mockup exists for it), one block per impact pair with its drivers: smaller fund weight ("of net assets") and share of the pair's overlap; hidden when `impact_pairs` is absent, null, empty or all drivers empty.
6. TER `annual_ter_saving` needed no work: MF-C already shows it per Direct fund row and in the savings line; its tests exist.
7. The new fields may arrive as `null` as well as absent (backend models default to `None`); every reader treats both alike.
**Backend asks:** none new. Noted for later: `missed_sip_date` is "the month after the last paid instalment" (the first missed instalment of the SIP with the most misses, per C160), so the tooltip says "SIP due <date>"; if a different date convention is wanted, the wording is one string in `missedSipTooltip`.
**Verification record (orchestrator, 27 Oct):** reference solution in `C:\Users\Dell\Desktop\MVP v1\ref\mf-fe-ref-m` (never committed) passes: `tsc -b` exit 0, `oxlint src/features/mutual-funds` exit 0 and silent, feature folder 61 files / 944 tests (baseline 49 / 868, +12 files / +76 tests), `src/components/mf` 9 / 48, shell + App 27 / 348 (unchanged), kit (`charts`, `lib`, `styles`) 16 / 188 (unchanged), `npm run build` built. Red state on the committed tests: `tsc -b` 15 error lines (all in the new test files); feature 12 failed files / 51 failed tests of 944. Mutation checks on the reference, all caught: pairs at the band left out of the inclusive list (13 tests fail), duplicates not removed (1), tooltip wording changed (4), NAV not rounded to two places (4), class funds reversed (5), a one-fund list not shown (1), contribution shown to one place (2), old sentence always shown (2).
**Unverified:** no browser pass (the new rows and the drivers section in light and dark, long fund names wrapping inside the flex rows, the drill panel scroll nudge with the longer content); the real backend payload against the types (checked only against the backend schema file and the backend tests' numbers: folio `1234567/89` gives `XXXX6789`; the fixture's equity example is hand-derived from the sibling fixture, not a backend golden).

## 7. Gemini prompt (paste into the Gemini window for folder `W:\home\ayush\wt\mf-fe`)
```
You are the front-end builder for the Unifolio UI redesign. Open the folder W:\home\ayush\wt\mf-fe (WSL path /home/ayush/wt/mf-fe, branch feat/mf-frontend). Before anything else run `git status --short` and `git log --oneline -3` inside WSL; the first must print nothing and the top commit must be the red-test commit the packet names (test(mutual-funds): failing tests for the new backend fields (ASKS-FE-M)). If not, STOP and report; do not fix it yourself. Read, completely and in order, Docs/orchestration/ui-redesign-ASKS-FE-M-mutual-funds-packet.md (also at W:\home\ayush\wt\docs\Docs\orchestration\ui-redesign-ASKS-FE-M-mutual-funds-packet.md). It is the whole truth for this run: do Step 0 first and report its outputs, then follow every step, rule and checkpoint exactly. The tests are already written and red; you edit only the eight source files the packet names (transactions/transactionsLogic.ts, SipBanner.tsx, Ledger.tsx; allocation/allocationLogic.ts, AssetClassCard.tsx; overlap/overlapLogic.ts, TopPairs.tsx, ImpactDonut.tsx), exactly as specified, and you create no file. Never edit a test, fixture, types.ts or testing.tsx, never run npm install, never commit, never add a button or make a row clickable, never import another feature into the Mutual Funds folder, never touch the Individual Fund page or any route. Run every command inside WSL (wsl.exe -d Ubuntu --cd /home/ayush/wt/mf-fe ...) and never run two vitest or tsc commands at once. If tests time out under load, rerun with --maxWorkers=4. When done, send the report in the packet's report template with real command outputs. If anything differs from the packet, stop and report it.
```
