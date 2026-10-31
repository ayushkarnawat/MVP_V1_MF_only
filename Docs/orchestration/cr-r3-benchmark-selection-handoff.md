# Handoff: Benchmark selection, printed returns, audit (T3.3, T3.4)

**Status:** OPEN (IN REVIEW when Codex reports, DONE after the Run 3 review gate)
**Run:** 3 of 7 | **Slug:** `cr-r3-benchmark-selection` | **Commit prefix:** `cr-r3:` | **Tasks:** T3.3, T3.4
**Order:** After T3.2. T3.3 adds the `printed_return_*` columns to 0049 in place.
**Rules:** `Docs/orchestration/cr-r3-common-rules.md` (read first), then `cr-r2-common-rules.md`. **Task text (authoritative):** plan, the task sections named above (Files, Interfaces, Step 1 test names, Step 3, Verify).

## Notes
- `benchmark_for_scheme` is NEW and used only by the new fund-page and Performance surfaces. `_benchmark_index_for_category` and the stored `benchmark_funds` section stay unchanged (a golden test pins the legacy output). A portfolio mixing equity and debt funds must give the same aggregate as before.
- Printed returns appear only in the fund page's returns table; charts, beta, peers, rolling returns, Home wealth chart and XIRR comparison use a daily series only. A test asserts charts and XIRR never read printed returns.
- T3.4: golden tests against a hand spreadsheet to the paisa, plus the read-only `benchmark_diff_report.py` (prints counts and differences only, no names or amounts).
