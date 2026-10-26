import asyncio
import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, localcontext
from unittest.mock import AsyncMock, patch

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

import app.models.enums as enum_module
from app.db.base import Base
from app.models.enums import BenchmarkIndex, BenchmarkReturnType, PlanType, Relationship, TransactionType
from app.models.folio import Folio
from app.models.reference import BenchmarkIndexHistory, Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.dashboard.schemas import HoldingRow
from app.services.analytics.benchmark import (
    _benchmark_index_for_category,
    _benchmark_xirr_for_transactions,
    _signed_amount,
    _xirr_str,
    compute_fund_vs_benchmark,
    compute_portfolio_vs_benchmarks,
)
from app.services.analytics.benchmark_windows import (
    WINDOWS,
    WindowContext,
    compute_fund_window_rows as real_compute_fund_window_rows,
    window_start,
)
from app.services.analytics.schemas import FundBenchmarkRow, PortfolioBenchmarkSummary


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def _household_member(db):
    user = User(id=uuid.uuid4(), phone_number=f"+9199999{uuid.uuid4().hex[:5]}", created_at=datetime.now(timezone.utc))
    db.add(user)
    db.flush()
    member = HouseholdMember(id=uuid.uuid4(), user_id=user.id, name="Self", relationship=Relationship.SELF, created_at=datetime.now(timezone.utc))
    db.add(member)
    db.commit()
    return member


def _scheme(db, name="Test Fund", sebi_category="Equity Scheme - Flexi Cap Fund"):
    scheme = Scheme(id=uuid.uuid4(), amfi_code=uuid.uuid4().hex[:6], isin="INF123", name=name, amc_name="HDFC AMC", sebi_category=sebi_category)
    db.add(scheme)
    db.commit()
    return scheme


def _folio_with_purchase(db, member, scheme, amount, units, nav, txn_date, plan_type=PlanType.DIRECT):
    folio = Folio(id=uuid.uuid4(), household_member_id=member.id, scheme_id=scheme.id, folio_number=uuid.uuid4().hex[:6], plan_type=plan_type)
    db.add(folio)
    db.commit()
    db.add(Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=uuid.uuid4(), type=TransactionType.PURCHASE, date=txn_date, amount=amount, units=units, nav=nav))
    db.commit()
    return folio


def _mock_holdings(scheme, current_nav):
    return (
        patch(
            "app.services.dashboard.holdings.get_nav_on_or_before",
            new=AsyncMock(return_value=(current_nav, date.today())),
        ),
        patch("app.services.dashboard.holdings.get_previous_nav_from_cache", return_value=None),
    )


def _mock_holdings_multi(nav_by_scheme_id):
    return (
        patch(
            "app.services.dashboard.holdings.get_nav_on_or_before",
            new=AsyncMock(side_effect=lambda db_, scheme, on_date: (nav_by_scheme_id[scheme.id], date.today())),
        ),
        patch("app.services.dashboard.holdings.get_previous_nav_from_cache", return_value=None),
    )


def _no_fetch():
    return patch("app.services.analytics.benchmark.ensure_index_history_fresh", new=AsyncMock(return_value=True))


def _independent_decimal_xirr(flows):
    """Bisection oracle: no calls to the application's Newton-Raphson solver."""
    with localcontext() as context:
        context.prec = 40
        first = min(day for day, _ in flows)

        def npv(rate):
            return sum((amount / (Decimal(1) + rate) ** (Decimal((day - first).days) / Decimal(365))
                        for day, amount in flows), Decimal(0))

        low, high = Decimal(0), Decimal(10)
        assert npv(low) > 0 and npv(high) < 0
        for _ in range(160):
            middle = (low + high) / 2
            if npv(middle) > 0:
                low = middle
            else:
                high = middle
        return (low + high) / 2


class _BenchmarkCheckDate(date):
    @classmethod
    def today(cls):
        return date(2025, 1, 6)


def _seed_all_tri_history(db, dates):
    for index in enum_module.ALL_BENCHMARK_INDICES:
        for n, history_date in enumerate(sorted(set(dates))):
            db.add(
                BenchmarkIndexHistory(
                    index_name=index,
                    return_type=BenchmarkReturnType.TRI,
                    date=history_date,
                    value=Decimal("100") + Decimal(n),
                )
            )
    db.commit()


def _window_context(scheme_ids, today=None):
    today = today or date.today()
    starts = {window: window_start(window, today) for window in WINDOWS}
    return WindowContext(
        today=today,
        starts=starts,
        portfolio_start_values={
            "1Y": Decimal("3000"),
            "3Y": Decimal("2500"),
            "5Y": Decimal("2000"),
            "SI": None,
        },
        fund_start_values={
            window: ({scheme_id: Decimal("1000") for scheme_id in scheme_ids} if window != "SI" else {})
            for window in WINDOWS
        },
    )


def _seed_two_fund_window_case(db):
    member = _household_member(db)
    large_cap = _scheme(db, "Large Cap Window Fund", sebi_category="Equity Scheme - Large Cap Fund")
    mid_cap = _scheme(db, "Mid Cap Window Fund", sebi_category="Equity Scheme - Mid Cap Fund")
    purchase_date = date.today().replace(year=date.today().year - 6)
    _folio_with_purchase(
        db, member, large_cap, Decimal("1000"), Decimal("100"), Decimal("10"), purchase_date
    )
    _folio_with_purchase(
        db, member, mid_cap, Decimal("2000"), Decimal("200"), Decimal("10"), purchase_date
    )
    ctx = _window_context([large_cap.id, mid_cap.id])
    _seed_all_tri_history(
        db,
        [purchase_date, date.today(), *(start for start in ctx.starts.values() if start is not None)],
    )
    return member, large_cap, mid_cap, ctx


