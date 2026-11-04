# Packet S4-FE for Gemini (Antigravity): Returns toggle renamed with info icons, moved into the performance card, and the Actual XIRR graph (two phases)
**Status:** READY FOR GEMINI (red tests committed on `ui-round-2`; reference solution written by the orchestrator in a scratch worktree and run green against every test below, 3 Nov 2026).
**Plan:** `Docs/orchestration/2026-11-02-ui-round-2-and-auth-redesign-implementation-plan.md`, Task 1.5 (stage S1) and Tasks 4.3 and 4.4 (stage S4). **Task 4.2 (benchmark pills) is skipped by the owner's decision of 3 Nov 2026** (Run 3 already names the benchmark in the row label and shows how it was chosen); do not build pills. Rules file: `Docs/orchestration/ui-common-rules-antigravity.md` (read it first; this packet adds to it).
**Backend:** nothing to call. The Current returns the table already loads (`GET fund-page/{id}/returns?mode=current`) feed the graph, and `benchmark_label` is already in the responses and the golden fixtures.

## What this run is, in one paragraph
Two phases in one run. **A:** the Inception | Current toggle is renamed **Model Portfolio Returns | Actual XIRR**, each name gets a small info icon with plain words, and the toggle becomes its own component. **B:** the toggle moves out of the Returns card into the performance card, above the period buttons, and drives both the graph and the Returns table; the page owns the mode and the Current request; in Actual XIRR the performance card shows a grouped bar graph (your holding against the benchmark with the same cash flows, one pair of bars per table period) with the designed not-held, loading and error states. **The existing Inception graph is not changed**: `PerformanceChart` only gains one optional slot, and its existing tests pass without edits. The tests are already written and committed and **fail now**; make them pass without editing any test. Do phase A completely (checkpoint A), then phase B (checkpoint B).

## Rules (read twice)
1. **Scope.** Create the 2 files and edit the 4 files in section 3, nothing else. Every test file and fixture is already in place: **never edit a test or a fixture to make it pass.** If a test seems wrong, stop and describe it in the report.
2. **Run the phase checkpoint after every phase** and keep its real output for the report. Fix your code, not the test. **If a checkpoint is still red after two attempts, stop and report; do not start the next phase.**
3. **No new dependency, no `npm install`, no `package.json` change.** The info icon uses `lucide-react` and the app's Radix `Tooltip`, both installed.
4. **Never run a git command that changes anything.** Read-only `git status`, `git diff`, `git log` are fine.
5. **Do not touch `backend/**`.**
6. **The Inception performance graph does not change** (lines, colours, legend, notes, period buttons). `PerformanceChart.tsx` gets exactly the one optional `toggleSlot` prop shown below and nothing else. `PerformanceChart.test.tsx` has two new tests for the slot; every older test there must pass as it is.
7. **Plain words on screen.** Exactly the strings in this packet. No em-dashes in new text (the dash in a chart label such as `3Y —` is the data-gap mark and is required). Colours only through the app tokens already in the files (`--c2`, `--c3`, `--ui-*`).
8. **Money is never added on the client.** The graph draws the response's strings parsed to numbers for display only; each bar must equal its table cell.
9. **Style.** 2-space indentation, double quotes, semicolons, no `any`, no unused imports or locals (`tsc -b` is strict), no `console.`. Do not add `oxlint-disable` comments. A file that exports a component must not also export a constant or hook.
10. **If anything differs from this packet, stop and report it.**
11. **Run every command inside WSL** through the script shown in Step 0. A test that fails with "Unable to find an element ... timed out" under load: re-run that file alone before reporting it.

