# Handoff: Include-switches control and Net invested label (T3.6)

**Status:** OPEN (IN REVIEW when Codex reports, DONE after the Run 3 review gate)
**Run:** 3 of 7 | **Slug:** `cr-r3-switches` | **Commit prefix:** `cr-r3:` | **Tasks:** T3.6
**Order:** Last frontend task of Run 3, after T3.5 (shares `types.ts` and the `performance/` folder).
**Rules:** `Docs/orchestration/cr-r3-common-rules.md` (read first), then `cr-r2-common-rules.md`. **Task text (authoritative):** plan, the task sections named above (Files, Interfaces, Step 1 test names, Step 3, Verify).

## Notes
- No backend change: consumes `total_switched_in`, `total_switched_out`, `switch_count` from `investment_withdrawal`. Net invested and absolute gain never change with the control. Print stays excluded (a test asserts it). The Performance tile is renamed "Net invested".
- The control's visible words ("Switches: Included" / "Excluded") must match its aria state; no switches shows "none" and a disabled control.
