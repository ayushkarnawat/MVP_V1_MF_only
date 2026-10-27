import asyncio
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from unittest.mock import AsyncMock, patch

from app.db.base import Base
from app.models.enums import (
    ALL_BENCHMARK_INDICES,
    LEGACY_BENCHMARK_INDICES,
    BenchmarkIndex,
    BenchmarkReturnType,
    PlanType,
    Relationship,
    TransactionType,
)
from app.models.folio import Folio
from app.models.reference import BenchmarkIndexHistory, Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.dashboard.schemas import HoldingRow, MonthDetail, MonthFundRow, SnapshotRow


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def _seed_transactions(db, count):
    now = datetime.now(timezone.utc)
    user = User(
        id=uuid.uuid4(),
        phone_number=f"+919{uuid.uuid4().int % 1_000_000_000:09d}",
        created_at=now,
    )
    member = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name="Self",
        relationship=Relationship.SELF,
        created_at=now,
    )
    scheme = Scheme(
        id=uuid.uuid4(),
        amfi_code=uuid.uuid4().hex[:6],
        isin="INF123",
        name="Test Fund",
        amc_name="Test AMC",
        sebi_category="Equity Scheme - Flexi Cap Fund",
    )
    folio = Folio(
        id=uuid.uuid4(),
        household_member_id=member.id,
        scheme_id=scheme.id,
        folio_number="F1",
        plan_type=PlanType.DIRECT,
    )
    db.add_all([user, member, scheme, folio])
    db.flush()
    for position in range(count):
        db.add(
            Transaction(
                id=uuid.uuid4(),
                folio_id=folio.id,
                import_id=uuid.uuid4(),
                type=TransactionType.PURCHASE,
                date=date(2024, 1, 1) + timedelta(days=position),
                amount=Decimal(100 + position),
                units=Decimal("1"),
                nav=Decimal(100 + position),
            )
        )
    db.commit()



def _assert_matches_solvers(actual, flows):
    """Window rates come from the faster 18-digit solver. It agrees with the legacy solver far better
    than 1e-8 but not digit for digit; the digit-for-digit rule belongs to the since-inception numbers."""
    from app.services.analytics.benchmark import _xirr_str
    from app.services.analytics.xirr import xirr
    from app.services.analytics.xirr_fast import xirr_fast

    assert actual == _xirr_str(xirr_fast(flows))
    assert abs(Decimal(actual) - xirr(flows)) < Decimal("1e-8")


def _transaction(kind, on_date, amount):
    return Transaction(
        id=uuid.uuid4(),
        folio_id=uuid.uuid4(),
        import_id=uuid.uuid4(),
        type=kind,
        date=on_date,
        amount=Decimal(amount),
        units=Decimal("1"),
        nav=Decimal(amount),
    )


def _seed_mixed_portfolio(db):
    now = datetime.now(timezone.utc)
    user = User(
        id=uuid.uuid4(),
        phone_number=f"+919{uuid.uuid4().int % 1_000_000_000:09d}",
        created_at=now,
    )
    member = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name="Self",
        relationship=Relationship.SELF,
        created_at=now,
    )
    scheme = Scheme(
        id=uuid.uuid4(),
        amfi_code=uuid.uuid4().hex[:6],
        isin="INF456",
        name="Mixed Flow Fund",
        amc_name="Test AMC",
        sebi_category="Equity Scheme - Flexi Cap Fund",
    )
    folio = Folio(
        id=uuid.uuid4(),
        household_member_id=member.id,
        scheme_id=scheme.id,
        folio_number="MIXED",
        plan_type=PlanType.DIRECT,
    )
    db.add_all([user, member, scheme, folio])
    db.flush()
    flows = [
        (TransactionType.PURCHASE, date(2025, 1, 10), "5000"),
        (TransactionType.PURCHASE_SIP, date(2025, 4, 10), "1000"),
        (TransactionType.REDEMPTION, date(2025, 8, 10), "800"),
        (TransactionType.DIVIDEND_PAYOUT, date(2025, 11, 10), "200"),
        (TransactionType.SWITCH_IN, date(2026, 2, 10), "600"),
        (TransactionType.SWITCH_OUT, date(2026, 5, 10), "300"),
    ]
    for kind, on_date, amount in flows:
        db.add(
            Transaction(
                id=uuid.uuid4(),
                folio_id=folio.id,
                import_id=uuid.uuid4(),
                type=kind,
                date=on_date,
                amount=Decimal(amount),
                units=Decimal("10"),
                nav=Decimal("100"),
            )
        )
    db.commit()
    return member, scheme


@pytest.mark.parametrize(
    ("window", "today", "expected"),
    [
        ("1Y", date(2026, 10, 24), date(2025, 9, 30)),
        ("3Y", date(2026, 10, 24), date(2023, 9, 30)),
        ("5Y", date(2026, 10, 24), date(2021, 9, 30)),
        ("1Y", date(2028, 3, 10), date(2027, 2, 28)),
        ("3Y", date(2028, 3, 10), date(2025, 2, 28)),
        ("1Y", date(2026, 1, 5), date(2024, 12, 31)),
        ("SI", date(2026, 10, 24), None),
    ],
)
def test_window_start_uses_last_completed_month_end(window, today, expected):
    from app.services.analytics.benchmark_windows import window_start

    assert window_start(window, today) == expected


def test_window_start_rejects_unknown_window():
    from app.services.analytics.benchmark_windows import window_start

    with pytest.raises(ValueError, match="Unknown benchmark window"):
        window_start("2Y", date(2026, 10, 24))


def test_index_levels_on_or_before_uses_the_nearest_stored_date():
    from app.services.analytics.benchmark_windows import IndexLevels

    levels = IndexLevels(
        [date(2026, 10, 16), date(2026, 10, 19)],
        [Decimal("100"), Decimal("105")],
    )

    assert levels.on_or_before(date(2026, 10, 16)) == Decimal("100")
    assert levels.on_or_before(date(2026, 10, 17)) == Decimal("100")
    assert levels.on_or_before(date(2026, 10, 15)) is None
    assert levels.on_or_before(date(2026, 10, 20)) == Decimal("105")


