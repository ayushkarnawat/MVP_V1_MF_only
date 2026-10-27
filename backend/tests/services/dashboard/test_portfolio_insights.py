from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.services.dashboard.portfolio_insights_schemas import (
    FundSpreadOut,
    InsightsOut,
    LargestAmcOut,
    LargestHoldingOut,
    PlanSplitEntryOut,
    PlanSplitOut,
    PortfolioInsightsResponse,
    SipInsightOut,
)


def _envelope():
    return {
        "scope": "aggregate", "member_id": None, "nav_as_of": date(2026, 10, 23),
        "partial": False, "missing_funds": [],
        "computed_at": datetime(2026, 10, 23, 13, tzinfo=timezone.utc),
    }


def _entry(value="0.00", pct="0.0000"):
    return PlanSplitEntryOut(value=Decimal(value), pct=Decimal(pct))


def _response(**overrides):
    insights = InsightsOut(
        largest_holding=LargestHoldingOut(
            scheme_id="s1", fund_name="Fund", amc_name="AMC",
            value=Decimal("600000.00"), pct_of_portfolio=Decimal("60.0000"),
        ),
        spread=FundSpreadOut(fund_count=3, amc_count=2),
        plan_split=PlanSplitOut(
            direct=_entry("700000.00", "70.0000"), regular=_entry("300000.00", "30.0000"),
            unclassified=_entry(),
        ),
        largest_amc=LargestAmcOut(
            amc_name="AMC", value=Decimal("700000.00"), pct_of_portfolio=Decimal("70.0000"),
            fund_count=2,
        ),
        sips=SipInsightOut(active_count=3, monthly_total=Decimal("17000.00")),
    )
    fields = dict(
        **_envelope(), members=None, total_value=Decimal("1000000.00"), empty=False,
        empty_reason=None, insights=insights,
    )
    fields.update(overrides)
    return PortfolioInsightsResponse(**fields)


def test_response_contract_and_decimals_serialise_as_strings():
    response = _response()
    assert list(response.model_fields) == [
        "scope", "member_id", "nav_as_of", "partial", "missing_funds", "computed_at",
        "members", "total_value", "empty", "empty_reason", "insights",
    ]
    dumped = response.model_dump(mode="json")
    assert dumped["total_value"] == "1000000.00"
    assert dumped["insights"]["largest_holding"]["pct_of_portfolio"] == "60.0000"
    assert dumped["insights"]["plan_split"]["unclassified"] == {"value": "0.00", "pct": "0.0000"}
    assert dumped["insights"]["sips"] == {"active_count": 3, "monthly_total": "17000.00"}
    assert dumped["insights"]["spread"] == {"fund_count": 3, "amc_count": 2}


def test_no_signed_zero_reaches_json():
    dumped = _response(total_value=Decimal("-0.00")).model_dump(mode="json")
    assert dumped["total_value"] == "0.00"


def test_extra_fields_are_forbidden_everywhere():
    with pytest.raises(ValidationError, match="extra_forbidden"):
        FundSpreadOut(fund_count=1, amc_count=1, unexpected=True)
    with pytest.raises(ValidationError, match="extra_forbidden"):
        _response(unexpected=True)


def test_empty_reason_is_restricted():
    with pytest.raises(ValidationError):
        _response(empty_reason="other")


# ---- compute_portfolio_insights (pure) -------------------------------------------------------------------------
import random
from decimal import ROUND_HALF_UP

from app.models.enums import PlanType
from app.services.dashboard.portfolio_insights import compute_portfolio_insights
from app.services.dashboard.schemas import HoldingRow, SipRow


def _h(scheme_id, value, *, amc="AMC A", plan=PlanType.DIRECT, units="10.000", member="m1",
       nav_unavailable=False, stale=False, statement=False, name=None):
    return HoldingRow(
        scheme_id=scheme_id, scheme_name=name or f"Fund {scheme_id}", amc_name=amc,
        household_member_id=member, household_member_name=member, plan_type=plan,
        units_held=units, average_nav="10.0000",
        current_nav=None if nav_unavailable else "20.0000",
        current_nav_date=None if nav_unavailable else date(2026, 10, 23),
        amount_invested="1.00", current_value=None if nav_unavailable else value,
        current_profit_total=None, realized_gain="0.00", unrealized_gain=None, today_gain=None,
        nav_unavailable=nav_unavailable, stale_nav=stale, price_from_statement=statement,
    )


