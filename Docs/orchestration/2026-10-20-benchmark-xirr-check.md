# Benchmark XIRR check: each transaction is priced on its own date (P3-T6)
Date 2026-10-20. Tests: `backend/tests/services/analytics/test_benchmark.py`, `test_benchmark_xirr_prices_each_transaction_on_its_own_date` and `test_a_transaction_on_a_market_holiday_uses_the_previous_trading_days_level`. Production code is unchanged: both tests pass against today's `_benchmark_xirr_for_transactions`, so the artifact's claim holds (the benchmark XIRR is not computed from a single start date).

## Worked SIP example (three monthly purchases)
| Date | Purchase | TRI level | Units bought |
|---|---|---|---|
| 2024-01-05 | ₹10,000 | 100 | 100 |
| 2024-02-05 | ₹10,000 | 120 | 83.33... |
| 2024-03-05 | ₹10,000 | 80 | 125 |
Terminal level on 2025-01-06 is 150, so the hypothetical benchmark portfolio is worth about ₹46,250 (46250.00000...). The cash flows are `(2024-01-05, -10000)`, `(2024-02-05, -10000)`, `(2024-03-05, -10000)` and `(2025-01-06, +46250)`.

| | XIRR |
|---|---|
| App (`_benchmark_xirr_for_transactions`) | 0.5980057313898863 |
| Independent (bisection on the NPV, written inside the test) | 0.5980057313898866 |
| Difference | below 0.0001 (it is about 3e-16) |

The units per purchase differ because each purchase is priced at the TRI level of its own date (100, 120, 80). A start-date-only calculation would price all three at 100 and give a different answer.

## Market-holiday rule
A purchase on a non-trading day uses the level of the **previous trading day**. Test: a purchase of ₹1,000 on Sunday 2024-01-07, with levels for Friday 2024-01-05 (100) and Monday 2024-01-08 (1000): the hypothetical units are exactly 10 (1,000 / 100), so Monday's level is ignored. The cash-flow date used for the XIRR stays the Sunday.

Source of the numbers: Codex's Run 6 report (Windows run); both tests were re-run in WSL by the orchestrator (see the delegation log).
