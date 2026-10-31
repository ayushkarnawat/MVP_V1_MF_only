"""Sub-project 2 on real Postgres.

Nearly every other Sub-project 2 test runs on SQLite. This one pushes the real flow through
Postgres in a throwaway schema: the engine writer on real AMC files, the AMFI market-cap load
(bulk insert, native enums, savepoints), the PE/PB benchmark rows, and all five sections
including their JSON form (Decimal and enum handling are where the two databases differ).
"""
import asyncio
import json
import lzma
import os
from datetime import date
from decimal import Decimal
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from tests.services.analytics.test_lookthrough import _holding, _scheme

SCHEMA = "sp2_lookthrough_test"
FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"


@pytest.fixture()
def pg():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL unset")
    from app.db.base import Base
    admin = create_engine(url)
    with admin.begin() as conn:
        conn.execute(text(f"DROP SCHEMA IF EXISTS {SCHEMA} CASCADE"))
        conn.execute(text(f"CREATE SCHEMA {SCHEMA}"))
    engine = create_engine(url, connect_args={"options": f"-csearch_path={SCHEMA}"})
    Base.metadata.create_all(engine)
    session = sessionmaker(autoflush=False, bind=engine)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()
        with admin.begin() as conn:
            conn.execute(text(f"DROP SCHEMA IF EXISTS {SCHEMA} CASCADE"))
        admin.dispose()


def _market_cap_pdf(url: str) -> bytes:
    from app.services.analytics.amfi_market_cap_client import VERIFIED_PERIODS
    period = next(p for p, v in VERIFIED_PERIODS.items() if v.url == url)
    folder = FIXTURES / "market_cap"
    compressed = folder / f"{period.isoformat()}.pdf.xz"
    return lzma.decompress(compressed.read_bytes()) if compressed.exists() else (folder / f"{period.isoformat()}.pdf").read_bytes()


def test_market_cap_load_on_postgres(pg, monkeypatch):
    from app.models.reference import MarketCapClassification
    from app.services.analytics import amfi_market_cap_client as client
    monkeypatch.setattr(client, "_fetch_pdf", AsyncMock(side_effect=_market_cap_pdf))
    first = asyncio.run(client.refresh_market_cap(pg, today=date(2026, 10, 14)))
    assert first.success and len(first.periods_loaded) == 4 and first.rows_written == 21053
    assert pg.query(MarketCapClassification).count() == 21053
    second = asyncio.run(client.refresh_market_cap(pg, today=date(2026, 10, 14)))
    assert second.success and not second.periods_loaded and len(second.periods_skipped) == 4


def test_engine_writer_and_all_five_sections_on_postgres(pg, monkeypatch):
    from app.models.enums import BenchmarkIndex, BenchmarkReturnType, DisclosureBatchStatus, MarketCapBucket
    from app.models.reference import (
        BenchmarkIndexHistory, DisclosureBatch, MarketCapClassification, SchemeHolding, StockMaster,
    )
    from app.services.analytics import lookthrough
    from app.services.analytics.amfi_factsheet_client import build_families
    from app.services.analytics.asset_allocation_lookthrough import compute_asset_allocation
    from app.services.analytics.cap_allocation import compute_cap_allocation
    from app.services.analytics.lookthrough import compute_stock_holdings
    from app.services.analytics.overlap import compute_overlap
    from app.services.analytics.portfolio_disclosure_parsing import parse_workbook
    from app.services.analytics.portfolio_disclosure_writer import write_disclosure_batch
    from app.services.analytics.valuation import compute_valuation

    schemes = [_scheme(pg, "HDFC Mutual Fund") for _ in range(2)]
    pg.commit()
    folder = FIXTURES / "portfolio_disclosures"
    for scheme, name in zip(schemes, ("hdfc-flexi-cap", "hdfc-bse-500-index-fund")):
        sheet = next(s for s in parse_workbook((folder / f"{name}_asof_2026-09-30.xlsx").read_bytes()) if s.holdings)
        write_disclosure_batch(pg, build_families([scheme])[0], date(2026, 9, 30), scheme.amc_name,
                               "https://example.test/fixture.xlsx", sheet.holdings, "EXACT", Decimal(1),
                               declared_total=sheet.declared_total)
    pg.commit()
    assert pg.query(DisclosureBatch).filter_by(status=DisclosureBatchStatus.WRITTEN).count() == 2
    assert pg.query(SchemeHolding).count() > 100

    pg.add(MarketCapClassification(isin="INE002A01018", bucket=MarketCapBucket.LARGE, rank=1,
                                   effective_date=date(2026, 1, 1), source_period=date(2025, 12, 31)))
    pg.add(StockMaster(isin="INE002A01018", name="Reliance", pe_ratio=Decimal("24"), pb_ratio=Decimal("2.4"),
                       as_of_date=date(2026, 10, 12), source="NSE", pb_source="YAHOO"))
    for index, pe, pb in ((BenchmarkIndex.NIFTY_50, "19.41", "2.79"), (BenchmarkIndex.NIFTY_500, "21.76", "3.10")):
        pg.add(BenchmarkIndexHistory(index_name=index, date=date(2026, 10, 13), return_type=BenchmarkReturnType.PE, value=Decimal(pe)))
        pg.add(BenchmarkIndexHistory(index_name=index, date=date(2026, 10, 13), return_type=BenchmarkReturnType.PB, value=Decimal(pb)))
    pg.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date(2026, 10, 13), return_type=BenchmarkReturnType.PRICE, value=Decimal("25000")))
    pg.commit()

    monkeypatch.setattr(lookthrough, "compute_holdings", AsyncMock(return_value=[
        _holding(schemes[0], "900"), _holding(schemes[1], "100")]))
    import uuid
    ids = [uuid.uuid4()]
    results = {}
    for name, fn in (("stock", compute_stock_holdings), ("cap", compute_cap_allocation),
                     ("asset", compute_asset_allocation), ("overlap", compute_overlap), ("valuation", compute_valuation)):
        results[name] = asyncio.run(fn(pg, ids))
        # The stored form: Decimals as strings, enums as values; must survive a real JSON round trip.
        assert json.loads(json.dumps(results[name].model_dump(mode="json")))

    assert results["overlap"].matrix[0].overlap_pct == Decimal("40.310")
    assert results["overlap"].matrix[0].common_total == 70
    assert results["stock"].total_stock_count > 50
    assert results["cap"].classification_as_of == date(2026, 1, 1)
    assert any(b.key == "LARGE" and b.row_count == 1 for b in results["cap"].buckets)
    assert results["valuation"].indices[0].pe_ratio == Decimal("19.41")
    assert results["valuation"].indices[1].pb_ratio == Decimal("3.10")
    # Asset allocation now includes positive Others and derivative legs; the other sections retain their rule.
    shares = {results[k].excluded_share for k in ("stock", "cap", "overlap", "valuation")}
    assert len(shares) == 1
    assert results["asset"].excluded_share <= 0
    # PE/PB rows must not leak into the price series.
    prices = pg.query(BenchmarkIndexHistory).filter_by(return_type=BenchmarkReturnType.PRICE).all()
    assert [p.value for p in prices] == [Decimal("25000")]
