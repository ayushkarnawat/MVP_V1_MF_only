"""Regression tests for the second independent review of the Home backend (N1 to N5).

Each test reproduces a defect on the repository's fixture household (Friday 2026-10-23, 5,212.00 in total, a
12.00 day change on 5,200.00); every one failed before its fix."""
from datetime import date
from decimal import Decimal

from app.models.enums import SchemePlanType, SchemeSource, TransactionType
from app.models.reference import NavHistory
from tests.api.home_fixture import build_home_fixture, uid
from tests.api.test_home_review_fixes import (
    MONDAY,
    _add_navs,
    _add_scheme,
    _edit,
    _get,
    _transaction,
)

AGG = "/household/aggregate/home"


# --- N1: a statement-priced fund must not distort the day-change percentage -----------------------------

def _statement_priced(db, prices, extra_purchase=None):
    scheme, folio = _add_scheme(db, "casonly", amfi=None, source=SchemeSource.CAS_ONLY, plan=SchemePlanType.DIRECT)
    _transaction(db, folio, "cas-buy", TransactionType.PURCHASE, date(2026, 5, 1), "10000", "1000", "10")
    if extra_purchase is not None:
        day, units = extra_purchase
        _transaction(db, folio, "cas-topup", TransactionType.PURCHASE, day, str(Decimal(units) * 10), units, "10")
    for day, nav in prices:
        db.add(NavHistory(scheme_id=scheme.id, date=day, nav=Decimal(nav)))


def test_a_statement_priced_fund_with_one_price_is_in_the_percentage_base():
    runtime = build_home_fixture()
    try:
        _edit(runtime, lambda db: _statement_priced(db, [(date(2026, 10, 15), "10.60")]))
        movers = _get(runtime, f"{AGG}/movers?by=fund")
        # 5,200 of priced funds plus 1,000 units at 10.60: the 12.00 gain is 12 / 15,800, not 12 / 5,200
        assert Decimal(movers["previous_value"]) == Decimal("15800.00")
        assert Decimal(movers["net_pct"]) == Decimal("0.0759")
        assert Decimal(_get(runtime, f"{AGG}/summary")["change_pct"]) == Decimal("0.0759")
    finally:
        runtime.close()


def test_units_added_to_a_statement_priced_fund_after_its_previous_price_count_in_the_base():
    runtime = build_home_fixture()
    try:
        _edit(runtime, lambda db: _statement_priced(
            db, [(date(2026, 6, 30), "10.50"), (date(2026, 10, 15), "10.60")],
            extra_purchase=(date(2026, 9, 1), "9000"),
        ))
        movers = _get(runtime, f"{AGG}/movers?by=fund")
        # 10,000 units at 10.60 = 106,000; 12 / (5,200 + 106,000)
        assert Decimal(movers["previous_value"]) == Decimal("111200.00")
        assert Decimal(movers["net_pct"]) == Decimal("0.0108")
    finally:
        runtime.close()


# --- N2: a fund sold or switched out is not stale forever ------------------------------------------------

def test_a_fund_switched_out_whose_price_feed_ended_is_not_reported_stale():
    runtime = build_home_fixture()
    try:
        def switched_out(db):
            scheme, folio = _add_scheme(db, "gone")
            _transaction(db, folio, "gone-buy", TransactionType.PURCHASE, date(2026, 8, 3), "100000", "10000", "10")
            _transaction(db, folio, "gone-out", TransactionType.SWITCH_OUT, date(2026, 10, 12), "100000", "10000", "10")
            _add_navs(db, scheme, date(2026, 7, 25), date(2026, 10, 12), "10")

        _edit(runtime, switched_out)
        for path in ("summary", "movers?by=fund", "wealth-series?period=1D", "wealth-series?period=1W",
                     "wealth-series?period=1M"):
            body = _get(runtime, f"{AGG}/{path}")
            assert body["partial"] is False, path
            assert body["missing_funds"] == [], path
        # The fixture's own Dev funds have no prices before 14 Sep, so a one-year window is partial for them;
        # the switched-out fund must not be among the funds named.
        year = _get(runtime, f"{AGG}/wealth-series?period=1Y")
        assert "gone fund" not in [fund["name"] for fund in year["missing_funds"]]
        assert _get(runtime, f"{AGG}/summary")["change_amount"] == "12.00"
    finally:
        runtime.close()