## Step 0: environment check (do this first, and report the output)
Work only in the Windows clone the prompt names. Run from that folder in PowerShell:
```
git status --short                 # expect: nothing printed (run this FIRST)
git branch --show-current          # expect: ui-round-2
git log --oneline -8               # expect: the line "ui-s4: red tests and packet for the S4 frontend work (Gemini)" appears in the list (other commits may sit above it)
```
Every check goes through one command; replace `<mode and paths>`:
```
wsl.exe -d Ubuntu -- env CR6_SRC=/mnt/c/Users/Dell/<clone>/frontend CR6_DST=/home/delladiti/<clone>-chk bash /mnt/c/Users/Dell/<clone>/Docs/orchestration/cr-r6-fe-check.sh <mode and paths>
```
where `<clone>` is the folder name from the prompt, and `<mode and paths>` is `types`, `lint` or `test <paths under src/>`. Do **not** run `build` or the full suite (the orchestrator runs both at the gate), and do **not** run a test baseline: the committed tests are red on purpose (the orchestrator measured 6 failed files and 17 (of 750) failed tests in `features/individual-fund`). Run only:
```
types                      # expect: 6 error lines, all in test files: CurrentReturnsChart.test.tsx and ReturnsModeToggle.test.tsx (cannot find their modules), PerformanceChart.test.tsx (the toggleSlot prop) and ReturnsTable.test.tsx (the mode and current props, three lines); none in a source file
```
If `types` shows an error in a source file, stop and report.

## Goal
Make every test listed in section 5 pass with the behaviour in section 4, and keep the rest of the suite as it was. **Non-goals:** the benchmark pills (skipped), any new API call or response type, any change to the Inception chart, the Insights tab, mobile, the backend.

## 3. File map (all under `frontend/src/`)
**Create (2):**
- `features/individual-fund/overview/ReturnsModeToggle.tsx` (phase A)
- `features/individual-fund/overview/CurrentReturnsChart.tsx` (phase B)

**Edit (4):**
- Phase A: `features/individual-fund/components/Segmented.tsx`
- Phase B: `features/individual-fund/overview/PerformanceChart.tsx`, `features/individual-fund/overview/ReturnsTable.tsx`, `features/individual-fund/OverviewPage.tsx`

**Do not touch:** every `*.test.ts(x)` file, every fixture, `components/ui/charts/**` (the grouped bar chart already draws negative values below a baseline and a missing value as a zero-height bar; the dash in the group label marks a gap), `fundCopy.ts`, the Insights and Overlap tabs, `package.json`, anything under `backend/`.
If `git status` at the end shows a different list, stop and report.

## 4. Specifications

### Phase A: the toggle names and info icons (task 1.5)
- `SegmentedOption` gains an optional `info` text. An option with `info` shows its label button and, next to it, a separate small round info button named `About {label}` that opens the app's tooltip on hover, on focus and on click (controlled open, so it also works from the keyboard and on touch) and closes on Esc. **Clicking the info button never changes the value.** An option without `info` renders as before (the performance period buttons use `Segmented` too).
- `ReturnsModeToggle({ mode, onChange })` is the **only place** the options are defined: `Model Portfolio Returns` (value `inception`) and `Actual XIRR` (value `current`), each with the info text in the file below. The values stay `inception` and `current` because they are the API's `mode`.

Replace `features/individual-fund/components/Segmented.tsx` with the full file below (it is the diff of the old one). Create `features/individual-fund/overview/ReturnsModeToggle.tsx` exactly:
```tsx
import type { ReturnsMode } from "../types";
import { Segmented, type SegmentedOption } from "../components/Segmented";

const MODE_OPTIONS: readonly SegmentedOption<ReturnsMode>[] = [
  {
    value: "inception",
    label: "Model Portfolio Returns",
    info: "The fund's own track record, the same for every investor. It shows how the fund did against its benchmark and similar funds over each period.",
  },
  {
    value: "current",
    label: "Actual XIRR",
    info: "How your own money in this fund has done, based on when and how much you invested. It only shows if you hold the fund, and is compared with the benchmark on the same dates.",
  },
];

export interface ReturnsModeToggleProps {
  mode: ReturnsMode;
  onChange: (mode: ReturnsMode) => void;
}

/** The one place the returns basis options are defined. The values stay the API's mode names. */
export function ReturnsModeToggle({ mode, onChange }: ReturnsModeToggleProps) {
  return <Segmented label="Returns basis" options={MODE_OPTIONS} value={mode} onChange={onChange} />;
}
```

