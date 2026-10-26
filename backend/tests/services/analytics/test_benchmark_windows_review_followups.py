"""PR #12 second-review follow-ups (MB5): tests that pin the NAV-series reuse in `reuse_nav_series()`, the XIRR
bisection fallback, and the CAS-opening guard on the day of the window end. Each test names the mutation of
production code it exists to catch."""

import asyncio
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, Overflow, localcontext
from fractions import Fraction
from math import lcm
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import event

import app.services.analytics.xirr_fast as xirr_fast_module
import app.services.dashboard.snapshots as snapshots
from app.models.enums import (
    ALL_BENCHMARK_INDICES,
    BenchmarkIndex,
    ImportStatus,
    PlanType,
    Relationship,
    TransactionOrigin,
    TransactionType,
)
from app.models.folio import Folio
from app.models.imports import Import
from app.models.reference import NavHistory, Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.analytics.xirr import xirr
from app.services.analytics.xirr_fast import xirr_bisect, xirr_fast
from tests.services.analytics.test_benchmark_windows import _transaction

# ----------------------------------------------------------------------------------------------------------
# reuse_nav_series(): a household with two members, one shared scheme, NAVs that move every month
# ----------------------------------------------------------------------------------------------------------

LAST_COMPLETED = date(2024, 4, 30)
MONTH_ENDS = [date(2024, 2, 29), date(2024, 3, 31), date(2024, 4, 30)]


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    monkeypatch.setattr(snapshots, "warm_nav_history", AsyncMock())
    monkeypatch.setattr(snapshots, "last_completed_month_end", lambda: LAST_COMPLETED)


def _add_member(db, user, name):
    now = datetime.now(timezone.utc)
    row = HouseholdMember(id=uuid.uuid4(), user_id=user.id, name=name, relationship=Relationship.SELF, created_at=now)
    db.add(row)
    db.flush()
    imp = Import(id=uuid.uuid4(), household_member_id=row.id, status=ImportStatus.CONFIRMED, uploaded_at=now, confirmed_at=now)
    db.add(imp)
    db.flush()
    return row, imp


def _add_fund(db, owner, scheme):
    folio = Folio(
        id=uuid.uuid4(), household_member_id=owner.id, scheme_id=scheme.id,
        folio_number=uuid.uuid4().hex, plan_type=PlanType.DIRECT,
    )
    db.add(folio)
    db.flush()
    return folio


def _add_txn(db, imp, folio, day, kind, amount, units):
    db.add(
        Transaction(
            id=uuid.uuid4(), import_id=imp.id, folio_id=folio.id, date=day, type=kind,
            amount=Decimal(amount), units=Decimal(units), nav=Decimal("10"),
        )
    )


