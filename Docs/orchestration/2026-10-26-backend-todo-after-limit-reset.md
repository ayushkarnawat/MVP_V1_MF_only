# Backend to-do, parked until the Claude limits reset (26 Oct 2026)
Owner decision 26 Oct: **no review fixes and no new backend runs while the quota is low**; the front-end packets go first (Gemini has room). Nothing below is started except where marked. Review policy: Sonnet by default; when unsure, ask the owner before any Opus run.

## 1. Portfolio PR #15: fixes from the Sonnet review (verdict: merge after H1)
| # | Fix | Notes |
|---|---|---|
| H1 | Golden-fixture test and writer depend on today's date (XIRR ends at `date.today()`): patch `app.services.dashboard.xirr.date` to a fixed subclass in the test and in `write_portfolio_fixtures.py` | A partial attempt is saved as `portfolio-fix-partial-H1.patch` in the session scratchpad (not applied; the fixtures it changed must be re-checked). Goes red on 27 Oct if unfixed |
| M1 | `_value_series` loads prices from `today - (days + 15)` but the window is built back from `nav_as_of`: wrong when the newest NAV is more than about 26 days old. Load from `min(today, latest NAV date) - (days + 15)`; add a stale-feed test | Home's 1D/1W wealth routes have the same weakness (Low L15) |
| M2 | Three injected bugs survive the tests: summary total summed unrounded (C88), series end `today` instead of `nav_as_of`, member-scope `realized_gain` over all members | Add one failing-first test each |
| M3 | Gate has no independent oracle and no switch, bonus, opening balance, statement-priced or sold fund; its oracle call lacks `stored_only` and tries a live fetch | Pass `stored_only=True`; widen the household with L14 |
| L1 | `-0.0000` and `-0.00` strings (normalise like Home `_zero`) | |
| L5 | Summary and allocation use `view="sector"` needlessly; `view="fund"` if byte-identical | |
| Logged only | series last point vs summary on a weekend price of a held fund (same rule as Home N3); statement-only household's last point; Dashboard per-row gains differ by paise (C96); series loads all transactions; one tautological test | |

## 2. Mutual Funds PR #12: fixes from its Sonnet review
Sonnet review reported 26 Oct. Verdict: **conditionally safe to merge** (additive; legacy outputs byte-identical on the synthetic household; independent calculator matches to 0.00016 bp across 240 values; 28 mutations, 25 killed). The front end must not show the windows until H1 is fixed. Not fixed until the owner says so.
| # | Finding | Fix |
|---|---|---|
| H1 | A CAS opening-balance row dated inside a window is counted as new money: portfolio and index window rates wrong with no flag (combined scope: 1Y 34.30% vs -3.18%; 3Y 27.43% vs 10.39%). `benchmark_windows.py` ~272-279 and `build_window_context` ~90-104 | In `compute_window_rows` set `available=False` when any `cas_opening` transaction falls in `(start, today]` (or exclude its flow and add its units to V0 at market); add a test |
| M1 | The index replay can sell more units than held, so the terminal value goes negative and the benchmark rate is meaningless (29.95% for an index that rose 20%; HDFC Corporate Bond since-inception 1.236%). `benchmark_windows.py` ~175-189; legacy `_benchmark_xirr_for_transactions` has it too | Return None when units go below 0 after a flow or the terminal value is below 0; apply to the new indices at least |
| L-a | XIRR solvers return None for steep declines (annualised below about -45%; 306 of 1,497 fuzzed shapes). `xirr_fast.py`, legacy `xirr` | Seed the guess from `(terminal/V0)**(1/years) - 1` clamped above -0.99, or add a bisection fallback |
| L-b | A "1Y" window is 12 to 13 months (start = last completed month end minus N years; 390 days on 24 Oct); the UI must show `start_date` | Display, or decide to change |
| L-c | Test gaps: the "first month <= start but no row for start makes the window unavailable" rule (M27) and the loader's `date <= end` bound (M28) are untested; nothing tests H1 | Add tests |
| L-d | `build_window_context` loads every NAV row up to the start per call (3 calls per member, built twice per scope): 470-525 ms and about 90k rows on the 9-fund household; likely 10x on 40+ funds | Must be covered by the I2 staging gate (the local gate passed: 1,346 ms worst) |
| L-e | `date.today()` for "today" and the window start (UTC container shifts the date between 00:00 and 05:30 IST); the VM is on Asia/Kolkata | Note |
| L-f | The refresh job also fetches price history for the four new indices; nothing reads it | Accepted (MB1) |
Not checked by the review: Postgres (migration 0045, queries), real NSE/AMFI data, staging timing, switch/dividend/gift flows in windows.

## 3. Backend runs still to do (see the execution plan v2 and the list given on 26 Oct)
Order: **NB1 to NB3** (Home news; migration 0044; owner runs the VM dry run first and calibrates thresholds), **IB1 + IB2**, **IB3 + IB4**, **IB5 + MB4** (owner runs the staging check), **PB1 + PB2**, MX1 (small, after MB4), the Profile line `created_at` on `/auth/me` (me). Each is a Claude terminal (Sonnet) session, verified by me, with a Sonnet PR review (Opus only if I am unsure and the owner agrees).