Apply this change to `features/individual-fund/components/Segmented.tsx` (unified diff; lines starting with `-` go, lines starting with `+` come in):
```diff
--- a/frontend/src/features/individual-fund/components/Segmented.tsx
+++ b/frontend/src/features/individual-fund/components/Segmented.tsx
@@ -1,5 +1,12 @@
+import { useState } from "react";
+import { Info } from "lucide-react";
+import { Portal as TooltipPortal } from "@radix-ui/react-tooltip";
+import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
+
 export interface SegmentedOption<V extends string> {
   value: V;
   label: string;
+  /** A plain-words explanation shown by a small info button next to the label. */
+  info?: string;
 }
 
@@ -11,4 +18,39 @@ export interface SegmentedProps<V extends string> {
 }
 
+// Controlled open, so the note also works from the keyboard and on touch (hover, focus and click all open it).
+function InfoButton({ label, info }: { label: string; info: string }) {
+  const [open, setOpen] = useState(false);
+  return (
+    <TooltipProvider delayDuration={0}>
+      <Tooltip open={open} onOpenChange={setOpen}>
+        <TooltipTrigger asChild>
+          <button
+            type="button"
+            aria-label={`About ${label}`}
+            aria-expanded={open}
+            data-clickable=""
+            data-effect="expand"
+            onMouseEnter={() => setOpen(true)}
+            onMouseLeave={() => setOpen(false)}
+            onFocus={() => setOpen(true)}
+            onBlur={() => setOpen(false)}
+            onClick={(event) => {
+              event.preventDefault();
+              event.stopPropagation();
+              setOpen(true);
+            }}
+            className="ml-0.5 mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
+          >
+            <Info size={12} aria-hidden="true" />
+          </button>
+        </TooltipTrigger>
+        <TooltipPortal>
+          <TooltipContent className="max-w-72">{info}</TooltipContent>
+        </TooltipPortal>
+      </Tooltip>
+    </TooltipProvider>
+  );
+}
+
 export function Segmented<V extends string>({
   label,
@@ -21,26 +63,28 @@ export function Segmented<V extends string>({
       role="group"
       aria-label={label}
-      className="inline-flex rounded-lg bg-[var(--ui-hover)] p-0.5"
+      className="inline-flex flex-wrap items-center rounded-lg bg-[var(--ui-hover)] p-0.5"
     >
       {options.map((option) => {
         const isPressed = option.value === value;
         return (
-          <button
-            key={option.value}
-            type="button"
-            aria-pressed={isPressed}
-            onClick={() => {
-              if (option.value !== value) {
-                onChange(option.value);
-              }
-            }}
-            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
-              isPressed
-                ? "bg-[var(--ui-text)] text-[var(--ui-page)] shadow-sm"
-                : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
-            }`}
-          >
-            {option.label}
-          </button>
+          <span key={option.value} className="inline-flex items-center">
+            <button
+              type="button"
+              aria-pressed={isPressed}
+              onClick={() => {
+                if (option.value !== value) {
+                  onChange(option.value);
+                }
+              }}
+              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
+                isPressed
+                  ? "bg-[var(--ui-text)] text-[var(--ui-page)] shadow-sm"
+                  : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
+              }`}
+            >
+              {option.label}
+            </button>
+            {option.info ? <InfoButton label={option.label} info={option.info} /> : null}
+          </span>
         );
       })}
```

**Checkpoint A:** `test src/features/individual-fund/components src/features/individual-fund/overview/ReturnsModeToggle.test.tsx` (expect all pass).

