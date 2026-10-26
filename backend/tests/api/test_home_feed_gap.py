"""Regression tests for the re-review of the price-feed window (HB8 follow-up).

`load_home_inputs` shifts the price window back by the gap between the clock and the newest stored price of the
daily-priced funds the scope currently holds. The Portfolio API relies on that one shift, so each rule of it is
pinned here: which funds decide the gap, the 400-day cap, the 10/11-day stale boundary, and the fallbacks."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.models.enums import TransactionType
from app.models.reference import NavHistory
from app.models.transaction import Transaction
from app.services.home import context
from tests.api.home_fixture import FIXED_NOW, WEEKEND_NOW, build_home_fixture, uid
from tests.api.test_home_review_fixes import _edit, _get
from tests.api.test_home_review_fixes_round3 import AGG, WEALTH_FIELDS, _statement_only_household

IST = timezone(timedelta(hours=5, minutes=30))
LAST_PRICE_DAY = date(2026, 10, 23)  # the newest stored price of the fixture household (a Friday)
DEFAULT_WINDOW_DAYS = 15  # `_inputs` reads this far back from the clock when the route passes no start


def _at(day: date) -> datetime:
    return datetime(day.year, day.month, day.day, 18, 30, tzinfo=IST)


@pytest.fixture
def nav_starts(monkeypatch):
    """Every `start` the price loader is asked for: the window as `load_home_inputs` finally decided it."""
    seen: list[date] = []
    real = context.load_navs_by_scheme

    def spy(db, scheme_ids, start, end):
        seen.append(start)
        return real(db, scheme_ids, start, end)

    monkeypatch.setattr(context, "load_navs_by_scheme", spy)
    return seen


def _expected_start(clock: date, gap_days: int) -> date:
    return clock - timedelta(days=DEFAULT_WINDOW_DAYS + gap_days)


# ---------------------------------------------------------------------------------------------------------------
# 1. The funds the scope holds decide the gap, not a sold fund whose feed goes on.
# ---------------------------------------------------------------------------------------------------------------

def _build_feed_gap_household(now: datetime):
    """Sold fund `HOME-sold` is priced up to 2026-10-23, the funds still held only up to 2026-10-01.

    The newest price of any fund ever held (10-23) is 22 days after the newest price of the funds held (10-01).
    The sold fund (redeemed 28 Sep, inside the 7-day chart) is not held on 1 Oct."""
    from sqlalchemy import delete, update
    from sqlalchemy.orm import Session

    from app.models.reference import Scheme

    runtime = build_home_fixture(variant="sold_fund", now=now)
    with Session(runtime.engine) as db:
        sold_id = uid("scheme-sold")
        db.execute(delete(NavHistory).where(
            NavHistory.scheme_id != sold_id, NavHistory.date > date(2026, 10, 1)
        ))
        db.execute(update(Transaction).where(Transaction.id == uid("t-sold-red")).values(date=date(2026, 9, 28)))
        db.commit()
        assert db.query(Scheme).count() == 5
    return runtime


@pytest.mark.parametrize("period", ["1W", "1M"])
def test_held_funds_priced_earlier_than_a_sold_fund_still_chart_the_sold_fund(period):
    """The window reaches back from the held funds' newest price (1 Oct), though the sold fund is priced to 23 Oct."""
    readings = []
    for now in (_at(date(2026, 10, 1)), WEEKEND_NOW):
        runtime = _build_feed_gap_household(now)
        try:
            readings.append(_get(runtime, f"{AGG}/wealth-series?period={period}"))
        finally:
            runtime.close()
    reference, later = readings
    assert reference["end"] == later["end"] == "2026-10-01"
    # the sold fund's 110,000.00 is in the chart until its sale on 28 Sep
    # (on 1 Sep, the 1M chart's first day, the funds still held have no stored price yet, so it is that alone)
    assert Decimal(reference["points"][0]["value"]) >= Decimal("110000")
    assert Decimal(reference["points"][-1]["value"]) < Decimal("10000")
    for key in WEALTH_FIELDS:
        assert later[key] == reference[key], key
    # the held funds' feed has been dead for 25 days at the later clock: stale, named, partial (HB8 rule)
    assert later["partial"] is True and later["missing_funds"]


