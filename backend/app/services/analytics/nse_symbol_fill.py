"""L17: fill stock_master.nse_symbol from NSE's public equity list (EQUITY_L.csv).

Soft-failing and idempotent: rows are matched on ISIN, only NULL symbols are written, an existing
symbol is never overwritten, and any fetch/parse failure leaves every row untouched.
"""
from __future__ import annotations

import csv
import io
import logging
from dataclasses import dataclass

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import commit_off_loop
from app.models.reference import StockMaster
from app.services.analytics.nse_indices_client import _USER_AGENT

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class NseSymbolFillResult:
    success: bool
    updated: int = 0
    already_set: int = 0
    unmatched: int = 0  # stock_master rows whose ISIN is not in the NSE list


def parse_equity_list(data: bytes) -> dict[str, str]:
    """ISIN -> symbol. NSE's header cells carry leading spaces (' ISIN NUMBER'), so strip them."""
    reader = csv.DictReader(io.StringIO(data.decode("utf-8-sig")))
    reader.fieldnames = [(name or "").strip() for name in reader.fieldnames or []]
    if not {"SYMBOL", "ISIN NUMBER"} <= set(reader.fieldnames):
        raise ValueError("Unrecognized NSE equity list columns")
    result = {}
    for row in reader:
        isin, symbol = (row.get("ISIN NUMBER") or "").strip(), (row.get("SYMBOL") or "").strip()
        if isin and symbol:
            result[isin] = symbol[:32]  # nse_symbol is String(32)
    if not result:
        raise ValueError("Empty NSE equity list")
    return result


async def fill_nse_symbols(db: Session, *, url: str, client: httpx.AsyncClient | None = None) -> NseSymbolFillResult:
    try:
        if client is None:
            async with httpx.AsyncClient(timeout=30, follow_redirects=True, headers={"User-Agent": _USER_AGENT}) as owned:
                return await fill_nse_symbols(db, url=url, client=owned)
        response = await client.get(url)
        response.raise_for_status()
        symbols = parse_equity_list(response.content)
    except (httpx.HTTPError, ValueError, UnicodeDecodeError) as exc:
        logger.warning("NSE_SYMBOL_FILL_ALERT fetch_failed %s", type(exc).__name__)
        return NseSymbolFillResult(False)
    updated = already_set = unmatched = 0
    for row in db.scalars(select(StockMaster)):
        if row.nse_symbol:
            already_set += 1
        elif row.isin in symbols:
            row.nse_symbol = symbols[row.isin]
            updated += 1
        else:
            unmatched += 1
    await commit_off_loop(db)
    return NseSymbolFillResult(True, updated, already_set, unmatched)
