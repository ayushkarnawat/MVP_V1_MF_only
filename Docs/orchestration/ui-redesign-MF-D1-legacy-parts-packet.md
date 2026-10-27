# Packet MF-D1 for Gemini (Antigravity): Mutual Funds, the legacy parts wired back into the Overview tab (Compare Distributors, sold funds, coverage-gap banner and opening balance, Fund Details popup, post-import notice)
**Status:** READY FOR GEMINI once the orchestrator has pushed or shown you the committed tests (written 27 Oct 2026). **Worker:** Gemini in Antigravity (Flash, high). **Orchestrator and verifier:** Claude Code. **Branch and folder:** `feat/mf-frontend`, in the git worktree `/home/ayush/wt/mf-fe` on WSL (open it in Antigravity as `W:\home\ayush\wt\mf-fe`). The branch is the green MF-C commit `a78b6df2` plus one commit: the red-test commit `44a0d560` (message starts `test(mutual-funds): failing tests for the wired legacy parts (MF-D1)`). This packet is **stacked on MF-C** (and on the move commit `eab59d22`, which put the legacy parts into `frontend/src/components/mf/`). Never touch another worktree.
**Parent documents:** register C121 (the legacy parts were moved into `components/` so the feature may import them); `Docs/superpowers/plans/2026-10-24-mutual-funds-frontend-plan.md` task 4 (Overview, where the plan lists "Compare Distributors", "Export" and the row click); the Overview mockup `Docs/orchestration/2026-10-23-mutual-funds-overview-mockup.html` (the Compare Distributors button and popup, the "interim FundDetailModal" row click, the Round 5 and 6 notes); `2026-10-23-mutual-funds-page-design.md` (Q9 PDF export removed from the UI, Q12 the Fund Details popup is the interim row target) and `2026-10-23-mutual-funds-page-decisions.html` (Q9, Q12). **Backend contract:** nothing new. Every part calls the routes it already called in the old Dashboard (`GET /household-members/{id}/coverage-gaps`, `POST /folios/{id}/opening-balance`, the two `distributor-comparison` routes, `GET .../nav-history`), and the feature's own `useMfDashboard` already loads holdings, realised summary and coverage gaps. **This packet is the whole truth for this run: where the plan, a mockup and this packet differ, this packet wins** (section 6 lists every difference and why). Method: `Docs/orchestration/2026-10-26-execution-plan-v2.md` sections 2 to 4, the same as packets MF-A, MF-B and MF-C.

## What this run is, in one paragraph
The tests are **already written and committed red** (three new test files, three edited ones, and one edit to the interactivity helper `testing.tsx`). Write **three new implementation files and make two small edits** so that they pass, one step at a time, running the checkpoint command after every step and keeping the real output. Do not change any test, `types.ts`, `fixtures/` or `testing.tsx`. The result: on the **Overview tab** (`/portfolio/mutual-funds`) a row click or fund-name click opens the old **Fund Details popup** (the Individual Fund page is not touched and is not opened); the holdings card header has a **Compare Distributors** button (left of "Analyse with Mira") that opens the old distributor popup; the fully sold funds list sits under the holdings card; a member view shows the **coverage-gap banner** at the top with the **opening-balance dialog** behind its Resolve Gap button; and the **post-import notice** ("N transactions added") shows above the page after an import. There is **no Export button** (section 6). The old Dashboard, History and Analytics screens stay in the repository untouched.

