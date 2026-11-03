# Packet S1-FE for Gemini (Antigravity): four quick fixes (Category column, Which member? pop-up, overlap pair comparison link, Home greeting)
**Status:** READY FOR GEMINI (red tests committed on `leapswitch-redesign`; reference solution written by the orchestrator in a scratch clone and run green against every test below, 3 Nov 2026). Replaces `ui-s1-quick-fixes-fe-handoff.md` (that handoff is withdrawn; do not use it).
**Plan:** `Docs/orchestration/2026-11-02-ui-round-2-and-auth-redesign-implementation-plan.md`, Stage S1, Tasks 1.2, 1.3, 1.4 and the frontend half of 1.1. Rules file: `Docs/orchestration/ui-common-rules-antigravity.md` (read it first; this packet adds to it).

## What this run is, in one paragraph
Four small screen changes. (1) The Mutual Funds holdings table shows only the short category ("Flexi Cap Fund", not "Equity Scheme - Flexi Cap Fund"). (2) In the family view with two or more members, every **Add data** button first asks "Whose data are you adding?" in a pop-up. (3) The Top Overlapping Fund Pairs table loses its Combined Weight column and gets an "Overlap comparison" column whose "View more" link opens a page that compares those two funds. (4) The Home greeting follows the selected member; the backend part is already done and committed, the frontend only gets a test. The tests are already written and committed and **fail now**; your job is to make them pass without editing any test.

## Rules (read twice)
1. **Scope.** Create the 4 files and edit the 5 files in section 3, nothing else. Every test file and fixture is already in place: **never edit a test or a fixture to make it pass.** If a test seems wrong, stop and describe it in the report.
2. **Run the checkpoint command after every step** and keep its real output for the report. Fix your code, not the test.
3. **No new dependency, no `npm install`, no `package.json` change.**
4. **Never run a git command that changes anything.** Read-only `git status`, `git diff`, `git log` are fine.
5. **Do not touch `backend/**`.**
6. **Guards.** `features/mutual-funds` may import only `@/*`, `react-router`, `components/mf`, its own folder and `shell`/`lib`/`components` files; it must **not** import `features/individual-fund`. That is why the compare page is created in `features/individual-fund/` (section 3), not in `features/mutual-funds/`. Do not edit a guard test.
7. **Plain words on screen.** Exactly the strings in this packet. No em-dashes. No hard-coded colours (use the tokens already in the files: `var(--pos)`, `var(--ui-text)`, `var(--ui-text-muted)`, `var(--ui-divider)`, `var(--ui-card)`, `var(--pos-text)`).
8. **Keep the manager's logos.** `TopPairs.tsx` already shows `SchemeLogo` (Run 7 task 7.1). Keep it.
9. **Style.** 2-space indentation, double quotes, semicolons, no `any`, no unused imports or locals (`tsc -b` is strict), no `console.`. Do not add `oxlint-disable` comments. A file that exports a component must not also export a constant or hook (the new components export components only; `RELATIONSHIPS` and helpers stay file-private).
10. **If anything differs from this packet, stop and report it.**
11. **Run every command inside WSL** through the script shown in Step 0. A test that fails with "Unable to find an element ... timed out" or a `portedFlow.test.tsx` failure under load: re-run that file alone before reporting it.

