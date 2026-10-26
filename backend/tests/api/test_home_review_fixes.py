"""Regression tests for the independent review of the Home backend (HB6, register C101 to C103).

Every test here reproduces a defect the review found on the repository's own fixture household, so each
failed before the fix. The household is the deterministic one from home_fixture (Friday 2026-10-23)."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import event

from app.api.home import get_now_ist
from app.db.session import get_db
from app.models.enums import PlanType, SchemePlanType, SchemeSource, TransactionType
from app.models.folio import Folio
from app.models.reference import NavHistory, Scheme
from app.models.transaction import Transaction
from app.services.dashboard import nav as nav_module
from app.services.dashboard.holdings import _holdings_cache
from tests.api.home_fixture import FIXED_NOW, build_home_fixture, uid

MONDAY = FIXED_NOW.replace(day=26, hour=10, minute=0)


def _edit(runtime, work):
    generator = runtime.client.app.dependency_overrides[get_db]()
    db = next(generator)
    try:
        work(db)
        db.commit()
    finally:
        generator.close()
    _holdings_cache.clear()


def _get(runtime, path):
    response = runtime.client.get(path)
    assert response.status_code == 200, (path, response.status_code, response.text[:300])
    return response.json()


def _add_scheme(db, key, *, amfi="auto", source=None, plan=SchemePlanType.REGULAR):
    amfi = f"HOME-{key}" if amfi == "auto" else amfi
    scheme = Scheme(
        id=uid(f"scheme-{key}"), amfi_code=amfi, name=f"{key} fund", amc_name="Home Test AMC",
        sebi_category="Equity Scheme - Large Cap Fund", plan_type=plan,
        **({"source": source} if source is not None else {}),
    )
    db.add(scheme)
    db.flush()
    folio = Folio(
        id=uid(f"folio-{key}"), household_member_id=uid("asha"), scheme_id=scheme.id,
        folio_number=key.upper(), plan_type=PlanType.DIRECT,
    )
    db.add(folio)
    db.flush()
    return scheme, folio


def _add_navs(db, scheme, start, end, nav):
    day = start
    while day <= end:
        if day.weekday() < 5:
            db.add(NavHistory(scheme_id=scheme.id, date=day, nav=Decimal(nav)))
        day += timedelta(days=1)


def _transaction(db, folio, key, kind, day, amount, units, nav):
    db.add(Transaction(
        id=uid(f"t-{key}"), folio_id=folio.id, import_id=uid("import-ASHA RAO"), type=kind,
        date=day, amount=Decimal(amount), units=Decimal(units), nav=Decimal(nav),
    ))


# --- F1: a fund sold or switched out inside the period -------------------------------------------------

def test_a_fund_fully_redeemed_inside_the_period_adds_no_gain():
    runtime = build_home_fixture()
    try:
        base = _get(runtime, "/household/aggregate/home/wealth-series?period=1M")
        assert base["change_amount"] == "116.40"

        def sell(db):
            scheme, folio = _add_scheme(db, "sold")
            _transaction(db, folio, "sold-buy", TransactionType.PURCHASE, date(2026, 8, 1), "100000", "10000", "10")
            _transaction(db, folio, "sold-red", TransactionType.REDEMPTION, date(2026, 10, 10), "110000", "10000", "11")
            _add_navs(db, scheme, date(2026, 7, 25), date(2026, 10, 23), "11")

        _edit(runtime, sell)
        body = _get(runtime, "/household/aggregate/home/wealth-series?period=1M")
        # value of the sold fund at the start (10,000 units at 11) leaves through the redemption: no gain
        assert body["start_value"] == "115095.60"
        assert body["net_contributions"] == "-110000.00"
        assert body["change_amount"] == "116.40"
        assert body["partial"] is False
        assert body["change_pct"] is not None
    finally:
        runtime.close()


def test_a_full_switch_between_two_funds_inside_the_period_is_not_a_gain():
    runtime = build_home_fixture()
    try:
        def switch(db):
            old, old_folio = _add_scheme(db, "switch-old")
            new, new_folio = _add_scheme(db, "switch-new", plan=SchemePlanType.DIRECT)
            _transaction(db, old_folio, "sw-buy", TransactionType.PURCHASE, date(2026, 8, 1), "50000", "5000", "10")
            _transaction(db, old_folio, "sw-out", TransactionType.SWITCH_OUT, date(2026, 10, 5), "50000", "5000", "10")
            _transaction(db, new_folio, "sw-in", TransactionType.SWITCH_IN, date(2026, 10, 5), "50000", "5000", "10")
            _add_navs(db, old, date(2026, 7, 25), date(2026, 10, 23), "10")
            _add_navs(db, new, date(2026, 7, 25), date(2026, 10, 23), "10")

        _edit(runtime, switch)
        body = _get(runtime, "/household/aggregate/home/wealth-series?period=1M")
        assert body["change_amount"] == "116.40"
    finally:
        runtime.close()


# --- F2 and F8: custom ranges --------------------------------------------------------------------------

def test_a_past_custom_range_ends_with_that_days_value_not_todays():
    runtime = build_home_fixture()
    try:
        month = _get(runtime, "/household/aggregate/home/wealth-series?period=1M")
        expected = {point["date"]: point["value"] for point in month["points"]}["2026-10-01"]
        body = _get(
            runtime, "/household/aggregate/home/wealth-series?period=custom&from=2026-09-20&to=2026-10-01"
        )
        assert body["end"] == "2026-10-01"
        assert body["points"][-1]["value"] == expected
        assert body["end_value"] == expected
        assert body["end_value"] != "5212.00"
    finally:
        runtime.close()


def test_a_range_ending_today_is_not_flagged_as_clamped_when_prices_are_a_day_old():
    runtime = build_home_fixture(now=MONDAY)
    try:
        body = _get(
            runtime, "/household/aggregate/home/wealth-series?period=custom&from=2026-10-01&to=2026-10-26"
        )
        assert body["clamped"] is False
        assert body["end"] == "2026-10-23"
        future = _get(
            runtime, "/household/aggregate/home/wealth-series?period=custom&from=2026-10-01&to=2026-12-31"
        )
        assert future["clamped"] is True
        assert future["end"] == "2026-10-23"
    finally:
        runtime.close()


def test_an_extreme_custom_start_is_clamped_before_any_data_is_read():
    runtime = build_home_fixture()
    try:
        old = _get(
            runtime, "/household/aggregate/home/wealth-series?period=custom&from=1900-01-01&to=2026-10-01"
        )
        assert old["clamped"] is True
        assert old["start"] == "2016-10-23"
        assert len(old["points"]) < 4000
        response = runtime.client.get(
            "/household/aggregate/home/wealth-series?period=custom&from=0001-01-05&to=2026-10-01"
        )
        assert response.status_code in (200, 422)
        if response.status_code == 200:
            assert response.json()["clamped"] is True
    finally:
        runtime.close()


def test_an_extreme_custom_start_never_reaches_the_price_read(monkeypatch):
    from app.services.home import context as context_module

    seen = []
    original = context_module.load_navs_by_scheme

    def recording(db, scheme_ids, start, end):
        seen.append(start)
        return original(db, scheme_ids, start, end)

    monkeypatch.setattr(context_module, "load_navs_by_scheme", recording)
    runtime = build_home_fixture()
    try:
        _get(runtime, "/household/aggregate/home/wealth-series?period=custom&from=1900-01-01&to=2026-10-01")
        assert seen and min(seen) >= date(2016, 10, 1)  # the ten-year floor (2016-10-23) less a short look-back
    finally:
        runtime.close()


# --- F3: an opening balance inside the period -----------------------------------------------------------

def test_an_opening_balance_inside_the_period_is_a_contribution_at_market_value_not_cost():
    runtime = build_home_fixture()
    try:
        def opening(db):
            scheme, folio = _add_scheme(db, "opening", amfi="HOME-opening", plan=SchemePlanType.DIRECT)
            # units bought years ago at a cost of 1,000; the statement starts on 1 Oct when they are worth 2,000
            _transaction(db, folio, "ob", TransactionType.OPENING_BALANCE, date(2026, 10, 1), "1000", "100", "10")
            _add_navs(db, scheme, date(2026, 9, 1), date(2026, 10, 23), "20")

        _edit(runtime, opening)
        body = _get(runtime, "/household/aggregate/home/wealth-series?period=1M")
        assert body["net_contributions"] == "2000.00"
        assert body["change_amount"] == "116.40"
        assert body["partial"] is False
    finally:
        runtime.close()


# --- F4: a fund priced only from statements ------------------------------------------------------------

@pytest.fixture()
def cas_only_runtime():
    runtime = build_home_fixture()

    def cas_only(db):
        scheme, folio = _add_scheme(db, "casonly", amfi=None, source=SchemeSource.CAS_ONLY, plan=SchemePlanType.DIRECT)
        _transaction(db, folio, "cas-buy", TransactionType.PURCHASE, date(2026, 5, 1), "10000", "1000", "10")
        db.add(NavHistory(scheme_id=scheme.id, date=date(2026, 6, 30), nav=Decimal("10.50")))
        db.add(NavHistory(scheme_id=scheme.id, date=date(2026, 10, 15), nav=Decimal("10.60")))

    _edit(runtime, cas_only)
    yield runtime
    runtime.close()


def test_a_statement_priced_fund_keeps_its_stored_price_history_in_the_series(cas_only_runtime):
    body = _get(cas_only_runtime, "/household/aggregate/home/wealth-series?period=1M")
    # start: 1,000 units at the 30 Jun statement price (10.50); end: at the 15 Oct price (10.60); no flow
    assert body["start_value"] == "15595.60"
    assert body["end_value"] == "15812.00"
    assert body["change_amount"] == "216.40"
    assert body["partial"] is False


def test_a_statement_priced_fund_is_not_reported_as_missing_or_stale(cas_only_runtime):
    for path in ("summary", "movers?by=fund", "wealth-series?period=1W", "wealth-series?period=1M"):
        body = _get(cas_only_runtime, f"/household/aggregate/home/{path}")
        assert body["partial"] is False, path
        assert body["missing_funds"] == [], path
    summary = _get(cas_only_runtime, "/household/aggregate/home/summary")
    assert summary["total_value"] == "15812.00"
    assert summary["change_amount"] == "12.00"


# --- F5: weekend month-end prices published by a single fund house ----------------------------------------

REAL_LATEST_NAV = {"large": "12.10", "flexi": "19.80", "debt": "10.01", "gold": "101.00"}


def _weekend_price(runtime, funds):
    def add(db):
        for key in funds:
            db.add(NavHistory(scheme_id=uid(f"scheme-{key}"), date=date(2026, 10, 24), nav=Decimal(REAL_LATEST_NAV[key])))
        db.flush()

    _edit(runtime, add)


def test_one_fund_house_publishing_a_weekend_price_does_not_knock_the_others_out():
    runtime = build_home_fixture(now=MONDAY)
    try:
        _weekend_price(runtime, ["gold"])  # 1,010 of 5,212 (19 percent of the value)
        summary = _get(runtime, "/household/aggregate/home/summary")
        assert summary["nav_as_of"] == "2026-10-23"
        assert summary["change_amount"] == "12.00"
        assert summary["partial"] is False
        movers = _get(runtime, "/household/aggregate/home/movers?by=fund")
        assert movers["net_change"] == "12.00"
        assert movers["missing_funds"] == []
    finally:
        runtime.close()


def test_when_most_of_the_value_has_a_weekend_price_that_date_is_used_and_the_rest_is_stale():
    runtime = build_home_fixture(now=MONDAY)
    try:
        _weekend_price(runtime, ["large", "flexi", "debt"])  # 4,202 of 5,212 (81 percent)
        summary = _get(runtime, "/household/aggregate/home/summary")
        assert summary["nav_as_of"] == "2026-10-24"
        assert summary["partial"] is True
        assert [fund["name"] for fund in summary["missing_funds"]] == ["Dev Gold Fund"]
    finally:
        runtime.close()


# --- F6: a Home GET never downloads or writes a price ----------------------------------------------------

def test_a_fund_with_a_feed_code_and_no_stored_price_is_missing_not_downloaded(monkeypatch):
    runtime = build_home_fixture()
    calls = []

    async def fetch(code):
        calls.append(code)
        return [(date(2026, 10, 22), Decimal("10")), (date(2026, 10, 23), Decimal("10.5"))]

    monkeypatch.setattr(nav_module, "_fetch_nav_history", fetch)
    try:
        def add(db):
            _, folio = _add_scheme(db, "nonav", amfi="999999", plan=SchemePlanType.DIRECT)
            _transaction(db, folio, "nonav-buy", TransactionType.PURCHASE, date(2026, 10, 1), "1000", "100", "10")

        _edit(runtime, add)
        writes = []

        def listener(_conn, _cursor, statement, _params, _context, _many):
            if statement.lstrip().split()[0].upper() not in ("SELECT", "PRAGMA"):
                writes.append(statement.strip()[:60])

        event.listen(runtime.engine, "before_cursor_execute", listener)
        try:
            summary = _get(runtime, "/household/aggregate/home/summary")
        finally:
            event.remove(runtime.engine, "before_cursor_execute", listener)
        assert calls == []
        assert writes == []
        assert summary["partial"] is True
        assert [fund["name"] for fund in summary["missing_funds"]] == ["nonav fund"]
    finally:
        runtime.close()


# --- F10: a malformed stored section is unavailable, not a 500 ---------------------------------------------

def test_malformed_stored_sections_are_reported_unavailable():
    runtime = build_home_fixture()
    try:
        def corrupt(db):
            from app.models.analytics import AnalyticsSection

            for section in db.query(AnalyticsSection).filter(AnalyticsSection.scope_key == "combined"):
                if section.section == "score":
                    section.payload = {"score": {"funds": [{"scheme_id": str(uid("scheme-large")), "final_score": "abc", "risk_adjusted_tier": 1}]}}
                if section.section == "stock_holdings":
                    section.payload = {"stock_holdings": {"rows": [{"isin": "X"}], "coverage": {}}}
                if section.section == "cap_allocation":
                    section.payload = {"cap_allocation": {"buckets": [{"key": "LARGE", "percentage_equity": "bad"}]}}

        _edit(runtime, corrupt)
        worth = _get(runtime, "/household/aggregate/home/worth-a-look")
        assert "score" in worth["unavailable"] and "stock_holdings" in worth["unavailable"]
        benchmarks = _get(runtime, "/household/aggregate/home/benchmarks")
        assert benchmarks["reason"] == "unavailable"
    finally:
        runtime.close()


# --- F12: the recompute guard looks at every analytics compute_* function ------------------------------------

def test_no_home_route_calls_any_analytics_compute_function(monkeypatch):
    import importlib
    import pkgutil

    import app.services.analytics as analytics

    def boom(*_args, **_kwargs):
        raise AssertionError("a Home route called an analytics compute function")

    patched = 0
    for info in pkgutil.walk_packages(analytics.__path__, "app.services.analytics."):
        try:
            module = importlib.import_module(info.name)
        except ImportError:
            continue
        for name in dir(module):
            if name.startswith("compute_") and callable(getattr(module, name)):
                monkeypatch.setattr(module, name, boom)
                patched += 1
    assert patched > 5
    runtime = build_home_fixture()
    try:
        for suffix in ("summary", "wealth-series?period=1M", "allocation", "movers", "worth-a-look", "benchmarks"):
            _get(runtime, f"/household/aggregate/home/{suffix}")
            _get(runtime, f"/household-members/{runtime.household.dev_id}/home/{suffix}")
    finally:
        runtime.close()
