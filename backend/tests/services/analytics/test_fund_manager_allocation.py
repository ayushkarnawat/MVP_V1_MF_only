# backend/tests/services/analytics/test_fund_manager_allocation.py
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.reference import Scheme, SchemeFundManager


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def test_scheme_fund_manager_round_trips_two_managers_for_one_scheme():
    db = _session()
    scheme = Scheme(
        id=uuid.uuid4(), amfi_code="TEST01", name="Test Fund", base_name="Test Fund",
        amc_name="Test AMC", sebi_category="Equity Scheme - Flexi Cap Fund",
    )
    db.add(scheme)
    db.commit()

    db.add_all([
        SchemeFundManager(
            id=uuid.uuid4(), scheme_id=scheme.id, manager_name="Jane Doe", role=None,
            sequence_order=0, reference_period=date(2026, 9, 1), match_method="EXACT",
            match_confidence=Decimal("1.000"),
        ),
        SchemeFundManager(
            id=uuid.uuid4(), scheme_id=scheme.id, manager_name="John Roe",
            role="Assistant Fund Manager", sequence_order=1,
            reference_period=date(2026, 9, 1), match_method="EXACT",
            match_confidence=Decimal("1.000"),
        ),
    ])
    db.commit()

    rows = db.query(SchemeFundManager).filter_by(scheme_id=scheme.id).all()
    assert len(rows) == 2
    assert {r.manager_name for r in rows} == {"Jane Doe", "John Roe"}


