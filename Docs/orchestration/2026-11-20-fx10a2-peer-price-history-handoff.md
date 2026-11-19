# Handoff: fx10a2-peer-price-history (Batch A, FX-10a part 2: complete the peers' price history, backend, Codex)
**Status:** READY TO RELAY (written 2026-11-20). **Approved by the owner on 20 Nov 2026** ("FX10A, I can approve"). Runs **at the same time as** `2026-11-20-d8-movers-all-rows-handoff.md` (different worktree and files).
**Evidence and proposal:** `Docs/orchestration/2026-11-20-rk4b-real-data-checks.md` and the "New evidence, 20 Nov" section of `Docs/orchestration/2026-11-19-batch-a-fix-proposals.md` (FX-10a, part 2). **Plan:** `Docs/superpowers/plans/2026-11-17-batch-a-numbers-plan.md` (the plan's FX-10a: "retry and complete the price history for every peer before a total is shown"). The workbook is the design; if it and the code disagree, stop and say so.
**Worker:** Codex, backend only. **Reviewer and committer:** Claude.
**Work in:** `D:\unifolio-a-fixes` (branch `batch/a-fixes`). Never in `D:\Unifolio code`.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## What is wrong (read in code and measured on staging, 20 Nov; re-check each line, report drift)
- `backend/scripts/jobs/refresh_nav_daily.py`: `refresh_peers(db, schemes)` collects the held funds' category peers and calls `warm_nav_history(db, peers.values())` (`app/services/dashboard/nav.py`). `main_async` already downloads AMFI's own file (`fetch_amfi_rows()`, rows with `amfi_code`, `nav`, `nav_date`) and uses it for the **held** funds only (`refresh_held_navs`).
- `warm_nav_history` skips a scheme with any price row within `_NAV_FRESHNESS_WINDOW_DAYS` (3) of today, then fetches the rest **all at once** (`asyncio.gather` over about 450 fetches) from mfapi.in through `_fetch_nav_history`, and treats any `httpx.HTTPError` as "left unwarmed" with **no log line**.
- On staging mfapi.in answers **HTTP 429 (too many requests)**: a burst of 71 concurrent fetches gave 4 refusals; the same 71 at ten at a time straight afterwards gave 64 refusals. Result: in Equity Scheme - Sectoral/ Thematic (Direct), 74 of 142 pool funds had a last stored price 5 to 18 days old although AMFI's file already held a newer price for every one.

## The change (only this)
1. **AMFI's own latest price for every peer.** In `refresh_nav_daily.py`, pass the AMFI rows already fetched to `refresh_peers` and, for every peer scheme whose AMFI row has a usable price (positive NAV, a date not in the future) newer than its latest stored price, write that one `(date, nav)` row with the existing `_upsert_nav_history(..., commit=False)` and one commit for the batch, exactly as `refresh_held_navs` does for held funds. Do this **before** the history fetch, so a refused fetch no longer leaves a peer stale.
2. **Gentler history fetch.** `warm_nav_history`: limit concurrent requests (a small constant, for example 8, as a module constant) and, on HTTP 429, retry **once** after a short wait (honour `Retry-After` when present, otherwise about one second); a second refusal counts as a failure. Keep the existing freshness window rule and the best-effort posture (one bad scheme never aborts the batch).
3. **Count and show failures.** `warm_nav_history` returns (additive; callers that ignore the return value keep working) the number of schemes it tried and the number that failed after the retry. `refresh_peers` prints one greppable line per run: `PEER_HISTORY failed=<n> of <m>` (flush immediately, like `NAV_SUMMARY`). **`NAV_SUMMARY` stays byte-identical in shape** (the daily digest parses it); add the new line beside it and do not change the exit code. If `nav-digest.sh` greps for lines, tell the orchestrator (the report) whether it would need a one-line addition to show `PEER_HISTORY`; do not edit the script.
4. Every change is **additive**; no field or route changes; no migration.

## Tests first (invented data, `Decimal`, no network; fake the history client)
New file `backend/tests/services/dashboard/test_peer_price_history.py` (and extend `tests/scripts/test_refresh_nav_daily_*` only with new `it`/test functions):
1. `test_peer_gets_amfis_latest_price_even_when_the_history_fetch_is_refused`: a peer with a stored last price 15 days old, an AMFI row dated yesterday, and a fake fetch that raises HTTP 429 twice: after the run the peer's latest stored price is AMFI's row and the run reports one failure.
2. `test_a_peer_already_current_gets_no_extra_row` and `test_amfi_row_that_is_older_or_unusable_is_ignored` (zero or negative NAV, a future date).
3. `test_429_is_retried_once_then_counted` and `test_concurrency_is_limited` (a counter in the fake client never exceeds the constant).
4. `test_peer_history_line_is_printed_and_nav_summary_is_unchanged`.
5. `test_full_run_writes_peer_prices_and_held_only_run_does_not_touch_peers` (the `--held-only` runs skip peers as today).

## Run these only
```
cd backend
"D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest tests/services/dashboard/test_peer_price_history.py tests/services/dashboard/test_nav.py tests/services/dashboard/test_held_nav_refresh.py tests/scripts/test_refresh_nav_daily_flags.py tests/scripts/test_refresh_nav_daily_scenario_recompute.py -v
```
(From `D:\unifolio-a-fixes\backend`; adjust names if a file is named differently and say so. No full suite.) If the sandbox stalls at asyncio start-up (as in every previous task), report BLOCKED with the exact error; still write the change and the tests; the orchestrator runs them and checks the change against the staging data.

## Files you may touch
`backend/scripts/jobs/refresh_nav_daily.py`, `backend/app/services/dashboard/nav.py` (only `warm_nav_history` and its constants), and the new and extended tests above. **Do not touch** `held_nav_refresh.py`, any ranking or category code, `scripts/run_analytics_recompute.py`, other `app/**`, existing tests' assertions, `frontend/**`, migrations, `nav-digest.sh`.

## Constraints
`Decimal` only. No network in tests. No new dependency. Git read-only. No deletion flags or recursive deletes.

## Report format
One fenced block `CODEX REPORT: fx10a2-peer-price-history`: status; baseline HEAD; drift; which new tests were red first; the files and functions changed with a one-line reason each; the constants chosen; whether `nav-digest.sh` needs a line for `PEER_HISTORY`; commands with counts; any existing test that fails; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-20-fx10a2-peer-price-history-handoff.md (your task: FX-10a part 2, owner-approved)
Work only in D:\unifolio-a-fixes on branch batch/a-fixes. Git is read-only. No deletion flags or recursive deletes. Write the failing tests first, run them, then make the change in the files the handoff names only. NAV_SUMMARY must stay byte-identical in shape. Every change is additive. If an existing test fails because it asserts the old behaviour, do not edit it: report it.
Run tests with: cd backend; "D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest <files>   (if the sandbox cannot run it, reply BLOCKED with the exact error, do not change any config)
Reply with the CODEX REPORT block from the handoff, nothing else.
```
