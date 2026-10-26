"""Regression tests for the remaining Low findings of the Home backend reviews (L15, L3, N6).

Same deterministic household as the other review tests (Friday 2026-10-23, 5,212.00 in total)."""
from datetime import date
from decimal import Decimal

from app.models.enums import SchemePlanType, SchemeSource, TransactionType
from app.models.reference import NavHistory
from app.models.transaction import Transaction
from tests.api.home_fixture import FIXED_NOW, build_home_fixture, uid
from tests.api.test_home_review_fixes import (
    MONDAY,
    _add_navs,
    _add_scheme,
    _edit,
    _get,
    _transaction,
)

AGG = "/household/aggregate/home"
# 45 days after the newest stored price (Friday 2026-10-23): the feed has stopped, the clock has not.
STALE_NOW = FIXED_NOW.replace(month=12, day=7, hour=10, minute=0)
FUND_NAMES = ["Asha Flexi Cap", "Asha Large Cap", "Dev Gold Fund", "Dev Short Duration Debt"]

WEALTH_FIELDS = (
    "empty", "start", "end", "points", "start_value", "end_value", "net_contributions",
    "change_amount", "change_pct", "change_method",
)
SUMMARY_FIELDS = ("nav_as_of", "total_value", "change_amount", "change_pct")
# label -> (query at the fixture's own clock, the same question at the stale clock)
WEALTH_QUERIES = {
    "1D": ("period=1D", "period=1D"),
    "1W": ("period=1W", "period=1W"),
    "1M": ("period=1M", "period=1M"),
    "1Y": ("period=1Y", "period=1Y"),
    "custom": (
        "period=custom&from=2026-10-01&to=2026-10-23", "period=custom&from=2026-10-01&to=2026-12-07",
    ),
}


def _numbers(runtime, stale: bool) -> dict:
    out = {}
    summary = _get(runtime, f"{AGG}/summary")
    out["summary"] = {field: summary[field] for field in SUMMARY_FIELDS}
    for label, queries in WEALTH_QUERIES.items():
        body = _get(runtime, f"{AGG}/wealth-series?{queries[1 if stale else 0]}")
        out[label] = {field: body[field] for field in WEALTH_FIELDS}
    return out


# --- L15: the newest stored price is weeks older than the clock ---------------------------------------------

def test_a_price_feed_that_stopped_weeks_ago_gives_the_same_numbers_as_on_its_last_day():
    runtime = build_home_fixture()
    try:
        expected = _numbers(runtime, stale=False)
    finally:
        runtime.close()
    assert expected["1W"]["change_amount"] != "0.00"  # the reference is a real, non-flat series
    runtime = build_home_fixture(now=STALE_NOW)
    try:
        actual = _numbers(runtime, stale=True)
    finally:
        runtime.close()
    assert actual == expected


def test_a_price_feed_that_stopped_weeks_ago_is_reported_partial_on_every_route():
    runtime = build_home_fixture(now=STALE_NOW)
    try:
        paths = [
            "summary", "movers?by=fund", "movers?by=category", "wealth-series?period=1D",
            "wealth-series?period=1W", "wealth-series?period=1M", "wealth-series?period=1Y",
            "wealth-series?period=custom&from=2026-10-01&to=2026-12-07",
        ]
        for path in paths:
            body = _get(runtime, f"{AGG}/{path}")
            assert body["partial"] is True, path
            assert body["nav_as_of"] == "2026-10-23", path
            assert sorted(fund["name"] for fund in body["missing_funds"]) == FUND_NAMES, path
    finally:
        runtime.close()


def test_a_price_a_few_days_old_is_not_reported_partial():
    # The fix must not turn an ordinary long weekend into a warning.
    runtime = build_home_fixture(now=MONDAY.replace(day=28))
    try:
        for path in ("summary", "movers?by=fund", "wealth-series?period=1W"):
            body = _get(runtime, f"{AGG}/{path}")
            assert body["partial"] is False, path
            assert body["missing_funds"] == [], path
    finally:
        runtime.close()


# --- L3: the series' last point is the portfolio on the as-of date, not the current units -------------------

