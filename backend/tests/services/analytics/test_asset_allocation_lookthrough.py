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
    assert _values(result.as_disclosed) == {"equity": Decimal("76.5"), "debt": Decimal("13.5"), "gold": Decimal("10"), "real_estate": Decimal("0"), "others": Decimal("0")}
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
    assert {row.key: row.value for row in result.as_disclosed.classes} == {"equity": Decimal("320"), "debt": Decimal("80"), "gold": Decimal("0"), "real_estate": Decimal("0"), "others": Decimal("8")}
    assert abs(sum(_values(result.as_disclosed).values()) - Decimal("100")) < Decimal("0.01")
    # The +2% unknown line is now Others; only the -50% future is ignored: -200 / 1000.
    assert result.excluded_share == Decimal("-20")
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
    assert _values(result.arbitrage_as_cash)["debt"] == Decimal("60")
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
    assert _values(result.as_disclosed)["equity"] == Decimal("50")
    assert _values(result.as_disclosed)["real_estate"] == Decimal("10")
    outer = {b.key: b.percentage for b in result.as_disclosed.equity_outer}
    assert outer == {"LARGE": Decimal("40"), "MID": Decimal(0), "SMALL": Decimal(0), "OTHER": Decimal("10")}
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
    assert _values(result.as_disclosed)["equity"] == Decimal("68.470") / Decimal("99.998") * 100
    # Short legs total -68.87%; the +12.88% derivative legs now belong to Others.
    assert result.excluded_share == Decimal("-68.870")
    assert _values(result.arbitrage_as_cash) == {"equity": Decimal(0), "debt": Decimal("100"), "gold": Decimal(0), "real_estate": Decimal(0), "others": Decimal(0)}


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
    assert classes["debt"].funds[0].value == Decimal("105")
    assert result.model_dump(mode="json")["as_disclosed"]["classes"][0]["funds"][0]["value"] == "570.000"


def test_arbitrage_as_cash_variant_moves_the_whole_fund_into_debt(db_session, monkeypatch):
    scheme = _scheme(db_session)
    scheme.sebi_category = "Arbitrage Fund"
    _batch(db_session, scheme, [("Stock", "EQ", "60", AssetType.EQUITY_DOMESTIC), ("Cash", None, "40", AssetType.CASH_EQUIVALENT)])
    result = _compute(db_session, monkeypatch, [_holding(scheme, "500")])
    cash = {r.key: r for r in result.arbitrage_as_cash.classes}["debt"]
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


# T1.2 regressions: raw signed percentages are stored unchanged by the disclosure writer.
def _five_class_example(db, monkeypatch, assets):
    scheme = _scheme(db)
    _batch(db, scheme, assets)
    return _compute(db, monkeypatch, [_holding(scheme, "1000")])


def test_reit_row_lands_in_real_estate_not_equity(db_session, monkeypatch):
    result = _five_class_example(db_session, monkeypatch, [("Stock", "EQ", "70", AssetType.EQUITY_DOMESTIC), ("REIT", "REIT", "30", AssetType.REIT_INVIT)])
    assert _values(result.as_disclosed)["equity"] == Decimal("70")
    assert _values(result.as_disclosed)["real_estate"] == Decimal("30")
    assert result.as_disclosed.cap_allocation.total_equity_value == Decimal("700")


def test_cash_equivalent_adds_to_debt_and_total_stays_100(db_session, monkeypatch):
    result = _five_class_example(db_session, monkeypatch, [("Bond", "B", "80", AssetType.DEBT), ("Cash", None, "20", AssetType.CASH_EQUIVALENT)])
    assert _values(result.as_disclosed)["debt"] == Decimal("100")
    assert set(_values(result.as_disclosed)) == {"equity", "debt", "gold", "real_estate", "others"}
    assert sum(_values(result.as_disclosed).values()) == Decimal("100")


def test_positive_derivative_and_unclassified_rows_land_in_others(db_session, monkeypatch):
    result = _five_class_example(db_session, monkeypatch, [("Stock", "EQ", "80", AssetType.EQUITY_DOMESTIC), ("Long option", None, "5", AssetType.DERIVATIVE), ("Unclassified", None, "15", AssetType.OTHER)])
    other = next((row for row in result.as_disclosed.classes if row.key == "others"), None)
    assert other is not None, "positive derivative and unclassified amounts need an Others class"
    assert other.value == Decimal("200") and other.percentage == Decimal("20")
    assert result.excluded_share == 0


def test_negative_futures_line_is_ignored_and_others_never_negative(db_session, monkeypatch):
    result = _five_class_example(db_session, monkeypatch, [("Stock", "EQ", "90", AssetType.EQUITY_DOMESTIC), ("Long option", None, "10", AssetType.DERIVATIVE), ("Short future", None, "-80", AssetType.DERIVATIVE)])
    assert _values(result.as_disclosed).get("others") == Decimal("10")
    assert result.excluded_share == Decimal("-80")
    assert sum(row.value for row in result.as_disclosed.classes) == Decimal("1000")


