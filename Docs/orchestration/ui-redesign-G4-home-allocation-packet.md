# Packet G4 for Gemini (Antigravity): Home allocation and family section (Home front-end run 3 of 5)
**Status:** READY FOR GEMINI (written 26 Oct 2026). **Worker:** Gemini in Antigravity (Flash, high). **Orchestrator and verifier:** Claude Code. **Branch and folder:** `feat/home-frontend`, in the git worktree `/home/ayush/wt/home-fe` on WSL (open it in Antigravity as `W:\home\ayush\wt\home-fe`). This packet runs **at the same time as packet G5**, which works in a different folder and branch (`/home/ayush/wt/home-fe2`, branch `feat/home-frontend-b`): never touch that folder, and touch only your own file map, so the two branches merge cleanly.
**Parent plan:** `Docs/superpowers/plans/2026-10-23-home-frontend-plan.md` task T7 (Allocation and family cards). Signed-off copy and structure: the mockup `Docs/orchestration/2026-10-23-home-design-mockups.html` (section 4, functions `donut` and `r4`), layout `2026-10-23-home-layout.md` section 3. This packet is the whole truth for this run: where the plan and this packet differ, **this packet wins**. Method: `Docs/orchestration/2026-10-26-execution-plan-v2.md` sections 2 to 4. Data shapes: `frontend/src/features/home/types.ts`; real backend responses: the golden fixtures in `frontend/src/features/home/fixtures/` (orchestrator-owned, never edit).

## What this run is, in one paragraph
The tests are **already written and committed red** (four new test files). Write four implementation files so that they pass, one step at a time, running the checkpoint command after every step and keeping the real output. Do not change any test, `types.ts` or a fixture. The components are **presentational** (props in, callbacks out); no fetching, hooks, routes or page here.

## Rules (read twice)
1. **Scope.** Create **only** the four files in section 3. Anything else (tests, `types.ts`, fixtures, `package.json`, earlier files) is out of bounds.
2. **Never edit a test to make it pass.** If a test seems wrong, stop and describe it in the report (the orchestrator validated every test against a working solution).
3. **Run the checkpoint command after every step** and keep its real output for the report; fix your code, not the test.
4. **No new dependency, no `npm install`.**
5. **No float formatting of money or percentages.** Never `parseFloat`, `toFixed` or `Intl` in any Home file, **comments included** (a guard test greps whole file text). `Number(` and `Math.round` are allowed only for geometry (circle dash lengths, bar widths); displayed text comes from the string helpers in `homeFormat.ts`.
6. **No hard-coded colours in `.tsx` files** (no `#` followed by hex digits, no `rgb(`, comments included): CSS variables only. Other features may not be imported.
7. **Exact strings.** Every visible string, accessible name, test id and attribute in section 4 must be used exactly as written (including `·`, `→`, `←`, `—`).
8. **Do not refactor, rename or "improve" anything outside the file map.** 2-space indentation, double quotes, semicolons, `@/` imports for project code.
9. **If anything differs from this packet, stop and report it.**
10. **Run every command inside WSL** (Step 0).

## Step 0: environment check (do this first, and report the output)
The folder is opened as `W:\home\ayush\wt\home-fe`; **every command (`git`, `npm`, `npx`, `grep`, `cd`) runs inside WSL**: `wsl.exe -d Ubuntu --cd /home/ayush/wt/home-fe -- <command>` for git, `wsl.exe -d Ubuntu --cd /home/ayush/wt/home-fe/frontend -- <command>` for npm/npx; a command containing `|` is run as `... -- bash -c "<command>"`.
Run and report the output of each:
```
git branch --show-current          # expect: feat/home-frontend
git log --oneline -4               # expect the top line to start with: test(home): failing tests for the Home allocation section
git status --short                 # expect: nothing printed
cd frontend && npx tsc -b          # expect: errors only about the four missing modules (red state), nothing else
npx vitest run src/features/home/sections/WealthCard.test.tsx   # expect: 30 passed (the previous run is present)
npx vitest run src/features/home/allocationCopy.test.ts         # expect: FAIL, "Failed to resolve import ./allocationCopy" (red state)
```
State which way you run commands and whether you can edit files. If any expectation fails, **stop and report**.

