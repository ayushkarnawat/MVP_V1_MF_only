# Handoff: Per-fund valuation and the Valuation by Fund screen (T2.3, T2.4)

**Status:** OPEN (IN REVIEW when Codex reports, DONE after the Run 2 review gate)
**Run:** 2 of 7 | **Slug:** `cr-r2-valuation-compute-ui` | **Commit prefix:** `cr-r2:` | **Tasks:** T2.3, then T2.4
**Order:** After T2.2 (consumes `SchemeReportedValuation`). T2.4 after T2.3.
**Rules:** `Docs/orchestration/cr-r2-common-rules.md` (read first). **Task text (authoritative):** `Docs/superpowers/plans/2026-10-31-change-requests-implementation-plan.md`, the task sections named above (Files, Interfaces, Step 1 test names, Step 3, Verify).

## Notes
- Backend files: `valuation.py`, `schemas.py`, `stock_fundamentals_client.py` (date label only). Tests: `test_valuation.py`, `test_stock_valuation_isolation.py`, then the full `tests/services/analytics` (this changes a stored section that Home, the fund page and Insights read: grep `valuation` consumers first and list them in the report).
- Rules that are easy to get wrong: a factsheet figure counts only if it is the latest and at most 75 days old on the NAV date; a fund below 70% coverage shows no value and a reason; **the portfolio total uses one basis** (D39 B: a forward factsheet P/E is replaced by the computed trailing value in the portfolio total only; the fund row still shows the printed figure with its basis); portfolio P/E and P/B are the value-weighted **harmonic** mean (hand-compute one golden case in a comment); `pe_as_of` / `pb_as_of` fix the date label; overseas holdings are counted separately, not missing. The stored shape is additive.
- Frontend (T2.4, folder `frontend/src/features/mutual-funds/other/`): create `ValuationByFund.tsx`; modify `CostValuationGroup.tsx`, `ValuationSpectrum.tsx`, `types.ts`. Match the item 7 mockup named in the plan; `SchemeLogo` on every fund; source labels exactly "Factsheet", "Factsheet fwd", "NSE/BSE"; the two excluded lists closed by default with a count; the harmonic-mean disclaimer in plain words. A payload without `funds` renders the existing section only.
- `guards.test.ts` (`mutual-funds/`): the new file changes its file count and expected-file list (count and list only). Report that diff separately.
