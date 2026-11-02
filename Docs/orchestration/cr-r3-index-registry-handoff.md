# Handoff: Index registry, new NSE indices, series checks (T3.1, T3.1b)

**Status:** DONE (Run 3 review gate passed; tag cr-run-3-done 2 Nov 2026; real-data checks and new-code timing wait for the S.1 deploy, see 2026-11-02-g2-baselines-results.md)
**Run:** 3 of 7 | **Slug:** `cr-r3-index-registry` | **Commit prefix:** `cr-r3:` | **Tasks:** T3.1, T3.1b
**Order:** First in Run 3. T3.2 and T3.3 edit migration 0049 in place after this.
**Rules:** `Docs/orchestration/cr-r3-common-rules.md` (read first), then `cr-r2-common-rules.md`. **Task text (authoritative):** plan, the task sections named above (Files, Interfaces, Step 1 test names, Step 3, Verify).

## Notes
- Start with T3.1 (registry table, text key migration, daily job reads the master, per-index health alert), then T3.1b (read-only `benchmark_series_check.py`, `active` flag, gold ETF check, the user strings table).
- Check `benchmark_index_history.value` precision (Numeric(12,2)) against the smallest and largest new index levels; widen in 0049 if needed and say so.
- An index whose endpoint returns `[]` is a failure with a health alert, never zero rows. Validate the echoed index name (TRI endpoint: `Index Name`; price endpoint: `INDEX_NAME`).
- The Nifty 50 Arbitrage series is served by the price endpoint but stored as TRI with `source = 'price_endpoint_verified'`; a test pins this.
- The check script prints a PASS/FAIL table into your report; it never writes. Series that fail stay `active = false`.