## Rules (read twice)
1. **Scope.** Create **only** the three files in section 3 and edit **only** the two files named there. Everything else (tests, `types.ts`, fixtures, `testing.tsx`, `package.json`, every route file, the shell, Home and Portfolio files, the old Dashboard, History and Analytics screens, the Individual Fund route and anything fund-page related, the other Mutual Funds tabs, and **every other file in `components/mf/`**, which you import but never edit) is out of bounds. Do **not** build the per-fund Overlap tab.
2. **Never edit a test to make it pass.** If a test seems wrong, stop and describe it in the report (the orchestrator validated every test against a working solution and checked it with deliberate breaks).
3. **Run the checkpoint command after every step** and keep its real output for the report; fix your code, not the test.
4. **No new dependency, no `npm install`.**
5. **No float formatting of money or percentages.** Never write `parseFloat`, `toFixed` or `Intl` in any Mutual Funds source file, **comments included** (a guard test greps whole file text), and no `console.`. (The files below need none of them.)
6. **No hard-coded colours in the feature's files** (no `#` followed by 3 to 8 hex digits, no `rgb(`/`rgba(`/`hsl(`, comments included): the two feature files you write use no colour at all. The new `PostImportNotice.tsx` lives in `components/`, outside that guard, and copies the old notice's classes exactly as written in Step 1 (they use `--color-accent`).
7. **Do not import another feature.** The Mutual Funds feature may import only `@/lib/*`, `@/components/*` (this includes `@/components/mf/*`), `@/shell/*`, `features/auth/session` and its own folder. **Nothing from `features/dashboard`, `features/import`, `features/auth/AuthContext` or any other feature**, relative or through `@/features/...`. That is why the post-import notice is a component in `components/mf/` (it needs the signed-in user, which only `AuthContext` gives): the legacy parts themselves call the old API modules; the feature never does.
8. **Exact strings.** Every visible string, accessible name, test id and attribute in section 4 must be used exactly as written.
9. **Mark every control the feature owns.** Every `button` you add to the feature (only the Compare Distributors button) carries `data-clickable` and `data-effect="open"`. The legacy parts keep their own markup and are **not** edited to carry the markers: each is mounted inside a wrapper `<div data-legacy="..." className="contents">` (the tests check the attribute and the class), and the interactivity helper skips everything inside a `data-legacy` element. A guard counts `data-clickable` against `<button` in every feature file.
10. **Do not refactor, rename or "improve" anything outside the file map.** 2-space indentation, double quotes, semicolons, `@/` or relative imports for project code (no `any`, no unused locals or imports: `tsc -b` is strict; the page no longer needs `useNavigate` or `paths`, so remove those two imports).
11. **Lint.** `oxlint` warns when a file exports a component and also a constant or a hook. `legacyLogic.ts` exports functions only; component files export components and `interface`/`type` declarations only. Do not add `oxlint-disable` comments.
12. **If anything differs from this packet, stop and report it.**
13. **Run every command inside WSL** (Step 0). If tests time out under load, add `--maxWorkers=4` and never run two `vitest` or `tsc` commands at the same time.

## Step 0: environment check (do this first, and report the output)
The folder is opened as `W:\home\ayush\wt\mf-fe`; **every command (`git`, `npm`, `npx`, `grep`, `cd`) runs inside WSL**: `wsl.exe -d Ubuntu --cd /home/ayush/wt/mf-fe -- <command>` for git, `wsl.exe -d Ubuntu --cd /home/ayush/wt/mf-fe/frontend -- <command>` for npm/npx; a command containing `|` is run as `... -- bash -c "<command>"`.
Run and report the output of each:
```
git branch --show-current          # expect: feat/mf-frontend
git log --oneline -3               # expect the top line to start with: test(mutual-funds): failing tests for the wired legacy parts (MF-D1)
git status --short                 # expect: nothing printed
cd frontend && npx tsc -b          # expect exactly three error lines, all TS2307 "Cannot find module" in test files: './PostImportNotice', './CoverageGapGate', './legacyLogic'; nothing else
npx vitest run src/features/mutual-funds --maxWorkers=4   # expect: Test Files 5 failed | 44 passed (49); Tests 21 failed | 831 passed (852) (red state: the 2 new feature test files fail to import their module; the 21 failing tests are 2 in guards.test.ts, 5 in HoldingsTable.test.tsx and 14 in OverviewPage.test.tsx)
npx vitest run src/components/mf/PostImportNotice.test.tsx   # expect: Test Files 1 failed (the module is missing)
npx vitest run src/shell src/App.test.tsx --maxWorkers=4   # expect: Test Files 27 passed (27); Tests 348 passed (348)
npx vitest run src/components/ui/charts src/lib src/styles   # expect: Test Files 16 passed, Tests 188 passed
```
Note on the feature line: the five failed files are `guards.test.ts`, `HoldingsTable.test.tsx`, `OverviewPage.test.tsx` and the two new feature files `CoverageGapGate.test.tsx` and `legacyLogic.test.ts` (which fail to import and count no tests).
State which way you run commands and whether you can edit files. If any expectation fails, **stop and report**.

