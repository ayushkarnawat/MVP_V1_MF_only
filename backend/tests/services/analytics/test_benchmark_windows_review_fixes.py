"""PR #12 review fixes: CAS opening balances, an oversold index replay, the IST clock, and the test gaps
the review found (mutations M27 and M28)."""

import asyncio
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest

from app.models.enums import (
    ALL_BENCHMARK_INDICES,
    BenchmarkIndex,
    BenchmarkReturnType,
    TransactionOrigin,
    TransactionType,
)
from app.models.reference import BenchmarkIndexHistory
from app.services.dashboard.schemas import SnapshotRow
from tests.services.analytics.test_benchmark_windows import (
    _assert_matches_solvers,
    _session,
    _transaction,
)

WINDOW_NAMES = ("1Y", "3Y", "5Y", "SI")


def _opening_balance(on_date, amount, origin=TransactionOrigin.CAS_OPENING):
    txn = _transaction(TransactionType.OPENING_BALANCE, on_date, amount)
    txn.origin = origin
    return txn


def _opening_context(today=date(2026, 10, 24), fund_start_values=None):
    from app.services.analytics.benchmark_windows import WindowContext

    return WindowContext(
        today=today,
        starts={"1Y": date(2025, 9, 30), "3Y": date(2023, 9, 30), "5Y": date(2021, 9, 30), "SI": None},
        portfolio_start_values={
            "1Y": Decimal("100000"),
            "3Y": Decimal("80000"),
            "5Y": Decimal("60000"),
            "SI": None,
        },
        fund_start_values=fund_start_values or {"1Y": {}, "3Y": {}, "5Y": {}, "SI": {}},
    )


def _flat_levels(*days):
    from app.services.analytics.benchmark_windows import IndexLevels

    return {index: IndexLevels(list(days), [Decimal("100")] * len(days)) for index in ALL_BENCHMARK_INDICES}


# --- H1: a CAS opening balance inside a window is not new money -------------------------------------------


def test_a_cas_opening_balance_inside_a_window_makes_that_window_unavailable():
    from app.services.analytics.benchmark_windows import compute_window_rows

    today = date(2026, 10, 24)
    transactions = [
        _transaction(TransactionType.PURCHASE, date(2020, 1, 1), "50000"),
        _opening_balance(date(2026, 3, 1), "400000"),  # a later CAS: its statement start, not a purchase date
    ]
    levels = _flat_levels(
        date(2020, 1, 1), date(2021, 9, 30), date(2023, 9, 30), date(2025, 9, 30), date(2026, 3, 1), today
    )

    rows = compute_window_rows(_opening_context(today), transactions, Decimal("600000"), levels)

    for row in rows[:3]:
        assert row.available is False
        assert row.start_date is None
        assert row.portfolio_xirr is None
        assert [item.index for item in row.indices] == list(ALL_BENCHMARK_INDICES)
        assert all(item.xirr is None for item in row.indices)
        assert row.unavailable_reason == "opening_balance_in_window"
    since_inception = rows[3]
    assert since_inception.window == "SI"
    assert since_inception.available is True
    assert since_inception.unavailable_reason is None
    assert since_inception.portfolio_xirr is not None


def test_only_the_windows_that_contain_the_opening_balance_are_unavailable():
    from app.services.analytics.benchmark_windows import compute_window_rows

    today = date(2026, 10, 24)
    transactions = [
        _transaction(TransactionType.PURCHASE, date(2020, 1, 1), "50000"),
        _opening_balance(date(2024, 6, 1), "400000"),  # after the 3Y and 5Y starts, before the 1Y start
    ]
    levels = _flat_levels(
        date(2020, 1, 1), date(2021, 9, 30), date(2023, 9, 30), date(2024, 6, 1), date(2025, 9, 30), today
    )

    one_year, three_year, five_year, _ = compute_window_rows(
        _opening_context(today), transactions, Decimal("600000"), levels
    )

    assert one_year.available is True
    assert one_year.unavailable_reason is None
    assert one_year.portfolio_xirr is not None
    assert all(item.xirr is not None for item in one_year.indices)
    assert (three_year.available, five_year.available) == (False, False)
    assert three_year.unavailable_reason == five_year.unavailable_reason == "opening_balance_in_window"


def test_a_cas_opening_balance_on_the_window_start_date_is_not_inside_the_window():
    from app.services.analytics.benchmark_windows import compute_window_rows

    today = date(2026, 10, 24)
    start = date(2025, 9, 30)
    transactions = [_opening_balance(start, "100000")]  # open-left interval: already in the start value

    row = compute_window_rows(
        _opening_context(today), transactions, Decimal("110000"), _flat_levels(start, today)
    )[0]

    assert row.available is True
    assert row.portfolio_xirr is not None


