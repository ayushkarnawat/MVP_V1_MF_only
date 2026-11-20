# Handoff: d9-popup-red-tests (Batch D, task D-9: red tests for the "View all by day's change" pop-up, front end, Codex)
**Status:** READY TO RELAY (written 2026-11-20). **Approved by the owner on 19 Nov 2026** (Batch D). The backend it talks to (D-8) is built and verified (`e9300cee`).
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-d-charts-plan.md` (Tasks D-9, D-10, D-11; "Global Constraints" and "Review Focus"). **Spec:** `Docs/orchestration/2026-11-13-batch-d-planning-workbook.html`, item 15 and **section 4** (the eleven stages). The workbook is the design; if the workbook and the plan or the code disagree, stop and say so.
**Worker:** Codex writes tests and the type-only additions below. **It cannot run the front-end checks (its sandbox is refused WSL), so it reports BLOCKED on running; Claude runs them and confirms each new test is red for the stated reason.** Antigravity builds the pop-up later (D-10) against these tests.
**Work in:** `D:\unifolio-d-popup` (a new worktree, branch `batch/d-popup`, cut from `batch/d-charts` after the D-8 merge `d3df4be5`; separate from the D-4 worktree so the two Codex tasks cannot touch each other's files). Never in `D:\Unifolio code`. Stop if `git log` there does not show the D-8 merge.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## What exists
- `frontend/src/features/home/sections/Movers.tsx`: the card, with an **inline one-row panel** (`role="dialog"`, label "<row> funds") and a **disabled** "View all by day's change" link (`aria-disabled`, title "Coming soon"). `fundLinks.test.tsx` line about 266 asserts the disabled state today; D-11 will change that one assertion, so write it into the new tests as the new truth and leave a note, but do not edit `fundLinks.test.tsx`.
- Backend (D-8): `GET .../home/movers?by=<view>&all=true` returns the card's `MoversResponse` fields plus `rows: MoverAllBarOut[]` (`key, label, change, funds[], no_change`) and `waiting_for_price: MoverWaitingOut[]` (`fund_id, name, category`); on a closed market `rows` is empty and the reply carries the latest price date. Read `backend/app/services/home/{movers.py,schemas.py}` for the exact fields.

## The interface the tests are written against (decided here; do not invent another)
```ts
// types.ts (type-only additions; no runtime code)
export interface MoverAllBarOut extends MoverBarOut { no_change: boolean }
export interface MoverWaitingOut { fund_id: string; name: string; category: string }
export interface MoversAllResponse extends MoversResponse { rows: MoverAllBarOut[]; waiting_for_price: MoverWaitingOut[] }

// new file components/DayChangeDialog.tsx (the tests import it; it does not exist yet, so they are red)
export interface DayChangeDialogProps {
  open: boolean;
  onClose: () => void;                      // Escape, the cross and an outside click all call it once
  initialView: MoversView;                  // the card's grouping when the link was clicked
  card: MoversResponse;                     // net change, percent and gained/lost totals are copied from it at once
  loadAll: (view: MoversView) => Promise<MoversAllResponse>;  // one call per view; a view already fetched is reused
  hideValues: boolean;
}
// Movers gains two optional props: loadAll?: same type as above; hideValues?: boolean
```
If a stage in workbook section 4 cannot be shown from this data (for example the category view needs a per-fund category the route does not give), **do not invent**: write the test as `it.todo` with the reason and list it under Open questions.

## Tests (write only these; invented data; fixtures under `frontend/src/features/home/fixtures/` named `movers_all_*`; type-check clean apart from the missing component import)
In new `components/DayChangeDialog.test.tsx` and `sections/Movers.test.tsx` (append, assertions of existing tests untouched), one test per stage:
1. `opens at once with net change and totals copied from the card and a placeholder list` (stage 2)
2. `fund view: gainers then losers largest first, collapsed "No change" group` (3)
3. `category view reuses fetched rows, no new request` (4)
4. `category row opens its funds` (5)
5. `sector view shows the Estimated badge and the estimate footer` (6)
6. `waiting funds are listed apart with the clock mark, never as zero, with a Partial badge` (7)
7. `the no-change group opens` (8)
8. `markets closed shows the message with the latest price date` (9)
9. `an error keeps the summary and offers Try again, which repeats the fetch` (10)
10. `hide values turns rupees into dots and leaves percentages` (11)
11. `Escape, the cross and an outside click close it; focus is trapped inside and returns to the link`
12. `the existing one-row panel is untouched`
13. (Movers) `the link is live`, `all rows are fetched only when the dialog opens`, `the card request is unchanged` (D-11's tests, written now, red until D-11)

## Run these only (Claude runs them; Codex cannot)
`wave-fe-check.sh dp test src/features/home` through WSL from the orchestrator. Codex: write the tests, run nothing, report BLOCKED on running.

## Files you may touch
New `frontend/src/features/home/components/DayChangeDialog.test.tsx`; append to `frontend/src/features/home/sections/Movers.test.tsx`; new fixtures `frontend/src/features/home/fixtures/movers_all_*.json` (check how `fixtures/index.ts` registers them and follow it); type-only additions to `frontend/src/features/home/types.ts`. **Do not touch** any component, `api.ts`, `HomePage.tsx`, any other test, backend, config.

## Constraints
Invented data only (no real fund holdings of a person). No network. No new dependency. Git read-only. No deletion flags or recursive deletes. Colours are not tested here (the packet and screenshots cover them).

## Report format
One fenced block `CODEX REPORT: d9-popup-red-tests`: status; baseline HEAD; drift; the list of tests with the stage each covers and why it is red; any `it.todo` with its reason; files created or changed; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Front-end test writer for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-20-d9-popup-red-tests-handoff.md (your task: D-9, owner-approved)
Work only in D:\unifolio-d-popup on branch batch/d-popup. Git is read-only. No deletion flags or recursive deletes. Write the tests the handoff lists, exactly against the interface it fixes; touch only the files it names. You cannot run the front-end checks: do not try, report BLOCKED on running. If a stage cannot be shown from the data the route returns, write it as it.todo with the reason; do not invent data or behaviour.
Reply with the CODEX REPORT block from the handoff, nothing else.
```

## Result (orchestrator, 20 Nov, after the Codex report)
Committed in `batch/d-popup` (`D:\unifolio-d-popup`). Run through lane `dp`: the three `Movers` tests are red for the stated reasons (link still disabled; the entry cannot open the dialog or call `loadAll`; the original request without `all`); `DayChangeDialog.test.tsx` is red on the missing component import; every older `Movers` test stays green. **Decisions on Codex's two open questions:** (1) stage 4 (the category view): each view is fetched **once, on its first visit** (`loadAll(view)`), and a view already fetched is reused with no new request; the fund rows carry no category and no backend change is made for it; the `it.todo` became the real test "a view is fetched once on its first visit and reused after that". (2) The synthetic pop-up data stays **inline in the test files** (typed objects), not as root-level `movers_all_*.json`, because the golden-fixture guard counts every JSON in that folder against the backend-generated set. The view switch is a group named "Group by" with the buttons Sector, Category, Fund (same as the card). D-10 (Antigravity) builds the component to these tests.