def test_a_sold_funds_newer_feed_does_not_decide_the_window_start(nav_starts):
    runtime = _build_feed_gap_household(WEEKEND_NOW)
    try:
        _get(runtime, f"{AGG}/summary")
    finally:
        runtime.close()
    # held funds end on 1 Oct: 25 days before Monday 26 Oct, not the 3 days to the sold fund's 23 Oct
    assert nav_starts[0] == _expected_start(WEEKEND_NOW.date(), 25)


# ---------------------------------------------------------------------------------------------------------------
# `_feed_gap_days` on its own: the three-tier choice of funds, the cap, future prices.
# ---------------------------------------------------------------------------------------------------------------

TODAY = date(2026, 10, 26)


def _prices(**days: date) -> dict[str, tuple[date, Decimal]]:
    return {name: (day, Decimal("10")) for name, day in days.items()}


def test_gap_is_measured_on_the_held_daily_funds():
    prices = _prices(held=date(2026, 10, 1), sold=date(2026, 10, 23))
    assert context._feed_gap_days(prices, set(), {"held"}, TODAY) == 25


def test_gap_falls_back_to_every_ever_held_daily_fund_when_none_held_has_a_daily_feed():
    # the only held fund is statement-priced; the sold daily fund's feed is all there is to go on
    prices = _prices(stmt=date(2026, 10, 25), sold=date(2026, 10, 20))
    assert context._feed_gap_days(prices, {"stmt"}, {"stmt"}, TODAY) == 6


def test_gap_falls_back_to_all_funds_when_the_scope_has_no_daily_fund_at_all():
    prices = _prices(stmt=date(2026, 9, 30), other=date(2026, 8, 31))
    assert context._feed_gap_days(prices, {"stmt", "other"}, {"stmt"}, TODAY) == 26


def test_gap_of_a_scope_without_any_price_is_zero():
    assert context._feed_gap_days({}, set(), set(), TODAY) == 0


def test_gap_is_never_negative():
    assert context._feed_gap_days(_prices(held=date(2026, 10, 30)), set(), {"held"}, TODAY) == 0


@pytest.mark.parametrize("dead_days, expected", [(399, 399), (400, 400), (401, 400), (730, 400)])
def test_gap_is_capped_at_400_days(dead_days, expected):
    prices = _prices(held=TODAY - timedelta(days=dead_days))
    assert context._feed_gap_days(prices, set(), {"held"}, TODAY) == expected


def test_a_feed_dead_for_two_years_reads_back_400_days_and_does_not_fail(nav_starts):
    clock = LAST_PRICE_DAY + timedelta(days=730)
    runtime = build_home_fixture(now=_at(clock))
    try:
        summary = _get(runtime, f"{AGG}/summary")
        series = _get(runtime, f"{AGG}/wealth-series?period=1M")
    finally:
        runtime.close()
    assert nav_starts[0] == _expected_start(clock, 400)
    assert summary["nav_as_of"] == LAST_PRICE_DAY.isoformat()
    assert summary["partial"] is True and series["partial"] is True
    assert summary["total_value"] == "5212.00"


# ---------------------------------------------------------------------------------------------------------------
# The stale boundary: 10 days is a long weekend, 11 days is a feed that stopped.
# ---------------------------------------------------------------------------------------------------------------

BOUNDARY_PATHS = ("summary", "movers?by=fund", "wealth-series?period=1D")


@pytest.mark.parametrize("days_old, stale", [(10, False), (11, True)])
def test_stale_feed_boundary_is_more_than_ten_days(days_old, stale):
    runtime = build_home_fixture(now=_at(LAST_PRICE_DAY + timedelta(days=days_old)))
    try:
        for path in BOUNDARY_PATHS:
            body = _get(runtime, f"{AGG}/{path}")
            assert body["partial"] is stale, (days_old, path)
            assert bool(body["missing_funds"]) is stale, (days_old, path)
    finally:
        runtime.close()


# ---------------------------------------------------------------------------------------------------------------
# Which prices decide the gap.
# ---------------------------------------------------------------------------------------------------------------

