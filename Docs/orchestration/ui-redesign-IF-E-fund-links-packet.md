# Packet IF-E for Gemini (Antigravity): fund names on Home, Mutual Funds and Portfolio open the Individual Fund page
**Status:** READY FOR GEMINI NOW (29 Oct: red commit `b3d941f4` rebased onto `66c4f2aa` and pushed as `feat/if-links`; Step 0 re-run: tsc 6 errors all in tests, four folders 22 failed files / 52 failed tests of 133 / 2006). Original text: once IF-D is merged into `leapswitch-redesign` and `feat/if-links` is rebased onto that tip and pushed (written 28 Oct 2026; the red tests are committed locally as `c443c41a` on `feat/if-links` from `f8db102e`, which does NOT yet contain IF-D; two test files carry uncommitted fixes from this preparation run, see section 6, "Orchestrator actions"; nothing is pushed). **Worker:** Gemini in Antigravity (Flash, high). **Orchestrator and verifier:** Claude Code. **Branch and folder:** `feat/if-links`, in the git worktree `/home/ayush/wt/if-fe` on WSL (open it in Antigravity as `W:\home\ayush\wt\if-fe`). **Stacking:** IF-E touches no file that IF-D touches (IF-D owns `features/individual-fund`, the route files and the shell tests; IF-E edits only Home, Mutual Funds, Portfolio and `components/mf/FundDetailModal.tsx`), so it is rebased onto the new `leapswitch-redesign` tip with the IF-E red commit as the only commit that moves. **Step 0 is written for the state "IF-D merged + IF-E red".** The red-test commit message starts `test(individual-fund): failing tests for the fund-page entry points (IF-E)`. Never touch another worktree.
**Parent documents:** the Individual Fund page (route `portfolio-mutual-funds-fund`, live since IF-C; `paths.mutualFunds.fund(schemeId)` in `src/shell/nav/paths`); sibling packets `ui-redesign-IF-C-go-live-packet.md` and `ui-redesign-IF-D-overlap-tab-packet.md` (the shape of this one); the existing link pattern `features/planning/components/MemberRows.tsx` (`AppLink` from `@/shell/nav/AppLink` plus `paths.mutualFunds.fund(...)`); register C149 (the Home greeting's top-mover link keeps its decision: it switches Movers to the Fund grouping and opens that fund's popup), C159 (the Mutual Funds holdings table stays free of links; its rows open the Fund Details popup), C157 (defaults accepted); handoff 6 section 3.2. Method: `Docs/orchestration/2026-10-26-execution-plan-v2.md` sections 2 to 4. **This packet is the whole truth for this run: where an earlier packet or text and this packet differ, this packet wins.**

## What this run is, in one paragraph
Today a fund name on Home (the Movers rows and popup, the news "Why this?" popup, the "Review this fund" link of a Worth a look card), on Mutual Funds (the SIP timeline, the allocation, holdings, overlap and performance cards, the Fund Details popup) and on Portfolio (the Quick Insights "largest holding" line) is plain text or a greyed "Coming soon" stand-in. The Individual Fund page is live, so each of these names now opens `/portfolio/mutual-funds/funds/<schemeId>`. The tests are **already written and committed red**. You **create 2 source files** (a tiny `FundLink` component for Home and one for Mutual Funds) and **edit 18 existing source files**; no backend change, no new endpoint, no new dependency, no route change. **The one hard design rule: a link is never put inside a button or inside an element with `role="button"`** (a link in a button is invalid HTML and breaks screen readers). Only one place needed more than a one-line swap for that reason: the Home Movers row, which was a button containing the fund name (Step 2 shows the safe pattern: a row container holding the link and a separate open button). Places where the name sits inside a button, a row toggle or a card control, or where the data has no scheme id, are **not linked** (the inventory in section 6).

## Rules (read twice)
1. **Scope.** Create the 2 files and edit the 18 files in section 3, nothing else. Every test file, `features/individual-fund/**` (IF-D owns it), the shell and routes, the kit (`src/components/ui/**`), `lib/`, Planning, Profile, the legacy Dashboard/Analytics/mobile/History screens, `types.ts` files and fixtures are out of bounds.
2. **Never edit a test or a fixture to make it pass.** If a test seems wrong, stop and describe it in the report (the orchestrator validated every test against a working solution, and checked deliberate breaks of that solution: all caught, section 6).
3. **Run the checkpoint command after every step**, keep its real output for the report; fix your code, not the test.
4. **No new dependency, no `npm install`.**
5. **Links only through `paths`** (`paths.mutualFunds.fund(schemeId)`) and `AppLink` from `@/shell/nav/AppLink`. Never build the address by hand, never use `<a href>` or `useNavigate` for this.
6. **Never put a link inside a `<button>`, a `role="button"` element, a `role="option"` or a `role="tab"`.** If the fund name you are asked to link sits inside one of those, the packet says so and tells you what to do. Do not link anything the packet does not list.
7. **No hard-coded colours** in the files you touch (a guard in some folders greps `#` followed by hex digits and `rgb(`, comments included): use tokens such as `var(--c2)`, `var(--ui-text)`.
8. **Do not import another feature.** `features/home` imports only `@/*` and its own folder; `features/mutual-funds` imports only `@/*`, `components/mf` and its own folder; Portfolio imports `@/shell/*` and its own folder. That is why there are two `FundLink` components and not one shared one.
9. **Do not refactor, rename or "improve" anything outside the file map.** 2-space indentation, double quotes, semicolons, no `any`, no unused locals or imports (`tsc -b` is strict), no `console.`.
10. **Lint.** `oxlint` warns when a file exports a component and also a constant or a hook: the two `FundLink.tsx` files export a component (and its props interface) only. Do not add `oxlint-disable` comments. One warning already exists in `src/components/mf/CoverageBanner.tsx` and is not yours (the exit code stays 0).
11. **If anything differs from this packet, stop and report it.**
12. **Run every command inside WSL** (Step 0). If one test fails with an "Unable to find an element ... timed out" message, or `src/shell/portedFlow.test.tsx` fails on a long run, re-run that file alone (`npx vitest run <file> --maxWorkers=4`) before you report it: the machine is shared. A test that fails twice in a row alone is real. Never run two `vitest` or `tsc` commands at the same time.