def test_benchmark_xirr_prices_each_transaction_on_its_own_date():
    db = _session()
    today = _BenchmarkCheckDate.today()
    purchases = [(date(2024, 1, 5), Decimal("100")),
                 (date(2024, 2, 5), Decimal("120")),
                 (date(2024, 3, 5), Decimal("80"))]
    amount, today_level = Decimal("10000.00"), Decimal("150")
    transactions = [Transaction(type=TransactionType.PURCHASE_SIP, date=day, amount=amount) for day, _ in purchases]
    for day, level in [*purchases, (today, today_level)]:
        db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, return_type=BenchmarkReturnType.TRI, date=day, value=level))
    db.commit()
    terminal_value = sum((amount / level for _, level in purchases), Decimal(0)) * today_level
    independent = _independent_decimal_xirr([(day, -amount) for day, _ in purchases] + [(today, terminal_value)])
    with _no_fetch(), patch("app.services.analytics.benchmark.date", _BenchmarkCheckDate):
        actual = asyncio.run(_benchmark_xirr_for_transactions(db, transactions, BenchmarkIndex.NIFTY_50))
    assert actual is not None
    assert abs(actual - independent) < Decimal("0.0001")
    print(f"Three-date SIP: terminal={terminal_value}; app={actual}; independent={independent}")
    db.close()


def test_a_transaction_on_a_market_holiday_uses_the_previous_trading_days_level():
    from app.services.analytics import benchmark

    db = _session()
    sunday = date(2024, 1, 7)
    today = _BenchmarkCheckDate.today()
    amount, friday_level, today_level = Decimal("1000.00"), Decimal("100"), Decimal("150")
    for day, level in [(date(2024, 1, 5), friday_level), (date(2024, 1, 8), Decimal("1000")), (today, today_level)]:
        db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, return_type=BenchmarkReturnType.TRI, date=day, value=level))
    db.commit()
    txn = Transaction(type=TransactionType.PURCHASE, date=sunday, amount=amount)
    with _no_fetch(), patch("app.services.analytics.benchmark.date", _BenchmarkCheckDate), patch.object(benchmark, "xirr", wraps=benchmark.xirr) as solver:
        actual = asyncio.run(_benchmark_xirr_for_transactions(db, [txn], BenchmarkIndex.NIFTY_50))
    assert actual is not None
    [flows] = solver.call_args.args
    assert flows[0] == (sunday, -amount)  # Pricing rolls back; the cash-flow date does not.
    assert flows[-1][0] == today
    hypothetical_units = flows[-1][1] / today_level
    assert hypothetical_units == amount / friday_level == Decimal("10")
    print(f"Sunday purchase: hypothetical_units={hypothetical_units}; Friday TRI={friday_level}; Monday TRI=1000")
    db.close()


def test_compute_portfolio_vs_benchmarks_empty_when_no_transactions():
    db = _session()
    member = _household_member(db)
    summary = asyncio.run(compute_portfolio_vs_benchmarks(db, [member.id]))
    assert summary.portfolio_xirr is None
    assert len(summary.benchmarks) == 4
    assert all(row.xirr is None for row in summary.benchmarks)
    assert [row.index for row in summary.benchmarks] == list(enum_module.LEGACY_BENCHMARK_INDICES)


def test_enum_has_eight_members_and_legacy_tuple_is_the_original_four_in_order():
    legacy = (
        BenchmarkIndex.NIFTY_50,
        BenchmarkIndex.NIFTY_500,
        BenchmarkIndex.NIFTY_LARGEMIDCAP_250,
        BenchmarkIndex.NIFTY_MIDCAP_150,
    )

    assert len(BenchmarkIndex) == 8
    assert enum_module.LEGACY_BENCHMARK_INDICES == legacy
    assert len(enum_module.ALL_BENCHMARK_INDICES) == 8
    assert enum_module.ALL_BENCHMARK_INDICES[:4] == legacy


def test_portfolio_vs_benchmarks_still_returns_exactly_the_legacy_four_rows():
    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    purchase_date = date.today().replace(year=date.today().year - 1)
    _folio_with_purchase(
        db,
        member,
        scheme,
        Decimal("1000.00"),
        Decimal("100.000"),
        Decimal("10.0000"),
        purchase_date,
    )
    new_indices = (
        BenchmarkIndex("nifty_next_50"),
        BenchmarkIndex("nifty_smallcap_250"),
        BenchmarkIndex("nifty_100"),
        BenchmarkIndex("nifty_200"),
    )
    for index in new_indices:
        for return_type in (BenchmarkReturnType.PRICE, BenchmarkReturnType.TRI):
            db.add_all(
                [
                    BenchmarkIndexHistory(
                        index_name=index,
                        return_type=return_type,
                        date=purchase_date,
                        value=Decimal("100.00"),
                    ),
                    BenchmarkIndexHistory(
                        index_name=index,
                        return_type=return_type,
                        date=date.today(),
                        value=Decimal("105.00"),
                    ),
                ]
            )
    db.commit()

    p1, p2 = _mock_holdings(scheme, Decimal("12.0000"))
    with p1, p2, _no_fetch():
        summary = asyncio.run(compute_portfolio_vs_benchmarks(db, [member.id]))

    assert [row.index for row in summary.benchmarks] == list(enum_module.LEGACY_BENCHMARK_INDICES)


def test_compute_portfolio_vs_benchmarks_computes_portfolio_and_nifty50_xirr():
    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    purchase_date = date.today().replace(year=date.today().year - 1)
    _folio_with_purchase(db, member, scheme, Decimal("1000.00"), Decimal("100.000"), Decimal("10.0000"), purchase_date)

    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, return_type=BenchmarkReturnType.TRI, date=purchase_date, value=Decimal("100.00")))
    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, return_type=BenchmarkReturnType.TRI, date=date.today(), value=Decimal("105.00")))
    db.commit()

    p1, p2 = _mock_holdings(scheme, Decimal("12.0000"))  # fund value grows to 1200
    with p1, p2, _no_fetch():
        summary = asyncio.run(compute_portfolio_vs_benchmarks(db, [member.id]))

    assert summary.portfolio_xirr is not None
    assert Decimal(summary.portfolio_xirr) > Decimal("0")

    nifty_50_row = next(r for r in summary.benchmarks if r.index == BenchmarkIndex.NIFTY_50)
    assert nifty_50_row.xirr is not None
    # Fund grew 1000 -> 1200 (20%), benchmark (same rupees, index-priced) only
    # grew 1000 -> 1050 (5%) — fund should outperform this benchmark.
    assert Decimal(nifty_50_row.xirr) > Decimal("0")
    assert Decimal(summary.portfolio_xirr) > Decimal(nifty_50_row.xirr)

    # No history cached for the other 3 indices — must degrade to None, not crash.
    other_rows = [r for r in summary.benchmarks if r.index != BenchmarkIndex.NIFTY_50]
    assert len(other_rows) == 3
    assert all(r.xirr is None for r in other_rows)


