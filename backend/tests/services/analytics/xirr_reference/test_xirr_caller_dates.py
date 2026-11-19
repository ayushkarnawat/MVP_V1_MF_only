import asyncio
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from app.models.enums import BenchmarkIndex, BenchmarkReturnType, SchemePlanType, TransactionType
from app.models.reference import BenchmarkIndexHistory, NavHistory, SchemeBenchmark
from app.models.transaction import Transaction
from app.services.analytics import benchmark, benchmark_windows
from app.services.dashboard import holdings, nav, snapshots, xirr as dashboard_xirr
from app.services.fund_page import returns, summary
from app.services.fund_page.scope import ScopeContext
from scripts.xirr_caller_audit import (
    APP_TODAY, IST_TODAY, NAV_DATE, PURCHASE, REDEMPTION, WINDOW_START,
    AuditDate, format_table, record_solver,
)
from tests.services.fund_page.factories import add_folio, add_purchase, add_scheme, add_user_household


@pytest.fixture(autouse=True)
def offline_prices(monkeypatch):
    monkeypatch.setattr(nav, "_fetch_nav_history", AsyncMock(return_value=[]))
    monkeypatch.setattr(benchmark, "ensure_index_history_fresh", AsyncMock())
    monkeypatch.setattr(summary, "ensure_recent_nav", AsyncMock())


def test_every_caller_ends_the_same_household_on_the_price_date(db_session, monkeypatch, capsys):
    db = db_session
    household = add_user_household(db, key="xirr-audit")
    scheme = add_scheme(db, "xirr-audit", "Equity Scheme - Flexi Cap Fund", SchemePlanType.DIRECT, "XR2")
    folio = add_folio(db, scheme, household.asha_id, "XR2-A")
    purchase = add_purchase(db, folio, PURCHASE, Decimal("100"), Decimal("10"))
    db.add(Transaction(
        folio_id=folio.id, import_id=purchase.import_id, type=TransactionType.REDEMPTION,
        date=REDEMPTION, amount=Decimal("200"), units=Decimal("10"), nav=Decimal("20"),
    ))
    db.add_all([
        NavHistory(scheme_id=scheme.id, date=day, nav=Decimal(price))
        for day, price in ((PURCHASE, "10"), (WINDOW_START, "11"), (NAV_DATE, "14"))
    ])
    declared_index = BenchmarkIndex.NIFTY_50
    db.add(SchemeBenchmark(
        scheme_id=scheme.id, declared_benchmark_name="Synthetic Index", mapped_index_key=declared_index,
        match_quality="exact", verified_on=IST_TODAY,
    ))
    for index in benchmark.LEGACY_BENCHMARK_INDICES:
        closes = ("155", "175", "185") if index == declared_index else ("150", "160", "170")
        db.add_all([
            BenchmarkIndexHistory(index_name=index, date=day, value=Decimal(price), return_type=BenchmarkReturnType.TRI)
            for day, price in zip(
                (PURCHASE, WINDOW_START, REDEMPTION, NAV_DATE, APP_TODAY, IST_TODAY),
                ("100", "110", "125", *closes), strict=True,
            )
        ])
    db.commit()

    for module in (dashboard_xirr, holdings, benchmark, benchmark_windows, snapshots):
        monkeypatch.setattr(module, "date", AuditDate)
    monkeypatch.setattr(benchmark_windows, "ist_today", lambda: IST_TODAY)
    rows = []
    for module in (dashboard_xirr, benchmark, benchmark_windows, returns):
        monkeypatch.setattr(module, "xirr", record_solver(module.xirr, rows))
    monkeypatch.setattr(benchmark_windows, "xirr_fast", record_solver(benchmark_windows.xirr_fast, rows))

    async def exercise_callers():
        member_ids = [household.asha_id, household.dev_id]
        scope = ScopeContext(member_ids, "combined", True)
        holding_rows = await holdings.compute_holdings(db, member_ids, stored_only=True)
        dashboard_xirr.calculate_dashboard_xirr(db, member_ids, holding_rows)
        portfolio = await benchmark.compute_portfolio_vs_benchmarks(db, member_ids)
        funds = await benchmark.compute_fund_vs_benchmark(db, member_ids)
        await summary.build_summary(db, scheme, scope, household.user_id, APP_TODAY)
        await returns.current_returns(db, scheme, scope, household.user_id, APP_TODAY)
        return portfolio, funds

    portfolio, funds = asyncio.run(exercise_callers())
    with capsys.disabled():
        print(format_table(list(dict.fromkeys(rows))), end="")

    assert portfolio.windows[0].start_date == WINDOW_START
    assert funds.funds[0].windows[0].fund_xirr is not None
    assert funds.declared_comparison[0].windows[0].benchmark_xirr is not None
    ends_by_caller = {}
    for caller, flows, _ in rows:
        ends_by_caller.setdefault(caller, set()).add(flows[-1][0])
    assert ends_by_caller == {
        caller: {NAV_DATE}
        for caller in (
            "dashboard.xirr.portfolio_xirr <- dashboard.xirr.calculate_dashboard_xirr",
            "dashboard.xirr.portfolio_xirr <- analytics.benchmark.compute_portfolio_vs_benchmarks",
            "dashboard.xirr.portfolio_xirr <- analytics.benchmark.compute_fund_vs_benchmark",
            "analytics.benchmark._benchmark_xirr_for_transactions",
            "analytics.benchmark_windows.compute_window_rows",
            "analytics.benchmark_windows.compute_fund_window_rows",
            "analytics.benchmark_windows.index_window_xirr",
            "analytics.benchmark_windows.audited_index_replay",
            "dashboard.xirr.portfolio_xirr <- fund_page.summary.build_summary",
            "fund_page.returns.current_returns",
            "fund_page.returns._benchmark_xirr",
        )
    }