## Step 0: environment check (do this first, and report the output)
The folder is opened as `W:\home\ayush\wt\if-fe`; **every command (`git`, `npm`, `npx`, `grep`, `cd`) runs inside WSL**: `wsl.exe -d Ubuntu --cd /home/ayush/wt/if-fe -- <command>` for git, `wsl.exe -d Ubuntu --cd /home/ayush/wt/if-fe/frontend -- <command>` for npm/npx; a command containing `|` is run as `... -- bash -c "<command>"`.
```
git status --short                 # expect: nothing printed (run this FIRST, before anything else)
git branch --show-current          # expect: feat/if-links
git log --oneline -3               # expect: top line "... test(individual-fund): failing tests for the fund-page entry points (IF-E)", then 66c4f2aa "docs: orchestrator handoff 6" (IF-D is NOT in this base; the owner chose to build IF-E first, IF-E touches nothing in features/individual-fund, so IF-D merges later without conflict)
cd frontend && npx tsc -b          # expect exactly 6 error lines, every one in a *.test.tsx file, none in a source file: components/mf/FundDetailModal.test.tsx 2 (the actions prop), features/portfolio/fundLink.test.tsx 2 (schemeId not on InsightPart), features/home/components/FundLink.test.tsx 1 and features/mutual-funds/common/FundLink.test.tsx 1 (cannot find module ./FundLink)
npx vitest run src/features/home --maxWorkers=4          # expect: Test Files 5 failed | 39 passed (44); Tests 21 failed | 660 passed (681)
npx vitest run src/features/mutual-funds --maxWorkers=4  # expect: Test Files 13 failed | 49 passed (62); Tests 21 failed | 954 passed (975)
npx vitest run src/features/portfolio --maxWorkers=4     # expect: Test Files 3 failed | 15 passed (18); Tests 9 failed | 289 passed (298)
npx vitest run src/components/mf --maxWorkers=4          # expect: Test Files 1 failed | 8 passed (9); Tests 1 failed | 51 passed (52)
npx vitest run src/shell src/App.test.tsx --maxWorkers=4 # expect: Test Files 27 passed (27); Tests 347 passed (347)
npx vitest run src/components/ui/charts src/lib src/styles   # expect: Test Files 17 passed, Tests 190 passed
```
(Across the four feature folders that is 22 failed files and 52 failed tests of 133 files and 2006 tests; two of the 22 files, the two `FundLink.test.tsx`, cannot import their module yet. Every failure is "Unable to find an accessible element with the role link ..." or a missing module, a missing `actions` prop or a missing `schemeId` on an insight part: the behaviour is simply not built.) State which way you run commands and whether you can edit files. If any expectation fails, **stop and report** (above all: if IF-D is not in the base, or `src/features/individual-fund` has failing tests, this run must not start). Counts of files IF-D changed (`features/individual-fund`, `src/shell`) may differ from the numbers a sibling packet wrote; for the four folders above they must match exactly.

## Goal
Make every fund name listed in section 3 a real link to that fund's page, with the keyboard working, nothing nested inside a button, the greyed "Coming soon" look kept while the fund page route is not live (that is `AppLink`'s own behaviour; a test checks it), and nothing else on those screens changing.
**Non-goals:** any change to the Individual Fund page; a link in a place the packet does not list (the Other tab, the overlap top pairs and heatmap, the holdings table, the Ledger: section 6); a backend change; the Home greeting link (register C149 stays); fixtures or types.

## 3. File map
**Create (2 source files):**
- `frontend/src/features/home/components/FundLink.tsx` (Step 1)
- `frontend/src/features/mutual-funds/common/FundLink.tsx` (Step 1)