def test_load_index_levels_reads_only_tri_and_the_ten_day_lookback():
    from app.services.analytics.benchmark_windows import load_index_levels

    db = _session()
    start = date(2026, 1, 15)
    end = date(2026, 1, 31)
    db.add_all(
        [
            BenchmarkIndexHistory(
                index_name=BenchmarkIndex.NIFTY_50,
                date=start - timedelta(days=11),
                return_type=BenchmarkReturnType.TRI,
                value=Decimal("90"),
            ),
            BenchmarkIndexHistory(
                index_name=BenchmarkIndex.NIFTY_50,
                date=start - timedelta(days=10),
                return_type=BenchmarkReturnType.TRI,
                value=Decimal("100"),
            ),
            BenchmarkIndexHistory(
                index_name=BenchmarkIndex.NIFTY_50,
                date=start,
                return_type=BenchmarkReturnType.TRI,
                value=Decimal("110"),
            ),
            BenchmarkIndexHistory(
                index_name=BenchmarkIndex.NIFTY_50,
                date=start,
                return_type=BenchmarkReturnType.PRICE,
                value=Decimal("999"),
            ),
        ]
    )
    db.commit()

    loaded = load_index_levels(
        db,
        (BenchmarkIndex.NIFTY_50, BenchmarkIndex.NIFTY_NEXT_50),
        start,
        end,
    )

    assert loaded[BenchmarkIndex.NIFTY_50].dates == [start - timedelta(days=10), start]
    assert loaded[BenchmarkIndex.NIFTY_50].values == [Decimal("100"), Decimal("110")]
    assert loaded[BenchmarkIndex.NIFTY_NEXT_50].on_or_before(end) is None


@pytest.mark.parametrize("transaction_count", [5, 50])
def test_load_index_levels_issues_one_statement_per_index_regardless_of_transactions(
    transaction_count,
):
    from app.services.analytics.benchmark_windows import load_index_levels

    db = _session()
    _seed_transactions(db, transaction_count)
    statements = []

    @event.listens_for(db.get_bind(), "before_cursor_execute")
    def record_statement(_connection, _cursor, statement, _parameters, _context, _many):
        statements.append(statement)

    loaded = load_index_levels(
        db,
        ALL_BENCHMARK_INDICES,
        date(2025, 9, 30),
        date(2026, 10, 24),
    )

    assert list(loaded) == list(ALL_BENCHMARK_INDICES)
    assert len(statements) == len(ALL_BENCHMARK_INDICES) == 8
    assert all(statement.lstrip().upper().startswith("SELECT") for statement in statements)


def test_index_window_xirr_flat_index_returns_zero():
    from app.services.analytics.benchmark_windows import IndexLevels, index_window_xirr

    start = date(2025, 9, 30)
    today = date(2026, 10, 24)
    rate = index_window_xirr(
        IndexLevels([start, today], [Decimal("100"), Decimal("100")]),
        [],
        start,
        Decimal("1000"),
        today,
    )

    assert rate is not None
    assert abs(rate) < Decimal("0.0000001")


def test_index_window_xirr_doubling_matches_calendar_day_annualization():
    from app.services.analytics.benchmark_windows import IndexLevels, index_window_xirr

    start = date(2025, 9, 30)
    today = date(2026, 10, 24)
    rate = index_window_xirr(
        IndexLevels([start, today], [Decimal("100"), Decimal("200")]),
        [],
        start,
        Decimal("1000"),
        today,
    )
    days = Decimal((today - start).days)
    expected = Decimal(2) ** (Decimal(365) / days) - Decimal(1)

    assert rate is not None
    assert abs(rate - expected) < Decimal("0.000001")


def test_index_window_xirr_skips_a_flow_without_a_nearby_level(monkeypatch):
    import app.services.analytics.benchmark_windows as windows_module

    recorded = []

    def record_xirr(flows):
        recorded.extend(flows)
        return Decimal("0.5")

    monkeypatch.setattr(windows_module, "xirr", record_xirr, raising=False)
    levels = windows_module.IndexLevels(
        [date(2026, 1, 20), date(2026, 1, 30)],
        [Decimal("100"), Decimal("110")],
    )

    rate = windows_module.index_window_xirr(
        levels,
        [
            (date(2026, 1, 1), Decimal("-100")),
            (date(2026, 1, 20), Decimal("-200")),
        ],
        None,
        None,
        date(2026, 1, 30),
    )

    assert rate == Decimal("0.5")
    assert recorded == [
        (date(2026, 1, 20), Decimal("-200")),
        (date(2026, 1, 30), Decimal("220")),
    ]


def test_index_window_xirr_returns_none_when_start_level_is_missing():
    from app.services.analytics.benchmark_windows import IndexLevels, index_window_xirr

    start = date(2025, 9, 30)
    today = date(2026, 10, 24)
    levels = IndexLevels([start + timedelta(days=1), today], [Decimal("100"), Decimal("120")])

    assert index_window_xirr(levels, [], start, Decimal("1000"), today) is None


def test_index_window_xirr_returns_none_when_terminal_level_is_missing():
    from app.services.analytics.benchmark_windows import index_window_xirr

    start = date(2025, 9, 30)
    today = date(2026, 10, 24)

    class BoundaryLevels:
        def on_or_before(self, requested):
            return Decimal("100") if requested == start else None

    assert index_window_xirr(BoundaryLevels(), [], start, Decimal("1000"), today) is None


def test_index_window_xirr_without_start_or_usable_flow_returns_none():
    from app.services.analytics.benchmark_windows import IndexLevels, index_window_xirr

    today = date(2026, 10, 24)
    levels = IndexLevels([today], [Decimal("100")])

    assert index_window_xirr(levels, [], None, None, today) is None


