# Monday VM close-out for Run 3 and Run 4 (playbook for the orchestrating Claude)

**Trigger the owner pastes:**
> Run the Monday VM close-out. Read `Docs/orchestration/2026-11-02-monday-vm-run.md` and follow it end to end, one step at a time. It is now after 06:35 IST on a trading day. I authorise the read-only steps in that file; stop at any gate it names and tell me.

**What this closes.** The pending items in the tag messages of `cr-run-3-done` and `cr-run-4-done`: the G2 timing baselines (O5), Run 3's T3.7 (speed, real-data checks), Run 4's T4.3 (timing, hand check), and the Run 2 T2.10 timing. The tags stay as they are; the results go into the docs listed in Part E.

**Hard rules (unchanged).** Every VM step only reads. Never add `--allow-nav-writes` or `--include-live-fetch`. Never run `clean-db.sh`, `restore.sh`, `rollback.sh` or any deploy. Never stop a running recompute. Never edit files on the VM. Do not push. A deploy (S.1) needs the owner's explicit go and is not part of this playbook. No names, amounts or ids beyond the first 8 characters in anything written down.

## Part 0: Preflight (stop if any fails)
1. Check the clock: it is after 06:35 IST, a weekday, not an exchange holiday. If not, stop and say so.
2. Repo: on `leapswitch-redesign`, `git status` clean except the untracked mockup PDF, tags `cr-run-1-done` to `cr-run-4-done` present.
3. VM reachable: `ssh -o BatchMode=yes deploy@ls-staging.unifolio.in true` (scripts in the session scratchpad show the pattern). Find how the VM runs the app: the folder where `sudo docker compose run --rm -T backend python scripts/...` works, and how to open the database shell (no `psql` on the host: use the compose database container).
4. **What code and migration the VM runs:** `alembic current` inside the backend container (or the deployed commit), and whether `scripts/benchmark_series_check.py` and `scripts/benchmark_diff_report.py` exist there. Record it. This decides Part C.

## Part A: Local gates (no VM; do these first, they do not need Monday)
**DONE on 2 Nov at tip `10df4f71`; results in `2026-11-02-local-gates-runs-3-4.md`. Skip this part** unless a later commit changed Run 3 or Run 4 code (benchmarks, holdings: `git log 10df4f71..HEAD -- backend/app/services/dashboard backend/app/services/analytics frontend/src/features/mutual-funds`). Run 5 commits (auth) do not count; they get their own full-suite gate at Run 5's close. The list below is kept as the record of what was run.
Run only what has not already been recorded as passed.
1. Full backend suite (ignore `tests/functional_postgres`; migration 0049 Postgres tests already passed 1 Nov). Known baseline failures only: 5 tests needing `nav_all.txt`, the 31st-of-month date tests, the `D:\tmp` test.
2. Frontend in WSL: full `vitest run`, `tsc -b`, `oxlint`, `vite build`. Known flaky: `OverviewPage` "failed card" test, `useNews`.
3. Synthetic gates on the synthetic family set (`Docs/CAS Files/synthetic/pdfs/`, password MF@123): `portfolio_synthetic_gate.py`, `fund_synthetic_gate.py`, `home_synthetic_gate.py`.
4. T4.3 hand check: one fund held by two synthetic members; recompute parent and child invested, value, average price by hand and compare with `consolidated`.
5. Section-list and old-payload tests for Run 3 (section keys unchanged, old payloads render).

## Part B: G2 baselines on the VM (read-only; follow `2026-10-31-g2-timing-run-steps.md` exactly)
**DONE 2 Nov 2026, results in `2026-11-02-g2-baselines-results.md`.** Correction learned in the run: Home, fund page and the matrix cannot run unflagged on a morning (the old code needs a stored price dated today); they were measured with `--simulate-fresh-cache` (and the same in-process date change for the matrix). A strict-path rerun is optional, after about 23:00 IST once today's prices are stored. Part C (new-code checks) cannot run before the S.1 deploy (the VM is on commit `3602c510`, migration 0046).
1. Step 1 checks: `SELECT max(date) FROM nav_history;` equals today; the test user's `analytics_recompute_status` row shows no run started in the last 15 minutes (never stop one; wait); `check-memory.sh` and `check-disk.sh` clean. Pick the test user: the household with real statements recomputed on 30 Oct (the 30 Oct results are in the briefing's Step 0 section and `2026-10-31-factsheet-state-and-benchmark-gaps.md`); if more than one fits, ask the owner.
2. Step 2 (refresh month snapshots once by opening the History page): I cannot sign in. If the scripts stop on stale snapshots, ask the owner (or the manager) to open the History page for that household once, then continue.
3. Step 3: the four scripts, two runs each (A, B), saving to `~/g2/` on the VM and capturing the output here. If A and B differ by more than 30%, run C.
4. Judge against Step 4: Home passes its limit lines (1.5 s first load); benchmark matrix "added by windows" below 3000 ms for the largest scope; month detail median below 1.0 s; fund page no error. Report each as pass or fail with the numbers.
5. If a script stops with a read-only or write-attempt message: stop, quote it, do not add flags.

## Part C: New-code checks (only if Part 0 step 4 shows the VM already runs Run 3 and later)
If the VM is still on the old code (migration below 0049), **these cannot run before the S.1 deploy**: say so, do not deploy, and add them to the S.1 deploy guide's check list instead:
- T3.7 real-data: `benchmark_series_check.py` (PASS table against printed returns from the real factsheets, owner supplies the printed figures), `benchmark_diff_report.py --user-id <id>`.
- New-code timing for T2.10, T3.7 and T4.3: `measure_home_staging.py`, `measure_benchmark_matrix.py`, the holdings endpoint, compared with the Part B baselines (no analytics script more than 10% slower; matrix under 3000 ms added).
If the VM does run the new code, run them read-only exactly as their usage lines say and report.

## Part D: Optional read-only extras (ask the owner first; each is a handful of requests)
- Yahoo `<ticker>.BO` retry from the VM's IP using the app's own client (the earlier curl got 429): confirms the T2.12 Step B fallback from the production IP.

## Part E: Close-out (local commits only)
1. Write the results (counts and milliseconds only) into `Docs/orchestration/2026-10-31-factsheet-state-and-benchmark-gaps.md` (Revision 3 table) and `session.md`; update the handoff's open items (O5, and O10 where it applies), the Status of Runs 3 and 4 in their handoffs, and `Docs/orchestration/delegation-log.md`; record the decisions register line for O2 (gold/silver limitation accepted) and for the T2.12 fallback decision if the owner has confirmed it.
2. Commit with prefix `docs:` (not pushed).
3. Report to the owner in one short table: each item, pass or fail or "needs deploy", the number, and what is left for S.1. If anything failed a threshold, say which Run it belongs to and propose the fix; do not change code on the spot.
