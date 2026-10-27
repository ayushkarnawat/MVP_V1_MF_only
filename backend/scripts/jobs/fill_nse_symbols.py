"""L17: fill NULL stock_master.nse_symbol from NSE's EQUITY_L.csv. Off unless NSE_SYMBOL_FILL_ENABLED=true.

A failed fetch leaves rows NULL and still exits 0 (the fill is best-effort; the news tagger falls back to
name/ISIN matching without a symbol).
"""
import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from app.config import settings
from app.db.session import SessionLocal
from app.services.analytics.nse_symbol_fill import fill_nse_symbols

logger = logging.getLogger(__name__)


def run(db) -> int:
    if not settings.nse_symbol_fill_enabled:
        logger.info("fill_nse_symbols: disabled (NSE_SYMBOL_FILL_ENABLED is not true)")
        return 0
    result = asyncio.run(fill_nse_symbols(db, url=settings.nse_symbol_fill_url))
    logger.info("fill_nse_symbols: success=%s updated=%d already_set=%d unmatched=%d",
                result.success, result.updated, result.already_set, result.unmatched)
    return 0


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as db:
        raise SystemExit(run(db))


if __name__ == "__main__":
    main()
