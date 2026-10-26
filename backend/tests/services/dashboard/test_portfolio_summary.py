import random
from fractions import Fraction
import uuid
from datetime import date
from decimal import Decimal

from app.models.enums import PlanType
from app.services.dashboard.schemas import HoldingRow, RealizedSummary
from app.services.dashboard.xirr import DashboardXirrSummary, XirrDisclaimer
from app.services.home.movers import FundChange, Movers, MoversView
from app.services.dashboard.portfolio_summary import compute_portfolio_summary


def _holding(scheme_id: str, *, value: str, invested: str, nav_unavailable: bool = False) -> HoldingRow:
    return HoldingRow(
        scheme_id=scheme_id, scheme_name=f"Fund {scheme_id}", amc_name="AMC",
        household_member_id="m1", household_member_name="Investor",
        plan_type=PlanType.DIRECT, units_held="10.000", average_nav="10.0000",
        current_nav=None if nav_unavailable else "20.0000",
        current_nav_date=None if nav_unavailable else date(2026, 10, 23),
        amount_invested=invested,
        current_value=None if nav_unavailable else value,
        current_profit_total=None, realized_gain="0.00",
        unrealized_gain=None, today_gain=None, nav_unavailable=nav_unavailable,
    )


def _movers(*, net_change: str, net_pct: str | None, previous_nav_date: date | None) -> Movers:
    return Movers(
        requested_view="fund", view="fund", fell_back=False, estimated=False,
        coverage_pct=None, net_change=Decimal(net_change), previous_value=Decimal("0"),
        net_pct=None if net_pct is None else Decimal(net_pct),
        as_of_nav_date=date(2026, 10, 23), previous_nav_date=previous_nav_date,
        partial=False, stale_scheme_ids=(), missing_scheme_ids=(), funds=(),
        result=MoversView(gains=(), losses=(), others_count=0, others_change=Decimal("0.00")),
    )


def test_summary_totals_and_xirr_passthrough():
    xirr_summary = DashboardXirrSummary(
        lifetime_xirr="0.12", current_holdings_xirr="0.10",
        lifetime_xirr_disclaimer=XirrDisclaimer(alt_xirr="0.08", opening_cost_share="0.5"),
        current_holdings_xirr_disclaimer=None,
    )
    realized_summary = RealizedSummary(total="10.00", funds=[])
    holdings = [
        _holding("s1", value="100.00", invested="90.00"),
        _holding("s2", value="200.00", invested="150.00"),
        _holding("s3", value="0", invested="50.00", nav_unavailable=True),
    ]
    movers = _movers(net_change="12.00", net_pct="0.4000", previous_nav_date=date(2026, 10, 22))
    summary = compute_portfolio_summary(holdings, xirr_summary, realized_summary, movers)
    assert summary.total_value == Decimal("300.00")
    assert summary.total_invested == Decimal("240.00")
    assert summary.unrealized_gain == Decimal("60.00")
    assert summary.unrealized_pct == Decimal("25.0000")
    assert summary.realized_gain == Decimal("10.00")
    assert summary.today_gain == Decimal("12.00")
    assert summary.today_pct == Decimal("0.4000")
    assert summary.previous_nav_date == date(2026, 10, 22)
    assert summary.lifetime_xirr == "0.12"
    assert summary.current_holdings_xirr == "0.10"
    assert summary.lifetime_xirr_disclaimer.alt_xirr == "0.08"
    assert summary.current_holdings_xirr_disclaimer is None


def test_empty_household_gives_zeros_and_none_percentages():
    xirr_summary = DashboardXirrSummary(lifetime_xirr=None, current_holdings_xirr=None)
    realized_summary = RealizedSummary(total="0.00", funds=[])
    movers = _movers(net_change="0.00", net_pct=None, previous_nav_date=None)
    summary = compute_portfolio_summary([], xirr_summary, realized_summary, movers)
    assert summary.total_value == Decimal("0.00")
    assert summary.total_invested == Decimal("0.00")
    assert summary.unrealized_gain == Decimal("0.00")
    assert summary.unrealized_pct is None
    assert summary.today_gain == Decimal("0.00")
    assert summary.today_pct is None
    assert summary.previous_nav_date is None
    assert summary.lifetime_xirr is None


def _paise(text: str) -> int:
    """Whole paise of an amount, rounded half up, by integer arithmetic (no Decimal quantize involved)."""
    scaled = Fraction(Decimal(text)) * 100
    return int(scaled + Fraction(1, 2)) if scaled >= 0 else -int(-scaled + Fraction(1, 2))


def test_summary_figures_equal_an_independent_computation_over_random_inputs():
    """Totals are sums of per-row paise-rounded amounts, gain is their difference and the percentage is the exact
    ratio rounded half away from zero to 4dp -- all recomputed here from the raw row strings with integers and
    fractions, so a change in any rounding rule (including summing exact values first) fails this test."""
    xirr_summary = DashboardXirrSummary(lifetime_xirr=None, current_holdings_xirr=None)
    realized_summary = RealizedSummary(total="0.00", funds=[])
    movers = _movers(net_change="0.00", net_pct=None, previous_nav_date=None)
    rng = random.Random(54321)
    ties_seen = 0
    for _ in range(300):
        count = rng.randint(0, 5)
        holdings = [
            _holding(
                f"s{i}",
                # Thousandths, so about one amount in ten sits exactly on a half-paisa.
                value=str(Decimal(rng.randint(0, 100000)) / 1000),
                invested=str(Decimal(rng.randint(0, 100000)) / 1000),
                nav_unavailable=rng.random() < 0.2,
            )
            for i in range(count)
        ]
        summary = compute_portfolio_summary(holdings, xirr_summary, realized_summary, movers)
        valued = [row for row in holdings if not row.nav_unavailable]
        value_paise = sum(_paise(row.current_value) for row in valued)
        invested_paise = sum(_paise(row.amount_invested) for row in valued)
        ties_seen += sum(
            1 for row in valued if (Decimal(row.current_value) * 1000) % 10 == 5
        )
        assert summary.total_value == Decimal(value_paise) / 100
        assert summary.total_invested == Decimal(invested_paise) / 100
        assert summary.unrealized_gain == Decimal(value_paise - invested_paise) / 100
        if invested_paise == 0:
            assert summary.unrealized_pct is None
        else:
            ratio = Fraction(value_paise - invested_paise, invested_paise) * 100 * 10000
            rounded = int(ratio + Fraction(1, 2)) if ratio >= 0 else -int(-ratio + Fraction(1, 2))
            assert summary.unrealized_pct == Decimal(rounded) / 10000
    assert ties_seen > 20, "the random rows must include half-paisa amounts"


def test_totals_are_the_sum_of_per_row_rounded_amounts_not_a_rounded_sum():
    """Review M2(a): 1.005 + 1.005 is 2.02 (each row 1.01), not 2.01."""
    xirr_summary = DashboardXirrSummary(lifetime_xirr=None, current_holdings_xirr=None)
    holdings = [
        _holding("s1", value="1.005", invested="1.005"),
        _holding("s2", value="1.005", invested="2.005"),
    ]
    summary = compute_portfolio_summary(
        holdings, xirr_summary, RealizedSummary(total="0.00", funds=[]),
        _movers(net_change="0.00", net_pct=None, previous_nav_date=None),
    )
    assert summary.total_value == Decimal("2.02")
    assert summary.total_invested == Decimal("3.02")  # 1.01 + 2.01
    assert summary.unrealized_gain == Decimal("-1.00")
