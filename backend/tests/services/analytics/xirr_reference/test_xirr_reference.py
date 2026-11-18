from datetime import date, timedelta
from decimal import Decimal, localcontext
from pathlib import Path
import subprocess
import sys

import pytest

from app.services.analytics.xirr import xirr
from services.dashboard.test_xirr import _disclaimer_scenario

from .fixtures import FIXTURES
from .independent_xirr import independent_xirr


TOLERANCE = Decimal("0.000001")
REFERENCE_TOLERANCE = Decimal("1e-29")
BY_NAME = {fixture.name: fixture for fixture in FIXTURES}
NO_SOLUTION = (
    "no_money_out",
    "no_money_in",
    "single_flow",
    "same_day_buy_and_sell",
    "same_day_net_zero",
)


# FINDING (recorded by XR-2, not fixed here): flows that net to zero on one single day have no unique XIRR (every rate gives a net
# present value of zero). The app answers 0 (shown as 0.0%); the independent solver answers "no result". Which convention is right is
# an owner decision for the fix proposals (same-day and short-period cases, FX-8e). `strict` makes this test fail loudly the day the
# app's answer changes, so the xfail cannot go stale.
NET_ZERO_FINDING = pytest.mark.xfail(
    strict=True,
    reason="same_day_net_zero: the app returns 0, the independent solver returns None (no unique XIRR); owner decision",
)


def _marked(name):
    return pytest.param(name, id=name, marks=NET_ZERO_FINDING) if name == "same_day_net_zero" else pytest.param(name, id=name)


def assert_rate(actual, expected, label, *, tolerance=TOLERANCE):
    if expected is None:
        assert actual is None, f"{label}: returned {actual}, expected no unique XIRR"
    else:
        assert isinstance(actual, Decimal), f"{label}: expected a Decimal rate, got {actual}"
        assert abs(actual - expected) <= tolerance, f"{label}: {actual} vs {expected}"


@pytest.mark.parametrize(
    "fixture",
    [pytest.param(f, id=f.name, marks=NET_ZERO_FINDING) if f.name == "same_day_net_zero" else pytest.param(f, id=f.name)
     for f in FIXTURES],
)
def test_app_solver_matches_independent_for_all_25(fixture):
    reference = independent_xirr(fixture.flows)
    if fixture.name not in NO_SOLUTION:
        assert reference is not None, fixture.name
    assert_rate(xirr(fixture.flows), reference, fixture.name)


def test_there_are_exactly_25_unique_fixtures():
    assert len(FIXTURES) == len(BY_NAME) == 25


def test_closed_form_fixtures_match_their_formula():
    closed_forms = {
        "lump_sum_365_days",
        "lump_sum_366_days_across_feb_29",
        "lump_sum_two_years",
        "lump_sum_three_years_negative",
        "three_months_up",
        "three_months_down",
        "one_month",
        "steep_fall_60_percent_one_year",
        "steep_fall_90_percent_two_years",
        "tenfold_gain_in_five_years",
        "purchase_reversed_same_day",
        "unchanged_value_over_one_year",
    }
    assert {fixture.name for fixture in FIXTURES if fixture.expected is not None} == closed_forms
    with localcontext() as context:
        context.prec = 50
        for fixture in FIXTURES:
            if fixture.expected is None:
                continue
            first_date, first_amount = fixture.flows[0]
            last_date, last_amount = fixture.flows[-1]
            days = (last_date - first_date).days
            # The reversal fixture's two middle rows cancel exactly on their shared date.
            recovered = -first_amount * (1 + fixture.expected) ** (Decimal(days) / 365)
            assert abs(recovered / last_amount - 1) <= REFERENCE_TOLERANCE, fixture.name
            assert_rate(
                independent_xirr(fixture.flows), fixture.expected, fixture.name,
                tolerance=REFERENCE_TOLERANCE,
            )


def test_excel_convention_including_leap_year():
    regular = BY_NAME["lump_sum_365_days"]
    leap = BY_NAME["lump_sum_366_days_across_feb_29"]
    assert (regular.flows[-1][0] - regular.flows[0][0]).days == 365
    assert (leap.flows[-1][0] - leap.flows[0][0]).days == 366
    with localcontext() as context:
        context.prec = 50
        leap_expected = Decimal("1.25") ** (Decimal(365) / 366) - 1
    assert regular.expected == Decimal("0.25")
    assert_rate(leap.expected, leap_expected, leap.name, tolerance=REFERENCE_TOLERANCE)
    for fixture in (regular, leap):
        assert_rate(xirr(fixture.flows), fixture.expected, fixture.name)
        assert_rate(independent_xirr(fixture.flows), fixture.expected, fixture.name,
                    tolerance=REFERENCE_TOLERANCE)

    if any(fixture.excel_value is None for fixture in FIXTURES):
        pytest.skip("excel_value not filled")
    for fixture in FIXTURES:
        assert_rate(xirr(fixture.flows), fixture.excel_value, fixture.name)
        assert_rate(independent_xirr(fixture.flows), fixture.excel_value, fixture.name)