def test_a_manual_opening_balance_keeps_its_user_entered_date_as_a_real_flow():
    from app.services.analytics.benchmark_windows import compute_window_rows

    today = date(2026, 10, 24)
    start = date(2025, 9, 30)
    manual_date = date(2026, 3, 1)
    transactions = [_opening_balance(manual_date, "5000", origin=TransactionOrigin.MANUAL)]

    row = compute_window_rows(
        _opening_context(today), transactions, Decimal("120000"), _flat_levels(start, manual_date, today)
    )[0]

    assert row.available is True
    assert row.unavailable_reason is None
    _assert_matches_solvers(
        row.portfolio_xirr,
        [(start, Decimal("-100000")), (manual_date, Decimal("-5000")), (today, Decimal("120000"))],
    )


def test_a_fund_window_with_a_cas_opening_balance_inside_it_has_no_rate():
    """Multi-folio fund: folio A has held the scheme for years, folio B appeared with a later CAS."""
    from app.services.analytics.benchmark_windows import compute_fund_window_rows

    today = date(2026, 10, 24)
    scheme_id = uuid.uuid4()
    ctx = _opening_context(
        today,
        {window: ({scheme_id: Decimal("1000")} if window != "SI" else {}) for window in WINDOW_NAMES},
    )
    transactions = [
        _transaction(TransactionType.PURCHASE, date(2020, 1, 1), "1000"),
        _opening_balance(date(2026, 3, 1), "9000"),
    ]

    rows = compute_fund_window_rows(
        ctx,
        scheme_id,
        transactions,
        Decimal("12000"),
        BenchmarkIndex.NIFTY_50,
        _flat_levels(date(2020, 1, 1), date(2025, 9, 30), date(2026, 3, 1), today),
    )

    assert [(row.window, row.fund_xirr, row.benchmark_xirr) for row in rows[:3]] == [
        ("1Y", None, None),
        ("3Y", None, None),
        ("5Y", None, None),
    ]
    assert rows[3].fund_xirr is not None


# --- M1: the hypothetical index replay must not sell more units than it holds -----------------------------


def _levels_100_110_x(start, middle, today, last):
    from app.services.analytics.benchmark_windows import IndexLevels

    return IndexLevels([start, middle, today], [Decimal("100"), Decimal("110"), Decimal(last)])


@pytest.mark.parametrize("last_level", ["120", "95"])
def test_index_replay_that_sells_more_units_than_it_holds_has_no_rate(last_level):
    """Fund 100,000 at index 100, fully redeemed for 130,000 at index 110: the index replay would have to
    sell 1,181.8 units but holds 1,000. The old code solved the negative terminal value anyway and
    returned 29.95% (index +20% afterwards) or +43.5% (index 95)."""
    from app.services.analytics.benchmark_windows import index_window_xirr
    from app.services.analytics.xirr_fast import xirr_fast

    start, middle, today = date(2025, 9, 30), date(2026, 2, 27), date(2026, 10, 24)
    levels = _levels_100_110_x(start, middle, today, last_level)

    for solver in (None, xirr_fast):
        assert (
            index_window_xirr(levels, [(middle, Decimal("130000"))], start, Decimal("100000"), today, solver)
            is None
        )


def test_index_replay_that_sells_more_units_than_it_holds_has_no_since_inception_rate_either():
    from app.services.analytics.benchmark_windows import index_window_xirr

    first, middle, today = date(2024, 1, 1), date(2025, 1, 1), date(2026, 10, 24)
    levels = _levels_100_110_x(first, middle, today, "120")

    assert (
        index_window_xirr(
            levels, [(first, Decimal("-100000")), (middle, Decimal("130000"))], None, None, today
        )
        is None
    )


def test_index_replay_that_sells_exactly_what_it_holds_still_has_a_rate():
    from app.services.analytics.benchmark_windows import index_window_xirr

    start, middle, today = date(2025, 9, 30), date(2026, 2, 27), date(2026, 10, 24)
    levels = _levels_100_110_x(start, middle, today, "120")

    rate = index_window_xirr(levels, [(middle, Decimal("110000"))], start, Decimal("100000"), today)

    expected = Decimal("1.1") ** (Decimal(365) / Decimal((middle - start).days)) - Decimal(1)
    assert rate is not None
    assert abs(rate - expected) < Decimal("0.000001")


def test_index_replay_ignores_decimal_rounding_dust_when_everything_is_sold():
    """1/3 three times then 3/3: the replayed units come to -1e-28, which is rounding, not an oversale."""
    from app.services.analytics.benchmark_windows import IndexLevels, index_window_xirr

    first, last, today = date(2025, 1, 1), date(2025, 7, 1), date(2026, 1, 1)
    levels = IndexLevels([first, last, today], [Decimal("3"), Decimal("3"), Decimal("4")])
    flows = [(first, Decimal("-1"))] * 3 + [(last, Decimal("3"))]

    assert index_window_xirr(levels, flows, None, None, today) is not None


