import asyncio
import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.enums import BenchmarkIndex
from app.models.reference import BenchmarkIndexHistory
from app.services.analytics.nse_indices_client import (
    _TRADING_INDEX_NAME,
    ensure_index_history_fresh,
    get_index_level_on_or_before,
)


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def test_trading_index_name_covers_every_benchmark_index_enum_member():
    assert set(_TRADING_INDEX_NAME.keys()) == set(BenchmarkIndex)


def test_ensure_index_history_fresh_fetches_and_caches_when_nothing_cached():
    db = _session()
    fetched = [
        (date(2026, 8, 3), Decimal("24774.30")),
        (date(2026, 8, 4), Decimal("24614.90")),
    ]
    with patch(
        "app.services.analytics.nse_indices_client._fetch_index_history",
        new=AsyncMock(return_value=fetched),
    ):
        result = asyncio.run(
            ensure_index_history_fresh(db, BenchmarkIndex.NIFTY_50, date(2026, 8, 3), date(2026, 8, 4))
        )

    assert result is True
    rows = db.query(BenchmarkIndexHistory).filter_by(index_name=BenchmarkIndex.NIFTY_50).all()
    assert len(rows) == 2


def test_ensure_index_history_fresh_skips_fetch_when_cache_already_covers_range():
    db = _session()
    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date(2026, 8, 1), value=Decimal("100")))
    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date(2026, 8, 10), value=Decimal("110")))
    db.commit()

    with patch(
        "app.services.analytics.nse_indices_client._fetch_index_history",
        new=AsyncMock(side_effect=AssertionError("should not fetch")),
    ):
        result = asyncio.run(
            ensure_index_history_fresh(db, BenchmarkIndex.NIFTY_50, date(2026, 8, 2), date(2026, 8, 5))
        )

    assert result is True


def test_ensure_index_history_fresh_returns_false_on_fetch_failure():
    db = _session()
    with patch(
        "app.services.analytics.nse_indices_client._fetch_index_history",
        new=AsyncMock(side_effect=httpx.ConnectError("boom")),
    ):
        result = asyncio.run(
            ensure_index_history_fresh(db, BenchmarkIndex.NIFTY_50, date(2026, 8, 3), date(2026, 8, 4))
        )
    assert result is False
    assert db.query(BenchmarkIndexHistory).count() == 0


def test_ensure_index_history_fresh_returns_false_on_empty_response():
    db = _session()
    with patch(
        "app.services.analytics.nse_indices_client._fetch_index_history",
        new=AsyncMock(return_value=[]),
    ):
        result = asyncio.run(
            ensure_index_history_fresh(db, BenchmarkIndex.NIFTY_50, date(2026, 8, 3), date(2026, 8, 4))
        )
    assert result is False


def test_get_index_level_on_or_before_returns_nearest_prior_trading_day():
    db = _session()
    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date(2026, 8, 7), value=Decimal("24570.65")))
    db.commit()

    # 2026-08-08 and 09 are a weekend — no trading-day row exists for them.
    result = get_index_level_on_or_before(db, BenchmarkIndex.NIFTY_50, date(2026, 8, 9))
    assert result == (Decimal("24570.65"), date(2026, 8, 7))


def test_get_index_level_on_or_before_returns_none_when_nothing_cached():
    db = _session()
    assert get_index_level_on_or_before(db, BenchmarkIndex.NIFTY_50, date(2026, 8, 9)) is None
