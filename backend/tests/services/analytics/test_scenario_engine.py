# backend/tests/services/analytics/test_scenario_engine.py
import uuid
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.reference import (
    Scenario,
    ScenarioCategoryAverage,
    ScenarioHypotheticalAssumption,
    ScenarioSchemeResult,
    Scheme,
    NavHistory,
)


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def test_scenario_tables_round_trip():
    db = _session()
    scheme = Scheme(id=uuid.uuid4(), amfi_code="S1", name="Test Fund", amc_name="Test AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    scenario = Scenario(id=uuid.uuid4(), name="COVID crash", description="d", start_date=date(2020, 1, 20), end_date=date(2020, 3, 31), scenario_type="CRASH", display_rank=1)
    db.add_all([scheme, scenario])
    db.commit()

    db.add(ScenarioSchemeResult(scenario_id=scenario.id, scheme_id=scheme.id, pct_change=Decimal("-38.00"), is_proxied=False))
    db.add(ScenarioCategoryAverage(scenario_id=scenario.id, sebi_category=scheme.sebi_category, avg_pct_change=Decimal("-35.00"), scheme_count=42))
    db.commit()

    result = db.query(ScenarioSchemeResult).filter_by(scenario_id=scenario.id, scheme_id=scheme.id).one()
    assert result.pct_change == Decimal("-38.00")


def test_scenario_phase_row_references_parent():
    db = _session()
    group = Scenario(id=uuid.uuid4(), name="US-Iran war (2026)", description="d", start_date=date(2026, 2, 28), end_date=None, scenario_type="CRASH", is_ongoing=True, display_rank=7)
    db.add(group)
    db.commit()
    phase = Scenario(id=uuid.uuid4(), parent_scenario_id=group.id, name="US-Iran war -- Shock", description="d", start_date=date(2026, 2, 28), end_date=date(2026, 4, 2), scenario_type="CRASH", phase_label="Shock", phase_order=1)
    db.add(phase)
    db.commit()
    assert db.query(Scenario).filter_by(parent_scenario_id=group.id).one().phase_label == "Shock"


def test_hypothetical_assumption_requires_valid_asset_class():
    db = _session()
    scenario = Scenario(id=uuid.uuid4(), name="AI/tech valuation bust", description="d", scenario_type="HYPOTHETICAL", display_rank=8)
    db.add(scenario)
    db.commit()
    db.add(ScenarioHypotheticalAssumption(scenario_id=scenario.id, asset_class="Equity", assumed_pct_change=Decimal("-22.00"), assumption_note="note"))
    db.commit()
    assert db.query(ScenarioHypotheticalAssumption).filter_by(scenario_id=scenario.id).one().assumed_pct_change == Decimal("-22.00")

# append to backend/tests/services/analytics/test_scenario_engine.py
from datetime import date
from unittest.mock import AsyncMock, patch

import pytest

from app.services.analytics.scenario_engine import compute_scenario_results


def _add_navs(db, scheme, rows):
    db.add_all([NavHistory(scheme_id=scheme.id, date=day, nav=Decimal(value)) for day, value in rows])
    db.commit()


@pytest.mark.parametrize("start_offset,end_offset,expected", [
    (1, 0, "-20.00"), (7, 7, "-20.00"), (8, 0, None), (1, 8, None), (0, 0, None),
])
def test_ruling2_nav_boundaries_use_real_rows(start_offset, end_offset, expected):
    db = _session()
    scheme = Scheme(name="Boundary Growth", amc_name="AMC", sebi_category="Equity")
    scenario = Scenario(name="Crash", description="d", start_date=date(2020, 1, 10), end_date=date(2020, 3, 31))
    db.add_all([scheme, scenario])
    db.commit()
    _add_navs(db, scheme, [(scenario.start_date - timedelta(days=start_offset), "100"), (scenario.end_date - timedelta(days=end_offset), "80")])
    compute_scenario_results(db, scenario)
    result = db.query(ScenarioSchemeResult).filter_by(scenario_id=scenario.id, scheme_id=scheme.id).one()
    assert result.pct_change == (Decimal(expected) if expected else None)
    assert result.is_proxied is (expected is None)


def test_ruling2_one_day_nav_move_uses_the_previous_close():
    db = _session()
    scheme = Scheme(name="Election Growth", amc_name="AMC", sebi_category="Equity")
    scenario = Scenario(name="Election", description="d", start_date=date(2024, 6, 4), end_date=date(2024, 6, 4))
    db.add_all([scheme, scenario])
    db.commit()
    _add_navs(db, scheme, [(date(2024, 6, 3), "100"), (date(2024, 6, 4), "94")])
    compute_scenario_results(db, scenario)
    assert db.query(ScenarioSchemeResult).one().pct_change == Decimal("-6.00")


def test_ruling2_nav_on_start_day_does_not_replace_the_previous_close():
    db = _session()
    scheme = Scheme(name="Growth", amc_name="AMC", sebi_category="Equity")
    scenario = Scenario(name="Crash", description="d", start_date=date(2020, 1, 10), end_date=date(2020, 3, 31))
    db.add_all([scheme, scenario])
    db.commit()
    _add_navs(db, scheme, [(date(2020, 1, 9), "100"), (date(2020, 1, 10), "90"), (date(2020, 3, 31), "80")])
    compute_scenario_results(db, scenario)
    assert db.query(ScenarioSchemeResult).one().pct_change == Decimal("-20.00")


@pytest.mark.parametrize("start_offset,end_offset,expected", [
    (1, 0, "-20.00"), (7, 7, "-20.00"), (8, 0, None), (1, 8, None), (0, 0, None),
])
def test_ruling2_tri_boundaries_and_quick_market_use_real_rows(start_offset, end_offset, expected):
    from app.services.analytics.scenario_engine import _scenario_benchmark_comparisons
    db = _session()
    scenario = Scenario(name="Crash", description="d", start_date=date(2020, 1, 10), end_date=date(2020, 3, 31))
    db.add(scenario)
    db.add_all([
        BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=scenario.start_date - timedelta(days=start_offset), return_type=BenchmarkReturnType.TRI, value=Decimal("100")),
        BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=scenario.end_date - timedelta(days=end_offset), return_type=BenchmarkReturnType.TRI, value=Decimal("80")),
    ])
    db.commit()
    comparisons = _scenario_benchmark_comparisons(db, scenario)
    assert [(row.name, row.pct) for row in comparisons] == ([("nifty_50", expected)] if expected else [])
    compute_scenario_results(db, scenario)
    assert scenario.quick_market_pct == (Decimal(expected) if expected else None)