def test_compute_window_rows_uses_open_left_interval_and_all_eight_indices():
    from app.services.analytics.benchmark import _xirr_str
    from app.services.analytics.benchmark_windows import (
        IndexLevels,
        WindowContext,
        compute_window_rows,
    )
    from app.services.analytics.xirr import xirr

    today = date(2026, 10, 24)
    start = date(2025, 9, 30)
    before = date(2025, 8, 31)
    purchase_date = date(2026, 1, 15)
    redemption_date = date(2026, 6, 10)
    transactions = [
        _transaction(TransactionType.PURCHASE, before, "7000"),
        _transaction(TransactionType.PURCHASE, start, "8000"),
        _transaction(TransactionType.PURCHASE, purchase_date, "10000"),
        _transaction(TransactionType.REDEMPTION, redemption_date, "5000"),
    ]
    ctx = WindowContext(
        today=today,
        starts={"1Y": start, "3Y": date(2023, 9, 30), "5Y": date(2021, 9, 30), "SI": None},
        portfolio_start_values={"1Y": Decimal("100000"), "3Y": None, "5Y": None, "SI": None},
        fund_start_values={"1Y": {}, "3Y": {}, "5Y": {}, "SI": {}},
    )
    dates = [before, start, purchase_date, redemption_date, today]
    levels = {
        index: IndexLevels(dates, [Decimal("100")] * len(dates))
        for index in ALL_BENCHMARK_INDICES
        if index is not BenchmarkIndex.NIFTY_NEXT_50
    }
    levels[BenchmarkIndex.NIFTY_50] = IndexLevels(
        dates,
        [Decimal("90"), Decimal("100"), Decimal("110"), Decimal("120"), Decimal("150")],
    )

    rows = compute_window_rows(ctx, transactions, Decimal("130000"), levels)

    expected_flows = [
        (start, Decimal("-100000")),
        (purchase_date, Decimal("-10000")),
        (redemption_date, Decimal("5000")),
        (today, Decimal("130000")),
    ]
    one_year = rows[0]
    assert one_year.window == "1Y"
    assert one_year.available is True
    assert one_year.start_date == start
    _assert_matches_solvers(one_year.portfolio_xirr, expected_flows)
    nifty_units = (
        Decimal("100000") / Decimal("100")
        + Decimal("10000") / Decimal("110")
        - Decimal("5000") / Decimal("120")
    )
    _assert_matches_solvers(
        one_year.indices[0].xirr,
        expected_flows[:-1] + [(today, nifty_units * Decimal("150"))],
    )
    assert one_year.indices[4].index is BenchmarkIndex.NIFTY_NEXT_50
    assert one_year.indices[4].xirr is None

    assert [row.window for row in rows] == ["1Y", "3Y", "5Y", "SI"]
    for row in rows:
        assert [item.index for item in row.indices] == list(ALL_BENCHMARK_INDICES)
        assert len(row.indices) == 8
    assert rows[1].available is False
    assert rows[1].start_date is None
    assert rows[1].portfolio_xirr is None
    assert all(item.xirr is None for item in rows[1].indices)
    assert rows[3].available is True
    assert rows[3].start_date == before
    assert rows[3].portfolio_xirr is not None


def test_compute_window_rows_with_no_in_window_flow_uses_opening_and_terminal_values():
    from app.services.analytics.benchmark_windows import IndexLevels, WindowContext, compute_window_rows

    today = date(2026, 10, 24)
    start = date(2025, 9, 30)
    ctx = WindowContext(
        today=today,
        starts={"1Y": start, "3Y": date(2023, 9, 30), "5Y": date(2021, 9, 30), "SI": None},
        portfolio_start_values={"1Y": Decimal("100"), "3Y": None, "5Y": None, "SI": None},
        fund_start_values={"1Y": {}, "3Y": {}, "5Y": {}, "SI": {}},
    )
    transactions = [_transaction(TransactionType.PURCHASE, start, "100")]
    levels = {
        index: IndexLevels([start, today], [Decimal("100"), Decimal("100")])
        for index in ALL_BENCHMARK_INDICES
    }

    row = compute_window_rows(ctx, transactions, Decimal("110"), levels)[0]
    expected = Decimal("1.1") ** (
        Decimal(365) / Decimal((today - start).days)
    ) - Decimal(1)

    assert row.portfolio_xirr is not None
    assert abs(Decimal(row.portfolio_xirr) - expected) < Decimal("0.000001")


def test_compute_window_rows_returns_empty_for_no_transactions():
    from app.services.analytics.benchmark_windows import WindowContext, compute_window_rows

    today = date(2026, 10, 24)
    ctx = WindowContext(
        today=today,
        starts={"1Y": date(2025, 9, 30), "3Y": date(2023, 9, 30), "5Y": date(2021, 9, 30), "SI": None},
        portfolio_start_values={"1Y": None, "3Y": None, "5Y": None, "SI": None},
        fund_start_values={"1Y": {}, "3Y": {}, "5Y": {}, "SI": {}},
    )

    assert compute_window_rows(ctx, [], Decimal("0"), {}) == []


def test_compute_fund_window_rows_uses_only_in_window_flows_and_switch_in_as_debit():
    from app.services.analytics.benchmark import _xirr_str
    from app.services.analytics.benchmark_windows import (
        IndexLevels,
        WindowContext,
        compute_fund_window_rows,
    )
    from app.services.analytics.xirr import xirr

    scheme_id = uuid.uuid4()
    today = date(2026, 10, 24)
    start = date(2023, 9, 30)
    switch_date = date(2024, 4, 15)
    redemption_date = date(2025, 7, 1)
    transactions = [
        _transaction(TransactionType.PURCHASE, date(2022, 10, 1), "50"),
        _transaction(TransactionType.PURCHASE, start, "20"),
        _transaction(TransactionType.SWITCH_IN, switch_date, "30"),
        _transaction(TransactionType.REDEMPTION, redemption_date, "10"),
    ]
    ctx = WindowContext(
        today=today,
        starts={"1Y": date(2025, 9, 30), "3Y": start, "5Y": date(2021, 9, 30), "SI": None},
        portfolio_start_values={"1Y": None, "3Y": None, "5Y": None, "SI": None},
        fund_start_values={
            "1Y": {},
            "3Y": {scheme_id: Decimal("100")},
            "5Y": {},
            "SI": {},
        },
    )
    level_dates = [date(2022, 10, 1), start, switch_date, redemption_date, today]
    index_levels = IndexLevels(
        level_dates,
        [Decimal("80"), Decimal("100"), Decimal("120"), Decimal("130"), Decimal("150")],
    )
    levels = {BenchmarkIndex.NIFTY_50: index_levels}

    rows = compute_fund_window_rows(
        ctx,
        scheme_id,
        transactions,
        Decimal("150"),
        BenchmarkIndex.NIFTY_50,
        levels,
    )

    three_year = rows[1]
    expected_flows = [
        (start, Decimal("-100")),
        (switch_date, Decimal("-30")),
        (redemption_date, Decimal("10")),
        (today, Decimal("150")),
    ]
    _assert_matches_solvers(three_year.fund_xirr, expected_flows)
    units = Decimal("100") / Decimal("100") + Decimal("30") / Decimal("120")
    units -= Decimal("10") / Decimal("130")
    _assert_matches_solvers(
        three_year.benchmark_xirr,
        expected_flows[:-1] + [(today, units * Decimal("150"))],
    )
    assert rows[0].fund_xirr is None and rows[0].benchmark_xirr is None
    assert rows[2].fund_xirr is None and rows[2].benchmark_xirr is None
    assert rows[3].fund_xirr is not None
    assert rows[3].benchmark_xirr is not None