def test_a_held_fund_whose_price_feed_ended_is_still_stale():
    # The fix must not hide a real gap: units still on the books and no recent price is still partial.
    runtime = build_home_fixture()
    try:
        def feed_ended(db):
            scheme, folio = _add_scheme(db, "stuck")
            _transaction(db, folio, "stuck-buy", TransactionType.PURCHASE, date(2026, 8, 3), "1000", "100", "10")
            _add_navs(db, scheme, date(2026, 7, 25), date(2026, 10, 12), "10")

        _edit(runtime, feed_ended)
        body = _get(runtime, f"{AGG}/summary")
        assert body["partial"] is True
        assert [fund["name"] for fund in body["missing_funds"]] == ["stuck fund"]
    finally:
        runtime.close()


# --- N3: the headline only replaces the last point when both use the same prices -----------------------

def test_a_weekend_price_on_one_fund_does_not_change_the_friday_point():
    runtime = build_home_fixture(now=MONDAY)
    try:
        _edit(runtime, lambda db: db.add(
            NavHistory(scheme_id=uid("scheme-gold"), date=date(2026, 10, 24), nav=Decimal("110"))
        ))
        body = _get(runtime, f"{AGG}/wealth-series?period=1W")
        assert body["end"] == "2026-10-23"
        assert body["points"][-1] == {"date": "2026-10-23", "value": "5212.00"}
        assert body["end_value"] == "5212.00"
        assert body["change_amount"] == "33.60"
    finally:
        runtime.close()


def test_the_headline_still_replaces_the_last_point_when_no_price_is_later():
    runtime = build_home_fixture()
    try:
        body = _get(runtime, f"{AGG}/wealth-series?period=1W")
        assert body["points"][-1]["value"] == "5212.00"
        assert body["end_value"] == "5212.00"
    finally:
        runtime.close()


# --- N4: a custom range that starts after the latest price date ----------------------------------------

def test_a_custom_range_after_the_latest_price_is_the_same_empty_body_with_or_without_a_benchmark():
    runtime = build_home_fixture(now=MONDAY)
    try:
        plain = _get(runtime, f"{AGG}/wealth-series?period=custom&from=2026-10-24&to=2026-10-26")
        benchmarked = _get(
            runtime, f"{AGG}/wealth-series?period=custom&from=2026-10-24&to=2026-10-26&benchmark=nifty_50"
        )
        assert plain["empty"] is True and plain["points"] == []
        assert plain["benchmark"] is None
        assert benchmarked == plain
    finally:
        runtime.close()


# --- N5: a stored non-finite number is unavailable, not a 500 --------------------------------------------

def _store(runtime, section, payload):
    def write(db):
        from app.models.analytics import AnalyticsSection

        for row in db.query(AnalyticsSection).filter(
            AnalyticsSection.scope_key == "combined", AnalyticsSection.section == section
        ):
            row.payload = payload

    _edit(runtime, write)


def test_a_non_finite_stock_exposure_makes_the_section_unavailable():
    for bad in ("NaN", "Infinity", "-Infinity"):
        runtime = build_home_fixture()
        try:
            _store(runtime, "stock_holdings", {
                "rows": [{"instrument_name": "Top Stock 1", "isin": "INE00000001", "exposure_pct": bad}],
                "holdings_as_of": "2026-09-30", "coverage": {"covered_value_pct": "100.00"},
                "hide_headlines": False,
            })
            worth = _get(runtime, f"{AGG}/worth-a-look")
            assert "stock_holdings" in worth["unavailable"], bad
        finally:
            runtime.close()


def test_a_non_finite_stored_coverage_or_score_makes_the_section_unavailable():
    runtime = build_home_fixture()
    try:
        _store(runtime, "stock_holdings", {
            "rows": [{"instrument_name": "Top Stock 1", "isin": "INE00000001", "exposure_pct": "5.00"}],
            "holdings_as_of": "2026-09-30", "coverage": {"covered_value_pct": "NaN"}, "hide_headlines": False,
        })
        _store(runtime, "score", {"funds": [
            {"scheme_id": str(uid("scheme-large")), "risk_adjusted_tier": 1, "final_score": "NaN"},
        ]})
        worth = _get(runtime, f"{AGG}/worth-a-look")
        assert "stock_holdings" in worth["unavailable"] and "score" in worth["unavailable"]
    finally:
        runtime.close()


def test_a_non_finite_cap_mix_falls_back_to_the_unavailable_recommendation():
    for bad in ("NaN", "Infinity"):
        runtime = build_home_fixture()
        try:
            _store(runtime, "cap_allocation", {"hide_headlines": False, "buckets": [
                {"key": "LARGE", "percentage_equity": bad},
                {"key": "MID", "percentage_equity": "25.00"},
                {"key": "SMALL", "percentage_equity": "15.00"},
            ]})
            body = _get(runtime, f"{AGG}/benchmarks")
            assert body["reason"] == "unavailable", bad
            assert body["recommended_index"] == "nifty_500"
        finally:
            runtime.close()
