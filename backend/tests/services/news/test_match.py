"""T5 (D4): build_watchlist. R-numbers refer to the handoff's section 9
scenario list; R1-R5/R7-R10/R12 are score.py's (test_score.py)."""

from __future__ import annotations

import asyncio
import uuid
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from app.models.enums import AssetType, DisclosureBatchStatus, PlanType, SchemePlanType
from app.models.reference import DisclosureBatch, Scheme, SchemeHolding, StockMaster
from app.services.dashboard.schemas import HoldingRow
from app.services.home.allocation import Allocation, ClassRow
from app.services.home.context import load_home_inputs, resolve_scope
from app.services.home.allocation import load_allocation
from app.services.home.stored import StoredSection, load_fresh_sections, scope_key_for
from app.services.news.match import build_watchlist

TODAY = date(2026, 10, 23)


def make_holding(*, scheme_id=None, scheme_name="A fund", amc_name="Some AMC",
                  sebi_category="Large Cap Fund", current_value="1000.00") -> HoldingRow:
    return HoldingRow(
        scheme_id=scheme_id or str(uuid.uuid4()),
        scheme_name=scheme_name,
        amc_name=amc_name,
        household_member_id=str(uuid.uuid4()),
        household_member_name="Someone",
        plan_type=PlanType.DIRECT,
        units_held="100",
        average_nav="10",
        current_nav="10",
        current_nav_date=TODAY,
        amount_invested="1000.00",
        current_value=current_value,
        current_profit_total="0.00",
        realized_gain="0.00",
        unrealized_gain="0.00",
        today_gain="0.00",
        sebi_category=sebi_category,
    )


def make_allocation(total_value: str, *, gold_pct=None, debt_pct=None) -> Allocation:
    classes = (
        ClassRow("equity", "Equity", "live", None, None),
        ClassRow("debt", "Debt", "live", None, None if debt_pct is None else Decimal(debt_pct)),
        ClassRow("gold", "Gold", "live", None, None if gold_pct is None else Decimal(gold_pct)),
        ClassRow("others", "Others", "live", None, None),
    )
    return Allocation(
        source="analytics", approximate=False, total_value=Decimal(total_value),
        classes=classes, covered_pct=None, mix_as_of=None, mix_computed_at=None, members=None,
    )


def make_stock_holdings_section(rows, *, coverage_pct="100.00", holdings_as_of="2026-09-30"):
    return {
        "stock_holdings": StoredSection(
            section="stock_holdings",
            payload={"rows": rows, "coverage": {"covered_value_pct": coverage_pct},
                      "holdings_as_of": holdings_as_of},
            computed_at=None,
        )
    }


def test_r6_top_5_and_minimum_stock():
    rows = [
        {"instrument_name": f"Stock {pct}", "isin": f"ISIN{pct}", "exposure_pct": pct}
        for pct in ("9.00", "8.00", "7.00", "6.00", "5.00", "4.00", "3.00")
    ]
    sections = make_stock_holdings_section(rows)
    watch = build_watchlist(
        None, SimpleNamespace(id=uuid.uuid4()), None, holdings=[],
        allocation=make_allocation("0.00"), sections=sections, today=TODAY,
    )
    assert len(watch.entities) == 5
    assert {e.key for e in watch.entities} == {"ISIN9.00", "ISIN8.00", "ISIN7.00", "ISIN6.00", "ISIN5.00"}


def test_r6_stock_minimum_boundary_at_1_pct():
    rows = [
        {"instrument_name": "Just under", "isin": "ISINA", "exposure_pct": "0.99"},
        {"instrument_name": "Just at", "isin": "ISINB", "exposure_pct": "1.00"},
    ]
    sections = make_stock_holdings_section(rows)
    watch = build_watchlist(
        None, SimpleNamespace(id=uuid.uuid4()), None, holdings=[],
        allocation=make_allocation("0.00"), sections=sections, today=TODAY,
    )
    assert {e.key for e in watch.entities} == {"ISINB"}