def test_ruling2_one_day_tri_move_uses_previous_close():
    from app.services.analytics.scenario_engine import _scenario_benchmark_comparisons
    db = _session()
    scenario = Scenario(name="Election", description="d", start_date=date(2024, 6, 4), end_date=date(2024, 6, 4))
    db.add(scenario)
    db.add_all([
        BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date(2024, 6, 3), return_type=BenchmarkReturnType.TRI, value=Decimal("100")),
        BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date(2024, 6, 4), return_type=BenchmarkReturnType.TRI, value=Decimal("94")),
    ])
    db.commit()
    assert _scenario_benchmark_comparisons(db, scenario)[0].pct == "-6.00"


def test_ruling3_group_headline_fields_and_members_all_use_group_results():
    db = _session()
    group = Scenario(name="Group", description="d", start_date=date(2026, 2, 28), is_ongoing=True)
    db.add(group); db.commit()
    phase = Scenario(name="Phase", description="d", start_date=date(2026, 7, 8), parent_scenario_id=group.id, phase_order=1, phase_label="Current", is_ongoing=True)
    covered = Scheme(name="Covered", amc_name="AMC", sebi_category="Equity")
    group_missing = Scheme(name="Group missing", amc_name="AMC", sebi_category="Gold")
    phase_missing = Scheme(name="Phase missing", amc_name="AMC", sebi_category="Debt")
    db.add_all([phase, covered, group_missing, phase_missing]); db.commit()
    db.add_all([
        ScenarioSchemeResult(scenario_id=group.id, scheme_id=covered.id, pct_change=Decimal("-12")),
        ScenarioSchemeResult(scenario_id=group.id, scheme_id=group_missing.id, pct_change=None, is_proxied=True),
        ScenarioSchemeResult(scenario_id=group.id, scheme_id=phase_missing.id, pct_change=Decimal("2")),
        ScenarioSchemeResult(scenario_id=phase.id, scheme_id=covered.id, pct_change=Decimal("-3")),
        ScenarioSchemeResult(scenario_id=phase.id, scheme_id=group_missing.id, pct_change=Decimal("5")),
        ScenarioSchemeResult(scenario_id=phase.id, scheme_id=phase_missing.id, pct_change=None, is_proxied=True),
    ]); db.commit()
    member = _household_member(db)
    empty_member = _household_member(db, "Empty")
    with patch("app.services.analytics.scenario_engine.compute_holdings", new=_holdings((covered, member, "1000"), (group_missing, member, "500"), (phase_missing, member, "200"))):
        result = _finish_immediate(_async_get_scenario_result_for_household(db, group, [member.id, empty_member.id]))
    assert result.portfolio_impact_pct == "-9.67"
    assert result.rupee_impact == "-116.00"
    assert result.covered_value == "1200.00"
    assert result.total_value == "1700.00"
    assert result.no_data_funds == 1
    by_member = {row.household_member_id: row for row in result.by_member}
    assert by_member[str(member.id)].rupee_impact == "-116.00"
    assert by_member[str(member.id)].pct == "-9.67"
    assert {f.scheme_id: f.rupee_impact for f in by_member[str(member.id)].funds} == {str(covered.id): "-120.00", str(group_missing.id): None, str(phase_missing.id): "4.00"}
    assert by_member[str(empty_member.id)].rupee_impact == "0.00"
    assert by_member[str(empty_member.id)].pct is None
    assert {f.scheme_id: f.pct for f in result.by_fund} == {str(covered.id): "-3.00", str(group_missing.id): "5.00", str(phase_missing.id): None}


