import asyncio
from contextlib import contextmanager
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.enums import BenchmarkIndex, BenchmarkReturnType
from app.models.reference import BenchmarkIndexHistory
from app.services.analytics.nse_indices_client import (
    _fetch_tri_history,
    _fetched_from,
    _upsert_index_history,
    ensure_index_history_fresh,
    get_index_level_on_or_before,
)


def _session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def test_price_and_tri_rows_for_same_date_both_persist_independently():
    db = _session()
    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date(2026, 9, 10), return_type=BenchmarkReturnType.PRICE, value=Decimal("23477.80")))
    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date(2026, 9, 10), return_type=BenchmarkReturnType.TRI, value=Decimal("35674.37")))
    db.commit()

    rows = db.query(BenchmarkIndexHistory).filter_by(index_name=BenchmarkIndex.NIFTY_50, date=date(2026, 9, 10)).all()
    assert len(rows) == 2
    by_type = {r.return_type: r.value for r in rows}
    assert by_type[BenchmarkReturnType.PRICE] == Decimal("23477.80")
    assert by_type[BenchmarkReturnType.TRI] == Decimal("35674.37")


def test_upsert_does_not_collide_price_and_tri_for_the_same_date():
    db = _session()
    asyncio.run(_upsert_index_history(db, BenchmarkIndex.NIFTY_50, BenchmarkReturnType.PRICE, [(date(2026, 9, 10), Decimal("23477.80"))]))
    asyncio.run(_upsert_index_history(db, BenchmarkIndex.NIFTY_50, BenchmarkReturnType.TRI, [(date(2026, 9, 10), Decimal("35674.37"))]))

    rows = db.query(BenchmarkIndexHistory).filter_by(index_name=BenchmarkIndex.NIFTY_50, date=date(2026, 9, 10)).all()
    assert len(rows) == 2


def test_get_index_level_on_or_before_defaults_to_price_unchanged():
    db = _session()
    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date(2026, 9, 10), return_type=BenchmarkReturnType.PRICE, value=Decimal("23477.80")))
    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date(2026, 9, 10), return_type=BenchmarkReturnType.TRI, value=Decimal("35674.37")))
    db.commit()

    result = get_index_level_on_or_before(db, BenchmarkIndex.NIFTY_50, date(2026, 9, 10))
    assert result == (Decimal("23477.80"), date(2026, 9, 10))


def test_get_index_level_on_or_before_tri_reads_the_tri_row():
    db = _session()
    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date(2026, 9, 10), return_type=BenchmarkReturnType.PRICE, value=Decimal("23477.80")))
    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date(2026, 9, 10), return_type=BenchmarkReturnType.TRI, value=Decimal("35674.37")))
    db.commit()

    result = get_index_level_on_or_before(db, BenchmarkIndex.NIFTY_50, date(2026, 9, 10), return_type=BenchmarkReturnType.TRI)
    assert result == (Decimal("35674.37"), date(2026, 9, 10))


def test_fetched_from_cache_does_not_cross_contaminate_return_types():
    db = _session()
    _fetched_from.clear()
    with patch(
        "app.services.analytics.nse_indices_client._fetch_index_history",
        new=AsyncMock(return_value=[(date(2026, 1, 1), Decimal("100.00"))]),
    ):
        asyncio.run(ensure_index_history_fresh(db, BenchmarkIndex.NIFTY_50, date(2026, 1, 1), date(2026, 1, 1)))

    assert (BenchmarkIndex.NIFTY_50, BenchmarkReturnType.PRICE) in _fetched_from
    assert (BenchmarkIndex.NIFTY_50, BenchmarkReturnType.TRI) not in _fetched_from


def test_fetch_tri_history_parses_total_returns_index_field():
    payload = [
        {"Date": "10 Sep 2026", "TotalReturnsIndex": "35674.37", "NTR_Value": "34890.12"},
        {"Date": "11 Sep 2026", "TotalReturnsIndex": "35700.00", "NTR_Value": "-"},
    ]
    with patch_httpx_post(payload):
        rows = asyncio.run(_fetch_tri_history(BenchmarkIndex.NIFTY_50, date(2026, 9, 10), date(2026, 9, 11)))

    assert rows == [(date(2026, 9, 10), Decimal("35674.37")), (date(2026, 9, 11), Decimal("35700.00"))]


def test_fetch_tri_history_rejects_dates_outside_requested_range():
    payload = [{"Date": "10 Jan 2000", "TotalReturnsIndex": "1000.00", "NTR_Value": "-"}]
    with patch_httpx_post(payload):
        with pytest.raises(ValueError):
            asyncio.run(_fetch_tri_history(BenchmarkIndex.NIFTY_50, date(2026, 9, 10), date(2026, 9, 11)))


@contextmanager
def patch_httpx_post(payload):
    # Same AsyncClient mock pattern as test_nse_indices_client.py.
    mock_response = httpx.Response(200, json=payload, request=httpx.Request("POST", "https://example.com"))
    mock_client = MagicMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    with patch("app.services.analytics.nse_indices_client.httpx.AsyncClient", return_value=mock_client):
        yield mock_client


def test_price_only_lookup_unaffected_by_presence_of_tri_rows():
    """Pins the spec's required regression: seeding a TRI row for a date
    that also has a PRICE row must not change what a return_type-less
    (i.e. default-PRICE) caller sees. (benchmark.py itself moves to TRI in
    Task 6; this pins the shared lookup, not that caller.)"""
    db = _session()
    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date(2026, 9, 10), return_type=BenchmarkReturnType.PRICE, value=Decimal("23477.80")))
    db.commit()
    price_only_result = get_index_level_on_or_before(db, BenchmarkIndex.NIFTY_50, date(2026, 9, 10))

    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date(2026, 9, 10), return_type=BenchmarkReturnType.TRI, value=Decimal("35674.37")))
    db.commit()
    price_only_result_after_tri_seeded = get_index_level_on_or_before(db, BenchmarkIndex.NIFTY_50, date(2026, 9, 10))

    assert price_only_result == price_only_result_after_tri_seeded == (Decimal("23477.80"), date(2026, 9, 10))
