# Note L8: cold Dashboard holdings cost grows with the number of funds (found in HB5b, 26 Oct 2026)

**Status:** open, **not a blocker**, to be measured in the integration wave (`I2`). Owner asked on 26 Oct that this be documented properly. Register entry: `ui-redesign-decisions-register.md` L8.
**Where it lives:** `backend/app/services/dashboard/holdings.py`, the existing function `compute_holdings` (shared by the Dashboard, the Home API and the Portfolio API). Home did not introduce it and does not change it (HB1 added only the two optional keywords `scheme_ids` and `allow_stale_today`).

## What was measured
Codex counted the SQL statements of the first (cache-cold) aggregate Home call on the deterministic synthetic household (SQLite, `before_cursor_execute` listener, test `test_home_statement_counts_do_not_grow_with_fund_count`):

| Funds held | SELECT statements, cold | Per extra fund |
|---|---|---|
| 3 | 22 | |
| 9 | 40 | 3 (18 more statements for 6 more funds) |

So the cold cost is about **13 fixed statements plus 3 per fund** (the per-fund ones are the scheme row and the previous-NAV reads inside `compute_holdings`, one set per fund). A 46-fund household (the largest measured on staging on 23 Oct) would run about 13 + 3 x 46 = **151 statements** on a cold call.
**After the first call the cost is flat:** `compute_holdings` caches its result per web worker for 15 minutes (key: member ids, date, scheme filter, `allow_stale_today`), and with the cache warm every Home route adds the same small, fund-independent number of statements (the HB5b test measures the Home composition on a warmed cache and asserts 3 funds and 9 funds cost the same). Home adds no per-fund statement of its own: one units replay, one bulk NAV read, one sector-weight read, one stored-section read, two TER reads, two disclosure reads, regardless of fund count.

## Why it does not block anything now
- The expensive part measured on staging on 23 Oct (375 to 510 ms per fund, 4.5 to 24 s cold) was **live NAV downloads**. HB1's `allow_stale_today=True` (Home and Portfolio always pass it) removes the download, leaving only database round trips: about 150 short statements on the local Postgres is on the order of 0.1 to 0.3 s, inside the Home cold-open budget of 1.5 s. This is an estimate, not a measurement.
- The Dashboard itself behaves as it did before this work (it does not pass `allow_stale_today`), so its numbers and timing are unchanged.

## What to do, in order
1. **Measure at `I2`** on staging with the real households: run the Home routes with a cold cache (`--simulate-fresh-cache` in `scripts/measure_home_staging.py`, or a restart of the backend container) and record statements and milliseconds for the 12-, 42- and 46-fund households; the Portfolio routes (same cache) are measured in the same run. Pass: Home cold-open at or under 1.5 s (spec T13); Portfolio summary under the same figure.
2. **If it misses**, in this order of preference: (a) batch the per-fund scheme and previous-NAV reads in `compute_holdings` into two bulk queries (an edit to a hot shared function, so it gets the Opus review and the Dashboard suites that HB1 had, and a differential check that every `HoldingRow` is identical before and after); (b) warm the per-worker cache after an import confirm and in the 06:30 job; (c) the precomputed-series table already named as the fallback in the Home spec (owner decision).
3. Do **not** change `holdings.py` before the measurement: it is the most widely shared function in the backend and a speculative optimisation there costs more review than it saves.

## What is already guarded
- The HB5b test above fails if a Home route starts issuing a statement per fund on a warm cache.
- The Home gate (`scripts/home_synthetic_gate.py`) prints identical totals for the Home, Dashboard and allocation paths, so any optimisation of `compute_holdings` can be checked for numerical identity with one command.

## Owner decisions needed
None now. Whether to optimise is decided from the `I2` numbers.
