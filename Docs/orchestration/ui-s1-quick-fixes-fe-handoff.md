# Handoff: ui-s1 quick fixes, frontend (tasks 1.2, 1.3, 1.4 and the frontend test of 1.1)

**Status:** WITHDRAWN (replaced by `ui-s1-fe-packet.md`, red tests committed first). **Worker:** Antigravity. **Rules:** `Docs/orchestration/ui-common-rules-antigravity.md`. **Plan:** `Docs/orchestration/2026-11-02-ui-round-2-and-auth-redesign-implementation-plan.md`, Stage S1. Spec sections `c1`, `c2`, `c4`, `c7` of `2026-11-02-auth-redesign-plan.html` (only if you need a mockup).

**Work only in** `C:\Users\Dell\ui-r2-fe` (synced to `68f761bd`). Never in `wt/docs`. This head includes the manager's Run 7 task 7.1 (fund logos), which changed `TopPairs.tsx`, `TopPairs.test.tsx` and the Home movers. **Keep the logos.** Run 7 is not finished: the green token, the one-heading-per-card change and the benchmark info icon are not in yet, so do not build on them.

**Checks (WSL is set up here).** Edit in the clone, then run, one command per check:
```
wsl.exe -d Ubuntu -- env CR6_SRC=/mnt/c/Users/Dell/ui-r2-fe/frontend CR6_DST=/home/delladiti/ui-r2-fe-chk bash /mnt/c/Users/Dell/ui-r2-fe/Docs/orchestration/cr-r6-fe-check.sh test <paths under src/>
```
Replace `test <paths>` with `types`, `lint` or `build` for the other checks.

## Order and scope
Do the tasks one after the other, in this order. Read the plan task text first; it holds the interfaces and the test names. This file only adds what the plan leaves open.

1. **Task 1.2** (Category column). As in the plan. Search the export path of `HoldingsTable.tsx` and use `categoryLabel` there too.
2. **Task 1.4** (Which member? pop-up). As in the plan.
3. **Task 1.3** (Overlap pairs link to the comparison). As in the plan, with these answers to its open points:
   - **Context for the new page:** reuse `FundPageFrame` exactly as `features/individual-fund/OverlapPage.tsx` does, with `schemeId={fundA}` and `tab="overlap"`, and render `ComparisonState` inside it with `key={`${ctx.schemeId}:${ctx.scope}`}`. Do not add a prop to `FundPageFrame`. The page then shows fund A's header and tabs. That is accepted. Say in the report how it looks in code, since you cannot see it.
   - **Back:** `backLabel` default stays the current text. The new page passes `backLabel="Back to Overlap"` (the plan's text: back to the portfolio overlap page) and `onBack` goes to `paths.mutualFunds.overlap()`.
   - **Limit check:** read `fundPageApi.overlapCompare` in `features/individual-fund/api.ts` (it calls `fund-page/{A}/overlap/{B}?scope=`). You cannot read the backend. **Do not stop on this.** Say in the report that the orchestrator must check that the endpoint accepts two portfolio funds.
4. **Task 1.1, frontend part only.** One Home page test: `greeting heading changes when the selected member changes`. Mock two summaries with different `display_name`, switch the scope, assert the heading. Add it to the existing Home page test file. If it fails because the Home page does not refetch on scope change, fix the dependency list so it keys on `scopeKey`. The backend change for 1.1 is **not yours** (Codex does it).

**Not in this handoff:** Task 1.5 (waits for Run 7).

## Constraints that matter here
- No new dependency. No `package.json` change. Edits outside the plan's Files lists: list them in the report.
- Plain words on screen. No em-dashes. Names, never a guessed pronoun.
- Mobile unchanged.
- Run `types`, `lint` and the touched tests after each task. Run `npx vitest run src/shell src/features/mutual-funds src/features/individual-fund src/features/home` equivalents through the script at the end.

## Done when
Every test the plan names for 1.2, 1.3, 1.4 and the one Home test exists and passes; `types` and `lint` are clean; the report follows the rules file's block.