def test_compute_scenario_results_real_data_scheme_gets_is_proxied_false():
    db = _session()
    scheme = Scheme(name="Old Fund - Growth", amc_name="AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    scenario = Scenario(name="Crash", description="d", start_date=date(2020, 1, 1), end_date=date(2020, 3, 31))
    db.add_all([scheme, scenario]); db.commit()
    _add_navs(db, scheme, [(date(2019, 12, 31), "100"), (date(2020, 3, 31), "62")])
    compute_scenario_results(db, scenario)
    result = db.query(ScenarioSchemeResult).one()
    assert result.is_proxied is False
    assert result.pct_change == Decimal("-38.00")


def test_compute_scenario_results_uses_a_real_nav_from_before_start():
    db = _session()
    scheme = Scheme(name="Old Fund - Growth", amc_name="AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    scenario = Scenario(name="Crash", description="d", start_date=date(2020, 1, 1), end_date=date(2020, 3, 31))
    db.add_all([scheme, scenario]); db.commit()
    _add_navs(db, scheme, [(date(2019, 12, 31), "100"), (date(2020, 1, 1), "90"), (date(2020, 3, 31), "62")])
    compute_scenario_results(db, scenario)
    assert db.query(ScenarioSchemeResult).one().pct_change == Decimal("-38.00")


def test_compute_scenario_results_falls_back_to_category_average():
    db = _session()
    category = "Equity Scheme - Flexi Cap Fund"
    missing = Scheme(name="New Fund - Growth", amc_name="AMC", sebi_category=category)
    scenario = Scenario(name="Crash", description="d", start_date=date(2020, 1, 1), end_date=date(2020, 3, 31))
    db.add_all([missing, scenario]); db.commit()
    for n in range(3):
        donor = Scheme(name=f"Old Fund {n} - Growth", amc_name="AMC", sebi_category=category)
        db.add(donor); db.commit()
        _add_navs(db, donor, [(date(2019, 12, 31), "100"), (date(2020, 3, 31), "80")])
    compute_scenario_results(db, scenario)
    result = db.query(ScenarioSchemeResult).filter_by(scheme_id=missing.id).one()
    assert result.is_proxied is True
    assert result.proxy_basis == f"sebi_category_average:{category}|Equity"
    assert result.pct_change == Decimal("-20.00")


def test_compute_scenario_results_falls_back_to_asset_class_when_category_has_no_real_data():
    db = _session()
    donor = Scheme(name="Old Large Cap Fund - Growth", amc_name="AMC", sebi_category="Equity Scheme - Large Cap Fund")
    missing = Scheme(name="New Small Cap Fund - Growth", amc_name="AMC", sebi_category="Equity Scheme - Small Cap Fund")
    scenario = Scenario(name="Crash", description="d", start_date=date(2000, 3, 1), end_date=date(2002, 10, 31))
    db.add_all([donor, missing, scenario]); db.commit()
    _add_navs(db, donor, [(date(2000, 2, 29), "100"), (date(2002, 10, 31), "90")])
    compute_scenario_results(db, scenario)
    result = db.query(ScenarioSchemeResult).filter_by(scheme_id=missing.id).one()
    assert result.is_proxied is True
    assert result.proxy_basis == "asset_class_average:Equity"
    assert result.pct_change == Decimal("-10.00")


def test_compute_scenario_results_honest_no_data_when_nothing_to_proxy_from():
    db = _session()
    scheme = Scheme(name="New Gold ETF", amc_name="AMC", sebi_category="Other Scheme - Gold ETF")
    scenario = Scenario(name="Crash", description="d", start_date=date(2000, 3, 1), end_date=date(2002, 10, 31))
    db.add_all([scheme, scenario]); db.commit()
    compute_scenario_results(db, scenario)
    result = db.query(ScenarioSchemeResult).one()
    assert result.pct_change is None
    assert result.is_proxied is True
    assert result.proxy_basis == "no_comparable_data"

# append to backend/tests/services/analytics/test_scenario_engine.py
import asyncio
from types import SimpleNamespace
from app.services.analytics.scenario_engine import (
    _async_get_scenario_result_for_household,
    get_scenario_result_for_household,
    get_scenario_summary,
)
from app.models.user import HouseholdMember


def _holding_row(mid, sid, name, value):
    from app.services.dashboard.schemas import HoldingRow
    return HoldingRow(household_member_id=str(mid), household_member_name="Member", scheme_id=str(sid), scheme_name=name,
                      amc_name="AMC", plan_type="direct", units_held="100", average_nav="10", current_nav="10",
                      current_nav_date=date(2026, 10, 10), amount_invested="1000", current_value=value,
                      current_profit_total="0", realized_gain="0", unrealized_gain="0", today_gain="0")


def _household_member(db, name="Test Member"):
    m = HouseholdMember(id=uuid.uuid4(), user_id=uuid.uuid4(), name=name, relationship="self", created_at=datetime.now(timezone.utc))
    db.add(m)
    db.commit()
    return m


def test_get_scenario_summary_has_phases_true_for_group_row():
    db = _session()
    group = Scenario(id=uuid.uuid4(), name="US-Iran war (2026)", description="d", start_date=date(2026, 2, 28), end_date=None, scenario_type="CRASH", is_ongoing=True)
    db.add(group)
    db.commit()
    phase = Scenario(id=uuid.uuid4(), parent_scenario_id=group.id, name="Shock", description="d", start_date=date(2026, 2, 28), end_date=date(2026, 4, 2), scenario_type="CRASH", phase_label="Shock", phase_order=1)
    db.add(phase)
    db.commit()

    summary = get_scenario_summary(db, group)
    assert summary.has_phases is True


def _holdings(*rows):
    """compute_holdings stand-in (card 5): `by fund` is built from the household's
    holdings, so a test must give the member holdings in the schemes under test."""
    from types import SimpleNamespace
    return AsyncMock(return_value=[
        _holding_row(member.id, scheme.id, scheme.name, value)
        for scheme, member, value in rows
    ])


def test_multi_phase_by_fund_uses_current_phase_only():
    db = _session()
    scheme = Scheme(id=uuid.uuid4(), amfi_code="M1", name="Fund", amc_name="AMC", sebi_category="Equity")
    db.add(scheme)
    db.commit()
    group = Scenario(id=uuid.uuid4(), name="US-Iran war (2026)", description="d", start_date=date(2026, 2, 28), end_date=None, scenario_type="CRASH", is_ongoing=True)
    db.add(group)
    db.commit()
    phase1 = Scenario(id=uuid.uuid4(), parent_scenario_id=group.id, name="Shock", description="d", start_date=date(2026, 2, 28), end_date=date(2026, 4, 2), scenario_type="CRASH", phase_label="Shock", phase_order=1)
    phase2 = Scenario(id=uuid.uuid4(), parent_scenario_id=group.id, name="Relapse", description="d", start_date=date(2026, 7, 8), end_date=None, scenario_type="CRASH", is_ongoing=True, phase_label="Relapse", phase_order=2)
    db.add_all([phase1, phase2])
    db.commit()
    db.add(ScenarioSchemeResult(scenario_id=phase1.id, scheme_id=scheme.id, pct_change=Decimal("-10.00"), is_proxied=False))
    db.add(ScenarioSchemeResult(scenario_id=phase2.id, scheme_id=scheme.id, pct_change=Decimal("-3.00"), is_proxied=False))
    db.commit()

    db.add(ScenarioSchemeResult(scenario_id=group.id, scheme_id=scheme.id, pct_change=Decimal("-12.00"), is_proxied=False))
    db.commit()

    member = _household_member(db)
    with patch("app.services.analytics.scenario_engine.compute_holdings", new=_holdings((scheme, member, "1000.00"))):
        result = get_scenario_result_for_household(db, group, [member.id])
    current_phase_fund = next(f for f in result.by_fund if f.scheme_id == str(scheme.id))
    assert current_phase_fund.pct == "-3.00"  # the latest (current/ongoing) phase, not phase1+phase2
    assert result.portfolio_impact_pct == "-12.00"  # the hero is the group's whole window (fix 6)


def test_franklin_frozen_scheme_shows_frozen_not_pct_alongside_other_debt_funds():
    db = _session()
    # The real AMFI base name carries a suffix; the held row is a Direct Growth plan (card 7).
    frozen = Scheme(
        id=uuid.uuid4(), amfi_code="F1", amc_name="Franklin Templeton Mutual Fund", sebi_category="Debt Scheme - Low Duration Fund",
        base_name="Franklin India Low Duration Fund (No. of Segregated Portfolios-2)",
        name="Franklin India Low Duration Fund (No. of Segregated Portfolios-2) - Direct Plan - Growth",
    )
    other_debt = Scheme(id=uuid.uuid4(), amfi_code="D1", name="Some Other Debt Fund", amc_name="Other AMC", sebi_category="Debt Scheme - Low Duration Fund")
    live_franklin = Scheme(id=uuid.uuid4(), amfi_code="F2", name="Franklin India Short Term Fund - Direct Plan - Growth",
                           base_name="Franklin India Short Term Fund", amc_name="Franklin Templeton Mutual Fund", sebi_category="Debt Scheme - Short Duration Fund")
    db.add_all([frozen, other_debt, live_franklin])
    db.commit()
    scenario = Scenario(
        id=uuid.uuid4(), name="Franklin Templeton wind-up (2020)", description="d",
        start_date=date(2020, 4, 1), end_date=date(2020, 6, 30), scenario_type="CRASH",
        had_redemption_freeze_schemes=["Franklin India Low Duration Fund"],
    )
    db.add(scenario)
    db.commit()
    db.add(ScenarioSchemeResult(scenario_id=scenario.id, scheme_id=frozen.id, pct_change=Decimal("-5.00"), is_proxied=False))
    db.add(ScenarioSchemeResult(scenario_id=scenario.id, scheme_id=other_debt.id, pct_change=Decimal("-4.00"), is_proxied=False))
    db.add(ScenarioSchemeResult(scenario_id=scenario.id, scheme_id=live_franklin.id, pct_change=Decimal("1.00"), is_proxied=False))
    db.commit()

    member = _household_member(db)
    with patch("app.services.analytics.scenario_engine.compute_holdings",
               new=_holdings((frozen, member, "5000.00"), (other_debt, member, "1000.00"), (live_franklin, member, "1000.00"))):
        result = get_scenario_result_for_household(db, scenario, [member.id])
    frozen_row = next(f for f in result.by_fund if f.scheme_id == str(frozen.id))
    other_row = next(f for f in result.by_fund if f.scheme_id == str(other_debt.id))
    assert frozen_row.is_frozen is True
    assert frozen_row.pct is None  # never a misleading % for a frozen scheme
    assert other_row.is_frozen is False
    assert other_row.pct == "-4.00"
    assert next(f for f in result.by_fund if f.scheme_id == str(live_franklin.id)).is_frozen is False
    # The frozen â‚¹5,000 is left out: (-40 + 10) / 2,000 = -1.50%
    assert result.portfolio_impact_pct == "-1.50"


@pytest.mark.parametrize("names", [
    "Franklin India Short-Term Income Plan (no. of segregated portfolios- 3)",
    "Franklin India Ultra Short Bond Fund (no. of segregated portfolio-1)",
    "Franklin India Dynamic Accrual Fund (No. of segregated portfolios- 3)",
    "Franklin India Income Opportunities Fund (no. of segregated portfolios- 2)",
    "Franklin India Credit Risk Fund (No. of segregated portfolios-3)",
    "Franklin India Low Duration Fund (No. of Segregated Portfolios-2)",
])
def test_every_real_franklin_base_name_matches_its_seeded_name(names):
    from app.services.analytics.scenario_engine import _freeze_key
    seeded = {_freeze_key(n) for n in [
        "Franklin India Low Duration Fund", "Franklin India Ultra Short Bond Fund",
        "Franklin India Short Term Income Plan", "Franklin India Credit Risk Fund",
        "Franklin India Dynamic Accrual Fund", "Franklin India Income Opportunities Fund",
    ]}
    assert _freeze_key(names) in seeded


def test_household_pct_is_weighted_by_its_own_holdings():
    """Fix 6: two households see different headline %s for the same scenario."""
    db = _session()
    equity = Scheme(id=uuid.uuid4(), amfi_code="E1", name="Equity Fund", amc_name="A", sebi_category="Equity Scheme - Flexi Cap Fund")
    liquid = Scheme(id=uuid.uuid4(), amfi_code="L1", name="Liquid Fund", amc_name="B", sebi_category="Debt Scheme - Liquid Fund")
    nodata = Scheme(id=uuid.uuid4(), amfi_code="X1", name="New Fund", amc_name="C", sebi_category="Equity Scheme - Flexi Cap Fund")
    db.add_all([equity, liquid, nodata])
    scenario = Scenario(id=uuid.uuid4(), name="COVID crash", description="d", start_date=date(2020, 1, 20), end_date=date(2020, 3, 31), scenario_type="CRASH")
    db.add(scenario)
    db.commit()
    db.add(ScenarioSchemeResult(scenario_id=scenario.id, scheme_id=equity.id, pct_change=Decimal("-38.00"), is_proxied=False))
    db.add(ScenarioSchemeResult(scenario_id=scenario.id, scheme_id=liquid.id, pct_change=Decimal("1.00"), is_proxied=False))
    db.add(ScenarioSchemeResult(scenario_id=scenario.id, scheme_id=nodata.id, pct_change=None, is_proxied=True, proxy_basis="no_comparable_data"))
    db.commit()
    member = _household_member(db)

    with patch("app.services.analytics.scenario_engine.compute_holdings",
               new=_holdings((equity, member, "800000.00"), (liquid, member, "200000.00"), (nodata, member, "50000.00"))):
        heavy = get_scenario_result_for_household(db, scenario, [member.id])
    with patch("app.services.analytics.scenario_engine.compute_holdings",
               new=_holdings((equity, member, "100000.00"), (liquid, member, "900000.00"))):
        light = get_scenario_result_for_household(db, scenario, [member.id])

    assert heavy.portfolio_impact_pct == "-30.20"   # (-3,04,000 + 2,000) / 10,00,000; no-data fund left out
    assert (heavy.covered_value, heavy.total_value, heavy.no_data_funds) == ("1000000.00", "1050000.00", 1)
    assert light.portfolio_impact_pct == "-2.90"


def test_hypothetical_with_assumptions_not_set_returns_flag_and_no_numbers():
    db = _session()
    scenario = Scenario(id=uuid.uuid4(), name="Unseeded hypothetical", description="d", scenario_type="HYPOTHETICAL")
    db.add(scenario)
    db.commit()
    member = _household_member(db)

    # This branch must return before awaiting any holdings or NAV work.
    coroutine = _async_get_scenario_result_for_household(db, scenario, [member.id])
    with pytest.raises(StopIteration) as returned:
        coroutine.send(None)
    result = returned.value.value
    assert result.assumptions_not_set is True
    assert result.portfolio_impact_pct is None
    assert result.hypothetical_assumptions == []
    # The binding Global Constraints prohibit invented zero-valued results.
    assert result.rupee_impact is None
    assert result.covered_value is None
    assert result.total_value is None
    assert result.no_data_funds is None


def test_hypothetical_with_assumptions_computes_pure_arithmetic_no_nav_lookup():
    db = _session()
    scheme = Scheme(id=uuid.uuid4(), amfi_code="H1", name="Equity Fund", amc_name="AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    db.add(scheme)
    db.commit()
    scenario = Scenario(id=uuid.uuid4(), name="AI/tech valuation bust", description="d", scenario_type="HYPOTHETICAL")
    db.add(scenario)
    db.commit()
    db.add(ScenarioHypotheticalAssumption(scenario_id=scenario.id, asset_class="Equity", assumed_pct_change=Decimal("-22.00"), assumption_note="note"))
    db.commit()

    member = _household_member(db)
    with patch(
        "app.services.analytics.scenario_engine.compute_holdings",
        new=AsyncMock(return_value=[_holding_row(member.id, scheme.id, "Equity Fund", "100000")]),
    ):
        result = asyncio.run(_async_get_scenario_result_for_household(db, scenario, [member.id]))

    assert result.assumptions_not_set is False
    assert result.rupee_impact == "-22000.00"


def test_member_with_no_holdings_in_scenario_universe_still_appears_in_by_member():
    db = _session()
    scenario = Scenario(id=uuid.uuid4(), name="Test Crash", description="d", start_date=date(2020, 1, 1), end_date=date(2020, 3, 31), scenario_type="CRASH")
    db.add(scenario)
    db.commit()
    member = _household_member(db, name="No Holdings Member")

    with patch("app.services.analytics.scenario_engine.compute_holdings", new=AsyncMock(return_value=[])):
        result = asyncio.run(_async_get_scenario_result_for_household(db, scenario, [member.id]))

    member_row = next((m for m in result.by_member if m.household_member_id == str(member.id)), None)
    assert member_row is not None
    assert member_row.rupee_impact == "0.00"

# append to backend/tests/services/analytics/test_scenario_engine.py
from app.models.enums import BenchmarkIndex, BenchmarkReturnType
from app.models.reference import BenchmarkIndexHistory


def test_benchmark_comparison_filters_tri_at_both_ends():
    from app.services.analytics.scenario_engine import _scenario_benchmark_comparisons
    db = _session()
    scenario = Scenario(name="Crash", description="d", start_date=date(2020, 1, 1), end_date=date(2020, 3, 31))
    db.add_all([
        BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date(2019, 12, 31), return_type=BenchmarkReturnType.TRI, value=Decimal("100")),
        BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date(2020, 3, 31), return_type=BenchmarkReturnType.TRI, value=Decimal("80")),
        BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date(2019, 12, 31), return_type=BenchmarkReturnType.PRICE, value=Decimal("1000")),
        BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date(2020, 3, 31), return_type=BenchmarkReturnType.PRICE, value=Decimal("500")),
        BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_500, date=date(2019, 12, 31), return_type=BenchmarkReturnType.PRICE, value=Decimal("100")),
        BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_500, date=date(2020, 3, 31), return_type=BenchmarkReturnType.PRICE, value=Decimal("50")),
    ])
    db.commit()
    assert [(b.name, b.pct) for b in _scenario_benchmark_comparisons(db, scenario)] == [("nifty_50", "-20.00")]