**Edit (18, only the lines named; all paths under `frontend/src/`):**
- Home (Step 2): `features/home/components/MoverRow.tsx`, `features/home/sections/Movers.tsx`, `features/home/sections/News.tsx`, `features/home/sections/WorthALook.tsx`
- Mutual Funds and the popup (Step 3): `components/mf/FundDetailModal.tsx`, `features/mutual-funds/overview/OverviewPage.tsx`, `features/mutual-funds/overview/OverviewCards.tsx`, `features/mutual-funds/overview/SipTimeline.tsx`, `features/mutual-funds/allocation/AssetClassCard.tsx`, `CategoryAmcCard.tsx`, `FundManagerCard.tsx`, `MarketCapCard.tsx`, `features/mutual-funds/holdings/AllStocksTable.tsx`, `features/mutual-funds/overlap/CommonHoldings.tsx`, `features/mutual-funds/overlap/PairDetail.tsx`, `features/mutual-funds/performance/PerformancePage.tsx`
- Portfolio (Step 4): `features/portfolio/quickInsightsCopy.ts`, `features/portfolio/sections/QuickInsights.tsx`

**Do not touch:** every `*.test.ts(x)` file, fixtures, `features/individual-fund/**`, `src/shell/**`, `src/components/ui/**`, `src/lib/**`, `package.json`, `package-lock.json`, `src/index.css`, anything under `backend/` or `Docs/`.
**Tests to satisfy (committed):** `home/components/FundLink.test.tsx`, `home/fundLinks.test.tsx`, `home/sections/Movers.test.tsx`, `Movers.open.test.tsx`, `News.test.tsx`, `WorthALook.test.tsx`, `mutual-funds/common/FundLink.test.tsx`, `mutual-funds/guards.test.ts`, the allocation, holdings, overlap, overview, performance and transactions tests the red commit touched, `components/mf/FundDetailModal.test.tsx`, `portfolio/fundLink.test.tsx`, `portfolio/quickInsightsCopy.test.ts`, `portfolio/sections/QuickInsights.test.tsx`. Several existing tests changed only their render helper (`render` became `renderInShell as render` from `@/shell/testing`, which supplies the router and the route registry that `AppLink` needs).

## 4. Specifications
The link style everywhere is `hover:underline` unless a step says otherwise (the text keeps the colour around it). `AppLink` draws a greyed, inert "Coming soon" element when the route is not live and a real `<a href>` when it is; you never test for that yourself.

### Step 1: the two `FundLink` components (create exactly)
`frontend/src/features/home/components/FundLink.tsx`:
```tsx
import type { ReactNode } from "react";
import { AppLink } from "@/shell/nav/AppLink";
import { paths } from "@/shell/nav/paths";

export interface FundLinkProps {
  /** The fund's scheme id. Missing or empty: the name is shown as plain text, never as a dead link. */
  schemeId: string | null | undefined;
  children: ReactNode;
  className?: string;
  /**
   * Set when the link sits inside a row that has its own click or key action (the row opens a popup).
   * A click or key press on the link then stays on the link and does not also trigger the row.
   */
  inClickableRow?: boolean;
}

export function FundLink({ schemeId, children, className = "hover:underline", inClickableRow = false }: FundLinkProps) {
  if (!schemeId) return <>{children}</>;
  const link = (
    <AppLink to={paths.mutualFunds.fund(schemeId)} className={className}>
      {children}
    </AppLink>
  );
  if (!inClickableRow) return link;
  return (
    <span className="contents" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
      {link}
    </span>
  );
}
```
`frontend/src/features/mutual-funds/common/FundLink.tsx`:
```tsx
import type { ReactNode } from "react";
import { AppLink } from "@/shell/nav/AppLink";
import { paths } from "@/shell/nav/paths";

export interface FundLinkProps {
  /** The fund's scheme id. Missing or empty: the name is shown as plain text, never as a dead link. */
  schemeId: string | null | undefined;
  children: ReactNode;
  className?: string;
}

/** A fund name that opens the fund's page. Only for names that are plain text: never inside a button, a toggle or a row with its own click. */
export function FundLink({ schemeId, children, className = "hover:underline" }: FundLinkProps) {
  if (!schemeId) return <>{children}</>;
  return (
    <AppLink to={paths.mutualFunds.fund(schemeId)} className={className}>
      {children}
    </AppLink>
  );
}
```
**Checkpoint 1:** `npx vitest run src/features/home/components/FundLink.test.tsx src/features/mutual-funds/common/FundLink.test.tsx --maxWorkers=4` -> expect **2 files passed, Tests 21 passed**.

