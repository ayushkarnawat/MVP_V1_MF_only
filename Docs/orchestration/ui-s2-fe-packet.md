# Packet S2-FE for Gemini (Antigravity): Home allocation donut with a funds pop-up, and new funds after an upload (two phases)
**Status:** READY FOR GEMINI (red tests committed on `leapswitch-redesign`; reference solution written by the orchestrator in a scratch clone and run green against every test in this packet, 3 Nov 2026). Do this packet **after** the S1 packet (`ui-s1-fe-packet.md`) is finished and committed.
**Plan:** `Docs/orchestration/2026-11-02-ui-round-2-and-auth-redesign-implementation-plan.md`, Stage S2, Tasks 2.2 and 2.5. Rules file: `Docs/orchestration/ui-common-rules-antigravity.md` (read it first; this packet adds to it).
**Owner decision (3 Nov):** there is no import result screen today, so the new-funds list does **not** get one. It appears (1) from the notice shown after Add data and (2) inside Import History. Today's import screens do not change. The plan's `ImportStats` tiles are therefore not built.

## What this run is, in one paragraph
Two phases in one run. **Phase A:** the Home asset allocation donut gets the Mutual Funds donut's behaviour (hover and focus dim the other slices and highlight the legend row, click or Enter or Space opens a pop-up listing the class and its funds). **Phase B:** after an in-app upload, the notice shows `Import complete · N new funds, M transactions added`, names up to two funds and has a **View new funds** button that opens the full list in a pop-up; Import History gets a **Show new funds** toggle per successful import. The backend already returns the data (`funds` per class on the Home allocation, `new_funds` on the confirm response, `GET /imports/{id}/new-funds`). The tests are already written and committed and **fail now**; make them pass without editing any test. Do phase A completely (checkpoint A), then phase B (checkpoint B), then the final checks.

## Rules (read twice)
1. **Scope.** Create the 3 files and edit the 9 files listed in section 3, nothing else. Every test file and fixture is already in place: **never edit a test or a fixture to make it pass.** If a test seems wrong, stop and describe it in the report.
2. **Run the phase checkpoint after every phase** and keep its real output for the report. Fix your code, not the test. **If a checkpoint is still red after two attempts, stop and report; do not start the next phase.**
3. **No new dependency, no `npm install`, no `package.json` change.**
4. **Never run a git command that changes anything.** Read-only `git status`, `git diff`, `git log` are fine.
5. **Do not touch `backend/**`.**
6. **Guards.** Each feature folder has a guard test that forbids importing another feature (`features/home` may import only `@/*` and its own folder; `features/import` the same plus `components` and `shell`). The shared list lives in `components/mf/NewFundsList.tsx` for that reason. Do not edit a guard test.
7. **Plain words on screen.** Exactly the strings in this packet. No em-dashes in new text (the `·` in the notice text is a middle dot and is required). No hard-coded colours.
8. **Style.** 2-space indentation, double quotes, semicolons, no `any`, no unused imports or locals (`tsc -b` is strict), no `console.`. Do not add `oxlint-disable` comments. A file that exports a component must not also export a constant or hook.
9. **Money is never added on the client.** Amounts arrive as strings and are only formatted.
10. **Mobile is unchanged.** Do not touch `src/mobile/**` or the legacy `DashboardView`.
11. **If anything differs from this packet, stop and report it.**
12. **Run every command inside WSL** through the script shown in Step 0. A test that fails with "Unable to find an element ... timed out" under load: re-run that file alone before reporting it.

