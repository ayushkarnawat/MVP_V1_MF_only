import asyncio
import uuid
from datetime import date
from decimal import Decimal
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from app.models.enums import AssetType, DisclosureBatchStatus, MarketCapBucket
from app.models.reference import MarketCapClassification
from tests.services.analytics.test_lookthrough import _scheme, _batch, _holding


def _compute(db, monkeypatch, holdings, ids=None):
    from app.services.analytics import lookthrough
    from app.services.analytics.asset_allocation_lookthrough import compute_asset_allocation
    monkeypatch.setattr(lookthrough, "compute_holdings", AsyncMock(return_value=holdings))
    return asyncio.run(compute_asset_allocation(db, ids or [uuid.uuid4()]))


def _values(variant):
    return {row.key: row.percentage for row in variant.classes}


def test_asset_allocation_three_fund_example_and_null_cash_sums(db_session, monkeypatch):
    schemes = [_scheme(db_session) for _ in range(3)]
    for scheme, eq, debt, gold in zip(schemes, ("95", "65", "0"), ("0", "30", "0"), ("0", "0", "100")):
        _batch(db_session, scheme, [("Stock", "EQ", eq, AssetType.EQUITY_DOMESTIC),
            ("Bond", "B", debt, AssetType.DEBT), ("Gold", "G", gold, AssetType.GOLD_SILVER),
            ("TREPS", None, "3" if eq != "0" else "0", AssetType.CASH_EQUIVALENT),
            ("Net receivables", None, "2" if eq != "0" else "0", AssetType.CASH_EQUIVALENT)])
    result = _compute(db_session, monkeypatch, [_holding(s, v) for s, v in zip(schemes, ("600", "300", "100"))])
    assert _values(result.as_disclosed) == {"equity": Decimal("76.5"), "debt": Decimal("9"), "gold": Decimal("10"), "cash_like": Decimal("4.5")}
    assert result.covered_value == Decimal("1000")
    assert result.arbitrage_as_cash == result.as_disclosed


def test_asset_classes_use_raw_asset_types_even_for_same_isin(db_session, monkeypatch):
    a, b = [_scheme(db_session) for _ in range(2)]
    _batch(db_session, a, [("Stock", "SAME", "100", AssetType.EQUITY_DOMESTIC)])
    _batch(db_session, b, [("Bond", "SAME", "100", AssetType.DEBT)])
    result = _compute(db_session, monkeypatch, [_holding(a, "600"), _holding(b, "400")])
    assert _values(result.as_disclosed)["equity"] == Decimal("60")
    assert _values(result.as_disclosed)["debt"] == Decimal("40")
    assert sum((b.value for b in result.as_disclosed.equity_outer), Decimal(0)) == Decimal("600")


def test_asset_allocation_covered_denominator_batch_selection_and_exclusions(db_session, monkeypatch):
    covered, missing = [_scheme(db_session) for _ in range(2)]
    _batch(db_session, covered, [("Stock", "EQ", "80", AssetType.EQUITY_DOMESTIC),
        ("Cash", None, "20", AssetType.CASH_EQUIVALENT), ("Future", "EQ", "-50", AssetType.DERIVATIVE),
        ("Unknown", None, "2", AssetType.OTHER)], date(2026, 8, 31))
    for when, status in [(date(2026, 9, 30), DisclosureBatchStatus.FAILED), (date(2026, 10, 1), DisclosureBatchStatus.AWAITING_MANUAL_UPLOAD), (date(2026, 10, 31), DisclosureBatchStatus.WRITTEN)]:
        _batch(db_session, covered, [("Wrong", "BAD", "100", AssetType.GOLD_SILVER)], when, status)
    result = _compute(db_session, monkeypatch, [_holding(covered, "400"), _holding(missing, "600")])
    assert result.coverage.covered_value_pct == Decimal("40") and result.hide_headlines
    assert _values(result.as_disclosed) == {"equity": Decimal("80"), "debt": Decimal("0"), "gold": Decimal("0"), "cash_like": Decimal("20")}
    # -50% and +2% excluded lines of a 400 holding, over the TOTAL portfolio of 1000 (same denominator as every other banner)
    assert result.excluded_share == Decimal("-19.2")
    assert result.holdings_as_of == date(2026, 8, 31)