### Step 2: Home (4 files; `FundLink` is `./FundLink` from `components/` and `../components/FundLink` from `sections/`)
Read `home/fundLinks.test.tsx` (Movers, news popup, Worth a look), then `Movers.test.tsx`, `Movers.open.test.tsx`, `News.test.tsx`, `WorthALook.test.tsx`.
- **`MoverRow.tsx` (the safe pattern; read it twice).** Add `import { FundLink } from "./FundLink";`. After `const width = ...` add:
```tsx
  // Only a row that is exactly one fund can name that fund's page; a sector or category row, or a row that
  // stands for several funds, is plain text. The id comes from the fund, not from the row key.
  const fundId = (view === "fund" && bar.funds.length === 1 ? bar.funds[0].scheme_id : null) || null;
  // A row that holds a link must not itself be a button (a link inside a button is invalid and confuses screen
  // readers). That row is a plain container: a click anywhere on it opens the popup, and the chevron is a real
  // button next to the link (its Enter or Space press arrives as a click on the row, so no key code is needed).
  const linked = fundId !== null;
```
Keep `handleKeyDown` as it is. Replace the outer `<div role="button" tabIndex={0} data-testid=... className=... onClick=... onKeyDown=...>` by the same element **without** `role`, `tabIndex` and `onKeyDown` when `linked`:
```tsx
  const rowProps = linked
    ? {}
    : { role: "button", tabIndex: 0, onKeyDown: handleKeyDown };

  return (
    <div
      {...rowProps}
      data-testid={`mover-${bar.key}`}
      className={`${CLICK_ROW} flex flex-col gap-2 rounded-lg p-2`}
      onClick={() => onOpen(bar)}
    >
```
Around the label put the link: `{bar.label}` becomes `<FundLink schemeId={fundId} inClickableRow>{bar.label}</FundLink>` (inside the same `truncate font-medium` div). Replace the decorative `<ChevronRight ... />` by:
```tsx
        {linked ? (
          <button
            type="button"
            aria-label={`Show the funds in ${bar.label}`}
            className="shrink-0 rounded text-[var(--ui-text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        ) : (
          <ChevronRight
            size={16}
            className="shrink-0 text-[var(--ui-text-muted)]"
            aria-hidden="true"
          />
        )}
```
The button has no `onClick` of its own on purpose: its click bubbles to the row, so the popup opens exactly once. A row without a link (sector, category, several funds, no id) stays exactly as it was (a `role="button"` with key handling): the existing tests check it.
- **`Movers.tsx`.** Add `import { FundLink } from "../components/FundLink";`. (a) In `closeDialog`, the last line `row?.focus();` becomes (with the comment):
```tsx
    // A row that holds a fund link is not itself focusable: its own button takes the focus back.
    (row?.getAttribute("role") === "button" ? row : row?.querySelector<HTMLElement>("button"))?.focus();
```
(b) In the popup's fund list (the `<li key={fund.scheme_id} ...>`), `<span className="text-[var(--ui-text)]">{fund.name}</span>` becomes `<span className="text-[var(--ui-text)]"><FundLink schemeId={fund.scheme_id}>{fund.name}</FundLink></span>` (the amount next to it stays).
- **`News.tsx`.** Add `import { FundLink } from "../components/FundLink";`. In the "Why this?" dialog list, the greyed `<span aria-disabled="true" title="Coming soon" className="cursor-not-allowed text-[var(--ui-disabled-text)]">{fund.name}</span>` is replaced by `<span className="text-[var(--ui-text)]"><FundLink schemeId={fund.scheme_id}>{fund.name}</FundLink></span>`; the weight text after it stays.
- **`WorthALook.tsx`.** Add `import { AppLink } from "@/shell/nav/AppLink";` and `import { paths } from "@/shell/nav/paths";` (after the `@/components/ui/skeleton` import). In `WorthCard`, after `const detail = worthDetail(card);` add:
```tsx
  // Only the two cards about one named fund can open that fund's page; the cost and concentration links
  // stay greyed (their target, a cost comparison or a holdings view, does not exist yet).
  const reviewable = card.kind === "weak_fund" || card.kind === "underperforming";
```
and replace the greyed `<span aria-disabled="true" title="Coming soon" className="inline-flex cursor-not-allowed ...">...</span>` at the foot of the card by:
```tsx
        {reviewable && card.scheme_id ? (
          <AppLink
            to={paths.mutualFunds.fund(card.scheme_id)}
            className="inline-flex items-center gap-1 text-[var(--ui-text)] hover:underline"
          >
            <span>{linkText}</span>
            <ArrowRight size={14} className="text-[var(--ui-text-muted)]" aria-hidden="true" />
          </AppLink>
        ) : (
          /* the old greyed span, unchanged */
        )}
```
(write the old greyed `<span aria-disabled="true" title="Coming soon" ...>` back in place of the comment; keep `linkText` as it is).
**Checkpoint 2:** `npx vitest run src/features/home --maxWorkers=4` -> expect **Test Files 44 passed, Tests 693 passed**.