def test_compute_portfolio_vs_benchmarks_excludes_switches_from_cash_flow():
    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    purchase_date = date.today().replace(year=date.today().year - 1)
    folio = _folio_with_purchase(db, member, scheme, Decimal("1000.00"), Decimal("100.000"), Decimal("10.0000"), purchase_date)
    db.add(Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=uuid.uuid4(), type=TransactionType.SWITCH_IN, date=purchase_date, amount=Decimal("500.00"), units=Decimal("50.000"), nav=Decimal("10.0000")))
    db.commit()

    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, return_type=BenchmarkReturnType.TRI, date=purchase_date, value=Decimal("100.00")))
    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, return_type=BenchmarkReturnType.TRI, date=date.today(), value=Decimal("105.00")))
    db.commit()

    p1, p2 = _mock_holdings(scheme, Decimal("12.0000"))
    with p1, p2, _no_fetch():
        summary = asyncio.run(compute_portfolio_vs_benchmarks(db, [member.id]))

    # Only the 1000 PURCHASE counts as a cash flow, not the 500 SWITCH_IN —
    # same exclusion cash_flow.py already applies (switches are
    # intra-portfolio, not real cash movement).
    nifty_50_row = next(r for r in summary.benchmarks if r.index == BenchmarkIndex.NIFTY_50)
    assert Decimal(nifty_50_row.xirr) > Decimal("0")


def test_benchmark_index_for_category_maps_large_cap_to_nifty_50():
    assert _benchmark_index_for_category("Equity Scheme - Large Cap Fund") == BenchmarkIndex.NIFTY_50


def test_benchmark_index_for_category_maps_mid_cap_to_nifty_midcap_150():
    assert _benchmark_index_for_category("Equity Scheme - Mid Cap Fund") == BenchmarkIndex.NIFTY_MIDCAP_150


def test_benchmark_index_for_category_maps_large_and_mid_cap_to_largemidcap_250():
    assert _benchmark_index_for_category("Equity Scheme - Large & Mid Cap Fund") == BenchmarkIndex.NIFTY_LARGEMIDCAP_250


def test_benchmark_index_for_category_falls_back_to_nifty_500_for_flexi_cap():
    assert _benchmark_index_for_category("Equity Scheme - Flexi Cap Fund") == BenchmarkIndex.NIFTY_500


def test_benchmark_index_for_category_falls_back_to_nifty_500_for_debt():
    assert _benchmark_index_for_category("Debt Scheme - Liquid Fund") == BenchmarkIndex.NIFTY_500


def test_compute_fund_vs_benchmark_empty_when_no_transactions():
    db = _session()
    member = _household_member(db)
    comparison = asyncio.run(compute_fund_vs_benchmark(db, [member.id]))
    assert comparison.funds == []
    assert comparison.overall_portfolio_xirr is None
    assert comparison.overall_broad_market_xirr is None


def test_compute_fund_vs_benchmark_uses_per_fund_appropriate_index():
    db = _session()
    member = _household_member(db)
    large_cap = _scheme(db, "Large Cap Fund", sebi_category="Equity Scheme - Large Cap Fund")
    mid_cap = _scheme(db, "Mid Cap Fund", sebi_category="Equity Scheme - Mid Cap Fund")
    purchase_date = date.today().replace(year=date.today().year - 1)
    _folio_with_purchase(db, member, large_cap, Decimal("1000.00"), Decimal("100.000"), Decimal("10.0000"), purchase_date)
    _folio_with_purchase(db, member, mid_cap, Decimal("2000.00"), Decimal("200.000"), Decimal("10.0000"), purchase_date)

    for index in (BenchmarkIndex.NIFTY_50, BenchmarkIndex.NIFTY_MIDCAP_150, BenchmarkIndex.NIFTY_500):
        db.add(BenchmarkIndexHistory(index_name=index, return_type=BenchmarkReturnType.TRI, date=purchase_date, value=Decimal("100.00")))
        db.add(BenchmarkIndexHistory(index_name=index, return_type=BenchmarkReturnType.TRI, date=date.today(), value=Decimal("110.00")))
    for kind in (BenchmarkReturnType.PE, BenchmarkReturnType.PB):
        db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, return_type=kind, date=date.today(), value=Decimal("999")))
    db.commit()

    p1, p2 = _mock_holdings_multi({large_cap.id: Decimal("12.0000"), mid_cap.id: Decimal("9.0000")})
    with p1, p2, _no_fetch():
        comparison = asyncio.run(compute_fund_vs_benchmark(db, [member.id]))

    assert len(comparison.funds) == 2
    large_cap_row = next(f for f in comparison.funds if f.scheme_id == str(large_cap.id))
    mid_cap_row = next(f for f in comparison.funds if f.scheme_id == str(mid_cap.id))

    assert large_cap_row.benchmark_index == BenchmarkIndex.NIFTY_50
    assert mid_cap_row.benchmark_index == BenchmarkIndex.NIFTY_MIDCAP_150
    assert large_cap_row.fund_xirr is not None and Decimal(large_cap_row.fund_xirr) > Decimal("0")
    assert mid_cap_row.fund_xirr is not None and Decimal(mid_cap_row.fund_xirr) < Decimal("0")

    # Overall portfolio-vs-broad-market uses Nifty 500 regardless of the
    # individual funds' own categories.
    assert comparison.overall_portfolio_xirr is not None
    assert comparison.overall_broad_market_xirr is not None