def _sip(scheme_id="s1", amount="5000.00", count=1):
    return SipRow(
        scheme_id=scheme_id, scheme_name="F", household_member_id="m1", household_member_name="m1",
        sip_date=date(2026, 10, 5), sip_amount=amount, next_due_date=date(2026, 11, 5),
        series_count=count,
    )


def test_three_funds_hand_computed():
    # 600000 + 300000 + 100000 = 1,000,000.00. Largest = f1 = 60.0000%.
    # AMC A holds f1 + f3 = 700000 (70.0000%, 2 funds); AMC B holds f2 = 300000.
    # Plan: direct f1 + f3 = 700000 (70.0000); regular f2 = 300000 (30.0000).
    result = compute_portfolio_insights(
        [
            _h("f1", "600000.00", amc="AMC A"),
            _h("f2", "300000.00", amc="AMC B", plan=PlanType.REGULAR),
            _h("f3", "100000.00", amc="AMC A"),
        ],
        [],
    )
    assert result.total_value == Decimal("1000000.00")
    assert not result.empty and result.empty_reason is None
    ins = result.insights
    assert (ins.largest_holding.scheme_id, ins.largest_holding.value,
            ins.largest_holding.pct_of_portfolio) == ("f1", Decimal("600000.00"), Decimal("60.0000"))
    assert (ins.spread.fund_count, ins.spread.amc_count) == (3, 2)
    assert ins.plan_split.direct.value == Decimal("700000.00")
    assert ins.plan_split.direct.pct == Decimal("70.0000")
    assert ins.plan_split.regular.value == Decimal("300000.00")
    assert ins.plan_split.regular.pct == Decimal("30.0000")
    assert ins.plan_split.unclassified.value == Decimal("0.00")
    assert (ins.largest_amc.amc_name, ins.largest_amc.value, ins.largest_amc.pct_of_portfolio,
            ins.largest_amc.fund_count) == ("AMC A", Decimal("700000.00"), Decimal("70.0000"), 2)
    assert (ins.sips.active_count, ins.sips.monthly_total) == (0, Decimal("0.00"))


def test_same_scheme_held_by_two_members_is_one_fund_and_summed():
    # f1: 400 (m1) + 300 (m2) = 700 -> one fund; f2 = 300. Largest f1 = 70.0000%.
    result = compute_portfolio_insights(
        [_h("f1", "400.00", member="m1"), _h("f1", "300.00", member="m2"), _h("f2", "300.00")], [],
    )
    assert result.insights.spread.fund_count == 2
    assert result.insights.largest_holding.value == Decimal("700.00")
    assert result.insights.largest_holding.pct_of_portfolio == Decimal("70.0000")


def test_two_amcs_equal_in_value_break_by_name_ascending():
    rows = [_h("f1", "500.00", amc="Zeta AMC"), _h("f2", "500.00", amc="Alpha AMC")]
    for ordering in (rows, rows[::-1]):
        assert compute_portfolio_insights(ordering, []).insights.largest_amc.amc_name == "Alpha AMC"


def test_two_funds_equal_in_value_break_by_name_then_scheme_id():
    rows = [_h("b", "500.00", name="Same"), _h("a", "500.00", name="Same"),
            _h("c", "500.00", name="Aardvark")]
    for ordering in (rows, rows[::-1]):
        assert compute_portfolio_insights(ordering, []).insights.largest_holding.scheme_id == "c"
    rows = rows[:2]
    for ordering in (rows, rows[::-1]):
        assert compute_portfolio_insights(ordering, []).insights.largest_holding.scheme_id == "a"


def test_blank_amc_name_becomes_unknown_amc():
    result = compute_portfolio_insights(
        [_h("f1", "900.00", amc="   "), _h("f2", "100.00", amc="")], [],
    )
    # Both blanks are the one "Unknown AMC": 1000.00, 2 funds, 1 AMC.
    assert result.insights.largest_amc.amc_name == "Unknown AMC"
    assert result.insights.largest_amc.fund_count == 2
    assert result.insights.spread.amc_count == 1


def test_unclassified_plan_is_its_own_entry():
    result = compute_portfolio_insights(
        [_h("f1", "250.00", plan=PlanType.UNCLASSIFIED), _h("f2", "750.00")], [],
    )
    split = result.insights.plan_split
    assert (split.unclassified.value, split.unclassified.pct) == (Decimal("250.00"), Decimal("25.0000"))
    assert (split.direct.value, split.regular.value) == (Decimal("750.00"), Decimal("0.00"))


