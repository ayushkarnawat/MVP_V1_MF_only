import asyncio
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.enums import PlanType, Relationship, TransactionType
from app.models.folio import Folio
from app.models.reference import Scheme
from app.models.snapshot import PortfolioSnapshot
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.dashboard.snapshots import get_snapshots


def _session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def _household_member(db):
    user = User(id=uuid.uuid4(), phone_number=f"+9199999{uuid.uuid4().hex[:5]}", created_at=datetime.now(timezone.utc))
    db.add(user)
    db.flush()
    member = HouseholdMember(id=uuid.uuid4(), user_id=user.id, name="Self", relationship=Relationship.SELF, created_at=datetime.now(timezone.utc))
    db.add(member)
    db.commit()
    return member


def _folio_with_purchase(db, member, on_date, amount, units, nav):
    scheme = Scheme(id=uuid.uuid4(), amfi_code=uuid.uuid4().hex[:6], isin="INF123", name="Test Fund", amc_name="HDFC AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    db.add(scheme)
    db.commit()
    folio = Folio(id=uuid.uuid4(), household_member_id=member.id, scheme_id=scheme.id, folio_number=uuid.uuid4().hex[:6], plan_type=PlanType.DIRECT)
    db.add(folio)
    db.commit()
    db.add(Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=uuid.uuid4(), type=TransactionType.PURCHASE, date=on_date, amount=amount, units=units, nav=nav))
    db.commit()
    return folio, scheme


def test_get_snapshots_backfills_from_first_transaction_month():
    db = _session()
    member = _household_member(db)
    _folio_with_purchase(db, member, date(2024, 1, 15), Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000"))

    with patch(
        "app.services.dashboard.snapshots.get_nav_on_or_before",
        new=AsyncMock(return_value=(Decimal("55.0000"), date(2024, 2, 1))),
    ):
        rows = asyncio.run(get_snapshots(db, [member.id]))

    months = sorted(r.snapshot_month for r in rows)
    assert months[0] == date(2024, 1, 31)
    assert Decimal(rows[0].total_value) == Decimal("5500.00")  # 100 * 55


def test_get_snapshots_caches_into_portfolio_snapshots_table():
    db = _session()
    member = _household_member(db)
    _folio_with_purchase(db, member, date(2024, 1, 15), Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000"))

    with patch(
        "app.services.dashboard.snapshots.get_nav_on_or_before",
        new=AsyncMock(return_value=(Decimal("55.0000"), date(2024, 2, 1))),
    ) as mock_nav:
        asyncio.run(get_snapshots(db, [member.id]))
        first_call_count = mock_nav.call_count
        asyncio.run(get_snapshots(db, [member.id]))
        second_call_count = mock_nav.call_count

    # Second call should hit the cached portfolio_snapshots rows, not
    # re-fetch NAV for months already computed.
    assert second_call_count == first_call_count

    cached = db.query(PortfolioSnapshot).filter_by(household_member_id=member.id).all()
    assert len(cached) > 0


def test_get_snapshots_processes_same_date_purchase_before_redemption():
    """A same-day purchase and redemption must process purchase-first
    regardless of id order — mirror of the holdings.py fix. Ids are fixed
    (redemption < purchase) so an id-only tiebreak would deterministically
    process the redemption first and silently no-op it."""
    db = _session()
    member = _household_member(db)
    scheme = Scheme(id=uuid.uuid4(), amfi_code=uuid.uuid4().hex[:6], isin="INF123", name="Test Fund", amc_name="HDFC AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    db.add(scheme)
    folio = Folio(id=uuid.uuid4(), household_member_id=member.id, scheme_id=scheme.id, folio_number=uuid.uuid4().hex[:6], plan_type=PlanType.DIRECT)
    db.add(folio)
    same_date = date(2024, 3, 1)
    db.add(Transaction(id=uuid.UUID(int=1), folio_id=folio.id, import_id=uuid.uuid4(), type=TransactionType.REDEMPTION, date=same_date, amount=Decimal("3000.00"), units=Decimal("50.000"), nav=Decimal("60.0000")))
    db.add(Transaction(id=uuid.UUID(int=2), folio_id=folio.id, import_id=uuid.uuid4(), type=TransactionType.PURCHASE, date=same_date, amount=Decimal("5000.00"), units=Decimal("100.000"), nav=Decimal("50.0000")))
    db.commit()

    with patch(
        "app.services.dashboard.snapshots.get_nav_on_or_before",
        new=AsyncMock(return_value=(Decimal("55.0000"), date(2024, 3, 31))),
    ):
        rows = asyncio.run(get_snapshots(db, [member.id]))

    # Purchase (100u) before redemption (50u) -> 50u held at month-end,
    # 50 * 55 = 2750. Redemption-first would no-op, leaving 100u -> 5500.
    assert Decimal(rows[0].total_value) == Decimal("2750.00")


def test_get_snapshots_does_not_cache_a_month_when_nav_is_unavailable():
    """A transient NAV outage must not permanently poison the cache with an
    understated total_value — the month should be retryable, not silently
    wrong forever."""
    db = _session()
    member = _household_member(db)
    _folio_with_purchase(db, member, date(2024, 1, 15), Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000"))

    with patch(
        "app.services.dashboard.snapshots.get_nav_on_or_before",
        new=AsyncMock(return_value=None),
    ):
        rows = asyncio.run(get_snapshots(db, [member.id]))

    assert rows == []
    assert db.query(PortfolioSnapshot).filter_by(household_member_id=member.id).count() == 0

    # Retry once NAV becomes available — the month should now compute and cache.
    with patch(
        "app.services.dashboard.snapshots.get_nav_on_or_before",
        new=AsyncMock(return_value=(Decimal("55.0000"), date(2024, 2, 1))),
    ):
        rows = asyncio.run(get_snapshots(db, [member.id]))

    assert len(rows) >= 1
    assert Decimal(rows[0].total_value) == Decimal("5500.00")
    assert db.query(PortfolioSnapshot).filter_by(household_member_id=member.id).count() >= 1


def test_get_snapshots_returns_empty_for_member_with_no_transactions():
    db = _session()
    member = _household_member(db)
    rows = asyncio.run(get_snapshots(db, [member.id]))
    assert rows == []
