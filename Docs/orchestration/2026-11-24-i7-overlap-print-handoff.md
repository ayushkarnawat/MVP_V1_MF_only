# Handoff: i7-overlap-print (Batch I, task I-7 step 2: print versions of the Overlap group sections, Codex)
**Status:** READY TO RELAY after the print foundation is committed (written 2026-11-24). Milestone M4. **Common rules for all six print group tasks: `Docs/orchestration/2026-11-24-print-groups-common.md` (read it first, fully).** Findings and decisions: `Docs/orchestration/2026-11-24-print-audit.md` (option C).
**Worker:** Codex, front end only. **Reviewer, test runner and committer:** Claude.
**Work in:** `C:\Users\Dell\lanes\unifolio-i7-overlap-print` (a new worktree, branch `batch/i7-overlap-print`, cut from the foundation branch `batch/i-fe`). **Open it in Codex as a NEW project.** Never in the main project folder.
**Section ids in this task:** overlap-common-holdings, overlap-heatmap, overlap-top-pairs, overlap-impact.

## The sections (audit: "Overlap"; sample pages 33 to 35)
Note: the cards carry number prefixes ("1. Common Holdings", ...) that the section list lacks; the contents use the **section list's** titles, and each card keeps its own heading as on screen.
1. **overlap-common-holdings (LIGHT).** `overlap/CommonHoldings.tsx`: shows 10 rows with "View all common holdings", per-row expand, "Top Funds" shows 3 chips then "+N". Print: **all rows** (decision: all; the sample shows 20), no chevrons/toggle, **list every fund in the cell** instead of "+N" chips, no scroll wrapper.
2. **overlap-heatmap (HEAVY).** `overlap/Heatmap.tsx` + `PairDetail.tsx`: an HTML table of 44 px cells up to **12 funds** (about 690 px, wider than the 680 px root), cell identity by logo or initials only, full name in a tooltip, cells are buttons, a pair detail panel beside it (`max-h-80` scroll). Print: a static heatmap whose **cell size scales so 12 funds fit 680 px**, **a fund-name key** (initials or number to full fund name) because tooltips do not print, the legend, no buttons; below it **the strongest pair's shared stocks** as a plain list (no scroll cap, stacked vertically): the screen preselects the highest pair, print the same one.
3. **overlap-top-pairs (LIGHT).** `overlap/TopPairs.tsx`: 5 shown with "View all fund overlaps", fund names truncated at `max-w-[200px]`, buttons and "View more" links per row, a "Key insights" text box. Print: **all pairs, capped at 15 with a "showing 15 of N" note when more** (decision: the old print page's cap; up to 66 pairs exist at 12 funds), **no name truncation**, no buttons or "View more" column, the **key insights text printed**.
4. **overlap-impact (LIGHT).** `overlap/ImpactDonut.tsx`: a donut that **defaults to the "top 3" slice popped out and the centre showing that slice**. Print: pass **no selection** (`selectedKey={null}`, `activeKey={null}`) so it prints flat with the portfolio total in the centre, a static legend (percent and value), and the **"What drives the overlap" text** printed.
**Printed where the screen places them (inside the entry of the section they belong to):** the `CoverageBanner` and the "Funds not shown" note. The overlap view tabs ("All funds"/"By category") print "All funds". **Left out of this task:** the Overlap `StatStrip` (four boxes): mention it in the report.

## Files you may touch
`frontend/src/print/groups/overlapPrint.tsx`, a new folder `frontend/src/print/groups/overlap/` (components and **all your tests: `overlap.print.test.tsx` there**), edits inside `frontend/src/features/mutual-funds/overlap/*.tsx` (not tests) only to add `usePrintMode()` branches. **Do not touch** `common/charts.tsx` (shared), other groups, the registry.

## Paste-ready prompt
```
Front-end worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-24-print-audit.md (the findings per section)
4. Docs/orchestration/2026-11-24-print-groups-common.md (rules common to all print group tasks: read it fully)
5. Docs/orchestration/2026-11-24-i7-overlap-print-handoff.md (your task: Overlap group)
Open this folder in Codex as a NEW project: C:\Users\Dell\lanes\unifolio-i7-overlap-print (branch batch/i7-overlap-print, already created from the foundation branch). Git is read-only. No deletion flags or recursive deletes. Write the tests first, then the code; touch only the files the task lists; register only your group's sections in your own group file; do not change shared chart components. Screens must behave exactly as today outside print mode, and every existing test must pass untouched. You cannot run the tests; do not try, and do not change any config. Re-read your code against the tests.
Reply with the CODEX REPORT block from the common rules, nothing else.
```