def test_asset_arbitrage_whole_value_toggle_only_exact_category(db_session, monkeypatch):
    schemes = [_scheme(db_session) for _ in range(3)]
    for scheme, category in zip(schemes, ("Arbitrage Fund", "Equity Savings Fund", "Hybrid Scheme - Arbitrage Fund")):
        scheme.sebi_category = category
        _batch(db_session, scheme, [("Stock", "EQ", "60", AssetType.EQUITY_DOMESTIC),
            ("Cash", None, "20", AssetType.CASH_EQUIVALENT), ("Fund units", None, "20", AssetType.OTHER),
            ("Future", "EQ", "-60", AssetType.DERIVATIVE)])
    result = _compute(db_session, monkeypatch, [_holding(s, v) for s, v in zip(schemes, ("500", "300", "200"))])
    assert _values(result.as_disclosed)["equity"] == Decimal("60")
    assert _values(result.arbitrage_as_cash)["equity"] == Decimal("30")
    assert _values(result.arbitrage_as_cash)["cash_like"] == Decimal("60")
    assert [f.scheme_id for f in result.arbitrage_funds] == [schemes[0].id]
    assert sum((b.value for b in result.arbitrage_as_cash.equity_outer), Decimal(0)) == Decimal("300")


def test_asset_outer_ring_reuses_effective_cap_lookup_and_maps_all_types(db_session, monkeypatch):
    from app.services.analytics.asset_allocation_lookthrough import ASSET_CLASS_MAP
    assert set(ASSET_CLASS_MAP) == set(AssetType)
    scheme = _scheme(db_session)
    _batch(db_session, scheme, [("Stock", "EQ", "40", AssetType.EQUITY_DOMESTIC),
        ("Foreign", "US1", "10", AssetType.EQUITY_INTERNATIONAL), ("Trust", "REIT", "10", AssetType.REIT_INVIT),
        ("Bond", "B", "20", AssetType.DEBT), ("Gold", "G", "10", AssetType.GOLD_SILVER),
        ("Cash", None, "10", AssetType.CASH_EQUIVALENT)], date(2026, 6, 30))
    db_session.add_all([MarketCapClassification(isin="EQ", rank=1, bucket=MarketCapBucket.LARGE, effective_date=date(2026, 1, 1), source_period=date(2025, 12, 31)),
        MarketCapClassification(isin="EQ", rank=251, bucket=MarketCapBucket.SMALL, effective_date=date(2026, 7, 1), source_period=date(2026, 6, 30))])
    db_session.flush()
    result = _compute(db_session, monkeypatch, [_holding(scheme, "1000")])
    assert _values(result.as_disclosed)["equity"] == Decimal("60")
    outer = {b.key: b.percentage for b in result.as_disclosed.equity_outer}
    assert outer == {"LARGE": Decimal("40"), "MID": Decimal(0), "SMALL": Decimal(0), "OTHER": Decimal("20")}
    assert result.as_disclosed.cap_allocation.classification_as_of == date(2026, 1, 1)