def test_standard_result_includes_benchmarks_with_real_coverage_only():
    db = _session()
    scenario = Scenario(id=uuid.uuid4(), name="Dot-com bust", description="d", start_date=date(2000, 3, 1), end_date=date(2002, 10, 31), scenario_type="CRASH")
    db.add(scenario)
    db.commit()
    db.add(BenchmarkIndexHistory(return_type=BenchmarkReturnType.TRI, index_name=BenchmarkIndex.NIFTY_50, date=date(2000, 2, 29), value=Decimal("1500")))
    db.add(BenchmarkIndexHistory(return_type=BenchmarkReturnType.TRI, index_name=BenchmarkIndex.NIFTY_50, date=date(2002, 10, 31), value=Decimal("1050")))
    # Nifty Midcap 150 didn't exist yet in 2000 -- no rows -- must be excluded, not shown as 0%.
    db.commit()

    member = _household_member(db)
    with patch("app.services.analytics.scenario_engine.compute_holdings", new=AsyncMock(return_value=[])):
        result = asyncio.run(_async_get_scenario_result_for_household(db, scenario, [member.id]))

    bench_names = [b.name for b in result.benchmarks]
    assert "nifty_50" in bench_names
    assert "nifty_midcap_150" not in bench_names


def _finish_immediate(coroutine):
    """Drive an async unit with immediate holdings stubs; fail if it starts I/O.

    The public sync wrapper and HTTP paths are separately exercised by the plan
    tests, which require an event loop (WSL on the Windows sandbox).
    """
    try:
        with pytest.raises(StopIteration) as returned:
            coroutine.send(None)
        return returned.value.value
    finally:
        coroutine.close()