### Step 3: Mutual Funds and the Fund Details popup (12 files)
Read the changed tests first. In each file add `import { FundLink } from "../common/FundLink";` next to the other imports (all these folders are one level below `common/`), and wrap **only** the fund-name text as shown; nothing else in the line changes (the separators, the weights and the age notes keep their text, which the tests compare).
- **`components/mf/FundDetailModal.tsx`:** add `import type { ReactNode } from "react";` at the top; add the prop `/** Optional extra line under the details (the Mutual Funds page passes its "Open fund page" link). Nothing when absent. */ actions?: ReactNode;` to `FundDetailModalProps`, destructure it, and render `{actions}` as the last child of the inner content `<div>` (just before its closing tag, after the details block). With no `actions` the output is byte-for-byte what it was (a test compares). This file does NOT import `FundLink` (it lives in `components/`, the page passes the link in).
- **`overview/OverviewPage.tsx`:** import `FundLink`; the popup becomes
```tsx
        <FundDetailModal
          isOpen={openRow !== null}
          onClose={() => setOpenRow(null)}
          holding={openRow}
          actions={
            openRow?.scheme_id ? (
              <p className="mt-4 text-sm">
                <FundLink schemeId={openRow.scheme_id} className="font-medium text-[var(--c2)] hover:underline">
                  Open fund page
                </FundLink>
              </p>
            ) : undefined
          }
        />
```
The holdings table itself gets **no link** (register C159; its name cell is a button that opens this popup).
- **`overview/OverviewCards.tsx`** (`AmcAllocationCard`, the drill popup list): `<span className="font-medium text-[var(--ui-text)]">{h.scheme_name}</span>` becomes the same span around `<FundLink schemeId={h.scheme_id}>{h.scheme_name}</FundLink>`.
- **`overview/SipTimeline.tsx`, four places:** the "Next:" chip text `Next: {nextSip.scheme_name} · ...` becomes `Next: <FundLink schemeId={nextSip.scheme_id}>{nextSip.scheme_name}</FundLink> · ...` (rest of the line unchanged); the three `<div className="text-sm font-medium text-[var(--ui-text)]">{sip.scheme_name}</div>` / `{row.scheme_name}` lines (the day popup, the recent list, the upcoming list) each wrap the name in `<FundLink schemeId={sip.scheme_id}>` / `<FundLink schemeId={row.scheme_id}>`.
- **`allocation/AssetClassCard.tsx`:** the drill list `{fund.scheme_name}` inside `data-testid={`drill-fund-name-...`}` becomes `<FundLink schemeId={fund.scheme_id}>{fund.scheme_name}</FundLink>`.
- **`allocation/CategoryAmcCard.tsx`:** `{fund.name}` in the fund row (the `truncate font-medium` span) becomes `<FundLink schemeId={fund.schemeId}>{fund.name}</FundLink>` (note `schemeId`, camel case, in this card).
- **`allocation/FundManagerCard.tsx`, two places:** both `{fund.scheme_name}` in the `truncate ... font-medium` spans (the table's opened-manager list and the donut drill panel) become `<FundLink schemeId={fund.scheme_id}>{fund.scheme_name}</FundLink>`. The manager rows (buttons) are not touched.
- **`allocation/MarketCapCard.tsx` and `holdings/AllStocksTable.tsx`:** in the fund `<li>` under an opened stock, `{fund.scheme_name} · ...` becomes `<FundLink schemeId={fund.scheme_id}>{fund.scheme_name}</FundLink> · ...` (the rest of the line unchanged).
- **`overlap/CommonHoldings.tsx`:** `{f.scheme_name} — ...` becomes `<FundLink schemeId={f.scheme_id}>{f.scheme_name}</FundLink> — ...`.
- **`overlap/PairDetail.tsx`:** the `<h4>` text `{a} × {b} — shared holdings` becomes `<FundLink schemeId={pair.fund_a.scheme_id}>{a}</FundLink> × <FundLink schemeId={pair.fund_b.scheme_id}>{b}</FundLink> — shared holdings` (the heading's text is unchanged).
- **`performance/PerformancePage.tsx`, two places:** the month popup's `<span ...>{f.scheme_name}</span>` and the XIRR table's first `<td ...>{f.scheme_name}</td>` content become `<FundLink schemeId={f.scheme_id}>{f.scheme_name}</FundLink>` (inside the same span and td).
**Checkpoint 3:** `npx vitest run src/features/mutual-funds src/components/mf --maxWorkers=4` -> expect **Test Files 71 passed (71), Tests 1036 passed (1036)** (62 files and 984 tests, plus 9 files and 52 tests).

### Step 4: Portfolio, Quick Insights
Read `portfolio/fundLink.test.tsx`, `quickInsightsCopy.test.ts`, `sections/QuickInsights.test.tsx`.
- **`quickInsightsCopy.ts`:** the `InsightPart` interface gains `/** Set only on the fund name of the largest-holding line: that part opens the fund's page. */ schemeId?: string;` and the largest-holding fund-name part becomes `{ text: insights.largest_holding.fund_name, bold: true, schemeId: insights.largest_holding.scheme_id }`.
- **`QuickInsights.tsx`:** add `import { AppLink } from "@/shell/nav/AppLink";` and `import { paths } from "@/shell/nav/paths";` (after the skeleton import); inside the bold part `<b ...>`, `{part.text}` becomes `{part.schemeId ? (<AppLink to={paths.mutualFunds.fund(part.schemeId)} className="hover:underline">{part.text}</AppLink>) : (part.text)}`.
**Checkpoint 4:** `npx vitest run src/features/portfolio --maxWorkers=4` -> expect **Test Files 18 passed, Tests 298 passed**.

### Step 5: final checks (from `frontend/`, in this order; paste every output)
```
npx tsc -b                                                          # expect: no output
npx oxlint src/features/home src/features/mutual-funds src/features/portfolio src/components/mf   # expect: exit code 0; the one existing warning in components/mf/CoverageBanner.tsx is not yours
npx vitest run src/features/home src/features/mutual-funds src/features/portfolio src/components/mf --maxWorkers=4   # expect: Test Files 133 passed, Tests 2027 passed
npx vitest run src/shell src/App.test.tsx --maxWorkers=4            # expect: Test Files 27 passed, Tests 347 passed
npx vitest run src/components/ui/charts src/lib src/styles          # expect: Test Files 17 passed, Tests 190 passed
npm run build                                                       # expect: "built in" with no error (a chunk-size warning is normal)
cd .. && git status --short -uall                                   # expect: " M" for exactly the 18 edited files and "??" for exactly the 2 created files of section 3, nothing else
```
**Do not commit and do not push.** The orchestrator verifies and commits.

## Stop conditions
Stop and report if: Step 0 does not match (above all, IF-D not in the base); a checkpoint still fails after two honest attempts; a test appears to contradict this packet; you would need to edit a file outside section 3; a command needs `npm install`; you are tempted to link a name that sits inside a button, a row toggle or a `role` element, to import another feature, to build an address by hand, or to touch the Home greeting.

## 5. Report (fill in at the end, in one fenced block, with the real command outputs)
```
GEMINI REPORT - ui-redesign - IF-E (fund names open the Individual Fund page)
Model and tool:    Date/time:
0. ENVIRONMENT: WSL terminal or wsl.exe prefix? Could you edit files? Step 0 outputs (all ten):
1. FILES CREATED (2) AND EDITED (18), exact paths; confirm nothing else changed and no test or fixture is touched:
2. CHECKPOINTS: for each of 1 to 4, the command and the last lines of its output (passed counts):
3. FINAL CHECKS (step 5), full outputs:
4. ANYTHING THAT DIFFERED FROM THE PACKET, and what you did:
5. TESTS THAT SEEMED WRONG (if any), with the exact failing assertion:
6. THINGS YOU COULD NOT DO OR VERIFY (no browser pass? say so):
7. CONFIRMATIONS: tests untouched: yes/no; fixtures untouched: yes/no; files outside the file map untouched: yes/no; no link inside a button or role element: yes/no; links only through paths and AppLink: yes/no; no import from another feature: yes/no; the Home greeting untouched: yes/no; no npm install: yes/no; nothing committed: yes/no
```

## 6. Spec conflicts, defaults, inventory and backend asks (not for Gemini; for the orchestrator and the register)
**Orchestrator actions before the owner syncs.** (1) The red commit as first written put the Home Movers name link **inside** the row's `role="button"` element (a nested interactive element, which the preparation brief forbids). This run replaced that with the safe pattern of Step 2 and changed two test files; they are **uncommitted edits in `wt\IFE`**: `frontend/src/features/home/fundLinks.test.tsx` (the keyboard/nesting tests, the exactly-once open test, a no-link-in-a-button test) and `frontend/src/features/home/sections/Movers.open.test.tsx` (the old focus-return test now uses the sector grouping, whose rows are buttons; a new test covers the fund rows). Fold them in before rebasing: `git -C "C:\Users\Dell\Desktop\MVP v1\wt\IFE" commit -a --amend --no-edit`. (2) Rebase: `git -C ...\wt\IFE rebase --onto origin/leapswitch-redesign f8db102e feat/if-links` (only the red commit moves; message unchanged), re-run Step 0 there (the numbers above are measured on `f8db102e`; IF-D changes no file of the four feature folders), push `feat/if-links`, commit this packet. (3) The packet-mentioned "Ledger" test (`transactions/Ledger.test.tsx`) passes already in the red state on purpose: it documents that the ledger has no link until the backend ask BE1 is done.
**What the red commit changes in files other packets own.** Nothing outside Home, Mutual Funds, Portfolio and `components/mf`. The existing tests of those folders changed in three ways only: the render helper (`renderInShell as render`), assertions that said "greyed, Coming soon" (News popup, Worth a look) now say "link", and `guards.test.ts` (mutual-funds) expects the new `common/FundLink.tsx`.

**Inventory: every place a fund name appears in the new Home, Mutual Funds and Portfolio screens.**
| Place | Scheme id in the data | Linked? | Why |
|---|---|---|---|
| Home, Movers rows, Fund grouping, one fund | yes (`funds[0].scheme_id`) | yes | name link; the row stops being a button, a separate open button (safe pattern) |
| Home, Movers rows, Sector or Category grouping, or a row of several funds | no (a row is not a fund) | no | plain text, row stays a button |
| Home, Movers popup (funds of a row) | yes | yes | plain list items |
| Home, News "Why this?" popup | yes (`NewsFundOut.scheme_id`) | yes | replaced greyed text |
| Home, Worth a look "Review this fund" (weak fund, underperforming) | yes (`card.scheme_id`) | yes | the link's target is the fund page |
| Home, Worth a look cost and concentration cards | yes | no, stays greyed | their target (cost comparison, holdings view) does not exist; the fund page is not what the link text promises |
| Home, greeting top-mover link | yes (`top_contributor_scheme_id` is in the backend and `types.ts`) | no, unchanged | register C149: the link switches Movers to Fund and opens that fund's popup; owner may later decide to go to the page instead |
| Mutual Funds, Overview holdings table rows | yes | no | register C159: the name cell is a button that opens the popup |
| Mutual Funds, Fund Details popup | yes | yes ("Open fund page" link, via the new `actions` prop of `FundDetailModal`) | the way to the page from the table |
| Mutual Funds, AMC allocation drill popup | yes | yes | plain list |
| Mutual Funds, SIP timeline (Next chip, day popup, recent and upcoming lists) | yes | yes | plain text |
| Mutual Funds, Allocation cards (asset class drill, category/AMC, fund manager table and drill, market cap stocks) | yes | yes | plain list items; manager and slice rows (buttons) untouched |
| Mutual Funds, Holdings tab (stocks, funds behind a stock) | yes | yes | plain list items; stock rows (buttons) untouched |
| Mutual Funds, Overlap tab: funds behind a common stock, pair detail title | yes | yes | plain text |
| Mutual Funds, Overlap: heatmap headers and cells, top pairs, impact donut, stat strip | yes | no | initials chips, buttons or tooltips; no plain-text name to link |
| Mutual Funds, Performance: month popup, fund XIRR table | yes | yes | plain text |
| Mutual Funds, Performance: benchmark fund rows | yes | no | name is inside a toggle button |
| Mutual Funds, Other tab (fund ranking, category ranking, scorer cards, TER ladder) | yes | no | names sit in row toggles or card controls; follow-up IF-E2 with the same container-plus-separate-button pattern and its own tests |
| Mutual Funds, Transactions ledger | **no** (`InvestmentWithdrawalEntry` has no `scheme_id`) | no | backend ask BE1; the name is also inside the expand button |
| Portfolio, Quick Insights "largest holding" line | yes (`largest_holding.scheme_id`) | yes | the bold fund name only |
| Portfolio, anything else | none other shows a fund name | n/a | |
| Legacy Dashboard, Analytics, History, mobile screens | mixed | no | old pages, out of the redesign |
| Planning member rows | yes | already linked (IF-B) | untouched |

**Defaults taken, needing register entries (C-numbers assigned by the orchestrator):**
1. **Link pattern:** shell `AppLink` + `paths.mutualFunds.fund(schemeId)` through two tiny `FundLink` components (Home, Mutual Funds) because features may not import each other; Portfolio uses `AppLink` directly. No scheme id (null, undefined, empty): plain text, never a dead link; route not live: the shared greyed look.
2. **No link inside a button or a role element** (hard rule). The tests of the places that were already links-in-lists assert `button a` is empty; the Home Movers rows were the one violation in the first red commit and were redesigned (default 3).
3. **Movers rows with a link are a plain container with a separate open button** (`aria-label` "Show the funds in <name>"): a click anywhere on the row or Enter/Space on the button opens the popup exactly once; focus returns to that button on close; rows without a link stay `role="button"` rows.
4. **Movers: only the Fund grouping and only a row of exactly one fund with an id** gets a link; sector and category rows are not funds.
5. **Home news popup funds are links** (were greyed because no page existed); weights stay as sent.
6. **Worth a look:** only `weak_fund` and `underperforming` cards link ("Review this fund" is true to the target); cost and concentration cards stay greyed.
7. **Greeting top-mover link unchanged** (C149).
8. **Mutual Funds holdings table stays link-free; the Fund Details popup gets an "Open fund page" link** via an optional `actions` slot on `FundDetailModal` (empty slot changes nothing, so the old Dashboard popup is byte-identical); link colour `var(--c2)`.
9. **Where a name sits in a toggle, a card control, an initials chip or a tooltip it is not linked** now (inventory above); follow-up IF-E2.
10. **Ledger rows are not linked** until the backend adds a scheme id (BE1).
11. **Legacy screens untouched.**

**Backend asks (small work for a Sonnet agent; never for Gemini):**
- **BE1.** Add `scheme_id` (string, additive and optional) to the investment-and-withdrawal ledger entry (`InvestmentWithdrawalEntry` in `backend/app/services/analytics/schemas.py`, built in `investment_withdrawal.py`), plus the golden fixture and the front-end type in `features/mutual-funds/types.ts`, so the Transactions ledger can link its fund names (front-end follow-up IF-E2; the name sits inside the expand button, so it needs the container-plus-button pattern). Payloads stored before it have none: the name then stays text.
- No other place needs backend work: every other unlinked place is a front-end choice (inventory), not a missing id. `top_contributor_scheme_id` already exists for the greeting (owner decision C149 stands).

**Verification record (28 Oct, `ref\if-fe-ref-e`, detached at `f8db102e` + the red commit's tests + the solution; never committed):** `tsc -b` exit 0; `oxlint` of the four feature folders exit 0 with the one existing `CoverageBanner.tsx` warning; Home 44 files / 693 tests, Mutual Funds 62 / 984, Portfolio 18 / 298, `components/mf` 9 / 52 (total 133 files / 2027 tests; red state: 22 failed files, 52 failed tests, 1954 passed of 2006); shell and App 27 / 347; kit (`charts`, `lib`, `styles`) 17 / 190; `npm run build` built (3.7 s). **Nesting audit:** a temporary MutationObserver in the test setup (removed again) recorded every `<a>` rendered with a `button`, `role=button|option|tab|menuitem`, `a` or `summary` ancestor across the 133 files: before the Movers redesign 4 distinct spots (all Movers rows, in 6 test files), after it none. **Mutation checks** (inject, see red, restore): (1) Movers `bar.funds.length === 1` changed to `>= 1`: 2 tests fail (fundLinks "plain text for several funds", MoverRow tile data-view); (2) `FundLink` `inClickableRow` without the click `stopPropagation`: 5 tests fail in `fundLinks.test.tsx` and `FundLink.test.tsx`; (3) Worth a look `reviewable = true`: 1 fails (the cost card must stay greyed); (4) overlap `CommonHoldings` link given `f.scheme_name` instead of `f.scheme_id`: 1 fails. All four caught; sources restored and compared byte for byte. Step 0 state: tsc 6 error lines (all in test files, the list above); features 22 failed files / 52 failed tests; shell, kit unchanged. File map: **2 new source files, 18 edited** (about 140 lines added, 50 removed).
**Unverified:** no browser pass (the page was not opened on a running backend, light and dark, or at narrow widths: the Movers open button's focus ring and the row hover were not seen); screen reader behaviour is covered by role and nesting assertions only; the greyed "Coming soon" look comes from `AppLink` and is checked by the tests on the shared component, not seen; the link colour `var(--c2)` of "Open fund page" is a choice, the tests do not check it; `fireEvent` does not turn Enter on a focused button into a click, so "Enter on the open button opens the popup" rests on the browser default (a click event) and is not simulated.

## 7. Gemini prompt (paste into the Gemini window for folder `W:\home\ayush\wt\if-fe`)
**SYNC FIRST (owner runs this once, before pasting; Gemini must not run it).** Order of events: (1) IF-D is merged into `leapswitch-redesign`; (2) the orchestrator folds the two uncommitted test edits into the IF-E red commit, rebases `feat/if-links` onto the new tip (`git -C "C:\Users\Dell\Desktop\MVP v1\wt\IFE" rebase --onto origin/leapswitch-redesign f8db102e feat/if-links`; the red commit is the only commit that moves, its message stays `test(individual-fund): failing tests for the fund-page entry points (IF-E)`), re-runs Step 0 there, and pushes it (`git -C "C:\Users\Dell\Desktop\MVP v1\wt\IFE" push -u origin feat/if-links`) together with this packet. Then, in WSL (`wsl.exe -d Ubuntu`), switch the same worktree to the new branch (the earlier work there is committed, the installed packages stay):
```
git -C /home/ayush/wt/if-fe status --short                               # must print nothing (anything listed must already be on origin; otherwise stop and ask the orchestrator)
git -C /home/ayush/wt/if-fe fetch origin
git -C /home/ayush/wt/if-fe log --oneline -3 origin/feat/if-links        # top must be: test(individual-fund): failing tests for the fund-page entry points (IF-E); then 66c4f2aa (docs: orchestrator handoff 6)
git -C /home/ayush/wt/if-fe switch -c feat/if-links --track origin/feat/if-links
git -C /home/ayush/wt/if-fe branch --show-current                        # must print: feat/if-links
git -C /home/ayush/wt/if-fe status --short                               # must print nothing
```
If `switch` refuses (a leftover local change), do not force it: use the replace procedure of the IF-C packet (move `frontend/node_modules` out, `git -C /home/ayush/wt/docs worktree remove --force /home/ayush/wt/if-fe`, `git -C /home/ayush/wt/docs worktree add /home/ayush/wt/if-fe -b feat/if-links --track origin/feat/if-links`, move `node_modules` back).
```
You are the front-end builder for the Unifolio UI redesign. Open the folder W:\home\ayush\wt\if-fe (WSL path /home/ayush/wt/if-fe, branch feat/if-links). Before anything else run `git status --short` and `git log --oneline -3` inside WSL; the first must print nothing and the top commit must be the red-test commit the packet names (test(individual-fund): failing tests for the fund-page entry points (IF-E)), sitting on 66c4f2aa (IF-D is not in this base, by owner decision). If not, STOP and report; do not fix it yourself. Read, completely and in order, Docs/orchestration/ui-redesign-IF-E-fund-links-packet.md (also at W:\home\ayush\wt\docs\Docs\orchestration\ui-redesign-IF-E-fund-links-packet.md). It is the whole truth for this run: do Step 0 first and report its outputs, then follow every step, rule and checkpoint exactly. The tests are already committed (red); you create the 2 source files and edit the 18 source files the packet names, exactly as specified (the two FundLink components, the Home Movers row and popup, news popup and Worth a look link, the Mutual Funds cards and the Fund Details popup, and the Portfolio Quick Insights line). Never edit a test or a fixture, never touch any other file, never run npm install, never commit, never put a link inside a button or an element with a role, never build an address by hand (only AppLink and paths), never import another feature, never touch the Home greeting, never link a place the packet does not list. Run every command inside WSL (wsl.exe -d Ubuntu --cd /home/ayush/wt/if-fe ...) and never run two vitest or tsc commands at once. If a findBy times out in a file you did not touch, or portedFlow.test.tsx fails on a long run, re-run that file alone with --maxWorkers=4 before you report it. When done, send the report in the packet's report template with real command outputs. If anything differs from the packet, stop and report it.
```