def test_since_inception_portfolio_rows_equal_existing_legacy_calculation_exactly():
    from app.services.analytics.benchmark import (
        _benchmark_xirr_for_transactions,
        _investment_transactions,
        _portfolio_xirr,
        _xirr_str,
    )
    from app.services.analytics.benchmark_windows import (
        WindowContext,
        compute_window_rows,
        load_index_levels,
        window_start,
    )

    db = _session()
    member, _scheme = _seed_mixed_portfolio(db)
    today = date.today()
    transactions = _investment_transactions(db, [member.id])
    history_dates = sorted({txn.date for txn in transactions} | {today})
    for index in ALL_BENCHMARK_INDICES:
        for position, history_date in enumerate(history_dates):
            db.add(
                BenchmarkIndexHistory(
                    index_name=index,
                    date=history_date,
                    return_type=BenchmarkReturnType.TRI,
                    value=Decimal(100 + position * 5),
                )
            )
    db.commit()
    levels = load_index_levels(
        db,
        ALL_BENCHMARK_INDICES,
        min(txn.date for txn in transactions),
        today,
    )
    ctx = WindowContext(
        today=today,
        starts={"1Y": window_start("1Y", today), "3Y": window_start("3Y", today), "5Y": window_start("5Y", today), "SI": None},
        portfolio_start_values={"1Y": None, "3Y": None, "5Y": None, "SI": None},
        fund_start_values={"1Y": {}, "3Y": {}, "5Y": {}, "SI": {}},
    )
    current_value = Decimal("12000")

    rows = compute_window_rows(ctx, transactions, current_value, levels)
    since_inception = rows[3]

    assert since_inception.portfolio_xirr == _xirr_str(
        _portfolio_xirr(transactions, current_value)
    )

    async def existing_rates():
        return [
            _xirr_str(await _benchmark_xirr_for_transactions(db, transactions, index))
            for index in LEGACY_BENCHMARK_INDICES
        ]

    with patch(
        "app.services.analytics.benchmark.ensure_index_history_fresh",
        new=AsyncMock(return_value=True),
    ):
        expected = asyncio.run(existing_rates())
    assert [row.xirr for row in since_inception.indices[:4]] == expected


def test_since_inception_portfolio_rate_ends_at_the_context_today_not_the_real_today():
    """MX1 / L1: the SI portfolio rate's terminal date is ctx.today, the same date the index replay ends at."""
    from datetime import timedelta

    from app.services.analytics.benchmark import _investment_transactions, _signed_amount, _xirr_str
    from app.services.analytics.benchmark_windows import SinceInceptionRates, WindowContext, compute_window_rows
    from app.services.dashboard.xirr import xirr

    db = _session()
    member, _scheme = _seed_mixed_portfolio(db)
    transactions = _investment_transactions(db, [member.id])
    ctx_today = date.today() - timedelta(days=40)
    ctx = WindowContext(
        today=ctx_today,
        starts={"1Y": None, "3Y": None, "5Y": None, "SI": None},
        portfolio_start_values={"1Y": None, "3Y": None, "5Y": None, "SI": None},
        fund_start_values={"1Y": {}, "3Y": {}, "5Y": {}, "SI": {}},
    )
    current_value = Decimal("12000")
    expected = _xirr_str(
        xirr([(t.date, _signed_amount(t)) for t in transactions] + [(ctx_today, current_value)])
    )
    real_today_rate = _xirr_str(
        xirr([(t.date, _signed_amount(t)) for t in transactions] + [(date.today(), current_value)])
    )
    assert expected != real_today_rate  # the fixture can tell the two terminal dates apart

    computed = compute_window_rows(ctx, transactions, current_value, {})[3]
    assert computed.portfolio_xirr == expected

    # A rate solved to the real date.today() is not reused when the context's today differs.
    supplied = compute_window_rows(
        ctx, transactions, current_value, {},
        since_inception=SinceInceptionRates(portfolio=xirr([(t.date, _signed_amount(t)) for t in transactions] + [(date.today(), current_value)]), indices={}),
    )[3]
    assert supplied.portfolio_xirr == expected


def test_since_inception_fund_row_equals_existing_fund_comparison_exactly():
    from app.services.analytics.benchmark import (
        _fund_level_transactions,
        compute_fund_vs_benchmark,
    )
    from app.services.analytics.benchmark_windows import (
        WindowContext,
        compute_fund_window_rows,
        load_index_levels,
        window_start,
    )

    db = _session()
    member, scheme = _seed_mixed_portfolio(db)
    today = date.today()
    transactions = _fund_level_transactions(db, [member.id])
    history_dates = sorted({txn.date for txn in transactions} | {today})
    for index in ALL_BENCHMARK_INDICES:
        for position, history_date in enumerate(history_dates):
            db.add(
                BenchmarkIndexHistory(
                    index_name=index,
                    date=history_date,
                    return_type=BenchmarkReturnType.TRI,
                    value=Decimal(100 + position * 5),
                )
            )
    db.commit()
    levels = load_index_levels(
        db,
        ALL_BENCHMARK_INDICES,
        min(txn.date for txn in transactions),
        today,
    )
    ctx = WindowContext(
        today=today,
        starts={"1Y": window_start("1Y", today), "3Y": window_start("3Y", today), "5Y": window_start("5Y", today), "SI": None},
        portfolio_start_values={"1Y": None, "3Y": None, "5Y": None, "SI": None},
        fund_start_values={"1Y": {}, "3Y": {}, "5Y": {}, "SI": {}},
    )
    current_value = Decimal("12000")
    holding = HoldingRow(
        scheme_id=str(scheme.id),
        scheme_name=scheme.name,
        amc_name=scheme.amc_name,
        asset_class="Equity",
        household_member_id=str(member.id),
        household_member_name=member.name,
        plan_type=PlanType.DIRECT,
        units_held="100",
        average_nav="100",
        current_nav="120",
        current_nav_date=today,
        amount_invested="10000",
        current_value=str(current_value),
        current_profit_total="2000",
        realized_gain="0",
        unrealized_gain="2000",
        today_gain="0",
        sebi_category=scheme.sebi_category,
    )

    fund_rows = compute_fund_window_rows(
        ctx,
        scheme.id,
        transactions,
        current_value,
        BenchmarkIndex.NIFTY_500,
        levels,
    )
    with patch(
        "app.services.analytics.benchmark.compute_holdings",
        new=AsyncMock(return_value=[holding]),
    ), patch(
        "app.services.analytics.benchmark.ensure_index_history_fresh",
        new=AsyncMock(return_value=True),
    ):
        existing = asyncio.run(compute_fund_vs_benchmark(db, [member.id]))

    assert fund_rows[3].fund_xirr == existing.funds[0].fund_xirr
    assert fund_rows[3].benchmark_xirr == existing.funds[0].benchmark_xirr


