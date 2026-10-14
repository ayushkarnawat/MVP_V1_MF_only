import asyncio
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock

from app.models.enums import BenchmarkIndex, BenchmarkReturnType
from app.models.reference import BenchmarkIndexHistory


def test_pe_pb_never_leak_into_price_tri_bounds_or_levels(db_session, monkeypatch):
    from app.services.analytics import nse_indices_client as client
    for kind, when, value in [(BenchmarkReturnType.PRICE, date(2026, 10, 1), "100"),
        (BenchmarkReturnType.TRI, date(2026, 10, 1), "120"),
        (BenchmarkReturnType.PE, date(2026, 10, 12), "25"), (BenchmarkReturnType.PB, date(2026, 10, 12), "3.35")]:
        db_session.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, return_type=kind, date=when, value=Decimal(value)))
    db_session.flush()
    for kind, expected in [(BenchmarkReturnType.PRICE, "100"), (BenchmarkReturnType.TRI, "120")]:
        assert client.get_index_level_on_or_before(db_session, BenchmarkIndex.NIFTY_50, date(2026, 10, 14), return_type=kind) == (Decimal(expected), date(2026, 10, 1))
        assert client._cached_date_bounds(db_session, BenchmarkIndex.NIFTY_50, kind) == (date(2026, 10, 1), date(2026, 10, 1))
    spy = AsyncMock(side_effect=AssertionError("valuation must never fetch PRICE"))
    monkeypatch.setattr(client, "_fetch_index_history", spy)
    for kind in (BenchmarkReturnType.PE, BenchmarkReturnType.PB):
        assert not asyncio.run(client.ensure_index_history_fresh(db_session, BenchmarkIndex.NIFTY_50, date(2026, 1, 1), date(2026, 10, 14), return_type=kind))
    spy.assert_not_called()
