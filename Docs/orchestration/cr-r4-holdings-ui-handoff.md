# Handoff: Family holdings table with split bar and member rows (T4.2)

**Status:** OPEN (IN REVIEW when Codex reports, DONE after the Run 4 review gate)
**Run:** 4 of 7 | **Slug:** `cr-r4-holdings-ui` | **Commit prefix:** `cr-r4:` | **Tasks:** T4.2
**Order:** After T4.1.
**Rules:** `Docs/orchestration/cr-r4-common-rules.md` (read first). **Task text (authoritative):** plan, "Task 4.2".

## Notes
- Files: `frontend/.../overview/HoldingsTable.tsx`, `OverviewPage.tsx`, `types.ts` and their tests. Spacing improvements are in scope (taller rows, padding, second lines on their own line, tinted member rows, sideways scroll on narrow screens, cards on a phone with the expansion inside the card).
- The + button: `aria-expanded`, keyboard operable. One-member funds have no control and no bar. Single-member view keeps today's layout. Old payloads without `consolidated` render today's rows.