### Phase B: the toggle moves up, and the Actual XIRR graph (tasks 4.3 and 4.4)
- `OverviewPage` owns the mode (`inception` first) and the Current request, made once, the first time Actual XIRR is chosen (exactly the way `ReturnsTable` did it), refetched when the scope changes, and kept while the user switches back and forth.
- `PerformanceChart` gets `toggleSlot?: ReactNode`, drawn **above** the period buttons. With no slot nothing changes.
- `ReturnsTable` takes `mode` and `current` as props and no longer draws a toggle: its header keeps only the title `Returns`. Its table rendering, the not-held message and the category request stay as they were.
- In Actual XIRR the performance card is the new `CurrentReturnsChart`: the toggle slot, the heading `Performance`, a legend (`Your holding (XIRR)` and the benchmark name plus `, same cash flows`) and a grouped bar chart. **No period buttons.** One group per table period in table order (`1Y`, `3Y`, `5Y`, `Since first investment`); a period with no figure has no bar and a dash after its label (`3Y —`); negative values pass through as negative numbers. Without a benchmark: one series, one legend item and a notice (`no_benchmark` or `no_history`). Not held: a designed box (clock icon, `{member name} does not hold this fund`, or `No one in your family holds this fund` in the family view, the body text and a button `Show Model Portfolio Returns` that goes back to the first mode). Loading and error use the same section states as the rest of the page, with the toggle always visible.

Create `features/individual-fund/overview/CurrentReturnsChart.tsx` exactly:
```tsx
import type { ReactNode } from "react";
import { Clock } from "lucide-react";
import { GroupedBarChart } from "@/components/ui/charts";
import { benchmarkDisplayName } from "@/lib/benchmarkDisplay";
import { formatPercent } from "@/lib/format";
import { useScope } from "@/shell/scope/ScopeContext";
import { SectionState } from "../components/SectionState";
import { columnHeader } from "../fundCopy";
import type { CurrentReturnsResponse, ReturnsResponse } from "../types";
import type { FundSection } from "../useFundSection";

export interface CurrentReturnsChartProps {
  /** The Current returns the page already fetched for the table. */
  current: FundSection<ReturnsResponse>;
  fundName: string;
  /** The Model Portfolio Returns | Actual XIRR toggle, drawn above the legend. */
  toggleSlot: ReactNode;
  onShowModel: () => void;
}

const NO_BENCHMARK_NOTE: Record<string, string> = {
  no_benchmark: "No benchmark applies to this fund type, so only your holding is shown.",
  no_history: "Benchmark history is not available yet, so only your holding is shown.",
};

function Legend({ items }: { items: { color: string; name: string }[] }) {
  return (
    <ul aria-label="Chart legend" className="flex flex-wrap items-center gap-3 text-xs">
      {items.map((item) => (
        <li key={item.name} className="inline-flex items-center gap-1.5 px-2 py-1">
          <i aria-hidden="true" style={{ background: item.color }} className="inline-block h-2 w-2 rounded-full" />
          <span className="text-[var(--ui-text-muted)]">{item.name}</span>
        </li>
      ))}
    </ul>
  );
}

function Bars({ data, fundName }: { data: CurrentReturnsResponse; fundName: string }) {
  const bench = data.rows.benchmark_same_flows;
  const buckets = data.columns.map((col) => {
    const holding = data.rows.holding_xirr[col];
    const other = bench ? bench[col] : null;
    // The chart draws a missing value as a zero-height bar; the dash in the label says it is missing, not zero.
    const missing = holding == null && other == null;
    return {
      label: missing ? `${columnHeader(col)} —` : columnHeader(col),
      values: bench ? [holding == null ? 0 : Number(holding), other == null ? 0 : Number(other)] : [holding == null ? 0 : Number(holding)],
    };
  });
  const benchName = `${benchmarkDisplayName(data.benchmark_label || "Benchmark")}, same cash flows`;
  const note = bench === null ? NO_BENCHMARK_NOTE[data.benchmark_reason ?? ""] : null;
  return (
    <div className="space-y-4">
      <Legend items={[{ color: "var(--c2)", name: "Your holding (XIRR)" }, ...(bench ? [{ color: "var(--c3)", name: benchName }] : [])]} />
      <GroupedBarChart
        buckets={buckets}
        seriesColors={bench ? ["var(--c2)", "var(--c3)"] : ["var(--c2)"]}
        formatValue={(value) => formatPercent(String(value), { digits: 1 })}
        ariaLabel={`Actual XIRR for ${fundName}`}
        height={250}
      />
      {note && <p data-testid="current-chart-note" className="text-xs text-[var(--ui-text-muted)]">{note}</p>}
    </div>
  );
}

export function CurrentReturnsChart({ current, fundName, toggleSlot, onShowModel }: CurrentReturnsChartProps) {
  const { selectedMember } = useScope();
  const notHeld = current.status === "unavailable" && current.reason === "not_held";
  return (
    <section aria-labelledby="perf-title" className="space-y-4 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4">
      <div data-testid="perf-toggle-slot">{toggleSlot}</div>
      <h3 id="perf-title" className="text-base font-semibold text-[var(--ui-text)]">
        Performance
      </h3>
      {notHeld ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-[var(--ui-divider)] p-5">
          <Clock className="h-5 w-5 text-[var(--ui-text-muted)]" aria-hidden="true" />
          <p className="font-semibold text-[var(--ui-text)]">
            {selectedMember ? `${selectedMember.name} does not hold this fund` : "No one in your family holds this fund"}
          </p>
          <p className="text-sm text-[var(--ui-text-muted)]">
            Actual XIRR uses your own purchases of a fund. Model Portfolio Returns shows how the fund itself has done.
          </p>
          <button type="button" onClick={onShowModel} className="rounded-lg border border-[var(--ui-divider)] px-3 py-1.5 text-sm font-medium text-[var(--ui-text)] hover:bg-[var(--ui-row-hover)]">
            Show Model Portfolio Returns
          </button>
        </div>
      ) : (
        <SectionState status={current.status} label="returns" reason={current.reason} onRetry={current.retry}>
          {current.data && current.data.mode === "current" ? <Bars data={current.data} fundName={fundName} /> : null}
        </SectionState>
      )}
    </section>
  );
}
```

