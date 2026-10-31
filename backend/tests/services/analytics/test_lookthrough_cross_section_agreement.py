"""One household through all five real look-through sections.

Each section was built and tested alone. These checks pin what a reader sees when
they sit side by side: the same banner numbers, the same equity total, the same
treatment of derivative/other lines. They would have caught the excluded-share
and non-equity-share denominator mismatches found in the final review.
"""
import asyncio
import uuid
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock

from app.models.enums import AssetType, MarketCapBucket
from app.models.reference import MarketCapClassification, StockMaster
from tests.services.analytics.test_lookthrough import _scheme, _batch, _holding

E, D, C = AssetType.EQUITY_DOMESTIC, AssetType.DEBT, AssetType.CASH_EQUIVALENT


def _household(db, monkeypatch):
    from app.services.analytics import lookthrough
    a, b, uncovered = _scheme(db), _scheme(db), _scheme(db)
    _batch(db, a, [("Alpha", "INE000A01010", "60", E), ("Beta", "INE000B01010", "20", E),
                   ("Bond", "INE000D01010", "10", D), ("TREPS", None, "7", C),
                   ("Future", "INE000A01010", "-4", AssetType.DERIVATIVE), ("Other", None, "2", AssetType.OTHER)])
    _batch(db, b, [("Alpha", "INE000A01010", "50", E), ("Gamma", "INE000G01010", "30", E),
                   ("TREPS", None, "20", C)])
    for isin, bucket in (("INE000A01010", MarketCapBucket.LARGE), ("INE000B01010", MarketCapBucket.MID)):
        db.add(MarketCapClassification(isin=isin, bucket=bucket, rank=1, effective_date=date(2026, 1, 1),
                                       source_period=date(2025, 12, 31)))
    for isin, pe, pb in (("INE000A01010", "20", "3"), ("INE000B01010", "30", "4"), ("INE000G01010", "40", "5")):
        db.add(StockMaster(isin=isin, name=isin, pe_ratio=Decimal(pe), pb_ratio=Decimal(pb),
                           as_of_date=date(2026, 10, 12), source="NSE", pb_source="YAHOO"))
    db.flush()
    monkeypatch.setattr(lookthrough, "compute_holdings", AsyncMock(return_value=[
        _holding(a, "600"), _holding(b, "400"), _holding(uncovered, "500")]))


def _all(db):
    from app.services.analytics.asset_allocation_lookthrough import compute_asset_allocation
    from app.services.analytics.cap_allocation import compute_cap_allocation
    from app.services.analytics.lookthrough import compute_stock_holdings
    from app.services.analytics.overlap import compute_overlap
    from app.services.analytics.valuation import compute_valuation
    ids = [uuid.uuid4()]
    run = lambda fn: asyncio.run(fn(db, ids))
    return (run(compute_stock_holdings), run(compute_cap_allocation), run(compute_asset_allocation),
            run(compute_overlap), run(compute_valuation))


def test_sections_agree_on_the_same_household(db_session, monkeypatch):
    _household(db_session, monkeypatch)
    stock, cap, asset, overlap, valuation = _all(db_session)
    # Asset allocation now includes positive Others; the other sections keep their prior coverage rule.
    assert stock.excluded_share == cap.excluded_share == overlap.excluded_share == valuation.excluded_share
    assert asset.excluded_share == Decimal("-4") * 6 / Decimal("1500") * 100
    # -4% futures and +2% other of a 600 holding, over the TOTAL portfolio of 1500.
    assert stock.excluded_share == Decimal("-2") * 6 / Decimal("1500") * 100
    # One household has one equity total.
    assert cap.total_equity_value == valuation.total_equity_value == sum((r.exposure_value for r in stock.rows), Decimal(0))
    # Equity as asset allocation sees it equals equity as the cap section sees it (no REIT lines here).
    equity = next(c for c in asset.as_disclosed.classes if c.key == "equity")
    assert equity.value == cap.total_equity_value
    # Non-equity share excludes derivative/other lines everywhere: debt 60 + TREPS 42 + 80 = 182 of 1500.
    assert stock.non_equity_share == Decimal(182) / Decimal(1500) * 100
    assert cap.other.non_equity_value == Decimal(182)
    # Same covered fraction in every section.
    assert stock.coverage.covered_value_pct == cap.coverage.covered_value_pct == overlap.coverage.covered_value_pct
    assert asset.covered_value == Decimal(1000)
    # The overlap concentration top-N never exceeds what the stock section shows for the same N.
    top = overlap.concentration[-1]
    assert top.exposure_pct == sum((r.exposure_pct for r in stock.rows[:top.stock_count]), Decimal(0))
