# Handoff: Consolidated holdings in the holdings service (T4.1)

**Status:** OPEN (IN REVIEW when Codex reports, DONE after the Run 4 review gate)
**Run:** 4 of 7 | **Slug:** `cr-r4-consolidation-backend` | **Commit prefix:** `cr-r4:` | **Tasks:** T4.1
**Order:** First in Run 4; T4.2 (frontend) consumes its payload.
**Rules:** `Docs/orchestration/cr-r4-common-rules.md` (read first). **Task text (authoritative):** plan, "Task 4.1" (Files, Interfaces, Step 1 test names, Step 3, Verify).

## Notes
- Verify with `portfolio_synthetic_gate.py` on the synthetic family set (`Docs/CAS Files/synthetic/pdfs/`, password MF@123) and report the parent/child figures for one fund held by two members, hand-checked.
- Report the exact shape of `consolidated` (parent and child fields) so T4.2 can consume it; do not rename existing fields.