def test_compute_fund_vs_benchmark_includes_switches_only_in_fund_level_xirr():
    db = _session()
    member = _household_member(db)
    source = _scheme(db, "Source Fund", sebi_category="Equity Scheme - Large Cap Fund")
    target = _scheme(db, "Target Fund", sebi_category="Equity Scheme - Large Cap Fund")
    purchase_date = date.today().replace(year=date.today().year - 1)
    switch_date = date.today().replace(month=max(1, date.today().month - 1))
    source_folio = _folio_with_purchase(db, member, source, Decimal("1000.00"), Decimal("100.000"), Decimal("10.0000"), purchase_date)
    target_folio = _folio_with_purchase(db, member, target, Decimal("1000.00"), Decimal("100.000"), Decimal("10.0000"), purchase_date)
    db.add_all(
        [
            Transaction(id=uuid.uuid4(), folio_id=source_folio.id, import_id=uuid.uuid4(), type=TransactionType.SWITCH_OUT, date=switch_date, amount=Decimal("300.00"), units=Decimal("30.000"), nav=Decimal("10.0000")),
            Transaction(id=uuid.uuid4(), folio_id=target_folio.id, import_id=uuid.uuid4(), type=TransactionType.SWITCH_IN, date=switch_date, amount=Decimal("300.00"), units=Decimal("30.000"), nav=Decimal("10.0000")),
        ]
    )
    db.commit()

    holdings = [
        HoldingRow(**{
            "scheme_id": str(scheme.id),
            "scheme_name": scheme.name,
            "amc_name": scheme.amc_name,
            "household_member_id": str(member.id),
            "household_member_name": member.name,
            "plan_type": PlanType.DIRECT,
            "units_held": "100",
            "average_nav": "10",
            "current_nav": "10",
            "current_nav_date": date.today(),
            "amount_invested": "1000",
            "current_value": "1000",
            "current_profit_total": "0",
            "realized_gain": "0",
            "unrealized_gain": "0",
            "today_gain": "0",
        })
        for scheme in (source, target)
    ]
    portfolio_calls = []
    benchmark_calls = []

    def capture_portfolio(transactions, current_value, extra_debit_types=frozenset()):
        portfolio_calls.append((list(transactions), extra_debit_types))
        return Decimal("0.10")

    async def capture_benchmark(db_, transactions, index, extra_debit_types=frozenset()):
        benchmark_calls.append((list(transactions), extra_debit_types))
        return Decimal("0.10")

    with (
        patch("app.services.analytics.benchmark.compute_holdings", new=AsyncMock(return_value=holdings)),
        patch("app.services.analytics.benchmark._portfolio_xirr", side_effect=capture_portfolio),
        patch("app.services.analytics.benchmark._benchmark_xirr_for_transactions", new=AsyncMock(side_effect=capture_benchmark)),
    ):
        asyncio.run(compute_fund_vs_benchmark(db, [member.id]))

    for calls in (portfolio_calls[:2], benchmark_calls[:2]):
        fund_types = {txn.type for transactions, _ in calls for txn in transactions}
        assert TransactionType.SWITCH_OUT in fund_types
        assert TransactionType.SWITCH_IN in fund_types
        assert all(extra == {TransactionType.SWITCH_IN} for _, extra in calls)

    fund_transactions = [txn for transactions, _ in portfolio_calls[:2] for txn in transactions]
    switch_in = next(txn for txn in fund_transactions if txn.type == TransactionType.SWITCH_IN)
    switch_out = next(txn for txn in fund_transactions if txn.type == TransactionType.SWITCH_OUT)
    assert _signed_amount(switch_in, frozenset({TransactionType.SWITCH_IN})) == Decimal("-300.00")
    assert _signed_amount(switch_out, frozenset({TransactionType.SWITCH_IN})) == Decimal("300.00")

    for transactions, extra in (portfolio_calls[-1], benchmark_calls[-1]):
        assert all(txn.type not in {TransactionType.SWITCH_IN, TransactionType.SWITCH_OUT} for txn in transactions)
        assert extra == frozenset()


def test_compute_fund_vs_benchmark_switch_only_household_still_yields_fund_rows():
    """A household whose only relevant history is a switch (no PURCHASE/SIP/REDEMPTION
    anywhere) must still get fund-level rows — the early-return guard must not gate
    solely on the switch-excluding transaction list."""
    db = _session()
    member = _household_member(db)
    source = _scheme(db, "Source Fund", sebi_category="Equity Scheme - Large Cap Fund")
    target = _scheme(db, "Target Fund", sebi_category="Equity Scheme - Large Cap Fund")
    switch_date = date.today().replace(month=max(1, date.today().month - 1))
    source_folio = Folio(id=uuid.uuid4(), household_member_id=member.id, scheme_id=source.id, folio_number=uuid.uuid4().hex[:6], plan_type=PlanType.DIRECT)
    target_folio = Folio(id=uuid.uuid4(), household_member_id=member.id, scheme_id=target.id, folio_number=uuid.uuid4().hex[:6], plan_type=PlanType.DIRECT)
    db.add_all([source_folio, target_folio])
    db.commit()
    db.add_all(
        [
            Transaction(id=uuid.uuid4(), folio_id=source_folio.id, import_id=uuid.uuid4(), type=TransactionType.SWITCH_OUT, date=switch_date, amount=Decimal("300.00"), units=Decimal("30.000"), nav=Decimal("10.0000")),
            Transaction(id=uuid.uuid4(), folio_id=target_folio.id, import_id=uuid.uuid4(), type=TransactionType.SWITCH_IN, date=switch_date, amount=Decimal("300.00"), units=Decimal("30.000"), nav=Decimal("10.0000")),
        ]
    )
    db.commit()

    p1, p2 = _mock_holdings_multi({source.id: Decimal("10.0000"), target.id: Decimal("10.0000")})
    with p1, p2, _no_fetch():
        comparison = asyncio.run(compute_fund_vs_benchmark(db, [member.id]))

    assert {f.scheme_id for f in comparison.funds} == {str(source.id), str(target.id)}


