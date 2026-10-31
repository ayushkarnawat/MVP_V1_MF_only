# Handoff: Remove Stock Concentration from every screen (T1.5)

**Status:** DONE (31 Oct 2026; Run 1 review gate passed after two fix rounds, commits 04d3834c, 61d1f0c1, 7f94e5ef)
**Run:** 1 of 7, plan `Docs/superpowers/plans/2026-10-31-change-requests-implementation-plan.md` (the final plan, Revision 3, 31 Oct 2026)
**Slug:** `cr-r1-remove-stock-concentration`  **Commit prefix:** `cr-r1:`  **Worker:** Codex (`codex:codex-rescue`); **orchestrator:** Claude (writes this document, verifies, commits, reviews)
**Parallel with:** none except T1.5b. Runs last of T1.1 to T1.5 (after T1.4: both edit `OverlapPage.tsx`)

## How to work (read first)
1. Read `AGENTS.md`, then the plan's **Global Constraints**, **Review Focus** and **Method** sections. They bind every task.
2. Work in the Codex clone `~/cr-run-1` (native filesystem), never on the Windows drive. Run the cheap probe first (write, `git add`, `git commit` a one-line file); if Git writes fail, implement and self-check only and leave staging and commits to the orchestrator.
3. Cycle per task: write the failing tests named below first; run them and confirm they fail for the stated reason; implement the stated signatures; run the task's test files until green; report the diff summary and the exact commands and outputs. Do not edit files outside the **Files** list without asking.
4. Backend tests: `cd backend && .venv/bin/python -m pytest <files>` (run in WSL). Frontend: `cd frontend && npx vitest run <files>`, then `npm run build` and `npm run lint` once at the end of the run. No live network in tests.
5. Plain words: every label added to a screen must be understood by a first-time investor at a glance (no "TRI", "proxy", "fallback", "excluded: no data").
6. Ask the orchestrator before assuming anything the plan marks open. Do not touch SIP logic, LinkedIn, CAS import, or anything in the plan's **Untouched** list.

## Scope (copied from the plan, authoritative)

### Task 1.5: Remove Stock Concentration from every screen (item 6)

**Files:** Modify `frontend/.../overlap/OverlapPage.tsx`; delete `overlap/StockConcentration.tsx`, `StockConcentration.test.tsx`, its link helper; modify `features/analytics/OverlapSection.tsx`, `features/analytics/print/PrintAnalyticsView.tsx`, `mobile/features/analytics/MobileAnalyticsView.tsx`, the fixtures and tests that name it. Test `OverlapPage.test.tsx`, legacy analytics tests.

**Interfaces:** None. Backend untouched.

- [ ] **Step 1: Failing tests.** `overlap_page_has_four_cards_and_no_stock_concentration`; `legacy_overlap_section_no_longer_renders_concentration`; `print_and_mobile_views_render_without_it`; `home_worth_a_look_still_renders_its_concentration_card` (it reads stored holdings, not this field); `payload_with_and_without_the_curve_fields_still_parses`.
- [ ] **Step 3: Implement** by deleting the card, its link helper and the legacy blocks; keep the Holdings All Stocks table.
- Verify: frontend suites for overlap and analytics; `npm run build`.

## Done means
All tests named above pass; the task's verify command passes; `git diff --stat` shows only the listed files; the orchestrator has re-run the touched-area tests and read the diff; the Run 1 review gate (`/codex:adversarial-review` over `<start commit>..HEAD`, dispatched in the background; the owner types `/codex:status <id>` and `/codex:result <id>`) has no unresolved high or medium finding.
