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



def test_retained_old_pb_keeps_its_old_date(db_session, monkeypatch):
    from app.models.reference import StockMaster
    from app.services.analytics import stock_fundamentals_client as client
    from tests.services.analytics.test_stock_fundamentals_client import FixtureHTTP, FIXTURES, _refresh
    from tests.services.analytics.test_lookthrough import _scheme, _batch, _holding
    from tests.services.analytics.test_valuation import _compute
    from app.models.enums import AssetType
    isin = next(k for k, v in client.parse_constituents((FIXTURES / "nifty500.csv").read_bytes()).items()
                if v["symbol"] == "ETERNAL")
    stock = StockMaster(isin=isin, name="Eternal", pe_ratio=Decimal(25), pb_ratio=Decimal(3),
                        as_of_date=date(2026, 10, 10), source="NSE", pb_source="YAHOO")
    db_session.add(stock); db_session.commit()
    # First refresh must backfill the previously common date before changing it.
    _refresh(db_session, FixtureHTTP(bad_yahoo=["ETERNAL"], bad_screener=True))
    assert stock.pe_as_of == date(2026, 10, 12)
    assert stock.pb_as_of == date(2026, 10, 10)
    assert stock.pe_source == "NSE"
    # Repeating a failed P/B fetch must not relabel it with the newer common date.
    _refresh(db_session, FixtureHTTP(bad_yahoo=["ETERNAL"], bad_screener=True))
    assert stock.pb_as_of == date(2026, 10, 10) and "2026-10-10" in stock.footnote
    scheme = _scheme(db_session)
    _batch(db_session, scheme, [("Eternal", isin, "100", AssetType.EQUITY_DOMESTIC)])
    result = _compute(db_session, monkeypatch, [_holding(scheme, "1000")])
    assert result.pe.as_of_date == date(2026, 10, 12)
    assert result.pb.as_of_date == date(2026, 10, 10)
    assert result.funds[0].pb.as_of == date(2026, 10, 10)