def test_serving_loads_only_results_for_held_schemes():
    from sqlalchemy import event
    db = _session()
    held = Scheme(name="Held", amc_name="AMC", sebi_category="Equity")
    unheld = Scheme(name="Unheld", amc_name="AMC", sebi_category="Equity")
    scenario = Scenario(name="Crash", description="d", start_date=date(2020, 1, 1), end_date=date(2020, 3, 31))
    db.add_all([held, unheld, scenario])
    db.commit()
    db.add_all([
        ScenarioSchemeResult(scenario_id=scenario.id, scheme_id=held.id, pct_change=Decimal("-20")),
        ScenarioSchemeResult(scenario_id=scenario.id, scheme_id=unheld.id, pct_change=Decimal("-50")),
    ])
    db.commit()
    member = _household_member(db)
    loaded = []

    def record_load(row, context):
        loaded.append(row.scheme_id)

    event.listen(ScenarioSchemeResult, "load", record_load)
    try:
        with patch("app.services.analytics.scenario_engine.compute_holdings", new=_holdings((held, member, "1000"))):
            result = _finish_immediate(_async_get_scenario_result_for_household(db, scenario, [member.id]))
    finally:
        event.remove(ScenarioSchemeResult, "load", record_load)
    assert result.portfolio_impact_pct == "-20.00"
    assert loaded == [held.id]


