import asyncio
import uuid
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock

from app.models.enums import AssetType, MarketCapBucket
from app.models.reference import MarketCapClassification
from tests.services.analytics.test_lookthrough import _scheme, _batch, _holding


def _classification(db, isin, bucket, effective):
    db.add(MarketCapClassification(isin=isin, bucket=bucket, rank={MarketCapBucket.LARGE: 1, MarketCapBucket.MID: 101, MarketCapBucket.SMALL: 251}[bucket], effective_date=effective, source_period=effective - timedelta(days=1)))
    db.flush()


def test_cap_allocation_effective_join_denominators_and_other_split(db_session, monkeypatch):
    from app.services.analytics import lookthrough
    from app.services.analytics.cap_allocation import compute_cap_allocation
    scheme = _scheme(db_session)
    _batch(db_session, scheme, [("Large", "L", "40", AssetType.EQUITY_DOMESTIC),
                               ("Mid", "M", "20", AssetType.EQUITY_DOMESTIC),
                               ("Small", "S", "10", AssetType.EQUITY_DOMESTIC),
                               ("Foreign", "US1", "10", AssetType.EQUITY_INTERNATIONAL),
                               ("Debt", "B", "15", AssetType.DEBT),
                               ("Cash", None, "5", AssetType.CASH_EQUIVALENT),
                               ("Future", "L", "-40", AssetType.DERIVATIVE),
                               ("Other", None, "2", AssetType.OTHER)], date(2026, 6, 30))
    for isin, bucket in [("L", MarketCapBucket.LARGE), ("M", MarketCapBucket.MID), ("S", MarketCapBucket.SMALL)]:
        _classification(db_session, isin, bucket, date(2026, 1, 1))
    _classification(db_session, "L", MarketCapBucket.SMALL, date(2026, 7, 1))
    monkeypatch.setattr(lookthrough, "compute_holdings", AsyncMock(return_value=[_holding(scheme, "1000")]))
    result = asyncio.run(compute_cap_allocation(db_session, [uuid.uuid4()]))
    buckets = {b.key: b for b in result.buckets}
    assert buckets["LARGE"].percentage_total == Decimal("40")  # not July's SMALL
    assert buckets["LARGE"].percentage_equity == Decimal("50")
    assert buckets["MID"].percentage_equity == Decimal("25")
    assert buckets["OTHER"].percentage_total == Decimal("30")
    assert buckets["OTHER"].percentage_equity == Decimal("12.5")
    assert result.other.non_equity_value == Decimal("200")
    assert result.other.unclassified_equity_value == Decimal("100")
    assert {r.instrument_name for r in result.other.non_equity_rows} == {"Debt", "Cash"}
    assert [r.instrument_name for r in result.other.unclassified_equity_rows] == ["Foreign"]
    assert result.total_equity_value == Decimal("800")
    assert result.excluded_share == Decimal("-38")
    assert result.classification_as_of == date(2026, 1, 1)
    assert result.coverage.covered_value_pct == Decimal("100")


def test_cap_allocation_reads_full_shared_table_and_reuses_stock_memo(db_session, monkeypatch):
    from app.services.analytics import lookthrough
    from app.services.analytics.cap_allocation import compute_cap_allocation
    scheme = _scheme(db_session)
    _batch(db_session, scheme, [(f"Stock {i}", f"EQ{i}", "0.5", AssetType.EQUITY_DOMESTIC) for i in range(150)])
    spy = AsyncMock(return_value=[_holding(scheme, "1000")])
    monkeypatch.setattr(lookthrough, "compute_holdings", spy)
    ids = [uuid.uuid4()]
    async def sections():
        stock = await lookthrough.compute_stock_holdings(db_session, ids)
        cap = await compute_cap_allocation(db_session, ids)
        assert len(stock.rows) == 100 and cap.other.unclassified_equity_count == 150  # the shared table is complete
        assert len(cap.other.unclassified_equity_rows) == 50  # but the stored cap payload keeps only the largest 50
        assert cap.total_equity_value == Decimal("750")
    asyncio.run(sections())
    assert spy.await_count == 1


