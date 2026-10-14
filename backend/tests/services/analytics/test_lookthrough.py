import uuid
from decimal import Decimal
from types import SimpleNamespace

import asyncio
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from app.models.enums import AssetType, DisclosureBatchStatus
from app.models.reference import DisclosureBatch, Scheme, SchemeHolding


NAV_DATE = date(2026, 10, 13)


def _scheme(db, amc="Nippon India Mutual Fund"):
    scheme = Scheme(id=uuid.uuid4(), name=f"Fund {uuid.uuid4().hex}",
                    amc_name=amc, sebi_category="Equity", base_name=f"Base {uuid.uuid4().hex}")
    db.add(scheme)
    db.flush()
    return scheme


def _holding(scheme, value, nav_date=NAV_DATE):
    return SimpleNamespace(scheme_id=str(scheme.id), current_value=value,
                           current_nav_date=nav_date)


def _batch(db, scheme, weights, as_of=date(2026, 9, 30), status=DisclosureBatchStatus.WRITTEN):
    batch = DisclosureBatch(id=uuid.uuid4(), scheme_id=scheme.id, amc_name=scheme.amc_name,
                            as_of_date=as_of, status=status)
    db.add(batch)
    db.flush()
    for name, isin, weight, asset in weights:
        db.add(SchemeHolding(batch_id=batch.id, instrument_name=name, isin=isin,
                             pct_to_nav=Decimal(weight), market_value=Decimal("1"),
                             sector_raw=f"Sector {name}", asset_type=asset))
    db.flush()
    return batch


def _compute(db, monkeypatch, holdings, ids=None):
    from app.services.analytics import lookthrough
    monkeypatch.setattr(lookthrough, "compute_holdings", AsyncMock(return_value=holdings))
    return asyncio.run(lookthrough.compute_lookthrough_table(db, ids or [uuid.uuid4()]))


def test_reliance_weighted_example_and_largest_contributor_metadata(db_session, monkeypatch):
    schemes = [_scheme(db_session) for _ in range(3)]
    for i, (scheme, weight) in enumerate(zip(schemes, ("8", "6", "5"))):
        _batch(db_session, scheme, [(f"Reliance {i}", "INE002A01018", weight, AssetType.EQUITY_DOMESTIC)])
    result = _compute(db_session, monkeypatch,
                      [_holding(s, v) for s, v in zip(schemes, ("400000", "350000", "250000"))])
    row = result.rows[0]
    assert row.exposure_pct == Decimal("6.55")
    assert row.exposure_value == Decimal("65500")
    assert row.instrument_name == "Reliance 0"
    assert row.sector_raw == "Sector Reliance 0"
    assert [f.fund_weight_pct for f in row.contributing_funds] == [Decimal("40"), Decimal("35"), Decimal("25")]
    assert [f.stock_weight_pct for f in row.contributing_funds] == [Decimal("8"), Decimal("6"), Decimal("5")]
    assert result.coverage.covered_value_pct == Decimal("100")
    assert result.nav_as_of == NAV_DATE
    assert result.holdings_as_of == date(2026, 9, 30)


def test_null_isins_never_merge_even_with_identical_names(db_session, monkeypatch):
    a, b = [_scheme(db_session) for _ in range(2)]
    for s in (a, b):
        _batch(db_session, s, [("TREPS", None, "50", AssetType.CASH_EQUIVALENT),
                               ("TREPS", None, "25", AssetType.CASH_EQUIVALENT)])
    table = _compute(db_session, monkeypatch, [_holding(a, "100"), _holding(b, "100")])
    assert len(table.rows) == 4
    assert all(len(row.contributing_funds) == 1 for row in table.rows)
    assert sum((r.exposure_pct for r in table.rows), Decimal(0)) == Decimal("75")


def test_latest_written_batch_at_or_before_each_funds_nav(db_session, monkeypatch):
    a, b = [_scheme(db_session) for _ in range(2)]
    for s in (a, b):
        _batch(db_session, s, [("Old", "OLD", "5", AssetType.EQUITY_DOMESTIC)], date(2026, 8, 31))
        _batch(db_session, s, [("New", "NEW", "10", AssetType.EQUITY_DOMESTIC)], date(2026, 9, 30))
        _batch(db_session, s, [("Failed", "FAIL", "90", AssetType.EQUITY_DOMESTIC)], date(2026, 10, 1), DisclosureBatchStatus.FAILED)
        _batch(db_session, s, [("Manual", "MANUAL", "90", AssetType.EQUITY_DOMESTIC)], date(2026, 10, 2), DisclosureBatchStatus.AWAITING_MANUAL_UPLOAD)
        _batch(db_session, s, [("Future", "FUTURE", "90", AssetType.EQUITY_DOMESTIC)], date(2026, 10, 31))
    table = _compute(db_session, monkeypatch, [_holding(a, "100"), _holding(b, "100", date(2026, 9, 15))])
    assert {r.isin: r.exposure_pct for r in table.rows} == {"NEW": Decimal("5"), "OLD": Decimal("2.5")}
    assert table.holdings_as_of == date(2026, 8, 31)


