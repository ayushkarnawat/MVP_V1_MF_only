import asyncio
import decimal
import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.enums import BenchmarkIndex
from app.models.reference import BenchmarkIndexHistory
from app.services.analytics.nse_indices_client import (
    _TRADING_INDEX_NAME,
    _fetch_index_history,
    ensure_index_history_fresh,
    get_index_level_on_or_before,
)


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def test_trading_index_name_covers_every_benchmark_index_enum_member():
    assert set(_TRADING_INDEX_NAME.keys()) == set(BenchmarkIndex)


def test_fetch_index_history_does_not_blanket_follow_redirects():
    """BUG-001/DATA-001: investigated adding `follow_redirects=True` after a
    live curl once returned a 302 -- but a direct repro against the exact
    configured URL/scheme (https, hardcoded) returned 200 with no redirect,
    and the only redirect this endpoint issues is http-to-https (moot,
    since the URL is already https). Blanket-following would be actively
    worse if a redirect ever did occur: httpx converts this POST to a
    bodyless GET on 301/302, dropping the `cinfo` payload that selects the
    index/date range, risking silently caching the wrong index's data
    rather than the current safe degrade-to-stale-cache on any unexpected
    response shape. This regression test guards against reintroducing it."""
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json = MagicMock(return_value=[])

    mock_client = MagicMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch(
        "app.services.analytics.nse_indices_client.httpx.AsyncClient", return_value=mock_client
    ) as mock_ctor:
        asyncio.run(_fetch_index_history(BenchmarkIndex.NIFTY_50, date(2026, 8, 3), date(2026, 8, 4)))

    assert mock_ctor.call_args.kwargs.get("follow_redirects") is not True


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


def test_ensure_index_history_fresh_returns_false_on_malformed_close_value():
    """BUG-001/DATA-001 re-review finding: `Decimal(entry["CLOSE"])` inside
    `_fetch_index_history` can raise `decimal.InvalidOperation` on a
    malformed value from this undocumented, reverse-engineered endpoint --
    pre-existing gap, not covered by the `except (httpx.HTTPError, KeyError,
    ValueError, TypeError)` tuple, so it escaped uncaught instead of
    degrading to stale-cache-return-False like every other malformed-response
    case here."""
    db = _session()
    with patch(
        "app.services.analytics.nse_indices_client._fetch_index_history",
        new=AsyncMock(side_effect=decimal.InvalidOperation("bad CLOSE value")),
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
