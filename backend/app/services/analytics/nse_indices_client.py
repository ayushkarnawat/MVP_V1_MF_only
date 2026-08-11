"""NSE Indices benchmark history — PRD-04 FR-8/FR-9. On-demand per-index
fetch-and-cache, mirroring `dashboard/nav.py`'s split between an async
fetch-and-cache step and a sync, cache-only lookup — the lookup side gets
called many times per XIRR computation (once per transaction date), the
fetch side only once per (index, date range).

**Correction to `TDD-Unifolio.md`:** the TDD documents this endpoint as
`POST .../Backpage.aspx/getHistoricaldatatabletoString`. That path is
stale (returns a generic ASP.NET error page). The working path below, the
`Trading_Index_Name` mapping, and the `HistoricalDate` response format
(`"10 Aug 2026"`, i.e. `%d %b %Y`) were all confirmed with live requests
this session — not assumed. `liveindexsa.niftyindices.com` must not be
used for this POST (confirmed HTTP 405 there).
"""

from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal

import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.enums import BenchmarkIndex
from app.models.reference import BenchmarkIndexHistory

NSE_INDICES_URL = "https://www.niftyindices.com/BackPage/getHistoricaldatatabletoString"
# The site drops requests with no User-Agent at all — any normal browser UA works.
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# Static — only 4 members, no need to fetch IndexMapping.json at runtime.
_TRADING_INDEX_NAME: dict[BenchmarkIndex, str] = {
    BenchmarkIndex.NIFTY_50: "Nifty 50",
    BenchmarkIndex.NIFTY_500: "Nifty 500",
    BenchmarkIndex.NIFTY_LARGEMIDCAP_250: "NIFTY LARGEMID250",
    BenchmarkIndex.NIFTY_MIDCAP_150: "Nifty Midcap 150",
}


async def _fetch_index_history(index: BenchmarkIndex, start_date: date, end_date: date) -> list[tuple[date, Decimal]]:
    trading_name = _TRADING_INDEX_NAME[index]
    cinfo = json.dumps(
        {
            "name": trading_name,
            "startDate": start_date.strftime("%d-%b-%Y"),
            "endDate": end_date.strftime("%d-%b-%Y"),
            "indexName": trading_name,
        }
    )
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(NSE_INDICES_URL, json={"cinfo": cinfo}, headers={"User-Agent": _USER_AGENT})
        resp.raise_for_status()
        payload = resp.json()

    rows: list[tuple[date, Decimal]] = []
    for entry in payload:
        parsed_date = datetime.strptime(entry["HistoricalDate"], "%d %b %Y").date()
        rows.append((parsed_date, Decimal(entry["CLOSE"])))
    return rows


def _upsert_index_history(db: Session, index: BenchmarkIndex, rows: list[tuple[date, Decimal]]) -> None:
    existing_dates = {d for (d,) in db.query(BenchmarkIndexHistory.date).filter_by(index_name=index).all()}
    for row_date, value in rows:
        if row_date not in existing_dates:
            db.add(BenchmarkIndexHistory(index_name=index, date=row_date, value=value))
    db.commit()


def _cached_date_bounds(db: Session, index: BenchmarkIndex) -> tuple[date, date] | None:
    earliest, latest = (
        db.query(func.min(BenchmarkIndexHistory.date), func.max(BenchmarkIndexHistory.date))
        .filter(BenchmarkIndexHistory.index_name == index)
        .one()
    )
    return (earliest, latest) if earliest is not None else None


async def ensure_index_history_fresh(db: Session, index: BenchmarkIndex, start_date: date, end_date: date) -> bool:
    """One bulk fetch of `[start_date, end_date]` per call — not one fetch
    per lookup date. Skipped entirely if the cache's existing bounds
    already cover the requested range. A fetch failure (network error, or
    a malformed/empty response — a real risk on an undocumented,
    reverse-engineered endpoint) leaves whatever's cached in place and
    returns False, same degrade-gracefully posture as
    `nav.py`/`arn_lookup.py`/`amfi_ter_client.py`."""
    bounds = _cached_date_bounds(db, index)
    if bounds is not None and bounds[0] <= start_date and bounds[1] >= end_date:
        return True

    try:
        rows = await _fetch_index_history(index, start_date, end_date)
    except (httpx.HTTPError, KeyError, ValueError, TypeError):
        return False
    if not rows:
        return False

    _upsert_index_history(db, index, rows)
    return True


def get_index_level_on_or_before(db: Session, index: BenchmarkIndex, on_date: date) -> tuple[Decimal, date] | None:
    """Most recent trading-day index level on or before `on_date` — trading
    holidays/weekends mean the exact date is often not present, same
    on-or-before convention as `nav.py`'s `get_nav_on_or_before`."""
    row = (
        db.query(BenchmarkIndexHistory)
        .filter(BenchmarkIndexHistory.index_name == index, BenchmarkIndexHistory.date <= on_date)
        .order_by(BenchmarkIndexHistory.date.desc())
        .first()
    )
    return (row.value, row.date) if row else None