def test_cap_allocation_empty_zero_equity_and_no_list(db_session, monkeypatch):
    from app.services.analytics import lookthrough
    from app.services.analytics.cap_allocation import compute_cap_allocation
    monkeypatch.setattr(lookthrough, "compute_holdings", AsyncMock(return_value=[]))
    empty = asyncio.run(compute_cap_allocation(db_session, []))
    assert all(b.percentage_equity == 0 and b.percentage_total == 0 for b in empty.buckets)
    assert empty.hide_headlines and empty.classification_as_of is None
    assert empty.unclassified_share_pct == "100.00"
    assert all(bucket.percentage_classified == "0.00" for bucket in empty.buckets)
    scheme = _scheme(db_session)
    _batch(db_session, scheme, [("Cash", None, "100", AssetType.CASH_EQUIVALENT)])
    monkeypatch.setattr(lookthrough, "compute_holdings", AsyncMock(return_value=[_holding(scheme, "1000")]))
    cash = asyncio.run(compute_cap_allocation(db_session, [uuid.uuid4()]))
    assert cash.total_equity_value == 0 and cash.buckets[-1].percentage_total == 100
    assert all(b.percentage_equity == 0 for b in cash.buckets)
    assert cash.unclassified_share_pct == "100.00"
    assert all(bucket.percentage_classified == "0.00" for bucket in cash.buckets)


def test_cap_allocation_section_registered_and_wraps_combined(db_session, monkeypatch):
    from app.services.analytics import lookthrough
    from app.services.analytics.recompute import _SECTIONS
    monkeypatch.setattr(lookthrough, "compute_holdings", AsyncMock(return_value=[]))
    spec = next(s for s in _SECTIONS if s.name == "cap_allocation")
    result = asyncio.run(spec.compute(db_session, []))
    assert spec.wrap_combined([], result).model_dump(mode="json") == {"members": [], "cap_allocation": result.model_dump(mode="json")}


def test_cap_allocation_payload_caps_each_row_list_but_keeps_totals_and_counts(db_session, monkeypatch):
    """A stored payload must not grow with the household: 60 stocks keep the biggest 50 per list,
    while the bucket value, percentages and a row_count still describe all 60."""
    from app.services.analytics import cap_allocation, lookthrough
    from app.services.analytics.cap_allocation import compute_cap_allocation
    scheme = _scheme(db_session)
    lines = [(f"Large {i}", f"LG{i:03d}", str(Decimal("1") + Decimal(i) / 100), AssetType.EQUITY_DOMESTIC) for i in range(60)]
    lines += [(f"Unlisted {i}", f"UN{i:03d}", "0.5", AssetType.EQUITY_DOMESTIC) for i in range(55)]
    lines += [(f"Bond {i}", f"BD{i:03d}", "0.1", AssetType.DEBT) for i in range(52)]
    _batch(db_session, scheme, lines, date(2026, 6, 30))
    for i in range(60):
        _classification(db_session, f"LG{i:03d}", MarketCapBucket.LARGE, date(2026, 1, 1))
    monkeypatch.setattr(lookthrough, "compute_holdings", AsyncMock(return_value=[_holding(scheme, "1000")]))
    result = asyncio.run(compute_cap_allocation(db_session, [uuid.uuid4()]))
    large = next(b for b in result.buckets if b.key == "LARGE")
    limit = cap_allocation.CAP_ROWS_LIMIT
    assert limit == 50
    assert large.row_count == 60 and len(large.rows) == limit
    # the kept rows are the largest ones, biggest first
    kept = [r.exposure_value for r in large.rows]
    assert kept == sorted(kept, reverse=True) and kept[0] == Decimal("1.59") * 10
    # totals still cover every stock, not just the kept rows
    assert large.value == sum((Decimal("1") + Decimal(i) / 100 for i in range(60)), Decimal(0)) * 10
    assert result.other.unclassified_equity_count == 55 and len(result.other.unclassified_equity_rows) == limit
    assert result.other.non_equity_count == 52 and len(result.other.non_equity_rows) == limit


