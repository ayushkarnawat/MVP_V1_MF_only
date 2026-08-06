import asyncio
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.enums import PlanType, Relationship, TransactionType
from app.models.folio import Folio
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.dashboard.allocation import compute_allocation


def _session():
    engine = create_engine("sqlite:///:memory:")
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


def _scheme(db, amc_name, sebi_category):
    scheme = Scheme(id=uuid.uuid4(), amfi_code=uuid.uuid4().hex[:6], isin="INF123", name="Test Fund", amc_name=amc_name, sebi_category=sebi_category)
    db.add(scheme)
    db.commit()
    return scheme


def _folio_with_purchase(db, member, scheme, amount, units, nav):
    folio = Folio(id=uuid.uuid4(), household_member_id=member.id, scheme_id=scheme.id, folio_number=uuid.uuid4().hex[:6], plan_type=PlanType.DIRECT)
    db.add(folio)
    db.commit()
    db.add(Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=uuid.uuid4(), type=TransactionType.PURCHASE, date=date(2024, 1, 1), amount=amount, units=units, nav=nav))
    db.commit()
    return folio


def test_compute_allocation_groups_by_asset_class_and_amc():
    db = _session()
    member = _household_member(db)
    equity_scheme = _scheme(db, amc_name="HDFC AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    debt_scheme = _scheme(db, amc_name="ICICI AMC", sebi_category="Debt Scheme - Liquid Fund")
    _folio_with_purchase(db, member, equity_scheme, Decimal("6000.00"), Decimal("100.000"), Decimal("60.0000"))
    _folio_with_purchase(db, member, debt_scheme, Decimal("4000.00"), Decimal("100.000"), Decimal("40.0000"))

    with patch(
        "app.services.dashboard.holdings.get_nav_on_or_before",
        new=AsyncMock(side_effect=lambda db_, scheme, on_date: (Decimal("60.0000"), date(2024, 6, 1)) if scheme.amc_name == "HDFC AMC" else (Decimal("40.0000"), date(2024, 6, 1))),
    ), patch("app.services.dashboard.holdings.get_previous_nav_from_cache", return_value=None):
        summary = asyncio.run(compute_allocation(db, [member.id]))

    assert Decimal(summary.total_value) == Decimal("10000.00")
    by_class = {b.label: Decimal(b.current_value) for b in summary.by_asset_class}
    assert by_class["Equity"] == Decimal("6000.00")
    assert by_class["Debt"] == Decimal("4000.00")
    equity_bucket = next(b for b in summary.by_asset_class if b.label == "Equity")
    assert Decimal(equity_bucket.percentage) == Decimal("60.00")


def test_compute_allocation_empty_when_no_holdings():
    db = _session()
    member = _household_member(db)
    summary = asyncio.run(compute_allocation(db, [member.id]))
    assert summary.by_asset_class == []
    assert summary.by_amc == []
    assert Decimal(summary.total_value) == Decimal("0")