def test_household_with_every_fund_priced_is_unchanged_by_the_unpriced_rule(db_session):
    db = db_session
    household = add_user_household(db)
    today = date.today()
    purchase_date = today - timedelta(days=365)
    import_id = None
    for key, price in (("held-a", "11"), ("held-b", "12"), ("sold", "13")):
        scheme = add_scheme(db, key, "Equity", SchemePlanType.DIRECT, key)
        folio = add_folio(db, scheme, household.asha_id, key)
        if import_id is None:
            import_id = add_purchase(db, folio, purchase_date, Decimal("100"), Decimal("10")).import_id
        else:
            db.add(Transaction(
                folio_id=folio.id, import_id=import_id, type=TransactionType.PURCHASE,
                date=purchase_date, units=Decimal("100"), nav=Decimal("10"), amount=Decimal("1000"),
            ))
        if key == "sold":
            db.add(Transaction(
                folio_id=folio.id, import_id=import_id, type=TransactionType.REDEMPTION,
                date=today, units=Decimal("100"), nav=Decimal(price), amount=Decimal("1300"),
            ))
        else:
            db.add(NavHistory(scheme_id=scheme.id, date=today, nav=Decimal(price)))
    db.commit()

    async def rates():
        member_ids = [household.asha_id]
        holding_rows = await holdings.compute_holdings(db, member_ids, stored_only=True)
        tile = dashboard_xirr.calculate_dashboard_xirr(db, member_ids, holding_rows)
        portfolio = await benchmark.compute_portfolio_vs_benchmarks(db, member_ids)
        funds = await benchmark.compute_fund_vs_benchmark(db, member_ids)
        return tile, portfolio, funds

    tile, portfolio, funds = asyncio.run(rates())
    tolerance = Decimal("0.000001")
    assert Decimal(tile.current_holdings_xirr) == pytest.approx(Decimal("0.15"), abs=tolerance)
    for rate in (tile.lifetime_xirr, portfolio.portfolio_xirr, funds.overall_portfolio_xirr):
        assert Decimal(rate) == pytest.approx(Decimal("0.20"), abs=tolerance)
    for row in funds.funds:
        expected = {"Held-A Fund": "0.10", "Held-B Fund": "0.20", "Sold Fund": "0.30"}[row.scheme_name]
        assert Decimal(row.fund_xirr) == pytest.approx(Decimal(expected), abs=tolerance)
    assert len(funds.funds) == 3