def test_asset_and_other_sections_share_one_scope_without_expired_orm_queries(db_session, monkeypatch):
    from app.services.analytics import lookthrough
    from app.services.analytics.asset_allocation_lookthrough import compute_asset_allocation
    from sqlalchemy import event
    scheme = _scheme(db_session)
    _batch(db_session, scheme, [("Stock", "EQ", "100", AssetType.EQUITY_DOMESTIC)])
    spy = AsyncMock(return_value=[_holding(scheme, "1000")])
    monkeypatch.setattr(lookthrough, "compute_holdings", spy)
    ids = [uuid.uuid4()]
    async def run():
        await lookthrough.compute_stock_holdings(db_session, ids)
        db_session.commit()
        statements = []
        def record(*args):
            statements.append(args[2])
        event.listen(db_session.get_bind(), "before_cursor_execute", record)
        try:
            await compute_asset_allocation(db_session, ids)
        finally:
            event.remove(db_session.get_bind(), "before_cursor_execute", record)
        assert not any("scheme_holdings" in q or "disclosure_batches" in q or "FROM schemes" in q for q in statements)
    asyncio.run(run())
    assert spy.await_count == 1


def test_asset_real_arbitrage_sheet_and_empty_scope(db_session, monkeypatch):
    from app.services.analytics.amfi_factsheet_client import build_families
    from app.services.analytics.portfolio_disclosure_parsing import parse_workbook
    from app.services.analytics.portfolio_disclosure_writer import write_disclosure_batch
    empty = _compute(db_session, monkeypatch, [])
    assert empty.covered_value == 0 and empty.hide_headlines
    assert all(c.value == 0 for c in empty.as_disclosed.classes)
    scheme = _scheme(db_session)
    scheme.sebi_category = "Arbitrage Fund"
    path = Path(__file__).resolve().parents[2] / "fixtures/portfolio_disclosures/zerodha-arbitrage_asof_2026-09-30.xlsx"
    sheet = next(s for s in parse_workbook(path.read_bytes()) if s.holdings)
    write_disclosure_batch(db_session, build_families([scheme])[0], date(2026, 9, 30), scheme.amc_name,
                           "https://example.test/fixture.xlsx", sheet.holdings, "EXACT", Decimal(1), declared_total=sheet.declared_total)
    result = _compute(db_session, monkeypatch, [_holding(scheme, "1000")])
    assert _values(result.as_disclosed)["equity"] == Decimal("68.470")
    assert result.excluded_share == Decimal("-55.990")
    assert _values(result.arbitrage_as_cash) == {"equity": Decimal(0), "debt": Decimal(0), "gold": Decimal(0), "cash_like": Decimal("100")}


def test_asset_section_registered_and_serialized(db_session, monkeypatch):
    result = _compute(db_session, monkeypatch, [])
    from app.services.analytics.recompute import _SECTIONS
    spec = next(s for s in _SECTIONS if s.name == "asset_allocation")
    assert spec.wrap_combined([], result).model_dump(mode="json") == {"members": [], "asset_allocation": result.model_dump(mode="json")}


def test_excluded_share_has_no_intermediate_portfolio_rounding(db_session, monkeypatch):
    covered, missing = [_scheme(db_session) for _ in range(2)]
    _batch(db_session, covered, [("Stock", "EQ", "100", AssetType.EQUITY_DOMESTIC),
        ("Future", "EQ", "-1", AssetType.DERIVATIVE)])
    result = _compute(db_session, monkeypatch, [_holding(covered, "1"), _holding(missing, "2")])
    assert result.excluded_share == Decimal("-1") / Decimal("3")  # -0.01 of a 3-rupee total, exact, no intermediate rounding


