"""Regression tests for the independent review of the Portfolio backend (H1, M1, M2, M3, L1, L5, L-extra)."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import event

from tests.api.home_fixture import FIXED_NOW, build_home_fixture

IST = timezone(timedelta(hours=5, minutes=30))
STALE_NOW = datetime(2026, 12, 7, 11, 0, tzinfo=IST)  # the newest stored price is 2026-10-23, 45 days earlier

_SUMMARY_FIELDS = (
    "nav_as_of", "partial", "missing_funds", "total_value", "total_invested", "unrealized_gain",
    "unrealized_pct", "realized_gain", "today_gain", "today_pct", "previous_nav_date",
)


def _get(runtime, path):
    response = runtime.client.get(path)
    assert response.status_code == 200, (path, response.text)
    return response.json()


@pytest.mark.parametrize("variant", ["base", "sold_fund", "cas_only", "redemption"])
@pytest.mark.parametrize("scope", ["aggregate", "dev"])
@pytest.mark.parametrize("days", [30, 7])
def test_stale_price_feed_gives_the_same_series_and_summary_as_a_fresh_one(variant, scope, days):
    """Review M1: the loaded price window must follow the newest stored price, not the calendar.

    The same household read on the last price day and 45 days later (feed dead since) must give the same chart
    and the same headline numbers; before the fix the early part of the chart was 0.00 with `partial` false and
    `today_gain` was 0.00 with `partial` false.
    """
    results = []
    for now in (FIXED_NOW, STALE_NOW):
        runtime = build_home_fixture(variant=variant, now=now)
        try:
            root = (
                "/household/aggregate" if scope == "aggregate"
                else f"/household-members/{runtime.household.dev_id}"
            )
            series = _get(runtime, f"{root}/portfolio-value-series?days={days}")
            summary = _get(runtime, f"{root}/portfolio-summary")
            results.append((series, summary))
        finally:
            runtime.close()
    (fresh_series, fresh_summary), (stale_series, stale_summary) = results
    assert fresh_series["points"], "the fixture must have a chart to compare"
    assert fresh_series["points"][0]["value"] != "0.00"
    for key in ("days", "start", "end", "empty", "partial", "missing_funds", "points", "nav_as_of"):
        assert stale_series[key] == fresh_series[key], key
    for key in _SUMMARY_FIELDS:
        assert stale_summary[key] == fresh_summary[key], key


def _build_feed_gap_household(now: datetime):
    """Sold fund `HOME-sold` is priced up to 2026-10-23, the funds still held only up to 2026-10-01.

    The newest price of any fund ever held (10-23) is then 22 days after the newest price of the funds held (10-01,
    the chart's end), and the sold fund (redeemed 28 Sep, inside the 7-day chart) is not held on 1 Oct."""
    from sqlalchemy import delete, update
    from sqlalchemy.orm import Session

    from app.models.reference import NavHistory, Scheme
    from app.models.transaction import Transaction
    from tests.api.home_fixture import uid

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


def test_held_funds_priced_earlier_than_a_sold_fund_still_chart_the_sold_fund():
    """Review M1, second pass: the window must reach back from the held funds' newest price (`nav_as_of`)."""
    results = []
    for now in (datetime(2026, 10, 1, 18, 30, tzinfo=IST), FIXED_NOW):
        runtime = _build_feed_gap_household(now)
        try:
            results.append(_get(runtime, "/household/aggregate/portfolio-value-series?days=7"))
        finally:
            runtime.close()
    reference, later = results
    assert reference["end"] == later["end"] == "2026-10-01"
    # Seven chart days (25 Sep - 1 Oct): the sold fund's 110,000.00 is in the first three of them (until its sale).
    assert Decimal(reference["points"][0]["value"]) > Decimal("110000")
    assert Decimal(reference["points"][-1]["value"]) < Decimal("10000")
    for key in ("days", "start", "end", "empty", "partial", "missing_funds", "points", "nav_as_of"):
        assert later[key] == reference[key], key


# ---------------------------------------------------------------------------------------------------------------
# M2: mutations that survived every earlier test.
# ---------------------------------------------------------------------------------------------------------------

def _mutate_db(runtime, *statements):
    """Run SQLAlchemy statements against a built fixture before any request is made."""
    from sqlalchemy.orm import Session

    with Session(runtime.engine) as db:
        for statement in statements:
            db.execute(statement)
        db.commit()


def test_summary_total_is_the_sum_of_per_row_rounded_values_not_a_rounded_sum():
    """Review M2(a): two funds worth 990.005 and 1010.005 are 990.01 and 1,010.01 on the holdings table, so the
    headline must be the sum of those rows. Summing the exact values first and rounding once gives 5,212.01."""
    from sqlalchemy import update

    from app.models.reference import NavHistory
    from tests.api.home_fixture import uid

    runtime = build_home_fixture()
    try:
        _mutate_db(
            runtime,
            update(NavHistory).where(
                NavHistory.scheme_id == uid("scheme-flexi"), NavHistory.date == date(2026, 10, 23)
            ).values(nav=Decimal("19.8001")),   # 50 units: 990.0050
            update(NavHistory).where(
                NavHistory.scheme_id == uid("scheme-gold"), NavHistory.date == date(2026, 10, 23)
            ).values(nav=Decimal("101.0005")),  # 10 units: 1,010.0050
        )
        summary = _get(runtime, "/household/aggregate/portfolio-summary")
        allocation = _get(runtime, "/household/aggregate/portfolio-allocation")
        home = _get(runtime, "/household/aggregate/home/summary")
        rows = _get(runtime, "/household/aggregate/holdings")["holdings"]
    finally:
        runtime.close()
    exact = sum((Decimal(row["current_value"]) for row in rows), Decimal("0"))
    assert exact == Decimal("5212.010"), "the fixture must hold half-paise values for this test to mean anything"
    # 1,210.00 + 990.01 + 2,002.00 + 1,010.01
    assert summary["total_value"] == "5212.02"
    assert allocation["buckets"][0]["current_value"] == "5212.02"
    assert home["total_value"] == "5212.02"


def test_series_window_ends_on_the_latest_price_day_when_the_clock_is_past_it():
    """Review M2(b): on a Monday after a Friday price the chart still ends on Friday and still spans `days`
    calendar days back from it. Ending it on `today` would shift the whole window to start on 27 Sep."""
    from tests.api.home_fixture import WEEKEND_NOW

    runtime = build_home_fixture(now=WEEKEND_NOW)
    try:
        series = _get(runtime, "/household/aggregate/portfolio-value-series?days=30")
        summary = _get(runtime, "/household/aggregate/portfolio-summary")
    finally:
        runtime.close()
    assert WEEKEND_NOW.date() == date(2026, 10, 26) and WEEKEND_NOW.weekday() == 0
    assert series["nav_as_of"] == "2026-10-23"
    assert series["end"] == "2026-10-23"
    assert series["start"] == "2026-09-24"
    assert [point["date"] for point in series["points"]] == [
        (date(2026, 9, 24) + timedelta(days=offset)).isoformat() for offset in range(30)
    ]
    assert series["points"][-1]["value"] == summary["total_value"]


def test_member_realized_gain_is_that_members_own():
    """Review M2(c): only Asha sold anything (10 units bought at 10.00 and sold at 11.50 = 15.00)."""
    runtime = build_home_fixture(variant="redemption")
    try:
        asha = _get(runtime, f"/household-members/{runtime.household.asha_id}/portfolio-summary")
        dev = _get(runtime, f"/household-members/{runtime.household.dev_id}/portfolio-summary")
        family = _get(runtime, "/household/aggregate/portfolio-summary")
    finally:
        runtime.close()
    assert asha["realized_gain"] == "15.00"
    assert dev["realized_gain"] == "0.00"
    assert family["realized_gain"] == "15.00"


def test_summary_route_carries_a_non_null_xirr_disclaimer():
    """Review M2: no route test had a disclaimer. Asha's 100-unit lot becomes an undated CAS opening balance, which
    lifts her XIRR to ~150% a year; without it the same money returns about -9% a year, so the disclaimer fires
    with that alternative and half of her cost sitting in the opening lot."""
    from sqlalchemy import update

    from app.models.enums import TransactionOrigin, TransactionType
    from app.models.transaction import Transaction
    from scripts.write_portfolio_fixtures import pinned_xirr_clock
    from tests.api.home_fixture import uid

    runtime = build_home_fixture()
    try:
        _mutate_db(runtime, update(Transaction).where(Transaction.id == uid("transaction-large")).values(
            type=TransactionType.OPENING_BALANCE, origin=TransactionOrigin.CAS_OPENING,
        ))
        with pinned_xirr_clock(FIXED_NOW.date()):
            body = _get(runtime, f"/household-members/{runtime.household.asha_id}/portfolio-summary")
            dev = _get(runtime, f"/household-members/{runtime.household.dev_id}/portfolio-summary")
    finally:
        runtime.close()
    for key in ("lifetime_xirr_disclaimer", "current_holdings_xirr_disclaimer"):
        disclaimer = body[key]
        assert disclaimer is not None, key
        assert set(disclaimer) == {"alt_xirr", "opening_cost_share"}
        assert Decimal(disclaimer["opening_cost_share"]) == Decimal("0.5")
        # 990 left after the opening lot's 1,210 is taken out, against 1,000 put in on 15 Sep: -1% in 38 days.
        assert Decimal("-0.095") < Decimal(disclaimer["alt_xirr"]) < Decimal("-0.088")
    assert Decimal("1.4") < Decimal(body["lifetime_xirr"]) < Decimal("1.6")  # 1.1 ** (365 / 38) - 1
    assert dev["lifetime_xirr_disclaimer"] is None and dev["current_holdings_xirr_disclaimer"] is None


# ---------------------------------------------------------------------------------------------------------------
# L1: no signed zero ever reaches a response.
# ---------------------------------------------------------------------------------------------------------------

def _holding(*, value: str, invested: str):
    from app.models.enums import PlanType
    from app.services.dashboard.schemas import HoldingRow

    return HoldingRow(
        scheme_id="s1", scheme_name="Fund", amc_name="AMC", household_member_id="m1",
        household_member_name="Investor", plan_type=PlanType.DIRECT, units_held="1", average_nav="1",
        current_nav="1", current_nav_date=date(2026, 10, 23), amount_invested=invested, current_value=value,
        current_profit_total=None, realized_gain="0", unrealized_gain=None, today_gain=None,
        nav_unavailable=False,
    )


def _movers(net_change: str = "0.00", net_pct: str | None = None):
    from app.services.home.movers import Movers, MoversView

    return Movers(
        requested_view="fund", view="fund", fell_back=False, estimated=False, coverage_pct=None,
        net_change=Decimal(net_change), previous_value=Decimal("0"),
        net_pct=None if net_pct is None else Decimal(net_pct), as_of_nav_date=date(2026, 10, 23),
        previous_nav_date=None, partial=False, stale_scheme_ids=(), missing_scheme_ids=(), funds=(),
        result=MoversView(gains=(), losses=(), others_count=0, others_change=Decimal("0.00")),
    )


def _summary_body(holdings, realized_total: str, movers=None) -> dict:
    """The summary exactly as the route serialises it, without a database."""
    from app.services.dashboard.portfolio_schemas import PortfolioSummaryResponse
    from app.services.dashboard.portfolio_summary import compute_portfolio_summary
    from app.services.dashboard.schemas import RealizedSummary
    from app.services.dashboard.xirr import DashboardXirrSummary

    summary = compute_portfolio_summary(
        holdings, DashboardXirrSummary(None, None), RealizedSummary(total=realized_total, funds=[]),
        movers or _movers(),
    )
    response = PortfolioSummaryResponse(
        scope="aggregate", member_id=None, nav_as_of=None, partial=False, missing_funds=[],
        computed_at=datetime(2026, 10, 23, tzinfo=timezone.utc), members=None, **summary.__dict__,
    )
    return response.model_dump(mode="json")


def test_a_tiny_loss_never_serialises_as_negative_zero_percent():
    """Review L1: 999,999.99 against 1,000,000.00 is -0.000001%, which Decimal rounds to '-0.0000'."""
    body = _summary_body([_holding(value="999999.99", invested="1000000.00")], "0.00")
    assert body["unrealized_gain"] == "-0.01"
    assert body["unrealized_pct"] == "0.0000"


def test_a_realized_total_that_rounds_to_zero_never_serialises_as_negative_zero():
    for total in ("-0.004", "-0.00", "-0.0000001"):
        body = _summary_body([], total)
        assert body["realized_gain"] == "0.00", total


def test_a_negative_zero_day_change_never_serialises_signed():
    body = _summary_body([], "0.00", _movers(net_change="-0.00", net_pct="-0.0000"))
    assert body["today_gain"] == "0.00"
    assert body["today_pct"] == "0.0000"


def test_the_response_models_never_print_a_signed_zero_whoever_built_them():
    from app.services.dashboard.portfolio_schemas import InstrumentBucketOut

    bucket = InstrumentBucketOut(
        label="Mutual Funds", status="live", current_value=Decimal("-0.00"), percentage=Decimal("0.00"),
        invested=Decimal("-0.0000"), gain_loss=Decimal("-0"), xirr=None,
    )
    dumped = bucket.model_dump(mode="json")
    assert (dumped["current_value"], dumped["invested"], dumped["gain_loss"]) == ("0.00", "0.0000", "0")
    assert Decimal(_summary_body([], "0.00")["total_value"]) == 0


# ---------------------------------------------------------------------------------------------------------------
# L5 and L-extra: no query the Portfolio routes do not need.
# ---------------------------------------------------------------------------------------------------------------

def _statements_for(runtime, path: str) -> list[str]:
    statements: list[str] = []
    listener = lambda _conn, _cursor, statement, _params, _ctx, _many: statements.append(statement)
    event.listen(runtime.engine, "before_cursor_execute", listener)
    try:
        assert runtime.client.get(path).status_code == 200
    finally:
        event.remove(runtime.engine, "before_cursor_execute", listener)
    return statements


@pytest.mark.parametrize("suffix", ["portfolio-summary", "portfolio-allocation"])
def test_summary_and_allocation_skip_the_disclosure_weights_query(suffix):
    """Review L5: Portfolio never reads the movers' sector view, so it must not pay for its weights."""
    runtime = build_home_fixture()
    try:
        statements = _statements_for(runtime, f"/household/aggregate/{suffix}")
    finally:
        runtime.close()
    assert statements
    assert not [s for s in statements if "disclosure" in s.lower() or "scheme_holdings" in s.lower()]


def test_value_series_builder_does_not_read_transactions_and_matches_the_full_wealth_series():
    """Review L-extra: the chart needs no cash flows, so building it must not load every transaction, while its
    points stay exactly those of Home's wealth series for the same custom range."""
    import asyncio
    from types import SimpleNamespace

    from sqlalchemy.orm import Session

    from app.services.dashboard.value_series import build_portfolio_value_series
    from app.services.home.context import load_home_inputs, resolve_scope
    from app.services.home.wealth import build_wealth_series

    for variant in ("base", "sold_fund", "cas_only", "redemption"):
        runtime = build_home_fixture(variant=variant)
        try:
            with Session(runtime.engine) as db:
                ctx = resolve_scope(db, SimpleNamespace(id=runtime.household.user_id), None)
                today = FIXED_NOW.date()
                inputs = asyncio.run(load_home_inputs(
                    db, ctx, today, nav_start=today - timedelta(days=45), view="fund",
                ))
                statements: list[str] = []
                listener = lambda _c, _cu, statement, _p, _x, _m: statements.append(statement)
                event.listen(runtime.engine, "before_cursor_execute", listener)
                try:
                    light = build_portfolio_value_series(db, ctx, inputs, today=today, days=30)
                finally:
                    event.remove(runtime.engine, "before_cursor_execute", listener)
                full = build_wealth_series(
                    db, ctx, inputs, today=today, period="custom",
                    custom=(light.start, light.end), benchmark=None,
                )
            assert statements == [], variant
            assert (light.start, light.end, light.empty, light.points) == (
                full.start, full.end, full.empty, full.points
            ), variant
            assert light.points, variant
        finally:
            runtime.close()


# ---------------------------------------------------------------------------------------------------------------
# M3 / L6: figures checked against an oracle that reads raw rows, on every transaction kind.
# ---------------------------------------------------------------------------------------------------------------

def test_summary_and_allocation_match_an_independent_oracle_on_every_transaction_kind():
    """A household with a switch, bonus units, an opening balance (plus stamp duty), a statement-priced fund and a
    fully sold fund: invested, realized and unrealized must equal what a self-contained FIFO replay of the raw rows
    gives (scripts/portfolio_synthetic_gate.py `oracle_totals`: plain SQL, no holdings code)."""
    from sqlalchemy.orm import Session

    from scripts.portfolio_synthetic_gate import add_rich_funds, oracle_totals
    from tests.api.home_fixture import uid

    runtime = build_home_fixture()
    try:
        with Session(runtime.engine) as db:
            add_rich_funds(db, runtime.household.asha_id, uid("import-ASHA RAO"))
            scopes = {
                "/household/aggregate": [runtime.household.asha_id, runtime.household.dev_id],
                f"/household-members/{runtime.household.asha_id}": [runtime.household.asha_id],
                f"/household-members/{runtime.household.dev_id}": [runtime.household.dev_id],
            }
            expected = {root: oracle_totals(db, ids, FIXED_NOW.date()) for root, ids in scopes.items()}
        for root in scopes:
            summary = _get(runtime, f"{root}/portfolio-summary")
            bucket = _get(runtime, f"{root}/portfolio-allocation")["buckets"][0]
            oracle = expected[root]
            assert Decimal(summary["total_invested"]) == oracle["invested"], root
            assert Decimal(summary["total_value"]) == oracle["value"], root
            assert Decimal(summary["unrealized_gain"]) == oracle["unrealized"], root
            assert Decimal(summary["realized_gain"]) == oracle["realized"], root
            assert Decimal(bucket["invested"]) == oracle["invested"], root
            assert Decimal(bucket["gain_loss"]) == oracle["unrealized"], root
    finally:
        runtime.close()
    # Hand-checked pieces of Asha's extra funds: invested 6,000.00 (600 switch-out units left at 10) + 4,399.99
    # (360 units at 12.2222) + 5,000.00 (bonus units cost nothing) + 12,200.50 (opening 10,000 + 2,200.50 with stamp
    # duty) + 3,000.00 (statement-priced, bought at cost) = 30,600.49 on top of her 2,000.00; realized 400.00 (switch
    # out, 400 x 1.00) + 600.00 (sold fund, 300 x 2.00).
    asha_oracle = expected[f"/household-members/{runtime.household.asha_id}"]
    assert asha_oracle["invested"] == Decimal("2000.00") + Decimal("30600.49")
    assert asha_oracle["realized"] == Decimal("1000.00")