def _statement_only_household(db):
    db.query(Transaction).delete()
    db.query(NavHistory).delete()
    scheme, folio = _add_scheme(
        db, "stmt", amfi=None, source=SchemeSource.CAS_ONLY, plan=SchemePlanType.DIRECT
    )
    _transaction(db, folio, "stmt-buy", TransactionType.PURCHASE, date(2026, 8, 1), "1000", "100", "10")
    # units bought after the newest price: the headline counts them, the as-of day's point cannot
    _transaction(db, folio, "stmt-late", TransactionType.PURCHASE, date(2026, 10, 5), "1500", "50", "30")
    db.add(NavHistory(scheme_id=scheme.id, date=date(2026, 8, 1), nav=Decimal("10.00")))
    db.add(NavHistory(scheme_id=scheme.id, date=date(2026, 8, 31), nav=Decimal("25.00")))
    db.add(NavHistory(scheme_id=scheme.id, date=date(2026, 9, 30), nav=Decimal("27.10")))


def test_a_statement_only_household_values_the_as_of_point_with_the_units_held_that_day():
    runtime = build_home_fixture()
    try:
        _edit(runtime, _statement_only_household)
        body = _get(runtime, f"{AGG}/wealth-series?period=1M")
        assert body["end"] == "2026-09-30"
        # 100 units held on 30 Sep at 27.10; the 50 bought on 5 Oct are not in that day's value
        assert body["points"][-1] == {"date": "2026-09-30", "value": "2710.00"}
        assert body["end_value"] == "2710.00"
        assert body["partial"] is False
        # the headline legitimately counts every unit held now
        assert _get(runtime, f"{AGG}/summary")["total_value"] == "4065.00"
    finally:
        runtime.close()


def test_units_bought_after_the_latest_price_date_do_not_inflate_the_last_point():
    runtime = build_home_fixture(now=MONDAY)
    try:
        def late_purchase(db):
            scheme, folio = _add_scheme(db, "late", plan=SchemePlanType.DIRECT)
            _transaction(db, folio, "late-buy", TransactionType.PURCHASE, date(2026, 10, 24), "1000", "100", "10")
            _add_navs(db, scheme, date(2026, 9, 14), date(2026, 10, 23), "10")

        _edit(runtime, late_purchase)
        body = _get(runtime, f"{AGG}/wealth-series?period=1W")
        assert body["end"] == "2026-10-23"
        assert body["points"][-1] == {"date": "2026-10-23", "value": "5212.00"}
        assert body["end_value"] == "5212.00"
    finally:
        runtime.close()


# --- N6 (decision pending with the owner, register L13): pins today's behaviour ----------------------------

def test_current_behaviour_a_fund_redeemed_on_the_latest_price_date_still_counts_in_that_days_change():
    """Register L13 / review N6. The old held-only Dashboard `today_gain` leaves such a fund out; Home keeps it in
    the day's change (consistent with the 1D series). The owner has not decided; when that is decided, this one
    test changes (and `exclude` is the alternative: change_amount "12.00")."""
    runtime = build_home_fixture()
    try:
        def redeemed_today(db):
            scheme, folio = _add_scheme(db, "redeemed")
            _transaction(db, folio, "red-buy", TransactionType.PURCHASE, date(2026, 9, 15), "100000", "10000", "10")
            _transaction(db, folio, "red-out", TransactionType.REDEMPTION, date(2026, 10, 23), "110000", "10000", "11")
            _add_navs(db, scheme, date(2026, 9, 14), date(2026, 10, 22), "10")
            db.add(NavHistory(scheme_id=scheme.id, date=date(2026, 10, 23), nav=Decimal("11")))

        _edit(runtime, redeemed_today)
        summary = _get(runtime, f"{AGG}/summary")
        movers = _get(runtime, f"{AGG}/movers?by=fund")
        # 10,000 units x (11 - 10) = 10,000.00 on top of the household's own 12.00
        assert summary["change_amount"] == "10012.00"
        assert movers["net_change"] == "10012.00"
        assert movers["gains"][0]["label"] == "redeemed fund"
        assert movers["gains"][0]["change"] == "10000.00"
        # while the fund is not in the portfolio's value any more
        assert summary["total_value"] == "5212.00"
    finally:
        runtime.close()