def test_build_window_context_applies_history_and_fund_pricing_rules(monkeypatch):
    import app.services.analytics.benchmark_windows as windows_module

    today = date(2026, 10, 24)
    one_year_start = date(2025, 9, 30)
    early_member = uuid.uuid4()
    later_member = uuid.uuid4()
    no_data_member = uuid.uuid4()
    held_scheme = uuid.uuid4()
    unpriced_scheme = uuid.uuid4()
    bought_later_scheme = uuid.uuid4()
    snapshots = [
        SnapshotRow(
            household_member_id=str(early_member),
            household_member_name="Early",
            snapshot_month=date(2025, 8, 31),
            total_value="90.00",
        ),
        SnapshotRow(
            household_member_id=str(early_member),
            household_member_name="Early",
            snapshot_month=one_year_start,
            total_value="100.00",
        ),
        SnapshotRow(
            household_member_id=str(early_member),
            household_member_name="Early",
            snapshot_month=date(2026, 9, 30),
            total_value="130.00",
        ),
        SnapshotRow(
            household_member_id=str(later_member),
            household_member_name="Later",
            snapshot_month=date(2025, 10, 31),
            total_value="50.00",
        ),
    ]
    detail = MonthDetail(
        month=one_year_start,
        total_value="100.00",
        previous_value="90.00",
        funds=[
            MonthFundRow(
                scheme_id=str(held_scheme),
                scheme_name="Held",
                household_member_id=str(early_member),
                household_member_name="Early",
                value="40.00",
                priced=True,
            ),
            MonthFundRow(
                scheme_id=str(held_scheme),
                scheme_name="Held",
                household_member_id=str(later_member),
                household_member_name="Later",
                value="60.00",
                priced=True,
            ),
            MonthFundRow(
                scheme_id=str(unpriced_scheme),
                scheme_name="Unpriced",
                household_member_id=str(early_member),
                household_member_name="Early",
                value="10.00",
                priced=True,
            ),
            MonthFundRow(
                scheme_id=str(unpriced_scheme),
                scheme_name="Unpriced",
                household_member_id=str(later_member),
                household_member_name="Later",
                value=None,
                priced=False,
            ),
        ],
    )
    snapshot_call = AsyncMock(return_value=snapshots)
    detail_call = AsyncMock(
        side_effect=lambda _db, _members, month: detail if month == one_year_start else None
    )
    monkeypatch.setattr(windows_module, "get_snapshots", snapshot_call, raising=False)
    monkeypatch.setattr(windows_module, "get_month_detail", detail_call, raising=False)

    ctx = asyncio.run(
        windows_module.build_window_context(
            object(),
            [early_member, later_member, no_data_member],
            today,
        )
    )

    assert ctx.portfolio_start_values == {
        "1Y": Decimal("100.00"),
        "3Y": None,
        "5Y": None,
        "SI": None,
    }
    assert ctx.fund_start_values["1Y"] == {held_scheme: Decimal("100.00")}
    assert unpriced_scheme not in ctx.fund_start_values["1Y"]
    assert bought_later_scheme not in ctx.fund_start_values["1Y"]
    assert snapshot_call.await_count == 1
    assert detail_call.await_count == 3


@pytest.mark.parametrize(("total_value", "is_partial"), [("0.00", False), ("100.00", True)])
def test_build_window_context_rejects_zero_or_partial_opening_value(
    monkeypatch, total_value, is_partial
):
    import app.services.analytics.benchmark_windows as windows_module

    member_id = uuid.uuid4()
    start = date(2025, 9, 30)
    snapshots = [
        SnapshotRow(
            household_member_id=str(member_id),
            household_member_name="Self",
            snapshot_month=start,
            total_value=total_value,
            is_partial=is_partial,
        )
    ]
    monkeypatch.setattr(
        windows_module,
        "get_snapshots",
        AsyncMock(return_value=snapshots),
        raising=False,
    )
    monkeypatch.setattr(
        windows_module,
        "get_month_detail",
        AsyncMock(return_value=None),
        raising=False,
    )

    ctx = asyncio.run(
        windows_module.build_window_context(object(), [member_id], date(2026, 10, 24))
    )

    assert ctx.portfolio_start_values["1Y"] is None


def test_returned_models_have_decimal_parseable_strings_and_no_floats(monkeypatch):
    import inspect
    import app.services.analytics.benchmark_windows as windows_module

    today = date(2026, 10, 24)
    start = date(2025, 9, 30)
    scheme_id = uuid.uuid4()
    ctx = windows_module.WindowContext(
        today=today,
        starts={"1Y": start, "3Y": date(2023, 9, 30), "5Y": date(2021, 9, 30), "SI": None},
        portfolio_start_values={"1Y": Decimal("100"), "3Y": None, "5Y": None, "SI": None},
        fund_start_values={"1Y": {scheme_id: Decimal("100")}, "3Y": {}, "5Y": {}, "SI": {}},
    )
    transactions = [_transaction(TransactionType.PURCHASE, start, "100")]
    levels = {
        index: windows_module.IndexLevels(
            [start, today], [Decimal("100"), Decimal("110")]
        )
        for index in ALL_BENCHMARK_INDICES
    }

    def fail_fetch(*_args, **_kwargs):
        raise AssertionError("window engine attempted a live history fetch")

    monkeypatch.setattr(
        windows_module,
        "ensure_index_history_fresh",
        fail_fetch,
        raising=False,
    )
    portfolio_rows = windows_module.compute_window_rows(
        ctx, transactions, Decimal("110"), levels
    )
    fund_rows = windows_module.compute_fund_window_rows(
        ctx,
        scheme_id,
        transactions,
        Decimal("110"),
        BenchmarkIndex.NIFTY_50,
        levels,
    )

    for row in portfolio_rows:
        if row.portfolio_xirr is not None:
            Decimal(row.portfolio_xirr)
        for index_row in row.indices:
            if index_row.xirr is not None:
                Decimal(index_row.xirr)
    for row in fund_rows:
        if row.fund_xirr is not None:
            Decimal(row.fund_xirr)
        if row.benchmark_xirr is not None:
            Decimal(row.benchmark_xirr)

    def assert_no_float(value):
        assert not isinstance(value, float)
        if isinstance(value, dict):
            for child in value.values():
                assert_no_float(child)
        elif isinstance(value, list):
            for child in value:
                assert_no_float(child)

    assert_no_float([row.model_dump() for row in portfolio_rows])
    assert_no_float([row.model_dump() for row in fund_rows])
    assert "float(" not in inspect.getsource(windows_module)