Apply these changes exactly (unified diffs):

`features/individual-fund/overview/PerformanceChart.tsx`:
```diff
--- a/frontend/src/features/individual-fund/overview/PerformanceChart.tsx
+++ b/frontend/src/features/individual-fund/overview/PerformanceChart.tsx
@@ -2,4 +2,5 @@ import { benchmarkChoiceDetails, benchmarkDisplayName, benchmarkKeyName, BENCHMA
 import { BenchmarkInfoNote } from "@/components/BenchmarkInfoNote";
 import { SchemeLogo } from "@/components/SchemeLogo";
+import type { ReactNode } from "react";
 import { useRef, useState } from "react";
 import { LineAreaChart } from "@/components/ui/charts";
@@ -33,7 +34,9 @@ export interface PerformanceChartProps {
   schemeId: string;
   fundName: string;
+  /** Drawn above the period buttons (the Model Portfolio Returns | Actual XIRR toggle). */
+  toggleSlot?: ReactNode;
 }
 
-export function PerformanceChart({ schemeId, fundName }: PerformanceChartProps) {
+export function PerformanceChart({ schemeId, fundName, toggleSlot }: PerformanceChartProps) {
   const [period, setPeriod] = useState<PerformancePeriod>(DEFAULT_PERIOD);
   const [hidden, setHidden] = useState<Record<"fund" | "benchmark" | "category", boolean>>({
@@ -303,4 +306,5 @@ export function PerformanceChart({ schemeId, fundName }: PerformanceChartProps)
       className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4 space-y-4"
     >
+      {toggleSlot ? <div data-testid="perf-toggle-slot">{toggleSlot}</div> : null}
       <div className="flex flex-wrap items-center justify-between gap-3">
         <h3 id="perf-title" className="text-base font-semibold text-[var(--ui-text)]">
```