def test_no_nav_and_zero_unit_rows_are_excluded_stale_and_statement_priced_counted():
    result = compute_portfolio_insights(
        [
            _h("f1", "100.00"),
            _h("nonav", "0", nav_unavailable=True, amc="Ghost AMC"),
            _h("zero", "50.00", units="0.000", amc="Zero AMC"),
            _h("stale", "100.00", stale=True),
            _h("stmt", "100.00", statement=True),
        ],
        [],
    )
    assert result.total_value == Decimal("300.00")
    assert result.insights.spread.fund_count == 3
    assert result.insights.spread.amc_count == 1


def test_per_row_rounding_matches_the_c88_total():
    # 1.005 rounds half-up to 1.01 per row, so 1.01 + 1.01 = 2.02 (a rounded sum would give 2.01).
    result = compute_portfolio_insights([_h("f1", "1.005"), _h("f2", "1.005")], [])
    assert result.total_value == Decimal("2.02")
    assert result.insights.largest_holding.value == Decimal("1.01")
    assert result.insights.largest_holding.pct_of_portfolio == Decimal("50.0000")


def test_parallel_sips_count_each_twin_and_multiply_the_amount():
    # series_count 2 of 5000.00 = 2 SIPs, 10000.00 a month; plus one 2500.50 -> 3 SIPs, 12500.50.
    result = compute_portfolio_insights(
        [_h("f1", "100.00")], [_sip(count=2), _sip("s2", "2500.50", 1)],
    )
    assert result.insights.sips.active_count == 3
    assert result.insights.sips.monthly_total == Decimal("12500.50")


def test_empty_list_is_no_holdings_but_sips_still_reported():
    result = compute_portfolio_insights([], [])
    assert result.empty and result.empty_reason == "no_holdings"
    assert result.total_value == Decimal("0.00")
    ins = result.insights
    assert ins.largest_holding is None and ins.plan_split is None and ins.largest_amc is None
    assert (ins.spread.fund_count, ins.spread.amc_count) == (0, 0)
    assert (ins.sips.active_count, ins.sips.monthly_total) == (0, Decimal("0.00"))


def test_all_rows_unpriced_is_no_prices():
    result = compute_portfolio_insights(
        [_h("f1", "0", nav_unavailable=True), _h("f2", "0", nav_unavailable=True)], [],
    )
    assert result.empty and result.empty_reason == "no_prices"
    assert result.insights.largest_holding is None


def test_zero_unit_rows_only_is_no_holdings():
    result = compute_portfolio_insights([_h("f1", "0.00", units="0.000")], [])
    assert result.empty_reason == "no_holdings"


@pytest.mark.parametrize("seed", range(5))
def test_properties_over_random_inputs(seed):
    rng = random.Random(seed)
    for _ in range(100):
        rows = [
            _h(
                f"s{rng.randint(0, 6)}", f"{rng.randint(1, 5_000_000) / 100:.3f}",
                amc=rng.choice(["A", "B", "", "C"]),
                plan=rng.choice([PlanType.DIRECT, PlanType.REGULAR, PlanType.UNCLASSIFIED]),
                units=rng.choice(["10.000", "0.000"]),
                nav_unavailable=rng.random() < 0.15,
                member=rng.choice(["m1", "m2"]),
            )
            for _ in range(rng.randint(0, 12))
        ]
        result = compute_portfolio_insights(rows, [])
        ins = result.insights
        if result.empty:
            continue
        split = ins.plan_split
        assert (split.direct.value + split.regular.value + split.unclassified.value
                == result.total_value)
        pcts = [split.direct.pct, split.regular.pct, split.unclassified.pct,
                ins.largest_holding.pct_of_portfolio, ins.largest_amc.pct_of_portfolio]
        assert all(Decimal("0") <= pct <= Decimal("100") for pct in pcts)
        per_scheme = {}
        for row in rows:
            if not row.nav_unavailable and Decimal(row.units_held) > 0:
                per_scheme[row.scheme_id] = per_scheme.get(row.scheme_id, Decimal("0")) + (
                    Decimal(row.current_value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
        assert ins.largest_holding.value == max(per_scheme.values())
        assert ins.spread.fund_count == len(per_scheme)
