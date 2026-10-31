# Handoff: Book value from official filings (T2.12)

**Status:** OPEN. **Starts with a probe and an owner question; do not build before the answer.**
**Run:** 2 of 7 (follow-on) | **Slug:** `cr-r2-filings-book-value` | **Commit prefix:** `cr-r2:` | **Tasks:** T2.12 (owner go given 31 Oct; waits on T2.11)
**Rules:** `Docs/orchestration/cr-r2-common-rules.md` (read first). **Task text (authoritative):** plan, "Task 2.12 (gate G7: waits on S6): Phase C, book value from official filings".

## Step A: probe (cheap, read-only), then STOP and report
The owner supplied working NSE addresses (they need a cookie from the NSE site's page first and answer 200): the list `https://www.nseindia.com/api/corporates-financial-results?index=equities&symbol=<SYM>&issuer=<NAME>&period=Quarterly` and the detail `https://www.nseindia.com/api/corporates-financial-results-data?index=equities&params=<params>&seq_id=<id>&industry=-&frOldNewFlag=N&ind=N&format=New`. **The detail has EPS, face value and paid-up capital but no equity, reserves or book value.** So book value must come from the filing's XBRL attachment (`attachment_filename` in the list).
- Ask the owner before any download. Propose one stock and one half-year or annual filing (a bank is a good second case). Wait for the answer.
- On the owner's yes, download that ONE XBRL zip into a new empty folder under `~/r2-snippets/filings/` (never in the repo), open it, and confirm whether it contains **total equity attributable to owners** and the **number of shares in issue**. Report the exact tag names found, with values for that one stock. Do not parse every filing.
- If the XBRL has both: say so and wait for the orchestrator's go for Step B. If not: record that Phase C stays on the labelled fallbacks (Yahoo, screener.in) and stop. No code in that case.

## Step B (only after the orchestrator says go)
- Files: create `backend/app/services/analytics/filings_book_value.py`; modify `stock_fundamentals_client.py`; test `backend/tests/services/analytics/test_filings_book_value.py`.
- Book value per share = equity attributable to owners / shares in issue, from the latest year-end or half-year filing; the P/B uses the day's close over it. Refresh only when a new filing appears (compare the filing's identifier; no daily re-download). Banks, insurers and finance companies are tested, or kept on the labelled fallback if their tags differ. Yahoo and screener.in stay as labelled fallbacks.
- Estimate request volume first and report it before building the loop (stocks held × one list call, plus one zip per new filing); respect NSE rate limits; send the cookie handshake once per run; handle 401/403/429 as "skip this stock today", never as a crash or a zero.
- No network in tests: fixed small XBRL text fixtures. Decimal only. Fail closed (a missing tag gives no value, never zero).
- Report short; do not commit.