## Step 0: environment check (do this first, and report the output)
Work only in `C:\Users\Dell\ui-r2-fe` (the folder you were opened in). Run from that folder in PowerShell:
```
git status --short                 # expect: nothing printed (run this FIRST)
git branch --show-current          # expect: leapswitch-redesign
git log --oneline -3               # expect: top line "ui-s1: packet red counts, type fix in the Home greeting test" (the red tests commit "ui-s1: red tests and packet for the S1 frontend fixes (Gemini)" is just below it)
```
Every check goes through one command; replace `<mode and paths>`:
```
wsl.exe -d Ubuntu -- env CR6_SRC=/mnt/c/Users/Dell/ui-r2-fe/frontend CR6_DST=/home/delladiti/ui-r2-fe-chk bash /mnt/c/Users/Dell/ui-r2-fe/Docs/orchestration/cr-r6-fe-check.sh <mode and paths>
```
`<mode and paths>` is `types`, `lint`, `build`, or `test <paths under src/>`. Expected before you start (these are the committed red tests):
```
types                      # expect exactly 6 error lines, all in *.test.ts(x): ComparePage.test.tsx (cannot find ./ComparePage), ComparisonState.test.tsx (the backLabel prop), categoryLabel.test.ts (cannot find ./categoryLabel), MemberPickerDialog.test.tsx (cannot find ./MemberPickerDialog), paths.test.ts twice (paths.mutualFunds.compare); none in a source file
test                       # the whole suite; expect: Test Files 9 failed | 403 passed (412); Tests 14 failed | 5313 passed | 2 skipped (5329)
```
The 9 failing files are exactly: `lib/categoryLabel.test.ts`, `shell/nav/MemberPickerDialog.test.tsx`, `features/individual-fund/ComparePage.test.tsx` (these three cannot import their module yet), `shell/nav/ImportProvider.test.tsx` (4 tests), `shell/nav/paths.test.ts` (3), `shell/registry/registry.test.ts` (1), `features/mutual-funds/overlap/TopPairs.test.tsx` (4), `features/mutual-funds/overview/HoldingsTable.test.tsx` (1), `features/individual-fund/overlap/ComparisonState.test.tsx` (1). Every failure is a missing behaviour of this packet. If you see any other failing file, stop and report it.

## Goal
Make every test listed in section 5 pass with the exact behaviour in section 4, and keep the rest of the suite as it was. **Non-goals:** any change to the individual fund page itself, the Home page, the backend, mobile screens, the Returns toggle (that is task 1.5, later), or any string you were not asked to change.

## 3. File map
**Create (4, all under `frontend/src/`):**
- `lib/categoryLabel.ts` (Step 1)
- `shell/nav/MemberPickerDialog.tsx` (Step 2)
- `features/individual-fund/ComparePage.tsx` (Step 3)
- `shell/routes/portfolio-mutual-funds-overlap-compare.route.tsx` (Step 3)

**Edit (5):**
- `features/mutual-funds/overview/HoldingsTable.tsx` (Step 1: the Category cell and one import)
- `shell/nav/ImportProvider.tsx` (Step 2)
- `shell/nav/paths.ts` (Step 3: one builder)
- `features/individual-fund/overlap/ComparisonState.tsx` (Step 3: one optional prop)
- `features/mutual-funds/overlap/TopPairs.tsx` (Step 3: remove Combined Weight, add the link column)

**Do not touch:** every `*.test.ts(x)` file, every fixture, `features/home/**` source, `shell/registry/**` (the route is found automatically), `components/ui/**`, `package.json`, anything under `backend/`.

## 4. Specifications

### Step 1: Category column (change 2)
Create `frontend/src/lib/categoryLabel.ts` exactly:
```ts
/** "Equity Scheme - Flexi Cap Fund" -> "Flexi Cap Fund": the text after the first " - ". Display only. */
export function categoryLabel(raw: string | null | undefined): string {
  const text = (raw ?? "").trim();
  if (!text) return "—";
  const at = text.indexOf(" - ");
  return at === -1 ? text : text.slice(at + 3).trim() || text;
}
```
In `HoldingsTable.tsx` add `import { categoryLabel } from "@/lib/categoryLabel";` with the other imports, and change the Category cell (`<td data-testid="category" ...>`) from `{row.sebi_category || "—"}` to `{categoryLabel(row.sebi_category)}`. Sorting and filtering keep the original value (they do not read this cell). Nothing else in the file changes.
**Checkpoint:** `test src/lib/categoryLabel.test.ts src/features/mutual-funds/overview/HoldingsTable.test.tsx`.