## Goal
The "Asset allocation" card: a donut with the total in its centre, a legend of live classes (largest first, coloured by rank) and muted coming-soon classes, and below it either the family section (a stacked bar plus a row per member that selects the member) or, in a member's view, a "Viewing ..." strip with a link back to the family.
**Non-goals:** no fetching, no page layout, no change to the kit or to earlier files, no per-member day change (the backend does not provide it yet).

## 3. File map
**Create (4), all under `frontend/src/features/home/`:**
- `allocationCopy.ts`
- `components/AllocationDonut.tsx`
- `components/FamilyCards.tsx`
- `sections/Allocation.tsx`
**Do not touch:** every `*.test.ts(x)` file, `types.ts`, `fixtures/`, `package.json`, `package-lock.json`, `src/index.css`, `src/shell/**`, `src/components/ui/**`, `src/lib/**`, everything created in earlier runs, anything under `backend/` or `Docs/`.
**Tests to satisfy (committed; read each before its step):** `allocationCopy.test.ts`, `components/AllocationDonut.test.tsx`, `components/FamilyCards.test.tsx`, `sections/Allocation.test.tsx`; `guards.test.ts` is checked at the end and scans your new files.
**Available to import:** `../homeFormat` (`formatRupees`, `formatCompactRupees`, `formatPercent`, `formatSignedPercent`, ...), `../components/PartialDataBadge`, `CLICK_ROW` and `CLICK_CARD` from `@/lib/clickable`, `Skeleton` from `@/components/ui/skeleton`, lucide icons (`ChevronRight`, `ArrowLeft`, `ArrowRight`).

## 4. Specifications

### Step 1: `allocationCopy.ts`
Pure functions; read `allocationCopy.test.ts` (22 tests).
- `compareDecimalStrings(a, b): -1 | 0 | 1`: exact, sign-aware, on decimal strings with no floats: trim, drop a leading `+`, treat `-0`/`-0.00` as zero, compare signs, then integer parts (by length after removing leading zeros, then lexicographically), then fractional parts padded with zeros to equal length; for negatives invert.
- `liveRows(classes: ClassRowOut[])`: returns `{ key, label, value, percentage, color }[]` for classes whose `status` is `live` only. A missing `value`/`percentage` becomes `"0"`. Order: by value descending (use `compareDecimalStrings`), **stable**; rows whose value is zero go last in their original order. Colour by rank among the **non-zero** rows: `var(--c1)` for the first, `var(--c2)`, ... up to `var(--c8)`; ninth and later also `var(--c8)`; zero rows get `var(--ui-divider)`.
- `soonRows(classes)`: the `coming_soon` classes in the given order (the original objects).
- `formatLegendPercent(p)`: `formatPercent(p, { digits: 1 })`; `null` gives `—`.
- `memberColor(index)`: `` `var(--c${(index % 8) + 1})` ``.
- `memberInitial(name)`: the first non-space letter upper-cased; `?` when empty.
- `memberTitleName(name)`: when the name has **no lower-case letter** (an all-capitals name from a statement), title-case every word (`ASHA RAO` → `Asha Rao`); otherwise return it unchanged (`McDonald`, `Dev Rao`); empty stays empty.
**Checkpoint 1** (from `frontend/`): `npx vitest run src/features/home/allocationCopy.test.ts` → expect **22 passed**.