def test_coverage_by_value_reasons_missing_nav_and_headline_threshold(db_session, monkeypatch):
    amcs = ["Nippon India Mutual Fund", "Nippon India Mutual Fund", "No content AMC", "HSBC Mutual Fund", "HSBC Mutual Fund"]
    schemes = [_scheme(db_session, amc) for amc in amcs]
    _batch(db_session, schemes[0], [("Stock", "ONE", "100", AssetType.EQUITY_DOMESTIC)])
    # An AMC that has had a WRITTEN batch is publishable even for a new scheme.
    _batch(db_session, _scheme(db_session, "HSBC Mutual Fund"), [], date(2026, 9, 30))
    table = _compute(db_session, monkeypatch, [_holding(s, v) for s, v in zip(schemes, ("400", "300", "200", "100", None))])
    assert table.total_portfolio_value == Decimal("1000")
    assert table.coverage.covered_value_pct == Decimal("40")
    assert [(f.scheme_id, f.scheme_name) for f in table.coverage.not_published_yet] == [(s.id, s.name) for s in (schemes[1], schemes[3])]
    assert [(f.scheme_id, f.scheme_name) for f in table.coverage.not_available_from_amc] == [(schemes[2].id, schemes[2].name)]
    assert [(f.scheme_id, f.scheme_name) for f in table.coverage.missing_value_schemes] == [(schemes[4].id, schemes[4].name)]
    assert table.coverage.funds[0].scheme_name == schemes[0].name
    assert table.rows[0].contributing_funds[0].scheme_name == schemes[0].name
    assert table.hide_headlines is True
    table = _compute(db_session, monkeypatch, [_holding(schemes[0], "500"), _holding(schemes[1], "500")])
    assert table.hide_headlines is False
    assert table.rows[0].exposure_pct == Decimal("50")


def test_manual_amc_with_no_written_history_is_unavailable(db_session, monkeypatch):
    scheme = _scheme(db_session, "HSBC Mutual Fund")
    _batch(db_session, scheme, [], status=DisclosureBatchStatus.FAILED)
    table = _compute(db_session, monkeypatch, [_holding(scheme, "100")])
    assert [(f.scheme_id, f.scheme_name) for f in table.coverage.not_available_from_amc] == [(scheme.id, scheme.name)]
    assert table.rows == []
    assert table.holdings_as_of is None


@pytest.mark.parametrize("age,tag", [(60, None), (61, "older_than_60_days")])
def test_monthly_age_boundary_keeps_old_batch(db_session, monkeypatch, age, tag):
    scheme = _scheme(db_session)
    _batch(db_session, scheme, [("Stock", "ONE", "100", AssetType.EQUITY_DOMESTIC)], NAV_DATE - timedelta(days=age))
    table = _compute(db_session, monkeypatch, [_holding(scheme, "100")])
    assert table.coverage.funds[0].age_tag == tag
    assert table.coverage.covered_value_pct == Decimal("100")
    assert table.rows[0].contributing_funds[0].age_tag == tag


@pytest.mark.parametrize("nav,tag", [(date(2026, 8, 31), "on_cycle"), (NAV_DATE, "older_than_60_days")])
def test_half_yearly_cycle_not_indefinitely_fresh(db_session, monkeypatch, nav, tag):
    scheme = _scheme(db_session, "Taurus Mutual Fund")
    _batch(db_session, scheme, [("Stock", "ONE", "100", AssetType.EQUITY_DOMESTIC)], date(2026, 3, 31))
    table = _compute(db_session, monkeypatch, [_holding(scheme, "100", nav)])
    assert table.coverage.funds[0].age_tag == tag
    assert table.coverage.funds[0].cadence == "half_yearly"
    assert table.coverage.covered_value_pct == Decimal("100")


@pytest.mark.parametrize("count", [40, 100, 150])
def test_cap_sorts_before_cutting_and_preserves_original_count(db_session, monkeypatch, count):
    from app.services.analytics.lookthrough import compute_stock_holdings
    scheme = _scheme(db_session)
    _batch(db_session, scheme, [(f"Stock {i}", f"ISIN{i:04}", str(i + 1), AssetType.EQUITY_DOMESTIC) for i in range(count)])
    ids = [uuid.uuid4()]
    table = _compute(db_session, monkeypatch, [_holding(scheme, "1000")], ids)
    assert len(table.rows) == count
    result = asyncio.run(compute_stock_holdings(db_session, ids))
    assert len(result.rows) == min(100, count)
    assert result.total_stock_count == count
    assert result.truncated is (count > 100)
    assert result.rows[0].isin == f"ISIN{count - 1:04}"