def _household(db):
    """Two members; scheme S1 is held by both, S2 only by A, S3 only by B. Every scheme has a different NAV at
    every month end, so a series cut off at an earlier month gives a visibly different valuation."""
    user = User(id=uuid.uuid4(), phone_number=f"+91{uuid.uuid4().int % 10**10:010d}", created_at=datetime.now(timezone.utc))
    db.add(user)
    db.flush()
    a, imp_a = _add_member(db, user, "A")
    b, imp_b = _add_member(db, user, "B")
    schemes = [
        Scheme(id=uuid.uuid4(), amfi_code=uuid.uuid4().hex[:6], name=f"Fund {n}", amc_name="Test AMC", sebi_category="Equity")
        for n in (1, 2, 3)
    ]
    db.add_all(schemes)
    db.flush()
    s1, s2, s3 = schemes
    a1, a2, b1, b3 = _add_fund(db, a, s1), _add_fund(db, a, s2), _add_fund(db, b, s1), _add_fund(db, b, s3)
    for imp, folio, base in [(imp_a, a1, 100), (imp_a, a2, 50), (imp_b, b1, 80), (imp_b, b3, 30)]:
        _add_txn(db, imp, folio, date(2024, 1, 10), TransactionType.PURCHASE, base * 10, base)
        _add_txn(db, imp, folio, date(2024, 2, 20), TransactionType.PURCHASE, base * 11, base)
        _add_txn(db, imp, folio, date(2024, 3, 12), TransactionType.REDEMPTION, base * 3, base // 4)
        _add_txn(db, imp, folio, date(2024, 4, 3), TransactionType.PURCHASE, base * 12, base)
    for position, scheme in enumerate(schemes):
        for day, value in [
            (date(2024, 1, 31), 10), (date(2024, 2, 15), 11), (date(2024, 2, 29), 12), (date(2024, 3, 15), 13),
            (date(2024, 3, 31), 15), (date(2024, 4, 30), 18), (date(2024, 5, 10), 40),
        ]:
            db.add(NavHistory(scheme_id=scheme.id, date=day, nav=Decimal(value) + position))
    db.commit()
    return a, b, schemes


def _details(db, subsets, months):
    async def run():
        return [
            (tuple(subset), month, await snapshots.get_month_detail(db, list(subset), month))
            for subset in subsets
            for month in months
        ]

    return run()


def _dump(results):
    return [(subset, month, None if detail is None else detail.model_dump_json()) for subset, month, detail in results]


def _subsets(a, b):
    return [[a.id], [b.id], [a.id, b.id], [b.id, a.id]]


def test_month_details_inside_reuse_nav_series_equal_uncached_in_ascending_then_descending_order(db_session):
    """Mutations: serving a series that was loaded only up to an EARLIER month for a later month (`>=` flipped to
    `<=`), or always serving whatever is cached. Both would value March and April with February's NAVs."""
    a, b, _ = _household(db_session)
    subsets = _subsets(a, b)
    uncached = _dump(asyncio.run(_details(db_session, subsets, MONTH_ENDS)))
    assert any(detail is not None for _, _, detail in uncached)

    async def cached_run(orders):
        out = {}
        with snapshots.reuse_nav_series():
            for label, months in orders:
                out[label] = _dump(await _details(db_session, subsets, months))
        return out

    # one block, ascending then descending, and a second block the other way round
    first = asyncio.run(cached_run([("asc", MONTH_ENDS), ("desc", MONTH_ENDS[::-1])]))
    second = asyncio.run(cached_run([("desc", MONTH_ENDS[::-1]), ("asc", MONTH_ENDS)]))

    expected_desc = _dump(asyncio.run(_details(db_session, subsets, MONTH_ENDS[::-1])))
    assert first["asc"] == uncached
    assert second["asc"] == uncached
    assert first["desc"] == expected_desc
    assert second["desc"] == expected_desc
    # the months really do differ, so a wrong series could not pass unnoticed
    assert len({detail for _, month, detail in uncached if detail is not None and month in MONTH_ENDS}) > 3


def test_nav_series_cache_is_restored_to_none_after_a_normal_exit_and_after_an_exception():
    """Mutation: removing `_NAV_SERIES_CACHE.reset(token)` leaves the dict in place for every later request in
    the same context (a stale cache served to a later request)."""
    assert snapshots._NAV_SERIES_CACHE.get() is None
    with snapshots.reuse_nav_series():
        assert snapshots._NAV_SERIES_CACHE.get() == {}
    assert snapshots._NAV_SERIES_CACHE.get() is None

    with pytest.raises(RuntimeError, match="boom"):
        with snapshots.reuse_nav_series():
            snapshots._NAV_SERIES_CACHE.get()["marker"] = object()
            raise RuntimeError("boom")
    assert snapshots._NAV_SERIES_CACHE.get() is None


def test_nested_nav_series_blocks_restore_the_outer_cache_after_an_exception():
    with snapshots.reuse_nav_series():
        outer = snapshots._NAV_SERIES_CACHE.get()
        with pytest.raises(RuntimeError):
            with snapshots.reuse_nav_series():
                assert snapshots._NAV_SERIES_CACHE.get() is not outer
                raise RuntimeError("inner")
        assert snapshots._NAV_SERIES_CACHE.get() is outer
    assert snapshots._NAV_SERIES_CACHE.get() is None


@contextmanager
def _nav_statements(db):
    """The SQL statements that touch nav_history, counted with a SQLAlchemy event listener."""
    engine = db.get_bind()
    seen = []

    def listener(conn, cursor, statement, parameters, context, executemany):
        if "nav_history" in statement.lower():
            seen.append(statement)

    event.listen(engine, "before_cursor_execute", listener)
    try:
        yield seen
    finally:
        event.remove(engine, "before_cursor_execute", listener)


def test_second_request_for_the_same_scheme_in_a_block_issues_no_nav_sql(db_session):
    """Mutation: never storing the loaded series in the cache."""
    _, _, (s1, _, _) = _household(db_session)
    with _nav_statements(db_session) as seen:
        with snapshots.reuse_nav_series():
            first = snapshots._nav_series(db_session, [s1.id], date(2024, 4, 30))
            assert len(seen) == 1
            second = snapshots._nav_series(db_session, [s1.id], date(2024, 4, 30))
            assert len(seen) == 1  # served from the block's cache
            # a shorter month needs no new load either: the longer series answers it
            third = snapshots._nav_series(db_session, [s1.id], date(2024, 2, 29))
            assert len(seen) == 1
    assert second == first
    assert third[0][s1.id] == first[0][s1.id]


def test_nav_series_loaded_for_an_earlier_month_is_reloaded_for_a_later_one_and_full_series_answer_everything(db_session):
    _, _, (s1, s2, _) = _household(db_session)
    with _nav_statements(db_session) as seen:
        with snapshots.reuse_nav_series():
            feb, _ = snapshots._nav_series(db_session, [s1.id], date(2024, 2, 29))
            assert len(seen) == 1
            apr, _ = snapshots._nav_series(db_session, [s1.id], date(2024, 4, 30))
            assert len(seen) == 2  # February's rows stop short of April: loaded again
            assert apr[s1.id][-1][0] == date(2024, 4, 30) and feb[s1.id][-1][0] == date(2024, 2, 29)
            # a scheme not yet in the cache is loaded; one that is, is not
            snapshots._nav_series(db_session, [s1.id, s2.id], date(2024, 4, 30))
            assert len(seen) == 3
            snapshots._nav_series(db_session, [s1.id, s2.id], date(2024, 3, 31))
            assert len(seen) == 3
            # the full series (through=None) answers any month; a month's series does not answer the full one
            full, _ = snapshots._nav_series(db_session, [s1.id], None)
            assert len(seen) == 4 and full[s1.id][-1][0] == date(2024, 5, 10)
            snapshots._nav_series(db_session, [s1.id], date(2024, 3, 31))
            snapshots._nav_series(db_session, [s1.id], None)
            assert len(seen) == 4
    with _nav_statements(db_session) as seen:
        snapshots._nav_series(db_session, [s1.id], date(2024, 4, 30))
        snapshots._nav_series(db_session, [s1.id], date(2024, 4, 30))
        assert len(seen) == 2  # outside a block nothing is reused


def test_second_month_detail_for_the_same_members_in_a_block_issues_no_nav_sql(db_session):
    a, b, _ = _household(db_session)

    async def run():
        with snapshots.reuse_nav_series():
            await snapshots.get_month_detail(db_session, [a.id, b.id], date(2024, 4, 30))
            with _nav_statements(db_session) as seen:
                again = await snapshots.get_month_detail(db_session, [a.id, b.id], date(2024, 3, 31))
            return seen, again

    seen, again = asyncio.run(run())
    assert again is not None
    assert seen == []


# ----------------------------------------------------------------------------------------------------------
# XIRR bisection fallback
# ----------------------------------------------------------------------------------------------------------


def _flows_with_rates(rates, start=date(2020, 1, 1)):
    """Annual cash flows at 0, 1, 2 ... years whose present value is zero at exactly these rates (and nowhere
    else): the coefficients of prod(v - 1/(1+rate)) in v = 1/(1+rate)."""
    coefficients = [Fraction(1)]
    for rate in rates:
        root = 1 / (1 + Fraction(rate))
        grown = [Fraction(0)] * (len(coefficients) + 1)
        for power, value in enumerate(coefficients):
            grown[power + 1] += value
            grown[power] -= value * root
        coefficients = grown
    scale = lcm(*(value.denominator for value in coefficients))
    return [(start + timedelta(days=365 * year), Decimal(int(value * scale))) for year, value in enumerate(coefficients)]


def _sign_changes(flows):
    signs = [amount > 0 for _, amount in flows]
    return sum(1 for left, right in zip(signs, signs[1:]) if left != right)


def _npv(flows, rate):
    start = min(day for day, _ in flows)
    with localcontext() as context:
        context.prec = 60
        return sum((amount / (1 + rate) ** (Decimal((day - start).days) / 365) for day, amount in flows), Decimal(0))


def test_bisection_with_three_roots_returns_the_one_nearest_zero_not_the_far_ones():
    """Roots at -60%, +5% and +300%. Mutations: taking the first bracket (-60%), the last (+300%) or the widest."""
    flows = _flows_with_rates([Fraction(-3, 5), Fraction(1, 20), Fraction(3)])
    assert _sign_changes(flows) == 3

    rate = xirr_bisect(flows)

    assert rate is not None
    assert abs(rate - Decimal("0.05")) < Decimal("1e-6")


@pytest.mark.parametrize(
    "rates, expected",
    [
        pytest.param([Fraction(1, 20), Fraction(1)], "0.05", id="five-percent-and-doubling"),
        pytest.param([Fraction(1, 20), Fraction(1, 2)], "0.05", id="five-and-fifty-percent"),
        pytest.param([Fraction(-1, 2), Fraction(3, 10)], "0.3", id="minus-fifty-and-plus-thirty-percent"),
    ],
)
def test_bisection_finds_a_bracket_inside_the_range_when_both_ends_have_the_same_sign(rates, expected):
    """Two roots, so the present value has the same sign at x = -20 and at x = 14 and an end-to-end bracket
    does not exist: only the coarse scan finds them. Mutation: a coarser grid step (or none) returns None."""
    flows = _flows_with_rates(rates)
    assert _sign_changes(flows) == 2
    assert (_npv(flows, Decimal("1e9")) > 0) == (_npv(flows, Decimal("-0.9999999")) > 0)  # same sign at both ends

    rate = xirr_bisect(flows)

    assert rate is not None
    assert abs(rate - Decimal(expected)) < Decimal("1e-6")
    assert abs(_npv(flows, rate)) < Decimal("1e-3") * sum(abs(amount) for _, amount in flows)


# A real input where the Newton step overflows (found by a random search): a loan-shaped flow with the
# large inflow in the middle. A root exists (about -76.15%), so the fallback must find it, not return None.
_NEWTON_OVERFLOW_FLOWS = [
    (date(2005, 10, 25), Decimal("-1000000")),
    (date(2000, 12, 31), Decimal("1000000000")),
    (date(2000, 1, 2), Decimal("1000000")),
]


def test_the_newton_overflow_input_really_overflows_newton():
    """Guards the next test against passing vacuously: if this stops raising, find another input."""
    start = min(day for day, _ in _NEWTON_OVERFLOW_FLOWS)
    years = [(Decimal((day - start).days) / Decimal(365), amount) for day, amount in _NEWTON_OVERFLOW_FLOWS]
    with localcontext() as context:
        context.prec = 18
        with pytest.raises(ArithmeticError):
            xirr_fast_module._newton_rate(years, Decimal("0.1"))


@pytest.mark.parametrize("solver", [xirr_fast, xirr], ids=["fast", "legacy"])
def test_a_newton_overflow_falls_back_to_bisection_and_still_returns_the_root(solver):
    """Mutations: dropping the `except` around Newton, or returning None from it instead of bisecting."""
    rate = solver(_NEWTON_OVERFLOW_FLOWS)

    assert rate is not None
    assert abs(rate - Decimal("-0.7615124925")) < Decimal("1e-8")
    assert abs(_npv(_NEWTON_OVERFLOW_FLOWS, rate)) < Decimal("1e-6") * Decimal("1002000000")


@pytest.mark.parametrize("raised", [Overflow, InvalidOperation])
def test_xirr_fast_falls_back_to_bisection_when_newton_raises(monkeypatch, raised):
    flows = [(date(2025, 1, 1), Decimal("-100000")), (date(2026, 1, 1), Decimal("30000"))]

    def explode(*args, **kwargs):
        raise raised()

    monkeypatch.setattr(xirr_fast_module, "_newton_rate", explode)

    rate = xirr_fast(flows)

    assert rate is not None
    assert abs(rate - Decimal("-0.7")) < Decimal("1e-7")


# ----------------------------------------------------------------------------------------------------------
# Behaviour note: flows that net out at once
# ----------------------------------------------------------------------------------------------------------


@pytest.mark.parametrize("solver", [xirr, xirr_fast], ids=["legacy", "fast"])
def test_a_same_day_pair_that_nets_to_zero_now_returns_a_rate_of_zero_not_none(solver):
    """CURRENT BEHAVIOUR, pinned on purpose (it was None before the bisection fallback): -5 and +5 on one day
    have a present value of exactly 0 at every rate, so every grid point is a root and the one nearest a rate
    of 0 is returned. It is a degenerate input rather than a real 0% return; callers that must tell the two
    apart have to look at the flows themselves."""
    day = date(2025, 6, 1)

    assert solver([(day, Decimal("-5")), (day, Decimal("5"))]) == Decimal(0)


# ----------------------------------------------------------------------------------------------------------
# CAS opening dated exactly on the window end
# ----------------------------------------------------------------------------------------------------------


def _opening(on_date, amount="400000"):
    txn = _transaction(TransactionType.OPENING_BALANCE, on_date, amount)
    txn.origin = TransactionOrigin.CAS_OPENING
    return txn


def _context(today, scheme_id=None):
    from app.services.analytics.benchmark_windows import WindowContext

    fund = {"1Y": {}, "3Y": {}, "5Y": {}, "SI": {}}
    if scheme_id is not None:
        for window in ("1Y", "3Y", "5Y"):
            fund[window] = {scheme_id: Decimal("1000")}
    return WindowContext(
        today=today,
        starts={"1Y": date(2025, 9, 30), "3Y": date(2023, 9, 30), "5Y": date(2021, 9, 30), "SI": None},
        portfolio_start_values={"1Y": Decimal("100000"), "3Y": Decimal("80000"), "5Y": Decimal("60000"), "SI": None},
        fund_start_values=fund,
    )


def _levels(*days):
    from app.services.analytics.benchmark_windows import IndexLevels

    return {index: IndexLevels(list(days), [Decimal("100")] * len(days)) for index in ALL_BENCHMARK_INDICES}


def test_a_cas_opening_dated_exactly_today_makes_every_bounded_window_unavailable():
    """Mutation: `txn.date <= today` weakened to `< today` in `_cas_opening_in_window`. The window is (start,
    today], so a statement opening dated today is inside it and would be counted as new money."""
    from app.services.analytics.benchmark_windows import OPENING_BALANCE_IN_WINDOW, compute_window_rows

    today = date(2026, 10, 24)
    transactions = [_transaction(TransactionType.PURCHASE, date(2020, 1, 1), "50000"), _opening(today)]

    rows = compute_window_rows(
        _context(today), transactions, Decimal("600000"), _levels(date(2020, 1, 1), date(2025, 9, 30), today)
    )

    for row in rows[:3]:
        assert row.available is False
        assert row.portfolio_xirr is None
        assert row.unavailable_reason == OPENING_BALANCE_IN_WINDOW
        assert all(item.xirr is None for item in row.indices)
    assert rows[3].available is True


def test_a_cas_opening_dated_the_day_after_today_is_not_inside_the_window():
    """The other side of the same boundary: a future-dated row is not in (start, today]."""
    from app.services.analytics.benchmark_windows import _cas_opening_in_window

    today = date(2026, 10, 24)
    assert _cas_opening_in_window([_opening(today)], date(2025, 9, 30), today) is True
    assert _cas_opening_in_window([_opening(today + timedelta(days=1))], date(2025, 9, 30), today) is False


def test_a_fund_window_with_a_cas_opening_dated_exactly_today_has_no_rate():
    from app.services.analytics.benchmark_windows import compute_fund_window_rows

    today = date(2026, 10, 24)
    scheme_id = uuid.uuid4()
    transactions = [_transaction(TransactionType.PURCHASE, date(2020, 1, 1), "1000"), _opening(today, "9000")]

    rows = compute_fund_window_rows(
        _context(today, scheme_id),
        scheme_id,
        transactions,
        Decimal("12000"),
        BenchmarkIndex.NIFTY_50,
        _levels(date(2020, 1, 1), date(2025, 9, 30), today),
    )

    assert [(row.window, row.fund_xirr, row.benchmark_xirr) for row in rows[:3]] == [
        ("1Y", None, None),
        ("3Y", None, None),
        ("5Y", None, None),
    ]
    assert rows[3].fund_xirr is not None