### Step 2: Which member? pop-up (change 7)
Create `frontend/src/shell/nav/MemberPickerDialog.tsx` exactly:
```tsx
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ScopeMember } from "../scope/scopeTypes";

export interface MemberPickerDialogProps {
  members: ScopeMember[];
  open: boolean;
  onCancel: () => void;
  onContinue: (memberId: string) => void;
}

const RELATIONSHIPS = { self: "Self", spouse: "Spouse", parent: "Parent", child: "Child", sibling: "Sibling" } as const;

function relationshipOf(member: ScopeMember): string | null {
  const relationship = member.profile?.relationship;
  if (!relationship) return null;
  if (relationship === "other") return member.profile?.relationship_other_label || "Other";
  return RELATIONSHIPS[relationship];
}

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? "").join("");

export function MemberPickerDialog({ members, open, onCancel, onContinue }: MemberPickerDialogProps) {
  const [chosen, setChosen] = useState<string | null>(null);
  useEffect(() => { if (!open) setChosen(null); }, [open]);
  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onCancel(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Whose data are you adding?</DialogTitle></DialogHeader>
        <div role="radiogroup" aria-label="Family members" className="flex flex-col gap-2">
          {members.map(member => {
            const relationship = relationshipOf(member);
            const selected = chosen === member.id;
            return (
              <button key={member.id} type="button" role="radio" aria-checked={selected} data-clickable="" data-effect="select"
                onClick={() => setChosen(member.id)}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left ${selected ? "border-[var(--pos)]" : "border-[var(--ui-divider)]"}`}>
                <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-full bg-[var(--ui-card)] text-xs font-semibold">{initials(member.name)}</span>
                <span className="text-sm font-medium text-[var(--ui-text)]">{member.name}</span>
                {relationship && <span className="text-xs text-[var(--ui-text-muted)]">{relationship}</span>}
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <button type="button" data-clickable="" data-effect="close" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm">Cancel</button>
          <button type="button" data-clickable="" data-effect="navigate" disabled={chosen === null} onClick={() => { if (chosen) onContinue(chosen); }}
            className="rounded-lg bg-[var(--pos)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Continue</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```
Edit `shell/nav/ImportProvider.tsx` (read the file first; it is 24 lines). Keep every existing line of behaviour. The changes:
1. Import `useEffect` next to `createContext, useState`, and `import { MemberPickerDialog } from "./MemberPickerDialog";` before the `paths` import.
2. Read `members` from `useScope()` too: `const { viewMode, memberId, members } = useScope();` and add `const [picking, setPicking] = useState(false);` and `useEffect(() => { setPicking(false); }, [viewMode, memberId]);` (a comment: the picker belongs to the family view; any change of view or member closes it).
3. Rename today's `openImport` body to `const go = (target?: string) => { ... }` holding **exactly** the two `navigate` calls that are there today (the replace-with-null-state call, then the push with `state: { origin: location.pathname }`), with `target` as its parameter.
4. New `openImport`:
```tsx
  const openImport = (explicitMemberId?: string) => {
    const target = explicitMemberId || (viewMode === "member" ? memberId ?? undefined : undefined);
    if (!target && viewMode === "aggregate" && members.length >= 2) { setPicking(true); return; }
    go(target);
  };
```
5. Render `<MemberPickerDialog members={members} open={picking} onCancel={() => setPicking(false)} onContinue={id => { setPicking(false); go(id); }} />` as the last child inside `ImportContext.Provider` (after `ImportHeaderContext.Provider`).
**Checkpoint:** `test src/shell/nav src/shell/routes src/shell/layout` and `test src/features/mutual-funds src/features/home src/features/portfolio src/features/planning src/features/profile-v2` (these contain every screen that calls `openImport`; all existing tests must still pass).

### Step 3: Overlap pairs link to the two-fund comparison (change 4)
`paths.ts`: add one builder inside `mutualFunds`, after `overlap`: `compare: (fundA: string, fundB: string) => `${mutualFunds}/overlap/compare/${encodeURIComponent(fundA)}/${encodeURIComponent(fundB)}`,`.

`ComparisonState.tsx`: add `backLabel?: string;` to `ComparisonStateProps`, destructure `backLabel` in the function parameters, and change the Back button text from the template string to `{backLabel ?? `Back to ${ctx.summary.scheme.name}'s overlap`}`. The default text is unchanged. Nothing else.