def test_five_classes_sum_to_100_within_rounding(db_session, monkeypatch):
    # Gross positive positions may exceed NAV when a derivative leg is disclosed separately.
    result = _five_class_example(db_session, monkeypatch, [("Stock", "EQ", "60", AssetType.EQUITY_DOMESTIC), ("Bond", "B", "20", AssetType.DEBT), ("Gold", "G", "10", AssetType.GOLD_SILVER), ("REIT", "R", "10", AssetType.REIT_INVIT), ("Long option", None, "5", AssetType.DERIVATIVE)])
    assert [row.key for row in result.as_disclosed.classes] == ["equity", "debt", "gold", "real_estate", "others"]
    assert abs(sum(_values(result.as_disclosed).values()) - Decimal("100")) <= Decimal("0.01")
    assert all(isinstance(row["percentage"], str) for row in result.model_dump(mode="json")["as_disclosed"]["classes"])


def test_arbitrage_as_cash_toggle_still_moves_the_whole_fund(db_session, monkeypatch):
    scheme = _scheme(db_session)
    scheme.sebi_category = "Arbitrage Fund"
    _batch(db_session, scheme, [("Stock", "EQ", "60", AssetType.EQUITY_DOMESTIC), ("Cash", None, "40", AssetType.CASH_EQUIVALENT), ("Short future", None, "-60", AssetType.DERIVATIVE)])
    result = _compute(db_session, monkeypatch, [_holding(scheme, "1000")])
    debt = next(row for row in result.arbitrage_as_cash.classes if row.key == "debt")
    assert debt.value == Decimal("1000") and debt.percentage == Decimal("100")
    assert [(fund.scheme_id, fund.value) for fund in debt.funds] == [(scheme.id, Decimal("1000"))]
    assert _values(result.arbitrage_as_cash)["equity"] == 0
    assert len(result.as_disclosed.equity_outer) == 4


def test_golden_contributing_funds_hybrid_index_arbitrage(db_session, monkeypatch):
    hybrid, index, arbitrage = [_scheme(db_session) for _ in range(3)]
    hybrid.sebi_category, index.sebi_category, arbitrage.sebi_category = "Aggressive Hybrid Fund", "Index Fund", "Arbitrage Fund"
    _batch(db_session, hybrid, [("Stock", "EQ", "60", AssetType.EQUITY_DOMESTIC), ("Bond", "B", "20", AssetType.DEBT), ("Cash", None, "10", AssetType.CASH_EQUIVALENT), ("REIT", "R", "5", AssetType.REIT_INVIT), ("Unknown", None, "5", AssetType.OTHER)])
    _batch(db_session, index, [("Index stock", "EQ", "90", AssetType.EQUITY_DOMESTIC), ("Cash", None, "5", AssetType.CASH_EQUIVALENT), ("Gold", "G", "5", AssetType.GOLD_SILVER)])
    _batch(db_session, arbitrage, [("Stock", "EQ", "60", AssetType.EQUITY_DOMESTIC), ("Cash", None, "40", AssetType.CASH_EQUIVALENT), ("Short future", None, "-60", AssetType.DERIVATIVE)])
    result = _compute(db_session, monkeypatch, [_holding(hybrid, "600"), _holding(index, "300"), _holding(arbitrage, "100")])
    # BY HAND: hybrid (600) -> equity360, debt120+cash60=180, REIT30, Others30.
    # Index (300) -> equity270, cash/debt15, gold15. Arbitrage (100) -> equity60,
    # cash/debt40; its -60 future is a -60 memo amount, never deducted from a class.
    # Totals: equity690, debt235, gold15, real estate30, Others30 = 1000; ignored share -6%.
    # Toggle: replace arbitrage equity60+debt40 with whole-fund debt100 -> equity630, debt235-40+100=295.
    disclosed = {row.key: row for row in result.as_disclosed.classes}
    assert {key: row.value for key, row in disclosed.items()} == {"equity": Decimal("690"), "debt": Decimal("235"), "gold": Decimal("15"), "real_estate": Decimal("30"), "others": Decimal("30")}
    assert result.excluded_share == Decimal("-6")
    assert [(fund.scheme_id, fund.value) for fund in disclosed["debt"].funds] == [(hybrid.id, Decimal("180")), (arbitrage.id, Decimal("40")), (index.id, Decimal("15"))]
    assert disclosed["debt"].funds[0].percentage == Decimal("180") / Decimal("235") * 100
    assert [(fund.scheme_id, fund.value) for fund in disclosed["others"].funds] == [(hybrid.id, Decimal("30"))]
    assert {row.key: row.value for row in result.arbitrage_as_cash.classes} == {"equity": Decimal("630"), "debt": Decimal("295"), "gold": Decimal("15"), "real_estate": Decimal("30"), "others": Decimal("30")}


def test_negative_unclassified_rows_do_not_make_others_negative(db_session, monkeypatch):
    result = _five_class_example(db_session, monkeypatch, [("Stock", "EQ", "100", AssetType.EQUITY_DOMESTIC), ("Unknown short", None, "-5", AssetType.OTHER)])
    assert _values(result.as_disclosed)["others"] == 0
    assert result.excluded_share == Decimal("-5")


def test_old_cash_like_payload_still_parses(db_session, monkeypatch):
    from app.services.analytics.schemas import AssetAllocationSummary
    payload = _five_class_example(db_session, monkeypatch, [("Cash", None, "100", AssetType.CASH_EQUIVALENT)]).model_dump(mode="json")
    for variant in (payload["as_disclosed"], payload["arbitrage_as_cash"]):
        variant["classes"] = [dict(key="cash_like", value="1000", percentage="100")]
    parsed = AssetAllocationSummary.model_validate(payload)
    assert parsed.as_disclosed.classes[0].key == "cash_like"
    assert parsed.as_disclosed.classes[0].funds is None
    assert parsed.as_disclosed.equity_outer is not None
