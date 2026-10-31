# Run 3 common rules (every `cr-r3-*` handoff points here)

Run 3 of 7: Benchmarks and switches (items 11, 12). Plan: `Docs/superpowers/plans/2026-10-31-change-requests-implementation-plan.md`, section "Run 3". Commit prefix `cr-r3:`. Everything in `Docs/orchestration/cr-r2-common-rules.md` applies unchanged (setup, method per task, Run 1 lessons, report format, gate), with these changes:
- Clone `~/cr-run-1`, synced by the orchestrator to the Run 2 end (`cr-run-2-done` plus T2.11). Codex never runs `git add` or `git commit`.
- **Migration 0049** is created in T3.1 and **edited in place** by T3.2 and T3.3 (tables `benchmark_index_master`, `scheme_benchmark`, later its `printed_return_*` columns). It is not applied to any shared database before Run 3's gate. **No 0051 is created.** Postgres up and down must work.
- `benchmark_index_history.index_name` (part of the primary key, a Postgres enum extended by 0045) becomes a text key in 0049 (Postgres and SQLite). Typed code that must follow: see the plan's T3.1 "Typed code that must change with the column".
- **The legacy stored `benchmark_funds` section and `_benchmark_index_for_category` do not change** (D12): the legacy UI, print and phone read them. New behaviour lives in new functions used only by the new fund-page and Performance surfaces.
- **Plain words:** no user-visible string contains "TRI", "proxy" or "fallback". Source labels shown to users are the plan's exact strings (T3.1b).
- No network in tests. Real index data and factsheets are never committed. SIP fixes are on hold and absent.
- Known baseline failures: 5 backend tests need the missing local `backend/.cache/amfi_navall/nav_all.txt`. The 2 `test_benchmark.py` "switches" failures were a date bug that only fires on the 31st of a month (`date.today().replace(month=month-1)`); if they fail, say so rather than fixing unless asked. One load-flaky frontend test (`OverviewPage.test.tsx`) and the news-focus test.
- Order: T3.1, T3.1b, then T3.2 and T3.3, T3.4, T3.5, T3.6 (after T3.5), T3.7 gate (orchestrator).
