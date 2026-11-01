import asyncio
import importlib
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock
import uuid

import pytest
from sqlalchemy import event

from app.models.enums import SchemePlanType
from app.models.reference import Scheme, SchemeBenchmark
from tests.services.fund_page.factories import add_scheme, fx_nav10, TODAY


def selection():
    return importlib.import_module("app.services.fund_page.benchmark_select")


def scheme(db, category="Equity Scheme - Large Cap Fund", key="a"):
    return add_scheme(db, key, category, SchemePlanType.DIRECT, key)


def mapping(db, fund, name="Nifty Bank TRI", mapped="nifty_bank", tracked=None, **extra):
    row = SchemeBenchmark(scheme_id=fund.id, declared_benchmark_name=name, mapped_index_key=mapped,
        tracked_index_key=tracked, match_quality="exact", source="factsheet", verified_on=date(2026, 10, 1), **extra)
    db.add(row); db.commit(); return row


def test_fund_with_factsheet_benchmark_uses_it_and_says_so(db_session):
    fund = scheme(db_session)
    mapping(db_session, fund)
    pick = selection().benchmark_for_scheme(db_session, fund.id)
    assert (pick.index_key, pick.source, pick.declared_name) == ("nifty_bank", "factsheet", "Nifty Bank TRI")
    assert pick.mapping_age_days is not None


def test_missing_declared_benchmark_falls_back_labelled_as_a_proxy_with_the_declared_name_beside_it(db_session):
    fund = scheme(db_session)
    mapping(db_session, fund, "BSE Quality Index", None)
    pick = selection().benchmark_for_scheme(db_session, fund.id)
    assert (pick.index_key, pick.source, pick.declared_name) == ("nifty_100", "closest", "BSE Quality Index")
    assert pick.window_start_note == "We don't have this fund's own benchmark, so it is compared with the Nifty 100, the closest index we hold."


@pytest.mark.parametrize("category,key", [("Equity Scheme - Large Cap Fund", "nifty_100"), ("Equity Scheme - Small Cap Fund", "nifty_smallcap_250")])
def test_large_cap_fallback_is_nifty_100_and_small_cap_is_smallcap_250(db_session, category, key):
    assert selection().benchmark_for_scheme(db_session, scheme(db_session, category).id).index_key == key


def test_index_fund_uses_tracked_index(db_session):
    fund = scheme(db_session, "Other Scheme - Index Funds")
    mapping(db_session, fund, "Nifty 500 TRI", "nifty_500", "nifty_next_50")
    assert selection().benchmark_for_scheme(db_session, fund.id).index_key == "nifty_next_50"


def test_non_equity_fund_gets_no_benchmark(db_session):
    fund = scheme(db_session, "Debt Scheme - Liquid Fund")
    assert selection().benchmark_for_scheme(db_session, fund.id).index_key is None


def test_returns_table_shows_printed_returns_when_no_series_is_held_and_says_so(db_session):
    from app.services.fund_page.returns import inception_returns
    fund = scheme(db_session, "Debt Scheme - Liquid Fund")
    fx_nav10(db_session, fund)
    mapping(db_session, fund, "CRISIL Liquid Debt A-I", None,
        printed_return_1y=Decimal("6.25"), printed_return_3y=Decimal("6.50"), printed_return_5y=Decimal("6.75"), printed_as_of=date(2026, 9, 30))
    result = inception_returns(db_session, fund, TODAY)
    assert result.rows["benchmark"]["1Y"] == "6.2500"
    assert result.rows["benchmark"]["3Y"] == "6.5000"
    assert result.rows["benchmark"]["5Y"] == "6.7500"
    assert result.printed_as_of == date(2026, 9, 30)
    assert result.benchmark_note == "Benchmark returns are as printed in the fund house's factsheet for 2026-09-30."


def test_chart_and_xirr_never_use_printed_returns(db_session):
    from app.services.fund_page.performance import period_series
    from app.services.fund_page.peers import _benchmark_series
    from app.services.fund_page.risk import _shared_beta
    fund = scheme(db_session, "Debt Scheme - Liquid Fund")
    fx_nav10(db_session, fund)
    mapping(db_session, fund, "CRISIL Liquid Debt A-I", None, printed_return_1y=Decimal("999"), printed_as_of=date(2026, 9, 30))
    statements = []
    def collect(conn, cursor, statement, params, context, many): statements.append(statement)
    event.listen(db_session.get_bind(), "before_cursor_execute", collect)
    try:
        result = asyncio.run(period_series(db_session, fund, "1Y", TODAY))
        assert result.benchmark is None
        assert _benchmark_series(db_session, fund, [date(2025, 10, 23), TODAY]) is None
        assert _shared_beta(db_session, fund, [], date(2025, 10, 23), TODAY) == (None, "no_benchmark")
    finally:
        event.remove(db_session.get_bind(), "before_cursor_execute", collect)
    assert not any("printed_return_" in sql.lower() for sql in statements)


def test_fund_page_and_performance_tab_agree_on_the_choice(db_session):
    from app.services.analytics.benchmark import compute_fund_vs_declared_benchmark
    fund = scheme(db_session)
    mapping(db_session, fund)
    picks = selection().benchmark_choices(db_session, {fund.id: fund})
    assert picks[fund.id] == selection().benchmark_for_scheme(db_session, fund.id)
    assert callable(compute_fund_vs_declared_benchmark)


