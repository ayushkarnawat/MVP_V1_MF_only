# Handoff: d8-movers-all-rows (Batch D, task D-8: the movers route can return every row, backend, Codex)
**Status:** READY TO RELAY (written 2026-11-20). **Approved by the owner on 19 Nov 2026** (Batch D). Runs **at the same time as** `2026-11-20-fx10a2-peer-price-history-handoff.md` (different worktree and files).
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-d-charts-plan.md` (Task D-8; read "Global Constraints" and "Review Focus"). **Spec:** `Docs/orchestration/2026-11-13-batch-d-planning-workbook.html` (item 15: "View all by day's change" opens a pop-up listing every mover; section 4's eleven stages). The workbook is the design; if it and the code disagree, stop and say so.
**Worker:** Codex, backend only. **Reviewer and committer:** Claude.
**Work in:** `D:\unifolio-d-movers` (a new worktree, branch `batch/d-movers`, cut from `batch/d-charts`). Never in `D:\Unifolio code`. (A separate worktree because D-4 edits `services/home/schemas.py` and `api/home.py` too; the orchestrator merges.)
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## Wave-start check (re-check, report drift)
`backend/app/services/home/movers.py`, `schemas.py`, `backend/app/api/home.py` (`_movers`) exist as the plan says; the movers route returns the card's top rows today; the 16 Nov NAV fix (`b231b6f4`) is in the branch.

## The change
- **Old link untouched:** the movers route keeps today's payload for the card **unchanged in every field and size** when called as today. The new behaviour is an **additive query switch** `all: bool = False` on the **same** route (not a second route).
- With `all=true` the response is the same shape plus: (a) **every row** of the chosen grouping (fund, category; the sector view is an estimate and keeps its own footer wording) in the same row shape as today's top rows, zero-change rows included with a flag `no_change: bool`; (b) `waiting_for_price: list[MoverWaitingOut]` with `fund_id`, `name`, `category` for funds that have **no new price today**: they are **listed apart, never shown as zero change, and left out of the net change**; (c) when markets are closed (no changed rows) an empty list **and the date of the latest prices**, not a bare empty list. Add `waiting_for_price` (empty list) to the default reply as an additive field only if it does not change the card payload's existing fields or size assertions (the existing `test_default_reply_unchanged` oracle decides; say what you did).
- **Rows sum exactly to the net change** for the fund and category groupings (`Decimal` strings, exact; the client never adds money).
- One implementation behind the switch.

## Tests first (`backend/tests/services/home/test_movers.py`; invented data, `Decimal`; written and run before the change; red for the stated reason)
`test_default_reply_unchanged` (guard: passes today; the card payload and its size identical); `test_all_rows_sum_to_net_change_for_fund_and_category`; `test_funds_without_new_price_are_listed_apart_and_not_zero`; `test_markets_closed_returns_no_rows_and_latest_price_date`; `test_sector_view_marked_estimated`; `test_decimals_are_strings_exact`.

## Run these only
```
cd backend
"D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest tests/services/home/test_movers.py tests/api/test_home_routes.py -v
```
(Adjust the second path to the existing Home route tests and say which.) If the sandbox stalls at asyncio start-up, report BLOCKED with the exact error; still write the change and the tests; the orchestrator runs them.

## Files you may touch
`backend/app/services/home/movers.py`, `backend/app/services/home/schemas.py`, `backend/app/api/home.py` (only `_movers` and the movers route's query parameter), `backend/tests/services/home/test_movers.py`. **Do not touch** the wealth-series code, `frontend/**`, other `app/**`, existing tests' assertions, migrations.

## Constraints
`Decimal` only, as strings in the response. No network. Invented data only. No new dependency. Git read-only. No deletion flags or recursive deletes.

## Report format
One fenced block `CODEX REPORT: d8-movers-all-rows`: status; baseline HEAD; drift; which new tests were red first; files and functions changed with a one-line reason each; the exact new response fields (model, name, type, default); commands with counts; any existing test that fails; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-20-d8-movers-all-rows-handoff.md (your task: D-8, owner-approved)
Work only in D:\unifolio-d-movers on branch batch/d-movers. Git is read-only. No deletion flags or recursive deletes. Write the failing tests first, run them, then make the change in the files the handoff names only. The movers card payload must not change. Every change is additive. If an existing test fails because it asserts the old behaviour, do not edit it: report it.
Run tests with: cd backend; "D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest <files>   (if the sandbox cannot run it, reply BLOCKED with the exact error, do not change any config)
Reply with the CODEX REPORT block from the handoff, nothing else.
```