def test_equity_section_and_excluded_signed_share(db_session, monkeypatch):
    from app.services.analytics.lookthrough import compute_stock_holdings
    scheme = _scheme(db_session)
    assets = [("Domestic", "D", "60", AssetType.EQUITY_DOMESTIC),
              ("Foreign", "F", "10", AssetType.EQUITY_INTERNATIONAL),
              ("Debt", "B", "15", AssetType.DEBT),
              ("Gold", "G", "5", AssetType.GOLD_SILVER),
              ("Cash", None, "10", AssetType.CASH_EQUIVALENT),
              ("Future", "D", "-20", AssetType.DERIVATIVE),
              ("Other", None, "2", AssetType.OTHER)]
    _batch(db_session, scheme, assets)
    ids = [uuid.uuid4()]
    table = _compute(db_session, monkeypatch, [_holding(scheme, "1000")], ids)
    assert len(table.rows) == 5
    assert table.excluded_share == Decimal("-18")
    result = asyncio.run(compute_stock_holdings(db_session, ids))
    assert [r.isin for r in result.rows] == ["D", "F"]
    assert result.non_equity_share == Decimal("30")  # debt + gold + cash only; derivative/other lines are excluded, never netted in
    assert result.excluded_share == Decimal("-18")
    payload = result.model_dump(mode="json")
    assert isinstance(payload["rows"][0]["exposure_pct"], str)
    assert Decimal(payload["rows"][0]["exposure_pct"]) == Decimal("60")
    assert payload["coverage"]["funds"][0]["scheme_id"] == str(scheme.id)


def test_memo_scope_order_and_session_isolation(db_session, monkeypatch):
    from app.services.analytics import lookthrough
    table = _compute(db_session, monkeypatch, [])
    spy = AsyncMock(return_value=table)
    monkeypatch.setattr(lookthrough, "compute_lookthrough_table", spy)
    a, b = uuid.uuid4(), uuid.uuid4()
    async def sections():
        first = await lookthrough.get_lookthrough_table(db_session, [a, b])
        await lookthrough.compute_stock_holdings(db_session, [b, a])
        assert first is await lookthrough.get_lookthrough_table(db_session, [a, b])
        await lookthrough.get_lookthrough_table(db_session, [a])
    asyncio.run(sections())
    assert spy.await_count == 2
    assert (a,) in db_session.info["lookthrough"]
    from sqlalchemy.orm import Session
    with Session(db_session.get_bind()) as other:
        asyncio.run(lookthrough.get_lookthrough_table(other, [a, b]))
    assert spy.await_count == 3


def test_empty_and_missing_nav_values_are_explicit(db_session, monkeypatch):
    table = _compute(db_session, monkeypatch, [])
    assert table.rows == [] and table.hide_headlines
    assert table.nav_as_of is None and table.holdings_as_of is None
    assert table.coverage.covered_value_pct == Decimal("0")


def test_stock_cap_never_loses_equity_to_large_non_equity_rows(db_session, monkeypatch):
    from app.services.analytics.lookthrough import compute_stock_holdings
    scheme = _scheme(db_session)
    weights = [(f"Stock {i}", f"EQ{i:03}", "0.1", AssetType.EQUITY_DOMESTIC) for i in range(150)]
    weights += [("Debt", "BOND", "80", AssetType.DEBT),
                ("Cash", None, "5", AssetType.CASH_EQUIVALENT),
                ("Derivative", "EQ001", "-10", AssetType.DERIVATIVE),
                ("Other", None, "2", AssetType.OTHER)]
    _batch(db_session, scheme, weights)
    ids = [uuid.uuid4()]
    table = _compute(db_session, monkeypatch, [_holding(scheme, "1000")], ids)
    assert len(table.rows) == 152
    assert table.truncated is False
    result = asyncio.run(compute_stock_holdings(db_session, ids))
    assert len(result.rows) == 100 and result.total_stock_count == 150 and result.truncated
    assert all(row.asset_type == AssetType.EQUITY_DOMESTIC for row in result.rows)
    assert result.non_equity_share == Decimal("85")  # same rule: the -8% derivative leg is not netted into non-equity
    assert result.excluded_share == Decimal("-8")