@pytest.mark.parametrize("name", ("no_money_in", "no_money_out", "single_flow"))
def test_no_money_in_or_out_returns_none(name):
    flows = BY_NAME[name].flows
    assert_rate(independent_xirr(flows), None, name)
    assert_rate(xirr(flows), None, name)


@pytest.mark.parametrize("name", [_marked("same_day_buy_and_sell"), _marked("same_day_net_zero")])
def test_same_day_flows(name):
    flows = BY_NAME[name].flows
    assert len({day for day, _ in flows}) == 1
    assert_rate(independent_xirr(flows), None, name)
    assert_rate(xirr(flows), None, name)


@pytest.mark.parametrize("name", ("steep_fall_60_percent_one_year", "steep_fall_90_percent_two_years"))
def test_steep_fall(name):
    fixture = BY_NAME[name]
    assert fixture.expected is not None
    assert_rate(xirr(fixture.flows), fixture.expected, name)
    assert_rate(independent_xirr(fixture.flows), fixture.expected, name,
                tolerance=REFERENCE_TOLERANCE)


@pytest.mark.parametrize("name", ("one_month", "three_months_up", "three_months_down"))
def test_under_a_year_is_not_silently_extreme_flagged(name):
    # FX-8e will decide how to display these. Check the raw annualised rate.
    flows = BY_NAME[name].flows
    actual = xirr(flows)
    reference = independent_xirr(flows)
    assert_rate(actual, reference, f"{name} annualised app XIRR = {actual}")


@pytest.mark.parametrize(
    ("phone", "sip_nav", "shows_disclaimer"),
    (("+910000000001", "15", True), ("+910000000002", "10", False)),
)
def test_opening_balance_disclaimer_only_when_removing_piece_explains(
    db_session, phone, sip_nav, shows_disclaimer,
):
    today = date.today()
    sip_date = today - timedelta(days=180)
    terminal_value = Decimal("20000")
    result = _disclaimer_scenario(
        db_session, phone, today - timedelta(days=365), "1000", "10",
        [(sip_date, "200", sip_nav)], current_value=str(terminal_value),
    )
    # The dated purchase holds 200 of the 1200 units. The rest came from the statement opening lot.
    without_opening = independent_xirr([
        (sip_date, -200 * Decimal(sip_nav)),
        (today, terminal_value * 200 / 1200),
    ])
    assert without_opening is not None
    threshold = Decimal("0.35")
    assert (without_opening < threshold) == shows_disclaimer
    for rate, disclaimer in (
        (result.lifetime_xirr, result.lifetime_xirr_disclaimer),
        (result.current_holdings_xirr, result.current_holdings_xirr_disclaimer),
    ):
        assert rate is not None and Decimal(rate) > threshold
        assert (disclaimer is not None) == shows_disclaimer
        if disclaimer is not None:
            assert disclaimer.alt_xirr is not None
            assert_rate(Decimal(disclaimer.alt_xirr), without_opening, "without the opening lot")


def test_caller_audit_runs_and_lists_every_caller(capsys):
    backend = Path(__file__).resolve().parents[4]
    result = subprocess.run(
        [sys.executable, "scripts/xirr_caller_audit.py"],
        cwd=backend, capture_output=True, text=True, check=False, timeout=20,
    )
    assert result.returncode == 0, result.stderr
    table = result.stdout
    caller_names = (
        "dashboard.xirr.portfolio_xirr",
        "dashboard.xirr.calculate_dashboard_xirr",
        "analytics.benchmark.compute_portfolio_vs_benchmarks",
        "analytics.benchmark.compute_fund_vs_benchmark",
        "analytics.benchmark._benchmark_xirr_for_transactions",
        "analytics.benchmark_windows.index_window_xirr",
        "analytics.benchmark_windows.compute_window_rows",
        "analytics.benchmark_windows.compute_fund_window_rows",
        "analytics.benchmark_windows.audited_index_replay",
        "fund_page.summary.build_summary",
        "fund_page.returns._benchmark_xirr",
        "fund_page.returns.current_returns",
    )
    for caller in caller_names:
        assert caller in table
    # Keep the one-holdings audit visible in the handoff's pytest run.
    with capsys.disabled():
        print(table, end="")