def test_compute_fund_vs_benchmark_excludes_scheme_with_no_index_history():
    db = _session()
    member = _household_member(db)
    scheme = _scheme(db, sebi_category="Equity Scheme - Large Cap Fund")
    purchase_date = date.today().replace(year=date.today().year - 1)
    _folio_with_purchase(db, member, scheme, Decimal("1000.00"), Decimal("100.000"), Decimal("10.0000"), purchase_date)
    # No BenchmarkIndexHistory rows inserted for NIFTY_50 or NIFTY_500.

    p1, p2 = _mock_holdings(scheme, Decimal("12.0000"))
    with p1, p2, _no_fetch():
        comparison = asyncio.run(compute_fund_vs_benchmark(db, [member.id]))

    fund_row = comparison.funds[0]
    assert fund_row.fund_xirr is not None  # fund's own XIRR never needs index data
    assert fund_row.benchmark_xirr is None
    assert comparison.overall_broad_market_xirr is None


def test_xirr_str_avoids_scientific_notation_for_near_zero_rates():
    # bare str(Decimal) switches to scientific notation below 1e-6 (e.g.
    # "1E-16"), which the frontend's decimal-fraction-to-percent shift can't
    # parse — every XIRR serialization must go through this helper instead.
    assert _xirr_str(Decimal("1E-16")) == "0.0000000000000001"
    assert _xirr_str(Decimal("-1.00000000000204020000E-16")) == "-0.000000000000000100000000000204020000"
    assert _xirr_str(Decimal("0.1645")) == "0.1645"
    assert _xirr_str(None) is None


def test_xirr_str_normalizes_negative_zero():
    assert _xirr_str(Decimal("-0")) == "0"


def test_benchmark_uses_tri_and_ignores_price_rows():
    """Decided 9 Oct: fund-vs-index comparisons use TRI. Price rows alone give no
    benchmark (no silent fallback), and TRI is used when both exist for the same dates."""
    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    purchase_date = date.today().replace(year=date.today().year - 1)
    _folio_with_purchase(db, member, scheme, Decimal("1000.00"), Decimal("100.000"), Decimal("10.0000"), purchase_date)

    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=purchase_date, return_type=BenchmarkReturnType.PRICE, value=Decimal("100.00")))
    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date.today(), return_type=BenchmarkReturnType.PRICE, value=Decimal("105.00")))
    db.commit()

    p1, p2 = _mock_holdings(scheme, Decimal("12.0000"))
    with p1, p2, _no_fetch():
        price_only = asyncio.run(compute_portfolio_vs_benchmarks(db, [member.id]))
    assert next(r for r in price_only.benchmarks if r.index == BenchmarkIndex.NIFTY_50).xirr is None

    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=purchase_date, return_type=BenchmarkReturnType.TRI, value=Decimal("100.00")))
    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date.today(), return_type=BenchmarkReturnType.TRI, value=Decimal("110.00")))
    db.commit()

    p1, p2 = _mock_holdings(scheme, Decimal("12.0000"))
    with p1, p2, _no_fetch():
        with_tri = asyncio.run(compute_portfolio_vs_benchmarks(db, [member.id]))
    tri_xirr = Decimal(next(r for r in with_tri.benchmarks if r.index == BenchmarkIndex.NIFTY_50).xirr)
    # The index grew 10% (TRI), not 5% (price): about a 10% annual rate for one year.
    assert Decimal("0.09") < tri_xirr < Decimal("0.11")


def test_summary_has_windows_for_all_four_in_order():
    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    purchase_date = date.today().replace(year=date.today().year - 6)
    _folio_with_purchase(
        db, member, scheme, Decimal("1000"), Decimal("100"), Decimal("10"), purchase_date
    )
    ctx = _window_context([scheme.id])
    _seed_all_tri_history(
        db,
        [purchase_date, date.today(), *(start for start in ctx.starts.values() if start is not None)],
    )

    p1, p2 = _mock_holdings(scheme, Decimal("12"))
    with (
        p1,
        p2,
        _no_fetch(),
        patch(
            "app.services.analytics.benchmark.build_window_context",
            new=AsyncMock(return_value=ctx),
            create=True,
        ),
    ):
        summary = asyncio.run(compute_portfolio_vs_benchmarks(db, [member.id]))

    assert [window.window for window in summary.windows] == ["1Y", "3Y", "5Y", "SI"]
    assert all(
        [row.index for row in window.indices] == list(enum_module.ALL_BENCHMARK_INDICES)
        for window in summary.windows
    )


def test_existing_summary_keys_unchanged():
    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    purchase_date = date.today().replace(year=date.today().year - 6)
    _folio_with_purchase(
        db, member, scheme, Decimal("1000"), Decimal("100"), Decimal("10"), purchase_date
    )
    ctx = _window_context([scheme.id])
    _seed_all_tri_history(
        db,
        [purchase_date, date.today(), *(start for start in ctx.starts.values() if start is not None)],
    )

    p1, p2 = _mock_holdings(scheme, Decimal("12"))
    with (
        p1,
        p2,
        _no_fetch(),
        patch(
            "app.services.analytics.benchmark.build_window_context",
            new=AsyncMock(return_value=ctx),
            create=True,
        ),
    ):
        normal = asyncio.run(compute_portfolio_vs_benchmarks(db, [member.id]))

    p1, p2 = _mock_holdings(scheme, Decimal("12"))
    with (
        p1,
        p2,
        _no_fetch(),
        patch(
            "app.services.analytics.benchmark.build_window_context",
            new=AsyncMock(side_effect=RuntimeError("window context failed")),
            create=True,
        ),
    ):
        failed_windows = asyncio.run(compute_portfolio_vs_benchmarks(db, [member.id]))

    assert normal.portfolio_xirr == failed_windows.portfolio_xirr
    assert normal.benchmarks == failed_windows.benchmarks
    assert list(normal.model_dump().keys()) == ["portfolio_xirr", "benchmarks", "windows"]
    assert failed_windows.windows == []


