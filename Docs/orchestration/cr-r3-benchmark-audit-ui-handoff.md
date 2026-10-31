# Handoff: Benchmark screens (T3.5)

**Status:** OPEN (IN REVIEW when Codex reports, DONE after the Run 3 review gate)
**Run:** 3 of 7 | **Slug:** `cr-r3-benchmark-audit-ui` | **Commit prefix:** `cr-r3:` | **Tasks:** T3.5
**Order:** After T3.3 and T3.4 (needs the new payload fields).
**Rules:** `Docs/orchestration/cr-r3-common-rules.md` (read first), then `cr-r2-common-rules.md`. **Task text (authoritative):** plan, the task sections named above (Files, Interfaces, Step 1 test names, Step 3, Verify).

## Notes
- Files in `frontend/.../performance/` and the Individual Fund benchmark block. Each opened row names the benchmark and its source with the plan's plain labels, shows window start dates on the chips, and a short method note; funds with no benchmark show "No benchmark"; `SchemeLogo` on rows. Old payloads without a source render as before.
- `guards.test.ts`: only its count and expected-file list may change, never a rule. No visual check is possible here; say so in the report.