def test_legacy_four_index_old_ui_output_unchanged(db_session, monkeypatch):
    from app.services.analytics import benchmark as legacy
    from app.services.analytics.schemas import FundVsBenchmarkSummary
    # An old stored section does not need the new field.
    old = {"funds": [], "overall_portfolio_xirr": None, "overall_broad_market_xirr": None}
    assert FundVsBenchmarkSummary.model_validate(old).declared_comparison is None
    result = asyncio.run(legacy.compute_fund_vs_benchmark(db_session, [], include_declared=False))
    assert result.model_dump(mode="json", exclude={"declared_comparison"}) == old
    from app.models.enums import BenchmarkIndex
    assert legacy._benchmark_index_for_category("Equity Scheme - Large Cap Fund") == BenchmarkIndex.NIFTY_50


def test_declared_comparison_reuses_the_single_index_load_and_no_extra_nav_pass(db_session, monkeypatch):
    from app.services.analytics import benchmark as service
    from app.services.analytics import benchmark_windows as windows
    from tests.services.analytics.test_benchmark import _household_member, _scheme, _folio_with_purchase
    from app.models.enums import TransactionType
    from types import SimpleNamespace
    member = _household_member(db_session)
    equity = _scheme(db_session, "Large Fund", "Equity Scheme - Large Cap Fund")
    debt = _scheme(db_session, "Debt Fund", "Debt Scheme - Liquid Fund")
    # No real NAV calls; both old and new paths receive the SAME holdings/flows.
    txns = {f.id: [SimpleNamespace(id=f.id, date=date(2025, 1, 1), type=TransactionType.PURCHASE, amount=Decimal("100"), stamp_duty=Decimal("0"), origin=None)] for f in (equity, debt)}
    from app.models.folio import Folio
    monkeypatch.setattr(service, "_investment_transactions", lambda db, ids: [])
    all_txns = []
    for fund in (equity, debt):
        folio = Folio(id=uuid.uuid4(), household_member_id=member.id, scheme_id=fund.id, folio_number=str(fund.id))
        db_session.add(folio); db_session.flush()
        txns[fund.id][0].folio_id = folio.id
        all_txns += txns[fund.id]
    monkeypatch.setattr(service, "_fund_level_transactions", lambda db, ids: all_txns)
    monkeypatch.setattr(service, "compute_holdings", AsyncMock(return_value=[SimpleNamespace(scheme_id=str(f.id), current_value="110") for f in (equity, debt)]))
    monkeypatch.setattr(service, "_benchmark_xirr_for_transactions", AsyncMock(return_value=Decimal("0.1")))
    calls = []
    original = windows.load_index_levels
    async def inputs(db, ids, earliest, indices, **kwargs):
        calls.append(tuple(indices))
        context = windows.WindowContext(TODAY, {w: None for w in windows.WINDOWS}, {w: None for w in windows.WINDOWS}, {w: {} for w in windows.WINDOWS})
        return context, original(db, indices, earliest, TODAY)
    monkeypatch.setattr(service, "_window_inputs", inputs)
    counts=[]; results=[]
    for enabled in (False, True):
        sql=[]
        def record(conn,cursor,statement,params,context,many): sql.append(statement.lower())
        event.listen(db_session.get_bind(), "before_cursor_execute", record)
        try: results.append(asyncio.run(service.compute_fund_vs_benchmark(db_session, [member.id], include_declared=enabled)))
        finally: event.remove(db_session.get_bind(), "before_cursor_execute", record)
        assert not any("printed_return_" in q for q in sql)
        counts.append((sum("from benchmark_index_history" in q for q in sql), sum("from nav_history" in q for q in sql)))
    assert counts == [(1, 0), (1, 0)]
    assert len(calls) == 2
    assert results[0].model_dump(mode="json", exclude={"declared_comparison"}) == results[1].model_dump(mode="json", exclude={"declared_comparison"})
    assert next(r for r in results[1].declared_comparison if r.scheme_id == str(debt.id)).source == "none"


def test_declared_keys_use_the_daily_jobs_cache_without_extra_fetches(db_session, monkeypatch):
    from app.services.analytics import benchmark as service
    from app.services.analytics.benchmark_windows import WindowContext, WINDOWS
    from app.models.enums import LEGACY_BENCHMARK_INDICES
    context = WindowContext(TODAY, {w: None for w in WINDOWS}, {}, {})
    monkeypatch.setattr(service, "build_window_context", AsyncMock(return_value=context))
    fetch = AsyncMock(side_effect=AssertionError("New comparisons must use stored index history"))
    monkeypatch.setattr(service, "ensure_index_history_fresh", fetch)
    asyncio.run(service._window_inputs(db_session, [], date(2020, 1, 1), (*LEGACY_BENCHMARK_INDICES, "nifty_bank"), refresh_indices=LEGACY_BENCHMARK_INDICES))
    assert fetch.await_count == 0


def test_bse_tracked_index_keeps_the_closest_label(db_session):
    from app.services.analytics.benchmark_layouts import BenchmarkReading
    from app.services.analytics.amfi_factsheet_client import import_benchmarks
    fund = scheme(db_session, "Other Scheme - Index Funds", "tracked_bse")
    fund.base_name = fund.name
    db_session.commit()
    reading = BenchmarkReading(fund.name, "Nifty 500 TRI", tracked_index_name="BSE Sensex TRI")
    import_benchmarks(db_session, fund.amc_name, [reading], date(2026, 10, 1)); db_session.flush()
    pick = selection().benchmark_for_scheme(db_session, fund.id)
    assert pick.index_key == "nifty_50"
    assert pick.source == "closest" and pick.window_start_note


def test_new_empty_portfolio_is_empty_rather_than_updating(db_session):
    from app.services.analytics.benchmark import compute_fund_vs_benchmark
    result = asyncio.run(compute_fund_vs_benchmark(db_session, []))
    assert result.declared_comparison == []