def test_repeated_instrument_rows_have_one_fund_contribution(db_session, monkeypatch):
    scheme = _scheme(db_session)
    _batch(db_session, scheme, [("Stock small", "ONE", "2", AssetType.EQUITY_DOMESTIC),
                               ("Stock large", "ONE", "5", AssetType.EQUITY_DOMESTIC)])
    table = _compute(db_session, monkeypatch, [_holding(scheme, "1000")])
    row = table.rows[0]
    assert row.exposure_pct == Decimal("7")
    assert row.instrument_name == "Stock large"
    assert len(row.contributing_funds) == 1
    assert row.contributing_funds[0].stock_weight_pct == Decimal("7")


def test_real_parsed_written_sheets(db_session, monkeypatch):
    from app.services.analytics.lookthrough import compute_stock_holdings
    from app.services.analytics.amfi_factsheet_client import build_families
    from app.services.analytics.portfolio_disclosure_parsing import parse_workbook
    from app.services.analytics.portfolio_disclosure_writer import write_disclosure_batch
    root = Path(__file__).resolve().parents[2] / "fixtures" / "portfolio_disclosures"
    cases = [("zerodha-arbitrage_asof_2026-09-30.xlsx", "Zerodha Mutual Fund"),
             ("monarch-overnight-monthly_asof_2026-09-30.xls", "Monarch Networth Mutual Fund"),
             ("union-flexi-cap_asof_2026-09-30.xlsx", "Union Mutual Fund")]
    holdings, source = [], []
    for name, amc in cases:
        sheet = next(s for s in parse_workbook((root / name).read_bytes()) if s.holdings)
        assert sheet.error is None
        scheme = _scheme(db_session, amc)
        write_disclosure_batch(db_session, build_families([scheme])[0], date(2026, 9, 30), amc,
                               f"https://example.test/{name}", sheet.holdings, "EXACT", Decimal("1"),
                               declared_total=sheet.declared_total)
        batch = db_session.query(DisclosureBatch).filter_by(scheme_id=scheme.id).one()
        assert batch.status == DisclosureBatchStatus.WRITTEN
        source.extend(db_session.query(SchemeHolding).filter_by(batch_id=batch.id).all())
        holdings.append(_holding(scheme, "100000"))
    ids = [uuid.uuid4()]
    table = _compute(db_session, monkeypatch, holdings, ids)
    eligible = [h for h in source if h.asset_type not in (AssetType.DERIVATIVE, AssetType.OTHER)]
    grouped = {}
    for h in eligible:
        key = h.isin or str(h.id)
        grouped[key] = grouped.get(key, Decimal(0)) + h.pct_to_nav / 3
    assert table.total_stock_count == len({h.isin or str(h.id) for h in eligible if h.asset_type in (AssetType.EQUITY_DOMESTIC, AssetType.EQUITY_INTERNATIONAL)})
    assert len(table.rows) == len(grouped)
    assert len(table.rows) == 117 and table.total_stock_count == 108
    section = asyncio.run(compute_stock_holdings(db_session, ids))
    assert len(section.rows) == 100 and section.total_stock_count == 108 and section.truncated
    assert table.coverage.covered_value_pct == Decimal("100")
    assert table.excluded_share.quantize(Decimal("0.000001")) == (sum((h.pct_to_nav for h in source if h not in eligible), Decimal(0)) / 3).quantize(Decimal("0.000001"))
    # Overnight is entirely ISIN-less; its two rows survive as separate contributions.
    overnight = [r for r in table.rows if any(f.scheme_id == uuid.UUID(holdings[1].scheme_id) for f in r.contributing_funds)]
    assert len(overnight) == 2 and all(r.isin is None for r in overnight)
    for row in table.rows:
        if row.isin:
            assert row.exposure_pct.quantize(Decimal("0.000001")) == grouped[row.isin].quantize(Decimal("0.000001"))
    assert all(r.asset_type not in (AssetType.DERIVATIVE, AssetType.OTHER) for r in table.rows)


def test_scheme_values_sums_folios_and_reports_missing_values():
    from app.services.analytics.lookthrough import scheme_values

    a, b, c = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    holdings = [
        SimpleNamespace(scheme_id=str(a), current_value="123.45"),
        SimpleNamespace(scheme_id=str(a), current_value="76.55"),
        SimpleNamespace(scheme_id=str(b), current_value="300.00"),
        SimpleNamespace(scheme_id=str(c), current_value=None),
        SimpleNamespace(scheme_id=str(a), current_value=None),
    ]
    values, total, missing = scheme_values(holdings)
    assert values == {a: Decimal("200.00"), b: Decimal("300.00")}
    assert total == Decimal("500.00")
    assert set(missing) == {a, c}
    assert all(isinstance(key, uuid.UUID) for key in values)


def test_scheme_values_empty():
    from app.services.analytics.lookthrough import scheme_values

    assert scheme_values([]) == ({}, Decimal("0"), [])