def test_franklin_named_unrelated_amc_is_not_frozen():
    from app.services.analytics.scenario_engine import _is_frozen
    scheme = Scheme(name="Franklin India Low Duration Fund", amc_name="Franklin Other AMC", sebi_category="Debt")
    assert not _is_frozen(scheme, {"franklin india low duration fund"})


def test_result_scheme_lookup_index_exists_in_orm_metadata():
    assert any([c.name for c in index.columns] == ["scheme_id"] for index in ScenarioSchemeResult.__table__.indexes)


def test_wrapper_proxies_use_real_underlying_asset_only_and_rerun_replaces_rows():
    from app.models.reference import NavHistory
    db = _session()
    category = "Other Scheme - Other  ETFs"
    equity = Scheme(name="Nifty ETF - Regular Plan - Growth", amc_name="AMC", sebi_category=category)
    gold = Scheme(name="Gold ETF - Regular Plan - Growth", amc_name="AMC", sebi_category=category)
    missing_gold = Scheme(name="New Gold ETF", amc_name="AMC", sebi_category=category)
    missing_silver = Scheme(name="Silver ETF", amc_name="AMC", sebi_category=category)
    inactive = Scheme(name="Old Gold ETF", amc_name="AMC", sebi_category=category, is_active=False)
    scenario = Scenario(name="Crash", description="d", start_date=date(2020, 1, 1), end_date=date(2020, 3, 31))
    db.add_all([equity, gold, missing_gold, missing_silver, inactive, scenario])
    db.commit()
    for scheme, end_nav in ((equity, "60"), (gold, "108"), (inactive, "200")):
        db.add_all([
            NavHistory(scheme_id=scheme.id, date=scenario.start_date - timedelta(days=1), nav=Decimal("100")),
            NavHistory(scheme_id=scheme.id, date=scenario.end_date, nav=Decimal(end_nav)),
        ])
    db.commit()
    compute_scenario_results(db, scenario)
    compute_scenario_results(db, scenario)
    rows = {r.scheme_id: r for r in db.query(ScenarioSchemeResult).filter_by(scenario_id=scenario.id)}
    assert len(rows) == 4
    assert rows[missing_gold.id].pct_change == Decimal("8.00")
    assert rows[missing_gold.id].proxy_basis == "asset_class_average:Gold"
    assert rows[missing_silver.id].pct_change is None
    assert rows[missing_silver.id].proxy_basis == "no_comparable_data"
    averages = db.query(ScenarioCategoryAverage).filter_by(scenario_id=scenario.id).all()
    assert {(r.sebi_category, r.scheme_count) for r in averages} == {("Other Scheme - Other ETFs|Gold", 1), ("Other Scheme - Other ETFs|Index/ETF", 1)}


def test_quick_stats_separate_real_equity_debt_and_tri_with_aum_weights():
    from app.models.reference import NavHistory, SchemeAaum
    db = _session()
    scenario = Scenario(name="Crash", description="d", start_date=date(2020, 1, 1), end_date=date(2020, 3, 31))
    db.add(scenario)
    db.commit()
    for category, end_nav in (("Equity Scheme - Flexi Cap Fund", "80"), ("Debt Scheme - Liquid Fund", "101")):
        for n in range(5):
            scheme = Scheme(name=f"{category} {n}", amc_name="AMC", sebi_category=category)
            db.add(scheme)
            db.flush()
            db.add_all([
                NavHistory(scheme_id=scheme.id, date=scenario.start_date - timedelta(days=1), nav=Decimal("100")),
                NavHistory(scheme_id=scheme.id, date=scenario.end_date, nav=Decimal(end_nav if n else ("60" if end_nav == "80" else "102"))),
                SchemeAaum(scheme_id=scheme.id, reference_period=date(2019, 12, 31), aaum_value=Decimal("4" if n == 0 else "1")),
                SchemeAaum(scheme_id=scheme.id, reference_period=date(2020, 3, 31), aaum_value=Decimal("100")),
            ])
    # A sixth fund with no NAVs must not enter either the weighting or real fund count.
    missing = Scheme(name="New Equity", amc_name="AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    db.add(missing)
    db.flush()
    db.add(SchemeAaum(scheme_id=missing.id, reference_period=date(2019, 12, 31), aaum_value=Decimal("1000")))
    for return_type, end_level in ((BenchmarkReturnType.TRI, "62"), (BenchmarkReturnType.PRICE, "50")):
        db.add_all([
            BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=scenario.start_date - timedelta(days=1), return_type=return_type, value=Decimal("100")),
            BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=scenario.end_date, return_type=return_type, value=Decimal(end_level)),
        ])
    db.commit()
    compute_scenario_results(db, scenario)
    assert scenario.quick_market_pct == Decimal("-38.00")
    assert scenario.quick_equity_pct == Decimal("-30.00")
    assert scenario.quick_debt_pct == Decimal("1.50")
    assert scenario.quick_weight_quarter == date(2019, 12, 31)


def test_quick_stats_hide_small_samples_and_use_earliest_available_aum_quarter():
    from app.models.reference import NavHistory, SchemeAaum
    db = _session()
    scenario = Scenario(name="Crash", description="d", start_date=date(2000, 1, 1), end_date=date(2000, 3, 31))
    scheme = Scheme(name="Equity", amc_name="AMC", sebi_category="Equity")
    db.add_all([scenario, scheme])
    db.commit()
    db.add_all([
        NavHistory(scheme_id=scheme.id, date=scenario.start_date - timedelta(days=1), nav=Decimal("100")),
        NavHistory(scheme_id=scheme.id, date=scenario.end_date, nav=Decimal("80")),
        SchemeAaum(scheme_id=scheme.id, reference_period=date(2025, 6, 30), aaum_value=Decimal("1")),
    ])
    db.commit()
    compute_scenario_results(db, scenario)
    assert scenario.quick_equity_pct is None
    assert scenario.quick_debt_pct is None
    assert scenario.quick_market_pct is None
    assert scenario.quick_weight_quarter == date(2025, 6, 30)