def test_a_statement_price_newer_than_the_daily_feed_does_not_decide_the_gap(nav_starts):
    clock = LAST_PRICE_DAY + timedelta(days=10)  # Monday 2 Nov

    def newer_statement_price(db):
        from sqlalchemy import select

        from app.models.reference import Scheme

        scheme_id = db.execute(select(Scheme.id).where(Scheme.id == uid("scheme-casonly"))).scalar_one()
        db.add(NavHistory(scheme_id=scheme_id, date=date(2026, 10, 30), nav=Decimal("10.70")))

    runtime = build_home_fixture(variant="cas_only", now=_at(clock))
    try:
        _edit(runtime, newer_statement_price)
        body = _get(runtime, f"{AGG}/summary")
    finally:
        runtime.close()
    # measured on the daily funds (23 Oct, 10 days back), not on the statement price of 30 Oct (3 days back)
    assert nav_starts[0] == _expected_start(clock, 10)
    assert body["nav_as_of"] == LAST_PRICE_DAY.isoformat()


def test_a_future_dated_price_is_ignored_by_the_gap(nav_starts):
    clock = LAST_PRICE_DAY + timedelta(days=10)

    def future_price(db):
        db.add(NavHistory(scheme_id=uid("scheme-large"), date=clock + timedelta(days=3), nav=Decimal("13")))

    runtime = build_home_fixture(now=_at(clock))
    try:
        _edit(runtime, future_price)
        _get(runtime, f"{AGG}/summary")
    finally:
        runtime.close()
    assert nav_starts[0] == _expected_start(clock, 10)


def test_a_statement_only_household_measures_the_gap_on_its_statement_prices(nav_starts):
    runtime = build_home_fixture()
    try:
        _edit(runtime, _statement_only_household)  # last statement price 30 Sep, 23 days before the clock
        body = _get(runtime, f"{AGG}/summary")
    finally:
        runtime.close()
    assert nav_starts[0] == _expected_start(FIXED_NOW.date(), 23)
    assert body["partial"] is False


def test_a_cas_only_fund_that_is_not_held_counts_as_statement_priced_not_daily(nav_starts):
    clock = LAST_PRICE_DAY + timedelta(days=10)

    def sell_the_statement_fund(db):
        # priced on 1 Nov, after the daily feed ends: must not look like a daily feed that is still alive
        db.add(Transaction(
            id=uid("t-cas-sell"), folio_id=uid("folio-casonly"), import_id=uid("import-ASHA RAO"),
            type=TransactionType.REDEMPTION, date=date(2026, 10, 16), amount=Decimal("10600"),
            units=Decimal("1000"), nav=Decimal("10.60"),
        ))
        db.add(NavHistory(scheme_id=uid("scheme-casonly"), date=date(2026, 11, 1), nav=Decimal("10.70")))

    runtime = build_home_fixture(variant="cas_only", now=_at(clock))
    try:
        _edit(runtime, sell_the_statement_fund)
        _get(runtime, f"{AGG}/summary")
    finally:
        runtime.close()
    assert nav_starts[0] == _expected_start(clock, 10)


# ---------------------------------------------------------------------------------------------------------------
# `load_prior_prices`: the newest price on or before the asked day, however old, never one after it, one query.
# ---------------------------------------------------------------------------------------------------------------

def test_prior_prices_find_old_and_recent_prices_and_ignore_later_ones():
    from sqlalchemy import event
    from sqlalchemy.orm import Session

    from app.services.home.series import load_prior_prices

    runtime = build_home_fixture(variant="cas_only")
    try:
        ancient = uid("scheme-large")
        with Session(runtime.engine) as db:
            # `scheme-large` has prices from 14 Sep to 23 Oct 2026; ask for a day far after the newest one
            asked = LAST_PRICE_DAY + timedelta(days=900)
            result = load_prior_prices(db, {ancient, uid("scheme-casonly"), uuid_unknown()}, asked)
            assert result[ancient][0] == LAST_PRICE_DAY  # 900 days before the asked day, still found
            assert result[uid("scheme-casonly")][0] == date(2026, 10, 15)
            assert uuid_unknown() not in result  # no price at all
            # a price after the asked day is never returned
            result = load_prior_prices(db, {ancient}, date(2026, 10, 1))
            assert result[ancient][0] == date(2026, 10, 1)
            statements = []
            listener = lambda _conn, _cursor, statement, _params, _ctx, _many: statements.append(statement)
            event.listen(runtime.engine, "before_cursor_execute", listener)
            try:
                load_prior_prices(db, {ancient}, LAST_PRICE_DAY)
            finally:
                event.remove(runtime.engine, "before_cursor_execute", listener)
            assert len(statements) == 1
    finally:
        runtime.close()


def uuid_unknown():
    return uid("scheme-without-any-price")
