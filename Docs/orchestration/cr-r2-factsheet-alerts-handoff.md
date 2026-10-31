# Handoff: Missed-month alert for the hand-import houses (T2.2b)

**Status:** OPEN (IN REVIEW when Codex reports, DONE after the Run 2 review gate)
**Run:** 2 of 7 | **Slug:** `cr-r2-factsheet-alerts` | **Commit prefix:** `cr-r2:` | **Tasks:** T2.2b
**Order:** After T2.2 (both touch `amfi_factsheet_client.py`).
**Rules:** `Docs/orchestration/cr-r2-common-rules.md` (read first). **Task text (authoritative):** `Docs/superpowers/plans/2026-10-31-change-requests-implementation-plan.md`, the task sections named above (Files, Interfaces, Step 1 test names, Step 3, Verify).

## Notes
- Files: create `backend/scripts/jobs/check_manual_factsheets.py`; helper `stale_manual_houses(db, today)` in `app/services/analytics/amfi_factsheet_client.py`; one line in `deploy/leapswitch/crontab.leapswitch` (`0 6 15 * *` Asia/Kolkata like its neighbours; **installing the crontab is the owner's deploy step, not yours**). Match the existing crontab line style (variables like `$CHECK_DISK`); read the file first.
- "Registry MANUAL" means `ResolverKind.MANUAL`. The ten hand-import houses are in `fund_manager_resolvers.py`; **houses imported with `--this-month-only` stay automatic in the registry and are not checked here** (the plan says so; it is a documented limit).
- Alert line format is fixed: `FUND_MANAGER_ALERT amc=<name> reason=manual_import_missing detail=<last import month>`; non-zero exit when any house is overdue. Do not change `_alert` or the existing alert lines.
- A house whose latest `scheme_fund_managers.reference_period` is before the current month is overdue; a never-imported house has `last_import=None`. Layoutless houses are not checked.