def test_migration_creates_manager_constraints_and_downgrades_in_memory():
    import importlib.util
    from pathlib import Path
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import inspect

    path = Path(__file__).resolve().parents[3] / "alembic/versions/0035_scheme_fund_managers.py"
    spec = importlib.util.spec_from_file_location("fund_manager_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert (migration.revision, migration.down_revision) == ("0035", "0034")
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        Scheme.__table__.create(connection)
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        inspector = inspect(connection)
        assert {c["name"] for c in inspector.get_columns("scheme_fund_managers")} == {
            "id", "scheme_id", "manager_name", "role", "sequence_order", "managing_since_raw",
            "managing_since", "reference_period", "match_method", "match_confidence",
        }
        assert inspector.get_unique_constraints("scheme_fund_managers")[0]["column_names"] == ["scheme_id", "manager_name", "reference_period"]
        assert inspector.get_foreign_keys("scheme_fund_managers")[0]["referred_table"] == "schemes"
        assert inspector.get_indexes("scheme_fund_managers")[0]["column_names"] == ["scheme_id"]
        migration.downgrade()
        assert "scheme_fund_managers" not in inspect(connection).get_table_names()


# append to backend/tests/services/analytics/test_fund_manager_allocation.py
import asyncio
from unittest.mock import AsyncMock, patch

from app.services.analytics.fund_manager_allocation import compute_fund_manager_allocation
from app.services.dashboard.schemas import HoldingRow


def test_compute_fund_manager_allocation_groups_by_manager_and_sums_value():
    db = _session()
    scheme_a = Scheme(id=uuid.uuid4(), amfi_code="A1", name="Fund A", base_name="Fund A", amc_name="Test AMC", sebi_category="Equity")
    scheme_b = Scheme(id=uuid.uuid4(), amfi_code="B1", name="Fund B", base_name="Fund B", amc_name="Test AMC", sebi_category="Equity")
    db.add_all([scheme_a, scheme_b])
    db.commit()
    period = date.today().replace(day=1)  # this month: within the 3-month window (card 2)
    db.add_all([
        SchemeFundManager(id=uuid.uuid4(), scheme_id=scheme_a.id, manager_name="Jane Doe", role=None, sequence_order=0, reference_period=period, match_method="EXACT", match_confidence=Decimal("1.0")),
        SchemeFundManager(id=uuid.uuid4(), scheme_id=scheme_b.id, manager_name="Jane Doe", role=None, sequence_order=0, reference_period=period, match_method="EXACT", match_confidence=Decimal("1.0")),
        SchemeFundManager(id=uuid.uuid4(), scheme_id=scheme_b.id, manager_name="John Roe", role="Assistant Fund Manager", sequence_order=1, reference_period=period, match_method="EXACT", match_confidence=Decimal("1.0")),
    ])
    db.commit()

    holdings = [
        HoldingRow(today_gain=None, scheme_id=str(scheme_a.id), scheme_name="Fund A", amc_name="Test AMC", asset_class="Equity",
                   household_member_id=str(uuid.uuid4()), household_member_name="Self", plan_type="direct",
                   units_held="100", average_nav="10", current_nav="12", current_nav_date=None,
                   amount_invested="1000", current_value="1200", current_profit_total="200", realized_gain="0", unrealized_gain="200"),
        HoldingRow(today_gain=None, scheme_id=str(scheme_b.id), scheme_name="Fund B", amc_name="Test AMC", asset_class="Equity",
                   household_member_id=str(uuid.uuid4()), household_member_name="Self", plan_type="direct",
                   units_held="100", average_nav="10", current_nav="8", current_nav_date=None,
                   amount_invested="1000", current_value="800", current_profit_total="-200", realized_gain="0", unrealized_gain="-200"),
    ]

    with patch("app.services.analytics.fund_manager_allocation.compute_holdings", new=AsyncMock(return_value=holdings)):
        summary = asyncio.run(compute_fund_manager_allocation(db, [uuid.uuid4()]))

    assert len(summary.manager_groups) == 2
    jane = next(g for g in summary.manager_groups if g.manager_name == "Jane Doe")
    assert Decimal(jane.total_household_value) == Decimal("1600")  # 1200 + half of 800
    assert len(jane.funds) == 2
    john = next(g for g in summary.manager_groups if g.manager_name == "John Roe")
    assert john.role == "Assistant Fund Manager"
    assert Decimal(john.total_household_value) == Decimal("400")
    assert summary.manager_groups[0].manager_name == "Jane Doe"  # sorted desc by value, Jane (2000) before John (800)
    assert summary.unavailable_schemes == []


def test_managers_older_than_three_months_count_as_unavailable():
    """Card 2: an AMC whose imports keep failing must not show months-old managers as fact."""
    from app.services.analytics.fund_manager_allocation import _months_back
    db = _session()
    scheme = Scheme(id=uuid.uuid4(), amfi_code="S1", name="Stale Fund", base_name="Stale Fund", amc_name="Test AMC", sebi_category="Equity")
    db.add(scheme)
    db.commit()
    old_period = _months_back(date.today().replace(day=1), 4)
    db.add(SchemeFundManager(id=uuid.uuid4(), scheme_id=scheme.id, manager_name="Jane Doe", role=None, sequence_order=0,
                             reference_period=old_period, match_method="EXACT", match_confidence=Decimal("1.0")))
    db.commit()
    holdings = [
        HoldingRow(today_gain=None, scheme_id=str(scheme.id), scheme_name="Stale Fund", amc_name="Test AMC", asset_class="Equity",
                   household_member_id=str(uuid.uuid4()), household_member_name="Self", plan_type="direct",
                   units_held="100", average_nav="10", current_nav="10", current_nav_date=None,
                   amount_invested="1000", current_value="1000", current_profit_total="0", realized_gain="0", unrealized_gain="0"),
    ]
    with patch("app.services.analytics.fund_manager_allocation.compute_holdings", new=AsyncMock(return_value=holdings)):
        summary = asyncio.run(compute_fund_manager_allocation(db, [uuid.uuid4()]))
    assert summary.manager_groups == []
    assert [u.scheme_name for u in summary.unavailable_schemes] == ["Stale Fund"]


def test_compute_fund_manager_allocation_buckets_unresolved_scheme_as_unavailable():
    db = _session()
    scheme = Scheme(id=uuid.uuid4(), amfi_code="C1", name="HDFC Fund", base_name="HDFC Fund", amc_name="HDFC Mutual Fund", sebi_category="Equity")
    db.add(scheme)
    db.commit()
    holdings = [
        HoldingRow(today_gain=None, scheme_id=str(scheme.id), scheme_name="HDFC Fund", amc_name="HDFC Mutual Fund", asset_class="Equity",
                   household_member_id=str(uuid.uuid4()), household_member_name="Self", plan_type="direct",
                   units_held="100", average_nav="10", current_nav="10", current_nav_date=None,
                   amount_invested="1000", current_value="1000", current_profit_total="0", realized_gain="0", unrealized_gain="0"),
    ]
    with patch("app.services.analytics.fund_manager_allocation.compute_holdings", new=AsyncMock(return_value=holdings)):
        summary = asyncio.run(compute_fund_manager_allocation(db, [uuid.uuid4()]))
    assert summary.manager_groups == []
    assert len(summary.unavailable_schemes) == 1
    assert summary.unavailable_schemes[0].scheme_name == "HDFC Fund"


def _holding(scheme, value, member_id):
    return HoldingRow(today_gain=None, scheme_id=str(scheme.id), scheme_name=scheme.name, amc_name=scheme.amc_name, asset_class="Equity",
                      household_member_id=str(member_id), household_member_name="Member", plan_type="direct",
                      units_held="100", average_nav="10", current_nav="10", current_nav_date=None,
                      amount_invested=value, current_value=value, current_profit_total="0", realized_gain="0", unrealized_gain="0")


def test_a_fund_held_by_two_members_appears_once_with_their_combined_value():
    """compute_holdings returns one row per member per scheme; the manager card lists each
    fund once, with the household's total in it (A04 Run 1 ruling)."""
    db = _session()
    held = Scheme(id=uuid.uuid4(), amfi_code="J1", name="Joint Fund", base_name="Joint Fund", amc_name="Test AMC", sebi_category="Equity")
    nodata = Scheme(id=uuid.uuid4(), amfi_code="J2", name="No Data Fund", base_name="No Data Fund", amc_name="Test AMC", sebi_category="Equity")
    db.add_all([held, nodata])
    db.commit()
    db.add(SchemeFundManager(id=uuid.uuid4(), scheme_id=held.id, manager_name="Jane Doe", role=None, sequence_order=0,
                             reference_period=date.today().replace(day=1), match_method="EXACT", match_confidence=Decimal("1.0")))
    db.commit()
    a, b = uuid.uuid4(), uuid.uuid4()
    holdings = [_holding(held, "1000", a), _holding(held, "500", b), _holding(nodata, "200", a), _holding(nodata, "300", b)]
    with patch("app.services.analytics.fund_manager_allocation.compute_holdings", new=AsyncMock(return_value=holdings)):
        summary = asyncio.run(compute_fund_manager_allocation(db, [a, b]))
    jane = summary.manager_groups[0]
    assert [(f.scheme_name, f.household_value) for f in jane.funds] == [("Joint Fund", "1500.00")]
    assert jane.total_household_value == "1500.00"
    assert [u.scheme_name for u in summary.unavailable_schemes] == ["No Data Fund"]


def test_a_managers_role_is_per_fund_and_the_card_badge_only_when_all_agree():
    """Review (9 Oct): a manager can lead one fund and be assistant on another; the card
    must not take the badge from whichever fund came first."""
    db = _session()
    lead = Scheme(id=uuid.uuid4(), amfi_code="R1", name="Fund A", base_name="Fund A", amc_name="Test AMC", sebi_category="Equity")
    assist = Scheme(id=uuid.uuid4(), amfi_code="R2", name="Fund B", base_name="Fund B", amc_name="Test AMC", sebi_category="Equity")
    db.add_all([lead, assist])
    db.commit()
    period = date.today().replace(day=1)
    db.add_all([
        SchemeFundManager(id=uuid.uuid4(), scheme_id=assist.id, manager_name="Jane Doe", role="Assistant Fund Manager", sequence_order=0, reference_period=period, match_method="EXACT", match_confidence=Decimal("1.0")),
        SchemeFundManager(id=uuid.uuid4(), scheme_id=lead.id, manager_name="Jane Doe", role=None, sequence_order=0, reference_period=period, match_method="EXACT", match_confidence=Decimal("1.0")),
    ])
    db.commit()
    m = uuid.uuid4()
    holdings = [_holding(assist, "500", m), _holding(lead, "1000", m)]
    with patch("app.services.analytics.fund_manager_allocation.compute_holdings", new=AsyncMock(return_value=holdings)):
        summary = asyncio.run(compute_fund_manager_allocation(db, [m]))
    jane = summary.manager_groups[0]
    assert jane.role is None
    assert sorted((f.scheme_name, f.role) for f in jane.funds) == [("Fund A", None), ("Fund B", "Assistant Fund Manager")]


def test_three_month_window_keeps_this_month_and_the_two_before():
    """'Older than 3 months' is unavailable: in October, August is kept and July isn't."""
    from app.services.analytics.fund_manager_allocation import _oldest_period_shown
    assert _oldest_period_shown(date(2026, 10, 12)) == date(2026, 8, 1)


def _allocation_fixture(specs):
    """(fund, AMC, value, ordered manager names), with only in-memory SQLite."""
    db = _session()
    holdings = []
    for index, (name, amc, value, managers) in enumerate(specs):
        scheme = Scheme(id=uuid.uuid4(), amfi_code=f"SPLIT{index}", name=name,
                        base_name=name, amc_name=amc, sebi_category="Equity")
        db.add(scheme)
        db.flush()
        # Deliberately insert backwards: sequence_order must decide the remainder.
        for order, manager in reversed(list(enumerate(managers))):
            db.add(SchemeFundManager(id=uuid.uuid4(), scheme_id=scheme.id,
                manager_name=manager, sequence_order=order, role=None,
                reference_period=date.today().replace(day=1), match_method="EXACT",
                match_confidence=Decimal("1")))
        holdings.append(_holding(scheme, value, uuid.uuid4()))
    db.commit()
    with patch("app.services.analytics.fund_manager_allocation.compute_holdings",
               new=AsyncMock(return_value=holdings)):
        return asyncio.run(compute_fund_manager_allocation(db, []))


def test_split_equally_adds_back_to_the_value_to_the_paisa():
    import pytest
    from app.services.analytics.fund_manager_allocation import _split_equally
    assert _split_equally(Decimal("100.00"), 3) == list(map(Decimal, ["33.34", "33.33", "33.33"]))
    assert _split_equally(Decimal("100.00"), 1) == [Decimal("100.00")]
    assert _split_equally(Decimal("0.01"), 2) == [Decimal("0.01"), Decimal("0.00")]
    with pytest.raises(ValueError):
        _split_equally(Decimal("100"), 0)


def test_two_managers_on_one_fund_each_get_half():
    result = _allocation_fixture([("Alpha", "Alpha AMC", "100000.00", ["Anita", "Vikram"])])
    assert [g.total_household_value for g in result.manager_groups] == ["50000.00", "50000.00"]
    assert all(g.funds[0].household_value == "50000.00" for g in result.manager_groups)


def _three_funds():
    return [("Alpha Flexi Cap", "Alpha AMC", "100000.00", ["Anita", "Vikram"]),
            ("Alpha Value", "Alpha AMC", "100000.00", ["Anita"]),
            ("Beta Large Cap", "Beta AMC", "200000.00", ["Dev"])]


def test_a_manager_on_two_funds_sums_the_shares():
    result = _allocation_fixture(_three_funds())
    assert {g.manager_name: (g.total_household_value, g.percentage) for g in result.manager_groups} == {
        "Anita": ("150000.00", "37.50"), "Vikram": ("50000.00", "12.50"), "Dev": ("200000.00", "50.00")}
    assert result.covered_value == result.portfolio_value == "400000.00"
    assert result.covered_percentage == "100.00"
    for group in result.manager_groups:
        assert sum(Decimal(f.household_value) for f in group.funds) == Decimal(group.total_household_value)


def test_five_managers_on_one_fund_share_it_and_add_back():
    result = _allocation_fixture([("Five", "AMC", "100.03", ["A", "B", "C", "D", "E"])])
    assert [g.total_household_value for g in result.manager_groups] == ["20.03", "20.00", "20.00", "20.00", "20.00"]
    assert sum(Decimal(g.total_household_value) for g in result.manager_groups) == Decimal("100.03")


def test_percentage_uses_the_whole_portfolio_including_funds_without_manager_data():
    result = _allocation_fixture(_three_funds() + [("Unavailable", "AMC", "50000.00", [])])
    assert result.portfolio_value == "450000.00"
    assert next(g for g in result.manager_groups if g.manager_name == "Dev").percentage == "44.44"
    assert result.covered_percentage == "88.89"
    assert [u.scheme_name for u in result.unavailable_schemes] == ["Unavailable"]


def test_a_manager_at_two_amcs_gets_one_row_per_amc():
    result = _allocation_fixture([("A", "AMC1", "10.00", ["Anita"]), ("B", "AMC2", "20.00", ["Anita"])])
    assert [(g.amc_name, g.total_household_value) for g in result.manager_groups] == [("AMC2", "20.00"), ("AMC1", "10.00")]


def test_managers_are_sorted_by_value_then_name():
    result = _allocation_fixture([("A", "AMC", "90.00", ["Zed", "Amy", "Bob"])])
    assert [g.manager_name for g in result.manager_groups] == ["Amy", "Bob", "Zed"]


def test_a_fund_with_no_manager_rows_is_unavailable_not_zero():
    result = _allocation_fixture([("Missing", "AMC", "50.00", [])])
    assert result.manager_groups == []
    assert len(result.unavailable_schemes) == 1
    assert result.portfolio_value == "50.00"
    assert result.covered_value == result.covered_percentage == "0.00"


def test_new_summary_fields_default_for_old_payloads():
    from app.services.analytics.schemas import FundManagerAllocationSummary, ManagerGroup
    group = ManagerGroup(manager_name="Old", role=None, total_household_value="1", funds=[])
    assert (group.amc_name, group.percentage) == ("", "0.00")
    summary = FundManagerAllocationSummary(manager_groups=[group], unavailable_schemes=[])
    assert summary.portfolio_value == summary.covered_value == summary.covered_percentage == "0.00"


def test_zero_portfolio_has_zero_percentages():
    result = _allocation_fixture([("Zero", "AMC", "0.00", ["A"])])
    assert result.manager_groups[0].percentage == result.covered_percentage == "0.00"
    assert _allocation_fixture([]).portfolio_value == "0.00"


def test_sub_paisa_holding_values_reconcile_to_the_paisa():
    # units x NAV carries more than two decimals; every figure shown must still add up.
    result = _allocation_fixture([("A", "AMC", "100.005", ["Anita"]), ("B", "AMC", "100.005", ["Vikram"])])
    assert {g.manager_name: g.total_household_value for g in result.manager_groups} == {"Anita": "100.01", "Vikram": "100.01"}
    assert result.covered_value == result.portfolio_value == "200.02"
    assert sum(Decimal(g.total_household_value) for g in result.manager_groups) == Decimal(result.covered_value)


def test_shared_sub_paisa_funds_have_rows_that_add_up_to_each_manager_total():
    result = _allocation_fixture([
        ("A", "AMC", "100.005", ["Anita", "Vikram", "Dev"]),
        ("B", "AMC", "100.005", ["Anita", "Vikram", "Dev"]),
    ])
    for group in result.manager_groups:
        assert sum(Decimal(f.household_value) for f in group.funds) == Decimal(group.total_household_value)
    assert sum(Decimal(g.total_household_value) for g in result.manager_groups) == Decimal(result.covered_value) == Decimal(result.portfolio_value)
