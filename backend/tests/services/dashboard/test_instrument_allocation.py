import random
from datetime import date
from decimal import Decimal

from app.models.enums import PlanType
from app.services.dashboard.schemas import HoldingRow
from app.services.dashboard.xirr import DashboardXirrSummary
from app.services.dashboard.instrument_allocation import compute_instrument_allocation


_COMING_SOON_LABELS = [
    "Direct Stocks", "US Stocks", "FDs & Bonds", "Debt", "Gold", "Real Estate", "Others",
]


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


def test_eight_buckets_in_fixed_order_with_coming_soon_fields_none():
    xirr_summary = DashboardXirrSummary(lifetime_xirr="0.12", current_holdings_xirr="0.10")
    buckets = compute_instrument_allocation([], xirr_summary)
    assert [bucket.label for bucket in buckets] == ["Mutual Funds"] + _COMING_SOON_LABELS
    assert [bucket.status for bucket in buckets] == ["live"] + ["coming_soon"] * 7
    for bucket in buckets[1:]:
        assert bucket.current_value is None
        assert bucket.percentage is None
        assert bucket.invested is None
        assert bucket.gain_loss is None
        assert bucket.xirr is None


def test_mutual_funds_bucket_totals_valued_rows_only_and_xirr_passthrough():
    xirr_summary = DashboardXirrSummary(lifetime_xirr="0.12", current_holdings_xirr="0.10")
    holdings = [
        _holding("s1", value="100.00", invested="90.00"),
        _holding("s2", value="200.00", invested="150.00"),
        _holding("s3", value="0", invested="50.00", nav_unavailable=True),
    ]
    buckets = compute_instrument_allocation(holdings, xirr_summary)
    mf = buckets[0]
    assert mf.current_value == Decimal("300.00")
    assert mf.invested == Decimal("240.00")
    assert mf.gain_loss == Decimal("60.00")
    assert mf.percentage == Decimal("100.00")
    assert mf.xirr == "0.12"


def test_empty_holdings_gives_mutual_funds_bucket_all_zero_not_none():
    xirr_summary = DashboardXirrSummary(lifetime_xirr=None, current_holdings_xirr=None)
    buckets = compute_instrument_allocation([], xirr_summary)
    mf = buckets[0]
    assert mf.current_value == Decimal("0.00")
    assert mf.invested == Decimal("0.00")
    assert mf.gain_loss == Decimal("0.00")
    assert mf.percentage == Decimal("0.00")
    assert mf.xirr is None


def test_per_row_rounding_half_up_before_summing():
    xirr_summary = DashboardXirrSummary(lifetime_xirr=None, current_holdings_xirr=None)
    holdings = [
        _holding("s1", value="1.005", invested="0"),
        _holding("s2", value="1.005", invested="0"),
    ]
    buckets = compute_instrument_allocation(holdings, xirr_summary)
    assert buckets[0].current_value == Decimal("2.02")


def test_gain_loss_equals_value_minus_invested_property_over_random_inputs():
    xirr_summary = DashboardXirrSummary(lifetime_xirr=None, current_holdings_xirr=None)
    rng = random.Random(12345)
    for _ in range(300):
        count = rng.randint(0, 5)
        holdings = [
            _holding(
                f"s{i}",
                value=str(Decimal(rng.randint(0, 100000)) / 100),
                invested=str(Decimal(rng.randint(0, 100000)) / 100),
                nav_unavailable=rng.random() < 0.2,
            )
            for i in range(count)
        ]
        mf = compute_instrument_allocation(holdings, xirr_summary)[0]
        assert mf.gain_loss == mf.current_value - mf.invested