### Step 2: `components/AllocationDonut.tsx`
Export `AllocationDonut` with props `{ rows: { key; label; value; percentage; color }[]; centerValue: string; centerLabel?: string; onSliceClick?: (key: string) => void; ariaLabel?: string }` (`centerLabel` default `Total value`, `ariaLabel` default `Asset allocation`). Read `AllocationDonut.test.tsx` (10 tests).
- `<svg viewBox="0 0 160 160" width="160" height="160" role="img" aria-label={ariaLabel}>`.
- Constants: `R = 58`, `C = 2 * Math.PI * R`, `round2 = x => Math.round(x * 100) / 100`. For each row with a **non-zero** `percentage`, in order: `length = C * Number(percentage) / 100` and a `<circle data-testid={`slice-${key}`} r="58" cx="80" cy="80" fill="none" stroke={color} strokeWidth="22" strokeDasharray={`${round2(length)} ${round2(C - length)}`} strokeDashoffset={-round2(offset)} transform="rotate(-90 80 80)">` where `offset` is the sum of the **unrounded** lengths of the rows before it (the first prints `0`). Each circle contains `<title>{`${label} ${formatLegendPercent(percentage)}`}</title>`.
- With `onSliceClick`: the circles get `role="button"`, `tabIndex={0}`, `aria-label={`${label} ${formatLegendPercent(percentage)}`}`, `style={{ cursor: "pointer" }}`, and click / `Enter` / Space (call `preventDefault()` for Space) call `onSliceClick(key)`. Without it they have no role and no tabindex.
- Centre: `<text data-testid="donut-center-value" x="80" y="76" textAnchor="middle">` with `centerValue` (fill `var(--ui-text)`, bold 14 px) and `<text data-testid="donut-center-label" x="80" y="94" textAnchor="middle">` with `centerLabel` (fill `var(--ui-text-muted)`, 11 px). Import `formatLegendPercent` from `../allocationCopy`.
**Checkpoint 2:** `npx vitest run src/features/home/components/AllocationDonut.test.tsx` → expect **10 passed**.

### Step 3: `components/FamilyCards.tsx`
Export `FamilyCards` with props `{ members: MemberShareOut[]; onSelectMember: (id: string) => void }`. Read `FamilyCards.test.tsx` (9 tests).
- A caption `By family member` and a muted hint `Tap a member to view their portfolio`.
- A stacked bar `<div data-testid="family-bar" aria-hidden="true">` (a flex row, rounded, overflow hidden) with one `<i data-testid={`family-segment-${index}`} data-color={memberColor(index)}>` per member: `style={{ width: `${Number(member.percentage)}%`, backgroundColor: memberColor(index) }}` (the percentage `42.21` gives `42.21%`, `0.00` gives `0%`).
- One row per member, in the given order: `<div role="button" tabIndex={0} data-testid={`family-row-${member.id}`}>` containing an avatar `<span data-testid={`family-avatar-${member.id}`} data-color={memberColor(index)}>` showing `memberInitial(name)` (background `memberColor(index)` through `style`, text class `text-white`), the name `memberTitleName(name)` (semibold), the value `formatRupees(value)`, `` `${formatPercent(percentage, { digits: 1 })} of family` `` (muted), and the word `View` with a `ChevronRight`. Click, `Enter` and Space (`preventDefault` for Space) call `onSelectMember(member.id)`. Use `CLICK_ROW` for the interaction classes.
**Checkpoint 3:** `npx vitest run src/features/home/components/FamilyCards.test.tsx` → expect **9 passed**.