async def _cap_example(db, monkeypatch, weights=("40", "20", "10", "10", "20")):
    from app.services.analytics import lookthrough
    from app.services.analytics.cap_allocation import compute_cap_allocation
    scheme = _scheme(db)
    types = [AssetType.EQUITY_DOMESTIC] * 3 + [AssetType.EQUITY_INTERNATIONAL, AssetType.DEBT]
    _batch(db, scheme, [(name, isin, weight, kind) for name, isin, weight, kind in
                       zip(["Large", "Mid", "Small", "Foreign", "Bond"], ["L", "M", "S", "US1", "B"], weights, types)], date(2026, 6, 30))
    for isin, bucket in [("L", MarketCapBucket.LARGE), ("M", MarketCapBucket.MID), ("S", MarketCapBucket.SMALL)]:
        _classification(db, isin, bucket, date(2026, 1, 1))
    monkeypatch.setattr(lookthrough, "compute_holdings", AsyncMock(return_value=[_holding(scheme, "1000")]))
    return await compute_cap_allocation(db, [uuid.uuid4()])


def test_three_buckets_sum_to_exactly_100_with_unclassified_stocks(db_session, monkeypatch):
    result = asyncio.run(_cap_example(db_session, monkeypatch, ("25", "25", "25", "25", "0")))
    shares = [bucket.percentage_classified for bucket in result.buckets[:3]]
    assert shares == ["33.33", "33.33", "33.34"]
    assert sum(map(Decimal, shares)) == Decimal("100.00")
    assert result.buckets[-1].key == "OTHER" and result.buckets[-1].percentage_classified == "0.00"


def test_unclassified_share_reports_the_stock_value_with_no_bucket(db_session, monkeypatch):
    result = asyncio.run(_cap_example(db_session, monkeypatch))
    assert result.unclassified_share_pct == "12.50"  # 100 of 800 equity, not 300 Other or 1000 portfolio
    assert result.other.unclassified_equity_value == Decimal("100")
    payload = result.model_dump(mode="json")
    assert isinstance(payload["unclassified_share_pct"], str)
    assert all(isinstance(bucket["percentage_classified"], str) for bucket in payload["buckets"])


def test_all_equity_unclassified_returns_empty_state_fields(db_session, monkeypatch):
    result = asyncio.run(_cap_example(db_session, monkeypatch, ("0", "0", "0", "80", "20")))
    assert result.unclassified_share_pct == "100.00"
    assert [bucket.percentage_classified for bucket in result.buckets] == ["0.00"] * 4
    assert all(Decimal(bucket.percentage_classified).is_finite() for bucket in result.buckets)
    assert "NaN" not in result.model_dump_json()


def test_old_fields_unchanged(db_session, monkeypatch):
    from app.services.analytics.schemas import CapAllocationSummary
    result = asyncio.run(_cap_example(db_session, monkeypatch))
    # Literal golden values from the pre-change computation, including Other's non-equity part.
    assert {bucket.key: (bucket.value, bucket.percentage_total, bucket.percentage_equity) for bucket in result.buckets} == {
        "LARGE": (Decimal("400"), Decimal("40"), Decimal("50")),
        "MID": (Decimal("200"), Decimal("20"), Decimal("25")),
        "SMALL": (Decimal("100"), Decimal("10"), Decimal("12.5")),
        "OTHER": (Decimal("300"), Decimal("30"), Decimal("12.5")),
    }
    # Old stored JSON must still parse, with defaults marking it as awaiting recomputation.
    old_payload = result.model_dump(mode="json")
    old_payload.pop("unclassified_share_pct", None)
    for bucket in old_payload["buckets"]:
        bucket.pop("percentage_classified", None)
    old = CapAllocationSummary.model_validate(old_payload)
    assert old.unclassified_share_pct == ""
    assert all(bucket.percentage_classified == "" for bucket in old.buckets)


def test_empty_last_bucket_and_zero_equity_keep_finite_classified_percentages(db_session, monkeypatch):
    result = asyncio.run(_cap_example(db_session, monkeypatch, ("20", "10", "0", "10", "60")))
    assert [bucket.percentage_classified for bucket in result.buckets] == ["66.67", "33.33", "0.00", "0.00"]
    assert sum(Decimal(bucket.percentage_classified) for bucket in result.buckets[:3]) == Decimal("100.00")