def test_old_stored_payload_without_windows_still_validates():
    portfolio = PortfolioBenchmarkSummary.model_validate(
        {
            "portfolio_xirr": "0.125",
            "benchmarks": [{"index": "nifty_50", "xirr": "0.10"}],
        }
    )
    fund = FundBenchmarkRow.model_validate(
        {
            "scheme_id": str(uuid.uuid4()),
            "scheme_name": "Stored Fund",
            "benchmark_index": "nifty_500",
            "fund_xirr": "0.12",
            "benchmark_xirr": "0.09",
        }
    )

    assert portfolio.windows == []
    assert fund.windows == []


def test_fund_rows_carry_windows_and_keep_benchmark_index_legacy():
    db = _session()
    member, large_cap, mid_cap, ctx = _seed_two_fund_window_case(db)
    p1, p2 = _mock_holdings_multi(
        {large_cap.id: Decimal("12"), mid_cap.id: Decimal("9")}
    )
    with (
        p1,
        p2,
        _no_fetch(),
        patch(
            "app.services.analytics.benchmark.build_window_context",
            new=AsyncMock(return_value=ctx),
            create=True,
        ),
    ):
        comparison = asyncio.run(compute_fund_vs_benchmark(db, [member.id]))

    assert len(comparison.funds) == 2
    for row in comparison.funds:
        assert row.benchmark_index in enum_module.LEGACY_BENCHMARK_INDICES
        assert [window.window for window in row.windows] == ["1Y", "3Y", "5Y", "SI"]
        since_inception = next(window for window in row.windows if window.window == "SI")
        assert since_inception.fund_xirr == row.fund_xirr
        assert since_inception.benchmark_xirr == row.benchmark_xirr


def test_empty_household_returns_empty_windows():
    db = _session()
    member = _household_member(db)

    portfolio = asyncio.run(compute_portfolio_vs_benchmarks(db, [member.id]))
    funds = asyncio.run(compute_fund_vs_benchmark(db, [member.id]))

    assert portfolio.windows == []
    assert funds.funds == []


def test_window_failure_degrades_to_empty_windows_and_logs_a_warning(caplog):
    db = _session()
    member, large_cap, mid_cap, ctx = _seed_two_fund_window_case(db)
    navs = {large_cap.id: Decimal("12"), mid_cap.id: Decimal("9")}

    p1, p2 = _mock_holdings_multi(navs)
    with (
        p1,
        p2,
        _no_fetch(),
        patch(
            "app.services.analytics.benchmark.build_window_context",
            new=AsyncMock(return_value=ctx),
            create=True,
        ),
    ):
        baseline_portfolio = asyncio.run(compute_portfolio_vs_benchmarks(db, [member.id]))
        baseline_funds = asyncio.run(compute_fund_vs_benchmark(db, [member.id]))

    caplog.clear()
    p1, p2 = _mock_holdings_multi(navs)
    with (
        caplog.at_level(logging.WARNING, logger="app.services.analytics.benchmark"),
        p1,
        p2,
        _no_fetch(),
        patch(
            "app.services.analytics.benchmark.build_window_context",
            new=AsyncMock(return_value=ctx),
            create=True,
        ),
        patch(
            "app.services.analytics.benchmark.compute_window_rows",
            side_effect=RuntimeError("portfolio window failed"),
            create=True,
        ),
    ):
        failed_portfolio = asyncio.run(compute_portfolio_vs_benchmarks(db, [member.id]))

    assert failed_portfolio.portfolio_xirr == baseline_portfolio.portfolio_xirr
    assert failed_portfolio.benchmarks == baseline_portfolio.benchmarks
    assert failed_portfolio.windows == []
    assert any(record.levelno == logging.WARNING for record in caplog.records)

    caplog.clear()
    p1, p2 = _mock_holdings_multi(navs)
    with (
        caplog.at_level(logging.WARNING, logger="app.services.analytics.benchmark"),
        p1,
        p2,
        _no_fetch(),
        patch(
            "app.services.analytics.benchmark.build_window_context",
            new=AsyncMock(side_effect=RuntimeError("fund window inputs failed")),
        ),
    ):
        failed_fund_inputs = asyncio.run(compute_fund_vs_benchmark(db, [member.id]))

    baseline_by_id = {row.scheme_id: row for row in baseline_funds.funds}
    failed_inputs_by_id = {row.scheme_id: row for row in failed_fund_inputs.funds}
    assert all(row.windows == [] for row in failed_inputs_by_id.values())
    for scheme_id, row in failed_inputs_by_id.items():
        assert row.fund_xirr == baseline_by_id[scheme_id].fund_xirr
        assert row.benchmark_xirr == baseline_by_id[scheme_id].benchmark_xirr
    assert any(record.levelno == logging.WARNING for record in caplog.records)

    caplog.clear()

    def fail_one_fund(context, scheme_id, *args, **kwargs):
        if scheme_id == large_cap.id:
            raise RuntimeError("one fund window failed")
        return real_compute_fund_window_rows(context, scheme_id, *args, **kwargs)

    p1, p2 = _mock_holdings_multi(navs)
    with (
        caplog.at_level(logging.WARNING, logger="app.services.analytics.benchmark"),
        p1,
        p2,
        _no_fetch(),
        patch(
            "app.services.analytics.benchmark.build_window_context",
            new=AsyncMock(return_value=ctx),
            create=True,
        ),
        patch(
            "app.services.analytics.benchmark.compute_fund_window_rows",
            side_effect=fail_one_fund,
            create=True,
        ),
    ):
        failed_funds = asyncio.run(compute_fund_vs_benchmark(db, [member.id]))

    failed_by_id = {row.scheme_id: row for row in failed_funds.funds}
    assert failed_by_id[str(large_cap.id)].windows == []
    assert len(failed_by_id[str(mid_cap.id)].windows) == 4
    for scheme_id, row in failed_by_id.items():
        assert row.fund_xirr == baseline_by_id[scheme_id].fund_xirr
        assert row.benchmark_xirr == baseline_by_id[scheme_id].benchmark_xirr
    assert any(
        record.levelno == logging.WARNING and str(large_cap.id) in record.getMessage()
        for record in caplog.records
    )