def test_compute_window_rows_gives_no_rate_for_an_index_whose_replay_is_oversold():
    from app.services.analytics.benchmark_windows import IndexLevels, compute_window_rows

    today = date(2026, 10, 24)
    start = date(2025, 9, 30)
    middle = date(2026, 2, 27)
    transactions = [_transaction(TransactionType.REDEMPTION, middle, "99000")]
    levels = _flat_levels(start, middle, today)  # sells 990 of the 1,000 units held: fine
    levels[BenchmarkIndex.NIFTY_SMALLCAP_250] = IndexLevels(  # the index dipped to 90: needs 1,100 units
        [start, middle, today], [Decimal("100"), Decimal("90"), Decimal("120")]
    )

    row = compute_window_rows(_opening_context(today), transactions, Decimal("10000"), levels)[0]

    by_index = {item.index: item.xirr for item in row.indices}
    assert by_index[BenchmarkIndex.NIFTY_SMALLCAP_250] is None
    assert by_index[BenchmarkIndex.NIFTY_50] is not None


# --- L-e: "today" is the Indian date -------------------------------------------------------------------


def test_ist_today_is_the_indian_date_when_utc_is_still_the_previous_day(monkeypatch):
    import app.services.analytics.benchmark_windows as windows_module

    # 19:00 UTC on 31 October is 00:30 IST on 1 November.
    monkeypatch.setattr(
        windows_module, "_utc_now", lambda: datetime(2026, 10, 31, 19, 0, tzinfo=timezone.utc)
    )

    assert windows_module.ist_today() == date(2026, 11, 1)
    assert windows_module.window_start("1Y", windows_module.ist_today()) == date(2025, 10, 31)
    assert windows_module.window_start("1Y", date(2026, 10, 31)) == date(2025, 9, 30)


def test_window_inputs_use_the_indian_date_for_today_and_the_window_start(monkeypatch):
    import app.services.analytics.benchmark_windows as windows_module
    from app.services.analytics.benchmark import _window_inputs

    monkeypatch.setattr(
        windows_module, "_utc_now", lambda: datetime(2026, 10, 31, 19, 0, tzinfo=timezone.utc)
    )
    db = _session()

    with patch("app.services.analytics.benchmark.ensure_index_history_fresh", new=AsyncMock(return_value=True)):
        ctx, _levels = asyncio.run(_window_inputs(db, [], date(2020, 1, 1), (BenchmarkIndex.NIFTY_50,)))

    assert ctx.today == date(2026, 11, 1)
    assert ctx.starts["1Y"] == date(2025, 10, 31)


# --- L-c: test gaps (mutations M27 and M28) ---------------------------------------------------------------


def test_build_window_context_member_with_history_before_the_start_but_no_row_for_it_is_unavailable(
    monkeypatch,
):
    """A snapshot exactly at the window start is required once the member's history began on or before it.
    The nearest earlier month is not a substitute (mutation M27)."""
    import app.services.analytics.benchmark_windows as windows_module

    member_id = uuid.uuid4()
    snapshots = [
        SnapshotRow(
            household_member_id=str(member_id),
            household_member_name="Self",
            snapshot_month=month,
            total_value=value,
        )
        for month, value in [
            (date(2025, 8, 31), "90.00"),
            (date(2025, 10, 31), "110.00"),  # no 30 September row
        ]
    ]
    monkeypatch.setattr(windows_module, "get_snapshots", AsyncMock(return_value=snapshots))
    monkeypatch.setattr(windows_module, "get_month_detail", AsyncMock(return_value=None))

    ctx = asyncio.run(windows_module.build_window_context(object(), [member_id], date(2026, 10, 24)))

    assert ctx.starts["1Y"] == date(2025, 9, 30)
    assert ctx.portfolio_start_values["1Y"] is None


def test_load_index_levels_keeps_the_end_date_and_drops_everything_after_it():
    """Mutation M28: a loosened `date <= end` bound would let future rows into the series."""
    from app.services.analytics.benchmark_windows import load_index_levels

    db = _session()
    start, end = date(2026, 1, 15), date(2026, 1, 31)
    for day, value in [(start, "100"), (end, "110"), (end + timedelta(days=1), "999")]:
        db.add(
            BenchmarkIndexHistory(
                index_name=BenchmarkIndex.NIFTY_50,
                date=day,
                return_type=BenchmarkReturnType.TRI,
                value=Decimal(value),
            )
        )
    db.commit()

    loaded = load_index_levels(db, (BenchmarkIndex.NIFTY_50,), start, end)[BenchmarkIndex.NIFTY_50]

    assert loaded.dates == [start, end]
    assert loaded.values == [Decimal("100"), Decimal("110")]
    assert loaded.on_or_before(end + timedelta(days=1)) == Decimal("110")