## Step 0: environment check (do this first, and report the output)
Work only in `C:\Users\Dell\ui-r2-fe`. Run from that folder in PowerShell:
```
git status --short                 # expect: nothing printed (run this FIRST)
git branch --show-current          # expect: leapswitch-redesign
git log --oneline -3               # expect: top line "ui-s2: red tests and packet for the S2 frontend fixes (Gemini)" (a later docs commit may sit above it)
```
Every check goes through one command; replace `<mode and paths>`:
```
wsl.exe -d Ubuntu -- env CR6_SRC=/mnt/c/Users/Dell/ui-r2-fe/frontend CR6_DST=/home/delladiti/ui-r2-fe-chk bash /mnt/c/Users/Dell/ui-r2-fe/Docs/orchestration/cr-r6-fe-check.sh <mode and paths>
```
`<mode and paths>` is `types`, `lint`, `build`, or `test <paths under src/>`. Expected before you start (these are the committed red tests):
```
test src/features/home src/features/import src/components/mf   # expect: Test Files 9 failed | 66 passed (75); Tests 23 failed | 914 passed | 2 skipped (939)
types                                                          # expect: type errors only in test files, all of them about something this packet adds (`funds`, `new_funds`, `getImportNewFunds`, `NewFund`, `./NewFundsList`, `./AllocationClassDialog`, `./importNotice`, the new donut props), plus the S1 packet's errors if that packet is not done yet; none in a source file
```
If you see any other failing file, stop and report it.

## Goal
Make every test listed in section 5 pass with the behaviour in section 4, and keep the rest of the suite as it was. **Non-goals:** a result screen, the three stat tiles, any change to the Mutual Funds allocation donut (do not refactor it; sharing a ring component is a later clean-up), Home values hiding (the pop-up supports `hideValues`, but Home does not pass it yet), mobile, the backend.

## 3. File map (all under `frontend/src/`)
**Create (3):**
- `features/home/components/AllocationClassDialog.tsx` (Phase A)
- `components/mf/NewFundsList.tsx` (Phase B)
- `features/import/importNotice.ts` (Phase B)

**Edit (9):**
- Phase A: `features/home/types.ts`, `features/home/components/AllocationDonut.tsx`, `features/home/sections/Allocation.tsx`
- Phase B: `features/import/types.ts`, `features/import/api.ts`, `features/import/useImportOrchestration.tsx`, `features/import/ImportFlow.tsx`, `features/import/ImportHistoryList.tsx`, `components/mf/PostImportNotice.tsx`

**Do not touch:** every `*.test.ts(x)` file, every fixture, the Mutual Funds feature, `features/individual-fund/**`, `src/shell/**`, `src/components/ui/**`, `package.json`, anything under `backend/`.
If `git status` shows a different count, stop and report.

## 4. Specifications

### Phase A: the Home donut and its funds pop-up (task 2.2)
What the screen does, in plain terms:
- Every live class with a value above zero is interactive, in the donut and in the legend, **even when the page gives no click handler** (the page does not). Clicking, Enter or Space opens the pop-up for that class and also calls `onClassClick` when it is given. A class with no value stays plain text.
- Hovering or focusing a slice highlights its legend row (`data-active="true"`) and dims the other slices to 38% opacity (`data-dim="true"`). Hovering or focusing a legend row dims the other slices the same way.
- While the pop-up is open the slice has `aria-pressed="true"`. When it closes, focus returns to the element that opened it (Radix only restores focus to a `Dialog.Trigger`, and this dialog has none, so the dialog takes a `returnFocusRef`).
- The pop-up shows the class name, its value and share, and a table of its funds; without funds it shows `Fund details are not available for this class yet.`