### Step 4: `sections/Allocation.tsx`
Export `Allocation` and `AllocationProps`:
```ts
export interface AllocationProps {
  status: "loading" | "error" | "data";
  data: AllocationResponse | null;
  scope: "aggregate" | "member";
  memberName?: string | null;
  onClassClick?: (key: string) => void;
  onSelectMember: (id: string) => void;
  onShowFamily?: () => void;
  onRetry: () => void;
}
```
Read `Allocation.test.tsx` (18 tests). Root: one card `<div>` with `rounded-xl bg-[var(--ui-elevated)] border border-[var(--ui-divider)] p-4`.
- **Loading:** `<div role="status" aria-label="Loading allocation">` with skeleton blocks. **Error, or `data` null:** `<h3>Asset allocation</h3>`, the text `Could not load allocation.` and a button `Try again` (`onRetry`).
- **Empty portfolio** (`compareDecimalStrings(data.total_value, "0") <= 0`): the heading, the text `Add investments to see allocation`, and only the coming-soon legend rows; no donut, no live rows, no family section.
- **Normal:** a header row: `<h3>Asset allocation</h3>`, `PartialDataBadge` (only when `data.partial`, with `data.missing_funds`), a pill `Approximate` inside an element with `title="Estimated from your funds' categories"` (only when `data.approximate`), and on the right a greyed link: an element with `aria-disabled="true"` and `title="Coming soon"` containing `<span>View in Analytics</span>` and an `ArrowRight` icon (muted, `cursor-not-allowed`). Then the donut (`AllocationDonut`, `rows` = `liveRows(data.classes)` without the zero-valued ones, `centerValue={formatCompactRupees(data.total_value)}`, `onSliceClick={onClassClick}`) next to the legend:
  - **Live rows** (all of `liveRows`, including zero-valued): `<div data-testid={`legend-${key}`} data-color={color}>` with a small swatch (background = colour through `style`), the label, `formatLegendPercent(percentage)` (semibold) and a `ChevronRight`. When `onClassClick` is given the row is `role="button"` `tabIndex={0}` (use `CLICK_ROW`) and click / `Enter` / Space (`preventDefault`) call `onClassClick(key)`; without it the row is plain.
  - **Coming-soon rows** (`soonRows`), after the live ones: `<div data-testid={`legend-soon-${key}`} aria-disabled="true">` muted, with the label and a pill `Coming soon`; no role, no handler.
- **Family part**, below: when `data.members` is not `null`: `<FamilyCards members={data.members} onSelectMember={onSelectMember} />`. Otherwise, when `scope === "member"`: a strip with the text `` `Viewing ${memberName}'s portfolio` `` (or `Viewing this portfolio` when there is no name) and, only when `onShowFamily` is given, a `<button type="button">` containing an `ArrowLeft` icon and the words `Family combined` that calls `onShowFamily()`.
**Checkpoint 4:** `npx vitest run src/features/home/sections/Allocation.test.tsx` → expect **18 passed**.

### Step 5: final checks (from `frontend/`, in this order; paste every output)
```
npx tsc -b                                          # expect: no output
npx oxlint src/features/home                        # expect: Found 0 warnings and 0 errors
npx vitest run src/features/home                    # expect: Test Files 22 passed, Tests 302 passed
npx vitest run src/components/ui/charts src/lib src/styles   # expect: Test Files 16 passed, Tests 188 passed
npm run build                                       # expect: "built in" with no error (a chunk-size warning is normal)
cd .. && git status --short                         # expect only the four new files under frontend/src/features/home
```
**Do not commit and do not push.** The orchestrator verifies and commits.

## Stop conditions
Stop and report if: Step 0 does not match; a checkpoint still fails after two honest attempts; a test appears to contradict this packet; you would need to edit a file outside section 3; a command needs `npm install`.

## Report (fill in at the end, in one fenced block, with the real command outputs)
```
GEMINI REPORT — ui-redesign — G4 (Home allocation and family)
Model and tool:    Date/time:
0. ENVIRONMENT: WSL terminal or wsl.exe prefix? Could you edit files? Step 0 outputs (all six):
1. FILES CREATED (exact paths):
2. CHECKPOINTS: for each of 1 to 4, the command and the last lines of its output (passed counts):
3. FINAL CHECKS (step 5), full outputs:
4. ANYTHING THAT DIFFERED FROM THE PACKET, and what you did:
5. TESTS THAT SEEMED WRONG (if any), with the exact failing assertion:
6. THINGS YOU COULD NOT DO OR VERIFY:
7. CONFIRMATIONS: tests untouched: yes/no; types.ts and fixtures untouched: yes/no; files outside the file map untouched: yes/no; no npm install: yes/no; nothing committed: yes/no
```

## Orchestrator notes (not for Gemini)
- **Validation:** the tests were validated against a private Sonnet-built reference (`~/home-fe-ref4`); findings applied before release (register C106).
- **Decisions (register C106):** the legend colours follow rank, not the class (largest first gets `--c1`); a per-member day change is not shown (the allocation response has no such field; backend addition if wanted); an empty portfolio shows the card with "Add investments to see allocation" per the layout doc (the page hides it behind the empty-state rule); "Approximate" and partial data are flagged on the card.