def test_new_indices_are_topped_up_with_tri_history_once_per_computation():
    db = _session()
    member, large_cap, mid_cap, ctx = _seed_two_fund_window_case(db)
    navs = {large_cap.id: Decimal("12"), mid_cap.id: Decimal("9")}
    new_indices = set(enum_module.ALL_BENCHMARK_INDICES) - set(enum_module.LEGACY_BENCHMARK_INDICES)

    for computation in (compute_portfolio_vs_benchmarks, compute_fund_vs_benchmark):
        p1, p2 = _mock_holdings_multi(navs)
        with (
            p1,
            p2,
            patch(
                "app.services.analytics.benchmark.ensure_index_history_fresh",
                new=AsyncMock(return_value=True),
            ),
            patch(
                "app.services.analytics.benchmark.build_window_context",
                new=AsyncMock(return_value=ctx),
            ),
        ):
            baseline = asyncio.run(computation(db, [member.id]))

        top_up = AsyncMock(return_value=False)
        p1, p2 = _mock_holdings_multi(navs)
        with (
            p1,
            p2,
            patch("app.services.analytics.benchmark.ensure_index_history_fresh", new=top_up),
            patch(
                "app.services.analytics.benchmark.build_window_context",
                new=AsyncMock(return_value=ctx),
                create=True,
            ),
        ):
            result = asyncio.run(computation(db, [member.id]))

        calls_for_new_indices = [
            call
            for call in top_up.await_args_list
            if call.args[1] in new_indices
        ]
        # Only the portfolio matrix shows the new indices; a fund's own benchmark is always one of the
        # legacy four, so the fund computation neither fetches nor loads the new ones.
        expected_new = new_indices if computation is compute_portfolio_vs_benchmarks else set()
        assert {call.args[1] for call in calls_for_new_indices} == expected_new
        assert all(call.kwargs["return_type"] == BenchmarkReturnType.TRI for call in calls_for_new_indices)
        assert len(calls_for_new_indices) == len(expected_new)
        assert not any(
            call.args[1] in new_indices
            and call.kwargs.get("return_type") == BenchmarkReturnType.PRICE
            for call in top_up.await_args_list
        )
        if isinstance(result, PortfolioBenchmarkSummary):
            assert result.portfolio_xirr == baseline.portfolio_xirr
            assert result.benchmarks == baseline.benchmarks
        else:
            assert result.overall_portfolio_xirr == baseline.overall_portfolio_xirr
            assert result.overall_broad_market_xirr == baseline.overall_broad_market_xirr
            assert [
                (row.scheme_id, row.benchmark_index, row.fund_xirr, row.benchmark_xirr)
                for row in result.funds
            ] == [
                (row.scheme_id, row.benchmark_index, row.fund_xirr, row.benchmark_xirr)
                for row in baseline.funds
            ]


def test_window_work_does_not_grow_with_the_number_of_funds():
    async def window_statement_count(fund_count):
        db = _session()
        member = _household_member(db)
        schemes = []
        purchase_date = date.today().replace(year=date.today().year - 6)
        for n in range(fund_count):
            scheme = _scheme(
                db,
                name=f"Fund {n}",
                sebi_category="Equity Scheme - Large Cap Fund",
            )
            _folio_with_purchase(
                db,
                member,
                scheme,
                Decimal("1000"),
                Decimal("100"),
                Decimal("10"),
                purchase_date,
            )
            schemes.append(scheme)

        ctx = _window_context([scheme.id for scheme in schemes])
        holdings = [
            HoldingRow(
                scheme_id=str(scheme.id),
                scheme_name=scheme.name,
                amc_name=scheme.amc_name,
                household_member_id=str(member.id),
                household_member_name=member.name,
                plan_type=PlanType.DIRECT,
                units_held="100",
                average_nav="10",
                current_nav="10",
                current_nav_date=date.today(),
                amount_invested="1000",
                current_value="1000",
                current_profit_total="0",
                realized_gain="0",
                unrealized_gain="0",
                today_gain="0",
            )
            for scheme in schemes
        ]
        measuring = False
        statements = 0

        @event.listens_for(db.get_bind(), "before_cursor_execute")
        def count_window_statements(conn, cursor, statement, parameters, context, executemany):
            nonlocal statements
            if measuring:
                statements += 1

        async def context_once(*args):
            nonlocal measuring
            measuring = True
            return ctx

        with (
            patch("app.services.analytics.benchmark.compute_holdings", new=AsyncMock(return_value=holdings)),
            patch(
                "app.services.analytics.benchmark._benchmark_xirr_for_transactions",
                new=AsyncMock(return_value=Decimal("0.1")),
            ),
            patch("app.services.analytics.benchmark.ensure_index_history_fresh", new=AsyncMock(return_value=False)),
            patch(
                "app.services.analytics.benchmark.build_window_context",
                new=AsyncMock(side_effect=context_once),
                create=True,
            ),
        ):
            await compute_fund_vs_benchmark(db, [member.id])

        event.remove(db.get_bind(), "before_cursor_execute", count_window_statements)
        db.close()
        return statements

    two_funds = asyncio.run(window_statement_count(2))
    six_funds = asyncio.run(window_statement_count(6))

    # One levels query per legacy index plus the two-statement re-select that refreshes rows a commit expired.
    assert two_funds == six_funds == len(enum_module.LEGACY_BENCHMARK_INDICES) + 2


def test_non_database_failure_in_window_inputs_does_not_roll_back_the_session():
    db = _session()
    member, large_cap, mid_cap, ctx = _seed_two_fund_window_case(db)
    p1, p2 = _mock_holdings_multi({large_cap.id: Decimal("12"), mid_cap.id: Decimal("9")})
    rollbacks = []
    real_rollback = db.rollback
    db.rollback = lambda: rollbacks.append(1) or real_rollback()

    with (
        p1,
        p2,
        patch("app.services.analytics.benchmark.ensure_index_history_fresh", new=AsyncMock(return_value=True)),
        patch(
            "app.services.analytics.benchmark.build_window_context",
            new=AsyncMock(side_effect=TypeError("engine bug")),
        ),
    ):
        summary = asyncio.run(compute_portfolio_vs_benchmarks(db, [member.id]))

    assert summary.windows == []
    assert rollbacks == []  # a rollback would expire every loaded transaction for nothing