`features/individual-fund/overview/ReturnsTable.tsx`:
```diff
--- a/frontend/src/features/individual-fund/overview/ReturnsTable.tsx
+++ b/frontend/src/features/individual-fund/overview/ReturnsTable.tsx
@@ -1,12 +1,10 @@
 import { benchmarkChoiceDetails, benchmarkDisplayName } from "@/lib/benchmarkDisplay";
 import { BenchmarkInfoNote } from "@/components/BenchmarkInfoNote";
-import { useState } from "react";
 import { Skeleton } from "@/components/ui/skeleton";
 import { formatPercent } from "@/lib/format";
 import { useScope } from "@/shell/scope/ScopeContext";
 import { fundPageApi } from "../api";
-import { useFundSection } from "../useFundSection";
+import { useFundSection, type FundSection } from "../useFundSection";
 import { SectionState } from "../components/SectionState";
-import { Segmented } from "../components/Segmented";
 import { columnHeader, unavailableText } from "../fundCopy";
 import { changeDirection } from "../fundFormat";
@@ -23,22 +21,12 @@ export interface ReturnsTableProps {
   scope: string;
   fundName: string;
+  /** Owned by the page: the toggle lives in the performance card and drives the graph too. */
+  mode: ReturnsMode;
+  /** The Current returns, fetched by the page when Actual XIRR is first chosen. */
+  current: FundSection<ReturnsResponse>;
 }
 
-const MODE_OPTIONS: readonly { value: ReturnsMode; label: string }[] = [
-  { value: "inception", label: "Inception" },
-  { value: "current", label: "Current" },
-];
-
-export function ReturnsTable({ schemeId, scope, fundName }: ReturnsTableProps) {
+export function ReturnsTable({ schemeId, scope, fundName, mode, current }: ReturnsTableProps) {
   const { selectedMember } = useScope();
-  const [mode, setMode] = useState<ReturnsMode>("inception");
-  const [wantCurrent, setWantCurrent] = useState(false);
-
-  const handleModeChange = (nextMode: ReturnsMode) => {
-    setMode(nextMode);
-    if (nextMode === "current") {
-      setWantCurrent(true);
-    }
-  };
 
   const inception = useFundSection<ReturnsResponse>(
@@ -47,10 +35,4 @@ export function ReturnsTable({ schemeId, scope, fundName }: ReturnsTableProps) {
   );
 
-  const current = useFundSection<ReturnsResponse>(
-    (signal) => fundPageApi.returns(schemeId, "current", scope, signal),
-    [schemeId, scope],
-    { enabled: wantCurrent }
-  );
-
   const category = useFundSection<CategoryReturnsResponse>(
     (signal) => fundPageApi.categoryReturns(schemeId, signal),
@@ -389,15 +371,7 @@ export function ReturnsTable({ schemeId, scope, fundName }: ReturnsTableProps) {
       className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4 space-y-4"
     >
-      <div className="flex flex-wrap items-center justify-between gap-3">
-        <h3 id="returns-title" className="text-base font-semibold text-[var(--ui-text)]">
-          Returns
-        </h3>
-        <Segmented
-          label="Returns basis"
-          options={MODE_OPTIONS}
-          value={mode}
-          onChange={handleModeChange}
-        />
-      </div>
+      <h3 id="returns-title" className="text-base font-semibold text-[var(--ui-text)]">
+        Returns
+      </h3>
 
       {mode === "current" &&
```

