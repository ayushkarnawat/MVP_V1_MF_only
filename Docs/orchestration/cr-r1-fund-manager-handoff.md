# Handoff: Fund manager cards and the main-manager rule (T1.3)

**Status:** DONE (31 Oct 2026; Run 1 review gate passed after two fix rounds, commits 04d3834c, 61d1f0c1, 7f94e5ef)
**Run:** 1 of 7, plan `Docs/superpowers/plans/2026-10-31-change-requests-implementation-plan.md` (the final plan, Revision 3, 31 Oct 2026)
**Slug:** `cr-r1-fund-manager`  **Commit prefix:** `cr-r1:`  **Worker:** Codex (`codex:codex-rescue`); **orchestrator:** Claude (writes this document, verifies, commits, reviews)
**Parallel with:** none except T1.5b. Runs after T1.1 and T1.2 (shared `schemas.py`, `types.ts`)

## How to work (read first)
1. Read `AGENTS.md`, then the plan's **Global Constraints**, **Review Focus** and **Method** sections. They bind every task.
2. Work in the Codex clone `~/cr-run-1` (native filesystem), never on the Windows drive. Run the cheap probe first (write, `git add`, `git commit` a one-line file); if Git writes fail, implement and self-check only and leave staging and commits to the orchestrator.
3. Cycle per task: write the failing tests named below first; run them and confirm they fail for the stated reason; implement the stated signatures; run the task's test files until green; report the diff summary and the exact commands and outputs. Do not edit files outside the **Files** list without asking.
4. Backend tests: `cd backend && .venv/bin/python -m pytest <files>` (run in WSL). Frontend: `cd frontend && npx vitest run <files>`, then `npm run build` and `npm run lint` once at the end of the run. No live network in tests.
5. Plain words: every label added to a screen must be understood by a first-time investor at a glance (no "TRI", "proxy", "fallback", "excluded: no data").
6. Ask the orchestrator before assuming anything the plan marks open. Do not touch SIP logic, LinkedIn, CAS import, or anything in the plan's **Untouched** list.

## Scope (copied from the plan, authoritative)

### Task 1.3: Fund manager cards and the main-manager rule (item 4, D7, D38, D13)

**Files:** Modify `app/services/analytics/fund_manager_allocation.py`, `schemas.py`, `frontend/.../allocation/FundManagerCard.tsx`, `allocation/AllocationPage.tsx`. Test `test_fund_manager_allocation.py`, `FundManagerCard.test.tsx`.

**Interfaces:** Produces `pick_main_manager(rows: list[SchemeFundManager]) -> MainManager` with `MainManager(row: SchemeFundManager | None, assumed: bool, with_others: int)`; each manager group carries `main_source: "marked" | "assumed"`; the equal split (`_split_equally`) is no longer used for the card. No new table, no LinkedIn field.

- [ ] **Step 1: Failing tests** (parametrised on real role strings): `one_manager`; `lead_with_assistants_picks_the_non_assistant`; `none_marked_picks_first_listed_and_marks_assumed`; `two_equal_co_managers_first_listed_assumed`; `equity_portion_manager_is_main_for_equity_oriented_fund`; `debt_portion_manager_is_main_for_debt_oriented_fund`; `only_overseas_or_gold_specialist_listed_is_main_and_assumed`; `future_wef_handover_is_ignored`; `manager_totals_never_exceed_portfolio_value`; `same_person_two_funds_sums_per_fund`; `lead_on_one_fund_assistant_on_another_counts_only_where_main`; `fund_without_manager_data_is_counted_in_the_no_data_line` (staging has seven houses with none: Sundaram, Bajaj Finserv, IL&FS, AlphaGrep, Carnelian, Monarch and Lakshya, about 420 scheme rows); `same_name_two_amcs_are_two_groups`. Frontend: `opens on Cards`; `Table view is today's table`; `no Donut or Bar Chart option exists`; `the sentence about funds divided equally is gone`; `shows assumed marker on assumed managers`; `no LinkedIn icon renders`.
- [ ] **Step 3: Implement** `pick_main_manager` and group totals with the full fund value; replace the Donut and Bar Chart views with Cards and Table; remove the equal-division sentence.
- Verify: those files; the Individual Fund page's manager block tests unchanged and green (`tests/services/fund_page`).

## Done means
All tests named above pass; the task's verify command passes; `git diff --stat` shows only the listed files; the orchestrator has re-run the touched-area tests and read the diff; the Run 1 review gate (`/codex:adversarial-review` over `<start commit>..HEAD`, dispatched in the background; the owner types `/codex:status <id>` and `/codex:result <id>`) has no unresolved high or medium finding.