def test_index_levels_accept_a_predecessor_exactly_ten_days_old_but_not_eleven():
    from app.services.analytics.benchmark_windows import IndexLevels

    levels = IndexLevels([date(2026, 10, 1)], [Decimal("100")])

    assert levels.on_or_before(date(2026, 10, 11)) == Decimal("100")
    assert levels.on_or_before(date(2026, 10, 12)) is None


def test_compute_window_rows_ignores_transactions_dated_after_today():
    from app.services.analytics.benchmark import _xirr_str
    from app.services.analytics.benchmark_windows import WindowContext, compute_window_rows
    from app.services.analytics.xirr import xirr

    today = date(2026, 10, 24)
    start = date(2025, 9, 30)
    ctx = WindowContext(
        today=today,
        starts={"1Y": start, "3Y": date(2023, 9, 30), "5Y": date(2021, 9, 30), "SI": None},
        portfolio_start_values={"1Y": Decimal("100"), "3Y": None, "5Y": None, "SI": None},
        fund_start_values={"1Y": {}, "3Y": {}, "5Y": {}, "SI": {}},
    )
    transactions = [
        _transaction(TransactionType.PURCHASE, date(2026, 10, 30), "50"),
    ]

    one_year = compute_window_rows(ctx, transactions, Decimal("110"), {})[0]

    _assert_matches_solvers(one_year.portfolio_xirr, [(start, Decimal("-100")), (today, Decimal("110"))])


def test_build_window_context_member_whose_first_month_is_the_window_start_counts():
    import app.services.analytics.benchmark_windows as windows_module

    member_id = uuid.uuid4()
    start = date(2025, 9, 30)
    snapshots = [
        SnapshotRow(
            household_member_id=str(member_id),
            household_member_name="Self",
            snapshot_month=start,
            total_value="100.00",
        )
    ]
    monkeypatch_targets = {
        "get_snapshots": AsyncMock(return_value=snapshots),
        "get_month_detail": AsyncMock(return_value=None),
    }
    originals = {name: getattr(windows_module, name) for name in monkeypatch_targets}
    try:
        for name, value in monkeypatch_targets.items():
            setattr(windows_module, name, value)
        ctx = asyncio.run(
            windows_module.build_window_context(object(), [member_id], date(2026, 10, 24))
        )
    finally:
        for name, value in originals.items():
            setattr(windows_module, name, value)

    assert ctx.portfolio_start_values["1Y"] == Decimal("100.00")


def test_build_window_context_fund_worth_nothing_at_the_start_is_absent():
    import app.services.analytics.benchmark_windows as windows_module

    member_id = uuid.uuid4()
    scheme_id = uuid.uuid4()
    start = date(2025, 9, 30)
    snapshots = [
        SnapshotRow(
            household_member_id=str(member_id),
            household_member_name="Self",
            snapshot_month=start,
            total_value="100.00",
        )
    ]
    detail = MonthDetail(
        month=start,
        funds=[
            MonthFundRow(
                scheme_id=str(scheme_id),
                scheme_name="Empty",
                household_member_id=str(member_id),
                household_member_name="Self",
                value="0.00",
                priced=True,
            )
        ],
    )
    patched = {
        "get_snapshots": AsyncMock(return_value=snapshots),
        "get_month_detail": AsyncMock(side_effect=lambda _db, _members, month: detail if month == start else None),
    }
    originals = {name: getattr(windows_module, name) for name in patched}
    try:
        for name, value in patched.items():
            setattr(windows_module, name, value)
        ctx = asyncio.run(
            windows_module.build_window_context(object(), [member_id], date(2026, 10, 24))
        )
    finally:
        for name, value in originals.items():
            setattr(windows_module, name, value)

    assert ctx.fund_start_values["1Y"] == {}


def test_available_portfolio_and_index_windows_use_the_fast_solver():
    import app.services.analytics.benchmark_windows as windows_module
    from app.services.analytics.benchmark import _xirr_str
    from app.services.analytics.xirr import xirr
    from app.services.analytics.xirr_fast import xirr_fast

    today = date(2026, 10, 24)
    start = date(2025, 9, 30)
    before = date(2025, 8, 31)
    purchase_date = date(2026, 1, 15)
    redemption_date = date(2026, 6, 10)
    transactions = [
        _transaction(TransactionType.PURCHASE, before, "7000"),
        _transaction(TransactionType.PURCHASE, start, "8000"),
        _transaction(TransactionType.PURCHASE, purchase_date, "10000"),
        _transaction(TransactionType.REDEMPTION, redemption_date, "5000"),
    ]
    ctx = windows_module.WindowContext(
        today=today,
        starts={"1Y": start, "3Y": date(2023, 9, 30), "5Y": date(2021, 9, 30), "SI": None},
        portfolio_start_values={"1Y": Decimal("100000"), "3Y": None, "5Y": None, "SI": None},
        fund_start_values={"1Y": {}, "3Y": {}, "5Y": {}, "SI": {}},
    )
    dates = [before, start, purchase_date, redemption_date, today]
    levels = {
        index: windows_module.IndexLevels(dates, [Decimal("100")] * len(dates))
        for index in ALL_BENCHMARK_INDICES
    }
    levels[BenchmarkIndex.NIFTY_50] = windows_module.IndexLevels(
        dates,
        [Decimal("90"), Decimal("100"), Decimal("110"), Decimal("120"), Decimal("150")],
    )
    portfolio_flows = [
        (start, Decimal("-100000")),
        (purchase_date, Decimal("-10000")),
        (redemption_date, Decimal("5000")),
        (today, Decimal("130000")),
    ]
    nifty_units = (
        Decimal("100000") / Decimal("100")
        + Decimal("10000") / Decimal("110")
        - Decimal("5000") / Decimal("120")
    )
    nifty_flows = [*portfolio_flows[:-1], (today, nifty_units * Decimal("150"))]

    with patch.object(windows_module, "xirr_fast", wraps=xirr_fast) as fast_solver:
        one_year = windows_module.compute_window_rows(
            ctx, transactions, Decimal("130000"), levels
        )[0]

    assert one_year.portfolio_xirr == _xirr_str(xirr_fast(portfolio_flows))
    assert abs(Decimal(one_year.portfolio_xirr) - xirr(portfolio_flows)) < Decimal("1e-8")
    assert one_year.indices[0].xirr == _xirr_str(xirr_fast(nifty_flows))
    assert abs(Decimal(one_year.indices[0].xirr) - xirr(nifty_flows)) < Decimal("1e-8")
    assert fast_solver.call_count == 1 + len(ALL_BENCHMARK_INDICES)
    assert any(call.args[0] == portfolio_flows for call in fast_solver.call_args_list)
    assert any(call.args[0] == nifty_flows for call in fast_solver.call_args_list)