`features/individual-fund/OverviewPage.tsx`:
```diff
--- a/frontend/src/features/individual-fund/OverviewPage.tsx
+++ b/frontend/src/features/individual-fund/OverviewPage.tsx
@@ -1,2 +1,3 @@
+import { useState } from "react";
 import { useParams } from "react-router";
 import { fundPageApi } from "./api";
@@ -5,10 +6,12 @@ import { useFundPageScope, useFundSection } from "./useFundSection";
 import { FundAllocation } from "./overview/FundAllocation";
 import { InvestmentDetails } from "./overview/InvestmentDetails";
+import { CurrentReturnsChart } from "./overview/CurrentReturnsChart";
 import { PerformanceChart } from "./overview/PerformanceChart";
+import { ReturnsModeToggle } from "./overview/ReturnsModeToggle";
 import { ReturnsTable } from "./overview/ReturnsTable";
 import { RiskMetrics } from "./overview/RiskMetrics";
 import { StatBand } from "./overview/StatBand";
 import { TopHoldings } from "./overview/TopHoldings";
-import type { CompositionResponse, ScoreResponse } from "./types";
+import type { CompositionResponse, ReturnsMode, ReturnsResponse, ScoreResponse } from "./types";
 
 export function OverviewPage({ schemeId }: { schemeId: string }) {
@@ -20,4 +23,19 @@ export function OverviewPage({ schemeId }: { schemeId: string }) {
   );
 
+  // The returns basis is shared by the performance card (graph) and the Returns table. The Current request is
+  // made once, when Actual XIRR is first chosen, and read by both.
+  const [mode, setMode] = useState<ReturnsMode>("inception");
+  const [wantCurrent, setWantCurrent] = useState(false);
+  const changeMode = (next: ReturnsMode) => {
+    setMode(next);
+    if (next === "current") setWantCurrent(true);
+  };
+  const current = useFundSection<ReturnsResponse>(
+    (signal) => fundPageApi.returns(schemeId, "current", scope, signal),
+    [schemeId, scope],
+    { enabled: wantCurrent }
+  );
+  const toggle = <ReturnsModeToggle mode={mode} onChange={changeMode} />;
+
   // Fund-level composition: single request shared by Top 10 Holdings and Fund Allocation
   const composition = useFundSection<CompositionResponse>(
@@ -52,8 +70,18 @@ export function OverviewPage({ schemeId }: { schemeId: string }) {
               className="order-1 min-w-0 xl:order-none"
             >
-              <PerformanceChart
-                schemeId={schemeId}
-                fundName={ctx.summary.scheme.name}
-              />
+              {mode === "inception" ? (
+                <PerformanceChart
+                  schemeId={schemeId}
+                  fundName={ctx.summary.scheme.name}
+                  toggleSlot={toggle}
+                />
+              ) : (
+                <CurrentReturnsChart
+                  current={current}
+                  fundName={ctx.summary.scheme.name}
+                  toggleSlot={toggle}
+                  onShowModel={() => changeMode("inception")}
+                />
+              )}
             </div>
             <div
@@ -65,4 +93,6 @@ export function OverviewPage({ schemeId }: { schemeId: string }) {
                 scope={ctx.scope}
                 fundName={ctx.summary.scheme.name}
+                mode={mode}
+                current={current}
               />
             </div>
```

**Checkpoint B:** `test src/features/individual-fund` (expect all pass), then `types` (no output) and `lint` (0 errors).

## 5. Tests to satisfy (committed)
Phase A: `features/individual-fund/components/Segmented.test.tsx` (the new "info icon per option" block), `overview/ReturnsModeToggle.test.tsx`.
Phase B: `overview/PerformanceChart.test.tsx` (the new slot block), `overview/ReturnsTable.test.tsx` (the rewritten toggle, Current and not-held tests, which now pass `mode` and `current` as props), `overview/CurrentReturnsChart.test.tsx`, `OverviewPage.test.tsx` (the new "returns toggle and the Actual XIRR graph" block; its chart mock now includes `GroupedBarChart`).

## 6. Final checks (run all, report the real output)
```
types                      # expect: no output
lint                       # expect: 0 errors
test src/features/individual-fund src/features/mutual-funds src/features/analytics src/components
git status --short         # expect: exactly the 2 created and 4 edited source files of section 3 (no test, no fixture)
```
Do **not** run `build` or the full suite; the orchestrator runs them. If one test fails only under load, re-run that file alone before reporting it.

## 7. Report (one block, from the rules file)
Add: the exact output of Step 0 (the git lines and the `types` result); the result of checkpoints A and B; the list of files created and edited (it must match section 3); every place you deviated from this packet and why; what you could not check (you cannot see the screen: the orchestrator takes the screenshots of the toggle with its info icons, the performance card in both modes at 1440, 1024 and 390 wide, the Actual XIRR graph with a gap, a negative bar, one series and the not-held state).
