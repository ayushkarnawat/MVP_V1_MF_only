# Local gates for Runs 3 and 4 (done 2 Nov 2026, 01:30 to 03:00 IST, tip `10df4f71`)

Part A of `2026-11-02-monday-vm-run.md`: everything that needs no VM. Windows laptop, `backend/.venv-win`, WSL for the frontend. Nothing was pushed, deployed or written to staging; all database work was on private copies of the synthetic database.

## Result: no product failure

| Gate | Result |
|---|---|
| Backend full suite (ignoring `functional_postgres`) | 5012 passed, 9 skipped, **17 failed, all explained below** |
| Migration 0049 on Postgres (1 Nov) | up, down, up and the downgrade refusal pass; `functional_postgres` 23 passed |
| Frontend `vitest run` | 5203 passed, 3 failed under load; the 3 files pass alone (78 passed) |
| `tsc -b` | clean |
| `oxlint` | 0 errors, 28 warnings |
| `vite build` | succeeds |
| Portfolio synthetic gate | PASS, 11 scenarios, source hash unchanged |
| Home synthetic gate | PASS, 12 scenarios, source hash unchanged |
| Fund synthetic gate | PASS, 10 scenarios, source hash unchanged (see schema note) |
| Run 4 hand check (shared fund) | 0 mismatches |

## The 17 backend failures (none is the product)
- 15 in `tests/scripts/test_refresh_news.py`: `ModuleNotFoundError: No module named 'resource'` (a Unix-only module; Windows only).
- `test_fund_valuation_layouts.py::test_absl_equity_snapshot_row`: the fixture is read with Windows' default cp1252 encoding; passes with `PYTHONUTF8=1`.
- `test_scorer.py::test_compute_fund_score_survives_concurrent_duplicate_insert`: a clock test. The test seeds today from the local date, the scorer uses the UTC date; they differ between 00:00 and 05:30 IST. Passes with the test's date set to the UTC date, and will pass after 05:30 IST.

## Frontend load failures
The full run took 3922 s because the backend suite ran at the same time. Three tests timed out; one was `OverlapPage.test.tsx` "keeps the Holdings All Stocks table at its existing route". `OverlapPage`, `OverviewPage` and `useNews` all pass alone (78 tests). Treat `OverlapPage` as a load-flaky test like the two already known.

## Notes for whoever runs these again
- `backend/pytest.ini` sets `--basetemp=/tmp/unifolio-backend-pytest`, which Windows reads as `D:\tmp` (missing): pass `--basetemp=<an existing folder>`.
- The synthetic database used (`s25.db`) predates migrations 0047 to 0049; the fund gate fails on `no such table: scheme_benchmark` unless the missing tables are added to a copy with `Base.metadata.create_all` (copy only; the gates never touch the source).
- The synthetic family has no fund held by both members. The Run 4 hand check added two folios for the second member (333.337 and 140.123 units) on a copy: parent units 5,264.096 = 4,790.636 + 473.460; invested 385,352.64 = 375,351.91 + 10,000.73; value 693,123.52 = 630,783.04 + 62,340.48; average price 385,352.64 / 5,264.096 = 73.20. Purchase cost is units x price, not the typed amount (existing behaviour).

## Still open (Monday, VM)
G2 baselines, the History-page refresh by the owner, and everything that needs the new code on the VM (T3.7 real-data checks, new-code timing for T2.10, T3.7, T4.3): see `2026-11-02-monday-vm-run.md` Parts B and C.