def test_available_fund_window_uses_the_fast_solver():
    import app.services.analytics.benchmark_windows as windows_module
    from app.services.analytics.benchmark import _xirr_str
    from app.services.analytics.xirr import xirr
    from app.services.analytics.xirr_fast import xirr_fast

    scheme_id = uuid.uuid4()
    today = date(2026, 10, 24)
    start = date(2023, 9, 30)
    switch_date = date(2024, 4, 15)
    redemption_date = date(2025, 7, 1)
    transactions = [
        _transaction(TransactionType.PURCHASE, date(2022, 10, 1), "50"),
        _transaction(TransactionType.PURCHASE, start, "20"),
        _transaction(TransactionType.SWITCH_IN, switch_date, "30"),
        _transaction(TransactionType.REDEMPTION, redemption_date, "10"),
    ]
    ctx = windows_module.WindowContext(
        today=today,
        starts={"1Y": date(2025, 9, 30), "3Y": start, "5Y": date(2021, 9, 30), "SI": None},
        portfolio_start_values={"1Y": None, "3Y": None, "5Y": None, "SI": None},
        fund_start_values={"1Y": {}, "3Y": {scheme_id: Decimal("100")}, "5Y": {}, "SI": {}},
    )
    level_dates = [date(2022, 10, 1), start, switch_date, redemption_date, today]
    levels = {
        BenchmarkIndex.NIFTY_50: windows_module.IndexLevels(
            level_dates,
            [Decimal("80"), Decimal("100"), Decimal("120"), Decimal("130"), Decimal("150")],
        )
    }
    fund_flows = [
        (start, Decimal("-100")),
        (switch_date, Decimal("-30")),
        (redemption_date, Decimal("10")),
        (today, Decimal("150")),
    ]
    units = Decimal("100") / Decimal("100") + Decimal("30") / Decimal("120")
    units -= Decimal("10") / Decimal("130")
    benchmark_flows = [*fund_flows[:-1], (today, units * Decimal("150"))]

    with patch.object(windows_module, "xirr_fast", wraps=xirr_fast) as fast_solver:
        three_year = windows_module.compute_fund_window_rows(
            ctx,
            scheme_id,
            transactions,
            Decimal("150"),
            BenchmarkIndex.NIFTY_50,
            levels,
        )[1]

    assert three_year.fund_xirr == _xirr_str(xirr_fast(fund_flows))
    assert abs(Decimal(three_year.fund_xirr) - xirr(fund_flows)) < Decimal("1e-8")
    assert three_year.benchmark_xirr == _xirr_str(xirr_fast(benchmark_flows))
    assert abs(Decimal(three_year.benchmark_xirr) - xirr(benchmark_flows)) < Decimal("1e-8")
    assert fast_solver.call_count == 2
    assert any(call.args[0] == fund_flows for call in fast_solver.call_args_list)
    assert any(call.args[0] == benchmark_flows for call in fast_solver.call_args_list)


def test_supplied_portfolio_since_inception_rates_are_not_resolved():
    import app.services.analytics.benchmark_windows as windows_module
    from app.services.analytics.benchmark import _xirr_str
    from app.services.analytics.xirr_fast import xirr_fast

    # The supplied rate is reused only when ctx.today is the real date.today() (MX1): the legacy rate it
    # comes from ends there. So this test must run "as of" the real today.
    today = date.today()
    first = date(2020, 1, 1)
    transactions = [_transaction(TransactionType.PURCHASE, first, "100")]
    ctx = windows_module.WindowContext(
        today=today,
        starts={"1Y": date(2025, 9, 30), "3Y": date(2023, 9, 30), "5Y": date(2021, 9, 30), "SI": None},
        portfolio_start_values={"1Y": None, "3Y": None, "5Y": None, "SI": None},
        fund_start_values={"1Y": {}, "3Y": {}, "5Y": {}, "SI": {}},
    )
    levels = {
        index: windows_module.IndexLevels(
            [first, today], [Decimal("100"), Decimal("150")]
        )
        for index in ALL_BENCHMARK_INDICES
    }
    portfolio_rate = Decimal("0.123456789")
    legacy_rates = {
        index: Decimal("0.20") + Decimal(position) / Decimal(100)
        for position, index in enumerate(LEGACY_BENCHMARK_INDICES)
    }
    supplied = windows_module.SinceInceptionRates(
        portfolio=portfolio_rate,
        indices=legacy_rates,
    )

    with (
        patch.object(windows_module, "xirr", side_effect=AssertionError("legacy solver called")) as legacy_solver,
        patch.object(windows_module, "xirr_fast", wraps=xirr_fast) as fast_solver,
    ):
        since_inception = windows_module.compute_window_rows(
            ctx,
            transactions,
            Decimal("150"),
            levels,
            since_inception=supplied,
        )[3]

    assert since_inception.portfolio_xirr == _xirr_str(portfolio_rate)
    assert [row.xirr for row in since_inception.indices[:4]] == [
        _xirr_str(legacy_rates[index]) for index in LEGACY_BENCHMARK_INDICES
    ]
    assert all(row.xirr is not None for row in since_inception.indices[4:])
    assert legacy_solver.call_count == 0
    assert fast_solver.call_count == len(ALL_BENCHMARK_INDICES) - len(LEGACY_BENCHMARK_INDICES)