def test_r6_sixth_ranked_stock_excluded_even_above_the_minimum():
    rows = [
        {"instrument_name": f"Stock {i}", "isin": f"ISIN{i}", "exposure_pct": str(pct)}
        for i, pct in enumerate([20, 19, 18, 17, 16, 15], start=1)
    ]
    sections = make_stock_holdings_section(rows)
    watch = build_watchlist(
        None, SimpleNamespace(id=uuid.uuid4()), None, holdings=[],
        allocation=make_allocation("0.00"), sections=sections, today=TODAY,
    )
    assert "ISIN6" not in {e.key for e in watch.entities}
    assert len(watch.entities) == 5


def test_r11_coverage_below_50_nulls_exposure_pct_for_lookthrough_entities():
    rows = [{"instrument_name": "Stock A", "isin": "ISINA", "exposure_pct": "5.00"}]
    sections = make_stock_holdings_section(rows, coverage_pct="49.99", holdings_as_of="2026-09-01")
    watch = build_watchlist(
        None, SimpleNamespace(id=uuid.uuid4()), None, holdings=[],
        allocation=make_allocation("0.00"), sections=sections, today=TODAY,
    )
    assert watch.entities[0].exposure_pct is None
    assert watch.coverage_pct == Decimal("49.99")
    assert watch.holdings_as_of == date(2026, 9, 1)


def test_r11_coverage_at_50_keeps_exposure_pct():
    rows = [{"instrument_name": "Stock A", "isin": "ISINA", "exposure_pct": "5.00"}]
    sections = make_stock_holdings_section(rows, coverage_pct="50.00")
    watch = build_watchlist(
        None, SimpleNamespace(id=uuid.uuid4()), None, holdings=[],
        allocation=make_allocation("0.00"), sections=sections, today=TODAY,
    )
    assert watch.entities[0].exposure_pct == Decimal("5.00")


def test_r11_fund_house_always_has_its_percentage_regardless_of_coverage(db_session):
    holdings = [make_holding(amc_name="HDFC Mutual Fund", current_value="1000.00")]
    sections = make_stock_holdings_section(
        [{"instrument_name": "Stock A", "isin": "ISINA", "exposure_pct": "5.00"}],
        coverage_pct="10.00",
    )
    watch = build_watchlist(
        db_session, SimpleNamespace(id=uuid.uuid4()), None, holdings=holdings,
        allocation=make_allocation("1000.00"), sections=sections, today=TODAY,
    )
    house = next(e for e in watch.entities if e.kind == "fund_house")
    assert house.exposure_pct == Decimal("100.00")