## Goal
From the signed-off Overview mockup and the old Dashboard's behaviour, on the Overview tab only: (1) **Compare Distributors** in the holdings card header; (2) **Fund Details popup** from a row or a fund name; (3) **sold funds** list under the holdings card; (4) **coverage-gap banner** (member view) and **opening-balance dialog**, with the page reloading after a save; (5) **post-import notice**. All five work for the family view and for one member (except the gap banner, member view only) and are mounted without disturbing the page's layout when they have nothing to show.
**Non-goals:** the Export button (not built, section 6); the Overlap tab of an individual fund and everything on the Individual Fund page; the Holdings, Allocation, Transactions, Performance, Overlap and Other Analytics tabs; restyling any legacy part to the new tokens or to the mockup's re-skinned distributor popup; editing anything in `components/mf/` other than adding the one new file; History redirect and the whole-page parity pass (MF-D2).

## 3. File map
**Create (3):**
- `frontend/src/components/mf/PostImportNotice.tsx`
- `frontend/src/features/mutual-funds/overview/legacyLogic.ts`
- `frontend/src/features/mutual-funds/overview/CoverageGapGate.tsx`

**Edit (2, nothing else in these files):**
- `frontend/src/features/mutual-funds/overview/HoldingsTable.tsx` (Step 4)
- `frontend/src/features/mutual-funds/overview/OverviewPage.tsx` (Step 5)

