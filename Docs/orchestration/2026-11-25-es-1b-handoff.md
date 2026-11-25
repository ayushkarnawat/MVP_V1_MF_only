# Handoff: es-1b (PDF export timing log; finish Task ES-1: the code; Codex, lane BE)
**Status:** READY TO RELAY (written 2026-11-25). **Parent:** `Docs/orchestration/2026-11-25-es-1-handoff.md` (read it first: the contract, the privacy rule, what must not change; all unchanged and still apply). Plan `Docs/superpowers/plans/2026-11-25-export-speed-plan.md` (Task ES-1).
**Worker:** Codex, backend only. **Its sandbox cannot run these tests at all (PermissionError on `C:\tmp` in the fixtures): write the code carefully and do not try to run anything; reply BLOCKED on running. Claude runs them.** **Reviewer and committer:** Claude.
**Work in:** `C:\Users\Dell\lanes\unifolio-es-be` (worktree, branch `batch/es-be`, **reuse**; it holds the new, uncommitted `test_export_timing.py` from es-1). Never in the main checkout.
Read first: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md`, then this file.

## State (Claude ran the tests on 25 Nov)
`tests/services/export/test_export_timing.py` (yours from es-1): **13 failed, all red for the right reason** (no `export timing:` line is logged yet). Do not change that file. The existing `tests/services/export/` baseline is 10 failed, 99 passed, 2 skipped (the 10 fail before any change: environment, not yours).

## What to build
Exactly the contract of `es-1-handoff.md`: `backend/app/services/export/timing.py` (`ExportTimings`, `log_fields()`, a `None` value prints as `-`) and the marks, the `contents_outcome` and the **one extra log line** in `run_export`'s `finally`, right after the unchanged `export finished: ...` line: `export timing: <log_fields> pdf_bytes=<n>`. Your es-1 decisions are accepted: `browser_start_ms` stays `None` (prints `-`) and `proxied_requests` is omitted (the line has `pdf_bytes` only). Mark `slot_wait_ms` as the time from just before `async with acquire_browser(...)` to the first statement of its body.

## Two existing tests must change, narrowly (the extra line is the whole point of the task)
In `tests/services/export/test_render.py`, `test_the_log_line_has_only_counts_and_durations` (~L325) and `test_log_line_reports_two_pass_and_nothing_else_new` (~L453) both assert `len(lines) == 1` over **all** `render` log records. Change each to keep only the records whose message starts with `export finished:` before asserting (`finished = [l for l in lines if l.startswith("export finished:")]`, then `len(finished) == 1` and use `finished[0]`). Everything else in both tests stays. Do not touch any other existing test. Report these two in "existing tests changed".

## Files you may touch
Create `backend/app/services/export/timing.py`; modify `backend/app/services/export/render.py` (marks, outcome variable, the one log line) and the two named tests in `backend/tests/services/export/test_render.py`.
**Do not touch:** `test_export_timing.py`, any other file.

## Constraints
No behaviour change; additive only; no migration (Alembic 0054); no new dependency or setting; invented data only; git read-only; no deletion flags or recursive deletes; Windows-safe.

## Report format
One fenced block `CODEX REPORT: es-1b`: status; files and functions changed with a one-line reason each; the two existing tests changed (before and after); `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-25-es-1-handoff.md (the contract, read first)
4. Docs/orchestration/2026-11-25-es-1b-handoff.md (your task: es-1b, owner-approved)
Work only in C:\Users\Dell\lanes\unifolio-es-be on branch batch/es-be (reuse; it holds your es-1 test file). Git is read-only. No deletion flags or recursive deletes. You cannot run these tests in your sandbox: do not try; write the code carefully and reply BLOCKED on running (Claude runs them). Change only the files the handoff lists.
Reply with the CODEX REPORT block from the handoff, nothing else.
```