def test_database_failure_in_window_inputs_rolls_the_session_back_and_degrades():
    from sqlalchemy.exc import OperationalError

    db = _session()
    member, large_cap, mid_cap, ctx = _seed_two_fund_window_case(db)
    p1, p2 = _mock_holdings_multi({large_cap.id: Decimal("12"), mid_cap.id: Decimal("9")})
    rollbacks = []
    real_rollback = db.rollback
    db.rollback = lambda: rollbacks.append(1) or real_rollback()

    with (
        p1,
        p2,
        patch("app.services.analytics.benchmark.ensure_index_history_fresh", new=AsyncMock(return_value=True)),
        patch(
            "app.services.analytics.benchmark.build_window_context",
            new=AsyncMock(side_effect=OperationalError("stmt", {}, Exception("connection lost"))),
        ),
    ):
        summary = asyncio.run(compute_portfolio_vs_benchmarks(db, [member.id]))

    assert summary.windows == []
    assert rollbacks == [1]


def test_commit_during_window_inputs_does_not_cause_a_refresh_query_per_transaction():
    """A snapshot rebuild commits and expires every loaded row; the windows must not then pay one
    refresh query per transaction (the cost would scale with history length)."""

    async def window_statements(purchases_per_fund):
        db = _session()
        member = _household_member(db)
        schemes = [_scheme(db, f"Fund {n}", sebi_category="Equity Scheme - Flexi Cap Fund") for n in range(2)]
        first = date.today().replace(year=date.today().year - 6)
        for scheme in schemes:
            for n in range(purchases_per_fund):
                _folio_with_purchase(
                    db, member, scheme, Decimal("1000"), Decimal("100"), Decimal("10"),
                    first + timedelta(days=30 * n),
                )
        ctx = _window_context([scheme.id for scheme in schemes])
        _seed_all_tri_history(db, [first, date.today(), *(s for s in ctx.starts.values() if s is not None)])
        measuring = False
        count = 0

        @event.listens_for(db.get_bind(), "before_cursor_execute")
        def counter(conn, cursor, statement, parameters, context, executemany):
            nonlocal count
            if measuring:
                count += 1

        async def committing_context(*args):
            nonlocal measuring
            db.commit()  # what get_snapshots does when it rebuilds
            measuring = True
            return ctx

        p1, p2 = _mock_holdings_multi({scheme.id: Decimal("12") for scheme in schemes})
        with (
            p1,
            p2,
            patch("app.services.analytics.benchmark.ensure_index_history_fresh", new=AsyncMock(return_value=True)),
            patch("app.services.analytics.benchmark.build_window_context", new=AsyncMock(side_effect=committing_context)),
        ):
            summary = await compute_portfolio_vs_benchmarks(db, [member.id])
        assert summary.windows
        event.remove(db.get_bind(), "before_cursor_execute", counter)
        db.close()
        return count

    assert asyncio.run(window_statements(2)) == asyncio.run(window_statements(12))


def test_production_path_passes_the_legacy_since_inception_rates_to_the_window_engine():
    from unittest.mock import MagicMock

    from app.services.analytics import benchmark_windows
    from app.services.analytics.benchmark import _xirr_str

    legacy = set(enum_module.LEGACY_BENCHMARK_INDICES)
    db = _session()
    member, large_cap, mid_cap, ctx = _seed_two_fund_window_case(db)
    navs = {large_cap.id: Decimal("12"), mid_cap.id: Decimal("9")}

    portfolio_spy = MagicMock(side_effect=benchmark_windows.compute_window_rows)
    p1, p2 = _mock_holdings_multi(navs)
    with (
        p1,
        p2,
        patch("app.services.analytics.benchmark.ensure_index_history_fresh", new=AsyncMock(return_value=True)),
        patch("app.services.analytics.benchmark.build_window_context", new=AsyncMock(return_value=ctx)),
        patch("app.services.analytics.benchmark.compute_window_rows", new=portfolio_spy),
    ):
        summary = asyncio.run(compute_portfolio_vs_benchmarks(db, [member.id]))

    given = portfolio_spy.call_args.kwargs["since_inception"]
    assert _xirr_str(given.portfolio) == summary.portfolio_xirr
    assert {index: _xirr_str(rate) for index, rate in given.indices.items()} == {
        row.index: row.xirr for row in summary.benchmarks
    }
    si_row = summary.windows[-1]
    assert si_row.window == "SI"
    assert si_row.portfolio_xirr == summary.portfolio_xirr
    assert {row.index: row.xirr for row in si_row.indices if row.index in legacy} == {
        row.index: row.xirr for row in summary.benchmarks
    }

    fund_spy = MagicMock(side_effect=benchmark_windows.compute_fund_window_rows)
    p1, p2 = _mock_holdings_multi(navs)
    with (
        p1,
        p2,
        patch("app.services.analytics.benchmark.ensure_index_history_fresh", new=AsyncMock(return_value=True)),
        patch("app.services.analytics.benchmark.build_window_context", new=AsyncMock(return_value=ctx)),
        patch("app.services.analytics.benchmark.compute_fund_window_rows", new=fund_spy),
    ):
        funds = asyncio.run(compute_fund_vs_benchmark(db, [member.id]))

    assert fund_spy.call_count == len(funds.funds) == 2
    for call in fund_spy.call_args_list:
        scheme_id = str(call.args[1])
        row = next(row for row in funds.funds if row.scheme_id == scheme_id)
        fund_rate, benchmark_rate = call.kwargs["since_inception"]
        assert (_xirr_str(fund_rate), _xirr_str(benchmark_rate)) == (row.fund_xirr, row.benchmark_xirr)
        si_window = row.windows[-1]
        assert (si_window.window, si_window.fund_xirr, si_window.benchmark_xirr) == (
            "SI", row.fund_xirr, row.benchmark_xirr,
        )