@pytest.mark.parametrize("same_category,expected,basis", [(True, "-20.00", "sebi_category_average:"), (False, "-10.00", "asset_class_average:Equity")])
def test_ruling5_new_held_scheme_uses_stored_real_category_averages(same_category, expected, basis):
    from app.services.analytics.scenario_engine import _async_get_scenario_result_for_household
    db = _session()
    member = _household_member(db)
    scenario = Scenario(name="Crash", description="d", start_date=date(2020, 1, 1), end_date=date(2020, 3, 31))
    scheme = Scheme(name="New Fund - Direct Plan - Growth", amc_name="AMC", sebi_category="Equity Schemes - Flexi Cap Fund")
    db.add_all([scenario, scheme]); db.commit()
    db.add(ScenarioCategoryAverage(scenario_id=scenario.id, sebi_category="Equity Scheme - Flexi Cap Fund|Equity", avg_pct_change=Decimal("-20"), scheme_count=3))
    db.add(ScenarioCategoryAverage(scenario_id=scenario.id, sebi_category="Equity Scheme - Large Cap Fund|Equity", avg_pct_change=Decimal("0"), scheme_count=3))
    if not same_category:
        scheme.sebi_category = "Equity Scheme - Small Cap Fund"
    db.commit()
    with patch("app.services.analytics.scenario_engine.compute_holdings", new=_holdings((scheme, member, "1000"))):
        result = _finish_immediate(_async_get_scenario_result_for_household(db, scenario, [member.id]))
    assert result.by_fund[0].pct == expected
    assert result.by_fund[0].is_proxied is True
    assert result.by_fund[0].proxy_basis.startswith(basis)
    assert result.rupee_impact == ("-200.00" if same_category else "-100.00")
    assert result.no_data_funds == 0
    assert db.query(ScenarioSchemeResult).count() == 0


@pytest.mark.parametrize("fund_count,expected,basis", [(3, "-20.00", "sebi_category_average:"), (2, "0.00", "asset_class_average:Equity")])
def test_ruling6_averages_canonical_categories_and_one_growth_series_per_fund(fund_count, expected, basis):
    from app.models.enums import SchemePlanType
    db = _session()
    scenario = Scenario(name="Crash", description="d", start_date=date(2020, 1, 1), end_date=date(2020, 3, 31))
    missing = Scheme(name="New Growth", amc_name="AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    db.add_all([scenario, missing]); db.commit()
    donors = []
    for i in range(fund_count):
        category = "Equity Schemes - Flexi Cap Fund" if i % 2 else "Equity Scheme - Flexi Cap Fund"
        for plan, option, end in [(SchemePlanType.REGULAR, "Growth", "80"), (SchemePlanType.DIRECT, "Growth", "150"), (SchemePlanType.REGULAR, "IDCW", "180")]:
            scheme = Scheme(name=f"Fund {i} - {plan.value} Plan - {option}", base_name=f"Fund {i}", plan_type=plan, amc_name="AMC", sebi_category=category)
            db.add(scheme); db.commit()
            _add_navs(db, scheme, [(date(2019, 12, 31), "100"), (date(2020, 3, 31), end)])
            donors.append(scheme)
    other = Scheme(name="Large Cap - Regular Plan - Growth", base_name="Large Cap", plan_type=SchemePlanType.REGULAR, amc_name="AMC", sebi_category="Equity Scheme - Large Cap Fund")
    db.add(other); db.commit()
    _add_navs(db, other, [(date(2019, 12, 31), "100"), (date(2020, 3, 31), "140")])
    compute_scenario_results(db, scenario)
    averages = db.query(ScenarioCategoryAverage).filter_by(scenario_id=scenario.id).all()
    flex = [a for a in averages if "Flexi Cap" in a.sebi_category]
    assert len(flex) == 1
    assert flex[0].sebi_category == "Equity Scheme - Flexi Cap Fund|Equity"
    assert flex[0].scheme_count == fund_count
    assert flex[0].avg_pct_change == Decimal("-20")
    result = db.query(ScenarioSchemeResult).filter_by(scenario_id=scenario.id, scheme_id=missing.id).one()
    assert result.pct_change == Decimal(expected)
    assert result.proxy_basis.startswith(basis)
    assert db.query(ScenarioSchemeResult).filter_by(scenario_id=scenario.id, is_proxied=False).count() == fund_count * 3 + 1


def test_ruling6_idcw_only_fund_never_supplies_a_proxy_average():
    db = _session()
    scenario = Scenario(name="Crash", description="d", start_date=date(2020, 1, 1), end_date=date(2020, 3, 31))
    idcw = Scheme(name="Income Fund - Regular Plan - IDCW", amc_name="AMC", sebi_category="Equity")
    missing = Scheme(name="New Growth", amc_name="AMC", sebi_category="Equity")
    db.add_all([scenario, idcw, missing]); db.commit()
    _add_navs(db, idcw, [(date(2019, 12, 31), "100"), (date(2020, 3, 31), "80")])
    compute_scenario_results(db, scenario)
    assert db.query(ScenarioCategoryAverage).count() == 0
    assert db.query(ScenarioSchemeResult).filter_by(scheme_id=missing.id).one().pct_change is None
    assert db.query(ScenarioSchemeResult).filter_by(scheme_id=idcw.id).one().pct_change == Decimal("-20")


@pytest.mark.parametrize("end_nav,expected", [("1100", "1000.00"), ("1100.01", None), ("-1000.01", None)])
def test_ruling8_implausible_nav_ratio_is_logged_and_excluded(end_nav, expected, caplog):
    db = _session()
    scenario = Scenario(name="Rally", description="d", start_date=date(2020, 1, 1), end_date=date(2020, 3, 31))
    scheme = Scheme(name="Glitch Growth", amc_name="AMC", sebi_category="Equity")
    db.add_all([scenario, scheme]); db.commit()
    _add_navs(db, scheme, [(date(2019, 12, 31), "100"), (date(2020, 3, 31), end_nav)])
    compute_scenario_results(db, scenario)
    result = db.query(ScenarioSchemeResult).one()
    assert result.pct_change == (Decimal(expected) if expected else None)
    if expected is None:
        assert result.is_proxied is True
        assert db.query(ScenarioCategoryAverage).count() == 0
        assert "implausible" in caplog.text.lower()


@pytest.mark.parametrize("age,is_proxied,count", [(7, False, 4), (8, True, 3)])
def test_ruling9_ongoing_recent_nav_only_supplies_real_averages(age, is_proxied, count, monkeypatch):
    from app.services.analytics import scenario_engine
    class Today(date):
        @classmethod
        def today(cls):
            return cls(2026, 10, 10)
    monkeypatch.setattr(scenario_engine, "date", Today)
    db = _session()
    scenario = Scenario(name="Ongoing", description="d", start_date=date(2026, 2, 28), is_ongoing=True)
    db.add(scenario); db.commit()
    for i in range(3):
        scheme = Scheme(name=f"Fresh {i} Growth", amc_name="AMC", sebi_category="Equity")
        db.add(scheme); db.commit()
        _add_navs(db, scheme, [(date(2026, 2, 27), "100"), (date(2026, 10, 10), "80")])
    stale = Scheme(name="Possibly stale Growth", amc_name="AMC", sebi_category="Equity")
    db.add(stale); db.commit()
    _add_navs(db, stale, [(date(2026, 2, 27), "100"), (date(2026, 10, 10) - timedelta(days=age), "50")])
    db.add_all([
        BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, return_type=BenchmarkReturnType.TRI, date=date(2026, 2, 27), value=Decimal("100")),
        BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, return_type=BenchmarkReturnType.TRI, date=date(2026, 10, 10) - timedelta(days=age), value=Decimal("50")),
    ]); db.commit()
    compute_scenario_results(db, scenario)
    row = db.query(ScenarioSchemeResult).filter_by(scheme_id=stale.id).one()
    assert row.is_proxied is is_proxied
    assert row.pct_change == Decimal("-20" if is_proxied else "-50")
    assert db.query(ScenarioCategoryAverage).one().scheme_count == count
    assert scenario.quick_market_pct == (None if is_proxied else Decimal("-50"))
    assert bool(scenario_engine._scenario_benchmark_comparisons(db, scenario)) is (not is_proxied)


