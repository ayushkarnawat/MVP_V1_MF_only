# Handoff: Market cap adds to 100% and Asset class with five slices (T1.1 and T1.2)

**Status:** DONE (31 Oct 2026; Run 1 review gate passed after two fix rounds, commits 04d3834c, 61d1f0c1, 7f94e5ef)
**Run:** 1 of 7, plan `Docs/superpowers/plans/2026-10-31-change-requests-implementation-plan.md` (the final plan, Revision 3, 31 Oct 2026)
**Slug:** `cr-r1-market-cap-asset-class`  **Commit prefix:** `cr-r1:`  **Worker:** Codex (`codex:codex-rescue`); **orchestrator:** Claude (writes this document, verifies, commits, reviews)
**Parallel with:** none except T1.5b. Order for the run: T1.1, T1.2, T1.3, T1.4, T1.5 one after another (shared `schemas.py` and `types.ts`)

## How to work (read first)
1. Read `AGENTS.md`, then the plan's **Global Constraints**, **Review Focus** and **Method** sections. They bind every task.
2. Work in the Codex clone `~/cr-run-1` (native filesystem), never on the Windows drive. Run the cheap probe first (write, `git add`, `git commit` a one-line file); if Git writes fail, implement and self-check only and leave staging and commits to the orchestrator.
3. Cycle per task: write the failing tests named below first; run them and confirm they fail for the stated reason; implement the stated signatures; run the task's test files until green; report the diff summary and the exact commands and outputs. Do not edit files outside the **Files** list without asking.
4. Backend tests: `cd backend && .venv/bin/python -m pytest <files>` (run in WSL). Frontend: `cd frontend && npx vitest run <files>`, then `npm run build` and `npm run lint` once at the end of the run. No live network in tests.
5. Plain words: every label added to a screen must be understood by a first-time investor at a glance (no "TRI", "proxy", "fallback", "excluded: no data").
6. Ask the orchestrator before assuming anything the plan marks open. Do not touch SIP logic, LinkedIn, CAS import, or anything in the plan's **Untouched** list.

## Scope (copied from the plan, authoritative)

### Task 1.1: Market cap adds to 100% (item 3, D8, D21)

**Files:** Modify `app/services/analytics/cap_allocation.py`, `app/services/analytics/schemas.py`, `frontend/src/features/mutual-funds/allocation/MarketCapCard.tsx`, `features/mutual-funds/types.ts`. Test `tests/services/analytics/test_cap_allocation.py`, `MarketCapCard.test.tsx`.

**Interfaces:** Produces additive `percentage_classified: str` on each bucket and `unclassified_share_pct: str` on the section. Old fields and the OTHER row stay (Home reads them).

- [ ] **Step 1: Failing tests.** `test_three_buckets_sum_to_exactly_100_with_unclassified_stocks` (sum of `percentage_classified` over Large, Mid, Small `== Decimal("100.00")`, remainder lands on the last bucket); `test_unclassified_share_reports_the_stock_value_with_no_bucket`; `test_all_equity_unclassified_returns_empty_state_fields` (no NaN, `unclassified_share_pct == "100.00"`); `test_old_fields_unchanged` (golden compare of `percentage_total`, `percentage_equity`). Frontend: `renders three slices and no Other slice`; `shows the note only when unclassified is 0.5 percent or more`; `shows 'Not enough classified equity' when none classified`; `renders a payload without the new fields as the updating state`.
- [ ] **Step 3: Implement** `build_cap_allocation(...)` additions as above; card reads `percentage_classified`, drops the Other slice and legend row, shows the note text "N% of your equity could not be sorted into Large, Mid or Small (for example overseas stocks), so the three slices describe the other M%."
- Verify: `pytest tests/services/analytics/test_cap_allocation.py` and `npx vitest run src/features/mutual-funds/allocation/MarketCapCard.test.tsx`; expected all pass.

### Task 1.2: Asset class with five slices (item 13, D6, arbitrage toggle kept)

**Files:** Modify `app/services/analytics/asset_allocation_lookthrough.py`, `schemas.py`, `app/services/home/allocation.py`, `frontend/.../allocation/AssetClassCard.tsx`, `types.ts`. Test `test_asset_allocation_lookthrough.py`, `tests/services/home/test_allocation.py` (existing or create), `AssetClassCard.test.tsx`.

**Interfaces:** Consumes T1.1 untouched. Produces classes `equity, debt, gold, real_estate, others` in `ASSET_CLASS_MAP`; `reit_invit` to `real_estate`; `cash_equivalent` to `debt`; positive derivative and unclassified rows to `others`; negative derivative lines still excluded and counted in the coverage note; the old `equity_outer` stays in the payload (not drawn).

- [ ] **Step 1: Failing tests.** `test_reit_row_lands_in_real_estate_not_equity`; `test_cash_equivalent_adds_to_debt_and_total_stays_100`; `test_positive_derivative_and_unclassified_rows_land_in_others`; `test_negative_futures_line_is_ignored_and_others_never_negative`; `test_five_classes_sum_to_100_within_rounding`; `test_arbitrage_as_cash_toggle_still_moves_the_whole_fund`; `test_golden_contributing_funds_hybrid_index_arbitrage` (three synthetic funds, hand-computed, includes a negative derivative line); `test_home_allocation_reads_the_five_classes` (Home donut still builds from `asset_allocation`). Frontend: `draws five slices with Others last and grey`; `hides Others at 0 percent`; `clicking Others lists the funds behind it`; `no outer cap ring`; `old payload shows updating state`.
- [ ] **Step 3: Implement** the map change, the Others bucketing and the Home mapping; card shows label "Real Estate (REITs and InvITs)" and the note "Cash is included under Debt".
- **Starting point (code read, 31 Oct):** today `ASSET_CLASS_MAP` has `equity, debt, gold, cash_like`, with `REIT_INVIT` counted as equity and `DERIVATIVE` mapped to `None` (excluded), so "positive derivative rows to others" and "REIT to real estate" are new rules. Read how derivative `pct_to_nav` is signed in stored rows first (the same probe as T1.4) and record it before writing the tests.
- Verify: those test files; expected pass. Hand check: three real funds on staging later (Step 0 / QA).

## Done means
All tests named above pass; the task's verify command passes; `git diff --stat` shows only the listed files; the orchestrator has re-run the touched-area tests and read the diff; the Run 1 review gate (`/codex:adversarial-review` over `<start commit>..HEAD`, dispatched in the background; the owner types `/codex:status <id>` and `/codex:result <id>`) has no unresolved high or medium finding.