def test_r13_sector_arithmetic(db_session):
    fund_a = uuid.uuid4()
    fund_b = uuid.uuid4()
    db_session.add_all([
        StockMaster(isin="ISIN_FIN", name="Fin Co", sector="Financial Services", as_of_date=TODAY, source="t"),
        StockMaster(isin="ISIN_IT1", name="IT Co 1", sector="Information Technology", as_of_date=TODAY, source="t"),
        StockMaster(isin="ISIN_IT2", name="IT Co 2", sector="Information Technology", as_of_date=TODAY, source="t"),
    ])
    db_session.add_all([
        Scheme(id=fund_a, name="Fund A", amc_name="AMC", sebi_category="Large Cap Fund",
               plan_type=SchemePlanType.DIRECT),
        Scheme(id=fund_b, name="Fund B", amc_name="AMC", sebi_category="Large Cap Fund",
               plan_type=SchemePlanType.DIRECT),
    ])
    db_session.flush()
    batch_a = DisclosureBatch(id=uuid.uuid4(), scheme_id=fund_a, as_of_date=TODAY,
                               amc_name="AMC", status=DisclosureBatchStatus.WRITTEN)
    batch_b = DisclosureBatch(id=uuid.uuid4(), scheme_id=fund_b, as_of_date=TODAY,
                               amc_name="AMC", status=DisclosureBatchStatus.WRITTEN)
    db_session.add_all([batch_a, batch_b])
    db_session.flush()
    db_session.add_all([
        SchemeHolding(id=uuid.uuid4(), batch_id=batch_a.id, instrument_name="Fin Co", isin="ISIN_FIN",
                      asset_type=AssetType.EQUITY_DOMESTIC, market_value=Decimal("1"), pct_to_nav=Decimal("40")),
        SchemeHolding(id=uuid.uuid4(), batch_id=batch_a.id, instrument_name="IT Co 1", isin="ISIN_IT1",
                      asset_type=AssetType.EQUITY_DOMESTIC, market_value=Decimal("1"), pct_to_nav=Decimal("20")),
        SchemeHolding(id=uuid.uuid4(), batch_id=batch_b.id, instrument_name="IT Co 2", isin="ISIN_IT2",
                      asset_type=AssetType.EQUITY_DOMESTIC, market_value=Decimal("1"), pct_to_nav=Decimal("50")),
    ])
    db_session.commit()

    holdings = [
        make_holding(scheme_id=str(fund_a), current_value="600.00"),
        make_holding(scheme_id=str(fund_b), current_value="400.00"),
    ]
    watch = build_watchlist(
        db_session, SimpleNamespace(id=uuid.uuid4()), None, holdings=holdings,
        allocation=make_allocation("1000.00"), sections={}, today=TODAY,
    )
    sectors = {e.key: e.exposure_pct for e in watch.entities if e.kind == "sector"}
    assert sectors == {"banks_financials": Decimal("24.00"), "it_tech": Decimal("32.00")}


def test_r14_build_watchlist_on_home_fixture_family_scope():
    from tests.api.home_fixture import FIXED_NOW, build_home_fixture
    from sqlalchemy.orm import Session

    runtime = build_home_fixture()
    try:
        with Session(runtime.engine) as db:
            user = SimpleNamespace(id=runtime.household.user_id)
            ctx = resolve_scope(db, user, None)
            today = FIXED_NOW.date()
            inputs = asyncio.run(load_home_inputs(
                db, ctx, today, nav_start=today, view="fund",
            ))
            allocation = asyncio.run(load_allocation(
                db, user.id, scope=ctx.scope, household_member_ids=ctx.member_ids,
                members=[(uuid.UUID(m.id), m.name) for m in ctx.members],
            ))
            sections = load_fresh_sections(
                db, user.id, scope_key=scope_key_for(ctx.scope, ctx.member_ids),
                sections=("stock_holdings",), household_member_ids=ctx.member_ids,
            )
            watch = build_watchlist(
                db, user, ctx, holdings=inputs.holdings, allocation=allocation,
                sections=sections, today=today,
            )
        by_kind_key = {(e.kind, e.key): e.exposure_pct for e in watch.entities}

        houses = {e.exposure_pct for e in watch.entities if e.kind == "fund_house"}
        assert houses == {Decimal("100.00")}

        assert by_kind_key[("fund_category", "large_cap")] == Decimal("23.22")
        assert by_kind_key[("fund_category", "flexi_cap")] == Decimal("18.99")
        assert by_kind_key[("fund_category", "short_duration")] == Decimal("38.41")
        assert by_kind_key[("asset_class", "gold_silver")] == Decimal("19.38")
        assert by_kind_key[("rates_macro", "rates")] == Decimal("38.41")

        stock_keys = {e.key for e in watch.entities if e.kind == "stock"}
        assert stock_keys == {f"INE0000000{n}" for n in range(1, 6)}
        assert {e.exposure_pct for e in watch.entities if e.kind == "stock"} == {Decimal("5.00")}
    finally:
        runtime.close()


def test_r15_no_holdings_gives_an_empty_watch():
    watch = build_watchlist(
        None, SimpleNamespace(id=uuid.uuid4()), None, holdings=[],
        allocation=make_allocation("0.00"), sections={}, today=TODAY,
    )
    assert watch.entities == ()
