"""T2.12 Step B: read each held stock's book value per share from NSE's Integrated Filing XBRL.

Run by hand or from cron on the staging VM (an Indian IP; NSE blocks AWS and Codex). NOT a request path.

Request volume (about 280 held equity stocks): 1 cookie request, then 1 list request per stock, then 1 xbrl
download only for a stock whose newest March or September filing is newer than the stored one.
  first run:       1 + 280 + 280 = about 561 requests, at least 2 s apart  ->  about 19 minutes
  later runs:      1 + 280 = about 281 requests (plus a download per newly filed company)  ->  about 10 minutes
New balance sheets appear around May (March year end) and November (September half year), so a weekly or
fortnightly run is plenty; running it daily only repeats the list calls.

A 401, 403 or 429 from NSE stops the whole run: stored values are kept, a FILINGS_BOOK_VALUE_ALERT line is
logged and the exit code is 1. One stock's odd or missing data is skipped with a log line (symbol and reason
only). Held stocks need stock_master.nse_symbol (fill_nse_symbols.py fills it).

The values are stored per stock; the daily stock-fundamentals job turns them into the P/B (day's close over
book value per share) and keeps Yahoo and screener.in as the labelled fallback when no filing value exists.
"""
import asyncio
import logging
import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from app.db.session import SessionLocal, commit_off_loop
from app.models.news import JobRun
from app.services.analytics.filings_book_value import (
    JOB_NAME, BookValueColumnsMissing, NseFilingsClient, StockMasterBookValueStore,
    held_equity_targets, refresh_filings_book_values,
)

logger = logging.getLogger(__name__)


async def main_async(db, source=None, today: date | None = None) -> int:
    today = today or date.today()
    try:
        store = StockMasterBookValueStore(db)
    except BookValueColumnsMissing:
        logger.warning("FILINGS_BOOK_VALUE_ALERT columns_missing stock_master has no book value columns (migration pending)")
        return 2
    targets, without_symbol = held_equity_targets(db, today)
    if without_symbol:
        logger.info("filings_book_value: %d held stocks have no NSE symbol yet and are skipped", without_symbol)
    if not targets:
        logger.warning("FILINGS_BOOK_VALUE_ALERT no_held_stocks_with_symbol")
        return 1
    owned = source is None
    source = source or NseFilingsClient()
    try:
        result = await refresh_filings_book_values(store, targets, source, today=today)
    except Exception:
        db.rollback()
        logger.exception("FILINGS_BOOK_VALUE_ALERT run_failed")
        return 1
    finally:
        if owned:
            await source.aclose()
    logger.info("filings_book_value success=%s considered=%d updated=%d unchanged=%d skipped=%d stopped=%s",
                result.success, result.considered, result.updated, result.unchanged, result.skipped, result.stopped)
    if not result.success:
        return 1
    # Written only on success, like the other jobs, so a failed run leaves the previous time in place.
    now = datetime.now(timezone.utc)
    row = db.get(JobRun, JOB_NAME)
    if row is None:
        db.add(JobRun(job_name=JOB_NAME, last_success_at=now))
    else:
        row.last_success_at = now
    await commit_off_loop(db)
    return 0


def main():
    logging.basicConfig(level=logging.INFO)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    with SessionLocal() as db:
        raise SystemExit(asyncio.run(main_async(db)))


if __name__ == "__main__":
    main()