Create `features/individual-fund/ComparePage.tsx` exactly:
```tsx
import { useParams } from "react-router";
import { paths } from "@/shell/nav/paths";
import { useAppNavigate } from "@/shell/nav/useAppNavigate";
import { FundPageFrame } from "./FundPageFrame";
import { ComparisonState } from "./overlap/ComparisonState";

export function ComparePage({ fundA, fundB }: { fundA: string; fundB: string }) {
  const navigate = useAppNavigate();
  return (
    <FundPageFrame schemeId={fundA} tab="overlap">
      {(ctx) => (
        <ComparisonState
          key={`${ctx.schemeId}:${fundB}:${ctx.scope}`}
          ctx={ctx}
          otherSchemeId={fundB}
          backLabel="Back to Overlap"
          onBack={() => void navigate(paths.mutualFunds.overlap())}
        />
      )}
    </FundPageFrame>
  );
}

export default function CompareRoute() {
  const { fundA, fundB } = useParams();
  return <ComparePage fundA={fundA ?? ""} fundB={fundB ?? ""} />;
}
```
Create `shell/routes/portfolio-mutual-funds-overlap-compare.route.tsx` exactly:
```tsx
import { ChartPie } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "portfolio-mutual-funds-overlap-compare",
  path: "/portfolio/mutual-funds/overlap/compare/:fundA/:fundB",
  label: "Fund comparison",
  icon: ChartPie,
  section: null,
  order: 0,
  parentId: "portfolio-mutual-funds",
  layout: "app",
  scope: "family-or-member",
  status: "live",
  title: "Fund comparison",
  page: () => import("../../features/individual-fund/ComparePage"),
};

export default route;
```
`TopPairs.tsx` (keep the logos and everything not named here):
1. Add `import { Link } from "react-router";` and `import { paths } from "../../../shell/nav/paths";` with the other imports. Remove `combinedWeight` from the import list from `./overlapLogic`. **Do not delete `combinedWeight` from `overlapLogic.ts`** (a test pins that it is still exported, and `buildOverlapInsights` uses it).
2. Header: change the last column's text from `Combined Weight` to `Overlap comparison` (same `<th>` classes).
3. Delete the line `const cw = combinedWeight(pair, data.total_portfolio_value);`.
4. Replace the last `<td data-testid={`pair-combined-${key}`} ...>` cell by:
```tsx
                          <td className="py-3 pl-3 pr-2 text-xs">
                            <Link
                              to={paths.mutualFunds.compare(pair.fund_a.scheme_id, pair.fund_b.scheme_id)}
                              aria-label={`View more: ${pair.fund_a.scheme_name} and ${pair.fund_b.scheme_name}`}
                              className="font-semibold text-[var(--pos-text)] hover:underline"
                            >
                              View more <span aria-hidden="true">→</span>
                            </Link>
                          </td>
```
If `formatPercent` becomes unused in the file, remove its import (it is still used for the overlap percentage, so it should stay).
**Checkpoint:** `test src/shell/nav/paths.test.ts src/shell/registry src/features/mutual-funds/overlap src/features/individual-fund`.

### Step 4: Home greeting (change 1, frontend half)
No source edit is expected: the Home page already re-requests the summary when the member changes, and the test `greeting heading changes when the selected member changes` in `features/home/HomePage.test.tsx` is already written. Run it. **If it fails**, report the failure and what you found; do not edit anything under `features/home` without saying so first.
**Checkpoint:** `test src/features/home`.

## 5. Tests to satisfy (committed)
`lib/categoryLabel.test.ts`; `features/mutual-funds/overview/HoldingsTable.test.tsx` ("Category column"); `shell/nav/MemberPickerDialog.test.tsx`; `shell/nav/ImportProvider.test.tsx` ("Which member? pop-up", 8 tests); `shell/nav/paths.test.ts` (the compare cases); `shell/registry/registry.test.ts` (the route id and path); `features/mutual-funds/overlap/TopPairs.test.tsx` and `TopPairs.asks.test.tsx` (new column, links, no Combined Weight); `features/individual-fund/ComparePage.test.tsx`; `features/individual-fund/overlap/ComparisonState.test.tsx` (`backLabel`); `features/home/HomePage.test.tsx` ("greeting follows the selected member").

## 6. Final checks (run all, report the real output)
```
types                      # expect: no output
lint                       # expect: 0 errors; the one existing warning in src/components/mf/C... is not yours
test src/lib src/shell src/features/mutual-funds src/features/individual-fund src/features/home src/features/portfolio src/features/planning src/features/profile-v2 src/components
build                      # expect: built
git status --short         # expect: exactly the 4 created and 5 edited source files of section 3 (no test, no fixture)
```
Then the full suite once: `test` with no paths. Three frontend tests fail only under load and pass alone; re-run any failure alone before reporting it.

## 7. Report (one block, from the rules file)
Add: the exact output of Step 0; per step the checkpoint result; the list of files created and edited (it must match section 3); every place you deviated from this packet and why; what you could not check (you cannot see the screen: the orchestrator takes the screenshots of the holdings Category column, the pop-up, the pair table with the new column, and the compare page).