Create `features/home/components/AllocationClassDialog.tsx` exactly:
```tsx
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SchemeLogo } from "../../../components/SchemeLogo";
import { formatLegendPercent } from "../allocationCopy";
import { formatRupees } from "../homeFormat";
import type { ClassRowOut } from "../types";

export interface AllocationClassDialogProps {
  open: boolean;
  onClose: () => void;
  row: ClassRowOut;
  hideValues?: boolean;
  /** The element to focus on close. Radix only restores focus to a Dialog.Trigger, and this dialog has none. */
  returnFocusRef?: { current: HTMLElement | null };
}

const MASK = "••••••";

export function AllocationClassDialog({ open, onClose, row, hideValues = false, returnFocusRef }: AllocationClassDialogProps) {
  const money = (value: string | null) => (hideValues ? MASK : formatRupees(value));
  const funds = row.funds ?? [];
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent onCloseAutoFocus={(event) => { if (returnFocusRef?.current) { event.preventDefault(); returnFocusRef.current.focus(); } }}>
        <DialogHeader>
          <DialogTitle>{row.label}</DialogTitle>
          <DialogDescription>
            {money(row.value)} · {formatLegendPercent(row.percentage)} of your portfolio
          </DialogDescription>
        </DialogHeader>
        {funds.length === 0 ? (
          <p className="text-sm text-[var(--ui-text-muted)]">Fund details are not available for this class yet.</p>
        ) : (
          <table aria-label={`Funds in ${row.label}`} className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--ui-divider)] text-xs text-[var(--ui-text-muted)]">
                <th scope="col" className="py-2 pr-3 font-medium">Fund</th>
                <th scope="col" className="py-2 px-3 font-medium">Value</th>
                <th scope="col" className="py-2 pl-3 font-medium">Share of class</th>
              </tr>
            </thead>
            <tbody>
              {funds.map((fund) => (
                <tr key={fund.scheme_id} className="border-b border-[var(--ui-divider)]">
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-2 text-[var(--ui-text)]">
                      <SchemeLogo schemeName={fund.name} size="sm" />
                      <span>{fund.name}</span>
                    </span>
                  </td>
                  <td className="py-2 px-3 text-[var(--ui-text)]">{money(fund.value)}</td>
                  <td className="py-2 pl-3 text-[var(--ui-text-muted)]">{formatLegendPercent(fund.share_of_class)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

Apply these changes exactly (they are unified diffs of the three files; lines starting with `-` go, lines starting with `+` come in). Do not change anything else in those files.

`features/home/types.ts`:
```diff
--- a/frontend/src/features/home/types.ts
+++ b/frontend/src/features/home/types.ts
@@ -73,4 +73,5 @@ export interface WealthSeriesResponse extends Envelope {
 }
 
