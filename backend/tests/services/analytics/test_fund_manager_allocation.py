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
    assert Decimal(jane.total_household_value) == Decimal("2000")  # 1200 (Fund A) + 800 (Fund B)
    assert len(jane.funds) == 2
    john = next(g for g in summary.manager_groups if g.manager_name == "John Roe")
    assert john.role == "Assistant Fund Manager"
    assert Decimal(john.total_household_value) == Decimal("800")
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
    assert [(f.scheme_name, f.household_value) for f in jane.funds] == [("Joint Fund", "1500")]
    assert jane.total_household_value == "1500"
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