@pytest.mark.parametrize("hypothetical", [False, True])
def test_ruling10_zero_value_no_data_holdings_do_not_count(hypothetical):
    from app.services.analytics.scenario_engine import _async_get_scenario_result_for_household
    db = _session()
    member = _household_member(db)
    scenario = Scenario(name="Stress", description="d", scenario_type="HYPOTHETICAL" if hypothetical else "CRASH", start_date=date(2020, 1, 1), end_date=date(2020, 3, 31))
    schemes = [Scheme(name=f"Uncovered {i}", amc_name="AMC", sebi_category="Unclassified") for i in range(3)]
    db.add_all([scenario, *schemes]); db.commit()
    if hypothetical:
        db.add(ScenarioHypotheticalAssumption(scenario_id=scenario.id, asset_class="Equity", assumed_pct_change=Decimal("-10"), assumption_note="note")); db.commit()
    with patch("app.services.analytics.scenario_engine.compute_holdings", new=_holdings(*[(scheme, member, value) for scheme, value in zip(schemes, ("0.00", "100.00", None))])):
        result = _finish_immediate(_async_get_scenario_result_for_household(db, scenario, [member.id]))
    assert result.no_data_funds == 1
    assert result.total_value == "100.00"



def test_ruling6_legacy_plan_names_still_prefer_regular_and_count_one_fund():
    db = _session()
    scenario = Scenario(name="Crash", description="d", start_date=date(2020, 1, 1), end_date=date(2020, 3, 31))
    schemes = [Scheme(name=name, amc_name="AMC", amfi_code=code, sebi_category="Equity") for name, code in (("Fund - Direct Plan - Growth", "1"), ("Fund - Regular Plan - Growth", "2"), ("Fund - Growth", "3"))]
    db.add_all([scenario, *schemes]); db.commit()
    for scheme, end in zip(schemes, ("150", "80", "80")):
        _add_navs(db, scheme, [(date(2019, 12, 31), "100"), (date(2020, 3, 31), end)])
    compute_scenario_results(db, scenario)
    average = db.query(ScenarioCategoryAverage).one()
    assert average.scheme_count == 1
    assert average.avg_pct_change == Decimal("-20")


def test_ruling8_glitch_gets_a_proxy_from_other_real_growth_funds(caplog):
    db = _session()
    scenario = Scenario(name="Crash", description="d", start_date=date(2020, 1, 1), end_date=date(2020, 3, 31))
    glitch = Scheme(name="Glitch Growth", amc_name="AMC", sebi_category="Equity")
    donor = Scheme(name="Donor Growth", amc_name="AMC", sebi_category="Equity")
    db.add_all([scenario, glitch, donor]); db.commit()
    for scheme, end in ((glitch, "1200"), (donor, "80")):
        _add_navs(db, scheme, [(date(2019, 12, 31), "100"), (date(2020, 3, 31), end)])
    compute_scenario_results(db, scenario)
    result = db.query(ScenarioSchemeResult).filter_by(scheme_id=glitch.id).one()
    assert result.pct_change == Decimal("-20")
    assert result.is_proxied is True
    assert result.proxy_basis == "asset_class_average:Equity"
    assert db.query(ScenarioCategoryAverage).one().scheme_count == 1
    assert "implausible" in caplog.text.lower()


def test_ruling6_single_option_etfs_count_in_averages():
    """Fix-round review: NAVAll names ETFs without a plan/option ("DSP MSCI INDIA ETF"), so requiring
    "Growth" in the name left every ETF out of the averages; IDCW/bonus options stay out."""
    db = _session()
    scenario = Scenario(name="Gold rally", description="d", start_date=date(2020, 1, 1), end_date=date(2020, 3, 31))
    etfs = [Scheme(name=f"AMC{i} Gold ETF", base_name=f"AMC{i} Gold ETF", amc_name=f"AMC{i}", sebi_category="Other Scheme - Gold ETF") for i in range(3)]
    bonus = Scheme(name="AMC0 Gold Savings Fund - Bonus Option", amc_name="AMC0", sebi_category="Other Scheme - Gold ETF")
    db.add_all([scenario, *etfs, bonus]); db.commit()
    for scheme in etfs:
        _add_navs(db, scheme, [(date(2019, 12, 31), "100"), (date(2020, 3, 31), "110")])
    _add_navs(db, bonus, [(date(2019, 12, 31), "100"), (date(2020, 3, 31), "50")])
    compute_scenario_results(db, scenario)
    average = db.query(ScenarioCategoryAverage).one()
    assert (average.scheme_count, average.avg_pct_change) == (3, Decimal("10"))