+export interface ClassFundOut { scheme_id: string; name: string; value: string; share_of_class: string }
 export interface ClassRowOut {
   key: string;
@@ -79,4 +80,5 @@ export interface ClassRowOut {
   value: string | null;
   percentage: string | null;
+  funds?: ClassFundOut[];
 }
 export interface MemberShareOut { id: string; name: string; value: string; percentage: string }
```

`features/home/components/AllocationDonut.tsx`:
```diff
--- a/frontend/src/features/home/components/AllocationDonut.tsx
+++ b/frontend/src/features/home/components/AllocationDonut.tsx
@@ -15,4 +15,7 @@ export interface AllocationDonutProps {
   centerLabel?: string;
   onSliceClick?: (key: string) => void;
+  activeKey?: string | null;
+  onActiveChange?: (key: string | null) => void;
+  selectedKey?: string | null;
   ariaLabel?: string;
 }
@@ -27,4 +30,7 @@ export function AllocationDonut({
   centerLabel = "Total value",
   onSliceClick,
+  activeKey = null,
+  onActiveChange,
+  selectedKey = null,
   ariaLabel = "Asset allocation",
 }: AllocationDonutProps) {
@@ -63,4 +69,5 @@ export function AllocationDonut({
             strokeDashoffset={dashOffset}
             transform="rotate(-90 80 80)"
+            data-dim={activeKey !== null && activeKey !== row.key ? "true" : "false"}
             {...(onSliceClick
               ? {
@@ -68,5 +75,10 @@ export function AllocationDonut({
                   tabIndex: 0,
                   "aria-label": labelText,
-                  style: { cursor: "pointer" },
+                  "aria-pressed": selectedKey === row.key,
+                  style: { cursor: "pointer", opacity: activeKey !== null && activeKey !== row.key ? 0.38 : 1 },
+                  onMouseEnter: () => onActiveChange?.(row.key),
+                  onMouseLeave: () => onActiveChange?.(null),
+                  onFocus: () => onActiveChange?.(row.key),
+                  onBlur: () => onActiveChange?.(null),
                   onClick: () => onSliceClick(row.key),
                   onKeyDown: (e: KeyboardEvent) => {
@@ -79,5 +91,5 @@ export function AllocationDonut({
                   },
                 }
-              : {})}
+              : { style: { opacity: activeKey !== null && activeKey !== row.key ? 0.38 : 1 } })}
           >
             <title>{labelText}</title>
```

`features/home/sections/Allocation.tsx` (note the comment: the pop-up row is read from `data.classes`, because `liveRows()` keeps only five display fields and drops `funds`; do **not** change `liveRows`):
```diff
--- a/frontend/src/features/home/sections/Allocation.tsx
+++ b/frontend/src/features/home/sections/Allocation.tsx
@@ -1,2 +1,3 @@
+import { useRef, useState } from "react";
 import type { KeyboardEvent } from "react";
 import { ArrowLeft, ArrowRight, ChevronRight } from "lucide-react";
@@ -9,4 +10,5 @@ import {
   soonRows,
 } from "../allocationCopy";
+import { AllocationClassDialog } from "../components/AllocationClassDialog";
 import { AllocationDonut } from "../components/AllocationDonut";
 import { FamilyCards } from "../components/FamilyCards";
@@ -36,4 +38,7 @@ export function Allocation({
   onRetry,
 }: AllocationProps) {
+  const [active, setActive] = useState<string | null>(null);
+  const [selected, setSelected] = useState<string | null>(null);
+  const openerRef = useRef<HTMLElement | null>(null);
   if (status === "loading") {
     return (
@@ -123,4 +128,11 @@ export function Allocation({
     (row) => compareDecimalStrings(row.value, "0") !== 0
   );
+  const openClass = (key: string) => {
+    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
+    setSelected(key);
+    onClassClick?.(key);
+  };
+  // Look the row up in the response, not in liveRows(): that helper keeps only the five display fields.
+  const selectedRow = selected ? data.classes.find((row) => row.key === selected) : undefined;
 
   return (
@@ -156,17 +168,19 @@ export function Allocation({
             rows={donutRows}
             centerValue={formatCompactRupees(data.total_value)}
-            onSliceClick={onClassClick}
+            onSliceClick={openClass}
+            activeKey={active}
+            onActiveChange={setActive}
+            selectedKey={selected}
           />
         </div>
         <div className="w-full flex-1 space-y-1">
           {live.map((row) => {
-            const isClickable = Boolean(onClassClick);
+            const isClickable = compareDecimalStrings(row.value, "0") !== 0;
             const handleKeyDown = (e: KeyboardEvent) => {
-              if (!onClassClick) return;
               if (e.key === "Enter") {
-                onClassClick(row.key);
+                openClass(row.key);
               } else if (e.key === " " || e.key === "Spacebar") {
                 e.preventDefault();
-                onClassClick(row.key);
+                openClass(row.key);
               }
             };
@@ -177,4 +191,5 @@ export function Allocation({
                 data-testid={`legend-${row.key}`}
                 data-color={row.color}
+                data-active={active === row.key ? "true" : "false"}
                 {...(isClickable
                   ? {
@@ -182,6 +197,10 @@ export function Allocation({
                       tabIndex: 0,
                       className: `flex items-center justify-between p-1.5 rounded-lg text-sm text-[var(--ui-text)] ${CLICK_ROW}`,
-                      onClick: () => onClassClick!(row.key),
+                      onClick: () => openClass(row.key),
                       onKeyDown: handleKeyDown,
+                      onMouseEnter: () => setActive(row.key),
+                      onMouseLeave: () => setActive(null),
+                      onFocus: () => setActive(row.key),
+                      onBlur: () => setActive(null),
                     }
                   : {
@@ -228,4 +247,6 @@ export function Allocation({
       </div>
 
+      {selectedRow ? <AllocationClassDialog open row={selectedRow} onClose={() => setSelected(null)} returnFocusRef={openerRef} /> : null}
+
       {data.members != null ? (
         <FamilyCards members={data.members} onSelectMember={onSelectMember} />
```

**Checkpoint A:** `test src/features/home` (expect all pass), then `types` (expect only the errors that belong to the packets you have not done yet; none in `features/home`).

### Phase B: new funds after an upload (task 2.5, decided on the notice and Import History)
What the screen does:
- After Add data (not the sign-up upload: the backend sends an empty list for it, so nothing changes there), when the confirm response has new funds, the notice reads `Import complete · N new funds, M transactions added` (`1 new fund`, `1 transaction` in the singular), a detail line `New funds: A, B` (or `New funds: A, B and 2 more`), and a **View new funds** button. The button opens a pop-up titled `New funds in this statement` with the list. With no new funds the notice is exactly what it is today.
- The list shows **every** new fund (no cap, no Show more). A row shows logo, name, fund house, `N transactions`, the invested amount and the latest date; it is a button that opens that fund's transactions (date, type in plain words, amount, units), up to the 20 the backend sends; for a fund with more transactions than are listed, the pop-up shows a `View all in Import History` link.
- Import History: each successful import gets a **Show new funds** button (becomes **Hide new funds**). It fetches `GET /imports/{id}/new-funds` once, then shows the list, `No new funds in this import.` when it is empty, or `Could not load new funds.` on failure.

Create `components/mf/NewFundsList.tsx` exactly:
```tsx
import { useState } from "react";
import { Link } from "react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatDate, formatRupees } from "@/lib/format";
import { paths } from "@/shell/nav/paths";
import { SchemeLogo } from "../SchemeLogo";

export interface NewFundTx { date: string; type: string; amount: string; units: string }
export interface NewFund {
  scheme_id: string;
  scheme_name: string;
  amc_name: string | null;
  invested_amount: string;
  latest_transaction_date: string;
  transaction_count: number;
  transactions: NewFundTx[];
}

export interface NewFundsListProps {
  funds: NewFund[];
  hideValues?: boolean;
  /** Show "View all in Import History" under a fund that has more transactions than are listed. */
  showHistoryLink?: boolean;
}

const MASK = "••••••";
const TYPE_LABELS: Record<string, string> = {
  PURCHASE: "Purchase", PURCHASE_SIP: "SIP", SWITCH_IN: "Switch in", REDEMPTION: "Redemption",
  DIVIDEND_REINVEST: "Dividend reinvested", BONUS: "Bonus",
};
const typeLabel = (type: string) =>
  TYPE_LABELS[type.toUpperCase()] ?? type.toLowerCase().split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");

export function NewFundsList({ funds, hideValues = false, showHistoryLink = false }: NewFundsListProps) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (funds.length === 0) return null;
  const money = (value: string) => (hideValues ? MASK : formatRupees(value));
  const toggle = (id: string) => setOpen(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  return (
    <ul className="space-y-2">
      {funds.map(fund => {
        const isOpen = open.has(fund.scheme_id);
        return (
          <li key={fund.scheme_id} className="rounded-xl border border-[var(--ui-divider)]">
            <button type="button" aria-expanded={isOpen} data-clickable="" data-effect="expand" onClick={() => toggle(fund.scheme_id)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left">
              <SchemeLogo schemeName={fund.scheme_name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[var(--ui-text)]">{fund.scheme_name}</span>
                <span className="block text-xs text-[var(--ui-text-muted)]">
                  {fund.amc_name ? `${fund.amc_name} · ` : ""}{fund.transaction_count} {fund.transaction_count === 1 ? "transaction" : "transactions"}
                </span>
              </span>
              <span className="text-right text-xs text-[var(--ui-text-muted)]">
                <span className="block text-sm font-semibold text-[var(--ui-text)]">{money(fund.invested_amount)}</span>
                <span className="block">{formatDate(fund.latest_transaction_date)}</span>
              </span>
              {isOpen ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
            </button>
            {isOpen && (
              <div className="px-3 pb-3">
                <table aria-label={`Transactions in ${fund.scheme_name}`} className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[var(--ui-text-muted)]">
                      <th scope="col" className="py-1 pr-3 font-medium">Date</th>
                      <th scope="col" className="py-1 px-3 font-medium">Type</th>
                      <th scope="col" className="py-1 px-3 font-medium">Amount</th>
                      <th scope="col" className="py-1 pl-3 font-medium">Units</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fund.transactions.map((tx, index) => (
                      <tr key={`${tx.date}-${index}`}>
                        <td className="py-1 pr-3">{formatDate(tx.date)}</td>
                        <td className="py-1 px-3">{typeLabel(tx.type)}</td>
                        <td className="py-1 px-3">{money(tx.amount)}</td>
                        <td className="py-1 pl-3">{tx.units}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {showHistoryLink && fund.transaction_count > fund.transactions.length && (
                  <Link to={paths.profileImportHistory()} className="mt-2 inline-block text-xs font-semibold text-[var(--pos-text)] hover:underline">
                    View all in Import History
                  </Link>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
```

Create `features/import/importNotice.ts` exactly:
```ts
import type { ImportConfirmResponse, NewFund } from "./types";

export interface ImportNotice {
  text: string;
  details?: string[];
  newFunds?: NewFund[];
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** The notice shown on the page the person returns to. Without new funds the text is exactly what it was before. */
export function buildImportNotice(result: ImportConfirmResponse): ImportNotice {
  const newFunds = result.people.flatMap(person => person.new_funds ?? []);
  const lines = [
    ...(result.people.length > 1 ? result.people.map(p =>
      `${p.name}: ${p.added} added${p.skipped > 0 ? `, ${p.skipped} already saved` : ""}`) : []),
  ];
  if (newFunds.length === 0) {
    const details = [...lines, ...result.warnings];
    return {
      text: `${result.added} transaction${result.added === 1 ? "" : "s"} added${result.skipped > 0 ? ` · ${result.skipped} already saved` : ""}`,
      ...(details.length ? { details } : {}),
    };
  }
  const names = newFunds.slice(0, 2).map(fund => fund.scheme_name).join(", ");
  const rest = newFunds.length - 2;
  return {
    text: `Import complete · ${plural(newFunds.length, "new fund", "new funds")}, ${plural(result.added, "transaction", "transactions")} added`,
    details: [...lines, `New funds: ${names}${rest > 0 ? ` and ${rest} more` : ""}`, ...result.warnings],
    newFunds,
  };
}
```

Apply these changes exactly (unified diffs, same reading as above):

`features/import/types.ts`:
```diff
--- a/frontend/src/features/import/types.ts
+++ b/frontend/src/features/import/types.ts
@@ -109,4 +109,7 @@ export interface PersonConfirmation {
 }
 
+import type { NewFund, NewFundTx } from "@/components/mf/NewFundsList";
+export type { NewFund, NewFundTx };
+
 export interface PersonConfirmResult {
   person_key: string;
@@ -116,4 +119,8 @@ export interface PersonConfirmResult {
   added: number;
   skipped: number;
+  /** Funds this person did not hold before this import (empty for a sign-up import). */
+  new_funds?: NewFund[];
+  /** True when the person became a new household member in this confirm. */
+  created?: boolean;
 }
```

`features/import/api.ts`:
```diff
--- a/frontend/src/features/import/api.ts
+++ b/frontend/src/features/import/api.ts
@@ -8,4 +8,5 @@ import type {
   ImportConfirmResponse,
   ImportPreviewResponse,
+  NewFund,
   OpeningBalancePayload,
   OpeningBalanceResponse,
@@ -300,2 +301,13 @@ export async function cancelImportRequest(
   return (await response.json()) as CASImportStatusResponse;
 }
+
+export async function getImportNewFunds(importId: string): Promise<NewFund[]> {
+  const response = await fetch(`${API_BASE_URL}/imports/${encodeURIComponent(importId)}/new-funds`, {
+    method: "GET",
+    headers: authHeaders(),
+  });
+  if (!response.ok) {
+    throw new ApiError(response.status, (await parseErrorDetail(response)) as ParseErrorPayload | string);
+  }
+  return (await response.json()) as NewFund[];
+}
```

`features/import/useImportOrchestration.tsx`:
```diff
--- a/frontend/src/features/import/useImportOrchestration.tsx
+++ b/frontend/src/features/import/useImportOrchestration.tsx
@@ -7,4 +7,5 @@ import { useImportFlow } from "./useImportFlow";
 import { clearCasResumeStep2 } from "./casResumeState";
 import { buildConfirmBody } from "./confirmBody";
+import { buildImportNotice, type ImportNotice } from "./importNotice";
 import { UnidentifiedFundsDialog } from "./UnidentifiedFundsDialog";
 import type { ImportPreviewResponse, PersonConfirmation, PersonPreview, SchemeConfirmation } from "./types";
@@ -32,5 +33,5 @@ function otherAccountIncludes(people: PersonPreview[]): Record<string, boolean>
 export function useImportOrchestration(
   householdMemberId: string,
-  onDone?: (notice: { text: string; details?: string[] }) => void,
+  onDone?: (notice: ImportNotice) => void,
 ) {
   const flow = useImportFlow(householdMemberId);
@@ -61,13 +62,5 @@ export function useImportOrchestration(
     }
     if (!result) return;
-    const details = [
-      ...(result.people.length > 1 ? result.people.map(p =>
-        `${p.name}: ${p.added} added${p.skipped > 0 ? `, ${p.skipped} already saved` : ""}`) : []),
-      ...result.warnings,
-    ];
-    onDone?.({
-      text: `${result.added} transaction${result.added === 1 ? "" : "s"} added${result.skipped > 0 ? ` · ${result.skipped} already saved` : ""}`,
-      ...(details.length ? { details } : {}),
-    });
+    onDone?.(buildImportNotice(result));
   }, [flow.confirmResult, flow.errorCode, householdMemberId, onDone]);
```

`features/import/ImportFlow.tsx`:
```diff
--- a/frontend/src/features/import/ImportFlow.tsx
+++ b/frontend/src/features/import/ImportFlow.tsx
@@ -6,4 +6,5 @@ import { ImportError } from "./ImportError";
 import { ReviewExpiryBanner } from "./ReviewExpiryBanner";
 import { useImportOrchestration } from "./useImportOrchestration";
+import type { ImportNotice } from "./importNotice";
 import { isTestEnv } from "@/lib/motion";
 import type { UploadSurface } from "@/features/legal/panDisclaimerStore";
@@ -11,5 +12,5 @@ import type { UploadSurface } from "@/features/legal/panDisclaimerStore";
 interface ImportFlowProps {
   householdMemberId: string;
-  onDone?: (notice?: { text: string; details?: string[] }) => void;
+  onDone?: (notice?: ImportNotice) => void;
   defaultTab?: "choice" | "request" | "upload" | "history" | "waiting";
   /** Which screen the upload came from, for the PAN disclaimer record. */
```

`features/import/ImportHistoryList.tsx`:
```diff
--- a/frontend/src/features/import/ImportHistoryList.tsx
+++ b/frontend/src/features/import/ImportHistoryList.tsx
@@ -1,6 +1,7 @@
 import { useEffect, useState } from "react";
 import { Badge } from "@/components/Badge";
-import { getMemberImportHistory } from "./api";
-import type { CASImportStatusResponse } from "./types";
+import { NewFundsList } from "@/components/mf/NewFundsList";
+import { getImportNewFunds, getMemberImportHistory } from "./api";
+import type { CASImportStatusResponse, NewFund } from "./types";
 import { FileText, AlertCircle } from "lucide-react";
 
@@ -13,4 +14,19 @@ export function ImportHistoryList({ memberId }: ImportHistoryListProps) {
   const [isLoading, setIsLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
+  const [expanded, setExpanded] = useState<Set<string>>(new Set());
+  const [fundsById, setFundsById] = useState<Record<string, NewFund[] | "error">>({});
+
+  const toggleFunds = (importId: string) => {
+    setExpanded(prev => {
+      const next = new Set(prev);
+      if (next.has(importId)) next.delete(importId); else next.add(importId);
+      return next;
+    });
+    if (fundsById[importId] === undefined) {
+      getImportNewFunds(importId)
+        .then(funds => setFundsById(prev => ({ ...prev, [importId]: funds })))
+        .catch(() => setFundsById(prev => ({ ...prev, [importId]: "error" })));
+    }
+  };
 
   useEffect(() => {
@@ -83,6 +99,6 @@ export function ImportHistoryList({ memberId }: ImportHistoryListProps) {
 
         return (
+          <div key={item.import_id} className="space-y-2">
           <div
-            key={item.import_id}
             className="p-3.5 sm:p-4 rounded-xl border border-[var(--color-border)]/70 bg-[var(--color-bg)] hover:bg-[var(--color-surface)] transition-colors flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap"
           >
@@ -121,4 +137,20 @@ export function ImportHistoryList({ memberId }: ImportHistoryListProps) {
             </div>
           </div>
+          {isSuccess && (
+            <div className="pl-1">
+              <button type="button" aria-expanded={expanded.has(item.import_id)} data-clickable="" data-effect="expand"
+                onClick={() => toggleFunds(item.import_id)} className="text-xs font-semibold text-[var(--color-accent)] hover:underline">
+                {expanded.has(item.import_id) ? "Hide new funds" : "Show new funds"}
+              </button>
+              {expanded.has(item.import_id) && (() => {
+                const funds = fundsById[item.import_id];
+                if (funds === undefined) return <p className="mt-2 text-xs">Loading new funds...</p>;
+                if (funds === "error") return <p className="mt-2 text-xs">Could not load new funds.</p>;
+                if (funds.length === 0) return <p className="mt-2 text-xs">No new funds in this import.</p>;
+                return <div className="mt-2"><NewFundsList funds={funds} /></div>;
+              })()}
+            </div>
+          )}
+          </div>
         );
       })}
```

`components/mf/PostImportNotice.tsx`:
```diff
--- a/frontend/src/components/mf/PostImportNotice.tsx
+++ b/frontend/src/components/mf/PostImportNotice.tsx
@@ -1,3 +1,6 @@
+import { useState } from "react";
 import { useLocation, useNavigate } from "react-router";
+import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
+import { NewFundsList, type NewFund } from "./NewFundsList";
 import { useAuth } from "@/features/auth/AuthContext";
 
@@ -5,4 +8,5 @@ export interface PostImportNoticeContent {
   text: string;
   details?: string[];
+  newFunds?: NewFund[];
 }
 
@@ -15,4 +19,5 @@ export function PostImportNotice() {
   const location = useLocation();
   const navigate = useNavigate();
+  const [listOpen, setListOpen] = useState(false);
   const state = location.state as NoticeState;
   const notice = me && state?.importNoticeUser === me.user_id ? state.importNotice ?? null : null;
@@ -22,4 +27,15 @@ export function PostImportNotice() {
       <p>{notice.text}</p>
       {notice.details?.map((detail, index) => <p key={index}>{detail}</p>)}
+      {notice.newFunds && notice.newFunds.length > 0 && (
+        <>
+          <button type="button" onClick={() => setListOpen(true)}>View new funds</button>
+          <Dialog open={listOpen} onOpenChange={setListOpen}>
+            <DialogContent>
+              <DialogHeader><DialogTitle>New funds in this statement</DialogTitle></DialogHeader>
+              <NewFundsList funds={notice.newFunds} showHistoryLink />
+            </DialogContent>
+          </Dialog>
+        </>
+      )}
       <button
         type="button"
```

**Checkpoint B:** `test src/features/home src/features/import src/components/mf` (expect all pass), `types` (expect only the errors of packets not yet done; none in the files of this packet), `lint` (0 errors).

## 5. Tests to satisfy (committed)
Phase A: `features/home/components/AllocationDonut.test.tsx` (the new "hover, focus and selected state" block), `features/home/components/AllocationClassDialog.test.tsx`, `features/home/sections/Allocation.test.tsx` (the changed "keeps legend rows and slices as buttons" test and the new "interactive donut and the funds pop-up" block).
Phase B: `features/import/importNotice.test.ts`, `components/mf/NewFundsList.test.tsx`, `components/mf/PostImportNotice.test.tsx` ("new funds" block), `features/import/api.test.ts` ("getImportNewFunds"), `features/import/ImportHistoryList.test.tsx` ("new funds per import"), `features/import/ImportFlow.test.tsx` ("new funds in the notice").

## 6. Final checks (run all, report the real output)
```
types                      # expect: no output (if the S1 packet is done); otherwise only S1 errors
lint                       # expect: 0 errors
test src/features/home src/features/import src/components src/shell src/features/mutual-funds src/features/profile-v2 src/features/portfolio
build                      # expect: built
git status --short         # expect: exactly the 3 created and 9 edited source files of section 3 (no test, no fixture)
```
Then the full suite once: `test` with no paths. Three frontend tests fail only under load and pass alone; re-run any failure alone before reporting it.

## 7. Report (one block, from the rules file)
Add: the exact output of Step 0; the result of checkpoint A and checkpoint B; the list of files created and edited (it must match section 3); every place you deviated from this packet and why; what you could not check (you cannot see the screen: the orchestrator takes the screenshots of the Home donut idle, hovered and with the pop-up open, and of the notice with its pop-up and Import History with the list open).