def test_supplied_fund_since_inception_rates_are_not_resolved():
    import app.services.analytics.benchmark_windows as windows_module
    from app.services.analytics.benchmark import _xirr_str

    scheme_id = uuid.uuid4()
    today = date.today()  # legacy pair is reused only when ctx.today is the real date
    first = date(2020, 1, 1)
    ctx = windows_module.WindowContext(
        today=today,
        starts={"1Y": date(2025, 9, 30), "3Y": date(2023, 9, 30), "5Y": date(2021, 9, 30), "SI": None},
        portfolio_start_values={"1Y": None, "3Y": None, "5Y": None, "SI": None},
        fund_start_values={"1Y": {}, "3Y": {}, "5Y": {}, "SI": {}},
    )
    fund_rate = Decimal("0.123456789")
    benchmark_rate = Decimal("0.234567891")

    with (
        patch.object(windows_module, "xirr", side_effect=AssertionError("legacy solver called")) as legacy_solver,
        patch.object(windows_module, "xirr_fast", side_effect=AssertionError("fast solver called")) as fast_solver,
    ):
        since_inception = windows_module.compute_fund_window_rows(
            ctx,
            scheme_id,
            [_transaction(TransactionType.PURCHASE, first, "100")],
            Decimal("150"),
            BenchmarkIndex.NIFTY_50,
            {},
            since_inception=(fund_rate, benchmark_rate),
        )[3]

    assert since_inception.fund_xirr == _xirr_str(fund_rate)
    assert since_inception.benchmark_xirr == _xirr_str(benchmark_rate)
    assert legacy_solver.call_count == 0
    assert fast_solver.call_count == 0


def _levels_through(transactions, end):
    from app.services.analytics.benchmark_windows import IndexLevels

    days = sorted({t.date for t in transactions} | {end})
    return IndexLevels(days, [Decimal(100 + 5 * i) for i in range(len(days))])


def test_since_inception_index_rates_end_at_the_context_today_not_the_real_today():
    """Register L1 follow-up / C155: a supplied (legacy, real-date.today()) index rate is reused only when
    ctx.today is the real today; otherwise it is re-solved from the same flows with the same solver."""
    from app.services.analytics.benchmark import _investment_transactions, _signed_amount, _xirr_str
    from app.services.analytics.benchmark_windows import (
        SinceInceptionRates, WindowContext, compute_window_rows, index_window_xirr,
    )
    from app.services.analytics.xirr_fast import xirr_fast

    db = _session()
    member, _scheme = _seed_mixed_portfolio(db)
    transactions = _investment_transactions(db, [member.id])
    ctx_today = date.today() - timedelta(days=40)
    ctx = WindowContext(
        today=ctx_today,
        starts={"1Y": None, "3Y": None, "5Y": None, "SI": None},
        portfolio_start_values={"1Y": None, "3Y": None, "5Y": None, "SI": None},
        fund_start_values={"1Y": {}, "3Y": {}, "5Y": {}, "SI": {}},
    )
    levels = {index: _levels_through(transactions, ctx_today) for index in ALL_BENCHMARK_INDICES}
    flows = [(t.date, _signed_amount(t)) for t in transactions]
    expected = {
        index: _xirr_str(index_window_xirr(levels[index], flows, None, None, ctx_today, xirr_fast))
        for index in ALL_BENCHMARK_INDICES
    }
    stale = SinceInceptionRates(
        portfolio=Decimal("0.5"), indices={index: Decimal("0.77") for index in ALL_BENCHMARK_INDICES},
    )

    row = compute_window_rows(ctx, transactions, Decimal("12000"), levels, since_inception=stale)[3]

    assert {r.index: r.xirr for r in row.indices} == expected
    assert all(value != _xirr_str(Decimal("0.77")) for value in expected.values())  # the fixture tells them apart


def test_since_inception_index_rates_are_reused_when_the_context_today_is_the_real_today():
    from app.services.analytics.benchmark import _investment_transactions, _xirr_str
    from app.services.analytics.benchmark_windows import SinceInceptionRates, WindowContext, compute_window_rows

    db = _session()
    member, _scheme = _seed_mixed_portfolio(db)
    transactions = _investment_transactions(db, [member.id])
    ctx = WindowContext(
        today=date.today(),
        starts={"1Y": None, "3Y": None, "5Y": None, "SI": None},
        portfolio_start_values={"1Y": None, "3Y": None, "5Y": None, "SI": None},
        fund_start_values={"1Y": {}, "3Y": {}, "5Y": {}, "SI": {}},
    )
    known = SinceInceptionRates(
        portfolio=Decimal("0.5"), indices={index: Decimal("0.77") for index in ALL_BENCHMARK_INDICES},
    )
    row = compute_window_rows(ctx, transactions, Decimal("12000"), {}, since_inception=known)[3]
    assert row.portfolio_xirr == _xirr_str(Decimal("0.5"))
    assert {r.xirr for r in row.indices} == {_xirr_str(Decimal("0.77"))}


def test_since_inception_fund_row_ends_at_the_context_today_not_the_real_today():
    from app.services.analytics.benchmark import _fund_level_transactions, _signed_amount, _xirr_str
    from app.services.analytics.benchmark_windows import WindowContext, compute_fund_window_rows, index_window_xirr
    from app.services.analytics.xirr import xirr

    db = _session()
    member, scheme = _seed_mixed_portfolio(db)
    transactions = _fund_level_transactions(db, [member.id])
    ctx_today = date.today() - timedelta(days=40)
    ctx = WindowContext(
        today=ctx_today,
        starts={"1Y": None, "3Y": None, "5Y": None, "SI": None},
        portfolio_start_values={"1Y": None, "3Y": None, "5Y": None, "SI": None},
        fund_start_values={"1Y": {}, "3Y": {}, "5Y": {}, "SI": {}},
    )
    levels = {index: _levels_through(transactions, ctx_today) for index in ALL_BENCHMARK_INDICES}
    index = ALL_BENCHMARK_INDICES[0]
    flows = [(t.date, _signed_amount(t, frozenset({TransactionType.SWITCH_IN}))) for t in transactions]
    value = Decimal("12000")

    rows = compute_fund_window_rows(
        ctx, scheme.id, transactions, value, index, levels,
        since_inception=(Decimal("0.5"), Decimal("0.6")),
    )
    si = rows[3]
    assert si.fund_xirr == _xirr_str(xirr([*flows, (ctx_today, value)]))
    assert si.benchmark_xirr == _xirr_str(index_window_xirr(levels[index], flows, None, None, ctx_today))