**Do not touch:** every `*.test.ts(x)` file, `types.ts`, `fixtures/`, `testing.tsx` (all in the Mutual Funds folder), `package.json`, `package-lock.json`, `src/index.css`, `src/lib/**`, every other file in `src/components/**` (including the eleven legacy parts already in `components/mf/`), `src/shell/**` (no route file changes in this run), `src/features/**` outside the Mutual Funds folder, anything under `backend/` or `Docs/`.
**Tests to satisfy (committed; read each before its step):** `components/mf/PostImportNotice.test.tsx` (7), `overview/legacyLogic.test.ts` (7), `overview/CoverageGapGate.test.tsx` (9), `overview/HoldingsTable.test.tsx` (23, five of them new or changed), `overview/OverviewPage.test.tsx` (34, one replaced and seventeen new in the last `describe`), `guards.test.ts` (10, two new or changed: the file list now has 53 files, and a legacy-wrapper guard). Read the fixtures (`fixtures/index.ts`: `holdings()`, `aggregateHoldings()` with its one fully sold "Old Fund", `memberHoldings()`, `coverageGaps()`) and `testing.tsx` first.
**Already in the folder and yours to use (do not edit):** `data/useMfDashboard.ts` (`useMfDashboard()` returns `holdings`, `allocation`, `sips`, `xirr`, `realized`, `members`, `coverageGaps`, `history`, each a `Load<T> = { status: "loading" | "data" | "error"; data: T | null; retry: () => void }`; `coverageGaps` resolves to `[]` in the family view without a request), `data/analyticsStore.ts` (`useMfAnalytics("benchmark_funds")` returns `retry`, which asks the server to recompute and reloads), `frame/MutualFundsFrame.tsx`, `types.ts` (`HoldingRow`, `CoverageGapItem`, `Load`).
**Available to import from outside the folder (already moved into `components/mf/`, never edit):** `@/components/mf/CoverageGapBanner` (`CoverageGapBanner({ gaps, onResolveGap })`, an `role="alert"` banner with a "Resolve Gap" button; renders nothing for an empty list), `OpeningBalanceModal` (`{ isOpen, gap, onClose, onResolved }`, title "Set Opening Balance"; its fields fill from `gap` **once, when it mounts**; it calls `onResolved()` then `onClose()` after a successful save and shows the server's error text inside itself on a failure), `SoldFundsSection` (`{ summary: RealizedSummary | null | undefined; memberId?: string }`, a collapsed "Sold funds (N)" section, empty when no fund is fully sold), `FundDetailModal` (`{ isOpen, onClose, holding: HoldingRow | null }`, title "Fund Details"), `DistributorComparisonModal` (`{ isOpen, onClose, viewMode, memberId }`, title "Distributor Comparison", loads when it opens). The feature imports them with relative paths (`../../../components/mf/...`) like the other `components` imports in the folder.

## 4. Specifications
Visual language: the legacy parts keep their own look (they use the old `--color-*` tokens); only the structure, text, test ids and attributes below are checked.

### Step 1: `components/mf/PostImportNotice.tsx` (post-import notice)
The import flow (`ImportWrapper`) leaves `{ importNotice, importNoticeUser }` in the router location state when it sends the user back to the Overview (`importDoneTarget` returns the Overview). The old Dashboard showed it; the new Overview did not (MF-A note (a)). Create exactly:
```tsx
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "@/features/auth/AuthContext";

export interface PostImportNoticeContent {
  text: string;
  details?: string[];
}

type NoticeState = { importNotice?: PostImportNoticeContent | null; importNoticeUser?: string | null } | null;

/** The "N transactions added" notice the import flow leaves in the history state. The state outlives a logout in
 * the same tab, so the notice carries the user it was written for and is shown only to that user (register C29). */
export function PostImportNotice() {
  const { me } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as NoticeState;
  const notice = me && state?.importNoticeUser === me.user_id ? state.importNotice ?? null : null;
  if (!notice) return null;
  return (
    <div role="status" className="mb-4 rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 p-3 text-sm">
      <p>{notice.text}</p>
      {notice.details?.map((detail, index) => <p key={index}>{detail}</p>)}
      <button
        type="button"
        aria-label="Dismiss import notice"
        onClick={() => { void navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true, state: null }); }}
      >
        Dismiss
      </button>
    </div>
  );
}
```
Behaviour the tests check: shown only when `importNoticeUser` equals the signed-in user's `user_id`; nothing for another user, an unattributed notice, an unknown user (`me` null), a `null` notice, an empty state or no state; Dismiss keeps the path, query and hash and clears the state to `null`.
**Checkpoint 1:** `npx vitest run src/components/mf/PostImportNotice.test.tsx` → expect **Test Files 1 passed, Tests 7 passed**.

### Step 2: `overview/legacyLogic.ts` (two pure helpers)
Create exactly:
```ts
import type { HoldingRow } from "../types";

/** The row a click on the table meant. The key is the fund AND the member: two members can hold the same fund
 * with different units and values, and the popup must show the clicked row's own figures. */
export function findHolding(rows: HoldingRow[] | null, schemeId: string, memberId: string): HoldingRow | null {
  if (rows === null) return null;
  return rows.find(row => row.scheme_id === schemeId && row.household_member_id === memberId) ?? null;
}

/** The member the sold-funds list is narrowed to: the selected member in a member view, nobody in the family view. */
export function soldFundsScope(viewMode: "aggregate" | "member", memberId: string | null): string | undefined {
  return viewMode === "member" && memberId ? memberId : undefined;
}
```
**Checkpoint 2:** `npx vitest run src/features/mutual-funds/overview/legacyLogic.test.ts` → expect **Test Files 1 passed, Tests 7 passed**.

### Step 3: `overview/CoverageGapGate.tsx` (banner plus the opening-balance dialog it opens)
Create exactly:
```tsx
import { useState } from "react";
import { CoverageGapBanner } from "../../../components/mf/CoverageGapBanner";
import { OpeningBalanceModal } from "../../../components/mf/OpeningBalanceModal";
import type { CoverageGapItem, Load } from "../types";

export interface CoverageGapGateProps {
  gaps: Load<CoverageGapItem[]>;
  onResolved: () => void;
}

/** The coverage-gap banner and the opening-balance dialog it opens. Both keep the old Dashboard's markup, so the
 * wrapper carries data-legacy (the interactivity scan skips it) and `contents` (an empty gate leaves no gap). */
export function CoverageGapGate({ gaps, onResolved }: CoverageGapGateProps) {
  const [selected, setSelected] = useState<CoverageGapItem | null>(null);
  const list = gaps.status === "data" && gaps.data !== null ? gaps.data : [];
  return (
    <div data-testid="coverage-gap-gate" data-legacy="coverage-gap" className="contents">
      <CoverageGapBanner gaps={list} onResolveGap={setSelected} />
      {/* Mounted only while a gap is picked: the dialog fills its fields from the gap once, when it mounts. */}
      {selected && (
        <OpeningBalanceModal
          key={selected.folio_id}
          isOpen
          gap={selected}
          onClose={() => setSelected(null)}
          onResolved={onResolved}
        />
      )}
    </div>
  );
}
```
Why the dialog is mounted only while a gap is picked: the legacy dialog reads `gap` into its fields once, on first render; the old Dashboard kept it mounted with `gap` null, so its fields never filled. Mounting it per gap fills "Opening Units" and "Effective Date" from the gap. While loading, after a failure and for an empty list nothing is shown (the banner is advisory, as in the old Dashboard).
**Checkpoint 3:** `npx vitest run src/features/mutual-funds/overview/CoverageGapGate.test.tsx` → expect **Test Files 1 passed, Tests 9 passed**.

### Step 4: edit `overview/HoldingsTable.tsx`
Make exactly these changes and nothing else:
1. Props: `onOpenFund: (schemeId: string, memberId: string) => void;` (was one argument), and add `onCompareDistributors: () => void;` as the last prop. Destructure `onCompareDistributors` in the function signature after `onAnalyse`.
2. Every call `onOpenFund(row.scheme_id)` becomes `onOpenFund(row.scheme_id, row.household_member_id)` (three places: the row `onClick`, the row `onKeyDown` Enter branch and the name button).
3. The row `<tr>` and the name `<button>` change `data-effect="navigate"` to `data-effect="open"` (they open a popup now).
4. In the header, wrap the existing "Analyse with Mira" button in `<div className="flex flex-wrap items-center gap-2">` and put **before** it a second button of the same classes: `<button type="button" data-clickable="" data-effect="open" onClick={onCompareDistributors} className="(the same classes as the Analyse with Mira button)">Compare Distributors</button>`. No Export button, no icon.
**Checkpoint 4:** `npx vitest run src/features/mutual-funds/overview/HoldingsTable.test.tsx` → expect **Test Files 1 passed, Tests 23 passed**.

### Step 5: edit `overview/OverviewPage.tsx`
Make exactly these changes and nothing else (the existing sort, search, Mira, empty and error behaviour stay):
1. Imports: remove `useNavigate` (keep `useSearchParams`) and remove the `paths` import. Add, in this order after the `react-router` import: `DistributorComparisonModal`, `FundDetailModal`, `PostImportNotice` and `SoldFundsSection`, each as a named import from `../../../components/mf/<Name>`. Add `import type { HoldingRow } from "../types";` (after the `../mfCopy` import), `import { CoverageGapGate } from "./CoverageGapGate";` and `import { findHolding, soldFundsScope } from "./legacyLogic";`.
2. In `OverviewBody`, remove `const navigate = useNavigate();` and, after `useSearchParams`, add (with the comment):
```tsx
  // Row click opens the old Fund Details popup (Q12, the mockup's interim target) until the Individual Fund page ships.
  const [openRow, setOpenRow] = useState<HoldingRow | null>(null);
  const [distributorsOpen, setDistributorsOpen] = useState(false);
```
3. After the `xirrByScheme` memo and **before** the first early return (`// Case 1`), add:
```tsx
  // An opening balance changes the holdings, the XIRR, the allocation and the stored analytics, so all of them reload.
  const refreshAfterOpeningBalance = () => {
    dash.holdings.retry();
    dash.allocation.retry();
    dash.coverageGaps.retry();
    dash.history.retry();
    bench.retry();
  };
```
4. In the normal content (`Case 3`), the first child of the column `<div className="flex flex-col gap-[18px]">` becomes `<CoverageGapGate gaps={dash.coverageGaps} onResolved={refreshAfterOpeningBalance} />` (before `<SummaryStrip`).
5. On `<HoldingsTable`: replace `onOpenFund={id => navigate(paths.mutualFunds.fund(id))}` with `onOpenFund={(schemeId, rowMemberId) => setOpenRow(findHolding(dash.holdings.data, schemeId, rowMemberId))}` and add `onCompareDistributors={() => setDistributorsOpen(true)}`.
6. Directly after `<HoldingsTable ... />` (before the three-card grid) add:
```tsx
      <div data-legacy="sold-funds" className="contents">
        <SoldFundsSection summary={dash.realized.data} memberId={soldFundsScope(viewMode, memberId)} />
      </div>
```
7. After the three-card grid (last child of the column) add:
```tsx
      <div data-legacy="dialogs" className="contents">
        <FundDetailModal isOpen={openRow !== null} onClose={() => setOpenRow(null)} holding={openRow} />
        <DistributorComparisonModal
          isOpen={distributorsOpen}
          onClose={() => setDistributorsOpen(false)}
          viewMode={viewMode}
          memberId={memberId}
        />
      </div>
```
8. In `OverviewPage` (the default export), inside `<MutualFundsFrame ...>` and **before** `<OverviewBody query={query} />` add `<div data-legacy="import-notice" className="contents"><PostImportNotice /></div>` (on separate lines as the other wrappers). It sits outside `OverviewBody` on purpose: the notice shows in every state (content, empty, page error).
Resulting top-to-bottom order of the Overview in a member view with everything present: notice, coverage-gap banner, summary strip, SIPs, holdings card, sold funds, the three cards; the two dialogs render only when open.
**Checkpoint 5:** `npx vitest run src/features/mutual-funds/overview/OverviewPage.test.tsx` → expect **Test Files 1 passed, Tests 34 passed**. With all five steps done: `npx vitest run src/features/mutual-funds/overview` → expect **Test Files 7 passed, Tests 122 passed**.

### Step 6: the guard test
`npx vitest run src/features/mutual-funds/guards.test.ts` → expect **Test Files 1 passed, Tests 10 passed** (it needs all three new files and the `data-legacy` text in `CoverageGapGate.tsx` and `OverviewPage.tsx`).

### Step 7: final checks (from `frontend/`, in this order; paste every output)
```
npx tsc -b                                          # expect: no output
npx oxlint src/features/mutual-funds src/components/mf/PostImportNotice.tsx   # expect: exit code 0, no warning (running oxlint on the whole of src/components/mf shows one old warning in CoverageBanner.tsx: not yours, do not touch it)
npx vitest run src/features/mutual-funds --maxWorkers=4   # expect: Test Files 49 passed, Tests 868 passed
npx vitest run src/components/mf --maxWorkers=4           # expect: Test Files 9 passed, Tests 48 passed
npx vitest run src/shell src/App.test.tsx --maxWorkers=4  # expect: Test Files 27 passed, Tests 348 passed
npx vitest run src/components/ui/charts src/lib src/styles   # expect: Test Files 16 passed, Tests 188 passed
npm run build                                       # expect: "built in" with no error (a chunk-size warning is normal)
cd .. && git status --short -uall                   # expect: " M" for HoldingsTable.tsx and OverviewPage.tsx, "??" for the three new files, nothing else
```
**Do not commit and do not push.** The orchestrator verifies and commits.

## Stop conditions
Stop and report if: Step 0 does not match; a checkpoint still fails after two honest attempts; a test appears to contradict this packet; you would need to edit a file outside section 3 (above all anything in `components/mf/` other than creating `PostImportNotice.tsx`, a route file, `testing.tsx` or a fixture); a command needs `npm install`; you are tempted to import `features/dashboard`, `features/import` or `features/auth/AuthContext` into the feature, to add an Export button, or to open the Individual Fund page from a row.

## 5. Report (fill in at the end, in one fenced block, with the real command outputs)
```
GEMINI REPORT — ui-redesign — MF-D1 (legacy parts wired into the Overview)
Model and tool:    Date/time:
0. ENVIRONMENT: WSL terminal or wsl.exe prefix? Could you edit files? Step 0 outputs (all eight):
1. FILES CREATED AND EDITED (exact paths):
2. CHECKPOINTS: for each of 1 to 6, the command and the last lines of its output (passed counts):
3. FINAL CHECKS (step 7), full outputs:
4. ANYTHING THAT DIFFERED FROM THE PACKET, and what you did:
5. TESTS THAT SEEMED WRONG (if any), with the exact failing assertion:
6. THINGS YOU COULD NOT DO OR VERIFY:
7. CONFIRMATIONS: tests untouched (including the three edited ones): yes/no; types.ts, fixtures and testing.tsx untouched: yes/no; files outside the file map untouched: yes/no; nothing in components/mf edited except the one new file: yes/no; nothing imported from another feature: yes/no; no Export button added: yes/no; no npm install: yes/no; no route file touched: yes/no; nothing committed: yes/no
```

## 6. Spec conflicts, defaults and backend asks (not for Gemini; for the orchestrator and the register)
**Conflicts found and how this packet resolves them (precedence: mockup, register and owner decisions, design docs, plan):**
- **Row click: Fund Details popup or Individual Fund page.** The Overview mockup (foot note and the interactions table) and page design Q12 say the row opens today's `FundDetailModal` as an interim target; the plan's task 4 says an owner decision of 24 Oct sends a fund name or row to the Individual Fund page, and MF-A built the navigation (and a test). The Individual Fund route is still a placeholder page, and this task asks for the old popup. Default: the popup (mockup wins); the swap back to navigation is two lines in `OverviewPage.tsx` plus the `data-effect`. The old "opens the fund's page from a row" test was replaced.
- **Export.** The mockup draws an "Export" pill next to "Analyse with Mira" with no behaviour; plan task 4 says `"Export" per mockup`; owner decision Q9 removed every PDF export control from the new pages, there is no holdings export route in the backend (the only export routes are `POST /analytics/export/pdf` and `GET /analytics/export/payload/{token}`), and a dead button would break the "every element is clickable or has a tooltip" rule. Default: **no Export button**; tests assert there is none on the card or the page. Backend ask 1.
- **Compare Distributors look.** The mockup draws a re-skinned popup (title "Compare Distributors", Direct plan row plus ARN rows, expand per scheme); the legacy popup is titled "Distributor Comparison" with a different table. Default: the legacy popup unchanged (C121 moved it with behaviour unchanged); the button label is the mockup's. A re-skin is a later request, not part of this packet.
- **Legacy tokens.** The legacy parts use the old `--color-*` tokens, the feature uses `--ui-*`. Left as is (no restyling); visual check in light and dark is part of the MF-D2 parity pass.
- **Post-import notice.** The feature may not import `AuthContext`; the notice needs the signed-in user. Default: a new component `components/mf/PostImportNotice.tsx` (the only new file outside the feature), the old Dashboard's markup and user check copied exactly. The old Dashboard keeps its own inline copy (not edited).
**Defaults taken, needing register entries (numbered here for the entry; C-numbers assigned by the orchestrator):**
1. Row click and fund-name click open the old Fund Details popup, not the Individual Fund page (the fund route is a placeholder); rows and names are `data-effect="open"`; `onOpenFund` now also carries the member id, so two members holding one fund open their own figures.
2. Compare Distributors: a button in the holdings card header, left of Analyse with Mira (mockup order), opening the unchanged legacy popup scoped like the page; the popup loads only when opened.
3. No Export button anywhere (Q9, no endpoint, mockup pill inert).
4. Sold funds: the legacy collapsed list directly under the holdings card; narrowed to the selected member in a member view; absent when nothing is fully sold.
5. Coverage-gap banner: top of the Overview content, member view only (the family view has no gap route); Resolve Gap opens the dialog for the first gap.
6. The opening-balance dialog is mounted per gap so it prefills (the legacy dialog never did); after a save the page reloads holdings, allocation, gaps and history and asks the server to recompute the analytics (a skeleton shows while they reload).
7. Post-import notice: a new `components/mf/PostImportNotice.tsx`, shown above every Overview state (content, empty, error), tied to the signed-in user, dismiss clears the history state.
8. Legacy parts keep their own markup and tokens; they are mounted in `data-legacy` wrappers with `contents` (no layout gap when empty) and the interactivity helper `testing.tsx` skips those wrappers (orchestrator-owned edit in the red commit).
9. The parts live on the Overview tab only; the other tabs are not touched (the Holdings tab lists stocks, not fund rows).
**Backend asks (additive; none blocks the run, the element is hidden):** (1) a holdings export route (CSV or XLSX of the table, per scope) and the owner's word on what "Export" should contain, before any Export button returns; (2) a coverage-gap route for the family view, or a family-level flag, so the banner can show without selecting a member; (3) optionally, recompute the stored analytics when an opening balance is posted, so the page's explicit recompute request after a save is not needed.
**Verification record (orchestrator, 27 Oct):** reference solution in `C:\Users\Dell\Desktop\MVP v1\ref\mf-fe-ref-d1` (never committed) passes: `tsc -b` exit 0, `oxlint src/features/mutual-funds src/components/mf/PostImportNotice.tsx` exit 0 and silent, feature folder 49 files / 868 tests (baseline 47 / 830), `src/components/mf` 9 files / 48 tests, shell + App 27 / 348 (unchanged), kit (`charts`, `lib`, `styles`) 16 / 188 (unchanged), `npm run build` built. Red state on the committed tests: `tsc -b` three TS2307 lines; feature 5 failed files / 21 failed tests of 852. Mutation checks on the reference, all caught: finding the clicked row by fund only (4 tests fail), sold-funds list never narrowed to the member (3), notice shown without the user check (35 incl. a crash), gap gate not mounted (6), no analytics recompute after a save (2), no history reload (2), Compare popup always asked for the family view (2).
**Unverified:** no browser pass (the legacy parts rendered inside the new shell in light and dark, the `contents` wrappers against the real page spacing, the popup stacking over the shell header); `HoldingRow` and `RealizedSummary` of the feature versus the old dashboard types are checked only by `tsc -b`; the real `PostImportNotice` against a real import round trip (only the history-state shape is tested).

## 7. Gemini prompt (paste into the Gemini window for folder `W:\home\ayush\wt\mf-fe`)
```
You are the front-end builder for the Unifolio UI redesign. Open the folder W:\home\ayush\wt\mf-fe (WSL path /home/ayush/wt/mf-fe, branch feat/mf-frontend). Before anything else run `git status --short` and `git log --oneline -3` inside WSL; the first must print nothing and the top commit must be the red-test commit the packet names (test(mutual-funds): failing tests for the wired legacy parts (MF-D1)). If not, STOP and report; do not fix it yourself. Read, completely and in order, Docs/orchestration/ui-redesign-MF-D1-legacy-parts-packet.md (also at W:\home\ayush\wt\docs\Docs\orchestration\ui-redesign-MF-D1-legacy-parts-packet.md). It is the whole truth for this run: do Step 0 first and report its outputs, then follow every step, rule and checkpoint exactly. The tests are already written and red; you create the three implementation files and edit only the two files the packet names (overview/HoldingsTable.tsx and overview/OverviewPage.tsx), exactly as specified. Never edit a test, fixture, types.ts or testing.tsx, never edit any other file in components/mf, never run npm install, never commit, never add an Export button, never import another feature into the Mutual Funds folder. Run every command inside WSL (wsl.exe -d Ubuntu --cd /home/ayush/wt/mf-fe ...) and never run two vitest or tsc commands at once. If tests time out under load, rerun with --maxWorkers=4. When done, send the report in the packet's report template with real command outputs. If anything differs from the packet, stop and report it.
```