def test_asset_classes_list_their_funds_with_value_and_share_of_class(db_session, monkeypatch):
    schemes = [_scheme(db_session) for _ in range(3)]
    for scheme, eq, debt, gold in zip(schemes, ("95", "65", "0"), ("0", "30", "0"), ("0", "0", "100")):
        _batch(db_session, scheme, [("Stock", "EQ", eq, AssetType.EQUITY_DOMESTIC),
            ("Bond", "B", debt, AssetType.DEBT), ("Gold", "G", gold, AssetType.GOLD_SILVER),
            ("TREPS", None, "3" if eq != "0" else "0", AssetType.CASH_EQUIVALENT),
            ("Net receivables", None, "2" if eq != "0" else "0", AssetType.CASH_EQUIVALENT)])
    result = _compute(db_session, monkeypatch, [_holding(s, v) for s, v in zip(schemes, ("600", "300", "100"))])
    classes = {row.key: row for row in result.as_disclosed.classes}
    # hand check: equity = 600*95% + 300*65% = 570 + 195 = 765; the 570 fund is 570/765 of the class
    equity = classes["equity"].funds
    assert [(f.scheme_id, f.value) for f in equity] == [(schemes[0].id, Decimal("570")), (schemes[1].id, Decimal("195"))]
    assert equity[0].percentage == Decimal("570") / Decimal("765") * 100
    assert equity[0].scheme_name == schemes[0].name
    # a fund with nothing in the class is left out; gold is only the third fund
    assert [(f.scheme_id, f.value, f.percentage) for f in classes["gold"].funds] == [(schemes[2].id, Decimal("100"), Decimal("100"))]
    assert classes["debt"].funds[0].value == Decimal("90")
    assert result.model_dump(mode="json")["as_disclosed"]["classes"][0]["funds"][0]["value"] == "570.000"


def test_arbitrage_as_cash_variant_moves_the_whole_fund_into_cash_like(db_session, monkeypatch):
    scheme = _scheme(db_session)
    scheme.sebi_category = "Arbitrage Fund"
    _batch(db_session, scheme, [("Stock", "EQ", "60", AssetType.EQUITY_DOMESTIC), ("Cash", None, "40", AssetType.CASH_EQUIVALENT)])
    result = _compute(db_session, monkeypatch, [_holding(scheme, "500")])
    cash = {r.key: r for r in result.arbitrage_as_cash.classes}["cash_like"]
    assert [(f.scheme_id, f.value, f.percentage) for f in cash.funds] == [(scheme.id, Decimal("500"), Decimal("100"))]
    assert {r.key: r for r in result.arbitrage_as_cash.classes}["equity"].funds == []


def _equity_funds(variant):
    return next(row for row in variant.classes if row.key == "equity").funds


def test_class_funds_share_ignores_negative_parts_and_lists_only_positive(db_session, monkeypatch):
    a, b = [_scheme(db_session) for _ in range(2)]
    _batch(db_session, a, [("Stock", "EQ", "60", AssetType.EQUITY_DOMESTIC)])
    _batch(db_session, b, [("Short", "SH", "-10", AssetType.EQUITY_DOMESTIC)])
    result = _compute(db_session, monkeypatch, [_holding(a, "1000"), _holding(b, "1000")])
    funds = _equity_funds(result.as_disclosed)
    # class total is 600-100=500; shares are over the positive parts only (600), so never above 100
    assert [(f.scheme_id, f.value, f.percentage) for f in funds] == [(a.id, Decimal("600"), Decimal("100"))]


def test_class_funds_share_with_zero_class_total_is_not_zero_percent(db_session, monkeypatch):
    a, b = [_scheme(db_session) for _ in range(2)]
    _batch(db_session, a, [("Stock", "EQ", "50", AssetType.EQUITY_DOMESTIC)])
    _batch(db_session, b, [("Short", "SH", "-50", AssetType.EQUITY_DOMESTIC)])
    result = _compute(db_session, monkeypatch, [_holding(a, "1000"), _holding(b, "1000")])
    assert _values(result.as_disclosed)["equity"] == Decimal("0")
    funds = _equity_funds(result.as_disclosed)
    assert [(f.scheme_id, f.percentage) for f in funds] == [(a.id, Decimal("100"))]


def test_class_funds_all_negative_class_lists_nothing_without_dividing_by_zero(db_session, monkeypatch):
    a = _scheme(db_session)
    _batch(db_session, a, [("Short", "SH", "-5", AssetType.EQUITY_DOMESTIC)])
    result = _compute(db_session, monkeypatch, [_holding(a, "1000")])
    assert _equity_funds(result.as_disclosed) == []
