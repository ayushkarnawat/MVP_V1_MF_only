# Handoff: BSE price file for BSE-only stocks (T2.11)

**Status:** OPEN (IN REVIEW when Codex reports, DONE after the Run 2 follow-up review)
**Run:** 2 of 7 (follow-on) | **Slug:** `cr-r2-bse-price-file` | **Commit prefix:** `cr-r2:` | **Tasks:** T2.11 (owner go given 31 Oct)
**Rules:** `Docs/orchestration/cr-r2-common-rules.md` (read first). **Task text (authoritative):** plan, "Task 2.11 (gate G7: go): Phase B, the BSE price file".

## Notes
- Files: modify `backend/app/services/analytics/stock_fundamentals_client.py` and `valuation.py`; test `backend/tests/services/analytics/test_stock_fundamentals_bse.py` (create). Columns `stock_master.bse_scrip_code`, `pe_as_of`, `pb_as_of`, `pe_source` already exist (migration 0047, T2.1); do not add a migration. If one is truly needed, stop and ask.
- Address to pin first, as a constant with a test that asserts it: `https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_<YYYYMMDD>_F_0000.CSV` (new-format CSV with ISIN, ticker, series and close). Verified reachable from the VM on 30 Oct. The BSE data API answers 403, so BSE's own ratios are NOT planned.
- Scope: 96 held equity stocks have no NSE symbol (278 have no stored P/E). The task identifies those BSE-only stocks by ISIN, stores `bse_scrip_code`, prices them from the file's close, and their ratios keep using the existing labelled fallbacks (Yahoo, screener.in). International holdings are counted separately and never forced into this path.
- **No network in tests.** Use a small fixed CSV text fixture in the test (ISIN, ticker, series, close; include a header line, a non-equity series row that must be skipped, a row with a blank close, and a day the file is missing). A missing or holiday file is a clean "no file today" result, never zeros and never an error that stops the daily job. Do not download anything yourself. If you need a real file for a column check, ask: the owner can fetch one.
- Fail closed: a row without a usable positive close is skipped, not stored as zero. Decimal only. Plain words on any user-visible label (no "proxy", "fallback", "TRI").
- Old data must keep working: existing stocks and the NSE path behave exactly as before (golden test: NSE stock ratios unchanged).
- Report short: failing counts before and after, exact commands, `git diff --stat`, decisions not covered, files edited outside the list. Do not commit.
