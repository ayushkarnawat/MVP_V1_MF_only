# Handoff: rk7a-pool-representative-fixes (Batch A, task RK-7, part a: FX-10a and FX-10d)
**Status:** READY TO RELAY (written 2026-11-19). **Approved by the owner on 19 Nov 2026** (the review gate is passed for these two fixes). May run **at the same time as** `2026-11-19-xr3-price-and-dating-tests-handoff.md`: the two tasks use different worktrees and different files.
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-a-numbers-plan.md` (fix task template; plan item RK-7). **Proposal and evidence:** `Docs/orchestration/2026-11-19-batch-a-fix-proposals.md` (FX-10a, FX-10d) and `Docs/orchestration/2026-11-19-rk4-real-pool-reconciliation.md` (the real cases). **Spec:** `Docs/orchestration/2026-11-17-batch-a2-rank-denominators-planning-workbook.html` (Growth options only; IDCW and dividend options are in no pool, decided 17 Nov; a held IDCW fund is ranked as its Growth option with a label, Q2 A). The workbook is the design; if it and the code disagree, stop and say so.
**Worker:** Codex, backend only. **Reviewer and committer:** Claude. **Adversarial review:** yes.
**Work in:** `D:\unifolio-a-fixes` (branch `batch/a-fixes`, cut from `batch/a-numbers` at `146e9472`). Never in `D:\Unifolio code` or `D:\unifolio-a-numbers`.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## What is wrong (read in code; re-check each line and report drift)
All in `backend/app/services/analytics/scheme_universe.py`, class `SchemeUniverseClient`, method `get_category_peers` (~line 283; the module function of the same name at ~334 only forwards to it), and in `backend/app/services/analytics/performance_ranking.py`, `load_ranking_pools` (~54).
1. **FX-10a.** `get_category_peers` keeps one series per fund. A series is a candidate when its plan is the wanted plan **or unknown (`None`)**; the representative is `min(candidates, key=rank_key)`, Growth first and then the **lowest `amfi_code`**. When the lowest-coded Growth series of a fund has an unknown plan, it is chosen; `load_ranking_pools` then keeps only series whose `plan_type` equals the wanted plan, so the fund **disappears from the ranked pool** and its real Direct Growth series is never used. Result: "out of N" one too small.
2. **FX-10d (a).** `rank_key` decides Growth by `"growth" in text and "idcw" not in text and "dividend" not in text`, where `text` is the option plus the **scheme name**. A fund with "Growth" in its **name** (for example "Nippon India Growth Mid Cap Fund") makes its Bonus and income series look like Growth; the lowest code wins, so the **Bonus Option is ranked in place of the Growth Option**. The income test also misses "Income Distribution cum capital withdrawal" and the misspelling "IDWC".
3. **FX-10d (b).** Nothing removes a non-Growth representative: a fund with **no Growth series** is represented by its IDCW series and ranked (real: a daily-IDCW liquid fund).

## The change (only this)
- **FX-10a:** when `plan_type` is not `None`, a candidate must have **exactly** that plan (use `s.plan_type`, else `plan_type_for(row)` as today). A series whose plan is unknown is **not** a candidate. When `plan_type` **is** `None` (a caller with an unknown plan), behaviour is unchanged (any plan). A fund left with no candidate is skipped as today (it still counts in `fund_count`).
- **FX-10d (a):** Growth is decided from the **option words only**: the AMFI option field (`row.option`); if it is empty, the part of the scheme name **after** the fund's base name (the name with `base_name` removed). Words that make a series **not Growth**: idcw, idwc, income distribution, dividend, payout, reinvestment, bonus. A series is Growth when its option words contain "growth" and none of those. Never read the fund's own name for these words.
- **FX-10d (b):** a representative must be Growth. A fund with no Growth candidate gets **no representative** and is **not in `peers.schemes`**. Record it: add an **additive** field to `CategoryPeers` (a dataclass, default empty) such as `excluded_funds: list[tuple[str, str]]` holding (fund base name, reason) with the reason `no_growth_series`. `representative_of` keeps mapping every series of a fund that **has** a representative to it (so a held IDCW series of a fund that has a Growth series is still ranked as its Growth option, as the workbook says). For a held series of a fund with **no** Growth series, make **no new screen text**: use the path the code already has for "this fund has no rank"; report exactly what happens to such a held fund's rank row (this is a finding, not something to design).
- Every backend change is additive. No field removed or renamed. Do not touch `category_ranking.py` (the average pool is a separate task).

## Tests first (invented funds only, `Decimal`, no network)
Add to `backend/tests/services/analytics/test_scheme_universe.py` (or a new file `test_scheme_universe_representatives.py` beside it), written and run **before** the change, each failing today for the stated reason:
1. `test_unknown_plan_series_with_lower_code_does_not_hide_the_direct_series`: one fund, two Growth series, the unknown-plan one with the lower code, the Direct one higher. Today: representative is the unknown-plan series. Expected: the Direct series.
2. `test_fund_with_only_unknown_plan_series_is_not_in_a_direct_pool` and `test_unknown_plan_request_still_accepts_any_plan` (the second passes today and must keep passing).
3. `test_growth_in_the_fund_name_does_not_make_a_bonus_series_growth`: "Storybook Growth Mid Cap Fund" with a Bonus series of lower code than its Growth series. Expected: the Growth series.
4. `test_spelled_out_income_options_are_never_the_representative`: options "Income Distribution cum capital withdrawal" and "IDWC Option" next to a Growth series.
5. `test_fund_with_no_growth_series_is_left_out_and_listed_with_the_reason`: only an IDCW Direct series. Expected: not in `peers.schemes`; `excluded_funds` holds it with `no_growth_series`.
6. `test_held_idcw_series_still_maps_to_its_growth_representative` (passes today; keep passing).
7. In `test_performance_ranking.py`: `test_ranked_pool_contains_the_direct_series_of_a_fund_whose_unknown_plan_series_has_a_lower_code` (end to end through `load_ranking_pools`).

## Run these only
```
cd backend
"D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest tests/services/analytics/test_scheme_universe.py tests/services/analytics/test_performance_ranking.py tests/services/analytics/test_category_ranking.py tests/services/analytics/test_recount_pool.py tests/services/analytics/test_category_average_checks.py -v
```
(From the `backend` folder of `D:\unifolio-a-fixes`. No full suite.) **If an existing test fails after your change because it asserts the old behaviour, do not edit it:** stop and report the test name and why; the owner decides. If the sandbox stalls at asyncio start-up as it did in CA-3 (a socket-pair timeout before the first coroutine), report BLOCKED with the exact error, still write the change and the tests, and the orchestrator runs them.

## Files you may touch
`backend/app/services/analytics/scheme_universe.py`, `backend/app/services/analytics/performance_ranking.py` (only if the plan filter there needs the same exact-plan rule; say so), and the test files named above. **Do not touch** `category_ranking.py`, any other `app/**` file, existing tests, `frontend/**`, migrations, real data.

## Constraints
`Decimal` only, never `float`. No network. Invented data only. No new dependency. Git is read-only for you. No deletion flags or recursive deletes.

## Report format
One fenced block `CODEX REPORT: rk7a-pool-representative-fixes`: status; baseline HEAD; drift (every fact above that did not match); which new tests were red first and why; commands with counts; the files you changed with a one-line reason each; what happens to a held fund with no Growth series (the exact current path); any existing test that fails after the change; `git status --short`; Deviations; Open questions.

## What the orchestrator does after you
Runs the tests (and any BLOCKED ones), re-runs `scripts/rk4_reconcile_real_pools.py` against staging data to confirm the six groups' ranked pools now equal the independent recount, runs the adversarial review, and commits.

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-19-rk7a-pool-representative-fixes-handoff.md (your task: RK-7a, FX-10a and FX-10d, owner-approved)
Work only in D:\unifolio-a-fixes on branch batch/a-fixes. Git is read-only. No deletion flags or recursive deletes. Write the failing tests first, run them, then make the change in the files the handoff names only. If an existing test fails because it asserts the old behaviour, do not edit it: report it.
Run tests with: cd backend; "D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest <files>   (if the sandbox cannot run it, reply BLOCKED with the exact error, do not change any config)
Reply with the CODEX REPORT block from the handoff, nothing else.
```
